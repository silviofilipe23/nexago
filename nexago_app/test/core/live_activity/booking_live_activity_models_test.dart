import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/live_activity/booking_live_activity_models.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';

MyBookingItem _booking({
  String id = 'bk-1',
  String startTime = '19:00',
  String endTime = '20:00',
  String rawStatus = 'confirmed',
  int confirmed = 3,
  String arenaName = 'Arena Orla',
  String? courtName = 'Quadra 2',
}) {
  return MyBookingItem(
    id: id,
    arenaName: arenaName,
    courtName: courtName,
    dateRaw: '2026-11-21',
    startTime: startTime,
    endTime: endTime,
    rawStatus: rawStatus,
    paymentDisplay: const MyBookingPaymentDisplay(label: 'PIX'),
    confirmedParticipants: confirmed,
  );
}

/// Instante da parede de São Paulo (a reserva grava a hora da arena).
DateTime _sp(int h, [int m = 0]) =>
    nexagoEventDateTime(year: 2026, month: 11, day: 21, hour: h, minute: m);

void main() {
  setUpAll(initializeNexagoEventTimezone);
  final at1708 = _sp(17, 8);

  group('planBookingLiveActivity', () {
    test('reserva confirmada em até 2h ganha o card', () {
      final plan = planBookingLiveActivity([_booking()], now: at1708);
      expect(plan.request?.bookingId, 'bk-1');
      expect(plan.request?.startAt, _sp(19));
      expect(plan.request?.startLabel, '19:00');
      expect(plan.request?.confirmed, 3);
    });

    test('mais de 2h antes ainda não', () {
      final plan = planBookingLiveActivity(
        [_booking()],
        now: _sp(16, 59),
      );
      expect(plan.request, isNull);
    });

    test('em andamento continua com o card; acabou, não', () {
      expect(
        planBookingLiveActivity([_booking()], now: _sp(19, 30))
            .request
            ?.bookingId,
        'bk-1',
      );
      expect(
        planBookingLiveActivity([_booking()], now: _sp(20, 1))
            .request,
        isNull,
      );
    });

    test('Pix por pagar não confirma a reserva', () {
      for (final status in ['pending', 'pending_payment']) {
        expect(
          planBookingLiveActivity([_booking(rawStatus: status)], now: at1708)
              .request,
          isNull,
        );
      }
    });

    test('cancelada não ganha card e entra na lista para tirar da tela', () {
      final plan = planBookingLiveActivity(
        [_booking(rawStatus: 'cancelled')],
        now: at1708,
      );
      expect(plan.request, isNull);
      expect(plan.canceledBookingIds, {'bk-1'});
    });

    test('duas na janela: a que começa primeiro', () {
      final plan = planBookingLiveActivity(
        [
          _booking(id: 'tarde', startTime: '19:00', endTime: '20:00'),
          _booking(id: 'cedo', startTime: '18:00', endTime: '19:00'),
        ],
        now: at1708,
      );
      expect(plan.request?.bookingId, 'cedo');
    });

    test('horário é o da arena (São Paulo), não o do aparelho', () {
      // Atleta com o celular em Manaus (UTC-4) abre o app às 17h08 de SP:
      // o card conta até 19h de SP, não até 19h de Manaus.
      final plan = planBookingLiveActivity([_booking()], now: at1708);
      expect(plan.request?.startAt.toUtc(), DateTime.utc(2026, 11, 21, 22));
    });

    test('horário que cruza a meia-noite termina no dia seguinte', () {
      final plan = planBookingLiveActivity(
        [_booking(startTime: '23:00', endTime: '00:30')],
        now: _sp(22),
      );
      expect(plan.request?.endAt, _sp(23).add(const Duration(minutes: 90)));
    });

    test('sem quadra no doc: rótulo genérico; sem arena: "Arena"', () {
      final plan = planBookingLiveActivity(
        [_booking(courtName: null, arenaName: ' ')],
        now: at1708,
      );
      expect(plan.request?.courtName, 'Quadra');
      expect(plan.request?.arenaName, 'Arena');
    });
  });

  group('contratos', () {
    final request = BookingLiveActivityRequest(
      bookingId: 'bk-1',
      arenaName: 'Arena Orla',
      courtName: 'Quadra 2',
      startAt: DateTime(2026, 11, 21, 19),
      endAt: DateTime(2026, 11, 21, 20, 30),
      confirmed: 6,
      startLabel: '19:00',
      endLabel: '20:30',
    );

    test('CONTRATO: argumentos do startBooking no Swift', () {
      expect(request.toChannelArgs(), {
        'bookingId': 'bk-1',
        'arenaName': 'Arena Orla',
        'courtName': 'Quadra 2',
        'startAtMs': DateTime(2026, 11, 21, 19).millisecondsSinceEpoch,
        'endAtMs': DateTime(2026, 11, 21, 20, 30).millisecondsSinceEpoch,
        'startLabel': '19:00',
        'endLabel': '20:30',
        // Nunca "6 de 4": o total é o da equipe.
        'confirmed': 4,
        'totalSlots': 4,
      });
    });

    test('CONTRATO: doc criado bate com a regra (fase "upcoming", só as chaves dela)', () {
      final data = bookingLiveActivityCreateData(
        uid: 'u1',
        request: request,
        fcmToken: 'fcm',
        liveActivityToken: 'la',
        serverTimestamp: 'ts',
      );
      expect(data.keys.toSet(), {
        'uid', 'bookingId', 'fcmToken', 'liveActivityToken', 'startAt',
        'endAt', 'phase', 'createdAt', 'updatedAt',
      });
      expect(data['phase'], 'upcoming');
      expect(bookingLiveActivityDocId(uid: 'u1', bookingId: 'bk-1'), 'u1_bk-1');
    });
  });
}
