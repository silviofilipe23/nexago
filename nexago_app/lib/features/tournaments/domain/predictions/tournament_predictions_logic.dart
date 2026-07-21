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

/// Ranking dos palpiteiros (maior `score` primeiro) — mesma convenção de
/// `assignRanks` em `features/ranking/domain/ranking_logic.dart` (posições
/// sequenciais 1, 2, 3…, sem empate compartilhado).
List<RankingListEntry> buildPredictionLeaderboardEntries(
  List<TournamentPredictionEntry> entries, {
  required Map<String, AppUserProfile?> profiles,
  String? currentUserId,
}) {
  final sorted = [...entries]..sort((a, b) => b.score.compareTo(a.score));
  final me = currentUserId?.trim();

  return [
    for (var i = 0; i < sorted.length; i++)
      _toRankingListEntry(
        sorted[i],
        rank: i + 1,
        profile: profiles[sorted[i].userId],
        isCurrentUser: me != null && me.isNotEmpty && sorted[i].userId == me,
      ),
  ];
}

RankingListEntry _toRankingListEntry(
  TournamentPredictionEntry entry, {
  required int rank,
  required AppUserProfile? profile,
  required bool isCurrentUser,
}) {
  final acertos = entry.picks.length;
  return RankingListEntry(
    rank: rank,
    points: entry.score,
    tournamentsCount: 0,
    displayName: rankingDisplayName(profile, entry.userId),
    subtitle: acertos == 1 ? '1 palpite enviado' : '$acertos palpites enviados',
    isCurrentUser: isCurrentUser,
    entityId: entry.userId,
    initials: rankingInitials(profile, entry.userId),
    avatarColor: rankingAvatarColor(entry.userId),
    avatarUrl: rankingAvatarUrl(profile),
  );
}
