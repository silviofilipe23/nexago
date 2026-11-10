import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/waitlist_repository.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_waitlist_entry.dart';
import 'package:nexago_app/features/arenas/domain/waitlist_providers.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_waitlist_page.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_header.dart';

class _FakeWaitlistRepository implements WaitlistRepository {
  final left = <String>[];

  @override
  Future<void> leave(String waitlistId) async => left.add(waitlistId);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

String _key(DateTime d) => d.toIso8601String().substring(0, 10);

ArenaBookingWaitlistEntry _entry(
  String id, {
  required DateTime day,
  ArenaBookingWaitlistStatus status = ArenaBookingWaitlistStatus.waiting,
  DateTime? expiresAt,
  String? reason,
  String arena = 'Arena Sol',
}) =>
    ArenaBookingWaitlistEntry(
      id: id,
      arenaId: 'a1',
      courtId: 'q1',
      dateKey: _key(day),
      startTime: '08:00',
      endTime: '09:00',
      athleteId: 'u1',
      status: status,
      arenaName: arena,
      courtName: 'Quadra 1',
      expiresAt: expiresAt,
      expiredReason: reason,
    );

Future<void> _pump(
  WidgetTester tester,
  List<ArenaBookingWaitlistEntry> entries, {
  WaitlistRepository? repo,
}) async {
  await tester.binding.setSurfaceSize(const Size(400, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        if (repo != null) waitlistRepositoryProvider.overrideWithValue(repo),
        myWaitlistStreamProvider.overrideWith((ref) => Stream.value(entries)),
      ],
      child:
          MaterialApp(theme: AppTheme.dark, home: const AthleteWaitlistPage()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  final tomorrow = DateTime.now().add(const Duration(days: 1));
  final lastWeek = DateTime.now().subtract(const Duration(days: 7));

  testWidgets('mostra vaga liberada, aguardando e o histórico com o motivo',
      (tester) async {
    await _pump(tester, [
      _entry('oferta',
          day: tomorrow,
          status: ArenaBookingWaitlistStatus.notified,
          expiresAt:
              DateTime.now().add(const Duration(minutes: 10, seconds: 30)),
          arena: 'Arena CFC'),
      _entry('fila', day: tomorrow),
      _entry('reservou',
          day: lastWeek, status: ArenaBookingWaitlistStatus.converted),
      _entry('saiu',
          day: lastWeek,
          status: ArenaBookingWaitlistStatus.expired,
          reason: 'left_by_athlete'),
    ]);

    expect(find.text('VAGA LIBERADA'), findsOneWidget);
    expect(find.text('AGUARDANDO'), findsOneWidget);
    expect(find.text('ENCERRADAS · 30 DIAS'), findsOneWidget);
    expect(find.byKey(const ValueKey('waitlist-book-oferta')), findsOneWidget);
    expect(find.text('10 min'), findsOneWidget);
    expect(find.text('VIROU RESERVA'), findsOneWidget);
    expect(find.text('VOCÊ SAIU'), findsOneWidget);
  });

  testWidgets('sair da fila pede confirmação e chama o servidor',
      (tester) async {
    final repo = _FakeWaitlistRepository();
    await _pump(tester, [_entry('fila', day: tomorrow)], repo: repo);

    await tester.tap(find.byKey(const ValueKey('waitlist-leave-fila')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continuar na lista'));
    await tester.pumpAndSettle();
    expect(repo.left, isEmpty);

    await tester.tap(find.byKey(const ValueKey('waitlist-leave-fila')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('waitlist-leave-confirm')));
    await tester.pumpAndSettle();
    expect(repo.left, ['fila']);
    expect(find.text('Você saiu da lista de espera.'), findsOneWidget);
  });

  testWidgets('sem nenhuma fila mostra como funciona e o atalho para reservar',
      (tester) async {
    await _pump(tester, const []);
    expect(find.text('Nenhuma fila por enquanto'), findsOneWidget);
    expect(find.byKey(const ValueKey('waitlist-empty-book')), findsOneWidget);
  });

  testWidgets('ampulheta da Agenda: número das filas e verde com vaga liberada',
      (tester) async {
    var taps = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: AgendaHeader(
            eyebrow: 'TER, 10 NOV',
            title: 'Agenda',
            monthModeActive: false,
            unreadNotificationCount: 0,
            searchVisible: false,
            onSearchTap: () {},
            onCalendarTap: () {},
            onNotificationsTap: () {},
            waitlistActiveCount: 3,
            waitlistHasOffer: true,
            onWaitlistTap: () => taps++,
          ),
        ),
      ),
    );
    expect(find.text('3'), findsOneWidget);
    expect(find.byTooltip('Listas de espera · vaga liberada'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('agenda-waitlist-button')));
    expect(taps, 1);
  });

  testWidgets('sem fila ativa a ampulheta fica sem número', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(
          body: AgendaHeader(
            eyebrow: 'TER, 10 NOV',
            title: 'Agenda',
            monthModeActive: false,
            unreadNotificationCount: 0,
            searchVisible: false,
            onSearchTap: () {},
            onCalendarTap: () {},
            onNotificationsTap: () {},
            onWaitlistTap: () {},
          ),
        ),
      ),
    );
    expect(
        find.byKey(const ValueKey('agenda-waitlist-button')), findsOneWidget);
    expect(find.byKey(const ValueKey('agenda-waitlist-badge')), findsNothing);
  });
}
