/// Regras de exibição da vitrine (tela 01) — puras, testáveis sem Firestore.
///
/// A fonte de verdade é `docs/business-rules/loja-vitrine.md`, compartilhada
/// com o portal web (`store-showcase-model.ts`): mudar uma regra aqui é mudar
/// lá também.
library;

import '../../../core/time/nexago_event_timezone.dart';
import 'store_models.dart';

// ── Preço ───────────────────────────────────────────────────────────────

/// Preço do card: o menor entre as variações à venda.
int displayPriceCents(StoreProduct p) => p.minPriceCents;

/// Variações com preços diferentes: o card diz "a partir de".
bool priceVaries(StoreProduct p) => p.minPriceCents != p.maxPriceCents;

/// Preço "de" riscado — só quando o preço não varia (senão "a partir de" e
/// "de" brigam) e quando é maior que o exibido.
int? strikePriceCents(StoreProduct p) {
  final from = p.compareAtPriceCents;
  if (priceVaries(p) || from == null) return null;
  return from > displayPriceCents(p) ? from : null;
}

/// Preço no Pix em centavos, meio centavo sobe. Mesma conta do servidor
/// (`pixPriceCents` em `functions/src/store-showcase.ts`): 28990 → 27541.
int pixPriceCents(int priceCents, num discountPct) =>
    (priceCents * (100 - discountPct) / 100).round();

/// `X` do selo "-X%": `round((1 − preço/de) × 100)`.
int? discountPercent(StoreProduct p) {
  final from = strikePriceCents(p);
  if (from == null) return null;
  return ((1 - displayPriceCents(p) / from) * 100).round();
}

// ── Selo ────────────────────────────────────────────────────────────────

enum StoreBadgeTone { orange, dark }

class StoreCardBadge {
  const StoreCardBadge(this.label, this.tone);

  final String label;
  final StoreBadgeTone tone;
}

/// Esgotado manda; depois o selo do produto (se ainda vale); por último o
/// "-X%". No app, "mais vendida" vira "Top" (o card é estreito).
StoreCardBadge? storeCardBadge(StoreProduct p, DateTime now) {
  if (p.soldOut) return const StoreCardBadge('Esgotado', StoreBadgeTone.dark);
  final expiresAt = p.badgeExpiresAt;
  final badgeValid =
      p.badge != null && (expiresAt == null || now.isBefore(expiresAt));
  if (badgeValid) {
    switch (p.badge!) {
      case StoreBadge.bestSeller:
        return const StoreCardBadge('Top', StoreBadgeTone.orange);
      case StoreBadge.isNew:
        return const StoreCardBadge('Nova', StoreBadgeTone.dark);
      case StoreBadge.limitedEdition:
        return const StoreCardBadge('Edição limitada', StoreBadgeTone.dark);
    }
  }
  final off = discountPercent(p);
  return off != null && off > 0
      ? StoreCardBadge('-$off%', StoreBadgeTone.orange)
      : null;
}

// ── Ordenação ───────────────────────────────────────────────────────────

enum StoreSort {
  bestSellers('Mais vendidos'),
  priceAsc('Menor preço'),
  priceDesc('Maior preço'),
  newest('Novidades'),
  topRated('Melhor avaliados');

  const StoreSort(this.label);

  final String label;
}

int _newestFirst(StoreProduct a, StoreProduct b) {
  final at = a.publishedAt?.millisecondsSinceEpoch ?? 0;
  final bt = b.publishedAt?.millisecondsSinceEpoch ?? 0;
  return bt.compareTo(at);
}

int _byName(StoreProduct a, StoreProduct b) {
  final byName =
      normalizeStoreSearch(a.name).compareTo(normalizeStoreSearch(b.name));
  return byName != 0 ? byName : a.id.compareTo(b.id);
}

