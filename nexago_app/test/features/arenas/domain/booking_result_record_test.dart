import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';

import '../fake_booking_result_repository.dart';

Map<String, dynamic> player(String id, String name) => {
      'id': id,
      'name': name,
      'avatarUrl': null,
      'guest': false,
    };

Map<String, dynamic> doc({Map<String, dynamic> over = const {}}) => {
      'bookingId': 'b1',
      'arenaId': 'a1',
      'arenaName': 'Arena CFC',
      'courtName': 'Quadra 1',
      'sport': 'beachVolleyball',
      'dateKey': '2026-05-22',
      'startTime': '09:00',
      'endTime': '10:30',
      'createdBy': 'u1',
      'createdByName': 'Maria Alves',
      'editedBy': 'u1',
      'teams': [
        {
          'id': 0,
          'customName': null,
          'players': [player('u1', 'Maria Alves'), player('u2', 'Enzo Lima')],
        },
        {
          'id': 1,
          'customName': 'Os Brabos',
          'players': [
            player('u3', 'Rafael Souza'),
            player('u4', 'Lia Martins')
          ],
        },
      ],
      'games': [
        {'teamA': 0, 'teamB': 1, 'scoreA': 21, 'scoreB': 18},
        {'teamA': 0, 'teamB': 1, 'scoreA': 17, 'scoreB': 21},
      ],
      'playerUids': ['u1', 'u2', 'u3', 'u4'],
      'confirmations': {
        'u1': {'state': 'confirmed', 'version': 3},
        'u2': {'state': 'confirmed', 'version': 3},
        'u3': {'state': 'pending', 'version': 3},
        'u4': {'state': 'pending', 'version': 3},
      },
      'status': 'pending',
      'version': 3,
      'confirmDeadline': Timestamp.fromDate(DateTime.utc(2026, 5, 24, 12)),
      'bookingAmountReais': 120,
      ...over,
    };

void main() {
  setUpAll(initializeNexagoEventTimezone);

  group('SavedBookingResult.fromFirestore', () {
    test('lê times, jogos, confirmações, prazo e valor da reserva', () {
      final s = SavedBookingResult.fromFirestore('b1', doc())!;
      expect(s.result.teams[1].name, 'Os Brabos');
      expect(s.version, 3);
      expect(s.arenaId, 'a1');
      expect(s.pendingUids, ['u3', 'u4']);
      expect(s.confirmedCount, 2);
      expect(s.playerCount, 4);
      expect(
        s.confirmDeadline!.isAtSameMomentAs(DateTime.utc(2026, 5, 24, 12)),
        isTrue,
      );
      expect(s.bookingAmountReais, 120);
    });

    test('doc do #781 sem o mapa: quem lançou confirmado, o resto pelo status',
        () {
      final legacy = {...doc(), 'editedBy': null}..remove('confirmations');
      final s = SavedBookingResult.fromFirestore('b1', legacy)!;
      expect(s.pendingUids, ['u2', 'u3', 'u4']);

      final disputed = SavedBookingResult.fromFirestore('b1', {
        ...legacy,
        'status': 'disputed',
        'respondedBy': 'u3',
        'respondedByName': 'Rafael Souza',
      })!;
      expect(
        disputed.confirmations['u3']!.state,
        ResultConfirmationState.disputed,
      );
      expect(disputed.disputedByName, 'Rafael Souza');
    });

    test('status desconhecido é pendente; doc sem times é ignorado', () {
      expect(
        SavedBookingResult.fromFirestore(
          'b1',
          doc(over: {'status': 'x'}),
        )!
            .status,
        BookingResultStatus.pending,
      );
      expect(
        SavedBookingResult.fromFirestore('b1', doc(over: {'teams': []})),
        isNull,
      );
    });

    test('playedAt é a parede de São Paulo; minutos reservados', () {
      final s = SavedBookingResult.fromFirestore('b1', doc())!;
      expect(s.playedAt, DateTime.utc(2026, 5, 22, 12));
      expect(s.minutes, 90);
    });
  });

  group('quem responde', () {
    test('todo mundo do placar menos quem lançou, só pendente, uma vez', () {
      final s = savedResult(pending: const ['u3']);
      expect(s.awaitsResponseFrom('u3'), isTrue);
      expect(s.awaitsResponseFrom('u2'), isFalse); // já confirmou
      expect(s.awaitsResponseFrom('u1'), isFalse); // lançou
      expect(s.awaitsResponseFrom('u9'), isFalse); // fora
      expect(
        savedResult(status: BookingResultStatus.disputed).awaitsResponseFrom(
          'u3',
        ),
        isFalse,
      );
    });

    test('quem edita é o dono da reserva, confirmado também', () {
      expect(savedResult().canEdit('u1'), isTrue);
      expect(
        savedResult(status: BookingResultStatus.confirmed).canEdit('u1'),
        isTrue,
      );
      expect(savedResult().canEdit('u3'), isFalse);
    });
  });

  test('payload manda só o id de cada jogador e os jogos', () {
    final payload = bookingResultPayload('b1', savedResult().result);
    final teams = payload['teams'] as List;
    expect((teams.first as Map)['players'], [
      {'id': 'u1'},
      {'id': 'u2'},
    ]);
    expect((payload['games'] as List).length, 3);
  });

  group('aviso do Editar placar', () {
    test('quem confirma: todo mundo menos quem salva', () {
      final names = [
        for (final p in bookingResultConfirmers(savedResult().result, 'u1'))
          p.firstName,
      ];
      expect(names, ['Enzo', 'Rafael', 'Lia']);
    });

    test('nomes e o prazo de 48h', () {
      final n = bookingResultSaveNotice(['Enzo', 'Rafael', 'Lia']);
      expect(n.names, 'Enzo, Rafael +1');
      expect(n.rest, contains('48h'));
      expect(bookingResultSaveNotice([]).rest, contains('quem jogou'));
    });
  });

  group('linhas de estado', () {
    test('pendente: falta a sua ou aguardando os outros', () {
      final s = savedResult(pending: const ['u3', 'u4']);
      expect(bookingResultViewerStatusLine(s, 'u3'), contains('Falta a sua'));
      expect(
        bookingResultViewerStatusLine(s, 'u1'),
        'Aguardando Rafael e Lia confirmar',
      );
    });

    test('contestado mostra o motivo; confirmado pelo prazo avisa', () {
      final d = savedResult(
        status: BookingResultStatus.disputed,
        disputedBy: 'u3',
        disputeReason: 'Dupla errada',
      );
      expect(
        bookingResultViewerStatusLine(d, 'u1'),
        'Rafael contestou: Dupla errada',
      );
      expect(
          bookingResultViewerStatusLine(d, 'u3'), contains('Você contestou'));

      final auto = savedResult(
        status: BookingResultStatus.confirmed,
        pending: const ['u4'],
        autoConfirmed: true,
      );
      expect(auto.autoConfirmed, isTrue);
      expect(bookingResultViewerStatusLine(auto, 'u1'), contains('48h'));
    });

    test('título do pedido de atenção e linha do placar', () {
      expect(
        bookingResultAttentionTitle(savedResult(), 'u3'),
        'Confirme o placar de Maria',
      );
      expect(
        bookingResultScoreLine(savedResult().result),
        'Maria & Enzo 2–1 Rafael & Lia',
      );
      expect(
        bookingResultScoreLine(
          const BookingResult(
            teams: [
              ResultTeam(id: 0),
              ResultTeam(id: 1),
              ResultTeam(id: 2),
            ],
            games: [],
          ),
        ),
        'Rotação · 3 times',
      );
    });
  });
}
