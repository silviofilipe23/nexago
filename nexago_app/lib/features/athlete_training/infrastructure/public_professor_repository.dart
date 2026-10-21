import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/public_professor.dart';
import 'class_presence_repository.dart' show ClassPresenceException;

/// T11/T13 · vitrine de professores pelas callables de
/// `functions/src/professor-public-profile.ts`.
class PublicProfessorRepository {
  PublicProfessorRepository({FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFunctions _functions;

  Future<ProfessorSearchResult> search(ProfessorSearchQuery q) async {
    final raw = await _call(
      'searchProfessors',
      {
        if (q.sport.isNotEmpty) 'sport': q.sport,
        if (q.text.isNotEmpty) 'query': q.text,
        if (q.lat != null && q.lng != null) ...{'lat': q.lat, 'lng': q.lng},
      },
      'Não foi possível buscar professores. Tente novamente.',
    );
    return ProfessorSearchResult.fromMap(raw);
  }

  Future<PublicProfessor> profile(
    String professorUid, {
    double? lat,
    double? lng,
  }) async {
    final raw = await _call(
      'getProfessorPublicProfile',
      {
        'professorUid': professorUid,
        if (lat != null && lng != null) ...{'lat': lat, 'lng': lng},
      },
      'Não foi possível abrir o perfil. Tente novamente.',
    );
    return PublicProfessor.fromMap(raw);
  }

  Future<void> requestContact(String professorUid, {String? message}) => _call(
        'requestProfessorContact',
        {
          'professorUid': professorUid,
          if (message != null && message.trim().isNotEmpty)
            'message': message.trim(),
        },
        'Não foi possível avisar o professor. Tente novamente.',
      );

  Future<Map<String, Object?>> _call(
    String name,
    Map<String, Object?> data,
    String fallback,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(data);
      final raw = result.data;
      return raw is Map ? raw.map((k, v) => MapEntry('$k', v)) : const {};
    } on FirebaseFunctionsException catch (e) {
      throw ClassPresenceException(
        callableErrorMessage(e.code, e.message, fallback),
        code: e.code,
      );
    }
  }
}

final publicProfessorRepositoryProvider = Provider<PublicProfessorRepository>(
  (ref) => PublicProfessorRepository(),
);
