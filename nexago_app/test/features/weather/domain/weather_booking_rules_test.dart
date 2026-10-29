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

    test('no máximo 3 horas, em volta da pior', () {
      final r = withForecast([
        for (var h = 14; h <= 21; h++)
          {
            'time': '$h:00',
            'probability': 50,
            'precipitationMm': h == 19 ? 6 : 1
          },
      ]);
      final hours = weatherReleaseHighlightHours(r);
      expect(hours.map((h) => h.time), ['18:00', '19:00', '20:00']);
    });
  });
}
