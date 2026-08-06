import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/widgets/organizer_team_list_tile.dart';

/// Linha da dupla na lista da categoria: a pílula CANCELAMENTO é o único aviso
/// visual de que existe um pedido aberto — sem ela o organizador não abre o
/// sheet e o atleta fica preso na inscrição.
void main() {
  OrganizerCategoryTeamRow team({String? cancellationRequestReason}) {
    return OrganizerCategoryTeamRow(
      registrationId: 'reg-1',
      teamId: 'team-1',
      player1: const OrganizerCategoryPlayerInfo(
        uid: 'p1',
        name: 'Marcos Lima',
        city: 'Goiânia',
        state: 'GO',
      ),
      player2: const OrganizerCategoryPlayerInfo(
        uid: 'p2',
        name: 'Victor Sá',
      ),
      status: OrganizerTeamRegistrationStatus.confirmed,
      paidAmountCents: 10000,
      expectedAmountCents: 10000,
      lgpdAcceptedUids: const ['p1', 'p2'],
      cancellationRequestReason: cancellationRequestReason,
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
}
