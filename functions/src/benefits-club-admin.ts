/**
 * Clube de Vantagens Nexa · backoffice e avisos da versão premium (spec v2, itens 6 e 9).
 *
 *   importBenefitRedemptions — resgates confirmados pelo parceiro (planilha) → `benefitRedemptions`.
 *                              O código `NEXA-XXXX` vira atleta por `benefitCodes/{code}.uids`:
 *                              1 uid = `matched`, 2+ = `ambiguous`, nenhum = `unmatched`. Só
 *                              `matched` entra na economia do atleta. Idempotente por
 *                              `{partnerId}_{externalId}`.
 *   notifyBenefitPartner     — push "parceiro novo" / "oferta acabando", uma vez por parceiro e
 *                              tipo (marca em `partnerPrivate`), com `dryRun` que só conta.
 *   benefitExpiryReminders   — diária, 10h de Brasília: parceiro que termina em até 48 h → push
 *                              para quem salvou e não usou depois de salvar, uma vez por pessoa.
 *
 * Push pelo `deliverNotificationToUser` (FCM + Web Push + item na lista do app). `url` é a rota do
 * app e `webUrl` a do portal. Quem não tem aparelho registrado não entra no público do push do
 * parceiro; no lembrete (a pessoa salvou o benefício) o item na lista do app vale mesmo sem aparelho.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {Timestamp, getFirestore, type DocumentData, type Firestore} from "firebase-admin/firestore";
import {
  BENEFIT_CODES_COLLECTION,
  BENEFIT_REDEMPTIONS_COLLECTION,
  BENEFITS_CONFIG_PATH,
  PARTNER_PRIVATE_COLLECTION,
  PARTNERS_COLLECTION,
  USER_BENEFITS_SUBCOLLECTION,
  isValidId,
  millisOf,
  partnerInWindow,
  partnerVisibleTo,
  requireCaller,
  text,
  type Caller,
} from "./benefits-club";
import {eligibleUidsFor, parseRequirement} from "./benefits-club-eligibility";
import {isTestAccount, normalizeCity} from "./blog-push";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  WEB_PUSH_PRIVATE_KEY,
  WEB_PUSH_PUBLIC_KEY,
  WEB_PUSH_SUBJECT,
  deliverNotificationToUser,
} from "./notification-delivery";

type Raw = Record<string, unknown>;

const PUSH_SECRETS = [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT];
const ADMIN_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};
const DAY_MS = 24 * 60 * 60 * 1000;
const SP_TIMEZONE = "America/Sao_Paulo";
const DELIVERY_CONCURRENCY = 10;
const GET_ALL_CHUNK = 300;

/** Teto de linhas por chamada do import (uma escrita em lote do Firestore). */
export const MAX_IMPORT_ROWS = 500;
/**
 * Teto de destinatários do push do parceiro por chamada. A base inteira com aparelho cabe com folga
 * (~300 em nov/2026); acima disso o envio é recusado em vez de cortado, porque a marca "uma vez por
 * parceiro e tipo" deixaria o resto sem aviso para sempre. O `dryRun` mostra o tamanho antes.
 */
export const MAX_PARTNER_PUSH_RECIPIENTS = 2000;
/** O lembrete vai para parceiros que terminam nas próximas 48 h. */
export const EXPIRY_REMINDER_WINDOW_MS = 48 * 60 * 60 * 1000;

export const PUSH_TYPE_PARTNER_NEW = "benefit_partner_new";
export const PUSH_TYPE_PARTNER_ENDING = "benefit_partner_ending";
export const PUSH_TYPE_EXPIRY_REMINDER = "benefit_expiry_reminder";

function requireAdmin(caller: Caller): void {
  if (!caller.isAdmin) throw new HttpsError("permission-denied", "Só a equipe da Nexa pode fazer isso.");
}

// ── importBenefitRedemptions ───────────────────────────────────────────────

export interface RedemptionRow {
  code: string;
  externalId: string;
  redeemedAt: Date;
  discountCents: number;
  orderCents: number | null;
}

const CODE_PATTERN = /^[A-Z0-9-]{1,40}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** O `externalId` vira parte do id do doc: sem barra, sem `.`/`..` e sem o prefixo reservado `__`. */
function validExternalId(value: string): boolean {
  return value.length >= 1 && value.length <= 100 && !value.includes("/") && value !== "." &&
    value !== ".." && !value.startsWith("__");
}

