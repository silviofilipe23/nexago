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

/// "2h15" / "45min" — a parte de duração da contagem.
String _hoursMinutes(int minutes) {
  final h = minutes ~/ 60;
  final m = minutes % 60;
  return m == 0 ? '${h}h' : '${h}h${m.toString().padLeft(2, '0')}';
}

/// "42:18" — o que falta até o horário, como relógio. Acima de uma hora entra
/// a hora inteira ("1:02:30"). `null` quando não há horário ou o horário já
/// passou: contagem negativa não diz nada ao atleta, e o atraso é dito em
/// palavras por [countdownLabelOf].
String? countdownClockOf(DateTime? target, DateTime now) {
  if (target == null) return null;
  final diff = target.difference(now);
  if (diff.isNegative) return null;
  final total = diff.inSeconds;
  final h = total ~/ 3600;
  final m = (total % 3600) ~/ 60;
  final sec = total % 60;
  final mm = m.toString().padLeft(2, '0');
  final ss = sec.toString().padLeft(2, '0');
  return h > 0 ? '$h:$mm:$ss' : '$mm:$ss';
}

/// "começa em 40 min" / "começa em 2h15" / "atrasada 30 min".
///
/// Partida que já passou do horário vira ATRASO, não contagem negativa: num
/// torneio o atraso é a regra, e "começa em -30 min" não diz nada ao atleta.
String? countdownLabelOf(DateTime? target, DateTime now) {
  if (target == null) return null;
  final diff = target.difference(now);
  final minutes = (diff.inSeconds.abs() / 60).round();
  if (minutes < 1) return 'começa agora';
  final label = minutes < 60 ? '$minutes min' : _hoursMinutes(minutes);
  return diff.isNegative ? 'atrasada $label' : 'começa em $label';
}

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

/// Uma dupla no herói do "Agora". Carrega só texto: os avatares vêm do
/// `TournamentMatchCardViewModel` no widget, para este módulo seguir puro (sem
/// `dart:ui`) e para não existir uma segunda regra de iniciais/foto.
class DuoView {
  const DuoView({
    required this.teamId,
    required this.name,
    required this.isMe,
    required this.standingLine,
  });

  final String teamId;
  final String name;
  final bool isMe;

  /// "1º do grupo · 2V 0D" — só existe em partida de fase de grupos.
  final String? standingLine;
}

/// O herói do "Agora", já formatado.
class NextMatchView {
  const NextMatchView({
    required this.matchId,
    required this.kicker,
    required this.numberLabel,
    required this.timeLabel,
    required this.countdown,
    required this.courtLabel,
    required this.bestOfLabel,
    required this.formatLabel,
    required this.countdownClock,
    required this.checkedIn,
    required this.live,
    required this.liveScoreLine,
    required this.sideA,
    required this.sideB,
  });

  final String matchId;
  final String kicker;

  /// "Jogo #12" — por extenso, porque no chip ele aparece sozinho, diferente da
  /// linha do card onde o `#12` já se explica pelo contexto.
  final String? numberLabel;
  final String timeLabel;
  final String? countdown;
  final String? courtLabel;
  final String bestOfLabel;

  /// "MD3 · 21 PTS" — o formato completo, do jeito que o chip do protótipo
  /// mostra. Os pontos vêm da mesma constante que decide se um set acabou.
  final String formatLabel;

