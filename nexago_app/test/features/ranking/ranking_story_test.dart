import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/booking_story_photo_picker.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_providers.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/domain/ranking_providers.dart';
import 'package:nexago_app/features/ranking/domain/ranking_story.dart';
import 'package:nexago_app/features/ranking/presentation/athlete_ranking_page.dart';
import 'package:nexago_app/features/ranking/presentation/ranking_story_page.dart';
import 'package:nexago_app/features/ranking/presentation/widgets/ranking_story_card.dart';

/// PNG 1×1 transparente.
final pixel = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
);

RankingListEntry team(
  int rank,
  int points, {
  bool me = false,
  String name = 'Rival / Dupla',
  RankingFormatFilter? format = RankingFormatFilter.dupla,
  int? before,
}) {
  return RankingListEntry(
    rank: rank,
    points: points,
    tournamentsCount: 4,
    displayName: me ? 'Daniel / Armando' : name,
    subtitle: '',
    isCurrentUser: me,
    entityId: 'team-$rank',
    player1Initials: 'DA',
    player2Initials: 'AR',
    teamFormat: format,
    pointsBeforeLastStage: before,
  );
}

RankingListEntry athlete(int rank, int points, {bool me = false}) {
  return RankingListEntry(
    rank: rank,
    points: points,
    tournamentsCount: 1,
    displayName: me ? 'Daniel Moraes' : 'Atleta $rank',
    subtitle: '',
    isCurrentUser: me,
    entityId: 'ath-$rank',
    initials: 'DM',
  );
}

/// 48 duplas; a do atleta em [myRank], pontos caindo de 10 em 10. Com
/// [before], cada linha ganha os pontos de antes da última etapa (`null` =
/// não jogou: os mesmos de agora).
List<RankingListEntry> field({
  int myRank = 4,
  int size = 48,
  Map<int, int>? before,
}) =>
    [
      for (var r = 1; r <= size; r++)
        team(
          r,
          500 - r * 10,
          me: r == myRank,
          before: before == null ? null : before[r] ?? 500 - r * 10,
        ),
    ];

RankingStoryData teamStory({
  int myRank = 4,
  RankingPageFilter filter = const RankingPageFilter(
    mode: RankingListMode.teams,
    year: 2026,
  ),
  List<RankingListEntry>? entries,
}) {
  final list = entries ?? field(myRank: myRank);
  return rankingStoryDataFrom(
    entry: list.firstWhere((e) => e.isCurrentUser),
    entries: list,
    filter: filter,
    sportLabel: 'Vôlei de Praia',
  );
}

Future<void> pumpCard(
  WidgetTester tester,
  RankingStoryData data, {
  BookingStoryTheme theme = BookingStoryTheme.ember,
  Set<RankingStoryInfo>? infos,
  GlobalKey? boundaryKey,
}) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: Center(
        child: RepaintBoundary(
          key: boundaryKey,
          child: RankingStoryCard(
            data: data,
            theme: theme,
            infos: infos ?? RankingStoryInfo.values.toSet(),
          ),
        ),
      ),
    ),
  );
}

