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

  group('convite do lançar placar', () {
    test('fala de entrar no placar, não de confirmar vaga', () {
      final m = lancarInviteMessage(
        arenaName: 'Arena Teste',
        when: 'sexta, 13/11 às 09:00',
        url: 'https://x/convite/abc',
      );
      expect(
        m,
        'Bora pôr nosso jogo na Arena Teste (sexta, 13/11 às 09:00) no '
        'nexaGO? Entra por este link pra ficar no placar e nas suas '
        'estatísticas: https://x/convite/abc',
      );
      expect(m, isNot(contains('vaga')));
    });

    test('sem nome da arena e sem link', () {
      expect(
        lancarInviteMessage(arenaName: ' ', when: 'hoje às 20:00', url: 'u'),
        startsWith('Bora pôr nosso jogo (hoje às 20:00)'),
      );
      expect(
        lancarInviteFallbackMessage(arenaName: '', downloadUrl: 'd'),
        'Bora registrar nossa pelada no nexaGO? Baixa o app (d), cria sua '
        'conta e me manda seu @ pra eu te pôr no placar.',
      );
    });
  });

  test('convidado: botão e rodapé com o nome de quem reservou', () {
    expect(lancarGuestSendLabel('Maria Alves'), 'Mandar para Maria conferir');
    expect(lancarGuestSendLabel(null), 'Mandar para quem reservou');
    expect(
      lancarGuestSendNote(' Maria Alves '),
      'Maria confere e envia para todos confirmarem.',
    );
    expect(
      lancarGuestSendNote(''),
      'Quem reservou confere e envia para todos confirmarem.',
    );
  });

  group('passo 1 v2', () {
    test('"Quem vai jogar?" até o fim do horário, de São Paulo', () {
      bool up(String now, {String start = '09:00', String end = '10:30'}) =>
          lancarIsUpcoming(
            dateKey: '2026-11-13',
            startTime: start,
            endTime: end,
            now: DateTime.parse(now),
          );
      expect(up('2026-11-13T08:00:00-03:00'), isTrue);
      expect(up('2026-11-13T10:29:00-03:00'), isTrue);
      expect(up('2026-11-13T10:30:00-03:00'), isFalse);
      // Passa da meia-noite: 23h–01h ainda rola à 00h30 do dia seguinte.
      expect(
        up('2026-11-14T00:30:00-03:00', start: '23:00', end: '01:00'),
        isTrue,
      );
      expect(lancarStepTitle(upcoming: true), 'Quem vai jogar?');
      expect(lancarStepTitle(upcoming: false), 'Quem jogou?');
    });

    test('o que falta fala no tempo certo', () {
      final r = _two().addEmptyTeam();
      expect(lancarTeamsMissing(r), 'Falta escolher quem jogou no Time C');
      expect(
        lancarTeamsMissing(r, upcoming: true),
        'Falta escolher quem joga no Time C',
      );
    });

    test('ordem do rei da quadra: quem abre e a fila; com dois times, nada',
        () {
      expect(lancarRotationOrder(_two()), isNull);
      final order = lancarRotationOrder(_two().addEmptyTeam().addEmptyTeam())!;
      expect(order.opening, 'A × B abrem · quem vence fica');
      expect(order.queue, 'Fila: C → D');
    });

    test('mover time muda a sequência e o primeiro jogo, com os jogadores', () {
      final r = _two().addEmptyTeam();
      final c = r.teams[2].id;
      final moved = r.moveTeam(2, 0);
      expect(moved.teams.first.id, c);
      expect(moved.teams[1].players, [_maria, _enzo]);
      expect(moved.games.single.teamA, c);
      expect(moved.games.single.teamB, r.teams[0].id);
      // Fora do intervalo não muda nada.
      expect(r.moveTeam(5, 0), same(r));
    });

    test('com placar lançado, mover só muda a fila dos próximos jogos', () {
      final r = BookingResult(
        teams: _two().addEmptyTeam().teams,
        games: const [ResultGame(teamA: 0, teamB: 1, scoreA: 2, scoreB: 1)],
      );
      final moved = r.moveTeam(2, 1);
      expect(moved.games, r.games);
      expect(moved.teams.map((t) => t.id), [0, 2, 1]);
    });
  });
}
