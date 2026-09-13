/* eslint-disable */
/**
 * Insere uma equipe JÁ INSCRITA num grupo de uma categoria EM ANDAMENTO,
 * criando só os jogos que faltam — sem tocar em nada que já existe.
 *
 * Diferença para `add-team-to-published-bracket.js`: aquele regera a categoria
 * inteira (e por isso aborta se alguma partida já foi jogada). Este é para o
 * caso em que a fase de grupos já começou: os resultados existentes não podem
 * ser perdidos, então a equipe nova só ganha o rodízio contra o grupo escolhido.
 *
 * O que grava:
 *   - N partidas novas (N = tamanho atual do grupo), poolId do grupo,
 *     numeradas a partir do maior matchNumber da categoria + 1
 *   - categoryOps[cat].groupsPreview: equipe no fim do grupo
 *   - categoryOps[cat].seeds: equipe no fim
 *
 * O que NÃO faz: não apaga nem renumera partida nenhuma, não mexe no mata-mata
 * (os slots são "1º/2º do Grupo X" e independem do tamanho do grupo), não
 * notifica atletas.
 *
 * ATENÇÃO: as duplas que já estavam no grupo passam a ter um jogo a mais, e a
 * equipe nova entra com 0 jogos enquanto as outras já jogaram. É decisão de
 * organização — o script só executa.
 *
 * Uso (na pasta functions/):
 *   node scripts/insert-team-into-live-group.js \
 *     --project volley-track-dev-4596c \
 *     --tournament <id> --category <id> --team <id> --group D
 *   … --yes   # aplica (sem isso é DRY-RUN)
 */

const admin = require("firebase-admin");
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
const groupId = (argValue("--group") || "").trim();

