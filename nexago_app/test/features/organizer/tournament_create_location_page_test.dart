import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/steps/tournament_create_location_page.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/widgets/organizer_form_widgets.dart';

void main() {
  testWidgets('renders location step and keeps continue disabled when empty',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const TournamentCreateLocationPage(),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Local e datas'), findsOneWidget);

    final button = tester.widget<OrganizerWizardContinueButton>(
      find.byType(OrganizerWizardContinueButton),
    );
    expect(button.enabled, isFalse); // sem local/datas ainda

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('offers manual venue/city fields (no arena required)',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const TournamentCreateLocationPage(),
        ),
      ),
    );
    await tester.pump();

    // O fix crítico: organizador sem arena cadastrada digita o local à mão.
    expect(find.text('NOME DO LOCAL'), findsOneWidget);
    // Cidade/UF agora usam o seletor IBGE (BrStateCityFields).
    expect(find.text('ESTADO E CIDADE'), findsOneWidget);

    await tester.enterText(find.byType(OrganizerTextField).first, 'Praia Clube');
    await tester.pump();

    expect(find.text('Praia Clube'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });
}

