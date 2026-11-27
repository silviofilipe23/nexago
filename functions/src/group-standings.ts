import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {
  isRankedQualifierSlot,
  type KnockoutQualifierSlot,
  type RankedQualifierSlot,
} from "./category-bracket-builders";
import {isMatchCompleted} from "./match-status";
import {effectiveScoringProfile} from "./sports/scoring";

export interface GroupPreview {
  id: string;
  teamIds: string[];
}

export interface GroupMatchData {
  poolId?: string;
  teamAId?: string;
  teamBId?: string;
  winnerId?: string;
  status?: unknown;
  isGroupMatch?: boolean;
  matchType?: string;
  resultA?: string;
  resultB?: string;
  /** Placar por set (games): [{a, b}, …]. Quando ausente, usa resultA/resultB. */
  sets?: Array<{a?: unknown; b?: unknown}>;
  /** Perfil carimbado + nº de sets: decidem o critério de desempate do grupo. */
  scoringProfile?: unknown;
  bestOf?: unknown;
}

interface TeamStats {
  teamId: string;
  played: number;
  wins: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  /** Confronto direto contra empatados em vitórias e SP (preenchido depois). */
  h2hWins: number;
  h2hSetDiff: number;
  h2hGameDiff: number;
}

interface MatchScore {
  setsA: number;
  setsB: number;
  gamesA: number;
  gamesB: number;
}

/**
 * Extrai sets e games de uma partida de grupo concluída. Prefere o array `sets`
 * (placar real por set); cai para `resultA`/`resultB` (contagem de sets) e, em
 * último caso (ex.: "W.O."), deduz 1×0 pelo vencedor. Games ficam 0 quando não
 * há placar detalhado.
 */
function parseMatchScore(match: GroupMatchData): MatchScore | null {
  const teamAId = (match.teamAId ?? "").trim();
  const teamBId = (match.teamBId ?? "").trim();
  const winnerId = (match.winnerId ?? "").trim();

  if (Array.isArray(match.sets) && match.sets.length > 0) {
    let setsA = 0;
    let setsB = 0;
    let gamesA = 0;
    let gamesB = 0;
    for (const set of match.sets) {
      const a = Number(set?.a);
      const b = Number(set?.b);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      gamesA += Math.max(0, a);
      gamesB += Math.max(0, b);
      if (a > b) setsA++;
      else if (b > a) setsB++;
    }
    if (setsA > 0 || setsB > 0 || gamesA > 0 || gamesB > 0) {
      return {setsA, setsB, gamesA, gamesB};
    }
  }

  const ra = Number(String(match.resultA ?? "").trim());
  const rb = Number(String(match.resultB ?? "").trim());
  if (Number.isInteger(ra) && Number.isInteger(rb) && (ra > 0 || rb > 0)) {
    return {setsA: Math.max(0, ra), setsB: Math.max(0, rb), gamesA: 0, gamesB: 0};
  }

  // W.O. / sem placar: deduz 1×0 pelo vencedor.
  if (winnerId && winnerId === teamAId) {
    return {setsA: 1, setsB: 0, gamesA: 0, gamesB: 0};
  }
  if (winnerId && winnerId === teamBId) {
    return {setsA: 0, setsB: 1, gamesA: 0, gamesB: 0};
  }
  return null;
}

export function isGroupStageMatch(match: GroupMatchData): boolean {
  const matchType = String(match.matchType ?? "")
    .trim()
    .toLowerCase();
  return (
    match.isGroupMatch === true ||
    matchType === "group" ||
    matchType === "groups"
  );
}

function expectedGroupMatchCount(teamCount: number): number {
  if (teamCount < 2) return 0;
  return (teamCount * (teamCount - 1)) / 2;
}

export function isPoolRoundRobinComplete(
  poolId: string,
  teamIds: string[],
  matches: GroupMatchData[],
): boolean {
  const expected = expectedGroupMatchCount(teamIds.length);
  if (expected === 0) return teamIds.length > 0;

  const completed = matches.filter((match) => {
    if (!isGroupStageMatch(match)) return false;
    if ((match.poolId ?? "").trim() !== poolId) return false;
    return isMatchCompleted(match.status) && Boolean(match.winnerId?.trim());
  });

  return completed.length >= expected;
}

/**
 * Classifica as duplas de um grupo aplicando, em ordem:
 *   1. vitórias;
 *   2. só em grupo de games (`sets_games`): saldo de sets;
 *   3. saldo de pontos (games feitos − games tomados);
 *   4. confronto direto entre as EMPATADAS (vitórias nos jogos entre elas).
 *
 * O confronto direto só conta jogos entre duplas empatadas em vitórias E em
 * saldo de pontos. Seed fica só como âncora determinística se as 3 empatam.
 */
