import '../../athlete_training/domain/center_enrollment_request.dart'
    show
        centerDayRange,
        centerFileSizeLabel,
        centerRequestTypeLabel,
        centerShortDay,
        kCenterCancelReasons,
        kCenterOpenRequestStatuses;

/// Trancar e cancelar na gestão do centro (T11, `ct-saida-app.jsx` ›
/// `CtgAprovarPausa`). A equipe com `view_enrollments` lê
/// `trainingCenters/{c}/enrollmentRequests` direto do Firestore (só o
/// servidor grava); owner/admin decidem pela callable
/// `decideTrainingCenterEnrollmentRequest` (inclusive `clear`, a alta
/// médica da pausa por lesão).

/// Atestado da pausa por lesão ou a alta médica (o arquivo mora no Storage).
class CenterExitCertificate {
  const CenterExitCertificate({
    required this.path,
    this.fileName = 'atestado',
    this.contentType = '',
    this.sizeBytes = 0,
    this.issuedOn,
    this.daysOff,
    this.doctor = '',
    this.description = '',
  });

  /// `null` sem caminho (pedido do balcão, sem atestado).
  static CenterExitCertificate? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final m = raw.map((k, v) => MapEntry('$k', v));
    final path = _str(m['path']);
    if (path.isEmpty) return null;
    return CenterExitCertificate(
      path: path,
      fileName: _str(m['fileName'], 'atestado'),
      contentType: _str(m['contentType']),
      sizeBytes: _int(m['sizeBytes']) ?? 0,
      issuedOn: _strOrNull(m['issuedOn']),
      daysOff: _int(m['daysOff']),
      doctor: _str(m['doctor']),
      description: _str(m['description']),
    );
  }

  final String path;
  final String fileName;
  final String contentType;
  final int sizeBytes;
  final String? issuedOn;
  final int? daysOff;
  final String doctor;
  final String description;

  bool get isPdf => contentType == 'application/pdf';
  bool get isImage => contentType.startsWith('image/');
  String get sizeLabel => centerFileSizeLabel(sizeBytes);
}

/// Pedido do aluno (`enrollmentRequests/{id}`).
class CenterExitRequest {
  const CenterExitRequest({
    required this.id,
    required this.type,
    required this.status,
    this.enrollmentId = '',
    this.studentId = '',
    this.studentName = '',
    this.className = '',
    this.planName = '',
    this.planType = 'monthly',
    this.priceCents = 0,
    this.source = 'app',
    this.comment = '',
    this.reason = '',
    this.startsOn,
    this.endsOn,
    this.pausedUntil,
    this.days,
    this.overLimit = false,
    this.lastDay,
    this.certificate,
    this.createdAt,
    this.decidedAt,
    this.decidedByName = '',
    this.decisionNote = '',
    this.retainedPlanName,
    this.retainedDiscountPercent,
    this.effectiveFrom,
    this.requireClearance = false,
    this.clearanceStatus = '',
    this.clearance,
    this.awaitingClearance = false,
    this.clearanceDecidedByName = '',
    this.clearanceNote = '',
    this.releaseSeat = false,
    this.awaitingSeat = false,
  });

  /// [m] já com `Timestamp` convertido em [DateTime].
  factory CenterExitRequest.fromMap(String id, Map<String, Object?> m) {
    final retention = m['retention'] is Map
        ? (m['retention'] as Map).map((k, v) => MapEntry('$k', v))
        : const <String, Object?>{};
    return CenterExitRequest(
      id: id,
      type: _str(m['type'], 'pause'),
      status: _str(m['status'], 'pending'),
      enrollmentId: _str(m['enrollmentId']),
      studentId: _str(m['studentId']),
      studentName: _str(m['studentName'], 'Aluno'),
      className: _str(m['className']),
      planName: _str(m['planName']),
      planType: _str(m['planType'], 'monthly'),
      priceCents: _int(m['priceCents']) ?? 0,
      source: _str(m['source'], 'app'),
      comment: _str(m['comment']),
      reason: _str(m['reason']),
      startsOn: _strOrNull(m['startsOn']),
      endsOn: _strOrNull(m['endsOn']),
      pausedUntil: _strOrNull(m['pausedUntil']),
      days: _int(m['days']),
      overLimit: m['overLimit'] == true,
      lastDay: _strOrNull(m['lastDay']),
      certificate: CenterExitCertificate.fromMap(m['certificate']),
      createdAt: m['createdAt'] is DateTime ? m['createdAt'] as DateTime : null,
      decidedAt: m['decidedAt'] is DateTime ? m['decidedAt'] as DateTime : null,
      decidedByName: _str(m['decidedByName']),
      decisionNote: _str(m['decisionNote']),
      retainedPlanName: _strOrNull(retention['planName']),
      retainedDiscountPercent: retention['accepted'] == 'discount'
          ? _int(retention['percent'])
          : null,
      effectiveFrom: _strOrNull(m['effectiveFrom']),
      requireClearance: m['requireClearance'] == true,
      clearanceStatus: _str(m['clearanceStatus']),
      clearance: CenterExitCertificate.fromMap(m['clearance']),
      awaitingClearance: m['awaitingClearance'] == true,
      clearanceDecidedByName: _str(m['clearanceDecidedByName']),
      clearanceNote: _str(m['clearanceNote']),
      releaseSeat: m['releaseSeat'] == true,
      awaitingSeat: m['awaitingSeat'] == true,
    );
  }

