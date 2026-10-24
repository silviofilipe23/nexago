import 'center_coach.dart';
import 'center_students.dart' show centerWhatsAppDigits;

/// Captação (C6–C8): interessados do centro (`trainingCenters/{c}/leads`),
/// a config `settings/leads` e a aula experimental. Contrato em
/// `functions/src/training-center-leads-model.ts`. Puro: o repositório já
/// converte `Timestamp` → `DateTime`.

// ── Rótulos ──────────────────────────────────────────────────────────────

const Map<String, String> kCenterLeadSourceLabels = {
  'instagram': 'Instagram',
  'referral': 'Indicação',
  'page': 'Página do CT',
  'desk': 'Balcão',
  'whatsapp': 'WhatsApp',
  'google': 'Google',
  'app': 'App NexaGO',
  'other': 'Outro',
};

const Map<String, String> kCenterLeadStageLabels = {
  'new': 'Novos',
  'contacted': 'Em contato',
  'scheduled': 'Experimental agendada',
  'attended': 'Fez experimental',
  'won': 'Matriculados',
  'lost': 'Perdidos',
};

const Map<String, String> kCenterLeadExperienceLabels = {
  'never': 'Nunca jogou',
  'plays': 'Já joga',
  'competes': 'Compete',
};

const Map<String, String> kCenterLeadPeriodLabels = {
  'morning': 'Manhã',
  'afternoon': 'Tarde',
  'night': 'Noite',
};

const Map<String, String> kCenterLeadLevelLabels = {
  'beginner': 'Iniciante',
  'intermediate': 'Intermediário',
  'advanced': 'Avançado',
};

const Map<String, String> kCenterLeadLostReasonLabels = {
  'price': 'Preço',
  'schedule': 'Horário',
  'no_response': 'Sem resposta',
  'other': 'Outro',
};

/// Chips "Como conheceu" do cadastro no balcão (C7), na ordem da tela.
const List<(String, String)> kCenterLeadSourceChoices = [
  ('desk', 'Passou na frente'),
  ('referral', 'Indicação'),
  ('instagram', 'Instagram'),
  ('whatsapp', 'WhatsApp'),
  ('google', 'Google'),
  ('other', 'Outro'),
];

// ── Modelo ───────────────────────────────────────────────────────────────

/// Resumo da experimental no doc do interessado (`lead.trial`, só o servidor
/// grava).
class CenterLeadTrial {
  const CenterLeadTrial({
    this.bookingId = '',
    this.sessionId = '',
    this.classId = '',
    this.className = '',
    this.date = '',
    this.startTime = '',
    this.endTime = '',
    this.coachName = '',
    this.locationName = '',
    this.status = 'confirmed',
    this.attendance,
  });

  factory CenterLeadTrial.fromMap(Map<String, Object?> m) => CenterLeadTrial(
        bookingId: _str(m['bookingId']),
        sessionId: _str(m['sessionId']),
        classId: _str(m['classId']),
        className: _str(m['className'], 'Turma'),
        date: _str(m['date']),
        startTime: _str(m['startTime']),
        endTime: _str(m['endTime']),
        coachName: _str(m['coachName']),
        locationName: _str(m['locationName']),
        status: _str(m['status'], 'confirmed'),
        attendance:
            _str(m['attendance']).isEmpty ? null : _str(m['attendance']),
      );

  final String bookingId;
  final String sessionId;
  final String classId;
  final String className;

  /// `YYYY-MM-DD` (dia no fuso do centro).
  final String date;
  final String startTime;
  final String endTime;
  final String coachName;
  final String locationName;

  /// `pending`, `confirmed`, `declined` ou `canceled`.
  final String status;

  /// `attended`, `no_show` ou `null`.
  final String? attendance;

  bool get isActive => status == 'pending' || status == 'confirmed';
}

/// Avaliação do professor depois da experimental (`lead.coachFeedback`).
class CenterLeadFeedback {
  const CenterLeadFeedback({
    this.level = '',
    this.classId = '',
    this.className = '',
    this.note = '',
    this.byName = '',
    this.at,
  });

  factory CenterLeadFeedback.fromMap(Map<String, Object?> m) =>
      CenterLeadFeedback(
        level: _str(m['level']),
        classId: _str(m['classId']),
        className: _str(m['className']),
        note: _str(m['note']),
        byName: _str(m['byName']),
        at: _date(m['at']),
      );

