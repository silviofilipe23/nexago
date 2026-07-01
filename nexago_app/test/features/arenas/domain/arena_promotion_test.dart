import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_promotion.dart';

void main() {
  const promoAllCourts = ArenaPromotion(
    id: 'p1',
    active: true,
    label: 'Tarde ociosa',
    courtIds: [],
    weekdays: [1, 2, 3, 4, 5],
    startTime: '14:00',
    endTime: '18:00',
    discountPercent: 20,
  );

  const promoLimitedCourts = ArenaPromotion(
    id: 'p2',
    active: false,
    label: 'Quadra 1',
    courtIds: ['court-a', 'court-b'],
    weekdays: [6, 7],
    startTime: '09:00',
    endTime: '12:00',
    discountPercent: 15,
  );

  group('toFirestoreUpdate', () {
    test('não inclui createdAt e inclui campos editáveis', () {
      final data = promoAllCourts.toFirestoreUpdate();

      expect(data.containsKey('createdAt'), isFalse);
      expect(data['label'], 'Tarde ociosa');
      expect(data['startTime'], '14:00');
      expect(data['endTime'], '18:00');
      expect(data['weekdays'], [1, 2, 3, 4, 5]);
      expect(data['discountPercent'], 20);
      expect(data['updatedAt'], isA<FieldValue>());
    });

    test('courtIds vazio remove campo no Firestore', () {
      final data = promoAllCourts.toFirestoreUpdate();

      expect(data['courtIds'], isA<FieldValue>());
    });

    test('courtIds preenchido preserva array', () {
      final data = promoLimitedCourts.toFirestoreUpdate();

      expect(data['courtIds'], ['court-a', 'court-b']);
    });

    test('não altera active no mapa de update', () {
      final data = promoLimitedCourts.toFirestoreUpdate();

      expect(data.containsKey('active'), isFalse);
    });
  });
}
