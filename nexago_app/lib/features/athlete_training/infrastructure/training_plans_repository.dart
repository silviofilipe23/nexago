import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/training_plans.dart';
import 'class_presence_repository.dart' show ClassPresenceException;

/// T14 · planos e pagamentos do aluno, pela callable `getMyTrainingPlans`
/// (matrícula e mensalidade da arena são só da equipe — o servidor monta a
/// visão do próprio aluno).
class TrainingPlansRepository {
  TrainingPlansRepository({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  Future<MyTrainingPlans> fetch() async {
    try {
      final result = await _functions
          .httpsCallable('getMyTrainingPlans')
          .call<Object?>(const <String, Object?>{});
      final raw = result.data;
      return raw is Map
          ? MyTrainingPlans.fromMap(raw.map((k, v) => MapEntry('$k', v)))
          : const MyTrainingPlans();
    } on FirebaseFunctionsException catch (e) {
      throw ClassPresenceException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível carregar seus planos. Tente novamente.',
        ),
        code: e.code,
      );
    }
  }
}

final trainingPlansRepositoryProvider = Provider<TrainingPlansRepository>(
  (ref) => TrainingPlansRepository(),
);
