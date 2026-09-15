/* eslint-disable */
/**
 * Funde as equipes duplicadas da MESMA dupla: um doc sobrevive, os outros são
 * absorvidos e apagados, e tudo que apontava para eles passa a apontar para o
 * sobrevivente.
 *
 * POR QUE existe: até `resolvePairTeamTx` entrar no ar, cada inscrição criava
 * uma equipe nova. Como `teamRankings` é chaveado pelo id da equipe, a mesma
 * dupla aparece duas vezes no ranking com metade da história em cada entrada.
 *
 * ORDEM DE ROLLOUT: backfill-team-pair-key.js -> deploy (functions + rules) ->
 * ESTE script. Rodar antes do deploy funciona, mas o sangramento continua.
 *
 * O inventário abaixo veio de varredura real do dev. `matches/{id}/pointEvents`
 * (usa `side: "A"/"B"`) e `matches/{id}/auditLog` (usa `byUid`) NÃO guardam
 * teamId e por isso não são tocados.
 *
 * Uso (na pasta functions/):
 *   node scripts/merge-duplicate-pair-teams.js --project volley-track-dev-4596c
 *   node scripts/merge-duplicate-pair-teams.js --project <id> --apply
 */
const fs = require("fs");
const admin = require("firebase-admin");
const {
  groupTeamsByPair,
  planGroupMerge,
  mergeTeamRankingDocs,
} = require("./lib/merge-pair-teams-plan.js");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue("--project") || process.env.GCLOUD_PROJECT;
if (!projectId) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}
const apply = process.argv.includes("--apply");

admin.initializeApp({projectId});
const db = admin.firestore();
const base = `artifacts/${projectId}/public/data`;

/** Troca `from` por `to` em qualquer string aninhada; devolve null se nada mudou. */
function remap(value, from, to) {
  if (typeof value === "string") return value === from ? to : null;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = remap(item, from, to);
      if (next === null) return item;
      changed = true;
      return next;
    });
    return changed ? out : null;
  }
  if (value && typeof value === "object" && typeof value.toDate !== "function") {
    let changed = false;
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      const next = remap(inner, from, to);
      if (next === null) {
        out[key] = inner;
      } else {
        out[key] = next;
        changed = true;
      }
    }
    return changed ? out : null;
  }
  return null;
}

const SIMPLE_COLLECTIONS = [
  `${base}/matches`,
  `${base}/inscriptions`,
  `${base}/drawSessions`,
  "tournaments",
  "tournamentRegistrationInvites",
  "tournamentRegistrationCancellations",
];

