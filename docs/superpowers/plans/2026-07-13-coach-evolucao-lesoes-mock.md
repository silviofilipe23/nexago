# Plano de Evolução & Lesões (mock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 purely visual screens to the coach portal (`frontend/projects/coach`) — Plano de evolução, Novo objetivo, Lesões, Registro de lesão — matching the Claude Design prototype's mockups exactly, with hardcoded example data and no Firestore reads/writes at all.

**Architecture:** 4 new standalone Angular components, each self-contained with a module-level constant for its example data — no service, no Firestore, no Cloud Function. Two new routes are reached from existing screens (a new header button on Atletas, a new sidebar nav item for Lesões); the other two ("novo") routes are reached from their listing screen's header button and their "save" buttons just `router.navigateByUrl` back to the listing — no persistence.

**Tech Stack:** Angular (standalone components, signals, `OnPush`, Reactive Forms for the two form screens), TypeScript.

## Global Constraints

- Standalone components; do not set `standalone: true` explicitly (it's the default).
- `changeDetection: ChangeDetectionStrategy.OnPush` on every component.
- Portuguese for all UI copy; English for code identifiers.
- **No Firestore, no service files, no persistence of any kind in this plan.** Every screen's data is a hardcoded module-level constant. "Save" buttons (`Criar objetivo`, `Salvar registro`) only navigate back to their listing screen — they must not call any service or write anywhere.
- Reuse existing UI primitives only (`co-page-header`, `co-panel-card`, `co-pill`, `co-progress-bar`, `co-row`, `co-athlete-avatar`, `co-form-field`, `co-form-select`, `co-form-textarea`, `co-icon`) — no new primitives except the one icon addition in Task 2.
- Verification for every task: `ng build coach` (this project has no Angular component test harness — see prior rounds) + a manual browser walkthrough describing what renders.
- Build command: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`.

---

### Task 1: Plano de evolução + Novo objetivo

**Files:**
- Create: `frontend/projects/coach/src/app/painel/evolucao/panel-plano-evolucao.component.ts`
- Create: `frontend/projects/coach/src/app/painel/evolucao/panel-novo-objetivo.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`
- Modify: `frontend/projects/coach/src/app/painel/atletas/panel-atletas.component.ts`

**Interfaces:**
- Consumes: `PageHeaderComponent`, `PanelCardComponent`, `PanelShellComponent`, `PillComponent`, `ProgressBarComponent`, `IconComponent`, `FormFieldComponent`, `FormSelectComponent`, `FormTextareaComponent`, `RowComponent` (all already exist, unchanged).
- Produces: routes `painel/atletas/plano-evolucao` → `PanelPlanoEvolucaoComponent`, `painel/atletas/plano-evolucao/novo` → `PanelNovoObjetivoComponent`; a "Plano de evolução" button in the Atletas screen header.

- [ ] **Step 1: Add the two routes**

In `frontend/projects/coach/src/app/app.routes.ts`, add these two routes immediately after the `painel/atletas/comparar` route (the block that currently ends right before `convite-atleta/:id`):

```ts
  {
    path: 'painel/atletas/plano-evolucao',
    title: 'Plano de evolução — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/evolucao/panel-plano-evolucao.component').then(
        (m) => m.PanelPlanoEvolucaoComponent,
      ),
  },
  {
    path: 'painel/atletas/plano-evolucao/novo',
    title: 'Novo objetivo — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/evolucao/panel-novo-objetivo.component').then(
        (m) => m.PanelNovoObjetivoComponent,
      ),
  },
```

- [ ] **Step 2: Create `PanelPlanoEvolucaoComponent`**

Create `frontend/projects/coach/src/app/painel/evolucao/panel-plano-evolucao.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
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
  { title: 'Melhorar saque', deadline: '15/08/2026', pct: 65, notes: 'Evoluiu de 6.0 para 7.0 nas últimas duas avaliações.' },
  { title: 'Aumentar impulsão', deadline: '01/09/2026', pct: 40, notes: 'Programa de força iniciado com a preparadora física.' },
  { title: 'Melhorar recepção', deadline: '30/07/2026', pct: 90, notes: 'Já é o fundamento mais forte da atleta — quase concluído.' },
];

