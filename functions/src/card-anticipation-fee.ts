/**
 * Taxas do cartão repassadas ao atleta por cima da cobrança: processamento e antecipação.
 *
 * - Processamento: `R$ fixo + %` sobre o valor cobrado (`payment.creditCard.operationValue` e
 *   `oneInstallmentPercentage`, ou o `discountOneInstallmentPercentage` enquanto a promoção de
 *   `discountExpiration` valer).
 * - Antecipação: o cartão à vista só cai em D+32 (`payment.creditCard.daysToReceive`); antecipar
 *   custa um % AO MÊS (`anticipation.creditCard.detachedMonthlyFeeValue`), proporcional aos dias — o
 *   Asaas não publica a fórmula exata, então a conta é a proporcional simples `% ao mês × dias / 30`.
 *
 * Tudo sai de `GET /v3/myAccount/fees` (as condições vigentes da conta), não de alíquotas fixas no
 * código que envelheceriam caladas a cada renegociação. Sem resposta do Asaas valem os números
 * públicos da tabela (R$ 0,49 + 2,99%; 1,25% ao mês; D+32).
 *
 * Total do cartão = (base + antecipação + fixo) / (1 − % do processamento), arredondado para cima: o
 * Asaas tira o processamento do total e sobra a base mais a antecipação. A base é o que vai para o
 * cartão (já sem desconto e sem saldo de cashback) — o mesmo que o Pix cobraria. O webhook tira o
 * acréscimo inteiro do bruto (o recebedor fica no preço) e só cobra do recebedor o processamento que
 * passar do que o atleta pagou.
 *
 * Docs: https://docs.asaas.com/reference/recuperar-taxas-da-conta ·
 * https://www.asaas.com/precos-e-taxas
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, type DocumentReference} from "firebase-admin/firestore";
import {asaasArenaSecrets, fetchAsaas} from "./asaas-client";
import {CLIENT_FACING_REGIONS} from "./function-regions";

/** Tabela pública do Asaas: antecipação de cartão à vista. */
export const DEFAULT_ANTICIPATION_MONTHLY_PERCENT = 1.25;
/** Tabela pública do Asaas: cartão cai em D+32 dias corridos. */
export const DEFAULT_CARD_DAYS_TO_RECEIVE = 32;
/** Tabela pública do Asaas: processamento do cartão à vista. */
export const DEFAULT_CARD_PROCESSING_PERCENT = 2.99;
export const DEFAULT_CARD_FIXED_REAIS = 0.49;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface CardAnticipationTerms {
  monthlyPercent: number;
  daysToReceive: number;
}

/** O que a prévia (app e portais) precisa para refazer a conta do acréscimo. */
export interface CardFeeTerms {
  /** % da antecipação sobre a base. */
  anticipationPercent: number;
  /** % do processamento sobre o total cobrado. */
  processingPercent: number;
  /** Parte fixa do processamento, por cobrança. */
  fixedReais: number;
}

export const NO_CARD_FEE: CardFeeTerms = {anticipationPercent: 0, processingPercent: 0, fixedReais: 0};

/** Percentual da cobrança (2 casas): `% ao mês × dias / 30`. Termos inválidos = 0. */
export function cardAnticipationPercent(terms: CardAnticipationTerms): number {
  const {monthlyPercent, daysToReceive} = terms;
  if (!(monthlyPercent > 0) || !(daysToReceive > 0)) return 0;
  return Math.round(monthlyPercent * daysToReceive / 30 * 100) / 100;
}

export interface CardSurcharge {
  /** Acréscimo inteiro sobre a base, em centavos. */
  totalCents: number;
  /** Parte do acréscimo que cobre o processamento (o resto é a antecipação). */
  processingCents: number;
  anticipationCents: number;
}

/** Acréscimo do cartão sobre a base (reais). Base ≤ 0 ou termos zerados = nada. */
export function cardSurcharge(baseReais: number, terms: CardFeeTerms): CardSurcharge {
  const base = Math.round(baseReais * 100);
  const p = terms.processingPercent > 0 && terms.processingPercent < 50 ? terms.processingPercent : 0;
  const a = terms.anticipationPercent > 0 ? terms.anticipationPercent : 0;
  const fixed = terms.fixedReais > 0 ? Math.round(terms.fixedReais * 100) : 0;
  if (!(base > 0) || (p === 0 && a === 0 && fixed === 0)) {
    return {totalCents: 0, processingCents: 0, anticipationCents: 0};
  }
  const anticipationCents = Math.round(base * a / 100);
  // −1e-9: (x / 0,97) exato não pode virar o centavo seguinte por erro de ponto flutuante.
  const total = Math.ceil((base + anticipationCents + fixed) / (1 - p / 100) - 1e-9);
  const totalCents = total - base;
  return {totalCents, processingCents: totalCents - anticipationCents, anticipationCents};
}

