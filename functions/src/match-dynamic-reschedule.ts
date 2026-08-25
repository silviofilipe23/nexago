import type {Timestamp} from "firebase-admin/firestore";
import {isMatchCompleted} from "./match-status";

/** Mudança de horário abaixo disso não dispara push nem conta como "atraso". */
export const SCHEDULE_DRIFT_THRESHOLD_MIN = 10;

export interface RecalcTrigger {
  tournamentId: string;
  dayKey: string;
  courtId: string;
  anchor: Date;
  triggerMatchId: string;
}

/**
 * Decide se a atualização de uma partida deve disparar o recálculo em
 * cascata do restante da fila daquela quadra, e a partir de quando (âncora).
 * Cobre os três gatilhos do design (partida concluída — vitória normal ou
 * W.O., já que ambas só mudam `status` para completed —, início atrasado em
 * quadra, e reagendamento manual) com UMA regra: nunca reagir à própria
 * escrita da cascata (`scheduleRecalcAt` mudou nesta atualização), senão
 * o trigger do Firestore reprocessaria a si mesmo infinitamente.
 */
export function determineRecalcTrigger(
  matchId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  defaultDurationMin: number,
): RecalcTrigger | null {
  if (!after) return null;

  const beforeRecalcAt = before?.scheduleRecalcAt as Timestamp | undefined;
  const afterRecalcAt = after.scheduleRecalcAt as Timestamp | undefined;
  if (afterRecalcAt && afterRecalcAt.toMillis() !== (beforeRecalcAt?.toMillis() ?? -1)) {
    return null;
  }

  const tournamentId = String(after.tournamentId ?? "").trim();
  const dayKey = String(after.dayKey ?? "").trim();
  const courtId = String(after.courtId ?? "").trim();
  if (!tournamentId || !dayKey || !courtId) return null;

  const wasCompleted = isMatchCompleted(before?.status);
  const isCompletedNow = isMatchCompleted(after.status);
  if (isCompletedNow && !wasCompleted) {
    const endedAt = after.matchEndedAt as Timestamp | undefined;
    if (!endedAt) return null;
    return {tournamentId, dayKey, courtId, anchor: endedAt.toDate(), triggerMatchId: matchId};
  }

  const wasOnCourt = before?.queueStatus === "on_court";
  const isOnCourtNow = after.queueStatus === "on_court";
  if (isOnCourtNow && !wasOnCourt) {
    const startedAt = after.matchStartedAt as Timestamp | undefined;
    const scheduled = after.scheduleTime as Timestamp | undefined;
    if (!startedAt || !scheduled) return null;
    const delayMin = (startedAt.toMillis() - scheduled.toMillis()) / 60000;
    if (delayMin < SCHEDULE_DRIFT_THRESHOLD_MIN) return null;
    const anchor = new Date(startedAt.toDate().getTime() + defaultDurationMin * 60 * 1000);
    return {tournamentId, dayKey, courtId, anchor, triggerMatchId: matchId};
  }

  if (isCompletedNow || isOnCourtNow) return null;

  const beforeTime = before?.scheduleTime as Timestamp | undefined;
  const afterTime = after.scheduleTime as Timestamp | undefined;
  const beforeCourtId = String(before?.courtId ?? "").trim();
  if (!afterTime) return null;
  const timeChanged = afterTime.toMillis() !== (beforeTime?.toMillis() ?? -1);
  const courtChanged = courtId !== beforeCourtId;
  if (timeChanged || courtChanged) {
    return {tournamentId, dayKey, courtId, anchor: afterTime.toDate(), triggerMatchId: matchId};
  }

  return null;
}
