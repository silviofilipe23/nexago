/**
 * NexaSquad: o que só o portal do atleta mostra, ao lado de `getMySquad`/`getSquadRanking`
 * (`squad-athlete.ts`, a visão do embaixador que app e portal dividem).
 *
 *   getSquadPortalInfo — `join`: tela 04 "Entrar no Squad" para quem não tem contrato vivo (perfil,
 *                        status público da candidatura, convite em aberto, vagas e próximo ciclo);
 *                        `member`: o que o painel web soma ao `getMySquad` (cadastros do funil e o
 *                        checklist da próxima promoção).
 *
 * Nada interno sai daqui: notas e motivo interno da candidatura, nível sugerido, Score e ROI ficam
 * no backoffice. O checklist é o texto das regras; quem marca é o time (o atleta vê "avaliado").
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {openInviteFor, type SquadInviteSummary} from "./squad-athlete";
import {
  SQUAD_APPLICATIONS,
  athleteSnapshot,
  dateOf,
  loadCurrentRules,
  loadCycle,
  seatsLeft,
} from "./squad-applications";
import {SQUAD_ATTRIBUTIONS} from "./squad-attribution";
import {SQUAD_AMBASSADORS, SQUAD_COMMISSIONS} from "./squad-commissions";
import {nextCycleStart, type Cycle} from "./squad-program";
import {DEFAULT_SQUAD_RULES, SQUAD_TIERS, type SquadTier} from "./squad-rules";

type Raw = Record<string, unknown>;

const LIVE_CONTRACT = ["active", "paused"];

export type PublicApplicationStatus = "review" | "invited" | "waitlist" | "rejected";

export interface SquadJoinInfo {
  profile: {
    name: string;
    city: string | null;
    state: string | null;
    arenaName: string | null;
    tournaments: number | null;
    elo: string | null;
    photoUrl: string | null;
  } | null;
  application: {status: PublicApplicationStatus; submittedAt: string | null} | null;
  /** Convite enviado/aberto e no prazo: o aceite (código e contrato) é no app. */
  invite: SquadInviteSummary | null;
  /** Contrato que já terminou (ex-embaixador). */
  pastContract: {tier: SquadTier; endedAt: string | null} | null;
  cycle: Cycle;
  seatsLeft: number;
  nextCycleStart: string;
  /** Desconto do seguidor do Ambassador nas regras vigentes ("seu amigo ganha até X%"). */
  followerDiscountPct: number;
}

export interface SquadPortalMemberInfo {
  /** Contas que chegaram pelo link/QR do embaixador (`squadAttributions`). */
  signups: number;
  /** Inscrições com o código no contrato atual (o recorte do `getMySquad`, sem PIX vencido). */
  registrations: number;
  /** Delas, as que ainda aguardam pagamento. */
  pending: number;
  /** Critérios que o time avalia na próxima promoção (sem o ROI, que é interno). */
  promotionChecklist: string[];
}

