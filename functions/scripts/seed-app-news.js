/* eslint-disable */
/**
 * Publica as novidades do app em `appConfig/appNews` — o doc que a tela de
 * Novidades e os stories pós-atualização do app do atleta leem
 * (nexago_app/lib/features/app_news/). Sem o doc, nada aparece: nem a tela
 * (o tile some dos Ajustes e o "Ver tudo" some da Home) nem os stories.
 *
 * Formato gravado (o doc inteiro é substituído):
 *   appConfig/appNews {
 *     releases: [{
 *       version: "1.0.15",        // o que o atleta lê
 *       build: 113,               // build number da loja (+N do pubspec)
 *       date: "2026-10-27",       // data civil de São Paulo
 *       stories: true,            // abre os stories depois de atualizar
 *       features: [{ id, title, summary, description, steps[], where,
 *                    ctaLabel, destination, url?, imageUrl?, icon?, stories? }],
 *       improvements: ["..."],
 *     }, ...],
 *     updatedAt
 *   }
 *
 * - `build`: só quem tem esse build ou maior vê a versão — dá para publicar
 *   antes de a loja liberar. Use o build que vai para a loja (reenvio por
 *   rejeição da Apple bumpa o número).
 * - `destination`: as mesmas chaves do banner da Home (reservar, bora-jogar,
 *   peladas, torneios, ranking, duplas, treinos, aulas, loja, indicar,
 *   missoes, url). Chave que o build não conhece esconde a funcionalidade.
 * - `id`: único entre as versões — é a chave do "Já usou" no aparelho.
 * - Os stories aparecem UMA vez por versão, só para quem já tinha conta antes
 *   da `date`, com as funcionalidades que o atleta ainda não usou.
 *
 * CONTEÚDO: as quatro funcionalidades descrevem o que as telas do app fazem
 * hoje (mapa do Reservar, Bora Jogar, convite de jogadores na reserva e
 * Equipes). Bora Jogar só RESPONDE convites: a entrada para começar um saiu do
 * app em 11/09 (242c0098c). "Chame a galera" abre o Reservar porque não há
 * chave de destino para a Agenda. Melhorias e versões anteriores são
 * provisórias. Imagens: sem `imageUrl`, o app mostra o espaço reservado.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-app-news.js --project <projectId> --show
 *   node scripts/seed-app-news.js --project <projectId> --version 1.0.15 --build 113
 *   node scripts/seed-app-news.js --project <projectId> --version 1.0.15 --build 113 --yes
 *
 * Sem --yes é DRY-RUN: mostra o estado atual e o que seria gravado.
 *
 * Depois que alguém salvar pelo backoffice (App do atleta › Novidades), a fonte passa a ser
 * `appAdminConfig/appNews` e a callable saveAppNews regrava este doc a cada save: o script se recusa
 * a gravar ou apagar, senão o próximo save do backoffice desfaria o que ele fez. Antes disso, o
 * backoffice abre importando o que estiver aqui.
 * --date YYYY-MM-DD muda a data da versão (padrão: hoje em São Paulo).
 * --delete apaga o doc (some a tela e os stories, ao vivo).
 */

const admin = require("firebase-admin");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes("--yes");
const SHOW_ONLY = process.argv.includes("--show");
const DELETE = process.argv.includes("--delete");
const projectId =
  argValue("--project") ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT;
const version = argValue("--version");
const buildRaw = argValue("--build");
const date = argValue("--date") || saoPauloToday();

function saoPauloToday() {
  // Brasil sem horário de verão desde 2019: UTC−3 fixo.
  const sp = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return sp.toISOString().slice(0, 10);
}

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const DOC_PATH = "appConfig/appNews";
const SOURCE_PATH = "appAdminConfig/appNews";

