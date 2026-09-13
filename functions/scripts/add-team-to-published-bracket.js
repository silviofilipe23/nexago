/* eslint-disable */
/**
 * Inclui uma equipe JÁ INSCRITA numa categoria cuja chave já foi publicada e
 * regenera as partidas da categoria preservando os grupos existentes.
 *
 * Caso típico: a dupla foi inscrita pelo organizador DEPOIS da publicação da
 * chave, então ficou fora de `categoryOps.groupsPreview`/`seeds` e sem nenhuma
 * partida. O portal só oferece "regerar do zero", o que re-sortearia os grupos.
 *
 * Espelha `runGenerateCategoryBracket` (functions/src/organizer-category-ops.ts):
 * apaga as partidas da categoria e recria a partir de `buildGroupsKnockoutMatches`,
 * com a MESMA definição de "dupla confirmada" (isPaid && !waitlist && !partnerPending).
 *
 * Diferença deliberada: os grupos NÃO são re-sorteados — a equipe nova entra no
 * fim do grupo indicado (padrão: o menor), e o resto do sorteio fica intacto.
 *
 * NÃO dispara os efeitos colaterais da callable (push de "chave publicada",
 * expiração de passes de vaga / convites de substituição, carimbo de força do
 * campo). Passes e convites já morreram na 1ª publicação; o push de novo
 * avisaria a categoria inteira à toa.
 *
 * Pré-requisitos:
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/add-team-to-published-bracket.js \
 *     --project volley-track-dev-4596c \
 *     --tournament <tournamentId> --category <categoryId> --team <teamId>
 *   … --group B    # força o grupo de destino
 *   … --yes        # aplica (sem isso é DRY-RUN)
 */

const admin = require("firebase-admin");
const {buildGroupsKnockoutMatches} = require("../lib/category-bracket-builders");
const {bracketMatchDoc} = require("../lib/organizer-category-ops");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const projectId = argValue("--project");
const tournamentId = (argValue("--tournament") || "").trim();
const categoryId = (argValue("--category") || "").trim();
const teamId = (argValue("--team") || "").trim();
const groupArg = (argValue("--group") || "").trim();

