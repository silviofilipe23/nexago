import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import type { ArenaCourt } from './court.model';

/** "Como o atleta reserva" — espelha `functions/src/arena-booking-allocation.ts`. O servidor valida
 *  tudo de novo; aqui é o formulário. Ver `docs/product/reservas-por-capacidade.md`. */

export type BookingAllocationMode = 'court' | 'capacity';

export interface BookingAllocationForm {
  mode: BookingAllocationMode;
  courtIds: string[];
  /** Preço por hora do horário, por código de esporte; `null` = ainda não digitado. */
  priceBySport: Record<string, number | null>;
  revealBeforeArrival: boolean;
  allowCourtChoice: boolean;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Configuração salva na arena (inclusive a guardada quando o modo voltou para `court`). */
export function bookingAllocationFromArena(arenaDoc: Record<string, unknown> | null): BookingAllocationForm {
  const raw = (arenaDoc?.['bookingAllocation'] ?? null) as Record<string, unknown> | null;
  const prices: Record<string, number | null> = {};
  const rawPrices = raw?.['priceBySport'];
  if (rawPrices && typeof rawPrices === 'object') {
    for (const [sport, value] of Object.entries(rawPrices as Record<string, unknown>)) {
      if (typeof value === 'number' && value > 0) prices[sport] = value;
    }
  }
  return {
    mode: raw?.['mode'] === 'capacity' ? 'capacity' : 'court',
    courtIds: Array.isArray(raw?.['courtIds']) ? (raw!['courtIds'] as unknown[]).map(asString).filter(Boolean) : [],
    priceBySport: prices,
    revealBeforeArrival: raw?.['revealBeforeArrival'] === true,
    allowCourtChoice: raw?.['allowCourtChoice'] === true,
  };
}

/** Esportes (códigos) das quadras escolhidas, sem repetir, na ordem das quadras. */
export function sportsOfCourts(courts: readonly ArenaCourt[], courtIds: readonly string[]): Array<{ code: string; label: string }> {
  const out: Array<{ code: string; label: string }> = [];
  for (const court of courts) {
    if (!courtIds.includes(court.id)) continue;
    court.types.forEach((code, i) => {
      if (!out.some((s) => s.code === code)) out.push({ code, label: court.typeLabels[i] ?? code });
    });
  }
  return out;
}

/** Erro do formulário (mesmas regras do servidor), ou `null` se pode salvar. */
export function bookingAllocationError(form: BookingAllocationForm, courts: readonly ArenaCourt[]): string | null {
  if (form.mode === 'court') return null;
  const selected = form.courtIds.filter((id) => courts.some((c) => c.id === id));
  if (selected.length === 0) return 'Escolha ao menos uma quadra para a distribuição.';
  const sports = sportsOfCourts(courts, selected);
  if (sports.length === 0) return 'As quadras escolhidas não têm esporte cadastrado.';
  const missing = sports.filter((s) => !((form.priceBySport[s.code] ?? 0) > 0));
  if (missing.length > 0) return `Defina o preço do horário de ${missing.map((s) => s.label).join(', ')}.`;
  return null;
}

export interface SetBookingAllocationPayload {
  arenaId: string;
  mode: BookingAllocationMode;
  courtIds: string[];
  priceBySport: Record<string, number>;
  revealBeforeArrival: boolean;
  allowCourtChoice: boolean;
}

/** Payload da callable: só quadras que existem e preços dos esportes delas. */
export function bookingAllocationPayload(
  arenaId: string,
  form: BookingAllocationForm,
  courts: readonly ArenaCourt[],
): SetBookingAllocationPayload {
  const courtIds = form.courtIds.filter((id) => courts.some((c) => c.id === id));
  const priceBySport: Record<string, number> = {};
  for (const sport of sportsOfCourts(courts, courtIds)) {
    const price = form.priceBySport[sport.code];
    if (price != null && price > 0) priceBySport[sport.code] = price;
  }
  return {
    arenaId,
    mode: form.mode,
    courtIds,
    priceBySport,
    revealBeforeArrival: form.revealBeforeArrival,
    allowCourtChoice: form.allowCourtChoice,
  };
}

export async function saveBookingAllocation(functions: Functions, payload: SetBookingAllocationPayload): Promise<void> {
  const call = httpsCallable<SetBookingAllocationPayload, { mode: BookingAllocationMode }>(functions, 'setArenaBookingAllocation');
  try {
    await call(payload);
  } catch (err) {
    throw new Error(err instanceof Error && err.message ? err.message : 'Não foi possível salvar.');
  }
}

const LIVE_STATUSES = new Set(['active', 'confirmed', 'pending_payment']);

/** Reservas de hoje em diante que ainda esperam a recepção definir a quadra. */
export async function countFutureUnassignedBookings(db: Firestore, arenaId: string, todayKey: string): Promise<number> {
  const snap = await getDocs(query(
    collection(db, 'arenaBookings'),
    where('arenaId', '==', arenaId),
    where('allocationStatus', '==', 'unassigned'),
  ));
  return snap.docs.filter((d) => {
    const data = d.data();
    return asString(data['date']) >= todayKey && LIVE_STATUSES.has(asString(data['status']).toLowerCase());
  }).length;
}
