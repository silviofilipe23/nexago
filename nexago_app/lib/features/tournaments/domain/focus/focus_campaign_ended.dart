import '../tournament_group_standings_logic.dart';
import '../tournament_match.dart';
import '../tournament_match_status.dart';
import 'focus_double_elimination.dart';
import 'focus_now_state.dart';
import 'focus_views_logic.dart';

/// Resumo da campanha no herói "eliminada": V / D / posição no grupo.
class FocusCampaignSummary {
  const FocusCampaignSummary({
    required this.wins,
    required this.losses,
    this.groupRank,
  });

  final int wins;
  final int losses;

  /// Posição no grupo (1-based), ou `null` se a categoria não tem grupos /
  /// o atleta não entrou em nenhum pool.
  final int? groupRank;
}

bool _isPending(TournamentMatch m) =>
    !TournamentMatchStatus.isCompleted(m.status) &&
    !TournamentMatchStatus.isCanceled(m.status);

bool _isMine(TournamentMatch m, Set<String> myTeamIds) =>
    myTeamIds.contains(m.teamAId) || myTeamIds.contains(m.teamBId);

bool _isWin(TournamentMatch m, Set<String> myTeamIds) {
  final winner = m.winnerId?.trim() ?? '';
  return winner.isNotEmpty && myTeamIds.contains(winner);
}

String? _myPoolId(List<TournamentMatch> matches, Set<String> myTeamIds) {
  for (final m in matches) {
    if (!_isMine(m, myTeamIds)) continue;
    final pool = m.poolId.trim();
    if (pool.isNotEmpty) return pool;
  }
  return null;
}

String? _myTeamIdInPool(List<String> teamIds, Set<String> myTeamIds) {
  for (final id in teamIds) {
    if (myTeamIds.contains(id)) return id;
  }
  return null;
}

int _completedWinsOf(List<TournamentMatch> pool, String teamId) {
  var wins = 0;
  for (final m in pool) {
    if (!_isPending(m) && TournamentMatchStatus.isCompleted(m.status)) {
      final winner = m.winnerId?.trim() ?? '';
      if (winner == teamId) wins++;
    }
  }
  return wins;
}

int _completedPlayedOf(List<TournamentMatch> pool, String teamId) {
  var n = 0;
  for (final m in pool) {
    if (!TournamentMatchStatus.isCompleted(m.status)) continue;
    if (m.teamAId == teamId || m.teamBId == teamId) n++;
  }
  return n;
}

int _pendingInvolving(List<TournamentMatch> pool, String teamId) {
  var n = 0;
  for (final m in pool) {
    if (!_isPending(m)) continue;
    if (m.teamAId == teamId || m.teamBId == teamId) n++;
  }
  return n;
}

/// Máximo de vitórias ainda alcançável: jogadas restantes conhecidas, ou o
/// que falta no round-robin se a mesa ainda não criou todos os jogos.
int _maxReachableWins(
  List<TournamentMatch> pool,
  String teamId,
  int teamCount,
) {
  final wins = _completedWinsOf(pool, teamId);
  final played = _completedPlayedOf(pool, teamId);
  final pending = _pendingInvolving(pool, teamId);
  final expected = teamCount < 2 ? 0 : teamCount - 1;
  final slotsLeft = expected - played;
  final remaining = pending > slotsLeft ? pending : slotsLeft;
  final safeRemaining = remaining < 0 ? 0 : remaining;
  return wins + safeRemaining;
}

