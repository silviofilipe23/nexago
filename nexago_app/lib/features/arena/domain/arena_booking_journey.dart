import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

import '../../../core/formatting/app_currency_format.dart';
import 'arena_booking_card_pills.dart';
import 'arena_booking_day_timeline.dart';
import 'arena_booking_labels.dart';
import 'arena_manager_booking.dart';
import 'arena_now.dart';
import 'comandas/arena_comanda.dart';

/// Etapas da reserva no detalhe do gestor, em ordem.
enum ArenaJourneyStepKind { booked, arrival, payment, closed }

/// Situação de uma etapa.
enum ArenaJourneyStepStatus { done, current, upcoming, problem }

/// Uma etapa da jornada: o que é, em que pé está e a linha de apoio.
@immutable
class ArenaJourneyStep {
  const ArenaJourneyStep({
    required this.kind,
    required this.status,
    required this.title,
    required this.subtitle,
  });

  final ArenaJourneyStepKind kind;
  final ArenaJourneyStepStatus status;
  final String title;
  final String subtitle;
}

/// Janela do check-in, igual à de `BookingService.checkIn`: de 20 min antes
/// do início até 15 min depois do fim.
const int arenaCheckInOpensBeforeMinutes = 20;
const int arenaCheckInClosesAfterMinutes = 15;

/// Abaixo disso o valor é arredondamento, não dívida.
const double _cents = 0.02;

/// Conta da quadra: a hora e a comanda num total só.
@immutable
class ArenaBookingBill {
  const ArenaBookingBill({
    required this.hourReais,
    required this.paidOnlineReais,
    required this.consumptionReais,
    required this.consumptionCount,
    required this.paidAtArenaReais,
    required this.dueReais,
    required this.hasComanda,
  });

  /// Valor da hora (`null` quando a reserva não tem preço).
  final double? hourReais;
  final double paidOnlineReais;
  final double consumptionReais;
  final int consumptionCount;

  /// O que a comanda ligada à reserva já recebeu no balcão.
  final double paidAtArenaReais;

  /// O que ainda falta receber na arena (hora + consumo).
  final double dueReais;
  final bool hasComanda;

  double get totalReais => (hourReais ?? 0) + consumptionReais;

  bool get hasDue => dueReais > _cents;

  /// Nada a receber e algo já foi pago (online ou no balcão).
  bool get isSettled => !hasDue && paidOnlineReais + paidAtArenaReais > _cents;
}

/// Monta a conta da quadra. O que falta da hora segue a regra do card da
/// lista ([arenaBookingDueReais]); a comanda soma o consumo e desconta o que
/// já foi recebido nela.
ArenaBookingBill arenaBookingBill(
  ArenaManagerBooking b, {
  ArenaComanda? comanda,
}) {
  final info = arenaBookingPaymentInfo(b.data);
  final consumption = (comanda?.itemsTotalCents ?? 0) / 100;
  final paidAtArena = (comanda?.paidCents ?? 0) / 100;
  final hourDue = arenaBookingDueReais(b) ?? 0;
  final due = hourDue + consumption - paidAtArena;
  return ArenaBookingBill(
    hourReais: info.totalReais,
    paidOnlineReais: info.paidOnlineReais ?? 0,
    consumptionReais: consumption,
    consumptionCount: comanda?.itemsCount ?? 0,
    paidAtArenaReais: paidAtArena,
    dueReais: due > _cents ? due : 0,
    hasComanda: comanda != null,
  );
}

