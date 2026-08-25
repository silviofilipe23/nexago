import type {Firestore} from "firebase-admin/firestore";
import {artifactsMatchesPath} from "./firebase-paths";

/**
 * Compara duas partidas pela numeração GLOBAL cronológica (`matchNumber`).
 * NÃO comparar por `round`: em dupla eliminação, WB, LB, 3º lugar e final têm
 * cada um sua própria contagem de round reiniciando em 1, então "round" não é
 * uma sequência global — comparar por ele antes do matchNumber agendava a
 * final e o 3º lugar (round 1 na sua chave) antes da WB/LB R2.
 */
export function compareByMatchNumber(
  a: {matchNumber?: number},
  b: {matchNumber?: number},
): number {
  return (a.matchNumber ?? 0) - (b.matchNumber ?? 0);
}

export interface CourtAllocationSlot {
  matchId: string;
  courtId: string;
  start: Date;
  end: Date;
}

/**
 * Aloca sequencialmente cada partida de `unscheduled` (ordenada por
 * `compareByMatchNumber`) numa das `courts`, escolhendo sempre a quadra que
 * fica livre mais cedo (guloso), respeitando `courtBusyUntil`/`teamBusyUntil`
 * de entrada — que são MUTADOS a cada alocação, então o chamador os vê
 * atualizados ao final. Núcleo compartilhado entre `autoScheduleTournamentDay`
 * (grade do dia inteiro, courts = todas) e `recalculateCourtSchedule`
 * (cascata incremental restrita a uma quadra só).
 */
export function allocateCourtSlots(params: {
  courts: ReadonlyArray<{id: string}>;
  unscheduled: FirebaseFirestore.QueryDocumentSnapshot[];
  courtBusyUntil: Record<string, Date>;
  teamBusyUntil: Record<string, Date>;
  durationMin: number;
  minRestMin: number;
  avoidAthleteConflict: boolean;
  dayStart: Date;
}): CourtAllocationSlot[] {
  const {
    courts,
    unscheduled,
    courtBusyUntil,
    teamBusyUntil,
    durationMin,
    minRestMin,
    avoidAthleteConflict,
    dayStart,
  } = params;

  const slots: CourtAllocationSlot[] = [];
  const sorted = [...unscheduled].sort((a, b) =>
    compareByMatchNumber(a.data(), b.data()),
  );

  for (const doc of sorted) {
    const data = doc.data();
    let chosenCourt = courts[0].id;
    let chosenStart = courtBusyUntil[chosenCourt] ?? dayStart;
    if (chosenStart < dayStart) chosenStart = new Date(dayStart);

    for (const court of courts) {
      let start = courtBusyUntil[court.id] ?? dayStart;
      if (start < dayStart) start = new Date(dayStart);

      if (avoidAthleteConflict) {
        for (const tid of [data.teamAId, data.teamBId]) {
          if (typeof tid !== "string" || !tid.trim()) continue;
          const busy = teamBusyUntil[tid];
          if (busy && busy > start) start = busy;
        }
      }

      if (start < chosenStart) {
        chosenStart = start;
        chosenCourt = court.id;
      }
    }

    const end = new Date(chosenStart.getTime() + durationMin * 60 * 1000);
    slots.push({matchId: doc.id, courtId: chosenCourt, start: chosenStart, end});
    courtBusyUntil[chosenCourt] = end;

    if (avoidAthleteConflict) {
      const teamRestUntil = new Date(end.getTime() + minRestMin * 60 * 1000);
      for (const tid of [data.teamAId, data.teamBId]) {
        if (typeof tid !== "string" || !tid.trim()) continue;
        teamBusyUntil[tid] = teamRestUntil;
      }
    }
  }

  return slots;
}

/** Todas as partidas do torneio (opcionalmente restritas a um `dayKey`). */
export async function loadTournamentMatches(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  dayKey?: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  let query: FirebaseFirestore.Query = db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId);
  const dk = dayKey?.trim();
  if (dk) {
    query = query.where("dayKey", "==", dk);
  }
  const snap = await query.get();
  return snap.docs;
}
