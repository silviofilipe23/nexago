import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';

void main() {
  group('myBookingPaymentDisplayFromData', () {
    test('PIX 100% pago', () {
      final d = myBookingPaymentDisplayFromData({
        'paymentChannel': 'pix',
        'paymentStatus': 'paid',
        'paymentFraction': 1,
        'amountDueOnsiteReais': 0,
      });
      expect(d.label, 'PIX · 100% pago');
    });

    test('PIX 50% com restante na arena', () {
      final d = myBookingPaymentDisplayFromData({
        'paymentChannel': 'pix',
        'paymentStatus': 'paid',
        'paymentFraction': 0.5,
        'amountDueOnsiteReais': 30,
      });
      expect(d.label, 'PIX · 50% pago · restante na arena');
    });

    test('pagamento na arena', () {
      final d = myBookingPaymentDisplayFromData({
        'paymentChannel': 'onsite',
        'paymentStatus': 'none',
      });
      expect(d.label, 'Pagar na arena');
    });

    test('reserva aguardando PIX', () {
      final d = myBookingPaymentDisplayFromData({
        'status': 'pending_payment',
        'paymentChannel': 'pix',
      });
      expect(d.label, 'PIX · Aguardando pagamento');
    });
  });
}
