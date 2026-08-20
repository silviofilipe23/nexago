import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Um aviso que o organizador publicou durante o torneio.
class TournamentAnnouncement {
  const TournamentAnnouncement({
    required this.id,
    required this.message,
    required this.createdAt,
  });

  final String id;
  final String message;
  final DateTime? createdAt;
}

/// Avisos do organizador de um torneio.
///
/// Vivem na MESMA coleção do feed da comunidade (`communityFeed`), gravados com
/// `type: 'organizer_announcement'` — não têm coleção própria. O feed da
/// Comunidade descarta esse tipo de propósito (lá só entram abertura de
/// inscrição e campeões), então a leitura por torneio fica aqui.
///
/// Exige o índice composto `type ASC, tournamentId ASC, createdAt DESC`, que já
/// está em `firestore.indexes.json`.
class TournamentAnnouncementsRepository {
  const TournamentAnnouncementsRepository(this._db);

  final FirebaseFirestore _db;

  static const int _limit = 10;

  Stream<List<TournamentAnnouncement>> watchByTournament(String tournamentId) {
    final id = tournamentId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _db
        .collection('communityFeed')
        .where('type', isEqualTo: 'organizer_announcement')
        .where('tournamentId', isEqualTo: id)
        .orderBy('createdAt', descending: true)
        .limit(_limit)
        .snapshots()
        .map((snap) => snap.docs.map(_fromDoc).toList());
  }

  static TournamentAnnouncement _fromDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data();
    final raw = data['createdAt'];
    return TournamentAnnouncement(
      id: doc.id,
      message: (data['message'] as String?)?.trim() ??
          (data['body'] as String?)?.trim() ??
          '',
      createdAt: raw is Timestamp ? raw.toDate() : null,
    );
  }
}

/// Falha degrada para lista vazia: um aviso que não carrega não pode derrubar a
/// seção "Agora", que é a tela que o atleta olha no dia de jogo.
final tournamentAnnouncementsProvider = StreamProvider.autoDispose
    .family<List<TournamentAnnouncement>, String>((ref, tournamentId) {
  return TournamentAnnouncementsRepository(FirebaseFirestore.instance)
      .watchByTournament(tournamentId)
      .handleError((_) => const <TournamentAnnouncement>[]);
});
