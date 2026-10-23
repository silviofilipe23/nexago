/// Gestão do centro no app (G11–G13 matrícula, G17–G18 equipe, L6 local da
/// aula, R6 assinatura): os modelos e as contas são espelho do portal
/// (`frontend/projects/center/src/app/domain/{enrollment,billing,locations}.ts`
/// e `data/actions/{enrollments,team,classes,subscriptions}.actions.ts`).
library;

import 'center_coach.dart';

// ── Equipe ───────────────────────────────────────────────────────────────

/// Vínculo de alguém da equipe (`centerMembers/{uid}`), visto pela gestão.
class CenterTeamMember {
  const CenterTeamMember({
    required this.uid,
    required this.displayName,
    required this.role,
    required this.status,
    this.email = '',
    this.programIds = const [],
  });

  factory CenterTeamMember.fromMap(String uid, Map<String, Object?> m) =>
      CenterTeamMember(
        uid: uid,
        displayName: _str(m['displayName'], 'Membro da equipe'),
        role: _str(m['role'], 'coach'),
        status: _str(m['status'], 'active'),
        email: _str(m['email']),
        programIds: _strings(m['programIds']),
      );

  final String uid;
  final String displayName;
  final String role;

  /// `active` ou `revoked`.
  final String status;
  final String email;
  final List<String> programIds;

  bool get isActive => status == 'active';
  String get roleLabel => kCenterRoleLabels[role] ?? 'Equipe';
}

/// Convite pendente (`centerInvites/{id}`): o vínculo só nasce quando o
/// convidado aceita, logado com o mesmo e-mail verificado.
class CenterInvite {
  const CenterInvite({
    required this.id,
    required this.email,
    required this.role,
    required this.status,
    this.displayName = '',
    this.programIds = const [],
    this.classIds = const [],
    this.invitedByName = '',
    this.createdAt,
  });

  factory CenterInvite.fromMap(String id, Map<String, Object?> m) =>
      CenterInvite(
        id: id,
        email: _str(m['email']),
        role: _str(m['role'], 'coach'),
        status: _str(m['status'], 'pending'),
        displayName: _str(m['displayName']),
        programIds: _strings(m['programIds']),
        classIds: _strings(m['classIds']),
        invitedByName: _str(m['invitedByName']),
        createdAt: m['createdAt'] is DateTime ? m['createdAt'] as DateTime : null,
      );

  final String id;
  final String email;
  final String role;

  /// `pending`, `accepted`, `declined` ou `cancelled`.
  final String status;
  final String displayName;
  final List<String> programIds;
  final List<String> classIds;
  final String invitedByName;
  final DateTime? createdAt;

  bool get isPending => status == 'pending';
  String get roleLabel => kCenterRoleLabels[role] ?? 'Equipe';
}

/// Papéis que [inviter] pode convidar (rules: admin só pelo owner).
List<String> centerInvitableRoles(CenterMembership inviter) => [
  'coach',
  'receptionist',
  if (inviter.role == 'center_owner') 'center_admin',
];

final _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

/// Erro do formulário de convite (`null` = ok).
String? centerInviteError({
  required String email,
  required List<CenterTeamMember> members,
  required List<CenterInvite> invites,
}) {
  final e = email.trim().toLowerCase();
  if (!_emailRe.hasMatch(e)) return 'Informe um e-mail válido.';
  if (members.any((m) => m.isActive && m.email.toLowerCase() == e)) {
    return 'Essa pessoa já faz parte da equipe.';
  }
  if (invites.any((i) => i.isPending && i.email.toLowerCase() == e)) {
    return 'Já existe um convite pendente para esse e-mail.';
  }
  return null;
}

/// Pode revogar o acesso de [target]? Espelha `ctManagerEditsMember` das
/// rules: ninguém mexe em si nem no owner; admin só em professor/recepção.
bool centerCanRevoke(CenterMembership me, CenterTeamMember target) =>
    me.isManager &&
    target.isActive &&
    target.uid.isNotEmpty &&
    target.role != 'center_owner' &&
    (me.role == 'center_owner' ||
        target.role == 'coach' ||
        target.role == 'receptionist');

