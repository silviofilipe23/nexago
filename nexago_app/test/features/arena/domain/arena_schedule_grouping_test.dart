import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_grouping.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

ArenaSlot _slot({
  String id = 's1',
  String courtId = 'c1',
  String rawStatus = 'available',
  String startTime = '19:00',
  String endTime = '20:00',
  String? bookingId,
}) =>
    ArenaSlot(
      id: id,
      arenaId: 'a1',
      courtId: courtId,
      date: DateTime(2026, 7, 2),
      startTime: startTime,
      endTime: endTime,
      rawStatus: rawStatus,
      bookingId: bookingId,
    );

ArenaManagerBooking _booking({
  String id = 'b1',
  String athleteId = 'ath1',
  String courtId = 'c1',
  String dateKey = '2026-07-02',
  String startTime = '19:00',
  String endTime = '20:00',
  Map<String, dynamic> data = const {},
}) =>
    ArenaManagerBooking(
      id: id,
      athleteId: athleteId,
      courtId: courtId,
      courtName: 'Quadra 1',
      dateKey: dateKey,
      startTime: startTime,
      endTime: endTime,
      data: data,
    );

void main() {
  group('ArenaManagerBooking.isCanceled', () {
    test('true para "canceled" e "cancelled"', () {
      expect(_booking(data: {'status': 'canceled'}).isCanceled, isTrue);
      expect(_booking(data: {'status': 'cancelled'}).isCanceled, isTrue);
    });

    test('true com espaços e maiúsculas (" Canceled ", "CANCELLED")', () {
      expect(_booking(data: {'status': ' Canceled '}).isCanceled, isTrue);
      expect(_booking(data: {'status': 'CANCELLED'}).isCanceled, isTrue);
    });

    test('false para ativa, sem status ou status em branco', () {
      expect(_booking(data: {'status': 'active'}).isCanceled, isFalse);
      expect(_booking(data: {'status': 'confirmed'}).isCanceled, isFalse);
      expect(_booking(data: const {}).isCanceled, isFalse);
      expect(_booking(data: {'status': '   '}).isCanceled, isFalse);
    });
  });

  group('ArenaScheduleGrouping.applyBookingsOverlay — reservas canceladas', () {
    test('reserva com status "canceled" não pinta slot disponível como booked',
        () {
      final result = ArenaScheduleGrouping.applyBookingsOverlay(
        slots: [_slot()],
        bookings: [
          _booking(data: {'status': 'canceled'})
        ],
        dateKey: '2026-07-02',
      );

      expect(result.single.isAvailable, isTrue);
      expect(result.single.isBooked, isFalse);
      expect(result.single.bookingId, isNull);
    });

    test('reserva com status "cancelled" não pinta slot disponível como booked',
        () {
      final result = ArenaScheduleGrouping.applyBookingsOverlay(
        slots: [_slot()],
        bookings: [
          _booking(data: {'status': 'cancelled'})
        ],
        dateKey: '2026-07-02',
      );

      expect(result.single.isAvailable, isTrue);
      expect(result.single.bookingId, isNull);
    });

    test('status " Canceled " (espaços e maiúscula) também é ignorado', () {
      final result = ArenaScheduleGrouping.applyBookingsOverlay(
        slots: [_slot()],
        bookings: [
          _booking(data: {'status': ' Canceled '})
        ],
        dateKey: '2026-07-02',
      );

      expect(result.single.isAvailable, isTrue);
      expect(result.single.bookingId, isNull);
    });

    test('cancelada e ativa no mesmo horário: slot é pintado com a ativa', () {
      final result = ArenaScheduleGrouping.applyBookingsOverlay(
        slots: [_slot()],
        bookings: [
          _booking(id: 'bCanceled', data: {'status': 'canceled'}),
          _booking(id: 'bActive', data: {'status': 'active'}),
        ],
        dateKey: '2026-07-02',
      );

      expect(result.single.isBooked, isTrue);
      expect(result.single.bookingId, 'bActive');
    });
  });

  group('ArenaScheduleGrouping.applyBookingsOverlay — comportamento preservado',
      () {
    test('reserva ativa (status "active") pinta slot sobreposto como booked',
        () {
      final result = ArenaScheduleGrouping.applyBookingsOverlay(
        slots: [_slot(startTime: '19:00', endTime: '20:00')],
        bookings: [
          _booking(
            startTime: '19:30',
            endTime: '20:30',
            data: {'status': 'active'},
          ),
        ],
        dateKey: '2026-07-02',
      );

      expect(result.single.isBooked, isTrue);
      expect(result.single.bookingId, 'b1');
      expect(result.single.bookingAthleteId, 'ath1');
    });

    test('reserva sem status pinta slot sobreposto como booked', () {
      final result = ArenaScheduleGrouping.applyBookingsOverlay(
        slots: [_slot()],
        bookings: [_booking()],
        dateKey: '2026-07-02',
      );

      expect(result.single.isBooked, isTrue);
      expect(result.single.bookingId, 'b1');
    });

    test('slot já booked não é alterado pelo overlay', () {
      final booked = _slot(rawStatus: 'booked', bookingId: 'original');

      final result = ArenaScheduleGrouping.applyBookingsOverlay(
        slots: [booked],
        bookings: [
          _booking(id: 'outro', data: {'status': 'active'})
        ],
        dateKey: '2026-07-02',
      );

      expect(result.single, same(booked));
      expect(result.single.bookingId, 'original');
    });

    test('slot blocked não é alterado pelo overlay', () {
      final blocked = _slot(rawStatus: 'blocked');

      final result = ArenaScheduleGrouping.applyBookingsOverlay(
        slots: [blocked],
        bookings: [
          _booking(data: {'status': 'active'})
        ],
        dateKey: '2026-07-02',
      );

      expect(result.single, same(blocked));
      expect(result.single.isBlocked, isTrue);
      expect(result.single.bookingId, isNull);
    });
  });
}
