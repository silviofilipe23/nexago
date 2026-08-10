import 'package:intl/intl.dart';

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
  hoje('Hoje'),
  categorias('Categorias'),
  minhaInscricao('Minha inscrição'),
  palpites('Palpites');

  const TournamentDetailTab(this.label);

  final String label;
}

List<TournamentDetailTab> visibleTournamentDetailTabs({
  required bool hasMyMatchToday,
  required bool isRegistered,
  required bool hasDefinedMatchups,
}) {
  return [
    TournamentDetailTab.visaoGeral,
    if (hasMyMatchToday) TournamentDetailTab.hoje,
    TournamentDetailTab.categorias,
    if (isRegistered) TournamentDetailTab.minhaInscricao,
    if (hasDefinedMatchups) TournamentDetailTab.palpites,
  ];
}

/// Quem tem jogo hoje cai direto no "Hoje".
TournamentDetailTab defaultTournamentDetailTab(
  List<TournamentDetailTab> tabs,
) {
  return tabs.contains(TournamentDetailTab.hoje)
      ? TournamentDetailTab.hoje
      : TournamentDetailTab.visaoGeral;
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

bool _sameLocalDay(DateTime a, DateTime b) {
  final la = a.toLocal();
  final lb = b.toLocal();
  return la.year == lb.year && la.month == lb.month && la.day == lb.day;
}

int _byScheduleTime(TournamentMatch a, TournamentMatch b) {
  final at = a.scheduleTime;
  final bt = b.scheduleTime;
  if (at == null && bt == null) return a.matchNumber.compareTo(b.matchNumber);
  if (at == null) return 1;
  if (bt == null) return -1;
  return at.compareTo(bt);
}

/// Minhas partidas do dia de referência, em ordem cronológica — a timeline
/// "Seu dia no torneio".
List<TournamentMatch> myTournamentDayTimeline(
  List<TournamentMatch> matches,
  Set<String> myTeamIds,
  DateTime reference,
) {
  return matches
      .where(
        (m) =>
            (myTeamIds.contains(m.teamAId) || myTeamIds.contains(m.teamBId)) &&
            m.scheduleTime != null &&
            _sameLocalDay(m.scheduleTime!, reference),
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
