// Aba Reservas nova (modelo A): linha de atalhos com as permissões de antes,
// card com ações rápidas por cargo, linha do dia e botão "Nova reserva".
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_day_timeline.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_day_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_club.dart';
import 'package:nexago_app/features/arena/domain/arena_club_admin_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_recurring_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_recurring_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_slot_detail_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_providers.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_session.dart';
import 'package:nexago_app/features/arena/presentation/arena_bookings_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_booking_card.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

List<Override> _role(ArenaStaffRole role) {
  final membership = ArenaMembership(
    arenaId: 'a1',
    name: 'Vegeton',
    isOwner: false,
    role: role,
  );
  return [
    ownedArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value(const <ArenaMembership>[]),
    ),
    staffArenaMembershipsProvider.overrideWith(
      (ref) => Stream.value([membership]),
    ),
  ];
}

ArenaRecurringBooking _series(String id) => ArenaRecurringBooking(
      id: id,
      arenaId: 'a1',
      arenaName: 'Vegeton',
      courtId: 'q1',
      courtName: 'Quadra 1',
      weekday: 4,
      startTime: '18:00',
      endTime: '19:00',
      amountReais: 80,
      status: 'active',
      startDate: '2026-01-01',
      skippedDates: const [],
    );

final _now = DateTime(2026, 11, 18, 18, 40);

ArenaManagerBooking _booking(
  String id,
  String start,
  String end, {
  Map<String, dynamic> data = const {},
}) =>
    ArenaManagerBooking(
      id: id,
      athleteId: 'ath1',
      courtId: 'q2',
      courtName: 'Quadra 2',
      dateKey: '2026-11-18',
      startTime: start,
      endTime: end,
      data: {'status': 'active', 'athleteId': 'ath1', ...data},
    );

List<Override> _athlete() => [
      athleteDisplayLabelProvider('ath1').overrideWith(
        (ref) async => 'Lucas Andrade',
      ),
      athleteProfileByIdProvider('ath1').overrideWith(
        (ref) => Stream.value(null),
      ),
    ];

Future<void> _pumpPage(
  WidgetTester tester,
  ArenaStaffRole role, {
  List<ArenaTimelineEntry> timeline = const [],
  List<ArenaRecurringBooking> series = const [],
}) async {
  tester.view.physicalSize = const Size(402, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ..._role(role),
        ..._athlete(),
        managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
        arenaBookingsTodayTimelineProvider.overrideWith(
          (ref) => AsyncValue.data(timeline),
        ),
        arenaBookingsTodaySummaryProvider.overrideWith((ref) => null),
        arenaBookingsTodayInsightProvider.overrideWith((ref) => null),
        arenaManagerBookingsStreamProvider.overrideWith(
          (ref) => Stream.value(const <ArenaManagerBooking>[]),
        ),
        arenaActiveRecurringSeriesProvider.overrideWith(
          (ref) => Stream.value(series),
        ),
        managedArenaClubsProvider.overrideWith(
          (ref) => Stream.value(const <ArenaClub>[]),
        ),
        managedArenaClassesProvider.overrideWith(
          (ref) => Stream.value(const <ArenaClass>[]),
        ),
        arenaClassSessionsOnDayProvider.overrideWith(
          (ref, dateKey) => Stream.value(const <ArenaClassSession>[]),
        ),
      ],
      child: MaterialApp(theme: AppTheme.dark, home: const ArenaBookingsPage()),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
}

