import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../ranking/domain/ranking_providers.dart';
import '../../tournaments/domain/tournament_discovery_providers.dart';
import '../../tournaments/domain/tournament_match_status.dart';
import 'athlete_profile_stats_logic.dart';
import 'athlete_public_profile_models.dart';
import 'athlete_public_profile_providers.dart';
import 'gamification_models.dart';
import 'gamification_providers.dart';
import 'match_history/athlete_match_history_providers.dart';

/// Stats do grid (JOGOS · VITÓRIAS · SEQUÊNCIA · RANKING) no perfil do atleta.
final athleteProfileStatsProvider =
    FutureProvider.autoDispose<AthleteProfileStats>((ref) async {
  final gamification = ref.watch(gamificationSummaryProvider).valueOrNull ??
      GamificationSummary.initial();

  final history = await ref.watch(currentAthleteMatchHistoryBundleProvider.future);
  final ranking = await ref.watch(competeHubUserRankingProvider.future);

  return buildAthleteProfileStats(
    gamification: gamification,
    matches: history.matches,
    ranking: ranking,
  );
});

/// Partidas compartilhadas por parceiro (dupla) para a seção "Joga com".
final athleteProfilePartnerMatchCountsProvider =
    FutureProvider.autoDispose<Map<String, int>>((ref) async {
  final user = ref.watch(authProvider).valueOrNull;
  final uid = user?.uid.trim() ?? '';
  if (uid.isEmpty) return const {};

  final teamsRepo = ref.read(tournamentTeamsRepositoryProvider);
  final matchesRepo = ref.read(tournamentMatchesRepositoryProvider);

  final teamIds = await teamsRepo.teamIdsForAthlete(uid);
  if (teamIds.isEmpty) return const {};

  final rawMatches = await matchesRepo.getByTeamIds(teamIds);
  final completed = rawMatches
      .where((m) => TournamentMatchStatus.isCompleted(m.status))
      .toList();

  if (completed.isEmpty) return const {};

  final teamIdSet = {
    ...teamIds,
    for (final m in completed) ...[m.teamAId, m.teamBId],
  }.where((id) => id.trim().isNotEmpty).toSet();

  final teams = await teamsRepo.getTeamsByIds(teamIdSet);

  return countSharedMatchesByPartner(
    athleteId: uid,
    completedMatches: completed,
    teams: teams,
  );
});

/// Parceiros recentes do atleta logado.
final currentAthletePlayPartnersProvider =
    FutureProvider.autoDispose<List<AthletePublicPartnerEntry>>((ref) async {
  final user = ref.watch(authProvider).valueOrNull;
  final uid = user?.uid.trim() ?? '';
  if (uid.isEmpty) return const <AthletePublicPartnerEntry>[];
  return ref.watch(athletePublicPartnersProvider(uid).future);
});
