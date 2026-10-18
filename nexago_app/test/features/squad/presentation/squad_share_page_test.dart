import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/squad/presentation/squad_share_page.dart';
import 'package:nexago_app/features/squad/presentation/widgets/squad_share_card.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../squad_test_support.dart';

String _link(WidgetTester tester) =>
    squadTextOf(tester, const Key('squad-share-link'));

/// Link que o QR do card codifica.
String _qrData(WidgetTester tester) {
  expect(find.byType(QrImageView), findsOneWidget);
  return tester.widget<SquadShareCard>(find.byType(SquadShareCard)).qrLink;
}

void main() {
  setUpAll(loadSquadFonts);

  group('Compartilhar (tela 02)', () {
    testWidgets('sem torneio aberto: Story com o link ?squad=CODIGO', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadShare,
      );

      final card = tester.widget<SquadShareCard>(find.byType(SquadShareCard));
      expect(card.format, SquadShareFormat.story);
      expect(card.code, 'JOAO10');
      expect(find.text('Jogue com o meu código'), findsOneWidget);
      expect(_link(tester), 'atleta.nexago.com.br/?squad=JOAO10');
      expect(_link(tester), contains('?squad=JOAO10'));
      // O QR do card leva &via=qr para a atribuição saber a origem.
      expect(
        _qrData(tester),
        'https://atleta.nexago.com.br/?squad=JOAO10&via=qr',
      );
      expect(find.text('#publi · parceria NexaGO'), findsOneWidget);
    });

    testWidgets('aba QR: card do QR, oferta e o mesmo link', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadShare,
      );

      await tester.tap(find.byKey(const Key('squad-share-tab-qr')));
      await settleSquad(tester, 15);

      final card = tester.widget<SquadShareCard>(find.byType(SquadShareCard));
      expect(card.format, SquadShareFormat.qr);
      expect(
        find.text('Aponte a câmera e ganhe 10% OFF na 1ª inscrição.'),
        findsOneWidget,
      );
      expect(find.text('Jogue com o meu código'), findsNothing);
      expect(_link(tester), contains('?squad=JOAO10'));
      expect(_qrData(tester), endsWith('?squad=JOAO10&via=qr'));
    });

    testWidgets('com torneio aberto: abre no card do torneio e o link leva a '
        '/torneios/<id>', (tester) async {
      final start = DateTime.now().add(const Duration(days: 9));
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadShare,
        tournaments: [
          discoveryTournament(
            id: 't-open',
            name: 'Open Errejota',
            startDate: start,
          ),
        ],
      );

      final card = tester.widget<SquadShareCard>(find.byType(SquadShareCard));
      expect(card.format, SquadShareFormat.tournament);
      expect(card.event?.tournamentId, 't-open');
      expect(find.text('Open Errejota'), findsOneWidget);
      expect(
        _link(tester),
        'atleta.nexago.com.br/torneios/t-open?squad=JOAO10',
      );
      expect(_qrData(tester), endsWith('/torneios/t-open?squad=JOAO10&via=qr'));
    });

    testWidgets('trocar para Story tira o torneio do link', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadShare,
        tournaments: [
          discoveryTournament(
            id: 't-open',
            name: 'Open Errejota',
            startDate: DateTime.now().add(const Duration(days: 9)),
          ),
        ],
      );

      await tester.tap(find.byKey(const Key('squad-share-tab-story')));
      await settleSquad(tester, 15);

      expect(_link(tester), 'atleta.nexago.com.br/?squad=JOAO10');
    });

    testWidgets(
      'aba Torneio sem torneio aberto: aviso e compartilhar travado',
      (tester) async {
        await pumpSquadApp(
          tester,
          repo: FakeSquadRepository(mySquad: memberSquad()),
          location: AppRoutes.squadShare,
        );

        await tester.tap(find.byKey(const Key('squad-share-tab-tournament')));
        await settleSquad(tester, 15);

        expect(find.text('Sem torneios abertos agora'), findsOneWidget);
        expect(find.byType(SquadShareCard), findsNothing);
        final share = tester.widget<FilledButton>(
          find.descendant(
            of: find.byKey(const Key('squad-share-card')),
            matching: find.byType(FilledButton),
          ),
        );
        expect(share.onPressed, isNull);
      },
    );

    testWidgets('sem contrato: estado de não-membro', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(),
        location: AppRoutes.squadShare,
      );

      expect(find.text('Você ainda não faz parte do Squad'), findsOneWidget);
      expect(find.byKey(const Key('squad-share-link')), findsNothing);
    });
  });

  group('squadShareEventsFrom', () {
    final now = DateTime(2026, 10, 17, 15);

    test(
      'só inscrição aberta (ou quase lotada) de hoje em diante, por data',
      () {
        final events = squadShareEventsFrom([
          discoveryTournament(
            id: 'depois',
            name: 'Copa Novembro',
            startDate: DateTime(2026, 11, 7),
          ),
          discoveryTournament(
            id: 'quase',
            name: 'Open Errejota',
            startDate: DateTime(2026, 10, 26),
            status: TournamentListingStatus.almostFull,
          ),
          discoveryTournament(
            id: 'hoje',
            name: 'Rei da Praia',
            startDate: DateTime(2026, 10, 17, 8),
          ),
          discoveryTournament(
            id: 'passado',
            name: 'Copa Setembro',
            startDate: DateTime(2026, 10, 16),
          ),
          discoveryTournament(
            id: 'ao-vivo',
            name: 'Ao vivo',
            startDate: DateTime(2026, 10, 20),
            status: TournamentListingStatus.live,
          ),
          discoveryTournament(
            id: 'chave',
            name: 'Chaves prontas',
            startDate: DateTime(2026, 10, 21),
            status: TournamentListingStatus.bracketsReady,
          ),
        ], now);

        expect(events.map((e) => e.tournamentId), ['hoje', 'quase', 'depois']);
        expect(events[1].name, 'Open Errejota');
      },
    );

    test('no máximo 6 torneios', () {
      final events = squadShareEventsFrom([
        for (var i = 1; i <= 8; i++)
          discoveryTournament(
            id: 't$i',
            name: 'Torneio $i',
            startDate: DateTime(2026, 10, 17 + i),
          ),
      ], now);

      expect(events, hasLength(6));
      expect(events.last.tournamentId, 't6');
    });
  });
}
