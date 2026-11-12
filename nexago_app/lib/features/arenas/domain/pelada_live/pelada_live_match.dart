import 'package:flutter/foundation.dart';

import '../../../../core/sports/live_games.dart';
import '../../../../core/sports/scoring_profile.dart';
import '../../../../core/sports/scoring_rules.dart';
import 'pelada_live_rules.dart';

/// Lado do placar ao vivo: o time de cima (`a`) ou o de baixo (`b`).
enum LiveSide {
  a,
  b;

  LiveSide get other => this == a ? b : a;
  String get wire => this == a ? 'A' : 'B';

  static LiveSide? fromWire(Object? raw) =>
      raw == 'A' ? a : (raw == 'B' ? b : null);
}

/// O que o último lance fechou — a tela avisa (vibração, faixa, folha).
enum LiveEvent { none, game, set, match, courtSwitch, timeUp, golden }

/// Uma partida marcada ao vivo entre dois times. Imutável: cada lance devolve
/// uma nova, e o "Desfazer" é voltar para a anterior. Os modos de set usam o
/// núcleo de regras do app ([ScoringRules] / [LiveGames]) — o mesmo da mesa do
/// organizador; gols, cestas e pontos ficam num set só.
@immutable
class PeladaLiveMatch {
  const PeladaLiveMatch({
    required this.rules,
    this.sets = const [ScoreSetValue(0, 0)],
    this.currentSet = 0,
    this.game = (a: 0, b: 0),
    this.serving,
    this.golden = false,
    this.winner,
    this.elapsedMs = 0,
    this.runningSince,
    this.lastEvent = LiveEvent.none,
  });

  final PeladaLiveRules rules;

  /// Placar de cada set (games, nos modos de games); gols, cestas e pontos
  /// usam só o primeiro.
  final List<ScoreSetValue> sets;
  final int currentSet;

  /// Pontos do game em andamento (ou do tie-break), nos modos de games.
  final GamePoints game;

  /// Quem saca; `null` = ninguém marcado.
  final LiveSide? serving;

  /// Acabou o tempo empatado: o próximo ponto decide.
  final bool golden;

  /// Quem venceu; `null` com o jogo em andamento.
  final LiveSide? winner;

  /// Cronômetro: o tempo já corrido antes de [runningSince].
  final int elapsedMs;

  /// Quando o cronômetro voltou a correr; `null` = parado.
  final DateTime? runningSince;
  final LiveEvent lastEvent;

  bool get finished => winner != null;

  ScoreSetValue get current =>
      currentSet < sets.length ? sets[currentSet] : const ScoreSetValue(0, 0);

  /// Algum ponto já marcado (inclusive dentro do game em andamento).
  bool get hasPoints =>
      sets.any((s) => s.a > 0 || s.b > 0 || s.tb != null) ||
      game.a > 0 ||
      game.b > 0;

  int scoreOf(LiveSide side) => side == LiveSide.a ? current.a : current.b;

  /// Sets (ou jogos) já vencidos por cada lado.
  ({int a, int b}) get setsWon {
    final p = rules.profile;
    if (p == null) return (a: 0, b: 0);
    return ScoringRules.setsWon(sets, p);
  }

  SetsGamesProfile? get _gamesProfile {
    final p = rules.profile;
    return p is SetsGamesProfile ? p : null;
  }

  GamesLiveState get _gamesState => (
        sets: sets,
        currentSetIndex: currentSet,
        currentGame: game,
        servingTeamId: serving?.wire ?? '',
      );

  bool get inTiebreak {
    final p = _gamesProfile;
    return p != null && LiveGames.isTiebreakInProgress(_gamesState, p);
  }

  bool get inSuperTiebreak {
    final p = _gamesProfile;
    return p != null && ScoringRules.isSuperTiebreakSet(p, currentSet);
  }

