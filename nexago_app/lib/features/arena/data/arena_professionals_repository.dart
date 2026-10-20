import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../../core/profiles/users_repository.dart';
import '../../professor_links/domain/arena_professor_link.dart';
import '../../professor_links/domain/professor_link_rules.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/professionals/arena_professionals_logic.dart';
import '../domain/professionals/arena_professionals_repository.dart';

/// Vínculos professor ↔ arena do lado da arena, no Firebase: leituras em
/// `arenaProfessors`, busca de conta em `public_profiles` (via
/// [UsersRepository], a mesma das Aulas) e ações pelas callables da região do
/// cliente (`nexagoFunctions`).
class FirebaseArenaProfessionalsRepository
    implements ArenaProfessionalsRepository {
  FirebaseArenaProfessionalsRepository(
    this._db,
    this._users, {
    FirebaseFunctions? functions,
  }) : _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _db;
  final UsersRepository _users;
  final FirebaseFunctions _functions;

  static const String _fallback =
      'Não foi possível concluir agora. Tente de novo em instantes.';

  CollectionReference<Map<String, dynamic>> get _links =>
      _db.collection('arenaProfessors');

  @override
  Stream<List<ArenaProfessorLink>> watchArenaLinks(String arenaId) =>
      _links.where('arenaId', isEqualTo: arenaId).snapshots().map(
            (snap) => [
              for (final doc in snap.docs)
                ArenaProfessorLink.fromMap(doc.id, doc.data()),
            ],
          );

  @override
  Stream<ArenaProfessorLink?> watchLink(String linkId) =>
      _links.doc(linkId).snapshots().map((snap) {
        final data = snap.data();
        return data == null ? null : ArenaProfessorLink.fromMap(snap.id, data);
      });

  @override
  Stream<List<ArenaProfessorLinkEvent>> watchEvents(String linkId) =>
      _links.doc(linkId).collection('events').snapshots().map(
            (snap) => [
              for (final doc in snap.docs)
                ArenaProfessorLinkEvent.fromMap(doc.id, doc.data()),
            ],
          );

  @override
  Future<List<ArenaProfessorCandidate>> searchAccounts(String term) async {
    final users = await _users.searchAthletesByKeywords(term, max: 15);
    return [for (final user in users) arenaProfessorCandidateFrom(user)];
  }

  Future<ProfessorLinkResult> _call(
    String name,
    Map<String, Object?> data,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(data);
      final raw = result.data;
      final map = raw is Map ? raw : const {};
      final linkId = map['linkId'];
      return ProfessorLinkResult(
        linkId: linkId is String ? linkId : '',
        status: ArenaProfessorLinkStatus.tryParse(map['status']),
      );
    } on FirebaseFunctionsException catch (e) {
      final details = e.details;
      throw ProfessorLinkException(
        callableErrorMessage(e.code, e.message, _fallback),
        code: e.code,
        status: details is Map
            ? ArenaProfessorLinkStatus.tryParse(details['status'])
            : null,
        duplicate: professorLinkDuplicateFrom(code: e.code, details: details),
      );
    }
  }

  static String? _text(String? raw) {
    final text = raw?.trim() ?? '';
    return text.isEmpty ? null : text;
  }

  @override
  Future<ProfessorLinkResult> invite({
    required String arenaId,
    required String professorUserId,
    required ArenaProfessorLinkType type,
    required ArenaProfessorPermissions permissions,
    String? message,
  }) =>
      _call('createArenaProfessorInvite', {
        'arenaId': arenaId,
        'professorUserId': professorUserId,
        'relationshipType': type.wire,
        'permissions': arenaProfessorPermissionsToMap(permissions),
        if (_text(message) case final text?) 'message': text,
      });

  @override
  Future<ProfessorLinkResult> approve({
    required String linkId,
    required ArenaProfessorPermissions permissions,
  }) =>
      _call('approveArenaProfessorRequest', {
        'linkId': linkId,
        'permissions': arenaProfessorPermissionsToMap(permissions),
      });

  @override
  Future<ProfessorLinkResult> reject({
    required String linkId,
    String? reason,
  }) =>
      _call('rejectArenaProfessorRequest', {
        'linkId': linkId,
        if (_text(reason) case final text?) 'reason': text,
      });

  @override
  Future<ProfessorLinkResult> suspend({
    required String linkId,
    required String reason,
    String? details,
  }) =>
      _call('suspendArenaProfessorLink', {
        'linkId': linkId,
        'reason': reason,
        if (_text(details) case final text?) 'details': text,
      });

  @override
  Future<ProfessorLinkResult> reactivate(String linkId) =>
      _call('reactivateArenaProfessorLink', {'linkId': linkId});

  @override
  Future<ProfessorLinkResult> end({required String linkId, String? reason}) =>
      _call('endArenaProfessorLink', {
        'linkId': linkId,
        'side': 'ARENA',
        if (_text(reason) case final text?) 'reason': text,
      });

  @override
  Future<ProfessorLinkResult> cancelInvite(String linkId) =>
      _call('cancelArenaProfessorLink', {'linkId': linkId, 'side': 'ARENA'});

  @override
  Future<ProfessorLinkResult> updatePermission({
    required String linkId,
    required ArenaProfessorPermissionKey key,
    required bool value,
  }) =>
      _call('updateArenaProfessorPermissions', {
        'linkId': linkId,
        'permissions': {key.wire: value},
      });
}

/// Repositório da tela Profissionais. Testes e o harness de QA trocam por um
/// dublê (`overrideWithValue`) junto de `arenaProfessionalsScopeProvider`.
final arenaProfessionalsRepositoryProvider =
    Provider<ArenaProfessionalsRepository>((ref) {
  return FirebaseArenaProfessionalsRepository(
    ref.watch(firestoreProvider),
    ref.watch(usersRepositoryProvider),
  );
});
