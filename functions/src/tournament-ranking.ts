import {
  FieldValue,
  Timestamp,
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {isMatchCompleted} from "./match-status";
import {
  loadCategoryBracketContext,
  loadKnockoutTeamIds,
  loadTeamAthleteIds,
  normalizeMatchType,
  resolveLeaguePlacementsFromMatch,
  type LeaguePlacementAward,
} from "./league-ranking";
import {tournamentSportToLevelSportCode} from "./category-level-eligibility";
import {
  fieldStrengthDocId,
  fieldStrengthPath,
  fieldStrengthStampPayload,
  loadPaidTeamsWithParticipants,
  measureFieldStrength,
  readFieldStrengthStamp,
  shouldStampFieldStrength,
} from "./category-field-strength-store";
import {clampMeasuredWeight} from "./category-field-strength";
import {parseMatchPlayedAt} from "./tournament-match-gamification";
import {shouldProcessRatingUpdate as shouldAwardForMatch} from "./rating-engine";
import {artifactsPublicDataBase} from "./firebase-paths";
import {
  categoryPreset,
  LEGACY_CATEGORY_WEIGHT,
  type CategoryPreset,
} from "./category-presets";
import {findCategory} from "./tournament-registration-guards";

/**
 * Ranking global por pontos (estilo federação) — preenche o schema que o app
 * já lê (`tournamentCategoryResults`, `athleteRankings`, `teamRankings`),
 * reutilizando a resolução de colocações da engine de liga mas SEM o gate de
 * `leagueId`: todo torneio pontua.
 *
 * Tabela autoritativa base 1000 (fase 3 — ×10 da base histórica 100, paridade
 * de PROPORÇÕES com `pointsByPlace` de
 * `nexago_app/lib/features/ranking/domain/ranking_constants.dart`, que dá 330
 * aos lugares 5-8). Pontos = base × `pointsMultiplier`, onde
 * `pointsMultiplier = presetWeight × tournaments/{id}.rankingWeight ×
 * bracketSizeFactor(paidTeamsCount)` (`rankingWeight` default 1.0, grade do
 * torneio). `presetWeight` NUNCA é lido de um campo gravado: deriva de
 * `categoryPreset(category)` a partir de `level`/`minLevel` da categoria a
 * cada premiação — categoria sem preset reconhecido (legada) cai em
 * `LEGACY_CATEGORY_WEIGHT` (1). `bracketSizeFactor` (D7) protege o topo do
 * ranking de chaves minúsculas premiando pódio cheio: some sozinho quando as
 * duplas pagas da categoria chegam a 8. Arredondamento acontece uma única
 * vez, no fim (`globalPointsForAward`).
 */
export const DEFAULT_GLOBAL_POINTS: Record<string, number> = {
  "1": 1000,
  "2": 800,
  "3": 600,
  "4": 500,
  quarters: 330,
  r16: 200,
  r32: 130,
  groups: 100,
};

/**
 * Carimbo de escala gravado em `tournamentCategoryResults` e nos docs de
 * `athleteRankings`/`teamRankings` — versão 2 = base ×10 (fase 3, este
 * arquivo). Docs escritos pelo motor a partir daqui já nascem carimbados;
 * `functions/scripts/backfill-ranking-scale-x10.js` usa este mesmo valor
 * como marca de idempotência ao migrar o histórico pré-×10.
 */
export const RANKING_SCALE_VERSION = 2;

/** Menos de 10 duplas pagas = desafio: não pontua no ranking global. */
export const MIN_TEAMS_FOR_GLOBAL_RANKING = 10;

/**
 * Esportes que já pontuavam no ranking geral (códigos de `profileCode` do catálogo). O ranking
 * ainda não tem `sport` (fase 3 do spec multiesporte): um esporte novo misturaria os pontos com
 * os do vôlei, então fica fora até lá. `null` = esporte não reconhecido, que sempre pontuou.
 */
export const GLOBAL_RANKING_SPORT_CODES: ReadonlySet<string> = new Set(["VOLEI_PRAIA", "VOLEI_QUADRA", "FUTEVOLEI"]);

/** Etapa de liga é isenta; torneio avulso exige toggle ligado e categoria cheia. Esporte que
 *  nunca pontuou (hoje: beach tennis) fica fora em qualquer caso, até a fase 3. */
export function isGlobalRankingEligible(params: {
  isLeagueStage: boolean;
  rankingEnabled: boolean;
  paidTeamsCount: number;
  sportCode?: string | null;
}): boolean {
  if (params.sportCode != null && !GLOBAL_RANKING_SPORT_CODES.has(params.sportCode)) return false;
  if (params.isLeagueStage) return true;
  return (
    params.rankingEnabled &&
    params.paidTeamsCount >= MIN_TEAMS_FOR_GLOBAL_RANKING
  );
}

/**
 * Modulador por tamanho de chave (D7): protege o ranking de chaves
 * minúsculas no topo (Elite de 3 duplas valendo pódio cheio). Baseado nas
 * duplas PAGAS da categoria — mesma contagem do gate de desafio. Some
 * sozinho quando as chaves enchem.
 */
export function bracketSizeFactor(paidTeamsCount: number): number {
  if (paidTeamsCount >= 8) return 1;
  if (paidTeamsCount >= 4) return 0.6;
  return 0.25;
}

export function tournamentCategoryResultsPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/tournamentCategoryResults`;
}

export function athleteRankingsPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/athleteRankings`;
}

