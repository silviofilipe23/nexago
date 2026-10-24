import '../../../core/time/nexago_event_timezone.dart';
import '../../athlete_training/domain/center_contract.dart';

/// K5 · Contratos do aluno na gestão do centro (canvas "Contratos dos alunos",
/// `ct-contratos.jsx` › `CtgContratos`). A equipe com `enroll_students` lê
/// `trainingCenters/{c}/contracts` direto do Firestore (só o servidor grava);
/// o lembrete sai pela callable `remindTrainingCenterContract` (1 por hora).
/// Situação e rótulos: `center_contract.dart` (mesma régua do servidor).

/// Linha da trilha do contrato (`events[]`).
class CenterContractEvent {
  const CenterContractEvent({
    required this.type,
    required this.title,
    this.at,
    this.byName = '',
    this.detail = '',
  });

  factory CenterContractEvent.fromMap(Map<String, Object?> m) =>
      CenterContractEvent(
        type: _str(m['type']),
        title: _str(m['title']),
        at: _date(m['at']),
        byName: _str(m['byName']),
        detail: _str(m['detail']),
      );

  /// `sent`, `viewed`, `reminded`, `signed`, `declined`, `terminated` ou
  /// `cancelled`.
  final String type;
  final String title;
  final DateTime? at;
  final String byName;
  final String detail;
}

/// Contrato de UM aluno (`trainingCenters/{c}/contracts/{id}`).
class CenterStudentContract {
  const CenterStudentContract({
    required this.id,
    required this.status,
    this.number = '',
    this.title = 'Contrato',
    this.templateName = '',
    this.templateVersion = 1,
    this.kind = 'term',
    this.optional = false,
    this.studentId = '',
    this.studentName = '',
    this.isMinor = false,
    this.signerRole = 'student',
    this.signerName = '',
    this.signerRelation = '',
    this.body = '',
    this.essentials = const [],
    this.enrollmentId,
    this.className = '',
    this.planName = '',
    this.startDate,
    this.endDate,
    this.requireBeforePayment = false,
    this.sentAt,
    this.sentByName = '',
    this.viewCount = 0,
    this.viewedAt,
    this.lastViewedAt,
    this.signedAt,
    this.centerSignatureName = '',
    this.centerSignatureAt,
    this.reminderCount = 0,
    this.remindedAt,
    this.terminatedAt,
    this.terminateReason = '',
    this.events = const [],
  });

  /// [m] já com `Timestamp` convertido em [DateTime].
  factory CenterStudentContract.fromMap(String id, Map<String, Object?> m) {
    final signer = m['signer'] is Map ? _map(m['signer'] as Map) : const {};
    final center = m['centerSignature'] is Map
        ? _map(m['centerSignature'] as Map)
        : const <String, Object?>{};
    final essentials = m['essentials'];
    final events = m['events'];
    return CenterStudentContract(
      id: id,
      status: _str(m['status'], 'sent'),
      number: _str(m['number']),
      title: _str(m['title'], 'Contrato'),
      templateName: _str(m['templateName']),
      templateVersion: _int(m['templateVersion']) ?? 1,
      kind: _str(m['kind'], 'term'),
      optional: m['optional'] == true,
      studentId: _str(m['studentId']),
      studentName: _str(m['studentName']),
      isMinor: m['isMinor'] == true,
      signerRole: _str(signer['role'], 'student'),
      signerName: _str(signer['name'], _str(m['studentName'])),
      signerRelation: _str(signer['relation']),
      body: m['body'] is String ? m['body'] as String : '',
      essentials: essentials is List
          ? [
              for (final e in essentials)
                if (e is Map && _str(e['label']).isNotEmpty)
                  (label: _str(e['label']), value: _str(e['value'])),
            ]
          : const [],
      enrollmentId: _strOrNull(m['enrollmentId']),
      className: _str(m['className']),
      planName: _str(m['planName']),
      startDate: _strOrNull(m['startDate']),
      endDate: _strOrNull(m['endDate']),
      requireBeforePayment: m['requireBeforePayment'] == true,
      sentAt: _date(m['sentAt']) ?? _date(m['createdAt']),
      sentByName: _str(m['sentByName']),
      viewCount: _int(m['viewCount']) ?? 0,
      viewedAt: _date(m['viewedAt']),
      lastViewedAt: _date(m['lastViewedAt']) ?? _date(m['viewedAt']),
      signedAt: _date(m['signedAt']),
      centerSignatureName: _str(center['name']),
      centerSignatureAt: _date(center['at']),
      reminderCount: _int(m['reminderCount']) ?? 0,
      remindedAt: _date(m['remindedAt']),
      terminatedAt: _date(m['terminatedAt']),
      terminateReason: _str(m['terminateReason']),
      events: events is List
          ? [
              for (final e in events)
                if (e is Map) CenterContractEvent.fromMap(_map(e)),
            ]
          : const [],
    );
  }