function currentRelease(build) {
  return {
    version,
    build,
    date,
    stories: true,
    features: [
      {
        id: "mapa-reservar",
        icon: "map",
        title: "Arenas no mapa",
        summary: "Ache quadra perto de você e veja o próximo horário livre.",
        description:
          "A aba Reservar abre num mapa com as arenas da região. Cada uma mostra o próximo horário livre e o preço a partir de — filtre por esporte, distância, preço e comodidades e reserve ali mesmo.",
        steps: [
          "Abra a aba Reservar e escolha o dia e o horário",
          "Filtre por esporte, distância, preço ou comodidades",
          "Toque na arena e reserve o horário livre",
        ],
        where: "Aba Reservar",
        ctaLabel: "Abrir mapa",
        destination: "reservar",
      },
      {
        id: "bora-jogar",
        title: "Bora Jogar",
        summary: "Convites pra jogar, com resposta, check-in e avaliação.",
        description:
          "Quando um atleta te chama pra jogar, o convite chega por notificação. Aceite, recuse ou sugira outro horário — o jogo confirmado entra na sua Agenda. No dia, faça check-in ao chegar e, depois, avalie o parceiro.",
        steps: [
          "Abra o convite que chegou por notificação",
          "Aceite, recuse ou sugira outro horário",
          "No dia, faça check-in e depois avalie o jogo",
        ],
        where: "Notificação do convite › Agenda",
        ctaLabel: "Ver convites",
        destination: "bora-jogar",
      },
      {
        id: "convite-reserva",
        icon: "invite",
        title: "Chame a galera",
        summary: "Convide até 3 jogadores para a sua reserva.",
        description:
          "Na sua reserva, mande o link do jogo no grupo do WhatsApp ou chame quem já está no nexaGO. Quem aceita entra na lista de quem vai jogar e vê o jogo na Agenda.",
        steps: [
          "Reserve a quadra e abra a reserva na Agenda",
          "Em Sua equipe, toque em Convidar jogadores",
          "Mande o link no grupo ou busque o atleta pelo nome",
        ],
        where: "Agenda › sua reserva › Sua equipe",
        ctaLabel: "Reservar quadra",
        destination: "reservar",
      },
      {
        id: "equipes",
        title: "Duplas e equipes",
        summary: "Encontre duplas perto de você e veja a campanha de cada uma.",
        description:
          "Busque pelo nome da equipe ou de um atleta, filtre por esporte e gênero e ordene por em alta, mais próximas ou ranking. No perfil da dupla: atletas, jogos, títulos, ranking e confrontos.",
        steps: [
          "Abra Equipes no Hub",
          "Busque, filtre por esporte e gênero ou ordene por ranking",
          "Toque na dupla para ver atletas, títulos e confrontos",
        ],
        where: "Hub › Equipes",
        ctaLabel: "Ver equipes",
        destination: "duplas",
      },
    ],
    improvements: [
      "Placar do árbitro abre 2× mais rápido",
      "Agenda mostra clima previsto do jogo",
      "Notificação de vaga em torneio lotado",
    ],
  };
}

// Provisórias: só título, sem botão.
const PREVIOUS = [
  {
    version: "1.0.14",
    build: 112,
    date: "2026-10-05",
    stories: false,
    features: [
      {id: "convite-dupla", title: "Convite de dupla"},
      {id: "placar-ao-vivo", title: "Placar ao vivo"},
    ],
    improvements: [],
  },
  {
    version: "1.0.13",
    build: 111,
    date: "2026-10-01",
    stories: false,
    features: [
      {id: "nova-home", title: "Nova Home"},
      {id: "trilha-de-elos", title: "Trilha de elos"},
      {id: "loja", title: "Loja"},
    ],
    improvements: [],
  },
];

async function readCurrent() {
  const snap = await db.doc(DOC_PATH).get();
  return snap.exists ? snap.data() : null;
}

function printCurrent(current) {
  console.log(`\nEstado atual de ${DOC_PATH} (${projectId}):`);
  if (!current) {
    console.log("  (doc não existe — a tela de Novidades não aparece)");
    return;
  }
  for (const r of current.releases || []) {
    const titles = (r.features || []).map((f) => f.title).join(" · ");
    console.log(`  ${r.version} (build ${r.build}, ${r.date}` +
      `${r.stories === false ? ", sem stories" : ""}): ${titles}`);
  }
}

async function run() {
  printCurrent(await readCurrent());
  if (SHOW_ONLY) return;

  if ((await db.doc(SOURCE_PATH).get()).exists) {
    console.error(`\n${SOURCE_PATH} existe: as novidades já são editadas pelo backoffice ` +
      "(App do atleta › Novidades). Edite por lá — gravar aqui seria desfeito no próximo save.");
    process.exit(1);
  }

  if (DELETE) {
    console.log(`\nApagar ${DOC_PATH}.`);
    if (!APPLY) {
      console.log("\nDRY-RUN. Nada foi apagado. Rode de novo com --yes para aplicar.");
      return;
    }
    await db.doc(DOC_PATH).delete();
    console.log("\nApagado.");
    return;
  }

  const build = Number(buildRaw);
  if (!version || !Number.isInteger(build) || build <= 0) {
    console.error("\nInforme --version <x.y.z> e --build <inteiro> (ou use --show).");
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("\n--date tem de ser YYYY-MM-DD.");
    process.exit(1);
  }
  const releases = [
    currentRelease(build),
    ...PREVIOUS.filter((r) => r.build < build),
  ];
  console.log("\nSeria gravado:");
  printCurrent({releases});

  if (!APPLY) {
    console.log("\nDRY-RUN. Nada foi gravado. Rode de novo com --yes para aplicar.");
    return;
  }

  await db.doc(DOC_PATH).set({
    releases,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("\nGravado.");
  printCurrent(await readCurrent());
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
