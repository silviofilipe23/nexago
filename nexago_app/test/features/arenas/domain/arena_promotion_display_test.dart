import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_promotion.dart';
import 'package:nexago_app/features/arenas/domain/arena_promotion_display.dart';

void main() {
  const promo = ArenaPromotion(
    id: 'p1',
    active: true,
    label: 'Tarde ociosa',
    courtIds: [],
    weekdays: [1, 2, 3, 4, 5],
    startTime: '14:00',
    endTime: '18:00',
    discountPercent: 20,
  );

  group('arenaPromotionStatusLabel', () {
    test('retorna Ativa quando active é true', () {
      expect(arenaPromotionStatusLabel(promo), 'Ativa');
    });

    test('retorna Pausada quando active é false', () {
      expect(
        arenaPromotionStatusLabel(
          const ArenaPromotion(
            id: 'p2',
            active: false,
            label: 'Teste',
            courtIds: [],
            weekdays: [1],
            startTime: '10:00',
            endTime: '12:00',
          ),
        ),
        'Pausada',
      );
    });
  });

  group('arenaPromotionDiscountLabel', () {
    test('formata desconto percentual', () {
      expect(arenaPromotionDiscountLabel(promo), '20% off');
    });

    test('formata preço fixo por hora', () {
      expect(
        arenaPromotionDiscountLabel(
          const ArenaPromotion(
            id: 'p3',
            active: true,
            label: 'Fixo',
            courtIds: [],
            weekdays: [6],
            startTime: '08:00',
            endTime: '10:00',
            fixedPricePerHourReais: 45,
          ),
        ),
        'R\$ 45/h',
      );
    });
  });

  group('arenaPromotionScheduleLabel', () {
    test('formata dias úteis e janela de horário', () {
      expect(arenaPromotionScheduleLabel(promo), 'Seg–Sex · 14:00–18:00');
    });

    test('formata todos os dias', () {
      expect(
        arenaPromotionScheduleLabel(
          const ArenaPromotion(
            id: 'p4',
            active: true,
            label: 'Geral',
            courtIds: [],
            weekdays: [1, 2, 3, 4, 5, 6, 7],
            startTime: '09:00',
            endTime: '11:00',
          ),
        ),
        'Todos os dias · 09:00–11:00',
      );
    });
  });

  group('arenaPromotionSummaryLabel', () {
    test('combina horário e desconto', () {
      expect(
        arenaPromotionSummaryLabel(promo),
        'Seg–Sex · 14:00–18:00 · 20% off',
      );
    });
  });
}