  final String id;

  /// `sent`, `viewed`, `signed`, `declined`, `terminated` ou `cancelled`.
  final String status;
  final String number;
  final String title;
  final String templateName;
  final int templateVersion;

  /// `enrollment` ou `term`.
  final String kind;
  final bool optional;
  final String studentId;
  final String studentName;
  final bool isMinor;

  /// `student` ou `guardian`.
  final String signerRole;
  final String signerName;
  final String signerRelation;

  /// Texto congelado no envio (já preenchido).
  final String body;
  final List<({String label, String value})> essentials;
  final String? enrollmentId;
  final String className;
  final String planName;
  final String? startDate;
  final String? endDate;
  final bool requireBeforePayment;
  final DateTime? sentAt;
  final String sentByName;
  final int viewCount;
  final DateTime? viewedAt;
  final DateTime? lastViewedAt;
  final DateTime? signedAt;
  final String centerSignatureName;
  final DateTime? centerSignatureAt;
  final int reminderCount;
  final DateTime? remindedAt;
  final DateTime? terminatedAt;
  final String terminateReason;
  final List<CenterContractEvent> events;

  bool get isOpen => status == 'sent' || status == 'viewed';
  bool get asGuardian => signerRole == 'guardian';

  /// "Matrícula · adulto v3" (o nome do modelo), senão o título.
  String get displayName =>
      templateName.isEmpty ? title : '$templateName v$templateVersion';

  ContractState state(String todayKey) =>
      contractStateOf(status, endDate, todayKey);
}

/// Leituras e o lembrete dos contratos do aluno (gestão).
abstract class CenterContractsRepository {
  Stream<List<CenterStudentContract>> watchStudentContracts(
    String centerId,
    String studentId,
  );

  /// Reenvia o push ao aluno; devolve quantos lembretes já saíram. Lança
  /// `CenterCoachException` com a mensagem da callable (ex.: 1 por hora).
  Future<int> remind({required String centerId, required String contractId});
}

/// Contratos do aluno separados para a K5.
class CenterContractGroups {
  const CenterContractGroups({
    this.pending,
    this.current = const [],
    this.history = const [],
  });

  /// O aberto em destaque: o que segura o pagamento, senão o mais antigo.
  final CenterStudentContract? pending;

  /// Vigentes e abertos (o pendente também aparece aqui).
  final List<CenterStudentContract> current;

  /// Encerrados, cancelados, recusados e expirados.
  final List<CenterStudentContract> history;

  bool get isEmpty => current.isEmpty && history.isEmpty;
}

CenterContractGroups centerContractGroups(
  List<CenterStudentContract> all,
  String todayKey,
) {
  int byRecent(CenterStudentContract a, CenterStudentContract b) =>
      (b.sentAt ?? _epoch).compareTo(a.sentAt ?? _epoch);
  final current = <CenterStudentContract>[];
  final history = <CenterStudentContract>[];
  for (final c in all) {
    (contractStateIsHistory(c.state(todayKey)) ? history : current).add(c);
  }
  current.sort((a, b) {
    if (a.isOpen != b.isOpen) return a.isOpen ? -1 : 1;
    return byRecent(a, b);
  });
  history.sort(byRecent);
  final open = [
    for (final c in current)
      if (c.isOpen) c,
  ]..sort((a, b) {
      if (a.requireBeforePayment != b.requireBeforePayment) {
        return a.requireBeforePayment ? -1 : 1;
      }
      return (a.sentAt ?? _epoch).compareTo(b.sentAt ?? _epoch);
    });
  return CenterContractGroups(
    pending: open.isEmpty ? null : open.first,
    current: current,
    history: history,
  );
}

/// Dias desde o envio no calendário do centro (`null` sem data).
int? centerContractPendingDays(CenterStudentContract c, DateTime now) {
  final sent = c.sentAt;
  if (sent == null) return null;
  final d =
      contractDaysBetween(nexagoEventDayKey(sent), nexagoEventDayKey(now));
  return d == null || d < 0 ? 0 : d;
}

/// "HOJE", "1 DIA", "4 DIAS".
String centerContractPendingBadge(int days) => days <= 0
    ? 'HOJE'
    : days == 1
        ? '1 DIA'
        : '$days DIAS';