  final String id;

  /// `pause`, `injury` ou `cancel`.
  final String type;

  /// `pending`, `needs_document`, `scheduled`, `active`, `rejected`,
  /// `withdrawn`, `retained` ou `done`.
  final String status;
  final String enrollmentId;
  final String studentId;
  final String studentName;
  final String className;
  final String planName;
  final String planType;
  final int priceCents;

  /// `app` (aluno) ou `desk` (balcão).
  final String source;
  final String comment;

  /// Cancelamento: chave da lista; pausa: texto livre.
  final String reason;
  final String? startsOn;
  final String? endsOn;
  final String? pausedUntil;
  final int? days;

  /// Lesão acima do limite do centro (sempre caso a caso).
  final bool overLimit;
  final String? lastDay;
  final CenterExitCertificate? certificate;
  final DateTime? createdAt;
  final DateTime? decidedAt;
  final String decidedByName;
  final String decisionNote;
  final String? retainedPlanName;

  /// Ficou com o desconto de 1 mês (`retention.accepted == 'discount'`).
  final int? retainedDiscountPercent;
  final String? effectiveFrom;

  /// Pausa por lesão com alta exigida (regra congelada no pedido).
  final bool requireClearance;

  /// `''`, `requested`, `submitted` ou `approved`.
  final String clearanceStatus;

  /// Arquivo da alta enviado pelo aluno.
  final CenterExitCertificate? clearance;

  /// A pausa passou do fim e segue segurada esperando a alta.
  final bool awaitingClearance;
  final String clearanceDecidedByName;
  final String clearanceNote;

  /// Trancamento que devolve a vaga à turma (política congelada no pedido).
  final bool releaseSeat;

  /// Trancamento terminou com a turma cheia: segue pausado, sem cobrança,
  /// com prioridade sobre a fila na primeira vaga.
  final bool awaitingSeat;

  /// Só o trancamento libera a vaga; a lesão sempre reserva.
  bool get releasesSeat => type == 'pause' && releaseSeat;

  /// Em curso esperando vaga na turma.
  bool get waitsForSeat => releasesSeat && status == 'active' && awaitingSeat;

  bool get isOpen => kCenterOpenRequestStatuses.contains(status);
  bool get isCancel => type == 'cancel';
  bool get isInjury => type == 'injury';

  /// Esperando a gestão revisar o atestado.
  bool get awaitsReview => status == 'pending';

  /// Lesão em curso com alta exigida e ainda não aprovada: a gestão pode
  /// aprovar (ou liberar sem alta).
  bool get clearanceOpen =>
      isInjury &&
      status == 'active' &&
      requireClearance &&
      clearanceStatus != 'approved';

  /// Alta esperando a gestão: o aluno enviou ou a volta está segurada.
  bool get awaitsClearance =>
      clearanceOpen && (clearanceStatus == 'submitted' || awaitingClearance);

  /// Precisa de alguém da gestão (atestado ou alta).
  bool get needsAttention => awaitsReview || awaitsClearance;

  String get typeLabel => centerRequestTypeLabel(type);

  /// Motivo legível (no cancelamento, o rótulo da lista).
  String get reasonLabel {
    if (!isCancel) return reason;
    for (final (k, label) in kCenterCancelReasons) {
      if (k == reason) return label;
    }
    return reason;
  }

  /// "24 out a 23 nov" ou "último dia 23 nov".
  String get periodLabel => isCancel
      ? (lastDay == null ? '' : 'último dia ${centerShortDay(lastDay!)}')
      : centerDayRange(startsOn, endsOn);
}

/// Tom da situação (pílula).
enum CenterExitTone { attention, info, danger, neutral, success }

