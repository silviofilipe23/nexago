import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';

/** Reserva de quadra do atleta — espelha o `BookingService`/`PaymentService` do Flutter.
 *  A criação é 100% server-side (`createArenaBooking` valida preço, bloqueio e conflito de
 *  horário em transação com `arenaSlotLocks`); as rules NEGAM create de `arenaBookings`
 *  pelo atleta, então não existe caminho de escrita direta aqui. PIX é Asaas via
 *  `createArenaBookingPixPayment` e o webhook confirma (`status: 'confirmed'`). */

const ARENA_BOOKINGS = 'arenaBookings';

export type ArenaBookingPaymentMode = 'onsite' | 'pix';

export interface ArenaBookingArgs {
  arenaId: string;
  arenaName: string;
  courtId: string;
  courtName: string;
  /** YYYY-MM-DD */
  dateKey: string;
  /** HH:mm */
  startTime: string;
  /** HH:mm */
  endTime: string;
  /** Inícios dos slots escolhidos na grade (ex.: `['18:00', '19:00']`). */
  selectedSlotStartTimes: string[];
}

export interface ArenaBookingQuoteLine {
  startTime: string;
  endTime: string;
  baseSlotPriceReais: number;
  finalSlotPriceReais: number;
}

export interface ArenaBookingQuote {
  amountReais: number;
  lineItems: ArenaBookingQuoteLine[];
}

export interface CreateArenaBookingResult {
  bookingId: string;
  amountReais: number;
  amountToPayNowReais: number;
  amountDueOnsiteReais: number;
  paymentMode: ArenaBookingPaymentMode;
  paymentFraction: number;
  /** ISO — só em PIX (prazo pra pagar antes de a reserva expirar). */
  paymentExpiresAt: string | null;
}

export interface ArenaBookingPixPayment {
  paymentId: string;
  /** Código copia-e-cola. */
  qrCode: string;
  /** PNG base64 do QR (pode vir vazio). */
  qrCodeBase64: string;
  /** ISO. */
  expiresAt: string;
  amountToPayNowReais: number;
}

export interface ArenaBookingDoc {
  id: string;
  arenaId: string;
  arenaName: string;
  courtId: string;
  courtName: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  amountReais: number;
  amountToPayNowReais: number;
  amountDueOnsiteReais: number;
  paymentChannel: string;
  paymentStatus: string;
  paymentFraction: number | null;
  status: string;
  paymentExpiresAt: Date | null;
  /** Quantos slots da grade a reserva ocupa (de `pricingLineItems`; mínimo 1). */
  slotCount: number;
}

export class ArenaBookingError extends Error {
  constructor(
    message: string,
    readonly code: 'SLOT_CONFLICT' | 'BLOCKED_ATHLETE' | null = null,
  ) {
    super(message);
  }

  get isSlotConflict(): boolean {
    return this.code === 'SLOT_CONFLICT';
  }
}

/** Mesmo mapeamento de mensagens do `BookingService._mapFunctionsMessage` (Flutter). */
function mapCallableError(err: unknown): ArenaBookingError {
  const fb = err as { code?: string; message?: string };
  const code = (fb.code ?? '').replace(/^functions\//, '');
  const detail = typeof fb.message === 'string' && fb.message.trim() ? fb.message.trim() : null;
  switch (code) {
    case 'unauthenticated':
      return new ArenaBookingError('Faça login para confirmar a reserva.');
    case 'permission-denied':
      return new ArenaBookingError(
        detail ?? 'Sem permissão para concluir a reserva.',
        detail?.includes('bloqueada') ? 'BLOCKED_ATHLETE' : null,
      );
    case 'not-found':
      return new ArenaBookingError(detail ?? 'Arena ou quadra não encontrada.');
    case 'invalid-argument':
      return new ArenaBookingError(detail ?? 'Dados da reserva inválidos.');
    case 'failed-precondition':
      return new ArenaBookingError(detail ?? 'Não foi possível reservar este horário.');
    case 'already-exists':
      return new ArenaBookingError('Esse horário acabou de ser reservado. Escolha outro.', 'SLOT_CONFLICT');
    case 'internal':
      return new ArenaBookingError(detail ?? 'Erro no servidor. Tente novamente.');
    default:
      return new ArenaBookingError(detail ?? 'Não foi possível concluir a reserva.');
  }
}

function callablePayload(args: ArenaBookingArgs): Record<string, unknown> {
  return {
    arenaId: args.arenaId,
    arenaName: args.arenaName,
    courtId: args.courtId,
    courtName: args.courtName,
    date: args.dateKey,
    startTime: args.startTime,
    endTime: args.endTime,
    ...(args.selectedSlotStartTimes.length > 0
      ? { selectedSlotStartTimes: args.selectedSlotStartTimes }
      : {}),
  };
}

/** Cota autoritativa (preço por quadra + promoções) — a mesma que o servidor cobra. */
export async function quoteArenaBooking(functions: Functions, args: ArenaBookingArgs): Promise<ArenaBookingQuote> {
  try {
    const result = await httpsCallable<Record<string, unknown>, { amountReais: number; lineItems?: unknown[] }>(
      functions,
      'quoteArenaBooking',
    )(callablePayload(args));
    const amount = Number(result.data.amountReais);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ArenaBookingError('Configure o preço da quadra antes de reservar.');
    }
    const lineItems: ArenaBookingQuoteLine[] = [];
    for (const raw of result.data.lineItems ?? []) {
      const row = raw as Record<string, unknown>;
      const start = typeof row['startTime'] === 'string' ? row['startTime'].slice(0, 5) : '';
      const finalPrice = Number(row['finalSlotPriceReais']);
      if (!start || !Number.isFinite(finalPrice)) continue;
      lineItems.push({
        startTime: start,
        endTime: typeof row['endTime'] === 'string' ? row['endTime'].slice(0, 5) : '',
        finalSlotPriceReais: finalPrice,
        baseSlotPriceReais: Number(row['baseSlotPriceReais']) || finalPrice,
      });
    }
    return { amountReais: amount, lineItems };
  } catch (err) {
    if (err instanceof ArenaBookingError) throw err;
    throw mapCallableError(err);
  }
}

