// Reserva feita como professor (`createArenaBooking` com `asProfessor`, PR
// #798): o servidor carimba `bookedAs: "professor"` e a arena vê o selo no
// card, no detalhe, no horário da agenda e no resumo da grade.
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
import 'package:nexago_app/features/arena/domain/arena_schedule_grouping.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_args.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/arena_booking_details_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_slot_detail_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_card.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

import 'aulas/fake_arena_class_repository.dart';

const Map<String, dynamic> _professorData = {
  'status': 'active',
  'athleteId': 'ath1',
  'attendanceStatus': 'pending',
  'paymentStatus': 'pending',
  'amountReais': 120,
  'sport': 'beachTennis',
  'bookedAs': 'professor',
  'professorLinkId': 'a1_ath1',
  'professorRelationshipType': 'INDEPENDENT',
  // Desconto do vínculo aplicado (gravado só quando venceu promoção/cupom).
  'professorDiscountPercent': 20,
  'professorDiscountReais': 30,
};

const _professorBooking = ArenaManagerBooking(
  id: 'b-prof',
  athleteId: 'ath1',
  courtId: 'q1',
  courtName: 'Quadra 1',
  dateKey: '2026-10-21',
  startTime: '07:00',
  endTime: '08:00',
  data: _professorData,
);

const _athleteBooking = ArenaManagerBooking(
  id: 'b-ath',
  athleteId: 'ath1',
  courtId: 'q1',
  courtName: 'Quadra 1',
  dateKey: '2026-10-21',
  startTime: '09:00',
  endTime: '10:00',
  data: {'status': 'active', 'attendanceStatus': 'pending'},
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

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('rótulo', () {
    test('tipo do vínculo no carimbo; reserva de atleta fica sem', () {
      expect(
        arenaBookingProfessorLabel(_professorData),
        'Professor · independente',
      );
      expect(
        arenaBookingProfessorLabel(const {
          'bookedAs': 'professor',
          'professorRelationshipType': 'ARENA_STAFF',
        }),
        'Professor · equipe da arena',
      );
      expect(
        arenaBookingProfessorLabel(const {'bookedAs': 'professor'}),
        'Professor',
      );
      expect(arenaBookingProfessorLabel(_athleteBooking.data), isNull);
      expect(arenaBookingProfessorLabel(const {'bookedAs': 'athlete'}), isNull);
      expect(arenaBookingProfessorLabel(null), isNull);
      expect(_professorBooking.bookedAsProfessor, isTrue);
      expect(_athleteBooking.bookedAsProfessor, isFalse);
    });

    test('desconto de professor: só na reserva de professor com % > 0', () {
      expect(
        arenaBookingProfessorDiscountLabel(_professorData),
        'Desconto professor \u221220%',
      );
      expect(_professorBooking.professorDiscountPercent, 20);
      expect(_athleteBooking.professorDiscountPercent, 0);
      expect(
        arenaBookingProfessorDiscountLabel(const {'bookedAs': 'professor'}),
        isNull,
      );
      expect(
        arenaBookingProfessorDiscountLabel(const {
          'bookedAs': 'professor',
          'professorDiscountPercent': 0,
        }),
        isNull,
      );
      expect(
        arenaBookingProfessorDiscountLabel(const {
          'bookedAs': 'athlete',
          'professorDiscountPercent': 20,
        }),
        isNull,
      );
      expect(arenaBookingProfessorDiscountLabel(null), isNull);
    });

    test('resumo da grade marca a reserva de professor', () {
      final lookup = ArenaScheduleGrouping.bookingLookup(
        const [_professorBooking, _athleteBooking],
      );
      expect(lookup['b-prof']!.asProfessor, isTrue);
      expect(lookup['b-ath']!.asProfessor, isFalse);
    });
  });

  group('card da lista de reservas', () {
    Future<void> pumpCard(WidgetTester tester, ArenaManagerBooking b) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: _athleteOverrides(),
          child: MaterialApp(
            theme: AppTheme.dark,
            home: Scaffold(body: ArenaBookingCard(booking: b)),
          ),
        ),
      );
      await tester.pump();
    }

    testWidgets('reserva de professor mostra o selo', (tester) async {
      await pumpCard(tester, _professorBooking);
      expect(find.text('Professor · independente'), findsOneWidget);
    });

    testWidgets('reserva de atleta segue sem selo', (tester) async {
      await pumpCard(tester, _athleteBooking);
      expect(find.textContaining('Professor'), findsNothing);
    });
  });

  testWidgets('detalhe da reserva mostra que foi como professor',
      (tester) async {
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => ArenaBookingDetailsPage(
            bookingId: _professorBooking.id,
            initialBooking: _professorBooking,
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    const historyArgs =
        AthleteArenaHistoryArgs(athleteId: 'ath1', arenaId: 'a1');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...arenaAccessOverrides(ArenaStaffRole.recepcao),
          ..._athleteOverrides(),
          arenaBookingDetailMapProvider(_professorBooking.id).overrideWith(
            (ref) => Stream.value(null),
          ),
          arenaManagedCourtsProvider.overrideWith(
            (ref) => Stream.value(const []),
          ),
          athleteArenaHistoryProvider(historyArgs).overrideWith(
            (ref) => Stream.value(const <ArenaManagerBooking>[]),
          ),
          arenaAthleteBlockProvider(historyArgs).overrideWith(
            (ref) =>
                Stream.value(const ArenaAthleteBlockInfo(isBlocked: false)),
          ),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byKey(const Key('arena-booking-professor')), findsOneWidget);
    expect(find.text('Professor · independente'), findsOneWidget);
    expect(
      find.byKey(const Key('arena-booking-professor-discount')),
      findsOneWidget,
    );
    expect(find.text('Desconto professor \u221220%'), findsOneWidget);
  });

  testWidgets('horário da agenda: "Reservado como" professor', (tester) async {
    tester.view.physicalSize = const Size(2400, 4800);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final slot = ArenaSlot(
      id: 'v_slot',
      arenaId: 'a1',
      courtId: 'q1',
      date: DateTime(2026, 10, 21),
      startTime: '07:00',
      endTime: '08:00',
      rawStatus: 'booked',
      isVirtual: true,
      bookingId: _professorBooking.id,
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
          arenaBookingDetailMapProvider(_professorBooking.id).overrideWith(
            (ref) => Stream.value(_professorData),
          ),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text('Reservado como'), findsOneWidget);
    expect(find.text('Professor · independente'), findsOneWidget);
    expect(
      find.byKey(const Key('arena-slot-professor-discount')),
      findsOneWidget,
    );
    expect(find.text('Desconto professor \u221220%'), findsOneWidget);
  });
}
