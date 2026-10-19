/// Modelos da vitrine da Loja (tela 01) e da página do produto (tela 02).
///
/// Espelham o contrato de `docs/business-rules/loja-vitrine.md` e
/// `docs/business-rules/loja-produto.md`: o app só lê
/// `storeShowcase/{id}` e `storePublic/showcase` (espelhos públicos gravados
/// pelos gatilhos) e grava `storeShoppers/{uid}` e `storeCarts/{uid}`.
library;

/// Selo do produto vindo do espelho (`badge`).
enum StoreBadge {
  bestSeller('mais-vendida'),
  isNew('nova'),
  limitedEdition('edicao-limitada');

  const StoreBadge(this.id);

  final String id;

  static StoreBadge? from(Object? raw) {
    for (final badge in values) {
      if (badge.id == raw) return badge;
    }
    return null;
  }
}

class StoreAxisValue {
  const StoreAxisValue({required this.id, required this.label, this.hex});

  final String id;
  final String label;

  /// Cor da bolinha no seletor (`#RRGGBB`); só eixos de cor têm.
  final String? hex;
}

class StoreAxis {
  const StoreAxis({required this.id, required this.label, this.values = const []});

  final String id;
  final String label;
  final List<StoreAxisValue> values;
}

class StoreVariant {
  /// [maxQty] ausente (doc anterior ao campo) vale [kStoreMaxQtyPerItem] com
  /// saldo e 0 sem.
  const StoreVariant({
    required this.id,
    this.values = const {},
    required this.priceCents,
    required this.inStock,
    int? maxQty,
    this.lowStock = false,
  }) : maxQty = maxQty ?? (inStock ? kStoreMaxQtyPerItem : 0);

  /// Id do SKU (`branco_m`, `unico`) — é o `skuId` do carrinho.
  final String id;

  /// Eixo → valor (`{cor: branco, tam: m}`); vazio no produto sem variação.
  final Map<String, String> values;
  final int priceCents;

  /// O saldo de verdade não é público: só "tem", e quanto cabe numa compra.
  final bool inStock;

  /// Saldo livre até [kStoreMaxQtyPerItem] — o teto da compra; 0 = esgotado.
  final int maxQty;

  /// Saldo livre no alerta de estoque baixo do produto ("Só 2 no tamanho M").
  final bool lowStock;
}

/// Lado da peça que a foto mostra (`photos[].view`) — a prévia da
/// personalização usa a foto do lado escolhido.
enum StorePhotoView {
  front('frente'),
  back('costas');

  const StorePhotoView(this.id);

  final String id;

  static StorePhotoView? from(Object? raw) {
    for (final view in values) {
      if (view.id == raw) return view;
    }
    return null;
  }
}

/// Foto da galeria, na ordem do backoffice (a primeira é a capa).
class StorePhoto {
  const StorePhoto({required this.url, this.colorValueId, this.view});

  final String url;

  /// Valor do primeiro eixo (cor) a que a foto pertence; `null` = vale para
  /// todas.
  final String? colorValueId;

  /// Frente/costas da peça; `null` = não marcado no backoffice.
  final StorePhotoView? view;

  @override
  bool operator ==(Object other) =>
      other is StorePhoto &&
      other.url == url &&
      other.colorValueId == colorValueId &&
      other.view == view;

  @override
  int get hashCode => Object.hash(url, colorValueId, view);

  @override
  String toString() => 'StorePhoto($url, $colorValueId, ${view?.id})';
}

/// "Tecido · Poliamida dry com elastano" (detalhes técnicos do backoffice).
class StoreDetail {
  const StoreDetail({required this.label, required this.value});

  final String label;
  final String value;
}

/// Fonte do nome — os mesmos três cards do backoffice.
enum StoreCustomFont {
  bloco('bloco', 'Bloco'),
  classica('classica', 'Clássica'),
  mono('mono', 'Mono');

  const StoreCustomFont(this.id, this.label);

  final String id;
  final String label;

  static StoreCustomFont? from(Object? raw) {
    for (final font in values) {
      if (font.id == raw) return font;
    }
    return null;
  }
}

/// Onde o nome vai na peça.
enum StoreNamePlacement {
  backUpper('costas_superior'),
  backLower('costas_inferior'),
  front('frente'),
  sleeve('manga');

  const StoreNamePlacement(this.id);

  final String id;

  /// Desconhecido cai no padrão do backoffice (costas, em cima).
  static StoreNamePlacement from(Object? raw) {
    for (final placement in values) {
      if (placement.id == raw) return placement;
    }
    return backUpper;
  }
}

