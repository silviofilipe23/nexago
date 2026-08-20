import '../tournament_group_standings_logic.dart';
import '../tournament_match.dart';
import '../tournament_match_display.dart';
import '../tournament_match_status.dart';

/// Views puras da experiência "acompanhar o dia": linha do tempo do atleta e a
/// leitura do grupo. Porte de `focus/focus-views.ts` do portal do atleta.
///
/// O que NÃO foi portado, de propósito:
/// - `standingsViewOf`/`lossesOf`: o app já tem `TournamentPoolStandingsRow`
///   com exatamente os mesmos campos, montada por `computePoolStandings`.
///   Portar seria uma segunda definição de classificação convivendo com a que
///   as outras telas usam.
/// - `nextMatchViewOf`/`liveRowsOf`: a próxima partida e as partidas ao vivo
///   são desenhadas pelo `TournamentMatchCard`, que já tem seu view model.

/// "1º", "2º"… A posição do atleta no grupo.
String ordinalOf(int position) => '$positionº';

enum TimelineState { done, live, next, upcoming }

enum TimelineOutcome { win, loss }

enum QualificationTone { win, neutral }

class TimelineEntry {
  const TimelineEntry({
    required this.matchId,
    required this.time,
    required this.title,
    required this.detail,
    required this.outcomeLabel,
    required this.outcome,
    required this.state,
    required this.note,
    required this.clickable,
  });

  final String matchId;

  /// `null` quando a partida ainda não tem horário — a UI desenha "—". Um
  /// rótulo vazio na coluna do relógio lê como bug, e essas partidas passaram
  /// a aparecer na lista do dia quando a regra deixou de exigir `scheduleTime`
  /// (ver `matchBelongsToDay`).
  final String? time;
  final String title;
  final String? detail;
  final String? outcomeLabel;
  final TimelineOutcome? outcome;
  final TimelineState state;
  final String? note;
  final bool clickable;
}

class QualificationNote {
  const QualificationNote({required this.tone, required this.text});

  final QualificationTone tone;
  final String text;
}

/// O que uma view do Focus precisa saber. É a camada de dados reduzida a
/// valores — a seção monta este objeto lendo os providers, e os testes montam
/// um literal. Sem isso as funções voltariam a depender de Riverpod e
/// deixariam de ser testáveis sem `ProviderContainer`.
class FocusViewContext {
  const FocusViewContext({
    required this.matches,
    required this.myTeamIds,
    required this.duoNameOf,
    required this.standingsOf,
    required this.nextMatch,
  });

  /// Partidas da CATEGORIA em foco, nunca do torneio inteiro. As derivações por
  /// grupo daqui filtram por `poolId`, que só é único DENTRO da categoria: os
  /// grupos são 'A', 'B', 'C'… em todas elas. Com a lista do torneio, o Grupo A
  /// do atleta vinha fundido com o Grupo A das outras categorias e um grupo de
  /// 4 duplas aparecia com 8 — foi um bug real do portal.
  final List<TournamentMatch> matches;
  final Set<String> myTeamIds;
  final String Function(String teamId, [String? fallback]) duoNameOf;
  final List<TournamentPoolStandingsRow> Function(String poolId) standingsOf;
  final TournamentMatch? nextMatch;
}

String? _sideOf(TournamentMatch m, Set<String> myTeamIds) {
  if (myTeamIds.contains(m.teamAId)) return 'A';
  if (myTeamIds.contains(m.teamBId)) return 'B';
  return null;
}

TimelineOutcome? _outcomeOf(TournamentMatch m, Set<String> myTeamIds) {
  if (_sideOf(m, myTeamIds) == null) return null;
  if (!TournamentMatchStatus.isCompleted(m.status)) return null;
  final winner = m.winnerId?.trim() ?? '';
  if (winner.isEmpty) return null;
  return myTeamIds.contains(winner)
      ? TimelineOutcome.win
      : TimelineOutcome.loss;
}

/// "2–0" sob a ótica do atleta: quantos sets ele venceu contra quantos perdeu.
/// O app não tinha equivalente do `setWinsLabelOf` do portal — `matchCardScoreLabel`
/// e `setsSummaryForAthleteTeam` desenham o placar por set, não a contagem.
String _mySetLine(TournamentMatch m, bool iAmA) {
  var mine = 0;
  var theirs = 0;
  for (final s in matchClosedSets(m)) {
    final my = iAmA ? s.a : s.b;
    final their = iAmA ? s.b : s.a;
    if (my > their) {
      mine++;
    } else if (their > my) {
      theirs++;
    }
  }
  return '$mine–$theirs';
}

bool _isPending(TournamentMatch m) =>
    !TournamentMatchStatus.isCompleted(m.status) &&
    !TournamentMatchStatus.isCanceled(m.status);

