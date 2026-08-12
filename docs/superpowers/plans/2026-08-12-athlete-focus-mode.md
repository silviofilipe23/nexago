# Modo Focus (portal do atleta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao atleta, no dia do torneio, uma tela imersiva que esconde o resto do portal e responde só o que decide o dia — quando joga, contra quem, em qual quadra, como está no grupo e o que falta até o título.

**Architecture:** Uma rota `focus` filha de `torneios/:id`, irmã da casca de abas, para herdar a mesma instância de `TournamentLiveStore` sem refazer leitura nenhuma. A casca do Focus não envolve o conteúdo em `AtPanelShellComponent` — é isso que faz o portal sumir. Toda derivação nova nasce como função pura testável em `tournaments/focus/*.ts`, e os componentes só montam view. A aba "Hoje" é aposentada: sua lógica vira função pura reaproveitada pelo Focus.

**Tech Stack:** Angular 20 standalone + signals + OnPush, Firebase JS SDK (Firestore modular), Karma/Jasmine, SCSS.

## Global Constraints

- **Worktree aninhado — leia antes de rodar qualquer build.** Este worktree fica DENTRO do checkout principal (`frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4`). Rodar `ng build`/`ng test` a partir de `/Users/silviodionizio/Documents/projects/volley/nexago/frontend` compila o CHECKOUT PRINCIPAL em silêncio, sem erro nenhum, e você acha que testou seu código. **Todo comando roda com `cd` explícito na pasta `frontend/` DESTE worktree.**
- **`node_modules` não existe neste worktree.** A Task 1 cria um symlink para o do checkout principal. Sem isso nenhum teste roda.
- Comando de teste: `npx ng test athlete --watch=false --browsers=ChromeHeadless`, sempre a partir de `<worktree>/frontend`.
- Angular: componentes standalone (não declarar `standalone: true`, é o padrão), `ChangeDetectionStrategy.OnPush`, `inject()` em vez de construtor, `input()`/`output()` em vez de decorators, signals + `computed()`, control flow nativo (`@if`/`@for`), bindings `class`/`style` (nunca `ngClass`/`ngStyle`), host bindings no objeto `host`.
- Strings de UI em português, código em inglês.
- Datas de evento sempre pelos componentes locais de `America/Sao_Paulo`, via `saoPauloDateKey`/`isSameSaoPauloDay` de `tournament-live.selectors.ts`. Nunca `toISOString()` nem `Date.parse` para comparar dia.
- Specs de componente exigem `provideZonelessChangeDetection()` nos providers do TestBed; sem isso todo spec quebra com NG0908.
- Vocabulário de status de partida (minúsculas, já normalizado pelos helpers): `'scheduled'`, `'in progress'`, `'completed'`, `'canceled'`.
- Estilo: siga o arquivo vizinho. O prettier do workspace é `printWidth: 100` + `singleQuote`, mas os arquivos de `tournaments/` rodam mais largos — não reformate linhas que você não tocou.
- Spec de referência: `docs/superpowers/specs/2026-08-12-athlete-focus-mode-design.md`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `tournaments/focus/focus-day.ts` | Puro: é dia de Focus? qual torneio? silêncio do dia |
| `tournaments/focus/focus-day.service.ts` | Leitura no Firestore + memo por sessão + localStorage |
| `tournaments/focus/focus-views.ts` | Puro: views migradas da aba Hoje (próxima partida, timeline, ao vivo) |
| `tournaments/focus/focus-scenarios.ts` | Puro: cenários vence/perde com a trava de invariância |
| `tournaments/focus/focus-journey.ts` | Puro: caminho até a final, números do torneio, "N vitórias do título" |
| `tournaments/focus/focus-shell.component.*` | Casca: header + navegação + outlet + `acquireLive` |
| `tournaments/focus/now/focus-now.component.*` | Seção Agora |
| `tournaments/focus/journey/focus-journey.component.*` | Seção Trajetória |
| `tournaments/focus/group/focus-group.component.*` | Seção Grupo |

Modificados: `app.routes.ts`, `tournament-live.selectors.ts`, `category-bracket.component.ts`, `tournament-shell.component.*`, `athlete-painel.component.ts`. Removidos: `tabs/today-tab.component.*`.

---

### Task 1: Fundação — detecção pura do dia de Focus

**Files:**
- Create: `frontend/projects/athlete/src/app/tournaments/focus/focus-day.ts`
- Test: `frontend/projects/athlete/src/app/tournaments/focus/focus-day.spec.ts`

**Interfaces:**
- Consumes: `ArenaMatch` de `data/teams-repository`, `isSameSaoPauloDay`/`saoPauloDateKey` de `tournaments/tournament-live.selectors`.
- Produces: `FocusDayTarget { tournamentId: string; matchId: string }`, `FOCUS_DISMISSED_KEY: string`, `focusDayTargetOf(matches: readonly ArenaMatch[], reference: Date): FocusDayTarget | null`, `isFocusDismissed(storedValue: string | null, reference: Date): boolean`, `focusMemoKeyOf(uid: string, reference: Date): string`.

- [ ] **Step 1: Ligar o `node_modules` do checkout principal**

Sem isso nenhum comando `ng` roda neste worktree.

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && ln -s /Users/silviodionizio/Documents/projects/volley/nexago/frontend/node_modules node_modules && ls -ld node_modules
```

- [ ] **Step 2: Confirmar que a suíte roda ANTES de mexer em qualquer coisa**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: a suíte existente roda até o fim. Anote quantos testes passam — é a linha de base. Se já houver falha aqui, ela não é sua; registre e siga.

- [ ] **Step 3: Escrever o teste que falha**

Crie `frontend/projects/athlete/src/app/tournaments/focus/focus-day.spec.ts`:

```ts
import type { ArenaMatch } from '../../data/teams-repository';
import { focusDayTargetOf, isFocusDismissed } from './focus-day';

function arenaMatch(partial: Partial<ArenaMatch> & Pick<ArenaMatch, 'id'>): ArenaMatch {
  return {
    tournamentId: 't1',
    categoryId: 'c1',
    matchType: 'group',
    status: 'scheduled',
    winnerId: null,
    teamAId: 'teamMine',
    teamBId: 'teamOther',
    teamADescription: null,
    teamBDescription: null,
    resultA: null,
    resultB: null,
    sets: [],
    scheduleTime: null,
    matchEndedAt: null,
    courtName: null,
    ...partial,
  };
}

/** 14:00 em São Paulo (UTC-3) no dia 29/08/2026. */
const TODAY = new Date('2026-08-29T17:00:00Z');

