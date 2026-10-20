import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_stats_logic.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_stats_providers.dart';
import 'package:nexago_app/features/athlete/domain/gamification_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_providers.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_profile_main_view.dart';
import 'package:nexago_app/features/ranking/domain/ranking_providers.dart';
import 'package:nexago_app/features/squad/application/squad_providers.dart';
import 'package:nexago_app/features/squad/domain/squad_models.dart';

/// Razão de contraste WCAG entre [fg] (composto sobre [bg]) e [bg].
double contrastRatio(Color fg, Color bg) {
  final a = Color.alphaBlend(fg, bg).computeLuminance();
  final b = bg.computeLuminance();
  final (hi, lo) = a > b ? (a, b) : (b, a);
  return (hi + 0.05) / (lo + 0.05);
}

// Apelido diferente do nome: o topo mostra as duas linhas.
const _profile = AthleteProfile(
  id: 'u1',
  name: 'Maria Alves',
  nickname: 'Mari',
  sport: 'Vôlei de praia',
  level: 'Intermediário',
  city: 'Goiânia',
  state: 'GO',
  onboardingCompleted: true,
);

// xp 340 → "NÍVEL 4" e "40 / 100 XP".
const _gamification = GamificationSummary(
  xp: 340,
  level: 3,
  streak: 2,
  totalGames: 12,
  lastGameDate: null,
  updatedAt: null,
);

