import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_day_timeline.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_tasks.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_waitlist_entry.dart';

final _now = DateTime(2026, 11, 18, 18, 40);
const _today = '2026-11-18';

ArenaManagerBooking _b(
  String id, {
  String start = '19:00',
  String end = '20:00',
  String court = 'q1',
  String dateKey = _today,
  Map<String, dynamic> data = const {},
}) =>
    ArenaManagerBooking(
      id: id,
      athleteId: 'ath-$id',
      courtId: court,
      courtName: 'Quadra 1',
      dateKey: dateKey,
      startTime: start,
      endTime: end,
      data: {'status': 'active', 'athleteId': 'ath-$id', ...data},
    );

ArenaBookingWaitlistEntry _wait(
  String id,
  ArenaBookingWaitlistStatus status, {
  String start = '21:00',
}) =>
    ArenaBookingWaitlistEntry(
      id: id,
      arenaId: 'a1',
      courtId: 'q1',
      dateKey: _today,
      startTime: start,
      endTime: '22:00',
      athleteId: 'w-$id',
      status: status,
    );

ArenaComanda _comanda(String bookingId) => ArenaComanda(
      id: 'c-$bookingId',
      arenaId: 'a1',
      displayNumber: 1,
      type: ArenaComandaType.individual,
      status: ArenaComandaStatus.open,
      customerName: '',
      allowAppOrders: false,
      rentalCents: 0,
      itemsTotalCents: 0,
      totalCents: 0,
      itemsCount: 0,
      paidCents: 0,
      openedByUid: 'u',
      bookingId: bookingId,
    );

const _deposit = {
  'paymentChannel': 'pix',
  'paymentStatus': 'partial',
  'amountReais': 160,
  'amountPaidOnlineReais': 80,
};

List<ArenaBookingTask> _tasks(
  List<ArenaManagerBooking> bookings, {
  List<ArenaBookingWaitlistEntry> waitlist = const [],
  List<ArenaComanda>? comandas = const [],
}) =>
    buildArenaBookingsTasks(
      bookings: bookings,
      waitlist: waitlist,
      comandas: comandas,
      now: _now,
    );

void main() {
  group('check-in atrasado', () {
    test('entra a partir de 5 min sem check-in', () {
      final tasks = _tasks([
        _b('atrasado', start: '18:30', end: '19:30'),
        _b('quase', start: '18:37', end: '19:37'),
        _b('feito',
            start: '18:00',
            end: '19:30',
            data: {'attendanceStatus': 'checked_in'}),
        _b('acabou', start: '17:00', end: '18:00'),
      ]);
      expect(tasks.length, 1);
      final late = tasks.single as ArenaLateCheckInTask;
      expect(late.booking.id, 'atrasado');
      expect(late.minutesLate, 10);
    });

    test('aula não pede check-in', () {
      expect(
        _tasks([
          _b('class_t1',
              start: '18:00', end: '19:30', data: {'isClassSession': true}),
        ]),
        isEmpty,
      );
    });
  });

  group('saldo a cobrar', () {
    test('reserva começando em até 30 min, sem comanda ligada', () {
      final tasks = _tasks([
        _b('logo', start: '19:00', data: _deposit),
        _b('tarde', start: '21:00', data: _deposit),
      ]);
      final due = tasks.whereType<ArenaDueBalanceTask>().single;
      expect(due.booking.id, 'logo');
      expect(due.dueReais, 80);
    });

    test('com comanda ligada, o saldo já está no balcão', () {
      expect(
        _tasks(
          [_b('logo', start: '19:00', data: _deposit)],
          comandas: [_comanda('logo')],
        ).whereType<ArenaDueBalanceTask>(),
        isEmpty,
      );
    });

    test('quem não lê comandas não vê a pendência', () {
      expect(
        _tasks([_b('logo', start: '19:00', data: _deposit)], comandas: null)
            .whereType<ArenaDueBalanceTask>(),
        isEmpty,
      );
    });
  });

  group('cancelado com fila', () {
    test('conta a fila ativa e sabe se o primeiro já foi avisado', () {
      final tasks = _tasks(
        [
          _b('cancelada',
              start: '21:00', end: '22:00', data: {'status': 'cancelled'})
        ],
        waitlist: [
          _wait('1', ArenaBookingWaitlistStatus.notified),
          _wait('2', ArenaBookingWaitlistStatus.waiting),
          _wait('3', ArenaBookingWaitlistStatus.expired),
          _wait('4', ArenaBookingWaitlistStatus.waiting, start: '20:00'),
        ],
      );
      final t = tasks.single as ArenaCanceledWithWaitlistTask;
      expect(t.waiting, 2);
      expect(t.notified, isTrue);
    });

    test('sem fila ou horário que já passou não entra', () {
      expect(
        _tasks([
          _b('c', start: '21:00', data: {'status': 'cancelled'})
        ]),
        isEmpty,
      );
      expect(
        _tasks(
          [
            _b('c', start: '17:00', end: '18:00', data: {'status': 'canceled'})
          ],
          waitlist: [
            _wait('1', ArenaBookingWaitlistStatus.waiting, start: '17:00')
          ],
        ),
        isEmpty,
      );
    });
  });

  test('ordem: atrasado, saldo, cancelado', () {
    final tasks = _tasks(
      [
        _b('c', start: '21:00', end: '22:00', data: {'status': 'cancelled'}),
        _b('logo', start: '19:00', data: _deposit),
        _b('atrasado', start: '18:30', end: '19:30'),
      ],
      waitlist: [_wait('1', ArenaBookingWaitlistStatus.waiting)],
    );
    expect(tasks.map((t) => t.runtimeType), [
      ArenaLateCheckInTask,
      ArenaDueBalanceTask,
      ArenaCanceledWithWaitlistTask,
    ]);
  });

  group('canceladas na linha do dia', () {
    test('vão para o fim, com vaga liberada só no futuro', () {
      final entries = buildArenaDayTimeline(
        bookings: [_b('ativa', start: '20:00', end: '21:00')],
        dateKey: _today,
        now: _now,
        canceled: [
          _b('passou',
              start: '17:00', end: '18:00', data: {'status': 'cancelled'}),
          _b('futura',
              start: '21:00', end: '22:00', data: {'status': 'cancelled'}),
        ],
      );
      expect(entries.last, isA<ArenaTimelineCanceledEntry>());
      final canceled = entries.whereType<ArenaTimelineCanceledEntry>().toList();
      expect(canceled.map((c) => c.booking.id), ['passou', 'futura']);
      expect(canceled.map((c) => c.slotFreed), [false, true]);
    });

    test('arenaCanceledOfDay pega só as canceladas do dia', () {
      final list = arenaCanceledOfDay(
        [
          _b('a', data: {'status': 'cancelled'}),
          _b('b'),
          _b('c', dateKey: '2026-11-19', data: {'status': 'canceled'}),
        ],
        _today,
      );
      expect(list.map((b) => b.id), ['a']);
    });
  });
}
