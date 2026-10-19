import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_labels.dart';

void main() {
  group('arenaBookingPaymentInfo — cartão', () {
    test('reserva paga no cartão mostra o meio Cartão', () {
      final info = arenaBookingPaymentInfo({
        'paymentChannel': 'card',
        'paymentStatus': 'paid',
        'amountReais': 100,
        'amountPaidOnlineReais': 100,
      });
      expect(info.channel, 'Cartão');
      expect(info.statusBadge, 'PAGO INTEGRAL');
      expect(info.headline, 'Cliente pagou o valor integral no cartão');
    });

    test('checkout de cartão aberto: aguardando cartão, não PIX', () {
      final info = arenaBookingPaymentInfo({
        'paymentChannel': 'pix',
        'billingType': 'CREDIT_CARD',
        'paymentStatus': 'pending',
        'amountReais': 100,
      });
      expect(info.statusBadge, 'AGUARDANDO CARTÃO');
    });

    test('PIX segue com os textos de sempre', () {
      final info = arenaBookingPaymentInfo({
        'paymentChannel': 'pix',
        'paymentStatus': 'paid',
        'amountReais': 100,
      });
      expect(info.channel, 'PIX');
      expect(info.headline, 'Cliente pagou o valor integral via PIX');
    });
  });
}
