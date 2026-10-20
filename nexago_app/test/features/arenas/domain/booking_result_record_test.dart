import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';

import '../fake_booking_result_repository.dart';

Map<String, dynamic> doc({Map<String, dynamic> over = const {}}) => {
      'bookingId': 'b1',
      'arenaName': 'Arena CFC',
      'courtName': 'Quadra 1',
      'sport': 'beachVolleyball',
      'dateKey': '2026-05-22',
      'startTime': '09:00',
      'endTime': '10:30',
      'createdBy': 'u1',
      'createdByName': 'Maria Alves',
      'teams': [
        {
          'id': 0,
          'customName': null,
          'players': [
            {
              'id': 'u1',
              'name': 'Maria Alves',
              'avatarUrl': 'https://x/m.jpg',
              'guest': false
            },
            {
              'id': 'u2',
              'name': 'Enzo Lima',
              'avatarUrl': null,
              'guest': false
            },
          ],
        },
        {
          'id': 1,
          'customName': 'Os Brabos',
          'players': [
            {
              'id': 'u3',
              'name': 'Rafael Souza',
              'avatarUrl': null,
              'guest': false
            },
            {
              'id': 'guest:lia',
              'name': 'Lia',
              'avatarUrl': null,
              'guest': true
            },
          ],
        },
      ],
      'games': [
        {'teamA': 0, 'teamB': 1, 'scoreA': 21, 'scoreB': 18},
        {'teamA': 0, 'teamB': 1, 'scoreA': 17, 'scoreB': 21},
      ],
      'playerUids': ['u1', 'u2', 'u3'],
      'opponentUids': ['u3'],
      'status': 'pending',
      'version': 3,
      'respondedBy': null,
      'respondedByName': null,
      ...over,
    };

