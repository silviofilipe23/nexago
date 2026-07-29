/** Espelha `ArenaOccupancyReport`/`ArenaOccupancyCourtBreakdown` (`functions/src/arena-occupancy-report.ts`). */

export interface ArenaOccupancyCourtBreakdown {
  courtId: string;
  courtName: string;
  hoursReserved: number;
  bookingsCount: number;
}

export interface ArenaOccupancyReport {
  arenaId: string;
  dateFrom: string;
  dateTo: string;
  totalBookings: number;
  totalHoursReserved: number;
  uniqueAthletesCount: number;
  noShowCount: number;
  attendanceResolvedCount: number;
  noShowRatePercent: number;
  recurringBookingsCount: number;
  standaloneBookingsCount: number;
  recurringSharePercent: number;
  courts: ArenaOccupancyCourtBreakdown[];
}

export type OccupancyRangeShortcut = 7 | 30 | 90;

/** `YYYY-MM-DD` a partir de um `Date` local (mesmo padrão de `bookings/arena-booking.model.ts`/`promotion.model.ts`). */
export function dateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}

/** Intervalo inclusive terminando hoje, ex. `days=30` → últimos 30 dias (hoje - 29 até hoje). */
export function lastNDaysRange(days: OccupancyRangeShortcut, reference: Date = new Date()): DateRange {
  const to = dateKeyOf(reference);
  const fromDate = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - (days - 1));
  return { dateFrom: dateKeyOf(fromDate), dateTo: to };
}

export function formatHours(hours: number): string {
  return `${hours.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} h`;
}

export function formatPercent(pct: number): string {
  return `${pct.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

export function formatDateBR(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(y, m - 1, d));
}
