import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/weather/domain/weather_booking_rules.dart';
import 'package:nexago_app/features/weather/domain/weather_models.dart';

/// Reserva de 18:00–19:00 em 29/10/2026, do atleta u1, na quadra q1.
Map<String, dynamic> booking({
  String status = 'active',
  String owner = 'u1',
  String courtId = 'q1',
  Map<String, dynamic>? release,
  String? cancelReason,
  bool recurring = false,
}) =>
    {
      'athleteId': owner,
      'arenaId': 'a1',
      'courtId': courtId,
      'date': '2026-10-29',
      'startTime': '18:00',
      'endTime': '19:00',
      'status': status,
      if (release != null) 'weatherRelease': release,
      if (cancelReason != null) 'cancelReason': cancelReason,
      if (recurring) 'recurringBookingId': 'r1',
    };

const requestPolicy =
    WeatherPolicy(enabled: true, trigger: WeatherTrigger.request);

final start = DateTime(2026, 10, 29, 18);

WeatherBookingView view({
  Map<String, dynamic>? data,
  String? viewer = 'u1',
  WeatherPolicy? policy = requestPolicy,
  WeatherRequest? request,
  DateTime? now,
}) =>
    resolveWeatherBookingView(
      booking: data ?? booking(),
      viewerUid: viewer,
      policy: policy,
      request: request,
      now: now ?? DateTime(2026, 10, 29, 16),
    );

