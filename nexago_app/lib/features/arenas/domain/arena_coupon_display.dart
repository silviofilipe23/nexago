import 'arena_coupon.dart';

String arenaCouponStatusLabel(ArenaCoupon coupon) {
  if (!coupon.active) return 'Desativado';
  if (coupon.isExpired) return 'Expirado';
  if (coupon.isUsageExhausted) return 'Esgotado';
  return 'Ativo';
}

String arenaCouponDiscountLabel(ArenaCoupon coupon) {
  final fixed = coupon.fixedDiscountReais;
  if (fixed != null && fixed > 0) {
    final value = fixed == fixed.roundToDouble()
        ? fixed.toStringAsFixed(0)
        : fixed.toStringAsFixed(2).replaceAll('.', ',');
    return 'R\$ $value off';
  }

  final discount = coupon.discountPercent;
  if (discount != null && discount > 0) {
    final value = discount == discount.roundToDouble()
        ? discount.toStringAsFixed(0)
        : discount.toStringAsFixed(1).replaceAll('.', ',');
    return '$value% off';
  }

  return 'Sem desconto';
}

String arenaCouponUsageLabel(ArenaCoupon coupon) {
  final perAthlete = coupon.maxRedemptionsPerAthlete == 1
      ? '1x por cliente'
      : '${coupon.maxRedemptionsPerAthlete}x por cliente';
  final total = coupon.maxRedemptionsTotal;
  if (total == null) {
    return '${coupon.redemptionsCount} usos · $perAthlete';
  }
  return '${coupon.redemptionsCount}/$total usos · $perAthlete';
}

String arenaCouponSummaryLabel(ArenaCoupon coupon) {
  return '${arenaCouponDiscountLabel(coupon)} · ${arenaCouponUsageLabel(coupon)}';
}