/// Texto do card do pendente: quem abriu (ou não) e, quando o contrato segura
/// a cobrança, o aviso do pagamento.
String centerContractPendingText(CenterStudentContract c, DateTime now) {
  final who = _firstName(c.signerName.isEmpty ? c.studentName : c.signerName);
  final doc = c.kind == 'enrollment' ? 'o contrato' : 'o documento';
  final base = c.status == 'viewed' && c.viewCount > 0
      ? '$who abriu $doc ${c.viewCount == 1 ? '1 vez' : '${c.viewCount} vezes'}'
          ' e não assinou.'
      : '${c.sentAt == null ? 'Enviado' : 'Enviado ${_day(c.sentAt!, now)}'}. '
          '$who ainda não abriu.';
  return c.requireBeforePayment
      ? '$base O pagamento da matrícula só é liberado depois da assinatura.'
      : base;
}

/// Linha de apoio do documento na lista ("Aberto 3× · último ontem 21:14").
String centerContractRowLine(CenterStudentContract c, DateTime now) {
  final today = nexagoEventDayKey(now);
  String day(DateTime? t) => t == null ? '' : ' ${_day(t, now)}';
  final reason = c.terminateReason.isEmpty ? '' : ' · ${c.terminateReason}';
  return switch (c.state(today)) {
    ContractState.sent => 'Enviado${day(c.sentAt)}'
        '${c.reminderCount > 0 && c.remindedAt != null ? ' · lembrete${day(c.remindedAt)}' : ''}',
    ContractState.viewed => 'Aberto ${c.viewCount}×'
        '${c.lastViewedAt == null ? '' : ' · último ${centerContractWhen(c.lastViewedAt!, now)}'}',
    ContractState.signed => c.asGuardian
        ? '${c.signerName} (resp.)${c.signedAt == null ? '' : ' ·${day(c.signedAt)}'}'
        : 'Assinado${day(c.signedAt)}',
    ContractState.expiring => 'Assinado${day(c.signedAt)} · vence '
        '${contractDayMonth(c.endDate ?? '')}',
    ContractState.expired => 'Expirou ${contractDayMonth(c.endDate ?? '')}',
    ContractState.declined => 'Recusado${day(c.signedAt)}',
    ContractState.terminated => 'Encerrado${day(c.terminatedAt)}$reason',
    ContractState.cancelled => 'Cancelado${day(c.terminatedAt)}$reason',
  };
}

/// "hoje 10:02", "ontem 21:14" ou "20 out 21:14" (fuso do centro).
String centerContractWhen(DateTime instant, DateTime now) {
  final wall = toNexagoEventLocal(instant);
  final hm = '${wall.hour.toString().padLeft(2, '0')}:'
      '${wall.minute.toString().padLeft(2, '0')}';
  final key = nexagoEventDayKey(instant);
  final gap = contractDaysBetween(key, nexagoEventDayKey(now));
  if (gap == 0) return 'hoje $hm';
  if (gap == 1) return 'ontem $hm';
  return '${_day(instant, now)} $hm';
}

/// `https://wa.me/55…` do telefone (sem DDI ganha o 55); `null` sem número
/// que abra conversa.
Uri? centerWhatsappUri(String phone, {String message = ''}) {
  var digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.length == 10 || digits.length == 11) digits = '55$digits';
  if (digits.length < 12) return null;
  return Uri.parse(
    'https://wa.me/$digits'
    '${message.isEmpty ? '' : '?text=${Uri.encodeComponent(message)}'}',
  );
}

// ── auxiliares ───────────────────────────────────────────────────────────

final _epoch = DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);

/// "20 out" (com o ano quando não é o ano de [now]).
String _day(DateTime instant, DateTime now) {
  final key = nexagoEventDayKey(instant);
  final sameYear =
      key.substring(0, 4) == nexagoEventDayKey(now).substring(0, 4);
  return contractDayMonth(key, withYear: !sameYear);
}

String _firstName(String name) {
  final n = name.trim();
  if (n.isEmpty) return 'O aluno';
  return n.split(RegExp(r'\s+')).first;
}

String _str(Object? v, [String fallback = '']) =>
    v is String && v.trim().isNotEmpty ? v.trim() : fallback;

String? _strOrNull(Object? v) =>
    v is String && v.trim().isNotEmpty ? v.trim() : null;

int? _int(Object? v) => v is num ? v.toInt() : null;

DateTime? _date(Object? v) => v is DateTime
    ? v
    : v is String
        ? DateTime.tryParse(v)
        : null;

Map<String, Object?> _map(Map<dynamic, dynamic> m) =>
    m.map((k, v) => MapEntry('$k', v));
