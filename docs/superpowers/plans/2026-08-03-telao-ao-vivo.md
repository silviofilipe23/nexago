# Telão ao vivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telão 1920×1080 para TV da arena com jogos ao vivo por quadra, placar em tempo real, fila de próximos jogos e chamada de atletas + página de configuração `/painel/telao` no portal do organizador.

**Architecture:** Camada de dados read-only (2 listeners: doc do torneio + query de matches, hidratação teams→public_profiles) alimenta um `TelaoScreenComponent` desenhado num canvas lógico 1920×1080 e escalado por wrapper (`TelaoStageComponent`). O mesmo componente serve a rota fullscreen `/telao/:tournamentId` (authGuard, fora do shell) e a pré-visualização da página de config. Config persistida em `tournaments/{id}.bigScreen` (updateDoc direto — rules já permitem managerId/staff manager).

**Tech Stack:** Angular 20 standalone zoneless (signals/computed/effect, OnPush), Firebase SDK modular direto, Karma/Jasmine.

**Spec:** `docs/superpowers/specs/2026-08-03-telao-ao-vivo-design.md`

## Global Constraints

- Zoneless: qualquer TestBed de componente precisa de `provideZonelessChangeDetection()`.
- Sem `standalone: true` explícito; `input()`/`computed()`; sem ngClass/ngStyle; control flow nativo.
- Budget `anyComponentStyle`: 8 kB warn / 12 kB error — estilos do telão divididos entre screen/court-card.
- Strings de UI em português; código em inglês. Fuso America/Sao_Paulo via helpers de `schedule-format.ts`.
- Leituras: `tournaments` e `matches` públicas; `public_profiles` exige auth (por isso a rota tem authGuard).
- Todos os comandos rodam de `frontend/` do worktree `telao-ao-vivo-painel-695505`.

---

### Task 1: Campos ao vivo no matches-repository + `watchMatches`

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/matches-repository.ts`

**Interfaces:**
- Produces: `TournamentMatch` ganha `liveScore: MatchLiveScore | null`, `currentSetIndex: number | null`, `servingTeamId: string`, `matchStartedAt: Date | null`; novo `export interface MatchLiveScore { setsA; setsB; currentGamesA; currentGamesB }`; novo `export function watchMatches(tournamentId, onChange: (m: TournamentMatch[]) => void, onError?): Unsubscribe` (labels SEM join de nomes — caem em `teamADescription ?? 'A definir'`).

- [x] Adicionar `MatchLiveScore` + `liveScoreFromRaw` + `intOf` (mesmo parse do athlete `matches-repository.ts:101`), campos no `TournamentMatch`, no `RawMatch` e no `rawMatchFromDoc` (`liveScore`, `currentSetIndex`, `servingTeamId`, `matchStartedAt`).
- [x] Extrair `rawToMatch(r: RawMatch, labelOf)` do mapeamento final de `listMatches` e reusar em `watchMatches` (onSnapshot na mesma query, imports `onSnapshot`/`Unsubscribe`).
- [x] `ng build organizer` compila. Commit: `feat(organizer): campos ao vivo + watchMatches no matches-repository`

### Task 2: `live-set-display.ts` (porte de matchLiveCurrentSet) — TDD

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/data/live-set-display.ts`
- Test: `frontend/projects/organizer/src/app/painel/data/live-set-display.spec.ts`

**Interfaces:**
- Consumes: `isSetWon`/`targetPointsForSet` de `match-scoring.ts`; `TournamentMatch` da Task 1.
- Produces: `LiveScoreFields = Pick<TournamentMatch, 'status'|'sets'|'liveScore'|'currentSetIndex'|'bestOf'>`; `matchClosedSets(m): {a,b}[]`; `matchSetWins(m): [number, number]`; `matchLiveCurrentSet(m): { setNumber, a, b } | null`.

Semântica idêntica ao athlete (`matches-repository.ts:239-284`), adaptada: status já normalizado (`'in_progress'`), `bestOf: 1|3` nunca nulo, sem caminho legado `resultA/resultB` (telão só mostra ao vivo/agendadas).

- [x] Specs: set corrente dentro de `sets[]` (mesa) tem prioridade; todos fechados → cai em `liveScore.currentGames*`; `null` fora do ao vivo; `matchSetWins` só conta set fechado quando ao vivo; tie-break (3º set de MD3 fecha em 15).
- [x] Rodar → falha (módulo não existe). Implementar. Rodar → passa.
- [x] Commit: `feat(organizer): helpers de placar ao vivo pro telão (live-set-display)`

