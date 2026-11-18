import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_day_timeline.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_journey.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda.dart';

// Quarta, 18/11, 17:42 — reserva das 17:00 às 18:00 em quadra.
final _now = DateTime(2026, 11, 18, 17, 42);
const _today = '2026-11-18';

ArenaManagerBooking _b({
  String athleteId = 'ath1',
  String dateKey = _today,
  String start = '17:00',
  String end = '18:00',
  Map<String, dynamic> data = const {},
}) =>
    ArenaManagerBooking(
      id: 'b1',
      athleteId: athleteId,
      courtId: 'c1',
      courtName: 'Quadra 1',
      dateKey: dateKey,
      startTime: start,
      endTime: end,
      data: {
        'status': 'active',
        'paymentChannel': 'onsite',
        'amountReais': 80,
        ...data,
      },
    );

ArenaComanda _comanda({
  int rental = 8000,
  int items = 0,
  int count = 0,
  int paid = 0,
  ArenaComandaStatus status = ArenaComandaStatus.open,
}) =>
    ArenaComanda(
      id: 'cmd1',
      arenaId: 'a1',
      displayNumber: 3,
      type: ArenaComandaType.individual,
      status: status,
      customerName: 'Rafael',
      allowAppOrders: false,
      rentalCents: rental,
      itemsTotalCents: items,
      totalCents: rental + items,
      itemsCount: count,
      paidCents: paid,
      openedByUid: 'gestor',
      bookingId: 'b1',
    );