  final String level;
  final String classId;
  final String className;
  final String note;
  final String byName;
  final DateTime? at;
}

class CenterLeadHistoryEntry {
  const CenterLeadHistoryEntry({
    required this.kind,
    this.text = '',
    this.byName = '',
    this.at,
  });

  factory CenterLeadHistoryEntry.fromMap(Map<String, Object?> m) =>
      CenterLeadHistoryEntry(
        kind: _str(m['kind'], 'note'),
        text: _str(m['text']),
        byName: _str(m['byName']),
        at: _date(m['at']),
      );

  final String kind;
  final String text;
  final String byName;
  final DateTime? at;
}

/// Interessado (`trainingCenters/{c}/leads/{id}`); pode não ter conta NexaGO.
class CenterLead {
  const CenterLead({
    required this.id,
    required this.name,
    this.phone = '',
    this.phoneDigits = '',
    this.email = '',
    this.age,
    this.source = 'other',
    this.referredBy = '',
    this.programId = '',
    this.programName = '',
    this.experience = '',
    this.period = '',
    this.goal = '',
    this.stage = 'new',
    this.lostReason,
    this.ownerUid,
    this.ownerName = '',
    this.athleteId,
    this.studentId,
    this.proposalUntil,
    this.history = const [],
    this.createdAt,
    this.updatedAt,
    this.firstContactAt,
    this.trial,
    this.coachFeedback,
    this.trialsCount = 0,
  });

  factory CenterLead.fromMap(String id, Map<String, Object?> m) {
    final interest =
        m['interest'] is Map ? _map(m['interest'] as Map) : const {};
    final history = m['history'];
    return CenterLead(
      id: id,
      name: _str(m['name'], 'Interessado'),
      phone: _str(m['phone']),
      phoneDigits: _str(m['phoneDigits']),
      email: _str(m['email']),
      age: _int(m['age']),
      source: _str(m['source'], 'other'),
      referredBy: _str(m['referredBy']),
      programId: _str(interest['programId']),
      programName: _str(interest['programName']),
      experience: _str(interest['experience']),
      period: _str(interest['period']),
      goal: _str(interest['goal']),
      stage: _str(m['stage'], 'new'),
      lostReason: _str(m['lostReason']).isEmpty ? null : _str(m['lostReason']),
      ownerUid: _str(m['ownerUid']).isEmpty ? null : _str(m['ownerUid']),
      ownerName: _str(m['ownerName']),
      athleteId: _str(m['athleteId']).isEmpty ? null : _str(m['athleteId']),
      studentId: _str(m['studentId']).isEmpty ? null : _str(m['studentId']),
      proposalUntil:
          _str(m['proposalUntil']).isEmpty ? null : _str(m['proposalUntil']),
      history: history is List
          ? [
              for (final h in history)
                if (h is Map) CenterLeadHistoryEntry.fromMap(_map(h)),
            ]
          : const [],
      createdAt: _date(m['createdAt']),
      updatedAt: _date(m['updatedAt']),
      firstContactAt: _date(m['firstContactAt']),
      trial: m['trial'] is Map
          ? CenterLeadTrial.fromMap(_map(m['trial'] as Map))
          : null,
      coachFeedback: m['coachFeedback'] is Map
          ? CenterLeadFeedback.fromMap(_map(m['coachFeedback'] as Map))
          : null,
      trialsCount: _int(m['trialsCount']) ?? 0,
    );
  }

  final String id;
  final String name;
  final String phone;
  final String phoneDigits;
  final String email;
  final int? age;
  final String source;
  final String referredBy;
  final String programId;
  final String programName;
  final String experience;
  final String period;
  final String goal;

  /// `new`, `contacted`, `scheduled`, `attended`, `won` ou `lost`.
  final String stage;
  final String? lostReason;
  final String? ownerUid;
  final String ownerName;
  final String? athleteId;
  final String? studentId;
  final String? proposalUntil;
  final List<CenterLeadHistoryEntry> history;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? firstContactAt;
  final CenterLeadTrial? trial;
  final CenterLeadFeedback? coachFeedback;
  final int trialsCount;

  String get firstName {
    final p = name.trim().split(RegExp(r'\s+'));
    return p.isEmpty || p.first.isEmpty ? name : p.first;
  }