/** Valida a planilha inteira; a primeira linha com defeito recusa o envio (nada é gravado). */
export function parseRedemptionRows(rows: unknown): RedemptionRow[] | {error: string} {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_IMPORT_ROWS) {
    return {error: `Envie de 1 a ${MAX_IMPORT_ROWS} linhas por vez.`};
  }
  const out: RedemptionRow[] = [];
  for (const [i, raw] of rows.entries()) {
    const line = i + 1;
    const r = (raw ?? {}) as Raw;
    const code = text(r["code"]).toUpperCase();
    if (!CODE_PATTERN.test(code)) return {error: `Linha ${line}: código inválido.`};
    const externalId = text(r["externalId"]);
    if (!validExternalId(externalId)) return {error: `Linha ${line}: identificador do pedido inválido.`};
    const dateText = text(r["redeemedAt"]);
    const redeemedMs = ISO_DATE_PATTERN.test(dateText) ? Date.parse(dateText) : Number.NaN;
    if (!Number.isFinite(redeemedMs)) return {error: `Linha ${line}: data inválida (use AAAA-MM-DD).`};
    if (!isCents(r["discountCents"])) return {error: `Linha ${line}: desconto em centavos inválido.`};
    const orderCents = r["orderCents"] ?? null;
    if (orderCents !== null && !isCents(orderCents)) {
      return {error: `Linha ${line}: valor do pedido em centavos inválido.`};
    }
    out.push({code, externalId, redeemedAt: new Date(redeemedMs), discountCents: r["discountCents"], orderCents});
  }
  return out;
}

/** 1 uid = `matched`; 2+ = `ambiguous`; nenhum = `unmatched`. */
export function matchRedemption(codeDoc: Raw | undefined): {status: "matched" | "ambiguous" | "unmatched"; uid: string | null} {
  const uids = Array.isArray(codeDoc?.["uids"]) ?
    [...new Set((codeDoc["uids"] as unknown[]).filter((u): u is string => typeof u === "string" && u.length > 0))] :
    [];
  if (uids.length === 1) return {status: "matched", uid: uids[0] ?? null};
  return {status: uids.length > 1 ? "ambiguous" : "unmatched", uid: null};
}

export interface ImportInput {
  partnerId?: unknown;
  rows?: unknown;
}

export interface ImportResult {
  matched: number;
  ambiguous: number;
  unmatched: number;
  duplicates: number;
}

async function actorName(db: Firestore, uid: string): Promise<string> {
  const u = (await db.doc(`users/${uid}`).get()).data() ?? {};
  return [u["fullName"], u["name"], u["displayName"]].map(text).find((v) => v) ?? "Equipe Nexa";
}

export async function importBenefitRedemptionsCore(
  db: Firestore,
  caller: Caller,
  input: ImportInput,
  now: Date,
): Promise<ImportResult> {
  requireAdmin(caller);
  if (!isValidId(input.partnerId)) throw new HttpsError("invalid-argument", "Parceiro inválido.");
  const partnerId = input.partnerId;
  const parsed = parseRedemptionRows(input.rows);
  if ("error" in parsed) throw new HttpsError("invalid-argument", parsed.error);

  const [partnerSnap, importedByName] = await Promise.all([
    db.doc(`${PARTNERS_COLLECTION}/${partnerId}`).get(),
    actorName(db, caller.uid),
  ]);
  if (!partnerSnap.exists) throw new HttpsError("not-found", "Parceiro não encontrado.");

  const codes = [...new Set(parsed.map((r) => r.code))];
  const docRefs = parsed.map((r) => db.doc(`${BENEFIT_REDEMPTIONS_COLLECTION}/${partnerId}_${r.externalId}`));
  const [codeSnaps, existingSnaps] = await Promise.all([
    db.getAll(...codes.map((c) => db.doc(`${BENEFIT_CODES_COLLECTION}/${c}`))),
    db.getAll(...docRefs),
  ]);
  const codeDocs = new Map(codes.map((c, i) => [c, codeSnaps[i]?.data()]));

  const result: ImportResult = {matched: 0, ambiguous: 0, unmatched: 0, duplicates: 0};
  const seen = new Set<string>();
  const batch = db.batch();
  const at = Timestamp.fromDate(now);
  parsed.forEach((row, i) => {
    const ref = docRefs[i];
    if (!ref || existingSnaps[i]?.exists || seen.has(row.externalId)) {
      result.duplicates += 1;
      return;
    }
    seen.add(row.externalId);
    const {status, uid} = matchRedemption(codeDocs.get(row.code));
    result[status] += 1;
    batch.set(ref, {
      partnerId,
      externalId: row.externalId,
      code: row.code,
      uid,
      status,
      discountCents: row.discountCents,
      orderCents: row.orderCents,
      redeemedAt: Timestamp.fromDate(row.redeemedAt),
      importedAt: at,
      importedByName,
    });
  });
  if (seen.size > 0) await batch.commit();
  return result;
}