function positive(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** Lê a resposta de `/myAccount/fees`; campo ausente ou fora do contrato = número público. */
export function anticipationTermsFromAccountFees(raw: unknown): CardAnticipationTerms {
  const r = (raw ?? {}) as {
    payment?: {creditCard?: {daysToReceive?: unknown}};
    anticipation?: {creditCard?: {detachedMonthlyFeeValue?: unknown}};
  };
  return {
    monthlyPercent: positive(r.anticipation?.creditCard?.detachedMonthlyFeeValue) ??
      DEFAULT_ANTICIPATION_MONTHLY_PERCENT,
    daysToReceive: positive(r.payment?.creditCard?.daysToReceive) ?? DEFAULT_CARD_DAYS_TO_RECEIVE,
  };
}

/**
 * Termos do acréscimo a partir de `/myAccount/fees`. A promoção (`discountOneInstallmentPercentage`)
 * vale até o dia de `discountExpiration` (inclusive, data civil de São Paulo em `todayKey`).
 */
export function cardFeeTermsFromAccountFees(raw: unknown, todayKey: string): CardFeeTerms {
  const r = (raw ?? {}) as {
    payment?: {creditCard?: {
      operationValue?: unknown; oneInstallmentPercentage?: unknown;
      discountOneInstallmentPercentage?: unknown; discountExpiration?: unknown;
    }};
  };
  const cc = r.payment?.creditCard ?? {};
  const promoUntil = typeof cc.discountExpiration === "string" ? cc.discountExpiration.slice(0, 10) : "";
  const promo = promoUntil && todayKey <= promoUntil ? positive(cc.discountOneInstallmentPercentage) : null;
  return {
    anticipationPercent: cardAnticipationPercent(anticipationTermsFromAccountFees(raw)),
    processingPercent: promo ?? positive(cc.oneInstallmentPercentage) ?? DEFAULT_CARD_PROCESSING_PERCENT,
    fixedReais: positive(cc.operationValue) ?? DEFAULT_CARD_FIXED_REAIS,
  };
}

export const PUBLIC_CARD_FEE_TERMS: CardFeeTerms = cardFeeTermsFromAccountFees({}, "");

function saoPauloDateKey(nowMs: number): string {
  return new Date(nowMs - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

let cache: {terms: CardFeeTerms; atMs: number} | null = null;

/**
 * Termos vigentes (cache de 6 h por instância). Nunca lança: Asaas fora do ar não pode travar o
 * checkout — vale a tabela pública e o erro fica no log.
 */
export async function loadCardFeeTerms(nowMs = Date.now()): Promise<CardFeeTerms> {
  if (cache && nowMs - cache.atMs < CACHE_TTL_MS) return cache.terms;
  try {
    const terms = cardFeeTermsFromAccountFees(
      await fetchAsaas<unknown>("/v3/myAccount/fees/"), saoPauloDateKey(nowMs),
    );
    cache = {terms, atMs: nowMs};
    return terms;
  } catch (e) {
    logger.error("Asaas: taxas da conta indisponíveis — taxas do cartão pela tabela pública", e);
    return PUBLIC_CARD_FEE_TERMS;
  }
}

/** Campos da prévia nas callables (`cardFeePercent` = antecipação, como antes). */
export function cardFeePreviewFields(terms: CardFeeTerms): {
  cardFeePercent: number; cardProcessingPercent: number; cardFixedReais: number;
} {
  return {
    cardFeePercent: terms.anticipationPercent,
    cardProcessingPercent: terms.processingPercent,
    cardFixedReais: terms.fixedReais,
  };
}

/** `POST /v3/anticipations` de uma cobrança (docs.asaas.com/reference/solicitar-antecipacao). */
export async function requestAsaasCardAnticipation(paymentId: string): Promise<{id?: string; status?: string}> {
  return fetchAsaas<{id?: string; status?: string}>("/v3/anticipations", {
    method: "POST",
    body: {payment: paymentId},
    idempotencyKey: `anticipation-${paymentId}`,
  });
}

export type RequestAnticipation = (asaasPaymentId: string) => Promise<{id?: string; status?: string}>;

/**
 * Pede a antecipação e grava o resultado no processado (`anticipation`). Nunca lança: recusada ou
 * falha, o recebedor é creditado na liquidação, como sem a taxa. `label` só entra no log.
 */
export async function requestAnticipationQuietly(
  processedRef: DocumentReference,
  paymentId: string,
  label: string,
  request: RequestAnticipation,
): Promise<void> {
  try {
    const res = await request(paymentId);
    await processedRef.set({
      anticipation: {
        id: res.id ?? null,
        status: res.status ?? null,
        requestedAt: FieldValue.serverTimestamp(),
      },
    }, {merge: true});
  } catch (e) {
    logger.error(
      `Asaas ${label}: antecipação do cartão ${paymentId} não pedida — o caixa credita na liquidação`,
      e,
    );
    try {
      await processedRef.set({
        anticipation: {
          error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
          requestedAt: FieldValue.serverTimestamp(),
        },
      }, {merge: true});
    } catch (writeErr) {
      logger.error(`Asaas ${label}: falha ao gravar a antecipação`, writeErr);
    }
  }
}

/**
 * Prévia do checkout (app e portais): os termos que o cartão soma por cima ([cardSurcharge]). A
 * cobrança refaz a conta no servidor; isto só põe o valor do cartão e o "Pix mais barato" na tela.
 */
export const getCardAnticipationFee = onCall(
  {region: CLIENT_FACING_REGIONS, invoker: "public" as const, secrets: asaasArenaSecrets},
  async (request): Promise<ReturnType<typeof cardFeePreviewFields>> => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
    return cardFeePreviewFields(await loadCardFeeTerms());
  },
);

/** Só para testes. */
export function resetCardAnticipationCacheForTests(): void {
  cache = null;
}
