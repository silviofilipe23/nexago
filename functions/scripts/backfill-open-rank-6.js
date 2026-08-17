/* eslint-disable */
/**
 * Backfill: renumeração do Open na escada de rating — `levelRank` 5 → 6.
 *
 * Contexto (17/08): a escada de rating ganhou 2 degraus novos (`avancado_1`
 * rank 4, `avancado_2` rank 5 — antes vagos) e o `open` subiu do rank 5 para
 * o rank 6, topo da escada de 7 degraus. `rating-config.ts` (Task 2) já tem
 * a escada nova hardcoded (`VOLLEYBALL_LEVELS`), mas isso sozinho NÃO migra:
 *
 *   (a) docs já gravados em `artifacts/{projectId}/public/data/athleteRatings`
 *       (path aninhado — mesmo usado por `athleteRatingsPath()` em
 *       `functions/src/rating-engine.ts` e por `scripts/set-athlete-level.js`;
 *       NÃO é a coleção raiz `athleteRatings`, que não existe no modelo de
 *       dados) com `levelRank === 5` (o Open de antes — o rank 4 nunca foi
 *       usado, então rank 5 só pode ser Open) continuam com o número velho
 *       até alguém escrever neles de novo;
 *   (b) se existir doc em `ratingLadders/{sportCode}` (essa sim é coleção
 *       raiz — ver `rating-config.ts`) com campo `levels`, `parseLadderConfig`
 *       MESCLA esse doc por cima dos defaults — a escada nova do código não
 *       tem efeito nenhum enquanto o doc não for sobrescrito também.
 *
 * Este script cobre os dois pontos, e também realinha o estado da escada
 * (`AthleteRatingState` em `rating-ladder.ts`, campos serializados por
 * `ratingStateToDoc`/`ratingStateFromDoc`) em cada doc migrado:
 *   (c) `zone`/`ladderState` voltam para `"stable"` e a janela de
 *       observação de rebaixamento (`observationStartedAt`,
 *       `observationMatches`) é zerada. Sem isso, quem tinha rating perto
 *       de 1900-2100 acorda abaixo do novo `demoteAt: 2100` do Open e o
 *       passe diário (`evaluateRatingLadderDaily`, em
 *       `rating-triggers.ts`) — ou a própria próxima partida rateada —
 *       marca `zone: "relegation"` / `ladderState:
 *       "relegation_observation"` e pode emitir uma notificação
 *       `relegation_warning` antes do atleta ter jogado sequer uma
 *       partida no nível novo;
 *   (d) `protectedUntil` grava a proteção de promoção padrão (D2): agora +
 *       120 dias (`promotionProtectionDays`, default em
 *       `rating-config.ts`), o mesmo campo/formato que
 *       `onUserWrittenTrackLevelChanges` (`rating-triggers.ts`) e
 *       `planLevelChange`/`applyPromotion` (`athlete-level-admin.ts` /
 *       `rating-ladder.ts`) gravam numa subida de nível.
 * O rebaixamento automático em si já está atrás de flag
 * (`autoRelegationEnabled: false`), mas sem o reset acima o atleta ainda
 * ficaria marcado/observado (e, fora de `shadowMode` com
 * `notificationsEnabled`, notificado) como em risco por engano.
 *
 * RUNBOOK — ordem obrigatória:
 *   1. Deploy das functions com a escada de 7 níveis
 *      (`VOLLEYBALL_LEVELS`/`rating-config.ts`).
 *   2. Rode este backfill IMEDIATAMENTE em seguida, ANTES do primeiro
 *      passe diário da escada (`evaluateRatingLadderDaily`, cron diário) —
 *      a janela entre deploy e backfill é quando Open ~1900 fica exposto
 *      ao `demoteAt: 2100` novo.
 *   3. Antes de tudo, confira as flags do doc `ratingLadders/{esporte}` do
 *      ambiente-alvo (`ratingEnabled`, `shadowMode`,
 *      `autoRelegationEnabled`, `notificationsEnabled`): se o ambiente já
 *      tiver a escada nova ativa fora de `shadowMode` com rebaixamento
 *      automático ligado, o risco da janela é real, não só teórico.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/backfill-open-rank-6.js --project volley-track-dev-4596c
 *   node scripts/backfill-open-rank-6.js --project <id> --yes
 *   node scripts/backfill-open-rank-6.js --project <id> --yes --limit 50
 *
 * Sem --yes é DRY-RUN: só lista o que mudaria, sem escrever.
 *
 * Idempotência: re-executar depois de aplicar não encontra mais nenhum
 * `artifacts/{projectId}/public/data/athleteRatings` doc com `levelRank == 5`
 * (todos já viraram 6), e o `ratingLadders/{id}.levels` regravado é
 * byte-a-byte o mesmo array — a segunda passada não muda nada. `zone`,
 * `ladderState` e a janela de observação continuam idempotentes (sempre
 * reescritos para o mesmo valor "stable"/zerado); só `protectedUntil`
 * avança a cada re-execução — reaplicar depois do primeiro `--yes` estende
 * a proteção, o que é inofensivo mas não é necessário.
 */

const admin = require("firebase-admin");

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

/** Piso do Open na renumeração de 17/08 — mesmo `initialRating` do rank 6. */
const OPEN_RATING_FLOOR = 2200;