  /// Chave no espelho da aula (`sessions/{id}.trials`).
  String get trialKey => 'l_$id';
}

/// Config da captação (`settings/leads`); sem o doc, os padrões do contrato.
class CenterLeadSettings {
  const CenterLeadSettings({
    this.maxTrialsPerPerson = 1,
    this.maxTrialsPerSession = 2,
    this.onlyWithSpots = true,
    this.coachReview = 'required',
    this.offerDays = 7,
    this.publicPage = false,
    this.assignMode = 'staff',
    this.alertHours = 2,
  });

  factory CenterLeadSettings.fromMap(Map<String, Object?>? m) {
    if (m == null) return const CenterLeadSettings();
    int clamp(Object? v, int fallback, int min, int max) {
      final n = _int(v);
      return n == null || n < min || n > max ? fallback : n;
    }

    return CenterLeadSettings(
      maxTrialsPerPerson: clamp(m['maxTrialsPerPerson'], 1, 0, 10),
      maxTrialsPerSession: clamp(m['maxTrialsPerSession'], 2, 1, 10),
      onlyWithSpots:
          m['onlyWithSpots'] is bool ? m['onlyWithSpots'] as bool : true,
      coachReview: m['coachReview'] == 'optional' ? 'optional' : 'required',
      offerDays: clamp(m['offerDays'], 7, 0, 60),
      publicPage: m['publicPage'] == true,
      assignMode: m['assignMode'] == 'rotation' ? 'rotation' : 'staff',
      alertHours: clamp(m['alertHours'], 2, 1, 168),
    );
  }

  final int maxTrialsPerPerson;
  final int maxTrialsPerSession;
  final bool onlyWithSpots;
  final String coachReview;
  final int offerDays;
  final bool publicPage;
  final String assignMode;
  final int alertHours;
}

// ── C6 · quadro da captação ──────────────────────────────────────────────

/// Linha do C6 já pronta para a tela.
class CenterLeadRow {
  const CenterLeadRow({
    required this.lead,
    required this.line,
    this.late = false,
  });

  final CenterLead lead;

  /// "Instagram · Beach Tennis · há 18 min".
  final String line;

  /// Novo sem resposta há mais de `alertHours`.
  final bool late;
}

class CenterLeadsBoard {
  const CenterLeadsBoard({
    required this.respondNow,
    required this.contacted,
    required this.trialToday,
    required this.trialsScheduled,
    required this.attended,
    required this.newCount,
    required this.scheduledCount,
    required this.conversionPercent,
    required this.monthLeads,
    required this.monthWon,
  });

  final List<CenterLeadRow> respondNow;
  final List<CenterLeadRow> contacted;
  final List<CenterLeadRow> trialToday;
  final List<CenterLeadRow> trialsScheduled;
  final List<CenterLeadRow> attended;

  /// Topo: novos (stage `new`).
  final int newCount;

  /// Topo: experimentais agendadas (stage `scheduled`, hoje incluso).
  final int scheduledCount;

  /// Topo: conversão do mês (ver [buildCenterLeadsBoard]); `null` = sem base.
  final int? conversionPercent;

  /// Subtítulo: interessados que chegaram no mês e matriculados no mês.
  final int monthLeads;
  final int monthWon;

  bool get isEmpty =>
      respondNow.isEmpty &&
      contacted.isEmpty &&
      trialToday.isEmpty &&
      trialsScheduled.isEmpty &&
      attended.isEmpty;
}

/// Novo sem resposta há [alertHours] horas ou mais (só sinaliza na UI).
bool centerLeadIsLate(CenterLead l, DateTime now, int alertHours) =>
    l.stage == 'new' &&
    l.createdAt != null &&
    now.difference(l.createdAt!) >= Duration(hours: alertHours);

/// "Beach Tennis", senão a experiência, senão "Interesse a definir".
String centerLeadInterestLabel(CenterLead l) {
  if (l.programName.isNotEmpty) return l.programName;
  final exp = kCenterLeadExperienceLabels[l.experience];
  return exp ?? 'Interesse a definir';
}

