import 'scoring_profile.dart';
import 'scoring_rules.dart';

/// Pontos do game em andamento (ou do tie-break, quando o set está nele).
typedef GamePoints = ({int a, int b});

/// Estado da mesa ao vivo de uma partida de games.
typedef GamesLiveState = ({
  List<ScoreSetValue> sets,
  int currentSetIndex,
  GamePoints currentGame,

  /// `''` = ninguém com o saque (a mesa pergunta).
  String servingTeamId,
});

/// O que um ponto fechou: nada, um game, um set ou a partida.
enum GamesClosed { none, game, set, match }

typedef GamesPointResult = ({
  GamesLiveState state,
  String? winnerSide,
  GamesClosed closed,
});

/// Motor da mesa ao vivo para partidas de games (spec multiesporte, fase
/// 2b2): pontos do game (0/15/30/40/AD ou sem vantagem), tie-break, super
/// tie-break no set decisivo e saque alternando por game. A MESMA lógica vive
/// em `frontend/shared/sports/live-games.ts`; `liveVectors` em
/// `sports/scoring-vectors.json` provam a paridade.
abstract final class LiveGames {
  LiveGames._();

  static const int _tiebreakWinBy = 2;
  static const List<String> _gamePointNames = ['0', '15', '30', '40'];

  static int _clampSetIndex(int index, int bestOf) =>
      index.clamp(0, bestOf - 1);

  static String _otherTeam(
    String servingTeamId,
    String teamAId,
    String teamBId,
  ) {
    if (servingTeamId == teamAId) return teamBId;
    if (servingTeamId == teamBId) return teamAId;
    return '';
  }

  static bool isTiebreakInProgress(
    GamesLiveState state,
    SetsGamesProfile profile,
  ) {
    final idx = _clampSetIndex(state.currentSetIndex, profile.bestOf);
    if (ScoringRules.isSuperTiebreakSet(profile, idx)) return true;
    final s = idx < state.sets.length ? state.sets[idx] : null;
    final tbAt = profile.tiebreakAtGames;
    return tbAt != null && s != null && s.a == tbAt && s.b == tbAt;
  }

  static GamesPointResult apply(
    GamesLiveState state,
    String side,
    SetsGamesProfile profile, {
    required String teamAId,
    required String teamBId,
  }) {
    final idx = _clampSetIndex(state.currentSetIndex, profile.bestOf);
    final sets = List<ScoreSetValue>.of(state.sets);
    while (sets.length <= idx) {
      sets.add(const ScoreSetValue(0, 0));
    }
    final cur = sets[idx];
    final isA = side == 'A';
    final GamePoints game = (
      a: state.currentGame.a + (isA ? 1 : 0),
      b: state.currentGame.b + (isA ? 0 : 1),
    );
    var serving = state.servingTeamId;

    final superTiebreak = ScoringRules.isSuperTiebreakSet(profile, idx);
    final tbAt = profile.tiebreakAtGames;
    final tiebreak =
        superTiebreak || (tbAt != null && cur.a == tbAt && cur.b == tbAt);

    GamesPointResult open() => (
      state: (
        sets: sets,
        currentSetIndex: idx,
        currentGame: game,
        servingTeamId: serving,
      ),
      winnerSide: null,
      closed: GamesClosed.none,
    );

    if (tiebreak) {
      final target = superTiebreak
          ? profile.superTiebreakTo
          : profile.tiebreakTo;
      if (!ScoringRules.isPointsSetWon(
        game.a,
        game.b,
        target,
        _tiebreakWinBy,
        null,
      )) {
        // No tie-break o saque troca depois do 1º ponto e, daí em diante, a
        // cada 2.
        if ((game.a + game.b).isOdd) {
          serving = _otherTeam(serving, teamAId, teamBId);
        }
        return open();
      }
      final winnerA = game.a > game.b;
      final tb = ScoreSetValue(game.a, game.b);
      sets[idx] = superTiebreak
          ? ScoreSetValue(winnerA ? 1 : 0, winnerA ? 0 : 1, tb: tb)
          : ScoreSetValue(
              cur.a + (winnerA ? 1 : 0),
              cur.b + (winnerA ? 0 : 1),
              tb: tb,
            );
    } else {
      final reached = game.a >= 4 || game.b >= 4;
      final gameWon = profile.noAd
          ? reached
          : reached && (game.a - game.b).abs() >= 2;
      if (!gameWon) return open();
      final winnerA = game.a > game.b;
      sets[idx] = ScoreSetValue(
        cur.a + (winnerA ? 1 : 0),
        cur.b + (winnerA ? 0 : 1),
        tb: cur.tb,
      );
      serving = _otherTeam(serving, teamAId, teamBId);
    }

    const GamePoints zero = (a: 0, b: 0);
    if (ScoringRules.setWinnerSide(sets, idx, profile) == null) {
      return (
        state: (
          sets: sets,
          currentSetIndex: idx,
          currentGame: zero,
          servingTeamId: serving,
        ),
        winnerSide: null,
        closed: GamesClosed.game,
      );
    }
    final matchWinner = ScoringRules.matchWinnerSide(sets, profile);
    if (matchWinner != null) {
      return (
        state: (
          sets: sets,
          currentSetIndex: idx,
          currentGame: zero,
          servingTeamId: serving,
        ),
        winnerSide: matchWinner,
        closed: GamesClosed.match,
      );
    }
    // Virada de set: quem abre o próximo não sai do placar — a mesa volta a
    // perguntar.
    return (
      state: (
        sets: sets,
        currentSetIndex: _clampSetIndex(idx + 1, profile.bestOf),
        currentGame: zero,
        servingTeamId: '',
      ),
      winnerSide: null,
      closed: GamesClosed.set,
    );
  }