  /// O número grande de cada lado: pontos do set, `15/30/40/AD` do game,
  /// gols ou pontos.
  ({String a, String b}) get display {
    final p = _gamesProfile;
    if (p != null) return LiveGames.pointLabels(_gamesState, p);
    return (a: '${current.a}', b: '${current.b}');
  }

  /// "até 21", "até 6 games", "super tie-break até 10".
  String get targetLabel {
    final p = rules.profile;
    if (p != null) return ScoringRules.setTargetLabel(p, currentSet);
    final limit = rules.limit;
    if (limit == null) return '';
    return rules.mode == PeladaLiveMode.goals
        ? '$limit ${limit == 1 ? 'gol' : 'gols'}'
        : 'até $limit';
  }

  // Cronômetro ---------------------------------------------------------------

  int elapsedAt(DateTime now) {
    final since = runningSince;
    if (since == null) return elapsedMs;
    final run = now.difference(since).inMilliseconds;
    return elapsedMs + (run < 0 ? 0 : run);
  }

  /// Quanto falta; `null` sem cronômetro.
  int? remainingAt(DateTime now) {
    final minutes = rules.timed ? rules.minutes : null;
    if (minutes == null) return null;
    final left = minutes * 60000 - elapsedAt(now);
    return left < 0 ? 0 : left;
  }

  bool get running => runningSince != null;

  PeladaLiveMatch resume(DateTime now) =>
      running || finished ? this : _copy(runningSince: () => now);

  PeladaLiveMatch pause(DateTime now) => !running
      ? this
      : _copy(elapsedMs: elapsedAt(now), runningSince: () => null);

  /// O cronômetro zerou: vence quem está na frente; empatado, o próximo ponto
  /// decide (pelada não tem empate).
  PeladaLiveMatch expire(DateTime now) {
    if (finished || golden || !rules.timed) return this;
    final paused = pause(now);
    final a = current.a;
    final b = current.b;
    if (a == b) {
      return paused._copy(golden: true, lastEvent: LiveEvent.golden);
    }
    return paused._copy(
      winner: () => a > b ? LiveSide.a : LiveSide.b,
      lastEvent: LiveEvent.timeUp,
    );
  }

  // Lances ------------------------------------------------------------------

  /// Ponto (gol, cesta) para [side]. [value] só vale nas cestas.
  PeladaLiveMatch point(LiveSide side, {int value = 1, DateTime? now}) {
    if (finished) return this;
    switch (rules.mode) {
      case PeladaLiveMode.setsPoints:
        return _pointSetsPoints(side);
      case PeladaLiveMode.setsGames:
        return _pointGames(side);
      case PeladaLiveMode.goals:
      case PeladaLiveMode.baskets:
      case PeladaLiveMode.points:
        return _pointPeriod(side, value < 1 ? 1 : value, now);
    }
  }

  PeladaLiveMatch _pointSetsPoints(LiveSide side) {
    final p = rules.profile! as SetsPointsProfile;
    final next = List<ScoreSetValue>.of(sets);
    while (next.length <= currentSet) {
      next.add(const ScoreSetValue(0, 0));
    }
    final s = next[currentSet];
    final updated = side == LiveSide.a
        ? ScoreSetValue(_cap(s.a + 1), s.b)
        : ScoreSetValue(s.a, _cap(s.b + 1));
    next[currentSet] = updated;
    // Ponto corrido: quem fez o ponto passa a sacar.
    if (ScoringRules.setWinnerSide(next, currentSet, p) == null) {
      final every = rules.courtSwitchEvery(currentSet);
      final total = updated.a + updated.b;
      final swap = every != null && total % every == 0;
      return _copy(
        sets: next,
        serving: () => side,
        lastEvent: swap ? LiveEvent.courtSwitch : LiveEvent.none,
      );
    }
    final matchWinner = ScoringRules.matchWinnerSide(next, p);
    if (matchWinner != null || currentSet + 1 >= p.bestOf) {
      return _copy(
        sets: next,
        serving: () => side,
        winner: () => LiveSide.fromWire(matchWinner) ?? side,
        lastEvent: LiveEvent.match,
      );
    }
    return _copy(
      sets: [...next, const ScoreSetValue(0, 0)],
      currentSet: currentSet + 1,
      serving: () => side.other,
      lastEvent: LiveEvent.set,
    );
  }

