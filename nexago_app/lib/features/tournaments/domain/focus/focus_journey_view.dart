import '../tournament_match.dart';
import '../tournament_match_display.dart';
import '../tournament_match_status.dart';
import 'focus_journey_logic.dart';
import 'focus_views_logic.dart';

/// As linhas da seção "Trajetória" — a manchete, o trilho "Caminho até a final"
/// e a régua de colocação que alimenta os prêmios. Porte de
/// `focus/journey/focus-journey.component.ts` (as funções puras exportadas).

enum JourneyHeadlineKind { champion, countdown }

class JourneyHeadline {
  const JourneyHeadline({required this.kind, this.text});

  final JourneyHeadlineKind kind;
  final String? text;
}

/// `null` quando o motor não sabe — e aí a manchete SOME, nunca vira chute.
JourneyHeadline? journeyHeadlineOf(int? wins) {
  if (wins == null) return null;
  if (wins == 0) return const JourneyHeadline(kind: JourneyHeadlineKind.champion);
  return JourneyHeadline(
    kind: JourneyHeadlineKind.countdown,
    text: wins == 1 ? '1 vitória até o título.' : '$wins vitórias até o título.',
  );
}

/// A pior colocação ainda possível a partir de uma campanha que precisa de
/// [wins] vitórias pro título. Em eliminação simples o número de vitórias
/// restantes já denuncia o tamanho da chave que falta: 1 vitória é a final
/// (chave de 2), 2 é a semifinal (chave de 4).
int bestPossiblePlaceOf(int wins) => 1 << wins;

/// A pior colocação que a posição REAL do atleta na chave ainda permite.
///
/// NÃO deriva de [winsToTitleOf], de propósito: aquela responde "quantas
/// vitórias faltam pro título" e vira `null` assim que o atleta é eliminado —
/// mas quem foi eliminado nas quartas TEM uma colocação, e é ela que decide o
/// prêmio garantido.
///
/// `null` na dupla eliminação: com duas escadas de comprimentos diferentes, a
/// régua `2 ^ rodadas restantes` não vale.
int? bracketWorstPlaceOf(
  List<TournamentMatch> matches,
  String categoryId,
  Set<String> myTeamIds, {
  required bool isDoubleElimination,
}) {
  if (isDoubleElimination) return null;

  final rounds = knockoutRounds(matches, categoryId);
  final myKnockouts = matches
      .where((m) =>
          m.categoryId == categoryId &&
          m.poolId.isEmpty &&
          !m.isGroupMatch &&
          (myTeamIds.contains(m.teamAId) || myTeamIds.contains(m.teamBId)))
      .toList();
  if (myKnockouts.isEmpty) return null;

  int placeFrom(int round) {
    final index = rounds.indexOf(round);
    return 1 << (rounds.length - (index < 0 ? 0 : index));
  }

  final losses = myKnockouts.where((m) {
    if (!TournamentMatchStatus.isCompleted(m.status)) return false;
    final winner = m.winnerId?.trim() ?? '';
    return winner.isNotEmpty && !myTeamIds.contains(winner);
  }).toList();
  if (losses.isNotEmpty) {
    final earliest = losses.reduce((a, b) => b.round < a.round ? b : a);
    return placeFrom(earliest.round);
  }

  // Mesma regra de piso + bye consumido de `winsToTitleOf`, COMPARTILHADA em
  // vez de copiada: no portal a cópia foi exatamente o que deixou uma das duas
  // desatualizada entre rounds de review.
  final pending = pendingKnockoutsOf(myKnockouts, myTeamIds);
  if (pending.isNotEmpty) {
    final earliest = pending.reduce((a, b) => b.round < a.round ? b : a);
    return placeFrom(earliest.round);
  }

  // Sem derrota e sem pendência: só resta o campeão. Checado pelo `matchType`,
  // NUNCA por round — a disputa de 3º lugar compartilha o round da final.
  final champion = myKnockouts.any((m) {
    if (!isFinalMatchTypeOf(m)) return false;
    final winner = m.winnerId?.trim() ?? '';
    return winner.isNotEmpty && myTeamIds.contains(winner);
  });
  return champion ? 1 : null;
}

class JourneyPath {
  const JourneyPath({required this.mine, required this.future});

  final List<TournamentMatch> mine;
  final List<TournamentMatch> future;
}

int _byScheduleThenNumber(TournamentMatch a, TournamentMatch b) {
  final at = a.scheduleTime;
  final bt = b.scheduleTime;
  if (at == null && bt == null) return a.matchNumber.compareTo(b.matchNumber);
  if (at == null) return 1;
  if (bt == null) return -1;
  final byTime = at.compareTo(bt);
  return byTime != 0 ? byTime : a.matchNumber.compareTo(b.matchNumber);
}

