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
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_logic.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_providers.dart';
import 'package:nexago_app/features/athlete/presentation/athlete_match_history_page.dart';

import '../../arenas/fake_booking_result_repository.dart';

/// Só aluguel: o histórico de torneio vem vazio.
final _semTorneio = AthleteMatchHistoryBundle(
  matches: const [],
  tournaments: const [],
  seasonSummary: buildSeasonSummary(matches: const [], year: 2026),
);

Future<void> abrir(
  WidgetTester tester, {
  required String uid,
  required List<SavedBookingResult> salvos,
}) async {
  tester.view.physicalSize = const Size(400, 1400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => const AthleteMatchHistoryPage()),
      GoRoute(
        path: AppRoutes.bookingResultReview,
        builder: (_, state) =>
            Text('conferir ${state.pathParameters['bookingId']}'),
      ),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        currentAthleteMatchHistoryBundleProvider
            .overrideWith((ref) async => _semTorneio),
        bookingResultRepositoryProvider
            .overrideWithValue(FakeBookingResultRepository(salvos)),
        bookingResultUidProvider.overrideWithValue(uid),
      ],
      child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
    await initializeNexagoEventTimezone();
  });

  testWidgets('placar para confirmar fica no topo e não conta ainda', (
    tester,
  ) async {
    await abrir(tester, uid: 'u3', salvos: [savedResult()]);

    expect(find.text('Placares de aluguel'), findsOneWidget);
    expect(find.text('1 PARA CONFIRMAR'), findsOneWidget);
    expect(find.text('Confirme o placar de Maria'), findsOneWidget);
    expect(find.text('Partidas (0)'), findsOneWidget);
    expect(find.text('Nenhuma partida neste filtro.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('history-rental-pending-b1')));
    await tester.pumpAndSettle();
    expect(find.text('conferir b1'), findsOneWidget);
  });

  testWidgets('quem lançou vê o aguardando', (tester) async {
    await abrir(tester, uid: 'u1', salvos: [savedResult()]);

    expect(find.text('AINDA NÃO CONTAM'), findsOneWidget);
    expect(find.text('Aguardando Rafael confirmar'), findsOneWidget);
  });

  testWidgets('confirmado entra na lista, no mês e na temporada', (
    tester,
  ) async {
    await abrir(tester, uid: 'u3', salvos: [
      savedResult(
          status: BookingResultStatus.confirmed,
          respondedByName: 'Rafael Souza'),
    ]);

    expect(find.text('Placares de aluguel'), findsNothing);
    expect(find.text('Partidas (1)'), findsOneWidget);
    expect(find.text('Maria & Enzo'), findsOneWidget);
    expect(find.text('Aluguel · Arena CFC · Quadra 1'), findsOneWidget);
    expect(find.text('D'), findsOneWidget);
    expect(find.text('1 JOGOS • 0V 1D'), findsOneWidget);
    expect(find.text('0V · 1D'), findsOneWidget);

    await tester.tap(find.text('Maria & Enzo'));
    await tester.pumpAndSettle();
    expect(find.text('conferir b1'), findsOneWidget);
  });
}
