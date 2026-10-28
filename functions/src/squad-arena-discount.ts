/**
 * NexaSquad: desconto do seguidor nas cobranças da arena — reserva de quadra e clubinho.
 *
 * Mesmo trilho da inscrição: o código digitado (ou o link/QR guardado na conta) dá ao atleta o %
 * do contrato do embaixador, e o desconto sai da TAXA DA NEXAGO — a arena recebe o mesmo líquido
 * (o webhook soma o desconto ao bruto, como faz com o saldo de cashback). Por isso o teto é a taxa
 * da plataforma desta cobrança (reserva: % do plano da arena com piso; clubinho: 5% sem piso), e a
 * cobrança nunca fica abaixo do mínimo do Asaas. O desconto sai antes do cashback.
 *
 * Aqui não há comissão: o programa paga comissão só na inscrição (a reserva rende à nexaGO só a
 * taxa). O desconto fica registrado em `squadChargeDiscounts` com o tipo e o embaixador. Com "só na
 * primeira" ligado nas regras, vale uma vez por tipo de compra: a primeira reserva e o primeiro
 * clubinho com desconto confirmado.
 */
import * as logger from "firebase-functions/logger";
import {HttpsError} from "firebase-functions/v2/https";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {resolveRegistrationAttribution, type ResolvedAttribution} from "./squad-attribution";
import {
  chargeDiscountCents,
  clampFollowerDiscount,
  followerPctOf,
  markChargeDiscountConfirmed,
  payerUsedDiscount,
  recordChargeDiscount,
} from "./squad-commission-lifecycle";
import {loadAttributionRules} from "./squad-rules";
import {computePlatformFeeReais} from "./platform-fees";

export type ArenaDiscountKind = "booking" | "club";

export interface ArenaSquadDiscount {
  attribution: ResolvedAttribution;
  cents: number;
  pct: number;
}

/**
 * Atribuição e desconto desta cobrança. Código digitado errado (ou do próprio atleta) é recusado
 * aqui, ANTES de cobrar, com `details.field = "squadCode"`; falha de leitura nunca derruba a
 * cobrança (vira "sem desconto"). `null` = ninguém indicou.
 */
export async function resolveArenaSquadDiscount(
  db: Firestore,
  input: {
    kind: ArenaDiscountKind;
    payerUid: string;
    typedCode: unknown;
    /** Valor desta cobrança (na reserva com sinal, só o que se paga agora). */
    priceReais: number;
    feePercent: number;
    /** Piso da taxa: padrão da plataforma; clubinho usa 0. */
    feeFloorReais?: number;
  },
  now: Date,
): Promise<ArenaSquadDiscount | null> {
  let attribution: ResolvedAttribution | null;
  try {
    attribution = await resolveRegistrationAttribution(
      db,
      {payerUid: input.payerUid, athleteUids: [input.payerUid], typedCode: input.typedCode},
      now,
    );
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.warn(`Squad: atribuição indisponível na cobrança (${input.kind})`, e);
    return null;
  }
  if (!attribution) return null;
  try {
    const rules = await loadAttributionRules(db);
    if (!rules.followerDiscountScope[input.kind] ||
      (rules.followerDiscountFirstOnly && await payerUsedDiscount(db, input.payerUid, input.kind))) {
      return {attribution, cents: 0, pct: 0};
    }
    const pct = await followerPctOf(db, attribution.ambassador);
    const feeCapCents = Math.round(
      computePlatformFeeReais(input.priceReais, input.feePercent, {floorReais: input.feeFloorReais}) * 100,
    );
    const cents = clampFollowerDiscount(Math.round(input.priceReais * 100), pct, feeCapCents);
    return {attribution, cents, pct: cents > 0 ? pct : 0};
  } catch (e) {
    logger.warn(`Squad: desconto indisponível na cobrança (${input.kind})`, e);
    return {attribution, cents: 0, pct: 0};
  }
}

/** Sufixo da idempotência do Asaas: sem ele, a mesma chave devolveria a cobrança cheia. */
export function squadIdempotencySuffix(cents: number): string {
  return cents > 0 ? `-sq${cents}` : "";
}

/**
 * Depois que a cobrança existe: espelho no doc do servidor (reserva: `arenaBookingPricing`;
 * clubinho: o participante, que nenhum cliente grava) e o registro por `paymentId`. Melhor esforço —
 * o atleta precisa do QR mesmo se isto falhar; o webhook acha o desconto por qualquer um dos dois.
 */
export async function recordArenaSquadDiscountQuietly(
  db: Firestore,
  input: {
    kind: ArenaDiscountKind;
    sourceId: string;
    paymentId: string;
    payerUid: string;
    discount: ArenaSquadDiscount | null;
    /** `null` quando quem chama já gravou o espelho junto com o resto do doc. */
    mirrorRef: DocumentReference | null;
  },
  now: Date,
): Promise<void> {
  const cents = input.discount?.cents ?? 0;
  try {
    if (input.mirrorRef) {
      await input.mirrorRef.set(squadDiscountMirror(cents, input.paymentId), {merge: true});
    }
    if (cents > 0 && input.discount) {
      await recordChargeDiscount(db, {
        paymentId: input.paymentId,
        payerUid: input.payerUid,
        ambassadorId: input.discount.attribution.ambassador.uid,
        cents,
        pct: input.discount.pct,
        kind: input.kind,
        sourceId: input.sourceId,
      }, now);
    }
  } catch (e) {
    logger.error(`Squad: desconto da cobrança não registrado (${input.kind})`, {
      sourceId: input.sourceId,
      paymentId: input.paymentId,
      e,
    });
  }
}

/** Campos do espelho do desconto no doc do servidor (zera quando a cobrança nova não tem). */
export function squadDiscountMirror(cents: number, paymentId: string): Record<string, unknown> {
  return {squadDiscountCents: cents, squadDiscountPaymentId: cents > 0 ? paymentId : null};
}

/**
 * Desconto do seguidor que esta cobrança teve, para o webhook somar ao bruto: o registro por
 * `paymentId`, senão o espelho do doc do servidor — só se o espelho for DESTA cobrança (um PIX
 * regenerado reescreve o espelho). Falha de leitura vira 0 com log: a confirmação nunca cai.
 */
export async function arenaSquadDiscountCents(
  db: Firestore,
  paymentId: string,
  mirror: Record<string, unknown> | undefined,
  context: string,
): Promise<number> {
  try {
    const recorded = await chargeDiscountCents(db, paymentId);
    if (recorded > 0) return recorded;
  } catch (e) {
    logger.error(`Squad: desconto ilegível em ${context} (${paymentId})`, e);
  }
  const cents = mirror?.["squadDiscountCents"];
  return mirror?.["squadDiscountPaymentId"] === paymentId && typeof cents === "number" &&
    Number.isInteger(cents) && cents > 0 ? cents : 0;
}

/** Pagamento confirmado: marca o desconto como usado. Nunca derruba o webhook. */
export async function markArenaSquadDiscountConfirmedQuietly(
  db: Firestore,
  paymentId: string,
  cents: number,
  now: Date,
): Promise<void> {
  if (!(cents > 0)) return;
  try {
    await markChargeDiscountConfirmed(db, paymentId, now);
  } catch (e) {
    logger.error(`Squad: desconto ${paymentId} não marcado como usado`, e);
  }
}
