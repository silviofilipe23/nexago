import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
import 'package:nexago_app/features/arenas/presentation/booking_story_page.dart';
import 'package:nexago_app/features/arenas/presentation/booking_success_page.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  testWidgets('"Postar no story" abre o editor com a reserva confirmada', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 1000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final router = GoRouter(
      initialLocation: '/sucesso',
      initialExtra: const BookingSuccessArgs(
        arenaId: '',
        arenaName: 'Arena Sol',
        courtName: 'Quadra 2',
        dateKey: '2026-10-23',
        startTime: '19:00',
        endTime: '20:00',
        dateLabel: '23 out 2026',
        timeRangeLabel: '19:00 – 20:00',
        bookingIds: ['b9'],
      ),
      routes: [
        GoRoute(
            path: '/sucesso', builder: (_, _) => const BookingSuccessPage()),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
          bookingStorySourceProvider('b9').overrideWith((ref) => null),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pump();
    // `FadeSlideIn` só começa depois de um `Future` com delay zero.
    await tester.pump(const Duration(milliseconds: 50));

    await tester.tap(find.byKey(const Key('booking-success-story')));
    // Sem `pumpAndSettle`: o confete da confirmação ainda está caindo.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(BookingStoryPage), findsOneWidget);
    expect(find.text('19:00–20:00'), findsOneWidget);
    // O ticket da confirmação, embaixo, também escreve "Arena Sol · Quadra 2".
    expect(
      find.descendant(
        of: find.byType(BookingStoryPage),
        matching: find.textContaining(
          'Arena Sol · Quadra 2',
          findRichText: true,
        ),
      ),
      findsOneWidget,
    );
  });
}
