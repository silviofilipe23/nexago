/**
 * CRM da arena — envio diário dos lembretes automáticos (9h, São Paulo).
 *
 * 1. Para cada contrato ativo do CRM com atleta do app: no máximo um push por dia (o mais urgente
 *    de `planContractReminders`). O doc `arenaCrmReminders/{contrato}_{tipo}_{data}` é criado com
 *    `create` ANTES do push: se já existe, o lembrete já saiu (idempotente, no máximo uma vez).
 * 2. Resumo do dia para o dono e os gestores ativos da arena (só arenas que usam o CRM).
 */
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {dayKeyFromEventDate} from "./event-timezone";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {CRM_CONTRACTS, CRM_SETTINGS, CRM_SETTINGS_DOC, addDays, type CrmContractRecord} from "./arena-crm-model";
import {contractFromDoc, loadArenaCrmOverview} from "./arena-crm";
import {
  CRM_REMINDERS,
  planContractReminders,
  reminderDocId,
  reminderSettingsFrom,
  teamDigest,
} from "./arena-crm-reminders-model";

type Data = Record<string, unknown>;

/** Quanto do histórico olhar para achar o último jogo (sumido há mais que isso conta da data de início). */
const LAST_VISIT_WINDOW_DAYS = 60;
const CANCELLED = new Set(["cancelled", "canceled"]);
const CUSTOMER_SOURCES = new Set(["platform", "manual", ""]);

export interface CrmPushInput {
  userId: string;
  title: string;
  body: string;
  type: string;
  data: Record<string, string>;
}

/** Trocável no teste. */
export const crmNotifier = {
  send: (input: CrmPushInput) => deliverNotificationToUser({...input, requireInteraction: false}),
};

export interface CrmRemindersResult {
  arenas: number;
  sent: number;
  skipped: number;
  digests: number;
  failed: number;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** `create` falha se o doc existe: é assim que o mesmo lembrete não sai duas vezes. */
async function claim(db: Firestore, id: string, data: Data): Promise<boolean> {
  try {
    await db.collection(CRM_REMINDERS).doc(id).create({...data, sentAt: FieldValue.serverTimestamp()});
    return true;
  } catch (err) {
    const code = (err as {code?: unknown}).code;
    if (code === 6 || code === "already-exists" || /already exists/i.test(String((err as Error).message))) return false;
    throw err;
  }
}

/** Último jogo de cada atleta na arena nos últimos 60 dias (no_show não conta). */
async function lastVisits(db: Firestore, arenaId: string, today: string): Promise<Map<string, string>> {
  const snap = await db.collection("arenaBookings")
    .where("arenaId", "==", arenaId)
    .where("date", ">=", addDays(today, -LAST_VISIT_WINDOW_DAYS))
    .where("date", "<=", today)
    .select("athleteId", "date", "status", "attendanceStatus", "source", "bookedAs")
    .get();
  const out = new Map<string, string>();
  for (const doc of snap.docs) {
    const b = doc.data() as Data;
    const uid = str(b["athleteId"]);
    const date = str(b["date"]);
    if (!uid || !date) continue;
    if (CANCELLED.has(str(b["status"]).toLowerCase())) continue;
    if (!CUSTOMER_SOURCES.has(str(b["source"])) || str(b["bookedAs"]) === "professor") continue;
    if (str(b["attendanceStatus"]).toLowerCase() === "no_show") continue;
    if (!out.has(uid) || date > out.get(uid)!) out.set(uid, date);
  }
  return out;
}

/** Dono + gestores ativos (quem opera o CRM inteiro). */
async function digestRecipients(db: Firestore, arenaId: string, arena: Data): Promise<string[]> {
  const ids = new Set<string>();
  const owner = str(arena["managerUserId"]);
  if (owner) ids.add(owner);
  const staff = await db.collection("arenas").doc(arenaId).collection("staff").where("status", "==", "active").get();
  for (const s of staff.docs) if ((s.data() as Data)["role"] === "gestor") ids.add(s.id);
  return [...ids];
}

export async function runArenaCrmReminders(db: Firestore, now: Date): Promise<CrmRemindersResult> {
  const today = dayKeyFromEventDate(now);
  const result: CrmRemindersResult = {arenas: 0, sent: 0, skipped: 0, digests: 0, failed: 0};

  const snap = await db.collection(CRM_CONTRACTS).where("status", "==", "active").get();
  const byArena = new Map<string, CrmContractRecord[]>();
  for (const doc of snap.docs) {
    const c = contractFromDoc(doc.id, doc.data() as Data);
    if (!c.arenaId) continue;
    byArena.set(c.arenaId, [...(byArena.get(c.arenaId) ?? []), c]);
  }

  for (const [arenaId, contracts] of byArena) {
    result.arenas += 1;
    try {
      const arenaRef = db.collection("arenas").doc(arenaId);
      const [arenaSnap, settingsSnap] = await Promise.all([arenaRef.get(), arenaRef.collection(CRM_SETTINGS).doc(CRM_SETTINGS_DOC).get()]);
      if (!arenaSnap.exists) continue;
      const arena = (arenaSnap.data() ?? {}) as Data;
      const arenaName = str(arena["name"]) || "arena";
      const settings = reminderSettingsFrom(((settingsSnap.data() ?? {}) as Data)["reminders"]);
      const visits = settings.absence ? await lastVisits(db, arenaId, today) : new Map<string, string>();

      for (const c of contracts) {
        const lastVisit = c.athleteId ? visits.get(c.athleteId) ?? null : null;
        for (const r of planContractReminders(c, today, arenaName, lastVisit, settings)) {
          const fresh = await claim(db, reminderDocId(c.id, r.kind, r.refDate), {
            arenaId,
            contractId: c.id,
            customerKey: c.customerKey,
            athleteId: c.athleteId,
            kind: r.kind,
            refDate: r.refDate,
            installment: r.installment,
            title: r.title,
            body: r.body,
            dayKey: today,
          });
          if (!fresh) {
            result.skipped += 1;
            continue;
          }
          try {
            await crmNotifier.send({
              userId: c.athleteId!,
              title: r.title,
              body: r.body,
              type: `arena_crm_${r.kind}`,
              data: {url: `/arena/${arenaId}`, arenaId},
            });
            result.sent += 1;
          } catch (err) {
            result.failed += 1;
            logger.warn("arena-crm-reminders: push falhou", {arenaId, contractId: c.id, kind: r.kind, error: err});
          }
        }
      }

      if (settings.teamDigest) {
        const {overview} = await loadArenaCrmOverview(db, arenaId, now);
        const digest = teamDigest(overview, arenaName);
        if (digest && await claim(db, `digest_${arenaId}_${today}`, {arenaId, kind: "digest", dayKey: today, title: digest.title, body: digest.body})) {
          for (const userId of await digestRecipients(db, arenaId, arena)) {
            try {
              await crmNotifier.send({userId, ...digest, type: "arena_crm_digest", data: {arenaId, webUrl: "/painel/clientes"}});
            } catch (err) {
              logger.warn("arena-crm-reminders: resumo falhou", {arenaId, userId, error: err});
            }
          }
          result.digests += 1;
        }
      }
    } catch (err) {
      result.failed += 1;
      logger.error("arena-crm-reminders: arena falhou", {arenaId, error: err});
    }
  }
  return result;
}

export const sendArenaCrmReminders = onSchedule({
  schedule: "every day 09:00",
  timeZone: "America/Sao_Paulo",
  timeoutSeconds: 540,
  memory: "512MiB",
  secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  const result = await runArenaCrmReminders(getFirestore(), new Date());
  logger.info("sendArenaCrmReminders", result);
});
