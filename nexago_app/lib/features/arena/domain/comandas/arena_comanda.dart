import 'package:cloud_firestore/cloud_firestore.dart';

enum ArenaComandaType {
  shared,
  individual,
  table,
  event,
}

enum ArenaComandaStatus {
  open,
  closing,
  partiallyPaid,
  closed,
}

extension ArenaComandaTypeX on ArenaComandaType {
  String get firestoreValue => name;

  static ArenaComandaType fromFirestore(String? raw) {
    final value = raw?.trim();
    if (value == null || value.isEmpty) {
      return ArenaComandaType.individual;
    }
    for (final t in ArenaComandaType.values) {
      if (t.name == value) return t;
    }
    return ArenaComandaType.individual;
  }
}

extension ArenaComandaStatusX on ArenaComandaStatus {
  String get firestoreValue => name;

  static ArenaComandaStatus fromFirestore(String? raw) {
    final value = raw?.trim();
    if (value == null || value.isEmpty) {
      return ArenaComandaStatus.open;
    }
    for (final s in ArenaComandaStatus.values) {
      if (s.name == value) return s;
    }
    return ArenaComandaStatus.open;
  }

  bool get isActive =>
      this == ArenaComandaStatus.open ||
      this == ArenaComandaStatus.closing ||
      this == ArenaComandaStatus.partiallyPaid;
}

/// Comanda em `arenaComandas/{comandaId}`.
class ArenaComanda {
  const ArenaComanda({
    required this.id,
    required this.arenaId,
    required this.displayNumber,
    required this.type,
    required this.status,
    required this.customerName,
    required this.allowAppOrders,
    required this.rentalCents,
    required this.itemsTotalCents,
    required this.totalCents,
    required this.itemsCount,
    required this.paidCents,
    required this.openedByUid,
    this.bookingId,
    this.bookingDisplayCode,
    this.locationLabel,
    this.customerWhatsapp,
    this.customerCpf,
    this.openedAt,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String arenaId;
  final int displayNumber;
  final ArenaComandaType type;
  final ArenaComandaStatus status;
  final String? bookingId;
  final String? bookingDisplayCode;
  final String? locationLabel;
  final String customerName;
  final String? customerWhatsapp;
  final String? customerCpf;
  final bool allowAppOrders;
  final int rentalCents;
  final int itemsTotalCents;
  final int totalCents;
  final int itemsCount;
  final int paidCents;
  final String openedByUid;
  final DateTime? openedAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  int get consumptionCents => itemsTotalCents;

  int get remainingCents =>
      (totalCents - paidCents).clamp(0, totalCents);

  bool get isFullyPaid => totalCents > 0 && paidCents >= totalCents;

  factory ArenaComanda.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return ArenaComanda(
      id: doc.id,
      arenaId: (data['arenaId'] as String?)?.trim() ?? '',
      displayNumber: (data['displayNumber'] as num?)?.toInt() ?? 0,
      type: ArenaComandaTypeX.fromFirestore(data['type'] as String?),
      status: ArenaComandaStatusX.fromFirestore(data['status'] as String?),
      bookingId: (data['bookingId'] as String?)?.trim(),
      bookingDisplayCode: (data['bookingDisplayCode'] as String?)?.trim(),
      locationLabel: (data['locationLabel'] as String?)?.trim(),
      customerName: (data['customerName'] as String?)?.trim() ?? 'Cliente',
      customerWhatsapp: (data['customerWhatsapp'] as String?)?.trim(),
      customerCpf: (data['customerCpf'] as String?)?.trim(),
      allowAppOrders: data['allowAppOrders'] == true,
      rentalCents: (data['rentalCents'] as num?)?.toInt() ?? 0,
      itemsTotalCents: (data['itemsTotalCents'] as num?)?.toInt() ?? 0,
      totalCents: (data['totalCents'] as num?)?.toInt() ?? 0,
      itemsCount: (data['itemsCount'] as num?)?.toInt() ?? 0,
      paidCents: (data['paidCents'] as num?)?.toInt() ?? 0,
      openedByUid: (data['openedByUid'] as String?)?.trim() ?? '',
      openedAt: _parseTimestamp(data['openedAt']),
      createdAt: _parseTimestamp(data['createdAt']),
      updatedAt: _parseTimestamp(data['updatedAt']),
    );
  }

  Map<String, dynamic> toFirestore({bool isCreate = false}) {
    return <String, dynamic>{
      'arenaId': arenaId,
      'displayNumber': displayNumber,
      'type': type.firestoreValue,
      'status': status.firestoreValue,
      if (bookingId != null && bookingId!.isNotEmpty) 'bookingId': bookingId,
      if (bookingDisplayCode != null && bookingDisplayCode!.isNotEmpty)
        'bookingDisplayCode': bookingDisplayCode,
      if (locationLabel != null && locationLabel!.isNotEmpty)
        'locationLabel': locationLabel,
      'customerName': customerName,
      if (customerWhatsapp != null && customerWhatsapp!.isNotEmpty)
        'customerWhatsapp': customerWhatsapp,
      if (customerCpf != null && customerCpf!.isNotEmpty)
        'customerCpf': customerCpf,
      'allowAppOrders': allowAppOrders,
      'rentalCents': rentalCents,
      'itemsTotalCents': itemsTotalCents,
      'totalCents': totalCents,
      'itemsCount': itemsCount,
      'paidCents': paidCents,
      'openedByUid': openedByUid,
      if (isCreate) ...{
        'openedAt': FieldValue.serverTimestamp(),
        'createdAt': FieldValue.serverTimestamp(),
      },
      'updatedAt': FieldValue.serverTimestamp(),
    };
  }

  static DateTime? _parseTimestamp(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }
}
