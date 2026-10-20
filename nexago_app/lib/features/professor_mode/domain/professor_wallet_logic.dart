import '../../../core/formatting/app_currency_format.dart';
import '../../../core/search/search_keywords.dart';
import '../../../core/time/nexago_event_timezone.dart';
import 'professor_students_logic.dart'
    show ProfessorStudentFilter, professorShortDate;
import 'professor_wallet.dart';

/// Regras das telas da carteira (fase 3). Quem valida de verdade é a
/// callable — aqui a tela só evita mandar o que o servidor recusaria, com a
/// mesma mensagem dele (`functions/src/professor-wallet-model.ts`).

/// Taxa NexaGO sobre a cobrança do professor (`PROFESSOR_CHARGE_FEE_PERCENT`).
const int kProfessorChargeFeePercent = 5;
const double kProfessorPriceMinReais = 1;
const double kProfessorPriceMaxReais = 10000;

/// Parte do professor sem a tarifa do Asaas (o split é sobre o líquido).
double professorShareOf(double amountReais) =>
    (amountReais * (100 - kProfessorChargeFeePercent)).round() / 100;

// ── conta de recebimento ─────────────────────────────────────────────────

String professorAccountStatusLabel(ProfessorAccountStatus s) => switch (s) {
      ProfessorAccountStatus.creating => 'Criando',
      ProfessorAccountStatus.failed => 'Não criada',
      ProfessorAccountStatus.pending => 'Pendente',
      ProfessorAccountStatus.approved => 'Aprovada',
      ProfessorAccountStatus.rejected => 'Recusada',
    };

String professorAccountStatusCopy(ProfessorAccountStatus s) => switch (s) {
      ProfessorAccountStatus.creating =>
        'Estamos criando sua conta no Asaas. Isso leva alguns segundos.',
      ProfessorAccountStatus.failed =>
        'A última tentativa de criar a conta não deu certo. Confira os dados '
            'e tente de novo.',
      ProfessorAccountStatus.pending =>
        'Conta criada. Confira o e-mail do Asaas para definir a senha e '
            'enviar os documentos. Assim que o Asaas aprovar, você já pode '
            'cobrar seus alunos.',
      ProfessorAccountStatus.approved =>
        'Conta aprovada. O que seus alunos pagam cai direto na sua conta '
            'Asaas; o saque é feito no app do Asaas.',
      ProfessorAccountStatus.rejected =>
        'O Asaas recusou a conta. Confira o e-mail do Asaas para saber o '
            'motivo ou fale com o suporte do nexaGO.',
    };

/// Só dígitos.
String professorDigits(String v) => v.replaceAll(RegExp(r'\D'), '');

/// Dígitos verificadores do CPF (recusa os repetidos, 111.111.111-11).
bool professorCpfValid(String raw) {
  final cpf = professorDigits(raw);
  if (cpf.length != 11 || RegExp(r'^(\d)\1{10}$').hasMatch(cpf)) return false;
  int digit(int len) {
    var sum = 0;
    for (var i = 0; i < len; i++) {
      sum += int.parse(cpf[i]) * (len + 1 - i);
    }
    final r = (sum * 10) % 11;
    return r == 10 ? 0 : r;
  }

  return digit(9) == int.parse(cpf[9]) && digit(10) == int.parse(cpf[10]);
}

/// Celular sem o 55 do país (como o servidor normaliza).
String professorMobileDigits(String raw) {
  final d = professorDigits(raw);
  return RegExp(r'^55\d{10,11}$').hasMatch(d) ? d.substring(2) : d;
}

/// `DD/MM/AAAA` → `YYYY-MM-DD` (data real) ou `null`.
String? professorBirthDateKey(String input) {
  final m = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(input.trim());
  if (m == null) return null;
  final d = int.parse(m.group(1)!);
  final mo = int.parse(m.group(2)!);
  final y = int.parse(m.group(3)!);
  final date = DateTime.utc(y, mo, d);
  if (date.year != y || date.month != mo || date.day != d) return null;
  return _key(date);
}

