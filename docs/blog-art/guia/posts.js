/**
 * Rascunhos da categoria "Guia do app" do blog (09/11/2026).
 * Capas: docs/blog-art/guia/capas/*.jpg (1600×900). Corpo: docs/blog-art/guia/*.webp (render.sh).
 * `img(nome)` devolve a URL pública da imagem já enviada ao Storage.
 *
 * As regras citadas foram conferidas no código em 09/11/2026 (how_it_works_rules.dart, ranking_constants.dart,
 * sand_rank_catalog.dart, athlete_home_focus_card.dart, focus_section.dart, seed-app-guide.js). Mudou a regra,
 * revise o post.
 */
// Autor "nexaGO" (blogAuthors, criado por ../autor/save-author.js): o save copia nome, função e foto do cadastro.
const AUTHOR = {id: "3AApFYt4luE9r09mIVsN", name: "nexaGO", role: "Equipe nexaGO"};
const BASE = {
  category: "guia",
  sport: "all",
  author: AUTHOR,
  channels: {app: true, site: true},
  featured: false,
  push: {enabled: false, city: null, sport: "all"},
  status: "draft",
  publishAt: null,
};

const P = (text) => ({type: "paragraph", text});
const H = (text) => ({type: "heading", text});
const L = (...items) => ({type: "list", items});
const Q = (text) => ({type: "quote", text});
const IMG = (url, caption) => ({type: "image", url, caption});

