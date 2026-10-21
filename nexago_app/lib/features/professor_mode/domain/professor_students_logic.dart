import '../../../core/formatting/app_currency_format.dart';
import '../../../core/search/search_keywords.dart';
import '../../arena/domain/aulas/arena_class.dart';
import '../../arena/domain/aulas/arena_class_logic.dart';
import 'professor_students.dart';

/// Regras das telas de alunos do modo Professor (Alunos, Aluno, Turmas):
/// filtro, busca e rótulos. O que o professor PODE ver o servidor já decidiu.

/// Chips da lista de alunos.
enum ProfessorStudentFilter { all, turma, particular, pending }

extension ProfessorStudentFilterX on ProfessorStudentFilter {
  String get label => switch (this) {
        ProfessorStudentFilter.all => 'Todos',
        ProfessorStudentFilter.turma => 'Turma',
        ProfessorStudentFilter.particular => 'Particular',
        ProfessorStudentFilter.pending => 'Pendentes',
      };
}

bool _matchesFilter(ProfessorStudent s, ProfessorStudentFilter filter) =>
    switch (filter) {
      ProfessorStudentFilter.all => true,
      ProfessorStudentFilter.turma =>
        s.classes.any((c) => c.type == ArenaClassType.turma),
      ProfessorStudentFilter.particular => s.classes.any((c) =>
          c.type == ArenaClassType.particular ||
          c.type == ArenaClassType.dupla),
      ProfessorStudentFilter.pending => s.billing?.isPending ?? false,
    };

/// Alunos de [arenaId] (`null` = todas as arenas).
List<ProfessorStudent> professorStudentsInScope(
  List<ProfessorStudent> students,
  String? arenaId,
) =>
    arenaId == null
        ? students
        : [
            for (final s in students)
              if (s.arenaId == arenaId) s
          ];

/// Lista na tela: escopo da arena, chip e busca por nome (sem acento).
List<ProfessorStudent> professorVisibleStudents(
  List<ProfessorStudent> students, {
  String? arenaId,
  ProfessorStudentFilter filter = ProfessorStudentFilter.all,
  String query = '',
}) {
  final term = normalizeSearchTerm(query);
  return [
    for (final s in professorStudentsInScope(students, arenaId))
      if (_matchesFilter(s, filter) &&
          (term.isEmpty || normalizeSearchTerm(s.name).contains(term)))
        s,
  ];
}

/// O chip "Pendentes" só faz sentido onde o professor vê a cobrança
/// (equipe da arena).
bool professorShowsPendingFilter(List<ProfessorStudent> inScope) =>
    inScope.any((s) => s.billing != null);

/// Quantos estão atrasados ou vencendo hoje.
int professorPendingCount(List<ProfessorStudent> inScope) =>
    inScope.where((s) => s.billing?.isPending ?? false).length;

/// Subtítulo do cabeçalho: "TODAS AS ARENAS · 39 ALUNOS" /
/// "ARENA CFC · 31 ALUNOS · 2 PENDENTES".
/// [walletCount] soma os alunos da carteira própria (fase 3) em "Todas as
/// arenas" e no escopo [walletScope].
String professorStudentsHeaderSubtitle({
  required ProfessorStudentsSnapshot snapshot,
  required String? arenaId,
  int walletCount = 0,
  String? walletScope,
}) {
  final wallet = walletScope != null && arenaId == walletScope;
  final inScope = wallet
      ? const <ProfessorStudent>[]
      : professorStudentsInScope(snapshot.students, arenaId);
  final where = wallet
      ? 'Carteira própria'
      : arenaId == null
          ? 'Todas as arenas'
          : snapshot.arena(arenaId)?.arenaName ?? 'Arena';
  final count =
      inScope.length + (wallet || arenaId == null ? walletCount : 0);
  final pending = professorPendingCount(inScope);
  return [
    where,
    '$count aluno${count == 1 ? '' : 's'}',
    if (pending > 0) '$pending pendente${pending == 1 ? '' : 's'}',
  ].join(' · ').toUpperCase();
}

/// Linha de baixo do aluno na lista: "Iniciante A · 95% presença".
/// [withArena]: em "Todas as arenas" com mais de uma, a arena vem antes.
String professorStudentSubtitle(ProfessorStudent s, {bool withArena = false}) {
  final classes = s.classes;
  final classPart = classes.isEmpty
      ? null
      : classes.length == 1
          ? classes.first.name
          : '${classes.first.name} +${classes.length - 1}';
  final presence = s.presenceRate == null
      ? 'sem chamada ainda'
      : '${s.presenceRate}% presença';
  return [
    if (withArena) s.arenaName,
    if (classPart != null) classPart,
    presence,
  ].join(' · ');
}