export interface SquadPortalInfo {
  join: SquadJoinInfo | null;
  member: SquadPortalMemberInfo | null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isTier(v: unknown): v is SquadTier {
  return typeof v === "string" && (SQUAD_TIERS as readonly string[]).includes(v);
}

function iso(v: unknown): string | null {
  return dateOf(v)?.toISOString() ?? null;
}

/** O que a candidatura mostra ao atleta. Nota, motivo interno e nível sugerido nunca saem. */
export function publicApplicationStatus(stage: string, archivedReason: string): PublicApplicationStatus | null {
  if (stage === "new" || stage === "review") return "review";
  if (stage === "invited" || stage === "contract") return "invited";
  if (stage === "archived" && archivedReason === "waitlist") return "waitlist";
  if (stage === "archived" && archivedReason === "rejected") return "rejected";
  // Expirada, cancelada ou aceita: o atleta pode se candidatar de novo.
  return null;
}

async function joinInfo(db: Firestore, uid: string, contract: Raw | undefined, now: Date): Promise<SquadJoinInfo> {
  const [{rules}, cycle, profile, applications, invite] = await Promise.all([
    loadCurrentRules(db),
    loadCycle(db),
    athleteSnapshot(db, uid),
    db.collection(SQUAD_APPLICATIONS).where("athleteId", "==", uid).get(),
    openInviteFor(db, uid, now),
  ]);
  const latest = applications.docs
    .map((s) => s.data() as Raw)
    .sort((a, b) => (dateOf(b["submittedAt"])?.getTime() ?? 0) - (dateOf(a["submittedAt"])?.getTime() ?? 0))[0];
  const status = latest ? publicApplicationStatus(str(latest["stage"]), str(latest["archivedReason"])) : null;
  const ended = contract && str(contract["status"]) === "ended";
  return {
    profile: profile ? {
      name: profile.name,
      city: profile.city,
      state: profile.state,
      arenaName: profile.arenaName,
      tournaments: profile.tournaments,
      elo: profile.elo,
      photoUrl: profile.photoUrl,
    } : null,
    application: latest && status ? {status, submittedAt: iso(latest["submittedAt"])} : null,
    invite,
    pastContract: ended && isTier(contract["tier"]) ?
      {tier: contract["tier"], endedAt: iso(contract["endedAt"]) ?? iso(contract["end"])} : null,
    cycle,
    seatsLeft: await seatsLeft(db, cycle),
    nextCycleStart: nextCycleStart(cycle),
    followerDiscountPct: (rules.tiers?.amb ?? DEFAULT_SQUAD_RULES.tiers.amb).followerDiscountPct,
  };
}

async function memberInfo(db: Firestore, uid: string, contract: Raw): Promise<SquadPortalMemberInfo> {
  const [{rules}, signups, commissions] = await Promise.all([
    loadCurrentRules(db),
    db.collection(SQUAD_ATTRIBUTIONS).where("ambassadorId", "==", uid).select().get(),
    db.collection(SQUAD_COMMISSIONS).where("ambassadorId", "==", uid)
      .select("status", "cancelReason", "registeredAt", "createdAt").get(),
  ]);
  const tier = isTier(contract["tier"]) ? contract["tier"] : "ath";
  const step = (Array.isArray(rules.promotion) ? rules.promotion : []).find((p) => p.from === tier);
  // Mesmo recorte do `getMySquad`: comissões do contrato atual, sem a cancelada por PIX vencido.
  const start = dateOf(contract["start"]) ?? dateOf(contract["createdAt"]);
  const rows = commissions.docs.map((d) => d.data() as Raw).filter((d) => {
    const at = dateOf(d["registeredAt"]) ?? dateOf(d["createdAt"]);
    const inContract = !start || at === null || at.getTime() >= start.getTime();
    return inContract && !(d["status"] === "canceled" && d["cancelReason"] === "payment_failed");
  });
  return {
    signups: signups.size,
    registrations: rows.length,
    pending: rows.filter((d) => d["status"] === "pending").length,
    promotionChecklist: step && Array.isArray(step.checklist) ? step.checklist.filter((c) => typeof c === "string") : [],
  };
}

/** Contrato vivo (ativo/pausado) = `member`; sem contrato ou encerrado = `join`. */
export async function squadPortalInfoCore(db: Firestore, uid: string, now: Date): Promise<SquadPortalInfo> {
  const contract = (await db.collection(SQUAD_AMBASSADORS).doc(uid).get()).data() as Raw | undefined;
  if (contract && LIVE_CONTRACT.includes(str(contract["status"]))) {
    return {join: null, member: await memberInfo(db, uid, contract)};
  }
  return {join: await joinInfo(db, uid, contract, now), member: null};
}

export const getSquadPortalInfo = onCall({region: CLIENT_FACING_REGIONS, invoker: "public"}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return squadPortalInfoCore(getFirestore(), uid, new Date());
});
