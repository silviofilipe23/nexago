/// Loja · Produto (tela 02): seleção de variação, preço, quantidade, galeria
/// e "como receber" — puras, testáveis sem Firestore.
///
/// A fonte de verdade é `docs/business-rules/loja-produto.md`, compartilhada
/// com o portal web (`store-product-model.ts`): mudar uma regra aqui é mudar
/// lá também.
library;

import 'store_models.dart';
import 'store_rules.dart';

// ── Catálogo ────────────────────────────────────────────────────────────

/// Acha o produto pelo id (rota do app) ou pelo `slug` (link do portal).
StoreProduct? findStoreProduct(List<StoreProduct> products, String idOrSlug) {
  final key = idOrSlug.trim();
  if (key.isEmpty) return null;
  for (final p in products) {
    if (p.id == key) return p;
  }
  for (final p in products) {
    if (p.slug.isNotEmpty && p.slug == key) return p;
  }
  return null;
}

// ── Eixos ───────────────────────────────────────────────────────────────

/// Eixo com algum valor com `hex` é cor (bolinhas); os outros, botões.
bool isStoreColorAxis(StoreAxis axis) => axis.values.any((v) => v.hex != null);

bool _matches(
  StoreVariant v,
  Map<String, String> selected,
  Iterable<StoreAxis> axes,
) {
  return axes.every(
    (a) => !selected.containsKey(a.id) || v.values[a.id] == selected[a.id],
  );
}

/// Disponibilidade em cascata: o valor precisa de um SKU com saldo que bata
/// com o escolhido nos eixos ANTERIORES. A cor (1º eixo) só fica riscada sem
/// saldo nenhum; o tamanho depende da cor.
bool storeAxisValueAvailable(
  StoreProduct p,
  int axisIndex,
  String valueId,
  Map<String, String> selected,
) {
  if (axisIndex < 0 || axisIndex >= p.axes.length) return false;
  final axis = p.axes[axisIndex];
  final before = p.axes.take(axisIndex);
  return p.variants.any(
    (v) =>
        v.inStock &&
        v.values[axis.id] == valueId &&
        _matches(v, selected, before),
  );
}

/// 1ª cor com saldo (ou a 1ª, se tudo esgotou — para mostrar as fotos); eixo
/// de um valor só já vem escolhido; tamanho nunca.
Map<String, String> storeProductInitialSelection(StoreProduct p) {
  final selected = <String, String>{};
  for (var i = 0; i < p.axes.length; i++) {
    final axis = p.axes[i];
    if (axis.values.length == 1) {
      selected[axis.id] = axis.values.single.id;
    } else if (i == 0 && isStoreColorAxis(axis) && axis.values.isNotEmpty) {
      final first = axis.values.firstWhere(
        (v) => storeAxisValueAvailable(p, 0, v.id, selected),
        orElse: () => axis.values.first,
      );
      selected[axis.id] = first.id;
    }
  }
  return selected;
}

/// Escolhe o valor e solta as escolhas dos eixos seguintes que ficaram sem
/// saldo.
Map<String, String> selectStoreAxisValue(
  StoreProduct p,
  Map<String, String> selected,
  String axisId,
  String valueId,
) {
  final next = {...selected, axisId: valueId};
  final index = p.axes.indexWhere((a) => a.id == axisId);
  for (var i = index + 1; i < p.axes.length; i++) {
    final chosen = next[p.axes[i].id];
    if (chosen != null && !storeAxisValueAvailable(p, i, chosen, next)) {
      next.remove(p.axes[i].id);
    }
  }
  return next;
}

/// O primeiro eixo ainda sem escolha (o que treme no "Adicionar").
StoreAxis? storeMissingAxis(StoreProduct p, Map<String, String> selected) {
  for (final axis in p.axes) {
    if (!selected.containsKey(axis.id)) return axis;
  }
  return null;
}

/// "Escolha um tamanho" / "Escolha uma cor" / "Escolha modelo".
String storeChooseAxisMessage(StoreAxis axis) {
  switch (normalizeStoreSearch(axis.label)) {
    case 'tamanho':
      return 'Escolha um tamanho';
    case 'cor':
      return 'Escolha uma cor';
    default:
      return 'Escolha ${axis.label.toLowerCase()}';
  }
}

String _valueLabel(StoreAxis axis, String? valueId) {
  for (final v in axis.values) {
    if (v.id == valueId) return v.label;
  }
  return valueId ?? '';
}

/// Rótulo do valor escolhido num eixo ("Branco areia"); vazio sem escolha.
String storeSelectedValueLabel(StoreAxis axis, Map<String, String> selected) {
  final id = selected[axis.id];
  return id == null ? '' : _valueLabel(axis, id);
}

