import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';
import 'package:nexago_app/features/arenas/domain/pending_pix_booking_match.dart';

void main() {
  final args = ArenaBookingConfirmArgs(
    arenaId: 'arena1',
    arenaName: 'Arena',
    courtId: 'court1',
    courtName: 'Quadra 1',
    date: DateTime(2026, 5, 21),
    startTime: '18:00',
    endTime: '19:00',
    amountReais: 52.5,
  );

  group('PendingPixBookingMatch', () {
    test('matches same slot and pending PIX', () {
      final data = <String, dynamic>{
        'arenaId': 'arena1',
        'courtId': 'court1',
        'date': '2026-05-21',
        'startTime': '18:00',
        'endTime': '19:00',
        'status': 'pending_payment',
        'paymentStatus': 'pending',
        'paymentChannel': 'pix',
        'paymentExpiresAt': DateTime.now()
            .add(const Duration(minutes: 4))
            .toIso8601String(),
      };

      expect(PendingPixBookingMatch.matchesConfirmArgs(data, args), isTrue);
      expect(PendingPixBookingMatch.isResumablePendingPix(data), isTrue);
    });

    test('rejects expired pending PIX', () {
      final data = <String, dynamic>{
        'status': 'pending_payment',
        'paymentStatus': 'pending',
        'paymentChannel': 'pix',
        'paymentExpiresAt': DateTime.now()
            .subtract(const Duration(minutes: 1))
            .toIso8601String(),
      };

      expect(PendingPixBookingMatch.isResumablePendingPix(data), isFalse);
    });

    test('rejects different court', () {
      final data = <String, dynamic>{
        'arenaId': 'arena1',
        'courtId': 'other',
        'date': '2026-05-21',
        'startTime': '18:00',
        'endTime': '19:00',
        'status': 'pending_payment',
        'paymentChannel': 'pix',
      };

      expect(PendingPixBookingMatch.matchesConfirmArgs(data, args), isFalse);
    });
  });

  group('PendingPixBookingMatch — arena "a arena define a quadra"', () {
    final capacityArgs = ArenaBookingConfirmArgs(
      arenaId: 'arena1',
      arenaName: 'Arena',
      courtId: '',
      courtName: '',
      date: DateTime(2026, 5, 21),
      startTime: '18:00',
      endTime: '19:00',
      amountReais: 120,
      capacity: true,
      sport: 'beachTennis',
    );
    Map<String, dynamic> pending(Map<String, dynamic> extra) => {
          'arenaId': 'arena1',
          'courtId': 'court7',
          'date': '2026-05-21',
          'startTime': '18:00',
          'endTime': '19:00',
          'sport': 'beachTennis',
          'allocationStatus': 'unassigned',
          ...extra,
        };

    test('casa a pendente sem quadra definida do mesmo esporte e horário, seja qual for a provisória', () {
      expect(PendingPixBookingMatch.matchesConfirmArgs(pending({}), capacityArgs), isTrue);
    });

    test('outro esporte ou reserva com quadra escolhida não casam', () {
      expect(PendingPixBookingMatch.matchesConfirmArgs(pending({'sport': 'footvolley'}), capacityArgs), isFalse);
      expect(
        PendingPixBookingMatch.matchesConfirmArgs(pending({'allocationStatus': 'assigned'}), capacityArgs),
        isFalse,
      );
    });
  });
}
