import {
  Activity,
  Ban,
  CalendarClock,
  ClipboardList,
  Flame,
  Globe,
  History,
  Home,
  Mail,
  Medal,
  MonitorPlay,
  QrCode,
  Search,
  Share2,
  Shirt,
  Sparkles,
  Target,
  UserPlus,
  Users,
} from 'lucide-react';
import type { DocAudience } from './types';

export const ATLETAS: DocAudience = {
  id: 'atletas',
  label: 'Atletas',
  surface: 'App nexaGO (iOS e Android) · portal atleta.nexago.com.br',
  tagline: 'Tudo o que o atleta faz no nexaGO',
  description:
    'Do cadastro à final: como encontrar torneios, fechar a dupla, pagar a inscrição, acompanhar o dia de jogo no Modo Focus, subir no ranking e reservar quadra. O app é a superfície principal do atleta; o portal web (atleta.nexago.com.br) complementa com tela grande para inscrições, mesa e compartilhamento.',
  hero: { src: '/app/atletas.png', alt: 'Tela inicial do app nexaGO para atletas, com torneio em destaque e missões' },
  groups: [
    {
      title: 'Primeiros passos',
      features: [
        {
          id: 'conta-e-cadastro',
          title: 'Conta e cadastro',
          icon: UserPlus,
          summary: 'Criar a conta é gratuito e leva poucos minutos — você só paga a inscrição dos torneios em que decidir competir.',
          body: [
            'Baixe o app na App Store ou na Play Store e crie sua conta com e-mail e senha ou com login social (Google e Apple). O onboarding tem três passos: seu esporte principal, seu nível nele e o perfil básico — foto (obrigatória, com recorte circular), nome, data de nascimento, gênero, cidade e UF. Apelido, WhatsApp e código de indicação são opcionais nessa hora.',
            'O nível é declarado numa escada de 7 degraus com descrições honestas — de "Iniciante 1 · estou começando" a "Open · disputo torneios competitivos". Escolha com cuidado: até a sua primeira inscrição você ajusta livremente; depois, o nível daquele esporte só sobe.',
            'O WhatsApp é verificado por SMS (código de 6 dígitos) e pode ficar para depois — mas é um dos três requisitos para competir. O acesso a torneios oficiais exige cadastro concluído, WhatsApp verificado e cidade no perfil; enquanto faltar algo, um banner "Passos pendentes" mostra exatamente o que falta, com o atalho para resolver.',
          ],
          rules: [
            'Obrigatórios no cadastro: foto, nome, data de nascimento, gênero, cidade e UF.',
            'Para se inscrever em torneios: cadastro concluído + WhatsApp verificado por SMS + cidade no perfil.',
            'Quem tem mais de um papel (atleta, organizador, gestor de arena) escolhe como entrar — e troca depois em Configurações.',
            'Um convite recebido por link não se perde: o app guarda o destino e retoma depois do cadastro.',
          ],
          keywords: ['criar conta', 'cadastro', 'onboarding', 'login', 'google', 'apple', 'foto', 'whatsapp', 'sms', 'verificação', 'passos pendentes'],
          screen: {
            kind: 'mock',
            frame: 'phone',
            alt: 'Tela de cadastro do app com campos de nome, cidade e nível',
            screen: {
              eyebrow: 'Cadastro',
              title: 'Monte seu perfil de atleta',
              blocks: [
                { kind: 'field', label: 'Nome completo', value: 'Ana Souza' },
                { kind: 'field', label: 'Cidade / UF', value: 'Goiânia · GO' },
                { kind: 'field', label: 'Nascimento', value: '14/03/1996' },
                { kind: 'heading', label: 'Seu nível no beach tennis' },
                { kind: 'tabs', items: ['Iniciante', 'Intermediário', 'Avançado'], active: 1 },
                { kind: 'button', label: 'Continuar' },
              ],
            },
          },
        },
        {
          id: 'inicio-do-app',
          title: 'Início — o hub do atleta',
          icon: Home,
          summary: 'A primeira tela do app reúne seu próximo torneio, suas inscrições em andamento, missões diárias e os atalhos do dia.',
          body: [
            'O Início mostra, em destaque, o próximo torneio da sua agenda com a contagem regressiva e o status da sua inscrição. Logo abaixo vêm os torneios e ligas abertos perto de você, a lista "Meus torneios" com o estado de cada inscrição (por exemplo, "Pagamento pendente") e as missões diárias que rendem XP.',
            'No portal web, o painel equivalente concentra ainda mais: entrada no Modo Focus quando você tem jogo hoje, cards de campanha prontos para compartilhar, convites de dupla com aceite rápido, sua próxima reserva de quadra, gráfico de evolução dos últimos 12 meses e o feed da comunidade.',
            'A navegação do app vive na barra inferior: Início, Agenda, Reservar, Competir e Comunidade. No portal, o menu lateral traz o grupo "Meu jogo" completo — e, para quem também opera torneios, o grupo "Operação" com a Mesa.',
          ],
          keywords: ['home', 'painel', 'hub', 'missões', 'xp', 'meus torneios'],
          screen: {
            kind: 'image',
            frame: 'phone',
            src: '/app/atletas.png',
            alt: 'Tela inicial do app nexaGO: torneio em destaque com contagem regressiva, lista de torneios e ligas, inscrição com pagamento pendente e missões diárias',
          },
        },
        {
          id: 'perfil-e-niveis',
          title: 'Perfil, esportes e níveis',
          icon: Medal,
          summary: 'Seu perfil concentra foto, apelido, conquistas, XP e o nível em cada esporte — e o nível só sobe, nunca desce.',
          body: [
            'No perfil você edita foto (PNG/JPG até 2 MB), nome, apelido (que aparece no perfil público no lugar do nome completo), cidade, uma bio na seção "Sobre" e uma galeria de destaques com suas melhores fotos de jogo. Conquistas desbloqueadas e a barra de XP mostram sua evolução na plataforma.',
            'Em "Esportes e níveis" você gerencia o nível declarado em cada esporte numa escada de 7 degraus: Iniciante 1 e 2, Intermediário 1 e 2, Avançado 1 e 2 e Open. O nível é por esporte — um dos esportes é o principal, e você pode adicionar outros a qualquer momento.',
            'O nível é a base do sistema anti-sandbagging do nexaGO: na primeira inscrição de cada esporte o app pede uma confirmação explícita ("Após a inscrição, o nível só poderá subir") — depois disso, o nível daquele esporte não desce mais (corrigir um nível travado é caso de suporte). Resultados em torneios podem promover você de degrau, e o organizador do torneio também pode promover — nunca rebaixar.',
            'Completar o perfil vale a pena: os cinco passos (foto, esporte e nível, cidade, WhatsApp, objetivos) rendem XP, e fechar todos desbloqueia o badge "Perfil completo" e o acesso a torneios oficiais.',
          ],
          rules: [
            'O nível de cada esporte trava na primeira inscrição ativa — a partir daí, só sobe.',
            'Você se inscreve na sua categoria ou acima dela, nunca abaixo.',
            'O apelido substitui o nome completo no perfil público; o nome real fica com você e com os organizadores.',
            'Perfil pode ser público ou privado — e você escolhe o que os outros veem (conquistas, próximas reservas, parceiros frequentes).',
          ],
          keywords: ['nível', 'iniciante', 'intermediário', 'avançado', 'open', 'sandbagging', 'apelido', 'conquistas', 'destaques'],
          screen: {
            kind: 'mock',
            frame: 'phone',
            alt: 'Tela de perfil com nível, XP e conquistas',
            screen: {
              eyebrow: 'Perfil',
              title: 'Ana Souza',
              chips: [
                { label: 'Beach tennis · principal', tone: 'brand' },
                { label: 'Intermediário 2', tone: 'neutral' },
              ],
              blocks: [
                { kind: 'stats', items: [{ label: 'Nível', value: 'LV 7' }, { label: 'XP', value: '40/100' }, { label: 'Conquistas', value: '12/30' }] },
                { kind: 'heading', label: 'Esportes e níveis' },
                { kind: 'row', title: 'Beach tennis', sub: 'Intermediário 2', chip: { label: 'Principal', tone: 'brand' } },
                { kind: 'row', title: 'Vôlei de praia', sub: 'Iniciante 2' },
                { kind: 'button', label: 'Adicionar esporte' },
              ],
              bottomNav: 'Início',
            },
          },
        },
        {
          id: 'perfil-publico',
          title: 'Perfil público e link compartilhável',
          icon: Globe,
          summary: 'Cada atleta tem um perfil público com estatísticas reais, histórico de partidas e um link pronto para compartilhar.',
          body: [
            'O perfil público mostra capa, foto com o selo de nível, cidade, esporte principal, barra de XP, estatísticas de jogo, conquistas, as duplas e equipes ativas, o histórico de partidas com placares reais e a sua disponibilidade para combinar jogos avulsos. Outros atletas podem te seguir.',
            'O botão "Copiar link" gera o endereço público do seu perfil. Quem abre o link precisa entrar (ou criar uma conta) para ver — uma proteção deliberada contra raspagem de dados. Quem se cadastra a partir do seu link cai direto no seu perfil depois do cadastro, sem se perder no caminho.',
            'Tudo que aparece ali é atividade real registrada na plataforma — placares, campanhas e conquistas vêm dos torneios que você jogou, não de números autodeclarados.',
          ],
          rules: [
            'O link público exige login para visualizar — perfis não ficam expostos à internet aberta.',
            'Link inválido ou perfil tornado privado mostram uma página de erro clara (código PERFIL_404).',
            'Mensagens diretas e "desafios" ficaram deliberadamente de fora do perfil público.',
          ],
          keywords: ['perfil público', 'compartilhar perfil', 'seguir', 'link'],
        },
        {
          id: 'notificacoes-e-seguranca',
          title: 'Notificações, privacidade e segurança',
          icon: Sparkles,
          summary: 'Você escolhe como e quando o nexaGO te encontra — e o que da sua conta fica visível.',
          body: [
            'As preferências de notificação separam canais (push, WhatsApp, e-mail) e assuntos: reservas e jogos (com lembretes antes do horário), convites de outros atletas, conquistas e XP, quadras livres no seu horário e promoções. A janela "Não perturbe" silencia tudo numa faixa de horário sua.',
            'Em privacidade, o perfil pode ser público ou privado, e você controla o que os outros veem — conquistas e nível, próximas reservas, parceiros frequentes. Em segurança: bloqueio por biometria ao abrir o app, troca de senha e a lista de sessões ativas por dispositivo, com remoção.',
            'A exclusão de conta existe e é definitiva: perfil, preferências e notificações são apagados (registros de torneios e pagamentos podem ser retidos por exigência legal).',
          ],
          keywords: ['notificações', 'push', 'não perturbe', 'privacidade', 'biometria', 'sessões', 'excluir conta', 'senha'],
        },
      ],
    },
    {
      title: 'Torneios e inscrições',
      features: [
        {
          id: 'encontrar-torneios',
          title: 'Encontrar torneios e ligas',
          icon: Search,
          summary: 'Uma lista viva dos torneios e ligas abertos para você, com filtros por categoria, formato e preço.',
          body: [
            'Na aba Competir (app) ou em Torneios (portal), você vê os eventos abertos com data, arena, cidade e os selos que importam: "Inscrições abertas", "Últimas vagas", "Ao vivo". Os filtros recortam por categoria (masculino, feminino, misto), formato (dupla ou individual), faixa de preço e apenas torneios abertos.',
            'A página de cada torneio traz a visão geral completa: categorias com preço por dupla ou por atleta, prêmio total em disputa, regulamento, local com rota até a arena e os selos de pagamento ("Pagamento seguro no app (PIX)" ou "Pagamento combinado direto com o organizador"). Etapas de liga mostram também a temporada e o ranking acumulado.',
            'Dali mesmo sai o botão "Inscrever minha dupla" — que abre o fluxo de inscrição já na categoria escolhida.',
          ],
          keywords: ['buscar torneio', 'etapa', 'liga', 'filtros', 'inscrições abertas', 'regulamento', 'premiação'],
          screen: {
            kind: 'mock',
            frame: 'phone',
            alt: 'Lista de torneios abertos com filtros e selos de status',
            screen: {
              eyebrow: 'Competir',
              title: 'Torneios e ligas',
              blocks: [
                { kind: 'search', placeholder: 'Buscar torneio ou cidade…' },
                { kind: 'tabs', items: ['Todos', 'Misto', 'Masculino', 'Feminino'], active: 0 },
                { kind: 'row', title: 'Open Goiânia Beach Volley', sub: 'Arena CFC · 24/10', chip: { label: 'Abertas', tone: 'win' } },
                { kind: 'row', title: 'Liga nexaGO · Etapa 2', sub: 'Goiânia · 08/11', chip: { label: 'Últimas vagas', tone: 'pending' } },
                { kind: 'row', title: 'Copa VH de Beach Tennis', sub: 'Aparecida · 15/11', chip: { label: 'Ao vivo', tone: 'live' } },
              ],
              bottomNav: 'Competir',
            },
          },
        },
        {
          id: 'inscricao-em-torneios',
          title: 'Inscrição — solo, dupla e equipe',
          icon: ClipboardList,
          summary: 'A vaga é reservada assim que você confirma; a dupla ou a equipe se completa depois, com convites.',
          body: [
            'A inscrição acontece numa tela única com passos numerados — categoria, uniforme (quando o torneio exige) e a sua inscrição — e um resumo sempre visível com o que falta. O mesmo fluxo existe no app e no portal, com os mesmos passos e as mesmas regras.',
            'Em categorias de dupla, você reserva a sua vaga primeiro e convida o parceiro em seguida, buscando pelo nome. Em categorias por equipe (trio, quarteto ou quinteto), você dá um nome à equipe, reserva a vaga como capitão e convida os demais atletas — o app indica a composição exigida por gênero quando a categoria é mista.',
            'Antes de confirmar, o app valida sua elegibilidade na categoria e explica qualquer bloqueio com clareza: nível abaixo do seu (o anti-sandbagging não deixa você jogar "para baixo"), nível mínimo não atingido, gênero incompatível, fora da faixa etária, categoria lotada ou encerrada. Se a categoria estiver cheia, você pode entrar na lista de espera.',
            'Se você fechar o app no meio do caminho, nada se perde: a inscrição pendente aparece no Início com uma trilha de progresso ("Categoria → Uniforme → Dupla → Pagamento → Confirmada") e a frase exata do que falta — "Falta parceiro", "Falta o pagamento", "Elenco 2/3".',
          ],
          flows: [
            {
              title: 'Inscrição em dupla, do zero à vaga confirmada',
              steps: [
                {
                  title: 'Escolha a categoria',
                  detail: 'Compare preços e requisitos de cada categoria. As que você não pode jogar aparecem desabilitadas com o motivo (nível, gênero, idade, lotada).',
                },
                {
                  title: 'Confirme seu nível (só na primeira vez)',
                  detail: 'Na primeira inscrição de cada esporte, o app pede a confirmação do nível declarado — depois dela, o nível só sobe.',
                },
                {
                  title: 'Aceite o termo de uso de imagem',
                  detail: 'O termo LGPD é obrigatório para criar a inscrição. O resumo mostra "Termo LGPD: aceito".',
                },
                {
                  title: 'Reserve sua vaga',
                  detail: 'Sua vaga na categoria fica reservada na hora — antes mesmo de ter parceiro.',
                  state: { label: 'Vaga reservada', tone: 'pending' },
                },
                {
                  title: 'Convide seu parceiro',
                  detail: 'Busque pelo nome e envie o convite. Enquanto ele não responde, a inscrição mostra "aguardando resposta" — e você pode cancelar o convite e chamar outra pessoa.',
                  state: { label: 'Aguardando parceiro', tone: 'pending' },
                },
                {
                  title: 'Parceiro aceita',
                  detail: 'Ele confirma o próprio uniforme (se houver) e aceita o termo. A dupla está fechada; falta só o pagamento.',
                  state: { label: 'Falta o pagamento', tone: 'pending' },
                },
                {
                  title: 'Pagamento',
                  detail: 'Cada um paga a sua parte (ou um paga o valor integral). Com o valor completo, a inscrição confirma sozinha.',
                  state: { label: 'Confirmada', tone: 'win' },
                },
              ],
              outcome: 'Dupla confirmada na categoria, aparecendo nas chaves quando o organizador sortear — e com o card de inscrição liberado para compartilhar nos stories.',
            },
            {
              title: 'Inscrição por equipe (trio, quarteto, quinteto)',
              steps: [
                {
                  title: 'Nomeie a equipe',
                  detail: 'Escolha a categoria por equipe e dê um nome com 3 a 30 caracteres (ex.: "Trio Calango").',
                },
                {
                  title: 'Reserve a vaga como capitão',
                  detail: 'A equipe nasce com você no elenco e a vaga da categoria reservada.',
                  state: { label: 'Elenco 1/3', tone: 'pending' },
                },
                {
                  title: 'Convide o elenco',
                  detail: 'Só o capitão convida. Convites pendentes ocupam vaga do elenco — cancele um convite para chamar outro atleta. Categorias mistas indicam a composição por gênero exigida.',
                  state: { label: 'Aguardando elenco', tone: 'pending' },
                },
                {
                  title: 'Elenco completo, pagamento',
                  detail: 'Cada integrante paga a própria cota (ou alguém adianta o valor integral). Integrante pode sair da equipe enquanto a própria cota não estiver paga.',
                  state: { label: 'Confirmada', tone: 'win' },
                },
              ],
            },
          ],
          rules: [
            'Você só se inscreve na sua categoria ou acima dela — nunca abaixo do seu nível.',
            'Categorias com gênero fixo aceitam só atletas do gênero correspondente; sem gênero no perfil, é preciso completar antes de aceitar convite.',
            'Categorias com faixa etária validam a data de nascimento do perfil.',
            'Categoria lotada oferece lista de espera; encerrada não aceita mais inscrições.',
            'O termo LGPD (uso de imagem) é obrigatório para se inscrever e para aceitar convites.',
            'Inscrição iniciada e não concluída pode ser retomada de onde parou, pelo Início.',
          ],
          keywords: ['inscrever', 'inscrição', 'dupla', 'trio', 'quarteto', 'quinteto', 'equipe', 'capitão', 'lista de espera', 'vaga', 'elegibilidade', 'lgpd'],
          screen: {
            kind: 'mock',
            frame: 'phone',
            alt: 'Tela de inscrição com passos numerados e resumo da vaga',
            screen: {
              eyebrow: 'Inscrever-se',
              title: 'Open Goiânia · Mista B',
              chips: [{ label: 'Vaga reservada', tone: 'pending' }],
              blocks: [
                { kind: 'heading', label: 'Passo 3 · Sua dupla' },
                { kind: 'search', placeholder: 'Buscar atleta por nome…' },
                { kind: 'row', title: 'Bruno Lima', sub: 'Goiânia · Intermediário 2', chip: { label: 'Convidar', tone: 'brand' } },
                { kind: 'row', title: 'Carla Reis', sub: 'Convite enviado', chip: { label: 'Aguardando', tone: 'pending' } },
                { kind: 'heading', label: 'Resumo' },
                { kind: 'stats', items: [{ label: 'Categoria', value: 'Mista B' }, { label: 'Sua parte', value: 'R$ 90' }] },
              ],
            },
          },
        },
        {
          id: 'convites-de-dupla',
          title: 'Convites de dupla e de equipe',
          icon: Mail,
          summary: 'Convites chegam em tempo real, com prazo para responder — e quem ainda não tem conta entra pelo link do WhatsApp.',
          body: [
            'Quando alguém te chama para uma dupla ou equipe, o convite aparece na hora: notificação no app, sino e card no painel — e, ao entrar no portal, um anúncio abre o convite na sua frente com tudo o que você precisa decidir: categoria, data, arena, a sua parte da taxa e o prazo para responder, com uma barra de tempo enchendo.',
            'Dali você aceita ("Aceitar e formar dupla"), recusa, pede para ver depois ou abre os detalhes do torneio sem responder. Aceitar leva você pelo mesmo caminho de qualquer inscrição: termo LGPD, confirmação de nível (se for sua primeira vez no esporte) e uniforme quando exigido.',
            'Se o seu parceiro ainda não tem conta no nexaGO, o botão "Convidar pro nexaGO" gera um link personalizado para mandar pelo WhatsApp. O link traz a pessoa para a plataforma — quando ela se cadastrar, é só buscar o nome dela e enviar o convite de verdade.',
          ],
          flows: [
            {
              title: 'Do convite ao aceite',
              steps: [
                { title: 'O convite chega', detail: 'Notificação no app + anúncio no portal, com a idade do convite ("agora", "há 2 h") e o prazo para responder.', state: { label: 'Pendente', tone: 'pending' } },
                { title: 'Avalie os fatos', detail: 'Categoria, quando, onde e quanto custa a sua parte — tudo no próprio convite. "Ver detalhes" abre o torneio sem responder.' },
                { title: 'Aceite', detail: 'Termo LGPD → confirmação de nível (primeira inscrição no esporte) → uniforme se exigido. O portal te leva direto à tela da inscrição.', state: { label: 'Dupla fechada', tone: 'win' } },
                { title: 'Ou deixe expirar', detail: 'Convite com prazo vence sozinho e libera a vaga do elenco para o capitão chamar outra pessoa.', state: { label: 'Expira no prazo', tone: 'live' } },
              ],
            },
          ],
          rules: [
            'Quem convida pode chamar várias pessoas ao mesmo tempo — o primeiro que aceitar fecha a vaga, e os outros convites caem sozinhos.',
            'Convites têm prazo de expiração, e a vaga fica reservada enquanto o convite espera resposta.',
            'Com vários convites pendentes, o anúncio mostra um por vez — o mais antigo primeiro (mais perto de expirar).',
            'Convite que chega com a tela aberta não interrompe o que você está fazendo (ex.: um pagamento).',
            'O link de WhatsApp não fecha a dupla sozinho — ele só traz o parceiro para a plataforma.',
          ],
          keywords: ['convite', 'parceiro', 'whatsapp', 'aceitar', 'recusar', 'expira', 'prazo'],
          screen: {
            kind: 'mock',
            frame: 'phone',
            alt: 'Anúncio de convite de dupla com prazo e botão de aceite',
            screen: {
              eyebrow: 'Novo convite · há 12 min',
              title: 'Bruno te chamou pra dupla',
              blocks: [
                { kind: 'stats', items: [{ label: 'Categoria', value: 'Mista B' }, { label: 'Quando', value: 'sáb · 24 out' }] },
                { kind: 'stats', items: [{ label: 'Onde', value: 'Arena CFC' }, { label: 'Sua parte', value: 'R$ 90' }] },
                { kind: 'row', title: 'Restam 2 dias pra responder', sub: 'Depois o convite expira', chip: { label: 'Prazo', tone: 'pending' } },
                { kind: 'button', label: 'Aceitar e formar dupla' },
              ],
            },
          },
        },
        {
          id: 'uniforme',
          title: 'Uniforme do torneio',
          icon: Shirt,
          summary: 'Tamanho, número e nome na camisa — cada atleta escolhe o seu, e a escolha salva sozinha.',
          body: [
            'Em torneios com camisa oficial, o card "Uniforme" entra como passo da inscrição. Você escolhe o tamanho da regata (PP a XGG, conforme a grade da categoria), o tamanho do shorts quando o uniforme é completo, o número na camisa (1–99) e o nome que vai estampado (até 18 caracteres).',
            'Não existe botão de salvar: cada escolha grava sozinha, com o selo de estado ao lado do título ("Salvando…", "Salvo", "Pendente"). Se a gravação falhar, sua escolha continua na tela e um aviso oferece tentar de novo.',
            'O uniforme é individual — cada integrante da dupla ou equipe preenche o seu. Enquanto o seu estiver incompleto, o app trava o envio de convite e o aceite, com o erro apontado dentro do próprio card.',
          ],
          rules: [
            'Tamanho e número podem ser trocados até 7 dias antes do evento.',
            'Uniforme incompleto bloqueia convidar parceiro e aceitar convite naquela categoria.',
            'Antes de a vaga existir, a escolha viaja junto com a reserva da vaga.',
          ],
          keywords: ['camisa', 'regata', 'shorts', 'tamanho', 'número', 'nome na camisa'],
        },
        {
          id: 'pagamento-da-inscricao',
          title: 'Pagamento da inscrição',
          icon: QrCode,
          summary: 'PIX na plataforma com confirmação automática — ou pagamento direto com o organizador, informado por você.',
          body: [
            'Cada torneio define como recebe. No modo com pagamento pela plataforma, você escolhe pagar a sua parte (o total dividido pelo elenco) ou o valor integral, informa CPF ou CNPJ e gera um PIX com QR Code e código copia-e-cola. A confirmação é automática assim que o PIX cai — sem comprovante, sem espera.',
            'No modo de pagamento direto, o app mostra o PIX do próprio organizador (QR, código e nome do recebedor) e o atalho "Combine com" no WhatsApp dele. Depois de pagar no seu banco, você toca em "Já paguei ao organizador" e confirma — ele é avisado para conferir o recebimento e dar baixa. Guarde o comprovante até a confirmação sair.',
            'Categorias gratuitas pulam o dinheiro, mas não a confirmação: cada atleta confirma a própria inscrição, e a dupla é validada quando os dois confirmarem.',
            'Um detalhe que ajuda a fechar dupla: quem paga o valor integral sozinho, antes mesmo de ter parceiro, garante a vaga — e o parceiro convidado entra sem pagar nada.',
          ],
          flows: [
            {
              title: 'PIX pela plataforma',
              steps: [
                { title: 'Escolha o valor', detail: '"Minha parte" (total ÷ elenco) ou "Integral". O resumo mostra exatamente o que você paga agora.' },
                { title: 'Informe CPF ou CNPJ', detail: 'Necessário para gerar a cobrança PIX no seu nome.' },
                { title: 'Gere o PIX', detail: 'QR Code + código copia-e-cola, com contagem de expiração. Sua vaga fica reservada enquanto o código vale.', state: { label: 'Aguardando PIX', tone: 'pending' } },
                { title: 'Pague no app do banco', detail: 'A confirmação é automática quando o PIX cai. Código expirado? Gere outro na mesma tela.', state: { label: 'Sua parcela paga', tone: 'win' } },
                { title: 'A inscrição confirma sozinha', detail: 'Pagou só a sua parte? Agora é com o parceiro — quando a parte dele cair, a inscrição confirma sem mais nenhum toque.', state: { label: 'Confirmada', tone: 'win' } },
              ],
            },
            {
              title: 'Pagamento direto com o organizador',
              steps: [
                { title: 'Copie o PIX do organizador', detail: 'QR Code, código e o nome de quem recebe, na própria tela de pagamento.' },
                { title: 'Pague pelo seu banco', detail: 'A transferência acontece fora do nexaGO, direto para o organizador.' },
                { title: 'Informe o pagamento', detail: '"Já paguei, informar pagamento" pede uma confirmação deliberada — isso avisa o organizador e não dá para desfazer pelo app.', state: { label: 'Pagamento informado', tone: 'pending' } },
                { title: 'O organizador confere e dá baixa', detail: 'Guarde o comprovante até lá. Quando ele confirmar, a inscrição fecha.', state: { label: 'Confirmada', tone: 'win' } },
              ],
            },
          ],
          rules: [
            'No PIX da plataforma a confirmação é automática; no pagamento direto, quem confirma é o organizador (a vaga fica pré-reservada até lá).',
            'A inscrição só confirma quando o valor completo entra — cada atleta paga a sua parte, ou alguém paga o integral.',
            'A taxa de plataforma da inscrição é fixa: R$ 2,00.',
            'O código PIX continua acessível depois — útil para mandar ao parceiro.',
            'A plataforma não processa estornos de pagamento direto; reembolso é combinado com o organizador.',
          ],
          keywords: ['pix', 'pagar', 'pagamento', 'qr code', 'cpf', 'minha parte', 'integral', 'já paguei', 'comprovante', 'gratuita'],
          screen: {
            kind: 'mock',
            frame: 'phone',
            alt: 'Tela de pagamento PIX com QR code e contagem de expiração',
            screen: {
              eyebrow: 'Pagamento',
              title: 'Sua parte: R$ 90,00',
              chips: [{ label: 'Vaga reservada por 29:59', tone: 'pending' }],
              blocks: [
                { kind: 'tabs', items: ['Minha parte', 'Integral'], active: 0 },
                { kind: 'pix' },
                { kind: 'row', title: 'Confirmação automática', sub: 'Assim que o PIX cair no banco' },
                { kind: 'button', label: 'Copiar código PIX' },
              ],
            },
          },
        },
        {
          id: 'cancelamento-de-inscricao',
          title: 'Cancelamento de inscrição',
          icon: Ban,
          summary: 'Sem pagamento, você cancela na hora; com pagamento, o pedido vai para o organizador decidir.',
          body: [
            'Enquanto nenhum valor foi pago, o cancelamento é imediato e por sua conta: o app confirma que a vaga será liberada para outro atleta e encerra a inscrição ali mesmo — direto do Início ou da aba "Minha inscrição" do torneio.',
            'Depois de qualquer pagamento (seu ou do parceiro), o botão vira "Solicitar cancelamento": você explica o motivo em até 500 caracteres e o pedido vai para o organizador. Ele pode aceitar (a inscrição é cancelada) ou recusar com uma justificativa, que aparece para você.',
            'Importante: a plataforma não faz o estorno. Reembolsos seguem a política divulgada por cada organizador e são combinados diretamente com ele — o app oferece o atalho "Falar com o organizador" no WhatsApp.',
          ],
          flows: [
            {
              title: 'Pedido de cancelamento (inscrição paga)',
              steps: [
                { title: 'Solicite o cancelamento', detail: 'Na aba "Minha inscrição", descreva o motivo e envie o pedido.', state: { label: 'Solicitado', tone: 'pending' } },
                { title: 'O organizador decide', detail: 'Ele vê o pedido no painel, com o seu motivo, e aprova ou recusa.', state: { label: 'Em análise', tone: 'pending' } },
                { title: 'Resposta', detail: 'Aprovado: a vaga é liberada e vocês combinam o reembolso fora da plataforma. Recusado: a inscrição é mantida e a justificativa aparece para você.' },
              ],
            },
          ],
          rules: [
            'Cancelamento direto só existe enquanto não há nenhum pagamento na inscrição.',
            'O reembolso é tratado entre você e o organizador — o nexaGO não movimenta estornos.',
          ],
          keywords: ['cancelar', 'cancelamento', 'desistir', 'reembolso', 'estorno'],
        },
      ],
    },
    {
      title: 'No dia do jogo',
      features: [
        {
          id: 'modo-focus',
          title: 'Modo Focus',
          icon: Target,
          summary: 'No dia do torneio, o app inteiro dá lugar a uma tela só: sua próxima partida, sua jornada e sua chave.',
          body: [
            'O Modo Focus é a casca de dia de jogo do nexaGO. Quando você tem partida no dia, o app e o portal entram nele automaticamente (uma vez por dia de jogo) — e o banner "Hoje tem torneio" fica sempre à mão para voltar. Dentro do Focus, o resto da navegação some: sobram as abas do torneio.',
            'A aba "Agora" mostra o que importa neste minuto, por ordem de urgência: o chamado da mesa ("Você foi chamado — Quadra 3 liberada. Vai agora."), sua partida ao vivo com o placar do momento, ou a próxima partida com contagem regressiva, quadra e o lembrete de W.O. por atraso. Abaixo, a ordem completa do seu dia e os avisos do organizador.',
            'A aba "Jornada" (Trajetória, na web) conta sua campanha: o caminho até a final com cada fase e placar, seus números no torneio (sets, pontos, gráfico por set), quem pode cruzar com você no mata-mata e o que o torneio muda na sua premiação — na dupla eliminatória, ela mostra até suas "vidas" (Vencedores · Repescagem). A aba "Grupo" (ou "Chave", conforme o formato) traz a classificação ao vivo com cenários de rodada ("se VENCE… se PERDE…"), o cruzamento no mata-mata e o "Onde é o quê" com a sua quadra.',
            'No app, o Focus tem ainda duas seções extras: "Arena", com o torneio inteiro ao vivo (o que está em quadra e a fila de todas as quadras), e "Palpites", o bolão da torcida. Tudo é construído para aguentar quadra: botões grandes, informação direta, check-in na própria tela.',
          ],
          flows: [
            {
              title: 'Um dia de torneio dentro do Focus',
              steps: [
                { title: 'Entrada automática', detail: 'No primeiro acesso do dia de jogo, o app abre direto no Focus. Dá para sair e voltar quando quiser.' },
                { title: 'Próxima partida', detail: 'Horário, contagem regressiva, quadra e melhor-de. "Como chegar" abre a rota até a arena.', state: { label: 'Em 45 min', tone: 'neutral' } },
                { title: 'Chamado da mesa', detail: 'Quando a quadra libera, o Focus grita: "Você foi chamado". O botão "Ok, estou indo" recolhe o alerta — quem te espera é a quadra, não o app.', state: { label: 'Chamado', tone: 'live' } },
                { title: 'Ao vivo', detail: 'Durante o jogo, o placar da mesa aparece em tempo real para quem te acompanha.', state: { label: 'Ao vivo', tone: 'live' } },
                { title: 'Entre jogos', detail: 'Resultado entra na Jornada; a aba Grupo recalcula os cenários; a Chave avança sozinha.' },
                { title: 'Fim de jornada', detail: '"Você não tem mais partidas pendentes" — ou "Campeão da categoria!", com o card de campanha pronto para os stories.', state: { label: 'Campeão', tone: 'win' } },
              ],
            },
          ],
          rules: [
            '"Ok, estou indo" só recolhe o alerta — não avisa a mesa.',
            'O mata-mata pendente avisa que confrontos e quadras saem conforme as partidas anteriores terminam.',
            'A chave e o grupo são os mesmos que o organizador vê — não há versão "atrasada" para o atleta.',
          ],
          keywords: ['focus', 'dia de jogo', 'chamado', 'quadra', 'jornada', 'trajetória', 'grupo', 'chave', 'cenários', 'wo'],
          screen: {
            kind: 'mock',
            frame: 'phone',
            alt: 'Modo Focus com chamado para a quadra e ordem do dia',
            screen: {
              eyebrow: 'Focus · Dia 2 de 3',
              title: 'Você foi chamado',
              chips: [{ label: 'Quadra 3 liberada', tone: 'live' }],
              blocks: [
                { kind: 'button', label: 'Ok, estou indo' },
                { kind: 'tabs', items: ['Agora', 'Jornada', 'Grupo', 'Chave'], active: 0 },
                { kind: 'heading', label: 'Ordem do seu dia' },
                { kind: 'row', title: 'vs. Pedro & Lucas', sub: '09h00 · Quadra 2', chip: { label: 'Vitória 2–0', tone: 'win' } },
                { kind: 'row', title: 'vs. Rafa & Duda', sub: 'Agora · Quadra 3', chip: { label: 'Chamado', tone: 'live' } },
                { kind: 'row', title: 'Semifinal', sub: 'Sem horário definido' },
              ],
            },
          },
        },
        {
          id: 'partida-e-ponto-a-ponto',
          title: 'Detalhe da partida e ponto a ponto',
          icon: Activity,
          summary: 'Cada partida tem página própria: placar, parciais, a campanha das duas duplas e o jogo ponto a ponto como a mesa marcou.',
          body: [
            'O detalhe da partida mostra as duas duplas com fotos, o placar de sets, os chips de parciais e o selo de estado ("Ao vivo" ou "Encerrada"). Abaixo vêm as parciais com barras proporcionais, como cada dupla chegou até ali no torneio e o cruzamento seguinte ("Quem vencer pega X na semifinal — sáb 14h · Quadra 2").',
            'O bloco "Ponto a ponto" reconta o set exatamente como a mesa marcou: blocos de sequência com horário, o placar acumulado em cada ponto e as marcações de virada, empate e set point — mais um resumo do set com a maior sequência e a duração.',
            'Uma regra de honestidade sustenta tudo: o nexaGO nunca inventa ponto. Se um set entrou pelo placar final, o bloco diz "a mesa não marcou ponto a ponto nele"; se a mesa começou a marcar no meio do set, os pontos sem registro são declarados ("+7 pontos sem registro").',
          ],
          keywords: ['partida', 'placar', 'parciais', 'ponto a ponto', 'set', 'virada', 'ao vivo'],
          screen: {
            kind: 'mock',
            frame: 'phone',
            alt: 'Detalhe de partida ao vivo com placar por sets',
            screen: {
              eyebrow: 'Quartas de final · Mista B',
              title: 'Ana & Bruno vs. Rafa & Duda',
              blocks: [
                { kind: 'score', teamA: 'Ana & Bruno', teamB: 'Rafa & Duda', sets: [['21', '18'], ['14', '12']], live: true },
                { kind: 'heading', label: 'Ponto a ponto · Set 2' },
                { kind: 'row', title: 'Sequência de 4 pontos', sub: '11–10 → 14–10 · virada' },
                { kind: 'row', title: 'Quem vencer pega Léo & Kim', sub: 'Semifinal · sáb 14h · Quadra 2' },
              ],
            },
          },
        },
        {
          id: 'palpites',
          title: 'Palpites da torcida',
          icon: Sparkles,
          summary: 'Aponte quem vence cada jogo do torneio e dispute o ranking da torcida — a final vale 4 pontos.',
          body: [
            'Na aba Palpites de cada torneio (e na 5ª aba do Focus, no app), qualquer pessoa inscrita ou torcendo aponta o vencedor de cada confronto. Acerto vale 1 ponto; o palpite da final também é o seu palpite de campeão e vale 4 (1 do jogo + 3 de bônus).',
            'Dá para trocar de ideia até a partida começar — depois disso o palpite fecha. Cada card mostra seu estado na hora: "Palpite salvo", "Você acertou · +4", "Você errou essa", "Palpite fechado", "Partida cancelada — não pontua".',
            'O ranking da torcida tem pódio, sua posição com variação e a lista completa — e sai como card de stories pelo botão "Compartilhar ranking".',
          ],
          rules: [
            'Acertos contam sobre o que já foi decidido, nunca sobre o total palpitado.',
            'Palpite fecha quando a partida começa; partida cancelada não pontua.',
          ],
          keywords: ['palpite', 'torcida', 'bolão', 'ranking da torcida', 'campeão'],
        },
        {
          id: 'compartilhamento',
          title: 'Cards e pôsteres para os stories',
          icon: Share2,
          summary: 'Inscrição, campanha, partida e ranking de palpites viram imagens 9:16 prontas para o Instagram e o WhatsApp.',
          body: [
            'O nexaGO desenha os cards no formato dos stories (1080×1920) com a arte do torneio: o card de inscrição sai com a dupla, a categoria, a vaga e a data; o de campanha conta sua trajetória fase a fase; o de partida tem duas artes — confronto (antes/ao vivo, com VS) e resultado (encerrada, com placar e parciais, e paleta própria de ouro e bronze para final e disputa de 3º); e o ranking de palpites compartilha a brincadeira da torcida.',
            'Em celulares, o botão abre a folha nativa de compartilhamento (Instagram, WhatsApp e o que mais estiver instalado); onde o navegador não suporta, o app oferece baixar a imagem para postar manualmente.',
            'Os cards só existem quando seriam verdade: o card de inscrição, por exemplo, só libera com a inscrição paga, o elenco fechado e fora da lista de espera — para nunca sair um "DUPLA CONFIRMADA" mentiroso.',
          ],
          rules: [
            'Card de inscrição: só com inscrição paga + elenco completo + fora da lista de espera.',
            'Cards de campanha no painel duram 5 dias após o torneio (máximo de 2 por vez); na aba "Minha inscrição" não expiram.',
            'A colocação no card (campeão, vice, 3º) só aparece com a partida encerrada e o vencedor definido.',
          ],
          keywords: ['story', 'stories', 'compartilhar', 'card', 'pôster', 'instagram', 'campanha'],
        },
      ],
    },
    {
      title: 'Evolução e comunidade',
      features: [
        {
          id: 'ranking',
          title: 'Ranking de atletas e duplas',
          icon: Medal,
          summary: 'Pontuação por campanha em torneios, atualizada toda semana, com filtros por esporte, nível, cidade, gênero e formato.',
          body: [
            'O ranking soma a sua campanha em cada torneio: campeão vale 100 pontos, vice 80, terceiro 60, quarto 50, eliminado no mata-mata antes da semi 33 e eliminado na fase de grupos 10. A classificação é atualizada semanalmente.',
            'Você alterna entre ranking individual e de duplas/equipes, entre o geral e a temporada do ano, e recorta por esporte, categoria de nível (Iniciante 1 a Open), cidade e gênero. No modo duplas há ainda o filtro de formato (dupla, trio, quarteto, quinteto).',
            'O pódio dos três primeiros aparece com foto; a lista completa traz posição, cidade, nível, pontos e a seta de tendência. O bloco "Sua posição" mostra onde você está no recorte atual — e clicar em qualquer atleta abre o perfil público dele.',
          ],
          rules: [
            'A busca dentro do ranking não renumera ninguém — a posição é sempre a do recorte completo.',
            'A pontuação aplica pesos por categoria; na categoria Livre, só pontua quem chega ao mata-mata, e chaves com menos de 8 duplas pagas pontuam reduzido.',
            'Torneios de desafio com menos de 10 duplas pagas não pontuam no ranking global.',
            'Equipes de 3 a 5 atletas pontuam no ranking de equipes pelo elenco.',
          ],
          keywords: ['ranking', 'pontos', 'temporada', 'pódio', 'classificação', '100 pontos', 'tendência'],
          screen: {
            kind: 'mock',
            frame: 'phone',
            alt: 'Ranking com pódio e classificação completa',
            screen: {
              eyebrow: 'Ranking',
              title: 'Beach tennis · Temporada 2026',
              blocks: [
                { kind: 'tabs', items: ['Individual', 'Duplas'], active: 0 },
                { kind: 'row', title: '1 · Marina Costa', sub: 'Goiânia · Open', chip: { label: '1.240 pts', tone: 'brand' } },
                { kind: 'row', title: '2 · Ana Souza', sub: 'Goiânia · Avançado 1', chip: { label: '1.105 pts', tone: 'neutral' } },
                { kind: 'row', title: '3 · Carla Reis', sub: 'Aparecida · Avançado 2', chip: { label: '980 pts', tone: 'neutral' } },
                { kind: 'heading', label: 'Sua posição' },
                { kind: 'row', title: '14 · Você', sub: 'Faltam 45 pts pro top 10', chip: { label: '▲ 2', tone: 'win' } },
              ],
              bottomNav: 'Competir',
            },
          },
        },
        {
          id: 'equipes',
          title: 'Equipes e duplas fixas',
          icon: Users,
          summary: 'Suas duplas e equipes têm perfil próprio: vitórias, sequência, títulos, elenco e posição no ranking de duplas.',
          body: [
            'Na área de Equipes você vê as suas duplas fixas e equipes com o retrospecto de cada uma — vitórias, derrotas, sequência atual, pontos, "juntos há quanto tempo", elenco e títulos — e busca parceiros novos com filtros de esporte e nível.',
            'O perfil da equipe é público e clicável a partir do ranking de duplas e dos perfis dos atletas, com o histórico de partidas da formação.',
          ],
          keywords: ['equipe', 'dupla fixa', 'parceiro', 'retrospecto'],
        },
        {
          id: 'historico',
          title: 'Histórico e estatísticas',
          icon: History,
          summary: 'Todos os seus jogos, reservas e pagamentos num lugar só — com exportação.',
          body: [
            'O Histórico consolida tudo o que você fez na plataforma em três abas — Torneios e Ligas, Reservas e Pagamentos — com os KPIs no topo: total de jogos, vitórias e aproveitamento, e total investido.',
            'Reservas concluídas oferecem a ação "Avaliar" (a nota alimenta a reputação da arena), e o botão "Exportar" baixa seus dados.',
          ],
          keywords: ['histórico', 'estatísticas', 'exportar', 'avaliar reserva', 'pagamentos'],
        },
        {
          id: 'comunidade-e-missoes',
          title: 'Missões, elos e comunidade',
          icon: Flame,
          summary: 'Missões diárias, sequência de dias ativos, uma trilha de 16 elos e um feed automático dos feitos da comunidade.',
          body: [
            'A tela de Desafios organiza a gamificação: missões diárias que resetam à meia-noite ("Jogue 1x hoje", "Reserve uma quadra", "Explore um torneio"…), cada uma com o seu XP; o desafio da semana; a sua sequência de dias ativos; e a liga semanal — um ranking de XP entre atletas.',
            'O XP alimenta a Trilha de Elos: 16 degraus de Iniciante III até Lenda, que medem o seu engajamento (diferente do nível técnico, que mede jogo). Subir de elo desbloqueia recompensas equipáveis — molduras de avatar, títulos como "Dono da Quadra" e perks como o Protetor de Sequência, um escudo mensal que impede um dia perdido de zerar sua sequência. Ninguém é rebaixado de elo, nunca.',
            'As Conquistas registram marcos reais ("Primeiro jogo", "5 jogos", "Semana cheia", "Conector — convide 3 amigos"), e a aba Comunidade traz um feed gerado pela própria plataforma: aberturas de inscrição e campeões de torneio da sua região. Não é rede social — não há postagem livre; o conteúdo nasce dos jogos. Convidar um amigo com o seu código de indicação também rende XP quando ele joga a primeira partida.',
          ],
          keywords: ['comunidade', 'feed', 'missões', 'xp', 'elo', 'trilha de elos', 'sequência', 'liga semanal', 'conquistas', 'convide um amigo', 'indicação', 'moldura', 'título'],
        },
        {
          id: 'bora-jogar',
          title: 'Bora Jogar — partidas amistosas',
          icon: Users,
          summary: 'Convide outro atleta para treino, amistoso ou teste de dupla — com horário, local e reputação de comparecimento.',
          body: [
            'O Bora Jogar organiza o jogo fora de torneio. Você encontra atletas na aba Descobrir (ordenada por compatibilidade, com filtros de esporte, objetivo, distância e "procurando dupla") e envia um convite com objetivo (treino, amistoso ou formar dupla), esporte, horário principal — e alternativos —, local (arena do catálogo ou "a combinar") e uma mensagem.',
            'Quem recebe pode aceitar ("Deu match! Jogo confirmado"), sugerir outro horário (contraproposta) ou recusar. O jogo confirmado entra na Agenda dos dois, com atalhos para reservar a quadra na arena e fazer o check-in de chegada.',
            'O sistema leva comparecimento a sério: cancelar perto do jogo ou terminar sem check-in afeta a sua reputação. Depois do jogo, os dois se avaliam — e a avaliação de um fica oculta até o outro avaliar também.',
          ],
          rules: [
            'Cancelar dentro da janela de penalidade afeta sua reputação; jogo encerrado sem check-in também.',
            'Com vários horários propostos, aceitar confirma o principal — para outro, use "Sugerir outro horário".',
            'Avaliações mútuas ficam ocultas até os dois enviarem.',
          ],
          keywords: ['bora jogar', 'amistoso', 'treino', 'convite para jogar', 'match', 'reputação', 'check-in'],
        },
      ],
    },
    {
      title: 'Quadras e reservas',
      features: [
        {
          id: 'reservar-quadra',
          title: 'Reservar quadra',
          icon: CalendarClock,
          summary: 'Busque arenas por esporte, dia e horário, compare preços e reserve a quadra em poucos toques.',
          body: [
            'A aba Reservar busca arenas parceiras em mapa e lista: filtre por esporte, data e hora (ou "flexível"), raio de distância, faixa de preço por hora, superfície, comodidades (coberta, estacionamento, vestiário, acessibilidade…), forma de pagamento e Score nexaGO mínimo. Cada arena mostra distância, nota das avaliações, preço "a partir de" e o próximo horário livre — e o coração salva as favoritas.',
            'Na grade de horários você escolhe dia, quadra e um ou mais blocos consecutivos. Horário lotado tem saída: entre na lista de espera — se alguém cancelar, você é avisado e tem 15 minutos para reservar antes de a vez passar ao próximo da fila — ou ative o alerta de vaga da quadra.',
            'Na confirmação entram cupom de desconto (opcional), observações, o resumo de valores com a taxa de plataforma e a forma de pagamento: pagar na arena (confirma agora, paga ao chegar) ou PIX pelo app — com a opção de pagar tudo ou só um sinal de 50% e o resto no local. No detalhe da reserva você confirma presença (+XP), faz check-in ao chegar, racha o valor com a equipe via PIX e adiciona ao calendário. Depois do jogo, o app pede sua avaliação da arena — que também rende XP.',
          ],
          flows: [
            {
              title: 'Da busca à quadra garantida',
              steps: [
                { title: 'Encontre a arena', detail: 'Busca com mapa, filtros e favoritas. Arenas do catálogo que ainda não aceitam reserva pelo app avisam isso claramente.' },
                { title: 'Escolha o horário', detail: 'Grade por dia e quadra, com blocos consecutivos e a duração mínima de cada quadra. Em horário de pico, a arena pode exigir reserva mínima maior (ex.: 2 h) — o app explica antes.', state: { label: 'Horário escolhido', tone: 'neutral' } },
                { title: 'Confirme', detail: 'Cupom, observações, resumo de valores e a forma de pagamento — na arena ou PIX (total ou sinal de 50%).' },
                { title: 'Pague o PIX (se for o caso)', detail: 'CPF do titular, QR Code com expiração e confirmação automática. PIX expirado cancela a reserva e devolve o horário à agenda.', state: { label: 'Aguardando PIX', tone: 'pending' } },
                { title: 'Quadra garantida', detail: '"Bora jogar!" — compartilhe a reserva, veja como chegar e confirme presença perto do horário.', state: { label: 'Confirmada', tone: 'win' } },
              ],
            },
          ],
          rules: [
            'Cancelamento grátis até 6 horas antes do horário; depois disso, a arena retém 50% do valor pago.',
            'Lista de espera: ao abrir vaga, você tem 15 minutos para reservar antes de passar a vez.',
            'PIX de reserva exige o CPF do titular; o sinal de 50% deixa o restante para pagar na arena.',
            'Cupom e promoção automática não acumulam — vale o maior desconto.',
            'Reserva de horário fixo semanal é gerenciada direto com a arena.',
          ],
          keywords: ['reservar', 'quadra', 'horário', 'arena', 'aluguel', 'agendar'],
          screen: {
            kind: 'image',
            frame: 'phone',
            src: '/app/arenas.png',
            alt: 'Tela Buscar horários do app: filtros de esporte, data e hora, e card de arena com preço por hora e botão Reservar',
          },
        },
        {
          id: 'clubinho',
          title: 'Clubinho — jogo aberto',
          icon: Users,
          summary: 'Sessões recorrentes de jogo aberto nas arenas: entre na lista, pague sua parte no PIX e apareça pra jogar.',
          body: [
            'O Clubinho é o jeito nexaGO de organizar o "jogo de toda semana": a arena cria a sessão recorrente ou avulsa, define dia, hora, quadras, vagas e valor por atleta, e os atletas entram na lista pelo app — direto do perfil da arena.',
            'Cada sessão mostra quem vai (a lista ao vivo), as vagas restantes e as regras de saída. Você garante a vaga pagando o PIX antecipado (aprovação na hora) ou, quando a arena permite, escolhendo pagar no local no dia. Sem grupo de WhatsApp para gerenciar presença e vaquinha.',
          ],
          rules: [
            'Com PIX antecipado, o nome só entra na lista após o pagamento; PIX expirado libera a vaga.',
            'Sair da lista dentro do prazo da sessão (ex.: até 24 h antes) devolve o valor com estorno automático; fora do prazo, é com a arena.',
            'Sessão cancelada pela arena estorna automaticamente todos os pagamentos confirmados.',
          ],
          keywords: ['clubinho', 'jogo aberto', 'racha', 'lista', 'sessão', 'estorno'],
        },
        {
          id: 'agenda',
          title: 'Agenda',
          icon: CalendarClock,
          summary: 'Tudo que vem aí — jogos de torneio, reservas de quadra e sessões de clubinho — numa linha do tempo só.',
          body: [
            'A Agenda junta seus compromissos de quadra numa linha do tempo com visão de dia e de mês: partidas de torneio (com quadra e horário quando definidos), reservas confirmadas, sessões de clubinho, jogos do Bora Jogar e desafios — cada um com o seu selo, e a marca "AGORA" cortando a timeline.',
            'O resumo do topo diz o que importa ("Você tem 2 jogos hoje · próximo em 40 min"), os filtros recortam por tipo, e cada item abre o detalhe correspondente. Dia vazio vira convite: reservar uma quadra, ver torneios — ou marcar como descanso.',
          ],
          keywords: ['agenda', 'compromissos', 'calendário', 'hoje', 'descanso'],
        },
      ],
    },
    {
      title: 'Operação — para quem também apita',
      features: [
        {
          id: 'mesa-do-atleta',
          title: 'Mesa de placar no portal do atleta',
          icon: MonitorPlay,
          summary: 'Atleta que também é mesário opera a mesa ponto a ponto sem sair do próprio portal.',
          body: [
            'Quando um organizador te adiciona à equipe de um torneio, o grupo "Operação → Mesa" aparece no seu menu (e vira um sexto item da barra inferior no celular). Ali ficam os torneios em andamento que você opera; cada um abre a lista de partidas com filtro por categoria e seções de ao vivo, a seguir e encerradas.',
            'A mesa é um placar de quadra em tela cheia: dois painéis gigantes, um por dupla — tocar no painel marca o ponto. O lado do saque fica aceso, o app avisa "SET POINT" e "MATCH POINT", o set fecha sozinho quando o placar valida e a chave avança automaticamente no fim. O botão "−" desfaz o último ponto (só do lado que o marcou), e a ferramenta "Placar" permite lançar um resultado que já aconteceu na areia sem marcar ponto a ponto.',
            'Tudo é em tempo real e do servidor: o que outra mesa (ou o painel do organizador) lança aparece na sua tela na hora, e recarregar a página nunca perde placar. Ferramentas de quadra completam a mesa: troca de saque, inversão visual dos lados, tempo técnico (2 por set, zera a cada set) e o modo exibição em tela cheia para virar o placar para o público.',
          ],
          flows: [
            {
              title: 'Operar uma partida na mesa',
              steps: [
                { title: 'Abra a partida', detail: 'A mesa só abre com os dois lados definidos na chave.', state: { label: 'Agendada', tone: 'neutral' } },
                { title: 'Inicie e defina o saque', detail: '"Iniciar partida" põe o jogo no ar; a faixa "Quem começa sacando?" grava o primeiro saque (sem marcar ponto).', state: { label: 'Ao vivo', tone: 'live' } },
                { title: 'Toque = ponto', detail: 'Cada toque no painel da dupla soma um ponto. O "−" desfaz o último ponto do lado correspondente.' },
                { title: 'O set fecha sozinho', detail: 'Quando o placar do set valida, o set encerra — não existe "fechar set" manual.' },
                { title: 'Fim de partida e validação', detail: 'No match point convertido, a partida encerra, a chave avança e o botão "Validar" registra o resultado na súmula.', state: { label: 'Validada', tone: 'win' } },
              ],
            },
          ],
          rules: [
            'A Mesa só aparece para quem é equipe de torneio em andamento.',
            'Mudar o formato da partida (set único ↔ melhor de 3) é do organizador — o mesário vê o chip travado.',
            'Não é possível reduzir o formato descartando sets já pontuados.',
            'Tempo técnico e inversão de lados são visuais — não entram na súmula.',
          ],
          keywords: ['mesa', 'mesário', 'placar', 'apitar', 'operar', 'súmula', 'saque', 'tempo técnico'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Mesa de placar em tela cheia com dois painéis de pontuação',
            screen: {
              eyebrow: 'Mesa · Quadra 3',
              title: 'Semifinal · Mista B',
              chips: [
                { label: 'Ao vivo', tone: 'live' },
                { label: 'Melhor de 3', tone: 'neutral' },
              ],
              blocks: [
                { kind: 'score', teamA: 'Ana & Bruno · saque', teamB: 'Rafa & Duda', sets: [['21', '18'], ['18', '16']], live: true },
                { kind: 'row', title: 'Toque no painel para marcar o ponto', sub: '"−" desfaz o último ponto do lado' },
                { kind: 'row', title: 'Set point', sub: 'Ana & Bruno fecham o set com o próximo ponto', chip: { label: 'Set point', tone: 'pending' } },
              ],
            },
          },
        },
      ],
    },
  ],
};
