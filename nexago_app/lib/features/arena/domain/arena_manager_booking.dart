import 'package:cloud_firestore/cloud_firestore.dart';

import 'arena_date_utils.dart';

/// Id da aula (`arenaClassSessions/{id}`) quando o booking é o bloqueio de
/// quadra de uma aula; `null` para reserva comum.
///
/// O backend grava `isClassSession: true` e `classSessionId` (igual ao id do
/// booking, `class_{turma}_{data}`). Espelha `classSessionId` do portal
/// (`arena-booking.model.ts`). Esse booking só sai pela própria aula: a rule
/// recusa à equipe mudar o `status` dele.
String? arenaBookingClassSessionId(
  String bookingId,
  Map<String, dynamic>? data,
) {
  if (data == null) return null;
  final raw = data['classSessionId'];
  final explicit = raw is String && raw.trim().isNotEmpty ? raw.trim() : null;
  if (data['isClassSession'] == true) {
    final id = bookingId.trim();
    return explicit ?? (id.isEmpty ? null : id);
  }
  return explicit;
}

/// Documento de `arenaBookings` para o painel do gestor da arena.
class ArenaManagerBooking {
  const ArenaManagerBooking({
    required this.id,
    required this.athleteId,
    required this.courtId,
    required this.courtName,
    required this.dateKey,
    required this.startTime,
    required this.endTime,
    required this.data,
  });

  final String id;
  final String athleteId;

  /// ID em `arenas/{arenaId}/courts/{courtId}` (pode estar vazio em docs antigos).
  final String courtId;
  final String courtName;

  /// `YYYY-MM-DD`
  final String dateKey;

  final String startTime;
  final String endTime;

  /// Campos crus para rótulos de pagamento/status na UI.
  final Map<String, dynamic> data;

  String get attendanceStatus {
    final raw = (data['attendanceStatus'] as String?)?.trim().toLowerCase() ?? '';
    if (raw.isEmpty) return 'pending';
    return raw;
  }

  bool get attendanceConfirmed => data['attendanceConfirmed'] == true;

  /// Reserva cancelada não ocupa horário na agenda (espelha `bookingIsActive` do web).
  bool get isCanceled {
    final raw = (data['status'] as String?)?.trim().toLowerCase() ?? '';
    return raw == 'canceled' || raw == 'cancelled';
  }

  /// Ocorrência de um horário fixo (série em `arenaRecurringBookings`).
  bool get isRecurring =>
      data['isRecurring'] == true || recurringBookingId != null;

  String? get recurringBookingId {
    final raw = data['recurringBookingId'];
    if (raw is String && raw.trim().isNotEmpty) return raw.trim();
    return null;
  }

  /// Aula dona deste bloqueio de quadra (ver [arenaBookingClassSessionId]).
  String? get classSessionId => arenaBookingClassSessionId(id, data);

  /// Bloqueio de quadra de uma aula: sem cancelar nem check-in, só "Abrir aula".
  bool get isClassBlock => classSessionId != null;

  /// Reservada como professor (vínculo com "Reservar quadras"); ver
  /// `arenaBookingProfessorLabel`.
  bool get bookedAsProfessor => data['bookedAs'] == 'professor';

  /// Desconto (%) do vínculo aplicado na reserva de professor; 0 sem desconto.
  int get professorDiscountPercent {
    final raw = data['professorDiscountPercent'];
    return bookedAsProfessor && raw is num && raw.isFinite && raw > 0
        ? raw.round()
        : 0;
  }

  /// Mensalista sem conta no app (nome livre digitado pelo gestor).
  String? get customerName {
    final raw = data['customerName'];
    if (raw is String && raw.trim().isNotEmpty) return raw.trim();
    return null;
  }

  factory ArenaManagerBooking.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final d = doc.data() ?? {};
    final dateKey = arenaDateKeyFromDynamic(d['date']);

    final aid = d['athleteId'];
    final athleteId = aid is String && aid.trim().isNotEmpty ? aid.trim() : '';
    final courtId = _optionalTrimmedString(d['courtId']);
    final labelFromDoc = _optionalTrimmedString(d['courtName']) ??
        _optionalTrimmedString(d['court']);
    final courtName = _initialCourtDisplayName(
      courtId: courtId,
      labelFromDoc: labelFromDoc,
    );

    return ArenaManagerBooking(
      id: doc.id,
      athleteId: athleteId,
      courtId: courtId ?? '',
      courtName: courtName,
      dateKey: dateKey,
      startTime: _timeStr(d['startTime']),
      endTime: _timeStr(d['endTime']),
      data: d,
    );
  }

  /// Substitui placeholder ou ID pelo nome da quadra quando disponível.
  ArenaManagerBooking enrichCourtName(Map<String, String> namesByCourtId) {
    final resolvedId = courtId.trim();
    if (resolvedId.isEmpty || namesByCourtId.isEmpty) return this;

    final resolved = namesByCourtId[resolvedId]?.trim();
    if (resolved == null || resolved.isEmpty) return this;
    if (courtName == resolved) return this;

    return ArenaManagerBooking(
      id: id,
      athleteId: athleteId,
      courtId: courtId,
      courtName: resolved,
      dateKey: dateKey,
      startTime: startTime,
      endTime: endTime,
      data: data,
    );
  }

  static String? _optionalTrimmedString(dynamic value) {
    if (value is! String) return null;
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  static String _initialCourtDisplayName({
    required String? courtId,
    required String? labelFromDoc,
  }) {
    if (labelFromDoc != null &&
        labelFromDoc.isNotEmpty &&
        (courtId == null || labelFromDoc != courtId)) {
      return labelFromDoc;
    }
    return 'Quadra';
  }

  static String _timeStr(dynamic v) {
    if (v == null) return '--:--';
    if (v is String) {
      final t = v.trim();
      return t.length >= 5 ? t.substring(0, 5) : t;
    }
    return '--:--';
  }
}
