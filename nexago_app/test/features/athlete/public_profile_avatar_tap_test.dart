import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/profile_photo_viewer.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/public_profile_header.dart';

void main() {
  Widget wrap(String? avatarUrl) => MaterialApp(
        theme: AppTheme.dark,
        home: MediaQuery(
          data: const MediaQueryData(padding: EdgeInsets.only(top: 59)),
          child: Scaffold(
            body: SingleChildScrollView(
              child: PublicProfileHeader(
                profile: AthleteProfile(
                  id: 'u1',
                  name: 'Ygor',
                  avatarUrl: avatarUrl,
                  sport: 'Vôlei de praia',
                  primarySportFirestoreId: 'VOLEI_PRAIA',
                  level: 'Iniciante 1',
                  city: 'Goiânia',
                ),
                ranking: const AthletePublicRankingSnapshot(),
                onBack: () {},
              ),
            ),
          ),
        ),
      );

  testWidgets('tocar no avatar com foto amplia', (tester) async {
    await tester.pumpWidget(wrap('https://x/a.jpg'));
    await tester.tap(find.bySemanticsLabel(RegExp('Ampliar foto de perfil')));
    await tester.pumpAndSettle();

    expect(find.byType(ProfilePhotoViewer), findsOneWidget);
  });

  testWidgets('tocar no avatar sem foto não abre nada', (tester) async {
    await tester.pumpWidget(wrap(null));
    await tester.tap(find.bySemanticsLabel(RegExp('Ampliar foto de perfil')));
    await tester.pumpAndSettle();

    expect(find.byType(ProfilePhotoViewer), findsNothing);
  });
}
