/**
 * Avisos do Centro de Treinamento — lógica pura: QUANDO avisar e com que TEXTO. Os gatilhos
 * (`training-center-notifications.ts`) só resolvem destinatários e entregam.
 */

type Data = Record<string, unknown>;

export const CENTER_SESSION_NOTICE_TYPE = "training_center_session_notice";
export const CENTER_INVITE_NOTICE_TYPE = "training_center_invite";
export const CENTER_ENROLLMENT_NOTICE_TYPE = "training_center_enrollment_notice";
export const CENTER_SEAT_OFFER_TYPE = "training_center_seat_offer";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const ROLE_LABELS: Record<string, string> = {
  center_owner: "Owner",
  center_admin: "Admin",
  coach: "Professor",
  receptionist: "Recepção",
};

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 'qui 22 out' de um dayKey 'YYYY-MM-DD' (aritmética de calendário, sem fuso). */
export function dayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return dayKey;
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${String(d).padStart(2, "0")} ${MONTHS[m - 1]}`;
}

export interface Notice {
  title: string;
  body: string;
}

export interface SessionNotice extends Notice {
  kind: "cancelled" | "changed" | "restored";
  /** Professor que passou a dar a aula (recebe aviso próprio). */
  newCoachUid: string | null;
}

/**
 * Aula de hoje em diante que foi cancelada, reaberta ou alterada SÓ NESTA DATA (`changed`).
 * Mudança de série (`applySeriesChange`) reescreve semanas de aulas sem marcar `changed` — avisar
 * cada uma mandaria dezenas de pushes ao aluno; fica de fora de propósito.
 */
export function sessionNotice(before: Data | undefined, after: Data | undefined, today: string): SessionNotice | null {
  if (!before || !after) return null;
  const date = s(after["date"]);
  if (!date || date < today) return null;
  const name = s(after["className"]) || "Sua aula";
  const when = `${dayLabel(date)} ${s(after["startTime"])}`;
  const reason = s(after["changeReason"]);
  const why = reason ? ` Motivo: ${reason}.` : "";

  if (before["status"] !== "cancelled" && after["status"] === "cancelled") {
    return {kind: "cancelled", title: `Aula cancelada · ${name}`, body: `A aula de ${when} foi cancelada.${why} Nenhum crédito foi consumido.`, newCoachUid: null};
  }
  if (before["status"] === "cancelled" && after["status"] === "scheduled") {
    return {kind: "restored", title: `Aula mantida · ${name}`, body: `A aula de ${when} voltou para a agenda.`, newCoachUid: null};
  }
  if (after["status"] !== "scheduled" || after["changed"] !== true) return null;
  const parts: string[] = [];
  if (s(before["startTime"]) !== s(after["startTime"])) parts.push(`novo horário ${s(after["startTime"])}`);
  if (s(before["coachUid"]) !== s(after["coachUid"])) parts.push(`professor ${s(after["coachName"]) || "novo"}`);
  if (s(before["courtId"]) !== s(after["courtId"])) parts.push(`${s(after["courtName"]) || "outra quadra"}`);
  if (parts.length === 0) return null;
  const coachChanged = s(before["coachUid"]) !== s(after["coachUid"]) && !!s(after["coachUid"]);
  return {
    kind: "changed",
    title: `Aula alterada · ${name}`,
    body: `${dayLabel(date)}: ${parts.join(" · ")}.${why}`,
    newCoachUid: coachChanged ? s(after["coachUid"]) : null,
  };
}

export function coachTakeoverNotice(after: Data): Notice {
  return {
    title: `Você assumiu ${s(after["className"]) || "uma aula"}`,
    body: `${dayLabel(s(after["date"]))} ${s(after["startTime"])} · ${s(after["courtName"]) || "quadra a definir"}.`,
  };
}

/** Alunos avisados de uma aula: lista da turma + encaixados, sem repetir. */
export function sessionAudience(cls: Data | undefined, session: Data): string[] {
  const roster = Array.isArray(cls?.["rosterStudentIds"]) ? (cls!["rosterStudentIds"] as unknown[]) : [];
  const makeups = Array.isArray(session["makeupStudentIds"]) ? (session["makeupStudentIds"] as unknown[]) : [];
  return [...new Set([...roster, ...makeups].filter((x): x is string => typeof x === "string" && !!x))];
}

/** Aluno com conta e que não desligou "Recebe avisos de aula". */
export function studentPushUid(student: Data | undefined): string | null {
  if (!student || student["notifyClasses"] === false) return null;
  return s(student["uid"]) || null;
}

export function inviteNotice(invite: Data, centerName: string): Notice {
  const role = ROLE_LABELS[s(invite["role"])] ?? "equipe";
  const by = s(invite["invitedByName"]);
  return {
    title: `Convite para ${centerName || "um centro de treinamento"}`,
    body: `${by ? `${by} convidou você` : "Você foi convidado"} para a equipe como ${role}. Aceite no portal do Centro de Treinamento.`,
  };
}

export type EnrollmentNoticeKind = "offered" | "confirmed";

/**
 * Oferta MANUAL da fila (a automática avisa no próprio gatilho da fila) e matrícula confirmada.
 */
export function enrollmentNoticeKind(before: Data | undefined, after: Data | undefined): EnrollmentNoticeKind | null {
  if (!before || !after) return null;
  if (before["status"] === "waitlisted" && after["status"] === "pending" && after["offeredBy"] === "manual") return "offered";
  if (before["status"] === "pending" && after["status"] === "active") return "confirmed";
  return null;
}

export function seatOfferNotice(className: string, centerName: string, holdHours: number, priceLabel: string): Notice {
  return {
    title: `Abriu vaga em ${className || "sua turma"}`,
    body: `${centerName || "Seu centro"} reservou a vaga para você por ${holdHours}h · ${priceLabel}. Pague para confirmar a matrícula.`,
  };
}

export function confirmedNotice(className: string, centerName: string): Notice {
  return {
    title: `Matrícula confirmada · ${className || "turma"}`,
    body: `Sua vaga em ${centerName || "seu centro"} está garantida. Até a próxima aula!`,
  };
}
