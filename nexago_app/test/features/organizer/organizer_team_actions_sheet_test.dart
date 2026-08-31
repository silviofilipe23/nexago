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

  /// Confirmações de pagamento. `athleteUid` nulo/vazio = inscrição inteira
  /// (a callable recusa esse caminho quando há pagamento parcial).
  final confirmCalls = <({String registrationId, String? athleteUid})>[];
  final revertCalls = <({String registrationId, String? athleteUid})>[];

  /// Segura a resposta da callable para observar o estado "em andamento".
  Completer<void>? gate;

  /// Recusa do servidor já traduzida (`OrganizerCategoryOpsException`) — é o
  /// que a folha recebe quando a CF devolve `failed-precondition`.
  Object? confirmError;
  Object? revertError;

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
  Future<void> confirmRegistrationPayment({
    required String registrationId,
    String? athleteUid,
  }) async {
    confirmCalls.add((registrationId: registrationId, athleteUid: athleteUid));
    final pending = gate;
    if (pending != null) await pending.future;
    final error = confirmError;
    if (error != null) throw error;
  }

  @override
  Future<void> revertRegistrationPayment({
    required String registrationId,
    String? athleteUid,
  }) async {
    revertCalls.add((registrationId: registrationId, athleteUid: athleteUid));
    final pending = gate;
    if (pending != null) await pending.future;
    final error = revertError;
    if (error != null) throw error;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    throw UnimplementedError(
      '${invocation.memberName} não deveria ser chamado neste teste',
    );
  }
}

