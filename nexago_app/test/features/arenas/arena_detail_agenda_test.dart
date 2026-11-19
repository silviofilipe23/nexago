import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_allocation.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_peak_rule.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/slot_vacancy_alerts_provider.dart';
import 'package:nexago_app/features/arenas/domain/slots_providers.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_agenda.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/arena_detail/arena_detail_bottom_cta.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

/// Agenda do perfil da arena: escolher um horário, reservar direto (ou pela
/// grade quando há regra de pico) e o dia lotado.
final _today = DateTime(2030, 11, 8); // sexta
final _now = DateTime(2030, 11, 8, 9);

const _courtArena = ArenaListItem(
  id: 'a1',
  name: 'Arena Pé na Areia',
  locationLabel: 'Goiânia, GO',
  pricePerHourReais: 0,
);

const _capacityArena = ArenaListItem(
  id: 'a1',
  name: 'Arena CFC',
  locationLabel: 'Goiânia, GO',
  pricePerHourReais: 0,
  bookingAllocation: ArenaBookingAllocation(
    isCapacity: true,
    priceBySport: {'beachTennis': 120},
  ),
);

const _courts = [
  ArenaCourt(id: 'q1', name: 'Quadra 1', sportTypes: ['beachTennis']),
  ArenaCourt(id: 'q2', name: 'Quadra 2', sportTypes: ['beachTennis']),
];

ArenaSlot _slot(
  String courtId,
  String start,
  String end, {
  String status = 'available',
  double price = 100,
  DateTime? day,
}) {
  return ArenaSlot(
    id: '$courtId-$start-${(day ?? _today).day}',
    arenaId: 'a1',
    courtId: courtId,
    date: day ?? _today,
    startTime: start,
    endTime: end,
    rawStatus: status,
    priceReais: price,
  );
}

class _Host extends StatefulWidget {
  const _Host({required this.arena});

  final ArenaListItem arena;

  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  ArenaDetailAgendaReport? _report;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Expanded(
            child: ListView(
              children: [
                ArenaDetailAgenda(
                  arena: widget.arena,
                  clock: () => _now,
                  onReport: (r) => setState(() => _report = r),
                ),
              ],
            ),
          ),
          ArenaDetailBottomCta(
            onPressed: () {},
            entryPricePerHour: 90,
            selection: _report?.selection,
          ),
        ],
      ),
    );
  }
}

class _Navigation {
  final confirms = <ArenaBookingConfirmArgs>[];
  final slotsQueries = <Map<String, String>>[];
}

