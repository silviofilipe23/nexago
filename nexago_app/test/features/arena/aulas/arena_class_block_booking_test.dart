// Bloqueio de quadra de uma aula (`arenaBookings` com `isClassSession`): a rule
// do #758 recusa à equipe mudar o `status` dele, então o app não oferece
// cancelar nem check-in — oferece "Abrir aula", como o portal.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_labels.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_grouping.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_court_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_args.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/presentation/arena_booking_details_page.dart';
import 'package:nexago_app/features/arena/presentation/arena_slot_detail_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_card.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_detail_actions.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

import 'fake_arena_class_repository.dart';

const _sessionId = 'class_c5_2026-10-19';

/// Como o backend grava o bloqueio (`materializeClassSession`).
const Map<String, dynamic> _classBlockData = {
  'status': 'active',
  'athleteId': null,
  'customerName': 'Aula · Vôlei Avançado',
  'amountReais': 0,
  'paymentStatus': 'none',
  'attendanceStatus': 'pending',
  'attendanceConfirmed': false,
  'source': 'class',
  'isClassSession': true,
  'classId': 'c5',
  'classSessionId': _sessionId,
};

const _classBlock = ArenaManagerBooking(
  id: _sessionId,
  athleteId: '',
  courtId: 'q3',
  courtName: 'Quadra 3',
  dateKey: '2026-10-19',
  startTime: '18:00',
  endTime: '19:30',
  data: _classBlockData,
);

