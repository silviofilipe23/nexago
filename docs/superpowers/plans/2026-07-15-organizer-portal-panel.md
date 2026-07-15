# Painel do Organizador (web) v1 — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o placeholder de `/painel` do portal `organizer` pelo painel real: Início, Torneios (lista+detalhe), Ligas (lista+detalhe) e Financeiro, com dados reais do Firestore do organizador logado.

**Architecture:** Mesma receita dos portais `athlete`/`arena`: componentes standalone Angular (signals, OnPush, prefixo `og-`), data layer por cópia adaptada dos repositories do portal do atleta, filtrando por `managerId == uid`; carteira espelha o contrato do Flutter (`organizer_wallet_repository.dart`) com as callables já deployadas. Zero mudança em rules/functions/índices. Spec: `docs/superpowers/specs/2026-07-15-organizer-portal-panel-design.md`.

**Tech Stack:** Angular 20 standalone (workspace `frontend/`), Firebase JS SDK (auth/firestore/functions), SCSS com tokens `--nx-*`.

## Global Constraints

- Projeto: `frontend/projects/organizer/` — só arquivos dele podem mudar (exceto nada: nenhum outro projeto/arquivo).
- Convenções Angular do repo (frontend/.claude/CLAUDE.md): standalone (sem `standalone: true` explícito), `input()`/`output()`, `computed()`, `ChangeDetectionStrategy.OnPush`, control flow nativo (`@if`/`@for`), sem `ngClass`/`ngStyle`, `inject()`.
- Prefixo de seletor/classe: `og-*`. Strings de UI em português; código em inglês. Rotas: `/painel` (Início), `/painel/torneios`, `/painel/torneios/:id`, `/painel/ligas`, `/painel/ligas/:id`, `/painel/financeiro`.
- Paths de dados (NÃO inventar outros): `tournaments` e `leagues` top-level com `where('managerId','==',uid)`; `artifacts/{projectId}/public/data/inscriptions` e `.../matches` com `where('tournamentId','==',...)`; `organizerWallets/{uid}` + subcoleção `ledger`; `organizerWithdrawals` com `where('organizerId','==',uid)`. `projectId` = mesmo mecanismo usado em `frontend/projects/athlete/src/app/data/matches-repository.ts` (ver como o athlete resolve o appId/projectId — copiar).
- Callables (já deployadas): `setOrganizerPayoutPixKey({pixKey, pixKeyType})`, `requestOrganizerWithdrawal({amountReais, pixKey, pixKeyType})` — contratos em `nexago_app/lib/features/organizer/data/organizer_wallet_repository.dart:152-190`.
- Sem testes unitários novos (convenção dos portais). Gate por task: `cd frontend && npx ng build organizer` verde.
- O usuário trabalha na main em outra sessão: `git status --short` IMEDIATAMENTE antes de cada commit; `git add` só dos paths do próprio task; nunca rebase/amend do que não criou.
- Referências visuais/estruturais (LER antes de criar componentes): shell e telas do coach (`frontend/projects/coach/src/app/painel/`) e arena (`frontend/projects/arena/src/app/painel/`); auth do organizer já existente (`frontend/projects/organizer/src/app/auth/`, `painel/panel-home.component.ts` placeholder, `app.routes.ts`).

---

