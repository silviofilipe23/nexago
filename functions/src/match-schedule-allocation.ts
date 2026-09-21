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

/**
 * Troca entre rodadas King of the Court, em minutos.
 *
 * A duração configurada é o tempo de JOGO da rodada; o slot de quadra precisa
 * da troca também, senão a grade sai com as rodadas coladas uma na outra e o
 * dia inteiro estoura logo na primeira. É o mesmo colchão do desenho da etapa
 * (`docs/product/king-of-court-plan.md`, seção 7).
 */
export const KOC_CHANGEOVER_MIN = 5;

/**
 * Duplas que a partida ocupa naquele horário.
 *
 * A rodada KOTC grava `teamAId`/`teamBId` VAZIOS e põe o elenco em
 * `kocTeamIds`: colher só os dois lados deixaria a rodada sem marcar ninguém
 * ocupado, e a mesma dupla poderia ser agendada para um duelo no mesmo horário
 * em que está na rodada.
 */
export function matchTeamIds(data: FirebaseFirestore.DocumentData): string[] {
  const out: string[] = [];
  const push = (value: unknown): void => {
    if (typeof value !== "string") return;
    const id = value.trim();
    if (id && !out.includes(id)) out.push(id);
  };
  push(data.teamAId);
  push(data.teamBId);
  if (Array.isArray(data.kocTeamIds)) for (const id of data.kocTeamIds) push(id);
  return out;
}

/**
 * Quanto tempo de quadra a partida ocupa, em minutos.
 *
 * A rodada KOTC tem a sua própria duração no snapshot `kocConfig.durationSec`,
 * e ela VARIA POR FASE (a final costuma ser mais longa que a classificatória).
 * Reservar o padrão do dia erraria nas duas direções: sobraria quadra numa
 * rodada de 15 min e faltaria numa de 40.
 */
export function matchDurationMin(
  data: FirebaseFirestore.DocumentData,
  fallbackMin: number,
): number {
  const config = data.kocConfig;
  const raw = config && typeof config === "object" ?
    (config as Record<string, unknown>).durationSec :
    undefined;
  const sec = Number(raw);
  if (!Number.isFinite(sec) || sec <= 0) return fallbackMin;
  return Math.ceil(sec / 60) + KOC_CHANGEOVER_MIN;
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

    const candidates = courts.map((court) => {
      let start = courtBusyUntil[court.id] ?? dayStart;
      if (start < dayStart) start = new Date(dayStart);

      if (avoidAthleteConflict) {
        for (const tid of matchTeamIds(data)) {
          const busy = teamBusyUntil[tid];
          if (busy && busy > start) start = busy;
        }
      }

      return {courtId: court.id, start};
    });
    // `courts` nunca é vazio (ambos os chamadores garantem isso), então
    // `reduce` sem valor inicial é seguro e tipa como não-opcional.
    const chosen = candidates.reduce((best, c) => (c.start < best.start ? c : best));
    const chosenCourt = chosen.courtId;
    const chosenStart = chosen.start;

    const end = new Date(
      chosenStart.getTime() + matchDurationMin(data, durationMin) * 60 * 1000,
    );
    slots.push({matchId: doc.id, courtId: chosenCourt, start: chosenStart, end});
    courtBusyUntil[chosenCourt] = end;

    if (avoidAthleteConflict) {
      const teamRestUntil = new Date(end.getTime() + minRestMin * 60 * 1000);
      for (const tid of matchTeamIds(data)) {
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
