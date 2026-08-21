import '../../tournaments/domain/tournament_detail_tabs_logic.dart';
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

/// Escolhe a melhor partida do atleta NO DIA [today].
///
/// O filtro de dia não é detalhe: sem ele qualquer partida aberta do atleta
/// virava alvo, e a oferta do Modo Focus abria dizendo "Hoje é dia de torneio"
/// com o horário de um jogo semanas à frente. Aconteceu de verdade — o
/// "Torneio 5cat seed nexaGO" do DEV corre de 20 a 23/08 e tem partidas
/// marcadas para 03/09.
///
/// A regra do dia é a MESMA da lista "Seu dia no torneio"
/// ([matchBelongsToDay]), de propósito: o que o atleta vê na timeline e o que
/// dispara a oferta não podem discordar. Em particular, partida SEM horário
/// continua contando — `dayKey` é apagado no desagendamento, e a janela do
/// torneio é a única âncora que sobra para quem está na fila do dia.
///
/// [today] é um instante qualquer do dia; a comparação acontece no fuso do
/// evento. A função pressupõe que o torneio está rolando nesse dia — quem
/// chama já filtrou por inscrição paga em evento de hoje.
///
/// Chamada de quadra com horário de OUTRO dia fica de fora aqui (âncora de
/// outro dia é resposta definitiva). Ela não se perde: o alerta ao vivo vem de
/// [pickAthleteCourtCallMatch], que não filtra por dia.
AthleteNextMatch? pickAthleteNextMatch({
  required List<TournamentMatch> matches,
  required String teamId,
  required String tournamentId,
  required String tournamentName,
  required DateTime today,
}) {
  final mine = matches.where((m) {
    final tid = teamId.trim();
    return tid.isNotEmpty &&
        (m.teamAId.trim() == tid || m.teamBId.trim() == tid) &&
        !TournamentMatchStatus.isCompleted(m.status) &&
        matchBelongsToDay(m, today, tournamentRunningToday: true);
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