/// "120", "120,50", "1.200,50", "R$ 80" → reais; `null` se não for número.
double? professorParseMoney(String input) {
  var s = input.replaceAll(RegExp(r'[R$\s]'), '');
  if (s.isEmpty) return null;
  if (s.contains(',')) {
    s = s.replaceAll('.', '').replaceAll(',', '.');
  } else if (RegExp(r'^\d{1,3}(\.\d{3})+$').hasMatch(s)) {
    s = s.replaceAll('.', '');
  }
  final n = double.tryParse(s);
  return n == null || n.isNaN ? null : (n * 100).round() / 100;
}

/// Campos do formulário da conta.
enum ProfessorAccountField {
  name,
  cpf,
  email,
  mobilePhone,
  birthDate,
  incomeValue,
  postalCode,
  address,
  addressNumber,
  complement,
  province,
}

/// Erros do formulário (vazio = pode enviar), com as mensagens do servidor.
Map<ProfessorAccountField, String> validateProfessorAccountForm(
  ProfessorAccountForm f, {
  required String todayKey,
}) {
  final errors = <ProfessorAccountField, String>{};
  final name = f.name.trim();
  if (name.split(RegExp(r'\s+')).length < 2 || name.length > 100) {
    errors[ProfessorAccountField.name] = 'Informe o nome completo.';
  }
  if (!professorCpfValid(f.cpf)) {
    errors[ProfessorAccountField.cpf] = 'CPF inválido.';
  }
  final email = f.email.trim();
  if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email) ||
      email.length > 120) {
    errors[ProfessorAccountField.email] = 'E-mail inválido.';
  }
  if (!RegExp(r'^\d{2}9\d{8}$')
      .hasMatch(professorMobileDigits(f.mobilePhone))) {
    errors[ProfessorAccountField.mobilePhone] =
        'Celular inválido (DDD + 9 dígitos).';
  }
  final birth = professorBirthDateKey(f.birthDate);
  if (birth == null ||
      birth.compareTo(todayKey) > 0 ||
      birth.compareTo('1900-01-01') < 0) {
    errors[ProfessorAccountField.birthDate] = 'Data de nascimento inválida.';
  } else {
    final adult = '${int.parse(todayKey.substring(0, 4)) - 18}'
        '${todayKey.substring(4)}';
    if (birth.compareTo(adult) > 0) {
      errors[ProfessorAccountField.birthDate] =
          'A conta de recebimento é só para maiores de 18 anos.';
    }
  }
  final income = professorParseMoney(f.incomeValue);
  if (income == null || income <= 0 || income > 1000000) {
    errors[ProfessorAccountField.incomeValue] = 'Informe a renda mensal.';
  }
  if (professorDigits(f.postalCode).length != 8) {
    errors[ProfessorAccountField.postalCode] = 'CEP inválido.';
  }
  final address = f.address.trim();
  if (address.isEmpty || address.length > 120) {
    errors[ProfessorAccountField.address] = 'Informe o endereço.';
  }
  final number = f.addressNumber.trim();
  if (number.isEmpty || number.length > 20) {
    errors[ProfessorAccountField.addressNumber] = 'Informe o número.';
  }
  final province = f.province.trim();
  if (province.isEmpty || province.length > 80) {
    errors[ProfessorAccountField.province] = 'Informe o bairro.';
  }
  return errors;
}

/// Payload de `createProfessorPayoutAccount` (formulário já validado).
Map<String, Object?> professorAccountPayload(ProfessorAccountForm f) {
  final complement = f.complement.trim();
  return {
    'name': f.name.trim().replaceAll(RegExp(r'\s+'), ' '),
    'email': f.email.trim().toLowerCase(),
    'cpfCnpj': professorDigits(f.cpf),
    'mobilePhone': professorMobileDigits(f.mobilePhone),
    'birthDate': professorBirthDateKey(f.birthDate),
    'incomeValue': professorParseMoney(f.incomeValue),
    'postalCode': professorDigits(f.postalCode),
    'address': f.address.trim(),
    'addressNumber': f.addressNumber.trim(),
    'complement': complement.isEmpty
        ? null
        : complement.substring(0, complement.length.clamp(0, 60)),
    'province': f.province.trim(),
  };
}

