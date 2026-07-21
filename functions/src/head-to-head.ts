import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {artifactsMatchesPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";
import {isMatchCompleted} from "./match-status";

/**
 * Head-to-head (confronto direto) entre dois atletas — item #3 de
 * `docs/superpowers/specs/2026-07-20-cinco-features-concorrencia-design.md`.
 *
 * NOTA DE MODELO DE DADOS / PERFORMANCE (leia antes de mexer):
 * O doc de `matches` (`artifacts/{projectId}/public/data/matches`) só guarda
 * `teamAId`/`teamBId` — os IDs dos atletas ficam no doc de `teams`
 * (`artifacts/{projectId}/public/data/teams`, campos `player1Id`/
 * `player2Id`). Não existe um jeito de fazer uma única query Firestore do
 * tipo "partida onde o atleta A e o atleta B aparecem, em lados opostos" sem
 * um campo desnormalizado (Firestore não faz `array-contains` duplo). A
 * estratégia usada aqui, sem inventar esse campo nas partidas:
 *
 *   1. Resolve os times de cada atleta com 2 queries simples por atleta
 *      (`player1Id == uid` / `player2Id == uid`) — mesmo padrão já usado no
 *      Flutter em `TournamentTeamsRepository.teamIdsForAthlete`.
 *   2. Busca as partidas de cada time do ATLETA A (2 queries por time:
 *      `teamAId == teamId` / `teamBId == teamId`) — mesmo padrão de
 *      `TournamentMatchesRepository.getByTeamId` no Flutter.
 *   3. Filtra em memória: `status == 'Completed'` + o time do outro lado
 *      pertence aos times do atleta B (exclui de quebra o caso "os dois
 *      jogavam juntos, do mesmo lado" — dupla parceira).
 *
 * Custo: O(times do atleta A) queries simples, cada uma coberta pelo índice
 * de campo único automático do Firestore (sem índice composto novo — todas
 * as queries daqui filtram só UM campo por vez; o filtro de `status` é
 * aplicado em memória de propósito, pra não precisar de índice composto
 * `status + teamAId`/`status + teamBId`). Aceitável pro volume real: um
 * atleta acumula dezenas de times ao longo da carreira, não milhares. Se
 * isso crescer a ponto de pesar, a correção é desnormalizar
 * `athleteIdsA`/`athleteIdsB` (ou um `athleteIds` único) no doc de match em
 * `submitMatchResult` — decisão adiada aqui de propósito: é um campo que
 * hoje não seria lido em nenhum outro lugar do sistema, então adicioná-lo
 * sem necessidade comprovada violaria "não inventar campo sem necessidade".
 */

const RECENT_MATCH_LIMIT = 5;

export interface TeamRecord {
  id: string;
  player1Id: string;
  player2Id: string;
}

export interface MatchRecord {
  id: string;
  teamAId: string;
  teamBId: string;
  winnerId: string | null;
  status: string;
  tournamentId: string;
  /** Epoch millis, ou `null` se a partida não tem data de término. */
  matchEndedAt: number | null;
  resultA?: string;
  resultB?: string;
  sets?: {a: number; b: number}[];
}

export interface HeadToHeadRecentMatch {
  matchId: string;
  tournamentId: string;
  playedAt: number | null;
  scoreLabel: string;
  /** `true` se o atleta A venceu essa partida. */
  athleteAWon: boolean;
}

export interface HeadToHeadResult {
  wins: number;
  losses: number;
  recentMatches: HeadToHeadRecentMatch[];
}

export const EMPTY_HEAD_TO_HEAD_RESULT: HeadToHeadResult = {
  wins: 0,
  losses: 0,
  recentMatches: [],
};

/**
 * Núcleo puro (sem Firestore) do cálculo de H2H — dado o par de atletas, as
 * partidas candidatas e o mapa de times já resolvido, calcula vitórias/
 * derrotas do atleta A contra o atleta B especificamente e as últimas
 * `RECENT_MATCH_LIMIT` partidas entre eles. Exportado para teste unitário
 * sem precisar de emulador do Firestore.
 *
 * Conta só partidas `Completed` com os dois atletas em lados opostos —
 * partidas onde os dois estavam do MESMO lado (parceiros de dupla) são
 * ignoradas de propósito (fora de escopo: H2H em nível de dupla).
 */
export function computeHeadToHead(
  athleteIdA: string,
  athleteIdB: string,
  matches: MatchRecord[],
  teamsById: Map<string, TeamRecord>,
): HeadToHeadResult {
  const isOnTeam = (teamId: string, athleteId: string): boolean => {
    const team = teamsById.get(teamId);
    if (!team) return false;
    return team.player1Id === athleteId || team.player2Id === athleteId;
  };

  let wins = 0;
  let losses = 0;
  const recent: (HeadToHeadRecentMatch & {sortKey: number})[] = [];

  for (const match of matches) {
    if (!isMatchCompleted(match.status)) continue;

    const aSide = isOnTeam(match.teamAId, athleteIdA) ?
      "A" :
      isOnTeam(match.teamBId, athleteIdA) ?
        "B" :
        null;
    const bSide = isOnTeam(match.teamAId, athleteIdB) ?
      "A" :
      isOnTeam(match.teamBId, athleteIdB) ?
        "B" :
        null;

    // Só conta se os dois participaram dessa partida E em lados opostos.
    if (!aSide || !bSide || aSide === bSide) continue;

    const winnerSide = match.winnerId === match.teamAId ?
      "A" :
      match.winnerId === match.teamBId ?
        "B" :
        null;
    if (!winnerSide) continue; // sem vencedor definido, não deveria acontecer p/ status Completed

    const athleteAWon = winnerSide === aSide;
    if (athleteAWon) wins++;
    else losses++;

    recent.push({
      matchId: match.id,
      tournamentId: match.tournamentId,
      playedAt: match.matchEndedAt,
      scoreLabel: scoreLabelFor(match, aSide),
      athleteAWon,
      sortKey: match.matchEndedAt ?? 0,
    });
  }

  recent.sort((x, y) => y.sortKey - x.sortKey);
  const recentMatches = recent
    .slice(0, RECENT_MATCH_LIMIT)
    .map(({sortKey: _sortKey, ...rest}) => rest);

  return {wins, losses, recentMatches};
}

function scoreLabelFor(match: MatchRecord, athleteASide: "A" | "B"): string {
  if (match.sets && match.sets.length > 0) {
    return match.sets
      .map((s) => (athleteASide === "A" ? `${s.a}-${s.b}` : `${s.b}-${s.a}`))
      .join(", ");
  }
  const resultA = match.resultA ?? "";
  const resultB = match.resultB ?? "";
  if (resultA && resultB) {
    return athleteASide === "A" ? `${resultA}-${resultB}` : `${resultB}-${resultA}`;
  }
  return "-";
}

/** Times (`player1Id`/`player2Id`) em que o atleta aparece. */
async function loadAthleteTeams(
  db: Firestore,
  projectId: string,
  athleteId: string,
): Promise<Map<string, TeamRecord>> {
  const id = athleteId.trim();
  const map = new Map<string, TeamRecord>();
  if (!id) return map;

  const teamsRef = db.collection(artifactsTeamsPath(projectId));
  const [snap1, snap2] = await Promise.all([
    teamsRef.where("player1Id", "==", id).get(),
    teamsRef.where("player2Id", "==", id).get(),
  ]);
  for (const snap of [snap1, snap2]) {
    for (const doc of snap.docs) {
      const data = doc.data();
      map.set(doc.id, {
        id: doc.id,
        player1Id: String(data.player1Id ?? "").trim(),
        player2Id: String(data.player2Id ?? "").trim(),
      });
    }
  }
  return map;
}

function matchRecordFromDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): MatchRecord {
  const data = doc.data();
  const endedAtRaw = data.matchEndedAt as FirebaseFirestore.Timestamp | undefined;
  const matchEndedAt = endedAtRaw && typeof endedAtRaw.toMillis === "function" ?
    endedAtRaw.toMillis() :
    null;
  const rawSets = Array.isArray(data.sets) ? data.sets as unknown[] : undefined;

  return {
    id: doc.id,
    teamAId: String(data.teamAId ?? "").trim(),
    teamBId: String(data.teamBId ?? "").trim(),
    winnerId: data.winnerId ? String(data.winnerId).trim() : null,
    status: String(data.status ?? ""),
    tournamentId: String(data.tournamentId ?? "").trim(),
    matchEndedAt,
    resultA: data.resultA != null ? String(data.resultA) : undefined,
    resultB: data.resultB != null ? String(data.resultB) : undefined,
    sets: rawSets?.map((raw) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      return {a: Number(s.a) || 0, b: Number(s.b) || 0};
    }),
  };
}

