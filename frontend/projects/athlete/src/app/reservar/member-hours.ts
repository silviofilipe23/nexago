import type { MemberHoursBlockedReason } from '../data/arena-bookings-repository';

/** Horas do banco do mensalista: 90 → "1h30", 60 → "1h", 30 → "30min". */
export function formatMemberHours(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** Saldo da semana depois desta reserva ("Restam 2h de 3h nesta semana"). */
export function memberHoursBalanceLabel(availableMinutes: number, usedMinutes: number, weeklyMinutes: number): string | null {
  if (weeklyMinutes <= 0) return null;
  const left = Math.max(0, availableMinutes - usedMinutes);
  const weekly = formatMemberHours(weeklyMinutes);
  if (left === 0) return `Esta reserva usa o que restava das suas ${weekly} desta semana.`;
  return `Restam ${formatMemberHours(left)} de ${weekly} nesta semana`;
}

/** Aviso quando o banco não cobriu a reserva. O cupom mais barato já aparece no próprio cupom. */
export function memberHoursBlockedNotice(reason: MemberHoursBlockedReason | null | undefined): string | null {
  switch (reason) {
    case 'overdue':
      return 'Mensalidade em aberto: esta reserva sai pelo preço normal até você pagar.';
    case 'exhausted':
      return 'Suas horas desta semana acabaram: esta reserva sai pelo preço normal.';
    default:
      return null;
  }
}
