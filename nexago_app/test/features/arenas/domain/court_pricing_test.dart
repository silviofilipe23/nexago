import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_promotion.dart';
import 'package:nexago_app/features/arenas/domain/court_pricing.dart';

void main() {
  final monday = DateTime(2026, 5, 18); // segunda

  group('CourtPricing.resolveHourlyBase', () {
    test('prefers court price over arena fallback', () {
      const court = ArenaCourt(
        id: 'c1',
        name: 'Q1',
        basePricePerHourReais: 80,
      );
      expect(
        CourtPricing.resolveHourlyBase(
          court: court,
          arenaFallbackPerHourReais: 60,
        ),
        80,
      );
    });

    test('uses arena fallback when court has no price', () {
      const court = ArenaCourt(id: 'c1', name: 'Q1');
      expect(
        CourtPricing.resolveHourlyBase(
          court: court,
          arenaFallbackPerHourReais: 60,
        ),
        60,
      );
    });

    test('returns null when no valid price', () {
      expect(
        CourtPricing.resolveHourlyBase(
          court: const ArenaCourt(id: 'c1', name: 'Q1'),
        ),
        isNull,
      );
    });
  });

  group('CourtPricing.resolveSlotPrice', () {
    test('prorates 30 min slot to half hourly base', () {
      expect(
        CourtPricing.resolveSlotPrice(
          hourlyBaseReais: 60,
          slotDurationMinutes: 30,
        ),
        30,
      );
    });
  });

  group('CourtPricing.applyPromotions', () {
    final input = SlotPricingInput(
      arenaId: 'arena1',
      courtId: 'c1',
      date: monday,
      startTime: '14:00',
      durationMinutes: 60,
      hourlyBaseReais: 100,
    );

    test('applies discountPercent in valid window', () {
      const promo = ArenaPromotion(
        id: 'p1',
        active: true,
        label: 'Tarde',
        courtIds: [],
        weekdays: [1],
        startTime: '13:00',
        endTime: '17:00',
        discountPercent: 20,
      );
      final result = CourtPricing.applyPromotions(input, 100, [promo]);
      expect(result.finalSlotPriceReais, 80);
      expect(result.appliedPromotionId, 'p1');
    });

    test('applies fixedPricePerHourReais', () {
      const promo = ArenaPromotion(
        id: 'p2',
        active: true,
        label: 'Fixo',
        courtIds: ['c1'],
        weekdays: [],
        startTime: '00:00',
        endTime: '23:59',
        fixedPricePerHourReais: 50,
      );
      final result = CourtPricing.applyPromotions(input, 100, [promo]);
      expect(result.finalSlotPriceReais, 50);
      expect(result.appliedPromotionId, 'p2');
    });

    test('ignores promo outside weekday', () {
      const promo = ArenaPromotion(
        id: 'p3',
        active: true,
        label: 'Dom',
        courtIds: [],
        weekdays: [7],
        startTime: '00:00',
        endTime: '23:59',
        discountPercent: 50,
      );
      final result = CourtPricing.applyPromotions(input, 100, [promo]);
      expect(result.finalSlotPriceReais, 100);
      expect(result.appliedPromotionId, isNull);
    });

    test('picks lowest price among multiple promos', () {
      const promoA = ArenaPromotion(
        id: 'a',
        active: true,
        label: '10%',
        courtIds: [],
        weekdays: [],
        startTime: '00:00',
        endTime: '23:59',
        discountPercent: 10,
      );
      const promoB = ArenaPromotion(
        id: 'b',
        active: true,
        label: '30%',
        courtIds: [],
        weekdays: [],
        startTime: '00:00',
        endTime: '23:59',
        discountPercent: 30,
      );
      final result = CourtPricing.applyPromotions(input, 100, [promoA, promoB]);
      expect(result.finalSlotPriceReais, 70);
      expect(result.appliedPromotionId, 'b');
    });
  });
}