/// Modalidade (`programs/{id}`).
class CenterProgram {
  const CenterProgram({
    required this.id,
    required this.name,
    this.order = 0,
  });

  factory CenterProgram.fromMap(String id, Map<String, Object?> m) =>
      CenterProgram(
        id: id,
        name: _str(m['name'], 'Modalidade'),
        order: (m['order'] is num) ? (m['order'] as num).toInt() : 0,
      );

  final String id;
  final String name;
  final int order;
}

// ── Planos, contrato e 1ª cobrança ───────────────────────────────────────

/// Plano do centro (`plans/{id}`).
class CenterPlan {
  const CenterPlan({
    required this.id,
    required this.name,
    required this.type,
    required this.priceCents,
    this.classesPerWeek,
    this.makeupsPerMonth,
    this.credits,
    this.validityDays,
    this.programIds = const [],
    this.status = 'active',
    this.featured = false,
    this.scheduledPriceCents,
    this.scheduledFrom,
  });

  factory CenterPlan.fromMap(String id, Map<String, Object?> m) {
    final next = m['scheduledPrice'];
    final nextMap = next is Map ? next : null;
    return CenterPlan(
      id: id,
      name: _str(m['name'], 'Plano'),
      type: m['type'] == 'class_pack' ? 'class_pack' : 'monthly',
      priceCents: _num(m['priceCents']) ?? 0,
      classesPerWeek: _num(m['classesPerWeek']),
      makeupsPerMonth: _num(m['makeupsPerMonth']),
      credits: _num(m['credits']),
      validityDays: _num(m['validityDays']),
      programIds: _strings(m['programIds']),
      status: m['status'] == 'archived' ? 'archived' : 'active',
      featured: m['featured'] == true,
      scheduledPriceCents: nextMap == null ? null : _num(nextMap['priceCents']),
      scheduledFrom: nextMap == null ? null : _str(nextMap['effectiveFrom']),
    );
  }

  final String id;
  final String name;

  /// `monthly` ou `class_pack`.
  final String type;
  final int priceCents;
  final int? classesPerWeek;
  final int? makeupsPerMonth;
  final int? credits;
  final int? validityDays;
  final List<String> programIds;
  final String status;
  final bool featured;

  /// Preço novo agendado (vale para contratações a partir de [scheduledFrom]).
  final int? scheduledPriceCents;
  final String? scheduledFrom;

  bool get isMonthly => type == 'monthly';
  bool get isActive => status == 'active';

  /// "2x por semana · 2 reposições/mês" / "8 aulas · validade 60 dias".
  String get ruleLabel => isMonthly
      ? [
          if (classesPerWeek != null) '${classesPerWeek}x por semana',
          if (makeupsPerMonth != null && makeupsPerMonth! > 0)
            '$makeupsPerMonth ${makeupsPerMonth == 1 ? 'reposição' : 'reposições'}/mês',
        ].join(' · ')
      : [
          if (credits != null) '$credits ${credits == 1 ? 'aula' : 'aulas'}',
          if (validityDays != null) 'validade $validityDays dias',
        ].join(' · ');
}

/// Preço que vale numa contratação feita em [day] (`priceOn` do portal).
int centerPlanPriceOn(CenterPlan plan, String day) {
  final from = plan.scheduledFrom;
  final next = plan.scheduledPriceCents;
  return next != null && from != null && from.isNotEmpty && from.compareTo(day) <= 0
      ? next
      : plan.priceCents;
}

/// Planos que servem para a turma: ativos e da modalidade dela (plano sem
/// modalidade vale para todas).
List<CenterPlan> centerPlansForClass(
  List<CenterPlan> plans,
  CenterCoachClass cls,
) => [
  for (final p in plans)
    if (p.isActive &&
        (p.programIds.isEmpty ||
            cls.programId.isEmpty ||
            p.programIds.contains(cls.programId)))
      p,
]..sort((a, b) {
  if (a.featured != b.featured) return a.featured ? -1 : 1;
  return a.priceCents.compareTo(b.priceCents);
});