void main() {
  const categoryKey = OrganizerCategoryKey(
    tournamentId: 't1',
    categoryId: 'open',
  );

  late _FakeCategoryOpsService service;

  setUp(() => service = _FakeCategoryOpsService());

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
      player1: const OrganizerCategoryPlayerInfo(uid: 'p1', name: 'Marcos Lima'),
      player2: OrganizerCategoryPlayerInfo(uid: player2Uid, name: 'Victor Sá'),
      status: status,
      paidAmountCents: 10000,
      expectedAmountCents: 10000,
      cancellationRequestReason: cancellationRequestReason,
      sharePaidUids: sharePaidUids,
      organizerConfirmedShareUids: organizerConfirmedShareUids,
      declaredPaidAt: declaredPaidAt,
      paymentVerifiedByOrganizer: paymentVerifiedByOrganizer,
    );
  }

  /// [liveRows] é o que o provider da categoria emite — a folha lê dele a linha
  /// VIVA da inscrição (o `team` passado no construtor é só o retrato de
  /// abertura). Sem o override, a folha tentaria montar os repositórios reais
  /// do Firebase.
  Future<void> openSheet(
    WidgetTester tester,
    OrganizerCategoryTeamRow row, {
    Stream<List<OrganizerCategoryTeamRow>>? liveRows,
  }) async {
    // Sheet alto (ações + seção por atleta): tela padrão de 600px estouraria.
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          organizerCategoryOpsServiceProvider.overrideWithValue(service),
          organizerCategoryRegistrationsProvider(categoryKey).overrideWith(
            (ref) => liveRows ?? Stream.value([row]),
          ),
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

  /// Linha de ação da folha (`_ActionRow`) identificada pelo subtítulo — o
  /// título colide com o rótulo dos botões por atleta.
  Finder actionRowBySubtitle(String subtitle) => find.ancestor(
        of: find.textContaining(subtitle),
        matching: find.byType(InkWell),
      );

  group('pedido de cancelamento', () {
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
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Aprovando…'),
            )
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
  });

  group('pagamento por atleta', () {
    testWidgets(
      'dupla pendente lista os dois atletas, cada um com o próprio estado',
      (tester) async {
        await openSheet(
          tester,
          team(
            status: OrganizerTeamRegistrationStatus.pending,
            sharePaidUids: const ['p1'],
          ),
        );

        expect(find.text('PAGAMENTO POR ATLETA'), findsOneWidget);
        expect(
          find.textContaining(
            'A inscrição só é dada como paga quando todos estiverem',
          ),
          findsOneWidget,
        );
        // p1 declarou (está em sharePaidUids, sem baixa do organizador).
        expect(
          find.text('Declarado pelo atleta · aguardando conferência'),
          findsOneWidget,
        );
        expect(
          find.widgetWithText(FilledButton, 'Confirmar recebimento'),
          findsOneWidget,
        );
        // p2 não pagou nada.
        expect(find.text('Pagamento pendente'), findsOneWidget);
        expect(
          find.widgetWithText(FilledButton, 'Confirmar pagamento'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'confirmar um atleta manda o athleteUid DELE e NÃO fecha a folha',
      (tester) async {
        await openSheet(
          tester,
          team(status: OrganizerTeamRegistrationStatus.pending),
        );

        // Sem nenhuma parcela paga, os dois botões são "Confirmar pagamento";
        // o segundo é o do player2 (a seção segue a ordem dos participantes).
        final buttons =
            find.widgetWithText(FilledButton, 'Confirmar pagamento');
        expect(buttons, findsNWidgets(2));
        await tester.tap(buttons.at(1));
        await tester.pumpAndSettle();

        expect(service.confirmCalls, hasLength(1));
        expect(service.confirmCalls.single.registrationId, 'reg-1');
        expect(service.confirmCalls.single.athleteUid, 'p2');
        // A folha continua aberta: confirmar o outro atleta é o passo seguinte.
        expect(find.text('PAGAMENTO POR ATLETA'), findsOneWidget);
        expect(find.text('Remover da categoria'), findsOneWidget);
        expect(
          find.text('Pagamento de Victor Sá confirmado.'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'confirmação em andamento trava os DOIS botões (dinheiro não pode ser '
      'confirmado duas vezes por um toque repetido)',
      (tester) async {
        service.gate = Completer<void>();
        await openSheet(
          tester,
          team(status: OrganizerTeamRegistrationStatus.pending),
        );

        await tester.tap(
          find.widgetWithText(FilledButton, 'Confirmar pagamento').first,
        );
        await tester.pump();

        expect(find.text('Confirmando…'), findsOneWidget);
        expect(
          tester
              .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Confirmando…'),
              )
              .onPressed,
          isNull,
        );
        // O botão do OUTRO atleta também fica travado enquanto a chamada corre.
        expect(
          tester
              .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Confirmar pagamento'),
              )
              .onPressed,
          isNull,
        );

        await tester.tap(
          find.widgetWithText(FilledButton, 'Confirmando…'),
          warnIfMissed: false,
        );
        await tester.pump();
        expect(service.confirmCalls, hasLength(1));

        service.gate!.complete();
        await tester.pumpAndSettle();
      },
    );

    testWidgets(
      'confirmação do atleta 1 aparece AO VIVO na folha aberta (linha viva do '
      'provider, não o retrato de abertura)',
      (tester) async {
        final controller =
            StreamController<List<OrganizerCategoryTeamRow>>.broadcast();
        addTearDown(controller.close);
        final pending = team(status: OrganizerTeamRegistrationStatus.pending);

        await openSheet(tester, pending, liveRows: controller.stream);
        controller.add([pending]);
        await tester.pump();
        await tester.pump();

        expect(find.text('Pagamento pendente'), findsNWidgets(2));

        await tester.tap(
          find.widgetWithText(FilledButton, 'Confirmar pagamento').first,
        );
        await tester.pumpAndSettle();
        expect(service.confirmCalls.single.athleteUid, 'p1');

        // O "Firestore" responde: p1 confirmado pelo organizador.
        controller.add([
          team(
            status: OrganizerTeamRegistrationStatus.pending,
            sharePaidUids: const ['p1'],
            organizerConfirmedShareUids: const ['p1'],
          ),
        ]);
        await tester.pump();
        await tester.pump();

        expect(find.text('Confirmado por você'), findsOneWidget);
        expect(
          find.widgetWithText(OutlinedButton, 'Desfazer'),
          findsOneWidget,
        );
        expect(find.text('Pagamento pendente'), findsOneWidget);
        // Virou pagamento parcial: a ação em bloco sai de cena.
        expect(find.text('Pagamento parcial'), findsOneWidget);
      },
    );

    testWidgets(
      'pagamento parcial troca a ação em bloco pelo aviso (a callable recusa '
      'confirmar a inscrição inteira nesse estado)',
      (tester) async {
        await openSheet(
          tester,
          team(
            status: OrganizerTeamRegistrationStatus.pending,
            sharePaidUids: const ['p1'],
            organizerConfirmedShareUids: const ['p1'],
          ),
        );

        expect(find.text('Pagamento parcial'), findsOneWidget);
        expect(
          find.textContaining('Confirme cada atleta acima'),
          findsOneWidget,
        );
        // O subtítulo da ação em bloco é o que identifica a linha.
        expect(find.textContaining('Marcar como pago'), findsNothing);
        expect(service.confirmCalls, isEmpty);
      },
    );

    testWidgets(
      'sem nenhuma parcela paga, a ação em bloco continua e chama a callable '
      'SEM athleteUid (e aí sim fecha a folha)',
      (tester) async {
        await openSheet(
          tester,
          team(status: OrganizerTeamRegistrationStatus.pending),
        );

        expect(find.text('Pagamento parcial'), findsNothing);
        final bulk = actionRowBySubtitle('Marcar como pago');
        expect(bulk, findsOneWidget);

        await tester.ensureVisible(bulk);
        await tester.tap(bulk);
        await tester.pumpAndSettle();

        expect(service.confirmCalls, hasLength(1));
        expect(service.confirmCalls.single.registrationId, 'reg-1');
        expect(service.confirmCalls.single.athleteUid, isNull);
        expect(find.text('PAGAMENTO POR ATLETA'), findsNothing);
        expect(find.text('Pagamento confirmado.'), findsOneWidget);
      },
    );

    testWidgets(
      'Desfazer exige o diálogo de confirmação antes de chamar a callable',
      (tester) async {
        await openSheet(
          tester,
          team(
            status: OrganizerTeamRegistrationStatus.pending,
            sharePaidUids: const ['p1'],
            organizerConfirmedShareUids: const ['p1'],
          ),
        );

        await tester.tap(find.widgetWithText(OutlinedButton, 'Desfazer'));
        await tester.pumpAndSettle();

        expect(find.text('Desfazer confirmação?'), findsOneWidget);
        expect(
          find.textContaining('O restante da dupla não é afetado'),
          findsOneWidget,
        );
        expect(service.revertCalls, isEmpty);

        await tester.tap(dialogButton('Voltar'));
        await tester.pumpAndSettle();
        expect(service.revertCalls, isEmpty);
        expect(find.text('Confirmado por você'), findsOneWidget);
      },
    );

    testWidgets(
      'confirmando o diálogo, Desfazer manda o athleteUid e mantém a folha',
      (tester) async {
        await openSheet(
          tester,
          team(
            status: OrganizerTeamRegistrationStatus.pending,
            sharePaidUids: const ['p1'],
            organizerConfirmedShareUids: const ['p1'],
          ),
        );

        await tester.tap(find.widgetWithText(OutlinedButton, 'Desfazer'));
        await tester.pumpAndSettle();
        await tester.tap(dialogButton('Desfazer'));
        await tester.pumpAndSettle();

        expect(service.revertCalls, hasLength(1));
        expect(service.revertCalls.single.registrationId, 'reg-1');
        expect(service.revertCalls.single.athleteUid, 'p1');
        expect(service.confirmCalls, isEmpty);
        expect(find.text('PAGAMENTO POR ATLETA'), findsOneWidget);
        expect(
          find.text('Confirmação de Marcos Lima desfeita.'),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'reversão em andamento mostra Desfazendo… e trava o botão',
      (tester) async {
        service.gate = Completer<void>();
        await openSheet(
          tester,
          team(
            status: OrganizerTeamRegistrationStatus.pending,
            sharePaidUids: const ['p1'],
            organizerConfirmedShareUids: const ['p1'],
          ),
        );

        await tester.tap(find.widgetWithText(OutlinedButton, 'Desfazer'));
        await tester.pumpAndSettle();
        await tester.tap(dialogButton('Desfazer'));
        await tester.pump();

        expect(find.text('Desfazendo…'), findsOneWidget);
        expect(
          tester
              .widget<OutlinedButton>(
                find.widgetWithText(OutlinedButton, 'Desfazendo…'),
              )
              .onPressed,
          isNull,
        );
        expect(service.revertCalls, hasLength(1));

        service.gate!.complete();
        await tester.pumpAndSettle();
      },
    );

    testWidgets(
      'inscrição paga e conferida não mostra a divisão por atleta nem oferece '
      'confirmar de novo',
      (tester) async {
        await openSheet(tester, team());

        expect(find.text('PAGAMENTO POR ATLETA'), findsNothing);
        expect(find.text('Pagamento parcial'), findsNothing);
        expect(find.text('Confirmar pagamento'), findsNothing);
        expect(find.text('Confirmar recebimento'), findsNothing);
        expect(find.text('Pagamento confirmado'), findsOneWidget);
        expect(find.text('Pago'), findsOneWidget);

        final row = find.ancestor(
          of: find.text('Pagamento confirmado'),
          matching: find.byType(InkWell),
        );
        expect(tester.widget<InkWell>(row).onTap, isNull);
      },
    );

    testWidgets(
      'declaração dos atletas sem baixa mostra "A conferir" e pede '
      '"Confirmar recebimento" da inscrição inteira',
      (tester) async {
        await openSheet(
          tester,
          team(
            sharePaidUids: const ['p1', 'p2'],
            declaredPaidAt: DateTime(2026, 8, 20),
          ),
        );

        expect(find.text('A conferir'), findsOneWidget);
        expect(find.text('Pago'), findsNothing);
        expect(find.text('Confirmar recebimento'), findsOneWidget);
        expect(
          find.textContaining('Os atletas declararam ter pago'),
          findsOneWidget,
        );
        // Elenco completo declarado: não há o que dividir por atleta.
        expect(find.text('PAGAMENTO POR ATLETA'), findsNothing);

        final bulk = actionRowBySubtitle('Os atletas declararam ter pago');
        await tester.ensureVisible(bulk);
        await tester.tap(bulk);
        await tester.pumpAndSettle();

        expect(service.confirmCalls, hasLength(1));
        expect(service.confirmCalls.single.athleteUid, isNull);
      },
    );

    testWidgets(
      'recusa da callable chega LEGÍVEL ao organizador e a folha não fecha '
      '(a mensagem é a do servidor, não [firebase_functions/…] cru)',
      (tester) async {
        const serverMessage = 'Esta inscrição já tem pagamento parcial — '
            'confirme cada atleta individualmente.';
        service.confirmError = OrganizerCategoryOpsException(serverMessage);
        await openSheet(
          tester,
          team(status: OrganizerTeamRegistrationStatus.pending),
        );

        final bulk = actionRowBySubtitle('Marcar como pago');
        await tester.ensureVisible(bulk);
        await tester.tap(bulk);
        await tester.pumpAndSettle();

        expect(service.confirmCalls, hasLength(1));
        expect(find.text(serverMessage), findsOneWidget);
        // Erro não fecha a folha: o organizador continua na tela para agir.
        expect(find.text('Remover da categoria'), findsOneWidget);
        expect(find.text('PAGAMENTO POR ATLETA'), findsOneWidget);
      },
    );

    testWidgets(
      'erro na confirmação por atleta destrava os botões (não fica preso em '
      'Confirmando…)',
      (tester) async {
        service.confirmError =
            OrganizerCategoryOpsException('Atleta não faz parte desta inscrição');
        await openSheet(
          tester,
          team(status: OrganizerTeamRegistrationStatus.pending),
        );

        await tester.tap(
          find.widgetWithText(FilledButton, 'Confirmar pagamento').first,
        );
        await tester.pumpAndSettle();

        expect(
          find.text('Atleta não faz parte desta inscrição'),
          findsOneWidget,
        );
        expect(find.text('Confirmando…'), findsNothing);
        final buttons =
            find.widgetWithText(FilledButton, 'Confirmar pagamento');
        expect(buttons, findsNWidgets(2));
        for (var i = 0; i < 2; i++) {
          expect(
            tester.widget<FilledButton>(buttons.at(i)).onPressed,
            isNotNull,
            reason: 'depois do erro o organizador precisa poder tentar de novo',
          );
        }
      },
    );

    testWidgets(
      'erro ao desfazer também chega legível e mantém a folha',
      (tester) async {
        service.revertError = OrganizerCategoryOpsException(
          'A inscrição já está totalmente paga — reverta a inscrição inteira.',
        );
        await openSheet(
          tester,
          team(
            status: OrganizerTeamRegistrationStatus.pending,
            sharePaidUids: const ['p1'],
            organizerConfirmedShareUids: const ['p1'],
          ),
        );

        await tester.tap(find.widgetWithText(OutlinedButton, 'Desfazer'));
        await tester.pumpAndSettle();
        await tester.tap(dialogButton('Desfazer'));
        await tester.pumpAndSettle();

        expect(service.revertCalls, hasLength(1));
        expect(
          find.text(
            'A inscrição já está totalmente paga — reverta a inscrição inteira.',
          ),
          findsOneWidget,
        );
        expect(find.text('Desfazendo…'), findsNothing);
        expect(find.text('PAGAMENTO POR ATLETA'), findsOneWidget);
      },
    );

    testWidgets(
      'solo aguardando parceiro não ganha divisão por atleta',
      (tester) async {
        await openSheet(
          tester,
          team(
            status: OrganizerTeamRegistrationStatus.pending,
            player2Uid: '',
            sharePaidUids: const ['p1'],
          ),
        );

        expect(find.text('PAGAMENTO POR ATLETA'), findsNothing);
        expect(find.text('Pagamento parcial'), findsNothing);
        expect(actionRowBySubtitle('Marcar como pago'), findsOneWidget);
      },
    );
  });
}