/** Todas as partidas (qualquer status) de um conjunto de times, deduplicadas. */
async function loadMatchesForTeams(
  db: Firestore,
  projectId: string,
  teamIds: Iterable<string>,
): Promise<Map<string, MatchRecord>> {
  const matchesRef = db.collection(artifactsMatchesPath(projectId));
  const ids = [...teamIds].filter((id) => id.trim().length > 0);
  const byId = new Map<string, MatchRecord>();

  await Promise.all(
    ids.map(async (teamId) => {
      const [snapA, snapB] = await Promise.all([
        matchesRef.where("teamAId", "==", teamId).get(),
        matchesRef.where("teamBId", "==", teamId).get(),
      ]);
      for (const snap of [snapA, snapB]) {
        for (const doc of snap.docs) {
          if (byId.has(doc.id)) continue;
          byId.set(doc.id, matchRecordFromDoc(doc));
        }
      }
    }),
  );

  return byId;
}

/** Nome dos torneios (best-effort) pra enriquecer as `recentMatches` retornadas. */
async function loadTournamentNames(
  db: Firestore,
  tournamentIds: Iterable<string>,
): Promise<Map<string, string>> {
  const ids = [...new Set([...tournamentIds].filter((id) => id.trim().length > 0))];
  const names = new Map<string, string>();
  if (ids.length === 0) return names;

  await Promise.all(
    ids.map(async (id) => {
      const snap = await db.doc(`tournaments/${id}`).get();
      if (!snap.exists) return;
      const name = String(snap.data()?.name ?? "").trim();
      if (name) names.set(id, name);
    }),
  );
  return names;
}