/**
 * Proteção de promoção padrão (D2) — mesmos dias de
 * `config.ladder.promotionProtectionDays` (default em `rating-config.ts`,
 * `DEFAULT_RATING_LADDER_CONFIG.ladder`) que `onUserWrittenTrackLevelChanges`
 * e `applyPromotion`/`planLevelChange` usam numa subida de nível.
 */
const PROMOTION_PROTECTION_DAYS = 120;
const DAY_MS = 86_400_000;

/**
 * Escada de 7 níveis — cópia literal de `VOLLEYBALL_LEVELS` em
 * `functions/src/rating-config.ts`. Mantida em sincronia manualmente (script
 * standalone, sem import do bundle compilado das functions).
 */
const NEW_LEVELS = [
  {code: "iniciante_1", rank: 0, label: "Iniciante 1", initialRating: 1250, promoteAt: 1420, demoteAt: null},
  {code: "iniciante_2", rank: 1, label: "Iniciante 2", initialRating: 1450, promoteAt: 1570, demoteAt: 1350},
  {code: "intermediario_1", rank: 2, label: "Intermediário 1", initialRating: 1600, promoteAt: 1720, demoteAt: 1500},
  {code: "intermediario_2", rank: 3, label: "Intermediário 2", initialRating: 1750, promoteAt: 1870, demoteAt: 1650},
  {code: "avancado_1", rank: 4, label: "Avançado 1", initialRating: 1900, promoteAt: 2020, demoteAt: 1800},
  {code: "avancado_2", rank: 5, label: "Avançado 2", initialRating: 2050, promoteAt: 2170, demoteAt: 1950},
  {code: "open", rank: 6, label: "Open", initialRating: 2200, promoteAt: null, demoteAt: 2100},
];

const RATING_LADDER_DOC_IDS = ["VOLEI_PRAIA", "VOLEI_QUADRA", "default"];

/**
 * Path aninhado real de `athleteRatings` — mesmo de `athleteRatingsPath()`
 * em `functions/src/rating-engine.ts` e de `scripts/set-athlete-level.js`.
 * NÃO é a coleção raiz `athleteRatings` (essa não existe no modelo de dados).
 */
function athleteRatingsCollectionPath() {
  return `artifacts/${projectId}/public/data/athleteRatings`;
}

async function backfillAthleteRatings() {
  let query = db.collection(athleteRatingsCollectionPath()).where("levelRank", "==", 5);
  if (LIMIT > 0) query = query.limit(LIMIT);
  const snap = await query.get();

  const now = new Date();
  const protectedUntilDate = new Date(now.getTime() + PROMOTION_PROTECTION_DAYS * DAY_MS);
  const protectedUntil = admin.firestore.Timestamp.fromDate(protectedUntilDate);

  console.log(`\n[athleteRatings] ${snap.size} doc(s) com levelRank == 5:`);
  for (const doc of snap.docs) {
    const rating = Number(doc.data().rating) || 0;
    const update = {
      levelRank: 6,
      rating: Math.max(rating, OPEN_RATING_FLOOR),
      // Realinha o estado da escada (`AthleteRatingState` em
      // rating-ladder.ts) pro nível novo: sem isso, quem tinha rating perto
      // de 1900-2100 acorda abaixo do `demoteAt: 2100` do Open já marcado
      // pra rebaixamento pelo passe diário ou pela próxima partida.
      zone: "stable",
      ladderState: "stable",
      observationStartedAt: null,
      observationMatches: 0,
      notifiedAt: null,
      // Proteção de promoção padrão (D2) — mesmo campo/formato gravado por
      // onUserWrittenTrackLevelChanges (rating-triggers.ts) e
      // applyPromotion/planLevelChange numa subida de nível manual.
      protectedUntil,
    };
    console.log(
      `  ${doc.id}: levelRank 5→6, rating ${rating}→${update.rating}, ` +
        `zone/ladderState→stable, observação zerada, ` +
        `protectedUntil→${protectedUntilDate.toISOString()}`,
    );
    if (APPLY) await doc.ref.update(update);
  }
  return snap.size;
}

async function backfillRatingLadders() {
  console.log(`\n[ratingLadders] verificando ${RATING_LADDER_DOC_IDS.join(", ")}:`);
  let touched = 0;
  for (const id of RATING_LADDER_DOC_IDS) {
    const ref = db.doc(`ratingLadders/${id}`);
    const ladder = await ref.get();
    if (!ladder.exists) {
      console.log(`  ${id}: doc não existe — nada a fazer (defaults hardcoded valem).`);
      continue;
    }
    const currentLevels = ladder.data().levels;
    if (!Array.isArray(currentLevels)) {
      console.log(`  ${id}: doc existe mas sem campo "levels" — nada a fazer.`);
      continue;
    }
    console.log(`  ${id}: ${currentLevels.length} nível(is) → ${NEW_LEVELS.length}`);
    touched += 1;
    if (APPLY) await ref.update({levels: NEW_LEVELS});
  }
  return touched;
}

async function run() {
  console.log(
    APPLY
      ? `Aplicando backfill do Open (rank 6) em ${projectId}…`
      : `DRY-RUN em ${projectId} (passe --yes para escrever).`,
  );

  const athletesPending = await backfillAthleteRatings();
  const laddersPending = await backfillRatingLadders();

  console.log("\nResumo:");
  console.log(`  athleteRatings a migrar: ${athletesPending}`);
  console.log(`  ratingLadders a sobrescrever: ${laddersPending}`);
  if (!APPLY) {
    console.log("  (dry-run — nada escrito; rode de novo com --yes)");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
