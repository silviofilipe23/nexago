// Capa padrão da liga: mesma regra do torneio, porque a liga grava o próprio
// `sport` com o mesmo vocabulário (`league_create_mapper.dart`).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/league_detail/league_detail_hero.dart';

void main() {
  DiscoveryLeague liga({String sport = 'beachVolleyball', String? capa}) {
    return DiscoveryLeague(
      id: 'l1',
      name: 'Liga nexaGO',
      seasonLabel: 'Temporada 2026',
      city: 'Goiânia',
      state: 'GO',
      coverUrl: capa,
      sport: sport,
      stages: const [
        DiscoveryLeagueStage(
          id: 's1',
          name: 'Etapa 1',
          order: 1,
          tournamentIds: ['t1'],
        ),
      ],
    );
  }

  Future<void> pumpHero(WidgetTester tester, DiscoveryLeague l) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: SingleChildScrollView(
            child: LeagueDetailHero(
              league: l,
              topInset: 0,
              onBack: () {},
              onBookmark: () {},
              onShare: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pump();
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

  testWidgets('liga sem capa usa a arte do próprio esporte', (tester) async {
    await pumpHero(tester, liga());

    expect(assetRenderizado(tester), 'assets/images/sports/volei_praia.webp');
  });

  testWidgets('cada esporte traz a sua arte no herói da liga', (tester) async {
    await pumpHero(tester, liga(sport: 'footvolley'));
    expect(assetRenderizado(tester), contains('futevolei'));

    await pumpHero(tester, liga(sport: 'indoorVolleyball'));
    expect(assetRenderizado(tester), contains('volei_quadra'));
  });

  testWidgets('liga sem esporte reconhecido segue no gradiente', (
    tester,
  ) async {
    await pumpHero(tester, liga(sport: ''));

    expect(tester.takeException(), isNull);
    expect(assetRenderizado(tester), isNull);
  });
}
