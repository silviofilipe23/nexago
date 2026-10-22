import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/training_center.dart';
import 'class_presence_repository.dart' show ClassPresenceException;

/// Centros de treinamento do aluno, pela callable `getMyTrainingCenters`
/// (as coleções do centro são só da equipe — o servidor monta a visão do
/// próprio aluno).
class TrainingCentersRepository {
  TrainingCentersRepository({FirebaseFunctions? functions})
    : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  Future<List<TrainingCenterLink>> fetch() async {
    try {
      final result = await _functions
          .httpsCallable('getMyTrainingCenters')
          .call<Object?>(const <String, Object?>{});
      return trainingCentersFromResponse(result.data);
    } on FirebaseFunctionsException catch (e) {
      throw ClassPresenceException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível carregar seus centros de treinamento.',
        ),
        code: e.code,
      );
    }
  }
}

final trainingCentersRepositoryProvider = Provider<TrainingCentersRepository>(
  (ref) => TrainingCentersRepository(),
);