// ── push: textos e destino ─────────────────────────────────────────────────

function spDayNumber(ms: number): number {
  const key = new Intl.DateTimeFormat("en-CA", {timeZone: SP_TIMEZONE}).format(new Date(ms));
  return Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS);
}

/**
 * "termina hoje" / "termina amanhã" / "termina em N dias", pelo calendário de Brasília. `validUntil`
 * é o instante em que o parceiro some, então o último dia é o do instante anterior.
 */
export function endingLabel(validUntilMs: number, now: Date): string {
  const days = spDayNumber(validUntilMs - 1) - spDayNumber(now.getTime());
  if (days <= 0) return "termina hoje";
  if (days === 1) return "termina amanhã";
  return `termina em ${days} dias`;
}

export function benefitPushLinks(partnerId: string): {url: string; webUrl: string; partnerId: string} {
  return {url: `/athlete/clube/${partnerId}?origem=push`, webUrl: `/clube/${partnerId}?origem=push`, partnerId};
}

export type PartnerPushKind = "new" | "ending";

export function partnerPushMessage(kind: PartnerPushKind, partner: Raw, now: Date): {title: string; body: string} {
  const name = text(partner["name"]) || "Parceiro";
  const benefit = text(partner["benefitTitle"]);
  if (kind === "new") {
    return {title: "Novo no Clube de Vantagens", body: benefit ? `${name}: ${benefit}` : `${name} chegou ao clube.`};
  }
  const until = millisOf(partner["validUntil"]) ?? now.getTime();
  return {
    title: `${name}: oferta ${endingLabel(until, now)}`,
    body: `${benefit || "O benefício"}. Aproveite antes que acabe.`,
  };
}

export function expiryReminderMessage(partner: Raw, now: Date): {title: string; body: string} {
  const name = text(partner["name"]) || "Parceiro";
  const benefit = text(partner["benefitTitle"]) || "o benefício";
  const until = millisOf(partner["validUntil"]) ?? now.getTime();
  return {title: `${name} ${endingLabel(until, now)}`, body: `Você salvou "${benefit}". Use antes que acabe.`};
}

export interface BenefitPush {
  userId: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
  /** `false` = só o item na lista de notificações do app (push desligado nas Configurações). */
  withPush: boolean;
}

export interface BenefitNotifyDeps {
  /** Entrega; devolve se algum aparelho recebeu. */
  notify: (push: BenefitPush) => Promise<boolean>;
}

export const defaultBenefitNotifyDeps: BenefitNotifyDeps = {
  notify: async (push) => {
    const r = await deliverNotificationToUser({
      userId: push.userId,
      title: push.title,
      body: push.body,
      type: push.type,
      data: push.data,
      requireInteraction: false,
      skipPush: !push.withPush,
    });
    return r.sent > 0;
  },
};

async function runInPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({length: Math.min(size, items.length)}, async () => {
    while (next < items.length) await fn(items[next++] as T);
  });
  await Promise.all(workers);
}

/** Entrega em paralelo limitado; falha num atleta não para os outros. Devolve quantos receberam. */
async function deliverAll(deps: BenefitNotifyDeps, pushes: BenefitPush[], label: string): Promise<number> {
  let sent = 0;
  await runInPool(pushes, DELIVERY_CONCURRENCY, async (push) => {
    try {
      if (await deps.notify(push)) sent += 1;
    } catch (error) {
      logger.warn(`${label}: falha num atleta`, {userId: push.userId, error});
    }
  });
  return sent;
}

// ── público ────────────────────────────────────────────────────────────────

function isAthlete(d: DocumentData): boolean {
  const roles = d["roles"];
  if (Array.isArray(roles)) return roles.includes("athlete");
  return d["role"] === "athlete";
}

