/**
 * Clube de Vantagens Nexa (spec `docs/product/vantagens-nexago-spec.md`).
 *
 *   partners/{partnerId}             — vitrine; o app lê direto (rules), o backoffice grava.
 *   appConfig/benefitsClub           — `{enabled, testerUids}`: liga o card do Hub e diz quem testa.
 *   benefitEvents/{id}               — funil (card visto, clube, parceiro, clique, cupom, lead).
 *   partnerLeads/{partnerId}_{uid}   — lead com consentimento (formulário "Quero contratar").
 *
 * Os números do funil vão para a reunião com o parceiro, então só o servidor grava: escrita
 * direta do cliente deixaria qualquer um inflar a contagem, e número inflado vale menos que número
 * nenhum. Pelo mesmo motivo o lead só existe com o consentimento marcado e com o texto aceito
 * guardado junto (LGPD).
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  callerMeetsPartnerRequirement,
  parseRequirement,
  requirementDeniedMessage,
} from "./benefits-club-eligibility";

export const PARTNERS_COLLECTION = "partners";
export const BENEFIT_EVENTS_COLLECTION = "benefitEvents";
export const PARTNER_LEADS_COLLECTION = "partnerLeads";
export const BENEFITS_CONFIG_PATH = "appConfig/benefitsClub";
/** Cupom de parceiro com requisito (`couponCode` público fica `null`) e marcas do push. Só admin. */
export const PARTNER_PRIVATE_COLLECTION = "partnerPrivate";
/** `NEXA-XXXX` → uids que receberam/usaram o código. Dois uids no mesmo código = ambíguo. */
export const BENEFIT_CODES_COLLECTION = "benefitCodes";
/** Resgates confirmados pelo parceiro (import do backoffice). */
export const BENEFIT_REDEMPTIONS_COLLECTION = "benefitRedemptions";
/** `users/{uid}/benefits/{partnerId}`: salvos e usos do atleta. */
export const USER_BENEFITS_SUBCOLLECTION = "benefits";

/** Eventos que o cliente pode mandar. `lead_submit` só o `submitPartnerLead` grava. */
export const CLIENT_EVENT_TYPES = [
  "hub_card_view",
  "club_view",
  "partner_view",
  "cta_click",
  "code_copy",
] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];
/** `use_confirmed`/`use_denied` só o `answerBenefitUse` grava. */
export type BenefitEventType = ClientEventType | "lead_submit" | "use_confirmed" | "use_denied";

/** Eventos que pertencem a um parceiro (os outros são do clube inteiro). */
const PARTNER_EVENT_TYPES: ReadonlySet<string> = new Set(["partner_view", "cta_click", "code_copy"]);

/** Eventos que contam como uso do benefício (sobem `useCount` e ligam o código ao atleta). */
const USE_EVENT_TYPES: ReadonlySet<string> = new Set(["cta_click", "code_copy"]);

/** De onde a pessoa chegou. O resto vira `unknown`, sem recusar o evento. */
export const EVENT_SOURCES = [
  "hub_card",
  "club_list",
  "sponsor_banner",
  "competir_web",
  "home",
  "deeplink",
  "push",
  // v2: benefício no momento do jogo, destaque, busca, mapa e "Meus benefícios".
  "post_game",
  "tournament_day",
  "featured",
  "search",
  "map",
  "my_benefits",
  "unknown",
] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const SURFACES = ["app", "web"] as const;
export const PLATFORMS = ["ios", "android", "web", "unknown"] as const;

/** Toque repetido no mesmo evento dentro desta janela não grava de novo. */
export const EVENT_DEBOUNCE_SECONDS = 30;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export const LEAD_NAME_MAX = 120;
export const LEAD_NEIGHBORHOOD_MAX = 80;

// ── helpers puros ──────────────────────────────────────────────────────────

export function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** Só dígitos. */
export function digitsOf(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D+/g, "") : "";
}

/**
 * WhatsApp brasileiro em dígitos com DDI: aceita "(62) 98240-6456", "62982406456" e
 * "+55 62 98240-6456". Devolve `null` se não parecer telefone (10 ou 11 dígitos sem o 55).
 */
