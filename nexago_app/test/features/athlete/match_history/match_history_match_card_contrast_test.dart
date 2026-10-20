import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/match_history/match_history_match_card.dart';

/// Razão de contraste WCAG entre [fg] (composto sobre [bg]) e [bg].
double contrastRatio(Color fg, Color bg) {
  final a = Color.alphaBlend(fg, bg).computeLuminance();
  final b = bg.computeLuminance();
  final (hi, lo) = a > b ? (a, b) : (b, a);
  return (hi + 0.05) / (lo + 0.05);
}

AthleteMatchHistoryItem _match(
  AthleteMatchResult result, {
  bool mvp = false,
}) =>
    AthleteMatchHistoryItem(
      id: result.name,
      playedAt: DateTime(2026, 3, 10),
      result: result,
      opponentLabel: 'Bruno & Caio',
      competitionLabel: 'Copa Verão',
      scoreDisplay: '2-0',
      setsDisplay: '21-18 · 21-15',
      isMvp: mvp,
    );

Future<void> _pumpCard(
  WidgetTester tester,
  ThemeData theme,
  AthleteMatchHistoryItem match, {
  bool compact = false,
}) async {
  tester.view.physicalSize = const Size(560, 400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: theme,
      home: Builder(
        builder: (context) => Scaffold(
          backgroundColor: context.themeColors.canvas,
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: MatchHistoryMatchCard(match: match, compact: compact),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

final _card = find.byType(MatchHistoryMatchCard);

/// Fundo opaco por trás de [element]: compõe, de fora para dentro, o que os
/// ancestrais pintam (o card e o fundo translúcido do selo).
Color _backdropOf(Element element) {
  final fills = <Color>[];
  element.visitAncestorElements((e) {
    final fill = switch (e.widget) {
      Material(:final type, :final color?)
          when type != MaterialType.transparency =>
        color,
      DecoratedBox(
        position: DecorationPosition.background,
        decoration: BoxDecoration(:final color?),
      ) =>
        color,
      _ => null,
    };
    if (fill != null) fills.add(fill);
    return true;
  });
  return fills.reversed.reduce((bg, fill) => Color.alphaBlend(fill, bg));
}

/// Cor e fundo do texto [text] dentro do card.
(Color, Color) _textOn(WidgetTester tester, String text) {
  final rich = find
      .descendant(
        of: find.descendant(of: _card, matching: find.text(text)),
        matching: find.byType(RichText),
      )
      .evaluate()
      .first;
  return ((rich.widget as RichText).text.style!.color!, _backdropOf(rich));
}

/// Fundo do selo do resultado (o quadrado atrás do "V"/"D").
Color _badgeFill(WidgetTester tester, String label) {
  final box = find.ancestor(
    of: find.descendant(of: _card, matching: find.text(label)),
    matching: find.byType(DecoratedBox),
  );
  return ((tester.widget<DecoratedBox>(box.first).decoration) as BoxDecoration)
      .color!;
}

/// A faixa colorida de 4 px na borda esquerda do card.
(Color, Color) _stripe(WidgetTester tester) {
  final box = find
      .descendant(of: _card, matching: find.byType(DecoratedBox))
      .evaluate()
      .firstWhere((e) => (e.renderObject! as RenderBox).size.width == 4);
  final color =
      ((box.widget as DecoratedBox).decoration as BoxDecoration).color!;
  return (color, _backdropOf(box));
}

void _expectContrast(Color fg, Color bg, double min, String what) {
  expect(
    contrastRatio(fg, bg),
    greaterThanOrEqualTo(min),
    reason: '$what ($fg) sobre $bg',
  );
}

void main() {
  setUpAll(() async {
    initializeNexagoEventTimezone();
    await initializeDateFormatting('pt_BR');
  });

  for (final (name, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('tema $name', () {
      for (final compact in [false, true]) {
        final size = compact ? 'compacto' : 'cheio';

        for (final (result, label) in [
          (AthleteMatchResult.win, 'V'),
          (AthleteMatchResult.loss, 'D'),
        ]) {
          testWidgets('$size: "$label" legível no selo e faixa visível', (
            tester,
          ) async {
            await _pumpCard(tester, theme, _match(result), compact: compact);

            final (letter, badge) = _textOn(tester, label);
            _expectContrast(letter, badge, 4.5, 'Selo "$label"');

            // Marca sem texto: 3:1 contra o card (WCAG 1.4.11).
            final (stripe, card) = _stripe(tester);
            expect(card, theme.colorScheme.surface);
            _expectContrast(stripe, card, 3.0, 'Faixa de "$label"');
          });
        }

        testWidgets('$size: MVP legível no card', (tester) async {
          await _pumpCard(
            tester,
            theme,
            _match(AthleteMatchResult.win, mvp: true),
            compact: compact,
          );

          final (text, card) = _textOn(tester, 'MVP');
          _expectContrast(text, card, 4.5, '"MVP"');
          final star = tester.widget<Icon>(
            find.descendant(
              of: _card,
              matching: find.byIcon(Icons.star_rounded),
            ),
          );
          _expectContrast(star.color!, card, 3.0, 'Estrela do MVP');
        });
      }

      testWidgets('resto do card legível', (tester) async {
        final match = _match(AthleteMatchResult.win);
        await _pumpCard(tester, theme, match);

        for (final text in [
          'Bruno & Caio',
          'Copa Verão',
          '2-0',
          DateFormat('d MMM', 'pt_BR')
              .format(toNexagoEventLocal(match.playedAt)),
          '21-18 · 21-15',
        ]) {
          final (color, bg) = _textOn(tester, text);
          _expectContrast(color, bg, 4.5, '"$text"');
        }
      });
    });
  }

  // O fundo menta/rosado do selo segue o tom cru nos dois temas: só o texto e
  // a faixa escurecem no claro.
  testWidgets('tema claro: selo mantém o fundo translúcido do tom cru', (
    tester,
  ) async {
    await _pumpCard(tester, AppTheme.light, _match(AthleteMatchResult.win));
    expect(_badgeFill(tester, 'V'), AppColors.win.withValues(alpha: 0.15));

    await _pumpCard(tester, AppTheme.light, _match(AthleteMatchResult.loss));
    expect(_badgeFill(tester, 'D'), AppColors.live.withValues(alpha: 0.15));
  });

  // O tema escuro é o visual de referência: o conserto do claro não pode
  // mexer em nenhuma cor dele.
  testWidgets('tema escuro: cores idênticas às de antes', (tester) async {
    for (final (result, label, tone) in [
      (AthleteMatchResult.win, 'V', AppColors.win),
      (AthleteMatchResult.loss, 'D', AppColors.live),
    ]) {
      await _pumpCard(tester, AppTheme.dark, _match(result, mvp: true));

      expect(_textOn(tester, label).$1, tone);
      expect(_badgeFill(tester, label), tone.withValues(alpha: 0.15));
      expect(_stripe(tester).$1, tone);
      expect(_textOn(tester, 'MVP').$1, AppColors.pending);
      expect(
        tester
            .widget<Icon>(
              find.descendant(
                of: _card,
                matching: find.byIcon(Icons.star_rounded),
              ),
            )
            .color,
        AppColors.pending,
      );
    }
  });
}
