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

/** Soma `days` a uma data `YYYY-MM-DD` no calendário local (sem depender de fuso/horário de verão). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return localIsoDate(new Date(y!, m! - 1, d! + days));
}

/** Teto de treinos gerados por vez — protege de um "até" com o ano errado. */
export const MAX_SERIES_OCCURRENCES = 60;

/**
 * Datas (`YYYY-MM-DD`) de `start` até `until` (inclusive) cujo dia da semana está em `weekdays`
 * (0 = domingo … 6 = sábado). Se `start` cai num dia desmarcado, ele não entra.
 * Devolve no máximo `MAX_SERIES_OCCURRENCES + 1` datas: o excedente serve só pra quem chama detectar o estouro.
 */
export function generateOccurrences(start: string, until: string, weekdays: number[]): string[] {
  if (!start || !until || weekdays.length === 0 || until < start) {
    return [];
  }
  const out: string[] = [];
  let current = start;
  // Limite de varredura (≈ 2 anos) pra nunca travar com datas absurdas.
  for (let i = 0; i < 731 && current <= until && out.length <= MAX_SERIES_OCCURRENCES; i++) {
    const [y, m, d] = current.split('-').map(Number);
    if (weekdays.includes(new Date(y!, m! - 1, d!).getDay())) {
      out.push(current);
    }
    current = addDays(current, 1);
  }
  return out;
}