export function normalizeWhatsapp(value: unknown): string | null {
  let digits = digitsOf(value);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  return `55${digits}`;
}

/** CEP com 8 dígitos ("74230-010" → "74230010"). */
export function normalizeCep(value: unknown): string | null {
  const digits = digitsOf(value);
  return digits.length === 8 ? digits : null;
}

/** Texto padrão do consentimento quando o parceiro não traz o dele. Espelhado no app e no portal. */
export function defaultConsentText(partnerName: string): string {
  return `Autorizo a NexaGO a compartilhar meu nome, WhatsApp, bairro e CEP com a ${partnerName} ` +
    "para que ela entre em contato comigo sobre esta oferta.";
}

export function defaultLeadSuccessMessage(partnerName: string): string {
  return `Pronto! A ${partnerName} vai falar com você pelo WhatsApp`;
}

export interface Caller {
  uid: string;
  /** Papel `admin` ou `superAdmin` no token. */
  isAdmin: boolean;
}

export function callerFromAuth(auth: {uid: string; token: Record<string, unknown>} | undefined): Caller | null {
  if (!auth?.uid) return null;
  const roles = auth.token["roles"];
  const isAdmin = (Array.isArray(roles) && roles.includes("admin")) || auth.token["superAdmin"] === true;
  return {uid: auth.uid, isAdmin};
}

/** Quem testa: admin ou uid em `appConfig/benefitsClub.testerUids`. */
export function isTester(caller: Caller, config: Record<string, unknown> | undefined): boolean {
  if (caller.isAdmin) return true;
  const list = config?.["testerUids"];
  return Array.isArray(list) && list.includes(caller.uid);
}

/** Timestamp do Firestore, `Date` ou millis → millis (`null` se não for data). */
export function millisOf(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const maybe = value as {toMillis?: unknown} | null;
  if (maybe && typeof maybe.toMillis === "function") return (maybe.toMillis as () => number)();
  return null;
}

/** Dentro da validade: depois de `startsAt` (se houver) e antes de `validUntil` (se houver). */
export function partnerInWindow(partner: Record<string, unknown>, now: Date): boolean {
  const startsAt = millisOf(partner["startsAt"]);
  const validUntil = millisOf(partner["validUntil"]);
  if (startsAt != null && now.getTime() < startsAt) return false;
  if (validUntil != null && now.getTime() >= validUntil) return false;
  return true;
}

/**
 * O parceiro aparece para esta pessoa? Ativo, dentro da validade e, se for de teste, só para quem
 * testa. O requisito (`requirement`) não esconde: o parceiro aparece bloqueado.
 */
export function partnerVisibleTo(
  partner: Record<string, unknown>,
  caller: Caller,
  config: Record<string, unknown> | undefined,
  now: Date = new Date(),
): boolean {
  if (partner["active"] !== true) return false;
  if (!partnerInWindow(partner, now)) return false;
  if (partner["audience"] === "testers") return isTester(caller, config);
  return true;
}

/** `NEXA-` + os 4 primeiros alfanuméricos do uid, em maiúsculas (espelha o app e o portal). */
export function athleteBenefitCode(uid: string): string {
  return `NEXA-${uid.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()}`;
}

/** Lê o parceiro e a config e confere se ele aparece para a pessoa; senão `not-found`. */
export async function loadVisiblePartner(
  db: Firestore,
  caller: Caller,
  partnerId: string,
  now: Date,
): Promise<{partner: Record<string, unknown>; config: Record<string, unknown> | undefined}> {
  const [partnerSnap, configSnap] = await Promise.all([
    db.doc(`${PARTNERS_COLLECTION}/${partnerId}`).get(),
    db.doc(BENEFITS_CONFIG_PATH).get(),
  ]);
  const partner = partnerSnap.data();
  const config = configSnap.data();
  if (!partner || !partnerVisibleTo(partner, caller, config, now)) {
    throw new HttpsError("not-found", "Parceiro não encontrado.");
  }
  return {partner, config};
}