/// `customization.name` do espelho.
class StoreCustomNameOptions {
  const StoreCustomNameOptions({
    this.enabled = false,
    this.maxChars = 12,
    this.placement = StoreNamePlacement.backUpper,
    this.fonts = const [],
    this.colors = const [],
  });

  static const StoreCustomNameOptions disabled = StoreCustomNameOptions();

  final bool enabled;
  final int maxChars;
  final StoreNamePlacement placement;

  /// Só as ligadas, na ordem do backoffice (a 1ª é o padrão).
  final List<StoreCustomFont> fonts;

  /// `#rrggbb` em minúsculas.
  final List<String> colors;
}

/// Área de impressão da imagem ("Peito esquerdo · 9 × 9 cm").
class StoreCustomArea {
  const StoreCustomArea({
    required this.id,
    required this.name,
    required this.widthCm,
    required this.heightCm,
  });

  final String id;
  final String name;
  final double widthCm;
  final double heightCm;
}

/// `customization.image` do espelho.
class StoreCustomImageOptions {
  const StoreCustomImageOptions({
    this.enabled = false,
    this.formats = const [],
    this.maxSizeMb = 10,
    this.minWidthPx = 0,
    this.minHeightPx = 0,
    this.areas = const [],
  });

  static const StoreCustomImageOptions disabled = StoreCustomImageOptions();

  final bool enabled;

  /// `png`, `jpg`, `svg`.
  final List<String> formats;
  final int maxSizeMb;
  final int minWidthPx;
  final int minHeightPx;

  /// Só as ligadas (a 1ª é o padrão).
  final List<StoreCustomArea> areas;
}

/// `customization.back` do espelho: costas, abaixo do nome — o atleta
/// escolhe número OU imagem entre os liberados. A imagem segue formatos, peso
/// e resolução mínima do bloco `image` (mesmo com a imagem da frente
/// desligada). Espelho antigo (sem `back`) = desligado.
class StoreCustomBackOptions {
  const StoreCustomBackOptions({
    this.enabled = false,
    this.allowNumber = false,
    this.allowImage = false,
    this.numberMaxDigits = 2,
    this.widthCm = 25,
    this.heightCm = 25,
  });

  static const StoreCustomBackOptions disabled = StoreCustomBackOptions();

  /// Só ligado quando sobra uma opção válida (número ou imagem).
  final bool enabled;
  final bool allowNumber;
  final bool allowImage;

  /// 1 a 3.
  final int numberMaxDigits;

  /// Área das costas, em cm (prévia e qualidade da imagem).
  final double widthCm;
  final double heightCm;
}

/// Adicional da personalização: nome e imagem juntos têm preço próprio; as
/// costas somam [backCents] por cima.
class StoreCustomPrice {
  const StoreCustomPrice({
    this.nameOnlyCents = 0,
    this.imageOnlyCents = 0,
    this.bothCents = 0,
    this.backCents = 0,
  });

  final int nameOnlyCents;
  final int imageOnlyCents;
  final int bothCents;
  final int backCents;
}

/// O pedaço público da personalização (só com ela ativa). Doc gravado antes
/// das opções (só `fromCents`/`leadDays`/`defectOnlyReturns`) vem com nome,
/// imagem e costas desligados.
class StoreCustomization {
  const StoreCustomization({
    this.fromCents = 0,
    this.leadDays = 0,
    this.defectOnlyReturns = false,
    this.version = 0,
    this.name = StoreCustomNameOptions.disabled,
    this.image = StoreCustomImageOptions.disabled,
    this.back = StoreCustomBackOptions.disabled,
    this.price = const StoreCustomPrice(),
  });

  /// "+ personalização a partir de R$ X"; 0 = nenhuma opção com preço.
  final int fromCents;

  /// Dias úteis de produção.
  final int leadDays;

  /// Peça personalizada só troca por defeito.
  final bool defectOnlyReturns;

  /// ms do `updatedAt` da config (o carrinho guarda com qual foi feito).
  final int version;
  final StoreCustomNameOptions name;
  final StoreCustomImageOptions image;
  final StoreCustomBackOptions back;
  final StoreCustomPrice price;

  /// Alguma opção que o atleta consegue usar nesta tela.
  bool get hasOptions => name.enabled || image.enabled || back.enabled;
}