/// Monta o C6. Grupos: "Responder agora" (novos, mais antigos primeiro),
/// "Em contato", "Experimental hoje" (agendada com `trial.date == hoje`),
/// "Experimentais agendadas" (outras datas) e "Fizeram experimental".
/// Matriculados e perdidos ficam fora da lista (só entram nos números).
///
/// Conversão do mês = matriculados ÷ (matriculados + perdidos + fizeram
/// experimental), contando só quem teve `updatedAt` no mês corrente (fuso de
/// São Paulo): é a taxa de fechamento de quem chegou ao fim do funil — ou
/// está parado depois da experimental — neste mês.
CenterLeadsBoard buildCenterLeadsBoard({
  required List<CenterLead> leads,
  required DateTime now,
  required CenterLeadSettings settings,
}) {
  final todayKey = centerLeadDayKey(now);
  final monthKey = todayKey.substring(0, 7);
  bool inMonth(DateTime? at) =>
      at != null && centerLeadDayKey(at).startsWith(monthKey);

  final respond = <CenterLead>[];
  final contacted = <CenterLead>[];
  final today = <CenterLead>[];
  final scheduled = <CenterLead>[];
  final attended = <CenterLead>[];
  var won = 0, lost = 0, attendedMonth = 0, monthLeads = 0;
  for (final l in leads) {
    if (inMonth(l.createdAt)) monthLeads++;
    final touchedMonth = inMonth(l.updatedAt ?? l.createdAt);
    switch (l.stage) {
      case 'new':
        respond.add(l);
      case 'contacted':
        contacted.add(l);
      case 'scheduled':
        (l.trial?.date == todayKey ? today : scheduled).add(l);
      case 'attended':
        attended.add(l);
        if (touchedMonth) attendedMonth++;
      case 'won':
        if (touchedMonth) won++;
      case 'lost':
        if (touchedMonth) lost++;
    }
  }
  int byCreated(CenterLead a, CenterLead b) =>
      (a.createdAt ?? now).compareTo(b.createdAt ?? now);
  int byUpdatedDesc(CenterLead a, CenterLead b) =>
      (b.updatedAt ?? b.createdAt ?? now)
          .compareTo(a.updatedAt ?? a.createdAt ?? now);
  int byTrial(CenterLead a, CenterLead b) {
    final x = '${a.trial?.date ?? '9'} ${a.trial?.startTime ?? ''}';
    final y = '${b.trial?.date ?? '9'} ${b.trial?.startTime ?? ''}';
    return x.compareTo(y);
  }

  respond.sort(byCreated);
  contacted.sort(byUpdatedDesc);
  today.sort(byTrial);
  scheduled.sort(byTrial);
  attended.sort(byUpdatedDesc);

  String ago(DateTime? at) => at == null ? '' : centerLeadAgo(at, now);
  String join(List<String> parts) =>
      parts.where((s) => s.trim().isNotEmpty).join(' · ');
  String source(CenterLead l) => kCenterLeadSourceLabels[l.source] ?? 'Outro';

  final base = won + lost + attendedMonth;
  return CenterLeadsBoard(
    respondNow: [
      for (final l in respond)
        CenterLeadRow(
          lead: l,
          late: centerLeadIsLate(l, now, settings.alertHours),
          line: join([
            source(l),
            centerLeadInterestLabel(l),
            ago(l.createdAt),
          ]),
        ),
    ],
    contacted: [
      for (final l in contacted)
        CenterLeadRow(
          lead: l,
          line: join([
            source(l),
            centerLeadInterestLabel(l),
            ago(l.updatedAt ?? l.createdAt),
          ]),
        ),
    ],
    trialToday: [
      for (final l in today)
        CenterLeadRow(
          lead: l,
          line: join([
            l.trial!.className,
            l.trial!.startTime,
            _firstWord(l.trial!.coachName),
            centerLeadTrialStatusLabel(l.trial!),
          ]),
        ),
    ],
    trialsScheduled: [
      for (final l in scheduled)
        CenterLeadRow(
          lead: l,
          line: l.trial == null
              ? join([source(l), centerLeadInterestLabel(l)])
              : join([
                  centerLeadWeekdayDay(l.trial!.date),
                  l.trial!.startTime,
                  l.trial!.className,
                ]),
        ),
    ],
    attended: [
      for (final l in attended)
        CenterLeadRow(
          lead: l,
          line: join([
            l.coachFeedback == null
                ? (l.trial?.attendance == 'no_show'
                    ? 'Não veio'
                    : 'Aguardando avaliação')
                : join([
                    'Avaliado',
                    (kCenterLeadLevelLabels[l.coachFeedback!.level] ?? '')
                        .toLowerCase(),
                  ]),
            if (l.proposalUntil != null)
              'Proposta até ${centerLeadDayMonth(l.proposalUntil!)}'
            else
              ago(l.updatedAt ?? l.createdAt),
          ]),
        ),
    ],
    newCount: respond.length,
    scheduledCount: today.length + scheduled.length,
    conversionPercent: base == 0 ? null : (won * 100 / base).round(),
    monthLeads: monthLeads,
    monthWon: won,
  );
}

