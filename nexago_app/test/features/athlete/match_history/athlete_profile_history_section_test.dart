import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record_providers.dart';
import 'package:nexago_app/features/arenas/presentation/widgets/pelada/pelada_widgets.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/match_history/athlete_profile_history_section.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/match_history/match_history_match_card.dart';

import '../../arenas/fake_booking_result_repository.dart';
import '../../arenas/pelada_tone_contrast.dart';

final _year = DateTime.now().year;

String _day(int month, int d) =>
    '$_year-${month.toString().padLeft(2, '0')}-${d.toString().padLeft(2, '0')}';

AthleteMatchHistoryBundle _bundle(List<AthleteMatchHistoryItem> matches) =>
    AthleteMatchHistoryBundle(
      matches: matches,
      tournaments: const [],
      seasonSummary: AthleteSeasonSummary(
        year: _year,
        winRatePercent: 50,
        wins: 1,
        losses: 1,
      ),
    );

AthleteMatchHistoryItem _match(String id, int month) => AthleteMatchHistoryItem(
      id: id,
      playedAt: DateTime(_year, month, 10),
      result: AthleteMatchResult.win,
      opponentLabel: 'Bruno & Caio',
      competitionLabel: 'Copa Verão',
      scoreDisplay: '2-0',
    );

/// Quatro confirmadas (a mais antiga fica de fora do top 3), uma pendente e
/// uma contestada — as duas últimas são as mais recentes e não entram.
List<SavedBookingResult> _peladas() => [
      savedResult(
        bookingId: 'p1',
        status: BookingResultStatus.confirmed,
        dateKey: _day(2, 1),
      ),
      savedResult(
        bookingId: 'p2',
        status: BookingResultStatus.confirmed,
        dateKey: _day(3, 5),
        arenaName: 'Beach Club',
      ),
      savedResult(
        bookingId: 'p3',
        status: BookingResultStatus.confirmed,
        dateKey: _day(4, 12),
      ),
      savedResult(
        bookingId: 'p4',
        status: BookingResultStatus.confirmed,
        dateKey: _day(5, 20),
      ),
      savedResult(bookingId: 'pending', dateKey: _day(6, 1)),
      savedResult(
        bookingId: 'disputed',
        status: BookingResultStatus.disputed,
        disputedBy: 'u2',
        dateKey: _day(6, 2),
      ),
    ];

