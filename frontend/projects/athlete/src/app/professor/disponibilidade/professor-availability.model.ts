/**
 * Modelo puro da tela "Disponibilidade" do professor (protótipo `PrDisponibilidadeScreen`).
 *
 * Contrato com o servidor (`functions/src/professor-availability.ts`):
 * - `professorAvailability/{uid}.weekly["1".."7"]` (dia ISO, 1 = segunda) = horas de INÍCIO abertas,
 *   6–21; cada célula da grade é a hora cheia `h..h+1`.
 * - Só a callable `saveProfessorAvailability` grava, e sempre com o payload inteiro.
 * - Os horários são parede de São Paulo (-03:00 fixo, como `eventDateFromDayKeyAndTime`) — nunca
 *   `Date.getHours` do navegador.
 */

export const FIRST_HOUR = 6;
export const LAST_HOUR = 21;
export const GRID_HOURS: readonly number[] = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);
/** Dias ISO na ordem da grade (Seg..Dom). */
export const GRID_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
export const DAY_SHORT: Readonly<Record<number, string>> = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
  7: 'Dom',
};

export const DURATION_OPTIONS: readonly number[] = [30, 60, 90, 120];
export const NOTICE_OPTIONS: readonly number[] = [0, 1, 2, 4, 6, 8, 12, 24, 48];
export const FREE_CANCEL_OPTIONS: readonly number[] = [0, 2, 6, 12, 24, 48];

export function durationLabel(min: number): string {
  return `${min} min`;
}

export function noticeLabel(hours: number): string {
  if (hours === 0) return 'Sem antecedência';
  return hours === 1 ? '1 hora' : `${hours} horas`;
}

export function freeCancelLabel(hours: number): string {
  if (hours === 0) return 'Até o início';
  return hours === 1 ? '1 hora antes' : `${hours} horas antes`;
}

/** Grade semanal: dia ISO em texto → horas de início abertas, em ordem. */
export type WeeklyGrid = Readonly<Record<string, readonly number[]>>;

export interface AvailabilitySettings {
  weekly: WeeklyGrid;
  durationMin: number;
  minNoticeHours: number;
  freeCancelHours: number;
  autoConfirm: boolean;
  acceptPairs: boolean;
  showOnProfile: boolean;
}

export interface AvailabilityState {
  settings: AvailabilitySettings;
  /** Doc existe e está publicado. */
  published: boolean;
  /** Doc existe (já publicou alguma vez). */
  exists: boolean;
}

export function emptyWeekly(): WeeklyGrid {
  const out: Record<string, number[]> = {};
  for (const d of GRID_DAYS) out[String(d)] = [];
  return out;
}

export const DEFAULT_SETTINGS: AvailabilitySettings = {
  weekly: emptyWeekly(),
  durationMin: 60,
  minNoticeHours: 4,
  freeCancelHours: 12,
  autoConfirm: true,
  acceptPairs: false,
  showOnProfile: true,
};

function pick(v: unknown, options: readonly number[], fallback: number): number {
  const n = Number(v);
  return v != null && v !== '' && options.includes(n) ? n : fallback;
}

