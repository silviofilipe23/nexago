/**
 * Taxa de antecipação do cartão, repassada ao atleta por cima da cobrança.
 *
 * O cartão à vista só cai na conta em D+32 (`payment.creditCard.daysToReceive`). Antecipar custa um
 * percentual AO MÊS (`anticipation.creditCard.detachedMonthlyFeeValue`), proporcional aos dias
 * antecipados — o Asaas não publica a fórmula exata, então a conta aqui é a proporcional simples:
 * `% ao mês × dias / 30`. As duas pontas saem de `GET /v3/myAccount/fees` (as condições vigentes da
 * conta), não de uma alíquota fixa no código que envelheceria calada a cada renegociação. Sem
 * resposta do Asaas valem os números públicos da tabela (1,25% ao mês, D+32).
 *
 * A taxa incide sobre o que vai para o cartão (já sem desconto e sem saldo de cashback): é esse
 * dinheiro que se antecipa. Fica com a plataforma — o webhook a tira do bruto antes do preço, como a
 * parte da taxa de serviço do atleta.
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

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface CardAnticipationTerms {
  monthlyPercent: number;
  daysToReceive: number;
}

/** Percentual da cobrança (2 casas): `% ao mês × dias / 30`. Termos inválidos = 0. */
export function cardAnticipationPercent(terms: CardAnticipationTerms): number {
  const {monthlyPercent, daysToReceive} = terms;
  if (!(monthlyPercent > 0) || !(daysToReceive > 0)) return 0;
  return Math.round(monthlyPercent * daysToReceive / 30 * 100) / 100;
}

/** Centavos da taxa sobre o valor que vai para o cartão. */
export function cardAnticipationFeeCents(cardReais: number, percent: number): number {
  if (!(cardReais > 0) || !(percent > 0)) return 0;
  return Math.round(Math.round(cardReais * 100) * percent / 100);
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

let cache: {percent: number; atMs: number} | null = null;

/**
 * Percentual vigente (cache de 6 h por instância). Nunca lança: Asaas fora do ar não pode travar o
 * checkout — vale a tabela pública e o erro fica no log.
 */
export async function loadCardAnticipationPercent(nowMs = Date.now()): Promise<number> {
  if (cache && nowMs - cache.atMs < CACHE_TTL_MS) return cache.percent;
  let terms: CardAnticipationTerms;
  try {
    terms = anticipationTermsFromAccountFees(await fetchAsaas<unknown>("/v3/myAccount/fees/"));
  } catch (e) {
    logger.error("Asaas: taxas da conta indisponíveis — antecipação do cartão pela tabela pública", e);
    return cardAnticipationPercent({
      monthlyPercent: DEFAULT_ANTICIPATION_MONTHLY_PERCENT,
      daysToReceive: DEFAULT_CARD_DAYS_TO_RECEIVE,
    });
  }
  const percent = cardAnticipationPercent(terms);
  cache = {percent, atMs: nowMs};
  return percent;
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
 * Prévia do checkout (app e portais): o percentual que o cartão soma por cima. A cobrança refaz a
 * conta no servidor; isto só põe o valor do cartão e o "Pix mais barato" na tela antes de pagar.
 */
export const getCardAnticipationFee = onCall(
  {region: CLIENT_FACING_REGIONS, invoker: "public" as const, secrets: asaasArenaSecrets},
  async (request): Promise<{cardFeePercent: number}> => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
    return {cardFeePercent: await loadCardAnticipationPercent()};
  },
);

/** Só para testes. */
export function resetCardAnticipationCacheForTests(): void {
  cache = null;
}
