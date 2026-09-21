// Capa padrão do torneio nas telas do app: sem capa enviada, o esporte escolhe
// a arte. O gradiente segue existindo, mas só para torneio sem esporte
// reconhecido.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_chips.dart';
import 'package:nexago_app/features/tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_detail/tournament_detail_hero.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_discovery_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_partner_invite/partner_invite_tournament_card.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  DiscoveryTournament torneio({String sport = 'beachVolleyball', String? capa}) {
    return DiscoveryTournament(
      id: 't1',
      name: 'Copa Teste',
      location: 'Arena Teste',
      city: 'Goiânia',
      dateLabel: '16/08',
      startDate: DateTime(2026, 8, 16),
      categories: const [TournamentGenderCat.m],
      format: TournamentFormat.dupla,
      priceLabel: 'R\$ 140,00',
      priceValue: 140,
      spotsLeft: 2,
      spotsTotal: 8,
      status: TournamentListingStatus.open,
      featured: false,
      enrolledCount: 6,
      liveMatchesNow: 0,
      imageUrl: capa,
      sport: sport,
      categoryOffers: const [
        TournamentCategoryOffer(
          id: 'Masc',
          name: 'Masculino C',
          entryFee: 140,
          maxTeams: 8,
          spotsLeft: 2,
        ),
      ],
    );
  }

  Future<void> pumpCard(WidgetTester tester, DiscoveryTournament t) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tournamentCategoryEnrollmentCountsProvider.overrideWith(
            (ref, tournamentId) => Stream.value(const {'Masc': 6}),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: SingleChildScrollView(
              child: TournamentDiscoveryCard(tournament: t, onTap: () {}),
            ),
          ),
        ),
      ),
    );
  }

  String? assetRenderizado(WidgetTester tester) {
    for (final img in tester.widgetList<Image>(find.byType(Image))) {
      final provider = img.image;
      if (provider is AssetImage && provider.assetName.contains('/sports/')) {
        return provider.assetName;
      }
    }
    return null;
  }

  testWidgets('card sem capa usa a arte do esporte do torneio', (tester) async {
    await pumpCard(tester, torneio());

    expect(assetRenderizado(tester), 'assets/images/sports/volei_praia.webp');
  });

  testWidgets('cada esporte traz a sua arte no card', (tester) async {
    await pumpCard(tester, torneio(sport: 'footvolley'));
    expect(assetRenderizado(tester), contains('futevolei'));

    await pumpCard(tester, torneio(sport: 'indoorVolleyball'));
    expect(assetRenderizado(tester), contains('volei_quadra'));
  });

  testWidgets('card de torneio sem esporte não quebra nem inventa arte', (
    tester,
  ) async {
    await pumpCard(tester, torneio(sport: ''));

    expect(tester.takeException(), isNull);
    expect(assetRenderizado(tester), isNull);
  });

  TournamentDetail detalhe({String sport = 'beachVolleyball'}) {
    return TournamentDetail(
      id: 't1',
      name: 'Etapa Garden',
      location: 'Arena Garden',
      city: 'Goiânia, GO',
      dateLabel: '21/04',
      startDate: DateTime(2026, 4, 21),
      endDate: DateTime(2026, 4, 21),
      categories: const [TournamentGenderCat.m],
      format: TournamentFormat.dupla,
      priceLabel: r'R$ 90',
      priceValue: 90,
      spotsLeft: 20,
      spotsTotal: 80,
      status: TournamentListingStatus.open,
      featured: false,
      enrolledCount: 60,
      liveMatchesNow: 0,
      leagueStageOrder: 1,
      sport: sport,
    );
  }

  Future<void> pumpHero(WidgetTester tester, TournamentDetail t) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: SingleChildScrollView(
            child: TournamentDetailHero(
              tournament: t,
              stats: const TournamentDetailStats(
                categoryCount: 3,
                openCategories: 2,
                spotsTotal: 80,
                spotsEnrolled: 60,
                prizeTotalLabel: r'R$ 13.500',
              ),
              topInset: 0,
              toolbar: const SizedBox.shrink(),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('herói do detalhe sem capa usa a arte do esporte', (
    tester,
  ) async {
    await pumpHero(tester, detalhe());

    expect(assetRenderizado(tester), 'assets/images/sports/volei_praia.webp');
  });

  testWidgets('com a arte de fundo os chips ganham fundo escuro', (
    tester,
  ) async {
    // A arte é foto: o chip da etapa precisa do mesmo tratamento que ganhava
    // sobre capa enviada, senão o texto some no fundo claro da areia.
    await pumpHero(tester, detalhe());

    final chips = tester
        .widgetList<NexaStatusChip>(find.byType(NexaStatusChip))
        .where((c) => c.label.contains('ETAPA'));

    expect(chips, isNotEmpty, reason: 'chip da etapa não encontrado');
    expect(chips.every((c) => c.background != null), isTrue);
  });

  testWidgets('herói de torneio sem esporte segue no gradiente', (
    tester,
  ) async {
    await pumpHero(tester, detalhe(sport: ''));

    expect(tester.takeException(), isNull);
    expect(assetRenderizado(tester), isNull);
  });

  testWidgets('card do convite de parceiro sem capa usa a arte do esporte', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: PartnerInviteTournamentCard.fromDetail(
            tournament: detalhe(sport: 'beachTennis'),
            categoryBadge: 'Masculino C',
            dateLabel: '21/04',
          ),
        ),
      ),
    );

    expect(assetRenderizado(tester), 'assets/images/sports/beach_tennis.webp');
  });
}