### Task 1: Data layer do painel

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/data/firestore.ts` (helper de app/db — copiar o padrão de `frontend/projects/athlete/src/app/data/` / como o auth.service do organizer inicializa o app; reusar a mesma instância)
- Create: `frontend/projects/organizer/src/app/painel/data/functions.ts` (helper `httpsCallable` — padrão do athlete `data/functions.ts`)
- Create: `frontend/projects/organizer/src/app/painel/data/tournament.model.ts`
- Create: `frontend/projects/organizer/src/app/painel/data/tournaments-repository.ts`
- Create: `frontend/projects/organizer/src/app/painel/data/league.model.ts`
- Create: `frontend/projects/organizer/src/app/painel/data/leagues-repository.ts`
- Create: `frontend/projects/organizer/src/app/painel/data/inscriptions-repository.ts`
- Create: `frontend/projects/organizer/src/app/painel/data/matches-repository.ts`
- Create: `frontend/projects/organizer/src/app/painel/data/wallet-repository.ts`

**Interfaces (contratos que as Tasks 2-5 consomem — exatos):**

```ts
// tournament.model.ts
export type OrganizerTournamentStatus = 'inscricoes' | 'andamento' | 'concluido' | 'cancelado';
export interface OrganizerTournamentCategory {
  id: string;            // categoryId usado em inscriptions/matches
  name: string;
  maxTeams: number | null;
}
export interface OrganizerTournament {
  id: string;
  name: string;
  sportLabel: string;
  status: OrganizerTournamentStatus;
  startAt: Date | null;
  endAt: Date | null;
  city: string | null;
  location: string | null;
  categories: OrganizerTournamentCategory[];
  capacity: number | null;
  leagueId: string | null;
}

// tournaments-repository.ts
export async function listMyTournaments(uid: string): Promise<OrganizerTournament[]>;
export async function getTournament(id: string): Promise<OrganizerTournament | null>;

// league.model.ts
export interface OrganizerLeagueStage {
  id: string; name: string; tournamentId: string | null; startAt: Date | null;
}
export interface OrganizerLeague {
  id: string; name: string; sportLabel: string; seasonLabel: string | null;
  city: string | null; stages: OrganizerLeagueStage[];
}

// leagues-repository.ts
export async function listMyLeagues(uid: string): Promise<OrganizerLeague[]>;
export async function getLeague(id: string): Promise<OrganizerLeague | null>;

// inscriptions-repository.ts
export interface TournamentInscription {
  id: string; tournamentId: string; categoryId: string | null;
  teamName: string;                 // nome da dupla/equipe ou jogadores
  participantNames: string[];
  paymentStatus: string;            // raw (ex.: paid/pending/…)
  paid: boolean;
  createdAt: Date | null;
}
export async function listInscriptions(tournamentId: string): Promise<TournamentInscription[]>;

// matches-repository.ts
export interface TournamentMatch {
  id: string; tournamentId: string; categoryId: string | null;
  round: string | null;             // rótulo da fase/rodada se houver
  team1Label: string; team2Label: string;
  score: string | null;             // placar formatado (sets) ou null se não jogado
  winnerSide: 1 | 2 | null;
  scheduledAt: Date | null;
  court: string | null;
}
export async function listMatches(tournamentId: string): Promise<TournamentMatch[]>;

