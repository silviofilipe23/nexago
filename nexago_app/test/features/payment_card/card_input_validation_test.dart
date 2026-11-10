import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/payment_card/domain/card_input_validation.dart';
import 'package:nexago_app/features/payment_card/domain/saved_payment_card.dart';

TextEditingValue _fmt(TextInputFormatter f, String text) =>
    f.formatEditUpdate(TextEditingValue.empty, TextEditingValue(text: text));

void main() {
  test('luhn', () {
    expect(luhnValid('4111111111111111'), isTrue);
    expect(luhnValid('4111111111111112'), isFalse);
    expect(validateCardNumber('4111 1111 1111 1111'), isNull);
    expect(validateCardNumber('4111 1111 1111 1112'),
        'Número do cartão inválido.');
  });

  test('validade vale até o fim do mês', () {
    final now = DateTime(2026, 11, 10);
    expect(validateExpiry('12/26', now), isNull);
    expect(validateExpiry('11/26', now), isNull);
    expect(validateExpiry('10/26', now), 'Validade inválida.');
    expect(validateExpiry('13/30', now), 'Validade inválida.');
    expect(validateExpiry('1', now), 'Validade inválida.');
  });

  test('ccv e cep', () {
    expect(validateCcv('123'), isNull);
    expect(validateCcv('1234'), isNull);
    expect(validateCcv('12'), 'CVV inválido.');
    expect(validateCep('74000-000'), isNull);
    expect(validateCep('7400'), 'CEP inválido.');
  });

  test('formatters', () {
    expect(_fmt(CardNumberInputFormatter(), '4111111111111111').text,
        '4111 1111 1111 1111');
    expect(_fmt(CardNumberInputFormatter(), '41111111111111111111234').text,
        '4111 1111 1111 1111 111');
    expect(_fmt(CardExpiryInputFormatter(), '1226').text, '12/26');
    expect(_fmt(CardExpiryInputFormatter(), '12').text, '12');
  });

  test('SavedPaymentCard label e toMap', () {
    expect(
      const SavedPaymentCard(
              brand: 'VISA', last4: '4242', expiryMonth: 12, expiryYear: 2026)
          .label,
      'Visa final 4242',
    );
    expect(
      const SavedPaymentCard(
              brand: 'DINERS', last4: '1', expiryMonth: 1, expiryYear: 2027)
          .label,
      'DINERS final 1',
    );
    const input = PaymentCardInput(
      number: '4111 1111 1111 1111',
      holderName: ' Fulano ',
      expiryMonth: 12,
      expiryYear: 2026,
      ccv: '123',
      postalCode: '74000-000',
      addressNumber: '10',
    );
    expect(input.toMap()['number'], '4111111111111111');
    expect(input.toMap()['postalCode'], '74000000');
    expect(input.toMap()['holderName'], 'Fulano');
  });
}
