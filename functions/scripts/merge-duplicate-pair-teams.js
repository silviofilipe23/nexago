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
 * INVENTÁRIO DE ESCRITA: curado à mão, auditando `functions/src` (server) E
 * `firestore.rules` + o app Flutter (cliente — é assim que achamos
 * `users/{uid}/followingTeams/{teamId}`, que só o CLIENTE escreve).
 * `matches/{id}/pointEvents` (usa `side: "A"/"B"`) e `matches/{id}/auditLog`
 * (usa `byUid`) NÃO guardam teamId e por isso não são tocados.
 *
 * `drawSessions` é EXCLUÍDA de propósito (ver `PRESERVED_COLLECTIONS` mais
 * abaixo) — `reveals[].teamId` mora dentro de uma cadeia de hash à prova de
 * adulteração; nem remapear nem recalcular é seguro ali.
 *
 * `entries` de palpite e `ratingEvents` ficam de FORA da contagem de
 * referências que decide o sobrevivente (mas continuam no remap) — ver o
 * comentário perto de `refCountByTeamId`.
 *
 * VERIFICAÇÃO (fase 2 e a checagem de cobertura do dry-run): NÃO usa a mesma
 * lista da escrita. Usa DESCOBERTA (`db.listCollections()` + subcoleções do
 * doc `${base}` + os nomes de subcoleção aninhada já conhecidos via
 * `collectionGroup`) — varre o que EXISTE de verdade no banco, não o que
 * alguém lembrou de escrever. Uma lista à mão só poderia discordar de si
 * mesma; descoberta pode discordar da escrita de verdade.
 *
 * SEGURANÇA CONTRA ESCRITA CONCORRENTE: o banco é um banco AO VIVO — atletas e
 * o servidor continuam escrevendo enquanto este script roda. Toda escrita da
 * fase 1 usa `update(ref, data, {lastUpdateTime})` (nunca `set` cego): se o
 * doc mudou entre a leitura e o commit, o batch INTEIRO falha em vez de
 * sobrescrever silenciosamente — e `update` nunca ressuscita um doc apagado
 * nesse meio-tempo (falha com FAILED_PRECONDITION, já que SEMPRE passamos
 * `lastUpdateTime` — não existe update "nu" aqui). Quando o alvo é um doc
 * NOVO (recriação sob outro id, ex. `tournamentCategoryResults`), usa-se
 * `create`, que falha se algo já existir ali. Toda remoção carrega o mesmo
 * `lastUpdateTime` do doc lido.
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

const trim = (v) => String(v ?? "").trim();

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

/**
 * Enfileira/mescla um remap num Map por `ref.path`, em vez de um array. Se o
 * MESMO doc já tinha uma escrita enfileirada por um absorvido anterior do
 * grupo, aplica o remap desta vez EM CIMA do dado já acumulado, não em cima
 * do snapshot original — senão um doc citando dois ids absorvidos do mesmo
 * grupo geraria duas entradas pro MESMO ref, cada uma com só um id trocado, e
 * a fase 2 pegaria a sobra depois que a fase 1 já tivesse comitado.
 */
function queueGenericRemap(remapsByPath, doc, from, to) {
  const key = doc.ref.path;
  const current = remapsByPath.has(key) ? remapsByPath.get(key).data : doc.data();
  const next = remap(current, from, to);
  if (next) {
    remapsByPath.set(key, {ref: doc.ref, data: next, op: "update", updateTime: doc.updateTime});
  }
}

/** Enfileira uma remoção com o `lastUpdateTime` do doc lido (protege contra apagar por cima de escrita concorrente). */
function queueRemoval(removals, ref, updateTime) {
  removals.push(updateTime ? {ref, updateTime} : {ref});
}