/// Empates sempre caem no nome (e no id), para a grade não "pular" entre
/// snapshots iguais.
List<StoreProduct> sortStoreProducts(
  Iterable<StoreProduct> products,
  StoreSort sort,
) {
  final out = products.toList();
  int compare(StoreProduct a, StoreProduct b) {
    switch (sort) {
      case StoreSort.bestSellers:
        final bySold = b.soldLast30.compareTo(a.soldLast30);
        if (bySold != 0) return bySold;
        final byDate = _newestFirst(a, b);
        return byDate != 0 ? byDate : _byName(a, b);
      case StoreSort.priceAsc:
        final byPrice = displayPriceCents(a).compareTo(displayPriceCents(b));
        return byPrice != 0 ? byPrice : _byName(a, b);
      case StoreSort.priceDesc:
        final byPrice = displayPriceCents(b).compareTo(displayPriceCents(a));
        return byPrice != 0 ? byPrice : _byName(a, b);
      case StoreSort.newest:
        final byDate = _newestFirst(a, b);
        return byDate != 0 ? byDate : _byName(a, b);
      case StoreSort.topRated:
        final ar = a.ratingAvg;
        final br = b.ratingAvg;
        if (ar == null && br != null) return 1;
        if (br == null && ar != null) return -1;
        final byRating = (br ?? 0).compareTo(ar ?? 0);
        if (byRating != 0) return byRating;
        final byCount = b.ratingCount.compareTo(a.ratingCount);
        return byCount != 0 ? byCount : _byName(a, b);
    }
  }

  out.sort(compare);
  return out;
}

// ── Busca ───────────────────────────────────────────────────────────────

const Map<String, String> _accents = {
  'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', //
  'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', //
  'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', //
  'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', //
  'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', //
  'ç': 'c', 'ñ': 'n',
};

final RegExp _spaces = RegExp(r'\s+');

/// "Óculos  Polarizado" → "oculos polarizado": sem acento, sem caixa e com
/// um espaço só entre as palavras.
String normalizeStoreSearch(String s) {
  final lower = s.toLowerCase();
  final buffer = StringBuffer();
  for (final rune in lower.runes) {
    final ch = String.fromCharCode(rune);
    buffer.write(_accents[ch] ?? ch);
  }
  return buffer.toString().replaceAll(_spaces, ' ').trim();
}

/// Rótulo de um id numa lista de categorias/coleções; vazio se não achar.
String storeLabelOf(List<StoreLabel> labels, String? id) {
  if (id == null || id.isEmpty) return '';
  for (final l in labels) {
    if (l.id == id) return l.label;
  }
  return '';
}

/// Todo termo tem de aparecer no nome, na categoria ou na coleção.
bool matchesStoreSearch(
  StoreProduct p,
  String query,
  StoreShowcaseConfig config,
) {
  final terms = normalizeStoreSearch(query)
      .split(' ')
      .where((t) => t.isNotEmpty)
      .toList();
  if (terms.isEmpty) return true;
  final haystack = normalizeStoreSearch(
    [
      p.name,
      storeLabelOf(config.categories, p.category),
      storeLabelOf(config.collections, p.collection),
    ].join(' '),
  );
  return terms.every(haystack.contains);
}

/// Mínimo de caracteres para as sugestões aparecerem.
const int kStoreSuggestionMinChars = 2;

class StoreSearchSuggestions {
  const StoreSearchSuggestions({
    this.products = const [],
    this.categories = const [],
  });

  final List<StoreProduct> products;
  final List<StoreLabel> categories;

  bool get isEmpty => products.isEmpty && categories.isEmpty;
}

/// A partir de 2 caracteres: até 5 produtos (mais vendidos primeiro) e até 3
/// categorias (só as que têm produto à venda).
StoreSearchSuggestions storeSearchSuggestions(
  List<StoreProduct> products,
  StoreShowcaseConfig config,
  String query,
) {
  final q = normalizeStoreSearch(query);
  if (q.length < kStoreSuggestionMinChars) {
    return const StoreSearchSuggestions();
  }
  final withProducts = {for (final p in products) p.category};
  return StoreSearchSuggestions(
    products: sortStoreProducts(
      products.where((p) => matchesStoreSearch(p, q, config)),
      StoreSort.bestSellers,
    ).take(5).toList(),
    categories: config.categories
        .where(
          (c) =>
              withProducts.contains(c.id) &&
              normalizeStoreSearch(c.label).contains(q),
        )
        .take(3)
        .toList(),
  );
}

