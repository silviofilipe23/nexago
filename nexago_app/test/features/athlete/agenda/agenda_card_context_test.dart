import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_success_actions.dart';
import 'package:nexago_app/features/athlete/domain/agenda/agenda_card_context.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_providers.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/weather/domain/weather_models.dart';

AthleteAgendaRentalPayload _rental({
  required DateTime start,
  AthleteAgendaBookingStage stage = AthleteAgendaBookingStage.future,
  String rawStatus = 'confirmed',
}) =>
    AthleteAgendaRentalPayload(
      bookingId: 'b1',
      arenaName: 'Arena Orla',
      courtName: 'Quadra 2',
      startAt: start,
      endAt: start.add(const Duration(hours: 1)),
      rawStatus: rawStatus,
      confirmedParticipants: 4,
      stage: stage,
    );

BookingWeatherForecast _forecast(List<WeatherHour> hours) =>
    BookingWeatherForecast(hours: hours, source: 'weatherapi');

TournamentMatch _match({
  required String id,
  required String tournamentId,
  String teamAId = 'team-me',
  String queueStatus = '',
  DateTime? scheduleTime,
  String? courtName,
  String matchType = 'Final',
}) =>
    TournamentMatch(
      id: id,
      tournamentId: tournamentId,
      categoryId: 'cat',
      round: 1,
      matchType: matchType,
      poolId: '',
      teamAId: teamAId,
      teamBId: 'team-other',
      status: TournamentMatchStatus.scheduled,
      resultA: '',
      resultB: '',
      isGroupMatch: false,
      matchNumber: 1,
      queueStatus: queueStatus,
      scheduleTime: scheduleTime,
      courtName: courtName,
    );

MyTournamentRegistration _reg(String tournamentId,
        {String teamId = 'team-me'}) =>
    MyTournamentRegistration(
      registrationId: 'reg-$tournamentId',
      tournamentId: tournamentId,
      tournamentName: 'Open $tournamentId',
      dateLabel: '',
      statusLabel: 'Inscrito',
      isPaid: true,
      categoryId: 'cat',
      teamId: teamId,
      listingStatus: TournamentListingStatus.live,
    );

