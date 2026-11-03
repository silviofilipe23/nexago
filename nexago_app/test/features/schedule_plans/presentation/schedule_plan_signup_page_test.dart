import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/schedule_plans/application/schedule_plans_providers.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
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
}
