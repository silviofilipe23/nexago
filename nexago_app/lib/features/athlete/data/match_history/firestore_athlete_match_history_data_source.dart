import '../../../tournaments/data/tournament_match_enrichment_service.dart';
import '../../../tournaments/data/tournament_matches_repository.dart';
import '../../../tournaments/data/tournament_teams_repository.dart';
import '../../../tournaments/data/tournaments_repository.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import '../../domain/match_history/athlete_match_history_logic.dart';
import '../../domain/match_history/athlete_match_history_mapper.dart';
import '../../domain/match_history/athlete_match_history_models.dart';
import 'athlete_match_history_data_source.dart';

class FirestoreAthleteMatchHistoryDataSource
    implements AthleteMatchHistoryDataSource {
  FirestoreAthleteMatchHistoryDataSource({
    required TournamentTeamsRepository teamsRepository,
    required TournamentMatchesRepository matchesRepository,
    required TournamentsRepository tournamentsRepository,
    required TournamentMatchEnrichmentService enrichmentService,
  })  : _teamsRepository = teamsRepository,
        _matchesRepository = matchesRepository,
        _tournamentsRepository = tournamentsRepository,
        _enrichmentService = enrichmentService;

  final TournamentTeamsRepository _teamsRepository;
  final TournamentMatchesRepository _matchesRepository;
  final TournamentsRepository _tournamentsRepository;
  final TournamentMatchEnrichmentService _enrichmentService;

  @override
  Future<AthleteMatchHistoryBundle> fetchHistory(String uid) async {
    final athleteId = uid.trim();
    if (athleteId.isEmpty) {
      return _emptyBundle(DateTime.now().year);
    }

    final teamIds = await _teamsRepository.teamIdsForAthlete(athleteId);
    if (teamIds.isEmpty) {
      return _emptyBundle(DateTime.now().year);
    }

    final rawMatches = await _matchesRepository.getByTeamIds(teamIds);
    final completed = rawMatches
        .where((m) => TournamentMatchStatus.isCompleted(m.status))
        .toList()
      ..sort(compareMatchesChronologicallyDesc);

    if (completed.isEmpty) {
      return _emptyBundle(DateTime.now().year);
    }

    final tournamentIds =
        completed.map((m) => m.tournamentId).where((id) => id.isNotEmpty).toSet();
    final tournamentDetails =
        await _tournamentsRepository.getTournamentDetails(tournamentIds);
    final tournamentNames = {
      for (final entry in tournamentDetails.entries) entry.key: entry.value.name,
    };
    final tournamentMeta = {
      for (final entry in tournamentDetails.entries)
        entry.key: metaFromTournamentDetail(entry.value),
    };

    final opponentTeamIds = <String>{};
    for (final match in completed) {
      final athleteTeamId = _athleteTeamId(match, teamIds);
      if (athleteTeamId == null) continue;
      final opponentId = match.opponentTeamIdFor(athleteTeamId);
      if (opponentId != null && opponentId.isNotEmpty) {
        opponentTeamIds.add(opponentId);
      }
    }

    final teamDisplayNames = <String, String>{};
    for (final teamId in {...teamIds, ...opponentTeamIds}) {
      teamDisplayNames[teamId] = await _enrichmentService.teamDisplayName(
        teamId: teamId,
      );
    }

    final context = AthleteMatchHistoryMapperContext(
      athleteTeamIds: teamIds,
      tournamentNames: tournamentNames,
      teamDisplayNames: teamDisplayNames,
    );

    final historyItems = completed
        .map((m) => mapMatchToHistoryItem(match: m, context: context))
        .whereType<AthleteMatchHistoryItem>()
        .toList()
      ..sort((a, b) => b.playedAt.compareTo(a.playedAt));

    final tournaments = buildTournamentHistoryItems(
      matches: historyItems,
      rawMatches: completed,
      athleteTeamIds: teamIds,
      tournamentNames: tournamentNames,
      tournamentMeta: tournamentMeta,
    );

    final year = DateTime.now().year;
    final seasonSummary = buildSeasonSummary(
      matches: historyItems,
      year: year,
    );

    return AthleteMatchHistoryBundle(
      matches: historyItems,
      tournaments: tournaments,
      seasonSummary: seasonSummary,
    );
  }

  String? _athleteTeamId(TournamentMatch match, Set<String> teamIds) {
    if (teamIds.contains(match.teamAId)) return match.teamAId;
    if (teamIds.contains(match.teamBId)) return match.teamBId;
    return null;
  }

  AthleteMatchHistoryBundle _emptyBundle(int year) {
    return AthleteMatchHistoryBundle(
      matches: const [],
      tournaments: const [],
      seasonSummary: buildSeasonSummary(matches: const [], year: year),
    );
  }
}
