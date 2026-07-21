import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_labels.dart';

void main() {
  group('arenaBookingCouponInfo', () {
    test('retorna código e desconto quando o doc tem cupom', () {
      final info = arenaBookingCouponInfo({
        'couponCode': 'VERAO10',
        'couponDiscountReais': 15.0,
      });

      expect(info, isNotNull);
      expect(info!.code, 'VERAO10');
      expect(info.discountReais, 15.0);
    });

    test('retorna null quando o doc não tem cupom', () {
      expect(arenaBookingCouponInfo({'amountReais': 100}), isNull);
    });

    test('retorna null quando couponCode é vazio/em branco', () {
      expect(arenaBookingCouponInfo({'couponCode': '   '}), isNull);
    });

    test('retorna null quando data é null', () {
      expect(arenaBookingCouponInfo(null), isNull);
    });

    test('couponDiscountReais ausente vira zero (não null) quando há código', () {
      final info = arenaBookingCouponInfo({'couponCode': 'X'});
      expect(info!.discountReais, 0);
    });
  });
}
