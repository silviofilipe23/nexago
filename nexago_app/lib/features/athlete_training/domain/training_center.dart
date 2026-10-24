import 'center_contract.dart';
import 'training_plans.dart';

/// Centro de treinamento visto pelo aluno — espelha `getMyTrainingCenters`
/// (`functions/src/training-center-athlete.ts`). As coleções do centro são
/// só da equipe; o servidor monta a visão do próprio aluno: matrículas, aulas
/// da janela (com o local DA DATA), regras e faturas.

class CenterEnrollment {
  const CenterEnrollment({
    required this.enrollmentId,
    required this.classId,
    required this.className,
    required this.status,
    this.startDate = '',
    this.pausedUntil,
    this.planName = 'Plano',
    this.planType = 'monthly',
    this.priceCents = 0,
    this.classesPerWeek,
    this.credits,
    this.creditsLeft,
    this.level = '',
    this.coachName = '',
    this.weekdays = const [],
    this.startTime = '',
    this.durationMin = 60,
    this.locationName = '',
    this.billingStatus,
    this.billingDay,
    this.billingMethod = '',
    this.nextChargeDate,
  });

  factory CenterEnrollment.fromMap(Map<String, Object?> m) {
    final billing = m['billing'] is Map ? _map(m['billing'] as Map) : null;
    final weekdays = m['weekdays'];
    return CenterEnrollment(
      enrollmentId: _str(m['enrollmentId']),
      classId: _str(m['classId']),
      className: _str(m['className'], 'Turma'),
      status: _str(m['status'], 'active'),
      startDate: _str(m['startDate']),
      pausedUntil: _strOrNull(m['pausedUntil']),
      planName: _str(m['planName'], 'Plano'),
      planType: _str(m['planType'], 'monthly'),
      priceCents: _int(m['priceCents']) ?? 0,
      classesPerWeek: _int(m['classesPerWeek']),
      credits: _int(m['credits']),
      creditsLeft: _int(m['creditsLeft']),
      level: _str(m['level']),
      coachName: _str(m['coachName']),
      weekdays: weekdays is List
          ? [
              for (final w in weekdays)
                if (w is num && w >= 1 && w <= 7) w.toInt(),
            ]
          : const [],
      startTime: _str(m['startTime']),
      durationMin: _int(m['durationMin']) ?? 60,
      locationName: _str(m['locationName']),
      billingStatus: billing == null ? null : _strOrNull(billing['status']),
      billingDay: billing == null ? null : _int(billing['billingDay']),
      billingMethod: billing == null ? '' : _str(billing['method']),
      nextChargeDate: billing == null
          ? null
          : _strOrNull(billing['nextChargeDate']),
    );
  }

  final String enrollmentId;
  final String classId;
  final String className;

  /// `active`, `paused`, `pending` ou `waitlisted`.
  final String status;
  final String startDate;
  final String? pausedUntil;
  final String planName;

  /// `monthly` ou `class_pack`.
  final String planType;
  final int priceCents;
  final int? classesPerWeek;
  final int? credits;
  final int? creditsLeft;
  final String level;
  final String coachName;

  /// ISO: 1 = segunda … 7 = domingo.
  final List<int> weekdays;
  final String startTime;
  final int durationMin;
  final String locationName;

  /// Assinatura mensal: `active`, `past_due`, `paused`, `canceling`…
  final String? billingStatus;
  final int? billingDay;

  /// `pix_manual`, `card` ou `pix_auto`.
  final String billingMethod;
  final String? nextChargeDate;

  bool get isPack => planType == 'class_pack';
  bool get isActive => status == 'active';
  double get priceReais => priceCents / 100;
}

class CenterSession {
  const CenterSession({
    required this.sessionId,
    required this.classId,
    required this.className,
    required this.date,
    required this.startTime,
    this.durationMin = 60,
    this.coachName = '',
    this.locationName = '',
    this.locationAddress = '',
    this.courtName = '',
    this.status = 'scheduled',
    this.locationChanged = false,
    this.defaultLocationName = '',
    this.changed = false,
    this.changeReason = '',
    this.myMark,
    this.isMakeup = false,
    this.myRsvp,
  });