function pushChannelOn(d: DocumentData): boolean {
  const prefs = d["notificationPreferences"] as {channels?: Record<string, unknown>} | undefined;
  return prefs?.channels?.["push"] !== false;
}

/** Uids com aparelho registrado: token FCM (`users/{uid}/tokens`) ou assinatura Web Push. */
async function uidsWithDevice(db: Firestore): Promise<Set<string>> {
  const snaps = await Promise.all([
    db.collectionGroup("tokens").get(),
    db.collectionGroup("webPushSubscriptions").get(),
  ]);
  const uids = new Set<string>();
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      const parts = doc.ref.path.split("/");
      if (parts.length === 4 && parts[0] === "users" && parts[1]) uids.add(parts[1]);
    }
  }
  return uids;
}

async function userDocs(db: Firestore, uids: string[]): Promise<Map<string, Raw>> {
  const out = new Map<string, Raw>();
  for (let i = 0; i < uids.length; i += GET_ALL_CHUNK) {
    const refs = uids.slice(i, i + GET_ALL_CHUNK).map((uid) => db.doc(`users/${uid}`));
    for (const snap of await db.getAll(...refs)) {
      const d = snap.data();
      if (d) out.set(snap.id, d);
    }
  }
  return out;
}

/** Só quem testa: parceiro de teste ou clube desligado. */
export function partnerPushTestersOnly(partner: Raw, config: Raw | undefined): boolean {
  return partner["audience"] === "testers" || config?.["enabled"] !== true;
}

/** Cidade do perfil dentro das cidades do parceiro (lista vazia = todas). */
export function inPartnerCities(user: Raw, partner: Raw): boolean {
  const cities = Array.isArray(partner["cities"]) ?
    (partner["cities"] as unknown[]).filter((c): c is string => typeof c === "string" && c.trim().length > 0) :
    [];
  if (cities.length === 0) return true;
  const city = normalizeCity(typeof user["city"] === "string" ? user["city"] : "");
  return city.length > 0 && cities.some((c) => normalizeCity(c) === city);
}

/**
 * Público do push do parceiro: com push ligado e aparelho registrado; quem testa (`testerUids`)
 * quando o parceiro é de teste ou o clube está desligado; senão atletas (sem seed/QA) das cidades
 * do parceiro que cumprem o requisito.
 */
export async function partnerPushRecipients(db: Firestore, partner: Raw, config: Raw | undefined): Promise<string[]> {
  const devices = await uidsWithDevice(db);
  if (partnerPushTestersOnly(partner, config)) {
    const testers = Array.isArray(config?.["testerUids"]) ?
      [...new Set((config["testerUids"] as unknown[]).filter((u): u is string => typeof u === "string" && u.length > 0))] :
      [];
    const users = await userDocs(db, testers.filter((uid) => devices.has(uid)));
    return [...users].filter(([, d]) => pushChannelOn(d)).map(([uid]) => uid).sort();
  }
  const [users, eligible] = await Promise.all([
    db.collection("users").get(),
    eligibleUidsFor(db, parseRequirement(partner["requirement"])),
  ]);
  return users.docs
    .filter((doc) => {
      const d = doc.data();
      if (!devices.has(doc.id) || !isAthlete(d) || isTestAccount(d) || !pushChannelOn(d)) return false;
      if (!inPartnerCities(d, partner)) return false;
      if (eligible.uids && !eligible.uids.has(doc.id)) return false;
      return !eligible.byProfile || eligible.byProfile(d);
    })
    .map((doc) => doc.id)
    .sort();
}

// ── notifyBenefitPartner ───────────────────────────────────────────────────

export interface NotifyPartnerInput {
  partnerId?: unknown;
  kind?: unknown;
  dryRun?: unknown;
}

const MARKER_FIELD: Record<PartnerPushKind, "notifiedNewAt" | "notifiedEndingAt"> = {
  new: "notifiedNewAt",
  ending: "notifiedEndingAt",
};

