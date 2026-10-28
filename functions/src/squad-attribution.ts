/**
 * NexaSquad: atribuição de uma inscrição a um embaixador.
 *
 *   squadAttributions/{uid}   — o último (ou primeiro, conforme o modelo) link/QR de embaixador que o
 *                               atleta abriu: `{ambassadorId, code, origin, at}`. Vale pela janela
 *                               `attribution.windowDays` das regras (tela 06).
 *
 * No checkout, o código digitado **sempre vence** o link. Autoindicação (pagador ou alguém da
 * inscrição é o próprio embaixador) é recusada com mensagem quando o código foi digitado e
 * ignorada em silêncio quando veio de link. Só servidor grava aqui; as rules negam o cliente.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {followerDiscountFor, followerPctOf, payerUsedDiscount} from "./squad-commission-lifecycle";
import {resolveArenaBookingFeePercent} from "./arena-entitlement";
import {CLUB_FEE_PERCENT, FEE_FLOOR_REAIS} from "./platform-fees";
import {feeRuleForRegistration} from "./squad-fee-cap";
import {SQUAD_AMBASSADORS} from "./squad-commissions";
import {SQUAD_PUBLIC} from "./squad-public";
import {loadAttributionRules, type FollowerDiscountScope, type SquadTier} from "./squad-rules";
import {ownPerkView, resolveOwnPerk, type OwnPerkView} from "./squad-own-perk";

export const SQUAD_ATTRIBUTIONS = "squadAttributions";

export type AttributionOrigin = "code" | "link" | "qr";

const CODE_RE = /^[A-Z0-9]{3,20}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SELF_REFERRAL_MESSAGE = "Você não pode usar seu próprio código.";
export const UNKNOWN_CODE_MESSAGE = "Código de embaixador não encontrado.";
/** Contrato pausado no backoffice: o código existe, mas não dá desconto nem gera comissão. */
export const PAUSED_CODE_MESSAGE = "Código indisponível.";

/** Contrato vigente do embaixador, como a comissão precisa dele. */
export interface AmbassadorContract {
  uid: string;
  displayName: string;
  tier: SquadTier | null;
  code: string;
  commissionPct: number;
  /** Desconto do seguidor congelado no contrato; `null` = vem das regras da versão do contrato. */
  followerDiscountPct: number | null;
  rulesVersion: number | null;
}

export interface ResolvedAttribution {
  ambassador: AmbassadorContract;
  origin: AttributionOrigin;
}

/** "joao10 " → "JOAO10"; inválido → null. */
export function normalizeSquadCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const code = v.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

type Raw = Record<string, unknown>;

function contractOf(uid: string, d: Raw | undefined): AmbassadorContract | null {
  if (!d || d["status"] !== "active") return null;
  const pct = d["commissionPct"];
  const code = normalizeSquadCode(d["code"]);
  if (typeof pct !== "number" || !(pct >= 0 && pct <= 30) || !code) return null;
  return {
    uid,
    displayName: String(d["displayName"] ?? ""),
    tier: (d["tier"] as SquadTier | undefined) ?? null,
    code,
    commissionPct: pct,
    followerDiscountPct: typeof d["followerDiscountPct"] === "number" &&
      d["followerDiscountPct"] >= 0 && d["followerDiscountPct"] <= 30 ? d["followerDiscountPct"] : null,
    rulesVersion: typeof d["rulesVersion"] === "number" ? d["rulesVersion"] : null,
  };
}

export async function findAmbassadorByCode(db: Firestore, code: string): Promise<AmbassadorContract | null> {
  const snap = await db.collection(SQUAD_AMBASSADORS).where("code", "==", code).where("status", "==", "active").get();
  const doc = snap.docs[0];
  return doc ? contractOf(doc.id, doc.data()) : null;
}

export async function findAmbassador(db: Firestore, uid: string): Promise<AmbassadorContract | null> {
  const snap = await db.collection(SQUAD_AMBASSADORS).doc(uid).get();
  return snap.exists ? contractOf(uid, snap.data()) : null;
}

