import '../../../../core/formatting/app_currency_format.dart';
import 'arena_class.dart';
import 'arena_class_billing_logic.dart';
import 'arena_class_payout.dart';
import 'arena_class_teacher.dart';

// Regras puras do repasse do professor no app (fase 2b): rótulos do modelo,
// meses, situação de cada professor no mês e o rascunho do formulário. A
// conta do mês NÃO mora aqui — é do servidor (`previewArenaClassPayouts`);
// estes helpers só juntam a prévia com os fechamentos gravados. Espelha
// `frontend/projects/arena/src/app/painel/aulas/payout.model.ts`.

/// Teto do valor por aula/aluno (`MAX_PAYOUT_UNIT_REAIS`).
const double arenaClassMaxPayoutUnitReais = 10000;

/// "50" · "45,5" · "-40" — até 2 casas, sem zeros à direita (campo de texto).
String arenaClassDecimalText(double n) => n
    .toStringAsFixed(2)
    .replaceFirst(RegExp(r'\.?0+$'), '')
    .replaceAll('.', ',');

/// "R$ 45" (inteiro) ou "R$ 45,50" — valor unitário do modelo.
String _unitMoney(double v) =>
    v == v.roundToDouble() ? formatBRLWhole(v) : formatBRL(v);

double _round2(double n) => (n * 100).round() / 100;

// ---------------------------------------------------------------------------
// Rótulos do modelo
// ---------------------------------------------------------------------------

/// "50% da receita" · "R$ 45 / aula" · "R$ 15 / aluno presente".
String arenaClassPayoutModelLabel(ArenaClassTeacherPayoutModel? model) {
  if (model == null) return 'Não definido';
  return switch (model.kind) {
    ArenaClassPayoutModelKind.revenueShare =>
      '${arenaClassDecimalText(model.percent ?? 0)}% da receita',
    ArenaClassPayoutModelKind.perClass =>
      '${_unitMoney(model.amountReais ?? 0)} / aula',
    ArenaClassPayoutModelKind.perStudent =>
      '${_unitMoney(model.amountReais ?? 0)} / aluno presente',
  };
}

/// O que o modelo multiplica: a receita, as aulas dadas ou as presenças.
String arenaClassPayoutBaseLabel(ArenaClassPayoutFigures f) {
  final model = f.model;
  if (model == null) return '—';
  return switch (model.kind) {
    ArenaClassPayoutModelKind.perClass =>
      '${f.classesGiven} aula${f.classesGiven == 1 ? '' : 's'}',
    ArenaClassPayoutModelKind.perStudent =>
      '${f.presences} presença${f.presences == 1 ? '' : 's'}',
    ArenaClassPayoutModelKind.revenueShare =>
      '${formatBRL(f.revenueReais)} de receita',
  };
}

/// Rótulo do valor de cada linha da composição ("Repasse 50%").
String arenaClassPayoutColumnLabel(ArenaClassTeacherPayoutModel? model) {
  if (model == null) return 'Repasse';
  return model.kind == ArenaClassPayoutModelKind.revenueShare
      ? 'Repasse ${arenaClassDecimalText(model.percent ?? 0)}%'
      : 'Repasse · ${_unitMoney(model.amountReais ?? 0)}';
}

/// Como o modelo conta, para o cartão "Regra de repasse".
List<(String, String)> arenaClassPayoutRuleFacts(
  ArenaClassTeacherPayoutModel? model,
) {
  return [
    ('Modelo', arenaClassPayoutModelLabel(model)),
    ...switch (model?.kind) {
      ArenaClassPayoutModelKind.perClass => [
          ('Conta', 'Aula com chamada fechada'),
        ],
      ArenaClassPayoutModelKind.perStudent => [
          ('Conta', 'Aluno presente (encaixe incluso)'),
        ],
      _ => [
          ('Conta', 'Mensalidade paga no mês'),
          ('Aluno com vários professores', 'Rateio pelos horários'),
          ('Taxa de matrícula', 'Fica com a arena'),
        ],
    },
    ('Aula cancelada', 'Não entra'),
  ];
}

/// "+ R$ 50,00" · "− R$ 120,00" (ajuste).
String arenaClassSignedBrl(double value) =>
    '${value < 0 ? '− ' : '+ '}${formatBRL(value.abs())}';

