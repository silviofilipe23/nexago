import 'training_center.dart';

/// Trancar, pausa por lesão e cancelar a matrícula do CT (canvas T5–T10,
/// `ct-saida-app.jsx`) vistos pelo aluno. Espelha `MyCenterEnrollmentRequest`
/// de `functions/src/training-center-athlete.ts` e as regras puras de
/// `functions/src/training-center-enrollment-requests-model.ts` — o servidor
/// decide de novo; aqui só o que a tela precisa para não deixar o aluno
/// pedir o impossível.

/// Pausa pedida pode começar até tantos dias à frente (`PAUSE_MAX_LEAD_DAYS`).
const int kCenterPauseMaxLeadDays = 60;

/// Teto absoluto de uma pausa (`PAUSE_MAX_DAYS`).
const int kCenterPauseMaxDays = 365;

/// Atestado: PDF ou foto até 10 MB (`CERTIFICATE_MAX_BYTES`).
const int kCenterCertificateMaxBytes = 10 * 1024 * 1024;

/// Motivos do cancelamento (`CANCEL_REASONS`), na ordem do protótipo.
const List<(String, String)> kCenterCancelReasons = [
  ('price', 'Preço'),
  ('schedule', 'Horário não funciona mais'),
  ('moving', 'Mudança de cidade'),
  ('health', 'Lesão ou saúde'),
  ('class', 'Não gostei da turma'),
  ('other', 'Outro'),
];

/// Situações em andamento (`OPEN_REQUEST_STATUSES`).
const Set<String> kCenterOpenRequestStatuses = {
  'pending',
  'needs_document',
  'scheduled',
  'active',
};

/// Plano mensal mais barato oferecido em vez de cancelar.
class CenterRetentionPlan {
  const CenterRetentionPlan({
    required this.planId,
    required this.name,
    this.priceCents = 0,
    this.classesPerWeek,
  });

  factory CenterRetentionPlan.fromMap(Map<String, Object?> m) =>
      CenterRetentionPlan(
        planId: _str(m['planId']),
        name: _str(m['name'], 'Plano'),
        priceCents: _int(m['priceCents']) ?? 0,
        classesPerWeek: _int(m['classesPerWeek']),
      );

  final String planId;
  final String name;
  final int priceCents;
  final int? classesPerWeek;
}

/// Pedido de trancamento, pausa por lesão ou cancelamento do aluno.
class CenterEnrollmentRequest {
  const CenterEnrollmentRequest({
    required this.requestId,
    required this.enrollmentId,
    required this.type,
    required this.status,
    this.className = '',
    this.startsOn,
    this.endsOn,
    this.days,
    this.lastDay,
    this.reason = '',
    this.decisionNote = '',
    this.createdOn,
    this.hasCertificate = false,
    this.retainedPlanName,
    this.effectiveFrom,
  });

  factory CenterEnrollmentRequest.fromMap(Map<String, Object?> m) =>
      CenterEnrollmentRequest(
        requestId: _str(m['requestId']),
        enrollmentId: _str(m['enrollmentId']),
        type: _str(m['type'], 'pause'),
        status: _str(m['status'], 'pending'),
        className: _str(m['className']),
        startsOn: _strOrNull(m['startsOn']),
        endsOn: _strOrNull(m['endsOn']),
        days: _int(m['days']),
        lastDay: _strOrNull(m['lastDay']),
        reason: _str(m['reason']),
        decisionNote: _str(m['decisionNote']),
        createdOn: _strOrNull(m['createdOn']),
        hasCertificate: m['hasCertificate'] == true,
        retainedPlanName: _strOrNull(m['retainedPlanName']),
        effectiveFrom: _strOrNull(m['effectiveFrom']),
      );

  final String requestId;
  final String enrollmentId;

  /// `pause`, `injury` ou `cancel`.
  final String type;

  /// `pending`, `needs_document`, `scheduled`, `active`, `rejected`,
  /// `withdrawn`, `retained` ou `done`.
  final String status;
  final String className;

  /// `YYYY-MM-DD` (pausa).
  final String? startsOn;
  final String? endsOn;
  final int? days;

  /// Último dia de aula (cancelamento).
  final String? lastDay;

  /// Motivo legível (no cancelamento, o rótulo da lista).
  final String reason;

  /// Recado da gestão (recusa ou pedido de outro documento).
  final String decisionNote;
  final String? createdOn;
  final bool hasCertificate;
  final String? retainedPlanName;
  final String? effectiveFrom;

  bool get isOpen => kCenterOpenRequestStatuses.contains(status);
  bool get isCancel => type == 'cancel';
  bool get isPause => type == 'pause' || type == 'injury';
}

