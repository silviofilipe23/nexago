import 'package:nexago_app/features/arena/domain/products/arena_product.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_category.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_logic.dart';
import 'package:nexago_app/features/arena/domain/products/arena_stock_movement.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  ArenaProduct product({
    String id = 'p1',
    String name = 'Água',
    ArenaProductCategory category = ArenaProductCategory.bebidas,
    bool active = true,
    int priceCents = 500,
    int stockQuantity = 10,
    int minStockQuantity = 5,
  }) {
    return ArenaProduct(
      id: id,
      name: name,
      category: category,
      active: active,
      priceCents: priceCents,
      stockQuantity: stockQuantity,
      minStockQuantity: minStockQuantity,
    );
  }

  group('productStockStatus', () {
    test('returns out when inactive', () {
      expect(
        productStockStatus(product(active: false, stockQuantity: 20)),
        ArenaProductStockStatus.out,
      );
    });

    test('returns out when zero stock', () {
      expect(
        productStockStatus(product(stockQuantity: 0, minStockQuantity: 5)),
        ArenaProductStockStatus.out,
      );
    });

    test('returns low at min threshold', () {
      expect(
        productStockStatus(product(stockQuantity: 5, minStockQuantity: 5)),
        ArenaProductStockStatus.low,
      );
    });

    test('returns ok above min', () {
      expect(
        productStockStatus(product(stockQuantity: 6, minStockQuantity: 5)),
        ArenaProductStockStatus.ok,
      );
    });
  });

  group('buildProductSummary', () {
    test('aggregates active, alerts and inventory value', () {
      final summary = buildProductSummary([
        product(
          id: '1',
          stockQuantity: 48,
          minStockQuantity: 12,
          priceCents: 500,
        ),
        product(
          id: '2',
          stockQuantity: 7,
          minStockQuantity: 10,
          priceCents: 1200,
        ),
        product(
          id: '3',
          stockQuantity: 0,
          minStockQuantity: 8,
          priceCents: 900,
        ),
        product(id: '4', active: false, stockQuantity: 100),
      ]);

      expect(summary.activeCount, 3);
      expect(summary.lowCount, 1);
      expect(summary.outCount, 1);
      expect(summary.inventoryValueCents, 48 * 500 + 7 * 1200);
    });
  });

  group('filterProductsByCategory', () {
    test('filters by category', () {
      final filtered = filterProductsByCategory(
        [
          product(category: ArenaProductCategory.bebidas),
          product(
            id: '2',
            category: ArenaProductCategory.equipamentos,
          ),
        ],
        ArenaProductCategory.bebidas,
      );
      expect(filtered, hasLength(1));
      expect(filtered.first.category, ArenaProductCategory.bebidas);
    });
  });

  group('productStockBar', () {
    test('healthy stock fills bar and places min marker at ratio', () {
      final item = product(stockQuantity: 48, minStockQuantity: 12);
      expect(productStockBarCapacity(item), 48);
      expect(productStockBarFillRatio(item), 1.0);
      expect(productStockBarMinMarkerRatio(item), closeTo(0.25, 0.001));
    });

    test('low stock uses min as capacity', () {
      final item = product(stockQuantity: 7, minStockQuantity: 10);
      expect(productStockBarCapacity(item), 10);
      expect(productStockBarFillRatio(item), closeTo(0.7, 0.001));
      expect(productStockBarMinMarkerRatio(item), 1.0);
    });
  });

  group('restockActionAccent', () {
    test('maps movement types to semantic accents', () {
      expect(
        restockActionAccent(
          type: ArenaStockMovementType.purchase,
          quantity: 24,
        ),
        RestockActionAccent.inbound,
      );
      expect(
        restockActionAccent(
          type: ArenaStockMovementType.adjustment,
          quantity: -2,
        ),
        RestockActionAccent.adjustment,
      );
      expect(
        restockActionAccent(
          type: ArenaStockMovementType.loss,
          quantity: -2,
        ),
        RestockActionAccent.outbound,
      );
    });
  });

  group('computeTurnover7d', () {
    test('sums sale and loss quantities', () {
      final total = computeTurnover7d([
        ArenaStockMovement(
          id: '1',
          productId: 'p',
          productName: 'X',
          type: ArenaStockMovementType.sale,
          quantityDelta: -31,
          quantityBefore: 38,
          quantityAfter: 7,
          createdByUid: 'u',
        ),
        ArenaStockMovement(
          id: '2',
          productId: 'p',
          productName: 'X',
          type: ArenaStockMovementType.loss,
          quantityDelta: -2,
          quantityBefore: 9,
          quantityAfter: 7,
          createdByUid: 'u',
        ),
        ArenaStockMovement(
          id: '3',
          productId: 'p',
          productName: 'X',
          type: ArenaStockMovementType.purchase,
          quantityDelta: 24,
          quantityBefore: 7,
          quantityAfter: 31,
          createdByUid: 'u',
        ),
      ]);
      expect(total, 33);
    });
  });

  group('previewRestock', () {
    test('adds delta to current quantity', () {
      expect(previewRestock(currentQuantity: 7, delta: 24), 31);
    });
  });

  group('signedDeltaForMovementType', () {
    test('purchase is positive', () {
      expect(
        signedDeltaForMovementType(
          type: ArenaStockMovementType.purchase,
          quantity: 24,
        ),
        24,
      );
    });

    test('loss is negative', () {
      expect(
        signedDeltaForMovementType(
          type: ArenaStockMovementType.loss,
          quantity: 2,
        ),
        -2,
      );
    });
  });

  group('movementHistoryTitle', () {
    test('includes note when present', () {
      final title = movementHistoryTitle(
        ArenaStockMovement(
          id: '1',
          productId: 'p',
          productName: 'X',
          type: ArenaStockMovementType.adjustment,
          quantityDelta: -2,
          quantityBefore: 9,
          quantityAfter: 7,
          createdByUid: 'u',
          note: 'quebra (2)',
        ),
      );
      expect(title, 'Ajuste (quebra (2))');
    });
  });

  group('stockMovementSuccessCopy', () {
    test('headline varies by type', () {
      expect(
        stockMovementSuccessHeadline(ArenaStockMovementType.purchase),
        'Entrada registrada.',
      );
      expect(
        stockMovementSuccessHeadline(ArenaStockMovementType.loss),
        'Perda registrada.',
      );
    });

    test('type detail label reflects direction on adjustment', () {
      expect(
        stockMovementTypeDetailLabel(
          ArenaStockMovementType.adjustment,
          quantityDelta: 3,
        ),
        'Entrada · Ajuste',
      );
      expect(
        stockMovementTypeDetailLabel(
          ArenaStockMovementType.adjustment,
          quantityDelta: -2,
        ),
        'Saída · Ajuste',
      );
    });
  });

  group('formatSignedQuantityDelta', () {
    test('prefixes positive deltas', () {
      expect(formatSignedQuantityDelta(24), '+24');
      expect(formatSignedQuantityDelta(-2), '-2');
    });
  });
}