  factory CenterSession.fromMap(Map<String, Object?> m) => CenterSession(
    sessionId: _str(m['sessionId']),
    classId: _str(m['classId']),
    className: _str(m['className'], 'Aula'),
    date: _str(m['date']),
    startTime: _str(m['startTime']),
    durationMin: _int(m['durationMin']) ?? 60,
    coachName: _str(m['coachName']),
    locationName: _str(m['locationName']),
    locationAddress: _str(m['locationAddress']),
    courtName: _str(m['courtName']),
    status: _str(m['status'], 'scheduled'),
    locationChanged: m['locationChanged'] == true,
    defaultLocationName: _str(m['defaultLocationName']),
    changed: m['changed'] == true,
    changeReason: _str(m['changeReason']),
    myMark: _strOrNull(m['myMark']),
    isMakeup: m['isMakeup'] == true,
    myRsvp: _strOrNull(m['myRsvp']),
  );

  final String sessionId;
  final String classId;
  final String className;

  /// `YYYY-MM-DD` (dia da aula no fuso do centro).
  final String date;

  /// `HH:mm`.
  final String startTime;
  final int durationMin;
  final String coachName;
  final String locationName;
  final String locationAddress;
  final String courtName;

  /// `scheduled`, `cancelled` ou `done`.
  final String status;

  /// O local desta data não é o padrão da turma.
  final bool locationChanged;
  final String defaultLocationName;

  /// Alterada só nesta data (horário, professor, quadra ou local).
  final bool changed;
  final String changeReason;

  /// `present`, `excused`, `absent` ou `null` (sem chamada).
  final String? myMark;
  final bool isMakeup;

  /// "Vou" (`going`) / "Não vou" (`not_going`) do aluno; `null` sem resposta.
  final String? myRsvp;

  bool get isCancelled => status == 'cancelled';
}

class CenterInvoice {
  const CenterInvoice({
    required this.invoiceId,
    required this.reference,
    required this.amountCents,
    required this.dueDate,
    required this.status,
    this.payUrl,
    this.paidOn,
    this.method = '',
    this.enrollmentId,
    this.blockedByContract = false,
  });

  factory CenterInvoice.fromMap(Map<String, Object?> m) => CenterInvoice(
    invoiceId: _str(m['invoiceId']),
    reference: _str(m['reference'], 'Mensalidade'),
    amountCents: _int(m['amountCents']) ?? 0,
    dueDate: _str(m['dueDate']),
    status: _str(m['status'], 'pending'),
    payUrl: _strOrNull(m['payUrl']),
    paidOn: _strOrNull(m['paidOn']),
    method: _str(m['method']),
    enrollmentId: _strOrNull(m['enrollmentId']),
    blockedByContract: m['blockedByContract'] == true,
  );

  final String invoiceId;
  final String reference;
  final int amountCents;

  /// `YYYY-MM-DD`.
  final String dueDate;

  /// `pending`, `approved`, `failed`, `refunded` ou `disputed`.
  final String status;

  /// Link de pagamento (Pix ou cartão) — só na fatura em aberto.
  final String? payUrl;
  final String? paidOn;
  final String method;

  /// Matrícula da fatura (`null` = cobrança avulsa).
  final String? enrollmentId;

  /// O contrato da matrícula exige assinatura antes do pagamento e ainda não
  /// foi assinado: sem link de pagamento até assinar.
  final bool blockedByContract;

  bool get isOpen => status == 'pending' || status == 'failed';
  bool get isPaid => status == 'approved';
  double get amountReais => amountCents / 100;

  /// Em aberto e já passou do vencimento ([todayKey] `YYYY-MM-DD`).
  bool isOverdue(String todayKey) =>
      isOpen && dueDate.isNotEmpty && dueDate.compareTo(todayKey) < 0;
}

/// Contrato/termo do aluno (K6–K9) — espelha `MyCenterContract` de
/// `functions/src/training-center-athlete.ts`. [body] é o texto congelado no
/// envio; [sha256] volta na assinatura para provar que é o mesmo texto.
class MyCenterContract {
  const MyCenterContract({
    required this.contractId,
    required this.number,
    required this.title,
    required this.status,
    this.kind = 'term',
    this.optional = false,
    this.templateVersion = 1,
    this.signerRole = 'student',
    this.signerName = '',
    this.studentName = '',
    this.enrollmentId,
    this.className = '',
    this.planName = '',
    this.priceCents,
    this.startDate,
    this.endDate,
    this.requireBeforePayment = false,
    this.sentOn,
    this.signedAt,
    this.body = '',
    this.sha256 = '',
    this.essentials = const [],
  });

