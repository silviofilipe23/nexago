import 'package:intl/intl.dart';

/// Formatação canônica de moeda do nexaGO (Real brasileiro).
///
/// Fonte única para evitar divergência de símbolo/locale/casas decimais
/// espalhada por features (`R$ 1.234,56`).
final NumberFormat _brlFormat = NumberFormat.currency(
  locale: 'pt_BR',
  symbol: r'R$',
  decimalDigits: 2,
);

/// Reais sem casas decimais, para exibição de preço cheio (`R$ 120`).
final NumberFormat _brlWholeFormat = NumberFormat.currency(
  locale: 'pt_BR',
  symbol: r'R$',
  decimalDigits: 0,
);

/// Formata um valor monetário em reais: `1234.5` → `R$ 1.234,50`.
String formatBRL(num value) => _brlFormat.format(value);

/// Formata centavos inteiros em reais: `1234` → `R$ 12,34`.
String formatBRLFromCents(int cents) => _brlFormat.format(cents / 100);

/// Reais sem decimais (preço por hora / vitrine): `120.0` → `R$ 120`.
String formatBRLWhole(num value) => _brlWholeFormat.format(value);
