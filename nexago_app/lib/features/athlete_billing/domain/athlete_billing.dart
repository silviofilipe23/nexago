import '../../arena_contract/domain/arena_contract.dart';
import '../../arena_contract/domain/arena_contract_logic.dart';
import '../../arenas/domain/my_booking_item.dart';
import '../../athlete/domain/agenda/athlete_agenda_logic.dart'
    show parseBookingDateTime;
import '../../athlete/domain/agenda/class_charge_entry.dart';
import '../../athlete_training/domain/training_center.dart';
import '../../athlete_training/domain/training_plans.dart';
import '../../schedule_plans/domain/schedule_plan_logic.dart';
import '../../schedule_plans/domain/schedule_plan_models.dart';
import '../../tournaments/domain/my_tournaments_models.dart';
import '../../tournaments/domain/tournament_discovery_models.dart';
import '../../tournaments/domain/tournament_payment_mode.dart';

/// Cobranças do atleta (protótipo "NexaGO Atleta — Cobranças"): tudo que ele
/// paga num lugar só — aulas (arena, professor e centro), horário fixo,
/// reservas e inscrições. Cada cobrança continua de quem recebe; aqui só se
/// reúne e se leva de volta à tela de pagar de cada origem.

/// Filtro por tipo ("Aulas", "Horário fixo", "Reservas", "Torneios").
enum AthleteChargeKind {
  classes,
  fixedSchedule,
  membership,
  booking,
  tournament
}

extension AthleteChargeKindX on AthleteChargeKind {
  String get label => switch (this) {
        AthleteChargeKind.classes => 'Aulas',
        AthleteChargeKind.fixedSchedule => 'Horário fixo',
        AthleteChargeKind.membership => 'Mensalidade',
        AthleteChargeKind.booking => 'Reservas',
        AthleteChargeKind.tournament => 'Torneios',
      };

  /// Valor do `?tipo=` da rota.
  String get key => switch (this) {
        AthleteChargeKind.classes => 'aulas',
        AthleteChargeKind.fixedSchedule => 'horario-fixo',
        AthleteChargeKind.membership => 'mensalidade',
        AthleteChargeKind.booking => 'reservas',
        AthleteChargeKind.tournament => 'torneios',
      };
}

AthleteChargeKind? athleteChargeKindFromKey(String? key) {
  for (final k in AthleteChargeKind.values) {
    if (k.key == key) return k;
  }
  return null;
}

/// Situação da cobrança em aberto.
enum AthleteChargeState {
  /// Passou do vencimento.
  overdue,

  /// Pagável pelo app (fatura, Pix ou cartão).
  due,

  /// Paga direto a quem recebe (na arena, ao professor, ao organizador): o
  /// app só lembra.
  direct,
}

/// Para onde o toque na cobrança leva — a tela de pagar de cada origem.
sealed class AthleteChargeTarget {
  const AthleteChargeTarget();
}

/// Mensalidade de aula com fatura online (arena ou professor): abre o Asaas.
class ClassInvoiceTarget extends AthleteChargeTarget {
  const ClassInvoiceTarget(this.url);
  final String url;
}

/// Mensalidade de aula sem fatura (paga direto): Planos e pagamentos.
class TrainingPlansTarget extends AthleteChargeTarget {
  const TrainingPlansTarget();
}

/// Fatura do centro de treinamento (F2).
class CenterInvoiceTarget extends AthleteChargeTarget {
  const CenterInvoiceTarget({required this.centerId, required this.invoiceId});
  final String centerId;
  final String invoiceId;
}

/// Mensalidade do horário fixo: Meus planos de horário (pagar com CPF lá).
class SchedulePlansTarget extends AthleteChargeTarget {
  const SchedulePlansTarget();
}

/// Mensalidade do contrato de mensalista (CRM da arena): Meu contrato.
class ArenaContractChargeTarget extends AthleteChargeTarget {
  const ArenaContractChargeTarget(this.contractId);
  final String contractId;
}

/// Reserva aguardando o Pix: detalhe da reserva.
class BookingTarget extends AthleteChargeTarget {
  const BookingTarget(this.booking);
  final MyBookingItem booking;
}

/// Inscrição com pagamento pendente: a inscrição no torneio.
class TournamentRegistrationTarget extends AthleteChargeTarget {
  const TournamentRegistrationTarget(this.tournamentId);
  final String tournamentId;
}

