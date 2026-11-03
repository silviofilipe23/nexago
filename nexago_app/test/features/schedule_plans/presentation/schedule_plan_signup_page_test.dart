import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/schedule_plans/application/schedule_plans_providers.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
import 'package:nexago_app/features/schedule_plans/infrastructure/schedule_plans_repository.dart';
import 'package:nexago_app/features/schedule_plans/presentation/schedule_plan_signup_page.dart';

Map<String, dynamic> times(List<List<Object>> rows) => {
      'times': [
        for (final r in rows)
          {
            'startTime': r[0],
            'endTime': r[1],
            'freeCourts': r[2],
            'waitlistCount': r[3],
          },
      ],
    };

final availability = SchedulePlanAvailability.fromMap({
  'plan': {
    'name': 'Fixo Noite 2x',
    'timesPerWeek': 2,
    'durationMinutes': 60,
    'monthlyPriceReais': 450,
    'cycles': {
      'monthly': {'enabled': true},
      'quarterly': {'enabled': true, 'discountPercent': 5},
      'annual': {'enabled': false},
    },
    'billing': {
      'methods': ['pix_auto', 'onsite'],
    },
    'rules': {
      'split': {'enabled': true, 'maxPlayers': 4},
    },
  },
  'days': [
    for (final w in [1, 2, 3, 4, 5])
      {
        'weekday': w,
        ...times([
          ['18:00', '19:00', 2, 0],
          ['19:00', '20:00', w == 4 ? 0 : 2, 7],
          ['20:00', '21:00', 1, 0],
        ]),
      },
  ],
}, arenaId: 'a1', planId: 'p1');

