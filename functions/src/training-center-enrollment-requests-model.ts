/**
 * Regras puras dos pedidos de trancamento, pausa por lesão e cancelamento da matrícula do CT
 * (`trainingCenters/{c}/enrollmentRequests/{id}`). Sem Firestore aqui: a callable e a rodada
 * diária (training-center-enrollment-requests.ts) leem, decidem com estas funções e gravam.
 *
 * Datas são dias `YYYY-MM-DD` na parede do centro.
 *   pausa:        startsOn … endsOn (inclusive) → matrícula `paused` com `pausedUntil = endsOn + 1`
 *                 (a rodada diária a reativa nesse dia).
 *   cancelamento: `lastDay` é o último dia de aula; mensal no fim do ciclo = véspera do próximo
 *                 vencimento (a assinatura fica `canceling` com `cancelAt` nesse vencimento).
 */
import {addDays, daysBetween} from "./training-center-subscription-model";

type Data = Record<string, unknown>;

export const ENROLLMENT_REQUESTS = "enrollmentRequests";

export type EnrollmentRequestType = "pause" | "injury" | "cancel";
export type EnrollmentRequestStatus =
  | "pending" // pausa por lesão esperando a gestão revisar o atestado
  | "needs_document" // gestão pediu outro documento
  | "scheduled" // pausa aprovada que começa depois / cancelamento em aviso
  | "active" // pausa em curso
  | "rejected"
  | "withdrawn" // aluno (ou gestão) desfez
  | "retained" // aluno aceitou uma oferta de retenção em vez de cancelar
  | "done";

export const OPEN_REQUEST_STATUSES: EnrollmentRequestStatus[] = ["pending", "needs_document", "scheduled", "active"];
/** Pausas que contam no limite do ano. */
const COUNTED_STATUSES = new Set(["scheduled", "active", "done"]);

export const CANCEL_REASONS: Record<string, string> = {
  price: "Preço",
  schedule: "Horário não funciona mais",
  moving: "Mudança de cidade",
  health: "Lesão ou saúde",
  class: "Não gostei da turma",
  other: "Outro",
};

export type RetentionOffer = "pause" | "plan_change" | "discount";

export interface ExitPolicies {
  allowPause: boolean;
  pauseMaxDaysPerYear: number;
  pauseMinDays: number;
  injuryPauseApproval: "manual" | "auto";
  injuryCountsInLimit: boolean;
  /** Acima disso o centro decide caso a caso (nunca aprova sozinho). */
  injuryMaxDays: number;
  monthlyCancellation: "end_of_cycle" | "immediate";
  cancelRetention: RetentionOffer[];
  /** Oferta "desconto de 1 mês": percentual sobre a próxima mensalidade. */
  retentionDiscountPercent: number;
  allowCancelWithdraw: boolean;
  /** Pausa por lesão só termina com a alta médica aprovada pela gestão. */
  requireMedicalClearance: boolean;
  /**
   * Vaga durante o TRANCAMENTO (lesão sempre reserva): `release` devolve a vaga à turma (a fila
   * oferece) e, na volta, o aluno retoma se houver vaga; turma cheia = segue pausado, sem cobrança,
   * com prioridade sobre a fila na primeira vaga.
   */
  pauseSeat: "reserve" | "release";
}

export const RETENTION_DISCOUNTS = [10, 20, 30, 50];
/** Desconto de retenção: no máximo um por matrícula nesse intervalo. */
export const DISCOUNT_COOLDOWN_DAYS = 365;
/** Quantos dias antes do fim da pausa por lesão o app pede a alta. */
export const CLEARANCE_LEAD_DAYS = 3;

/** Pausa pedida pode começar até tantos dias à frente. */
export const PAUSE_MAX_LEAD_DAYS = 60;
/** Teto absoluto de um pedido (o limite do ano costuma cortar antes). */
export const PAUSE_MAX_DAYS = 365;

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function readExitPolicies(raw: unknown): ExitPolicies {
  const p = raw && typeof raw === "object" ? (raw as Data) : {};
  const retention = Array.isArray(p["cancelRetention"]) ?
    (p["cancelRetention"] as unknown[]).filter((x): x is RetentionOffer => x === "pause" || x === "plan_change" || x === "discount") :
    ["pause", "plan_change"] as RetentionOffer[];
  return {
    allowPause: p["allowPause"] !== false,
    pauseMaxDaysPerYear: Math.max(0, num(p["pauseMaxDaysPerYear"], 30)),
    pauseMinDays: Math.max(1, num(p["pauseMinDays"], 7)),
    injuryPauseApproval: p["injuryPauseApproval"] === "auto" ? "auto" : "manual",
    injuryCountsInLimit: p["injuryCountsInLimit"] === true,
    injuryMaxDays: Math.max(1, num(p["injuryMaxDays"], 90)),
    monthlyCancellation: p["monthlyCancellation"] === "immediate" ? "immediate" : "end_of_cycle",
    cancelRetention: [...new Set(retention)],
    retentionDiscountPercent: RETENTION_DISCOUNTS.includes(num(p["retentionDiscountPercent"], 20)) ?
      num(p["retentionDiscountPercent"], 20) : 20,
    allowCancelWithdraw: p["allowCancelWithdraw"] !== false,
    requireMedicalClearance: p["requireMedicalClearance"] === true,
    pauseSeat: p["pauseSeat"] === "release" ? "release" : "reserve",
  };
}

