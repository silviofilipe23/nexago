import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../ranking/domain/ranking_providers.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import '../../../tournaments/domain/compete_hub_models.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_point_event.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_team.dart';
import '../../../tournaments/data/tournament_matches_repository.dart';
import '../../../tournaments/data/tournament_teams_repository.dart';
import '../../../tournaments/data/tournaments_repository.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import '../../../tournaments/domain/tournament_discovery_providers.dart';
import '../athlete_display_name.dart';
import '../athlete_profile.dart';
import '../athlete_profile_stats_logic.dart';
import '../athlete_profile_providers.dart';
import '../gamification_models.dart';
import '../gamification_providers.dart';
import 'athlete_match_detail_mapper.dart';
import 'athlete_match_detail_models.dart';
import 'match_detail_form_logic.dart';
import 'match_detail_head_to_head_logic.dart';
import 'match_detail_share_builder.dart';
import 'match_detail_xp_logic.dart';

/// Histórico de partidas das duas duplas, cacheado por par de teamIds.
class MatchDetailTeamHistoryBundle {
  const MatchDetailTeamHistoryBundle({
    required this.ourTeamMatches,
    required this.opponentTeamMatches,
    required this.tournamentNames,
  });

  final List<TournamentMatch> ourTeamMatches;
  final List<TournamentMatch> opponentTeamMatches;
  final Map<String, String> tournamentNames;
}

String matchDetailTeamHistoryCacheKey(String ourTeamId, String opponentTeamId) {
  return '${ourTeamId.trim()}::${opponentTeamId.trim()}';
}

Future<MatchDetailTeamHistoryBundle> fetchMatchDetailTeamHistory({
  required TournamentMatchesRepository matchRepo,
  required TournamentsRepository tournamentsRepo,
  required String ourTeamId,
  required String opponentTeamId,
}) async {
  final ourId = ourTeamId.trim();
  final opponentId = opponentTeamId.trim();
  if (ourId.isEmpty || opponentId.isEmpty) {
    return const MatchDetailTeamHistoryBundle(
      ourTeamMatches: [],
      opponentTeamMatches: [],
      tournamentNames: {},
    );
  }

  final results = await Future.wait([
    matchRepo.getByTeamId(ourId),
    matchRepo.getByTeamId(opponentId),
  ]);

  final ourMatches = results[0];
  final opponentMatches = results[1];
  final historyTournamentIds = <String>{
    for (final m in [...ourMatches, ...opponentMatches])
      if (m.tournamentId.isNotEmpty) m.tournamentId,
  };
  final tournamentNames = historyTournamentIds.isEmpty
      ? const <String, String>{}
      : await tournamentsRepo.getTournamentNames(historyTournamentIds);

  return MatchDetailTeamHistoryBundle(
    ourTeamMatches: ourMatches,
    opponentTeamMatches: opponentMatches,
    tournamentNames: tournamentNames,
  );
}

final matchDetailTeamHistoryProvider = FutureProvider.autoDispose
    .family<MatchDetailTeamHistoryBundle, String>((ref, cacheKey) async {
  final parts = cacheKey.split('::');
  if (parts.length != 2) {
    return const MatchDetailTeamHistoryBundle(
      ourTeamMatches: [],
      opponentTeamMatches: [],
      tournamentNames: {},
    );
  }

  return fetchMatchDetailTeamHistory(
    matchRepo: ref.watch(tournamentMatchesRepositoryProvider),
    tournamentsRepo: ref.read(tournamentsRepositoryProvider),
    ourTeamId: parts[0],
    opponentTeamId: parts[1],
  );
});

bool _needsTeamHistoryEnrichment(MatchDetailPhase phase) {
  return phase == MatchDetailPhase.scheduled ||
      phase == MatchDetailPhase.completed;
}

/// Partida + histórico (stream). Não observa gamificação/XP — evita ref após await.
final athleteMatchDetailCoreProvider = StreamProvider.autoDispose
    .family<AthleteMatchDetail?, String>((ref, matchId) {
  final uid = (ref.watch(authProvider).valueOrNull?.uid ?? '').trim();
  if (uid.isEmpty) return Stream<AthleteMatchDetail?>.value(null);

  ref.watch(athleteProfileProvider);
  final athleteProfile = ref.read(athleteProfileProvider).valueOrNull;

  final matchRepo = ref.watch(tournamentMatchesRepositoryProvider);
  final teamsRepo = ref.read(tournamentTeamsRepositoryProvider);
  final usersRepo = ref.read(usersRepositoryProvider);
  final tournamentsRepo = ref.read(tournamentsRepositoryProvider);

  final match$ = matchRepo.watchById(matchId);
  final pointEvents$ = matchRepo.watchPointEvents(matchId);

  return _combineLatest2(match$, pointEvents$, (match, pointEvents) {
    return (match: match, pointEvents: pointEvents);
  }).asyncMap((bundle) {
    final match = bundle.match;
    if (match == null) return Future<AthleteMatchDetail?>.value(null);
    return _resolveAthleteMatchDetail(
      teamsRepo: teamsRepo,
      usersRepo: usersRepo,
      tournamentsRepo: tournamentsRepo,
      matchRepo: matchRepo,
      athleteProfile: athleteProfile,
      match: match,
      pointEvents: bundle.pointEvents,
      uid: uid,
    );
  });
});