// ── planos ───────────────────────────────────────────────────────────────

String professorPlanKindLabel(ProfessorPlanKind k) => switch (k) {
      ProfessorPlanKind.single => 'Aula avulsa',
      ProfessorPlanKind.package => 'Pacote',
      ProfessorPlanKind.monthly => 'Mensal',
    };

/// "Avulsa · 1 aula" / "Pacote · 4 aulas · validade 45 dias" / "Mensal · 8
/// aulas por mês" (a avulsa não repete o nome padrão "Aula avulsa").
String professorPlanSubtitle(ProfessorWalletPlan p) {
  String aulas(int n) => '$n aula${n == 1 ? '' : 's'}';
  return switch (p.kind) {
    ProfessorPlanKind.single => 'Avulsa · 1 aula',
    ProfessorPlanKind.package => [
        'Pacote',
        if (p.classes != null) aulas(p.classes!),
        if (p.validityDays != null) 'validade ${p.validityDays} dias',
      ].join(' · '),
    ProfessorPlanKind.monthly => [
        'Mensal',
        if (p.classes != null) '${aulas(p.classes!)} por mês',
      ].join(' · '),
  };
}

/// Erro do editor de plano (ou `null`), com as mensagens do servidor.
String? validateProfessorPlan({
  required String name,
  required ProfessorPlanKind kind,
  required double? priceReais,
  required int? classes,
  required int? validityDays,
}) {
  final n = name.trim();
  if (n.isEmpty || n.length > 60) {
    return 'Dê um nome ao plano (até 60 caracteres).';
  }
  if (priceReais == null ||
      priceReais < kProfessorPriceMinReais ||
      priceReais > kProfessorPriceMaxReais) {
    return 'Preço deve ficar entre R\$ 1 e R\$ 10.000.';
  }
  if (kind != ProfessorPlanKind.single &&
      (classes == null || classes < 1 || classes > 60)) {
    return 'Informe quantas aulas (1 a 60).';
  }
  if (kind == ProfessorPlanKind.package &&
      (validityDays == null || validityDays < 7 || validityDays > 365)) {
    return 'Validade do pacote entre 7 e 365 dias.';
  }
  return null;
}

/// Ativos primeiro, depois por preço.
List<ProfessorWalletPlan> professorSortedPlans(
        List<ProfessorWalletPlan> plans) =>
    [...plans]..sort((a, b) {
        if (a.active != b.active) return a.active ? -1 : 1;
        return a.priceReais.compareTo(b.priceReais);
      });

ProfessorWalletPlan? professorPlanById(
  List<ProfessorWalletPlan> plans,
  String? id,
) {
  if (id == null) return null;
  for (final p in plans) {
    if (p.id == id) return p;
  }
  return null;
}

/// Alunos da carteira (ativos e convidados) com o plano como padrão.
int professorPlanStudentCount(
  ProfessorWalletPlan plan,
  List<ProfessorWalletStudent> students,
) =>
    students.where((s) => s.inWallet && s.planId == plan.id).length;

/// Selo do convite pendente na carteira.
const String kProfessorInviteSentLabel = 'CONVITE ENVIADO';

// ── cobranças ────────────────────────────────────────────────────────────

/// Situação na tela: o "atrasado" é derivado (aberta e vencida).
enum ProfessorChargeStanding {
  creating('Gerando'),
  failed('Falhou'),
  open('Em aberto'),
  overdue('Atrasado'),
  paid('Pago'),
  canceled('Cancelada'),
  refunded('Estornada');

  const ProfessorChargeStanding(this.label);

  final String label;
}

ProfessorChargeStanding professorChargeStanding(
  ProfessorCharge c,
  String todayKey,
) =>
    switch (c.status) {
      ProfessorChargeStatus.creating => ProfessorChargeStanding.creating,
      ProfessorChargeStatus.failed => ProfessorChargeStanding.failed,
      ProfessorChargeStatus.paid => ProfessorChargeStanding.paid,
      ProfessorChargeStatus.canceled => ProfessorChargeStanding.canceled,
      ProfessorChargeStatus.refunded => ProfessorChargeStanding.refunded,
      ProfessorChargeStatus.open => c.dueDate.compareTo(todayKey) < 0
          ? ProfessorChargeStanding.overdue
          : ProfessorChargeStanding.open,
    };