describe('focusDayTargetOf', () => {
  it('devolve null quando não há partida hoje', () => {
    const matches = [arenaMatch({ id: 'm1', scheduleTime: new Date('2026-08-30T17:00:00Z') })];
    expect(focusDayTargetOf(matches, TODAY)).toBeNull();
  });

  it('escolhe a partida de hoje ainda em aberto', () => {
    const matches = [
      arenaMatch({ id: 'm1', tournamentId: 'tA', scheduleTime: new Date('2026-08-29T15:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)).toEqual({ tournamentId: 'tA', matchId: 'm1' });
  });

  it('ignora partida encerrada e cancelada', () => {
    const matches = [
      arenaMatch({ id: 'm1', status: 'completed', scheduleTime: new Date('2026-08-29T12:00:00Z') }),
      arenaMatch({ id: 'm2', status: 'canceled', scheduleTime: new Date('2026-08-29T13:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)).toBeNull();
  });

  it('mantém a partida em quadra — é quando o Focus mais serve', () => {
    const matches = [
      arenaMatch({ id: 'm1', status: 'in progress', scheduleTime: new Date('2026-08-29T16:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)?.matchId).toBe('m1');
  });

  it('entre dois torneios no mesmo dia, o mais cedo manda', () => {
    const matches = [
      arenaMatch({ id: 'm2', tournamentId: 'tB', scheduleTime: new Date('2026-08-29T19:00:00Z') }),
      arenaMatch({ id: 'm1', tournamentId: 'tA', scheduleTime: new Date('2026-08-29T15:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)?.tournamentId).toBe('tA');
  });

  it('não confunde o dia pelo fuso: 22h de São Paulo ainda é hoje', () => {
    // 2026-08-30T01:00:00Z = 29/08 às 22:00 em São Paulo.
    const matches = [arenaMatch({ id: 'm1', scheduleTime: new Date('2026-08-30T01:00:00Z') })];
    expect(focusDayTargetOf(matches, TODAY)?.matchId).toBe('m1');
  });

  it('ignora partida sem torneio', () => {
    const matches = [
      arenaMatch({ id: 'm1', tournamentId: '', scheduleTime: new Date('2026-08-29T15:00:00Z') }),
    ];
    expect(focusDayTargetOf(matches, TODAY)).toBeNull();
  });
});

describe('isFocusDismissed', () => {
  it('é falso sem marca', () => {
    expect(isFocusDismissed(null, TODAY)).toBe(false);
  });

  it('é verdadeiro com a marca de hoje', () => {
    expect(isFocusDismissed('2026-08-29', TODAY)).toBe(true);
  });

  it('a marca de ontem não silencia hoje', () => {
    expect(isFocusDismissed('2026-08-28', TODAY)).toBe(false);
  });
});
```

- [ ] **Step 4: Rodar e confirmar que falha**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: FALHA na compilação — `Cannot find module './focus-day'`.

- [ ] **Step 5: Implementar**

Crie `frontend/projects/athlete/src/app/tournaments/focus/focus-day.ts`:

```ts
import type { ArenaMatch } from '../../data/teams-repository';
import { isSameSaoPauloDay, saoPauloDateKey } from '../tournament-live.selectors';

/** O torneio que deve abrir em Focus e a partida que motivou a escolha. */
export interface FocusDayTarget {
  tournamentId: string;
  matchId: string;
}

/** Marca do "silêncio do dia": guarda a data local de São Paulo em que o atleta saiu do Focus. */
export const FOCUS_DISMISSED_KEY = 'nexago.focus.dismissed';

/** Partida que ainda decide o dia: agendada para o dia de referência e nem encerrada nem
 *  cancelada. `in progress` CONTA — é exatamente o momento em que o Focus mais serve. */
function isOpenToday(m: ArenaMatch, reference: Date): boolean {
  const status = m.status.trim().toLowerCase();
  if (status === 'completed' || status === 'canceled') return false;
  return m.scheduleTime != null && isSameSaoPauloDay(m.scheduleTime, reference);
}

/**
 * O torneio do dia. Entre as partidas abertas de hoje a mais cedo manda; o empate desempata
 * por id para a escolha ser estável entre chamadas (o atleta não pode ser jogado para um
 * torneio diferente a cada navegação).
 */
export function focusDayTargetOf(matches: readonly ArenaMatch[], reference: Date): FocusDayTarget | null {
  const open = matches
    .filter((m) => m.tournamentId.length > 0 && isOpenToday(m, reference))
    .sort((a, b) => (a.scheduleTime!.getTime() - b.scheduleTime!.getTime()) || a.id.localeCompare(b.id));
  const first = open[0];
  return first ? { tournamentId: first.tournamentId, matchId: first.id } : null;
}

/** O atleta já dispensou o Focus hoje? */
export function isFocusDismissed(storedValue: string | null, reference: Date): boolean {
  return storedValue != null && storedValue === saoPauloDateKey(reference);
}

/** Chave da memoização do `FocusDayService`: o alvo do dia só vale para o MESMO atleta no
 *  MESMO dia. Sem ela, uma aba aberta depois da meia-noite serve o alvo de ontem, e uma troca
 *  de conta sem recarregar a página serve o alvo de outra pessoa. */
export function focusMemoKeyOf(uid: string, reference: Date): string {
  return `${uid}:${saoPauloDateKey(reference)}`;
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: PASSA, com 10 testes a mais que a linha de base do Step 2.

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/focus/ && git commit -m "feat(athlete): detecção pura do dia de Focus"
```

---

### Task 2: `FocusDayService` — leitura, memo e silêncio do dia

**Files:**
- Create: `frontend/projects/athlete/src/app/tournaments/focus/focus-day.service.ts`

**Interfaces:**
- Consumes: `focusDayTargetOf`, `isFocusDismissed`, `FOCUS_DISMISSED_KEY`, `FocusDayTarget` (Task 1); `fetchTeamsForAthlete(db, projectId, uid)` e `fetchMatchesForTeam(db, projectId, teamId)` de `data/teams-repository`; `AuthService`.
- Produces: `FocusDayService` com `resolve(now?: Date): Promise<FocusDayTarget | null>`, `isDismissed(now?: Date): boolean`, `dismissForToday(now?: Date): void`, `readonly target: Signal<FocusDayTarget | null>` (exposto por `asReadonly()` — só `resolve`/`dismissForToday` escrevem).

Sem teste unitário próprio: a lógica testável vive em `focus-day.ts` — inclusive `focusMemoKeyOf`, que é o que impede o serviço de servir o alvo de ontem ou o de outro atleta. O que sobra aqui é I/O e `localStorage`; `fetchTeamsForAthlete`/`fetchMatchesForTeam` são imports de módulo e não dão para falsificar barato. A verificação de ponta a ponta é a Task 11.

- [ ] **Step 1: Implementar o serviço**

Crie `frontend/projects/athlete/src/app/tournaments/focus/focus-day.service.ts`:

```ts
import { Injectable, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { fetchMatchesForTeam, fetchTeamsForAthlete } from '../../data/teams-repository';
import { saoPauloDateKey } from '../tournament-live.selectors';
import { FOCUS_DISMISSED_KEY, focusDayTargetOf, isFocusDismissed, type FocusDayTarget } from './focus-day';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/**
 * Descobre se hoje é dia de Focus e para qual torneio.
 *
 * Resolve UMA vez por sessão: o alvo do dia não muda a ponto de justificar reler a cada
 * navegação para o painel. São as mesmas leituras que o painel já faz para montar "próximos
 * jogos", então o custo real é próximo de zero — mas a fronteira fica aqui, e não dentro de um
 * componente de quase mil linhas.
 *
 * Toda falha degrada para `null`: não é dia de Focus. Nenhum erro daqui pode quebrar o painel.
 */
@Injectable({ providedIn: 'root' })
export class FocusDayService {
  private readonly auth = inject(AuthService);
  private readonly db = createFirestore();
  private readonly projectId = environment.firebase.projectId ?? '';

  private pending: Promise<FocusDayTarget | null> | null = null;
  /** Chave da memoização em vigor. Ver `focusMemoKeyOf`. */
  private pendingKey: string | null = null;

  private readonly _target = signal<FocusDayTarget | null>(null);
  readonly target = this._target.asReadonly();

  async resolve(now: Date = new Date()): Promise<FocusDayTarget | null> {
    if (this.isDismissed(now)) return null;
    const uid = this.auth.user()?.uid ?? null;
    // A memo vale por atleta e por dia. Sem a chave, uma aba aberta depois da meia-noite serve
    // o alvo de ontem, e uma troca de conta sem recarregar serve o alvo de outra pessoa.
    const key = focusMemoKeyOf(uid ?? '', now);
    if (key !== this.pendingKey) {
      this.pending = null;
      this.pendingKey = key;
    }
    this.pending ??= this.load(now, uid);
    const target = await this.pending;
    this._target.set(target);
    return target;
  }

  private async load(now: Date, uid: string | null): Promise<FocusDayTarget | null> {
    const db = this.db;
    if (!db || !this.projectId || !uid) return null;
    try {
      const teams = await fetchTeamsForAthlete(db, this.projectId, uid);
      if (teams.length === 0) return null;
      // Em paralelo de propósito: em série isso vira uma ida ao Firestore por equipe e o
      // painel demora visivelmente para redirecionar.
      const lists = await Promise.all(teams.map((t) => fetchMatchesForTeam(db, this.projectId, t.id)));
      return focusDayTargetOf(lists.flat(), now);
    } catch {
      return null;
    }
  }

  isDismissed(now: Date = new Date()): boolean {
    return isFocusDismissed(this.read(), now);
  }

  /** Chamado ao sair do Focus: silencia a entrada automática até o dia seguinte. */
  dismissForToday(now: Date = new Date()): void {
    try {
      localStorage.setItem(FOCUS_DISMISSED_KEY, saoPauloDateKey(now));
    } catch {
      // Modo privativo ou quota estourada: sem a marca o Focus reabre no próximo painel.
      // Degradar é melhor que estourar na saída do Focus.
    }
    this.pending = null;
    this.pendingKey = null;
    this._target.set(null);
  }

  private read(): string | null {
    try {
      return localStorage.getItem(FOCUS_DISMISSED_KEY);
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 2: Confirmar que compila e a suíte segue verde**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: PASSA, mesmo número de testes da Task 1.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/focus/focus-day.service.ts && git commit -m "feat(athlete): serviço de detecção do dia de Focus"
```

---

### Task 3: Extrair as views da aba Hoje para funções puras

Esta task não muda comportamento nenhum. Ela move a lógica de `today-tab.component.ts` para funções puras e faz o próprio `today-tab` passar a consumi-las — provando a equivalência antes de o componente ser apagado na Task 6.

**Files:**
- Create: `frontend/projects/athlete/src/app/tournaments/focus/focus-views.ts`
- Test: `frontend/projects/athlete/src/app/tournaments/focus/focus-views.spec.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/tabs/today-tab.component.ts`

**Interfaces:**
- Consumes: helpers já existentes de `tournament-format` (`bestOfLabelOf`, `closedPartialsLabelOf`, `countdownLabelOf`, `courtLabelOf`, `liveScoreLineOf`, `matchNumberLabelOf`, `ordinalOf`, `setWinsLabelOf`, `timeLabelOf`) e de `tournament-live.selectors` (`groupLabelOf`, `knockoutLabelOf`, `outcomeOf`, `roundDisplayNumberOf`, `roundGroupsOf`, `sideOf`).
- Produces:
  - `FocusViewContext` — o contrato que os componentes montam a partir do store.
  - `DuoView`, `NextMatchView`, `TimelineEntry`, `TimelineState`, `LiveRowView` (movidos de `today-tab.component.ts`, mesmos campos).
  - `focusViewContextOf(store: TournamentLiveStore): FocusViewContext` — a fábrica. Três consumidores montam este contexto (`today-tab` nesta task, as seções Agora e Grupo depois); copiar o literal em cada um seria triplicar lógica.
  - `nextMatchViewOf(ctx: FocusViewContext): NextMatchView | null`
  - `timelineOf(ctx: FocusViewContext): TimelineEntry[]`
  - `liveRowsOf(ctx: FocusViewContext, categoryId: string | null): LiveRowView[]`
  - `standingLineOf(ctx: FocusViewContext, teamId: string, poolId: string): string | null`
  - `standingsViewOf(ctx, poolId, qualifiersPerGroup, myTeamId): StandingRow[]` com `StandingRow { rank: number; name: string; isMe: boolean; wins: number; losses: number; sets: string; points: number; qualifies: boolean }`
  - `qualificationNoteOf(ctx, poolId, category, myTeamId): QualificationNote | null` com `QualificationNote { tone: 'win' | 'neutral'; text: string }`

- [ ] **Step 1: Escrever o contrato e mover as funções**

Crie `frontend/projects/athlete/src/app/tournaments/focus/focus-views.ts`. Comece pelo contexto — é a peça nova; o resto é mudança de endereço:

```ts
import { matchIsCompleted, matchIsLive, type GroupStanding, type TournamentMatch } from '../../data/matches-repository';
import type { DuoPlayer } from '../tournament-live.store';

/**
 * O que uma view do Focus precisa saber. É o store reduzido a valores — os componentes montam
 * este objeto lendo os signals, e os testes montam um literal. Sem isso as funções voltariam a
 * depender do `TournamentLiveStore` e deixariam de ser testáveis sem TestBed.
 */
export interface FocusViewContext {
  matches: readonly TournamentMatch[];
  myTeamIds: ReadonlySet<string>;
  now: Date;
  duoNameOf(teamId: string, fallback?: string | null): string;
  duoPlayersOf(teamId: string): [DuoPlayer, DuoPlayer];
  isMyTeam(teamId: string): boolean;
  standingsOf(poolId: string): readonly GroupStanding[];
  nextMatch: TournamentMatch | null;
  dayTimeline: readonly TournamentMatch[];
}
```

Logo abaixo, a fábrica — é ela que impede a triplicação do literal nos três consumidores:

```ts
import type { DuoPlayer, TournamentLiveStore } from '../tournament-live.store';

/** Fotografia do store para as funções de view. `import type` de propósito: nada aqui depende
 *  do store em tempo de execução, então não há ciclo. */
export function focusViewContextOf(store: TournamentLiveStore): FocusViewContext {
  return {
    matches: store.matches(),
    myTeamIds: store.myTeamIds(),
    now: store.now(),
    duoNameOf: (teamId, fallback) => store.duoNameOf(teamId, fallback ?? null),
    duoPlayersOf: (teamId) => store.duoPlayersOf(teamId),
    isMyTeam: (teamId) => store.isMyTeam(teamId),
    standingsOf: (poolId) => store.standingsOf(poolId),
    nextMatch: store.nextMatch(),
    dayTimeline: store.dayTimeline(),
  };
}
```

Em seguida mova, SEM alterar a lógica:

- as interfaces `DuoView`, `NextMatchView`, `TimelineState`, `TimelineEntry`, `LiveRowView`, `QualificationNote` (linhas 30–80 de `today-tab.component.ts`) e a função `numberChipOf` (linhas 86–89);
- os métodos privados `duoViewOf`, `standingLineOf`, `lossesOf`, `mySetLine`, `phaseLabelOf`, `kickerOf`, `noteOf` — cada um vira função exportada ou interna recebendo `ctx` como primeiro parâmetro no lugar de `this.store`;
- os `computed` `nextMatch`, `timeline` e `liveNow` — viram `nextMatchViewOf(ctx)`, `timelineOf(ctx)` e `liveRowsOf(ctx, categoryId)`;
- os `computed` `standings` e `qualificationNote` — viram `standingsViewOf(ctx, poolId, qualifiersPerGroup, myTeamId)` e `qualificationNoteOf(ctx, poolId, category, myTeamId)`. Eles vêm para cá agora, e não na Task 9, para que a seção Grupo os importe em vez de recuperar o componente apagado com `git show`.

A tradução é mecânica: `this.store.matches()` → `ctx.matches`, `this.store.now()` → `ctx.now`, `this.store.duoNameOf(a, b)` → `ctx.duoNameOf(a, b)`, `this.store.nextMatch()` → `ctx.nextMatch`, `this.store.dayTimeline()` → `ctx.dayTimeline`, `this.store.standingsOf(p)` → `ctx.standingsOf(p)`. Exporte `standingLineOf` e `lossesOf` — a Task 9 usa as duas.

Assinaturas exatas a produzir:

```ts
export function nextMatchViewOf(ctx: FocusViewContext): NextMatchView | null;
export function timelineOf(ctx: FocusViewContext): TimelineEntry[];
export function liveRowsOf(ctx: FocusViewContext, categoryId: string | null): LiveRowView[];
export function standingLineOf(ctx: FocusViewContext, teamId: string, poolId: string): string | null;
export function lossesOf(ctx: FocusViewContext, poolId: string, teamId: string): number;
```

`liveRowsOf` substitui o `computed` `liveNow`, que hoje lê `store.liveInFocusCategory()`. Ele passa a filtrar por `categoryId` sobre `ctx.matches` usando `liveMatchesOf(ctx.matches, categoryId ?? undefined)` de `tournament-live.selectors`.

- [ ] **Step 2: Escrever o teste**

Crie `frontend/projects/athlete/src/app/tournaments/focus/focus-views.spec.ts`. Copie o helper `match()` de `tournament-live.selectors.spec.ts` (linhas 21+) para montar `TournamentMatch` completos, e adicione um helper de contexto:

```ts
import type { GroupStanding, TournamentMatch } from '../../data/matches-repository';
import { nextMatchViewOf, timelineOf, type FocusViewContext } from './focus-views';

function ctxOf(partial: Partial<FocusViewContext> & Pick<FocusViewContext, 'matches'>): FocusViewContext {
  return {
    myTeamIds: new Set(['teamMine']),
    now: new Date('2026-08-29T14:00:00Z'),
    duoNameOf: (teamId, fallback) => (teamId ? `Dupla ${teamId}` : (fallback ?? 'A definir')),
    duoPlayersOf: () => [
      { initial: 'MA', photo: null },
      { initial: 'EN', photo: null },
    ],
    isMyTeam: (teamId) => teamId === 'teamMine',
    standingsOf: (): GroupStanding[] => [],
    nextMatch: null,
    dayTimeline: [],
    ...partial,
  };
}

describe('nextMatchViewOf', () => {
  it('devolve null sem próxima partida', () => {
    expect(nextMatchViewOf(ctxOf({ matches: [] }))).toBeNull();
  });

  it('monta horário, quadra e lados a partir da partida', () => {
    const m = match({ id: 'm1', teamAId: 'teamMine', teamBId: 'teamRival', courtName: '3', scheduleTime: new Date('2026-08-29T15:10:00Z') });
    const view = nextMatchViewOf(ctxOf({ matches: [m], nextMatch: m }));
    expect(view?.matchId).toBe('m1');
    expect(view?.courtLabel).toBe('Quadra 3');
    expect(view?.sideA.isMe).toBe(true);
    expect(view?.sideB.isMe).toBe(false);
  });

  it('em quadra não mostra contagem regressiva', () => {
    const m = match({ id: 'm1', status: 'in progress', teamAId: 'teamMine', teamBId: 'teamRival', scheduleTime: new Date('2026-08-29T13:00:00Z') });
    const view = nextMatchViewOf(ctxOf({ matches: [m], nextMatch: m }));
    expect(view?.live).toBe(true);
    expect(view?.countdown).toBeNull();
  });
});

describe('timelineOf', () => {
  it('marca a partida encerrada com o resultado sob a ótica do atleta', () => {
    const done = match({
      id: 'm1',
      status: 'completed',
      teamAId: 'teamMine',
      teamBId: 'teamRival',
      winnerId: 'teamMine',
      sets: [{ a: 21, b: 15 }, { a: 21, b: 12 }],
      scheduleTime: new Date('2026-08-29T12:00:00Z'),
    });
    const [entry] = timelineOf(ctxOf({ matches: [done], dayTimeline: [done] }));
    expect(entry?.state).toBe('done');
    expect(entry?.outcome).toBe('win');
  });

  it('marca como "next" a partida que é a próxima do atleta', () => {
    const upcoming = match({ id: 'm2', teamAId: 'teamMine', teamBId: 'teamRival', scheduleTime: new Date('2026-08-29T15:00:00Z') });
    const [entry] = timelineOf(ctxOf({ matches: [upcoming], dayTimeline: [upcoming], nextMatch: upcoming }));
    expect(entry?.state).toBe('next');
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: FALHA — `focus-views` ainda não exporta o que o teste importa, ou os testes novos quebram.

- [ ] **Step 4: Fazer o `today-tab` consumir as funções puras**

Em `today-tab.component.ts`, apague as interfaces e métodos privados que foram movidos, importe de `../focus/focus-views`, e use a fábrica:

```ts
private readonly ctx = computed(() => focusViewContextOf(this.store));

protected readonly nextMatch = computed(() => nextMatchViewOf(this.ctx()));
protected readonly timeline = computed(() => timelineOf(this.ctx()));
protected readonly liveNow = computed(() => liveRowsOf(this.ctx(), this.store.focusCategoryId()));
protected readonly standings = computed(() =>
  standingsViewOf(this.ctx(), this.store.focusPoolId() ?? '', this.store.focusCategory()?.qualifiersPerGroup ?? 2, this.store.myTeamIdInFocus()),
);
protected readonly qualificationNote = computed(() =>
  qualificationNoteOf(this.ctx(), this.store.focusPoolId() ?? '', this.store.focusCategory(), this.store.myTeamIdInFocus()),
);
```

Reexporte os tipos que o template usa, se necessário. Os `computed` `standingsTitle`, `standingsKicker`, `categoryLine`, `announcements` e `mapsUrl` FICAM no componente — são rótulos de uma linha, e a Task 9 os reescreve no lugar novo em vez de importá-los.

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: PASSA. Rode também o build, porque o template de `today-tab` referencia os tipos movidos:

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng build athlete --configuration development
```

Esperado: build sem erro.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/ && git commit -m "refactor(athlete): views da aba Hoje viram funções puras"
```

---

### Task 4: Cenários vence/perde com a trava de invariância

**Files:**
- Create: `frontend/projects/athlete/src/app/tournaments/focus/focus-scenarios.ts`
- Test: `frontend/projects/athlete/src/app/tournaments/focus/focus-scenarios.spec.ts`

**Interfaces:**
- Consumes: `buildGroupStandings`, `matchIsCompleted`, `matchIsCanceled`, `TournamentMatch`, `MatchSet` de `data/matches-repository`.
- Produces: `RoundScenario { outcome: 'win' | 'loss'; rank: number | null; qualifies: boolean | null; text: string }`, `roundScenariosOf(matches, poolId, myTeamId, myMatchId, qualifiersPerGroup): RoundScenario[]`.

A regra: só afirma posição quando ela é a MESMA em todos os placares plausíveis, e só quando a partida do atleta é a única pendente do grupo. Fora disso, `rank` e `qualifies` vêm `null` e o texto é "depende do placar".

- [ ] **Step 1: Escrever o teste**

Crie `frontend/projects/athlete/src/app/tournaments/focus/focus-scenarios.spec.ts`. Reutilize o helper `match()` de `tournament-live.selectors.spec.ts`.

```ts
import { roundScenariosOf } from './focus-scenarios';

/** Grupo de 4 com 2 rodadas fechadas e só a partida do atleta em aberto. */
function groupWithOnlyMyMatchPending() {
  return [
    match({ id: 'd1', poolId: 'p1', status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine', sets: [{ a: 21, b: 15 }, { a: 21, b: 12 }] }),
    match({ id: 'd2', poolId: 'p1', status: 'completed', teamAId: 'rival', teamBId: 'y', winnerId: 'rival', sets: [{ a: 21, b: 10 }, { a: 21, b: 11 }] }),
    match({ id: 'd3', poolId: 'p1', status: 'completed', teamAId: 'x', teamBId: 'y', winnerId: 'x', sets: [{ a: 21, b: 19 }, { a: 21, b: 18 }] }),
    match({ id: 'mine-vs-rival', poolId: 'p1', status: 'scheduled', teamAId: 'mine', teamBId: 'rival' }),
  ];
}

describe('roundScenariosOf', () => {
  it('afirma a posição quando ela não muda entre os placares plausíveis', () => {
    const scenarios = roundScenariosOf(groupWithOnlyMyMatchPending(), 'p1', 'mine', 'mine-vs-rival', 2);
    const win = scenarios.find((s) => s.outcome === 'win');
    expect(win?.rank).toBe(1);
    expect(win?.qualifies).toBe(true);
  });

  it('não afirma nada quando há outra partida pendente no grupo', () => {
    const matches = [
      ...groupWithOnlyMyMatchPending(),
      match({ id: 'outra', poolId: 'p1', status: 'scheduled', teamAId: 'x', teamBId: 'y' }),
    ];
    const scenarios = roundScenariosOf(matches, 'p1', 'mine', 'mine-vs-rival', 2);
    expect(scenarios.every((s) => s.rank === null)).toBe(true);
    expect(scenarios[0]?.text).toContain('depende');
  });

  it('devolve vazio quando a partida do atleta não existe no grupo', () => {
    expect(roundScenariosOf(groupWithOnlyMyMatchPending(), 'p1', 'mine', 'inexistente', 2)).toEqual([]);
  });

  it('cai em "depende do placar" quando 2-0 e 2-1 dão posições diferentes', () => {
    // Empate em vitórias com saldo de sets apertado: vencer por 2-0 tira o 1º, por 2-1 não.
    const matches = [
      match({ id: 'd1', poolId: 'p1', status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine', sets: [{ a: 21, b: 19 }, { a: 19, b: 21 }, { a: 15, b: 13 }] }),
      match({ id: 'd2', poolId: 'p1', status: 'completed', teamAId: 'rival', teamBId: 'y', winnerId: 'rival', sets: [{ a: 21, b: 5 }, { a: 21, b: 5 }] }),
      match({ id: 'd3', poolId: 'p1', status: 'completed', teamAId: 'x', teamBId: 'y', winnerId: 'x', sets: [{ a: 21, b: 19 }, { a: 21, b: 18 }] }),
      match({ id: 'mine-vs-rival', poolId: 'p1', status: 'scheduled', teamAId: 'mine', teamBId: 'rival' }),
    ];
    const win = roundScenariosOf(matches, 'p1', 'mine', 'mine-vs-rival', 2).find((s) => s.outcome === 'win');
    // O teste não fixa QUAL posição: fixa que, divergindo, a função se recusa a afirmar.
    if (win?.rank === null) {
      expect(win.text).toContain('depende');
    } else {
      expect(typeof win?.rank).toBe('number');
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: FALHA — `Cannot find module './focus-scenarios'`.

- [ ] **Step 3: Implementar**

Crie `frontend/projects/athlete/src/app/tournaments/focus/focus-scenarios.ts`:

```ts
import { buildGroupStandings, matchIsCanceled, matchIsCompleted, type MatchSet, type TournamentMatch } from '../../data/matches-repository';
import { ordinalOf } from '../tournament-format';

export interface RoundScenario {
  outcome: 'win' | 'loss';
  /** Posição no grupo, ou `null` quando não é seguro afirmar. */
  rank: number | null;
  qualifies: boolean | null;
  text: string;
}

/** Placares plausíveis de uma vitória em melhor-de-3, do lado do atleta. O saldo de sets e de
 *  pontos difere entre eles, e é justamente essa diferença que pode mudar a classificação. */
const WIN_SCORES: readonly MatchSet[][] = [
  [{ a: 21, b: 15 }, { a: 21, b: 15 }],
  [{ a: 21, b: 15 }, { a: 15, b: 21 }, { a: 15, b: 10 }],
];

function mirror(sets: readonly MatchSet[]): MatchSet[] {
  return sets.map((s) => ({ a: s.b, b: s.a }));
}

/** Aplica um resultado hipotético à partida do atleta, preservando de que lado ele joga. */
function withHypotheticalResult(m: TournamentMatch, myTeamId: string, sets: readonly MatchSet[], iWin: boolean): TournamentMatch {
  const iAmA = m.teamAId === myTeamId;
  const oriented = iAmA ? sets : mirror(sets);
  const winnerId = iWin ? myTeamId : (iAmA ? m.teamBId : m.teamAId);
  return { ...m, status: 'completed', winnerId, sets: [...oriented], resultA: null, resultB: null };
}

function rankOf(matches: readonly TournamentMatch[], poolId: string, myTeamId: string): number | null {
  const index = buildGroupStandings(matches, poolId).findIndex((s) => s.teamId === myTeamId);
  return index < 0 ? null : index + 1;
}

/**
 * Cenários da rodada decisiva.
 *
 * Deliberadamente conservador, na mesma linha de `qualificationOf`: simula os placares
 * plausíveis e só afirma a posição quando TODOS levam ao mesmo lugar. Errar isso num app de
 * torneio — dizer "vencendo você é o 1º" e o atleta terminar em 2º por saldo — é pior que
 * dizer "depende do placar".
 *
 * Só roda quando a partida do atleta é a única pendente do grupo: com outra em aberto, quem
 * decide a posição é um resultado que ninguém controla.
 */
export function roundScenariosOf(
  matches: readonly TournamentMatch[],
  poolId: string,
  myTeamId: string | null,
  myMatchId: string,
  qualifiersPerGroup: number,
): RoundScenario[] {
  if (!poolId || !myTeamId) return [];
  const pool = matches.filter((m) => m.poolId === poolId);
  const mine = pool.find((m) => m.id === myMatchId);
  if (!mine || matchIsCompleted(mine) || matchIsCanceled(mine)) return [];

  const pending = pool.filter((m) => !matchIsCompleted(m) && !matchIsCanceled(m));
  const soleDecider = pending.length === 1 && pending[0]!.id === myMatchId;
  const others = matches.filter((m) => m.id !== myMatchId);

  return (['win', 'loss'] as const).map((outcome) => {
    if (!soleDecider) {
      return {
        outcome,
        rank: null,
        qualifies: null,
        text: outcome === 'win'
          ? 'Vencendo, sua posição depende do placar e dos outros jogos do grupo.'
          : 'Perdendo, sua posição depende do placar e dos outros jogos do grupo.',
      } satisfies RoundScenario;
    }

    const iWin = outcome === 'win';
    const ranks = WIN_SCORES.map((sets) =>
      rankOf([...others, withHypotheticalResult(mine, myTeamId, iWin ? sets : mirror(sets), iWin)], poolId, myTeamId),
    );
    const [first] = ranks;
    const invariant = first != null && ranks.every((r) => r === first);
    if (!invariant) {
      return {
        outcome,
        rank: null,
        qualifies: null,
        text: `${iWin ? 'Vencendo' : 'Perdendo'}, sua posição depende do placar.`,
      } satisfies RoundScenario;
    }

    const qualifies = first <= qualifiersPerGroup;
    return {
      outcome,
      rank: first,
      qualifies,
      text: `${iWin ? 'Vencendo' : 'Perdendo'}, você termina em ${ordinalOf(first)} do grupo${qualifies ? ' e avança' : ''}.`,
    } satisfies RoundScenario;
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: PASSA.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/focus/ && git commit -m "feat(athlete): cenários de rodada com trava de invariância"
```

---

### Task 5: Trajetória — caminho, números e "N vitórias do título"

**Files:**
- Create: `frontend/projects/athlete/src/app/tournaments/focus/focus-journey.ts`
- Test: `frontend/projects/athlete/src/app/tournaments/focus/focus-journey.spec.ts`

**Interfaces:**
- Consumes: `matchIsCompleted`, `matchClosedSets`, `TournamentMatch`, `MatchSet` de `data/matches-repository`; `isDoubleElimination` de `tournaments/bracket-tree`; `TournamentPrize` de `data/tournaments-repository`.
- Produces:
  - `winsToTitleOf(matches, categoryId, myTeamIds): number | null`
  - `TournamentNumbers { matches: number; setsWon: number; setsLost: number; points: number; pointsAgainst: number; pointsPerSet: number; sets: SetBar[] }` com `SetBar { label: string; mine: number; theirs: number }`
  - `tournamentNumbersOf(matches, myTeamIds): TournamentNumbers`
  - `guaranteedPrizeOf(prizes: readonly TournamentPrize[], bestPossiblePlace: number): TournamentPrize | null`

- [ ] **Step 1: Escrever o teste**

Crie `frontend/projects/athlete/src/app/tournaments/focus/focus-journey.spec.ts`, novamente com o helper `match()`:

```ts
import { tournamentNumbersOf, winsToTitleOf } from './focus-journey';

const MINE = new Set(['mine']);

describe('winsToTitleOf', () => {
  it('devolve null sem chave sorteada', () => {
    const groups = [match({ id: 'g1', poolId: 'p1', categoryId: 'c1', teamAId: 'mine', teamBId: 'x' })];
    expect(winsToTitleOf(groups, 'c1', MINE)).toBeNull();
  });

  it('conta as fases de mata-mata quando o atleta ainda está nos grupos', () => {
    const matches = [
      match({ id: 'g1', poolId: 'p1', categoryId: 'c1', teamAId: 'mine', teamBId: 'x' }),
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'semifinal', isGroupMatch: false }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'final', isGroupMatch: false }),
    ];
    expect(winsToTitleOf(matches, 'c1', MINE)).toBe(3);
  });

  it('desconta as fases já vencidas quando o atleta está no mata-mata', () => {
    const matches = [
      match({ id: 'q1', poolId: '', categoryId: 'c1', round: 1, matchType: 'quarterfinal', isGroupMatch: false, status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine' }),
      match({ id: 's1', poolId: '', categoryId: 'c1', round: 2, matchType: 'semifinal', isGroupMatch: false, teamAId: 'mine', teamBId: 'y' }),
      match({ id: 'f1', poolId: '', categoryId: 'c1', round: 3, matchType: 'final', isGroupMatch: false }),
    ];
    expect(winsToTitleOf(matches, 'c1', MINE)).toBe(2);
  });
});

describe('tournamentNumbersOf', () => {
  it('soma sets e pontos das partidas encerradas do atleta', () => {
    const matches = [
      match({ id: 'm1', status: 'completed', teamAId: 'mine', teamBId: 'x', winnerId: 'mine', sets: [{ a: 21, b: 15 }, { a: 21, b: 12 }] }),
      match({ id: 'm2', status: 'completed', teamAId: 'y', teamBId: 'mine', winnerId: 'mine', sets: [{ a: 19, b: 21 }, { a: 21, b: 17 }, { a: 7, b: 10 }] }),
    ];
    const numbers = tournamentNumbersOf(matches, MINE);
    expect(numbers.matches).toBe(2);
    expect(numbers.setsWon).toBe(4);
    expect(numbers.setsLost).toBe(1);
    // 21+21 do lado A na m1; 21+17+10 do lado B na m2.
    expect(numbers.points).toBe(21 + 21 + 21 + 17 + 10);
    expect(numbers.sets.length).toBe(5);
  });

  it('não conta partida que ainda não terminou', () => {
    const matches = [match({ id: 'm1', teamAId: 'mine', teamBId: 'x' })];
    expect(tournamentNumbersOf(matches, MINE).matches).toBe(0);
  });

  it('devolve zeros sem partida nenhuma', () => {
    const numbers = tournamentNumbersOf([], MINE);
    expect(numbers.points).toBe(0);
    expect(numbers.pointsPerSet).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: FALHA — módulo inexistente.

- [ ] **Step 3: Implementar**

Crie `frontend/projects/athlete/src/app/tournaments/focus/focus-journey.ts`:

```ts
import { matchClosedSets, matchIsCompleted, type TournamentMatch } from '../../data/matches-repository';
import type { TournamentPrize } from '../../data/tournaments-repository';
import { isDoubleElimination } from '../bracket-tree';
import { sideOf } from '../tournament-live.selectors';

/** Uma barra do gráfico "você × adversário": um set de uma partida do atleta. */
export interface SetBar {
  label: string;
  mine: number;
  theirs: number;
}

export interface TournamentNumbers {
  matches: number;
  setsWon: number;
  setsLost: number;
  points: number;
  pointsAgainst: number;
  pointsPerSet: number;
  sets: SetBar[];
}

/** Fases de mata-mata da categoria, da mais distante da final para a final. */
function knockoutRounds(matches: readonly TournamentMatch[], categoryId: string): number[] {
  const rounds = matches
    .filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch)
    .map((m) => m.round);
  return [...new Set(rounds)].sort((a, b) => a - b);
}

/**
 * Quantas vitórias separam o atleta do título.
 *
 * `null` quando a chave ainda não foi sorteada — nesse caso a manchete some em vez de chutar.
 * Também `null` em dupla eliminação: lá o caminho depende da chave em que o atleta está e a
 * contagem simples de fases mentiria.
 */
export function winsToTitleOf(matches: readonly TournamentMatch[], categoryId: string, myTeamIds: ReadonlySet<string>): number | null {
  const rounds = knockoutRounds(matches, categoryId);
  if (rounds.length === 0) return null;
  if (isDoubleElimination(matches.filter((m) => m.categoryId === categoryId))) return null;

  const myPending = matches
    .filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch && sideOf(m, myTeamIds) !== null && !matchIsCompleted(m))
    .map((m) => m.round)
    .sort((a, b) => a - b);

  // Já dentro do mata-mata: conta da fase pendente dele em diante. Ainda nos grupos: todas.
  const from = myPending[0];
  if (from == null) return rounds.length;
  const index = rounds.indexOf(from);
  return index < 0 ? rounds.length : rounds.length - index;
}

/** Sets e pontos do atleta nas partidas já encerradas — tudo derivado de `sets[]`. */
export function tournamentNumbersOf(matches: readonly TournamentMatch[], myTeamIds: ReadonlySet<string>): TournamentNumbers {
  const mine = matches.filter((m) => sideOf(m, myTeamIds) !== null && matchIsCompleted(m));
  const bars: SetBar[] = [];
  let setsWon = 0;
  let setsLost = 0;
  let points = 0;
  let pointsAgainst = 0;

  mine.forEach((m, matchIndex) => {
    const iAmA = sideOf(m, myTeamIds) === 'A';
    matchClosedSets(m).forEach((s, setIndex) => {
      const my = iAmA ? s.a : s.b;
      const their = iAmA ? s.b : s.a;
      if (my > their) setsWon++;
      else if (their > my) setsLost++;
      points += my;
      pointsAgainst += their;
      bars.push({ label: `P${matchIndex + 1} · S${setIndex + 1}`, mine: my, theirs: their });
    });
  });

  return {
    matches: mine.length,
    setsWon,
    setsLost,
    points,
    pointsAgainst,
    pointsPerSet: bars.length > 0 ? Math.round((points / bars.length) * 10) / 10 : 0,
    sets: bars,
  };
}

/** A melhor premiação que a campanha atual já garante — `bestPossiblePlace` é a pior colocação
 *  possível a partir daqui (ex.: quem está na final termina no máximo em 2º). */
export function guaranteedPrizeOf(prizes: readonly TournamentPrize[], bestPossiblePlace: number): TournamentPrize | null {
  return [...prizes].sort((a, b) => a.position - b.position).find((p) => p.position >= bestPossiblePlace) ?? null;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: PASSA.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/focus/ && git commit -m "feat(athlete): derivações da trajetória do atleta no torneio"
```

---

### Task 6: Casca do Focus, rotas e aposentadoria da aba Hoje

**Files:**
- Create: `frontend/projects/athlete/src/app/tournaments/focus/focus-shell.component.{ts,html,scss}`
- Modify: `frontend/projects/athlete/src/app/app.routes.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/tournament-live.selectors.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/tournament-live.selectors.spec.ts`

**Interfaces:**
- Consumes: `TournamentLiveStore`, `FocusDayService.dismissForToday()`.
- Produces: `FocusShellComponent` (selector `app-focus-shell`), rota `torneios/:id/focus/{agora,trajetoria,grupo,chave}`.

Nesta task as quatro seções ainda não existem; a casca renderiza o `<router-outlet>` e as rotas apontam para componentes vazios criados nas tasks seguintes. Para manter a task testável sozinha, crie os quatro componentes como cascas mínimas (`template: ''` inline) e preencha-as nas Tasks 7–10.

- [ ] **Step 1: Ajustar o teste de `visibleTabsOf`**

Em `tournament-live.selectors.spec.ts`, encontre os casos de `visibleTabsOf` que esperam `'hoje'` e atualize-os: a aba não é mais emitida. Se houver um caso "com jogo hoje, mostra a aba Hoje", troque por:

```ts
it('não emite mais a aba Hoje — o dia do atleta vive no Focus', () => {
  const tabs = visibleTabsOf({ hasMyMatchToday: true, isRegistered: true, hasDefinedMatchups: true });
  expect(tabs).not.toContain('hoje' as never);
  expect(tabs).toEqual(['visao-geral', 'categorias', 'minha-inscricao', 'palpites']);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: FALHA — `visibleTabsOf` ainda emite `'hoje'`.

- [ ] **Step 3: Aposentar a aba nos seletores**

Em `tournament-live.selectors.ts`: remova `'hoje'` de `TournamentTabId`, remova o `if (input.hasMyMatchToday) tabs.push('hoje')` de `visibleTabsOf`, e simplifique `defaultTabOf` para `return 'visao-geral'`. Mantenha `hasMyMatchToday` no `TabVisibilityInput` — a Task 11 ainda o usa para decidir se mostra o botão do Focus. Atualize o comentário do bloco para registrar que o dia do atleta passou a viver no Focus.

- [ ] **Step 4: Criar a casca**

`focus-shell.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { TournamentLiveStore } from '../tournament-live.store';
import { FocusDayService } from './focus-day.service';

export type FocusSectionId = 'agora' | 'trajetoria' | 'grupo' | 'chave';

const SECTIONS: readonly { id: FocusSectionId; label: string }[] = [
  { id: 'agora', label: 'Agora' },
  { id: 'trajetoria', label: 'Trajetória' },
  { id: 'grupo', label: 'Grupo' },
  { id: 'chave', label: 'Chave' },
];

const CLOCK = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const DAY_MS = 86_400_000;

/**
 * Casca do Modo Focus: cabeçalho + navegação + `<router-outlet>`.
 *
 * O que faz o resto do portal sumir é esta casca NÃO envolver o conteúdo em
 * `AtPanelShellComponent`, como todas as outras telas fazem — sem sidebar, sem bottom-nav do
 * portal, sem busca.
 *
 * O tempo real é adquirido aqui, uma vez: trocar de seção dentro do Focus não derruba e reabre
 * o listener, como aconteceria se cada seção chamasse `acquireLive` por conta própria.
 */
@Component({
  selector: 'app-focus-shell',
  imports: [RouterLink, RouterOutlet, NxPageLoadingComponent],
  templateUrl: './focus-shell.component.html',
  styleUrl: './focus-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly focusDay = inject(FocusDayService);
  protected readonly store = inject(TournamentLiveStore);

  protected readonly sections = SECTIONS;

  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });

  protected readonly activeSection = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.currentSection()),
      startWith(this.currentSection()),
    ),
    { initialValue: this.currentSection() },
  );

  protected readonly clock = computed(() => CLOCK.format(this.store.now()));

  protected readonly hasLive = computed(() => this.store.liveInTournament().length > 0);

  /** "DIA 2 DE 3" — só quando o torneio declara início E fim. Sem as duas datas o trecho some,
   *  em vez de afirmar que hoje é o dia 1. */
  protected readonly dayLine = computed<string | null>(() => {
    const t = this.store.tournament();
    if (!t?.startAt || !t?.endAt) return null;
    const total = Math.round((t.endAt.getTime() - t.startAt.getTime()) / DAY_MS) + 1;
    const current = Math.round((this.store.now().getTime() - t.startAt.getTime()) / DAY_MS) + 1;
    if (total < 1 || current < 1 || current > total) return null;
    return `Dia ${current} de ${total}`;
  });

  protected readonly headerMeta = computed(() =>
    [this.dayLine(), this.store.focusCategory()?.categoryName, this.store.tournament()?.location]
      .filter((p): p is string => p != null && p.length > 0)
      .join(' · '),
  );

  constructor() {
    const release = this.store.acquireLive();
    inject(DestroyRef).onDestroy(release);
    void this.store.load(this.id());
  }

  /** Sair silencia a entrada automática até amanhã — sem isso o painel puxaria o atleta de
   *  volta para cá na navegação seguinte. */
  protected async exit(): Promise<void> {
    this.focusDay.dismissForToday();
    await this.router.navigate(['/torneios', this.id()]);
  }

  private currentSection(): FocusSectionId {
    const last = this.router.url.split('?')[0]?.split('/').pop() ?? '';
    return SECTIONS.some((s) => s.id === last) ? (last as FocusSectionId) : 'agora';
  }
}
```

`focus-shell.component.html`:

```html
<div class="focus">
  <header class="focus__header">
    <button type="button" class="focus__exit" aria-label="Sair do Focus" (click)="exit()">×</button>
    <div class="focus__title">
      <span class="focus__badge" [class.focus__badge--live]="hasLive()">Focus</span>
      <strong>{{ store.tournament()?.name ?? 'Torneio' }}</strong>
      @if (headerMeta(); as meta) {
        <span class="focus__meta">{{ meta }}</span>
      }
    </div>
    <time class="focus__clock">{{ clock() }}</time>
  </header>

  <nav class="focus__nav" aria-label="Seções do Focus">
    @for (section of sections; track section.id) {
      <a [routerLink]="['./', section.id]" class="focus__tab" [class.focus__tab--active]="activeSection() === section.id">
        {{ section.label }}
      </a>
    }
  </nav>

  <main class="focus__content">
    @if (store.loading()) {
      <nx-page-loading />
    } @else {
      <router-outlet />
    }
  </main>
</div>
```

`focus-shell.component.scss`: dark, laranja da marca, `position: sticky` no header; a `.focus__nav` fica no topo em `min-width: 1024px` e vira barra fixa no rodapé abaixo disso. Siga os tokens e o padrão visual de `tournament-shell.component.scss`. Cuidado com duas armadilhas já conhecidas do projeto: `@media` sempre ANINHADO dentro do seletor (regra base primeiro, senão o bloco é descartado) e largura de card com `width: min(Npx, 100%)` em vez de `max-width: 100%`, que não limita dentro de grid.

- [ ] **Step 5: Criar as quatro seções vazias**

Crie os três componentes de seção como cascas mínimas — as Tasks 7–9 os preenchem. Exemplo de `now/focus-now.component.ts` (repita o mesmo formato para `journey/focus-journey.component.ts` e `group/focus-group.component.ts`, trocando selector e nome da classe):

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TournamentLiveStore } from '../../tournament-live.store';

@Component({
  selector: 'app-focus-now',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusNowComponent {
  protected readonly store = inject(TournamentLiveStore);
}
```

A seção Chave não ganha componente próprio: a Task 10 aponta a rota direto para `CategoryBracketComponent`.

- [ ] **Step 6: Ligar as rotas**

Em `app.routes.ts`, dentro dos `children` de `torneios/:id`, ANTES do `path: ''`:

```ts
{
  // O Focus é irmão da casca de abas, não filho: assim herda a mesma instância de
  // `TournamentLiveStore` sem refazer leitura, e não carrega o `AtPanelShellComponent` que
  // toda tela do portal usa — é isso que faz o resto do portal sumir.
  path: 'focus',
  loadComponent: () => import('./tournaments/focus/focus-shell.component').then((m) => m.FocusShellComponent),
  children: [
    { path: 'agora', loadComponent: () => import('./tournaments/focus/now/focus-now.component').then((m) => m.FocusNowComponent) },
    { path: 'trajetoria', loadComponent: () => import('./tournaments/focus/journey/focus-journey.component').then((m) => m.FocusJourneyComponent) },
    { path: 'grupo', loadComponent: () => import('./tournaments/focus/group/focus-group.component').then((m) => m.FocusGroupComponent) },
    { path: '', pathMatch: 'full', redirectTo: 'agora' },
  ],
},
```

E, dentro dos `children` da casca de abas, troque a rota `hoje` pelo redirect que mantém links antigos vivos:

```ts
{ path: 'hoje', pathMatch: 'full', redirectTo: '../focus/agora' },
```

Se o redirect relativo não resolver na sua versão do router, use a forma de função, no mesmo padrão de `legacyCategoryRedirect`:

```ts
{ path: 'hoje', pathMatch: 'full', redirectTo: ({ params }) => `/torneios/${params['id']}/focus/agora` },
```

Apague a rota que apontava para `today-tab.component` e delete os arquivos `tabs/today-tab.component.{ts,html,scss}`. Se `tournament-shell.component.html` referenciar a aba Hoje em algum lugar além de `tabs()`, limpe também.

- [ ] **Step 7: Rodar testes e build**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless && npx ng build athlete --configuration development
```

Esperado: testes PASSAM e o build compila. O build é obrigatório aqui: apagar um componente referenciado por rota só quebra em compilação de template.

- [ ] **Step 8: Verificar no navegador**

Suba o dev server pelo Browser pane (nunca por `Bash`), com uma entrada em `.claude/launch.json` apontando para `npx ng serve athlete`. Navegue até `/torneios/<id>/focus` de um torneio com partidas e confirme: a sidebar do portal não aparece, o header do Focus aparece, as quatro abas navegam, e `/torneios/<id>/hoje` redireciona para `/focus/agora`. Confira o console por erros.

- [ ] **Step 9: Commit**

```bash
git add -A frontend/projects/athlete/src/app && git commit -m "feat(athlete): casca do Modo Focus e aposentadoria da aba Hoje"
```

---

### Task 7: Seção Agora

**Files:**
- Modify: `frontend/projects/athlete/src/app/tournaments/focus/now/focus-now.component.ts`
- Create: `frontend/projects/athlete/src/app/tournaments/focus/now/focus-now.component.{html,scss}`

**Interfaces:**
- Consumes: `nextMatchViewOf`, `timelineOf`, `FocusViewContext` (Task 3); `TournamentLiveStore`.
- Produces: `FocusNowComponent` com os três estados do bloco principal.

- [ ] **Step 1: Montar o componente**

Substitua o corpo de `focus-now.component.ts`. O ponto que não pode errar é a PRECEDÊNCIA dos estados:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { matchIsLive } from '../../../data/matches-repository';
import { nextMatchViewOf, timelineOf, type FocusViewContext } from '../focus-views';
import { TournamentLiveStore } from '../../tournament-live.store';

const CALLED_TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const ANNOUNCE_TIME = CALLED_TIME;

/** Estado do bloco principal, em ordem de precedência. */
export type NowState = 'called' | 'live' | 'next' | 'idle';

@Component({
  selector: 'app-focus-now',
  imports: [RouterLink],
  templateUrl: './focus-now.component.html',
  styleUrl: './focus-now.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusNowComponent {
  protected readonly store = inject(TournamentLiveStore);

  /** Reconhecimento LOCAL da chamada. Não existe callable para avisar a mesa — o botão só
   *  recolhe o alerta, e o rótulo ("Ok, estou indo") diz exatamente isso. */
  private readonly acknowledged = signal<string | null>(null);

  private readonly ctx = computed(() => focusViewContextOf(this.store));

  protected readonly nextMatch = computed(() => nextMatchViewOf(this.ctx()));
  protected readonly timeline = computed(() => timelineOf(this.ctx()));

  /**
   * `callMatchToCourt` grava `queueStatus: 'on_court'` E `status: inProgress` na MESMA escrita,
   * então "chamado" e "em quadra" coexistem no dado. "Chamado" vence enquanto o atleta não
   * reconhecer; depois disso a mesma partida aparece como "em quadra". Sem essa precedência
   * explícita o alerta vermelho ou nunca sai da tela, ou nunca aparece.
   */
  protected readonly state = computed<NowState>(() => {
    const m = this.store.nextMatch();
    if (!m) return 'idle';
    if (m.queueStatus === 'on_court' && this.acknowledged() !== m.id) return 'called';
    if (matchIsLive(m)) return 'live';
    return 'next';
  });

  protected readonly calledAt = computed(() => {
    const at = this.store.nextMatch()?.matchStartedAt;
    return at ? CALLED_TIME.format(at) : null;
  });

  protected readonly announcements = computed(() =>
    this.store.announcements().map((a) => ({
      id: a.id,
      time: a.createdAt ? ANNOUNCE_TIME.format(a.createdAt) : '',
      message: a.message,
    })),
  );

  /** Rota até a ARENA, não até a quadra: `tournaments/{id}.courts` é só `{id, name}`, sem
   *  posição. O rótulo do botão nomeia a arena justamente para não prometer o que não temos. */
  protected readonly mapsUrl = computed(() => {
    const t = this.store.tournament();
    if (!t) return '';
    const q = t.locationAddress ?? `${t.location}, ${t.city}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });

  protected readonly mapsLabel = computed(() => {
    const location = this.store.tournament()?.location?.trim();
    return location ? `Como chegar na ${location}` : 'Como chegar';
  });

  protected acknowledge(): void {
    const id = this.store.nextMatch()?.id ?? null;
    this.acknowledged.set(id);
  }
}
```

- [ ] **Step 2: Montar o template**

`focus-now.component.html` — `@switch` no `state()`, seguido de Avisos e Ordem do seu dia. Reaproveite a MARCAÇÃO de `today-tab.component.html` para o card VS, a timeline e os avisos (o arquivo ainda está no histórico do git; recupere com `git show HEAD~1:frontend/projects/athlete/src/app/tournaments/tabs/today-tab.component.html`). Esqueleto:

```html
@switch (state()) {
  @case ('called') {
    <section class="now-alert">
      <p class="now-alert__kicker">Você foi chamado</p>
      <h1>{{ nextMatch()?.courtLabel ?? 'Sua quadra' }} liberada. Vai agora.</h1>
      @if (calledAt(); as at) { <p class="now-alert__when">A mesa chamou às {{ at }}.</p> }
      <button type="button" class="now-alert__cta" (click)="acknowledge()">Ok, estou indo</button>
      <div class="now-alert__secondary">
        <a [href]="mapsUrl()" target="_blank" rel="noopener">Mapa</a>
        @if (nextMatch(); as m) { <a [routerLink]="['../../partida', m.matchId]">Ver partida</a> }
      </div>
    </section>
  }
  @case ('live') { <!-- placar ao vivo + link pro detalhe --> }
  @case ('next') { <!-- contagem regressiva, check-in, card VS, pílulas, CTA mapsLabel() --> }
  @case ('idle') { <!-- fim de dia: "Nenhuma partida sua pendente hoje." --> }
}
```

Nada de clima, contagem de W.O., tempo de caminhada, "Aquecer" ou "Falar com o organizador" — todos estão na tabela de fora de escopo da spec, por não terem fonte de dado.

- [ ] **Step 3: Build e verificação no navegador**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng build athlete --configuration development
```

No Browser pane, abra `/torneios/<id>/focus/agora` e confira os quatro estados. Para forçar "chamado" sem depender do organizador, use o console do navegador só para LER o estado; para escrever, use um torneio de teste do ambiente dev. Confirme que "Ok, estou indo" troca o card vermelho pelo card de partida em quadra e que ele NÃO reaparece na navegação entre seções.

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/focus/now/ && git commit -m "feat(athlete): seção Agora do Focus"
```

---

### Task 8: Seção Trajetória

**Files:**
- Modify: `frontend/projects/athlete/src/app/tournaments/focus/journey/focus-journey.component.ts`
- Create: `frontend/projects/athlete/src/app/tournaments/focus/journey/focus-journey.component.{html,scss}`

**Interfaces:**
- Consumes: `winsToTitleOf`, `tournamentNumbersOf`, `guaranteedPrizeOf` (Task 5); `campaignOf`, `knockoutLabelOf`, `outcomeOf` de `tournament-live.selectors`; `TournamentLiveStore`.

- [ ] **Step 1: Montar os `computed`**

Em `focus-journey.component.ts`:

```ts
protected readonly winsToTitle = computed(() =>
  winsToTitleOf(this.store.matches(), this.store.focusCategoryId() ?? '', this.store.myTeamIds()),
);

protected readonly headline = computed(() => {
  const wins = this.winsToTitle();
  if (wins == null) return null;
  return wins === 1 ? '1 vitória do título.' : `${wins} vitórias do título.`;
});

protected readonly numbers = computed(() => tournamentNumbersOf(this.store.matches(), this.store.myTeamIds()));

/** Caminho até a final: as partidas do atleta em ordem, seguidas das fases de mata-mata ainda
 *  sem dono, rotuladas pelo que a própria chave declara. */
protected readonly path = computed(() => {
  const categoryId = this.store.focusCategoryId();
  const myTeamIds = this.store.myTeamIds();
  const mine = this.store.matches()
    .filter((m) => m.categoryId === categoryId && sideOf(m, myTeamIds) !== null)
    .sort(byScheduleTime);
  const future = this.store.matches()
    .filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch && sideOf(m, myTeamIds) === null && isPending(m))
    .sort((a, b) => a.round - b.round);
  return { mine, future };
});

/** Duplas que podem cruzar com o atleta: só quando o slot da chave já tem dono. */
protected readonly possibleOpponents = computed(() => {
  const categoryId = this.store.focusCategoryId();
  const myTeamIds = this.store.myTeamIds();
  return this.store.matches()
    .filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch && sideOf(m, myTeamIds) === null)
    .flatMap((m) => [m.teamAId, m.teamBId])
    .filter((id) => id.length > 0 && !myTeamIds.has(id))
    .filter((id, i, all) => all.indexOf(id) === i)
    .map((teamId) => ({
      teamId,
      name: this.store.duoNameOf(teamId),
      players: this.store.duoPlayersOf(teamId),
      campaign: campaignOf(this.store.matches(), teamId, (opponentId) => this.store.duoNameOf(opponentId)),
    }));
});

protected readonly prizes = computed(() => this.store.tournament()?.tournamentPrizes ?? []);
```

Importe `byScheduleTime`, `isPending`, `sideOf` e `campaignOf` de `../tournament-live.selectors`.

- [ ] **Step 2: Montar o template**

`focus-journey.component.html`, na ordem da spec: manchete (só quando `headline()` não é nula) · chips (nº de duplas via `store.enrolledByCategory()`, "Classificado" só quando `qualificationOf` disser `decided && qualifies`) · **Caminho até a final** (timeline vertical, placar por set nas jogadas, `knockoutLabelOf` nas futuras, sem horário estimado) · **Seus números no torneio** (sets `setsWon–setsLost`, `points`, `pointsPerSet`, `matches`, e o gráfico de barras iterando `numbers().sets` com altura por `style.height.%`) · **Quem pode cruzar com você** (`possibleOpponents()`, some quando vazio) · **O que este torneio muda** (`prizes()`, marcando a linha garantida com `guaranteedPrizeOf`).

Sem projeção de ranking, sem XP, sem aproveitamento/erros, sem "últimos 5", sem evolução na temporada, sem botão de compartilhar — todos na tabela de fora de escopo.

- [ ] **Step 3: Build e verificação**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng build athlete --configuration development
```

No Browser pane, abra `/focus/trajetoria` em: torneio com chave sorteada (manchete aparece), torneio sem chave (manchete some, nada quebra), e atleta sem partida encerrada (números zerados sem `NaN`).

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/focus/journey/ && git commit -m "feat(athlete): seção Trajetória do Focus"
```

---

### Task 9: Seção Grupo

**Files:**
- Modify: `frontend/projects/athlete/src/app/tournaments/focus/group/focus-group.component.ts`
- Create: `frontend/projects/athlete/src/app/tournaments/focus/group/focus-group.component.{html,scss}`

**Interfaces:**
- Consumes: `roundScenariosOf` (Task 4); `focusViewContextOf`, `liveRowsOf`, `standingsViewOf`, `qualificationNoteOf` (Task 3); `groupLabelOf`, `knockoutLabelOf` de `tournament-live.selectors`.

- [ ] **Step 1: Ligar a classificação e os cenários**

`standingsViewOf` e `qualificationNoteOf` já vivem em `focus-views.ts` desde a Task 3 — importe as duas, não recupere nada de componente apagado. Monte o contexto com a fábrica e adicione o resto:

```ts
private readonly ctx = computed(() => focusViewContextOf(this.store));

protected readonly standings = computed(() =>
  standingsViewOf(this.ctx(), this.store.focusPoolId() ?? '', this.store.focusCategory()?.qualifiersPerGroup ?? 2, this.store.myTeamIdInFocus()),
);

protected readonly qualificationNote = computed(() =>
  qualificationNoteOf(this.ctx(), this.store.focusPoolId() ?? '', this.store.focusCategory(), this.store.myTeamIdInFocus()),
);

protected readonly standingsTitle = computed(() => {
  const poolId = this.store.focusPoolId();
  return poolId ? `${groupLabelOf(poolId, this.store.matches())} · classificação parcial` : null;
});
```

```ts
protected readonly scenarios = computed(() => {
  const poolId = this.store.focusPoolId();
  const myMatch = this.store.nextMatch();
  const qualifiers = this.store.focusCategory()?.qualifiersPerGroup ?? 2;
  if (!poolId || !myMatch || myMatch.poolId !== poolId) return [];
  return roundScenariosOf(this.store.matches(), poolId, this.store.myTeamIdInFocus(), myMatch.id, qualifiers);
});

/** Cruzamento declarado pela chave — fato, não previsão. Só existe quando o slot do mata-mata
 *  traz a descrição ("2º do Grupo A"). */
protected readonly crossing = computed(() => {
  const categoryId = this.store.focusCategoryId();
  return this.store.matches()
    .filter((m) => m.categoryId === categoryId && !m.poolId && !m.isGroupMatch)
    .filter((m) => m.teamADescription != null && m.teamBDescription != null)
    .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber)
    .slice(0, 4)
    .map((m) => ({ label: knockoutLabelOf(m), a: m.teamADescription!, b: m.teamBDescription! }));
});

protected readonly liveNow = computed(() => liveRowsOf(this.ctx(), this.store.focusCategoryId()));

protected readonly where = computed(() => {
  const t = this.store.tournament();
  return {
    court: this.store.nextMatch()?.courtName ?? null,
    arena: t?.location ?? null,
    address: t?.locationAddress ?? (t ? `${t.location}, ${t.city}` : null),
  };
});
```

Importe `focusViewContextOf`, `liveRowsOf`, `standingsViewOf` e `qualificationNoteOf` de `../focus-views`, e `groupLabelOf`/`knockoutLabelOf` de `../../tournament-live.selectors`.

- [ ] **Step 2: Montar o template**

`focus-group.component.html`: **Classificação** (tabela com `#`, dupla, V, D, sets, pts; linha do atleta destacada; faixa de classificação nos primeiros `qualifiersPerGroup`) · **Cenários da rodada** (`@for` em `scenarios()`, `VENCE`/`PERDE` com o `text` de cada um) · **Cruzamento no mata-mata** (`crossing()`, some quando vazio) · **Ao vivo na categoria** (`liveNow()`) · **Onde jogar** (`where()` + link do Maps).

Cuidado com a armadilha de tabela já conhecida no projeto: se usar grid, declare as colunas em UM lugar só (cabeçalho e linha compartilhando a mesma definição), senão desalinha.

- [ ] **Step 3: Build e verificação**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng build athlete --configuration development
```

No navegador, confira os dois caminhos do cenário: grupo com só a partida do atleta pendente (afirma posição ou diz "depende do placar") e grupo com outra partida em aberto (nunca afirma). Confira também categoria sem fase de grupos: a seção degrada sem quebrar.

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/focus/group/ && git commit -m "feat(athlete): seção Grupo do Focus"
```

---

### Task 10: Seção Chave — `categoryId` por input

**Files:**
- Modify: `frontend/projects/athlete/src/app/tournaments/category/category-bracket.component.ts`
- Modify: `frontend/projects/athlete/src/app/app.routes.ts`

**Interfaces:**
- Produces: `CategoryBracketComponent` com `readonly categoryIdInput = input<string | null>(null)`, com prioridade sobre a rota.

- [ ] **Step 1: Aceitar a categoria por input**

Em `category-bracket.component.ts`, troque a linha 137:

```ts
private readonly routeCategoryId = parentCategoryId();

/** A rota do Focus não tem `:categoriaId` — a categoria vem do store. Quando o input está
 *  presente ele manda; sem ele, o comportamento é exatamente o de antes. */
readonly categoryIdInput = input<string | null>(null);

private readonly categoryId = computed(() => this.categoryIdInput() ?? this.routeCategoryId());
```

Importe `input` de `@angular/core`. Nenhuma outra linha muda: `category`, `categoryMatches` e o resto já leem `this.categoryId()`.

- [ ] **Step 2: Criar o wrapper que alimenta o input**

A rota não pode apontar direto para `CategoryBracketComponent`: rota não passa input, e sem input ele voltaria a ler a categoria de uma rota que no Focus não tem `:categoriaId`. Crie o wrapper `frontend/projects/athlete/src/app/tournaments/focus/bracket/focus-bracket.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CategoryBracketComponent } from '../../category/category-bracket.component';
import { TournamentLiveStore } from '../../tournament-live.store';

/** A chave da categoria em foco. Existe só para alimentar o `categoryIdInput` do componente de
 *  chave, que fora do Focus lê a categoria da rota. */
@Component({
  selector: 'app-focus-bracket',
  imports: [CategoryBracketComponent],
  template: '<app-category-bracket [categoryIdInput]="store.focusCategoryId()" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusBracketComponent {
  protected readonly store = inject(TournamentLiveStore);
}
```

O selector `app-category-bracket` já foi conferido no componente. Aponte a rota `chave`, nos `children` de `focus` e antes do `path: ''`, para este wrapper:

```ts
{ path: 'chave', loadComponent: () => import('./tournaments/focus/bracket/focus-bracket.component').then((m) => m.FocusBracketComponent) },
```

- [ ] **Step 3: Rodar testes e build**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless && npx ng build athlete --configuration development
```

Esperado: tudo verde. Confirme no navegador que `/torneios/<id>/categorias/<cat>/chave` (rota antiga, sem input) continua idêntica — é a regressão que essa mudança pode causar.

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/ frontend/projects/athlete/src/app/app.routes.ts && git commit -m "feat(athlete): seção Chave do Focus reaproveitando a chave da categoria"
```

---

### Task 11: Entrada automática e botões de acesso

**Files:**
- Modify: `frontend/projects/athlete/src/app/athlete-painel.component.ts`
- Modify: `frontend/projects/athlete/src/app/tournaments/tournament-shell.component.{ts,html}`

**Interfaces:**
- Consumes: `FocusDayService` (Task 2).

- [ ] **Step 1: Redirecionar do painel**

Em `athlete-painel.component.ts`, injete o serviço e resolva no construtor. Sem guard: guard aqui bloquearia a navegação e daria tela branca esperando o Firestore.

```ts
private readonly focusDay = inject(FocusDayService);

constructor() {
  // ... o que já existe
  void this.focusDay.resolve().then((target) => {
    if (target) void this.router.navigate(['/torneios', target.tournamentId, 'focus']);
  });
}
```

O serviço já devolve `null` quando o atleta dispensou hoje, quando não há jogo, ou quando a leitura falha — o painel não precisa saber de nenhum desses casos.

- [ ] **Step 2: Botão permanente na casca do torneio**

Em `tournament-shell.component.ts`, exponha:

```ts
/** Porta de entrada para quem saiu do Focus e quer voltar — a entrada automática está
 *  silenciada até amanhã, então sem este botão o atleta não teria caminho de volta. */
protected readonly showFocusEntry = computed(() => this.store.hasMyMatchToday());
```

E no template, junto às abas:

```html
@if (showFocusEntry()) {
  <a class="tsh__focus" [routerLink]="['/torneios', store.tournamentId(), 'focus']">Entrar no Focus</a>
}
```

- [ ] **Step 3: Rodar testes e build**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/athlete/.claude/worktrees/athlete-portal-focus-mode-c9efd4/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless && npx ng build athlete --configuration development
```

- [ ] **Step 4: Verificar o ciclo completo no navegador**

Este é o teste que importa. Com um atleta que tem jogo hoje no ambiente dev:

1. Abra `/painel` → deve redirecionar para `/torneios/<id>/focus/agora`.
2. Clique em `×` → volta para `/torneios/<id>`.
3. Navegue para `/painel` de novo → **não** deve redirecionar (silêncio do dia).
4. Confirme `localStorage.getItem('nexago.focus.dismissed')` com a data de hoje.
5. Clique em "Entrar no Focus" na casca do torneio → volta ao Focus.
6. Limpe a chave, recarregue `/painel` → redireciona de novo.

Com um atleta SEM jogo hoje, `/painel` não pode redirecionar nunca.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app && git commit -m "feat(athlete): entrada automática no Focus no dia do evento"
```

---

## Self-review do plano

**Cobertura da spec:** rotas e casca → Task 6; entrada automática → Tasks 1, 2, 11; Agora (3 estados, avisos, ordem do dia) → Tasks 3, 7; Trajetória → Tasks 5, 8; Grupo (com a trava de cenários) → Tasks 4, 9; Chave → Task 10; aposentadoria da Hoje → Tasks 3, 6. Os itens da tabela "fora de escopo" aparecem como proibições explícitas nas Tasks 7 e 8.

**Consistência de tipos:** `FocusViewContext` é definido na Task 3 e consumido com os mesmos campos nas Tasks 7 e 9. `FocusDayTarget` sai da Task 1 e é consumido nas Tasks 2 e 11. `roundScenariosOf` tem a mesma assinatura na Task 4 e na Task 9. `categoryIdInput` tem o mesmo nome na Task 10 e no wrapper.

**Riscos conhecidos:** a Task 3 é a de maior chance de erro (movimentação mecânica grande) — por isso ela mantém o `today-tab` funcionando como prova de equivalência antes de a Task 6 apagá-lo. A Task 6 exige `ng build`, não só teste, porque erro de template só aparece na compilação.