/// Sem chance de classificar no grupo — pelo placar de vitórias da tabela.
///
/// Grupo encerrado: usa a classificação final (desempates já resolvidos).
/// Grupo em andamento: se já existem [qualifiersPerGroup] equipes com MAIS
/// vitórias do que o teto do atleta (vitórias atuais + jogos que ainda pode
/// ganhar), está matematicamente fora — sem simular placar de sets.
bool eliminatedFromGroupPhase({
  required List<TournamentMatch> matches,
  required String categoryId,
  required Set<String> myTeamIds,
  required int qualifiersPerGroup,
}) {
  if (categoryId.isEmpty || myTeamIds.isEmpty || qualifiersPerGroup < 1) {
    return false;
  }
  final category = matches.where((m) => m.categoryId == categoryId).toList();
  final poolId = _myPoolId(category, myTeamIds);
  if (poolId == null) return false;

  final pool = category.where((m) => m.poolId == poolId).toList();
  final teamIds = teamIdsInPool(pool);
  final myTeamId = _myTeamIdInPool(teamIds, myTeamIds);
  if (myTeamId == null || teamIds.length < 2) return false;

  final pending = pool.where(_isPending).toList();
  if (pending.isEmpty) {
    final order = computePoolStandings(poolId, teamIds, pool);
    final index = order.indexWhere(myTeamIds.contains);
    if (index < 0) return false;
    return index >= qualifiersPerGroup;
  }

  final myCeiling = _maxReachableWins(pool, myTeamId, teamIds.length);
  var teamsAlreadyAbove = 0;
  for (final id in teamIds) {
    if (id == myTeamId) continue;
    // Vitórias JÁ conquistadas — o teto dos outros não entra: no melhor caso
    // para o atleta, rivais podem perder tudo que ainda jogam.
    if (_completedWinsOf(pool, id) > myCeiling) {
      teamsAlreadyAbove++;
    }
  }
  return teamsAlreadyAbove >= qualifiersPerGroup;
}

/// A campanha do atleta nesta categoria acabou sem caminho (eliminado no
/// mata-mata ou sem chance matemática de classificar no grupo).
bool athleteFocusCampaignEnded({
  required List<TournamentMatch> matches,
  required String categoryId,
  required Set<String> myTeamIds,
  required bool isDoubleElimination,
  int qualifiersPerGroup = 2,
}) {
  if (categoryId.isEmpty || myTeamIds.isEmpty) return false;

  final category = matches.where((m) => m.categoryId == categoryId).toList();

  if (isDoubleElimination) {
    final standing = focusDoubleEliminationStandingOf(
      category,
      categoryId,
      myTeamIds,
    );
    return standing.side == FocusBracketSide.eliminated;
  }

  if (eliminatedFromKnockout(category, categoryId, myTeamIds)) return true;

  return eliminatedFromGroupPhase(
    matches: category,
    categoryId: categoryId,
    myTeamIds: myTeamIds,
    qualifiersPerGroup: qualifiersPerGroup,
  );
}

/// Precedência do Agora incluindo o estado [FocusNowState.eliminated].
///
/// Chamada e ao vivo vencem a despedida — o atleta ainda precisa do alerta /
/// placar. Partida só agendada cede: jogo "morto" no grupo não esconde o herói
/// de campanha encerrada.
FocusNowState focusNowStateWithCampaignOf(
  TournamentMatch? match,
  String? acknowledgedMatchId, {
  bool categoryHasPendingKnockout = false,
  bool campaignEnded = false,
}) {
  if (match != null) {
    if (match.queueStatus == kQueueStatusOnCourt &&
        acknowledgedMatchId != match.id) {
      return FocusNowState.called;
    }
    if (TournamentMatchStatus.isInProgress(match.status)) {
      return FocusNowState.live;
    }
    if (campaignEnded) return FocusNowState.eliminated;
    return FocusNowState.next;
  }
  if (campaignEnded) return FocusNowState.eliminated;
  return focusNowStateOf(
    null,
    acknowledgedMatchId,
    categoryHasPendingKnockout: categoryHasPendingKnockout,
  );
}

/// Vitórias / derrotas / posição no grupo para o card "NOSSA CAMPANHA".
FocusCampaignSummary focusCampaignSummaryOf({
  required List<TournamentMatch> matches,
  required String categoryId,
  required Set<String> myTeamIds,
}) {
  final category = matches.where((m) => m.categoryId == categoryId).toList();
  final mine = category
      .where(
        (m) =>
            _isMine(m, myTeamIds) &&
            TournamentMatchStatus.isCompleted(m.status),
      )
      .toList();

  var wins = 0;
  var losses = 0;
  for (final m in mine) {
    if (_isWin(m, myTeamIds)) {
      wins++;
    } else {
      losses++;
    }
  }

  int? groupRank;
  final poolId = _myPoolId(category, myTeamIds);
  if (poolId != null) {
    final pool = category.where((m) => m.poolId == poolId).toList();
    final order = computePoolStandings(poolId, teamIdsInPool(pool), pool);
    final index = order.indexWhere(myTeamIds.contains);
    if (index >= 0) groupRank = index + 1;
  }

  return FocusCampaignSummary(
    wins: wins,
    losses: losses,
    groupRank: groupRank,
  );
}

/// Rótulo curto da posição no grupo — "3º".
String focusCampaignRankLabel(int rank) => ordinalOf(rank);
