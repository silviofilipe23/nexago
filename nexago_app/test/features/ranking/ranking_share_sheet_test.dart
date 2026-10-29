import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/booking_story/booking_story_editor.dart'
    show BookingStoryChip;
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/domain/ranking_providers.dart';
import 'package:nexago_app/features/ranking/domain/ranking_share.dart';
import 'package:nexago_app/features/ranking/presentation/widgets/ranking_share_card.dart';
import 'package:nexago_app/features/ranking/presentation/widgets/ranking_share_sheet.dart';

const _names = ['Ana', 'Bia', 'Cris', 'Duda', 'Eva', 'Fê', 'Gabi'];

RankingListEntry _entry(
  int rank, {
  int size = 2,
  bool me = false,
}) {
  final format = switch (size) {
    1 => null,
    2 => RankingFormatFilter.dupla,
    3 => RankingFormatFilter.trio,
    4 => RankingFormatFilter.quarteto,
    _ => RankingFormatFilter.quinteto,
  };
  final members = [
    for (var i = 0; i < size; i++)
      RankingEntryMember(
        initials: _names[i % _names.length].substring(0, 2).toUpperCase(),
        shortName: _names[i % _names.length],
      ),
  ];
  return RankingListEntry(
    rank: rank,
    points: 1000 - rank * 17,
    tournamentsCount: 3,
    // Nome comprido de propósito: tem de encolher/cortar, nunca vazar.
    displayName: size == 1
        ? 'Maria Eduarda Albuquerque $rank'
        : 'Associação Esportiva Areia Fina $rank',
    subtitle: '',
    isCurrentUser: me,
    entityId: 'e$rank',
    teamFormat: format,
    initials: size == 1 ? 'ME' : null,
    player1Initials: size == 1 ? null : 'AN',
    player2Initials: size == 1 ? null : 'BI',
    members: members,
  );
}

List<RankingListEntry> _field({int n = 30, int size = 2, int? mine}) => [
      for (var r = 1; r <= n; r++) _entry(r, size: size, me: r == mine),
    ];