(async () => {
  const teamsSnap = await db.collection(`${base}/teams`).get();
  const groups = groupTeamsByPair(
    teamsSnap.docs.map((doc) => ({id: doc.id, data: doc.data()})),
  );
  const duplicated = [...groups.entries()].filter(([, members]) => members.length > 1);
  console.log(`equipes=${teamsSnap.size} pares=${groups.size} pares com 2+ docs=${duplicated.length}`);
  if (duplicated.length === 0) {
    console.log("nada a fundir.");
    return;
  }

  // Carrega uma vez tudo que pode apontar para uma equipe.
  const loaded = new Map();
  for (const path of SIMPLE_COLLECTIONS) {
    loaded.set(path, await db.collection(path).get());
  }
  const resultsSnap = await db.collection(`${base}/tournamentCategoryResults`).get();
  const rankingsSnap = await db.collection(`${base}/teamRankings`).get();

  // Em que torneios cada equipe está — é o que separa duplicação de convivência
  // legítima (o par em duas categorias do MESMO torneio).
  const tournamentsByTeamId = {};
  // `planGroupMerge` distingue "está em zero torneios" de "não sei em quais":
  // o vazio tem de ser DECLARADO. Toda equipe de grupo duplicado entra no mapa
  // antes da varredura, nem que seja com `[]` — sem isso, a equipe órfã (sem
  // inscrição nenhuma) sairia como `dados-incompletos` e nunca fundiria.
  for (const [, members] of duplicated) {
    for (const member of members) tournamentsByTeamId[member.id] = [];
  }
  for (const doc of loaded.get(`${base}/inscriptions`).docs) {
    const data = doc.data();
    const teamId = String(data.teamId ?? "").trim();
    const tournamentId = String(data.tournamentId ?? "").trim();
    if (!teamId || !tournamentId) continue;
    if (!tournamentsByTeamId[teamId]) tournamentsByTeamId[teamId] = [];
    if (!tournamentsByTeamId[teamId].includes(tournamentId)) {
      tournamentsByTeamId[teamId].push(tournamentId);
    }
  }

  const refCountByTeamId = {};
  const countRef = (teamId) => {
    refCountByTeamId[teamId] = (refCountByTeamId[teamId] || 0) + 1;
  };
  for (const [, snap] of loaded) {
    for (const doc of snap.docs) {
      const text = JSON.stringify(doc.data());
      for (const [, members] of duplicated) {
        for (const member of members) {
          if (text.includes(`"${member.id}"`)) countRef(member.id);
        }
      }
    }
  }
  for (const doc of resultsSnap.docs) {
    const teamId = String(doc.data().teamId ?? "").trim();
    if (teamId) countRef(teamId);
  }

  // DUAS listas, nunca uma. Apagar é sempre a ÚLTIMA fase: se a fase de
  // repontamento falhar no meio, o doc antigo continua vivo e as inscrições
  // seguem resolvendo. O contrário (apagar antes) deixaria inscrição órfã —
  // some da listagem e trava no `inscriptionParticipantUidsMatchTeam`.
  const mapping = [];
  const remaps = [];
  const removals = [];
  for (const [pairKey, members] of duplicated) {
    const plan = planGroupMerge({members, tournamentsByTeamId, refCountByTeamId});
    if (plan.skipped) {
      console.log(`PULADO ${pairKey}: ${plan.reason} (${members.map((m) => m.id).join(", ")})`);
      continue;
    }
    mapping.push({pairKey, survivorId: plan.survivorId, absorbedIds: plan.absorbedIds});
    console.log(`${pairKey}: ${plan.absorbedIds.join(", ")} -> ${plan.survivorId}`);

    for (const absorbedId of plan.absorbedIds) {
      for (const [, snap] of loaded) {
        for (const doc of snap.docs) {
          const next = remap(doc.data(), absorbedId, plan.survivorId);
          if (next) remaps.push({ref: doc.ref, data: next});
        }
      }

      for (const doc of resultsSnap.docs) {
        const data = doc.data();
        if (String(data.teamId ?? "").trim() !== absorbedId) continue;
        const newId = `${data.tournamentId}_${data.categoryId}_${plan.survivorId}`;
        remaps.push({
          ref: db.doc(`${base}/tournamentCategoryResults/${newId}`),
          data: {...data, teamId: plan.survivorId},
        });
        removals.push(doc.ref);
      }

      removals.push(db.doc(`${base}/teams/${absorbedId}`));
    }

    const survivorRanking =
      rankingsSnap.docs.find((d) => d.id === plan.survivorId)?.data() ?? null;
    const absorbedRankings = plan.absorbedIds
      .map((id) => rankingsSnap.docs.find((d) => d.id === id)?.data())
      .filter(Boolean);
    if (survivorRanking || absorbedRankings.length > 0) {
      const merged = mergeTeamRankingDocs(survivorRanking, absorbedRankings);
      remaps.push({
        ref: db.doc(`${base}/teamRankings/${plan.survivorId}`),
        data: {
          ...(survivorRanking || {}),
          teamId: plan.survivorId,
          ...merged,
          lastUpdated: admin.firestore.Timestamp.now(),
        },
      });
      for (const id of plan.absorbedIds) {
        removals.push(db.doc(`${base}/teamRankings/${id}`));
      }
    }
  }

  console.log(`\nfase 1 (repontar): ${remaps.length} escritas`);
  console.log(`fase 3 (apagar):   ${removals.length} remoções`);
  if (!apply) {
    console.log("(dry-run) nada foi gravado. Rode de novo com --apply.");
    return;
  }

  const absorbedAll = new Set(mapping.flatMap((m) => m.absorbedIds));
  const VERIFY_PATHS = [
    ...SIMPLE_COLLECTIONS,
    `${base}/tournamentCategoryResults`,
    `${base}/teamRankings`,
  ];

  // ── Fase 1: repontar. Nenhuma remoção acontece aqui. ──────────────────────
  let done = 0;
  while (done < remaps.length) {
    const chunk = remaps.slice(done, done + 400);
    const batch = db.batch();
    for (const write of chunk) batch.set(write.ref, write.data);
    await batch.commit();
    done += chunk.length;
    console.log(`fase 1: ${done}/${remaps.length}`);
  }

  // ── Fase 2: provar que nada mais cita um id absorvido. ────────────────────
  let leftovers = 0;
  for (const path of VERIFY_PATHS) {
    const snap = await db.collection(path).get();
    for (const doc of snap.docs) {
      const text = `${doc.id} ${JSON.stringify(doc.data())}`;
      for (const id of absorbedAll) {
        if (text.includes(id)) {
          console.error(`SOBRA: ${path}/${doc.id} ainda cita ${id}`);
          leftovers += 1;
        }
      }
    }
  }
  if (leftovers > 0) {
    console.error(`\nFALHOU na fase 2: ${leftovers} sobra(s). NADA foi apagado —`);
    console.error("os docs absorvidos continuam vivos e as inscrições seguem íntegras.");
    process.exit(1);
  }
  console.log("fase 2: nenhuma sobra.");

  // ── Fase 3: guarda-costas por inscrição, e só então apagar. ───────────────
  for (const id of absorbedAll) {
    const stillUsed = await db
      .collection(`${base}/inscriptions`)
      .where("teamId", "==", id)
      .get();
    if (!stillUsed.empty) {
      console.error(
        `ABORTADO: ${stillUsed.size} inscrição(ões) ainda apontam para teams/${id}.`,
      );
      console.error("Nada foi apagado. Rode o script de novo.");
      process.exit(1);
    }
  }

  let removed = 0;
  while (removed < removals.length) {
    const chunk = removals.slice(removed, removed + 400);
    const batch = db.batch();
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
    removed += chunk.length;
    console.log(`fase 3: ${removed}/${removals.length}`);
  }

  const file = `merge-pair-teams-${projectId}-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(mapping, null, 2));
  console.log(`de-para salvo em ${file}`);
  console.log("fusão concluída.");
})().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
