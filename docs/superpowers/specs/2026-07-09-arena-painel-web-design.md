# Painel da Arena (web) — design

## Contexto

O projeto `frontend/projects/arena` hoje só tem o fluxo de auth (login/cadastro/recuperação) e um placeholder pós-login (`painel/panel-home.component.ts`, com o comentário "o painel completo ainda está em construção"). O protótipo completo do painel do gestor da arena existe no Claude Design (`NexaGO Arena — Painel.html`, projeto `nexago`), com 7 telas: Início, Agenda, Financeiro, Torneios, Quadras, Equipe, Perfil.

O projeto irmão `frontend/projects/backoffice` já implementou exatamente esse tipo de painel (sidebar + telas) a partir do mesmo protótipo, e serve de precedente arquitetural direto: `painel/ui/` com componentes standalone reutilizáveis + classes utilitárias globais `bo-*` em `src/styles.css`, e cada tela em `painel/<feature>/panel-<feature>.component.ts` se auto-envolvendo em `<bo-panel-shell>`.

Este design replica esse padrão para a arena, trocando o prefixo `bo-` por `ar-`, com o conteúdo das 7 telas do protótipo `NexaGO Arena — Painel.html`.

## Decisões

- **Dados mock nesta rodada.** Todo o conteúdo (KPIs, listas, gráficos, tabelas) fica com arrays hardcoded nos componentes, iguais aos do protótipo — sem Firestore. Mesma escolha já feita no backoffice. Integração real fica para specs futuras, tela por tela.
- **Sem router-outlet aninhado.** Cada tela é uma rota lazy-loaded independente que se auto-envolve em `<ar-panel-shell>`, replicando o `PanelShellComponent`/`PanelHomeComponent` do backoffice (não um layout route com `<router-outlet>`).
- **Sidebar com dados reais onde já existem.** O rodapé da sidebar (nome/iniciais do usuário) usa `AuthService.displayName()`/`user()`, igual ao backoffice. O seletor de arena no topo também usa `displayName()` como nome da arena (hoje 1 conta Firebase = 1 arena, `createArenaAccount` já grava o nome da arena como `displayName`) — mas mostra "1 unidade" fixo, já que não existe conceito de múltiplas unidades por conta ainda (o protótipo mostra 3 arenas mock, isso não é replicado).
- **Ações de botão são visuais nesta rodada.** "Nova reserva", "Criar torneio", "Editar perfil", "Solicitar saque" etc. não têm handler real — ficam prontos para receber lógica depois. Abas que trocam dado exibido (Início, Agenda, Torneios) e filtros de lista/tabela SÃO funcionais (são só `computed`/`signal` client-side, sem tocar Firestore).
- **Ícones**: um único `ar-icon` com switch de nomes (mesmo padrão do `IconComponent` do backoffice), cobrindo o que as 7 telas realmente usam — não replico os ícones do protótipo que não são referenciados em nenhuma tela (ex.: `ArIcGrid`, `ArIcWifi` do `arena-panel-atoms.jsx` não aparecem em nenhum `screen-arena-*.jsx`).

## Arquitetura de arquivos

```
src/app/painel/
  ui/
    icon.component.ts          (ar-icon)
    panel-shell.component.ts   (ar-panel-shell — sidebar + seletor de arena + nav)
    page-header.component.ts   (ar-page-header)
    panel-card.component.ts    (ar-panel-card)
    pill.component.ts          (ar-pill)
    status-dot.component.ts    (ar-status-dot)
    kpi-card.component.ts      (ar-kpi-card)
    bar-row.component.ts       (ar-bar-row)
    line-chart.component.ts    (ar-line-chart)
    chart-tabs.component.ts    (ar-chart-tabs)
    agenda-grid.component.ts   (ar-agenda-grid — novo, sem precedente no backoffice)
  home/
    panel-home.component.ts    (ar-panel-home — tela Início; substitui o placeholder atual)
  agenda/
    panel-agenda.component.ts
  finance/
    panel-finance.component.ts
  tournaments/
    panel-tournaments.component.ts
  courts/
    panel-courts.component.ts
  team/
    panel-team.component.ts
  profile/
    panel-profile.component.ts
```

Nomes de arquivo/seletor em inglês (convenção do CLAUDE.md raiz: "português nas strings/UI, inglês no código"); rotas (URL) continuam em português, seguindo o padrão já existente (`entrar`, `cadastro`, `painel`).

O `panel-home.component.ts` atual (placeholder) é apagado e substituído pelo novo `home/panel-home.component.ts` real.

## Kit de UI compartilhado

Réplica direta das contrapartes do backoffice (`kpi-card`, `page-header`, `panel-card`, `pill`, `status-dot`, `bar-row`, `line-chart` são praticamente cópias 1:1, trocando `bo-`→`ar-` e `--nx-*` já é o mesmo namespace de tokens). Diferenças relevantes:

- **`ar-kpi-card`**: no protótipo (`ArKpiCard`), além de `label`/`value`/`delta` aceita um ícone opcional no canto superior direito e uma 4ª tonalidade `flat` (sem seta, cor neutra) além de `green`/`red`/`orange`. Texto fixo "vs semana anterior" (não "vs mês anterior" como no backoffice). API:
  ```ts
  label = input.required<string>();
  value = input.required<string>();
  delta = input('');
  deltaTone = input<'green' | 'red' | 'orange' | 'flat'>('green');
  icon = input<PanelIconName | null>(null);
  ```
