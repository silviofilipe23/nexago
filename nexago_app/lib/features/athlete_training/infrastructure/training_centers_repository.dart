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
/// `answerTrainingCenterInvite`, `getMyTrainingCenterInvoicePix` e
/// `checkMyTrainingCenterInvoice`.
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

final trainingCentersRepositoryProvider = Provider<TrainingCentersRepository>(
  (ref) => TrainingCentersRepository(),
);
