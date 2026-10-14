import type { Training } from './trainings.service';

/** Treino com presença registrada é histórico: só pode ser cancelado, não excluído. */
export function canDeleteTraining(training: Pick<Training, 'attendance'>): boolean {
  return Object.keys(training.attendance).length === 0;
}

/** Data de hoje no fuso local (`YYYY-MM-DD`). `toISOString()` é UTC e vira "amanhã" à noite no Brasil. */
export function localIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Ordem cronológica: data e depois horário de início (strings ISO/HH:mm ordenam lexicograficamente). */
export function compareTrainings(a: Pick<Training, 'date' | 'startTime'>, b: Pick<Training, 'date' | 'startTime'>): number {
  return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
}

/** Separa em próximos (hoje em diante, mais cedo primeiro) e anteriores (mais recente primeiro). */
export function splitUpcoming<T extends Pick<Training, 'date' | 'startTime'>>(
  trainings: T[],
  today: string,
): { upcoming: T[]; past: T[] } {
  const sorted = [...trainings].sort(compareTrainings);
  return {
    upcoming: sorted.filter((t) => t.date >= today),
    past: sorted.filter((t) => t.date < today).reverse(),
  };
}

/** Fim opcional; só é inválido quando informado e não vem depois do início. */
export function isEndBeforeStart(startTime: string, endTime: string): boolean {
  return !!startTime && !!endTime && endTime <= startTime;
}

/** Duração de exercício: inteiro de 1 a 240 min; qualquer outra coisa cai no padrão de 10. */
export function sanitizeDuration(value: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.min(240, Math.round(value)) : 10;
}