/// "Branco areia · M" — rótulos na ordem dos eixos.
String storeVariantLabel(StoreProduct p, StoreVariant variant) {
  return p.axes
      .map((a) => _valueLabel(a, variant.values[a.id]))
      .where((label) => label.isNotEmpty)
      .join(' · ');
}

/// "no tamanho M" / "na cor Branco" / "em Pro" — a última escolha, que é a
/// que acaba. `null` = produto sem eixo.
String? _lastChoicePhrase(StoreProduct p, StoreVariant variant) {
  if (p.axes.isEmpty) return null;
  final axis = p.axes.last;
  final label = _valueLabel(axis, variant.values[axis.id]);
  if (isStoreColorAxis(axis)) return 'na cor $label';
  if (normalizeStoreSearch(axis.label) == 'tamanho') return 'no tamanho $label';
  return 'em $label';
}

/// "Só 2 no tamanho M"; acima do teto exposto, "Últimas unidades no tamanho
/// M"; sem eixo, "Só 2 em estoque". `null` = SKU não escolhido ou sem alerta.
String? storeLowStockCaption(StoreProduct p, Map<String, String> selected) {
  final v = storeVariantFor(p, selected);
  if (v == null || !v.inStock || !v.lowStock) return null;
  final where = _lastChoicePhrase(p, v) ?? 'em estoque';
  return v.maxQty < kStoreMaxQtyPerItem
      ? 'Só ${v.maxQty} $where'
      : 'Últimas unidades $where';
}

/// O SKU acabou entre a escolha e o toque (o listener já atualizou).
String storeSoldOutMessage(StoreProduct p, StoreVariant variant) {
  if (p.axes.isEmpty) return 'Esse produto acabou de esgotar';
  final axis = p.axes.last;
  final label = _valueLabel(axis, variant.values[axis.id]);
  final name = axis.label.toLowerCase();
  return isStoreColorAxis(axis)
      ? 'Acabou o estoque da cor $label · escolha outra $name'
      : 'Acabou o estoque do $label · escolha outro $name';
}

// ── Preço e quantidade ──────────────────────────────────────────────────

class StoreSelectionPrice {
  const StoreSelectionPrice({
    required this.cents,
    this.from = false,
    this.strikeCents,
  });

  final int cents;

  /// Mais de um preço possível na seleção: "a partir de".
  final bool from;

  /// Preço "de" riscado; nunca junto com "a partir de".
  final int? strikeCents;

  @override
  bool operator ==(Object other) =>
      other is StoreSelectionPrice &&
      other.cents == cents &&
      other.from == from &&
      other.strikeCents == strikeCents;

  @override
  int get hashCode => Object.hash(cents, from, strikeCents);

  @override
  String toString() => 'StoreSelectionPrice($cents, from: $from, '
      'strike: $strikeCents)';
}

/// SKU escolhido → o preço dele; senão a faixa entre os SKUs com saldo que
/// batem com a seleção (sem nenhum com saldo, entre todos que batem).
StoreSelectionPrice storeSelectionPrice(
  StoreProduct p,
  Map<String, String> selected,
) {
  final variant = storeVariantFor(p, selected);
  int cents;
  bool from;
  if (variant != null) {
    cents = variant.priceCents;
    from = false;
  } else {
    final matching =
        p.variants.where((v) => _matches(v, selected, p.axes)).toList();
    final pool = matching.isNotEmpty ? matching : p.variants;
    final inStock = pool.where((v) => v.inStock).toList();
    final prices =
        (inStock.isNotEmpty ? inStock : pool).map((v) => v.priceCents).toList();
    if (prices.isEmpty) {
      cents = p.minPriceCents;
      from = p.minPriceCents != p.maxPriceCents;
    } else {
      cents = prices.reduce((a, b) => a < b ? a : b);
      from = prices.reduce((a, b) => a > b ? a : b) != cents;
    }
  }
  final compareAt = p.compareAtPriceCents;
  return StoreSelectionPrice(
    cents: cents,
    from: from,
    strikeCents:
        !from && compareAt != null && compareAt > cents ? compareAt : null,
  );
}

/// Teto do seletor: o `maxQty` do SKU escolhido (mínimo 1); sem SKU, o teto
/// da compra.
int storeMaxQuantity(StoreProduct p, Map<String, String> selected) {
  final v = storeVariantFor(p, selected);
  if (v == null) return kStoreMaxQtyPerItem;
  return v.maxQty.clamp(1, kStoreMaxQtyPerItem);
}

/// Unidades do SKU na linha COMUM do carrinho (a que o "Adicionar" soma);
/// linhas personalizadas do mesmo SKU não contam.
int storeCartQtyOf(
  List<StoreCartItem> items, {
  required String productId,
  required String skuId,
}) {
  for (final i in items) {
    if (!i.isCustom && i.productId == productId && i.skuId == skuId) {
      return i.qty;
    }
  }
  return 0;
}