  factory MyCenterContract.fromMap(Map<String, Object?> m) {
    final essentials = m['essentials'];
    return MyCenterContract(
      contractId: _str(m['contractId']),
      number: _str(m['number']),
      title: _str(m['title'], 'Contrato'),
      status: _str(m['status'], 'sent'),
      kind: _str(m['kind'], 'term'),
      optional: m['optional'] == true,
      templateVersion: _int(m['templateVersion']) ?? 1,
      signerRole: _str(m['signerRole'], 'student'),
      signerName: _str(m['signerName'], _str(m['studentName'])),
      studentName: _str(m['studentName']),
      enrollmentId: _strOrNull(m['enrollmentId']),
      className: _str(m['className']),
      planName: _str(m['planName']),
      priceCents: _int(m['priceCents']),
      startDate: _strOrNull(m['startDate']),
      endDate: _strOrNull(m['endDate']),
      requireBeforePayment: m['requireBeforePayment'] == true,
      sentOn: _strOrNull(m['sentOn']),
      signedAt: DateTime.tryParse(_str(m['signedAt'])),
      body: m['body'] is String ? m['body'] as String : '',
      sha256: _str(m['sha256']),
      essentials: essentials is List
          ? [
              for (final e in essentials)
                if (e is Map && _str(e['label']).isNotEmpty)
                  (label: _str(e['label']), value: _str(e['value'])),
            ]
          : const [],
    );
  }

  final String contractId;

  /// `CTR-2026-0418`.
  final String number;
  final String title;

  /// `sent`, `viewed`, `signed`, `declined` ou `terminated`.
  final String status;

  /// `enrollment` (matrícula) ou `term` (termo avulso).
  final String kind;

  /// Termo que o aluno pode recusar (ex.: uso de imagem).
  final bool optional;
  final int templateVersion;

  /// `student` ou `guardian` (menor: assina o responsável).
  final String signerRole;
  final String signerName;
  final String studentName;
  final String? enrollmentId;
  final String className;
  final String planName;
  final int? priceCents;

  /// `YYYY-MM-DD`; `null` no termo (vigência indeterminada).
  final String? startDate;
  final String? endDate;
  final bool requireBeforePayment;

  /// Dia do envio (`YYYY-MM-DD`, fuso do centro).
  final String? sentOn;

  /// Instante da assinatura (ou da recusa).
  final DateTime? signedAt;
  final String body;
  final String sha256;

  /// "O essencial" (só no contrato de matrícula).
  final List<({String label, String value})> essentials;

  bool get isOpen => status == 'sent' || status == 'viewed';
  bool get isSigned => status == 'signed';
  bool get isDeclined => status == 'declined';
  bool get isEnrollment => kind == 'enrollment';
  bool get asGuardian => signerRole == 'guardian';

  ContractState state(String todayKey) =>
      contractStateOf(status, endDate, todayKey);
}

class CenterLocation {
  const CenterLocation({
    required this.name,
    this.type = 'own',
    this.address = '',
    this.notes = '',
  });

  factory CenterLocation.fromMap(Map<String, Object?> m) => CenterLocation(
    name: _str(m['name'], 'Local'),
    type: _str(m['type'], 'own'),
    address: _str(m['address']),
    notes: _str(m['notes']),
  );

  final String name;

  /// `own`, `partner` ou `adhoc`.
  final String type;
  final String address;
  final String notes;
}

class CenterPolicies {
  const CenterPolicies({
    this.excusedNoticeHours = 4,
    this.excusedAbsenceMakeup = true,
    this.makeupValidityDays = 30,
    this.monthlyCancellation = 'end_of_cycle',
    this.allowPause = true,
  });

  factory CenterPolicies.fromMap(Map<String, Object?> m) => CenterPolicies(
    excusedNoticeHours: _int(m['excusedNoticeHours']) ?? 4,
    excusedAbsenceMakeup: m['excusedAbsenceMakeup'] != false,
    makeupValidityDays: _int(m['makeupValidityDays']) ?? 30,
    monthlyCancellation: _str(m['monthlyCancellation'], 'end_of_cycle'),
    allowPause: m['allowPause'] != false,
  );

  final int excusedNoticeHours;
  final bool excusedAbsenceMakeup;
  final int makeupValidityDays;

  /// `end_of_cycle` ou `immediate`.
  final String monthlyCancellation;
  final bool allowPause;
}

