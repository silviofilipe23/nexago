import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../data/my_tournament_registrations_repository.dart';
import '../data/tournament_matches_repository.dart';
import 'athlete_tournament_day_logic.dart';
import 'my_tournaments_logic.dart';
import 'tournament_match.dart';

final athleteNextMatchProvider =
    FutureProvider.autoDispose<AthleteNextMatch?>((ref) async {
  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  if (uid.isEmpty) return null;

  final regs = await ref.watch(myTournamentRegistrationsProvider.future);
  final eventDayRegs = regs.where(registrationShowsAsLiveToday).where((r) {
    final teamId = r.teamId?.trim() ?? '';
    return teamId.isNotEmpty && r.isPaid;
  }).toList();
  if (eventDayRegs.isEmpty) return null;

  final matchesRepo = TournamentMatchesRepository(FirebaseFirestore.instance);
  final matchesByTournament = <String, List<TournamentMatch>>{};
  for (final reg in eventDayRegs) {
    matchesByTournament.putIfAbsent(
      reg.tournamentId,
      () => [],
    );
  }
  await Future.wait(
    matchesByTournament.keys.map((tournamentId) async {
      matchesByTournament[tournamentId] =
          await matchesRepo.getByTournamentId(tournamentId);
    }),
  );

  AthleteNextMatch? best;
  for (final reg in eventDayRegs) {
    final teamId = reg.teamId!.trim();
    final matches = matchesByTournament[reg.tournamentId] ?? const [];
    final candidate = pickAthleteNextMatch(
      matches: matches,
      teamId: teamId,
      tournamentId: reg.tournamentId,
      tournamentName: reg.tournamentName,
    );
    if (candidate == null) continue;
    if (best == null ||
        athleteMatchPriority(candidate.match, teamId) <
            athleteMatchPriority(best.match, teamId)) {
      best = candidate;
    }
  }

  return best;
});

final athleteCourtCallMatchProvider =
    FutureProvider.autoDispose<AthleteNextMatch?>((ref) async {
  final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
  if (uid.isEmpty) return null;

  final regs = await ref.watch(myTournamentRegistrationsProvider.future);
  final paidRegs = regs
      .where((r) => r.isPaid && (r.teamId?.trim().isNotEmpty ?? false))
      .toList();
  if (paidRegs.isEmpty) return null;

  final matchesRepo = TournamentMatchesRepository(FirebaseFirestore.instance);
  final tournamentIds = paidRegs.map((r) => r.tournamentId).toSet();
  final matchesByTournament = <String, List<TournamentMatch>>{};
  await Future.wait(
    tournamentIds.map((tournamentId) async {
      matchesByTournament[tournamentId] =
          await matchesRepo.getByTournamentId(tournamentId);
    }),
  );

  for (final reg in paidRegs) {
    final teamId = reg.teamId!.trim();
    final matches = matchesByTournament[reg.tournamentId] ?? const [];
    final call = pickAthleteCourtCallMatch(
      matches: matches,
      teamId: teamId,
      tournamentId: reg.tournamentId,
      tournamentName: reg.tournamentName,
    );
    if (call != null) return call;
  }

  return null;
});
