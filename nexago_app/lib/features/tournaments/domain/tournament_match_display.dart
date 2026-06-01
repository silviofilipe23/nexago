import 'package:intl/intl.dart';

import 'tournament_match.dart';
import 'tournament_match_set.dart';
import 'tournament_match_status.dart';

String matchStatusPillLabelPt(String status) {
  if (TournamentMatchStatus.isInProgress(status)) return 'AO VIVO';
  if (TournamentMatchStatus.isCompleted(status)) return 'FINALIZADO';
  if (TournamentMatchStatus.isCanceled(status)) return 'CANCELADO';
  return 'AGENDADO';
}

DateTime? playedAtForMatch(TournamentMatch match) =>
    match.matchEndedAt ?? match.scheduleTime;

DateTime? matchTimeForCard(TournamentMatch match) {
  if (match.isInProgress) {
    return match.matchStartedAt ?? match.scheduleTime;
  }
  if (match.isCompleted) {
    return match.matchEndedAt ?? match.matchStartedAt ?? match.scheduleTime;
  }
  return match.scheduleTime;
}

String matchTimeLabelForCard(
  TournamentMatch match, {
  DateTime? reference,
}) {
  final time = matchTimeForCard(match);
  if (time == null) return '';

  final now = reference ?? DateTime.now();
  final sameDay = time.year == now.year &&
      time.month == now.month &&
      time.day == now.day;
  if (sameDay) {
    return DateFormat('HH:mm', 'pt_BR').format(time);
  }
  return DateFormat('dd/MM · HH:mm', 'pt_BR').format(time);
}

String matchNumberLabelForCard(TournamentMatch match) {
  if (match.matchNumber <= 0) return '';
  return 'Jogo #${match.matchNumber}';
}

String matchCourtLabelForCard(TournamentMatch match) {
  return formatCourtLabelForCard(match.courtName);
}

/// Normaliza o nome da quadra para exibição (`1` → `Quadra 1`).
String formatCourtLabelForCard(String? courtName) {
  final court = courtName?.trim() ?? '';
  if (court.isEmpty) return '';
  if (RegExp(r'quadra', caseSensitive: false).hasMatch(court)) {
    return court;
  }
  return 'Quadra $court';
}

/// Metadados do topo do card (`Jogo #2 · Quadra 1`).
String matchMetaLabelForCard(TournamentMatch match) {
  final parts = <String>[];
  final numberLabel = matchNumberLabelForCard(match);
  if (numberLabel.isNotEmpty) parts.add(numberLabel);
  final courtLabel = matchCourtLabelForCard(match);
  if (courtLabel.isNotEmpty) parts.add(courtLabel);
  return parts.join(' · ');
}

List<TournamentMatchSet> setsForMatch(TournamentMatch match) {
  if (match.sets.isNotEmpty) return match.sets;
  return parseSetsFromResultStrings(match.resultA, match.resultB);
}

List<TournamentMatchSet> parseSetsFromResultStrings(
  String resultA,
  String resultB,
) {
  final aParts = resultA.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty);
  final bParts = resultB.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty);
  final aList = aParts.toList();
  final bList = bParts.toList();
  if (aList.isEmpty && bList.isEmpty) return const [];

  final count = aList.length > bList.length ? aList.length : bList.length;
  final sets = <TournamentMatchSet>[];
  for (var i = 0; i < count; i++) {
    final parsedA = _parseSetScore(aList.length > i ? aList[i] : '');
    final parsedB = _parseSetScore(bList.length > i ? bList[i] : '');
    if (parsedA == null && parsedB == null) continue;
    sets.add(
      TournamentMatchSet(
        a: parsedA?.$1 ?? parsedB?.$2 ?? 0,
        b: parsedA?.$2 ?? parsedB?.$1 ?? 0,
      ),
    );
  }
  return sets;
}

(int, int)? _parseSetScore(String raw) {
  final parts = raw.split('-');
  if (parts.length != 2) return null;
  final a = int.tryParse(parts[0].trim());
  final b = int.tryParse(parts[1].trim());
  if (a == null || b == null) return null;
  return (a, b);
}

String scoreDisplayForAthleteTeam({
  required TournamentMatch match,
  required String athleteTeamId,
}) {
  final sets = setsForMatch(match);
  if (sets.isEmpty) {
    if (match.resultA.isNotEmpty) return match.resultA;
    return '—';
  }

  final isTeamA = match.teamAId.trim() == athleteTeamId.trim();
  return sets
      .map((s) => isTeamA ? '${s.a}-${s.b}' : '${s.b}-${s.a}')
      .join(', ');
}

/// Parciais de cada set só com os pontos da equipe (`21 · 12 · 16`).
String setPartialsLabelForTeam({
  required TournamentMatch match,
  required bool isTeamA,
}) {
  final sets = setsForMatch(match);
  if (sets.isNotEmpty) {
    return sets
        .map((s) => isTeamA ? '${s.a}' : '${s.b}')
        .join(' · ');
  }

  final raw = (isTeamA ? match.resultA : match.resultB).trim();
  if (raw.isEmpty) return '';
  if (raw.contains(',')) {
    return raw
        .split(',')
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .map(teamOwnScoreFromSetPartial)
        .join(' · ');
  }
  if (raw.contains('-')) {
    return teamOwnScoreFromSetPartial(raw);
  }
  return '';
}

