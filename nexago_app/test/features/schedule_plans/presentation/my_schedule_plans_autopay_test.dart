import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/payment_card/application/payment_card_providers.dart';
import 'package:nexago_app/features/payment_card/domain/saved_payment_card.dart';
import 'package:nexago_app/features/schedule_plans/application/schedule_plans_providers.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
import 'package:nexago_app/features/schedule_plans/infrastructure/schedule_plans_repository.dart';
import 'package:nexago_app/features/schedule_plans/presentation/my_schedule_plans_page.dart';

// Débito automático em Meu plano: ativar (com cartão ou sem), autorizar,
// trocar cartão, desligar, flag desligada e o rótulo da mensalidade.

const _card = SavedPaymentCard(
  brand: 'VISA',
  last4: '4242',
  expiryMonth: 12,
  expiryYear: 2030,
);

const _preview = ScheduleAutopayPreview(
  brand: 'VISA',
  last4: '4242',
  cardFeePercent: 1.5,
  cardProcessingPercent: 3.99,
  cardFixedReais: 0.49,
  next: (
    chargeId: 'c1',
    dueDate: '2026-12-05',
    amountReais: 300,
    cardFeeReais: 12.46,
    chargedReais: 312.46,
  ),
);

class _FakeRepo implements SchedulePlansRepository {
  final sets = <({String id, bool enabled, String? text})>[];
  ScheduleAutopayPreview preview = _preview;

  @override
  Future<ScheduleAutopayConsent> setAutopay(
    String subscriptionId, {
    required bool enabled,
    String? consentText,
  }) async {
    sets.add((id: subscriptionId, enabled: enabled, text: consentText));
    return ScheduleAutopayConsent(enabled: enabled);
  }

