import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/public_profile_header.dart';

void main() {
  Widget wrap(AthleteProfile profile) => MaterialApp(
        theme: AppTheme.dark,
        home: MediaQuery(
          data: const MediaQueryData(padding: EdgeInsets.only(top: 59)),
          child: Scaffold(
            body: SingleChildScrollView(
              child: PublicProfileHeader(
                profile: profile,
                ranking: const AthletePublicRankingSnapshot(),
                onBack: () {},
              ),
            ),
          ),
        ),
      );

  AthleteProfile perfil({String? sportCode, String? cover}) => AthleteProfile(
        id: 'u1',
        name: 'Ygor',
        sport: 'Vôlei de praia',
        primarySportFirestoreId: sportCode,
        coverPhotoUrl: cover,
        level: 'Iniciante 1',
        city: 'Goiânia',
      );

  String? assetDaCapa(WidgetTester tester) {
    final imgs = tester.widgetList<Image>(find.byType(Image));
    for (final i in imgs) {
      final p = i.image;
      if (p is AssetImage && p.assetName.contains('/sports/')) {
        return p.assetName;
      }
    }
    return null;
  }

  testWidgets('sem capa própria usa a arte do esporte principal', (
    tester,
  ) async {
    await tester.pumpWidget(wrap(perfil(sportCode: 'VOLEI_PRAIA')));

    expect(assetDaCapa(tester), 'assets/images/sports/volei_praia.webp');
  });

  testWidgets('cada esporte traz a sua arte, não uma só genérica', (
    tester,
  ) async {
    await tester.pumpWidget(wrap(perfil(sportCode: 'BASQUETE')));
    expect(assetDaCapa(tester), contains('basquete'));

    await tester.pumpWidget(wrap(perfil(sportCode: 'CORRIDA')));
    expect(assetDaCapa(tester), contains('corrida'));
  });

  testWidgets('esporte sem arte cai no fundo pintado, não em imagem quebrada', (
    tester,
  ) async {
    // OUTROS não tem arte e nunca terá. Perfil legado pode nem ter esporte.
    for (final code in ['OUTROS', null]) {
      await tester.pumpWidget(wrap(perfil(sportCode: code)));

      expect(tester.takeException(), isNull);
      expect(assetDaCapa(tester), isNull, reason: 'para $code');
    }
  });
}