/** `dryRun` só conta; envia só com `dryRun: false` explícito. */
export async function notifyBenefitPartnerCore(
  db: Firestore,
  caller: Caller,
  input: NotifyPartnerInput,
  now: Date,
  deps: BenefitNotifyDeps = defaultBenefitNotifyDeps,
): Promise<{recipients: number; sent: number}> {
  requireAdmin(caller);
  if (!isValidId(input.partnerId)) throw new HttpsError("invalid-argument", "Parceiro inválido.");
  if (input.kind !== "new" && input.kind !== "ending") throw new HttpsError("invalid-argument", "Tipo de aviso inválido.");
  const partnerId = input.partnerId;
  const kind: PartnerPushKind = input.kind;
  const dryRun = input.dryRun !== false;

  const [partnerSnap, configSnap] = await Promise.all([
    db.doc(`${PARTNERS_COLLECTION}/${partnerId}`).get(),
    db.doc(BENEFITS_CONFIG_PATH).get(),
  ]);
  const partner = partnerSnap.data();
  if (!partner) throw new HttpsError("not-found", "Parceiro não encontrado.");
  if (partner["active"] !== true || !partnerInWindow(partner, now)) {
    throw new HttpsError("failed-precondition", "O parceiro precisa estar ativo e dentro da validade.");
  }
  if (kind === "ending" && millisOf(partner["validUntil"]) == null) {
    throw new HttpsError("failed-precondition", "Defina a data de término do parceiro para avisar que a oferta está acabando.");
  }

  const recipients = await partnerPushRecipients(db, partner, configSnap.data());
  if (dryRun) return {recipients: recipients.length, sent: 0};
  if (recipients.length > MAX_PARTNER_PUSH_RECIPIENTS) {
    throw new HttpsError(
      "failed-precondition",
      `O público tem ${recipients.length} pessoas, acima do limite de ${MAX_PARTNER_PUSH_RECIPIENTS} por envio. ` +
        "Restrinja as cidades do parceiro.",
    );
  }

  // Marca antes de enviar: dois cliques no botão não mandam o aviso duas vezes.
  const privateRef = db.doc(`${PARTNER_PRIVATE_COLLECTION}/${partnerId}`);
  const field = MARKER_FIELD[kind];
  const at = Timestamp.fromDate(now);
  await db.runTransaction(async (tx) => {
    const prev = (await tx.get(privateRef)).data();
    if (prev?.[field]) throw new HttpsError("failed-precondition", "Este aviso já foi enviado para este parceiro.");
    tx.set(privateRef, {
      ...(prev ? {} : {couponCode: null}),
      [field]: at,
      updatedAt: at,
      updatedBy: caller.uid,
    }, {merge: true});
  });

  const {title, body} = partnerPushMessage(kind, partner, now);
  const type = kind === "new" ? PUSH_TYPE_PARTNER_NEW : PUSH_TYPE_PARTNER_ENDING;
  const data = benefitPushLinks(partnerId);
  const sent = await deliverAll(
    deps,
    recipients.map((userId) => ({userId, title, body, type, data, withPush: true})),
    "notifyBenefitPartner",
  );
  logger.info("notifyBenefitPartner: enviado", {partnerId, kind, recipients: recipients.length, sent});
  return {recipients: recipients.length, sent};
}

// ── benefitExpiryReminders ─────────────────────────────────────────────────

/** Parceiros ativos, no ar e que terminam nas próximas 48 h. */
export function endingSoon(partner: Raw, now: Date): boolean {
  const until = millisOf(partner["validUntil"]);
  return partner["active"] === true && partnerInWindow(partner, now) && until != null &&
    until - now.getTime() <= EXPIRY_REMINDER_WINDOW_MS;
}

export interface SavedBenefit {
  uid: string;
  partnerId: string;
  data: Raw;
}

/** `users/{uid}/benefits/{partnerId}` → partes; outro caminho com o mesmo nome de coleção = `null`. */
export function savedBenefitOf(path: string, data: Raw): SavedBenefit | null {
  const parts = path.split("/");
  if (parts.length !== 4 || parts[0] !== "users" || parts[2] !== USER_BENEFITS_SUBCOLLECTION) return null;
  const [, uid, , partnerId] = parts;
  return uid && partnerId ? {uid, partnerId, data} : null;
}

/** Salvou, não usou depois de salvar e ainda não recebeu o lembrete deste parceiro. */
export function needsExpiryReminder(d: Raw): boolean {
  if (d["saved"] !== true || d["expiryNotifiedAt"]) return false;
  const lastUsed = millisOf(d["lastUsedAt"]);
  if (lastUsed == null) return true;
  const savedAt = millisOf(d["savedAt"]);
  return savedAt != null && lastUsed < savedAt;
}