/// As partidas do atleta em ordem, seguidas das fases de mata-mata ainda sem
/// dono.
JourneyPath journeyPathOf(
  List<TournamentMatch> matches,
  String categoryId,
  Set<String> myTeamIds,
) {
  final mine = matches
      .where((m) =>
          m.categoryId == categoryId &&
          (myTeamIds.contains(m.teamAId) || myTeamIds.contains(m.teamBId)))
      .toList()
    ..sort(_byScheduleThenNumber);

  final future = matches
      .where((m) =>
          m.categoryId == categoryId &&
          m.poolId.isEmpty &&
          !m.isGroupMatch &&
          !myTeamIds.contains(m.teamAId) &&
          !myTeamIds.contains(m.teamBId) &&
          !TournamentMatchStatus.isCompleted(m.status) &&
          !TournamentMatchStatus.isCanceled(m.status))
      .toList()
    ..sort((a, b) => a.round.compareTo(b.round));

  return JourneyPath(mine: mine, future: future);
}

enum JourneyStepStatus { win, loss, live, next, upcoming }

/// Uma linha do "Caminho até a final" — tanto uma partida do atleta quanto uma
/// fase ainda sem dono. Um tipo só porque o trilho é uma sequência contínua: ele
/// não sabe (nem deve saber) onde termina o que já tem adversário.
class JourneyStepRow {
  const JourneyStepRow({
    required this.id,
    required this.status,
    required this.phaseLabel,
    required this.metaLabel,
    required this.opponentName,
    required this.detailLabel,
    required this.scoreLabel,
    required this.matchId,
  });

  final String id;
  final JourneyStepStatus status;
  final String phaseLabel;

  /// "09:00 · Q3" — só o que o organizador REALMENTE marcou. Esta tela nunca
  /// estima horário.
  final String? metaLabel;
  final String opponentName;
  final String? detailLabel;

  /// "2 – 0" a partir do primeiro set jogado; "vs" enquanto não há.
  final String scoreLabel;

  /// `null` quando não há partida para abrir (fase sem dono, ou slot vazio).
  final String? matchId;
}

const String _vsLabel = 'vs';

bool _isFinalPhaseLabel(String label) =>
    label == 'Final' || label == 'Grand final';

/// Quadra curta para a linha mono: "3"/"Quadra 3" viram "Q3"; quadra COM NOME
/// sai como o organizador escreveu, porque abreviar transformaria "Central" em
/// charada.
String? _courtChipOf(String? courtName) {
  final court = courtName?.trim() ?? '';
  if (court.isEmpty) return null;
  if (!RegExp(r'\d').hasMatch(court)) return court;
  final digits = RegExp(r'\d+').firstMatch(court)?.group(0);
  return digits != null ? 'Q$digits' : court;
}

String? _metaLabelOf(TournamentMatch m) {
  final parts = [
    if (m.scheduleTime != null) matchTimeLabelForCard(m),
    ?_courtChipOf(m.courtName),
  ].where((p) => p.trim().isNotEmpty).toList();
  return parts.isEmpty ? null : parts.join(' · ');
}

/// "21-15 · 21-12" do PONTO DE VISTA DO ATLETA. Os sets crus guardam o lado A
/// primeiro; lido direto, o atleta do lado B pareceria ter perdido o set que
/// venceu.
String? _mySetsLabelOf(TournamentMatch m, bool iAmA) {
  final sets = matchClosedSets(m);
  if (sets.isEmpty) return null;
  return sets.map((s) => iAmA ? '${s.a}-${s.b}' : '${s.b}-${s.a}').join(' · ');
}

(int, int) _setWins(TournamentMatch m, bool iAmA) {
  var a = 0;
  var b = 0;
  for (final s in matchClosedSets(m)) {
    if (s.a > s.b) {
      a++;
    } else if (s.b > s.a) {
      b++;
    }
  }
  return iAmA ? (a, b) : (b, a);
}