/** Confere o requisito do parceiro; quem não cumpre recebe `permission-denied` com a frase da tela. */
export async function assertMeetsRequirement(
  db: Firestore,
  caller: Caller,
  partner: Record<string, unknown>,
): Promise<void> {
  if (await callerMeetsPartnerRequirement(db, caller.uid, partner)) return;
  throw new HttpsError(
    "permission-denied",
    requirementDeniedMessage(parseRequirement(partner["requirement"]), partner["requirementLabel"]),
  );
}

// ── eventos ────────────────────────────────────────────────────────────────

export interface TrackEventInput {
  type?: unknown;
  partnerId?: unknown;
  source?: unknown;
  surface?: unknown;
  platform?: unknown;
}

export interface ParsedEvent {
  type: ClientEventType;
  partnerId: string | null;
  source: EventSource;
  surface: (typeof SURFACES)[number];
  platform: (typeof PLATFORMS)[number];
}

export function parseTrackEvent(input: TrackEventInput): ParsedEvent | {error: string} {
  const type = input.type;
  if (typeof type !== "string" || !(CLIENT_EVENT_TYPES as readonly string[]).includes(type)) {
    return {error: "Evento inválido."};
  }
  const needsPartner = PARTNER_EVENT_TYPES.has(type);
  const partnerId = input.partnerId;
  if (needsPartner && !isValidId(partnerId)) return {error: "Parceiro inválido."};
  return {
    type: type as ClientEventType,
    partnerId: needsPartner ? (partnerId as string) : null,
    source: pick(input.source, EVENT_SOURCES, "unknown"),
    surface: pick(input.surface, SURFACES, "app"),
    platform: pick(input.platform, PLATFORMS, "unknown"),
  };
}

/**
 * Id determinístico por janela de {@link EVENT_DEBOUNCE_SECONDS}: o segundo toque na mesma janela
 * cai no mesmo doc e o `create` recusa, sem transação nem índice.
 */
export function eventDocId(type: string, partnerId: string | null, uid: string, now: Date): string {
  const bucket = Math.floor(now.getTime() / (EVENT_DEBOUNCE_SECONDS * 1000));
  return `${type}_${partnerId ?? "club"}_${uid}_${bucket}`;
}

function isAlreadyExists(error: unknown): boolean {
  const code = (error as {code?: unknown})?.code;
  return code === 6 || code === "already-exists" || code === "ALREADY_EXISTS";
}

/**
 * Campos do `users/{uid}/benefits/{partnerId}` num uso (clique no botão ou cupom copiado). O botão
 * do resgate em um toque copia e abre o link, então chegam `code_copy` e `cta_click` juntos: uso
 * dentro de {@link EVENT_DEBOUNCE_SECONDS} do anterior atualiza a data sem somar outro.
 */
export function benefitUseUpdate(prev: Record<string, unknown> | undefined, now: Date): Record<string, unknown> {
  const at = Timestamp.fromDate(now);
  const count = typeof prev?.["useCount"] === "number" ? (prev["useCount"] as number) : 0;
  const lastMs = millisOf(prev?.["lastUsedAt"]);
  const repeat = lastMs != null && now.getTime() - lastMs < EVENT_DEBOUNCE_SECONDS * 1000;
  return {
    ...(prev ? {} : {saved: false, savedAt: null}),
    useCount: repeat ? count : count + 1,
    firstUsedAt: prev?.["firstUsedAt"] ?? at,
    lastUsedAt: at,
    lastAnswer: null,
  };
}

/** Liga o código ao atleta em `benefitCodes/{code}`; `null` se ele já está na lista. */
export function benefitCodeLinkUpdate(
  prev: Record<string, unknown> | undefined,
  uid: string,
  now: Date,
): Record<string, unknown> | null {
  const uids = Array.isArray(prev?.["uids"]) ? (prev["uids"] as unknown[]).filter((u) => typeof u === "string") : [];
  if (uids.includes(uid)) return null;
  return {uids: [...uids, uid], firstAt: prev?.["firstAt"] ?? Timestamp.fromDate(now)};
}

export function benefitCodeRef(db: Firestore, uid: string) {
  return db.doc(`${BENEFIT_CODES_COLLECTION}/${athleteBenefitCode(uid)}`);
}

