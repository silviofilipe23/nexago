import type { ArenaPromotion } from '@nexago/arena-discovery';

/** Espelha `ArenaPromotion`/`ArenaPromotionDisplay` (Flutter) — dias da semana são ISO
 *  (1=segunda…7=domingo), vazio = todos os dias. Sem limite de uso — não existe contagem de
 *  resgates no backend. Sem status "agendada"/"expirada" persistido — só `active` (boolean);
 *  as demais são derivadas aqui de `validFrom`/`validUntil` vs. hoje, pra manter a UX da lista. */

export const PROMO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const PROMO_WEEKDAY_LABEL: Record<number, string> = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
  7: 'Dom',
};

export type PromoDisplayStatus = 'ativa' | 'agendada' | 'expirada' | 'pausada';

export const PROMO_STATUS_LABEL: Record<PromoDisplayStatus, string> = {
  ativa: 'Ativa',
  agendada: 'Agendada',
  expirada: 'Expirada',
  pausada: 'Pausada',
};

/** Deriva o status exibido na lista — não é persistido, só `active` existe no Firestore. */
export function derivePromoStatus(promo: Pick<ArenaPromotion, 'active' | 'validFrom' | 'validUntil'>, now = new Date()): PromoDisplayStatus {
  if (!promo.active) return 'pausada';
  if (promo.validFrom && now < promo.validFrom) return 'agendada';
  if (promo.validUntil && now > promo.validUntil) return 'expirada';
  return 'ativa';
}

export function formatDiscount(promo: Pick<ArenaPromotion, 'discountPercent' | 'fixedPricePerHourReais'>): string {
  if (promo.fixedPricePerHourReais != null) {
    return `R$ ${promo.fixedPricePerHourReais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/h`;
  }
  if (promo.discountPercent != null) {
    return `${promo.discountPercent}%`;
  }
  return '—';
}

export function formatWeekdays(weekdays: readonly number[]): string {
  if (weekdays.length === 0) return 'Todos os dias';
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => PROMO_WEEKDAY_LABEL[d] ?? '?')
    .join(', ');
}

/** "YYYY-MM-DD" pra `<input type="date">`. */
export function dateToInputValue(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function inputValueToDate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
