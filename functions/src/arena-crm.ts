/**
 * CRM da arena — callables. A matemática toda vive em `arena-crm-model.ts`; aqui só a
 * autorização, a leitura dos docs e as escritas (contrato, pagamento, renovação, contato).
 *
 * Acesso: área `agenda` da arena (dono, gestor e recepção escrevem; manutenção só lê),
 * a mesma dos Planos de horário. Rules negam o cliente nas coleções do CRM: tudo passa por aqui.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {assertArenaAreaAccess} from "./arena-area-access";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  ARENA_SCHEDULE_CHARGES,
  ARENA_SCHEDULE_SUBSCRIPTIONS,
  SCHEDULE_PLANS,
} from "./arena-schedule-plan-constants";
import {
  CRM_CONTACTS,
  CRM_CONTACT_CHANNELS,
  CRM_CONTACT_OUTCOMES,
  CRM_CONTACT_REASONS,
  CRM_CONTRACTS,
  CRM_DUE_DAYS,
  MAX_WEEKLY_HOURS,
  MIN_WEEKLY_HOURS,
  CRM_PAYMENTS,
  CRM_PAYMENT_METHODS,
  CRM_PERIODS,
  CRM_SETTINGS,
  CRM_SETTINGS_DOC,
  addDays,
  aggregateBookings,
  bookingPlayersOf,
  buildOverview,
  contractView,
  customerKeyOf,
  historyStartDate,
  isDateKey,
  periodMonths,
  renewalStartDate,
  whatsappDigits,
  type CrmBookingRecord,
  type CrmContactRecord,
  type CrmContractRecord,
  type CrmIdentity,
  type CrmOverview,
  type CrmPlanOption,
  type ScheduleChargeRecord,
  type ScheduleSubscriptionRecord,
} from "./arena-crm-model";
import {bookingSnapshot} from "./arena-crm-cache";
import {
  createCrmPaymentLink,
  defaultCrmBillingDeps,
  onlineLinkFrom,
  voidLink,
  voidStaleLink,
  type CrmBillingDeps,
} from "./arena-crm-billing";
import {asaasArenaSecrets} from "./asaas-client";
import {
  CRM_REMINDERS,
  REMINDER_KINDS,
  reminderOutcome,
  reminderSettingsFrom,
  type ReminderKind,
  type ReminderOutcome,
  type ReminderSettings,
  type SentReminder,
} from "./arena-crm-reminders-model";

const ARENA_BOOKINGS = "arenaBookings";
/** Contatos carregados na visão geral (o último por cliente e o funil de 90 dias). */
const CONTACTS_WINDOW_DAYS = 120;
const DEFAULT_MONTHLY_GOAL = 5;
const BOOKING_FIELDS = [
  "athleteId", "customerName", "date", "startTime", "endTime", "status", "attendanceStatus", "amountReais",
  "isRecurring", "coveredByPlan", "scheduleSubscriptionId", "source", "bookedAs",
  // Quem jogou (convite e placar) também é cliente da arena.
  "participants", "resultPlayers",
] as const;

type Data = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function optStr(v: unknown): string | null {
  const s = str(v);
  return s ? s : null;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function toIso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return typeof v === "string" && v ? v : null;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return v as T;
  throw new HttpsError("invalid-argument", `${field} inválido.`);
}

// ── Parse dos docs ──────────────────────────────────────────────────────────────

/** Contratos antigos guardavam "vezes por semana": cada vez vale 1h no banco de horas. */
function contractWeeklyHours(d: Data): number {
  const hours = num(d["weeklyHours"]);
  return hours > 0 ? hours : Math.max(1, num(d["timesPerWeek"], 1));
}

/** Horários × duração do plano (snapshot da assinatura; 1h se não houver). */
function subscriptionWeeklyHours(d: Data): number {
  const snapshot = (d["planSnapshot"] ?? {}) as Data;
  // Plano livre não tem horários: vale a cota da semana.
  const slots = snapshot["bookingMode"] === "flexible" ? num(snapshot["timesPerWeek"], 1) :
    Array.isArray(d["slots"]) ? d["slots"].length : 1;
  const minutes = num(snapshot["durationMinutes"], 60) || 60;
  return Math.round(Math.max(1, slots) * minutes / 30) / 2;
}