JourneyStepRow _stepOfMatch(
  FocusViewContext ctx,
  TournamentMatch m,
  String? nextMatchId,
  String? finalPrizeLabel,
  bool hasPendingGroupMatches,
) {
  final iAmA = ctx.myTeamIds.contains(m.teamAId);
  final opponentId = iAmA ? m.teamBId : m.teamAId;
  final opponentDescription = iAmA ? m.teamBDescription : m.teamADescription;
  final live = TournamentMatchStatus.isInProgress(m.status);
  final done = TournamentMatchStatus.isCompleted(m.status);
  final winner = m.winnerId?.trim() ?? '';
  final won = done && winner.isNotEmpty && ctx.myTeamIds.contains(winner);
  final lost = done && winner.isNotEmpty && !ctx.myTeamIds.contains(winner);
  final phaseLabel = matchPhaseDisplayLabel(m, categoryMatches: ctx.matches);
  final (mySets, theirSets) = _setWins(m, iAmA);

  return JourneyStepRow(
    id: m.id,
    status: won
        ? JourneyStepStatus.win
        : lost
            ? JourneyStepStatus.loss
            : live
                ? JourneyStepStatus.live
                : m.id == nextMatchId
                    ? JourneyStepStatus.next
                    : JourneyStepStatus.upcoming,
    phaseLabel: phaseLabel,
    metaLabel: _metaLabelOf(m),
    opponentName: ctx.duoNameOf(opponentId, opponentDescription),
    detailLabel: _detailLabelOf(
      ctx,
      m,
      iAmA,
      phaseLabel,
      finalPrizeLabel,
      hasPendingGroupMatches,
    ),
    scoreLabel: done || live ? '$mySets – $theirSets' : _vsLabel,
    matchId: m.teamAId.isNotEmpty && m.teamBId.isNotEmpty ? m.id : null,
  );
}

/// A linha de baixo, na ordem em que importa: o que JÁ aconteceu (sets), depois
/// o que está em jogo, e por fim de onde sai o adversário.
String? _detailLabelOf(
  FocusViewContext ctx,
  TournamentMatch m,
  bool iAmA,
  String phaseLabel,
  String? finalPrizeLabel,
  bool hasPendingGroupMatches,
) {
  final sets = _mySetsLabelOf(m, iAmA);
  if (sets != null) return sets;
  if (_isFinalPhaseLabel(phaseLabel)) return finalPrizeLabel;

  final pending = !TournamentMatchStatus.isCompleted(m.status) &&
      !TournamentMatchStatus.isCanceled(m.status);
  if (m.poolId.isNotEmpty && pending) {
    final rounds = ctx.matches
        .where((o) => o.poolId == m.poolId)
        .map((o) => o.round)
        .toSet()
        .toList()
      ..sort();
    if (rounds.isNotEmpty && rounds.last == m.round) {
      // Mesma redação de `_noteOf`: afirmar POSIÇÃO exigiria simular o
      // desempate, que este app se recusa a fazer antes do grupo encerrar.
      return 'decide a classificação do grupo';
    }
  }

  final opponentId = iAmA ? m.teamBId : m.teamAId;
  if (m.poolId.isEmpty && opponentId.isEmpty && hasPendingGroupMatches) {
    return 'sai ao fim dos grupos';
  }
  return null;
}

/// O trilho inteiro: as partidas do atleta em ordem, seguidas do que ainda vem.
///
/// O "pela frente" tem duas fontes, e é o formato que decide. Na DUPLA
/// ELIMINAÇÃO vem do caminho feliz da fiação ([happyPath]) — agrupar por rodada
/// ali fundiria WB e LB, que numeram rodadas independentes, e a lista viraria
/// uma sequência que ninguém joga. Na eliminação simples, uma linha por fase
/// ainda sem dono.
List<JourneyStepRow> journeyStepsOf(
  FocusViewContext ctx,
  JourneyPath path,
  String? nextMatchId,
  String? finalPrizeLabel, {
  List<TournamentMatch>? happyPath,
}) {
  final hasPendingGroupMatches = ctx.matches.any((m) =>
      m.poolId.isNotEmpty &&
      !TournamentMatchStatus.isCompleted(m.status) &&
      !TournamentMatchStatus.isCanceled(m.status));

  final mine = path.mine
      .map((m) => _stepOfMatch(
            ctx,
            m,
            nextMatchId,
            finalPrizeLabel,
            hasPendingGroupMatches,
          ))
      .toList();

  final future = <JourneyStepRow>[];
  if (happyPath != null && happyPath.isNotEmpty) {
    // A partir do SEGUNDO: o primeiro é a próxima partida do atleta e já entrou
    // pela lista dele. O adversário sai do slot que sobra — `winnerAdvanceSlot`
    // da anterior diz em qual lado o atleta cairia.
    for (var i = 1; i < happyPath.length; i++) {
      final m = happyPath[i];
      final mySlot = happyPath[i - 1].winnerAdvanceSlot;
      final opponentId = mySlot == 'A'
          ? m.teamBId
          : mySlot == 'B'
              ? m.teamAId
              : '';
      final phaseLabel = matchPhaseDisplayLabel(m, categoryMatches: ctx.matches);
      future.add(JourneyStepRow(
        id: m.id,
        status: JourneyStepStatus.upcoming,
        phaseLabel: phaseLabel,
        metaLabel: _metaLabelOf(m),
        opponentName:
            mySlot != null ? ctx.duoNameOf(opponentId, null) : 'A definir',
        detailLabel: _isFinalPhaseLabel(phaseLabel) ? finalPrizeLabel : null,
        scoreLabel: _vsLabel,
        matchId: null,
      ));
    }
  } else {
    // Uma linha por FASE: `future` pode ter várias partidas do mesmo round —
    // chaves paralelas sem dono —, mas o trilho é a linha do tempo do atleta,
    // não uma lista de partidas de outras duplas.
    final seen = <int>{};
    for (final m in path.future) {
      if (!seen.add(m.round)) continue;
      final phaseLabel = matchPhaseDisplayLabel(m, categoryMatches: ctx.matches);
      future.add(JourneyStepRow(
        id: 'fase-${m.round}',
        status: JourneyStepStatus.upcoming,
        phaseLabel: phaseLabel,
        metaLabel: m.scheduleTime != null ? matchTimeLabelForCard(m) : null,
        opponentName: 'A definir',
        detailLabel: _isFinalPhaseLabel(phaseLabel) ? finalPrizeLabel : null,
        scoreLabel: _vsLabel,
        matchId: null,
      ));
    }
  }

  return [...mine, ...future];
}

