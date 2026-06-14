import 'package:cloud_firestore/cloud_firestore.dart';

enum ArenaComandaItemSource {
  counter,
  app,
}

extension ArenaComandaItemSourceX on ArenaComandaItemSource {
  String get firestoreValue => name;

  static ArenaComandaItemSource fromFirestore(String? raw) {
    final value = raw?.trim();
    if (value == 'app') return ArenaComandaItemSource.app;
    return ArenaComandaItemSource.counter;
  }
}

/// Item em `arenaComandas/{comandaId}/items/{itemId}`.
class ArenaComandaItem {
  const ArenaComandaItem({
    required this.id,
    required this.productId,
    required this.productName,
    required this.quantity,
    required this.unitPriceCents,
    required this.lineTotalCents,
    required this.source,
    required this.addedByName,
    required this.addedByUid,
    this.emoji,
    this.createdAt,
  });

  final String id;
  final String productId;
  final String productName;
  final String? emoji;
  final int quantity;
  final int unitPriceCents;
  final int lineTotalCents;
  final ArenaComandaItemSource source;
  final String addedByName;
  final String addedByUid;
  final DateTime? createdAt;

  factory ArenaComandaItem.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return ArenaComandaItem(
      id: doc.id,
      productId: (data['productId'] as String?)?.trim() ?? '',
      productName: (data['productName'] as String?)?.trim() ?? 'Item',
      emoji: (data['emoji'] as String?)?.trim(),
      quantity: (data['quantity'] as num?)?.toInt() ?? 0,
      unitPriceCents: (data['unitPriceCents'] as num?)?.toInt() ?? 0,
      lineTotalCents: (data['lineTotalCents'] as num?)?.toInt() ?? 0,
      source: ArenaComandaItemSourceX.fromFirestore(data['source'] as String?),
      addedByName: (data['addedByName'] as String?)?.trim() ?? 'Gestor',
      addedByUid: (data['addedByUid'] as String?)?.trim() ?? '',
      createdAt: _parseTimestamp(data['createdAt']),
    );
  }

  Map<String, dynamic> toFirestore() {
    final emojiValue = emoji?.trim();
    return <String, dynamic>{
      'productId': productId,
      'productName': productName,
      if (emojiValue != null &&
          emojiValue.isNotEmpty &&
          emojiValue.length <= 16)
        'emoji': emojiValue,
      'quantity': quantity,
      'unitPriceCents': unitPriceCents,
      'lineTotalCents': lineTotalCents,
      'source': source.firestoreValue,
      'addedByName': addedByName,
      'addedByUid': addedByUid,
      'createdAt': FieldValue.serverTimestamp(),
    };
  }

  static DateTime? _parseTimestamp(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }
}

/// Linha para lançamento em lote.
class ArenaComandaAddItemLine {
  const ArenaComandaAddItemLine({
    required this.productId,
    required this.quantity,
  });

  final String productId;
  final int quantity;
}