/// Extrai só os pontos da equipe de um parcial (`21-0` → `21`).
String teamOwnScoreFromSetPartial(String partial) {
  final dash = partial.indexOf('-');
  if (dash <= 0) return partial.trim();
  return partial.substring(0, dash).trim();
}

String setsSummaryForAthleteTeam({
  required TournamentMatch match,
  required String athleteTeamId,
}) {
  final sets = setsForMatch(match);
  if (sets.length <= 1) return '';
  return sets
      .asMap()
      .entries
      .map((e) {
        final s = e.value;
        final isTeamA = match.teamAId.trim() == athleteTeamId.trim();
        final ours = isTeamA ? s.a : s.b;
        final theirs = isTeamA ? s.b : s.a;
        return 'Set ${e.key + 1}: $ours-$theirs';
      })
      .join(' · ');
}

String matchCardScoreLabel(TournamentMatch match) {
  final sets = setsForMatch(match);
  if (sets.isNotEmpty) {
    final a = sets.map((s) => '${s.a}-${s.b}').join(', ');
    return a;
  }
  if (match.resultA.isNotEmpty) return match.resultA;
  if (match.isInProgress) return '0-0';
  return 'A definir';
}

/// Sets vencidos por cada time (A, B).
(int, int) setsWonCountForMatch(TournamentMatch match) {
  var teamA = 0;
  var teamB = 0;
  for (final set in setsForMatch(match)) {
    if (set.a > set.b) {
      teamA++;
    } else if (set.b > set.a) {
      teamB++;
    }
  }
  return (teamA, teamB);
}

bool matchHasScoreData(TournamentMatch match) =>
    setsForMatch(match).isNotEmpty || match.isInProgress;

/// `null` quando não há vencedor definido (empate, agendado ou sem sets).
bool? matchTeamAWon(TournamentMatch match) {
  final winner = match.winnerId?.trim() ?? '';
  if (winner.isNotEmpty) {
    final teamAId = match.teamAId.trim();
    final teamBId = match.teamBId.trim();
    if (teamAId.isNotEmpty && winner == teamAId) return true;
    if (teamBId.isNotEmpty && winner == teamBId) return false;
  }

  final sets = setsForMatch(match);
  if (sets.isEmpty) return null;

  final counts = setsWonCountForMatch(match);
  if (counts.$1 > counts.$2) return true;
  if (counts.$2 > counts.$1) return false;
  return null;
}

bool isMatchTeamWinner(TournamentMatch match, {required bool isTeamA}) {
  final teamAWon = matchTeamAWon(match);
  if (teamAWon == null) return false;
  return isTeamA ? teamAWon : !teamAWon;
}

int compareMatchesChronologicallyDesc(TournamentMatch a, TournamentMatch b) {
  final aDate = playedAtForMatch(a);
  final bDate = playedAtForMatch(b);
  if (aDate == null && bDate == null) {
    return b.matchNumber.compareTo(a.matchNumber);
  }
  if (aDate == null) return 1;
  if (bDate == null) return -1;
  return bDate.compareTo(aDate);
}

/// Rótulo PT do `matchType` (paridade com web `matchTypeLabelPt`).
String matchTypeLabelPt(String? matchType) {
  final type = matchType?.trim() ?? '';
  if (type.isEmpty) return '';
  return switch (type) {
    'Group' => 'Fase de Grupos',
    'WB' => 'Chave Principal',
    'LB' => 'Chave de Repescagem',
    'Final' => 'Final',
    'Third Place' => 'Disputa 3º lugar',
    'Semi-Final' => 'Semifinais',
    'Quarter-Final' => 'Quartas de final',
    'Round of 16' => 'Oitavas de final',
    'Round of 32' => '32 avos de final',
    'Other' => 'Partida',
    _ => type,
  };
}

/// Fase/rodada exibida a partir dos campos da partida (`matchType`, `description`, `round`).
String matchRoundLabel(TournamentMatch match) {
  final type = match.matchType.trim();

  if (type == 'WB') {
    return match.round > 0 ? 'WB${match.round}' : matchTypeLabelPt(type);
  }
  if (type == 'LB') {
    return match.round > 0 ? 'LB${match.round}' : matchTypeLabelPt(type);
  }
  if (type == 'Final') return 'Final';
  if (type == 'Third Place') return '3º lugar';

  final typeLabel = matchTypeLabelPt(type);
  if (type.isNotEmpty && typeLabel != type) return typeLabel;
  if (type.isNotEmpty) return type;

  final desc = match.description?.trim();
  if (desc != null && desc.isNotEmpty) return desc;

  if (match.round > 0) return 'Rodada ${match.round}';
  return 'Eliminatórias';
}

String bracketRoundGroupLabel(List<TournamentMatch> matches) {
  if (matches.isEmpty) return '';
  final sorted = [...matches]
    ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
  return matchRoundLabel(sorted.first);
}
