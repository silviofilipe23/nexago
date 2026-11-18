import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_business_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_cockpit.dart';
import 'package:nexago_app/features/arena/domain/arena_dashboard_period.dart';
import 'package:nexago_app/features/arena/domain/arena_idle_map.dart';
import 'package:nexago_app/features/arena/domain/arena_month_goal.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/arena_month_goal_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_idle_map_card.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_cockpit_hero.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_cockpit_kpi_strip.dart';

List<Override> _role(ArenaStaffRole? role, {bool owner = false}) {
  final m = ArenaMembership(
    arenaId: 'a1',
    name: 'Arena Maré',
    isOwner: owner,
    role: role,
  );
  return [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? [m] : const <ArenaMembership>[]),
    ),
    staffArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(owner ? const <ArenaMembership>[] : [m]),
    ),
  ];
}

ArenaMonthGoalProgress _progress({double? goal = 38000}) =>
    ArenaMonthGoalProgress(
      goalReais: goal,
      realizedReais: 27480,
      bookedAheadReais: 4200,
      projectionReais: 45800,
      month: DateTime(2026, 11),
      dayOfMonth: 18,
      daysInMonth: 30,
    );

final _cockpit = ArenaCockpit(
  period: ArenaDashboardPeriod.month,
  revenue: 27480,
  revenuePrev: 25200,
  bookings: 412,
  bookingsPrev: 381,
  occupancy: 58,
  occupancyPrev: 50,
  ticket: 66,
  ticketPrev: 66,
  peakHour: 19,
  seriesDays: [for (var d = 1; d <= 18; d++) DateTime(2026, 11, d)],
  revenueSeries: [for (var d = 1; d <= 18; d++) d * 1526.0],
  bookingsSeries: [for (var d = 1; d <= 18; d++) d * 23],
  comparisonLabel: 'vs. outubro até o dia 18',
);

final _map = ArenaIdleMap(
  hours: const [14, 15, 16],
  days: [
    ArenaIdleMapDay(
      date: DateTime(2026, 11, 19),
      cells: const [
        ArenaIdleMapCell(hour: 14, total: 2, booked: 0, isPast: false),
        ArenaIdleMapCell(hour: 15, total: 2, booked: 0, isPast: false),
        ArenaIdleMapCell(hour: 16, total: 2, booked: 2, isPast: false),
      ],
    ),
  ],
  hole: ArenaIdleHole(
    date: DateTime(2026, 11, 19),
    startHour: 14,
    endHour: 16,
    freeSlots: 4,
    idleReais: 320,
  ),
);

