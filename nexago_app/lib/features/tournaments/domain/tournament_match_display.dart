import 'package:intl/intl.dart';

import '../../../core/time/nexago_event_timezone.dart';
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

String matchTimeLabelForCard(TournamentMatch match, {DateTime? reference}) {
  final time = matchTimeForCard(match);
  if (time == null) return '';

  // O mapper entrega os campos do doc como INSTANTE (DateTime marcado como
  // UTC). Formatar esse valor direto imprime a hora de Greenwich — no
  // horário de Brasília, 3h a mais. A parede do evento é sempre São Paulo.
  final local = toNexagoEventLocal(time);
  final now = toNexagoEventLocal(reference ?? DateTime.now());
  final sameDay = local.year == now.year &&
      local.month == now.month &&
      local.day == now.day;
  if (sameDay) {
    return DateFormat('HH:mm', 'pt_BR').format(local);
  }
  return DateFormat('dd/MM · HH:mm', 'pt_BR').format(local);
}

String matchNumberLabelForCard(TournamentMatch match) {
  if (match.matchNumber <= 0) return '';
  return '#${match.matchNumber}';
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

/// Rodapé de agendamento do card da chave (`Sáb 29/03 · 16:30 · Quadra 1`) —
/// paridade com o card da chave do painel web (`scheduleLabelOf`). Sem horário
/// marcado, mostra o que existir (`Quadra 1 · sem horário` / `Sem horário`).
String matchScheduleFooterLabelPt(TournamentMatch match) {
  final court = matchCourtLabelForCard(match);
  final time = match.scheduleTime;
  if (time == null) {
    return court.isEmpty ? 'Sem horário' : '$court · sem horário';
  }
  final local = toNexagoEventLocal(time);
  final weekdayRaw =
      DateFormat('EEE', 'pt_BR').format(local).replaceAll('.', '');
  final weekday = weekdayRaw.isEmpty
      ? ''
      : '${weekdayRaw[0].toUpperCase()}${weekdayRaw.substring(1)}';
  return [
    '$weekday ${DateFormat('dd/MM', 'pt_BR').format(local)}'.trim(),
    DateFormat('HH:mm', 'pt_BR').format(local),
    if (court.isNotEmpty) court,
  ].join(' · ');
}

/// Metadados do topo do card (`#2 · Quadra 1`).
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

// --- Leitura do set em andamento --------------------------------------------
// Espelho de `matchClosedSets` / `matchLiveCurrentSet` / `displaySetsOf` do
// portal (`data/matches-repository.ts`, `tournament-live.selectors.ts`). Vive
// aqui, e não em cada tela, porque o card da chave, o pôster e o detalhe da
// partida precisam ler o mesmo jogo com os mesmos números.

const _defaultBestOf = 3;
const _defaultSetPoints = 21;
const _tiebreakSetPoints = 15;
const _minSetAdvantage = 2;

/// Pontos que fecham um set normal e um tie-break. Expostos porque o Modo Focus
/// mostra o formato da partida ao atleta ("MD3 · 21 PTS", "tie 15") e a régua
/// tem que ser a MESMA que decide se o set acabou.
int get matchSetPoints => _defaultSetPoints;
int get matchTiebreakSetPoints => _tiebreakSetPoints;
int get matchMinSetAdvantage => _minSetAdvantage;

/// Pontos que fecham o set de índice [index] num jogo melhor-de-[bestOf].
/// Mesma régua de [matchSetIsWon] — exposta para a simulação de cenários do
/// Focus, que precisa gerar placares legais.
int matchSetTargetPoints(int index, int bestOf) =>
    bestOf == 3 && index == 2 ? _tiebreakSetPoints : _defaultSetPoints;

int matchBestOf(TournamentMatch match) =>
    match.bestOf > 0 ? match.bestOf : _defaultBestOf;

/// Set já decidido pela regra de pontos (21, ou 15 no tiebreak do melhor de 3).
bool matchSetIsWon(TournamentMatchSet set, int index, int bestOf) {
  final target =
      bestOf == 3 && index == 2 ? _tiebreakSetPoints : _defaultSetPoints;
  return (set.a >= target && set.a - set.b >= _minSetAdvantage) ||
      (set.b >= target && set.b - set.a >= _minSetAdvantage);
}

/// Sets fechados, já normalizados (`sets[]` ou o formato legado `resultA/B`).
/// Ao vivo, o set em andamento (que a mesa mantém dentro de `sets[]`) fica de
/// fora; encerrada, todo set vale.
List<TournamentMatchSet> matchClosedSets(TournamentMatch match) {
  final sets = setsForMatch(match);
  if (!TournamentMatchStatus.isInProgress(match.status)) return sets;
  final bestOf = matchBestOf(match);
  return [
    for (var i = 0; i < sets.length; i++)
      if (matchSetIsWon(sets[i], i, bestOf)) sets[i],
  ];
}

/// Pontos do set em andamento, unificando os dois escritores: a mesa ponto a
/// ponto (set corrente dentro de `sets[]`) e o placar agregado (`liveScore`).
/// A mesa tem prioridade; `null` fora do ao vivo ou entre sets.
({int setNumber, int a, int b})? matchLiveCurrentSet(TournamentMatch match) {
  if (!TournamentMatchStatus.isInProgress(match.status)) return null;
  final bestOf = matchBestOf(match);
  final sets = setsForMatch(match);
  if (sets.isNotEmpty) {
    final index = (match.currentSetIndex ?? sets.length - 1).clamp(
      0,
      bestOf - 1,
    );
    if (index < sets.length && !matchSetIsWon(sets[index], index, bestOf)) {
      return (
        setNumber: matchClosedSets(match).length + 1,
        a: sets[index].a,
        b: sets[index].b,
      );
    }
  }
  final live = match.liveScore;
  if (live == null) return null;
  final setNumber = sets.isNotEmpty
      ? matchClosedSets(match).length + 1
      : live.setsA + live.setsB + 1;
  return (setNumber: setNumber, a: live.currentGamesA, b: live.currentGamesB);
}

/// Parciais a exibir em pílula no rodapé do card: os sets fechados mais o set
/// em andamento, quando já tem ponto marcado. Slots 0-0 nunca jogados (vitória
/// por 2-0 num melhor de 3) ficam de fora.
List<({int a, int b, bool inProgress})> matchDisplaySets(
  TournamentMatch match,
) {
  final sets = <({int a, int b, bool inProgress})>[
    for (final set in matchClosedSets(match))
      if (set.a + set.b > 0) (a: set.a, b: set.b, inProgress: false),
  ];
  final live = matchLiveCurrentSet(match);
  if (live != null && (live.a > 0 || live.b > 0)) {
    sets.add((a: live.a, b: live.b, inProgress: true));
  }
  return sets;
}

/// Sets efetivamente disputados — omite slots 0-0 não jogados (ex.: vitória 2-0).
List<TournamentMatchSet> playedSetsForMatch(TournamentMatch match) {
  final sets = setsForMatch(match);
  if (sets.isEmpty) return sets;

  final isLive = TournamentMatchStatus.isInProgress(match.status);
  final currentSetIndex = match.currentSetIndex;

  return [
    for (var i = 0; i < sets.length; i++)
      if (_setWasPlayed(
        set: sets[i],
        setIndex: i,
        isLive: isLive,
        currentSetIndex: currentSetIndex,
      ))
        sets[i],
  ];
}

bool _setWasPlayed({
  required TournamentMatchSet set,
  required int setIndex,
  required bool isLive,
  required int? currentSetIndex,
}) {
  if (isLive && currentSetIndex != null && setIndex == currentSetIndex) {
    return true;
  }
  return set.a + set.b > 0 || set.startedAt != null || set.endedAt != null;
}

List<TournamentMatchSet> parseSetsFromResultStrings(
  String resultA,
  String resultB,
) {
  final aParts =
      resultA.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty);
  final bParts =
      resultB.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty);
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
    return sets.map((s) => isTeamA ? '${s.a}' : '${s.b}').join(' · ');
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
  return sets.asMap().entries.map((e) {
    final s = e.value;
    final isTeamA = match.teamAId.trim() == athleteTeamId.trim();
    final ours = isTeamA ? s.a : s.b;
    final theirs = isTeamA ? s.b : s.a;
    return 'Set ${e.key + 1}: $ours-$theirs';
  }).join(' · ');
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
  final normalized = type.toLowerCase().replaceAll('_', ' ');
  if (normalized == 'grand final') return 'Grand Final';
  return switch (type) {
    'Group' => 'Fase de Grupos',
    'group' => 'Fase de Grupos',
    'groups' => 'Fase de Grupos',
    'knockout' => 'Mata-mata',
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
  if (type.toLowerCase().replaceAll('_', ' ') == 'grand final') {
    return 'Grand Final';
  }
  if (type == 'Third Place') return '3º lugar';
  if (type.toLowerCase() == 'knockout' && match.round > 0) {
    return 'Rodada ${match.round}';
  }

  final typeLabel = matchTypeLabelPt(type);
  if (type.isNotEmpty && typeLabel != type) return typeLabel;
  if (type.isNotEmpty) return type;

  final desc = match.description?.trim();
  if (desc != null && desc.isNotEmpty) return desc;

  if (match.round > 0) return 'Rodada ${match.round}';
  return 'Eliminatórias';
}

