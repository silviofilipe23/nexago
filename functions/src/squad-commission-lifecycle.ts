/**
 * NexaSquad: ciclo de vida da comissão, ligado à cobrança da inscrição no Asaas.
 *
 *   cobrança criada com atribuição ──► pending   (recordCommissionForCharge, nas callables de cobrança)
 *   pagamento confirmado ────────────► released  (webhook: applySquadPaymentEvent "confirmed")
 *   pagamento vencido/recusado ──────► canceled  (payment_failed; também o pagador duplicado)
 *   reembolso / chargeback ──────────► canceled  (se já paga: ajuste negativo no próximo repasse)
 *   reembolso parcial ───────────────► recalcula proporcional (paga: ajuste pela diferença)
 *   inscrição removida ──────────────► canceled  (gatilho de exclusão)
 *
 * Uma comissão por inscrição × PAGADOR: em dupla cada atleta paga a própria cota, com cobrança
 * própria, e cada pagador é um atleta convertido. Quem paga a dupla/equipe inteira gera uma só,
 * sobre o total, com todos os atletas em `convertedAthleteIds`. Uma conversão por atleta: o pagador
 * que já gerou comissão válida não gera outra.
 *
 * O webhook chega repetido: cada transição guarda `paymentId:evento` em `processedEvents` e a
 * reentrega vira no-op. Para quem chama é sempre melhor esforço — comissão nunca derruba
 * inscrição nem pagamento (`...Quietly`).
 */
import * as logger from "firebase-functions/logger";
import {onDocumentDeleted} from "firebase-functions/v2/firestore";
import {getFirestore, type DocumentSnapshot, type Firestore, type Transaction} from "firebase-admin/firestore";
import type {ResolvedAttribution} from "./squad-attribution";
import {SQUAD_ADJUSTMENTS, SQUAD_COMMISSIONS} from "./squad-commissions";
import {loadAttributionRules, tierFollowerDiscountPct} from "./squad-rules";

export type PaymentEvent = "confirmed" | "failed" | "refunded" | "chargeback";

const LIVE_STATUSES = ["pending", "released", "paid"];

/** Desconto do seguidor de cada cobrança, por `paymentId`. Só servidor lê e grava. */
export const SQUAD_CHARGE_DISCOUNTS = "squadChargeDiscounts";

/** O Asaas não cobra PIX abaixo disto: o desconto nunca deixa a cobrança menor. */
const MIN_CHARGE_CENTS = 5_00;

/** O pagador já tem conversão viva (pendente, liberada ou paga) em OUTRA cobrança? */
async function payerAlreadyConverted(db: Firestore, payerUid: string, exceptId: string): Promise<boolean> {
  const previous = await db.collection(SQUAD_COMMISSIONS).where("payerUid", "==", payerUid).get();
  return previous.docs.some((d) => d.id !== exceptId && LIVE_STATUSES.includes(String(d.data()["status"])));
}

/**
 * Desconto que o código dá ao seguidor nesta cobrança, em centavos do preço. Sai da taxa da
 * nexaGO: o organizador é creditado sobre o preço cheio (o webhook soma o desconto ao bruto).
 * Com "só na primeira inscrição" ligado, quem já converteu não ganha de novo.
 */
export async function followerDiscountFor(
  db: Firestore,
  input: {attribution: ResolvedAttribution; payerUid: string; registrationId: string; priceCents: number},
): Promise<{cents: number; pct: number}> {
  const rules = await loadAttributionRules(db);
  const id = squadCommissionId(input.registrationId, input.payerUid);
  if (rules.followerDiscountFirstOnly && await payerAlreadyConverted(db, input.payerUid, id)) {
    return {cents: 0, pct: 0};
  }
  const {ambassador} = input.attribution;
  const pct = ambassador.followerDiscountPct ??
    await tierFollowerDiscountPct(db, ambassador.tier, ambassador.rulesVersion);
  const raw = Math.round((input.priceCents * pct) / 100);
  const cents = Math.max(0, Math.min(raw, input.priceCents - MIN_CHARGE_CENTS));
  return {cents, pct: cents > 0 ? pct : 0};
}

export async function recordChargeDiscount(
  db: Firestore,
  input: {paymentId: string; registrationId: string; payerUid: string; ambassadorId: string; cents: number; pct: number},
  now: Date,
): Promise<void> {
  await db.collection(SQUAD_CHARGE_DISCOUNTS).doc(input.paymentId).set({...input, createdAt: now});
}