/** Plano de evolução (protótipo TrPlanoEvolucaoScreen) — tela mock: dado de exemplo fixo,
 *  sem Firestore. Ver docs/superpowers/specs/2026-07-13-coach-evolucao-lesoes-mock-design.md. */
@Component({
  selector: 'co-panel-plano-evolucao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, ProgressBarComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Plano de evolução" subtitle="Ana Beatriz · 3 objetivos ativos">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/atletas/plano-evolucao/novo">
          <co-icon name="plus" [size]="14" />
          Novo objetivo
        </a>
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
      grid-template-columns: repeat(3, 1fr);
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
export class PanelPlanoEvolucaoComponent {
  protected readonly goals = GOALS;
}
```

- [ ] **Step 3: Create `PanelNovoObjetivoComponent`**

Create `frontend/projects/coach/src/app/painel/evolucao/panel-novo-objetivo.component.ts`:

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

/** Novo objetivo (protótipo TrNovoObjetivoScreen) — tela mock: o formulário é interativo
 *  (reactive forms), mas "Criar objetivo" não persiste nada, só navega de volta pro
 *  Plano de evolução. Ver docs/superpowers/specs/2026-07-13-coach-evolucao-lesoes-mock-design.md. */
@Component({
  selector: 'co-panel-novo-objetivo',
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
      <co-page-header title="Novo objetivo" subtitle="Ana Beatriz · Plano de evolução">
        <button type="button" class="co-mini-btn co-mini-btn-primary" (click)="submit()">Criar objetivo</button>
      </co-page-header>

      <div class="body">
        <co-panel-card title="Detalhes do objetivo" kicker="Meta individual">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Título do objetivo" placeholder="Ex: Melhorar saque" [wide]="true" formControlName="title" />
            <co-form-select label="Fundamento relacionado" [options]="fundamentos" formControlName="fundamento" />
            <co-form-field label="Prazo" placeholder="Selecionar data" formControlName="prazo" />
            <co-form-textarea label="Observações" formControlName="observacoes" />
          </form>
        </co-panel-card>

        <co-panel-card title="Objetivos ativos" kicker="Ana Beatriz">
          <co-row title="Aumentar impulsão" sub="Prazo 01/09/2026">
            <co-pill row-trailing tone="orange">40%</co-pill>
          </co-row>
          <co-row title="Melhorar recepção" sub="Prazo 30/07/2026" [last]="true">
            <co-pill row-trailing tone="green">90%</co-pill>
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
      grid-template-columns: 1fr 340px;
      gap: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
  `,
})
export class PanelNovoObjetivoComponent {
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly fundamentos = ['Saque', 'Recepção', 'Ataque', 'Bloqueio', 'Físico'];

  protected readonly form = this.fb.group({
    title: '',
    fundamento: 'Saque',
    prazo: '',
    observacoes: 'Foco em consistência no saque flutuante — meta acordada após avaliação técnica.',
  });

  protected submit(): void {
    void this.router.navigateByUrl('/painel/atletas/plano-evolucao');
  }
}
```

- [ ] **Step 4: Add the entry button to the Atletas screen header**

In `frontend/projects/coach/src/app/painel/atletas/panel-atletas.component.ts`, change:

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

To:

```html
      <co-page-header title="Gestão de atletas" [subtitle]="subtitle()">
        <a class="co-ghost-btn" routerLink="/painel/atletas/comparar">
          <co-icon name="radar" [size]="14" />
          Comparar atletas
        </a>
        <a class="co-ghost-btn" routerLink="/painel/atletas/plano-evolucao">
          <co-icon name="clipboard" [size]="14" />
          Plano de evolução
        </a>
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/atletas/novo">
          <co-icon name="plus" [size]="14" />
          Convidar atleta
        </a>
      </co-page-header>