/**
 * Callable `getHeadToHeadRecord({athleteIdA, athleteIdB, sportCode?})`.
 *
 * `sportCode` é opcional e, quando informado, restringe o histórico às
 * partidas de torneios daquele esporte (campo `sport` no doc de
 * `tournaments/{id}`, mesmo campo lido em `rating-engine.ts`).
 */
export const getHeadToHeadRecord = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login necessário");

  const athleteIdA = String(request.data?.athleteIdA ?? "").trim();
  const athleteIdB = String(request.data?.athleteIdB ?? "").trim();
  const sportCode = String(request.data?.sportCode ?? "").trim();
  if (!athleteIdA || !athleteIdB) {
    throw new HttpsError(
      "invalid-argument",
      "athleteIdA e athleteIdB obrigatórios",
    );
  }
  if (athleteIdA === athleteIdB) {
    return EMPTY_HEAD_TO_HEAD_RESULT;
  }

  const db = getFirestore();
  const projectId = getFirebaseProjectId();

  const [teamsA, teamsB] = await Promise.all([
    loadAthleteTeams(db, projectId, athleteIdA),
    loadAthleteTeams(db, projectId, athleteIdB),
  ]);
  if (teamsA.size === 0 || teamsB.size === 0) {
    return EMPTY_HEAD_TO_HEAD_RESULT;
  }

  const candidateMatches = await loadMatchesForTeams(db, projectId, teamsA.keys());
  const teamsById = new Map<string, TeamRecord>([...teamsA, ...teamsB]);

  let matches = [...candidateMatches.values()];

  if (sportCode) {
    const tournamentIds = new Set(matches.map((m) => m.tournamentId).filter(Boolean));
    const sportByTournament = new Map<string, string>();
    await Promise.all(
      [...tournamentIds].map(async (id) => {
        const snap = await db.doc(`tournaments/${id}`).get();
        if (!snap.exists) return;
        sportByTournament.set(id, String(snap.data()?.sport ?? "").trim());
      }),
    );
    matches = matches.filter((m) => sportByTournament.get(m.tournamentId) === sportCode);
  }

  const result = computeHeadToHead(athleteIdA, athleteIdB, matches, teamsById);

  // Enriquecimento best-effort com nome do torneio (no máximo
  // RECENT_MATCH_LIMIT leituras — já filtrado pro topo 5).
  const tournamentNames = await loadTournamentNames(
    db,
    result.recentMatches.map((m) => m.tournamentId),
  );

  return {
    wins: result.wins,
    losses: result.losses,
    recentMatches: result.recentMatches.map((m) => ({
      ...m,
      tournamentName: tournamentNames.get(m.tournamentId) ?? null,
    })),
  };
});
