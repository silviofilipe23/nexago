import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/br_phone_format.dart';

TextEditingValue _typed(String text) => TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );

String _mask(String typed) => BrPhoneInputFormatter()
    .formatEditUpdate(TextEditingValue.empty, _typed(typed))
    .text;

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

  group('BrPhoneInputFormatter', () {
    test('masks the number progressively while typing', () {
      expect(_mask('6'), '(6');
      expect(_mask('62'), '(62) ');
      expect(_mask('629'), '(62) 9');
      expect(_mask('629999'), '(62) 9999');
      expect(_mask('6299999'), '(62) 9999-9');
      // O traço só reflui no 11º dígito, quando o número vira celular.
      expect(_mask('6233334444'), '(62) 3333-4444');
      expect(_mask('62999999999'), '(62) 99999-9999');
    });

    test('ignores digits beyond the 11th', () {
      expect(_mask('629999999990000'), '(62) 99999-9999');
    });

    test('reformats a pasted number that already has a mask', () {
      expect(_mask('(62) 99999-9999'), '(62) 99999-9999');
    });

    test('drops the country code of a pasted E.164 number', () {
      // É o formato que `confirmPhoneVerification` grava — colar o número
      // verificado no campo não pode virar um DDD 55.
      expect(_mask('+55 62 99999-9999'), '(62) 99999-9999');
      expect(_mask('+5562999999999'), '(62) 99999-9999');
    });

    test('keeps the caret at the end of the masked text', () {
      final result = BrPhoneInputFormatter()
          .formatEditUpdate(TextEditingValue.empty, _typed('62999999999'));
      expect(result.selection.baseOffset, result.text.length);
    });
  });
}