/** Quanto desta cobrança foi desconto do seguidor (0 sem registro). */
export async function chargeDiscountCents(db: Firestore, paymentId: string): Promise<number> {
  const d = (await db.collection(SQUAD_CHARGE_DISCOUNTS).doc(paymentId).get()).data();
  const cents = d?.["cents"];
  return typeof cents === "number" && Number.isInteger(cents) && cents > 0 ? cents : 0;
}

export function squadCommissionId(registrationId: string, payerUid: string): string {
  return `${registrationId}_${payerUid}`;
}

export function commissionAmount(netCents: number, pct: number): number {
  return Math.round((netCents * pct) / 100);
}

/** "Lucas Martins" → "Lucas M." (como a coluna "Atleta convertido" da tela 05). */
export function shortAthleteName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Atleta";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** "Equipe CFC (4 atl.)", "Lucas M. + 1 atl." (pagou a dupla) ou "Lucas M.". */
export function convertedLabelOf(payerName: string, convertedCount: number, teamName: string | null): string {
  const name = shortAthleteName(payerName);
  if (convertedCount > 1 && teamName?.trim()) return `Equipe ${teamName.trim()} (${convertedCount} atl.)`;
  if (convertedCount > 1) return `${name} + ${convertedCount - 1} atl.`;
  return name;
}

export interface PendingCommissionInput {
  registrationId: string;
  tournamentId: string;
  tournamentName: string;
  categoryName: string;
  paymentId: string | null;
  payerUid: string;
  convertedUids: string[];
  convertedLabel: string;
  /** Dinheiro cobrado no Asaas (já sem o cashback usado). */
  grossCents: number;
  attribution: ResolvedAttribution;
}

/**
 * Cria (ou acompanha a cobrança nova, se ainda pendente) a comissão desta cobrança. Devolve o id,
 * ou `null` quando o pagador já converteu antes ou o valor é zero.
 */
export async function createPendingCommission(
  db: Firestore,
  input: PendingCommissionInput,
  now: Date,
): Promise<string | null> {
  if (!(input.grossCents > 0)) return null;
  const {ambassador, origin} = input.attribution;
  const id = squadCommissionId(input.registrationId, input.payerUid);
  const ref = db.collection(SQUAD_COMMISSIONS).doc(id);

  if (await payerAlreadyConverted(db, input.payerUid, id)) return null;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const d = snap.data()!;
      // Checkout refeito (cobrança nova da mesma cota): acompanha o pagamento novo. O embaixador
      // não muda — a conversão é de quem levou o atleta até ali na primeira vez.
      if (d["status"] === "pending") {
        tx.update(ref, {
          paymentId: input.paymentId,
          grossCents: input.grossCents,
          netCents: input.grossCents,
          amountCents: commissionAmount(input.grossCents, Number(d["pct"] ?? ambassador.commissionPct)),
        });
      }
      return id;
    }
    tx.set(ref, {
      ambassadorId: ambassador.uid,
      ambassadorName: ambassador.displayName,
      ambassadorCode: ambassador.code,
      ambassadorTier: ambassador.tier,
      registrationId: input.registrationId,
      tournamentId: input.tournamentId,
      tournamentName: input.tournamentName,
      categoryName: input.categoryName,
      paymentId: input.paymentId,
      payerUid: input.payerUid,
      convertedAthleteIds: input.convertedUids.length > 0 ? input.convertedUids : [input.payerUid],
      convertedLabel: input.convertedLabel,
      origin,
      // A taxa do Asaas só se conhece na confirmação; até lá a receita líquida é o valor cobrado.
      grossCents: input.grossCents,
      feeCents: 0,
      netCents: input.grossCents,
      pct: ambassador.commissionPct,
      amountCents: commissionAmount(input.grossCents, ambassador.commissionPct),
      rulesVersion: ambassador.rulesVersion,
      status: "pending",
      cancelReason: null,
      cancelNote: null,
      payoutId: null,
      hold: null,
      processedEvents: [],
      timeline: [{
        at: now,
        event: "registered",
        by: null,
        note: `Inscrição com ${origin === "code" ? "código" : origin === "qr" ? "QR" : "link"} ${ambassador.code}`,
      }],
      registeredAt: now,
      createdAt: now,
      releasedAt: null,
      paidAt: null,
      canceledAt: null,
    });
    return id;
  });
}

