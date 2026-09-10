/* eslint-disable */
/**
 * Recálculo retroativo do ranking geral com os pesos da fase 3.
 *
 * PROBLEMA (19/08): a fase 3 pôs peso por preset de categoria, grade do
 * torneio (`rankingWeight`) e modulador por tamanho de chave em
 * `functions/src/tournament-ranking.ts` — mas só para premiações NOVAS. O
 * `backfill-ranking-scale-x10.js` que rodou antes fez apenas a reescala ×10,
 * por decisão explícita da spec (D9: "na regra antiga toda categoria pagava
 * tabela cheia, então old×10 = o que a regra da época teria pago"). Resultado
 * prático: campeão de uma categoria intermediária antiga vale 1000 no ranking,
 * enquanto o campeão da mesma categoria hoje vale 250 (1000 × 0.25). Este
 * script é a EMENDA daquela decisão — reescreve o histórico com a fórmula
 * vigente, para que passado e presente pesem igual.
 *
 * FÓRMULA (idêntica ao motor, ver `scripts/lib/ranking-recompute.js`):
 *
 *     pontos = round( base(finalPlace) × pesoPreset × rankingWeight × fatorChave )
 *
 * De onde vem cada fator:
 *   - `base(finalPlace)`: inverso de `finalPlaceForAward` — 1-4 direto,
 *     5 = quartas (330), 9 = fase de grupos (100). Por isso o recálculo não
 *     precisa reprocessar partida nenhuma: a colocação apurada está gravada.
 *   - `pesoPreset`: da faixa `minLevel`..`level` da categoria quando ela tem
 *     piso; categoria LEGADA (sem piso) infere o preset pelo teto. Decisão do
 *     dono em 19/08 — ver `presetWeightForCategory`.
 *   - `rankingWeight`: do doc do torneio, com o mesmo saneamento do motor.
 *   - `fatorChave`: `bracketSizeFactor` sobre as duplas PAGAS da categoria,
 *     contadas AGORA (paridade com `loadPaidTeamIds` de
 *     `functions/src/league-ranking.ts`: `isPaid === true`, sem `waitlist`,
 *     `teamId` distinto). É o único fator que pode ter envelhecido desde o
 *     evento — um estorno posterior derruba o fator. Aceito pelo dono ao
 *     escolher "fórmula completa de hoje".
 *
 * SEM CARIMBO, DE PROPÓSITO: como o recálculo é função pura do dado gravado,
 * ele CONVERGE — rodar duas vezes dá o mesmo resultado, e entrada escrita pelo
 * motor novo já nasce no valor final e não é tocada. Um marcador tipo
 * `scaleVersion: 3` só reabriria a corrida que o backfill ×10 teve que fechar:
 * doc ainda não recalculado que recebe premiação nova sairia carimbado com
 * dado misto e escaparia da varredura para sempre. Aqui não existe "escapar":
 * a próxima execução reconverge qualquer doc.
 *
 * EXCEÇÃO — o carimbo de força do campo (§6 da spec) É gravado: ver EMENDA
 * 2026-09-10 mais abaixo. Ele mora numa coleção separada
 * (`tournamentCategoryFieldStrength`) e não interfere na convergência deste
 * recálculo — é lido, não recomputado a cada passada.
 *
 * O QUE ELE NÃO FAZ:
 *   - NÃO reavalia elegibilidade: entrada que existe continua existindo, mesmo
 *     que a categoria hoje não passasse no gate de 10 duplas pagas ou estivesse
 *     com `rankingEnabled` desligado. O gate valeu na hora da premiação; tirar
 *     ponto de quem já tem é decisão à parte. O resumo REPORTA esses casos.
 *   - NÃO toca no ranking de liga (`leagueRankings` tem tabela própria,
 *     `rankingPointsByPlace`).
 *   - NÃO recalcula colocação/pódio — `finalPlace` é entrada, nunca saída.
 *   - NÃO mexe em `scaleVersion` nem no motor.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * ORDEM OBRIGATÓRIA: rode `rederive-knockout-placements.js` ANTES deste script.
 * Ele é quem converte o `finalPlace: 9` do contrato antigo (participação) em
 * `0`; sem isso, este recálculo promove quem caiu na fase de grupos a oitavas
 * (100 → 200 pontos). Ver spec `docs/superpowers/specs/2026-09-10-livre-field-strength-ranking-design.md`.
 *
 * Uso (na pasta functions/):
 *   node scripts/rederive-knockout-placements.js --project <id> [--yes]   # PRIMEIRO
 *   node scripts/recompute-ranking-weights.js --project volley-track-dev-4596c
 *   node scripts/recompute-ranking-weights.js --project <id> --yes
 *   node scripts/recompute-ranking-weights.js --project <id> --yes --limit 50
 *
 * Sem --yes é DRY-RUN: lista o contexto por categoria e cada doc que mudaria,
 * sem escrever. `--limit` corta quantos docs que MUDARIAM cada coleção
 * processa nesta execução (o resto fica para a próxima — o script converge),
 * quantas participações retroativas do Livre são criadas E quantos carimbos de
 * força do campo são gravados nesta execução (o carimbo também CRIA dado,
 * dentro de `resolveContext`, então entra no mesmo corte) — é a válvula da
 * primeira corrida cautelosa em produção, então vale para TODOS os passos,
 * inclusive os dois que criam dado. O Resumo reporta `carimbos gravados: N` à
 * parte para o operador ver o que essa válvula realmente limitou.
 *
 * Falha por doc não aborta a corrida: cada doc é migrado na sua própria
 * transação (que RELÊ o doc no commit, tornando inofensiva uma premiação que
 * caia no meio da execução), o erro é contado e reportado, e o processo sai
 * com código != 0 se algum doc falhou.
 *
 * EMENDA 2026-09-10: categoria de preset `livre` não usa mais o peso 0.125 da
 * tabela — o peso vem da força REAL do campo (média do degrau das duplas, onde
 * a dupla vale o integrante mais forte), medida a partir das inscrições pagas e
 * de `athleteRatings.levelRank`. Continua sendo função pura do dado vivo, então
 * o script segue convergindo em duas passadas.
 *
 * A ordem de resolução do peso do Livre é IDÊNTICA à de `resolveLivreWeight`
 * (functions/src/tournament-ranking.ts), para que backfill e motor nunca
 * discordem sobre o mesmo histórico:
 *   1. Carimbo já gravado em `tournamentCategoryFieldStrength` → usa o peso
 *      carimbado (com o mesmo piso/teto da leitura no motor).
 *   2. Sem carimbo → mede o campo agora; com cobertura majoritária
 *      (`shouldStampFieldStrength`) e `--yes`, grava o carimbo com
 *      `source: "backfill"` — assim uma chave publicada de novo sobre esta
 *      partida antiga relê o MESMO peso em vez de medir com o dado de hoje.
 *   3. Campo imensurável (sem esporte de nível, sem dupla paga, ou nenhum
 *      atleta com degrau conhecido) → peso declarado do preset (0.125), sem
 *      carimbar.
 * Em dry-run (sem `--yes`) nada é escrito — nem o carimbo: o relatório apenas
 * indica o que SERIA carimbado.
 */