  PeladaLiveMatch _pointGames(LiveSide side) {
    final p = _gamesProfile!;
    final r = LiveGames.apply(
      _gamesState,
      side.wire,
      p,
      teamAId: 'A',
      teamBId: 'B',
    );
    var serving = LiveSide.fromWire(r.state.servingTeamId);
    // Na virada de set o motor esquece o saque; na pelada ele só alterna.
    if (r.closed == GamesClosed.set && this.serving != null) {
      serving = this.serving!.other;
    }
    final event = switch (r.closed) {
      GamesClosed.none => LiveEvent.none,
      GamesClosed.game => LiveEvent.game,
      GamesClosed.set => LiveEvent.set,
      GamesClosed.match => LiveEvent.match,
    };
    final setsAfter = List<ScoreSetValue>.of(r.state.sets);
    if (r.closed == GamesClosed.set) {
      while (setsAfter.length <= r.state.currentSetIndex) {
        setsAfter.add(const ScoreSetValue(0, 0));
      }
    }
    return _copy(
      sets: setsAfter,
      currentSet: r.state.currentSetIndex,
      game: r.state.currentGame,
      serving: () => serving,
      winner: () => r.closed == GamesClosed.match
          ? LiveSide.fromWire(r.winnerSide) ?? side
          : null,
      lastEvent: event,
    );
  }

  PeladaLiveMatch _pointPeriod(LiveSide side, int value, DateTime? now) {
    final s = current;
    final updated = side == LiveSide.a
        ? ScoreSetValue(_cap(s.a + value), s.b)
        : ScoreSetValue(s.a, _cap(s.b + value));
    final mine = side == LiveSide.a ? updated.a : updated.b;
    final limit = rules.limit;
    final wins = golden || (limit != null && mine >= limit);
    final next = _copy(sets: [updated], lastEvent: LiveEvent.none);
    if (!wins) return next;
    final stopped =
        now == null ? next._copy(runningSince: () => null) : next.pause(now);
    return stopped._copy(
      winner: () => side,
      golden: false,
      lastEvent: LiveEvent.match,
    );
  }

  static int _cap(int v) => v > 99 ? 99 : v;

  /// O próximo ponto de [side] fecha o quê: "match point", "set point",
  /// "game point", "ponto da vitória" — ou `null`.
  String? flagFor(LiveSide side) {
    if (finished) return null;
    final next = point(side);
    switch (next.lastEvent) {
      case LiveEvent.match:
        if (!rules.usesSets) {
          return rules.mode == PeladaLiveMode.goals
              ? 'gol da vitória'
              : 'ponto da vitória';
        }
        return rules.bestOf > 1 ? 'match point' : 'set point';
      case LiveEvent.set:
        return 'set point';
      default:
        return null;
    }
  }

  /// Faixa do meio: "ponto de ouro", "tie-break", "super tie-break",
  /// "gol de ouro" — ou `null`.
  String? get stateLabel {
    if (golden) {
      return rules.mode == PeladaLiveMode.goals
          ? 'gol de ouro'
          : 'ponto de ouro';
    }
    final p = _gamesProfile;
    if (p == null || finished) return null;
    if (inSuperTiebreak) return 'super tie-break';
    if (inTiebreak) return 'tie-break';
    if (p.noAd && game.a == 3 && game.b == 3) return 'ponto de ouro';
    return null;
  }