ArenaJourneyStep _step(ArenaBookingJourney j, ArenaJourneyStepKind kind) =>
    j.steps.firstWhere((s) => s.kind == kind);

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  group('arenaBookingMomentAt', () {
    test('reserva em quadra: ao vivo, 70% e 18 min restantes', () {
      final m = arenaBookingMomentAt(_b(), _now);
      expect(m.phase, ArenaTimelinePhase.live);
      expect(m.minutesLeft, 18);
      expect(m.progress, closeTo(0.7, 0.001));
    });

    test('dia seguinte: por vir; dia anterior: concluída', () {
      expect(
        arenaBookingMomentAt(_b(dateKey: '2026-11-19'), _now).phase,
        ArenaTimelinePhase.upcoming,
      );
      expect(
        arenaBookingMomentAt(_b(dateKey: '2026-11-17'), _now).phase,
        ArenaTimelinePhase.done,
      );
    });
  });

  group('arenaBookingCheckInBlockReason', () {
    test('reserva sem atleta explica por que o check-in não funciona', () {
      final reason = arenaBookingCheckInBlockReason(
        _b(athleteId: '', data: {'customerName': 'Carlos Mensalista'}),
        now: _now,
      );
      expect(reason, contains('Carlos Mensalista'));
      expect(reason, contains('atleta do app'));
    });

    test('sem atleta e sem nome: ainda explica', () {
      final reason = arenaBookingCheckInBlockReason(
        _b(athleteId: ''),
        now: _now,
      );
      expect(reason, contains('sem atleta'));
    });

    test('antes da janela diz a hora em que o check-in abre', () {
      final reason = arenaBookingCheckInBlockReason(
        _b(start: '20:00', end: '21:00'),
        now: _now,
      );
      expect(reason, 'O check-in abre às 19:40 (20 min antes do horário).');
    });

    test('depois da janela diz que o prazo acabou', () {
      final reason = arenaBookingCheckInBlockReason(
        _b(start: '15:00', end: '16:00'),
        now: _now,
      );
      expect(reason, 'O prazo do check-in terminou às 16:15.');
    });

    test('dentro da janela: liberado', () {
      expect(arenaBookingCheckInBlockReason(_b(), now: _now), isNull);
    });
  });

  group('arenaBookingBill', () {
    test('pagamento na arena sem comanda: falta a hora inteira', () {
      final bill = arenaBookingBill(_b());
      expect(bill.hourReais, 80);
      expect(bill.consumptionReais, 0);
      expect(bill.dueReais, 80);
      expect(bill.isSettled, isFalse);
    });

    test('junta hora e consumo da comanda num total só', () {
      final bill = arenaBookingBill(
        _b(),
        comanda: _comanda(items: 2400, count: 3),
      );
      expect(bill.totalReais, 104);
      expect(bill.consumptionCount, 3);
      expect(bill.dueReais, 104);
    });

    test('o que a comanda já recebeu sai do que falta', () {
      final bill = arenaBookingBill(
        _b(),
        comanda: _comanda(items: 2400, paid: 10400),
      );
      expect(bill.paidAtArenaReais, 104);
      expect(bill.dueReais, 0);
      expect(bill.isSettled, isTrue);
    });

    test('sinal PIX pago: falta só o restante (mais o consumo)', () {
      final bill = arenaBookingBill(
        _b(data: {
          'paymentChannel': 'pix',
          'paymentStatus': 'partial',
          'amountReais': 120,
          'amountPaidOnlineReais': 40,
        }),
        comanda: _comanda(rental: 12000, items: 1000),
      );
      expect(bill.paidOnlineReais, 40);
      expect(bill.dueReais, 90);
    });

    test('PIX integral: nada a receber e quitada', () {
      final bill = arenaBookingBill(_b(data: {
        'paymentChannel': 'pix',
        'paymentStatus': 'paid',
        'amountPaidOnlineReais': 80,
      }));
      expect(bill.dueReais, 0);
      expect(bill.isSettled, isTrue);
    });
  });

  group('buildArenaBookingJourney', () {
    test('em quadra sem check-in: chegada é a etapa atual', () {
      final j = buildArenaBookingJourney(_b(), now: _now);
      expect(j.steps.map((s) => s.kind), ArenaJourneyStepKind.values);
      expect(_step(j, ArenaJourneyStepKind.booked).status,
          ArenaJourneyStepStatus.done);
      final arrival = _step(j, ArenaJourneyStepKind.arrival);
      expect(arrival.status, ArenaJourneyStepStatus.current);
      expect(arrival.subtitle, 'Atrasado · 42 min');
      expect(j.canCheckIn, isTrue);
      expect(j.doneCount, 1);
    });

    test('check-in feito e sem nada a receber: chegada e pago concluídos', () {
      final j = buildArenaBookingJourney(
        _b(data: {
          'attendanceStatus': 'checked_in',
          'paymentChannel': 'pix',
          'paymentStatus': 'paid',
        }),
        now: _now,
      );
      expect(_step(j, ArenaJourneyStepKind.arrival).status,
          ArenaJourneyStepStatus.done);
      final pay = _step(j, ArenaJourneyStepKind.payment);
      expect(pay.status, ArenaJourneyStepStatus.done);
      expect(pay.subtitle, 'Pago online');
      expect(j.canCheckIn, isFalse);
      expect(j.doneCount, 3);
    });

    test('pagamento pendente mostra quanto falta', () {
      final j = buildArenaBookingJourney(
        _b(),
        now: _now,
        comanda: _comanda(items: 2400),
      );
      final pay = _step(j, ArenaJourneyStepKind.payment);
      expect(pay.status, ArenaJourneyStepStatus.current);
      expect(pay.subtitle, contains('104,00'));
      expect(j.canReceive, isTrue);
    });

    test('não compareceu vira problema na chegada', () {
      final j = buildArenaBookingJourney(
        _b(data: {'attendanceStatus': 'no_show'}),
        now: _now,
      );
      final arrival = _step(j, ArenaJourneyStepKind.arrival);
      expect(arrival.status, ArenaJourneyStepStatus.problem);
      expect(arrival.subtitle, 'Não compareceu');
      expect(j.canCheckIn, isFalse);
    });

    test('horário passado: encerrada', () {
      final j = buildArenaBookingJourney(
        _b(start: '15:00', end: '16:00'),
        now: _now,
      );
      final closed = _step(j, ArenaJourneyStepKind.closed);
      expect(closed.status, ArenaJourneyStepStatus.done);
      expect(closed.subtitle, 'Encerrou às 16:00');
      expect(
        _step(j, ArenaJourneyStepKind.arrival).subtitle,
        'Sem check-in',
      );
    });

    test('em quadra: encerra sozinha no fim do horário', () {
      final closed = _step(buildArenaBookingJourney(_b(), now: _now),
          ArenaJourneyStepKind.closed);
      expect(closed.status, ArenaJourneyStepStatus.upcoming);
      expect(closed.subtitle, 'Termina às 18:00');
    });

    test('reserva sem atleta: chegada traz o motivo do check-in bloqueado', () {
      final j = buildArenaBookingJourney(
        _b(athleteId: '', data: {'customerName': 'Carlos'}),
        now: _now,
      );
      expect(j.canCheckIn, isFalse);
      expect(j.checkInBlockReason, contains('Carlos'));
      expect(j.showsCheckIn, isTrue);
    });

    test('cancelada: sem ações e encerrada como problema', () {
      final j = buildArenaBookingJourney(
        _b(data: {'status': 'canceled'}),
        now: _now,
      );
      expect(j.isCanceled, isTrue);
      expect(j.showsCheckIn, isFalse);
      expect(j.canReceive, isFalse);
      expect(_step(j, ArenaJourneyStepKind.closed).status,
          ArenaJourneyStepStatus.problem);
    });

    test('começa mais tarde hoje: minutos até o início', () {
      final j = buildArenaBookingJourney(
        _b(start: '18:30', end: '19:30'),
        now: _now,
      );
      expect(j.moment.phase, ArenaTimelinePhase.upcoming);
      expect(j.minutesUntilStart, 48);
    });
  });
}