/// "OUT · 47 INTERESSADOS · 13 MATRICULADOS".
String centerLeadsSubtitle(CenterLeadsBoard b, DateTime now) {
  final month = _kMonths[int.parse(centerLeadDayKey(now).substring(5, 7)) - 1];
  return [
    month.toUpperCase(),
    b.monthLeads == 1 ? '1 INTERESSADO' : '${b.monthLeads} INTERESSADOS',
    b.monthWon == 1 ? '1 MATRICULADO' : '${b.monthWon} MATRICULADOS',
  ].join(' · ');
}

String centerLeadTrialStatusLabel(CenterLeadTrial t) => switch (t.status) {
      'pending' => 'Aguardando',
      'declined' => 'Recusada',
      'canceled' => 'Cancelada',
      _ => 'Confirmada',
    };

// ── C7 · novo interessado ────────────────────────────────────────────────

class CenterNewLeadInput {
  const CenterNewLeadInput({
    required this.name,
    required this.phone,
    this.programId = '',
    this.programName = '',
    this.experience = '',
    this.period = '',
    this.source = 'desk',
  });

  final String name;
  final String phone;
  final String programId;
  final String programName;
  final String experience;
  final String period;
  final String source;
}

/// Só dígitos, sem o DDI 55 — a mesma chave do servidor (`phoneDigits`).
String centerLeadPhoneDigits(String phone) {
  final d = phone.replaceAll(RegExp(r'\D'), '');
  return (d.length == 12 || d.length == 13) && d.startsWith('55')
      ? d.substring(2)
      : d;
}

/// DDD + número (10 ou 11 dígitos), como `isValidBrPhone` do servidor.
bool centerLeadPhoneValid(String phone) => RegExp(
      r'^[1-9][0-9]9?[0-9]{8}$',
    ).hasMatch(centerLeadPhoneDigits(phone));

/// O que falta para salvar (o primeiro vai na tela); vazio = pode salvar.
List<String> centerNewLeadProblems(CenterNewLeadInput i) => [
      if (i.name.trim().length < 2) 'Informe o nome do interessado.',
      if (i.name.trim().length > 80) 'Nome com no máximo 80 caracteres.',
      if (!centerLeadPhoneValid(i.phone))
        'Informe um WhatsApp com DDD (10 ou 11 dígitos).',
    ];

/// Campos do doc novo (sem datas, histórico e auditoria — o repositório põe).
/// `trial`, `coachFeedback` e `trialsCount` são do servidor e não vão.
Map<String, Object?> centerNewLeadFields(
  CenterNewLeadInput i, {
  required String actorUid,
  required String actorName,
}) =>
    {
      'name': i.name.trim(),
      'phone': i.phone.trim(),
      'phoneDigits': centerLeadPhoneDigits(i.phone),
      'email': '',
      'age': null,
      'source':
          kCenterLeadSourceLabels.containsKey(i.source) ? i.source : 'other',
      'referredBy': '',
      'interest': {
        'programId': i.programId,
        'programName': i.programName,
        'experience': i.experience,
        'period': i.period,
        'goal': '',
      },
      'stage': 'new',
      'lostReason': null,
      'ownerUid': actorUid.isEmpty ? null : actorUid,
      'ownerName': actorName,
      'athleteId': null,
      'studentId': null,
      'enrollmentId': null,
      'proposalUntil': null,
      'firstContactAt': null,
      'createdByUid': actorUid.isEmpty ? null : actorUid,
      'createdByName': actorName,
    };

