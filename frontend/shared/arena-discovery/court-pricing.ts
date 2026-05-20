import {
  promotionApplyToSlot,
  promotionMatches,
  type ArenaPromotion,
} from './arena-promotion';

export interface SlotPricingResult {
  baseSlotPriceReais: number;
  finalSlotPriceReais: number;
  appliedPromotionId: string | null;
}

export function readHourlyBaseFromCourtData(
  data: Record<string, unknown> | null | undefined,
): number | null {
  if (!data) {
    return null;
  }
  const v =
    (typeof data['basePricePerHourReais'] === 'number'
      ? data['basePricePerHourReais']
      : null) ??
    (typeof data['basePriceReais'] === 'number' ? data['basePriceReais'] : null);
  return v != null && v > 0 ? v : null;
}

export function resolveHourlyBase(
  courtData: Record<string, unknown> | null | undefined,
  arenaFallbackPerHourReais: number | null | undefined,
): number | null {
  const fromCourt = readHourlyBaseFromCourtData(courtData);
  if (fromCourt != null) {
    return fromCourt;
  }
  if (arenaFallbackPerHourReais != null && arenaFallbackPerHourReais > 0) {
    return arenaFallbackPerHourReais;
  }
  return null;
}

export function resolveSlotPrice(hourlyBaseReais: number, slotDurationMinutes: number): number {
  if (hourlyBaseReais <= 0 || slotDurationMinutes <= 0) {
    return 0;
  }
  return Math.round(hourlyBaseReais * (slotDurationMinutes / 60) * 100) / 100;
}

export function minHourlyPriceAmongCourtDocs(
  courts: { id: string; data: Record<string, unknown> }[],
): number | null {
  let min: number | null = null;
  for (const c of courts) {
    const p = readHourlyBaseFromCourtData(c.data);
    if (p != null && (min == null || p < min)) {
      min = p;
    }
  }
  return min;
}

export function virtualSlotPricing(params: {
  courtId: string;
  date: Date;
  startTime: string;
  slotDurationMinutes: number;
  courtData: Record<string, unknown> | null | undefined;
  arenaFallbackPerHourReais: number | null | undefined;
  promotions: ArenaPromotion[];
}): SlotPricingResult | null {
  const hourly = resolveHourlyBase(params.courtData, params.arenaFallbackPerHourReais);
  if (hourly == null) {
    return null;
  }
  const base = resolveSlotPrice(hourly, params.slotDurationMinutes);
  return applyPromotions(
    params.courtId,
    params.date,
    params.startTime,
    base,
    params.slotDurationMinutes,
    params.promotions,
  );
}

function applyPromotions(
  courtId: string,
  date: Date,
  startTime: string,
  baseSlotPriceReais: number,
  slotDurationMinutes: number,
  promotions: ArenaPromotion[],
): SlotPricingResult {
  if (promotions.length === 0 || baseSlotPriceReais <= 0) {
    return {
      baseSlotPriceReais,
      finalSlotPriceReais: baseSlotPriceReais,
      appliedPromotionId: null,
    };
  }
  let bestPromoId: string | null = null;
  let bestFinal = baseSlotPriceReais;
  for (const promo of promotions) {
    if (!promotionMatches(promo, courtId, date, startTime)) {
      continue;
    }
    const discounted = promotionApplyToSlot(promo, baseSlotPriceReais, slotDurationMinutes);
    if (discounted != null && discounted < bestFinal) {
      bestFinal = discounted;
      bestPromoId = promo.id;
    }
  }
  return {
    baseSlotPriceReais,
    finalSlotPriceReais: bestFinal,
    appliedPromotionId: bestPromoId,
  };
}