/// O que a tela "Minha matrícula" mostra para um pedido em andamento.
enum CenterRequestState {
  /// Atestado esperando a revisão da gestão (T7).
  injuryReview,

  /// A gestão pediu outro documento.
  documentRequested,

  /// Pausa aprovada que ainda não começou.
  pauseScheduled,

  /// Pausa em curso.
  pauseActive,

  /// Cancelamento em aviso até o último dia (T10).
  cancelScheduled,
}

/// `null` = o pedido não está em andamento.
CenterRequestState? centerRequestStateOf(CenterEnrollmentRequest r) {
  if (r.isCancel) {
    return r.status == 'scheduled' ? CenterRequestState.cancelScheduled : null;
  }
  return switch (r.status) {
    'pending' => CenterRequestState.injuryReview,
    'needs_document' => CenterRequestState.documentRequested,
    'scheduled' => CenterRequestState.pauseScheduled,
    'active' => CenterRequestState.pauseActive,
    _ => null,
  };
}

/// O aluno pode desistir pelo app (mesma régua de `undoRequest`).
bool centerRequestWithdrawable(
  CenterEnrollmentRequest r,
  CenterPolicies p,
  String todayKey,
) {
  if (r.isCancel) {
    return r.status == 'scheduled' &&
        p.allowCancelWithdraw &&
        (r.lastDay ?? '').compareTo(todayKey) >= 0;
  }
  return const {'scheduled', 'pending', 'needs_document'}.contains(r.status);
}

/// "Trancamento", "Pausa por lesão" ou "Cancelamento".
String centerRequestTypeLabel(String type) => switch (type) {
      'injury' => 'Pausa por lesão',
      'cancel' => 'Cancelamento',
      _ => 'Trancamento',
    };

/// Situação para a linha do histórico.
String centerRequestStatusLabel(CenterEnrollmentRequest r) =>
    switch (r.status) {
      'pending' => 'Em análise',
      'needs_document' => 'Outro documento',
      'scheduled' => r.isCancel ? 'Agendado' : 'Aprovada',
      'active' => 'Em curso',
      'rejected' => 'Não aprovada',
      'withdrawn' => 'Desfeito',
      'retained' => 'Ficou com outro plano',
      'done' => 'Concluído',
      _ => r.status,
    };

/// Dias de trancamento livres no ano (nunca negativo).
int centerPauseDaysLeft(CenterPolicies p, CenterEnrollment e) {
  final left = p.pauseMaxDaysPerYear - e.pauseDaysUsed;
  return left < 0 ? 0 : left;
}

/// Trancar pelo app: mensal ativa, centro permite e sobra o mínimo no ano.
bool centerCanPause(CenterPolicies p, CenterEnrollment e) =>
    p.allowPause &&
    !e.isPack &&
    e.isActive &&
    centerPauseDaysLeft(p, e) >= p.pauseMinDays;

/// Pausa por lesão: só a mensal ativa (pacote não tranca).
bool centerCanInjuryPause(CenterEnrollment e) => !e.isPack && e.isActive;

/// Cancelar: matrícula ativa ou pausada.
bool centerCanCancel(CenterEnrollment e) =>
    e.status == 'active' || e.status == 'paused';

/// Subtítulo da opção "Trancar matrícula".
String centerPauseOptionText(CenterPolicies p, CenterEnrollment e) {
  if (!p.allowPause) return 'Este centro não tranca pelo app';
  if (e.isPack) return 'Pacote não tranca: as aulas valem até a validade';
  final left = centerPauseDaysLeft(p, e);
  if (left < p.pauseMinDays) {
    return left == 0
        ? 'Você já usou os dias de trancamento do ano'
        : 'Restam $left dias no ano (mínimo ${p.pauseMinDays})';
  }
  return '$left dias livres no ano · vaga reservada';
}

/// Subtítulo da opção "Pausa por lesão".
String centerInjuryOptionText(CenterPolicies p) => p.injuryCountsInLimit
    ? 'Com atestado · conta no limite do ano'
    : 'Com atestado · não conta no limite';

/// Subtítulo da opção "Cancelar matrícula" (aviso conforme a política).
String centerCancelOptionText(CenterPolicies p, CenterEnrollment e) {
  if (e.isPack || p.monthlyCancellation == 'immediate') {
    return 'Encerra na hora, sem próximo ciclo';
  }
  final last = e.cancelLastDay;
  return last == null
      ? 'Vale até o fim do ciclo pago'
      : 'Aulas até ${centerShortDay(last)} (fim do ciclo pago)';
}