class AthleteCharge {
  const AthleteCharge({
    required this.id,
    required this.kind,
    required this.title,
    required this.payee,
    required this.amountReais,
    required this.state,
    required this.target,
    this.dueDate,
    this.note,
  });

  final String id;
  final AthleteChargeKind kind;
  final String title;

  /// Quem recebe ("Arena CFC", "Prof. Thiago").
  final String payee;
  final double amountReais;
  final AthleteChargeState state;

  /// `YYYY-MM-DD`; `null` quando não há vencimento (reserva, inscrição).
  final String? dueDate;

  /// Complemento da linha ("sua parte", "direto à arena").
  final String? note;
  final AthleteChargeTarget target;

  bool get isOverdue => state == AthleteChargeState.overdue;
}

/// Plano ou assinatura que gera cobrança todo ciclo.
class AthleteRecurringCharge {
  const AthleteRecurringCharge({
    required this.id,
    required this.kind,
    required this.title,
    required this.payee,
    required this.cycleLabel,
    required this.amountReais,
    required this.methodLabel,
    required this.target,
    this.totalReais,
    this.nextLabel,
    this.monthly = true,
  });

  final String id;
  final AthleteChargeKind kind;
  final String title;
  final String payee;

  /// "Mensal · dia 05", "Pacote · até 15 jan".
  final String cycleLabel;

  /// A parte do atleta.
  final double amountReais;

  /// Valor cheio quando é dividido ("de R$ 450,00").
  final double? totalReais;
  final String methodLabel;
  final String? nextLabel;

  /// Conta no compromisso mensal (pacote e avulsa não).
  final bool monthly;
  final RecurringTarget target;
}

/// Detalhe do plano de cada origem.
sealed class RecurringTarget {
  const RecurringTarget();
}

class ArenaClassTarget extends RecurringTarget {
  const ArenaClassTarget(this.enrollmentId);
  final String enrollmentId;
}

class PrivateLinkTarget extends RecurringTarget {
  const PrivateLinkTarget(this.professorUid);
  final String professorUid;
}

class CenterPlanTarget extends RecurringTarget {
  const CenterPlanTarget(this.centerId);
  final String centerId;
}

class SchedulePlanTarget extends RecurringTarget {
  const SchedulePlanTarget();
}

/// Contrato de mensalista (CRM da arena): Meu contrato.
class ArenaContractPlanTarget extends RecurringTarget {
  const ArenaContractPlanTarget(this.contractId);
  final String contractId;
}

/// Pagamento feito, para o histórico.
class AthletePaidCharge {
  const AthletePaidCharge({
    required this.id,
    required this.kind,
    required this.title,
    required this.payee,
    required this.amountReais,
    required this.paidOn,
    this.method = '',
    this.professorChargeId,
  });

  final String id;
  final AthleteChargeKind kind;
  final String title;
  final String payee;
  final double amountReais;

  /// `YYYY-MM-DD`.
  final String paidOn;
  final String method;

  /// Cobrança do professor: tem comprovante no app (B19).
  final String? professorChargeId;
}

class PaidMonth {
  const PaidMonth({required this.monthKey, required this.items});

  /// `YYYY-MM`.
  final String monthKey;
  final List<AthletePaidCharge> items;

  double get total => items.fold(0, (a, p) => a + p.amountReais);

  /// Total por tipo, só os que têm valor, na ordem do enum.
  List<(AthleteChargeKind, double)> get byKind => [
        for (final k in AthleteChargeKind.values)
          if (items.any((p) => p.kind == k))
            (
              k,
              items
                  .where((p) => p.kind == k)
                  .fold<double>(0, (a, p) => a + p.amountReais),
            ),
      ];
}

/// Resumo das abertas: o card do topo, o menu da conta e a Início.
class AthleteChargesSummary {
  const AthleteChargesSummary({
    this.total = 0,
    this.overdueCount = 0,
    this.overdueTotal = 0,
    this.dueCount = 0,
    this.directCount = 0,
  });

  factory AthleteChargesSummary.of(List<AthleteCharge> open) {
    double sum(Iterable<AthleteCharge> l) =>
        l.fold(0, (a, c) => a + c.amountReais);
    final overdue = open.where((c) => c.isOverdue);
    return AthleteChargesSummary(
      total: sum(open),
      overdueCount: overdue.length,
      overdueTotal: sum(overdue),
      dueCount: open.where((c) => c.state == AthleteChargeState.due).length,
      directCount:
          open.where((c) => c.state == AthleteChargeState.direct).length,
    );
  }

