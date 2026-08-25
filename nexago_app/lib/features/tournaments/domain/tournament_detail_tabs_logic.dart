import 'package:intl/intl.dart';

import '../../../core/time/nexago_event_timezone.dart';
import 'tournament_detail_model.dart';
import 'tournament_match.dart';
import 'tournament_match_status.dart';

/// Abas adaptativas do detalhe do torneio (porte de
/// `tournament-live.selectors.ts` do portal web): "Visão geral" e
/// "Categorias" são o esqueleto fixo; as outras só aparecem quando têm
/// conteúdo real. "Palpites" fica por último — é a aba de torcida — e NÃO
/// some quando o torneio acaba. Módulo puro, sem Flutter.

enum TournamentDetailTab {
  visaoGeral('Visão geral'),
  categorias('Categorias'),
  minhaInscricao('Minha inscrição'),
  palpites('Palpites');

  const TournamentDetailTab(this.label);

  final String label;
}

/// A aba "Hoje" foi aposentada em favor do Modo Focus — o dia do atleta virou
/// uma casca própria, fora destas abas. O sinal `hasMyMatchToday` continua
/// existindo no detalhe do torneio, mas agora decide o CARD de entrada do
/// Focus, não uma aba.
List<TournamentDetailTab> visibleTournamentDetailTabs({
  required bool isRegistered,
  required bool hasDefinedMatchups,
}) {
  return [
    TournamentDetailTab.visaoGeral,
    TournamentDetailTab.categorias,
    if (isRegistered) TournamentDetailTab.minhaInscricao,
    if (hasDefinedMatchups) TournamentDetailTab.palpites,
  ];
}

/// A entrada é sempre a visão geral: quem tem jogo hoje é levado ao Modo Focus
/// pela entrada automática, ou entra por ele pelo card de destaque.
TournamentDetailTab defaultTournamentDetailTab(
  List<TournamentDetailTab> tabs,
) {
  return TournamentDetailTab.visaoGeral;
}

/// Sub-visões da categoria — o segmentado que substitui abas Partidas/Chaves
/// (porte de `categoryViewsOf` do portal): "Grupos" só existe em categoria
/// com fase de grupos; "Partidas" só depois que o organizador publica os
/// jogos; "Chave" fica sempre — é onde a mensagem de "ainda não sorteada"
/// aparece.
enum TournamentCategoryView {
  partidas('Partidas'),
  grupos('Grupos'),
  chave('Chave');

  const TournamentCategoryView(this.label);

  final String label;
}

List<TournamentCategoryView> visibleCategoryViews({
  required bool hasMatches,
  required bool hasGroups,
}) {
  return [
    if (hasMatches) TournamentCategoryView.partidas,
    if (hasGroups) TournamentCategoryView.grupos,
    TournamentCategoryView.chave,
  ];
}

/// Sub-visão de entrada: os jogos quando existem, senão a chave.
TournamentCategoryView defaultCategoryView(
  List<TournamentCategoryView> views,
) {
  return views.isNotEmpty ? views.first : TournamentCategoryView.chave;
}

/// Existe ao menos um confronto definido? Antes disso não há em quem palpitar.
bool tournamentHasDefinedMatchups(List<TournamentMatch> matches) {
  return matches.any((m) => m.teamAId.isNotEmpty && m.teamBId.isNotEmpty);
}

/// O dia de um torneio é o do FUSO DO EVENTO, nunca o do aparelho: o atleta
/// que abre o app viajando (ou o jogo das 22h, que em UTC já é amanhã) tem que
/// ver o mesmo dia que a mesa e o organizador veem na arena.
bool _sameEventDay(DateTime a, DateTime b) =>
    nexagoEventDayKey(a) == nexagoEventDayKey(b);

int _byScheduleTime(TournamentMatch a, TournamentMatch b) {
  final at = a.scheduleTime;
  final bt = b.scheduleTime;
  if (at == null && bt == null) return a.matchNumber.compareTo(b.matchNumber);
  if (at == null) return 1;
  if (bt == null) return -1;
  return at.compareTo(bt);
}

/// Uma partida pertence ao dia de referência quando tem âncora de tempo nesse
/// dia — horário agendado OU início real —, ou quando não tem âncora nenhuma e
/// o torneio está rolando hoje.
///
/// As duas âncoras valem INDEPENDENTEMENTE, não em cascata: partida agendada
/// para ontem que só entrou em quadra hoje pertence a hoje também. Torneio que
/// atrasa e empurra jogo pro dia seguinte é rotina, e a versão em cascata
/// (`matchStartedAt` só quando não há `scheduleTime`) prenderia esse jogo no
/// dia em que ele não aconteceu.
///
/// Ter âncora de outro dia é resposta definitiva: quem tem horário ou início
/// fora do dia NÃO cai no caso do torneio rolando. Sem isso, a partida de
/// ontem reapareceria hoje em todo torneio que ocupa mais de um dia.
///
/// Sem âncora nenhuma exige partida em aberto: não existe evidência de que ela
/// pertence a hoje além da janela do torneio, e afirmar resultado de partida
/// sem dia conhecido é pior que omitir.
bool matchBelongsToDay(
  TournamentMatch match,
  DateTime reference, {
  required bool tournamentRunningToday,
}) {
  final scheduled = match.scheduleTime;
  final started = match.matchStartedAt;
  if (scheduled != null && _sameEventDay(scheduled, reference)) return true;
  if (started != null && _sameEventDay(started, reference)) return true;
  if (scheduled != null || started != null) return false;
  if (!tournamentRunningToday) return false;
  return !TournamentMatchStatus.isCompleted(match.status) &&
      !TournamentMatchStatus.isCanceled(match.status);
}

