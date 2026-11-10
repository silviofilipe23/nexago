import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/schedule_plans/application/schedule_plans_providers.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
import 'package:nexago_app/features/schedule_plans/presentation/my_schedule_plans_page.dart';

final now = DateTime(2026, 11, 3, 10);

Map<String, dynamic> subscription({
  String status = 'active',
  String? pausedUntil,
}) =>
    {
      'id': 's1',
      'arenaId': 'a1',
      'arenaName': 'Arena CFC',
      'planId': 'p1',
      'planName': 'Fixo Noite 2x',
      'holderAthleteId': 'holder',
      'memberAthleteIds': ['holder', 'member'],
      'members': [
        {
          'athleteId': 'holder',
          'name': 'Marina Lopes',
          'role': 'holder',
          'shareReais': 225
        },
        {
          'athleteId': 'member',
          'name': 'Thaís Souza',
          'role': 'member',
          'shareReais': 225
        },
      ],
      'planSnapshot': {
        'timesPerWeek': 2,
        'durationMinutes': 60,
        'rules': {
          'makeup': {'enabled': true, 'noticeHours': 24},
          'pause': {'enabled': true, 'maxDaysPerYear': 30},
          'split': {'enabled': true, 'maxPlayers': 4},
        },
      },
      'slots': [
        {
          'weekday': 2,
          'startTime': '19:00',
          'endTime': '20:00',
          'courtName': 'Quadra 2'
        },
        {
          'weekday': 4,
          'startTime': '19:00',
          'endTime': '20:00',
          'courtName': 'Quadra 2'
        },
      ],
      'paymentMethod': 'pix_auto',
      'status': status,
      'pausedUntil': pausedUntil,
      'pauseDaysUsed': {'year': '2026', 'days': 0},
      'occurrences': [
        {
          'bookingId': 'b1',
          'date': '2026-11-03',
          'startTime': '19:00',
          'endTime': '20:00',
          'courtName': 'Quadra 2',
          'status': 'today'
        },
        {
          'bookingId': 'b2',
          'date': '2026-11-05',
          'startTime': '19:00',
          'endTime': '20:00',
          'courtName': 'Quadra 2',
          'status': 'next'
        },
        {
          'bookingId': 'b3',
          'date': '2026-11-10',
          'startTime': '19:00',
          'endTime': '20:00',
          'courtName': 'Quadra 2',
          'status': 'skipped'
        },
      ],
      'credits': [
        {
          'id': 'b3',
          'reason': 'skip',
          'status': 'available',
          'sourceDate': '2026-11-10',
          'expiresOn': '2026-12-10'
        },
      ],
      'charges': [
        {
          'id': 'c1',
          'amountReais': 225,
          'dueDate': '2026-11-05',
          'status': 'open',
          'payerAthleteId': 'holder'
        },
        {
          'id': 'c2',
          'amountReais': 225,
          'dueDate': '2026-11-05',
          'status': 'open',
          'payerAthleteId': 'member'
        },
      ],
    };

Future<void> pumpPage(
  WidgetTester tester, {
  required String uid,
  required Map<String, dynamic> response,
}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final data = MyScheduleSubscriptions.fromMap(response);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        schedulePlansUidProvider.overrideWith((ref) => uid),
        myScheduleSubscriptionsProvider.overrideWith((ref) async => data),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: MySchedulePlansPage(now: () => now),
      ),
    ),
  );
  // Sem pumpAndSettle: o skeleton pulsa sem fim.
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets('titular vê trocar e pausar; destaque de hoje e cobrança',
      (tester) async {
    await pumpPage(
      tester,
      uid: 'holder',
      response: {
        'subscriptions': [subscription()]
      },
    );
    expect(find.text('HOJE · TERÇA'), findsOneWidget);
    expect(find.text('19:00 – 20:00'), findsOneWidget);
    expect(find.text('2 jogadores no plano'), findsOneWidget);
    expect(find.text('NOVEMBRO'), findsOneWidget);
    expect(
      find.text('Dia 10 você avisou que não vai. Ganhou 1 reposição.'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('schedule-action-skip')), findsOneWidget);
    expect(find.text('1 disponível'), findsOneWidget);
    expect(find.byKey(const Key('schedule-action-change')), findsOneWidget);
    expect(find.byKey(const Key('schedule-action-pause')), findsOneWidget);
    expect(find.text('Até 30 dias'), findsOneWidget);
    expect(find.text('PRÓXIMA COBRANÇA · 05/11'), findsOneWidget);
    expect(find.text('sua parte'), findsOneWidget);
    expect(find.text('Pix'), findsOneWidget);
  });

  testWidgets('membro não troca nem pausa', (tester) async {
    await pumpPage(
      tester,
      uid: 'member',
      response: {
        'subscriptions': [subscription()]
      },
    );
    expect(find.byKey(const Key('schedule-action-skip')), findsOneWidget);
    expect(find.byKey(const Key('schedule-action-makeup')), findsOneWidget);
    expect(find.byKey(const Key('schedule-action-change')), findsNothing);
    expect(find.byKey(const Key('schedule-action-pause')), findsNothing);
    expect(find.byKey(const Key('schedule-action-resume')), findsNothing);
  });

  testWidgets('pausado: faixa e "Retomar" para o titular', (tester) async {
    await pumpPage(
      tester,
      uid: 'holder',
      response: {
        'subscriptions': [
          subscription(status: 'paused', pausedUntil: '2026-11-20'),
        ],
      },
    );
    expect(find.text('Plano pausado até 20/11'), findsOneWidget);
    expect(find.byKey(const Key('schedule-action-resume')), findsOneWidget);
    expect(find.byKey(const Key('schedule-action-pause')), findsNothing);
  });

  testWidgets('oferta da fila aparece no topo com "Aceitar vaga"',
      (tester) async {
    await pumpPage(
      tester,
      uid: 'u9',
      response: {
        'offers': [
          {
            'id': 'w1',
            'arenaId': 'a1',
            'planId': 'p1',
            'planName': 'Fixo Noite',
            'weekdays': [4],
            'startTime': '19:00',
            'status': 'offered',
            'offer': {'courtName': 'Quadra 3'},
          },
        ],
      },
    );
    expect(find.text('Vaga liberada · Fixo Noite'), findsOneWidget);
    expect(find.text('Qui às 19:00 · Quadra 3.'), findsOneWidget);
    expect(find.text('Aceitar vaga'), findsOneWidget);
  });

  testWidgets('sem plano: estado vazio', (tester) async {
    await pumpPage(tester, uid: 'u1', response: const {});
    expect(find.text('Nenhum plano de horário'), findsOneWidget);
  });
}
