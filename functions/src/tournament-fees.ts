/**
 * Taxas de torneio (backoffice › Torneios › Taxas): a comissão da nexaGO sobre as inscrições
 * pagas online, com padrão editável e exceção por torneio.
 *
 *   appConfig/tournamentFees      — padrão da plataforma `{percent, floorReais, version, …}`
 *   tournamentFees/{tournamentId} — exceção do torneio `{mode, percent, floorReais, reason, until, version, …}`
 *   tournamentFeesLog/{auto}      — linha do tempo (Histórico da tela)
 *
 * Cascata (`resolveTournamentFeeRule`), da mais específica para a geral:
 *   1. exceção do torneio vigente — `until` vazio ou ainda não passou (data civil de SP, sem
 *      varredura: vencida, quem lê já cai no passo seguinte);
 *   2. comissão negociada no cadastro do organizador (`organizers/{uid}.commissionPercent`),
 *      com o piso do padrão;
 *   3. padrão da plataforma. Doc ausente = 8% com piso de R$ 1,50, o comportamento de antes.
 *
 * A taxa é sempre descontada do organizador: o atleta paga o preço da inscrição. O webhook
 * congela a regra na confirmação do pagamento, então mudar a taxa só vale para novas inscrições.
 *
 * As rules negam escrita de cliente: estas callables são a porta. Espelhado à mão em
 * `frontend/projects/backoffice/src/app/painel/torneios/taxas/data/tournament-fees.ts`
 * (padrão, limites, validação e cascata): mudou aqui, muda lá.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {callerCanAccessBackoffice} from "./auth-roles";
import {getFirebaseProjectId} from "./firebase-paths";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";
import {organizerTournamentNotificationLinks} from "./organizer-notification-links";
import {
  FEE_FLOOR_REAIS,
  TOURNAMENT_FEE_PERCENT,
  computePlatformFeeReais,
  isValidCommissionPercent,
  resolveOrganizerTournamentFeePercent,
} from "./platform-fees";
import {saoPauloDate} from "./store-checkout-price";
import {loadTournamentData} from "./tournament-registration-guards";

const BACKOFFICE_CALLABLE = {
  region: CLIENT_FACING_REGIONS,
  invoker: "public" as const,
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
};

export const FEES_CONFIG_PATH = "appConfig/tournamentFees";
export const TOURNAMENT_FEES = "tournamentFees";
export const TOURNAMENT_FEES_LOG = "tournamentFeesLog";

/** Teto do mínimo por inscrição (R$). Acima disso a taxa vira preço, não piso. */
export const MAX_FEE_FLOOR_REAIS = 20;

export const FEE_REASONS = [
  "Parceria comercial",
  "Evento beneficente",
  "Campanha de lançamento",
  "Correção de cadastro",
] as const;

export type FeeMode = "padrao" | "custom" | "isento";
export type FeeSource = "tournament" | "organizer" | "default";

export interface FeeRule {
  percent: number;
  floorReais: number;
}

export interface ResolvedFeeRule extends FeeRule {
  source: FeeSource;
}

/** Exceção gravada em `tournamentFees/{id}`; `padrao` não é exceção (o doc só guarda a versão). */
export interface TournamentFeeOverride extends FeeRule {
  mode: "custom" | "isento";
  reason: string;
  /** Último dia em que vale (data civil de SP, `YYYY-MM-DD`); `null` = enquanto o torneio existir. */
  until: string | null;
}

export const DEFAULT_FEE_RULE: FeeRule = {percent: TOURNAMENT_FEE_PERCENT, floorReais: FEE_FLOOR_REAIS};

type Raw = Record<string, unknown>;

interface Actor {
  uid: string;
  name: string;
}