void main() {
  setUpAll(() => initializeDateFormatting('pt_BR'));

  final now = DateTime(2026, 11, 19, 15);

  group('agendaRainWindowOpen', () {
    test('reserva nas próximas 48h busca a previsão', () {
      expect(
        agendaRainWindowOpen(
          _rental(start: now.add(const Duration(hours: 47))),
          now: now,
        ),
        isTrue,
      );
    });

    test('mais de 48h antes, não', () {
      expect(
        agendaRainWindowOpen(
          _rental(start: now.add(const Duration(hours: 49))),
          now: now,
        ),
        isFalse,
      );
    });

    test('em quadra agora, sim; já acabou ou cancelada, não', () {
      expect(
        agendaRainWindowOpen(
          _rental(
            start: now.subtract(const Duration(minutes: 30)),
            stage: AthleteAgendaBookingStage.current,
          ),
          now: now,
        ),
        isTrue,
      );
      expect(
        agendaRainWindowOpen(
          _rental(
            start: now.subtract(const Duration(hours: 3)),
            stage: AthleteAgendaBookingStage.past,
          ),
          now: now,
        ),
        isFalse,
      );
      expect(
        agendaRainWindowOpen(
          _rental(
            start: now.add(const Duration(hours: 3)),
            stage: AthleteAgendaBookingStage.canceled,
            rawStatus: 'cancelled',
          ),
          now: now,
        ),
        isFalse,
      );
    });
  });

  group('agendaRainBadge', () {
    final game = (
      start: DateTime(2026, 11, 19, 18),
      end: DateTime(2026, 11, 19, 19),
    );

    test('sem previsão (provedor fora, longe demais ou vazia): nada', () {
      expect(agendaRainBadge(null, game: game), isNull);
      expect(agendaRainBadge(_forecast(const []), game: game), isNull);
      expect(
        agendaRainBadge(
          BookingWeatherForecast(availableFrom: DateTime(2026, 11, 30)),
          game: game,
        ),
        isNull,
      );
    });

    test('chance de chuva: hora e porcentagem', () {
      final badge = agendaRainBadge(
        _forecast(const [
          WeatherHour(time: '18:00', probability: 60, precipitationMm: 0.2),
          WeatherHour(time: '19:00', probability: 20),
        ]),
        game: game,
      );
      expect(badge?.rainy, isTrue);
      expect(badge?.label, 'Chuva às 18h · 60%');
    });

    test('chuva forte', () {
      final badge = agendaRainBadge(
        _forecast(const [
          WeatherHour(time: '18:00', probability: 90, precipitationMm: 4),
        ]),
        game: game,
      );
      expect(badge?.rainy, isTrue);
      expect(badge?.label, 'Chuva forte às 18h · 90%');
    });

    test('tempo seco', () {
      final badge = agendaRainBadge(
        _forecast(const [WeatherHour(time: '18:00', probability: 10)]),
        game: game,
      );
      expect(badge?.rainy, isFalse);
      expect(badge?.label, 'Sem chuva no horário');
    });
  });

  test('agendaRentalCalendarUrl monta o evento da reserva', () {
    final url = agendaRentalCalendarUrl(
      _rental(start: DateTime(2026, 11, 21, 19)),
      arenaName: 'Arena Orla',
    );
    final uri = Uri.parse(url!);
    expect(uri.host, 'calendar.google.com');
    expect(uri.queryParameters['text'], 'Reserva · Arena Orla');
    expect(uri.queryParameters['details'], 'Quadra 2');
    expect(uri.queryParameters['location'], 'Arena Orla');
    expect(uri.queryParameters['dates'], startsWith('20261121T'));
  });

  test('agendaRentalMapsUrl usa o endereço quando a arena tem', () {
    expect(
      agendaRentalMapsUrl(
          arenaName: 'Arena Orla', addressLine: 'Av. Beira Mar, 100'),
      ArenaBookingSuccessActions.buildMapsSearchUrl(
        'Arena Orla, Av. Beira Mar, 100',
      ),
    );
    expect(
      agendaRentalMapsUrl(arenaName: 'Arena Orla'),
      ArenaBookingSuccessActions.buildMapsSearchUrl('Arena Orla'),
    );
  });

  group('próxima partida do torneio', () {
    final day = DateTime.utc(2026, 11, 22, 13);

    AthleteEventDayContext ctx(Map<String, List<TournamentMatch>> matches) =>
        AthleteEventDayContext(
          registrations: [for (final t in matches.keys) _reg(t)],
          matchesByTournament: matches,
          now: day,
        );

    test('só olha o torneio do card', () {
      final next = pickAgendaTournamentNextMatch(
        ctx({
          't1': [
            _match(
              id: 'm-t1',
              tournamentId: 't1',
              scheduleTime: DateTime.utc(2026, 11, 22, 16),
            ),
          ],
          't2': [
            _match(id: 'call-t2', tournamentId: 't2', queueStatus: 'on_court')
          ],
        }),
        tournamentId: 't1',
      );
      expect(next?.match.id, 'm-t1');
    });

    test('torneio sem partida minha hoje: nada', () {
      final next = pickAgendaTournamentNextMatch(
        ctx({
          't1': [
            _match(
              id: 'de-outro',
              tournamentId: 't1',
              teamAId: 'team-x',
              scheduleTime: DateTime.utc(2026, 11, 22, 16),
            ),
          ],
        }),
        tournamentId: 't1',
      );
      expect(next, isNull);
    });

    test('linha: horário, quadra e fase', () {
      final next = pickAgendaTournamentNextMatch(
        ctx({
          't1': [
            _match(
              id: 'm1',
              tournamentId: 't1',
              scheduleTime: DateTime.utc(2026, 11, 22, 13, 40),
              courtName: '3',
            ),
          ],
        }),
        tournamentId: 't1',
      )!;
      final line = agendaNextMatchLine(next, now: day);
      expect(line.eyebrow, 'PRÓXIMA PARTIDA · FINAL');
      expect(line.detail, '10:40 · Quadra 3');
      expect(line.isCourtCall, isFalse);
    });

    test('chamada de quadra muda o destaque', () {
      final next = pickAgendaTournamentNextMatch(
        ctx({
          't1': [
            _match(
              id: 'call',
              tournamentId: 't1',
              queueStatus: 'on_court',
              courtName: 'Quadra 1',
            ),
          ],
        }),
        tournamentId: 't1',
      )!;
      final line = agendaNextMatchLine(next, now: day);
      expect(line.isCourtCall, isTrue);
      expect(line.eyebrow, 'CHAMADA PARA A QUADRA · FINAL');
      expect(line.detail, 'Quadra 1');
    });
  });
}
