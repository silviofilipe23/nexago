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
 * O inventário abaixo veio de varredura real do dev, revisada numa 2ª rodada
 * depois de auditar `functions/src` inteiro atrás de todo campo que guarda um
 * teamId — foi assim que `leagueTeamRankings` e `tournamentPredictions/*\/entries`
 * entraram. `matches/{id}/pointEvents` (usa `side: "A"/"B"`) e
 * `matches/{id}/auditLog` (usa `byUid`) NÃO guardam teamId e por isso não são
 * tocados.
 *
 * SEGURANÇA CONTRA ESCRITA CONCORRENTE: o banco é um banco AO VIVO — atletas e
 * o servidor continuam escrevendo enquanto este script roda. Toda escrita da
 * fase 1 usa `update(ref, data, {lastUpdateTime})` (nunca `set` cego): se o
 * doc mudou entre a leitura e o commit, o batch INTEIRO falha em vez de
 * sobrescrever silenciosamente — e `update` nunca ressuscita um doc apagado
 * nesse meio-tempo (falha com NOT_FOUND, que é o sinal certo). Quando o alvo é
 * um doc NOVO (recriação sob outro id, ex. `tournamentCategoryResults`),
 * usa-se `create`, que falha se algo já existir ali — de novo, falha alto em
 * vez de corromper. Toda remoção carrega o mesmo `lastUpdateTime` do doc lido.
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