### Task 3: `telao-selectors.ts` (lógica pura da tela) — TDD

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/telao/telao-selectors.ts`
- Test: `frontend/projects/organizer/src/app/painel/telao/telao-selectors.spec.ts`

**Interfaces:**
- Produces:
  - `courtNowOf(matches, courtId, nowMs): { kind: 'live'|'next'|'free'; match: TournamentMatch | null }` — ao vivo (desempate `matchStartedAt` mais recente) → próxima `scheduled` com `scheduledAt >= now − 30min` → livre.
  - `upcomingQueue(matches, courtIds, nowMs, limit = 6)` — `scheduled` futuras (tolerância −10 min) nas quadras selecionadas, ordenadas por horário e `matchNumber`.
  - `callOf(queue): { match, deadline: Date } | null` — 1º da fila, `deadline = scheduledAt − 5min`.
  - `courtPageOf(courtIds, pageIndex, pageSize = 4)` e `courtPageCount(count)` — paginação da rotação (wrap-around).
  - `teamShortLabel(label)` — `"Lucas Martins / Paula Silva"` → `"Lucas / Paula"`; sem `" / "` → `truncateName(label, 22)`.
  - Constantes exportadas: `COURTS_PER_PAGE = 4`, `ROTATE_INTERVAL_MS = 20_000`, `CALL_ANTECEDENCE_MS`, `QUEUE_GRACE_MS`, `COURT_NOW_GRACE_MS`.

- [x] Specs (fábrica local de `TournamentMatch` parcial): live vence next; 2 lives na quadra → começou por último; atrasada até 30 min ainda é `next`; fila ignora quadra fora da seleção, corta em 6, ordena; `callOf` calcula −5 min; paginação com 4/5/9 quadras (wrap); `teamShortLabel` com dupla, nome custom e um jogador só.
- [x] Rodar → falha. Implementar. Rodar → passa.
- [x] Commit: `feat(organizer): seletores puros do telão (quadra, fila, chamada, rotação)`

### Task 4: bigScreen no doc do torneio + watchTournament + fetchProfileDisplays + ícone tv

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament.model.ts` (`bigScreen: TelaoConfig | null` em `OrganizerTournament`; `export interface TelaoConfig { courtIds: string[]; showUpcoming: boolean; showCall: boolean; showAvatars: boolean; autoRotate: boolean }`)
- Modify: `frontend/projects/organizer/src/app/painel/data/tournaments-repository.ts` (`telaoConfigFromRaw` no `tournamentFromDoc`; `watchTournament(id, onChange, onError?): Unsubscribe` via onSnapshot; `saveTelaoConfig(tournamentId, config): Promise<void>` via updateDoc `{ bigScreen: config }`; `effectiveTelaoConfig(t): TelaoConfig` — defaults tudo ligado + todas as quadras; `courtIds` filtrado pelos ids existentes, vazio → todas)
- Modify: `frontend/projects/organizer/src/app/painel/data/teams-repository.ts` (`export interface ProfileDisplay { name: string; photoUrl: string | null }` + `fetchProfileDisplays(db, uids)` reusando `chunkedByIds`, fallbacks de foto iguais a `inscriptions-repository.ts:84`)
- Modify: `frontend/projects/organizer/src/app/painel/ui/icon.component.ts` (novo `'tv'`: `<rect x="2.5" y="5" width="19" height="13" rx="2" /><path d="M9 21h6" />`)

- [x] Implementar tudo; `ng build organizer` compila.
- [x] Commit: `feat(organizer): config bigScreen no torneio + watchTournament + perfis com foto`