// ---------------------------------------------------------------------------
// Mês (`YYYY-MM`)
// ---------------------------------------------------------------------------

final RegExp _monthKey = RegExp(r'^\d{4}-(0[1-9]|1[0-2])$');

bool arenaClassIsMonthKey(String? raw) =>
    raw != null && _monthKey.hasMatch(raw);

/// `2026-10` de `2026-10-19`.
String arenaClassMonthOf(String dateKey) =>
    dateKey.length >= 7 ? dateKey.substring(0, 7) : dateKey;

String arenaClassShiftMonth(String month, int delta) {
  final y = int.tryParse(month.substring(0, 4)) ?? 2000;
  final m = int.tryParse(month.substring(5, 7)) ?? 1;
  final index = y * 12 + m - 1 + delta;
  return '${index ~/ 12}-${(index % 12 + 1).toString().padLeft(2, '0')}';
}

/// "outubro de 2026".
String arenaClassMonthLongLabel(String month) =>
    '${arenaClassMonthName('$month-01')} de ${month.substring(0, 4)}';

/// "outubro/2026" (título do detalhe e histórico).
String arenaClassMonthSlashLabel(String month) =>
    '${arenaClassMonthName('$month-01')}/${month.substring(0, 4)}';

/// "out" — toda abreviação de mês em português são as 3 primeiras letras.
String arenaClassMonthShortLabel(String month) {
  final name = arenaClassMonthName('$month-01');
  return name.length >= 3 ? name.substring(0, 3) : name;
}

/// Último dia do mês (`YYYY-MM-DD`).
String arenaClassMonthLastDay(String month) {
  final y = int.tryParse(month.substring(0, 4)) ?? 2000;
  final m = int.tryParse(month.substring(5, 7)) ?? 1;
  final day = DateTime.utc(y, m + 1, 0).day;
  return '$month-${day.toString().padLeft(2, '0')}';
}

/// Nos primeiros 10 dias o que importa é pagar o mês anterior; depois,
/// acompanhar o corrente.
String arenaClassDefaultPayoutMonth(String todayKey) {
  final month = arenaClassMonthOf(todayKey);
  final day = int.tryParse(todayKey.substring(8, 10)) ?? 1;
  return day <= 10 ? arenaClassShiftMonth(month, -1) : month;
}

/// Mesmo id do servidor (`classPayoutId`).
String arenaClassPayoutId(String arenaId, String teacherId, String month) =>
    '${arenaId}_${teacherId}_$month';

// ---------------------------------------------------------------------------
// Situação do professor no mês
// ---------------------------------------------------------------------------

enum ArenaClassPayoutState { noModel, partial, toClose, closed, paid }

extension ArenaClassPayoutStateX on ArenaClassPayoutState {
  String get label => switch (this) {
        ArenaClassPayoutState.noModel => 'Sem modelo',
        ArenaClassPayoutState.partial => 'Parcial',
        ArenaClassPayoutState.toClose => 'A fechar',
        ArenaClassPayoutState.closed => 'A pagar',
        ArenaClassPayoutState.paid => 'Pago',
      };
}

/// O fechamento só abre depois que o mês termina (o servidor recusa antes).
ArenaClassPayoutState arenaClassPayoutState({
  required ArenaClassPayout? closed,
  required ArenaClassTeacherPayoutModel? model,
  required String month,
  required String todayKey,
}) {
  if (closed != null) {
    return closed.isPaid
        ? ArenaClassPayoutState.paid
        : ArenaClassPayoutState.closed;
  }
  if (model == null) return ArenaClassPayoutState.noModel;
  return month.compareTo(arenaClassMonthOf(todayKey)) >= 0
      ? ArenaClassPayoutState.partial
      : ArenaClassPayoutState.toClose;
}

/// "Pago 05 nov" · "A pagar" · "Parcial".
String arenaClassPayoutStateText(
  ArenaClassPayoutState state,
  ArenaClassPayout? closed,
) {
  final paidOn = closed?.paidOn;
  if (state == ArenaClassPayoutState.paid && paidOn != null) {
    return 'Pago ${arenaClassShortDate(paidOn)}';
  }
  return state.label;
}

