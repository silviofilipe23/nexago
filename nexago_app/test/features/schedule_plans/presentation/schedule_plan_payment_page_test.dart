import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/payment_card/application/payment_card_providers.dart';
import 'package:nexago_app/features/payment_card/domain/saved_payment_card.dart';
import 'package:nexago_app/features/schedule_plans/application/schedule_plans_providers.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
import 'package:nexago_app/features/schedule_plans/infrastructure/schedule_plans_repository.dart';
import 'package:nexago_app/features/schedule_plans/presentation/schedule_plan_payment_page.dart';
import 'package:nexago_app/features/tournaments/domain/registration_payment_method.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_service_fee.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/registration_payment_method_picker.dart';

// Tela de pagamento da mensalidade: Pix (QR no app) ou cartão (checkout do
// Asaas), mesma cobrança; a baixa do webhook vira "Pagamento confirmado".

const _invoice = 'https://www.asaas.com/i/abc123';
// CPF válido de exemplo (dígitos verificadores corretos).
const _cpf = '52998224725';

class _FakeRepo implements SchedulePlansRepository {
  final calls = <({String chargeId, String method, String? cpfCnpj})>[];

  /// Taxas do cartão que o servidor devolve na cobrança de cartão.
  double cardFeeReais = 0;
  final canceled = <String>[];
  final savedCardPays = <String>[];
  Object? savedCardError;

  @override
  Future<void> payWithSavedCard(String chargeId) async {
    savedCardPays.add(chargeId);
    if (savedCardError != null) throw savedCardError!;
  }

  @override
  Future<DateTime?> cancelMine(String subscriptionId) async {
    canceled.add(subscriptionId);
    return null;
  }

  @override
  Future<ScheduleCheckout> chargeCheckout({
    required String chargeId,
    required String method,
    String? cpfCnpj,
  }) async {
    calls.add((chargeId: chargeId, method: method, cpfCnpj: cpfCnpj));
    return ScheduleCheckout(
      invoiceUrl: _invoice,
      amountReais: 90,
      qrCode: method == 'pix' ? '00020126pix-copia-e-cola' : null,
      qrCodeBase64: method == 'pix' ? '' : null,
      chargedReais: method == 'card' ? 90 + cardFeeReais : null,
      cardFeeReais: method == 'card' ? cardFeeReais : 0,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

ScheduleCharge charge({String status = 'open', String? cancelReason}) =>
    ScheduleCharge.fromMap({
      'chargeId': 'c1',
      'subscriptionId': 's1',
      if (cancelReason != null) 'cancelReason': cancelReason,
      'planName': 'Fixo Noite 1x',
      'period': '2026-11',
      'amountReais': 90,
      'dueDate': '2026-11-10',
      'status': status,
      'billingMode': 'asaas',
    });

class _Harness {
  final repo = _FakeRepo();
  final charges = StreamController<ScheduleCharge?>();
  final subs = StreamController<ScheduleSubscription?>();
  final opened = <String>[];
  var closed = 0;
}

Future<_Harness> pumpPage(
  WidgetTester tester, {
  String? profileCpf,
  DateTime? pendingUntil,
  CardFeeTerms cardFee = CardFeeTerms.none,
  bool autopayFlag = false,
  SavedPaymentCard? savedCard,
}) async {
  // 430pt: a fonte de teste (glifo quadrado) é mais larga que a Sora e o
  // botão "Copiar Pix Copia & Cola" da reserva estoura em 390pt só no teste.
  tester.view.physicalSize = const Size(1290, 2796);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final h = _Harness();
  addTearDown(h.charges.close);
  addTearDown(h.subs.close);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        schedulePlansUidProvider.overrideWith((ref) => 'u1'),
        schedulePlansRepositoryProvider.overrideWithValue(h.repo),
        scheduleCardFeeTermsProvider.overrideWith((ref) async => cardFee),
        scheduleCardAutopayEnabledProvider
            .overrideWith((ref) => Stream.value(autopayFlag)),
        myPaymentCardProvider.overrideWith((ref) async => savedCard),
        scheduleChargeProvider.overrideWith((ref, id) => h.charges.stream),
        scheduleSubscriptionDocProvider
            .overrideWith((ref, id) => h.subs.stream),
        athleteProfileProvider.overrideWith(
          (ref) => Stream<AthleteProfile?>.value(null),
        ),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: SchedulePlanPaymentPage(
          chargeId: 'c1',
          openCheckout: (url) async => h.opened.add(url),
          closeCheckout: () async => h.closed++,
        ),
      ),
    ),
  );
  h.charges.add(charge());
  h.subs.add(ScheduleSubscription.fromMap({
    'arenaId': 'a1',
    'planId': 'p1',
    'status': pendingUntil == null ? 'active' : 'pending_payment',
    if (pendingUntil != null)
      'pendingPaymentUntil': pendingUntil.toUtc().toIso8601String(),
  }, id: 's1'));
  await tester.pump();
  await tester.pump();
  await tester.pump();
  return h;
}

