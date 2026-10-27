import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_cancellation_policy.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_guests_providers.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';
import 'package:nexago_app/features/arenas/presentation/my_bookings/my_bookings_logic.dart';

MyBookingItem _item({
  required String dateRaw,
  String startTime = '10:00',
  String rawStatus = 'active',
  String? recurringBookingId,
}) {
  return MyBookingItem(
    id: 'b-$dateRaw-$startTime',
    arenaName: 'Arena Test',
    dateRaw: dateRaw,
    startTime: startTime,
    endTime: '11:00',
    rawStatus: rawStatus,
    paymentDisplay: const MyBookingPaymentDisplay(label: 'Pagar na arena'),
    recurringBookingId: recurringBookingId,
  );
}

void main() {
  final now = DateTime(2026, 5, 21, 12);

  group('splitMyBookings', () {
    test('separa próximas e histórico por dia civil', () {
      final split = splitMyBookings([
        _item(dateRaw: '2026-05-20'),
        _item(dateRaw: '2026-05-21'),
        _item(dateRaw: '2026-05-24'),
      ], now: now);
      expect(split.history.length, 1);
      expect(split.upcoming.length, 2);
      expect(split.upcoming.first.dateRaw, '2026-05-21');
    });
  });

  group('myBookingCancellation', () {
    test('usa data + hora de início da reserva', () {
      expect(
        myBookingStartAt(_item(dateRaw: '2026-05-21', startTime: '19:30')),
        DateTime(2026, 5, 21, 19, 30),
      );
      expect(myBookingStartAt(_item(dateRaw: '', startTime: '19:30')), isNull);
    });

    test('libera no prazo e desliga a menos de 6h', () {
      expect(
        myBookingCancellation(
          _item(dateRaw: '2026-05-21', startTime: '19:00'),
          now,
        ),
        AthleteBookingCancellation.allowed,
      );
      expect(
        myBookingCancellation(
          _item(dateRaw: '2026-05-21', startTime: '17:00'),
          now,
        ),
        AthleteBookingCancellation.deadlinePassed,
      );
    });

    test('horário fixo e reserva cancelada não cancelam pelo app', () {
      expect(
        myBookingCancellation(
          _item(dateRaw: '2026-05-24', recurringBookingId: 'serie-1'),
          now,
        ),
        AthleteBookingCancellation.unavailable,
      );
      expect(
        myBookingCancellation(
          _item(dateRaw: '2026-05-24', rawStatus: 'canceled'),
          now,
        ),
        AthleteBookingCancellation.unavailable,
      );
    });
  });

  group('relativeBookingDayLabel', () {
    test('retorna HOJE e EM N DIAS', () {
      expect(relativeBookingDayLabel('2026-05-21', now: now), 'HOJE');
      expect(relativeBookingDayLabel('2026-05-25', now: now), 'EM 4 DIAS');
      expect(relativeBookingDayLabel('2026-05-22', now: now), 'AMANHÃ');
    });
  });

  group('consecutiveBookingWeeks', () {
    test('conta semanas consecutivas com reserva', () {
      final streak = consecutiveBookingWeeks([
        _item(dateRaw: '2026-05-21'),
        _item(dateRaw: '2026-05-14'),
        _item(dateRaw: '2026-05-07'),
      ], now: now);
      expect(streak, 3);
    });

    test('retorna 0 sem reservas', () {
      expect(consecutiveBookingWeeks([], now: now), 0);
    });
  });

  group('parseConfirmedAthletesFromBooking', () {
    test('lê guestAthleteId e nome do documento', () {
      final athletes = MyBookingItem.parseConfirmedAthletesFromBooking({
        'guestAthleteId': 'guest-1',
        'guestAthleteName': 'Enzo Ribeiro',
      });
      expect(athletes.length, 1);
      expect(athletes.first.userId, 'guest-1');
      expect(athletes.first.displayName, 'Enzo Ribeiro');
    });
  });

  group('shortAthleteName', () {
    test('formata nome curto com inicial do sobrenome', () {
      expect(shortAthleteName('Enzo Ribeiro'), 'Enzo R.');
    });
  });

  group('groupUpcomingByDate', () {
    test('agrupa por dateRaw', () {
      final grouped = groupUpcomingByDate([
        _item(dateRaw: '2026-05-24', startTime: '15:00'),
        _item(dateRaw: '2026-05-24', startTime: '11:00'),
      ]);
      expect(grouped.length, 1);
      expect(grouped['2026-05-24']!.first.startTime, '11:00');
    });
  });
}