/** Bloqueia o GRUPO INTEIRO (não só um doc) se faltar campo obrigatório pra montar o id novo de recriação. */
function preflightMissingFields({label, snap, absorbedIds, requiredFields}) {
  for (const absorbedId of absorbedIds) {
    for (const doc of snap.docs) {
      const data = doc.data();
      if (trim(data.teamId) !== absorbedId) continue;
      const missing = requiredFields.filter((f) => !trim(data[f]));
      if (missing.length > 0) return `${label}/${doc.id}: ${missing.join("/")} ausente`;
    }
  }
  return null;
}

/**
 * Igualdade profunda que entende `Timestamp` do Firestore (via `.isEqual`,
 * já que dois Timestamps com o MESMO instante não são `===` nem batem por
 * `JSON.stringify` de forma confiável) — usada só pra separar "já resolvido"
 * de "colisão genuína" em `leagueTeamRankings` (ver mais abaixo).
 */
function deepEqualFirestoreValue(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a.isEqual === "function" && typeof b?.toDate === "function") {
    return a.isEqual(b);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqualFirestoreValue(item, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(
      (k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqualFirestoreValue(a[k], b[k]),
    );
  }
  return false;
}

/**
 * Bloqueia o GRUPO INTEIRO se `leagueTeamRankings` tiver uma colisão GENUÍNA
 * no id novo — distinta de uma reconvergência idempotente. As duas situações
 * produzem um doc já existente em `{leagueId}_{categoryId}_{survivorId}`,
 * mas divergem no CONTEÚDO, não só no `teamId`:
 *  - JÁ RESOLVIDO: o doc ali é EXATAMENTE `{...dadoDoAbsorvido, teamId:
 *    sobrevivente}` — a própria escrita de uma corrida anterior desta
 *    migração que morreu antes da fase 3 apagar o absorvido. Deep-equal
 *    bate; não bloqueia (o enfileiramento mais abaixo trata como resolvido).
 *  - COLISÃO GENUÍNA: o sobrevivente já tinha linha PRÓPRIA ali antes de
 *    qualquer fusão — `stageResults` (e os agregados derivados) são dele
 *    mesmo, não uma cópia do absorvido. Deep-equal não bate; bloqueia o
 *    grupo inteiro, porque não existe lógica de fusão de `stageResults` em
 *    lugar nenhum e apagar o absorvido aqui perderia os pontos de liga dele
 *    em silêncio.
 */
function preflightLeagueCollision({snap, survivorId, absorbedIds}) {
  for (const absorbedId of absorbedIds) {
    for (const doc of snap.docs) {
      const data = doc.data();
      if (trim(data.teamId) !== absorbedId) continue;
      const leagueId = trim(data.leagueId);
      const categoryId = trim(data.categoryId);
      if (!leagueId || !categoryId) continue; // pego por preflightMissingFields
      const newId = `${leagueId}_${categoryId}_${survivorId}`;
      const existing = snap.docs.find((d) => d.id === newId);
      if (!existing) continue;
      const wouldWrite = {...data, teamId: survivorId};
      if (!deepEqualFirestoreValue(existing.data(), wouldWrite)) {
        return `leagueTeamRankings: .../${newId} (liga ${leagueId}, categoria ${categoryId}) já tem uma linha DIFERENTE do que a fusão escreveria — parece colisão genuína (o sobrevivente tem stageResults próprio ali), não idempotência de uma corrida anterior`;
      }
    }
  }
  return null;
}

// Chave estável do `loaded` pra `ratingEvents` — usada tanto pra carregar
// quanto pra EXCLUIR da contagem de referências (ver `refCountByTeamId`
// abaixo).
const RATING_EVENTS_KEY = `${base}/ratingEvents`;

const SIMPLE_COLLECTIONS = [
  `${base}/matches`,
  `${base}/inscriptions`,
  "tournaments",
  "tournamentRegistrationInvites",
  "tournamentRegistrationCancellations",
  // Achado pela PRÓPRIA checagem de cobertura desta rodada (não por auditoria
  // manual): `ratingEvents/{sportCode}_{matchId}` (rating-engine.ts) guarda
  // `teamA.teamId`/`teamB.teamId`/`winnerTeamId` como string solta — doc id
  // não é team-keyed (é `sportCode_matchId`), então remap genérico no lugar
  // já resolve, sem precisar recriar sob outro id. `replayAthleteLedger` só
  // consulta por `sportCode`+`athleteIds array-contains`, nunca por teamId, e
  // o "quem ganhou" é uma comparação INTERNA ao próprio doc
  // (`winnerTeamId === teamA.teamId`) — então não remapear não quebraria o
  // rating hoje, mas deixaria o ledger citando pra sempre um `teams/{id}`
  // apagado.
  RATING_EVENTS_KEY,
  // NOTA: `drawSessions` NÃO entra aqui — ver `PRESERVED_COLLECTIONS` abaixo.
];
// Chave estável do `loaded` pras entries de palpite — usada tanto pra
// carregar quanto pra EXCLUIR da contagem de referências (ver mais abaixo,
// "quantos apontam pra ele" precisa ignorar isso).
const ENTRIES_KEY = "tournamentPredictions/*/entries";

/**
 * Coleções que ficam de FORA da verificação (fase 2 e a checagem de
 * cobertura) de propósito — não é um buraco, é uma decisão. Hoje só
 * `drawSessions`: `reveals[].teamId` mora dentro de uma cadeia de hash à
 * prova de adulteração (`revealHash` em `functions/src/draw-log.ts:44-55`,
 * que hasheia `prevHash ∥ index ∥ teamId ∥ destinationKey ∥ atMillis`).
 * Remapear o campo sem recalcular a cadeia QUEBRA a prova a partir daquele
 * reveal em diante; recalcular a cadeia FALSIFICA a prova (o comprovante já
 * publicado passa a divergir do hash republicado, mesmo que o hash novo
 * "feche" sozinho — é forjar com boa intenção). Nenhuma das duas é
 * aceitável, então a coleção INTEIRA fica de fora tanto do remap
 * (`SIMPLE_COLLECTIONS` não a lista) quanto da verificação.
 *
 * O que torna isso seguro: o doc de sorteio é um registro histórico
 * AUTOSSUFICIENTE — `DrawSessionEntrant`
 * (`functions/src/draw-session-model.ts:28-38`) já guarda
 * label/playerNames/photoUrls/city/levelLabel/points; a tela e o comprovante
 * nunca resolvem o teamId vivo pra renderizar. `reveals` e `entrants`
 * continuam citando o MESMO id um do outro (internamente consistentes),
 * então o documento inteiro, intocado, continua sendo prova válida do que
 * foi sorteado — só que sob um id que deixou de ter `teams/{id}` vivo.
 */
const PRESERVED_COLLECTIONS = new Set([`${base}/drawSessions`]);
// Nomes curtos pra imprimir na saída — derivados do Set acima, não escritos
// à mão de novo: se um dia entrar uma segunda coleção aqui (por outro
// motivo, não a cadeia de hash), a mensagem lista as duas pelo nome sem
// precisar editar a string; o PORQUÊ de cada uma fica só no comentário
// acima, não duplicado na mensagem de log.
const preservedCollectionNames = () => [...PRESERVED_COLLECTIONS].map((p) => p.split("/").pop()).join(", ");

/**
 * Nomes de subcoleção aninhada (moram sob um documento pai que não dá pra
 * enumerar sem varrer TODOS os pais — `tournamentPredictions/{tid}/entries`,
 * `users/{uid}/followingTeams`) que já sabemos que existem e guardam teamId.
 * Não tem como descobrir esses NOMES sozinho sem a Firestore Admin API (fora
 * do escopo); mas uma vez que o NOME é conhecido, `collectionGroup` varre
 * TODOS os docs daquele nome no projeto inteiro, não uma amostra. A lacuna
 * que este script tinha não era "não sabíamos fazer isso", era "não sabíamos
 * que `followingTeams` existia" — se aparecer outra, entra aqui.
 */
const KNOWN_NESTED_SUBCOLLECTIONS = ["entries", "followingTeams"];

/**
 * Descobre TUDO que existe pra varrer, em vez de uma lista escrita à mão: as
 * coleções de topo (`listCollections`), as subcoleções do próprio doc
 * `${base}` (onde moram `teams`, `matches`, `teamRankings` etc.), e os nomes
 * conhecidos acima via `collectionGroup`. Usada pela fase 2 (depois da fase
 * 1 já ter escrito) E pela checagem de cobertura do dry-run (antes de
 * escrever qualquer coisa) — as duas fazem a MESMA pergunta ("o que existe
 * de verdade cita um id absorvido?"), só comparam a resposta contra coisas
 * diferentes.
 */
async function discoverScanSources() {
  const sources = [];
  const topLevel = await db.listCollections();
  for (const col of topLevel) sources.push({label: col.path, get: () => col.get()});
  const baseSubs = await db.doc(base).listCollections();
  for (const col of baseSubs) sources.push({label: col.path, get: () => col.get()});
  for (const name of KNOWN_NESTED_SUBCOLLECTIONS) {
    sources.push({label: `collectionGroup(${name})`, get: () => db.collectionGroup(name).get()});
  }
  return sources;
}

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
  // dá pra varrer com collectionGroup. `picks` guarda teamId como VALOR de
  // mapa (`{[matchId]: predictedWinnerTeamId}`) e `championPick` como string
  // solta; o remap genérico já cobre os dois. O id do doc é o uid do
  // palpiteiro, não um teamId, então — ao contrário de
  // tournamentCategoryResults/leagueTeamRankings/followingTeams — não
  // precisa recriar sob outro id, só editar o campo no lugar.
  loaded.set(ENTRIES_KEY, await db.collectionGroup("entries").get());
  const resultsSnap = await db.collection(`${base}/tournamentCategoryResults`).get();
  const rankingsSnap = await db.collection(`${base}/teamRankings`).get();
  // `teamId` mora no corpo do doc (`leagueTeamRankings/{leagueId}_{categoryId}_{teamId}`),
  // igual a tournamentCategoryResults — precisa recriar sob outro id, não só
  // editar o campo. Pode vir vazia num projeto sem ligas; `.get()` numa
  // coleção vazia/ausente não erra.
  const leagueRankingsSnap = await db.collection(`${base}/leagueTeamRankings`).get();
  // `users/{uid}/followingTeams/{teamId}` — achado auditando `firestore.rules`
  // (não `functions/src`: SÓ O CLIENTE escreve isso,
  // `team_follow_service.dart`). O ID do doc É o teamId — a regra de create
  // exige `request.resource.data.teamId == teamId`, e a leitura do app faz
  // `.doc(teamId).get()`, NUNCA uma query pelo campo. Editar só o campo por
  // dentro deixaria o doc "seguido" sob o id ERRADO pra sempre (o usuário
  // continuaria não-seguindo o sobrevivente) — precisa recriar sob o id do
  // sobrevivente, igual leagueTeamRankings/tournamentCategoryResults.
  const followingTeamsSnap = await db.collectionGroup("followingTeams").get();

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
    const teamId = trim(data.teamId);
    const tournamentId = trim(data.tournamentId);
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
  // A regra do sobrevivente existe pra "minimizar reescrita de partida
  // ENCERRADA" (comentário da própria lib). `entries` de palpite é o
  // chute de um torcedor — reescrever é semanticamente inerte e não custa
  // nada (os dois lados são remapeados de qualquer jeito), então NÃO conta
  // pra tally: contar entraria pra decidir o sobrevivente por algo que não é
  // história de partida jogada, e pode até inverter a decisão contra o
  // próprio objetivo da regra (o lado com mais PARTIDAS reais perderia pra
  // quem só tem mais palpites). Está no inventário de escrita (`loaded`) mas
  // FORA da tally — são conjuntos que sempre foram pra ser diferentes.
  // `followingTeams` (preferência de "seguir", nem chega a ficar em `loaded`)
  // é a mesma categoria de coisa e por isso também nunca entra aqui.
  //
  // `ratingEvents` também sai daqui, por um motivo diferente: cada partida
  // RATEADA já conta uma vez via `matches` — contar de novo via
  // `ratingEvents` dobraria o peso só das partidas rateadas (W.O. e esportes
  // sem rating não duplicam), uma assimetria arbitrária no desempate. Não
  // inverte a regra contra si mesma como `entries` invertia (aponta pro
  // MESMO lado que `matches` já aponta), mas uma partida encerrada só deve
  // contar uma vez.
  for (const [key, snap] of loaded) {
    if (key === ENTRIES_KEY || key === RATING_EVENTS_KEY) continue;
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
    const teamId = trim(doc.data().teamId);
    if (teamId) countRef(teamId);
  }
  for (const doc of leagueRankingsSnap.docs) {
    const teamId = trim(doc.data().teamId);
    if (teamId) countRef(teamId);
  }

  // DUAS listas, nunca uma. Apagar é sempre a ÚLTIMA fase: se a fase de
  // repontamento falhar no meio, o doc antigo continua vivo e as inscrições
  // seguem resolvendo. O contrário (apagar antes) deixaria inscrição órfã —
  // some da listagem e trava no `inscriptionParticipantUidsMatchTeam`.
  const mapping = [];
  const remapsByPath = new Map();
  const removals = [];
  for (const [pairKey, members] of duplicated) {
    const plan = planGroupMerge({members, tournamentsByTeamId, refCountByTeamId});
    if (plan.skipped) {
      console.log(`PULADO ${pairKey}: ${plan.reason} (${members.map((m) => m.id).join(", ")})`);
      continue;
    }

    // ── Preflight: TUDO que pode bloquear o grupo é checado ANTES de
    // enfileirar qualquer coisa, nunca no meio. Um `continue` no meio (pular
    // só um doc, deixando o resto do grupo seguir) tira aquele doc tanto do
    // remap quanto da remoção — a fase 2 encontra ele ainda citando o id
    // absorvido e aborta, mas SÓ DEPOIS que a fase 1 já comitou o resto do
    // grupo. Bloquear aqui, antes de qualquer `mapping.push`, garante que um
    // grupo problemático fica 100% intocado — os outros 8 fundem limpo.

    // scaleVersion: o SERVIDOR lê o campo ausente como 0
    // (`Number(prev.scaleVersion) || 0` em tournament-ranking.ts) — ausência
    // NÃO é "concorda com qualquer coisa", é "versão 0" (pré-escala).
    // Normaliza aqui do MESMO jeito antes de comparar: scaleVersion:2 ao
    // lado de um SEM o campo são DIVERGENTES (2 vs 0), não concordância por
    // default de um `filter` que descarta os ausentes.
    const survivorRankDoc = rankingsSnap.docs.find((d) => d.id === plan.survivorId) ?? null;
    const absorbedRankDocs = plan.absorbedIds
      .map((id) => rankingsSnap.docs.find((d) => d.id === id))
      .filter(Boolean);
    const scaleVersions = new Set(
      [survivorRankDoc, ...absorbedRankDocs]
        .filter(Boolean)
        .map((d) => (d.data().scaleVersion == null ? 0 : Number(d.data().scaleVersion))),
    );
    if (scaleVersions.size > 1) {
      console.log(
        `PULADO ${pairKey}: scaleVersion divergente em teamRankings (${[...scaleVersions].join(", ")}) — somar pontos de escalas diferentes corromperia o ranking. Requer reconciliação manual.`,
      );
      continue;
    }

    const resultsMissing = preflightMissingFields({
      label: "tournamentCategoryResults",
      snap: resultsSnap,
      absorbedIds: plan.absorbedIds,
      requiredFields: ["tournamentId", "categoryId"],
    });
    if (resultsMissing) {
      console.log(
        `PULADO ${pairKey}: ${resultsMissing} — requer reconciliação manual antes de fundir. Grupo inteiro preservado.`,
      );
      continue;
    }

    const leagueMissing = preflightMissingFields({
      label: "leagueTeamRankings",
      snap: leagueRankingsSnap,
      absorbedIds: plan.absorbedIds,
      requiredFields: ["leagueId", "categoryId"],
    });
    if (leagueMissing) {
      console.log(
        `PULADO ${pairKey}: ${leagueMissing} — requer reconciliação manual antes de fundir. Grupo inteiro preservado.`,
      );
      continue;
    }

    const leagueCollision = preflightLeagueCollision({
      snap: leagueRankingsSnap,
      survivorId: plan.survivorId,
      absorbedIds: plan.absorbedIds,
    });
    if (leagueCollision) {
      console.log(
        `PULADO ${pairKey}: ${leagueCollision} — requer reconciliação manual antes de fundir. Grupo inteiro preservado.`,
      );
      continue;
    }

    mapping.push({pairKey, survivorId: plan.survivorId, absorbedIds: plan.absorbedIds});
    console.log(`${pairKey}: ${plan.absorbedIds.join(", ")} -> ${plan.survivorId}`);

    for (const absorbedId of plan.absorbedIds) {
      for (const [, snap] of loaded) {
        for (const doc of snap.docs) {
          queueGenericRemap(remapsByPath, doc, absorbedId, plan.survivorId);
        }
      }

      for (const doc of resultsSnap.docs) {
        const data = doc.data();
        if (trim(data.teamId) !== absorbedId) continue;
        const tournamentId = trim(data.tournamentId);
        const categoryId = trim(data.categoryId);
        if (!tournamentId || !categoryId) {
          throw new Error(
            `estado inesperado: tournamentCategoryResults/${doc.id} sem tournamentId/categoryId — o preflight deveria ter bloqueado ${pairKey} antes de chegar aqui.`,
          );
        }
        const newId = `${tournamentId}_${categoryId}_${plan.survivorId}`;
        // DEFERIDO por instrução do controlador: se o sobrevivente já tem
        // doc próprio em `newId`, este `update` sobrescreve o resultado do
        // sobrevivente com o do absorvido — overwrite semântico conhecido,
        // fora do escopo desta rodada.
        const existingAtNewId = resultsSnap.docs.find((d) => d.id === newId);
        const newRef = db.doc(`${base}/tournamentCategoryResults/${newId}`);
        remapsByPath.set(newRef.path, {
          ref: newRef,
          data: {...data, teamId: plan.survivorId},
          op: existingAtNewId ? "update" : "create",
          updateTime: existingAtNewId ? existingAtNewId.updateTime : undefined,
        });
        queueRemoval(removals, doc.ref, doc.updateTime);
      }

      for (const doc of leagueRankingsSnap.docs) {
        const data = doc.data();
        if (trim(data.teamId) !== absorbedId) continue;
        const leagueId = trim(data.leagueId);
        const categoryId = trim(data.categoryId);
        if (!leagueId || !categoryId) {
          throw new Error(
            `estado inesperado: leagueTeamRankings/${doc.id} sem leagueId/categoryId — o preflight deveria ter bloqueado ${pairKey} antes de chegar aqui.`,
          );
        }
        const newId = `${leagueId}_${categoryId}_${plan.survivorId}`;
        const newRef = db.doc(`${base}/leagueTeamRankings/${newId}`);
        // Se um doc já existe em `newId`, o preflight (`preflightLeagueCollision`,
        // antes de `mapping.push`) já provou por deep-equal que é a PRÓPRIA
        // escrita de uma corrida anterior desta migração (idêntico a
        // `{...dado atual do absorvido, teamId: sobrevivente}`) — uma colisão
        // GENUÍNA (sobrevivente com stageResults próprio ali) já teria
        // bloqueado o grupo inteiro antes de chegar aqui. Então "já existe"
        // aqui só pode significar "já resolvido": não recria (evita um
        // `create` redundante — o doc já é o que escreveríamos), só
        // enfileira a remoção do antigo abaixo.
        const alreadyResolved =
          leagueRankingsSnap.docs.some((d) => d.id === newId) || remapsByPath.has(newRef.path);
        if (!alreadyResolved) {
          remapsByPath.set(newRef.path, {
            ref: newRef,
            data: {...data, teamId: plan.survivorId},
            op: "create",
          });
        }
        queueRemoval(removals, doc.ref, doc.updateTime);
      }

      for (const doc of followingTeamsSnap.docs) {
        if (doc.id !== absorbedId) continue;
        const userRef = doc.ref.parent.parent;
        if (!userRef) continue; // não deveria acontecer — followingTeams sempre tem um users/{uid} pai
        const survivorRef = userRef.collection("followingTeams").doc(plan.survivorId);
        // Já resolvido se: o usuário JÁ seguia o sobrevivente antes (doc
        // pré-existente no snapshot), ou outro absorvido do MESMO grupo já
        // recriou o doc do sobrevivente nesta mesma corrida. Em qualquer um
        // dos dois casos não recria nada — o doc do sobrevivente já reflete
        // a preferência corretamente, só sobra apagar o antigo. Ao contrário
        // de leagueTeamRankings, aqui NÃO precisa de preflight nem de
        // bloquear o grupo: não há dado de negócio em jogo (`followedAt` do
        // absorvido é descartável), então "já resolvido, só apaga" é sempre
        // seguro.
        const alreadyResolved =
          followingTeamsSnap.docs.some((d) => d.ref.path === survivorRef.path) ||
          remapsByPath.has(survivorRef.path);
        if (!alreadyResolved) {
          remapsByPath.set(survivorRef.path, {
            ref: survivorRef,
            data: {...doc.data(), teamId: plan.survivorId},
            op: "create",
          });
        }
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
      // A checagem acima já normaliza ausência pra 0 antes de comparar — os
      // dois lados batem de verdade (mesmo scaleVersion, OU nenhum dos dois
      // tem, que é o MESMO que dizer que os dois valem 0); um ausente ao
      // lado de um presente já teria sido pego como divergência e pulado o
      // grupo INTEIRO lá em cima, antes de chegar aqui.
      const scaleVersion =
        survivorRanking?.scaleVersion ?? absorbedRankings.find((d) => d.scaleVersion != null)?.scaleVersion;
      const rankingRef = db.doc(`${base}/teamRankings/${plan.survivorId}`);
      remapsByPath.set(rankingRef.path, {
        ref: rankingRef,
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

  const remaps = [...remapsByPath.values()];
  const skippedGroups = duplicated.length - mapping.length;
  console.log(
    `\nresumo do planejamento: ${mapping.length} par(es) planejado(s) para fusão, ${skippedGroups} pulado(s) de ${duplicated.length} grupo(s) com 2+ docs.`,
  );
  console.log(`fase 1 (repontar): ${remaps.length} escritas`);
  console.log(`fase 3 (apagar):   ${removals.length} remoções`);

  const absorbedAll = new Set(mapping.flatMap((m) => m.absorbedIds));

  // Aviso sempre impresso, independente de dry-run/--apply: `picks.<matchId>`
  // com PONTO LITERAL no nome do campo (não um mapa `picks` aninhado) já foi
  // gravado historicamente por `submitBracketPrediction`. `batch.update()`
  // interpreta ponto no nome do campo como CAMINHO aninhado — um campo assim
  // seria mal-interpretado (grava dentro de um mapa `picks` que talvez nem
  // exista) em vez de reescrito corretamente.
  const entriesSnap = loaded.get(ENTRIES_KEY);
  const dottedFieldDocs = entriesSnap.docs.filter((doc) =>
    Object.keys(doc.data()).some((key) => key.includes(".")),
  );
  console.log(
    "\nAVISO: confirme, antes de rodar --apply, que nenhum doc de tournamentPredictions/*/entries",
  );
  console.log(
    "tem campo de TOPO com ponto literal no nome (`submitBracketPrediction` já gravou",
  );
  console.log(
    "`picks.<matchId>` assim historicamente) — batch.update() trataria isso como caminho aninhado.",
  );
  if (dottedFieldDocs.length > 0) {
    console.error(`ATENÇÃO: ${dottedFieldDocs.length} doc(s) com campo de topo pontuado:`);
    for (const doc of dottedFieldDocs) console.error(`  ${doc.ref.path}`);
  } else {
    console.log(`Nenhum encontrado nesta varredura (${entriesSnap.size} docs de entries checados).`);
  }

  if (!apply) {
    // Checagem de cobertura: a MESMA descoberta da fase 2, rodada aqui só de
    // LEITURA, comparando contra o plano em vez de contra "o que sobrou
    // depois da fase 1". Não escreve nada, custa uma passada a mais, e é
    // exatamente o jeito de ter pego `followingTeams` ANTES de um humano ter
    // pego, em vez de só depois que a fase 1 já tivesse comitado.
    console.log("\nchecagem de cobertura (dry-run, só leitura): descobrindo fontes...");
    const sources = await discoverScanSources();
    console.log(`fontes descobertas (${sources.length}): ${sources.map((s) => s.label).join(", ")}`);
    let scannedDocs = 0;
    let gaps = 0;
    const preservedPaths = new Set();
    for (const {label, get} of sources) {
      const snap = await get();
      scannedDocs += snap.size;
      for (const doc of snap.docs) {
        const text = `${doc.id} ${JSON.stringify(doc.data())}`;
        for (const id of absorbedAll) {
          if (!text.includes(id)) continue;
          if (PRESERVED_COLLECTIONS.has(label)) {
            preservedPaths.add(doc.ref.path);
            continue;
          }
          if (remapsByPath.has(doc.ref.path)) continue;
          if (removals.some((r) => r.ref.path === doc.ref.path)) continue;
          console.error(
            `BURACO DE COBERTURA: ${doc.ref.path} cita ${id} mas não está no plano de remap nem de remoção.`,
          );
          gaps += 1;
        }
      }
    }
    console.log(`checagem de cobertura: ${scannedDocs} docs varridos, ${gaps} buraco(s).`);
    console.log(
      `${preservedCollectionNames()} PRESERVADO(S) (ver PRESERVED_COLLECTIONS no código pro motivo de cada uma): ${preservedPaths.size} doc(s) seguem citando id absorvido, por decisão.`,
    );
    console.log("\n(dry-run) nada foi gravado. Rode de novo com --apply.");
    if (gaps > 0) {
      console.error("NÃO rode --apply até investigar o(s) buraco(s) de cobertura acima.");
      process.exit(1);
    }
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

  const removalPaths = new Set(removals.map((r) => r.ref.path));

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
  // Descoberta, não lista à mão (mesmo mecanismo da checagem de cobertura
  // acima) — varre o que EXISTE de verdade no banco agora. Pula docs já
  // enfileirados pra fase 3: esses TÊM que citar o id absorvido até serem
  // apagados — não são sobra, são o próprio motivo de existir da fase 3.
  const sources = await discoverScanSources();
  console.log(`\nfase 2: varrendo ${sources.length} fontes descobertas...`);
  let leftovers = 0;
  const preservedPathsPhase2 = new Set();
  for (const {label, get} of sources) {
    const snap = await get();
    for (const doc of snap.docs) {
      if (removalPaths.has(doc.ref.path)) continue;
      const text = `${doc.id} ${JSON.stringify(doc.data())}`;
      for (const id of absorbedAll) {
        if (!text.includes(id)) continue;
        if (PRESERVED_COLLECTIONS.has(label)) {
          preservedPathsPhase2.add(doc.ref.path);
          continue;
        }
        console.error(`SOBRA: ${doc.ref.path} ainda cita ${id}`);
        leftovers += 1;
      }
    }
  }
  console.log(
    `${preservedCollectionNames()} PRESERVADO(S) (ver PRESERVED_COLLECTIONS no código pro motivo de cada uma): ${preservedPathsPhase2.size} doc(s) seguem citando id absorvido, por decisão.`,
  );
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
