import 'package:nexago_app/core/profiles/app_user_profile.dart';

import '../../../ranking/domain/ranking_display_helpers.dart';
import '../../../ranking/domain/ranking_list_models.dart';
import '../tournament_match.dart';
import '../tournament_match_card_view_model.dart';
import '../tournament_match_status.dart';
import 'tournament_prediction_entry.dart';

/// Só é possível palpitar enquanto a partida ainda está `Scheduled` — espelha
/// a mesma trava aplicada no backend (`assertPickIsAllowed`,
/// `functions/src/tournament-predictions.ts`). Também exige os dois
/// competidores já definidos (sem "TBD" pendente de rodada anterior).
bool canPredictMatch(TournamentMatch match) {
  return TournamentMatchStatus.isScheduled(match.status) &&
      match.teamAId.trim().isNotEmpty &&
      match.teamBId.trim().isNotEmpty;
}

/// Partida travada pra palpite (já começou/terminou/foi cancelada).
bool isPredictionLockedForMatch(TournamentMatch match) {
  return !TournamentMatchStatus.isScheduled(match.status);
}

/// Cards elegíveis pra aparecer na tela de palpites: exclui só as partidas
/// ainda sem os dois competidores definidos (chave ainda não propagou até
/// ali) — partidas já travadas continuam visíveis (mostradas desabilitadas),
/// pra o torcedor ver o palpite que já fez antes da trava.
List<TournamentMatchCardViewModel> predictableMatchCards(
  List<TournamentMatchCardViewModel> cards,
) {
  final sorted = [...cards]
    ..sort((a, b) => a.match.matchNumber.compareTo(b.match.matchNumber));
  return sorted
      .where(
        (card) =>
            card.match.teamAId.trim().isNotEmpty &&
            card.match.teamBId.trim().isNotEmpty,
      )
      .toList();
}

/// A grande final decide o campeão (`matchType == 'Final'`) — mesma regra
/// usada no backend (`isFinalMatchType`). É a partida cujo palpite também
/// vale como palpite de campeão (evita um seletor de campeão à parte).
bool isChampionDecidingMatch(TournamentMatch match) {
  return match.matchType.trim().toLowerCase() == 'final';
}

/// Monta o payload de picks a enviar pra `submitBracketPrediction`:
/// restringe o rascunho local às partidas AINDA `Scheduled` no momento do
/// envio. Importante: o rascunho é semeado a partir do palpite já salvo (que
/// pode incluir partidas que travaram desde então) — reenviar um pick de uma
/// partida já travada faria o backend rejeitar a chamada inteira
/// (`assertPickIsAllowed`), impedindo até o salvamento de palpites novos em
/// outras partidas ainda abertas.
Map<String, String> openMatchPicksToSubmit(
  Map<String, String> draftPicks,
  List<TournamentMatch> matches,
) {
  final openMatchIds = matches
      .where(canPredictMatch)
      .map((m) => m.id)
      .toSet();

  return {
    for (final entry in draftPicks.entries)
      if (entry.value.trim().isNotEmpty && openMatchIds.contains(entry.key))
        entry.key.trim(): entry.value.trim(),
  };
}

/// Deriva o `championPick` do rascunho: o palpite dado pra grande final (se
/// houver uma entre as partidas exibidas). `null` quando o torcedor ainda
/// não chegou nesse palpite.
String? deriveChampionPickFromDraft(
  Map<String, String> draftPicks,
  List<TournamentMatch> matches,
) {
  for (final match in matches) {
    if (!isChampionDecidingMatch(match)) continue;
    final pick = draftPicks[match.id]?.trim();
    if (pick != null && pick.isNotEmpty) return pick;
  }
  return null;
}

/// `true` quando o palpite salvo bateu com o resultado final da partida —
/// só faz sentido depois de concluída.
bool? predictionWasCorrectForMatch(
  TournamentMatch match,
  TournamentPredictionEntry? entry,
) {
  if (!match.isCompleted) return null;
  final winner = match.winnerId?.trim();
  if (winner == null || winner.isEmpty) return null;
  final pick = entry?.pickFor(match.id);
  if (pick == null) return null;
  return pick.trim() == winner;
}

/// Ordem canônica do ranking de palpites: maior pontuação primeiro, desempate
/// por número de palpites enviados e depois por id.
///
/// Este comparador existe em TRÊS lugares e os três precisam concordar:
///  - aqui;
///  - `comparePredictionRanking` (`functions/src/tournament-predictions.ts`),
///    que o usa para gravar a posição anterior de cada participante;
///  - `buildPredictionLeaderboard` no portal do atleta
///    (`predictions.selectors.ts`).
///
/// Até agosto de 2026 este arquivo ordenava SÓ por `score`, então em empate o
/// app e a web mostravam posições diferentes. Passou a importar quando essa
/// posição virou conteúdo de imagem compartilhada — e quando o servidor passou
/// a calcular a variação com base nesta mesma ordem.
int comparePredictionEntries(
  TournamentPredictionEntry a,
  TournamentPredictionEntry b,
) {
  final byScore = b.score.compareTo(a.score);
  if (byScore != 0) return byScore;
  final byPicks = b.picks.length.compareTo(a.picks.length);
  if (byPicks != 0) return byPicks;
  // `compareTo` de String é por code unit — o mesmo critério dos outros dois
  // lugares, que evitam `localeCompare` justamente para bater com este.
  return a.userId.compareTo(b.userId);
}