// wallet-repository.ts  (espelho 1:1 do Dart organizer_wallet_repository.dart)
export interface OrganizerWalletSummary { availableReais: number; pendingReais: number; payoutPixKey: string; payoutPixKeyType: string; }
export interface OrganizerLedgerEntry { id: string; netReais: number; grossReais: number; platformFeeReais: number; createdAt: Date | null; }
export interface OrganizerWithdrawal { id: string; amountReais: number; status: string; pixKey: string; createdAt: Date | null; payoutStatus: string | null; }
export function watchWallet(uid: string, cb: (w: OrganizerWalletSummary) => void): () => void;   // onSnapshot, retorna unsubscribe
export function watchLedger(uid: string, cb: (l: OrganizerLedgerEntry[]) => void, limit?: number): () => void;
export function watchWithdrawals(uid: string, cb: (w: OrganizerWithdrawal[]) => void): () => void;
export async function setPayoutPixKey(pixKey: string, pixKeyType: string): Promise<void>;
export interface WithdrawalRequestResult { withdrawalId: string; status: string; payoutStatus: string | null; autoProcessed: boolean; message: string | null; }
export async function requestWithdrawal(amountReais: number, pixKey: string, pixKeyType: string): Promise<WithdrawalRequestResult>;
```

- [ ] **Step 1: Estudar as referências** — ler `frontend/projects/athlete/src/app/data/tournaments-repository.ts` (mapeamento de campos, resolução do projectId, helpers `toDate`/`optionalStr`), `matches-repository.ts` (formato de placar/labels de time), `tournament-registrations-repository.ts` (campos de inscrição: `participantUids`, nomes, paymentStatus — mapear os campos REAIS que existem lá), `leagues-repository.ts`, e `nexago_app/lib/features/organizer/data/league_stage_tournament_factory.dart` (campos de vínculo etapa↔torneio: usar exatamente os que o factory grava). Para a carteira: `organizer_wallet_repository.dart` (transcrever contratos).
- [ ] **Step 2: Implementar os 9 arquivos** com os contratos acima. Mapeamentos de campo copiados do athlete (não inventar nomes de campo; na dúvida, o campo que o athlete/Flutter usa é a verdade). `listMyTournaments`: `query(collection(db,'tournaments'), where('managerId','==',uid))`, ordenar em memória por `startAt` desc. `listMyLeagues`: idem em `leagues`.
- [ ] **Step 3: Gate** — `cd frontend && npx ng build organizer` verde (os arquivos ainda sem consumidores; sem erros TS).
- [ ] **Step 4: Commit** — `git add frontend/projects/organizer && git commit -m "feat(organizer): data layer do painel (torneios, ligas, inscrições, jogos, carteira)"`

---

### Task 2: Shell do painel + rotas + Início

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/panel-shell.component.ts` (+ `.html`/`.scss` se seguir o padrão do coach; inline se pequeno)
- Create: `frontend/projects/organizer/src/app/painel/inicio/panel-inicio.component.ts`
- Modify: `frontend/projects/organizer/src/app/app.routes.ts` (rotas filhas de `/painel` com o shell como layout; guards existentes mantidos)
- Delete/Repurpose: `frontend/projects/organizer/src/app/painel/panel-home.component.ts` (placeholder morre; o "em construção" some)

**Interfaces:**
- Consumes: `listMyTournaments`, `listMyLeagues`, `watchWallet` (Task 1); `auth.service.ts` do organizer (uid do usuário logado, signOut).
- Produces: shell com `<router-outlet/>` e navegação para as rotas das Tasks 3-5 (as rotas de torneios/ligas/financeiro podem apontar para componentes ainda inexistentes SOMENTE se lazy — usar `loadComponent` e criar stubs mínimos nesta task para o build passar; os stubs são substituídos nas Tasks 3-5).

- [ ] **Step 1: Shell** — sidebar `og-panel-shell` espelhando o shell do coach (`frontend/projects/coach/src/app/painel/` — ler o componente de shell de lá): itens Início, Torneios, Ligas, Financeiro + botão Sair (auth.signOut → `/entrar`). Marca NexaGO + rótulo "Organizador".
- [ ] **Step 2: Rotas** — `/painel` vira rota com `component: PanelShellComponent` e filhos lazy: `''` → Início, `torneios`, `torneios/:id`, `ligas`, `ligas/:id`, `financeiro`. Guards `authGuard, organizerGuard` permanecem no pai.
- [ ] **Step 3: Início** — `panel-inicio.component.ts`: 3 cards (`Eventos ativos` = torneios com status inscricoes|andamento; `Inscritos no total` = soma de `listInscriptions` dos torneios ativos — buscar em paralelo com `Promise.all`, máx. 10 torneios ativos; `Saldo disponível` = `watchWallet().availableReais` formatado BRL) + duas listas: "Seus torneios" (5 mais recentes, link para detalhe) e "Suas ligas" (idem). Estados: loading (skeleton simples), vazio ("Nenhum torneio ainda — crie pelo app nexaGO").
- [ ] **Step 4: Gate** — `npx ng build organizer` verde; conferir que `/painel` não referencia mais o placeholder.
- [ ] **Step 5: Commit** — `git add frontend/projects/organizer && git commit -m "feat(organizer): shell do painel e página Início com dados reais"`