/// Políticas padrão do centro (`DEFAULT_POLICIES` do portal).
const Map<String, Object> kCenterDefaultPolicies = {
  'activation': 'after_payment',
  'unexcusedAbsenceConsumes': true,
  'excusedAbsenceMakeup': true,
  'excusedNoticeHours': 4,
  'makeupValidityDays': 30,
  'cancelledClassMakeup': 'auto',
  'makeupScope': 'same_level',
  'monthlyCancellation': 'end_of_cycle',
  'allowPause': true,
  'pauseMaxDaysPerYear': 30,
  'waitlistEnabled': true,
  'waitlistAcceptHours': 24,
  'pendingHoldHours': 48,
  'travelBufferMinutes': 30,
};

/// Políticas lidas como o portal (`readPolicies`): só as chaves conhecidas e
/// do mesmo tipo do padrão; o resto cai no padrão.
Map<String, Object> centerPoliciesSnapshot(Map<String, Object?> raw) => {
  for (final e in kCenterDefaultPolicies.entries)
    e.key: switch (e.value) {
      bool _ => raw[e.key] is bool ? raw[e.key]! : e.value,
      num _ => raw[e.key] is num ? raw[e.key]! : e.value,
      _ => raw[e.key] is String ? raw[e.key]! : e.value,
    },
};

/// Contrato congelado na matrícula (`buildContract`): plano + políticas do
/// dia; mudar o plano depois não altera a matrícula.
Map<String, Object?> centerBuildContract(
  CenterPlan plan,
  Map<String, Object?> rawPolicies,
  String day,
) => {
  'planName': plan.name,
  'planType': plan.type,
  'priceCents': centerPlanPriceOn(plan, day),
  'classesPerWeek': plan.classesPerWeek,
  'makeupsPerMonth': plan.makeupsPerMonth,
  'credits': plan.credits,
  'validityDays': plan.validityDays,
  'policies': centerPoliciesSnapshot(rawPolicies),
  'contractedAt': day,
};

/// Cobrança do centro (`billing`), lida como o portal (`readBilling`).
class CenterBillingConfig {
  const CenterBillingConfig({
    this.billingDayMode = 'fixed',
    this.billingDay = 5,
    this.firstMonth = 'prorata',
  });

  factory CenterBillingConfig.fromMap(Map<String, Object?> m) {
    final day = m['billingDay'];
    return CenterBillingConfig(
      billingDayMode: m['billingDayMode'] == 'enrollment'
          ? 'enrollment'
          : 'fixed',
      billingDay: day is num && day.isFinite && day >= 1 && day <= 28
          ? day.round()
          : 5,
      firstMonth: m['firstMonth'] == 'full' ? 'full' : 'prorata',
    );
  }

  final String billingDayMode;
  final int billingDay;
  final String firstMonth;
}

({int y, int m, int d}) _parse(String key) {
  final p = key.split('-');
  return (y: int.parse(p[0]), m: int.parse(p[1]), d: int.parse(p[2]));
}

String _fmt(int y, int m, int d) =>
    '$y-${m.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';

int _daysInMonth(int y, int m) => DateTime.utc(y, m + 1, 0).day;

/// Dias entre dois dayKeys (calendário puro).
int centerDaysBetween(String a, String b) {
  final pa = _parse(a), pb = _parse(b);
  return DateTime.utc(
    pb.y,
    pb.m,
    pb.d,
  ).difference(DateTime.utc(pa.y, pa.m, pa.d)).inDays;
}

/// Mesmo dia de vencimento N meses depois (dia inexistente cai no último).
String centerShiftMonths(String day, int n, int billingDay) {
  final p = _parse(day);
  final t = DateTime.utc(p.y, p.m + n, 1);
  return _fmt(t.year, t.month, billingDay.clamp(1, _daysInMonth(t.year, t.month)));
}

int centerBillingDayFor(CenterBillingConfig b, String startDate) =>
    b.billingDayMode == 'enrollment'
    ? _parse(startDate).d.clamp(1, 28)
    : b.billingDay;

/// Primeiro vencimento recorrente depois da contratação.
String centerFirstChargeAfter(String startDate, int billingDay) {
  final p = _parse(startDate);
  return p.d < billingDay
      ? _fmt(p.y, p.m, billingDay.clamp(1, _daysInMonth(p.y, p.m)))
      : centerShiftMonths(startDate, 1, billingDay);
}

