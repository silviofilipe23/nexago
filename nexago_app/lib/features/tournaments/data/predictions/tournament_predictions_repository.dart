import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../domain/predictions/tournament_prediction_entry.dart';
import 'tournament_prediction_entry_mapper.dart';

class TournamentPredictionsRepositoryException implements Exception {
  TournamentPredictionsRepositoryException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}

/// Lê/grava `tournamentPredictions/{tournamentId}/entries/{userId}`. Leitura
/// direta ao Firestore (regra pública, é leaderboard de torcida); escrita
/// exclusiva pela callable `submitBracketPrediction` — o app nunca escreve
/// nesse doc diretamente (ver `firestore.rules`).
class TournamentPredictionsRepository {
  TournamentPredictionsRepository(
    this._firestore, {
    FirebaseFunctions? functions,
  }) : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  CollectionReference<Map<String, dynamic>> _entries(String tournamentId) =>
      _firestore
          .collection('tournamentPredictions')
          .doc(tournamentId.trim())
          .collection('entries');

  Future<TournamentPredictionEntry?> getMyEntry({
    required String tournamentId,
    required String userId,
  }) async {
    final tid = tournamentId.trim();
    final uid = userId.trim();
    if (tid.isEmpty || uid.isEmpty) return null;
    final snap = await _entries(tid).doc(uid).get();
    return TournamentPredictionEntryMapper.fromSnapshot(snap);
  }

  Future<List<TournamentPredictionEntry>> loadLeaderboard(
    String tournamentId,
  ) async {
    final tid = tournamentId.trim();
    if (tid.isEmpty) return const [];
    final snap = await _entries(tid).get();
    return snap.docs
        .map(TournamentPredictionEntryMapper.fromSnapshot)
        .whereType<TournamentPredictionEntry>()
        .toList();
  }

  /// Envia/atualiza picks do usuário logado. `picks` mapeia `matchId` → id
  /// do time escolhido como vencedor previsto; `championPick` é opcional.
  /// A validação real (torneio dono da partida, partida ainda `Scheduled`)
  /// acontece no servidor — erros chegam como [FirebaseFunctionsException].
  Future<void> submitPrediction({
    required String tournamentId,
    required Map<String, String> picks,
    String? championPick,
  }) async {
    final tid = tournamentId.trim();
    if (tid.isEmpty) return;
    if (picks.isEmpty && (championPick == null || championPick.trim().isEmpty)) {
      return;
    }

    try {
      final callable = _functions.httpsCallable('submitBracketPrediction');
      await callable.call({
        'tournamentId': tid,
        'picks': picks,
        if (championPick != null && championPick.trim().isNotEmpty)
          'championPick': championPick.trim(),
      });
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPredictionsRepositoryException(
        e.message ?? 'Não foi possível salvar seu palpite.',
        code: e.code,
      );
    }
  }
}
