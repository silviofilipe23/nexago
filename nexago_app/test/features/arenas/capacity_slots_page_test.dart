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
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/arenas_providers.dart';
import 'package:nexago_app/features/arenas/domain/slots_providers.dart';
import 'package:nexago_app/features/arenas/presentation/capacity_slots_view.dart';
import 'package:nexago_app/features/arenas/presentation/slots_page.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

/// Fiação da tela de horários numa arena "a arena define a quadra": a rota de sempre abre a
/// grade por horário e a confirmação recebe a reserva sem quadra.
final day = DateTime(2030, 11, 8);

const arena = ArenaListItem(
  id: 'a1',
  name: 'Arena CFC',
  locationLabel: 'Goiânia, GO',
  pricePerHourReais: 70,
  bookingAllocation: ArenaBookingAllocation(
    isCapacity: true,
    courtIds: ['q1', 'q2', 'q3'],
    priceBySport: {'beachTennis': 120},
  ),
);

ArenaSlot slot(String courtId, String start, String end, String status) => ArenaSlot(
      id: '$courtId-$start',
      arenaId: 'a1',
      courtId: courtId,
      date: day,
      startTime: start,
      endTime: end,
      rawStatus: status,
    );

const _oneSportCourts = [
  ArenaCourt(id: 'q1', name: 'Quadra 1', sportTypes: ['beachTennis']),
  ArenaCourt(id: 'q2', name: 'Quadra 2', sportTypes: ['beachTennis']),
  ArenaCourt(id: 'q3', name: 'Quadra 3', sportTypes: ['beachTennis']),
];

AthleteProfile athlete(String? primarySport) => AthleteProfile(
      id: 'u1',
      name: 'Atleta',
      sport: '',
      level: '',
      city: '',
      primarySportFirestoreId: primarySport,
    );

