import 'package:cloud_firestore/cloud_firestore.dart';

/// Carteira do professor independente (fase 3): conta Asaas própria, planos,
/// alunos e cobranças. O dinheiro não passa pela NexaGO — a cobrança sai com
/// split para a subconta do professor. Tudo aqui é leitura: só as functions
/// escrevem (`functions/src/professor-wallet.ts`).

/// Situação da subconta Asaas (`general` do status do Asaas). `creating` é
/// a trava enquanto a function cria a subconta; `failed`, a criação que não
/// deu certo (o professor tenta de novo pelo formulário).
enum ProfessorAccountStatus {
  creating,
  failed,
  pending,
  approved,
  rejected;

  static ProfessorAccountStatus parse(Object? raw) => switch (raw) {
        'creating' => creating,
        'failed' => failed,
        'approved' => approved,
        'rejected' => rejected,
        _ => pending,
      };
}

/// `professorPayoutAccounts/{uid}` — o dono lê.
class ProfessorPayoutAccount {
  const ProfessorPayoutAccount({
    required this.status,
    required this.name,
    required this.email,
    this.walletId,
    this.cpfMasked,
    this.documentation,
  });

  factory ProfessorPayoutAccount.fromMap(Map<String, Object?> map) =>
      ProfessorPayoutAccount(
        status: ProfessorAccountStatus.parse(map['status']),
        walletId: _strOrNull(map['walletId']),
        name: _str(map['name']),
        email: _str(map['email']),
        cpfMasked: _strOrNull(map['cpfMasked']),
        documentation: _strOrNull(map['documentation']),
      );

  final ProfessorAccountStatus status;
  final String? walletId;
  final String name;
  final String email;
  final String? cpfMasked;
  final String? documentation;

  bool get isApproved => status == ProfessorAccountStatus.approved;

  /// Subconta criada no Asaas (fora da trava e da falha).
  bool get exists =>
      status != ProfessorAccountStatus.creating &&
      status != ProfessorAccountStatus.failed;
}

enum ProfessorPlanKind {
  single('single'),
  package('package'),
  monthly('monthly');

  const ProfessorPlanKind(this.wire);

  final String wire;

  static ProfessorPlanKind parse(Object? raw) => switch (raw) {
        'package' => package,
        'monthly' => monthly,
        _ => single,
      };
}

/// `professors/{uid}/plans/{planId}` — preço do professor (B14).
class ProfessorWalletPlan {
  const ProfessorWalletPlan({
    required this.id,
    required this.name,
    required this.kind,
    required this.priceReais,
    this.classes,
    this.validityDays,
    this.active = true,
  });

  factory ProfessorWalletPlan.fromMap(String id, Map<String, Object?> map) =>
      ProfessorWalletPlan(
        id: id,
        name: _str(map['name'], 'Plano'),
        kind: ProfessorPlanKind.parse(map['kind']),
        priceReais: _num(map['priceReais']) ?? 0,
        classes: _int(map['classes']),
        validityDays: _int(map['validityDays']),
        active: map['active'] != false,
      );

  final String id;
  final String name;
  final ProfessorPlanKind kind;
  final double priceReais;

  /// Aulas do pacote ou por mês; `null` na avulsa.
  final int? classes;

  /// Validade do pacote em dias; `null` fora do pacote.
  final int? validityDays;
  final bool active;
}

/// Cobrança recorrente combinada com o aluno (o agendador gera a do mês).
class ProfessorWalletRecurring {
  const ProfessorWalletRecurring({
    required this.amountReais,
    required this.description,
    required this.dueDay,
    this.planId,
    this.lastPeriod,
  });

  static ProfessorWalletRecurring? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final map = _stringKeys(raw);
    return ProfessorWalletRecurring(
      planId: _strOrNull(map['planId']),
      amountReais: _num(map['amountReais']) ?? 0,
      description: _str(map['description'], 'Aula'),
      dueDay: _int(map['dueDay']) ?? 1,
      lastPeriod: _strOrNull(map['lastPeriod']),
    );
  }

  final String? planId;
  final double amountReais;
  final String description;
  final int dueDay;
  final String? lastPeriod;
}

