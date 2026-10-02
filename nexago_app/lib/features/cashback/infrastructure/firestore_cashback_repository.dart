import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../domain/cashback_models.dart';
import '../domain/cashback_repository.dart';

/// Linhas do extrato na tela (as mais recentes).
const int cashbackLedgerLimit = 50;

/// Leitura da carteira no Firestore. As rules só deixam o DONO ler
/// `athleteWallets/{uid}` e as subcoleções; escrita é só do servidor.
class FirestoreCashbackRepository implements CashbackRepository {
  FirestoreCashbackRepository(this._db);

  final FirebaseFirestore _db;

  DocumentReference<Map<String, dynamic>> _wallet(String uid) =>
      _db.collection('athleteWallets').doc(uid);

  @override
  Stream<CashbackConfig> watchConfig() => _db
      .doc('appConfig/cashback')
      .snapshots()
      .map((snap) => CashbackConfig.fromMap(snap.data()));

  @override
  Stream<CashbackWallet> watchWallet(String uid) => _wallet(uid)
      .snapshots()
      .map((snap) => cashbackWalletFromMap(snap.data()));

  @override
  Stream<List<CashbackLedgerEntry>> watchLedger(String uid) => _wallet(uid)
      .collection('ledger')
      .orderBy('createdAt', descending: true)
      .limit(cashbackLedgerLimit)
      .snapshots()
      .map(
        (snap) => snap.docs
            .map((doc) => cashbackLedgerEntryFromMap(doc.id, doc.data()))
            .toList(),
      );

  @override
  Stream<CashbackLot?> watchLot(String uid, String lotId) => _wallet(uid)
      .collection('lots')
      .doc(lotId)
      .snapshots()
      .map((snap) => cashbackLotFromMap(snap.id, snap.data()));
}

final cashbackRepositoryProvider = Provider<CashbackRepository>((ref) {
  return FirestoreCashbackRepository(ref.watch(firestoreProvider));
});

CashbackWallet cashbackWalletFromMap(Map<String, dynamic>? data) {
  if (data == null) return CashbackWallet.empty;
  return CashbackWallet(
    availableCents: _cents(data['availableCents']),
    pendingCents: _cents(data['pendingCents']),
    heldCents: _cents(data['heldCents']),
    lifetimeEarnedCents: _cents(data['lifetimeEarnedCents']),
    lifetimeRedeemedCents: _cents(data['lifetimeRedeemedCents']),
    nextExpiryAt: _date(data['nextExpiryAt']),
    nextExpiryCents: _cents(data['nextExpiryCents']),
  );
}

CashbackLedgerEntry cashbackLedgerEntryFromMap(
  String id,
  Map<String, dynamic> data,
) {
  return CashbackLedgerEntry(
    id: id,
    type: CashbackLedgerType.from(data['type']),
    amountCents: _cents(data['amountCents']),
    label: _text(data['label']),
    createdAt: _date(data['createdAt']),
  );
}

CashbackLot? cashbackLotFromMap(String id, Map<String, dynamic>? data) {
  if (data == null) return null;
  return CashbackLot(
    id: id,
    status: CashbackLotStatus.from(data['status']),
    earnedCents: _cents(data['earnedCents']),
    remainingCents: _cents(data['remainingCents']),
    label: _text(data['label']),
    eventAt: _date(data['eventAt']),
    expiresAt: _date(data['expiresAt']),
  );
}

/// Centavos do servidor: inteiro não negativo; qualquer outra coisa vira 0.
int _cents(Object? raw) {
  if (raw is! num || !raw.isFinite) return 0;
  final cents = raw.round();
  return cents > 0 ? cents : 0;
}

DateTime? _date(Object? raw) {
  if (raw is Timestamp) return raw.toDate();
  if (raw is DateTime) return raw;
  return null;
}

String _text(Object? raw) => raw is String ? raw.trim() : '';
