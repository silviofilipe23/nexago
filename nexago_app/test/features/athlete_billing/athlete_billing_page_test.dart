import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_bookings_providers.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_providers.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_charge_entry.dart';
import 'package:nexago_app/features/athlete_billing/application/athlete_billing_providers.dart';
import 'package:nexago_app/features/athlete_billing/domain/athlete_billing.dart';
import 'package:nexago_app/features/athlete_billing/presentation/athlete_billing_page.dart';
import 'package:nexago_app/features/athlete_billing/presentation/widgets/athlete_billing_home_alert.dart';
import 'package:nexago_app/features/athlete_training/application/athlete_training_providers.dart';
import 'package:nexago_app/features/athlete_training/domain/training_center.dart';
import 'package:nexago_app/features/payment_card/application/payment_card_providers.dart';
import 'package:nexago_app/features/schedule_plans/domain/schedule_plan_models.dart';
import 'package:nexago_app/features/tournaments/domain/my_tournaments_models.dart';
import 'package:nexago_app/features/tournaments/domain/my_tournaments_providers.dart';

AthleteCharge _charge(
  String id,
  AthleteChargeKind kind, {
  AthleteChargeState state = AthleteChargeState.due,
  AthleteChargeTarget target = const SchedulePlansTarget(),
}) =>
    AthleteCharge(
      id: id,
      kind: kind,
      title: 'Cobrança $id',
      payee: 'Arena CFC',
      amountReais: 100,
      state: state,
      dueDate: '2026-11-05',
      target: target,
    );

final _open = [
  _charge('late', AthleteChargeKind.booking, state: AthleteChargeState.overdue),
  _charge('fixo', AthleteChargeKind.fixedSchedule),
  _charge('aula', AthleteChargeKind.classes,
      target: const TrainingPlansTarget()),
];

Widget _app({
  List<AthleteCharge>? open,
  List<AthleteRecurringCharge>? recurring = const [],
  List<PaidMonth>? history = const [],
  Widget? home,
  String initial = '/',
  bool cardEnabled = false,
}) {
  final router = GoRouter(
    initialLocation: initial,
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => Scaffold(body: home ?? const AthleteBillingPage()),
      ),
      GoRoute(
        path: AppRoutes.athleteBilling,
        name: AppRouteNames.athleteBilling,
        builder: (_, __) => const Text('COBRANCAS'),
      ),
      GoRoute(
        path: AppRoutes.mySchedulePlans,
        name: AppRouteNames.mySchedulePlans,
        builder: (_, __) => const Text('PLANOS DE HORARIO'),
      ),
      GoRoute(
        path: AppRoutes.athleteTrainingPlans,
        name: AppRouteNames.athleteTrainingPlans,
        builder: (_, __) => const Text('PLANOS DE AULA'),
      ),
    ],
  );
  return ProviderScope(
    overrides: [
      athleteOpenChargesProvider.overrideWith((ref) => open),
      athleteRecurringChargesProvider.overrideWith((ref) => recurring),
      athletePaidHistoryProvider.overrideWith((ref) => history),
      scheduleCardAutopayEnabledProvider
          .overrideWith((ref) => Stream.value(cardEnabled)),
    ],
    child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
  );
}