---

### Task 3: Torneios — lista e detalhe

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/torneios/panel-torneios.component.ts` (lista; substitui o stub da Task 2)
- Create: `frontend/projects/organizer/src/app/painel/torneios/torneio-detail.component.ts` (detalhe; substitui o stub)

**Interfaces:**
- Consumes: `listMyTournaments`, `getTournament`, `listInscriptions`, `listMatches` (Task 1). Rota `torneios/:id` com `withComponentInputBinding()` → `input()` `id`.

- [ ] **Step 1: Lista** — cards/tabela com nome, esporte, status (badge com as 4 cores: inscricoes=laranja, andamento=verde, concluido=cinza, cancelado=vermelho), data (`startAt` pt-BR), cidade, nº de categorias, inscritos (contagem via `listInscriptions` só quando barato — carregar contagens em paralelo limitado a 20 torneios; senão exibir "—"). Filtro simples por status (chips Todos/Inscrições/Andamento/Concluídos). Clique → `torneios/:id`. Visual espelha a listagem de torneios do arena (`panel-tournaments.component.ts`).
- [ ] **Step 2: Detalhe** — cabeçalho (nome, status, datas, local) + seções:
  - **Categorias**: para cada `categories[]` do torneio: nome, inscritos da categoria (filtrando `listInscriptions` por `categoryId`) / `maxTeams`.
  - **Inscritos**: tabela (equipe/participantes, categoria, pagamento — badge pago/pendente via `paid`, data).
  - **Jogos**: tabela agrupada por categoria (rodada, confronto `team1Label × team2Label`, placar ou "não jogado", quadra/horário quando houver).
  - Estados vazios em cada seção ("Nenhuma inscrição ainda", "Chaves ainda não geradas").
- [ ] **Step 3: Gate** — `npx ng build organizer` verde.
- [ ] **Step 4: Commit** — `git add frontend/projects/organizer && git commit -m "feat(organizer): torneios com lista e detalhe (categorias, inscritos, jogos)"`

---

### Task 4: Ligas — lista e detalhe

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/ligas/panel-ligas.component.ts`
- Create: `frontend/projects/organizer/src/app/painel/ligas/liga-detail.component.ts`

**Interfaces:**
- Consumes: `listMyLeagues`, `getLeague`, `getTournament` (para etapas com `tournamentId`), rota `ligas/:id`.

- [ ] **Step 1: Lista** — cards com nome, esporte, temporada (`seasonLabel`), cidade, nº de etapas. Clique → detalhe.
- [ ] **Step 2: Detalhe** — cabeçalho + lista de etapas: nome, data, status do torneio vinculado (quando `tournamentId` existir, buscar via `getTournament` e linkar para `/painel/torneios/:id`); etapa sem torneio ainda = "etapa não iniciada".
- [ ] **Step 3: Gate + Commit** — `npx ng build organizer` verde; `git add frontend/projects/organizer && git commit -m "feat(organizer): ligas com lista e detalhe de etapas"`

---

