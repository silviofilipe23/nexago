import '../../../core/search/search_keywords.dart';
import 'center_coach.dart';

/// G9 Alunos e G10 Perfil do aluno no app (canvas "NexaGO Centro de
/// Treinamento", `ct-gestao-b.jsx`). Espelha `features/students/student-rows.ts`
/// do portal: mesma situação financeira, mesmos filtros e mesma busca.

/// Situação financeira resumida (em dia / aguardando / atrasado).
enum CenterFinanceState { ok, pending, late }

class CenterFinanceSummary {
  const CenterFinanceSummary(this.state, [this.note = '']);

  final CenterFinanceState state;
  final String note;
}

String centerFinanceLabel(CenterFinanceState s) => switch (s) {
      CenterFinanceState.ok => 'Em dia',
      CenterFinanceState.pending => 'Aguardando',
      CenterFinanceState.late => 'Atrasado',
    };

/// Status da cobrança como a tela mostra: pendente vencida vira `late`.
String centerInvoiceDisplayStatus(CenterCoachInvoice i, String todayKey) =>
    i.status == 'pending' &&
            i.dueDate.isNotEmpty &&
            i.dueDate.compareTo(todayKey) < 0
        ? 'late'
        : i.status;

const Map<String, String> kCenterInvoiceStatusLabels = {
  'approved': 'Pago',
  'pending': 'Pendente',
  'late': 'Vencido',
  'disputed': 'Contestado',
  'refunded': 'Estornado',
  'failed': 'Recusado',
  'cancelled': 'Cancelado',
};

const Map<String, String> kCenterEnrollmentStatusLabels = {
  'active': 'Ativa',
  'pending': 'Pendente',
  'paused': 'Pausada',
  'cancelled': 'Cancelada',
  'completed': 'Concluída',
  'waitlisted': 'Espera',
};

const Map<String, String> kCenterStudentStatusLabels = {
  'active': 'Ativo',
  'invited': 'Convidado',
  'inactive': 'Inativo',
  'blocked': 'Bloqueado',
};

/// Pior situação das cobranças: vencida/recusada/contestada = atrasado;
/// pendente no prazo = aguardando; só pagas = em dia. Canceladas e estornadas
/// não contam. `null` sem cobrança.
CenterFinanceSummary? centerFinanceOf(
  Iterable<CenterCoachInvoice> invoices,
  String todayKey,
) {
  final live = [
    for (final i in invoices)
      if (i.status != 'cancelled' && i.status != 'refunded') i,
  ]..sort((a, b) => a.dueDate.compareTo(b.dueDate));
  if (live.isEmpty) return null;
  for (final i in live) {
    final st = centerInvoiceDisplayStatus(i, todayKey);
    if (st == 'late' || st == 'failed' || st == 'disputed') {
      return CenterFinanceSummary(
        CenterFinanceState.late,
        'Venceu ${centerDayMonth(i.dueDate)}',
      );
    }
  }
  for (final i in live) {
    if (i.status == 'pending') {
      return CenterFinanceSummary(
        CenterFinanceState.pending,
        'Vence ${centerDayMonth(i.dueDate)}',
      );
    }
  }
  return const CenterFinanceSummary(CenterFinanceState.ok);
}

/// `2026-10-23` → `23/10`.
String centerDayMonth(String dateKey) {
  final d = dateKey.split('-');
  return d.length == 3 ? '${d[2]}/${d[1]}' : dateKey;
}

class CenterStudentRow {
  const CenterStudentRow({
    required this.student,
    required this.className,
    required this.planName,
    this.finance,
  });

  final CenterCoachStudent student;

  /// Turma de agora ("BT Intermediário B", "BT Iniciante +1" ou "—").
  final String className;
  final String planName;

  /// `null` sem financeiro (ou sem cobrança).
  final CenterFinanceSummary? finance;

