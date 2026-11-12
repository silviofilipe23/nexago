import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  updateDoc,
  serverTimestamp,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { athleteVisibleCourtName } from '@nexago/arena-discovery';
import { bookingParticipantsOf, type BookingParticipant } from './booking-invite-model';
import { readCashbackCharge } from './cashback-preview';
import { readSquadDiscount } from './squad-discount';

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
  /**
   * Arena "a arena define a quadra": a reserva vai sem quadra (`allocation: 'capacity'`) e o
   * servidor escolhe uma provisória; `courtId`/`courtName` ficam vazios. Ver
   * `docs/product/reservas-por-capacidade.md`.
   */
  capacity?: boolean;
  /** Esporte escolhido na grade por horário (no modo quadra o esporte sai da quadra). */
  sport?: string | null;
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
  /** Cupom de desconto (código digitado pelo atleta) aplicado nesta cotação — não acumula
   *  com promoção automática, vale o maior desconto (decisão do backend). */
  couponApplied: boolean;
  couponId: string | null;
  couponDiscountReais: number;
  /** Desconto do professor (`asProfessor`) — 0 quando não houve ou a promoção/cupom já saía mais
   *  barato. Quando vale, a cotação vem sem promoção e sem cupom (não acumulam). */
  professorDiscountPercent: number;
  professorDiscountReais: number;
  /** Preço por perfil da arena (aluno/professor validado) — `null` no preço avulso ou quando
   *  promoção/cupom saíram mais baratos. Servidor antigo não devolve. */
  athletePricingLabel?: string | null;
  athletePricingDiscountReais?: number;
  /** Banco de horas do mensalista (contrato no CRM da arena) — 0/`null` quando não se aplica ou
   *  servidor antigo. `memberHoursWeeklyMinutes` 0 = não é mensalista nesta arena. */
  memberHoursWeeklyMinutes?: number;
  /** Saldo da semana ANTES desta reserva. */
  memberHoursAvailableMinutes?: number;
  /** Minutos desta reserva cobertos pelo banco (saem a R$ 0; o resto é cobrado normal). */
  memberHoursMinutes?: number;
  memberHoursDiscountReais?: number;
  memberHoursPlanName?: string | null;
  /** Por que o banco não cobriu: mensalidade atrasada, horas da semana acabaram ou cupom mais barato. */
  memberHoursBlockedReason?: MemberHoursBlockedReason | null;
}

export type MemberHoursBlockedReason = 'overdue' | 'exhausted' | 'coupon_cheaper';

export interface CreateArenaBookingResult {
  bookingId: string;
  amountReais: number;
  amountToPayNowReais: number;
  amountDueOnsiteReais: number;
  paymentMode: ArenaBookingPaymentMode;
  paymentFraction: number;
  /** ISO — só em PIX (prazo pra pagar antes de a reserva expirar). */
  paymentExpiresAt: string | null;
  couponApplied: boolean;
  couponId: string | null;
  couponDiscountReais: number;
  /** Ausentes em servidor antigo — trate como 0. */
  professorDiscountPercent?: number;
  professorDiscountReais?: number;
  /** Banco de horas do mensalista aplicado nesta reserva (ausente em servidor antigo). */
  memberHoursMinutes?: number;
  memberHoursDiscountReais?: number;
}

export interface ArenaBookingPixPayment {
  paymentId: string;
  /** Código copia-e-cola. */
  qrCode: string;
  /** PNG base64 do QR (pode vir vazio). */
  qrCodeBase64: string;
  /** ISO. */
  expiresAt: string;
  /** PREÇO de agora (com cupom e fração) — o cashback não muda este campo. */
  amountToPayNowReais: number;
  /** Parte paga com cashback (0 sem saldo). */
  cashbackAppliedReais: number;
  /** O que o QR vale de fato; o preço quando o backend é antigo. */
  chargedReais: number;
  /** Desconto do código de embaixador (NexaSquad), já fora do `chargedReais` (0 sem código). */
  squadDiscountReais: number;
}

