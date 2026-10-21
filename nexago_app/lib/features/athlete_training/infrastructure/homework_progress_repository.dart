import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/homework_progress.dart';
import 'class_presence_repository.dart' show ClassPresenceException;

/// T9 · progresso do treino em casa: lê `homeworkProgress/{viewId}` (rules:
/// o aluno e o professor da visão) e grava pela callable
/// `saveHomeworkProgress` (confere dono, tarefa e prazo).
class HomeworkProgressRepository {
  HomeworkProgressRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  Stream<HomeworkProgress> watch(String viewId) => _firestore
          .collection('homeworkProgress')
          .doc(viewId)
          .snapshots()
          .map((d) {
        final data = d.data();
        return data == null
            ? const HomeworkProgress()
            : HomeworkProgress.fromMap(data);
      });

  /// Séries feitas hoje (0 apaga o dia).
  Future<void> save({required String viewId, required int setsDone}) async {
    try {
      await _functions
          .httpsCallable('saveHomeworkProgress')
          .call<Object?>({'viewId': viewId, 'setsDone': setsDone});
    } on FirebaseFunctionsException catch (e) {
      throw ClassPresenceException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível salvar seu treino. Tente novamente.',
        ),
        code: e.code,
      );
    }
  }
}

final homeworkProgressRepositoryProvider = Provider<HomeworkProgressRepository>(
  (ref) => HomeworkProgressRepository(firestore: ref.watch(firestoreProvider)),
);