class StoreProduct {
  const StoreProduct({
    required this.id,
    required this.name,
    this.slug = '',
    this.category = '',
    this.collection,
    this.brand = 'NexaGO',
    this.badge,
    this.badgeExpiresAt,
    required this.priceCents,
    this.compareAtPriceCents,
    required this.minPriceCents,
    required this.maxPriceCents,
    this.coverUrl,
    this.photos = const [],
    this.description = '',
    this.details = const [],
    this.pickup = false,
    this.delivery = false,
    this.axes = const [],
    this.variants = const [],
    this.soldOut = false,
    this.customizable = false,
    this.customization,
    this.ratingAvg,
    this.ratingCount = 0,
    this.soldLast30 = 0,
    this.publishedAt,
  });

  final String id;
  final String name;
  final String slug;
  final String category;
  final String? collection;
  final String brand;
  final StoreBadge? badge;

  /// Quando o selo "nova" deixa de valer; `null` = não vence.
  final DateTime? badgeExpiresAt;
  final int priceCents;
  final int? compareAtPriceCents;

  /// Menor/maior preço entre as variações à venda.
  final int minPriceCents;
  final int maxPriceCents;
  final String? coverUrl;

  /// Galeria (até 10, a 1ª é a capa); vazia em doc anterior ao campo.
  final List<StorePhoto> photos;
  final String description;
  final List<StoreDetail> details;
  final bool pickup;
  final bool delivery;
  final List<StoreAxis> axes;
  final List<StoreVariant> variants;
  final bool soldOut;
  final bool customizable;

  /// Só com a personalização ativa (`customizable`).
  final StoreCustomization? customization;
  final double? ratingAvg;
  final int ratingCount;

  /// Unidades vendidas nos últimos 30 dias — a ordem "Mais vendidos".
  final int soldLast30;
  final DateTime? publishedAt;
}

/// Catálogo do canal app, com a origem do snapshot.
class StoreCatalog {
  const StoreCatalog({required this.products, this.fromCache = false});

  final List<StoreProduct> products;

  /// `metadata.isFromCache`: ainda sem resposta do servidor (offline ou abrindo).
  final bool fromCache;
}

class StoreBanner {
  const StoreBanner({
    required this.id,
    this.kicker = '',
    required this.title,
    this.subtitle = '',
    this.imageUrl,
    this.primaryLabel = 'Ver coleção',
    required this.collectionId,
    this.startDate,
    this.endDate,
  });

  final String id;
  final String kicker;
  final String title;
  final String subtitle;
  final String? imageUrl;
  final String primaryLabel;

  /// O card abre a vitrine filtrada por esta coleção.
  final String collectionId;

  /// Datas civis de São Paulo (`YYYY-MM-DD`), inclusivas; `null` = sem limite.
  final String? startDate;
  final String? endDate;
}

class StoreBenefits {
  const StoreBenefits({
    this.pixDiscountPct,
    this.pickupReadyHours,
    this.exchangeDays = 30,
  });

  /// `null` = desconto do Pix desligado: some o "no Pix" dos preços.
  final num? pixDiscountPct;
  final int? pickupReadyHours;
  final int exchangeDays;
}

class StoreLabel {
  const StoreLabel({required this.id, required this.label});

  final String id;
  final String label;
}

class StorePickupArena {
  const StorePickupArena({
    required this.arenaId,
    required this.name,
    this.address = '',
    this.city = '',
    this.state = '',
    this.latitude,
    this.longitude,
    this.readyHours = 48,
  });

  final String arenaId;
  final String name;
  final String address;
  final String city;
  final String state;
  final double? latitude;
  final double? longitude;
  final int readyHours;

  bool get hasCoordinates =>
      latitude != null &&
      longitude != null &&
      latitude!.isFinite &&
      longitude!.isFinite;
}

/// Ordem e rótulos de reserva enquanto `storePublic/showcase` não existir
/// (espelha `STORE_CATEGORIES`/`STORE_COLLECTIONS` do servidor e o portal).
const List<StoreLabel> kStoreFallbackCategories = [
  StoreLabel(id: 'bolas', label: 'Bolas'),
  StoreLabel(id: 'vestuario', label: 'Vestuário'),
  StoreLabel(id: 'acessorios', label: 'Acessórios'),
  StoreLabel(id: 'rede-quadra', label: 'Rede & quadra'),
  StoreLabel(id: 'kits', label: 'Kits'),
];

const List<StoreLabel> kStoreFallbackCollections = [
  StoreLabel(id: 'verao-2026', label: 'Verão 2026'),
  StoreLabel(id: 'linha-pro', label: 'Linha Pro'),
];

