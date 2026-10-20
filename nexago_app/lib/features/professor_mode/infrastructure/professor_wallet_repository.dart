import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/professor_wallet.dart';
import 'professor_students_repository.dart' show ProfessorStudentsException;

/// Resultado de `createProfessorCharge`.
typedef ProfessorChargeCreated = ({String chargeId, String? invoiceUrl});

/// Carteira do professor independente: leitura em tempo real das coleções
/// que as rules liberam ao dono e escrita só por callable
/// (`functions/src/professor-wallet.ts`). Falhas chegam como
/// [ProfessorStudentsException], com a mensagem pronta para a tela.
abstract class ProfessorWalletRepository {
  /// `null` = ainda sem conta de recebimento.
  Stream<ProfessorPayoutAccount?> watchAccount(String uid);

  Stream<List<ProfessorWalletPlan>> watchPlans(String uid);

  /// Todos (ativos e arquivados).
  Stream<List<ProfessorWalletStudent>> watchStudents(String uid);

  /// Cobranças do professor (sem ordem — a tela ordena).
  Stream<List<ProfessorCharge>> watchCharges(String uid);

  Future<void> createAccount(Map<String, Object?> payload);

  /// Relê a situação no Asaas (`null` = sem conta).
  Future<ProfessorAccountStatus?> refreshAccountStatus();

  /// Devolve o id do plano (novo ou o mesmo).
  Future<String> upsertPlan(ProfessorPlanInput input);

  Future<void> upsertStudent({required String athleteId, String? planId});

  Future<void> archiveStudent(String athleteId);

  Future<ProfessorChargeCreated> createCharge(ProfessorChargeInput input);

  Future<void> cancelCharge(String chargeId);

  Future<void> stopRecurring(String athleteId);

  // ── lado do atleta ──

  /// Convite do professor para o atleta (`null` = não existe).
  Stream<ProfessorWalletStudent?> watchInvite({
    required String professorUid,
    required String athleteUid,
  });

  Future<void> respondInvite({
    required String professorUid,
    required bool accept,
  });
}

class FirebaseProfessorWalletRepository implements ProfessorWalletRepository {
  FirebaseProfessorWalletRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  CollectionReference<Map<String, dynamic>> _sub(String uid, String name) =>
      _firestore.collection('professors').doc(uid).collection(name);

  @override
  Stream<ProfessorPayoutAccount?> watchAccount(String uid) => _firestore
          .collection('professorPayoutAccounts')
          .doc(uid)
          .snapshots()
          .map((s) {
        final data = s.data();
        return data == null ? null : ProfessorPayoutAccount.fromMap(data);
      });

  @override
  Stream<List<ProfessorWalletPlan>> watchPlans(String uid) =>
      _sub(uid, 'plans').snapshots().map((q) => [
            for (final d in q.docs) ProfessorWalletPlan.fromMap(d.id, d.data()),
          ]);

  @override
  Stream<List<ProfessorWalletStudent>> watchStudents(String uid) =>
      _sub(uid, 'students').snapshots().map((q) => [
            for (final d in q.docs)
              ProfessorWalletStudent.fromMap(d.id, d.data()),
          ]);

  // A rule só deixa ler filtrando pelo dono; sem orderBy (sem índice).
  @override
  Stream<List<ProfessorCharge>> watchCharges(String uid) => _firestore
      .collection('professorCharges')
      .where('professorUid', isEqualTo: uid)
      .snapshots()
      .map((q) => [
            for (final d in q.docs) ProfessorCharge.fromMap(d.id, d.data()),
          ]);

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
  Future<void> createAccount(Map<String, Object?> payload) => _call(
        'createProfessorPayoutAccount',
        payload,
        'Não foi possível criar a conta de recebimento. Tente de novo.',
      );

  @override
  Future<ProfessorAccountStatus?> refreshAccountStatus() async {
    final r = await _call(
      'refreshProfessorPayoutAccountStatus',
      const {},
      'Não foi possível consultar a situação da conta.',
    );
    final status = r['status'];
    return status == null ? null : ProfessorAccountStatus.parse(status);
  }

  @override
  Future<String> upsertPlan(ProfessorPlanInput input) async {
    final r = await _call(
      'upsertProfessorPlan',
      input.toPayload(),
      'Não foi possível salvar o plano.',
    );
    final id = r['planId'];
    return id is String ? id : input.planId ?? '';
  }

  @override
  Future<void> upsertStudent({required String athleteId, String? planId}) =>
      _call(
        'upsertProfessorStudent',
        {'athleteId': athleteId, if (planId != null) 'planId': planId},
        'Não foi possível adicionar o aluno.',
      );

  @override
  Future<void> archiveStudent(String athleteId) => _call(
        'archiveProfessorStudent',
        {'athleteId': athleteId},
        'Não foi possível arquivar o aluno.',
      );

  @override
  Future<ProfessorChargeCreated> createCharge(
    ProfessorChargeInput input,
  ) async {
    final r = await _call(
      'createProfessorCharge',
      input.toPayload(),
      'Não foi possível gerar a cobrança. Tente de novo.',
    );
    final id = r['chargeId'];
    final url = r['invoiceUrl'];
    return (
      chargeId: id is String ? id : '',
      invoiceUrl: url is String && url.isNotEmpty ? url : null,
    );
  }

  @override
  Future<void> cancelCharge(String chargeId) => _call(
        'cancelProfessorCharge',
        {'chargeId': chargeId},
        'Não foi possível cancelar a cobrança.',
      );

  @override
  Future<void> stopRecurring(String athleteId) => _call(
        'stopProfessorRecurring',
        {'athleteId': athleteId},
        'Não foi possível parar a recorrência.',
      );

  @override
  Stream<ProfessorWalletStudent?> watchInvite({
    required String professorUid,
    required String athleteUid,
  }) =>
      _sub(professorUid, 'students').doc(athleteUid).snapshots().map((s) {
        final data = s.data();
        return data == null ? null : ProfessorWalletStudent.fromMap(s.id, data);
      });

  @override
  Future<void> respondInvite({
    required String professorUid,
    required bool accept,
  }) =>
      _call(
        'respondProfessorStudentInvite',
        {'professorUid': professorUid, 'accept': accept},
        'Não foi possível responder o convite. Tente de novo.',
      );
}

final professorWalletRepositoryProvider =
    Provider<ProfessorWalletRepository>((ref) {
  return FirebaseProfessorWalletRepository(
    firestore: ref.watch(firestoreProvider),
  );
});