Future<List<Object?>> pumpSlots(
  WidgetTester tester, {
  ArenaListItem arenaItem = arena,
  List<ArenaCourt> courts = _oneSportCourts,
  String? primarySport,
  String? initialSport,
}) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await initializeDateFormatting('pt_BR');

  final confirmExtras = <Object?>[];
  final router = GoRouter(
    initialLocation: '/arena/a1/slots',
    routes: [
      GoRoute(
        path: AppRoutes.arenaSlots,
        name: AppRouteNames.arenaSlots,
        builder: (context, state) => SlotsPage(arenaId: 'a1', initialDate: day, initialSport: initialSport),
      ),
      GoRoute(
        path: AppRoutes.arenaBookingConfirm,
        name: AppRouteNames.arenaBookingConfirm,
        builder: (context, state) {
          confirmExtras.add(state.extra);
          return const Scaffold(body: Text('confirmação'));
        },
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        arenaByIdProvider.overrideWith((ref, id) => Stream.value(arenaItem)),
        courtsStreamProvider.overrideWith((ref, id) => Stream.value(courts)),
        athleteProfileProvider.overrideWith((ref) => Stream.value(athlete(primarySport))),
        arenaDaySlotsProvider.overrideWith(
          (ref, params) => Stream.value([
            slot('q1', '18:00', '19:00', 'available'),
            slot('q2', '18:00', '19:00', 'booked'),
            slot('q3', '18:00', '19:00', 'available'),
            slot('q1', '19:00', '20:00', 'booked'),
            slot('q2', '19:00', '20:00', 'booked'),
            slot('q3', '19:00', '20:00', 'blocked'),
          ]),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
  return confirmExtras;
}

void main() {
  testWidgets('arena que define a quadra abre a grade por horário, sem seletor de quadra', (tester) async {
    await pumpSlots(tester);

    expect(find.byType(CapacitySlotsView), findsOneWidget);
    expect(find.textContaining('A equipe da arena indica a quadra'), findsOneWidget);
    expect(find.text('Quadra 1'), findsNothing);
    expect(find.textContaining('120 · 2 quadras livres'), findsOneWidget);
    expect(find.text('LOTADO'), findsOneWidget);
  });

  testWidgets('continuar leva a confirmação sem quadra, com esporte e preço do horário', (tester) async {
    final extras = await pumpSlots(tester);

    await tester.tap(find.text('18:00 - 19:00'));
    await tester.pump();
    await tester.tap(find.text('Continuar'));
    await tester.pumpAndSettle();

    final args = extras.single as ArenaBookingConfirmArgs;
    expect(args.capacity, isTrue);
    expect(args.courtId, isEmpty);
    expect(args.sport, 'beachTennis');
    expect(args.amountReais, 120);
    expect(args.startTime, '18:00');
    expect(args.endTime, '19:00');
    expect(args.selectedSlotStartTimes, ['18:00']);
    expect(args.isValid, isTrue);
  });

  testWidgets('horário lotado não seleciona', (tester) async {
    final extras = await pumpSlots(tester);

    await tester.tap(find.text('19:00 - 20:00'));
    await tester.pump();
    await tester.tap(find.text('Continuar'));
    await tester.pumpAndSettle();

    expect(extras, isEmpty);
  });

  group('esportes', () {
    const multiArena = ArenaListItem(
      id: 'a1',
      name: 'Arena CFC',
      locationLabel: 'Goiânia, GO',
      pricePerHourReais: 70,
      bookingAllocation: ArenaBookingAllocation(
        isCapacity: true,
        courtIds: ['q1', 'q2', 'q3'],
        priceBySport: {
          'beachTennis': 120,
          'beachVolleyball': 100,
          'footvolley': 90,
          'padel': 150,
          'tennis': 110,
        },
      ),
    );
    const multiCourts = [
      ArenaCourt(id: 'q1', name: 'Quadra 1'),
      ArenaCourt(id: 'q2', name: 'Quadra 2'),
      ArenaCourt(id: 'q3', name: 'Quadra 3'),
    ];

    List<String> chipLabels(WidgetTester tester) => [
          for (final chip in tester.widgetList<ChoiceChip>(
            find.descendant(of: find.byKey(const Key('capacity-sports')), matching: find.byType(ChoiceChip)),
          ))
            ((chip.label as Text).data ?? ''),
        ];

    ChoiceChip chip(WidgetTester tester, String label) =>
        tester.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, label));

    testWidgets('todos numa linha com rolagem horizontal', (tester) async {
      await pumpSlots(tester, arenaItem: multiArena, courts: multiCourts);
      tester.view.physicalSize = const Size(360, 2400);
      await tester.pump();

      final scroll = tester.widget<SingleChildScrollView>(find.byKey(const Key('capacity-sports')));
      expect(scroll.scrollDirection, Axis.horizontal);
      expect(chipLabels(tester), hasLength(5));
      final ys = {
        for (final c in find.descendant(of: find.byKey(const Key('capacity-sports')), matching: find.byType(ChoiceChip)).evaluate())
          tester.getTopLeft(find.byWidget(c.widget)).dy,
      };
      expect(ys, hasLength(1), reason: 'uma linha só');
      expect(tester.takeException(), isNull);
    });

    testWidgets('esporte principal do atleta vem primeiro e selecionado', (tester) async {
      // Grafia do perfil (`primarySportId`), não o código da reserva.
      final extras = await pumpSlots(tester, arenaItem: multiArena, courts: multiCourts, primarySport: 'PADEL');

      expect(chipLabels(tester).first, 'Padel');
      expect(chip(tester, 'Padel').selected, isTrue);
      expect(chip(tester, 'Beach tennis').selected, isFalse);
      expect(find.textContaining('150 · '), findsWidgets);

      await tester.tap(find.text('18:00 - 19:00'));
      await tester.pump();
      await tester.tap(find.text('Continuar'));
      await tester.pumpAndSettle();
      expect((extras.single as ArenaBookingConfirmArgs).sport, 'padel');
    });

    testWidgets('principal que a arena não oferece: fica o primeiro da arena', (tester) async {
      await pumpSlots(tester, arenaItem: multiArena, courts: multiCourts, primarySport: 'VOLEI_QUADRA');

      expect(chipLabels(tester).first, 'Beach tennis');
      expect(chip(tester, 'Beach tennis').selected, isTrue);
    });

    testWidgets('trocar o esporte continua valendo', (tester) async {
      await pumpSlots(tester, arenaItem: multiArena, courts: multiCourts, primarySport: 'PADEL');

      await tester.tap(find.widgetWithText(ChoiceChip, 'Beach tennis'));
      await tester.pump();
      expect(chip(tester, 'Beach tennis').selected, isTrue);
      expect(chip(tester, 'Padel').selected, isFalse);
    });

    testWidgets('esporte escolhido no perfil da arena vence o principal do atleta', (tester) async {
      await pumpSlots(
        tester,
        arenaItem: multiArena,
        courts: multiCourts,
        primarySport: 'PADEL',
        initialSport: 'beachVolleyball',
      );

      expect(chip(tester, 'Vôlei de praia').selected, isTrue);
      expect(chip(tester, 'Padel').selected, isFalse);
    });
  });
}
