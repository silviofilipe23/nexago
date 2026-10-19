import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/features/tournaments/domain/registration_payment_method.dart';

void main() {
  group('registrationChargeButtonLabel', () {
    test('PIX mantém o texto de sempre', () {
      expect(
        registrationChargeButtonLabel(
          RegistrationPaymentMethod.pix,
          chargeReais: 100,
        ),
        'Gerar PIX',
      );
    });

    test('cartão diz o valor que vai ser cobrado', () {
      expect(
        registrationChargeButtonLabel(
          RegistrationPaymentMethod.card,
          chargeReais: 92.5,
        ),
        'Pagar ${formatBRL(92.5)} no cartão',
      );
    });
  });

  group('registrationChargePageTitle', () {
    test('neutro enquanto escolhe, depois o meio da cobrança viva', () {
      expect(registrationChargePageTitle(null), 'Pagamento');
      expect(
        registrationChargePageTitle(RegistrationPaymentMethod.pix),
        'Pagamento via PIX',
      );
      expect(
        registrationChargePageTitle(RegistrationPaymentMethod.card),
        'Pagamento com cartão',
      );
    });
  });
}
