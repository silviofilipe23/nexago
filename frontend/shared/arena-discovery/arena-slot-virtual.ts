import type { ArenaSlot } from './arena-slot';

export function arenaSlotVirtual(params: {
  arenaId: string;
  courtId: string;
  date: Date;
  startTime: string;
  endTime: string;
  priceReais?: number | null;
  basePriceReais?: number | null;
  appliedPromotionId?: string | null;
}): ArenaSlot {
  const day = new Date(params.date.getFullYear(), params.date.getMonth(), params.date.getDate());
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, '0');
  const d = String(day.getDate()).padStart(2, '0');
  const id = `v_${y}${m}${d}_${params.courtId}_${params.startTime.replace(':', '')}_${params.endTime.replace(':', '')}`;
  return {
    id,
    arenaId: params.arenaId,
    courtId: params.courtId,
    date: day,
    startTime: params.startTime,
    endTime: params.endTime,
    rawStatus: 'available',
    priceReais: params.priceReais ?? null,
    basePriceReais: params.basePriceReais ?? null,
    appliedPromotionId: params.appliedPromotionId ?? null,
    isVirtual: true,
  };
}