/// Erro do formulário de trancamento/pausa (`null` = pode enviar). Mesmas
/// mensagens de `planPause`.
String? centerPauseFormError({
  required String type,
  required String todayKey,
  required String startsOn,
  required int? days,
  required CenterPolicies policies,
  required int daysLeft,
}) {
  if (days == null || days < 1) return 'Informe quantos dias de pausa.';
  if (days > kCenterPauseMaxDays) return 'A pausa pode ter no máximo 1 ano.';
  if (startsOn.compareTo(todayKey) < 0) {
    return 'A pausa não pode começar no passado.';
  }
  if (centerDaysBetween(todayKey, startsOn) > kCenterPauseMaxLeadDays) {
    return 'A pausa precisa começar nos próximos $kCenterPauseMaxLeadDays dias.';
  }
  if (type == 'pause' && days < policies.pauseMinDays) {
    return 'O trancamento mínimo é de ${policies.pauseMinDays} dias.';
  }
  final counts = type == 'pause' || policies.injuryCountsInLimit;
  if (counts && days > daysLeft) {
    return daysLeft > 0
        ? 'Você tem $daysLeft dia${daysLeft == 1 ? '' : 's'} de trancamento '
            'livre${daysLeft == 1 ? '' : 's'} neste ano.'
        : 'Você já usou todos os dias de trancamento deste ano.';
  }
  return null;
}

/// Último dia da pausa (inclusive).
String centerPauseEndsOn(String startsOn, int days) =>
    centerShiftDay(startsOn, days - 1);

/// Ofertas antes de cancelar (T9), conforme `cancelRetention`. O trancamento
/// só entra se der para trancar.
({bool pause, List<CenterRetentionPlan> plans}) centerRetentionOffers(
  CenterPolicies p,
  CenterEnrollment e,
) =>
    (
      pause: p.cancelRetention.contains('pause') && centerCanPause(p, e),
      plans: p.cancelRetention.contains('plan_change')
          ? e.retentionPlans
          : const [],
    );

/// Tipo do arquivo do atestado pela extensão; `null` = não aceito.
String? centerCertificateContentType(String fileName) {
  final dot = fileName.lastIndexOf('.');
  final ext = dot < 0 ? '' : fileName.substring(dot + 1).toLowerCase();
  return switch (ext) {
    'pdf' => 'application/pdf',
    'jpg' || 'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'webp' => 'image/webp',
    'heic' => 'image/heic',
    _ => null,
  };
}

/// Nome seguro para o caminho no Storage (sem barra nem espaço).
String centerCertificateFileSlug(String fileName) {
  final s = fileName
      .trim()
      .replaceAll(RegExp(r'[^A-Za-z0-9._-]+'), '-')
      .replaceAll(RegExp(r'-+'), '-');
  final cut = s.length > 60 ? s.substring(s.length - 60) : s;
  return cut.isEmpty || cut == '.' || cut.startsWith('..') ? 'atestado' : cut;
}

/// "340 KB" / "1,2 MB".
String centerFileSizeLabel(int bytes) {
  if (bytes < 1024 * 1024) return '${(bytes / 1024).ceil()} KB';
  final mb = (bytes / (1024 * 1024)).toStringAsFixed(1).replaceAll('.', ',');
  return '$mb MB';
}

// ── datas `YYYY-MM-DD` ─────────────────────────────────────────────────────

/// Soma [days] ao dia (UTC, sem fuso).
String centerShiftDay(String dayKey, int days) {
  final d = DateTime.tryParse(dayKey);
  if (d == null) return dayKey;
  final r = DateTime.utc(d.year, d.month, d.day + days);
  return '${r.year.toString().padLeft(4, '0')}-'
      '${r.month.toString().padLeft(2, '0')}-'
      '${r.day.toString().padLeft(2, '0')}';
}

/// Dias de [from] até [to] (negativo se [to] vem antes).
int centerDaysBetween(String from, String to) {
  final a = DateTime.tryParse(from);
  final b = DateTime.tryParse(to);
  if (a == null || b == null) return 0;
  return DateTime.utc(b.year, b.month, b.day)
      .difference(DateTime.utc(a.year, a.month, a.day))
      .inDays;
}

const _monthsShort = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/// "24 out".
String centerShortDay(String dayKey) {
  final d = DateTime.tryParse(dayKey);
  if (d == null) return dayKey;
  return '${d.day.toString().padLeft(2, '0')} ${_monthsShort[d.month - 1]}';
}

/// "24 out a 23 nov".
String centerDayRange(String? from, String? to) {
  if (from == null || to == null) return '';
  return '${centerShortDay(from)} a ${centerShortDay(to)}';
}

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

int? _int(Object? v) => v is num ? v.toInt() : null;