class TrainingCenterLink {
  const TrainingCenterLink({
    required this.centerId,
    required this.name,
    this.city = '',
    this.state = '',
    this.sports = const [],
    this.makeupCredits = 0,
    this.billingHold = false,
    this.checkinCode = '',
    this.policies = const CenterPolicies(),
    this.enrollments = const [],
    this.sessions = const [],
    this.locations = const [],
    this.invoices = const [],
    this.contracts = const [],
  });

  factory TrainingCenterLink.fromMap(Map<String, Object?> m) {
    List<T> list<T>(String key, T Function(Map<String, Object?>) of) {
      final raw = m[key];
      return raw is List
          ? [
              for (final e in raw)
                if (e is Map) of(_map(e)),
            ]
          : <T>[];
    }

    final sports = m['sports'];
    return TrainingCenterLink(
      centerId: _str(m['centerId']),
      name: _str(m['name'], 'Centro de treinamento'),
      city: _str(m['city']),
      state: _str(m['state']),
      sports: sports is List
          ? [
              for (final s in sports)
                if (s is String) s,
            ]
          : const [],
      makeupCredits: _int(m['makeupCredits']) ?? 0,
      billingHold: m['billingHold'] == true,
      checkinCode: _str(m['checkinCode']),
      policies: m['policies'] is Map
          ? CenterPolicies.fromMap(_map(m['policies'] as Map))
          : const CenterPolicies(),
      enrollments: list('enrollments', CenterEnrollment.fromMap),
      sessions: list('sessions', CenterSession.fromMap),
      locations: list('locations', CenterLocation.fromMap),
      invoices: list('invoices', CenterInvoice.fromMap),
      contracts: list('contracts', MyCenterContract.fromMap),
    );
  }

  final String centerId;
  final String name;
  final String city;
  final String state;
  final List<String> sports;
  final int makeupCredits;

  /// Mensalidade atrasada além do limite (o centro pode barrar o check-in).
  final bool billingHold;

  /// Carteirinha do check-in (vazio = servidor antigo).
  final String checkinCode;

  /// Conteúdo do QR da carteirinha.
  String get checkinQr =>
      checkinCode.isEmpty ? '' : 'nexago-ct:$centerId:$checkinCode';
  final CenterPolicies policies;
  final List<CenterEnrollment> enrollments;
  final List<CenterSession> sessions;
  final List<CenterLocation> locations;
  final List<CenterInvoice> invoices;

  /// Contratos e termos (abertos primeiro; `cancelled` não vem).
  final List<MyCenterContract> contracts;

  List<CenterInvoice> get openInvoices => [
    for (final i in invoices)
      if (i.isOpen) i,
  ];

  /// Esperando a assinatura do aluno.
  List<MyCenterContract> get openContracts => [
    for (final c in contracts)
      if (c.isOpen) c,
  ];

  MyCenterContract? contractById(String id) {
    for (final c in contracts) {
      if (c.contractId == id) return c;
    }
    return null;
  }

  /// Contrato aberto que segura o pagamento da matrícula [enrollmentId].
  MyCenterContract? blockingContractOf(String? enrollmentId) {
    if (enrollmentId == null) return null;
    for (final c in contracts) {
      if (c.isOpen && c.requireBeforePayment && c.enrollmentId == enrollmentId) {
        return c;
      }
    }
    return null;
  }

  /// Fatura em aberto da matrícula (a próxima a pagar depois de assinar).
  CenterInvoice? openInvoiceOf(String? enrollmentId) {
    if (enrollmentId == null) return null;
    CenterInvoice? best;
    for (final i in invoices) {
      if (!i.isOpen || i.enrollmentId != enrollmentId) continue;
      if (best == null || i.dueDate.compareTo(best.dueDate) < 0) best = i;
    }
    return best;
  }

  /// Professores que aparecem nas turmas e nas aulas, sem repetir. "Paula"
  /// (nome curto na aula) e "Paula Viana" (na turma) são a mesma pessoa: fica
  /// o nome mais completo.
  List<String> get coachNames {
    final out = <String>[];
    for (final raw in [
      ...enrollments.map((e) => e.coachName),
      ...sessions.map((s) => s.coachName),
    ]) {
      final n = raw.trim();
      if (n.isEmpty) continue;
      final i = out.indexWhere((o) => o.startsWith(n) || n.startsWith(o));
      if (i < 0) {
        out.add(n);
      } else if (n.length > out[i].length) {
        out[i] = n;
      }
    }
    return out;
  }