### Task 5: TelaoDataService + TelaoStage + TelaoCourtCard + TelaoScreen

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/telao/telao-data.service.ts`
- Create: `frontend/projects/organizer/src/app/painel/telao/telao-stage.component.ts`
- Create: `frontend/projects/organizer/src/app/painel/telao/telao-court-card.component.ts`
- Create: `frontend/projects/organizer/src/app/painel/telao/telao-screen.component.ts`

**Interfaces:**
- `TelaoDataService` (`@Injectable()` SEM providedIn — provido pela página host): `tournamentId = signal<string | null>`, `tournament`, `matches`, `teams = signal<Map<string, TelaoTeamDisplay>>`, `connected`, `error`. Effect abre/fecha os 2 listeners (padrão `mesa-ao-vivo.component.ts:504`); hidratação incremental por teamId (só busca ids novos; merge no Map; falha silenciosa → fica no fallback).
- `TelaoTeamDisplay { label: string; short: string; sub: string | null; players: { initials: string; photoUrl: string | null }[] }` — `label` = `teamName` ?? `"Nome1 / Nome2"`; `short` via `teamShortLabel`; `sub` = `"Nome1 · Nome2"`; `players` na ordem p1/p2 com `initialsOf`.
- `TelaoStageComponent` (`og-telao-stage`): mede o host via ResizeObserver, `scale = min(w/1920, h/1080)`, centraliza; conteúdo projetado num canvas fixo 1920×1080 (`transform: scale`, origin top-left).
- `TelaoCourtCardComponent` (`og-telao-court-card`): inputs `courtName`, `kind: 'live'|'next'|'free'`, `match: TournamentMatch | null`, `categoryLabel: string`, `teamA/teamB: TelaoTeamDisplay | null`, `showAvatars: boolean`. Header: QUADRA + categoria·fase + badge (AO VIVO vermelho pulsante / EM SEGUIDA · hora / vazio). Linha de dupla: avatares sobrepostos (og-avatar 44), short bold + dot de saque (`servingTeamId === teamAId/BId`), sub em mute; placar: chips dos sets fechados (via `matchClosedSets`, lado vencedor em laranja) + caixa grande mono com pontos do set corrente (`matchLiveCurrentSet`). `next`: duplas sem placar. `free`: "Quadra livre".
- `TelaoScreenComponent` (`og-telao-screen`): injeta TelaoDataService. Header (marca nexaGO "Telão ao vivo", nome do evento, sub `sportLabel · local/cidade · dia`, relógio HH:MM:SS SP com tick 1 s). Grid 2×2 de cards + coluna "Próximos jogos" (380 px, se `showUpcoming`; 1º item destacado "apresentar-se à quadra"; rodapé "Acompanhe seu jogo… no app nexaGO"). Barra inferior (se `showCall`): pill CHAMADA + `A vs B — apresentar-se à {Quadra} até {HH:MM}`; direita "ATUALIZADO EM TEMPO REAL" + dot verde pulse (erro → "RECONECTANDO…" âmbar). Rotação: effect com setInterval `ROTATE_INTERVAL_MS` avança página quando `autoRotate && courtPageCount() > 1`. Fila usa TODAS as quadras selecionadas (não só a página visível).

- [x] Implementar; `ng build organizer` compila (checar budget de estilos).
- [x] Commit: `feat(organizer): tela do telão ao vivo (screen, court card, stage, data service)`

### Task 6: Rota fullscreen `/telao/:tournamentId` + sidebar

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/telao/telao-page.component.ts` (input `tournamentId` via `withComponentInputBinding`; `providers: [TelaoDataService]`; host 100dvh fundo `--nx-bg`; `<og-telao-stage>` ocupando a viewport com `<og-telao-screen />` dentro)
- Modify: `frontend/projects/organizer/src/app/app.routes.ts` (rota irmã de `painel`: `{ path: 'telao/:tournamentId', canActivate: [authGuard], title: 'Telão ao vivo — NexaGO Organizador', loadComponent: TelaoPageComponent }`)
- Modify: `frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts` (nav global: `{ label: 'Telão', icon: 'tv', link: '/painel/telao' }` depois de Links)

- [x] Implementar; build ok. Commit: `feat(organizer): rota fullscreen do telão + item na sidebar`

### Task 7: Página de config `/painel/telao`

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/telao/telao-config.component.ts`
- Modify: `frontend/projects/organizer/src/app/app.routes.ts` (filho global do painel: `{ path: 'telao', title: 'Telão ao vivo — NexaGO Organizador', loadComponent: TelaoConfigComponent }`)

Página (`providers: [TelaoDataService]`), layout 2 colunas (form 380 px + preview flex):
- Header: título "Telão ao vivo" + sub do mock; ações "Copiar link" (clipboard + feedback "Link copiado" 2 s) e "Abrir telão em tela cheia" (window.open `_blank`), desabilitadas sem evento selecionado.
- Card "Fonte dos jogos / Evento exibido": select nativo estilizado com `listMyTournaments(uid)` ordenado (em andamento primeiro), seleção refletida em `?evento=` (router navigate, `queryParamsHandling: 'merge'`); default: 1º em andamento, senão 1º. Effect: `svc.tournamentId.set(selecionado)`.
- Card "Quadras no telão": checkbox por quadra do torneio (`effectiveTelaoConfig`) com status à direita (AO VIVO pill vermelha / hora do próximo / '—' via `courtNowOf`); não deixa desmarcar a última; cada mudança → `saveTelaoConfig`.
- Card "Exibição / O que aparece": 4 switches (Próximos jogos, Chamada de atletas, Avatares dos atletas, Rotação automática — sublabels do mock) → `saveTelaoConfig`.
- Card "TV da arena": instruções v1 (na TV, logar e abrir o link; botão copiar de novo).
- Preview: kicker "PRÉ-VISUALIZAÇÃO · 1920×1080" + pill verde "TRANSMITINDO" quando `svc.connected() && !svc.error()`; `<og-telao-stage>` com aspect-ratio 16/9 contendo `<og-telao-screen />`.

- [x] Implementar; build ok. Commit: `feat(organizer): página de configuração do telão no painel`

### Task 8: Verificação final

- [x] `npx ng test organizer --watch=false --browsers ChromeHeadless` — suite inteira verde.
- [x] `npx ng build organizer` — sem erros/budget.
- [x] Self-review do diff completo (git diff main...HEAD) — checar imports mortos, strings, acessibilidade básica (role/aria nos switches), cleanup de listeners.
- [x] Commit final + push + PR para main.

## Self-review do plano

- Cobertura da spec: acesso/rota (T6), config no doc (T4/T7), 4 recursos (T3/T5/T7), placar real (T2/T5), preview compartilhado (T5/T7), erros/casos-limite (grace/fallbacks em T3, reconexão em T5), testes (T2/T3/T8). ✔
- Tipos consistentes entre tasks (TelaoConfig, TelaoTeamDisplay, TournamentMatch estendido). ✔
- Sem placeholders. ✔
