import { addDays, minutesToTime, timeToMinutes, WEEK_ORDER, WEEKDAY_SHORT, weekdayOf, type Weekday } from './dates';

/**
 * Turma = REGRA recorrente (dias, horário, quadra, professor). Aula = ocorrência gerada a partir
 * da regra (`sessions/{classId}_{dayKey}`), que pode ser cancelada ou alterada sozinha sem mexer
 * na regra. As funções daqui são puras: geração de datas, detecção de conflito e sugestões.
 */

/** Quantas semanas à frente as aulas ficam materializadas. */
export const SESSION_HORIZON_WEEKS = 8;

export interface ClassRule {
  id?: string;
  name: string;
  coachUid: string;
  coachName?: string;
  courtId: string;
  courtName?: string;
  weekdays: Weekday[];
  startTime: string;
  durationMin: number;
  startDate: string;
  endDate: string | null;
  status?: string;
}

export interface ScheduleConflict {
  kind: 'coach' | 'court';
  otherClassId: string;
  otherClassName: string;
  weekdays: Weekday[];
  startTime: string;
  endTime: string;
}

export function endTime(startTime: string, durationMin: number): string {
  return minutesToTime(timeToMinutes(startTime) + durationMin);
}

export function overlaps(aStart: string, aDur: number, bStart: string, bDur: number): boolean {
  const a0 = timeToMinutes(aStart);
  const b0 = timeToMinutes(bStart);
  return a0 < b0 + bDur && b0 < a0 + aDur;
}

/** Períodos de vigência se cruzam (fim nulo = sem data de término). */
function periodsOverlap(a: ClassRule, b: ClassRule): boolean {
  const aEnd = a.endDate ?? '9999-12-31';
  const bEnd = b.endDate ?? '9999-12-31';
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

/** Turmas que ocupam agenda: ativas e rascunhos (rascunho também reserva o horário). */
function blocksSchedule(c: ClassRule): boolean {
  return c.status !== 'closed' && c.status !== 'cancelled';
}

/**
 * Conflitos de uma turma candidata com as existentes: mesmo professor ou mesma quadra, em algum
 * dia comum, com horários sobrepostos e vigências que se cruzam. A própria turma (mesmo id) é
 * ignorada, pra edição não acusar conflito consigo.
 */
export function findConflicts(candidate: ClassRule, existing: ClassRule[]): ScheduleConflict[] {
  const out: ScheduleConflict[] = [];
  for (const other of existing) {
    if ((candidate.id && other.id === candidate.id) || !blocksSchedule(other)) {
      continue;
    }
    const days = candidate.weekdays.filter((d) => other.weekdays.includes(d));
    if (days.length === 0 || !periodsOverlap(candidate, other)) {
      continue;
    }
    if (!overlaps(candidate.startTime, candidate.durationMin, other.startTime, other.durationMin)) {
      continue;
    }
    const base = {
      otherClassId: other.id ?? '',
      otherClassName: other.name,
      weekdays: days,
      startTime: other.startTime,
      endTime: endTime(other.startTime, other.durationMin),
    };
    if (candidate.coachUid && other.coachUid === candidate.coachUid) {
      out.push({ kind: 'coach', ...base });
    }
    if (candidate.courtId && other.courtId === candidate.courtId) {
      out.push({ kind: 'court', ...base });
    }
  }
  return out;
}

export function describeConflict(c: ScheduleConflict, coachName: string, courtName: string): string {
  const days = WEEK_ORDER.filter((d) => c.weekdays.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(' e ');
  const span = `${days} ${c.startTime}–${c.endTime}`;
  return c.kind === 'coach'
    ? `${coachName || 'O professor'} já dá ${c.otherClassName} · ${span}`
    : `${courtName || 'A quadra'} ocupada por ${c.otherClassName} · ${span}`;
}

export interface ScheduleSuggestion {
  label: string;
  patch: Partial<Pick<ClassRule, 'startTime' | 'courtId' | 'courtName' | 'coachUid' | 'coachName' | 'weekdays'>>;
}

/**
 * Até 3 alternativas sem conflito, na ordem: mesmo dia/quadra em outro horário próximo, mesmo
 * horário em outra quadra, mesmo horário com outro professor, e outro par de dias.
 */
export function suggestAlternatives(
  candidate: ClassRule,
  existing: ClassRule[],
  courts: { id: string; name: string }[],
  coaches: { uid: string; name: string }[],
  limit = 3,
): ScheduleSuggestion[] {
  const out: ScheduleSuggestion[] = [];
  const free = (patch: ScheduleSuggestion['patch']) =>
    findConflicts({ ...candidate, ...patch }, existing).length === 0;
  const daysLabel = (days: Weekday[]) =>
    WEEK_ORDER.filter((d) => days.includes(d)).map((d) => WEEKDAY_SHORT[d]).join('/');
  const courtName = candidate.courtName ?? courts.find((c) => c.id === candidate.courtId)?.name ?? '';
  const start = timeToMinutes(candidate.startTime);

  for (const delta of [-60, 60, -120, 120, -30, 30]) {
    const m = start + delta;
    if (m < 5 * 60 || m + candidate.durationMin > 23 * 60) {
      continue;
    }
    const patch = { startTime: minutesToTime(m) };
    if (free(patch)) {
      out.push({ label: `${daysLabel(candidate.weekdays)} ${patch.startTime} · ${courtName}`, patch });
      break;
    }
  }
  for (const court of courts) {
    if (court.id === candidate.courtId) {
      continue;
    }
    const patch = { courtId: court.id, courtName: court.name };
    if (free(patch)) {
      out.push({ label: `${daysLabel(candidate.weekdays)} ${candidate.startTime} · ${court.name}`, patch });
      break;
    }
  }
  for (const coach of coaches) {
    if (coach.uid === candidate.coachUid) {
      continue;
    }
    const patch = { coachUid: coach.uid, coachName: coach.name };
    if (free(patch)) {
      out.push({
        label: `${daysLabel(candidate.weekdays)} ${candidate.startTime} · ${courtName} · ${coach.name.split(' ')[0]}`,
        patch,
      });
      break;
    }
  }
  const pairs: Weekday[][] = [
    [1, 3],
    [2, 4],
    [3, 5],
    [1, 5],
    [6],
  ];
  for (const days of pairs) {
    if (days.join() === [...candidate.weekdays].sort().join()) {
      continue;
    }
    const patch = { weekdays: days };
    if (free(patch)) {
      out.push({ label: `${daysLabel(days)} ${candidate.startTime} · ${courtName}`, patch });
      break;
    }
  }
  return out.slice(0, limit);
}

/** Datas (dayKey) em que a regra tem aula, de `from` até `until` inclusive. */
export function occurrences(rule: Pick<ClassRule, 'weekdays' | 'startDate' | 'endDate'>, from: string, until: string): string[] {
  const start = rule.startDate > from ? rule.startDate : from;
  const end = rule.endDate && rule.endDate < until ? rule.endDate : until;
  const out: string[] = [];
  for (let key = start; key <= end; key = addDays(key, 1)) {
    if (rule.weekdays.includes(weekdayOf(key))) {
      out.push(key);
    }
  }
  return out;
}

export function sessionId(classId: string, dayKey: string): string {
  return `${classId}_${dayKey}`;
}

/** Até onde as aulas devem estar geradas, dado o dia de hoje. */
export function horizonEnd(today: string): string {
  return addDays(today, SESSION_HORIZON_WEEKS * 7);
}

export function weekdaysLabel(days: Weekday[]): string {
  return WEEK_ORDER.filter((d) => days.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(' · ');
}
