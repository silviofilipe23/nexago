/// Cupom de marketing da arena (`arenas/{arenaId}/coupons/{couponId}`).
/// Espelha a resposta das callables em `functions/src/arena-coupons.ts`
/// (`createArenaCoupon`/`listArenaCoupons`/`deactivateArenaCoupon`).
///
/// Não confundir com `ArenaPromotion`: promoção é desconto automático por
/// quadra/dia/horário; cupom é um código digitado pelo cliente, com
/// validade e limite de uso por atleta.
class ArenaCoupon {
  const ArenaCoupon({
    required this.id,
    required this.code,
    required this.active,
    this.discountPercent,
    this.fixedDiscountReais,
    this.validFrom,
    this.validUntil,
    this.maxRedemptionsTotal,
    required this.maxRedemptionsPerAthlete,
    required this.redemptionsCount,
  });

  final String id;
  final String code;
  final bool active;
  final double? discountPercent;
  final double? fixedDiscountReais;
  final DateTime? validFrom;
  final DateTime? validUntil;

  /// `null` = sem limite agregado de uso.
  final int? maxRedemptionsTotal;
  final int maxRedemptionsPerAthlete;
  final int redemptionsCount;

  factory ArenaCoupon.fromMap(Map<String, dynamic> map) {
    return ArenaCoupon(
      id: (map['id'] as String?)?.trim() ?? '',
      code: (map['code'] as String?)?.trim() ?? '',
      active: map['active'] == true,
      discountPercent: (map['discountPercent'] as num?)?.toDouble(),
      fixedDiscountReais: (map['fixedDiscountReais'] as num?)?.toDouble(),
      validFrom: _parseIso(map['validFrom']),
      validUntil: _parseIso(map['validUntil']),
      maxRedemptionsTotal: (map['maxRedemptionsTotal'] as num?)?.toInt(),
      maxRedemptionsPerAthlete:
          (map['maxRedemptionsPerAthlete'] as num?)?.toInt() ?? 1,
      redemptionsCount: (map['redemptionsCount'] as num?)?.toInt() ?? 0,
    );
  }

  static DateTime? _parseIso(dynamic v) {
    if (v is String && v.isNotEmpty) return DateTime.tryParse(v);
    return null;
  }

  bool get isExpired =>
      validUntil != null && DateTime.now().isAfter(validUntil!);

  bool get isUsageExhausted =>
      maxRedemptionsTotal != null && redemptionsCount >= maxRedemptionsTotal!;

  /// Ativo, dentro da validade e com uso disponível — não garante que o
  /// atleta específico ainda pode resgatar (limite por atleta é checado
  /// server-side, não é exposto na listagem do gestor).
  bool get isUsableNow => active && !isExpired && !isUsageExhausted;
}
