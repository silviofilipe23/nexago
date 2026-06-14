import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_draft.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_item.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_logic.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_payment.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_category.dart';
import 'package:nexago_app/features/arena/domain/products/arena_product_logic.dart';

void main() {
  ArenaComanda comanda({
    String id = 'c1',
    int displayNumber = 434,
    ArenaComandaType type = ArenaComandaType.individual,
    ArenaComandaStatus status = ArenaComandaStatus.open,
    int rentalCents = 6000,
    int itemsTotalCents = 0,
    int paidCents = 0,
    int? totalCents,
    DateTime? openedAt,
  }) {
    final total = totalCents ?? rentalCents + itemsTotalCents;
    return ArenaComanda(
      id: id,
      arenaId: 'arena1',
      displayNumber: displayNumber,
      type: type,
      status: status,
      customerName: 'Rafael Dias',
      allowAppOrders: true,
      rentalCents: rentalCents,
      itemsTotalCents: itemsTotalCents,
      totalCents: total,
      itemsCount: 0,
      paidCents: paidCents,
      openedByUid: 'u1',
      openedAt: openedAt ?? DateTime(2026, 6, 13, 14, 32),
    );
  }

  group('formatComandaNumber', () {
    test('pads to four digits', () {
      expect(formatComandaNumber(434), '#0434');
      expect(formatComandaNumber(7), '#0007');
    });
  });

  group('filterComandas', () {
    test('all returns active comandas only', () {
      final list = [
        comanda(status: ArenaComandaStatus.open),
        comanda(id: 'c2', status: ArenaComandaStatus.closed),
        comanda(id: 'c3', status: ArenaComandaStatus.partiallyPaid),
      ];
      final filtered = filterComandas(list, ArenaComandaFilterChip.all);
      expect(filtered, hasLength(2));
    });

    test('toPay filters partially paid and closing', () {
      final list = [
        comanda(status: ArenaComandaStatus.open),
        comanda(id: 'c2', status: ArenaComandaStatus.partiallyPaid),
        comanda(id: 'c3', status: ArenaComandaStatus.closing),
      ];
      final filtered = filterComandas(list, ArenaComandaFilterChip.toPay);
      expect(filtered, hasLength(2));
    });
  });

  group('computeComandasKpis', () {
    test('aggregates open count and today totals', () {
      final reference = DateTime(2026, 6, 13, 15);
      final kpis = computeComandasKpis(
        [
          comanda(totalCents: 6000, openedAt: DateTime(2026, 6, 13, 11)),
          comanda(
            id: 'c2',
            totalCents: 8500,
            openedAt: DateTime(2026, 6, 13, 12),
          ),
          comanda(
            id: 'c3',
            totalCents: 5000,
            openedAt: DateTime(2026, 6, 12, 12),
          ),
        ],
        reference: reference,
      );

      expect(kpis.openCount, 3);
      expect(kpis.todayTotalCents, 14500);
      expect(kpis.averageTicketCents, 7250);
    });

    test('includes closed comandas opened today in HOJE', () {
      final reference = DateTime(2026, 6, 13, 18);
      final kpis = computeComandasKpis(
        [
          comanda(
            totalCents: 4000,
            openedAt: DateTime(2026, 6, 13, 10),
            status: ArenaComandaStatus.closed,
          ),
          comanda(
            id: 'c2',
            totalCents: 2000,
            openedAt: DateTime(2026, 6, 13, 14),
          ),
        ],
        reference: reference,
      );

      expect(kpis.openCount, 1);
      expect(kpis.todayTotalCents, 6000);
      expect(kpis.averageTicketCents, 3000);
    });

    test('uses createdAt when openedAt is missing', () {
      final reference = DateTime(2026, 6, 13, 12);
      final kpis = computeComandasKpis(
        [
          ArenaComanda(
            id: 'c1',
            arenaId: 'arena1',
            displayNumber: 1,
            type: ArenaComandaType.individual,
            status: ArenaComandaStatus.open,
            customerName: 'Cliente',
            allowAppOrders: false,
            rentalCents: 0,
            itemsTotalCents: 1500,
            totalCents: 1500,
            itemsCount: 1,
            paidCents: 0,
            openedByUid: 'u1',
            createdAt: DateTime(2026, 6, 13, 9),
          ),
        ],
        reference: reference,
      );

      expect(kpis.todayTotalCents, 1500);
      expect(kpis.averageTicketCents, 1500);
    });
  });

  group('rentalCentsFromBooking', () {
    test('uses amountReais when present', () {
      final cents = rentalCentsFromBooking(
        ArenaManagerBooking(
          id: 'b1',
          athleteId: 'a1',
          courtId: 'court1',
          courtName: 'Quadra 2',
          dateKey: '2026-06-13',
          startTime: '11:00',
          endTime: '12:00',
          data: const {'amountReais': 60},
        ),
      );
      expect(cents, 6000);
    });

    test('falls back to amountDueOnsiteReais', () {
      final cents = rentalCentsFromBooking(
        ArenaManagerBooking(
          id: 'b1',
          athleteId: 'a1',
          courtId: 'court1',
          courtName: 'Quadra 2',
          dateKey: '2026-06-13',
          startTime: '11:00',
          endTime: '12:00',
          data: const {'amountDueOnsiteReais': 45.5},
        ),
      );
      expect(cents, 4550);
    });
  });

  group('isValidComandaDraftForCreate', () {
    test('requires individual type, origin and customer name', () {
      expect(
        isValidComandaDraftForCreate(const ArenaComandaDraft()),
        isFalse,
      );
      expect(
        isValidComandaDraftForCreate(
          const ArenaComandaDraft(
            customerName: 'Rafael',
            linkWithoutBooking: true,
          ),
        ),
        isTrue,
      );
      expect(
        isValidComandaDraftForCreate(
          const ArenaComandaDraft(
            type: ArenaComandaType.shared,
            customerName: 'Rafael',
            linkWithoutBooking: true,
          ),
        ),
        isFalse,
      );
    });
  });

  group('remainingCents and breakdown', () {
    test('remainingCents subtracts paid from total', () {
      final c = comanda(
        rentalCents: 6000,
        itemsTotalCents: 8500,
        paidCents: 5000,
      );
      expect(c.remainingCents, 9500);
      expect(c.isFullyPaid, isFalse);
    });

    test('formatConsumptionBreakdown combines rental and consumption', () {
      final breakdown = formatConsumptionBreakdown(
        rentalCents: 6000,
        consumptionCents: 8500,
      );
      expect(breakdown, contains('Locação'));
      expect(breakdown, contains('consumo'));
      expect(breakdown, contains('60,00'));
      expect(breakdown, contains('85,00'));
      expect(
        formatConsumptionBreakdown(rentalCents: 0, consumptionCents: 0),
        'Sem lançamentos',
      );
    });
  });

  group('payment and item labels', () {
    test('paymentMethodLabel returns Portuguese labels', () {
      expect(paymentMethodLabel(ArenaComandaPaymentMethod.pix), 'Pix');
      expect(paymentMethodLabel(ArenaComandaPaymentMethod.cash), 'Dinheiro');
    });

    test('formatItemMeta distinguishes counter and app sources', () {
      final counterItem = ArenaComandaItem(
        id: 'i1',
        productId: 'p1',
        productName: 'Água',
        quantity: 1,
        unitPriceCents: 500,
        lineTotalCents: 500,
        source: ArenaComandaItemSource.counter,
        addedByName: 'Júlia',
        addedByUid: 'u1',
        createdAt: DateTime(2026, 6, 13, 11, 5),
      );
      expect(formatItemMeta(counterItem), '11:05 · Júlia (balcão)');

      final appItem = ArenaComandaItem(
        id: 'i2',
        productId: 'p1',
        productName: 'Água',
        quantity: 1,
        unitPriceCents: 500,
        lineTotalCents: 500,
        source: ArenaComandaItemSource.app,
        addedByName: 'Enzo',
        addedByUid: 'u1',
        createdAt: DateTime(2026, 6, 13, 11, 12),
      );
      expect(formatItemMeta(appItem), '11:12 · App · Enzo');
    });
  });

  group('computeCashbackCents', () {
    test('returns 3 percent rounded', () {
      expect(computeCashbackCents(10000), 300);
      expect(computeCashbackCents(14500), 435);
    });
  });

  group('quick add category filter', () {
    test('maps chips to product categories', () {
      expect(
        quickAddCategoryFilter(ArenaComandaQuickAddCategory.bebidas),
        ArenaProductCategory.bebidas,
      );
      expect(quickAddCategoryFilter(ArenaComandaQuickAddCategory.all), isNull);
    });

    test('filters active products by category', () {
      final products = [
        const ArenaProduct(
          id: 'p1',
          name: 'Água',
          category: ArenaProductCategory.bebidas,
          active: true,
          priceCents: 500,
          stockQuantity: 10,
          minStockQuantity: 2,
        ),
        const ArenaProduct(
          id: 'p2',
          name: 'Hambúrguer',
          category: ArenaProductCategory.alimentacao,
          active: true,
          priceCents: 2500,
          stockQuantity: 5,
          minStockQuantity: 1,
        ),
      ];
      final filtered = filterProductsByCategory(
        products,
        quickAddCategoryFilter(ArenaComandaQuickAddCategory.bebidas),
      );
      expect(filtered, hasLength(1));
      expect(filtered.first.name, 'Água');
    });
  });

  group('canReverseComandaItem', () {
    test('allows reverse on open comanda without payments', () {
      final item = const ArenaComandaItem(
        id: 'i1',
        productId: 'p1',
        productName: 'Agua',
        quantity: 2,
        unitPriceCents: 500,
        lineTotalCents: 1000,
        source: ArenaComandaItemSource.counter,
        addedByName: 'Gestor',
        addedByUid: 'u1',
      );
      expect(
        canReverseComandaItem(
          comanda(itemsTotalCents: 1000, totalCents: 7000),
          item,
        ),
        isTrue,
      );
    });

    test('blocks reverse when paid amount exceeds new total', () {
      final item = const ArenaComandaItem(
        id: 'i1',
        productId: 'p1',
        productName: 'Agua',
        quantity: 1,
        unitPriceCents: 500,
        lineTotalCents: 500,
        source: ArenaComandaItemSource.counter,
        addedByName: 'Gestor',
        addedByUid: 'u1',
      );
      expect(
        comandaItemReverseBlockReason(
          comanda(
            itemsTotalCents: 1000,
            paidCents: 7000,
            totalCents: 7000,
          ),
          item,
        ),
        isNotNull,
      );
    });

    test('blocks reverse on closed comanda', () {
      final item = const ArenaComandaItem(
        id: 'i1',
        productId: 'p1',
        productName: 'Agua',
        quantity: 1,
        unitPriceCents: 500,
        lineTotalCents: 500,
        source: ArenaComandaItemSource.counter,
        addedByName: 'Gestor',
        addedByUid: 'u1',
      );
      expect(
        canReverseComandaItem(
          comanda(status: ArenaComandaStatus.closed),
          item,
        ),
        isFalse,
      );
    });
  });
}