/// Linha sob o valor do detalhe: "PIX · 05 nov" no pago; o próximo passo
/// nos demais.
String arenaClassPayoutAmountSub(
  ArenaClassPayoutState state,
  ArenaClassPayout? closed,
) {
  if (closed != null && closed.isPaid) {
    return [
      if (closed.paidViaNexago)
        'Pago pelo nexaGO'
      else if (closed.paymentMethod != null)
        closed.paymentMethod!.label,
      if (closed.paidOn != null) arenaClassShortDate(closed.paidOn!),
    ].join(' · ');
  }
  return switch (state) {
    ArenaClassPayoutState.noModel => 'Defina o modelo de repasse',
    ArenaClassPayoutState.partial => 'Até hoje · o mês ainda não terminou',
    ArenaClassPayoutState.toClose => 'Calculado hoje · falta fechar o mês',
    _ => 'Fechado · falta registrar o pagamento',
  };
}

/// Fechado (a pagar), mas a prévia de hoje deu outro valor — pagamento
/// lançado ou estornado depois do fechamento.
bool arenaClassPayoutIsStale(
  ArenaClassPayout? closed,
  ArenaClassPayoutFigures? preview,
) {
  if (closed == null || closed.isPaid || preview == null) return false;
  return (closed.computedReais - preview.amountReais).abs() >= 0.01;
}

class ArenaClassPayoutRow {
  const ArenaClassPayoutRow({
    required this.teacherId,
    required this.teacherName,
    required this.teacherColor,
    required this.figures,
    required this.closed,
    required this.state,
    required this.stale,
  });

  final String teacherId;
  final String teacherName;
  final String teacherColor;

  /// O fechado manda nos números; sem ele, a prévia de hoje.
  final ArenaClassPayoutFigures figures;
  final ArenaClassPayout? closed;
  final ArenaClassPayoutState state;
  final bool stale;

  double get valueReais => closed?.amountReais ?? figures.amountReais;
}

/// Junta a prévia de hoje com o que já foi fechado no [month].
List<ArenaClassPayoutRow> buildArenaClassPayoutRows({
  required List<ArenaClassTeacherPayoutPreview> preview,
  required List<ArenaClassPayout> closed,
  required String month,
  required String todayKey,
}) {
  final byTeacher = {
    for (final c in closed)
      if (c.month == month) c.teacherId: c,
  };
  final rows = <ArenaClassPayoutRow>[
    for (final p in preview)
      _row(p, byTeacher.remove(p.teacherId), month, todayKey),
  ];
  // Fechado de professor que sumiu da prévia (arquivado sem atividade):
  // continua na lista.
  for (final c in byTeacher.values) {
    rows.add(_row(null, c, month, todayKey));
  }
  rows.sort((a, b) =>
      a.teacherName.toLowerCase().compareTo(b.teacherName.toLowerCase()));
  return rows;
}

ArenaClassPayoutRow _row(
  ArenaClassTeacherPayoutPreview? p,
  ArenaClassPayout? c,
  String month,
  String todayKey,
) {
  final figures = c ?? p!;
  return ArenaClassPayoutRow(
    teacherId: figures.teacherId,
    teacherName: figures.teacherName,
    teacherColor: figures.teacherColor,
    figures: figures,
    closed: c,
    state: arenaClassPayoutState(
      closed: c,
      model: c?.model ?? p?.model,
      month: month,
      todayKey: todayKey,
    ),
    stale: arenaClassPayoutIsStale(c, p),
  );
}

class ArenaClassPayoutTotals {
  const ArenaClassPayoutTotals({
    required this.totalReais,
    required this.paidReais,
    required this.toPayReais,
    required this.paidCount,
    required this.teachers,
  });

  final double totalReais;
  final double paidReais;
  final double toPayReais;
  final int paidCount;
  final int teachers;
}

ArenaClassPayoutTotals arenaClassPayoutTotals(List<ArenaClassPayoutRow> rows) {
  var total = 0.0, paid = 0.0;
  var paidCount = 0;
  for (final r in rows) {
    total += r.valueReais;
    if (r.state == ArenaClassPayoutState.paid) {
      paid += r.valueReais;
      paidCount += 1;
    }
  }
  return ArenaClassPayoutTotals(
    totalReais: _round2(total),
    paidReais: _round2(paid),
    toPayReais: _round2(total - paid),
    paidCount: paidCount,
    teachers: rows.length,
  );
}

