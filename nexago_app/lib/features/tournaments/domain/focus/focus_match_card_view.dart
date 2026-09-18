import '../tournament_group_standings_logic.dart';
import '../tournament_match.dart';
import '../tournament_match_card_row.dart';
import '../tournament_match_display.dart';

/// O que o card de partida do Modo Focus mostra fora do que
/// [buildTournamentMatchRow] já resolve.
///
/// O card do Focus é OUTRO desenho: dupla à esquerda, placar no meio, dupla à
/// direita. Ele reaproveita o estado, os nomes e o lado do atleta do row
/// compartilhado, mas o centro e a linha de contexto são só dele — e por isso
/// moram aqui, puros e testáveis, em vez de dentro do widget.

/// `Q3` — a quadra como ela cabe na linha de contexto.
///
/// A linha carrega categoria, grupo e quadra; "Quadra 3" por extenso empurraria
/// a categoria para fora. Só abrevia quadra NUMERADA: "QCentral" não é
/// abreviação, é ruído, então nome próprio fica como está.
String focusMatchCourtShortLabel(TournamentMatch match) {
  final raw = match.courtName?.trim() ?? '';
  if (raw.isEmpty) return '';

  final numbered = RegExp(
    r'^(?:quadra\s*)?(\d+)$',
    caseSensitive: false,
  ).firstMatch(raw);
  if (numbered != null) return 'Q${numbered.group(1)}';

  return raw;
}

/// "Misto B · Grupo B · Q3" — de onde vem a partida.
///
/// [categoryName] só entra nas listas do torneio inteiro (seção Arena): numa
/// lista já recortada por categoria ela é redundante e rouba espaço do grupo.
///
/// Na fase de grupos usa o rótulo do POOL, e não [matchPhaseDisplayLabel], que
/// devolveria "FASE DE GRUPOS · GRUPO B" e empurraria a quadra para fora.
///
/// Preferir [focusMatchCardContextParts] no card: categoria sobe pra linha do
/// status e o restante (grupo/fase · quadra) fica embaixo.
String focusMatchCardContext({
  required TournamentMatch match,
  String categoryName = '',
}) {
  final parts = focusMatchCardContextParts(
    match: match,
    categoryName: categoryName,
  );
  return [
    if (parts.category.isNotEmpty) parts.category,
    if (parts.meta.isNotEmpty) parts.meta,
  ].join(' · ');
}

/// Partes do contexto do card: [category] na linha do status, [meta] embaixo.
({String category, String meta}) focusMatchCardContextParts({
  required TournamentMatch match,
  String categoryName = '',
}) {
  final phase = match.isPoolMatch
      ? poolLabelForId(match.poolId)
      : matchPhaseDisplayLabel(match);
  final court = focusMatchCourtShortLabel(match);

  return (
    category: categoryName.trim(),
    meta: [
      if (phase.isNotEmpty) phase,
      if (court.isNotEmpty) court,
    ].join(' · '),
  );
}

/// O centro do card: o número grande e a linha fina embaixo.
///
/// **Ao vivo o número grande é o PLACAR do set em andamento** (pontos), e os
/// sets vencidos ficam na linha de baixo — é o que o olho busca na Arena
/// ("como está esse jogo agora?"). Encerrada, o grande volta a ser o placar
/// da partida (sets) e as parciais ficam embaixo.
({String center, String? detail}) focusMatchCardScoreOf(
  TournamentMatch match,
  TournamentMatchRowState state,
) {
  final (setsA, setsB) = _closedSetsWonOf(match);

  return switch (state) {
    TournamentMatchRowState.live => _liveScoreOf(match, setsA, setsB),
    TournamentMatchRowState.done => (
        center: '$setsA-$setsB',
        detail: _closedDetailOf(match),
      ),
    TournamentMatchRowState.scheduled ||
    TournamentMatchRowState.tbd =>
      (center: 'vs', detail: null),
    // "vs" prometeria um jogo que não vai acontecer.
    TournamentMatchRowState.canceled => (center: '—', detail: null),
  };
}

({String center, String? detail}) _liveScoreOf(
  TournamentMatch match,
  int setsA,
  int setsB,
) {
  final live = matchLiveCurrentSet(match);
  if (live == null) {
    // Sem set aberto ainda (intervalo / WO parcial): só os sets vencidos.
    return (center: '$setsA-$setsB', detail: null);
  }
  return (
    center: '${live.a}-${live.b}',
    detail: 'SETS $setsA-$setsB',
  );
}

/// Sets vencidos contando SÓ os já fechados.
///
/// `setsWonCountForMatch` não serve ao centro deste card: ela varre todos os
/// sets e conta quem está na frente, então o set EM ANDAMENTO entra como
/// vencido — uma partida 1-0 com 14×11 no segundo aparecia como 2-0.
/// [matchClosedSets] aplica a régua de pontos que decide se o set acabou, e
/// numa partida encerrada devolve tudo, então o mesmo caminho serve aos dois
/// estados.
(int, int) _closedSetsWonOf(TournamentMatch match) {
  var a = 0;
  var b = 0;
  for (final set in matchClosedSets(match)) {
    if (set.a > set.b) {
      a++;
    } else if (set.b > set.a) {
      b++;
    }
  }
  return (a, b);
}

/// "21-14 · 21-18" — as parciais da partida encerrada.
String? _closedDetailOf(TournamentMatch match) {
  final sets = matchDisplaySets(match);
  if (sets.isEmpty) return null;
  return sets.map((s) => '${s.a}-${s.b}').join(' · ');
}
