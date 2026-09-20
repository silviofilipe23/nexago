import {FieldValue, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {artifactsMatchesPath} from "./firebase-paths";
import {isKingOfCourtMatch, isMatchCompleted} from "./match-status";

/**
 * Avanço de fase do King of the Court.
 *
 * Quem classifica NÃO sai de uma fiação de chave e sim da TABELA da rodada, o
 * que muda o gatilho: uma partida de duelo propaga o vencedor assim que acaba,
 * mas uma fase KOTC só pode ser montada quando TODAS as suas rodadas
 * terminaram — antes disso as vagas ainda estão em disputa.
 */

/** Vaga herdada, como o doc da rodada guarda. */
export interface KocQualifierSlotDoc {
  fromMatchNumber: number;
  fromRoundLabel: number;
  place: number;
  description?: string;
}

export interface KocStandingDoc {
  teamId: string;
  place: number;
}

export function parseKocQualifiers(raw: unknown): KocQualifierSlotDoc[] {
  if (!Array.isArray(raw)) return [];
  const out: KocQualifierSlotDoc[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const slot = item as Record<string, unknown>;
    const fromMatchNumber = Number(slot.fromMatchNumber);
    const place = Number(slot.place);
    if (!Number.isInteger(fromMatchNumber) || !Number.isInteger(place)) continue;
    if (place < 1) continue;
    out.push({
      fromMatchNumber,
      fromRoundLabel: Number.isInteger(Number(slot.fromRoundLabel)) ?
        Number(slot.fromRoundLabel) :
        fromMatchNumber,
      place,
      ...(typeof slot.description === "string" ? {description: slot.description} : {}),
    });
  }
  return out;
}

export function parseKocStandings(raw: unknown): KocStandingDoc[] {
  if (!Array.isArray(raw)) return [];
  const out: KocStandingDoc[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const teamId = typeof entry.teamId === "string" ? entry.teamId.trim() : "";
    const place = Number(entry.place);
    if (!teamId || !Number.isInteger(place) || place < 1) continue;
    out.push({teamId, place});
  }
  return out;
}

export interface KocRosterResolution {
  teamIds: string[];
  /** Vagas sem dono — tabela da rodada de origem ausente ou curta demais. */
  missing: KocQualifierSlotDoc[];
}

/**
 * Elenco da rodada seguinte, a partir das tabelas da fase anterior.
 *
 * A ORDEM importa e não é cosmética: quem abre a lista começa no trono, e o
 * trono é de onde os pontos vêm. Ordena por colocação e, dentro dela, pela
 * rodada de origem — então o melhor classificado entra defendendo, do mesmo
 * jeito que o cabeça de chave abre a classificatória.
 */
export function resolveKocRoster(
  qualifiers: readonly KocQualifierSlotDoc[],
  standingsByMatchNumber: ReadonlyMap<number, readonly KocStandingDoc[]>,
): KocRosterResolution {
  const ordered = [...qualifiers].sort((a, b) => {
    if (a.place !== b.place) return a.place - b.place;
    return a.fromRoundLabel - b.fromRoundLabel;
  });

  const teamIds: string[] = [];
  const missing: KocQualifierSlotDoc[] = [];
  for (const slot of ordered) {
    const standings = standingsByMatchNumber.get(slot.fromMatchNumber);
    const found = standings?.find((s) => s.place === slot.place);
    if (!found || teamIds.includes(found.teamId)) {
      missing.push(slot);
      continue;
    }
    teamIds.push(found.teamId);
  }
  return {teamIds, missing};
}

/** A fase acabou quando todas as suas rodadas estão concluídas. */
export function isKocPhaseComplete(
  phaseRounds: ReadonlyArray<{status: unknown}>,
): boolean {
  return phaseRounds.length > 0 && phaseRounds.every((r) => isMatchCompleted(r.status));
}

interface RoundDoc {
  id: string;
  data: FirebaseFirestore.DocumentData;
  phase: number;
  matchNumber: number;
}

function roundPhase(data: FirebaseFirestore.DocumentData): number {
  const phase = Number(data.kocPhase ?? data.round);
  return Number.isInteger(phase) && phase > 0 ? phase : 0;
}

/**
 * Monta a fase seguinte quando a atual termina.
 *
 * Idempotente: rodada que já tem elenco não é tocada, então reprocessar o mesmo
 * evento (retry do trigger, correção de resultado) não embaralha quadra.
 */
export async function tryAdvanceKocPhase(
  db: Firestore,
  projectId: string,
  match: FirebaseFirestore.DocumentData,
): Promise<{advanced: number; phase: number}> {
  if (!isKingOfCourtMatch(match.matchType)) return {advanced: 0, phase: 0};
  if (!isMatchCompleted(match.status)) return {advanced: 0, phase: 0};

  const tournamentId = String(match.tournamentId ?? "").trim();
  const categoryId = String(match.categoryId ?? "").trim();
  const phase = roundPhase(match);
  if (!tournamentId || !categoryId || phase === 0) return {advanced: 0, phase: 0};

  const snap = await db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const rounds: RoundDoc[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!isKingOfCourtMatch(data.matchType)) continue;
    rounds.push({
      id: doc.id,
      data,
      phase: roundPhase(data),
      matchNumber: Number(data.matchNumber ?? 0),
    });
  }

  const current = rounds.filter((r) => r.phase === phase);
  if (!isKocPhaseComplete(current.map((r) => ({status: r.data.status})))) {
    return {advanced: 0, phase};
  }

  const next = rounds.filter((r) => r.phase === phase + 1);
  if (next.length === 0) return {advanced: 0, phase};

  const standingsByMatchNumber = new Map<number, KocStandingDoc[]>();
  for (const round of current) {
    standingsByMatchNumber.set(
      round.matchNumber,
      parseKocStandings(round.data.kocStandings),
    );
  }

  const batch = db.batch();
  let advanced = 0;
  for (const round of next) {
    const already = Array.isArray(round.data.kocTeamIds) ?
      (round.data.kocTeamIds as unknown[]).filter(
        (id) => typeof id === "string" && id.trim().length > 0,
      ).length :
      0;
    if (already > 0) continue; // já montada

    const qualifiers = parseKocQualifiers(round.data.kocQualifiers);
    if (qualifiers.length === 0) continue;

    const {teamIds, missing} = resolveKocRoster(qualifiers, standingsByMatchNumber);
    if (missing.length > 0) {
      // Vaga sem dono significa tabela ausente ou curta: montar a rodada com um
      // elenco incompleto seria pior que deixar o organizador ver o buraco.
      logger.warn("kocAdvancePhase: vaga sem classificada", {
        tournamentId, categoryId, phase, roundId: round.id, missing,
      });
      continue;
    }

    batch.update(db.doc(`${artifactsMatchesPath(projectId)}/${round.id}`), {
      kocTeamIds: teamIds,
      updatedAt: FieldValue.serverTimestamp(),
    });
    advanced++;
  }

  if (advanced > 0) await batch.commit();
  return {advanced, phase};
}

/**
 * A rodada KOTC acabou de ser concluída (ou teve a tabela corrigida).
 *
 * Não reaproveita `shouldPropagateMatchAdvance`: aquele exige `winnerId` novo e
 * é o gate dos consumidores de DUELO, que a fase 0 fechou para KOTC de
 * propósito.
 */
export function shouldAdvanceKocPhase(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (!after) return false;
  if (!isKingOfCourtMatch(after.matchType)) return false;
  if (!isMatchCompleted(after.status)) return false;
  if (!before || !isMatchCompleted(before.status)) return true;
  // Correção de tabela depois de concluída também precisa repropagar.
  return JSON.stringify(before.kocStandings) !== JSON.stringify(after.kocStandings);
}