const admin = require("firebase-admin");
const {
  presetWeightForCategory,
  sanitizeRankingWeight,
  bracketSizeFactor,
  pointsForEntry,
  aggregateRankingResults,
  teamLevelRank,
  fieldStrengthFromTeamRanks,
  inscriptionAthleteUids,
  shouldStampFieldStrength,
  LIVRE_MIN_WEIGHT,
  LIVRE_MAX_WEIGHT,
  tournamentSportToLevelSportCode,
  extractTeamMemberUids,
  fieldStrengthDocId,
} = require("./lib/ranking-recompute");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const LIMIT = parseInt(argValue("--limit") || "0", 10);

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

/** Mesmo valor de `MIN_TEAMS_FOR_GLOBAL_RANKING` no motor (só p/ relatório). */
const MIN_TEAMS_FOR_GLOBAL_RANKING = 10;

/** Mesmo valor de `RANKING_SCALE_VERSION` (functions/src/tournament-ranking.ts). */
const RANKING_SCALE_VERSION = 2;

const dataPath = (coll) => `artifacts/${projectId}/public/data/${coll}`;

const avisos = [];
function avisar(msg) {
  if (!avisos.includes(msg)) avisos.push(msg);
}

// `--limit` também vale para o carimbo de força do campo (Important 1 da
// revisão final): sem isto, `--yes --limit 1` — a corrida cautelosa que o
// próprio cabeçalho recomenda como primeira execução em produção — carimbava
// TODA categoria Livre do histórico, porque o carimbo mora dentro de
// `resolveContext`, chamado para CADA doc antes do `candidatos.slice(0, LIMIT)`
// do passo de `tournamentCategoryResults`. `stampAttempts` conta candidaturas
// (elegíveis para carimbar, dry-run ou não) para que o relatório por
// categoria reflita o mesmo corte em ambos os modos; `stampsGravados` conta só
// as escritas reais (`--yes`), e é o número que entra no Resumo.
let stampAttempts = 0;
let stampsGravados = 0;

// ---------------------------------------------------------------------------
// Contexto por (torneio, categoria) — resolvido uma vez e reusado.
// ---------------------------------------------------------------------------

const contextos = new Map();

async function contextFor(tournamentId, categoryId) {
  const chave = `${tournamentId}|${categoryId}`;
  if (contextos.has(chave)) return contextos.get(chave);

  const ctx = await resolveContext(tournamentId, categoryId);
  contextos.set(chave, ctx);
  return ctx;
}

