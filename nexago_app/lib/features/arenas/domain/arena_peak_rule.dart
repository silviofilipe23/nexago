import 'package:cloud_firestore/cloud_firestore.dart';

/// Regra de horário de pico em `arenas/{arenaId}/peakRules/{ruleId}` —
/// reserva mínima na faixa, com liberação opcional por antecedência.
/// Espelha `frontend/shared/arena-discovery/arena-peak-rule.ts`.
class ArenaPeakRule {
  const ArenaPeakRule({
    required this.id,
    required this.active,
    required this.label,
    required this.courtIds,
    required this.weekdays,
    required this.startTime,
    required this.endTime,
    required this.minDurationMinutes,
    this.releaseHoursBefore,
  });

  final String id;
  final bool active;
  final String label;

  /// Vazio = todas as quadras.
  final List<String> courtIds;

  /// 1=seg … 7=dom (ISO weekday).
  final List<int> weekdays;
  final String startTime;
  final String endTime;
  final int minDurationMinutes;

  /// null = nunca libera por antecedência.
  final int? releaseHoursBefore;

  factory ArenaPeakRule.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final courtIdsRaw = data['courtIds'];
    final courtIds = <String>[];
    if (courtIdsRaw is List) {
      for (final e in courtIdsRaw) {
        if (e is String && e.trim().isNotEmpty) courtIds.add(e.trim());
      }
    }
    final weekdaysRaw = data['weekdays'];
    final weekdays = <int>[];
    if (weekdaysRaw is List) {
      for (final e in weekdaysRaw) {
        if (e is num) weekdays.add(e.toInt());
      }
    }
    final minRaw = (data['minDurationMinutes'] as num?)?.toInt();
    final releaseRaw = (data['releaseHoursBefore'] as num?)?.toInt();
    return ArenaPeakRule(
      id: doc.id,
      active: data['active'] == true,
      label: (data['label'] as String?)?.trim() ?? 'Horário de pico',
      courtIds: courtIds,
      weekdays: weekdays,
      startTime: _normalizeHm(data['startTime'] as String? ?? '00:00'),
      endTime: _normalizeHm(data['endTime'] as String? ?? '23:59'),
      minDurationMinutes:
          (minRaw != null && minRaw >= 60 && minRaw <= 360) ? minRaw : 120,
      releaseHoursBefore:
          (releaseRaw != null && releaseRaw > 0) ? releaseRaw : null,
    );
  }

  bool matches({
    required String courtId,
    required DateTime date,
    required String slotStartTime,
  }) {
    if (!active) return false;
    if (courtIds.isNotEmpty && !courtIds.contains(courtId)) return false;
    if (weekdays.isNotEmpty && !weekdays.contains(date.weekday)) return false;

    final slotMin = _toMinutes(slotStartTime);
    final startMin = _toMinutes(startTime);
    final endMin = _toMinutes(endTime);
    if (slotMin == null || startMin == null || endMin == null) return false;
    if (endMin > startMin) {
      return slotMin >= startMin && slotMin < endMin;
    }
    // Faixa overnight (ex.: 22:00–01:00).
    return slotMin >= startMin || slotMin < endMin;
  }

  static String _normalizeHm(String raw) {
    final t = raw.trim();
    if (t.length >= 5) return t.substring(0, 5);
    return t;
  }

  static int? _toMinutes(String hm) {
    final parts = hm.split(':');
    if (parts.length < 2) return null;
    final h = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 0;
    return h * 60 + m.clamp(0, 59);
  }
}
