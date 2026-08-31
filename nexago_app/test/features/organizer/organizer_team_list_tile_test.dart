import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/organizer_team_list_tile.dart';

/// Linha da dupla na lista da categoria: a pílula CANCELAMENTO é o único aviso
/// visual de que existe um pedido aberto — sem ela o organizador não abre o
/// sheet e o atleta fica preso na inscrição. Os selos de pagamento seguem a
/// mesma lógica: "A conferir" e "1/2 PAGO" são o que revela, sem abrir dupla
/// por dupla, quem ainda precisa de ação do organizador.
void main() {
  OrganizerCategoryTeamRow team({
    String? cancellationRequestReason,
    OrganizerTeamRegistrationStatus status =
        OrganizerTeamRegistrationStatus.confirmed,
    String player2Uid = 'p2',
    List<String> sharePaidUids = const [],
    List<String> organizerConfirmedShareUids = const [],
    DateTime? declaredPaidAt,
    bool paymentVerifiedByOrganizer = false,
  }) {
    return OrganizerCategoryTeamRow(
      registrationId: 'reg-1',
      teamId: 'team-1',
      player1: const OrganizerCategoryPlayerInfo(
        uid: 'p1',
        name: 'Marcos Lima',
        city: 'Goiânia',
        state: 'GO',
      ),
      player2: OrganizerCategoryPlayerInfo(
        uid: player2Uid,
        name: 'Victor Sá',
      ),
      status: status,
      paidAmountCents: 10000,
      expectedAmountCents: 10000,
      lgpdAcceptedUids: const ['p1', 'p2'],
      cancellationRequestReason: cancellationRequestReason,
      sharePaidUids: sharePaidUids,
      organizerConfirmedShareUids: organizerConfirmedShareUids,
      declaredPaidAt: declaredPaidAt,
      paymentVerifiedByOrganizer: paymentVerifiedByOrganizer,
    );
  }

  Future<void> pumpTile(
    WidgetTester tester,
    OrganizerCategoryTeamRow row, {
    VoidCallback? onTap,
  }) {
    return tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: OrganizerTeamListTile(
            team: row,
            rank: 1,
            onTap: onTap ?? () {},
          ),
        ),
      ),
    );
  }

  testWidgets('shows CANCELAMENTO pill when there is a pending request',
      (tester) async {
    await pumpTile(tester, team(cancellationRequestReason: 'Lesão no joelho'));

    expect(find.text('CANCELAMENTO'), findsOneWidget);
    expect(find.byIcon(Icons.event_busy_rounded), findsOneWidget);
  });

  testWidgets('hides CANCELAMENTO pill when there is no request',
      (tester) async {
    await pumpTile(tester, team());

    expect(find.text('CANCELAMENTO'), findsNothing);
    expect(find.byIcon(Icons.event_busy_rounded), findsNothing);
  });

  testWidgets('empty reason still flags the request (garbage reason in doc)',
      (tester) async {
    await pumpTile(tester, team(cancellationRequestReason: ''));

    expect(find.text('CANCELAMENTO'), findsOneWidget);
  });

  testWidgets('cancellation pill does not replace status and LGPD pills',
      (tester) async {
    await pumpTile(tester, team(cancellationRequestReason: 'Vou viajar'));

    expect(find.text('CANCELAMENTO'), findsOneWidget);
    expect(find.text('Pago'), findsOneWidget);
    expect(find.text('LGPD'), findsOneWidget);
    expect(find.text('Marcos Lima / Victor Sá'), findsOneWidget);
  });

  testWidgets('tile stays tappable with a pending request', (tester) async {
    var taps = 0;
    await pumpTile(
      tester,
      team(cancellationRequestReason: 'Lesão'),
      onTap: () => taps++,
    );

    await tester.tap(find.byType(OrganizerTeamListTile));
    await tester.pump();

    expect(taps, 1);
  });

  group('selos de pagamento', () {
    testWidgets('inscrição paga e conferida continua Pago, sem selo parcial',
        (tester) async {
      await pumpTile(tester, team(sharePaidUids: const ['p1', 'p2']));

      expect(find.text('Pago'), findsOneWidget);
      expect(find.text('A conferir'), findsNothing);
      expect(find.textContaining('PAGO'), findsNothing);
    });

    testWidgets(
      'inscrição direta antiga (paga, sem declaredPaidAt) NÃO vira A conferir '
      'retroativamente',
      (tester) async {
        await pumpTile(tester, team());

        expect(find.text('Pago'), findsOneWidget);
        expect(find.text('A conferir'), findsNothing);
      },
    );

    testWidgets('declaração sem baixa do organizador vira A conferir',
        (tester) async {
      await pumpTile(
        tester,
        team(
          sharePaidUids: const ['p1', 'p2'],
          declaredPaidAt: DateTime(2026, 8, 20),
        ),
      );

      expect(find.text('A conferir'), findsOneWidget);
      expect(find.text('Pago'), findsNothing);
      expect(find.byIcon(Icons.fact_check_outlined), findsOneWidget);
    });

    testWidgets('declaração já conferida volta a ser Pago', (tester) async {
      await pumpTile(
        tester,
        team(
          sharePaidUids: const ['p1', 'p2'],
          declaredPaidAt: DateTime(2026, 8, 20),
          paymentVerifiedByOrganizer: true,
        ),
      );

      expect(find.text('Pago'), findsOneWidget);
      expect(find.text('A conferir'), findsNothing);
    });

    testWidgets(
      'dupla com metade paga mostra 1/2 PAGO SEM substituir status, LGPD e '
      'cancelamento',
      (tester) async {
        await pumpTile(
          tester,
          team(
            status: OrganizerTeamRegistrationStatus.pending,
            sharePaidUids: const ['p1'],
            organizerConfirmedShareUids: const ['p1'],
            cancellationRequestReason: 'Lesão',
          ),
        );

        expect(find.text('1/2 PAGO'), findsOneWidget);
        expect(find.byIcon(Icons.pie_chart_outline_rounded), findsOneWidget);
        // Status (pendente), LGPD e cancelamento continuam na coluna.
        expect(find.byIcon(Icons.schedule_rounded), findsOneWidget);
        expect(find.text('LGPD'), findsOneWidget);
        expect(find.text('CANCELAMENTO'), findsOneWidget);
        expect(find.text('Marcos Lima / Victor Sá'), findsOneWidget);
      },
    );

    testWidgets('dupla na fila com metade paga também mostra o selo',
        (tester) async {
      await pumpTile(
        tester,
        team(
          status: OrganizerTeamRegistrationStatus.waitlist,
          sharePaidUids: const ['p2'],
        ),
      );

      expect(find.text('1/2 PAGO'), findsOneWidget);
      expect(find.text('Fila'), findsOneWidget);
    });

    testWidgets('dupla sem nenhuma parcela paga não mostra o selo',
        (tester) async {
      await pumpTile(
        tester,
        team(status: OrganizerTeamRegistrationStatus.pending),
      );

      expect(find.textContaining('PAGO'), findsNothing);
      expect(find.byIcon(Icons.pie_chart_outline_rounded), findsNothing);
    });

    testWidgets(
      'solo com a própria parte paga não mostra o selo (elenco de um nunca '
      'é parcial — mesma regra da CF)',
      (tester) async {
        await pumpTile(
          tester,
          team(
            status: OrganizerTeamRegistrationStatus.pending,
            player2Uid: '',
            sharePaidUids: const ['p1'],
          ),
        );

        expect(find.textContaining('PAGO'), findsNothing);
      },
    );

    testWidgets('elenco inteiro pago (sem fechar a inscrição) não é parcial',
        (tester) async {
      await pumpTile(
        tester,
        team(
          status: OrganizerTeamRegistrationStatus.pending,
          sharePaidUids: const ['p1', 'p2'],
        ),
      );

      expect(find.textContaining('PAGO'), findsNothing);
    });
  });
}
