import 'package:intl/intl.dart';

import 'arena_product.dart';
import 'arena_product_category.dart';
import 'arena_stock_movement.dart';

enum ArenaProductStockStatus {
  ok,
  low,
  out,
}

class ArenaProductSummary {
  const ArenaProductSummary({
    required this.activeCount,
    required this.lowCount,
    required this.outCount,
    required this.inventoryValueCents,
  });

  final int activeCount;
  final int lowCount;
  final int outCount;
  final int inventoryValueCents;

  int get alertCount => lowCount + outCount;
}

ArenaProductStockStatus productStockStatus(ArenaProduct product) {
  if (!product.active || product.stockQuantity <= 0) {
    return ArenaProductStockStatus.out;
  }
  if (product.stockQuantity <= product.minStockQuantity) {
    return ArenaProductStockStatus.low;
  }
  return ArenaProductStockStatus.ok;
}

List<ArenaProduct> filterProductsByCategory(
  List<ArenaProduct> products,
  ArenaProductCategory? category,
) {
  if (category == null) return products;
  return products.where((p) => p.category == category).toList(growable: false);
}

List<ArenaProduct> sortProductsByName(List<ArenaProduct> products) {
  final copy = List<ArenaProduct>.from(products);
  copy.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  return copy;
}

ArenaProductSummary buildProductSummary(List<ArenaProduct> products) {
  var activeCount = 0;
  var lowCount = 0;
  var outCount = 0;
  var inventoryValueCents = 0;

  for (final product in products) {
    if (!product.active) continue;
    activeCount++;
    inventoryValueCents += product.inventoryValueCents;
    switch (productStockStatus(product)) {
      case ArenaProductStockStatus.out:
        outCount++;
      case ArenaProductStockStatus.low:
        lowCount++;
      case ArenaProductStockStatus.ok:
        break;
    }
  }

  return ArenaProductSummary(
    activeCount: activeCount,
    lowCount: lowCount,
    outCount: outCount,
    inventoryValueCents: inventoryValueCents,
  );
}

int productStockBarCapacity(ArenaProduct product) {
  final stock = product.stockQuantity;
  final min = product.minStockQuantity;
  if (stock <= 0) return min > 0 ? min : 1;
  if (min <= 0) return stock;
  return stock > min ? stock : min;
}

double productStockBarFillRatio(ArenaProduct product) {
  final capacity = productStockBarCapacity(product);
  if (capacity <= 0) return 0;
  return (product.stockQuantity / capacity).clamp(0.0, 1.0);
}

double productStockBarMinMarkerRatio(ArenaProduct product) {
  final min = product.minStockQuantity;
  if (min <= 0) return 0;
  final capacity = productStockBarCapacity(product);
  if (capacity <= 0) return 0;
  return (min / capacity).clamp(0.0, 1.0);
}

List<ArenaProduct> productsWithStockAlerts(List<ArenaProduct> products) {
  return products
      .where((p) {
        if (!p.active) return false;
        final status = productStockStatus(p);
        return status == ArenaProductStockStatus.low ||
            status == ArenaProductStockStatus.out;
      })
      .toList(growable: false);
}

List<ArenaProduct> productsOutOfStock(List<ArenaProduct> products) {
  return products
      .where(
        (p) => p.active && productStockStatus(p) == ArenaProductStockStatus.out,
      )
      .toList(growable: false);
}

List<ArenaProduct> productsLowStock(List<ArenaProduct> products) {
  return products
      .where((p) {
        if (!p.active) return false;
        return productStockStatus(p) == ArenaProductStockStatus.low;
      })
      .toList(growable: false);
}

int computeTurnover7d(List<ArenaStockMovement> movements) {
  var total = 0;
  for (final movement in movements) {
    if (movement.type == ArenaStockMovementType.sale ||
        movement.type == ArenaStockMovementType.loss) {
      total += movement.quantityDelta.abs();
    }
  }
  return total;
}

int previewRestock({
  required int currentQuantity,
  required int delta,
}) {
  return currentQuantity + delta;
}

int signedDeltaForMovementType({
  required ArenaStockMovementType type,
  required int quantity,
}) {
  final absQty = quantity.abs();
  return switch (type) {
    ArenaStockMovementType.purchase => absQty,
    ArenaStockMovementType.adjustment => quantity,
    ArenaStockMovementType.loss => -absQty,
    ArenaStockMovementType.sale => -absQty,
  };
}