async function resolveContext(tournamentId, categoryId) {
  const base = {tournamentId, categoryId, ok: false};

  if (!tournamentId || !categoryId) {
    return {...base, motivo: "entrada sem tournamentId/categoryId"};
  }

  const snap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!snap.exists) {
    return {...base, motivo: "torneio não existe mais"};
  }
  const tournament = snap.data() || {};
  const categorias = Array.isArray(tournament.categories) ? tournament.categories : [];
  const categoria = categorias.find(
    (c) => String(c.id ?? c.categoryId ?? "") === String(categoryId),
  );

  const identidade = {
    ...base,
    tournamentName: tournament.name || "(sem nome)",
    categoryName: categoria?.name || categoria?.categoryName || "(categoria não encontrada)",
    level: categoria?.level ?? null,
    minLevel: categoria?.minLevel ?? null,
    isLeagueStage: String(tournament.leagueId ?? "").trim().length > 0,
    // Paridade com o motor (functions/src/tournament-ranking.ts): campo AUSENTE
    // é "ligado" (`!== false`), não "desligado" (`=== true`) — torneio legado
    // sem o campo não pode disparar o aviso de "hoje não passaria no gate".
    rankingEnabled: tournament.rankingEnabled !== false,
  };

  if (!categoria) {
    return {...identidade, motivo: "categoria não está mais no torneio"};
  }

  const peso = presetWeightForCategory(categoria);
  if (!peso) {
    return {
      ...identidade,
      motivo: `teto de nível irreconhecível (level=${JSON.stringify(categoria.level)})`,
    };
  }

  const paidTeamsMap = await loadPaidTeams(tournamentId, categoryId);
  const paidTeams = paidTeamsMap.size;
  const rankingWeight = sanitizeRankingWeight(tournament.rankingWeight);
  const bracketFactor = bracketSizeFactor(paidTeams);

  // Livre: o peso 0.125 da tabela vem do PISO declarado da faixa e pune um campo
  // forte (spec 2026-09-10). Aqui ele é substituído pela força REAL medida.
  // Campo imensurável mantém o peso declarado — não vira zero.
  //
  // Ordem IDÊNTICA a `resolveLivreWeight` (functions/src/tournament-ranking.ts):
  // 1) carimbo já gravado; 2) mede agora (e carimba se a cobertura permitir);
  // 3) peso declarado do preset. Sem o passo 1 o backfill sobrescreveria um
  // carimbo feito na publicação da chave e as duas fontes discordariam.
  let weight = peso.weight;
  let fieldRank = null;
  let measuredTeams = 0;
  let livreWeightSource = null; // "stamp" | "measured" | "declared" — só para o relatório
  let livreStampEligible = false; // cobertura suficiente para carimbar nesta passada
  let livreStampLimitado = false; // cobertura suficiente, mas --limit já esgotado
  if (peso.presetKey === "livre") {
    const stamp = await readFieldStrengthStamp(tournamentId, categoryId);
    if (stamp) {
      weight = Math.min(LIVRE_MAX_WEIGHT, Math.max(LIVRE_MIN_WEIGHT, stamp.weight));
      fieldRank = stamp.fieldRank;
      measuredTeams = stamp.measuredTeams;
      livreWeightSource = "stamp";
    } else {
      const strength = await measureLivreFieldStrength(tournament, paidTeamsMap);
      if (strength) {
        weight = strength.weight;
        fieldRank = strength.fieldRank;
        measuredTeams = strength.measuredTeams;
        livreWeightSource = "measured";

        const stampCandidate = {
          presetKey: "livre",
          fieldRank: strength.fieldRank,
          weight: strength.weight,
          measuredTeams: strength.measuredTeams,
          totalPaidTeams: paidTeams,
        };
        if (shouldStampFieldStrength(stampCandidate)) {
          // Checagem contra `LIMIT` ANTES de consumir o contador — o mesmo
          // corte vale em dry-run (só para o relatório) e com `--yes` (para a
          // escrita de verdade), então as duas passagens contam igual.
          if (LIMIT > 0 && stampAttempts >= LIMIT) {
            livreStampLimitado = true;
          } else {
            livreStampEligible = true;
            stampAttempts++;
            if (APPLY) {
              try {
                await stampFieldStrength(tournamentId, categoryId, stampCandidate);
                stampsGravados++;
              } catch (e) {
                // A escrita do carimbo é só metadado — se falhar, o recálculo não
                // pode parar por isso (mesma postura de `resolveLivreWeight` em
                // `functions/src/tournament-ranking.ts`): segue com o peso medido.
                avisar(
                  `${tournamentId}/${categoryId}: falha ao carimbar força do campo — ` +
                    `seguindo com o peso medido (${e?.message ?? e})`,
                );
              }
            }
          }
        }
      } else {
        livreWeightSource = "declared";
      }
    }
  }

  return {
    ...identidade,
    ok: true,
    weight,
    presetKey: peso.presetKey,
    inferred: peso.inferred,
    fieldRank,
    measuredTeams,
    livreWeightSource,
    livreStampEligible,
    livreStampLimitado,
    rankingWeight,
    paidTeams,
    bracketFactor,
    elegivelHoje:
      identidade.isLeagueStage ||
      (identidade.rankingEnabled && paidTeams >= MIN_TEAMS_FOR_GLOBAL_RANKING),
  };
}

/**
 * Paridade com `paidTeamsWithParticipants` (functions/src/category-field-strength-store.ts):
 * mesma query e mesmo filtro de "paga" (`isPaid === true`, sem `waitlist`,
 * `teamId` distinto), e uids via `inscriptionAthleteUids` — o extrator
 * canônico, que junta `player1Id` E `participantUids` — em vez de ler
 * `participantUids` na mão, que perderia inscrições legadas que só tinham
 * `player1Id`.
 */
async function loadPaidTeams(tournamentId, categoryId) {
  const snap = await db
    .collection(dataPath("inscriptions"))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const teams = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.isPaid !== true) continue;
    if (d.waitlist === true) continue;
    const teamId = (d.teamId || "").trim();
    if (!teamId) continue;
    const uids = inscriptionAthleteUids(d);
    teams.set(teamId, [...(teams.get(teamId) || []), ...uids]);
  }
  return teams;
}

/** Paridade com `loadKnockoutTeamIds` (functions/src/league-ranking.ts). */
async function loadKnockoutTeamIds(tournamentId, categoryId) {
  const snap = await db
    .collection(dataPath("matches"))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const ids = new Set();
  for (const doc of snap.docs) {
    const d = doc.data();
    const tipo = String(d.matchType || "").trim().toLowerCase();
    if (d.isGroupMatch === true || tipo === "group" || tipo === "groups") continue;
    const a = (d.teamAId || "").trim();
    const b = (d.teamBId || "").trim();
    if (a) ids.add(a);
    if (b) ids.add(b);
  }
  return ids;
}

/**
 * uids da equipe, lendo o doc `teams/{teamId}`. `extractTeamMemberUids` mora
 * em `scripts/lib/ranking-recompute.js`, em paridade com
 * `functions/src/tournament-team-category.ts` (ver teste de paridade em
 * `test/ranking-recompute.test.mjs`).
 */
async function loadTeamAthleteIds(teamId) {
  const snap = await db.doc(`${dataPath("teams")}/${teamId}`).get();
  if (!snap.exists) return [];
  return extractTeamMemberUids(snap.data() || {});
}

