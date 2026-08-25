import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {isMatchCanceled, isMatchCompleted} from "./match-status";
import {deliverNotificationToUser} from "./notification-delivery";
import {eventTimeLabel} from "./event-timezone";
import {artifactsTeamsPath} from "./firebase-paths";
import {allocateCourtSlots, loadTournamentMatches} from "./match-schedule-allocation";

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

export interface ScheduleShift {
  matchId: string;
  teamAId: string;
  teamBId: string;
  oldStart: Date | null;
  newStart: Date;
  courtLabel: string;
}

/**
 * Recalcula a fila de UMA quadra a partir da âncora, reaproveitando o mesmo
 * núcleo guloso de `autoScheduleTournamentDay` (`allocateCourtSlots`), mas só
 * sobre as partidas daquela quadra/dia que ainda não começaram. O descanso
 * mínimo (`minRestMin`) continua respeitado mesmo contra partidas em OUTRAS
 * quadras: `teamBusyUntil` é semeado com o dia inteiro, não só a quadra.
 */
export async function recalculateCourtSchedule(
  db: Firestore,
  projectId: string,
  trigger: RecalcTrigger,
  config: {durationMin: number; minRestMin: number},
): Promise<ScheduleShift[]> {
  const allMatches = await loadTournamentMatches(
    db,
    projectId,
    trigger.tournamentId,
    trigger.dayKey,
  );

  const reassign = allMatches.filter((doc) => {
    if (doc.id === trigger.triggerMatchId) return false;
    const d = doc.data();
    if (String(d.courtId ?? "").trim() !== trigger.courtId) return false;
    if (isMatchCompleted(d.status) || isMatchCanceled(d.status)) return false;
    if (d.queueStatus === "on_court" || d.queueStatus === "completed") return false;
    return true;
  });
  if (reassign.length === 0) return [];

  const reassignIds = new Set(reassign.map((doc) => doc.id));
  const teamBusyUntil: Record<string, Date> = {};
  for (const doc of allMatches) {
    if (reassignIds.has(doc.id)) continue;
    const d = doc.data();
    if (!d.scheduleTime) continue;
    const start = (d.scheduleTime as Timestamp).toDate();
    const end = d.scheduleEndTime ?
      (d.scheduleEndTime as Timestamp).toDate() :
      new Date(start.getTime() + config.durationMin * 60 * 1000);
    const restUntil = new Date(end.getTime() + config.minRestMin * 60 * 1000);
    for (const tid of [d.teamAId, d.teamBId]) {
      if (typeof tid !== "string" || !tid.trim()) continue;
      const prev = teamBusyUntil[tid];
      if (!prev || restUntil > prev) teamBusyUntil[tid] = restUntil;
    }
  }

  const slots = allocateCourtSlots({
    courts: [{id: trigger.courtId}],
    unscheduled: reassign,
    courtBusyUntil: {[trigger.courtId]: trigger.anchor},
    teamBusyUntil,
    durationMin: config.durationMin,
    minRestMin: config.minRestMin,
    avoidAthleteConflict: true,
    dayStart: trigger.anchor,
  });

  const matchesById = new Map(reassign.map((doc) => [doc.id, doc] as const));
  const shifts: ScheduleShift[] = [];
  for (const slot of slots) {
    const doc = matchesById.get(slot.matchId);
    if (!doc) continue;
    const data = doc.data();
    const oldStart = data.scheduleTime ? (data.scheduleTime as Timestamp).toDate() : null;
    try {
      await doc.ref.update({
        scheduleTime: Timestamp.fromDate(slot.start),
        scheduleEndTime: Timestamp.fromDate(slot.end),
        scheduleRecalcAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      logger.warn("recalculateCourtSchedule: falha ao atualizar partida", {matchId: slot.matchId, e});
      continue;
    }
    shifts.push({
      matchId: slot.matchId,
      teamAId: String(data.teamAId ?? ""),
      teamBId: String(data.teamBId ?? ""),
      oldStart,
      newStart: slot.start,
      courtLabel: String(data.courtName ?? trigger.courtId),
    });
  }
  return shifts;
}

/** Notifica os atletas das partidas cujo horário moveu >= `SCHEDULE_DRIFT_THRESHOLD_MIN`. */
export async function notifyScheduleShifts(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  shifts: ScheduleShift[],
): Promise<void> {
  for (const shift of shifts) {
    if (!shift.oldStart) continue;
    const driftMin = Math.abs(shift.newStart.getTime() - shift.oldStart.getTime()) / 60000;
    if (driftMin < SCHEDULE_DRIFT_THRESHOLD_MIN) continue;

    for (const teamId of [shift.teamAId, shift.teamBId]) {
      if (!teamId) continue;
      const teamSnap = await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get();
      const team = teamSnap.data();
      if (!team) continue;
      const players = [team.player1Id, team.player2Id].filter(
        (v): v is string => typeof v === "string" && v.trim() !== "",
      );
      for (const playerId of players) {
        try {
          await deliverNotificationToUser({
            userId: playerId,
            title: "Horário da sua partida mudou",
            body: `Nova previsão: ${eventTimeLabel(shift.newStart)} na ${shift.courtLabel}.`,
            type: "match_schedule_updated",
            data: {
              type: "match_schedule_updated",
              matchId: shift.matchId,
              tournamentId,
              newScheduleTime: shift.newStart.toISOString(),
            },
          });
        } catch (e) {
          logger.warn("notifyScheduleShifts: falha ao notificar", {matchId: shift.matchId, playerId, e});
        }
      }
    }
  }
}

/**
 * Ponto de entrada chamado pelo trigger de matches em TODA atualização (não
 * só conclusão): reagendamento manual e início atrasado não são "conclusão",
 * então dependeriam de um segundo trigger se ficassem atrás do guard de
 * `shouldPropagateMatchAdvance`.
 */
export async function handleDynamicRescheduleOnMatchUpdate(
  db: Firestore,
  projectId: string,
  matchId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): Promise<void> {
  if (!after) return;
  const tournamentId = String(after.tournamentId ?? "").trim();
  if (!tournamentId) return;

  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  const matchOps = tournamentSnap.data()?.matchOps as Record<string, unknown> | undefined;
  if (matchOps?.dynamicRescheduleEnabled !== true) return;

  const durationMin = (matchOps?.defaultMatchDurationMin as number) ?? 30;
  const minRestMin = (matchOps?.minRestBetweenMatchesMin as number) ?? 30;

  const trigger = determineRecalcTrigger(matchId, before, after, durationMin);
  if (!trigger) return;

  const shifts = await recalculateCourtSchedule(db, projectId, trigger, {durationMin, minRestMin});
  await notifyScheduleShifts(db, projectId, tournamentId, shifts);
}