void main() {
  group('weatherBookingWindow', () {
    test('data + horário de parede; fim 00:00 vira o dia seguinte', () {
      final w = weatherBookingWindow({
        'date': '2026-10-29',
        'startTime': '23:00',
        'endTime': '00:00',
      })!;
      expect(w.start, DateTime(2026, 10, 29, 23));
      expect(w.end, DateTime(2026, 10, 30));
    });

    test('sem data ou horário legível: null', () {
      expect(weatherBookingWindow({'startTime': '18:00'}), isNull);
      expect(
        weatherBookingWindow(
            {'date': '2026-10-29', 'startTime': 'x', 'endTime': '19:00'}),
        isNull,
      );
    });
  });

  group('weatherRequestWindow — janela e prazos', () {
    WeatherRequestWindow w(WeatherPolicy p, DateTime now) =>
        weatherRequestWindow(policy: p, start: start, now: now);

    test('abre 24h antes do início', () {
      expect(w(requestPolicy, DateTime(2026, 10, 28, 17, 59)).isOpen, isFalse);
      expect(
        w(requestPolicy, DateTime(2026, 10, 28, 17, 59)).closedReason,
        WeatherRequestClosedReason.tooEarly,
      );
      expect(w(requestPolicy, DateTime(2026, 10, 28, 18)).isOpen, isTrue);
    });

    test('prazo "2h antes" fecha às 16:00', () {
      const p = WeatherPolicy(
        enabled: true,
        trigger: WeatherTrigger.request,
        requestDeadline: WeatherRequestDeadline.before2h,
      );
      expect(w(p, DateTime(2026, 10, 29, 16)).isOpen, isTrue);
      expect(w(p, DateTime(2026, 10, 29, 16, 0, 1)).isOpen, isFalse);
      expect(w(p, DateTime(2026, 10, 29, 15)).closesAt,
          DateTime(2026, 10, 29, 16));
    });

    test('prazo "no início" fecha às 18:00', () {
      expect(w(requestPolicy, DateTime(2026, 10, 29, 18)).isOpen, isTrue);
      final late = w(requestPolicy, DateTime(2026, 10, 29, 18, 1));
      expect(late.isOpen, isFalse);
      expect(late.closedReason, WeatherRequestClosedReason.tooLate);
    });

    test('prazo "30 min depois": depois do início é chuva no meio do jogo', () {
      const p = WeatherPolicy(
        enabled: true,
        trigger: WeatherTrigger.request,
        requestDeadline: WeatherRequestDeadline.after30m,
      );
      final mid = w(p, DateTime(2026, 10, 29, 18, 20));
      expect(mid.isOpen, isTrue);
      expect(mid.afterStart, isTrue);
      expect(mid.closesAt, DateTime(2026, 10, 29, 18, 30));
      expect(w(p, DateTime(2026, 10, 29, 18, 31)).isOpen, isFalse);
    });

    test('depois do início com midGame "none": fechado', () {
      const p = WeatherPolicy(
        enabled: true,
        trigger: WeatherTrigger.request,
        requestDeadline: WeatherRequestDeadline.after30m,
        midGame: WeatherMidGame.none,
      );
      expect(w(p, DateTime(2026, 10, 29, 17, 59)).isOpen, isTrue);
      expect(w(p, DateTime(2026, 10, 29, 18, 10)).isOpen, isFalse);
    });
  });

  group('resolveWeatherBookingView — botão de pedir', () {
    test('reserva ativa do atleta, na janela: botão com o prazo', () {
      final v = view();
      expect(v, isA<WeatherViewRequestAvailable>());
      expect((v as WeatherViewRequestAvailable).closesAt, start);
      expect(v.afterStart, isFalse);
    });

    test('política desligada, modo "arena" ou sem política: nada', () {
      expect(view(policy: null), isA<WeatherViewHidden>());
      expect(view(policy: const WeatherPolicy(trigger: WeatherTrigger.request)),
          isA<WeatherViewHidden>());
      expect(view(policy: const WeatherPolicy(enabled: true)),
          isA<WeatherViewHidden>());
    });

    test('quadra fora da política: nada; courtIds null = todas', () {
      const onlyQ2 = WeatherPolicy(
        enabled: true,
        trigger: WeatherTrigger.request,
        courtIds: ['q2'],
      );
      expect(view(policy: onlyQ2), isA<WeatherViewHidden>());
      expect(view(data: booking(courtId: 'q2'), policy: onlyQ2),
          isA<WeatherViewRequestAvailable>());
      expect(view(data: booking(courtId: 'q9')),
          isA<WeatherViewRequestAvailable>());
    });

    test('fora da janela: nada', () {
      expect(view(now: DateTime(2026, 10, 28, 12)), isA<WeatherViewHidden>());
      expect(
          view(now: DateTime(2026, 10, 29, 18, 5)), isA<WeatherViewHidden>());
    });

    test('convidado, reserva cancelada, Pix pendente ou horário fixo: nada',
        () {
      expect(view(viewer: 'u2'), isA<WeatherViewHidden>());
      expect(view(viewer: null), isA<WeatherViewHidden>());
      expect(view(data: booking(status: 'canceled')), isA<WeatherViewHidden>());
      expect(view(data: booking(status: 'pending_payment')),
          isA<WeatherViewHidden>());
      expect(view(data: booking(recurring: true)), isA<WeatherViewHidden>());
    });

    test('confirmed também pode pedir', () {
      expect(view(data: booking(status: 'confirmed')),
          isA<WeatherViewRequestAvailable>());
    });
  });

  group('resolveWeatherBookingView — pedido', () {
    WeatherRequest req(WeatherRequestStatus status) => WeatherRequest(
        bookingId: 'b1', status: status, rejectReason: 'Não choveu');

    test('pendente: card de análise', () {
      expect(view(request: req(WeatherRequestStatus.pending)),
          isA<WeatherViewRequestPending>());
    });

    test('recusado: aviso com motivo', () {
      final v = view(request: req(WeatherRequestStatus.rejected));
      expect(v, isA<WeatherViewRequestRejected>());
      expect(
          (v as WeatherViewRequestRejected).request.rejectReason, 'Não choveu');
    });

    test('retirado: dá para pedir de novo', () {
      expect(view(request: req(WeatherRequestStatus.withdrawn)),
          isA<WeatherViewRequestAvailable>());
    });

    test('aprovado sem liberação ainda: espera a reserva atualizar', () {
      expect(view(request: req(WeatherRequestStatus.approved)),
          isA<WeatherViewHidden>());
    });

    test('pedido pendente aparece mesmo fora da janela', () {
      expect(
        view(
            request: req(WeatherRequestStatus.pending),
            now: DateTime(2026, 10, 29, 19)),
        isA<WeatherViewRequestPending>(),
      );
    });
  });

  group('resolveWeatherBookingView — liberação', () {
    Map<String, dynamic> released(String status) => booking(release: {
          'status': status,
          'creditableReais': 60,
          'canReschedule': true,
        });

    test('pending_choice: aviso A1 só para o dono', () {
      expect(view(data: released('pending_choice')),
          isA<WeatherViewReleasePending>());
      expect(view(data: released('pending_choice'), viewer: 'u2'),
          isA<WeatherViewHidden>());
    });

    test('A1 vale mesmo sem política carregada e fora da janela', () {
      expect(
        view(
          data: released('pending_choice'),
          policy: null,
          now: DateTime(2026, 10, 30, 9),
        ),
        isA<WeatherViewReleasePending>(),
      );
    });

    test('resolvida: resumo do que aconteceu', () {
      for (final (status, kind) in [
        ('credited', WeatherOutcomeKind.credited),
        ('rescheduled', WeatherOutcomeKind.rescheduled),
        ('kept', WeatherOutcomeKind.kept),
        ('canceled_unpaid', WeatherOutcomeKind.canceledUnpaid),
      ]) {
        final v = view(data: released(status));
        expect(v, isA<WeatherViewOutcome>(), reason: status);
        expect((v as WeatherViewOutcome).kind, kind, reason: status);
      }
    });

    test('cancelada por chuva sem weatherRelease: resumo genérico', () {
      final v =
          view(data: booking(status: 'canceled', cancelReason: 'weather'));
      expect(v, isA<WeatherViewOutcome>());
      expect(
          (v as WeatherViewOutcome).kind, WeatherOutcomeKind.canceledByWeather);
    });

    test('a liberação manda mais que o pedido pendente', () {
      expect(
        view(
          data: released('pending_choice'),
          request: const WeatherRequest(
            bookingId: 'b1',
            status: WeatherRequestStatus.pending,
          ),
        ),
        isA<WeatherViewReleasePending>(),
      );
    });
  });

  group('título e horas do aviso', () {
    WeatherRelease withForecast(List<Map<String, Object?>> hours) =>
        WeatherRelease.fromMap(
            {'status': 'pending_choice', 'forecast': hours})!;

    test('pior hora: "Chuva forte às 18h"', () {
      final r = withForecast([
        {'time': '17:00', 'probability': 85, 'precipitationMm': 1.2},
        {'time': '18:00', 'probability': 92, 'precipitationMm': 5.4},
        {'time': '19:00', 'probability': 88, 'precipitationMm': 3},
      ]);
      expect(weatherReleaseHeadline(r), 'Chuva forte às 18h');
    });

    test('condição da WeatherAPI vira o título quando fala de chuva', () {
      expect(
        weatherReleaseHeadline(withForecast([
          {
            'time': '17:00',
            'probability': 71,
            'precipitationMm': 1.3,
            'condition': 'Chuva fraca'
          },
          {
            'time': '19:00',
            'probability': 100,
            'precipitationMm': 6.2,
            'condition': 'chuva passageira moderada ou forte',
          },
        ])),
        'Chuva passageira moderada ou forte às 19h',
      );
      expect(
        weatherReleaseHeadline(withForecast([
          {
            'time': '18:00',
            'probability': 90,
            'precipitationMm': 3,
            'condition': 'Encoberto'
          },
        ])),
        'Chuva forte às 18h',
      );
    });

    test('chuva fraca: "Chuva às 18h"; sem previsão: "Chuva no horário"', () {
      expect(
        weatherReleaseHeadline(withForecast([
          {'time': '18:00', 'probability': 40, 'precipitationMm': 0.5},
        ])),
        'Chuva às 18h',
      );
      expect(weatherReleaseHeadline(withForecast([])), 'Chuva no horário');
    });

    final game = (
      start: DateTime(2026, 10, 29, 18),
      end: DateTime(2026, 10, 29, 19),
    );

    test('título olha só as horas do jogo, não as 2h antes/depois', () {
      final r = withForecast([
        {'time': '16:00', 'probability': 40, 'precipitationMm': 0.5},
        {'time': '17:00', 'probability': 85, 'precipitationMm': 1.2},
        {'time': '18:00', 'probability': 60, 'precipitationMm': 0.8},
        {'time': '19:00', 'probability': 88, 'precipitationMm': 3},
        {'time': '20:00', 'probability': 95, 'precipitationMm': 8},
      ]);
      expect(weatherReleaseHeadline(r, game: game), 'Chuva às 18h');
      // Sem a janela do jogo, vale a pior hora da faixa.
      expect(weatherReleaseHeadline(r), 'Chuva forte às 20h');
    });
  });

  group('weatherForecastStrip — 2h antes e 2h depois', () {
    List<WeatherHour> hours(List<String> times) => [
          for (final t in times)
            WeatherHour(time: t, probability: 50, precipitationMm: 1),
        ];
    List<String> inGame(List<WeatherStripHour> strip) => [
          for (final s in strip)
            if (s.inGame) s.hour.time
        ];

    test('mostra a faixa inteira e marca as horas do jogo', () {
      final strip = weatherForecastStrip(
        hours(['16:00', '17:00', '18:00', '19:00', '20:00']),
        game: (
          start: DateTime(2026, 10, 29, 18),
          end: DateTime(2026, 10, 29, 19, 30),
        ),
      );
      expect(strip, hasLength(5));
      expect(inGame(strip), ['18:00', '19:00']);
    });

    test('jogo das 23h: as horas depois da meia-noite não contam como jogo',
        () {
      final strip = weatherForecastStrip(
        hours(['21:00', '22:00', '23:00', '00:00', '01:00']),
        game: (
          start: DateTime(2026, 10, 29, 23),
          end: DateTime(2026, 10, 30),
        ),
      );
      expect(inGame(strip), ['23:00']);
    });

    test('jogo da 1h: a faixa começa na véspera', () {
      final strip = weatherForecastStrip(
        hours(['23:00', '00:00', '01:00', '02:00', '03:00']),
        game: (
          start: DateTime(2026, 10, 29, 1),
          end: DateTime(2026, 10, 29, 2),
        ),
      );
      expect(inGame(strip), ['01:00']);
    });

    test('sem a janela do jogo: nada marcado', () {
      expect(
        inGame(weatherForecastStrip(hours(['17:00', '18:00']))),
        isEmpty,
      );
    });
  });
  group('previsão em toda reserva', () {
    final game = (
      start: DateTime(2026, 10, 29, 18),
      end: DateTime(2026, 10, 29, 19),
    );
    List<WeatherHour> around(Map<int, (num, num)> rain) => [
          for (var h = 16; h <= 20; h++)
            WeatherHour(
              time: '$h:00',
              probability: rain[h]?.$1 ?? 0,
              precipitationMm: rain[h]?.$2 ?? 0,
              condition: h == 18 ? 'parcialmente nublado' : 'Sol',
              temperatureC: 30 - h / 2,
            ),
        ];

    test('reserva de pé até o fim do jogo; cancelada ou liberada, não', () {
      final now = DateTime(2026, 10, 29, 18, 30);
      expect(showsBookingForecast(booking(), now), isTrue);
      expect(
          showsBookingForecast(booking(), DateTime(2026, 10, 29, 19)), isFalse);
      expect(showsBookingForecast(booking(status: 'canceled'), now), isFalse);
      expect(
        showsBookingForecast(
            booking(release: {'status': 'pending_choice'}), now),
        isFalse,
      );
      expect(showsBookingForecast(null, now), isFalse);
    });

    test('a previsão chega 14 dias antes, à meia-noite', () {
      expect(weatherForecastAvailableFrom(DateTime(2026, 11, 20, 18)),
          DateTime(2026, 11, 6));
    });

    test('título pela pior hora do jogo, não da margem', () {
      expect(weatherForecastHeadline(around({}), game: game),
          'Sem chuva no seu horário');
      expect(weatherForecastHeadline(around({20: (95, 8)}), game: game),
          'Sem chuva no seu horário');
      expect(weatherForecastHeadline(around({18: (45, 0.1)}), game: game),
          'Chance de chuva às 18h');
      expect(weatherForecastHeadline(around({18: (85, 3)}), game: game),
          'Chuva forte prevista às 18h');
      expect(
        weatherForecastOutlook(around({18: (10, 0.6)}), game: game)?.outlook,
        WeatherOutlook.chanceOfRain,
      );
      expect(weatherForecastHeadline(const []), 'Previsão do tempo');
    });

    test('subtítulo: temperatura e condição no começo do jogo', () {
      expect(weatherForecastSubtitle(around({}), game: game),
          '21° · Parcialmente nublado');
      expect(
        weatherForecastSubtitle(const [WeatherHour(time: '18:00')], game: game),
        isNull,
      );
    });
  });
}
