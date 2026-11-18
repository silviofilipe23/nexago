import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_now.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

// Terça, 18/11/2026, 18:42 — a semana passada é 11/11.
final _now = DateTime(2026, 11, 18, 18, 42);
const _today = '2026-11-18';
const _lastWeek = '2026-11-11';

const _courts = [
  ArenaCourt(id: 'q1', name: 'Quadra 1'),
  ArenaCourt(id: 'q2', name: 'Quadra 2'),
];

ArenaManagerBooking _booking(
  String id, {
  String court = 'q1',
  String date = _today,
  required String start,
  required String end,
  Map<String, dynamic> data = const {},
}) {
  return ArenaManagerBooking(
    id: id,
    athleteId: 'u_$id',
    courtId: court,
    courtName: court,
    dateKey: date,
    startTime: start,
    endTime: end,
    data: {'status': 'confirmed', ...data},
  );
}

ArenaSlot _slot(String court, String start, String end, String status) {
  return ArenaSlot(
    id: '${court}_$start',
    arenaId: 'a1',
    courtId: court,
    date: DateTime(2026, 11, 18),
    startTime: start,
    endTime: end,
    rawStatus: status,
  );
}

ArenaComanda _comanda(String id, {required DateTime openedAt, int cents = 0}) {
  return ArenaComanda(
    id: id,
    arenaId: 'a1',
    displayNumber: 12,
    type: ArenaComandaType.individual,
    status: ArenaComandaStatus.open,
    customerName: 'Cliente',
    allowAppOrders: false,
    rentalCents: 0,
    itemsTotalCents: cents,
    totalCents: cents,
    itemsCount: 1,
    paidCents: 0,
    openedByUid: 'staff',
    openedAt: openedAt,
  );
}

ArenaNowSnapshot _build({
  List<ArenaManagerBooking> bookings = const [],
  List<ArenaSlot> slots = const [],
  List<ArenaCourt> courts = _courts,
  List<ArenaComanda> comandas = const [],
  int pendingReviews = 0,
}) {
  return buildArenaNowSnapshot(
    now: _now,
    bookings: bookings,
    todaySlots: slots,
    courts: courts,
    comandas: comandas,
    pendingReviews: pendingReviews,
  );
}

