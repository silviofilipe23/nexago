import 'package:intl/intl.dart';

import '../../../ranking/domain/ranking_display_helpers.dart';
import '../../../tournaments/domain/app_user_profile.dart';
import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_display.dart';
import '../../../tournaments/domain/tournament_match_set.dart';
import '../../../tournaments/domain/tournament_match_status.dart';
import '../../../tournaments/domain/tournament_team.dart';
import 'athlete_match_detail_models.dart';
import 'athlete_match_history_models.dart';

class AthleteMatchDetailMapperContext {
  const AthleteMatchDetailMapperContext({
    required this.athleteUid,
    required this.perspectiveTeamId,
    required this.tournamentName,
    required this.venueLabel,
    required this.teams,
    required this.profiles,
    this.displayNameOverrides = const {},
    this.categoryLabelOverride,
  });

  final String athleteUid;
  /// Dupla do atleta logado; `null` = modo espectador (A vs B).
  final String? perspectiveTeamId;
  final String tournamentName;
  final String venueLabel;
  final Map<String, TournamentTeam> teams;
  final Map<String, AppUserProfile> profiles;
  final Map<String, String> displayNameOverrides;
  final String? categoryLabelOverride;
}

AthleteMatchDetail? mapMatchToDetail({
  required TournamentMatch match,
  required AthleteMatchDetailMapperContext context,
}) {
  final perspective = context.perspectiveTeamId?.trim();
  if (perspective != null && perspective.isNotEmpty) {
    return _mapParticipantDetail(match: match, context: context);
  }
  return _mapSpectatorDetail(match: match, context: context);
}

AthleteMatchDetail? _mapParticipantDetail({
  required TournamentMatch match,
  required AthleteMatchDetailMapperContext context,
}) {
  final athleteTeamId = context.perspectiveTeamId!.trim();
  final opponentTeamId = match.opponentTeamIdFor(athleteTeamId);
  if (opponentTeamId == null) return null;

  final isWin = match.athleteTeamWon(athleteTeamId);
  final perspectiveTeamId = athleteTeamId;

  return _buildDetail(
    match: match,
    context: context,
    isParticipantView: true,
    result: isWin ? AthleteMatchResult.win : AthleteMatchResult.loss,
    ourTeam: _teamSide(
      teamId: athleteTeamId,
      description: safeMatchTeamDescription(
        match.teamAId == athleteTeamId
            ? match.teamADescription
            : match.teamBDescription,
      ),
      roleLabel: 'VOCÊ',
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
      roleLabel: '#17',
      athleteUid: context.athleteUid,
      teams: context.teams,
      profiles: context.profiles,
      displayNameOverrides: context.displayNameOverrides,
    ),
    perspectiveTeamId: perspectiveTeamId,
    participantWin: isWin,
  );
}

AthleteMatchDetail _mapSpectatorDetail({
  required TournamentMatch match,
  required AthleteMatchDetailMapperContext context,
}) {
  final teamAId = match.teamAId.trim();
  final teamBId = match.teamBId.trim();
  final perspectiveTeamId = teamAId.isNotEmpty ? teamAId : match.teamAId;

  return _buildDetail(
    match: match,
    context: context,
    isParticipantView: false,
    result: AthleteMatchResult.loss,
    ourTeam: _teamSide(
      teamId: teamAId.isNotEmpty ? teamAId : 'team_a',
      description: safeMatchTeamDescription(match.teamADescription),
      roleLabel: 'DUPLA A',
      athleteUid: context.athleteUid,
      teams: context.teams,
      profiles: context.profiles,
      displayNameOverrides: context.displayNameOverrides,
    ),
    opponentTeam: _teamSide(
      teamId: teamBId.isNotEmpty ? teamBId : 'team_b',
      description: safeMatchTeamDescription(match.teamBDescription),
      roleLabel: 'DUPLA B',
      athleteUid: context.athleteUid,
      teams: context.teams,
      profiles: context.profiles,
      displayNameOverrides: context.displayNameOverrides,
    ),
    perspectiveTeamId: perspectiveTeamId,
    participantWin: false,
  );
}