/// Situação na gestão.
({String label, CenterExitTone tone}) centerExitStatusOf(CenterExitRequest r) =>
    switch (r.status) {
      'pending' => (label: 'Revisar', tone: CenterExitTone.attention),
      'needs_document' => (
          label: 'Aguardando documento',
          tone: CenterExitTone.attention,
        ),
      'scheduled' => (
          label: r.isCancel ? 'Em aviso' : 'Agendada',
          tone: r.isCancel ? CenterExitTone.danger : CenterExitTone.info,
        ),
      'active' when r.clearanceOpen && r.clearanceStatus == 'submitted' => (
          label: 'Revisar alta',
          tone: CenterExitTone.attention,
        ),
      'active' when r.clearanceOpen && r.awaitingClearance => (
          label: 'Esperando alta',
          tone: CenterExitTone.attention,
        ),
      'active' when r.waitsForSeat => (
          label: 'Turma cheia',
          tone: CenterExitTone.info,
        ),
      'active' => (label: 'Em curso', tone: CenterExitTone.info),
      'rejected' => (label: 'Recusado', tone: CenterExitTone.neutral),
      'withdrawn' => (label: 'Desfeito', tone: CenterExitTone.neutral),
      'retained' => (label: 'Ficou', tone: CenterExitTone.success),
      'done' => (label: 'Concluído', tone: CenterExitTone.neutral),
      _ => (label: r.status, tone: CenterExitTone.neutral),
    };

/// Situação da alta médica no detalhe (`null` = o pedido não tem alta).
String? centerExitClearanceLabel(CenterExitRequest r) {
  if (!r.isInjury || !r.requireClearance) return null;
  return switch (r.clearanceStatus) {
    'approved' => 'Aprovada',
    'submitted' => 'Enviada · revisar',
    'requested' => 'Pedida ao aluno',
    _ => 'Pedida 3 dias antes do fim',
  };
}

/// Vaga do trancamento no detalhe (`null` = vaga reservada, como sempre).
String? centerExitSeatLabel(CenterExitRequest r) {
  if (!r.releasesSeat) return null;
  return r.waitsForSeat
      ? 'Turma cheia · volta na primeira vaga'
      : 'Vaga liberada para a turma';
}

/// Decisões possíveis para owner/admin (mesma régua da callable). [clear] =
/// aprovar a alta (ou liberar sem ela) na pausa por lesão em curso.
({bool approve, bool reject, bool askDocument, bool undo, bool clear})
    centerExitActions(CenterExitRequest r) {
  final review = r.status == 'pending' || r.status == 'needs_document';
  return (
    approve: review && !r.isCancel,
    reject: review && !r.isCancel,
    askDocument: r.status == 'pending' && r.isInjury,
    undo: r.status == 'scheduled',
    clear: r.clearanceOpen,
  );
}

/// Lista da gestão: a revisar (atestados e altas), em andamento e encerrados
/// (recentes primeiro).
({
  List<CenterExitRequest> review,
  List<CenterExitRequest> open,
  List<CenterExitRequest> closed,
}) centerExitGroups(List<CenterExitRequest> all) {
  int newest(CenterExitRequest a, CenterExitRequest b) =>
      (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0));
  final review = [
    for (final r in all)
      if (r.needsAttention) r,
  ]..sort((a, b) => -newest(a, b));
  final open = [
    for (final r in all)
      if (r.isOpen && !r.needsAttention) r,
  ]..sort(newest);
  final closed = [
    for (final r in all)
      if (!r.isOpen) r,
  ]..sort(newest);
  return (review: review, open: open, closed: closed);
}

/// Pedidos esperando a gestão (aviso no Hoje): atestados a revisar e altas
/// enviadas ou com a volta segurada.
int centerExitPendingCount(List<CenterExitRequest> all) =>
    all.where((r) => r.needsAttention).length;

/// Escrita da gestão nos pedidos.
abstract class CenterExitRequestsRepository {
  /// Pedidos do centro (mais recentes primeiro).
  Stream<List<CenterExitRequest>> watch(String centerId);

  /// `approve`, `reject`, `needs_document`, `undo` ou `clear` (alta médica);
  /// devolve a situação nova.
  Future<String> decide({
    required String centerId,
    required String requestId,
    required String decision,
    String note = '',
  });

  /// Link temporário do atestado ou da alta (só owner/admin lê, pela rule
  /// do Storage).
  Future<String> certificateUrl(String path);
}

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

int? _int(Object? v) => v is num ? v.toInt() : null;
