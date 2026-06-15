import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_models.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/organizer_court_panel_page.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  testWidgets('OrganizerCourtPanelPage shows title', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const OrganizerCourtPanelPage(tournamentId: 't1'),
        ),
      ),
    );
    expect(find.text('Painel de quadras'), findsOneWidget);
  });
}