/** Cria a reserva (transação server-side com locks). `paymentMode: 'onsite'` já nasce
 *  `status: 'active'`; `'pix'` nasce `pending_payment` e precisa de `createBookingPixPayment`. */
export async function createArenaBooking(
  functions: Functions,
  args: ArenaBookingArgs,
  options: { clientAmountReais: number; paymentMode: ArenaBookingPaymentMode; paymentFraction?: number },
): Promise<CreateArenaBookingResult> {
  if (options.paymentMode === 'pix' && options.paymentFraction !== 0.5 && options.paymentFraction !== 1) {
    throw new ArenaBookingError('Escolha pagar 50% ou 100% via PIX.');
  }
  try {
    const result = await httpsCallable<Record<string, unknown>, CreateArenaBookingResult>(
      functions,
      'createArenaBooking',
    )({
      ...callablePayload(args),
      clientAmountReais: options.clientAmountReais,
      paymentMode: options.paymentMode,
      ...(options.paymentMode === 'pix' ? { paymentFraction: options.paymentFraction } : {}),
    });
    const data = result.data;
    if (!data?.bookingId || !Number.isFinite(Number(data.amountReais))) {
      throw new ArenaBookingError('Resposta inválida do servidor.');
    }
    if (options.paymentMode === 'onsite') {
      // Push pro gestor; a reserva já está gravada, então falha aqui não pode travar a UI.
      void notifyArenaBookingCreated(functions, data.bookingId);
    }
    return data;
  } catch (err) {
    if (err instanceof ArenaBookingError) throw err;
    throw mapCallableError(err);
  }
}

export async function notifyArenaBookingCreated(functions: Functions, bookingId: string): Promise<void> {
  try {
    await httpsCallable(functions, 'notifyArenaBookingCreated')({ bookingId });
  } catch {
    // best-effort: o gestor só deixa de receber o push imediato
  }
}

/** Gera a cobrança PIX (Asaas) da reserva `pending_payment` — QR + copia-e-cola. */
export async function createBookingPixPayment(
  functions: Functions,
  params: { bookingId: string; cpfCnpj?: string; paymentFraction?: number },
): Promise<ArenaBookingPixPayment> {
  try {
    const payload: Record<string, unknown> = { bookingId: params.bookingId };
    const cpf = params.cpfCnpj?.replace(/\D/g, '') ?? '';
    if (cpf.length === 11 || cpf.length === 14) payload['cpfCnpj'] = cpf;
    if (params.paymentFraction === 0.5 || params.paymentFraction === 1) {
      payload['paymentFraction'] = params.paymentFraction;
    }
    const result = await httpsCallable<Record<string, unknown>, ArenaBookingPixPayment>(
      functions,
      'createArenaBookingPixPayment',
    )(payload);
    const data = result.data;
    if (!data?.paymentId || !data.qrCode || !Number.isFinite(Number(data.amountToPayNowReais))) {
      throw new ArenaBookingError('Resposta inválida do servidor de pagamento.');
    }
    return data;
  } catch (err) {
    if (err instanceof ArenaBookingError) throw err;
    throw mapCallableError(err);
  }
}