  /// Os jogos do placar da pelada: um por set com ponto; o super tie-break
  /// entra pelos pontos dele (10–8), não pelo 1×0. O set sem nenhum game
  /// fechado fica de fora.
  List<({int a, int b})> toScores() {
    final p = _gamesProfile;
    final out = <({int a, int b})>[];
    for (var i = 0; i < sets.length; i++) {
      final s = sets[i];
      final tb = s.tb;
      if (p != null && tb != null && ScoringRules.isSuperTiebreakSet(p, i)) {
        out.add((a: tb.a, b: tb.b));
        continue;
      }
      if (s.a == 0 && s.b == 0) continue;
      out.add((a: s.a, b: s.b));
    }
    return out;
  }

  /// O mesmo jogo visto do outro lado (para "trocar lados" sem perder nada).
  PeladaLiveMatch mirrored() => _copy(
        sets: [
          for (final s in sets)
            ScoreSetValue(
              s.b,
              s.a,
              tb: s.tb == null ? null : ScoreSetValue(s.tb!.b, s.tb!.a),
            ),
        ],
        game: (a: game.b, b: game.a),
        serving: () => serving?.other,
        winner: () => winner?.other,
      );

  PeladaLiveMatch withServing(LiveSide? side) => _copy(serving: () => side);

  PeladaLiveMatch _copy({
    List<ScoreSetValue>? sets,
    int? currentSet,
    GamePoints? game,
    LiveSide? Function()? serving,
    bool? golden,
    LiveSide? Function()? winner,
    int? elapsedMs,
    DateTime? Function()? runningSince,
    LiveEvent? lastEvent,
  }) =>
      PeladaLiveMatch(
        rules: rules,
        sets: sets ?? this.sets,
        currentSet: currentSet ?? this.currentSet,
        game: game ?? this.game,
        serving: serving != null ? serving() : this.serving,
        golden: golden ?? this.golden,
        winner: winner != null ? winner() : this.winner,
        elapsedMs: elapsedMs ?? this.elapsedMs,
        runningSince: runningSince != null ? runningSince() : this.runningSince,
        lastEvent: lastEvent ?? this.lastEvent,
      );

  // Rascunho -----------------------------------------------------------------

  Map<String, Object?> toJson() => {
        'rules': rules.toJson(),
        'sets': [
          for (final s in sets)
            {
              'a': s.a,
              'b': s.b,
              if (s.tb != null) 'tb': {'a': s.tb!.a, 'b': s.tb!.b},
            },
        ],
        'currentSet': currentSet,
        'game': {'a': game.a, 'b': game.b},
        'serving': serving?.wire,
        'golden': golden,
        'winner': winner?.wire,
        'elapsedMs': elapsedMs,
        'runningSince': runningSince?.millisecondsSinceEpoch,
      };

  static PeladaLiveMatch? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final rules = PeladaLiveRules.fromJson(raw['rules']);
    if (rules == null) return null;
    int n(Object? v) => v is int && v >= 0 ? v : 0;
    ScoreSetValue set(Object? v) {
      final m = v is Map ? v : const {};
      final tb = m['tb'];
      return ScoreSetValue(
        n(m['a']),
        n(m['b']),
        tb: tb is Map ? ScoreSetValue(n(tb['a']), n(tb['b'])) : null,
      );
    }

    final rawSets = raw['sets'];
    final sets = [
      if (rawSets is List)
        for (final s in rawSets) set(s),
    ];
    if (sets.isEmpty) sets.add(const ScoreSetValue(0, 0));
    final g = raw['game'] is Map ? raw['game'] as Map : const {};
    final since = raw['runningSince'];
    return PeladaLiveMatch(
      rules: rules,
      sets: sets,
      currentSet: n(raw['currentSet']).clamp(0, sets.length - 1),
      game: (a: n(g['a']), b: n(g['b'])),
      serving: LiveSide.fromWire(raw['serving']),
      golden: raw['golden'] == true,
      winner: LiveSide.fromWire(raw['winner']),
      elapsedMs: n(raw['elapsedMs']),
      runningSince:
          since is int ? DateTime.fromMillisecondsSinceEpoch(since) : null,
    );
  }
}
