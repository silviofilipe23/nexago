import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/presentation/league_create/steps/league_create_identity_page.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/widgets/organizer_form_widgets.dart';

void main() {
  Future<void> pumpPage(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const LeagueCreateIdentityPage(),
        ),
      ),
    );
    await tester.pump();
  }

  OrganizerWizardContinueButton button(WidgetTester tester) {
    return tester.widget<OrganizerWizardContinueButton>(
      find.byType(OrganizerWizardContinueButton),
    );
  }

  testWidgets('renders league identity step', (tester) async {
    await pumpPage(tester);
    expect(find.text('Identidade da liga'), findsOneWidget);
    expect(find.text('NOME DO CIRCUITO'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('continue enables after typing the league name', (tester) async {
    await pumpPage(tester);
    expect(button(tester).enabled, isFalse);

    await tester.enterText(
      find.byType(OrganizerTextField).first,
      'Circuito Goiano',
    );
    await tester.pump();

    expect(button(tester).enabled, isTrue);
    await tester.pumpWidget(const SizedBox());
  });
}