  /// Tem pendência de dinheiro: cobrança atrasada ou bloqueio de check-in
  /// (o professor não vê cobranças, mas vê o bloqueio).
  bool get hasPending =>
      student.billingHold || finance?.state == CenterFinanceState.late;
}

String _joinNames(Iterable<String> names) {
  final uniq = <String>[];
  for (final n in names) {
    if (n.isNotEmpty && !uniq.contains(n)) uniq.add(n);
  }
  if (uniq.isEmpty) return '—';
  return uniq.length == 1 ? uniq.first : '${uniq.first} +${uniq.length - 1}';
}

/// Matrículas que ocupam vaga primeiro (são as que dizem a turma de agora);
/// sem nenhuma, as da lista de espera.
List<CenterCoachEnrollment> centerCurrentEnrollments(
  Iterable<CenterCoachEnrollment> list,
) {
  final seat = [
    for (final e in list)
      if (e.holdsSeat) e,
  ];
  if (seat.isNotEmpty) return seat;
  return [
    for (final e in list)
      if (e.status == 'waitlisted') e,
  ];
}

/// Linhas da lista G9. Sem matrículas (o professor não lê), a turma sai da
/// lista de alunos da turma (`rosterStudentIds`). Inativos ficam de fora.
List<CenterStudentRow> buildCenterStudentRows({
  required Iterable<CenterCoachStudent> students,
  required List<CenterCoachEnrollment> enrollments,
  required List<CenterCoachClass> classes,
  required List<CenterCoachInvoice>? invoices,
  required String todayKey,
}) {
  final enrBy = <String, List<CenterCoachEnrollment>>{};
  for (final e in enrollments) {
    (enrBy[e.studentId] ??= []).add(e);
  }
  final invBy = <String, List<CenterCoachInvoice>>{};
  for (final i in invoices ?? const <CenterCoachInvoice>[]) {
    if (i.studentId.isNotEmpty) (invBy[i.studentId] ??= []).add(i);
  }
  final rows = <CenterStudentRow>[];
  for (final s in students) {
    if (s.status == 'inactive') continue;
    final cur = centerCurrentEnrollments(enrBy[s.id] ?? const []);
    final className = cur.isNotEmpty
        ? _joinNames(cur.map((e) => e.className))
        : _joinNames([
            for (final c in classes)
              if (c.rosterStudentIds.contains(s.id)) c.name,
          ]);
    rows.add(
      CenterStudentRow(
        student: s,
        className: className,
        planName: _joinNames(cur.map((e) => e.planName)),
        finance: invoices == null
            ? null
            : centerFinanceOf(invBy[s.id] ?? const [], todayKey),
      ),
    );
  }
  rows.sort(
    (a, b) => normalizeSearchTerm(
      a.student.name,
    ).compareTo(normalizeSearchTerm(b.student.name)),
  );
  return rows;
}

enum CenterStudentFilter { all, pending, minors, credits }

const Map<CenterStudentFilter, String> kCenterStudentFilterLabels = {
  CenterStudentFilter.all: 'Todos',
  CenterStudentFilter.pending: 'Pendências',
  CenterStudentFilter.minors: 'Menores',
  CenterStudentFilter.credits: 'Com créditos',
};

bool centerStudentMatches(
  CenterStudentRow r,
  CenterStudentFilter f,
  String term,
) {
  final ok = switch (f) {
    CenterStudentFilter.all => true,
    CenterStudentFilter.pending => r.hasPending,
    CenterStudentFilter.minors => r.student.isMinor,
    CenterStudentFilter.credits => r.student.makeupCredits > 0,
  };
  if (!ok) return false;
  final t = normalizeSearchTerm(term);
  if (t.isEmpty) return true;
  return normalizeSearchTerm(r.student.name).contains(t) ||
      r.student.email.toLowerCase().contains(term.trim().toLowerCase());
}

