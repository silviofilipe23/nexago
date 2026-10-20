import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/arenas/presentation/peladas_list.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_providers.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_match_history_page.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/public_profile_peladas_tab.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/public_profile_tabs.dart';

import 'fake_booking_result_repository.dart';

final year = DateTime.now().year;
String day(int month, int d) =>
    '$year-${month.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';

/// Duas confirmadas (Arena CFC e Beach Club), uma pendente.
List<SavedBookingResult> peladas() => [
      savedResult(
        bookingId: 'a',
        status: BookingResultStatus.confirmed,
        dateKey: day(3, 10),
      ),
      savedResult(
        bookingId: 'b',
        status: BookingResultStatus.confirmed,
        dateKey: day(3, 18),
        arenaName: 'Beach Club',
      ),
      savedResult(bookingId: 'c', dateKey: day(4, 2)),
    ];

Future<void> pump(WidgetTester tester, Widget child,
    {List<Override> overrides = const []}) async {
  tester.view.physicalSize = const Size(400, 1600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp(theme: AppTheme.dark, home: child),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() async {
    initializeNexagoEventTimezone();
    await initializeDateFormatting('pt_BR');
  });

  group('aba Peladas do próprio Histórico (10b)', () {
    List<Override> mine(List<SavedBookingResult> all) => [
          bookingResultRepositoryProvider.overrideWithValue(
            FakeBookingResultRepository(all),
          ),
          bookingResultUidProvider.overrideWithValue('u1'),
        ];

    testWidgets('resumo do ano só com confirmadas; pendente com borda e chip', (
      tester,
    ) async {
      await pump(
        tester,
        Scaffold(body: ListView(children: const [MyPeladasTab()])),
        overrides: mine(peladas()),
      );

      expect(find.text('PELADAS · $year'), findsOneWidget);
      expect(find.byKey(const Key('peladas-summary-sessions')), findsOneWidget);
      expect(
        tester
            .widget<Text>(find.byKey(const Key('peladas-summary-sessions')))
            .data,
        '2',
      );
      expect(find.textContaining('3h em quadra'), findsOneWidget);
      expect(find.text('◐ AGUARDANDO 3'), findsOneWidget);
      expect(find.byKey(const Key('pelada-filter-pending')), findsOneWidget);
      expect(find.byKey(const Key('pelada-row-c')), findsOneWidget);
    });

    testWidgets('filtro de arena e "Pendentes" recortam a lista', (
      tester,
    ) async {
      await pump(
        tester,
        Scaffold(body: ListView(children: const [MyPeladasTab()])),
        overrides: mine(peladas()),
      );

      // Os chips rolam na horizontal: o da arena pode estar fora da tela.
      await tester.ensureVisible(
        find.byKey(const Key('pelada-filter-Beach Club')),
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('pelada-filter-Beach Club')));
      await tester.pump();
      expect(find.byKey(const Key('pelada-row-b')), findsOneWidget);
      expect(find.byKey(const Key('pelada-row-a')), findsNothing);

      await tester
          .ensureVisible(find.byKey(const Key('pelada-filter-pending')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('pelada-filter-pending')));
      await tester.pump();
      expect(find.byKey(const Key('pelada-row-c')), findsOneWidget);
      expect(find.byKey(const Key('pelada-row-b')), findsNothing);
    });

    testWidgets('vazio: explica e oferece reservar', (tester) async {
      var reserved = 0;
      await pump(
        tester,
        Scaffold(
          body: ListView(children: [MyPeladasTab(onReserve: () => reserved++)]),
        ),
        overrides: mine(const []),
      );

      expect(find.byKey(const Key('peladas-empty')), findsOneWidget);
      await tester.tap(find.byKey(const Key('peladas-empty-reserve')));
      expect(reserved, 1);
    });
  });

  testWidgets('Histórico: a terceira aba é Peladas, com o número do ano', (
    tester,
  ) async {
    await pump(
      tester,
      const AthleteMatchHistoryPage(),
      overrides: [
        bookingResultRepositoryProvider.overrideWithValue(
          FakeBookingResultRepository(peladas()),
        ),
        bookingResultUidProvider.overrideWithValue('u1'),
        currentAthleteMatchHistoryBundleProvider.overrideWith(
          (ref) async => AthleteMatchHistoryBundle(
            matches: const [],
            tournaments: const [],
            seasonSummary: AthleteSeasonSummary(
              year: year,
              winRatePercent: 0,
              wins: 0,
              losses: 0,
            ),
          ),
        ),
      ],
    );

    expect(find.text('Peladas (2)'), findsOneWidget);
    await tester.tap(find.text('Peladas (2)'));
    await tester.pump();
    await tester.pump();
    expect(find.text('PELADAS · $year'), findsOneWidget);
  });

  testWidgets('peladas de outro atleta: só confirmadas, sem "Pendentes"', (
    tester,
  ) async {
    await pump(
      tester,
      const PeladasHistoryPage(userId: 'u3'),
      overrides: [
        bookingResultRepositoryProvider.overrideWithValue(
          FakeBookingResultRepository(peladas()),
        ),
        bookingResultUidProvider.overrideWithValue('u9'),
      ],
    );

    expect(find.byKey(const Key('pelada-row-a')), findsOneWidget);
    expect(find.byKey(const Key('pelada-row-c')), findsNothing);
    expect(find.byKey(const Key('pelada-filter-pending')), findsNothing);
  });

  group('perfil público (00d)', () {
    testWidgets('a aba Peladas só aparece com pelada confirmada', (
      tester,
    ) async {
      await pump(
        tester,
        Scaffold(
          body: PublicProfileTabBar(
            selected: PublicProfileTab.overview,
            onChanged: (_) {},
          ),
        ),
      );
      expect(find.byKey(const Key('public-profile-tab-peladas')), findsNothing);

      await pump(
        tester,
        Scaffold(
          body: PublicProfileTabBar(
            selected: PublicProfileTab.overview,
            showPeladas: true,
            onChanged: (_) {},
          ),
        ),
      );
      expect(
        find.byKey(const Key('public-profile-tab-peladas')),
        findsOneWidget,
      );
    });

    testWidgets('três números e as últimas três confirmadas', (tester) async {
      final all = [
        for (var i = 1; i <= 4; i++)
          savedResult(
            bookingId: 'p$i',
            status: BookingResultStatus.confirmed,
            dateKey: day(5, i),
          ),
      ];
      await pump(
        tester,
        Scaffold(
          body: ListView(
            children: [PublicProfilePeladasTab(userId: 'u3', peladas: all)],
          ),
        ),
      );

      expect(find.text('HORÁRIOS'), findsOneWidget);
      expect(find.text('4'), findsOneWidget);
      expect(find.byKey(const Key('pelada-row-p4')), findsOneWidget);
      expect(find.byKey(const Key('pelada-row-p1')), findsNothing);
      expect(
        find.byKey(const Key('public-profile-peladas-all')),
        findsOneWidget,
      );
    });
  });
}
