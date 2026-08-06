import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/data/organizer_category_ops_service.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_providers.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/sheets/organizer_team_actions_sheet.dart';

/// Fake do serviço de callables: registra as chamadas e nunca toca em
/// FirebaseFunctions. `noSuchMethod` faz as demais operações estourarem se o
/// teste encostar nelas sem querer.
class _FakeCategoryOpsService implements OrganizerCategoryOpsService {
  final calls = <({String registrationId, bool approve, String note})>[];

  /// Segura a resposta da callable para observar o estado "em andamento".
  Completer<void>? gate;

  @override
  Future<void> respondCancellationRequest({
    required String registrationId,
    required bool approve,
    String note = '',
  }) async {
    calls.add((registrationId: registrationId, approve: approve, note: note));
    final pending = gate;
    if (pending != null) await pending.future;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      '${invocation.memberName} não deveria ser chamado neste teste',
    );
  }
}

void main() {
  late _FakeCategoryOpsService service;

  setUp(() => service = _FakeCategoryOpsService());

  OrganizerCategoryTeamRow team({String? cancellationRequestReason}) {
    return OrganizerCategoryTeamRow(
      registrationId: 'reg-1',
      teamId: 'team-1',
      player1: const OrganizerCategoryPlayerInfo(uid: 'p1', name: 'Marcos Lima'),
      player2: const OrganizerCategoryPlayerInfo(uid: 'p2', name: 'Victor Sá'),
      status: OrganizerTeamRegistrationStatus.confirmed,
      paidAmountCents: 10000,
      expectedAmountCents: 10000,
      cancellationRequestReason: cancellationRequestReason,
    );
  }

  Future<void> openSheet(
    WidgetTester tester,
    OrganizerCategoryTeamRow row,
  ) async {
    // Sheet alto (6 ações + card): tela padrão de 600px estouraria o layout.
    tester.view.physicalSize = const Size(800, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          organizerCategoryOpsServiceProvider.overrideWithValue(service),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: Builder(
              builder: (context) => Center(
                child: FilledButton(
                  onPressed: () => showOrganizerTeamActionsSheet(
                    context,
                    tournamentId: 't1',
                    categoryId: 'open',
                    team: row,
                    rank: 1,
                  ),
                  child: const Text('abrir'),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
  }

  Finder dialogButton(String label) => find.descendant(
        of: find.byType(AlertDialog),
        matching: find.text(label),
      );

  testWidgets('shows the request card with reason and no-refund warning',
      (tester) async {
    await openSheet(
      tester,
      team(cancellationRequestReason: 'Lesão no joelho, não consigo jogar'),
    );

    expect(find.text('Pedido de cancelamento'), findsOneWidget);
    expect(
      find.text('“Lesão no joelho, não consigo jogar”'),
      findsOneWidget,
    );
    expect(
      find.textContaining('A nexaGO não processa o reembolso'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Aprovar remove a inscrição e libera a vaga'),
      findsOneWidget,
    );
    expect(find.widgetWithText(FilledButton, 'Aprovar'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Recusar'), findsOneWidget);
  });

  testWidgets('hides the request card when there is no pending request',
      (tester) async {
    await openSheet(tester, team());

    expect(find.text('Pedido de cancelamento'), findsNothing);
    expect(find.widgetWithText(FilledButton, 'Aprovar'), findsNothing);
    expect(find.widgetWithText(OutlinedButton, 'Recusar'), findsNothing);
    // As demais ações da linha continuam disponíveis.
    expect(find.text('Definir cabeça de chave'), findsOneWidget);
    expect(find.text('Remover da categoria'), findsOneWidget);
  });

  testWidgets('empty reason renders the card without the quoted block',
      (tester) async {
    await openSheet(tester, team(cancellationRequestReason: '   '));

    expect(find.text('Pedido de cancelamento'), findsOneWidget);
    expect(find.textContaining('“'), findsNothing);
    expect(find.widgetWithText(FilledButton, 'Aprovar'), findsOneWidget);
  });

  testWidgets('approve asks for confirmation before calling the callable',
      (tester) async {
    await openSheet(tester, team(cancellationRequestReason: 'Lesão'));

    await tester.tap(find.widgetWithText(FilledButton, 'Aprovar'));
    await tester.pumpAndSettle();

    expect(find.text('Aprovar cancelamento?'), findsOneWidget);
    expect(
      find.textContaining('A nexaGO não processa o reembolso'),
      findsWidgets,
    );
    expect(service.calls, isEmpty);
  });

  testWidgets('backing out of the confirmation keeps the registration',
      (tester) async {
    await openSheet(tester, team(cancellationRequestReason: 'Lesão'));

    await tester.tap(find.widgetWithText(FilledButton, 'Aprovar'));
    await tester.pumpAndSettle();
    await tester.tap(dialogButton('Voltar'));
    await tester.pumpAndSettle();

    expect(service.calls, isEmpty);
    expect(find.text('Pedido de cancelamento'), findsOneWidget);
  });

  testWidgets('confirming approve calls the callable with approve true',
      (tester) async {
    await openSheet(tester, team(cancellationRequestReason: 'Lesão'));

    await tester.tap(find.widgetWithText(FilledButton, 'Aprovar'));
    await tester.pumpAndSettle();
    await tester.tap(dialogButton('Aprovar'));
    await tester.pumpAndSettle();

    expect(service.calls, hasLength(1));
    expect(service.calls.single.registrationId, 'reg-1');
    expect(service.calls.single.approve, isTrue);
    expect(find.text('Pedido de cancelamento'), findsNothing);
    expect(
      find.text('Cancelamento aprovado. Combine a devolução com o atleta.'),
      findsOneWidget,
    );
  });

  testWidgets('decline calls the callable without a confirmation dialog',
      (tester) async {
    await openSheet(tester, team(cancellationRequestReason: 'Lesão'));

    await tester.tap(find.widgetWithText(OutlinedButton, 'Recusar'));
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsNothing);
    expect(service.calls, hasLength(1));
    expect(service.calls.single.approve, isFalse);
    expect(
      find.text('Pedido recusado. A inscrição foi mantida.'),
      findsOneWidget,
    );
  });

  testWidgets('in-flight approve shows Aprovando… and blocks the buttons',
      (tester) async {
    service.gate = Completer<void>();
    await openSheet(tester, team(cancellationRequestReason: 'Lesão'));

    await tester.tap(find.widgetWithText(FilledButton, 'Aprovar'));
    await tester.pumpAndSettle();
    await tester.tap(dialogButton('Aprovar'));
    await tester.pump();

    expect(find.text('Aprovando…'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Aprovando…'))
          .onPressed,
      isNull,
    );
    expect(service.calls, hasLength(1));

    service.gate!.complete();
    await tester.pumpAndSettle();
  });

  testWidgets('in-flight decline disables both buttons (no double submit)',
      (tester) async {
    service.gate = Completer<void>();
    await openSheet(tester, team(cancellationRequestReason: 'Lesão'));

    await tester.tap(find.widgetWithText(OutlinedButton, 'Recusar'));
    await tester.pump();

    expect(find.text('Recusando…'), findsOneWidget);
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Aprovar'))
          .onPressed,
      isNull,
    );
    expect(
      tester
          .widget<OutlinedButton>(
            find.widgetWithText(OutlinedButton, 'Recusando…'),
          )
          .onPressed,
      isNull,
    );

    await tester.tap(
      find.widgetWithText(OutlinedButton, 'Recusando…'),
      warnIfMissed: false,
    );
    await tester.pump();
    expect(service.calls, hasLength(1));

    service.gate!.complete();
    await tester.pumpAndSettle();
  });
}
