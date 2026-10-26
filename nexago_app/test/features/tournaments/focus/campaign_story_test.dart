import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/booking_story_photo_picker.dart';
import 'package:nexago_app/features/arenas/domain/booking_story.dart';
import 'package:nexago_app/features/tournaments/data/tournament_announcements_repository.dart';
import 'package:nexago_app/features/tournaments/domain/focus/campaign_share_data.dart';
import 'package:nexago_app/features/tournaments/domain/focus/campaign_story.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_view_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/campaign_story_page.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/sections/focus_agora_section.dart';
import 'package:nexago_app/features/tournaments/presentation/focus/widgets/campaign_story_card.dart';

/// PNG 1×1 transparente.
final pixel = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
);

Finder rich(String text) => find.textContaining(text, findRichText: true);

CampaignShareData campaign({
  CampaignPlacement placement = CampaignPlacement.none,
  int wins = 3,
  int losses = 1,
  List<CampaignRow>? rows,
  String teamName = 'Ana / Bia',
  String tournamentName = 'Copa Verão',
}) {
  return CampaignShareData(
    placement: placement,
    categoryLine: 'Feminino B',
    teamName: teamName,
    players: const [],
    wins: wins,
    losses: losses,
    setsWon: 7,
    setsLost: 3,
    winRateLabel: 'Aprov. 75%',
    rows: rows ??
        const [
          CampaignGroupRow(wins: 2, losses: 1, games: 3),
          CampaignMatchRow(
            won: true,
            isGroup: false,
            phaseLabel: 'Quartas',
            opponentName: 'Rival FC',
            setScore: '2–0',
            partials: ['6-3', '6-4'],
          ),
        ],
    tournamentName: tournamentName,
    locationName: 'Arena Sol',
    dateRangeLabel: '20–22 Ago',
  );
}

CampaignStoryData story({CampaignShareData? c}) => CampaignStoryData(
      campaign: c ?? campaign(),
      people: const [
        BookingStoryPerson(firstName: 'Ana', initials: 'AS'),
        BookingStoryPerson(firstName: 'Bia', initials: 'BL'),
      ],
      sportLabel: 'Beach Tennis',
    );

/// O pior caso da arte: pódio, seis linhas de mata-mata, nomes compridos.
CampaignStoryData longest() => story(
      c: campaign(
        placement: CampaignPlacement.third,
        teamName: 'Maria Eduarda Albuquerque / Ana Carolina Vasconcelos',
        tournamentName: 'Circuito Estadual de Beach Tennis — Etapa Final 2026',
        rows: [
          for (var i = 0; i < kCampaignMaxRows; i++)
            CampaignMatchRow(
              won: i.isEven,
              isGroup: false,
              phaseLabel: 'Oitavas de final',
              opponentName: 'Fernanda Rodrigues / Juliana Castro Mendes',
              setScore: '2–1',
              partials: const ['6-4', '3-6', '10-8'],
            ),
        ],
      ),
    );

Future<void> pumpCard(
  WidgetTester tester,
  CampaignStoryData data, {
  BookingStoryTheme theme = BookingStoryTheme.ember,
}) async {
  tester.view.physicalSize = const Size(400, 800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: Center(
        child: CampaignStoryCard(
          data: data,
          theme: theme,
          infos: CampaignStoryInfo.values.toSet(),
        ),
      ),
    ),
  );
}

TournamentMatch match({
  required String id,
  required int number,
  required String winnerId,
  String poolId = '',
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: poolId.isEmpty ? 'knockout' : 'group',
    poolId: poolId,
    teamAId: 'meu',
    teamBId: 'rival-$id',
    status: TournamentMatchStatus.completed,
    resultA: '',
    resultB: '',
    isGroupMatch: poolId.isNotEmpty,
    matchNumber: number,
    winnerId: winnerId,
    sets: const [TournamentMatchSet(a: 21, b: 15)],
  );
}

const player = TournamentMatchCardPlayerViewModel(
  initials: 'AB',
  avatarColor: Color(0xFF5B8DEF),
  name: 'Ana Souza',
);

