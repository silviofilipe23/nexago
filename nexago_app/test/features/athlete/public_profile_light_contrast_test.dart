import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/athlete/domain/athlete_podiums.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_providers.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/public_profile_achievements_tab.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/public_profile_header.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/public_profile_sports_section.dart';

import '../../core/theme/state_tone_contrast.dart';

const _profile = AthleteProfile(
  id: 'u1',
  name: 'Maria Alves',
  nickname: 'Mari',
  sport: 'Vôlei de praia',
  primarySportFirestoreId: 'VOLEI_PRAIA',
  level: 'Intermediário',
  city: 'Goiânia',
  state: 'GO',
);

/// Cor do degradê [g] na altura [t] (0 no topo, 1 no pé).
Color _sample(LinearGradient g, double t) {
  final stops = g.stops!;
  for (var i = 1; i < stops.length; i++) {
    if (t <= stops[i]) {
      final f = (t - stops[i - 1]) / (stops[i] - stops[i - 1]);
      return Color.lerp(g.colors[i - 1], g.colors[i], f)!;
    }
  }
  return g.colors.last;
}

Color _textColor(WidgetTester tester, Finder text) => tester
    .widget<RichText>(
        find.descendant(of: text, matching: find.byType(RichText)))
    .text
    .style!
    .color!;

Future<void> _pump(WidgetTester tester, ThemeData theme, Widget child) async {
  tester.view.physicalSize = const Size(402, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: theme,
      home: Scaffold(body: SingleChildScrollView(child: child)),
    ),
  );
  await tester.pump();
}