/** Intervalo inteiro aceito pelo servidor, mesmo fora das opções da tela (o app pode gravar 3h). */
function intIn(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return v != null && v !== '' && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function normalizeHours(list: unknown): number[] {
  if (!Array.isArray(list)) return [];
  const hours = list.map(Number).filter((h) => Number.isInteger(h) && h >= FIRST_HOUR && h <= LAST_HOUR);
  return [...new Set(hours)].sort((a, b) => a - b);
}

/** Lê o doc (ou a falta dele) com os padrões da tela. */
export function availabilityFromDoc(raw: Record<string, unknown> | null | undefined): AvailabilityState {
  if (!raw) return { settings: DEFAULT_SETTINGS, published: false, exists: false };
  const weeklyRaw = (raw['weekly'] ?? {}) as Record<string, unknown>;
  const weekly: Record<string, number[]> = {};
  for (const d of GRID_DAYS) weekly[String(d)] = normalizeHours(weeklyRaw[String(d)]);
  return {
    exists: true,
    published: raw['published'] !== false,
    settings: {
      weekly,
      durationMin: pick(raw['durationMin'], DURATION_OPTIONS, DEFAULT_SETTINGS.durationMin),
      minNoticeHours: intIn(raw['minNoticeHours'], 0, 72, DEFAULT_SETTINGS.minNoticeHours),
      freeCancelHours: intIn(raw['freeCancelHours'], 0, 72, DEFAULT_SETTINGS.freeCancelHours),
      autoConfirm: raw['autoConfirm'] !== false,
      acceptPairs: raw['acceptPairs'] === true,
      showOnProfile: raw['showOnProfile'] !== false,
    },
  };
}

/** Opções do select incluindo um valor gravado fora da lista (ex.: 3h pelo app). */
export function optionsWith(options: readonly number[], current: number): readonly number[] {
  return options.includes(current) ? options : [...options, current].sort((a, b) => a - b);
}

// ── grade ─────────────────────────────────────────────────────

export function isOpen(weekly: WeeklyGrid, day: number, hour: number): boolean {
  return (weekly[String(day)] ?? []).includes(hour);
}

/** Abre/fecha uma célula; devolve a MESMA grade quando nada muda (o signal não dispara à toa). */
export function setCell(weekly: WeeklyGrid, day: number, hour: number, open: boolean): WeeklyGrid {
  if (hour < FIRST_HOUR || hour > LAST_HOUR || !GRID_DAYS.includes(day)) return weekly;
  if (isOpen(weekly, day, hour) === open) return weekly;
  const key = String(day);
  const current = weekly[key] ?? [];
  const next = open ? [...current, hour].sort((a, b) => a - b) : current.filter((h) => h !== hour);
  return { ...weekly, [key]: next };
}

/** Modo do arraste, decidido pela PRIMEIRA célula: fechada → abre tudo; aberta → fecha tudo. */
export function paintModeFor(weekly: WeeklyGrid, day: number, hour: number): boolean {
  return !isOpen(weekly, day, hour);
}

export function toggleCell(weekly: WeeklyGrid, day: number, hour: number): WeeklyGrid {
  return setCell(weekly, day, hour, !isOpen(weekly, day, hour));
}

/** Payload da callable: os sete dias sempre presentes, `published: true`. */
export function availabilityPayload(s: AvailabilitySettings): Record<string, unknown> {
  const weekly: Record<string, number[]> = {};
  for (const d of GRID_DAYS) weekly[String(d)] = normalizeHours(s.weekly[String(d)]);
  return {
    weekly,
    durationMin: s.durationMin,
    minNoticeHours: s.minNoticeHours,
    freeCancelHours: s.freeCancelHours,
    autoConfirm: s.autoConfirm,
    acceptPairs: s.acceptPairs,
    showOnProfile: s.showOnProfile,
    published: true,
  };
}

export function sameSettings(a: AvailabilitySettings, b: AvailabilitySettings): boolean {
  return JSON.stringify(availabilityPayload(a)) === JSON.stringify(availabilityPayload(b));
}

export function openHoursCount(weekly: WeeklyGrid): number {
  return GRID_DAYS.reduce((n, d) => n + (weekly[String(d)]?.length ?? 0), 0);
}

// ── semana (parede de São Paulo) ─────────────────────────────────

const SP_OFFSET_MS = 3 * 3600_000;
const DAY_MS = 86_400_000;

export interface WallParts {
  dayKey: string;
  hour: number;
  minute: number;
  /** Dia ISO (1 = segunda). */
  isoDay: number;
}

/** Instante → parede de São Paulo. */
export function spParts(ms: number): WallParts {
  const d = new Date(ms - SP_OFFSET_MS);
  const js = d.getUTCDay();
  return {
    dayKey: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    isoDay: js === 0 ? 7 : js,
  };
}

/** Parede de São Paulo → instante. */
export function spInstant(dayKey: string, hour: number, minute = 0): number {
  return Date.parse(`${dayKey}T00:00:00Z`) + (hour * 60 + minute) * 60_000 + SP_OFFSET_MS;
}

export interface WeekDay {
  isoDay: number;
  dayKey: string;
  /** "Seg" */
  short: string;
  /** "20/10" */
  dateLabel: string;
  today: boolean;
}

/** Segunda a domingo da semana de `nowMs` (SP). */
export function currentWeek(nowMs: number): WeekDay[] {
  const now = spParts(nowMs);
  const monday = Date.parse(`${now.dayKey}T00:00:00Z`) - (now.isoDay - 1) * DAY_MS;
  return GRID_DAYS.map((isoDay, i) => {
    const dayKey = new Date(monday + i * DAY_MS).toISOString().slice(0, 10);
    return {
      isoDay,
      dayKey,
      short: DAY_SHORT[isoDay]!,
      dateLabel: `${dayKey.slice(8, 10)}/${dayKey.slice(5, 7)}`,
      today: dayKey === now.dayKey,
    };
  });
}

// ── ocupações ───────────────────────────────────────────────────

export type LessonStatus = 'pending' | 'confirmed' | 'declined' | 'canceled';

export interface LessonReschedule {
  requestedBy: string;
  startAt: number;
  endAt: number;
  status: string;
}

export interface PrivateLesson {
  id: string;
  athleteName: string;
  startAt: number;
  endAt: number;
  durationMin: number;
  pair: boolean;
  note: string;
  status: LessonStatus;
  reschedule: LessonReschedule | null;
}

export interface OwnClassSlot {
  id: string;
  name: string;
  weekdays: readonly number[];
  startTime: string;
  endTime: string;
}

export interface BusyBlock {
  id: string;
  startAt: number;
  endAt: number;
  reasonLabel: string;
}

const LESSON_STATUSES: readonly LessonStatus[] = ['pending', 'confirmed', 'declined', 'canceled'];

/** `Timestamp`, `Date` ou número → ms (sem importar o SDK). */
export function toMillis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  const t = v as { toMillis?: () => number };
  return typeof t.toMillis === 'function' ? t.toMillis() : null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function parsePrivateLesson(id: string, raw: Record<string, unknown>): PrivateLesson | null {
  const startAt = toMillis(raw['startAt']);
  const endAt = toMillis(raw['endAt']);
  const status = str(raw['status']) as LessonStatus;
  if (startAt == null || endAt == null || !LESSON_STATUSES.includes(status)) return null;
  const r = raw['reschedule'] as Record<string, unknown> | undefined;
  const rStart = toMillis(r?.['startAt']);
  const rEnd = toMillis(r?.['endAt']);
  return {
    id,
    athleteName: str(raw['athleteName']) || 'Aluno',
    startAt,
    endAt,
    durationMin: Number(raw['durationMin']) || Math.round((endAt - startAt) / 60_000),
    pair: raw['pair'] === true,
    note: str(raw['note']),
    status,
    reschedule:
      r && rStart != null && rEnd != null
        ? { requestedBy: str(r['requestedBy']), startAt: rStart, endAt: rEnd, status: str(r['status']) }
        : null,
  };
}

export function parseOwnClass(id: string, raw: Record<string, unknown>): OwnClassSlot | null {
  const weekdays = Array.isArray(raw['weekdays']) ? (raw['weekdays'] as unknown[]).map(Number) : [];
  const startTime = str(raw['startTime']);
  if (!weekdays.length || !/^\d{2}:\d{2}$/.test(startTime)) return null;
  return { id, name: str(raw['name']) || 'Turma', weekdays, startTime, endTime: str(raw['endTime']) };
}

export function parseBlock(id: string, raw: Record<string, unknown>): BusyBlock | null {
  const startAt = toMillis(raw['startAt']);
  const endAt = toMillis(raw['endAt']);
  if (startAt == null || endAt == null || endAt <= startAt) return null;
  return { id, startAt, endAt, reasonLabel: str(raw['reasonLabel']) || 'Bloqueado' };
}

export type OverlayKind = 'class' | 'lesson' | 'block';

export interface OverlayCell {
  kind: OverlayKind;
  label: string;
  /** Texto completo para o `title`/leitor de tela. */
  detail: string;
  pending?: boolean;
}

/** Chave da célula no mapa de ocupações. */
export const cellKey = (isoDay: number, hour: number): string => `${isoDay}-${hour}`;

const PRIORITY: Record<OverlayKind, number> = { lesson: 3, class: 2, block: 1 };

const minutesOf = (t: string): number | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'Aluno';
}

