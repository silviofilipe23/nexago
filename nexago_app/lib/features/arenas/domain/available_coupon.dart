import '../../../core/formatting/app_currency_format.dart';

/// Cupom que a arena divulga no app e que o atleta ainda pode usar
/// (`listAvailableArenaCoupons`). É atalho: aplicar continua passando pela
/// cotação do servidor, que valida de novo.
class AvailableCoupon {
  const AvailableCoupon({
    required this.code,
    this.discountPercent,
    this.fixedDiscountReais,
    this.validUntil,
  });

  final String code;
  final double? discountPercent;
  final double? fixedDiscountReais;
  final DateTime? validUntil;

  /// `null` para item sem código (resposta estranha do servidor).
  static AvailableCoupon? fromMap(Map<String, dynamic> map) {
    final code = (map['code'] as String?)?.trim() ?? '';
    if (code.isEmpty) return null;
    final until = map['validUntil'];
    return AvailableCoupon(
      code: code,
      discountPercent: (map['discountPercent'] as num?)?.toDouble(),
      fixedDiscountReais: (map['fixedDiscountReais'] as num?)?.toDouble(),
      validUntil: until is String ? DateTime.tryParse(until)?.toLocal() : null,
    );
  }

  /// "10% off" ou "R$ 15,00 off".
  String get discountLabel {
    final fixed = fixedDiscountReais;
    if (fixed != null && fixed > 0) return '${formatBRL(fixed)} off';
    final pct = discountPercent;
    if (pct != null && pct > 0) {
      final text = pct == pct.roundToDouble()
          ? pct.toStringAsFixed(0)
          : pct.toStringAsFixed(1).replaceAll('.', ',');
      return '$text% off';
    }
    return 'Desconto';
  }
}
