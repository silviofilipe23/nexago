import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_cancellation_policy.dart';
import 'package:nexago_app/features/arenas/domain/athlete_cancel_policy.dart';

void main() {
  final start = DateTime(2026, 5, 22, 9, 0);

  group('canCancelBookingForFree', () {
    test('true when more than 6 hours before start', () {
      final now = start.subtract(const Duration(hours: 7));
      expect(
        ArenaBookingCancellationPolicy.canCancelBookingForFree(start, now),
        isTrue,
      );
    });

    test('false exactly 6 hours before start', () {
      final now = start.subtract(const Duration(hours: 6));
      expect(
        ArenaBookingCancellationPolicy.canCancelBookingForFree(start, now),
        isFalse,
      );
    });

    test('false when 5h59 before start', () {
      final now = start.subtract(const Duration(hours: 5, minutes: 59));
      expect(
        ArenaBookingCancellationPolicy.canCancelBookingForFree(start, now),
        isFalse,
      );
    });

    test('false after start', () {
      final now = start.add(const Duration(minutes: 1));
      expect(
        ArenaBookingCancellationPolicy.canCancelBookingForFree(start, now),
        isFalse,
      );
    });
  });

  group('athleteCancellation — regra única dos dois caminhos', () {
    AthleteBookingCancellation at(
      Duration beforeStart, {
      String status = 'active',
      bool isRecurring = false,
      bool isGuest = false,
    }) {
      return ArenaBookingCancellationPolicy.athleteCancellation(
        bookingStart: start,
        now: start.subtract(beforeStart),
        rawStatus: status,
        isRecurring: isRecurring,
        isGuest: isGuest,
      );
    }

    test('allowed com mais de 6h de antecedência', () {
      expect(at(const Duration(hours: 7)), AthleteBookingCancellation.allowed);
      expect(
        at(const Duration(hours: 6, minutes: 1)),
        AthleteBookingCancellation.allowed,
      );
    });

    test('deadlinePassed de 6h antes até o início', () {
      expect(
        at(const Duration(hours: 6)),
        AthleteBookingCancellation.deadlinePassed,
      );
      expect(
        at(const Duration(hours: 2)),
        AthleteBookingCancellation.deadlinePassed,
      );
      expect(
        at(const Duration(minutes: 1)),
        AthleteBookingCancellation.deadlinePassed,
      );
    });

    test('unavailable quando a reserva já começou ou passou', () {
      expect(at(Duration.zero), AthleteBookingCancellation.unavailable);
      expect(
        at(const Duration(hours: -3)),
        AthleteBookingCancellation.unavailable,
      );
    });

    test('unavailable para reserva que já não vale', () {
      for (final status in ['canceled', 'cancelled', 'expired', 'rejected']) {
        expect(
          at(const Duration(days: 2), status: status),
          AthleteBookingCancellation.unavailable,
          reason: status,
        );
      }
      expect(
        at(const Duration(days: 2), status: ' Canceled '),
        AthleteBookingCancellation.unavailable,
      );
    });

    test('unavailable para horário fixo e para convidado, mesmo no prazo', () {
      expect(
        at(const Duration(days: 2), isRecurring: true),
        AthleteBookingCancellation.unavailable,
      );
      expect(
        at(const Duration(days: 2), isGuest: true),
        AthleteBookingCancellation.unavailable,
      );
    });

    test('pending_payment segue o mesmo prazo', () {
      expect(
        at(const Duration(days: 2), status: 'pending_payment'),
        AthleteBookingCancellation.allowed,
      );
      expect(
        at(const Duration(hours: 1), status: 'pending_payment'),
        AthleteBookingCancellation.deadlinePassed,
      );
    });

    test('unavailable sem início conhecido', () {
      expect(
        ArenaBookingCancellationPolicy.athleteCancellation(
          bookingStart: null,
          now: start,
          rawStatus: 'active',
        ),
        AthleteBookingCancellation.unavailable,
      );
    });
  });

  group('textos', () {
    final half =
        AthleteCancelPolicy.fromRaw({'mode': 'refund', 'refundPercent': 50});
    final credit = AthleteCancelPolicy.fromRaw({'mode': 'credit'});

    test('confirmação segue a política da reserva', () {
      expect(
        ArenaBookingCancellationPolicy.confirmCancellationMessage('Arena Sol'),
        'Cancelamento grátis até 6h antes do horário: o valor pago pelo app '
        'volta inteiro, pelo mesmo meio (Pix ou cartão).',
      );
      expect(
        ArenaBookingCancellationPolicy.confirmCancellationMessage(
          'Arena Sol',
          policy: half,
        ),
        'Cancelamento até 6h antes do horário: 50% do valor pago volta pelo '
        'mesmo meio (Pix ou cartão); a Arena Sol fica com o resto.',
      );
      expect(
        ArenaBookingCancellationPolicy.confirmCancellationMessage(
          'Arena Sol',
          policy: credit,
        ),
        'Cancelamento até 6h antes do horário: o valor pago vira crédito para '
        'usar em outra reserva na Arena Sol.',
      );
    });

    test('card da reserva: o que volta no prazo e que depois é com a arena',
        () {
      expect(
        ArenaBookingCancellationPolicy.cancellationSubtitle(
          'Arena Sol',
          credit,
        ),
        'O valor pago vira crédito para usar em outra reserva na Arena Sol. '
        'Depois disso, o cancelamento é combinado com a Arena Sol.',
      );
      expect(
        ArenaBookingCancellationPolicy.cancellationTitle(
            AthleteCancelPolicy.full),
        'Cancelamento grátis até 6h antes',
      );
    });

    test('aviso pós-cancelamento: estorno, crédito ou nada', () {
      expect(ArenaBookingCancellationPolicy.canceledMessage(0),
          'Reserva cancelada.');
      final text = ArenaBookingCancellationPolicy.canceledMessage(70);
      expect(text, contains('Estorno de R\$'));
      expect(text, contains('70,00'));
      final credited =
          ArenaBookingCancellationPolicy.canceledMessage(0, creditedReais: 70);
      expect(credited, contains('70,00'));
      expect(credited, contains('crédito'));
    });

    test('política: lê da reserva; sem cópia ou estranha vira integral', () {
      expect(AthleteCancelPolicy.fromBooking(null), AthleteCancelPolicy.full);
      expect(
          AthleteCancelPolicy.fromBooking({
            'cancelPolicy': {'mode': 'credit'}
          }),
          credit);
      expect(
        AthleteCancelPolicy.fromBooking({
          'cancelPolicy': {'mode': 'refund', 'refundPercent': 50},
        }),
        half,
      );
      expect(
        AthleteCancelPolicy.fromRaw({'mode': 'refund', 'refundPercent': 33}),
        AthleteCancelPolicy.full,
      );
      expect(half.partial, isTrue);
      expect(credit.partial, isFalse);
    });

    test('aviso de prazo encerrado manda falar com a arena', () {
      expect(
        ArenaBookingCancellationPolicy.blockedCancellationMessage(
          arenaName: 'Arena Sol',
        ),
        allOf(contains('6h antes'), contains('fale com Arena Sol')),
      );
      expect(
        ArenaBookingCancellationPolicy.blockedCancellationMessage(),
        contains('fale com a arena'),
      );
    });
  });
}
