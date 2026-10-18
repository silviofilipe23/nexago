/**
 * NexaSquad: ações no contrato do embaixador (backoffice › Squad › Embaixadores, tela 02).
 *
 *   squadAmbassadors/{uid} — o contrato (o mesmo doc que a atribuição e as comissões leem).
 *     · Mudar nível: grava um aditivo em `amendments` com o pacote da versão vigente. Até o
 *       atleta aceitar no app (`acceptSquadAmendment`), segue no nível anterior.
 *     · Pausar: `status: paused` — a atribuição só enxerga `active`, então o código para de dar
 *       desconto e de gerar comissão; as já liberadas seguem no repasse. `pausedUntil` retoma sozinho.
 *     · Encerrar: data efetiva hoje = `ended` na hora; data futura = `endsAt`, e a varredura encerra
 *       no dia. Comissões `pending` seguem o ciclo delas e entram no último repasse.
 *
 * A varredura de hora em hora (`sweepSquadProgram`) também cuida dos convites (lembretes D+1/D+3,
 * expiração D+7 e convites agendados para o próximo ciclo).
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {
  assertSquadEditor,
  loadCurrentRules,
  notifySquad,
  spDateKey,
  sweepInvitesCore,
  type Notify,
} from "./squad-applications";
import {SQUAD_AMBASSADORS} from "./squad-commissions";
import {SQUAD_TIERS, TIER_LABELS, commissionFloor, type Actor, type SquadTier} from "./squad-rules";

export const END_REASONS = [
  "low_conversion",
  "low_participation",
  "conduct",
  "brand_misuse",
  "athlete_request",
  "cycle_end",
] as const;
export type EndReason = (typeof END_REASONS)[number];

const REASON_MAX = 280;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;

export type ContractAction =
  | {action: "changeTier"; tier: SquadTier; reason: string; commissionPct?: number | null}
  | {action: "pause"; reason: string; until?: string | null}
  | {action: "resume"}
  | {action: "end"; reason: EndReason; note?: string | null; effectiveDate: string};

export interface Amendment {
  at: Date;
  fromTier: SquadTier;
  toTier: SquadTier;
  reason: string;
  by: Actor;
  rulesVersion: number;
  commissionPct: number;
  followerDiscountPct: number;
  acceptedAt: Date | null;
  canceledAt: Date | null;
}

function isTier(v: unknown): v is SquadTier {
  return typeof v === "string" && (SQUAD_TIERS as readonly string[]).includes(v);
}

function invalid(fields: string[], message = "Dados inválidos."): HttpsError {
  return new HttpsError("invalid-argument", message, {fields});
}

function reasonOf(v: unknown, field = "reason"): string {
  if (typeof v !== "string" || v.trim().length < 3 || v.trim().length > REASON_MAX) {
    throw invalid([field], "Escreva o motivo (3 a 280 caracteres).");
  }
  return v.trim();
}

function amendmentsOf(d: Raw): Raw[] {
  return Array.isArray(d["amendments"]) ? (d["amendments"] as Raw[]) : [];
}

/** O aditivo esperando o aceite do atleta (no máximo um). */
export function pendingAmendment(d: Raw): Raw | null {
  return amendmentsOf(d).find((a) => !a["acceptedAt"] && !a["canceledAt"]) ?? null;
}

export async function updateContractCore(
  db: Firestore,
  input: {uid: string} & ContractAction,
  actor: Actor,
  now: Date,
  notify: Notify,
): Promise<{status: string}> {
  if (!input || typeof input.uid !== "string" || !input.uid) throw invalid(["uid"], "Contrato inválido.");
  const todayKey = spDateKey(now);
  const ref = db.collection(SQUAD_AMBASSADORS).doc(input.uid);
  const current = input.action === "changeTier" ? await loadCurrentRules(db) : null;
  let push: {title: string; body: string} | null = null;

  const status = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Contrato não encontrado.");
    const d = snap.data()!;
    const state = String(d["status"] ?? "");
    if (state === "ended") throw new HttpsError("failed-precondition", "Este contrato já foi encerrado.");

    switch (input.action) {
    case "changeTier": {
      if (!isTier(input.tier)) throw invalid(["tier"]);
      const reason = reasonOf(input.reason);
      const fromTier = isTier(d["tier"]) ? d["tier"] : "ath";
      if (fromTier === input.tier) throw invalid(["tier"], "O embaixador já está neste nível.");
      const {rules, version} = current!;
      const pkg = rules.tiers[input.tier];
      let commissionPct = commissionFloor(pkg.commissionPct);
      if (input.tier === "pro" && Array.isArray(pkg.commissionPct)) {
        const pct = input.commissionPct ?? commissionPct;
        if (typeof pct !== "number" || pct < pkg.commissionPct[0] || pct > pkg.commissionPct[1]) {
          throw invalid(["commissionPct"], `Comissão do Pro entre ${pkg.commissionPct[0]}% e ${pkg.commissionPct[1]}%.`);
        }
        commissionPct = pct;
      }
      // Um aditivo novo substitui o que ainda não foi aceito.
      const amendments = amendmentsOf(d).map((a) => (!a["acceptedAt"] && !a["canceledAt"] ? {...a, canceledAt: now} : a));
      const amendment: Amendment = {
        at: now, fromTier, toTier: input.tier, reason, by: actor, rulesVersion: version,
        commissionPct, followerDiscountPct: pkg.followerDiscountPct, acceptedAt: null, canceledAt: null,
      };
      tx.update(ref, {amendments: [...amendments, amendment], updatedAt: now});
      push = {
        title: "Aditivo do seu contrato NexaSquad",
        body: `Você foi convidado para o nível ${TIER_LABELS[input.tier]}. Abra o app para aceitar.`,
      };
      return state;
    }
    case "pause": {
      if (state !== "active") throw new HttpsError("failed-precondition", "Só contrato ativo pode ser pausado.");
      const reason = reasonOf(input.reason);
      const until = input.until || null;
      if (until !== null && (!DATE_RE.test(until) || until <= todayKey)) {
        throw invalid(["until"], "A data de retorno precisa ser depois de hoje.");
      }
      tx.update(ref, {status: "paused", pausedAt: now, pauseReason: reason, pausedUntil: until, pausedBy: actor, updatedAt: now});
      return "paused";
    }
    case "resume": {
      if (state !== "paused") throw new HttpsError("failed-precondition", "Este contrato não está pausado.");
      tx.update(ref, {status: "active", pausedAt: null, pauseReason: null, pausedUntil: null, resumedAt: now, updatedAt: now});
      return "active";
    }
    case "end": {
      if (!(END_REASONS as readonly string[]).includes(input.reason)) throw invalid(["reason"], "Escolha o motivo.");
      const note = input.note == null || input.note === "" ? null : reasonOf(input.note, "note");
      const date = input.effectiveDate;
      if (typeof date !== "string" || !DATE_RE.test(date) || date < todayKey) {
        throw invalid(["effectiveDate"], "A data efetiva não pode ser no passado.");
      }
      if (date === todayKey) {
        tx.update(ref, {
          status: "ended", endedAt: now, endsAt: null, endReason: input.reason, endNote: note, endedBy: actor, updatedAt: now,
        });
        return "ended";
      }
      tx.update(ref, {endsAt: date, endReason: input.reason, endNote: note, endedBy: actor, updatedAt: now});
      return state;
    }
    default:
      throw invalid(["action"]);
    }
  });

  const p = push as {title: string; body: string} | null;
  if (p) {
    await notify(input.uid, p.title, p.body, {kind: "amendment"})
      .catch((err) => logger.warn("squad: push do aditivo falhou", {uid: input.uid, err: String(err)}));
  }
  return {status};
}