/// Texto da linha do histórico ao mudar de etapa.
String centerLeadStageHistoryText(String stage, {String? lostReason}) =>
    switch (stage) {
      'contacted' => 'Marcado como em contato',
      'lost' => 'Marcado como perdido · '
          '${kCenterLeadLostReasonLabels[lostReason] ?? 'Outro'}',
      _ => 'Etapa: ${kCenterLeadStageLabels[stage] ?? stage}',
    };

// ── Agendar experimental ─────────────────────────────────────────────────

/// Aula que pode receber a experimental (sheet de horários).
class CenterTrialSlot {
  const CenterTrialSlot({
    required this.session,
    required this.cls,
    required this.free,
    required this.trials,
    this.blockedReason,
  });

  final CenterCoachSession session;
  final CenterCoachClass? cls;

  /// Vagas que sobram (`null` = turma sem limite).
  final int? free;
  final int trials;

  /// "Limite de experimentais atingido", "Sem vaga"… `null` = pode agendar.
  final String? blockedReason;

  bool get enabled => blockedReason == null;

  /// "2 vagas · 1 experimental".
  String get spotsLabel {
    final f = free == null
        ? 'Sem limite de vagas'
        : free == 1
            ? '1 vaga'
            : free == 0
                ? 'Sem vaga'
                : '$free vagas';
    final t = trials == 1 ? '1 experimental' : '$trials experimentais';
    return '$f · $t';
  }
}

/// Período do horário `HH:mm`: manhã (< 12h), tarde (< 18h) ou noite.
String centerLeadPeriodOf(String hm) {
  final h = int.tryParse(hm.split(':').first) ?? 0;
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'night';
}

/// Aulas agendadas de turmas ativas a partir de agora (até [toKey]), com a
/// ocupação e o bloqueio da config. [programId]/[period] vazios = sem filtro.
List<CenterTrialSlot> centerTrialSlots({
  required List<CenterCoachSession> sessions,
  required List<CenterCoachClass> classes,
  required CenterLeadSettings settings,
  required String todayKey,
  required String nowHm,
  required String toKey,
  String programId = '',
  String period = '',
  String? leadTrialKey,
}) {
  final byId = {for (final c in classes) c.id: c};
  final out = <CenterTrialSlot>[];
  for (final s in sessions) {
    if (s.status != 'scheduled') continue;
    if (s.date.compareTo(todayKey) < 0 || s.date.compareTo(toKey) > 0) continue;
    if (s.date == todayKey && s.startTime.compareTo(nowHm) <= 0) continue;
    final cls = byId[s.classId];
    if (cls == null || cls.status != 'active') continue;
    if (programId.isNotEmpty && cls.programId != programId) continue;
    if (period.isNotEmpty && centerLeadPeriodOf(s.startTime) != period) {
      continue;
    }
    final o = centerSessionOccupancy(cls, s);
    String? blocked;
    if (leadTrialKey != null && s.trials.any((t) => t.key == leadTrialKey)) {
      blocked = 'Já agendada nesta aula';
    } else if (o.trials >= settings.maxTrialsPerSession) {
      blocked = 'Limite de experimentais atingido';
    } else if (settings.onlyWithSpots && o.free == 0) {
      blocked = 'Sem vaga';
    }
    out.add(
      CenterTrialSlot(
        session: s,
        cls: cls,
        free: o.free,
        trials: o.trials,
        blockedReason: blocked,
      ),
    );
  }
  out.sort(
    (a, b) => '${a.session.date} ${a.session.startTime} ${a.session.id}'
        .compareTo('${b.session.date} ${b.session.startTime} ${b.session.id}'),
  );
  return out;
}

/// Mensagem de confirmação para o WhatsApp do interessado.
String centerLeadTrialMessage({
  required String leadName,
  required String centerName,
  required String dateKey,
  required String startTime,
  required String className,
  required String coachName,
}) {
  final first = leadName.trim().split(RegExp(r'\s+')).first;
  final coach = coachName.trim().isEmpty ? '' : ' com ${coachName.trim()}';
  return 'Olá, $first! Sua aula experimental no $centerName ficou para '
      '${centerLeadWeekdayDay(dateKey).toLowerCase()} às $startTime · '
      '$className$coach.';
}

/// `https://wa.me/55…` (com o texto, se houver); `null` sem número válido.
Uri? centerLeadWhatsAppUri(String phone, {String? text}) {
  final d = centerWhatsAppDigits(phone);
  if (d == null) return null;
  return Uri.https(
    'wa.me',
    '/$d',
    text == null || text.isEmpty ? null : {'text': text},
  );
}