void main() {
  group('RankingShareCard', () {
    for (final size in [1, 2, 3, 4, 5]) {
      for (final format in [
        RankingShareFormat.story,
        RankingShareFormat.post
      ]) {
        for (final (top, mine) in [
          for (final top in format.topOptions) ...[(top, 27), (top, null)],
        ]) {
          testWidgets(
              '$size rosto(s) · ${format.name} · Top $top · '
              '${mine == null ? 'sem destaque' : 'destaque fora'} cabe',
              (tester) async {
            final data = rankingShareDataFrom(
              entries: _field(size: size, mine: mine),
              filter: RankingPageFilter(
                mode: size == 1
                    ? RankingListMode.athletes
                    : RankingListMode.teams,
                year: 2026,
                gender: RankingGenderFilter.female,
                level: RankingLevelFilter.intermediario,
              ),
              sportLabel: 'Vôlei de Praia',
              top: top,
              highlightMine: true,
              link: 'https://atleta.nexago.com.br/ranking?esporte=VOLEI_PRAIA'
                  '&modo=equipes&ano=2026&genero=feminino&nivel=intermediario'
                  '&por=AbCdEfGhIjKlMnOpQrStUvWxYz12',
              now: DateTime(2026, 10, 29),
            );
            final cardSize = RankingShareCard.sizeOf(format);
            tester.view.devicePixelRatio = 1;
            tester.view.physicalSize = cardSize;
            addTearDown(tester.view.reset);

            await tester.pumpWidget(
              MaterialApp(
                // O tema muda o estilo padrão de texto: a arte não pode
                // depender dele.
                theme: AppTheme.dark,
                home: Center(
                  child: RankingShareCard(data: data, format: format),
                ),
              ),
            );

            // Overflow de RenderFlex vira exceção no teste.
            expect(tester.takeException(), isNull);
            if (mine != null) {
              expect(find.text('27'), findsOneWidget,
                  reason: 'a linha destacada entra fora do Top');
            }
            expect(tester.getSize(find.byType(RankingShareCard)), cardSize);
          });
        }
      }
    }
  });

  group('folha Compartilhar', () {
    late ProviderContainer container;
    String? copied;

    Future<void> pumpSheet(
      WidgetTester tester, {
      required List<RankingListEntry> entries,
      RankingPageFilter filter = const RankingPageFilter(
        mode: RankingListMode.teams,
        year: 2026,
        gender: RankingGenderFilter.female,
      ),
    }) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(tester.view.reset);

      copied = null;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            copied = (call.arguments as Map)['text'] as String?;
          }
          return null;
        },
      );
      addTearDown(() => tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null));

      container = ProviderContainer(overrides: [
        rankingListEntriesProvider.overrideWith((ref) async => entries),
        rankingSportProvider.overrideWith((ref) async => 'VOLEI_PRAIA'),
        authProvider.overrideWith((ref) => Stream.value(MockUser(uid: 'u1'))),
      ]);
      addTearDown(container.dispose);
      container.read(rankingPageFilterProvider.notifier).state = filter;

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            theme: AppTheme.dark,
            home: Builder(
              builder: (context) => Scaffold(
                body: Center(
                  child: TextButton(
                    onPressed: () => showRankingShareSheet(context),
                    child: const Text('abrir'),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('abrir'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));
    }

    testWidgets('herda a aba e os filtros da tela', (tester) async {
      await pumpSheet(tester, entries: _field(n: 12));

      expect(find.text('Compartilhar ranking'), findsOneWidget);
      for (final label in ['Equipes', 'Vôlei de praia', '2026', 'Feminino']) {
        expect(find.text(label), findsWidgets, reason: label);
      }
      expect(tester.takeException(), isNull);
    });

    testWidgets('copiar link leva o recorte e quem compartilhou',
        (tester) async {
      await pumpSheet(tester, entries: _field(n: 12));

      await tester.tap(find.byKey(const Key('ranking-share-copy')));
      await tester.pump();

      final uri = Uri.parse(copied!);
      expect(uri.path, '/ranking');
      expect(uri.queryParameters['modo'], 'equipes');
      expect(uri.queryParameters['genero'], 'feminino');
      expect(uri.queryParameters['ano'], '2026');
      expect(uri.queryParameters['por'], 'u1');
      expect(find.text('Copiado'), findsOneWidget);

      await tester.pump(const Duration(seconds: 3));
      expect(find.text('Copiar link'), findsOneWidget);
    });

    testWidgets('Post não oferece Top 20 e cai pro 10', (tester) async {
      await pumpSheet(tester, entries: _field(n: 30));

      await tester.tap(find.byKey(const Key('ranking-share-top-20')));
      await tester.pump();
      await tester.tap(find.text('Post'));
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.byKey(const Key('ranking-share-top-20')), findsNothing);
      final top10 = tester.widget<BookingStoryChip>(
        find.byKey(const Key('ranking-share-top-10')),
      );
      expect(top10.selected, isTrue);
      expect(tester.takeException(), isNull);
    });

    testWidgets('destacar só aparece com quem compartilha no recorte',
        (tester) async {
      await pumpSheet(tester, entries: _field(n: 12));
      expect(find.byKey(const Key('ranking-share-highlight')), findsNothing);
    });

    testWidgets('destacar aparece e nomeia a dupla', (tester) async {
      await pumpSheet(tester, entries: _field(n: 12, mine: 7));
      expect(find.byKey(const Key('ranking-share-highlight')), findsOneWidget);
      expect(find.text('Destacar minha dupla'), findsOneWidget);
    });

    testWidgets('só link troca a prévia pelo endereço e tira a imagem',
        (tester) async {
      await pumpSheet(tester, entries: _field(n: 12));

      await tester.tap(find.text('Só link'));
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.byType(RankingShareCard), findsNothing);
      expect(find.byKey(const Key('ranking-share-post')), findsNothing);
      expect(find.byKey(const Key('ranking-share-save')), findsNothing);
      expect(find.byKey(const Key('ranking-share-message')), findsOneWidget);
      expect(
          find.textContaining('atleta.nexago.com.br/ranking?'), findsOneWidget);
    });

    testWidgets('recorte vazio: imagem desligada, link segue', (tester) async {
      await pumpSheet(tester, entries: const []);

      expect(find.textContaining('Ninguém pontuou'), findsOneWidget);
      await tester.tap(find.byKey(const Key('ranking-share-copy')));
      await tester.pump();
      expect(copied, isNotNull);
      await tester.pump(const Duration(seconds: 3));
    });
  });
}
