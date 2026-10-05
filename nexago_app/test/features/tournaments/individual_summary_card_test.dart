import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team_roster_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_payment_sections.dart';

/// Card do topo do pagamento na INDIVIDUAL (multiesporte fase 4d2): um atleta só, sem "dupla".
void main() {
  testWidgets(
    'individual mostra "INSCRIÇÃO CONFIRMADA", não "DUPLA CONFIRMADA"',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(
            body: TournamentRegistrationDuoSummaryCard(
              roster: [
                TournamentRosterMember(
                  uid: 'u1',
                  name: 'Duda Lima',
                  isCaptain: true,
                  isMe: true,
                ),
              ],
              eventSubtitle: 'Simples · 20 Ago',
              isIndividual: true,
            ),
          ),
        ),
      );
      expect(find.text('DUPLA CONFIRMADA'), findsNothing);
      expect(find.text('INSCRIÇÃO CONFIRMADA'), findsOneWidget);
    },
  );
}
