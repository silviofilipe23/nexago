/* eslint-disable */
/**
 * Decisão da fusão de duas contas do MESMO atleta — camada PURA, sem
 * `firebase-admin` e sem I/O, para que
 * `functions/test/merge-athlete-accounts-plan.test.mjs` possa travar a regra.
 * O script `scripts/merge-athlete-accounts.js` é só a casca de leitura/escrita.
 *
 * Três regras sustentam o desenho:
 *
 *  1. O uid absorvido é trocado onde aparece INTEIRO: como valor (`player1Id`,
 *     `participantUids[]`) ou como CHAVE de mapa (`pre`/`post` dos
 *     `ratingEvents`, que são mapas por uid). Ocorrência como pedaço de texto
 *     (`pairKey`, id de doc) não tem troca genérica segura — ou tem regra
 *     própria aqui (equipe, docs de ranking/rating chaveados pelo uid) ou
 *     BLOQUEIA a fusão para revisão manual.
 *  2. Doc que cita as DUAS contas bloqueia: depois da troca a mesma pessoa
 *     ocuparia duas vagas (dupla consigo mesma, seguir a si mesma).
 *  3. Ranking soma por `tournamentId_categoryId`, a mesma chave do upsert do
 *     backfill por esporte. A mesma categoria nas duas contas bloqueia: seriam
 *     duas equipes do mesmo atleta na mesma chave, e escolher uma perderia
 *     pontos em silêncio.
 */

const {buildPairKey} = require("./merge-pair-teams-plan.js");

function isPlainObject(value) {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.toDate !== "function" &&
    typeof value.toMillis !== "function" &&
    typeof value.isEqual !== "function"
  );
}

/**
 * Troca `from` por `to` em toda string aninhada igual a `from` e em toda chave
 * de mapa igual a `from`. Devolve null se nada mudou. Timestamps, GeoPoints e
 * referências passam intactos (não são objetos "planos").
 */
function remapUid(value, from, to) {
  if (typeof value === "string") return value === from ? to : null;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = remapUid(item, from, to);
      if (next === null) return item;
      changed = true;
      return next;
    });
    return changed ? out : null;
  }
  if (isPlainObject(value)) {
    let changed = false;
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      const nextKey = key === from ? to : key;
      const next = remapUid(inner, from, to);
      if (nextKey !== key || next !== null) changed = true;
      out[nextKey] = next === null ? inner : next;
    }
    return changed ? out : null;
  }
  return null;
}

/** O texto do doc (id + dado) ainda cita o uid em algum lugar? */
function mentionsUid(docId, data, uid) {
  return `${docId} ${JSON.stringify(data)}`.includes(uid);
}

/**
 * Tipo de cada doc que cita o uid absorvido, decidido pelo CAMINHO:
 *  - `owned`: o próprio perfil e tudo debaixo dele — apagado no fim.
 *  - `ranking` / `rankingBySport` / `rating`: chaveados pelo uid; os dois
 *    primeiros somam no doc da conta que fica, o rating é refeito pelo replay
 *    do ledger e o doc do absorvido só é apagado.
 *  - `team`: troca o jogador e recalcula `pairKey`.
 *  - `generic`: troca de valor/chave pelo `remapUid`.
 * Qualquer outro doc com o uid no PRÓPRIO caminho (ex.:
 * `users/{x}/following/{uid}`) vira `blocked` — não existe troca de id segura
 * sem conhecer a semântica da coleção.
 */