/// Combina o stream da partida com gamificação, XP confirmado e ranking (síncrono).
final athleteMatchDetailProvider = Provider.autoDispose
    .family<AsyncValue<AthleteMatchDetail?>, String>((ref, matchId) {
  final core = ref.watch(athleteMatchDetailCoreProvider(matchId));
  final gamification = ref.watch(gamificationSummaryProvider);
  final confirmedMatchXp = ref.watch(tournamentMatchXpAwardProvider(matchId));
  final ranking = ref.watch(competeHubUserRankingProvider);

  return core.when(
    data: (detail) {
      if (detail == null) return const AsyncValue.data(null);
      return AsyncValue.data(
        _applyMatchDetailLiveEnrichment(
          detail: detail,
          gamification: gamification.valueOrNull,
          confirmedMatchXp: confirmedMatchXp.valueOrNull,
          ranking: ranking.valueOrNull,
        ),
      );
    },
    loading: () => const AsyncValue.loading(),
    error: AsyncValue.error,
    skipLoadingOnReload: true,
    skipLoadingOnRefresh: true,
  );
});

AthleteMatchDetail _applyMatchDetailLiveEnrichment({
  required AthleteMatchDetail detail,
  required GamificationSummary? gamification,
  required int? confirmedMatchXp,
  required CompeteHubUserRanking? ranking,
}) {
  if (!detail.isParticipantView) return detail;

  final roleLabel = _participantRoleLabel(ranking);
  var enriched = detail;
  if (roleLabel != null && detail.ourTeam.isCurrentUser) {
    enriched = enriched.copyWith(
      ourTeam: MatchTeamSide(
        players: detail.ourTeam.players,
        label: detail.ourTeam.label,
        roleLabel: roleLabel,
        isCurrentUser: true,
        teamId: detail.ourTeam.teamId,
      ),
    );
  }

  final xp = detail.xpInfo;
  if (xp == null) return enriched;

  return enriched.copyWith(
    xpInfo: MatchDetailXpInfo(
      xpGained: confirmedMatchXp,
      rankLabel: formatProfileRankingLabel(ranking),
      streakLabel: xp.streakLabel,
      levelProgressLabel: gamification == null
          ? null
          : 'faltam ${gamification.xpForNextLevel} XP pro nível ${gamification.level + 1}',
      progress: gamification?.progressToNextLevel,
    ),
  );
}