void main() {
  for (final (name, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('tema $name', () {
      // A identidade é branca e fica no pé da capa. O véu é quem garante a
      // leitura, então ele tem de estar escuro em cada linha de texto mesmo
      // sobre a foto mais clara possível (branca).
      testWidgets('nome, apelido e cidade legíveis sobre a capa', (
        tester,
      ) async {
        await _pump(
          tester,
          theme,
          PublicProfileHeader(
            profile: _profile,
            ranking: const AthletePublicRankingSnapshot(rank: 12),
            onBack: () {},
          ),
        );

        final veilFinder = find.byWidgetPredicate(
          (w) =>
              w is DecoratedBox &&
              w.decoration is BoxDecoration &&
              (w.decoration as BoxDecoration).gradient is LinearGradient,
        );
        final veil = (tester.widget<DecoratedBox>(veilFinder.first).decoration
                as BoxDecoration)
            .gradient! as LinearGradient;
        final cover = tester.getRect(veilFinder.first);

        for (final text in ['Mari', 'Maria Alves', _profile.locationLabel]) {
          final finder = find.text(text);
          final color = _textColor(tester, finder);
          final rect = tester.getRect(finder);
          for (final y in [rect.top, rect.center.dy, rect.bottom]) {
            final t = ((y - cover.top) / cover.height).clamp(0.0, 1.0);
            for (final photo in [AppColors.white, AppColors.black]) {
              final bg = Color.alphaBlend(_sample(veil, t), photo);
              expect(
                contrastRatio(color, bg),
                greaterThanOrEqualTo(4.5),
                reason: '"$text" ($color) a ${(t * 100).round()}% da capa '
                    'sobre foto $photo',
              );
            }
          }
        }
      });

      // O card com arte é escuro nos dois temas: o terço esquerdo das artes,
      // onde fica o texto, é preto e ainda passa pelo multiply de 0x8C.
      testWidgets('card do esporte com arte: texto claro sobre a arte', (
        tester,
      ) async {
        await _pump(
          tester,
          theme,
          const PublicProfileSportsSection(
            sports: [
              AthletePublicSportEntry(
                label: 'Vôlei de praia',
                levelLabel: 'Intermediário',
                levelSegments: 3,
                isPrimary: true,
                firestoreCode: 'VOLEI_PRAIA',
              ),
            ],
          ),
        );

        const artFloor = Color(0xFF1A1A1A);
        // O primeiro "Vôlei de praia" é a aba, laranja; o do card é o último.
        final texts = {
          'Vôlei de praia': find.text('Vôlei de praia').last,
          for (final t in ['NÍVEL', 'Intermediário', 'RANKING', '—'])
            t: find.text(t),
        };
        for (final MapEntry(key: text, value: finder) in texts.entries) {
          final color = _textColor(tester, finder);
          expect(
            contrastRatio(color, artFloor),
            greaterThanOrEqualTo(4.5),
            reason: '"$text" ($color) sobre a arte',
          );
        }
      });

      testWidgets('card do esporte sem arte segue o tema', (tester) async {
        await _pump(
          tester,
          theme,
          const PublicProfileSportsSection(
            sports: [
              AthletePublicSportEntry(
                label: 'Corrida',
                levelLabel: 'Iniciante 1',
                levelSegments: 1,
                isPrimary: false,
                firestoreCode: 'CORRIDA',
              ),
            ],
          ),
        );

        for (final text in ['NÍVEL', 'Iniciante 1', 'RANKING', '—']) {
          final element = find.text(text).evaluate().first;
          final color = _textColor(tester, find.text(text));
          expect(
            contrastRatio(color, backdropOf(element)),
            greaterThanOrEqualTo(4.5),
            reason: '"$text" ($color) sobre ${backdropOf(element)}',
          );
        }
      });

      testWidgets('medalhas e troféus de Conquistas legíveis', (tester) async {
        tester.view.physicalSize = const Size(402, 1400);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              athletePodiumsProvider.overrideWith(
                (ref, id) async => const [
                  AthletePodium(
                    tournamentId: 't1',
                    tournamentName: 'Copa A',
                    place: 1,
                    year: 2026,
                  ),
                  AthletePodium(
                    tournamentId: 't2',
                    tournamentName: 'Copa B',
                    place: 2,
                    year: 2026,
                  ),
                  AthletePodium(
                    tournamentId: 't3',
                    tournamentName: 'Copa C',
                    place: 3,
                    year: 2025,
                  ),
                ],
              ),
            ],
            child: MaterialApp(
              theme: theme,
              home: const Scaffold(
                body: SingleChildScrollView(
                  child: PublicProfileAchievementsTab(userId: 'u1'),
                ),
              ),
            ),
          ),
        );
        await tester.pump();
        await tester.pump();

        for (final place in ['1º', '2º', '3º']) {
          final element = find.text(place).evaluate().single;
          final color = _textColor(tester, find.text(place));
          expect(
            contrastRatio(color, backdropOf(element)),
            greaterThanOrEqualTo(4.5),
            reason: '"$place" ($color) sobre ${backdropOf(element)}',
          );
        }

        final trophies = find.byIcon(Icons.emoji_events_rounded);
        expect(trophies, findsNWidgets(3));
        for (final element in trophies.evaluate()) {
          final color = (element.widget as Icon).color!;
          expect(
            contrastRatio(color, backdropOf(element)),
            greaterThanOrEqualTo(3.0),
            reason: 'Troféu ($color) sobre ${backdropOf(element)}',
          );
        }
      });
    });
  }

  // O escuro é a referência: a correção do claro não muda nenhuma cor dele.
  testWidgets('tema escuro: véu da capa como antes', (
    tester,
  ) async {
    await _pump(
      tester,
      AppTheme.dark,
      PublicProfileHeader(
        profile: _profile,
        ranking: const AthletePublicRankingSnapshot(),
        onBack: () {},
      ),
    );
    final veil = (tester
            .widget<DecoratedBox>(
              find
                  .byWidgetPredicate(
                    (w) =>
                        w is DecoratedBox &&
                        w.decoration is BoxDecoration &&
                        (w.decoration as BoxDecoration).gradient
                            is LinearGradient,
                  )
                  .first,
            )
            .decoration as BoxDecoration)
        .gradient! as LinearGradient;
    final canvas = AppThemeColors.ofBrightness(Brightness.dark).canvas;
    expect(veil.colors, [
      Colors.black.withValues(alpha: 0.35),
      Colors.transparent,
      Colors.black.withValues(alpha: 0.55),
      canvas.withValues(alpha: 0.92),
      canvas,
    ]);
    expect(veil.stops, [0, 0.30, 0.62, 0.88, 1]);
  });
}
