import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../domain/store_models.dart';
import '../domain/store_repository.dart';
import '../domain/store_rules.dart';

/// Vitrine da Loja no Firestore. Os espelhos são de leitura aberta e só os
/// gatilhos gravam; `storeShoppers`/`storeCarts` são só do dono.
class FirestoreStoreRepository implements StoreRepository {
  FirestoreStoreRepository(this._db);

  final FirebaseFirestore _db;

  DocumentReference<Map<String, dynamic>> _shopper(String uid) =>
      _db.collection('storeShoppers').doc(uid);

  DocumentReference<Map<String, dynamic>> _cart(String uid) =>
      _db.collection('storeCarts').doc(uid);

  @override
  Stream<bool> watchEnabled() => _db
      .doc('appConfig/store')
      .snapshots()
      .map((snap) => snap.data()?['enabled'] == true);

  /// `includeMetadataChanges`: o snapshot do cache chega marcado e, quando o
  /// servidor responde, vem outro com `isFromCache == false` — é o que liga e
  /// desliga a faixa "Sem conexão".
  @override
  Stream<StoreCatalog> watchCatalog() => _db
      .collection('storeShowcase')
      .where('channels.app', isEqualTo: true)
      .snapshots(includeMetadataChanges: true)
      .map(
        (snap) => StoreCatalog(
          products: [
            for (final doc in snap.docs)
              ?storeProductFromMap(doc.id, doc.data()),
          ],
          fromCache: snap.metadata.isFromCache,
        ),
      );

  @override
  Stream<StoreShowcaseConfig> watchShowcaseConfig() => _db
      .doc('storePublic/showcase')
      .snapshots()
      .map((snap) => storeShowcaseConfigFromMap(snap.data()));

  @override
  Stream<StoreShopper> watchShopper(String uid) => _shopper(uid)
      .snapshots()
      .map((snap) => storeShopperFromMap(snap.data()));

  @override
  Stream<List<StoreCartItem>> watchCart(String uid) =>
      _cart(uid).snapshots().map((snap) => storeCartItemsFromMap(snap.data()));

