import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/onboarding/presentation/utils/onboarding_input_formatters.dart';

void main() {
  final formatter = BrPhoneInputFormatter();

  TextEditingValue format(String text) {
    return formatter.formatEditUpdate(
      const TextEditingValue(),
      TextEditingValue(text: text),
    );
  }

  group('BrPhoneInputFormatter', () {
    test('formats mobile number without RangeError', () {
      expect(format('11987654321').text, '(11) 98765-4321');
    });

    test('formats partial mobile while typing', () {
      expect(format('1198765').text, '(11) 98765');
      expect(format('11987654').text, '(11) 98765-4');
    });

    test('formats landline', () {
      expect(format('1133334444').text, '(11) 3333-4444');
    });

    test('caps at 11 digits', () {
      expect(format('11987654321999').text, '(11) 98765-4321');
    });
  });
}
