import { collection, onSnapshot, orderBy, query, type DocumentData, type Firestore, type Timestamp } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';

/** Split de pagamento de reserva PIX entre amigos — cada fatia vira uma cobrança PIX própria
 *  (`arenaBookings/{bookingId}/paymentShares/{shareId}`). Fatia não paga até o prazo vira
 *  `covered_by_organizer` e soma ao valor devido no local — a reserva nunca cai por causa disso.
 *  Espelha `splitArenaBookingPayment` (`functions/src/arena-booking-split.ts`). */

export type ArenaBookingPaymentShareStatus = 'pending' | 'paid' | 'expired' | 'covered_by_organizer';

export interface ArenaBookingPaymentShare {
  id: string;
  payerAthleteId: string;
  amountReais: number;
  status: ArenaBookingPaymentShareStatus;
  pixCopyPaste: string | null;
  qrCodeBase64: string | null;
  expiresAt: Date | null;
  createdAt: Date | null;
}

export interface SplitShareInput {
  athleteId: string;
  amountReais: number;
}

export interface SplitArenaBookingPaymentResult {
  bookingId: string;
  shareIds: string[];
}

/** Mesma tolerância do backend (`AMOUNT_TOLERANCE_REAIS`) — soma das fatias precisa bater
 *  com `amountToPayNowReais` da reserva dentro desta margem de arredondamento. */
export const SPLIT_AMOUNT_TOLERANCE_REAIS = 0.02;
/** Mesmo teto do backend (`MAX_SHARES`). */
export const SPLIT_MAX_SHARES = 20;

export class ArenaBookingSplitError extends Error {}

/** Mesmo padrão de `arena-bookings-repository.ts`: mapeia o código do `FirebaseFunctionsException`
 *  pra uma mensagem amigável em PT-BR; usa `.message` do backend quando ele já vem pronto. */
function mapCallableError(err: unknown): ArenaBookingSplitError {
  const fb = err as { code?: string; message?: string };
  const code = (fb.code ?? '').replace(/^functions\//, '');
  const detail = typeof fb.message === 'string' && fb.message.trim() ? fb.message.trim() : null;
  switch (code) {
    case 'unauthenticated':
      return new ArenaBookingSplitError('Faça login para dividir o pagamento.');
    case 'permission-denied':
      return new ArenaBookingSplitError(detail ?? 'Só quem fez a reserva pode dividir o pagamento.');
    case 'not-found':
      return new ArenaBookingSplitError(detail ?? 'Reserva não encontrada.');
    case 'invalid-argument':
      return new ArenaBookingSplitError(detail ?? 'Dados da divisão inválidos.');
    case 'failed-precondition':
      return new ArenaBookingSplitError(detail ?? 'Não foi possível dividir o pagamento desta reserva.');
    case 'internal':
      return new ArenaBookingSplitError(detail ?? 'Erro no servidor. Tente novamente.');
    default:
      return new ArenaBookingSplitError(detail ?? 'Não foi possível dividir o pagamento agora.');
  }
}

/** Soma local das fatias bate com o total esperado (mesma tolerância do servidor) — checagem
 *  client-side antes de chamar o callable, pra já bloquear o botão de enviar. */
export function splitSharesSumMatches(shares: readonly SplitShareInput[], expectedTotalReais: number): boolean {
  const sum = Math.round(shares.reduce((acc, s) => acc + s.amountReais, 0) * 100) / 100;
  const expected = Math.round(expectedTotalReais * 100) / 100;
  return Math.abs(sum - expected) <= SPLIT_AMOUNT_TOLERANCE_REAIS;
}

/** Divide `totalReais` em `count` fatias iguais (centavos), jogando o resto do arredondamento
 *  na última fatia pra soma bater exatamente — evita ficar 1 centavo fora da tolerância. */
export function splitEvenlyReais(totalReais: number, count: number): number[] {
  if (count <= 0) return [];
  const totalCents = Math.round(totalReais * 100);
  const baseCents = Math.floor(totalCents / count);
  const remainder = totalCents - baseCents * count;
  return Array.from({ length: count }, (_, i) => (baseCents + (i < remainder ? 1 : 0)) / 100);
}

/** Convida N amigos a pagar sua fatia (PIX individual) da reserva `pending_payment`. Só o dono
 *  da reserva pode chamar; o servidor valida tudo de novo (dono, canal, status, soma, prazo). */
export async function splitArenaBookingPayment(
  functions: Functions,
  params: { bookingId: string; shares: SplitShareInput[] },
): Promise<SplitArenaBookingPaymentResult> {
  try {
    const result = await httpsCallable<Record<string, unknown>, SplitArenaBookingPaymentResult>(
      functions,
      'splitArenaBookingPayment',
    )({
      bookingId: params.bookingId,
      shares: params.shares.map((s) => ({ athleteId: s.athleteId, amountReais: s.amountReais })),
    });
    const data = result.data;
    if (!data?.bookingId || !Array.isArray(data.shareIds)) {
      throw new ArenaBookingSplitError('Resposta inválida do servidor.');
    }
    return data;
  } catch (err) {
    if (err instanceof ArenaBookingSplitError) throw err;
    throw mapCallableError(err);
  }
}

function toDateOrNull(v: unknown): Date | null {
  const t = v as Timestamp | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate() : null;
}

function shareFromDoc(id: string, data: DocumentData): ArenaBookingPaymentShare {
  const status = typeof data['status'] === 'string' ? (data['status'] as ArenaBookingPaymentShareStatus) : 'pending';
  return {
    id,
    payerAthleteId: typeof data['payerAthleteId'] === 'string' ? data['payerAthleteId'] : '',
    amountReais: Number(data['amountReais']) || 0,
    status,
    pixCopyPaste: typeof data['pixCopyPaste'] === 'string' ? data['pixCopyPaste'] : null,
    qrCodeBase64: typeof data['qrCodeBase64'] === 'string' ? data['qrCodeBase64'] : null,
    expiresAt: toDateOrNull(data['expiresAt']),
    createdAt: toDateOrNull(data['createdAt']),
  };
}

/** Status ao vivo de cada fatia (`arenaBookings/{bookingId}/paymentShares`) — leitura direta,
 *  sem callable. Rules só deixam o pagador da fatia ou o dono da reserva lerem. */
export function watchArenaBookingPaymentShares(
  db: Firestore,
  bookingId: string,
  onChange: (shares: ArenaBookingPaymentShare[]) => void,
): () => void {
  const col = collection(db, 'arenaBookings', bookingId, 'paymentShares');
  return onSnapshot(
    query(col, orderBy('createdAt', 'asc')),
    (snap) => onChange(snap.docs.map((d) => shareFromDoc(d.id, d.data()))),
    () => onChange([]),
  );
}