export function teamRankingsPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/teamRankings`;
}

/**
 * Ranking geral POR ESPORTE (spec multiesporte, fase 3): `{athleteId}_{profileCode}` em coleção
 * própria. Na coleção legada, o app da loja (que lê a coleção inteira e usa o `doc.id` como
 * atleta) mostraria um atleta fantasma por doc, e a limpeza de dados de teste o apagaria.
 */
export function athleteRankingsBySportPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/athleteRankingsBySport`;
}

export function teamRankingsBySportPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/teamRankingsBySport`;
}

/** Id do doc por esporte. */
export function rankingBySportDocId(id: string, sportCode: string): string {
  return `${id}_${sportCode}`;
}

/** O doc legado (somado, lido pelo app da loja) só recebe os esportes que já pontuavam. */
export function feedsLegacyRanking(sportCode: string | null | undefined): boolean {
  return sportCode == null || GLOBAL_RANKING_SPORT_CODES.has(sportCode);
}

/**
 * Colocação persistida: 1-4 direto; abaixo do pódio guarda o TOPO da faixa do
 * degrau (quartas 5, oitavas 9, 16-avos 17). Participação é 0 — "sem colocação
 * de mata-mata"; era 9 antes da escada por fase alcançada, e o script de
 * re-derivação converte o histórico.
 */
export function finalPlaceForAward(award: LeaguePlacementAward): number {
  if (award.place != null) return award.place;
  switch (award.bucket) {
  case "quarters":
    return 5;
  case "r16":
    return 9;
  case "r32":
    return 17;
  default:
    return 0;
  }
}

export function globalPointsForAward(
  award: LeaguePlacementAward,
  multiplier: number,
): number {
  const base =
    award.place != null
      ? DEFAULT_GLOBAL_POINTS[String(award.place)] ?? 0
      : award.bucket != null
        ? DEFAULT_GLOBAL_POINTS[award.bucket] ?? 0
        : 0;
  const safeMultiplier =
    Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return Math.max(0, Math.round(base * safeMultiplier));
}

export interface GlobalRankingResultEntry {
  tournamentId: string;
  categoryId: string;
  finalPlace: number;
  points: number;
  year: number;
  /** Código do esporte do torneio (profileCode); ausente em resultado antigo/desconhecido. */
  sport?: string;
}

/**
 * Agregados do doc de ranking: `pointsByYear[y]` soma TODOS os resultados do
 * ano — sem descarte — e `totalPoints` soma os anos.
 */
export function aggregateRankingResults(
  results: GlobalRankingResultEntry[],
): {
  totalPoints: number;
  tournamentsCount: number;
  pointsByYear: Record<string, number>;
} {
  const byYear = new Map<string, number[]>();
  for (const result of results) {
    const key = String(result.year);
    const list = byYear.get(key) ?? [];
    list.push(Math.max(0, Math.round(result.points)));
    byYear.set(key, list);
  }
  const pointsByYear: Record<string, number> = {};
  let totalPoints = 0;
  for (const [year, points] of byYear) {
    const yearPoints = points.reduce((sum, value) => sum + value, 0);
    pointsByYear[year] = yearPoints;
    totalPoints += yearPoints;
  }
  return {totalPoints, tournamentsCount: results.length, pointsByYear};
}

function parseResults(raw: unknown): GlobalRankingResultEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: GlobalRankingResultEntry[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const tournamentId = String(row.tournamentId ?? "").trim();
    const categoryId = String(row.categoryId ?? "").trim();
    if (!tournamentId || !categoryId) continue;
    out.push({
      tournamentId,
      categoryId,
      finalPlace: Number(row.finalPlace) || 0,
      points: Number(row.points) || 0,
      year: Number(row.year) || 0,
      ...(typeof row.sport === "string" && row.sport ? {sport: row.sport} : {}),
    });
  }
  return out;
}

/** Upsert de `results[]` por `tournamentId_categoryId`; devolve null se nada mudou. */
export function upsertRankingResult(
  results: GlobalRankingResultEntry[],
  entry: GlobalRankingResultEntry,
): GlobalRankingResultEntry[] | null {
  const existing = results.find(
    (row) =>
      row.tournamentId === entry.tournamentId &&
      row.categoryId === entry.categoryId,
  );
  if (
    existing &&
    existing.finalPlace === entry.finalPlace &&
    existing.points === entry.points &&
    existing.year === entry.year &&
    existing.sport === entry.sport
  ) {
    return null;
  }
  const filtered = results.filter(
    (row) =>
      !(
        row.tournamentId === entry.tournamentId &&
        row.categoryId === entry.categoryId
      ),
  );
  filtered.push(entry);
  return filtered;
}

async function upsertGlobalRankingDoc(
  db: Firestore,
  params: {
    collectionPath: string;
    docId: string;
    identity: Record<string, string>;
    entry: GlobalRankingResultEntry;
  },
): Promise<boolean> {
  const ref = db.collection(params.collectionPath).doc(params.docId);
  const snap = await ref.get();
  const prev = snap.data() ?? {};
  let results = parseResults(prev.results);

  // Migração on-write (paridade com backfill-ranking-scale-x10.js): se o doc
  // existe mas ainda não foi carimbado na escala atual, reescala ×10 os
  // `results[].points` ANTIGOS antes de mesclar a nova entrada. Sem isso, a
  // janela deploy→script deixava o doc com pontos ×1 (antigos) e ×10 (novo)
  // misturados, e mesmo assim carimbado com scaleVersion:2 — escapando pra
  // sempre da varredura do script (mode A da corrida documentada no cabeçalho
  // do backfill). Torna a janela deploy→script inofensiva.
  const prevScaleVersion = Number(prev.scaleVersion) || 0;
  if (snap.exists && prevScaleVersion < RANKING_SCALE_VERSION) {
    results = results.map((row) => ({...row, points: Math.round(row.points * 10)}));
  }

  const merged = upsertRankingResult(results, params.entry);
  if (merged == null) return false;

  const aggregates = aggregateRankingResults(merged);
  await ref.set(
    {
      ...params.identity,
      results: merged,
      totalPoints: aggregates.totalPoints,
      tournamentsCount: aggregates.tournamentsCount,
      pointsByYear: aggregates.pointsByYear,
      scaleVersion: RANKING_SCALE_VERSION,
      lastUpdated: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  return true;
}

/**
 * Grava UMA colocação no ranking global (resultado por categoria + docs de
 * dupla e atletas). Exportada para `scripts/award-koc-tournament-ranking.js`,
 * que premia um KOTC por exceção pelo mesmo caminho de escrita do motor.
 */
export async function awardGlobalPlacement(
  db: Firestore,
  projectId: string,
  params: {
    tournamentId: string;
    categoryId: string;
    award: LeaguePlacementAward;
    pointsMultiplier: number;
    year: number;
    completedAt: Date;
    /** Código do esporte do torneio (profileCode) ou `null` quando não reconhecido. */
    sportCode?: string | null;
  },
): Promise<boolean> {
  const {tournamentId, categoryId, award} = params;
  const sportCode = params.sportCode ?? null;
  const teamId = award.teamId;
  const points = globalPointsForAward(award, params.pointsMultiplier);
  if (points <= 0) return false;
  const finalPlace = finalPlaceForAward(award);

  // Resultado por categoria (contrato do model Dart `TournamentCategoryResult`).
  const resultRef = db
    .collection(tournamentCategoryResultsPath(projectId))
    .doc(`${tournamentId}_${categoryId}_${teamId}`);
  const resultSnap = await resultRef.get();
  const prevResult = resultSnap.data();
  // Resultado antigo sem `sport` NÃO é no-op: precisa ganhar o campo e o doc por esporte.
  if (
    prevResult?.finalPlace === finalPlace &&
    prevResult?.pointsEarned === points &&
    (sportCode == null || prevResult?.sport === sportCode)
  ) {
    return false;
  }
  await resultRef.set({
    tournamentId,
    categoryId,
    teamId,
    finalPlace,
    pointsEarned: points,
    year: params.year,
    completedAt: Timestamp.fromDate(params.completedAt),
    scaleVersion: RANKING_SCALE_VERSION,
    ...(sportCode ? {sport: sportCode} : {}),
  });

  const entry: GlobalRankingResultEntry = {
    tournamentId,
    categoryId,
    finalPlace,
    points,
    year: params.year,
    ...(sportCode ? {sport: sportCode} : {}),
  };
  const athleteIds = await loadTeamAthleteIds(db, projectId, teamId);

  // Legado (somado, lido pelo app da loja): só os esportes que já pontuavam.
  if (feedsLegacyRanking(sportCode)) {
    await upsertGlobalRankingDoc(db, {
      collectionPath: teamRankingsPath(projectId),
      docId: teamId,
      identity: {teamId},
      entry,
    });
    await Promise.all(
      athleteIds.map((athleteId) =>
        upsertGlobalRankingDoc(db, {
          collectionPath: athleteRankingsPath(projectId),
          docId: athleteId,
          identity: {athleteId},
          entry,
        }),
      ),
    );
  }

  // Por esporte: o doc do esporte do torneio. Esporte não reconhecido não tem doc.
  if (sportCode) {
    await upsertGlobalRankingDoc(db, {
      collectionPath: teamRankingsBySportPath(projectId),
      docId: rankingBySportDocId(teamId, sportCode),
      identity: {teamId, sport: sportCode},
      entry,
    });
    await Promise.all(
      athleteIds.map((athleteId) =>
        upsertGlobalRankingDoc(db, {
          collectionPath: athleteRankingsBySportPath(projectId),
          docId: rankingBySportDocId(athleteId, sportCode),
          identity: {athleteId, sport: sportCode},
          entry,
        }),
      ),
    );
  }
  return true;
}

function isNonGroupCompletedMatch(match: Record<string, unknown>): boolean {
  if (!isMatchCompleted(match.status)) return false;
  const matchType = normalizeMatchType(match.matchType);
  return !(
    match.isGroupMatch === true ||
    matchType === "group" ||
    matchType === "groups"
  );
}

/**
 * Peso de uma categoria de peso MEDIDO — Livre ou "até X" (spec 2026-09-30).
 * Ordem: carimbo gravado (o normal, feito na publicação da chave) → medição na
 * hora + carimbo `lazy` (chave publicada antes do deploy) → peso declarado
 * (campo imensurável, e aí NÃO carimba, para que uma medição futura ainda possa
 * acontecer). O teto é o do preset: 1 no Livre, a família de X no "até X".
 */
async function resolveMeasuredWeight(
  db: Firestore,
  projectId: string,
  params: {
    tournamentId: string;
    categoryId: string;
    preset: CategoryPreset;
    sportCode: string | null;
    paidTeams: Map<string, string[]>;
  },
): Promise<number> {
  const stamped = await readFieldStrengthStamp(
    db,
    projectId,
    params.tournamentId,
    params.categoryId,
  );
  // Piso/teto de novo na leitura: o backfill (tasks futuras) escreve estes
  // docs, e um bug lá não pode escapar sem clamp e amplificar a premiação.
  if (stamped) {
    return clampMeasuredWeight(stamped.weight, params.preset.maxWeight);
  }

  const measured = await measureFieldStrength(db, projectId, {
    tournamentId: params.tournamentId,
    categoryId: params.categoryId,
    presetKey: params.preset.key,
    maxWeight: params.preset.maxWeight,
    sportCode: params.sportCode,
    teams: params.paidTeams,
    source: "lazy",
  });
  if (!measured) return params.preset.weight;

  // Só carimba com cobertura suficiente (`shouldStampFieldStrength`): uma
  // medição de minoria enviesa para cima e congelaria o erro para sempre. Sem
  // cobertura, o peso medido vale só nesta premiação.
  if (shouldStampFieldStrength(measured)) {
    // A escrita do carimbo é só metadado — se falhar, a premiação não pode
    // parar por isso (daí o try/catch isolado só nela).
    try {
      await db
        .doc(
          `${fieldStrengthPath(projectId)}/` +
            `${fieldStrengthDocId(params.tournamentId, params.categoryId)}`,
        )
        .set(fieldStrengthStampPayload(measured));
      logger.info(
        `globalRanking: força do campo medida em ${params.tournamentId}/${params.categoryId} ` +
          `— degrau ${measured.fieldRank.toFixed(2)}, peso ${measured.weight}`,
      );
    } catch (e) {
      logger.warn(
        `globalRanking: falha ao carimbar força do campo em ` +
          `${params.tournamentId}/${params.categoryId} — seguindo com o peso medido`,
        e,
      );
    }
  }
  return measured.weight;
}

/**
 * Concede pontos de ranking global pela partida encerrada — espelha
 * `tryAwardLeagueStagePointsForMatch`, mas incondicional a `leagueId`.
 */
export async function tryAwardGlobalRankingForMatch(
  db: Firestore,
  projectId: string,
  match: Record<string, unknown>,
): Promise<{awarded: boolean; teamsUpdated: number}> {
  if (!isMatchCompleted(match.status)) {
    return {awarded: false, teamsUpdated: 0};
  }
  const tournamentId = String(match.tournamentId ?? "").trim();
  const categoryId = String(match.categoryId ?? "").trim();
  if (!tournamentId || !categoryId) {
    return {awarded: false, teamsUpdated: 0};
  }

  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) return {awarded: false, teamsUpdated: 0};
  const tournament = tournamentSnap.data() ?? {};
  // Saneado na leitura: 0/negativo/NaN caem no default 1, em vez de deixar o
  // guard do produto composto em `globalPointsForAward` colapsar TUDO pra 1
  // (Livre pagaria 1000 igual ao topo do Elite). O guard do produto composto
  // segue como última linha de defesa, não a única.
  const rawRankingWeight = Number(tournament.rankingWeight ?? 1);
  const rankingWeight =
    Number.isFinite(rawRankingWeight) && rawRankingWeight > 0 ? rawRankingWeight : 1;
  const isLeagueStage = String(tournament.leagueId ?? "").trim().length > 0;
  const rankingEnabled = tournament.rankingEnabled !== false;

  // Peso do preset NUNCA vem de campo gravado: deriva de level/minLevel da
  // categoria a cada premiação (à prova de adulteração no cliente).
  const category = findCategory(tournament as never, categoryId);
  if (!category) {
    logger.warn(
      `globalRanking: categoria ${categoryId} não encontrada no torneio ${tournamentId} — ` +
        `usando peso legado (${LEGACY_CATEGORY_WEIGHT})`,
    );
  }
  const preset = categoryPreset(category);

  const completedAt = parseMatchPlayedAt(match);
  const year = completedAt.getFullYear();

  const bracketContext = await loadCategoryBracketContext(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  const placements = resolveLeaguePlacementsFromMatch(match, bracketContext);
  const shouldAwardGroupsBucket = isNonGroupCompletedMatch(match);
  if (placements.length === 0 && !shouldAwardGroupsBucket) {
    return {awarded: false, teamsUpdated: 0};
  }

  // Gate de desafio: avaliado a cada premiação, com a mesma contagem de pagas
  // que o bucket "groups" usa (query única, reaproveitada abaixo).
  // Mesma query de antes, devolvendo também os integrantes — a medição da força
  // do campo (Livre) sai deste snapshot, sem leitura nova.
  const paidTeams = await loadPaidTeamsWithParticipants(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  const paidTeamIds = new Set(paidTeams.keys());
  if (
    // O esporte não barra mais a premiação: decide em QUAL doc ela cai (legado só para os
    // esportes que já pontuavam; por esporte sempre que o esporte é reconhecido — fase 3a).
    !isGlobalRankingEligible({
      isLeagueStage,
      rankingEnabled,
      paidTeamsCount: paidTeamIds.size,
    })
  ) {
    logger.info(
      `globalRanking: ${tournamentId}/${categoryId} inelegível ` +
        `(liga=${isLeagueStage}, rankingEnabled=${rankingEnabled}, pagas=${paidTeamIds.size})`,
    );
    return {awarded: false, teamsUpdated: 0};
  }

  // Peso do preset. Livre e "até X" são a exceção: a faixa declarada dá 0.125
  // pelo PISO, o que pune um campo forte, então o peso vem da força REAL medida
  // (com teto no preset) — carimbada na publicação da chave, ou medida aqui e
  // carimbada se faltar.
  let presetWeight = preset?.weight ?? LEGACY_CATEGORY_WEIGHT;
  if (preset?.measured) {
    presetWeight = await resolveMeasuredWeight(db, projectId, {
      tournamentId,
      categoryId,
      preset,
      sportCode: tournamentSportToLevelSportCode(tournament.sport),
      paidTeams,
    });
  }

  const pointsMultiplier =
    presetWeight * rankingWeight * bracketSizeFactor(paidTeamIds.size);
  const sportCode = tournamentSportToLevelSportCode(tournament.sport);
  const baseParams = {tournamentId, categoryId, pointsMultiplier, year, completedAt, sportCode};
  let teamsUpdated = 0;
  for (const award of placements) {
    if (await awardGlobalPlacement(db, projectId, {...baseParams, award})) {
      teamsUpdated++;
    }
  }

  // Times pagos que não chegaram ao mata-mata pontuam pela fase de grupos
  // (mesma regra da liga: só a partir da 1ª partida de mata-mata concluída).
  // O Livre voltou a conceder participação (spec 2026-09-10, D4): o farm que a
  // exceção combatia agora está PRECIFICADO — num campo fraco a participação
  // vale 13 pontos, num campo forte vale 100 — e a exceção estava deixando
  // dupla pagante com zero (18 casos num único torneio).
  if (shouldAwardGroupsBucket) {
    const knockoutTeamIds = await loadKnockoutTeamIds(
      db,
      projectId,
      tournamentId,
      categoryId,
    );
    for (const teamId of paidTeamIds) {
      if (knockoutTeamIds.has(teamId)) continue;
      const awarded = await awardGlobalPlacement(db, projectId, {
        ...baseParams,
        award: {teamId, bucket: "groups"},
      });
      if (awarded) teamsUpdated++;
    }
  }

  return {awarded: teamsUpdated > 0, teamsUpdated};
}

/**
 * Trigger desacoplado no mesmo path de matches (coexiste com o advance de
 * chave e o XP, padrão `onTournamentMatchCompletedAwardXp`).
 */
export const onTournamentMatchCompletedAwardGlobalPoints = onDocumentUpdated(
  "artifacts/{appId}/public/data/matches/{matchId}",
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!shouldAwardForMatch(before, after) || !after) return;

    try {
      const result = await tryAwardGlobalRankingForMatch(
        getFirestore(),
        event.params.appId,
        {...after, id: event.params.matchId},
      );
      if (result.teamsUpdated > 0) {
        logger.info(
          `globalRanking: ${result.teamsUpdated} time(s) atualizados pela partida ${event.params.matchId}`,
        );
      }
    } catch (error) {
      logger.error(
        `globalRanking: falha na partida ${event.params.matchId}`,
        error,
      );
    }
  },
);
