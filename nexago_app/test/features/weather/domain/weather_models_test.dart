import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/weather/domain/weather_models.dart';

void main() {
  group('WeatherPolicy.fromMap', () {
    test('sem política: os padrões do spec', () {
      final p = WeatherPolicy.fromMap(null);
      expect(p.enabled, isFalse);
      expect(p.allowReschedule, isTrue);
      expect(p.rescheduleDays, 30);
      expect(p.creditValidityDays, 90);
      expect(p.trigger, WeatherTrigger.arena);
      expect(p.requestDeadline, WeatherRequestDeadline.start);
      expect(p.midGame, WeatherMidGame.proportional);
      expect(p.courtIds, isNull);
      expect(p.acceptsRequests, isFalse);
    });

    test('lê a política gravada; inválido volta ao padrão', () {
      final p = WeatherPolicy.fromMap({
        'enabled': true,
        'allowReschedule': false,
        'rescheduleDays': 45, // fora das opções
        'creditValidityDays': 180,
        'trigger': 'request',
        'requestDeadline': 'after_30m',
        'midGame': 'none',
        'courtIds': ['q1', ' q2 ', 'q1', '', 3],
      });
      expect(p.enabled, isTrue);
      expect(p.allowReschedule, isFalse);
      expect(p.rescheduleDays, 30);
      expect(p.creditValidityDays, 180);
      expect(p.trigger, WeatherTrigger.request);
      expect(p.requestDeadline, WeatherRequestDeadline.after30m);
      expect(p.midGame, WeatherMidGame.none);
      expect(p.courtIds, ['q1', 'q2']);
      expect(p.acceptsRequests, isTrue);
      expect(p.coversCourt('q2'), isTrue);
      expect(p.coversCourt('q3'), isFalse);
    });

    test('creditValidityDays null explícito = sem validade', () {
      final p = WeatherPolicy.fromMap({'creditValidityDays': null});
      expect(p.creditValidityDays, isNull);
    });

    test('modo automático também aceita pedido; arena não', () {
      expect(
        WeatherPolicy.fromMap({'enabled': true, 'trigger': 'auto'})
            .acceptsRequests,
        isTrue,
      );
      expect(
        WeatherPolicy.fromMap({'enabled': true, 'trigger': 'arena'})
            .acceptsRequests,
        isFalse,
      );
      expect(
        WeatherPolicy.fromMap({'enabled': false, 'trigger': 'request'})
            .acceptsRequests,
        isFalse,
      );
    });
  });

  group('WeatherRelease', () {
    test('lê o weatherRelease do doc cru da reserva', () {
      final r = WeatherRelease.fromBooking({
        'weatherRelease': {
          'source': 'rain_mode',
          'eventId': 'ev1',
          'releasedAt': Timestamp.fromDate(DateTime(2026, 10, 29, 17, 30)),
          'decisionDeadline':
              Timestamp.fromDate(DateTime(2026, 10, 30, 17, 30)),
          'creditableReais': 60,
          'fraction': 1,
          'canReschedule': true,
          'rescheduleUntil': '2026-11-28',
          'status': 'pending_choice',
          'forecast': [
            {'time': '17:00', 'probability': 85, 'precipitationMm': 1.2},
            {'time': '18:00', 'probability': 92, 'precipitationMm': 5.4},
            {'time': 'x'}, // sem número: entra com nulos
            'lixo',
          ],
        },
      })!;
      expect(r.status, WeatherReleaseStatus.pendingChoice);
      expect(r.isPendingChoice, isTrue);
      expect(r.source, WeatherReleaseSource.rainMode);
      expect(r.creditableReais, 60);
      expect(r.canReschedule, isTrue);
      expect(r.rescheduleUntilDate, DateTime(2026, 11, 28));
      expect(r.decisionDeadline, DateTime(2026, 10, 30, 17, 30));
      expect(r.forecast, hasLength(3));
      expect(r.forecast[1].hourLabel, '18h');
    });

    test('sem weatherRelease: null', () {
      expect(WeatherRelease.fromBooking({'status': 'active'}), isNull);
      expect(WeatherRelease.fromBooking(null), isNull);
    });

    test('status desconhecido não quebra', () {
      expect(
        WeatherRelease.fromMap({'status': 'algo'})!.status,
        WeatherReleaseStatus.unknown,
      );
    });
  });

  group('WeatherCredit e saldos por arena', () {
    final now = DateTime(2026, 10, 29, 12);

    WeatherCredit credit(
      String id, {
      String arenaId = 'a1',
      String arenaName = 'Arena CFC',
      double balance = 60,
      String status = 'open',
      DateTime? expiresAt,
      DateTime? createdAt,
    }) =>
        WeatherCredit.fromMap(id, {
          'arenaId': arenaId,
          'arenaName': arenaName,
          'athleteId': 'u1',
          'amountReais': 60,
          'balanceReais': balance,
          'status': status,
          'expiresAt': expiresAt == null ? null : Timestamp.fromDate(expiresAt),
          'createdAt': Timestamp.fromDate(createdAt ?? DateTime(2026, 10, 1)),
          'uses': [
            {'bookingId': 'b9', 'amountReais': 10, 'kind': 'booking'},
          ],
        });

    test('fromMap lê saldo, validade e usos', () {
      final c = credit('wx_b1', expiresAt: DateTime(2027, 1, 27));
      expect(c.balanceReais, 60);
      expect(c.status, WeatherCreditStatus.open);
      expect(c.expiresAt, DateTime(2027, 1, 27));
      expect(c.uses.single.amountReais, 10);
      expect(c.usableAt(now), isTrue);
    });

    test('vencido, usado ou sem saldo não é utilizável', () {
      expect(
          credit('a', expiresAt: DateTime(2026, 10, 1)).usableAt(now), isFalse);
      expect(credit('b', status: 'used').usableAt(now), isFalse);
      expect(credit('c', balance: 0).usableAt(now), isFalse);
      expect(credit('d').usableAt(now), isTrue); // sem validade
    });

    test('soma por arena só o utilizável e pega o vencimento mais próximo', () {
      final balances = summarizeWeatherCreditsByArena([
        credit('1', balance: 60, expiresAt: DateTime(2027, 1, 27)),
        credit('2', balance: 15.5, expiresAt: DateTime(2026, 12, 1)),
        credit('3',
            balance: 40, status: 'expired', expiresAt: DateTime(2026, 9, 1)),
        credit('4',
            arenaId: 'a2', arenaName: 'Arena Sol', balance: 0, status: 'used'),
      ], now);
      expect(balances, hasLength(2));
      expect(balances.first.arenaId, 'a1');
      expect(balances.first.balanceReais, 75.5);
      expect(balances.first.nextExpiresAt, DateTime(2026, 12, 1));
      expect(balances.first.credits, hasLength(3));
      expect(balances.last.arenaName, 'Arena Sol');
      expect(balances.last.balanceReais, 0);
    });
  });

  group('WeatherRequest.fromMap', () {
    test('lê status, observação e medição', () {
      final r = WeatherRequest.fromMap('b1', {
        'arenaId': 'a1',
        'athleteId': 'u1',
        'status': 'pending',
        'note': ' quadra alagada ',
        'weather': {'probability': 80, 'precipitationMm': 5.4},
        'forecast': [
          {'time': '16:00', 'probability': 40, 'precipitationMm': 0.5},
          {'time': '18:00', 'probability': 80, 'precipitationMm': 5.4},
          {'probability': 10},
        ],
        'createdAt': Timestamp.fromDate(DateTime(2026, 10, 29, 17, 52)),
      })!;
      expect(r.bookingId, 'b1');
      expect(r.status, WeatherRequestStatus.pending);
      expect(r.note, 'quadra alagada');
      expect(r.weather!.precipitationMm, 5.4);
      expect(r.weather!.hasData, isTrue);
      expect(r.forecast.map((h) => h.hourLabel), ['16h', '18h']);
      expect(r.createdAt, DateTime(2026, 10, 29, 17, 52));
    });

    test('doc ausente: null', () {
      expect(WeatherRequest.fromMap('b1', null), isNull);
    });
  });
}