/** A particular ativa ocupa o horário (o servidor conta pendente e confirmada). */
export const isActiveLesson = (l: PrivateLesson): boolean => l.status === 'pending' || l.status === 'confirmed';

/**
 * Ocupações da semana por célula. Uma célula `h` está ocupada quando o intervalo encosta em
 * `[h, h+1)`. Prioridade quando duas batem: particular > turma > bloqueio.
 */
export function buildOverlay(
  week: readonly WeekDay[],
  input: { ownClasses: readonly OwnClassSlot[]; lessons: readonly PrivateLesson[]; blocks: readonly BusyBlock[] },
): Map<string, OverlayCell> {
  const out = new Map<string, OverlayCell>();
  const put = (isoDay: number, hour: number, cell: OverlayCell) => {
    if (hour < FIRST_HOUR || hour > LAST_HOUR) return;
    const key = cellKey(isoDay, hour);
    const prev = out.get(key);
    if (!prev || PRIORITY[cell.kind] > PRIORITY[prev.kind]) out.set(key, cell);
  };
  /** Marca as células de `day` que encostam no intervalo [startMin, endMin) da parede. */
  const fill = (isoDay: number, startMin: number, endMin: number, cell: OverlayCell) => {
    for (const h of GRID_HOURS) {
      if (startMin < (h + 1) * 60 && h * 60 < endMin) put(isoDay, h, cell);
    }
  };

  for (const c of input.ownClasses) {
    const start = minutesOf(c.startTime);
    if (start == null) continue;
    const end = Math.max(minutesOf(c.endTime) ?? start + 60, start + 60);
    const cell: OverlayCell = { kind: 'class', label: c.name, detail: `Turma fixa · ${c.name} · ${c.startTime}` };
    for (const d of week) if (c.weekdays.includes(d.isoDay)) fill(d.isoDay, start, end, cell);
  }

  const byKey = new Map(week.map((d) => [d.dayKey, d]));
  for (const l of input.lessons) {
    if (!isActiveLesson(l)) continue;
    const p = spParts(l.startAt);
    const day = byKey.get(p.dayKey);
    if (!day) continue;
    const startMin = p.hour * 60 + p.minute;
    const endMin = startMin + Math.max(1, Math.round((l.endAt - l.startAt) / 60_000));
    const name = firstName(l.athleteName);
    fill(day.isoDay, startMin, endMin, {
      kind: 'lesson',
      label: name,
      detail: `${l.status === 'pending' ? 'Pedido de particular' : 'Particular'} · ${l.athleteName} · ${timeLabel(l.startAt)}`,
      pending: l.status === 'pending',
    });
  }

  for (const b of input.blocks) {
    for (const d of week) {
      for (const h of GRID_HOURS) {
        const cs = spInstant(d.dayKey, h);
        if (b.startAt < cs + 3600_000 && cs < b.endAt) {
          put(d.isoDay, h, { kind: 'block', label: 'Bloqueado', detail: `Bloqueado · ${b.reasonLabel}` });
        }
      }
    }
  }
  return out;
}