/// Rótulo da fase eliminatória a partir do nº de jogos na rodada.
String knockoutPhaseLabelForMatchCount(int matchesInRound) {
  return switch (matchesInRound) {
    16 => '32 avos de final',
    8 => 'Oitavas de final',
    4 => 'Quartas de final',
    2 => 'Semifinais',
    1 => 'Eliminatórias',
    _ => '$matchesInRound jogos',
  };
}

String bracketRoundGroupLabel(List<TournamentMatch> matches) {
  if (matches.isEmpty) return '';
  final sorted = [...matches]
    ..sort((a, b) => a.matchNumber.compareTo(b.matchNumber));
  final first = sorted.first;
  if (first.matchType.trim().toLowerCase() == 'knockout') {
    return knockoutPhaseLabelForMatchCount(sorted.length);
  }
  return matchRoundLabel(first);
}

String _poolLabelForId(String poolId) {
  final trimmed = poolId.trim();
  if (trimmed.isEmpty) return 'Geral';
  if (trimmed.toLowerCase().startsWith('grupo')) return trimmed;
  return 'Grupo $trimmed';
}

/// Fase legível para UI do organizador (grupos com pool, mata-mata por rodada).
String matchPhaseDisplayLabel(
  TournamentMatch match, {
  List<TournamentMatch> categoryMatches = const [],
}) {
  late final String label;
  if (match.isPoolMatch) {
    final pool = _poolLabelForId(match.poolId);
    label = pool == 'Geral' ? 'Fase de grupos' : 'Fase de grupos · $pool';
  } else {
    final typeLower = match.matchType.trim().toLowerCase();
    if (typeLower == 'knockout' && categoryMatches.isNotEmpty) {
      final inRound = categoryMatches
          .where(
            (m) =>
                m.matchType.trim().toLowerCase() == 'knockout' &&
                m.round == match.round,
          )
          .toList();
      if (inRound.isNotEmpty) {
        label = knockoutPhaseLabelForMatchCount(inRound.length);
      } else {
        label = _knockoutFallbackPhaseLabel(match, typeLower);
      }
    } else {
      label = _knockoutFallbackPhaseLabel(match, typeLower);
    }
  }
  return label.toUpperCase();
}

String _knockoutFallbackPhaseLabel(TournamentMatch match, String typeLower) {
  final roundLabel = matchRoundLabel(match);
  if (roundLabel.startsWith('Rodada ') &&
      match.round > 0 &&
      typeLower == 'knockout') {
    return 'Mata-mata · $roundLabel';
  }
  return roundLabel;
}
