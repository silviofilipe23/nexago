import 'package:cloud_firestore/cloud_firestore.dart';

/// Meta de faturamento mensal em `arenas/{arenaId}/goals/monthlyRevenue`.
///
/// Doc privado (o da arena é público): lê quem lê o financeiro; grava só o
/// dono — ver a regra em `firestore.rules`.
class ArenaGoalsRepository {
  const ArenaGoalsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  /// Teto aceito pela regra (R$ 10 milhões/mês).
  static const double maxMonthlyRevenueReais = 10000000;

  DocumentReference<Map<String, dynamic>> _doc(String arenaId) => _firestore
      .collection('arenas')
      .doc(arenaId)
      .collection('goals')
      .doc('monthlyRevenue');

  /// Meta atual; `null` quando não definida.
  Stream<double?> watchMonthlyRevenue(String arenaId) {
    return _doc(arenaId).snapshots().map((snap) {
      final v = snap.data()?['amountReais'];
      return v is num && v > 0 ? v.toDouble() : null;
    });
  }

  Future<void> saveMonthlyRevenue({
    required String arenaId,
    required String uid,
    required double amountReais,
  }) {
    if (amountReais <= 0 || amountReais > maxMonthlyRevenueReais) {
      throw ArgumentError.value(amountReais, 'amountReais');
    }
    return _doc(arenaId).set({
      'amountReais': amountReais,
      'updatedAt': FieldValue.serverTimestamp(),
      'updatedBy': uid,
    });
  }

  Future<void> clearMonthlyRevenue(String arenaId) => _doc(arenaId).delete();
}