/// "decide a classificação do grupo" — verdadeiro sempre que a partida é da
/// última rodada ainda em aberto. Não promete posição específica: isso
/// dependeria de simular os critérios de desempate.
String? _noteOf(FocusViewContext ctx, TournamentMatch m) {
  if (m.poolId.isEmpty || TournamentMatchStatus.isCompleted(m.status)) {
    return null;
  }
  final rounds = ctx.matches
      .where((other) => other.poolId == m.poolId)
      .map((other) => other.round)
      .toSet()
      .toList()
    ..sort();
  if (rounds.isEmpty) return null;
  return rounds.last == m.round ? 'decide a classificação do grupo' : null;
}

/// "1º do grupo · 2V 0D".
String? standingLineOf(FocusViewContext ctx, String teamId, String poolId) {
  if (teamId.isEmpty || poolId.isEmpty) return null;
  final rows = ctx.standingsOf(poolId);
  final index = rows.indexWhere((s) => s.teamId == teamId);
  if (index < 0) return null;
  final row = rows[index];
  return '${ordinalOf(index + 1)} do grupo · ${row.wins}V ${row.losses}D';
}

/// A ordem do dia do atleta, já formatada.
List<TimelineEntry> timelineOf(
  FocusViewContext ctx,
  List<TournamentMatch> dayTimeline,
) {
  final myTeamIds = ctx.myTeamIds;
  final nextId = ctx.nextMatch?.id;

  return dayTimeline.map((m) {
    final outcome = _outcomeOf(m, myTeamIds);
    final side = _sideOf(m, myTeamIds);
    final iAmA = side == 'A';
    final opponentId = iAmA ? m.teamBId : m.teamAId;
    final opponentDescription = iAmA ? m.teamBDescription : m.teamADescription;
    final live = TournamentMatchStatus.isInProgress(m.status);
    final done = TournamentMatchStatus.isCompleted(m.status);

    final title = [
      matchNumberLabelForCard(m),
      matchPhaseDisplayLabel(m, categoryMatches: ctx.matches),
      'vs ${ctx.duoNameOf(opponentId, opponentDescription)}',
      matchCourtLabelForCard(m),
    ].where((p) => p.trim().isNotEmpty).join(' · ');

    return TimelineEntry(
      matchId: m.id,
      time: m.scheduleTime != null ? matchTimeLabelForCard(m) : null,
      title: title,
      detail: done || live
          ? setPartialsLabelForTeam(match: m, isTeamA: iAmA)
          : null,
      outcomeLabel: outcome == null
          ? null
          : '${outcome == TimelineOutcome.win ? 'V' : 'D'} '
              '${_mySetLine(m, iAmA)}',
      outcome: outcome,
      state: done
          ? TimelineState.done
          : live
              ? TimelineState.live
              : m.id == nextId
                  ? TimelineState.next
                  : TimelineState.upcoming,
      note: _noteOf(ctx, m),
      clickable: m.teamAId.isNotEmpty && m.teamBId.isNotEmpty,
    );
  }).toList();
}

/// A situação do atleta no grupo, em uma frase.
///
/// Deliberadamente conservador: só afirma classificação quando TODAS as
/// partidas do grupo acabaram. Antes disso, dizer "você já está classificado"
/// exigiria simular cenário a cenário com os critérios de desempate — e errar
/// isso num app de torneio é pior do que informar a posição parcial.
QualificationNote? qualificationNoteOf(
  FocusViewContext ctx,
  String poolId,
  int qualifiersPerGroup,
  String? myTeamId,
) {
  final teamId = myTeamId?.trim() ?? '';
  if (poolId.isEmpty || teamId.isEmpty) return null;

  final rows = ctx.standingsOf(poolId);
  final index = rows.indexWhere((s) => s.teamId == teamId);
  if (index < 0) return null;

  final rank = index + 1;
  final qualifies = index < qualifiersPerGroup;
  final remaining =
      ctx.matches.where((m) => m.poolId == poolId && _isPending(m)).length;

  if (remaining == 0) {
    return qualifies
        ? QualificationNote(
            tone: QualificationTone.win,
            text: 'Grupo encerrado em ${ordinalOf(rank)}. '
                'Você avançou para o mata-mata.',
          )
        : QualificationNote(
            tone: QualificationTone.neutral,
            text: 'Grupo encerrado em ${ordinalOf(rank)}. '
                'Passavam os $qualifiersPerGroup primeiros.',
          );
  }

  final falta = remaining == 1
      ? 'Falta 1 partida no grupo'
      : 'Faltam $remaining partidas no grupo';
  return QualificationNote(
    tone: QualificationTone.neutral,
    text: 'Você está em ${ordinalOf(rank)}. $falta — '
        'avançam os $qualifiersPerGroup primeiros.',
  );
}
