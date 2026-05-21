import 'package:flutter/services.dart';

/// Máscara `(00) 00000-0000` / `(00) 0000-0000`.
class BrPhoneInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    var digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) {
      return const TextEditingValue(text: '');
    }
    // (DD) + até 9 dígitos (celular) ou 8 (fixo).
    if (digits.length > 11) {
      digits = digits.substring(0, 11);
    }

    final buf = StringBuffer();
    if (digits.isNotEmpty) {
      buf.write('(');
      final ddd = digits.length >= 2 ? digits.substring(0, 2) : digits;
      buf.write(ddd);
      if (digits.length >= 2) buf.write(') ');
    }
    if (digits.length > 2) {
      final rest = digits.substring(2);
      final isMobile = rest.startsWith('9');
      if (isMobile) {
        if (rest.length > 5) {
          final suffixEnd = rest.length.clamp(5, 9);
          buf.write('${rest.substring(0, 5)}-${rest.substring(5, suffixEnd)}');
        } else {
          buf.write(rest);
        }
      } else if (rest.length > 4) {
        final suffixEnd = rest.length.clamp(4, 8);
        buf.write('${rest.substring(0, 4)}-${rest.substring(4, suffixEnd)}');
      } else {
        buf.write(rest);
      }
    }

    final text = buf.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// Máscara `dd/mm/aaaa`.
class BrDateInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) {
      return const TextEditingValue(text: '');
    }

    final buf = StringBuffer();
    for (var i = 0; i < digits.length && i < 8; i++) {
      if (i == 2 || i == 4) buf.write('/');
      buf.write(digits[i]);
    }

    final text = buf.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
