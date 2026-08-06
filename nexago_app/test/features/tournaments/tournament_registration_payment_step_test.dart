// Cancelamento no passo de pagamento da inscrição. A página monta o bloco em
// `cancellationSection` (TournamentRegistrationCancellationSection): sem
// pagamento é "Cancelar reserva"; com pagamento vira "Solicitar cancelamento";
// com pedido aberto vira o card de acompanhamento. Estes testes protegem os
// dois contratos — o do passo (seção tem prioridade sobre o callback legado) e
// o da própria seção.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_cancellation_section.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/tournament_registration_payment_step.dart';

TournamentRegistrationSnapshot snapshot({
  bool isPaid = false,
  List<String> sharePaidUids = const [],
  RegistrationCancellationRequest? request,
}) {
  return TournamentRegistrationSnapshot(
    registrationId: 'reg-1',
    isPaid: isPaid,
    paidAmount: isPaid ? 160 : 0,
    sharePaidUids: sharePaidUids,
    cancellationRequest: request,
  );
}

void main() {
  const category = TournamentCategoryOffer(
    id: 'cat-1',
    name: 'Masculina C',
    entryFee: 160,
  );

  Future<void> pumpStep(
    WidgetTester tester, {
    VoidCallback? onCancelRegistration,
    Widget? cancellationSection,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: SingleChildScrollView(
            child: TournamentRegistrationPaymentStep(
              category: category,
              quote: buildRegistrationQuote(entryFee: category.entryFee),
              paymentType: 'share',
              onPaymentTypeChanged: (_) {},
              onCancelRegistration: onCancelRegistration,
              cancellationSection: cancellationSection,
            ),
          ),
        ),
      ),
    );
  }

  Future<void> pumpSection(
    WidgetTester tester, {
    required TournamentRegistrationSnapshot? snap,
    VoidCallback? onCancelDirectly,
    VoidCallback? onRequestCancellation,
    VoidCallback? onContactOrganizer,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: SingleChildScrollView(
            child: TournamentRegistrationCancellationSection(
              snapshot: snap,
              onCancelDirectly: onCancelDirectly,
              onRequestCancellation: onRequestCancellation,
              onContactOrganizer: onContactOrganizer,
            ),
          ),
        ),
      ),
    );
  }

  final cancelButton = find.widgetWithText(TextButton, 'Cancelar reserva');
  final requestButton =
      find.widgetWithText(TextButton, 'Solicitar cancelamento');

  group('TournamentRegistrationPaymentStep — bloco de cancelamento', () {
    testWidgets('renderiza a seção recebida', (tester) async {
      await pumpStep(
        tester,
        cancellationSection: const Text('bloco-de-cancelamento'),
      );

      expect(find.text('bloco-de-cancelamento'), findsOneWidget);
    });

    testWidgets('seção tem prioridade sobre o callback legado', (tester) async {
      await pumpStep(
        tester,
        onCancelRegistration: () {},
        cancellationSection: const Text('bloco-de-cancelamento'),
      );

      expect(find.text('bloco-de-cancelamento'), findsOneWidget);
      expect(cancelButton, findsNothing);
    });

    testWidgets(
      'sem seção, o callback legado ainda mostra o botão e chama de volta',
      (tester) async {
        var count = 0;
        await pumpStep(tester, onCancelRegistration: () => count++);

        expect(cancelButton, findsOneWidget);
        await tester.tap(cancelButton);
        await tester.pump();
        expect(count, 1);
      },
    );

    testWidgets('sem seção e sem callback não renderiza nada', (tester) async {
      await pumpStep(tester);

      expect(cancelButton, findsNothing);
      expect(requestButton, findsNothing);
    });
  });

  group('TournamentRegistrationCancellationSection', () {
    testWidgets('sem pagamento oferece cancelar direto', (tester) async {
      var count = 0;
      await pumpSection(
        tester,
        snap: snapshot(),
        onCancelDirectly: () => count++,
        onRequestCancellation: () {},
      );

      expect(cancelButton, findsOneWidget);
      expect(requestButton, findsNothing);

      await tester.tap(cancelButton);
      await tester.pump();
      expect(count, 1);
    });

    testWidgets(
      'inscrição paga (sem cancelar direto) oferece pedir ao organizador',
      (tester) async {
        var count = 0;
        await pumpSection(
          tester,
          snap: snapshot(isPaid: true),
          onRequestCancellation: () => count++,
        );

        expect(requestButton, findsOneWidget);
        expect(cancelButton, findsNothing);

        await tester.tap(requestButton);
        await tester.pump();
        expect(count, 1);
      },
    );

    testWidgets(
      'pedido pendente mostra o acompanhamento e o aviso do reembolso por fora',
      (tester) async {
        await pumpSection(
          tester,
          snap: snapshot(
            isPaid: true,
            request: const RegistrationCancellationRequest(
              status: RegistrationCancellationStatus.pending,
              reason: 'Lesionei o joelho',
              responseNote: '',
            ),
          ),
          onRequestCancellation: () {},
          onContactOrganizer: () {},
        );

        expect(find.text('Cancelamento solicitado'), findsOneWidget);
        expect(find.text(TournamentCancellationCopy.pendingNotice), findsOneWidget);
        expect(find.text('Falar com o organizador'), findsOneWidget);
        // Com pedido aberto o atleta não pede de novo.
        expect(requestButton, findsNothing);
      },
    );

    testWidgets('pedido recusado mostra a resposta e libera pedir de novo',
        (tester) async {
      await pumpSection(
        tester,
        snap: snapshot(
          isPaid: true,
          request: const RegistrationCancellationRequest(
            status: RegistrationCancellationStatus.declined,
            reason: 'Lesionei o joelho',
            responseNote: 'Chave já sorteada',
          ),
        ),
        onRequestCancellation: () {},
      );

      expect(find.text('Pedido de cancelamento recusado'), findsOneWidget);
      expect(find.text('“Chave já sorteada”'), findsOneWidget);
      expect(requestButton, findsOneWidget);
    });

    testWidgets('sem snapshot não renderiza nada', (tester) async {
      await pumpSection(tester, snap: null, onRequestCancellation: () {});

      expect(cancelButton, findsNothing);
      expect(requestButton, findsNothing);
    });
  });
}
