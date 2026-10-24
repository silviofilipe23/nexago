import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/training_center.dart';
import 'class_presence_repository.dart' show ClassPresenceException;

/// Centros de treinamento do aluno, pelas callables do aluno (as coleções do
/// centro são só da equipe — o servidor monta a visão e age em nome do
/// próprio aluno): `getMyTrainingCenters`, `respondTrainingCenterSession`,
/// `answerTrainingCenterInvite`, `getMyTrainingCenterInvoicePix`,
/// `checkMyTrainingCenterInvoice` e os contratos
/// (`openMyTrainingCenterContract`, `signMyTrainingCenterContract`).
class TrainingCentersRepository {
  TrainingCentersRepository({FirebaseFunctions? functions})
    : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  Future<Object?> _call(
    String name,
    Map<String, Object?> data,
    String fallback,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(data);
      return result.data;
    } on FirebaseFunctionsException catch (e) {
      throw ClassPresenceException(
        callableErrorMessage(e.code, e.message, fallback),
        code: e.code,
      );
    }
  }

  Future<MyTrainingCentersData> fetch() async =>
      MyTrainingCentersData.fromResponse(
        await _call(
          'getMyTrainingCenters',
          const {},
          'Não foi possível carregar seus centros de treinamento.',
        ),
      );

  /// "Vou" / "Não vou". Devolve se o aviso virou falta justificada (dentro
  /// do prazo do centro).
  Future<bool> respond({
    required String centerId,
    required String sessionId,
    required bool going,
  }) async {
    final raw = await _call('respondTrainingCenterSession', {
      'centerId': centerId,
      'sessionId': sessionId,
      'response': going ? 'going' : 'not_going',
    }, 'Não foi possível enviar sua resposta. Tente de novo.');
    return raw is Map && raw['excused'] == true;
  }

  Future<void> answerInvite({
    required String centerId,
    required String studentId,
    required bool accept,
  }) => _call('answerTrainingCenterInvite', {
    'centerId': centerId,
    'studentId': studentId,
    'accept': accept,
  }, 'Não foi possível responder ao convite. Tente de novo.');

  Future<CenterInvoicePix> invoicePix({
    required String centerId,
    required String invoiceId,
  }) async {
    final raw = await _call('getMyTrainingCenterInvoicePix', {
      'centerId': centerId,
      'invoiceId': invoiceId,
    }, 'Não foi possível gerar o Pix agora. Tente de novo.');
    return raw is Map
        ? CenterInvoicePix.fromMap(raw.map((k, v) => MapEntry('$k', v)))
        : const CenterInvoicePix(status: 'pending');
  }

  /// "Tenho um código": entra no centro pelo código de entrada. Devolve o
  /// centro e se já era aluno.
  Future<({String centerId, String centerName, bool already})> joinByCode(
    String code,
  ) async {
    final raw = await _call('joinTrainingCenterByCode', {
      'code': code,
    }, 'Não foi possível entrar com este código. Tente de novo.');
    final m = raw is Map ? raw : const {};
    return (
      centerId: '${m['centerId'] ?? ''}',
      centerName: '${m['centerName'] ?? 'Centro de treinamento'}',
      already: m['already'] == true,
    );
  }

  /// Marca o contrato como aberto (K7). Devolve o status atual.
  Future<String> openContract({
    required String centerId,
    required String contractId,
  }) async {
    final raw = await _call('openMyTrainingCenterContract', {
      'centerId': centerId,
      'contractId': contractId,
    }, 'Não foi possível abrir o contrato agora.');
    return raw is Map && raw['status'] is String
        ? raw['status'] as String
        : 'viewed';
  }

  /// Assina (ou recusa, só no termo opcional) o contrato com o [sha256] do
  /// texto lido (K8). O servidor grava IP e user-agent.
  Future<CenterContractSignResult> signContract({
    required String centerId,
    required String contractId,
    required bool accept,
    required String sha256,
    required int readSeconds,
    required String platform,
    required String appVersion,
  }) async {
    final raw = await _call('signMyTrainingCenterContract', {
      'centerId': centerId,
      'contractId': contractId,
      'decision': accept ? 'accept' : 'decline',
      'agreed': true,
      'sha256': sha256,
      'readSeconds': readSeconds,
      'platform': platform,
      'appVersion': appVersion,
    }, 'Não foi possível assinar agora. Tente de novo.');
    final m = raw is Map ? raw : const {};
    return (
      status: m['status'] is String
          ? m['status'] as String
          : (accept ? 'signed' : 'declined'),
      number: '${m['number'] ?? ''}',
      signedAt: DateTime.tryParse('${m['signedAt'] ?? ''}'),
    );
  }

  /// "Já paguei · verificar": consulta o provedor; devolve o status da fatura.
  Future<String> checkInvoice({
    required String centerId,
    required String invoiceId,
  }) async {
    final raw = await _call('checkMyTrainingCenterInvoice', {
      'centerId': centerId,
      'invoiceId': invoiceId,
    }, 'Não foi possível verificar agora. Tente de novo.');
    return raw is Map && raw['status'] is String
        ? raw['status'] as String
        : 'pending';
  }
}

/// Resposta de `signMyTrainingCenterContract`.
typedef CenterContractSignResult = ({
  String status,
  String number,
  DateTime? signedAt,
});

final trainingCentersRepositoryProvider = Provider<TrainingCentersRepository>(
  (ref) => TrainingCentersRepository(),
);