  /// "Rio de Janeiro · RJ".
  String get placeLabel => [city, state].where((s) => s.isNotEmpty).join(' · ');

  CenterSession? sessionById(String id) {
    for (final s in sessions) {
      if (s.sessionId == id) return s;
    }
    return null;
  }

  /// Frequência do mês de [todayKey]: presenças sobre as aulas com chamada.
  /// `null` sem chamada no mês.
  int? monthPresencePercent(String todayKey) {
    if (todayKey.length < 7) return null;
    final month = todayKey.substring(0, 7);
    var present = 0, marked = 0;
    for (final s in sessions) {
      if (!s.date.startsWith(month) || s.myMark == null) continue;
      marked++;
      if (s.myMark == 'present') present++;
    }
    return marked == 0 ? null : (present * 100 / marked).round();
  }
}

/// Últimos pagamentos com as faturas pagas dos centros (mais recente
/// primeiro, até [limit]).
List<TrainingPayment> centerPaymentsMerged(
  List<TrainingPayment> payments,
  List<TrainingCenterLink> centers, {
  int limit = 12,
}) {
  final all = [
    ...payments,
    for (final c in centers)
      for (final i in c.invoices)
        if (i.isPaid)
          TrainingPayment(
            fromProfessor: false,
            chargeId: i.invoiceId,
            payee: c.name,
            description: i.reference,
            amountReais: i.amountReais,
            paidOn: i.paidOn ?? i.dueDate,
            method: switch (i.method) {
              'pix' => 'Pix',
              'card' => 'Cartão',
              'cash' => 'Dinheiro',
              'transfer' => 'Transferência',
              _ => '',
            },
          ),
  ]..sort((a, b) => b.paidOn.compareTo(a.paidOn));
  return all.take(limit).toList();
}

/// Lista vazia quando a resposta não é um mapa com `centers`.
List<TrainingCenterLink> trainingCentersFromResponse(Object? raw) =>
    MyTrainingCentersData.fromResponse(raw).centers;

/// Convite do centro: o cadastro foi feito pelo e-mail da conta e espera o
/// aceite do aluno (`answerTrainingCenterInvite`).
class CenterInvite {
  const CenterInvite({
    required this.centerId,
    required this.studentId,
    required this.centerName,
    this.city = '',
    this.state = '',
    this.enrollments = const [],
    this.invitedAt,
  });

  factory CenterInvite.fromMap(Map<String, Object?> m) {
    final enrollments = m['enrollments'];
    return CenterInvite(
      centerId: _str(m['centerId']),
      studentId: _str(m['studentId']),
      centerName: _str(m['centerName'], 'Centro de treinamento'),
      city: _str(m['city']),
      state: _str(m['state']),
      enrollments: enrollments is List
          ? [
              for (final e in enrollments)
                if (e is Map) CenterEnrollment.fromMap(_map(e)),
            ]
          : const [],
      invitedAt: _strOrNull(m['invitedAt']),
    );
  }

  final String centerId;
  final String studentId;
  final String centerName;
  final String city;
  final String state;

  /// Turmas em que o centro já matriculou o convidado.
  final List<CenterEnrollment> enrollments;
  final String? invitedAt;

  /// "Rio de Janeiro · RJ".
  String get placeLabel => [city, state].where((s) => s.isNotEmpty).join(' · ');
}

/// Experimental pedida pelo atleta num CT (ele ainda não é aluno). O centro
/// confirma pelo portal; `pending` até lá.
class CenterTrial {
  const CenterTrial({
    required this.bookingId,
    required this.centerId,
    required this.centerName,
    required this.sessionId,
    required this.className,
    required this.date,
    required this.startTime,
    this.endTime = '',
    this.coachName = '',
    this.locationName = '',
    this.status = 'pending',
    this.note = '',
  });

  factory CenterTrial.fromMap(Map<String, Object?> m) => CenterTrial(
        bookingId: _str(m['bookingId']),
        centerId: _str(m['centerId']),
        centerName: _str(m['centerName'], 'Centro de treinamento'),
        sessionId: _str(m['sessionId']),
        className: _str(m['className'], 'Aula experimental'),
        date: _str(m['date']),
        startTime: _str(m['startTime']),
        endTime: _str(m['endTime']),
        coachName: _str(m['coachName']),
        locationName: _str(m['locationName']),
        status: _str(m['status'], 'pending'),
        note: _str(m['note']),
      );

