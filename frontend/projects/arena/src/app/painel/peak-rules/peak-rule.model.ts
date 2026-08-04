import type { ArenaPeakRule } from '@nexago/arena-discovery';

/** Helpers de exibição da tela Horários de pico. Weekdays reutilizam
 *  `formatWeekdays` de `../promotions/promotion.model`. */

export function formatMinDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

export function formatRelease(hours: number | null): string {
  return hours == null ? 'Não libera' : `${hours}h antes`;
}

export function peakRuleScopeLabel(rule: ArenaPeakRule): string {
  if (rule.courtIds.length === 0) return 'Todas as quadras';
  return `${rule.courtIds.length} quadra${rule.courtIds.length === 1 ? '' : 's'}`;
}
