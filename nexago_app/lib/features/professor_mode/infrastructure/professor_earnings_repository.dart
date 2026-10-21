import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/professor_earnings.dart';
import 'professor_students_repository.dart' show ProfessorStudentsException;

/// Ganhos do repasse (fase 6): leitura direta do que as rules liberam ao
/// dono e as callables de `functions/src/professor-earnings.ts`. Falhas como
/// [ProfessorStudentsException], com a mensagem pronta.
abstract class ProfessorEarningsRepository {
  Stream<ProfessorEarningsWallet> watchWallet(String uid);

  /// De onde veio o saldo (sem ordem).
  Stream<List<ProfessorEarningsEntry>> watchLedger(String uid);

  /// Saques (sem ordem).
  Stream<List<ProfessorWithdrawal>> watchWithdrawals(String uid);

  /// `null` = sem chave cadastrada.
  Stream<ProfessorPayoutPixKey?> watchPixKey(String uid);

  /// Repasses fechados ainda não pagos ("em liberação").
  Future<List<ProfessorPendingPayout>> fetchPendingPayouts();

  Future<void> setPixKey({required String pixKey, required String pixKeyType});

  Future<ProfessorWithdrawalResult> requestWithdrawal(double amountReais);
}

class FirebaseProfessorEarningsRepository
    implements ProfessorEarningsRepository {
  FirebaseProfessorEarningsRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  DocumentReference<Map<String, dynamic>> _wallet(String uid) =>
      _firestore.collection('professorEarningsWallets').doc(uid);

  Future<Map<String, Object?>> _call(
    String name,
    Map<String, Object?> data,
    String fallback,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(data);
      final raw = result.data;
      return raw is Map
          ? raw.map((k, v) => MapEntry(k.toString(), v))
          : const <String, Object?>{};
    } on FirebaseFunctionsException catch (e) {
      throw ProfessorStudentsException(
        callableErrorMessage(e.code, e.message, fallback),
      );
    }
  }

  @override
  Stream<ProfessorEarningsWallet> watchWallet(String uid) => _wallet(uid)
      .snapshots()
      .map((s) => ProfessorEarningsWallet.fromMap(s.data()));

  @override
  Stream<List<ProfessorEarningsEntry>> watchLedger(String uid) =>
      _wallet(uid).collection('ledger').snapshots().map((q) => [
            for (final d in q.docs)
              ProfessorEarningsEntry.fromMap(d.id, d.data()),
          ]);

  // A rule só deixa ler filtrando pelo dono; sem orderBy (sem índice).
  @override
  Stream<List<ProfessorWithdrawal>> watchWithdrawals(String uid) => _firestore
      .collection('professorWithdrawals')
      .where('professorUid', isEqualTo: uid)
      .snapshots()
      .map((q) => [
            for (final d in q.docs) ProfessorWithdrawal.fromMap(d.id, d.data()),
          ]);

  @override
  Stream<ProfessorPayoutPixKey?> watchPixKey(String uid) => _firestore
      .collection('organizerPayoutProfiles')
      .doc(uid)
      .snapshots()
      .map((s) => ProfessorPayoutPixKey.fromMap(s.data()));

  @override
  Future<List<ProfessorPendingPayout>> fetchPendingPayouts() async {
    final r = await _call(
      'getMyPendingClassPayouts',
      const {},
      'Não foi possível carregar os repasses.',
    );
    final items = r['items'];
    return [
      if (items is List)
        for (final m in items.whereType<Map>())
          ProfessorPendingPayout.fromMap(
            m.map((k, v) => MapEntry(k.toString(), v)),
          ),
    ];
  }

  @override
  Future<void> setPixKey({
    required String pixKey,
    required String pixKeyType,
  }) =>
      _call(
        'setProfessorPayoutPixKey',
        {'pixKey': pixKey, 'pixKeyType': pixKeyType},
        'Não foi possível salvar a chave PIX.',
      );

  @override
  Future<ProfessorWithdrawalResult> requestWithdrawal(
      double amountReais) async {
    final r = await _call(
      'requestProfessorWithdrawal',
      {'amountReais': amountReais},
      'Não foi possível pedir o saque.',
    );
    return ProfessorWithdrawalResult.fromMap(r);
  }
}

final professorEarningsRepositoryProvider =
    Provider<ProfessorEarningsRepository>((ref) {
  return FirebaseProfessorEarningsRepository(
    firestore: ref.watch(firestoreProvider),
  );
});