export function contractFromDoc(id: string, d: Data): CrmContractRecord {
  const period = (CRM_PERIODS as readonly string[]).includes(str(d["period"])) ? str(d["period"]) as CrmContractRecord["period"] : "monthly";
  const status = d["status"] === "canceled" ? "canceled" : d["status"] === "renewed" ? "renewed" : "active";
  return {
    id,
    arenaId: str(d["arenaId"]),
    customerKey: str(d["customerKey"]),
    athleteId: optStr(d["athleteId"]),
    customerName: str(d["customerName"]) || "Cliente",
    customerPhone: optStr(d["customerPhone"]),
    planId: optStr(d["planId"]),
    planName: str(d["planName"]) || "Plano",
    period,
    dueDay: num(d["dueDay"], 5),
    weeklyHours: contractWeeklyHours(d),
    monthlyPriceReais: num(d["monthlyPriceReais"]),
    startDate: str(d["startDate"]),
    autoRenew: d["autoRenew"] === true,
    paidInstallments: Math.max(0, Math.floor(num(d["paidInstallments"]))),
    status,
    canceledOn: optStr(d["canceledOn"]),
    cancelReason: optStr(d["cancelReason"]),
    renewedFromId: optStr(d["renewedFromId"]),
    renewedToId: optStr(d["renewedToId"]),
    note: optStr(d["note"]),
    createdAt: toIso(d["createdAt"]),
    onlineLink: onlineLinkFrom(d["onlineLink"]),
  };
}

function subscriptionFromDoc(id: string, d: Data): ScheduleSubscriptionRecord {
  return {
    id,
    planId: str(d["planId"]),
    planName: str(d["planName"]) || "Plano de horário",
    holderAthleteId: optStr(d["holderAthleteId"]),
    holderName: str(d["holderName"]) || "Cliente",
    holderPhone: optStr(d["holderPhone"]),
    holderPhotoUrl: optStr(d["holderPhotoUrl"]),
    cycle: str(d["cycle"]) || "monthly",
    monthlyPriceReais: num(d["monthlyPriceReais"]),
    dueDay: num(d["dueDay"], 5),
    weeklyHours: subscriptionWeeklyHours(d),
    status: str(d["status"]),
    endsOn: optStr(d["endsOn"]),
    endRequestedBy: optStr(d["endRequestedBy"]),
    startDate: str(d["startDate"]) || dayKeyFromEventDate(new Date()),
  };
}

function contactFromDoc(id: string, d: Data): CrmContactRecord {
  return {
    id,
    customerKey: str(d["customerKey"]),
    contractId: optStr(d["contractId"]),
    channel: (CRM_CONTACT_CHANNELS as readonly string[]).includes(str(d["channel"])) ? str(d["channel"]) as CrmContactRecord["channel"] : "note",
    reason: (CRM_CONTACT_REASONS as readonly string[]).includes(str(d["reason"])) ? str(d["reason"]) as CrmContactRecord["reason"] : "other",
    outcome: (CRM_CONTACT_OUTCOMES as readonly string[]).includes(str(d["outcome"])) ? str(d["outcome"]) as CrmContactRecord["outcome"] : "done",
    note: optStr(d["note"]),
    at: toIso(d["at"]) ?? new Date(0).toISOString(),
    byName: optStr(d["createdByName"]),
  };
}

function planFromDoc(id: string, d: Data): CrmPlanOption {
  const windows = Array.isArray(d["windows"]) ? (d["windows"] as Data[]) : [];
  const timesPerWeek = num(d["timesPerWeek"], 1);
  return {
    id,
    name: str(d["name"]) || "Plano",
    monthlyPriceReais: num(d["monthlyPriceReais"]),
    timesPerWeek,
    weeklyHours: Math.round(Math.max(1, timesPerWeek) * (num(d["durationMinutes"], 60) || 60) / 30) / 2,
    windows: windows
      .map((w) => ({weekday: num(w["weekday"]), startTime: str(w["startTime"]).slice(0, 5), endTime: str(w["endTime"]).slice(0, 5)}))
      .filter((w) => w.weekday >= 1 && w.weekday <= 7 && w.startTime && w.endTime),
  };
}

/** Nome, foto e telefone dos atletas do app (Admin SDK: o telefone não está no espelho público). */
async function loadIdentities(db: Firestore, athleteIds: string[]): Promise<Map<string, CrmIdentity>> {
  const out = new Map<string, CrmIdentity>();
  const unique = [...new Set(athleteIds)].filter(Boolean);
  for (let i = 0; i < unique.length; i += 300) {
    const refs = unique.slice(i, i + 300).map((uid) => db.collection("users").doc(uid));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const d = (snap.data() ?? {}) as Data;
      out.set(`a:${snap.id}`, {
        name: optStr(d["fullName"]) ?? optStr(d["name"]) ?? optStr(d["nickname"]),
        photoUrl: optStr(d["profilePhotoUrl"]) ?? optStr(d["avatarUrl"]) ?? optStr(d["photoURL"]),
        phone: optStr(d["phoneNumber"]),
      });
    }
  }
  return out;
}

function requireArenaId(raw: unknown): string {
  const arenaId = str((raw as Data | null)?.["arenaId"]);
  if (!arenaId) throw new HttpsError("invalid-argument", "arenaId é obrigatório.");
  return arenaId;
}

// ── Visão geral ───────────────────────────────────────────────────────────────

