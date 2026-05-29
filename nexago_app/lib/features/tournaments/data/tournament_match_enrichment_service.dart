import '../domain/app_user_profile.dart';
import '../domain/tournament_match.dart';
import '../domain/tournament_match_card_view_model.dart';
import '../domain/tournament_team.dart';
import 'tournament_teams_repository.dart';
import 'users_repository.dart';

class TournamentMatchEnrichmentService {
  TournamentMatchEnrichmentService({
    required TournamentTeamsRepository teamsRepository,
    required UsersRepository usersRepository,
  })  : _teamsRepository = teamsRepository,
        _usersRepository = usersRepository;

  final TournamentTeamsRepository _teamsRepository;
  final UsersRepository _usersRepository;

  Future<List<TournamentMatchCardViewModel>> enrichMatches(
    List<TournamentMatch> matches,
  ) async {
    if (matches.isEmpty) return const [];

    final teamIds = <String>{};
    for (final match in matches) {
      if (match.teamAId.trim().isNotEmpty) teamIds.add(match.teamAId);
      if (match.teamBId.trim().isNotEmpty) teamIds.add(match.teamBId);
    }

    final teams = await _teamsRepository.getTeamsByIds(teamIds);
    final userIds = <String>{};
    for (final team in teams.values) {
      if (team.player1Id.isNotEmpty) userIds.add(team.player1Id);
      if (team.player2Id.isNotEmpty) userIds.add(team.player2Id);
    }

    final profiles = <String, AppUserProfile>{};
    await Future.wait(
      userIds.map((id) async {
        final profile = await _usersRepository.getUserById(id);
        if (profile != null) profiles[id] = profile;
      }),
    );

    return matches
        .map(
          (match) => TournamentMatchCardViewModel(
            match: match,
            teamADisplayName: _teamDisplayName(
              teamId: match.teamAId,
              description: match.teamADescription,
              fallback: 'Equipe A',
              teams: teams,
              profiles: profiles,
            ),
            teamBDisplayName: _teamDisplayName(
              teamId: match.teamBId,
              description: match.teamBDescription,
              fallback: 'Equipe B',
              teams: teams,
              profiles: profiles,
            ),
          ),
        )
        .toList();
  }

  Future<String> teamDisplayName({
    required String teamId,
    String? description,
    String fallback = 'Equipe',
  }) async {
    final cards = await enrichMatches([
      TournamentMatch(
        id: '',
        tournamentId: '',
        categoryId: '',
        round: 0,
        matchType: '',
        poolId: '',
        teamAId: teamId,
        teamBId: '',
        status: '',
        resultA: '',
        resultB: '',
        isGroupMatch: false,
        matchNumber: 0,
        teamADescription: description,
      ),
    ]);
    if (cards.isEmpty) {
      final desc = description?.trim();
      if (desc != null && desc.isNotEmpty) return desc;
      return teamId.trim().isNotEmpty ? teamId : fallback;
    }
    return cards.first.teamADisplayName;
  }

  String _teamDisplayName({
    required String teamId,
    required String? description,
    required String fallback,
    required Map<String, TournamentTeam> teams,
    required Map<String, AppUserProfile> profiles,
  }) {
    final id = teamId.trim();
    if (id.isEmpty) {
      final safeDescription = safeMatchTeamDescription(description);
      if (safeDescription != null) return safeDescription;
      return fallback;
    }

    final team = teams[id];
    if (team != null) {
      final label = _pairLabel(team, profiles);
      if (label.isNotEmpty) return label;
    }

    final desc = description?.trim();
    if (desc != null && desc.isNotEmpty) {
      final safeDescription = safeMatchTeamDescription(desc);
      if (safeDescription != null) return safeDescription;
    }
    return id;
  }

  String _pairLabel(
    TournamentTeam team,
    Map<String, AppUserProfile> profiles,
  ) {
    final p1Profile = profiles[team.player1Id];
    final p2Profile = profiles[team.player2Id];
    final p1 = resolveAppUserDisplayName(p1Profile);
    final p2 = resolveAppUserDisplayName(p2Profile);

    if (p1.isNotEmpty && p2.isNotEmpty) return '$p1 / $p2';
    if (p1.isNotEmpty) return p1;
    if (p2.isNotEmpty) return p2;
    return '';
  }
}
