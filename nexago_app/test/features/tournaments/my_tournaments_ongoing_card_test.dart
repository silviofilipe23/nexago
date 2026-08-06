// Cancelamento de inscrição pelo atleta (Meus torneios): o card em andamento
// só oferece "Cancelar inscrição" quando a página passa `onCancel` — a página
// decide isso via `MyTournamentEnrollment.canCancelRegistration` (nenhum
// pagamento na inscrição). Aqui validamos o contrato do widget: botão presente
// e disparando o callback quando `onCancel != null`, ausente quando nulo, e o
// tap no botão não vazando para o `onTap` do card.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/domain/my_tournaments_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/my_tournaments/my_tournaments_ongoing_card.dart';

void main() {
  MyTournamentEnrollment buildEnrollment() {
    return const MyTournamentEnrollment(
      registration: MyTournamentRegistration(
        registrationId: 'r1',
        tournamentId: 't1',
        tournamentName: 'Copa Teste de Beach Tennis',
        dateLabel: '12 out',
        statusLabel: 'Inscrito',
        isPaid: false,
        categoryId: '',
      ),
    );
  }

  Future<void> pumpCard(
    WidgetTester tester, {
    required VoidCallback onTap,
    VoidCallback? onCancel,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: SingleChildScrollView(
            child: MyTournamentsOngoingCard(
              enrollment: buildEnrollment(),
              onTap: onTap,
              onCancel: onCancel,
            ),
          ),
        ),
      ),
    );
  }

  final cancelButton = find.widgetWithText(TextButton, 'Cancelar inscrição');

  group('MyTournamentsOngoingCard — cancelar inscrição', () {
    testWidgets(
      'com onCancel não-nulo renderiza o botão e o tap chama o callback',
      (tester) async {
        var cancelCount = 0;
        await pumpCard(
          tester,
          onTap: () {},
          onCancel: () => cancelCount++,
        );

        expect(cancelButton, findsOneWidget);

        await tester.tap(cancelButton);
        await tester.pump();

        expect(cancelCount, 1);
      },
    );

    testWidgets(
      'tap no botão de cancelar não dispara o onTap do card',
      (tester) async {
        var tapCount = 0;
        await pumpCard(
          tester,
          onTap: () => tapCount++,
          onCancel: () {},
        );

        await tester.tap(cancelButton);
        await tester.pump();

        expect(tapCount, 0);
      },
    );

    testWidgets(
      'com onCancel nulo o botão não aparece e o card segue navegável',
      (tester) async {
        var tapCount = 0;
        await pumpCard(tester, onTap: () => tapCount++);

        expect(cancelButton, findsNothing);
        expect(find.text('Cancelar inscrição'), findsNothing);

        // O card em si continua respondendo ao tap de navegação.
        await tester.tap(find.byType(InkWell).first);
        await tester.pump();
        expect(tapCount, 1);
      },
    );
  });
}