/// Dá para cancelar a aberta e a que ficou presa (gerando ou sem
/// confirmação do Asaas).
bool professorChargeCancelable(ProfessorCharge c) =>
    c.status == ProfessorChargeStatus.open ||
    c.status == ProfessorChargeStatus.creating ||
    c.status == ProfessorChargeStatus.failed;

bool professorChargeIsOverdue(ProfessorCharge c, String todayKey) =>
    professorChargeStanding(c, todayKey) == ProfessorChargeStanding.overdue;

/// "Pago 10 out" / "Vence 10 nov" / "Venceu 15 out" / "Cancelada".
String professorChargeSubtitle(ProfessorCharge c, String todayKey) {
  final due = professorShortDate(c.dueDate);
  return switch (professorChargeStanding(c, todayKey)) {
    ProfessorChargeStanding.paid => c.paidAt == null
        ? 'Pago'
        : 'Pago ${professorShortDate(nexagoEventDayKey(c.paidAt!))}',
    ProfessorChargeStanding.open =>
      c.dueDate == todayKey ? 'Vence hoje' : 'Vence $due',
    ProfessorChargeStanding.overdue => 'Venceu $due',
    ProfessorChargeStanding.canceled => 'Cancelada · vencimento $due',
    ProfessorChargeStanding.refunded => 'Estornada',
    ProfessorChargeStanding.creating => 'Gerando a fatura…',
    ProfessorChargeStanding.failed =>
      'Não confirmada pelo Asaas · confira antes de cobrar de novo',
  };
}

/// Mais recentes primeiro (vencimento, depois criação).
List<ProfessorCharge> professorSortedCharges(List<ProfessorCharge> charges) =>
    [...charges]..sort((a, b) {
        final byDue = b.dueDate.compareTo(a.dueDate);
        if (byDue != 0) return byDue;
        final ca = a.createdAt, cb = b.createdAt;
        if (ca == null || cb == null) return 0;
        return cb.compareTo(ca);
      });

List<ProfessorCharge> professorStudentCharges(
  List<ProfessorCharge> charges,
  String athleteId,
) =>
    professorSortedCharges([
      for (final c in charges)
        if (c.athleteId == athleteId) c,
    ]);

/// Líquido do professor: o do webhook ou, sem ele, 95% do valor.
double professorChargeNet(ProfessorCharge c) =>
    c.netReais ?? professorShareOf(c.amountReais);

/// Mês (`YYYY-MM`) em que entrou o dinheiro.
String professorChargePaidMonth(ProfessorCharge c) {
  final paidAt = c.paidAt;
  if (paidAt != null) return nexagoEventDayKey(paidAt).substring(0, 7);
  return c.period ??
      (c.dueDate.length >= 7 ? c.dueDate.substring(0, 7) : c.dueDate);
}

/// Resumo da carteira no mês (B16).
class ProfessorWalletSummary {
  const ProfessorWalletSummary({
    required this.monthKey,
    required this.receivedNet,
    required this.receivedCount,
    required this.toReceive,
    required this.open,
    required this.overdue,
  });

  final String monthKey;

  /// Líquido pago no mês (pelo mês do pagamento).
  final double receivedNet;
  final int receivedCount;

  /// Soma das abertas (em dia e atrasadas).
  final double toReceive;

  /// Abertas, do vencimento mais antigo ao mais novo.
  final List<ProfessorCharge> open;
  final List<ProfessorCharge> overdue;
}

ProfessorWalletSummary professorWalletSummary(
  List<ProfessorCharge> charges, {
  required String todayKey,
}) {
  final month = todayKey.substring(0, 7);
  var received = 0.0;
  var count = 0;
  final open = <ProfessorCharge>[];
  for (final c in charges) {
    if (c.status == ProfessorChargeStatus.paid &&
        professorChargePaidMonth(c) == month) {
      received += professorChargeNet(c);
      count++;
    } else if (c.status == ProfessorChargeStatus.open) {
      open.add(c);
    }
  }
  open.sort((a, b) => a.dueDate.compareTo(b.dueDate));
  return ProfessorWalletSummary(
    monthKey: month,
    receivedNet: (received * 100).round() / 100,
    receivedCount: count,
    toReceive: open.fold(0.0, (s, c) => s + c.amountReais),
    open: open,
    overdue: [
      for (final c in open)
        if (c.dueDate.compareTo(todayKey) < 0) c,
    ],
  );
}

