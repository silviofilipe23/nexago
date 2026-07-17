import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_providers.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/steps/tournament_create_prizes_page.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/widgets/organizer_form_widgets.dart';

void main() {
  const category = TournamentCategoryDraft(id: 'c1', name: 'Masculino A');

  late ProviderContainer container;

  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Builder(
            builder: (context) {
              container = ProviderScope.containerOf(context);
              return const TournamentCreatePrizesPage();
            },
          ),
        ),
      ),
    );
    await tester.pump(); // executa o post-frame (syncWizardStep)
  }

  OrganizerWizardContinueButton continueButton(WidgetTester tester) {
    return tester.widget<OrganizerWizardContinueButton>(
      find.byType(OrganizerWizardContinueButton),
    );
  }

  testWidgets('renders dedicated prize step with cash toggle', (tester) async {
    await pumpPage(tester);

    expect(find.text('Premiação'), findsOneWidget);
    expect(find.text('Premiação em dinheiro'), findsOneWidget);
    expect(find.text('PREMIAÇÃO POR CATEGORIA'), findsOneWidget);

    // Limpa o timer de persistência antes do teardown.
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('continue blocks until every category has prizes',
      (tester) async {
    await pumpPage(tester);

    container
        .read(tournamentCreateWizardProvider.notifier)
        .addCategory(category);
    await tester.pump();

    expect(continueButton(tester).enabled, isFalse);
    expect(find.text('Editar premiação'), findsOneWidget);

    container.read(tournamentCreateWizardProvider.notifier)
        .updateCategoryPrizes(
      'c1',
      const [TournamentCategoryPrizeDraft(position: '1', valueCents: 50000)],
    );
    await tester.pump();

    expect(continueButton(tester).enabled, isTrue);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('disabling cash prizes hides the list and unblocks continue',
      (tester) async {
    await pumpPage(tester);

    container
        .read(tournamentCreateWizardProvider.notifier)
        .addCategory(category);
    await tester.pump();

    expect(continueButton(tester).enabled, isFalse);

    await tester.tap(find.byType(Switch));
    await tester.pump();

    expect(find.text('PREMIAÇÃO POR CATEGORIA'), findsNothing);
    expect(continueButton(tester).enabled, isTrue);

    await tester.pumpWidget(const SizedBox());
  });
}
