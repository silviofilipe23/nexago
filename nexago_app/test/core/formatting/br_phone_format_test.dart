import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/br_phone_format.dart';

void main() {
  group('formatPhoneBrDisplay', () {
    test('masks 10 and 11 digit numbers', () {
      expect(formatPhoneBrDisplay('62999999999'), '(62) 99999-9999');
      expect(formatPhoneBrDisplay('6233334444'), '(62) 3333-4444');
      expect(formatPhoneBrDisplay('(62) 99999-9999'), '(62) 99999-9999');
    });

    test('strips the country code from verified E.164 numbers', () {
      // É o formato que `confirmPhoneVerification` grava em `users/{uid}`.
      // Sem isso, toda tela que exibe o telefone mostra o número cru.
      expect(formatPhoneBrDisplay('+5562999999999'), '(62) 99999-9999');
      expect(formatPhoneBrDisplay('5562999999999'), '(62) 99999-9999');
      expect(formatPhoneBrDisplay('+556233334444'), '(62) 3333-4444');
    });

    test('returns null when there are not enough digits', () {
      expect(formatPhoneBrDisplay(null), isNull);
      expect(formatPhoneBrDisplay(''), isNull);
      expect(formatPhoneBrDisplay('123'), isNull);
      // Só o código do país não vira telefone.
      expect(formatPhoneBrDisplay('+55'), isNull);
    });
  });
}