/// Modalidade de entrega que o checkout aceita hoje.
class StoreDeliveryMode {
  const StoreDeliveryMode({
    required this.id,
    required this.name,
    this.description = '',
    this.priceCents,
  });

  final String id;
  final String name;

  /// Prazo e transportadora ("Loggi · Goiânia e região em 24 h").
  final String description;

  /// `null` = calculado no checkout (integração de frete ligada).
  final int? priceCents;
}

/// `storePublic/showcase.delivery`.
class StoreDelivery {
  const StoreDelivery({this.freeAboveCents, this.modes = const []});

  /// Sem frete grátis e sem modalidade: a entrega some.
  static const StoreDelivery none = StoreDelivery();

  /// Pedido a partir daqui não paga frete; `null` = sem frete grátis.
  final int? freeAboveCents;
  final List<StoreDeliveryMode> modes;
}

class StoreShowcaseConfig {
  const StoreShowcaseConfig({
    this.banners = const [],
    this.benefits = const StoreBenefits(),
    this.categories = kStoreFallbackCategories,
    this.collections = kStoreFallbackCollections,
    this.pickupArenas = const [],
    this.delivery = StoreDelivery.none,
  });

  /// Sem o doc de config, nada de prometer desconto ou prazo que ninguém
  /// configurou: Pix e retirada somem.
  static const StoreShowcaseConfig empty = StoreShowcaseConfig();

  final List<StoreBanner> banners;
  final StoreBenefits benefits;
  final List<StoreLabel> categories;
  final List<StoreLabel> collections;
  final List<StorePickupArena> pickupArenas;
  final StoreDelivery delivery;
}

/// `storeShoppers/{uid}`: preferências do atleta na Loja.
class StoreShopper {
  const StoreShopper({
    this.favoriteIds = const [],
    this.pickupArenaId,
    this.recentSearches = const [],
  });

  static const StoreShopper empty = StoreShopper();

  final List<String> favoriteIds;
  final String? pickupArenaId;

  /// Mais recente primeiro, no máximo [kStoreMaxRecentSearches].
  final List<String> recentSearches;
}

/// Linha de `storeCarts/{uid}.items`. Só intenção: o checkout relê preço e
/// saldo no servidor.
///
/// A linha personalizada só nasce no servidor (`addStoreCustomItemToCart`),
/// com [lineId] e [customization]. Quem reescreve `items` no cliente leva os
/// dois de volta intactos ([toMap]) — senão a personalização some do
/// carrinho.
class StoreCartItem {
  const StoreCartItem({
    required this.productId,
    required this.skuId,
    required this.qty,
    this.lineId,
    this.customization,
  });

  final String productId;
  final String skuId;
  final int qty;

  /// Id da linha personalizada; `null` na linha comum.
  final String? lineId;

  /// O mapa `customization` como veio do Firestore (Timestamps inclusive);
  /// `null` na linha comum.
  final Map<String, Object?>? customization;

  /// Linha personalizada: nunca soma com outra.
  bool get isCustom => customization != null;

  Map<String, Object> toMap() => {
        if (lineId != null) 'lineId': lineId!,
        'productId': productId,
        'skuId': skuId,
        'qty': qty,
        if (customization != null) 'customization': customization!,
      };

  /// A personalização não entra na comparação: [lineId] já identifica a
  /// linha personalizada.
  @override
  bool operator ==(Object other) =>
      other is StoreCartItem &&
      other.productId == productId &&
      other.skuId == skuId &&
      other.qty == qty &&
      other.lineId == lineId &&
      other.isCustom == isCustom;

  @override
  int get hashCode => Object.hash(productId, skuId, qty, lineId, isCustom);

  @override
  String toString() => 'StoreCartItem($productId, $skuId, $qty'
      '${lineId != null ? ', $lineId' : ''}${isCustom ? ', custom' : ''})';
}

/// Teto da rule de `storeShoppers.recentSearches`.
const int kStoreMaxRecentSearches = 5;

/// Teto da rule de `storeCarts.items` (linhas distintas).
const int kStoreMaxCartLines = 30;

/// Teto de unidades por linha do carrinho (sem regra no servidor; evita
/// número absurdo por toque repetido).
const int kStoreMaxQtyPerLine = 99;

/// Teto de unidades de um SKU por compra — o `MAX_QTY_PER_ITEM` do servidor
/// (`functions/src/store-showcase.ts`): acima disso o saldo não é exposto.
const int kStoreMaxQtyPerItem = 10;
