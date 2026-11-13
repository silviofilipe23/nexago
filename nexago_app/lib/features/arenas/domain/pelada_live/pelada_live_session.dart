import 'package:flutter/foundation.dart';

import '../booking_result.dart';
import 'pelada_live_match.dart';
import 'pelada_live_rules.dart';

/// A marcação ao vivo de uma pelada inteira: os jogos já fechados ([base]),
/// quem está em quadra agora e a partida em andamento, com o histórico do
/// "Desfazer". Com três ou mais times é o rei da quadra: cada jogo é um set e
/// quem vence fica ([BookingResult.addGame]).
@immutable
class PeladaLiveSession {
  const PeladaLiveSession({
    required this.base,
    required this.teamA,
    required this.teamB,
    required this.match,
    required this.startedAt,
    this.history = const [],
  });

  /// Times da pelada e os jogos já fechados nesta marcação (no rei da quadra,
  /// também os que já tinham placar antes dela).
  final BookingResult base;

  /// Quem está em cima (lado A) e embaixo (lado B) da tela.
  final int teamA;
  final int teamB;
  final PeladaLiveMatch match;

  /// Estados anteriores da partida atual, do mais antigo ao mais novo.
  final List<PeladaLiveMatch> history;
  final DateTime startedAt;

  /// Até onde o "Desfazer" volta (o rascunho guarda o mesmo tanto).
  static const int maxHistory = 300;

  PeladaLiveRules get rules => match.rules;

  /// Vitórias de cada time nos jogos já fechados (o "2 vitórias" do rei da
  /// quadra).
  int winsOf(int teamId) => base.winsOf(teamId);
  bool get isRotation => base.isRotation;

  ResultTeam? get teamOnA => base.teamById(teamA);
  ResultTeam? get teamOnB => base.teamById(teamB);

  int teamIdOf(LiveSide side) => side == LiveSide.a ? teamA : teamB;

  bool get canUndo => history.isNotEmpty;

  /// Começa a marcar a partir do placar que estava na tela. Dois times: os
  /// sets marcados SUBSTITUEM os do placar. Rei da quadra: os jogos que já
  /// tinham placar ficam, e o próximo segue a fila.
  static PeladaLiveSession start(
    BookingResult initial,
    PeladaLiveRules rules, {
    LiveSide? firstServe,
    bool swapSides = false,
    required DateTime now,
  }) {
    final rotation = initial.isRotation;
    final base = BookingResult(
      teams: initial.teams,
      games: rotation
          ? [
              for (final g in initial.games)
                if (g.scoreA > 0 || g.scoreB > 0) g,
            ]
          : const [],
    );
    final pairing = _nextPairing(base);
    final effective = rotation ? rules.forRotation() : rules;
    var match = PeladaLiveMatch(rules: effective, serving: firstServe);
    if (effective.timed) match = match.resume(now);
    return PeladaLiveSession(
      base: base,
      teamA: swapSides ? pairing.b : pairing.a,
      teamB: swapSides ? pairing.a : pairing.b,
      match: match,
      startedAt: now,
    );
  }

  /// Próximo confronto: o mesmo dos dois times; no rei da quadra, quem venceu
  /// o último fica contra o próximo da fila.
  static ({int a, int b}) _nextPairing(BookingResult base) {
    final next = base.addGame().games.last;
    return (a: next.teamA, b: next.teamB);
  }

  PeladaLiveSession _with(PeladaLiveMatch next) => PeladaLiveSession(
        base: base,
        teamA: teamA,
        teamB: teamB,
        match: next,
        startedAt: startedAt,
        history: [
          ...history.length >= maxHistory
              ? history.sublist(history.length - maxHistory + 1)
              : history,
          match,
        ],
      );

  /// Ponto para [side]. Lance depois do fim não conta.
  PeladaLiveSession point(LiveSide side,
      {int value = 1, required DateTime now}) {
    if (match.finished) return this;
    return _with(match.point(side, value: value, now: now));
  }

