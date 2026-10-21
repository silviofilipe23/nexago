import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../athlete/domain/agenda/class_story.dart';
import '../../athlete/domain/agenda/class_story_tag.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import 'professor_students_repository.dart' show ProfessorStudentsException;

/// Story do treino pelo professor (G2): marca os alunos e manda o aviso de
/// repostar (`shareClassStory`). O servidor só marca quem estava presente e
/// liberou a marcação — o resto ele ignora.
abstract class ProfessorClassStoryRepository {
  Future<({int tagged, int notified})> shareClassStory({
    required String sessionId,
    required List<String> studentIds,
    required List<ClassStoryPlanBlock> plan,
    required Set<ClassStoryInfo> infos,
  });
}

class FirebaseProfessorClassStoryRepository
    implements ProfessorClassStoryRepository {
  FirebaseProfessorClassStoryRepository({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  @override
  Future<({int tagged, int notified})> shareClassStory({
    required String sessionId,
    required List<String> studentIds,
    required List<ClassStoryPlanBlock> plan,
    required Set<ClassStoryInfo> infos,
  }) async {
    try {
      final result =
          await _functions.httpsCallable('shareClassStory').call<Object?>({
        'sessionId': sessionId,
        'studentIds': studentIds,
        'plan': [for (final b in plan) b.toMap()],
        'show': {
          'plan': infos.contains(ClassStoryInfo.plan),
          'numbers': infos.contains(ClassStoryInfo.numbers),
          'place': infos.contains(ClassStoryInfo.place),
        },
      });
      final raw = result.data;
      int count(String key) =>
          raw is Map && raw[key] is num ? (raw[key] as num).toInt() : 0;
      return (tagged: count('tagged'), notified: count('notified'));
    } on FirebaseFunctionsException catch (e) {
      throw ProfessorStudentsException(
        callableErrorMessage(
            e.code, e.message, 'Não foi possível avisar os alunos.'),
      );
    }
  }
}

final professorClassStoryRepositoryProvider =
    Provider<ProfessorClassStoryRepository>(
  (ref) => FirebaseProfessorClassStoryRepository(),
);