export interface ArenaBookingDoc {
  id: string;
  arenaId: string;
  arenaName: string;
  courtId: string;
  /** Nome que o atleta vê: "Quadra definida na chegada" enquanto a arena não mostra a quadra. */
  courtName: string;
  /** `unassigned`: arena "a arena define a quadra" e a recepção ainda não definiu. */
  allocationStatus: string | null;
  /** Esporte escolhido pelo atleta (código do catálogo) — `null` em reserva antiga. */
  sport: string | null;
  dateKey: string;
  startTime: string;
  endTime: string;
  amountReais: number;
  amountToPayNowReais: number;
  amountDueOnsiteReais: number;
  amountPaidOnlineReais: number;
  paymentChannel: string;
  paymentStatus: string;
  paymentFraction: number | null;
  status: string;
  paymentExpiresAt: Date | null;
  /** Quantos slots da grade a reserva ocupa (de `pricingLineItems`; mínimo 1). */
  slotCount: number;
  /** Dono real da reserva — só ele pode cancelar (espelha `BookingService.cancelBooking`). */
  ownerAthleteId: string | null;
  /** Total de atletas com presença confirmada (inclui o dono). */
  confirmedParticipants: number;
  guestAthleteId: string | null;
  guestAthleteName: string | null;
  /** Quem entrou por convite (`participants`, gravado só pelas callables de
   *  `arena-booking-invite.ts`). Não inclui o dono. */
  participants: BookingParticipant[];
  /** `participantUids` — a mesma lista em uids (é o campo que a Agenda consulta). */
  participantUids: string[];
  /** Ocorrência de horário fixo (mensalista) — gerida pela arena, sem cancelamento pelo app. */
  recurringBookingId: string | null;
  createdAt: Date | null;
  couponCode: string | null;
  couponDiscountReais: number;
  /** Cobrança PIX da reserva inteira — também o id do lote de cashback (`lots/{asaasPaymentId}`).
   *  `null` no local e depois da divisão. */
  asaasPaymentId: string | null;
  /** Parte paga com cashback, gravada pelo webhook no pagamento (0 sem saldo). Não usar
   *  `cashbackAppliedCents`: a divisão devolve a reserva de saldo sem zerar esse campo. */
  cashbackAppliedReais: number;
  /** Banco de horas do mensalista: a reserva inteira saiu do banco (nada a pagar). */
  coveredByMemberHours?: boolean;
  /** Minutos e desconto que saíram do banco de horas (0 sem banco). */
  memberHoursMinutes?: number;
  memberHoursDiscountReais?: number;
}

export class ArenaBookingError extends Error {
  constructor(
    message: string,
    readonly code: 'SLOT_CONFLICT' | 'BLOCKED_ATHLETE' | 'PROFESSOR_DENIED' | null = null,
    /** Campo que o servidor apontou (`details.field`), ex.: `squadCode` no checkout. */
    readonly field: string | null = null,
  ) {
    super(message);
  }

  get isSlotConflict(): boolean {
    return this.code === 'SLOT_CONFLICT';
  }

  /** "Reservar como professor" recusado pelo vínculo (`details.reason`): a reserva como atleta
   *  segue valendo — a mensagem do servidor já diz o motivo. */
  get isProfessorDenied(): boolean {
    return this.code === 'PROFESSOR_DENIED';
  }
}

/** Motivos de `createArenaBooking` recusar `asProfessor` (`professorPermissionError`). */
const PROFESSOR_DENIAL_REASONS: ReadonlySet<unknown> = new Set(['no_link', 'not_active', 'permission_off']);

/** Mesmo mapeamento de mensagens do `BookingService._mapFunctionsMessage` (Flutter). Exportado
 *  para o spec. */
