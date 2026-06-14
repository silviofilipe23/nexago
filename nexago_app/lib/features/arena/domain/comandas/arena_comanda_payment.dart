import 'package:cloud_firestore/cloud_firestore.dart';

enum ArenaComandaPaymentMethod {
  pix,
  credit,
  debit,
  cash,
  wallet,
  other,
}

extension ArenaComandaPaymentMethodX on ArenaComandaPaymentMethod {
  String get firestoreValue => name;

  static ArenaComandaPaymentMethod fromFirestore(String? raw) {
    final value = raw?.trim();
    if (value == null || value.isEmpty) {
      return ArenaComandaPaymentMethod.other;
    }
    for (final m in ArenaComandaPaymentMethod.values) {
      if (m.name == value) return m;
    }
    return ArenaComandaPaymentMethod.other;
  }
}

/// Pagamento em `arenaComandas/{comandaId}/payments/{paymentId}`.
class ArenaComandaPayment {
  const ArenaComandaPayment({
    required this.id,
    required this.method,
    required this.amountCents,
    required this.payerName,
    required this.receivedByUid,
    this.createdAt,
  });

  final String id;
  final ArenaComandaPaymentMethod method;
  final int amountCents;
  final String payerName;
  final String receivedByUid;
  final DateTime? createdAt;

  factory ArenaComandaPayment.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return ArenaComandaPayment(
      id: doc.id,
      method: ArenaComandaPaymentMethodX.fromFirestore(data['method'] as String?),
      amountCents: (data['amountCents'] as num?)?.toInt() ?? 0,
      payerName: (data['payerName'] as String?)?.trim() ?? 'Cliente',
      receivedByUid: (data['receivedByUid'] as String?)?.trim() ?? '',
      createdAt: _parseTimestamp(data['createdAt']),
    );
  }

  Map<String, dynamic> toFirestore() {
    return <String, dynamic>{
      'method': method.firestoreValue,
      'amountCents': amountCents,
      'payerName': payerName,
      'receivedByUid': receivedByUid,
      'createdAt': FieldValue.serverTimestamp(),
    };
  }

  static DateTime? _parseTimestamp(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }
}