export function computePoolStandings(
  poolId: string,
  teamIds: string[],
  matches: GroupMatchData[],
): string[] {
  return computePoolTable(poolId, teamIds, matches).map((row) => row.teamId);
}

/** Uma linha da classificação do grupo, já na ordem final, com os números que
 *  a comparação ENTRE grupos precisa. */
export interface PoolTableRow {
  teamId: string;
  played: number;
  wins: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
}

/** A classificação do grupo com os números de cada dupla — mesma ordem e mesmos
 *  critérios de `computePoolStandings`, que é só a coluna de ids desta tabela. */
export function computePoolTable(
  poolId: string,
  teamIds: string[],
  matches: GroupMatchData[],
): PoolTableRow[] {
  const ids = teamIds.map((id) => id.trim()).filter((id) => id.length > 0);
  if (ids.length === 0) return [];
  const seedIndex = new Map(ids.map((id, index) => [id, index]));

  const stats = new Map<string, TeamStats>();
  for (const teamId of ids) {
    stats.set(teamId, {
      teamId,
      played: 0,
      wins: 0,
      setsWon: 0,
      setsLost: 0,
      gamesWon: 0,
      gamesLost: 0,
      h2hWins: 0,
      h2hSetDiff: 0,
      h2hGameDiff: 0,
    });
  }

  // Partidas concluídas e válidas do grupo, já com placar parseado.
  const played: Array<{
    winnerId: string;
    loserId: string;
    teamAId: string;
    teamBId: string;
    score: MatchScore;
  }> = [];

  for (const match of matches) {
    if (!isGroupStageMatch(match)) continue;
    if ((match.poolId ?? "").trim() !== poolId) continue;
    if (!isMatchCompleted(match.status)) continue;

    const winnerId = (match.winnerId ?? "").trim();
    const teamAId = (match.teamAId ?? "").trim();
    const teamBId = (match.teamBId ?? "").trim();
    if (!winnerId || !teamAId || !teamBId) continue;
    if (!stats.has(teamAId) || !stats.has(teamBId)) continue;

    const score = parseMatchScore(match);
    if (!score) continue;

    const loserId = winnerId === teamAId ? teamBId : teamAId;
    const winnerStats = stats.get(winnerId)!;
    winnerStats.wins++;

    const aStats = stats.get(teamAId)!;
    const bStats = stats.get(teamBId)!;
    aStats.played++;
    bStats.played++;
    aStats.setsWon += score.setsA;
    aStats.setsLost += score.setsB;
    aStats.gamesWon += score.gamesA;
    aStats.gamesLost += score.gamesB;
    bStats.setsWon += score.setsB;
    bStats.setsLost += score.setsA;
    bStats.gamesWon += score.gamesB;
    bStats.gamesLost += score.gamesA;

    played.push({winnerId, loserId, teamAId, teamBId, score});
  }

  // Grupo de games (spec multiesporte, standings por tipo): o saldo de sets entra antes do
  // saldo de games. Pontos segue vitórias → saldo de pontos → confronto direto.
  const games = matches.some((m) =>
    (m.poolId ?? "").trim() === poolId &&
    effectiveScoringProfile(m.scoringProfile, m.bestOf).kind === "sets_games");
  const setDiffOf = (id: string): number => {
    const s = stats.get(id);
    return games && s ? s.setsWon - s.setsLost : 0;
  };

  // Confronto direto: só entre duplas empatadas em todos os critérios anteriores.
  const winsOf = (id: string): number => stats.get(id)?.wins ?? 0;
  const pointDiffOf = (id: string): number => {
    const s = stats.get(id);
    return s ? s.gamesWon - s.gamesLost : 0;
  };
  for (const game of played) {
    if (winsOf(game.teamAId) !== winsOf(game.teamBId)) continue;
    if (setDiffOf(game.teamAId) !== setDiffOf(game.teamBId)) continue;
    if (pointDiffOf(game.teamAId) !== pointDiffOf(game.teamBId)) continue;
    const aStats = stats.get(game.teamAId)!;
    const bStats = stats.get(game.teamBId)!;
    if (game.winnerId === game.teamAId) aStats.h2hWins++;
    else bStats.h2hWins++;
  }

  return [...stats.values()]
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      const setDiff = setDiffOf(b.teamId) - setDiffOf(a.teamId);
      if (setDiff !== 0) return setDiff;
      const gameDiffA = a.gamesWon - a.gamesLost;
      const gameDiffB = b.gamesWon - b.gamesLost;
      if (gameDiffB !== gameDiffA) return gameDiffB - gameDiffA;
      if (b.h2hWins !== a.h2hWins) return b.h2hWins - a.h2hWins;
      return (seedIndex.get(a.teamId) ?? 0) - (seedIndex.get(b.teamId) ?? 0);
    })
    .map(({teamId, played, wins, setsWon, setsLost, gamesWon, gamesLost}) => ({
      teamId,
      played,
      wins,
      setsWon,
      setsLost,
      gamesWon,
      gamesLost,
    }));
}

