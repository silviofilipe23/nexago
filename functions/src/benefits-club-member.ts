/**
 * Clube de Vantagens Nexa · o lado do atleta na versão premium (spec v2, itens 3, 7, 8 e 9).
 *
 *   claimBenefit     — devolve o cupom que a pessoa pode usar: o público, o privado
 *                      (`partnerPrivate`, parceiro com requisito) ou o código do atleta (NEXA-XXXX).
 *   getMyBenefits    — "Meus benefícios": usos e salvos, a pergunta "Conseguiu usar?", a economia
 *                      confirmada pelo parceiro e os parceiros com requisito que a pessoa cumpre.
 *   answerBenefitUse — resposta do "Conseguiu usar?".
 *
 * Economia só com resgate confirmado (`benefitRedemptions` com `status: 'matched'` e o uid de quem
 * chama): sem confirmação a tela não mostra valor nenhum. Usar o clube não dá ponto, XP nem nível.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {
  ATHLETE_CALLABLE,
  BENEFIT_EVENTS_COLLECTION,
  BENEFIT_REDEMPTIONS_COLLECTION,
  BENEFITS_CONFIG_PATH,
  EVENT_SOURCES,
  PARTNER_PRIVATE_COLLECTION,
  PARTNERS_COLLECTION,
  PLATFORMS,
  SURFACES,
  USER_BENEFITS_SUBCOLLECTION,
  assertMeetsRequirement,
  athleteBenefitCode,
  benefitCodeLinkUpdate,
  benefitCodeRef,
  isValidId,
  loadVisiblePartner,
  millisOf,
  partnerVisibleTo,
  pick,
  requireCaller,
  userBenefitRef,
  type Caller,
} from "./benefits-club";
import {loadEligibilityFacts, meetsRequirement, parseRequirement} from "./benefits-club-eligibility";

type Raw = Record<string, unknown>;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** "Conseguiu usar?" só depois de 2 h do uso (deu tempo de usar) e até 7 dias (ainda lembra). */
export const PENDING_QUESTION_MIN_MS = 2 * HOUR_MS;
export const PENDING_QUESTION_MAX_MS = 7 * DAY_MS;

function couponOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// ── claimBenefit ───────────────────────────────────────────────────────────

export interface ClaimInput {
  partnerId?: unknown;
  source?: unknown;
  surface?: unknown;
  platform?: unknown;
}

/**
 * Confere visibilidade e requisito e devolve o cupom. Código por atleta fica ligado ao uid em
 * `benefitCodes` (é o que o import usa para atribuir o resgate). `source`/`surface`/`platform` são
 * aceitos pelo contrato; o funil continua vindo do `trackBenefitEvent`.
 */
export async function claimBenefitCore(
  db: Firestore,
  caller: Caller,
  input: ClaimInput,
  now: Date,
): Promise<{coupon: string | null}> {
  if (!isValidId(input.partnerId)) throw new HttpsError("invalid-argument", "Parceiro inválido.");
  const partnerId = input.partnerId;
  const {partner} = await loadVisiblePartner(db, caller, partnerId, now);
  await assertMeetsRequirement(db, caller, partner);

  switch (partner["couponMode"]) {
    case "athlete": {
      const ref = benefitCodeRef(db, caller.uid);
      await db.runTransaction(async (tx) => {
        const update = benefitCodeLinkUpdate((await tx.get(ref)).data(), caller.uid, now);
        if (update) tx.set(ref, update, {merge: true});
      });
      return {coupon: athleteBenefitCode(caller.uid)};
    }
    case "fixed": {
      const requirement = parseRequirement(partner["requirement"]);
      if (requirement?.type === "none") return {coupon: couponOrNull(partner["couponCode"])};
      const priv = (await db.doc(`${PARTNER_PRIVATE_COLLECTION}/${partnerId}`).get()).data();
      return {coupon: couponOrNull(priv?.["couponCode"])};
    }
    default:
      return {coupon: null};
  }
}

// ── getMyBenefits ──────────────────────────────────────────────────────────

export interface BenefitUseView {
  partnerId: string;
  useCount: number;
  firstUsedAt: number | null;
  lastUsedAt: number | null;
  lastAnswer: "used" | "not_used" | null;
  saved: boolean;
}

export interface MyBenefitsView {
  uses: BenefitUseView[];
  pendingQuestion: {partnerId: string} | null;
  savings: {
    confirmedCount: number;
    totalDiscountCents: number;
    byPartner: Array<{partnerId: string; count: number; discountCents: number}>;
  };
  eligiblePartnerIds: string[];
}

export function benefitUseView(partnerId: string, d: Raw): BenefitUseView {
  const answer = d["lastAnswer"];
  return {
    partnerId,
    useCount: typeof d["useCount"] === "number" ? d["useCount"] : 0,
    firstUsedAt: millisOf(d["firstUsedAt"]),
    lastUsedAt: millisOf(d["lastUsedAt"]),
    lastAnswer: answer === "used" || answer === "not_used" ? answer : null,
    saved: d["saved"] === true,
  };
}

/** Uso mais recente entre 2 h e 7 dias atrás, ainda sem resposta. */
export function pendingQuestionOf(uses: BenefitUseView[], now: Date): {partnerId: string} | null {
  const nowMs = now.getTime();
  const candidates = uses.filter((u) => {
    if (u.useCount < 1 || u.lastUsedAt == null || u.lastAnswer != null) return false;
    const age = nowMs - u.lastUsedAt;
    return age >= PENDING_QUESTION_MIN_MS && age <= PENDING_QUESTION_MAX_MS;
  });
  candidates.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
  const first = candidates[0];
  return first ? {partnerId: first.partnerId} : null;
}

