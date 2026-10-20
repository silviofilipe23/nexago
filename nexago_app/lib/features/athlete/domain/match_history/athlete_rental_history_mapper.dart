import '../../../arenas/domain/booking_result.dart';
import '../../../arenas/domain/booking_result_record.dart';
import 'athlete_match_history_models.dart';

/// Placar de aluguel CONFIRMADO → linha da aba Partidas do Histórico, do ponto
/// de vista de [uid]. `null` se ainda não confirmado, sem data ou se [uid] não
/// está em time nenhum. Entra no Histórico (lista, mês e "Sua temporada");
/// ranking, Sand Rank, XP e os números do perfil seguem só com torneio.
AthleteMatchHistoryItem? rentalHistoryItem(
    SavedBookingResult saved, String uid) {
  if (!saved.isConfirmed) return null;
  final playedAt = saved.playedAt;
  final r = saved.result;
  final mine = r.teamOfPlayer(uid);
  if (playedAt == null || mine == null) return null;

  final (wins, losses) = rentalRecordOf(r, mine.id);
  final result = wins > losses
      ? AthleteMatchResult.win
      : (wins < losses ? AthleteMatchResult.loss : AthleteMatchResult.draw);
  final place = saved.courtName == null
      ? 'Aluguel · ${saved.arenaName}'
      : 'Aluguel · ${saved.arenaName} · ${saved.courtName}';

  if (r.isRotation) {
    final rank = r.standings.indexWhere((s) => s.team.id == mine.id) + 1;
    return AthleteMatchHistoryItem(
      id: saved.bookingId,
      playedAt: playedAt,
      result: result,
      opponentLabel: 'Rotação · ${r.teams.length} times',
      competitionLabel: place,
      scoreDisplay: '${wins}V ${losses}D',
      setsDisplay: '$rankº de ${r.teams.length} · ${r.games.length} jogos',
      source: AthleteMatchSource.rental,
    );
  }

  final other = r.teams.firstWhere((t) => t.id != mine.id);
  return AthleteMatchHistoryItem(
    id: saved.bookingId,
    playedAt: playedAt,
    result: result,
    opponentLabel: other.name,
    competitionLabel: place,
    // Mesmo formato do torneio: os sets do lado do atleta.
    scoreDisplay: [
      for (final g in r.games) '${g.scoreOf(mine.id)}-${g.scoreOf(other.id)}',
    ].join(', '),
    source: AthleteMatchSource.rental,
  );
}

/// Vitórias e derrotas do time [teamId] nos jogos em que ele entrou (sets com
/// dois times; jogos da rotação com três ou mais). Empate num jogo não conta.
(int, int) rentalRecordOf(BookingResult r, int teamId) {
  var wins = 0;
  var losses = 0;
  for (final g in r.games) {
    if (!g.involves(teamId) || g.winner == null) continue;
    if (g.winner == teamId) {
      wins++;
    } else {
      losses++;
    }
  }
  return (wins, losses);
}

/// Placares de aluguel que pedem atenção de [uid] no topo do Histórico:
/// confirmar (adversário), aguardando ou contestado (quem lançou). Mais
/// recentes primeiro.
List<SavedBookingResult> rentalResultsNeedingAttention(
  List<SavedBookingResult> all,
  String uid,
) {
  final out = [
    for (final s in all)
      if (s.awaitsResponseFrom(uid) || (s.createdBy == uid && !s.isConfirmed))
        s,
  ];
  out.sort((a, b) {
    final pa = a.playedAt;
    final pb = b.playedAt;
    if (pa == null || pb == null) return 0;
    return pb.compareTo(pa);
  });
  return out;
}

/// Linhas do Histórico dos placares de aluguel confirmados.
List<AthleteMatchHistoryItem> rentalHistoryItems(
  List<SavedBookingResult> all,
  String uid,
) =>
    [
      for (final s in all)
        if (rentalHistoryItem(s, uid) case final item?) item,
    ];
