# Painel da Arena (web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir as 7 telas do painel web da arena (Início, Agenda, Financeiro, Torneios, Quadras, Equipe, Perfil) a partir do protótipo `NexaGO Arena — Painel.html`, substituindo o placeholder pós-login atual.

**Architecture:** Réplica do padrão já usado em `frontend/projects/backoffice/src/app/painel/` — um kit de UI standalone reutilizável em `painel/ui/` (ícone, shell com sidebar, cards, KPI, pill, etc.) consumido por 7 telas independentes (`painel/<feature>/panel-<feature>.component.ts`), cada uma lazy-loaded pela própria rota e se auto-envolvendo em `<ar-panel-shell>`. Dados mock hardcoded nos componentes; sem Firestore nesta rodada.

**Tech Stack:** Angular standalone components (signals, `computed()`, `input()`/`output()`, `OnPush`, `inject()`), SCSS com custom properties `--nx-*` já definidas em `src/styles.scss`, Karma+Jasmine (`ng test arena`) só para a função pura de posicionamento da grade de agenda.

## Global Constraints

- Componentes standalone; **nunca** `standalone: true` explícito no decorator (é o default).
- `changeDetection: ChangeDetectionStrategy.OnPush` em todo componente.
- `input()`/`output()` funcionais, não decorators `@Input`/`@Output`.
- `inject()` em vez de constructor injection.
- Fluxo de controle nativo (`@if`, `@for`, `@switch`), nunca `*ngIf`/`*ngFor`/`*ngSwitch`.
- Nunca `ngClass`/`ngStyle` — usar bindings `[class]`/`[style]`.
- Sem `any`; usar `unknown` quando o tipo for incerto.
- Nomes de arquivo/seletor em inglês; strings visíveis ao usuário em português (convenção do CLAUDE.md raiz). Rotas (URL) em português, seguindo `entrar`/`cadastro`/`painel` já existentes.
- Dados mock hardcoded nos componentes (arrays `protected readonly`) — sem chamadas Firestore nesta rodada.
- Tokens de design (`--nx-*`) e classes `.ar-*` do fluxo de auth já existem em `frontend/projects/arena/src/styles.scss` — não duplicar, só adicionar o que falta.
- Toda tela usa `<ar-panel-shell>` como wrapper direto (sem `<router-outlet>` aninhado) — mesmo padrão do `bo-panel-shell` em `frontend/projects/backoffice/src/app/painel/ui/panel-shell.component.ts`.

## File Structure

```
frontend/projects/arena/src/
  styles.scss                                    (MODIFICAR — adicionar classes .ar-* de painel)
  app/
    app.routes.ts                                 (MODIFICAR — 7 rotas de painel)
    painel/
      panel-home.component.ts                     (APAGAR — placeholder)
      ui/
        icon.component.ts                         (ar-icon)
        initials.ts                               (initialsOf — compartilhada por shell, Início e Perfil)
        pill.component.ts                         (ar-pill)
        status-dot.component.ts                   (ar-status-dot)
        page-header.component.ts                  (ar-page-header)
        panel-card.component.ts                   (ar-panel-card)
        kpi-card.component.ts                     (ar-kpi-card)
        bar-row.component.ts                      (ar-bar-row)
        line-chart.component.ts                   (ar-line-chart)
        chart-tabs.component.ts                    (ar-chart-tabs)
        panel-shell.component.ts                  (ar-panel-shell)
        agenda-grid-math.ts                       (função pura de posicionamento)
        agenda-grid-math.spec.ts
        agenda-grid.component.ts                  (ar-agenda-grid)
      home/
        panel-home.component.ts                   (ar-panel-home — tela Início; novo arquivo, mesmo nome do placeholder apagado)
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

---

## Task 1: Classes utilitárias globais do painel

**Files:**
- Modify: `frontend/projects/arena/src/styles.scss`

**Interfaces:**
- Produces: classes CSS globais `.ar-mini-btn`, `.ar-mini-btn-primary`, `.ar-ghost-btn`, `.ar-search-box`, `.ar-bell-btn`, `.ar-chart-tabs`, `.ar-chip`, `.ar-shortcut`, `.ar-filter-bar`, consumidas por várias das telas das tasks seguintes (cada tela usa o subconjunto que precisa — nem toda classe aparece em toda tela).

- [ ] **Step 1: Adicionar as classes ao final de `styles.scss`**

Abra `frontend/projects/arena/src/styles.scss` e adicione ao final do arquivo (depois do `@keyframes ar-spin` existente):

```scss
/* ── Painel: botões e controles compartilhados ─────────────── */

.ar-mini-btn {
  height: 32px;
  padding: 0 13px;
  border-radius: var(--nx-r-2);
  background: var(--nx-surface-1);
  color: var(--nx-text);
  border: 1px solid var(--nx-line-strong);
  font-family: var(--nx-font-display);
  font-weight: 600;
  font-size: 12.5px;
  letter-spacing: -0.005em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  transition: all 140ms var(--nx-ease-out);
}

.ar-mini-btn:hover:not(:disabled) {
  background: var(--nx-surface-2);
}

.ar-mini-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.ar-mini-btn-primary {
  background: var(--nx-orange-500);
  color: var(--nx-text-on-orange);
  border: none;
  box-shadow: 0 6px 20px rgba(255, 106, 26, 0.2);
}

.ar-mini-btn-primary:hover:not(:disabled) {
  background: var(--nx-orange-400);
}

.ar-ghost-btn {
  height: 32px;
  padding: 0 11px;
  border-radius: var(--nx-r-2);
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--nx-text-mute);
  font-family: var(--nx-font-display);
  font-weight: 600;
  font-size: 12.5px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.ar-ghost-btn:hover {
  color: var(--nx-text);
}

.ar-search-box {
  width: 220px;
  height: 38px;
  padding: 0 12px;
  background: var(--nx-surface-0);
  border: 1px solid var(--nx-line);
  border-radius: var(--nx-r-2);
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--nx-text-dim);
}

.ar-search-box span {
  flex: 1;
  font-size: 13px;
}

.ar-search-box .kbd {
  font-family: var(--nx-font-mono);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border: 1px solid var(--nx-line);
  border-radius: 6px;
  flex: none;
}

.ar-bell-btn {
  width: 38px;
  height: 38px;
  border-radius: var(--nx-r-2);
  position: relative;
  background: var(--nx-surface-0);
  border: 1px solid var(--nx-line);
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--nx-text-mute);
}

.ar-bell-btn .dot {
  position: absolute;
  top: 8px;
  right: 9px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--nx-orange-500);
  box-shadow: 0 0 0 2px var(--nx-bg);
}

.ar-chart-tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--nx-surface-1);
  border: 1px solid var(--nx-line);
  border-radius: var(--nx-r-2);
}

.ar-chart-tabs button {
  height: 26px;
  padding: 0 12px;
  border-radius: 7px;
  border: none;
  cursor: pointer;
  background: transparent;
  color: var(--nx-text-dim);
  font-family: var(--nx-font-display);
  font-weight: 600;
  font-size: 11.5px;
}

.ar-chart-tabs button.active {
  background: var(--nx-surface-2);
  color: var(--nx-text);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
}

.ar-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ar-chip {
  flex: none;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--nx-r-pill);
  background: var(--nx-surface-0);
  border: 1px solid var(--nx-line);
  color: var(--nx-text-mute);
  font-family: var(--nx-font-display);
  font-weight: 600;
  font-size: 12.5px;
  letter-spacing: -0.005em;
  cursor: pointer;
  white-space: nowrap;
  transition: all 140ms var(--nx-ease-out);
}

.ar-chip:hover {
  background: var(--nx-surface-1);
  color: var(--nx-text);
}

.ar-chip.active {
  background: var(--nx-orange-500);
  border-color: var(--nx-orange-500);
  color: var(--nx-text-on-orange);
}

.ar-shortcut {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  background: var(--nx-surface-1);
  border: 1px solid var(--nx-line);
  border-radius: var(--nx-r-3);
  cursor: pointer;
  color: var(--nx-orange-500);
  font-family: var(--nx-font-display);
  font-weight: 600;
  font-size: 12px;
  letter-spacing: -0.005em;
}

.ar-shortcut span {
  color: var(--nx-text);
}
```

- [ ] **Step 2: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros (CSS puro, nada referencia ainda essas classes).

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/styles.scss
git commit -m "feat(arena): classes utilitárias globais do painel (ar-mini-btn, ar-chip, ar-row etc.)"
```

---

## Task 2: `ar-icon`

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/icon.component.ts`

**Interfaces:**
- Produces: `IconComponent` (seletor `ar-icon`), `export type PanelIconName = 'home' | 'calendar' | 'cash' | 'trophy' | 'courts' | 'team' | 'person' | 'gear' | 'chevron-right' | 'search' | 'bell' | 'plus' | 'download' | 'edit' | 'mail' | 'star' | 'share'`. Inputs: `name` (required, `PanelIconName`), `size` (default `18`), `strokeWidth` (default `1.8`).

- [ ] **Step 1: Criar o componente**

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PanelIconName =
  | 'home'
  | 'calendar'
  | 'cash'
  | 'trophy'
  | 'courts'
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
  | 'star'
  | 'share';

/** Ícones stroke-24 do painel da arena (protótipo Ar*/Bo*/At* Ic*), um componente para evitar repetir SVG. */
@Component({
  selector: 'ar-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('home') {
          <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" />
        }
        @case ('calendar') {
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
        }
        @case ('cash') {
          <rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 6v0M18 18v0" />
        }
        @case ('trophy') {
          <path d="M8 21h8M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" />
          <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
        }
        @case ('courts') {
          <rect x="3" y="6" width="18" height="12" rx="1.5" /><path d="M12 6v12M3 12h18M7 6v3M17 6v3M7 15v3M17 15v3" />
        }
        @case ('team') {
          <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
          <circle cx="17.5" cy="8.5" r="2.6" /><path d="M15.2 13.2c2.9.4 5.3 2.9 5.3 6.3" />
        }
        @case ('person') {
          <circle cx="12" cy="8" r="4" /><path d="M4 21c0-3.9 3.6-7 8-7s8 3.1 8 7" />
        }
        @case ('gear') {
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
        }
        @case ('chevron-right') {
          <path d="m9 6 6 6-6 6" />
        }
        @case ('search') {
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        }
        @case ('bell') {
          <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2.2 2.2 0 0 0 4 0" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('download') {
          <path d="M12 4v11M7.5 11 12 15.5 16.5 11" /><path d="M4 19h16" />
        }
        @case ('edit') {
          <path d="M4 20h4L20 8l-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" />
        }
        @case ('mail') {
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        }
        @case ('star') {
          <path d="m12 2.5 3.1 6.5 7.1 1-5.1 5 1.2 7.1L12 18.7l-6.3 3.4 1.2-7.1-5.1-5 7.1-1z" />
        }
        @case ('share') {
          <circle cx="18" cy="5" r="2.7" /><circle cx="6" cy="12" r="2.7" /><circle cx="18" cy="19" r="2.7" />
          <path d="m8.4 10.7 7.2-4.1M8.4 13.3l7.2 4.1" />
        }
      }
    </svg>
  `,
})
export class IconComponent {
  readonly name = input.required<PanelIconName>();
  readonly size = input(18);
  readonly strokeWidth = input(1.8);
}
```

- [ ] **Step 2: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/icon.component.ts
git commit -m "feat(arena): componente ar-icon com o conjunto de ícones do painel"
```

---

## Task 3: Átomos triviais — `ar-pill`, `ar-status-dot`, `ar-page-header`, `ar-panel-card`

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/pill.component.ts`
- Create: `frontend/projects/arena/src/app/painel/ui/status-dot.component.ts`
- Create: `frontend/projects/arena/src/app/painel/ui/page-header.component.ts`
- Create: `frontend/projects/arena/src/app/painel/ui/panel-card.component.ts`

**Interfaces:**
- Produces: `PillComponent` (`ar-pill`, `export type PillTone = 'orange' | 'green' | 'yellow' | 'red' | 'dim'`, input `tone` default `'orange'`, conteúdo projetado).
- Produces: `StatusDotComponent` (`ar-status-dot`, `export type StatusTone = 'green' | 'yellow' | 'red'`, inputs `tone` default `'green'`, `size` default `8`).
- Produces: `PageHeaderComponent` (`ar-page-header`, inputs `title` required, `subtitle` default `''`, conteúdo projetado para ações).
- Produces: `PanelCardComponent` (`ar-panel-card`, inputs `title` default `''`, `kicker` default `''`, `pad` default `'md'` (`'sm' | 'md' | 'lg'`), `accent` default `false`; slot `[card-actions]` + conteúdo padrão).

- [ ] **Step 1: Criar `pill.component.ts`**

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type PillTone = 'orange' | 'green' | 'yellow' | 'red' | 'dim';

/** Pill de status (protótipo BoPill/ArPill). */
@Component({
  selector: 'ar-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="pill" [class]="'tone-' + tone()">
      <ng-content />
    </span>
  `,
  styles: `
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 22px;
      padding: 0 9px;
      border-radius: var(--nx-r-pill);
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      white-space: nowrap;
      border: 1px solid transparent;
    }

    .tone-orange {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
      color: var(--nx-orange-500);
    }

    .tone-green {
      background: rgba(43, 209, 126, 0.1);
      border-color: rgba(43, 209, 126, 0.28);
      color: var(--nx-win);
    }

    .tone-yellow {
      background: rgba(244, 197, 67, 0.1);
      border-color: rgba(244, 197, 67, 0.28);
      color: var(--nx-pending);
    }

    .tone-red {
      background: rgba(255, 59, 48, 0.1);
      border-color: rgba(255, 59, 48, 0.28);
      color: var(--nx-live);
    }

    .tone-dim {
      background: var(--nx-surface-1);
      border-color: var(--nx-line-strong);
      color: var(--nx-text-mute);
    }
  `,
})
export class PillComponent {
  readonly tone = input<PillTone>('orange');
}
```

- [ ] **Step 2: Criar `status-dot.component.ts`**

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type StatusTone = 'green' | 'yellow' | 'red';

/** Indicador de status pontual (protótipo BoStatusDot). */
@Component({
  selector: 'ar-status-dot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="dot" [class]="'tone-' + tone()" [style.width.px]="size()" [style.height.px]="size()"></span>`,
  styles: `
    .dot {
      display: inline-block;
      border-radius: 50%;
      flex: none;
    }

    .tone-green {
      background: var(--nx-win);
      box-shadow: 0 0 8px rgba(43, 209, 126, 0.5);
    }

    .tone-yellow {
      background: var(--nx-pending);
      box-shadow: 0 0 8px rgba(244, 197, 67, 0.5);
    }

    .tone-red {
      background: var(--nx-live);
      box-shadow: 0 0 8px rgba(255, 59, 48, 0.5);
    }
  `,
})
export class StatusDotComponent {
  readonly tone = input<StatusTone>('green');
  readonly size = input(8);
}
```

- [ ] **Step 3: Criar `page-header.component.ts`**

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Cabeçalho de página do painel (protótipo BoPageHeader): título + subtítulo + ações projetadas. */
@Component({
  selector: 'ar-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
      <div class="titles">
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <div class="subtitle">{{ subtitle() }}</div>
        }
      </div>
      <div class="spacer"></div>
      <ng-content />
    </header>
  `,
  styles: `
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 32px;
      border-bottom: 1px solid var(--nx-line);
      flex: none;
    }

    .titles {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    h1 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 21px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
      white-space: nowrap;
    }

    .subtitle {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      white-space: nowrap;
    }

    .spacer {
      flex: 1;
    }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
```