TournamentMatchCardViewModel card(TournamentMatch m) =>
    TournamentMatchCardViewModel(
      match: m,
      teamA: const TournamentMatchCardTeamViewModel(
        displayName: 'Ana / Bia',
        players: [player, player],
      ),
      teamB: TournamentMatchCardTeamViewModel(
        displayName: 'Rival ${m.id}',
        players: const [player, player],
      ),
    );

final tournament = TournamentDetail(
  id: 't1',
  name: 'Copa Verão',
  location: 'Arena Sol',
  city: 'Goiânia',
  dateLabel: '20–22 Ago',
  startDate: DateTime(2026, 8, 20),
  endDate: DateTime(2026, 8, 22),
  categories: const [],
  format: TournamentFormat.dupla,
  priceLabel: r'R$ 120',
  priceValue: 120,
  spotsLeft: 8,
  spotsTotal: 16,
  status: TournamentListingStatus.open,
  featured: false,
  enrolledCount: 8,
  liveMatchesNow: 0,
  sport: 'beachTennis',
);

Future<void> pumpAgora(
  WidgetTester tester,
  List<TournamentMatch> matches,
) async {
  tester.view.physicalSize = const Size(400, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        tournamentMatchCardsProvider('t1').overrideWith(
          (ref) => Stream.value([for (final m in matches) card(m)]),
        ),
        tournamentAnnouncementsProvider('t1').overrideWith(
          (ref) => Stream.value(const []),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: FocusAgoraSection(
            tournament: tournament,
            categoryId: 'c1',
            athleteTeamIds: const {'meu'},
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('CampaignStoryData', () {
    test('selo e frase acompanham a colocação', () {
      final byPlacement = {
        for (final p in CampaignPlacement.values)
          p: story(c: campaign(placement: p)),
      };
      expect(byPlacement[CampaignPlacement.champion]!.pillLabel, 'CAMPEÕES');
      expect(
        byPlacement[CampaignPlacement.runnerUp]!.pillLabel,
        'VICE-CAMPEÕES',
      );
      expect(byPlacement[CampaignPlacement.third]!.pillLabel, '3º LUGAR');
      expect(byPlacement[CampaignPlacement.none]!.pillLabel, 'CAMPANHA');
      expect(
        byPlacement.values.map((d) => d.headline).toSet(),
        hasLength(CampaignPlacement.values.length),
      );
    });

    test('kicker junta esporte e categoria; linha do evento, local e data', () {
      final data = story();
      expect(data.kicker, 'BEACH TENNIS · FEMININO B');
      expect(data.eventLine, 'Arena Sol · 20–22 Ago');
    });

    test('sem trajetória nem nome de equipe, os chips somem', () {
      final data = story(c: campaign(rows: const [], teamName: ''));
      expect(campaignStoryInfosFor(data), [
        CampaignStoryInfo.record,
        CampaignStoryInfo.event,
      ]);
    });

    CampaignMatchRow row(String phase, {bool group = false}) =>
        CampaignMatchRow(
          won: true,
          isGroup: group,
          phaseLabel: phase,
          opponentName: 'X',
          setScore: '2–0',
          partials: const [],
        );

    test('trajetória longa: grupo vira um resumo e a final fica', () {
      final rows = campaignStoryRows([
        row('Grupo A', group: true),
        row('Grupo A', group: true),
        row('Oitavas de final'),
        row('Quartas'),
        row('Semifinal'),
        row('Final'),
      ]);
      expect(rows, hasLength(kCampaignStoryMaxRows));
      final summary = rows.first as CampaignGroupRow;
      expect(summary.games, 2);
      expect(
        [for (final r in rows.skip(1)) (r as CampaignMatchRow).phaseLabel],
        ['Quartas', 'Semifinal', 'Final'],
      );
    });

    test('resumo do pôster entra na conta do resumo do story', () {
      final rows = campaignStoryRows([
        const CampaignGroupRow(wins: 2, losses: 1, games: 3),
        row('Oitavas de final'),
        row('Quartas'),
        row('Semifinal'),
        row('Final'),
      ]);
      expect((rows.first as CampaignGroupRow).games, 3);
      expect((rows.last as CampaignMatchRow).phaseLabel, 'Final');
    });

    test('só mata-mata: ficam as últimas fases', () {
      final rows = campaignStoryRows([
        for (final p in ['R1', 'R2', 'Oitavas', 'Quartas', 'Semi', 'Final'])
          row(p),
      ]);
      expect(
        [for (final r in rows) (r as CampaignMatchRow).phaseLabel],
        ['Oitavas', 'Quartas', 'Semi', 'Final'],
      );
    });

    test('"de final" sai do rótulo da fase', () {
      expect(campaignStoryPhaseLabel('Oitavas de final'), 'Oitavas');
      expect(campaignStoryPhaseLabel('Final'), 'Final');
    });

    test('legenda leva a colocação, o torneio, o cartel e a hashtag', () {
      final text = campaignStoryShareText(
        story(c: campaign(placement: CampaignPlacement.champion)),
      );
      expect(text, startsWith('Campeões no Copa Verão! 3V 1D.'));
      expect(text, contains('#'));
    });
  });

  group('CampaignStoryCard', () {
    for (final theme in BookingStoryTheme.values) {
      testWidgets('pior caso cabe na arte (${theme.name})', (tester) async {
        await pumpCard(tester, longest(), theme: theme);
        expect(tester.takeException(), isNull);
        expect(
          tester.getSize(find.byType(CampaignStoryCard)),
          const Size(360, 640),
        );
        expect(find.text('OITAVAS'), findsWidgets);
        // O bloco cresce para cima: não pode subir por cima da marca e do
        // selo do topo.
        expect(
          tester.getTopLeft(find.text('BEACH TENNIS · FEMININO B')).dy,
          greaterThan(tester.getBottomLeft(find.text('3º LUGAR')).dy + 8),
        );
      });
    }

    testWidgets('escreve cartel, trajetória, dupla e torneio', (tester) async {
      await pumpCard(tester, story());
      expect(find.text('Jogamos\ncom atitude.'), findsOneWidget);
      expect(find.text('BEACH TENNIS · FEMININO B'), findsOneWidget);
      expect(find.text('VITÓRIAS'), findsOneWidget);
      expect(find.text('7–3'), findsOneWidget);
      expect(find.text('2V 1D · 3 jogos'), findsOneWidget);
      expect(find.text('vs Rival FC'), findsOneWidget);
      expect(find.text('Ana / Bia'), findsOneWidget);
      expect(rich('Copa Verão'), findsOneWidget);
      expect(rich('Arena Sol · 20–22 Ago'), findsOneWidget);
    });
  });

  group('CampaignStoryPage', () {
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
            home: CampaignStoryPage(data: story()),
          ),
        ),
      );
      await tester.pump();
    }

    testWidgets('chip desligado tira a trajetória da arte; religar volta', (
      tester,
    ) async {
      await abrir(tester);
      expect(find.text('vs Rival FC'), findsOneWidget);

      await tester.tap(find.byKey(const Key('campaign-story-info-path')));
      await tester.pump();
      expect(find.text('vs Rival FC'), findsNothing);

      await tester.tap(find.byKey(const Key('campaign-story-info-path')));
      await tester.pump();
      expect(find.text('vs Rival FC'), findsOneWidget);
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
        final art = tester.widget<CampaignStoryCard>(
          find.byType(CampaignStoryCard),
        );
        expect(art.theme, BookingStoryTheme.photo);
        expect(art.photo, pixel);
      });
    }
  });

  group('Agora do Focus', () {
    testWidgets('campanha encerrada: "Postar campanha no story" abre o editor',
        (
      tester,
    ) async {
      await pumpAgora(tester, [
        match(id: 'g1', number: 1, winnerId: 'meu', poolId: 'p1'),
        match(id: 'k1', number: 2, winnerId: 'rival-k1'),
      ]);

      final button = find.byKey(const Key('focus-share-campaign-story'));
      await tester.scrollUntilVisible(
        button,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(button);
      await tester.pumpAndSettle();

      expect(find.byType(CampaignStoryPage), findsOneWidget);
      expect(find.text('CAMPANHA'), findsOneWidget);
      expect(find.text('BEACH TENNIS'), findsOneWidget);
      expect(find.text('Ana / Bia'), findsOneWidget);
      expect(find.text('vs Rival k1'), findsOneWidget);
    });

    testWidgets('sem partida encerrada não oferece o story', (tester) async {
      await pumpAgora(tester, const []);
      expect(
        find.byKey(const Key('focus-share-campaign-story')),
        findsNothing,
      );
    });
  });
}