/// Situação do aluno na carteira: `invited` até o atleta aceitar o convite
/// (só aí dá para cobrar), `active`, `declined` (o atleta recusou),
/// `archived` (o professor tirou). Valor desconhecido conta como fora da
/// carteira — nunca libera cobrança.
enum ProfessorWalletStudentStatus {
  invited,
  active,
  declined,
  archived;

  static ProfessorWalletStudentStatus parse(Object? raw) => switch (raw) {
        'invited' => invited,
        'active' => active,
        'declined' => declined,
        _ => archived,
      };
}

/// `professors/{uid}/students/{athleteId}` — aluno da carteira (tem conta
/// NexaGO; nome e foto copiados na entrada). O atleta também lê o próprio
/// doc (convite): daí [professorName], [professorPhotoUrl] e [invitedAt].
class ProfessorWalletStudent {
  const ProfessorWalletStudent({
    required this.athleteId,
    required this.name,
    this.photoUrl,
    this.planId,
    this.status = ProfessorWalletStudentStatus.active,
    this.recurring,
    this.professorName,
    this.professorPhotoUrl,
    this.invitedAt,
  });

  factory ProfessorWalletStudent.fromMap(
    String id,
    Map<String, Object?> map,
  ) =>
      ProfessorWalletStudent(
        athleteId: _str(map['athleteId'], id),
        name: _str(map['name'], 'Aluno'),
        photoUrl: _strOrNull(map['photoUrl']),
        planId: _strOrNull(map['planId']),
        status: ProfessorWalletStudentStatus.parse(map['status']),
        recurring: ProfessorWalletRecurring.fromMap(map['recurring']),
        professorName: _strOrNull(map['professorName']),
        professorPhotoUrl: _strOrNull(map['professorPhotoUrl']),
        invitedAt: _date(map['invitedAt']),
      );

  final String athleteId;
  final String name;
  final String? photoUrl;

  /// Plano padrão combinado (opcional).
  final String? planId;
  final ProfessorWalletStudentStatus status;
  final ProfessorWalletRecurring? recurring;
  final String? professorName;
  final String? professorPhotoUrl;
  final DateTime? invitedAt;

  /// Na carteira (convidado ou ativo) — fora o recusado e o arquivado.
  bool get inWallet =>
      status == ProfessorWalletStudentStatus.active ||
      status == ProfessorWalletStudentStatus.invited;

  /// Aceitou o convite: pode receber cobrança.
  bool get active => status == ProfessorWalletStudentStatus.active;

  bool get invited => status == ProfessorWalletStudentStatus.invited;
}

/// `creating` = gerando a fatura; `failed` = o Asaas não confirmou (pode
/// ter criado ou não — o professor confere e cancela).
enum ProfessorChargeStatus {
  creating,
  failed,
  open,
  paid,
  canceled,
  refunded;

  static ProfessorChargeStatus parse(Object? raw) {
    for (final s in values) {
      if (s.name == raw) return s;
    }
    return open;
  }
}

/// `professorCharges/{id}` — fatura Asaas com split para o professor.
class ProfessorCharge {
  const ProfessorCharge({
    required this.id,
    required this.athleteId,
    required this.studentName,
    required this.description,
    required this.amountReais,
    required this.dueDate,
    required this.status,
    this.planId,
    this.period,
    this.recurring = false,
    this.invoiceUrl,
    this.paymentId,
    this.netReais,
    this.paidAt,
    this.createdAt,
  });

  factory ProfessorCharge.fromMap(String id, Map<String, Object?> map) =>
      ProfessorCharge(
        id: id,
        athleteId: _str(map['athleteId']),
        studentName: _str(map['studentName'], 'Aluno'),
        planId: _strOrNull(map['planId']),
        description: _str(map['description'], 'Aula'),
        amountReais: _num(map['amountReais']) ?? 0,
        dueDate: _str(map['dueDate']),
        period: _strOrNull(map['period']),
        recurring: map['recurring'] == true,
        status: ProfessorChargeStatus.parse(map['status']),
        invoiceUrl: _strOrNull(map['invoiceUrl']),
        paymentId: _strOrNull(map['paymentId']),
        netReais: _num(map['netReais']),
        paidAt: _date(map['paidAt']),
        createdAt: _date(map['createdAt']),
      );

