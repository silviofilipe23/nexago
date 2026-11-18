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
import 'package:nexago_app/features/arena/domain/arena_bookings_filter.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_tasks.dart';
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
import 'package:nexago_app/features/arena/domain/arena_court_providers.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arena/domain/arena_free_windows.dart';
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
      for (final (id, name) in [
        ('ath1', 'Lucas Andrade'),
        ('ath2', 'Bia Souza'),
      ]) ...[
        athleteDisplayLabelProvider(id).overrideWith((ref) async => name),
        athleteProfileByIdProvider(id).overrideWith(
          (ref) => Stream.value(null),
        ),
      ],
    ];

Future<void> _pumpPage(
  WidgetTester tester,
  ArenaStaffRole role, {
  List<ArenaTimelineEntry> timeline = const [],
  List<ArenaRecurringBooking> series = const [],
  List<ArenaManagerBooking> bookings = const [],
  List<ArenaBookingTask> tasks = const [],
  AsyncValue<List<ArenaTimelineEntry>>? timelineAsync,
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
        arenaBookingsDayTimelineProvider.overrideWith(
          (ref) => timelineAsync ?? AsyncValue.data(timeline),
        ),
        arenaBookingsTasksProvider.overrideWith((ref) => tasks),
        arenaBookingsDaySummaryProvider.overrideWith((ref) => null),
        arenaBookingsStripSlotsProvider.overrideWith(
          (ref) => Stream.value(const <ArenaSlot>[]),
        ),
        arenaBookingsDayFreeWindowsProvider.overrideWith(
          (ref) => const <ArenaFreeWindow>[],
        ),
        arenaManagedCourtsProvider.overrideWith(
          (ref) => Stream.value(const <ArenaCourt>[]),
        ),
        arenaBookingsTodayInsightProvider.overrideWith((ref) => null),
        arenaManagerBookingsStreamProvider.overrideWith(
          (ref) => Stream.value(bookings),
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
    testWidgets('aparece no header para quem escreve na agenda',
        (tester) async {
      await _pumpPage(tester, ArenaStaffRole.recepcao);
      final button = find.byKey(const Key('arena-bookings-new'));
      expect(button, findsOneWidget);
      // No header, na linha do título (não é mais botão flutuante).
      expect(find.byType(FloatingActionButton), findsNothing);
      expect(
        tester.getCenter(button).dy,
        closeTo(tester.getCenter(find.text('Reservas')).dy, 4),
      );
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

  group('faixa de dias, livres, busca e filtros', () {
    ProviderContainer container(WidgetTester tester) =>
        ProviderScope.containerOf(
          tester.element(find.byType(ArenaBookingsPage)),
        );

    testWidgets('faixa tem 7 dias e o calendário; tocar troca o dia',
        (tester) async {
      await _pumpPage(tester, ArenaStaffRole.recepcao);
      final days = find.byWidgetPredicate(
        (w) =>
            w.key is ValueKey<String> &&
            (w.key! as ValueKey<String>)
                .value
                .startsWith('arena-bookings-day-'),
      );
      expect(days, findsNWidgets(7));
      expect(find.byKey(const Key('arena-bookings-calendar')), findsOneWidget);
      expect(find.text('HOJE'), findsOneWidget);

      await tester.tap(days.at(2));
      await tester.pump();
      final today = DateTime.now();
      expect(
        container(tester).read(arenaBookingsSelectedDayProvider),
        DateTime(today.year, today.month, today.day + 2),
      );
    });

    testWidgets('horário livre aparece com Divulgar', (tester) async {
      await _pumpPage(
        tester,
        ArenaStaffRole.recepcao,
        timeline: [
          ArenaTimelineNowEntry(_now),
          const ArenaTimelineFreeEntry(
            ArenaFreeWindow(
              startTime: '19:00',
              endTime: '21:00',
              courtIds: ['q1', 'q4'],
              courtNames: ['Quadra 1', 'Quadra 4'],
            ),
          ),
        ],
      );
      expect(find.textContaining('Livre 19h–21h'), findsOneWidget);
      expect(
        find.byKey(const Key('arena-bookings-share-free-19:00')),
        findsOneWidget,
      );
    });

    testWidgets('busca acha pelo nome em qualquer dia carregado',
        (tester) async {
      await _pumpPage(
        tester,
        ArenaStaffRole.recepcao,
        bookings: [
          _booking('b1', '19:00', '20:00'),
          ArenaManagerBooking(
            id: 'outro',
            athleteId: 'ath2',
            courtId: 'q1',
            courtName: 'Quadra 1',
            dateKey: '2026-11-20',
            startTime: '08:00',
            endTime: '09:00',
            data: const {'status': 'active', 'athleteId': 'ath2'},
          ),
        ],
      );
      await tester.tap(find.byKey(const Key('arena-bookings-search-toggle')));
      await tester.pump();
      expect(
          find.byKey(const Key('arena-bookings-search-field')), findsOneWidget);

      await tester.enterText(
        find.byKey(const Key('arena-bookings-search-field')),
        'lúcas',
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byKey(const Key('arena-booking-card-b1')), findsOneWidget);
      expect(find.byKey(const Key('arena-booking-card-outro')), findsNothing);
      // Com resultado na tela, a faixa de dias sai.
      expect(find.byKey(const Key('arena-bookings-calendar')), findsNothing);

      await tester.enterText(
        find.byKey(const Key('arena-bookings-search-field')),
        'ninguem',
      );
      await tester.pump();
      expect(find.text('Nenhuma reserva encontrada'), findsOneWidget);
      // Deixa a entrada dos cards (FadeSlideIn) terminar.
      await tester.pump(const Duration(seconds: 1));
    });

    testWidgets('filtro mostra o selo e, sem resultado, oferece limpar',
        (tester) async {
      await _pumpPage(tester, ArenaStaffRole.recepcao);
      await tester.tap(find.byKey(const Key('arena-bookings-filter')));
      await tester.pumpAndSettle();
      expect(find.text('Filtrar reservas'), findsOneWidget);
      await tester.tap(find.text('Falta receber'));
      await tester.pump();
      await tester.tap(find.text('Ver reservas'));
      await tester.pumpAndSettle();

      expect(
        container(tester).read(arenaBookingsFilterProvider).payments,
        {ArenaPaymentFilter.due},
      );
      expect(find.text('1'), findsWidgets);
      expect(find.text('Nenhuma reserva com esses filtros'), findsOneWidget);

      await tester.tap(find.byKey(const Key('arena-bookings-clear-filters')));
      await tester.pump();
      expect(
          container(tester).read(arenaBookingsFilterProvider).isEmpty, isTrue);
      await tester.pump(const Duration(seconds: 1));
    });
  });

  group('pendências, canceladas e polimento', () {
    final late = _booking('late', '18:30', '19:30');

    testWidgets('Precisa de você com a ação de cada pendência', (tester) async {
      await _pumpPage(
        tester,
        ArenaStaffRole.recepcao,
        tasks: [ArenaLateCheckInTask(late, minutesLate: 10)],
        timeline: [ArenaTimelineNowEntry(_now)],
      );
      expect(find.text('Precisa de você'), findsOneWidget);
      expect(find.text('Check-in atrasado · 10 min'), findsOneWidget);
      expect(find.byKey(const Key('arena-task-checkin-late')), findsOneWidget);
    });

    testWidgets('quem só lê vê a pendência, sem o botão de check-in',
        (tester) async {
      await _pumpPage(
        tester,
        ArenaStaffRole.manutencao,
        tasks: [ArenaLateCheckInTask(late, minutesLate: 10)],
        timeline: [ArenaTimelineNowEntry(_now)],
      );
      expect(find.text('Check-in atrasado · 10 min'), findsOneWidget);
      expect(find.byKey(const Key('arena-task-checkin-late')), findsNothing);
    });

    testWidgets('sem pendência, a faixa não aparece', (tester) async {
      await _pumpPage(tester, ArenaStaffRole.recepcao);
      expect(find.byKey(const Key('arena-bookings-tasks')), findsNothing);
    });

    testWidgets('cancelada no fim do dia mostra Vaga liberada', (tester) async {
      final canceled = _booking(
        'cx',
        '21:00',
        '22:00',
        data: {'status': 'cancelled'},
      );
      await _pumpPage(
        tester,
        ArenaStaffRole.recepcao,
        timeline: [
          ArenaTimelineNowEntry(_now),
          ArenaTimelineCanceledEntry(canceled, slotFreed: true),
        ],
      );
      expect(
          find.byKey(const Key('arena-booking-canceled-cx')), findsOneWidget);
      expect(find.text('Vaga liberada'), findsOneWidget);
    });

    testWidgets('deslizar só existe para quem pode agir', (tester) async {
      final next = _booking('next', '19:00', '20:00');
      final timeline = [
        ArenaTimelineNowEntry(_now),
        ArenaTimelineBookingEntry(
          booking: next,
          phase: ArenaTimelinePhase.upcoming,
          isToday: true,
        ),
      ];
      await _pumpPage(tester, ArenaStaffRole.recepcao, timeline: timeline);
      expect(find.byType(Dismissible), findsOneWidget);
    });

    testWidgets('quem só lê não tem o deslizar', (tester) async {
      final next = _booking('next', '19:00', '20:00');
      await _pumpPage(
        tester,
        ArenaStaffRole.manutencao,
        timeline: [
          ArenaTimelineNowEntry(_now),
          ArenaTimelineBookingEntry(
            booking: next,
            phase: ArenaTimelinePhase.upcoming,
            isToday: true,
          ),
        ],
      );
      expect(find.byType(Dismissible), findsNothing);
    });

    testWidgets('carregando mostra o esqueleto dos cards', (tester) async {
      await _pumpPage(
        tester,
        ArenaStaffRole.recepcao,
        timelineAsync: const AsyncValue.loading(),
      );
      expect(find.byKey(const Key('arena-bookings-skeleton')), findsOneWidget);
    });
  });
}