Future<_Navigation> _pump(
  WidgetTester tester, {
  ArenaListItem arena = _courtArena,
  required List<ArenaSlot> slots,
  List<ArenaPeakRule> peakRules = const [],
}) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await initializeDateFormatting('pt_BR');

  final nav = _Navigation();
  final router = GoRouter(
    initialLocation: '/host',
    routes: [
      GoRoute(path: '/host', builder: (_, _) => _Host(arena: arena)),
      GoRoute(
        path: AppRoutes.arenaBookingConfirm,
        name: AppRouteNames.arenaBookingConfirm,
        builder: (context, state) {
          nav.confirms.add(state.extra! as ArenaBookingConfirmArgs);
          return const Scaffold(body: Text('confirmação'));
        },
      ),
      GoRoute(
        path: AppRoutes.arenaSlots,
        name: AppRouteNames.arenaSlots,
        builder: (context, state) {
          nav.slotsQueries.add(state.uri.queryParameters);
          return const Scaffold(body: Text('grade'));
        },
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        courtsStreamProvider.overrideWith((ref, id) => Stream.value(_courts)),
        arenaRangeSlotsProvider.overrideWith((ref, p) => Stream.value(slots)),
        arenaPeakRulesProvider.overrideWith(
          (ref, id) => Stream.value(peakRules),
        ),
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        slotVacancyAlertActiveProvider.overrideWith(
          (ref, key) => Stream.value(false),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
  return nav;
}

void main() {
  testWidgets('shows free times by period with the cheapest price',
      (tester) async {
    await _pump(
      tester,
      slots: [
        _slot('q1', '19:00', '20:00', price: 120),
        _slot('q2', '19:00', '20:00', price: 90),
        _slot('q1', '20:00', '21:00', status: 'booked'),
        _slot('q2', '20:00', '21:00', status: 'booked'),
      ],
    );

    expect(find.text('Horários'), findsOneWidget);
    expect(find.text('NOITE · 1 LIVRE'), findsOneWidget);
    expect(find.text('19:00'), findsOneWidget);
    expect(find.textContaining('90'), findsWidgets);
    expect(find.text('lotado'), findsOneWidget);
    expect(find.text('Reservar'), findsNothing);
  });

  testWidgets('picking a time turns the bar into "Reservar" and books it',
      (tester) async {
    final nav = await _pump(
      tester,
      slots: [
        _slot('q1', '19:00', '20:00', price: 120),
        _slot('q2', '19:00', '20:00', price: 90),
      ],
    );

    await tester.tap(find.text('19:00'));
    await tester.pump();
    await tester.pump();

    expect(find.text('Reservar'), findsOneWidget);
    expect(find.textContaining('19:00–20:00'), findsOneWidget);
    expect(find.textContaining('Quadra 2'), findsOneWidget);

    await tester.tap(find.text('Reservar'));
    await tester.pumpAndSettle();

    final args = nav.confirms.single;
    expect(args.courtId, 'q2');
    expect(args.courtName, 'Quadra 2');
    expect(args.amountReais, 90);
    expect(args.startTime, '19:00');
    expect(args.endTime, '20:00');
    expect(args.selectedSlotStartTimes, ['19:00']);
    expect(args.date, _today);
    expect(args.capacity, isFalse);
  });

  testWidgets('tapping the picked time again clears it', (tester) async {
    await _pump(tester, slots: [_slot('q1', '19:00', '20:00')]);

    await tester.tap(find.text('19:00'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Reservar'), findsOneWidget);

    await tester.tap(find.text('19:00'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Reservar'), findsNothing);
    expect(find.text('Ver horários'), findsOneWidget);
  });

  testWidgets('a peak rule sends the time to the full grid', (tester) async {
    final nav = await _pump(
      tester,
      slots: [
        _slot('q1', '20:00', '21:00'),
        _slot('q1', '21:00', '22:00'),
      ],
      peakRules: const [
        ArenaPeakRule(
          id: 'pico',
          active: true,
          label: 'Pico',
          courtIds: [],
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          startTime: '20:00',
          endTime: '21:00',
          minDurationMinutes: 120,
        ),
      ],
    );

    await tester.tap(find.text('20:00'));
    await tester.pump();
    await tester.pump();
    await tester.tap(find.text('Reservar'));
    await tester.pumpAndSettle();

    expect(nav.confirms, isEmpty);
    final query = nav.slotsQueries.single;
    expect(query['courtId'], 'q1');
    expect(query['startTime'], '20:00');
    expect(query['date'], '2030-11-08');
  });

  testWidgets('a full day offers the alert and the next open day',
      (tester) async {
    await _pump(
      tester,
      slots: [
        _slot('q1', '19:00', '20:00', status: 'booked'),
        _slot('q2', '19:00', '20:00', status: 'booked'),
        _slot('q1', '19:00', '20:00', day: DateTime(2030, 11, 10)),
      ],
    );

    expect(find.text('Este dia lotou'), findsOneWidget);
    expect(find.text('Avise-me se abrir vaga'), findsOneWidget);
    expect(find.text('Ver dom, 10'), findsOneWidget);

    await tester.tap(find.text('Ver dom, 10'));
    await tester.pump();
    await tester.pump();

    expect(find.text('Este dia lotou'), findsNothing);
    expect(find.text('19:00'), findsOneWidget);
  });

  testWidgets('capacity arena books the time without a court', (tester) async {
    final nav = await _pump(
      tester,
      arena: _capacityArena,
      slots: [
        _slot('q1', '18:00', '19:00'),
        _slot('q2', '18:00', '19:00', status: 'booked'),
      ],
    );

    expect(
      find.text('Você reserva o horário; a arena define a quadra.'),
      findsOneWidget,
    );
    await tester.tap(find.text('18:00'));
    await tester.pump();
    await tester.pump();
    expect(find.textContaining('A arena define a quadra'), findsOneWidget);

    await tester.tap(find.text('Reservar'));
    await tester.pumpAndSettle();

    final args = nav.confirms.single;
    expect(args.capacity, isTrue);
    expect(args.courtId, '');
    expect(args.sport, 'beachTennis');
    expect(args.amountReais, 120);
  });
}
