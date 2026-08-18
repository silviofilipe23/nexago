# Telão dentro do torneio + rota pública — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o telão da sidebar global e colocá-lo dentro do torneio, e publicar `/t/:tournamentId` — página sem login onde o público acompanha jogos ao vivo, próximos e resultados.

**Architecture:** Tudo no portal do organizador (Angular 20, standalone, zoneless, signals). A página pública é uma rota de topo, fora do shell e sem guard, com store próprio de dois listeners (`tournaments` e `artifacts/{appId}/public/data/matches` — as duas coleções com `allow read: if true`) e **sem** hidratação de `public_profiles`, que exige login. A lógica de "o que está em cada quadra" é a mesma do telão (`telao-selectors.ts`), reusada, não copiada.

**Tech Stack:** Angular 20 (standalone components, `input()`/`signal()`/`computed()`, `@if`/`@for`), Firebase Web SDK modular (`onSnapshot`), Karma + Jasmine, `qrcode` (já é dependência do portal).

**Spec:** `docs/superpowers/specs/2026-08-18-telao-no-torneio-e-rota-publica-design.md`

## Global Constraints

- **Worktree:** todo comando de build/teste roda a partir de `<worktree>/frontend`. O `cd` NÃO persiste entre chamadas — repetir em cada comando. Build/teste na raiz do worktree acha o `angular.json` do checkout principal e fica **verde testando outro código**.
- **Sem `node_modules` no worktree:** resolver com symlink (Task 0), nunca `npm install`.
- **UI em português, código em inglês** (convenção do repo).
- **Specs com `provideZonelessChangeDetection()`** no TestBed — o portal roda zoneless e o alvo de teste não carrega zone.js; sem isso, NG0908.
- **Retrocompatibilidade obrigatória:** doc de torneio gravado antes desta mudança precisa continuar funcionando (campo novo ausente = ligado, padrão `!== false` que `telaoConfigFromRaw` já usa).
- **Nada de dado financeiro na página pública:** `collected`, `paymentMode` e `managerId` não vão para a tela, mesmo estando no doc.
- **Escrita em Firestore:** só a já existente de `bigScreen` via `saveTelaoConfig` (exceção consciente do PR #113). Nenhuma escrita nova.
- Prettier do workspace: `printWidth: 100`, aspas simples.

---

### Task 0: Preparar o worktree e travar o baseline

Sem código. Serve para que qualquer falha adiante seja falha do seu trabalho, não do ambiente.

**Files:** nenhum.

- [ ] **Step 1: Criar o symlink de node_modules**

```bash
ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/frontend/node_modules \
  /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend/node_modules
```

- [ ] **Step 2: Rodar a suíte do organizer e anotar a contagem**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless
```

Esperado: SUCCESS. **Anote o total de specs** — é o baseline. Se a contagem não subir quando você adicionar testes nas próximas tasks, você está rodando a árvore errada (plante um `expect('X').toBe('FALHA')` proposital para confirmar).

- [ ] **Step 3: Confirmar que `git status` está limpo**

```bash
git status --short
```

Esperado: nada listado (o `.gitignore` do frontend usa `/node_modules`, que ignora o symlink).

---

### Task 1: Campo `showPublicQr` na config do telão

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament.model.ts` (interface `TelaoConfig`)
- Modify: `frontend/projects/organizer/src/app/painel/data/tournaments-repository.ts` (`telaoConfigFromRaw`, `effectiveTelaoConfig`)
- Test: `frontend/projects/organizer/src/app/painel/data/telao-config-parse.spec.ts` (criar)

**Interfaces:**
- Consumes: nada.
- Produces: `TelaoConfig.showPublicQr: boolean`; `telaoConfigFromRaw(raw: unknown): TelaoConfig | null` passa a ser **exportada** (hoje é privada do módulo); `effectiveTelaoConfig(t: OrganizerTournament): TelaoConfig` inalterada na assinatura.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/organizer/src/app/painel/data/telao-config-parse.spec.ts`:

```ts
import { EMPTY_TOURNAMENT_COLLECTED } from './tournament-collected';
import { effectiveTelaoConfig, telaoConfigFromRaw } from './tournaments-repository';
import type { OrganizerTournament } from './tournament.model';

/** Retrocompatibilidade: torneios gravados antes do QR não têm o campo no doc, e a TV deles
 *  precisa continuar mostrando o QR (mesmo padrão `!== false` de `showStreak`). */
describe('telaoConfigFromRaw · showPublicQr', () => {
  it('assume ligado quando o doc antigo não tem o campo', () => {
    const cfg = telaoConfigFromRaw({ courtIds: ['q1'], showCall: true });
    expect(cfg?.showPublicQr).toBe(true);
  });

  it('respeita o desligamento explícito', () => {
    const cfg = telaoConfigFromRaw({ courtIds: ['q1'], showPublicQr: false });
    expect(cfg?.showPublicQr).toBe(false);
  });

  it('devolve null quando não há config gravada', () => {
    expect(telaoConfigFromRaw(undefined)).toBeNull();
  });
});

describe('effectiveTelaoConfig · showPublicQr', () => {
  function tournament(bigScreen: OrganizerTournament['bigScreen']): OrganizerTournament {
    return {
      id: 't1',
      name: 'Copa de Verão',
      managerId: 'u1',
      sportLabel: 'Beach tennis',
      sportId: 'beachTennis',
      coverUrl: null,
      status: 'andamento',
      visibility: 'publicListing',
      paymentMode: 'appPixCard',
      collected: EMPTY_TOURNAMENT_COLLECTED,
      startAt: null,
      endAt: null,
      city: null,
      location: null,
      categories: [],
      capacity: null,
      leagueId: null,
      courts: [{ id: 'q1', name: '1', order: 0 }],
      courtsCount: 1,
      matchOps: { dayStart: '07:00', dayEnd: '24:00', defaultMatchDurationMin: 40, minRestBetweenMatchesMin: 20 },
      bigScreen,
      uniformRequired: false,
      uniformNumberOnShirt: false,
      uniformNameOnShirt: false,
    };
  }

  it('liga o QR por padrão quando o torneio nunca configurou o telão', () => {
    expect(effectiveTelaoConfig(tournament(null)).showPublicQr).toBe(true);
  });

  it('preserva o QR desligado na config gravada', () => {
    const saved = {
      courtIds: ['q1'],
      showUpcoming: true,
      showCall: true,
      showAvatars: true,
      autoRotate: true,
      showStreak: true,
      showFinalMode: true,
      showPublicQr: false,
    };
    expect(effectiveTelaoConfig(tournament(saved)).showPublicQr).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/telao-config-parse.spec.ts'
```

Esperado: FALHA de compilação — `telaoConfigFromRaw` não é exportada e `showPublicQr` não existe em `TelaoConfig`.

- [ ] **Step 3: Adicionar o campo ao modelo**

Em `tournament.model.ts`, dentro de `interface TelaoConfig`, depois de `showFinalMode`:

```ts
  /** QR de acompanhamento no rodapé do telão — leva à página pública `/t/{id}`. */
  showPublicQr: boolean;
```

- [ ] **Step 4: Parsear e defaultar**

Em `tournaments-repository.ts`:

1. Trocar `function telaoConfigFromRaw(` por `export function telaoConfigFromRaw(` e acrescentar ao objeto devolvido:

```ts
    showPublicQr: o['showPublicQr'] !== false,
```

2. Em `effectiveTelaoConfig`, no ramo sem config gravada, acrescentar `showPublicQr: true` ao objeto literal.

- [ ] **Step 5: Rodar e ver passar**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/telao-config-parse.spec.ts'
```

Esperado: PASS (5 specs).

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e && git add frontend/projects/organizer/src/app/painel/data && git commit -m "feat(telao): config showPublicQr com default ligado"
```

---

### Task 2: Telão vira aba do torneio

**Files:**
- Modify: `frontend/projects/organizer/src/app/app.routes.ts`
- Modify: `frontend/projects/organizer/src/app/painel/shell/panel-shell.component.ts:378-390` (nav do nível torneio) e `:410` (item global)
- Modify: `frontend/projects/organizer/src/app/painel/telao/telao-config.component.ts`
- Test: `frontend/projects/organizer/src/app/app.routes.spec.ts` (criar)

**Interfaces:**
- Consumes: nada da Task 1.
- Produces: rota `painel/eventos/:id/telao`; `TelaoConfigComponent` passa a expor `readonly id = input.required<string>()` e deixa de ler `?evento=`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/organizer/src/app/app.routes.spec.ts`:

```ts
import type { Route } from '@angular/router';
import { routes } from './app.routes';

/** Acha uma rota descendo por `path` exatos, ex.: `['painel', 'eventos/:id', 'telao']`. */
function findRoute(list: readonly Route[], segments: readonly string[]): Route | null {
  let current: readonly Route[] = list;
  let found: Route | null = null;
  for (const segment of segments) {
    found = current.find((r) => r.path === segment) ?? null;
    if (!found) return null;
    current = found.children ?? [];
  }
  return found;
}

describe('app.routes', () => {
  it('serve o telão como aba do torneio', () => {
    expect(findRoute(routes, ['painel', 'eventos/:id', 'telao'])).not.toBeNull();
  });

  it('manda o link antigo do telão global pra lista de eventos', () => {
    expect(findRoute(routes, ['painel', 'telao'])?.redirectTo).toBe('eventos');
  });

  it('expõe a página pública do torneio sem guard', () => {
    const publica = findRoute(routes, ['t/:tournamentId']);
    expect(publica).not.toBeNull();
    expect(publica?.canActivate ?? []).toEqual([]);
  });

  it('mantém a TV do telão atrás de login', () => {
    expect((findRoute(routes, ['telao/:tournamentId'])?.canActivate ?? []).length).toBe(1);
  });
});
```

O terceiro teste cobre a Task 5 e vai continuar falhando até lá — é esperado e está anotado no Step 5 desta task.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/app.routes.spec.ts'
```

Esperado: 3 falhas (aba, redirect, rota pública), 1 passando (TV).

- [ ] **Step 3: Mover a rota**

Em `app.routes.ts`:

1. **Remover** o bloco global:

```ts
      {
        path: 'telao',
        title: 'Telão ao vivo — NexaGO Organizador',
        loadComponent: () => import('./painel/telao/telao-config.component').then((m) => m.TelaoConfigComponent),
      },
```

2. Acrescentar, no bloco "Rotas antigas (pré-cascata)", ao lado de `{ path: 'inscricoes', redirectTo: 'eventos' }`:

```ts
      { path: 'telao', redirectTo: 'eventos' },
```

3. Dentro de `eventos/:id` → `children`, logo depois da rota `agendamento`:

```ts
          {
            path: 'telao',
            title: 'Telão ao vivo — NexaGO Organizador',
            loadComponent: () => import('./painel/telao/telao-config.component').then((m) => m.TelaoConfigComponent),
          },
```

- [ ] **Step 4: Mover o item de navegação**

Em `panel-shell.component.ts`:

1. Apagar da nav global a linha `{ label: 'Telão', icon: 'tv', link: '/painel/telao' },`.
2. Na nav do nível `torneio`, entre *Agendamento* e *Comunicação*:

```ts
        { label: 'Telão', icon: 'tv', link: `${base}/telao` },
```

- [ ] **Step 5: Rodar o spec de rotas**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/app.routes.spec.ts'
```

Esperado: 3 PASS e 1 FAIL (a rota pública, que só nasce na Task 5).

- [ ] **Step 6: O componente passa a receber o torneio pela rota**

Em `telao-config.component.ts`, aplicar todas as mudanças abaixo:

1. **Imports** — remover `toSignal`, `ActivatedRoute`/`Router` do `@angular/router`, `map` do `rxjs`, `AuthService`, `NxPageLoadingComponent`, `listMyTournaments`, e o tipo `OrganizerTournament`. Manter `effectiveTelaoConfig` e `saveTelaoConfig`. Adicionar `input` em `@angular/core`.
2. Apagar as constantes `STATUS_LABEL` e `STATUS_ORDER` (só serviam ao seletor).
3. **Template** — trocar o card "Evento exibido" pelo card das quadras:

```html
            <og-card kicker="Fonte dos jogos" title="Quadras no telão">
              @if (courtRows().length > 0) {
                <div class="og-telao-cfg-courts">
                  @for (row of courtRows(); track row.id) {
                    <label class="og-telao-cfg-court" [class.checked]="row.checked">
                      <input type="checkbox" [checked]="row.checked" (change)="toggleCourt(row.id)" />
                      <span class="og-telao-cfg-court-check"><og-icon name="check" [size]="12" [strokeWidth]="3" /></span>
                      <span class="og-telao-cfg-court-name">{{ row.name }}</span>
                      <span class="og-telao-cfg-court-status" [class.live]="row.live">{{ row.status }}</span>
                    </label>
                  }
                </div>
              } @else {
                <p class="og-telao-cfg-empty">Este torneio ainda não tem quadras cadastradas.</p>
              }
            </og-card>
```

4. **Template** — trocar o envelope `@if (loading()) { … } @else if (tournaments().length === 0) { … } @else { … }` por um `@if` simples sobre o conteúdo (`<div class="og-telao-cfg"> … </div>` direto). O esqueleto de carregamento não é mais necessário: o preview já mostra "Carregando telão…" enquanto o doc não chega.
5. Remover da classe: `auth`, `route`, `router`, `loading`, `tournaments`, `eventoParam`, `tournamentOptions`, `selectedId`, `selectEvento()`, `load()` e a chamada `void this.load(uid)` do construtor.
6. Adicionar e reapontar:

```ts
  /** Preenchido pelo router (`withComponentInputBinding`) a partir de `eventos/:id/telao`. */
  readonly id = input.required<string>();
```

7. No construtor, trocar `effect(() => this.svc.tournamentId.set(this.selectedId()));` por:

```ts
    effect(() => this.svc.tournamentId.set(this.id()));
```

8. Em `save()`, trocar `const id = this.selectedId(); if (!id) return;` por `const id = this.id();`.
9. Em `telaoUrl()`, trocar por:

```ts
  protected telaoUrl(): string {
    return `${location.origin}/telao/${this.id()}`;
  }
```

E remover os `[disabled]="!selectedId()"` dos três botões do template (o id agora sempre existe).

- [ ] **Step 7: Compilar e rodar a suíte inteira**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng build organizer --configuration development && npx ng test organizer --watch=false --browsers=ChromeHeadless
```

Esperado: build OK (confira que `Output location:` contém `worktrees/`) e suíte com apenas a falha conhecida da rota pública.

- [ ] **Step 8: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e && git add frontend/projects/organizer/src/app && git commit -m "feat(telao): telão vira aba do torneio, sai da sidebar global"
```

---

### Task 3: Seletores da página pública

Lógica pura, testável sem Firestore e sem relógio real — o mesmo desenho de `telao-selectors.ts`.

**Files:**
- Create: `frontend/projects/organizer/src/app/publico/public-selectors.ts`
- Test: `frontend/projects/organizer/src/app/publico/public-selectors.spec.ts`

**Interfaces:**
- Consumes: `courtNowOf`, `upcomingQueue`, `CourtNowKind` de `../painel/telao/telao-selectors`; `formatCourtLabel`, `spTimeLabel`, `spDayLabel` de `../painel/data/schedule-format`.
- Produces:
  - `interface PublicCourtRow { id: string; name: string; kind: CourtNowKind; match: TournamentMatch | null; categoryLabel: string }`
  - `publicCourtRows(matches, courts, categories, nowMs): PublicCourtRow[]`
  - `interface PublicUpcomingRow { id: string; time: string; day: string; court: string; teams: string; meta: string }`
  - `publicUpcomingRows(matches, courts, categories, nowMs, limit?): PublicUpcomingRow[]`
  - `categoryNameOf(categories, categoryId): string`
  - `recentResults(matches, limit?): TournamentMatch[]`

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/organizer/src/app/publico/public-selectors.spec.ts`:

```ts
import type { TournamentMatch } from '../painel/data/matches-repository';
import type { OrganizerTournamentCategory, OrganizerTournamentCourt } from '../painel/data/tournament.model';
import { categoryNameOf, publicCourtRows, publicUpcomingRows, recentResults } from './public-selectors';

const NOW = Date.UTC(2026, 7, 18, 18, 0, 0); // 18/08/2026 18:00 UTC

function at(minFromNow: number): Date {
  return new Date(NOW + minFromNow * 60_000);
}

function match(overrides: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: Math.random().toString(36).slice(2),
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: 'A',
    team2Label: 'B',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'q1',
    scheduleEndAt: null,
    bestOf: 3,
    matchType: 'group',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

const COURTS: OrganizerTournamentCourt[] = [
  { id: 'q1', name: '1', order: 0 },
  { id: 'q2', name: 'Central', order: 1 },
];

const CATEGORIES = [{ id: 'cat1', name: 'Feminina B' }] as OrganizerTournamentCategory[];

describe('publicCourtRows', () => {
  it('marca a quadra com partida ao vivo e formata o nome', () => {
    const rows = publicCourtRows([match({ courtId: 'q1', status: 'in_progress', matchStartedAt: at(-10) })], COURTS, CATEGORIES, NOW);
    expect(rows[0].name).toBe('Quadra 1');
    expect(rows[0].kind).toBe('live');
    expect(rows[0].categoryLabel).toBe('Feminina B');
  });

  it('dá quadra livre quando não há nada perto do horário', () => {
    const rows = publicCourtRows([], COURTS, CATEGORIES, NOW);
    expect(rows.map((r) => r.kind)).toEqual(['free', 'free']);
    expect(rows[1].name).toBe('Central');
  });

  it('mostra a próxima agendada da quadra', () => {
    const rows = publicCourtRows([match({ courtId: 'q2', scheduledAt: at(20) })], COURTS, CATEGORIES, NOW);
    expect(rows[1].kind).toBe('next');
  });
});

describe('publicUpcomingRows', () => {
  it('ordena por horário e formata hora, quadra e categoria', () => {
    const rows = publicUpcomingRows(
      [
        match({ id: 'depois', courtId: 'q1', court: '1', scheduledAt: at(60) }),
        match({ id: 'antes', courtId: 'q2', court: 'Central', scheduledAt: at(15), team1Label: 'Ana / Bia', team2Label: 'Carla / Dani' }),
      ],
      COURTS,
      CATEGORIES,
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(['antes', 'depois']);
    expect(rows[0].court).toBe('Central');
    expect(rows[0].teams).toBe('Ana / Bia vs Carla / Dani');
    expect(rows[0].meta).toBe('Feminina B');
  });

  it('respeita o limite', () => {
    const many = [1, 2, 3, 4].map((i) => match({ courtId: 'q1', scheduledAt: at(i * 10) }));
    expect(publicUpcomingRows(many, COURTS, CATEGORIES, NOW, 2).length).toBe(2);
  });
});

describe('recentResults', () => {
  it('devolve só encerradas, mais recente primeiro', () => {
    const rows = recentResults([
      match({ id: 'velha', status: 'completed', matchEndedAt: at(-120) }),
      match({ id: 'nova', status: 'completed', matchEndedAt: at(-5) }),
      match({ id: 'jogando', status: 'in_progress' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['nova', 'velha']);
  });

  it('cai no horário agendado quando o fim não foi gravado (lançamento rápido)', () => {
    const rows = recentResults([
      match({ id: 'sem-fim-cedo', status: 'completed', scheduledAt: at(-200) }),
      match({ id: 'sem-fim-tarde', status: 'completed', scheduledAt: at(-30) }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['sem-fim-tarde', 'sem-fim-cedo']);
  });

  it('desempata pelo número do jogo quando nada tem data', () => {
    const rows = recentResults([
      match({ id: 'jogo-2', status: 'completed', matchNumber: 2 }),
      match({ id: 'jogo-9', status: 'completed', matchNumber: 9 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['jogo-9', 'jogo-2']);
  });

  it('respeita o limite', () => {
    const many = [1, 2, 3, 4, 5].map((i) => match({ status: 'completed', matchNumber: i }));
    expect(recentResults(many, 3).length).toBe(3);
  });
});

describe('categoryNameOf', () => {
  it('devolve string vazia pra categoria desconhecida ou nula', () => {
    expect(categoryNameOf(CATEGORIES, null)).toBe('');
    expect(categoryNameOf(CATEGORIES, 'nao-existe')).toBe('');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/public-selectors.spec.ts'
```

Esperado: FALHA — módulo `./public-selectors` não existe.

- [ ] **Step 3: Implementar os seletores**

Criar `frontend/projects/organizer/src/app/publico/public-selectors.ts`:

```ts
import type { TournamentMatch } from '../painel/data/matches-repository';
import { formatCourtLabel, spDayLabel, spTimeLabel } from '../painel/data/schedule-format';
import type { OrganizerTournamentCategory, OrganizerTournamentCourt } from '../painel/data/tournament.model';
import { courtNowOf, upcomingQueue, type CourtNowKind } from '../painel/telao/telao-selectors';

/** Lógica pura da página pública `/t/:tournamentId`. Reusa os seletores do telão — a página é
 *  o mesmo recorte ("o que está em cada quadra agora"), só que no celular de quem assiste e
 *  com TODAS as quadras do torneio: `bigScreen.courtIds` é escolha da TV da arena, não do
 *  público. Determinística em (`matches`, `courts`, `nowMs`). */

export interface PublicCourtRow {
  id: string;
  /** Nome já normalizado ("1" → "Quadra 1"). */
  name: string;
  kind: CourtNowKind;
  match: TournamentMatch | null;
  categoryLabel: string;
}

export function categoryNameOf(categories: readonly OrganizerTournamentCategory[], categoryId: string | null): string {
  if (!categoryId) return '';
  return categories.find((c) => c.id === categoryId)?.name ?? '';
}

export function publicCourtRows(
  matches: readonly TournamentMatch[],
  courts: readonly OrganizerTournamentCourt[],
  categories: readonly OrganizerTournamentCategory[],
  nowMs: number,
): PublicCourtRow[] {
  return courts.map((court) => {
    const { kind, match } = courtNowOf(matches, court.id, nowMs);
    return {
      id: court.id,
      name: formatCourtLabel(court.name),
      kind,
      match,
      categoryLabel: match ? categoryNameOf(categories, match.categoryId) : '',
    };
  });
}

export interface PublicUpcomingRow {
  id: string;
  time: string;
  day: string;
  court: string;
  teams: string;
  meta: string;
}

/** Fila de próximos jogos do torneio inteiro. Partida agendada SEM quadra fica de fora — é a
 *  mesma regra do telão (`upcomingQueue` filtra por quadra), e sem quadra não há para onde
 *  mandar o atleta. */
export function publicUpcomingRows(
  matches: readonly TournamentMatch[],
  courts: readonly OrganizerTournamentCourt[],
  categories: readonly OrganizerTournamentCategory[],
  nowMs: number,
  limit = 8,
): PublicUpcomingRow[] {
  return upcomingQueue(matches, courts.map((c) => c.id), nowMs, limit).map((m) => ({
    id: m.id,
    time: m.scheduledAt ? spTimeLabel(m.scheduledAt) : '',
    day: m.scheduledAt ? spDayLabel(m.scheduledAt) : '',
    court: formatCourtLabel(m.court),
    teams: `${m.team1Label} vs ${m.team2Label}`,
    meta: [categoryNameOf(categories, m.categoryId), m.round ?? ''].filter((part) => part.length > 0).join(' · '),
  }));
}

/** Instante do resultado: fim real quando a mesa gravou; senão o horário agendado (o
 *  lançamento rápido pode encerrar sem `matchEndedAt`); senão nada. */
function resultTimeOf(m: TournamentMatch): number {
  return m.matchEndedAt?.getTime() ?? m.scheduledAt?.getTime() ?? 0;
}

/** Últimos jogos encerrados, mais recente primeiro; empate cai no número do jogo. */
export function recentResults(matches: readonly TournamentMatch[], limit = 12): TournamentMatch[] {
  return [...matches]
    .filter((m) => m.status === 'completed')
    .sort((a, b) => resultTimeOf(b) - resultTimeOf(a) || b.matchNumber - a.matchNumber)
    .slice(0, limit);
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/public-selectors.spec.ts'
```

Esperado: PASS (10 specs).

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e && git add frontend/projects/organizer/src/app/publico && git commit -m "feat(publico): seletores de quadras, fila e resultados"
```

---

### Task 4: Card de quadra da página pública

Componente apresentacional puro: recebe tudo por input, não injeta nada.

**Files:**
- Create: `frontend/projects/organizer/src/app/publico/public-court-card.component.ts`
- Test: `frontend/projects/organizer/src/app/publico/public-court-card.component.spec.ts`

**Interfaces:**
- Consumes: `CourtNowKind` (de `../painel/telao/telao-selectors`), `TournamentMatch`, `matchSetWins`/`matchLiveCurrentSet` de `../painel/data/live-set-display`, `spTimeLabel` de `../painel/data/schedule-format`.
- Produces: `PublicCourtCardComponent`, seletor `pub-court-card`, inputs `courtName: string` (required), `kind: CourtNowKind` (required), `match: TournamentMatch | null`, `categoryLabel: string`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/organizer/src/app/publico/public-court-card.component.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TournamentMatch } from '../painel/data/matches-repository';
import { PublicCourtCardComponent } from './public-court-card.component';

function match(overrides: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: 'Ana / Bia',
    team2Label: 'Carla / Dani',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'q1',
    scheduleEndAt: null,
    bestOf: 3,
    matchType: 'group',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

describe('PublicCourtCardComponent', () => {
  beforeEach(async () => {
    // O portal roda zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de teste
    // não carrega zone.js — sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [PublicCourtCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('mostra as duplas e o ponto do set corrente numa partida ao vivo', async () => {
    const fixture = TestBed.createComponent(PublicCourtCardComponent);
    fixture.componentRef.setInput('courtName', 'Quadra 1');
    fixture.componentRef.setInput('kind', 'live');
    fixture.componentRef.setInput('categoryLabel', 'Feminina B');
    fixture.componentRef.setInput(
      'match',
      match({ status: 'in_progress', sets: [{ a: 21, b: 18 }, { a: 7, b: 5 }], currentSetIndex: 1 }),
    );
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ana / Bia');
    expect(text).toContain('Carla / Dani');
    expect(text).toContain('AO VIVO');
    expect(text).toContain('7');
    expect(text).toContain('Feminina B');
  });

  it('anuncia o horário da próxima partida da quadra', async () => {
    const fixture = TestBed.createComponent(PublicCourtCardComponent);
    fixture.componentRef.setInput('courtName', 'Quadra 2');
    fixture.componentRef.setInput('kind', 'next');
    fixture.componentRef.setInput('match', match({ scheduledAt: new Date(Date.UTC(2026, 7, 18, 21, 30)) }));
    await fixture.whenStable();

    // 21:30 UTC = 18:30 na parede de São Paulo (fuso canônico do agendamento).
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('18:30');
  });

  it('diz que a quadra está livre quando não há jogo', async () => {
    const fixture = TestBed.createComponent(PublicCourtCardComponent);
    fixture.componentRef.setInput('courtName', 'Quadra 3');
    fixture.componentRef.setInput('kind', 'free');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Quadra livre');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/public-court-card.component.spec.ts'
```

Esperado: FALHA — componente não existe.

- [ ] **Step 3: Implementar o card**

Criar `frontend/projects/organizer/src/app/publico/public-court-card.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { matchLiveCurrentSet, matchSetWins } from '../painel/data/live-set-display';
import type { TournamentMatch } from '../painel/data/matches-repository';
import { spTimeLabel } from '../painel/data/schedule-format';
import type { CourtNowKind } from '../painel/telao/telao-selectors';

/** Uma quadra na página pública: quem está jogando, com placar ao vivo; ou a próxima partida
 *  com horário; ou quadra livre. Apresentacional puro — tudo entra por input. */
@Component({
  selector: 'pub-court-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="pub-court-head">
      <span class="pub-court-name">{{ courtName() }}</span>
      @if (kind() === 'live') {
        <span class="pub-court-live"><span class="pub-dot"></span>AO VIVO</span>
      } @else if (kind() === 'next' && time()) {
        <span class="pub-court-when">{{ time() }}</span>
      } @else if (kind() === 'free') {
        <span class="pub-court-free">Quadra livre</span>
      }
    </header>

    @if (match(); as m) {
      @if (categoryLabel()) {
        <span class="pub-court-cat">{{ categoryLabel() }}</span>
      }
      <div class="pub-court-teams">
        <div class="pub-court-team">
          <span class="pub-court-team-name">{{ m.team1Label }}</span>
          <span class="pub-court-score">
            <span class="pub-court-sets">{{ setsA() }}</span>
            @if (current(); as c) {
              <span class="pub-court-points">{{ c.a }}</span>
            }
          </span>
        </div>
        <div class="pub-court-team">
          <span class="pub-court-team-name">{{ m.team2Label }}</span>
          <span class="pub-court-score">
            <span class="pub-court-sets">{{ setsB() }}</span>
            @if (current(); as c) {
              <span class="pub-court-points">{{ c.b }}</span>
            }
          </span>
        </div>
      </div>
    } @else {
      <p class="pub-court-empty">Sem jogo por enquanto.</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
    }
    .pub-court-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .pub-court-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
    }
    .pub-court-live {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--nx-live);
    }
    .pub-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--nx-live);
    }
    .pub-court-when,
    .pub-court-free,
    .pub-court-cat,
    .pub-court-empty {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .pub-court-teams {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .pub-court-team {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .pub-court-team-name {
      font-size: 14px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .pub-court-score {
      display: inline-flex;
      align-items: baseline;
      gap: 10px;
      font-family: var(--nx-font-mono);
    }
    .pub-court-sets {
      font-size: 14px;
      color: var(--nx-text-mute);
    }
    .pub-court-points {
      font-size: 20px;
      font-weight: 700;
    }
  `,
})
export class PublicCourtCardComponent {
  readonly courtName = input.required<string>();
  readonly kind = input.required<CourtNowKind>();
  readonly match = input<TournamentMatch | null>(null);
  readonly categoryLabel = input('');

  private readonly setWins = computed<[number, number]>(() => {
    const m = this.match();
    return m ? matchSetWins(m) : [0, 0];
  });

  protected readonly setsA = computed(() => this.setWins()[0]);
  protected readonly setsB = computed(() => this.setWins()[1]);

  protected readonly current = computed(() => {
    const m = this.match();
    return m ? matchLiveCurrentSet(m) : null;
  });

  protected readonly time = computed(() => {
    const at = this.match()?.scheduledAt;
    return at ? spTimeLabel(at) : '';
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/public-court-card.component.spec.ts'
```

Esperado: PASS (3 specs).

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e && git add frontend/projects/organizer/src/app/publico && git commit -m "feat(publico): card de quadra com placar ao vivo"
```

---

### Task 5: Store, página e rota pública

**Files:**
- Create: `frontend/projects/organizer/src/app/publico/public-tournament.store.ts`
- Create: `frontend/projects/organizer/src/app/publico/public-tournament-page.component.ts`
- Test: `frontend/projects/organizer/src/app/publico/public-tournament-page.component.spec.ts`
- Modify: `frontend/projects/organizer/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `publicCourtRows`, `publicUpcomingRows`, `recentResults`, `categoryNameOf` (Task 3); `PublicCourtCardComponent` (Task 4); `watchTournament` de `../painel/data/tournaments-repository`; `watchMatches`, `resolveCourtNames` de `../painel/data/matches-repository`.
- Produces: `PublicTournamentStore` com signals `tournamentId` (writable), `tournament`, `matches`, `loading`, `notFound`, `error`; `PublicTournamentPageComponent` com input `tournamentId: string`.

> **Sobre teste do store:** ele é uma casca de dois `onSnapshot`, como `TelaoDataService` — que também não tem spec. O que é testado aqui é a **página**, com o store dublado. Não invente uma camada de injeção só para testar a casca.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/organizer/src/app/publico/public-tournament-page.component.spec.ts`:

```ts
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TournamentMatch } from '../painel/data/matches-repository';
import { EMPTY_TOURNAMENT_COLLECTED } from '../painel/data/tournament-collected';
import type { OrganizerTournament } from '../painel/data/tournament.model';
import { PublicTournamentPageComponent } from './public-tournament-page.component';
import { PublicTournamentStore } from './public-tournament.store';

function tournament(overrides: Partial<OrganizerTournament> = {}): OrganizerTournament {
  return {
    id: 't1',
    name: 'Copa de Verão',
    managerId: 'u1',
    sportLabel: 'Beach tennis',
    sportId: 'beachTennis',
    coverUrl: null,
    status: 'andamento',
    visibility: 'publicListing',
    paymentMode: 'appPixCard',
    collected: EMPTY_TOURNAMENT_COLLECTED,
    startAt: null,
    endAt: null,
    city: 'Goiânia',
    location: 'Arena Areia Nobre',
    categories: [{ id: 'cat1', name: 'Feminina B' }],
    capacity: null,
    leagueId: null,
    courts: [{ id: 'q1', name: '1', order: 0 }],
    courtsCount: 1,
    matchOps: { dayStart: '07:00', dayEnd: '24:00', defaultMatchDurationMin: 40, minRestBetweenMatchesMin: 20 },
    bigScreen: null,
    uniformRequired: false,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    ...overrides,
  } as OrganizerTournament;
}

function match(overrides: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: 'Ana / Bia',
    team2Label: 'Carla / Dani',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'q1',
    scheduleEndAt: null,
    bestOf: 3,
    matchType: 'group',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

/** Store dublado: os mesmos signals, sem Firestore. */
function fakeStore(over: { tournament?: OrganizerTournament | null; matches?: TournamentMatch[]; notFound?: boolean } = {}) {
  return {
    tournamentId: signal<string | null>('t1'),
    tournament: signal(over.tournament ?? null),
    matches: signal(over.matches ?? []),
    loading: signal(false),
    notFound: signal(over.notFound ?? false),
    error: signal(false),
  };
}

async function render(store: ReturnType<typeof fakeStore>) {
  await TestBed.configureTestingModule({
    imports: [PublicTournamentPageComponent],
    providers: [provideZonelessChangeDetection()],
  })
    .overrideComponent(PublicTournamentPageComponent, {
      set: { providers: [{ provide: PublicTournamentStore, useValue: store as unknown as PublicTournamentStore }] },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(PublicTournamentPageComponent);
  fixture.componentRef.setInput('tournamentId', 't1');
  await fixture.whenStable();
  return fixture;
}

describe('PublicTournamentPageComponent', () => {
  it('mostra o torneio, a quadra ao vivo e o resultado encerrado', async () => {
    const fixture = await render(
      fakeStore({
        tournament: tournament(),
        matches: [
          match({ id: 'live', status: 'in_progress', matchStartedAt: new Date(), sets: [{ a: 9, b: 6 }] }),
          match({ id: 'fim', status: 'completed', team1Label: 'Eva / Fabi', team2Label: 'Gabi / Hel', matchEndedAt: new Date() }),
        ],
      }),
    );

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Copa de Verão');
    expect(text).toContain('Arena Areia Nobre');
    expect(text).toContain('Quadra 1');
    expect(text).toContain('Ana / Bia');
    expect(text).toContain('Eva / Fabi');
  });

  it('nunca imprime dado financeiro do torneio', async () => {
    const fixture = await render(
      fakeStore({
        tournament: tournament({
          collected: { totalCents: 987600, viaAppCents: 987600, viaOrganizerCents: 0, toVerifyCents: 0, estimated: false },
        }),
      }),
    );

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('9876');
    expect(text).not.toContain('9.876');
  });

  it('avisa quando o torneio não existe', async () => {
    const fixture = await render(fakeStore({ notFound: true }));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Torneio não encontrado');
  });

  it('avisa quando o torneio ainda não tem jogos lançados', async () => {
    const fixture = await render(fakeStore({ tournament: tournament(), matches: [] }));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Os jogos aparecem aqui');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/public-tournament-page.component.spec.ts'
```

Esperado: FALHA — store e página não existem.

- [ ] **Step 3: Implementar o store**

Criar `frontend/projects/organizer/src/app/publico/public-tournament.store.ts`:

```ts
import { effect, Injectable, signal } from '@angular/core';
import { watchMatches, type TournamentMatch } from '../painel/data/matches-repository';
import type { OrganizerTournament } from '../painel/data/tournament.model';
import { watchTournament } from '../painel/data/tournaments-repository';

/** Estado da página pública `/t/:tournamentId`: dois listeners, nas duas coleções que as
 *  rules abrem para qualquer um (`tournaments` e `artifacts/{appId}/public/data/matches`).
 *
 *  **Não hidrata perfis de propósito.** `public_profiles` exige `request.auth != null`, então
 *  deslogado cada snapshot viraria uma rajada de leituras negadas; os nomes das duplas já vêm
 *  em `team1Label`/`team2Label` no doc da partida. Consequência aceita: sem fotos.
 *
 *  SEM `providedIn` — a página provê a própria instância e os listeners morrem com ela. */
@Injectable()
export class PublicTournamentStore {
  readonly tournamentId = signal<string | null>(null);
  readonly tournament = signal<OrganizerTournament | null>(null);
  readonly matches = signal<TournamentMatch[]>([]);
  readonly loading = signal(true);
  /** Doc inexistente (link errado ou torneio apagado) — diferente de erro de leitura. */
  readonly notFound = signal(false);
  readonly error = signal(false);

  constructor() {
    effect((onCleanup) => {
      const id = this.tournamentId();
      this.tournament.set(null);
      this.matches.set([]);
      this.loading.set(true);
      this.notFound.set(false);
      this.error.set(false);
      if (!id) return;

      const unsubTournament = watchTournament(
        id,
        (t) => {
          this.tournament.set(t);
          this.notFound.set(t === null);
          this.loading.set(false);
          this.error.set(false);
        },
        () => {
          this.error.set(true);
          this.loading.set(false);
        },
      );
      const unsubMatches = watchMatches(
        id,
        (ms) => {
          this.matches.set(ms);
          this.error.set(false);
        },
        () => this.error.set(true),
      );

      onCleanup(() => {
        unsubTournament();
        unsubMatches();
      });
    });
  }
}
```

- [ ] **Step 4: Implementar a página**

Criar `frontend/projects/organizer/src/app/publico/public-tournament-page.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { matchSetWins } from '../painel/data/live-set-display';
import { resolveCourtNames } from '../painel/data/matches-repository';
import { spDayLabel, spTimeLabel } from '../painel/data/schedule-format';
import { PublicCourtCardComponent } from './public-court-card.component';
import { categoryNameOf, publicCourtRows, publicUpcomingRows, recentResults } from './public-selectors';
import { PublicTournamentStore } from './public-tournament.store';

const STATUS_LABEL: Record<string, string> = {
  inscricoes: 'Inscrições abertas',
  andamento: 'Acontecendo agora',
  concluido: 'Torneio encerrado',
  cancelado: 'Torneio cancelado',
};

/** `/t/:tournamentId` — página pública de acompanhamento. Sem login: só lê as coleções
 *  abertas pelas rules. Nada de financeiro entra aqui (o doc do torneio traz `collected` e
 *  `paymentMode`, que ficam de fora de propósito). */
@Component({
  selector: 'pub-tournament-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PublicTournamentStore],
  imports: [PublicCourtCardComponent],
  template: `
    <main class="pub-page">
      @if (store.notFound()) {
        <section class="pub-empty">
          <h1>Torneio não encontrado</h1>
          <p>Confira o link com quem organiza o evento.</p>
        </section>
      } @else if (store.tournament(); as t) {
        <header class="pub-head">
          <span class="pub-status">{{ statusLabel() }}</span>
          <h1 class="pub-title">{{ t.name }}</h1>
          <p class="pub-sub">{{ subtitle() }}</p>
        </header>

        <section class="pub-section">
          <h2 class="pub-h2">Agora nas quadras</h2>
          <div class="pub-courts">
            @for (row of courtRows(); track row.id) {
              <pub-court-card [courtName]="row.name" [kind]="row.kind" [match]="row.match" [categoryLabel]="row.categoryLabel" />
            } @empty {
              <p class="pub-note">Nenhuma quadra cadastrada neste torneio.</p>
            }
          </div>
        </section>

        @if (upcoming().length > 0) {
          <section class="pub-section">
            <h2 class="pub-h2">Próximos jogos</h2>
            <ul class="pub-list">
              @for (row of upcoming(); track row.id) {
                <li class="pub-row">
                  <span class="pub-row-when">
                    <strong>{{ row.time }}</strong>
                    <span>{{ row.court }}</span>
                  </span>
                  <span class="pub-row-body">
                    <span class="pub-row-teams">{{ row.teams }}</span>
                    <span class="pub-row-meta">{{ row.meta }}</span>
                  </span>
                </li>
              }
            </ul>
          </section>
        }

        @if (results().length > 0) {
          <section class="pub-section">
            <h2 class="pub-h2">Resultados</h2>
            <ul class="pub-list">
              @for (row of results(); track row.id) {
                <li class="pub-row">
                  <span class="pub-row-body">
                    <span class="pub-row-teams">{{ row.teams }}</span>
                    <span class="pub-row-meta">{{ row.meta }}</span>
                  </span>
                  <span class="pub-row-score">{{ row.score }}</span>
                </li>
              }
            </ul>
          </section>
        }

        @if (matchCount() === 0) {
          <p class="pub-note">Os jogos aparecem aqui assim que a organização começar a lançar.</p>
        }

        <footer class="pub-foot">
          <span class="pub-foot-live" [class.off]="store.error()">
            {{ store.error() ? 'Reconectando…' : 'Atualizado em tempo real' }}
          </span>
          <span class="pub-foot-brand">nexaGO</span>
        </footer>
      } @else {
        <p class="pub-note">Carregando torneio…</p>
      }
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--nx-bg);
      color: var(--nx-text);
    }
    .pub-page {
      width: min(760px, 100%);
      margin: 0 auto;
      padding: 20px 16px 40px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .pub-head {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .pub-status {
      align-self: flex-start;
      padding: 4px 10px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-orange-tint);
      color: var(--nx-orange-400);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .pub-title {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 26px;
      line-height: 1.15;
    }
    .pub-sub,
    .pub-note {
      margin: 0;
      color: var(--nx-text-dim);
      font-size: 13px;
    }
    .pub-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .pub-h2 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 15px;
      letter-spacing: 0.02em;
    }
    .pub-courts {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr;
    }
    @media (min-width: 640px) {
      .pub-courts {
        grid-template-columns: 1fr 1fr;
      }
    }
    .pub-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .pub-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-0);
    }
    .pub-row-when {
      display: flex;
      flex-direction: column;
      min-width: 74px;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .pub-row-when strong {
      font-family: var(--nx-font-mono);
      font-size: 15px;
      color: var(--nx-text);
    }
    .pub-row-body {
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 2px;
      min-width: 0;
    }
    .pub-row-teams {
      font-size: 14px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .pub-row-meta {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .pub-row-score {
      font-family: var(--nx-font-mono);
      font-size: 15px;
      white-space: nowrap;
    }
    .pub-empty {
      padding: 48px 0;
      text-align: center;
    }
    .pub-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 12px;
      border-top: 1px solid var(--nx-line);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .pub-foot-live.off {
      color: var(--nx-live);
    }
    .pub-foot-brand {
      font-family: var(--nx-font-display);
      font-weight: 700;
      color: var(--nx-orange-500);
    }
  `,
})
export class PublicTournamentPageComponent {
  /** Preenchido pelo router (`withComponentInputBinding`). */
  readonly tournamentId = input.required<string>();

  protected readonly store = inject(PublicTournamentStore);
  private readonly title = inject(Title);

  /** Relógio de baixa frequência: decide o que é "agora" na quadra e o que entra na fila. */
  private readonly now = signal(Date.now());

  private readonly matchesWithCourtNames = computed(() =>
    resolveCourtNames(this.store.matches(), this.store.tournament()?.courts ?? []),
  );

  protected readonly matchCount = computed(() => this.store.matches().length);

  protected readonly statusLabel = computed(() => STATUS_LABEL[this.store.tournament()?.status ?? ''] ?? 'Torneio');

  protected readonly subtitle = computed(() => {
    const t = this.store.tournament();
    if (!t) return '';
    const parts = [t.location, t.city].filter((p): p is string => !!p && p.length > 0);
    if (t.startAt) parts.push(`${spDayLabel(t.startAt)} · ${spTimeLabel(t.startAt)}`);
    return parts.join(' · ');
  });

  protected readonly courtRows = computed(() => {
    const t = this.store.tournament();
    if (!t) return [];
    return publicCourtRows(this.matchesWithCourtNames(), t.courts, t.categories, this.now());
  });

  protected readonly upcoming = computed(() => {
    const t = this.store.tournament();
    if (!t) return [];
    return publicUpcomingRows(this.matchesWithCourtNames(), t.courts, t.categories, this.now());
  });

  protected readonly results = computed(() => {
    const t = this.store.tournament();
    if (!t) return [];
    return recentResults(this.matchesWithCourtNames()).map((m) => {
      const [a, b] = matchSetWins(m);
      return {
        id: m.id,
        teams: `${m.team1Label} vs ${m.team2Label}`,
        meta: [categoryNameOf(t.categories, m.categoryId), m.round ?? ''].filter((part) => part.length > 0).join(' · '),
        score: m.score ?? `${a} × ${b}`,
      };
    });
  });

  constructor() {
    effect(() => this.store.tournamentId.set(this.tournamentId()));

    // Só o NOME entra no título — nada de status, que mudaria o título a cada snapshot.
    effect(() => {
      const name = this.store.tournament()?.name;
      this.title.setTitle(name ? `${name} — ao vivo · NexaGO` : 'Acompanhe ao vivo — NexaGO');
    });

    const clock = setInterval(() => this.now.set(Date.now()), 15_000);
    inject(DestroyRef).onDestroy(() => clearInterval(clock));
  }
}
```

- [ ] **Step 5: Registrar a rota**

Em `app.routes.ts`, logo **antes** do bloco `telao/:tournamentId`:

```ts
  {
    // Página pública de acompanhamento — SEM guard, de propósito: é o link que o público
    // abre pelo QR do telão. Lê só coleções com `allow read: if true`.
    path: 't/:tournamentId',
    title: 'Acompanhe ao vivo — NexaGO',
    loadComponent: () =>
      import('./publico/public-tournament-page.component').then((m) => m.PublicTournamentPageComponent),
  },
```

- [ ] **Step 6: Rodar os dois specs e ver passar**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/public-tournament-page.component.spec.ts' && cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/app.routes.spec.ts'
```

Esperado: PASS nos dois (4 + 4 specs) — agora a rota pública fecha o teste que ficou vermelho na Task 2.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e && git add frontend/projects/organizer/src/app && git commit -m "feat(publico): página /t/:id com jogos ao vivo, fila e resultados"
```

---

### Task 6: QR de acompanhamento no telão

**Files:**
- Create: `frontend/projects/organizer/src/app/publico/public-link.ts`
- Test: `frontend/projects/organizer/src/app/publico/public-link.spec.ts`
- Modify: `frontend/projects/organizer/src/app/painel/telao/telao-screen.component.ts`

**Interfaces:**
- Consumes: `shareQrSvgDataUrl` de `../painel/data/share-qr`; `TelaoConfig.showPublicQr` (Task 1).
- Produces: `publicTournamentUrl(origin: string, tournamentId: string): string`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/organizer/src/app/publico/public-link.spec.ts`:

```ts
import { publicTournamentUrl } from './public-link';

describe('publicTournamentUrl', () => {
  it('monta o link de acompanhamento a partir da origem', () => {
    expect(publicTournamentUrl('https://organizador.nexago.app', 'abc123')).toBe('https://organizador.nexago.app/t/abc123');
  });

  it('não duplica a barra quando a origem já termina em /', () => {
    expect(publicTournamentUrl('https://organizador.nexago.app/', 'abc123')).toBe('https://organizador.nexago.app/t/abc123');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/public-link.spec.ts'
```

Esperado: FALHA — módulo não existe.

- [ ] **Step 3: Implementar o helper**

Criar `frontend/projects/organizer/src/app/publico/public-link.ts`:

```ts
/** Link público de acompanhamento do torneio — o mesmo que vira QR no telão e botão de
 *  copiar na aba Telão. Mantido num módulo só pra não haver duas versões da URL. */
export function publicTournamentUrl(origin: string, tournamentId: string): string {
  return `${origin.replace(/\/+$/, '')}/t/${tournamentId}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/public-link.spec.ts'
```

Esperado: PASS (2 specs).

- [ ] **Step 5: Desenhar o QR no rodapé do telão**

Em `telao-screen.component.ts`:

1. Imports novos (`signal`, `effect`, `computed` e `inject` de `@angular/core` já estão importados no arquivo):

```ts
import { shareQrSvgDataUrl } from '../data/share-qr';
import { publicTournamentUrl } from '../../publico/public-link';
```

2. Na classe, o estado e o efeito que gera o QR:

```ts
  /** QR do link público (`/t/{id}`) — resolvido uma vez por torneio. As dependências são
   *  estáveis (id e flag); NUNCA dependa de um computed que tica com o relógio aqui, senão o
   *  efeito reinicia pra sempre. */
  protected readonly publicQr = signal<string | null>(null);
```

E, dentro do `constructor()`:

```ts
    effect(() => {
      const id = this.svc.tournamentId();
      const show = this.cfg()?.showPublicQr ?? true;
      if (!id || !show) {
        this.publicQr.set(null);
        return;
      }
      void shareQrSvgDataUrl(publicTournamentUrl(location.origin, id)).then((url) => this.publicQr.set(url));
    });
```

3. No template, trocar o bloco do rodapé. Hoje ele é `@if (cfg()?.showCall) { <footer class="og-telao-bar"> … }`; passa a ser:

```html
    @if (cfg()?.showCall || publicQr()) {
      <footer class="og-telao-bar">
        @if (cfg()?.showCall) {
          @if (call(); as c) {
            <span class="og-telao-bar-pill">Chamada</span>
            <span class="og-telao-bar-text" [ogPulse]="c.id">
              <strong>{{ c.a }}</strong>&ngsp;<em>vs</em>&ngsp;<strong>{{ c.b }}</strong>&ngsp;— apresentar-se à {{ c.court }} até
              <span class="og-telao-bar-deadline">{{ c.deadline }}</span>
            </span>
          }
        }
        <span class="og-telao-bar-flex"></span>
        @if (publicQr(); as qr) {
          <span class="og-telao-bar-qr">
            <img class="og-telao-bar-qr-img" [src]="qr" alt="QR do link de acompanhamento do torneio" />
            <span class="og-telao-bar-qr-text">Acompanhe&ngsp;no celular</span>
          </span>
        }
        <span class="og-telao-bar-status" [class.error]="error()">
          {{ error() ? 'Reconectando…' : 'Atualizado em tempo real' }}
          <span class="og-dot" [class.og-dot-red]="error()" [class.og-dot-pulse]="!error()"></span>
        </span>
      </footer>
    }
```

4. Nos `styles` do componente, acrescentar (o telão é arte fixa de 1920×1080, então os tamanhos são absolutos — 96px de QR são ~5 cm numa TV de 55"):

```css
    .og-telao-bar-qr {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      margin-right: 24px;
    }
    .og-telao-bar-qr-img {
      width: 96px;
      height: 96px;
      border-radius: 8px;
      background: #fff;
      padding: 4px;
    }
    .og-telao-bar-qr-text {
      max-width: 140px;
      font-size: 20px;
      line-height: 1.15;
      color: var(--nx-text-mute);
    }
```

O modo Grande Final e a tela de campeões trocam a árvore inteira do template (`telao-final-mode.component`), então o QR não aparece lá — nada a fazer.

- [ ] **Step 6: Compilar e rodar a suíte**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng build organizer --configuration development && npx ng test organizer --watch=false --browsers=ChromeHeadless
```

Esperado: build OK e suíte inteira verde.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e && git add frontend/projects/organizer/src/app && git commit -m "feat(telao): QR de acompanhamento no rodapé"
```

---

### Task 7: Toggle e link público na aba Telão

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/telao/telao-config.component.ts`

**Interfaces:**
- Consumes: `publicTournamentUrl` (Task 6), `shareQrSvgDataUrl`, `TelaoConfig.showPublicQr` (Task 1).
- Produces: nada consumido por outra task.

- [ ] **Step 1: Adicionar o toggle**

Em `telao-config.component.ts`, na constante `TOGGLES`, acrescentar ao final:

```ts
  { key: 'showPublicQr', title: 'QR de acompanhamento', desc: 'O público aponta a câmera e vê os jogos ao vivo no celular' },
```

E no tipo `TelaoToggleKey`, acrescentar `| 'showPublicQr'`.

- [ ] **Step 2: Estado do link público**

Imports novos:

```ts
import { shareQrSvgDataUrl } from '../data/share-qr';
import { publicTournamentUrl } from '../../publico/public-link';
```

Na classe:

```ts
  protected readonly copiedPublic = signal(false);
  private copiedPublicTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly publicQr = signal<string | null>(null);

  protected publicUrl(): string {
    return publicTournamentUrl(location.origin, this.id());
  }

  protected copyPublicLink(): void {
    void navigator.clipboard.writeText(this.publicUrl()).then(() => {
      this.copiedPublic.set(true);
      if (this.copiedPublicTimer) clearTimeout(this.copiedPublicTimer);
      this.copiedPublicTimer = setTimeout(() => this.copiedPublic.set(false), 2000);
    });
  }
```

No `constructor()`, ao lado do efeito que alimenta `svc.tournamentId`:

```ts
    effect(() => {
      void shareQrSvgDataUrl(publicTournamentUrl(location.origin, this.id())).then((url) => this.publicQr.set(url));
    });
```

E no `destroyRef.onDestroy` já existente, acrescentar `if (this.copiedPublicTimer) clearTimeout(this.copiedPublicTimer);`.

- [ ] **Step 3: Card no template**

Depois do card "TV da arena", dentro da `<aside class="og-telao-cfg-side">`:

```html
            <og-card kicker="Público" title="Acompanhamento público">
              <p class="og-telao-cfg-tv">
                Quem está na arena aponta a câmera pro QR do telão e acompanha os jogos no celular — sem login, sem app. Você
                também pode mandar o link direto no grupo.
              </p>
              @if (publicQr(); as qr) {
                <img class="og-telao-cfg-qr" [src]="qr" alt="QR do link público do torneio" />
              }
              <code class="og-telao-cfg-url">{{ publicUrl() }}</code>
              <button type="button" class="og-ghost-btn og-telao-cfg-tv-btn" (click)="copyPublicLink()">
                {{ copiedPublic() ? 'Link copiado ✓' : 'Copiar link público' }}
              </button>
            </og-card>
```

Estilos novos, junto dos demais do componente:

```css
    .og-telao-cfg-qr {
      display: block;
      width: 132px;
      height: 132px;
      margin: 10px 0;
      border-radius: var(--nx-r-2);
      background: #fff;
      padding: 6px;
    }
    .og-telao-cfg-url {
      display: block;
      overflow-wrap: anywhere;
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
```

- [ ] **Step 4: Compilar e rodar a suíte**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng build organizer --configuration development && npx ng test organizer --watch=false --browsers=ChromeHeadless
```

Esperado: build OK, suíte verde.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e && git add frontend/projects/organizer/src/app && git commit -m "feat(telao): toggle do QR e link público na aba do torneio"
```

---

### Task 8: Verificação de ponta a ponta

**Files:** nenhum (a menos que apareça defeito).

- [ ] **Step 1: Suíte completa e build de produção**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless && npx ng build organizer --configuration production
```

Esperado: suíte verde com a contagem **maior** que o baseline da Task 0 (28 specs novos: 5 + 4 + 10 + 3 + 4 + 2), e build de produção OK. Confirme que a linha `Output location:` contém `worktrees/` — se não contiver, você compilou o checkout principal.

- [ ] **Step 2: Subir o dev server**

Criar/ajustar `.claude/launch.json` na raiz do worktree com uma entrada apontando para o organizer, e subir com a ferramenta de preview (nunca `ng serve` pelo Bash):

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "organizer", "runtimeExecutable": "npx", "runtimeArgs": ["ng", "serve", "organizer", "--port", "4210"], "port": 4210 }
  ]
}
```

O `ng serve` precisa rodar com cwd em `<worktree>/frontend` — se a ferramenta de preview subir na raiz do worktree, ela pega o `angular.json` do checkout principal. Confira no log do servidor que o caminho do projeto contém `worktrees/`.

- [ ] **Step 3: Abrir a página pública SEM login**

Pegue o id de um torneio real do ambiente de dev (o mesmo id que aparece na URL `/painel/eventos/<id>` quando o dono navega) e abra `http://localhost:4210/t/<id>`.

Verificar:
- A página carrega **sem redirecionar para `/entrar`**.
- Nome, arena e status aparecem no cabeçalho.
- O console não tem `permission-denied` (é o sintoma de leitura que escapou para `public_profiles`/`users`).
- Nenhuma requisição a `public_profiles` na aba de rede.
- Em 375px de largura (preset mobile) nada estoura horizontalmente.

- [ ] **Step 4: Provar o link errado**

Abrir `http://localhost:4210/t/nao-existe-999` e confirmar a tela "Torneio não encontrado".

- [ ] **Step 5: Screenshot para o dono**

Tirar screenshot da página pública em mobile e anexar na conversa. A aba Telão e o QR na TV exigem login de organizador — se não houver sessão disponível, deixe explícito no relatório que essa parte não foi verificada visualmente, em vez de afirmar que está certa.

- [ ] **Step 6: Conferir a árvore e a branch**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-screen-public-route-3c379e && git status --short && git log --oneline main..HEAD
```

Esperado: árvore limpa e 7 commits (Tasks 1–7).
