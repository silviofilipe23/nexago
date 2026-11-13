import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';
import '../../schedule_plans/domain/schedule_plan_models.dart' show spMap;
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/class_agreements.dart';

/// Falha da callable com a frase do servidor (o `toString` é só a frase, para
/// o `friendlyErrorMessage` mostrar como veio). [code] permite à tela tratar
/// "o contrato mudou" (`failed-precondition`) relendo a prévia.
class ClassAgreementException implements Exception {
  ClassAgreementException(this.message, {this.code = ''});

  final String message;
  final String code;

  @override
  String toString() => message;
}

/// Contratos de aulas: tudo por callable (`arenaAgreements` e os planos são
/// fechados nas rules). Só o `classSignupOpen` do doc público da arena é lido
/// direto, para o perfil da arena decidir se mostra "Planos de aula".
class ClassAgreementsRepository {
  ClassAgreementsRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _db = firestore,
        _functionsOverride = functions;

  final FirebaseFirestore _db;
  final FirebaseFunctions? _functionsOverride;

  FirebaseFunctions get _functions => _functionsOverride ?? nexagoFunctions;

  Stream<bool> watchSignupOpen(String arenaId) => _db
      .collection('arenas')
      .doc(arenaId)
      .snapshots()
      .map((s) => s.data()?['classSignupOpen'] == true);

  Future<Map<String, dynamic>> _call(
    String name,
    Map<String, Object?> data,
    String fallback,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(data);
      return spMap(result.data);
    } on FirebaseFunctionsException catch (e) {
      throw ClassAgreementException(
        callableErrorMessage(e.code, e.message, fallback),
        code: e.code,
      );
    }
  }

  Future<ClassSignupOptions> signupOptions(String arenaId) async =>
      ClassSignupOptions.fromMap(await _call(
        'getArenaClassSignupOptions',
        {'arenaId': arenaId},
        'Não foi possível abrir os planos de aula.',
      ));

  Future<ClassEnrollmentPreview> preview({
    required String arenaId,
    required String planId,
    required List<ClassSlotChoice> slots,
    String cycle = 'monthly',
    int? dueDay,
    String? paymentForm,
    String? cpf,
  }) async =>
      ClassEnrollmentPreview.fromMap(await _call(
        'previewMyArenaClassEnrollment',
        {
          'arenaId': arenaId,
          'planId': planId,
          'slots': [for (final s in slots) s.toMap()],
          'cycle': cycle,
          if (dueDay != null) 'dueDay': dueDay,
          if (paymentForm != null) 'paymentForm': paymentForm,
          if (cpf != null && cpf.isNotEmpty) 'cpfCnpj': cpf,
        },
        'Não foi possível montar o contrato.',
      ));

  Future<ClassEnrollmentResult> enroll({
    required String arenaId,
    required String planId,
    required List<ClassSlotChoice> slots,
    required String sha256,
    required int readSeconds,
    required String platform,
    required String appVersion,
    String cycle = 'monthly',
    int? dueDay,
    String? paymentForm,
    String? cpf,
  }) async =>
      ClassEnrollmentResult.fromMap(await _call(
        'enrollMeInArenaClassPlan',
        {
          'arenaId': arenaId,
          'planId': planId,
          'slots': [for (final s in slots) s.toMap()],
          'cycle': cycle,
          if (dueDay != null) 'dueDay': dueDay,
          if (paymentForm != null) 'paymentForm': paymentForm,
          'agreed': true,
          'sha256': sha256,
          'readSeconds': readSeconds,
          'platform': platform,
          'appVersion': appVersion,
          if (cpf != null && cpf.isNotEmpty) 'cpfCnpj': cpf,
        },
        'Não foi possível assinar o contrato.',
      ));

  /// Pagamento da matrícula que espera o 1º pagamento (Pix com QR ou link do
  /// cartão). Chamado de novo enquanto a fatura é criada e até cair.
  Future<ClassEnrollmentPayment> enrollmentPayment({
    required String enrollmentId,
    required String method,
    String kind = 'signup',
  }) async =>
      ClassEnrollmentPayment.fromMap(await _call(
        'getMyClassEnrollmentPayment',
        {
          'enrollmentId': enrollmentId,
          'method': method,
          if (kind != 'signup') 'kind': kind,
        },
        'Não foi possível abrir o pagamento.',
      ));

  /// Como fica o cancelamento (sem mudar nada).
  Future<ClassCancellationQuote> previewCancellation(String enrollmentId) async =>
      ClassCancellationQuote.fromMap(await _call(
        'previewMyClassCancellation',
        {'enrollmentId': enrollmentId},
        'Não foi possível calcular o cancelamento.',
      ));

  /// Cancela: agenda a última aula e, com multa, cria a cobrança dela.
  Future<ClassCancellationQuote> cancel({
    required String enrollmentId,
    required String reason,
    String? note,
  }) async =>
      ClassCancellationQuote.fromMap(await _call(
        'cancelMyClassEnrollment',
        {
          'enrollmentId': enrollmentId,
          'reason': reason,
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        },
        'Não foi possível cancelar o plano.',
      ));

  Future<List<ClassAgreement>> myAgreements() async => parseAgreements(
        await _call('getMyArenaAgreements', const {},
            'Não foi possível abrir os seus contratos.'),
      );

  Future<ClassAgreement> agreement(String agreementId) async =>
      ClassAgreement.fromMap(await _call(
        'getMyArenaAgreement',
        {'agreementId': agreementId},
        'Não foi possível abrir o contrato.',
      ));

  Future<void> sign({
    required String agreementId,
    required String sha256,
    required int readSeconds,
    required String platform,
    required String appVersion,
  }) =>
      _call(
        'signMyArenaAgreement',
        {
          'agreementId': agreementId,
          'agreed': true,
          'sha256': sha256,
          'readSeconds': readSeconds,
          'platform': platform,
          'appVersion': appVersion,
        },
        'Não foi possível assinar o contrato.',
      );
}
