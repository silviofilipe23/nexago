import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../../core/firebase/functions_region.dart';

class ArenaWalletSummary {
  const ArenaWalletSummary({
    required this.availableReais,
    required this.pendingReais,
    this.awaitingSettlementReais = 0,
  });

  final double availableReais;
  final double pendingReais;

  /// Cartão aprovado que o Asaas ainda não liquidou (reserva ou mensalidade de
  /// aula): já vem sem as taxas e entra em [availableReais] no RECEIVED, cerca
  /// de 32 dias depois. Não é sacável.
  final double awaitingSettlementReais;

  factory ArenaWalletSummary.fromMap(Map<String, dynamic>? d) {
    final awaiting = (d?['awaitingSettlementReais'] as num?)?.toDouble() ?? 0;
    return ArenaWalletSummary(
      availableReais: (d?['availableReais'] as num?)?.toDouble() ?? 0,
      pendingReais: (d?['pendingReais'] as num?)?.toDouble() ?? 0,
      awaitingSettlementReais: awaiting > 0 ? awaiting : 0,
    );
  }
}

/// De onde veio a linha do extrato (`ledger.source`; reserva não grava o campo).
enum ArenaLedgerSource {
  booking,
  classFee,
  club;

  static ArenaLedgerSource fromRaw(Object? raw) => switch (raw) {
        'class' => ArenaLedgerSource.classFee,
        'club' => ArenaLedgerSource.club,
        _ => ArenaLedgerSource.booking,
      };
}

class ArenaLedgerEntry {
  const ArenaLedgerEntry({
    required this.id,
    required this.netReais,
    required this.grossReais,
    required this.bookingId,
    required this.createdAt,
    this.type = 'credit',
    this.source = ArenaLedgerSource.booking,
    this.teacherName,
    this.month,
  });

  final String id;
  final double netReais;
  final double grossReais;
  final String? bookingId;
  final DateTime? createdAt;

  /// `credit`, `refund` (estorno debita o líquido: valores negativos) ou
  /// `class_payout` (repasse pago pelo nexaGO — saída, não estorno).
  final String type;
  final ArenaLedgerSource source;

  /// Repasse: professor e mês (`YYYY-MM`).
  final String? teacherName;
  final String? month;

  bool get isClassPayout => type == 'class_payout';

  bool get isRefund => !isClassPayout && (type == 'refund' || netReais < 0);

  factory ArenaLedgerEntry.fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    return ArenaLedgerEntry.fromMap(doc.id, doc.data());
  }

  factory ArenaLedgerEntry.fromMap(String id, Map<String, dynamic> d) {
    return ArenaLedgerEntry(
      id: id,
      type: (d['type'] as String?) ?? 'credit',
      source: ArenaLedgerSource.fromRaw(d['source']),
      netReais: (d['netReais'] as num?)?.toDouble() ?? 0,
      grossReais: (d['grossReais'] as num?)?.toDouble() ?? 0,
      bookingId: d['bookingId'] as String?,
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
      teacherName: d['teacherName'] as String?,
      month: d['month'] as String?,
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
      : _functions = functions ?? nexagoFunctions;

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
    return _firestore
        .collection('arenaWallets')
        .doc(id)
        .snapshots()
        .map((snap) => ArenaWalletSummary.fromMap(snap.data()));
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
