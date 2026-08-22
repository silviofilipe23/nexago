import {
  Activity,
  Banknote,
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MonitorPlay,
  Network,
  Settings,
  Share2,
  Shirt,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import type { DocAudience } from './types';

export const ORGANIZADORES: DocAudience = {
  id: 'organizadores',
  label: 'Organizadores',
  surface: 'Painel web do organizador · nexago.com.br',
  tagline: 'O torneio inteiro num painel só',
  description:
    'Criar o torneio ou a liga, abrir inscrições, gerar as chaves, agendar os jogos por quadra, operar a mesa ponto a ponto, ligar o telão da arena e fechar o financeiro — sem planilha. Este guia percorre cada área do painel na ordem em que um evento acontece.',
  hero: { src: '/app/organizadores.png', alt: 'Tela de gerenciamento de torneio do nexaGO, com categorias, financeiro e partidas' },
  groups: [
    {
      title: 'Comece aqui',
      features: [
        {
          id: 'painel-do-organizador',
          title: 'Conta e painel',
          icon: LayoutDashboard,
          summary: 'O cadastro cria seu painel na hora — sem fila de aprovação — e o Início mostra a saúde de todos os seus eventos.',
          body: [
            'O cadastro de organizador pede nome, telefone, e-mail e senha, e libera o painel imediatamente. Na primeira entrada, o painel oferece as notificações do navegador — com elas, você é avisado de nova inscrição, pagamento e pedido de cancelamento mesmo com o painel em outra aba.',
            'O Início resume tudo: eventos ativos, inscritos, saldo disponível e jogos do dia, além da agenda dos próximos jogos e dos últimos avisos enviados. Em "Meus eventos", cada torneio aparece com a barra de inscritos, o status e a arrecadação — separada em dois canais: "Na plataforma" (Pix e cartão pelo app) e "Por fora" (direto com você), com o alerta em amarelo do que ainda está a conferir.',
            'O sino de notificações funciona em todas as telas, e clicar num aviso navega direto ao destino — uma nova inscrição, por exemplo, abre a tela de inscrições já com a dupla expandida.',
          ],
          keywords: ['cadastro organizador', 'painel', 'dashboard', 'notificações', 'meus eventos', 'arrecadação por canal'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Painel inicial do organizador com KPIs e lista de eventos',
            screen: {
              eyebrow: 'Painel do organizador',
              title: 'Início · Visão geral',
              blocks: [
                { kind: 'stats', items: [{ label: 'Eventos ativos', value: '3' }, { label: 'Inscritos', value: '212' }, { label: 'Saldo', value: 'R$ 8,4K' }, { label: 'Jogos hoje', value: '18' }] },
                { kind: 'row', title: 'Open Goiânia Beach Volley', sub: 'Inscritos 64/96', chip: { label: 'Abertas', tone: 'win' } },
                { kind: 'row', title: 'Copa Goiás · Etapa 3', sub: 'Inscritos 48/48', chip: { label: 'Em andamento', tone: 'live' } },
                { kind: 'row', title: 'Liga nexaGO 2026', sub: 'Etapas: 6', chip: { label: 'Publicada', tone: 'brand' } },
              ],
            },
          },
        },
        {
          id: 'criar-torneio',
          title: 'Criar torneio',
          icon: Trophy,
          summary: 'Um wizard de seis passos — identidade, local, categorias, inscrições, premiação e revisão — e o torneio está no ar.',
          body: [
            'O botão "Criar evento" pergunta o formato: torneio avulso (evento único, com chave e premiação próprias) ou liga/circuito (várias etapas com ranking somado). O wizard de torneio guia os seis passos e deixa salvar rascunho a qualquer momento — para salvar, bastam nome e datas.',
            'Você define esporte, nome, capa (16:9, até 5 MB) e descrição; arena, endereço, cidade, quadras disponíveis (1 a 20) e datas; as categorias (cada uma com chave, formato, vagas e preço próprios); a janela de inscrições e como você recebe; premiação, regulamento, uniforme e se o torneio vale pontos no ranking nexaGO.',
            'Na revisão, você escolhe a visibilidade — Público (aparece na busca e no Competir para todos) ou Por link (só quem tem o link vê e se inscreve) — e publica. Editar um torneio publicado usa o mesmo wizard, sem tirá-lo do ar.',
            'No recebimento, há dois modos: "Pelo app — Pix e cartão" (o atleta paga na inscrição e o repasse cai na sua carteira em D+2) ou "Direto com o organizador" (você informa sua chave PIX, o app só reserva a vaga e o atleta declara o pagamento para você conferir). Regras de vagas opcionais: lista de espera automática quando lotar e "confirmar dupla por convite" (a inscrição só conta quando o parceiro aceita).',
          ],
          flows: [
            {
              title: 'Do rascunho à publicação',
              steps: [
                { title: 'Identidade', detail: 'Esporte, nome, capa e descrição. Sem nome, o wizard não avança.' },
                { title: 'Local e datas', detail: 'Arena, endereço, UF/cidade, quadras disponíveis, início e fim (e o horário do 1º jogo, se quiser).' },
                { title: 'Categorias', detail: 'Adicione ao menos uma categoria. O preço padrão do torneio vale para todas que não definirem o próprio.' },
                { title: 'Inscrições', detail: 'Janela de abertura e fechamento — que não pode passar do início do torneio — e o modo de recebimento.' },
                { title: 'Premiação e regras', detail: 'Premiação em dinheiro (distribuição automática 50% / 31% / 19% entre 1º, 2º e 3º, ajustável), regulamento, uniforme e ranking.' },
                { title: 'Revisão e publicação', detail: 'Confira tudo, escolha Público ou Por link e publique.', state: { label: 'No ar', tone: 'win' } },
              ],
              outcome: 'Torneio publicado com inscrições abertas — os atletas já encontram o evento e o modal de compartilhar gera QR, link e texto de anúncio prontos.',
            },
          ],
          rules: [
            'Inscrições não podem fechar depois do início do torneio (nem antes da abertura).',
            'Com premiação em dinheiro ligada, toda categoria precisa de valores definidos para publicar.',
            'As "Regras padrão de evento" das Configurações preenchem torneios novos — sem alterar os já criados.',
            'Categorias com menos de 10 duplas pagas não pontuam no ranking nexaGO (viram desafio).',
          ],
          keywords: ['criar torneio', 'wizard', 'publicar', 'capa', 'visibilidade', 'por link', 'rascunho', 'd+2', 'premiação'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Wizard de criação de torneio no passo de categorias',
            screen: {
              eyebrow: 'Novo torneio · Passo 3 de 6',
              title: 'Categorias',
              blocks: [
                { kind: 'tabs', items: ['Identidade', 'Local', 'Categorias', 'Inscrições', 'Premiação', 'Revisão'], active: 2 },
                { kind: 'row', title: 'Masculina A', sub: 'Dupla · 16 vagas · R$ 180', chip: { label: 'Grupos + SE', tone: 'neutral' } },
                { kind: 'row', title: 'Mista B', sub: 'Dupla · 24 vagas · R$ 180', chip: { label: 'Grupos + SE', tone: 'neutral' } },
                { kind: 'button', label: 'Adicionar categoria' },
              ],
            },
          },
        },
        {
          id: 'categorias',
          title: 'Builder de categoria',
          icon: ListChecks,
          summary: 'Cada categoria tem disputa, gênero, faixa etária, nível, vagas, preço e formato próprios — montados num builder só.',
          body: [
            'A disputa vai de dupla a quinteto. Categorias de equipe ganham a opção de gênero "Livre" (qualquer composição) e, quando mistas, os contadores de homens e mulheres por equipe — vasos comunicantes que travam na soma do tamanho do time e exigem ao menos um de cada.',
            'A faixa etária vai de Livre a Sub-13…Sub-23 e +30…+60; o nível usa presets (Iniciante, Intermediário, Avançado, Open, Elite, Livre) — e quando há piso de nível, atletas sem nível declarado não conseguem se inscrever. Vagas vão de 2 a 64 (duplas andam de 2 em 2), com preço próprio ou o padrão do torneio; em equipes, cada atleta paga a própria cota ou um paga o valor cheio.',
            'O formato define o sistema de disputa: fase de grupos + mata-mata (o mais comum na areia), mata-mata simples ou dupla eliminatória — com "melhor de" (set único, MD3, MD5), final em MD5 opcional e o limite de categorias por atleta (1 a 5). "Todos contra todos" e "grupos + repescagem" aparecem como em breve e bloqueiam a publicação se selecionados.',
          ],
          keywords: ['categoria', 'dupla', 'trio', 'quarteto', 'quinteto', 'misto', 'livre', 'sub-13', 'faixa etária', 'vagas', 'formato', 'md3', 'md5'],
        },
        {
          id: 'ligas-e-etapas',
          title: 'Ligas e circuitos',
          icon: Network,
          summary: 'Um circuito com etapas ao longo do ano, ranking somado com tabela de pontos editável e Grande Final.',
          body: [
            'O wizard de liga define identidade, temporada (intervalo e etapas planejadas), as categorias do circuito (valem para todas as etapas, com vagas e preço por etapa), o ranking e as etapas do calendário. Etapas com local e data nascem como torneios publicados junto com a liga; as demais ficam planejadas até você defini-las.',
            'O ranking é configurável de verdade: escolha o modo de contagem ("4 melhores de 6 etapas", "3 melhores de 5", "todas contam") e edite a tabela de pontos por colocação (padrão nexaGO: 450 / 280 / 180 / 120, quartas 80, oitavas 60, 16-avos 45, grupos 40 — com botão de restaurar o padrão). A Grande Final tem vagas pelo ranking (4 a 64) e convites wildcard opcionais.',
            'Na gestão da liga você acompanha etapas publicadas × planejadas, o ranking por categoria (com uma coluna por etapa e o corte já aplicado no total), e adiciona novas etapas com um wizard curto de 3 passos — categorias, formato e ranking vêm herdados da liga.',
          ],
          rules: [
            'Só ligas publicadas recebem etapas novas.',
            'Encerrar a temporada impede novas etapas; o ranking continua visível.',
            'Cancelar a liga tira o circuito do catálogo, mas etapas publicadas permanecem no histórico.',
            'Torneios de etapa nascem sem premiação em dinheiro (defina por etapa, se quiser).',
          ],
          keywords: ['liga', 'circuito', 'etapa', 'temporada', 'grande final', 'wildcard', 'tabela de pontos', 'ranking da liga'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Ranking da liga com colunas por etapa',
            screen: {
              eyebrow: 'Copa Goiás 2026',
              title: 'Ranking · 4 melhores de 6 etapas',
              blocks: [
                { kind: 'tabs', items: ['Duplas', 'Atletas'], active: 0 },
                { kind: 'row', title: '1 · Ana & Bruno', sub: 'E1 450 · E2 280 · E3 450', chip: { label: '1.180 pts', tone: 'brand' } },
                { kind: 'row', title: '2 · Rafa & Duda', sub: 'E1 280 · E2 450 · E3 180', chip: { label: '910 pts', tone: 'neutral' } },
                { kind: 'row', title: '3 · Léo & Kim', sub: 'E1 180 · E2 180 · E3 280', chip: { label: '640 pts', tone: 'neutral' } },
              ],
            },
          },
        },
      ],
    },
    {
      title: 'Inscrições e atletas',
      features: [
        {
          id: 'gestao-de-inscricoes',
          title: 'Gestão de inscrições',
          icon: ClipboardList,
          summary: 'Todas as duplas num lugar só: filtros por situação, contato direto com os atletas, baixa de pagamento e decisões de cancelamento.',
          body: [
            'A tela de inscrições lista cada dupla ou equipe com os avatares, a categoria e a pílula de pagamento — Pago, A conferir (declarado pelos atletas no pagamento direto), Pendente ou Espera. Filtros por categoria e por situação (incluindo "Cancelamento") destacam o que exige decisão sua, e a busca encontra dupla, atleta ou categoria sem se importar com acentos.',
            'Cada linha abre uma gaveta com os detalhes: o aceite do termo de imagem de cada atleta e o contato direto — WhatsApp, ligar ou copiar o telefone. Dali saem as ações: confirmar pagamento (baixa manual), reenviar cobrança, mover para a lista de espera, remover da categoria e decidir pedidos de cancelamento.',
            'O botão "Exportar" gera um CSV exatamente com o que está filtrado na tela — dupla, atletas, telefones, categoria, pagamento, termo de imagem — pronto para o Excel brasileiro.',
            'Duas ações têm salvaguardas fortes. "Reverter pagamento" só existe para baixas manuais suas (pagamento recebido pela plataforma sai por estorno, não por botão) — a vaga continua com a dupla e o valor sai da arrecadação. "Remover da categoria" exige um motivo de ao menos 10 caracteres, que o atleta recebe por notificação, e não pode ser desfeita.',
          ],
          flows: [
            {
              title: 'Decidir um pedido de cancelamento',
              steps: [
                { title: 'O pedido chega', detail: 'A inscrição entra na aba "Cancelamento" com o filete vermelho e o motivo escrito pelo atleta.', state: { label: 'Cancelamento pedido', tone: 'live' } },
                { title: 'Avalie e responda', detail: 'O bloco "O atleta pediu para cancelar" mostra o motivo e um campo de resposta opcional.' },
                { title: 'Aprovar ou recusar', detail: 'Aprovar remove a inscrição e libera a vaga; recusar mantém a inscrição e envia sua justificativa ao atleta.', state: { label: 'Decidido', tone: 'win' } },
                { title: 'Reembolso por fora', detail: 'A nexaGO não processa o estorno — a devolução é combinada diretamente com o atleta.' },
              ],
            },
          ],
          rules: [
            'Reverter pagamento: só para baixa manual do organizador; plataforma = estorno.',
            'Remover da categoria: motivo obrigatório (mínimo 10 caracteres), irreversível, atleta notificado.',
            'A nexaGO não estorna valores — devoluções são combinadas com o atleta.',
            'Notificações de inscrição/pagamento/cancelamento abrem a tela já na dupla certa.',
          ],
          keywords: ['inscrições', 'pagamentos', 'baixa', 'a conferir', 'reverter', 'remover', 'cancelamento', 'exportar csv', 'whatsapp', 'telefone'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Lista de inscrições com filtros e situações de pagamento',
            screen: {
              eyebrow: 'Open Goiânia',
              title: 'Inscrições · 64',
              blocks: [
                { kind: 'tabs', items: ['Todas', 'Pagas', 'A conferir', 'Pendentes', 'Espera'], active: 0 },
                { kind: 'row', title: 'Ana & Bruno', sub: 'Mista B · 12/08', chip: { label: 'Pago', tone: 'win' } },
                { kind: 'row', title: 'Rafa & Duda', sub: 'Mista B · 13/08', chip: { label: 'A conferir', tone: 'pending' } },
                { kind: 'row', title: 'Léo & Kim', sub: 'Masc. A · 14/08 · 1 de 2 pagaram', chip: { label: 'Pendente', tone: 'pending' } },
                { kind: 'row', title: 'Trio Calango', sub: 'Misto livre · Elenco 2/3', chip: { label: 'Espera', tone: 'neutral' } },
              ],
            },
          },
        },
        {
          id: 'inscricao-manual',
          title: 'Inscrever dupla manualmente',
          icon: UserPlus,
          summary: 'Para quando os atletas não conseguiram se inscrever: você fecha a dupla pelo painel, inclusive fora do prazo.',
          body: [
            'O painel "Nova inscrição" monta a dupla em passos: escolha a categoria, busque os dois atletas pelo nome ou apelido cadastrado (os dois precisam ter conta no nexaGO), preencha o uniforme se a categoria exige, e decida se marca "Já recebi o pagamento" — que registra a inscrição como paga por fora; sem marcar, ela nasce pendente e o atleta paga pelo app.',
            'Se um dos atletas já tinha uma vaga reservada sozinho, o painel fecha a dupla sobre a inscrição existente em vez de criar outra. Categoria lotada? A dupla entra automaticamente na lista de espera, com aviso.',
            'A inscrição manual fura só o prazo — o servidor continua validando nível, idade, dupla repetida e categoria concluída. É uma exceção de conveniência, não um bypass das regras da categoria.',
          ],
          keywords: ['inscrição manual', 'nova inscrição', 'inscrever dupla', 'fora do prazo', 'já recebi o pagamento'],
        },
        {
          id: 'uniformes-organizador',
          title: 'Uniformes',
          icon: Shirt,
          summary: 'A grade de tamanhos do torneio inteiro, pronta para mandar ao fornecedor.',
          body: [
            'Em torneios com uniforme incluso, a tela de Uniformes consolida o que cada atleta escolheu no app: tamanho da regata (e do shorts, no modelo completo), nome e número da camisa. Quem edita é sempre o atleta — o painel é leitura.',
            'Os KPIs mostram quantos já cadastraram e a grade de tamanhos em barras clicáveis (filtrar por "G", por exemplo). O botão "Exportar p/ fornecedor" baixa o pedido completo em CSV.',
          ],
          rules: [
            'Uniforme "confirmado" exige tamanho (regata e shorts se o modelo pede), número (1–99) e nome, conforme a categoria.',
            'A grade padrão é PP, P, M, G, GG, XGG.',
          ],
          keywords: ['uniformes', 'grade de tamanhos', 'fornecedor', 'exportar'],
        },
        {
          id: 'comunicacao',
          title: 'Comunicação com os atletas',
          icon: Megaphone,
          summary: 'Avisos por categoria com push no app e links de WhatsApp já preenchidos, um por atleta.',
          body: [
            'Escolha a categoria, o público (todos os inscritos, só confirmados ou só pendentes), escreva a mensagem (até 500 caracteres) e envie. Com "Enviar push no app" ligado, os atletas recebem a notificação no nexaGO na hora.',
            'Depois do envio, a tela monta um botão de WhatsApp por atleta — cada clique abre a conversa já com a mensagem preenchida. O histórico registra cada aviso com alcance ("Todos os inscritos · 42 push entregues") e aponta quem ficou sem notificação.',
          ],
          keywords: ['aviso', 'broadcast', 'push', 'whatsapp', 'comunicação', 'mensagem'],
        },
        {
          id: 'equipe-do-torneio',
          title: 'Equipe do torneio',
          icon: Users,
          summary: 'Dois papéis — Gestor e Mesário — com acesso imediato, por torneio, sem convite para aceitar.',
          body: [
            'Cada torneio tem a própria equipe. O Gestor opera inscrições, chaves, agenda e placar; o Mesário lança o placar das partidas. Você busca a pessoa pelo nome ou apelido do perfil nexaGO (com foto para conferir quem é), escolhe o papel e adiciona — o acesso vale na hora, sem e-mail nem aceite.',
            'Para quem é adicionado, o torneio aparece na área "Mesa" do portal do atleta — é assim que um atleta vira mesário no dia do evento. Só o dono do torneio gerencia a equipe (trocar papel, remover); os demais veem a lista em modo leitura.',
          ],
          rules: [
            'Acesso imediato por torneio — não existe equipe global do painel.',
            'A busca é por nome/apelido público, não por e-mail.',
            'Quem já está na equipe, você e o dono não aparecem na busca.',
          ],
          keywords: ['equipe', 'staff', 'gestor', 'mesário', 'papéis', 'permissões'],
        },
      ],
    },
    {
      title: 'Competição',
      features: [
        {
          id: 'chaves-e-grupos',
          title: 'Chaves e grupos',
          icon: Network,
          summary: 'Grupos + mata-mata, eliminatória simples ou dupla eliminatória — com cabeças de chave, sorteio em snake e prévia antes de publicar.',
          body: [
            'Quando a categoria fecha, o botão "Gerar chave" abre a tela de sorteio. Só entram duplas confirmadas — pagas, fora da lista de espera e com o elenco completo (mínimo de 2). Você escolhe o formato, ajusta duplas por grupo (2–8) e quantas classificam (1–4), e o painel valida o desenho: o total de classificados precisa formar um mata-mata equilibrado (4, 8, 16…), e a dupla eliminatória aceita de 4 a 27 duplas.',
            'Com "Respeitar ordem de seeds" ligado, as cabeças de chave são distribuídas primeiro (uma por grupo, em snake) — a lista de duplas é ordenável por pontuação de nível ou manualmente com as setas. Desligado, o sorteio é 100% aleatório. A prévia mostra os grupos montados e o botão "Sortear de novo" embaralha antes de publicar.',
            'Na fase de grupos, cada grupo tem a classificação ao vivo (vitórias, saldo de sets, pontos — 2 por vitória, com desempate por confronto direto no fechamento) e a lista de jogos. O Chaveamento desenha a árvore completa da categoria — na dupla eliminatória, com a chave dos vencedores em cima e a dos perdedores embaixo — e cada card de partida leva ao lançamento de placar.',
          ],
          flows: [
            {
              title: 'Gerar e publicar a chave',
              steps: [
                { title: 'Categoria pronta', detail: 'O botão aparece quando há duplas confirmadas suficientes e a categoria ainda não tem jogos.', state: { label: 'Lotada', tone: 'pending' } },
                { title: 'Escolha o formato', detail: 'Grupos + mata-mata, eliminatória simples ou dupla eliminatória. O painel valida grupos × classificados.' },
                { title: 'Ordene as cabeças', detail: 'Ordene por nível ou ajuste manualmente; as primeiras N viram cabeças de chave, uma por grupo.' },
                { title: 'Confira a prévia', detail: 'Grupos montados em snake draft. Não gostou do sorteio? "Sortear de novo".' },
                { title: 'Publique', detail: 'A chave vira jogos de verdade e aparece para os atletas no app.', state: { label: 'Chave publicada', tone: 'win' } },
              ],
              outcome: 'Jogos gerados e visíveis para todos. Ao encerrar cada partida, a chave avança sozinha — sem digitar confronto nenhum.',
            },
          ],
          rules: [
            'Elegíveis: duplas pagas + fora da espera + elenco completo. Mínimo de 2.',
            'Regerar uma chave com partidas em andamento ou concluídas APAGA os resultados — o painel exige confirmação explícita.',
            'Depois da chave gerada, o botão "Gerar chave" desaparece das telas.',
            'Total de classificados precisa ser potência de 2 (4, 8, 16…).',
          ],
          keywords: ['chave', 'chaveamento', 'sorteio', 'grupos', 'cabeça de chave', 'seed', 'snake', 'eliminatória', 'dupla eliminatória', 'gerar chave'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Árvore do chaveamento com conectores e cards de partida',
            screen: {
              eyebrow: 'Mista B · 16 duplas',
              title: 'Chaveamento',
              chips: [{ label: 'Chave publicada', tone: 'win' }],
              blocks: [{ kind: 'bracket' }, { kind: 'row', title: 'Semifinal · Jogo #14', sub: 'sáb 14h · Quadra 2', chip: { label: 'Agendado', tone: 'pending' } }],
            },
          },
        },
        {
          id: 'agendamento-de-jogos',
          title: 'Agendamento de jogos',
          icon: CalendarClock,
          summary: 'Uma grade de quadras × horários com fila de partidas — e o auto-agendamento que monta o dia inteiro com prévia.',
          body: [
            'A tela de agendamento é uma agenda real: colunas para cada quadra do torneio, linhas de 30 em 30 minutos e chips de dia quando o evento tem mais de um. Ao lado, a fila "Aguardando horário" lista tudo que ainda não está na grade. Agendar manualmente é clicar na partida e depois no slot livre — reagendar e remover horário funcionam do mesmo jeito.',
            'O "Auto-agendar dia" faz o trabalho pesado: escolha o dia, a hora de início, as quadras que entram, o alcance (só a categoria atual ou o torneio inteiro) e as proteções — evitar conflito de atletas e respeitar as dependências da chave, ambas ligadas por padrão. A prévia desenha os blocos propostos sobre a grade real (respeitando o que já está agendado, inclusive de outras categorias) e o resumo diz quantas partidas entram.',
            'Ao aplicar, o painel informa o que foi agendado e lista as partidas puladas, cada uma com o motivo (quadra ocupada, descanso insuficiente). Nada é escondido: se uma partida transbordar do fim da jornada, a tela avisa.',
          ],
          flows: [
            {
              title: 'Auto-agendar um dia de torneio',
              steps: [
                { title: 'Abra o auto-agendamento', detail: '"Auto-agendar dia" no topo da tela de agendamento. Enquanto o painel está aberto, o agendamento manual pausa.' },
                { title: 'Configure', detail: 'Dia, hora de início, quadras participantes e alcance (categoria ou torneio inteiro).' },
                { title: 'Confira a prévia', detail: 'Blocos tracejados mostram onde cada partida cairia — recalculada a cada ajuste.', state: { label: 'Prévia', tone: 'pending' } },
                { title: 'Aplique', detail: 'As partidas entram na grade; as que não couberam aparecem listadas com o motivo.', state: { label: 'Grade montada', tone: 'win' } },
              ],
            },
          ],
          rules: [
            'Partida encerrada não pode ser reagendada nem ter o horário removido.',
            'Conflito de quadra é recusado pelo servidor — nem manualmente dá para sobrepor.',
            'A fila mostra tudo que não está na grade do dia — nenhuma partida some.',
          ],
          keywords: ['agendamento', 'agenda', 'quadra', 'horário', 'auto-agendar', 'grade', 'fila', 'descanso'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Grade de agendamento com quadras e auto-agendamento em prévia',
            screen: {
              eyebrow: 'Sábado · 24 out',
              title: 'Agendamento de jogos',
              chips: [{ label: 'Prévia · 14 partidas', tone: 'pending' }],
              blocks: [
                { kind: 'calendar', label: 'Quadras 1–4 · 07h às 19h' },
                { kind: 'row', title: 'Fila · Aguardando horário', sub: '6 partidas da Mista B' },
                { kind: 'button', label: 'Aplicar auto-agendamento' },
              ],
            },
          },
        },
        {
          id: 'mesa-e-placar',
          title: 'Mesa ao vivo e lançamento de placar',
          icon: Activity,
          summary: 'Ponto a ponto na mesa — com saque, set point e correções — ou lançamento rápido do placar final; a chave avança sozinha.',
          body: [
            'A mesa ao vivo coloca a partida no ar para os atletas e o público: dois botões gigantes de +1 ponto, marcação de saque, faixa de sets e alertas de set point e match point. A correção é honesta — o −1 só funciona no lado que fez o último ponto, e cada lance fica registrado no feed "Últimos lances". O ponto que fecha a partida grava o resultado, avança a chave automaticamente e libera a validação da súmula.',
            'Para jogos que já aconteceram na areia, o lançamento rápido recebe o placar por sets com validação do servidor — sem inventar ponto a ponto. A mesma tela declara W.O. (a dupla ausente é eliminada e a chave avança), troca a quadra da partida (o horário fica) e permite mudar o formato entre set único e MD3 — nunca descartando sets já pontuados.',
            '"Tirar do ao vivo" devolve uma partida ao estado agendado — descartando de forma explícita e irrecuperável o placar já lançado. Partida encerrada não sai do ao vivo: a chave e o ranking já andaram.',
            'A mesma mesa existe para o mesário no portal do atleta e no app — tudo em tempo real, do servidor: o que uma mesa lança, as outras veem na hora.',
          ],
          keywords: ['mesa', 'placar', 'ponto a ponto', 'wo', 'walkover', 'súmula', 'validar', 'trocar quadra', 'set único', 'md3'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Mesa ao vivo com placar por sets e ações',
            screen: {
              eyebrow: 'Mesa ao vivo · Quadra 1',
              title: 'Final · Masculina A',
              chips: [
                { label: 'Ao vivo', tone: 'live' },
                { label: 'Match point', tone: 'pending' },
              ],
              blocks: [
                { kind: 'score', teamA: 'Léo & Kim · saque', teamB: 'Ana & Bruno', sets: [['21', '17'], ['20', '18']], live: true },
                { kind: 'row', title: 'Ações da mesa', sub: 'Desfazer ponto · Trocar saque · Tirar do ao vivo' },
              ],
            },
          },
        },
        {
          id: 'telao-ao-vivo',
          title: 'Telão ao vivo',
          icon: MonitorPlay,
          summary: 'Uma TV na arena com os placares em tempo real, chamada de atletas, QR para o público — e modo Grande Final.',
          body: [
            'O telão exibe as quadras escolhidas num painel 1920×1080 que atualiza sozinho a cada ponto lançado na mesa. Cada quadra tem quatro estados: ao vivo (com placar, saque e o destaque "em chamas" para a dupla com 3+ pontos seguidos), próximo jogo, fim de jogo (celebração de 30 segundos com o troféu) e quadra livre.',
            'Os módulos são toggles que a TV obedece sem recarregar: fila de próximos jogos, barra de chamada de atletas ("apresentar-se à Quadra 2 até 14h05" — a chamada dispara 5 minutos antes), avatares, rotação automática das quadras a cada 20 segundos e o QR de acompanhamento — quem está na arena aponta a câmera e segue os jogos no celular, sem login e sem app, numa página pública que nunca mostra nada financeiro.',
            'No modo Grande Final, quando a final ou a disputa de 3º lugar entra ao vivo, a partida assume a tela inteira — dourado para a final, bronze para o 3º — com placar gigante, alertas de match point e a tela de campeões com confete por 90 segundos ao terminar. Com outras quadras jogando, o telão reveza: 30 segundos na final, 20 na grade.',
          ],
          rules: [
            'A TV precisa de um login no portal (qualquer staff serve — não exige papel de organizador).',
            'Não dá para desmarcar a última quadra do telão.',
            'A página pública do QR não expõe informações financeiras.',
          ],
          keywords: ['telão', 'tv', 'transmissão', 'chamada', 'qr code', 'público', 'grande final', 'em chamas'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Telão da arena com quadras ao vivo e fila de próximos jogos',
            screen: {
              eyebrow: 'nexaGO · Ao vivo',
              title: 'Open Goiânia — Telão',
              chips: [{ label: 'Transmitindo', tone: 'live' }],
              blocks: [
                { kind: 'score', teamA: 'Ana & Bruno', teamB: 'Rafa & Duda', sets: [['15', '12']], live: true },
                { kind: 'score', teamA: 'Léo & Kim', teamB: 'Bia & Mel', sets: [['8', '11']], live: true },
                { kind: 'row', title: 'Próximos jogos', sub: '14h00 · Q3 — apresentar-se à quadra', chip: { label: 'Chamada', tone: 'pending' } },
              ],
            },
          },
        },
      ],
    },
    {
      title: 'Financeiro e divulgação',
      features: [
        {
          id: 'financeiro-organizador',
          title: 'Financeiro e carteira',
          icon: Banknote,
          summary: 'O que entra pelo app cai na carteira com repasse em D+2; o que você recebe por fora entra na conta do evento para fechar o total.',
          body: [
            'O Financeiro consolida a carteira: saldo disponível, pendente de repasse, o extrato de recebimentos (bruto, taxa e líquido) e a arrecadação por evento. A distinção de canais atravessa o painel inteiro: "na plataforma" é o que cai na carteira; "direto" é o que você recebeu por fora e confirmou nas inscrições — os dois somam o total real do evento.',
            'O saque é sob demanda: cadastre a chave PIX de saque, informe o valor (mínimo de R$ 20) e solicite. Importante: a chave de saque é diferente da chave de recebimento direto que aparece nos torneios — uma recebe dos atletas, a outra recebe da plataforma.',
            'A taxa da plataforma é fixa (com piso) e não é configurável pelo organizador; não há estorno automático de valores.',
          ],
          rules: [
            'Saque mínimo de R$ 20, com chave PIX de saque cadastrada.',
            'Chave de recebimento direto (torneios) ≠ chave de saque (carteira).',
            'Repasse do pagamento via app em D+2.',
          ],
          keywords: ['financeiro', 'carteira', 'saque', 'repasse', 'taxa', 'extrato', 'pix', 'd+2'],
        },
        {
          id: 'divulgacao',
          title: 'Divulgação — QR, link e página de links',
          icon: Share2,
          summary: 'Cada torneio gera QR code, link e texto de anúncio prontos — e você tem uma página pública de links estilo bio.',
          body: [
            'O modal "Compartilhar" de cada torneio entrega o kit de divulgação: QR code para baixar em PNG, o link de inscrição para copiar, o botão de WhatsApp e o texto de anúncio pronto ("🏆 Open Goiânia … Inscrições abertas! Garanta sua vaga:"). Torneios públicos apontam para a página do torneio no site; torneios "por link" apontam direto para a inscrição.',
            'A página de links (nexago.com.br/o/seu-nome) funciona como um link-na-bio do organizador: seus links personalizados mais sugestões automáticas — torneios com inscrições abertas ou em andamento viram atalhos prontos.',
          ],
          keywords: ['compartilhar', 'divulgar', 'qr code', 'link', 'whatsapp', 'link na bio'],
        },
        {
          id: 'configuracoes-organizador',
          title: 'Configurações e padrões',
          icon: Settings,
          summary: 'Perfil da organização, dados de recebimento e as regras padrão que preenchem cada torneio novo.',
          body: [
            'As Configurações guardam o perfil da organização (nome, responsável, contato, logo), os dados de recebimento direto do nexaGO Pay (a chave PIX que o wizard usa nos torneios com pagamento por fora) e as notificações do navegador.',
            'As "Regras padrão de evento" aceleram quem cria torneio toda semana: esporte, preço de inscrição, quadras, vagas, formato, melhor-de, grupos e limite por atleta viram o ponto de partida de cada torneio novo — sem alterar nada já criado.',
          ],
          keywords: ['configurações', 'padrões', 'nexago pay', 'chave pix', 'organização'],
        },
      ],
    },
  ],
};