/** Degraus por atleta, em lote (docs `athleteRatings/{uid}_{SPORT_CODE}`). */
async function loadAthleteLevelRanks(uids, sportCode) {
  const ranks = new Map();
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0 || !sportCode) return ranks;

  const refs = unique.map((uid) =>
    db.doc(`${dataPath("athleteRatings")}/${uid}_${sportCode}`),
  );
  const snaps = await db.getAll(...refs);
  snaps.forEach((snap, index) => {
    const rank = Number(snap.data()?.levelRank);
    if (Number.isFinite(rank)) ranks.set(unique[index], rank);
  });
  return ranks;
}

/** Força do campo de uma categoria Livre; null quando não dá para medir. */
async function measureLivreFieldStrength(tournament, paidTeams) {
  const sportCode = tournamentSportToLevelSportCode(tournament.sport);
  if (!sportCode || paidTeams.size === 0) return null;

  const ranks = await loadAthleteLevelRanks(
    [...paidTeams.values()].flat(),
    sportCode,
  );
  const teamRanks = [...paidTeams.values()].map((uids) =>
    teamLevelRank(uids.map((uid) => (ranks.has(uid) ? ranks.get(uid) : null))),
  );
  return fieldStrengthFromTeamRanks(teamRanks);
}

/**
 * Paridade com `readFieldStrengthStamp` (functions/src/category-field-strength-store.ts).
 * `fieldStrengthDocId` mora em `scripts/lib/ranking-recompute.js`.
 */
async function readFieldStrengthStamp(tournamentId, categoryId) {
  const snap = await db
    .doc(`${dataPath("tournamentCategoryFieldStrength")}/${fieldStrengthDocId(tournamentId, categoryId)}`)
    .get();
  const data = snap.data();
  if (!data) return null;

  const weight = Number(data.weight);
  if (!Number.isFinite(weight) || weight <= 0) return null;

  return {
    fieldRank: Number(data.fieldRank) || 0,
    weight,
    measuredTeams: Number(data.measuredTeams) || 0,
    totalPaidTeams: Number(data.totalPaidTeams) || 0,
  };
}

/**
 * Grava o carimbo com `source: "backfill"` (spec §6): se uma premiação voltar
 * a disparar numa partida antiga (organizador corrigindo placar, por exemplo),
 * o motor vai LER este carimbo em vez de medir com o dado de hoje — histórico
 * e peso vivo continuam de acordo. Só é chamada quando `APPLY` é verdadeiro
 * (`--yes`); em dry-run o chamador só reporta a intenção.
 *
 * Payload em paridade com `fieldStrengthStampPayload`
 * (`functions/src/category-field-strength-store.ts:155-159`); o local
 * equivalente da escrita no motor é `resolveLivreWeight`
 * (`functions/src/tournament-ranking.ts`).
 */
async function stampFieldStrength(tournamentId, categoryId, stamp) {
  await db
    .doc(`${dataPath("tournamentCategoryFieldStrength")}/${fieldStrengthDocId(tournamentId, categoryId)}`)
    .set({
      tournamentId,
      categoryId,
      presetKey: stamp.presetKey,
      fieldRank: stamp.fieldRank,
      weight: stamp.weight,
      measuredTeams: stamp.measuredTeams,
      totalPaidTeams: stamp.totalPaidTeams,
      source: "backfill",
      stampedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

/** Pontos novos de uma entrada, ou `null` quando não dá para decidir. */
async function recomputeEntry(entry) {
  const ctx = await contextFor(entry.tournamentId, entry.categoryId);
  if (!ctx.ok) {
    avisar(
      `${ctx.tournamentName ?? entry.tournamentId} / ${ctx.categoryName ?? entry.categoryId}: ` +
        `${ctx.motivo} — entradas mantidas como estão`,
    );
    return null;
  }
  const pontos = pointsForEntry(entry.finalPlace, ctx);
  if (pontos == null) {
    avisar(
      `${ctx.tournamentName} / ${ctx.categoryName}: finalPlace=${JSON.stringify(entry.finalPlace)} ` +
        "fora da tabela — entrada mantida como está",
    );
    return null;
  }
  return pontos;
}

// ---------------------------------------------------------------------------
// Migração dos docs.
// ---------------------------------------------------------------------------

/**
 * Migra UM doc dentro de uma transação que RELÊ o doc no commit: se o motor
 * gravou uma premiação entre a varredura e a escrita, o update é calculado em
 * cima do dado fresco em vez do snapshot obsoleto.
 *
 * @param {FirebaseFirestore.DocumentReference} ref
 * @param {(fresh: Record<string, any>) => Promise<object|null>} computeUpdate
 *   Devolve o update, ou `null` quando não há nada a mudar.
 */
async function migrateOneDoc(ref, computeUpdate) {
  return db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) return {status: "missing"};
    const fresh = snap.data();
    const update = await computeUpdate(fresh);
    if (update == null) return {status: "unchanged"};
    if (APPLY) txn.update(ref, update);
    return {status: "migrated", update, before: fresh};
  });
}

