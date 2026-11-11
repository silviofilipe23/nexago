import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'my_schedule_plans_page_test.dart' show pumpPage;

Map<String, dynamic> flexSubscription(
        {int used = 1, List<Map<String, dynamic>> occurrences = const []}) =>
    {
      'id': 's1',
      'arenaId': 'a1',
      'arenaName': 'Arena CFC',
      'planId': 'p1',
      'planName': 'Manhã livre',
      'holderAthleteId': 'holder',
      'memberAthleteIds': ['holder'],
      'members': [
        {
          'athleteId': 'holder',
          'name': 'Marina Lopes',
          'role': 'holder',
          'shareReais': 300
        },
      ],
      'planSnapshot': {
        'bookingMode': 'flexible',
        'timesPerWeek': 2,
        'durationMinutes': 60,
        'windows': [
          for (final w in [1, 2, 3, 4, 5])
            {'weekday': w, 'startTime': '06:00', 'endTime': '12:00'},
        ],
        'rules': {
          'pause': {'enabled': true, 'maxDaysPerYear': 30},
        },
      },
      'slots': const [],
      'status': 'active',
      'pauseDaysUsed': {'year': '2026', 'days': 0},
      'weekUsage': {
        'weekStart': '2026-11-02',
        'weekEnd': '2026-11-08',
        'used': used,
        'timesPerWeek': 2
      },
      'occurrences': occurrences,
      'credits': const [],
      'charges': const [],
    };

void main() {
  testWidgets('plano livre: usos da semana e reservar, sem ações do fixo',
      (tester) async {
    await pumpPage(tester, uid: 'holder', response: {
      'subscriptions': [flexSubscription()],
    });
    expect(find.text('HORÁRIO LIVRE · ATÉ 2X POR SEMANA'), findsOneWidget);
    expect(find.text('Seg–Sex, 6h–12h'), findsOneWidget);
    expect(find.byKey(const Key('schedule-flex-usage')), findsOneWidget);
    expect(find.text('1 de 2 usados nesta semana'), findsOneWidget);
    expect(find.byKey(const Key('schedule-action-book')), findsOneWidget);
    expect(find.text('1 livre nesta semana'), findsOneWidget);
    expect(find.byKey(const Key('schedule-action-skip')), findsNothing);
    expect(find.byKey(const Key('schedule-action-makeup')), findsNothing);
    expect(find.byKey(const Key('schedule-action-change')), findsNothing);
    expect(find.byKey(const Key('schedule-action-pause')), findsOneWidget);
  });

  testWidgets('plano livre: semana completa e próxima reserva no destaque',
      (tester) async {
    await pumpPage(tester, uid: 'holder', response: {
      'subscriptions': [
        flexSubscription(used: 2, occurrences: [
          {
            'bookingId': 'b1',
            'date': '2026-11-05',
            'startTime': '08:00',
            'endTime': '09:00',
            'courtName': 'Quadra 1',
            'status': 'next',
          },
        ]),
      ],
    });
    expect(find.text('Semana completa: 2 de 2 usados nesta semana'),
        findsOneWidget);
    expect(find.text('Semana completa'), findsOneWidget);
    expect(find.text('08:00 – 09:00'), findsOneWidget);
  });
}
