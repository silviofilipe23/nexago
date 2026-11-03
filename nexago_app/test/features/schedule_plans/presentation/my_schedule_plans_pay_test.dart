import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/schedule_plans/application/schedule_plans_providers.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
import 'package:nexago_app/features/schedule_plans/presentation/my_schedule_plans_page.dart';

// "Pagar" da mensalidade online em Meu plano abre a tela de pagamento.

Future<void> pumpMyPlan(WidgetTester tester, Map<String, dynamic> sub) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: AppRoutes.mySchedulePlans,
    routes: [
      GoRoute(
        path: AppRoutes.mySchedulePlans,
        builder: (_, __) =>
            MySchedulePlansPage(now: () => DateTime(2026, 11, 3, 10)),
      ),
      GoRoute(
        path: AppRoutes.schedulePlanPayment,
        builder: (_, state) => Text(
          'PAGAR ${state.pathParameters['chargeId']}',
          textDirection: TextDirection.ltr,
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        schedulePlansUidProvider.overrideWith((ref) => 'u1'),
        myScheduleSubscriptionsProvider.overrideWith(
          (ref) async => MyScheduleSubscriptions.fromMap({
            'subscriptions': [sub],
          }),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('aguardando pagamento: aviso com o prazo e "Pagar agora"',
      (tester) async {
    await pumpMyPlan(tester, {
      'id': 's1',
      'arenaId': 'a1',
      'planId': 'p1',
      'planName': 'Fixo Noite 1x',
      'holderAthleteId': 'u1',
      'memberAthleteIds': ['u1'],
      'members': [
        {'athleteId': 'u1', 'name': 'Marina Lopes', 'role': 'holder'},
      ],
      'planSnapshot': {'timesPerWeek': 1, 'durationMinutes': 60},
      'slots': [
        {'weekday': 4, 'startTime': '19:00', 'endTime': '20:00'},
      ],
      'paymentMethod': 'pix_auto',
      'status': 'pending_payment',
      'pendingPaymentUntil': DateTime(2026, 11, 3, 10, 30).toIso8601String(),
      'charges': [
        {
          'chargeId': 'c1',
          'amountReais': 90,
          'dueDate': '2026-11-10',
          'status': 'open',
          'payerAthleteId': 'u1',
        },
      ],
    });
    expect(find.text('Aguardando pagamento até 10:30'), findsOneWidget);
    final cancel = find.byKey(const Key('schedule-action-cancel'));
    await tester.scrollUntilVisible(
      cancel,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pump();
    expect(
      find.descendant(of: cancel, matching: find.text('Desistir da assinatura')),
      findsOneWidget,
    );
    final pay = find.byKey(const Key('schedule-pending-pay'));
    await tester.ensureVisible(pay);
    await tester.pump();
    await tester.tap(pay);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('PAGAR c1'), findsOneWidget);
  });

  testWidgets('"Pagar" leva à tela de pagamento da mensalidade',
      (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final data = MyScheduleSubscriptions.fromMap({
      'subscriptions': [
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
          'monthlyPriceReais': 180,
          'planSnapshot': {'timesPerWeek': 1, 'durationMinutes': 60},
          'slots': [
            {'weekday': 4, 'startTime': '19:00', 'endTime': '20:00'},
          ],
          'paymentMethod': 'pix_auto',
          'status': 'active',
          'charges': [
            {
              'chargeId': 'c1',
              'amountReais': 180,
              'dueDate': '2026-11-10',
              'status': 'open',
              'payerAthleteId': 'u1',
              'billingMode': 'asaas',
              'asaas': {'groupId': 'g1', 'state': 'open'},
            },
          ],
        },
      ],
    });
    final router = GoRouter(
      initialLocation: AppRoutes.mySchedulePlans,
      routes: [
        GoRoute(
          path: AppRoutes.mySchedulePlans,
          builder: (_, __) =>
              MySchedulePlansPage(now: () => DateTime(2026, 11, 3, 10)),
        ),
        GoRoute(
          path: AppRoutes.schedulePlanPayment,
          builder: (_, state) => Text(
            'PAGAR ${state.pathParameters['chargeId']}',
            textDirection: TextDirection.ltr,
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          schedulePlansUidProvider.overrideWith((ref) => 'u1'),
          myScheduleSubscriptionsProvider.overrideWith((ref) async => data),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pump();
    await tester.pump();

    final pay = find.byKey(const Key('schedule-charge-pay'));
    await tester.ensureVisible(pay);
    await tester.pump();
    await tester.tap(pay);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('PAGAR c1'), findsOneWidget);
  });
}