function isObj(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Até duas casas: 5,5% e R$ 1,75 valem; 5,555% não. */
function hasTwoDecimals(n: number): boolean {
  return Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
}

export function isValidFeePercent(v: unknown): v is number {
  return isValidCommissionPercent(v) && hasTwoDecimals(v);
}

export function isValidFeeFloor(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_FEE_FLOOR_REAIS && hasTwoDecimals(v);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Data civil real (`2026-02-30` não passa). */
export function isCivilDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// ── leitura ─────────────────────────────────────────────────────────────────

/** Padrão gravado; campo ausente ou fora da faixa cai no padrão de código (nunca derruba a cobrança). */
export function feeDefaultsFromRaw(raw: unknown): FeeRule {
  const data = isObj(raw) ? raw : {};
  return {
    percent: isValidFeePercent(data["percent"]) ? data["percent"] : DEFAULT_FEE_RULE.percent,
    floorReais: isValidFeeFloor(data["floorReais"]) ? data["floorReais"] : DEFAULT_FEE_RULE.floorReais,
  };
}

/** `null` = sem exceção (doc ausente, modo padrão ou dado corrompido). */
export function feeOverrideFromRaw(raw: unknown): TournamentFeeOverride | null {
  if (!isObj(raw)) return null;
  const until = isCivilDate(raw["until"]) ? raw["until"] : null;
  const reason = typeof raw["reason"] === "string" ? raw["reason"] : "";
  if (raw["mode"] === "isento") return {mode: "isento", percent: 0, floorReais: 0, reason, until};
  if (raw["mode"] !== "custom") return null;
  if (!isValidFeePercent(raw["percent"]) || !isValidFeeFloor(raw["floorReais"])) return null;
  return {mode: "custom", percent: raw["percent"], floorReais: raw["floorReais"], reason, until};
}

export function isOverrideActive(override: TournamentFeeOverride, today: string): boolean {
  return override.until === null || today <= override.until;
}

export function resolveTournamentFeeRule(input: {
  override: TournamentFeeOverride | null;
  organizer: Raw | null | undefined;
  defaults: FeeRule;
  today: string;
}): ResolvedFeeRule {
  const {override, organizer, defaults, today} = input;
  if (override && isOverrideActive(override, today)) {
    return {percent: override.percent, floorReais: override.floorReais, source: "tournament"};
  }
  const negotiated = organizer?.["commissionPercent"];
  if (isValidCommissionPercent(negotiated)) {
    return {percent: negotiated, floorReais: defaults.floorReais, source: "organizer"};
  }
  return {...defaults, source: "default"};
}

/** Taxa em reais desta cobrança pela regra do torneio. */
export function tournamentFeeReais(amountReais: number, rule: FeeRule): number {
  return computePlatformFeeReais(amountReais, rule.percent, {floorReais: rule.floorReais});
}

/** Regra congelada no pagamento (`asaas_processed_payments/{id}.platformFee`); `null` = não congelada. */
export function feeRuleFromRaw(raw: unknown): FeeRule | null {
  if (!isObj(raw)) return null;
  const percent = raw["percent"];
  const floorReais = raw["floorReais"];
  return isValidCommissionPercent(percent) && isValidFeeFloor(floorReais) ? {percent, floorReais} : null;
}

export async function loadFeeDefaults(db: Firestore): Promise<FeeRule> {
  return feeDefaultsFromRaw((await db.doc(FEES_CONFIG_PATH).get()).data());
}

/** % do organizador sem olhar torneio (vitrine de planos): negociado, senão o padrão da plataforma. */
export async function organizerFeePercent(db: Firestore, organizerId: string): Promise<number> {
  const [organizer, defaults] = await Promise.all([db.collection("organizers").doc(organizerId).get(), loadFeeDefaults(db)]);
  return resolveOrganizerTournamentFeePercent(organizer.exists ? organizer.data() : null, defaults.percent);
}

/** A regra que vale agora para uma inscrição deste torneio. */
export async function loadTournamentFeeRule(
  db: Firestore,
  tournamentId: string,
  organizerId: string,
  now: Date,
): Promise<ResolvedFeeRule> {
  const [override, organizer, defaults] = await Promise.all([
    tournamentId ? db.collection(TOURNAMENT_FEES).doc(tournamentId).get() : null,
    db.collection("organizers").doc(organizerId).get(),
    loadFeeDefaults(db),
  ]);
  return resolveTournamentFeeRule({
    override: feeOverrideFromRaw(override?.data()),
    organizer: organizer.exists ? organizer.data() : null,
    defaults,
    today: saoPauloDate(now),
  });
}

// ── validação e diff ────────────────────────────────────────────────────────

export interface SaveFeeDefaultInput {
  percent: number;
  floorReais: number;
  /** A `version` lida pela tela; doc ausente = 1. */
  version: number;
}

export interface SaveTournamentFeeInput {
  tournamentId: string;
  mode: FeeMode;
  percent?: number;
  floorReais?: number;
  reason?: string;
  until?: string | null;
  notify?: boolean;
  /** A `version` lida pela tela; doc ausente = 0. */
  version: number;
}

export function feeDefaultErrors(input: unknown): string[] {
  if (!isObj(input)) return ["percent", "floorReais"];
  const errors: string[] = [];
  if (!isValidFeePercent(input["percent"])) errors.push("percent");
  if (!isValidFeeFloor(input["floorReais"])) errors.push("floorReais");
  return errors;
}

export function tournamentFeeErrors(input: unknown, today: string): string[] {
  if (!isObj(input)) return ["mode"];
  const errors: string[] = [];
  const mode = input["mode"];
  if (typeof input["tournamentId"] !== "string" || !input["tournamentId"].trim()) errors.push("tournamentId");
  if (mode !== "padrao" && mode !== "custom" && mode !== "isento") return [...errors, "mode"];
  if (mode === "custom") {
    if (!isValidFeePercent(input["percent"])) errors.push("percent");
    if (!isValidFeeFloor(input["floorReais"])) errors.push("floorReais");
  }
  if (mode !== "padrao") {
    if (!(FEE_REASONS as readonly unknown[]).includes(input["reason"])) errors.push("reason");
    const until = input["until"];
    if (until != null && until !== "" && (!isCivilDate(until) || until < today)) errors.push("until");
  }
  return errors;
}

/** "8%", "5,5%". */
export function percentLabel(percent: number): string {
  return `${String(percent).replace(".", ",")}%`;
}

export function reaisLabel(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function feeDefaultChanges(prev: FeeRule, next: FeeRule): string[] {
  const out: string[] = [];
  if (prev.percent !== next.percent) out.push(`${percentLabel(prev.percent)} → ${percentLabel(next.percent)}`);
  if (prev.floorReais !== next.floorReais) {
    out.push(`mínimo ${reaisLabel(prev.floorReais)} → ${reaisLabel(next.floorReais)}`);
  }
  return out;
}

function overrideLabel(o: TournamentFeeOverride | null): string {
  if (!o) return "padrão";
  if (o.mode === "isento") return "isento";
  return `${percentLabel(o.percent)} · mínimo ${reaisLabel(o.floorReais)}`;
}

export function tournamentFeeChanges(prev: TournamentFeeOverride | null, next: TournamentFeeOverride | null): string[] {
  const out: string[] = [];
  if (overrideLabel(prev) !== overrideLabel(next)) out.push(`${overrideLabel(prev)} → ${overrideLabel(next)}`);
  if (next && (prev?.until ?? null) !== next.until) {
    out.push(next.until ? `válida até ${dayLabel(next.until)}` : "sem data de fim");
  }
  if (next && prev && prev.reason !== next.reason) out.push(`motivo: ${next.reason}`);
  return out;
}

function overrideOf(input: SaveTournamentFeeInput): TournamentFeeOverride | null {
  if (input.mode === "padrao") return null;
  const until = typeof input.until === "string" && input.until ? input.until : null;
  const reason = input.reason ?? "";
  if (input.mode === "isento") return {mode: "isento", percent: 0, floorReais: 0, reason, until};
  return {mode: "custom", percent: input.percent!, floorReais: roundMoney(input.floorReais!), reason, until};
}

// ── gravação ────────────────────────────────────────────────────────────────

function invalidFields(fields: string[]): HttpsError {
  return new HttpsError("invalid-argument", "Dados inválidos.", {fields});
}

function versionOf(data: Raw | undefined, absent: number): number {
  const v = data?.["version"];
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : absent;
}

function conflict(what: string, version: number, data: Raw | undefined): HttpsError {
  return new HttpsError(
    "failed-precondition",
    `${what} foi alterada por outra pessoa. Recarregue antes de salvar.`,
    {updatedBy: data?.["updatedBy"] ?? null, version},
  );
}

function noChanges(): HttpsError {
  return new HttpsError("invalid-argument", "Nenhuma alteração para salvar.", {fields: []});
}

export async function saveFeeDefaultCore(
  db: Firestore,
  input: SaveFeeDefaultInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; percent: number; floorReais: number; changes: string[]}> {
  const errors = feeDefaultErrors(input);
  if (!Number.isInteger(input?.version) || input.version < 1) errors.push("version");
  if (errors.length > 0) throw invalidFields(errors);
  const next: FeeRule = {percent: input.percent, floorReais: roundMoney(input.floorReais)};
  const ref = db.doc(FEES_CONFIG_PATH);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data()! : undefined;
    const version = versionOf(data, 1);
    if (version !== input.version) throw conflict("A taxa padrão", version, data);
    const changes = feeDefaultChanges(feeDefaultsFromRaw(data), next);
    if (changes.length === 0) throw noChanges();
    const nextVersion = version + 1;
    tx.set(ref, {...next, version: nextVersion, updatedAt: now, updatedBy: actor});
    tx.set(db.collection(TOURNAMENT_FEES_LOG).doc(), {
      scope: "default", tournamentId: null, tournamentName: null, version: nextVersion, changes, reason: null,
      createdAt: now, createdBy: actor,
    });
    return {version: nextVersion, ...next, changes};
  });
}

export interface SaveTournamentFeeResult {
  version: number;
  override: TournamentFeeOverride | null;
  changes: string[];
  notified: boolean;
}

export async function saveTournamentFeeCore(
  db: Firestore,
  input: SaveTournamentFeeInput,
  actor: Actor,
  now: Date,
  notify: (n: {managerId: string; tournamentId: string; tournamentName: string; body: string}) => Promise<void> =
    notifyOrganizer,
): Promise<SaveTournamentFeeResult> {
  const today = saoPauloDate(now);
  const errors = tournamentFeeErrors(input, today);
  if (!Number.isInteger(input?.version) || input.version < 0) errors.push("version");
  if (errors.length > 0) throw invalidFields(errors);

  const tournamentId = input.tournamentId.trim();
  const tournament = await loadTournamentData(db, getFirebaseProjectId(), tournamentId);
  if (!tournament) throw new HttpsError("not-found", "Torneio não encontrado.");
  const tournamentName = typeof tournament["name"] === "string" ? tournament["name"] : `Torneio ${tournamentId}`;
  const managerId = typeof tournament["managerId"] === "string" ? tournament["managerId"].trim() : "";
  const next = overrideOf(input);

  const ref = db.collection(TOURNAMENT_FEES).doc(tournamentId);
  const saved = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data()! : undefined;
    const version = versionOf(data, 0);
    if (version !== input.version) throw conflict("A taxa deste torneio", version, data);
    const changes = tournamentFeeChanges(feeOverrideFromRaw(data), next);
    if (changes.length === 0) throw noChanges();
    const nextVersion = version + 1;
    tx.set(ref, {
      mode: next?.mode ?? "padrao",
      percent: next?.percent ?? null,
      floorReais: next?.floorReais ?? null,
      reason: next?.reason ?? null,
      until: next?.until ?? null,
      tournamentName,
      managerId: managerId || null,
      version: nextVersion,
      updatedAt: now,
      updatedBy: actor,
    });
    tx.set(db.collection(TOURNAMENT_FEES_LOG).doc(), {
      scope: "tournament", tournamentId, tournamentName, version: nextVersion, changes, reason: next?.reason ?? null,
      createdAt: now, createdBy: actor,
    });
    return {version: nextVersion, changes};
  });

  // Aviso fora da transação: falha de push não desfaz a taxa gravada.
  let notified = false;
  if (input.notify === true && managerId) {
    try {
      await notify({managerId, tournamentId, tournamentName, body: await noticeBody(db, tournamentName, next)});
      notified = true;
    } catch (e) {
      logger.warn(`saveTournamentFee: aviso ao organizador de ${tournamentId} falhou`, e);
    }
  }
  return {version: saved.version, override: next, changes: saved.changes, notified};
}