/// `tel:` do interessado; `null` sem número.
Uri? centerLeadPhoneUri(String phone) {
  final d = phone.replaceAll(RegExp(r'[^\d+]'), '');
  return d.isEmpty ? null : Uri(scheme: 'tel', path: d);
}

// ── C8 · avaliar experimental ────────────────────────────────────────────

/// Turmas para indicar: ativas, as do mesmo programa da aula primeiro
/// (sem nenhuma do programa, todas as ativas).
List<CenterCoachClass> centerTrialSuggestedClasses({
  required List<CenterCoachClass> classes,
  required String programId,
}) {
  final active = [
    for (final c in classes)
      if (c.status == 'active') c,
  ];
  final same = [
    for (final c in active)
      if (programId.isNotEmpty && c.programId == programId) c,
  ];
  final list = same.isEmpty ? active : same;
  return list..sort((a, b) => a.name.compareTo(b.name));
}

/// "N vagas" da turma (capacidade − ocupadas); `null` sem limite.
String? centerClassSpotsLabel(CenterCoachClass c) {
  if (c.capacity <= 0) return null;
  final f = (c.capacity - c.seatsTaken).clamp(0, c.capacity);
  return f == 0
      ? 'Lotada'
      : f == 1
          ? '1 vaga'
          : '$f vagas';
}

/// "Já joga · quer competir" (o que o espelho da aula traz).
String centerTrialProfileLine(CenterSessionTrial t) => [
      kCenterLeadExperienceLabels[t.experience] ?? '',
      t.goal,
    ].where((s) => s.trim().isNotEmpty).join(' · ');

// ── datas ────────────────────────────────────────────────────────────────

const _kMonths = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

const _kWeekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/// Dia `YYYY-MM-DD` no fuso de São Paulo (UTC−3, sem horário de verão).
String centerLeadDayKey(DateTime at) {
  final l = at.toUtc().subtract(const Duration(hours: 3));
  return '${l.year.toString().padLeft(4, '0')}-${_two(l.month)}-'
      '${_two(l.day)}';
}

/// `HH:mm` no fuso de São Paulo.
String centerLeadHm(DateTime at) {
  final l = at.toUtc().subtract(const Duration(hours: 3));
  return '${_two(l.hour)}:${_two(l.minute)}';
}

/// "Seg 27/10".
String centerLeadWeekdayDay(String dateKey) {
  final d = DateTime.tryParse(dateKey);
  if (d == null) return dateKey;
  return '${_kWeekdays[d.weekday - 1]} ${_two(d.day)}/${_two(d.month)}';
}

/// "27/10".
String centerLeadDayMonth(String dateKey) {
  final p = dateKey.split('-');
  return p.length == 3 ? '${p[2]}/${p[1]}' : dateKey;
}

/// `YYYY-MM-DD` + [days].
String centerLeadShiftDay(String dateKey, int days) {
  final d = DateTime.tryParse(dateKey);
  if (d == null) return dateKey;
  final x = DateTime.utc(d.year, d.month, d.day).add(Duration(days: days));
  return '${x.year.toString().padLeft(4, '0')}-${_two(x.month)}-'
      '${_two(x.day)}';
}

/// "há 18 min", "há 2h", "há 3 dias".
String centerLeadAgo(DateTime from, DateTime now) {
  final m = now.difference(from).inMinutes;
  if (m < 60) return 'há ${m < 1 ? 1 : m} min';
  final h = m ~/ 60;
  if (h < 24) return 'há ${h}h';
  final d = h ~/ 24;
  return d == 1 ? 'há 1 dia' : 'há $d dias';
}

// ── auxiliares ───────────────────────────────────────────────────────────

String _two(int v) => v.toString().padLeft(2, '0');

String _firstWord(String s) {
  final p = s.trim().split(RegExp(r'\s+'));
  return p.isEmpty ? '' : p.first;
}

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

int? _int(Object? v) => v is num ? v.toInt() : null;

Map<String, Object?> _map(Map<dynamic, dynamic> m) =>
    m.map((k, v) => MapEntry('$k', v));

DateTime? _date(Object? v) => v is DateTime ? v : null;
