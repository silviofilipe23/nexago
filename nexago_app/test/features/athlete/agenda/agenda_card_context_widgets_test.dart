import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/arenas/data/lancar_placar_draft_store.dart';
import 'package:nexago_app/features/arenas/data/pelada_live_draft_store.dart';
import 'package:nexago_app/features/arenas/domain/booking_story_providers.dart';
import 'package:nexago_app/features/arenas/domain/pelada_live/pelada_live_session.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_providers.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_providers.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_card_context_widgets.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/agenda/agenda_timeline_widgets.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_logic.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/weather/application/weather_providers.dart';
import 'package:nexago_app/features/weather/domain/weather_models.dart';
import '../../arenas/fake_lancar_placar_draft_store.dart';
import 'agenda_rental_story_test.dart' show aluguel;

AthleteAgendaRentalPayload _rental(DateTime start) =>
    AthleteAgendaRentalPayload(
      bookingId: 'b1',
      arenaName: 'Arena Sol',
      courtName: 'Quadra 2',
      startAt: start,
      endAt: start.add(const Duration(hours: 1)),
      rawStatus: 'confirmed',
      confirmedParticipants: 4,
      stage: AthleteAgendaBookingStage.future,
    );

AthleteNextMatch _next({
  required String tournamentId,
  bool courtCall = false,
}) =>
    AthleteNextMatch(
      tournamentId: tournamentId,
      tournamentName: 'Open',
      isCourtCall: courtCall,
      match: TournamentMatch(
        id: 'm1',
        tournamentId: tournamentId,
        categoryId: 'cat',
        round: 1,
        matchType: 'Final',
        poolId: '',
        teamAId: 'team-me',
        teamBId: 'team-other',
        status: TournamentMatchStatus.scheduled,
        resultA: '',
        resultB: '',
        isGroupMatch: false,
        matchNumber: 1,
        queueStatus: courtCall ? 'on_court' : '',
        courtName: '3',
      ),
    );

/// Placeholder sem Firebase para o que a linha da agenda lê.
class _NoDrafts implements PeladaLiveDraftStore {
  @override
  Future<void> clear(String key) async {}
  @override
  Future<PeladaLiveSession?> load(String key) async => null;
  @override
  dynamic noSuchMethod(Invocation invocation) => Future.value(null);
}

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  BookingWeatherForecast? forecast,
  void Function()? onForecastRead,
  AthleteNextMatch? nextMatch,
  AthleteNextMatch? courtCall,
}) async {
  tester.view.physicalSize = const Size(400, 1000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        athleteProfileProvider.overrideWith((ref) => Stream.value(null)),
        bookingStorySourceProvider('b1').overrideWith((ref) => null),
        peladaLiveDraftStoreProvider.overrideWithValue(_NoDrafts()),
        lancarPlacarDraftStoreProvider
            .overrideWithValue(MemoryLancarPlacarDraftStore()),
        bookingWeatherForecastProvider.overrideWith((ref, id) async {
          onForecastRead?.call();
          return forecast;
        }),
        agendaTournamentNextMatchProvider
            .overrideWith((ref, id) async => nextMatch),
        athleteCourtCallMatchProvider
            .overrideWith((ref) => Stream.value(courtCall)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: ListView(children: [child])),
      ),
    ),
  );
  await tester.pump();
  await tester.pump();
}

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  group('chance de chuva', () {
    testWidgets('reserva nas próximas horas mostra a chance de chuva', (
      tester,
    ) async {
      final start = DateTime.now().add(const Duration(hours: 3));
      final hour = start.hour.toString().padLeft(2, '0');
      await _pump(
        tester,
        AgendaRainPill(rental: _rental(start), now: DateTime.now()),
        forecast: BookingWeatherForecast(
          hours: [WeatherHour(time: '$hour:00', probability: 70)],
        ),
      );

      expect(find.text('Chuva às ${start.hour}h · 70%'), findsOneWidget);
    });

    testWidgets('mais de 48h antes nem pergunta a previsão', (tester) async {
      var reads = 0;
      await _pump(
        tester,
        AgendaRainPill(
          rental: _rental(DateTime.now().add(const Duration(days: 5))),
          now: DateTime.now(),
        ),
        forecast: const BookingWeatherForecast(
          hours: [WeatherHour(time: '18:00', probability: 90)],
        ),
        onForecastRead: () => reads++,
      );

      expect(find.byType(Text), findsNothing);
      expect(reads, 0);
    });

    testWidgets('sem previsão do servidor, o card fica sem selo', (
      tester,
    ) async {
      await _pump(
        tester,
        AgendaRainPill(
          rental: _rental(DateTime.now().add(const Duration(hours: 3))),
          now: DateTime.now(),
        ),
      );

      expect(find.byType(Text), findsNothing);
    });
  });

  group('como chegar e calendário', () {
    testWidgets('reserva futura tem os dois atalhos', (tester) async {
      await _pump(
        tester,
        AgendaTimelineRow(
          row: aluguel(status: 'confirmed'),
          highlightNextId: null,
          onCancelBooking: (_) async {},
        ),
      );

      expect(find.text('Como chegar'), findsOneWidget);
      expect(find.text('Calendário'), findsOneWidget);
    });

    testWidgets('reserva que já passou não tem', (tester) async {
      await _pump(
        tester,
        AgendaTimelineRow(
          row: aluguel(
            status: 'confirmed',
            stage: AthleteAgendaBookingStage.past,
          ),
          highlightNextId: null,
          onCancelBooking: (_) async {},
        ),
      );

      expect(find.text('Como chegar'), findsNothing);
      expect(find.text('Calendário'), findsNothing);
    });
  });

  group('próxima partida no card do torneio', () {
    testWidgets('mostra fase, horário e quadra', (tester) async {
      await _pump(
        tester,
        const AgendaTournamentNextMatchPanel(tournamentId: 't1'),
        nextMatch: _next(tournamentId: 't1'),
      );

      expect(find.text('PRÓXIMA PARTIDA · FINAL'), findsOneWidget);
      expect(find.textContaining('Quadra 3'), findsOneWidget);
    });

    testWidgets('chamada de quadra deste torneio toma o lugar', (
      tester,
    ) async {
      await _pump(
        tester,
        const AgendaTournamentNextMatchPanel(tournamentId: 't1'),
        nextMatch: _next(tournamentId: 't1'),
        courtCall: _next(tournamentId: 't1', courtCall: true),
      );

      expect(find.text('CHAMADA PARA A QUADRA · FINAL'), findsOneWidget);
      expect(find.text('Quadra 3'), findsOneWidget);
    });

    testWidgets('chamada de outro torneio não interfere', (tester) async {
      await _pump(
        tester,
        const AgendaTournamentNextMatchPanel(tournamentId: 't1'),
        nextMatch: _next(tournamentId: 't1'),
        courtCall: _next(tournamentId: 't2', courtCall: true),
      );

      expect(find.text('PRÓXIMA PARTIDA · FINAL'), findsOneWidget);
    });

    testWidgets('sem partida hoje, nada aparece', (tester) async {
      await _pump(
        tester,
        const AgendaTournamentNextMatchPanel(tournamentId: 't1'),
      );

      expect(find.byType(Text), findsNothing);
    });
  });
}
