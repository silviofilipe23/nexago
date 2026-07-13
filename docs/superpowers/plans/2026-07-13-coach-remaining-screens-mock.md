# Remaining Screens (mock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the last 14 screens of the coach portal prototype (`frontend/projects/coach`) — Permissões, Estatísticas da equipe, Relatórios, Pagamentos, Planos, Novo plano, Comunicação, Biblioteca, IA do treinador, and its 5 "diferencial" screens — all purely visual/mocked, completing the full 39-screen prototype.

**Architecture:** Same pattern as the prior mock round: standalone components with hardcoded module-level example data, no service, no Firestore. One new shared UI primitive (`LineChartComponent`, backed by a pure `line-chart-geometry.ts`) is added in Task 1 and reused in Task 6. 5 new sidebar nav items; 2 screens reached via header buttons on existing screens; 5 "diferencial" screens reached via cards on the new IA hub screen.

**Tech Stack:** Angular (standalone components, signals, `OnPush`), TypeScript, Karma/Jasmine (one new pure-logic spec).

## Global Constraints

- Standalone components; do not set `standalone: true` explicitly.
- `changeDetection: ChangeDetectionStrategy.OnPush` on every component.
- Portuguese UI copy, English code identifiers.
- **No Firestore, no service files, no persistence.** All data is hardcoded module-level constants. Buttons with no destination screen in this plan render inert (no navigation, no write) — do not fabricate behavior for them.
- Reuse existing UI primitives (`co-page-header`, `co-panel-card`, `co-pill`, `co-progress-bar`, `co-row`, `co-athlete-avatar`, `co-kpi-card`, `co-tabs`, `co-form-field`, `co-form-select`, `co-form-textarea`, `co-icon`) plus the one new `co-line-chart` from Task 1.
- Verification per task: `ng build coach` + manual browser walkthrough (no Angular component test harness in this project, except the one new pure-logic spec in Task 1).
- Build command: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`. Test command: same cwd, `npx ng test coach --watch=false`.

---

### Task 1: `LineChartComponent` + Permissões + Estatísticas da equipe + Relatórios

**Files:**
- Create: `frontend/projects/coach/src/app/painel/ui/line-chart-geometry.ts`
- Create: `frontend/projects/coach/src/app/painel/ui/line-chart-geometry.spec.ts`
- Create: `frontend/projects/coach/src/app/painel/ui/line-chart.component.ts`
- Create: `frontend/projects/coach/src/app/painel/permissoes/panel-permissoes.component.ts`
- Create: `frontend/projects/coach/src/app/painel/torneios/panel-estatisticas.component.ts`
- Create: `frontend/projects/coach/src/app/painel/historico/panel-relatorios.component.ts`
- Modify: `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`
- Modify: `frontend/projects/coach/src/app/painel/torneios/panel-torneios.component.ts`
- Modify: `frontend/projects/coach/src/app/painel/historico/panel-historico.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Produces: `lineChartPoints(values: number[], width: number, height: number, padding?: number): { x: number; y: number }[]`, `pointsToPolylineAttr(points: { x: number; y: number }[]): string` (both pure, tested). `LineChartComponent` (`co-line-chart`): inputs `data: input.required<{ label: string; value: number }[]>()`, `width: input(320)`, `height: input(140)`, `accent: input('#FF6A1A')`. Consumed again by Task 6's Evolução do rating screen.
- Produces: routes `painel/permissoes`, `painel/torneios/estatisticas`, `painel/historico/relatorios`. New `NAV_ITEMS` entry `{ id: 'permissoes', label: 'Permissões', icon: 'gear', route: '/painel/permissoes' }`, inserted right after `'lesoes'`.

- [ ] **Step 1: Write the failing tests for the line-chart geometry**

Create `frontend/projects/coach/src/app/painel/ui/line-chart-geometry.spec.ts`:

```ts
import { lineChartPoints, pointsToPolylineAttr } from './line-chart-geometry';

describe('lineChartPoints', () => {
  it('returns an empty array for no values', () => {
    expect(lineChartPoints([], 320, 140)).toEqual([]);
  });

  it('centers a single value horizontally at mid-height', () => {
    const points = lineChartPoints([50], 320, 140, 20);
    expect(points.length).toBe(1);
    expect(points[0].x).toBeCloseTo(160, 5);
  });

  it('places the minimum value at the bottom and the maximum at the top of the chart area', () => {
    const points = lineChartPoints([10, 20], 100, 100, 10);
    expect(points[0].y).toBeCloseTo(90, 5);
    expect(points[1].y).toBeCloseTo(10, 5);
  });

  it('spaces points evenly across the width for equal-length series', () => {
    const points = lineChartPoints([1, 2, 3], 100, 100, 0);
    expect(points[0].x).toBeCloseTo(0, 5);
    expect(points[1].x).toBeCloseTo(50, 5);
    expect(points[2].x).toBeCloseTo(100, 5);
  });

  it('falls back to a flat mid-height line when all values are equal', () => {
    const points = lineChartPoints([5, 5, 5], 100, 100, 0);
    expect(points[0].y).toBeCloseTo(50, 5);
    expect(points[1].y).toBeCloseTo(50, 5);
    expect(points[2].y).toBeCloseTo(50, 5);
  });
});

describe('pointsToPolylineAttr', () => {
  it('joins points into an SVG polyline points attribute', () => {
    expect(pointsToPolylineAttr([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('1,2 3,4');
  });

  it('returns an empty string for no points', () => {
    expect(pointsToPolylineAttr([])).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: FAIL with `Cannot find module './line-chart-geometry'`.

- [ ] **Step 3: Implement `line-chart-geometry.ts`**

Create `frontend/projects/coach/src/app/painel/ui/line-chart-geometry.ts`:

```ts
export interface LinePoint {
  x: number;
  y: number;
}

/** Normaliza uma série de valores em pontos de um SVG de largura/altura dados. */
export function lineChartPoints(values: number[], width: number, height: number, padding = 20): LinePoint[] {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const n = values.length;
  return values.map((v, i) => ({
    x: padding + (n === 1 ? chartWidth / 2 : (i / (n - 1)) * chartWidth),
    y: padding + chartHeight - ((v - min) / range) * chartHeight,
  }));
}

export function pointsToPolylineAttr(points: LinePoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: PASS.

- [ ] **Step 5: Create `LineChartComponent`**

Create `frontend/projects/coach/src/app/painel/ui/line-chart.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { lineChartPoints, pointsToPolylineAttr } from './line-chart-geometry';

export interface LineChartPoint {
  label: string;
  value: number;
}

/** Gráfico de linha simples (protótipo ArLineChart) — sem lib externa, mesmo espírito do co-radar-chart. */
@Component({
  selector: 'co-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="width()" [attr.height]="height()" [attr.viewBox]="'0 0 ' + width() + ' ' + height()">
      <polyline [attr.points]="polylineAttr()" fill="none" [attr.stroke]="accent()" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      @for (p of points(); track $index) {
        <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" [attr.fill]="accent()" />
        <text [attr.x]="p.x" [attr.y]="height() - 4" text-anchor="middle" font-family="var(--nx-font-mono)" font-size="9.5" fill="var(--nx-text-dim)">{{ data()[$index].label }}</text>
      }
    </svg>
  `,
})
export class LineChartComponent {
  readonly data = input.required<LineChartPoint[]>();
  readonly width = input(320);
  readonly height = input(140);
  readonly accent = input('#FF6A1A');

  protected readonly points = computed(() =>
    lineChartPoints(this.data().map((d) => d.value), this.width(), this.height() - 16),
  );

  protected polylineAttr(): string {
    return pointsToPolylineAttr(this.points());
  }
}
```

- [ ] **Step 6: Build check**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors.

- [ ] **Step 7: Commit the shared primitive**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/ui/line-chart-geometry.ts frontend/projects/coach/src/app/painel/ui/line-chart-geometry.spec.ts frontend/projects/coach/src/app/painel/ui/line-chart.component.ts
git commit -m "feat(coach): add reusable LineChartComponent

Pure SVG polyline chart, no external lib, mirrors co-radar-chart's
pattern. Backed by tested pure geometry functions."
```

- [ ] **Step 8: Add the `gear`-icon Permissões nav item**

In `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`, change `NAV_ITEMS` from ending with:

```ts
  { id: 'lesoes', label: 'Lesões', icon: 'medical', route: '/painel/lesoes' },
];
```

To:

```ts
  { id: 'lesoes', label: 'Lesões', icon: 'medical', route: '/painel/lesoes' },
  { id: 'permissoes', label: 'Permissões', icon: 'gear', route: '/painel/permissoes' },
];
```

- [ ] **Step 9: Create `PanelPermissoesComponent`**