  /// Volta o último lance. O cronômetro não volta: continua como está.
  PeladaLiveSession undo({required DateTime now}) {
    if (history.isEmpty) return this;
    var previous = history.last;
    if (rules.timed) {
      final keepRunning = match.running || match.finished;
      previous = PeladaLiveMatch(
        rules: previous.rules,
        sets: previous.sets,
        currentSet: previous.currentSet,
        game: previous.game,
        serving: previous.serving,
        golden: previous.golden,
        winner: previous.winner,
        elapsedMs: match.elapsedAt(now),
        runningSince: keepRunning && previous.winner == null ? now : null,
      );
    }
    return PeladaLiveSession(
      base: base,
      teamA: teamA,
      teamB: teamB,
      match: previous,
      startedAt: startedAt,
      history: history.sublist(0, history.length - 1),
    );
  }

  /// Troca o cronômetro, a marcação de saque ou o fim do tempo — lances que
  /// não entram no "Desfazer".
  PeladaLiveSession withMatch(PeladaLiveMatch next) => PeladaLiveSession(
        base: base,
        teamA: teamA,
        teamB: teamB,
        match: next,
        startedAt: startedAt,
        history: history,
      );

  /// Inverte cima e baixo da tela (quando as duplas trocam de lado).
  PeladaLiveSession swapSides() => PeladaLiveSession(
        base: base,
        teamA: teamB,
        teamB: teamA,
        match: match.mirrored(),
        startedAt: startedAt,
        history: [for (final h in history) h.mirrored()],
      );

  List<ResultGame> _currentGames() => [
        for (final s in match.toScores())
          ResultGame(teamA: teamA, teamB: teamB, scoreA: s.a, scoreB: s.b),
      ];

  /// Fecha a partida atual e começa a próxima (próximo set livre, ou o
  /// próximo jogo do rei da quadra). [challengerId] (rei da quadra): a galera
  /// trocou quem entra — um time da fila no lugar do primeiro dela; quem foi
  /// pulado continua na frente para o jogo seguinte.
  PeladaLiveSession nextGame({required DateTime now, int? challengerId}) {
    final closed = BookingResult(
      teams: base.teams,
      games: [...base.games, ..._currentGames()],
    );
    var pairing = _nextPairing(closed);
    if (challengerId != null &&
        isRotation &&
        challengerId != pairing.a &&
        closed.teamById(challengerId) != null) {
      pairing = (a: pairing.a, b: challengerId);
    }
    var next = PeladaLiveMatch(rules: rules);
    if (rules.timed) next = next.resume(now);
    // Quem estava em cima continua em cima, se seguir em quadra.
    final keepOrder = pairing.a == teamA ||
        pairing.b == teamB ||
        (pairing.a != teamB && pairing.b != teamA);
    return PeladaLiveSession(
      base: closed,
      teamA: keepOrder ? pairing.a : pairing.b,
      teamB: keepOrder ? pairing.b : pairing.a,
      match: next,
      startedAt: startedAt,
    );
  }

  /// Número do set (dois times) ou do jogo (rei da quadra, gols, cestas) em
  /// andamento, contando os já fechados nesta marcação.
  int get gameNumber => isRotation || !rules.usesSets
      ? base.games.length + 1
      : base.games.length + match.currentSet + 1;

  /// "Set 2 · 12–9", "Jogo 3 · 1–0" — o resumo do "Continuar marcação".
  String get progressLabel {
    final unit = isRotation || !rules.usesSets ? 'Jogo' : 'Set';
    final s = match.current;
    if (rules.mode == PeladaLiveMode.setsGames) {
      return '$unit $gameNumber · games ${s.a}–${s.b}';
    }
    return '$unit $gameNumber · ${s.a}–${s.b}';
  }

  /// Quantos jogos (sets) a marcação já tem, contando o em andamento.
  int get gamesCount => base.games.length + _currentGames().length;

  /// O placar da pelada para o Editar placar. Sem nenhum ponto, devolve um
  /// jogo 0×0 entre quem está em quadra (o placar sempre tem um).
  BookingResult toResult() {
    final games = [...base.games, ..._currentGames()];
    return BookingResult(
      teams: base.teams,
      games: games.isEmpty ? [ResultGame(teamA: teamA, teamB: teamB)] : games,
    );
  }

  /// Quem espera na fila do rei da quadra, na ordem em que entra.
  List<ResultTeam> get queue =>
      isRotation ? base.rotationQueue(onCourt: {teamA, teamB}) : const [];

