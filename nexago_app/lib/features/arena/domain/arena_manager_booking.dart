import 'package:cloud_firestore/cloud_firestore.dart';

import 'arena_date_utils.dart';

/// Documento de `arenaBookings` para o painel do gestor da arena.
class ArenaManagerBooking {
  const ArenaManagerBooking({
    required this.id,
    required this.athleteId,
    required this.courtName,
    required this.dateKey,
    required this.startTime,
    required this.endTime,
    required this.data,
  });

  final String id;
  final String athleteId;
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

  factory ArenaManagerBooking.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final d = doc.data() ?? {};
    final dateKey = arenaDateKeyFromDynamic(d['date']);

    final aid = d['athleteId'];
    final athleteId = aid is String && aid.trim().isNotEmpty ? aid.trim() : '';
    final courtRaw = d['courtName'] ?? d['court'] ?? d['courtId'];
    final courtName = courtRaw is String && courtRaw.trim().isNotEmpty
        ? courtRaw.trim()
        : 'Quadra';

    return ArenaManagerBooking(
      id: doc.id,
      athleteId: athleteId,
      courtName: courtName,
      dateKey: dateKey,
      startTime: _timeStr(d['startTime']),
      endTime: _timeStr(d['endTime']),
      data: d,
    );
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