async function migrateTournamentCategoryResults() {
  const snap = await db.collection(dataPath("tournamentCategoryResults")).get();

  const candidatos = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const pontos = await recomputeEntry(d);
    if (pontos == null) continue;
    if (pontos === Number(d.pointsEarned)) continue;
    candidatos.push({doc, de: Number(d.pointsEarned), para: pontos});
  }
  const alvos = LIMIT > 0 ? candidatos.slice(0, LIMIT) : candidatos;

  console.log(
    `\n[tournamentCategoryResults] ${snap.size} doc(s), ${candidatos.length} mudariam` +
      (LIMIT > 0 ? `, processando ${alvos.length} (--limit ${LIMIT})` : "") +
      ":",
  );

  let migrated = 0;
  let errors = 0;
  for (const alvo of alvos) {
    try {
      const outcome = await migrateOneDoc(alvo.doc.ref, async (fresh) => {
        const pontos = await recomputeEntry(fresh);
        if (pontos == null || pontos === Number(fresh.pointsEarned)) return null;
        return {pointsEarned: pontos};
      });
      if (outcome.status === "migrated") {
        console.log(
          `  ${alvo.doc.id}: ${outcome.before.pointsEarned} → ${outcome.update.pointsEarned}`,
        );
        migrated++;
      } else if (outcome.status === "unchanged") {
        console.log(`  ${alvo.doc.id}: já estava no valor final na releitura — pulado`);
      } else {
        console.log(`  ${alvo.doc.id}: doc sumiu entre a varredura e a transação — pulado`);
      }
    } catch (err) {
      errors++;
      console.error(`  ${alvo.doc.id}: ERRO na transação —`, err && err.message ? err.message : err);
    }
  }
  return {migrated, errors, candidatos: candidatos.length, total: snap.size};
}

/** Recalcula `results[]`; devolve `null` quando nenhum ponto muda. */
async function recomputeResults(fresh) {
  const results = Array.isArray(fresh.results) ? fresh.results : [];
  let mudou = false;
  const novos = [];
  for (const r of results) {
    const pontos = await recomputeEntry(r);
    if (pontos == null || pontos === Number(r.points)) {
      novos.push(r);
      continue;
    }
    novos.push({...r, points: pontos});
    mudou = true;
  }
  if (!mudou) return null;
  const agregados = aggregateRankingResults(novos);
  return {
    results: novos,
    totalPoints: agregados.totalPoints,
    tournamentsCount: agregados.tournamentsCount,
    pointsByYear: agregados.pointsByYear,
  };
}

async function migrateRankingCollection(coll) {
  const snap = await db.collection(dataPath(coll)).get();

  const candidatos = [];
  for (const doc of snap.docs) {
    const update = await recomputeResults(doc.data());
    if (update) candidatos.push({doc, update});
  }
  const alvos = LIMIT > 0 ? candidatos.slice(0, LIMIT) : candidatos;

  console.log(
    `\n[${coll}] ${snap.size} doc(s), ${candidatos.length} mudariam` +
      (LIMIT > 0 ? `, processando ${alvos.length} (--limit ${LIMIT})` : "") +
      ":",
  );

  let migrated = 0;
  let errors = 0;
  for (const alvo of alvos) {
    try {
      const outcome = await migrateOneDoc(alvo.doc.ref, (fresh) => recomputeResults(fresh));
      if (outcome.status === "migrated") {
        console.log(
          `  ${coll}/${alvo.doc.id}: total ${outcome.before.totalPoints} → ${outcome.update.totalPoints}`,
        );
        migrated++;
      } else if (outcome.status === "unchanged") {
        console.log(`  ${coll}/${alvo.doc.id}: já estava no valor final na releitura — pulado`);
      } else {
        console.log(`  ${coll}/${alvo.doc.id}: doc sumiu entre a varredura e a transação — pulado`);
      }
    } catch (err) {
      errors++;
      console.error(
        `  ${coll}/${alvo.doc.id}: ERRO na transação —`,
        err && err.message ? err.message : err,
      );
    }
  }
  return {migrated, errors, candidatos: candidatos.length, total: snap.size};
}

// ---------------------------------------------------------------------------
// Retroativo: participação do Livre que a exceção antiga nunca gravou.
// ---------------------------------------------------------------------------

/**
 * Cria os resultados de participação que a antiga exceção do Livre nunca gravou
 * (spec 2026-09-10, D4/D5). Só toca categorias de preset `livre` que já têm ao
 * menos um resultado — isto é, que passaram pelo motor — e só duplas pagas que
 * não aparecem em nenhuma partida de mata-mata.
 *
 * IDEMPOTÊNCIA: diferente do resto do script, este passo CRIA docs. A garantia
 * de rodar duas vezes sem duplicar vem da checagem de existência do doc
 * `{tournamentId}_{categoryId}_{teamId}` antes de escrever.
 *
 * ORDEM DE ESCRITA — o doc de resultado é o MARCADOR DE COMMIT e por isso é a
 * ÚLTIMA escrita da dupla: as entradas em `teamRankings`/`athleteRankings` vão
 * primeiro (são idempotentes por `jaTem` em `upsertRankingDoc`) e só então o
 * resultado é gravado. É a existência DELE que tira a dupla da varredura da
 * próxima execução (`comResultado`), e `recomputeResults` só reescreve entrada
 * que já está em `results[]` — nunca acrescenta uma que falte. Se o resultado
 * fosse escrito primeiro e a corrida morresse antes dos rankings, a dupla ficaria
 * fora de `faltantes` para sempre, com o resultado gravado e o atleta sem ponto,
 * e nenhuma reexecução curaria isso. Na ordem atual uma queda no meio deixa, no
 * pior caso, entradas de ranking sem o doc de resultado — e a próxima passada
 * cura sozinha: a dupla continua em `faltantes`, os upserts viram no-op e só o
 * resultado é escrito.
 *
 * ESSA ÚLTIMA ESCRITA TAMBÉM RELÊ NO COMMIT: ser a última escrita não basta —
 * entre a checagem de existência no início do laço e este ponto, os upserts de
 * ranking acima têm tempo de rodar, e é nesse intervalo que o motor pode gravar
 * uma colocação REAL desta mesma dupla nesta mesma categoria (chave republicada,
 * partida decidida de verdade). Por isso o `set` do resultado roda numa
 * transação que relê o doc e ABORTA se ele já existir, em vez de sobrescrever
 * `finalPlace: 0` por cima de uma premiação real — a única escrita deste passo
 * que CRIA dado, e a única para a qual uma perda não se autocura numa próxima
 * execução (o doc passaria a existir, errado, e a dupla sairia de `faltantes`
 * para sempre). O aborto não tira o commit-marker de lugar: a checagem
 * acontece dentro do `set` que já era a última escrita, então uma queda ANTES
 * dele continua deixando a dupla em `faltantes` (curável), e um aborto por
 * corrida concorrente também não escreve nada — mesmo efeito líquido.
 */
