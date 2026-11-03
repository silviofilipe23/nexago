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

// "Cancelar plano" do titular em Meu plano: confirma com a data de saída e
// chama o servidor; membro e plano já com saída não veem o botão.

class _FakeRepo implements SchedulePlansRepository {
  final canceled = <String>[];

  @override
  Future<DateTime?> cancelMine(String subscriptionId) async {
    canceled.add(subscriptionId);
    return DateTime(2026, 12, 1);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Map<String, dynamic> subscription({
  String? endsOn,
  String? commitmentEndsOn,
  List<Map<String, dynamic>> charges = const [],
}) =>
    {
      'id': 's1',
      'arenaId': 'a1',
      'arenaName': 'Arena CFC',
      'planId': 'p1',
      'planName': 'Fixo Noite 1x',
      'holderAthleteId': 'u1',
      'memberAthleteIds': ['u1', 'u2'],
      'members': [
        {'athleteId': 'u1', 'name': 'Marina Lopes', 'role': 'holder'},
        {'athleteId': 'u2', 'name': 'Rafa Souza', 'role': 'member'},
      ],
      'monthlyPriceReais': 180,
      'planSnapshot': {'timesPerWeek': 1, 'durationMinutes': 60},
      'slots': [
        {'weekday': 4, 'startTime': '19:00', 'endTime': '20:00'},
      ],
      'paymentMethod': 'onsite',
      'status': 'active',
      if (endsOn != null) 'endsOn': endsOn,
      if (commitmentEndsOn != null) 'commitmentEndsOn': commitmentEndsOn,
      'charges': charges,
    };

Future<void> pumpPage(
  WidgetTester tester, {
  required Map<String, dynamic> sub,
  required SchedulePlansRepository repo,
  String uid = 'u1',
}) async {
  tester.view.physicalSize = const Size(1170, 2532);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final data = MyScheduleSubscriptions.fromMap({
    'subscriptions': [sub],
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        schedulePlansUidProvider.overrideWith((ref) => uid),
        myScheduleSubscriptionsProvider.overrideWith((ref) async => data),
        schedulePlansRepositoryProvider.overrideWithValue(repo),
        athleteProfileProvider
            .overrideWith((ref) => Stream<AthleteProfile?>.value(null)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: MySchedulePlansPage(now: () => DateTime(2026, 11, 3, 10)),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

Finder get cancelButton => find.byKey(const Key('schedule-action-cancel'));

void main() {
  group('scheduleAthleteExitDate', () {
    final now = DateTime(2026, 11, 3, 10);
    ScheduleSubscription sub0({
      String? commitment,
      List<Map<String, dynamic>> charges = const [],
    }) =>
        ScheduleSubscription.fromMap(
          subscription(commitmentEndsOn: commitment, charges: charges),
        );

    test('fim do mês corrente', () {
      expect(scheduleAthleteExitDate(sub0(), now), DateTime(2026, 12));
    });

    test('mês seguinte já pago vai até o fim dele', () {
      final sub = sub0(charges: [
        {'chargeId': 'c1', 'period': '2026-12', 'status': 'paid'},
        {'chargeId': 'c2', 'period': '2027-01', 'status': 'open'},
      ]);
      expect(scheduleAthleteExitDate(sub, now), DateTime(2027, 1));
    });

    test('fidelidade vai até o fim do mês em que termina', () {
      expect(
        scheduleAthleteExitDate(sub0(commitment: '2027-02-15'), now),
        DateTime(2027, 3),
      );
      expect(
        scheduleAthleteExitDate(sub0(commitment: '2027-02-01'), now),
        DateTime(2027, 2),
      );
    });
  });

  testWidgets('titular confirma e o servidor marca a saída', (tester) async {
    final repo = _FakeRepo();
    await pumpPage(tester, sub: subscription(), repo: repo);

    await tester.ensureVisible(cancelButton);
    await tester.pump();
    await tester.tap(cancelButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Cancelar o plano?'), findsOneWidget);
    expect(find.textContaining('até 30/11'), findsOneWidget);
    expect(find.byKey(const Key('schedule-cancel-warning')), findsOneWidget);

    await tester.tap(find.byKey(const Key('schedule-confirm')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(repo.canceled, ['s1']);
    expect(
      find.text('Plano cancelado. Você joga até 30/11.'),
      findsOneWidget,
    );
  });

  testWidgets('voltar na confirmação não cancela', (tester) async {
    final repo = _FakeRepo();
    await pumpPage(tester, sub: subscription(), repo: repo);

    await tester.ensureVisible(cancelButton);
    await tester.pump();
    await tester.tap(cancelButton);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Voltar'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(repo.canceled, isEmpty);
  });

  testWidgets('membro do rateio não vê o botão', (tester) async {
    await pumpPage(tester, sub: subscription(), repo: _FakeRepo(), uid: 'u2');
    expect(cancelButton, findsNothing);
  });

  testWidgets('plano já com saída mostra a data, sem o botão', (tester) async {
    await pumpPage(
      tester,
      sub: subscription(endsOn: '2026-12-01'),
      repo: _FakeRepo(),
    );
    expect(cancelButton, findsNothing);
    expect(find.text('Seu plano termina em 01/12'), findsOneWidget);
  });
}
