import 'package:cloud_firestore/cloud_firestore.dart';

/// Promoção em `arenas/{arenaId}/promotions/{promoId}` (horários ociosos, etc.).
class ArenaPromotion {
  const ArenaPromotion({
    required this.id,
    required this.active,
    required this.label,
    required this.courtIds,
    required this.weekdays,
    required this.startTime,
    required this.endTime,
    this.discountPercent,
    this.fixedPricePerHourReais,
    this.validFrom,
    this.validUntil,
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
  final double? discountPercent;
  final double? fixedPricePerHourReais;
  final DateTime? validFrom;
  final DateTime? validUntil;

  factory ArenaPromotion.fromFirestore(
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

    return ArenaPromotion(
      id: doc.id,
      active: data['active'] == true,
      label: (data['label'] as String?)?.trim() ?? 'Promoção',
      courtIds: courtIds,
      weekdays: weekdays,
      startTime: _normalizeHm(data['startTime'] as String? ?? '00:00'),
      endTime: _normalizeHm(data['endTime'] as String? ?? '23:59'),
      discountPercent: (data['discountPercent'] as num?)?.toDouble(),
      fixedPricePerHourReais:
          (data['fixedPricePerHourReais'] as num?)?.toDouble(),
      validFrom: _parseTimestamp(data['validFrom']),
      validUntil: _parseTimestamp(data['validUntil']),
    );
  }

  /// Converte para mapa Firestore (criação pelo gestor).
  Map<String, dynamic> toFirestore() {
    return <String, dynamic>{
      'active': active,
      'label': label,
      if (courtIds.isNotEmpty) 'courtIds': courtIds,
      if (weekdays.isNotEmpty) 'weekdays': weekdays,
      'startTime': startTime,
      'endTime': endTime,
      if (discountPercent != null) 'discountPercent': discountPercent,
      if (fixedPricePerHourReais != null)
        'fixedPricePerHourReais': fixedPricePerHourReais,
      if (validFrom != null) 'validFrom': Timestamp.fromDate(validFrom!),
      if (validUntil != null) 'validUntil': Timestamp.fromDate(validUntil!),
      'createdAt': FieldValue.serverTimestamp(),
    };
  }

  /// Campos editáveis pelo gestor (não altera `active` nem `createdAt`).
  Map<String, dynamic> toFirestoreUpdate() {
    final data = <String, dynamic>{
      'label': label,
      'startTime': startTime,
      'endTime': endTime,
      'weekdays': weekdays,
      'updatedAt': FieldValue.serverTimestamp(),
    };

    if (courtIds.isEmpty) {
      data['courtIds'] = FieldValue.delete();
    } else {
      data['courtIds'] = courtIds;
    }

    if (discountPercent != null) {
      data['discountPercent'] = discountPercent;
      data['fixedPricePerHourReais'] = FieldValue.delete();
    } else if (fixedPricePerHourReais != null) {
      data['fixedPricePerHourReais'] = fixedPricePerHourReais;
      data['discountPercent'] = FieldValue.delete();
    } else {
      data['discountPercent'] = FieldValue.delete();
      data['fixedPricePerHourReais'] = FieldValue.delete();
    }

    return data;
  }

  bool matches({
    required String courtId,
    required DateTime date,
    required String slotStartTime,
  }) {
    if (!active) return false;

    final day = DateTime(date.year, date.month, date.day);
    if (validFrom != null && day.isBefore(_dateOnly(validFrom!))) return false;
    if (validUntil != null && day.isAfter(_dateOnly(validUntil!))) return false;

    if (courtIds.isNotEmpty && !courtIds.contains(courtId)) return false;
    if (weekdays.isNotEmpty && !weekdays.contains(date.weekday)) return false;

    final slotMin = _toMinutes(slotStartTime);
    final startMin = _toMinutes(startTime);
    final endMin = _toMinutes(endTime);
    if (slotMin == null || startMin == null || endMin == null) return false;

    if (endMin > startMin) {
      return slotMin >= startMin && slotMin < endMin;
    }
    // Janela overnight (ex.: 22:00–02:00)
    return slotMin >= startMin || slotMin < endMin;
  }

  /// Preço do slot após esta promoção (`null` se promo não altera preço).
  double? applyToSlot({
    required double baseSlotPriceReais,
    required double hourlyBaseReais,
    required int slotDurationMinutes,
  }) {
    if (fixedPricePerHourReais != null && fixedPricePerHourReais! > 0) {
      final raw = fixedPricePerHourReais! * (slotDurationMinutes / 60);
      return (raw * 100).roundToDouble() / 100;
    }
    if (discountPercent != null && discountPercent! > 0) {
      final factor = 1 - (discountPercent!.clamp(0, 100) / 100);
      final raw = baseSlotPriceReais * factor;
      return (raw * 100).roundToDouble() / 100;
    }
    return null;
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

  static DateTime? _parseTimestamp(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    return null;
  }

  static DateTime _dateOnly(DateTime d) =>
      DateTime(d.year, d.month, d.day);
}