async function criarParticipacaoFaltanteDoLivre(apply) {
  const categorias = new Map();
  const anos = new Map();
  const conclusoes = new Map();
  const snap = await db.collection(dataPath("tournamentCategoryResults")).get();
  for (const doc of snap.docs) {
    const r = doc.data();
    const chave = `${r.tournamentId}|${r.categoryId}`;
    if (!categorias.has(chave)) categorias.set(chave, new Set());
    categorias.get(chave).add(r.teamId);
    // O ano da participação criada é o dos resultados que o motor JÁ gravou
    // nesta categoria — nunca a data de hoje, que jogaria os pontos no ano
    // errado de `pointsByYear`.
    const ano = Number(r.year);
    if (Number.isFinite(ano) && ano > 0 && !anos.has(chave)) anos.set(chave, ano);
    // `completedAt` idem: o motor sempre grava esse campo, então copiamos o da
    // própria categoria para o doc criado não sair mais magro que um escrito
    // pelo motor. Sem fonte, o campo é OMITIDO — nunca inventamos uma data.
    if (r.completedAt && !conclusoes.has(chave)) conclusoes.set(chave, r.completedAt);
  }

  let candidatos = 0;
  let criados = 0;
  let errors = 0;
  let limitAtingido = false;

  for (const [chave, comResultado] of categorias) {
    if (limitAtingido) break;
    const [tournamentId, categoryId] = chave.split("|");
    const ctx = await contextFor(tournamentId, categoryId);
    if (!ctx.ok || ctx.presetKey !== "livre") continue;

    const paidTeams = await loadPaidTeams(tournamentId, categoryId);
    const knockout = await loadKnockoutTeamIds(tournamentId, categoryId);
    const pontos = pointsForEntry(0, ctx);
    if (pontos == null || pontos <= 0) continue;

    const faltantes = [...paidTeams.keys()].filter(
      (teamId) => !comResultado.has(teamId) && !knockout.has(teamId),
    );
    if (faltantes.length === 0) continue;

    // Sem ano vindo dos resultados já gravados, a participação não tem onde
    // cair em `pointsByYear` — e o ano de HOJE seria uma mentira silenciosa.
    // Pular a categoria inteira e reportar é a única saída honesta.
    const year = anos.get(chave);
    if (!Number.isFinite(year) || year <= 0) {
      avisar(
        `${ctx.tournamentName} / ${ctx.categoryName}: nenhum resultado gravado tem \`year\` ` +
          "numérico — participação retroativa NÃO criada (o ano não pode ser o de hoje)",
      );
      continue;
    }
    const completedAt = conclusoes.get(chave);

    // A categoria já tem ao menos um resultado gravado — prova de que passou
    // pelo portão de elegibilidade NA ÉPOCA. Se hoje ela não passasse (ex.:
    // estorno pós-torneio derrubou as pagas abaixo do mínimo), criar mesmo
    // assim é o comportamento certo — o histórico já foi premiado —, mas o
    // dono precisa ver que estes pontos nascem numa categoria que hoje seria
    // reprovada no gate.
    if (!ctx.elegivelHoje) {
      avisar(
        `${ctx.tournamentName} / ${ctx.categoryName}: HOJE não passaria no gate do ranking ` +
          `geral (pagas=${ctx.paidTeams}, rankingEnabled=${ctx.rankingEnabled}) — criando ` +
          "participação retroativa mesmo assim, porque o histórico já foi premiado",
      );
    }

    for (const teamId of faltantes) {
      const ref = db
        .collection(dataPath("tournamentCategoryResults"))
        .doc(`${tournamentId}_${categoryId}_${teamId}`);
      const existente = await ref.get();
      if (existente.exists) continue;

      if (LIMIT > 0 && candidatos >= LIMIT) {
        limitAtingido = true;
        break;
      }
      candidatos++;

      // Linha ROTINEIRA (uma por dupla criada), não um aviso — com centenas de
      // participações retroativas, `avisar` é O(n) por chamada e enterraria os
      // avisos de verdade (year ausente, roster não resolvido, gate reprovado)
      // numa parede de texto. `console.log` direto, sem dedupe.
      console.log(
        `  ${ctx.tournamentName} / ${ctx.categoryName}: ${apply ? "criando" : "criaria"} ` +
          `participação de ${teamId} (${pontos} pts, ano ${year})`,
      );
      if (!apply) continue;

      // Falha numa dupla não aborta a corrida (mesma postura de `migrateOneDoc`):
      // o erro é contado, reportado no Resumo e derruba o código de saída.
      try {
        const entrada = {tournamentId, categoryId, finalPlace: 0, points: pontos, year};
        const athleteIds = await loadTeamAthleteIds(teamId);
        if (athleteIds.length === 0) {
          avisar(
            `${ctx.tournamentName} / ${ctx.categoryName}: equipe ${teamId} não resolveu ` +
              "nenhum atleta (sem `memberUids` utilizável e sem player1Id/player2Id) — " +
              "só o ranking de equipe recebe estes pontos",
          );
        }

        // Rankings primeiro, resultado por último — ver ORDEM DE ESCRITA acima.
        await upsertRankingDoc(dataPath("teamRankings"), teamId, {teamId}, entrada);
        for (const athleteId of athleteIds) {
          await upsertRankingDoc(dataPath("athleteRankings"), athleteId, {athleteId}, entrada);
        }

        // Última escrita, dentro de uma transação que RELÊ o doc no commit
        // (mesma postura de `migrateOneDoc`): entre a checagem em `existente`
        // e este ponto, os upserts de ranking acima podem ter levado tempo
        // suficiente para o motor gravar uma premiação real desta mesma dupla
        // nesta mesma categoria (ex.: chave republicada e a partida decidida
        // de verdade). Sem essa releitura, o `set` incondicional pisaria numa
        // colocação real com `finalPlace: 0` — e, diferente de toda outra
        // escrita deste arquivo, essa perda NÃO se autocura numa próxima
        // execução: o doc passaria a existir (com o valor errado) e a dupla
        // sairia de `faltantes` para sempre. Por isso a escrita aborta, em vez
        // de sobrescrever, quando o doc já existe na releitura.
        const criouResultado = await db.runTransaction(async (txn) => {
          const atual = await txn.get(ref);
          if (atual.exists) return false;
          txn.set(ref, {
            tournamentId,
            categoryId,
            teamId,
            finalPlace: 0,
            pointsEarned: pontos,
            year,
            ...(completedAt ? {completedAt} : {}),
            scaleVersion: RANKING_SCALE_VERSION,
          });
          return true;
        });

        if (!criouResultado) {
          avisar(
            `${ctx.tournamentName} / ${ctx.categoryName}: ${teamId} já tem resultado gravado ` +
              "(uma corrida concorrente venceu entre a checagem e a escrita) — participação " +
              "retroativa NÃO sobrescrita",
          );
          continue;
        }
        criados++;
      } catch (err) {
        errors++;
        console.error(
          `  ${tournamentId}_${categoryId}_${teamId}: ERRO ao criar participação —`,
          err && err.message ? err.message : err,
        );
      }
    }
  }

  console.log(
    `\n[participação do Livre] ` +
      (apply
        ? `${criados} resultado(s) criado(s) de ${candidatos} candidato(s)`
        : `${candidatos} a criar`) +
      (limitAtingido ? ` (--limit ${LIMIT} atingido — o resto fica para a próxima)` : ""),
  );
  return {criados, candidatos, errors};
}

