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

/**
 * Treinos que "este e os seguintes" alcança: mesma série e equipe, a partir de `from` (inclusive,
 * em ordem cronológica), só os ainda `agendado` — realizados e cancelados são histórico e ficam como estão.
 * Treino avulso (sem `seriesId`) não tem seguintes.
 */
export function followingInSeries(all: Training[], from: Training): Training[] {
  if (!from.seriesId) {
    return [];
  }
  return all
    .filter(
      (t) =>
        t.seriesId === from.seriesId &&
        t.squadId === from.squadId &&
        t.status === 'agendado' &&
        compareTrainings(t, from) >= 0,
    )
    .sort(compareTrainings);
}

/** Duração assumida quando o treino não tem horário de fim (ou o fim é inválido). */
const DEFAULT_TRAINING_MINUTES = 60;

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function trainingRange(startTime: string, endTime: string): { start: number; end: number } {
  const start = toMinutes(startTime);
  const end = endTime && toMinutes(endTime) > start ? toMinutes(endTime) : start + DEFAULT_TRAINING_MINUTES;
  return { start, end };
}

/** Dois treinos do mesmo dia se sobrepõem? Encostar (um acaba quando o outro começa) não conta. */
export function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a = trainingRange(aStart, aEnd);
  const b = trainingRange(bStart, bEnd);
  return a.start < b.end && b.start < a.end;
}

export interface TrainingConflict {
  date: string;
  with: Training;
}

/**
 * Para cada data candidata, o primeiro treino já existente (de qualquer equipe do professor, não cancelado,
 * diferente do que está sendo editado) cujo horário se sobrepõe. Sem horário de início não há o que comparar.
 */
export function findConflicts(
  dates: string[],
  startTime: string,
  endTime: string,
  existing: Training[],
  ignoreId?: string,
): TrainingConflict[] {
  if (!startTime) {
    return [];
  }
  const out: TrainingConflict[] = [];
  for (const date of dates) {
    const hit = existing.find(
      (t) =>
        t.date === date &&
        t.status !== 'cancelado' &&
        t.id !== ignoreId &&
        timeRangesOverlap(startTime, endTime, t.startTime, t.endTime),
    );
    if (hit) {
      out.push({ date, with: hit });
    }
  }
  return out;
}

/** Quantas datas são anteriores a hoje (hoje não é passado). */
export function pastCount(dates: string[], today: string): number {
  return dates.filter((d) => d < today).length;
}

export function pastDatesMessage(past: number, total: number): string | null {
  if (past === 0) {
    return null;
  }
  return total <= 1 ? 'Essa data já passou.' : `${past} dos ${total} treinos já passaram.`;
}

/** Texto do aviso de conflito: um treino único detalha o conflito; uma série resume e cita o primeiro. */
export function conflictMessage(
  conflicts: TrainingConflict[],
  total: number,
  squadNameOf: (squadId: string) => string | null,
  activeSquadId: string | null,
): string | null {
  const first = conflicts[0];
  if (!first) {
    return null;
  }
  const t = first.with;
  if (total <= 1) {
    const squad = t.squadId !== activeSquadId ? squadNameOf(t.squadId) : null;
    const range = t.endTime ? `${t.startTime}–${t.endTime}` : t.startTime;
    return `Conflita com «${t.title}»${squad ? ` da equipe ${squad}` : ''} (${range}).`;
  }
  const [, month, day] = first.date.split('-');
  return `${conflicts.length} dos ${total} treinos conflitam com treinos existentes. O primeiro é em ${day}/${month}, com «${t.title}».`;
}
