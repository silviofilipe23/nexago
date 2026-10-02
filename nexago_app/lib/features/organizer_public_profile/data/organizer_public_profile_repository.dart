import 'package:cloud_firestore/cloud_firestore.dart';

import '../../organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import '../../tournaments/data/nexago_artifacts_paths.dart';
import '../domain/organizer_event.dart';
import '../domain/organizer_public_profile_models.dart';
import 'organizer_event_mapper.dart';

const String kOrganizerPublicProfilesCollection = 'organizerPublicProfiles';
const String kOrganizerFollowersSubcollection = 'followers';

/// Doc de seguidor — EXATAMENTE estas três chaves: a rule de criação recusa qualquer outra e
/// exige `followedAt == request.time` (por isso o `serverTimestamp`).
Map<String, Object> organizerFollowerDocData({
  required String followerId,
  required String organizerId,
}) {
  return {
    'userId': followerId,
    'organizerId': organizerId,
    'followedAt': FieldValue.serverTimestamp(),
  };
}

/// Inscrições que ocupam vaga: o total menos a fila de espera, nunca negativo.
int organizerEntriesFromCounts({required int total, required int waitlisted}) {
  final entries = total - waitlisted;
  return entries < 0 ? 0 : entries;
}

/// Leituras do perfil público do organizador e o seguir/deixar de seguir. Os docs públicos são
/// gravados só por Cloud Function; o único doc que o app grava é o do próprio seguidor.
class OrganizerPublicProfileRepository {
  OrganizerPublicProfileRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _profiles =>
      _firestore.collection(kOrganizerPublicProfilesCollection);

  DocumentReference<Map<String, dynamic>> _followerDoc(
    String organizerId,
    String followerId,
  ) {
    return _profiles
        .doc(organizerId)
        .collection(kOrganizerFollowersSubcollection)
        .doc(followerId);
  }

  Stream<OrganizerPublicProfile?> watchProfile(String organizerId) {
    final id = organizerId.trim();
    if (id.isEmpty) return Stream.value(null);
    return _profiles
        .doc(id)
        .snapshots()
        .map((snap) => OrganizerPublicProfile.fromMap(snap.id, snap.data()));
  }

  /// Lista "Organizadores": só `listed == true` (o servidor já exige `isOrganizer`). A ordem e
  /// a busca ficam no cliente.
  Stream<List<OrganizerPublicProfile>> watchListedProfiles() {
    return _profiles
        .where('listed', isEqualTo: true)
        .snapshots()
        .map(
          (snap) => [
            for (final doc in snap.docs)
              if (OrganizerPublicProfile.fromMap(doc.id, doc.data())
                  case final profile? when profile.isDisplayable)
                profile,
          ],
        );
  }

  /// Eventos listados do organizador (rascunho, cancelado e "por link" ficam de fora).
  Stream<List<OrganizerEvent>> watchEvents(String organizerId) {
    final id = organizerId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection('tournaments')
        .where('managerId', isEqualTo: id)
        .snapshots()
        .map(
          (snap) => [
            for (final doc in snap.docs)
              if (organizerEventFromMap(doc.id, doc.data()) case final event?)
                event,
          ],
        );
  }

  /// Resumos de avaliação dos torneios do organizador (públicos). O filtro de "fechado com 3+"
  /// fica em `organizerEventReviewRows`.
  Stream<List<TournamentReviewSummary>> watchReviewSummaries(
    String organizerId,
  ) {
    final id = organizerId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection('tournamentReviewSummaries')
        .where('organizerId', isEqualTo: id)
        .snapshots()
        .map(
          (snap) => [
            for (final doc in snap.docs)
              if (TournamentReviewSummary.fromMap(doc.id, doc.data())
                  case final summary?)
                summary,
          ],
        );
  }

  /// Inscrições de um evento realizado, numa leitura só: o número não muda mais, então não
  /// vale um stream de todas as inscrições por linha do histórico. Duas agregações `count()`
  /// (total menos fila de espera) — `waitlist != true` excluiria os docs sem o campo.
  Future<int> countRealizedEntries(String tournamentId) async {
    final id = tournamentId.trim();
    if (id.isEmpty) return 0;
    final base = _firestore
        .collection(NexagoArtifactsPaths.inscriptionsCollection())
        .where('tournamentId', isEqualTo: id);
    final results = await Future.wait([
      base.count().get(),
      base.where('waitlist', isEqualTo: true).count().get(),
    ]);
    return organizerEntriesFromCounts(
      total: results[0].count ?? 0,
      waitlisted: results[1].count ?? 0,
    );
  }

  Stream<bool> watchIsFollowing({
    required String organizerId,
    required String followerId,
  }) {
    final organizer = organizerId.trim();
    final follower = followerId.trim();
    if (organizer.isEmpty || follower.isEmpty || organizer == follower) {
      return Stream.value(false);
    }
    return _followerDoc(
      organizer,
      follower,
    ).snapshots().map((snap) => snap.exists);
  }

  /// `set` SEM merge num doc que ainda não existe: regravar um doc existente seria `update`, que
  /// a rule nega. Quem chama só segue quando ainda não segue.
  Future<void> follow({
    required String organizerId,
    required String followerId,
  }) async {
    final organizer = organizerId.trim();
    final follower = followerId.trim();
    if (organizer.isEmpty || follower.isEmpty || organizer == follower) return;
    await _followerDoc(organizer, follower).set(
      organizerFollowerDocData(followerId: follower, organizerId: organizer),
    );
  }

  Future<void> unfollow({
    required String organizerId,
    required String followerId,
  }) async {
    final organizer = organizerId.trim();
    final follower = followerId.trim();
    if (organizer.isEmpty || follower.isEmpty) return;
    await _followerDoc(organizer, follower).delete();
  }
}