export interface ChargeCommissionInput extends Omit<PendingCommissionInput, "convertedLabel"> {
  teamName: string | null;
}

/** Ponto de entrada das callables de cobrança: monta o rótulo do atleta e cria a pendente. */
export async function recordCommissionForCharge(
  db: Firestore,
  input: ChargeCommissionInput,
  now: Date,
): Promise<string | null> {
  const user = (await db.collection("users").doc(input.payerUid).get()).data() ?? {};
  const name = [user["fullName"], user["name"], user["displayName"]].find((v) => typeof v === "string" && v.trim());
  const {teamName, ...rest} = input;
  return createPendingCommission(
    db,
    {...rest, convertedLabel: convertedLabelOf(String(name ?? "Atleta"), input.convertedUids.length, teamName)},
    now,
  );
}

export interface PaymentEventInput {
  registrationId: string;
  payerUid: string;
  paymentId: string;
  event: PaymentEvent;
  /** Valor cobrado (`value` do Asaas), em centavos. */
  valueCents?: number | null;
  /** Valor líquido depois da taxa do Asaas (`netValue`), em centavos. */
  netValueCents?: number | null;
  /** Quanto foi estornado; ausente = estorno total. */
  refundedCents?: number | null;
}

type Raw = Record<string, unknown>;

const timelineOf = (d: Raw) => (Array.isArray(d["timeline"]) ? (d["timeline"] as unknown[]) : []);
const processedOf = (d: Raw) => (Array.isArray(d["processedEvents"]) ? (d["processedEvents"] as string[]) : []);

/** Cancela dentro da transação; comissão já paga vira ajuste negativo no próximo repasse. */
function cancelInTx(
  db: Firestore,
  tx: Transaction,
  s: DocumentSnapshot,
  reason: "refund" | "chargeback" | "payment_failed",
  note: string,
  adjustmentKey: string,
  extra: Raw,
  now: Date,
): void {
  const d = s.data()!;
  if (d["status"] === "paid") {
    tx.set(db.collection(SQUAD_ADJUSTMENTS).doc(`${s.id}_${adjustmentKey}`), {
      commissionId: s.id,
      ambassadorId: d["ambassadorId"],
      ambassadorName: d["ambassadorName"] ?? "",
      amountCents: -Number(d["amountCents"] ?? 0),
      reason,
      note,
      payoutId: null,
      createdAt: now,
      createdBy: null,
    });
  }
  tx.update(s.ref, {
    ...extra,
    status: "canceled",
    cancelReason: reason,
    canceledAt: now,
    hold: null,
    timeline: [...timelineOf(d), {at: now, event: "canceled", by: null, note}],
  });
}

/**
 * Aplica um evento de pagamento à comissão daquela cobrança (inscrição × pagador). Devolve se mudou.
 * Evento de cobrança antiga (outro `paymentId`) é ignorado, exceto confirmação, que adota o
 * pagamento que de fato entrou.
 */