/** Enfileira uma remoção com o `lastUpdateTime` do doc lido (protege contra apagar por cima de escrita concorrente). */
function queueRemoval(removals, ref, updateTime) {
  removals.push(updateTime ? {ref, updateTime} : {ref});
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
  // `entries` é subcoleção (`tournamentPredictions/{tid}/entries/{uid}`) — só
  // dá pra varrer com collectionGroup (é a ÚNICA coleção chamada "entries" no
  // projeto, conferido em functions/src). `picks` guarda teamId como VALOR de
  // mapa (`{[matchId]: predictedWinnerTeamId}`) e `championPick` como string
  // solta; o remap genérico abaixo já cobre os dois. O id do doc é o uid do
  // palpiteiro, não um teamId, então — ao contrário de
  // tournamentCategoryResults/leagueTeamRankings — não precisa recriar sob
  // outro id, só editar o campo no lugar.
  loaded.set("tournamentPredictions/*/entries", await db.collectionGroup("entries").get());
  const resultsSnap = await db.collection(`${base}/tournamentCategoryResults`).get();
  const rankingsSnap = await db.collection(`${base}/teamRankings`).get();
  // `teamId` mora no corpo do doc (`leagueTeamRankings/{leagueId}_{categoryId}_{teamId}`),
  // igual a tournamentCategoryResults — precisa recriar sob outro id, não só
  // editar o campo. Pode vir vazia num projeto sem ligas; `.get()` numa
  // coleção vazia/ausente não erra.
  const leagueRankingsSnap = await db.collection(`${base}/leagueTeamRankings`).get();

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
  for (const doc of leagueRankingsSnap.docs) {
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

    // Ranking do sobrevivente e dos absorvidos — calculado ANTES de enfileirar
    // qualquer coisa, porque a checagem de `scaleVersion` abaixo pode pular o
    // GRUPO INTEIRO, não só a fusão do ranking: se só pulássemos a fusão do
    // ranking e seguíssemos fundindo o time, o `teamRankings` do absorvido
    // ficaria órfão quando `teams/{absorvido}` fosse apagado na fase 3 — o
    // mesmo tipo de buraco que este script existe para fechar.
    const survivorRankDoc = rankingsSnap.docs.find((d) => d.id === plan.survivorId) ?? null;
    const absorbedRankDocs = plan.absorbedIds
      .map((id) => rankingsSnap.docs.find((d) => d.id === id))
      .filter(Boolean);
    const scaleVersions = new Set(
      [survivorRankDoc, ...absorbedRankDocs]
        .filter(Boolean)
        .map((d) => d.data().scaleVersion)
        .filter((v) => v != null),
    );
    if (scaleVersions.size > 1) {
      console.error(
        `PULADO ${pairKey}: scaleVersion divergente em teamRankings (${[...scaleVersions].join(", ")}) — somar pontos de escalas diferentes corromperia o ranking. Requer reconciliação manual.`,
      );
      continue;
    }

    mapping.push({pairKey, survivorId: plan.survivorId, absorbedIds: plan.absorbedIds});
    console.log(`${pairKey}: ${plan.absorbedIds.join(", ")} -> ${plan.survivorId}`);

    for (const absorbedId of plan.absorbedIds) {
      for (const [, snap] of loaded) {
        for (const doc of snap.docs) {
          const next = remap(doc.data(), absorbedId, plan.survivorId);
          if (next) remaps.push({ref: doc.ref, data: next, op: "update", updateTime: doc.updateTime});
        }
      }

      for (const doc of resultsSnap.docs) {
        const data = doc.data();
        if (String(data.teamId ?? "").trim() !== absorbedId) continue;
        const tournamentId = String(data.tournamentId ?? "").trim();
        const categoryId = String(data.categoryId ?? "").trim();
        // Doc legado sem um dos dois ids produziria `undefined_undefined_<id>`
        // — um resultado de pódio perdido num id de garbage. Preserva o doc
        // original (não move, não apaga) e loga alto pra alguém investigar.
        if (!tournamentId || !categoryId) {
          console.error(
            `PULADO tournamentCategoryResults/${doc.id}: tournamentId/categoryId ausente — doc original preservado, não apagado.`,
          );
          continue;
        }
        const newId = `${tournamentId}_${categoryId}_${plan.survivorId}`;
        // Se já existe um doc do PRÓPRIO sobrevivente nesse torneio+categoria
        // (convivência que escapou do `planGroupMerge`, ou dado legado), usa
        // `update` com o `lastUpdateTime` dele — se mudou desde a leitura, o
        // batch falha alto em vez de sobrescrever o resultado do sobrevivente
        // com o do absorvido. Se não existe, `create` (e falha alto se algo
        // aparecer ali entre a leitura e o commit).
        const existingAtNewId = resultsSnap.docs.find((d) => d.id === newId);
        remaps.push({
          ref: db.doc(`${base}/tournamentCategoryResults/${newId}`),
          data: {...data, teamId: plan.survivorId},
          op: existingAtNewId ? "update" : "create",
          updateTime: existingAtNewId ? existingAtNewId.updateTime : undefined,
        });
        queueRemoval(removals, doc.ref, doc.updateTime);
      }

      // `leagueTeamRankings/{leagueId}_{categoryId}_{teamId}` — mesmo desenho
      // de tournamentCategoryResults: teamId mora no ID, então repontar o
      // campo no lugar deixaria o doc órfão sob o id antigo (a próxima
      // premiação do sobrevivente escreveria em OUTRO doc, sob o id novo, e a
      // história de liga continuaria partida em dois — o bug que este script
      // existe para fechar).
      for (const doc of leagueRankingsSnap.docs) {
        const data = doc.data();
        if (String(data.teamId ?? "").trim() !== absorbedId) continue;
        const leagueId = String(data.leagueId ?? "").trim();
        const categoryId = String(data.categoryId ?? "").trim();
        if (!leagueId || !categoryId) {
          console.error(
            `PULADO leagueTeamRankings/${doc.id}: leagueId/categoryId ausente — doc original preservado, não apagado.`,
          );
          continue;
        }
        const newId = `${leagueId}_${categoryId}_${plan.survivorId}`;
        // Ao contrário de tournamentCategoryResults, aqui NÃO fundimos por
        // cima: se o sobrevivente já tem linha própria nessa liga+categoria,
        // somar `stageResults` exigiria lógica de negócio que não existe nem
        // é testada em lugar nenhum — arriscar isso numa fusão irreversível é
        // pior que deixar os dois docs vivos (órfão, mas visível) até alguém
        // reconciliar à mão.
        const collision = leagueRankingsSnap.docs.find((d) => d.id === newId);
        if (collision) {
          console.error(
            `ATENÇÃO leagueTeamRankings/${doc.id}: sobrevivente já tem linha própria em .../${newId} — fusão de ranking de liga não implementada aqui, docs preservados. Requer reconciliação manual.`,
          );
          continue;
        }
        remaps.push({
          ref: db.doc(`${base}/leagueTeamRankings/${newId}`),
          data: {...data, teamId: plan.survivorId},
          op: "create",
        });
        queueRemoval(removals, doc.ref, doc.updateTime);
      }

      queueRemoval(
        removals,
        db.doc(`${base}/teams/${absorbedId}`),
        teamsSnap.docs.find((d) => d.id === absorbedId)?.updateTime,
      );
    }

    if (survivorRankDoc || absorbedRankDocs.length > 0) {
      const survivorRanking = survivorRankDoc?.data() ?? null;
      const absorbedRankings = absorbedRankDocs.map((d) => d.data());
      const merged = mergeTeamRankingDocs(survivorRanking, absorbedRankings);
      // `scaleVersion` ausente no doc fundido faria o próximo award do
      // servidor tratar o merge inteiro como "pré-escala" e multiplicar todo
      // `results[].points` por 10 (`tournament-ranking.ts`, upsertGlobalRankingDoc).
      // Os dois lados já foram checados acima e concordam (ou um dos dois não
      // tem o campo) — não há mistura de escalas aqui.
      const scaleVersion =
        survivorRanking?.scaleVersion ?? absorbedRankings.find((d) => d.scaleVersion != null)?.scaleVersion;
      remaps.push({
        ref: db.doc(`${base}/teamRankings/${plan.survivorId}`),
        data: {
          ...(survivorRanking || {}),
          teamId: plan.survivorId,
          ...merged,
          ...(scaleVersion != null ? {scaleVersion} : {}),
          lastUpdated: admin.firestore.Timestamp.now(),
        },
        op: survivorRankDoc ? "update" : "create",
        updateTime: survivorRankDoc?.updateTime,
      });
      for (const doc of absorbedRankDocs) {
        queueRemoval(removals, doc.ref, doc.updateTime);
      }
    }
  }

  console.log(`\nfase 1 (repontar): ${remaps.length} escritas`);
  console.log(`fase 3 (apagar):   ${removals.length} remoções`);
  if (!apply) {
    console.log("(dry-run) nada foi gravado. Rode de novo com --apply.");
    return;
  }

  // Grava o de-para ANTES de qualquer escrita no Firestore: numa migração
  // irreversível, o mapeamento é o único registro durável da intenção. Se a
  // fase 1 cometer alguns batches e então estourar, o arquivo já existe em
  // disco — sem isso, essa falha deixaria o banco parcialmente mutado sem
  // NENHUM rastro do que era pra ter acontecido.
  const file = `merge-pair-teams-${projectId}-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(mapping, null, 2));
  console.log(`de-para salvo em ${file} (antes de qualquer escrita no Firestore).`);

  const absorbedAll = new Set(mapping.flatMap((m) => m.absorbedIds));
  const removalPaths = new Set(removals.map((r) => r.ref.path));
  // Lista independente de tudo que pode citar um teamId — mantida à MÃO, sem
  // derivar de SIMPLE_COLLECTIONS por spread: se a fase de escrita ganhar uma
  // coleção nova e alguém esquecer de repetir a mudança aqui, as duas listas
  // divergem de um jeito visível em code review, em vez de a verificação
  // herdar automaticamente (e silenciosamente) a mesma cegueira da escrita.
  // `leagueTeamRankings` e `tournamentPredictions/*/entries` entraram aqui no
  // MESMO round em que entraram no inventário de escrita, depois de auditar
  // `functions/src` atrás de todo campo que guarda um teamId — não porque a
  // lista de escrita "vazou" pra cá.
  // Cada item é só o getter — o `doc.ref.path` de cada resultado já identifica
  // a coleção (e, pra `entries`, o torneio+usuário exatos), então não precisa
  // de um rótulo redundante aqui.
  const VERIFY_COLLECTIONS = [
    () => db.collection(`${base}/matches`).get(),
    () => db.collection(`${base}/inscriptions`).get(),
    () => db.collection(`${base}/drawSessions`).get(),
    () => db.collection("tournaments").get(),
    () => db.collection("tournamentRegistrationInvites").get(),
    () => db.collection("tournamentRegistrationCancellations").get(),
    () => db.collection(`${base}/tournamentCategoryResults`).get(),
    () => db.collection(`${base}/teamRankings`).get(),
    () => db.collection(`${base}/leagueTeamRankings`).get(),
    () => db.collectionGroup("entries").get(),
  ];

  // ── Fase 1: repontar. Nenhuma remoção acontece aqui. ──────────────────────
  let done = 0;
  while (done < remaps.length) {
    const chunk = remaps.slice(done, done + 400);
    const batch = db.batch();
    for (const write of chunk) {
      if (write.op === "create") {
        batch.create(write.ref, write.data);
      } else {
        batch.update(write.ref, write.data, {lastUpdateTime: write.updateTime});
      }
    }
    await batch.commit();
    done += chunk.length;
    console.log(`fase 1: ${done}/${remaps.length}`);
  }

  // ── Fase 2: provar que nada mais cita um id absorvido. ────────────────────
  // Pula docs já enfileirados para a fase 3: esses TÊM que citar o id
  // absorvido até serem apagados — não são sobra, são o próprio motivo de
  // existir da fase 3. Sem esse filtro, `teamRankings/{absorvido}` e
  // `tournamentCategoryResults/{...}_{absorvido}` sempre apareceriam como
  // sobra (o novo doc nasce na fase 1, o antigo só morre na fase 3), e a fase
  // 2 falharia 100% das vezes — depois que a fase 1 já tinha comitado.
  let leftovers = 0;
  for (const get of VERIFY_COLLECTIONS) {
    const snap = await get();
    for (const doc of snap.docs) {
      if (removalPaths.has(doc.ref.path)) continue;
      const text = `${doc.id} ${JSON.stringify(doc.data())}`;
      for (const id of absorbedAll) {
        if (text.includes(id)) {
          console.error(`SOBRA: ${doc.ref.path} ainda cita ${id}`);
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
    for (const write of chunk) {
      if (write.updateTime) {
        batch.delete(write.ref, {lastUpdateTime: write.updateTime});
      } else {
        batch.delete(write.ref);
      }
    }
    await batch.commit();
    removed += chunk.length;
    console.log(`fase 3: ${removed}/${removals.length}`);
  }

  console.log("fusão concluída.");
})().catch((e) => {
  console.error("ERRO:", e.message);
  console.error(
    "Nada é assumido como completo: escritas já comitadas ficam de pé (são idempotentes,",
  );
  console.error(
    "rodar de novo retoma daí); um `lastUpdateTime` desatualizado aborta o batch INTEIRO",
  );
  console.error("sem gravar nada dele. Rode o script de novo.");
  process.exit(1);
});