function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  return null;
}

/**
 * Clique em link ou QR. Último toque: sempre sobrescreve. Primeiro toque: só sobrescreve quando a
 * atribuição anterior já venceu. Código inválido ou do próprio atleta não grava nada.
 */
export async function recordAttributionCore(
  db: Firestore,
  input: {uid: string; code: unknown; origin: unknown},
  now: Date,
): Promise<{recorded: boolean; ambassadorName: string | null}> {
  const origin = input.origin === "qr" ? "qr" : input.origin === "link" ? "link" : null;
  const code = normalizeSquadCode(input.code);
  if (!origin || !code) {
    throw new HttpsError("invalid-argument", "Link de embaixador inválido.");
  }
  const ambassador = await findAmbassadorByCode(db, code);
  if (!ambassador || ambassador.uid === input.uid) return {recorded: false, ambassadorName: null};

  const rules = await loadAttributionRules(db);
  const ref = db.collection(SQUAD_ATTRIBUTIONS).doc(input.uid);
  const current = await ref.get();
  const at = dateOf(current.data()?.["at"]);
  const stillValid = at !== null && now.getTime() - at.getTime() <= rules.windowDays * DAY_MS;
  if (rules.model === "firstTouch" && stillValid && current.data()?.["ambassadorId"] !== ambassador.uid) {
    return {recorded: false, ambassadorName: ambassador.displayName};
  }
  await ref.set({ambassadorId: ambassador.uid, code: ambassador.code, origin, at: now});
  return {recorded: true, ambassadorName: ambassador.displayName};
}

/**
 * Quem leva a inscrição: o código digitado (erro claro se não existe ou é autoindicação) ou, sem
 * código, a atribuição de link/QR dentro da janela. `null` = inscrição sem embaixador.
 */
export async function resolveRegistrationAttribution(
  db: Firestore,
  input: {payerUid: string; athleteUids: string[]; typedCode: unknown},
  now: Date,
): Promise<ResolvedAttribution | null> {
  const rules = await loadAttributionRules(db);
  const isSelf = (a: AmbassadorContract) =>
    rules.blockSelfReferral && (a.uid === input.payerUid || input.athleteUids.includes(a.uid));

  const typed = typeof input.typedCode === "string" && input.typedCode.trim() !== "" ? input.typedCode : null;
  if (typed !== null) {
    const code = normalizeSquadCode(typed);
    const ambassador = code ? await findAmbassadorByCode(db, code) : null;
    if (!ambassador) {
      const paused = code ?
        !(await db.collection(SQUAD_AMBASSADORS).where("code", "==", code).where("status", "==", "paused").get()).empty :
        false;
      throw new HttpsError("invalid-argument", paused ? PAUSED_CODE_MESSAGE : UNKNOWN_CODE_MESSAGE, {field: "squadCode"});
    }
    if (isSelf(ambassador)) throw new HttpsError("failed-precondition", SELF_REFERRAL_MESSAGE, {field: "squadCode"});
    return {ambassador, origin: "code"};
  }

  const snap = await db.collection(SQUAD_ATTRIBUTIONS).doc(input.payerUid).get();
  const d = snap.data();
  const at = dateOf(d?.["at"]);
  if (!d || !at || now.getTime() - at.getTime() > rules.windowDays * DAY_MS) return null;
  const ambassador = await findAmbassador(db, String(d["ambassadorId"] ?? ""));
  if (!ambassador || isSelf(ambassador)) return null;
  return {ambassador, origin: d["origin"] === "qr" ? "qr" : "link"};
}

const CLIENT_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

/** Portal/app chamam ao abrir um link `?squad=CODIGO` (ou QR) com o atleta logado. */
export const recordSquadAttribution = onCall(CLIENT_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const data = (request.data ?? {}) as {code?: unknown; origin?: unknown};
  return recordAttributionCore(getFirestore(), {uid, code: data.code, origin: data.origin}, new Date());
});

