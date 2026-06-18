import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/presentation/league_create/steps/league_create_season_page.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/widgets/organizer_form_widgets.dart';

void main() {
  testWidgets('renders season step and keeps continue disabled when empty',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const LeagueCreateSeasonPage(),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Temporada'), findsOneWidget);

    final button = tester.widget<OrganizerWizardContinueButton>(
      find.byType(OrganizerWizardContinueButton),
    );
    expect(button.enabled, isFalse); // sem datas de temporada ainda

    await tester.pumpWidget(const SizedBox());
  });
}