  /// Placar do game em andamento como o painel mostra: 0/15/30/40/AD, ou os
  /// pontos do tie-break.
  static ({String a, String b}) pointLabels(
    GamesLiveState state,
    SetsGamesProfile profile,
  ) {
    final g = state.currentGame;
    if (isTiebreakInProgress(state, profile)) return (a: '${g.a}', b: '${g.b}');
    if (!profile.noAd && g.a >= 3 && g.b >= 3) {
      if (g.a == g.b) return (a: '40', b: '40');
      return g.a > g.b ? (a: 'AD', b: '40') : (a: '40', b: 'AD');
    }
    return (
      a: _gamePointNames[g.a.clamp(0, 3)],
      b: _gamePointNames[g.b.clamp(0, 3)],
    );
  }

  /// "match point", "set point", "game point", "tie-break", "super tie-break"
  /// ou `null`.
  static String? hint(
    GamesLiveState state,
    SetsGamesProfile profile, {
    required String teamAId,
    required String teamBId,
  }) {
    final a = apply(state, 'A', profile, teamAId: teamAId, teamBId: teamBId);
    final b = apply(state, 'B', profile, teamAId: teamAId, teamBId: teamBId);
    final best = a.closed.index > b.closed.index ? a.closed : b.closed;
    switch (best) {
      case GamesClosed.match:
        return 'match point';
      case GamesClosed.set:
        return 'set point';
      case GamesClosed.game:
        return 'game point';
      case GamesClosed.none:
        if (!isTiebreakInProgress(state, profile)) return null;
        final idx = _clampSetIndex(state.currentSetIndex, profile.bestOf);
        return ScoringRules.isSuperTiebreakSet(profile, idx)
            ? 'super tie-break'
            : 'tie-break';
    }
  }

  /// Bandeira do canto do painel: o próximo ponto daquele lado fecha o set —
  /// ou a partida.
  static String? flag(
    GamesLiveState state,
    SetsGamesProfile profile,
    String side, {
    required String teamAId,
    required String teamBId,
  }) {
    final closed = apply(
      state,
      side,
      profile,
      teamAId: teamAId,
      teamBId: teamBId,
    ).closed;
    if (closed == GamesClosed.match) return 'match';
    if (closed == GamesClosed.set) return 'set';
    return null;
  }
}
