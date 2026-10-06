import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_session.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/steps/tournament_create_identity_page.dart';

void main() {
  testWidgets('esporte desconhecido aparece travado, sem dropdown', (
    tester,
  ) async {
    // Descartado no fim do corpo do teste: o notifier agenda um timer de
    // persistência em `restoreSession`, e o `onDispose` é quem o cancela.
    final container = ProviderContainer();
    container.read(tournamentCreateWizardProvider.notifier).restoreSession(
          TournamentCreateSession(
            managerUid: 'mgr-1',
            currentStep: TournamentCreateStep.identity,
            updatedAt: DateTime(2026, 1, 10),
            draft: const TournamentCreateDraft(
              name: 'Copa BT',
              sportRaw: 'football',
            ),
          ),
        );

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const TournamentCreateIdentityPage(),
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(DropdownButtonFormField<TournamentSport>), findsNothing);
    expect(find.text('Futebol'), findsOneWidget);
    expect(
      find.textContaining('não pode ser alterado nesta versão'),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox());
    container.dispose();
  });
}
