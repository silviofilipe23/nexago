import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/steps/tournament_create_identity_page.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/widgets/organizer_form_widgets.dart';

void main() {
  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const TournamentCreateIdentityPage(),
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

  testWidgets('renders step title and sport selector', (tester) async {
    await pumpPage(tester);

    expect(find.text('Identidade do torneio'), findsOneWidget);
    expect(find.text('NOME DO TORNEIO'), findsOneWidget);
    expect(find.text('ESPORTE'), findsOneWidget);
    expect(find.text('Vôlei de praia'), findsWidgets); // esporte default

    // Limpa o timer de persistência antes do teardown.
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('continue button is disabled until a name is typed',
      (tester) async {
    await pumpPage(tester);

    expect(continueButton(tester).enabled, isFalse);

    await tester.enterText(
      find.byType(OrganizerTextField).first,
      'Open Goiânia Beach',
    );
    await tester.pump();

    expect(continueButton(tester).enabled, isTrue);

    await tester.pumpWidget(const SizedBox());
  });
}
