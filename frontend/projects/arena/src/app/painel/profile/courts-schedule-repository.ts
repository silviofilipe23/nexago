import { fetchCourts } from '@nexago/arena-discovery';
import { collection, doc, getDocs, limit, query, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore';

/** Espelha `CourtService.loadScheduleTemplate`/`generateSlots` (Flutter) — não existe horário
 *  a nível de arena no backend; o horário real é `arenas/{arenaId}/courts/{courtId}.availabilitySchedule`
 *  + `.slotDurationMinutes`, aplicado em lote a TODAS as quadras da arena de uma vez. */

export const ARENA_WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type ArenaWeekday = (typeof ARENA_WEEKDAYS)[number];

export const ARENA_WEEKDAY_LABEL: Record<ArenaWeekday, string> = {
  monday: 'Segunda-feira',
  tuesday: 'Terça-feira',
  wednesday: 'Quarta-feira',
  thursday: 'Quinta-feira',
  friday: 'Sexta-feira',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

export const ARENA_SLOT_DURATIONS = [30, 60, 120] as const;
export type ArenaSlotDuration = (typeof ARENA_SLOT_DURATIONS)[number];

export interface ArenaDaySchedule {
  closed: boolean;
  open: string;
  close: string;
}

export type ArenaWeekSchedule = Record<ArenaWeekday, ArenaDaySchedule>;

const DEFAULT_DAY: ArenaDaySchedule = { closed: false, open: '08:00', close: '22:00' };

export function defaultWeekSchedule(): ArenaWeekSchedule {
  return {
    monday: { ...DEFAULT_DAY },
    tuesday: { ...DEFAULT_DAY },
    wednesday: { ...DEFAULT_DAY },
    thursday: { ...DEFAULT_DAY },
    friday: { ...DEFAULT_DAY },
    saturday: { ...DEFAULT_DAY },
    sunday: { ...DEFAULT_DAY },
  };
}

function isRawClosed(raw: unknown): boolean {
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'closed';
  if (typeof raw === 'boolean') return raw === false;
  if (Array.isArray(raw)) return raw.length === 0;
  if (raw && typeof raw === 'object') return (raw as Record<string, unknown>)['closed'] === true;
  return false;
}

function firstRange(raw: unknown): { start: string; close: string } | null {
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0] as Record<string, unknown> | undefined;
    const start = first?.['start'] ?? first?.['from'] ?? first?.['open'];
    const end = first?.['end'] ?? first?.['to'] ?? first?.['close'];
    if (typeof start === 'string' && typeof end === 'string') return { start, close: end };
    return null;
  }
  if (raw && typeof raw === 'object') {
    const map = raw as Record<string, unknown>;
    const start = map['start'] ?? map['from'];
    const end = map['end'] ?? map['to'];
    if (typeof start === 'string' && typeof end === 'string') return { start, close: end };
  }
  return null;
}

function parseWeekSchedule(raw: Record<string, unknown> | undefined): ArenaWeekSchedule {
  if (!raw) return defaultWeekSchedule();
  const out = {} as ArenaWeekSchedule;
  for (const day of ARENA_WEEKDAYS) {
    const rawDay = raw[day];
    if (rawDay === undefined) {
      out[day] = { ...DEFAULT_DAY };
      continue;
    }
    if (isRawClosed(rawDay)) {
      out[day] = { closed: true, open: DEFAULT_DAY.open, close: DEFAULT_DAY.close };
      continue;
    }
    const range = firstRange(rawDay);
    out[day] = range ? { closed: false, open: range.start, close: range.close } : { closed: true, open: DEFAULT_DAY.open, close: DEFAULT_DAY.close };
  }
  return out;
}

function weekScheduleToFirestore(schedule: ArenaWeekSchedule): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const day of ARENA_WEEKDAYS) {
    const d = schedule[day];
    out[day] = d.closed ? [] : [{ start: d.open, end: d.close }];
  }
  return out;
}

export interface ArenaScheduleTemplate {
  courtsCount: number;
  slotDurationMinutes: ArenaSlotDuration;
  schedule: ArenaWeekSchedule;
}

/** Lê a agenda da primeira quadra como modelo pra tela (todas as quadras recebem a mesma
 *  agenda ao salvar, então a primeira já representa o estado atual). */
export async function fetchScheduleTemplate(db: Firestore, arenaId: string): Promise<ArenaScheduleTemplate> {
  const courts = await fetchCourts(db, arenaId);
  if (courts.length === 0) {
    return { courtsCount: 0, slotDurationMinutes: 60, schedule: defaultWeekSchedule() };
  }
  const first = courts[0]!.data;
  const rawDuration = typeof first['slotDurationMinutes'] === 'number' ? first['slotDurationMinutes'] : 60;
  const slotDurationMinutes: ArenaSlotDuration = ARENA_SLOT_DURATIONS.includes(rawDuration as ArenaSlotDuration)
    ? (rawDuration as ArenaSlotDuration)
    : 60;
  return {
    courtsCount: courts.length,
    slotDurationMinutes,
    schedule: parseWeekSchedule(first['availabilitySchedule'] as Record<string, unknown> | undefined),
  };
}

export class NoCourtsError extends Error {}

/** Aplica `slotDurationMinutes` + a agenda semanal a TODAS as quadras da arena (batch).
 *  Espelha `CourtService.generateSlots`. */
export async function applyScheduleToAllCourts(
  db: Firestore,
  arenaId: string,
  slotDurationMinutes: ArenaSlotDuration,
  schedule: ArenaWeekSchedule,
): Promise<void> {
  const snap = await getDocs(query(collection(db, 'arenas', arenaId, 'courts'), limit(500)));
  if (snap.empty) {
    throw new NoCourtsError('Cadastre ao menos uma quadra antes de definir os horários.');
  }
  const availabilitySchedule = weekScheduleToFirestore(schedule);
  const batch = writeBatch(db);
  for (const courtDoc of snap.docs) {
    batch.update(doc(db, 'arenas', arenaId, 'courts', courtDoc.id), {
      slotDurationMinutes,
      availabilitySchedule,
      scheduleUpdatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}
