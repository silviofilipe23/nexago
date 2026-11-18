import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/nexa_skeleton.dart';
import 'package:nexago_app/features/arena/domain/arena_access_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_day_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_club.dart';
import 'package:nexago_app/features/arena/domain/arena_club_admin_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_court_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_date_utils.dart';
import 'package:nexago_app/features/arena/domain/arena_free_windows.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_recurring_booking.dart';
import 'package:nexago_app/features/arena/domain/arena_recurring_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_schedule_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_staff_role.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_providers.dart';
import 'package:nexago_app/features/arena/domain/aulas/arena_class_session.dart';
import 'package:nexago_app/features/arena/presentation/arena_bookings_page.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_bookings_skeleton.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

const _membership = ArenaMembership(
  arenaId: 'a1',
  name: 'Arena',
  isOwner: false,
  role: ArenaStaffRole.recepcao,
);

final _series = ArenaRecurringBooking(
  id: 's1',
  arenaId: 'a1',
  arenaName: 'Arena',
  courtId: 'q1',
  courtName: 'Quadra 1',
  weekday: 1,
  startTime: '18:00',
  endTime: '19:00',
  amountReais: 80,
  status: 'active',
  startDate: '2026-01-01',
  skippedDates: const [],
);

/// Fontes da aba que ainda não responderam: cada uma emite quando o teste
/// manda, para ver a tela antes e depois de cada dado chegar.
class _Sources {
  final staff = StreamController<List<ArenaMembership>>();
  final owned = StreamController<List<ArenaMembership>>();
  final bookings = StreamController<List<ArenaManagerBooking>>();
  final recurring = StreamController<List<ArenaRecurringBooking>>();
  final clubs = StreamController<List<ArenaClub>>();
  final classes = StreamController<List<ArenaClass>>();
  final sessions = StreamController<List<ArenaClassSession>>.broadcast();

  void arenaArrives() {
    owned.add(const []);
    staff.add(const [_membership]);
  }

  void dataArrives() {
    bookings.add(const []);
    recurring.add([_series]);
    clubs.add(const []);
    classes.add(const []);
    sessions.add(const []);
  }

  List<Override> get overrides => [
        ownedArenaMembershipsProvider.overrideWith((ref) => owned.stream),
        staffArenaMembershipsProvider.overrideWith((ref) => staff.stream),
        managedArenaDetailProvider.overrideWith((ref) => Stream.value(null)),
        arenaManagerBookingsStreamProvider.overrideWith(
          (ref) => bookings.stream,
        ),
        arenaActiveRecurringSeriesProvider.overrideWith(
          (ref) => recurring.stream,
        ),
        managedArenaClubsProvider.overrideWith((ref) => clubs.stream),
        managedArenaClassesProvider.overrideWith((ref) => classes.stream),
        arenaClassSessionsOnDayProvider.overrideWith(
          (ref, dateKey) => sessions.stream,
        ),
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
      ];
}

Future<_Sources> _pumpPage(WidgetTester tester, ThemeData theme) async {
  tester.view.physicalSize = const Size(402, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final sources = _Sources();
  await tester.pumpWidget(
    ProviderScope(
      overrides: sources.overrides,
      child: MaterialApp(theme: theme, home: const ArenaBookingsPage()),
    ),
  );
  await _settle(tester);
  return sources;
}

/// O esqueleto pulsa sem parar: avança o relógio em vez de `pumpAndSettle`.
Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
}

Finder get _todayCell =>
    find.byKey(Key('arena-bookings-day-${arenaDateKey(arenaTodayDateOnly())}'));

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  for (final (name, theme) in [
    ('escuro', AppTheme.dark),
    ('claro', AppTheme.light),
  ]) {
    testWidgets('tema $name: a aba não pula enquanto os dados chegam',
        (tester) async {
      final sources = await _pumpPage(tester, theme);

      // 1. Acesso à arena carregando: esqueleto da aba inteira, sem rodinha.
      expect(find.byType(ArenaBookingsPageSkeleton), findsOneWidget);
      expect(find.text('Carregando arena...'), findsNothing);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      // Centro vertical: a largura do título varia com a fonte do teste.
      final title = tester.getCenter(find.text('Reservas')).dy;
      final strip = tester.getTopLeft(_todayCell);
      final day = tester.getTopLeft(
        find.byKey(const Key('arena-bookings-skeleton')),
      );

      // 2. Arena chegou, reservas ainda não: página real, linha do dia no
      // esqueleto, tudo no mesmo lugar.
      sources.arenaArrives();
      await _settle(tester);
      expect(find.byType(ArenaBookingsPageSkeleton), findsNothing);
      expect(find.byKey(const Key('arena-bookings-new')), findsOneWidget);
      expect(tester.getCenter(find.text('Reservas')).dy, title);
      expect(tester.getTopLeft(_todayCell), strip);
      expect(
        tester.getTopLeft(find.byKey(const Key('arena-bookings-skeleton'))),
        day,
      );

      // 3. Reservas chegaram: a faixa de resumo entra onde estava o
      // esqueleto dela.
      sources.dataArrives();
      await _settle(tester);
      expect(find.byKey(const Key('arena-bookings-skeleton')), findsNothing);
      expect(tester.getTopLeft(_todayCell), strip);
      expect(
        tester.getTopLeft(find.byKey(const Key('arena-bookings-day-stats'))),
        day,
      );
      await tester.pump(const Duration(seconds: 1));
    });
  }

  testWidgets('contador do atalho carrega no esqueleto, na altura final',
      (tester) async {
    final sources = await _pumpPage(tester, AppTheme.dark);
    sources.arenaArrives();
    await _settle(tester);

    final fixos = find.byKey(const Key('arena-bookings-shortcut-fixos'));
    expect(
      find.descendant(of: fixos, matching: find.byType(NexaSkeleton)),
      findsOneWidget,
    );
    final loadingHeight = tester.getSize(fixos).height;

    sources.dataArrives();
    await _settle(tester);
    expect(
      find.descendant(of: fixos, matching: find.byType(NexaSkeleton)),
      findsNothing,
    );
    expect(
      find.descendant(of: fixos, matching: find.text('1 ativo')),
      findsOneWidget,
    );
    expect(tester.getSize(fixos).height, loadingHeight);
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('esqueleto da aba não aceita toque nos atalhos', (tester) async {
    // Sem arena ainda não há para onde ir: o toque não faz nada (e não
    // quebra por falta de rota).
    await _pumpPage(tester, AppTheme.dark);
    await tester.tap(find.text('Aulas'), warnIfMissed: false);
    await _settle(tester);
    expect(find.byType(ArenaBookingsPageSkeleton), findsOneWidget);
  });
}
