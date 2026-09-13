import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';

import '../domain/tournament_match.dart';
import '../domain/tournament_match_card_players.dart';
import '../domain/tournament_match_card_view_model.dart';
import '../domain/tournament_team.dart';
import 'tournament_teams_repository.dart';

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

    final profiles = await _usersRepository.getUsersByIds(userIds);

    return matches
        .map(
          (match) => TournamentMatchCardViewModel(
            match: match,
            teamA: _teamViewModel(
              teamId: match.teamAId,
              description: match.teamADescription,
              fallback: 'Equipe A',
              teams: teams,
              profiles: profiles,
            ),
            teamB: _teamViewModel(
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
    return cards.first.teamA.displayName;
  }

  /// Resolve nomes exibíveis para IDs de equipe (classificação de grupos, ranking).
  Future<Map<String, String>> resolveTeamDisplayNames(
    Set<String> teamIds, {
    Map<String, String> descriptionsByTeamId = const {},
  }) async {
    if (teamIds.isEmpty) return const {};

    final teams = await _teamsRepository.getTeamsByIds(teamIds);
    final names = await resolveTeamDisplayNamesFromTeams(teams);

    for (final teamId in teamIds) {
      final id = teamId.trim();
      final existing = names[id]?.trim() ?? '';
      if (id.isEmpty || (existing.isNotEmpty && existing != id)) {
        continue;
      }
      final desc = safeMatchTeamDescription(descriptionsByTeamId[id]);
      if (desc != null) {
        names[id] = desc;
      }
    }

    return names;
  }

  /// Monta nomes a partir de documentos de equipe já carregados (ex.: inscrições).
  Future<Map<String, String>> resolveTeamDisplayNamesFromTeams(
    Map<String, TournamentTeam> teams,
  ) async {
    if (teams.isEmpty) return const {};

    final userIds = <String>{};
    for (final team in teams.values) {
      if (team.player1Id.isNotEmpty) userIds.add(team.player1Id);
      if (team.player2Id.isNotEmpty) userIds.add(team.player2Id);
    }

    final profiles = await _usersRepository.getUsersByIds(userIds);
    final names = <String, String>{};

    for (final entry in teams.entries) {
      final id = entry.key.trim();
      if (id.isEmpty) continue;
      final label = _pairLabel(entry.value, profiles);
      if (label.isNotEmpty && label != id) {
        names[id] = label;
      }
    }

    return names;
  }

  TournamentMatchCardTeamViewModel _teamViewModel({
    required String teamId,
    required String? description,
    required String fallback,
    required Map<String, TournamentTeam> teams,
    required Map<String, AppUserProfile> profiles,
  }) {
    final id = teamId.trim();
    if (id.isEmpty) {
      final safeDescription = safeMatchTeamDescription(description);
      return TournamentMatchCardTeamViewModel(
        displayName: safeDescription ?? fallback,
        players: playersFromDisplayName(safeDescription ?? fallback),
      );
    }

    final team = teams[id];
    if (team != null) {
      final label = _pairLabel(team, profiles);
      if (label.isNotEmpty) {
        return TournamentMatchCardTeamViewModel(
          displayName: label,
          players: playersFromTeam(team, profiles),
        );
      }
    }

    final desc = description?.trim();
    if (desc != null && desc.isNotEmpty) {
      final safeDescription = safeMatchTeamDescription(desc);
      if (safeDescription != null) {
        return TournamentMatchCardTeamViewModel(
          displayName: safeDescription,
          players: playersFromDisplayName(safeDescription),
        );
      }
    }

    return TournamentMatchCardTeamViewModel(
      displayName: id,
      players: const [],
    );
  }

  String _pairLabel(
    TournamentTeam team,
    Map<String, AppUserProfile> profiles,
  ) {
    final teamName = team.teamName?.trim();
    if (teamName != null && teamName.isNotEmpty) return teamName;

    final p1Profile = profiles[team.player1Id];
    final p2Profile = profiles[team.player2Id];
    final p1 = playerDisplayNameFor(p1Profile, team.player1Id);
    final p2 = playerDisplayNameFor(p2Profile, team.player2Id);

    if (team.isLookingForPartner) {
      if (p1.isNotEmpty) return p1;
      return '';
    }
    if (p1.isNotEmpty && p2.isNotEmpty && p1 != p2) return '$p1 / $p2';
    if (p1.isNotEmpty) return p1;
    if (p2.isNotEmpty) return p2;
    return '';
  }

}
