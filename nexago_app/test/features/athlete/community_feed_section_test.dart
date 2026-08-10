import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/community/community_feed_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/community/community_feed_section.dart';

CommunityFeedChampion _champion(String category, List<String> players) =>
    CommunityFeedChampion(categoryName: category, playerNames: players);

Future<void> _pump(
  WidgetTester tester,
  List<CommunityFeedItem> items,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        communityFeedProvider.overrideWith((ref) => Stream.value(items)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(
          body: SingleChildScrollView(child: CommunityFeedSection()),
        ),
      ),
    ),
  );
  // Entrega o evento do Stream.value (o primeiro frame ainda é loading).
  await tester.pump();
}

void main() {
  group('CommunityFeedSection — feed da Comunidade', () {
    testWidgets(
      'item de inscrições abertas mostra o nome do torneio e a mensagem '
      'com categorias e cidade',
      (tester) async {
        await _pump(tester, const [
          CommunityFeedItem(
            id: 'f1',
            type: CommunityFeedType.tournamentOpen,
            tournamentId: 't1',
            tournamentName: 'Open Goiânia de Beach Tennis',
            city: 'Goiânia',
            categoriesCount: 2,
          ),
        ]);

        expect(find.text('Open Goiânia de Beach Tennis'), findsOneWidget);
        expect(
          find.text('Inscrições abertas · 2 categorias — Goiânia'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'item de campeões com 5 categorias mostra as 3 primeiras e '
      'resume o resto em "+2 categorias"',
      (tester) async {
        await _pump(tester, [
          CommunityFeedItem(
            id: 'f2',
            type: CommunityFeedType.tournamentChampions,
            tournamentId: 't2',
            tournamentName: 'Copa VH',
            champions: [
              _champion('Mista A', ['Ana', 'Bruno']),
              _champion('Masculina B', ['Caio', 'Davi']),
              _champion('Feminina C', ['Elisa', 'Fabi']),
              _champion('Masculina D', ['Gui', 'Hugo']),
              _champion('Iniciante', ['Ivo', 'João']),
            ],
          ),
        ]);

        expect(find.text('Copa VH'), findsOneWidget);
        expect(
          find.text('Torneio encerrado — confira os campeões:'),
          findsOneWidget,
        );

        // As 3 primeiras categorias aparecem com nome + dupla campeã.
        expect(
          find.text('Mista A: Ana & Bruno', findRichText: true),
          findsOneWidget,
        );
        expect(
          find.text('Masculina B: Caio & Davi', findRichText: true),
          findsOneWidget,
        );
        expect(
          find.text('Feminina C: Elisa & Fabi', findRichText: true),
          findsOneWidget,
        );

        // A 4ª e a 5ª não são listadas — viram o resumo "+2 categorias".
        expect(
          find.text('Masculina D: Gui & Hugo', findRichText: true),
          findsNothing,
        );
        expect(
          find.text('Iniciante: Ivo & João', findRichText: true),
          findsNothing,
        );
        expect(find.text('+2 categorias'), findsOneWidget);
      },
    );

    testWidgets(
      'feed vazio mostra o estado vazio "Sem novidades por enquanto…"',
      (tester) async {
        await _pump(tester, const []);

        expect(
          find.textContaining('Sem novidades por enquanto'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'aviso do organizador mostra a caixa destacada com o texto do aviso',
      (tester) async {
        const aviso = 'Rodada de sábado antecipada para 8h por causa da chuva.';
        await _pump(tester, const [
          CommunityFeedItem(
            id: 'f3',
            type: CommunityFeedType.organizerAnnouncement,
            tournamentId: 't3',
            tournamentName: 'Liga nexaGO — Etapa 1',
            message: aviso,
          ),
        ]);

        expect(find.text('Liga nexaGO — Etapa 1'), findsOneWidget);
        expect(find.text(aviso), findsOneWidget);
      },
    );
  });
}
