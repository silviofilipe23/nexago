import 'package:cloud_firestore/cloud_firestore.dart';

/// Movimentação em `arenas/{arenaId}/stockMovements/{movementId}`.
enum ArenaStockMovementType {
  purchase,
  adjustment,
  loss,
  sale,
}

extension ArenaStockMovementTypeX on ArenaStockMovementType {
  String get firestoreValue => name;

  String get label => switch (this) {
        ArenaStockMovementType.purchase => 'Compra',
        ArenaStockMovementType.adjustment => 'Ajuste',
        ArenaStockMovementType.loss => 'Perda',
        ArenaStockMovementType.sale => 'Venda',
      };

  static ArenaStockMovementType fromFirestore(String? raw) {
    final value = raw?.trim();
    if (value == null || value.isEmpty) {
      return ArenaStockMovementType.adjustment;
    }
    for (final t in ArenaStockMovementType.values) {
      if (t.name == value) return t;
    }
    return ArenaStockMovementType.adjustment;
  }
}

class ArenaStockMovement {
  const ArenaStockMovement({
    required this.id,
    required this.productId,
    required this.productName,
    required this.type,
    required this.quantityDelta,
    required this.quantityBefore,
    required this.quantityAfter,
    required this.createdByUid,
    this.note,
    this.createdAt,
  });

  final String id;
  final String productId;
  final String productName;
  final ArenaStockMovementType type;
  final int quantityDelta;
  final int quantityBefore;
  final int quantityAfter;
  final String createdByUid;
  final String? note;
  final DateTime? createdAt;

  bool get isInbound => quantityDelta > 0;

  factory ArenaStockMovement.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return ArenaStockMovement(
      id: doc.id,
      productId: (data['productId'] as String?)?.trim() ?? '',
      productName: (data['productName'] as String?)?.trim() ?? '',
      type: ArenaStockMovementTypeX.fromFirestore(data['type'] as String?),
      quantityDelta: (data['quantityDelta'] as num?)?.toInt() ?? 0,
      quantityBefore: (data['quantityBefore'] as num?)?.toInt() ?? 0,
      quantityAfter: (data['quantityAfter'] as num?)?.toInt() ?? 0,
      createdByUid: (data['createdByUid'] as String?)?.trim() ?? '',
      note: (data['note'] as String?)?.trim(),
      createdAt: _parseTimestamp(data['createdAt']),
    );
  }

  Map<String, dynamic> toFirestore() {
    return <String, dynamic>{
      'productId': productId,
      'productName': productName,
      'type': type.firestoreValue,
      'quantityDelta': quantityDelta,
      'quantityBefore': quantityBefore,
      'quantityAfter': quantityAfter,
      'createdByUid': createdByUid,
      if (note != null && note!.isNotEmpty) 'note': note,
      'createdAt': FieldValue.serverTimestamp(),
    };
  }

  static DateTime? _parseTimestamp(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }
}