AthleteMatchDetail _buildDetail({
  required TournamentMatch match,
  required AthleteMatchDetailMapperContext context,
  required bool isParticipantView,
  required AthleteMatchResult result,
  required MatchTeamSide ourTeam,
  required MatchTeamSide opponentTeam,
  required String perspectiveTeamId,
  required bool participantWin,
}) {
  final phase = _phaseFromMatch(match);
  final setsWon = _setsWonForPerspective(
    match,
    perspectiveTeamId,
    excludeSetIndex: phase == MatchDetailPhase.live
        ? match.currentSetIndex
        : null,
  );
  final rawSets = setsForMatch(match);
  final currentSetIdx = match.currentSetIndex;
  final setScores = _setScores(
    sets: rawSets,
    perspectiveTeamId: perspectiveTeamId,
    match: match,
    currentSetIndex: currentSetIdx,
    isLive: phase == MatchDetailPhase.live,
  );
  final timeline = _timelineFromSets(setScores);
  final scheduleTime = match.scheduleTime;
  final startsIn = _startsInMinutes(scheduleTime);
  final (currentOur, currentOpp) = _currentSetPoints(
    rawSets: rawSets,
    perspectiveTeamId: perspectiveTeamId,
    match: match,
    currentSetIndex: currentSetIdx,
  );

  return AthleteMatchDetail(
    id: match.id,
    tournamentId: match.tournamentId,
    phase: phase,
    result: result,
    resultBadgeLabel: _resultBadgeLabel(
      match: match,
      phase: phase,
      isParticipantView: isParticipantView,
      participantWin: participantWin,
      context: context,
    ),
    statusSubtitle: _statusSubtitle(match: match, phase: phase),
    stageLabel: _stageLabel(match),
    ourSetsWon: setsWon.$1,
    opponentSetsWon: setsWon.$2,
    ourTeam: ourTeam,
    opponentTeam: opponentTeam,
    sets: setScores,
    tournamentName: context.tournamentName,
    dateTimeLabel: _dateTimeLabel(
      phase == MatchDetailPhase.scheduled
          ? scheduleTime
          : playedAtForMatch(match),
    ),
    venueLabel: _venueLabel(match, context.venueLabel),
    categoryLabel:
        context.categoryLabelOverride?.trim().isNotEmpty == true
            ? context.categoryLabelOverride!.trim()
            : match.categoryId,
    durationLabel: _durationLabel(match),
    scheduleTime: scheduleTime,
    startsInMinutes: startsIn,
    scheduleSubtitle: _scheduleSubtitle(match, scheduleTime),
    currentSetIndex: currentSetIdx,
    currentSetOurPoints: currentOur,
    currentSetOpponentPoints: currentOpp,
    setTimelineItems: timeline,
    isParticipantView: isParticipantView,
    winnerTeamId: match.winnerId?.trim().isNotEmpty == true
        ? match.winnerId!.trim()
        : null,
    isMatchLive: phase == MatchDetailPhase.live,
  );
}

MatchDetailPhase _phaseFromMatch(TournamentMatch match) {
  if (TournamentMatchStatus.isCanceled(match.status)) {
    return MatchDetailPhase.canceled;
  }
  if (TournamentMatchStatus.isInProgress(match.status)) {
    return MatchDetailPhase.live;
  }
  if (TournamentMatchStatus.isCompleted(match.status)) {
    return MatchDetailPhase.completed;
  }
  return MatchDetailPhase.scheduled;
}

String _stageLabel(TournamentMatch match) {
  return matchRoundLabel(match).toUpperCase();
}

(int, int) _setsWonForPerspective(
  TournamentMatch match,
  String perspectiveTeamId, {
  int? excludeSetIndex,
}) {
  final rawSets = setsForMatch(match);
  var teamA = 0;
  var teamB = 0;
  for (var i = 0; i < rawSets.length; i++) {
    if (excludeSetIndex != null && i == excludeSetIndex) continue;
    final set = rawSets[i];
    if (set.a > set.b) {
      teamA++;
    } else if (set.b > set.a) {
      teamB++;
    }
  }
  final isTeamA = match.teamAId.trim() == perspectiveTeamId.trim();
  return isTeamA ? (teamA, teamB) : (teamB, teamA);
}

String _resultBadgeLabel({
  required TournamentMatch match,
  required MatchDetailPhase phase,
  required bool isParticipantView,
  required bool participantWin,
  required AthleteMatchDetailMapperContext context,
}) {
  if (phase == MatchDetailPhase.live) {
    return 'AO VIVO';
  }
  if (phase == MatchDetailPhase.scheduled) {
    final minutes = _startsInMinutes(match.scheduleTime);
    if (minutes != null && minutes > 0) {
      return 'AGENDADO • COMEÇA EM $minutes MIN';
    }
    return 'AGENDADO';
  }
  if (phase == MatchDetailPhase.completed) {
    if (isParticipantView) {
      return participantWin ? 'VOCÊ VENCEU' : 'VOCÊ PERDEU';
    }
    return _spectatorResultBadge(
      match: match,
      teams: context.teams,
      profiles: context.profiles,
      displayNameOverrides: context.displayNameOverrides,
    );
  }
  return matchStatusPillLabelPt(match.status);
}

String? _statusSubtitle({
  required TournamentMatch match,
  required MatchDetailPhase phase,
}) {
  if (phase != MatchDetailPhase.live) return null;
  final idx = match.currentSetIndex;
  if (idx != null && idx >= 0) {
    return 'Set ${idx + 1} em jogo';
  }
  final setCount = setsForMatch(match).length;
  if (setCount > 0) return 'Set $setCount em jogo';
  return 'Em andamento';
}

