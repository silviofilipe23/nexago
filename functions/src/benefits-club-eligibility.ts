/**
 * Clube de Vantagens Nexa · benefícios por status (spec v2, item 8): quem pode usar um parceiro com
 * `requirement`. O parceiro aparece para todo mundo (bloqueado para quem não cumpre); o cupom só sai
 * pelo servidor (`claimBenefit`) para quem cumpre.
 *
 *   none        — todo mundo.
 *   squad       — embaixador do NexaSquad com contrato `active` (`squadAmbassadors/{uid}`). Pausado
 *                 não conta, como no benefício do próprio contrato (`resolveOwnPerk`).
 *   tournament  — inscrição paga e fora da fila de espera (`isPaid && !waitlist`, a mesma régua do
 *                 cancelamento de torneio) em um dos `tournamentIds`.
 *   min_level   — o melhor nível do atleta em qualquer esporte (`sportOnboarding.levelsBySport`;
 *                 sem nenhum, o `level` legado) ≥ `minLevel` na escada de 7 degraus.
 */
import type {Firestore} from "firebase-admin/firestore";
import {LEVEL_CODES, levelDisplayLabel, levelRank} from "./category-level-eligibility";
import {artifactsInscriptionsPath} from "./firebase-paths";
import {SQUAD_AMBASSADORS} from "./squad-commissions";

type Raw = Record<string, unknown>;

export const REQUIREMENT_TYPES = ["none", "squad", "tournament", "min_level"] as const;
export const MAX_REQUIREMENT_TOURNAMENTS = 10;

export type BenefitRequirement =
  | {type: "none"}
  | {type: "squad"}
  | {type: "tournament"; tournamentIds: string[]}
  | {type: "min_level"; minLevel: string};

const SQUAD_ACTIVE_STATUS = "active";
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function isObj(v: unknown): v is Raw {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Lê `partner.requirement`. Ausente = `none`. Malformado (só por escrita fora das rules) = `null`:
 * ninguém cumpre, para nunca liberar por engano um cupom que era restrito.
 */
export function parseRequirement(raw: unknown): BenefitRequirement | null {
  if (raw == null) return {type: "none"};
  if (!isObj(raw)) return null;
  switch (raw["type"]) {
    case "none":
      return {type: "none"};
    case "squad":
      return {type: "squad"};
    case "tournament": {
      const ids = raw["tournamentIds"];
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_REQUIREMENT_TOURNAMENTS) return null;
      if (!ids.every((id) => typeof id === "string" && ID_PATTERN.test(id))) return null;
      return {type: "tournament", tournamentIds: [...new Set(ids as string[])]};
    }
    case "min_level": {
      const minLevel = raw["minLevel"];
      if (typeof minLevel !== "string" || !(LEVEL_CODES as readonly string[]).includes(minLevel)) return null;
      return {type: "min_level", minLevel};
    }
    default:
      return null;
  }
}

/** O parceiro exige algo além de estar logado (inclusive requisito malformado). */
export function hasRequirement(partner: Raw): boolean {
  return parseRequirement(partner["requirement"])?.type !== "none";
}

/** O que se sabe do atleta para conferir requisitos. */
export interface EligibilityFacts {
  squadActive: boolean;
  /** Torneios em que o atleta tem inscrição paga e fora da fila de espera. */
  paidTournamentIds: ReadonlySet<string>;
  /** Melhor degrau (0–6) em qualquer esporte; `null` sem nível nenhum. */
  bestLevelRank: number | null;
}

export function meetsRequirement(req: BenefitRequirement | null, facts: EligibilityFacts): boolean {
  if (!req) return false;
  switch (req.type) {
    case "none":
      return true;
    case "squad":
      return facts.squadActive;
    case "tournament":
      return req.tournamentIds.some((id) => facts.paidTournamentIds.has(id));
    case "min_level": {
      const min = levelRank(req.minLevel);
      return min != null && facts.bestLevelRank != null && facts.bestLevelRank >= min;
    }
  }
}

/** Melhor degrau do atleta: maior rank entre os esportes; sem nenhum, o `level` legado. */
export function bestLevelRankOf(user: Raw | undefined): number | null {
  if (!user) return null;
  const onboarding = user["sportOnboarding"];
  const maps = [isObj(onboarding) ? onboarding["levelsBySport"] : undefined, user["levelsBySport"]];
  let best: number | null = null;
  for (const map of maps) {
    if (!isObj(map)) continue;
    for (const value of Object.values(map)) {
      const rank = levelRank(value);
      if (rank != null && (best == null || rank > best)) best = rank;
    }
  }
  return best ?? levelRank(user["level"]);
}