/** `x/px` contra `y/py` sem ponto flutuante. Quem não jogou (grupo de uma dupla
 *  só) entra com média zero, não com divisão por zero. */
function compareAverageDesc(x: number, px: number, y: number, py: number): number {
  return y * Math.max(px, 1) - x * Math.max(py, 1);
}

/**
 * Classificação ENTRE grupos: para cada colocação (1º, 2º…), ordena as duplas
 * que terminaram nela, do melhor desempenho ao pior. É o que decide quem folga
 * no mata-mata quando `grupos × classificados` não é potência de 2.
 *
 * Tudo por MÉDIA por jogo, porque os grupos podem ter tamanhos diferentes (10
 * duplas em 3 grupos = 4, 3, 3) e total de vitórias premiaria o grupo maior:
 *   1. aproveitamento (vitórias ÷ jogos);
 *   2. só em esporte de games: saldo de sets por jogo;
 *   3. saldo de pontos/games por jogo;
 *   4. pontos/games feitos por jogo;
 *   5. ordem dos grupos — o grupo A recebeu a cabeça de chave mais alta.
 *
 * Confronto direto não entra: duplas de grupos diferentes não se enfrentaram.
 */
export function rankQualifiersAcrossGroups(
  groups: GroupPreview[],
  matches: GroupMatchData[],
): Map<number, string[]> {
  const groupMatches = matches.filter(isGroupStageMatch);
  const usesSets = groupMatches.some(
    (m) => effectiveScoringProfile(m.scoringProfile, m.bestOf).kind === "sets_games",
  );
  const tables = groups.map((group) =>
    computePoolTable(group.id, group.teamIds, groupMatches),
  );
  const deepest = Math.max(0, ...tables.map((table) => table.length));

  const ranked = new Map<number, string[]>();
  for (let index = 0; index < deepest; index++) {
    const rows = tables
      .map((table, groupIndex) => ({row: table[index], groupIndex}))
      .filter((entry): entry is {row: PoolTableRow; groupIndex: number} =>
        entry.row !== undefined,
      );
    rows.sort((a, b) => {
      const byWins = compareAverageDesc(a.row.wins, a.row.played, b.row.wins, b.row.played);
      if (byWins !== 0) return byWins;
      if (usesSets) {
        const bySets = compareAverageDesc(
          a.row.setsWon - a.row.setsLost, a.row.played,
          b.row.setsWon - b.row.setsLost, b.row.played,
        );
        if (bySets !== 0) return bySets;
      }
      const byDiff = compareAverageDesc(
        a.row.gamesWon - a.row.gamesLost, a.row.played,
        b.row.gamesWon - b.row.gamesLost, b.row.played,
      );
      if (byDiff !== 0) return byDiff;
      const byScored = compareAverageDesc(a.row.gamesWon, a.row.played, b.row.gamesWon, b.row.played);
      if (byScored !== 0) return byScored;
      return a.groupIndex - b.groupIndex;
    });
    ranked.set(index + 1, rows.map((entry) => entry.row.teamId));
  }
  return ranked;
}

/** As duas vagas de uma partida do mata-mata, como estão gravadas na chave.
 *  `null` = lado sem vaga de grupo (vazio, ou "Vencedor Jogo #N"). */
export interface KnockoutSlotPair {
  a: KnockoutQualifierSlot | null;
  b: KnockoutQualifierSlot | null;
}

function rankedSlotKey(slot: RankedQualifierSlot): string {
  return `${slot.place}:${slot.rank}`;
}

/** A pior vaga primeiro: colocação mais baixa e, na mesma colocação, pior campanha. */
function worseSlotFirst(a: RankedQualifierSlot, b: RankedQualifierSlot): number {
  return b.place - a.place || b.rank - a.rank;
}