typedef CenterFirstInvoice = ({
  int cents,
  bool prorated,
  int days,
  int cycleDays,
  String nextCharge,
});

/// Valor da cobrança da matrícula mensal: proporcional até o 1º vencimento
/// fixo, ou o mês cheio (`firstInvoiceCents`).
CenterFirstInvoice centerFirstInvoice(
  int priceCents,
  CenterBillingConfig b,
  String startDate,
) {
  final day = centerBillingDayFor(b, startDate);
  final nextCharge = centerFirstChargeAfter(startDate, day);
  final cycleDays = centerDaysBetween(
    centerShiftMonths(nextCharge, -1, day),
    nextCharge,
  );
  final days = centerDaysBetween(startDate, nextCharge);
  if (b.firstMonth == 'full' ||
      b.billingDayMode == 'enrollment' ||
      days >= cycleDays) {
    return (
      cents: priceCents,
      prorated: false,
      days: cycleDays,
      cycleDays: cycleDays,
      nextCharge: nextCharge,
    );
  }
  return (
    cents: (priceCents * days / cycleDays).round(),
    prorated: true,
    days: days,
    cycleDays: cycleDays,
    nextCharge: nextCharge,
  );
}

const _monthsShort = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/// "R\$ 320" / "R\$ 80,50" — o `formatBRL` do portal (vai na auditoria e na
/// cobrança, que o portal também mostra).
String centerBrl(int cents) {
  final whole = (cents.abs() ~/ 100).toString().replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => '.',
  );
  final frac = cents.abs() % 100;
  return 'R\$ ${cents < 0 ? '-' : ''}$whole'
      '${frac == 0 ? '' : ',${frac.toString().padLeft(2, '0')}'}';
}

/// "22 out".
String centerDayLabel(String key) {
  final p = _parse(key);
  return '${p.d.toString().padLeft(2, '0')} ${_monthsShort[p.m - 1]}';
}

/// O que a 1ª cobrança da matrícula leva (valor, referência e o detalhe do
/// evento "Cobrança criada"), como no `firstInvoice` do portal.
({int amountCents, String reference, String detailSuffix}) centerEnrollInvoice({
  required Map<String, Object?> contract,
  required CenterBillingConfig billing,
  required String startDate,
  required String today,
}) {
  final start = startDate.compareTo(today) > 0 ? startDate : today;
  final price = contract['priceCents'] as int;
  final name = contract['planName'] as String;
  final monthly = contract['planType'] == 'monthly';
  final first = monthly ? centerFirstInvoice(price, billing, start) : null;
  final month = _monthsShort[_parse(start).m - 1];
  return (
    amountCents: first?.cents ?? price,
    reference: monthly
        ? '$name · $month${first!.prorated ? ' (proporcional)' : ''}'
        : name,
    detailSuffix: first != null && first.prorated
        ? ' · ${first.days}/${first.cycleDays} dias até o vencimento '
              '${centerDayLabel(first.nextCharge)}'
        : '',
  );
}

/// Status com que a matrícula nasce: ativa direto se o centro ativa na
/// confirmação; senão pendente até o pagamento.
String centerEnrollStatus(Map<String, Object?> rawPolicies) =>
    centerPoliciesSnapshot(rawPolicies)['activation'] == 'on_confirmation'
    ? 'active'
    : 'pending';

/// Turma lotada — a mesma conta da transação do portal (`seatsTaken >=
/// capacity`).
bool centerClassIsFull(CenterCoachClass c) => c.seatsTaken >= c.capacity;

/// Outras turmas ativas da mesma modalidade e nível com vaga (alternativa à
/// lotada, `alternativeClasses`).
List<CenterCoachClass> centerAlternativeClasses(
  List<CenterCoachClass> classes,
  CenterCoachClass cls,
) => [
  for (final c in classes)
    if (c.id != cls.id &&
        c.status == 'active' &&
        c.programId == cls.programId &&
        c.level == cls.level &&
        !centerClassIsFull(c))
      c,
];

