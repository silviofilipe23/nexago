import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/profile_photo_viewer.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/public_profile_header.dart';

void main() {
  Widget wrap(
    String? avatarUrl, {
    String? coverPhotoUrl,
    List<String> highlightPhotoUrls = const [],
  }) =>
      MaterialApp(
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
                  coverPhotoUrl: coverPhotoUrl,
                  highlightPhotoUrls: highlightPhotoUrls,
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

  List<String> fotosDoVisualizador(WidgetTester tester) => tester
      .widget<ProfilePhotoViewer>(find.byType(ProfilePhotoViewer))
      .photoUrls;

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

  testWidgets('do avatar o swipe segue para os destaques', (tester) async {
    await tester.pumpWidget(wrap(
      'https://x/a.jpg',
      highlightPhotoUrls: const ['https://x/d1.jpg', 'https://x/d2.jpg'],
    ));
    await tester.tap(find.bySemanticsLabel(RegExp('Ampliar foto de perfil')));
    await tester.pumpAndSettle();

    // A foto de perfil abre primeiro; os destaques vêm depois, na ordem
    // da galeria.
    expect(
      fotosDoVisualizador(tester),
      ['https://x/a.jpg', 'https://x/d1.jpg', 'https://x/d2.jpg'],
    );
  });

  testWidgets('sem foto de perfil o avatar não abre os destaques',
      (tester) async {
    // Tocar nas iniciais não pode cair no primeiro destaque como se fosse a
    // foto do atleta.
    await tester.pumpWidget(wrap(
      null,
      highlightPhotoUrls: const ['https://x/d1.jpg'],
    ));
    await tester.tap(find.bySemanticsLabel(RegExp('Ampliar foto de perfil')));
    await tester.pumpAndSettle();

    expect(find.byType(ProfilePhotoViewer), findsNothing);
  });

  testWidgets('tocar na capa amplia só a capa', (tester) async {
    await tester.pumpWidget(wrap(
      'https://x/a.jpg',
      coverPhotoUrl: 'https://x/capa.jpg',
      highlightPhotoUrls: const ['https://x/d1.jpg'],
    ));
    await tester.tap(find.bySemanticsLabel(RegExp('Ampliar foto de capa')));
    // Nada de `pumpAndSettle`: com foto de capa o esqueleto pulsa em loop
    // enquanto a imagem não chega, e a espera nunca termina.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(fotosDoVisualizador(tester), ['https://x/capa.jpg']);
  });

  testWidgets('capa de esporte não é tocável', (tester) async {
    // Sem capa própria entra a arte do esporte, que é asset local: não há
    // foto do atleta para ampliar.
    await tester.pumpWidget(wrap('https://x/a.jpg'));

    expect(
      find.bySemanticsLabel(RegExp('Ampliar foto de capa')),
      findsNothing,
    );
  });
}