/**
 * Evita que o mata-mata comece repetindo um jogo da fase de grupos.
 *
 * A chave por campanha (total de classificados fora de potência de 2) é montada
 * só pela classificação entre grupos, sem olhar de que grupo cada dupla veio —
 * então "1º · 3ª melhor campanha × 2º · 3ª melhor campanha" pode ser 1º e 2º do
 * MESMO grupo. Aqui, depois que os grupos terminam, a ordem de cada colocação é
 * ajustada o mínimo necessário para desfazer esses reencontros.
 *
 * Só entram os confrontos CERTOS: partidas em que os dois lados já são vaga de
 * grupo (a 1ª rodada, e o encontro direto entre duas duplas que folgam).
 * Confronto que depende de resultado ("× Vencedor Jogo #12") fica de fora.
 *
 * A troca é sempre entre duplas da MESMA colocação e na MESMA situação de folga:
 * um 2º só troca com outro 2º, e quem folga só troca com quem também folga.
 * Ninguém ganha ou perde folga, nem muda de colocação — muda só o adversário.
 * Entre as trocas possíveis vale a mais curta (campanha vizinha) e, no empate,
 * a vizinha de baixo. Move-se a pior vaga do confronto; a melhor só se a pior
 * não tiver com quem trocar. Reencontro sem saída fica como está.
 *
 * Devolve uma classificação NOVA, no mesmo formato de
 * `rankQualifiersAcrossGroups`. Chave de vagas fixas não tem vaga por campanha,
 * então passa intacta.
 */
export function avoidGroupRematches(
  rankedByPlace: Map<number, string[]>,
  pairs: KnockoutSlotPair[],
  groups: GroupPreview[],
): Map<number, string[]> {
  const order = new Map(
    [...rankedByPlace].map(([place, teamIds]) => [place, [...teamIds]]),
  );
  const groupOfTeam = new Map(
    groups.flatMap((group) => group.teamIds.map((teamId) => [teamId.trim(), group.id])),
  );

  // Quem folga aparece duas vezes na chave: na partida de folga e na rodada
  // seguinte. É o que separa "folga" de "joga a 1ª rodada".
  const appearances = new Map<string, number>();
  const slots = new Map<string, RankedQualifierSlot>();
  const opponentOf = new Map<string, RankedQualifierSlot>();
  const certain: Array<[RankedQualifierSlot, RankedQualifierSlot]> = [];
  for (const pair of pairs) {
    const sides = [pair.a, pair.b].filter(
      (slot): slot is RankedQualifierSlot => slot !== null && isRankedQualifierSlot(slot),
    );
    for (const slot of sides) {
      const key = rankedSlotKey(slot);
      slots.set(key, slot);
      appearances.set(key, (appearances.get(key) ?? 0) + 1);
    }
    if (sides.length === 2) {
      certain.push([sides[0]!, sides[1]!]);
      opponentOf.set(rankedSlotKey(sides[0]!), sides[1]!);
      opponentOf.set(rankedSlotKey(sides[1]!), sides[0]!);
    }
  }
  if (certain.length === 0) return order;

  const teamAt = (slot: RankedQualifierSlot): string | undefined =>
    order.get(slot.place)?.[slot.rank - 1];
  const hasBye = (slot: RankedQualifierSlot): boolean =>
    (appearances.get(rankedSlotKey(slot)) ?? 0) > 1;
  const sameGroup = (a: string | undefined, b: string | undefined): boolean => {
    const groupA = a === undefined ? undefined : groupOfTeam.get(a.trim());
    return groupA !== undefined && groupA === (b === undefined ? undefined : groupOfTeam.get(b.trim()));
  };
  /** A dupla que hoje ocupa `slot` reencontra alguém do próprio grupo? */
  const isRematch = (slot: RankedQualifierSlot): boolean => {
    const opponent = opponentOf.get(rankedSlotKey(slot));
    return opponent !== undefined && sameGroup(teamAt(slot), teamAt(opponent));
  };
  const swap = (a: RankedQualifierSlot, b: RankedQualifierSlot): void => {
    const tier = order.get(a.place);
    if (!tier) return;
    [tier[a.rank - 1], tier[b.rank - 1]] = [tier[b.rank - 1]!, tier[a.rank - 1]!];
  };

  /** Troca `slot` com a vaga mais próxima da mesma colocação e mesma situação
   *  de folga que não deixe NENHUMA das duas num reencontro. */
  const trySwap = (slot: RankedQualifierSlot): boolean => {
    const candidates = [...slots.values()]
      .filter((other) =>
        other.place === slot.place &&
        other.rank !== slot.rank &&
        hasBye(other) === hasBye(slot))
      .sort((x, y) =>
        Math.abs(x.rank - slot.rank) - Math.abs(y.rank - slot.rank) || y.rank - x.rank);
    for (const other of candidates) {
      swap(slot, other);
      if (!isRematch(slot) && !isRematch(other)) return true;
      swap(slot, other);
    }
    return false;
  };

  // Cada troca aceita desfaz um reencontro sem criar outro, então o total só
  // cai — o laço termina em no máximo um passo por confronto certo.
  for (let step = 0; step < certain.length; step++) {
    const fixedOne = certain
      .filter(([a]) => isRematch(a))
      .some((match) => [...match].sort(worseSlotFirst).some(trySwap));
    if (!fixedOne) break;
  }
  return order;
}

