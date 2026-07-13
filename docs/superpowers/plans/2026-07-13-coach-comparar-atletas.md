# Comparar Atletas (Portal do Treinador) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Comparar atletas" screen to the coach portal (`frontend/projects/coach`) that lets a coach pick two athletes from the active squad and see them side by side — technical-fundamentals radar, average evaluation score, and attendance rate — using only real data already in Firestore.

**Architecture:** One new standalone Angular component (`PanelCompararAtletasComponent`) reached via a new route and a header button on the existing Atletas screen. It composes existing services (`AthletesService`, `EvaluationsService`, `TrainingsService`) and existing UI primitives (`RadarChartComponent`, `PanelCardComponent`, etc.) — no new Firestore fields, no Cloud Functions, no new collections. A small shared constant (`FUNDAMENTALS`) is extracted so the new screen and the existing "Nova avaliação" screen don't each define their own copy of the 9 evaluation-fundamental labels. A new pure helper (`attendanceRate`) computes attendance percentage from data `TrainingsService` already exposes.

**Tech Stack:** Angular (standalone components, signals, `OnPush`), TypeScript, Karma/Jasmine for unit tests, Firebase/Firestore (read-only for this feature, via existing services).

## Global Constraints

- Standalone components; do not set `standalone: true` explicitly (it's the default).
- `changeDetection: ChangeDetectionStrategy.OnPush` on every component.
- Use `input()`/signals, not `@Input()` decorators or `mutate()`.
- Portuguese for all UI copy; English for code identifiers (file names, classes, variables).
- No fabricated data: do not show Rating, Win rate, or Pódios — those have no real backing data in this app (per spec). Only Média geral (evaluation average) and Presença (%) go in the direct-comparison card.
- No AI/auto-suggestion framing anywhere in this screen's copy — the coach picks both athletes manually.
- Follow the existing project's pure-function-only unit-testing convention: no Angular component test harness exists in this project (confirmed: only `evaluation-stats.spec.ts` and `radar-geometry.spec.ts` exist, both pure-logic specs) — new component code is verified via `ng build coach` + manual browser walkthrough, matching how every prior coach-portal task was verified.
- Test runner: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`. Build check: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`.

---

### Task 1: Extract the shared `FUNDAMENTALS` constant

**Files:**
- Modify: `frontend/projects/coach/src/app/painel/avaliacoes/evaluation-stats.ts`
- Modify: `frontend/projects/coach/src/app/painel/avaliacoes/evaluation-stats.spec.ts`
- Modify: `frontend/projects/coach/src/app/painel/avaliacoes/panel-nova-avaliacao.component.ts`

**Interfaces:**
- Consumes: nothing new — `EvaluationScores` already exists in `evaluation-stats.ts`.
- Produces: `FUNDAMENTALS: { key: keyof EvaluationScores; label: string }[]` (exported from `evaluation-stats.ts`), 9 entries in this exact order: `saque`/"Saque", `recepcao`/"Recepção", `levantamento`/"Levantamento", `ataque`/"Ataque", `defesa`/"Defesa", `bloqueio`/"Bloqueio", `condicionamento`/"Condicionamento", `comunicacao`/"Comunicação", `mental`/"Mental". Task 3 imports this from `../avaliacoes/evaluation-stats`.

- [ ] **Step 1: Write a failing test locking the `FUNDAMENTALS` shape**

Add to the end of `frontend/projects/coach/src/app/painel/avaliacoes/evaluation-stats.spec.ts` (keep the existing `averageScore`/`latestTwoByAthlete` describe blocks above untouched):

```ts
import { FUNDAMENTALS, averageScore, latestTwoByAthlete, type Evaluation, type EvaluationScores } from './evaluation-stats';
```

(Replace the existing import line at the top of the file with this one — it just adds `FUNDAMENTALS` to the existing import.)

Then append at the bottom of the file:

```ts
describe('FUNDAMENTALS', () => {
  it('lists all 9 evaluation keys in the fixed prototype order', () => {
    expect(FUNDAMENTALS.map((f) => f.key)).toEqual([
      'saque', 'recepcao', 'levantamento', 'ataque', 'defesa',
      'bloqueio', 'condicionamento', 'comunicacao', 'mental',
    ]);
  });

  it('gives every fundamental a non-empty display label', () => {
    expect(FUNDAMENTALS.every((f) => f.label.trim().length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: FAIL — `'FUNDAMENTALS' is not exported from './evaluation-stats'` (or equivalent TS compile error, since the import is added before the export exists).

- [ ] **Step 3: Add `FUNDAMENTALS` to `evaluation-stats.ts`**

In `frontend/projects/coach/src/app/painel/avaliacoes/evaluation-stats.ts`, add this export after the `EvaluationScores` interface (keep the rest of the file — `Evaluation`, `averageScore`, `latestTwoByAthlete` — unchanged):

```ts
export const FUNDAMENTALS: { key: keyof EvaluationScores; label: string }[] = [
  { key: 'saque', label: 'Saque' },
  { key: 'recepcao', label: 'Recepção' },
  { key: 'levantamento', label: 'Levantamento' },
  { key: 'ataque', label: 'Ataque' },
  { key: 'defesa', label: 'Defesa' },
  { key: 'bloqueio', label: 'Bloqueio' },
  { key: 'condicionamento', label: 'Condicionamento' },
  { key: 'comunicacao', label: 'Comunicação' },
  { key: 'mental', label: 'Mental' },
];
```

- [ ] **Step 4: Remove the duplicate constant from `panel-nova-avaliacao.component.ts` and import the shared one**

In `frontend/projects/coach/src/app/painel/avaliacoes/panel-nova-avaliacao.component.ts`:

Replace:
```ts
import type { EvaluationScores } from './evaluation-stats';
import { EvaluationsService } from './evaluations.service';

const FUNDAMENTALS: { key: keyof EvaluationScores; label: string }[] = [
  { key: 'saque', label: 'Saque' },
  { key: 'recepcao', label: 'Recepção' },
  { key: 'levantamento', label: 'Levantamento' },
  { key: 'ataque', label: 'Ataque' },
  { key: 'defesa', label: 'Defesa' },
  { key: 'bloqueio', label: 'Bloqueio' },
  { key: 'condicionamento', label: 'Condicionamento' },
  { key: 'comunicacao', label: 'Comunicação' },
  { key: 'mental', label: 'Mental' },
];
```

With:
```ts
import { FUNDAMENTALS, type EvaluationScores } from './evaluation-stats';
import { EvaluationsService } from './evaluations.service';
```

Leave everything else in the file (including `protected readonly fundamentals = FUNDAMENTALS;` and its usages) exactly as-is — only the constant's definition moves, its name and shape don't change.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: PASS (all specs, including the two new `FUNDAMENTALS` tests).

- [ ] **Step 6: Build check**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors (confirms `panel-nova-avaliacao.component.ts`'s new import resolves and nothing else referenced the removed local constant).

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/avaliacoes/evaluation-stats.ts frontend/projects/coach/src/app/painel/avaliacoes/evaluation-stats.spec.ts frontend/projects/coach/src/app/painel/avaliacoes/panel-nova-avaliacao.component.ts
git commit -m "refactor(coach): share FUNDAMENTALS constant from evaluation-stats

Extracted from panel-nova-avaliacao.component.ts so the upcoming
Comparar atletas screen doesn't redefine the same 9-item list."
```

---

### Task 2: `attendanceRate` pure helper

**Files:**
- Create: `frontend/projects/coach/src/app/painel/treinos/attendance-stats.ts`
- Create: `frontend/projects/coach/src/app/painel/treinos/attendance-stats.spec.ts`

**Interfaces:**
- Consumes: `Training`/`AttendanceStatus` types from `./trainings.service` (already defined: `Training.status: 'agendado'|'realizado'|'cancelado'`, `Training.attendance: Record<string, AttendanceStatus>`, `AttendanceStatus = 'presente'|'ausente'|'atrasado'|'justificado'`).
- Produces: `attendanceRate(athleteUid: string, trainings: Training[]): number | null` — Task 3 imports this from `../treinos/attendance-stats`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/projects/coach/src/app/painel/treinos/attendance-stats.spec.ts`:

```ts
import { attendanceRate } from './attendance-stats';
import type { Training } from './trainings.service';

function training(overrides: Partial<Training> = {}): Training {
  return {
    id: 't1',
    squadId: 's1',
    title: 'Treino',
    date: '2026-07-01',
    startTime: '19:00',
    endTime: '21:00',
    location: '',
    materials: '',
    exercises: [],
    status: 'realizado',
    attendance: {},
    ...overrides,
  };
}

describe('attendanceRate', () => {
  it('returns null when the athlete has no completed training recorded', () => {
    const trainings = [training({ status: 'agendado', attendance: {} })];
    expect(attendanceRate('a1', trainings)).toBeNull();
  });

  it('returns 100 when the athlete was present in every completed training', () => {
    const trainings = [
      training({ id: 't1', attendance: { a1: 'presente' } }),
      training({ id: 't2', attendance: { a1: 'presente' } }),
    ];
    expect(attendanceRate('a1', trainings)).toBe(100);
  });

  it('counts atrasado as attendance and ausente/justificado as absence', () => {
    const trainings = [
      training({ id: 't1', attendance: { a1: 'presente' } }),
      training({ id: 't2', attendance: { a1: 'atrasado' } }),
      training({ id: 't3', attendance: { a1: 'ausente' } }),
      training({ id: 't4', attendance: { a1: 'justificado' } }),
    ];
    expect(attendanceRate('a1', trainings)).toBe(50);
  });

  it('ignores completed trainings where the athlete has no attendance entry', () => {
    const trainings = [
      training({ id: 't1', attendance: { a1: 'presente' } }),
      training({ id: 't2', attendance: { a2: 'presente' } }),
    ];
    expect(attendanceRate('a1', trainings)).toBe(100);
  });

  it('ignores trainings that are not realizado, even if attendance is present', () => {
    const trainings = [training({ status: 'agendado', attendance: { a1: 'presente' } })];
    expect(attendanceRate('a1', trainings)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: FAIL with `Cannot find module './attendance-stats'`.

- [ ] **Step 3: Implement `attendance-stats.ts`**

Create `frontend/projects/coach/src/app/painel/treinos/attendance-stats.ts`:

```ts
import type { Training } from './trainings.service';

/**
 * % de presença de um atleta nos treinos já realizados. `presente` e
 * `atrasado` contam como presença; `ausente` e `justificado` não. Treinos
 * sem entrada de presença para o atleta são ignorados (não contam nem a
 * favor nem contra). Retorna `null` se o atleta não aparece em nenhum
 * treino realizado.
 */
export function attendanceRate(athleteUid: string, trainings: Training[]): number | null {
  const relevant = trainings.filter(
    (t) => t.status === 'realizado' && athleteUid in t.attendance,
  );
  if (relevant.length === 0) {
    return null;
  }
  const attended = relevant.filter((t) => {
    const status = t.attendance[athleteUid];
    return status === 'presente' || status === 'atrasado';
  }).length;
  return Math.round((attended / relevant.length) * 100);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/treinos/attendance-stats.ts frontend/projects/coach/src/app/painel/treinos/attendance-stats.spec.ts
git commit -m "feat(coach): add attendanceRate pure helper for training records

Computes a per-athlete attendance percentage from existing
coaches/{uid}/trainings data — no schema change."
```

---

### Task 3: `PanelCompararAtletasComponent`, route, and entry point

**Files:**
- Create: `frontend/projects/coach/src/app/painel/atletas/panel-comparar-atletas.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`
- Modify: `frontend/projects/coach/src/app/painel/atletas/panel-atletas.component.ts`

**Interfaces:**
- Consumes: `AthletesService.roster: Signal<RosterAthlete[]>` (`RosterAthlete` has `athleteUid`, `displayName`, `initials`, `category`, `status`, `position`), `SquadContextService.activeSquadId: Signal<string | null>`, `EvaluationsService.evaluations: Signal<Evaluation[]>`, `TrainingsService.trainings: Signal<Training[]>`, `latestTwoByAthlete`/`averageScore`/`FUNDAMENTALS` from `../avaliacoes/evaluation-stats` (Task 1), `attendanceRate` from `../treinos/attendance-stats` (Task 2), `RadarChartComponent` (`[axes]`, `[size]`, `[accent]`), `PageHeaderComponent`, `PanelCardComponent`, `PanelShellComponent`, `AthleteAvatarComponent`, `IconComponent`.
- Produces: route `painel/atletas/comparar` → `PanelCompararAtletasComponent`; a "Comparar atletas" button in the Atletas screen header.

**Design note — why a native `<select>`, not `co-form-select`:** `FormSelectComponent` (`co-form-select`) renders every option as a chip and is meant for small fixed enums (category, dominant hand — 2 to 6 options); it also uses the option string itself as the bound value, so it can't distinguish two athletes with the same display name. `panel-presenca.component.ts` and `panel-nova-avaliacao.component.ts` both already pick one item out of a dynamic, ID-keyed list (a training, an athlete) using a plain `<select class="picker">` bound to the id. Athlete pickers here follow that existing precedent, not `co-form-select`.

- [ ] **Step 1: Add the route**

In `frontend/projects/coach/src/app/app.routes.ts`, add this route immediately after the `painel/atletas/novo` route (after the block ending at line 68 in the current file, before the `convite-atleta/:id` route):

```ts
  {
    path: 'painel/atletas/comparar',
    title: 'Comparar atletas — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/atletas/panel-comparar-atletas.component').then(
        (m) => m.PanelCompararAtletasComponent,
      ),
  },
```

- [ ] **Step 2: Create `PanelCompararAtletasComponent`**

Create `frontend/projects/coach/src/app/painel/atletas/panel-comparar-atletas.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RadarChartComponent } from '../ui/radar-chart.component';
import { SquadContextService } from '../ui/squad-context.service';
import { attendanceRate } from '../treinos/attendance-stats';
import { TrainingsService } from '../treinos/trainings.service';
import { FUNDAMENTALS, averageScore, latestTwoByAthlete } from '../avaliacoes/evaluation-stats';
import { EvaluationsService } from '../avaliacoes/evaluations.service';
import { AthletesService, type RosterAthlete } from './athletes.service';

/** Comparação manual entre 2 atletas (protótipos TrComparacaoScreen + TrDuplasScreen,
 *  unificados — ver docs/superpowers/specs/2026-07-13-coach-comparar-atletas-design.md).
 *  Sem rating/win rate/pódios (sem dado real) e sem sugestão automática de dupla. */
@Component({
  selector: 'co-panel-comparar-atletas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AthleteAvatarComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    RadarChartComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Comparar atletas" subtitle="Escolha 2 atletas da equipe ativa" />

      <div class="body">
        @if (roster().length < 2) {
          <p class="empty">Adicione ao menos 2 atletas a esta equipe para comparar.</p>
        } @else {
          <div class="pickers">
            <select class="picker" [value]="athleteA()?.athleteUid ?? ''" (change)="selectAthleteA($any($event.target).value)">
              @for (a of roster(); track a.athleteUid) {
                <option [value]="a.athleteUid">{{ a.displayName }}</option>
              }
            </select>
            <select class="picker" [value]="athleteB()?.athleteUid ?? ''" (change)="selectAthleteB($any($event.target).value)">
              @for (a of roster(); track a.athleteUid) {
                <option [value]="a.athleteUid">{{ a.displayName }}</option>
              }
            </select>
          </div>

          <div class="grid">
            @if (athleteA(); as a) {
              <co-panel-card [title]="a.displayName" [kicker]="a.category || 'Sem categoria'">
                <div class="athlete-head">
                  <co-athlete-avatar [initials]="a.initials" [size]="56" [status]="a.status" />
                </div>
                @if (axesFor(a.athleteUid); as axes) {
                  <div class="radar-wrap"><co-radar-chart [axes]="axes" [size]="260" /></div>
                } @else {
                  <p class="empty">Sem avaliação registrada.</p>
                }
              </co-panel-card>
            }
            @if (athleteB(); as b) {
              <co-panel-card [title]="b.displayName" [kicker]="b.category || 'Sem categoria'">
                <div class="athlete-head">
                  <co-athlete-avatar [initials]="b.initials" [size]="56" [status]="b.status" />
                </div>
                @if (axesFor(b.athleteUid); as axes) {
                  <div class="radar-wrap"><co-radar-chart [axes]="axes" [size]="260" accent="#2A6FDB" /></div>
                } @else {
                  <p class="empty">Sem avaliação registrada.</p>
                }
              </co-panel-card>
            }

            <co-panel-card title="Comparação direta" class="compare-card">
              <div class="compare-row">
                <span class="compare-value" [class.win]="isBetterOrEqual(averageForSelected('a'), averageForSelected('b'))">{{ formatScore(averageForSelected('a')) }}</span>
                <span class="compare-label">Média geral</span>
                <span class="compare-value" [class.win]="isBetterOrEqual(averageForSelected('b'), averageForSelected('a'))">{{ formatScore(averageForSelected('b')) }}</span>
              </div>
              <div class="compare-row">
                <span class="compare-value" [class.win]="isBetterOrEqual(attendanceForSelected('a'), attendanceForSelected('b'))">{{ formatPercent(attendanceForSelected('a')) }}</span>
                <span class="compare-label">Presença</span>
                <span class="compare-value" [class.win]="isBetterOrEqual(attendanceForSelected('b'), attendanceForSelected('a'))">{{ formatPercent(attendanceForSelected('b')) }}</span>
              </div>
            </co-panel-card>
          </div>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }
    .pickers {
      display: flex;
      gap: 12px;
    }
    .picker {
      height: 38px;
      padding: 0 12px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      flex: 1;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .athlete-head {
      display: flex;
      justify-content: center;
      margin-bottom: 14px;
    }
    .radar-wrap {
      display: flex;
      justify-content: center;
    }
    .compare-card {
      grid-column: 1 / -1;
    }
    .compare-row {
      display: grid;
      grid-template-columns: 1fr 120px 1fr;
      align-items: center;
      gap: 10px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .compare-row:last-child {
      border-bottom: none;
    }
    .compare-value {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
      text-align: right;
    }
    .compare-value:last-child {
      text-align: left;
    }
    .compare-value.win {
      color: var(--nx-win);
    }
    .compare-label {
      text-align: center;
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
  `,
})
export class PanelCompararAtletasComponent {
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly trainingsService = inject(TrainingsService);

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  private readonly evaluationsByAthlete = computed(() =>
    latestTwoByAthlete(this.evaluationsService.evaluations()),
  );

  protected readonly athleteAUid = signal<string | null>(null);
  protected readonly athleteBUid = signal<string | null>(null);

  protected readonly athleteA = computed<RosterAthlete | null>(() => {
    const uid = this.athleteAUid() ?? this.roster()[0]?.athleteUid ?? null;
    return this.roster().find((a) => a.athleteUid === uid) ?? null;
  });

  protected readonly athleteB = computed<RosterAthlete | null>(() => {
    const uid = this.athleteBUid() ?? this.roster()[1]?.athleteUid ?? null;
    return this.roster().find((a) => a.athleteUid === uid) ?? null;
  });

  protected selectAthleteA(uid: string): void {
    this.athleteAUid.set(uid || null);
  }

  protected selectAthleteB(uid: string): void {
    this.athleteBUid.set(uid || null);
  }

  protected axesFor(athleteUid: string) {
    const entry = this.evaluationsByAthlete().get(athleteUid);
    if (!entry) {
      return null;
    }
    return FUNDAMENTALS.map((f) => ({ label: f.label, value: entry.latest.scores[f.key] }));
  }

  private averageFor(athleteUid: string): number | null {
    const entry = this.evaluationsByAthlete().get(athleteUid);
    return entry ? averageScore(entry.latest.scores) : null;
  }

  private attendanceFor(athleteUid: string): number | null {
    return attendanceRate(athleteUid, this.trainingsService.trainings());
  }

  protected averageForSelected(side: 'a' | 'b'): number | null {
    const athlete = side === 'a' ? this.athleteA() : this.athleteB();
    return athlete ? this.averageFor(athlete.athleteUid) : null;
  }

  protected attendanceForSelected(side: 'a' | 'b'): number | null {
    const athlete = side === 'a' ? this.athleteA() : this.athleteB();
    return athlete ? this.attendanceFor(athlete.athleteUid) : null;
  }

  protected isBetterOrEqual(a: number | null, b: number | null): boolean {
    if (a === null) {
      return false;
    }
    if (b === null) {
      return true;
    }
    return a >= b;
  }

  protected formatScore(value: number | null): string {
    return value === null ? '—' : value.toFixed(1);
  }

  protected formatPercent(value: number | null): string {
    return value === null ? '—' : `${value}%`;
  }
}
```

- [ ] **Step 3: Add the entry button to the Atletas screen header**

In `frontend/projects/coach/src/app/painel/atletas/panel-atletas.component.ts`, change the header block from:

```html
      <co-page-header title="Gestão de atletas" [subtitle]="subtitle()">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/atletas/novo">
          <co-icon name="plus" [size]="14" />
          Convidar atleta
        </a>
      </co-page-header>
```

To:

```html
      <co-page-header title="Gestão de atletas" [subtitle]="subtitle()">
        <a class="co-ghost-btn" routerLink="/painel/atletas/comparar">
          <co-icon name="radar" [size]="14" />
          Comparar atletas
        </a>
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/atletas/novo">
          <co-icon name="plus" [size]="14" />
          Convidar atleta
        </a>
      </co-page-header>
```

No other changes to this file — `RouterLink` and `IconComponent` are already imported there.

- [ ] **Step 4: Build check**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors (confirms the new component's template bindings and imports type-check).

- [ ] **Step 5: Run the full test suite**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: PASS (no new specs in this task, but this must stay green).

- [ ] **Step 6: Manual browser walkthrough**

Run `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng serve coach`, log in as a coach with at least one squad that has 2+ linked athletes. Expected:
- On `/painel/atletas`, a "Comparar atletas" ghost button now sits to the left of "Convidar atleta" in the header.
- Clicking it navigates to `/painel/atletas/comparar`. The two `<select>` pickers default to the first two athletes in the active squad's roster.
- Each side shows the athlete's avatar, name, category, and a radar chart of their latest evaluation — or "Sem avaliação registrada." if that athlete has none yet.
- The bottom card shows Média geral and Presença for both, with the higher value in orange-adjacent green (`--nx-win`) on each row; `—` where data is missing.
- Switching either `<select>` updates that side immediately.
- If the active squad has fewer than 2 athletes, the empty-state message shows instead of pickers/cards.
- Switching the active squad (sidebar team switcher) while on this screen updates the roster/pickers to the new squad.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/atletas/panel-comparar-atletas.component.ts frontend/projects/coach/src/app/app.routes.ts frontend/projects/coach/src/app/painel/atletas/panel-atletas.component.ts
git commit -m "feat(coach): add Comparar atletas screen

Manual side-by-side comparison of 2 athletes from the active squad —
evaluation radar, average score, and attendance rate, all backed by
real data already collected. Unifies the prototype's separate
Comparação/Duplas screens; no rating, win rate, pódios, or AI pairing
suggestions, since none of that has real data behind it yet."
```

---

## Self-Review Notes

- **Spec coverage:** unified screen (Task 3), reused radar + evaluation data (Task 1, Task 3), real attendance rate (Task 2, Task 3), entry via Atletas header button not a new nav item (Task 3 Step 3), FUNDAMENTALS extraction (Task 1), no fabricated metrics (Global Constraints + Task 3 template only has Média geral/Presença) — every spec decision has a task.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `RosterAthlete` fields (`athleteUid`, `displayName`, `initials`, `category`, `status`) used in Task 3 match `athletes.service.ts`'s existing interface exactly. `Training`/`AttendanceStatus` used in Task 2 match `trainings.service.ts`'s existing interface exactly. `FUNDAMENTALS`'s shape produced in Task 1 matches what Task 3 consumes (`{ key, label }[]`, iterated to build `RadarAxis`-shaped objects). `attendanceRate`'s signature in Task 2 (`(athleteUid: string, trainings: Training[]): number | null`) matches its call site in Task 3.