- [ ] **Step 4: Criar `panel-card.component.ts`**

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Card base do painel (protótipo BoCard/ArCard): kicker + título + ação, com conteúdo projetado. */
@Component({
  selector: 'ar-panel-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card" [class.pad-sm]="pad() === 'sm'" [class.pad-lg]="pad() === 'lg'" [class.accent]="accent()">
      @if (title() || kicker()) {
        <div class="head">
          <div class="titles">
            @if (kicker()) {
              <div class="kicker">{{ kicker() }}</div>
            }
            @if (title()) {
              <div class="title">{{ title() }}</div>
            }
          </div>
          <div class="spacer"></div>
          <ng-content select="[card-actions]" />
        </div>
      }
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 20px;
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: 100%;
      box-sizing: border-box;
    }

    .card.pad-sm {
      padding: 16px;
    }

    .card.pad-lg {
      padding: 24px;
    }

    .card.accent {
      border-color: rgba(255, 106, 26, 0.3);
      box-shadow: 0 0 0 4px rgba(255, 106, 26, 0.06);
    }

    .head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }

    .titles {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.01em;
      color: var(--nx-text);
    }

    .spacer {
      flex: 1;
    }
  `,
})
export class PanelCardComponent {
  readonly title = input('');
  readonly kicker = input('');
  readonly pad = input<'sm' | 'md' | 'lg'>('md');
  readonly accent = input(false);
}
```

- [ ] **Step 5: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/pill.component.ts \
  frontend/projects/arena/src/app/painel/ui/status-dot.component.ts \
  frontend/projects/arena/src/app/painel/ui/page-header.component.ts \
  frontend/projects/arena/src/app/painel/ui/panel-card.component.ts
git commit -m "feat(arena): átomos ar-pill, ar-status-dot, ar-page-header, ar-panel-card"
```

---

## Task 4: `ar-kpi-card`

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/kpi-card.component.ts`

**Interfaces:**
- Consumes: `PanelCardComponent` (`ar-panel-card`, Task 3), `IconComponent` (`ar-icon`, Task 2).
- Produces: `KpiCardComponent` (`ar-kpi-card`). Inputs: `label` required `string`, `value` required `string`, `delta` default `''`, `deltaTone` default `'green'` (`'green' | 'red' | 'orange' | 'flat'`), `icon` default `null` (`PanelIconName | null`).

- [ ] **Step 1: Criar o componente**

Diferente do `bo-kpi-card` do backoffice (só `green`/`red`, sem ícone), este suporta um ícone opcional no canto e a tonalidade `orange`/`flat` sem seta — igual ao `ArKpiCard` do protótipo.

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, type PanelIconName } from './icon.component';
import { PanelCardComponent } from './panel-card.component';

export type KpiDeltaTone = 'green' | 'red' | 'orange' | 'flat';

/** Card de indicador (protótipo ArKpiCard): valor grande + variação vs semana anterior, com ícone opcional. */
@Component({
  selector: 'ar-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, IconComponent],
  template: `
    <ar-panel-card pad="sm">
      <div class="head">
        <div class="label">{{ label() }}</div>
        @if (icon()) {
          <ar-icon [name]="icon()!" [size]="14" style="color: var(--nx-text-dim)" />
        }
      </div>
      <div class="value">{{ value() }}</div>
      @if (delta()) {
        <div class="delta">
          <span class="delta-value" [class]="'tone-' + deltaTone()">
            @if (deltaTone() === 'green' || deltaTone() === 'red') {
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" [style.transform]="deltaTone() === 'red' ? 'rotate(180deg)' : 'none'" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            }
            {{ delta() }}
          </span>
          <span class="delta-label">vs semana anterior</span>
        </div>
      }
    </ar-panel-card>
  `,
  styles: `
    :host {
      display: block;
      flex: 1;
      min-width: 0;
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.03em;
      line-height: 1;
      color: var(--nx-text);
      margin-bottom: 8px;
    }

    .delta {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .delta-value {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 700;
    }

    .delta-value.tone-green {
      color: var(--nx-win);
    }

    .delta-value.tone-red {
      color: var(--nx-live);
    }

    .delta-value.tone-orange {
      color: var(--nx-orange-500);
    }

    .delta-value.tone-flat {
      color: var(--nx-text-dim);
    }

    .delta-label {
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }
  `,
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly delta = input('');
  readonly deltaTone = input<KpiDeltaTone>('green');
  readonly icon = input<PanelIconName | null>(null);
}
```

- [ ] **Step 2: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/kpi-card.component.ts
git commit -m "feat(arena): componente ar-kpi-card com ícone e 4 tonalidades de delta"
```

---

## Task 5: `ar-bar-row`

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/bar-row.component.ts`

**Interfaces:**
- Produces: `BarRowComponent` (`ar-bar-row`). Inputs: `label` required `string`, `sub` default `''`, `pct` required `number`, `tone` default `'orange'` (`'orange' | 'green' | 'yellow' | 'red'`), `last` default `false`.

- [ ] **Step 1: Criar o componente**

Diferente do `bo-bar-row` do backoffice (que recebe `count`/`max` e sempre laranja), este recebe `pct` direto e uma tonalidade — igual ao `ArBarRow` do protótipo (usado em "Ocupação por quadra", "Recebimento por quadra" etc.).

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BarRowTone = 'orange' | 'green' | 'yellow' | 'red';

/** Barra de progresso horizontal com label + subtítulo (protótipo ArBarRow). */
@Component({
  selector: 'ar-bar-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row" [class.last]="last()">
      <div class="head">
        <div class="labels">
          <span class="label">{{ label() }}</span>
          @if (sub()) {
            <span class="sub">{{ sub() }}</span>
          }
        </div>
        <span class="pct" [class]="'tone-' + tone()">{{ pct() }}%</span>
      </div>
      <div class="track">
        <div class="fill" [class]="'tone-' + tone()" [style.width.%]="pct()"></div>
      </div>
    </div>
  `,
  styles: `
    .row {
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .row.last {
      border-bottom: none;
    }

    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 7px;
    }

    .labels {
      display: flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
    }

    .label {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }

    .sub {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }

    .pct {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
    }

    .pct.tone-orange,
    .fill.tone-orange {
      color: var(--nx-orange-500);
    }

    .pct.tone-green,
    .fill.tone-green {
      color: var(--nx-win);
    }

    .pct.tone-yellow,
    .fill.tone-yellow {
      color: var(--nx-pending);
    }

    .pct.tone-red,
    .fill.tone-red {
      color: var(--nx-live);
    }

    .track {
      height: 7px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .fill {
      height: 100%;
      border-radius: 4px;
      background: currentColor;
    }
  `,
})
export class BarRowComponent {
  readonly label = input.required<string>();
  readonly sub = input('');
  readonly pct = input.required<number>();
  readonly tone = input<BarRowTone>('orange');
  readonly last = input(false);
}
```

- [ ] **Step 2: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/bar-row.component.ts
git commit -m "feat(arena): componente ar-bar-row"
```

---

## Task 6: `ar-line-chart`

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/line-chart.component.ts`

**Interfaces:**
- Produces: `LineChartComponent` (`ar-line-chart`). Inputs: `data` required `number[]`, `labels` required `string[]`, `width` default `802`, `height` default `168`, `ariaLabel` default `'Gráfico de tendência'`.

- [ ] **Step 1: Criar o componente**

Réplica do `bo-line-chart` do backoffice, com o input `months` renomeado para `labels` (mais genérico — aqui é usado tanto pra dias da semana quanto meses) e os multiplicadores de bounds do `ArLineChart` do protótipo (`*1.15`/`*0.75`, não `*1.12`/`*0.82` do backoffice).

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Gráfico de linha simples via SVG (protótipo ArLineChart), sem dependência de charting lib. */
@Component({
  selector: 'ar-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart">
      <svg width="100%" [attr.height]="height()" [attr.viewBox]="'0 0 ' + width() + ' ' + height()" preserveAspectRatio="none" role="img" [attr.aria-label]="ariaLabel()">
        <defs>
          <linearGradient id="arChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#FF6A1A" stop-opacity="0.22" />
            <stop offset="100%" stop-color="#FF6A1A" stop-opacity="0" />
          </linearGradient>
        </defs>
        @for (f of gridLines; track f) {
          <line x1="0" [attr.y1]="height() * f" [attr.x2]="width()" [attr.y2]="height() * f" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3 5" />
        }
        <path [attr.d]="areaPath()" fill="url(#arChartFill)" />
        <path [attr.d]="linePath()" fill="none" stroke="var(--nx-orange-500)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
        <circle [attr.cx]="lastPoint().x" [attr.cy]="lastPoint().y" r="4.5" fill="var(--nx-orange-500)" stroke="#0B0B0C" stroke-width="2.5" />
      </svg>
      <div class="axis">
        @for (l of labels(); track l) {
          <span>{{ l }}</span>
        }
      </div>
    </div>
  `,
  styles: `
    .chart {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    svg {
      display: block;
      overflow: visible;
    }

    .axis {
      display: flex;
      justify-content: space-between;
    }

    .axis span {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
  `,
})
export class LineChartComponent {
  readonly data = input.required<number[]>();
  readonly labels = input.required<string[]>();
  readonly width = input(802);
  readonly height = input(168);
  readonly ariaLabel = input('Gráfico de tendência');

  protected readonly gridLines = [0.25, 0.5, 0.75];

  private readonly bounds = computed(() => {
    const data = this.data();
    return { max: Math.max(...data) * 1.15, min: Math.min(...data) * 0.75 };
  });

  private px(i: number): number {
    const data = this.data();
    return (i / (data.length - 1)) * this.width();
  }

  private py(v: number): number {
    const { max, min } = this.bounds();
    return this.height() - ((v - min) / (max - min || 1)) * this.height();
  }

  protected readonly linePath = computed(() => {
    const pts = this.data().map((v, i) => `${this.px(i).toFixed(1)},${this.py(v).toFixed(1)}`);
    return 'M' + pts.join(' L');
  });

  protected readonly areaPath = computed(() => {
    const w = this.width();
    const h = this.height();
    return `${this.linePath()} L${w},${h} L0,${h} Z`;
  });

  protected readonly lastPoint = computed(() => {
    const data = this.data();
    const i = data.length - 1;
    return { x: this.px(i), y: this.py(data[i]!) };
  });
}
```

- [ ] **Step 2: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/line-chart.component.ts
git commit -m "feat(arena): componente ar-line-chart"
```

---

