import 'scoring_profile.dart';

/// Um set do placar. Em set de games, [tb] guarda o tie-break (ou o super
/// tie-break do set decisivo, com [a]/[b] em 1×0).
class ScoreSetValue {
  const ScoreSetValue(this.a, this.b, {this.tb});

  final int a;
  final int b;
  final ScoreSetValue? tb;
}

typedef ScoreIssue = ({int? setIndex, String message});

/// Núcleo de regras de placar (spec multiesporte, eixo 2). A MESMA lógica vive
/// em `functions/src/sports/scoring.ts` (autoritativo) e
/// `frontend/shared/sports/scoring.ts`; os casos de
/// `sports/scoring-vectors.json` provam a paridade.
abstract final class ScoringRules {
  ScoringRules._();

  static const int _tiebreakWinBy = 2;

  static int? normalizeBestOf(Object? raw) {
    final n = raw is num ? raw : num.tryParse('${raw ?? ''}');
    if (n == 1 || n == 3 || n == 5) return n!.toInt();
    return null;
  }

  /// Regra histórica (vôlei de praia): 21, vantagem 2, decisivo 15 SÓ em MD3 —
  /// MD5 vai a 21 no 5º set, como sempre foi. Não normaliza [bestOf]: os
  /// invólucros antigos repassam o número que receberam.
  static SetsPointsProfile legacyProfile(int bestOf) => SetsPointsProfile(
    bestOf: bestOf,
    setTarget: 21,
    decidingSetTarget: bestOf == 3 ? 15 : 21,
    winBy: 2,
    pointCap: null,
  );

  static int? _posInt(Object? v) {
    if (v is! num) return null;
    if (v != v.roundToDouble() || v <= 0) return null;
    return v.toInt();
  }

  /// Perfil gravado no Firestore → tipado; `null` se qualquer campo estiver
  /// errado. Mesmas regras de `scoringProfileFromRaw` no TS (inclusive:
  /// `pointCap` ausente vale `null`, `tiebreakAtGames` ausente invalida).
  static ScoringProfile? profileFromRaw(Object? raw) {
    if (raw is! Map) return null;
    final bestOf = normalizeBestOf(raw['bestOf']);
    if (bestOf == null) return null;
    final kind = raw['kind'];
    if (kind == 'sets_points') {
      final setTarget = _posInt(raw['setTarget']);
      final decidingSetTarget = _posInt(raw['decidingSetTarget']);
      final winBy = _posInt(raw['winBy']);
      final capRaw = raw['pointCap'];
      final pointCap = capRaw == null ? null : _posInt(capRaw);
      if (setTarget == null || decidingSetTarget == null || winBy == null) {
        return null;
      }
      if (capRaw != null && pointCap == null) return null;
      return SetsPointsProfile(
        bestOf: bestOf,
        setTarget: setTarget,
        decidingSetTarget: decidingSetTarget,
        winBy: winBy,
        pointCap: pointCap,
      );
    }
    if (kind == 'sets_games') {
      final gamesPerSet = _posInt(raw['gamesPerSet']);
      final winByGames = _posInt(raw['winByGames']);
      final tiebreakTo = _posInt(raw['tiebreakTo']);
      final superTiebreakTo = _posInt(raw['superTiebreakTo']);
      if (gamesPerSet == null ||
          winByGames == null ||
          tiebreakTo == null ||
          superTiebreakTo == null) {
        return null;
      }
      if (!raw.containsKey('tiebreakAtGames')) return null;
      final tbAtRaw = raw['tiebreakAtGames'];
      final tiebreakAtGames = tbAtRaw == null ? null : _posInt(tbAtRaw);
      if (tbAtRaw != null && tiebreakAtGames == null) return null;
      final noAd = raw['noAd'];
      if (noAd is! bool) return null;
      final decidingSet = switch (raw['decidingSet']) {
        'full' => DecidingSet.full,
        'super_tiebreak' => DecidingSet.superTiebreak,
        _ => null,
      };
      if (decidingSet == null) return null;
      return SetsGamesProfile(
        bestOf: bestOf,
        gamesPerSet: gamesPerSet,
        winByGames: winByGames,
        tiebreakAtGames: tiebreakAtGames,
        tiebreakTo: tiebreakTo,
        noAd: noAd,
        decidingSet: decidingSet,
        superTiebreakTo: superTiebreakTo,
      );
    }
    return null;
  }

  /// Perfil efetivo: o carimbado na partida; sem carimbo válido, a regra
  /// histórica com o `bestOf` do doc.
  static ScoringProfile profileOfMatch({Object? raw, Object? bestOf}) =>
      profileFromRaw(raw) ?? legacyProfile(normalizeBestOf(bestOf) ?? 3);

  static bool _isDecidingSet(int index, int bestOf) =>
      bestOf > 1 && index == bestOf - 1;

  static bool isPointsSetWon(int a, int b, int target, int winBy, int? cap) {
    final hi = a > b ? a : b;
    final lo = a > b ? b : a;
    if (cap != null && hi == cap && hi > lo) return true;
    return hi >= target && hi - lo >= winBy;
  }

  static int setPointsTarget(SetsPointsProfile p, int index) =>
      _isDecidingSet(index, p.bestOf) ? p.decidingSetTarget : p.setTarget;

  static bool _isSuperTiebreakSet(SetsGamesProfile p, int index) =>
      p.decidingSet == DecidingSet.superTiebreak &&
      _isDecidingSet(index, p.bestOf);

