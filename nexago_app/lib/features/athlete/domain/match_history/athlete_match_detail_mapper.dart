import 'package:intl/intl.dart';

import '../../../tournaments/domain/app_user_profile.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_set.dart';
import '../../../tournaments/domain/tournament_team.dart';
import 'athlete_match_detail_models.dart';
import 'athlete_match_history_models.dart';

class AthleteMatchDetailMapperContext {
  const AthleteMatchDetailMapperContext({
    required this.athleteUid,
    required this.athleteTeamId,
    required this.tournamentName,
    required this.venueLabel,
    required this.teams,
    required this.profiles,
    this.displayNameOverrides = const {},
  });

  final String athleteUid;
  final String athleteTeamId;
  final String tournamentName;
  final String venueLabel;
  final Map<String, TournamentTeam> teams;
  final Map<String, AppUserProfile> profiles;
  final Map<String, String> displayNameOverrides;
}

AthleteMatchDetail? mapMatchToDetail({
  required TournamentMatch match,
  required AthleteMatchDetailMapperContext context,
}) {
  final opponentTeamId = match.opponentTeamIdFor(context.athleteTeamId);
  if (opponentTeamId == null) return null;

  final isWin = match.athleteTeamWon(context.athleteTeamId);
  final playedAt = playedAtForMatch(match);
  final sets = setsForMatch(match);

  return AthleteMatchDetail(
    id: match.id,
    tournamentId: match.tournamentId,
    result: isWin ? AthleteMatchResult.win : AthleteMatchResult.loss,
    resultBadgeLabel: isWin ? 'VITÓRIA' : 'DERROTA',
    ourTeam: _teamSide(
      teamId: context.athleteTeamId,
      description: safeMatchTeamDescription(
        match.teamAId == context.athleteTeamId
            ? match.teamADescription
            : match.teamBDescription,
      ),
      roleLabel: 'SUA DUPLA',
      athleteUid: context.athleteUid,
      teams: context.teams,
      profiles: context.profiles,
      displayNameOverrides: context.displayNameOverrides,
      isCurrentUser: true,
    ),
    opponentTeam: _teamSide(
      teamId: opponentTeamId,
      description: safeMatchTeamDescription(
        match.teamAId == opponentTeamId
            ? match.teamADescription
            : match.teamBDescription,
      ),
      roleLabel: 'ADVERSÁRIO',
      athleteUid: context.athleteUid,
      teams: context.teams,
      profiles: context.profiles,
      displayNameOverrides: context.displayNameOverrides,
    ),
    sets: _setScores(
      sets: sets,
      athleteTeamId: context.athleteTeamId,
      match: match,
    ),
    tournamentName: context.tournamentName,
    dateTimeLabel: playedAt != null
        ? DateFormat("d 'de' MMMM 'de' y · HH:mm", 'pt_BR').format(playedAt)
        : 'Data não informada',
    venueLabel: match.courtName?.trim().isNotEmpty == true
        ? match.courtName!.trim()
        : context.venueLabel,
    categoryLabel: match.categoryId,
    durationLabel: _durationLabel(match),
  );
}

MatchTeamSide _teamSide({
  required String teamId,
  required String? description,
  required String roleLabel,
  required String athleteUid,
  required Map<String, TournamentTeam> teams,
  required Map<String, AppUserProfile> profiles,
  Map<String, String> displayNameOverrides = const {},
  bool isCurrentUser = false,
}) {
  final team = teams[teamId];
  final players = <MatchTeamPlayer>[];
  if (team != null) {
    final playerIds = isCurrentUser
        ? _orderedPlayerIds(team: team, athleteUid: athleteUid)
        : [team.player1Id, team.player2Id];
    for (final playerId in playerIds) {
      if (playerId.isEmpty) continue;
      final profile = profiles[playerId];
      final name = resolveAppUserDisplayName(
        profile,
        override: displayNameOverrides[playerId],
      );
      players.add(
        MatchTeamPlayer(
          initials: profile != null ? appUserInitials(profile) : '?',
          avatarColor: playerId.hashCode,
          avatarUrl: profile?.profilePhotoUrl,
          name: name.isEmpty ? null : name,
        ),
      );
    }
  }

  final pairLabel = team != null
      ? _pairLabel(
          team,
          profiles,
          displayNameOverrides: displayNameOverrides,
        )
      : '';
  var label = pairLabel;
  if (label.isEmpty) label = description?.trim() ?? '';
  if (label.isEmpty && isCurrentUser) label = 'Minha dupla';
  if (label.isEmpty) label = teamId;

  return MatchTeamSide(
    players: players,
    label: label,
    roleLabel: roleLabel,
    isCurrentUser: isCurrentUser ||
        team?.containsPlayer(athleteUid) == true,
  );
}

List<String> _orderedPlayerIds({
  required TournamentTeam team,
  required String athleteUid,
}) {
  final uid = athleteUid.trim();
  if (uid.isNotEmpty && team.player2Id == uid) {
    return [team.player2Id, team.player1Id];
  }
  return [team.player1Id, team.player2Id];
}

String _pairLabel(
  TournamentTeam team,
  Map<String, AppUserProfile> profiles, {
  Map<String, String> displayNameOverrides = const {},
}) {
  final names = <String>[];
  for (final playerId in [team.player1Id, team.player2Id]) {
    if (playerId.isEmpty) continue;
    final name = resolveAppUserDisplayName(
      profiles[playerId],
      override: displayNameOverrides[playerId],
    );
    if (name.isNotEmpty) names.add(name);
  }
  if (names.length >= 2) return '${names[0]} / ${names[1]}';
  if (names.length == 1) return names[0];
  return '';
}

List<MatchSetScore> _setScores({
  required List<TournamentMatchSet> sets,
  required String athleteTeamId,
  required TournamentMatch match,
}) {
  return sets.asMap().entries.map((entry) {
    final set = entry.value;
    final isTeamA = match.teamAId.trim() == athleteTeamId.trim();
    return MatchSetScore(
      label: 'Set ${entry.key + 1}',
      ourScore: isTeamA ? set.a : set.b,
      opponentScore: isTeamA ? set.b : set.a,
    );
  }).toList();
}

String _durationLabel(TournamentMatch match) {
  final start = match.matchStartedAt;
  final end = match.matchEndedAt ?? playedAtForMatch(match);
  if (start == null || end == null) return '—';
  final minutes = end.difference(start).inMinutes;
  if (minutes <= 0) return '—';
  return '$minutes min';
}