export interface ArenaCrmOverviewPayload extends CrmOverview {
  settings: {monthlyGoal: number; reminders: ReminderSettings};
  reminders: ReminderOutcome;
  /** Quando as reservas foram lidas (cache de até 30 min). */
  cache: {builtAt: string; fromCache: boolean};
}

export async function getArenaCrmOverviewCore(db: Firestore, uid: string, raw: unknown, now: Date): Promise<ArenaCrmOverviewPayload> {
  const arenaId = requireArenaId(raw);
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "read");
  const loaded = await loadArenaCrmOverview(db, arenaId, now, (raw as Data)["refresh"] === true);
  const {overview} = loaded;
  const sentFrom = Timestamp.fromDate(new Date(now.getTime() - 8 * 86_400_000));
  const sentSnap = await db.collection(CRM_REMINDERS).where("arenaId", "==", arenaId).where("sentAt", ">=", sentFrom).get();
  const sent = sentSnap.docs.map((d) => sentReminderFromDoc(d.data() as Data)).filter((r): r is SentReminder => r !== null);

  // Último lembrete de cada cliente: a fila mostra "lembrete automático enviado".
  const lastByKey = new Map<string, SentReminder>();
  for (const r of sent) {
    const prev = lastByKey.get(r.customerKey);
    if (!prev || r.sentAt > prev.sentAt) lastByKey.set(r.customerKey, r);
  }
  const customers = overview.customers.map((c) => {
    const r = lastByKey.get(c.key);
    return r ? {...c, lastReminder: {kind: r.kind, sentAt: r.sentAt}} : c;
  });
  const lastVisit = new Map(overview.customers.map((c) => [c.key, c.lastVisitDate]));
  return {
    ...overview,
    customers,
    settings: {monthlyGoal: loaded.monthlyGoal, reminders: loaded.reminderSettings},
    reminders: reminderOutcome(sent, new Map(loaded.contracts.map((c) => [c.id, c])), lastVisit, overview.today),
    cache: loaded.cache,
  };
}

function sentReminderFromDoc(d: Data): SentReminder | null {
  const kind = str(d["kind"]);
  if (!(REMINDER_KINDS as readonly string[]).includes(kind)) return null;
  return {
    contractId: str(d["contractId"]),
    customerKey: str(d["customerKey"]),
    kind: kind as ReminderKind,
    refDate: str(d["refDate"]),
    installment: typeof d["installment"] === "number" ? d["installment"] : null,
    sentAt: toIso(d["sentAt"]) ?? new Date(0).toISOString(),
  };
}

/** Lê tudo da arena e monta a visão geral (sem checar acesso: o agendador também usa).
 *  Reservas e perfis vêm do cache (`arena-crm-cache.ts`); o resto é sempre ao vivo. */