if (!projectId || !tournamentId || !categoryId || !teamId) {
  console.error(
    "uso: --project <id> --tournament <id> --category <id> --team <id> [--group X] [--yes]",
  );
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const {FieldValue} = admin.firestore;
const base = `artifacts/${projectId}/public/data`;

/** Mesma regra da callable: pago, fora da fila e com dupla completa. */
function isConfirmed(data) {
  return (
    typeof data.teamId === "string" &&
    data.teamId.trim().length > 0 &&
    data.isPaid === true &&
    data.waitlist !== true &&
    data.partnerPending !== true
  );
}

async function teamLabel(id) {
  const snap = await db.doc(`${base}/teams/${id}`).get();
  if (!snap.exists) return `${id} (equipe inexistente)`;
  const t = snap.data();
  const names = [t.player1DisplayName, t.player2DisplayName, ...(t.memberNames || [])]
    .filter((n) => typeof n === "string" && n.trim());
  return `${id} — ${names.join(" / ") || t.teamName || "(sem nome)"}`;
}

(async () => {
  const tSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tSnap.exists) throw new Error(`Torneio ${tournamentId} não existe`);
  const tournament = tSnap.data();
  const category = (tournament.categories || []).find((c) => String(c.id) === categoryId);
  if (!category) throw new Error(`Categoria ${categoryId} não existe no torneio`);

  const ops = (tournament.categoryOps || {})[categoryId] || {};
  const format = ops.bracketFormatOverride || category.bracketFormat || "groups_knockout";
  if (format !== "groups_knockout") {
    throw new Error(`Este script só trata groups_knockout (categoria está em "${format}")`);
  }
  const qualifiersPerGroup =
    (ops.bracketConfig && ops.bracketConfig.qualifiersPerGroup) ??
    category.qualifiersPerGroup ??
    2;
  const bestOf = category.bestOf === "singleSet" ? 1 : category.bestOf === "bestOf5" ? 5 : 3;

  console.log(`Torneio:   ${tournament.name}`);
  console.log(`Categoria: ${category.categoryName} (${categoryId})`);
  console.log(`Formato:   ${format} | classificados/grupo: ${qualifiersPerGroup} | bestOf: ${bestOf}`);
  console.log(`bracketStatus atual: ${ops.bracketStatus || "(não publicada)"}\n`);

  // --- inscrições confirmadas ---
  const insSnap = await db
    .collection(`${base}/inscriptions`)
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();
  const confirmed = new Set();
  for (const d of insSnap.docs) if (isConfirmed(d.data())) confirmed.add(d.data().teamId.trim());

  if (!confirmed.has(teamId)) {
    const own = insSnap.docs.find((d) => d.data().teamId === teamId);
    throw new Error(
      own ?
        `Equipe ${teamId} tem inscrição (${own.id}) mas NÃO está confirmada ` +
          `(isPaid=${own.data().isPaid} waitlist=${own.data().waitlist} ` +
          `partnerPending=${own.data().partnerPending}). Confirme o pagamento antes.` :
        `Equipe ${teamId} não tem inscrição nesta categoria.`,
    );
  }

  // --- grupos preservados + equipe nova ---
  const groups = (ops.groupsPreview || []).map((g) => ({
    id: g.id,
    teamIds: [...(g.teamIds || [])],
  }));
  if (groups.length === 0) throw new Error("Categoria não tem groupsPreview — use o portal para sortear.");

  const alreadyIn = groups.find((g) => g.teamIds.includes(teamId));
  if (alreadyIn) {
    console.log(`Equipe já está no grupo ${alreadyIn.id}; nada a incluir (só as partidas serão refeitas).`);
  } else {
    const target = groupArg ?
      groups.find((g) => g.id === groupArg) :
      groups.reduce((a, b) => (b.teamIds.length < a.teamIds.length ? b : a));
    if (!target) throw new Error(`Grupo "${groupArg}" não existe. Grupos: ${groups.map((g) => g.id).join(", ")}`);
    target.teamIds.push(teamId);
    console.log(`Equipe entra no grupo ${target.id} (fim da lista).\n`);
  }

  // --- guardas da callable ---
  const previewIds = groups.flatMap((g) => g.teamIds.map((s) => s.trim()).filter(Boolean));
  if (new Set(previewIds).size !== previewIds.length) throw new Error("Dupla repetida nos grupos.");
  const missing = [...confirmed].filter((id) => !previewIds.includes(id));
  const extra = previewIds.filter((id) => !confirmed.has(id));
  if (missing.length || extra.length) {
    throw new Error(
      `Grupos não batem com as inscrições confirmadas.\n` +
      `  confirmadas fora dos grupos: ${missing.join(", ") || "-"}\n` +
      `  nos grupos sem confirmação:  ${extra.join(", ") || "-"}`,
    );
  }
  const small = groups.find((g) => g.teamIds.length < qualifiersPerGroup);
  if (small) throw new Error(`Grupo ${small.id} tem menos duplas (${small.teamIds.length}) que os ${qualifiersPerGroup} classificados.`);

  // --- partidas existentes: nenhuma pode ter sido jogada ---
  const existing = await db
    .collection(`${base}/matches`)
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();
  const played = existing.docs.filter((d) => {
    const m = d.data();
    const st = String(m.status || "").toLowerCase();
    return (
      st.includes("progress") || st.includes("andamento") || st.includes("live") ||
      st.includes("complet") || st.includes("final") || st.includes("conclu") ||
      (typeof m.winnerId === "string" && m.winnerId.trim().length > 0)
    );
  });
  if (played.length > 0) {
    console.error(`\nABORTADO: ${played.length} partida(s) já em andamento/concluída(s):`);
    for (const d of played) console.error(`  #${d.data().matchNumber} ${d.id} status=${d.data().status}`);
    process.exit(1);
  }

  // --- novo conjunto de partidas ---
  const seeds = [...(ops.seeds || []).filter((id) => confirmed.has(id))];
  for (const id of previewIds) if (!seeds.includes(id)) seeds.push(id);

  const drafts = buildGroupsKnockoutMatches(seeds, groups, qualifiersPerGroup);

  console.log("--- GRUPOS FINAIS ---");
  for (const g of groups) {
    console.log(`  Grupo ${g.id} (${g.teamIds.length}):`);
    for (const id of g.teamIds) console.log(`    ${await teamLabel(id)}${id === teamId ? "   <== NOVA" : ""}`);
  }

  const novas = drafts.filter((d) => d.isGroupMatch && (d.teamAId === teamId || d.teamBId === teamId));
  console.log(`\n--- PARTIDAS: ${existing.size} atuais -> ${drafts.length} novas ---`);
  console.log(`Jogos da equipe nova: ${novas.length}`);
  for (const d of drafts) {
    const mark = d.teamAId === teamId || d.teamBId === teamId ? "  <==" : "";
    if (d.isGroupMatch) {
      console.log(`  #${String(d.matchNumber).padStart(2)} G${d.poolId}  ${d.teamAId} x ${d.teamBId}${mark}`);
    } else {
      console.log(`  #${String(d.matchNumber).padStart(2)} R${d.round}  ${d.teamADescription || ""} x ${d.teamBDescription || ""}`);
    }
  }

  if (!APPLY) {
    console.log("\nDRY-RUN — nada foi gravado. Rode de novo com --yes para aplicar.");
    return;
  }

  const batch = db.batch();
  for (const d of existing.docs) batch.delete(d.ref);
  const col = db.collection(`${base}/matches`);
  for (const draft of drafts) {
    batch.set(col.doc(), {
      ...bracketMatchDoc(draft, {tournamentId, categoryId, bestOf}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  batch.set(
    db.doc(`tournaments/${tournamentId}`),
    {
      categoryOps: {
        [categoryId]: {
          bracketStatus: "published",
          bracketFormatOverride: format,
          seeds,
          bracketConfig: {...(ops.bracketConfig || {}), qualifiersPerGroup},
          groupsPreview: groups,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  await batch.commit();
  console.log(`\nAPLICADO: ${existing.size} partidas apagadas, ${drafts.length} criadas.`);
})().catch((e) => {
  console.error("\nERRO:", e.message);
  process.exit(1);
});