void main() {
  setUpAll(initializeNexagoEventTimezone);

  group('SavedBookingResult.fromFirestore', () {
    test('lê times, jogos, quem confirma e a versão', () {
      final s = SavedBookingResult.fromFirestore('b1', doc())!;
      expect(s.status, BookingResultStatus.pending);
      expect(s.version, 3);
      expect(s.opponentUids, ['u3']);
      expect(s.result.teams[1].name, 'Os Brabos');
      expect(s.result.teams[0].name, 'Maria & Enzo');
      expect(s.result.teams[0].players[0].avatarUrl, 'https://x/m.jpg');
      expect(s.result.teams[1].players[1].isGuest, isTrue);
      expect(s.result.games.length, 2);
      expect(s.opponentFirstNames, ['Rafael']);
    });

    test('status desconhecido é pendente; doc sem times é ignorado', () {
      expect(
        SavedBookingResult.fromFirestore('b1', doc(over: {'status': '??'}))!
            .status,
        BookingResultStatus.pending,
      );
      expect(SavedBookingResult.fromFirestore('b1', doc(over: {'teams': []})),
          isNull);
      expect(
          SavedBookingResult.fromFirestore('b1', doc(over: {'createdBy': ''})),
          isNull);
    });

    test('quem responde: só adversário e só pendente', () {
      final s = SavedBookingResult.fromFirestore('b1', doc())!;
      expect(s.awaitsResponseFrom('u3'), isTrue);
      expect(s.awaitsResponseFrom('u2'), isFalse);
      final done = SavedBookingResult.fromFirestore(
          'b1', doc(over: {'status': 'confirmed'}))!;
      expect(done.awaitsResponseFrom('u3'), isFalse);
      expect(done.isConfirmed, isTrue);
    });

    test('playedAt é a parede de São Paulo', () {
      final s = SavedBookingResult.fromFirestore('b1', doc())!;
      expect(s.playedAt, DateTime.utc(2026, 5, 22, 12));
    });
  });

  test('payload manda id e nome de cada jogador e os jogos', () {
    final r = SavedBookingResult.fromFirestore('b1', doc())!.result;
    final p = bookingResultPayload('b1', r);
    expect(p['bookingId'], 'b1');
    final teams = p['teams']! as List;
    expect((teams[1] as Map)['customName'], 'Os Brabos');
    expect((teams[0] as Map)['customName'], '');
    expect(((teams[1] as Map)['players'] as List)[1],
        {'id': 'guest:lia', 'name': 'Lia'});
    expect((p['games']! as List).first,
        {'teamA': 0, 'teamB': 1, 'scoreA': 21, 'scoreB': 18});
  });

  group('aviso do Editar placar', () {
    const r = BookingResult(
      teams: [
        ResultTeam(id: 0, players: [
          ResultPlayer(id: 'u1', name: 'Maria'),
          ResultPlayer(id: 'u2', name: 'Enzo'),
        ]),
        ResultTeam(id: 1, players: [
          ResultPlayer(id: 'u3', name: 'Rafael Souza'),
          ResultPlayer(id: 'guest:lia', name: 'Lia'),
        ]),
        ResultTeam(id: 2, players: [
          ResultPlayer(id: 'u5', name: 'Bia'),
          ResultPlayer(id: 'u6', name: 'Caio'),
        ]),
      ],
      games: [ResultGame(teamA: 0, teamB: 1)],
    );

    test('quem confirma: com conta e fora do time de quem lança', () {
      expect(
        [for (final p in bookingResultConfirmers(r, 'u1')) p.id],
        ['u3', 'u5', 'u6'],
      );
      // Quem lança num time do meio: os dos outros dois times.
      expect(
        [for (final p in bookingResultConfirmers(r, 'u5')) p.id],
        ['u1', 'u2', 'u3'],
      );
    });

    test('um, dois, mais nomes e ninguém', () {
      expect(bookingResultSaveNotice(['Rafael']).names, 'Rafael');
      expect(bookingResultSaveNotice(['Rafael']).rest,
          contains(' recebe o placar'));
      final two = bookingResultSaveNotice(['Rafael', 'Lia']);
      expect('${two.names}${two.rest}',
          'Rafael e Lia recebem o placar para confirmar. Só depois ele conta no seu histórico.');
      expect(bookingResultSaveNotice(['Rafael', 'Lia', 'Bia', 'Caio']).names,
          'Rafael, Lia +2');
      final none = bookingResultSaveNotice(const []);
      expect(none.names, '');
      expect(none.rest, contains('não conta no seu histórico'));
    });
  });

  group('linhas de estado', () {
    test('para quem lançou', () {
      expect(bookingResultStatusLine(savedResult()),
          'Aguardando Rafael confirmar');
      expect(
        bookingResultStatusLine(savedResult(opponentUids: const [])),
        startsWith('Sem adversário com conta'),
      );
      expect(
        bookingResultStatusLine(savedResult(
          status: BookingResultStatus.confirmed,
          respondedByName: 'Rafael Souza',
        )),
        'Confirmado por Rafael · já conta no seu histórico',
      );
      expect(
        bookingResultStatusLine(savedResult(
          status: BookingResultStatus.disputed,
          respondedByName: 'Rafael Souza',
        )),
        'Rafael contestou · corrija e envie de novo',
      );
    });

    test('para quem vê: adversário, companheiro', () {
      expect(bookingResultViewerStatusLine(savedResult(), 'u3'),
          contains('Com a sua confirmação'));
      expect(bookingResultViewerStatusLine(savedResult(), 'u2'),
          'Aguardando Rafael confirmar');
      expect(
        bookingResultViewerStatusLine(
          savedResult(
              status: BookingResultStatus.disputed,
              respondedByName: 'Rafael Souza'),
          'u2',
        ),
        'Contestado por Rafael · Maria vai corrigir',
      );
      // Quem respondeu lê na primeira pessoa.
      expect(
        bookingResultViewerStatusLine(
          savedResult(
              status: BookingResultStatus.confirmed,
              respondedByName: 'Rafael Souza'),
          'u3',
        ),
        'Você confirmou · conta no histórico de quem jogou',
      );
    });

    test('título no Histórico e linha do placar', () {
      expect(bookingResultAttentionTitle(savedResult(), 'u3'),
          'Confirme o placar de Maria');
      expect(bookingResultAttentionTitle(savedResult(), 'u1'),
          'Aguardando Rafael confirmar');
      expect(bookingResultScoreLine(savedResult().result),
          'Maria & Enzo 2–1 Rafael & Lia');
    });
  });
}
