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
 *       version: "1.0.17",        // o que o atleta lê
 *       build: 115,               // build number da loja (+N do pubspec)
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
 * chave de destino para a Agenda. Melhorias e versões anteriores vêm dos PRs
 * com mudança no app entre os cortes. Imagens: as artes de docs/app-news-art/ (sem `imageUrl`, o app mostra o
 * espaço reservado).
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *   # ou export GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-app-news.js --project <projectId> --show
 *   node scripts/seed-app-news.js --project <projectId> --version 1.0.17 --build 115
 *   node scripts/seed-app-news.js --project <projectId> --version 1.0.17 --build 115 --yes
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

// Artes das funcionalidades, no bucket do DEV (app/news/, o mesmo do editor do backoffice).
// Fonte e render em docs/app-news-art/ (render.sh). Trocar a arte = renderizar, subir com
// token de download e colar a URL aqui.
const IMAGES = {
  "mapa-reservar":
    "https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/app%2Fnews%2F1.0.15-mapa-reservar.webp?alt=media&token=6a687d6c-7d46-41bb-b91c-8ae2b86e8f7b",
  "bora-jogar":
    "https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/app%2Fnews%2F1.0.15-bora-jogar.webp?alt=media&token=19d2e422-8186-4fc9-a955-e3c95a0fad8d",
  "convite-reserva":
    "https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/app%2Fnews%2F1.0.15-convite-reserva.webp?alt=media&token=a6d66a65-9cab-4a11-a60e-00faa6991581",
  "equipes":
    "https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/app%2Fnews%2F1.0.15-equipes.webp?alt=media&token=401287da-25f6-4e1e-8814-bf0a27090c75",
};

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
        imageUrl: IMAGES["mapa-reservar"],
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
        imageUrl: IMAGES["bora-jogar"],
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
        imageUrl: IMAGES["convite-reserva"],
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
        imageUrl: IMAGES["equipes"],
      },
    ],
    // PRs com mudança no app entre o corte da 1.0.16 e o da 1.0.17: #959–#999 (corte em 27/10, PR #1000).
    improvements: [
      "Esta tela de Novidades, com os stories depois de atualizar",
      "Central de ajuda com guias de como usar cada função",
      "Como funciona: Nível, Elo, XP e Ranking, com quanto falta para subir",
      "Story da sua posição no ranking, com quantas posições você subiu ou caiu na última etapa",
      "No dia seguinte ao torneio, a notificação leva direto ao story do ranking",
      "Tema claro de volta em Configurações › Aparência",
      "Capa da arena na tela de reservar",
      "A confirmação da reserva avisa quando a arena aceita cartão",
      "Mesma regra de cancelamento em Minhas reservas e no detalhe da reserva",
      "Listas de atletas e de duplas não pulam mais para o topo ao rolar",
      "O ícone do app não fica mais com o contador de notificações preso",
    ],
  };
}

// Versões já cortadas, montadas dos PRs com mudança no app entre os cortes: 1.0.16 = #875–#956
// (corte em 26/10, PR #957), 1.0.15 = #612–#860 (corte em 21/10, PR #861). Sem botão: na tela
// elas só aparecem na lista de versões anteriores.
const PREVIOUS = [
  {
    version: "1.0.16",
    build: 114,
    date: "2026-10-26",
    stories: false,
    features: [
      {id: "home-nova-1016", title: "Home nova",
        summary: "Menu no avatar, atalhos e o próximo treino e a próxima reserva compactos."},
      {id: "hub-aulas-1016", title: "Aulas e treinos no Hub",
        summary: "A aba Competir virou Hub, com arenas, centros e professores e aula experimental pelo calendário."},
      {id: "meus-treinos-1016", title: "Meus treinos",
        summary: "Treinos por origem, com presença, convite e mensalidades num lugar só."},
      {id: "chat-aulas-1016", title: "Chat com a arena e o centro",
        summary: "Fale com a recepção e o professor pelo app; o WhatsApp segue como opção."},
      {id: "stories-1016", title: "Mais stories",
        summary: "Foto na hora no story do horário e a campanha do torneio pra postar."},
      {id: "modo-centro-1016", title: "Modo Centro de treinamento",
        summary: "Agenda, alunos, cobranças, contratos e captação para a equipe do CT."},
    ],
    improvements: [
      "Avaliar a aula, o professor e o local depois do treino",
      "Check-in no centro de treinamento com carteirinha QR",
      "Arenas parceiras em destaque no mapa do Reservar",
      "Selo de organizador verificado nos torneios",
      "Quantos atletas já avaliaram cada torneio",
      "Organizador pode reabrir as inscrições",
    ],
  },
  {
    version: "1.0.15",
    build: 113,
    date: "2026-10-21",
    stories: false,
    features: [
      {id: "loja-1015", title: "Loja",
        summary: "Vitrine, produto personalizado com nome e número, favoritos, Pix e meus pedidos."},
      {id: "reserva-galera-1015", title: "Reserva com a galera",
        summary: "Convide jogadores, pague com cartão e escolha o esporte da reserva."},
      {id: "reserva-story-1015", title: "Reserva no story",
        summary: "Poste a reserva confirmada e o resultado do pós-jogo no Instagram."},
      {id: "peladas-1015", title: "Peladas",
        summary: "Placar confirmado pelos adversários, histórico e perfil público das peladas."},
      {id: "treinos-1015", title: "Treinos no app",
        summary: "Aulas na agenda, Vou/Não vou, check-in pelo QR da quadra e mensalidade online."},
      {id: "modo-professor-1015", title: "Modo Professor",
        summary: "Alunos, agenda, mensagens, planos de aula, ganhos e saque para o professor."},
    ],
    improvements: [
      "Cartão de crédito na inscrição de torneio",
      "Toque na notificação leva direto ao assunto",
      "Cores de status legíveis no tema claro em todo o app",
      "Código de embaixador do Squad dá desconto na reserva",
      "Mesa: escolher quem começa sacando e cartões na súmula",
    ],
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