export async function applySquadPaymentEvent(db: Firestore, input: PaymentEventInput, now: Date): Promise<boolean> {
  const ref = db.collection(SQUAD_COMMISSIONS).doc(squadCommissionId(input.registrationId, input.payerUid));
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return false;
    const d = s.data()!;
    const key = `${input.paymentId}:${input.event}`;
    const processed = processedOf(d);
    if (processed.includes(key)) return false;
    const tracked = (d["paymentId"] ?? null) as string | null;
    if (input.event !== "confirmed" && tracked !== null && tracked !== input.paymentId) return false;

    const status = String(d["status"]);
    const pct = Number(d["pct"] ?? 0);
    const timeline = timelineOf(d);
    const mark = {processedEvents: [...processed, key]};

    if (input.event === "confirmed") {
      if (status !== "pending") {
        tx.update(ref, mark);
        return false;
      }
      const gross = input.valueCents && input.valueCents > 0 ? input.valueCents : Number(d["grossCents"] ?? 0);
      const net = input.netValueCents && input.netValueCents > 0 ? input.netValueCents : gross;
      tx.update(ref, {
        ...mark,
        status: "released",
        paymentId: input.paymentId,
        grossCents: gross,
        feeCents: Math.max(0, gross - net),
        netCents: net,
        amountCents: commissionAmount(net, pct),
        releasedAt: now,
        timeline: [...timeline, {at: now, event: "released", by: null, note: "Pagamento confirmado"}],
      });
      return true;
    }

    if (input.event === "failed") {
      if (status !== "pending") {
        tx.update(ref, mark);
        return false;
      }
      cancelInTx(db, tx, s, "payment_failed", "Pagamento não concluído", `${input.paymentId}_failed`, mark, now);
      return true;
    }

    // Reembolso ou chargeback.
    if (status === "canceled") {
      tx.update(ref, mark);
      return false;
    }
    const reason = input.event === "chargeback" ? "chargeback" : "refund";
    const value = input.valueCents && input.valueCents > 0 ? input.valueCents : Number(d["grossCents"] ?? 0);
    const refunded = input.refundedCents ?? null;
    if (refunded !== null && refunded > 0 && value > 0 && refunded < value) {
      const amount = Number(d["amountCents"] ?? 0);
      const net = Math.round(Number(d["netCents"] ?? 0) * ((value - refunded) / value));
      const newAmount = commissionAmount(net, pct);
      const note = `Reembolso parcial: comissão de ${amount} para ${newAmount} centavos`;
      if (status === "paid") {
        tx.set(db.collection(SQUAD_ADJUSTMENTS).doc(`${s.id}_${input.paymentId}_partial`), {
          commissionId: s.id,
          ambassadorId: d["ambassadorId"],
          ambassadorName: d["ambassadorName"] ?? "",
          amountCents: newAmount - amount,
          reason,
          note,
          payoutId: null,
          createdAt: now,
          createdBy: null,
        });
        tx.update(ref, {...mark, timeline: [...timeline, {at: now, event: "partial_refund", by: null, note}]});
      } else {
        tx.update(ref, {
          ...mark,
          netCents: net,
          amountCents: newAmount,
          timeline: [...timeline, {at: now, event: "partial_refund", by: null, note}],
        });
      }
      return true;
    }
    cancelInTx(db, tx, s, reason, reason === "chargeback" ? "Chargeback" : "Reembolso", `${input.paymentId}_${reason}`, mark, now);
    return true;
  });
}

/**
 * Evento do Squad para um status negativo do Asaas. Antes de confirmar, qualquer negativo é
 * pagamento não concluído; depois, só estorno e chargeback contam (pedido de estorno ainda não é).
 */
export function squadEventForStatus(status: string, alreadyConfirmed: boolean): PaymentEvent | null {
  if (!alreadyConfirmed) return "failed";
  if (status === "REFUNDED") return "refunded";
  if (status.startsWith("CHARGEBACK") || status === "AWAITING_CHARGEBACK_REVERSAL") return "chargeback";
  return null;
}

/** Para o webhook: comissão que falha vai pro log, nunca para o processamento do pagamento. */
export async function applySquadPaymentEventQuietly(db: Firestore, input: PaymentEventInput, now: Date): Promise<void> {
  try {
    await applySquadPaymentEvent(db, input, now);
  } catch (err) {
    logger.error("Comissão do Squad: evento de pagamento não aplicado", {...input, err});
  }
}

/** Inscrição removida (cancelada, recusada, tirada pelo organizador): nenhuma comissão sobrevive. */
export async function cancelRegistrationCommissions(db: Firestore, registrationId: string, now: Date): Promise<number> {
  const snap = await db.collection(SQUAD_COMMISSIONS).where("registrationId", "==", registrationId).get();
  let changed = 0;
  for (const doc of snap.docs) {
    const did = await db.runTransaction(async (tx) => {
      const s = await tx.get(doc.ref);
      const status = String(s.data()?.["status"] ?? "");
      if (!s.exists || status === "canceled") return false;
      const reason = status === "pending" ? "payment_failed" : "refund";
      cancelInTx(db, tx, s, reason, "Inscrição removida", "registration_removed", {}, now);
      return true;
    });
    if (did) changed++;
  }
  return changed;
}

export const onInscriptionDeletedCancelSquadCommissions = onDocumentDeleted(
  "artifacts/{appId}/public/data/inscriptions/{registrationId}",
  async (event) => {
    try {
      await cancelRegistrationCommissions(getFirestore(), event.params.registrationId, new Date());
    } catch (err) {
      logger.error("Comissão do Squad: inscrição removida sem cancelar a comissão", {
        registrationId: event.params.registrationId,
        err,
      });
    }
  },
);
