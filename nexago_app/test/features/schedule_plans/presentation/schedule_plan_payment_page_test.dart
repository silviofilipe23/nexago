import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/schedule_plans/application/schedule_plans_providers.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
import 'package:nexago_app/features/schedule_plans/infrastructure/schedule_plans_repository.dart';
import 'package:nexago_app/features/schedule_plans/presentation/schedule_plan_payment_page.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/registration_payment_method_picker.dart';

// Tela de pagamento da mensalidade: Pix (QR no app) ou cartão (checkout do
// Asaas), mesma cobrança; a baixa do webhook vira "Pagamento confirmado".

const _invoice = 'https://www.asaas.com/i/abc123';
// CPF válido de exemplo (dígitos verificadores corretos).
const _cpf = '52998224725';

class _FakeRepo implements SchedulePlansRepository {
  final calls = <({String chargeId, String method, String? cpfCnpj})>[];

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
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      super.noSuchMethod(invocation);
}

ScheduleCharge charge({String status = 'open'}) => ScheduleCharge.fromMap({
      'chargeId': 'c1',
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
  final opened = <String>[];
  var closed = 0;
}

Future<_Harness> pumpPage(WidgetTester tester, {String? profileCpf}) async {
  // 430pt: a fonte de teste (glifo quadrado) é mais larga que a Sora e o
  // botão "Copiar Pix Copia & Cola" da reserva estoura em 390pt só no teste.
  tester.view.physicalSize = const Size(1290, 2796);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final h = _Harness();
  addTearDown(h.charges.close);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        schedulePlansUidProvider.overrideWith((ref) => 'u1'),
        schedulePlansRepositoryProvider.overrideWithValue(h.repo),
        scheduleChargeProvider.overrideWith((ref, id) => h.charges.stream),
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
  testWidgets('mostra a mensalidade e pede CPF antes de gerar',
      (tester) async {
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

  testWidgets('mensalidade cancelada não oferece pagamento', (tester) async {
    final h = await pumpPage(tester);
    h.charges.add(charge(status: 'canceled'));
    await tester.pump();
    await tester.pump();
    expect(find.textContaining('foi cancelada'), findsOneWidget);
    expect(find.text('Gerar PIX'), findsNothing);
  });
}
