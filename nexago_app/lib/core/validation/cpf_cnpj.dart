import 'package:flutter/services.dart';

/// Validação e formatação de CPF/CNPJ (Brasil).
class CpfCnpjValidator {
  CpfCnpjValidator._();

  static String digitsOnly(String raw) =>
      raw.replaceAll(RegExp(r'\D'), '');

  /// `true` quando há 11 (CPF) ou 14 (CNPJ) dígitos com dígitos verificadores válidos.
  static bool isValid(String raw) {
    final d = digitsOnly(raw);
    if (d.length == 11) return _isValidCpf(d);
    if (d.length == 14) return _isValidCnpj(d);
    return false;
  }

  /// `true` quando o usuário ainda está digitando (tamanho parcial aceitável).
  static bool hasCompleteLength(String raw) {
    final len = digitsOnly(raw).length;
    return len == 11 || len == 14;
  }

  static String? validationMessage(String raw) {
    final d = digitsOnly(raw);
    if (d.isEmpty) return null;
    if (d.length < 11) return null;
    if (d.length > 11 && d.length < 14) {
      return 'CNPJ incompleto (14 dígitos)';
    }
    if (d.length > 14) return 'Documento inválido';
    if (!isValid(raw)) {
      return d.length == 11 ? 'CPF inválido' : 'CNPJ inválido';
    }
    return null;
  }

  static String formatDisplay(String digits) {
    final d = digitsOnly(digits);
    if (d.length <= 11) return _formatCpfPartial(d);
    return _formatCnpjPartial(d);
  }

  static String _formatCpfPartial(String d) {
    if (d.isEmpty) return '';
    final b = StringBuffer();
    for (var i = 0; i < d.length; i++) {
      if (i == 3 || i == 6) b.write('.');
      if (i == 9) b.write('-');
      b.write(d[i]);
    }
    return b.toString();
  }

  static String _formatCnpjPartial(String d) {
    if (d.isEmpty) return '';
    final b = StringBuffer();
    for (var i = 0; i < d.length && i < 14; i++) {
      if (i == 2 || i == 5) b.write('.');
      if (i == 8) b.write('/');
      if (i == 12) b.write('-');
      b.write(d[i]);
    }
    return b.toString();
  }

  static bool _isValidCpf(String d) {
    if (RegExp(r'^(\d)\1{10}$').hasMatch(d)) return false;
    final n = d.split('').map(int.parse).toList();
    var sum = 0;
    for (var i = 0; i < 9; i++) {
      sum += n[i] * (10 - i);
    }
    var r = sum % 11;
    final d1 = r < 2 ? 0 : 11 - r;
    if (n[9] != d1) return false;
    sum = 0;
    for (var i = 0; i < 10; i++) {
      sum += n[i] * (11 - i);
    }
    r = sum % 11;
    final d2 = r < 2 ? 0 : 11 - r;
    return n[10] == d2;
  }

  static bool _isValidCnpj(String d) {
    if (RegExp(r'^(\d)\1{13}$').hasMatch(d)) return false;
    final n = d.split('').map(int.parse).toList();
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var sum = 0;
    for (var i = 0; i < 12; i++) {
      sum += n[i] * w1[i];
    }
    var r = sum % 11;
    final d1 = r < 2 ? 0 : 11 - r;
    if (n[12] != d1) return false;
    sum = 0;
    for (var i = 0; i < 13; i++) {
      sum += n[i] * w2[i];
    }
    r = sum % 11;
    final d2 = r < 2 ? 0 : 11 - r;
    return n[13] == d2;
  }
}

/// Máscara CPF/CNPJ enquanto o usuário digita.
class CpfCnpjInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = CpfCnpjValidator.digitsOnly(newValue.text);
    if (digits.length > 14) {
      return oldValue;
    }
    final formatted = CpfCnpjValidator.formatDisplay(digits);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
