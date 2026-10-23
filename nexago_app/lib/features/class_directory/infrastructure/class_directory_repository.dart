import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/class_directory.dart';
import '../domain/class_trial.dart';

class ClassDirectoryException implements Exception {
  const ClassDirectoryException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Hub › Aulas e treinos pelas callables de `functions/src/class-directory.ts`.
class ClassDirectoryRepository {
  ClassDirectoryRepository({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  /// Arenas com turma e CTs ativos. [level] = nível de turma do atleta (só
  /// escolhe a turma de destaque do card).
  Future<List<ClassProvider>> search({
    double? lat,
    double? lng,
    String? level,
  }) async {
    final raw = await _call('searchClassDirectory', {
      if (lat != null && lng != null) ...{'lat': lat, 'lng': lng},
      if (level != null && level.isNotEmpty) 'level': level,
    });
    final items = raw['items'];
    return items is List
        ? [
            for (final e in items)
              if (e is Map)
                ClassProvider.fromMap(e.map((k, v) => MapEntry('$k', v))),
          ]
        : const [];
  }

  Future<ClassProviderDetail> detail(
    ClassProviderKind kind,
    String id, {
    double? lat,
    double? lng,
  }) async {
    final raw = await _call('getClassDirectoryDetail', {
      'kind': kind.wireId,
      'id': id,
      if (lat != null && lng != null) ...{'lat': lat, 'lng': lng},
    });
    return ClassProviderDetail.fromMap(raw);
  }

  /// Calendário da experimental (`functions/src/class-trial-booking.ts`).
  Future<ClassTrialOptions> trialOptions(
      ClassProviderKind kind, String id) async {
    final raw = await _call(
      'getClassTrialOptions',
      {'kind': kind.wireId, 'id': id},
      'Não foi possível carregar os horários da experimental.',
    );
    return ClassTrialOptions.fromMap(raw);
  }

  /// Arena: o atleta se encaixa como experimental na aula.
  Future<void> bookArenaTrial(String sessionId) => _call(
        'bookArenaClassTrial',
        {'sessionId': sessionId},
        'Não foi possível agendar a experimental. Tente novamente.',
      );

  Future<Map<String, Object?>> _call(
    String name,
    Map<String, Object?> data, [
    String fallback = 'Não foi possível carregar as aulas. Tente novamente.',
  ]) async {
    try {
      final res = await _functions.httpsCallable(name).call<Object?>(data);
      final body = res.data;
      return body is Map
          ? body.map((k, v) => MapEntry('$k', v))
          : const <String, Object?>{};
    } on FirebaseFunctionsException catch (e) {
      throw ClassDirectoryException(
        callableErrorMessage(
          e.code,
          e.message,
          fallback,
        ),
      );
    }
  }
}

final classDirectoryRepositoryProvider = Provider<ClassDirectoryRepository>(
  (ref) => ClassDirectoryRepository(),
);