  final double total;
  final int overdueCount;
  final double overdueTotal;
  final int dueCount;
  final int directCount;

  int get count => overdueCount + dueCount + directCount;
  bool get isEmpty => count == 0;
}

// ── em aberto ────────────────────────────────────────────────────────────

/// Junta as cobranças em aberto de todas as origens: vencidas primeiro, depois
/// pelo vencimento (sem vencimento no fim).
List<AthleteCharge> buildOpenCharges({
  required String uid,
  required String todayKey,
  required DateTime now,
  List<ClassChargeEntry> classCharges = const [],
  List<TrainingCenterLink> centers = const [],
  List<ScheduleSubscription> subscriptions = const [],
  List<MyBookingItem> bookings = const [],
  List<MyTournamentEnrollment> enrollments = const [],
  List<ArenaContract> arenaContracts = const [],
}) {
  final out = <AthleteCharge>[
    for (final c in arenaContracts)
      if (_arenaContractCharge(c, todayKey) case final charge?) charge,
    for (final c in classCharges) _fromClassCharge(c),
    for (final center in centers)
      for (final i in center.invoices)
        if (i.isOpen) _fromCenterInvoice(center, i, todayKey),
    for (final s in subscriptions)
      if (s.status != ScheduleSubscriptionStatus.canceled)
        for (final c in s.charges)
          if (_isMineOpen(c, uid)) _fromScheduleCharge(s, c, now),
    for (final b in bookings)
      if (bookingAwaitsMyPayment(b, uid: uid, now: now)) _fromBooking(b),
    for (final e in enrollments)
      if (enrollmentAwaitsPayment(e)) _fromEnrollment(e),
  ];
  out.sort(_byUrgency);
  return out;
}

int _byUrgency(AthleteCharge a, AthleteCharge b) {
  if (a.isOverdue != b.isOverdue) return a.isOverdue ? -1 : 1;
  final ad = a.dueDate, bd = b.dueDate;
  if (ad != null && bd != null && ad != bd) return ad.compareTo(bd);
  if (ad == null && bd != null) return 1;
  if (ad != null && bd == null) return -1;
  // `List.sort` não é estável: o desempate precisa ser total.
  final byKind = a.kind.index.compareTo(b.kind.index);
  if (byKind != 0) return byKind;
  final byTitle = a.title.compareTo(b.title);
  return byTitle != 0 ? byTitle : a.id.compareTo(b.id);
}

/// Mensalidade do contrato em aberto: o atraso todo, ou a próxima quando vence
/// em até [arenaContractUpcomingDays] dias. Pagável no app só com o link da arena.
AthleteCharge? _arenaContractCharge(ArenaContract c, String todayKey) {
  final payee = c.arenaName.isEmpty ? 'Arena' : c.arenaName;
  final online = c.payLink != null;
  if (c.isOverdue) {
    return AthleteCharge(
      id: 'contract-${c.id}',
      kind: AthleteChargeKind.membership,
      title: 'Mensalidade · ${c.planName}',
      payee: payee,
      amountReais: c.overdueReais,
      dueDate: c.overdueSince,
      state: AthleteChargeState.overdue,
      note: [
        if (c.overdueCount > 1) '${c.overdueCount} parcelas',
        if (!online) 'na arena',
      ].join(' · ').ifEmptyNull,
      target: ArenaContractChargeTarget(c.id),
    );
  }
  final next = c.nextDueDate;
  final today = DateTime.tryParse(todayKey);
  final due = next == null ? null : DateTime.tryParse(next);
  if (today == null || due == null) return null;
  if (due.difference(today).inDays > arenaContractUpcomingDays) return null;
  return AthleteCharge(
    id: 'contract-${c.id}',
    kind: AthleteChargeKind.membership,
    title: 'Mensalidade · ${c.planName}',
    payee: payee,
    amountReais: c.monthlyPriceReais,
    dueDate: next,
    state: online ? AthleteChargeState.due : AthleteChargeState.direct,
    note: online ? null : 'na arena',
    target: ArenaContractChargeTarget(c.id),
  );
}

/// A próxima mensalidade do contrato entra nas Cobranças quando vence em até
/// tantos dias (antes disso, só em Planos e assinaturas e no Meu contrato).
const arenaContractUpcomingDays = 10;

