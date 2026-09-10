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
 * Uso (na pasta functions/):
 *   node scripts/recompute-ranking-weights.js --project volley-track-dev-4596c
 *   node scripts/recompute-ranking-weights.js --project <id> --yes
 *   node scripts/recompute-ranking-weights.js --project <id> --yes --limit 50
 *
 * Sem --yes é DRY-RUN: lista o contexto por categoria e cada doc que mudaria,
 * sem escrever. `--limit` corta quantos docs que MUDARIAM cada coleção
 * processa nesta execução (o resto fica para a próxima — o script converge).
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

const dataPath = (coll) => `artifacts/${projectId}/public/data/${coll}`;

const avisos = [];
function avisar(msg) {
  if (!avisos.includes(msg)) avisos.push(msg);
}

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
    rankingEnabled: tournament.rankingEnabled === true,
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
          livreStampEligible = true;
          if (APPLY) {
            try {
              await stampFieldStrength(tournamentId, categoryId, stampCandidate);
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

/** Cópia de `tournamentSportToLevelSportCode` (functions/src/category-level-eligibility.ts). */
function tournamentSportToLevelSportCode(sport) {
  const key = String(sport || "").trim().toLowerCase().replace(/\s+/g, "");
  if (key === "beachvolleyball") return "VOLEI_PRAIA";
  if (key === "indoorvolleyball") return "VOLEI_QUADRA";
  if (key === "footvolley") return "FUTEVOLEI";
  if (key === "beachtennis") return "BEACH_TENNIS";
  return null;
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

/** Doc id do carimbo — paridade com `fieldStrengthDocId` (category-field-strength-store.ts). */
function fieldStrengthDocId(tournamentId, categoryId) {
  return `${tournamentId}_${categoryId}`;
}

/** Paridade com `readFieldStrengthStamp` (functions/src/category-field-strength-store.ts). */
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
      const source =
        ctx.livreWeightSource === "stamp"
          ? "carimbo já gravado"
          : ctx.livreWeightSource === "measured"
            ? `medido agora${ctx.livreStampEligible ? (APPLY ? " — CARIMBADO" : " — SERIA CARIMBADO") : " (cobertura insuficiente para carimbar)"}`
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

  imprimirContextos();

  if (avisos.length > 0) {
    console.log("\nAvisos (entradas deixadas como estavam):");
    for (const a of avisos) console.log(`  ! ${a}`);
  }

  imprimirGate();

  const totalErrors = resultsOutcome.errors + athletesOutcome.errors + teamsOutcome.errors;

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
