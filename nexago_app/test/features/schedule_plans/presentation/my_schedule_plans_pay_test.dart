import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/schedule_plans/application/schedule_plans_providers.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_logic.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
import 'package:nexago_app/features/schedule_plans/infrastructure/schedule_plans_repository.dart';
import 'package:nexago_app/features/schedule_plans/presentation/my_schedule_plans_page.dart';

// "Pagar" da mensalidade online em Meu plano: link → navegador; sem CPF, a
// folha pede o CPF e repete com ele.

const _invoice = 'https://www.asaas.com/i/abc123';
// CPF válido de exemplo (dígitos verificadores corretos).
const _cpf = '52998224725';

class _FakeRepo implements SchedulePlansRepository {
  _FakeRepo({this.needsCpf = false, this.gate});

  final bool needsCpf;

  /// Segura a primeira resposta (para ver o botão carregando).
  final Completer<void>? gate;
  final calls = <({String chargeId, String? cpfCnpj})>[];

  @override
  Future<String> chargePaymentLink({
    required String chargeId,
    String? cpfCnpj,
  }) async {
    calls.add((chargeId: chargeId, cpfCnpj: cpfCnpj));
    if (gate != null) await gate!.future;
    if (needsCpf && cpfCnpj == null) {
      throw SchedulePlanException(
        scheduleCpfRequiredMessage,
        code: 'failed-precondition',
      );
    }
    return _invoice;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      super.noSuchMethod(invocation);
}

Map<String, dynamic> subscription(List<Map<String, dynamic>> charges) => {
      'id': 's1',
      'arenaId': 'a1',
      'arenaName': 'Arena CFC',
      'planId': 'p1',
      'planName': 'Fixo Noite 1x',
      'holderAthleteId': 'u1',
      'memberAthleteIds': ['u1'],
      'members': [
        {'athleteId': 'u1', 'name': 'Marina Lopes', 'role': 'holder'},
      ],
      'monthlyPriceReais': 180,
      'planSnapshot': {'timesPerWeek': 1, 'durationMinutes': 60},
      'slots': [
        {'weekday': 4, 'startTime': '19:00', 'endTime': '20:00'},
      ],
      'paymentMethod': 'pix_auto',
      'status': 'active',
      'charges': charges,
    };

Map<String, dynamic> openOnline() => {
      'chargeId': 'c1',
      'amountReais': 180,
      'dueDate': '2026-11-10',
      'status': 'open',
      'payerAthleteId': 'u1',
      'billingMode': 'asaas',
      'asaas': {'groupId': 'g1', 'state': 'open', 'invoiceUrl': _invoice},
    };

Future<List<String>> pumpPage(
  WidgetTester tester, {
  required List<Map<String, dynamic>> charges,
  required SchedulePlansRepository repo,
  bool opens = true,
}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final opened = <String>[];
  final data = MyScheduleSubscriptions.fromMap({
    'subscriptions': [subscription(charges)],
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        schedulePlansUidProvider.overrideWith((ref) => 'u1'),
        myScheduleSubscriptionsProvider.overrideWith((ref) async => data),
        schedulePlansRepositoryProvider.overrideWithValue(repo),
        athleteProfileProvider
            .overrideWith((ref) => Stream<AthleteProfile?>.value(null)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: MySchedulePlansPage(
          now: () => DateTime(2026, 11, 3, 10),
          openUrl: (url) async {
            opened.add(url);
            return opens;
          },
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
  return opened;
}

Finder get payButton => find.byKey(const Key('schedule-charge-pay'));

Future<void> tapPay(WidgetTester tester) async {
  await tester.ensureVisible(payButton);
  await tester.pump();
  await tester.tap(payButton);
}

void main() {
  testWidgets('aberta online: "Pagar" carrega e abre a fatura',
      (tester) async {
    final gate = Completer<void>();
    final repo = _FakeRepo(gate: gate);
    final opened = await pumpPage(tester, charges: [openOnline()], repo: repo);

    expect(find.text('Pix ou cartão'), findsOneWidget);
    await tapPay(tester);
    await tester.pump();
    // Buscando o link: o botão vira rodinha.
    expect(
      find.descendant(
        of: payButton,
        matching: find.byType(CircularProgressIndicator),
      ),
      findsOneWidget,
    );

    gate.complete();
    await tester.pump();
    await tester.pump();
    expect(repo.calls.single, (chargeId: 'c1', cpfCnpj: null));
    expect(opened, [_invoice]);
    expect(
      find.descendant(
        of: payButton,
        matching: find.byType(CircularProgressIndicator),
      ),
      findsNothing,
    );
  });

  testWidgets('sem CPF: folha pede o CPF e repete com só dígitos',
      (tester) async {
    final repo = _FakeRepo(needsCpf: true);
    final opened = await pumpPage(tester, charges: [openOnline()], repo: repo);

    await tapPay(tester);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Informe seu CPF'), findsOneWidget);
    expect(opened, isEmpty);

    // CPF inválido não chama o servidor.
    await tester.enterText(
      find.descendant(
        of: find.byKey(const Key('schedule-pay-cpf-field')),
        matching: find.byType(TextField),
      ),
      '11111111111',
    );
    await tester.tap(find.byKey(const Key('schedule-pay-cpf-submit')));
    await tester.pump();
    expect(find.text('CPF inválido'), findsOneWidget);
    expect(repo.calls, hasLength(1));

    await tester.enterText(
      find.descendant(
        of: find.byKey(const Key('schedule-pay-cpf-field')),
        matching: find.byType(TextField),
      ),
      _cpf,
    );
    await tester.tap(find.byKey(const Key('schedule-pay-cpf-submit')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(repo.calls.last, (chargeId: 'c1', cpfCnpj: _cpf));
    expect(opened, [_invoice]);
    expect(find.text('Informe seu CPF'), findsNothing);
  });

  testWidgets('navegador não abre: avisa', (tester) async {
    await pumpPage(
      tester,
      charges: [openOnline()],
      repo: _FakeRepo(),
      opens: false,
    );
    await tapPay(tester);
    await tester.pump();
    await tester.pump();
    expect(
      find.text('Não foi possível abrir a fatura. Tente de novo em instantes.'),
      findsOneWidget,
    );
  });

  testWidgets('aberta manual: sem "Pagar", "Pague na arena"', (tester) async {
    await pumpPage(
      tester,
      charges: [
        {...openOnline(), 'billingMode': 'manual', 'asaas': null},
      ],
      repo: _FakeRepo(),
    );
    expect(payButton, findsNothing);
    expect(find.text('Pague na arena'), findsOneWidget);
  });

  testWidgets('nada em aberto: última paga online mostra "Pago · Pix"',
      (tester) async {
    await pumpPage(
      tester,
      charges: [
        {
          ...openOnline(),
          'status': 'paid',
          'paidVia': 'asaas',
          'onlineBillingType': 'PIX',
        },
      ],
      repo: _FakeRepo(),
    );
    expect(payButton, findsNothing);
    expect(find.byKey(const Key('schedule-charge-paid-online')), findsOneWidget);
    expect(find.text('Pago · Pix'), findsOneWidget);
  });
}
