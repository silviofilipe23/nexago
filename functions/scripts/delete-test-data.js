/* eslint-disable */
/**
 * Apaga TODOS os dados de teste criados por `seed-test-data.js`, em cascata:
 * ranking → matches → teams → inscriptions → tournaments → public_profiles →
 * Auth → users.
 *
 * "ranking" cobre o que os TRIGGERS criaram a partir do seed e que, por isso,
 * não carrega flag `seedTest*` nenhuma: `athleteRankings`, `teamRankings`,
 * `tournamentCategoryResults`, `athleteRatings`, `ratingEvents`,
 * `leagueAthleteRankings`, `leagueTeamRankings` e as entradas de palpites.
 * Sem esse passo, apagar `users`/`public_profiles`/Auth NÃO tira o atleta de
 * teste das telas de ranking — elas leem `athleteRankings` direto e caem num
 * nome de fallback ("Atleta ab12cd") quando o perfil não existe mais.
 *
 * A ordem NÃO é "filho antes do pai" — é "o índice morre por último". `users`
 * é o documento que guarda os flags (`seedTestAthlete`/`seedTestOrganizer`)
 * usados por `discover()` para reencontrar tudo o resto; enquanto ele existir,
 * um rerun depois de uma interrupção (Ctrl+C, queda de rede) redescobre
 * exatamente o que falta apagar (apagar doc inexistente é no-op). Se `users`
 * saísse antes — ou se `inscriptions` saísse antes de `teams` — um processo
 * morto no meio deixaria órfão que nenhuma execução futura reencontra: ver
 * a Task 6, fix round 1, finding 1 para o raciocínio fronteira a fronteira.
 *
 * Preserva atletas seed que estejam inscritos em torneios reais, preserva
 * organizadores seed que sejam `managerId` de torneio real, e aborta se achar
 * atleta real inscrito num torneio seed.
 *
 * Pré-requisitos:
 *   npm run build                              # lê ../lib/test-data-cleanup
 *   gcloud auth application-default login      # ADC
 *
 * Uso (na pasta functions/):
 *   node scripts/delete-test-data.js --project volley-track-dev-4596c        # DRY-RUN
 *   node scripts/delete-test-data.js --project volley-track-dev-4596c --yes  # apaga
 *
 * `--project` é OBRIGATÓRIO e não tem fallback de env: o alias `default` do
 * .firebaserc aponta para produção, e um fallback silencioso poderia apagar
 * dados reais. Produção é bloqueada de qualquer forma.
 */

const fs = require("fs");
const admin = require("firebase-admin");
const {
  chunkList,
  partitionCleanupTargets,
  partitionOrganizerCleanup,
  partitionRankingDocs,
  partitionRatingEvents,
} = require("../lib/test-data-cleanup");

