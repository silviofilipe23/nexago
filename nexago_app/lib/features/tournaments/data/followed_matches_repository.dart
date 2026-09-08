import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../domain/followed_match.dart';
import '../domain/tournament_match.dart';

/// Alfabeto aceito pelo FCM em nome de tópico.
final _topicSafe = RegExp(r'^[a-zA-Z0-9\-_.~%]+$');
final _topicUnsafe = RegExp(r'[^a-zA-Z0-9\-_.~%]');

/// FNV-1a de 32 bits sobre unidades de código UTF-16, em base 36.
///
/// Porte literal de `fnv1a32` em `functions/src/match-live-follow-notify.ts`.
/// Os dois lados PRECISAM gerar o mesmo nome de tópico: divergir aqui manda o
/// push para um tópico que ninguém assina, e não há erro em lugar nenhum —
/// simplesmente não chega. Os testes dos dois lados travam os mesmos vetores.
@visibleForTesting
String fnv1a32(String input) {
  var hash = 0x811c9dc5;
  for (final unit in input.codeUnits) {
    hash ^= unit;
    hash = (hash * 0x01000193) & 0xffffffff;
  }
  return hash.toRadixString(36);
}

String _safeTopicSegment(String matchId) {
  final id = matchId.trim();
  if (id.isEmpty) {
    throw ArgumentError('matchId obrigatório para montar o tópico');
  }
  if (_topicSafe.hasMatch(id)) return id;
  return '${id.replaceAll(_topicUnsafe, '_')}.${fnv1a32(id)}';
}

/// Nome do tópico FCM da partida, por plataforma.
///
/// Espelha `matchLiveTopics` no backend. Android e iOS têm tópicos separados
/// porque recebem formatos de mensagem diferentes (data-only vs alerta).
String matchTopicName(String matchId, {required bool ios}) {
  final id = _safeTopicSegment(matchId);
  return ios ? 'match-$id-ios' : 'match-$id-android';
}

/// Partidas que o atleta escolheu acompanhar.
///
/// Duas metades: o doc em `users/{uid}/followedMatches/{matchId}` alimenta a
/// UI e o re-sync; a assinatura do tópico FCM é o que faz o push chegar. Ver
/// `docs/superpowers/specs/2026-09-05-seguir-partida-tela-bloqueada-design.md`.
class FollowedMatchesRepository {
  FollowedMatchesRepository(this._firestore, this._messaging);

  final FirebaseFirestore _firestore;
  final FirebaseMessaging _messaging;

  CollectionReference<Map<String, dynamic>> _collection(String uid) {
    return _firestore
        .collection('users')
        .doc(uid)
        .collection('followedMatches');
  }

  Stream<List<FollowedMatch>> watch(String uid) {
    final id = uid.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _collection(id)
        .orderBy('followedAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map(FollowedMatch.fromDoc).toList());
  }

  /// Grava o doc ANTES de assinar o tópico: se o subscribe falhar, o doc fica e
  /// `resyncTopics` conserta no próximo boot. Na ordem inversa, uma assinatura
  /// órfã ficaria recebendo push de uma partida que a UI não mostra.
  Future<void> follow({
    required String uid,
    required TournamentMatch match,
  }) async {
    final id = uid.trim();
    final matchId = match.id.trim();
    if (id.isEmpty || matchId.isEmpty) return;

    await _collection(id).doc(matchId).set({
      'matchId': matchId,
      'tournamentId': match.tournamentId,
      'categoryId': match.categoryId,
      'source': 'manual',
      'followedAt': FieldValue.serverTimestamp(),
    });

    await _subscribe(matchId);
  }

  Future<void> unfollow({required String uid, required String matchId}) async {
    final id = uid.trim();
    final match = matchId.trim();
    if (id.isEmpty || match.isEmpty) return;

    await _unsubscribe(match);
    await _collection(id).doc(match).delete();
  }

  /// Reassina os tópicos de tudo que o atleta segue.
  ///
  /// Idempotente e chamado no boot: é o que cobre troca de aparelho,
  /// reinstalação e rotação de token, casos em que a assinatura se perdeu mas o
  /// doc no Firestore continua lá.
  Future<void> resyncTopics(String uid) async {
    final id = uid.trim();
    if (id.isEmpty) return;

    final snap = await _collection(id).get();
    for (final doc in snap.docs) {
      final matchId = (doc.data()['matchId'] as String?)?.trim() ?? doc.id;
      if (matchId.isEmpty) continue;
      await _subscribe(matchId);
    }
  }

  /// Tópico não existe na web e o placar na tela bloqueada é de celular.
  bool get _topicsSupported => !kIsWeb;

  bool get _isIos => defaultTargetPlatform == TargetPlatform.iOS;

  Future<void> _subscribe(String matchId) async {
    if (!_topicsSupported) return;
    try {
      await _messaging.subscribeToTopic(matchTopicName(matchId, ios: _isIos));
    } catch (e) {
      // Falha de rede aqui não pode derrubar o "Seguir": o doc já está gravado
      // e o re-sync do próximo boot reassina.
      debugPrint('followedMatches: subscribe falhou em $matchId: $e');
    }
  }

  Future<void> _unsubscribe(String matchId) async {
    if (!_topicsSupported) return;
    try {
      final topic = matchTopicName(matchId, ios: _isIos);
      await _messaging.unsubscribeFromTopic(topic);
    } catch (e) {
      debugPrint('followedMatches: unsubscribe falhou em $matchId: $e');
    }
  }
}