void main() {
  testWidgets('escolhe 2 dias e um horário que vale para os dois',
      (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          schedulePlansUidProvider.overrideWith((ref) => 'u1'),
          schedulePlanAvailabilityProvider
              .overrideWith((ref, key) async => availability),
        ],
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const SchedulePlanSignupPage(arenaId: 'a1', planId: 'p1'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Fixo Noite 2x'), findsOneWidget);
    expect(find.text('ESCOLHA 2 DIAS'), findsOneWidget);
    // Ciclos ligados com o mensal do ciclo.
    expect(find.textContaining('450/mês'), findsOneWidget);
    expect(find.text('Anual'), findsNothing);

    FilledButton submit() => tester.widget<FilledButton>(find.descendant(
          of: find.byKey(const Key('schedule-signup-submit')),
          matching: find.byType(FilledButton),
        ));
    expect(submit().onPressed, isNull);

    await tester.tap(find.byKey(const ValueKey('schedule-day-2')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('schedule-day-4')));
    await tester.pump();
    expect(find.text('HORÁRIO · VALE PARA TER E QUI'), findsOneWidget);
    // 19:00 lotado na quinta: fila para os dois dias.
    expect(find.text('Lista de espera · 7'), findsOneWidget);
    expect(find.text('Entrar na fila'), findsOneWidget);
    expect(find.text('1 quadra'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('schedule-time-20:00')));
    await tester.pump();
    expect(submit().onPressed, isNotNull);
    expect(find.textContaining('450,00'), findsOneWidget);
    expect(find.text('por mês'), findsOneWidget);

    // Trimestral: 5% sobre o mensal.
    await tester.tap(find.byKey(const ValueKey('schedule-cycle-quarterly')));
    await tester.pump();
    expect(find.textContaining('427,50'), findsOneWidget);
  });

  testWidgets('pagamento: nota conforme a cobrança online da arena',
      (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    Future<void> pump(bool online) async {
      final a = SchedulePlanAvailability.fromMap({
        'plan': {
          'name': 'Fixo Noite 2x',
          'timesPerWeek': 2,
          'monthlyPriceReais': 450,
          'billing': {
            'methods': ['pix_auto', 'onsite'],
          },
        },
        'days': const [],
        'onlineBilling': online,
      }, arenaId: 'a1', planId: 'p1');
      await tester.pumpWidget(
        ProviderScope(
          key: ValueKey(online),
          overrides: [
            schedulePlansUidProvider.overrideWith((ref) => 'u1'),
            schedulePlanAvailabilityProvider
                .overrideWith((ref, key) async => a),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: const SchedulePlanSignupPage(arenaId: 'a1', planId: 'p1'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
    }

    Text note() =>
        tester.widget<Text>(find.byKey(const Key('schedule-method-note')));

    await pump(true);
    expect(note().data, startsWith('Pix ou cartão: ao assinar você já paga'));
    expect(find.text('Assinar e pagar'), findsOneWidget);
    await tester.ensureVisible(
      find.byKey(const ValueKey('schedule-method-onsite')),
    );
    await tester.tap(find.byKey(const ValueKey('schedule-method-onsite')));
    await tester.pump();
    expect(note().data, contains('direto na arena'));
    expect(find.text('Assinar'), findsOneWidget);

    await pump(false);
    expect(note().data, startsWith('Combine o pagamento com a arena'));
    expect(find.text('Assinar'), findsOneWidget);
  });

  group('assinar com Pix ou cartão leva ao pagamento', () {
    Future<String> subscribeAndLand(
      WidgetTester tester, {
      required bool online,
      required double first,
    }) async {
      tester.view.physicalSize = const Size(1170, 2532);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final a = SchedulePlanAvailability.fromMap({
        ...{
          'plan': {
            'name': 'Fixo Noite 1x',
            'timesPerWeek': 1,
            'monthlyPriceReais': 180,
            'billing': {
              'methods': ['pix_auto', 'onsite'],
            },
          },
          'days': [
            {
              'weekday': 2,
              ...times([
                ['19:00', '20:00', 2, 0],
              ]),
            },
          ],
        },
        'onlineBilling': online,
      }, arenaId: 'a1', planId: 'p1');
      final repo = _SubscribeRepo(first);
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) =>
                const SchedulePlanSignupPage(arenaId: 'a1', planId: 'p1'),
          ),
          GoRoute(
            path: AppRoutes.mySchedulePlans,
            builder: (_, state) => Text(
              'MEU PLANO ${state.uri.queryParameters['pagar'] ?? '-'}',
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
            schedulePlanAvailabilityProvider
                .overrideWith((ref, key) async => a),
            schedulePlansRepositoryProvider.overrideWithValue(repo),
            myScheduleSubscriptionsProvider.overrideWith(
              (ref) async => MyScheduleSubscriptions.fromMap(const {}),
            ),
          ],
          child: MaterialApp.router(
            theme: AppTheme.dark,
            routerConfig: router,
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('schedule-day-2')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('schedule-time-19:00')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('schedule-signup-submit')));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      final landed = find.textContaining('MEU PLANO ');
      expect(landed, findsOneWidget);
      return tester.widget<Text>(landed).data!;
    }

    testWidgets('arena cobra online: Meu plano abre a 1ª mensalidade',
        (tester) async {
      expect(
        await subscribeAndLand(tester, online: true, first: 90),
        'MEU PLANO s1_2026-11_0',
      );
    });

    testWidgets('arena sem cobrança online: só Meu plano', (tester) async {
      expect(
        await subscribeAndLand(tester, online: false, first: 90),
        'MEU PLANO -',
      );
    });

    testWidgets('abaixo do mínimo online: só Meu plano', (tester) async {
      expect(
        await subscribeAndLand(tester, online: true, first: 3),
        'MEU PLANO -',
      );
    });
  });
}

class _SubscribeRepo implements SchedulePlansRepository {
  _SubscribeRepo(this.first);

  final double first;

  @override
  Future<ScheduleSubscribeResult> subscribe({
    required String arenaId,
    required String planId,
    required List<int> weekdays,
    required String startTime,
    required SchedulePlanCycle cycle,
    required SchedulePaymentMethod paymentMethod,
    List<String> memberAthleteIds = const [],
  }) async =>
      ScheduleSubscribeResult.fromMap({
        'subscriptionId': 's1',
        'courtName': 'Quadra 1',
        'firstCharge': {
          'chargeId': 's1_2026-11_0',
          'amountReais': first,
          'dueDate': '2026-11-10',
        },
      });

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      super.noSuchMethod(invocation);
}
