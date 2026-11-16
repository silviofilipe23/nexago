import 'package:intl/intl.dart';

import 'compete_hub_models.dart';
import 'tournament_discovery_models.dart';

/// Legendas dos cards do Hub que mostram dado ao vivo em vez de texto fixo.
/// Enquanto o dado não chega (ou falha), o card fica com o texto padrão: o
/// menu não pisca nem muda de altura.

const String competeHubTournamentsFallbackDescription =
    'Descubra competições abertas e inscrições';

/// Nada aberto nem ao vivo: não promete "competição aberta".
const String competeHubTournamentsIdleDescription =
    'Calendário e resultados das competições';

const String competeHubRankingFallbackDescription = 'Sua posição na temporada';

final NumberFormat _points = NumberFormat.decimalPattern('pt_BR');

String competeHubTournamentsCardDescription(
  TournamentDiscoveryLiveStats? stats,
) {
  if (stats == null) return competeHubTournamentsFallbackDescription;

  final open = stats.openRegistrations;
  final live = stats.matchesLiveNow;
  if (open > 0 && live > 0) {
    return '$open abertas · $live ${live == 1 ? 'jogo' : 'jogos'} ao vivo';
  }
  if (open > 0) return '$open com inscrições abertas';
  if (live > 0) {
    return live == 1 ? '1 jogo ao vivo agora' : '$live jogos ao vivo agora';
  }
  return competeHubTournamentsIdleDescription;
}

String competeHubRankingCardDescription(CompeteHubUserRanking? ranking) {
  if (ranking == null) return competeHubRankingFallbackDescription;
  if (ranking.isUnranked || ranking.rank <= 0) {
    return 'Jogue um torneio e entre no ranking';
  }

  final scope = ranking.isSeasonMode ? 'na temporada' : 'no ranking geral';
  return '#${ranking.rank} $scope · ${_points.format(ranking.points)} pts';
}
