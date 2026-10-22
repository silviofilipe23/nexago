/**
 * Automação do repasse ao professor (liga só o owner, em `settings/payouts`):
 * - Fechamento automático: a partir do `closeDay`, fecha o mês anterior de cada professor com regra
 *   (o mesmo cálculo do portal). Repasse já fechado/pago à mão não é tocado. Marca
 *   `payoutRuns/{mês}` para não fechar de novo e avisa o owner com o resumo.
 * - Pagamento automático: o fechamento automático grava `autoPayAt` (hoje + prazo de conferência);
 *   vencido o prazo, paga pelo NexaGO o que ninguém segurou (`autoPayHold`), dentro do teto. Falha
 *   de pré-condição (professor sem conta aprovada, por exemplo) fica em `autoPayError` e o owner é
 *   avisado — não tenta de novo sozinho.
 * Refazer o fechamento à mão tira o repasse do automático (o portal regrava sem `autoPayAt`).
 */
import * as logger from "firebase-functions/logger";
import {HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {Timestamp, getFirestore, type DocumentReference, type Firestore} from "firebase-admin/firestore";
import {asaasArenaSecrets} from "./asaas-client";
import {WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {PROFESSOR_SECRETS_KEY} from "./professor-secret-box";
import {TRAINING_CENTERS, brlFromCents} from "./training-center-billing-model";
import {
  addDays,
  autoPayBlock,
  computePayout,
  monthRangeOf,
  monthToClose,
  readAutomation,
  readPayRule,
  type PayoutCalc,
} from "./training-center-payout-model";
import {defaultPayoutTransferDeps, payPayoutAs, type PayoutTransferDeps} from "./training-center-payout-transfer";
import {dayKeyIn} from "./training-center-waitlist-model";

type Data = Record<string, unknown>;

export const CENTER_PAYOUT_AUTOMATION_TYPE = "training_center_payout_automation";
const AUTO = {uid: "system", name: "Automático"};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function monthTitle(month: string): string {
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${names[Number(month.slice(5, 7)) - 1] ?? month}/${month.slice(0, 4)}`;
}

function shortDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

function audit(at: Timestamp, action: string, entityId: string, detail: string): Data {
  return {at, actorUid: AUTO.uid, actorName: AUTO.name, action, entity: "payout", entityId, detail, reason: ""};
}

const docs = async (ref: DocumentReference, sub: string) => (await ref.collection(sub).get()).docs.map((d) => ({id: d.id, data: d.data()}));

export interface CloseResult {
  month: string;
  closed: number;
  totalCents: number;
  pendingAttendance: number;
  autoPayAt: string | null;
}

/** Fecha o mês de cada professor com regra (só os que ainda não têm repasse). */
export async function autoCloseMonth(db: Firestore, centerRef: DocumentReference, center: Data, month: string, today: string, reviewDays: number | null, now: Date): Promise<CloseResult> {
  const tz = str(center["timezone"]);
  const {from, to} = monthRangeOf(month);
  const [rules, members, classes, enrollments, invoices, sessionsSnap] = await Promise.all([
    docs(centerRef, "payRules"),
    docs(centerRef, "centerMembers"),
    docs(centerRef, "classes"),
    docs(centerRef, "enrollments"),
    docs(centerRef, "invoices"),
    centerRef.collection("sessions").where("date", ">=", from).where("date", "<=", to).get(),
  ]);
  const sessions = sessionsSnap.docs.map((d) => ({id: d.id, data: d.data()}));
  const nameOf = (uid: string) =>
    str(members.find((m) => m.id === uid)?.data["displayName"]) ||
    str(sessions.find((s) => s.data["coachUid"] === uid)?.data["coachName"]) || "Professor";
  const autoPayAt = reviewDays == null ? null : addDays(today, reviewDays);
  const at = Timestamp.fromDate(now);
  const result: CloseResult = {month, closed: 0, totalCents: 0, pendingAttendance: 0, autoPayAt};

  for (const r of rules) {
    const rule = readPayRule(r.data);
    if (rule.kind === "none") continue;
    const calc: PayoutCalc = computePayout({
      coachUid: r.id, rule, month, today, sessions, classes, enrollments, invoices, dayOf: (d) => dayKeyIn(d, tz),
    });
    result.pendingAttendance += calc.pendingAttendance;
    if (calc.totalCents <= 0) continue;
    const ref = centerRef.collection("payouts").doc(`${month}_${r.id}`);
    const created = await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return false;
      tx.set(ref, {
        month, coachUid: r.id, coachName: nameOf(r.id), rule: {...rule},
        classesGiven: calc.classesGiven, baseCents: calc.baseCents, totalCents: calc.totalCents,
        lines: calc.lines.map((l) => ({...l})),
        status: "closed", closedAt: at, closedByName: AUTO.name, closedBy: "auto",
        paidAt: null, paidOn: "", paidByName: "", paidMethod: "", note: "",
        // O repasse do próprio owner não sai pelo NexaGO (não transfere para si mesmo).
        ...(autoPayAt && r.id !== str(center["ownerUid"]) ? {autoPayAt, autoPayHold: false} : {}),
      });
      tx.set(centerRef.collection("auditLogs").doc(), audit(at, "payout.auto_closed", ref.id,
        `${nameOf(r.id)} · ${monthTitle(month)} · ${brlFromCents(calc.totalCents)}${autoPayAt ? ` · paga sozinho em ${shortDay(autoPayAt)}` : ""}`));
      return true;
    });
    if (created) {
      result.closed++;
      result.totalCents += calc.totalCents;
    }
  }
  await centerRef.collection("payoutRuns").doc(month).set({
    month, closedAt: at, closed: result.closed, totalCents: result.totalCents, pendingAttendance: result.pendingAttendance, autoPayAt,
  });
  return result;
}

export interface AutomationResult {
  close: CloseResult | null;
  paid: number;
  pending: number;
  blocked: {name: string; reason: string}[];
}

export async function runCenterPayoutAutomation(db: Firestore, centerId: string, center: Data, deps: PayoutTransferDeps): Promise<AutomationResult> {
  const centerRef = db.collection(TRAINING_CENTERS).doc(centerId);
  const settings = readAutomation((await centerRef.collection("settings").doc("payouts").get()).data());
  const now = deps.now();
  const today = dayKeyIn(now, str(center["timezone"]));
  const out: AutomationResult = {close: null, paid: 0, pending: 0, blocked: []};

  const month = monthToClose(settings, today);
  if (month && !(await centerRef.collection("payoutRuns").doc(month).get()).exists) {
    out.close = await autoCloseMonth(db, centerRef, center, month, today, settings.autoPay ? settings.reviewDays : null, now);
  }

  if (settings.autoPay) {
    const closed = await centerRef.collection("payouts").where("status", "==", "closed").get();
    for (const doc of closed.docs) {
      const p = doc.data();
      if (autoPayBlock(p, settings, today)) continue;
      try {
        const r = await payPayoutAs(db, AUTO, centerId, doc.id, deps);
        if (r.transferStatus === "done") out.paid++;
        else if (r.transferStatus === "pending") out.pending++;
        else out.blocked.push({name: str(p["coachName"]), reason: r.message});
        if (r.transferStatus === "failed" || r.transferStatus === "unknown") await doc.ref.update({autoPayError: r.message.slice(0, 200)});
      } catch (e) {
        const reason = e instanceof HttpsError ? e.message : "erro inesperado";
        out.blocked.push({name: str(p["coachName"]), reason});
        await doc.ref.update({autoPayError: reason.slice(0, 200)});
        if (!(e instanceof HttpsError)) logger.warn(`payoutAutomation ${doc.ref.path}`, e);
      }
    }
  }

  // Resumo para o owner (só quando algo aconteceu).
  const ownerUid = str(center["ownerUid"]);
  const parts: string[] = [];
  if (out.close && out.close.closed > 0) {
    parts.push(`${out.close.closed} ${out.close.closed === 1 ? "repasse fechado" : "repasses fechados"} (${brlFromCents(out.close.totalCents)})` +
      (out.close.autoPayAt ? ` · paga sozinho em ${shortDay(out.close.autoPayAt)}; segure na tela Repasses se precisar` : ""));
    const n = out.close.pendingAttendance;
    if (n) parts.push(n === 1 ? "1 aula sem chamada finalizada ficou de fora" : `${n} aulas sem chamada finalizada ficaram de fora`);
  }
  if (out.paid + out.pending > 0) parts.push(`${out.paid + out.pending} ${out.paid + out.pending === 1 ? "transferência enviada" : "transferências enviadas"}${out.pending ? " (confirme o SMS no app do Asaas, se pedir)" : ""}`);
  if (out.blocked.length) parts.push(`${out.blocked.length} não saiu sozinho: ${out.blocked.map((b) => `${b.name} — ${b.reason}`).join("; ")}`.slice(0, 300));
  if (ownerUid && parts.length) {
    await deps.notify({
      userId: ownerUid,
      title: out.close && out.close.closed ? `Repasses de ${monthTitle(out.close.month)}` : "Repasses aos professores",
      body: parts.join(" · "),
      type: CENTER_PAYOUT_AUTOMATION_TYPE,
      data: {centerId},
    }).catch((e) => logger.warn(`payoutAutomation ${centerId}: push ao owner falhou`, e));
  }
  return out;
}

export async function runTrainingCenterPayoutAutomationCore(db: Firestore, deps: PayoutTransferDeps = defaultPayoutTransferDeps): Promise<number> {
  const centers = await db.collection(TRAINING_CENTERS).where("status", "==", "active").get();
  let acted = 0;
  for (const c of centers.docs) {
    try {
      const r = await runCenterPayoutAutomation(db, c.id, c.data(), deps);
      if ((r.close?.closed ?? 0) + r.paid + r.pending > 0) acted++;
    } catch (e) {
      logger.error(`runTrainingCenterPayoutAutomation ${c.id}`, e);
    }
  }
  return acted;
}

export const runTrainingCenterPayoutAutomation = onSchedule({
  schedule: "0 8 * * *",
  timeZone: "America/Sao_Paulo",
  timeoutSeconds: 540,
  secrets: [...asaasArenaSecrets, PROFESSOR_SECRETS_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async () => {
  await runTrainingCenterPayoutAutomationCore(getFirestore());
});
