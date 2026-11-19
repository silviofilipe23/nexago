import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/live_activity/pix_live_activity_models.dart';

void main() {
  final createdAt = DateTime(2026, 11, 19, 14, 18);
  final expiresAt = createdAt.add(const Duration(minutes: 15));

  PixLiveActivityRequest request({
    String paymentId = 'pay_1',
    double amountReais = 120,
    DateTime? expires,
  }) {
    return PixLiveActivityRequest(
      paymentId: paymentId,
      kind: PixLiveActivityKind.booking,
      amountReais: amountReais,
      summary: 'Reserva · Arena Sol · Quadra 2',
      detail: 'Sáb, 21/11 · 9h–10h',
      createdAt: createdAt,
      expiresAt: expires ?? expiresAt,
    );
  }

  group('PixLiveActivityKind', () {
    test('título curto de cada origem, como aparece no card', () {
      expect(PixLiveActivityKind.booking.title, 'Pix da reserva');
      expect(PixLiveActivityKind.registration.title, 'Pix da inscrição');
      expect(PixLiveActivityKind.club.title, 'Pix do clubinho');
    });

    test('o valor gravado cabe no limite da regra (32)', () {
      for (final kind in PixLiveActivityKind.values) {
        expect(kind.name.length, lessThanOrEqualTo(32));
      }
    });
  });

  group('PixLiveActivityRequest', () {
    test('CONTRATO: argumentos que o Swift lê no startPix', () {
      expect(request().toChannelArgs(), {
        'paymentId': 'pay_1',
        'title': 'Pix da reserva',
        // O `intl` separa com espaço inquebrável (U+00A0).
        'amountLabel': 'R\$\u00a0120,00',
        'summary': 'Reserva · Arena Sol · Quadra 2',
        'detail': 'Sáb, 21/11 · 9h–10h',
        'createdAtMs': createdAt.millisecondsSinceEpoch,
        'expiresAtMs': expiresAt.millisecondsSinceEpoch,
      });
    });

    test('é válido com cobrança, valor e prazo no futuro da criação', () {
      expect(request().isValid, isTrue);
    });

    test('não inicia sem id da cobrança, sem valor ou com prazo invertido', () {
      expect(request(paymentId: '  ').isValid, isFalse);
      expect(request(amountReais: 0).isValid, isFalse);
      expect(request(expires: createdAt).isValid, isFalse);
    });
  });

  group('pixLiveActivityCreateData', () {
    test('CONTRATO: só os campos que a regra aceita, nascendo em waiting', () {
      const stamp = 'server-now';
      final data = pixLiveActivityCreateData(
        uid: 'uid-1',
        paymentId: 'pay_1',
        kind: PixLiveActivityKind.registration,
        fcmToken: 'fcm',
        liveActivityToken: 'la',
        expiresAt: expiresAt,
        serverTimestamp: stamp,
      );
      expect(data, {
        'uid': 'uid-1',
        'paymentId': 'pay_1',
        'kind': 'registration',
        'fcmToken': 'fcm',
        'liveActivityToken': 'la',
        'expiresAt': expiresAt,
        'phase': 'waiting',
        'createdAt': stamp,
        'updatedAt': stamp,
      });
    });

    test('CONTRATO: a chave do doc é uid_cobrança (regra confere)', () {
      expect(
        pixLiveActivityDocId(uid: 'uid-1', paymentId: 'pay_1'),
        'uid-1_pay_1',
      );
    });

    test('troca de token mexe só nos campos que a regra libera', () {
      final data = pixLiveActivityTokenUpdate(
        fcmToken: 'fcm-2',
        liveActivityToken: 'la-2',
        serverTimestamp: 'now',
      );
      expect(
          data.keys,
          unorderedEquals(
            ['fcmToken', 'liveActivityToken', 'updatedAt'],
          ));
    });
  });

  group('textos de contexto', () {
    test('reserva: arena e quadra no resumo, dia e horário no detalhe', () {
      final context = pixLiveActivityBookingContext(
        arenaName: 'Arena Sol',
        courtName: 'Quadra 2',
        date: DateTime(2026, 11, 21),
        startTime: '09:00',
        endTime: '10:30',
      );
      expect(context.summary, 'Reserva · Arena Sol · Quadra 2');
      expect(context.detail, 'Sáb, 21/11 · 9h–10h30');
    });

    test('reserva sem quadra definida (arena define) não deixa separador solto',
        () {
      final context = pixLiveActivityBookingContext(
        arenaName: 'Arena Sol',
        courtName: '  ',
        date: DateTime(2026, 11, 23),
        startTime: '18:00',
        endTime: '',
      );
      expect(context.summary, 'Reserva · Arena Sol');
      expect(context.detail, 'Seg, 23/11 · 18h');
    });

    test('inscrição: torneio no resumo, categoria no detalhe', () {
      final context = pixLiveActivityRegistrationContext(
        tournamentName: 'Copa Verão',
        categoryName: 'Dupla Mista B',
      );
      expect(context.summary, 'Inscrição · Copa Verão');
      expect(context.detail, 'Dupla Mista B');
    });

    test('clubinho: arena no resumo, dia e horário no detalhe', () {
      final context = pixLiveActivityClubContext(
        arenaName: 'Arena Sol',
        date: DateTime(2026, 11, 22),
        startTime: '08:00',
      );
      expect(context.summary, 'Clubinho · Arena Sol');
      expect(context.detail, 'Dom, 22/11 · 8h');
    });

    test('texto longo é cortado para caber no card', () {
      final context = pixLiveActivityRegistrationContext(
        tournamentName: 'A' * 200,
        categoryName: 'B' * 200,
      );
      expect(context.summary.length, lessThanOrEqualTo(80));
      expect(context.detail.length, lessThanOrEqualTo(80));
      expect(context.summary.endsWith('…'), isTrue);
    });
  });
}
