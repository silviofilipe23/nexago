/**
 * NexaSquad: "Inscrições" do pacote do nível — benefício do PRÓPRIO embaixador nas inscrições dele.
 *
 *   discount      → X% de desconto na parcela dele. A cobrança segue no Asaas (nunca abaixo do
 *                   mínimo) e o desconto fica em `squadPerkUses/{paymentId}`.
 *   freePerMonth  → N parcelas grátis por mês civil de SP, sem cobrança nenhuma.
 *   freeUnlimited → idem, com o teto mensal oculto (o embaixador não vê o número).
 *
 * Quem banca é a nexaGO, como no desconto do seguidor: o organizador recebe o mesmo líquido de uma
 * parcela paga. O benefício vale só na parcela do embaixador — pagando a dupla/equipe inteira, a
 * parte dos outros é cobrada normalmente — e a gratuidade só pela própria parcela (`share`).
 *
 *   squadPerkUses/{id} — `discount`: id = paymentId (o webhook soma ao bruto da cobrança);
 *                        `free`: id = `free_{registrationId}_{uid}`, conta no mês em que foi usada.
 */
import {HttpsError} from "firebase-functions/v2/https";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {SQUAD_AMBASSADORS, spDateKey} from "./squad-commissions";
import {tournamentFeeRule} from "./squad-fee-cap";
import {athleteFeeReais, splitTournamentFee} from "./tournament-fees";
import {creditTournamentWalletFromRegistration} from "./tournament-wallet";
import {SQUAD_TIERS, tierRegistrationsPerk, type SquadTier} from "./squad-rules";
import {registrationHoldClearedFields} from "./tournament-registration-hold-ops";
import {
  resolveTournamentRegistrationCredit,
  sharePaidUidsFromRegistration,
} from "./tournament-registration-pix-helpers";

export const SQUAD_PERK_USES = "squadPerkUses";

/** Mínimo de cobrança do Asaas (o mesmo de `squad-commission-lifecycle.ts`). */
const MIN_CHARGE_CENTS = 5_00;

export type OwnPerk =
  | {type: "discount"; pct: number}
  /** `limit` é interno no `freeUnlimited`: nunca vai para o cliente. */
  | {type: "free"; limit: number; used: number; hiddenLimit: boolean};

/** "2026-10": o mês civil de SP em que a gratuidade conta. */
export function perkMonthKey(now: Date): string {
  return spDateKey(now).slice(0, 7);
}

function isTier(v: unknown): v is SquadTier {
  return typeof v === "string" && (SQUAD_TIERS as readonly string[]).includes(v);
}

/** Gratuidades já usadas pelo embaixador no mês. */
function freeUsesQuery(db: Firestore, uid: string, now: Date) {
  return db.collection(SQUAD_PERK_USES)
    .where("ambassadorId", "==", uid)
    .where("kind", "==", "free")
    .where("monthKey", "==", perkMonthKey(now));
}

/** Benefício do contrato ativo do atleta (pausado ou sem contrato = nenhum). */
export async function resolveOwnPerk(db: Firestore, uid: string, now: Date): Promise<OwnPerk | null> {
  const d = (await db.collection(SQUAD_AMBASSADORS).doc(uid).get()).data();
  if (!d || d["status"] !== "active" || !isTier(d["tier"])) return null;
  const version = typeof d["rulesVersion"] === "number" ? d["rulesVersion"] : null;
  const r = await tierRegistrationsPerk(db, d["tier"], version);
  if (r.type === "discount") return {type: "discount", pct: r.value};
  const used = (await freeUsesQuery(db, uid, now).get()).size;
  return {type: "free", limit: r.value, used, hiddenLimit: r.type === "freeUnlimited"};
}

export function hasFreeShare(perk: OwnPerk | null): boolean {
  return perk?.type === "free" && perk.used < perk.limit;
}

/** O que o checkout mostra: o % do desconto, ou se ainda há gratuidade no mês (sem o teto oculto). */
export type OwnPerkView =
  | {type: "discount"; pct: number}
  | {type: "free"; available: boolean; remaining: number | null};

export function ownPerkView(perk: OwnPerk | null): OwnPerkView | null {
  if (!perk) return null;
  if (perk.type === "discount") return perk;
  return {
    type: "free",
    available: hasFreeShare(perk),
    remaining: perk.hiddenLimit ? null : Math.max(0, perk.limit - perk.used),
  };
}

/**
 * Centavos do desconto do embaixador numa cobrança: % da parcela dele, sem deixar a cobrança
 * (já com os outros descontos) abaixo do mínimo do Asaas.
 */
export function perkDiscountCents(pct: number, shareCents: number, chargeCents: number, otherDiscountCents: number): number {
  if (!(pct > 0) || !(shareCents > 0)) return 0;
  const raw = Math.round((Math.min(shareCents, chargeCents) * pct) / 100);
  return Math.max(0, Math.min(raw, chargeCents - otherDiscountCents - MIN_CHARGE_CENTS));
}

export async function recordPerkDiscount(
  db: Firestore,
  input: {paymentId: string; uid: string; registrationId: string; tournamentId: string; cents: number; pct: number},
  now: Date,
): Promise<void> {
  await db.collection(SQUAD_PERK_USES).doc(input.paymentId).set({
    kind: "discount",
    ambassadorId: input.uid,
    registrationId: input.registrationId,
    tournamentId: input.tournamentId,
    paymentId: input.paymentId,
    cents: input.cents,
    pct: input.pct,
    monthKey: perkMonthKey(now),
    createdAt: now,
  });
}