const PROD_PROJECT_ID = "volley-track-2dd3b";
/** Limite do operador `in` do Firestore. */
const IN_QUERY_LIMIT = 30;
/** Margem sob o teto de 500 operações por batch. */
const BATCH_LIMIT = 450;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function parseArgs() {
  const APPLY = process.argv.includes("--yes");
  const FORCE = process.argv.includes("--force");

  // Sem fallback de env: ver o comentário do topo.
  const projectId = (argValue("--project") || "").trim();
  if (!projectId) {
    console.error("Informe o projeto explicitamente: --project <projectId>.");
    console.error("Este script não lê GCLOUD_PROJECT — o default do .firebaserc é produção.");
    process.exit(1);
  }
  if (projectId === PROD_PROJECT_ID) {
    console.error(`BLOQUEADO: ${projectId} é o projeto de PRODUÇÃO.`);
    console.error("Este script existe para limpar dados de teste; não rode em produção.");
    process.exit(1);
  }

  const credentialsPath = (
    argValue("--credentials") ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    ""
  ).trim();

  if (credentialsPath) {
    if (!fs.existsSync(credentialsPath)) {
      console.error(`Arquivo de credenciais não encontrado: ${credentialsPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
    admin.initializeApp({
      projectId,
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (!admin.apps.length) {
    admin.initializeApp({projectId});
  }

  return {APPLY, FORCE, projectId};
}

function inscriptionsPath(pid) {
  return `artifacts/${pid}/public/data/inscriptions`;
}
function teamsPath(pid) {
  return `artifacts/${pid}/public/data/teams`;
}
function matchesPath(pid) {
  return `artifacts/${pid}/public/data/matches`;
}

function ratingEventsPath(pid) {
  return `artifacts/${pid}/public/data/ratingEvents`;
}

/**
 * Coleções de ranking/rating e como cada doc aponta para o dono.
 *
 * São alimentadas por TRIGGER quando uma partida encerra — nada disso é criado
 * pelo seed, então nada disso carrega flag `seedTest*`. É por isso que precisam
 * de tratamento próprio: sem elas, o atleta de teste continua nas telas de
 * ranking mesmo com `users`, `public_profiles` e Auth já apagados (a tela não
 * esconde a linha sem perfil, ela desenha "Atleta ab12cd").
 *
 * `"@id"` significa que o dono é o próprio id do doc; qualquer outro valor é o
 * nome do campo que guarda o dono. Os nomes espelham os helpers das functions
 * — mudar um lado sem o outro silenciosamente para de limpar:
 * `tournament-ranking.ts:61-71`, `rating-engine.ts:36-42`,
 * `league-ranking.ts:39-45`.
 */
const RANKING_COLLECTIONS = [
  {name: "athleteRankings", athleteKey: "@id"},
  {name: "teamRankings", teamKey: "@id"},
  {name: "tournamentCategoryResults", teamKey: "teamId", tournamentKey: "tournamentId"},
  {name: "athleteRatings", athleteKey: "athleteId"},
  {name: "leagueAthleteRankings", athleteKey: "athleteId"},
  {name: "leagueTeamRankings", teamKey: "teamId"},
];

/**
 * Ids dos docs de uma coleção, sem baixar o conteúdo (`select()` sem campos
 * traz só as referências). É a checagem de "esse dono ainda existe?".
 */
async function collectionIds(db, path) {
  const snap = await db.collection(path).select().get();
  return new Set(snap.docs.map((d) => d.id));
}

/** Docs de `matches` dos torneios seed, respeitando o limite do `in`. */
async function findSeedMatches(db, projectId, tournamentIds) {
  const docs = [];
  for (const part of chunkList(tournamentIds, IN_QUERY_LIMIT)) {
    const snap = await db
      .collection(matchesPath(projectId))
      .where("tournamentId", "in", part)
      .get();
    docs.push(...snap.docs);
  }
  return docs;
}

/**
 * Lê tudo que a decisão de limpeza precisa. As inscrições são lidas por
 * completo (não só as dos torneios seed) porque é a presença de um atleta
 * seed numa inscrição de torneio REAL que o torna impossível de apagar —
 * pelo mesmo motivo, `tournaments` também é lido por completo (não só
 * `seedTestTournament == true`): é preciso o `managerId` dos torneios REAIS
 * para detectar organizador seed contaminando torneio de verdade.
 */
async function discover(db, projectId) {
  const [tournamentsSnap, athletesSnap, organizersSnap, inscriptionsSnap] =
    await Promise.all([
      db.collection("tournaments").get(),
      db.collection("users").where("seedTestAthlete", "==", true).get(),
      db.collection("users").where("seedTestOrganizer", "==", true).get(),
      db.collection(inscriptionsPath(projectId)).get(),
    ]);

  const tournaments = tournamentsSnap.docs.map((d) => ({
    id: d.id,
    managerId: d.data().managerId,
    seedTestTournament: d.data().seedTestTournament === true,
  }));
  const seedTournamentIds = tournaments
    .filter((t) => t.seedTestTournament)
    .map((t) => t.id);
  const seedAthleteUids = athletesSnap.docs.map((d) => d.id);
  const organizerUids = organizersSnap.docs.map((d) => d.id);

  const inscriptions = inscriptionsSnap.docs.map((d) => ({
    id: d.id,
    tournamentId: String(d.data().tournamentId ?? ""),
    teamId: d.data().teamId,
    participantUids: d.data().participantUids,
    player1Id: d.data().player1Id,
  }));

  const plan = partitionCleanupTargets({
    inscriptions,
    seedAthleteUids,
    seedTournamentIds,
    // Ids de TODOS os torneios que existem — é o que separa "inscrição em
    // torneio real" de "inscrição com tournamentId pendurado". A leitura já
    // acontece de qualquer forma para a checagem de organizador.
    existingTournamentIds: tournaments.map((t) => t.id),
  });

  const organizerPlan = partitionOrganizerCleanup({organizerUids, tournaments});

  const matchDocs = seedTournamentIds.length ?
    await findSeedMatches(db, projectId, seedTournamentIds) :
    [];

  const ranking = await discoverRanking(db, projectId, {
    seedTournamentIds,
    teamIds: plan.teamIds,
    deletableAthleteUids: plan.deletableAthleteUids,
  });

  // `organizerUids` não sai daqui: só `partitionOrganizerCleanup` precisa da
  // lista crua, e o que os chamadores consomem é o veredito dela
  // (`deletableOrganizerUids` / `preservedOrganizerUids`).
  return {
    projectId,
    seedTournamentIds,
    matchIds: matchDocs.map((d) => d.id),
    ...plan,
    ...organizerPlan,
    ...ranking,
  };
}

/**
 * Descobre o que sai das coleções de ranking/rating. Roda DEPOIS de
 * `partitionCleanupTargets` porque consome o veredito dele:
 * `deletableAthleteUids` já exclui os atletas seed preservados, então nada
 * daqui alcança quem a limpeza decidiu manter.
 *
 * Lê cada coleção INTEIRA em vez de consultar por dono, porque a decisão tem
 * dois lados e o segundo não é consultável: além do que é seed desta rodada,
 * sai também o que ficou ÓRFÃO (dono já apagado, doc de ranking para trás) —
 * sobra das execuções anteriores a este passo existir. Não há consulta para
 * "dono que não existe": é preciso ver os donos vivos e comparar. A leitura
 * cheia também dispensa índice e é consistente com o resto do script, que já
 * lê `tournaments`, `inscriptions` e `users` por completo.
 */
async function discoverRanking(db, projectId, {
  seedTournamentIds,
  teamIds,
  deletableAthleteUids,
}) {
  const [rankingDocs, ratingEventDocs, liveUserIds, liveTeamIds, predictionEntryPaths] =
    await Promise.all([
      readRankingDocs(db, projectId),
      readRatingEvents(db, projectId),
      collectionIds(db, "users"),
      collectionIds(db, teamsPath(projectId)),
      findPredictionEntryPaths(db, seedTournamentIds),
    ]);

  // Órfão = dono referenciado por algum doc de ranking que não existe mais.
  // Só entram donos efetivamente citados: não há varredura especulativa.
  const orphansOf = (ids, live) => [
    ...new Set(ids.filter((id) => id && !live.has(id))),
  ];
  const orphanAthleteUids = orphansOf(
    rankingDocs.map((d) => d.athleteId), liveUserIds,
  );
  const orphanTeamIds = orphansOf(rankingDocs.map((d) => d.teamId), liveTeamIds);

  const rankingPlan = partitionRankingDocs({
    docs: rankingDocs,
    deletableAthleteUids,
    deletableTeamIds: teamIds,
    seedTournamentIds,
    orphanAthleteUids,
    orphanTeamIds,
  });

  // `ratingEvents` é decidido pelo elenco inteiro do evento, não por dono
  // único: some só quando NINGUÉM ali sobrevive à limpeza — seed apagável ou
  // atleta já inexistente. Os órfãos vêm do próprio ledger, e não de
  // `rankingDocs`: um atleta pode ter evento de rating sem nunca ter pontuado.
  const eventAthleteUids = ratingEventDocs.flatMap((e) =>
    Array.isArray(e.athleteIds) ? e.athleteIds.map(String) : [],
  );
  const ratingEventPlan = partitionRatingEvents({
    events: ratingEventDocs,
    removableAthleteUids: [
      ...deletableAthleteUids,
      ...orphansOf(eventAthleteUids, liveUserIds),
    ],
  });

  return {
    ...rankingPlan,
    ...ratingEventPlan,
    predictionEntryPaths,
    orphanAthleteCount: orphanAthleteUids.length,
  };
}

/**
 * Lê as coleções de ranking/rating e reduz cada doc ao dono, no formato que
 * `partitionRankingDocs` decide.
 *
 * `athleteRatings` entra pelo campo `athleteId`, não pelo id do doc: o id é
 * `{uid}_{sportCode}` e o conjunto de esportes avaliados muda com a config
 * (`RATED_SPORT_CODES`) — depender do id deixaria para trás o rating de
 * qualquer esporte novo.
 */
async function readRankingDocs(db, projectId) {
  const perCollection = await Promise.all(
    RANKING_COLLECTIONS.map(async (col) => {
      const snap = await db
        .collection(`artifacts/${projectId}/public/data/${col.name}`)
        .get();
      return snap.docs.map((doc) => {
        const data = doc.data();
        const owner = (key) => {
          if (!key) return "";
          return key === "@id" ? doc.id : String(data[key] ?? "");
        };
        return {
          path: doc.ref.path,
          athleteId: owner(col.athleteKey),
          teamId: owner(col.teamKey),
          tournamentId: owner(col.tournamentKey),
        };
      });
    }),
  );
  return perCollection.flat();
}

/** Ledger de rating, com o elenco de cada evento. */
async function readRatingEvents(db, projectId) {
  const snap = await db.collection(ratingEventsPath(projectId)).get();
  return snap.docs.map((doc) => ({id: doc.id, athleteIds: doc.data().athleteIds}));
}

/**
 * Entradas do ranking de palpites dos torneios seed
 * (`tournamentPredictions/{tid}/entries/{uid}`).
 *
 * A coleção é top-level indexada pelo torneio, então nada dela sai junto com o
 * `recursiveDelete` de `tournaments/{id}` — sem este passo, o ranking de
 * palpites do torneio seed fica para sempre no projeto.
 *
 * Cobre só os torneios seed: um palpite de atleta seed num torneio REAL não é
 * alcançável sem índice de collection group em `entries`, e a limpeza já não
 * apaga o que não consegue provar que é lixo do seed.
 */
async function findPredictionEntryPaths(db, tournamentIds) {
  const paths = [];
  for (const tid of tournamentIds) {
    const snap = await db.collection(`tournamentPredictions/${tid}/entries`).get();
    for (const doc of snap.docs) paths.push(doc.ref.path);
  }
  return paths;
}

/** Quebra uma lista de caminhos por nome de coleção, para o relatório. */
function countByCollection(paths) {
  const counts = new Map();
  for (const path of paths) {
    // `artifacts/{pid}/public/data/{coleção}/{docId}` — a coleção é o penúltimo
    // segmento, o que também vale para qualquer outro caminho de doc.
    const parts = path.split("/");
    const name = parts[parts.length - 2] ?? path;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

function printReport(d) {
  console.log("\nEncontrado:");
  console.log(`  matches ................. ${d.matchIds.length}`);
  console.log(`  inscriptions ............ ${d.seedInscriptionIds.length}`);
  console.log(`  inscriptions órfãs ...... ${d.orphanSeedInscriptionIds.length}`);
  console.log(`  teams ................... ${d.teamIds.length}`);
  console.log(`  tournaments ............. ${d.seedTournamentIds.length}`);
  console.log(`  atletas seed (apagáveis)  ${d.deletableAthleteUids.length}`);
  console.log(`  organizadores seed (apagáveis) ${d.deletableOrganizerUids.length}`);
  console.log("\nRanking e rating (docs de trigger, sem flag de seed):");
  console.log(`  do seed desta rodada .... ${d.seedRankingPaths.length}`);
  console.log(
    `  órfãos (dono já apagado)  ${d.orphanRankingPaths.length}` +
      ` — ${d.orphanAthleteCount} atleta(s) fantasma`,
  );
  for (const [name, count] of countByCollection(
    [...d.seedRankingPaths, ...d.orphanRankingPaths],
  )) {
    console.log(`      ${name.padEnd(26)} ${count}`);
  }
  console.log(`  ratingEvents ............ ${d.deletableRatingEventIds.length}`);
  console.log(`  palpites (entries) ...... ${d.predictionEntryPaths.length}`);

  if (d.orphanRankingPaths.length) {
    console.log(
      `\nÓRFÃOS: ${d.orphanRankingPaths.length} doc(s) de ranking/rating cujo dono` +
        " (users/{uid} ou",
    );
    console.log(
      "teams/{teamId}) não existe mais — sobra de limpezas anteriores a este passo",
    );
    console.log(
      "existir. São eles que a tela desenha como \"Atleta ab12cd\". Serão apagados.",
    );
  }

  if (d.mixedRatingEventIds.length) {
    console.log(
      `\nratingEvents NÃO TOCADOS: ${d.mixedRatingEventIds.length} evento(s) misturam atleta`,
    );
    console.log(
      "removível (seed ou órfão) com atleta que FICA. Apagar o ledger não desfaz rating",
    );
    console.log(
      "nenhum e faria o replay recalcular o rating de quem ficou — ficam como estão:",
    );
    for (const id of d.mixedRatingEventIds.slice(0, 20)) console.log(`  - ${id}`);
    if (d.mixedRatingEventIds.length > 20) {
      console.log(`  ... e mais ${d.mixedRatingEventIds.length - 20}`);
    }
  }

  if (d.orphanSeedInscriptionIds.length) {
    console.log(
      `\nÓRFÃS: ${d.orphanSeedInscriptionIds.length} inscrição(ões) apontam para um torneio que`,
    );
    console.log("não existe mais e só têm atletas seed — serão apagadas:");
    for (const id of d.orphanSeedInscriptionIds.slice(0, 20)) console.log(`  - ${id}`);
    if (d.orphanSeedInscriptionIds.length > 20) {
      console.log(`  ... e mais ${d.orphanSeedInscriptionIds.length - 20}`);
    }
  }

  if (d.orphanUnknownInscriptionIds.length) {
    console.log(
      `\nÓRFÃS NÃO TOCADAS: ${d.orphanUnknownInscriptionIds.length} inscrição(ões) apontam para um`,
    );
    console.log(
      "torneio inexistente mas envolvem alguém que não é atleta seed (ou não têm",
    );
    console.log("participante). Ficam como estão — revise à mão:");
    for (const id of d.orphanUnknownInscriptionIds.slice(0, 20)) console.log(`  - ${id}`);
    if (d.orphanUnknownInscriptionIds.length > 20) {
      console.log(`  ... e mais ${d.orphanUnknownInscriptionIds.length - 20}`);
    }
  }

  if (d.preservedAthleteUids.length) {
    console.log(
      `\nPRESERVADOS: ${d.preservedAthleteUids.length} atleta(s) seed estão inscritos em`,
    );
    console.log("torneios REAIS. Doc, espelho e conta Auth serão mantidos:");
    for (const uid of d.preservedAthleteUids.slice(0, 20)) console.log(`  - ${uid}`);
    if (d.preservedAthleteUids.length > 20) {
      console.log(`  ... e mais ${d.preservedAthleteUids.length - 20}`);
    }
  }

  if (d.preservedOrganizerUids.length) {
    console.log(
      `\nPRESERVADOS: ${d.preservedOrganizerUids.length} organizador(es) seed são managerId de`,
    );
    console.log("torneio(s) REAL(is). Doc, espelho e conta Auth serão mantidos:");
    for (const uid of d.preservedOrganizerUids) console.log(`  - ${uid}`);
  }

  if (d.realAthleteUids.length) {
    console.log(
      `\nATENÇÃO: ${d.realAthleteUids.length} atleta(s) REAIS estão inscritos no torneio seed:`,
    );
    for (const uid of d.realAthleteUids.slice(0, 20)) console.log(`  - ${uid}`);
    if (d.realAthleteUids.length > 20) {
      console.log(`  ... e mais ${d.realAthleteUids.length - 20}`);
    }
  }
}

/**
 * `orphanUnknownInscriptionIds` e `mixedRatingEventIds` de propósito NÃO
 * entram aqui: esses docs são reportados, nunca apagados — contá-los faria o
 * script prometer trabalho e depois não apagar nada.
 */
function nothingToDo(d) {
  return (
    d.matchIds.length === 0 &&
    d.seedInscriptionIds.length === 0 &&
    d.orphanSeedInscriptionIds.length === 0 &&
    d.teamIds.length === 0 &&
    d.seedTournamentIds.length === 0 &&
    d.deletableAthleteUids.length === 0 &&
    d.deletableOrganizerUids.length === 0 &&
    // Ranking e rating sobrevivem a tudo o resto: num projeto sem seed nenhum
    // ainda pode haver órfão de execução antiga para apagar, e nesse caso o
    // script TEM trabalho a fazer mesmo com todas as contagens acima zeradas.
    d.seedRankingPaths.length === 0 &&
    d.orphanRankingPaths.length === 0 &&
    d.deletableRatingEventIds.length === 0 &&
    d.predictionEntryPaths.length === 0
  );
}

/** Apaga refs em lotes, respeitando o teto de operações por batch. */
async function deleteRefs(db, refs) {
  for (const part of chunkList(refs, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const ref of part) batch.delete(ref);
    await batch.commit();
  }
  return refs.length;
}

/**
 * Apaga docs com `recursiveDelete`, que também remove as subcoleções. Um
 * `batch.delete` do doc-pai deixaria essas subcoleções órfãs e invisíveis:
 * sem pai, elas não aparecem em nenhuma listagem e nenhuma execução futura
 * as reencontra.
 *
 * Vale para os dois donos de subcoleção desta limpeza:
 *   - `users/{uid}`: `notifications`, `tokens`, `favorites` — mesmo motivo
 *     pelo qual `deleteOwnAccount` usa recursiveDelete
 *     (`functions/src/account-deletion.ts:23`).
 *   - `tournaments/{id}`: `staff` (`tournament-acl.ts:30`,
 *     `tournament-staff-sync.ts:160`) e `categoryCommunications`
 *     (`organizer-category-ops.ts:668`). Adicionar mesário e disparar
 *     comunicação de categoria são exatamente os fluxos que este seed existe
 *     para exercitar, então é esperado que essas subcoleções existam na hora
 *     de limpar. Há um trigger (`onTournamentDeletedCleanupStaff`) que limpa
 *     `staff`, mas só se estiver deployado naquele projeto — e nada limpa
 *     `categoryCommunications`. Mesmo raciocínio de `deletePublicProfiles`:
 *     a limpeza não pode depender do estado de deploy.
 */
async function deleteDocsRecursively(db, refs, label, log) {
  let done = 0;
  for (const ref of refs) {
    await db.recursiveDelete(ref);
    done += 1;
    if (done % 50 === 0) log(`  ... ${done}/${refs.length} ${label}`);
  }
  return done;
}

/**
 * Varre o espelho público explicitamente. O trigger
 * `onUserWrittenSyncPublicProfile` já apaga `public_profiles/{uid}` quando
 * `users/{uid}` some, mas só se estiver deployado naquele projeto — e o
 * script não tem como verificar isso. A varredura é barata e torna a
 * limpeza independente do estado de deploy.
 */
async function deletePublicProfiles(db, uids) {
  const refs = uids.map((uid) => db.doc(`public_profiles/${uid}`));
  return deleteRefs(db, refs);
}

async function deleteAuthAccounts(auth, uids, log) {
  let deleted = 0;
  let failed = 0;
  for (const part of chunkList(uids, 1000)) {
    const res = await auth.deleteUsers(part);
    deleted += res.successCount;
    failed += res.failureCount;
    for (const err of res.errors) {
      log(`  Falha Auth: ${part[err.index]} — ${err.error.message}`);
    }
  }
  return {deleted, failed};
}

/**
 * Primeiro passo da cascata: ranking, rating e palpites.
 *
 * Vem ANTES de tudo porque é o passo cuja descoberta depende de mais fontes ao
 * mesmo tempo — `seedTournamentIds` (morre com `tournaments`), `teamIds`
 * (vem das inscrições, morre com `inscriptions`) e os uids (morrem com
 * `users`). Rodando primeiro, todas as três ainda estão de pé; rodando depois
 * de `inscriptions`, por exemplo, um processo morto no meio deixaria
 * `teamRankings` órfão que nenhum rerun reencontra.
 *
 * Nenhuma dessas coleções tem subcoleção (`entries` de palpites é a subcoleção,
 * e é ela que estamos apagando), então `batch.delete` basta — não há o risco de
 * subcoleção órfã que obriga `tournaments`/`users` a usarem `recursiveDelete`.
 */
async function deleteRankingArtifacts(db, d, log) {
  const paths = [
    ...d.seedRankingPaths,
    ...d.orphanRankingPaths,
    ...d.deletableRatingEventIds.map(
      (id) => `${ratingEventsPath(d.projectId)}/${id}`,
    ),
    ...d.predictionEntryPaths,
  ];

  const total = await deleteRefs(db, paths.map((path) => db.doc(path)));
  log(
    `\nranking/rating/palpites: ${total} docs apagados` +
      ` (${d.orphanRankingPaths.length} órfãos de execuções antigas)`,
  );
}

/**
 * Cascata: o índice (`users`) morre por último.
 *
 * `discover()` reencontra tudo a partir dos flags em `users/{uid}`
 * (`seedTestAthlete`/`seedTestOrganizer`) e do `tournamentId` em cada
 * `matches`/inscription. Enquanto `users` existir, um rerun depois de uma
 * interrupção redescobre exatamente o que falta (apagar doc inexistente é
 * no-op). Por isso a ordem é ranking → matches → teams → inscriptions →
 * tournaments → public_profiles → Auth → users — e não "filho antes do pai"
 * ingênuo, que apagaria `users` (o índice) antes de `public_profiles`/Auth, ou
 * `inscriptions` (de onde `teamIds` é lido) antes de `teams`.
 *
 * Cada fronteira é recuperável — se o processo morrer logo depois de um
 * passo, o rerun ainda descobre o resto:
 *   - depois de ranking: nada foi tirado das fontes de descoberta
 *     (tournaments/inscriptions/users seguem intactos) — o rerun redescobre
 *     tudo igual e reapaga por cima (no-op para o que já sumiu).
 *   - depois de matches: teams/inscriptions/tournaments/users continuam
 *     achável por seedTournamentIds/flags: nada mudou na descoberta.
 *   - depois de teams: os teams já apagados não existem mais para
 *     `deleteRefs` reencontrar, mas `seedInscriptionIds` ainda vêm das
 *     inscriptions, que ainda existem — nenhum team novo pode aparecer.
 *   - depois de inscriptions: `seedTournamentIds` continua vindo do doc do
 *     torneio (ainda vivo) — nada ficou órfão e sem dono.
 *   - depois de tournaments: `users` (o índice) ainda existe com os flags
 *     seed intactos — um rerun reencontra os mesmos uids exatamente iguais.
 *   - depois de public_profiles: `users` ainda existe → rerun reencontra os
 *     uids e tenta apagar Auth/public_profiles de novo (no-op pro que já
 *     sumiu).
 *   - depois de Auth: idem — `users` ainda existe, rerun tenta apagar Auth
 *     de novo (no-op, já não existe) e finalmente apaga `users`.
 *   - depois de users: não sobra nada para descobrir — a limpeza terminou.
 *
 * As inscrições órfãs (`tournamentId` apontando para torneio inexistente) são
 * apagadas no mesmo passo das inscrições seed e não mudam nada disso: elas são
 * descobertas varrendo a própria coleção de inscrições e classificadas pelos
 * flags em `users` — o índice que morre por último —, então o rerun continua
 * reencontrando as que sobraram.
 */
async function applyCleanup(db, auth, d) {
  const log = console.log;

  await deleteRankingArtifacts(db, d, log);

  const matchRefs = d.matchIds.map((id) => db.doc(`${matchesPath(d.projectId)}/${id}`));
  log(`\nmatches: ${await deleteRefs(db, matchRefs)} apagados`);

  const teamRefs = d.teamIds.map((id) => db.doc(`${teamsPath(d.projectId)}/${id}`));
  log(`teams: ${await deleteRefs(db, teamRefs)} apagadas`);

  const inscriptionRefs = [
    ...d.seedInscriptionIds,
    ...d.orphanSeedInscriptionIds,
  ].map((id) => db.doc(`${inscriptionsPath(d.projectId)}/${id}`));
  log(`inscriptions: ${await deleteRefs(db, inscriptionRefs)} apagadas`);

  const tournamentRefs = d.seedTournamentIds.map((id) => db.doc(`tournaments/${id}`));
  log(
    `tournaments: ${await deleteDocsRecursively(db, tournamentRefs, "torneios", log)} apagados (recursivo)`,
  );

  const userUids = [...d.deletableAthleteUids, ...d.deletableOrganizerUids];

  log(`public_profiles: ${await deletePublicProfiles(db, userUids)} apagados`);

  const {deleted, failed} = await deleteAuthAccounts(auth, userUids, log);
  log(`Auth: ${deleted} contas removidas, ${failed} falha(s).`);

  const userRefs = userUids.map((uid) => db.doc(`users/${uid}`));
  log(`users: apagando ${userUids.length} (recursivo)...`);
  log(`users: ${await deleteDocsRecursively(db, userRefs, "usuários", log)} apagados`);

  if (d.preservedAthleteUids.length) {
    log(`\nPreservados — atletas (inscritos em torneio real): ${d.preservedAthleteUids.length}`);
    for (const uid of d.preservedAthleteUids) log(`  - ${uid}`);
  }
  if (d.preservedOrganizerUids.length) {
    log(
      `\nPreservados — organizadores (managerId de torneio real): ${d.preservedOrganizerUids.length}`,
    );
    for (const uid of d.preservedOrganizerUids) log(`  - ${uid}`);
  }

  return {authFailed: failed};
}

async function run() {
  const {APPLY, FORCE, projectId} = parseArgs();
  const db = admin.firestore();

  console.log(`Projeto: ${projectId}`);
  console.log(`Modo: ${APPLY ? "APLICAR (--yes)" : "DRY-RUN"}`);

  const discovery = await discover(db, projectId);
  printReport(discovery);

  if (nothingToDo(discovery)) {
    console.log("\nNada a apagar.");
    return;
  }

  if (discovery.realAthleteUids.length && !FORCE) {
    console.error(
      "\nABORTADO: há atleta real inscrito no torneio seed (lista acima).",
    );
    console.error(
      "Apagar o torneio destruiria a inscrição dele. Rode com --force para prosseguir:",
    );
    console.error(
      "o torneio e as inscrições saem (inclusive a dele), mas o perfil e a conta dele ficam.",
    );
    process.exit(1);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: nada foi apagado. Rode com --yes para remover.");
    return;
  }

  const {authFailed} = await applyCleanup(db, admin.auth(), discovery);
  if (authFailed > 0) {
    console.error(
      `\nLimpeza concluída COM FALHAS: ${authFailed} conta(s) Auth não foram removidas.`,
    );
    console.error("Firestore foi limpo, mas reveja o Auth do projeto manualmente (log acima).");
    // `process.exitCode` (e não `process.exit` aqui) porque ainda falta o
    // `console.error` acima rodar e o `run()` tem outros retornos que devem
    // continuar saindo com 0; quem decide o código final é o `.then()` logo
    // abaixo, lendo este valor.
    process.exitCode = 1;
  } else {
    console.log("\nLimpeza concluída.");
  }
}

run()
  // Não usar `process.exit(0)` fixo aqui: isso sobrescreveria qualquer
  // `process.exitCode` setado dentro de `run()` (ex.: falha parcial de Auth
  // na finding 2) e o processo sempre sairia 0, escondendo o problema de
  // quem só confere `$?`.
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("Falha na limpeza:", err);
    process.exit(1);
  });
