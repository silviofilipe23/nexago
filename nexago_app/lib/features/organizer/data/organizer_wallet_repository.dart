import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

class OrganizerWalletSummary {
  const OrganizerWalletSummary({
    required this.availableReais,
    required this.pendingReais,
    this.payoutPixKey = '',
    this.payoutPixKeyType = '',
  });

  final double availableReais;
  final double pendingReais;
  final String payoutPixKey;
  final String payoutPixKeyType;

  static const empty = OrganizerWalletSummary(availableReais: 0, pendingReais: 0);
}

class OrganizerLedgerEntry {
  const OrganizerLedgerEntry({
    required this.id,
    required this.netReais,
    required this.grossReais,
    required this.platformFeeReais,
    required this.createdAt,
  });

  final String id;
  final double netReais;
  final double grossReais;
  final double platformFeeReais;
  final DateTime? createdAt;

  factory OrganizerLedgerEntry.fromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final d = doc.data();
    return OrganizerLedgerEntry(
      id: doc.id,
      netReais: (d['netReais'] as num?)?.toDouble() ?? 0,
      grossReais: (d['grossReais'] as num?)?.toDouble() ?? 0,
      platformFeeReais: (d['platformFeeReais'] as num?)?.toDouble() ?? 0,
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
    );
  }
}

class OrganizerWithdrawalItem {
  const OrganizerWithdrawalItem({
    required this.id,
    required this.amountReais,
    required this.status,
    required this.pixKey,
    required this.createdAt,
    this.payoutStatus,
  });

  final String id;
  final double amountReais;
  final String status;
  final String pixKey;
  final DateTime? createdAt;
  final String? payoutStatus;

  factory OrganizerWithdrawalItem.fromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final d = doc.data();
    return OrganizerWithdrawalItem(
      id: doc.id,
      amountReais: (d['amountReais'] as num?)?.toDouble() ?? 0,
      status: (d['status'] as String?) ?? 'pending',
      pixKey: (d['pixKey'] as String?) ?? '',
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
      payoutStatus: d['payoutStatus'] as String?,
    );
  }
}

class OrganizerWithdrawalRequestResult {
  const OrganizerWithdrawalRequestResult({
    required this.withdrawalId,
    required this.status,
    this.payoutStatus,
    this.autoProcessed = false,
    this.processingMode,
    this.message,
  });

  final String withdrawalId;
  final String status;
  final String? payoutStatus;
  final bool autoProcessed;
  final String? processingMode;
  final String? message;
}

class OrganizerWalletRepository {
  OrganizerWalletRepository(this._firestore, {FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  Stream<OrganizerWalletSummary> watchWallet(String organizerId) {
    final id = organizerId.trim();
    if (id.isEmpty) return Stream.value(OrganizerWalletSummary.empty);
    return _firestore
        .collection('organizerWallets')
        .doc(id)
        .snapshots()
        .map((snap) {
      final d = snap.data();
      return OrganizerWalletSummary(
        availableReais: (d?['availableReais'] as num?)?.toDouble() ?? 0,
        pendingReais: (d?['pendingReais'] as num?)?.toDouble() ?? 0,
        payoutPixKey: (d?['payoutPixKey'] as String?) ?? '',
        payoutPixKeyType: (d?['payoutPixKeyType'] as String?) ?? '',
      );
    });
  }

  Stream<List<OrganizerLedgerEntry>> watchLedger(
    String organizerId, {
    int limit = 30,
  }) {
    final id = organizerId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection('organizerWallets')
        .doc(id)
        .collection('ledger')
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .snapshots()
        .map((snap) => snap.docs.map(OrganizerLedgerEntry.fromDoc).toList());
  }

  Stream<List<OrganizerWithdrawalItem>> watchWithdrawals(String organizerId) {
    final id = organizerId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection('organizerWithdrawals')
        .where('organizerId', isEqualTo: id)
        .orderBy('createdAt', descending: true)
        .limit(20)
        .snapshots()
        .map((snap) => snap.docs.map(OrganizerWithdrawalItem.fromDoc).toList());
  }

  Future<void> setPayoutPixKey({
    required String pixKey,
    required String pixKeyType,
  }) async {
    await _functions.httpsCallable('setOrganizerPayoutPixKey').call(
      <String, dynamic>{'pixKey': pixKey, 'pixKeyType': pixKeyType},
    );
  }

  Future<OrganizerWithdrawalRequestResult> requestWithdrawal({
    required double amountReais,
    required String pixKey,
    required String pixKeyType,
  }) async {
    final result =
        await _functions.httpsCallable('requestOrganizerWithdrawal').call(
      <String, dynamic>{
        'amountReais': amountReais,
        'pixKey': pixKey,
        'pixKeyType': pixKeyType,
      },
    );
    final data = result.data;
    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      return OrganizerWithdrawalRequestResult(
        withdrawalId: (map['withdrawalId'] as String?) ?? '',
        status: (map['status'] as String?) ?? 'pending',
        payoutStatus: map['payoutStatus'] as String?,
        autoProcessed: map['autoProcessed'] == true,
        processingMode: map['processingMode'] as String?,
        message: map['message'] as String?,
      );
    }
    return const OrganizerWithdrawalRequestResult(
      withdrawalId: '',
      status: 'pending',
    );
  }
}
