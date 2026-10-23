/// G3 · Alertas do centro no app: a trilha de auditoria (`auditLogs`, que só
/// owner/admin leem pelas rules) virando um feed por dia, com categoria e cor.
library;

class CenterAuditEntry {
  const CenterAuditEntry({
    required this.id,
    required this.action,
    this.at,
    this.actorName = '',
    this.entity = '',
    this.entityId = '',
    this.detail = '',
    this.reason = '',
  });

  factory CenterAuditEntry.fromMap(String id, Map<String, Object?> m) {
    String s(Object? v) => v is String ? v.trim() : '';
    return CenterAuditEntry(
      id: id,
      action: s(m['action']),
      at: m['at'] is DateTime ? m['at'] as DateTime : null,
      actorName: s(m['actorName']),
      entity: s(m['entity']),
      entityId: s(m['entityId']),
      detail: s(m['detail']),
      reason: s(m['reason']),
    );
  }

  final String id;

  /// `invoice.manual_confirm`, `session.cancelled`, `enrollment.active`…
  final String action;
  final DateTime? at;
  final String actorName;
  final String entity;
  final String entityId;
  final String detail;
  final String reason;
}

enum CenterAlertCategory { finance, schedule, enrollments, team, other }

const Map<CenterAlertCategory, String> kCenterAlertCategoryLabels = {
  CenterAlertCategory.finance: 'Financeiro',
  CenterAlertCategory.schedule: 'Agenda',
  CenterAlertCategory.enrollments: 'Matrículas',
  CenterAlertCategory.team: 'Equipe',
  CenterAlertCategory.other: 'Centro',
};

CenterAlertCategory centerAlertCategory(String action) {
  if (action == 'plan.price') return CenterAlertCategory.finance;
  final prefix = action.split('.').first;
  return switch (prefix) {
    'invoice' || 'payout' || 'subscription' => CenterAlertCategory.finance,
    'session' || 'class' || 'location' => CenterAlertCategory.schedule,
    'enrollment' || 'student' => CenterAlertCategory.enrollments,
    'member' || 'access' => CenterAlertCategory.team,
    _ => CenterAlertCategory.other,
  };
}

/// Tom do ponto: `red` (perda/risco), `green` (entrou dinheiro/gente),
/// `yellow` (mudança a conferir), `orange` (ação da fila) ou `mute`.
String centerAlertTone(String action) => switch (action) {
      'session.cancelled' ||
      'invoice.refund' ||
      'invoice.cancelled' ||
      'member.revoked' ||
      'access.denied' ||
      'enrollment.cancelled' ||
      'class.closed' ||
      'subscription.cancel_scheduled' =>
        'red',
      'invoice.manual_confirm' ||
      'payout.paid' ||
      'member.joined' ||
      'enrollment.created' ||
      'enrollment.active' ||
      'student.added' ||
      'student.joined_by_code' ||
      'session.checkin' =>
        'green',
      'session.changed' ||
      'session.attendance_corrected' ||
      'session.reopened' ||
      'enrollment.paused' ||
      'enrollment.waitlisted' ||
      'plan.price' =>
        'yellow',
      'enrollment.seat_offered' => 'orange',
      _ => 'mute',
    };