AthleteRecurringCharge _fromArenaContract(ArenaContract c) =>
    AthleteRecurringCharge(
      id: 'contract-${c.id}',
      kind: AthleteChargeKind.membership,
      title: c.planName,
      payee: c.arenaName.isEmpty ? 'Arena' : c.arenaName,
      cycleLabel: [
        '${arenaContractPeriodLabel(c.period)} · dia ${_two(c.dueDay)}',
        'mensalista · ${arenaContractHoursLabel(c.weeklyHours)} por semana',
      ].join(' · '),
      amountReais: c.monthlyPriceReais,
      methodLabel: c.payLink != null ? 'Pix ou cartão' : 'Na arena',
      nextLabel: c.nextDueDate == null
          ? null
          : 'Próxima ${arenaContractDayMonth(c.nextDueDate)}',
      target: ArenaContractPlanTarget(c.id),
    );

AthleteCharge _fromClassCharge(ClassChargeEntry c) {
  final online = c.canPayOnline;
  return AthleteCharge(
    id: 'class-${c.chargeId}',
    kind: AthleteChargeKind.classes,
    title: c.description,
    payee: c.arenaName,
    amountReais: c.amountReais,
    dueDate: c.dueDate.isEmpty ? null : c.dueDate,
    state: c.overdue
        ? AthleteChargeState.overdue
        : online
            ? AthleteChargeState.due
            : AthleteChargeState.direct,
    note: online
        ? null
        : c.payment == 'preparing'
            ? 'link sendo gerado'
            : c.isProfessorCharge
                ? 'direto ao professor'
                : 'direto à arena',
    target: online
        ? ClassInvoiceTarget(c.invoiceUrl!)
        : const TrainingPlansTarget(),
  );
}

AthleteCharge _fromCenterInvoice(
  TrainingCenterLink center,
  CenterInvoice i,
  String todayKey,
) =>
    AthleteCharge(
      id: 'center-${i.invoiceId}',
      kind: AthleteChargeKind.classes,
      title: i.reference,
      payee: center.name,
      amountReais: i.amountReais,
      dueDate: i.dueDate.isEmpty ? null : i.dueDate,
      state: i.isOverdue(todayKey)
          ? AthleteChargeState.overdue
          : AthleteChargeState.due,
      note: i.blockedByContract ? 'assine o contrato para pagar' : null,
      target: CenterInvoiceTarget(
        centerId: center.centerId,
        invoiceId: i.invoiceId,
      ),
    );

bool _isMineOpen(ScheduleCharge c, String uid) =>
    c.isOpen && (c.payerAthleteId == null || c.payerAthleteId == uid);

AthleteCharge _fromScheduleCharge(
  ScheduleSubscription s,
  ScheduleCharge c,
  DateTime now,
) {
  final due = c.dueDate;
  final split = s.members.length > 1;
  return AthleteCharge(
    id: 'schedule-${c.id}',
    kind: AthleteChargeKind.fixedSchedule,
    title: [
      s.planName,
      if (c.period.isNotEmpty) _periodLabel(c.period),
    ].join(' · '),
    payee: s.arenaName.isEmpty ? 'Arena' : s.arenaName,
    amountReais: c.amountReais,
    dueDate: due == null ? null : _dateKey(due),
    state: scheduleOverdueDays(c, now) > 0
        ? AthleteChargeState.overdue
        : c.isOnline
            ? AthleteChargeState.due
            : AthleteChargeState.direct,
    note: [
      if (split) 'sua parte',
      if (!c.isOnline) 'na arena',
      if (_autopayScheduledDay(c) case final day?) 'Débito automático em $day',
    ].join(' · ').ifEmptyNull,
    target: const SchedulePlansTarget(),
  );
}

/// Dia (`DD/MM`) do débito agendado no cartão; `null` sem débito agendado.
String? _autopayScheduledDay(ScheduleCharge c) {
  final a = c.autopay;
  if (a == null || (a.state != 'scheduled' && a.state != 'retry')) return null;
  final day = scheduleAutopayDayLabel(a.scheduledFor ?? '');
  return day.isEmpty ? null : day;
}