/// Quem paga: o responsável do menor, ou o próprio aluno (`payerNameFor`).
String centerPayerName(CenterCoachStudent s) =>
    s.isMinor && s.guardianName.trim().isNotEmpty
    ? s.guardianName.trim()
    : s.name;

/// Resultado da matrícula.
sealed class CenterEnrollResult {
  const CenterEnrollResult();
}

class CenterEnrolled extends CenterEnrollResult {
  const CenterEnrolled({
    required this.enrollmentId,
    required this.status,
    this.invoiceId,
    this.amountCents,
    this.holdUntil,
  });

  final String enrollmentId;

  /// `active` ou `pending`.
  final String status;

  /// Cobrança criada junto (`null` quando quem matriculou não emite).
  final String? invoiceId;
  final int? amountCents;
  final DateTime? holdUntil;
}

/// Outra pessoa pegou a última vaga enquanto a tela estava aberta.
class CenterEnrollFull extends CenterEnrollResult {
  const CenterEnrollFull({required this.capacity, required this.seatsTaken});

  final int capacity;
  final int seatsTaken;
}

class CenterWaitlisted extends CenterEnrollResult {
  const CenterWaitlisted({required this.enrollmentId, required this.position});

  final String enrollmentId;

  /// Posição na fila (1 = próxima).
  final int position;
}

/// Roster da turma depois de entrar/sair um aluno (`rosterAfter`).
List<String> centerRosterAfter(List<String> roster, String studentId, int delta) {
  if (delta > 0) return roster.contains(studentId) ? roster : [...roster, studentId];
  if (delta < 0) return [for (final id in roster) if (id != studentId) id];
  return roster;
}

// ── Locais (L6) ─────────────────────────────────────────────────────────

class CenterWindow {
  const CenterWindow({
    required this.weekdays,
    required this.start,
    required this.end,
  });

  /// 0 = domingo … 6 = sábado (como no portal).
  final List<int> weekdays;
  final String start;
  final String end;
}

/// Local onde as aulas acontecem (`locations/{id}`).
class CenterLocation {
  const CenterLocation({
    required this.id,
    required this.name,
    this.type = 'own',
    this.address = '',
    this.status = 'active',
    this.isPrimary = false,
    this.windows = const [],
  });

  factory CenterLocation.fromMap(String id, Map<String, Object?> m) {
    final raw = m['windows'];
    return CenterLocation(
      id: id,
      name: _str(m['name'], 'Local'),
      type: m['type'] == 'partner' || m['type'] == 'adhoc'
          ? m['type'] as String
          : 'own',
      address: _str(m['address']),
      status: m['status'] == 'archived' ? 'archived' : 'active',
      isPrimary: m['isPrimary'] == true,
      windows: raw is List
          ? [
              for (final w in raw)
                if (w is Map)
                  CenterWindow(
                    weekdays: [
                      for (final d in (w['weekdays'] is List
                          ? w['weekdays'] as List
                          : const []))
                        if (d is num && d >= 0 && d <= 6) d.toInt(),
                    ],
                    start: _str(w['start'], '00:00'),
                    end: _str(w['end'], '23:59'),
                  ),
            ]
          : const [],
    );
  }

  final String id;
  final String name;

  /// `own` (próprio), `partner` (parceiro, só na janela) ou `adhoc` (avulso).
  final String type;
  final String address;
  final String status;
  final bool isPrimary;
  final List<CenterWindow> windows;

  bool get isActive => status == 'active';

  String get typeLabel => switch (type) {
    'partner' => 'Parceiro',
    'adhoc' => 'Avulso',
    _ => 'Próprio',
  };
}

/// Quadra de um local próprio (`courts/{id}`).
class CenterCourt {
  const CenterCourt({
    required this.id,
    required this.name,
    this.locationId = '',
    this.status = 'active',
  });

  factory CenterCourt.fromMap(String id, Map<String, Object?> m) =>
      CenterCourt(
        id: id,
        name: _str(m['name'], 'Quadra'),
        locationId: _str(m['locationId']),
        status: m['status'] == 'maintenance' ? 'maintenance' : 'active',
      );

  final String id;
  final String name;
  final String locationId;
  final String status;

  bool get isActive => status == 'active';
}

