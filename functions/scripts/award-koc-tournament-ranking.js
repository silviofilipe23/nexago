/* eslint-disable */
/**
 * Pontua no ranking global, POR EXCEÇÃO, as categorias King of the Court de UM
 * torneio.
 *
 * O motor não pontua KOTC — decisão de produto de 20/09, travada em
 * `src/koc-no-ranking.test.ts` e em `docs/business-rules/king-of-court.md`. Ela
 * continua valendo. Este script é a porta manual para quando o dono decide que
 * um torneio específico conta (30/09: SiDr6BiPlrKCW0JX5IPj, Queen & King of the
 * Court de 26/09). Não reverte a decisão, não precisa de deploy.
 *
 * O que ele faz, por categoria KOTC do torneio:
 *   - colocação: `scripts/lib/koc-ranking-awards.js` (pódio pela tabela da
 *     final, fase intermediária pela faixa, 1ª fase = participação);
 *   - pontos: a MESMA fórmula do motor — base × peso do preset × rankingWeight
 *     × fator de chave. Peso medido (Livre / "até X") sai do carimbo de força
 *     do campo gravado na publicação da chave; sem carimbo, mede na hora SEM
 *     carimbar (dry-run continua só leitura);
 *   - gravação: `awardGlobalPlacement` do motor — mesmo caminho de escrita
 *     (resultado por categoria + dupla + atletas). Idempotente: rodar de novo
 *     não muda nada que já esteja igual.
 *
 * O que ele NÃO faz: rating Glicko, XP, palpites, ranking de liga.
 *
 * Gates do motor que continuam valendo: `rankingEnabled` desligado → pula a
 * categoria. Menos de 10 duplas pagas (desafio) → pula, a não ser com
 * `--ignore-min-teams`.
 *
 * Pré-requisitos: credenciais admin (`gcloud auth application-default login`)
 * e lib/ compilada (`npm run build` na pasta functions/).
 *
 * Uso (na pasta functions/):
 *   node scripts/award-koc-tournament-ranking.js --project volley-track-dev-4596c --tournament <id>
 *   node scripts/award-koc-tournament-ranking.js ... --category <categoryId>
 *   node scripts/award-koc-tournament-ranking.js ... --ignore-min-teams
 *   node scripts/award-koc-tournament-ranking.js ... --yes
 *
 * Sem --yes é DRY-RUN: imprime a tabela de pontos e não escreve nada.
 */

const admin = require("firebase-admin");
const {
  awardGlobalPlacement,
  bracketSizeFactor,
  globalPointsForAward,
  isGlobalRankingEligible,
} = require("../lib/tournament-ranking");
const {categoryPreset, LEGACY_CATEGORY_WEIGHT} = require("../lib/category-presets");
const {
  loadPaidTeamsWithParticipants,
  measureFieldStrength,
  readFieldStrengthStamp,
} = require("../lib/category-field-strength-store");
const {clampMeasuredWeight} = require("../lib/category-field-strength");
const {tournamentSportToLevelSportCode} = require("../lib/category-level-eligibility");
const {findCategory} = require("../lib/tournament-registration-guards");
const {parseMatchPlayedAt} = require("../lib/tournament-match-gamification");
const {artifactsMatchesPath, artifactsTeamsPath} = require("../lib/firebase-paths");
const {kocRankingAwards} = require("./lib/koc-ranking-awards");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const IGNORE_MIN_TEAMS = process.argv.includes("--ignore-min-teams");
const projectId = argValue("--project");
const tournamentId = argValue("--tournament");
const onlyCategoryId = argValue("--category");