/** Regra de negócio violada: a callable devolve como `failed-precondition` com esta mensagem. */
export class RequestRuleError extends Error {}

/** Dias de pausa já usados no ano (`year` = "2026") pelos pedidos da matrícula. */
export function pauseDaysUsed(requests: Data[], year: string, countInjury: boolean): number {
  let total = 0;
  for (const r of requests) {
    const type = str(r["type"]);
    if (type !== "pause" && !(type === "injury" && countInjury)) continue;
    if (!COUNTED_STATUSES.has(str(r["status"]))) continue;
    if (!str(r["startsOn"]).startsWith(year)) continue;
    total += Math.max(0, num(r["days"], 0));
  }
  return total;
}

export interface PausePlan {
  startsOn: string;
  endsOn: string;
  /** Dia em que a matrícula volta sozinha. */
  pausedUntil: string;
  days: number;
  /** Lesão acima do limite: só a gestão decide. */
  overInjuryLimit: boolean;
}

/** Valida datas e limites de uma pausa (trancamento ou lesão). */
export function planPause(input: {
  type: "pause" | "injury";
  today: string;
  startsOn: string;
  days: number;
  policies: ExitPolicies;
  usedDays: number;
}): PausePlan {
  const {type, today, policies} = input;
  const startsOn = /^\d{4}-\d{2}-\d{2}$/.test(input.startsOn) ? input.startsOn : today;
  const days = Math.floor(input.days);
  if (!Number.isFinite(days) || days < 1) throw new RequestRuleError("Informe quantos dias de pausa.");
  if (days > PAUSE_MAX_DAYS) throw new RequestRuleError("A pausa pode ter no máximo 1 ano.");
  if (startsOn < today) throw new RequestRuleError("A pausa não pode começar no passado.");
  if (daysBetween(today, startsOn) > PAUSE_MAX_LEAD_DAYS) {
    throw new RequestRuleError(`A pausa precisa começar nos próximos ${PAUSE_MAX_LEAD_DAYS} dias.`);
  }
  if (type === "pause") {
    if (!policies.allowPause) throw new RequestRuleError("Este centro não permite trancar a matrícula pelo app.");
    if (days < policies.pauseMinDays) throw new RequestRuleError(`O trancamento mínimo é de ${policies.pauseMinDays} dias.`);
  }
  const counts = type === "pause" || policies.injuryCountsInLimit;
  if (counts && input.usedDays + days > policies.pauseMaxDaysPerYear) {
    const left = Math.max(0, policies.pauseMaxDaysPerYear - input.usedDays);
    throw new RequestRuleError(left > 0 ?
      `Você tem ${left} dia${left === 1 ? "" : "s"} de trancamento livre${left === 1 ? "" : "s"} neste ano.` :
      "Você já usou todos os dias de trancamento deste ano.");
  }
  const endsOn = addDays(startsOn, days - 1);
  return {
    startsOn,
    endsOn,
    pausedUntil: addDays(endsOn, 1),
    days,
    overInjuryLimit: type === "injury" && days > policies.injuryMaxDays,
  };
}

export interface CancelPlan {
  /** Último dia de aula. */
  lastDay: string;
  /** Encerra já (pacote, cancelamento imediato ou sem ciclo à frente). */
  endsNow: boolean;
  /** Vencimento em que a assinatura encerra (`canceling.cancelAt`); null quando encerra já. */
  cancelAt: string | null;
}

export function planCancel(input: {
  planType: string;
  policies: ExitPolicies;
  /** Próximo vencimento da assinatura viva (null = sem assinatura). */
  nextChargeDate: string | null;
  today: string;
}): CancelPlan {
  const {today, nextChargeDate} = input;
  const monthlyAtCycleEnd = input.planType === "monthly" && input.policies.monthlyCancellation === "end_of_cycle";
  if (!monthlyAtCycleEnd || !nextChargeDate || nextChargeDate <= today) {
    return {lastDay: today, endsNow: true, cancelAt: null};
  }
  return {lastDay: addDays(nextChargeDate, -1), endsNow: false, cancelAt: nextChargeDate};
}

export interface CertificateInput {
  path: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  issuedOn: string;
  doctor: string;
  description: string;
}

const CERT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]);
export const CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024;

/** Pasta do atestado no Storage — só o próprio aluno grava; só owner/admin do centro lê. */
export function certificateFolder(centerId: string, uid: string): string {
  return `trainingCenterCertificates/${centerId}/${uid}/`;
}