int _minutes(String hm) {
  final p = hm.split(':');
  if (p.length != 2) return 0;
  return (int.tryParse(p[0]) ?? 0) * 60 + (int.tryParse(p[1]) ?? 0);
}

String _hm(int min) =>
    '${(min ~/ 60).toString().padLeft(2, '0')}:${(min % 60).toString().padLeft(2, '0')}';

const _weekdayShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/// "Sáb · 08:00–12:00 / Seg, Qua · 18:00–22:00".
String centerWindowLabel(List<CenterWindow> windows) {
  if (windows.isEmpty) return 'Sem janela contratada';
  const order = [1, 2, 3, 4, 5, 6, 0];
  return windows
      .map(
        (w) =>
            '${order.where(w.weekdays.contains).map((d) => _weekdayShort[d]).join(', ')} · ${w.start}–${w.end}',
      )
      .join(' / ');
}

/// Uma conferência antes de mudar o local (janela, quadra, professor,
/// deslocamento).
typedef CenterPlaceCheck = ({String label, bool ok, String detail});

/// L3/L6 — conferências de mudar o local de UMA aula (`sessionMoveChecks`).
List<CenterPlaceCheck> centerSessionMoveChecks({
  required CenterCoachSession session,
  required CenterLocation location,
  String courtId = '',
  String courtName = '',
  required List<CenterCoachSession> sameDay,
  required int travelBufferMin,
}) {
  final out = <CenterPlaceCheck>[];
  final p = _parse(session.date);
  final wd = DateTime.utc(p.y, p.m, p.d).weekday % 7;
  final s0 = _minutes(session.startTime);
  final s1 = s0 + session.durationMin;
  if (location.type == 'partner' && location.windows.isNotEmpty) {
    final inside = location.windows.any(
      (w) =>
          w.weekdays.contains(wd) &&
          _minutes(w.start) <= s0 &&
          s1 <= _minutes(w.end),
    );
    out.add((
      label: 'Janela contratada em ${location.name}',
      ok: inside,
      detail: inside
          ? '${centerWindowLabel(location.windows)} · dentro'
          : 'fora de ${centerWindowLabel(location.windows)}',
    ));
  } else if (location.type == 'partner') {
    out.add((
      label: 'Janela contratada em ${location.name}',
      ok: true,
      detail: 'Sem janela contratada',
    ));
  }
  final others = [
    for (final o in sameDay)
      if (o.id != session.id && o.date == session.date && !o.isCancelled) o,
  ];
  bool overlaps(CenterCoachSession o) =>
      _minutes(o.startTime) < s1 && s0 < _minutes(o.startTime) + o.durationMin;
  if (location.type == 'own' && courtId.isNotEmpty) {
    final clash = others
        .where((o) => o.courtId == courtId && overlaps(o))
        .firstOrNull;
    out.add((
      label: '${courtName.isEmpty ? 'Quadra' : courtName} livre',
      ok: clash == null,
      detail: clash == null
          ? 'livre no horário'
          : 'ocupada por ${clash.className} ${clash.startTime}',
    ));
  }
  final mine = [
    for (final o in others)
      if (o.coachUid.isNotEmpty && o.coachUid == session.coachUid) o,
  ];
  final overlap = mine.where(overlaps).firstOrNull;
  out.add((
    label: 'Agenda do professor',
    ok: overlap == null,
    detail: overlap == null
        ? 'livre ${session.startTime}–${_hm(s1)}'
        : 'dá ${overlap.className} ${overlap.startTime}',
  ));
  final tight = mine.where((o) {
    if (o.locationId.isEmpty || o.locationId == location.id) return false;
    final o0 = _minutes(o.startTime);
    final o1 = o0 + o.durationMin;
    final gap = o1 <= s0 ? s0 - o1 : (s1 <= o0 ? o0 - s1 : -1);
    return gap >= 0 && gap < travelBufferMin;
  }).firstOrNull;
  out.add((
    label: 'Deslocamento do professor',
    ok: tight == null,
    detail: tight == null
        ? 'folga de $travelBufferMin min respeitada'
        : '${tight.className} ${tight.startTime} em outro local · menos de $travelBufferMin min',
  ));
  return out;
}

