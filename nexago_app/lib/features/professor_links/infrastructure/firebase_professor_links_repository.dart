import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/arena_professor_link.dart';
import '../domain/professor_link_rules.dart';
import '../domain/professor_links_repository.dart';

/// Vínculos professor ↔ arena no Firebase: leituras em `arenaProfessors` e no
/// espelho `arenas/{id}/publicProfessors`; ações pelas callables da região do
/// cliente (`nexagoFunctions`).
class FirebaseProfessorLinksRepository implements ProfessorLinksRepository {
  FirebaseProfessorLinksRepository(this._db, {FirebaseFunctions? functions})
      : _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _db;
  final FirebaseFunctions _functions;

  static const String _fallback =
      'Não foi possível concluir agora. Tente de novo em instantes.';

  CollectionReference<Map<String, dynamic>> get _links =>
      _db.collection('arenaProfessors');

  @override
  Stream<List<ArenaProfessorLink>> watchMyLinks(String professorUserId) =>
      _links
          .where('professorUserId', isEqualTo: professorUserId)
          .snapshots()
          .map(
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
  Stream<List<PublicArenaProfessor>> watchPublicProfessors(String arenaId) =>
      _db
          .collection('arenas')
          .doc(arenaId)
          .collection('publicProfessors')
          .snapshots()
          .map(
            (snap) => [
              for (final doc in snap.docs)
                PublicArenaProfessor.fromMap(doc.id, doc.data()),
            ],
          );

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

  @override
  Future<ProfessorLinkResult> requestLink({
    required String arenaId,
    required ArenaProfessorLinkType type,
    String? message,
  }) =>
      _call('requestArenaProfessorLink', {
        'arenaId': arenaId,
        'relationshipType': type.wire,
        if (message != null && message.trim().isNotEmpty)
          'message': message.trim(),
      });

  @override
  Future<ProfessorLinkResult> respondToInvite({
    required String linkId,
    required bool accept,
    String? reason,
  }) =>
      _call('respondToArenaProfessorInvite', {
        'linkId': linkId,
        'accept': accept,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      });

  @override
  Future<ProfessorLinkResult> cancelRequest(String linkId) => _call(
      'cancelArenaProfessorLink', {'linkId': linkId, 'side': 'PROFESSOR'});

  @override
  Future<ProfessorLinkResult> endLink({
    required String linkId,
    String? reason,
  }) =>
      _call('endArenaProfessorLink', {
        'linkId': linkId,
        'side': 'PROFESSOR',
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      });
}

/// Repositório da feature. O harness de QA e os testes trocam por um dublê
/// (`overrideWithValue`) junto de `professorLinksUidProvider`.
final professorLinksRepositoryProvider = Provider<ProfessorLinksRepository>((
  ref,
) {
  return FirebaseProfessorLinksRepository(ref.watch(firestoreProvider));
});