/** Cancela reserva `pending_payment`, removendo slots e liberando locks. */
export async function cancelPendingBookingPayment(functions: Functions, bookingId: string): Promise<void> {
  try {
    await httpsCallable(functions, 'cancelPendingArenaBookingPayment')({ bookingId });
  } catch (err) {
    const code = ((err as { code?: string }).code ?? '').replace(/^functions\//, '');
    // Já paga/cancelada/expirada: nada a desfazer.
    if (code === 'failed-precondition') return;
    throw mapCallableError(err);
  }
}

function toDateOrNull(v: unknown): Date | null {
  const t = v as Timestamp | undefined;
  if (t && typeof t.toDate === 'function') return t.toDate();
  if (typeof v === 'string' && v.trim()) {
    const parsed = new Date(v.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function bookingDateKeyOf(data: Record<string, unknown>): string {
  const v = data['date'];
  if (typeof v === 'string') return v.trim().slice(0, 10);
  const asDate = toDateOrNull(v);
  if (asDate) {
    const m = `${asDate.getMonth() + 1}`.padStart(2, '0');
    const d = `${asDate.getDate()}`.padStart(2, '0');
    return `${asDate.getFullYear()}-${m}-${d}`;
  }
  return '';
}

function normTime(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, 5) : '';
}

function bookingFromSnapshot(snap: DocumentSnapshot<DocumentData>): ArenaBookingDoc | null {
  const data = snap.data();
  if (!data) return null;
  return {
    id: snap.id,
    arenaId: typeof data['arenaId'] === 'string' ? data['arenaId'] : '',
    arenaName: typeof data['arenaName'] === 'string' ? data['arenaName'] : 'Arena',
    courtId: typeof data['courtId'] === 'string' ? data['courtId'] : '',
    courtName: typeof data['courtName'] === 'string' ? data['courtName'] : 'Quadra',
    dateKey: bookingDateKeyOf(data),
    startTime: normTime(data['startTime']),
    endTime: normTime(data['endTime']),
    amountReais: Number(data['amountReais']) || 0,
    amountToPayNowReais: Number(data['amountToPayNowReais']) || 0,
    amountDueOnsiteReais: Number(data['amountDueOnsiteReais']) || 0,
    paymentChannel: typeof data['paymentChannel'] === 'string' ? data['paymentChannel'] : 'onsite',
    paymentStatus: typeof data['paymentStatus'] === 'string' ? data['paymentStatus'] : 'none',
    paymentFraction: typeof data['paymentFraction'] === 'number' ? data['paymentFraction'] : null,
    status: typeof data['status'] === 'string' ? data['status'] : '',
    paymentExpiresAt: toDateOrNull(data['paymentExpiresAt']),
    slotCount: Array.isArray(data['pricingLineItems']) ? Math.max(1, data['pricingLineItems'].length) : 1,
  };
}

export async function fetchArenaBooking(db: Firestore, bookingId: string): Promise<ArenaBookingDoc | null> {
  const snap = await getDoc(doc(db, ARENA_BOOKINGS, bookingId));
  return snap.exists() ? bookingFromSnapshot(snap) : null;
}

/** Acompanha a reserva em tempo real (confirmação do PIX chega pelo webhook). */
export function watchArenaBooking(
  db: Firestore,
  bookingId: string,
  onChange: (booking: ArenaBookingDoc | null) => void,
): () => void {
  return onSnapshot(
    doc(db, ARENA_BOOKINGS, bookingId),
    (snap) => onChange(snap.exists() ? bookingFromSnapshot(snap) : null),
    () => onChange(null),
  );
}

/** Reserva PIX pendente do mesmo horário — retomar em vez de criar outra (o lock do
 *  horário pertence a ela, criar de novo daria SLOT_CONFLICT com a própria reserva).
 *  Espelho do `PendingPixBookingMatch` do Flutter. */
export async function findResumablePixBooking(
  db: Firestore,
  uid: string,
  args: ArenaBookingArgs,
): Promise<ArenaBookingDoc | null> {
  if (!uid) return null;
  const candidates = new Map<string, ArenaBookingDoc>();
  for (const field of ['athleteId', 'bookingAthleteId']) {
    const snap = await getDocs(
      query(
        collection(db, ARENA_BOOKINGS),
        where(field, '==', uid),
        where('status', '==', 'pending_payment'),
        limit(24),
      ),
    );
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (!isResumablePendingPix(data)) continue;
      const booking = bookingFromSnapshot(d);
      if (!booking) continue;
      if (
        booking.arenaId !== args.arenaId ||
        booking.courtId !== args.courtId ||
        booking.dateKey !== args.dateKey ||
        booking.startTime !== normTime(args.startTime) ||
        booking.endTime !== normTime(args.endTime)
      ) {
        continue;
      }
      candidates.set(d.id, booking);
    }
  }
  let best: ArenaBookingDoc | null = null;
  let bestExpiry = -1;
  for (const booking of candidates.values()) {
    const expiry = booking.paymentExpiresAt?.getTime() ?? 0;
    if (expiry > bestExpiry) {
      bestExpiry = expiry;
      best = booking;
    }
  }
  return best;
}

function isResumablePendingPix(data: Record<string, unknown>): boolean {
  const paymentStatus = typeof data['paymentStatus'] === 'string' ? data['paymentStatus'].toLowerCase() : '';
  if (paymentStatus === 'paid' || paymentStatus === 'partial') return false;
  const channel = typeof data['paymentChannel'] === 'string' ? data['paymentChannel'].toLowerCase().trim() : '';
  if (channel && channel !== 'pix') return false;
  const expiresAt = toDateOrNull(data['paymentExpiresAt']);
  return expiresAt == null || expiresAt.getTime() > Date.now();
}