  final String bookingId;
  final String centerId;
  final String centerName;
  final String sessionId;
  final String className;

  /// `YYYY-MM-DD`.
  final String date;
  final String startTime;
  final String endTime;
  final String coachName;
  final String locationName;

  /// `pending`, `confirmed` ou `declined`.
  final String status;

  /// Recado do centro ao responder.
  final String note;

  bool get isPending => status == 'pending';
  bool get isDeclined => status == 'declined';
}

/// Resposta inteira de `getMyTrainingCenters`.
class MyTrainingCentersData {
  const MyTrainingCentersData({
    this.centers = const [],
    this.invites = const [],
    this.unverifiedInvites = 0,
    this.trials = const [],
  });

  factory MyTrainingCentersData.fromResponse(Object? raw) {
    if (raw is! Map) return const MyTrainingCentersData();
    List<T> list<T>(String key, T Function(Map<String, Object?>) of) {
      final v = raw[key];
      return v is List
          ? [
              for (final e in v)
                if (e is Map) of(_map(e)),
            ]
          : <T>[];
    }

    return MyTrainingCentersData(
      centers: list('centers', TrainingCenterLink.fromMap),
      invites: list('invites', CenterInvite.fromMap),
      unverifiedInvites: _int(raw['unverifiedInvites']) ?? 0,
      trials: list('trials', CenterTrial.fromMap),
    );
  }

  final List<TrainingCenterLink> centers;
  final List<CenterInvite> invites;

  /// Experimentais pedidas em CTs (de qualquer centro, aluno ou não).
  final List<CenterTrial> trials;

  /// Convites para o e-mail da conta que só aparecem depois de confirmar o
  /// e-mail.
  final int unverifiedInvites;
}

/// Pix da fatura do centro (`getMyTrainingCenterInvoicePix`).
class CenterInvoicePix {
  const CenterInvoicePix({
    required this.status,
    this.invoiceUrl = '',
    this.pixPayload = '',
  });

  factory CenterInvoicePix.fromMap(Map<String, Object?> m) => CenterInvoicePix(
    status: _str(m['status'], 'pending'),
    invoiceUrl: _str(m['invoiceUrl']),
    pixPayload: _str(m['pixPayload']),
  );

  final String status;
  final String invoiceUrl;

  /// Pix copia-e-cola (vazio quando o provedor não devolveu).
  final String pixPayload;
}

// ── rótulos ──────────────────────────────────────────────────────────────

/// "Mensal · 3×/sem" ou "Pacote · 8 aulas".
String centerPlanSummary(CenterEnrollment e) {
  if (e.isPack) {
    return e.credits == null ? 'Pacote' : 'Pacote · ${e.credits} aulas';
  }
  return e.classesPerWeek == null
      ? 'Mensal'
      : 'Mensal · ${e.classesPerWeek}×/sem';
}

/// Situação da matrícula para a pílula.
String centerEnrollmentStatusLabel(CenterEnrollment e) => switch (e.status) {
  'active' => 'ATIVA',
  'paused' => 'PAUSADA',
  'pending' => 'AGUARDANDO PAGAMENTO',
  'waitlisted' => 'NA FILA',
  _ => e.status.toUpperCase(),
};

/// "Pix" / "Cartão" / "Pix automático" da assinatura.
String centerBillingMethodLabel(String method) => switch (method) {
  'card' => 'Cartão (automático)',
  'pix_auto' => 'Pix automático',
  'pix_manual' => 'Pix · link a cada mês',
  _ => 'Fatura do centro',
};

/// "Próprio", "Parceiro" ou "Avulso".
String centerLocationTypeLabel(String type) => switch (type) {
  'partner' => 'Parceiro',
  'adhoc' => 'Avulso',
  _ => 'Próprio',
};

String centerInvoiceStatusLabel(CenterInvoice i, String todayKey) {
  if (i.isOverdue(todayKey)) return 'VENCIDA';
  return switch (i.status) {
    'pending' => 'EM ABERTO',
    'failed' => 'NÃO APROVADO',
    'approved' => 'PAGA',
    'refunded' => 'ESTORNADA',
    'disputed' => 'EM DISPUTA',
    _ => i.status.toUpperCase(),
  };
}

// ── auxiliares ───────────────────────────────────────────────────────────

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

int? _int(Object? v) => v is num ? v.toInt() : null;

Map<String, Object?> _map(Map<dynamic, dynamic> m) =>
    m.map((k, v) => MapEntry('$k', v));
