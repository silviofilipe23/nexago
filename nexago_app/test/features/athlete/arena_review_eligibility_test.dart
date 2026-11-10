import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/athlete/domain/arena_review_eligibility.dart';

MyBookingItem _booking(
  String id, {
  String date = '2026-11-10',
  String start = '19:00',
  String end = '20:00',
  String status = 'active',
  String? arenaId = 'a1',
}) =>
    MyBookingItem(
      id: id,
      arenaId: arenaId,
      arenaName: 'Arena CFC',
      dateRaw: date,
      startTime: start,
      endTime: end,
      rawStatus: status,
      paymentDisplay: const MyBookingPaymentDisplay(label: 'PIX'),
    );

void main() {
  final now = DateTime(2026, 11, 10, 20, 10);

  group('arenaReviewEndsAt', () {
    test('soma um dia quando a reserva cruza a meia-noite', () {
      expect(
        arenaReviewEndsAt(
            dateRaw: '2026-11-10', startTime: '23:00', endTime: '01:00'),
        DateTime(2026, 11, 11, 1),
      );
    });

    test('null sem data utilizável', () {
      expect(
          arenaReviewEndsAt(dateRaw: '', startTime: '19:00', endTime: '20:00'),
          isNull);
    });
  });

  group('canOfferArenaReview', () {
    test('só 5 minutos depois do fim', () {
      expect(canOfferArenaReview(_booking('b'), now), isTrue);
      expect(canOfferArenaReview(_booking('b'), DateTime(2026, 11, 10, 20, 4)),
          isFalse);
    });

    test('cancelada nunca; concluída sempre', () {
      expect(
          canOfferArenaReview(_booking('b', status: 'canceled'), now), isFalse);
      expect(
        canOfferArenaReview(
            _booking('b', start: '21:00', end: '22:00', status: 'completed'),
            now),
        isTrue,
      );
    });

    test('sem arena não oferece (o envio falharia)', () {
      expect(canOfferArenaReview(_booking('b', arenaId: ''), now), isFalse);
    });
  });

  group('pickPendingArenaReview', () {
    test('escolhe a de fim mais recente, não a primeira da lista', () {
      final picked = pickPendingArenaReview(
        [
          _booking('antiga', date: '2026-11-01'),
          _booking('recente'),
          _booking('meio', date: '2026-11-08'),
        ],
        excludedBookingIds: const {},
        now: now,
      );
      expect(picked?.id, 'recente');
    });

    test('pula avaliadas/dispensadas e as de mais de 30 dias', () {
      final picked = pickPendingArenaReview(
        [_booking('feita'), _booking('velha', date: '2026-09-01')],
        excludedBookingIds: const {'feita'},
        now: now,
      );
      expect(picked, isNull);
    });
  });

  group('composeArenaReviewComment', () {
    test('destaques na primeira linha, texto embaixo', () {
      expect(
        composeArenaReviewComment(
            {'Vestiário', 'Atendimento'}, '  Ótimo jogo '),
        'Destaques: Atendimento, Vestiário\nÓtimo jogo',
      );
    });

    test('vazio vira null', () {
      expect(composeArenaReviewComment(const [], '   '), isNull);
    });
  });
}