export async function loadArenaCrmOverview(db: Firestore, arenaId: string, now: Date, refresh = false): Promise<{
  overview: CrmOverview;
  contracts: CrmContractRecord[];
  monthlyGoal: number;
  reminderSettings: ReminderSettings;
  cache: {builtAt: string; fromCache: boolean};
}> {
  const today = dayKeyFromEventDate(now);
  const arenaRef = db.collection("arenas").doc(arenaId);
  const contactsFrom = Timestamp.fromDate(new Date(now.getTime() - CONTACTS_WINDOW_DAYS * 86_400_000));

  const [contractsSnap, subsSnap, chargesSnap, contactsSnap, plansSnap, settingsSnap, snapshot] = await Promise.all([
    db.collection(CRM_CONTRACTS).where("arenaId", "==", arenaId).get(),
    db.collection(ARENA_SCHEDULE_SUBSCRIPTIONS).where("arenaId", "==", arenaId).get(),
    db.collection(ARENA_SCHEDULE_CHARGES).where("arenaId", "==", arenaId).where("status", "==", "open").get(),
    db.collection(CRM_CONTACTS).where("arenaId", "==", arenaId).where("at", ">=", contactsFrom).get(),
    arenaRef.collection(SCHEDULE_PLANS).where("status", "==", "active").get(),
    arenaRef.collection(CRM_SETTINGS).doc(CRM_SETTINGS_DOC).get(),
    bookingSnapshot(db, arenaId, today, now, refresh, async () => {
      const bookingsSnap = await db.collection(ARENA_BOOKINGS)
        .where("arenaId", "==", arenaId)
        .where("date", ">=", historyStartDate(today))
        .where("date", "<=", today)
        .select(...BOOKING_FIELDS)
        .get();
      const bookings = bookingsSnap.docs.map((d) => d.data() as CrmBookingRecord);
      return {
        stats: aggregateBookings(bookings, today),
        identities: await loadIdentities(db, bookings.flatMap((b) => [
          str(b.athleteId),
          ...bookingPlayersOf(b).map((p) => p.uid),
        ])),
      };
    }),
  ]);

  const contracts = contractsSnap.docs.map((d) => contractFromDoc(d.id, d.data() as Data));
  const subscriptions = subsSnap.docs.map((d) => subscriptionFromDoc(d.id, d.data() as Data));
  const openCharges: ScheduleChargeRecord[] = chargesSnap.docs.map((d) => {
    const c = d.data() as Data;
    return {subscriptionId: str(c["subscriptionId"]), amountReais: num(c["amountReais"]), dueDate: str(c["dueDate"]), status: str(c["status"])};
  });
  const contacts = contactsSnap.docs.map((d) => contactFromDoc(d.id, d.data() as Data));
  const plans = plansSnap.docs.map((d) => planFromDoc(d.id, d.data() as Data));
  const settingsData = (settingsSnap.data() ?? {}) as Data;
  const monthlyGoal = num(settingsData["monthlyGoal"], DEFAULT_MONTHLY_GOAL);
  const reminderSettings = reminderSettingsFrom(settingsData["reminders"]);

  // Mensalista que não reservou nos 6 meses não está no cache: perfil lido ao vivo (poucos).
  const identities = new Map(snapshot.identities);
  const missing = [
    ...contracts.map((c) => c.athleteId ?? ""),
    ...subscriptions.map((s) => s.holderAthleteId ?? ""),
  ].filter((uid) => uid && !identities.has(`a:${uid}`));
  for (const [k, v] of await loadIdentities(db, missing)) identities.set(k, v);
  for (const s of subscriptions) {
    const key = customerKeyOf(s.holderAthleteId, s.holderName);
    const id = key ? identities.get(key) : undefined;
    if (key && id && !id.photoUrl && s.holderPhotoUrl) identities.set(key, {...id, photoUrl: s.holderPhotoUrl});
  }

  const overview = buildOverview({
    today, contracts, subscriptions, openCharges, bookings: [], bookingStats: snapshot.stats, contacts, plans, identities, monthlyGoal,
  });
  return {overview, contracts, monthlyGoal, reminderSettings, cache: {builtAt: snapshot.builtAt, fromCache: snapshot.fromCache}};
}

// ── Ficha do cliente ──────────────────────────────────────────────────────────

export interface CrmCustomerDetail {
  customerKey: string;
  contracts: Array<ReturnType<typeof contractView> & {customerName: string; customerPhone: string | null; cancelReason: string | null}>;
  payments: Array<{id: string; contractId: string; amountReais: number; method: string; paidOn: string; installments: number; byName: string | null}>;
  contacts: CrmContactRecord[];
  /** `guest`: jogou na reserva de outra pessoa (convite ou placar); `bookedBy` = quem reservou. */
  recentBookings: Array<{
    date: string; startTime: string; endTime: string; courtName: string; amountReais: number; plan: boolean; attendance: string;
    guest: boolean; bookedBy: string | null;
  }>;
  reminders: Array<{kind: ReminderKind; sentAt: string; title: string; body: string}>;
}

