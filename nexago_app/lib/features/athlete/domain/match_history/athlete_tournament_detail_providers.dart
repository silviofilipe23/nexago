import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../data/match_history/athlete_match_history_repository.dart';
import '../../../tournaments/domain/tournament_discovery_providers.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import 'athlete_tournament_detail_mapper.dart';
import 'athlete_tournament_detail_models.dart';

final athleteTournamentDetailProvider = FutureProvider.autoDispose
    .family<AthleteTournamentDetail?, String>((ref, tournamentId) async {
  final id = tournamentId.trim();
  if (id.isEmpty) return null;

  final uid = (ref.watch(authProvider).valueOrNull?.uid ?? '').trim();
  if (uid.isEmpty) return null;

  final bundle =
      await ref.read(athleteMatchHistoryRepositoryProvider).fetchHistory(uid);
  final summary = bundle.tournaments
      .where((t) => t.tournamentId == id || t.id == id)
      .firstOrNull;
  if (summary == null) return null;

  final tournamentDoc = await ref
      .read(tournamentsRepositoryProvider)
      .watchTournamentDetail(id)
      .first;

  final teamIds =
      await ref.read(tournamentTeamsRepositoryProvider).teamIdsForAthlete(uid);
  final rawMatches =
      await ref.read(tournamentMatchesRepositoryProvider).getByTeamIds(teamIds);
  final tournamentMatches = rawMatches
      .where(
        (m) =>
            m.tournamentId == id &&
            TournamentMatchStatus.isCompleted(m.status),
      )
      .toList();

  String? athleteTeamId;
  final opponentIds = <String>{};
  for (final match in tournamentMatches) {
    if (teamIds.contains(match.teamAId)) {
      athleteTeamId ??= match.teamAId;
      final opponent = match.opponentTeamIdFor(match.teamAId);
      if (opponent != null) opponentIds.add(opponent);
    }
    if (teamIds.contains(match.teamBId)) {
      athleteTeamId ??= match.teamBId;
      final opponent = match.opponentTeamIdFor(match.teamBId);
      if (opponent != null) opponentIds.add(opponent);
    }
  }
  if (athleteTeamId == null) return null;

  final enrichment = ref.read(tournamentMatchEnrichmentServiceProvider);
  final opponentNames = <String, String>{};
  for (final opponentId in opponentIds) {
    opponentNames[opponentId] = await enrichment.teamDisplayName(
      teamId: opponentId,
    );
  }

  return buildAthleteTournamentDetail(
    tournamentId: id,
    summary: summary,
    tournamentDoc: tournamentDoc,
    tournamentMatches: tournamentMatches,
    athleteTeamId: athleteTeamId,
    opponentNames: opponentNames,
  );
});