export interface WeekStats {
  /** Horas abertas na grade que não batem em nada nesta semana. */
  freeHours: number;
  /** Horas de particular (pendente ou confirmada) nesta semana. */
  bookedHours: number;
}

export function weekStats(
  weekly: WeeklyGrid,
  week: readonly WeekDay[],
  overlay: ReadonlyMap<string, OverlayCell>,
  lessons: readonly PrivateLesson[],
): WeekStats {
  let freeHours = 0;
  for (const d of week) {
    for (const h of weekly[String(d.isoDay)] ?? []) if (!overlay.has(cellKey(d.isoDay, h))) freeHours++;
  }
  const keys = new Set(week.map((d) => d.dayKey));
  const bookedMin = lessons
    .filter((l) => isActiveLesson(l) && keys.has(spParts(l.startAt).dayKey))
    .reduce((n, l) => n + Math.round((l.endAt - l.startAt) / 60_000), 0);
  return { freeHours, bookedHours: bookedMin / 60 };
}

/** "9h", "1,5h". */
export function hoursLabel(h: number): string {
  const rounded = Math.round(h * 10) / 10;
  return `${String(rounded).replace('.', ',')}h`;
}

// ── pedidos e próximas ───────────────────────────────────────────

export function timeLabel(ms: number): string {
  const p = spParts(ms);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** "Qua 22/10 · 18:00" */
export function whenLabel(ms: number): string {
  const p = spParts(ms);
  return `${DAY_SHORT[p.isoDay]} ${p.dayKey.slice(8, 10)}/${p.dayKey.slice(5, 7)} · ${timeLabel(ms)}`;
}

export interface LessonQueues {
  /** Pedidos pendentes que ainda não começaram (Aceitar/Recusar). */
  requests: PrivateLesson[];
  /** Remarcações pedidas pelo aluno, esperando o professor. */
  reschedules: PrivateLesson[];
  /** Confirmadas que ainda não começaram (Cancelar). */
  upcoming: PrivateLesson[];
}

export function lessonQueues(lessons: readonly PrivateLesson[], professorUid: string, nowMs: number): LessonQueues {
  const future = [...lessons].filter((l) => l.startAt > nowMs).sort((a, b) => a.startAt - b.startAt);
  return {
    requests: future.filter((l) => l.status === 'pending'),
    reschedules: future.filter(
      (l) => isActiveLesson(l) && l.reschedule?.status === 'pending' && l.reschedule.requestedBy !== professorUid,
    ),
    upcoming: future.filter((l) => l.status === 'confirmed'),
  };
}

/** Remarcação que EU propus, aguardando o aluno (só informativo). */
export function ownPendingReschedule(l: PrivateLesson, professorUid: string): LessonReschedule | null {
  return l.reschedule?.status === 'pending' && l.reschedule.requestedBy === professorUid ? l.reschedule : null;
}
