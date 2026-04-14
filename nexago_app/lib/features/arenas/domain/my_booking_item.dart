import 'package:cloud_firestore/cloud_firestore.dart';

/// Linha de `arenaBookings` para a lista “Minhas reservas”.
class MyBookingItem {
  const MyBookingItem({
    required this.id,
    this.arenaId,
    required this.arenaName,
    this.courtName,
    this.coverUrl,
    this.logoUrl,
    required this.dateRaw,
    required this.startTime,
    required this.endTime,
    required this.rawStatus,
    this.amountReais,
    this.paymentType,
    this.createdAt,
  });

  final String id;
  final String? arenaId;
  final String arenaName;
  final String? courtName;
  final String? coverUrl;
  final String? logoUrl;
  /// `YYYY-MM-DD` quando disponível.
  final String dateRaw;
  final String startTime;
  final String endTime;
  final String rawStatus;
  final double? amountReais;
  final String? paymentType;
  final DateTime? createdAt;

  factory MyBookingItem.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final dateVal = data['date'];
    String dateRaw = '';
    if (dateVal is String) {
      dateRaw = dateVal.length >= 10 ? dateVal.substring(0, 10) : dateVal.trim();
    } else if (dateVal is Timestamp) {
      final d = dateVal.toDate();
      dateRaw =
          '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    }

    final start = _timeStr(data['startTime']);
    final end = _timeStr(data['endTime']);
    final statusRaw = data['status'];
    final status = statusRaw is String && statusRaw.trim().isNotEmpty
        ? statusRaw.trim()
        : 'active';

    final created = data['createdAt'];
    DateTime? createdAt;
    if (created is Timestamp) {
      createdAt = created.toDate();
    }

    final amountReais = (data['amountReais'] as num?)?.toDouble() ??
        (data['priceReais'] as num?)?.toDouble();
    final paymentTypeRaw = data['paymentType'] ?? data['paymentMethod'];
    final paymentType = paymentTypeRaw is String && paymentTypeRaw.trim().isNotEmpty
        ? paymentTypeRaw.trim()
        : null;

    final arena = data['arenaName'] ?? data['arena'];
    final arenaName = arena is String && arena.trim().isNotEmpty ? arena.trim() : 'Arena';
    final courtRaw = data['courtName'] ?? data['court'];
    final courtName =
        courtRaw is String && courtRaw.trim().isNotEmpty ? courtRaw.trim() : null;

    String? pickUrl(dynamic v) {
      if (v is! String) return null;
      final t = v.trim();
      return t.isEmpty ? null : t;
    }

    final arenaIdRaw = data['arenaId'];
    final arenaId =
        arenaIdRaw is String && arenaIdRaw.trim().isNotEmpty ? arenaIdRaw.trim() : null;

    return MyBookingItem(
      id: doc.id,
      arenaId: arenaId,
      arenaName: arenaName,
      courtName: courtName,
      coverUrl: pickUrl(data['coverUrl']) ?? pickUrl(data['arenaCoverUrl']) ?? pickUrl(data['coverImageUrl']),
      logoUrl: pickUrl(data['logoUrl']) ?? pickUrl(data['arenaLogoUrl']) ?? pickUrl(data['logoImageUrl']),
      dateRaw: dateRaw,
      startTime: start,
      endTime: end,
      rawStatus: status,
      amountReais: amountReais,
      paymentType: paymentType,
      createdAt: createdAt,
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

  /// Ordenação decrescente (mais recente primeiro).
  int get sortMillis {
    final ca = createdAt;
    if (ca != null) return ca.millisecondsSinceEpoch;
    final d = DateTime.tryParse(dateRaw.length >= 10 ? dateRaw : '');
    if (d == null) return 0;
    final parts = startTime.split(':');
    final h = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
    final m = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
    return DateTime(d.year, d.month, d.day, h, m).millisecondsSinceEpoch;
  }
}
