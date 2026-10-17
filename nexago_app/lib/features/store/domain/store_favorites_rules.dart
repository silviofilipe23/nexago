/// Loja · Favoritos (app 09/09b): ordem, selo, ação do card, linha de preço e
/// destaque — puras, testáveis sem Firestore.
///
/// A fonte de verdade é `docs/business-rules/loja-favoritos.md`, compartilhada
/// com o portal web (`store-favorites-model.ts`): mudar uma regra aqui é mudar
/// lá também.
library;

import '../../../core/formatting/app_currency_format.dart';
import 'store_models.dart';
import 'store_rules.dart';

// ── Lista ───────────────────────────────────────────────────────────────

/// O último favoritado primeiro (inverso de `favoriteIds`). Favorito fora do
/// catálogo do canal fica de fora — o id continua no doc e o card volta se o
/// produto voltar. Id repetido conta uma vez.
List<StoreProduct> orderedStoreFavorites(
  List<String> favoriteIds,
  List<StoreProduct> catalog,
) {
  final byId = {for (final p in catalog) p.id: p};
  final seen = <String>{};
  final out = <StoreProduct>[];
  for (final id in favoriteIds.reversed) {
    final product = byId[id];
    if (product != null && seen.add(id)) out.add(product);
  }
  return out;
}

// ── Selo ────────────────────────────────────────────────────────────────

/// Quanto o "de" riscado está acima do preço; 0 = sem desconto.
int storeFavoriteDiscountCents(StoreProduct p) {
  final strike = strikePriceCents(p);
  return strike == null ? 0 : strike - displayPriceCents(p);
}

/// Valor do desconto: redondo sem centavos ("R$ 20"), com centavos completo
/// ("R$ 20,50").
String storeDiscountAmountLabel(int cents) =>
    cents % 100 == 0 ? formatBRLWhole(cents ~/ 100) : formatBRLFromCents(cents);

/// Fim de estoque: todos os SKUs com saldo em `lowStock` → a soma do `maxQty`
/// deles. `null` = não é o caso (ou nenhum SKU com saldo).
int? storeLastUnits(StoreProduct p) {
  final inStock = p.variants.where((v) => v.inStock).toList();
  if (inStock.isEmpty || !inStock.every((v) => v.lowStock)) return null;
  return inStock.fold<int>(0, (total, v) => total + v.maxQty);
}

enum StoreFavoriteBadgeKind { soldOut, discount, lastUnits }

class StoreFavoriteBadge {
  const StoreFavoriteBadge(this.kind, this.label);

  final StoreFavoriteBadgeKind kind;
  final String label;

  @override
  bool operator ==(Object other) =>
      other is StoreFavoriteBadge && other.kind == kind && other.label == label;

  @override
  int get hashCode => Object.hash(kind, label);

  @override
  String toString() => 'StoreFavoriteBadge(${kind.name}, $label)';
}

/// Um selo só: esgotado > desconto ("−R$ X") > últimas unidades ("Últimas
/// N"; com N no teto exposto, "Últimas unidades").
StoreFavoriteBadge? storeFavoriteBadge(StoreProduct p) {
  if (p.soldOut) {
    return const StoreFavoriteBadge(StoreFavoriteBadgeKind.soldOut, 'Esgotado');
  }
  final off = storeFavoriteDiscountCents(p);
  if (off > 0) {
    return StoreFavoriteBadge(
      StoreFavoriteBadgeKind.discount,
      '−${storeDiscountAmountLabel(off)}',
    );
  }
  final units = storeLastUnits(p);
  if (units != null && units > 0) {
    return StoreFavoriteBadge(
      StoreFavoriteBadgeKind.lastUnits,
      units >= kStoreMaxQtyPerItem ? 'Últimas unidades' : 'Últimas $units',
    );
  }
  return null;
}

/// Tag "Personalizável": nome ou imagem ligados na personalização.
bool storeFavoriteCustomizable(StoreProduct p) =>
    p.customization?.hasOptions ?? false;

// ── Ação do card ────────────────────────────────────────────────────────

enum StoreFavoriteActionKind {
  /// Esgotado: "Avise-me quando chegar".
  notifyMe,

  /// Personalizável: abre a personalização sem `sku`.
  customize,

  /// SKU único com saldo: 1 unidade direto no carrinho.
  addDirect,

  /// Com escolha a fazer: abre a página do produto.
  viewOptions,
}

class StoreFavoriteAction {
  const StoreFavoriteAction(this.kind, {this.variant});

  final StoreFavoriteActionKind kind;

  /// SKU a adicionar quando [kind] é [StoreFavoriteActionKind.addDirect].
  final StoreVariant? variant;
}

/// SKU que dá pra pôr no carrinho sem escolher nada: o único do produto, com
/// saldo.
StoreVariant? storeFavoriteDirectVariant(StoreProduct p) {
  if (p.soldOut || p.variants.length != 1) return null;
  final variant = p.variants.single;
  return variant.inStock ? variant : null;
}

StoreFavoriteAction storeFavoriteAction(StoreProduct p) {
  if (p.soldOut) {
    return const StoreFavoriteAction(StoreFavoriteActionKind.notifyMe);
  }
  if (storeFavoriteCustomizable(p)) {
    return const StoreFavoriteAction(StoreFavoriteActionKind.customize);
  }
  final variant = storeFavoriteDirectVariant(p);
  if (variant != null) {
    return StoreFavoriteAction(
      StoreFavoriteActionKind.addDirect,
      variant: variant,
    );
  }
  return const StoreFavoriteAction(StoreFavoriteActionKind.viewOptions);
}

// ── Linha de preço ──────────────────────────────────────────────────────

/// O que vai embaixo do preço no card do app.
enum StoreFavoriteFoot {
  /// "Avisaremos quando voltar".
  soldOut,

  /// "Personalize com seu nome" (ou "com sua imagem", se só a imagem está ligada).
  customize,

  /// "R$ X no Pix".
  pix,

  /// Sem linha (Pix desligado).
  none,
}

StoreFavoriteFoot storeFavoriteFoot(StoreProduct p, {required bool hasPix}) {
  if (p.soldOut) return StoreFavoriteFoot.soldOut;
  if (storeFavoriteCustomizable(p)) return StoreFavoriteFoot.customize;
  return hasPix ? StoreFavoriteFoot.pix : StoreFavoriteFoot.none;
}

// ── Destaque ────────────────────────────────────────────────────────────

class StoreFavoriteHighlight {
  const StoreFavoriteHighlight({required this.product, required this.cents});

  final StoreProduct product;

  /// Quanto está mais barato (de − por).
  final int cents;
}

/// A faixa verde: o favorito à venda de MAIOR desconto; empate fica com o
/// favoritado por último (o primeiro da lista). `null` = nenhum com desconto.
StoreFavoriteHighlight? storeFavoriteHighlight(List<StoreProduct> favorites) {
  StoreFavoriteHighlight? best;
  for (final p in favorites) {
    if (p.soldOut) continue;
    final cents = storeFavoriteDiscountCents(p);
    if (cents > 0 && (best == null || cents > best.cents)) {
      best = StoreFavoriteHighlight(product: p, cents: cents);
    }
  }
  return best;
}