Create `frontend/projects/coach/src/app/painel/permissoes/panel-permissoes.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';

interface StaffMember {
  initials: string;
  name: string;
  role: string;
  roleTone: PillTone;
}

const STAFF: StaffMember[] = [
  { initials: 'CM', name: 'Carla Mendes', role: 'Treinador principal', roleTone: 'orange' },
  { initials: 'BR', name: 'Bruno Ricci', role: 'Auxiliar', roleTone: 'dim' },
  { initials: 'FS', name: 'Fernanda Sales', role: 'Preparadora física', roleTone: 'green' },
  { initials: 'MT', name: 'Marcos Teixeira', role: 'Fisioterapeuta', roleTone: 'yellow' },
  { initials: 'JL', name: 'Julia Lopes', role: 'Psicóloga', roleTone: 'dim' },
];

interface RoleScope {
  title: string;
  description: string;
}

const ROLE_SCOPES: RoleScope[] = [
  { title: 'Treinador principal', description: 'Acesso total: atletas, treinos, avaliações, financeiro da equipe' },
  { title: 'Auxiliar', description: 'Treinos, presença e comunicação — sem edição de permissões' },
  { title: 'Preparador físico', description: 'Plano de evolução física e condicionamento' },
  { title: 'Fisioterapeuta', description: 'Módulo de lesões e histórico de saúde' },
  { title: 'Psicólogo', description: 'Notas de acompanhamento mental — acesso restrito' },
];

/** Permissões (protótipo TrPermissoesScreen) — tela mock: dado de exemplo fixo, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-permissoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AthleteAvatarComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Permissões" subtitle="Comissão técnica" />

      <div class="body">
        <co-panel-card title="Papéis de acesso" kicker="5 perfis definidos">
          @for (s of staff; track s.initials; let last = $last) {
            <co-row [title]="s.name" sub="Acesso desde jan/2026" [last]="last">
              <co-athlete-avatar row-avatar [initials]="s.initials" [size]="36" />
              <co-pill row-trailing [tone]="s.roleTone">{{ s.role }}</co-pill>
            </co-row>
          }
        </co-panel-card>

        <co-panel-card title="O que cada papel enxerga" kicker="Referência rápida">
          <div class="grid">
            @for (r of roleScopes; track r.title) {
              <div class="scope-card">
                <div class="scope-title">{{ r.title }}</div>
                <div class="scope-desc">{{ r.description }}</div>
              </div>
            }
          </div>
        </co-panel-card>
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
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
    .scope-card {
      padding: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
    }
    .scope-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
      margin-bottom: 5px;
    }
    .scope-desc {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      line-height: 1.4;
    }
  `,
})
export class PanelPermissoesComponent {
  protected readonly staff = STAFF;
  protected readonly roleScopes = ROLE_SCOPES;
}
```

- [ ] **Step 10: Add the `painel/permissoes` route**

In `frontend/projects/coach/src/app/app.routes.ts`, add this route immediately after the `painel/agenda` route (the last route before `{ path: '**', redirectTo: '' }`):

```ts
  {
    path: 'painel/permissoes',
    title: 'Permissões — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/permissoes/panel-permissoes.component').then((m) => m.PanelPermissoesComponent),
  },
```

- [ ] **Step 11: Build check**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors.

- [ ] **Step 12: Commit Permissões**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/permissoes/panel-permissoes.component.ts frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add Permissões screen (mock)

New sidebar nav item. Static UI matching the prototype — hardcoded
staff list and role-scope reference, no Firestore, no persistence."
```

- [ ] **Step 13: Create `PanelEstatisticasComponent`**

Create `frontend/projects/coach/src/app/painel/torneios/panel-estatisticas.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { ProgressBarComponent, type ProgressTone } from '../ui/progress-bar.component';

interface CategoryParticipation {
  label: string;
  sub: string;
  pct: number;
  tone: ProgressTone;
}

const RATING_SERIES = [
  { label: 'Fev', value: 1780 },
  { label: 'Mar', value: 1820 },
  { label: 'Abr', value: 1865 },
  { label: 'Mai', value: 1902 },
  { label: 'Jun', value: 1940 },
  { label: 'Jul', value: 1978 },
];

const CATEGORY_PARTICIPATION: CategoryParticipation[] = [
  { label: 'Intermediário', sub: '12 atletas', pct: 88, tone: 'green' },
  { label: 'Open', sub: '6 atletas', pct: 94, tone: 'orange' },
  { label: 'Iniciante', sub: '6 atletas', pct: 62, tone: 'yellow' },
];

/** Estatísticas da equipe (protótipo TrEstatisticasScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-estatisticas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KpiCardComponent, LineChartComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, ProgressBarComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Estatísticas da equipe" subtitle="Equipe Adulto Masculino · Visão geral" />

      <div class="body">
        <div class="kpi-row">
          <co-kpi-card label="Treinos realizados" value="42" delta="86% de participação" />
          <co-kpi-card label="Vitórias" value="18" delta="72% de aproveitamento" deltaTone="green" />
          <co-kpi-card label="Derrotas" value="7" deltaTone="red" />
          <co-kpi-card label="Pódios" value="9" delta="Últimos 12 meses" deltaTone="flat" />
        </div>
        <div class="grid">
          <co-panel-card title="Rating médio da equipe" kicker="Últimos 6 meses">
            <co-line-chart [data]="ratingSeries" [width]="420" [height]="160" />
          </co-panel-card>
          <co-panel-card title="Participação por categoria">
            @for (c of categoryParticipation; track c.label) {
              <div class="cat-row">
                <div class="cat-label">{{ c.label }}<span class="cat-sub">{{ c.sub }}</span></div>
                <co-progress-bar [pct]="c.pct" [tone]="c.tone" />
              </div>
            }
          </co-panel-card>
        </div>
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
    .kpi-row {
      display: flex;
      gap: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .cat-row {
      margin-bottom: 14px;
    }
    .cat-row:last-child {
      margin-bottom: 0;
    }
    .cat-label {
      display: flex;
      justify-content: space-between;
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text);
      margin-bottom: 6px;
    }
    .cat-sub {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
  `,
})
export class PanelEstatisticasComponent {
  protected readonly ratingSeries = RATING_SERIES;
  protected readonly categoryParticipation = CATEGORY_PARTICIPATION;
}
```

- [ ] **Step 14: Add the "Estatísticas da equipe" button to Torneios and the route**

In `frontend/projects/coach/src/app/painel/torneios/panel-torneios.component.ts`, change:

```html
      <co-page-header title="Torneios" [subtitle]="subtitle()" />
```

To:

```html
      <co-page-header title="Torneios" [subtitle]="subtitle()">
        <a class="co-ghost-btn" routerLink="/painel/torneios/estatisticas">
          <co-icon name="radar" [size]="14" />
          Estatísticas da equipe
        </a>
      </co-page-header>
```

Add `RouterLink` and `IconComponent` to this file's `imports` array (check the current imports array — it currently has `PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, RowComponent`; add `RouterLink` from `@angular/router` and `IconComponent` from `'../ui/icon.component'` to both the import statements at the top and the `imports: [...]` array).

In `frontend/projects/coach/src/app/app.routes.ts`, add this route immediately after the `painel/torneios` route:

```ts
  {
    path: 'painel/torneios/estatisticas',
    title: 'Estatísticas da equipe — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/torneios/panel-estatisticas.component').then((m) => m.PanelEstatisticasComponent),
  },
```

- [ ] **Step 15: Build check**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors.

- [ ] **Step 16: Commit Estatísticas da equipe**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/torneios/panel-estatisticas.component.ts frontend/projects/coach/src/app/painel/torneios/panel-torneios.component.ts frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add Estatísticas da equipe screen (mock)

Reached via a button on Torneios (matches the prototype's own nav
grouping). Static UI, no Firestore, no persistence."
```

- [ ] **Step 17: Create `PanelRelatoriosComponent`**

Create `frontend/projects/coach/src/app/painel/historico/panel-relatorios.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';

/** Relatórios (protótipo TrRelatoriosScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-relatorios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Relatórios" subtitle="Gerar relatório">
        <button type="button" class="co-mini-btn">
          <co-icon name="download" [size]="14" />
          Excel
        </button>
        <button type="button" class="co-mini-btn co-mini-btn-primary">
          <co-icon name="download" [size]="14" />
          PDF
        </button>
      </co-page-header>

      <div class="body">
        <co-panel-card title="Configurar relatório" kicker="Escopo e período">
          <div class="field"><div class="f-label">Escopo</div><div class="f-value">Equipe Adulto Masculino</div></div>
          <div class="field"><div class="f-label">Período</div><div class="f-value">Mensal — julho de 2026</div></div>
          <div class="field"><div class="f-label">Incluir</div><div class="f-value">Presença, avaliações, rating e resultados</div></div>
        </co-panel-card>

        <co-panel-card title="Pré-visualização" kicker="Relatório mensal · Equipe Adulto Masculino">
          <co-row title="Frequência média">
            <span row-trailing class="stat">86%</span>
          </co-row>
          <co-row title="Rating médio">
            <span row-trailing class="stat">1.978</span>
          </co-row>
          <co-row title="Vitórias × derrotas">
            <span row-trailing class="stat">18–7</span>
          </co-row>
          <co-row title="Pódios no período" [last]="true">
            <span row-trailing class="stat win">3</span>
          </co-row>
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 16px;
      min-height: 0;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 16px;
    }
    .field:last-child {
      margin-bottom: 0;
    }
    .f-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .f-value {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
    }
    .stat {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .stat.win {
      color: var(--nx-win);
    }
  `,
})
export class PanelRelatoriosComponent {}
```

- [ ] **Step 18: Add the "Relatórios" button to Histórico and the route**

In `frontend/projects/coach/src/app/painel/historico/panel-historico.component.ts`, change:

```html
      <co-page-header title="Histórico completo" [subtitle]="subtitle()">
        <select class="picker" [value]="athleteUid() ?? ''" (change)="selectAthlete($any($event.target).value)">
          <option value="">Selecione um atleta…</option>
          @for (a of roster(); track a.athleteUid) {
            <option [value]="a.athleteUid">{{ a.displayName }}</option>
          }
        </select>
      </co-page-header>
