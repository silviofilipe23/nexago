import { timeToMinutes } from '../../domain/dates';
import type { TrainingClass } from '../../domain/models';

/** Janela de funcionamento considerada na ocupação: 06h–22h, 7 dias. */
export const OPEN_START_MIN = 6 * 60;
export const OPEN_END_MIN = 22 * 60;
export const OPEN_MINUTES_PER_WEEK = (OPEN_END_MIN - OPEN_START_MIN) * 7;

/** Minutos de uma aula que caem dentro da janela 06–22h. */
function minutesInWindow(startTime: string, durationMin: number): number {
  const a = Math.max(timeToMinutes(startTime), OPEN_START_MIN);
  const b = Math.min(timeToMinutes(startTime) + durationMin, OPEN_END_MIN);
  return Math.max(0, b - a);
}

/**
 * Ocupação semanal da quadra (%): horas de aula por semana das turmas ATIVAS na quadra ÷ horas
 * de 06–22h × 7. Rascunho e encerrada não contam (não têm aula acontecendo).
 */
export function courtOccupancy(
  classes: Pick<TrainingClass, 'courtId' | 'status' | 'weekdays' | 'startTime' | 'durationMin'>[],
  courtId: string,
): { minutes: number; pct: number } {
  const minutes = classes
    .filter((c) => c.courtId === courtId && c.status === 'active')
    .reduce((sum, c) => sum + c.weekdays.length * minutesInWindow(c.startTime, c.durationMin), 0);
  return { minutes, pct: Math.min(100, Math.round((minutes / OPEN_MINUTES_PER_WEEK) * 100)) };
}