const _regular = ArenaManagerBooking(
  id: 'b1',
  athleteId: 'ath1',
  courtId: 'q1',
  courtName: 'Quadra 1',
  dateKey: '2026-10-19',
  startTime: '08:00',
  endTime: '09:00',
  data: {'status': 'active', 'attendanceStatus': 'pending'},
);

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('reconhecer o bloqueio de aula', () {
    test('isClassSession com classSessionId usa o id da aula', () {
      expect(arenaBookingClassSessionId('x', _classBlockData), _sessionId);
      expect(_classBlock.isClassBlock, isTrue);
      expect(_classBlock.classSessionId, _sessionId);
    });

    test('isClassSession sem classSessionId cai no id do booking', () {
      expect(
        arenaBookingClassSessionId(_sessionId, const {'isClassSession': true}),
        _sessionId,
      );
    });

    test('só classSessionId (sem a flag) também é bloqueio de aula', () {
      expect(
        arenaBookingClassSessionId('b', const {'classSessionId': ' s9 '}),
        's9',
      );
    });

    test('reserva comum não é bloqueio de aula', () {
      expect(arenaBookingClassSessionId('b1', _regular.data), isNull);
      expect(arenaBookingClassSessionId('b1', null), isNull);
      expect(
        arenaBookingClassSessionId('b1', const {'classSessionId': '  '}),
        isNull,
      );
      expect(_regular.isClassBlock, isFalse);
    });

    test('check-in nunca aparece no bloqueio de aula', () {
      expect(arenaBookingShowsCheckInAction(_classBlockData), isFalse);
      expect(
        arenaBookingShowsCheckInAction(const {'isClassSession': true}),
        isFalse,
      );
      expect(arenaBookingShowsCheckInAction(_regular.data), isTrue);
    });

    test('aula não entra na contagem de check-in pendente do dia', () {
      expect(
        ArenaBookingsGrouping.sectionSubtitleToday([_classBlock]),
        isNot(contains('check-in')),
      );
      expect(
        ArenaBookingsGrouping.sectionSubtitleToday([_classBlock, _regular]),
        contains('1 pendente check-in'),
      );
    });
  });

  /// Rota da chamada só para provar a navegação do "Abrir aula".
  GoRoute classRoute() => GoRoute(
        path: '/arena/classes/session/:sessionId',
        name: AppRouteNames.arenaClassSession,
        builder: (_, state) => Scaffold(
            body: Text('chamada ${state.pathParameters['sessionId']}')),
      );

  Future<void> pumpDetails(
    WidgetTester tester, {
    required ArenaManagerBooking booking,
    ArenaStaffRole role = ArenaStaffRole.recepcao,
  }) async {
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => ArenaBookingDetailsPage(
            bookingId: booking.id,
            initialBooking: booking,
          ),
        ),
        classRoute(),
      ],
    );
    addTearDown(router.dispose);
    const historyArgs =
        AthleteArenaHistoryArgs(athleteId: 'ath1', arenaId: 'a1');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...arenaAccessOverrides(role),
          arenaBookingDetailMapProvider(booking.id).overrideWith(
            (ref) => Stream.value(null),
          ),
          arenaManagedCourtsProvider.overrideWith(
            (ref) => Stream.value(const []),
          ),
          for (final id in ['', 'ath1']) ...[
            athleteDisplayLabelProvider(id).overrideWith(
              (ref) async => 'Atleta Teste',
            ),
            athleteProfileByIdProvider(id).overrideWith(
              (ref) => Stream.value(null),
            ),
          ],
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
  }

  group('detalhe da reserva', () {
    testWidgets('bloqueio de aula: sem cancelar nem check-in, com "Abrir aula"',
        (tester) async {
      await pumpDetails(tester, booking: _classBlock);

      expect(find.text('Aula (bloqueio da quadra)'), findsOneWidget);
      expect(find.text('Abrir aula'), findsOneWidget);
      expect(find.text('Check-in'), findsNothing);
      expect(find.text('Cancelar reserva'), findsNothing);
      expect(find.byType(ArenaBookingDetailActions), findsNothing);

      await tester.ensureVisible(find.text('Abrir aula'));
      await tester.tap(find.text('Abrir aula'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('chamada $_sessionId'), findsOneWidget);
    });

    testWidgets('manutenção também abre a aula (só leitura lá dentro)',
        (tester) async {
      await pumpDetails(
        tester,
        booking: _classBlock,
        role: ArenaStaffRole.manutencao,
      );
      expect(find.text('Abrir aula'), findsOneWidget);
      expect(find.text('Cancelar reserva'), findsNothing);
    });

    testWidgets('reserva comum segue com cancelar e check-in, sem "Abrir aula"',
        (tester) async {
      await pumpDetails(tester, booking: _regular);

      expect(find.text('Abrir aula'), findsNothing);
      expect(find.text('Check-in'), findsOneWidget);
      final actions = tester.widget<ArenaBookingDetailActions>(
        find.byType(ArenaBookingDetailActions),
      );
      expect(actions.onCancel, isNotNull);
    });
  });

  group('card da lista de reservas', () {
    Future<void> pumpCard(WidgetTester tester, ArenaManagerBooking b) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            for (final id in ['', 'ath1']) ...[
              athleteDisplayLabelProvider(id).overrideWith(
                (ref) async => 'Atleta Teste',
              ),
              athleteProfileByIdProvider(id).overrideWith(
                (ref) => Stream.value(null),
              ),
            ],
          ],
          child: MaterialApp(
            theme: AppTheme.dark,
            home: Scaffold(body: ArenaBookingCard(booking: b)),
          ),
        ),
      );
      await tester.pump();
    }

    testWidgets('bloqueio de aula mostra "Aula" e não o check-in pendente',
        (tester) async {
      await pumpCard(tester, _classBlock);
      expect(find.text('Aula'), findsOneWidget);
      expect(
        find.text(ArenaBookingsGrouping.attendanceChipLabel(_classBlock)),
        findsNothing,
      );
    });

    testWidgets('reserva comum segue com o chip de check-in', (tester) async {
      await pumpCard(tester, _regular);
      expect(find.text('Aula'), findsNothing);
      expect(
        find.text(ArenaBookingsGrouping.attendanceChipLabel(_regular)),
        findsOneWidget,
      );
    });
  });

  group('horário ocupado por aula na agenda', () {
    testWidgets('detalhe do horário leva à aula', (tester) async {
      // Tela alta: o card de detalhes fica no fim da lista (lazy).
      tester.view.physicalSize = const Size(2400, 4800);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final slot = ArenaSlot(
        id: 'v_slot',
        arenaId: 'a1',
        courtId: 'q3',
        date: DateTime(2026, 10, 19),
        startTime: '18:00',
        endTime: '19:30',
        rawStatus: 'booked',
        isVirtual: true,
        bookingId: _sessionId,
      );
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) => ArenaSlotDetailPage(
              args: ArenaSlotDetailArgs(slot: slot, courtName: 'Quadra 3'),
            ),
          ),
          classRoute(),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...arenaAccessOverrides(ArenaStaffRole.recepcao),
            arenaManagerBookingsStreamProvider.overrideWith(
              (ref) => Stream.value(const []),
            ),
            arenaBookingDetailMapProvider(_sessionId).overrideWith(
              (ref) => Stream.value(_classBlockData),
            ),
          ],
          child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));

      expect(find.text('Aula (bloqueio da quadra)'), findsOneWidget);
      await tester.ensureVisible(find.text('Abrir aula'));
      await tester.tap(find.text('Abrir aula'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('chamada $_sessionId'), findsOneWidget);
    });
  });
}