Future<void> typeCpf(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField).first, _cpf);
  await tester.pump();
}

Finder get generate => find.byType(FilledButton).last;

void main() {
  testWidgets('mostra a mensalidade e pede CPF antes de gerar', (tester) async {
    final h = await pumpPage(tester);
    expect(find.text('Fixo Noite 1x'), findsOneWidget);
    expect(find.textContaining('Mensalidade de novembro'), findsOneWidget);
    expect(find.text('Gerar PIX'), findsOneWidget);
    expect(tester.widget<FilledButton>(generate).onPressed, isNull);

    await typeCpf(tester);
    expect(tester.widget<FilledButton>(generate).onPressed, isNotNull);
    expect(h.repo.calls, isEmpty);
  });

  testWidgets('Pix: gera o QR da cobrança no app e confirma com a baixa',
      (tester) async {
    final h = await pumpPage(tester);
    await typeCpf(tester);
    await tester.tap(find.text('Gerar PIX'));
    await tester.pump();
    await tester.pump();

    expect(h.repo.calls.single, (chargeId: 'c1', method: 'pix', cpfCnpj: _cpf));
    expect(find.text('Copiar Pix Copia & Cola'), findsOneWidget);
    expect(find.text('Pagar com cartão'), findsOneWidget);
    expect(h.opened, isEmpty);

    // Webhook deu baixa: a tela vira sucesso.
    h.charges.add(charge(status: 'paid'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Pagamento confirmado'), findsOneWidget);
    expect(find.text('Ver meu plano'), findsOneWidget);
  });

  testWidgets('cartão: abre o checkout e fecha quando aprova', (tester) async {
    final h = await pumpPage(tester);
    await tester.tap(find.byKey(RegistrationPaymentMethodPicker.cardKey));
    await tester.pump();
    await typeCpf(tester);
    await tester.tap(find.textContaining(r'Pagar R$'));
    await tester.pump();
    await tester.pump();

    expect(h.repo.calls.single.method, 'card');
    expect(h.opened, [_invoice]);
    expect(find.text('Pagar com PIX'), findsOneWidget);

    h.charges.add(charge(status: 'paid'));
    await tester.pump();
    await tester.pump();
    expect(h.closed, 1);
    expect(find.text('Pagamento confirmado'), findsOneWidget);
  });

  testWidgets('taxas do cartão: Pix mais barato, cartão com o total e a taxa',
      (tester) async {
    final h = await pumpPage(
      tester,
      cardFee: const CardFeeTerms(
        anticipationPercent: 1.33,
        processingPercent: 2.99,
        fixedReais: 0.49,
      ),
    );
    h.repo.cardFeeReais = 4.52;
    // Taxas do Asaas sobre R$ 90 = R$ 4,52 (cartão R$ 94,52): o Pix mostra o
    // cartão riscado e a diferença.
    expect(
      find.byKey(RegistrationPaymentMethodPicker.pixSavingsKey),
      findsOneWidget,
    );
    expect(
        find.text('${formatBRL(4.52)} a menos que no cartão'), findsOneWidget);
    expect(find.text('Gerar PIX'), findsOneWidget);

    await tester.tap(find.byKey(RegistrationPaymentMethodPicker.cardKey));
    await tester.pump();
    await typeCpf(tester);
    expect(find.textContaining('94,52 no cartão'), findsOneWidget);
    await tester.tap(find.textContaining(r'Pagar R$'));
    await tester.pump();
    await tester.pump();

    expect(h.repo.calls.single.method, 'card');
    expect(find.byKey(const Key('schedule-payment-card-fee')), findsOneWidget);
    expect(
      find.text('Inclui ${formatBRL(4.52)} de taxas do cartão.'),
      findsOneWidget,
    );
  });

  testWidgets('mensalidade cancelada não oferece pagamento', (tester) async {
    final h = await pumpPage(tester);
    h.charges.add(charge(status: 'canceled'));
    await tester.pump();
    await tester.pump();
    expect(find.textContaining('foi cancelada'), findsOneWidget);
    expect(find.text('Gerar PIX'), findsNothing);
  });

  testWidgets('aguardando pagamento: mostra o prazo e deixa desistir',
      (tester) async {
    final until = DateTime.now().add(const Duration(minutes: 29));
    final h = await pumpPage(tester, pendingUntil: until);
    expect(find.byKey(const Key('schedule-payment-deadline')), findsOneWidget);
    expect(find.textContaining('para confirmar o plano'), findsOneWidget);
    expect(find.text('Pagar depois'), findsNothing);

    final giveUp = find.byKey(const Key('schedule-payment-give-up'));
    await tester.ensureVisible(giveUp);
    await tester.pump();
    await tester.tap(giveUp);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Desistir da assinatura?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('schedule-confirm')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(h.repo.canceled, ['s1']);
  });

  testWidgets('prazo vencido: avisa que o horário foi liberado',
      (tester) async {
    final h = await pumpPage(tester);
    h.charges.add(charge(status: 'canceled', cancelReason: 'payment_expired'));
    await tester.pump();
    await tester.pump();
    expect(find.textContaining('prazo de 30 minutos'), findsOneWidget);
    expect(find.text('Gerar PIX'), findsNothing);
  });

  const visa = SavedPaymentCard(
    brand: 'VISA',
    last4: '4242',
    expiryMonth: 12,
    expiryYear: 2030,
  );

  testWidgets('sem a flag ou sem cartão, não oferece o cartão salvo',
      (tester) async {
    await pumpPage(tester, savedCard: visa);
    expect(find.byKey(const Key('schedule-pay-saved-card')), findsNothing);
  });

  const fees = CardFeeTerms(
    anticipationPercent: 1.33,
    processingPercent: 2.99,
    fixedReais: 0.49,
  );

  testWidgets('cartão salvo: paga com ele e a baixa fecha a tela',
      (tester) async {
    final h = await pumpPage(
      tester,
      autopayFlag: true,
      savedCard: visa,
      cardFee: fees,
    );
    // O total com a taxa do cartão, o mesmo que o servidor cobra.
    final total =
        registrationMethodQuote(pixCents: 9000, cardFee: fees).cardTotalCents;
    expect(total, greaterThan(9000));
    expect(
      find.text(
        'Pagar ${formatBRL(total / 100)} no cartão salvo (Visa final 4242)',
      ),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('schedule-pay-saved-card')));
    await tester.pump();
    expect(h.repo.savedCardPays, ['c1']);
    h.charges.add(charge(status: 'paid'));
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('schedule-payment-paid')), findsOneWidget);
  });

  testWidgets('cartão salvo sem a taxa do cartão carregada: botão travado',
      (tester) async {
    await pumpPage(tester, autopayFlag: true, savedCard: visa);
    expect(
      tester
          .widget<OutlinedButton>(
              find.byKey(const Key('schedule-pay-saved-card')))
          .onPressed,
      isNull,
    );
  });

  testWidgets('cartão salvo recusado: mostra o erro e libera o botão',
      (tester) async {
    final h = await pumpPage(
      tester,
      autopayFlag: true,
      savedCard: visa,
      cardFee: fees,
    );
    h.repo.savedCardError = SchedulePlanException(
      'O cartão foi recusado. Tente outro cartão ou pague com Pix.',
    );
    await tester.tap(find.byKey(const Key('schedule-pay-saved-card')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 400));
    expect(
      find.text(
        'Não foi possível pagar. O cartão foi recusado. Tente outro cartão ou '
        'pague com Pix.',
      ),
      findsOneWidget,
    );
    expect(
      tester
          .widget<OutlinedButton>(
              find.byKey(const Key('schedule-pay-saved-card')))
          .onPressed,
      isNotNull,
    );
  });
}