export async function getArenaCrmCustomerCore(db: Firestore, uid: string, raw: unknown, now: Date): Promise<CrmCustomerDetail> {
  const arenaId = requireArenaId(raw);
  const customerKey = str((raw as Data)["customerKey"]);
  if (!/^[an]:.+/.test(customerKey)) throw new HttpsError("invalid-argument", "Cliente inválido.");
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "read");
  const today = dayKeyFromEventDate(now);
  const athleteId = customerKey.startsWith("a:") ? customerKey.slice(2) : null;

  // Reservas dele e as de outras pessoas em que jogou (convite ou placar). Estas duas não filtram
  // a arena na consulta (o índice de array-contains é o automático): filtra em memória.
  const asGuest = (field: string) => athleteId ?
    db.collection(ARENA_BOOKINGS).where(field, "array-contains", athleteId).get() :
    Promise.resolve(null);
  const [contractsSnap, contactsSnap, bookingsSnap, remindersSnap, invitedSnap, scoredSnap] = await Promise.all([
    db.collection(CRM_CONTRACTS).where("arenaId", "==", arenaId).where("customerKey", "==", customerKey).get(),
    db.collection(CRM_CONTACTS).where("arenaId", "==", arenaId).where("customerKey", "==", customerKey).get(),
    athleteId ?
      db.collection(ARENA_BOOKINGS).where("arenaId", "==", arenaId).where("athleteId", "==", athleteId).get() :
      Promise.resolve(null),
    db.collection(CRM_REMINDERS).where("arenaId", "==", arenaId).where("customerKey", "==", customerKey).get(),
    asGuest("participantUids"),
    asGuest("resultPlayerUids"),
  ]);

  const records = contractsSnap.docs.map((d) => contractFromDoc(d.id, d.data() as Data));
  const paymentSnaps = await Promise.all(records.map((c) => db.collection(CRM_CONTRACTS).doc(c.id).collection(CRM_PAYMENTS).get()));
  const payments = paymentSnaps.flatMap((snap, i) => snap.docs.map((p) => {
    const d = p.data() as Data;
    return {
      id: p.id,
      contractId: records[i]!.id,
      amountReais: num(d["amountReais"]),
      method: str(d["method"]),
      paidOn: str(d["paidOn"]),
      installments: num(d["installments"], 1),
      byName: optStr(d["createdByName"]),
    };
  })).sort((a, b) => b.paidOn.localeCompare(a.paidOn));

  const bookingDocs = new Map<string, Data>();
  for (const d of bookingsSnap?.docs ?? []) bookingDocs.set(d.id, d.data() as Data);
  for (const d of [...(invitedSnap?.docs ?? []), ...(scoredSnap?.docs ?? [])]) {
    const b = d.data() as Data;
    if (str(b["arenaId"]) === arenaId && !bookingDocs.has(d.id)) bookingDocs.set(d.id, b);
  }
  const recentBookings = [...bookingDocs.values()]
    .filter((b) => !["cancelled", "canceled"].includes(str(b["status"]).toLowerCase()) && str(b["date"]) <= addDays(today, 30))
    .sort((a, b) => `${str(b["date"])}${str(b["startTime"])}`.localeCompare(`${str(a["date"])}${str(a["startTime"])}`))
    .slice(0, 20)
    .map((b) => ({
      date: str(b["date"]),
      startTime: str(b["startTime"]).slice(0, 5),
      endTime: str(b["endTime"]).slice(0, 5),
      courtName: str(b["courtName"]) || "Quadra",
      // Convidado não pagou a reserva: o valor é de quem reservou.
      amountReais: str(b["athleteId"]) !== athleteId ? 0 : num(b["amountReais"]),
      plan: b["isRecurring"] === true || b["coveredByPlan"] === true,
      attendance: str(b["attendanceStatus"]) || "pending",
      guest: str(b["athleteId"]) !== athleteId,
      bookedBy: str(b["athleteId"]) !== athleteId ? optStr(b["customerName"]) : null,
    }));

  return {
    customerKey,
    contracts: records
      .map((c) => ({...contractView(c, today), customerName: c.customerName, customerPhone: c.customerPhone, cancelReason: c.cancelReason}))
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    payments,
    contacts: contactsSnap.docs.map((d) => contactFromDoc(d.id, d.data() as Data)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50),
    recentBookings,
    reminders: remindersSnap.docs
      .map((d) => d.data() as Data)
      .filter((r) => (REMINDER_KINDS as readonly string[]).includes(str(r["kind"])))
      .map((r) => ({kind: str(r["kind"]) as ReminderKind, sentAt: toIso(r["sentAt"]) ?? "", title: str(r["title"]), body: str(r["body"])}))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
      .slice(0, 30),
  };
}

// ── Escritas ──────────────────────────────────────────────────────────────────

async function actorName(db: Firestore, uid: string): Promise<string | null> {
  const snap = await db.collection("users").doc(uid).get();
  const d = (snap.data() ?? {}) as Data;
  return optStr(d["fullName"]) ?? optStr(d["name"]) ?? optStr(d["nickname"]);
}

function money(v: unknown, field: string): number {
  const n = typeof v === "number" ? v : Number.NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100_000) throw new HttpsError("invalid-argument", `${field} inválido.`);
  return Math.round(n * 100) / 100;
}

interface ContractInput {
  contractId: string | null;
  athleteId: string | null;
  customerName: string;
  customerPhone: string | null;
  planId: string | null;
  planName: string;
  period: CrmContractRecord["period"];
  dueDay: number;
  weeklyHours: number;
  monthlyPriceReais: number;
  startDate: string;
  autoRenew: boolean;
  note: string | null;
}

