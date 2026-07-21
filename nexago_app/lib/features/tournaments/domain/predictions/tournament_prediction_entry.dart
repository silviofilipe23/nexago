/// Palpite de um atleta/torcedor sobre o chaveamento de um torneio.
///
/// Espelha `tournamentPredictions/{tournamentId}/entries/{userId}`
/// (`functions/src/tournament-predictions.ts`): `picks` mapeia `matchId` →
/// id do time (`teamAId`/`teamBId` da partida) escolhido como vencedor
/// previsto; `championPick` é opcional (bônus quando bate com o campeão da
/// grande final); `score` é somado só pelo backend (trigger de conclusão de
/// partida) — o app nunca escreve nele diretamente.
class TournamentPredictionEntry {
  const TournamentPredictionEntry({
    required this.userId,
    this.picks = const {},
    this.championPick,
    this.score = 0,
    this.submittedAt,
    this.updatedAt,
  });

  final String userId;
  final Map<String, String> picks;
  final String? championPick;
  final int score;
  final DateTime? submittedAt;
  final DateTime? updatedAt;

  /// Vencedor previsto pelo usuário para [matchId], ou `null` se não palpitou.
  String? pickFor(String matchId) => picks[matchId.trim()];

  bool hasPickFor(String matchId) => pickFor(matchId) != null;
}