/// Busca recente: o termo vai pro topo, sem repetir (ignorando caixa), até 5.
List<String> withRecentSearch(List<String> current, String term) {
  final t = term.trim();
  if (t.isEmpty) return List.of(current);
  final lower = t.toLowerCase();
  return [t, ...current.where((x) => x.toLowerCase() != lower)]
      .take(kStoreMaxRecentSearches)
      .toList();
}

// ── Chips e banners ─────────────────────────────────────────────────────

/// Chips: categorias da config, na ordem dela, com ao menos um produto.
List<StoreLabel> visibleStoreCategories(
  StoreShowcaseConfig config,
  List<StoreProduct> products,
) {
  final used = {for (final p in products) p.category};
  return config.categories.where((c) => used.contains(c.id)).toList();
}

const int kStoreMaxLiveBanners = 3;

/// Data civil de São Paulo (`YYYY-MM-DD`) — as datas de campanha são de lá.
String storeSaoPauloDateKey(DateTime now) => nexagoEventDayKey(now);

/// Banners no ar hoje (data civil de SP ∈ `[startDate, endDate]`), até 3.
List<StoreBanner> liveStoreBanners(List<StoreBanner> banners, String todayKey) {
  return banners
      .where(
        (b) =>
            (b.startDate == null || b.startDate!.compareTo(todayKey) <= 0) &&
            (b.endDate == null || b.endDate!.compareTo(todayKey) >= 0),
      )
      .take(kStoreMaxLiveBanners)
      .toList();
}

// ── Filtros ─────────────────────────────────────────────────────────────

/// Faixas de preço do "Filtrar" (pelo preço exibido do card).
enum StorePriceBand {
  upTo50('Até R\$ 50', null, 5000),
  from50To150('R\$ 50 a 150', 5000, 15000),
  from150To300('R\$ 150 a 300', 15000, 30000),
  above300('Acima de R\$ 300', 30000, null);

  const StorePriceBand(this.label, this.minExclusiveCents, this.maxCents);

  final String label;
  final int? minExclusiveCents;
  final int? maxCents;

  bool contains(int cents) =>
      (minExclusiveCents == null || cents > minExclusiveCents!) &&
      (maxCents == null || cents <= maxCents!);
}

class StoreFilters {
  const StoreFilters({
    this.sort = StoreSort.bestSellers,
    this.priceBand,
    this.onlyMyArenaPickup = false,
    this.onlyOnSale = false,
  });

  static const StoreFilters none = StoreFilters();

  final StoreSort sort;
  final StorePriceBand? priceBand;

  /// "Só com retirada na minha arena": `pickup` e uma arena definida.
  final bool onlyMyArenaPickup;

  /// "Em promoção": tem preço "de" (`compareAtPriceCents`).
  final bool onlyOnSale;

  /// O "N" de "Filtrar · N": cada escolha da folha que sai do padrão.
  int get activeCount =>
      (sort != StoreSort.bestSellers ? 1 : 0) +
      (priceBand != null ? 1 : 0) +
      (onlyMyArenaPickup ? 1 : 0) +
      (onlyOnSale ? 1 : 0);