// ── Galeria e relacionados ──────────────────────────────────────────────

/// Fotos da cor escolhida seguidas das sem cor; cor sem foto própria → as
/// sem cor; nenhuma → todas. Sem galeria (doc antigo), a capa.
List<StorePhoto> storeGalleryPhotos(
  StoreProduct p,
  Map<String, String> selected,
) {
  final cover = p.coverUrl;
  final all = p.photos.isNotEmpty
      ? p.photos
      : [if (cover != null) StorePhoto(url: cover)];
  if (p.axes.isEmpty) return all;
  final color = selected[p.axes.first.id];
  if (color == null) return all;
  final own = all.where((ph) => ph.colorValueId == color).toList();
  final generic = all.where((ph) => ph.colorValueId == null).toList();
  if (own.isNotEmpty) return [...own, ...generic];
  return generic.isNotEmpty ? generic : all;
}

/// "Combina com": mais vendidos da mesma categoria, completados pelos das
/// outras; sem o próprio e sem esgotados.
List<StoreProduct> storeRelatedProducts(
  StoreProduct p,
  List<StoreProduct> catalog,
  int limit,
) {
  final ranked = sortStoreProducts(
    catalog.where((x) => x.id != p.id && !x.soldOut),
    StoreSort.bestSellers,
  );
  return [
    ...ranked.where((x) => x.category == p.category),
    ...ranked.where((x) => x.category != p.category),
  ].take(limit).toList();
}

// ── Como receber ────────────────────────────────────────────────────────

/// São Paulo não tem horário de verão desde 2019: UTC−3 fixo, a mesma conta
/// do portal.
const Duration _saoPauloOffset = Duration(hours: 3);
const List<String> _weekdays = [
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
  'domingo',
];
const int _opensAt = 8;
const int _closesAt = 20;

/// Quando a retirada fica pronta: o dia ("hoje", "amanhã", "domingo",
/// "25/10") e a hora cheia.
class StorePickupReady {
  const StorePickupReady({required this.day, required this.hour});

  final String day;
  final int hour;

  /// "Pronto amanhã a partir das 16h".
  String get label => 'Pronto $day a partir das ${hour}h';
}

/// Agora + prazo do ponto, arredondado pra cima até a hora cheia e trazido
/// pra janela 8h–20h de São Paulo (antes das 8h vira 8h; depois das 20h, 8h
/// do dia seguinte).
StorePickupReady storePickupReady(int readyHours, DateTime now) {
  // Relógio de parede de SP lido pelos campos UTC.
  final local = now.toUtc().subtract(_saoPauloOffset);
  var ready = local.add(Duration(hours: readyHours < 0 ? 0 : readyHours));
  final exact = DateTime.utc(ready.year, ready.month, ready.day, ready.hour);
  if (ready.isAfter(exact)) ready = exact.add(const Duration(hours: 1));
  if (ready.hour < _opensAt) {
    ready = DateTime.utc(ready.year, ready.month, ready.day, _opensAt);
  } else if (ready.hour > _closesAt) {
    ready = DateTime.utc(ready.year, ready.month, ready.day + 1, _opensAt);
  }
  final today = DateTime.utc(local.year, local.month, local.day);
  final day = DateTime.utc(ready.year, ready.month, ready.day);
  final diff = (day.difference(today).inHours / 24).round();
  final String when;
  if (diff == 0) {
    when = 'hoje';
  } else if (diff == 1) {
    when = 'amanhã';
  } else if (diff < 7) {
    when = _weekdays[ready.weekday - 1];
  } else {
    when = '${ready.day.toString().padLeft(2, '0')}/'
        '${ready.month.toString().padLeft(2, '0')}';
  }
  return StorePickupReady(day: when, hour: ready.hour);
}

/// "Pronto amanhã a partir das 16h".
String storePickupReadyLabel(int readyHours, DateTime now) =>
    storePickupReady(readyHours, now).label;

/// 0 = grátis (o pedido alcança o frete grátis); `null` = calculado no
/// checkout.
int? storeDeliveryPriceCents(
  StoreDeliveryMode mode,
  int subtotalCents,
  int? freeAboveCents,
) {
  if (freeAboveCents != null && subtotalCents >= freeAboveCents) return 0;
  return mode.priceCents;
}

/// Menor preço de entrega entre as modalidades (0 = grátis); `null` = todas
/// calculadas no checkout (ou nenhuma).
int? storeDeliveryFromCents(
  StoreDelivery delivery,
  int subtotalCents,
) {
  int? best;
  for (final mode in delivery.modes) {
    final price =
        storeDeliveryPriceCents(mode, subtotalCents, delivery.freeAboveCents);
    if (price != null && (best == null || price < best)) best = price;
  }
  return best;
}
