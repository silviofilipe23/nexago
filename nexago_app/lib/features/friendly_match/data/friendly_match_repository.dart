import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/friendly_match_models.dart';

/// Bora Jogar — leitura de `friendlyMatches` e da config do recurso.
///
/// IMPORTANTE: as rules só liberam leitura quando a query contém um
/// constraint do próprio uid (fromUid ==, toUid == ou participantUids
/// array-contains). Toda query nova aqui DEVE seguir isso, senão o app
/// toma permission-denied em produção.
class FriendlyMatchRepository {
  FriendlyMatchRepository({FirebaseFirestore? firestore})
      : _db = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _db;

  CollectionReference<Map<String, dynamic>> get _matches =>
      _db.collection('friendlyMatches');

  List<FriendlyMatch> _parse(QuerySnapshot<Map<String, dynamic>> snap) {
    return snap.docs
        .map((doc) => FriendlyMatch.fromDoc(doc.id, doc.data()))
        .whereType<FriendlyMatch>()
        .toList();
  }

  /// Convites que chegaram para mim e aguardam minha resposta.
  Stream<List<FriendlyMatch>> incomingInvites(String uid) => _matches
      .where('toUid', isEqualTo: uid)
      .where('status', isEqualTo: 'sent')
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map(_parse);

  /// Contrapropostas que voltaram para mim (fui eu quem convidou).
  Stream<List<FriendlyMatch>> countersToRespond(String uid) => _matches
      .where('fromUid', isEqualTo: uid)
      .where('status', isEqualTo: 'countered')
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map(_parse);

  /// Convites que enviei e aguardam o outro lado.
  Stream<List<FriendlyMatch>> sentWaiting(String uid) => _matches
      .where('fromUid', isEqualTo: uid)
      .where('status', isEqualTo: 'sent')
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map(_parse);

  /// Contrapropostas que fiz e aguardam o remetente original.
  Stream<List<FriendlyMatch>> countersWaiting(String uid) => _matches
      .where('toUid', isEqualTo: uid)
      .where('status', isEqualTo: 'countered')
      .orderBy('createdAt', descending: true)
      .snapshots()
      .map(_parse);

  /// Jogos vivos: confirmados e realizados aguardando avaliação.
  Stream<List<FriendlyMatch>> activeMatches(String uid) => _matches
      .where('participantUids', arrayContains: uid)
      .where('status', whereIn: ['confirmed', 'completed'])
      .orderBy('scheduledAt')
      .snapshots()
      .map(_parse);

  /// Histórico: estados terminais. Ordenado do mais recente para o mais
  /// antigo em memória (o índice composto existente é ascendente).
  Stream<List<FriendlyMatch>> historyMatches(String uid) => _matches
      .where('participantUids', arrayContains: uid)
      .where('status',
          whereIn: ['reviewed', 'no_show', 'cancelled', 'declined', 'expired'])
      .orderBy('scheduledAt')
      .snapshots()
      .map((snap) => _parse(snap).reversed.toList());

  Stream<FriendlyMatch?> watchMatch(String matchId) => _matches
      .doc(matchId)
      .snapshots()
      .map((doc) => FriendlyMatch.fromDoc(doc.id, doc.data()));

  Stream<FriendlyMatchConfig> watchConfig() => _db
      .doc('appConfig/friendlyMatch')
      .snapshots()
      .map((doc) => FriendlyMatchConfig.fromMap(doc.data()));
}

final friendlyMatchRepositoryProvider = Provider<FriendlyMatchRepository>((ref) {
  return FriendlyMatchRepository();
});
