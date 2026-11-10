import 'package:flutter/services.dart';

/// Validação local do cartão, espelho da do servidor: evita ida e volta
/// com dado óbvio errado. Funções puras, sem log.

bool luhnValid(String digits) {
  if (digits.isEmpty || !RegExp(r'^\d+$').hasMatch(digits)) return false;
  var sum = 0;
  var alt = false;
  for (var i = digits.length - 1; i >= 0; i--) {
    var d = int.parse(digits[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 == 0;
}

String _digits(String s) => s.replaceAll(RegExp(r'\D'), '');

String? validateCardNumber(String value) {
  final d = _digits(value);
  if (d.length < 13 || d.length > 19 || !luhnValid(d)) {
    return 'Número do cartão inválido.';
  }
  return null;
}

/// [mmYy] no formato "MM/AA" (ou só dígitos). Vale até o fim do mês.
String? validateExpiry(String mmYy, DateTime now) {
  final parsed = parseExpiry(mmYy);
  if (parsed == null) return 'Validade inválida.';
  final (month, year) = parsed;
  if (year < now.year || (year == now.year && month < now.month)) {
    return 'Validade inválida.';
  }
  return null;
}

/// "MM/AA" -> (mês, ano com 4 dígitos), ou null se malformado.
(int, int)? parseExpiry(String mmYy) {
  final d = _digits(mmYy);
  if (d.length != 4) return null;
  final month = int.parse(d.substring(0, 2));
  final year = 2000 + int.parse(d.substring(2, 4));
  if (month < 1 || month > 12) return null;
  return (month, year);
}

String? validateCcv(String value) {
  final d = _digits(value);
  return d.length == 3 || d.length == 4 ? null : 'CVV inválido.';
}

String? validateCep(String value) =>
    _digits(value).length == 8 ? null : 'CEP inválido.';

TextEditingValue _collapsed(String text) => TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );

/// Número do cartão em grupos de 4, até 19 dígitos.
class CardNumberInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    var d = _digits(newValue.text);
    if (d.length > 19) d = d.substring(0, 19);
    final buf = StringBuffer();
    for (var i = 0; i < d.length; i++) {
      if (i > 0 && i % 4 == 0) buf.write(' ');
      buf.write(d[i]);
    }
    return _collapsed(buf.toString());
  }
}

/// Validade "MM/AA".
class CardExpiryInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    var d = _digits(newValue.text);
    if (d.length > 4) d = d.substring(0, 4);
    return _collapsed(
        d.length > 2 ? '${d.substring(0, 2)}/${d.substring(2)}' : d);
  }
}

/// CEP "00000-000".
class CepInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    var d = _digits(newValue.text);
    if (d.length > 8) d = d.substring(0, 8);
    return _collapsed(
        d.length > 5 ? '${d.substring(0, 5)}-${d.substring(5)}' : d);
  }
}