export interface SquadCodeCheck {
  ambassadorName: string | null;
  code: string | null;
  origin: AttributionOrigin | null;
  /** % do desconto do seguidor que vale para este atleta nesta inscrição (0 = sem desconto). */
  discountPct: number;
  /**
   * % da taxa da plataforma nesta cobrança (torneio, reserva da arena ou clubinho): o desconto nunca
   * passa dela (a nexaGO banca o desconto com a própria taxa). `null` = sem esse teto.
   */
  feePercent: number | null;
  /** Piso da taxa em reais (R$ 1,50; o clubinho não tem piso). */
  feeFloorReais: number;
  /**
   * Benefício "Inscrições" do próprio pagador, se ele é embaixador ativo (só na inscrição): % na
   * parcela dele, ou se ainda há parcela grátis no mês. Ausente em backend antigo.
   */
  ownPerk: OwnPerkView | null;
}

/** Que cobrança o checkout vai gerar: inscrição (padrão), reserva de quadra ou clubinho. */
export type SquadCheckPurpose = "registration" | "booking" | "club";

/**
 * Confere o código no checkout antes de pagar ("indicação de João · 10% de desconto"). Sem código,
 * devolve a atribuição por link/QR, se houver — o desconto também vale para ela.
 */
export async function checkSquadCodeCore(
  db: Firestore,
  input: {
    payerUid: string;
    athleteUids: string[];
    code: string;
    registrationId: string;
    feePercent?: number | null;
    purpose?: SquadCheckPurpose;
    feeFloorReais?: number;
  },
  now: Date,
): Promise<SquadCodeCheck> {
  const resolved = await resolveRegistrationAttribution(
    db,
    {payerUid: input.payerUid, athleteUids: input.athleteUids, typedCode: input.code},
    now,
  );
  const feePercent = input.feePercent ?? null;
  const feeFloorReais = input.feeFloorReais ?? FEE_FLOOR_REAIS;
  const purpose = input.purpose ?? "registration";
  let ownPerk: OwnPerkView | null = null;
  if (purpose === "registration") {
    try {
      ownPerk = ownPerkView(await resolveOwnPerk(db, input.payerUid, now));
    } catch (e) {
      logger.warn("checkSquadCode: benefício do embaixador indisponível", e);
    }
  }
  if (!resolved) {
    return {ambassadorName: null, code: null, origin: null, discountPct: 0, feePercent, feeFloorReais, ownPerk};
  }
  let discountPct: number;
  if (purpose === "registration") {
    // Preço de referência só para saber se o desconto vale (primeira inscrição); o checkout aplica o %.
    const discount = await followerDiscountFor(db, {
      attribution: resolved,
      payerUid: input.payerUid,
      registrationId: input.registrationId,
      priceCents: 1_000_00,
    });
    discountPct = discount.pct;
  } else {
    // Reserva e clubinho: "só na primeira" vale por tipo de compra (primeira reserva, primeiro clubinho).
    const rules = await loadAttributionRules(db);
    const off = !rules.followerDiscountScope[purpose] ||
      (rules.followerDiscountFirstOnly && await payerUsedDiscount(db, input.payerUid, purpose));
    discountPct = off ? 0 : await followerPctOf(db, resolved.ambassador);
  }
  return {
    ambassadorName: resolved.ambassador.displayName,
    code: resolved.ambassador.code,
    origin: resolved.origin,
    discountPct,
    feePercent,
    feeFloorReais,
    ownPerk,
  };
}