extension ProfessorBillingStandingX on ProfessorBillingStanding {
  String get label => switch (this) {
        ProfessorBillingStanding.upToDate => 'Em dia',
        ProfessorBillingStanding.dueToday => 'Vence hoje',
        ProfessorBillingStanding.overdue => 'Atrasado',
        ProfessorBillingStanding.paused => 'Pausado',
        ProfessorBillingStanding.noPlan => 'Sem plano',
      };
}

/// "Cobrado pela arena · próximo 05 nov" e afins.
String professorBillingDetail(ProfessorStudentBilling b, String todayKey) {
  final next = b.nextDueDate;
  return switch (b.standing) {
    ProfessorBillingStanding.overdue =>
      'Venceu ${next == null ? '' : '${professorShortDate(next)} '}· cobrança da arena',
    ProfessorBillingStanding.dueToday => 'Vence hoje · cobrança da arena',
    ProfessorBillingStanding.upToDate => next == null
        ? 'Cobrado pela arena'
        : 'Cobrado pela arena · próximo ${professorShortDate(next)}',
    ProfessorBillingStanding.paused => 'Plano pausado na arena',
    ProfessorBillingStanding.noPlan => 'Sem matrícula ativa na arena',
  };
}

/// Linha do plano no cartão "Plano e cobrança".
({String label, String value, String sub}) professorPlanRow(
  ProfessorStudentPlan p,
  String arenaName,
) {
  final paused = p.paused ? ' · pausado' : '';
  final price = formatBRL(p.priceReais);
  if (p.isPackage) {
    final total = p.credits;
    final left = p.creditsLeft;
    return (
      label: p.name,
      value: total == null || left == null ? price : '$left de $total',
      sub: [
            if (total != null && left != null) 'restantes',
            if (p.expiresOn != null)
              'validade ${professorShortDate(p.expiresOn!)}',
            price,
          ].join(' · ') +
          paused,
    );
  }
  if (p.kind == 'single') {
    return (
      label: p.name,
      value: price,
      sub: 'avulsa · tabela $arenaName$paused'
    );
  }
  return (
    label: 'Plano da arena',
    value: p.name,
    sub: '$price/mês · tabela $arenaName$paused',
  );
}

const List<String> _monthShort = [
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

/// "05 nov" de `YYYY-MM-DD`.
String professorShortDate(String dateKey) {
  final d = DateTime.tryParse(dateKey);
  if (d == null) return dateKey;
  return '${d.day.toString().padLeft(2, '0')} ${_monthShort[d.month - 1]}';
}

/// "DESDE MAR 2025".
String? professorSinceLabel(String? since) {
  final d = since == null ? null : DateTime.tryParse(since);
  if (d == null) return null;
  return 'desde ${_monthShort[d.month - 1]} ${d.year}'.toUpperCase();
}

/// "Seg e Qua · 07:00" / "Seg, Qua e Sex · 07:00" / "Aula avulsa · 07:00".
String professorScheduleLabel(List<int> weekdays, String startTime) {
  final days = weekdays.map(arenaClassWeekdayShort).toList();
  final when = switch (days.length) {
    0 => 'Aula avulsa',
    1 => days.first,
    _ => '${days.sublist(0, days.length - 1).join(', ')} e ${days.last}',
  };
  return startTime.isEmpty ? when : '$when · $startTime';
}

/// Letra da marca na faixa de presença: P, F, J ou R (reposição presente).
String professorMarkLetter(ProfessorStudentMark m) => switch (m.mark) {
      ProfessorMark.present => m.makeup ? 'R' : 'P',
      ProfessorMark.absent => 'F',
      ProfessorMark.excused => 'J',
    };

/// "Hoje · 19:00" / "Qua 21 · 07:00" / `null` sem aula marcada.
String? professorNextClassLabel(
  String? nextDate,
  String startTime,
  String todayKey,
) {
  if (nextDate == null) return null;
  final time = startTime.isEmpty ? '' : ' · $startTime';
  if (nextDate == todayKey) return 'Hoje$time';
  final weekday = arenaClassDateKeyWeekday(nextDate);
  final d = DateTime.tryParse(nextDate);
  if (weekday == null || d == null) return nextDate;
  return '${arenaClassWeekdayShort(weekday)} ${d.day}$time';
}

/// Subtítulo do Minhas turmas: "4 TURMAS · 21 ALUNOS".
/// `ownActive`/`ownStudents`: turmas próprias ativas (B10) e seus alunos, somados às da arena.
String professorClassesSubtitle(
  List<ProfessorClassSummary> classes, {
  int ownActive = 0,
  int ownStudents = 0,
}) {
  final students =
      classes.fold<int>(0, (sum, c) => sum + c.activeCount) + ownStudents;
  final n = classes.length + ownActive;
  return '$n turma${n == 1 ? '' : 's'} · $students aluno${students == 1 ? '' : 's'}'
      .toUpperCase();
}

/// Ocupação da turma em % (0 sem capacidade).
int professorOccupancy(ProfessorClassSummary c) => c.capacity <= 0
    ? 0
    : ((c.activeCount * 100) / c.capacity).round().clamp(0, 100);
