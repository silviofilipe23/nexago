import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {artifactsInscriptionsPath, artifactsPublicDataBase} from "./firebase-paths";
import {athleteRatingDocId, athleteRatingsPath} from "./rating-engine";
import {inscriptionAthleteUids} from "./tournament-level-lock";
import {
  fieldStrengthFromTeamRanks,
  teamLevelRank,
  type FieldStrength,
} from "./category-field-strength";

/**
 * Carimbo da força do campo (spec 2026-09-10). Coleção separada, e não um campo
 * em `tournaments/{id}`, porque o organizador escreve o doc do torneio — o peso
 * do ranking não pode ser alcançável pelo cliente.
 */
export function fieldStrengthPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/tournamentCategoryFieldStrength`;
}

export function fieldStrengthDocId(tournamentId: string, categoryId: string): string {
  return `${tournamentId}_${categoryId}`;
}

export type FieldStrengthSource = "bracket" | "lazy" | "backfill";

export interface FieldStrengthStamp extends FieldStrength {
  tournamentId: string;
  categoryId: string;
  presetKey: string;
  /** Duplas pagas no instante do carimbo — AUDITORIA apenas: `bracketSizeFactor` segue contando ao vivo. */
  totalPaidTeams: number;
  source: FieldStrengthSource;
}

/**
 * Times pagos com os uids dos integrantes, a partir de um snapshot de
 * `inscriptions` JÁ LIDO. A definição de "paga" é a mesma de `loadPaidTeamIds`
 * (`isPaid` e fora da fila), para que a medida e o `bracketSizeFactor` enxerguem
 * exatamente o mesmo conjunto de duplas.
 *
 * Uids via `inscriptionAthleteUids` (extrator canônico) em vez de ler
 * `participantUids` na mão — ele junta `player1Id` E `participantUids`, e o
 * `player1Id` é o reforço para docs legados que só tinham esse campo.
 */
export function paidTeamsWithParticipants(
  docs: Array<{data: () => Record<string, unknown>}>,
): Map<string, string[]> {
  const teams = new Map<string, string[]>();
  for (const doc of docs) {
    const data = doc.data();
    if (data.isPaid !== true) continue;
    if (data.waitlist === true) continue;
    const teamId = String(data.teamId ?? "").trim();
    if (!teamId) continue;
    const uids = inscriptionAthleteUids(data);
    teams.set(teamId, [...(teams.get(teamId) ?? []), ...uids]);
  }
  return teams;
}

/** Mesma query de `loadPaidTeamIds`, devolvendo também os integrantes. */
export async function loadPaidTeamsWithParticipants(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<Map<string, string[]>> {
  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();
  return paidTeamsWithParticipants(snap.docs);
}

/**
 * Degraus por atleta em UMA ida ao Firestore (`getAll` dos docs de rating, cujo
 * id é `{uid}_{SPORT_CODE}`). `levelRank` já vem calculado ali e é mantido em
 * sincronia com `users/{uid}.sportOnboarding.levelsBySport` pelo fluxo de nível.
 */
export async function loadAthleteLevelRanks(
  db: Firestore,
  projectId: string,
  uids: string[],
  sportCode: string,
): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  const unique = [...new Set(uids.map((uid) => uid.trim()).filter((uid) => uid.length > 0))];
  if (unique.length === 0 || !sportCode) return ranks;

  const refs = unique.map((uid) =>
    db.doc(`${athleteRatingsPath(projectId)}/${athleteRatingDocId(uid, sportCode)}`),
  );
  const snaps = await db.getAll(...refs);
  snaps.forEach((snap, index) => {
    const rank = Number(snap.data()?.levelRank);
    if (Number.isFinite(rank)) ranks.set(unique[index], rank);
  });
  return ranks;
}

/**
 * Mede a força do campo. `null` quando não dá para medir (sem esporte de nível,
 * sem duplas pagas, ou nenhum atleta com degrau conhecido) — e nesse caso o
 * chamador NÃO deve carimbar.
 */
export async function measureFieldStrength(
  db: Firestore,
  projectId: string,
  params: {
    tournamentId: string;
    categoryId: string;
    presetKey: string;
    sportCode: string | null;
    teams: Map<string, string[]>;
    source: FieldStrengthSource;
  },
): Promise<FieldStrengthStamp | null> {
  if (!params.sportCode || params.teams.size === 0) return null;

  const ranks = await loadAthleteLevelRanks(
    db,
    projectId,
    [...params.teams.values()].flat(),
    params.sportCode,
  );
  const teamRanks = [...params.teams.values()].map((uids) =>
    teamLevelRank(uids.map((uid) => ranks.get(uid) ?? null)),
  );
  const strength = fieldStrengthFromTeamRanks(teamRanks);
  if (!strength) return null;

  return {
    ...strength,
    tournamentId: params.tournamentId,
    categoryId: params.categoryId,
    presetKey: params.presetKey,
    totalPaidTeams: params.teams.size,
    source: params.source,
  };
}

/**
 * Carimbar congela o peso da categoria, então só vale a pena quando a medição
 * cobre a MAIORIA das duplas pagas. Abaixo disso a média sai enviesada para
 * cima (as duplas sem degrau conhecido saem da conta) e o erro seria permanente
 * — melhor usar o peso medido só nesta premiação e deixar uma medição futura,
 * com dado melhor, acontecer.
 */
export function shouldStampFieldStrength(stamp: FieldStrengthStamp): boolean {
  return stamp.measuredTeams * 2 >= stamp.totalPaidTeams;
}

/** Payload do carimbo (o chamador decide se escreve em batch ou direto). */
export function fieldStrengthStampPayload(
  stamp: FieldStrengthStamp,
): Record<string, unknown> {
  return {...stamp, stampedAt: FieldValue.serverTimestamp()};
}

export async function readFieldStrengthStamp(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<FieldStrengthStamp | null> {
  const snap = await db
    .doc(`${fieldStrengthPath(projectId)}/${fieldStrengthDocId(tournamentId, categoryId)}`)
    .get();
  const data = snap.data();
  if (!data) return null;

  const weight = Number(data.weight);
  if (!Number.isFinite(weight) || weight <= 0) return null;

  return {
    tournamentId,
    categoryId,
    presetKey: String(data.presetKey ?? "livre"),
    fieldRank: Number(data.fieldRank) || 0,
    weight,
    measuredTeams: Number(data.measuredTeams) || 0,
    totalPaidTeams: Number(data.totalPaidTeams) || 0,
    source: String(data.source ?? "bracket") as FieldStrengthSource,
  };
}