/// "Sede Barra · Quadra 2".
String centerPlaceLabel(String locationName, String courtName) {
  final parts = [locationName, courtName].where((x) => x.isNotEmpty);
  return parts.isEmpty ? 'Local a definir' : parts.join(' · ');
}

// ── Assinatura (R6) ──────────────────────────────────────────────────────

/// Assinatura da mensalidade (`subscriptions/{enrollmentId}`), andada pelo
/// servidor; a gestão agenda/desfaz o cancelamento no fim do ciclo.
class CenterSubscription {
  const CenterSubscription({
    required this.id,
    required this.studentId,
    required this.status,
    this.enrollmentId = '',
    this.studentName = '',
    this.payerName = '',
    this.className = '',
    this.planName = '',
    this.priceCents = 0,
    this.billingDay = 5,
    this.method = 'pix_manual',
    this.startDate = '',
    this.nextChargeDate = '',
    this.cancelAt,
    this.pausedUntil,
  });

  factory CenterSubscription.fromMap(String id, Map<String, Object?> m) {
    const statuses = [
      'active',
      'past_due',
      'paused',
      'canceling',
      'cancelled',
      'suspended',
    ];
    final status = _str(m['status']);
    final method = _str(m['method']);
    final student = _str(m['studentName'], 'Aluno');
    return CenterSubscription(
      id: id,
      enrollmentId: _str(m['enrollmentId'], id),
      studentId: _str(m['studentId']),
      studentName: student,
      payerName: _str(m['payerName'], student),
      className: _str(m['className']),
      planName: _str(m['planName']),
      priceCents: _num(m['priceCents']) ?? 0,
      billingDay: _num(m['billingDay']) ?? 5,
      method: method == 'card' || method == 'pix_auto' ? method : 'pix_manual',
      status: statuses.contains(status) ? status : 'active',
      startDate: _str(m['startDate']),
      nextChargeDate: _str(m['nextChargeDate']),
      cancelAt: _strOrNull(m['cancelAt']),
      pausedUntil: _strOrNull(m['pausedUntil']),
    );
  }

  final String id;
  final String enrollmentId;
  final String studentId;
  final String studentName;
  final String payerName;
  final String className;
  final String planName;
  final int priceCents;
  final int billingDay;

  /// `card`, `pix_auto` ou `pix_manual`.
  final String method;

  /// `active`, `past_due`, `paused`, `canceling`, `cancelled`, `suspended`.
  final String status;
  final String startDate;
  final String nextChargeDate;
  final String? cancelAt;
  final String? pausedUntil;

  String get statusLabel => switch (status) {
    'past_due' => 'Em atraso',
    'paused' => 'Pausada',
    'canceling' => 'Cancela no fim do ciclo',
    'cancelled' => 'Encerrada',
    'suspended' => 'Suspensa',
    _ => 'Em dia',
  };

  /// `green`, `red`, `yellow` ou `dim`.
  String get statusTone => switch (status) {
    'active' => 'green',
    'past_due' || 'suspended' => 'red',
    _ => 'dim',
  };

  String get methodLabel => switch (method) {
    'card' => 'Cartão recorrente',
    'pix_auto' => 'Pix Automático',
    _ => 'Pix mensal',
  };

  bool get canScheduleCancel => status == 'active' || status == 'past_due';
  bool get canUndoCancel => status == 'canceling';
  bool get canChargeNow => status == 'active' || status == 'past_due';
}

/// "Nov 2026" para o ciclo "2026-11".
String centerCycleTitle(String cycle) {
  if (cycle.length < 7) return cycle;
  final m = int.tryParse(cycle.substring(5, 7)) ?? 1;
  final label = _monthsShort[(m - 1).clamp(0, 11)];
  return '${label[0].toUpperCase()}${label.substring(1)} ${cycle.substring(0, 4)}';
}

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

int? _num(Object? v) => v is num ? v.round() : null;

List<String> _strings(Object? v) => v is List
    ? [
        for (final x in v)
          if (x is String && x.isNotEmpty) x,
      ]
    : const [];

// ── Novo aluno (W10 do portal) ───────────────────────────────────────────

