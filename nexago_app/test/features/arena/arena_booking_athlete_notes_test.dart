// Recado do atleta para a arena (`athleteNotes`, gravado por
// `createArenaBooking`): a arena lê no detalhe da reserva e no horário da
// agenda. Sem recado, nada aparece.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_labels.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_court_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/comandas/arena_comanda_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_args.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/arena_booking_details_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_slot_detail_page.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

import 'aulas/fake_arena_class_repository.dart';

const _notes = 'Vamos chegar 10 min antes.\nPrecisamos de bola nova.';

const Map<String, dynamic> _withNotes = {
  'status': 'active',
  'athleteId': 'ath1',
  'attendanceStatus': 'pending',
  'paymentStatus': 'pending',
  'amountReais': 120,
  'athleteNotes': _notes,
};

const Map<String, dynamic> _withoutNotes = {
  'status': 'active',
  'athleteId': 'ath1',
  'attendanceStatus': 'pending',
  'paymentStatus': 'pending',
  'amountReais': 120,
};

ArenaManagerBooking _booking(Map<String, dynamic> data) => ArenaManagerBooking(
      id: 'b1',
      athleteId: 'ath1',
      courtId: 'q1',
      courtName: 'Quadra 1',
      dateKey: '2026-10-21',
      startTime: '19:00',
      endTime: '20:00',
      data: data,
    );

List<Override> _athleteOverrides() => [
      for (final id in ['', 'ath1']) ...[
        athleteDisplayLabelProvider(id).overrideWith(
          (ref) async => 'Rafael Cunha',
        ),
        athleteProfileByIdProvider(id).overrideWith(
          (ref) => Stream.value(null),
        ),
      ],
    ];

Future<void> _pumpDetails(
  WidgetTester tester,
  Map<String, dynamic> data,
) async {
  tester.view.physicalSize = const Size(1200, 4800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final booking = _booking(data);
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => ArenaBookingDetailsPage(
          bookingId: booking.id,
          initialBooking: booking,
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  const historyArgs = AthleteArenaHistoryArgs(athleteId: 'ath1', arenaId: 'a1');
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...arenaAccessOverrides(ArenaStaffRole.recepcao),
        ..._athleteOverrides(),
        arenaBookingDetailMapProvider(booking.id).overrideWith(
          (ref) => Stream.value(data),
        ),
        arenaManagedCourtsProvider.overrideWith(
          (ref) => Stream.value(const []),
        ),
        athleteArenaHistoryProvider(historyArgs).overrideWith(
          (ref) => Stream.value(const <ArenaManagerBooking>[]),
        ),
        arenaAthleteBlockProvider(historyArgs).overrideWith(
          (ref) => Stream.value(const ArenaAthleteBlockInfo(isBlocked: false)),
        ),
        arenaComandaByBookingIdStreamProvider.overrideWith(
          (ref, _) => Stream.value(null),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

Future<void> _pumpSlot(WidgetTester tester, Map<String, dynamic> data) async {
  tester.view.physicalSize = const Size(2400, 4800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final slot = ArenaSlot(
    id: 'v_slot',
    arenaId: 'a1',
    courtId: 'q1',
    date: DateTime(2026, 10, 21),
    startTime: '19:00',
    endTime: '20:00',
    rawStatus: 'booked',
    isVirtual: true,
    bookingId: 'b1',
    bookingAthleteId: 'ath1',
  );
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (_, __) => ArenaSlotDetailPage(
          args: ArenaSlotDetailArgs(slot: slot, courtName: 'Quadra 1'),
        ),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...arenaAccessOverrides(ArenaStaffRole.recepcao),
        ..._athleteOverrides(),
        arenaManagerBookingsStreamProvider.overrideWith(
          (ref) => Stream.value(const []),
        ),
        arenaBookingDetailMapProvider('b1').overrideWith(
          (ref) => Stream.value(data),
        ),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('arenaBookingAthleteNotes', () {
    test('lê o recado aparado', () {
      expect(
        arenaBookingAthleteNotes(const {'athleteNotes': '  Traz bola?  '}),
        'Traz bola?',
      );
    });

    test('sem recado, vazio ou tipo errado → null', () {
      expect(arenaBookingAthleteNotes(null), isNull);
      expect(arenaBookingAthleteNotes(const {}), isNull);
      expect(arenaBookingAthleteNotes(const {'athleteNotes': '   '}), isNull);
      expect(arenaBookingAthleteNotes(const {'athleteNotes': 42}), isNull);
    });
  });

  testWidgets('detalhe da reserva mostra o recado do atleta', (tester) async {
    await _pumpDetails(tester, _withNotes);

    expect(
        find.byKey(const Key('arena-booking-athlete-notes')), findsOneWidget);
    expect(find.text('Recado do atleta'), findsOneWidget);
    expect(find.text(_notes), findsOneWidget);
  });

  testWidgets('detalhe da reserva sem recado não mostra o card',
      (tester) async {
    await _pumpDetails(tester, _withoutNotes);

    expect(find.byKey(const Key('arena-booking-athlete-notes')), findsNothing);
    expect(find.text('Recado do atleta'), findsNothing);
  });

  testWidgets('horário da agenda mostra o recado do atleta', (tester) async {
    await _pumpSlot(tester, _withNotes);

    expect(find.byKey(const Key('arena-slot-athlete-notes')), findsOneWidget);
    expect(find.text('Recado do atleta'), findsOneWidget);
    expect(find.text(_notes), findsOneWidget);
  });

  testWidgets('horário da agenda sem recado não mostra a linha',
      (tester) async {
    await _pumpSlot(tester, _withoutNotes);

    expect(find.byKey(const Key('arena-slot-athlete-notes')), findsNothing);
  });
}