/// Minhas partidas do dia de referência, em ordem cronológica — a timeline
/// "Seu dia no torneio". As sem horário vão para o fim, por `matchNumber`
/// (ver [_byScheduleTime]).
///
/// [tournamentRunningToday] tem default `false` de propósito: preserva o
/// comportamento antigo para quem não sabe as datas do torneio.
List<TournamentMatch> myTournamentDayTimeline(
  List<TournamentMatch> matches,
  Set<String> myTeamIds,
  DateTime reference, {
  bool tournamentRunningToday = false,
}) {
  return matches
      .where(
        (m) =>
            (myTeamIds.contains(m.teamAId) || myTeamIds.contains(m.teamBId)) &&
            matchBelongsToDay(
              m,
              reference,
              tournamentRunningToday: tournamentRunningToday,
            ),
      )
      .toList()
    ..sort(_byScheduleTime);
}

/// Partidas em quadra agora, torneio inteiro.
List<TournamentMatch> liveTournamentMatches(List<TournamentMatch> matches) {
  return matches
      .where((m) => TournamentMatchStatus.isInProgress(m.status))
      .toList()
    ..sort(_byScheduleTime);
}

/// O que ainda vai entrar em quadra HOJE, torneio inteiro, na ordem em que a
/// arena vai chamar.
///
/// Complemento de [liveTournamentMatches]: o que já está em quadra tem lista
/// própria e por isso NÃO se repete aqui — a mesma partida nas duas listas
/// contaria duas vezes nos números da seção Arena.
///
/// Partida SEM horário entra (no fim, por `matchNumber`), pela mesma razão de
/// [matchBelongsToDay]: `dayKey` é apagado no desagendamento, e esconder quem
/// não tem horário esconderia justamente a fila do dia.
List<TournamentMatch> upcomingTournamentMatches(
  List<TournamentMatch> matches,
  DateTime reference, {
  required bool tournamentRunningToday,
}) {
  return matches
      .where(
        (m) =>
            !TournamentMatchStatus.isInProgress(m.status) &&
            !TournamentMatchStatus.isCompleted(m.status) &&
            !TournamentMatchStatus.isCanceled(m.status) &&
            matchBelongsToDay(
              m,
              reference,
              tournamentRunningToday: tournamentRunningToday,
            ),
      )
      .toList()
    ..sort(_byScheduleTime);
}

/// "Copa X — hoje" quando o evento está rolando (mesmo critério do portal).
bool tournamentIsEventToday(TournamentDetail tournament, DateTime now) {
  final start = tournament.startDate;
  final end = tournament.endDate ?? start;
  final from = DateTime(start.year, start.month, start.day);
  final to = DateTime(end.year, end.month, end.day, 23, 59, 59, 999);
  return !now.isBefore(from) && !now.isAfter(to);
}

/// "Sáb 09 ago · dia 2 de 3 · Arena, Cidade" — a linha de meta do cabeçalho.
String tournamentDetailHeroMeta(TournamentDetail tournament, DateTime now) {
  final parts = <String>[];
  final isToday = tournamentIsEventToday(tournament, now);
  final raw = DateFormat('EEE d MMM', 'pt_BR')
      .format(isToday ? now : tournament.startDate)
      .replaceAll('.', '');
  if (raw.isNotEmpty) {
    parts.add(raw[0].toUpperCase() + raw.substring(1));
  }

  final day = _dayOfEvent(tournament, now);
  if (day != null) parts.add('dia ${day.$1} de ${day.$2}');

  final place = [tournament.location, tournament.city]
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .join(', ');
  if (place.isNotEmpty) parts.add(place);

  return parts.join(' · ');
}

/// "dia 2 de 3" — só quando o torneio ocupa mais de um dia e está rolando.
(int, int)? _dayOfEvent(TournamentDetail tournament, DateTime now) {
  final start = tournament.startDate;
  final end = tournament.endDate;
  if (end == null) return null;
  final startDay = DateTime(start.year, start.month, start.day);
  final endDay = DateTime(end.year, end.month, end.day);
  final total = endDay.difference(startDay).inDays + 1;
  if (total <= 1) return null;
  if (!tournamentIsEventToday(tournament, now)) return null;
  final nowDay = DateTime(now.year, now.month, now.day);
  final current = nowDay.difference(startDay).inDays + 1;
  return (current, total);
}
