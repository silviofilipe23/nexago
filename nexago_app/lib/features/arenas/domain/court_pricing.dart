import 'arena_court.dart';
import 'arena_promotion.dart';

/// Entrada para cálculo de preço de um slot (extensível para promoções).
class SlotPricingInput {
  const SlotPricingInput({
    required this.arenaId,
    required this.courtId,
    required this.date,
    required this.startTime,
    required this.durationMinutes,
    required this.hourlyBaseReais,
  });

  final String arenaId;
  final String courtId;
  final DateTime date;
  final String startTime;
  final int durationMinutes;

  /// Preço horário já resolvido (quadra → arena).
  final double hourlyBaseReais;
}

/// Resultado do cálculo de preço de um slot.
class SlotPricingResult {
  const SlotPricingResult({
    required this.baseSlotPriceReais,
    required this.finalSlotPriceReais,
    this.appliedPromotionId,
  });

  final double baseSlotPriceReais;
  final double finalSlotPriceReais;

  /// Preenchido quando regras em `arenas/{arenaId}/promotions` forem aplicadas.
  final String? appliedPromotionId;

  bool get hasPromotion =>
      appliedPromotionId != null &&
      finalSlotPriceReais < baseSlotPriceReais;
}

/// Motor de preço por quadra (base + promoções).
abstract final class CourtPricing {
  CourtPricing._();

  /// Preço horário: quadra → fallback da arena → `null` se inválido/ausente.
  static double? resolveHourlyBase({
    ArenaCourt? court,
    double? arenaFallbackPerHourReais,
    Map<String, dynamic>? courtData,
  }) {
    final fromCourt = court?.basePricePerHourReais ??
        readHourlyBaseFromCourtData(courtData);
    if (fromCourt != null && fromCourt > 0) return fromCourt;

    final fallback = arenaFallbackPerHourReais;
    if (fallback != null && fallback > 0) return fallback;
    return null;
  }

  /// Lê `basePricePerHourReais` ou `basePriceReais` do documento da quadra.
  static double? readHourlyBaseFromCourtData(Map<String, dynamic>? data) {
    if (data == null) return null;
    final perHour = (data['basePricePerHourReais'] as num?)?.toDouble();
    if (perHour != null && perHour > 0) return perHour;
    final legacy = (data['basePriceReais'] as num?)?.toDouble();
    if (legacy != null && legacy > 0) return legacy;
    return null;
  }

  /// Preço do slot = hora × (duração / 60), arredondado em 2 casas.
  static double resolveSlotPrice({
    required double hourlyBaseReais,
    required int slotDurationMinutes,
  }) {
    if (hourlyBaseReais <= 0 || slotDurationMinutes <= 0) return 0;
    final raw = hourlyBaseReais * (slotDurationMinutes / 60);
    return (raw * 100).roundToDouble() / 100;
  }

  /// Menor preço horário entre quadras (listagem "a partir de").
  static double? minHourlyPriceAmongCourts(List<ArenaCourt> courts) {
    double? min;
    for (final c in courts) {
      final p = c.basePricePerHourReais;
      if (p == null || p <= 0) continue;
      if (min == null || p < min) min = p;
    }
    return min;
  }

  /// Calcula preço base do slot + promoções ativas.
  static SlotPricingResult resolveSlotPricing(
    SlotPricingInput input, {
    List<ArenaPromotion> promotions = const [],
  }) {
    final base = resolveSlotPrice(
      hourlyBaseReais: input.hourlyBaseReais,
      slotDurationMinutes: input.durationMinutes,
    );
    return applyPromotions(input, base, promotions);
  }

  /// Entre promoções que casam, aplica a de menor preço final para o atleta.
  static SlotPricingResult applyPromotions(
    SlotPricingInput input,
    double baseSlotPriceReais,
    List<ArenaPromotion> promotions,
  ) {
    if (promotions.isEmpty || baseSlotPriceReais <= 0) {
      return SlotPricingResult(
        baseSlotPriceReais: baseSlotPriceReais,
        finalSlotPriceReais: baseSlotPriceReais,
      );
    }

    String? bestPromoId;
    var bestFinal = baseSlotPriceReais;

    for (final promo in promotions) {
      if (!promo.matches(
        courtId: input.courtId,
        date: input.date,
        slotStartTime: input.startTime,
      )) {
        continue;
      }

      final discounted = promo.applyToSlot(
        baseSlotPriceReais: baseSlotPriceReais,
        hourlyBaseReais: input.hourlyBaseReais,
        slotDurationMinutes: input.durationMinutes,
      );
      if (discounted == null) continue;
      if (discounted < bestFinal) {
        bestFinal = discounted;
        bestPromoId = promo.id;
      }
    }

    return SlotPricingResult(
      baseSlotPriceReais: baseSlotPriceReais,
      finalSlotPriceReais: bestFinal,
      appliedPromotionId: bestPromoId,
    );
  }

  /// Preço final do slot virtual (`null` se não houver base horária).
  static SlotPricingResult? virtualSlotPricing({
    required String arenaId,
    required String courtId,
    required DateTime date,
    required String startTime,
    required int slotDurationMinutes,
    Map<String, dynamic>? courtData,
    ArenaCourt? court,
    double? arenaFallbackPerHourReais,
    List<ArenaPromotion> promotions = const [],
  }) {
    final hourly = resolveHourlyBase(
      court: court,
      arenaFallbackPerHourReais: arenaFallbackPerHourReais,
      courtData: courtData,
    );
    if (hourly == null) return null;

    return resolveSlotPricing(
      SlotPricingInput(
        arenaId: arenaId,
        courtId: courtId,
        date: date,
        startTime: startTime,
        durationMinutes: slotDurationMinutes,
        hourlyBaseReais: hourly,
      ),
      promotions: promotions,
    );
  }

  /// Atalho: só o valor final (compatibilidade).
  static double? virtualSlotPriceReais({
    required String arenaId,
    required String courtId,
    required DateTime date,
    required String startTime,
    required int slotDurationMinutes,
    Map<String, dynamic>? courtData,
    ArenaCourt? court,
    double? arenaFallbackPerHourReais,
    List<ArenaPromotion> promotions = const [],
  }) {
    return virtualSlotPricing(
      arenaId: arenaId,
      courtId: courtId,
      date: date,
      startTime: startTime,
      slotDurationMinutes: slotDurationMinutes,
      courtData: courtData,
      court: court,
      arenaFallbackPerHourReais: arenaFallbackPerHourReais,
      promotions: promotions,
    )?.finalSlotPriceReais;
  }
}
