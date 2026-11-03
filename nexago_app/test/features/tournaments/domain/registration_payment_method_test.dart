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

  group('parseOnlinePaymentMethods', () {
    const pix = RegistrationPaymentMethod.pix;
    const card = RegistrationPaymentMethod.card;

    test('ausente, vazio ou lixo = Pix e cartão (acervo)', () {
      for (final raw in <Object?>[null, const [], 'pix', const ['boleto'], 3]) {
        expect(parseOnlinePaymentMethods(raw), [pix, card], reason: '$raw');
      }
    });

    test('só Pix, só cartão, os dois — sempre Pix primeiro', () {
      expect(parseOnlinePaymentMethods(const ['pix']), [pix]);
      expect(parseOnlinePaymentMethods(const ['card']), [card]);
      expect(parseOnlinePaymentMethods(const ['card', 'pix']), [pix, card]);
      expect(parseOnlinePaymentMethods(const ['card', 'boleto']), [card]);
    });
  });

  group('registrationMethodQuote', () {
    test('o cartão leva a taxa de antecipação por cima do Pix', () {
      final quote = registrationMethodQuote(
        pixCents: 10000,
        cardFeePercent: 1.33,
      );
      expect(quote.pixCents, 10000);
      expect(quote.cardFeeCents, 133);
      expect(quote.cardTotalCents, 10133);
      expect(quote.totalCents(RegistrationPaymentMethod.pix), 10000);
      expect(quote.totalCents(RegistrationPaymentMethod.card), 10133);
      expect(quote.cardFeePercent, 1.33);
    });

    test('sem percentual (backend antigo) o cartão cobra o mesmo que o Pix',
        () {
      final quote = registrationMethodQuote(pixCents: 10000, cardFeePercent: 0);
      expect(quote.cardFeeCents, 0);
      expect(quote.cardTotalCents, 10000);
      expect(quote.cardFeePercent, 0);
    });

    test('nada a cobrar (cashback cobre tudo): sem taxa', () {
      final quote = registrationMethodQuote(pixCents: 0, cardFeePercent: 1.33);
      expect(quote.cardFeeCents, 0);
      expect(quote.cardFeePercent, 0);
    });
  });

  test('formatCardFeePercent: vírgula e sem zeros à toa', () {
    expect(formatCardFeePercent(1.33), '1,33%');
    expect(formatCardFeePercent(1.5), '1,5%');
    expect(formatCardFeePercent(2), '2%');
  });
}
