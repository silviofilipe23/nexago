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

export const PARTNERS_COLLECTION = "partners";
export const BENEFIT_EVENTS_COLLECTION = "benefitEvents";
export const PARTNER_LEADS_COLLECTION = "partnerLeads";
export const BENEFITS_CONFIG_PATH = "appConfig/benefitsClub";

/** Eventos que o cliente pode mandar. `lead_submit` só o `submitPartnerLead` grava. */
export const CLIENT_EVENT_TYPES = [
  "hub_card_view",
  "club_view",
  "partner_view",
  "cta_click",
  "code_copy",
] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];
export type BenefitEventType = ClientEventType | "lead_submit";

/** Eventos que pertencem a um parceiro (os outros são do clube inteiro). */
const PARTNER_EVENT_TYPES: ReadonlySet<string> = new Set(["partner_view", "cta_click", "code_copy"]);

/** De onde a pessoa chegou. O resto vira `unknown`, sem recusar o evento. */
export const EVENT_SOURCES = [
  "hub_card",
  "club_list",
  "sponsor_banner",
  "competir_web",
  "home",
  "deeplink",
  "push",
  "unknown",
] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

const SURFACES = ["app", "web"] as const;
const PLATFORMS = ["ios", "android", "web", "unknown"] as const;

/** Toque repetido no mesmo evento dentro desta janela não grava de novo. */
export const EVENT_DEBOUNCE_SECONDS = 30;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export const LEAD_NAME_MAX = 120;
export const LEAD_NEIGHBORHOOD_MAX = 80;

// ── helpers puros ──────────────────────────────────────────────────────────

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function text(value: unknown): string {
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

/** O parceiro aparece para esta pessoa? (ativo e, se for de teste, só para quem testa). */
export function partnerVisibleTo(
  partner: Record<string, unknown>,
  caller: Caller,
  config: Record<string, unknown> | undefined,
): boolean {
  if (partner["active"] !== true) return false;
  if (partner["audience"] === "testers") return isTester(caller, config);
  return true;
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

export async function trackBenefitEventCore(
  db: Firestore,
  caller: Caller,
  input: TrackEventInput,
  now: Date,
): Promise<{ok: true; counted: boolean}> {
  const parsed = parseTrackEvent(input);
  if ("error" in parsed) throw new HttpsError("invalid-argument", parsed.error);

  if (parsed.partnerId) {
    const [partnerSnap, configSnap] = await Promise.all([
      db.doc(`${PARTNERS_COLLECTION}/${parsed.partnerId}`).get(),
      db.doc(BENEFITS_CONFIG_PATH).get(),
    ]);
    const partner = partnerSnap.data();
    if (!partner || !partnerVisibleTo(partner, caller, configSnap.data())) {
      throw new HttpsError("not-found", "Parceiro não encontrado.");
    }
  }

  const ref = db.doc(`${BENEFIT_EVENTS_COLLECTION}/${eventDocId(parsed.type, parsed.partnerId, caller.uid, now)}`);
  try {
    await ref.create({
      type: parsed.type,
      partnerId: parsed.partnerId,
      uid: caller.uid,
      source: parsed.source,
      surface: parsed.surface,
      platform: parsed.platform,
      createdAt: Timestamp.fromDate(now),
    });
    return {ok: true, counted: true};
  } catch (error) {
    if (isAlreadyExists(error)) return {ok: true, counted: false};
    throw error;
  }
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

  const partnerRef = db.doc(`${PARTNERS_COLLECTION}/${parsed.partnerId}`);
  const [partnerSnap, configSnap, userSnap] = await Promise.all([
    partnerRef.get(),
    db.doc(BENEFITS_CONFIG_PATH).get(),
    db.doc(`users/${caller.uid}`).get(),
  ]);
  const partner = partnerSnap.data();
  if (!partner || !partnerVisibleTo(partner, caller, configSnap.data())) {
    throw new HttpsError("not-found", "Parceiro não encontrado.");
  }
  if (partner["ctaType"] !== "lead_form") {
    throw new HttpsError("failed-precondition", "Este parceiro não recebe cadastro pelo app.");
  }

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

const ATHLETE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

function requireCaller(auth: Parameters<typeof callerFromAuth>[0]): Caller {
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
