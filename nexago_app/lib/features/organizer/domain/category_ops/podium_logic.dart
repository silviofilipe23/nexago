import '../../../tournaments/domain/tournament_match.dart';

/// Entrada mínima para calcular o pódio — desacopla a lógica do modelo
/// completo de partida (mantém os testes enxutos).
typedef PodiumMatch = ({
  String matchType,
  String? winnerId,
  String teamAId,
  String teamBId,
  bool isCompleted,
});

PodiumMatch podiumMatchFromMatch(TournamentMatch m) => (
      matchType: m.matchType,
      winnerId: m.winnerId,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      isCompleted: m.isCompleted,
    );

/// Pódio de uma categoria, derivado dos resultados das partidas decisivas.
class CategoryPodium {
  const CategoryPodium({
    this.championTeamId,
    this.runnerUpTeamId,
    this.thirdPlaceTeamId,
  });

  final String? championTeamId;
  final String? runnerUpTeamId;
  final String? thirdPlaceTeamId;

  /// A final foi decidida (já há campeão e vice).
  bool get isDecided => championTeamId != null && runnerUpTeamId != null;

  static const empty = CategoryPodium();
}

bool _isFinalType(String matchType) =>
    matchType.trim().toLowerCase() == 'final';

bool _isThirdPlaceType(String matchType) {
  final t = matchType.trim().toLowerCase();
  return t == 'third place' || t == '3rd place' || t.contains('third');
}

String? _other(PodiumMatch m, String teamId) {
  if (m.teamAId == teamId) return m.teamBId.isNotEmpty ? m.teamBId : null;
  if (m.teamBId == teamId) return m.teamAId.isNotEmpty ? m.teamAId : null;
  return null;
}

/// Calcula o pódio a partir das partidas da categoria. Campeão e vice vêm da
/// partida "Final" (grande final); o 3º lugar, da partida "Third Place" quando
/// existe. Retorna [CategoryPodium.empty] enquanto a final não foi decidida.
CategoryPodium computeCategoryPodium(Iterable<PodiumMatch> matches) {
  PodiumMatch? finalMatch;
  PodiumMatch? thirdMatch;
  for (final m in matches) {
    if (_isFinalType(m.matchType)) {
      finalMatch = m;
    } else if (_isThirdPlaceType(m.matchType)) {
      thirdMatch = m;
    }
  }

  final winner = finalMatch?.winnerId?.trim() ?? '';
  if (finalMatch == null || !finalMatch.isCompleted || winner.isEmpty) {
    return CategoryPodium.empty;
  }

  final third = thirdMatch?.winnerId?.trim() ?? '';
  return CategoryPodium(
    championTeamId: winner,
    runnerUpTeamId: _other(finalMatch, winner),
    thirdPlaceTeamId:
        thirdMatch != null && thirdMatch.isCompleted && third.isNotEmpty
            ? third
            : null,
  );
}

/// Conveniência para chamadores que têm a lista de [TournamentMatch].
CategoryPodium computeCategoryPodiumFromMatches(
        Iterable<TournamentMatch> matches) =>
    computeCategoryPodium(matches.map(podiumMatchFromMatch));
