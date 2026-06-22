import '../../../tournaments/domain/tournament_match.dart';
import '../../../tournaments/domain/tournament_match_set.dart';

/// Regras de placar vôlei de praia (I1/I2).
abstract final class MatchScoringLogic {
  MatchScoringLogic._();

  static const int defaultSetPoints = 21;
  static const int tiebreakSetPoints = 15;
  static const int minAdvantage = 2;

  static bool isSetWon(int scoreA, int scoreB, {int target = defaultSetPoints}) {
    if (scoreA >= target && scoreA - scoreB >= minAdvantage) return true;
    if (scoreB >= target && scoreB - scoreA >= minAdvantage) return true;
    return false;
  }

  /// Vencedor de um set conforme as regras (target por índice + vantagem):
  /// `'A'`, `'B'` ou `null` se o set ainda não foi vencido por ninguém.
  static String? setWinnerSide(
    List<TournamentMatchSet> sets,
    int index, {
    int bestOf = defaultBestOf,
  }) {
    if (index < 0 || index >= sets.length) return null;
    final s = sets[index];
    final target = targetPointsForSet(index, bestOf);
    if (!isSetWon(s.a, s.b, target: target)) return null;
    return s.a > s.b ? 'A' : 'B';
  }

  /// Quantos sets cada lado venceu DE FATO (respeitando target/vantagem).
  /// Um set incompleto (ex.: 5×2) NÃO conta como vitória de set.
  static ({int a, int b}) setsWon(
    List<TournamentMatchSet> sets, {
    int bestOf = defaultBestOf,
  }) {
    var a = 0;
    var b = 0;
    for (var i = 0; i < sets.length; i++) {
      final side = setWinnerSide(sets, i, bestOf: bestOf);
      if (side == 'A') {
        a++;
      } else if (side == 'B') {
        b++;
      }
    }
    return (a: a, b: b);
  }

  static bool isMatchWon(List<TournamentMatchSet> sets, {int bestOf = 3}) {
    final needed = (bestOf / 2).ceil();
    final wins = setsWon(sets, bestOf: bestOf);
    return wins.a >= needed || wins.b >= needed;
  }

  static String? matchWinnerId({
    required List<TournamentMatchSet> sets,
    required String teamAId,
    required String teamBId,
    int bestOf = 3,
  }) {
    if (!isMatchWon(sets, bestOf: bestOf)) return null;
    final wins = setsWon(sets, bestOf: bestOf);
    if (wins.a > wins.b) return teamAId;
    if (wins.b > wins.a) return teamBId;
    return null;
  }

  static int targetPointsForSet(int setIndex, int totalSets) {
    if (totalSets == 3 && setIndex == 2) return tiebreakSetPoints;
    return defaultSetPoints;
  }

  /// Aplica ponto ao set atual; retorna novos sets e índice do set.
  static ({List<TournamentMatchSet> sets, int currentSetIndex, String? winnerId})
      applyPoint({
    required List<TournamentMatchSet> sets,
    required int currentSetIndex,
    required String side,
    required String teamAId,
    required String teamBId,
    int bestOf = 3,
  }) {
    final idx = currentSetIndex.clamp(0, bestOf - 1);
    final working = List<TournamentMatchSet>.from(sets);
    while (working.length <= idx) {
      working.add(const TournamentMatchSet(a: 0, b: 0));
    }

    final current = working[idx];
    final isA = side.toUpperCase() == 'A';
    final updated = TournamentMatchSet(
      a: current.a + (isA ? 1 : 0),
      b: current.b + (isA ? 0 : 1),
      startedAt: current.startedAt ?? DateTime.now(),
    );
    working[idx] = updated;

    final target = targetPointsForSet(idx, bestOf);
    var nextSetIndex = idx;
    if (isSetWon(updated.a, updated.b, target: target)) {
      if (!isMatchWon(working, bestOf: bestOf) && idx < bestOf - 1) {
        nextSetIndex = idx + 1;
      }
    }

    final winner = matchWinnerId(
      sets: working,
      teamAId: teamAId,
      teamBId: teamBId,
      bestOf: bestOf,
    );

    return (
      sets: working,
      currentSetIndex: nextSetIndex,
      winnerId: winner,
    );
  }

  /// Sets que já têm algum ponto lançado (não contam 0×0).
  static int playedSetsCount(List<TournamentMatchSet> sets) {
    var count = 0;
    for (final s in sets) {
      if (s.a > 0 || s.b > 0) count++;
    }
    return count;
  }

  /// Pode reduzir o formato para [newBestOf] sem perder placar já lançado?
  /// Bloqueia quando há mais sets pontuados do que o novo formato comporta.
  static bool canReduceBestOf(List<TournamentMatchSet> sets, int newBestOf) {
    return playedSetsCount(sets) <= newBestOf;
  }