```

To:

```html
      <co-page-header title="Histórico completo" [subtitle]="subtitle()">
        <select class="picker" [value]="athleteUid() ?? ''" (change)="selectAthlete($any($event.target).value)">
          <option value="">Selecione um atleta…</option>
          @for (a of roster(); track a.athleteUid) {
            <option [value]="a.athleteUid">{{ a.displayName }}</option>
          }
        </select>
        <a class="co-ghost-btn" routerLink="/painel/historico/relatorios">
          <co-icon name="download" [size]="14" />
          Relatórios
        </a>
      </co-page-header>
```

Add `RouterLink` (from `@angular/router`) and `IconComponent` (from `../ui/icon.component`) to this file's imports and `imports: [...]` array.

In `frontend/projects/coach/src/app/app.routes.ts`, add this route immediately after the `painel/historico` route:

```ts
  {
    path: 'painel/historico/relatorios',
    title: 'Relatórios — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/historico/panel-relatorios.component').then((m) => m.PanelRelatoriosComponent),
  },
```

- [ ] **Step 19: Build check + full test suite**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors.

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: PASS (21/21 — 15 pre-existing + 6 new line-chart-geometry specs).

- [ ] **Step 20: Manual browser walkthrough**

Run `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng serve coach`, log in as a coach. Expected:
- Sidebar shows a 12th item "Permissões" (gear icon) after "Lesões"; `/painel/permissoes` shows the 5-person staff list and the 3-column role-scope reference cards.
- `/painel/torneios` now has an "Estatísticas da equipe" ghost button in its header; clicking it goes to `/painel/torneios/estatisticas`, showing 4 KPI cards, a line chart (6-point rating trend), and 3 category-participation progress bars.
- `/painel/historico` now has a "Relatórios" ghost button next to the athlete picker; clicking it goes to `/painel/historico/relatorios`, showing the config fields on the left and 4 static preview rows on the right. The Excel/PDF buttons are visually present but do nothing on click (expected — no destination screen for them in this plan).

- [ ] **Step 21: Commit Relatórios**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/historico/panel-relatorios.component.ts frontend/projects/coach/src/app/painel/historico/panel-historico.component.ts frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add Relatórios screen (mock)

Reached via a button on Histórico (matches the prototype's own nav
grouping). Static UI, no Firestore, no persistence."
```

---

### Task 2: Financeiro — Pagamentos + Planos + Novo plano

**Files:**
- Create: `frontend/projects/coach/src/app/painel/financeiro/panel-pagamentos.component.ts`
- Create: `frontend/projects/coach/src/app/painel/financeiro/panel-planos.component.ts`
- Create: `frontend/projects/coach/src/app/painel/financeiro/panel-novo-plano.component.ts`
- Modify: `frontend/projects/coach/src/app/painel/ui/icon.component.ts`
- Modify: `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Produces: new `'wallet'` case on `PanelIconName`; new `NAV_ITEMS` entry `{ id: 'financeiro', label: 'Financeiro', icon: 'wallet', route: '/painel/financeiro' }`, inserted right after `'permissoes'`; routes `painel/financeiro` → `PanelPagamentosComponent`, `painel/financeiro/planos` → `PanelPlanosComponent`, `painel/financeiro/planos/novo` → `PanelNovoPlanoComponent`.

- [ ] **Step 1: Add the `wallet` icon**

In `frontend/projects/coach/src/app/painel/ui/icon.component.ts`, add `| 'wallet'` to the end of the `PanelIconName` union, and add this `@case` right after the `@case ('medical')` block:

```html
        @case ('wallet') {
          <rect x="2.5" y="6" width="19" height="13" rx="2.5" /><path d="M2.5 10.5h19" /><circle cx="17" cy="14" r="1.2" fill="currentColor" stroke="none" />
        }
```

- [ ] **Step 2: Add the "Financeiro" nav item**

In `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`, change the `NAV_ITEMS` array's last line from:

```ts
  { id: 'permissoes', label: 'Permissões', icon: 'gear', route: '/painel/permissoes' },
];
```

To:

```ts
  { id: 'permissoes', label: 'Permissões', icon: 'gear', route: '/painel/permissoes' },
  { id: 'financeiro', label: 'Financeiro', icon: 'wallet', route: '/painel/financeiro' },
];
```

- [ ] **Step 3: Add the 3 routes**

In `frontend/projects/coach/src/app/app.routes.ts`, add these 3 routes immediately after the `painel/permissoes` route:

```ts
  {
    path: 'painel/financeiro',
    title: 'Pagamentos — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/financeiro/panel-pagamentos.component').then((m) => m.PanelPagamentosComponent),
  },
  {
    path: 'painel/financeiro/planos',
    title: 'Planos — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/financeiro/panel-planos.component').then((m) => m.PanelPlanosComponent),
  },
  {
    path: 'painel/financeiro/planos/novo',
    title: 'Novo plano — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/financeiro/panel-novo-plano.component').then((m) => m.PanelNovoPlanoComponent),
  },
```

- [ ] **Step 4: Create `PanelPagamentosComponent`**

Create `frontend/projects/coach/src/app/painel/financeiro/panel-pagamentos.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AthleteAvatarComponent, type AthleteStatus } from '../ui/athlete-avatar.component';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { ProgressBarComponent } from '../ui/progress-bar.component';
import { RowComponent } from '../ui/row.component';
import { TabsComponent } from '../ui/tabs.component';

type PaymentStatus = 'pago' | 'pendente' | 'atrasado';

interface Payment {
  athleteName: string;
  athleteInitials: string;
  athleteStatus: AthleteStatus;
  plano: string;
  valor: number;
  vencimento: string;
  status: PaymentStatus;
  metodo: string | null;
  dataPagamento: string | null;
}

const PAYMENTS: Payment[] = [
  { athleteName: 'João Silva', athleteInitials: 'JS', athleteStatus: 'ativo', plano: 'Mensal', valor: 180, vencimento: '05/07/2026', status: 'pago', metodo: 'Pix', dataPagamento: '04/07' },
  { athleteName: 'Ana Beatriz', athleteInitials: 'AB', athleteStatus: 'ativo', plano: 'Trimestral', valor: 480, vencimento: '10/07/2026', status: 'pago', metodo: 'Cartão', dataPagamento: '09/07' },
  { athleteName: 'Lucas Ramos', athleteInitials: 'LR', athleteStatus: 'lesionado', plano: 'Mensal', valor: 180, vencimento: '01/07/2026', status: 'atrasado', metodo: null, dataPagamento: null },
  { athleteName: 'Pedro Silva', athleteInitials: 'PS', athleteStatus: 'lesionado', plano: 'Mensal', valor: 180, vencimento: '08/07/2026', status: 'pendente', metodo: null, dataPagamento: null },
  { athleteName: 'João Vitor', athleteInitials: 'JV', athleteStatus: 'afastado', plano: 'Anual', valor: 1600, vencimento: '15/01/2027', status: 'pago', metodo: 'Cartão', dataPagamento: '15/01' },
  { athleteName: 'Rafael Nunes', athleteInitials: 'RN', athleteStatus: 'ferias', plano: 'Mensal', valor: 180, vencimento: '12/07/2026', status: 'pendente', metodo: null, dataPagamento: null },
];

const STATUS_TONE: Record<PaymentStatus, PillTone> = { pago: 'green', pendente: 'yellow', atrasado: 'red' };
const STATUS_LABEL: Record<PaymentStatus, string> = { pago: 'Pago', pendente: 'Pendente', atrasado: 'Atrasado' };

function brl(value: number): string {
  return 'R$ ' + value.toLocaleString('pt-BR');
}