/// Reserva própria segurando a quadra à espera do Pix (e ainda por vir).
bool bookingAwaitsMyPayment(
  MyBookingItem b, {
  required String uid,
  required DateTime now,
}) {
  if (b.rawStatus.trim().toLowerCase() != 'pending_payment') return false;
  final owner = b.ownerAthleteId;
  if (owner != null && uid.isNotEmpty && owner != uid) return false;
  final start = parseBookingDateTime(b.dateRaw, b.startTime);
  return start == null || start.isAfter(now);
}

AthleteCharge _fromBooking(MyBookingItem b) => AthleteCharge(
      id: 'booking-${b.id}',
      kind: AthleteChargeKind.booking,
      title: [
        'Reserva',
        if ((b.courtName ?? '').isNotEmpty) b.courtName!,
        _bookingWhen(b),
      ].where((s) => s.isNotEmpty).join(' · '),
      payee: b.arenaName,
      amountReais: b.amountReais ?? 0,
      state: AthleteChargeState.due,
      note: 'aguardando o Pix',
      target: BookingTarget(b),
    );

String _bookingWhen(MyBookingItem b) {
  final start = parseBookingDateTime(b.dateRaw, b.startTime);
  if (start == null) return b.startTime;
  final d = start.day.toString().padLeft(2, '0');
  final m = start.month.toString().padLeft(2, '0');
  return '$d/$m ${b.startTime}'.trim();
}

/// Inscrição com elenco fechado e pagamento pendente, num torneio que ainda
/// vai acontecer.
bool enrollmentAwaitsPayment(MyTournamentEnrollment e) {
  final r = e.registration;
  if (r.isPaid || r.partnerPending || r.isWaitlist) return false;
  if (r.tournamentIsCancelled || e.isCompleted) return false;
  return r.registrationId.trim().isNotEmpty;
}

AthleteCharge _fromEnrollment(MyTournamentEnrollment e) {
  final r = e.registration;
  final direct = r.paymentMode == TournamentPaymentMode.directWithOrganizer;
  final category = e.categoryLabel;
  return AthleteCharge(
    id: 'tournament-${r.registrationId}',
    kind: AthleteChargeKind.tournament,
    title: [
      'Inscrição ${e.displayName}',
      if (category != null && category.isNotEmpty) category,
    ].join(' · '),
    payee: 'Organizador do torneio',
    amountReais: enrollmentShareReais(e),
    state: direct ? AthleteChargeState.direct : AthleteChargeState.due,
    note: direct ? 'direto ao organizador' : 'sua parte',
    target: TournamentRegistrationTarget(e.tournamentId),
  );
}

/// Parte do atleta na inscrição: a taxa da categoria (por equipe) dividida
/// pelo tamanho da equipe — a mesma conta do passo de pagamento.
double enrollmentShareReais(MyTournamentEnrollment e) {
  final r = e.registration;
  TournamentCategoryOffer? offer = r.category;
  if (offer == null) {
    for (final o in e.tournament?.categoryOffers ?? const []) {
      if (o.id == r.categoryId) offer = o;
    }
  }
  final fee = offer?.entryFee ?? 0;
  if (fee <= 0) return 0;
  final size = r.teamSize ?? offer?.teamSize ?? 2;
  return size > 1 ? fee / size : fee;
}

// ── recorrentes ──────────────────────────────────────────────────────────

List<AthleteRecurringCharge> buildRecurringCharges({
  required String uid,
  MyTrainingPlans? plans,
  List<TrainingCenterLink> centers = const [],
  List<ScheduleSubscription> subscriptions = const [],
  List<ArenaContract> arenaContracts = const [],
}) =>
    [
      for (final c in arenaContracts) _fromArenaContract(c),
      for (final s in subscriptions)
        if (s.status != ScheduleSubscriptionStatus.canceled)
          _fromSubscription(s, uid),
      for (final p in plans?.arenaPlans ?? const <ArenaTrainingPlan>[])
        _fromArenaPlan(p),
      for (final c in centers)
        for (final e in c.enrollments)
          if (e.status == 'active' || e.status == 'paused')
            _fromCenterEnrollment(c, e),
      for (final p in plans?.professorPlans ?? const <ProfessorTrainingPlan>[])
        if (p.recurringReais != null) _fromProfessorPlan(p),
    ];

