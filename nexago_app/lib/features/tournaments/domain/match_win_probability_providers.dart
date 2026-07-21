import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../athlete/domain/athlete_rating.dart';
import 'category_level_eligibility.dart';
import 'tournament_discovery_providers.dart';
import 'win_probability.dart';

/// Chave de busca da probabilidade de vitória pré-partida: os dois times
/// (por teamId) + o torneio (usado só para resolver o esporte/sportCode da
/// engine de rating).
typedef MatchWinProbabilityQuery = ({
  String tournamentId,
  String teamAId,
  String teamBId,
});

/// Probabilidade (0..1) de o time A vencer o time B, ou `null` quando falta
/// dado suficiente: esporte sem engine de rating (ex. beach tennis), time
/// não encontrado, ou algum atleta envolvido sem rating ainda / com rating
/// provisional. Regra dura do spec: nunca mostrar probabilidade com dado
/// insuficiente.
final matchWinProbabilityProvider = FutureProvider.autoDispose
    .family<double?, MatchWinProbabilityQuery>((ref, query) async {
  final teamAId = query.teamAId.trim();
  final teamBId = query.teamBId.trim();
  final tournamentId = query.tournamentId.trim();
  if (teamAId.isEmpty || teamBId.isEmpty || tournamentId.isEmpty) return null;

  final tournament = await ref.watch(
    tournamentDetailProvider(tournamentId).future,
  );
  final sportCode = CategoryLevelEligibility.tournamentSportToLevelSportCode(
    tournament?.sport,
  );
  if (sportCode == null) return null;

  final teams = await ref
      .watch(tournamentTeamsRepositoryProvider)
      .getTeamsByIds({teamAId, teamBId});
  final teamA = teams[teamAId];
  final teamB = teams[teamBId];
  if (teamA == null || teamB == null) return null;

  final ratingA = await _resolveTeamRating(ref, teamA.playerIds, sportCode);
  final ratingB = await _resolveTeamRating(ref, teamB.playerIds, sportCode);
  if (ratingA == null || ratingB == null) return null;

  return winProbability(ratingA: ratingA, ratingB: ratingB);
});

/// Rating composto do time, ou `null` se o time não tiver jogadores, ou se
/// algum jogador ainda não tiver rating / tiver rating provisional (poucas
/// partidas avaliadas) — nesse caso não há dado suficiente para compor.
Future<double?> _resolveTeamRating(
  Ref ref,
  List<String> playerIds,
  String sportCode,
) async {
  if (playerIds.isEmpty) return null;

  final ratings = <double>[];
  for (final athleteId in playerIds) {
    final rating = await ref.watch(
      athleteRatingForAthleteProvider(
        (athleteId: athleteId, sportCode: sportCode),
      ).future,
    );
    if (rating == null || rating.isProvisional) return null;
    ratings.add(rating.rating);
  }
  return compositeTeamRating(ratings);
}
