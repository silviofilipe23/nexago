import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/schedule_plans/application/schedule_plans_providers.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_logic.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
import 'package:nexago_app/features/schedule_plans/presentation/schedule_plan_signup_page.dart';

/// Anual à vista (12 mensalidades numa cobrança) e plano sem quadra na arena
/// que define a quadra (canvas "Planos de horário · anual à vista e plano sem
/// quadra").
SchedulePlanAvailability availability({bool definesCourt = false}) =>
    SchedulePlanAvailability.fromMap({
      'plan': {
        'name': 'Plano Noite 2x',
        'timesPerWeek': 2,
        'durationMinutes': 60,
        'monthlyPriceReais': 400,
        'cycles': {
          'monthly': {'enabled': true},
          'quarterly': {'enabled': true, 'discountPercent': 5},
          'annual': {'enabled': true, 'discountPercent': 10},
        },
        'billing': {
          'methods': ['pix_auto', 'onsite'],
        },
      },
      'arenaDefinesCourt': definesCourt,
      'days': [
        for (final w in [1, 2, 3, 4, 5])
          {
            'weekday': w,
            'times': [
              {
                'startTime': '19:00',
                'endTime': '20:00',
                'freeCourts': 3,
                'waitlistCount': 0,
              },
              {
                'startTime': '20:00',
                'endTime': '21:00',
                'freeCourts': 1,
                'waitlistCount': 0,
              },
            ],
          },
      ],
    }, arenaId: 'a1', planId: 'p1');

Future<void> pumpSignup(WidgetTester tester, SchedulePlanAvailability a) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        schedulePlansUidProvider.overrideWith((ref) => 'u1'),
        schedulePlanAvailabilityProvider.overrideWith((ref, key) async => a),
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

void main() {
  group('anual à vista (lógica)', () {
    test('só o anual é pago de uma vez', () {
      expect(scheduleCyclePrepaidMonths(SchedulePlanCycle.annual), 12);
      expect(scheduleCyclePrepaidMonths(SchedulePlanCycle.quarterly), 1);
      expect(scheduleCyclePrepaidMonths(SchedulePlanCycle.monthly), 1);
    });

    test('1ª proporcional aos jogos que sobram + 11 cheias', () {
      // 11/11/2026 (qua). Ter e qui de novembro: 8; sobram 12, 17, 19, 24,
      // 26 = 5 → 360 × 5/8 = 225.
      expect(
        scheduleAnnualUpfrontReais(360, [2, 4], DateTime(2026, 11, 11)),
        225 + 11 * 360,
      );
      // 30/11 (seg) é o último dos 5 jogos de segunda: 1/5 + 11 cheias.
      expect(
        scheduleAnnualUpfrontReais(360, [1], DateTime(2026, 11, 30)),
        360 * 11 + 72,
      );
      // Sem jogo sobrando no mês (terça, já em 30/11): 12 cheias.
      expect(
        scheduleAnnualUpfrontReais(360, [2], DateTime(2026, 11, 30)),
        360 * 12,
      );
    });

    test('rótulo dos meses cobertos', () {
      const annual = ScheduleCharge(
        id: 'c1',
        period: '2026-11',
        coversThrough: '2027-10',
      );
      expect(annual.coversManyMonths, isTrue);
      expect(scheduleChargeCoverLabel(annual), 'nov/26 a out/27');
      const monthly = ScheduleCharge(id: 'c2', period: '2026-11');
      expect(scheduleChargeCoverLabel(monthly), isNull);
      final parsed = ScheduleCharge.fromMap({
        'id': 'c3',
        'period': '2026-12',
        'coversThrough': '2027-11',
      });
      expect(scheduleChargeCoverLabel(parsed), 'dez/26 a nov/27');
    });

    test('assinatura e resultado leem o anual do servidor', () {
      final sub = ScheduleSubscription.fromMap(
        {'arenaId': 'a1', 'planId': 'p1', 'prepaidMonths': 12},
        id: 's1',
      );
      expect(sub.paysUpfront, isTrue);
      expect(
        ScheduleSubscription.fromMap({'arenaId': 'a1', 'planId': 'p1'}, id: 's')
            .paysUpfront,
        isFalse,
      );
      final result = ScheduleSubscribeResult.fromMap({
        'subscriptionId': 's1',
        'firstCharge': {'chargeId': 'c1', 'amountReais': 4185, 'months': 12},
      });
      expect(result.firstChargeMonths, 12);
    });
  });

  testWidgets('anual: chip por ano, nota à vista e total de 12 meses no rodapé',
      (tester) async {
    await pumpSignup(tester, availability());
    expect(find.textContaining('4.320/ano'), findsOneWidget);
    expect(find.textContaining('400/mês'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('schedule-cycle-annual')));
    await tester.pump();
    expect(
      tester.widget<Text>(find.byKey(const Key('schedule-cycle-note'))).data,
      contains('Anual à vista'),
    );
    expect(
      tester
          .widget<Text>(find.byKey(const Key('schedule-signup-share-sub')))
          .data,
      '12 meses · à vista',
    );
    // Sem dias escolhidos: 12 × R$ 360.
    expect(find.textContaining('4.320,00'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('schedule-cycle-monthly')));
    await tester.pump();
    expect(
      tester
          .widget<Text>(find.byKey(const Key('schedule-signup-share-sub')))
          .data,
      'por mês',
    );
  });

  testWidgets('arena que define a quadra: sem quadra no horário, com aviso',
      (tester) async {
    await pumpSignup(tester, availability(definesCourt: true));
    expect(
        find.byKey(const Key('schedule-arena-defines-court')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('schedule-day-2')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('schedule-day-4')));
    await tester.pump();
    expect(find.text('livre'), findsOneWidget);
    expect(find.text('última vaga'), findsOneWidget);
    expect(find.textContaining('quadra'), findsOneWidget); // só o aviso
  });

  testWidgets('atleta escolhe a quadra: segue mostrando quadras livres',
      (tester) async {
    await pumpSignup(tester, availability());
    expect(find.byKey(const Key('schedule-arena-defines-court')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('schedule-day-2')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('schedule-day-4')));
    await tester.pump();
    expect(find.text('3 quadras'), findsOneWidget);
    expect(find.text('1 quadra'), findsOneWidget);
  });
}
