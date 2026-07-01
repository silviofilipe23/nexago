import 'package:flutter/services.dart';

/// Validação e formatação de CPF/CNPJ (Brasil).
///
/// Suporta o **novo CNPJ alfanumérico** (Receita Federal, vigência 2026): 14
/// posições, as 12 primeiras alfanuméricas (0-9/A-Z) e os 2 dígitos verificadores
/// numéricos. O cálculo dos DVs usa `valor = codeUnit - 48` (assim '0'..'9' → 0..9
/// e 'A'..'Z' → 17..42). CPF e CNPJ numérico legado continuam funcionando.
class CpfCnpjValidator {
  CpfCnpjValidator._();

  /// Só dígitos (uso legado — ex.: chave PIX numérica).
  static String digitsOnly(String raw) => raw.replaceAll(RegExp(r'\D'), '');

  /// Normaliza para o padrão do documento: maiúsculas, mantém `[0-9A-Z]`.
  static String normalize(String raw) =>
      raw.toUpperCase().replaceAll(RegExp(r'[^0-9A-Z]'), '');

  /// `true` para CPF (11 dígitos) ou CNPJ (14, alfanumérico) com DV válido.
  static bool isValid(String raw) {
    final s = normalize(raw);
    if (s.length == 11 && RegExp(r'^\d{11}$').hasMatch(s)) return _isValidCpf(s);
    if (s.length == 14) return _isValidCnpj(s);
    return false;
  }

  /// `true` quando atingiu o tamanho de um documento completo (11 ou 14).
  static bool hasCompleteLength(String raw) {
    final len = normalize(raw).length;
    return len == 11 || len == 14;
  }

  static String? validationMessage(String raw) {
    final s = normalize(raw);
    if (s.isEmpty) return null;
    final hasLetter = RegExp(r'[A-Z]').hasMatch(s);
    if (!hasLetter) {
      if (s.length < 11) return null;
      if (s.length == 11) return _isValidCpf(s) ? null : 'CPF inválido';
      if (s.length < 14) return 'CNPJ incompleto (14 caracteres)';
      if (s.length > 14) return 'Documento inválido';
      return _isValidCnpj(s) ? null : 'CNPJ inválido';
    }
    // Contém letra ⇒ CNPJ alfanumérico.
    if (s.length < 14) return 'CNPJ incompleto (14 caracteres)';
    if (s.length > 14) return 'Documento inválido';
    return _isValidCnpj(s) ? null : 'CNPJ inválido';
  }

  static String formatDisplay(String raw) {
    final s = normalize(raw);
    final looksCnpj = s.length > 11 || RegExp(r'[A-Z]').hasMatch(s);
    return looksCnpj ? _formatCnpjPartial(s) : _formatCpfPartial(s);
  }

  static String _formatCpfPartial(String d) {
    if (d.isEmpty) return '';
    final b = StringBuffer();
    for (var i = 0; i < d.length && i < 11; i++) {
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

  /// Valor do caractere no cálculo alfanumérico: '0'→0 … '9'→9, 'A'→17 … 'Z'→42.
  static int _charValue(String c) => c.codeUnitAt(0) - 48;

  static bool _isValidCnpj(String s) {
    // 12 posições alfanuméricas + 2 dígitos verificadores numéricos.
    if (!RegExp(r'^[0-9A-Z]{12}[0-9]{2}$').hasMatch(s)) return false;
    // Rejeita repetição total (só faz sentido em CNPJ numérico).
    if (RegExp(r'^(\d)\1{13}$').hasMatch(s)) return false;

    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    var sum = 0;
    for (var i = 0; i < 12; i++) {
      sum += _charValue(s[i]) * w1[i];
    }
    var r = sum % 11;
    final d1 = r < 2 ? 0 : 11 - r;
    if (int.parse(s[12]) != d1) return false;

    sum = 0;
    for (var i = 0; i < 13; i++) {
      sum += _charValue(s[i]) * w2[i];
    }
    r = sum % 11;
    final d2 = r < 2 ? 0 : 11 - r;
    return int.parse(s[13]) == d2;
  }
}

/// Máscara CPF/CNPJ enquanto o usuário digita (aceita CNPJ alfanumérico).
class CpfCnpjInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final normalized = CpfCnpjValidator.normalize(newValue.text);
    if (normalized.length > 14) {
      return oldValue;
    }
    final formatted = CpfCnpjValidator.formatDisplay(normalized);
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