  final String id;
  final String athleteId;
  final String studentName;
  final String? planId;
  final String description;
  final double amountReais;

  /// `YYYY-MM-DD`.
  final String dueDate;

  /// `YYYY-MM` do vencimento.
  final String? period;
  final bool recurring;
  final ProfessorChargeStatus status;
  final String? invoiceUrl;
  final String? paymentId;

  /// Líquido do professor (chega com o pagamento).
  final double? netReais;
  final DateTime? paidAt;
  final DateTime? createdAt;
}

// ── entradas das callables ────────────────────────────────────────────────

/// Formulário "Receber pelo nexaGO" → `createProfessorPayoutAccount`.
class ProfessorAccountForm {
  const ProfessorAccountForm({
    required this.name,
    required this.cpf,
    required this.email,
    required this.mobilePhone,
    required this.birthDate,
    required this.incomeValue,
    required this.postalCode,
    required this.address,
    required this.addressNumber,
    required this.complement,
    required this.province,
  });

  final String name;
  final String cpf;
  final String email;
  final String mobilePhone;

  /// `YYYY-MM-DD` (a tela converte de DD/MM/AAAA).
  final String birthDate;
  final String incomeValue;
  final String postalCode;
  final String address;
  final String addressNumber;
  final String complement;
  final String province;
}

/// `upsertProfessorPlan` (sem [planId] cria).
class ProfessorPlanInput {
  const ProfessorPlanInput({
    required this.name,
    required this.kind,
    required this.priceReais,
    this.planId,
    this.classes,
    this.validityDays,
    this.active = true,
  });

  factory ProfessorPlanInput.of(ProfessorWalletPlan p, {bool? active}) =>
      ProfessorPlanInput(
        planId: p.id,
        name: p.name,
        kind: p.kind,
        priceReais: p.priceReais,
        classes: p.classes,
        validityDays: p.validityDays,
        active: active ?? p.active,
      );

  final String? planId;
  final String name;
  final ProfessorPlanKind kind;
  final double priceReais;
  final int? classes;
  final int? validityDays;
  final bool active;

  Map<String, Object?> toPayload() => {
        if (planId != null) 'planId': planId,
        'name': name,
        'kind': kind.wire,
        'priceReais': priceReais,
        if (kind != ProfessorPlanKind.single) 'classes': classes,
        if (kind == ProfessorPlanKind.package) 'validityDays': validityDays,
        'active': active,
      };
}

/// `createProfessorCharge`: plano OU valor personalizado.
class ProfessorChargeInput {
  const ProfessorChargeInput({
    required this.athleteId,
    required this.dueDate,
    this.planId,
    this.amountReais,
    this.description,
    this.repeatMonthly = false,
  });

  final String athleteId;
  final String? planId;
  final double? amountReais;
  final String? description;
  final String dueDate;
  final bool repeatMonthly;

  Map<String, Object?> toPayload() => {
        'athleteId': athleteId,
        if (planId != null) 'planId': planId,
        if (planId == null && amountReais != null) 'amountReais': amountReais,
        if (description != null && description!.trim().isNotEmpty)
          'description': description!.trim(),
        'dueDate': dueDate,
        'repeatMonthly': repeatMonthly,
      };
}

// ── leitura defensiva ────────────────────────────────────────────────────

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

int? _int(Object? v) => v is num ? v.round() : null;

double? _num(Object? v) => v is num ? v.toDouble() : null;

DateTime? _date(Object? v) => switch (v) {
      Timestamp t => t.toDate(),
      DateTime d => d,
      String s => DateTime.tryParse(s),
      _ => null,
    };

Map<String, Object?> _stringKeys(Map raw) =>
    raw.map((k, v) => MapEntry(k.toString(), v));
