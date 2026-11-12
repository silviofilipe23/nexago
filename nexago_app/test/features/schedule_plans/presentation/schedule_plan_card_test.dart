import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/notifications/notification_navigation.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
import 'package:nexago_app/features/schedule_plans/presentation/arena_schedule_plans_page.dart';
import 'package:nexago_app/features/schedule_plans/presentation/schedule_plans_routes.dart';

SchedulePlan plan({
  int capacity = 20,
  int occupied = 4,
  double? reference = 70,
}) =>
    SchedulePlan(
      id: 'p1',
      arenaId: 'a1',
      name: 'Fixo Noite 2x',
      timesPerWeek: 2,
      durationMinutes: 60,
      windows: [
        for (var w = 1; w <= 5; w++)
          SchedulePlanWindow(weekday: w, startTime: '18:00', endTime: '23:00'),
      ],
      capacity: capacity,
      occupiedCount: occupied,
      monthlyPriceReais: 450,
      referenceHourlyReais: reference,
    );

Future<void> pumpCard(
  WidgetTester tester,
  SchedulePlan p, {
  ThemeData? theme,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: theme ?? AppTheme.dark,
      home: Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: SchedulePlanCard(plan: p),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('cartão mostra frequência, janela, desconto e vagas',
      (tester) async {
    await pumpCard(tester, plan());
    expect(find.text('Fixo Noite 2x'), findsOneWidget);
    expect(find.text('2x por semana · 1h · Seg–Sex, 18h–23h'), findsOneWidget);
    // 70 × 1 × 2 × 52/12 = 606,67 → −26%.
    expect(find.text('−26%'), findsOneWidget);
    // 606,67 − 450 = 156,67 por mês.
    expect(find.text('Economia de ${formatBRL(156.67)} por mês vs avulso'),
        findsOneWidget);
    expect(find.text('/mês'), findsOneWidget);
    expect(find.text('16 vagas'), findsOneWidget);
  });

  testWidgets('últimas vagas e lotado; sem avulso não mostra desconto',
      (tester) async {
    await pumpCard(tester, plan(occupied: 15, reference: null),
        theme: AppTheme.light);
    expect(find.text('Últimas 5 vagas'), findsOneWidget);
    expect(find.textContaining('%'), findsNothing);

    await pumpCard(tester, plan(occupied: 20));
    expect(find.text('Lotado · entrar na fila'), findsOneWidget);
  });

  group('rotas', () {
    test('A2 com oferta e troca', () {
      expect(
        schedulePlanSignupLocation(arenaId: 'a1', planId: 'p1'),
        '/planos-horario/a1/p1',
      );
      expect(
        schedulePlanSignupLocation(
            arenaId: 'a1', planId: 'p1', offerEntryId: 'w 1'),
        '/planos-horario/a1/p1?oferta=w+1',
      );
      expect(arenaSchedulePlansLocation('a1'), '/planos-horario/a1');
    });

    test('push dos planos abre Meu plano, com ou sem url', () {
      expect(
        resolveNotificationRoute({
          'type': 'arena_schedule_charge_overdue',
          'url': '/meus-planos-horario',
        }),
        AppRoutes.mySchedulePlans,
      );
      expect(
        resolveNotificationRoute({
          'type': 'arena_schedule_waitlist_offer',
          'arenaId': 'a1',
        }),
        AppRoutes.mySchedulePlans,
      );
      expect(
        resolveNotificationRoute({'url': '/meus-planos-horario'}),
        '/meus-planos-horario',
      );
    });
  });

  testWidgets('sem avulso de referência: nem porcentagem nem economia',
      (tester) async {
    await pumpCard(tester, plan(reference: null));
    expect(find.textContaining('Economia de'), findsNothing);
    expect(find.text('−26%'), findsNothing);
  });
}
