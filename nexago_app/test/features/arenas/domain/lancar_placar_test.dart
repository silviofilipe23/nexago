import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/lancar_placar.dart';

const _maria = ResultPlayer(id: 'u1', name: 'Maria Alves');
const _enzo = ResultPlayer(id: 'u2', name: 'Enzo Lima');
const _rafa = ResultPlayer(id: 'u3', name: 'Rafael Souza');
const _lia = ResultPlayer(id: 'u4', name: 'Lia Martins');

BookingResult _two() => const BookingResult(
      teams: [
        ResultTeam(id: 0, players: [_maria, _enzo]),
        ResultTeam(id: 1, players: [_rafa, _lia]),
      ],
      games: [ResultGame(teamA: 0, teamB: 1)],
    );

void main() {
  group('assignPlayer (Quem jogou?)', () {
    test('trocar de time é um toque: sai de um e entra no outro', () {
      final (r, outcome) = _two().assignPlayer(_enzo, 1);
      expect(outcome, LancarAssignOutcome.assigned);
      expect([for (final p in r.teams[0].players) p.id], ['u1']);
      expect([for (final p in r.teams[1].players) p.id], ['u3', 'u4', 'u2']);
    });

    test('tocar o time em que já está tira do placar', () {
      final (r, outcome) = _two().assignPlayer(_rafa, 1);
      expect(outcome, LancarAssignOutcome.removed);
      expect(r.teamIdOf('u3'), isNull);
      expect(r.teams[1].players.single.id, 'u4');
    });

    test('time com 6 não aceita o sétimo', () {
      var r = const BookingResult(
        teams: [ResultTeam(id: 0), ResultTeam(id: 1)],
        games: [],
      );
      for (var i = 0; i < kLancarMaxTeamPlayers; i++) {
        r = r.assignPlayer(ResultPlayer(id: 'p$i', name: 'P $i'), 0).$1;
      }
      final (same, outcome) =
          r.assignPlayer(const ResultPlayer(id: 'p9', name: 'Sobra'), 0);
      expect(outcome, LancarAssignOutcome.teamFull);
      expect(same.teams[0].players.length, kLancarMaxTeamPlayers);
    });

    test('mais um time vira rei da quadra; tirar volta a dois', () {
      final three = _two().addEmptyTeam();
      expect(three.isRotation, isTrue);
      expect(three.teams.last.players, isEmpty);
      expect(three.dropTeam(three.teams.last.id).teams.length, 2);
      // Com dois times não tira.
      expect(_two().dropTeam(1).teams.length, 2);
    });
  });

  group('o botão diz o que falta', () {
    test('time vazio', () {
      final r = _two().assignPlayer(_rafa, 1).$1.assignPlayer(_lia, 1).$1;
      expect(
        lancarTeamsMissing(r),
        'Falta escolher quem jogou no Time B',
      );
      expect(lancarScoreMissing(r), 'Falta escolher quem jogou no Time B');
    });

    test('set sem placar e set empatado', () {
      expect(lancarScoreMissing(_two()), 'Falta o placar do set 1');
      final tie = _two().updateGame(
        0,
        const ResultGame(teamA: 0, teamB: 1, scoreA: 15, scoreB: 15),
      );
      expect(lancarScoreMissing(tie), 'O set 1 está empatado');
      final ok = _two().updateGame(
        0,
        const ResultGame(teamA: 0, teamB: 1, scoreA: 21, scoreB: 18),
      );
      expect(lancarScoreMissing(ok), isNull);
      expect(lancarResultHeadline(ok), 'Maria & Enzo vencem 1–0');
    });

    test('rei da quadra fala em jogo', () {
      final r = _two()
          .addEmptyTeam()
          .assignPlayer(
            const ResultPlayer(id: 'u5', name: 'Bruno'),
            2,
          )
          .$1;
      expect(lancarScoreMissing(r), 'Falta o placar do jogo 1');
    });
  });

  group('atalhos do teclado pelo esporte', () {
    test('vôlei de praia: 21 nos sets, 15 no decisivo', () {
      expect(lancarQuickScores('beachVolleyball', gameIndex: 0).first, 21);
      expect(lancarQuickScores('beachVolleyball', gameIndex: 2).first, 15);
    });

    test('beach tennis: games', () {
      expect(lancarQuickScores('beachTennis', gameIndex: 0), [6, 4, 3, 7]);
    });

    test('futebol: gols', () {
      expect(lancarQuickScores('football', gameIndex: 0), [1, 2, 3, 4]);
    });
  });

  test('nomes do botão de enviar', () {
    expect(lancarNamesLine([_enzo, _rafa, _lia]), 'Enzo, Rafael e Lia');
    expect(lancarNamesLine([_enzo]), 'Enzo');
    expect(
      lancarNamesLine([_enzo, _rafa, _lia, _maria]),
      'Enzo, Rafael e mais 2',
    );
    expect(
      [for (final p in lancarConfirmers(_two(), 'u1')) p.id],
      ['u2', 'u3', 'u4'],
    );
  });
}