export function parseContractInput(d: Data): ContractInput {
  const customerName = str(d["customerName"]).slice(0, 120);
  const athleteId = optStr(d["athleteId"]);
  if (!customerName && !athleteId) throw new HttpsError("invalid-argument", "Informe o cliente.");
  const planName = str(d["planName"]).slice(0, 80);
  if (!planName) throw new HttpsError("invalid-argument", "Informe o plano.");
  const dueDay = num(d["dueDay"]);
  if (!(CRM_DUE_DAYS as readonly number[]).includes(dueDay)) throw new HttpsError("invalid-argument", "Vencimento deve ser dia 5, 15 ou 25.");
  // Portal antigo ainda manda "vezes por semana": cada vez vale 1h.
  const weeklyHours = d["weeklyHours"] !== undefined ? num(d["weeklyHours"]) : Math.floor(num(d["timesPerWeek"]));
  if (!(weeklyHours >= MIN_WEEKLY_HOURS && weeklyHours <= MAX_WEEKLY_HOURS) || weeklyHours * 2 !== Math.round(weeklyHours * 2)) {
    throw new HttpsError("invalid-argument", `Horas por semana: de ${MIN_WEEKLY_HOURS}h a ${MAX_WEEKLY_HOURS}h, de meia em meia hora.`);
  }
  const startDate = str(d["startDate"]);
  if (!isDateKey(startDate)) throw new HttpsError("invalid-argument", "Data de início inválida.");
  const phone = optStr(d["customerPhone"]);
  if (phone && !whatsappDigits(phone)) throw new HttpsError("invalid-argument", "Telefone inválido. Use DDD + número.");
  return {
    contractId: optStr(d["contractId"]),
    athleteId,
    customerName,
    customerPhone: phone,
    planId: optStr(d["planId"]),
    planName,
    period: oneOf(d["period"], CRM_PERIODS, "Período"),
    dueDay,
    weeklyHours,
    monthlyPriceReais: money(d["monthlyPriceReais"], "Valor mensal"),
    startDate,
    autoRenew: d["autoRenew"] === true,
    note: optStr(d["note"])?.slice(0, 500) ?? null,
  };
}

async function saveContract(db: Firestore, arenaId: string, uid: string, d: Data, today: string, deps: CrmBillingDeps): Promise<{contractId: string}> {
  const input = parseContractInput(d);
  let customerName = input.customerName;
  if (input.athleteId) {
    const user = await db.collection("users").doc(input.athleteId).get();
    if (!user.exists) throw new HttpsError("not-found", "Atleta não encontrado.");
    const u = (user.data() ?? {}) as Data;
    customerName ||= optStr(u["fullName"]) ?? optStr(u["name"]) ?? "Cliente";
  }
  const customerKey = customerKeyOf(input.athleteId, customerName)!;

  const existing = await db.collection(CRM_CONTRACTS).where("arenaId", "==", arenaId).where("customerKey", "==", customerKey).get();
  const clash = existing.docs
    .map((s) => contractFromDoc(s.id, s.data() as Data))
    .find((c) => c.id !== input.contractId && c.status === "active" && !c.renewedToId && contractView(c, today).status !== "not_renewed");
  if (clash) throw new HttpsError("failed-precondition", "Esse cliente já tem um contrato ativo. Renove ou edite o atual.");

  const fields = {
    arenaId,
    customerKey,
    athleteId: input.athleteId,
    customerName,
    customerPhone: input.customerPhone,
    planId: input.planId,
    planName: input.planName,
    period: input.period,
    dueDay: input.dueDay,
    weeklyHours: input.weeklyHours,
    monthlyPriceReais: input.monthlyPriceReais,
    startDate: input.startDate,
    autoRenew: input.autoRenew,
    note: input.note,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  };

  if (input.contractId) {
    const ref = db.collection(CRM_CONTRACTS).doc(input.contractId);
    const snap = await ref.get();
    if (!snap.exists || str((snap.data() as Data)["arenaId"]) !== arenaId) throw new HttpsError("not-found", "Contrato não encontrado.");
    await ref.set(fields, {merge: true});
    // Valor, início ou vencimento podem ter mudado: o link aberto cobraria errado.
    const link = onlineLinkFrom((snap.data() as Data)["onlineLink"]);
    if (link) await voidLink(db, ref.id, link, "contract_edited", deps);
    return {contractId: ref.id};
  }
  const ref = db.collection(CRM_CONTRACTS).doc();
  await ref.set({
    ...fields,
    status: "active",
    paidInstallments: 0,
    canceledOn: null,
    cancelReason: null,
    renewedFromId: null,
    renewedToId: null,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: uid,
    createdByName: await actorName(db, uid),
  });
  return {contractId: ref.id};
}

async function loadContract(db: Firestore, arenaId: string, contractId: unknown): Promise<CrmContractRecord> {
  const id = str(contractId);
  if (!id) throw new HttpsError("invalid-argument", "contractId é obrigatório.");
  const snap = await db.collection(CRM_CONTRACTS).doc(id).get();
  const data = snap.data() as Data | undefined;
  if (!snap.exists || !data || str(data["arenaId"]) !== arenaId) throw new HttpsError("not-found", "Contrato não encontrado.");
  return contractFromDoc(id, data);
}

async function cancelContract(db: Firestore, arenaId: string, uid: string, d: Data, today: string): Promise<{contractId: string}> {
  const c = await loadContract(db, arenaId, d["contractId"]);
  if (c.status === "canceled") return {contractId: c.id};
  await db.collection(CRM_CONTRACTS).doc(c.id).set({
    status: "canceled",
    canceledOn: today,
    cancelReason: optStr(d["reason"])?.slice(0, 300) ?? null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  }, {merge: true});
  return {contractId: c.id};
}