- **`ar-chart-tabs`**: no backoffice as abas de gráfico são só decorativas (classe `active` fixa no primeiro botão). No protótipo da arena elas trocam o dado exibido de verdade (Início: Faturamento/Reservas/Ocupação; Agenda: Dia/Semana; Torneios: ativos/encerrados). Vira componente com `tabs = input.required<string[]>()`, `active = input.required<string>()`, `change = output<string>()`, estilizado com a mesma classe global `.ar-chart-tabs` usada em `styles.scss`.
- **`ar-agenda-grid`**: novo. Recebe lista de quadras e de reservas (`{ courtId, start, dur, status, client }[]`) e desenha grade 07:00–22:00 em slots de 30min, com blocos posicionados por `top`/`height` calculados a partir do horário, cores por status (`confirmada`/`pendente`/`manutencao`) e uma linha "agora" (usa a hora real do relógio do navegador, não um valor fixo como no protótipo — fora da janela 07:00–22:00 a linha simplesmente não aparece).

## Classes globais novas (`src/styles.scss`)

Adiciono ao arquivo existente (que já tem os tokens `--nx-*` e as classes `.ar-*` do fluxo de auth), sem duplicar nada:
`.ar-mini-btn` / `.ar-mini-btn-primary`, `.ar-ghost-btn`, `.ar-search-box`, `.ar-bell-btn`, `.ar-chip`, `.ar-row` / `.ar-row-icon` / `.ar-row-body` / `.ar-row-title` / `.ar-row-meta`, `.ar-shortcut`, `.ar-filter-bar`. Conteúdo copiado das equivalentes `bo-*` do `backoffice/src/styles.css`, sem alteração visual.

## As 7 telas

Todas seguem o mesmo esqueleto: `<ar-panel-shell>` → `<ar-page-header>` (título, subtítulo, ações) → corpo com padding `22px 32px 28px`.

1. **Início** (`ar-panel-home`, rota `painel`) — 5 `ar-kpi-card` (ocupação, faturamento hoje, reservas hoje, torneios ativos, avaliação média); card com `ar-chart-tabs` (Faturamento/Reservas/Ocupação) + `ar-line-chart`; card de ocupação por quadra (`ar-bar-row` × 3); lista de reservas de hoje; coluna direita: torneios ativos (mini-cards), avaliações recentes (com estrelas via `ar-icon` star), atalhos (grid 2×2 com `.ar-shortcut`).
2. **Agenda** (`ar-panel-agenda`, rota `painel/agenda`) — header com `ar-chart-tabs` Dia/Semana + botão "Nova reserva"; `ar-agenda-grid` à esquerda; lista lateral filtrável (chips Todas/Confirmadas/Pendentes/Bloqueios) à direita.
3. **Financeiro** (`ar-panel-finance`, rota `painel/financeiro`) — 4 KPIs (saldo, recebido no mês, taxa da plataforma, pendências); gráfico de faturamento; tabela de movimentações com filtro por chip (Todos/Recebimentos/Saques); coluna direita: form de saque (visual) + recebimento por quadra (`ar-bar-row`).
4. **Torneios** (`ar-panel-tournaments`, rota `painel/torneios`) — 3 KPIs; `ar-chart-tabs` ativos/encerrados; grid 3 colunas de cards de torneio (progresso de inscritos, receita, botão gerenciar).
5. **Quadras** (`ar-panel-courts`, rota `painel/quadras`) — 3 KPIs; grid 3 colunas de cards de quadra (status, preço/h, reservas hoje, ocupação 7d, editar/ver agenda).
6. **Equipe** (`ar-panel-team`, rota `painel/equipe`) — 3 KPIs; tabela de membros (avatar, nome, e-mail, cargo, status, gerenciar).
7. **Perfil** (`ar-panel-profile`, rota `painel/perfil`) — capa com gradiente SVG, avatar/nome/badge de perfil ativo, stats (avaliação/avaliações/seguidores/visitas), descrição, modalidades, endereço, completude do perfil, horários de funcionamento, contato (WhatsApp/Instagram). Tudo somente leitura — botões "Editar" ficam visuais.

Cada tela usa dados mock locais no próprio componente (arrays `protected readonly`), no mesmo formato dos arrays já usados em `panel-arenas.component.ts`/`panel-home.component.ts` do backoffice.

## Roteamento

`app.routes.ts` ganha, no lugar da rota única `painel`, estas 7 rotas (todas com `canActivate: [authGuard]`, lazy `loadComponent`):

```
painel                → home/panel-home.component.ts
painel/agenda         → agenda/panel-agenda.component.ts
painel/financeiro     → finance/panel-finance.component.ts
painel/torneios       → tournaments/panel-tournaments.component.ts
painel/quadras        → courts/panel-courts.component.ts
painel/equipe         → team/panel-team.component.ts
painel/perfil         → profile/panel-profile.component.ts
```

O item "Torneios" do nav mostra badge fixo `2` (igual ao protótipo — mock, não contagem real).

## Fora de escopo

- Integração Firestore (reservas, torneios, financeiro, equipe, perfil real).
- Handlers reais de ação (criar reserva/torneio/quadra, convidar membro, editar perfil, solicitar saque).
- Seletor de múltiplas unidades por conta.
- Testes automatizados de UI (fora o que já existe de convenção no projeto).

## Testes

Sem lógica de negócio nova (é composição de UI + dados mock), então não há suíte de testes de domínio a escrever aqui — mantém o padrão do backoffice, que também não tem specs para as telas do painel. `ar-agenda-grid` é o único componente com cálculo não trivial (posição dos blocos por horário); qualquer teste, se fizer sentido, cobre só essa função pura de conversão minuto→posição.