/** O atleta aceitou o aditivo no app: o nível e o pacote da versão do aditivo passam a valer. */
export async function acceptAmendmentCore(db: Firestore, input: {uid: string}, now: Date): Promise<{tier: SquadTier}> {
  const ref = db.collection(SQUAD_AMBASSADORS).doc(input.uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!snap.exists || !d || d["status"] === "ended") throw new HttpsError("not-found", "Contrato não encontrado.");
    const pending = pendingAmendment(d);
    if (!pending || !isTier(pending["toTier"])) throw new HttpsError("failed-precondition", "Não há aditivo para aceitar.");
    const tier = pending["toTier"];
    tx.update(ref, {
      tier,
      commissionPct: pending["commissionPct"],
      followerDiscountPct: pending["followerDiscountPct"],
      rulesVersion: pending["rulesVersion"],
      amendments: amendmentsOf(d).map((a) => (a === pending ? {...a, acceptedAt: now} : a)),
      updatedAt: now,
    });
    return {tier};
  });
}

/** Encerra os contratos com data efetiva vencida e retoma as pausas com retorno marcado. */
export async function sweepContractsCore(db: Firestore, now: Date): Promise<{ended: number; resumed: number}> {
  const todayKey = spDateKey(now);
  const [active, paused] = await Promise.all([
    db.collection(SQUAD_AMBASSADORS).where("status", "==", "active").get(),
    db.collection(SQUAD_AMBASSADORS).where("status", "==", "paused").get(),
  ]);
  const out = {ended: 0, resumed: 0};
  for (const doc of [...active.docs, ...paused.docs]) {
    const d = doc.data();
    const endsAt = typeof d["endsAt"] === "string" ? d["endsAt"] : null;
    if (endsAt && endsAt <= todayKey) {
      await doc.ref.update({status: "ended", endedAt: now, endsAt: null, updatedAt: now});
      out.ended++;
      continue;
    }
    const until = typeof d["pausedUntil"] === "string" ? d["pausedUntil"] : null;
    if (d["status"] === "paused" && until && until <= todayKey) {
      await doc.ref.update({status: "active", pausedAt: null, pauseReason: null, pausedUntil: null, resumedAt: now, updatedAt: now});
      out.resumed++;
    }
  }
  return out;
}

// ── callables e agendada ────────────────────────────────────────────────────

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};
const NOTIFY_SECRETS = [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT];

export const updateSquadContract = onCall({...BACKOFFICE_CALLABLE, secrets: NOTIFY_SECRETS}, async (request) => {
  const actor = await assertSquadEditor(request.auth?.uid);
  return updateContractCore(
    getFirestore(), (request.data ?? {}) as Parameters<typeof updateContractCore>[1], actor, new Date(), notifySquad,
  );
});

export const acceptSquadAmendment = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return acceptAmendmentCore(getFirestore(), {uid}, new Date());
});

export const sweepSquadProgram = onSchedule(
  {schedule: "every 60 minutes", timeZone: "America/Sao_Paulo", secrets: NOTIFY_SECRETS},
  async () => {
    const db = getFirestore();
    const now = new Date();
    const contracts = await sweepContractsCore(db, now);
    const invites = await sweepInvitesCore(db, now, notifySquad);
    logger.info("sweepSquadProgram: ciclo concluído", {...contracts, ...invites});
  },
);
