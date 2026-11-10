import type { ArenaCourtDoc } from './arenas-repository';
import { arenaSlotIsAvailable, sameCalendarDay, timeToMinutes, type ArenaSlot } from './arena-slot';
import { bookingSportCode, courtDocSportValues } from './sport-chip';

/**
 * "Como o atleta reserva" na arena (`arenas/{id}.bookingAllocation`, gravado pela callable
 * `setArenaBookingAllocation`). Ver `docs/product/reservas-por-capacidade.md`.
 * Espelha o app (`arena_booking_allocation.dart`, `capacity_slots_logic.dart`) e as functions.
 *
 * - `court` (padrão, campo ausente): o atleta escolhe a quadra.
 * - `capacity`: o atleta reserva o horário; a equipe define a quadra na chegada.
 */
export interface ArenaBookingAllocation {
  isCapacity: boolean;
  /** Quadras da distribuição, na ordem de preferência da arena. */
  courtIds: string[];
  /** Preço por hora do horário, por esporte (código do catálogo). */
  priceBySport: Record<string, number>;
  revealBeforeArrival: boolean;
  /** Modo misto: o atleta pode escolher a quadra, se quiser. */
  allowCourtChoice: boolean;
}

export const COURT_BOOKING_ALLOCATION: ArenaBookingAllocation = {
  isCapacity: false,
  courtIds: [],
  priceBySport: {},
  revealBeforeArrival: false,
  allowCourtChoice: false,
};

/** Texto no lugar da quadra enquanto ela não aparece para o atleta. */
export const COURT_ON_ARRIVAL_LABEL = 'Quadra definida na chegada';

/** Mesma leitura do servidor (`readBookingAllocation`): ausente ou inválido = `court`. */
export function bookingAllocationFromFirestore(raw: unknown): ArenaBookingAllocation {
  if (!raw || typeof raw !== 'object') return COURT_BOOKING_ALLOCATION;
  const data = raw as Record<string, unknown>;
  if (data['mode'] !== 'capacity') return COURT_BOOKING_ALLOCATION;
  const priceBySport: Record<string, number> = {};
  const rawPrices = data['priceBySport'];
  if (rawPrices && typeof rawPrices === 'object') {
    for (const [sport, value] of Object.entries(rawPrices as Record<string, unknown>)) {
      if (typeof value === 'number' && value > 0) priceBySport[sport] = value;
    }
  }
  const rawCourts = data['courtIds'];
  return {
    isCapacity: true,
    courtIds: Array.isArray(rawCourts)
      ? rawCourts.filter((v): v is string => typeof v === 'string').map((s) => s.trim()).filter(Boolean)
      : [],
    priceBySport,
    revealBeforeArrival: data['revealBeforeArrival'] === true,
    allowCourtChoice: data['allowCourtChoice'] === true,
  };
}

/**
 * A grade é por horário? Arena "a arena define a quadra", salvo no modo misto quando o atleta
 * pediu para escolher a quadra (ou chegou com uma quadra já escolhida).
 */
export function shouldUseCapacityGrid(
  allocation: ArenaBookingAllocation,
  opts: { initialCourtId?: string | null; forceCourtChoice?: boolean } = {},
): boolean {
  if (!allocation.isCapacity) return false;
  if (!allocation.allowCourtChoice) return true;
  return !opts.forceCourtChoice && !(opts.initialCourtId ?? '').trim();
}

function courtIsMaintenance(court: ArenaCourtDoc): boolean {
  return court.data['status'] === 'maintenance' || court.data['maintenance'] === true;
}