/**
 * Upsert de uma entrada em `athleteRankings`/`teamRankings`, com agregados.
 *
 * `scaleVersion` só é carimbado quando o doc está sendo CRIADO. Num doc que já
 * existe, carimbar por `merge` seria repetir o erro que o motor evita em
 * `upsertGlobalRankingDoc` (functions/src/tournament-ranking.ts): um doc ainda
 * na escala antiga sairia marcado como `>= 2` sem ter sido reescalado e
 * escaparia para sempre da varredura de `backfill-ranking-scale-x10.js`. O
 * resto deste script também nunca toca em `scaleVersion`, de propósito.
 *
 * `lastUpdated` sai em toda escrita (criação OU merge), igual ao motor
 * (`upsertGlobalRankingDoc`, `functions/src/tournament-ranking.ts:272`):
 * `lastUpdated: FieldValue.serverTimestamp()`. Sem isso, um doc tocado por
 * este script ficaria diferente de um doc tocado pelo motor só por faltar
 * esse campo.
 *
 * GUARDA DE ESCALA MISTA (Important 2 da revisão final): a entrada `entrada`
 * chega em ×10 (fórmula vigente do motor — ver `pointsForEntry`). Um doc que
 * já existe mas ainda está em `scaleVersion < RANKING_SCALE_VERSION` guarda
 * `results[]` antigos em ×1. O MOTOR reescala esses ×1 pra ×10 ON-WRITE antes
 * de mesclar (`upsertGlobalRankingDoc`, `functions/src/tournament-ranking.ts:249-258`)
 * — este script, de propósito, NÃO reescala nada (ver comentário de
 * `scaleVersion` acima: ele nunca toca na escala do histórico). Se este
 * `merge` escrevesse a entrada nova ×10 num doc com entradas antigas ×1 sem
 * reescalar, o doc ficaria com escala MISTA, e pior: `backfill-ranking-scale-x10.js`,
 * rodado depois, multiplicaria a entrada nova ×10 de novo (ela já está em
 * ×10). Por isso a escrita é PULADA e AVISADA em vez de corrigir a escala
 * aqui: o remédio é rodar `backfill-ranking-scale-x10.js` primeiro (ele SÓ
 * reescala, sem repesar) e então repetir esta execução — a próxima passada
 * encontra o doc já em `scaleVersion >= 2` e faz o merge normalmente.
 */
async function upsertRankingDoc(collectionPath, docId, identity, entrada) {
  const ref = db.collection(collectionPath).doc(docId);
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const prev = snap.data() || {};
    if (snap.exists && (Number(prev.scaleVersion) || 0) < RANKING_SCALE_VERSION) {
      avisar(
        `${collectionPath}/${docId}: doc em scaleVersion < ${RANKING_SCALE_VERSION} — ` +
          `participação retroativa de ${entrada.tournamentId}/${entrada.categoryId} NÃO gravada ` +
          "(rode backfill-ranking-scale-x10.js primeiro e repita esta execução)",
      );
      return;
    }
    const results = Array.isArray(prev.results) ? [...prev.results] : [];
    const jaTem = results.some(
      (r) => r.tournamentId === entrada.tournamentId && r.categoryId === entrada.categoryId,
    );
    if (jaTem) return;
    results.push(entrada);
    const agregados = aggregateRankingResults(results);
    // Guarda de escrita também aqui, como defesa em profundidade: nenhum helper
    // deste arquivo escreve sem `--yes`.
    if (!APPLY) return;
    txn.set(
      ref,
      {
        ...identity,
        results,
        totalPoints: agregados.totalPoints,
        tournamentsCount: agregados.tournamentsCount,
        pointsByYear: agregados.pointsByYear,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        ...(snap.exists ? {} : {scaleVersion: RANKING_SCALE_VERSION}),
      },
      {merge: true},
    );
  });
}