/// Por que o check-in não pode ser feito agora — `null` quando pode.
///
/// O check-in grava em nome do atleta dono da reserva, então reserva de
/// balcão sem conta no app (só `customerName`) nunca tem check-in.
String? arenaBookingCheckInBlockReason(
  ArenaManagerBooking b, {
  required DateTime now,
}) {
  if (b.isCanceled) return 'Reserva cancelada não tem check-in.';
  if (b.athleteId.trim().isEmpty) {
    final name = b.customerName;
    return name != null
        ? 'Reserva no nome de $name, sem conta no nexaGO. O check-in só '
            'vale para atleta do app.'
        : 'Reserva sem atleta vinculado. O check-in só vale para atleta '
            'do app.';
  }
  final window = _bookingWindow(b);
  if (window == null) return null;
  final (start, end) = window;
  final opens =
      start.subtract(const Duration(minutes: arenaCheckInOpensBeforeMinutes));
  final closes =
      end.add(const Duration(minutes: arenaCheckInClosesAfterMinutes));
  if (now.isBefore(opens)) {
    return 'O check-in abre às ${_hhmm(opens)} '
        '($arenaCheckInOpensBeforeMinutes min antes do horário).';
  }
  if (now.isAfter(closes)) {
    return 'O prazo do check-in terminou às ${_hhmm(closes)}.';
  }
  return null;
}

/// Tudo o que o detalhe da reserva precisa para o anel, as etapas e a conta.
@immutable
class ArenaBookingJourney {
  const ArenaBookingJourney({
    required this.moment,
    required this.steps,
    required this.bill,
    required this.isCanceled,
    required this.showsCheckIn,
    required this.checkInBlockReason,
    required this.minutesUntilStart,
  });

  final ArenaTimelineBookingEntry moment;
  final List<ArenaJourneyStep> steps;
  final ArenaBookingBill bill;
  final bool isCanceled;

  /// A etapa de chegada ainda pede check-in (mesmo que bloqueado).
  final bool showsCheckIn;

  /// Motivo do check-in bloqueado, mostrado junto do botão.
  final String? checkInBlockReason;

  /// Minutos até começar (só hoje, antes do início).
  final int? minutesUntilStart;

  bool get canCheckIn => showsCheckIn && checkInBlockReason == null;
  bool get canReceive => !isCanceled && bill.hasDue;

  int get doneCount =>
      steps.where((s) => s.status == ArenaJourneyStepStatus.done).length;
}

/// Monta a jornada da reserva [b] no relógio [now]. Função pura.
ArenaBookingJourney buildArenaBookingJourney(
  ArenaManagerBooking b, {
  required DateTime now,
  ArenaComanda? comanda,
}) {
  final moment = arenaBookingMomentAt(b, now);
  final bill = arenaBookingBill(b, comanda: comanda);
  final showsCheckIn = !b.isCanceled &&
      moment.phase != ArenaTimelinePhase.done &&
      arenaBookingShowsCheckInAction(b.data);
  final start = arenaNowMinutes(b.startTime);
  final nowMin = now.hour * 60 + now.minute;
  final minutesUntilStart = moment.isToday &&
          moment.phase == ArenaTimelinePhase.upcoming &&
          start != null
      ? start - nowMin
      : null;

  return ArenaBookingJourney(
    moment: moment,
    steps: List.unmodifiable([
      _bookedStep(b),
      _arrivalStep(b, moment, now),
      _paymentStep(b, bill),
      _closedStep(b, moment),
    ]),
    bill: bill,
    isCanceled: b.isCanceled,
    showsCheckIn: showsCheckIn,
    checkInBlockReason:
        showsCheckIn ? arenaBookingCheckInBlockReason(b, now: now) : null,
    minutesUntilStart: minutesUntilStart,
  );
}

ArenaJourneyStep _bookedStep(ArenaManagerBooking b) {
  final created = _date(b.data['createdAt']);
  return ArenaJourneyStep(
    kind: ArenaJourneyStepKind.booked,
    status: ArenaJourneyStepStatus.done,
    title: 'Reservada',
    subtitle: created != null
        ? 'Em ${DateFormat("d MMM · HH:mm", 'pt_BR').format(created)}'
        : 'Reserva na agenda',
  );
}

