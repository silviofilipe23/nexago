import 'package:flutter/services.dart';

/// Formata telefone brasileiro para exibição (10 ou 11 dígitos).
///
/// Aceita também E.164 (`+5562999999999`), formato gravado em
/// `users/{uid}.phoneNumber` pela Cloud Function `confirmPhoneVerification`
/// depois da verificação por SMS — o código do país sai antes da máscara.
String? formatPhoneBrDisplay(String? raw) {
  var digits = (raw ?? '').replaceAll(RegExp(r'\D'), '');
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')) {
    digits = digits.substring(2);
  }
  if (digits.length < 10) return null;
  if (digits.length == 11) {
    return '(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}';
  }
  if (digits.length == 10) {
    return '(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}';
  }
  return digits;
}

/// Dígitos de um telefone brasileiro, sem o +55 e limitados a 11.
String _brPhoneDigits(String raw) {
  var digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.length >= 12 && digits.startsWith('55')) {
    digits = digits.substring(2);
  }
  return digits.length > 11 ? digits.substring(0, 11) : digits;
}

String _maskBrPhone(String digits) {
  if (digits.isEmpty) return '';
  if (digits.length < 2) return '($digits';
  final ddd = digits.substring(0, 2);
  final rest = digits.substring(2);
  final split = digits.length > 10 ? 5 : 4;
  if (rest.length <= split) return '($ddd) $rest';
  return '($ddd) ${rest.substring(0, split)}-${rest.substring(split)}';
}

/// Máscara de telefone brasileiro enquanto o usuário digita.
///
/// Até 10 dígitos usa `(NN) NNNN-NNNN` (fixo); no 11º reflui para
/// `(NN) NNNNN-NNNN` (celular). Colar um número em E.164 descarta o `55`.
class BrPhoneInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = _brPhoneDigits(newValue.text);
    final formatted = _maskBrPhone(digits);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