/// Uma linha do ranking de palpites: a entrada pronta para os widgets de
/// ranking já existentes, mais o que só existe aqui (acertos e variação).
class PredictionLeaderboardRow {
  const PredictionLeaderboardRow({
    required this.entry,
    required this.hits,
    required this.delta,
  });

  final RankingListEntry entry;

  /// Palpites que bateram com o vencedor real, entre as partidas concluídas.
  final int hits;

  /// Posições ganhas (positivo) ou perdidas desde a última partida pontuada.
  /// `null` quando o servidor ainda não fotografou nenhuma posição.
  final int? delta;
}

/// Ranking dos palpiteiros — posições sequenciais (1, 2, 3…), mesma convenção
/// de `assignRanks` em `features/ranking/domain/ranking_logic.dart`.
///
/// [matches] só é necessário para contar acertos; sem ele, `hits` fica em 0.
List<PredictionLeaderboardRow> buildPredictionLeaderboard(
  List<TournamentPredictionEntry> entries, {
  required Map<String, AppUserProfile?> profiles,
  List<TournamentMatch> matches = const [],
  String? currentUserId,
}) {
  final sorted = [...entries]..sort(comparePredictionEntries);
  final me = currentUserId?.trim();

  final winners = <String, String>{};
  for (final match in matches) {
    final winner = match.winnerId?.trim();
    if (match.isCompleted && winner != null && winner.isNotEmpty) {
      winners[match.id] = winner;
    }
  }

  return [
    for (var i = 0; i < sorted.length; i++)
      _toRow(
        sorted[i],
        rank: i + 1,
        profile: profiles[sorted[i].userId],
        isCurrentUser: me != null && me.isNotEmpty && sorted[i].userId == me,
        winners: winners,
      ),
  ];
}

/// Compatível com quem só precisa das linhas prontas para os widgets de
/// ranking (pódio, tiles).
List<RankingListEntry> buildPredictionLeaderboardEntries(
  List<TournamentPredictionEntry> entries, {
  required Map<String, AppUserProfile?> profiles,
  List<TournamentMatch> matches = const [],
  String? currentUserId,
}) {
  return buildPredictionLeaderboard(
    entries,
    profiles: profiles,
    matches: matches,
    currentUserId: currentUserId,
  ).map((row) => row.entry).toList();
}

PredictionLeaderboardRow _toRow(
  TournamentPredictionEntry entry, {
  required int rank,
  required AppUserProfile? profile,
  required bool isCurrentUser,
  required Map<String, String> winners,
}) {
  final palpites = entry.picks.length;
  var hits = 0;
  entry.picks.forEach((matchId, teamId) {
    if (winners[matchId] == teamId) hits++;
  });

  final previous = entry.previousRank;
  return PredictionLeaderboardRow(
    hits: hits,
    // A posição comparada é a calculada AQUI, não uma que veio do servidor:
    // assim o número exibido e a seta ao lado nunca se contradizem.
    delta: previous == null ? null : previous - rank,
    entry: RankingListEntry(
      rank: rank,
      points: entry.score,
      tournamentsCount: 0,
      displayName: rankingDisplayName(profile, entry.userId),
      subtitle: '${hits == 1 ? '1 acerto' : '$hits acertos'} · '
          '${palpites == 1 ? '1 palpite' : '$palpites palpites'}',
      isCurrentUser: isCurrentUser,
      entityId: entry.userId,
      initials: rankingInitials(profile, entry.userId),
      avatarColor: rankingAvatarColor(entry.userId),
      avatarUrl: rankingAvatarUrl(profile),
    ),
  );
}

/// Retrato do próprio atleta na disputa — o "Sua campanha" da tela.
class PredictionStats {
  const PredictionStats({
    required this.points,
    required this.hits,
    required this.decided,
    required this.pending,
    required this.rank,
    required this.totalPlayers,
    required this.delta,
  });

  final int points;
  final int hits;

  /// Palpites cuja partida já terminou — o denominador honesto do
  /// aproveitamento. Dizer "2 de 9" com 7 jogos por vir seria mentira.
  final int decided;
  final int pending;
  final int? rank;
  final int totalPlayers;
  final int? delta;
}

PredictionStats predictionStatsOf(
  TournamentPredictionEntry? entry,
  List<TournamentMatch> matches,
  List<PredictionLeaderboardRow> leaderboard,
) {
  final picks = entry?.picks ?? const <String, String>{};
  var hits = 0;
  var decided = 0;
  var pending = 0;

  for (final match in matches) {
    if (!picks.containsKey(match.id)) continue;
    final correct = predictionWasCorrectForMatch(match, entry);
    if (correct == null) {
      pending++;
    } else {
      decided++;
      if (correct) hits++;
    }
  }

  PredictionLeaderboardRow? mine;
  for (final row in leaderboard) {
    if (row.entry.isCurrentUser) {
      mine = row;
      break;
    }
  }

  return PredictionStats(
    points: entry?.score ?? 0,
    hits: hits,
    decided: decided,
    pending: pending,
    rank: mine?.entry.rank,
    totalPlayers: leaderboard.length,
    delta: mine?.delta,
  );
}

/// "subiu 3 posições" / "caiu 2 posições". `null` quando não há foto do
/// servidor ou não houve movimento — nesse caso não há o que dizer.
String? predictionDeltaLabel(int? delta) {
  if (delta == null || delta == 0) return null;
  final n = delta.abs();
  return '${delta > 0 ? 'subiu' : 'caiu'} $n ${n == 1 ? 'posição' : 'posições'}';
}