### Task 5: Financeiro

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/financeiro/panel-financeiro.component.ts`

**Interfaces:**
- Consumes: `watchWallet`, `watchLedger`, `watchWithdrawals`, `setPayoutPixKey`, `requestWithdrawal` (Task 1); referência de UX: `nexago_app/lib/features/organizer/presentation/organizer_financial_page.dart` (LER para espelhar validações e textos) e o Financeiro do arena (`frontend/projects/arena/src/app/painel/finance/`).

- [ ] **Step 1: Tela** — seções:
  - **Saldo**: cards Disponível e Pendente (BRL).
  - **Chave PIX de saque**: exibe a atual (`payoutPixKey`/tipo); formulário para definir/trocar (tipos: cpf, cnpj, email, phone, evp — conferir os aceitos na tela Flutter) via `setPayoutPixKey`, com feedback de sucesso/erro.
  - **Solicitar saque**: input de valor + usa a chave salva; validações espelhadas do Flutter (valor > 0, ≤ disponível, chave definida); chama `requestWithdrawal` e mostra resultado (`autoProcessed`/mensagem). Desabilitado com saldo zero.
  - **Extrato**: tabela do ledger (data, bruto, taxa, líquido).
  - **Saques**: tabela (data, valor, chave, status + payoutStatus).
  - Unsubscribe dos 3 watchers no destroy (`DestroyRef`).
- [ ] **Step 2: Gate + Commit** — `npx ng build organizer` verde; `git add frontend/projects/organizer && git commit -m "feat(organizer): financeiro com carteira, extrato e saque"`

---

### Task 6: Passe final

- [ ] **Step 1:** `cd frontend && npx ng build organizer --configuration production` verde (budgets 8kB/12kB por componente — se algum SCSS estourar, enxugar estilos, não subir o budget).
- [ ] **Step 2:** Varredura de consistência: nenhum `any` novo, nenhum stub restante das rotas, todos os estados vazio/loading presentes, textos pt-BR.
- [ ] **Step 3:** Registrar no ledger SDD e atualizar memória do projeto. QA manual (dono, contra dev): login organizador real → Início com números; torneio com inscritos/jogos reais; liga com etapas; financeiro com saldo/extrato; solicitar saque com saldo real cria doc em `organizerWithdrawals`.

---

## ADENDO (15/07, pós-Task 2) — pivot para a IA do protótipo mergeado

Descoberta: os merges f89a005/8cd6c4a/412fbc1/bd669e9 trouxeram um protótipo
mockado completo do painel (shell próprio em `painel/shell/`, Início, eventos
com detalhe/categoria/seeds, inscrições, chaveamento com grupos/chave/jogos/
agendamento/placar, financeiro, comunicação, config, wizards e UI kit `og-*`).
A Task 2 deste plano, sem saber, sobrescreveu o Início do protótipo e as rotas.

Decisão (autonomia concedida pelo dono): **a IA do protótipo vence**. As
Tasks 3-5 originais são substituídas por:

- **Task O3 — Restauração + Início real na IA do protótipo**: restaurar rotas
  e shell do protótipo (`painel/shell/panel-shell.component.ts`); recuperar o
  Início do protótipo (versão de 412fbc1) e trocar os dados mock pelos reais
  (repos da Task O1), preservando o design; remover shell/stubs duplicados
  criados pela Task 2 (`painel/panel-shell.component.ts`, `painel/torneios/*`,
  `painel/ligas/*`, `painel/financeiro/panel-financeiro.component.ts`).
- **Task O4 — Eventos reais**: `eventos-list` (listMyTournaments +
  listMyLeagues na IA da tela), `torneio-detalhe` e `categoria-detalhe`
  (getTournament/listInscriptions/listMatches). Wizards e seeds ficam mock.
- **Task O5 — Inscrições reais**: tela `inscricoes` agregando inscrições dos
  torneios do organizador (listMyTournaments → listInscriptions), com filtro
  por torneio/categoria/status de pagamento conforme o design da tela.
- **Task O6 — Chaveamento real (read-only)**: `grupos`/`jogos`/`placar`/
  `agendamento` exibindo dados reais de listMatches (agrupamento por
  categoria/fase, placares, quadra/horário); geração/edição de chave e
  lançamento de placar ficam mock/fase 2 (operação continua no app).
- **Task O7 — Financeiro real**: dados reais da carteira na tela
  `financeiro/financeiro.component.ts` do protótipo (watchWallet/watchLedger/
  watchWithdrawals/setPayoutPixKey/requestWithdrawal), preservando o design.
- **Task O8 — Passe final** (igual à Task 6 original; inclui remover qualquer
  stub/duplicado remanescente; comunicacao/config/wizards permanecem mock,
  documentados como fase 2).