Future<void> _pump(
  WidgetTester tester,
  Widget child,
  List<Override> overrides,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  group('destaque do cockpit', () {
    Future<void> pumpHero(
      WidgetTester tester,
      List<Override> role, {
      double? goal = 38000,
    }) => _pump(tester, ArenaCockpitHero(cockpit: _cockpit), [
      ...role,
      arenaMonthGoalProgressProvider.overrideWith(
        (ref) => AsyncValue.data(_progress(goal: goal)),
      ),
    ]);

    testWidgets('dono: faturamento do mês, variação, anel da meta e projeção', (
      tester,
    ) async {
      await pumpHero(tester, _role(null, owner: true));
      expect(find.text('FATURAMENTO · NOVEMBRO'), findsOneWidget);
      expect(find.textContaining('vs. outubro até o dia 18'), findsOneWidget);
      expect(find.text('72%'), findsOneWidget);
      expect(find.byTooltip('Editar meta'), findsOneWidget);
      expect(find.textContaining('Bate a meta'), findsOneWidget);
    });

    testWidgets('gestor vê a meta mas não edita', (tester) async {
      await pumpHero(tester, _role(ArenaStaffRole.gestor));
      expect(find.text('72%'), findsOneWidget);
      expect(find.byTooltip('Editar meta'), findsNothing);
    });

    testWidgets('sem meta: dono é convidado a definir', (tester) async {
      await pumpHero(tester, _role(null, owner: true), goal: null);
      expect(find.text('Definir meta'), findsOneWidget);
      expect(find.textContaining('novembro fecha em'), findsOneWidget);
    });

    testWidgets('sem meta: financeiro não vê o convite', (tester) async {
      await pumpHero(tester, _role(ArenaStaffRole.financeiro), goal: null);
      expect(find.text('Definir meta'), findsNothing);
    });

    testWidgets('recepção vê reservas no destaque, sem R\$ nem meta', (
      tester,
    ) async {
      await pumpHero(tester, _role(ArenaStaffRole.recepcao));
      expect(find.text('RESERVAS · NOVEMBRO'), findsOneWidget);
      expect(find.textContaining('R\$'), findsNothing);
      expect(find.textContaining('meta'), findsNothing);
    });
  });

  group('faixa de indicadores', () {
    testWidgets('quem vê o financeiro: ocupação, reservas e ticket', (
      tester,
    ) async {
      await _pump(
        tester,
        ArenaCockpitKpiStrip(cockpit: _cockpit, seesMoney: true),
        const [],
      );
      expect(find.text('OCUPAÇÃO'), findsOneWidget);
      expect(find.text('RESERVAS'), findsOneWidget);
      expect(find.text('TICKET MÉDIO'), findsOneWidget);
      expect(find.text('▲ 8 p.p.'), findsOneWidget);
      expect(find.text('▲ 31'), findsOneWidget);
    });

    testWidgets('quem não vê: ocupação e horário de pico, sem R\$', (
      tester,
    ) async {
      await _pump(
        tester,
        ArenaCockpitKpiStrip(cockpit: _cockpit, seesMoney: false),
        const [],
      );
      expect(find.text('HORÁRIO DE PICO'), findsOneWidget);
      expect(find.text('TICKET MÉDIO'), findsNothing);
      expect(find.textContaining('R\$'), findsNothing);
    });
  });

  group('mapa de horários vazios', () {
    testWidgets(
      'gestor vê a sugestão com valor parado e o atalho de promoção',
      (tester) async {
        await _pump(tester, const ArenaIdleMapCard(), [
          ..._role(ArenaStaffRole.gestor),
          arenaIdleMapProvider.overrideWith((ref) => AsyncValue.data(_map)),
        ]);
        expect(find.textContaining('14h–16h está vazio'), findsOneWidget);
        expect(find.textContaining('R\$'), findsOneWidget);
        expect(find.text('Criar promoção para esse horário ›'), findsOneWidget);
      },
    );

    testWidgets('recepção vê o mapa sem R\$ e sem criar promoção', (
      tester,
    ) async {
      await _pump(tester, const ArenaIdleMapCard(), [
        ..._role(ArenaStaffRole.recepcao),
        arenaIdleMapProvider.overrideWith((ref) => AsyncValue.data(_map)),
      ]);
      expect(find.textContaining('4 horários livres'), findsOneWidget);
      expect(find.textContaining('R\$'), findsNothing);
      expect(find.text('Criar promoção para esse horário ›'), findsNothing);
    });

    test('promoção sugerida usa o dia da semana e o horário do bloco', () {
      final draft = arenaIdleHoleDraft(_map.hole!);
      expect(draft.weekdays, {DateTime.thursday});
      expect(draft.startTime, '14:00');
      expect(draft.endTime, '16:00');
      expect(draft.label, 'Horário vazio de quinta-feira');
    });
  });

  group('tela da meta', () {
    testWidgets('dono digita e o botão habilita; valor inválido mostra erro', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ..._role(null, owner: true),
            arenaMonthlyRevenueGoalProvider.overrideWith(
              (ref) => Stream.value(null),
            ),
            arenaMonthGoalProgressProvider.overrideWith(
              (ref) => AsyncValue.data(_progress(goal: null)),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: const ArenaMonthGoalPage(),
          ),
        ),
      );
      await tester.pump();
      final save = find.widgetWithText(FilledButton, 'Definir meta');
      expect(tester.widget<FilledButton>(save).onPressed, isNull);

      await tester.enterText(
        find.byKey(const ValueKey('arena-goal-input')),
        '38000',
      );
      await tester.pump();
      expect(tester.widget<FilledButton>(save).onPressed, isNotNull);
      expect(find.textContaining('38.000 por mês'), findsOneWidget);

      await tester.enterText(
        find.byKey(const ValueKey('arena-goal-input')),
        '99999999',
      );
      await tester.pump();
      expect(
        find.textContaining('entre R\$ 1 e R\$ 10 milhões'),
        findsOneWidget,
      );
    });

    testWidgets('quem não é dono vê o campo travado', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ..._role(ArenaStaffRole.gestor),
            arenaMonthlyRevenueGoalProvider.overrideWith(
              (ref) => Stream.value(38000),
            ),
            arenaMonthGoalProgressProvider.overrideWith(
              (ref) => AsyncValue.data(_progress()),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: const ArenaMonthGoalPage(),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(
        find.text('Só o dono da arena pode definir a meta.'),
        findsOneWidget,
      );
      expect(find.widgetWithText(FilledButton, 'Salvar meta'), findsNothing);
    });
  });
}
