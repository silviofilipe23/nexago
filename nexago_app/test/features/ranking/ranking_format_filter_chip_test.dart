import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/ranking/domain/ranking_list_models.dart';
import 'package:nexago_app/features/ranking/presentation/widgets/ranking_format_filter_chip.dart';

void main() {
  Widget wrap(Widget child) => MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: Center(child: child)),
      );

  /// Janela padrão de teste (800x600) limita a altura da folha e estoura o
  /// layout; em retrato de celular a folha cabe, como no app real.
  Future<void> usePhonePortrait(WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
  }

  testWidgets('chip mostra o rótulo do formato e abre a folha com as 5 opções',
      (tester) async {
    await usePhonePortrait(tester);
    RankingFormatFilter? changed;
    await tester.pumpWidget(wrap(RankingFormatFilterChip(
      selected: RankingFormatFilter.all,
      onChanged: (format) => changed = format,
    )));

    expect(find.text('Todos os formatos'), findsOneWidget);

    await tester.tap(find.byType(RankingFormatFilterChip));
    await tester.pumpAndSettle();

    expect(find.text('Filtrar por formato'), findsOneWidget);
    for (final option in ['Todos', 'Dupla', 'Trio', 'Quarteto', 'Quinteto']) {
      expect(find.text(option), findsOneWidget);
    }

    await tester.tap(find.text('Trio'));
    await tester.pumpAndSettle();

    expect(changed, RankingFormatFilter.trio);
    expect(find.text('Filtrar por formato'), findsNothing);
  });

  testWidgets('a opção atual vem marcada e reescolhê-la não dispara onChanged',
      (tester) async {
    await usePhonePortrait(tester);
    var calls = 0;
    await tester.pumpWidget(wrap(RankingFormatFilterChip(
      selected: RankingFormatFilter.quarteto,
      onChanged: (_) => calls++,
    )));

    expect(find.text('Quarteto'), findsOneWidget);

    await tester.tap(find.byType(RankingFormatFilterChip));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.check_rounded), findsOneWidget);

    // Com a folha aberta, 'Quarteto' existe no chip e na opção — o `.last`
    // é a opção da folha.
    await tester.tap(find.text('Quarteto').last);
    await tester.pumpAndSettle();

    expect(calls, 0);
    expect(find.text('Filtrar por formato'), findsNothing);
  });
}
