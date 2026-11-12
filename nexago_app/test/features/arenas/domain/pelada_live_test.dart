import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_match.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_rules.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_session.dart';

final _t0 = DateTime(2026, 11, 12, 18);

PeladaLiveMatch _points(PeladaLiveMatch m, LiveSide side, int n) {
  for (var i = 0; i < n; i++) {
    m = m.point(side);
  }
  return m;
}

ResultTeam _team(int id, String name) => ResultTeam(
      id: id,
      players: [ResultPlayer(id: 'u$id', name: name)],
    );

BookingResult _two() => BookingResult(
      teams: [_team(0, 'Maria'), _team(1, 'Caio')],
      games: const [ResultGame(teamA: 0, teamB: 1)],
    );

BookingResult _three() => BookingResult(
      teams: [_team(0, 'Pedro'), _team(1, 'Gui'), _team(2, 'Mateus')],
      games: const [ResultGame(teamA: 0, teamB: 1)],
    );

void main() {
  group('PeladaLiveRules.forSport', () {
    test('cada esporte cai no marcador certo com o padrão do catálogo', () {
      final beach = PeladaLiveRules.forSport('beachVolleyball');
      expect(beach.mode, PeladaLiveMode.setsPoints);
      expect(beach.setTarget, 21);
      expect(beach.decidingSetTarget, 15);
      expect(beach.courtSwitch, isTrue);

      final foot = PeladaLiveRules.forSport('Futevôlei');
      expect(foot.mode, PeladaLiveMode.setsPoints);
      expect(foot.setTarget, 18);
      expect(foot.courtSwitch, isFalse);

      expect(PeladaLiveRules.forSport('indoorVolleyball').setTarget, 25);

      final bt = PeladaLiveRules.forSport('beachTennis');
      expect(bt.mode, PeladaLiveMode.setsGames);
      expect(bt.noAd, isTrue);
      expect(bt.superTiebreak, isTrue);

      final tennis = PeladaLiveRules.forSport('tennis');
      expect(tennis.noAd, isFalse);
      expect(tennis.superTiebreak, isFalse);

      final padel = PeladaLiveRules.forSport('padel');
      expect(padel.noAd, isTrue);
      expect(padel.superTiebreak, isFalse);

      final football = PeladaLiveRules.forSport('football');
      expect(football.mode, PeladaLiveMode.goals);
      expect(football.minutes, 10);
      expect(football.limit, 2);

      final basket = PeladaLiveRules.forSport('basketball');
      expect(basket.mode, PeladaLiveMode.baskets);
      expect(basket.pointValues, [1, 2]);
      expect(basket.copyWith(threePointers: true).pointValues, [1, 2, 3]);

      expect(PeladaLiveRules.forSport(null).mode, PeladaLiveMode.points);
      expect(PeladaLiveRules.forSport('running').mode, PeladaLiveMode.points);
    });

    test('troca de lado: 7 no set de 21, 5 no decisivo de 15', () {
      final r = PeladaLiveRules.forSport('beachVolleyball');
      expect(r.courtSwitchEvery(0), 7);
      expect(r.courtSwitchEvery(2), 5);
      expect(r.copyWith(courtSwitch: false).courtSwitchEvery(0), isNull);
    });

    test('json ida e volta', () {
      final r = PeladaLiveRules.forSport('football')
          .copyWith(minutes: () => null, limit: () => 3);
      expect(PeladaLiveRules.fromJson(r.toJson()), r);
      expect(PeladaLiveRules.fromJson({'mode': 'curling'}), isNull);
    });
  });

  group('sets por pontos', () {
    test('set fecha em 21 com vantagem de 2 e o decisivo vai a 15', () {
      var m =
          PeladaLiveMatch(rules: PeladaLiveRules.forSport('beachVolleyball'));
      m = _points(m, LiveSide.a, 20);
      m = _points(m, LiveSide.b, 20);
      m = m.point(LiveSide.a); // 21–20: ainda não
      expect(m.currentSet, 0);
      expect(m.flagFor(LiveSide.a), 'set point');
      m = m.point(LiveSide.a); // 22–20
      expect(m.lastEvent, LiveEvent.set);
      expect(m.currentSet, 1);
      expect(m.setsWon, (a: 1, b: 0));

      m = _points(m, LiveSide.b, 21);
      expect(m.currentSet, 2);
      expect(m.targetLabel, 'até 15');
      m = _points(m, LiveSide.a, 14);
      expect(m.flagFor(LiveSide.a), 'match point');
      m = m.point(LiveSide.a);
      expect(m.finished, isTrue);
      expect(m.winner, LiveSide.a);
      expect(m.toScores(), [(a: 22, b: 20), (a: 0, b: 21), (a: 15, b: 0)]);
    });

    test('avisa a troca de lado a cada 7 pontos somados', () {
      var m =
          PeladaLiveMatch(rules: PeladaLiveRules.forSport('beachVolleyball'));
      m = _points(m, LiveSide.a, 4);
      m = _points(m, LiveSide.b, 2);
      expect(m.lastEvent, LiveEvent.none);
      m = m.point(LiveSide.b);
      expect(m.lastEvent, LiveEvent.courtSwitch);
    });

    test('quem faz o ponto passa a sacar', () {
      var m = PeladaLiveMatch(
        rules: PeladaLiveRules.forSport('footvolley'),
        serving: LiveSide.a,
      );
      m = m.point(LiveSide.b);
      expect(m.serving, LiveSide.b);
    });

    test('1 set: o primeiro set fecha a partida', () {
      var m = PeladaLiveMatch(
        rules: PeladaLiveRules.forSport('footvolley').copyWith(bestOf: 1),
      );
      m = _points(m, LiveSide.b, 18);
      expect(m.winner, LiveSide.b);
      expect(m.toScores(), [(a: 0, b: 18)]);
    });
  });

  group('games', () {
    test('beach tennis: 40–40 é ponto de ouro e fecha o game', () {
      var m = PeladaLiveMatch(rules: PeladaLiveRules.forSport('beachTennis'));
      m = _points(m, LiveSide.a, 3);
      m = _points(m, LiveSide.b, 3);
      expect(m.display, (a: '40', b: '40'));
      expect(m.stateLabel, 'ponto de ouro');
      m = m.point(LiveSide.b);
      expect(m.lastEvent, LiveEvent.game);
      expect(m.current.b, 1);
      expect(m.display, (a: '0', b: '0'));
    });

    test('tênis: com vantagem, 40–40 vira AD', () {
      var m = PeladaLiveMatch(rules: PeladaLiveRules.forSport('tennis'));
      m = _points(m, LiveSide.a, 3);
      m = _points(m, LiveSide.b, 3);
      m = m.point(LiveSide.a);
      expect(m.display, (a: 'AD', b: '40'));
      m = m.point(LiveSide.b);
      expect(m.display, (a: '40', b: '40'));
    });

    test('set de 6 com tie-break e super tie-break no decisivo', () {
      var m = PeladaLiveMatch(rules: PeladaLiveRules.forSport('beachTennis'));
      // 6–0 para A (4 pontos por game sem vantagem).
      m = _points(m, LiveSide.a, 24);
      expect(m.currentSet, 1);
      // 6–6 no segundo set e tie-break para B.
      for (var g = 0; g < 6; g++) {
        m = _points(m, LiveSide.a, 4);
        m = _points(m, LiveSide.b, 4);
      }
      expect(m.inTiebreak, isTrue);
      expect(m.stateLabel, 'tie-break');
      m = _points(m, LiveSide.b, 7);
      expect(m.currentSet, 2);
      expect(m.inSuperTiebreak, isTrue);
      m = _points(m, LiveSide.a, 10);
      expect(m.winner, LiveSide.a);
      expect(m.toScores(), [(a: 6, b: 0), (a: 6, b: 7), (a: 10, b: 0)]);
    });

    test('saque alterna a cada game', () {
      var m = PeladaLiveMatch(
        rules: PeladaLiveRules.forSport('padel'),
        serving: LiveSide.a,
      );
      m = _points(m, LiveSide.b, 4);
      expect(m.serving, LiveSide.b);
    });
  });

  group('gols, cestas e pontos', () {
    test('futebol: termina ao chegar no limite de gols', () {
      var m = PeladaLiveMatch(rules: PeladaLiveRules.forSport('football'));
      m = m.point(LiveSide.a);
      expect(m.flagFor(LiveSide.a), 'gol da vitória');
      m = m.point(LiveSide.a);
      expect(m.winner, LiveSide.a);
      expect(m.toScores(), [(a: 2, b: 0)]);
    });

    test('tempo zerado: vence quem está na frente; empatado vira gol de ouro',
        () {
      final rules =
          PeladaLiveRules.forSport('football').copyWith(limit: () => null);
      var m = PeladaLiveMatch(rules: rules).resume(_t0);
      expect(m.remainingAt(_t0.add(const Duration(minutes: 4))), 6 * 60000);
      m = m.point(LiveSide.b, now: _t0);
      final up = _t0.add(const Duration(minutes: 10));
      expect(m.expire(up).winner, LiveSide.b);

      var tied = m.point(LiveSide.a, now: _t0).expire(up);
      expect(tied.finished, isFalse);
      expect(tied.golden, isTrue);
      expect(tied.stateLabel, 'gol de ouro');
      tied = tied.point(LiveSide.a, now: up);
      expect(tied.winner, LiveSide.a);
      expect(tied.toScores(), [(a: 2, b: 1)]);
    });

    test('cronômetro pausa e retoma', () {
      var m = PeladaLiveMatch(rules: PeladaLiveRules.forSport('basketball'))
          .resume(_t0);
      m = m.pause(_t0.add(const Duration(minutes: 2)));
      expect(m.elapsedAt(_t0.add(const Duration(minutes: 30))), 120000);
      m = m.resume(_t0.add(const Duration(minutes: 5)));
      expect(m.elapsedAt(_t0.add(const Duration(minutes: 6))), 180000);
    });

    test('basquete: cesta de 2 e jogo até 21', () {
      var m = PeladaLiveMatch(rules: PeladaLiveRules.forSport('basketball'));
      for (var i = 0; i < 10; i++) {
        m = m.point(LiveSide.a, value: 2);
      }
      expect(m.current.a, 20);
      m = m.point(LiveSide.a, value: 2);
      expect(m.winner, LiveSide.a);
      expect(m.current.a, 22);
    });

    test('pontos simples sem alvo não terminam sozinhos', () {
      var m = const PeladaLiveMatch(
          rules: PeladaLiveRules(mode: PeladaLiveMode.points));
      m = _points(m, LiveSide.a, 40);
      expect(m.finished, isFalse);
      expect(m.flagFor(LiveSide.a), isNull);
    });
  });

  group('PeladaLiveSession', () {
    test('dois times: os sets marcados substituem o placar', () {
      var s = PeladaLiveSession.start(
        _two().updateGame(
            0, const ResultGame(teamA: 0, teamB: 1, scoreA: 9, scoreB: 3)),
        PeladaLiveRules.forSport('footvolley'),
        now: _t0,
      );
      for (var i = 0; i < 18; i++) {
        s = s.point(LiveSide.a, now: _t0);
      }
      for (var i = 0; i < 5; i++) {
        s = s.point(LiveSide.b, now: _t0);
      }
      final r = s.toResult();
      expect(r.games.length, 2);
      expect(r.games[0].scoreA, 18);
      expect(r.games[1].scoreB, 5);
    });

    test('desfazer volta o último lance, inclusive o fim do set', () {
      var s = PeladaLiveSession.start(
        _two(),
        PeladaLiveRules.forSport('footvolley'),
        now: _t0,
      );
      for (var i = 0; i < 18; i++) {
        s = s.point(LiveSide.a, now: _t0);
      }
      expect(s.match.currentSet, 1);
      s = s.undo(now: _t0);
      expect(s.match.currentSet, 0);
      expect(s.match.current.a, 17);
      expect(s.canUndo, isTrue);
    });

    test('trocar lados espelha o placar sem perder nada', () {
      var s = PeladaLiveSession.start(
        _two(),
        PeladaLiveRules.forSport('beachVolleyball'),
        now: _t0,
      );
      s = s.point(LiveSide.a, now: _t0).swapSides();
      expect(s.teamA, 1);
      expect(s.match.current.b, 1);
      expect(s.toResult().games.single.teamB, 0);
      expect(s.toResult().games.single.scoreB, 1);
    });

    test('rei da quadra: um set por jogo, quem vence fica e a fila anda', () {
      var s = PeladaLiveSession.start(
        _three(),
        PeladaLiveRules.forSport('football'),
        now: _t0,
      );
      expect(s.isRotation, isTrue);
      expect((s.teamA, s.teamB), (0, 1));
      expect(s.queue.map((t) => t.id), [2]);
      s = s.point(LiveSide.b, now: _t0).point(LiveSide.b, now: _t0);
      expect(s.match.winner, LiveSide.b);
      s = s.nextGame(now: _t0);
      expect({s.teamA, s.teamB}, {1, 2});
      expect(s.match.hasPoints, isFalse);
      expect(s.match.running, isTrue);
      s = s.point(LiveSide.a, now: _t0);
      final r = s.toResult();
      expect(r.games.length, 2);
      expect(r.games.first.winner, 1);
      expect(r.standings.first.team.id, 1);
    });

    test('rei da quadra força 1 set', () {
      final s = PeladaLiveSession.start(
        _three(),
        PeladaLiveRules.forSport('beachVolleyball'),
        now: _t0,
      );
      expect(s.rules.bestOf, 1);
    });

    test('sem ponto nenhum devolve um jogo 0×0', () {
      final s = PeladaLiveSession.start(
        _two(),
        PeladaLiveRules.forSport('padel'),
        now: _t0,
      );
      expect(s.toResult().games.single.scoreA, 0);
    });

    test('rascunho: json ida e volta', () {
      var s = PeladaLiveSession.start(
        _three(),
        PeladaLiveRules.forSport('beachTennis'),
        firstServe: LiveSide.a,
        now: _t0,
      );
      s = s.point(LiveSide.a, now: _t0).point(LiveSide.b, now: _t0);
      final back = PeladaLiveSession.fromJson(s.toJson())!;
      expect(back.teamA, s.teamA);
      expect(back.base.teams.length, 3);
      expect(back.match.display, s.match.display);
      expect(back.match.serving, LiveSide.a);
      expect(back.history.length, 2);
      expect(back.rules, s.rules);
      expect(PeladaLiveSession.fromJson({'v': 2}), isNull);
    });
  });
}