export async function runBenefitExpiryRemindersCore(
  db: Firestore,
  now: Date,
  deps: BenefitNotifyDeps = defaultBenefitNotifyDeps,
): Promise<{partners: number; reminders: number; sent: number}> {
  const [partnersSnap, configSnap] = await Promise.all([
    db.collection(PARTNERS_COLLECTION).where("active", "==", true).get(),
    db.doc(BENEFITS_CONFIG_PATH).get(),
  ]);
  const ending = new Map(partnersSnap.docs.filter((d) => endingSoon(d.data(), now)).map((d) => [d.id, d.data()]));
  if (ending.size === 0) return {partners: 0, reminders: 0, sent: 0};

  const savedSnap = await db.collectionGroup(USER_BENEFITS_SUBCOLLECTION).where("saved", "==", true).get();
  const picks = savedSnap.docs
    .map((doc) => savedBenefitOf(doc.ref.path, doc.data()))
    .filter((s): s is SavedBenefit => s != null && ending.has(s.partnerId) && needsExpiryReminder(s.data));
  if (picks.length === 0) return {partners: ending.size, reminders: 0, sent: 0};

  const config = configSnap.data();
  const users = await userDocs(db, [...new Set(picks.map((p) => p.uid))]);
  const eligibleByPartner = new Map<string, Awaited<ReturnType<typeof eligibleUidsFor>>>();
  for (const partnerId of new Set(picks.map((p) => p.partnerId))) {
    eligibleByPartner.set(partnerId, await eligibleUidsFor(db, parseRequirement(ending.get(partnerId)?.["requirement"])));
  }

  const pushes: BenefitPush[] = [];
  for (const pick of picks) {
    const partner = ending.get(pick.partnerId) ?? {};
    const user = users.get(pick.uid);
    const eligible = eligibleByPartner.get(pick.partnerId);
    if (!user || !partnerVisibleTo(partner, {uid: pick.uid, isAdmin: false}, config, now)) continue;
    if (eligible?.uids && !eligible.uids.has(pick.uid)) continue;
    if (eligible?.byProfile && !eligible.byProfile(user)) continue;
    // Marca antes de enviar (uma vez por pessoa e parceiro), conferindo de novo na transação.
    const ref = db.doc(`users/${pick.uid}/${USER_BENEFITS_SUBCOLLECTION}/${pick.partnerId}`);
    const marked = await db.runTransaction(async (tx) => {
      const d = (await tx.get(ref)).data();
      if (!d || !needsExpiryReminder(d)) return false;
      tx.update(ref, {expiryNotifiedAt: Timestamp.fromDate(now)});
      return true;
    });
    if (!marked) continue;
    const {title, body} = expiryReminderMessage(partner, now);
    pushes.push({
      userId: pick.uid,
      title,
      body,
      type: PUSH_TYPE_EXPIRY_REMINDER,
      data: benefitPushLinks(pick.partnerId),
      withPush: pushChannelOn(user),
    });
  }
  const sent = await deliverAll(deps, pushes, "benefitExpiryReminders");
  return {partners: ending.size, reminders: pushes.length, sent};
}

// ── callables e agendada ───────────────────────────────────────────────────

export const importBenefitRedemptions = onCall({...ADMIN_CALLABLE, timeoutSeconds: 120}, async (request) => {
  const caller = requireCaller(request.auth);
  try {
    return await importBenefitRedemptionsCore(getFirestore(), caller, (request.data ?? {}) as ImportInput, new Date());
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("Falha no import de resgates do clube", {uid: caller.uid, error});
    throw new HttpsError("internal", "Não foi possível importar agora. Tente de novo.");
  }
});

export const notifyBenefitPartner = onCall(
  {...ADMIN_CALLABLE, timeoutSeconds: 540, secrets: PUSH_SECRETS},
  async (request) => {
    const caller = requireCaller(request.auth);
    try {
      return await notifyBenefitPartnerCore(getFirestore(), caller, (request.data ?? {}) as NotifyPartnerInput, new Date());
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Falha no push do parceiro do clube", {uid: caller.uid, error});
      throw new HttpsError("internal", "Não foi possível enviar o aviso agora.");
    }
  },
);

export const benefitExpiryReminders = onSchedule(
  {schedule: "0 10 * * *", timeZone: SP_TIMEZONE, timeoutSeconds: 540, secrets: PUSH_SECRETS},
  async () => {
    const result = await runBenefitExpiryRemindersCore(getFirestore(), new Date());
    logger.info("benefitExpiryReminders", result);
  },
);
