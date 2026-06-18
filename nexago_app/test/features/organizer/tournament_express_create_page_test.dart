import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/tournament_express_create_page.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/widgets/organizer_form_widgets.dart';

void main() {
  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const TournamentExpressCreatePage(),
        ),
      ),
    );
    await tester.pump();
  }

  OrganizerWizardContinueButton publishButton(WidgetTester tester) {
    return tester.widget<OrganizerWizardContinueButton>(
      find.byType(OrganizerWizardContinueButton),
    );
  }

  testWidgets('renders express form', (tester) async {
    await pump(tester);
    expect(find.text('Publique em 1 minuto'), findsOneWidget);
    expect(find.text('NOME DO TORNEIO'), findsOneWidget);
    expect(find.text('PRIMEIRA CATEGORIA'), findsOneWidget);
  });

  testWidgets('publish stays disabled until name, venue, city and date are set',
      (tester) async {
    await pump(tester);
    expect(publishButton(tester).enabled, isFalse);

    // Preenche os textos, mas ainda falta a data → continua desabilitado.
    final fields = find.byType(OrganizerTextField);
    await tester.enterText(fields.at(0), 'Open Goiânia'); // nome
    await tester.enterText(fields.at(1), 'Arena Beach'); // local
    await tester.enterText(fields.at(2), 'Goiânia'); // cidade
    await tester.pump();

    expect(publishButton(tester).enabled, isFalse); // sem data ainda
  });
}