export function userBenefitRef(db: Firestore, uid: string, partnerId: string) {
  return db.doc(`users/${uid}/${USER_BENEFITS_SUBCOLLECTION}/${partnerId}`);
}

export async function trackBenefitEventCore(
  db: Firestore,
  caller: Caller,
  input: TrackEventInput,
  now: Date,
): Promise<{ok: true; counted: boolean}> {
  const parsed = parseTrackEvent(input);
  if ("error" in parsed) throw new HttpsError("invalid-argument", parsed.error);

  const partner = parsed.partnerId ? (await loadVisiblePartner(db, caller, parsed.partnerId, now)).partner : null;

  const ref = db.doc(`${BENEFIT_EVENTS_COLLECTION}/${eventDocId(parsed.type, parsed.partnerId, caller.uid, now)}`);
  const event = {
    type: parsed.type,
    partnerId: parsed.partnerId,
    uid: caller.uid,
    source: parsed.source,
    surface: parsed.surface,
    platform: parsed.platform,
    createdAt: Timestamp.fromDate(now),
  };

  if (!partner || !parsed.partnerId || !USE_EVENT_TYPES.has(parsed.type)) {
    try {
      await ref.create(event);
      return {ok: true, counted: true};
    } catch (error) {
      if (isAlreadyExists(error)) return {ok: true, counted: false};
      throw error;
    }
  }

  // Uso: só quem cumpre o requisito; evento, "Meus benefícios" e o código na mesma transação.
  await assertMeetsRequirement(db, caller, partner);
  const benefitRef = userBenefitRef(db, caller.uid, parsed.partnerId);
  const codeRef = partner["couponMode"] === "athlete" ? benefitCodeRef(db, caller.uid) : null;
  const counted = await db.runTransaction(async (tx) => {
    const [eventSnap, benefitSnap, codeSnap] = await Promise.all([
      tx.get(ref),
      tx.get(benefitRef),
      codeRef ? tx.get(codeRef) : Promise.resolve(null),
    ]);
    if (eventSnap.exists) return false;
    tx.create(ref, event);
    tx.set(benefitRef, benefitUseUpdate(benefitSnap.data(), now), {merge: true});
    const codeUpdate = codeRef ? benefitCodeLinkUpdate(codeSnap?.data(), caller.uid, now) : null;
    if (codeRef && codeUpdate) tx.set(codeRef, codeUpdate, {merge: true});
    return true;
  });
  return {ok: true, counted};
}

// ── leads ──────────────────────────────────────────────────────────────────

export interface LeadInput {
  partnerId?: unknown;
  name?: unknown;
  whatsapp?: unknown;
  neighborhood?: unknown;
  cep?: unknown;
  consent?: unknown;
  source?: unknown;
  surface?: unknown;
  platform?: unknown;
}

export interface ParsedLead {
  partnerId: string;
  name: string;
  whatsapp: string;
  neighborhood: string;
  cep: string;
  source: EventSource;
  surface: (typeof SURFACES)[number];
  platform: (typeof PLATFORMS)[number];
}

/** Valida o formulário. A mensagem de erro vai direto para a tela, então é em português. */
export function parseLead(input: LeadInput): ParsedLead | {error: string} {
  if (!isValidId(input.partnerId)) return {error: "Parceiro inválido."};
  if (input.consent !== true) {
    return {error: "Marque a autorização para enviarmos seus dados ao parceiro."};
  }
  const name = text(input.name).replace(/\s+/g, " ");
  if (name.length < 2 || name.length > LEAD_NAME_MAX) return {error: "Informe seu nome."};
  const whatsapp = normalizeWhatsapp(input.whatsapp);
  if (!whatsapp) return {error: "Informe um WhatsApp com DDD."};
  const neighborhood = text(input.neighborhood).replace(/\s+/g, " ");
  if (neighborhood.length < 2 || neighborhood.length > LEAD_NEIGHBORHOOD_MAX) {
    return {error: "Informe seu bairro."};
  }
  const cep = normalizeCep(input.cep);
  if (!cep) return {error: "Informe um CEP com 8 números."};
  return {
    partnerId: input.partnerId,
    name,
    whatsapp,
    neighborhood,
    cep,
    source: pick(input.source, EVENT_SOURCES, "unknown"),
    surface: pick(input.surface, SURFACES, "app"),
    platform: pick(input.platform, PLATFORMS, "unknown"),
  };
}