Future<AthleteMatchDetail?> _resolveAthleteMatchDetail({
  required TournamentTeamsRepository teamsRepo,
  required UsersRepository usersRepo,
  required TournamentsRepository tournamentsRepo,
  required TournamentMatchesRepository matchRepo,
  required AthleteProfile? athleteProfile,
  required TournamentMatch match,
  required List<TournamentMatchPointEvent> pointEvents,
  required String uid,
}) async {
  final teamIds = await teamsRepo.teamIdsForAthlete(uid);

  final teamA = match.teamAId.trim();
  final teamB = match.teamBId.trim();
  final String? perspectiveTeamId;
  if (teamA.isNotEmpty && teamIds.contains(teamA)) {
    perspectiveTeamId = teamA;
  } else if (teamB.isNotEmpty && teamIds.contains(teamB)) {
    perspectiveTeamId = teamB;
  } else {
    perspectiveTeamId = null;
  }

  final idsToLoad = <String>{};
  if (perspectiveTeamId != null) {
    final opponent = match.opponentTeamIdFor(perspectiveTeamId);
    if (opponent != null && opponent.isNotEmpty) {
      idsToLoad.add(perspectiveTeamId);
      idsToLoad.add(opponent);
    } else if (perspectiveTeamId.isNotEmpty) {
      idsToLoad.add(perspectiveTeamId);
    }
  } else {
    if (teamA.isNotEmpty) idsToLoad.add(teamA);
    if (teamB.isNotEmpty) idsToLoad.add(teamB);
  }

  final teams = idsToLoad.isEmpty
      ? <String, TournamentTeam>{}
      : await teamsRepo.getTeamsByIds(idsToLoad);

  final userIds = <String>{};
  for (final team in teams.values) {
    if (team.player1Id.isNotEmpty) userIds.add(team.player1Id);
    if (team.player2Id.isNotEmpty) userIds.add(team.player2Id);
  }

  final profiles = <String, AppUserProfile>{};
  await Future.wait(
    userIds.map((id) async {
      final profile = await usersRepo.getUserById(id);
      if (profile != null) profiles[id] = profile;
    }),
  );

  final tournamentNames = await tournamentsRepo.getTournamentNames(
    {match.tournamentId},
  );

  final categoryLabel = await _categoryLabelForMatch(
    tournamentsRepo: tournamentsRepo,
    tournamentId: match.tournamentId,
    categoryId: match.categoryId,
    stageLabel: matchRoundLabel(match),
  );

  final displayNameOverrides = <String, String>{};
  if (athleteProfile != null && athleteProfile.id == uid) {
    final athleteName = athleteDisplayName(athleteProfile, fallback: '');
    final resolvedName =
        athleteName.isNotEmpty ? athleteName : null;
    if (resolvedName != null) {
      displayNameOverrides[uid] = resolvedName;
    }
  }

  final mapped = mapMatchToDetail(
    match: match,
    context: AthleteMatchDetailMapperContext(
      athleteUid: uid,
      perspectiveTeamId: perspectiveTeamId,
      tournamentName: tournamentNames[match.tournamentId] ?? 'Torneio',
      venueLabel: '',
      teams: teams,
      profiles: profiles,
      displayNameOverrides: displayNameOverrides,
      categoryLabelOverride: categoryLabel,
      pointEvents: pointEvents,
    ),
  );

  if (mapped == null) return null;

  var detail = mapped;
  if (mapped.isParticipantView) {
    final ourTeamId = mapped.ourTeam.teamId?.trim() ?? '';
    final opponentTeamId = mapped.opponentTeam.teamId?.trim() ?? '';
    if (ourTeamId.isNotEmpty && opponentTeamId.isNotEmpty &&
        _needsTeamHistoryEnrichment(mapped.phase)) {
      final history = await fetchMatchDetailTeamHistory(
        matchRepo: matchRepo,
        tournamentsRepo: tournamentsRepo,
        ourTeamId: ourTeamId,
        opponentTeamId: opponentTeamId,
      );
      final allTournamentNames = {
        ...tournamentNames,
        ...history.tournamentNames,
      };

      detail = mapped.copyWith(
        formRows: mapped.phase == MatchDetailPhase.scheduled
            ? buildMatchDetailFormRows(
                ourTeamMatches: history.ourTeamMatches,
                opponentTeamMatches: history.opponentTeamMatches,
                ourTeamId: ourTeamId,
                opponentTeamId: opponentTeamId,
                excludeMatchId: match.id,
                ourLabel: 'Você',
                opponentLabel: mapped.opponentTeam.label,
              )
            : mapped.formRows,
        headToHead: buildMatchDetailHeadToHeadInfo(
          ourTeamMatches: history.ourTeamMatches,
          opponentTeamMatches: history.opponentTeamMatches,
          ourTeamId: ourTeamId,
          opponentTeamId: opponentTeamId,
          excludeMatchId: match.id,
          opponentLabel: mapped.opponentTeam.label,
          phase: mapped.phase,
          tournamentNames: allTournamentNames,
        ),
        xpInfo: buildMatchDetailXpInfo(
          phase: mapped.phase,
          isParticipantView: mapped.isParticipantView,
          isWin: mapped.isWin,
          ourTeamMatches: history.ourTeamMatches,
          ourTeamId: ourTeamId,
          currentMatchId: match.id,
        ),
      );
    }
  }

  final share = buildMatchDetailShareInfo(detail) ?? detail.shareInfo;
  return detail.copyWith(shareInfo: share);
}

String? _participantRoleLabel(CompeteHubUserRanking? ranking) {
  final label = formatProfileRankingLabel(ranking);
  if (label == '—') return null;
  return 'VOCÊ • $label';
}

Future<String?> _categoryLabelForMatch({
  required TournamentsRepository tournamentsRepo,
  required String tournamentId,
  required String categoryId,
  required String stageLabel,
}) async {
  final catId = categoryId.trim();
  if (catId.isEmpty) return null;

  try {
    final details = await tournamentsRepo.getTournamentDetails({tournamentId});
    final tournament = details[tournamentId];
    if (tournament == null) return null;

    for (final offer in tournament.categoryOffers) {
      if (offer.id.trim() == catId) {
        final name = offer.name.trim();
        if (name.isEmpty) return null;
        final stage = stageLabel.trim();
        if (stage.isNotEmpty && !name.toLowerCase().contains(stage.toLowerCase())) {
          return '$name · $stage';
        }
        return name;
      }
    }
  } catch (_) {
    return null;
  }
  return null;
}

Stream<R> _combineLatest2<A, B, R>(
  Stream<A> streamA,
  Stream<B> streamB,
  R Function(A, B) combine,
) {
  final controller = StreamController<R>.broadcast();
  A? lastA;
  B? lastB;

  void emit() {
    final a = lastA;
    final b = lastB;
    if (a != null && b != null) {
      controller.add(combine(a, b));
    }
  }

  late final StreamSubscription<A> subA;
  late final StreamSubscription<B> subB;

  subA = streamA.listen(
    (value) {
      lastA = value;
      emit();
    },
    onError: controller.addError,
  );
  subB = streamB.listen(
    (value) {
      lastB = value;
      emit();
    },
    onError: controller.addError,
  );

  controller.onCancel = () async {
    await subA.cancel();
    await subB.cancel();
  };

  return controller.stream;
}