/** Texto do aviso com a regra que passa a valer (no padrão, a do organizador/plataforma). */
async function noticeBody(db: Firestore, name: string, next: TournamentFeeOverride | null): Promise<string> {
  if (next?.mode === "isento") return `${name} está isento da comissão da NexaGO nas novas inscrições.`;
  const until = next?.until ? ` até ${dayLabel(next.until)}` : "";
  if (next) {
    return `A comissão da NexaGO em ${name} passa a ser ${percentLabel(next.percent)} ` +
      `(mínimo ${reaisLabel(next.floorReais)}) nas novas inscrições${until}.`;
  }
  const defaults = await loadFeeDefaults(db);
  return `${name} voltou à comissão padrão da NexaGO nas novas inscrições ` +
    `(${percentLabel(defaults.percent)}, mínimo ${reaisLabel(defaults.floorReais)}, salvo comissão do seu cadastro).`;
}

async function notifyOrganizer(n: {managerId: string; tournamentId: string; tournamentName: string; body: string}) {
  await deliverNotificationToUser({
    userId: n.managerId,
    title: "Taxa do torneio atualizada",
    body: n.body,
    type: "tournament_fee_changed",
    data: {tournamentId: n.tournamentId, ...organizerTournamentNotificationLinks(n.tournamentId)},
    requireInteraction: false,
  });
}

async function actorOf(auth: {uid?: string} | undefined): Promise<Actor> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  let caller;
  try {
    caller = await getAuth().getUser(auth.uid);
  } catch (err: unknown) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
    }
    throw err;
  }
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError("permission-denied", "Apenas administradores da plataforma podem editar as taxas.");
  }
  return {uid: auth.uid, name: caller.displayName ?? caller.email ?? auth.uid};
}

export const saveTournamentFeeDefault = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth);
  return saveFeeDefaultCore(getFirestore(), (request.data ?? {}) as SaveFeeDefaultInput, actor, new Date());
});

export const saveTournamentFee = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await actorOf(request.auth);
  return saveTournamentFeeCore(getFirestore(), (request.data ?? {}) as SaveTournamentFeeInput, actor, new Date());
});