async function renewContract(db: Firestore, arenaId: string, uid: string, d: Data, today: string): Promise<{contractId: string}> {
  const contractId = str(d["contractId"]);
  if (!contractId) throw new HttpsError("invalid-argument", "contractId é obrigatório.");
  const byName = await actorName(db, uid);
  return db.runTransaction(async (tx) => {
    const oldRef = db.collection(CRM_CONTRACTS).doc(contractId);
    const snap = await tx.get(oldRef);
    const data = snap.data() as Data | undefined;
    if (!snap.exists || !data || str(data["arenaId"]) !== arenaId) throw new HttpsError("not-found", "Contrato não encontrado.");
    const old = contractFromDoc(oldRef.id, data);
    if (old.status === "canceled") throw new HttpsError("failed-precondition", "Contrato cancelado não renova. Crie um novo.");
    if (old.renewedToId) throw new HttpsError("failed-precondition", "Esse contrato já foi renovado.");

    const period = d["period"] !== undefined ? oneOf(d["period"], CRM_PERIODS, "Período") : old.period;
    const dueDay = d["dueDay"] !== undefined ? num(d["dueDay"]) : old.dueDay;
    if (!(CRM_DUE_DAYS as readonly number[]).includes(dueDay)) throw new HttpsError("invalid-argument", "Vencimento deve ser dia 5, 15 ou 25.");
    const price = d["monthlyPriceReais"] !== undefined ? money(d["monthlyPriceReais"], "Valor mensal") : old.monthlyPriceReais;
    const newRef = db.collection(CRM_CONTRACTS).doc();
    tx.set(newRef, {
      arenaId,
      customerKey: old.customerKey,
      athleteId: old.athleteId,
      customerName: old.customerName,
      customerPhone: old.customerPhone,
      planId: old.planId,
      planName: old.planName,
      period,
      dueDay,
      weeklyHours: old.weeklyHours,
      monthlyPriceReais: price,
      startDate: renewalStartDate(old, today),
      autoRenew: d["autoRenew"] !== undefined ? d["autoRenew"] === true : old.autoRenew,
      note: old.note,
      status: "active",
      paidInstallments: 0,
      canceledOn: null,
      cancelReason: null,
      renewedFromId: old.id,
      renewedToId: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      createdByName: byName,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });
    tx.set(oldRef, {renewedToId: newRef.id, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid}, {merge: true});
    return {contractId: newRef.id};
  });
}

async function registerPayment(db: Firestore, arenaId: string, uid: string, d: Data, today: string): Promise<{paidInstallments: number}> {
  const installments = Math.floor(num(d["installments"], 1));
  if (installments < 1 || installments > 12) throw new HttpsError("invalid-argument", "Parcelas devem ser de 1 a 12.");
  const method = oneOf(d["method"], CRM_PAYMENT_METHODS, "Forma de pagamento");
  const paidOn = str(d["paidOn"]) || today;
  if (!isDateKey(paidOn) || paidOn > today) throw new HttpsError("invalid-argument", "Data do pagamento inválida.");
  const contractId = str(d["contractId"]);
  if (!contractId) throw new HttpsError("invalid-argument", "contractId é obrigatório.");
  const byName = await actorName(db, uid);

  return db.runTransaction(async (tx) => {
    const ref = db.collection(CRM_CONTRACTS).doc(contractId);
    const snap = await tx.get(ref);
    const data = snap.data() as Data | undefined;
    if (!snap.exists || !data || str(data["arenaId"]) !== arenaId) throw new HttpsError("not-found", "Contrato não encontrado.");
    const c = contractFromDoc(ref.id, data);
    if (c.status === "canceled") throw new HttpsError("failed-precondition", "Contrato cancelado.");
    const total = c.autoRenew ? Number.POSITIVE_INFINITY : periodMonths(c.period);
    const remaining = total - c.paidInstallments;
    if (remaining <= 0) throw new HttpsError("failed-precondition", "Todas as parcelas deste contrato já estão pagas.");
    const count = Math.min(installments, remaining);
    const amountReais = d["amountReais"] !== undefined ? money(d["amountReais"], "Valor") : Math.round(count * c.monthlyPriceReais * 100) / 100;
    const paidInstallments = c.paidInstallments + count;
    tx.set(ref, {paidInstallments, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid}, {merge: true});
    tx.set(ref.collection(CRM_PAYMENTS).doc(), {
      arenaId,
      installments: count,
      fromInstallment: c.paidInstallments,
      amountReais,
      method,
      paidOn,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
      createdByName: byName,
    });
    return {paidInstallments};
  });
}