  StoreFilters copyWith({
    StoreSort? sort,
    Object? priceBand = _keep,
    bool? onlyMyArenaPickup,
    bool? onlyOnSale,
  }) {
    return StoreFilters(
      sort: sort ?? this.sort,
      priceBand: identical(priceBand, _keep)
          ? this.priceBand
          : priceBand as StorePriceBand?,
      onlyMyArenaPickup: onlyMyArenaPickup ?? this.onlyMyArenaPickup,
      onlyOnSale: onlyOnSale ?? this.onlyOnSale,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is StoreFilters &&
      other.sort == sort &&
      other.priceBand == priceBand &&
      other.onlyMyArenaPickup == onlyMyArenaPickup &&
      other.onlyOnSale == onlyOnSale;

  @override
  int get hashCode => Object.hash(sort, priceBand, onlyMyArenaPickup, onlyOnSale);
}

const Object _keep = Object();

/// Estado da grade: chip, coleção (do banner), termo buscado e filtros.
class StoreBrowse {
  const StoreBrowse({
    this.categoryId,
    this.collectionId,
    this.query = '',
    this.filters = StoreFilters.none,
  });

  static const StoreBrowse initial = StoreBrowse();

  final String? categoryId;
  final String? collectionId;
  final String query;
  final StoreFilters filters;

  bool get hasQuery => query.trim().isNotEmpty;

  /// Algo além do padrão recorta a grade (o "Limpar filtros" volta tudo).
  bool get isNarrowed =>
      categoryId != null ||
      collectionId != null ||
      hasQuery ||
      filters != StoreFilters.none;

  StoreBrowse copyWith({
    Object? categoryId = _keep,
    Object? collectionId = _keep,
    String? query,
    StoreFilters? filters,
  }) {
    return StoreBrowse(
      categoryId: identical(categoryId, _keep)
          ? this.categoryId
          : categoryId as String?,
      collectionId: identical(collectionId, _keep)
          ? this.collectionId
          : collectionId as String?,
      query: query ?? this.query,
      filters: filters ?? this.filters,
    );
  }
}

/// Grade da vitrine: recorta por chip, coleção, busca e filtros; depois ordena.
List<StoreProduct> browseStoreProducts(
  List<StoreProduct> products,
  StoreShowcaseConfig config,
  StoreBrowse browse, {
  required bool hasPickupArena,
}) {
  final f = browse.filters;
  final filtered = products.where((p) {
    if (browse.categoryId != null && p.category != browse.categoryId) {
      return false;
    }
    if (browse.collectionId != null && p.collection != browse.collectionId) {
      return false;
    }
    if (browse.hasQuery && !matchesStoreSearch(p, browse.query, config)) {
      return false;
    }
    if (f.priceBand != null && !f.priceBand!.contains(displayPriceCents(p))) {
      return false;
    }
    if (f.onlyMyArenaPickup && !(p.pickup && hasPickupArena)) return false;
    if (f.onlyOnSale && p.compareAtPriceCents == null) return false;
    return true;
  });
  return sortStoreProducts(filtered, f.sort);
}

/// Título da grade: busca → coleção → rótulo da ordenação.
String storeGridTitle(StoreBrowse browse, StoreShowcaseConfig config) {
  if (browse.hasQuery) return 'Resultados para "${browse.query.trim()}"';
  final collection = storeLabelOf(config.collections, browse.collectionId);
  if (collection.isNotEmpty) return collection;
  return browse.filters.sort.label;
}

// ── Carrinho ────────────────────────────────────────────────────────────

/// O contador da sacola: soma das unidades, não das linhas.
int storeCartUnits(List<StoreCartItem> items) =>
    items.fold(0, (total, i) => total + i.qty);

/// Soma [qty] na linha COMUM do mesmo produto+SKU ou acrescenta uma linha
/// nova. Linha personalizada nunca recebe soma (cada configuração é uma
/// linha) e volta intacta, com `lineId` e `customization`. A linha não passa
/// de `min(maxQty, kStoreMaxQtyPerLine)` (o saldo exposto do SKU, quando vem
/// da página do produto) e nunca diminui: no teto, fica como está. `null` =
/// carrinho cheio (já tem [kStoreMaxCartLines] linhas, personalizadas
/// inclusive).
List<StoreCartItem>? mergeStoreCartItem(
  List<StoreCartItem> items, {
  required String productId,
  required String skuId,
  int qty = 1,
  int? maxQty,
}) {
  final cap = maxQty == null
      ? kStoreMaxQtyPerLine
      : maxQty.clamp(1, kStoreMaxQtyPerLine);
  final index = items.indexWhere(
    (i) => !i.isCustom && i.productId == productId && i.skuId == skuId,
  );
  if (index >= 0) {
    final current = items[index];
    final summed = (current.qty + qty).clamp(1, cap);
    final next = summed > current.qty ? summed : current.qty;
    return [
      for (var i = 0; i < items.length; i++)
        if (i == index)
          StoreCartItem(productId: productId, skuId: skuId, qty: next)
        else
          items[i],
    ];
  }
  if (items.length >= kStoreMaxCartLines) return null;
  return [
    ...items,
    StoreCartItem(
      productId: productId,
      skuId: skuId,
      qty: qty.clamp(1, cap),
    ),
  ];
}

// ── "+" do card ─────────────────────────────────────────────────────────

enum StoreQuickAddKind {
  /// Sem variação: 1 unidade direto no carrinho.
  addDirect,

  /// Com variação: folha com os eixos.
  pickVariant,

  /// Personalizável (ou sem SKU legível): vai pra página do produto.
  openProduct,

  /// Esgotado: o "+" vira sino ("Avise-me").
  notifyMe,
}

class StoreQuickAdd {
  const StoreQuickAdd(this.kind, {this.skuId});

  final StoreQuickAddKind kind;

  /// SKU a adicionar quando [kind] é [StoreQuickAddKind.addDirect].
  final String? skuId;
}

StoreQuickAdd storeQuickAdd(StoreProduct p) {
  if (p.soldOut) return const StoreQuickAdd(StoreQuickAddKind.notifyMe);
  if (p.customizable) return const StoreQuickAdd(StoreQuickAddKind.openProduct);
  final inStock = p.variants.where((v) => v.inStock).toList();
  if (inStock.isEmpty) return const StoreQuickAdd(StoreQuickAddKind.openProduct);
  if (p.axes.isEmpty || p.variants.length == 1) {
    return StoreQuickAdd(StoreQuickAddKind.addDirect, skuId: inStock.first.id);
  }
  return const StoreQuickAdd(StoreQuickAddKind.pickVariant);
}

/// O valor [valueId] do eixo [axisId] ainda forma combinação com saldo,
/// dadas as escolhas dos OUTROS eixos em [selected]?
bool storeVariantValueAvailable(
  StoreProduct p, {
  required String axisId,
  required String valueId,
  required Map<String, String> selected,
}) {
  return p.variants.any((v) {
    if (!v.inStock || v.values[axisId] != valueId) return false;
    for (final entry in selected.entries) {
      if (entry.key == axisId) continue;
      if (v.values[entry.key] != entry.value) return false;
    }
    return true;
  });
}

/// SKU da combinação escolhida — só quando todos os eixos têm valor.
StoreVariant? storeVariantFor(StoreProduct p, Map<String, String> selected) {
  if (p.axes.any((a) => !selected.containsKey(a.id))) return null;
  for (final v in p.variants) {
    if (p.axes.every((a) => v.values[a.id] == selected[a.id])) return v;
  }
  return null;
}

/// Eixos com um único valor possível já começam escolhidos.
Map<String, String> storeInitialVariantSelection(StoreProduct p) {
  final selected = <String, String>{};
  for (final axis in p.axes) {
    final available = axis.values
        .where(
          (value) => storeVariantValueAvailable(
            p,
            axisId: axis.id,
            valueId: value.id,
            selected: const {},
          ),
        )
        .toList();
    if (available.length == 1) selected[axis.id] = available.single.id;
  }
  return selected;
}

/// Página do client-side: a grade mostra 24 e acrescenta 24 perto do fim.
const int kStorePageSize = 24;
