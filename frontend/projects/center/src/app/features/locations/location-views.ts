import { addDays, formatDayKey, WEEK_ORDER, WEEKDAY_SHORT, weekdayOf, type Weekday } from '../../domain/dates';
import { parseWindowTimes } from '../../domain/locations';
import type { CenterLocation, ClassSession, ContractWindow, LocationType, TrainingClass } from '../../domain/models';

type SessionLite = Pick<ClassSession, 'id' | 'locationId' | 'date' | 'startTime' | 'status'>;
type ClassLite = Pick<TrainingClass, 'locationId' | 'status'>;

/** Turma que ainda gera aula (rascunho entra: vai virar aula no local). */
export function isLiveClass(c: Pick<TrainingClass, 'status'>): boolean {
  return c.status === 'active' || c.status === 'draft';
}

/** Aulas marcadas de hoje em diante no local + turmas vivas que o têm como padrão. */
export function locationUsage(
  locationId: string,
  classes: readonly ClassLite[],
  sessions: readonly SessionLite[],
  today: string,
): { futureSessions: number; classes: number } {
  return {
    futureSessions: sessions.filter((s) => s.locationId === locationId && s.date >= today && s.status === 'scheduled').length,
    classes: classes.filter((c) => c.locationId === locationId && isLiveClass(c)).length,
  };
}

/** "1 próprio · 2 parceiros · 1 avulso · 1 arquivado". */
export function locationsSubtitle(locations: readonly Pick<CenterLocation, 'type' | 'status'>[]): string {
  if (locations.length === 0) return 'Nenhum local cadastrado';
  const active = locations.filter((l) => l.status === 'active');
  const n = (t: LocationType) => active.filter((l) => l.type === t).length;
  const parts = [
    [n('own'), 'próprio', 'próprios'],
    [n('partner'), 'parceiro', 'parceiros'],
    [n('adhoc'), 'avulso', 'avulsos'],
    [locations.length - active.length, 'arquivado', 'arquivados'],
  ] as const;
  return parts
    .filter(([k]) => k > 0)
    .map(([k, one, many]) => `${k} ${k === 1 ? one : many}`)
    .join(' · ');
}

export interface WeekItem<S> {
  session: S;
  /** Muda de local em relação à aula anterior do mesmo dia. */
  moved: boolean;
}

export interface WeekDay<S> {
  key: string;
  label: string;
  items: WeekItem<S>[];
}

/**
 * L5 — semana seg–dom a partir de `weekStart`, aulas não canceladas em ordem de horário. Domingo só
 * aparece se tiver aula (a maioria dos centros não abre). `perLocation` conta aulas por local.
 */
export function weekByLocation<S extends SessionLite & { coachUid?: string }>(
  sessions: readonly S[],
  weekStart: string,
): { days: WeekDay<S>[]; perLocation: Map<string, number> } {
  const end = addDays(weekStart, 6);
  const inWeek = sessions
    .filter((s) => s.date >= weekStart && s.date <= end && s.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const perLocation = new Map<string, number>();
  for (const s of inWeek) perLocation.set(s.locationId, (perLocation.get(s.locationId) ?? 0) + 1);
  const days: WeekDay<S>[] = [];
  for (let i = 0; i < 7; i++) {
    const key = addDays(weekStart, i);
    const list = inWeek.filter((s) => s.date === key);
    if (i === 6 && list.length === 0) continue;
    days.push({
      key,
      label: `${WEEKDAY_SHORT[weekdayOf(key)]} ${formatDayKey(key)}`,
      // Troca de local é do PROFESSOR: compara com a aula anterior dele no dia, não do centro.
      items: list.map((s, k) => {
        const prev = list.slice(0, k).reverse().find((o) => (o.coachUid ?? '') === (s.coachUid ?? ''));
        return { session: s, moved: !!prev && prev.locationId !== s.locationId };
      }),
    });
  }
  return { days, perLocation };
}

export interface WindowDraft {
  weekdays: Weekday[];
  /** "18:00–22:00" como o gestor digita. */
  times: string;
}

/** Rascunhos do formulário → janelas válidas, ou a mensagem do primeiro erro. */
export function windowsFromDrafts(drafts: readonly WindowDraft[]): { windows: ContractWindow[] } | { error: string } {
  const windows: ContractWindow[] = [];
  for (const [i, d] of drafts.entries()) {
    const label = drafts.length > 1 ? `Janela ${i + 1}: ` : 'Janela: ';
    if (d.weekdays.length === 0) return { error: `${label}escolha pelo menos um dia.` };
    const t = parseWindowTimes(d.times);
    if (!t) return { error: `${label}informe o horário como 18:00–22:00.` };
    windows.push({ weekdays: WEEK_ORDER.filter((w) => d.weekdays.includes(w)), ...t });
  }
  return { windows };
}
