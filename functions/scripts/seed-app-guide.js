/* eslint-disable */
/**
 * Publica a Central de ajuda do app do atleta em `appConfig/appGuide` — os guias "como usar" de
 * cada função (nexago_app/lib/features/app_guide/). Sem o doc, a tela abre com "Os guias de cada
 * função chegam em breve." (Configurações › Sobre › Ajuda e suporte).
 *
 * Formato gravado (o doc inteiro é substituído):
 *   appConfig/appGuide {
 *     categories: [{
 *       id, title,
 *       topics: [{ id, title, summary, description, steps[] (até 6), where,
 *                  ctaLabel, destination, url?, imageUrl?, icon? }],
 *     }],
 *     updatedAt
 *   }
 *
 * - Cada guia tem o formato da funcionalidade das Novidades (`appConfig/appNews`).
 * - `destination`: as mesmas chaves do banner da Home (reservar, bora-jogar, peladas, torneios,
 *   ranking, duplas, treinos, aulas, loja, indicar, missoes, minhas-reservas, creditos-chuva, url).
 *   Chave que o build não conhece esconde o guia; guia da Loja some com a Loja desligada. Os guias
 *   de Chuva usam `minhas-reservas`/`creditos-chuva` (build 116+): no build 115, sem as telas de
 *   chuva, eles nem aparecem.
 * - `icon`: map, invite, cancel, story, handshake, focus, chat, star ou rain (sem ele, vale o ícone
 *   do destino; chave que o build não conhece também).
 * - Texto levantado do código das telas em 27/10/2026 (Chuva em 29/10/2026) — rótulos reais de botões e caminhos. Regra
 *   com número (prazo, limite) desatualiza se a regra mudar: conferir antes de republicar.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/seed-app-guide.js --project <projectId> --show
 *   node scripts/seed-app-guide.js --project <projectId>          # dry-run
 *   node scripts/seed-app-guide.js --project <projectId> --yes
 *   node scripts/seed-app-guide.js --project <projectId> --delete --yes
 *
 * Depois que alguém salvar pelo backoffice (App do atleta › Central de ajuda), a fonte passa a ser
 * `appAdminConfig/appGuide` e a callable saveAppGuide regrava este doc a cada save: o script se
 * recusa a gravar ou apagar, senão o próximo save do backoffice desfaria o que ele fez. Antes disso,
 * o backoffice abre importando o que estiver aqui.
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

if (!projectId) {
  console.error("Informe o projeto: --project <projectId> (ou GCLOUD_PROJECT).");
  process.exit(1);
}

admin.initializeApp({projectId});
const db = admin.firestore();
const DOC_PATH = "appConfig/appGuide";
const SOURCE_PATH = "appAdminConfig/appGuide";

// Artes já publicadas para as Novidades (docs/app-news-art/), reaproveitadas nos guias iguais.
const IMAGES = {
  "mapa-reservar":
    "https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/app%2Fnews%2F1.0.15-mapa-reservar.webp?alt=media&token=6a687d6c-7d46-41bb-b91c-8ae2b86e8f7b",
  "bora-jogar":
    "https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/app%2Fnews%2F1.0.15-bora-jogar.webp?alt=media&token=19d2e422-8186-4fc9-a955-e3c95a0fad8d",
  "convite-reserva":
    "https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/app%2Fnews%2F1.0.15-convite-reserva.webp?alt=media&token=a6d66a65-9cab-4a11-a60e-00faa6991581",
  "equipes":
    "https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/app%2Fnews%2F1.0.15-equipes.webp?alt=media&token=401287da-25f6-4e1e-8814-bf0a27090c75",
  "previsao-reserva":
    "https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/app%2Fnews%2F1.0.18-previsao-reserva.webp?alt=media&token=d318f1a3-f85e-4219-9067-a48b70e9ca9b",
  "chuva-sem-custo":
    "https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/app%2Fnews%2F1.0.18-chuva-sem-custo.webp?alt=media&token=668e04a6-1e32-4a8c-9e3b-93a3320e95c1",
  "credito-chuva":
    "https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/app%2Fnews%2F1.0.18-credito-chuva.webp?alt=media&token=d4edaffe-1652-4fce-9f89-0deb8c5fd39b",
  // Arte em docs/app-news-art/modo-focus.html (card do Focus da Início, com o deslizar).
  "modo-focus":
    "https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/app%2Fguide%2Fmodo-focus.webp?alt=media&token=c0e757cf-061a-46d0-8367-ef5b32dfd2f6",
};

const CATEGORIES = [
  {
    id: "reservar",
    title: "Reservar",
    topics: [
      {
        id: "guia-reservar-quadra",
        icon: "map",
        title: "Reservar uma quadra",
        summary: "Ache a arena no mapa, escolha o horário e garanta sua quadra.",
        description:
          "A aba Reservar mostra as arenas num mapa com lista. Escolha dia, quadra e horário, informe o esporte e conclua pagando na arena ou online (Pix ou cartão), conforme o que a arena aceita.",
        steps: [
          "Na aba \"Reservar\", toque na data e hora da busca ou busque a arena pelo nome",
          "Toque em \"Reservar\" no card da arena (ou abra a arena e toque em \"Ver horários disponíveis\")",
          "Escolha o dia, a quadra e o horário e toque em \"Continuar\"",
          "Marque o esporte e escolha \"Pagar na arena\" ou \"Pagar com PIX\"",
          "Toque em \"Confirmar reserva\" ou \"Confirmar e pagar\" — no pagamento online dá para escolher Pix ou cartão",
        ],
        where: "Aba Reservar › arena › Reservar",
        ctaLabel: "Abrir mapa",
        destination: "reservar",
        imageUrl: IMAGES["mapa-reservar"],
      },
      {
        id: "guia-convidar-jogadores",
        icon: "invite",
        title: "Chamar a galera",
        summary: "Complete sua quadra por link ou chamando atletas do nexaGO.",
        description:
          "No detalhe da reserva, quem reservou manda o link do jogo no grupo ou convida atletas pela busca. Quem aceitar primeiro ocupa a vaga, até 4 jogadores contando você, e vê o jogo na Agenda.",
        steps: [
          "Na aba \"Agenda\", toque no card da reserva",
          "Em \"Sua equipe\", toque em \"Convidar jogadores\"",
          "Toque em \"Compartilhar link do jogo\" e mande no grupo",
          "Ou busque o atleta pelo nome ou apelido e toque em \"Convidar\"",
        ],
        where: "Agenda › sua reserva › Sua equipe",
        ctaLabel: "Reservar quadra",
        destination: "reservar",
        imageUrl: IMAGES["convite-reserva"],
      },
      {
        id: "guia-cancelar-reserva",
        icon: "cancel",
        title: "Cancelar uma reserva",
        summary: "Não vai poder ir? Libere o horário pela Agenda.",
        description:
          "Cancele pelo detalhe da reserva e o horário volta a ficar livre na hora. A política da reserva: sem custo até 6h antes do início; depois, a arena pode reter 50% do valor. Valores pagos são acertados com a arena.",
        steps: [
          "Na aba \"Agenda\", toque no card da reserva",
          "Em \"Ações\", toque em \"Cancelar reserva\"",
          "Pronto: aparece \"Reserva cancelada.\"",
        ],
        where: "Agenda › sua reserva › Ações",
      },
    ],
  },
  {
    id: "chuva",
    title: "Chuva e previsão",
    topics: [
      {
        id: "guia-previsao-reserva",
        icon: "rain",
        title: "Previsão do tempo da reserva",
        summary: "Chance de chuva e temperatura de 2h antes a 2h depois do seu jogo.",
        description:
          "A reserva mostra a previsão do seu horário: chance de chuva hora a hora, de 2h antes do início a 2h depois do fim, com as horas do jogo em destaque, a temperatura e o céu no começo do jogo. Ela aparece 14 dias antes e some quando o jogo acaba. Quem você convidou também vê.",
        steps: [
          "Abra a reserva em \"Minhas reservas\" ou na Agenda",
          "No card \"Previsão do tempo\", veja a chance de chuva de cada hora; as do seu jogo ficam em destaque",
          "Mais de 14 dias antes, o card mostra a partir de quando a previsão aparece",
        ],
        where: "Minhas reservas › sua reserva",
        ctaLabel: "Ver minhas reservas",
        destination: "minhas-reservas",
        imageUrl: IMAGES["previsao-reserva"],
      },
      {
        id: "guia-reserva-liberada-chuva",
        icon: "rain",
        title: "Reserva liberada por chuva",
        summary: "A arena liberou seu horário: remarque sem custo ou guarde o valor como crédito.",
        description:
          "Quando chove, a arena pode ativar o Modo chuva e liberar as reservas pagas do período. Você é avisado e escolhe: remarcar sem custo (se a arena permite) ou guardar o valor como crédito. Sem escolha em 24h, vira crédito sozinho. Chuva no meio do jogo dá crédito do tempo que faltava. Reserva não paga é só cancelada.",
        steps: [
          "Toque no aviso de chuva ou abra a reserva em \"Minhas reservas\"",
          "No card \"Modo chuva ativo\", toque em \"Remarcar ou guardar crédito\"",
          "Remarcar: escolha o novo dia e horário dentro do prazo da arena e toque em \"Confirmar remarcação\". A diferença, se houver, é paga na arena",
          "Guardar crédito: o valor fica guardado para a próxima reserva nessa arena",
          "Vai jogar mesmo assim? Toque em \"Manter minha reserva\"",
        ],
        where: "Minhas reservas › reserva liberada",
        ctaLabel: "Ver minhas reservas",
        destination: "minhas-reservas",
        imageUrl: IMAGES["chuva-sem-custo"],
      },
      {
        id: "guia-pedir-cancelamento-chuva",
        icon: "rain",
        title: "Pedir cancelamento por chuva",
        summary: "Choveu e a arena aceita pedidos? Peça pelo app, sem custo.",
        description:
          "Em arenas que aceitam pedidos, o botão aparece na reserva a partir de 24h antes do jogo, até o prazo da arena. A arena analisa; em algumas, a aprovação é automática quando a previsão passa de 70% de chance e 2 mm de chuva. Aprovado, você escolhe entre remarcar ou guardar crédito. Até a resposta, a reserva segue de pé.",
        steps: [
          "Abra a reserva em \"Minhas reservas\"",
          "Toque em \"Choveu? Pedir cancelamento sem custo\" e, se quiser, escreva uma observação",
          "Acompanhe o \"Pedido em análise\" na reserva: dá para falar com a arena pelo WhatsApp ou desistir do pedido",
          "Aprovado, toque em \"Remarcar ou guardar crédito\" e escolha",
          "Recusado, a reserva continua de pé e o motivo aparece nela",
        ],
        where: "Minhas reservas › sua reserva",
        ctaLabel: "Ver minhas reservas",
        destination: "minhas-reservas",
      },
      {
        id: "guia-credito-chuva",
        title: "Usar o crédito de chuva",
        summary: "Desconte o crédito na próxima reserva na arena onde choveu.",
        description:
          "O crédito vale só na arena onde choveu, com a validade que ela definiu, e você é avisado 7 dias antes de vencer. Na confirmação da próxima reserva lá, \"Usar crédito de chuva\" já vem ligado e desconta do total; se cobrir tudo, a reserva sai paga. Cancelou antes do jogo? O crédito usado volta.",
        steps: [
          "Reserve um horário na arena onde choveu",
          "Na confirmação, confira o card \"Usar crédito de chuva\": ele já vem ligado",
          "Pague o restante, ou nada, se o crédito cobrir tudo. No Pix, o restante é de pelo menos R$ 5",
          "Saldo e validade: Configurações › Créditos de chuva",
        ],
        where: "Configurações › Créditos de chuva",
        ctaLabel: "Ver meus créditos",
        destination: "creditos-chuva",
        imageUrl: IMAGES["credito-chuva"],
      },
    ],
  },
  {
    id: "jogar",
    title: "Jogar",
    topics: [
      {
        id: "guia-story-placar",
        icon: "story",
        title: "Story e placar do jogo",
        summary: "Poste a reserva e o resultado no story e registre o placar.",
        description:
          "Gere uma arte da reserva ou do resultado pra postar no story. No pós-jogo, quem reservou lança o placar; os jogadores confirmam ou contestam e a pelada entra no seu histórico.",
        steps: [
          "Na \"Agenda\", toque em \"Postar no story\" no card da reserva",
          "Depois que o jogo começar, toque em \"Postar resultado\"",
          "Toque em \"Editar placar\", monte times e sets e toque em \"Salvar placar\"",
          "Os jogadores tocam em \"Confirmar placar\" ou \"Contestar\"",
          "Veja tudo em \"Histórico de partidas\" › \"Peladas\"",
        ],
        where: "Agenda › card da reserva; Configurações › Histórico de partidas",
      },
      {
        id: "guia-bora-jogar",
        title: "Bora Jogar",
        summary: "Responda convites pra jogar e acompanhe seus jogos marcados.",
        description:
          "Quando um atleta te chama pra jogar, o convite chega por notificação. Aceite, recuse ou sugira outro horário — o jogo confirmado entra na sua Agenda. No dia, faça check-in ao chegar e, depois, avalie o parceiro.",
        steps: [
          "Abra o convite que chegou por notificação",
          "Toque em \"Aceitar convite\" ou \"Recusar\" (no convite, também dá para \"Sugerir outro horário\")",
          "O jogo aceito fica em \"Jogos\" e na Agenda",
          "No dia, toque em \"Fazer check-in — cheguei!\"",
          "Depois do jogo, avalie o parceiro (a nota fica oculta até ele avaliar)",
        ],
        where: "Notificação do convite › Bora Jogar",
        ctaLabel: "Ver convites",
        destination: "bora-jogar",
        imageUrl: IMAGES["bora-jogar"],
      },
    ],
  },
  {
    id: "competir",
    title: "Competir",
    topics: [
      {
        id: "guia-inscrever-torneio",
        title: "Inscrever-se num torneio",
        summary: "Ache o torneio, escolha a categoria e garanta sua vaga.",
        description:
          "Torneios e ligas com busca e filtros. No torneio, escolha a categoria, aceite o termo, defina a dupla (ou guarde a vaga sozinho) e pague por Pix, cartão ou direto com o organizador.",
        steps: [
          "No \"Hub\", toque em \"Torneios e ligas\" e use a busca ou os filtros",
          "No torneio, toque em \"Inscrever minha dupla\" e confirme a categoria e o nível",
          "Aceite o termo e toque em \"Escolher meu parceiro\" ou \"Guardar minha vaga sem parceiro\"",
          "Busque o parceiro e toque em \"Convidar\" (ou convide por link)",
          "No pagamento, escolha Pix ou cartão — se for direto com o organizador, toque em \"Já paguei ao organizador\"",
        ],
        where: "Hub › Torneios e ligas › torneio",
        ctaLabel: "Ver torneios",
        destination: "torneios",
      },
      {
        id: "guia-convite-dupla",
        icon: "handshake",
        title: "Convite de dupla",
        summary: "Responda o convite e feche a dupla antes do prazo vencer.",
        description:
          "Quando alguém te chama para um torneio, o convite abre sozinho ao entrar no app e fica em \"Convites de dupla\" na Início, com o prazo. Aceite para formar a dupla e pagar sua parte, ou recuse.",
        steps: [
          "Abra o convite que aparece ao entrar no app ou em \"Convites de dupla\" na Início",
          "Confira torneio, categoria e sua parte e toque em \"Aceitar e formar dupla\"",
          "Aceite o termo, confirme o nível e, se pedir, o uniforme",
          "Em \"Convite aceito!\", toque em \"Continuar inscrição\" e pague sua parte",
          "Não vai jogar? Toque em \"Agora não, recusar convite\"",
        ],
        where: "Início › Convites de dupla",
      },
      {
        id: "guia-cancelar-inscricao",
        icon: "cancel",
        title: "Cancelar inscrição",
        summary: "Libere sua vaga ou peça o cancelamento ao organizador.",
        description:
          "Sem nenhum pagamento feito, você cancela direto e a vaga é liberada. Com pagamento, envia um pedido com o motivo ao organizador; a devolução é combinada com ele, fora do app.",
        steps: [
          "No torneio, toque em \"Minha inscrição\"",
          "Sem pagamento: toque em \"Cancelar\" e confirme em \"Cancelar inscrição\"",
          "Com pagamento: toque em \"Cancelar a inscrição da dupla\", escreva o motivo e toque em \"Enviar pedido\"",
          "Acompanhe o pedido e use \"Falar com o organizador\"",
        ],
        where: "Hub › Torneios e ligas › torneio › Minha inscrição",
      },
      {
        id: "guia-modo-focus",
        icon: "focus",
        imageUrl: IMAGES["modo-focus"],
        title: "Modo Focus no dia do jogo",
        summary: "Próximo jogo, grupo, chave e arena numa tela só.",
        description:
          "No dia do torneio, com inscrição paga, o app abre o Modo Focus sozinho: próxima partida com quadra e horário, classificação do grupo, chave, o que rola na arena e palpites.",
        steps: [
          "Abra o app no dia do torneio: o Focus entra sozinho (ou toque em \"Modo Focus\" na Início)",
          "Em \"Agora\", veja jogo, quadra e horário — quando te chamarem, toque em \"Estou indo pra quadra\"",
          "Use a barra para ver \"Grupo\", \"Chave\", \"Arena\" e \"Palpites\"",
          "Toque no \"×\" para sair",
        ],
        where: "Início › Modo Focus (no dia do torneio)",
      },
      {
        id: "guia-campanha-story",
        icon: "story",
        title: "Campanha no story",
        summary: "Poste sua inscrição ou sua campanha no torneio.",
        description:
          "Ao confirmar a inscrição, gere um card para o story. Quando sua participação acaba, o Modo Focus oferece o story da campanha, com placar, trajetória, dupla e torneio.",
        steps: [
          "Inscrição: na tela \"Confirmado\", toque em \"Compartilhar no story\"",
          "Campanha: no Modo Focus › \"Agora\", ao fim da sua participação, toque em \"Postar campanha no story\"",
          "Escolha o fundo (foto na hora ou da galeria) e o que mostrar",
          "Toque em \"Postar no story\" ou \"Salvar imagem\"",
        ],
        where: "Modo Focus › Agora",
      },
      {
        id: "guia-ranking",
        title: "Ranking",
        summary: "Veja sua posição e os pontos da temporada por esporte.",
        description:
          "Classificação de atletas e equipes com pódio, sua posição em destaque e busca. Filtre por esporte, temporada, gênero, nível e formato e toque num nome para abrir o perfil.",
        steps: [
          "No \"Hub\", toque em \"Ranking\"",
          "Alterne entre \"Atletas\" e \"Equipes\"",
          "No filtro, escolha esporte, temporada, gênero e nível e toque em \"Aplicar filtros\"",
          "Toque no ícone de informação para ver \"Como funciona o ranking\"",
        ],
        where: "Hub › Ranking",
        ctaLabel: "Ver ranking",
        destination: "ranking",
      },
      {
        id: "guia-equipes",
        title: "Duplas e equipes",
        summary: "Encontre duplas da comunidade e siga as que te interessam.",
        description:
          "Busque pelo nome da equipe ou de um atleta, filtre por esporte e gênero e ordene por ranking, mais próximas ou em alta. No perfil da dupla: atletas, jogos, títulos, histórico e confrontos.",
        steps: [
          "No \"Hub\", toque em \"Equipes\"",
          "Busque em \"Nome da equipe ou atletas\"",
          "Toque em \"Ordenar\" ou no filtro de esporte e gênero",
          "Abra uma dupla para ver o perfil e toque em \"Seguir\"",
        ],
        where: "Hub › Equipes",
        ctaLabel: "Ver equipes",
        destination: "duplas",
        imageUrl: IMAGES["equipes"],
      },
    ],
  },
  {
    id: "treinos",
    title: "Treinos",
    topics: [
      {
        id: "guia-aulas",
        title: "Encontrar aulas e treinos",
        summary: "Ache arenas, CTs e professores perto de você e agende a experimental.",
        description:
          "Uma lista com arenas que têm turma, centros de treinamento e professores, do mais perto ao mais longe. Compare turmas, horários, vagas e planos e agende a aula experimental quando o local oferece.",
        steps: [
          "No \"Hub\", abra o card \"Aulas e treinos\"",
          "Filtre por \"Arenas\", \"CTs\" ou \"Professores\" ou use \"Filtros\"",
          "Abra um local para ver turmas, planos, professores e onde fica",
          "Na turma, toque em \"Agendar\" (experimental), \"Quero entrar\" ou \"Lista de espera\"",
          "Em \"Agendar experimental\", escolha o dia e o horário",
        ],
        where: "Hub › Aulas e treinos",
        ctaLabel: "Ver aulas",
        destination: "aulas",
      },
      {
        id: "guia-meus-treinos",
        title: "Meus treinos",
        summary: "Treinos de professor, arena e CT juntos, com presença e pagamento.",
        description:
          "O painel do aluno com o próximo treino, a agenda e os lugares onde você treina. Confirme presença, faça check-in na hora da aula e veja ou pague mensalidades e faturas.",
        steps: [
          "Na Início, toque no atalho \"Treinos\"",
          "Na aula, toque em \"Vou\" ou \"Não vou\" (avisando antes, pode virar crédito de reposição)",
          "Na hora, toque em \"Fazer check-in\" ou \"Ler QR da quadra\"; no CT, mostre a \"Carteirinha\"",
          "Em \"Meus planos\" › \"Pagamentos\", pague a mensalidade com Pix ou cartão",
        ],
        where: "Início › Treinos",
        ctaLabel: "Meus treinos",
        destination: "treinos",
      },
      {
        id: "guia-mensagens",
        icon: "chat",
        title: "Falar com professor e centro",
        summary: "Converse com seu professor e a recepção do CT pelo app.",
        description:
          "A caixa \"Mensagens\" reúne seus professores, a recepção e os professores do centro de treinamento, e as conversas que a arena abrir. Antes de ser aluno, arena e CT atendem pelo WhatsApp.",
        steps: [
          "Toque no ícone de mensagens no topo da Início ou em \"Mensagens\" em Meus treinos",
          "Toque em \"+\" e escolha um professor ou um centro de treinamento",
          "No centro, escolha \"Recepção e gestão\" ou um professor das suas turmas",
          "Ainda não é aluno? No perfil do professor, toque em \"Pedir contato\"",
        ],
        where: "Início › Mensagens",
        ctaLabel: "Meus treinos",
        destination: "treinos",
      },
      {
        id: "guia-avaliar-aula",
        icon: "star",
        title: "Avaliar uma aula",
        summary: "Dê estrelas para a aula, o professor e o local.",
        description:
          "Depois de um treino com presença, o app pergunta \"Como foi o treino?\". Avalie aula, professor e local (na particular, só o professor) em até 7 dias; com nota baixa, dá para pedir retorno da gestão.",
        steps: [
          "Em Meus treinos, toque numa estrela do card \"Como foi o treino?\"",
          "Dê de 1 a 5 estrelas para cada parte e escolha as tags",
          "Se quiser, escreva um comentário e ligue \"Mostrar meu nome\"",
          "Toque em \"Enviar avaliação\" — dá para editar em \"Mais\" › \"Minhas avaliações\"",
        ],
        where: "Meus treinos › Como foi o treino?",
        ctaLabel: "Meus treinos",
        destination: "treinos",
      },
    ],
  },
  {
    id: "mais",
    title: "Loja e indicação",
    topics: [
      {
        id: "guia-loja",
        title: "Loja nexaGO",
        summary: "Compre, personalize com nome e número e pague com Pix.",
        description:
          "A vitrine da nexaGO, com retirada grátis na arena ou entrega em casa. Personalize com nome, número ou imagem, salve favoritos, pague com Pix e acompanhe e avalie seus pedidos.",
        steps: [
          "Toque na aba \"Loja\" e navegue pelas categorias ou busque",
          "No produto, toque em \"Personalizar\" para pôr nome, imagem ou número",
          "Toque em \"Adicionar\", abra o carrinho e escolha \"Retirar na arena\" ou \"Entregar\"",
          "Toque em \"Pagar com Pix\" e use \"Copiar código Pix\"",
          "Em \"Meus pedidos\", acompanhe o status e veja o código de retirada",
        ],
        where: "Aba Loja",
        ctaLabel: "Abrir a Loja",
        destination: "loja",
      },
      {
        id: "guia-convidar-amigos",
        title: "Convide um amigo",
        summary: "Compartilhe seu código e ganhe +50 XP quando o amigo jogar.",
        description:
          "Seu código pessoal de indicação. O amigo informa o código ao criar a conta e, quando ele joga a primeira partida, você ganha XP.",
        steps: [
          "Toque no seu avatar na Início e abra \"Configurações\"",
          "Toque em \"Convidar amigos\"",
          "Compartilhe a mensagem pronta ou copie \"Seu código de indicação\"",
          "O amigo usa o código ao criar a conta e joga a 1ª partida",
        ],
        where: "Configurações › Convidar amigos",
        ctaLabel: "Convidar amigos",
        destination: "indicar",
      },
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
    console.log("  (doc não existe — a Central de ajuda abre vazia)");
    return;
  }
  for (const c of current.categories || []) {
    const titles = (c.topics || []).map((t) => t.title).join(" · ");
    console.log(`  ${c.title}: ${titles}`);
  }
}

async function run() {
  printCurrent(await readCurrent());
  if (SHOW_ONLY) return;

  if ((await db.doc(SOURCE_PATH).get()).exists) {
    console.error(`\n${SOURCE_PATH} existe: a Central de ajuda já é editada pelo backoffice ` +
      "(App do atleta › Central de ajuda). Edite por lá — gravar aqui seria desfeito no próximo save.");
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

  const ids = CATEGORIES.flatMap((c) => c.topics.map((t) => t.id));
  if (new Set(ids).size !== ids.length) {
    console.error("\nHá ids de guia repetidos.");
    process.exit(1);
  }
  console.log("\nSeria gravado:");
  printCurrent({categories: CATEGORIES});

  if (!APPLY) {
    console.log("\nDRY-RUN. Nada foi gravado. Rode de novo com --yes para aplicar.");
    return;
  }

  await db.doc(DOC_PATH).set({
    categories: CATEGORIES,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("\nGravado.");
  printCurrent(await readCurrent());
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