// ---------------------------------------------------------------------------
// Formulários
// ---------------------------------------------------------------------------

/// "1.200,50" → 1200.5; "12.5" (ponto decimal) → 12.5 — em dinheiro, "12.50"
/// não pode virar 1250. Aceita sinal (ajuste negativo). null = inválido.
double? arenaClassParseDecimal(String raw) {
  final t = raw.trim().replaceAll(' ', '').replaceFirst('−', '-');
  if (t.isEmpty) return null;
  final String normalized;
  if (t.contains(',')) {
    normalized = t.replaceAll('.', '').replaceAll(',', '.');
  } else if (RegExp(r'^[-+]?\d+\.\d{1,2}$').hasMatch(t)) {
    normalized = t;
  } else {
    normalized = t.replaceAll('.', '');
  }
  final value = double.tryParse(normalized);
  return value != null && value.isFinite ? value : null;
}

/// Rascunho (modelo escolhido + campo de texto) → modelo, ou o erro.
({ArenaClassTeacherPayoutModel? model, String? error})
    arenaClassPayoutModelFromDraft(
  ArenaClassPayoutModelKind kind,
  String rawValue,
) {
  final value = arenaClassParseDecimal(rawValue);
  if (kind == ArenaClassPayoutModelKind.revenueShare) {
    if (value == null || value <= 0 || value > 100) {
      return (model: null, error: 'Informe um percentual entre 0 e 100.');
    }
    return (
      model: ArenaClassTeacherPayoutModel(kind: kind, percent: _round2(value)),
      error: null,
    );
  }
  if (value == null || value <= 0 || value > arenaClassMaxPayoutUnitReais) {
    return (
      model: null,
      error: 'Informe um valor entre R\$ 0,01 e R\$ 10.000.'
    );
  }
  return (
    model:
        ArenaClassTeacherPayoutModel(kind: kind, amountReais: _round2(value)),
    error: null,
  );
}

/// Valor do modelo no campo de texto ("50", "45,5").
String arenaClassPayoutDraftValue(ArenaClassTeacherPayoutModel model) {
  final n = model.kind == ArenaClassPayoutModelKind.revenueShare
      ? model.percent
      : model.amountReais;
  return n == null ? '' : arenaClassDecimalText(n);
}

/// Total do fechamento com o ajuste digitado; null = ajuste inválido ou
/// repasse negativo (o servidor recusa os dois).
double? arenaClassPayoutCloseTotal(double computedReais, String rawAdjustment) {
  final raw = rawAdjustment.trim();
  final adjustment = raw.isEmpty ? 0.0 : arenaClassParseDecimal(raw);
  if (adjustment == null) return null;
  final total = _round2(computedReais + adjustment);
  return total < 0 ? null : total;
}

// ---------------------------------------------------------------------------
// Professores (aulas/semana e alunos das turmas ativas)
// ---------------------------------------------------------------------------

class ArenaClassTeacherStats {
  const ArenaClassTeacherStats({
    this.classesPerWeek = 0,
    this.students = 0,
    this.capacity = 0,
  });

  final int classesPerWeek;
  final int students;
  final int capacity;

  int get occupancyPct =>
      capacity > 0 ? (students / capacity * 100).round() : 0;
}

/// Mesma conta de `teacherStats` do portal: só turmas recorrentes ativas.
Map<String, ArenaClassTeacherStats> arenaClassTeacherStats(
  List<ArenaClass> classes,
) {
  final out = <String, ArenaClassTeacherStats>{};
  for (final c in classes) {
    if (!c.isActive || c.isSingle) continue;
    final s = out[c.teacherId] ?? const ArenaClassTeacherStats();
    out[c.teacherId] = ArenaClassTeacherStats(
      classesPerWeek: s.classesPerWeek + c.weekdays.length,
      students: s.students + c.studentCount,
      capacity: s.capacity + c.capacity,
    );
  }
  return out;
}

/// Ativos primeiro, depois por nome.
List<ArenaClassTeacher> arenaClassTeachersForList(
  List<ArenaClassTeacher> teachers,
) {
  return [...teachers]..sort((a, b) {
      if (a.isActive != b.isActive) return a.isActive ? -1 : 1;
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
}