/** Soma só os resgates `matched` do próprio atleta (o filtro de uid vem da consulta). */
export function savingsOf(redemptions: Raw[], uid: string): MyBenefitsView["savings"] {
  const byPartner = new Map<string, {partnerId: string; count: number; discountCents: number}>();
  let confirmedCount = 0;
  let totalDiscountCents = 0;
  for (const r of redemptions) {
    if (r["status"] !== "matched" || r["uid"] !== uid) continue;
    const cents = typeof r["discountCents"] === "number" && r["discountCents"] >= 0 ? Math.round(r["discountCents"]) : 0;
    const partnerId = typeof r["partnerId"] === "string" ? r["partnerId"] : "";
    confirmedCount += 1;
    totalDiscountCents += cents;
    const entry = byPartner.get(partnerId) ?? {partnerId, count: 0, discountCents: 0};
    byPartner.set(partnerId, {...entry, count: entry.count + 1, discountCents: entry.discountCents + cents});
  }
  return {
    confirmedCount,
    totalDiscountCents,
    byPartner: [...byPartner.values()].sort((a, b) => b.discountCents - a.discountCents || a.partnerId.localeCompare(b.partnerId)),
  };
}

export async function getMyBenefitsCore(db: Firestore, caller: Caller, now: Date): Promise<MyBenefitsView> {
  const [benefitsSnap, redemptionsSnap, partnersSnap, configSnap] = await Promise.all([
    db.collection(`users/${caller.uid}/${USER_BENEFITS_SUBCOLLECTION}`).get(),
    db.collection(BENEFIT_REDEMPTIONS_COLLECTION).where("uid", "==", caller.uid).get(),
    db.collection(PARTNERS_COLLECTION).where("active", "==", true).get(),
    db.doc(BENEFITS_CONFIG_PATH).get(),
  ]);
  const uses = benefitsSnap.docs.map((doc) => benefitUseView(doc.id, doc.data()));

  const config = configSnap.data();
  const locked = partnersSnap.docs
    .filter((doc) => partnerVisibleTo(doc.data(), caller, config, now))
    .map((doc) => ({id: doc.id, req: parseRequirement(doc.data()["requirement"])}))
    .filter((p) => p.req?.type !== "none");
  const facts = locked.length > 0 ? await loadEligibilityFacts(db, caller.uid, locked.map((p) => p.req)) : null;
  const eligiblePartnerIds = facts ? locked.filter((p) => meetsRequirement(p.req, facts)).map((p) => p.id) : [];

  return {
    uses,
    pendingQuestion: pendingQuestionOf(uses, now),
    savings: savingsOf(redemptionsSnap.docs.map((doc) => doc.data()), caller.uid),
    eligiblePartnerIds,
  };
}

// ── answerBenefitUse ───────────────────────────────────────────────────────

export interface AnswerInput {
  partnerId?: unknown;
  used?: unknown;
  source?: unknown;
  surface?: unknown;
  platform?: unknown;
}

export async function answerBenefitUseCore(
  db: Firestore,
  caller: Caller,
  input: AnswerInput,
  now: Date,
): Promise<{ok: true}> {
  if (!isValidId(input.partnerId)) throw new HttpsError("invalid-argument", "Parceiro inválido.");
  if (typeof input.used !== "boolean") throw new HttpsError("invalid-argument", "Resposta inválida.");
  const partnerId = input.partnerId;
  const used = input.used;
  const at = Timestamp.fromDate(now);
  const ref = userBenefitRef(db, caller.uid, partnerId);
  const type = used ? "use_confirmed" : "use_denied";

  await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d || !(typeof d["useCount"] === "number" && d["useCount"] > 0)) {
      throw new HttpsError("failed-precondition", "Você ainda não usou este benefício.");
    }
    tx.update(ref, {lastAnswer: used ? "used" : "not_used", answeredAt: at});
    tx.set(db.doc(`${BENEFIT_EVENTS_COLLECTION}/${type}_${partnerId}_${caller.uid}_${now.getTime()}`), {
      type,
      partnerId,
      uid: caller.uid,
      source: pick(input.source, EVENT_SOURCES, "my_benefits"),
      surface: pick(input.surface, SURFACES, "app"),
      platform: pick(input.platform, PLATFORMS, "unknown"),
      createdAt: at,
    });
  });
  return {ok: true};
}

// ── callables ──────────────────────────────────────────────────────────────

function wrap<T>(label: string, message: string, uid: string, run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    if (error instanceof HttpsError) throw error;
    logger.error(label, {uid, error});
    throw new HttpsError("internal", message);
  });
}

export const claimBenefit = onCall(ATHLETE_CALLABLE, async (request) => {
  const caller = requireCaller(request.auth);
  return wrap("Falha ao resgatar benefício do clube", "Não foi possível resgatar agora. Tente de novo.", caller.uid,
    () => claimBenefitCore(getFirestore(), caller, (request.data ?? {}) as ClaimInput, new Date()));
});

export const getMyBenefits = onCall(ATHLETE_CALLABLE, async (request) => {
  const caller = requireCaller(request.auth);
  return wrap("Falha ao ler os benefícios do atleta", "Não foi possível carregar seus benefícios.", caller.uid,
    () => getMyBenefitsCore(getFirestore(), caller, new Date()));
});

export const answerBenefitUse = onCall(ATHLETE_CALLABLE, async (request) => {
  const caller = requireCaller(request.auth);
  return wrap("Falha ao gravar resposta do clube", "Não foi possível registrar. Tente de novo.", caller.uid,
    () => answerBenefitUseCore(getFirestore(), caller, (request.data ?? {}) as AnswerInput, new Date()));
});