```

No other changes to this file.

- [ ] **Step 5: Build check**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors.

- [ ] **Step 6: Manual browser walkthrough**

Run `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng serve coach`, log in as a coach. Expected:
- On `/painel/atletas`, a "Plano de evolução" ghost button now sits between "Comparar atletas" and "Convidar atleta" in the header.
- Clicking it navigates to `/painel/atletas/plano-evolucao`: header shows "Ana Beatriz · 3 objetivos ativos", 3 cards in a row (Melhorar saque 65% orange, Aumentar impulsão 40% orange, Melhorar recepção 90% green), each with a progress bar, deadline, and notes text.
- Clicking "Novo objetivo" navigates to `/painel/atletas/plano-evolucao/novo`: a form with título/fundamento/prazo/observações (observações pre-filled with the sample text) on the left, "Objetivos ativos" list (2 static rows) on the right.
- Typing in the form fields updates them (they're live-bound, just not saved anywhere).
- Clicking "Criar objetivo" navigates back to `/painel/atletas/plano-evolucao` (nothing new appears in the list — this is expected, it's a mock).

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/evolucao/panel-plano-evolucao.component.ts frontend/projects/coach/src/app/painel/evolucao/panel-novo-objetivo.component.ts frontend/projects/coach/src/app/app.routes.ts frontend/projects/coach/src/app/painel/atletas/panel-atletas.component.ts
git commit -m "feat(coach): add Plano de evolução & Novo objetivo (mock screens)

Static UI matching the prototype exactly — hardcoded example data,
no Firestore, no persistence. Criar objetivo navigates back without
saving. Per docs/superpowers/specs/2026-07-13-coach-evolucao-lesoes-mock-design.md."
```

---

### Task 2: Lesões + Registro de lesão (+ medical icon, sidebar nav item)

**Files:**
- Create: `frontend/projects/coach/src/app/painel/lesoes/panel-lesoes.component.ts`
- Create: `frontend/projects/coach/src/app/painel/lesoes/panel-registro-lesao.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`
- Modify: `frontend/projects/coach/src/app/painel/ui/icon.component.ts`
- Modify: `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`

**Interfaces:**
- Consumes: same UI primitives as Task 1, plus `AthleteAvatarComponent`.
- Produces: routes `painel/lesoes` → `PanelLesoesComponent`, `painel/lesoes/novo` → `PanelRegistroLesaoComponent`; a new `'medical'` case on `PanelIconName`/`IconComponent`; a new "Lesões" entry in `panel-shell.component.ts`'s `NAV_ITEMS`, placed right after `'historico'`.

- [ ] **Step 1: Add the `medical` icon**

In `frontend/projects/coach/src/app/painel/ui/icon.component.ts`, change the `PanelIconName` union from:

```ts
export type PanelIconName =
  | 'home'
  | 'calendar'
  | 'trophy'
  | 'team'
  | 'person'
  | 'gear'
  | 'chevron-right'
  | 'search'
  | 'bell'
  | 'plus'
  | 'download'
  | 'edit'
  | 'mail'
  | 'check'
  | 'clock'
  | 'clipboard'
  | 'radar';
```

To:

```ts
export type PanelIconName =
  | 'home'
  | 'calendar'
  | 'trophy'
  | 'team'
  | 'person'
  | 'gear'
  | 'chevron-right'
  | 'search'
  | 'bell'
  | 'plus'
  | 'download'
  | 'edit'
  | 'mail'
  | 'check'
  | 'clock'
  | 'clipboard'
  | 'radar'
  | 'medical';
```

Then, in the same file's `@switch (name())` block, add a new `@case` right after the `@case ('radar')` block (before the closing `}` of the switch):

```html
        @case ('medical') {
          <rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" />
        }
```

- [ ] **Step 2: Add "Lesões" to the sidebar nav**