void main() {
  group('AthleteBillingPage', () {
    testWidgets('tile Cartão salvo some com a flag desligada', (tester) async {
      await tester.pumpWidget(_app(open: _open));
      await tester.pumpAndSettle();
      expect(find.text('Cartão salvo'), findsNothing);
    });

    testWidgets('tile Cartão salvo aparece com a flag ligada', (tester) async {
      await tester.pumpWidget(_app(open: _open, cardEnabled: true));
      await tester.pumpAndSettle();
      expect(find.text('Cartão salvo'), findsOneWidget);
    });

    testWidgets('Em aberto: resumo, linhas e filtro por tipo', (tester) async {
      await tester.pumpWidget(_app(open: _open));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('athlete-billing-open-summary')),
          findsOneWidget);
      expect(find.text('1 vencida'), findsOneWidget);
      expect(find.text('2 a pagar'), findsOneWidget);
      for (final id in ['late', 'fixo', 'aula']) {
        expect(find.byKey(Key('athlete-charge-$id')), findsOneWidget);
      }

      await tester
          .tap(find.byKey(const Key('athlete-billing-filter-horario-fixo')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('athlete-charge-fixo')), findsOneWidget);
      expect(find.byKey(const Key('athlete-charge-aula')), findsNothing);

      await tester
          .tap(find.byKey(const Key('athlete-billing-filter-torneios')));
      await tester.pumpAndSettle();
      expect(find.text('Nada em aberto em Torneios.'), findsOneWidget);
    });

    testWidgets('toque leva à tela de pagar da origem', (tester) async {
      await tester.pumpWidget(_app(open: _open));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('athlete-charge-fixo')));
      await tester.pumpAndSettle();
      expect(find.text('PLANOS DE HORARIO'), findsOneWidget);
    });

    testWidgets('sem nada em aberto mostra o vazio', (tester) async {
      await tester.pumpWidget(_app(open: const []));
      await tester.pumpAndSettle();

      expect(
          find.byKey(const Key('athlete-billing-open-empty')), findsOneWidget);
      expect(
          find.byKey(const Key('athlete-billing-open-summary')), findsNothing);
      expect(find.text('NADA EM ABERTO'), findsOneWidget);
    });

    testWidgets('Recorrentes e Histórico pelas abas', (tester) async {
      await tester.pumpWidget(
        _app(
          open: const [],
          recurring: const [
            AthleteRecurringCharge(
              id: 'schedule-s1',
              kind: AthleteChargeKind.fixedSchedule,
              title: 'Fixo Noite 2x',
              payee: 'Arena CFC',
              cycleLabel: 'Mensal · dia 05 · dividido em 4',
              amountReais: 112.5,
              totalReais: 450,
              methodLabel: 'Pix',
              target: SchedulePlanTarget(),
            ),
          ],
          history: [
            PaidMonth(
              monthKey: '2026-10',
              items: [
                const AthletePaidCharge(
                  id: 'p1',
                  kind: AthleteChargeKind.classes,
                  title: 'Turma B',
                  payee: 'Arena CFC',
                  amountReais: 300,
                  paidOn: '2026-10-15',
                ),
              ],
            ),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Recorrentes'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('athlete-recurring-schedule-s1')),
          findsOneWidget);
      expect(find.textContaining('112,50'), findsWidgets);

      await tester.tap(find.text('Histórico'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('athlete-billing-paid-summary')),
          findsOneWidget);
      expect(find.text('OUTUBRO 2026'), findsOneWidget);
    });

    testWidgets('abre na aba e no tipo da rota', (tester) async {
      await tester.pumpWidget(
        _app(
          open: _open,
          home: const AthleteBillingPage(
            initialKind: AthleteChargeKind.classes,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('athlete-charge-aula')), findsOneWidget);
      expect(find.byKey(const Key('athlete-charge-late')), findsNothing);
      expect(athleteBillingTabFromKey('historico'), AthleteBillingTab.history);
      expect(athleteBillingTabFromKey(null), AthleteBillingTab.open);
    });
  });

  group('AthleteBillingHomeAlert', () {
    testWidgets('some sem cobrança vencida', (tester) async {
      await tester.pumpWidget(
        _app(
          open: [_charge('fixo', AthleteChargeKind.fixedSchedule)],
          home: const AthleteBillingHomeAlert(),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('athlete-billing-home-alert')), findsNothing);
    });

    testWidgets('mostra a vencida e "Ver cobranças" abre a lista',
        (tester) async {
      await tester.pumpWidget(
        _app(open: _open, home: const AthleteBillingHomeAlert()),
      );
      await tester.pumpAndSettle();

      expect(find.text('1 cobrança vencida'), findsOneWidget);
      await tester.tap(find.byKey(const Key('athlete-billing-home-open')));
      await tester.pumpAndSettle();
      expect(find.text('COBRANCAS'), findsOneWidget);
    });
  });

  group('athleteOpenChargesProvider (fiação das origens)', () {
    ProviderContainer container({
      required Future<List<ClassChargeEntry>> classes,
    }) =>
        ProviderContainer(
          overrides: [
            athleteBillingUidProvider.overrideWith((ref) => 'me'),
            athleteBillingClockProvider
                .overrideWithValue(() => DateTime(2026, 11, 3, 10)),
            myClassChargesProvider.overrideWith((ref) => classes),
            athleteTrainingCentersProvider.overrideWith(
              (ref) async => const <TrainingCenterLink>[],
            ),
            athleteBillingSubscriptionsProvider.overrideWith(
              (ref) async => <ScheduleSubscription>[
                ScheduleSubscription(
                  id: 's1',
                  arenaId: 'a1',
                  arenaName: 'Arena CFC',
                  planId: 'p1',
                  planName: 'Fixo',
                  charges: [
                    ScheduleCharge(
                      id: 'sc1',
                      amountReais: 50,
                      dueDate: DateTime(2026, 11, 1),
                    ),
                  ],
                ),
              ],
            ),
            myBookingsStreamProvider.overrideWith(
              (ref) => Stream.value(const <MyBookingItem>[]),
            ),
            myTournamentsPageStateProvider.overrideWith(
              (ref) => const AsyncValue.data(
                MyTournamentsPageState(enrollments: [], seasonYear: 2026),
              ),
            ),
          ],
        );

    test('nulo enquanto uma origem carrega, depois junta todas', () async {
      final pending = Completer<List<ClassChargeEntry>>();
      final c = container(classes: pending.future);
      addTearDown(c.dispose);
      final sub = c.listen(athleteOpenChargesProvider, (_, __) {});
      await c.read(athleteBillingSubscriptionsProvider.future);
      await c.read(myBookingsStreamProvider.future);
      expect(sub.read(), isNull);

      pending.complete(const [
        ClassChargeEntry(
          chargeId: 'cc1',
          arenaId: 'a1',
          arenaName: 'Arena CFC',
          description: 'Mensalidade',
          amountReais: 200,
          dueDate: '2026-11-10',
          overdue: false,
          payment: 'manual',
        ),
      ]);
      await c.read(myClassChargesProvider.future);

      final open = sub.read()!;
      expect(open.map((x) => x.id), ['schedule-sc1', 'class-cc1']);
      expect(open.first.isOverdue, isTrue);
      expect(c.read(athleteChargesSummaryProvider)!.overdueCount, 1);
    });
  });
}