void main() {
  group('arenaNowMinutes', () {
    test('converte HH:MM em minutos do dia', () {
      expect(arenaNowMinutes('18:30'), 18 * 60 + 30);
    });

    test('00:00 no fim da reserva vale meia-noite', () {
      expect(arenaNowMinutes('00:00', isEnd: true), 24 * 60);
      expect(arenaNowMinutes('00:00'), 0);
    });

    test('devolve null para horário ilegível', () {
      expect(arenaNowMinutes('--:--'), isNull);
    });
  });

  group('quadras agora', () {
    test('reserva em andamento deixa a quadra em jogo com progresso', () {
      final snap = _build(
        bookings: [_booking('b1', start: '18:00', end: '19:00')],
      );
      final q1 = snap.courts.first;
      expect(q1.state, ArenaCourtNowState.inPlay);
      expect(q1.booking?.id, 'b1');
      expect(q1.until, '19:00');
      expect(q1.progress, closeTo(0.7, 0.001));
    });

    test('bloqueio de aula aparece como aula, não como jogo', () {
      final snap = _build(
        bookings: [
          _booking(
            'class_t1_2026-11-18',
            start: '18:00',
            end: '19:30',
            data: {'isClassSession': true},
          ),
        ],
      );
      expect(snap.courts.first.state, ArenaCourtNowState.classSession);
    });

    test('quadra livre diz até quando, pela próxima reserva', () {
      final snap = _build(
        bookings: [_booking('b2', court: 'q2', start: '20:00', end: '21:00')],
      );
      final q2 = snap.courts.last;
      expect(q2.state, ArenaCourtNowState.free);
      expect(q2.until, '20:00');
    });

    test('quadra livre sem nada mais no dia fica sem horário-limite', () {
      final snap = _build();
      expect(snap.courts.last.until, isNull);
    });

    test('horário bloqueado na grade deixa a quadra bloqueada', () {
      final snap = _build(slots: [_slot('q2', '18:00', '19:00', 'blocked')]);
      expect(snap.courts.last.state, ArenaCourtNowState.blocked);
    });

    test('quadra em manutenção aparece bloqueada', () {
      final snap = _build(
        courts: const [
          ArenaCourt(
            id: 'q1',
            name: 'Quadra 1',
            status: ArenaCourtStatus.maintenance,
          ),
        ],
      );
      expect(snap.courts.single.state, ArenaCourtNowState.blocked);
    });

    test('reserva cancelada ou expirada não ocupa a quadra', () {
      final snap = _build(
        bookings: [
          _booking(
            'b1',
            start: '18:00',
            end: '19:00',
            data: {'status': 'cancelled'},
          ),
          _booking(
            'b2',
            court: 'q2',
            start: '18:00',
            end: '19:00',
            data: {'status': 'expired'},
          ),
        ],
      );
      expect(
        snap.courts.map((c) => c.state),
        everyElement(ArenaCourtNowState.free),
      );
    });

    test('conta as quadras em uso', () {
      final snap = _build(
        bookings: [_booking('b1', start: '18:00', end: '19:00')],
      );
      expect(snap.courtsInUse, 1);
    });
  });

  group('próximo horário', () {
    test('é a primeira reserva que ainda não começou', () {
      final snap = _build(
        bookings: [
          _booking('em-jogo', start: '18:00', end: '19:00'),
          _booking('depois', court: 'q2', start: '20:00', end: '21:00'),
          _booking('logo', court: 'q2', start: '19:00', end: '20:00'),
        ],
      );
      expect(snap.nextBooking?.id, 'logo');
    });

    test('sem mais nada hoje, pega a de amanhã', () {
      final snap = _build(
        bookings: [
          _booking('amanha', date: '2026-11-19', start: '08:00', end: '09:00'),
        ],
      );
      expect(snap.nextBooking?.id, 'amanha');
    });

    test('ignora bloqueio de aula', () {
      final snap = _build(
        bookings: [
          _booking(
            'class_x',
            start: '19:00',
            end: '20:00',
            data: {'isClassSession': true},
          ),
        ],
      );
      expect(snap.nextBooking, isNull);
    });
  });

  group('precisa de você', () {
    test(
      'reserva que já começou sem check-in vira pendência com valor a receber',
      () {
        final snap = _build(
          bookings: [
            _booking(
              'b1',
              start: '18:00',
              end: '19:00',
              data: {'paymentChannel': 'onsite', 'amountReais': 120},
            ),
          ],
        );
        final task = snap.tasks.single;
        expect(task.kind, ArenaNowTaskKind.checkIn);
        expect(task.count, 1);
        expect(task.amountReais, 120);
        expect(task.booking?.id, 'b1');
      },
    );

    test('reserva que começa em até 10 minutos já entra como chegada', () {
      final snap = _build(
        bookings: [
          _booking('b1', start: '18:50', end: '19:50'),
          _booking('longe', court: 'q2', start: '19:30', end: '20:30'),
        ],
      );
      expect(snap.tasks.single.count, 1);
    });

    test('quem já fez check-in não aparece', () {
      final snap = _build(
        bookings: [
          _booking(
            'b1',
            start: '18:00',
            end: '19:00',
            data: {'attendanceStatus': 'checked_in'},
          ),
        ],
      );
      expect(snap.tasks, isEmpty);
    });

    test('comanda aberta há mais de 2h entra; a recente não', () {
      final snap = _build(
        comandas: [
          _comanda(
            'velha',
            openedAt: _now.subtract(const Duration(hours: 3)),
            cents: 8600,
          ),
          _comanda(
            'nova',
            openedAt: _now.subtract(const Duration(minutes: 30)),
          ),
        ],
      );
      final task = snap.tasks.single;
      expect(task.kind, ArenaNowTaskKind.openComanda);
      expect(task.count, 1);
      expect(task.amountReais, 86);
      expect(task.comanda?.id, 'velha');
    });

    test('avaliações sem resposta entram com a contagem', () {
      final snap = _build(pendingReviews: 3);
      expect(snap.tasks.single.kind, ArenaNowTaskKind.reviews);
      expect(snap.pendingCount, 3);
    });

    test('sem nada pendente, a caixa fica vazia', () {
      expect(_build().tasks, isEmpty);
    });
  });

  group('hoje até agora', () {
    test('compara receita e reservas com o mesmo dia da semana passada', () {
      final snap = _build(
        bookings: [
          _booking(
            'h1',
            start: '08:00',
            end: '09:00',
            data: {'amountReais': 100},
          ),
          _booking(
            'h2',
            start: '20:00',
            end: '21:00',
            data: {'amountReais': 50},
          ),
          _booking(
            's1',
            date: _lastWeek,
            start: '08:00',
            end: '09:00',
            data: {'amountReais': 100},
          ),
        ],
      );
      expect(snap.today.revenueReais, 150);
      expect(snap.today.lastWeekRevenueReais, 100);
      expect(snap.today.revenueChangePercent, closeTo(50, 0.001));
      expect(snap.today.bookingsChange, 1);
    });

    test('sem base na semana passada, não inventa variação', () {
      final snap = _build(
        bookings: [
          _booking(
            'h1',
            start: '08:00',
            end: '09:00',
            data: {'amountReais': 100},
          ),
        ],
      );
      expect(snap.today.revenueChangePercent, isNull);
    });

    test('pagamento recusado não conta como receita', () {
      final snap = _build(
        bookings: [
          _booking(
            'h1',
            start: '08:00',
            end: '09:00',
            data: {'amountReais': 100, 'paymentStatus': 'rejected'},
          ),
        ],
      );
      expect(snap.today.revenueReais, 0);
    });

    test('ocupação usa a grade de hoje sem contar horários bloqueados', () {
      final snap = _build(
        slots: [
          _slot('q1', '08:00', '09:00', 'booked'),
          _slot('q1', '09:00', '10:00', 'available'),
          _slot('q1', '10:00', '11:00', 'blocked'),
        ],
      );
      expect(snap.today.occupancyPercent, closeTo(50, 0.001));
    });

    test('sem grade, a ocupação fica sem valor', () {
      expect(_build().today.occupancyPercent, isNull);
    });
  });
}
