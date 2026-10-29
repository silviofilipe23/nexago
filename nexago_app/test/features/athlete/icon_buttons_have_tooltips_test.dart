import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_month_grid.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/compete_hub/compete_hub_shell_app_bar.dart';

// Botão só com ícone precisa de nome: a dica do toque longo e o que o leitor
// de tela anuncia. Sem ela o atleta ouve só "botão".
Widget _wrap(Widget child) => MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(body: child),
    );

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  testWidgets('setas do calendário da Agenda dizem para que mês vão',
      (tester) async {
    DateTime? shown;
    await tester.pumpWidget(
      _wrap(
        AgendaMonthGrid(
          visibleMonth: DateTime(2026, 10),
          days: const [],
          onMonthChanged: (m) => shown = m,
          onDaySelected: (_) {},
        ),
      ),
    );

    await tester.tap(find.byTooltip('Mês anterior'));
    expect(shown, DateTime(2026, 9));
    await tester.tap(find.byTooltip('Próximo mês'));
    expect(shown, DateTime(2026, 11));
  });

  testWidgets('busca do Hub tem nome, e a ação extra também', (tester) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      _wrap(
        CompeteHubHeader(
          trailingActions: [
            CompeteHubAppBarIconButton(
              icon: Icons.admin_panel_settings_outlined,
              onTap: () {},
              tooltip: 'Painel da arena',
            ),
          ],
        ),
      ),
    );

    expect(find.byTooltip('Buscar torneios'), findsOneWidget);
    expect(find.byTooltip('Painel da arena'), findsOneWidget);
    // O Tooltip publica a dica no nó de semântica — é o que o VoiceOver e o
    // TalkBack leem junto do botão.
    expect(
      tester.getSemantics(find.byIcon(Icons.search_rounded)),
      containsSemantics(tooltip: 'Buscar torneios'),
    );
    semantics.dispose();
  });
}
