#!/usr/bin/env node
/**
 * Diagnóstico read-only dos pódios de um atleta.
 *
 * Responde por que uma colocação não aparece na aba Conquistas do perfil
 * público: mostra por qual caminho cada equipe foi encontrada (memberUids,
 * player1Id ou player2Id) e qual o `finalPlace` de cada resultado.
 *
 * Uso:
 *   gcloud auth application-default login
 *   node functions/scripts/diag-athlete-podiums.js <uid> [projectId]
 *
 * Com --team, inspeciona uma equipe específica e mostra por qual campo o
 * atleta aparece nela:
 *   node functions/scripts/diag-athlete-podiums.js <uid> --team <teamId>
 *
 * Não escreve nada.
 */
const admin = require("firebase-admin");

const uid = process.argv[2];
const projectId = process.argv[3] || "volley-track-dev-4596c";

if (!uid) {
  console.error("uso: node diag-athlete-podiums.js <uid> [projectId]");
  process.exit(1);
}

const teamFlag = process.argv.indexOf("--team");
const teamId = teamFlag > 0 ? process.argv[teamFlag + 1] : null;

admin.initializeApp({projectId});
const db = admin.firestore();

const APP_ID = process.env.NEXAGO_APP_ID || "default-app-id";
const base = `artifacts/${APP_ID}/public/data`;

(async () => {
  const teams = db.collection(`${base}/teams`);

  if (teamId) {
    const doc = await teams.doc(teamId).get();
    if (!doc.exists) {
      console.log(`Equipe ${teamId} não existe em ${base}/teams`);
      return;
    }
    const d = doc.data();
    console.log(`\nEquipe ${teamId}`);
    console.log(`  teamName:   ${d.teamName || "(sem nome)"}`);
    console.log(`  teamSize:   ${d.teamSize ?? "(ausente — é DUPLA)"}`);
    console.log(`  memberUids: ${JSON.stringify(d.memberUids || [])}`);
    console.log(`  player1Id:  ${d.player1Id || "(vazio)"}`);
    console.log(`  player2Id:  ${d.player2Id || "(vazio)"}`);

    const viaMembros = (d.memberUids || []).includes(uid);
    const viaP1 = d.player1Id === uid;
    const viaP2 = d.player2Id === uid;
    console.log(
      `\n  ${uid} aparece via: ` +
        [viaMembros && "memberUids", viaP1 && "player1Id", viaP2 && "player2Id"]
          .filter(Boolean)
          .join(", ") || "  NENHUM campo — o atleta não está nesta equipe",
    );
    if (!viaMembros && (viaP1 || viaP2)) {
      console.log(
        "  >> Só por player1/player2: a consulta antiga (memberUids) " +
          "não via esta equipe. É a causa.",
      );
    }
  }

  // Os três caminhos. Dupla NÃO grava memberUids — era exatamente o que a
  // consulta antiga perdia.
  const [porMembros, porP1, porP2] = await Promise.all([
    teams.where("memberUids", "array-contains", uid).get(),
    teams.where("player1Id", "==", uid).get(),
    teams.where("player2Id", "==", uid).get(),
  ]);

  const encontrados = new Map();
  const registra = (snap, via) => {
    snap.docs.forEach((d) => {
      const atual = encontrados.get(d.id) || {via: [], data: d.data()};
      atual.via.push(via);
      encontrados.set(d.id, atual);
    });
  };
  registra(porMembros, "memberUids");
  registra(porP1, "player1Id");
  registra(porP2, "player2Id");

  console.log(`\nEquipes de ${uid}: ${encontrados.size}`);
  console.log(
    `  via memberUids: ${porMembros.size} · player1Id: ${porP1.size} · ` +
      `player2Id: ${porP2.size}`,
  );
  if (porMembros.size === 0 && encontrados.size > 0) {
    console.log(
      "  >> Nenhuma por memberUids: são DUPLAS. A consulta antiga não as via.",
    );
  }
  if (encontrados.size === 0) {
    console.log("  >> Nenhuma equipe. A causa não é a consulta de equipes.");
    return;
  }

  const ids = [...encontrados.keys()];
  const lotes = [];
  for (let i = 0; i < ids.length; i += 10) lotes.push(ids.slice(i, i + 10));

  const snaps = await Promise.all(
    lotes.map((lote) =>
      db.collection(`${base}/tournamentCategoryResults`)
        .where("teamId", "in", lote)
        .get(),
    ),
  );

  const resultados = snaps.flatMap((s) => s.docs.map((d) => d.data()));
  console.log(`\nResultados dessas equipes: ${resultados.length}`);

  if (resultados.length === 0) {
    console.log(
      "  >> Sem resultado gravado. O torneio pode não ter fechado a " +
        "colocação — nesse caso o pódio não tem de onde sair.",
    );
    return;
  }

  const nomes = new Map();
  const tids = [...new Set(resultados.map((r) => r.tournamentId).filter(Boolean))];
  for (let i = 0; i < tids.length; i += 10) {
    const snap = await db.collection("tournaments")
      .where(admin.firestore.FieldPath.documentId(), "in", tids.slice(i, i + 10))
      .get();
    snap.docs.forEach((d) => nomes.set(d.id, d.data().name || "(sem nome)"));
  }

  for (const r of resultados) {
    const place = r.finalPlace;
    const podio = place >= 1 && place <= 3 ? "PÓDIO" : "fora do pódio";
    console.log(
      `  ${String(place).padStart(2)}º · ${podio} · ${r.year} · ` +
        `${nomes.get(r.tournamentId) || r.tournamentId}`,
    );
  }

  const podios = resultados.filter((r) => r.finalPlace >= 1 && r.finalPlace <= 3);
  console.log(`\nPódios que a aba deve mostrar: ${podios.length}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
