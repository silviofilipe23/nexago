import {
  Banknote,
  CalendarClock,
  CalendarRange,
  Flame,
  Gem,
  LayoutDashboard,
  Megaphone,
  Percent,
  Receipt,
  Repeat,
  ShieldCheck,
  Star,
  Store,
  Trophy,
} from 'lucide-react';
import type { DocAudience } from './types';

export const ARENAS: DocAudience = {
  id: 'arenas',
  label: 'Arenas',
  surface: 'Painel web da arena · nexago.com.br',
  tagline: 'A operação da arena, do horário à carteira',
  description:
    'Perfil público, quadras, agenda de reservas, mensalistas, clubinho, promoções, comandas e financeiro — com uma equipe de cargos bem definidos e planos que crescem com a arena. Este guia cobre cada área do painel do gestor.',
  hero: { src: '/app/arenas.png', alt: 'Tela de busca de horários do nexaGO, com quadras, preços e botão de reservar' },
  groups: [
    {
      title: 'Comece aqui',
      features: [
        {
          id: 'conta-e-painel',
          title: 'Conta e painel da arena',
          icon: LayoutDashboard,
          summary: 'Cadastre a arena, passe pela verificação rápida e acompanhe o dia inteiro no dashboard.',
          body: [
            'O cadastro pede o básico — nome da arena, CNPJ, cidade, WhatsApp, e-mail e senha — e a conta passa por uma verificação rápida antes de aparecer para os atletas no app. Quem gerencia mais de uma arena escolhe qual abrir ao entrar (e troca pela barra lateral quando quiser).',
            'O Início consolida o dia: faturamento de hoje com a variação contra a mesma data da semana passada, reservas do dia com status, torneios ativos na casa, avaliação média e o gráfico dos últimos 7 dias em faturamento e reservas. Atalhos levam direto para a agenda, as avaliações pendentes e o perfil.',
            'O painel inteiro é em tempo real — agenda, reservas, financeiro e avaliações atualizam sozinhos, sem recarregar a página.',
          ],
          keywords: ['cadastro arena', 'painel', 'dashboard', 'verificação', 'multiarena', 'trocar arena'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Dashboard da arena com KPIs e reservas do dia',
            screen: {
              eyebrow: 'Painel da arena',
              title: 'Bom dia, Arena CFC',
              blocks: [
                { kind: 'stats', items: [{ label: 'Faturamento hoje', value: 'R$ 940' }, { label: 'Reservas hoje', value: '12' }, { label: 'Torneios', value: '2' }, { label: 'Avaliação', value: '4.6' }] },
                { kind: 'row', title: '18h00 · Quadra 1', sub: 'Carlos M. · Vôlei de praia', chip: { label: 'Confirmada', tone: 'win' } },
                { kind: 'row', title: '19h00 · Quadra 2', sub: 'Ana S. · Beach tennis', chip: { label: 'Pendente', tone: 'pending' } },
                { kind: 'row', title: '20h00 · Quadra 1', sub: 'Clubinho de sexta', chip: { label: 'Check-in', tone: 'brand' } },
              ],
            },
          },
        },
        {
          id: 'perfil-da-arena',
          title: 'Perfil público da arena',
          icon: Store,
          summary: 'Como os atletas veem a arena no app: capa, esportes, superfícies, comodidades e formas de pagamento.',
          body: [
            'O perfil define a vitrine da arena na busca dos atletas: capa e logo (imagens até 5 MB), nome e descrição, os esportes (do vôlei de praia ao pickleball) e superfícies (areia, saibro, sintética…), as comodidades (estacionamento, vestiário, quadra coberta, acessibilidade…) e as formas de pagamento aceitas — PIX online e/ou pagamento no local.',
            'A nota de avaliação e o total de avaliações aparecem no perfil, mas são calculados pela plataforma — reputação não se edita. Os contatos (telefone, WhatsApp) e o endereço completo têm tela própria, e a lista de esportes é combinada automaticamente com os esportes das quadras cadastradas.',
          ],
          rules: [
            'Pelo menos uma forma de pagamento precisa ficar ativa.',
            'Imagens JPG/PNG/WebP de até 5 MB; a troca só vale depois de salvar.',
            'Telefone com DDD é obrigatório nos contatos; a UF é gravada em maiúsculas.',
          ],
          keywords: ['perfil', 'capa', 'logo', 'esportes', 'superfícies', 'comodidades', 'pagamento', 'contatos', 'endereço'],
        },
        {
          id: 'quadras-e-horarios',
          title: 'Quadras e horários de funcionamento',
          icon: CalendarRange,
          summary: 'Cadastre as quadras com modalidades e preço por hora, e defina a semana padrão que gera a agenda.',
          body: [
            'Cada quadra tem nome, modalidades, preço por hora e status — ativa ou em manutenção (que bloqueia o dia inteiro na agenda). O menor preço por hora vira o "a partir de" da arena na busca do atleta.',
            'Os horários de funcionamento definem quando os clientes conseguem reservar: escolha a duração dos blocos (30 min, 1 h ou 2 h) e ligue cada dia da semana com abertura e fechamento. A grade vale para todas as quadras de uma vez, e fora do horário de funcionamento as quadras simplesmente não aparecem disponíveis no app.',
          ],
          rules: [
            'Limite de quadras por plano: Starter 2 · Pro 5 · Elite ilimitado.',
            'Toda quadra precisa de ao menos um esporte; sem preço configurado, não recebe reserva.',
            'Os horários exigem ao menos uma quadra cadastrada; o padrão de fábrica é todos os dias, 08h–22h, blocos de 1 h.',
          ],
          keywords: ['quadras', 'preço por hora', 'manutenção', 'horário de funcionamento', 'blocos', 'semana padrão'],
        },
      ],
    },
    {
      title: 'Agenda e reservas',
      features: [
        {
          id: 'agenda-e-reservas',
          title: 'Agenda, bloqueios e reservas',
          icon: CalendarClock,
          summary: 'A grade quadras × horários em tempo real — com bloqueios por motivo, check-in com janela e cancelamento com desfazer.',
          body: [
            'A Agenda mostra o dia (ou a semana) em colunas por quadra, com cada bloco marcado como disponível, reservado ou bloqueado. Bloquear um horário é clicar num bloco livre e escolher o motivo — manutenção, evento privado, aula ou outro, com nota opcional — e o horário some da busca na hora. Horário reservado nunca se bloqueia: clicar nele abre o detalhe da reserva.',
            'A lista de Reservas organiza por hoje, amanhã, futuras e passadas, com faturamento do período e a contagem de mensalistas. O detalhe traz cliente, horário, pagamento (com cupom aplicado, se houver) e as duas ações do dia a dia: check-in e cancelamento.',
            'As reservas são sempre iniciadas pelo atleta no app — o painel opera o que chega. Reserva cancelada libera o horário na agenda imediatamente.',
          ],
          flows: [
            {
              title: 'Cancelar uma reserva (com rede de segurança)',
              steps: [
                { title: 'Abra a reserva', detail: 'Pela lista de reservas ou clicando no bloco reservado da agenda.' },
                { title: 'Cancele com motivo', detail: 'O motivo é opcional ("cliente pediu por WhatsApp") e fica no registro.', state: { label: 'Cancelada', tone: 'live' } },
                { title: '60 segundos para desfazer', detail: 'Uma faixa "Reserva cancelada · Desfazer (60s)" permite restaurar tudo como estava. Depois do prazo, o cancelamento é definitivo.', state: { label: 'Horário liberado', tone: 'win' } },
              ],
            },
          ],
          rules: [
            'Check-in só de 20 minutos antes do início até 15 minutos após o término do horário.',
            'Reserva concluída ou cancelada não pode ser cancelada (de novo); no-show registrado bloqueia novo check-in.',
            'O desfazer do cancelamento vale por 60 segundos.',
            'O cargo Manutenção vê a agenda, mas não bloqueia nem cancela.',
          ],
          keywords: ['agenda', 'reservas', 'bloquear horário', 'check-in', 'no-show', 'cancelar', 'desfazer', 'grade'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Agenda de quadras com grade e bloqueio de horário',
            screen: {
              eyebrow: 'Agenda de quadras',
              title: 'seg · 12 mai',
              chips: [
                { label: '24 livres', tone: 'win' },
                { label: '8 reservados', tone: 'brand' },
                { label: '2 bloqueados', tone: 'neutral' },
              ],
              blocks: [
                { kind: 'calendar', label: 'Quadras 1–3 · 07h às 22h' },
                { kind: 'row', title: '19h00 · Quadra 2 · Ana S.', sub: 'Beach tennis · R$ 120', chip: { label: 'Confirmada', tone: 'win' } },
                { kind: 'row', title: '20h00 · Quadra 3', sub: 'Bloqueado · manutenção da rede', chip: { label: 'Bloqueado', tone: 'neutral' } },
              ],
            },
          },
        },
        {
          id: 'horarios-fixos',
          title: 'Horários fixos (mensalistas)',
          icon: Repeat,
          summary: 'Reservas semanais recorrentes com pagamento mensal ou por ocorrência — pausáveis sem perder o histórico.',
          body: [
            'O horário fixo transforma o mensalista num contrato vivo: escolha a quadra, o dia da semana, a faixa de horário, o período (com ou sem data de término) e o cliente — um atleta cadastrado (buscando entre quem já reservou na arena) ou um nome avulso. Defina o valor por ocorrência e a forma de pagamento (mensal ou por ocorrência); o painel estima o valor mensal na hora.',
            'As ocorrências futuras são geradas automaticamente e aparecem na agenda e na lista de reservas. Pausar libera as ocorrências futuras da agenda até retomar; encerrar cancela as futuras e preserva as já realizadas no histórico.',
          ],
          rules: [
            'Limite por plano: Starter até 3 horários fixos ativos; Pro e Elite, ilimitado.',
            'A estimativa mensal usa a média de 4,33 semanas por mês.',
            'Séries encerradas saem da lista; pausadas ficam marcadas com a data da pausa.',
          ],
          keywords: ['mensalista', 'horário fixo', 'recorrente', 'pausar', 'encerrar'],
        },
        {
          id: 'clubinho',
          title: 'Clubinho — o jogo aberto da casa',
          icon: Flame,
          summary: 'A lista do WhatsApp aposentada: jogo aberto com lista pública, PIX antecipado e estorno automático.',
          body: [
            'A arena cria o clubinho com nome, recorrência (toda semana num dia fixo, ou sessões avulsas), horário, quadras, vagas e valor por atleta — e decide se aceita também pagamento no local. As sessões da semana são geradas sozinhas, e o horário bloqueia as quadras para reserva avulsa.',
            'A lista é pública: qualquer atleta encontra o clubinho no perfil da arena, entra e paga pelo app. A lista da sessão mostra cada participante com o status do pagamento (aguardando PIX, confirmado, PIX expirado, paga na arena…), quem recebeu online e quem acerta no dia — e a arena pode adicionar alguém manualmente (inclusive convidado sem conta) ou remover da lista.',
            'O dinheiro se comporta sozinho: com PIX antecipado, o nome só entra na lista depois do pagamento; quem sai dentro do prazo de cancelamento recebe estorno automático e a vaga reabre; cancelar a sessão estorna todos os confirmados de uma vez.',
          ],
          flows: [
            {
              title: 'Uma semana de clubinho',
              steps: [
                { title: 'Configure uma vez', detail: 'Nome, "toda sexta 18h–22h", quadras, 16 vagas, R$ 15 por atleta, cancelamento até 24 h antes.' },
                { title: 'A sessão nasce sozinha', detail: 'Toda semana a próxima sessão abre com a configuração atual e bloqueia a agenda.', state: { label: 'Agendada', tone: 'neutral' } },
                { title: 'A lista se enche', detail: 'Atletas entram pelo app e pagam o PIX; a lista ao vivo mostra confirmados e vagas restantes.', state: { label: '12/16 confirmados', tone: 'brand' } },
                { title: 'Imprevistos se resolvem sozinhos', detail: 'Quem sai no prazo é estornado automaticamente; PIX expirado libera a vaga; sessão cancelada estorna todo mundo.', state: { label: 'Estorno automático', tone: 'win' } },
              ],
            },
          ],
          rules: [
            'Clubinho é recurso dos planos Pro e Elite; a taxa da plataforma é de 5% sobre o PIX antecipado.',
            'Alterações no clubinho valem para as próximas sessões — as já criadas mantêm preço, vagas e horário.',
            'Só sessões agendadas aceitam adicionar, remover ou cancelar.',
          ],
          keywords: ['clubinho', 'jogo aberto', 'lista', 'pix antecipado', 'estorno', 'sessão'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Lista de participantes de uma sessão do clubinho',
            screen: {
              eyebrow: 'Clubinho de sexta · 22 ago',
              title: '18h00–22h00 · Agendada',
              blocks: [
                { kind: 'stats', items: [{ label: 'Confirmados', value: '12/16' }, { label: 'Aguardando PIX', value: '2' }, { label: 'Recebido', value: 'R$ 180' }] },
                { kind: 'row', title: '1 · Carlos M.', sub: 'R$ 15', chip: { label: 'Confirmado', tone: 'win' } },
                { kind: 'row', title: '2 · Ana S.', sub: 'R$ 15', chip: { label: 'Aguardando PIX', tone: 'pending' } },
                { kind: 'row', title: '3 · Convidado · João', sub: 'R$ 15', chip: { label: 'Paga na arena', tone: 'neutral' } },
              ],
            },
          },
        },
        {
          id: 'pico-promocoes-cupons',
          title: 'Horários de pico, promoções e cupons',
          icon: Percent,
          summary: 'Reserva mínima nos horários concorridos, desconto automático nos vazios e códigos para campanhas.',
          body: [
            'Horários de pico protegem a faixa mais disputada: uma regra exige reserva mínima de 2 ou 3 horas em dias e quadras escolhidos (nenhum selecionado = todos), com liberação automática opcional — perto do horário, a exigência cai e o bloco volta à venda avulsa. O atleta vê a regra explicada antes de reservar.',
            'Promoções são descontos automáticos, sem código: percentual ou valor fixo por hora, aplicados por quadra, dia da semana, faixa de horário e vigência. O cliente vê o preço já com desconto ao escolher o horário. Cupons são o oposto — códigos que o cliente digita na reserva, com vigência, limite total de resgates e limite por atleta.',
            'Quando os dois valem ao mesmo tempo, ninguém empilha desconto: vale sempre o maior para o cliente.',
          ],
          rules: [
            'Criar e editar pico e promoções exige plano Pro ou Elite (excluir é sempre permitido).',
            'Reserva mínima entre 1 h e 6 h; liberação antecipada entre 1 e 48 horas.',
            'Cupom não se edita — cria, lista e desativa (desativar é irreversível).',
            'Cupom e promoção automática não acumulam — vale o maior desconto.',
          ],
          keywords: ['horário de pico', 'reserva mínima', 'promoção', 'desconto', 'cupom', 'código', 'happy hour'],
        },
      ],
    },
    {
      title: 'Balcão e operação',
      features: [
        {
          id: 'comandas-e-estoque',
          title: 'Comandas (PDV) e estoque',
          icon: Receipt,
          summary: 'A conta do bar no nome do cliente, com produtos que baixam do estoque e pagamentos por qualquer método.',
          body: [
            'A comanda abre com o nome do cliente e recebe os produtos do estoque — cada lançamento baixa o saldo automaticamente, e o estorno devolve. O resumo separa consumo e locação, mostra o total, o pago e o restante, e os pagamentos entram por PIX, crédito, débito, dinheiro, carteira ou outro, em quantas parcelas forem necessárias.',
            'O estoque organiza o catálogo por categoria (bebidas, alimentação, equipamentos, serviços), com emoji de identificação, preço, quantidade e o alerta de estoque mínimo. Movimentações são tipadas — compra, ajuste, perda e venda (esta só nasce de comanda) — sempre com motivo.',
          ],
          rules: [
            'PDV e estoque são recursos dos planos Pro e Elite; com plano rebaixado, os dados ficam somente leitura (receber pagamento e estornar continuam liberados).',
            'Itens já cobertos por pagamento não podem ser estornados antes de estornar o pagamento.',
            'Comanda com consumo só fecha depois de paga; sem consumo, fecha direto.',
            'Ajustes de estoque exigem quantidade e motivo.',
          ],
          keywords: ['comanda', 'pdv', 'bar', 'estoque', 'produtos', 'pagamento', 'balcão'],
        },
        {
          id: 'torneios-na-arena',
          title: 'Torneios sediados na arena',
          icon: Trophy,
          summary: 'Acompanhe os torneios e ligas que acontecem na casa — inscritos, status e arrecadação.',
          body: [
            'A área de Torneios & ligas mostra as competições sediadas na arena com status, barra de inscritos e arrecadação. É uma tela de consulta: quem cria e gerencia torneios é sempre uma conta de organizador — a arena sedia, acompanha e recebe o movimento.',
            'Receber torneios pelo painel é um recurso dos planos Pro e Elite.',
          ],
          keywords: ['torneios', 'ligas', 'sediar', 'etapa'],
        },
      ],
    },
    {
      title: 'Comunidade e divulgação',
      features: [
        {
          id: 'avaliacoes-e-clientes',
          title: 'Avaliações, seguidores e ranking de clientes',
          icon: Star,
          summary: 'A reputação da arena, os atletas que a seguem e um ranking de frequência + gasto dos clientes.',
          body: [
            'As avaliações chegam depois que os atletas jogam, com nota e comentário. A arena responde publicamente (uma resposta por avaliação, de 5 a 300 caracteres, editável depois) — e os filtros destacam as pendentes e as negativas para ninguém ficar sem resposta.',
            'Os seguidores são os atletas que acompanham a arena no app (seguir é sempre gesto do atleta), e o ranking de clientes ordena quem mais joga e gasta na casa — com pódio, comparecimento e a ficha de cada cliente com o histórico completo de reservas. "Jogos" só conta reserva com check-in feito.',
          ],
          keywords: ['avaliações', 'responder', 'reputação', 'seguidores', 'ranking de clientes', 'no-show'],
        },
        {
          id: 'site-e-links',
          title: 'Mini-site e página de links',
          icon: Megaphone,
          summary: 'Uma landing page própria em nexago.com.br/s/sua-arena e um link-na-bio em /a/sua-arena.',
          body: [
            'O "Meu site" publica a landing page da arena num endereço próprio: hero com imagem e botão, seção sobre com números de destaque, galeria de até 8 fotos, planos (mensalista, day use, aulas), perguntas frequentes e contatos — mais as seções automáticas com dados ao vivo do nexaGO: horários da agenda, torneios sediados e avaliações, sempre atualizados sem republicar.',
            'Cada seção liga e desliga, o tema tem seis cores de destaque, e o fluxo separa "Salvar rascunho" (guarda o progresso) de "Publicar" (põe no ar). A página de Links é o irmão menor: um link-na-bio público com atalhos prontos — reservar quadra, WhatsApp, Instagram, como chegar.',
          ],
          rules: [
            'O endereço (slug) usa letras minúsculas, números e hífen — e mudar depois quebra links já compartilhados.',
            'O título principal do hero é obrigatório para publicar.',
            'Imagens de até 5 MB; limites por seção (8 fotos na galeria, 4 planos, 8 perguntas).',
          ],
          keywords: ['mini-site', 'landing page', 'site', 'links', 'link na bio', 'slug', 'publicar'],
        },
      ],
    },
    {
      title: 'Financeiro, equipe e planos',
      features: [
        {
          id: 'financeiro-da-arena',
          title: 'Financeiro e saques',
          icon: Banknote,
          summary: 'O saldo da carteira, o extrato de recebimentos e o saque PIX — exclusivo do dono da arena.',
          body: [
            'O Financeiro mostra o saldo disponível, o recebido e o sacado por período, e as movimentações com status. O saque é por PIX para a chave cadastrada (CPF, CNPJ, e-mail, celular ou aleatória): valores até R$ 500 saem automaticamente; acima disso, passam pela aprovação da plataforma.',
            'O relatório de ocupação (planos Pro e Elite) mede o uso das quadras num período: reservas, horas reservadas, atletas únicos, taxa de no-show, recorrência e o detalhamento por quadra.',
            'Dinheiro é assunto do dono: nenhum cargo de equipe solicita saque ou troca a chave PIX — nem o Gestor, que consulta o financeiro sem alterar nada.',
          ],
          rules: [
            'Saque mínimo de R$ 20, um saque pendente por vez.',
            'Tarifa de R$ 1,75 por saque — isenta no plano Elite.',
            'Até R$ 500 o PIX sai na hora; acima, aguarda aprovação da plataforma.',
          ],
          keywords: ['financeiro', 'saldo', 'saque', 'pix', 'extrato', 'ocupação', 'relatórios'],
        },
        {
          id: 'equipe-e-cargos',
          title: 'Equipe e permissões',
          icon: ShieldCheck,
          summary: 'Quatro cargos com fronteiras claras — Gestor, Recepção, Financeiro e Manutenção — e convites por e-mail.',
          body: [
            'Cada pessoa da equipe entra com um cargo que define o que vê e o que edita. O Gestor opera a arena inteira e consulta o financeiro sem poder alterá-lo; a Recepção cuida de agenda, reservas, comandas e clubinho; o Financeiro consulta números e escreve cupons e promoções; a Manutenção mexe em quadras e estoque, sem acesso a dinheiro. O menu lateral de cada um mostra só o que o cargo alcança — e a URL também é bloqueada.',
            'O convite vai por e-mail (vários de uma vez): quem já tem conta entra na hora; quem não tem recebe um link para criar a conta e aceitar — e o convite só vale para o e-mail que o recebeu. Trocar o cargo aplica na hora; remover corta o acesso imediatamente.',
            '"Equipe" e "Planos" são áreas exclusivas do dono — nenhum cargo as enxerga, e só o dono movimenta dinheiro.',
          ],
          flows: [
            {
              title: 'Convidar alguém para o painel',
              steps: [
                { title: 'Envie o convite', detail: 'E-mails separados por vírgula, o cargo escolhido e a lista do que esse cargo acessa, visível antes de enviar.' },
                { title: 'Cada e-mail tem um destino', detail: 'Conta existente entra como "Adicionado à equipe"; conta nova recebe o link do convite (copie ou mande por WhatsApp).', state: { label: 'Convite pendente', tone: 'pending' } },
                { title: 'Aceite', detail: 'A pessoa entra (ou cria a conta) e aceita — o convite vale só para o e-mail convidado.', state: { label: 'Ativo', tone: 'win' } },
              ],
            },
          ],
          rules: [
            'Assentos por plano: Starter sem equipe · Pro até 5 · Elite ilimitado.',
            'O dono tem acesso total; saque e chave PIX são só dele.',
            'Cargo sem acesso a uma área não a vê no menu — e é redirecionado se tentar pela URL.',
          ],
          keywords: ['equipe', 'cargos', 'permissões', 'rbac', 'convite', 'gestor', 'recepção', 'financeiro', 'manutenção'],
        },
        {
          id: 'planos-da-arena',
          title: 'Planos e assinatura',
          icon: Gem,
          summary: 'Starter, Pro e Elite — cada um libera mais operação e reduz a taxa por reserva.',
          body: [
            'O Starter (R$ 99/mês) coloca a arena online: até 2 quadras, agenda e reservas pelo app, avaliações e saque PIX, com taxa de 8% por reserva paga no app. O Pro (R$ 249/mês) é a operação completa: até 5 quadras, equipe com 5 assentos, PDV/comandas, estoque, promoções, horários de pico, clubinho, relatórios e torneios — com taxa de 6%. O Elite (R$ 499/mês) atende arenas grandes e redes: tudo ilimitado, taxa de 5% e saque PIX sem tarifa.',
            'Sem plano ativo, a arena opera no essencial com taxa de 8% por reserva. A assinatura tem ciclo mensal ou anual (o anual dá 1 mês grátis), pagamento por PIX ou cartão, e uma taxa de ativação única de R$ 97 somada à primeira fatura. Trocar de plano é automático — a assinatura anterior é cancelada antes da nova, sem cobrança dupla.',
            'Ao cancelar, o acesso do plano continua até o fim do período já pago; depois a arena volta ao modo sem plano. Dados de recursos pagos nunca somem — ficam somente leitura até um novo upgrade.',
          ],
          rules: [
            'Pagamento atrasado tem 7 dias de carência antes de derrubar o acesso.',
            'A tela de planos é exclusiva do dono.',
          ],
          keywords: ['planos', 'starter', 'pro', 'elite', 'assinatura', 'taxa', 'upgrade', 'cancelar assinatura', 'ativação'],
          screen: {
            kind: 'mock',
            frame: 'browser',
            alt: 'Comparativo de planos da arena',
            screen: {
              eyebrow: 'Planos & assinatura',
              title: 'Starter · Pro · Elite',
              blocks: [
                { kind: 'stats', items: [{ label: 'Starter', value: 'R$ 99' }, { label: 'Pro', value: 'R$ 249' }, { label: 'Elite', value: 'R$ 499' }] },
                { kind: 'row', title: 'Taxa por reserva', sub: '8% · 6% · 5% (sem plano: 8%)' },
                { kind: 'row', title: 'Quadras', sub: '2 · 5 · ilimitadas' },
                { kind: 'button', label: 'Assinar Pro' },
              ],
            },
          },
        },
      ],
    },
  ],
};