function parseQualifierSlot(raw: unknown): KnockoutQualifierSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const slot = raw as Record<string, unknown>;
  const place = slot.place;
  if (typeof place !== "number" || place < 1) return null;
  const rank = slot.rank;
  if (typeof rank === "number") return rank >= 1 ? {place, rank} : null;
  const poolId = String(slot.poolId ?? "").trim();
  if (!poolId) return null;
  return {poolId, place};
}

/** Quem ocupa a vaga, dado o resultado dos grupos. Vaga fixa lê a classificação
 *  do próprio grupo; vaga por ranking lê a classificação entre grupos. */
export function teamIdForQualifier(
  slot: KnockoutQualifierSlot,
  standingsByPool: Map<string, string[]>,
  rankedByPlace: Map<number, string[]>,
): string | null {
  if (isRankedQualifierSlot(slot)) {
    return rankedByPlace.get(slot.place)?.[slot.rank - 1]?.trim() || null;
  }
  const ranked = standingsByPool.get(slot.poolId) ?? [];
  return ranked[slot.place - 1]?.trim() || null;
}

export interface FillKnockoutResult {
  filled: boolean;
  slotsFilled: number;
}

/** Preenche slots do mata-mata quando todos os grupos terminam a fase classificatória. */
export async function tryFillKnockoutFromGroupStandings(
  db: Firestore,
  matchesPath: string,
  tournamentId: string,
  categoryId: string,
  groups: GroupPreview[],
): Promise<FillKnockoutResult> {
  if (groups.length === 0) {
    return {filled: false, slotsFilled: 0};
  }

  const snap = await db
    .collection(matchesPath)
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const matches = snap.docs.map((doc) => doc.data() as GroupMatchData);
  const groupMatches = matches.filter(isGroupStageMatch);

  for (const group of groups) {
    if (!isPoolRoundRobinComplete(group.id, group.teamIds, groupMatches)) {
      return {filled: false, slotsFilled: 0};
    }
  }

  const standingsByPool = new Map<string, string[]>();
  for (const group of groups) {
    standingsByPool.set(
      group.id,
      computePoolStandings(group.id, group.teamIds, groupMatches),
    );
  }

  // A classificação entre grupos decide as vagas por campanha; antes de
  // preencher, desfaz os confrontos que repetiriam um jogo da fase de grupos.
  const knockoutPairs: KnockoutSlotPair[] = snap.docs
    .map((doc) => doc.data())
    .filter((data) => data.isGroupMatch !== true)
    .map((data) => ({
      a: parseQualifierSlot(data.teamAQualifier),
      b: parseQualifierSlot(data.teamBQualifier),
    }));
  const rankedByPlace = avoidGroupRematches(
    rankQualifiersAcrossGroups(groups, groupMatches),
    knockoutPairs,
    groups,
  );

  let slotsFilled = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.isGroupMatch === true) continue;
    if ((data.round as number) < 1) continue;

    const patch: Record<string, unknown> = {};
    const teamAQualifier = parseQualifierSlot(data.teamAQualifier);
    const teamBQualifier = parseQualifierSlot(data.teamBQualifier);

    if (teamAQualifier && !(data.teamAId as string | undefined)?.trim()) {
      const teamId = teamIdForQualifier(teamAQualifier, standingsByPool, rankedByPlace);
      if (teamId) {
        patch.teamAId = teamId;
        slotsFilled++;
      }
    }
    if (teamBQualifier && !(data.teamBId as string | undefined)?.trim()) {
      const teamId = teamIdForQualifier(teamBQualifier, standingsByPool, rankedByPlace);
      if (teamId) {
        patch.teamBId = teamId;
        slotsFilled++;
      }
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = FieldValue.serverTimestamp();
      await doc.ref.update(patch);
    }
  }

  return {filled: slotsFilled > 0, slotsFilled};
}