ArenaJourneyStep _arrivalStep(
  ArenaManagerBooking b,
  ArenaTimelineBookingEntry moment,
  DateTime now,
) {
  ArenaJourneyStep step(ArenaJourneyStepStatus status, String subtitle) =>
      ArenaJourneyStep(
        kind: ArenaJourneyStepKind.arrival,
        status: status,
        title: 'Chegada',
        subtitle: subtitle,
      );

  if (b.isCanceled) {
    return step(ArenaJourneyStepStatus.upcoming, 'Reserva cancelada');
  }
  switch (b.attendanceStatus) {
    case 'checked_in':
      final at = _date(b.data['checkedInAt']);
      return step(
        ArenaJourneyStepStatus.done,
        at != null ? 'Check-in às ${_hhmm(at)}' : 'Check-in feito',
      );
    case 'no_show':
      return step(ArenaJourneyStepStatus.problem, 'Não compareceu');
  }
  if (moment.phase == ArenaTimelinePhase.done) {
    return step(ArenaJourneyStepStatus.problem, 'Sem check-in');
  }
  final pill = arenaBookingPresencePill(b, now: now);
  final subtitle = pill?.label ?? 'Check-in pendente';
  return step(
    moment.isToday
        ? ArenaJourneyStepStatus.current
        : ArenaJourneyStepStatus.upcoming,
    subtitle,
  );
}

ArenaJourneyStep _paymentStep(ArenaManagerBooking b, ArenaBookingBill bill) {
  ArenaJourneyStep step(ArenaJourneyStepStatus status, String subtitle) =>
      ArenaJourneyStep(
        kind: ArenaJourneyStepKind.payment,
        status: status,
        title: 'Pago',
        subtitle: subtitle,
      );

  final info = arenaBookingPaymentInfo(b.data);
  if (bill.hasDue) {
    return step(
      ArenaJourneyStepStatus.current,
      'Falta ${formatBRL(bill.dueReais)}',
    );
  }
  if (bill.isSettled) {
    final online = bill.paidOnlineReais > _cents;
    final arena = bill.paidAtArenaReais > _cents;
    return step(
      ArenaJourneyStepStatus.done,
      online && arena
          ? 'Pago online e no balcão'
          : (online ? 'Pago online' : 'Recebido na arena'),
    );
  }
  if (info.isPendingPayment) {
    return step(ArenaJourneyStepStatus.current, 'Aguardando pagamento online');
  }
  if (info.settlement == ArenaBookingPaymentSettlement.failed) {
    return step(
      ArenaJourneyStepStatus.problem,
      'Pagamento online não concluído',
    );
  }
  return step(ArenaJourneyStepStatus.upcoming, 'Sem cobrança registrada');
}

ArenaJourneyStep _closedStep(
  ArenaManagerBooking b,
  ArenaTimelineBookingEntry moment,
) {
  ArenaJourneyStep step(ArenaJourneyStepStatus status, String subtitle) =>
      ArenaJourneyStep(
        kind: ArenaJourneyStepKind.closed,
        status: status,
        title: 'Encerrada',
        subtitle: subtitle,
      );

  if (b.isCanceled) return step(ArenaJourneyStepStatus.problem, 'Cancelada');
  final status = (b.data['status'] as String?)?.trim().toLowerCase();
  if (status == 'completed' || moment.phase == ArenaTimelinePhase.done) {
    return step(ArenaJourneyStepStatus.done, 'Encerrou às ${b.endTime}');
  }
  return step(ArenaJourneyStepStatus.upcoming, 'Termina às ${b.endTime}');
}

/// Início e fim da reserva no relógio local (fim depois da meia-noite vira
/// o dia seguinte).
(DateTime, DateTime)? _bookingWindow(ArenaManagerBooking b) {
  final day = DateTime.tryParse(
    b.dateKey.length >= 10 ? b.dateKey.substring(0, 10) : '',
  );
  final start = arenaNowMinutes(b.startTime);
  final end = arenaNowMinutes(b.endTime, isEnd: true);
  if (day == null || start == null || end == null) return null;
  final startAt = DateTime(day.year, day.month, day.day, 0, start);
  var endAt = DateTime(day.year, day.month, day.day, 0, end);
  if (!endAt.isAfter(startAt)) endAt = endAt.add(const Duration(days: 1));
  return (startAt, endAt);
}

DateTime? _date(dynamic v) {
  if (v is Timestamp) return v.toDate();
  if (v is DateTime) return v;
  return null;
}

String _hhmm(DateTime d) =>
    '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