  /// Aplica a troca de formato (nº de sets) e recalcula vencedor/índice/conclusão.
  /// Trunca sets excedentes (vazios) ao novo formato. Não valida [canReduceBestOf]
  /// — o chamador deve checar antes para não descartar placar lançado.
  static ({
    List<TournamentMatchSet> sets,
    int currentSetIndex,
    String? winnerId,
    bool completed,
  }) applyBestOfChange({
    required List<TournamentMatchSet> sets,
    required int newBestOf,
    required String teamAId,
    required String teamBId,
  }) {
    final trimmed = sets.length > newBestOf
        ? sets.sublist(0, newBestOf)
        : List<TournamentMatchSet>.from(sets);

    final winner = matchWinnerId(
      sets: trimmed,
      teamAId: teamAId,
      teamBId: teamBId,
      bestOf: newBestOf,
    );

    // Índice do set atual: primeiro set ainda não vencido, limitado ao formato.
    var idx = 0;
    while (idx < trimmed.length &&
        setWinnerSide(trimmed, idx, bestOf: newBestOf) != null &&
        idx < newBestOf - 1) {
      idx++;
    }

    return (
      sets: trimmed,
      currentSetIndex: idx,
      winnerId: winner,
      completed: winner != null,
    );
  }

  /// Desfaz último ponto do set atual.
  static ({List<TournamentMatchSet> sets, int currentSetIndex}) undoPoint({
    required List<TournamentMatchSet> sets,
    required int currentSetIndex,
    required String side,
  }) {
    if (sets.isEmpty) return (sets: sets, currentSetIndex: currentSetIndex);

    final idx = currentSetIndex.clamp(0, sets.length - 1);
    final working = List<TournamentMatchSet>.from(sets);
    final current = working[idx];
    final isA = side.toUpperCase() == 'A';

    final newA = isA ? (current.a - 1).clamp(0, 999) : current.a;
    final newB = isA ? current.b : (current.b - 1).clamp(0, 999);

    if (newA == 0 && newB == 0 && idx > 0) {
      working.removeAt(idx);
      return (sets: working, currentSetIndex: idx - 1);
    }

    working[idx] = TournamentMatchSet(
      a: newA,
      b: newB,
      startedAt: current.startedAt,
      endedAt: current.endedAt,
    );
    return (sets: working, currentSetIndex: idx);
  }

  static String setsScoreLabel(TournamentMatch match) {
    if (match.sets.isEmpty) return match.scoreLabel;
    final wins = setsWon(match.sets, bestOf: match.bestOf);
    return '${wins.a} × ${wins.b}';
  }

  static bool validateQuickScoreSets(List<TournamentMatchSet> sets) {
    if (sets.isEmpty) return false;
    for (final s in sets) {
      if (s.a < 0 || s.b < 0) return false;
      // Um set registrado não pode terminar empatado (inclui 0×0).
      if (s.a == s.b) return false;
    }
    return true;
  }

  static const int defaultBestOf = 3;

  static String formatElapsedMmSs(int totalSec) {
    final safe = totalSec.clamp(0, 99999);
    final minutes = safe ~/ 60;
    final seconds = safe % 60;
    return '${minutes.toString().padLeft(2, '0')}:'
        '${seconds.toString().padLeft(2, '0')}';
  }

  static int elapsedSecondsFromStart(DateTime? startedAt, DateTime now) {
    if (startedAt == null) return 0;
    return now.difference(startedAt).inSeconds.clamp(0, 99999);
  }

  static String setRulesLabel(int setIndex, {int bestOf = defaultBestOf}) {
    final target = targetPointsForSet(setIndex, bestOf);
    return 'set até $target · vantagem de $minAdvantage';
  }

  static bool isTeamAtSetPoint(
    int scoreA,
    int scoreB, {
    required int setIndex,
    int bestOf = defaultBestOf,
  }) {
    final target = targetPointsForSet(setIndex, bestOf);
    return isSetWon(scoreA + 1, scoreB, target: target) ||
        isSetWon(scoreB + 1, scoreA, target: target);
  }

  static String? setPointHint(
    int scoreA,
    int scoreB, {
    required int setIndex,
    int bestOf = defaultBestOf,
  }) {
    final target = targetPointsForSet(setIndex, bestOf);
    if (isSetWon(scoreA, scoreB, target: target)) return null;
    if (isTeamAtSetPoint(scoreA, scoreB, setIndex: setIndex, bestOf: bestOf)) {
      return 'set point em 1';
    }
    final leader = scoreA > scoreB ? scoreA : scoreB;
    if (leader < target - 5) return null;
    final remaining = target - leader;
    if (remaining > 1 && remaining <= 5) {
      return 'set point em $remaining';
    }
    return null;
  }

  static String formatPointEventTime(DateTime ts) {
    final h = ts.hour.toString().padLeft(2, '0');
    final m = ts.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  static String teamLabelForSide({
    required String side,
    required String? teamADescription,
    required String? teamBDescription,
    required String teamAId,
    required String teamBId,
  }) {
    final isA = side.trim().toUpperCase() == 'A';
    final desc = isA ? teamADescription : teamBDescription;
    final trimmed = desc?.trim();
    if (trimmed != null && trimmed.isNotEmpty) return trimmed;
    final id = isA ? teamAId : teamBId;
    return id.trim().isNotEmpty ? id.trim() : 'Dupla';
  }
}