/** Taxa da cobrança que o checkout vai gerar, para a prévia do teto do desconto. */
async function feeOfPurpose(
  db: Firestore,
  purpose: SquadCheckPurpose,
  ids: {registrationId: string; arenaId: string},
  now: Date,
): Promise<{feePercent: number | null; feeFloorReais: number}> {
  if (purpose === "club") return {feePercent: CLUB_FEE_PERCENT, feeFloorReais: 0};
  if (purpose === "booking") {
    const arena = ids.arenaId ? (await db.collection("arenas").doc(ids.arenaId).get()).data() : undefined;
    return {feePercent: arena ? resolveArenaBookingFeePercent(arena, now.getTime()) : null, feeFloorReais: FEE_FLOOR_REAIS};
  }
  // Inscrição: a regra do torneio (exceção, comissão do organizador ou padrão), com o piso dela.
  const rule = await feeRuleForRegistration(db, ids.registrationId);
  return {feePercent: rule?.percent ?? null, feeFloorReais: rule?.floorReais ?? FEE_FLOOR_REAIS};
}

export const checkSquadCode = onCall(CLIENT_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const data = (request.data ?? {}) as {
    code?: unknown;
    athleteUids?: unknown;
    registrationId?: unknown;
    purpose?: unknown;
    arenaId?: unknown;
  };
  const athleteUids = Array.isArray(data.athleteUids) ?
    data.athleteUids.filter((u): u is string => typeof u === "string").slice(0, 10) :
    [];
  const db = getFirestore();
  const now = new Date();
  const registrationId = typeof data.registrationId === "string" ? data.registrationId : "";
  const purpose: SquadCheckPurpose = data.purpose === "booking" || data.purpose === "club" ? data.purpose : "registration";
  const fee = await feeOfPurpose(db, purpose, {
    registrationId,
    arenaId: typeof data.arenaId === "string" ? data.arenaId : "",
  }, now);
  return checkSquadCodeCore(db, {
    payerUid: uid,
    athleteUids,
    code: typeof data.code === "string" ? data.code : "",
    registrationId,
    purpose,
    ...fee,
  }, now);
});

/** Quem convidou, como o site mostra: do espelho `squadPublic` (privacidade já aplicada). */
export interface SquadReferralAmbassador {
  uid: string;
  name: string;
  photoUrl: string | null;
  tier: SquadTier | null;
  city: string | null;
  state: string | null;
  arenaName: string | null;
}

export interface SquadReferralView {
  ambassador: SquadReferralAmbassador;
  /** Até quanto o seguidor ganha; o teto na taxa corta no checkout. 0 = o nível não dá desconto. */
  discountPct: number;
  firstOnly: boolean;
  scope: FollowerDiscountScope;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * O que o link de um embaixador oferece a quem ainda não tem conta (página `/indicacao` do portal).
 * `null` = código sem contrato vigente (desconhecido, pausado ou encerrado): a página não promete
 * desconto. Só sai o que o espelho público e o próprio embaixador já divulgam (nome e "até X% OFF").
 */
export async function squadReferralCore(db: Firestore, code: unknown): Promise<SquadReferralView | null> {
  const normalized = normalizeSquadCode(code);
  const contract = normalized ? await findAmbassadorByCode(db, normalized) : null;
  if (!contract) return null;
  const [mirror, rules, discountPct] = await Promise.all([
    db.collection(SQUAD_PUBLIC).doc(contract.uid).get(),
    loadAttributionRules(db),
    followerPctOf(db, contract),
  ]);
  const m = mirror.data();
  const name = strOrNull(m?.["name"]) ?? strOrNull(contract.displayName);
  if (!name) return null;
  const photo = strOrNull(m?.["photoUrl"]);
  return {
    ambassador: {
      uid: contract.uid,
      name,
      photoUrl: photo && /^https?:\/\//i.test(photo) ? photo : null,
      tier: contract.tier,
      city: strOrNull(m?.["city"]),
      state: strOrNull(m?.["state"]),
      arenaName: strOrNull(m?.["arenaName"]),
    },
    discountPct,
    firstOnly: rules.followerDiscountFirstOnly,
    scope: rules.followerDiscountScope,
  };
}

/** Aberta sem login: quem abre o link do embaixador ainda não tem conta. */
export const getSquadReferral = onCall(CLIENT_CALLABLE, async (request) => {
  const data = (request.data ?? {}) as {code?: unknown};
  return {referral: await squadReferralCore(getFirestore(), data.code)};
});