void main() {
  group('RankingStoryData', () {
    test('a faixa sai da posição: medalha no pódio, frase no top 5/10', () {
      expect(
        [
          for (final r in [1, 2, 3, 4, 5, 6, 10, 11]) teamStory(myRank: r).tier
        ],
        [
          RankingStoryTier.gold,
          RankingStoryTier.silver,
          RankingStoryTier.bronze,
          RankingStoryTier.top5,
          RankingStoryTier.top5,
          RankingStoryTier.top10,
          RankingStoryTier.top10,
          RankingStoryTier.rest,
        ],
      );
      expect(teamStory(myRank: 1).medalLabel, 'PÓDIO · OURO');
      expect(teamStory(myRank: 3).medalLabel, 'PÓDIO · BRONZE');
      expect(teamStory(myRank: 4).medalLabel, isNull);
    });

    test('dupla fala no plural; individual, no singular', () {
      expect(teamStory(myRank: 1).kicker(), 'LÍDERES DO RANKING');
      expect(teamStory(myRank: 12).kicker(), 'NOSSA POSIÇÃO NO RANKING');

      final list = [athlete(1, 540, me: true), athlete(2, 495)];
      final solo = rankingStoryDataFrom(
        entry: list.first,
        entries: list,
        filter: const RankingPageFilter(year: 2026),
        sportLabel: 'Beach Tennis',
      );
      expect(solo.kicker(), 'LÍDER DO RANKING');
      expect(solo.cutLine, 'BEACH TENNIS · INDIVIDUAL');
      expect(solo.fieldLabel, 'ENTRE 2 ATLETAS');
      expect(solo.identityLine, 'Atleta · 1 torneio');
      expect(solo.people.single.initials, 'DM');
    });

    test('o recorte da folha vai estampado: a posição é renumerada nele', () {
      final data = teamStory(
        filter: const RankingPageFilter(
          mode: RankingListMode.teams,
          year: 2026,
          gender: RankingGenderFilter.male,
          level: RankingLevelFilter.intermediario,
        ),
      );
      expect(
        data.cutLine,
        'VÔLEI DE PRAIA · DUPLAS · MASCULINO · INTERMEDIÁRIO',
      );
      expect(data.pillLabel, 'RANKING 2026');
      expect(data.fieldLabel, 'ENTRE 48 DUPLAS');
      expect(data.identityLine, 'Dupla · 4 torneios');
      expect(data.people, hasLength(2));
    });

    test('trio na lista vira "equipes"; o formato da folha manda', () {
      final mixed = [
        team(1, 300),
        team(2, 200, me: true, format: RankingFormatFilter.trio),
      ];
      final data = teamStory(entries: mixed);
      expect(data.unit, 'equipes');
      expect(data.identityLabel, 'Trio');

      final trios = teamStory(
        entries: mixed,
        filter: const RankingPageFilter(
          mode: RankingListMode.teams,
          format: RankingFormatFilter.trio,
        ),
      );
      expect(trios.unit, 'trios');
      expect(trios.pillLabel, 'RANKING GERAL');
    });

    test('pontos para subir vêm de quem está logo acima', () {
      expect(teamStory(myRank: 4).pointsToClimb, 10);
      expect(teamStory(myRank: 1).pointsToClimb, isNull);
      final tied = [team(1, 200), team(2, 200, me: true)];
      expect(teamStory(entries: tied).pointsToClimb, isNull);
    });

    test('sem pontos nem concorrência, os chips somem', () {
      final alone = [team(1, 0, me: true)];
      expect(rankingStoryInfosFor(teamStory(entries: alone)), [
        RankingStoryInfo.identity,
      ]);
      // Sem etapa conhecida, nada de chip de variação.
      expect(rankingStoryInfosFor(teamStory()), [
        RankingStoryInfo.identity,
        RankingStoryInfo.points,
        RankingStoryInfo.field,
      ]);
    });

    test('legenda leva posição, recorte, o que falta e a hashtag', () {
      expect(
        rankingStoryShareText(teamStory(myRank: 1)),
        '1º no ranking 2026 de duplas de Vôlei de Praia! '
        'Quem vem tirar a gente daqui? #vamosnexa',
      );
      expect(
        rankingStoryShareText(teamStory(myRank: 2)),
        contains('Faltam 10 pontos pro topo.'),
      );
      expect(
        rankingStoryShareText(
          teamStory(
            myRank: 4,
            filter: const RankingPageFilter(
              mode: RankingListMode.teams,
              gender: RankingGenderFilter.female,
            ),
          ),
        ),
        startsWith(
          '4º no ranking geral de duplas de Vôlei de Praia (Feminino)! '
          'Faltam 10 pontos pro 3º.',
        ),
      );
    });
  });

  group('variação na última etapa', () {
    // Agora: 1º 490 · 2º 480 · 3º 470 · 4º 460 · 5º 450 · 6º 440 · 7º 430…
    RankingStoryData moved(int myRank, Map<int, int> before) => teamStory(
          entries: field(myRank: myRank, before: before),
        );

    test('subiu de 7º para 4º: +3, "entramos no top 5" e legenda', () {
      final data = moved(4, {4: 425});
      expect(data.movement, 3);
      expect(data.previousPosition, 7);
      expect(data.movementLabel, '+3 POSIÇÕES');
      expect(data.kicker(), 'ENTRAMOS NO TOP 5');
      expect(data.kicker(showMovement: false), 'NO TOP 5 DO RANKING');
      expect(rankingStoryInfosFor(data), contains(RankingStoryInfo.movement));
      expect(rankingStoryInfosOffByDefault(data), isEmpty);
      expect(
        rankingStoryShareText(data),
        '4º no ranking 2026 de duplas de Vôlei de Praia! Subimos 3 posições '
        'na última etapa. Faltam 10 pontos pro 3º. #vamosnexa',
      );
      expect(
        rankingStoryShareText(data, showMovement: false),
        isNot(contains('Subimos')),
      );
    });

    test('caiu: "−1 POSIÇÃO", chip começa desligado e a legenda não conta', () {
      // A do 3º (470) tinha 300: passou por cima de quem não jogou.
      final data = moved(4, {3: 300});
      expect(data.movement, -1);
      expect(data.movementLabel, '−1 POSIÇÃO');
      expect(data.kicker(), 'NO TOP 5 DO RANKING');
      expect(rankingStoryInfosOffByDefault(data), {RankingStoryInfo.movement});
      expect(rankingStoryShareText(data), isNot(contains('posições na')));
    });

    test('assumiu a liderança e entrou no pódio', () {
      expect(moved(1, {1: 470}).kicker(), 'ASSUMIMOS A LIDERANÇA');
      expect(moved(3, {3: 435}).kicker(), 'ENTRAMOS NO PÓDIO');
      // Já era do pódio: subir dentro dele não é "entrar".
      expect(moved(2, {2: 475}).kicker(), 'VICE-LÍDERES DO RANKING');
    });

    test('estreia: sem pontos antes da etapa', () {
      final rest = moved(12, {12: 0});
      expect(rest.debut, isTrue);
      expect(rest.movement, isNull);
      expect(rest.movementLabel, 'ESTREIA NA TEMPORADA');
      expect(rest.kicker(), 'NOSSA POSIÇÃO NO RANKING');
      expect(rankingStoryShareText(rest), contains('Estreamos no ranking.'));
      expect(moved(8, {8: 0}).kicker(), 'ENTRAMOS NO TOP 10');

      final general = teamStory(
        entries: field(myRank: 12, before: {12: 0}),
        filter: const RankingPageFilter(mode: RankingListMode.teams),
      );
      expect(general.movementLabel, 'ESTREIA NO RANKING');
    });

    test('empate não vira "subiu 1" de mentira', () {
      // 4º e 5º empatados em 460, antes e agora — a ordem da lista é sorte.
      final entries = [
        for (final e in field(myRank: 5, before: const {}))
          e.rank == 5 ? team(5, 460, me: true, before: 460) : e,
      ];
      final data = teamStory(entries: entries);
      expect(data.movement, 0);
      expect(data.movementLabel, isNull);
      expect(rankingStoryInfosFor(data),
          isNot(contains(RankingStoryInfo.movement)));
    });
  });

  group('RankingStoryCard', () {
    // `gradient` anula `color` no BoxDecoration: o PNG não pode sair com
    // canto transparente em nenhum fundo (ver booking_story_card_test).
    for (final theme in BookingStoryTheme.values) {
      testWidgets('fundo ${theme.label} sai opaco', (tester) async {
        final key = GlobalKey();
        await pumpCard(tester, teamStory(), theme: theme, boundaryKey: key);
        final boundary =
            tester.renderObject<RenderRepaintBoundary>(find.byKey(key));
        final alphas = await tester.runAsync(() async {
          final image = await boundary.toImage();
          final bytes =
              await image.toByteData(format: ui.ImageByteFormat.rawRgba);
          final w = image.width;
          final h = image.height;
          image.dispose();
          int alphaAt(int x, int y) => bytes!.getUint8((y * w + x) * 4 + 3);
          return [
            alphaAt(0, 0),
            alphaAt(w - 1, 0),
            alphaAt(w ~/ 2, h ~/ 2),
            alphaAt(0, h - 1),
            alphaAt(w - 1, h - 1),
          ];
        });
        expect(alphas, everyElement(255));
      });
    }

    for (final theme in BookingStoryTheme.values) {
      testWidgets('pior caso cabe na arte (${theme.name})', (tester) async {
        final list = [
          for (var r = 1; r <= 240; r++)
            team(
              r,
              9000 - r,
              me: r == 187,
              name: 'Maria Eduarda Albuquerque / Ana Carolina Vasconcelos',
              // Subiu de 240º: a etiqueta de variação entra na linha.
              before: r == 187 ? 8000 : 9000 - r,
            ),
        ];
        final data = teamStory(
          entries: list,
          filter: const RankingPageFilter(
            mode: RankingListMode.teams,
            year: 2026,
            gender: RankingGenderFilter.mixed,
            level: RankingLevelFilter.intermediario,
          ),
        );
        await pumpCard(tester, data, theme: theme);
        expect(tester.takeException(), isNull);
        expect(
          tester.getSize(find.byType(RankingStoryCard)),
          const Size(360, 640),
        );
        // O bloco cresce para cima: não pode subir por cima da marca e do
        // selo do topo.
        expect(
          tester.getTopLeft(find.text('SUBIMOS NO RANKING')).dy,
          greaterThan(tester.getBottomLeft(find.text('RANKING 2026')).dy + 8),
        );
        expect(find.text('187'), findsOneWidget);
      });
    }

    testWidgets('escreve posição, recorte, medalha, total, dupla e pontos', (
      tester,
    ) async {
      await pumpCard(tester, teamStory(myRank: 1));
      expect(find.text('LÍDERES DO RANKING'), findsOneWidget);
      expect(find.text('1'), findsOneWidget);
      expect(find.text('º'), findsOneWidget);
      expect(find.text('VÔLEI DE PRAIA · DUPLAS'), findsOneWidget);
      expect(find.text('PÓDIO · OURO'), findsOneWidget);
      expect(find.text('ENTRE 48 DUPLAS'), findsOneWidget);
      expect(find.text('Daniel / Armando'), findsOneWidget);
      expect(find.text('490'), findsOneWidget);
      expect(find.text('RANKING 2026'), findsOneWidget);
    });

    testWidgets('variação: etiqueta e kicker acompanham o chip', (
      tester,
    ) async {
      final data = teamStory(entries: field(before: {4: 425}));
      await pumpCard(tester, data);
      expect(find.text('+3 POSIÇÕES'), findsOneWidget);
      expect(find.text('ENTRAMOS NO TOP 5'), findsOneWidget);

      await pumpCard(
        tester,
        data,
        infos: RankingStoryInfo.values.toSet()
          ..remove(RankingStoryInfo.movement),
      );
      expect(find.text('+3 POSIÇÕES'), findsNothing);
      expect(find.text('NO TOP 5 DO RANKING'), findsOneWidget);
    });

    testWidgets('sem a dupla, ficam os pontos; sem nada, some o cartão', (
      tester,
    ) async {
      await pumpCard(tester, teamStory(), infos: {RankingStoryInfo.points});
      expect(find.text('Daniel / Armando'), findsNothing);
      expect(find.text('460'), findsOneWidget);
      expect(find.text('ENTRE 48 DUPLAS'), findsNothing);

      await pumpCard(tester, teamStory(), infos: const {});
      expect(find.text('PONTOS'), findsNothing);
      expect(find.text('4'), findsOneWidget);
    });
  });

  group('RankingStoryPage', () {
    Future<void> abrir(
      WidgetTester tester, {
      BookingStoryPhotoPicker? picker,
    }) async {
      tester.view.physicalSize = const Size(400, 1000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            if (picker != null)
              bookingStoryPhotoPickerProvider.overrideWithValue(picker),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: RankingStoryPage(data: teamStory()),
          ),
        ),
      );
      await tester.pump();
    }

    testWidgets('chip desligado tira os pontos da arte; religar volta', (
      tester,
    ) async {
      await abrir(tester);
      expect(find.text('460'), findsOneWidget);

      await tester.tap(find.byKey(const Key('ranking-story-info-points')));
      await tester.pump();
      expect(find.text('460'), findsNothing);

      await tester.tap(find.byKey(const Key('ranking-story-info-points')));
      await tester.pump();
      expect(find.text('460'), findsOneWidget);
    });

    testWidgets('queda começa fora da arte; o chip liga', (tester) async {
      tester.view.physicalSize = const Size(400, 1000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: AppTheme.dark,
            home: RankingStoryPage(
              data: teamStory(entries: field(before: {3: 300})),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('−1 POSIÇÃO'), findsNothing);

      await tester.tap(find.byKey(const Key('ranking-story-info-movement')));
      await tester.pump();
      expect(find.text('−1 POSIÇÃO'), findsOneWidget);
    });

    testWidgets('chip da identidade usa o formato da equipe', (tester) async {
      await abrir(tester);
      expect(
        find.descendant(
          of: find.byKey(const Key('ranking-story-info-identity')),
          matching: find.text('Dupla'),
        ),
        findsOneWidget,
      );
    });

    for (final source in BookingStoryPhotoSource.values) {
      testWidgets('fundo "Foto" pela ${source.name} vira o fundo da arte', (
        tester,
      ) async {
        BookingStoryPhotoSource? asked;
        await abrir(
          tester,
          picker: (s) async {
            asked = s;
            return pixel;
          },
        );

        await tester.tap(find.byKey(const Key('booking-story-theme-photo')));
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(ValueKey('booking-story-photo-source-${source.name}')),
        );
        await tester.pumpAndSettle();

        expect(asked, source);
        final art =
            tester.widget<RankingStoryCard>(find.byType(RankingStoryCard));
        expect(art.theme, BookingStoryTheme.photo);
        expect(art.photo, pixel);
      });
    }
  });

  group('Tela do ranking', () {
    Future<void> pumpRanking(
      WidgetTester tester,
      List<RankingListEntry> entries, {
      RankingStoryRequest? storyRequest,
      RankingPageFilter? initialFilter,
    }) async {
      // 400: a fonte Ahem do teste é mais larga que a Sora e, abaixo disso,
      // estoura a barra "Postar no story" do editor (mesmo tamanho da campanha).
      tester.view.physicalSize = const Size(400, 844);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            rankingListEntriesProvider.overrideWith((ref) async => entries),
            rankingSportProvider.overrideWith((ref) async => 'VOLEI_PRAIA'),
            sandRankEnabledProvider.overrideWith((ref) => Stream.value(false)),
            if (initialFilter != null)
              rankingPageFilterProvider.overrideWith((ref) => initialFilter),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: AthleteRankingPage(storyRequest: storyRequest),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    RankingPageFilter filterOf(WidgetTester tester) =>
        ProviderScope.containerOf(
          // Com o editor aberto por cima, a tela do ranking fica fora do palco.
          tester.element(find.byType(AthleteRankingPage, skipOffstage: false)),
        ).read(rankingPageFilterProvider);

    testWidgets('"Compartilhar minha posição" abre o story na melhor linha', (
      tester,
    ) async {
      // Duas linhas do atleta (duas duplas): vale a melhor.
      final entries = [
        for (var r = 1; r <= 12; r++) athlete(r, 500 - r, me: r == 9 || r == 2),
      ];
      await pumpRanking(tester, entries);

      final button = find.byKey(const Key('ranking-share-position'));
      expect(button, findsOneWidget);
      expect(
        find.descendant(of: button, matching: find.text('2º')),
        findsOneWidget,
      );

      await tester.tap(button);
      await tester.pumpAndSettle();

      expect(find.byType(RankingStoryPage), findsOneWidget);
      final art =
          tester.widget<RankingStoryCard>(find.byType(RankingStoryCard));
      expect(art.data.rank, 2);
      expect(art.data.total, 12);
      expect(art.data.isTeam, isFalse);
      expect(find.text('VICE-LÍDER DO RANKING'), findsOneWidget);
    });

    testWidgets('fora do recorte, sem botão', (tester) async {
      await pumpRanking(tester, [athlete(1, 500), athlete(2, 400)]);
      expect(find.byKey(const Key('ranking-share-position')), findsNothing);
    });

    group('push do dia seguinte ao torneio', () {
      final entries = [
        for (var r = 1; r <= 12; r++) athlete(r, 500 - r, me: r == 4),
      ];
      const request = RankingStoryRequest(sport: 'VOLEI_PRAIA', year: 2026);

      testWidgets('abre o editor direto, no recorte individual pedido', (
        tester,
      ) async {
        await pumpRanking(
          tester,
          entries,
          storyRequest: request,
          initialFilter: const RankingPageFilter(
            mode: RankingListMode.teams,
            year: 2025,
            gender: RankingGenderFilter.female,
            format: RankingFormatFilter.trio,
          ),
        );

        final filter = filterOf(tester);
        expect(filter.mode, RankingListMode.athletes);
        expect(filter.year, 2026);
        expect(filter.sport, 'VOLEI_PRAIA');
        expect(filter.hasActiveFilters, isFalse);

        expect(find.byType(RankingStoryPage), findsOneWidget);
        final art =
            tester.widget<RankingStoryCard>(find.byType(RankingStoryCard));
        expect(art.data.rank, 4);
        expect(art.data.season, 2026);
        expect(art.data.isTeam, isFalse);
      });

      testWidgets('fechar o editor deixa o ranking, sem reabrir', (
        tester,
      ) async {
        await pumpRanking(tester, entries, storyRequest: request);
        Navigator.of(tester.element(find.byType(RankingStoryPage))).pop();
        await tester.pumpAndSettle();

        expect(find.byType(RankingStoryPage), findsNothing);
        expect(find.byKey(const Key('ranking-share-position')), findsOneWidget);
      });

      testWidgets('atleta fora da lista pedida: fica só o ranking', (
        tester,
      ) async {
        await pumpRanking(
          tester,
          [athlete(1, 500), athlete(2, 400)],
          storyRequest: request,
        );
        expect(find.byType(RankingStoryPage), findsNothing);
        expect(find.byType(AthleteRankingPage), findsOneWidget);
      });
    });
  });

  group('RankingStoryRequest.fromQuery', () {
    test('sem story=1 não há pedido', () {
      expect(RankingStoryRequest.fromQuery(const {}), isNull);
      expect(
        RankingStoryRequest.fromQuery(const {'esporte': 'VOLEI_PRAIA'}),
        isNull,
      );
    });

    test('lê esporte e temporada; o que falta fica com a tela', () {
      expect(
        RankingStoryRequest.fromQuery(
          const {'story': '1', 'esporte': 'VOLEI_PRAIA', 'ano': '2026'},
        ),
        const RankingStoryRequest(sport: 'VOLEI_PRAIA', year: 2026),
      );
      final bare = RankingStoryRequest.fromQuery(
        const {'story': '1', 'esporte': ' ', 'ano': 'x'},
      )!;
      expect(bare, const RankingStoryRequest());
      expect(
        bare.filterFrom(
            const RankingPageFilter(year: 2025, sport: 'FUTEVOLEI')),
        isA<RankingPageFilter>()
            .having((f) => f.year, 'year', 2025)
            .having((f) => f.sport, 'sport', 'FUTEVOLEI'),
      );
    });
  });
}