  /// Rei da quadra, no fim de um jogo: quem pode entrar no próximo — a fila
  /// toda, menos quem acabou de perder (vai para o fim). O primeiro é o da
  /// vez.
  List<ResultTeam> nextChallengers({required DateTime now}) {
    if (!isRotation) return const [];
    final after = nextGame(now: now);
    // O lado de cada um pode trocar no próximo jogo: quem fica é quem venceu.
    final winner = match.winner;
    final stays = winner == LiveSide.b ? teamB : teamA;
    final loser = winner == null ? null : (stays == teamA ? teamB : teamA);
    final firstId = after.teamA == stays ? after.teamB : after.teamA;
    final first = after.base.teamById(firstId);
    return [
      if (first != null) first,
      for (final t in after.base.rotationQueue(onCourt: {stays, firstId}))
        if (t.id != loser) t,
    ];
  }

  // Rascunho -----------------------------------------------------------------

  Map<String, Object?> toJson() => {
        'v': 1,
        'teams': [
          for (final t in base.teams)
            {
              'id': t.id,
              'customName': t.customName,
              'players': [
                for (final p in t.players)
                  {'id': p.id, 'name': p.name, 'avatarUrl': p.avatarUrl},
              ],
            },
        ],
        'games': [
          for (final g in base.games)
            {'a': g.teamA, 'b': g.teamB, 'sa': g.scoreA, 'sb': g.scoreB},
        ],
        'teamA': teamA,
        'teamB': teamB,
        'match': match.toJson(),
        'history': [for (final h in history) h.toJson()],
        'startedAt': startedAt.millisecondsSinceEpoch,
      };

  static PeladaLiveSession? fromJson(Object? raw) {
    if (raw is! Map || raw['v'] != 1) return null;
    final match = PeladaLiveMatch.fromJson(raw['match']);
    if (match == null) return null;
    int? id(Object? v) => v is int ? v : null;
    final teams = <ResultTeam>[];
    final rawTeams = raw['teams'];
    if (rawTeams is List) {
      for (final t in rawTeams) {
        if (t is! Map || id(t['id']) == null) continue;
        final players = <ResultPlayer>[];
        final rawPlayers = t['players'];
        if (rawPlayers is List) {
          for (final p in rawPlayers) {
            if (p is! Map) continue;
            final pid = p['id'];
            final name = p['name'];
            if (pid is! String || name is! String) continue;
            final avatar = p['avatarUrl'];
            players.add(
              ResultPlayer(
                id: pid,
                name: name,
                avatarUrl: avatar is String ? avatar : null,
              ),
            );
          }
        }
        final custom = t['customName'];
        teams.add(
          ResultTeam(
            id: id(t['id'])!,
            players: players,
            customName: custom is String ? custom : null,
          ),
        );
      }
    }
    final teamA = id(raw['teamA']);
    final teamB = id(raw['teamB']);
    final known = {for (final t in teams) t.id};
    if (teams.length < 2 ||
        teamA == null ||
        teamB == null ||
        teamA == teamB ||
        !known.contains(teamA) ||
        !known.contains(teamB)) {
      return null;
    }
    final games = <ResultGame>[];
    final rawGames = raw['games'];
    if (rawGames is List) {
      for (final g in rawGames) {
        if (g is! Map) continue;
        final a = id(g['a']);
        final b = id(g['b']);
        if (a == null ||
            b == null ||
            !known.contains(a) ||
            !known.contains(b)) {
          continue;
        }
        games.add(
          ResultGame(
            teamA: a,
            teamB: b,
            scoreA: id(g['sa']) ?? 0,
            scoreB: id(g['sb']) ?? 0,
          ),
        );
      }
    }
    final history = <PeladaLiveMatch>[];
    final rawHistory = raw['history'];
    if (rawHistory is List) {
      for (final h in rawHistory) {
        final m = PeladaLiveMatch.fromJson(h);
        if (m != null) history.add(m);
      }
    }
    final started = raw['startedAt'];
    return PeladaLiveSession(
      base: BookingResult(teams: teams, games: games),
      teamA: teamA,
      teamB: teamB,
      match: match,
      history: history,
      startedAt: started is int
          ? DateTime.fromMillisecondsSinceEpoch(started)
          : DateTime.now(),
    );
  }
}