export function mapCallableError(err: unknown): ArenaBookingError {
  const fb = err as { code?: string; message?: string; details?: { field?: unknown; reason?: unknown } };
  const code = (fb.code ?? '').replace(/^functions\//, '');
  const detail = typeof fb.message === 'string' && fb.message.trim() ? fb.message.trim() : null;
  // Código de embaixador recusado: a mensagem vai para o campo, não para o toast.
  if (fb.details?.field === 'squadCode' && detail) return new ArenaBookingError(detail, null, 'squadCode');
  switch (code) {
    case 'unauthenticated':
      return new ArenaBookingError('Faça login para confirmar a reserva.');
    case 'permission-denied':
      if (PROFESSOR_DENIAL_REASONS.has(fb.details?.reason)) {
        return new ArenaBookingError(detail ?? 'O vínculo não deixa reservar como professor agora.', 'PROFESSOR_DENIED');
      }
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
    case 'resource-exhausted':
      // Arena "a arena define a quadra": todas as quadras do horário foram ocupadas.
      return new ArenaBookingError(detail ?? 'Esse horário lotou. Escolha outro.', 'SLOT_CONFLICT');
    case 'internal':
      return new ArenaBookingError(detail ?? 'Erro no servidor. Tente novamente.');
    default:
      return new ArenaBookingError(detail ?? 'Não foi possível concluir a reserva.');
  }
}

export function callablePayload(args: ArenaBookingArgs, couponCode?: string): Record<string, unknown> {
  return {
    arenaId: args.arenaId,
    arenaName: args.arenaName,
    // Sem quadra: o servidor escolhe a provisória e precisa do esporte já na cotação (o preço é
    // o do horário daquele esporte).
    ...(args.capacity
      ? { allocation: 'capacity', sport: args.sport ?? null }
      : { courtId: args.courtId, courtName: args.courtName }),
    date: args.dateKey,
    startTime: args.startTime,
    endTime: args.endTime,
    ...(args.selectedSlotStartTimes.length > 0
      ? { selectedSlotStartTimes: args.selectedSlotStartTimes }
      : {}),
    ...(couponCode?.trim() ? { couponCode: couponCode.trim() } : {}),
  };
}

/** Cota autoritativa (preço por quadra + promoções + cupom) — a mesma que o servidor cobra.
 *  `couponCode` é opcional: se informado e inválido/expirado/esgotado, o callable lança
 *  `not-found`/`failed-precondition` com mensagem pronta pro atleta — quem chama decide se
 *  isso trava a cotação ou só mostra o erro perto do campo de cupom. `asProfessor` cota com o
 *  desconto do vínculo; sem vínculo válido o servidor devolve o preço de atleta, calado. */
export async function quoteArenaBooking(
  functions: Functions,
  args: ArenaBookingArgs,
  couponCode?: string,
  options: { asProfessor?: boolean } = {},
): Promise<ArenaBookingQuote> {
  try {
    const result = await httpsCallable<
      Record<string, unknown>,
      {
        amountReais: number;
        lineItems?: unknown[];
        couponApplied?: boolean;
        couponId?: string | null;
        couponDiscountReais?: number;
        professorDiscountPercent?: number;
        professorDiscountReais?: number;
        athletePricingTier?: string | null;
        athletePricingLabel?: string | null;
        athletePricingDiscountReais?: number;
        memberHoursWeeklyMinutes?: number;
        memberHoursAvailableMinutes?: number;
        memberHoursMinutes?: number;
        memberHoursDiscountReais?: number;
        memberHoursPlanName?: string | null;
        memberHoursBlockedReason?: string | null;
      }
    >(functions, 'quoteArenaBooking')({
      ...callablePayload(args, couponCode),
      ...(options.asProfessor === true ? { asProfessor: true } : {}),
    });
    const amount = Number(result.data.amountReais);
    const memberHours = memberHoursFromQuote(result.data);
    // Total 0 só vale quando o banco de horas cobriu a reserva inteira.
    if (!Number.isFinite(amount) || amount < 0 || (amount === 0 && (memberHours.memberHoursMinutes ?? 0) <= 0)) {
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
    return {
      amountReais: amount,
      lineItems,
      couponApplied: result.data.couponApplied === true,
      couponId: typeof result.data.couponId === 'string' ? result.data.couponId : null,
      couponDiscountReais: Number(result.data.couponDiscountReais) || 0,
      professorDiscountPercent: Number(result.data.professorDiscountPercent) || 0,
      professorDiscountReais: Number(result.data.professorDiscountReais) || 0,
      ...athletePricingFromQuote(result.data),
      ...memberHours,
    };
  } catch (err) {
    if (err instanceof ArenaBookingError) throw err;
    throw mapCallableError(err);
  }
}

/** Preço por perfil devolvido pela cotação (`null` = avulso). */
export function athletePricingFromQuote(data: {
  athletePricingTier?: string | null;
  athletePricingLabel?: string | null;
  athletePricingDiscountReais?: number;
}): Pick<ArenaBookingQuote, 'athletePricingLabel' | 'athletePricingDiscountReais'> {
  const tier = data.athletePricingTier;
  const reais = Number(data.athletePricingDiscountReais) || 0;
  if ((tier !== 'student' && tier !== 'professor') || reais <= 0) {
    return { athletePricingLabel: null, athletePricingDiscountReais: 0 };
  }
  const label = data.athletePricingLabel?.trim() || (tier === 'student' ? 'Aluno' : 'Professor');
  return { athletePricingLabel: label, athletePricingDiscountReais: reais };
}

const MEMBER_HOURS_BLOCKED_REASONS: ReadonlySet<unknown> = new Set(['overdue', 'exhausted', 'coupon_cheaper']);

type MemberHoursQuoteFields =
  | 'memberHoursWeeklyMinutes'
  | 'memberHoursAvailableMinutes'
  | 'memberHoursMinutes'
  | 'memberHoursDiscountReais'
  | 'memberHoursPlanName'
  | 'memberHoursBlockedReason';

/** Banco de horas do mensalista devolvido pela cotação. Sem banco na semana (não é mensalista ou
 *  servidor antigo) tudo sai zerado. */
export function memberHoursFromQuote(data: {
  memberHoursWeeklyMinutes?: number;
  memberHoursAvailableMinutes?: number;
  memberHoursMinutes?: number;
  memberHoursDiscountReais?: number;
  memberHoursPlanName?: string | null;
  memberHoursBlockedReason?: string | null;
}): Required<Pick<ArenaBookingQuote, MemberHoursQuoteFields>> {
  const minutesOf = (v: unknown): number => Math.max(0, Math.floor(Number(v) || 0));
  const weekly = minutesOf(data.memberHoursWeeklyMinutes);
  if (weekly <= 0) {
    return {
      memberHoursWeeklyMinutes: 0,
      memberHoursAvailableMinutes: 0,
      memberHoursMinutes: 0,
      memberHoursDiscountReais: 0,
      memberHoursPlanName: null,
      memberHoursBlockedReason: null,
    };
  }
  const reason = data.memberHoursBlockedReason;
  return {
    memberHoursWeeklyMinutes: weekly,
    memberHoursAvailableMinutes: minutesOf(data.memberHoursAvailableMinutes),
    memberHoursMinutes: minutesOf(data.memberHoursMinutes),
    memberHoursDiscountReais: Math.max(0, Number(data.memberHoursDiscountReais) || 0),
    memberHoursPlanName: data.memberHoursPlanName?.trim() || null,
    memberHoursBlockedReason: MEMBER_HOURS_BLOCKED_REASONS.has(reason) ? (reason as MemberHoursBlockedReason) : null,
  };
}

/** Cria a reserva (transação server-side com locks). `paymentMode: 'onsite'` já nasce
 *  `status: 'active'`; `'pix'` nasce `pending_payment` e precisa de `createBookingPixPayment`. */
export async function createArenaBooking(
  functions: Functions,
  args: ArenaBookingArgs,
  options: {
    clientAmountReais: number;
    paymentMode: ArenaBookingPaymentMode;
    paymentFraction?: number;
    /** Código já validado numa cotação anterior — só é reenviado se ainda estiver aplicado. */
    couponCode?: string;
    /** Esporte escolhido entre os da quadra (`bookingSportOptions`) — o servidor recusa outro. */
    sport?: string;
    /** "Reservar como professor": o servidor relê o vínculo e carimba `bookedAs`. Sem a chave é
     *  reserva de atleta, como sempre. */
    asProfessor?: boolean;
  },
): Promise<CreateArenaBookingResult> {
  if (options.paymentMode === 'pix' && options.paymentFraction !== 0.5 && options.paymentFraction !== 1) {
    throw new ArenaBookingError('Escolha pagar 50% ou 100% via PIX.');
  }
  try {
    const result = await httpsCallable<Record<string, unknown>, CreateArenaBookingResult>(
      functions,
      'createArenaBooking',
    )({
      ...callablePayload(args, options.couponCode),
      clientAmountReais: options.clientAmountReais,
      paymentMode: options.paymentMode,
      ...(options.paymentMode === 'pix' ? { paymentFraction: options.paymentFraction } : {}),
      ...(options.sport?.trim() ? { sport: options.sport.trim() } : {}),
      ...(options.asProfessor === true ? { asProfessor: true } : {}),
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

export interface BookingPixPaymentParams {
  bookingId: string;
  cpfCnpj?: string;
  paymentFraction?: number;
  /** Só `true` quando o atleta ligou "Usar meu cashback" e há saldo usável. */
  useCashback?: boolean;
  /** Código de embaixador do NexaSquad digitado (o link/QR o servidor resolve sozinho). */
  squadCode?: string;
}

/** Corpo de `createArenaBookingPixPayment`. Sem `useCashback` o backend cobra como antes. */
export function bookingPixPaymentPayload(params: BookingPixPaymentParams): Record<string, unknown> {
  const payload: Record<string, unknown> = { bookingId: params.bookingId };
  const cpf = params.cpfCnpj?.replace(/\D/g, '') ?? '';
  if (cpf.length === 11 || cpf.length === 14) payload['cpfCnpj'] = cpf;
  if (params.paymentFraction === 0.5 || params.paymentFraction === 1) {
    payload['paymentFraction'] = params.paymentFraction;
  }
  if (params.useCashback === true) payload['useCashback'] = true;
  const squadCode = params.squadCode?.trim() ?? '';
  if (squadCode) payload['squadCode'] = squadCode;
  return payload;
}

/** Valida e normaliza a resposta — `chargedReais` cai no preço quando o backend é antigo. */
export function bookingPixPaymentFromResponse(data: unknown): ArenaBookingPixPayment {
  const raw = (data ?? {}) as Record<string, unknown>;
  const paymentId = raw['paymentId'];
  const qrCode = raw['qrCode'];
  const amountToPayNowReais = Number(raw['amountToPayNowReais']);
  if (typeof paymentId !== 'string' || !paymentId || typeof qrCode !== 'string' || !qrCode || !Number.isFinite(amountToPayNowReais)) {
    throw new ArenaBookingError('Resposta inválida do servidor de pagamento.');
  }
  return {
    paymentId,
    qrCode,
    qrCodeBase64: typeof raw['qrCodeBase64'] === 'string' ? raw['qrCodeBase64'] : '',
    expiresAt: typeof raw['expiresAt'] === 'string' ? raw['expiresAt'] : '',
    amountToPayNowReais,
    ...readCashbackCharge(raw, amountToPayNowReais),
    squadDiscountReais: readSquadDiscount(raw),
  };
}

/** Gera a cobrança PIX (Asaas) da reserva `pending_payment` — QR + copia-e-cola. */
export async function createBookingPixPayment(
  functions: Functions,
  params: BookingPixPaymentParams,
): Promise<ArenaBookingPixPayment> {
  try {
    const result = await httpsCallable<Record<string, unknown>, unknown>(
      functions,
      'createArenaBookingPixPayment',
    )(bookingPixPaymentPayload(params));
    return bookingPixPaymentFromResponse(result.data);
  } catch (err) {
    if (err instanceof ArenaBookingError) throw err;
    throw mapCallableError(err);
  }
}

/** Cobrança de CARTÃO da reserva: o checkout hospedado do Asaas, aberto num link real. */
export interface ArenaBookingCardPayment {
  paymentId: string;
  /** Página do Asaas onde o atleta digita o cartão — nada de cartão passa pelo nexaGO. */
  invoiceUrl: string;
  /** ISO — o cartão tem prazo próprio (15 min desde a criação da reserva). */
  expiresAt: string;
  amountToPayNowReais: number;
  cashbackAppliedReais: number;
  chargedReais: number;
  squadDiscountReais: number;
}

/** Valida e normaliza a resposta de `createArenaBookingCardPayment`. */
export function bookingCardPaymentFromResponse(data: unknown): ArenaBookingCardPayment {
  const raw = (data ?? {}) as Record<string, unknown>;
  const paymentId = raw['paymentId'];
  const invoiceUrl = raw['invoiceUrl'];
  const amountToPayNowReais = Number(raw['amountToPayNowReais']);
  if (
    typeof paymentId !== 'string' || !paymentId ||
    typeof invoiceUrl !== 'string' || !invoiceUrl.trim() ||
    !Number.isFinite(amountToPayNowReais)
  ) {
    throw new ArenaBookingError('Resposta inválida do servidor de pagamento.');
  }
  return {
    paymentId,
    invoiceUrl: invoiceUrl.trim(),
    expiresAt: typeof raw['expiresAt'] === 'string' ? raw['expiresAt'] : '',
    amountToPayNowReais,
    ...readCashbackCharge(raw, amountToPayNowReais),
    squadDiscountReais: readSquadDiscount(raw),
  };
}

/** Abre a cobrança da reserva no cartão de crédito (à vista). Mesmo payload do Pix. */
export async function createBookingCardPayment(
  functions: Functions,
  params: BookingPixPaymentParams,
): Promise<ArenaBookingCardPayment> {
  try {
    const result = await httpsCallable<Record<string, unknown>, unknown>(
      functions,
      'createArenaBookingCardPayment',
    )(bookingPixPaymentPayload(params));
    return bookingCardPaymentFromResponse(result.data);
  } catch (err) {
    if (err instanceof ArenaBookingError) throw err;
    throw mapCallableError(err);
  }
}

/**
 * Solta a reserva `pending_payment` de uma cobrança de CARTÃO. Diferente de
 * `cancelPendingBookingPayment`, NÃO engole `failed-precondition`: com cartão
 * é ele que diz "o cartão já foi aprovado / está em análise" — engolido, a tela
 * trataria como cancelada uma reserva que o servidor acabou de confirmar.
 */
export async function releasePendingBookingCardPayment(functions: Functions, bookingId: string): Promise<void> {
  try {
    await httpsCallable(functions, 'cancelPendingArenaBookingPayment')({ bookingId });
  } catch (err) {
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

/** Cancela a reserva do atleta dono pela callable `cancelMyArenaBooking` — espelha
 *  `BookingService.cancelBooking` (Flutter). Dentro do prazo grátis o que foi pago pelo
 *  app (Pix ou cartão) é estornado pelo mesmo meio; devolve o valor estornado (0 quando
 *  nada foi pago pelo app). Fora do prazo o servidor recusa e manda falar com a arena. */
export async function cancelBooking(functions: Functions, bookingId: string): Promise<number> {
  const id = bookingId.trim();
  if (!id) {
    throw new ArenaBookingError('Dados inválidos para cancelamento.');
  }
  try {
    const result = await httpsCallable<{ bookingId: string }, { refundedReais?: unknown }>(
      functions,
      'cancelMyArenaBooking',
    )({ bookingId: id });
    const refunded = Number(result.data?.refundedReais);
    return Number.isFinite(refunded) && refunded > 0 ? refunded : 0;
  } catch (err) {
    const fb = err as { code?: string; message?: string };
    const detail = typeof fb.message === 'string' && fb.message.trim() ? fb.message.trim() : null;
    // As recusas do cancelamento (prazo, horário fixo, estorno indisponível) já vêm em
    // português do servidor; o mapeamento genérico falaria em "reservar".
    if (detail && !(fb.code ?? '').endsWith('internal')) throw new ArenaBookingError(detail);
    throw mapCallableError(err);
  }
}

/** Aviso depois do cancelamento: com estorno, diz o valor e quando ele chega. */
export function canceledBookingNotice(refundedReais: number): string {
  if (refundedReais <= 0) return 'Reserva cancelada.';
  const value = refundedReais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return `Reserva cancelada. Estorno de ${value} a caminho: no Pix cai em instantes; no cartão, aparece na fatura.`;
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

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function participantUidsOf(data: Record<string, unknown>): string[] {
  const raw = data['participantUids'];
  const uids = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === 'string').map((v) => v.trim())
    : bookingParticipantsOf(data['participants']).map((p) => p.uid);
  return [...new Set(uids.filter((uid) => uid.length > 0))];
}

export function bookingFromSnapshot(snap: DocumentSnapshot<DocumentData>): ArenaBookingDoc | null {
  const data = snap.data();
  if (!data) return null;
  return {
    id: snap.id,
    arenaId: typeof data['arenaId'] === 'string' ? data['arenaId'] : '',
    arenaName: typeof data['arenaName'] === 'string' ? data['arenaName'] : 'Arena',
    courtId: typeof data['courtId'] === 'string' ? data['courtId'] : '',
    // Arena "a arena define a quadra": a provisória não aparece para o atleta.
    courtName: athleteVisibleCourtName(data, typeof data['courtName'] === 'string' ? data['courtName'] : 'Quadra'),
    allocationStatus: optionalStr(data['allocationStatus']),
    sport: optionalStr(data['sport']),
    dateKey: bookingDateKeyOf(data),
    startTime: normTime(data['startTime']),
    endTime: normTime(data['endTime']),
    amountReais: Number(data['amountReais']) || 0,
    amountToPayNowReais: Number(data['amountToPayNowReais']) || 0,
    amountDueOnsiteReais: Number(data['amountDueOnsiteReais']) || 0,
    amountPaidOnlineReais: Number(data['amountPaidOnlineReais']) || 0,
    paymentChannel: typeof data['paymentChannel'] === 'string' ? data['paymentChannel'] : 'onsite',
    paymentStatus: typeof data['paymentStatus'] === 'string' ? data['paymentStatus'] : 'none',
    paymentFraction: typeof data['paymentFraction'] === 'number' ? data['paymentFraction'] : null,
    status: typeof data['status'] === 'string' ? data['status'] : '',
    paymentExpiresAt: toDateOrNull(data['paymentExpiresAt']),
    slotCount: Array.isArray(data['pricingLineItems']) ? Math.max(1, data['pricingLineItems'].length) : 1,
    ownerAthleteId: optionalStr(data['athleteId']) ?? optionalStr(data['bookingAthleteId']),
    confirmedParticipants: Math.max(1, Number(data['confirmedParticipants']) || 1),
    guestAthleteId: optionalStr(data['guestAthleteId']),
    guestAthleteName: optionalStr(data['guestAthleteName']),
    participants: bookingParticipantsOf(data['participants']),
    participantUids: participantUidsOf(data),
    recurringBookingId: optionalStr(data['recurringBookingId']),
    createdAt: toDateOrNull(data['createdAt']),
    couponCode: optionalStr(data['couponCode']),
    couponDiscountReais: Number(data['couponDiscountReais']) || 0,
    asaasPaymentId: optionalStr(data['asaasPaymentId']),
    cashbackAppliedReais: Math.max(0, Number(data['cashbackAppliedReais']) || 0),
    coveredByMemberHours: data['coveredByMemberHours'] === true,
    memberHoursMinutes: Math.max(0, Number(data['memberHoursMinutes']) || 0),
    memberHoursDiscountReais: Math.max(0, Number(data['memberHoursDiscountReais']) || 0),
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
      if (!pendingBookingMatchesArgs(booking, args)) continue;
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

/** A reserva pendente é do mesmo horário escolhido? No modo capacidade a pendente segura uma
 *  quadra provisória: casa pela reserva sem quadra definida do mesmo esporte. Exportado para o
 *  spec. */
export function pendingBookingMatchesArgs(booking: ArenaBookingDoc, args: ArenaBookingArgs): boolean {
  if (booking.arenaId !== args.arenaId) return false;
  if (args.capacity) {
    if (booking.allocationStatus !== 'unassigned') return false;
    if ((booking.sport ?? '') !== (args.sport ?? '')) return false;
  } else if (booking.courtId !== args.courtId) {
    return false;
  }
  return (
    booking.dateKey === args.dateKey &&
    booking.startTime === normTime(args.startTime) &&
    booking.endTime === normTime(args.endTime)
  );
}

function isResumablePendingPix(data: Record<string, unknown>): boolean {
  const paymentStatus = typeof data['paymentStatus'] === 'string' ? data['paymentStatus'].toLowerCase() : '';
  if (paymentStatus === 'paid' || paymentStatus === 'partial') return false;
  const channel = typeof data['paymentChannel'] === 'string' ? data['paymentChannel'].toLowerCase().trim() : '';
  if (channel && channel !== 'pix') return false;
  const expiresAt = toDateOrNull(data['paymentExpiresAt']);
  return expiresAt == null || expiresAt.getTime() > Date.now();
}