/** Inscrição que vale para o requisito: paga e fora da fila de espera. */
export function isPaidActiveInscription(d: Raw): boolean {
  return d["isPaid"] === true && d["waitlist"] !== true;
}

/** Frase do bloqueio. `requirementLabel` do parceiro vence; senão um padrão por tipo. */
export function requirementDeniedMessage(req: BenefitRequirement | null, label: unknown): string {
  if (typeof label === "string" && label.trim()) return label.trim();
  if (!req) return "Este benefício não está disponível para você.";
  switch (req.type) {
    case "squad":
      return "Exclusivo para embaixadores do Squad.";
    case "tournament":
      return "Exclusivo para inscritos do torneio.";
    case "min_level":
      return `Exclusivo para atletas a partir do nível ${levelDisplayLabel(req.minLevel) ?? req.minLevel}.`;
    default:
      return "Este benefício não está disponível para você.";
  }
}

// ── leitura no Firestore ────────────────────────────────────────────────────

interface FactNeeds {
  squad: boolean;
  tournament: boolean;
  level: boolean;
}

function needsOf(reqs: Array<BenefitRequirement | null>): FactNeeds {
  return {
    squad: reqs.some((r) => r?.type === "squad"),
    tournament: reqs.some((r) => r?.type === "tournament"),
    level: reqs.some((r) => r?.type === "min_level"),
  };
}

/** Lê só o que os requisitos pedem: contrato do Squad, inscrições do atleta e o perfil. */
export async function loadEligibilityFacts(
  db: Firestore,
  uid: string,
  reqs: Array<BenefitRequirement | null>,
): Promise<EligibilityFacts> {
  const needs = needsOf(reqs);
  const [squad, inscriptions, user] = await Promise.all([
    needs.squad ? db.doc(`${SQUAD_AMBASSADORS}/${uid}`).get() : null,
    needs.tournament ?
      db.collection(artifactsInscriptionsPath()).where("participantUids", "array-contains", uid).get() :
      null,
    needs.level ? db.doc(`users/${uid}`).get() : null,
  ]);
  const paid = new Set<string>();
  for (const doc of inscriptions?.docs ?? []) {
    const d = doc.data();
    if (isPaidActiveInscription(d) && typeof d["tournamentId"] === "string") paid.add(d["tournamentId"]);
  }
  return {
    squadActive: squad?.data()?.["status"] === SQUAD_ACTIVE_STATUS,
    paidTournamentIds: paid,
    bestLevelRank: user ? bestLevelRankOf(user.data()) : null,
  };
}

/** A pessoa cumpre o requisito deste parceiro? (sem requisito = sim, sem leitura). */
export async function callerMeetsPartnerRequirement(db: Firestore, uid: string, partner: Raw): Promise<boolean> {
  const req = parseRequirement(partner["requirement"]);
  if (req?.type === "none") return true;
  if (!req) return false;
  return meetsRequirement(req, await loadEligibilityFacts(db, uid, [req]));
}

/**
 * Em lote, para o push do parceiro: o conjunto de uids que cumprem o requisito, ou `null` quando
 * todo mundo cumpre (`none`). `min_level` usa o perfil já lido (`users`), então devolve um
 * filtro por doc em vez de uma lista.
 */
export async function eligibleUidsFor(
  db: Firestore,
  req: BenefitRequirement | null,
): Promise<{uids: ReadonlySet<string> | null; byProfile: ((user: Raw) => boolean) | null}> {
  if (!req) return {uids: new Set(), byProfile: null};
  switch (req.type) {
    case "none":
      return {uids: null, byProfile: null};
    case "squad": {
      const snap = await db.collection(SQUAD_AMBASSADORS).where("status", "==", SQUAD_ACTIVE_STATUS).get();
      return {uids: new Set(snap.docs.map((d) => d.id)), byProfile: null};
    }
    case "tournament": {
      const snap = await db.collection(artifactsInscriptionsPath())
        .where("tournamentId", "in", req.tournamentIds).get();
      const uids = new Set<string>();
      for (const doc of snap.docs) {
        const d = doc.data();
        if (!isPaidActiveInscription(d) || !Array.isArray(d["participantUids"])) continue;
        for (const uid of d["participantUids"]) if (typeof uid === "string" && uid) uids.add(uid);
      }
      return {uids, byProfile: null};
    }
    case "min_level": {
      const min = levelRank(req.minLevel) ?? Number.POSITIVE_INFINITY;
      return {uids: null, byProfile: (user) => (bestLevelRankOf(user) ?? -1) >= min};
    }
  }
}
