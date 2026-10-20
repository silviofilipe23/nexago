import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import 'state_tone_contrast.dart';

/// Uma tela (ou o pedaço dela que pinta um tom de estado) aberta com os
/// dados que acendem o tom.
class ToneScreen {
  const ToneScreen(this.name, this.open, this.root, this.expected);

  final String name;
  final Future<void> Function(WidgetTester tester, ThemeData theme) open;
  final Finder root;

  /// O que tem de ter sido conferido: texto, [IconData] ou `'marca'`.
  final List<Object> expected;
}

const tonePieceKey = Key('tone-piece');
final tonePiece = find.byKey(tonePieceKey);

/// Monta [child] numa tela do tema, opcionalmente sobre um card ou uma folha
/// (onde ela mora no app de verdade).
Future<void> pumpTonePiece(
  WidgetTester tester,
  ThemeData theme,
  Widget child, {
  bool onCard = false,
  bool onSheet = false,
  List<Override> overrides = const [],
}) async {
  tester.view.physicalSize = const Size(402, 1400);
  tester.view.devicePixelRatio = 1.0;

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: theme,
        home: Builder(
          builder: (context) {
            final colors = context.themeColors;
            final surface = onSheet
                ? colors.surfaceSheet
                : onCard
                    ? colors.surfaceCard
                    : null;
            return Scaffold(
              backgroundColor: colors.canvas,
              body: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: KeyedSubtree(
                  key: tonePieceKey,
                  child: surface == null
                      ? child
                      : Material(
                          color: surface,
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: child,
                          ),
                        ),
                ),
              ),
            );
          },
        ),
      ),
    ),
  );
  addTearDown(tester.view.reset);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 800));
}

/// Monta [page] inteira, com os [overrides] que a alimentam.
Future<void> pumpTonePage(
  WidgetTester tester,
  ThemeData theme,
  Widget page, {
  List<Override> overrides = const [],
  Size size = const Size(402, 1400),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(theme: theme, home: page),
    ),
  );
  addTearDown(tester.view.reset);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 800));
}

/// Para cada tela de [screens], nos dois temas: abre, confere com
/// [expectStateTonesLegible] e exige que tenha conferido o `expected`.
void stateToneScreensTests(List<ToneScreen> screens) {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  for (final (label, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('tema $label', () {
      for (final screen in screens) {
        testWidgets('${screen.name}: tons de estado legíveis', (tester) async {
          await screen.open(tester, theme);
          final checked = expectStateTonesLegible(tester, screen.root);
          expect(checked, containsAll(screen.expected));
        });
      }
    });
  }
}