/** Desconto do embaixador gravado para esta cobrança (0 sem registro). */
export async function chargePerkCents(db: Firestore, paymentId: string): Promise<number> {
  const d = (await db.collection(SQUAD_PERK_USES).doc(paymentId).get()).data();
  const cents = d?.["kind"] === "discount" ? d["cents"] : 0;
  return typeof cents === "number" && Number.isInteger(cents) && cents > 0 ? cents : 0;
}

export interface FreeShareClaim {
  useRef: DocumentReference;
  shareReais: number;
  newPaidAmount: number;
  isPaid: boolean;
  wasPaidBefore: boolean;
}

/**
 * Confirma a parcela do embaixador sem cobrança, numa transação: confere de novo que a parcela não
 * foi paga e que ainda há gratuidade no mês, grava o uso e credita a parcela na inscrição.
 */
export async function claimFreeShare(
  db: Firestore,
  input: {
    uid: string;
    registrationRef: DocumentReference;
    tournamentId: string;
    entryFee: number;
    /** Parcela calculada no checkout (equipe: cota dinâmica; dupla/individual: a fixa). */
    shareReais: number;
    isTeamRegistration: boolean;
    waitlist: boolean;
  },
  now: Date,
): Promise<FreeShareClaim> {
  const registrationId = input.registrationRef.id;
  const useRef = db.collection(SQUAD_PERK_USES).doc(`free_${registrationId}_${input.uid}`);
  return db.runTransaction(async (tx) => {
    const reg = (await tx.get(input.registrationRef)).data();
    if (!reg) throw new HttpsError("not-found", "Inscrição não encontrada");
    const sharePaidUids = sharePaidUidsFromRegistration(reg);
    if (reg["isPaid"] === true || sharePaidUids.includes(input.uid)) {
      throw new HttpsError("failed-precondition", "Sua parcela já foi paga.");
    }
    const contract = (await tx.get(db.collection(SQUAD_AMBASSADORS).doc(input.uid))).data();
    if (!contract || contract["status"] !== "active" || !isTier(contract["tier"])) {
      throw new HttpsError("failed-precondition", "Você não tem inscrição grátis do NexaSquad.");
    }
    const version = typeof contract["rulesVersion"] === "number" ? contract["rulesVersion"] : null;
    const r = await tierRegistrationsPerk(db, contract["tier"], version);
    const used = r.type === "discount" ? 0 : (await tx.get(freeUsesQuery(db, input.uid, now))).size;
    if (r.type === "discount" || used >= r.value) {
      throw new HttpsError("failed-precondition", "Suas inscrições grátis deste mês já foram usadas.");
    }

    const credit = resolveTournamentRegistrationCredit({
      entryFee: input.entryFee,
      amountType: "share",
      currentPaidAmount: Number(reg["paidAmount"]) || 0,
      ...(input.isTeamRegistration ? {shareCreditReais: input.shareReais} : {}),
    });
    tx.create(useRef, {
      kind: "free",
      ambassadorId: input.uid,
      registrationId,
      tournamentId: input.tournamentId,
      cents: Math.round(credit.credit * 100),
      monthKey: perkMonthKey(now),
      createdAt: now,
    });
    tx.update(input.registrationRef, {
      paidAmount: credit.newPaidAmount,
      isPaid: credit.isPaid,
      sharePaidUids: [...sharePaidUids, input.uid],
      ...(input.waitlist ? {waitlist: true} : {}),
      // Parcela quitada: a vaga deixa de ter prazo de garantia, como no pagamento.
      ...registrationHoldClearedFields(),
      updatedAt: now,
    });
    return {
      useRef,
      shareReais: credit.credit,
      newPaidAmount: credit.newPaidAmount,
      isPaid: credit.isPaid,
      wasPaidBefore: false,
    };
  });
}

/**
 * Caixa do torneio pela parcela grátis: o organizador recebe o líquido de uma parcela paga (preço −
 * a parte dele na taxa); a nexaGO banca. Idempotente pelo uso (`walletCreditedAt` nele). Torneio
 * sem organizador não tem caixa: nada a creditar.
 */
export async function creditFreeShare(
  db: Firestore,
  input: {
    tournamentId: string;
    tournament: Record<string, unknown> | null | undefined;
    registrationId: string;
    payerUid: string;
    claim: Pick<FreeShareClaim, "useRef" | "shareReais">;
  },
): Promise<boolean> {
  const ownerId = typeof input.tournament?.["managerId"] === "string" ? input.tournament["managerId"].trim() : "";
  const rule = ownerId ? await tournamentFeeRule(db, input.tournamentId, input.tournament) : null;
  if (!ownerId || !rule) return false;
  const share = input.claim.shareReais;
  const fee = splitTournamentFee(share, rule, athleteFeeReais(share, rule));
  return creditTournamentWalletFromRegistration(db, input.tournamentId, {
    ownerId,
    registrationId: input.registrationId,
    payerUid: input.payerUid,
    paymentId: input.claim.useRef.id,
    grossReais: share,
    platformFeeReais: fee.organizerFeeReais,
    gatewayFeeReais: 0,
    squadDiscountReais: share,
    processedRef: input.claim.useRef,
  });
}
