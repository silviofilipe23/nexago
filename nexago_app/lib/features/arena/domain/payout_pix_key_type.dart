import '../../../core/validation/cpf_cnpj.dart';

/// Tipos aceitos pela API Asaas (`pixAddressKeyType`).
enum PayoutPixKeyType {
  cpf('CPF', 'CPF'),
  cnpj('CNPJ', 'CNPJ'),
  email('EMAIL', 'E-mail'),
  phone('PHONE', 'Celular (com DDD)'),
  evp('EVP', 'Chave aleatória');

  const PayoutPixKeyType(this.asaasValue, this.label);

  final String asaasValue;
  final String label;

  static PayoutPixKeyType? fromAsaas(String? raw) {
    final v = raw?.trim().toUpperCase();
    if (v == null || v.isEmpty) return null;
    for (final t in PayoutPixKeyType.values) {
      if (t.asaasValue == v) return t;
    }
    return null;
  }

  /// Inferência alinhada ao backend (`inferPixKeyType`).
  static PayoutPixKeyType inferFromKey(String pixKey) {
    final key = pixKey.trim();
    if (key.contains('@')) return PayoutPixKeyType.email;
    final digits = CpfCnpjValidator.digitsOnly(key);
    if (digits.length == 11) return PayoutPixKeyType.cpf;
    if (digits.length == 14) return PayoutPixKeyType.cnpj;
    final evp = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
      caseSensitive: false,
    );
    if (evp.hasMatch(key)) return PayoutPixKeyType.evp;
    if (digits.length >= 10 && digits.length <= 13) return PayoutPixKeyType.phone;
    return PayoutPixKeyType.email;
  }

  static PayoutPixKeyType initial({String? storedType, String pixKey = ''}) {
    return fromAsaas(storedType) ?? inferFromKey(pixKey);
  }

  String? validateKey(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return null;
    switch (this) {
      case PayoutPixKeyType.cpf:
        final d = CpfCnpjValidator.digitsOnly(trimmed);
        if (d.length != 11) return 'CPF deve ter 11 dígitos';
        if (!CpfCnpjValidator.isValid(trimmed)) return 'CPF inválido';
        return null;
      case PayoutPixKeyType.cnpj:
        final d = CpfCnpjValidator.digitsOnly(trimmed);
        if (d.length != 14) return 'CNPJ deve ter 14 dígitos';
        if (!CpfCnpjValidator.isValid(trimmed)) return 'CNPJ inválido';
        return null;
      case PayoutPixKeyType.email:
        if (!trimmed.contains('@') || trimmed.length < 5) {
          return 'E-mail inválido';
        }
        return null;
      case PayoutPixKeyType.phone:
        final d = CpfCnpjValidator.digitsOnly(trimmed);
        if (d.length < 10 || d.length > 11) {
          return 'Telefone com DDD: 10 ou 11 dígitos (ex.: 62999853983)';
        }
        return null;
      case PayoutPixKeyType.evp:
        final evp = RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
          caseSensitive: false,
        );
        if (!evp.hasMatch(trimmed)) return 'Chave aleatória inválida';
        return null;
    }
  }

  String hintForField() {
    switch (this) {
      case PayoutPixKeyType.cpf:
        return 'Somente números do CPF';
      case PayoutPixKeyType.cnpj:
        return 'Somente números do CNPJ';
      case PayoutPixKeyType.email:
        return 'ex.: arena@email.com';
      case PayoutPixKeyType.phone:
        return 'DDD + número, só dígitos (11)';
      case PayoutPixKeyType.evp:
        return 'UUID da chave aleatória';
    }
  }
}