if (!projectId || !tournamentId) {
  console.error("Uso: --project <projectId> --tournament <tournamentId> [--category <id>] [--ignore-min-teams] [--yes]");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();

/** Espelha `resolveMeasuredWeight` do motor, menos o carimbo lazy. */
async function presetWeight(tournament, categoryId, paidTeams) {
  const preset = categoryPreset(findCategory(tournament, categoryId));
  if (!preset) return LEGACY_CATEGORY_WEIGHT;
  if (!preset.measured) return preset.weight;
  const stamp = await readFieldStrengthStamp(db, projectId, tournamentId, categoryId);
  if (stamp) return clampMeasuredWeight(stamp.weight, preset.maxWeight);
  const measured = await measureFieldStrength(db, projectId, {
    tournamentId,
    categoryId,
    presetKey: preset.key,
    maxWeight: preset.maxWeight,
    sportCode: tournamentSportToLevelSportCode(tournament.sport),
    teams: paidTeams,
    source: "lazy",
  });
  return measured ? measured.weight : preset.weight;
}

async function teamLabel(teamId) {
  const team = (await db.doc(`${artifactsTeamsPath(projectId)}/${teamId}`).get()).data() ?? {};
  return `${team.player1DisplayName ?? "?"} / ${team.player2DisplayName ?? "?"}`;
}

async function main() {
  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) throw new Error(`torneio ${tournamentId} não existe em ${projectId}`);
  const tournament = tournamentSnap.data();
  const rawRankingWeight = Number(tournament.rankingWeight ?? 1);
  const rankingWeight =
    Number.isFinite(rawRankingWeight) && rawRankingWeight > 0 ? rawRankingWeight : 1;
  const isLeagueStage = String(tournament.leagueId ?? "").trim().length > 0;
  const rankingEnabled = tournament.rankingEnabled !== false;

  console.log(`${APPLY ? "GRAVANDO" : "DRY-RUN"} — ${tournament.name} (${tournamentId}) em ${projectId}`);
  if (isLeagueStage) console.log("  etapa de liga: o ranking da liga NÃO é tocado, só o global");

  const matchesSnap = await db
    .collection(artifactsMatchesPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .get();
  const matchesByCategory = new Map();
  for (const doc of matchesSnap.docs) {
    const match = doc.data();
    const list = matchesByCategory.get(match.categoryId) ?? [];
    list.push(match);
    matchesByCategory.set(match.categoryId, list);
  }

  for (const category of tournament.categories ?? []) {
    const categoryId = String(category.id);
    if (onlyCategoryId && categoryId !== onlyCategoryId) continue;
    const label = `${category.categoryName ?? category.name ?? "?"} (${categoryId})`;
    const matches = matchesByCategory.get(categoryId) ?? [];
    if (!matches.some((m) => String(m.matchType ?? "").startsWith("koc_"))) {
      console.log(`\n== ${label}: não é KOTC — o motor já pontua, pulando`);
      continue;
    }

    const paidTeams = await loadPaidTeamsWithParticipants(db, projectId, tournamentId, categoryId);
    if (!rankingEnabled && !isLeagueStage) {
      console.log(`\n== ${label}: rankingEnabled desligado no torneio — pulando`);
      continue;
    }
    if (!isGlobalRankingEligible({isLeagueStage, rankingEnabled, paidTeamsCount: paidTeams.size})) {
      if (!IGNORE_MIN_TEAMS) {
        console.log(`\n== ${label}: ${paidTeams.size} duplas pagas (< 10, desafio) — pulando (use --ignore-min-teams)`);
        continue;
      }
      console.log(`\n   (exceção --ignore-min-teams: ${paidTeams.size} duplas pagas)`);
    }

    const awards = kocRankingAwards(matches);
    const weight = await presetWeight(tournament, categoryId, paidTeams);
    const sizeFactor = bracketSizeFactor(paidTeams.size);
    const pointsMultiplier = weight * rankingWeight * sizeFactor;
    const final = matches.find((m) => m.matchType === "koc_final");
    const completedAt = parseMatchPlayedAt(final);

    console.log(
      `\n== ${label}: ${paidTeams.size} pagas · peso ${weight} × rankingWeight ${rankingWeight} ` +
        `× chave ${sizeFactor} = ${pointsMultiplier}`,
    );
    let written = 0;
    for (const award of awards) {
      const points = globalPointsForAward(award, pointsMultiplier);
      const paid = paidTeams.has(award.teamId) ? "" : "  (NÃO PAGA)";
      let status = "";
      if (APPLY) {
        const changed = await awardGlobalPlacement(db, projectId, {
          tournamentId,
          categoryId,
          award,
          pointsMultiplier,
          year: completedAt.getFullYear(),
          completedAt,
          // Fase 3a: o esporte decide em qual doc o ponto cai (legado × por esporte).
          sportCode: tournamentSportToLevelSportCode(tournament.sport),
        });
        if (changed) written++;
        status = changed ? "  gravado" : "  já estava igual";
      }
      const place = String(award.place ?? award.bucket).padEnd(9);
      console.log(`   ${place}${String(points).padStart(6)} pts  ${await teamLabel(award.teamId)}${paid}${status}`);
    }
    if (APPLY) console.log(`   ${written}/${awards.length} colocação(ões) gravada(s)`);
  }
  if (!APPLY) console.log("\nNada foi gravado. Rode de novo com --yes para aplicar.");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