export function leadDocId(partnerId: string, uid: string): string {
  return `${partnerId}_${uid}`;
}

export async function submitPartnerLeadCore(
  db: Firestore,
  caller: Caller,
  input: LeadInput,
  now: Date,
): Promise<{ok: true; leadId: string; successMessage: string}> {
  const parsed = parseLead(input);
  if ("error" in parsed) throw new HttpsError("invalid-argument", parsed.error);

  const [{partner}, userSnap] = await Promise.all([
    loadVisiblePartner(db, caller, parsed.partnerId, now),
    db.doc(`users/${caller.uid}`).get(),
  ]);
  if (partner["ctaType"] !== "lead_form") {
    throw new HttpsError("failed-precondition", "Este parceiro não recebe cadastro pelo app.");
  }
  await assertMeetsRequirement(db, caller, partner);

  const partnerName = text(partner["name"]) || "parceiro";
  const consentText = text(partner["leadConsentText"]) || defaultConsentText(partnerName);
  const user = userSnap.data() ?? {};
  const at = Timestamp.fromDate(now);
  const leadId = leadDocId(parsed.partnerId, caller.uid);
  const leadRef = db.doc(`${PARTNER_LEADS_COLLECTION}/${leadId}`);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(leadRef);
    const prev = existing.data();
    const base = {
      partnerId: parsed.partnerId,
      partnerName,
      uid: caller.uid,
      name: parsed.name,
      whatsapp: parsed.whatsapp,
      neighborhood: parsed.neighborhood,
      cep: parsed.cep,
      city: text(user["city"]) || null,
      state: text(user["state"]).toUpperCase() || null,
      source: parsed.source,
      surface: parsed.surface,
      platform: parsed.platform,
      consent: true,
      consentText,
      consentAt: at,
      updatedAt: at,
    };
    if (prev) {
      const count = typeof prev["submitCount"] === "number" ? prev["submitCount"] : 1;
      // Reenvio atualiza o mesmo lead (dado novo, consentimento novo) sem voltar o status.
      tx.update(leadRef, {...base, submitCount: count + 1});
    } else {
      tx.create(leadRef, {...base, status: "new", submitCount: 1, createdAt: at});
    }
    tx.set(db.doc(`${BENEFIT_EVENTS_COLLECTION}/lead_submit_${leadId}_${now.getTime()}`), {
      type: "lead_submit",
      partnerId: parsed.partnerId,
      uid: caller.uid,
      source: parsed.source,
      surface: parsed.surface,
      platform: parsed.platform,
      createdAt: at,
    });
  });

  return {
    ok: true,
    leadId,
    successMessage: text(partner["leadSuccessMessage"]) || defaultLeadSuccessMessage(partnerName),
  };
}

// ── callables ──────────────────────────────────────────────────────────────

export const ATHLETE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export function requireCaller(auth: Parameters<typeof callerFromAuth>[0]): Caller {
  const caller = callerFromAuth(auth);
  if (!caller) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return caller;
}

export const trackBenefitEvent = onCall(ATHLETE_CALLABLE, async (request) => {
  const caller = requireCaller(request.auth);
  try {
    return await trackBenefitEventCore(getFirestore(), caller, (request.data ?? {}) as TrackEventInput, new Date());
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.warn("Falha ao gravar evento do clube", {uid: caller.uid, error});
    throw new HttpsError("internal", "Não foi possível registrar.");
  }
});

export const submitPartnerLead = onCall(ATHLETE_CALLABLE, async (request) => {
  const caller = requireCaller(request.auth);
  try {
    return await submitPartnerLeadCore(getFirestore(), caller, (request.data ?? {}) as LeadInput, new Date());
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("Falha ao gravar lead do clube", {uid: caller.uid, error});
    throw new HttpsError("internal", "Não foi possível enviar agora. Tente de novo.");
  }
});