Future<void> _pump(
  WidgetTester tester,
  ThemeData theme, {
  List<AthleteMatchHistoryItem> matches = const [],
  List<SavedBookingResult> peladas = const [],
}) async {
  // Largo o bastante pra fonte de teste (glifos quadrados) não estourar a linha.
  tester.view.physicalSize = const Size(560, 1600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        bookingResultRepositoryProvider.overrideWithValue(
          FakeBookingResultRepository(peladas),
        ),
        bookingResultUidProvider.overrideWithValue('u1'),
        currentAthleteMatchHistoryBundleProvider.overrideWith(
          (ref) async => _bundle(matches),
        ),
      ],
      child: MaterialApp(
        theme: theme,
        home: Scaffold(
          body: ListView(
            padding: const EdgeInsets.all(20),
            children: [AthleteProfileHistorySection(onViewAll: () {})],
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
    initializeNexagoEventTimezone();
    await initializeDateFormatting('pt_BR');
  });

  for (final (name, theme) in [
    ('claro', AppTheme.light),
    ('escuro', AppTheme.dark),
  ]) {
    group('Meu perfil · Histórico · tema $name', () {
      testWidgets('torneio e pelada: partidas em cima, bloco Peladas embaixo',
          (tester) async {
        await _pump(
          tester,
          theme,
          matches: [_match('m1', 3), _match('m2', 4)],
          peladas: _peladas(),
        );

        expect(find.text('Histórico'), findsOneWidget);
        expect(find.byType(MatchHistoryMatchCard), findsNWidgets(2));
        expect(
          find.byKey(const Key('profile-history-peladas-label')),
          findsOneWidget,
        );

        // As três confirmadas mais recentes, da mais nova para a mais velha.
        final rows = tester
            .widgetList<PeladaSessionRow>(find.byType(PeladaSessionRow))
            .toList();
        expect(rows.map((r) => r.saved.bookingId), ['p4', 'p3', 'p2']);
        expect(rows.every((r) => r.compact), isTrue);
        expect(find.byKey(const Key('pelada-row-pending')), findsNothing);
        expect(find.byKey(const Key('pelada-row-disputed')), findsNothing);

        // Peladas abaixo das partidas de torneio.
        final lastMatch = tester.getBottomLeft(
          find.byType(MatchHistoryMatchCard).last,
        );
        final label = tester.getTopLeft(
          find.byKey(const Key('profile-history-peladas-label')),
        );
        expect(label.dy, greaterThan(lastMatch.dy));

        // Só o bloco novo: o "V" verde do card de torneio é anterior a
        // este PR e não é tom de pelada.
        final checked = expectPeladaTonesLegible(
          tester,
          find.byKey(const Key('profile-history-peladas')),
        );
        expect(checked, contains('PELADAS'));
      });

      testWidgets('só pelada: a seção aparece com as peladas', (tester) async {
        await _pump(tester, theme, peladas: _peladas());

        expect(find.text('Histórico'), findsOneWidget);
        expect(find.byType(MatchHistoryMatchCard), findsNothing);
        expect(find.byType(PeladaSessionRow), findsNWidgets(3));
        expectPeladaTonesLegible(
          tester,
          find.byKey(const Key('profile-history-peladas')),
        );
      });

      testWidgets('só torneio: sem bloco Peladas', (tester) async {
        await _pump(tester, theme, matches: [_match('m1', 3)]);

        expect(find.byType(MatchHistoryMatchCard), findsOneWidget);
        expect(find.byType(PeladaSessionRow), findsNothing);
        expect(
          find.byKey(const Key('profile-history-peladas-label')),
          findsNothing,
        );
      });

      testWidgets('pelada só pendente/contestada não conta como histórico',
          (tester) async {
        await _pump(
          tester,
          theme,
          peladas: [
            savedResult(bookingId: 'pending', dateKey: _day(6, 1)),
            savedResult(
              bookingId: 'disputed',
              status: BookingResultStatus.disputed,
              disputedBy: 'u2',
              dateKey: _day(6, 2),
            ),
          ],
        );

        expect(find.text('Histórico'), findsNothing);
        expect(find.byType(PeladaSessionRow), findsNothing);
      });

      testWidgets('nem torneio nem pelada: a seção some', (tester) async {
        await _pump(tester, theme);

        expect(find.text('Histórico'), findsNothing);
        expect(find.text('VER TUDO '), findsNothing);
      });
    });
  }

  testWidgets('VER TUDO abre o Histórico; a linha abre o detalhe da pelada',
      (tester) async {
    var viewAll = 0;
    final opened = <String>[];
    tester.view.physicalSize = const Size(560, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (context, _) => Scaffold(
            body: ListView(
              children: [
                AthleteProfileHistorySection(onViewAll: () => viewAll++),
              ],
            ),
          ),
        ),
        GoRoute(
          path: AppRoutes.peladaDetail,
          builder: (context, state) {
            opened.add(state.pathParameters['bookingId']!);
            return const Scaffold(body: Text('detalhe da pelada'));
          },
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          bookingResultRepositoryProvider.overrideWithValue(
            FakeBookingResultRepository(_peladas()),
          ),
          bookingResultUidProvider.overrideWithValue('u1'),
          currentAthleteMatchHistoryBundleProvider.overrideWith(
            (ref) async => _bundle(const []),
          ),
        ],
        child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
      ),
    );
    await tester.pump();
    await tester.pump();

    await tester.tap(find.text('VER TUDO '));
    expect(viewAll, 1);

    await tester.tap(find.byKey(const Key('pelada-row-p4')));
    await tester.pumpAndSettle();
    expect(opened, ['p4']);
    expect(find.text('detalhe da pelada'), findsOneWidget);
  });
}
