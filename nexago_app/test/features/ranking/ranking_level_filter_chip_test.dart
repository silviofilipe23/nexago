import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/presentation/widgets/ranking_level_filter_chip.dart';

void main() {
  Widget wrap(Widget child) => MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: Center(child: child)),
      );

  Future<void> usePhonePortrait(WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
  }

  testWidgets('a folha lista os 4 grupos e cabe em retrato de celular',
      (tester) async {
    await usePhonePortrait(tester);
    await tester.pumpWidget(wrap(RankingLevelFilterChip(
      selected: RankingLevelFilter.all,
      onChanged: (_) {},
    )));

    expect(find.text('Todos os níveis'), findsOneWidget);

    await tester.tap(find.byType(RankingLevelFilterChip));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Filtrar por nível'), findsOneWidget);
    for (final label in ['Iniciante', 'Intermediário', 'Avançado', 'Open']) {
      expect(find.text(label), findsOneWidget, reason: 'faltou $label');
    }
  });

  testWidgets('os degraus soltos da escada de 7 saíram do filtro',
      (tester) async {
    await usePhonePortrait(tester);
    await tester.pumpWidget(wrap(RankingLevelFilterChip(
      selected: RankingLevelFilter.all,
      onChanged: (_) {},
    )));

    await tester.tap(find.byType(RankingLevelFilterChip));
    await tester.pumpAndSettle();

    for (final label in [
      'Iniciante 1',
      'Iniciante 2',
      'Intermediário 1',
      'Intermediário 2',
      'Avançado 1',
      'Avançado 2',
    ]) {
      expect(find.text(label), findsNothing, reason: 'sobrou $label');
    }
  });

  testWidgets('escolher um grupo devolve o filtro e fecha a folha',
      (tester) async {
    await usePhonePortrait(tester);
    RankingLevelFilter? changed;
    await tester.pumpWidget(wrap(RankingLevelFilterChip(
      selected: RankingLevelFilter.all,
      onChanged: (level) => changed = level,
    )));

    await tester.tap(find.byType(RankingLevelFilterChip));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Avançado'));
    await tester.pumpAndSettle();

    expect(changed, RankingLevelFilter.avancado);
    expect(find.text('Filtrar por nível'), findsNothing);
  });

  testWidgets('o grupo atual vem marcado e reescolhê-lo não dispara onChanged',
      (tester) async {
    await usePhonePortrait(tester);
    var calls = 0;
    await tester.pumpWidget(wrap(RankingLevelFilterChip(
      selected: RankingLevelFilter.open,
      onChanged: (_) => calls++,
    )));

    expect(find.text('Open'), findsOneWidget);

    await tester.tap(find.byType(RankingLevelFilterChip));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.check_rounded), findsOneWidget);

    await tester.tap(find.text('Open').last);
    await tester.pumpAndSettle();
    expect(calls, 0);
  });

  testWidgets('fechar a folha sem escolher preserva o filtro atual',
      (tester) async {
    await usePhonePortrait(tester);
    var calls = 0;
    await tester.pumpWidget(wrap(RankingLevelFilterChip(
      selected: RankingLevelFilter.intermediario,
      onChanged: (_) => calls++,
    )));

    await tester.tap(find.byType(RankingLevelFilterChip));
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(200, 60));
    await tester.pumpAndSettle();

    expect(calls, 0);
  });

  testWidgets('em tela curta com fonte ampliada rola em vez de quebrar',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(375, 667));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    RankingLevelFilter? changed;
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: const TextScaler.linear(1.5)),
            child: Center(
              child: RankingLevelFilterChip(
                selected: RankingLevelFilter.all,
                onChanged: (level) => changed = level,
              ),
            ),
          ),
        ),
      ),
    ));

    await tester.tap(find.byType(RankingLevelFilterChip));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await tester.scrollUntilVisible(find.text('Open'), 80,
        scrollable: find.byType(Scrollable).last);
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(changed, RankingLevelFilter.open);
  });
}
