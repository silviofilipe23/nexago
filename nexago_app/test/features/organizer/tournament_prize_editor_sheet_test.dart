import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_providers.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/sheets/tournament_prize_editor_sheet.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/widgets/organizer_form_widgets.dart';

void main() {
  const category = TournamentCategoryDraft(id: 'c1', name: 'Masculino A');
  const otherCategory = TournamentCategoryDraft(id: 'c2', name: 'Feminino A');

  late ProviderContainer container;

  // Pumps controlados (<400ms de relógio) para o timer de persistência do
  // wizard nunca disparar dentro do teste (tocaria FirebaseAuth).
  Future<void> pumpSheet(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Consumer(
            builder: (context, ref, _) {
              container = ProviderScope.containerOf(context);
              return Scaffold(
                body: Center(
                  child: FilledButton(
                    onPressed: () => showTournamentPrizeEditorSheet(
                      context,
                      ref,
                      category: category,
                    ),
                    child: const Text('abrir'),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
    container.read(tournamentCreateWizardProvider.notifier)
      ..addCategory(category)
      ..addCategory(otherCategory);
    await tester.tap(find.text('abrir'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  List<String> rowTexts(WidgetTester tester) {
    final fields = tester
        .widgetList<OrganizerTextField>(find.byType(OrganizerTextField))
        .toList();
    return [for (final field in fields.skip(1)) field.controller.text];
  }

  String totalText(WidgetTester tester) => tester
      .widgetList<OrganizerTextField>(find.byType(OrganizerTextField))
      .first
      .controller
      .text;

  Future<void> tearDownSheet(WidgetTester tester) async {
    // Limpa o timer de persistência antes do teardown.
    await tester.pumpWidget(const SizedBox());
  }

  testWidgets('typing the total auto-splits into whole reais rows',
      (tester) async {
    await pumpSheet(tester);

    await tester.enterText(find.byType(OrganizerTextField).first, '1000');
    await tester.pump();

    expect(rowTexts(tester), ['500', '313', '187']);

    await tearDownSheet(tester);
  });

  testWidgets('editing one row updates the total and keeps the others',
      (tester) async {
    await pumpSheet(tester);

    await tester.enterText(find.byType(OrganizerTextField).first, '1000');
    await tester.pump();

    await tester.enterText(find.byType(OrganizerTextField).at(1), '600');
    await tester.pump();

    expect(totalText(tester), '1100');
    expect(rowTexts(tester), ['600', '313', '187']);

    await tearDownSheet(tester);
  });

  testWidgets('add placement appends the next position with empty value',
      (tester) async {
    await pumpSheet(tester);

    await tester.enterText(find.byType(OrganizerTextField).first, '1000');
    await tester.pump();

    await tester.ensureVisible(find.text('Adicionar colocação'));
    await tester.pump();
    await tester.tap(find.text('Adicionar colocação'));
    await tester.pump();

    expect(find.text('4º lugar'), findsWidgets);
    expect(rowTexts(tester), ['500', '313', '187', '']);
    expect(totalText(tester), '1000');

    await tearDownSheet(tester);
  });

  testWidgets('remove is only offered on the last row and updates the total',
      (tester) async {
    await pumpSheet(tester);

    expect(find.byTooltip('Remover colocação'), findsNothing);

    await tester.enterText(find.byType(OrganizerTextField).first, '1000');
    await tester.pump();

    expect(find.byTooltip('Remover colocação'), findsOneWidget);

    await tester.ensureVisible(find.byTooltip('Remover colocação'));
    await tester.pump();
    await tester.tap(find.byTooltip('Remover colocação'));
    await tester.pump();

    expect(rowTexts(tester), ['500', '313']);
    expect(totalText(tester), '813');

    await tearDownSheet(tester);
  });

  testWidgets('saving persists the customized distribution', (tester) async {
    await pumpSheet(tester);

    await tester.enterText(find.byType(OrganizerTextField).first, '1000');
    await tester.pump();
    await tester.enterText(find.byType(OrganizerTextField).at(1), '600');
    await tester.pump();

    await tester.ensureVisible(find.text('Salvar premiação'));
    await tester.pump();
    await tester.tap(find.text('Salvar premiação'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    final draft = container.read(tournamentCreateWizardProvider).draft;
    final saved = draft.categories.firstWhere((c) => c.id == 'c1').prizes;
    expect(saved.map((p) => p.valueCents), [60000, 31300, 18700]);
    final untouched = draft.categories.firstWhere((c) => c.id == 'c2').prizes;
    expect(untouched, isEmpty);

    await tearDownSheet(tester);
  });

  testWidgets('apply to all copies the distribution to every category',
      (tester) async {
    await pumpSheet(tester);

    await tester.enterText(find.byType(OrganizerTextField).first, '1000');
    await tester.pump();

    await tester.ensureVisible(find.byType(Switch));
    await tester.pump();
    await tester.tap(find.byType(Switch));
    await tester.pump();

    await tester.ensureVisible(find.text('Salvar premiação'));
    await tester.pump();
    await tester.tap(find.text('Salvar premiação'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    final draft = container.read(tournamentCreateWizardProvider).draft;
    for (final id in ['c1', 'c2']) {
      final prizes = draft.categories.firstWhere((c) => c.id == id).prizes;
      expect(prizes.map((p) => p.valueCents), [50000, 31300, 18700]);
    }

    await tearDownSheet(tester);
  });
}