  @override
  Future<void> setPickupArena(String uid, String arenaId) => _shopper(uid).set(
        {
          'pickupArenaId': arenaId,
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );

  @override
  Future<void> setRecentSearches(String uid, List<String> searches) =>
      _shopper(uid).set(
        {
          'recentSearches': searches.take(kStoreMaxRecentSearches).toList(),
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );

  /// `arrayUnion`/`arrayRemove`: favoritar em dois aparelhos não se
  /// sobrescreve. A rule limita a lista a 200 (passou disso, a escrita falha).
  @override
  Future<void> setFavorite(String uid, String productId, bool on) =>
      _shopper(uid).set(
        {
          'favoriteIds': on
              ? FieldValue.arrayUnion([productId])
              : FieldValue.arrayRemove([productId]),
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );

  /// Transação: soma na linha existente em vez de sobrescrever um carrinho
  /// alterado em outro aparelho. A lista vai inteira e sem `FieldValue`
  /// dentro (a rule só aceita `items` + `updatedAt`).
  @override
  Future<bool> addToCart(
    String uid, {
    required String productId,
    required String skuId,
    int qty = 1,
    int? maxQty,
  }) {
    final ref = _cart(uid);
    return _db.runTransaction<bool>((tx) async {
      final snap = await tx.get(ref);
      final merged = mergeStoreCartItem(
        storeCartItemsFromMap(snap.data()),
        productId: productId,
        skuId: skuId,
        qty: qty,
        maxQty: maxQty,
      );
      if (merged == null) return false;
      tx.set(ref, {
        'items': [for (final item in merged) item.toMap()],
        'updatedAt': FieldValue.serverTimestamp(),
      });
      return true;
    });
  }
}

final storeRepositoryProvider = Provider<StoreRepository>((ref) {
  return FirestoreStoreRepository(ref.watch(firestoreProvider));
});

// ── Leitura dos docs (espelha `store-showcase-model.ts` do portal) ─────────

String _str(Object? v) => v is String ? v.trim() : '';

String? _strOrNull(Object? v) {
  final s = _str(v);
  return s.isEmpty ? null : s;
}

double? _num(Object? v) => v is num && v.isFinite ? v.toDouble() : null;

int _count(Object? v) {
  final n = _num(v);
  return n != null && n > 0 ? n.floor() : 0;
}

DateTime? _date(Object? v) {
  if (v is Timestamp) return v.toDate();
  if (v is DateTime) return v;
  return null;
}

final RegExp _civilDate = RegExp(r'^\d{4}-\d{2}-\d{2}$');

String? _civilDateOrNull(Object? v) {
  final s = _str(v);
  return _civilDate.hasMatch(s) ? s : null;
}

List<Map<String, dynamic>> _maps(Object? v) => v is List
    ? [
        for (final item in v)
          if (item is Map) Map<String, dynamic>.from(item),
      ]
    : const [];

List<StoreLabel> _labels(Object? v) => [
      for (final m in _maps(v))
        if (_str(m['id']).isNotEmpty && _str(m['label']).isNotEmpty)
          StoreLabel(id: _str(m['id']), label: _str(m['label'])),
    ];

/// Doc → produto. Sem nome ou sem preço é descartado em vez de virar card
/// quebrado.
StoreProduct? storeProductFromMap(String id, Map<String, dynamic>? data) {
  if (data == null) return null;
  final name = _str(data['name']);
  final priceCents = _count(data['priceCents']);
  if (name.isEmpty || priceCents == 0) return null;
  final minPriceCents = _count(data['minPriceCents']) > 0
      ? _count(data['minPriceCents'])
      : priceCents;
  final maxRaw = _count(data['maxPriceCents']) > 0
      ? _count(data['maxPriceCents'])
      : priceCents;
  final maxPriceCents = maxRaw > minPriceCents ? maxRaw : minPriceCents;
  final compareAt = _count(data['compareAtPriceCents']);

  final axes = [
    for (final a in _maps(data['axes']))
      StoreAxis(
        id: _str(a['id']),
        label: _str(a['label']),
        values: [
          for (final v in _maps(a['values']))
            StoreAxisValue(
              id: _str(v['id']),
              label: _str(v['label']),
              hex: _strOrNull(v['hex']),
            ),
        ],
      ),
  ];
  final variants = [
    for (final v in _maps(data['variants']))
      StoreVariant(
        id: _str(v['id']),
        values: {
          if (v['values'] is Map)
            for (final e in (v['values'] as Map).entries)
              if (e.value is String) '${e.key}': e.value as String,
        },
        priceCents: _count(v['priceCents']) > 0
            ? _count(v['priceCents'])
            : priceCents,
        inStock: v['inStock'] == true,
        maxQty: _variantMaxQty(v),
        lowStock: v['inStock'] == true && v['lowStock'] == true,
      ),
  ];
  final customization = data['customization'] is Map
      ? Map<String, dynamic>.from(data['customization'] as Map)
      : null;

  return StoreProduct(
    id: id,
    name: name,
    slug: _str(data['slug']),
    category: _str(data['category']),
    collection: _strOrNull(data['collection']),
    brand: _strOrNull(data['brand']) ?? 'NexaGO',
    badge: StoreBadge.from(data['badge']),
    badgeExpiresAt: _date(data['badgeExpiresAt']),
    priceCents: priceCents,
    compareAtPriceCents: compareAt > priceCents ? compareAt : null,
    minPriceCents: minPriceCents,
    maxPriceCents: maxPriceCents,
    coverUrl: _strOrNull(data['coverUrl']),
    photos: [
      for (final ph in _maps(data['photos']))
        if (_str(ph['url']).isNotEmpty)
          StorePhoto(
            url: _str(ph['url']),
            colorValueId: _strOrNull(ph['colorValueId']),
            view: StorePhotoView.from(ph['view']),
          ),
    ],
    description: _str(data['description']),
    details: [
      for (final d in _maps(data['details']))
        if (_str(d['label']).isNotEmpty && _str(d['value']).isNotEmpty)
          StoreDetail(label: _str(d['label']), value: _str(d['value'])),
    ],
    pickup: data['pickup'] == true,
    delivery: data['delivery'] == true,
    axes: axes,
    variants: variants,
    soldOut: data['soldOut'] == true,
    customizable: data['customizable'] == true,
    customization: data['customizable'] == true && customization != null
        ? storeCustomizationFromMap(customization)
        : null,
    ratingAvg: _num(data['ratingAvg']),
    ratingCount: _count(data['ratingCount']),
    soldLast30: _count(data['soldLast30']),
    publishedAt: _date(data['publishedAt']),
  );
}

Map<String, dynamic> _map(Object? v) =>
    v is Map ? Map<String, dynamic>.from(v) : const <String, dynamic>{};

final RegExp _hexColor = RegExp(r'^#[0-9a-f]{6}$');

/// `storeShowcase/{id}.customization` (gravado por `publicCustomization`).
/// Doc anterior às opções = nome, imagem e costas desligados. Fonte que o app
/// não sabe desenhar fica de fora; sem fonte, sem cor ou sem área, a opção
/// some. Costas só ligadas com uma opção válida (a imagem das costas precisa
/// de formato no bloco `image`).
StoreCustomization storeCustomizationFromMap(Map<String, dynamic> data) {
  final name = _map(data['name']);
  final fonts = <StoreCustomFont>[
    if (name['fonts'] is List)
      for (final f in name['fonts'] as List) ?StoreCustomFont.from(f),
  ];
  final colors = <String>[
    if (name['colors'] is List)
      for (final c in name['colors'] as List)
        if (c is String && _hexColor.hasMatch(c.trim().toLowerCase()))
          c.trim().toLowerCase(),
  ];
  final maxChars = _count(name['maxChars']);

  final image = _map(data['image']);
  final formats = <String>[
    if (image['formats'] is List)
      for (final f in image['formats'] as List)
        if (f is String && _str(f).isNotEmpty) _str(f).toLowerCase(),
  ];
  final areas = [
    for (final a in _maps(image['areas']))
      if (_str(a['id']).isNotEmpty &&
          (_num(a['widthCm']) ?? 0) > 0 &&
          (_num(a['heightCm']) ?? 0) > 0)
        StoreCustomArea(
          id: _str(a['id']),
          name: _strOrNull(a['name']) ?? _str(a['id']),
          widthCm: _num(a['widthCm'])!,
          heightCm: _num(a['heightCm'])!,
        ),
  ];
  final maxSizeMb = _count(image['maxSizeMb']);

  final back = _map(data['back']);
  final backNumber = back['allowNumber'] == true;
  final backImage = back['allowImage'] == true && formats.isNotEmpty;
  final backOn = back['enabled'] == true && (backNumber || backImage);
  final backDigits = _count(back['numberMaxDigits']);
  final backWidth = _num(back['widthCm']) ?? 0;
  final backHeight = _num(back['heightCm']) ?? 0;

  final price = _map(data['price']);
  return StoreCustomization(
    fromCents: _count(data['fromCents']),
    leadDays: _count(data['leadDays']),
    defectOnlyReturns: data['defectOnlyReturns'] == true,
    version: _count(data['version']),
    name: StoreCustomNameOptions(
      enabled: name['enabled'] == true && fonts.isNotEmpty && colors.isNotEmpty,
      maxChars: maxChars > 0 ? maxChars : 12,
      placement: StoreNamePlacement.from(name['placement']),
      fonts: fonts,
      colors: colors,
    ),
    image: StoreCustomImageOptions(
      enabled:
          image['enabled'] == true && formats.isNotEmpty && areas.isNotEmpty,
      formats: formats,
      maxSizeMb: maxSizeMb > 0 ? maxSizeMb : 10,
      minWidthPx: _count(image['minWidthPx']),
      minHeightPx: _count(image['minHeightPx']),
      areas: areas,
    ),
    back: StoreCustomBackOptions(
      enabled: backOn,
      allowNumber: backOn && backNumber,
      allowImage: backOn && backImage,
      numberMaxDigits: backDigits < 1 ? 2 : (backDigits > 3 ? 3 : backDigits),
      widthCm: backWidth > 0 ? backWidth : 25,
      heightCm: backHeight > 0 ? backHeight : 25,
    ),
    price: StoreCustomPrice(
      nameOnlyCents: _count(price['nameOnlyCents']),
      imageOnlyCents: _count(price['imageOnlyCents']),
      bothCents: _count(price['bothCents']),
      backCents: _count(price['backCents']),
    ),
  );
}

/// Quanto cabe numa compra. Doc anterior ao `maxQty`: com saldo vale o teto,
/// sem saldo 0 (mesma leitura do portal).
int _variantMaxQty(Map<String, dynamic> v) {
  if (v['inStock'] != true) return 0;
  final raw = _num(v['maxQty']);
  final qty = raw == null ? kStoreMaxQtyPerItem : _count(raw);
  return qty < kStoreMaxQtyPerItem ? qty : kStoreMaxQtyPerItem;
}

/// `storePublic/showcase.delivery`; ausente = sem frete grátis e sem
/// modalidade. Preço ausente/0 = calculado no checkout.
StoreDelivery _deliveryFromMap(Object? raw) {
  if (raw is! Map) return StoreDelivery.none;
  final data = Map<String, dynamic>.from(raw);
  final free = _count(data['freeAboveCents']);
  return StoreDelivery(
    freeAboveCents: free > 0 ? free : null,
    modes: [
      for (final m in _maps(data['modes']))
        if (_str(m['id']).isNotEmpty && _str(m['name']).isNotEmpty)
          StoreDeliveryMode(
            id: _str(m['id']),
            name: _str(m['name']),
            description: _str(m['description']),
            priceCents:
                _count(m['priceCents']) > 0 ? _count(m['priceCents']) : null,
          ),
    ],
  );
}

StoreBanner? _bannerFromMap(Map<String, dynamic> raw) {
  final id = _str(raw['id']);
  final title = _str(raw['title']);
  final primary = raw['primary'] is Map
      ? Map<String, dynamic>.from(raw['primary'] as Map)
      : const <String, dynamic>{};
  final collectionId = _str(primary['collectionId']);
  if (id.isEmpty || title.isEmpty || collectionId.isEmpty) return null;
  return StoreBanner(
    id: id,
    kicker: _str(raw['kicker']),
    title: title,
    subtitle: _str(raw['subtitle']),
    imageUrl: _strOrNull(raw['imageUrl']),
    primaryLabel: _strOrNull(primary['label']) ?? 'Ver coleção',
    collectionId: collectionId,
    startDate: _civilDateOrNull(raw['startDate']),
    endDate: _civilDateOrNull(raw['endDate']),
  );
}

/// Doc ausente = [StoreShowcaseConfig.empty] (categorias padrão, sem Pix,
/// banners nem arenas).
StoreShowcaseConfig storeShowcaseConfigFromMap(Map<String, dynamic>? data) {
  if (data == null) return StoreShowcaseConfig.empty;
  final benefits = data['benefits'] is Map
      ? Map<String, dynamic>.from(data['benefits'] as Map)
      : const <String, dynamic>{};
  final pix = _num(benefits['pixDiscountPct']);
  final ready = _count(benefits['pickupReadyHours']);
  final exchange = _count(benefits['exchangeDays']);
  final categories = _labels(data['categories']);
  final collections = _labels(data['collections']);
  return StoreShowcaseConfig(
    banners: [
      for (final b in _maps(data['banners'])) ?_bannerFromMap(b),
    ],
    benefits: StoreBenefits(
      pixDiscountPct: pix != null && pix > 0 ? pix : null,
      pickupReadyHours: ready > 0 ? ready : null,
      exchangeDays: exchange > 0 ? exchange : 30,
    ),
    categories: categories.isNotEmpty ? categories : kStoreFallbackCategories,
    collections:
        collections.isNotEmpty ? collections : kStoreFallbackCollections,
    pickupArenas: [
      for (final a in _maps(data['pickupArenas']))
        if (_str(a['arenaId']).isNotEmpty)
          StorePickupArena(
            arenaId: _str(a['arenaId']),
            name: _strOrNull(a['name']) ?? _str(a['arenaId']),
            address: _str(a['address']),
            city: _str(a['city']),
            state: _str(a['state']),
            latitude: _num(a['latitude']),
            longitude: _num(a['longitude']),
            readyHours: _count(a['readyHours']) > 0
                ? _count(a['readyHours'])
                : 48,
          ),
    ],
    delivery: _deliveryFromMap(data['delivery']),
  );
}

StoreShopper storeShopperFromMap(Map<String, dynamic>? data) {
  if (data == null) return StoreShopper.empty;
  List<String> strings(Object? v) => v is List
      ? [
          for (final s in v)
            if (s is String && s.trim().isNotEmpty) s.trim(),
        ]
      : const [];
  return StoreShopper(
    favoriteIds: strings(data['favoriteIds']),
    pickupArenaId: _strOrNull(data['pickupArenaId']),
    recentSearches:
        strings(data['recentSearches']).take(kStoreMaxRecentSearches).toList(),
  );
}

/// Linhas sem produto, sem SKU ou com quantidade ≤ 0 são descartadas. A
/// linha personalizada leva `lineId` e o mapa `customization` intactos —
/// reescrever `items` devolve os dois como vieram.
List<StoreCartItem> storeCartItemsFromMap(Map<String, dynamic>? data) {
  if (data == null) return const [];
  return [
    for (final i in _maps(data['items']))
      if (_str(i['productId']).isNotEmpty &&
          _str(i['skuId']).isNotEmpty &&
          _count(i['qty']) > 0)
        StoreCartItem(
          productId: _str(i['productId']),
          skuId: _str(i['skuId']),
          qty: _count(i['qty']),
          lineId: _strOrNull(i['lineId']),
          customization: i['customization'] is Map
              ? Map<String, Object?>.from(i['customization'] as Map)
              : null,
        ),
  ];
}