/// "148 ATIVOS · 6 CONVIDADOS".
String centerStudentsHeadline(Iterable<CenterStudentRow> rows) {
  var active = 0, invited = 0;
  for (final r in rows) {
    if (r.student.status == 'active') active++;
    if (r.student.status == 'invited') invited++;
  }
  final parts = [
    active == 1 ? '1 ATIVO' : '$active ATIVOS',
    if (invited > 0) invited == 1 ? '1 CONVIDADO' : '$invited CONVIDADOS',
  ];
  return parts.join(' · ');
}

/// Marca do aluno numa aula da chamada.
class CenterStudentMark {
  const CenterStudentMark({
    required this.date,
    required this.className,
    required this.mark,
    this.makeup = false,
  });

  final String date;
  final String className;
  final CenterMark mark;
  final bool makeup;
}

/// Marcações do aluno até hoje (aulas não canceladas), da mais antiga para a
/// mais recente; as [limit] últimas.
List<CenterStudentMark> centerStudentMarks(
  Iterable<CenterCoachSession> sessions,
  String studentId,
  String todayKey, {
  int limit = 8,
}) {
  final list = [
    for (final s in sessions)
      if (!s.isCancelled &&
          s.date.compareTo(todayKey) <= 0 &&
          s.attendance[studentId] != null)
        s,
  ]..sort((a, b) {
      final d = a.date.compareTo(b.date);
      return d != 0 ? d : a.startTime.compareTo(b.startTime);
    });
  final marks = [
    for (final s in list)
      CenterStudentMark(
        date: s.date,
        className: s.className,
        mark: s.attendance[studentId]!,
        makeup: s.makeupStudentIds.contains(studentId),
      ),
  ];
  return marks.length > limit ? marks.sublist(marks.length - limit) : marks;
}

/// "75% · 6 de 8" ou "Sem chamada registrada".
String centerPresenceSummary(List<CenterStudentMark> marks) {
  if (marks.isEmpty) return 'Sem chamada registrada';
  final p = marks.where((m) => m.mark == CenterMark.present).length;
  return '${(p * 100 / marks.length).round()}% · $p de ${marks.length}';
}

/// Idade completa em [todayKey] (`null` sem data de nascimento).
int? centerAgeOn(String birthDate, String todayKey) {
  final b = birthDate.split('-').map(int.tryParse).toList();
  final t = todayKey.split('-').map(int.tryParse).toList();
  if (b.length != 3 || t.length != 3 || b.contains(null) || t.contains(null)) {
    return null;
  }
  final before = t[1]! < b[1]! || (t[1] == b[1] && t[2]! < b[2]!);
  return t[0]! - b[0]! - (before ? 1 : 0);
}

/// Telefone para falar sobre o aluno: o do responsável quando é menor.
String centerContactPhone(CenterCoachStudent s) =>
    s.isMinor && s.guardianPhone.isNotEmpty ? s.guardianPhone : s.phone;

/// Dígitos com DDI 55 para o `wa.me` (`null` se não der um número válido).
String? centerWhatsAppDigits(String phone) {
  var d = phone.replaceAll(RegExp(r'\D'), '');
  if (d.startsWith('0')) d = d.substring(1);
  if (d.length >= 12 && d.startsWith('55')) return d;
  if (d.length == 10 || d.length == 11) return '55$d';
  return null;
}

/// Dá para mandar mensagem pelo chat do app? Aluno
/// ativo, maior e com conta NexaGO — a mesma régua do servidor
/// (`functions/src/training-center-chat-model.ts`); menor fala pelo
/// responsável, por telefone.
bool centerStudentCanChat(CenterCoachStudent s) =>
    s.status == 'active' && !s.isMinor && s.uid.isNotEmpty;

/// "Plano mensal", "Pacote · 3 aulas restantes"…
String centerEnrollmentPlanLine(CenterCoachEnrollment e) {
  final name = e.planName.isNotEmpty ? e.planName : 'Plano';
  if (e.creditsLeft != null) {
    final n = e.creditsLeft!;
    return '$name · ${n == 1 ? '1 aula restante' : '$n aulas restantes'}';
  }
  return name;
}