function classifyPath(path, {base, from}) {
  const ownedRoots = [`users/${from}`, `public_profiles/${from}`, `athlete_profiles/${from}`];
  for (const root of ownedRoots) {
    if (path === root || path.startsWith(`${root}/`)) return {kind: "owned"};
  }
  if (path === `${base}/athleteRankings/${from}`) return {kind: "ranking"};
  const bySport = `${base}/athleteRankingsBySport/${from}_`;
  if (path.startsWith(bySport) && !path.slice(bySport.length).includes("/")) {
    return {kind: "rankingBySport", sportCode: path.slice(bySport.length)};
  }
  const rating = `${base}/athleteRatings/${from}_`;
  if (path.startsWith(rating) && !path.slice(rating.length).includes("/")) {
    return {kind: "rating", sportCode: path.slice(rating.length)};
  }
  if (path.includes(from)) return {kind: "blocked", reason: "uid no caminho do doc"};
  if (path.startsWith(`${base}/teams/`) && !path.slice(`${base}/teams/`.length).includes("/")) {
    return {kind: "team"};
  }
  return {kind: "generic"};
}

/** Doc `generic` remapeado: `{data}` com a troca, ou `{blocked}`. */
function planGenericRemap(docId, data, {from, to}) {
  if (mentionsUid(docId, data, to)) {
    return {blocked: "cita as duas contas — a troca deixaria a mesma pessoa duas vezes"};
  }
  const next = remapUid(data, from, to);
  if (next === null || mentionsUid(docId, next, from)) {
    return {blocked: "o uid aparece como pedaço de texto, não como valor inteiro"};
  }
  return {data: next};
}

/**
 * Equipe: troca o jogador, recalcula `pairKey` (se a equipe tinha) e põe o nome
 * da conta que fica no slot trocado. As `keywords` de busca dependem do motor
 * compilado (`buildTeamSearchFields`) e ficam com a casca.
 */
function planTeamPatch(docId, team, {from, to, toDisplayName}) {
  if (mentionsUid(docId, team, to)) {
    return {blocked: "a equipe já tem a outra conta — viraria dupla consigo mesma"};
  }
  const next = remapUid(team, from, to);
  if (next === null) return {blocked: "equipe cita o uid só como pedaço de texto"};
  for (const slot of [1, 2]) {
    if (team[`player${slot}Id`] === from && toDisplayName) {
      next[`player${slot}DisplayName`] = toDisplayName;
    }
  }
  if (typeof team.pairKey === "string" && team.pairKey) {
    const pairKey = buildPairKey(next.player1Id, next.player2Id);
    if (!pairKey) return {blocked: "pairKey não pôde ser recalculado"};
    next.pairKey = pairKey;
  }
  if (mentionsUid(docId, next, from)) {
    return {blocked: "a equipe ainda cita o uid depois da troca"};
  }
  return {data: next};
}

function rankingResultKey(result) {
  return `${String(result?.tournamentId ?? "").trim()}_${String(result?.categoryId ?? "").trim()}`;
}

/**
 * Junta os `results` do ranking absorvido nos da conta que fica. `intoData`
 * null = a conta que fica ainda não tem doc (nasce só com os do absorvido).
 * Devolve `{results, scaleVersion}` ou `{blocked}`; os agregados (`totalPoints`,
 * `pointsByYear`, `tournamentsCount`) são do motor (`aggregateRankingResults`).
 */
function planRankingMerge(intoData, fromData) {
  const fromResults = Array.isArray(fromData?.results) ? fromData.results : [];
  const intoResults = Array.isArray(intoData?.results) ? intoData.results : [];
  const fromScale = Number(fromData?.scaleVersion) || 0;
  if (intoData) {
    const intoScale = Number(intoData.scaleVersion) || 0;
    if (intoScale !== fromScale) {
      return {blocked: `scaleVersion divergente (${intoScale} × ${fromScale})`};
    }
  }
  const taken = new Set(intoResults.map(rankingResultKey));
  const collisions = fromResults.map(rankingResultKey).filter((key) => taken.has(key));
  if (collisions.length > 0) {
    return {blocked: `mesma categoria nas duas contas: ${collisions.join(", ")}`};
  }
  return {results: [...intoResults, ...fromResults], scaleVersion: fromScale};
}

module.exports = {
  remapUid,
  mentionsUid,
  classifyPath,
  planGenericRemap,
  planTeamPatch,
  planRankingMerge,
};