  static String? _gamesSetWinner(
    ScoreSetValue s,
    int index,
    SetsGamesProfile p,
  ) {
    if (_isSuperTiebreakSet(p, index)) {
      final tb = s.tb;
      if (tb == null ||
          !isPointsSetWon(
            tb.a,
            tb.b,
            p.superTiebreakTo,
            _tiebreakWinBy,
            null,
          )) {
        return null;
      }
      final side = tb.a > tb.b ? 'A' : 'B';
      final gamesMatch = side == 'A'
          ? s.a == 1 && s.b == 0
          : s.a == 0 && s.b == 1;
      return gamesMatch ? side : null;
    }
    if (s.a == s.b) return null;
    final side = s.a > s.b ? 'A' : 'B';
    final hi = s.a > s.b ? s.a : s.b;
    final lo = s.a > s.b ? s.b : s.a;
    final tbAt = p.tiebreakAtGames;
    if (tbAt != null) {
      if (hi == tbAt + 1 && lo == tbAt) {
        final tb = s.tb;
        if (tb == null ||
            !isPointsSetWon(tb.a, tb.b, p.tiebreakTo, _tiebreakWinBy, null)) {
          return null;
        }
        return (tb.a > tb.b ? 'A' : 'B') == side ? side : null;
      }
      if (hi > tbAt + 1) return null;
    }
    return hi >= p.gamesPerSet && hi - lo >= p.winByGames ? side : null;
  }

  /// `'A'`, `'B'` ou `null` se o set ainda não foi vencido por ninguém.
  static String? setWinnerSide(
    List<ScoreSetValue> sets,
    int index,
    ScoringProfile profile,
  ) {
    if (index < 0 || index >= sets.length) return null;
    final s = sets[index];
    switch (profile) {
      case SetsGamesProfile p:
        return _gamesSetWinner(s, index, p);
      case SetsPointsProfile p:
        final won = isPointsSetWon(
          s.a,
          s.b,
          setPointsTarget(p, index),
          p.winBy,
          p.pointCap,
        );
        if (!won) return null;
        return s.a > s.b ? 'A' : 'B';
    }
  }

  static ({int a, int b}) setsWon(
    List<ScoreSetValue> sets,
    ScoringProfile profile,
  ) {
    var a = 0;
    var b = 0;
    for (var i = 0; i < sets.length; i++) {
      final side = setWinnerSide(sets, i, profile);
      if (side == 'A') {
        a++;
      } else if (side == 'B') {
        b++;
      }
    }
    return (a: a, b: b);
  }

  static String? matchWinnerSide(
    List<ScoreSetValue> sets,
    ScoringProfile profile,
  ) {
    final needed = (profile.bestOf / 2).ceil();
    final wins = setsWon(sets, profile);
    if (wins.a >= needed && wins.a > wins.b) return 'A';
    if (wins.b >= needed && wins.b > wins.a) return 'B';
    return null;
  }

  static String _setNotWonMessage(
    ScoreSetValue s,
    int index,
    ScoringProfile profile,
  ) {
    final label = 'Set ${index + 1}';
    switch (profile) {
      case SetsPointsProfile p:
        final target = setPointsTarget(p, index);
        final cap = p.pointCap == null ? '' : ' (teto ${p.pointCap})';
        return '$label: vitória exige $target pontos com vantagem de ${p.winBy}$cap.';
      case SetsGamesProfile p:
        if (_isSuperTiebreakSet(p, index)) {
          return '$label: super tie-break até ${p.superTiebreakTo} com vantagem de $_tiebreakWinBy.';
        }
        final hi = s.a > s.b ? s.a : s.b;
        final lo = s.a > s.b ? s.b : s.a;
        final tbAt = p.tiebreakAtGames;
        if (tbAt != null && hi == tbAt + 1 && lo == tbAt) {
          return s.tb != null
              ? '$label: tie-break até ${p.tiebreakTo} com vantagem de $_tiebreakWinBy.'
              : '$label: $hi-$lo exige o placar do tie-break.';
        }
        return '$label: set até ${p.gamesPerSet} games com vantagem de ${p.winByGames}.';
    }
  }

  /// Validação do placar final (lançamento rápido e fechamento da mesa).
  /// Mensagens do perfil histórico idênticas às que app e portal exibem hoje.
  static List<ScoreIssue> validate(
    List<ScoreSetValue> sets,
    ScoringProfile profile, {
    bool requireMatchWinner = true,
  }) {
    if (sets.isEmpty) {
      return [(setIndex: null, message: 'Informe ao menos um set.')];
    }
    final issues = <ScoreIssue>[];
    if (sets.length > profile.bestOf) {
      issues.add((
        setIndex: null,
        message: 'Máximo de ${profile.bestOf} sets.',
      ));
    }
    for (var i = 0; i < sets.length; i++) {
      final s = sets[i];
      final label = 'Set ${i + 1}';
      if (s.a == s.b) {
        issues.add((
          setIndex: i,
          message: '$label: não pode terminar empatado.',
        ));
        continue;
      }
      if (s.a < 0 || s.b < 0 || s.a > 99 || s.b > 99) {
        issues.add((
          setIndex: i,
          message: '$label: placar fora do intervalo (0–99).',
        ));
        continue;
      }
      if (setWinnerSide(sets, i, profile) == null) {
        issues.add((setIndex: i, message: _setNotWonMessage(s, i, profile)));
      }
    }
    final hasSetErrors = issues.any((x) => x.setIndex != null);
    if (requireMatchWinner &&
        !hasSetErrors &&
        matchWinnerSide(sets, profile) == null) {
      issues.add((
        setIndex: null,
        message: 'Complete o placar: nenhuma dupla venceu ainda.',
      ));
    }
    return issues;
  }
}