async function logContact(db: Firestore, arenaId: string, uid: string, d: Data): Promise<{contactId: string}> {
  const customerKey = str(d["customerKey"]);
  if (!/^[an]:.+/.test(customerKey) || customerKey.length > 200) throw new HttpsError("invalid-argument", "Cliente inválido.");
  const ref = db.collection(CRM_CONTACTS).doc();
  await ref.set({
    arenaId,
    customerKey,
    contractId: optStr(d["contractId"]),
    channel: oneOf(d["channel"], CRM_CONTACT_CHANNELS, "Canal"),
    reason: oneOf(d["reason"], CRM_CONTACT_REASONS, "Motivo"),
    outcome: oneOf(d["outcome"], CRM_CONTACT_OUTCOMES, "Resultado"),
    note: optStr(d["note"])?.slice(0, 500) ?? null,
    at: FieldValue.serverTimestamp(),
    createdBy: uid,
    createdByName: await actorName(db, uid),
  });
  return {contactId: ref.id};
}

async function saveSettings(db: Firestore, arenaId: string, uid: string, d: Data): Promise<{saved: true}> {
  const patch: Data = {updatedAt: FieldValue.serverTimestamp(), updatedBy: uid};
  if (d["monthlyGoal"] !== undefined) {
    const monthlyGoal = Math.floor(num(d["monthlyGoal"], -1));
    if (monthlyGoal < 0 || monthlyGoal > 500) throw new HttpsError("invalid-argument", "Meta inválida.");
    patch["monthlyGoal"] = monthlyGoal;
  }
  if (d["reminders"] !== undefined) {
    const raw = d["reminders"];
    if (raw == null || typeof raw !== "object") throw new HttpsError("invalid-argument", "Lembretes inválidos.");
    patch["reminders"] = reminderSettingsFrom(raw);
  }
  await db.collection("arenas").doc(arenaId).collection(CRM_SETTINGS).doc(CRM_SETTINGS_DOC).set(patch, {merge: true});
  return {saved: true};
}

export const CRM_OPS = [
  "saveContract", "cancelContract", "renewContract", "registerPayment", "logContact", "saveSettings",
  "createPaymentLink", "cancelPaymentLink",
] as const;

async function paymentLinkOp(
  db: Firestore, arenaId: string, uid: string, d: Data, create: boolean, deps: CrmBillingDeps,
): Promise<unknown> {
  const contractId = str(d["contractId"]);
  if (!contractId) throw new HttpsError("invalid-argument", "contractId é obrigatório.");
  const snap = await db.collection(CRM_CONTRACTS).doc(contractId).get();
  const data = snap.data() as Data | undefined;
  if (!snap.exists || !data || str(data["arenaId"]) !== arenaId) throw new HttpsError("not-found", "Contrato não encontrado.");
  const contract = contractFromDoc(contractId, data);
  if (create) return createCrmPaymentLink(db, arenaId, uid, await actorName(db, uid), d, contract, data["onlineLink"], deps);
  const link = onlineLinkFrom(data["onlineLink"]);
  if (link) await voidLink(db, contractId, link, "canceled_by_arena", deps, true);
  return {canceled: !!link};
}

export async function updateArenaCrmCore(
  db: Firestore, uid: string, raw: unknown, now: Date, deps: CrmBillingDeps = defaultCrmBillingDeps,
): Promise<unknown> {
  const arenaId = requireArenaId(raw);
  const d = raw as Data;
  const op = oneOf(d["op"], CRM_OPS, "Operação");
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");
  const today = dayKeyFromEventDate(now);
  switch (op) {
  case "saveContract": return saveContract(db, arenaId, uid, d, today, deps);
  case "cancelContract": {
    const r = await cancelContract(db, arenaId, uid, d, today);
    await voidStaleLink(db, r.contractId, deps);
    return r;
  }
  case "renewContract": return renewContract(db, arenaId, uid, d, today);
  case "registerPayment": {
    const r = await registerPayment(db, arenaId, uid, d, today);
    // Baixa manual: o link que cobrava essas parcelas sai do ar.
    await voidStaleLink(db, str(d["contractId"]), deps);
    return r;
  }
  case "logContact": return logContact(db, arenaId, uid, d);
  case "saveSettings": return saveSettings(db, arenaId, uid, d);
  case "createPaymentLink": return paymentLinkOp(db, arenaId, uid, d, true, deps);
  case "cancelPaymentLink": return paymentLinkOp(db, arenaId, uid, d, false, deps);
  }
}

function requireUid(request: {auth?: {uid?: string} | null}): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

export const getArenaCrmOverview = onCall({region: CLIENT_FACING_REGIONS, memory: "512MiB", timeoutSeconds: 120}, async (request) =>
  getArenaCrmOverviewCore(getFirestore(), requireUid(request), request.data, new Date()));

export const getArenaCrmCustomer = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  getArenaCrmCustomerCore(getFirestore(), requireUid(request), request.data, new Date()));

export const updateArenaCrm = onCall({region: CLIENT_FACING_REGIONS, secrets: asaasArenaSecrets}, async (request) =>
  updateArenaCrmCore(getFirestore(), requireUid(request), request.data, new Date()));