## Task 7: `ar-chart-tabs`

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/chart-tabs.component.ts`

**Interfaces:**
- Produces: `ChartTabsComponent` (`ar-chart-tabs`). Inputs: `tabs` required `string[]`, `active` required `string`. Output: `change` (`string`).

- [ ] **Step 1: Criar o componente**

Diferente das abas decorativas do backoffice, estas são funcionais — controlam o dado exibido em Início (Faturamento/Reservas/Ocupação), Agenda (Dia/Semana) e Torneios (ativos/encerrados).

```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Abas de alternância de dado exibido (protótipo ArChartTabs) — usa a classe global .ar-chart-tabs. */
@Component({
  selector: 'ar-chart-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ar-chart-tabs">
      @for (t of tabs(); track t) {
        <button type="button" [class.active]="t === active()" (click)="change.emit(t)">{{ t }}</button>
      }
    </div>
  `,
})
export class ChartTabsComponent {
  readonly tabs = input.required<string[]>();
  readonly active = input.required<string>();
  readonly change = output<string>();
}
```

- [ ] **Step 2: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/chart-tabs.component.ts
git commit -m "feat(arena): componente ar-chart-tabs funcional"
```

---

## Task 8: `ar-panel-shell`

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/initials.ts`
- Create: `frontend/projects/arena/src/app/painel/ui/panel-shell.component.ts`

**Interfaces:**
- Consumes: `IconComponent`/`PanelIconName` (Task 2), `AuthService` (`frontend/projects/arena/src/app/auth/auth.service.ts` — expõe `displayName(): string | null` e `user(): User | null`).
- Produces: `initialsOf(name: string): string` (compartilhada — Tasks 11 e 17 também consomem). `PanelShellComponent` (`ar-panel-shell`). Sem inputs — calcula a rota ativa internamente a partir do `Router`. Conteúdo projetado via `<ng-content />` (a tela inteira, igual ao `bo-panel-shell`).

- [ ] **Step 1: Criar o helper compartilhado `initialsOf`**

Extraído para arquivo próprio porque é consumido por três telas (shell, Início, Perfil) — evita duplicar a mesma função três vezes.

```ts
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '·';
  }
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}
```

- [ ] **Step 2: Criar o componente**

Sidebar fixa (236px) com: marca, seletor de arena (nome real vindo de `AuthService.displayName()`), nav de 7 itens (rota ativa calculada por comparação exata de path — as 7 rotas são todas irmãs sob `/painel`, sem prefixo em comum além de `/painel` sozinho), item "Configurações" desabilitado, e rodapé com usuário real. Diferente do `bo-panel-shell`: não existe `profileActive`/link redundante no rodapé — "Perfil" já é um item de nav normal, então o rodapé é só apresentacional (sem `routerLink`).

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { IconComponent, type PanelIconName } from './icon.component';
import { initialsOf } from './initials';

interface PanelNavItem {
  id: string;
  label: string;
  icon: PanelIconName;
  route: string;
  badge: number | null;
}

const NAV_ITEMS: PanelNavItem[] = [
  { id: 'inicio', label: 'Início', icon: 'home', route: '/painel', badge: null },
  { id: 'agenda', label: 'Agenda', icon: 'calendar', route: '/painel/agenda', badge: null },
  { id: 'financeiro', label: 'Financeiro', icon: 'cash', route: '/painel/financeiro', badge: null },
  { id: 'torneios', label: 'Torneios', icon: 'trophy', route: '/painel/torneios', badge: 2 },
  { id: 'quadras', label: 'Quadras', icon: 'courts', route: '/painel/quadras', badge: null },
  { id: 'equipe', label: 'Equipe', icon: 'team', route: '/painel/equipe', badge: null },
  { id: 'perfil', label: 'Perfil', icon: 'person', route: '/painel/perfil', badge: null },
];

function pathOnly(url: string): string {
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

/** Shell do painel da arena: sidebar fixa (protótipo ArPanelShell/ArSidebar) + conteúdo projetado. */
@Component({
  selector: 'ar-panel-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M5 4 L5 20 M19 4 L19 20 M5 4 L19 20" stroke="#0A0A0A" stroke-width="3.4" stroke-linecap="square" stroke-linejoin="miter" />
            </svg>
          </div>
          <div class="wordmark">
            <div class="name">nexa<span>GO</span></div>
            <div class="tag">Arena</div>
          </div>
        </div>

        <div class="switcher">
          <div class="switcher-avatar" aria-hidden="true">{{ initials() }}</div>
          <div class="switcher-body">
            <div class="switcher-name">{{ arenaName() }}</div>
            <div class="switcher-meta">1 unidade</div>
          </div>
          <ar-icon name="chevron-right" [size]="13" style="color: var(--nx-text-dim); transform: rotate(90deg)" />
        </div>

        <nav class="nav">
          <div class="nav-kicker">Operação</div>
          @for (item of navItems; track item.id) {
            <a class="nav-item" [class.active]="activeId() === item.id" [routerLink]="item.route">
              <ar-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
              <span>{{ item.label }}</span>
              @if (item.badge) {
                <span class="badge">{{ item.badge }}</span>
              }
            </a>
          }
        </nav>

        <div class="spacer"></div>

        <div class="nav-item disabled" title="Em breve">
          <ar-icon name="gear" [size]="17" [strokeWidth]="1.9" />
          <span>Configurações</span>
        </div>

        <div class="user-row">
          <div class="avatar" aria-hidden="true">{{ initials() }}</div>
          <div class="who">
            <div class="who-name">{{ displayName() }}</div>
            <div class="who-role">Gestor</div>
          </div>
        </div>
      </aside>

      <div class="content">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .shell {
      min-height: 100dvh;
      display: grid;
      grid-template-columns: 236px 1fr;
      background: var(--nx-bg);
      color: var(--nx-text);
    }

    .sidebar {
      background: #070708;
      border-right: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      padding: 20px 14px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 2px 8px 0;
    }

    .mark {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--nx-orange-500);
      display: grid;
      place-items: center;
      flex: none;
      box-shadow: 0 0 0 1px rgba(255, 106, 26, 0.3);
    }

    .wordmark {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .wordmark .name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 15px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .wordmark .name span {
      color: var(--nx-orange-500);
    }

    .wordmark .tag {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .switcher {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-top: 18px;
      padding: 8px 10px;
      border-radius: var(--nx-r-2);
      cursor: pointer;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }

    .switcher-avatar {
      width: 28px;
      height: 28px;
      border-radius: 9px;
      flex: none;
      background: linear-gradient(135deg, #f0a830 0%, #2260b8 100%);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 9px;
      color: #fff;
    }

    .switcher-body {
      flex: 1;
      min-width: 0;
    }

    .switcher-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .switcher-meta {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      color: var(--nx-text-dim);
    }

    .nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 22px;
    }

    .nav-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      padding: 0 12px;
      margin-bottom: 8px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 40px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      letter-spacing: -0.005em;
      position: relative;
      text-decoration: none;
    }

    a.nav-item {
      cursor: pointer;
      transition: background 140ms var(--nx-ease-out);
    }

    a.nav-item:hover {
      background: var(--nx-surface-1);
    }

    .nav-item.active {
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }

    .nav-item.active span:first-of-type {
      color: var(--nx-text);
    }

    .nav-item.active::before {
      content: '';
      position: absolute;
      left: -14px;
      top: 10px;
      bottom: 10px;
      width: 3px;
      border-radius: 2px;
      background: var(--nx-orange-500);
    }

    .nav-item.disabled {
      opacity: 0.45;
      cursor: default;
    }

    .nav-item span:first-of-type {
      flex: 1;
    }

    .nav-item .badge {
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 10px;
      display: grid;
      place-items: center;
      flex: none;
    }

    .spacer {
      flex: 1;
    }

    .user-row {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      flex: none;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 11px;
      color: var(--nx-orange-500);
    }

    .who {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
      flex: 1;
    }

    .who-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .who-role {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .content {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 100dvh;
    }

    @media (max-width: 900px) {
      .shell {
        grid-template-columns: 1fr;
      }

      .sidebar {
        display: none;
      }
    }
  `,
})
export class PanelShellComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly navItems = NAV_ITEMS;

  private readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => pathOnly(this.router.url)),
      startWith(pathOnly(this.router.url)),
    ),
    { initialValue: pathOnly(this.router.url) },
  );

  protected readonly activeId = computed(() => {
    const path = this.currentPath();
    return NAV_ITEMS.find((item) => item.route === path)?.id ?? null;
  });

  protected readonly displayName = computed(
    () => this.auth.displayName() || this.auth.user()?.email || 'Conta',
  );

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected readonly initials = computed(() => initialsOf(this.displayName()));
}
```

- [ ] **Step 3: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/initials.ts \
  frontend/projects/arena/src/app/painel/ui/panel-shell.component.ts
git commit -m "feat(arena): helper initialsOf + componente ar-panel-shell com sidebar, seletor de arena e nav"
```

---

## Task 9: Função pura de posicionamento da agenda + testes

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/agenda-grid-math.ts`
- Test: `frontend/projects/arena/src/app/painel/ui/agenda-grid-math.spec.ts`

**Interfaces:**
- Produces: constantes `AGENDA_GRID_START_MIN = 420` (07:00), `AGENDA_GRID_END_MIN = 1320` (22:00), `AGENDA_SLOT_MIN = 30`, `AGENDA_ROW_HEIGHT = 34`; funções `minutesToRowOffset(minutes: number): number`, `formatMinutes(minutes: number): string`, `isWithinGrid(minutes: number): boolean`, `nowInMinutes(date?: Date): number`.

- [ ] **Step 1: Escrever o teste (falhando)**

```ts
import {
  AGENDA_GRID_START_MIN,
  AGENDA_ROW_HEIGHT,
  formatMinutes,
  isWithinGrid,
  minutesToRowOffset,
  nowInMinutes,
} from './agenda-grid-math';

describe('agenda-grid-math', () => {
  describe('minutesToRowOffset', () => {
    it('retorna 0 no início da grade (07:00)', () => {
      expect(minutesToRowOffset(AGENDA_GRID_START_MIN)).toBe(0);
    });

    it('avança uma linha por slot de 30min', () => {
      expect(minutesToRowOffset(AGENDA_GRID_START_MIN + 30)).toBe(AGENDA_ROW_HEIGHT);
      expect(minutesToRowOffset(AGENDA_GRID_START_MIN + 90)).toBe(AGENDA_ROW_HEIGHT * 3);
    });
  });

  describe('formatMinutes', () => {
    it('formata como HH:mm com zero à esquerda', () => {
      expect(formatMinutes(9 * 60)).toBe('09:00');
      expect(formatMinutes(11 * 60 + 30)).toBe('11:30');
    });
  });

  describe('isWithinGrid', () => {
    it('é true dentro da janela 07:00–22:00', () => {
      expect(isWithinGrid(9 * 60)).toBe(true);
    });

    it('é false antes das 07:00 ou depois das 22:00', () => {
      expect(isWithinGrid(6 * 60)).toBe(false);
      expect(isWithinGrid(23 * 60)).toBe(false);
    });
  });

  describe('nowInMinutes', () => {
    it('converte horas e minutos de um Date em minutos desde a meia-noite', () => {
      const d = new Date(2026, 0, 1, 14, 45);
      expect(nowInMinutes(d)).toBe(14 * 60 + 45);
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx ng test arena --watch=false --include='**/agenda-grid-math.spec.ts'`
Expected: FAIL — `Cannot find module './agenda-grid-math'`.

- [ ] **Step 3: Implementar**

```ts
export const AGENDA_GRID_START_MIN = 7 * 60;
export const AGENDA_GRID_END_MIN = 22 * 60;
export const AGENDA_SLOT_MIN = 30;
export const AGENDA_ROW_HEIGHT = 34;

export function minutesToRowOffset(minutes: number): number {
  return ((minutes - AGENDA_GRID_START_MIN) / AGENDA_SLOT_MIN) * AGENDA_ROW_HEIGHT;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isWithinGrid(minutes: number): boolean {
  return minutes >= AGENDA_GRID_START_MIN && minutes <= AGENDA_GRID_END_MIN;
}

export function nowInMinutes(date: Date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx ng test arena --watch=false --include='**/agenda-grid-math.spec.ts'`
Expected: PASS — 6 specs, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/agenda-grid-math.ts \
  frontend/projects/arena/src/app/painel/ui/agenda-grid-math.spec.ts
git commit -m "feat(arena): função pura de posicionamento da grade de agenda, com testes"
```

---

## Task 10: `ar-agenda-grid`

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/agenda-grid.component.ts`

**Interfaces:**
- Consumes: `agenda-grid-math.ts` (Task 9) — `AGENDA_GRID_START_MIN`, `AGENDA_GRID_END_MIN`, `AGENDA_SLOT_MIN`, `AGENDA_ROW_HEIGHT`, `minutesToRowOffset`, `formatMinutes`, `isWithinGrid`, `nowInMinutes`.
- Produces: `AgendaGridComponent` (`ar-agenda-grid`), `export type AgendaBookingStatus = 'confirmada' | 'pendente' | 'manutencao'`, `export interface AgendaCourt { id: string; name: string; sport: string }`, `export interface AgendaBooking { courtId: string; start: number; dur: number; status: AgendaBookingStatus; client: string }`. Inputs: `courts` required `AgendaCourt[]`, `bookings` required `AgendaBooking[]`.

A "hora atual" é calculada uma única vez na construção do componente (`signal(nowInMinutes())`, sem `setInterval`) — o protótipo usa um valor fixo mock; aqui usamos a hora real do navegador, mas sem relógio ao vivo (não foi pedido e evitaria complexidade desnecessária). Fora da janela 07:00–22:00 a linha "agora" não aparece.

- [ ] **Step 1: Criar o componente**

```ts
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import {
  AGENDA_GRID_END_MIN,
  AGENDA_GRID_START_MIN,
  AGENDA_ROW_HEIGHT,
  AGENDA_SLOT_MIN,
  formatMinutes,
  isWithinGrid,
  minutesToRowOffset,
  nowInMinutes,
} from './agenda-grid-math';

export type AgendaBookingStatus = 'confirmada' | 'pendente' | 'manutencao';

export interface AgendaCourt {
  id: string;
  name: string;
  sport: string;
}

export interface AgendaBooking {
  courtId: string;
  start: number;
  dur: number;
  status: AgendaBookingStatus;
  client: string;
}

interface PositionedBooking extends AgendaBooking {
  top: number;
  height: number;
  label: string;
  timeLabel: string;
}

interface RowMark {
  offset: number;
  isHour: boolean;
  label: string;
}

/** Grade de quadras × horário (protótipo ArAgendaGrade), com blocos de reserva posicionados por cálculo. */
@Component({
  selector: 'ar-agenda-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="court-header">
        @for (c of courts(); track c.id) {
          <div class="court-head">
            <div class="court-name">{{ c.name }}</div>
            <div class="court-sport">{{ c.sport }}</div>
          </div>
        }
      </div>

      <div class="body">
        <div class="grid" [style.height.px]="gridHeight()">
          @for (row of rowMarks(); track row.offset) {
            @if (row.isHour) {
              <div class="hour-label" [style.top.px]="row.offset - 6">{{ row.label }}</div>
            }
            <div class="hour-line" [class.solid]="row.isHour" [style.top.px]="row.offset"></div>
          }

          <div class="columns">
            @for (c of courts(); track c.id) {
              <div class="column">
                @for (b of positionedByCourt()[c.id] ?? []; track b.start) {
                  <div class="block" [class]="'tone-' + b.status" [style.top.px]="b.top" [style.height.px]="b.height">
                    <div class="block-title">{{ b.label }}</div>
                    @if (b.height > 30) {
                      <div class="block-time">{{ b.timeLabel }}</div>
                    }
                  </div>
                }
              </div>
            }
          </div>

          @if (nowOffset() >= 0) {
            <div class="now-line" [style.top.px]="nowOffset()">
              <div class="now-line-bar"></div>
              <span class="now-line-dot"></span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .wrap {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .court-header {
      display: flex;
      padding-left: 52px;
      padding-bottom: 10px;
      flex: none;
    }

    .court-head {
      flex: 1;
      text-align: center;
    }

    .court-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .court-sport {
      font-family: var(--nx-font-ui);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .body::-webkit-scrollbar {
      display: none;
    }

    .grid {
      position: relative;
      padding-left: 52px;
    }

    .hour-label {
      position: absolute;
      left: 0;
      width: 42px;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 600;
      color: var(--nx-text-dim);
    }

    .hour-line {
      position: absolute;
      left: 52px;
      right: 0;
      border-top: 1px dotted var(--nx-line);
    }

    .hour-line.solid {
      border-top-style: solid;
    }

    .columns {
      position: absolute;
      top: 0;
      left: 52px;
      right: 0;
      bottom: 0;
      display: flex;
    }

    .column {
      flex: 1;
      position: relative;
      border-left: 1px solid var(--nx-line);
    }

    .block {
      position: absolute;
      left: 3px;
      right: 3px;
      box-sizing: border-box;
      border-radius: 8px;
      padding: 5px 8px;
      overflow: hidden;
      cursor: pointer;
      border: 1px solid;
    }

    .block.tone-confirmada {
      background: rgba(43, 209, 126, 0.12);
      border-color: rgba(43, 209, 126, 0.35);
      border-left: 3px solid var(--nx-win);
    }

    .block.tone-pendente {
      background: rgba(244, 197, 67, 0.12);
      border-color: rgba(244, 197, 67, 0.35);
      border-left: 3px solid var(--nx-pending);
    }

    .block.tone-manutencao {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.14);
      border-left: 3px solid var(--nx-text-dim);
    }

    .block-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 11.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .block-time {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .now-line {
      position: absolute;
      left: 42px;
      right: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      pointer-events: none;
    }

    .now-line-bar {
      flex: 1;
      height: 2px;
      background: var(--nx-live);
      box-shadow: 0 0 8px rgba(255, 59, 48, 0.6);
    }

    .now-line-dot {
      width: 7px;
      height: 7px;
      border-radius: 99px;
      background: var(--nx-live);
    }
  `,
})
export class AgendaGridComponent {
  readonly courts = input.required<AgendaCourt[]>();
  readonly bookings = input.required<AgendaBooking[]>();

  private readonly nowMinutes = signal(nowInMinutes());

  protected readonly rowCount = computed(
    () => (AGENDA_GRID_END_MIN - AGENDA_GRID_START_MIN) / AGENDA_SLOT_MIN,
  );

  protected readonly gridHeight = computed(() => this.rowCount() * AGENDA_ROW_HEIGHT + 10);

  protected readonly rowMarks = computed<RowMark[]>(() =>
    Array.from({ length: this.rowCount() }, (_, i) => {
      const minute = AGENDA_GRID_START_MIN + i * AGENDA_SLOT_MIN;
      return { offset: i * AGENDA_ROW_HEIGHT, isHour: minute % 60 === 0, label: formatMinutes(minute) };
    }),
  );

  protected readonly positionedByCourt = computed<Record<string, PositionedBooking[]>>(() => {
    const result: Record<string, PositionedBooking[]> = {};
    for (const b of this.bookings()) {
      const top = minutesToRowOffset(b.start) + 1;
      const height = (b.dur / AGENDA_SLOT_MIN) * AGENDA_ROW_HEIGHT - 3;
      const label = b.status === 'manutencao' ? 'Manutenção' : b.client;
      const timeLabel = `${formatMinutes(b.start)}–${formatMinutes(b.start + b.dur)}`;
      const positioned: PositionedBooking = { ...b, top, height, label, timeLabel };
      (result[b.courtId] ??= []).push(positioned);
    }
    return result;
  });

  /** -1 quando a hora atual está fora da janela 07:00–22:00 (linha "agora" não aparece). */
  protected readonly nowOffset = computed(() => {
    const minutes = this.nowMinutes();
    return isWithinGrid(minutes) ? minutesToRowOffset(minutes) : -1;
  });
}
```

- [ ] **Step 2: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/agenda-grid.component.ts
git commit -m "feat(arena): componente ar-agenda-grid (grade de quadras × horário)"
```

---

## Task 11: Tela Início (`ar-panel-home`)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/home/panel-home.component.ts`
- Delete: `frontend/projects/arena/src/app/painel/panel-home.component.ts` (placeholder antigo)
- Modify: `frontend/projects/arena/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `PanelShellComponent` (Task 8), `PageHeaderComponent`/`PanelCardComponent`/`KpiCardComponent`/`LineChartComponent`/`ChartTabsComponent`/`PillComponent`/`BarRowComponent`/`IconComponent` (Tasks 2–7), `initialsOf` (`../ui/initials`, Task 8), `AuthService`.
- Produces: `PanelHomeComponent` (`ar-panel-home`), rota `painel` (substitui a rota placeholder existente).

- [ ] **Step 1: Apagar o placeholder**

Run: `rm frontend/projects/arena/src/app/painel/panel-home.component.ts`

- [ ] **Step 2: Criar a nova tela**

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { BarRowComponent } from '../ui/bar-row.component';
import { ChartTabsComponent } from '../ui/chart-tabs.component';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { initialsOf } from '../ui/initials';

type ChartTab = 'Faturamento' | 'Reservas' | 'Ocupação';

interface OccupancyRow {
  label: string;
  sub: string;
  pct: number;
  tone: 'orange' | 'green' | 'yellow' | 'red';
}

type ReservationStatus = 'confirmada' | 'pendente' | 'checkin';

interface ReservationRow {
  time: string;
  court: string;
  client: string;
  sport: string;
  status: ReservationStatus;
}

interface TournamentMini {
  name: string;
  sport: string;
  date: string;
  inscritos: number;
  vagas: number;
}

interface ReviewRow {
  initials: string;
  name: string;
  rating: number;
  text: string;
  time: string;
}

interface Shortcut {
  icon: 'plus' | 'download' | 'trophy' | 'edit';
  label: string;
}

const CHART_DATA: Record<ChartTab, number[]> = {
  Faturamento: [820, 940, 880, 1120, 990, 1340, 1240],
  Reservas: [9, 11, 8, 14, 12, 16, 14],
  Ocupação: [58, 64, 60, 72, 66, 82, 78],
};

const CHART_DAYS = ['Qua', 'Qui', 'Sex', 'Sáb', 'Dom', 'Seg', 'Ter'];

const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  confirmada: 'Confirmada',
  pendente: 'Pendente',
  checkin: 'Check-in',
};

const RESERVATION_STATUS_TONE: Record<ReservationStatus, PillTone> = {
  confirmada: 'green',
  pendente: 'yellow',
  checkin: 'orange',
};

function greetingFor(hour: number): string {
  if (hour < 12) {
    return 'Bom dia';
  }
  if (hour < 18) {
    return 'Boa tarde';
  }
  return 'Boa noite';
}

/** Tela Início do painel (protótipo ArInicioScreen): KPIs, gráfico, ocupação, reservas do dia, torneios e avaliações. */
@Component({
  selector: 'ar-panel-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiCardComponent,
    LineChartComponent,
    ChartTabsComponent,
    PillComponent,
    BarRowComponent,
    IconComponent,
  ],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="greetingTitle()" [subtitle]="subtitleLabel()">
        <div class="header-actions">
          <div class="ar-search-box">
            <ar-icon name="search" [size]="15" />
            <span>Buscar…</span>
            <span class="kbd">⌘K</span>
          </div>
          <button type="button" class="ar-bell-btn" aria-label="Notificações">
            <ar-icon name="bell" [size]="17" />
            <span class="dot" aria-hidden="true"></span>
          </button>
          <div class="avatar" aria-hidden="true">{{ initials() }}</div>
        </div>
      </ar-page-header>

      <div class="body">
        <div class="kpi-row">
          <ar-kpi-card label="Ocupação das quadras" value="78%" delta="6pp" icon="courts" />
          <ar-kpi-card label="Faturamento hoje" value="R$ 1.240" delta="14%" />
          <ar-kpi-card label="Reservas hoje" value="14" delta="2 pendentes" deltaTone="orange" />
          <ar-kpi-card label="Torneios ativos" value="2" delta="38 inscritos" deltaTone="flat" icon="trophy" />
          <ar-kpi-card label="Avaliação média" value="4.8" delta="23 avaliações" deltaTone="flat" icon="star" />
        </div>

        <div class="main-grid">
          <div class="col-left">
            <ar-panel-card kicker="Últimos 7 dias" title="Desempenho da operação" class="chart-card">
              <ar-chart-tabs [tabs]="chartTabs" [active]="chartTab()" (change)="chartTab.set($any($event))" card-actions />
              <ar-line-chart [height]="118" [data]="activeChartData()" [labels]="chartDays" />
            </ar-panel-card>

            <ar-panel-card title="Ocupação por quadra" class="bars-card">
              <button type="button" class="ar-ghost-btn" card-actions>Ver quadras</button>
              <div class="bars">
                @for (row of occupancy; track row.label; let last = $last) {
                  <ar-bar-row [label]="row.label" [sub]="row.sub" [pct]="row.pct" [tone]="row.tone" [last]="last" />
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Reservas de hoje" class="reservations-card">
              <button type="button" class="ar-ghost-btn" card-actions>Ver agenda</button>
              <div class="list">
                @for (r of reservations; track r.time) {
                  <div class="reservation-row">
                    <div class="reservation-time">{{ r.time }}</div>
                    <div class="reservation-body">
                      <div class="reservation-title">{{ r.court }} · {{ r.client }}</div>
                      <div class="reservation-sport">{{ r.sport }}</div>
                    </div>
                    <ar-pill [tone]="statusTone[r.status]">{{ statusLabel[r.status] }}</ar-pill>
                  </div>
                }
              </div>
            </ar-panel-card>
          </div>

          <div class="col-right">
            <ar-panel-card pad="sm" title="Torneios ativos">
              <button type="button" class="ar-ghost-btn" card-actions>Ver todos</button>
              <div class="list">
                @for (t of tournaments; track t.name) {
                  <div class="tournament-row">
                    <div class="tournament-icon">
                      <ar-icon name="trophy" [size]="17" />
                    </div>
                    <div class="tournament-body">
                      <div class="tournament-title">{{ t.name }}</div>
                      <div class="tournament-meta">{{ t.sport }} · {{ t.date }}</div>
                    </div>
                    <div class="tournament-stats">
                      <div class="tournament-count">{{ t.inscritos }}/{{ t.vagas }}</div>
                      <div class="tournament-pct">{{ pctFull(t) }}% cheio</div>
                    </div>
                  </div>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card pad="sm" title="Avaliações recentes" class="reviews-card">
              <ar-pill tone="orange" card-actions>4.8 ★</ar-pill>
              <div class="list">
                @for (rv of reviews; track rv.name) {
                  <div class="review-row">
                    <div class="review-avatar">{{ rv.initials }}</div>
                    <div class="review-body">
                      <div class="review-head">
                        <span class="review-name">{{ rv.name }}</span>
                        <span class="review-stars">
                          @for (i of starIndexes; track i) {
                            <ar-icon name="star" [size]="10" [style.color]="i < rv.rating ? 'var(--nx-orange-500)' : 'var(--nx-line-strong)'" />
                          }
                        </span>
                      </div>
                      <div class="review-text">{{ rv.text }}</div>
                    </div>
                    <span class="review-time">{{ rv.time }}</span>
                  </div>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card pad="sm" title="Atalhos">
              <div class="shortcuts-grid">
                @for (s of shortcuts; track s.label) {
                  <div class="ar-shortcut">
                    <ar-icon [name]="s.icon" [size]="16" />
                    <span>{{ s.label }}</span>
                  </div>
                }
              </div>
            </ar-panel-card>
          </div>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-orange-500);
    }

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
      flex: none;
    }

    .main-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 372px;
      gap: 16px;
      min-height: 0;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    .bars-card,
    .chart-card {
      flex: none;
    }

    .reservations-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .reviews-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .bars {
      margin-top: -4px;
    }

    .list {
      display: flex;
      flex-direction: column;
      margin-top: -6px;
    }

    .reservation-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .reservation-row:last-child {
      border-bottom: none;
    }

    .reservation-time {
      width: 50px;
      flex: none;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .reservation-body {
      flex: 1;
      min-width: 0;
    }

    .reservation-title {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }

    .reservation-sport {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .tournament-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .tournament-row:last-child {
      border-bottom: none;
    }

    .tournament-icon {
      width: 38px;
      height: 38px;
      border-radius: var(--nx-r-2);
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }

    .tournament-body {
      flex: 1;
      min-width: 0;
    }

    .tournament-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .tournament-meta {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .tournament-stats {
      text-align: right;
      flex: none;
    }

    .tournament-count {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .tournament-pct {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .review-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .review-row:last-child {
      border-bottom: none;
    }

    .review-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      flex: none;
      margin-top: 1px;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 9.5px;
      color: var(--nx-orange-500);
    }

    .review-body {
      flex: 1;
      min-width: 0;
    }

    .review-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .review-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .review-stars {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }

    .review-text {
      font-size: 12px;
      line-height: 1.45;
      color: var(--nx-text-mute);
      margin-top: 3px;
    }

    .review-time {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      flex: none;
      margin-top: 2px;
    }

    .shortcuts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    @media (max-width: 1180px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .kpi-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelHomeComponent {
  private readonly auth = inject(AuthService);

  protected readonly chartTabs: ChartTab[] = ['Faturamento', 'Reservas', 'Ocupação'];
  protected readonly chartTab = signal<ChartTab>('Faturamento');
  protected readonly chartDays = CHART_DAYS;
  protected readonly activeChartData = computed(() => CHART_DATA[this.chartTab()]);

  protected readonly statusLabel = RESERVATION_STATUS_LABEL;
  protected readonly statusTone = RESERVATION_STATUS_TONE;
  protected readonly starIndexes = [0, 1, 2, 3, 4];

  protected readonly occupancy: OccupancyRow[] = [
    { label: 'Quadra 1', sub: 'Beach Tennis', pct: 92, tone: 'green' },
    { label: 'Quadra 2', sub: 'Vôlei de praia', pct: 84, tone: 'orange' },
    { label: 'Quadra 3', sub: 'Beach Soccer · manutenção', pct: 0, tone: 'red' },
  ];

  protected readonly reservations: ReservationRow[] = [
    { time: '09:00', court: 'Quadra 1', client: 'João S.', sport: 'Beach Tennis', status: 'confirmada' },
    { time: '10:00', court: 'Quadra 2', client: 'Maria T.', sport: 'Vôlei de praia', status: 'checkin' },
    { time: '11:30', court: 'Quadra 1', client: 'Enzo R.', sport: 'Beach Tennis', status: 'pendente' },
    { time: '14:00', court: 'Quadra 2', client: 'Camila S.', sport: 'Vôlei de praia', status: 'confirmada' },
  ];

  protected readonly tournaments: TournamentMini[] = [
    { name: 'Etapa garden', sport: 'Beach Tennis', date: '21/07', inscritos: 18, vagas: 24 },
    { name: 'Copa Goiás Beach', sport: 'Vôlei de praia', date: '04/08', inscritos: 20, vagas: 32 },
  ];

  protected readonly reviews: ReviewRow[] = [
    { initials: 'JS', name: 'João S.', rating: 5, text: 'Quadra muito bem cuidada, iluminação ótima à noite.', time: 'Hoje' },
    { initials: 'MT', name: 'Maria T.', rating: 4, text: 'Bom atendimento, só o estacionamento é apertado.', time: 'Ontem' },
    { initials: 'ER', name: 'Enzo R.', rating: 5, text: 'Melhor arena da região, sempre reservo aqui.', time: '2 dias' },
  ];

  protected readonly shortcuts: Shortcut[] = [
    { icon: 'plus', label: 'Nova reserva' },
    { icon: 'download', label: 'Solicitar saque' },
    { icon: 'trophy', label: 'Criar torneio' },
    { icon: 'edit', label: 'Editar perfil' },
  ];

  protected readonly greetingTitle = computed(() => {
    const source = this.auth.displayName() || this.auth.user()?.email || '';
    const firstName = source.split(/[\s@.]/)[0] || '';
    const greeting = greetingFor(new Date().getHours());
    return firstName ? `${greeting}, ${firstName}.` : `${greeting}.`;
  });

  protected readonly subtitleLabel = computed(() => {
    const arenaName = this.auth.displayName() || 'Arena';
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(now).replace('.', '');
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(now).replace('.', '');
    return `${arenaName} · ${weekday} · ${date}`;
  });

  protected readonly initials = computed(() => initialsOf(this.auth.displayName() || this.auth.user()?.email || '·'));

  protected pctFull(t: TournamentMini): number {
    return Math.round((t.inscritos / t.vagas) * 100);
  }
}
```

Nota sobre `(change)="chartTab.set($any($event))"`: o `output<string>()` do `ar-chart-tabs` emite `string`, mas `chartTab` é `WritableSignal<ChartTab>` (união literal). `$any(...)` evita o erro de tipo do template sem enfraquecer o tipo do signal em si — a lista de abas (`chartTabs`) já garante em runtime que só valores de `ChartTab` são emitidos.

- [ ] **Step 3: Atualizar a rota em `app.routes.ts`**

Abra `frontend/projects/arena/src/app/app.routes.ts` e troque a rota `painel` existente:

```ts
  {
    path: 'painel',
    title: 'Painel — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/panel-home.component').then((m) => m.PanelHomeComponent),
  },
```

por:

```ts
  {
    path: 'painel',
    title: 'Painel — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/home/panel-home.component').then((m) => m.PanelHomeComponent),
  },
```

- [ ] **Step 4: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 5: Smoke test manual**

Run: `cd frontend && npx ng serve arena` e abrir `http://localhost:4200/painel` logado. Esperado: sidebar com nav de 7 itens (Início ativo), header com saudação real + busca/sino/avatar, 5 KPIs, gráfico com abas funcionais (clicar troca o dado), ocupação por quadra, reservas de hoje, torneios ativos, avaliações com estrelas, atalhos 2×2.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/arena/src/app/painel/home/panel-home.component.ts \
  frontend/projects/arena/src/app/app.routes.ts
git rm frontend/projects/arena/src/app/painel/panel-home.component.ts
git commit -m "feat(arena): tela Início do painel (ar-panel-home), substitui o placeholder"
```

---

## Task 12: Tela Agenda (`ar-panel-agenda`)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/agenda/panel-agenda.component.ts`
- Modify: `frontend/projects/arena/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `PanelShellComponent`, `PageHeaderComponent`, `PanelCardComponent`, `ChartTabsComponent`, `PillComponent`, `IconComponent` (Tasks 2–8), `AgendaGridComponent`/`AgendaCourt`/`AgendaBooking` (Task 10).
- Produces: `PanelAgendaComponent` (`ar-panel-agenda`), rota `painel/agenda`.

- [ ] **Step 1: Criar a tela**

```ts
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { AgendaGridComponent, type AgendaBooking, type AgendaCourt } from '../ui/agenda-grid.component';
import { ChartTabsComponent } from '../ui/chart-tabs.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type AgendaView = 'Dia' | 'Semana';
type ListFilter = 'todas' | 'confirmada' | 'pendente' | 'manutencao';

interface AgendaListRow {
  time: string;
  court: string;
  client: string;
  sport: string;
  status: 'confirmada' | 'pendente' | 'manutencao';
}

const LIST_FILTERS: { id: ListFilter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'confirmada', label: 'Confirmadas' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'manutencao', label: 'Bloqueios' },
];

const STATUS_LABEL: Record<AgendaListRow['status'], string> = {
  confirmada: 'Confirmada',
  pendente: 'Pendente',
  manutencao: 'Manutenção',
};

const STATUS_TONE: Record<AgendaListRow['status'], PillTone> = {
  confirmada: 'green',
  pendente: 'yellow',
  manutencao: 'dim',
};

/** Tela Agenda do painel (protótipo ArAgendaScreen): grade de quadras + lista lateral filtrável. */
@Component({
  selector: 'ar-panel-agenda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, ChartTabsComponent, PillComponent, IconComponent, AgendaGridComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Agenda de quadras" [subtitle]="subtitleLabel()">
        <div class="header-actions">
          <ar-chart-tabs [tabs]="views" [active]="view()" (change)="view.set($any($event))" />
          <button type="button" class="ar-mini-btn ar-mini-btn-primary">
            <ar-icon name="plus" [size]="14" />
            Nova reserva
          </button>
        </div>
      </ar-page-header>

      <div class="body">
        <ar-panel-card class="grid-card">
          <ar-agenda-grid [courts]="courts" [bookings]="bookings" />
        </ar-panel-card>

        <ar-panel-card title="Reservas de hoje" [kicker]="listKicker()" class="list-card">
          <div class="ar-filter-bar" card-actions>
            @for (f of filters; track f.id) {
              <button type="button" class="ar-chip" [class.active]="filter() === f.id" (click)="filter.set(f.id)">
                {{ f.label }}
              </button>
            }
          </div>
          <div class="list">
            @for (r of filteredList(); track r.time + r.court) {
              <div class="agenda-row">
                <div class="agenda-time">{{ r.time }}</div>
                <div class="agenda-body">
                  <div class="agenda-title">{{ r.court }}{{ r.client ? ' · ' + r.client : '' }}</div>
                  <div class="agenda-sport">{{ r.sport }}</div>
                </div>
                <ar-pill [tone]="statusTone[r.status]">{{ statusLabel[r.status] }}</ar-pill>
              </div>
            }
          </div>
        </ar-panel-card>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
      min-height: 0;
    }

    .grid-card {
      min-height: 0;
      overflow: hidden;
    }

    .list-card {
      min-height: 0;
      overflow: hidden;
    }

    .list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
      margin-top: 2px;
    }

    .list::-webkit-scrollbar {
      display: none;
    }

    .agenda-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .agenda-row:last-child {
      border-bottom: none;
    }

    .agenda-time {
      width: 46px;
      flex: none;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .agenda-body {
      flex: 1;
      min-width: 0;
    }

    .agenda-title {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .agenda-sport {
      font-size: 11px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelAgendaComponent {
  protected readonly views: AgendaView[] = ['Dia', 'Semana'];
  protected readonly view = signal<AgendaView>('Dia');

  protected readonly filters = LIST_FILTERS;
  protected readonly filter = signal<ListFilter>('todas');
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  protected readonly courts: AgendaCourt[] = [
    { id: 'q1', name: 'Quadra 1', sport: 'Beach Tennis' },
    { id: 'q2', name: 'Quadra 2', sport: 'Vôlei de praia' },
    { id: 'q3', name: 'Quadra 3', sport: 'Beach Soccer' },
  ];

  protected readonly bookings: AgendaBooking[] = [
    { courtId: 'q1', start: 9 * 60, dur: 60, status: 'confirmada', client: 'João S.' },
    { courtId: 'q1', start: 11 * 60 + 30, dur: 60, status: 'pendente', client: 'Enzo R.' },
    { courtId: 'q1', start: 16 * 60, dur: 90, status: 'confirmada', client: 'Bruno V.' },
    { courtId: 'q2', start: 10 * 60, dur: 60, status: 'confirmada', client: 'Maria T.' },
    { courtId: 'q2', start: 14 * 60, dur: 60, status: 'confirmada', client: 'Camila S.' },
    { courtId: 'q2', start: 18 * 60, dur: 60, status: 'pendente', client: 'Júlia P.' },
    { courtId: 'q3', start: 7 * 60, dur: 15 * 60, status: 'manutencao', client: '' },
  ];

  private readonly allList: AgendaListRow[] = [
    { time: '09:00', court: 'Quadra 1', client: 'João S.', sport: 'Beach Tennis', status: 'confirmada' },
    { time: '10:00', court: 'Quadra 2', client: 'Maria T.', sport: 'Vôlei de praia', status: 'confirmada' },
    { time: '11:30', court: 'Quadra 1', client: 'Enzo R.', sport: 'Beach Tennis', status: 'pendente' },
    { time: '14:00', court: 'Quadra 2', client: 'Camila S.', sport: 'Vôlei de praia', status: 'confirmada' },
    { time: '16:00', court: 'Quadra 1', client: 'Bruno V.', sport: 'Beach Tennis', status: 'confirmada' },
    { time: '18:00', court: 'Quadra 2', client: 'Júlia P.', sport: 'Vôlei de praia', status: 'pendente' },
    { time: '07:00', court: 'Quadra 3', client: '', sport: 'Beach Soccer', status: 'manutencao' },
  ];

  protected readonly filteredList = computed(() => {
    const f = this.filter();
    return f === 'todas' ? this.allList : this.allList.filter((r) => r.status === f);
  });

  protected readonly listKicker = computed(() => `${this.filteredList().length} de ${this.allList.length}`);

  protected readonly subtitleLabel = computed(() => {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(now).replace('.', '');
    const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(now).replace('.', '');
    return `${weekday} · ${date}`;
  });
}
```

- [ ] **Step 2: Adicionar a rota**

Em `frontend/projects/arena/src/app/app.routes.ts`, adicione logo depois da rota `painel`:

```ts
  {
    path: 'painel/agenda',
    title: 'Agenda — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/agenda/panel-agenda.component').then((m) => m.PanelAgendaComponent),
  },
```

- [ ] **Step 3: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 4: Smoke test manual**

Run: `cd frontend && npx ng serve arena` e abrir `http://localhost:4200/painel/agenda`. Esperado: grade de quadras à esquerda com blocos coloridos por status e linha "agora" (se dentro de 07:00–22:00), lista lateral com chips de filtro funcionando.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/agenda/panel-agenda.component.ts \
  frontend/projects/arena/src/app/app.routes.ts
git commit -m "feat(arena): tela Agenda do painel (ar-panel-agenda)"
```

---

## Task 13: Tela Financeiro (`ar-panel-finance`)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/finance/panel-finance.component.ts`
- Modify: `frontend/projects/arena/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `PanelShellComponent`, `PageHeaderComponent`, `PanelCardComponent`, `LineChartComponent`, `BarRowComponent`, `PillComponent`, `IconComponent` (Tasks 2–8), `AuthService`.
- Produces: `PanelFinanceComponent` (`ar-panel-finance`), rota `painel/financeiro`.

- [ ] **Step 1: Criar a tela**

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { BarRowComponent } from '../ui/bar-row.component';
import { IconComponent } from '../ui/icon.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type TxType = 'in' | 'out';
type TxStatus = 'ok' | 'sent' | 'pend' | 'fail';
type TxFilter = 'all' | TxType;

interface Transaction {
  id: number;
  type: TxType;
  amount: number;
  label: string;
  sub: string;
  date: string;
  status: TxStatus;
}

interface FinanceSummary {
  label: string;
  labelTone: 'orange' | 'dim';
  value: string;
  valueTone: 'text' | 'pending';
  caption: string;
  captionTone: 'dim' | 'green';
}

const TX_STATUS_LABEL: Record<TxStatus, string> = {
  ok: 'Recebido',
  sent: 'Enviado',
  pend: 'Pendente',
  fail: 'Falhou',
};

const TX_STATUS_TONE: Record<TxStatus, PillTone> = {
  ok: 'green',
  sent: 'green',
  pend: 'yellow',
  fail: 'red',
};

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/** Tela Financeiro do painel (protótipo ArFinanceiroScreen): saldo, faturamento, movimentações e saque. */
@Component({
  selector: 'ar-panel-finance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, LineChartComponent, BarRowComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Financeiro" [subtitle]="arenaName() + ' · saldo e movimentações'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary">
          <ar-icon name="download" [size]="14" />
          Exportar extrato
        </button>
      </ar-page-header>

      <div class="body">
        <div class="summary-row">
          @for (s of summaries; track s.label) {
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label" [class]="'tone-' + s.labelTone">{{ s.label }}</div>
              <div class="summary-value" [class]="'tone-' + s.valueTone">{{ s.value }}</div>
              <div class="summary-caption" [class]="'tone-' + s.captionTone">{{ s.caption }}</div>
            </ar-panel-card>
          }
        </div>

        <div class="main-grid">
          <div class="col-left">
            <ar-panel-card kicker="Últimos 7 dias" title="Faturamento" class="chart-card">
              <ar-line-chart [height]="110" [data]="revenueData" [labels]="revenueDays" />
            </ar-panel-card>

            <ar-panel-card title="Movimentações" [kicker]="listKicker()" class="tx-card">
              <div class="ar-filter-bar" card-actions>
                <button type="button" class="ar-chip" [class.active]="filter() === 'all'" (click)="filter.set('all')">Todos</button>
                <button type="button" class="ar-chip" [class.active]="filter() === 'in'" (click)="filter.set('in')">Recebimentos</button>
                <button type="button" class="ar-chip" [class.active]="filter() === 'out'" (click)="filter.set('out')">Saques</button>
              </div>

              <div class="tx-head">
                <span></span>
                <span>Descrição</span>
                <span>Detalhe</span>
                <span>Data</span>
                <span>Status</span>
                <span class="right">Valor</span>
              </div>
              <div class="tx-list">
                @for (tx of filteredTx(); track tx.id) {
                  <div class="tx-row">
                    <div class="tx-icon" [class.in]="tx.type === 'in'">
                      @if (tx.type === 'in') {
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M12 5v14" /><path d="M5 12l7 7 7-7" />
                        </svg>
                      } @else {
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
                        </svg>
                      }
                    </div>
                    <div class="tx-label">{{ tx.label }}</div>
                    <div class="tx-sub">{{ tx.sub }}</div>
                    <div class="tx-date">{{ tx.date }}</div>
                    <div><ar-pill [tone]="statusTone[tx.status]">{{ statusLabel[tx.status] }}</ar-pill></div>
                    <div class="tx-amount right" [class.in]="tx.type === 'in'">
                      {{ tx.type === 'in' ? '+' : '−' }}{{ formatBRL(tx.amount) }}
                    </div>
                  </div>
                }
              </div>
            </ar-panel-card>
          </div>

          <div class="col-right">
            <ar-panel-card pad="sm" title="Solicitar saque">
              <div class="field-label">Valor</div>
              <div class="amount-field">
                <span>R$ 0,00</span>
                <ar-pill tone="orange">Sacar tudo</ar-pill>
              </div>
              <div class="field-label">Chave PIX</div>
              <div class="pix-field">9b1213f1-3790…</div>
              <button type="button" class="ar-mini-btn ar-mini-btn-primary">Solicitar saque</button>
            </ar-panel-card>

            <ar-panel-card pad="sm" title="Recebimento por quadra">
              <div class="bars">
                @for (row of byCourt; track row.label; let last = $last) {
                  <ar-bar-row [label]="row.label" [sub]="row.sub" [pct]="row.pct" tone="orange" [last]="last" />
                }
              </div>
            </ar-panel-card>
          </div>
        </div>
      </div>
    </ar-panel-shell>
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

    .summary-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .summary-card {
      flex: 1;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .summary-label.tone-orange {
      color: var(--nx-orange-500);
    }

    .summary-label.tone-dim {
      color: var(--nx-text-dim);
    }

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 30px;
      letter-spacing: -0.02em;
      margin-top: 8px;
    }

    .summary-value.tone-text {
      color: var(--nx-text);
    }

    .summary-value.tone-pending {
      color: var(--nx-pending);
    }

    .summary-caption {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      margin-top: 6px;
    }

    .summary-caption.tone-dim {
      color: var(--nx-text-dim);
    }

    .summary-caption.tone-green {
      color: var(--nx-win);
    }

    .main-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 16px;
      min-height: 0;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .col-left {
      min-height: 0;
      overflow: hidden;
    }

    .chart-card {
      flex: none;
    }

    .tx-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .tx-head,
    .tx-row {
      display: grid;
      grid-template-columns: 40px 1.3fr 1fr 88px 96px 90px;
      gap: 12px;
      align-items: center;
    }

    .tx-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .tx-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .tx-head span.right {
      text-align: right;
    }

    .tx-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .tx-list::-webkit-scrollbar {
      display: none;
    }

    .tx-row {
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .tx-row:last-child {
      border-bottom: none;
    }

    .tx-icon {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-dim);
    }

    .tx-icon.in {
      background: rgba(43, 209, 126, 0.1);
      border-color: rgba(43, 209, 126, 0.24);
      color: var(--nx-win);
    }

    .tx-label {
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tx-sub {
      min-width: 0;
      font-size: 12px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tx-date {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    .tx-amount {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .tx-amount.in {
      color: var(--nx-win);
    }

    .right {
      text-align: right;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 6px;
    }

    .amount-field {
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      padding: 0 12px;
      margin-bottom: 12px;
    }

    .amount-field span {
      flex: 1;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 16px;
      color: var(--nx-text-dim);
    }

    .pix-field {
      height: 40px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      padding: 0 12px;
      margin-bottom: 14px;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-mute);
    }

    .bars {
      margin-top: -4px;
    }

    @media (max-width: 1180px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .summary-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelFinanceComponent {
  private readonly auth = inject(AuthService);

  protected readonly formatBRL = formatBRL;
  protected readonly statusLabel = TX_STATUS_LABEL;
  protected readonly statusTone = TX_STATUS_TONE;

  protected readonly filter = signal<TxFilter>('all');

  protected readonly revenueData = [820, 940, 880, 1120, 990, 1340, 1240];
  protected readonly revenueDays = ['Qua', 'Qui', 'Sex', 'Sáb', 'Dom', 'Seg', 'Ter'];

  protected readonly summaries: FinanceSummary[] = [
    { label: 'Saldo disponível', labelTone: 'orange', value: formatBRL(2340), valueTone: 'text', caption: 'Próx. repasse · 15 Jul', captionTone: 'dim' },
    { label: 'Recebido no mês', labelTone: 'dim', value: formatBRL(6820), valueTone: 'text', caption: '↑ 12% vs mês anterior', captionTone: 'green' },
    { label: 'Taxa da plataforma', labelTone: 'dim', value: '6%', valueTone: 'text', caption: `${formatBRL(409)} retidos no mês`, captionTone: 'dim' },
    { label: 'Pendências', labelTone: 'dim', value: '1', valueTone: 'pending', caption: `${formatBRL(48)} aguardando pagamento`, captionTone: 'dim' },
  ];

  protected readonly byCourt = [
    { label: 'Quadra 1', sub: 'Beach Tennis', pct: 48 },
    { label: 'Quadra 2', sub: 'Vôlei de praia', pct: 40 },
    { label: 'Quadra 3', sub: 'Beach Soccer', pct: 12 },
  ];

  private readonly transactions: Transaction[] = [
    { id: 1, type: 'in', amount: 98, label: 'Reserva · Quadra 1', sub: 'João S. · Beach Tennis', date: 'Hoje, 09:12', status: 'ok' },
    { id: 2, type: 'in', amount: 60, label: 'Reserva · Quadra 2', sub: 'Maria T. · Vôlei de praia', date: 'Hoje, 08:40', status: 'ok' },
    { id: 3, type: 'out', amount: 150, label: 'Saque PIX', sub: 'Chave aleatória · …462f4', date: 'Ontem, 14:00', status: 'sent' },
    { id: 4, type: 'in', amount: 48, label: 'Reserva · Quadra 1', sub: 'Enzo R. · Beach Tennis', date: 'Ontem, 16:45', status: 'pend' },
    { id: 5, type: 'in', amount: 72, label: 'Reserva · Quadra 2', sub: 'Camila S. · Vôlei de praia', date: '25 jun, 09:15', status: 'ok' },
    { id: 6, type: 'out', amount: 60, label: 'Saque PIX', sub: 'Chave aleatória · …9835', date: '23 jun, 08:00', status: 'fail' },
  ];

  protected readonly filteredTx = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.transactions : this.transactions.filter((t) => t.type === f);
  });

  protected readonly listKicker = computed(() => `${this.filteredTx().length} lançamentos`);

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');
}
```

- [ ] **Step 2: Adicionar a rota**

Em `frontend/projects/arena/src/app/app.routes.ts`, adicione depois da rota `painel/agenda`:

```ts
  {
    path: 'painel/financeiro',
    title: 'Financeiro — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/finance/panel-finance.component').then((m) => m.PanelFinanceComponent),
  },
```

- [ ] **Step 3: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 4: Smoke test manual**

Run: `cd frontend && npx ng serve arena` e abrir `http://localhost:4200/painel/financeiro`. Esperado: 4 cards de resumo, gráfico de faturamento, tabela de movimentações com filtro por chip funcionando, card de saque e recebimento por quadra.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/finance/panel-finance.component.ts \
  frontend/projects/arena/src/app/app.routes.ts
git commit -m "feat(arena): tela Financeiro do painel (ar-panel-finance)"
```

---

## Task 14: Tela Torneios (`ar-panel-tournaments`)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/tournaments/panel-tournaments.component.ts`
- Modify: `frontend/projects/arena/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `PanelShellComponent`, `PageHeaderComponent`, `PanelCardComponent`, `ChartTabsComponent`, `PillComponent`, `IconComponent` (Tasks 2–8), `AuthService`.
- Produces: `PanelTournamentsComponent` (`ar-panel-tournaments`), rota `painel/torneios`.

- [ ] **Step 1: Criar a tela**

Os rótulos das abas são `'ativos'`/`'encerrados'` em minúsculo mesmo — é o texto literal usado no protótipo (`ArChartTabs tabs={['ativos','encerrados']}`), não uma inconsistência a corrigir.

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { ChartTabsComponent } from '../ui/chart-tabs.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type TournamentStatus = 'inscricoes' | 'andamento' | 'concluido';
type TournamentTab = 'ativos' | 'encerrados';

interface Tournament {
  name: string;
  sport: string;
  date: string;
  status: TournamentStatus;
  inscritos: number;
  vagas: number;
  receita: number;
}

const STATUS_LABEL: Record<TournamentStatus, string> = {
  inscricoes: 'Inscrições abertas',
  andamento: 'Em andamento',
  concluido: 'Concluído',
};

const STATUS_TONE: Record<TournamentStatus, PillTone> = {
  inscricoes: 'orange',
  andamento: 'green',
  concluido: 'dim',
};

const TOURNAMENTS: Tournament[] = [
  { name: 'Etapa garden', sport: 'Beach Tennis', date: '21 Jul', status: 'inscricoes', inscritos: 18, vagas: 24, receita: 1080 },
  { name: 'Copa Goiás Beach', sport: 'Vôlei de praia', date: '04 Ago', status: 'inscricoes', inscritos: 20, vagas: 32, receita: 1400 },
  { name: 'Desafio de Verão', sport: 'Beach Soccer', date: '14 Jun', status: 'concluido', inscritos: 16, vagas: 16, receita: 960 },
  { name: 'Torneio de Abertura', sport: 'Beach Tennis', date: '02 Mai', status: 'concluido', inscritos: 12, vagas: 16, receita: 720 },
];

/** Tela Torneios do painel (protótipo ArTorneiosScreen): KPIs, abas e grid de cards. */
@Component({
  selector: 'ar-panel-tournaments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, ChartTabsComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Torneios & eventos" [subtitle]="arenaName() + ' · competições organizadas na casa'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary">
          <ar-icon name="plus" [size]="14" />
          Criar torneio
        </button>
      </ar-page-header>

      <div class="body">
        <div class="kpi-row">
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Torneios ativos</div>
            <div class="kpi-value">{{ activeCount() }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Inscritos no total</div>
            <div class="kpi-value">{{ totalEnrolled() }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Arrecadado (ano)</div>
            <div class="kpi-value">R$ {{ totalRevenue().toLocaleString('pt-BR') }}</div>
          </ar-panel-card>
        </div>

        <ar-chart-tabs [tabs]="tabs" [active]="tab()" (change)="tab.set($any($event))" />

        <div class="grid-wrap">
          <div class="grid">
            @for (t of list(); track t.name) {
              <div class="card">
                <div class="card-head">
                  <div class="card-icon">
                    <ar-icon name="trophy" [size]="19" />
                  </div>
                  <ar-pill [tone]="statusTone[t.status]">{{ statusLabel[t.status] }}</ar-pill>
                </div>
                <div>
                  <div class="card-title">{{ t.name }}</div>
                  <div class="card-meta">{{ t.sport }} · {{ t.date }}</div>
                </div>
                <div>
                  <div class="progress-head">
                    <span>Inscritos</span>
                    <span class="progress-count">{{ t.inscritos }}/{{ t.vagas }}</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" [style.width.%]="pct(t)"></div>
                  </div>
                </div>
                <div class="card-foot">
                  <div>
                    <div class="foot-label">Arrecadado</div>
                    <div class="foot-value">R$ {{ t.receita.toLocaleString('pt-BR') }}</div>
                  </div>
                  <button type="button" class="ar-ghost-btn">Gerenciar</button>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: hidden;
    }

    .kpi-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .kpi-card {
      flex: 1;
    }

    .kpi-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .kpi-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .grid-wrap {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .grid-wrap::-webkit-scrollbar {
      display: none;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .card-icon {
      width: 42px;
      height: 42px;
      border-radius: var(--nx-r-2);
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }

    .card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }

    .card-meta {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }

    .progress-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .progress-head span {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .progress-count {
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .progress-track {
      height: 6px;
      border-radius: 3px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      border-radius: 3px;
      background: var(--nx-orange-500);
    }

    .card-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 10px;
      border-top: 1px solid var(--nx-line);
    }

    .foot-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .foot-value {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin-top: 2px;
    }

    @media (max-width: 1180px) {
      .grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 720px) {
      .grid {
        grid-template-columns: 1fr;
      }

      .kpi-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelTournamentsComponent {
  private readonly auth = inject(AuthService);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly tabs: TournamentTab[] = ['ativos', 'encerrados'];
  protected readonly tab = signal<TournamentTab>('ativos');

  private readonly tournaments = TOURNAMENTS;

  protected readonly list = computed(() =>
    this.tab() === 'ativos'
      ? this.tournaments.filter((t) => t.status !== 'concluido')
      : this.tournaments.filter((t) => t.status === 'concluido'),
  );

  protected readonly activeCount = computed(() => this.tournaments.filter((t) => t.status !== 'concluido').length);
  protected readonly totalEnrolled = computed(() => this.tournaments.reduce((sum, t) => sum + t.inscritos, 0));
  protected readonly totalRevenue = computed(() => this.tournaments.reduce((sum, t) => sum + t.receita, 0));

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected pct(t: Tournament): number {
    return Math.round((t.inscritos / t.vagas) * 100);
  }
}
```

- [ ] **Step 2: Adicionar a rota**

Em `frontend/projects/arena/src/app/app.routes.ts`, adicione depois da rota `painel/financeiro`:

```ts
  {
    path: 'painel/torneios',
    title: 'Torneios — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/tournaments/panel-tournaments.component').then((m) => m.PanelTournamentsComponent),
  },
```

- [ ] **Step 3: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 4: Smoke test manual**

Run: `cd frontend && npx ng serve arena` e abrir `http://localhost:4200/painel/torneios`. Esperado: 3 KPIs, abas ativos/encerrados trocando a lista, grid de 3 colunas de cards.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/tournaments/panel-tournaments.component.ts \
  frontend/projects/arena/src/app/app.routes.ts
git commit -m "feat(arena): tela Torneios do painel (ar-panel-tournaments)"
```

---

## Task 15: Tela Quadras (`ar-panel-courts`)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/courts/panel-courts.component.ts`
- Modify: `frontend/projects/arena/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `PanelShellComponent`, `PageHeaderComponent`, `PanelCardComponent`, `BarRowComponent`, `PillComponent`, `IconComponent` (Tasks 2–8), `AuthService`.
- Produces: `PanelCourtsComponent` (`ar-panel-courts`), rota `painel/quadras`.

"Quadras livres agora" e "Em manutenção" são calculados a partir do array de quadras (contagem por `status`) em vez de hardcoded — batem com os valores do protótipo (1 e 1) e não podem divergir do array. "Ocupação média" fica com o valor literal do protótipo (`78%`), que não é a média do array (é um mock independente).

- [ ] **Step 1: Criar a tela**

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { BarRowComponent, type BarRowTone } from '../ui/bar-row.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type CourtStatus = 'livre' | 'ocupada' | 'manutencao';

interface Court {
  name: string;
  sport: string;
  status: CourtStatus;
  preco: number;
  ocupacao: number;
  reservasHoje: number;
  cobertura: string;
}

const STATUS_LABEL: Record<CourtStatus, string> = {
  livre: 'Livre agora',
  ocupada: 'Ocupada agora',
  manutencao: 'Em manutenção',
};

const STATUS_TONE: Record<CourtStatus, PillTone> = {
  livre: 'green',
  ocupada: 'orange',
  manutencao: 'dim',
};

const COURTS: Court[] = [
  { name: 'Quadra 1', sport: 'Beach Tennis', status: 'livre', preco: 60, ocupacao: 92, reservasHoje: 5, cobertura: 'Coberta' },
  { name: 'Quadra 2', sport: 'Vôlei de praia', status: 'ocupada', preco: 50, ocupacao: 84, reservasHoje: 4, cobertura: 'Descoberta' },
  { name: 'Quadra 3', sport: 'Beach Soccer', status: 'manutencao', preco: 80, ocupacao: 0, reservasHoje: 0, cobertura: 'Coberta' },
];

/** Tela Quadras do painel (protótipo ArQuadrasScreen): KPIs e grid de cards de quadra. */
@Component({
  selector: 'ar-panel-courts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, BarRowComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Quadras" [subtitle]="arenaName() + ' · ' + courts.length + ' quadras cadastradas'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary">
          <ar-icon name="plus" [size]="14" />
          Nova quadra
        </button>
      </ar-page-header>

      <div class="body">
        <div class="kpi-row">
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Ocupação média</div>
            <div class="kpi-value">78%</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Quadras livres agora</div>
            <div class="kpi-value tone-green">{{ freeCount() }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Em manutenção</div>
            <div class="kpi-value tone-pending">{{ maintenanceCount() }}</div>
          </ar-panel-card>
        </div>

        <div class="grid-wrap">
          <div class="grid">
            @for (c of courts; track c.name) {
              <div class="card">
                <div class="card-head">
                  <div class="card-icon">
                    <ar-icon name="courts" [size]="20" />
                  </div>
                  <ar-pill [tone]="statusTone[c.status]">{{ statusLabel[c.status] }}</ar-pill>
                </div>
                <div>
                  <div class="card-title">{{ c.name }}</div>
                  <div class="card-meta">{{ c.sport }} · {{ c.cobertura }}</div>
                </div>
                <div class="stat-grid">
                  <div class="stat-box">
                    <div class="stat-label">Preço/h</div>
                    <div class="stat-value">R$ {{ c.preco }}</div>
                  </div>
                  <div class="stat-box">
                    <div class="stat-label">Reservas hoje</div>
                    <div class="stat-value">{{ c.reservasHoje }}</div>
                  </div>
                </div>
                <ar-bar-row label="Ocupação (7d)" [pct]="c.ocupacao" [tone]="occupancyTone(c)" [last]="true" />
                <div class="card-foot">
                  <button type="button" class="ar-mini-btn">
                    <ar-icon name="edit" [size]="13" />
                    Editar
                  </button>
                  <button type="button" class="ar-ghost-btn">Ver agenda</button>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: hidden;
    }

    .kpi-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .kpi-card {
      flex: 1;
    }

    .kpi-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .kpi-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .kpi-value.tone-green {
      color: var(--nx-win);
    }

    .kpi-value.tone-pending {
      color: var(--nx-pending);
    }

    .grid-wrap {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .grid-wrap::-webkit-scrollbar {
      display: none;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
    }

    .card-icon {
      width: 44px;
      height: 44px;
      border-radius: var(--nx-r-2);
      flex: none;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }

    .card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }

    .card-meta {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }

    .stat-grid {
      display: flex;
      gap: 10px;
    }

    .stat-box {
      flex: 1;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
    }

    .stat-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      color: var(--nx-text-dim);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .stat-value {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin-top: 2px;
    }

    .card-foot {
      display: flex;
      gap: 8px;
    }

    @media (max-width: 1180px) {
      .grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 720px) {
      .grid {
        grid-template-columns: 1fr;
      }

      .kpi-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelCourtsComponent {
  private readonly auth = inject(AuthService);

  protected readonly courts = COURTS;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  protected readonly freeCount = computed(() => this.courts.filter((c) => c.status === 'livre').length);
  protected readonly maintenanceCount = computed(() => this.courts.filter((c) => c.status === 'manutencao').length);

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected occupancyTone(c: Court): BarRowTone {
    if (c.ocupacao === 0) {
      return 'red';
    }
    return c.ocupacao >= 85 ? 'green' : 'orange';
  }
}
```

- [ ] **Step 2: Adicionar a rota**

Em `frontend/projects/arena/src/app/app.routes.ts`, adicione depois da rota `painel/torneios`:

```ts
  {
    path: 'painel/quadras',
    title: 'Quadras — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/courts/panel-courts.component').then((m) => m.PanelCourtsComponent),
  },
```

- [ ] **Step 3: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 4: Smoke test manual**

Run: `cd frontend && npx ng serve arena` e abrir `http://localhost:4200/painel/quadras`. Esperado: 3 KPIs (livres/manutenção batendo com os cards), grid de 3 colunas com preço, reservas hoje e barra de ocupação.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/courts/panel-courts.component.ts \
  frontend/projects/arena/src/app/app.routes.ts
git commit -m "feat(arena): tela Quadras do painel (ar-panel-courts)"
```

---

## Task 16: Tela Equipe (`ar-panel-team`)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/team/panel-team.component.ts`
- Modify: `frontend/projects/arena/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `PanelShellComponent`, `PageHeaderComponent`, `PanelCardComponent`, `PillComponent`, `IconComponent` (Tasks 2–8), `AuthService`.
- Produces: `PanelTeamComponent` (`ar-panel-team`), rota `painel/equipe`.

"Membros ativos", "Convites pendentes" e "Cargos" são calculados a partir do array de membros (contagem por `status` e número de cargos distintos), não hardcoded — batem com os valores do protótipo (3, 1, 3).

- [ ] **Step 1: Criar a tela**

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type MemberStatus = 'ativo' | 'pendente';
type MemberRole = 'Gestor' | 'Recepção' | 'Manutenção';

interface Member {
  name: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  initials: string;
}

const ROLE_TONE: Record<MemberRole, PillTone> = {
  Gestor: 'orange',
  Recepção: 'dim',
  Manutenção: 'dim',
};

const STATUS_LABEL: Record<MemberStatus, string> = {
  ativo: 'Ativo',
  pendente: 'Convite pendente',
};

const STATUS_TONE: Record<MemberStatus, PillTone> = {
  ativo: 'green',
  pendente: 'yellow',
};

const MEMBERS: Member[] = [
  { name: 'Rafael Souza', email: 'rafael@arenacfc.com', role: 'Gestor', status: 'ativo', initials: 'RS' },
  { name: 'Bianca Alves', email: 'bianca@arenacfc.com', role: 'Recepção', status: 'ativo', initials: 'BA' },
  { name: 'Diego Farias', email: 'diego@arenacfc.com', role: 'Manutenção', status: 'ativo', initials: 'DF' },
  { name: 'Tatiane Lima', email: 'tatiane@arenacfc.com', role: 'Recepção', status: 'pendente', initials: 'TL' },
];

/** Tela Equipe do painel (protótipo ArEquipeScreen): KPIs e tabela de membros. */
@Component({
  selector: 'ar-panel-team',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Equipe" [subtitle]="arenaName() + ' · quem tem acesso ao painel'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary">
          <ar-icon name="mail" [size]="14" />
          Convidar membro
        </button>
      </ar-page-header>

      <div class="body">
        <div class="kpi-row">
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Membros ativos</div>
            <div class="kpi-value">{{ activeCount() }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Convites pendentes</div>
            <div class="kpi-value tone-pending">{{ pendingCount() }}</div>
          </ar-panel-card>
          <ar-panel-card pad="sm" class="kpi-card">
            <div class="kpi-label">Cargos</div>
            <div class="kpi-value">{{ roleCount() }}</div>
          </ar-panel-card>
        </div>

        <ar-panel-card title="Membros da equipe" [kicker]="members.length + ' pessoas'" class="table-card">
          <div class="table-head">
            <span></span>
            <span>Nome</span>
            <span>E-mail</span>
            <span>Cargo</span>
            <span>Status</span>
            <span></span>
          </div>
          <div class="table-body">
            @for (m of members; track m.email) {
              <div class="table-row">
                <div class="avatar">{{ m.initials }}</div>
                <div class="cell-name">{{ m.name }}</div>
                <div class="cell-email">{{ m.email }}</div>
                <div><ar-pill [tone]="roleTone[m.role]">{{ m.role }}</ar-pill></div>
                <div><ar-pill [tone]="statusTone[m.status]">{{ statusLabel[m.status] }}</ar-pill></div>
                <div class="cell-action"><button type="button" class="ar-ghost-btn">Gerenciar</button></div>
              </div>
            }
          </div>
        </ar-panel-card>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: hidden;
    }

    .kpi-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .kpi-card {
      flex: 1;
    }

    .kpi-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .kpi-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .kpi-value.tone-pending {
      color: var(--nx-pending);
    }

    .table-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 46px 1.4fr 1.2fr 120px 150px 90px;
      gap: 12px;
      align-items: center;
    }

    .table-head {
      padding: 0 0 10px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .table-body::-webkit-scrollbar {
      display: none;
    }

    .table-row {
      padding: 13px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-orange-500);
    }

    .cell-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .cell-email {
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .cell-action {
      text-align: right;
    }

    @media (max-width: 720px) {
      .kpi-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelTeamComponent {
  private readonly auth = inject(AuthService);

  protected readonly members = MEMBERS;
  protected readonly roleTone = ROLE_TONE;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  protected readonly activeCount = computed(() => this.members.filter((m) => m.status === 'ativo').length);
  protected readonly pendingCount = computed(() => this.members.filter((m) => m.status === 'pendente').length);
  protected readonly roleCount = computed(() => new Set(this.members.map((m) => m.role)).size);

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');
}
```

- [ ] **Step 2: Adicionar a rota**

Em `frontend/projects/arena/src/app/app.routes.ts`, adicione depois da rota `painel/quadras`:

```ts
  {
    path: 'painel/equipe',
    title: 'Equipe — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/team/panel-team.component').then((m) => m.PanelTeamComponent),
  },
```

- [ ] **Step 3: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 4: Smoke test manual**

Run: `cd frontend && npx ng serve arena` e abrir `http://localhost:4200/painel/equipe`. Esperado: 3 KPIs, tabela com 4 membros, pills de cargo/status.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/team/panel-team.component.ts \
  frontend/projects/arena/src/app/app.routes.ts
git commit -m "feat(arena): tela Equipe do painel (ar-panel-team)"
```

---

## Task 17: Tela Perfil (`ar-panel-profile`)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/profile/panel-profile.component.ts`
- Modify: `frontend/projects/arena/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `PanelShellComponent`, `PageHeaderComponent`, `PanelCardComponent`, `PillComponent`, `StatusDotComponent`, `IconComponent` (Tasks 2–8), `initialsOf` (`../ui/initials`, Task 8), `AuthService`.
- Produces: `PanelProfileComponent` (`ar-panel-profile`), rota `painel/perfil`. Tela somente leitura — botões "Editar"/"Adicionar" ficam visuais, sem handler.

O nome exibido (título + badge do avatar) usa `AuthService.displayName()` de verdade — é o mesmo dado gravado no cadastro (`createArenaAccount`). Os demais campos (cidade, endereço, descrição, modalidades, horários, contato, stats) não têm modelo de dados ainda, então ficam com o mock do protótipo.

- [ ] **Step 1: Criar a tela**

```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
import { initialsOf } from '../ui/initials';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { StatusDotComponent } from '../ui/status-dot.component';

interface ProfileStat {
  label: string;
  value: string | number;
  accent: boolean;
}

interface OpeningHour {
  days: string;
  time: string;
  open: boolean;
}

const CITY = 'Aparecida de Goiânia · GO';
const ADDRESS = 'Esq com – Rua Moscou, Av. Francisco Inácio Ferreira, qd 29 – LT 01';
const FULL_CITY = 'Aparecida de Goiânia · GO · 74968-570';
const DESCRIPTION = 'Um lugar aconchegante, cheio de charme. Ótimo para um vôlei e se divertir com os amigos.';
const SPORTS = ['Vôlei de praia', 'Beach Tennis', 'Beach Soccer'];
const HOURS: OpeningHour[] = [
  { days: 'Seg – Sex', time: '07:00 – 22:00', open: true },
  { days: 'Sáb – Dom', time: '06:00 – 20:00', open: true },
  { days: 'Feriados', time: '08:00 – 18:00', open: false },
];
const WHATSAPP = '+55 62 9 9999-9999';
const INSTAGRAM = '@arenacfc';
const RATING = 4.8;
const REVIEWS = 23;
const FOLLOWERS = 6;
const WEEK_VIEWS = 42;

/** Tela Perfil do painel (protótipo ArPerfilScreen): como os atletas veem a arena no app — somente leitura. */
@Component({
  selector: 'ar-panel-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, StatusDotComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Perfil da arena" subtitle="Como os atletas veem a arena no app">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary">
          <ar-icon name="edit" [size]="14" />
          Editar perfil
        </button>
      </ar-page-header>

      <div class="body">
        <div class="main-grid">
          <div class="col-left">
            <div class="cover">
              <svg width="100%" height="150" viewBox="0 0 1000 150" preserveAspectRatio="none" class="cover-svg">
                <defs>
                  <radialGradient id="arProfileG1" cx="24%" cy="45%">
                    <stop offset="0%" stop-color="#FF6A1A" stop-opacity="0.45" />
                    <stop offset="100%" stop-color="#FF6A1A" stop-opacity="0" />
                  </radialGradient>
                  <radialGradient id="arProfileG2" cx="82%" cy="30%">
                    <stop offset="0%" stop-color="#2BD17E" stop-opacity="0.22" />
                    <stop offset="100%" stop-color="#2BD17E" stop-opacity="0" />
                  </radialGradient>
                </defs>
                <rect width="1000" height="150" fill="#0d0d0e" />
                <rect width="1000" height="150" fill="url(#arProfileG1)" />
                <rect width="1000" height="150" fill="url(#arProfileG2)" />
                @for (x of coverLines; track x) {
                  <line [attr.x1]="x" y1="0" [attr.x2]="x" y2="150" stroke="rgba(255,255,255,0.04)" />
                }
              </svg>
              <div class="cover-edit">
                <ar-icon name="edit" [size]="13" />
                Editar capa
              </div>
            </div>

            <div class="identity">
              <div class="identity-avatar">{{ initials() }}</div>
              <div class="identity-body">
                <div class="identity-name-row">
                  <h1>{{ arenaName() }}</h1>
                  <ar-pill tone="green">Perfil público ativo</ar-pill>
                </div>
                <div class="identity-city">{{ city }}</div>
              </div>
            </div>

            <div class="stats-row">
              @for (s of stats; track s.label) {
                <div class="stat" [class.accent]="s.accent">
                  <div class="stat-value">{{ s.value }}</div>
                  <div class="stat-label">{{ s.label }}</div>
                </div>
              }
            </div>

            <ar-panel-card title="Descrição">
              <button type="button" class="ar-ghost-btn" card-actions>
                <ar-icon name="edit" [size]="13" />
                Editar
              </button>
              <p class="text">{{ description }}</p>
            </ar-panel-card>

            <ar-panel-card title="Modalidades">
              <button type="button" class="ar-ghost-btn" card-actions>
                <ar-icon name="plus" [size]="13" />
                Adicionar
              </button>
              <div class="sports">
                @for (s of sports; track s) {
                  <ar-pill tone="orange">{{ s }}</ar-pill>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Endereço">
              <button type="button" class="ar-ghost-btn" card-actions>
                <ar-icon name="edit" [size]="13" />
                Editar
              </button>
              <p class="text address">{{ address }}</p>
              <div class="full-city">{{ fullCity }}</div>
            </ar-panel-card>
          </div>

          <div class="col-right">
            <ar-panel-card title="Completude do perfil">
              <ar-pill tone="orange" card-actions>80%</ar-pill>
              <div class="completeness-track">
                <div class="completeness-fill"></div>
              </div>
              <div class="completeness-hint">Adicione fotos das quadras para completar +20%.</div>
            </ar-panel-card>

            <ar-panel-card title="Horários de funcionamento">
              <button type="button" class="ar-ghost-btn" card-actions>
                <ar-icon name="edit" [size]="13" />
                Editar
              </button>
              <div>
                @for (h of hours; track h.days) {
                  <div class="hour-row">
                    <div class="hour-days">
                      <ar-status-dot [tone]="h.open ? 'green' : 'yellow'" [size]="6" />
                      <span>{{ h.days }}</span>
                    </div>
                    <span class="hour-time">{{ h.time }}</span>
                  </div>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Contato">
              <button type="button" class="ar-ghost-btn" card-actions>
                <ar-icon name="edit" [size]="13" />
                Editar
              </button>
              <div class="contact-list">
                <div class="contact-row">
                  <div class="contact-icon whatsapp">
                    <ar-icon name="mail" [size]="15" />
                  </div>
                  <div>
                    <div class="contact-label">WhatsApp</div>
                    <div class="contact-value">{{ whatsapp }}</div>
                  </div>
                </div>
                <div class="contact-row">
                  <div class="contact-icon instagram">
                    <ar-icon name="share" [size]="15" />
                  </div>
                  <div>
                    <div class="contact-label">Instagram</div>
                    <div class="contact-value">{{ instagram }}</div>
                  </div>
                </div>
              </div>
            </ar-panel-card>
          </div>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .body::-webkit-scrollbar {
      display: none;
    }

    .main-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .cover {
      height: 150px;
      position: relative;
      overflow: hidden;
      border-radius: var(--nx-r-4);
      flex: none;
    }

    .cover-svg {
      position: absolute;
      inset: 0;
      display: block;
    }

    .cover-edit {
      position: absolute;
      top: 12px;
      right: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: var(--nx-r-2);
      background: rgba(11, 11, 12, 0.72);
      backdrop-filter: blur(12px);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      cursor: pointer;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12px;
    }

    .identity {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-top: -46px;
      padding: 0 4px;
    }

    .identity-avatar {
      width: 74px;
      height: 74px;
      border-radius: 18px;
      flex: none;
      background: linear-gradient(135deg, #f0a830 0%, #2260b8 100%);
      border: 4px solid var(--nx-bg);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 900;
      font-size: 17px;
      color: #fff;
    }

    .identity-body {
      margin-top: 40px;
      min-width: 0;
    }

    .identity-name-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .identity-name-row h1 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 22px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
    }

    .identity-city {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }

    .stats-row {
      display: flex;
      gap: 10px;
    }

    .stat {
      flex: 1;
      padding: 12px 10px;
      border-radius: var(--nx-r-2);
      text-align: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }

    .stat.accent {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.28);
    }

    .stat-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
    }

    .stat.accent .stat-value {
      color: var(--nx-orange-500);
    }

    .stat-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      color: var(--nx-text-dim);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-top: 4px;
    }

    .text {
      font-size: 13.5px;
      line-height: 1.6;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .address {
      margin: 0 0 6px;
      font-size: 13px;
    }

    .full-city {
      font-size: 12px;
      color: var(--nx-text-dim);
    }

    .sports {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .completeness-track {
      height: 8px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
      margin-bottom: 10px;
    }

    .completeness-fill {
      width: 80%;
      height: 100%;
      border-radius: 4px;
      background: var(--nx-orange-500);
    }

    .completeness-hint {
      font-size: 12px;
      color: var(--nx-text-dim);
    }

    .hour-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .hour-row:last-child {
      border-bottom: none;
    }

    .hour-days {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .hour-time {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .contact-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .contact-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .contact-icon {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      flex: none;
      display: grid;
      place-items: center;
    }

    .contact-icon.whatsapp {
      background: rgba(37, 211, 102, 0.12);
      color: #25d366;
    }

    .contact-icon.instagram {
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }

    .contact-label {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .contact-value {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    @media (max-width: 1180px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelProfileComponent {
  private readonly auth = inject(AuthService);

  protected readonly city = CITY;
  protected readonly address = ADDRESS;
  protected readonly fullCity = FULL_CITY;
  protected readonly description = DESCRIPTION;
  protected readonly sports = SPORTS;
  protected readonly hours = HOURS;
  protected readonly whatsapp = WHATSAPP;
  protected readonly instagram = INSTAGRAM;
  protected readonly coverLines = [120, 280, 440, 600, 760, 920];

  protected readonly stats: ProfileStat[] = [
    { label: 'avaliação', value: RATING, accent: true },
    { label: 'avaliações', value: REVIEWS, accent: false },
    { label: 'seguidores', value: FOLLOWERS, accent: false },
    { label: 'visitas/sem', value: WEEK_VIEWS, accent: false },
  ];

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');
  protected readonly initials = computed(() => initialsOf(this.arenaName()));
}
```

- [ ] **Step 2: Adicionar a rota**

Em `frontend/projects/arena/src/app/app.routes.ts`, adicione depois da rota `painel/equipe`:

```ts
  {
    path: 'painel/perfil',
    title: 'Perfil — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/profile/panel-profile.component').then((m) => m.PanelProfileComponent),
  },
```

- [ ] **Step 3: Verificar que o projeto builda**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros.

- [ ] **Step 4: Smoke test manual**

Run: `cd frontend && npx ng serve arena` e abrir `http://localhost:4200/painel/perfil`. Esperado: capa com gradiente, nome real da arena logada, stats, descrição/modalidades/endereço, completude, horários e contato.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/profile/panel-profile.component.ts \
  frontend/projects/arena/src/app/app.routes.ts
git commit -m "feat(arena): tela Perfil do painel (ar-panel-profile)"
```

---

## Task 18: Conferência final de rotas + smoke test completo

**Files:**
- Modify: `frontend/projects/arena/src/app/app.routes.ts` (só leitura/conferência — nenhuma rota nova)

**Interfaces:**
- Consumes: todas as rotas criadas nas Tasks 11–17.

- [ ] **Step 1: Conferir o arquivo de rotas final**

Abra `frontend/projects/arena/src/app/app.routes.ts` e confirme que o array `routes` está assim (ordem não importa para o router, mas mantenha as 7 rotas de painel juntas, depois de `cadastro`):

```ts
import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'entrar' },
  {
    path: 'entrar',
    title: 'Entrar — NexaGO Arena',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'entrar/recuperar',
    title: 'Recuperar senha — NexaGO Arena',
    loadComponent: () =>
      import('./auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'entrar/enviado',
    title: 'E-mail enviado — NexaGO Arena',
    loadComponent: () => import('./auth/email-sent.component').then((m) => m.EmailSentComponent),
  },
  {
    path: 'entrar/redefinir',
    title: 'Redefinir senha — NexaGO Arena',
    loadComponent: () =>
      import('./auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'cadastro',
    title: 'Cadastrar arena — NexaGO Arena',
    loadComponent: () => import('./auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'painel',
    title: 'Painel — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/home/panel-home.component').then((m) => m.PanelHomeComponent),
  },
  {
    path: 'painel/agenda',
    title: 'Agenda — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/agenda/panel-agenda.component').then((m) => m.PanelAgendaComponent),
  },
  {
    path: 'painel/financeiro',
    title: 'Financeiro — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/finance/panel-finance.component').then((m) => m.PanelFinanceComponent),
  },
  {
    path: 'painel/torneios',
    title: 'Torneios — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/tournaments/panel-tournaments.component').then((m) => m.PanelTournamentsComponent),
  },
  {
    path: 'painel/quadras',
    title: 'Quadras — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/courts/panel-courts.component').then((m) => m.PanelCourtsComponent),
  },
  {
    path: 'painel/equipe',
    title: 'Equipe — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/team/panel-team.component').then((m) => m.PanelTeamComponent),
  },
  {
    path: 'painel/perfil',
    title: 'Perfil — NexaGO Arena',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./painel/profile/panel-profile.component').then((m) => m.PanelProfileComponent),
  },
  { path: '**', redirectTo: '' },
];
```

Se alguma rota ficou fora de ordem ou faltando por causa das tasks anteriores, corrija agora.

- [ ] **Step 2: Build completo**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erros, sem warnings de rota não usada.

- [ ] **Step 3: Rodar toda a suíte de testes**

Run: `cd frontend && npx ng test arena --watch=false`
Expected: todos os specs passam (só `agenda-grid-math.spec.ts` da Task 9 nesta rodada).

- [ ] **Step 4: Smoke test manual completo**

Run: `cd frontend && npx ng serve arena` e, logado, visitar em sequência: `/painel`, `/painel/agenda`, `/painel/financeiro`, `/painel/torneios`, `/painel/quadras`, `/painel/equipe`, `/painel/perfil`. Em cada uma, confirmar:
- item correto da sidebar destacado como ativo (fundo laranja translúcido + barra lateral)
- nenhum erro no console do navegador
- responsividade básica: reduzir a janela para <900px esconde a sidebar sem quebrar o layout

- [ ] **Step 5: Commit (se algum ajuste de rota foi necessário)**

```bash
git add frontend/projects/arena/src/app/app.routes.ts
git commit -m "chore(arena): confere ordem final das 7 rotas do painel"
```

Se nenhum ajuste foi necessário, pule o commit — as rotas já foram commitadas tela por tela nas Tasks 11–17.