/// Uma linha da campanha de um adversário: "Grupo A" → "2V 1D", ou a fase
/// vencida → o placar em sets.
class CampaignEntry {
  const CampaignEntry({required this.label, required this.detail});

  final String label;
  final String detail;
}

/// Um adversário que a chave ainda pode cruzar com o atleta.
class PossibleOpponent {
  const PossibleOpponent({
    required this.teamId,
    required this.name,
    required this.campaign,
  });

  final String teamId;
  final String name;
  final List<CampaignEntry> campaign;
}

/// O que este time fez no torneio até aqui: o saldo nos grupos e cada fase de
/// mata-mata que ele venceu.
List<CampaignEntry> campaignOf(
  List<TournamentMatch> matches,
  String teamId,
  String Function(String teamId) opponentNameOf,
) {
  if (teamId.isEmpty) return const [];
  final mine =
      matches.where((m) => m.teamAId == teamId || m.teamBId == teamId).toList();
  final entries = <CampaignEntry>[];

  final groupMatches = mine
      .where((m) =>
          m.poolId.isNotEmpty && TournamentMatchStatus.isCompleted(m.status))
      .toList();
  if (groupMatches.isNotEmpty) {
    final wins =
        groupMatches.where((m) => (m.winnerId ?? '') == teamId).length;
    entries.add(CampaignEntry(
      label: 'Grupo ${groupMatches.first.poolId}',
      detail: '${wins}V ${groupMatches.length - wins}D',
    ));
  }

  final knockoutWins = mine
      .where((m) =>
          m.poolId.isEmpty &&
          TournamentMatchStatus.isCompleted(m.status) &&
          (m.winnerId ?? '') == teamId)
      .toList()
    ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));

  for (final m in knockoutWins) {
    final opponentId = m.teamAId == teamId ? m.teamBId : m.teamAId;
    final iAmA = m.teamAId == teamId;
    final (mySets, theirSets) = _setWins(m, iAmA);
    entries.add(CampaignEntry(
      label: matchPhaseDisplayLabel(m, categoryMatches: matches),
      detail: '$mySets–$theirSets vs ${opponentNameOf(opponentId)}',
    ));
  }

  return entries;
}

/// Quem a chave ainda pode colocar no caminho do atleta: os times de partidas
/// de mata-mata PENDENTES da categoria em que ele não está.
///
/// Não promete confronto — só lista quem segue vivo do outro lado. Afirmar
/// "seu próximo adversário" exigiria resolver a chave inteira.
List<PossibleOpponent> possibleOpponentsOf(
  List<TournamentMatch> matches,
  String categoryId,
  Set<String> myTeamIds,
  String Function(String teamId) duoNameOf,
) {
  final ids = <String>[];
  for (final m in matches) {
    if (m.categoryId != categoryId) continue;
    if (m.poolId.isNotEmpty || m.isGroupMatch) continue;
    if (myTeamIds.contains(m.teamAId) || myTeamIds.contains(m.teamBId)) continue;
    if (TournamentMatchStatus.isCompleted(m.status) ||
        TournamentMatchStatus.isCanceled(m.status)) {
      continue;
    }
    for (final id in [m.teamAId, m.teamBId]) {
      if (id.isNotEmpty && !myTeamIds.contains(id) && !ids.contains(id)) {
        ids.add(id);
      }
    }
  }

  return [
    for (final teamId in ids)
      PossibleOpponent(
        teamId: teamId,
        name: duoNameOf(teamId),
        campaign: campaignOf(matches, teamId, duoNameOf),
      ),
  ];
}