function courtTakesSport(court: ArenaCourtDoc, sport: string | null): boolean {
  if (!sport) return true;
  const codes: string[] = [];
  for (const raw of courtDocSportValues(court.data)) {
    const code = bookingSportCode(raw);
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes.length === 0 || codes.includes(sport);
}

/**
 * Quadras que recebem a reserva do esporte: as da distribuição (na ordem da arena; sem lista,
 * todas por nome), fora de manutenção e do esporte (quadra sem esporte aceita). Espelha
 * `floatingCandidateCourts` das functions.
 */
export function capacityCandidateCourts(
  allocation: ArenaBookingAllocation,
  courts: readonly ArenaCourtDoc[],
  sport: string | null,
): ArenaCourtDoc[] {
  const byId = new Map(courts.map((c) => [c.id, c]));
  const ordered = allocation.courtIds.length > 0
    ? allocation.courtIds.map((id) => byId.get(id)).filter((c): c is ArenaCourtDoc => !!c)
    : [...courts].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
  const code = bookingSportCode(sport);
  return ordered.filter((c) => !courtIsMaintenance(c) && courtTakesSport(c, code));
}

/** Esportes reserváveis por horário: com preço definido e ao menos uma quadra que os aceita. */
export function capacitySports(allocation: ArenaBookingAllocation, courts: readonly ArenaCourtDoc[]): string[] {
  return Object.keys(allocation.priceBySport).filter(
    (sport) => capacityCandidateCourts(allocation, courts, sport).length > 0,
  );
}

/** Um horário da grade por horário. */
export interface CapacityTime {
  startTime: string;
  endTime: string;
  /** Quadras livres pela duração inteira a partir de `startTime`. */
  freeCourts: number;
  totalCourts: number;
  /** Inícios dos slots cobertos (vão em `selectedSlotStartTimes` para o servidor cobrar). */
  slotStartTimes: string[];
}

export function capacityTimeIsFull(t: CapacityTime): boolean {
  return t.freeCourts === 0;
}

/** Poucas vagas: até 2 quadras, ou 20% delas. */
export function capacityTimeIsLastSpots(t: CapacityTime): boolean {
  return t.freeCourts > 0 && (t.freeCourts <= 2 || t.freeCourts * 5 <= t.totalCourts);
}

function hm(raw: string): string {
  const t = raw.trim();
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function fmt(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

interface Chain {
  starts: string[];
  endTime: string;
  allAvailable: boolean;
}

/** Slots contíguos da quadra que somam `minutes` a partir de `start`; `null` se não fecha. */
function chainFrom(slots: readonly ArenaSlot[], start: string, minutes: number): Chain | null {
  const index = slots.findIndex((s) => hm(s.startTime) === start);
  if (index < 0) return null;
  const starts: string[] = [];
  let covered = 0;
  let available = true;
  let cursor = timeToMinutes(start);
  for (let i = index; i < slots.length && covered < minutes; i++) {
    const s = slots[i]!;
    if (timeToMinutes(s.startTime) !== cursor) return null;
    let end = timeToMinutes(s.endTime);
    if (end <= cursor) end += 1440;
    starts.push(hm(s.startTime));
    if (!arenaSlotIsAvailable(s)) available = false;
    covered += end - cursor;
    cursor = end % 1440;
  }
  if (covered !== minutes) return null;
  return { starts, endTime: fmt(cursor), allAvailable: available };
}

/**
 * Horários do dia para `durationMinutes`: cada início que alguma quadra candidata oferece, com
 * quantas quadras têm a duração inteira livre e contígua **na mesma quadra** a partir dele
 * (o servidor segura uma quadra provisória só). Horários já começados (hoje) ficam de fora.
 */
export function buildCapacityTimes(params: {
  daySlots: readonly ArenaSlot[];
  candidates: readonly ArenaCourtDoc[];
  durationMinutes: number;
  day: Date;
  now: Date;
}): CapacityTime[] {
  const total = params.candidates.length;
  if (total === 0) return [];
  const byCourt = new Map<string, ArenaSlot[]>(params.candidates.map((c) => [c.id, []]));
  for (const s of params.daySlots) {
    const list = byCourt.get(s.courtId);
    if (list && sameCalendarDay(s.date, params.day)) list.push(s);
  }
  for (const list of byCourt.values()) {
    list.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }
  const isToday = sameCalendarDay(params.day, params.now);
  const nowMin = params.now.getHours() * 60 + params.now.getMinutes();
  const starts = new Set<string>();
  for (const list of byCourt.values()) {
    for (const s of list) {
      if (isToday && timeToMinutes(s.startTime) <= nowMin) continue;
      starts.add(hm(s.startTime));
    }
  }
  const out: CapacityTime[] = [];
  for (const start of starts) {
    let free = 0;
    let sample: Chain | null = null;
    for (const list of byCourt.values()) {
      const chain = chainFrom(list, start, params.durationMinutes);
      if (!chain) continue;
      sample ??= chain;
      if (chain.allAvailable) free++;
    }
    if (!sample) continue;
    out.push({
      startTime: start,
      endTime: sample.endTime,
      freeCourts: free,
      totalCourts: total,
      slotStartTimes: sample.starts,
    });
  }
  return out.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

/**
 * Os slots de uma quadra livre que cobrem o horário escolhido, com o preço do horário do esporte
 * em cada slot e sem quadra (`courtId: ''`) — o pagamento mostra e cota a partir deles. `null`
 * quando nenhuma quadra candidata tem a duração inteira livre (o horário lotou).
 */
export function capacityChainFor(params: {
  allocation: ArenaBookingAllocation;
  sport: string;
  daySlots: readonly ArenaSlot[];
  candidates: readonly ArenaCourtDoc[];
  day: Date;
  startTime: string;
  durationMinutes: number;
}): ArenaSlot[] | null {
  const perHour = params.allocation.priceBySport[params.sport];
  if (!perHour || perHour <= 0) return null;
  for (const court of params.candidates) {
    const list = params.daySlots
      .filter((s) => s.courtId === court.id && sameCalendarDay(s.date, params.day))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    const chain = chainFrom(list, hm(params.startTime), params.durationMinutes);
    if (!chain?.allAvailable) continue;
    return chain.starts.map((start) => {
      const slot = list.find((s) => hm(s.startTime) === start)!;
      let minutes = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime);
      if (minutes <= 0) minutes += 1440;
      const price = Math.round((perHour * minutes) / 60 * 100) / 100;
      return { ...slot, courtId: '', priceReais: price, basePriceReais: price, appliedPromotionId: null };
    });
  }
  return null;
}

/** Durações oferecidas: múltiplos do passo da grade das quadras candidatas, até 3 h. */
export function capacityDurationOptions(candidates: readonly ArenaCourtDoc[]): number[] {
  let step = 60;
  for (const c of candidates) {
    const raw = c.data['slotDurationMinutes'];
    if (typeof raw === 'number' && raw > 0 && raw < step) step = raw;
  }
  const out: number[] = [];
  for (let m = step; m <= 180; m += step) out.push(m);
  return out;
}

/** Preço do horário: o da arena para o esporte, proporcional à duração (o servidor cota de novo). */
export function capacityPriceFor(
  allocation: ArenaBookingAllocation,
  sport: string,
  minutes: number,
): number | null {
  const perHour = allocation.priceBySport[sport];
  if (!perHour || perHour <= 0 || minutes <= 0) return null;
  return Math.round((perHour * minutes) / 60 * 100) / 100;
}

/**
 * O atleta pode ver a quadra da reserva? Mesma regra do app e das functions
 * (`athleteSeesBookingCourt`).
 * - Sem quadra definida (`unassigned`): não — a provisória pode mudar.
 * - Definida pela recepção antes da chegada numa arena que só mostra na chegada
 *   (`revealCourtBeforeArrival: false`): só a partir do início da reserva.
 * - O resto (legado, escolhida pelo atleta, lida no QR): sim.
 */
export function athleteSeesBookingCourt(booking: Record<string, unknown>, now: Date = new Date()): boolean {
  if (booking['allocationStatus'] === 'unassigned') return false;
  if (booking['revealCourtBeforeArrival'] !== false) return true;
  if (booking['allocationSource'] !== 'staff') return true;
  const date = typeof booking['date'] === 'string' ? booking['date'].trim().slice(0, 10) : '';
  const start = typeof booking['startTime'] === 'string' ? booking['startTime'].trim() : '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m || start.length < 4) return true;
  const [h, min] = start.split(':').map((p) => parseInt(p, 10));
  const startsAt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h ?? 0, min ?? 0);
  return now.getTime() >= startsAt.getTime();
}

/** Nome da quadra que o atleta vê: `courtName`, ou `COURT_ON_ARRIVAL_LABEL` se ainda escondida. */
export function athleteVisibleCourtName(
  booking: Record<string, unknown>,
  courtName: string,
  now: Date = new Date(),
): string {
  return athleteSeesBookingCourt(booking, now) ? courtName : COURT_ON_ARRIVAL_LABEL;
}