/// Responsável legal do aluno menor (pagador e contato principal).
typedef CenterGuardianInput = ({
  String name,
  String relation,
  String email,
  String phone,
});

/// Cadastro de aluno: conta NexaGO existente ([uid]) ou convite por e-mail.
/// Mesmo formato do `StudentInput` do portal (`students.actions.ts`).
class CenterNewStudentInput {
  const CenterNewStudentInput({
    this.uid,
    required this.name,
    this.email = '',
    this.phone = '',
    this.isMinor = false,
    this.birthDate,
    this.guardian,
  });

  /// Conta vinculada (nasce `active`); `null` = convidado por e-mail.
  final String? uid;
  final String name;
  final String email;
  final String phone;
  final bool isMinor;

  /// `YYYY-MM-DD` (só menor).
  final String? birthDate;
  final CenterGuardianInput? guardian;

  bool get linked => uid != null && uid!.isNotEmpty;
}

final _dayKeyRe = RegExp(r'^\d{4}-\d{2}-\d{2}$');

/// Problemas do formulário de novo aluno, na ordem em que aparecem na tela
/// (vazio = ok). Espelha `problems` do `add-student-modal` do portal.
List<String> centerNewStudentProblems({
  required CenterNewStudentInput input,
  required Iterable<CenterCoachStudent> existing,
}) {
  final p = <String>[];
  final email = input.email.trim().toLowerCase();
  if (input.linked) {
    if (existing.any((s) => s.uid == input.uid)) {
      p.add('Essa conta já é aluno deste centro.');
    }
  } else {
    if (input.name.trim().length < 3) p.add('Informe o nome completo.');
    if (!_emailRe.hasMatch(email)) p.add('Informe um e-mail válido.');
  }
  if (email.isNotEmpty && !_emailRe.hasMatch(email)) p.add('E-mail inválido.');
  if (email.isNotEmpty && existing.any((s) => s.email.toLowerCase() == email)) {
    p.add('Já existe aluno com esse e-mail neste centro.');
  }
  if (input.isMinor) {
    final g = input.guardian;
    if (!_dayKeyRe.hasMatch(input.birthDate ?? '')) {
      p.add('Informe a data de nascimento.');
    }
    if (g == null || g.name.trim().length < 3) {
      p.add('Informe o nome do responsável.');
    }
    if (g == null || g.relation.trim().isEmpty) p.add('Informe o parentesco.');
    if (g == null || !_emailRe.hasMatch(g.email.trim().toLowerCase())) {
      p.add('Informe o e-mail do responsável.');
    }
    if (g == null || g.phone.replaceAll(RegExp(r'\D'), '').length < 10) {
      p.add('Informe o telefone do responsável.');
    }
  }
  return p.toSet().toList();
}

/// Doc de `students/{id}` do cadastro — o mesmo que o portal grava. Conta
/// vinculada nasce ativa; só e-mail, convidada (vira ativa no aceite pelo
/// app). Consentimento LGPD nasce pendente.
Map<String, Object?> centerNewStudentDoc(CenterNewStudentInput input) {
  final g = input.isMinor ? input.guardian : null;
  return {
    'uid': input.linked ? input.uid : null,
    'name': input.name.trim(),
    'email': input.email.trim().toLowerCase(),
    'phone': input.phone.trim(),
    'isMinor': input.isMinor,
    'birthDate': input.isMinor ? input.birthDate : null,
    'guardian': g == null
        ? null
        : {
            'name': g.name.trim(),
            'relation': g.relation.trim(),
            'email': g.email.trim().toLowerCase(),
            'phone': g.phone.trim(),
          },
    'imageUseAllowed': false,
    'notifyClasses': true,
    'emergencyName': '',
    'emergencyPhone': '',
    'medicalNotes': '',
    'status': input.linked ? 'active' : 'invited',
    'lgpdConsentAt': null,
    'makeupCredits': 0,
  };
}

/// Linha da auditoria (`student.added`), mesmo texto do portal.
String centerNewStudentAuditDetail(CenterNewStudentInput input) =>
    '${input.name.trim()} '
    '${input.linked ? 'vinculado ao centro' : 'convidado por e-mail'}'
    '${input.isMinor ? ' · menor' : ''}';