  @override
  Future<ScheduleAutopayPreview> autopayPreview(String id) async => preview;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Map<String, dynamic> subMap({
  bool enabled = false,
  Map<String, dynamic>? chargeAutopay,
}) =>
    {
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
      'monthlyPriceReais': 300,
      'planSnapshot': {'timesPerWeek': 1, 'durationMinutes': 60},
      'slots': [
        {'weekday': 4, 'startTime': '19:00', 'endTime': '20:00'},
      ],
      'paymentMethod': 'pix_auto',
      'status': 'active',
      if (enabled)
        'autopay': {
          'u1': {'enabled': true, 'brand': 'VISA', 'last4': '4242'},
        },
      'charges': [
        {
          'chargeId': 'c1',
          'amountReais': 300,
          'dueDate': '2026-12-05',
          'status': 'open',
          'payerAthleteId': 'u1',
          'billingMode': 'asaas',
          'asaas': {'groupId': 'g1', 'state': 'open'},
          if (chargeAutopay != null) 'autopay': chargeAutopay,
        },
      ],
    };

Future<_FakeRepo> pump(
  WidgetTester tester,
  Map<String, dynamic> sub, {
  bool flag = true,
  SavedPaymentCard? card,
  ScheduleAutopayPreview? preview,
}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final repo = _FakeRepo();
  if (preview != null) repo.preview = preview;
  final router = GoRouter(
    initialLocation: AppRoutes.mySchedulePlans,
    routes: [
      GoRoute(
        path: AppRoutes.mySchedulePlans,
        builder: (_, __) =>
            MySchedulePlansPage(now: () => DateTime(2026, 11, 3, 10)),
      ),
      GoRoute(
        path: AppRoutes.paymentCardNew,
        builder: (context, _) => Scaffold(
          body: TextButton(
            key: const Key('fake-card-save'),
            onPressed: () => context.pop(_card),
            child: const Text('SALVAR CARTÃO'),
          ),
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        schedulePlansUidProvider.overrideWith((ref) => 'u1'),
        schedulePlansRepositoryProvider.overrideWithValue(repo),
        myScheduleSubscriptionsProvider.overrideWith(
          (ref) async => MyScheduleSubscriptions.fromMap({
            'subscriptions': [sub],
          }),
        ),
        scheduleCardAutopayEnabledProvider
            .overrideWith((ref) => Stream.value(flag)),
        myPaymentCardProvider.overrideWith((ref) async => card),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump();
  await tester.pump();
  return repo;
}

Future<void> tapKey(WidgetTester tester, String key) async {
  final f = find.byKey(Key(key));
  await tester.ensureVisible(f);
  await tester.pump();
  await tester.tap(f);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

const _consentText =
    'Autorizo a nexaGO a debitar no cartão Visa final 4242, no dia do '
    'vencimento, cada mensalidade do plano Fixo Noite 1x (Arena CFC), mais a '
    'taxa do cartão (5,49% + R\$ 0,49). Posso desligar quando quiser em Meu '
    'plano.';

void main() {
  testWidgets('desligado: oferece "Ativar"', (tester) async {
    await pump(tester, subMap(), card: _card);
    expect(find.text('Débito automático'), findsOneWidget);
    expect(find.text('Pague todo mês sem abrir o app'), findsOneWidget);
    expect(find.byKey(const Key('schedule-autopay-enable')), findsOneWidget);
  });

  testWidgets('com cartão: Ativar abre a folha e Autorizar manda o texto',
      (tester) async {
    final repo = await pump(tester, subMap(), card: _card);
    await tapKey(tester, 'schedule-autopay-enable');
    expect(find.text(_consentText), findsOneWidget);
    await tapKey(tester, 'schedule-autopay-authorize');
    expect(repo.sets, hasLength(1));
    expect(repo.sets.single.id, 's1');
    expect(repo.sets.single.enabled, isTrue);
    expect(repo.sets.single.text, _consentText);
  });

  testWidgets('a folha mostra o dia, o valor e a taxa do próximo débito',
      (tester) async {
    await pump(tester, subMap(), card: _card);
    await tapKey(tester, 'schedule-autopay-enable');
    expect(
      tester
          .widget<Text>(
              find.byKey(const Key('schedule-autopay-consent-detail')))
          .data,
      'Próximo débito: 05/12 · ${formatBRL(300)} + taxa do cartão '
      '${formatBRL(12.46)} = ${formatBRL(312.46)}',
    );
  });

  testWidgets('sem próxima mensalidade: a folha diz que é no vencimento',
      (tester) async {
    await pump(
      tester,
      subMap(),
      card: _card,
      preview: const ScheduleAutopayPreview(
        brand: 'VISA',
        last4: '4242',
        cardFeePercent: 1.5,
        cardProcessingPercent: 3.99,
        cardFixedReais: 0.49,
      ),
    );
    await tapKey(tester, 'schedule-autopay-enable');
    expect(
      tester
          .widget<Text>(
              find.byKey(const Key('schedule-autopay-consent-detail')))
          .data,
      'Débito no vencimento de cada mensalidade.',
    );
  });

  testWidgets('taxa zerada na prévia: avisa, sem folha nem setAutopay',
      (tester) async {
    final repo = await pump(
      tester,
      subMap(),
      card: _card,
      preview: const ScheduleAutopayPreview(),
    );
    await tapKey(tester, 'schedule-autopay-enable');
    expect(
      find.text('Não foi possível carregar a taxa do cartão. Tente de novo.'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('schedule-autopay-authorize')), findsNothing);
    expect(repo.sets, isEmpty);
  });

  testWidgets('sem cartão: abre o formulário e, ao voltar, a folha',
      (tester) async {
    final repo = await pump(tester, subMap());
    await tapKey(tester, 'schedule-autopay-enable');
    expect(find.text('SALVAR CARTÃO'), findsOneWidget);
    await tester.tap(find.byKey(const Key('fake-card-save')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump();
    expect(find.text(_consentText), findsOneWidget);
    await tapKey(tester, 'schedule-autopay-authorize');
    expect(repo.sets.single.enabled, isTrue);
  });

  testWidgets('ligado: mostra cartão e próxima; Trocar abre o formulário',
      (tester) async {
    await pump(tester, subMap(enabled: true), card: _card);
    expect(
      find.textContaining('Visa final 4242 · próxima: 05/12, R\$'),
      findsOneWidget,
    );
    expect(find.textContaining('312,46'), findsWidgets);
    await tapKey(tester, 'schedule-autopay-change-card');
    expect(find.text('SALVAR CARTÃO'), findsOneWidget);
  });

  testWidgets('ligado: Desligar confirma e chama enabled: false',
      (tester) async {
    final repo = await pump(tester, subMap(enabled: true), card: _card);
    await tapKey(tester, 'schedule-autopay-disable');
    await tapKey(tester, 'schedule-confirm');
    expect(repo.sets, hasLength(1));
    expect(repo.sets.single.enabled, isFalse);
    expect(repo.sets.single.text, isNull);
  });

  testWidgets('flag desligada: o card não aparece', (tester) async {
    await pump(tester, subMap(), flag: false, card: _card);
    expect(find.byKey(const Key('schedule-autopay-card')), findsNothing);
  });

  testWidgets('mensalidade agendada mostra o rótulo e segue com "Pagar"',
      (tester) async {
    await pump(
      tester,
      subMap(enabled: true, chargeAutopay: {
        'state': 'scheduled',
        'scheduledFor': '2026-12-05',
        'last4': '4242',
      }),
      card: _card,
    );
    expect(
      find.text('Será debitada em 05/12 no cartão final 4242'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('schedule-charge-pay')), findsOneWidget);
  });
}
