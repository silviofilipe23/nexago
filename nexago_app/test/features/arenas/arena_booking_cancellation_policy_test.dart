import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_cancellation_policy.dart';

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
    test('confirmação traz a política e não promete estorno', () {
      final text = ArenaBookingCancellationPolicy.confirmCancellationMessage(
        'Arena Sol',
      );
      expect(text, contains('6h antes'));
      expect(text, contains('Arena Sol'));
      expect(text, contains('50%'));
      expect(text.toLowerCase(), isNot(contains('estorn')));
      expect(text.toLowerCase(), isNot(contains('reembols')));
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