/** Atestado enviado pelo aluno: o arquivo precisa estar na pasta dele, naquele centro. */
export function readCertificate(raw: unknown, folder: string | null, today: string): CertificateInput | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Data;
  const path = str(d["path"]);
  if (!path) return null;
  if (folder && (!path.startsWith(folder) || path.includes(".."))) {
    throw new RequestRuleError("Envie o atestado de novo pelo app.");
  }
  const contentType = str(d["contentType"]).toLowerCase();
  if (!CERT_TYPES.has(contentType)) throw new RequestRuleError("O atestado precisa ser PDF ou foto.");
  const sizeBytes = Math.max(0, Math.floor(num(d["sizeBytes"], 0)));
  if (sizeBytes > CERTIFICATE_MAX_BYTES) throw new RequestRuleError("O atestado pode ter até 10 MB.");
  const issuedOn = str(d["issuedOn"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn) || issuedOn > today) {
    throw new RequestRuleError("Informe a data de emissão do atestado.");
  }
  return {
    path,
    fileName: str(d["fileName"]).slice(0, 120) || "atestado",
    contentType,
    sizeBytes,
    issuedOn,
    doctor: str(d["doctor"]).slice(0, 120),
    description: str(d["description"]).slice(0, 400),
  };
}

export const TYPE_LABEL: Record<EnrollmentRequestType, string> = {
  pause: "Trancamento",
  injury: "Pausa por lesão",
  cancel: "Cancelamento",
};

export function shortDayBr(day: string): string {
  return day ? `${day.slice(8, 10)}/${day.slice(5, 7)}` : "";
}

/** Uma linha para auditoria e push ("Trancamento · 01/11 a 30/11"). */
export function requestSummary(r: {type: EnrollmentRequestType; startsOn?: string; endsOn?: string; lastDay?: string}): string {
  if (r.type === "cancel") return r.lastDay ? `Cancelamento · último dia ${shortDayBr(r.lastDay)}` : "Cancelamento";
  return `${TYPE_LABEL[r.type]} · ${shortDayBr(r.startsOn ?? "")} a ${shortDayBr(r.endsOn ?? "")}`;
}

/** Pausa por lesão que ainda espera a alta (pedida no começo, exigida pelo centro). */
export function needsClearance(r: Data): boolean {
  return str(r["type"]) === "injury" && r["requireClearance"] === true && str(r["clearanceStatus"]) !== "approved";
}

/** Vaga livre na turma para quem volta do trancamento (independe da fila estar ligada). */
export function freeSeats(cls: Data | undefined): number {
  if (!cls) return 0;
  return Math.max(0, num(cls["capacity"], 0) - num(cls["seatsTaken"], 0));
}

/** Matrículas pausadas que liberaram a vaga e esperam uma para voltar, por ordem de espera. */
export function returnQueue(rows: Array<{id: string; data: Data}>, classId: string): Array<{id: string; studentId: string}> {
  return rows
    .filter((r) => str(r.data["classId"]) === classId && r.data["status"] === "paused" &&
      r.data["seatReleased"] === true && r.data["awaitingSeat"] === true)
    .map((r) => {
      const at = r.data["awaitingSeatSince"] as {toMillis?: () => number} | undefined;
      return {id: r.id, studentId: str(r.data["studentId"]), at: typeof at?.toMillis === "function" ? at.toMillis() : Number.MAX_SAFE_INTEGER};
    })
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    .map(({id, studentId}) => ({id, studentId}));
}

/** Já ganhou desconto de retenção nesta matrícula no último ano? */
export function discountUsedRecently(requests: Data[], today: string): boolean {
  const since = addDays(today, -DISCOUNT_COOLDOWN_DAYS);
  return requests.some((r) => {
    const ret = r["retention"] && typeof r["retention"] === "object" ? r["retention"] as Data : {};
    return ret["accepted"] === "discount" && str(r["decidedOn"]) >= since;
  });
}

export function discountedCents(cents: number, percent: number): number {
  return Math.max(0, Math.round(cents * (100 - percent) / 100));
}

/** O que a rodada diária faz com um pedido em andamento (null = nada hoje). */
export function dueAction(r: Data, today: string):
  "start_pause" | "finish_pause" | "hold_for_clearance" | "ask_clearance" | "end_enrollment" | null {
  const type = str(r["type"]);
  const status = str(r["status"]);
  if ((type === "pause" || type === "injury") && status === "scheduled" && str(r["startsOn"]) <= today) return "start_pause";
  if ((type === "pause" || type === "injury") && status === "active" && str(r["endsOn"]) < today) {
    return needsClearance(r) ? "hold_for_clearance" : "finish_pause";
  }
  if (type === "injury" && status === "active" && needsClearance(r) && !str(r["clearanceStatus"]) &&
    addDays(str(r["endsOn"]), -CLEARANCE_LEAD_DAYS) <= today) return "ask_clearance";
  if (type === "cancel" && status === "scheduled" && str(r["lastDay"]) < today) return "end_enrollment";
  return null;
}