  /// "42:18" — a contagem regressiva como relógio, que é o elemento maior do
  /// herói. `null` quando não há horário ou a partida já começou.
  final String? countdownClock;
  final bool checkedIn;
  final bool live;
  final String? liveScoreLine;
  final DuoView sideA;
  final DuoView sideB;
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

/// "1º · 2V 0D" — a posição e o cartel da dupla no grupo.
///
/// Compacto de propósito: no herói do "Agora" esta linha fica sob o nome da
/// dupla, ao lado da linha do adversário, e "do grupo" repetido dos dois lados
/// só rouba largura no celular (é o formato dos protótipos).
String? standingLineOf(FocusViewContext ctx, String teamId, String poolId) {
  if (teamId.isEmpty || poolId.isEmpty) return null;
  final rows = ctx.standingsOf(poolId);
  final index = rows.indexWhere((s) => s.teamId == teamId);
  if (index < 0) return null;
  final row = rows[index];
  return '${ordinalOf(index + 1)} · ${row.wins}V ${row.losses}D';
}

/// Quanto do intervalo entre o fim da partida ANTERIOR do atleta e o horário da
/// próxima já passou, de 0 a 1 — a barra que acompanha a contagem regressiva.
///
/// Ancorada no fim do jogo anterior, e não numa janela fixa: é o intervalo que
/// o atleta realmente está vivendo. Sem partida anterior encerrada (o primeiro
/// jogo do dia) NÃO há intervalo a medir, e a função devolve `null` — a barra
/// some, em vez de fingir um progresso a partir de uma origem inventada.
double? focusCountdownProgress({
  required DateTime? previousEndedAt,
  required DateTime? scheduleTime,
  required DateTime now,
}) {
  if (previousEndedAt == null || scheduleTime == null) return null;
  final total = scheduleTime.difference(previousEndedAt).inSeconds;
  if (total <= 0) return null;
  final elapsed = now.difference(previousEndedAt).inSeconds;
  return (elapsed / total).clamp(0.0, 1.0);
}

/// "21-15 · 2º set 12-9" — o placar de quem está em quadra. `null` fora do ao
/// vivo.
String? liveScoreLineOf(TournamentMatch m) {
  if (!TournamentMatchStatus.isInProgress(m.status)) return null;
  final current = matchLiveCurrentSet(m);
  if (current == null) return null;
  var setsA = 0;
  var setsB = 0;
  for (final s in matchClosedSets(m)) {
    if (s.a > s.b) {
      setsA++;
    } else if (s.b > s.a) {
      setsB++;
    }
  }
  return '$setsA–$setsB · ${current.setNumber}º set ${current.a}-${current.b}';
}

/// "Sua próxima partida · Grupo A · Rodada 2".
String _kickerOf(FocusViewContext ctx, TournamentMatch m) {
  final parts = <String>[
    'Sua próxima partida',
    matchPhaseDisplayLabel(m, categoryMatches: ctx.matches),
  ];
  return parts.where((p) => p.trim().isNotEmpty).join(' · ');
}

DuoView _duoViewOf(
  FocusViewContext ctx,
  String teamId,
  String? description,
  String poolId,
) {
  return DuoView(
    teamId: teamId,
    name: ctx.duoNameOf(teamId, description),
    isMe: ctx.myTeamIds.contains(teamId),
    standingLine: standingLineOf(ctx, teamId, poolId),
  );
}

/// O herói do "Agora": a próxima partida do atleta, já formatada.
///
/// Ao vivo NÃO traz contagem regressiva — o relógio perdeu a função assim que a
/// bola subiu, e o que importa passa a ser o placar.
NextMatchView? nextMatchViewOf(FocusViewContext ctx, DateTime now) {
  final m = ctx.nextMatch;
  if (m == null) return null;

  final live = TournamentMatchStatus.isInProgress(m.status);
  final iAmA = ctx.myTeamIds.contains(m.teamAId);
  final checkIn = iAmA ? m.checkInTeamAStatus : m.checkInTeamBStatus;
  final number = matchNumberLabelForCard(m);

  return NextMatchView(
    matchId: m.id,
    kicker: _kickerOf(ctx, m),
    numberLabel: number.trim().isEmpty ? null : 'Jogo $number',
    timeLabel: m.scheduleTime != null ? matchTimeLabelForCard(m) : 'A definir',
    countdown: live ? null : countdownLabelOf(m.scheduleTime, now),
    courtLabel: () {
      final label = matchCourtLabelForCard(m);
      return label.trim().isEmpty ? null : label;
    }(),
    bestOfLabel: 'MD${matchBestOf(m)}',
    formatLabel: 'MD${matchBestOf(m)} · $matchSetPoints PTS',
    countdownClock: live ? null : countdownClockOf(m.scheduleTime, now),
    checkedIn: checkIn.trim().toLowerCase() == 'present',
    live: live,
    liveScoreLine: liveScoreLineOf(m),
    sideA: _duoViewOf(ctx, m.teamAId, m.teamADescription, m.poolId),
    sideB: _duoViewOf(ctx, m.teamBId, m.teamBDescription, m.poolId),
  );
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
