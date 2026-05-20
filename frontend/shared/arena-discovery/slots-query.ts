export interface SlotsQuery {
  arenaId: string;
  courtId: string;
  date: Date;
  arenaFallbackPricePerHourReais?: number | null;
}

export function slotsQueryDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function readArenaFallbackPricePerHour(
  data: Record<string, unknown> | null | undefined,
): number | null {
  if (!data) {
    return null;
  }
  const v =
    (typeof data['pricePerHourReais'] === 'number' ? data['pricePerHourReais'] : null) ??
    (typeof data['basePriceReais'] === 'number' ? data['basePriceReais'] : null);
  return v != null && v > 0 ? v : null;
}