const Map<String, String> _titles = {
  'invoice.created': 'Cobrança criada',
  'invoice.manual_confirm': 'Pagamento confirmado à mão',
  'invoice.refund': 'Estorno',
  'invoice.cancelled': 'Cobrança cancelada',
  'payout.paid': 'Repasse pago',
  'payout.closed': 'Repasse fechado',
  'payout.rule': 'Regra de repasse',
  'payout.automation': 'Repasse automático',
  'subscription.cancel_scheduled': 'Assinatura vai encerrar',
  'subscription.cancel_undone': 'Encerramento desfeito',
  'session.cancelled': 'Aula cancelada',
  'session.changed': 'Aula alterada',
  'session.restored': 'Aula reativada',
  'session.reopened': 'Chamada reaberta',
  'session.finalized': 'Chamada finalizada',
  'session.attendance': 'Chamada salva',
  'session.attendance_corrected': 'Presença corrigida',
  'session.checkin': 'Check-in',
  'class.closed': 'Turma encerrada',
  'class.coach_updated': 'Professor da turma trocado',
  'class.series_changed': 'Horário da turma mudou',
  'location.created': 'Local criado',
  'location.archived': 'Local arquivado',
  'location.restored': 'Local reativado',
  'enrollment.created': 'Nova matrícula',
  'enrollment.active': 'Matrícula ativada',
  'enrollment.paused': 'Matrícula pausada',
  'enrollment.cancelled': 'Matrícula cancelada',
  'enrollment.completed': 'Matrícula concluída',
  'enrollment.waitlisted': 'Entrou na lista de espera',
  'enrollment.seat_offered': 'Vaga oferecida',
  'enrollment.hold_expired': 'Reserva vencida',
  'student.added': 'Aluno cadastrado',
  'student.joined_by_code': 'Aluno entrou pelo código',
  'student.updated': 'Cadastro do aluno alterado',
  'student.status': 'Situação do aluno mudou',
  'student.consent': 'Consentimento registrado',
  'member.invited': 'Convite para a equipe',
  'member.joined': 'Entrou na equipe',
  'member.revoked': 'Acesso removido',
  'member.invite_cancelled': 'Convite cancelado',
  'member.permissions': 'Permissões alteradas',
  'member.programs': 'Programas do membro',
  'access.denied': 'Acesso negado',
  'plan.created': 'Plano criado',
  'plan.updated': 'Plano alterado',
  'plan.price': 'Preço do plano mudou',
  'center.profile': 'Perfil do centro',
  'center.policies': 'Regras do centro',
  'center.notifications': 'Avisos do centro',
  'center.billing': 'Recebimentos do centro',
};

String centerAlertTitle(String action) {
  final t = _titles[action];
  if (t != null) return t;
  return switch (centerAlertCategory(action)) {
    CenterAlertCategory.finance => 'Financeiro',
    CenterAlertCategory.schedule => 'Agenda',
    CenterAlertCategory.enrollments => 'Matrícula',
    CenterAlertCategory.team => 'Equipe',
    CenterAlertCategory.other => 'Centro',
  };
}

/// Grupos do feed: "Hoje", "Ontem" e depois "Qua 21/10". [localDayKey]
/// transforma o instante no dia do centro (`YYYY-MM-DD`).
List<(String, List<CenterAuditEntry>)> centerAlertGroups(
  Iterable<CenterAuditEntry> entries, {
  required String todayKey,
  required String Function(DateTime at) localDayKey,
}) {
  final sorted = [
    for (final e in entries)
      if (e.at != null) e,
  ]..sort((a, b) => b.at!.compareTo(a.at!));
  final yesterday = _shift(todayKey, -1);
  final out = <(String, List<CenterAuditEntry>)>[];
  String? current;
  for (final e in sorted) {
    final day = localDayKey(e.at!);
    final label = day == todayKey
        ? 'Hoje'
        : day == yesterday
            ? 'Ontem'
            : _dayLabel(day);
    if (label != current) {
      out.add((label, []));
      current = label;
    }
    out.last.$2.add(e);
  }
  return out;
}

String _shift(String key, int days) {
  final d = DateTime.tryParse(key);
  if (d == null) return key;
  final x = DateTime.utc(d.year, d.month, d.day + days);
  return '${x.year}-${_two(x.month)}-${_two(x.day)}';
}

String _two(int n) => n.toString().padLeft(2, '0');

const _weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

String _dayLabel(String key) {
  final d = DateTime.tryParse(key);
  if (d == null) return key;
  return '${_weekdays[d.weekday - 1]} ${_two(d.day)}/${_two(d.month)}';
}