Future<void> _pumpCard(
  WidgetTester tester,
  ArenaStaffRole role,
  ArenaManagerBooking booking, {
  ArenaTimelinePhase phase = ArenaTimelinePhase.upcoming,
  bool showActions = true,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [..._role(role), ..._athlete()],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: ArenaBookingCard(
            booking: booking,
            now: _now,
            phase: phase,
            showActions: showActions,
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('linha de atalhos', () {
    testWidgets('recepção vê os três atalhos, um ao lado do outro',
        (tester) async {
      await _pumpPage(tester, ArenaStaffRole.recepcao);
      final aulas = find.byKey(const Key('arena-bookings-shortcut-aulas'));
      final fixos = find.byKey(const Key('arena-bookings-shortcut-fixos'));
      final clubinho =
          find.byKey(const Key('arena-bookings-shortcut-clubinho'));
      expect(aulas, findsOneWidget);
      expect(fixos, findsOneWidget);
      expect(clubinho, findsOneWidget);
      // Uma linha só: mesma altura na tela.
      expect(tester.getTopLeft(aulas).dy, tester.getTopLeft(fixos).dy);
      expect(tester.getTopLeft(fixos).dy, tester.getTopLeft(clubinho).dy);
    });

    testWidgets('quem só lê a agenda vê só Aulas, na largura toda',
        (tester) async {
      await _pumpPage(tester, ArenaStaffRole.manutencao);
      final aulas = find.byKey(const Key('arena-bookings-shortcut-aulas'));
      expect(aulas, findsOneWidget);
      expect(
          find.byKey(const Key('arena-bookings-shortcut-fixos')), findsNothing);
      expect(
        find.byKey(const Key('arena-bookings-shortcut-clubinho')),
        findsNothing,
      );
      expect(tester.getSize(aulas).width, greaterThan(300));
    });

    testWidgets('contador aparece com valor e some quando é zero',
        (tester) async {
      await _pumpPage(
        tester,
        ArenaStaffRole.recepcao,
        series: [_series('s1'), _series('s2')],
      );
      expect(find.text('2 ativos'), findsOneWidget);
      // Clubinho e Aulas sem nada: só o rótulo.
      expect(find.text('0 ativos'), findsNothing);
      expect(find.text('0 hoje'), findsNothing);
    });

    testWidgets('não há menu ⋯ no topo', (tester) async {
      await _pumpPage(tester, ArenaStaffRole.recepcao);
      expect(find.byIcon(Icons.more_horiz_rounded), findsNothing);
      expect(find.byIcon(Icons.more_vert_rounded), findsNothing);
    });
  });

  group('Nova reserva', () {
    testWidgets('aparece para quem escreve na agenda', (tester) async {
      await _pumpPage(tester, ArenaStaffRole.recepcao);
      expect(find.byKey(const Key('arena-bookings-new')), findsOneWidget);
    });

    testWidgets('some para quem só lê', (tester) async {
      await _pumpPage(tester, ArenaStaffRole.manutencao);
      expect(find.byKey(const Key('arena-bookings-new')), findsNothing);
    });
  });

  group('linha do dia', () {
    testWidgets('mostra o marcador agora e a reserva em quadra',
        (tester) async {
      final live = _booking('live', '18:00', '19:30');
      final next = _booking('next', '19:00', '20:00');
      await _pumpPage(
        tester,
        ArenaStaffRole.recepcao,
        timeline: [
          ArenaTimelineBookingEntry(
            booking: live,
            phase: ArenaTimelinePhase.live,
            isToday: true,
            progress: 0.44,
            minutesLeft: 50,
          ),
          ArenaTimelineNowEntry(_now),
          ArenaTimelineBookingEntry(
            booking: next,
            phase: ArenaTimelinePhase.upcoming,
            isToday: true,
          ),
        ],
      );
      expect(
          find.byKey(const Key('arena-bookings-now-marker')), findsOneWidget);
      expect(find.text('18:40'), findsOneWidget);
      expect(find.text('Em quadra'), findsOneWidget);
      expect(find.text('termina em 50 min'), findsOneWidget);
    });

    testWidgets('concluída de hoje recolhe para uma linha', (tester) async {
      final done = _booking('done', '17:00', '18:00');
      await _pumpPage(
        tester,
        ArenaStaffRole.recepcao,
        timeline: [
          ArenaTimelineBookingEntry(
            booking: done,
            phase: ArenaTimelinePhase.done,
            isToday: true,
          ),
          ArenaTimelineNowEntry(_now),
        ],
      );
      expect(find.byKey(const Key('arena-booking-done-done')), findsOneWidget);
      expect(find.byKey(const Key('arena-booking-card-done')), findsNothing);
    });
  });

  group('card', () {
    final deposit = _booking(
      'b1',
      '19:00',
      '20:00',
      data: {
        'paymentChannel': 'pix',
        'paymentStatus': 'partial',
        'amountReais': 160,
        'amountPaidOnlineReais': 80,
        'confirmedParticipants': 4,
      },
    );

    testWidgets('separa pagamento e presença e mostra o que falta',
        (tester) async {
      await _pumpCard(tester, ArenaStaffRole.recepcao, deposit);
      expect(find.text('Sinal pago'), findsOneWidget);
      expect(find.text('Chega em 20 min'), findsOneWidget);
      expect(find.byKey(const Key('arena-booking-card-due')), findsOneWidget);
      expect(find.text('+3'), findsOneWidget);
      expect(find.text('–20:00 · 1h'), findsOneWidget);
      // O selo "ATIVA" saiu: só a cancelada ganha selo de status.
      expect(find.text('ATIVA'), findsNothing);
    });

    testWidgets('recepção vê Check-in, Receber e Conversar', (tester) async {
      await _pumpCard(tester, ArenaStaffRole.recepcao, deposit);
      expect(find.byKey(const Key('arena-booking-checkin-b1')), findsOneWidget);
      expect(find.byKey(const Key('arena-booking-receive-b1')), findsOneWidget);
      expect(find.byKey(const Key('arena-booking-talk-b1')), findsOneWidget);
    });

    testWidgets('manutenção só conversa (não escreve agenda nem comanda)',
        (tester) async {
      await _pumpCard(tester, ArenaStaffRole.manutencao, deposit);
      expect(find.byKey(const Key('arena-booking-checkin-b1')), findsNothing);
      expect(find.byKey(const Key('arena-booking-receive-b1')), findsNothing);
      expect(find.byKey(const Key('arena-booking-talk-b1')), findsOneWidget);
    });

    testWidgets('sem ações fora da linha de hoje', (tester) async {
      await _pumpCard(
        tester,
        ArenaStaffRole.recepcao,
        deposit,
        showActions: false,
      );
      expect(find.byKey(const Key('arena-booking-checkin-b1')), findsNothing);
      expect(find.byKey(const Key('arena-booking-talk-b1')), findsNothing);
    });

    testWidgets('bloqueio de aula: sem ações, selo Aula', (tester) async {
      final aula = _booking(
        'class_t1_2026-11-18',
        '20:00',
        '21:00',
        data: {'isClassSession': true, 'customerName': 'Turma iniciante'},
      );
      await _pumpCard(tester, ArenaStaffRole.recepcao, aula);
      expect(find.text('Aula'), findsOneWidget);
      expect(find.text('Turma iniciante'), findsOneWidget);
      expect(find.byType(FilledButton), findsNothing);
    });

    testWidgets('tocar no bloco de aula abre Aulas', (tester) async {
      final aula = _booking(
        'class_t1_2026-11-18',
        '20:00',
        '21:00',
        data: {'isClassSession': true, 'customerName': 'Turma iniciante'},
      );
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) => Scaffold(
              body: ArenaBookingCard(booking: aula, now: _now),
            ),
          ),
          GoRoute(
            path: '/arena/classes',
            name: AppRouteNames.arenaClasses,
            builder: (_, __) => const Scaffold(body: Text('tela de aulas')),
          ),
        ],
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: [..._role(ArenaStaffRole.recepcao), ..._athlete()],
          child: MaterialApp.router(
            theme: AppTheme.dark,
            routerConfig: router,
          ),
        ),
      );
      await tester.pump();
      await tester.tap(find.text('Turma iniciante'));
      await tester.pumpAndSettle();
      expect(find.text('tela de aulas'), findsOneWidget);
    });
  });
}