if (!projectId || !tournamentId || !categoryId || !teamId || !groupId) {
  console.error("uso: --project <id> --tournament <id> --category <id> --team <id> --group <X> [--yes]");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const {FieldValue} = admin.firestore;
const base = `artifacts/${projectId}/public/data`;

const cache = {};
async function teamLabel(id) {
  if (cache[id]) return cache[id];
  const s = await db.doc(`${base}/teams/${id}`).get();
  if (!s.exists) return (cache[id] = `${id} (inexistente)`);
  const d = s.data();
  // Trio+ tem nome PRÓPRIO (`teamName`/`customTeamName`), e é por ele que a
  // equipe é chamada na quadra — listar os dois primeiros atletas esconderia
  // que "Piracanjuba 2" é a equipe. Dupla não tem nome, então cai nos atletas.
  const proprio = (d.customTeamName || d.teamName || "").trim();
  const atletas = [d.player1DisplayName, d.player2DisplayName].filter(Boolean).join(" / ");
  const nome = Number(d.teamSize) >= 3 && proprio ? proprio : atletas || proprio || "(sem nome)";
  return (cache[id] = `${nome}`);
}

(async () => {
  const tSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tSnap.exists) throw new Error(`Torneio ${tournamentId} não existe`);
  const tournament = tSnap.data();
  const category = (tournament.categories || []).find((c) => String(c.id) === categoryId);
  if (!category) throw new Error(`Categoria ${categoryId} não existe no torneio`);
  const ops = (tournament.categoryOps || {})[categoryId] || {};
  const format = ops.bracketFormatOverride || category.bracketFormat || "groups_knockout";
  if (format !== "groups_knockout") throw new Error(`Só trata groups_knockout (está em "${format}")`);
  const bestOf = category.bestOf === "singleSet" ? 1 : category.bestOf === "bestOf5" ? 5 : 3;

  // Inscrição confirmada: mesma regra da callable de chave.
  const ins = await db.collection(`${base}/inscriptions`)
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();
  const own = ins.docs.find((d) => d.data().teamId === teamId);
  if (!own) throw new Error(`Equipe ${teamId} não tem inscrição nesta categoria.`);
  const oi = own.data();
  if (!(oi.isPaid === true && oi.waitlist !== true && oi.partnerPending !== true)) {
    throw new Error(
      `Inscrição ${own.id} não está confirmada ` +
      `(isPaid=${oi.isPaid} waitlist=${oi.waitlist} partnerPending=${oi.partnerPending}).`,
    );
  }

  const groups = (ops.groupsPreview || []).map((g) => ({id: g.id, teamIds: [...(g.teamIds || [])]}));
  if (groups.length === 0) throw new Error("Categoria não tem groupsPreview.");
  const ja = groups.find((g) => g.teamIds.includes(teamId));
  if (ja) throw new Error(`Equipe já está no grupo ${ja.id}. Nada a fazer.`);
  const target = groups.find((g) => g.id === groupId);
  if (!target) throw new Error(`Grupo "${groupId}" não existe. Grupos: ${groups.map((g) => g.id).join(", ")}`);

  const adversarios = [...target.teamIds];

  const all = await db.collection(`${base}/matches`)
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();
  const existentes = all.docs.map((d) => d.data());
  // Rodízio já existente contra a equipe nova? (roda 2x = jogo duplicado)
  const jaTem = existentes.filter((m) => m.teamAId === teamId || m.teamBId === teamId);
  if (jaTem.length > 0) {
    throw new Error(`Equipe já tem ${jaTem.length} partida(s) nesta categoria (#${jaTem.map((m) => m.matchNumber).join(", #")}).`);
  }
  const maxNumber = existentes.reduce((mx, m) => Math.max(mx, Number(m.matchNumber) || 0), 0);

  const noGrupo = existentes.filter((m) => m.isGroupMatch && m.poolId === groupId);
  const concluidos = noGrupo.filter((m) => String(m.status) === "Completed").length;

  console.log(`Torneio:   ${tournament.name}`);
  console.log(`Categoria: ${category.categoryName} (${categoryId}) | bestOf: ${bestOf}`);
  console.log(`Grupo ${groupId}: ${adversarios.length} equipes, ${noGrupo.length} jogos (${concluidos} concluídos)`);
  console.log(`Entrando:  ${await teamLabel(teamId)} (${teamId})`);
  console.log(`Numeração: novos jogos a partir de #${maxNumber + 1}\n`);

  // Alterna mandante/visitante só para a lista não ficar com a mesma dupla
  // sempre do mesmo lado.
  const drafts = [];
  let n = maxNumber;
  for (let i = 0; i < adversarios.length; i++) {
    const rival = adversarios[i];
    const casa = i % 2 === 0;
    drafts.push({
      round: 0,
      matchType: "group",
      poolId: groupId,
      teamAId: casa ? rival : teamId,
      teamBId: casa ? teamId : rival,
      isGroupMatch: true,
      matchNumber: ++n,
    });
  }

  console.log(`--- ${drafts.length} JOGOS NOVOS ---`);
  for (const d of drafts) {
    console.log(`  #${d.matchNumber} G${d.poolId}  ${await teamLabel(d.teamAId)}  vs  ${await teamLabel(d.teamBId)}`);
  }
  console.log(`\nGrupo ${groupId} passa de ${adversarios.length} para ${adversarios.length + 1} equipes ` +
    `(${noGrupo.length} -> ${noGrupo.length + drafts.length} jogos).`);
  console.log(`Partidas da categoria: ${existentes.length} -> ${existentes.length + drafts.length} (nenhuma apagada).`);

  if (!APPLY) {
    console.log("\nDRY-RUN — nada foi gravado. Rode de novo com --yes para aplicar.");
    return;
  }

  target.teamIds.push(teamId);
  const seeds = [...(ops.seeds || [])];
  if (!seeds.includes(teamId)) seeds.push(teamId);

  const batch = db.batch();
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
      categoryOps: {[categoryId]: {groupsPreview: groups, seeds, updatedAt: FieldValue.serverTimestamp()}},
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
  await batch.commit();
  console.log(`\nAPLICADO: ${drafts.length} partidas criadas (#${drafts[0].matchNumber}–#${drafts[drafts.length - 1].matchNumber}), 0 apagadas.`);
})().catch((e) => {
  console.error("\nERRO:", e.message);
  process.exit(1);
});
