import '../../tournaments/domain/tournament_match.dart';
import '../../tournaments/domain/tournament_match_status.dart';

/// Próxima partida relevante para o atleta no dia do torneio.
class AthleteNextMatch {
  const AthleteNextMatch({
    required this.match,
    required this.tournamentId,
    required this.tournamentName,
    required this.isCourtCall,
  });

  final TournamentMatch match;
  final String tournamentId;
  final String tournamentName;

  /// `queueStatus == on_court` — chamada de quadra ativa.
  final bool isCourtCall;
}

/// Prioridade: chamada de quadra > ao vivo > agendada > fila.
int athleteMatchPriority(TournamentMatch match, String teamId) {
  final tid = teamId.trim();
  if (tid.isEmpty) return 99;
  final isMine =
      match.teamAId.trim() == tid || match.teamBId.trim() == tid;
  if (!isMine) return 99;
  if (match.queueStatus == 'on_court') return 0;
  if (TournamentMatchStatus.isInProgress(match.status)) return 1;
  if (match.scheduleTime != null) return 2;
  if (match.queueStatus == 'waiting') return 3;
  return 4;
}

/// Escolhe a melhor partida entre candidatos do atleta.
AthleteNextMatch? pickAthleteNextMatch({
  required List<TournamentMatch> matches,
  required String teamId,
  required String tournamentId,
  required String tournamentName,
}) {
  final mine = matches.where((m) {
    final tid = teamId.trim();
    return tid.isNotEmpty &&
        (m.teamAId.trim() == tid || m.teamBId.trim() == tid) &&
        !TournamentMatchStatus.isCompleted(m.status);
  }).toList();
  if (mine.isEmpty) return null;

  mine.sort((a, b) {
    final p = athleteMatchPriority(a, teamId).compareTo(
      athleteMatchPriority(b, teamId),
    );
    if (p != 0) return p;
    final aTime = a.scheduleTime;
    final bTime = b.scheduleTime;
    if (aTime != null && bTime != null) return aTime.compareTo(bTime);
    if (aTime != null) return -1;
    if (bTime != null) return 1;
    return a.queueOrder.compareTo(b.queueOrder);
  });

  final best = mine.first;
  return AthleteNextMatch(
    match: best,
    tournamentId: tournamentId,
    tournamentName: tournamentName,
    isCourtCall: best.queueStatus == 'on_court',
  );
}

/// Partida com chamada de quadra ativa para o time do atleta.
AthleteNextMatch? pickAthleteCourtCallMatch({
  required List<TournamentMatch> matches,
  required String teamId,
  required String tournamentId,
  required String tournamentName,
}) {
  for (final match in matches) {
    if (match.queueStatus != 'on_court') continue;
    final tid = teamId.trim();
    if (tid.isEmpty) continue;
    if (match.teamAId.trim() != tid && match.teamBId.trim() != tid) continue;
    return AthleteNextMatch(
      match: match,
      tournamentId: tournamentId,
      tournamentName: tournamentName,
      isCourtCall: true,
    );
  }
  return null;
}