int? _startsInMinutes(DateTime? scheduleTime) {
  if (scheduleTime == null) return null;
  final diff = scheduleTime.difference(DateTime.now());
  if (diff.isNegative) return 0;
  return diff.inMinutes.clamp(0, 9999);
}

String? _scheduleSubtitle(TournamentMatch match, DateTime? scheduleTime) {
  if (scheduleTime == null) return null;
  final now = DateTime.now();
  final sameDay = scheduleTime.year == now.year &&
      scheduleTime.month == now.month &&
      scheduleTime.day == now.day;
  final dayPart = sameDay
      ? 'hoje'
      : DateFormat('EEE', 'pt_BR').format(scheduleTime).toLowerCase();
  final time = DateFormat('HH:mm', 'pt_BR').format(scheduleTime);
  final court = _venueLabel(match, '');
  final parts = [dayPart, time];
  if (court.isNotEmpty) parts.add(court);
  return parts.join(' • ');
}

(int?, int?) _currentSetPoints({
  required List<TournamentMatchSet> rawSets,
  required String perspectiveTeamId,
  required TournamentMatch match,
  required int? currentSetIndex,
}) {
  if (rawSets.isEmpty) return (null, null);
  final idx = currentSetIndex ?? (rawSets.length - 1);
  if (idx < 0 || idx >= rawSets.length) return (null, null);
  final set = rawSets[idx];
  final isTeamA = match.teamAId.trim() == perspectiveTeamId.trim();
  return (
    isTeamA ? set.a : set.b,
    isTeamA ? set.b : set.a,
  );
}

List<MatchSetTimelineItem> _timelineFromSets(List<MatchSetScore> sets) {
  return sets
      .map(
        (s) => MatchSetTimelineItem(
          label: s.label.toUpperCase(),
          description: '',
          ourScore: s.ourScore,
          opponentScore: s.opponentScore,
          isWin: s.isWin,
        ),
      )
      .toList();
}

String _spectatorResultBadge({
  required TournamentMatch match,
  required Map<String, TournamentTeam> teams,
  required Map<String, AppUserProfile> profiles,
  Map<String, String> displayNameOverrides = const {},
}) {
  if (match.isInProgress) {
    return matchStatusPillLabelPt(match.status);
  }

  final winner = match.winnerId?.trim() ?? '';
  if (winner.isNotEmpty && TournamentMatchStatus.isCompleted(match.status)) {
    final label = _teamDisplayLabel(
      teamId: winner,
      teams: teams,
      profiles: profiles,
      displayNameOverrides: displayNameOverrides,
      fallbackDescription: winner == match.teamAId.trim()
          ? match.teamADescription
          : match.teamBDescription,
    );
    if (label.isNotEmpty) return '$label VENCEU';
  }

  return matchStatusPillLabelPt(match.status);
}

String _teamDisplayLabel({
  required String teamId,
  required Map<String, TournamentTeam> teams,
  required Map<String, AppUserProfile> profiles,
  required String? fallbackDescription,
  Map<String, String> displayNameOverrides = const {},
}) {
  final team = teams[teamId];
  if (team != null) {
    final pair = _pairLabel(
      team,
      profiles,
      displayNameOverrides: displayNameOverrides,
    );
    if (pair.isNotEmpty) return pair;
  }
  final desc = fallbackDescription?.trim() ?? '';
  if (desc.isNotEmpty) return desc;
  return teamId;
}

String _dateTimeLabel(DateTime? at) {
  if (at == null) return 'Data não informada';
  return DateFormat("d 'de' MMMM 'de' y · HH:mm", 'pt_BR').format(at);
}

String _venueLabel(TournamentMatch match, String contextVenue) {
  final court = match.courtName?.trim();
  if (court != null && court.isNotEmpty) {
    return formatCourtLabelForCard(court);
  }
  return contextVenue;
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
          avatarColor: rankingAvatarColor(playerId).toARGB32(),
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
  if (label.isEmpty && teamId.isNotEmpty) label = teamId;

  return MatchTeamSide(
    players: players,
    label: label,
    roleLabel: roleLabel,
    isCurrentUser: isCurrentUser ||
        team?.containsPlayer(athleteUid) == true,
    teamId: teamId.isNotEmpty ? teamId : null,
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
  required String perspectiveTeamId,
  required TournamentMatch match,
  required int? currentSetIndex,
  required bool isLive,
}) {
  return sets.asMap().entries.map((entry) {
    final set = entry.value;
    final isTeamA = match.teamAId.trim() == perspectiveTeamId.trim();
    final isThird = entry.key == 2 && sets.length >= 3;
    final label = isThird ? 'Tie-break' : 'Set ${entry.key + 1}';
    return MatchSetScore(
      label: label,
      ourScore: isTeamA ? set.a : set.b,
      opponentScore: isTeamA ? set.b : set.a,
      isCurrentSet: isLive &&
          currentSetIndex != null &&
          entry.key == currentSetIndex,
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