/// Situação do aluno na lista: atrasado > em aberto > nada.
ProfessorChargeStanding? professorWalletStudentStanding(
  List<ProfessorCharge> charges,
  String athleteId,
  String todayKey,
) {
  ProfessorChargeStanding? best;
  for (final c in charges) {
    if (c.athleteId != athleteId) continue;
    final s = professorChargeStanding(c, todayKey);
    if (s == ProfessorChargeStanding.overdue) return s;
    if (s == ProfessorChargeStanding.open) best = s;
  }
  return best;
}

/// Mensagem do "Lembrar" (o professor manda por onde quiser).
String professorChargeReminderMessage(ProfessorCharge c, String todayKey) {
  final first = c.studentName.trim().split(RegExp(r'\s+')).first;
  final overdue = professorChargeIsOverdue(c, todayKey);
  final when = overdue
      ? 'venceu em ${professorShortDate(c.dueDate)}'
      : 'vence em ${professorShortDate(c.dueDate)}';
  final link = c.invoiceUrl == null
      ? 'O link está nas cobranças do seu app nexaGO.'
      : 'Dá para pagar com PIX ou cartão por aqui: ${c.invoiceUrl}';
  return 'Oi, $first! Lembrete da cobrança "${c.description}" de '
      '${formatBRL(c.amountReais)}, que $when. $link';
}

/// "Todo mês · dia 10 · R$ 880,00".
String professorRecurringLabel(ProfessorWalletRecurring r) =>
    'Todo mês · dia ${r.dueDay} · ${formatBRL(r.amountReais)}';

/// "outubro" de `YYYY-MM`.
String professorMonthName(String monthKey) {
  const names = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  final m = int.tryParse(monthKey.length >= 7 ? monthKey.substring(5, 7) : '');
  return m == null || m < 1 || m > 12 ? monthKey : names[m - 1];
}

/// Dia [days] depois de [dateKey] (`YYYY-MM-DD`).
String professorAddDays(String dateKey, int days) {
  final d = DateTime.tryParse(dateKey);
  if (d == null) return dateKey;
  return _key(DateTime.utc(d.year, d.month, d.day + days));
}

/// "Repetir todo mês" só para plano mensal ou valor personalizado.
bool professorCanRepeatMonthly(ProfessorWalletPlan? plan) =>
    plan == null || plan.kind == ProfessorPlanKind.monthly;

String _key(DateTime d) => '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

// ── aba Alunos ───────────────────────────────────────────────────────────

/// Escopo "Carteira própria" em "Ver alunos de…" (no lugar do `arenaId`).
const String kProfessorWalletScope = '__carteira__';

/// Alunos da carteira na lista da aba Alunos: em "Todas as arenas" e na
/// "Carteira própria"; chip "Pendentes" só os atrasados; "Turma" e
/// "Particular" são das arenas.
List<ProfessorWalletStudent> professorVisibleWalletStudents(
  List<ProfessorWalletStudent> students, {
  required String? scope,
  required ProfessorStudentFilter filter,
  required String query,
  required List<ProfessorCharge> charges,
  required String todayKey,
}) {
  if (scope != null && scope != kProfessorWalletScope) return const [];
  final term = normalizeSearchTerm(query);
  return [
    for (final s in students)
      if (s.inWallet &&
          (term.isEmpty || normalizeSearchTerm(s.name).contains(term)) &&
          switch (filter) {
            ProfessorStudentFilter.all => true,
            ProfessorStudentFilter.pending =>
              professorWalletStudentStanding(charges, s.athleteId, todayKey) ==
                  ProfessorChargeStanding.overdue,
            _ => false,
          })
        s,
  ];
}
