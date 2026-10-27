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
 * CONTEÚDO: o texto abaixo é o do design (Claude Design › NexaGO Atleta -
 * Novidades). Radar, Racha fixo e Rateio Pix NÃO existem no app: os botões
 * abrem a tela real mais próxima (Reservar, Bora Jogar, Reservar), mas o texto
 * promete mapa ao vivo, reserva automática do grupo e Pix dividido. Revise
 * antes de publicar no projeto que a loja usa. Melhorias e versões anteriores
 * são provisórias. Imagens: sem `imageUrl`, o app mostra o espaço reservado.
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

function currentRelease(build) {
  return {
    version,
    build,
    date,
    stories: true,
    features: [
      {
        id: "radar",
        icon: "radar",
        title: "Radar ao vivo",
        summary: "Quadra livre e racha com vaga, agora, no mapa.",
        description:
          "Veja no mapa as quadras com horário livre e os rachas que estão precisando de gente — atualizado em tempo real.",
        steps: [
          "Abra o radar pelo Início ou pela aba Reservar",
          "Filtre por esporte, distância e horário",
          "Toque num ponto para reservar ou pedir vaga",
        ],
        where: "Início › Ações rápidas",
        ctaLabel: "Abrir radar",
        destination: "reservar",
      },
      {
        id: "racha",
        icon: "group",
        title: "Racha fixo",
        summary: "Lista de presença e reserva automática do grupo.",
        description:
          "Monte seu grupo fixo uma vez. Toda semana a quadra é reservada e a lista de presença sai sozinha.",
        steps: [
          "Escolha arena, dia e horário",
          "Convide o grupo pelo WhatsApp",
          "Confirme presença até 2 h antes",
        ],
        where: "Comunidade › Meus rachas",
        ctaLabel: "Criar racha",
        destination: "bora-jogar",
      },
      {
        id: "rateio",
        icon: "pix",
        title: "Rateio Pix",
        summary: "Divida a quadra e cobre o grupo em 1 toque.",
        description:
          "Ao reservar, divida o valor entre os jogadores. Cada um recebe um Pix e você acompanha quem já pagou.",
        steps: [
          "Na reserva, toque em Dividir",
          "Selecione quem vai jogar",
          "Acompanhe os pagamentos na Agenda",
        ],
        where: "Reservar › Pagamento",
        ctaLabel: "Experimentar",
        destination: "reservar",
      },
      {
        id: "dupla",
        icon: "partner",
        title: "Dupla certa",
        summary: "Parceiro do seu nível, horário e arena.",
        description:
          "Sugestões de parceiros com nível parecido com o seu e disponíveis nos mesmos horários e arenas.",
        steps: [
          "Informe categoria e disponibilidade",
          "Veja as sugestões e o histórico de cada um",
          "Mande o convite de dupla",
        ],
        where: "Competir › Inscrição",
        ctaLabel: "Achar dupla",
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