/** Pagamentos (protótipo TrPagamentosScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-pagamentos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AthleteAvatarComponent,
    IconComponent,
    KpiCardComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    PillComponent,
    ProgressBarComponent,
    RowComponent,
    TabsComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Pagamentos" subtitle="Planos dos atletas · Equipe Adulto Masculino">
        <a class="co-ghost-btn" routerLink="/painel/financeiro/planos">
          <co-icon name="wallet" [size]="14" />
          Planos
        </a>
        <button type="button" class="co-mini-btn co-mini-btn-primary">
          <co-icon name="download" [size]="14" />
          Exportar
        </button>
      </co-page-header>

      <div class="body">
        <div class="kpi-row">
          <co-kpi-card label="Recebido no mês" [value]="brl(recebido())" delta="4 de 6 atletas" deltaTone="green" />
          <co-kpi-card label="Em aberto" [value]="brl(emAberto())" delta="2 pendências" deltaTone="orange" />
          <co-kpi-card label="Inadimplentes" value="1" delta="Vencido há 11 dias" deltaTone="red" />
          <co-kpi-card label="Adimplência" value="67%" delta="Da equipe" deltaTone="flat" />
        </div>

        <co-panel-card pad="lg" class="summary-card">
          <div class="summary-head">
            <div>
              <div class="summary-kicker">Arrecadado no mês</div>
              <div class="summary-value">{{ brl(recebido()) }}</div>
            </div>
            <div class="summary-forecast">
              <div class="summary-total">{{ brl(recebido() + emAberto()) }}</div>
              <div class="summary-forecast-label">previsto no mês</div>
            </div>
          </div>
          <co-progress-bar [pct]="paidPct()" tone="green" [height]="8" />
          <div class="summary-foot">
            <span>4 de 6 planos pagos</span>
            <span class="pending">{{ brl(emAberto()) }} em aberto</span>
          </div>
        </co-panel-card>

        <div class="tabs-row">
          <co-tabs [tabs]="tabs" [active]="activeTab()" (change)="activeTab.set($event)" />
        </div>

        <co-panel-card [title]="activeTab() === 'Todos' ? 'Todos os planos' : activeTab()" [kicker]="filteredPayments().length + ' atletas'" class="list-card">
          @for (p of filteredPayments(); track p.athleteName; let last = $last) {
            <co-row [title]="p.athleteName" [sub]="paymentSub(p)" [last]="last">
              <co-athlete-avatar row-avatar [initials]="p.athleteInitials" [size]="34" [status]="p.athleteStatus" />
              <div row-trailing class="trailing">
                <span class="valor">{{ brl(p.valor) }}</span>
                <co-pill [tone]="STATUS_TONE[p.status]">{{ STATUS_LABEL[p.status] }}</co-pill>
                @if (p.status !== 'pago') {
                  <button type="button" class="co-mini-btn co-mini-btn-primary">Cobrar</button>
                }
              </div>
            </co-row>
          }
        </co-panel-card>
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
    .kpi-row {
      display: flex;
      gap: 16px;
    }
    .summary-card {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
    }
    .summary-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .summary-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-orange-400);
    }
    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 30px;
      color: var(--nx-text);
      letter-spacing: -0.03em;
      margin-top: 6px;
    }
    .summary-forecast {
      text-align: right;
    }
    .summary-total {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text-mute);
    }
    .summary-forecast-label {
      font-family: var(--nx-font-ui);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-top: 1px;
    }
    .summary-foot {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-mute);
    }
    .summary-foot .pending {
      color: var(--nx-pending);
    }
    .tabs-row {
      display: flex;
    }
    .list-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .trailing {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .valor {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
  `,
})
export class PanelPagamentosComponent {
  protected readonly tabs = ['Todos', 'Pendentes', 'Pagos'];
  protected readonly activeTab = signal('Todos');
  protected readonly STATUS_TONE = STATUS_TONE;
  protected readonly STATUS_LABEL = STATUS_LABEL;

  protected readonly filteredPayments = computed(() => {
    const tab = this.activeTab();
    if (tab === 'Pendentes') {
      return PAYMENTS.filter((p) => p.status !== 'pago');
    }
    if (tab === 'Pagos') {
      return PAYMENTS.filter((p) => p.status === 'pago');
    }
    return PAYMENTS;
  });

  protected readonly recebido = computed(() =>
    PAYMENTS.filter((p) => p.status === 'pago').reduce((sum, p) => sum + p.valor, 0),
  );

  protected readonly emAberto = computed(() =>
    PAYMENTS.filter((p) => p.status !== 'pago').reduce((sum, p) => sum + p.valor, 0),
  );

  protected readonly paidPct = computed(() =>
    Math.round((this.recebido() / (this.recebido() + this.emAberto())) * 100),
  );

  protected brl(value: number): string {
    return brl(value);
  }

  protected paymentSub(p: Payment): string {
    return p.status === 'pago'
      ? `${p.plano} · ${p.metodo} · recebido em ${p.dataPagamento}`
      : `${p.plano} · vence em ${p.vencimento}`;
  }
}
```

- [ ] **Step 5: Create `PanelPlanosComponent`**

Create `frontend/projects/coach/src/app/painel/financeiro/panel-planos.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

interface PlanDef {
  id: string;
  nome: string;
  valor: number;
  ciclo: string;
  ativos: number;
  tone: PillTone;
  descricao: string;
}

export const PLAN_DEFS: PlanDef[] = [
  { id: 'mensal', nome: 'Mensal', valor: 180, ciclo: 'Mensal', ativos: 14, tone: 'orange', descricao: 'Acesso a treinos regulares e avaliações mensais.' },
  { id: 'trimestral', nome: 'Trimestral', valor: 480, ciclo: 'A cada 3 meses', ativos: 6, tone: 'green', descricao: 'Mesmo acesso do Mensal, com desconto de 11% no ciclo.' },
  { id: 'anual', nome: 'Anual', valor: 1600, ciclo: 'Anual', ativos: 3, tone: 'dim', descricao: 'Inclui inscrição gratuita em 2 torneios por ano.' },
  { id: 'avulso', nome: 'Avulso', valor: 30, ciclo: 'Por treino', ativos: 1, tone: 'yellow', descricao: 'Cobrança por treino avulso, sem vínculo mensal.' },
];

function brl(value: number): string {
  return 'R$ ' + value.toLocaleString('pt-BR');
}

/** Planos — listagem (protótipo TrPlanosScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-planos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, KpiCardComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Planos" subtitle="Planos de mensalidade da equipe · 4 ativos">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/financeiro/planos/novo">
          <co-icon name="plus" [size]="14" />
          Novo plano
        </a>
      </co-page-header>

      <div class="body">
        <div class="kpi-row">
          <co-kpi-card label="Planos ativos" value="4" delta="1 avulso, 3 recorrentes" />
          <co-kpi-card label="Atletas cobertos" value="24" delta="100% da equipe" deltaTone="green" />
          <co-kpi-card label="Receita recorrente" [value]="brl(180 * 14 + 160 * 6 + 133 * 3)" delta="Estimativa mensal" deltaTone="flat" />
        </div>
        <div class="grid">
          @for (p of plans; track p.id) {
            <co-panel-card pad="lg" class="plan-card">
              <div class="plan-head">
                <div class="plan-name">{{ p.nome }}</div>
                <co-pill [tone]="p.tone">{{ p.ativos }} atletas</co-pill>
              </div>
              <div class="plan-price">
                <span class="plan-value">{{ brl(p.valor) }}</span>
                <span class="plan-cycle">/ {{ p.ciclo.toLowerCase() }}</span>
              </div>
              <p class="plan-desc">{{ p.descricao }}</p>
            </co-panel-card>
          }
        </div>
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
    }
    .kpi-row {
      display: flex;
      gap: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }
    .plan-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .plan-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .plan-price {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 4px;
    }
    .plan-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      color: var(--nx-orange-500);
      letter-spacing: -0.02em;
    }
    .plan-cycle {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .plan-desc {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      line-height: 1.4;
      margin: 0;
    }
  `,
})
export class PanelPlanosComponent {
  protected readonly plans = PLAN_DEFS;

  protected brl(value: number): string {
    return brl(value);
  }
}
```

- [ ] **Step 6: Create `PanelNovoPlanoComponent`**

Create `frontend/projects/coach/src/app/painel/financeiro/panel-novo-plano.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormSelectComponent } from '../ui/form-select.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';
import { PLAN_DEFS } from './panel-planos.component';

function brl(value: number): string {
  return 'R$ ' + value.toLocaleString('pt-BR');
}

/** Novo plano (protótipo TrNovoPlanoScreen) — tela mock: formulário interativo,
 *  mas "Criar plano" não persiste nada, só navega de volta pra Planos.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-novo-plano',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormFieldComponent,
    FormSelectComponent,
    FormTextareaComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    PillComponent,
    RowComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Novo plano" subtitle="Criar plano de mensalidade">
        <button type="button" class="co-mini-btn co-mini-btn-primary" (click)="submit()">Criar plano</button>
      </co-page-header>

      <div class="body">
        <co-panel-card title="Dados do plano" kicker="Nome e valor">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Nome do plano" placeholder="Ex: Semestral" formControlName="nome" />
            <co-form-field label="Valor" placeholder="R$ 0,00" formControlName="valor" />
            <co-form-select label="Ciclo de cobrança" [options]="ciclos" formControlName="ciclo" />
            <co-form-select label="Cobrança automática" [options]="cobrancaAutomatica" formControlName="automatica" />
            <co-form-textarea label="Descrição" formControlName="descricao" />
          </form>
        </co-panel-card>

        <co-panel-card title="Pré-visualização" kicker="Como o atleta vê">
          <div class="preview-card">
            <div class="preview-head">
              <div class="preview-name">Semestral</div>
              <co-pill tone="orange">0 atletas</co-pill>
            </div>
            <div class="preview-price">
              <span class="preview-value">{{ brl(900) }}</span>
              <span class="preview-cycle">/ semestral</span>
            </div>
            <p class="preview-desc">Treinos regulares, avaliações técnicas e acesso à biblioteca.</p>
          </div>
        </co-panel-card>

        <co-panel-card title="Planos existentes" kicker="Para referência">
          @for (p of existingPlans; track p.id; let last = $last) {
            <co-row [title]="p.nome" [sub]="brl(p.valor) + ' / ' + p.ciclo.toLowerCase()" [last]="last">
              <co-pill row-trailing tone="dim">{{ p.ativos }}</co-pill>
            </co-row>
          }
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
    }
    .body > co-panel-card:first-child {
      grid-column: 1;
      grid-row: 1 / 3;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .preview-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .preview-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .preview-price {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 4px;
    }
    .preview-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      color: var(--nx-orange-500);
      letter-spacing: -0.02em;
    }
    .preview-cycle {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .preview-desc {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      line-height: 1.4;
      margin: 0;
    }
  `,
})
export class PanelNovoPlanoComponent {
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly existingPlans = PLAN_DEFS;
  protected readonly ciclos = ['Mensal', 'Trimestral', 'Semestral', 'Anual', 'Por treino'];
  protected readonly cobrancaAutomatica = ['Ativada', 'Desativada'];

  protected readonly form = this.fb.group({
    nome: '',
    valor: '',
    ciclo: 'Mensal',
    automatica: 'Ativada',
    descricao: 'O que este plano inclui — visível para os atletas na confirmação.',
  });

  protected brl(value: number): string {
    return brl(value);
  }

  protected submit(): void {
    void this.router.navigateByUrl('/painel/financeiro/planos');
  }
}
```

Note: the plan grid layout above (`.body > co-panel-card:first-child` spanning 2 rows) is a simplification of the prototype's 2-column layout (which also had an "O que está incluso"/"Aplicar a" chip section) — those two extra sections are dropped from this mock for speed since they'd need additional static chip-list markup with no real behavior; the 3 sections kept (dados do plano, pré-visualização, planos existentes) are the core of the screen.

- [ ] **Step 7: Build check + full test suite**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors.

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: PASS, same count as after Task 1.

- [ ] **Step 8: Manual browser walkthrough**

Run `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng serve coach`. Expected:
- Sidebar shows "Financeiro" (wallet icon) after "Permissões".
- `/painel/financeiro`: 4 KPI cards, an orange "Arrecadado no mês" summary card with a progress bar, a Todos/Pendentes/Pagos tab switcher, and a list of 6 payment rows (switching tabs filters the list; "Cobrar" buttons appear only on non-paid rows and are visually present but inert).
- `/painel/financeiro/planos`: 3 KPI cards + 4 plan cards (Mensal/Trimestral/Anual/Avulso) in a row.
- `/painel/financeiro/planos/novo`: a form (nome/valor/ciclo/automática/descrição) on the left, a live preview card + existing-plans list on the right; "Criar plano" navigates back to `/painel/financeiro/planos`.

- [ ] **Step 9: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/financeiro/ frontend/projects/coach/src/app/painel/ui/icon.component.ts frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add Financeiro — Pagamentos, Planos, Novo plano (mock)

New sidebar nav item + wallet icon. Static UI matching the prototype
— hardcoded example data, no Firestore, no persistence. Criar plano
navigates back without saving."
```

---

### Task 3: Comunicação

**Files:**
- Create: `frontend/projects/coach/src/app/painel/comunicacao/panel-comunicacao.component.ts`
- Modify: `frontend/projects/coach/src/app/painel/ui/icon.component.ts`
- Modify: `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Produces: new `'chat'` case on `PanelIconName`; new `NAV_ITEMS` entry `{ id: 'comunicacao', label: 'Comunicação', icon: 'chat', route: '/painel/comunicacao' }`, inserted right after `'financeiro'`; route `painel/comunicacao` → `PanelComunicacaoComponent`.

- [ ] **Step 1: Add the `chat` icon**

In `frontend/projects/coach/src/app/painel/ui/icon.component.ts`, add `| 'chat'` to the end of the `PanelIconName` union, and add this `@case` right after the `@case ('wallet')` block:

```html
        @case ('chat') {
          <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
        }
```

- [ ] **Step 2: Add the "Comunicação" nav item**

In `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`, change `NAV_ITEMS`'s last line from:

```ts
  { id: 'financeiro', label: 'Financeiro', icon: 'wallet', route: '/painel/financeiro' },
];
```

To:

```ts
  { id: 'financeiro', label: 'Financeiro', icon: 'wallet', route: '/painel/financeiro' },
  { id: 'comunicacao', label: 'Comunicação', icon: 'chat', route: '/painel/comunicacao' },
];
```

- [ ] **Step 3: Add the route**

In `frontend/projects/coach/src/app/app.routes.ts`, add this route immediately after the `painel/financeiro/planos/novo` route:

```ts
  {
    path: 'painel/comunicacao',
    title: 'Comunicação — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/comunicacao/panel-comunicacao.component').then((m) => m.PanelComunicacaoComponent),
  },
```

- [ ] **Step 4: Create `PanelComunicacaoComponent`**

Create `frontend/projects/coach/src/app/painel/comunicacao/panel-comunicacao.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';

interface ChatMessage {
  me: boolean;
  name: string;
  text: string;
  time: string;
}

const MESSAGES: ChatMessage[] = [
  { me: false, name: 'Carla Mendes', text: 'Pessoal, treino de sexta muda para quadra 2.', time: '09:02' },
  { me: true, name: 'Você', text: 'Beleza, chego 15 antes pra ajudar a montar.', time: '09:05' },
  { me: false, name: 'Lucas Ramos', text: 'Vou passar no fisio amanhã, te aviso como fico pro treino.', time: '09:11' },
  { me: false, name: 'Ana Beatriz', text: 'Ok, confirmado! 📎 video-recepcao.mp4', time: '09:14' },
];

/** Comunicação (protótipo TrComunicacaoScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-comunicacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AthleteAvatarComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Comunicação" subtitle="Chat da equipe Adulto Masculino" />

      <div class="body">
        <co-panel-card pad="sm" title="Conversas" class="conversations-card">
          <co-row title="Equipe Adulto Masculino" sub="24 membros">
            <div row-avatar class="team-avatar">TE</div>
            <co-pill row-trailing tone="orange">3</co-pill>
          </co-row>
          <co-row title="Ana Beatriz" sub="Ok, confirmado!">
            <co-athlete-avatar row-avatar initials="AB" [size]="32" status="ativo" />
          </co-row>
          <co-row title="Lucas Ramos" sub="Vou passar no fisio amanhã" [last]="true">
            <co-athlete-avatar row-avatar initials="LR" [size]="32" status="lesionado" />
          </co-row>
        </co-panel-card>

        <div class="chat-column">
          <co-panel-card title="Aviso fixado" kicker="No topo do chat" class="pinned-card">
            📌 Levar atestado médico atualizado até sexta-feira.
          </co-panel-card>
          <co-panel-card class="messages-card">
            @for (m of messages; track m.time) {
              <div class="bubble-wrap" [class.me]="m.me">
                @if (!m.me) {
                  <div class="bubble-name">{{ m.name }}</div>
                }
                <div class="bubble" [class.me]="m.me">{{ m.text }}</div>
                <div class="bubble-time">{{ m.time }}</div>
              </div>
            }
          </co-panel-card>
        </div>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 20px 32px 28px;
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 16px;
      min-height: 0;
      overflow: hidden;
    }
    .conversations-card {
      min-height: 0;
      overflow: hidden;
    }
    .team-avatar {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 11px;
    }
    .chat-column {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
    }
    .pinned-card {
      flex: none;
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .messages-card {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
    .bubble-wrap {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .bubble-wrap.me {
      align-items: flex-end;
    }
    .bubble-name {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      margin-bottom: 3px;
    }
    .bubble {
      max-width: 320px;
      padding: 9px 13px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.4;
    }
    .bubble.me {
      background: var(--nx-orange-500);
      border: none;
      color: var(--nx-text-on-orange);
    }
    .bubble-time {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }
  `,
})
export class PanelComunicacaoComponent {
  protected readonly messages = MESSAGES;
}
```

- [ ] **Step 5: Build check**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors.

- [ ] **Step 6: Manual browser walkthrough**

Run `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng serve coach`. Expected: sidebar shows "Comunicação" (chat icon); `/painel/comunicacao` shows a 3-item conversation list on the left, a pinned-notice card + 4 chat bubbles (alternating left/right) on the right.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/comunicacao/ frontend/projects/coach/src/app/painel/ui/icon.component.ts frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add Comunicação screen (mock)

New sidebar nav item + chat icon. Static chat mock, no Firestore,
no persistence."
```

---

### Task 4: Biblioteca

**Files:**
- Create: `frontend/projects/coach/src/app/painel/biblioteca/panel-biblioteca.component.ts`
- Modify: `frontend/projects/coach/src/app/painel/ui/icon.component.ts`
- Modify: `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Produces: new `'folder'` case on `PanelIconName`; new `NAV_ITEMS` entry `{ id: 'biblioteca', label: 'Biblioteca', icon: 'folder', route: '/painel/biblioteca' }`, inserted right after `'comunicacao'`; route `painel/biblioteca` → `PanelBibliotecaComponent`.

- [ ] **Step 1: Add the `folder` icon**

In `frontend/projects/coach/src/app/painel/ui/icon.component.ts`, add `| 'folder'` to the end of the `PanelIconName` union, and add this `@case` right after the `@case ('chat')` block:

```html
        @case ('folder') {
          <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z" />
        }
```

- [ ] **Step 2: Add the "Biblioteca" nav item**

In `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`, change `NAV_ITEMS`'s last line from:

```ts
  { id: 'comunicacao', label: 'Comunicação', icon: 'chat', route: '/painel/comunicacao' },
];
```

To:

```ts
  { id: 'comunicacao', label: 'Comunicação', icon: 'chat', route: '/painel/comunicacao' },
  { id: 'biblioteca', label: 'Biblioteca', icon: 'folder', route: '/painel/biblioteca' },
];
```

- [ ] **Step 3: Add the route**

In `frontend/projects/coach/src/app/app.routes.ts`, add this route immediately after the `painel/comunicacao` route:

```ts
  {
    path: 'painel/biblioteca',
    title: 'Biblioteca — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/biblioteca/panel-biblioteca.component').then((m) => m.PanelBibliotecaComponent),
  },
```

- [ ] **Step 4: Create `PanelBibliotecaComponent`**

Create `frontend/projects/coach/src/app/painel/biblioteca/panel-biblioteca.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent, type PanelIconName } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';

interface LibraryFolder {
  icon: PanelIconName;
  label: string;
  count: number;
}

const FOLDERS: LibraryFolder[] = [
  { icon: 'chat', label: 'Vídeos', count: 38 },
  { icon: 'clipboard', label: 'Exercícios', count: 54 },
  { icon: 'folder', label: 'PDFs', count: 21 },
  { icon: 'clipboard', label: 'Treinos', count: 42 },
  { icon: 'folder', label: 'Planilhas', count: 12 },
  { icon: 'chat', label: 'Links', count: 9 },
];

/** Biblioteca (protótipo TrBibliotecaScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-biblioteca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Biblioteca" subtitle="Materiais da equipe">
        <button type="button" class="co-mini-btn co-mini-btn-primary">
          <co-icon name="plus" [size]="14" />
          Enviar arquivo
        </button>
      </co-page-header>

      <div class="body">
        <div class="grid">
          @for (f of folders; track f.label) {
            <co-panel-card pad="lg" class="folder-card">
              <div class="folder-icon">
                <co-icon [name]="f.icon" [size]="22" />
              </div>
              <div class="folder-label">{{ f.label }}</div>
              <div class="folder-count">{{ f.count }} itens</div>
            </co-panel-card>
          }
        </div>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 14px;
    }
    .folder-card {
      align-items: center;
      text-align: center;
      gap: 10px;
    }
    .folder-icon {
      width: 46px;
      height: 46px;
      border-radius: 13px;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
      margin: 0 auto;
    }
    .folder-label {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      margin-top: 10px;
    }
    .folder-count {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
  `,
})
export class PanelBibliotecaComponent {
  protected readonly folders = FOLDERS;
}
```

- [ ] **Step 5: Build check + full test suite**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors.

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: PASS, same count as after Task 1.

- [ ] **Step 6: Manual browser walkthrough**

Run `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng serve coach`. Expected: sidebar shows "Biblioteca" (folder icon); `/painel/biblioteca` shows a 6-column grid of folder tiles (Vídeos/Exercícios/PDFs/Treinos/Planilhas/Links) each with an icon, label, and item count. "Enviar arquivo" button is visually present but inert.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/biblioteca/ frontend/projects/coach/src/app/painel/ui/icon.component.ts frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add Biblioteca screen (mock)

New sidebar nav item + folder icon. Static folder-grid mock, no
Firestore, no persistence."
```

---

### Task 5: IA do treinador (hub)

**Files:**
- Create: `frontend/projects/coach/src/app/painel/ia/panel-ia.component.ts`
- Modify: `frontend/projects/coach/src/app/painel/ui/icon.component.ts`
- Modify: `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Produces: new `'sparkle'` case on `PanelIconName`; new `NAV_ITEMS` entry `{ id: 'ia', label: 'IA do treinador', icon: 'sparkle', route: '/painel/ia' }`, inserted right after `'biblioteca'`; route `painel/ia` → `PanelIaComponent`. This screen adds a "Diferenciais do ecossistema" section (not in the prototype's own `TrIaScreen` — a deliberate deviation per the spec's decision to centralize the 5 diferencial screens' entry points here) linking to the 5 routes Task 6 will register (`painel/ia/evolucao-rating`, `painel/ia/recomendacao-categoria`, `painel/ia/descoberta-talentos`, `painel/ia/gestao-metas`, `painel/ia/analise-pos-torneio`) — Task 6 depends on these links existing, but this task must land first since Task 6's routes don't exist yet. The links render regardless (Angular routing resolves lazily, so a link to a not-yet-existing route only breaks if clicked before Task 6 lands — acceptable since these two tasks execute back-to-back in the same session).

- [ ] **Step 1: Add the `sparkle` icon**

In `frontend/projects/coach/src/app/painel/ui/icon.component.ts`, add `| 'sparkle'` to the end of the `PanelIconName` union, and add this `@case` right after the `@case ('folder')` block:

```html
        @case ('sparkle') {
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
        }
```

- [ ] **Step 2: Add the "IA do treinador" nav item**

In `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`, change `NAV_ITEMS`'s last line from:

```ts
  { id: 'biblioteca', label: 'Biblioteca', icon: 'folder', route: '/painel/biblioteca' },
];
```

To:

```ts
  { id: 'biblioteca', label: 'Biblioteca', icon: 'folder', route: '/painel/biblioteca' },
  { id: 'ia', label: 'IA do treinador', icon: 'sparkle', route: '/painel/ia' },
];
```

- [ ] **Step 3: Add the route**

In `frontend/projects/coach/src/app/app.routes.ts`, add this route immediately after the `painel/biblioteca` route:

```ts
  {
    path: 'painel/ia',
    title: 'IA do treinador — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () => import('./painel/ia/panel-ia.component').then((m) => m.PanelIaComponent),
  },
```

- [ ] **Step 4: Create `PanelIaComponent`**

Create `frontend/projects/coach/src/app/painel/ia/panel-ia.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';

const FAQ_PROMPTS = [
  'Quais atletas mais evoluíram este mês?',
  'Quem está faltando muito?',
  'Quem deveria subir de categoria?',
  'Quem pode jogar Open?',
  'Sugira duplas para o próximo torneio.',
  'Monte um treino focado em recepção.',
];

interface DifferentialLink {
  title: string;
  description: string;
  route: string;
}

const DIFFERENTIALS: DifferentialLink[] = [
  { title: 'Evolução do rating', description: 'Linha do tempo completa de um atleta', route: '/painel/ia/evolucao-rating' },
  { title: 'Recomendação de categoria', description: 'Análise automática de promoção', route: '/painel/ia/recomendacao-categoria' },
  { title: 'Descoberta de talentos', description: 'Atletas promissores da região', route: '/painel/ia/descoberta-talentos' },
  { title: 'Gestão de metas', description: 'Metas individuais e coletivas', route: '/painel/ia/gestao-metas' },
  { title: 'Análise pós-torneio', description: 'Relatório automático após cada torneio', route: '/painel/ia/analise-pos-torneio' },
];

/** IA do treinador (protótipo TrIaScreen) — tela mock, sem Firestore. Ganha uma seção
 *  "Diferenciais do ecossistema" que não existe no protótipo original, centralizando
 *  o acesso às 5 telas de diferencial em vez de espalhar botões por Atletas/Torneios.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-ia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AthleteAvatarComponent, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="IA do treinador" subtitle="Assistente de decisões da comissão técnica" />

      <div class="body">
        <div class="grid">
          <co-panel-card title="Perguntas frequentes" kicker="Toque para perguntar">
            @for (p of faqPrompts; track p) {
              <div class="prompt">{{ p }}</div>
            }
          </co-panel-card>

          <div class="answer-column">
            <co-panel-card class="question-card">
              <div class="question-row">
                <co-icon name="sparkle" [size]="18" style="color: var(--nx-orange-500)" />
                <div class="question-text">"Quem deveria subir de categoria?"</div>
              </div>
            </co-panel-card>

            <co-panel-card title="Resposta da IA" kicker="Baseado em rating, evolução e resultados">
              <co-row title="Ana Beatriz" sub="Dominante na categoria Intermediário há 3 torneios">
                <co-athlete-avatar row-avatar initials="AB" [size]="34" status="ativo" />
                <co-pill row-trailing tone="green">Subir para Open</co-pill>
              </co-row>
              <co-row title="Lucas Ramos" sub="Rating estável, aguardar retorno da lesão" [last]="true">
                <co-athlete-avatar row-avatar initials="LR" [size]="34" status="lesionado" />
                <co-pill row-trailing tone="dim">Manter</co-pill>
              </co-row>
            </co-panel-card>
          </div>
        </div>

        <co-panel-card title="Diferenciais do ecossistema" kicker="Inteligência NexaGO">
          <div class="diff-grid">
            @for (d of differentials; track d.route) {
              <a class="diff-card" [routerLink]="d.route">
                <div class="diff-title">{{ d.title }}</div>
                <div class="diff-desc">{{ d.description }}</div>
              </a>
            }
          </div>
        </co-panel-card>
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
    .grid {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 16px;
    }
    .prompt {
      padding: 9px 13px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-mute);
      margin-bottom: 8px;
    }
    .prompt:last-child {
      margin-bottom: 0;
    }
    .answer-column {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .question-card {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
    }
    .question-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .question-text {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .diff-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
    }
    .diff-card {
      display: block;
      padding: 14px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      text-decoration: none;
      cursor: pointer;
    }
    .diff-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
      margin-bottom: 5px;
    }
    .diff-desc {
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-mute);
      line-height: 1.4;
    }
  `,
})
export class PanelIaComponent {
  protected readonly faqPrompts = FAQ_PROMPTS;
  protected readonly differentials = DIFFERENTIALS;
}
```

- [ ] **Step 5: Build check**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors (the 5 `routerLink`s to not-yet-existing routes do not fail the build — Angular route matching is runtime, not compile-time).

- [ ] **Step 6: Manual browser walkthrough**

Run `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng serve coach`. Expected: sidebar shows "IA do treinador" (sparkle icon) as the last item; `/painel/ia` shows 6 static FAQ prompts on the left, a highlighted question + 2-row AI answer demo on the right, and a 5-card "Diferenciais do ecossistema" row at the bottom. Clicking those 5 cards will 404/redirect-to-`/painel` until Task 6 lands — expected at this point, not a bug to fix now (same pattern as prior rounds' mid-plan dead links).

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/ia/panel-ia.component.ts frontend/projects/coach/src/app/painel/ui/icon.component.ts frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add IA do treinador hub screen (mock)

New sidebar nav item + sparkle icon. Adds a Diferenciais do
ecossistema section (deviation from the prototype, documented in
the spec) linking to the 5 screens Task 6 adds next."
```

---

### Task 6: The 5 "diferencial" screens

**Files:**
- Create: `frontend/projects/coach/src/app/painel/ia/panel-evolucao-rating.component.ts`
- Create: `frontend/projects/coach/src/app/painel/ia/panel-recomendacao-categoria.component.ts`
- Create: `frontend/projects/coach/src/app/painel/ia/panel-descoberta-talentos.component.ts`
- Create: `frontend/projects/coach/src/app/painel/ia/panel-gestao-metas.component.ts`
- Create: `frontend/projects/coach/src/app/painel/ia/panel-analise-pos-torneio.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `LineChartComponent` (Task 1), `ProgressBarComponent`, `PillComponent` (all existing).
- Produces: routes `painel/ia/evolucao-rating`, `painel/ia/recomendacao-categoria`, `painel/ia/descoberta-talentos`, `painel/ia/gestao-metas`, `painel/ia/analise-pos-torneio` — these are exactly the 5 links Task 5's `PanelIaComponent` already points to.

- [ ] **Step 1: Create `PanelEvolucaoRatingComponent`**

Create `frontend/projects/coach/src/app/painel/ia/panel-evolucao-rating.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';

const RATING_SERIES = [
  { label: 'Jan', value: 1720 },
  { label: 'Fev', value: 1780 },
  { label: 'Mar', value: 1810 },
  { label: 'Abr', value: 1865 },
  { label: 'Mai', value: 1920 },
  { label: 'Jun', value: 1975 },
  { label: 'Jul', value: 2015 },
];

interface RatingChange {
  title: string;
  date: string;
  rating: string;
  positive: boolean;
}

const CHANGES: RatingChange[] = [
  { title: '+42 · Vitória na Etapa Garden', date: '10/07', rating: '2.015', positive: true },
  { title: '+55 · Promoção de categoria', date: '14/06', rating: '1.973', positive: true },
  { title: '-18 · Derrota na semifinal', date: '22/05', rating: '1.918', positive: false },
];

/** Evolução do rating (protótipo TrEvolucaoRatingScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-evolucao-rating',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LineChartComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Evolução do rating" subtitle="Ana Beatriz · Linha do tempo completa" />

      <div class="body">
        <co-panel-card title="Rating NexaGO" kicker="Últimos 7 meses">
          <co-line-chart [data]="ratingSeries" [width]="500" [height]="170" />
        </co-panel-card>
        <co-panel-card title="Motivo das mudanças">
          @for (c of changes; track c.date) {
            <co-row [title]="c.title" [sub]="c.date" [last]="$last">
              <span row-trailing class="rating" [class.negative]="!c.positive">{{ c.rating }}</span>
            </co-row>
          }
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
    }
    .rating {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      color: var(--nx-win);
    }
    .rating.negative {
      color: var(--nx-live);
    }
  `,
})
export class PanelEvolucaoRatingComponent {
  protected readonly ratingSeries = RATING_SERIES;
  protected readonly changes = CHANGES;
}
```

- [ ] **Step 2: Create `PanelRecomendacaoCategoriaComponent`**

Create `frontend/projects/coach/src/app/painel/ia/panel-recomendacao-categoria.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';

interface AnalysisCard {
  title: string;
  description: string;
  tone: 'win' | 'pending' | 'live';
}

const ANALYSIS: AnalysisCard[] = [
  { title: 'Dominante na categoria', description: '9 pódios em 14 torneios no Intermediário', tone: 'win' },
  { title: 'Recomendado subir', description: 'Rating 2.015, acima da média do Open (1.960)', tone: 'pending' },
  { title: 'Não atende ao Open ainda', description: 'Não se aplica a esta atleta — critério de referência', tone: 'live' },
];

/** Recomendação de categoria (protótipo TrRecomendacaoCategoriaScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-recomendacao-categoria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AthleteAvatarComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Recomendação de categoria" subtitle="Ana Beatriz · Análise automática" />

      <div class="body">
        <co-panel-card pad="lg" class="highlight-card">
          <div class="highlight-row">
            <co-athlete-avatar initials="AB" [size]="48" status="ativo" />
            <div class="highlight-body">
              <div class="highlight-title">Dominante na categoria Intermediário</div>
              <div class="highlight-desc">Recomendado subir para Open — critérios de rating e resultados atendidos</div>
            </div>
            <button type="button" class="co-mini-btn co-mini-btn-primary">Aprovar promoção</button>
          </div>
        </co-panel-card>

        <div class="grid">
          @for (a of analysis; track a.title) {
            <co-panel-card pad="sm">
              <div class="analysis-title" [class]="'tone-' + a.tone">{{ a.title }}</div>
              <div class="analysis-desc">{{ a.description }}</div>
            </co-panel-card>
          }
        </div>
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
    }
    .highlight-card {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
    }
    .highlight-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .highlight-body {
      flex: 1;
    }
    .highlight-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .highlight-desc {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-mute);
      margin-top: 3px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
    }
    .analysis-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 6px;
    }
    .analysis-title.tone-win { color: var(--nx-win); }
    .analysis-title.tone-pending { color: var(--nx-pending); }
    .analysis-title.tone-live { color: var(--nx-live); }
    .analysis-desc {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
    }
  `,
})
export class PanelRecomendacaoCategoriaComponent {
  protected readonly analysis = ANALYSIS;
}
```

- [ ] **Step 3: Create `PanelDescobertaTalentosComponent`**

Create `frontend/projects/coach/src/app/painel/ia/panel-descoberta-talentos.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';

interface ProspectAthlete {
  initials: string;
  name: string;
  sub: string;
}

const PROSPECTS: ProspectAthlete[] = [
  { initials: 'TC', name: 'Thiago Cardoso', sub: '19 anos · Intermediário · +180 no rating em 3 meses' },
  { initials: 'GB', name: 'Gabriela Brito', sub: '18 anos · Iniciante · +140 no rating em 3 meses' },
  { initials: 'MV', name: 'Marcelo Vaz', sub: '21 anos · Intermediário · +110 no rating em 3 meses' },
];

/** Descoberta de talentos (protótipo TrDescobertaTalentosScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-descoberta-talentos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AthleteAvatarComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Descoberta de talentos" subtitle="Atletas da região · Goiânia e entorno" />

      <div class="body">
        <co-panel-card title="Filtros" kicker="Refinar busca">
          <div class="field"><div class="f-label">Idade</div><div class="f-value">16 – 22 anos</div></div>
          <div class="field"><div class="f-label">Categoria</div><div class="f-value">Iniciante — Intermediário</div></div>
          <div class="field"><div class="f-label">Rating mínimo</div><div class="f-value">1.400</div></div>
          <div class="field"><div class="f-label">Evolução recente</div><div class="f-value">Últimos 3 meses</div></div>
        </co-panel-card>

        <co-panel-card title="Atletas promissores" kicker="Ordenado por evolução recente" class="list-card">
          @for (p of prospects; track p.initials; let last = $last) {
            <co-row [title]="p.name" [sub]="p.sub" [last]="last">
              <co-athlete-avatar row-avatar [initials]="p.initials" [size]="34" status="ativo" />
              <button row-trailing type="button" class="co-mini-btn">Convidar</button>
            </co-row>
          }
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 16px;
      min-height: 0;
      overflow: hidden;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 14px;
    }
    .field:last-child {
      margin-bottom: 0;
    }
    .f-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .f-value {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
    }
    .list-card {
      min-height: 0;
      overflow: hidden;
    }
  `,
})
export class PanelDescobertaTalentosComponent {
  protected readonly prospects = PROSPECTS;
}
```

- [ ] **Step 4: Create `PanelGestaoMetasComponent`**

Create `frontend/projects/coach/src/app/painel/ia/panel-gestao-metas.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { ProgressBarComponent } from '../ui/progress-bar.component';

interface Goal {
  title: string;
  deadline: string;
  pct: number;
  notes: string;
}

const GOALS: Goal[] = [
  { title: 'Meta coletiva — 80% de presença', deadline: '31/07/2026', pct: 86, notes: 'Equipe já superou a meta neste mês.' },
  { title: 'Meta coletiva — 5 pódios no semestre', deadline: '31/12/2026', pct: 60, notes: '3 de 5 pódios conquistados até agora.' },
  { title: 'Ana Beatriz — rating 2.100', deadline: '30/09/2026', pct: 72, notes: 'Está em 2.015, faltam 85 pontos.' },
  { title: 'João Silva — disputar 6 torneios', deadline: '31/12/2026', pct: 50, notes: '3 de 6 torneios já confirmados.' },
];

/** Gestão de metas (protótipo TrGestaoMetasScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-gestao-metas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, ProgressBarComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Gestão de metas" subtitle="Individuais e coletivas">
        <button type="button" class="co-mini-btn co-mini-btn-primary">Nova meta</button>
      </co-page-header>

      <div class="body">
        @for (goal of goals; track goal.title) {
          <co-panel-card pad="sm">
            <div class="head">
              <div class="title">{{ goal.title }}</div>
              <co-pill [tone]="goal.pct >= 80 ? 'green' : 'orange'">{{ goal.pct }}%</co-pill>
            </div>
            <co-progress-bar [pct]="goal.pct" [tone]="goal.pct >= 80 ? 'green' : 'orange'" />
            <div class="deadline">Prazo · {{ goal.deadline }}</div>
            <p class="notes">{{ goal.notes }}</p>
          </co-panel-card>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .deadline {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-top: 10px;
    }
    .notes {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      margin: 8px 0 0;
      line-height: 1.4;
    }
  `,
})
export class PanelGestaoMetasComponent {
  protected readonly goals = GOALS;
}
```

- [ ] **Step 5: Create `PanelAnalisePosTorneioComponent`**

Create `frontend/projects/coach/src/app/painel/ia/panel-analise-pos-torneio.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';

/** Análise pós-torneio (protótipo TrAnalisePosTorneioScreen) — tela mock, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-analise-pos-torneio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KpiCardComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Análise pós-torneio" subtitle="Etapa Garden · Encerrado em 10/07" />

      <div class="body">
        <div class="kpi-row">
          <co-kpi-card label="Rating da equipe" value="+62" delta="No torneio" deltaTone="green" />
          <co-kpi-card label="Vitórias" value="5" delta="de 6 jogos" deltaTone="green" />
          <co-kpi-card label="Pódios" value="2" delta="Intermediário e Open" deltaTone="flat" />
        </div>
        <div class="grid">
          <co-panel-card title="Pontos fortes" kicker="Análise automática">
            <p class="text">Recepção consistente em todos os jogos. Duplas formadas pela IA tiveram 83% de aproveitamento.</p>
          </co-panel-card>
          <co-panel-card title="Pontos fracos" kicker="Análise automática">
            <p class="text">Bloqueio abaixo da média da categoria — recomenda-se treino específico nas próximas semanas.</p>
          </co-panel-card>
          <co-panel-card title="Comparação com torneio anterior">
            <co-row title="Aproveitamento">
              <span row-trailing class="stat win">+9pp</span>
            </co-row>
            <co-row title="Rating médio ganho" [last]="true">
              <span row-trailing class="stat win">+18</span>
            </co-row>
          </co-panel-card>
          <co-panel-card title="Treino recomendado" kicker="Sugestão da IA">
            <p class="text">Bloqueio duplo e leitura de ataque adversário.</p>
            <button type="button" class="co-mini-btn co-mini-btn-primary">Criar treino</button>
          </co-panel-card>
        </div>
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
    .kpi-row {
      display: flex;
      gap: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .text {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
      line-height: 1.6;
      margin: 0 0 10px;
    }
    .stat {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      color: var(--nx-win);
    }
  `,
})
export class PanelAnalisePosTorneioComponent {}
```

- [ ] **Step 6: Add the 5 routes**

In `frontend/projects/coach/src/app/app.routes.ts`, add these 5 routes immediately after the `painel/ia` route:

```ts
  {
    path: 'painel/ia/evolucao-rating',
    title: 'Evolução do rating — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/ia/panel-evolucao-rating.component').then((m) => m.PanelEvolucaoRatingComponent),
  },
  {
    path: 'painel/ia/recomendacao-categoria',
    title: 'Recomendação de categoria — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/ia/panel-recomendacao-categoria.component').then(
        (m) => m.PanelRecomendacaoCategoriaComponent,
      ),
  },
  {
    path: 'painel/ia/descoberta-talentos',
    title: 'Descoberta de talentos — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/ia/panel-descoberta-talentos.component').then(
        (m) => m.PanelDescobertaTalentosComponent,
      ),
  },
  {
    path: 'painel/ia/gestao-metas',
    title: 'Gestão de metas — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/ia/panel-gestao-metas.component').then((m) => m.PanelGestaoMetasComponent),
  },
  {
    path: 'painel/ia/analise-pos-torneio',
    title: 'Análise pós-torneio — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/ia/panel-analise-pos-torneio.component').then(
        (m) => m.PanelAnalisePosTorneioComponent,
      ),
  },
```

- [ ] **Step 7: Build check + full test suite**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors.

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: PASS, same count as after Task 1 (21/21).

- [ ] **Step 8: Manual browser walkthrough**

Run `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng serve coach`. From `/painel/ia`, click each of the 5 "Diferenciais" cards and confirm each now resolves (no more 404/redirect):
- Evolução do rating: line chart (7-point rating trend) + 3-row change list.
- Recomendação de categoria: highlighted promotion banner + 3 analysis cards.
- Descoberta de talentos: filters panel + 3-row prospect list with inert "Convidar" buttons.
- Gestão de metas: 4 goal cards (2×2 grid) with progress bars; inert "Nova meta" button.
- Análise pós-torneio: 3 KPI cards + 4 analysis cards; inert "Criar treino" button.

- [ ] **Step 9: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/ia/panel-evolucao-rating.component.ts frontend/projects/coach/src/app/painel/ia/panel-recomendacao-categoria.component.ts frontend/projects/coach/src/app/painel/ia/panel-descoberta-talentos.component.ts frontend/projects/coach/src/app/painel/ia/panel-gestao-metas.component.ts frontend/projects/coach/src/app/painel/ia/panel-analise-pos-torneio.component.ts frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add the 5 Inteligência NexaGO diferencial screens (mock)

Evolução do rating, Recomendação de categoria, Descoberta de
talentos, Gestão de metas, Análise pós-torneio — all reached from
the IA hub added in Task 5. Completes the full 39-screen prototype.
Static UI, no Firestore, no persistence."
```

---

## Self-Review Notes

- **Spec coverage:** all 14 screens across 6 tasks; 5 new nav items + 4 new icons (`wallet`, `chat`, `folder`, `sparkle`; `gear` reused); 2 header-button entries (Torneios→Estatísticas, Histórico→Relatórios); the IA hub's diferenciais-as-cards deviation is documented in both the spec and Task 5's own note; the new `LineChartComponent` primitive (Task 1) is reused by Task 6 — every spec decision has a task.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `LineChartPoint`/`lineChartPoints`/`pointsToPolylineAttr` signatures in Task 1 match their consumers in Task 1 itself (`PanelEstatisticasComponent`) and Task 6 (`PanelEvolucaoRatingComponent`) — both pass `{ label, value }[]` to `co-line-chart`. `PillTone`/`ProgressTone` imports match their real definitions (already verified in prior rounds' reviews, unchanged here). `PanelIconName`'s 4 new members (`wallet`, `chat`, `folder`, `sparkle`) are each added in the task that first needs them and consumed by that same task's `NAV_ITEMS` entry — no forward references to icons that don't exist yet at commit time. Route paths referenced by every `routerLink`/card link across all 6 tasks match the paths registered in `app.routes.ts` in the task that owns them.
- **Cross-task dependency called out:** Task 5's hub links to Task 6's 5 routes before they exist — flagged explicitly in Task 5's Interfaces section and its walkthrough step, matching the established precedent from the original MVP plan (dead links are expected mid-plan, not bugs).

