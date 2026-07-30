import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

class ArenaWalletSummary {
  const ArenaWalletSummary({
    required this.availableReais,
    required this.pendingReais,
  });

  final double availableReais;
  final double pendingReais;
}

class ArenaLedgerEntry {
  const ArenaLedgerEntry({
    required this.id,
    required this.netReais,
    required this.grossReais,
    required this.bookingId,
    required this.createdAt,
  });

  final String id;
  final double netReais;
  final double grossReais;
  final String? bookingId;
  final DateTime? createdAt;

  factory ArenaLedgerEntry.fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data();
    return ArenaLedgerEntry(
      id: doc.id,
      netReais: (d['netReais'] as num?)?.toDouble() ?? 0,
      grossReais: (d['grossReais'] as num?)?.toDouble() ?? 0,
      bookingId: d['bookingId'] as String?,
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}

class ArenaWithdrawalItem {
  const ArenaWithdrawalItem({
    required this.id,
    required this.amountReais,
    required this.status,
    required this.pixKey,
    required this.createdAt,
    this.feeReais,
    this.netReais,
    this.payoutStatus,
    this.asaasTransferId,
  });

  final String id;

  /// Bruto: o que sai do saldo da carteira.
  final double amountReais;

  /// Tarifa de saque retida (Elite é isento). `null` em docs anteriores à tarifa.
  final double? feeReais;

  /// Líquido efetivamente transferido por PIX. `null` em docs antigos.
  final double? netReais;

  final String status;
  final String pixKey;
  final DateTime? createdAt;
  final String? payoutStatus;
  final String? asaasTransferId;

  factory ArenaWithdrawalItem.fromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final d = doc.data();
    return ArenaWithdrawalItem(
      id: doc.id,
      amountReais: (d['amountReais'] as num?)?.toDouble() ?? 0,
      feeReais: (d['feeReais'] as num?)?.toDouble(),
      netReais: (d['netReais'] as num?)?.toDouble(),
      status: (d['status'] as String?) ?? 'pending',
      pixKey: (d['pixKey'] as String?) ?? '',
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
      payoutStatus: d['payoutStatus'] as String?,
      asaasTransferId: d['asaasTransferId'] as String?,
    );
  }
}

class ArenaWithdrawalRequestResult {
  const ArenaWithdrawalRequestResult({
    required this.withdrawalId,
    required this.status,
    this.payoutStatus,
    this.autoProcessed = false,
    this.processingMode,
    this.message,
    this.asaasTransferId,
  });

  final String withdrawalId;
  final String status;
  final String? payoutStatus;
  final bool autoProcessed;
  final String? processingMode;
  final String? message;
  final String? asaasTransferId;
}

class ArenaWalletRepository {
  ArenaWalletRepository(this._firestore, {FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  Stream<ArenaWalletSummary> watchWallet(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) {
      return Stream.value(const ArenaWalletSummary(
        availableReais: 0,
        pendingReais: 0,
      ));
    }
    return _firestore.collection('arenaWallets').doc(id).snapshots().map((snap) {
      final d = snap.data();
      return ArenaWalletSummary(
        availableReais: (d?['availableReais'] as num?)?.toDouble() ?? 0,
        pendingReais: (d?['pendingReais'] as num?)?.toDouble() ?? 0,
      );
    });
  }

  Stream<List<ArenaLedgerEntry>> watchLedger(String arenaId, {int limit = 20}) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection('arenaWallets')
        .doc(id)
        .collection('ledger')
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaLedgerEntry.fromDoc).toList());
  }

  Stream<List<ArenaWithdrawalItem>> watchWithdrawals(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection('arenaWithdrawals')
        .where('arenaId', isEqualTo: id)
        .orderBy('createdAt', descending: true)
        .limit(20)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaWithdrawalItem.fromDoc).toList());
  }

  Future<ArenaWithdrawalRequestResult> requestWithdrawal({
    required String arenaId,
    required double amountReais,
    required String pixKey,
    required String pixKeyType,
  }) async {
    final result = await _functions.httpsCallable('requestArenaWithdrawal').call(
      <String, dynamic>{
        'arenaId': arenaId,
        'amountReais': amountReais,
        'pixKey': pixKey,
        'pixKeyType': pixKeyType,
      },
    );
    final data = result.data;
    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      return ArenaWithdrawalRequestResult(
        withdrawalId: (map['withdrawalId'] as String?) ?? '',
        status: (map['status'] as String?) ?? 'pending',
        payoutStatus: map['payoutStatus'] as String?,
        autoProcessed: map['autoProcessed'] == true,
        processingMode: map['processingMode'] as String?,
        message: map['message'] as String?,
        asaasTransferId: map['asaasTransferId'] as String?,
      );
    }
    return const ArenaWithdrawalRequestResult(
      withdrawalId: '',
      status: 'pending',
    );
  }
}