AthleteRecurringCharge _fromSubscription(ScheduleSubscription s, String uid) {
  final share = scheduleMyShare(s, uid);
  final split = s.members.length > 1;
  final days = scheduleWeekdaysList(s.slots.map((x) => x.weekday));
  final time = s.slots.isEmpty ? '' : s.slots.first.startTime;
  return AthleteRecurringCharge(
    id: 'schedule-${s.id}',
    kind: AthleteChargeKind.fixedSchedule,
    title: [
      s.planName,
      if (days.isNotEmpty) days,
      if (time.isNotEmpty) time,
    ].join(' · '),
    payee: s.arenaName.isEmpty ? 'Arena' : s.arenaName,
    cycleLabel: [
      '${s.cycle.label} · dia ${_two(s.dueDay)}',
      if (split) 'dividido em ${s.members.length}',
      if (s.status == ScheduleSubscriptionStatus.paused) 'pausado',
      if (s.status == ScheduleSubscriptionStatus.suspended) 'suspenso',
    ].join(' · '),
    amountReais: share,
    totalReais: split ? s.monthlyPriceReais : null,
    methodLabel: s.paymentMethod.label,
    nextLabel: _nextDueLabel(s.dueDay, s.charges, uid),
    target: const SchedulePlanTarget(),
  );
}

String? _nextDueLabel(int dueDay, List<ScheduleCharge> charges, String uid) {
  final next = scheduleNextOpenCharge(charges, uid)?.dueDate;
  return next == null ? 'todo dia ${_two(dueDay)}' : _shortDate(next);
}

AthleteRecurringCharge _fromArenaPlan(ArenaTrainingPlan p) {
  final className = p.slots.isEmpty ? '' : p.slots.first.className;
  return AthleteRecurringCharge(
    id: 'arena-${p.enrollmentId}',
    kind: AthleteChargeKind.classes,
    title: className.isEmpty ? p.planName : 'Turma $className',
    payee: p.arenaName,
    cycleLabel: p.isPackage
        ? [
            'Pacote',
            if (p.creditsLeft != null) '${p.creditsLeft} aulas restantes',
          ].join(' · ')
        : [
            trainingPlanKindLabel(p.kind),
            if (p.dueDay != null) 'dia ${_two(p.dueDay!)}',
          ].join(' · '),
    amountReais: p.priceReais,
    methodLabel: arenaPaymentMethodLabel(p.paymentMethod, p.billingMode),
    nextLabel: p.isPackage
        ? (p.expiresOn == null
            ? null
            : 'válido até ${trainingPlanShortDate(p.expiresOn!)}')
        : (p.dueDay == null ? null : 'todo dia ${_two(p.dueDay!)}'),
    monthly: p.kind == 'monthly',
    target: ArenaClassTarget(p.enrollmentId),
  );
}

AthleteRecurringCharge _fromCenterEnrollment(
  TrainingCenterLink c,
  CenterEnrollment e,
) {
  final pack = e.planType != 'monthly';
  return AthleteRecurringCharge(
    id: 'center-${e.enrollmentId}',
    kind: AthleteChargeKind.classes,
    title: e.className,
    payee: c.name,
    cycleLabel: pack
        ? [
            'Pacote',
            if (e.creditsLeft != null) '${e.creditsLeft} aulas restantes',
          ].join(' · ')
        : [
            'Mensal',
            if (e.billingDay != null) 'dia ${_two(e.billingDay!)}',
            if (e.status == 'paused') 'trancada',
          ].join(' · '),
    amountReais: e.priceCents / 100,
    methodLabel: centerBillingMethodLabel(e.billingMethod),
    nextLabel: e.nextChargeDate == null
        ? null
        : trainingPlanShortDate(e.nextChargeDate!),
    monthly: !pack,
    target: CenterPlanTarget(c.centerId),
  );
}

AthleteRecurringCharge _fromProfessorPlan(ProfessorTrainingPlan p) =>
    AthleteRecurringCharge(
      id: 'professor-${p.professorUid}',
      kind: AthleteChargeKind.classes,
      title: p.planName ?? p.recurringDescription ?? 'Aulas particulares',
      payee: 'Prof. ${p.professorName}',
      cycleLabel: [
        'Mensal',
        if (p.recurringDueDay != null) 'dia ${_two(p.recurringDueDay!)}',
      ].join(' · '),
      amountReais: p.recurringReais ?? 0,
      methodLabel: 'Pix ou cartão ao professor',
      nextLabel: p.recurringDueDay == null
          ? null
          : 'todo dia ${_two(p.recurringDueDay!)}',
      target: PrivateLinkTarget(p.professorUid),
    );

