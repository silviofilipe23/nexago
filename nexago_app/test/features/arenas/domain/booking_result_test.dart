import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';

ResultPlayer p(String id, String name) => ResultPlayer(id: id, name: name);

final maria = p('u1', 'Maria Alves');
final enzo = p('u2', 'Enzo Lima');
final rafa = p('u3', 'Rafael Souza');
final lia = p('u4', 'Lia Martins');

BookingResult duplas(List<(int, int)> sets) => BookingResult(
      teams: [
        ResultTeam(id: 0, players: [maria, enzo]),
        ResultTeam(id: 1, players: [rafa, lia]),
      ],
      games: [
        for (final (a, b) in sets)
          ResultGame(teamA: 0, teamB: 1, scoreA: a, scoreB: b),
      ],
    );

void main() {
  group('initialBookingResult', () {
    test('quatro na reserva: 2×2, quem reservou no primeiro time', () {
      final r = initialBookingResult([maria, enzo, rafa, lia]);

      expect(r.teams.map((t) => t.name), ['Maria & Enzo', 'Rafael & Lia']);
      expect(r.games, hasLength(1));
      expect(r.hasScore, isFalse);
    });

    test('sozinho: o outro lado é "Adversários"', () {
      final r = initialBookingResult([maria]);

      expect(r.teams.map((t) => t.name), ['Maria', 'Adversários']);
    });
  });

  test('resultTeamAutoName: & no último, vírgula antes', () {
    expect(resultTeamAutoName([maria, enzo]), 'Maria & Enzo');
    expect(resultTeamAutoName([maria, enzo, lia]), 'Maria, Enzo & Lia');
    expect(resultTeamAutoName([]), '');
  });

  group('dois times (sets)', () {
    test('vence quem leva mais sets; linha dos sets e resultado', () {
      final r = duplas([(21, 18), (17, 21), (15, 12)]);

      expect(r.winsOf(0), 2);
      expect(r.winsOf(1), 1);
      expect(r.leaderId, 0);
      expect(bookingResultSetsLine(r), '21–18 · 17–21 · 15–12');
      expect(bookingResultOutcome(r, 0), 'VITÓRIA');
      expect(bookingResultOutcome(r, 1), 'DERROTA');
    });

    test('empate em sets; 0×0 ainda não tem resultado', () {
      expect(bookingResultOutcome(duplas([(21, 18), (18, 21)]), 0), 'EMPATE');
      expect(bookingResultOutcome(duplas([(0, 0)]), 0), isNull);
    });

    test('novo set repete os dois times', () {
      final r = duplas([(21, 18)]).addGame();

      expect(r.games.last.teamA, 0);
      expect(r.games.last.teamB, 1);
      expect(r.games.last.scoreA, 0);
    });

    test('com dois times não dá para remover nenhum', () {
      expect(duplas([(21, 18)]).removeTeam(1).teams, hasLength(2));
    });
  });

  group('três ou mais times (rotação)', () {
    BookingResult rotacao() => duplas([
          (21, 15),
        ]).addTeam([p('u5', 'Bruno'), p('u6', 'Carol')]);

    test('quem vence fica e enfrenta quem estava fora', () {
      var r = rotacao();
      expect(r.isRotation, isTrue);

      r = r.addGame();
      expect((r.games.last.teamA, r.games.last.teamB), (0, 2));

      r = r.updateGame(1, r.games[1].copyWith(scoreA: 10, scoreB: 15));
      r = r.addGame();
      expect((r.games.last.teamA, r.games.last.teamB), (2, 1));
    });

    test('classificação: vitórias, depois saldo', () {
      var r = rotacao().addGame();
      r = r.updateGame(1, r.games[1].copyWith(scoreA: 13, scoreB: 15));

      final rows = r.standings;
      expect([for (final s in rows) s.team.id], [0, 2, 1]);
      expect(rows.first.wins, 1);
      expect(rows.first.pointDiff, 4); // +6 e −2
      expect(r.leaderId, 0);
    });

    test('empate em vitórias e saldo: ninguém lidera', () {
      final r = BookingResult(
        teams: rotacao().teams,
        games: const [
          ResultGame(teamA: 0, teamB: 1, scoreA: 15, scoreB: 10),
          ResultGame(teamA: 2, teamB: 1, scoreA: 15, scoreB: 10),
        ],
      );

      expect(r.leaderId, isNull);
    });

    test('trocar o time de um lado pula o adversário', () {
      final r = rotacao().cycleTeam(0, sideA: false);

      expect(r.games.first.teamA, 0);
      expect(r.games.first.teamB, 2);
    });

    test('remover time leva os jogos dele; sem jogo, abre um set novo', () {
      final r = rotacao().removeTeam(1);

      expect(r.teams.map((t) => t.id), [0, 2]);
      expect(r.games, hasLength(1));
      expect((r.games.single.teamA, r.games.single.teamB), (0, 2));
    });

    test('sem placar, a legenda não aponta líder', () {
      final r = BookingResult(
        teams: rotacao().teams,
        games: const [ResultGame(teamA: 0, teamB: 1)],
      );

      expect(
        bookingResultShareText(r, 'Arena CFC'),
        'Fim de jogo na Arena CFC! #vamosnexa',
      );
    });
  });

  test('replaceTeam troca jogadores e nome sem mexer nos jogos', () {
    final r = duplas([(21, 18)]).replaceTeam(
      ResultTeam(id: 1, players: [lia], customName: 'As brabas'),
    );

    expect(r.teamById(1)!.name, 'As brabas');
    expect(r.games.single.scoreA, 21);
    expect(r.teamOfPlayer('u4')!.id, 1);
    expect(r.teamOfPlayer('u3'), isNull);
  });

  test('resultOwnerTeamId: o time de quem posta, senão o primeiro', () {
    final r = duplas([(21, 18)]);

    expect(resultOwnerTeamId(r, 'u3'), 1);
    expect(resultOwnerTeamId(r, 'ninguem'), 0);
    expect(resultOwnerTeamId(r, null), 0);
  });

  test('bookingResultHeadline: areia por padrão, quadra fora dela', () {
    expect(bookingResultHeadline('beachVolleyball'), 'Jogaço\nna areia.');
    expect(bookingResultHeadline('Beach tennis'), 'Jogaço\nna areia.');
    expect(bookingResultHeadline(null), 'Jogaço\nna areia.');
    expect(bookingResultHeadline('padel'), 'Jogaço\nna quadra.');
  });

  test('bookingResultDuration: tempo reservado, virando a meia-noite', () {
    expect(bookingResultDuration('09:00', '10:30'), '1h30');
    expect(bookingResultDuration('18:00', '20:00'), '2h');
    expect(bookingResultDuration('19:15', '20:00'), '45min');
    expect(bookingResultDuration('23:00', '00:30'), '1h30');
    expect(bookingResultDuration('', '10:00'), '');
  });

  test('BookingResultFormation.forPlayers: o menor que comporta', () {
    expect(BookingResultFormation.forPlayers(1), BookingResultFormation.pair);
    expect(BookingResultFormation.forPlayers(3), BookingResultFormation.trio);
    expect(BookingResultFormation.forPlayers(5), BookingResultFormation.sextet);
    expect(BookingResultFormation.forPlayers(9), BookingResultFormation.sextet);
  });

  test('bookingResultShareText com duas duplas', () {
    expect(
      bookingResultShareText(duplas([(21, 18), (21, 19)]), 'Arena CFC'),
      'Fim de jogo na Arena CFC: Maria & Enzo 2–0 Rafael & Lia '
      '(21–18 · 21–19) #vamosnexa',
    );
  });
}