module.exports = (img) => [
  // ── 1. Modo Focus ───────────────────────────────────────────────────────────────────────────────────────
  {
    ...BASE,
    key: "focus",
    cover: "capa-guia-modo-focus.jpg",
    title: "Modo Focus: seu dia de torneio inteiro numa tela só",
    subtitle: "Contagem para a partida, chamada da mesa, grupo, chave e palpites. Como entrar, o que cada aba mostra e como deixar o Focus abrir sozinho.",
    slug: "modo-focus-dia-de-torneio-numa-tela-so",
    seoDescription: "Guia do Modo Focus do nexaGO: contagem para a sua partida, chamada da mesa, grupo, chave, arena e palpites numa tela só.",
    tags: ["modo focus", "torneios", "dia de jogo"],
    cta: {label: "Ver torneios", destination: "torneios", url: null},
    body: [
      P("Dia de torneio tem um ritmo próprio. Você aquece, confere a chave, procura a quadra, olha o grupo, pergunta para alguém se a mesa já chamou. E, no meio de tudo isso, a cabeça sai do jogo.\n\nO Modo Focus existe para acabar com esse vai e vem. No dia em que você joga, o app deixa o resto de lado e mostra só o que importa para a sua próxima partida."),
      H("Onde ele aparece"),
      P("No dia do torneio, com a inscrição paga, surge um card no topo da Início com quanto falta para a sua próxima partida, a quadra, o número do jogo e a dupla adversária. Para entrar, deslize o botão laranja até o fim: \"Deslize para o Modo Focus\"."),
      P("Se a organização ainda não definiu o horário, o card avisa que está aguardando o horário da mesa. E quando chega a sua vez, ele muda de cara: vira \"Chamado pela mesa\", com a quadra em destaque."),
      IMG(img("focus"), "À esquerda, o card da Início no dia do jogo. À direita, o Modo Focus com a chamada da mesa e o seu grupo."),
      H("As cinco abas do Focus"),
      L(
        "Agora: a sua próxima partida, com quadra e horário. É aqui que a chamada da mesa aparece.",
        "Grupo: a classificação do seu grupo, com a sua dupla em destaque.",
        "Chave: o caminho até a final, do mata-mata ao pódio.",
        "Arena: o que está rolando nas outras quadras do evento.",
        "Palpites: aposte em quem vence (sem dinheiro). Acertar um palpite vale XP, e acertar o campeão vale ainda mais.",
      ),
      H("Quando a mesa chamar"),
      P("É o momento em que mais se perde tempo num torneio. No Focus, a chamada sobe para o topo da aba Agora com a quadra em letras grandes (\"Vá para a Quadra 3 agora\") e um botão \"Estou indo\". Um toque e a mesa sabe que você está a caminho. Sem correr atrás de ninguém, sem ficar de ouvido no alto-falante."),
      H("Joga em mais de uma categoria?"),
      P("Se você está inscrito em duas categorias do mesmo torneio, aparece um seletor no topo do Focus para trocar entre elas. Por padrão, o app mostra a categoria da sua próxima partida."),
      H("Quer que ele abra sozinho?"),
      P("Por padrão, o Focus espera você deslizar. Se preferir que ele já abra no dia do torneio, ligue \"Abrir o Modo Focus sozinho\" em Configurações › Preferências. A escolha vale para o aparelho em que você ligou. Para sair a qualquer momento, toque no \"×\" no canto da tela."),
      H("Acabou? Leve a campanha para o story"),
      P("Quando a sua participação termina, a aba Agora oferece \"Postar campanha no story\": um card com placar, trajetória, dupla e torneio. Escolha o fundo (foto na hora ou da galeria) e poste direto ou salve a imagem."),
      Q("Dia de torneio é para jogar. O resto, o Focus organiza."),
    ],
  },

  // ── 2. Chuva ────────────────────────────────────────────────────────────────────────────────────────────
  {
    ...BASE,
    key: "chuva",
    cover: "capa-guia-chuva.jpg",
    title: "Choveu? Como a previsão, o Modo chuva e o crédito protegem o seu jogo",
    subtitle: "Do card de previsão na reserva ao crédito descontado na próxima partida: tudo o que o nexaGO faz quando o tempo fecha.",
    slug: "choveu-previsao-modo-chuva-e-credito",
    seoDescription: "Veja a previsão do tempo da sua reserva, remarque sem custo quando a arena liberar por chuva e use o crédito na próxima reserva.",
    tags: ["chuva", "reservas", "crédito de chuva"],
    cta: {label: "Ver minhas reservas", destination: "minhas-reservas", url: null},
    body: [
      P("Quem joga na areia sabe: o céu muda de ideia rápido. Até pouco tempo atrás, chuva significava grupo agitado no WhatsApp, ligação para a arena e dinheiro no limbo.\n\nNo nexaGO, o tempo faz parte da reserva, da previsão ao crédito. Você sabe exatamente o que acontece com o seu horário e com o seu dinheiro."),
      H("1. A previsão do seu horário, não da cidade"),
      P("Toda reserva de pé mostra o card \"Previsão do tempo\", com a chance de chuva hora a hora, de 2 horas antes do início até 2 horas depois do fim. As horas do seu jogo ficam em destaque, junto com a temperatura e o céu no começo da partida."),
      P("A previsão aparece a partir de 14 dias antes e some quando o jogo acaba. E quem você convidou para a quadra também vê."),
      IMG(img("chuva"), "A previsão hora a hora na reserva, o aviso do Modo chuva e o crédito descontado na reserva seguinte."),
      H("2. Quando a arena libera o horário"),
      P("Se chover, a arena pode ativar o Modo chuva e liberar as reservas pagas do período. Você recebe um aviso e, na reserva, aparece o card \"Modo chuva ativo\". Toque em \"Remarcar ou guardar crédito\" e escolha:"),
      L(
        "Remarcar sem custo: escolha outro dia e horário dentro do prazo da arena (quando ela permite) e toque em \"Confirmar remarcação\". Se o novo horário custar mais, a diferença é paga na arena.",
        "Guardar crédito: o valor fica guardado para a sua próxima reserva naquela arena.",
        "Manter minha reserva: vai jogar mesmo assim? É só manter.",
      ),
      P("Não escolheu em 24 horas? O valor vira crédito sozinho, sem você perder nada. Se a chuva começar no meio do jogo, você recebe crédito do tempo que faltava. Já a reserva que não foi paga pelo app é apenas cancelada."),
      H("3. Pedir o cancelamento você mesmo"),
      P("Em arenas que aceitam pedidos, o botão \"Choveu? Pedir cancelamento sem custo\" aparece na reserva a partir de 24 horas antes do jogo, até o prazo definido pela arena. Ela analisa o pedido, e em algumas a aprovação é automática quando a previsão passa de 70% de chance e 2 mm de chuva."),
      P("Enquanto o pedido está em análise, a sua reserva segue de pé: dá para falar com a arena pelo WhatsApp ou desistir do pedido. Aprovado, é só escolher entre remarcar ou guardar crédito. Recusado, o motivo aparece na própria reserva."),
      H("4. Usando o crédito de chuva"),
      P("O crédito vale na arena onde choveu, com a validade que ela definiu, e o app avisa 7 dias antes de vencer. Na próxima reserva por lá, \"Usar crédito de chuva\" já vem ligado na confirmação e o valor sai do total. Se cobrir tudo, a reserva sai paga."),
      L(
        "Pagando o restante no Pix, o valor mínimo é de R$ 5.",
        "Cancelou antes do jogo? O crédito usado volta para você.",
        "Saldo e validade ficam em Configurações › Créditos de chuva.",
      ),
      Q("Chuva deixou de ser prejuízo e dor de cabeça. Agora é só um horário que muda de lugar."),
    ],
  },

  // ── 3. Inscrição em torneio ─────────────────────────────────────────────────────────────────────────────
  {
    ...BASE,
    key: "inscricao",
    cover: "capa-guia-inscricao-torneio.jpg",
    title: "Do convite à quadra: como se inscrever num torneio pelo app",
    subtitle: "Categoria, dupla, pagamento e story de inscrito em poucos toques, com ou sem parceiro definido.",
    slug: "como-se-inscrever-num-torneio-pelo-app",
    seoDescription: "Passo a passo para se inscrever num torneio no nexaGO: escolher a categoria, convidar a dupla ou guardar a vaga e pagar com Pix ou cartão.",
    tags: ["torneios", "inscrição", "dupla"],
    cta: {label: "Ver torneios", destination: "torneios", url: null},
    body: [
      P("Torneio bom enche rápido. Muitas vezes, a diferença entre jogar e ficar de fora são alguns minutos. Por isso a inscrição no nexaGO foi pensada para caber numa tela só: você escolhe a categoria, resolve a dupla e paga sem sair do app."),
      H("Encontre o torneio"),
      P("No Hub, toque em \"Torneios e ligas\" e use a busca ou os filtros para achar o evento certo. Abra o torneio para ver datas, local, categorias e vagas."),
      H("Passo a passo"),
      L(
        "Toque em \"Inscrever minha dupla\" e confirme a categoria e o seu nível.",
        "Aceite o termo do torneio.",
        "Defina a dupla: toque em \"Escolher meu parceiro\", busque pelo nome ou apelido e toque em \"Convidar\". Se preferir, convide por link.",
        "Ainda sem parceiro? Toque em \"Guardar minha vaga sem parceiro\" e convide depois.",
        "Pague com Pix ou cartão. Se o pagamento for direto com o organizador, toque em \"Já paguei ao organizador\".",
      ),
      IMG(img("inscricao"), "Categoria, dupla e confirmação: a inscrição inteira cabe em três telas."),
      H("Guarde a vaga antes de fechar a dupla"),
      P("Torneio quase lotado e o parceiro ainda decidindo? Guarde a sua vaga sozinho. Para garanti-la de vez, você pode pagar o valor integral da dupla: quando o parceiro aceitar o convite, ele entra sem pagar nada."),
      P("Fique de olho no prazo: inscrição sem pagamento tem um tempo para ser paga e, se ele vencer, a vaga volta a ficar livre para outra dupla."),
      H("Recebeu um convite de dupla?"),
      P("Quando alguém te chama para um torneio, o convite abre sozinho ao entrar no app e fica em \"Convites de dupla\", na Início, com o prazo para responder. Confira o torneio, a categoria e a sua parte do valor e toque em \"Aceitar e formar dupla\". Depois, aceite o termo, confirme o nível (e o uniforme, se o torneio pedir) e pague a sua parte."),
      P("Não vai dar? Toque em \"Agora não, recusar convite\" e o seu parceiro fica livre para chamar outra pessoa."),
      H("Inscrito? Avise a galera"),
      P("Na tela \"Confirmado\", toque em \"Compartilhar no story\" para gerar o card da sua inscrição. Escolha o fundo, com uma foto na hora ou da galeria, e poste direto ou salve a imagem."),
      H("E se não der para ir?"),
      P("Sem nenhum pagamento feito, você cancela direto em \"Minha inscrição\" e a vaga é liberada. Com pagamento, envie um pedido de cancelamento com o motivo ao organizador; a devolução é combinada com ele."),
      Q("Categoria, dupla e pagamento numa tela só. O resto é treino."),
    ],
  },

  // ── 4. Jogo com a galera ────────────────────────────────────────────────────────────────────────────────
  {
    ...BASE,
    key: "galera",
    cover: "capa-guia-jogo-com-a-galera.jpg",
    title: "Da reserva ao story: o jogo com a galera do começo ao fim",
    subtitle: "Reserve a quadra, complete o time por link, registre o placar e guarde cada pelada no seu histórico.",
    slug: "da-reserva-ao-story-jogo-com-a-galera",
    seoDescription: "Como reservar quadra no nexaGO, chamar amigos por link, lançar o placar, postar o resultado no story e guardar as peladas no histórico.",
    tags: ["reservas", "peladas", "story", "placar"],
    cta: {label: "Reservar quadra", destination: "reservar", url: null},
    body: [
      P("O melhor jogo da semana quase sempre começa com um \"bora amanhã?\" no grupo. O nexaGO cuida de tudo o que vem depois: achar a quadra, fechar o time, registrar o placar e transformar o resultado em story."),
      H("1. Reserve em segundos"),
      P("Na aba Reservar, as arenas aparecem num mapa com lista. Escolha data e hora ou busque a arena pelo nome, toque em \"Reservar\" no card e escolha o dia, a quadra e o horário. Marque o esporte e escolha como pagar: na arena ou online, com Pix ou cartão, conforme o que a arena aceita."),
      H("2. Complete o time"),
      P("Com a reserva feita, abra o card dela na Agenda. Em \"Sua equipe\", toque em \"Convidar jogadores\": mande o link do jogo no grupo ou busque atletas do nexaGO pelo nome ou apelido. Quem aceitar primeiro ocupa a vaga, até 4 jogadores contando você, e o jogo entra na Agenda de todo mundo."),
      IMG(img("galera"), "Reserva, convite por link e placar confirmado: o ciclo completo de uma pelada no app."),
      P("Bônus: todos os convidados veem a previsão do tempo da reserva. Ninguém chega na arena de surpresa."),
      H("3. Poste antes e depois"),
      P("No card da reserva, \"Postar no story\" gera uma arte do jogo marcado, perfeita para cobrar presença. Depois que a partida começa, aparece \"Postar resultado\"."),
      H("4. Um placar que vale"),
      P("No pós-jogo, quem reservou toca em \"Editar placar\", monta os times e os sets e salva. Os outros jogadores recebem o placar para \"Confirmar placar\" ou \"Contestar\". Confirmado, a pelada entra no histórico de todos."),
      H("5. O seu histórico de peladas"),
      P("Todas as partidas ficam em Configurações › Histórico de partidas, na aba \"Peladas\". E cada jogo na quadra que você reservou vale 50 XP no seu elo, contados quando o horário termina."),
      Q("Reservar, chamar, jogar, postar. A parte difícil fica com a bola."),
    ],
  },

  // ── 5. Nível, elo e ranking ─────────────────────────────────────────────────────────────────────────────
  {
    ...BASE,
    key: "ranking",
    cover: "capa-guia-ranking-nivel-elo.jpg",
    title: "Nível, elo e ranking: entenda as três réguas do seu jogo",
    subtitle: "Qual mede a sua habilidade, qual mede o quanto você joga e qual mede os seus resultados em torneio. E como subir em cada uma.",
    slug: "nivel-elo-e-ranking-como-funciona",
    seoDescription: "Entenda nível, elo e ranking no nexaGO: como os pontos de torneio são calculados, como ganhar XP e como pedir revisão de nível.",
    tags: ["ranking", "nível", "elo", "xp"],
    cta: {label: "Ver ranking", destination: "ranking", url: null},
    body: [
      P("No seu perfil do nexaGO convivem três números diferentes, e cada um conta uma história. O nível diz em que faixa você joga. O elo mostra o quanto você está em quadra. O ranking registra o que você conquistou em torneios.\n\nEntender a diferença é o primeiro passo para subir nos três."),
      IMG(img("ranking"), "O ranking da temporada, a tabela de pontos por fase e a trilha de elos."),
      H("Nível: a sua faixa de habilidade"),
      P("O nível define em que categorias você pode jogar, em quatro faixas: Iniciante, Intermediário, Avançado e Open. No vôlei de praia e no vôlei de quadra, cada partida move o seu rating, e a aba Nível da tela \"Como funciona\" mostra os seus pontos, quantos faltam para subir e a sua evolução ao longo do tempo."),
      P("Acha que o seu nível não reflete o seu jogo? Na mesma tela, toque em \"Pedir revisão à equipe\" e fale com a gente."),
      H("Elo: o quanto você joga"),
      P("O elo sobe com XP, e XP vem de estar em quadra e na comunidade. A trilha vai de Iniciante a Lenda, passando por Competidor, Desafiante, Elite e Mestre, cada um com três divisões. O que rende XP:"),
      L(
        "Jogo na quadra que você reservou: +50 XP, contados quando o horário termina.",
        "Cada partida vencida em torneio: +50 XP.",
        "Missões do dia: de 15 a 40 XP cada.",
        "Conquistas: de 15 a 120 XP, uma vez cada.",
        "Indicar um amigo que joga pela primeira vez: +50 XP.",
        "Convite para jogar aceito: +20 XP para quem convidou.",
        "Avaliar arena ou torneio e acertar palpites: +10 XP. Acertar o campeão: +30 XP.",
      ),
      H("Ranking: o que você conquista em torneios"),
      P("O ranking soma os pontos da temporada, por esporte. Cada torneio paga pela fase que você alcança, e o valor é multiplicado pelo peso da categoria. Na tabela base (categoria Open, peso ×1):"),
      L(
        "Título: 1.000 pontos.",
        "Vice: 800. 3º lugar: 600. 4º lugar: 500.",
        "Quartas de final (5º ao 8º): 330.",
        "Oitavas de final (9º ao 16º): 200.",
        "16-avos de final (17º ao 32º): 130.",
        "Participação: 100.",
      ),
      P("O peso muda com a categoria: Iniciante ×0,125, Intermediário ×0,25, Avançado ×0,5, Open ×1 e Elite ×1,2. Ou seja, um título no Intermediário vale 250 pontos, e no Elite, 1.200. Na categoria Livre, o peso é medido pela força das duplas inscritas."),
      P("O tamanho da chave também conta: com 8 ou mais duplas pagas vale a tabela inteira; de 4 a 7, ×0,6; com menos de 4, ×0,25."),
      H("Quem está no topo agora"),
      {type: "ranking", sport: "beachVolleyball", mode: "athletes", gender: "all"},
      H("Onde ver tudo isso"),
      P("No Hub, toque em \"Ranking\" para ver a classificação de atletas e equipes, com pódio e a sua posição em destaque. Filtre por esporte, temporada, gênero e nível. Toque no ícone de informação para abrir \"Como funciona\", com as abas Nível, Elo e XP e Ranking, sempre com as regras em vigor."),
      Q("Nível é onde você está. Elo é o quanto você joga. Ranking é o que você conquista."),
    ],
  },
];