/// Soma do que se repete todo mês (pacotes ficam fora).
double monthlyCommitment(List<AthleteRecurringCharge> list) =>
    list.where((r) => r.monthly).fold(0, (a, r) => a + r.amountReais);

// ── histórico ────────────────────────────────────────────────────────────

/// Pagamentos de aulas (arena, professor e centro) e do horário fixo,
/// agrupados por mês, do mais recente.
List<PaidMonth> buildPaidHistory({
  required String uid,
  MyTrainingPlans? plans,
  List<TrainingCenterLink> centers = const [],
  List<ScheduleSubscription> subscriptions = const [],
}) {
  final all = <AthletePaidCharge>[
    for (final p in centerPaymentsMerged(
      plans?.payments ?? const [],
      centers,
      limit: 1 << 20,
    ))
      AthletePaidCharge(
        id: '${p.fromProfessor ? 'professor' : 'class'}-${p.chargeId}',
        kind: AthleteChargeKind.classes,
        title: p.description,
        payee: p.payee,
        amountReais: p.amountReais,
        paidOn: p.paidOn,
        method: p.method,
        professorChargeId: p.fromProfessor ? p.chargeId : null,
      ),
    for (final s in subscriptions)
      for (final c in s.charges)
        if (c.isPaid && (c.payerAthleteId == null || c.payerAthleteId == uid))
          AthletePaidCharge(
            id: 'schedule-${c.id}',
            kind: AthleteChargeKind.fixedSchedule,
            title: [
              s.planName,
              if (c.period.isNotEmpty) _periodLabel(c.period),
            ].join(' · '),
            payee: s.arenaName.isEmpty ? 'Arena' : s.arenaName,
            amountReais: c.amountReais,
            paidOn: c.dueDate == null ? c.period : _dateKey(c.dueDate!),
            method:
                schedulePaidOnlineLabel(c)?.replaceFirst('Pago · ', '') ?? '',
          ),
  ]..removeWhere((p) => p.paidOn.length < 7);
  all.sort((a, b) => b.paidOn.compareTo(a.paidOn));

  final months = <PaidMonth>[];
  for (final p in all) {
    final key = p.paidOn.substring(0, 7);
    if (months.isEmpty || months.last.monthKey != key) {
      months.add(PaidMonth(monthKey: key, items: [p]));
    } else {
      months.last.items.add(p);
    }
  }
  return months;
}

// ── rótulos ──────────────────────────────────────────────────────────────

const _monthsShort = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

const _monthsLong = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', //
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/// "Outubro 2026" para `YYYY-MM`.
String paidMonthLabel(String monthKey) {
  final parts = monthKey.split('-');
  final m = parts.length > 1 ? int.tryParse(parts[1]) : null;
  if (m == null || m < 1 || m > 12) return monthKey;
  return '${_monthsLong[m - 1]} ${parts[0]}';
}

/// "outubro" (minúsculo, para "Pago em outubro").
String paidMonthName(String monthKey) =>
    paidMonthLabel(monthKey).split(' ').first.toLowerCase();

/// "VENCEU 30 OUT" / "VENCE 05 NOV" / "NA ARENA" — o selo à direita.
String athleteChargeDueLabel(AthleteCharge c) {
  final date =
      c.dueDate == null ? null : _shortDate(DateTime.parse(c.dueDate!));
  return switch (c.state) {
    AthleteChargeState.overdue =>
      date == null ? 'VENCIDA' : 'VENCEU ${date.toUpperCase()}',
    AthleteChargeState.due =>
      date == null ? 'A PAGAR' : 'VENCE ${date.toUpperCase()}',
    AthleteChargeState.direct =>
      date == null ? 'PAGAR DIRETO' : 'VENCE ${date.toUpperCase()}',
  };
}

/// "nov" para o período `2026-11`.
String _periodLabel(String period) {
  final parts = period.split('-');
  final m = parts.length > 1 ? int.tryParse(parts[1]) : null;
  if (m == null || m < 1 || m > 12) return period;
  return _monthsShort[m - 1];
}

String _shortDate(DateTime d) => '${_two(d.day)} ${_monthsShort[d.month - 1]}';

String _dateKey(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${_two(d.month)}-${_two(d.day)}';

String _two(int n) => n.toString().padLeft(2, '0');

extension on String {
  String? get ifEmptyNull => isEmpty ? null : this;
}