In `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`, change the `NAV_ITEMS` array from:

```ts
const NAV_ITEMS: PanelNavItem[] = [
  { id: 'inicio', label: 'Início', icon: 'home', route: '/painel' },
  { id: 'atletas', label: 'Atletas', icon: 'person', route: '/painel/atletas' },
  { id: 'equipes', label: 'Equipes', icon: 'team', route: '/painel/equipes' },
  { id: 'treinos', label: 'Treinos', icon: 'clipboard', route: '/painel/treinos' },
  { id: 'presenca', label: 'Presença', icon: 'check', route: '/painel/presenca' },
  { id: 'avaliacoes', label: 'Avaliações', icon: 'radar', route: '/painel/avaliacoes' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar', route: '/painel/agenda' },
  { id: 'convocacoes', label: 'Convocações', icon: 'bell', route: '/painel/convocacoes' },
  { id: 'torneios', label: 'Torneios', icon: 'trophy', route: '/painel/torneios' },
  { id: 'historico', label: 'Histórico', icon: 'clock', route: '/painel/historico' },
];
```

To:

```ts
const NAV_ITEMS: PanelNavItem[] = [
  { id: 'inicio', label: 'Início', icon: 'home', route: '/painel' },
  { id: 'atletas', label: 'Atletas', icon: 'person', route: '/painel/atletas' },
  { id: 'equipes', label: 'Equipes', icon: 'team', route: '/painel/equipes' },
  { id: 'treinos', label: 'Treinos', icon: 'clipboard', route: '/painel/treinos' },
  { id: 'presenca', label: 'Presença', icon: 'check', route: '/painel/presenca' },
  { id: 'avaliacoes', label: 'Avaliações', icon: 'radar', route: '/painel/avaliacoes' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar', route: '/painel/agenda' },
  { id: 'convocacoes', label: 'Convocações', icon: 'bell', route: '/painel/convocacoes' },
  { id: 'torneios', label: 'Torneios', icon: 'trophy', route: '/painel/torneios' },
  { id: 'historico', label: 'Histórico', icon: 'clock', route: '/painel/historico' },
  { id: 'lesoes', label: 'Lesões', icon: 'medical', route: '/painel/lesoes' },
];
```

- [ ] **Step 3: Add the two routes**

In `frontend/projects/coach/src/app/app.routes.ts`, add these two routes immediately after the `painel/historico` route:

```ts
  {
    path: 'painel/lesoes',
    title: 'Lesões — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/lesoes/panel-lesoes.component').then((m) => m.PanelLesoesComponent),
  },
  {
    path: 'painel/lesoes/novo',
    title: 'Registrar lesão — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/lesoes/panel-registro-lesao.component').then(
        (m) => m.PanelRegistroLesaoComponent,
      ),
  },
```

- [ ] **Step 4: Create `PanelLesoesComponent`**

Create `frontend/projects/coach/src/app/painel/lesoes/panel-lesoes.component.ts`:

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';

type InjuryStatus = 'recuperacao' | 'liberado' | 'restricao';

interface Injury {
  athleteName: string;
  athleteInitials: string;
  type: string;
  since: string;
  forecast: string;
  status: InjuryStatus;
}

const INJURIES: Injury[] = [
  { athleteName: 'Lucas Ramos', athleteInitials: 'LR', type: 'Entorse de tornozelo', since: '01/07', forecast: '13/07', status: 'recuperacao' },
  { athleteName: 'Pedro Silva', athleteInitials: 'PS', type: 'Tendinite no ombro', since: '20/06', forecast: 'Restrição contínua', status: 'restricao' },
  { athleteName: 'Rafael Nunes', athleteInitials: 'RN', type: 'Lombalgia', since: '02/06', forecast: 'Liberado em 15/06', status: 'liberado' },
];