// ---------------------------------------------------------------------------
// Relatório.
// ---------------------------------------------------------------------------

function imprimirContextos() {
  console.log("\nContexto por categoria (peso aplicado):");
  const resolvidos = [...contextos.values()];
  if (resolvidos.length === 0) {
    console.log("  (nenhuma entrada no histórico)");
    return;
  }
  for (const ctx of resolvidos) {
    if (!ctx.ok) {
      console.log(
        `  ✗ ${ctx.tournamentName ?? ctx.tournamentId} / ${ctx.categoryName ?? ctx.categoryId}: ${ctx.motivo}`,
      );
      continue;
    }
    const origem = ctx.inferred
      ? `inferido pelo teto "${ctx.level}"`
      : `faixa "${ctx.minLevel}".."${ctx.level}"`;
    console.log(
      `  • ${ctx.tournamentName} / ${ctx.categoryName}\n` +
        `      preset=${ctx.presetKey ?? "legado"} (${origem}) peso=${ctx.weight}` +
        ` · rankingWeight=${ctx.rankingWeight} · pagas=${ctx.paidTeams} → fatorChave=${ctx.bracketFactor}` +
        ` · multiplicador=${(ctx.weight * ctx.rankingWeight * ctx.bracketFactor).toFixed(4)}`,
    );
    if (ctx.presetKey === "livre") {
      const carimboStatus = ctx.livreStampLimitado
        ? " — NÃO carimbado (--limit atingido, fica para a próxima)"
        : ctx.livreStampEligible
          ? (APPLY ? " — CARIMBADO" : " — SERIA CARIMBADO")
          : " (cobertura insuficiente para carimbar)";
      const source =
        ctx.livreWeightSource === "stamp"
          ? "carimbo já gravado"
          : ctx.livreWeightSource === "measured"
            ? `medido agora${carimboStatus}`
            : "imensurável — peso declarado do preset";
      console.log(
        `      livre: fonte=${source}` +
          (ctx.fieldRank != null ? ` · degrauCampo=${ctx.fieldRank.toFixed(2)}` : "") +
          ` · duplasMedidas=${ctx.measuredTeams}/${ctx.paidTeams}`,
      );
    }
  }
}

function imprimirGate() {
  const reprovadas = [...contextos.values()].filter((c) => c.ok && !c.elegivelHoje);
  if (reprovadas.length === 0) return;
  console.log(
    "\nAtenção — categorias que HOJE não passariam no gate do ranking geral " +
      `(mínimo ${MIN_TEAMS_FOR_GLOBAL_RANKING} duplas pagas, ou rankingEnabled desligado).` +
      "\nOs pontos foram MANTIDOS (este script não reavalia elegibilidade); decida caso a caso:",
  );
  for (const ctx of reprovadas) {
    console.log(
      `  - ${ctx.tournamentName} / ${ctx.categoryName}: pagas=${ctx.paidTeams}, ` +
        `rankingEnabled=${ctx.rankingEnabled}`,
    );
  }
}

async function run() {
  console.log(
    APPLY
      ? `Aplicando recálculo de pesos do ranking em ${projectId}…`
      : `DRY-RUN em ${projectId} (passe --yes para escrever).`,
  );

  const resultsOutcome = await migrateTournamentCategoryResults();
  const athletesOutcome = await migrateRankingCollection("athleteRankings");
  const teamsOutcome = await migrateRankingCollection("teamRankings");

  const participacaoOutcome = await criarParticipacaoFaltanteDoLivre(APPLY);

  imprimirContextos();

  if (avisos.length > 0) {
    console.log("\nAvisos (entradas deixadas como estavam, gate reprovado, ou dado incompleto):");
    for (const a of avisos) console.log(`  ! ${a}`);
  }

  imprimirGate();

  const totalErrors =
    resultsOutcome.errors +
    athletesOutcome.errors +
    teamsOutcome.errors +
    participacaoOutcome.errors;

  console.log("\nResumo:");
  for (const [nome, o] of [
    ["tournamentCategoryResults", resultsOutcome],
    ["athleteRankings", athletesOutcome],
    ["teamRankings", teamsOutcome],
  ]) {
    console.log(
      `  ${nome}: ${o.migrated} alterado(s) de ${o.candidatos} candidato(s) ` +
        `em ${o.total} doc(s), ${o.errors} erro(s)`,
    );
  }
  console.log(
    `  participação do Livre: ` +
      (APPLY
        ? `${participacaoOutcome.criados} criado(s) de ${participacaoOutcome.candidatos} candidato(s)`
        : `${participacaoOutcome.candidatos} a criar`) +
      `, ${participacaoOutcome.errors} erro(s)`,
  );
  // `stampAttempts` conta candidaturas elegíveis sob o mesmo corte de `--limit`
  // em dry-run e com `--yes`; `stampsGravados` (sempre 0 em dry-run) é o que de
  // fato foi escrito. Ver Important 1 da revisão final.
  console.log(
    `  carimbos gravados: ${stampsGravados} de ${stampAttempts} elegível(is) nesta execução` +
      (LIMIT > 0 ? ` (--limit ${LIMIT})` : ""),
  );
  if (!APPLY) {
    console.log("  (dry-run — nada escrito; rode de novo com --yes)");
  }
  if (totalErrors > 0) {
    console.error(
      `\n${totalErrors} doc(s) falharam na transação — revise os erros acima antes de reexecutar.`,
    );
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