String movementHistoryTitle(ArenaStockMovement movement) {
  final typeLabel = switch (movement.type) {
    ArenaStockMovementType.purchase => 'Entrada · compra',
    ArenaStockMovementType.adjustment => 'Ajuste',
    ArenaStockMovementType.loss => 'Saída · perda',
    ArenaStockMovementType.sale => 'Saída · vendas',
  };
  final note = movement.note?.trim();
  if (note == null || note.isEmpty) return typeLabel;
  return '$typeLabel ($note)';
}

String formatMovementDelta(ArenaStockMovement movement) {
  final sign = movement.quantityDelta > 0 ? '+' : '';
  return '$sign${movement.quantityDelta}';
}

String formatSignedQuantityDelta(int quantityDelta) {
  final sign = quantityDelta > 0 ? '+' : '';
  return '$sign$quantityDelta';
}

String formatProductSummarySubtitle(ArenaProductSummary summary) {
  if (summary.activeCount == 0) return 'Nenhum produto ativo';
  final parts = <String>['${summary.activeCount} ativos'];
  if (summary.alertCount > 0) {
    parts.add('${summary.alertCount} baixo estoque');
  }
  return parts.join(' • ');
}

String formatInventoryValueReais(int cents) {
  final formatter = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
  return formatter.format(cents / 100);
}

String formatPriceReais(int cents) {
  final formatter = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
  return formatter.format(cents / 100);
}

String restockActionLabel({
  required ArenaStockMovementType type,
  required int quantity,
}) {
  final absQty = quantity.abs();
  return switch (type) {
    ArenaStockMovementType.purchase =>
      'Registrar entrada · +$absQty un',
    ArenaStockMovementType.adjustment when quantity >= 0 =>
      'Registrar ajuste · +$absQty un',
    ArenaStockMovementType.adjustment =>
      'Registrar ajuste · $quantity un',
    ArenaStockMovementType.loss => 'Registrar perda · -$absQty un',
    ArenaStockMovementType.sale => 'Registrar saída · -$absQty un',
  };
}

/// Cor semântica do CTA de repor estoque (mapeada para tokens na UI).
enum RestockActionAccent {
  inbound,
  adjustment,
  outbound,
}

RestockActionAccent restockActionAccent({
  required ArenaStockMovementType type,
  required int quantity,
}) {
  return switch (type) {
    ArenaStockMovementType.purchase => RestockActionAccent.inbound,
    ArenaStockMovementType.adjustment => RestockActionAccent.adjustment,
    ArenaStockMovementType.loss => RestockActionAccent.outbound,
    ArenaStockMovementType.sale => RestockActionAccent.outbound,
  };
}

String stockMovementSuccessHeadline(ArenaStockMovementType type) {
  return switch (type) {
    ArenaStockMovementType.purchase => 'Entrada registrada.',
    ArenaStockMovementType.adjustment => 'Ajuste registrado.',
    ArenaStockMovementType.loss => 'Perda registrada.',
    ArenaStockMovementType.sale => 'Saída registrada.',
  };
}

String stockMovementSuccessMessage(ArenaStockMovementType type) {
  return switch (type) {
    ArenaStockMovementType.purchase =>
      'foi atualizado e já reflete nas vendas.',
    ArenaStockMovementType.adjustment ||
    ArenaStockMovementType.loss =>
      'foi atualizado no inventário.',
    ArenaStockMovementType.sale =>
      'foi atualizado e já reflete nas vendas.',
  };
}

String stockMovementTypeDetailLabel(
  ArenaStockMovementType type, {
  required int quantityDelta,
}) {
  return switch (type) {
    ArenaStockMovementType.purchase => 'Entrada · Compra',
    ArenaStockMovementType.adjustment when quantityDelta >= 0 =>
      'Entrada · Ajuste',
    ArenaStockMovementType.adjustment => 'Saída · Ajuste',
    ArenaStockMovementType.loss => 'Saída · Perda',
    ArenaStockMovementType.sale => 'Saída · Vendas',
  };
}

String formatStockMovementRegisteredAt(DateTime date) {
  final formatter = DateFormat('d MMM, HH:mm', 'pt_BR');
  return 'Você · ${formatter.format(date)}';
}