const STATUS_LABEL: Record<InjuryStatus, string> = {
  recuperacao: 'Recuperação',
  liberado: 'Liberado',
  restricao: 'Restrição',
};
const STATUS_TONE: Record<InjuryStatus, PillTone> = {
  recuperacao: 'yellow',
  liberado: 'green',
  restricao: 'red',
};

/** Lesões (protótipo TrLesoesScreen) — tela mock: dado de exemplo fixo, sem Firestore.
 *  Ver docs/superpowers/specs/2026-07-13-coach-evolucao-lesoes-mock-design.md. */
@Component({
  selector: 'co-panel-lesoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AthleteAvatarComponent,
    IconComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    PillComponent,
    RowComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Lesões" subtitle="3 registros ativos">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/lesoes/novo">
          <co-icon name="plus" [size]="14" />
          Registrar lesão
        </a>
      </co-page-header>

      <div class="body">
        <co-panel-card title="Registros">
          @for (injury of injuries; track injury.athleteName; let last = $last) {
            <co-row [title]="injury.athleteName + ' · ' + injury.type" [sub]="'Desde ' + injury.since + ' · Previsão: ' + injury.forecast" [last]="last">
              <co-athlete-avatar row-avatar [initials]="injury.athleteInitials" [size]="34" status="lesionado" />
              <co-pill row-trailing [tone]="statusTone(injury.status)">{{ statusLabel(injury.status) }}</co-pill>
            </co-row>
          }
        </co-panel-card>

        <co-panel-card title="Novo registro" kicker="Ficha de lesão">
          <div class="field"><div class="f-label">Tipo</div><div class="f-value">Entorse de tornozelo grau I</div></div>
          <div class="field"><div class="f-label">Data</div><div class="f-value">01/07/2026</div></div>
          <div class="field"><div class="f-label">Previsão de retorno</div><div class="f-value">13/07/2026</div></div>
          <div class="field"><div class="f-label">Médico responsável</div><div class="f-value">Dr. Felipe Aguiar — Ortopedia</div></div>
          <div class="field"><div class="f-label">Observações</div><div class="f-value">Uso de tornozeleira nos treinos por 30 dias após retorno.</div></div>
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
  `,
})
export class PanelLesoesComponent {
  protected readonly injuries = INJURIES;

  protected statusLabel(status: InjuryStatus): string {
    return STATUS_LABEL[status];
  }

  protected statusTone(status: InjuryStatus): PillTone {
    return STATUS_TONE[status];
  }
}
```

- [ ] **Step 5: Create `PanelRegistroLesaoComponent`**

Create `frontend/projects/coach/src/app/painel/lesoes/panel-registro-lesao.component.ts`:

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

/** Registro de lesão (protótipo TrRegistroLesaoScreen) — tela mock: formulário interativo,
 *  mas "Salvar registro" não persiste nada, só navega de volta pra Lesões.
 *  Ver docs/superpowers/specs/2026-07-13-coach-evolucao-lesoes-mock-design.md. */
@Component({
  selector: 'co-panel-registro-lesao',
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
      <co-page-header title="Registrar lesão" subtitle="Nova ficha de lesão">
        <button type="button" class="co-mini-btn co-mini-btn-primary" (click)="submit()">Salvar registro</button>
      </co-page-header>

      <div class="body">
        <co-panel-card title="Dados da lesão" kicker="Ficha médica">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Atleta" formControlName="athlete" />
            <co-form-field label="Tipo de lesão" placeholder="Ex: Entorse de tornozelo grau I" formControlName="type" />
            <co-form-field label="Data da ocorrência" placeholder="dd/mm/aaaa" formControlName="date" />
            <co-form-field label="Previsão de retorno" placeholder="dd/mm/aaaa" formControlName="forecast" />
            <co-form-field label="Médico responsável" placeholder="Nome e especialidade" formControlName="doctor" />
            <co-form-select label="Status" [options]="statusOptions" formControlName="status" />
            <co-form-textarea label="Observações" formControlName="notes" />
          </form>
        </co-panel-card>

        <co-panel-card title="Histórico de lesões" kicker="Lucas Ramos">
          <co-row title="Tendinite no joelho" sub="Fev/2025 · Liberado">
            <co-pill row-trailing tone="green">Resolvida</co-pill>
          </co-row>
          <co-row title="Contusão no antebraço" sub="Ago/2024 · Liberado" [last]="true">
            <co-pill row-trailing tone="green">Resolvida</co-pill>
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
      grid-template-columns: 1fr 340px;
      gap: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
  `,
})
export class PanelRegistroLesaoComponent {
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly statusOptions = ['Recuperação', 'Liberado', 'Restrição'];

  protected readonly form = this.fb.group({
    athlete: 'Lucas Ramos',
    type: '',
    date: '',
    forecast: '',
    doctor: '',
    status: 'Recuperação',
    notes: '',
  });

  protected submit(): void {
    void this.router.navigateByUrl('/painel/lesoes');
  }
}
```

- [ ] **Step 6: Build check**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: builds with no errors.

- [ ] **Step 7: Run the full test suite**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: PASS (no new specs in this plan — no pure logic was added — but this must stay green; should be the same 15/15 as before this plan).

- [ ] **Step 8: Manual browser walkthrough**

Run `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng serve coach`, log in as a coach. Expected:
- The sidebar now shows an 11th item, "Lesões", right after "Histórico", with the new medical-cross icon; clicking it highlights it (orange background + left accent bar) like every other nav item.
- `/painel/lesoes` shows "3 registros ativos", a list of 3 rows (Lucas Ramos · Entorse de tornozelo / Recuperação-yellow, Pedro Silva · Tendinite no ombro / Restrição-red, Rafael Nunes · Lombalgia / Liberado-green), each with a "lesionado"-ringed avatar, and a "Novo registro" card on the right showing the static ficha fields.
- Clicking "Registrar lesão" navigates to `/painel/lesoes/novo`: a form (Atleta pre-filled "Lucas Ramos", tipo/data/previsão/médico/status/observações) on the left, "Histórico de lesões" (2 static rows) on the right.
- Clicking "Salvar registro" navigates back to `/painel/lesoes` (nothing new appears — expected, it's a mock).

- [ ] **Step 9: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/lesoes/panel-lesoes.component.ts frontend/projects/coach/src/app/painel/lesoes/panel-registro-lesao.component.ts frontend/projects/coach/src/app/app.routes.ts frontend/projects/coach/src/app/painel/ui/icon.component.ts frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts
git commit -m "feat(coach): add Lesões & Registro de lesão (mock screens)

New sidebar nav item + medical icon. Static UI matching the
prototype exactly — hardcoded example data, no Firestore, no
persistence. Salvar registro navigates back without saving.
Per docs/superpowers/specs/2026-07-13-coach-evolucao-lesoes-mock-design.md."
```

---

## Self-Review Notes

- **Spec coverage:** all 4 screens (Task 1: Plano de evolução + Novo objetivo; Task 2: Lesões + Registro de lesão), the new sidebar nav item + medical icon (Task 2), the Atletas header entry button (Task 1), no service/Firestore/persistence anywhere, exact example data/copy from the spec reproduced verbatim in both tasks — every spec decision has a task.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `PillTone` (imported from `pill.component.ts`) is reused as the exact return type of `PanelLesoesComponent.statusTone()`, matching `PillComponent.tone`'s input type (`input<PillTone>('orange')`) — no ad-hoc string-union duplication. `PanelIconName`'s new `'medical'` member is consumed by both `panel-shell.component.ts`'s new `NAV_ITEMS` entry and is otherwise unused elsewhere, so no other file needs updating for the icon addition. Route paths referenced by `routerLink` in both tasks (`/painel/atletas/plano-evolucao`, `/painel/atletas/plano-evolucao/novo`, `/painel/lesoes`, `/painel/lesoes/novo`) match the paths registered in `app.routes.ts` exactly.