Future<void> _pumpProfile(WidgetTester tester, ThemeData theme) async {
  tester.view.physicalSize = const Size(402, 874);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        sandRankEnabledProvider.overrideWith((ref) => Stream.value(false)),
        athleteProfileStatsProvider.overrideWith(
          (ref) async => AthleteProfileStats.empty,
        ),
        athleteProfilePartnerMatchCountsProvider
            .overrideWith((ref) async => const {}),
        currentAthletePlayPartnersProvider
            .overrideWith((ref) async => const []),
        competeHubUserRankingProvider.overrideWith((ref) async => null),
        squadEntryProvider.overrideWithValue(MySquad.none),
        currentAthleteMatchHistoryBundleProvider.overrideWith(
          (ref) async => const AthleteMatchHistoryBundle(
            matches: [],
            tournaments: [],
            seasonSummary: AthleteSeasonSummary(
              year: 2026,
              winRatePercent: 0,
              wins: 0,
              losses: 0,
            ),
          ),
        ),
      ],
      child: MaterialApp(
        theme: theme,
        home: Scaffold(
          body: AthleteProfileMainView(
            profile: _profile,
            embedded: true,
            readOnly: false,
            totalBookings: 0,
            nextBooking: null,
            gamificationSummary: _gamification,
            badges: const [],
            onEdit: () {},
            onShare: () {},
            onOpenSettings: () {},
            onCompleteProfile: () {},
            onOpenAgenda: () {},
            onOpenAchievements: () {},
            onOpenMatchHistory: () {},
            onOpenPartner: (_) {},
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

AppThemeColors _colors(WidgetTester tester) =>
    AppThemeColors(Theme.of(tester.element(find.byType(Scaffold))).colorScheme);

/// A capa: o primeiro degradê da página, atrás do topo.
final _coverBox = find
    .byWidgetPredicate(
      (w) =>
          w is DecoratedBox &&
          w.decoration is BoxDecoration &&
          (w.decoration as BoxDecoration).gradient is LinearGradient,
    )
    .first;

LinearGradient _cover(WidgetTester tester) =>
    (tester.widget<DecoratedBox>(_coverBox).decoration as BoxDecoration)
        .gradient! as LinearGradient;

/// Cada fundo possível atrás de [element], que está no topo: o que os
/// ancestrais pintam (chip, botão), composto sobre cada cor da capa sobre o
/// canvas. A capa é irmã do conteúdo no Stack, então o texto pode cair em
/// qualquer altura dela: com safe area, apelido ou nome em duas linhas, tudo
/// desce.
List<Color> _backdropsOf(WidgetTester tester, Element element) {
  final fills = <Color>[];
  element.visitAncestorElements((e) {
    if (e.widget is CustomScrollView) return false;
    final fill = switch (e.widget) {
      Material(:final type, :final color?)
          when type != MaterialType.transparency =>
        color,
      DecoratedBox(
        position: DecorationPosition.background,
        decoration: BoxDecoration(:final color?),
      ) =>
        color,
      ColoredBox(:final color) => color,
      _ => null,
    };
    if (fill != null) fills.add(fill);
    return true;
  });
  final canvas = _colors(tester).canvas;
  return [
    for (final stop in _cover(tester).colors)
      fills.reversed.fold(
        Color.alphaBlend(stop, canvas),
        (bg, fill) => Color.alphaBlend(fill, bg),
      ),
  ];
}

void _expectContrast(
  WidgetTester tester,
  Color fg,
  Element element,
  double min,
  String what,
) {
  for (final bg in _backdropsOf(tester, element)) {
    expect(
      contrastRatio(fg, bg),
      greaterThanOrEqualTo(min),
      reason: '$what ($fg) sobre $bg',
    );
  }
}

/// Texto [text] da página: 4,5:1 sobre todo fundo possível.
void _expectText(WidgetTester tester, String text) {
  final rich = find
      .descendant(of: find.text(text), matching: find.byType(RichText))
      .evaluate()
      .first;
  final color = (rich.widget as RichText).text.style!.color!;
  _expectContrast(tester, color, rich, 4.5, '"$text"');
}

/// Ícone [icon] da página: 3:1 sobre todo fundo possível (WCAG 1.4.11).
void _expectIcon(WidgetTester tester, IconData icon) {
  final element = find.byIcon(icon).evaluate().first;
  final color = (element.widget as Icon).color!;
  _expectContrast(tester, color, element, 3.0, 'Ícone $icon');
}

void main() {
  for (final (name, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('tema $name', () {
      testWidgets('nome, nome completo e cidade legíveis sobre a capa', (
        tester,
      ) async {
        await _pumpProfile(tester, theme);

        _expectText(tester, 'Mari');
        _expectText(tester, 'Maria Alves');
        _expectText(tester, _profile.locationLabel);
        _expectIcon(tester, Icons.location_on_outlined);
      });

      testWidgets('chips de esporte e nível legíveis', (tester) async {
        await _pumpProfile(tester, theme);

        _expectText(tester, 'Vôlei de praia');
        _expectIcon(tester, Icons.hexagon);
        _expectText(tester, 'INTERMEDIÁRIO');
      });

      testWidgets('botão de ajustes visível sobre a capa', (tester) async {
        await _pumpProfile(tester, theme);

        _expectIcon(tester, Icons.settings_outlined);
      });

      // O CustomScrollView pinta o 1º sliver (o topo) por cima dos seguintes:
      // se a capa passasse do topo, o fim do degradê desbotaria a faixa de
      // XP. Ela acaba com o topo, e o "NÍVEL" e o XP ficam direto no canvas.
      testWidgets('capa acaba no topo e "NÍVEL"/XP ficam legíveis', (
        tester,
      ) async {
        await _pumpProfile(tester, theme);
        final canvas = _colors(tester).canvas;
        final coverBottom = tester.getRect(_coverBox).bottom;

        for (final text in ['NÍVEL 4', '40 / 100 XP']) {
          final rich = find
              .descendant(of: find.text(text), matching: find.byType(RichText))
              .first;
          expect(tester.getRect(rich).top, greaterThanOrEqualTo(coverBottom));
          final color = tester.widget<RichText>(rich).text.style!.color!;
          expect(
            contrastRatio(color, canvas),
            greaterThanOrEqualTo(4.5),
            reason: '"$text" ($color) sobre $canvas',
          );
        }

        final bolt = find.byIcon(Icons.bolt_rounded);
        expect(tester.getRect(bolt).top, greaterThanOrEqualTo(coverBottom));
        final boltColor = tester.widget<Icon>(bolt).color!;
        expect(
          contrastRatio(boltColor, canvas),
          greaterThanOrEqualTo(3.0),
          reason: 'Raio ($boltColor) sobre $canvas',
        );
      });
    });
  }

  // O tema escuro é o visual de referência: o conserto do claro não pode
  // mexer em nenhuma cor dele. Só a capa mudou: tinha 300 px e cobria a faixa
  // de XP; agora tem a altura do topo, com o marrom indo até 70% dela.
  testWidgets('tema escuro: capa e cores idênticas às de antes', (
    tester,
  ) async {
    await _pumpProfile(tester, AppTheme.dark);
    final colors = _colors(tester);

    expect(_cover(tester).colors, [
      const Color(0xFF4A2410),
      const Color(0xFF2A1408),
      colors.canvas.withValues(alpha: 0),
    ]);
    expect(_cover(tester).stops, [0.0, 0.7, 1.0]);
    final top = find.ancestor(of: _coverBox, matching: find.byType(Stack));
    expect(tester.getRect(_coverBox), tester.getRect(top.first));

    Color textColor(String text) => tester
        .widget<RichText>(
          find
              .descendant(of: find.text(text), matching: find.byType(RichText))
              .first,
        )
        .text
        .style!
        .color!;

    expect(textColor('Mari'), colors.onSurface);
    expect(textColor('Maria Alves'), colors.onSurfaceMuted);
    expect(textColor(_profile.locationLabel), colors.onSurfaceMuted);
    expect(textColor('Vôlei de praia'), AppColors.brand);
    final sportChip = tester.widget<Container>(
      find
          .ancestor(
            of: find.text('Vôlei de praia'),
            matching: find.byType(Container),
          )
          .first,
    );
    expect(
      sportChip.decoration,
      BoxDecoration(
        color: const Color(0xFF2E1A0C),
        borderRadius: BorderRadius.circular(20),
      ),
    );
    expect(textColor('INTERMEDIÁRIO'), colors.onSurfaceMuted);
    expect(textColor('NÍVEL 4'), AppColors.brand);
    expect(textColor('40 / 100 XP'), colors.onSurfaceMuted);
    expect(
      tester.widget<Icon>(find.byIcon(Icons.bolt_rounded)).color,
      AppColors.brand,
    );
  });
}
