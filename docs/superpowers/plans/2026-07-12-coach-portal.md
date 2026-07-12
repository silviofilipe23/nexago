# Portal do Treinador (coach) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP of the new coach ("treinador") web portal — a 5th Angular project alongside `arena`/`athlete`/`backoffice`/`site` — with real Firestore/Cloud Functions backing (not mock data), covering the 10 MVP modules from the approved design spec.

**Architecture:** New standalone Angular app `frontend/projects/coach`, same shell pattern as `arena` (sidebar panel + auth flow, `co-*` selector prefix, `--nx-*` design tokens). Coach-owned data (`coaches/{uid}/**`) is read/written directly by the client under ownership-only Firestore rules. Anything that crosses two users — invites, call-up notifications, tournament aggregation — goes through `onCall` Cloud Functions in `functions/src`, mirroring the existing `tournament-partner-invite.ts` pattern (top-level invite doc with `status`/`expiresAt`, `deliverNotificationToUser`, transactional accept). Two routes inside the `coach` app (`/convite-atleta/:id`, `/convocacao/:id`) let any authenticated nexaGO user (regardless of role) respond to a coach's invite or call-up, without touching `athlete` or the Flutter app.

**Tech Stack:** Angular 20 (standalone components, signals, `OnPush`, zoneless), Firebase JS SDK (`firebase/app`, `firebase/auth`, `firebase/firestore`) client-side, Firebase Admin SDK + `onCall` in Cloud Functions (Node, TypeScript), `node:test` for function unit tests.

## Global Constraints

- Português nas strings/UI, inglês no código (arquivo/seletor/variável) — `CLAUDE.md` raiz.
- Standalone components only; never set `standalone: true` explicitly (it's the default) — `frontend/.claude/CLAUDE.md`.
- `input()`/`output()` functions, not decorators; `computed()` for derived state; `ChangeDetectionStrategy.OnPush` on every `@Component` — `frontend/.claude/CLAUDE.md`.
- No `ngClass`/`ngStyle` — use `class`/`style` bindings. Native `@if`/`@for`/`@switch`, never `*ngIf`/`*ngFor`.
- `inject()` function, not constructor injection.
- Signals: use `.update()`/`.set()`, never `.mutate()`.
- Deploy scope: **dev Firebase project only** (`volley-track-dev-4596c`). Nothing in this plan touches `volley-track-2dd3b` (prod).
- MVP scope only: Início, Agenda, Atletas (+ novo atleta/convite), Equipes (+ nova), Treinos (listagem + planejamento), Presença, Convocações (+ nova), Avaliações (+ listagem), Histórico, Torneios (view-only). Everything else from the prototype is explicitly out of scope (see spec `docs/superpowers/specs/2026-07-12-coach-portal-design.md`).
- Coach-owned data under `coaches/{coachUid}/**`: ownership-only rules (`request.auth.uid == coachUid`), no role-claim check needed for read/write — except `callUps`, which a call-up's own `recipients` can also *read* (never write). Cross-user writes (invites, call-up creation/response, tournament reads) go through `onCall` functions only — client never writes `coachAthleteInvites` or `callUps` directly.
- Athlete's public data (name, rating, category) is **read live** from `public_profiles/{uid}` — never copied into `coaches/{coachUid}/athletes/{athleteUid}`.

---

## Task 1: Scaffold the `coach` Angular project

**Files:**
- Create: `frontend/projects/coach/tsconfig.app.json`
- Create: `frontend/projects/coach/tsconfig.spec.json`
- Create: `frontend/projects/coach/src/main.ts`
- Create: `frontend/projects/coach/src/index.html`
- Create: `frontend/projects/coach/src/app/app.ts`
- Create: `frontend/projects/coach/src/app/app.config.ts`
- Create: `frontend/projects/coach/src/app/app.routes.ts` (placeholder — fully replaced in Task 4)
- Create: `frontend/projects/coach/src/environments/environment.ts`
- Create: `frontend/projects/coach/src/environments/environment.prod.ts`
- Create: `frontend/projects/coach/src/styles.scss`
- Modify: `frontend/angular.json`
- Modify: `frontend/tsconfig.json`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `environment.firebase` (re-exports `@nexago/firebase-config`, same shape used by `arena`/`athlete`) — every later task's `AuthService`/Firestore access imports this.
- Produces: global CSS classes `.co-form-header`, `.co-kicker`, `.co-stack`, `.co-stack-sm`, `.co-grid-2`, `.co-row-between`, `.co-remember`, `.co-checkbox-input`, `.co-checkbox-box`, `.co-btn-primary`, `.co-text-link`, `.co-back-link`, `.co-fine`, `.co-alert`, `.co-icon-badge`, `.co-center`, `.co-resend-row`, `.co-spinner`, `.co-mini-btn`, `.co-mini-btn-primary`, `.co-ghost-btn`, `.co-search-box`, `.co-bell-btn`, `.co-chart-tabs`, `.co-filter-bar`, `.co-chip`, `.co-shortcut` — every later component/screen task uses these instead of redefining button/card chrome.

- [ ] **Step 1: Copy the favicon and create the tsconfig files**

```bash
mkdir -p /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/coach/public
cp /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/arena/public/favicon.ico \
   /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/coach/public/favicon.ico
```

`frontend/projects/coach/tsconfig.app.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "../../out-tsc/app",
    "types": []
  },
  "include": [
    "src/**/*.ts"
  ],
  "exclude": [
    "src/**/*.spec.ts"
  ]
}
```

`frontend/projects/coach/tsconfig.spec.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "../../out-tsc/spec",
    "types": [
      "jasmine"
    ]
  },
  "include": [
    "src/**/*.d.ts",
    "src/**/*.spec.ts"
  ]
}
```

- [ ] **Step 2: Create the environment files**

`frontend/projects/coach/src/environments/environment.ts`:
```ts
import { firebaseConfig } from '@nexago/firebase-config';

export const environment = {
  production: false,
  firebase: firebaseConfig,
};
```

`frontend/projects/coach/src/environments/environment.prod.ts`:
```ts
import { firebaseConfig } from '@nexago/firebase-config';

export const environment = {
  production: true,
  firebase: firebaseConfig,
};
```

- [ ] **Step 3: Create `main.ts`, `index.html`, `app.config.ts`, `app.ts`, `app.routes.ts`**

`frontend/projects/coach/src/main.ts`:
```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
```

`frontend/projects/coach/src/index.html`:
```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>NexaGO — Treinador</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/x-icon" href="favicon.ico">
</head>
<body>
  <app-root></app-root>
</body>
</html>
```

`frontend/projects/coach/src/app/app.config.ts`:
```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding())
  ]
};
```

`frontend/projects/coach/src/app/app.ts`:
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class App {}
```

`frontend/projects/coach/src/app/app.routes.ts` (placeholder — Task 4 replaces this entirely with the real auth + painel routes):
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Routes } from '@angular/router';

@Component({
  selector: 'app-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="font-family: system-ui; padding: 24px; color: #F4F4F5; background: #050505; min-height: 100dvh; margin: 0;">Portal do treinador — em construção.</p>`,
})
class PlaceholderComponent {}

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: PlaceholderComponent },
  { path: '**', redirectTo: '' },
];
```

- [ ] **Step 4: Create `styles.scss`** (tokens + `co-*` global classes — ported 1:1 from `arena/src/styles.scss`, `ar-` → `co-`, tag text "Arena" → "Treinador")

`frontend/projects/coach/src/styles.scss`:
```scss
/* NexaGO Treinador — estilos globais.
   Tokens vindos do design system NexaGO (tokens.css do protótipo), namespace --nx-.
   Classes de fluxo de auth/painel compartilhadas usam o prefixo co- (paralelo ao ar-/bo-). */
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

:root {
  /* Superfícies (dark-first) */
  --nx-bg: #050505;
  --nx-surface-0: #0B0B0C;
  --nx-surface-1: #131316;
  --nx-surface-2: #1B1B1F;
  --nx-line: rgba(255, 255, 255, 0.08);
  --nx-line-strong: rgba(255, 255, 255, 0.16);

  /* Marca */
  --nx-orange-500: #FF6A1A;
  --nx-orange-400: #FF8A4A;
  --nx-orange-600: #E5560E;
  --nx-orange-tint: rgba(255, 106, 26, 0.12);

  /* Texto — dim elevado de 0.40 → 0.55 pra manter AA em texto pequeno sobre #050505 */
  --nx-text: #F4F4F5;
  --nx-text-mute: rgba(244, 244, 245, 0.62);
  --nx-text-dim: rgba(244, 244, 245, 0.55);
  --nx-text-on-orange: #0A0A0A;

  /* Status */
  --nx-live: #FF3B30;
  --nx-win: #2BD17E;
  --nx-pending: #F4C543;

  /* Tipografia */
  --nx-font-display: 'Sora', system-ui, sans-serif;
  --nx-font-ui: 'Inter', system-ui, sans-serif;
  --nx-font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Raios */
  --nx-r-1: 6px;
  --nx-r-2: 10px;
  --nx-r-3: 14px;
  --nx-r-4: 18px;
  --nx-r-5: 24px;
  --nx-r-pill: 999px;

  /* Movimento */
  --nx-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --nx-d-fast: 140ms;
  --nx-d-base: 240ms;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  min-height: 100%;
}

body {
  background: var(--nx-bg);
  color: var(--nx-text);
  font-family: var(--nx-font-ui);
  -webkit-font-smoothing: antialiased;
}

input::placeholder {
  color: rgba(244, 244, 245, 0.3);
}

button {
  font: inherit;
}

:focus-visible {
  outline: 2px solid var(--nx-orange-500);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* ── Fluxo de auth: classes compartilhadas ─────────────────── */

.co-form-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 0 32px;
}

.co-kicker {
  font-family: var(--nx-font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--nx-orange-500);
}

.co-form-header h1 {
  font-family: var(--nx-font-display);
  font-weight: 800;
  font-size: 30px;
  line-height: 1.08;
  letter-spacing: -0.025em;
  color: var(--nx-text);
  margin: 0;
}

.co-form-header p {
  font-size: 14px;
  line-height: 1.55;
  color: var(--nx-text-mute);
  margin: 0;
}

.co-form-header strong {
  color: var(--nx-text);
  font-weight: 600;
}

.co-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.co-stack-sm {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.co-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.co-row-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 14px 0 22px;
}

.co-remember {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--nx-text-mute);
}

.co-checkbox-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.co-checkbox-box {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  flex: none;
  border: 1px solid var(--nx-line-strong);
  background: transparent;
  display: grid;
  place-items: center;
  transition: all 140ms var(--nx-ease-out);
}

.co-checkbox-input:checked + .co-checkbox-box {
  border-color: var(--nx-orange-500);
  background: var(--nx-orange-500);
}

.co-checkbox-input:focus-visible + .co-checkbox-box {
  outline: 2px solid var(--nx-orange-500);
  outline-offset: 2px;
}

.co-btn-primary {
  height: 52px;
  width: 100%;
  border-radius: var(--nx-r-3);
  background: var(--nx-orange-500);
  color: var(--nx-text-on-orange);
  border: none;
  cursor: pointer;
  font-family: var(--nx-font-display);
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow: 0 12px 40px rgba(255, 106, 26, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transition: all 180ms var(--nx-ease-out);
  text-decoration: none;
}

.co-btn-primary:hover:not(:disabled) {
  background: var(--nx-orange-400);
}

.co-btn-primary:active:not(:disabled) {
  transform: scale(0.99);
}

.co-btn-primary:disabled {
  opacity: 0.55;
  cursor: default;
}

.co-text-link {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: var(--nx-font-display);
  font-weight: 600;
  font-size: 13px;
  color: var(--nx-orange-500);
  text-decoration: none;
}

.co-text-link:hover {
  text-decoration: underline;
}

.co-text-link:disabled {
  color: var(--nx-text-dim);
  cursor: default;
  text-decoration: none;
}

.co-back-link {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--nx-font-display);
  font-weight: 600;
  font-size: 13px;
  color: var(--nx-text-mute);
  margin-bottom: 28px;
  text-decoration: none;
}

.co-back-link:hover {
  color: var(--nx-text);
}

.co-fine {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--nx-text-dim);
  text-align: center;
  margin: 24px 0 0;
}

.co-fine strong {
  color: var(--nx-text-mute);
  font-weight: 600;
}

.co-alert {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  margin: 0 0 20px;
  background: rgba(255, 59, 48, 0.1);
  border: 1px solid rgba(255, 59, 48, 0.35);
  border-radius: var(--nx-r-3);
  font-size: 13px;
  line-height: 1.5;
  color: #FF9B94;
}

.co-alert svg {
  flex: none;
  margin-top: 1px;
}

.co-icon-badge {
  width: 72px;
  height: 72px;
  border-radius: var(--nx-r-4);
  background: var(--nx-orange-tint);
  border: 1px solid rgba(255, 106, 26, 0.3);
  display: grid;
  place-items: center;
  margin: 0 auto 28px;
}

.co-center {
  text-align: center;
}

.co-resend-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin-top: 24px;
  font-size: 13.5px;
  color: var(--nx-text-mute);
}

.co-resend-row .co-timer {
  font-family: var(--nx-font-mono);
  font-size: 11px;
  color: var(--nx-text-dim);
  margin-left: 2px;
}

.co-spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(10, 10, 10, 0.25);
  border-top-color: #0A0A0A;
  animation: co-spin 0.7s linear infinite;
}

@keyframes co-spin {
  to {
    transform: rotate(1turn);
  }
}

/* ── Painel: botões e controles compartilhados ─────────────── */

.co-mini-btn {
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
  text-decoration: none;
  transition: all 140ms var(--nx-ease-out);
}

.co-mini-btn:hover:not(:disabled) {
  background: var(--nx-surface-2);
}

.co-mini-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.co-mini-btn-primary {
  background: var(--nx-orange-500);
  color: var(--nx-text-on-orange);
  border: none;
  box-shadow: 0 6px 20px rgba(255, 106, 26, 0.2);
}

.co-mini-btn-primary:hover:not(:disabled) {
  background: var(--nx-orange-400);
}

.co-ghost-btn {
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
  text-decoration: none;
}

.co-ghost-btn:hover {
  color: var(--nx-text);
}

.co-search-box {
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

.co-search-box span {
  flex: 1;
  font-size: 13px;
}

.co-bell-btn {
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

.co-bell-btn .dot {
  position: absolute;
  top: 8px;
  right: 9px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--nx-orange-500);
  box-shadow: 0 0 0 2px var(--nx-bg);
}

.co-chart-tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--nx-surface-1);
  border: 1px solid var(--nx-line);
  border-radius: var(--nx-r-2);
}

.co-chart-tabs button {
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

.co-chart-tabs button.active {
  background: var(--nx-surface-2);
  color: var(--nx-text);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
}

.co-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.co-chip {
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

.co-chip:hover {
  background: var(--nx-surface-1);
  color: var(--nx-text);
}

.co-chip.active {
  background: var(--nx-orange-500);
  border-color: var(--nx-orange-500);
  color: var(--nx-text-on-orange);
}

.co-shortcut {
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

.co-shortcut span {
  color: var(--nx-text);
}
```

- [ ] **Step 5: Register the `coach` project in `angular.json`**

Add this block to `frontend/angular.json`, inside `"projects"`, right after the `"athlete"` block (before the closing `}` of `"projects"`):

```json
    "coach": {
      "projectType": "application",
      "schematics": {
        "@schematics/angular:component": {
          "style": "scss"
        }
      },
      "root": "projects/coach",
      "sourceRoot": "projects/coach/src",
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@angular/build:application",
          "options": {
            "outputPath": "../dist/coach",
            "browser": "projects/coach/src/main.ts",
            "tsConfig": "projects/coach/tsconfig.app.json",
            "inlineStyleLanguage": "scss",
            "assets": [
              {
                "glob": "**/*",
                "input": "projects/coach/public"
              }
            ],
            "styles": [
              "projects/coach/src/styles.scss"
            ]
          },
          "configurations": {
            "production": {
              "budgets": [
                {
                  "type": "initial",
                  "maximumWarning": "500kB",
                  "maximumError": "1MB"
                },
                {
                  "type": "anyComponentStyle",
                  "maximumWarning": "8kB",
                  "maximumError": "12kB"
                }
              ],
              "outputHashing": "all",
              "fileReplacements": [
                {
                  "replace": "projects/coach/src/environments/environment.ts",
                  "with": "projects/coach/src/environments/environment.prod.ts"
                }
              ]
            },
            "development": {
              "optimization": false,
              "extractLicenses": false,
              "sourceMap": true
            }
          },
          "defaultConfiguration": "production"
        },
        "serve": {
          "builder": "@angular/build:dev-server",
          "configurations": {
            "production": {
              "buildTarget": "coach:build:production"
            },
            "development": {
              "buildTarget": "coach:build:development"
            }
          },
          "defaultConfiguration": "development"
        },
        "extract-i18n": {
          "builder": "@angular/build:extract-i18n"
        },
        "test": {
          "builder": "@angular/build:karma",
          "options": {
            "tsConfig": "projects/coach/tsconfig.spec.json",
            "inlineStyleLanguage": "scss",
            "assets": [
              {
                "glob": "**/*",
                "input": "projects/coach/public"
              }
            ],
            "styles": [
              "projects/coach/src/styles.scss"
            ]
          }
        }
      }
    }
```

- [ ] **Step 6: Add `coach` to `frontend/tsconfig.json` references**

In `frontend/tsconfig.json`, append to the `"references"` array (after the `backoffice` entries):
```json
    {
      "path": "./projects/coach/tsconfig.app.json"
    },
    {
      "path": "./projects/coach/tsconfig.spec.json"
    }
```

- [ ] **Step 7: Add npm scripts to `frontend/package.json`**

In `frontend/package.json`, `"scripts"` section, add:
```json
    "start:coach": "ng serve coach",
    "build:coach": "ng build coach --configuration production",
```
And update the existing `"build:all"` line to include coach:
```json
    "build:all": "ng run backoffice:build:production && ng run site:build:production && ng run arena:build:production && ng run coach:build:production",
```

- [ ] **Step 8: Build to verify the scaffold works**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds, `dist/coach/browser/index.html` exists, no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/angular.json frontend/tsconfig.json frontend/package.json frontend/projects/coach
git commit -m "feat(coach): scaffold new coach Angular project"
```

---

## Task 2: Firebase config — `coach` role claim, Firestore rules, hosting target

**Files:**
- Modify: `functions/src/auth-roles.ts:3` (add `coach` to `ALLOWED_APP_ROLES`)
- Modify: `functions/src/auth-roles.ts` (`applyRolesToClaims`/`firestoreRolesPayload` priority chain)
- Modify: `firestore.rules` (new match blocks before the catch-all)
- Modify: `firebase.json` (new hosting target)
- Shell: `firebase hosting:sites:create` + `firebase target:apply` (creates the dev hosting site and wires `.firebaserc`)

**Interfaces:**
- Produces: `coach` is now a valid `AppRole` — `rolesFromClaims`/`hasRoleInClaims(claims, "coach")` work anywhere in `functions/src`. Task 3's `completeCoachSignup` depends on this.
- Produces: Firestore paths `coaches/{coachUid}`, `coaches/{coachUid}/squads/{squadId}`, `coaches/{coachUid}/athletes/{athleteUid}`, `coaches/{coachUid}/trainings/{trainingId}`, `coaches/{coachUid}/evaluations/{evalId}` are readable/writable only by `request.auth.uid == coachUid`. `coaches/{coachUid}/callUps/{callUpId}` is the one exception — also readable by any uid listed in its `recipients` array (an athlete needs to see the call-up before responding), but never client-writable (Task 12's Cloud Functions own all writes). `coachAthleteInvites/{inviteId}` is readable by its `coachUid`/`athleteUid`, writable only via Admin SDK (Cloud Functions).

- [ ] **Step 1: Add `coach` to `ALLOWED_APP_ROLES`**

In `functions/src/auth-roles.ts:3`, change:
```ts
export const ALLOWED_APP_ROLES = ["admin", "organizer", "athlete", "arena"] as const;
```
to:
```ts
export const ALLOWED_APP_ROLES = ["admin", "organizer", "athlete", "arena", "coach"] as const;
```

In the same file, `applyRolesToClaims` (around line 92) and `firestoreRolesPayload` (around line 113) both have this priority chain for the legacy single-value `role` field:
```ts
  if (sorted.includes("admin")) {
    out["role"] = "admin";
  } else if (sorted.includes("organizer")) {
    out["role"] = "organizer";
  } else if (sorted.includes("arena")) {
    out["role"] = "arena";
  } else if (sorted.includes("athlete")) {
    out["role"] = "athlete";
  } else {
```
In **both** functions, insert a `coach` branch between `arena` and `athlete` (a coach account is a distinct professional role, same tier as `arena`/`organizer` for legacy single-role fallback purposes):
```ts
  if (sorted.includes("admin")) {
    out["role"] = "admin";
  } else if (sorted.includes("organizer")) {
    out["role"] = "organizer";
  } else if (sorted.includes("arena")) {
    out["role"] = "arena";
  } else if (sorted.includes("coach")) {
    out["role"] = "coach";
  } else if (sorted.includes("athlete")) {
    out["role"] = "athlete";
  } else {
```

- [ ] **Step 2: Write a failing test for the new role**

Create `functions/src/auth-roles.test.ts` (this file doesn't exist yet — `auth-roles.ts` has no test coverage currently, and we're about to change its priority chain, so it's worth covering):
```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {applyRolesToClaims, firestoreRolesPayload, isAllowedRole} from "./auth-roles";

describe("isAllowedRole", () => {
  it("accepts coach as a valid role", () => {
    assert.equal(isAllowedRole("coach"), true);
  });
});

describe("applyRolesToClaims", () => {
  it("sets roles list and legacy role=coach for a coach-only account", () => {
    const claims = applyRolesToClaims({}, ["coach"]);
    assert.deepEqual(claims["roles"], ["coach"]);
    assert.equal(claims["role"], "coach");
  });

  it("prefers arena over coach in the legacy role field for multi-role accounts", () => {
    const claims = applyRolesToClaims({}, ["coach", "arena"]);
    assert.equal(claims["role"], "arena");
  });

  it("prefers coach over athlete in the legacy role field", () => {
    const claims = applyRolesToClaims({}, ["coach", "athlete"]);
    assert.equal(claims["role"], "coach");
  });
});

describe("firestoreRolesPayload", () => {
  it("mirrors the same priority for the Firestore users/{uid} payload", () => {
    const payload = firestoreRolesPayload(["coach", "athlete"]);
    assert.deepEqual(payload["roles"], ["athlete", "coach"]);
    assert.equal(payload["role"], "coach");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails before the role-chain edit**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run build && node --test lib/auth-roles.test.js`
Expected: FAIL — `isAllowedRole("coach")` returns `false` and `applyRolesToClaims` never sets `role: "coach"` (Step 1 hasn't been applied yet, or was reverted for this check).

- [ ] **Step 4: Apply Step 1's edits, then re-run**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run build && node --test lib/auth-roles.test.js`
Expected: PASS — all 4 assertions succeed.

- [ ] **Step 5: Add the Firestore rules block**

In `firestore.rules`, insert this block immediately before the final catch-all comment (`// NEGAÇÃO padrão para caminhos não mapeados.`):

```
    // ── Portal do Treinador (coach) ─────────────────────────────
    // Dados do treinador são propriedade exclusiva do próprio treinador — é
    // ownership (uid do path == uid autenticado), não precisa de claim de
    // papel pra ler/escrever. A claim `coach` só importa pro guard de rota
    // no frontend. Operações que cruzam usuários (convite, convocação) têm
    // client write: false — só Cloud Functions (Admin SDK) escrevem.
    match /coaches/{coachUid} {
      allow read, write: if request.auth != null && request.auth.uid == coachUid;

      match /squads/{squadId} {
        allow read, write: if request.auth != null && request.auth.uid == coachUid;
      }
      match /athletes/{athleteUid} {
        allow read, write: if request.auth != null && request.auth.uid == coachUid;
      }
      match /trainings/{trainingId} {
        allow read, write: if request.auth != null && request.auth.uid == coachUid;
      }
      // Diferente das outras subcoleções: um atleta CONVOCADO também precisa
      // ler este doc (pra ver os detalhes antes de responder em /convocacao).
      // Escrita é sempre false — criação e resposta passam por Cloud Function
      // (Task 12): a criação faz Promise.all de notificações e a resposta é
      // de um usuário que não é dono do doc, então nenhum dos dois cabe em
      // client-write direto.
      match /callUps/{callUpId} {
        allow read: if request.auth != null && (
          request.auth.uid == coachUid ||
          request.auth.uid in resource.data.recipients
        );
        allow write: if false;
      }
      match /evaluations/{evalId} {
        allow read, write: if request.auth != null && request.auth.uid == coachUid;
      }
    }

    // Convite de vínculo treinador→atleta. Leitura só de quem participa;
    // escrita exclusiva via Cloud Function (aceite precisa validar estado e
    // criar coaches/{coachUid}/athletes/{athleteUid} numa transação).
    match /coachAthleteInvites/{inviteId} {
      allow read: if request.auth != null && (
        resource.data.coachUid == request.auth.uid ||
        resource.data.athleteUid == request.auth.uid
      );
      allow list: if request.auth != null;
      allow create, update, delete: if false;
    }

```

- [ ] **Step 6: Add the `coach` hosting target to `firebase.json`**

In `firebase.json`, `"hosting"` array, add (after the `"backoffice"` entry):
```json
    {
      "target": "coach",
      "public": "dist/coach/browser"
    },
```

- [ ] **Step 7: Create the dev Hosting site and wire the target alias**

Run (creates a new Hosting site in the **dev** project only — nothing touches prod):
```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
firebase hosting:sites:create coach-dev --project volley-track-dev-4596c
```
Expected: prints the new site's default URL (e.g. `https://coach-dev.web.app`). If `coach-dev` is already taken (site names are global across all Firebase projects), retry with `coach-dev2`, `coach-nexago-dev`, etc. until one succeeds — then use that exact name in the next command.

```bash
firebase target:apply hosting coach coach-dev --project volley-track-dev-4596c
```
Expected: updates `.firebaserc` automatically, adding `"coach": ["coach-dev"]` under `"targets"."volley-track-dev-4596c"."hosting"`. Verify with `git diff .firebaserc`.

- [ ] **Step 8: Deploy rules to dev to verify they compile**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago && firebase deploy --only firestore:rules --project volley-track-dev-4596c`
Expected: `Deploy complete!` with no rules compilation errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add functions/src/auth-roles.ts functions/src/auth-roles.test.ts firestore.rules firebase.json .firebaserc
git commit -m "feat(coach): add coach role claim, Firestore rules, and dev hosting target"
```

---

## Task 3: Cloud Function `completeCoachSignup`

**Files:**
- Create: `functions/src/coach-signup.ts`
- Create: `functions/src/coach-signup.test.ts`
- Modify: `functions/src/index.ts` (export the new function)

**Interfaces:**
- Consumes: `AppRole`, `rolesFromClaims`, `applyRolesToClaims`, `firestoreRolesPayload` from `./auth-roles` (Task 2).
- Produces: `withCoachRole(existingRoles: AppRole[]): AppRole[]` (pure, exported for the test). `completeCoachSignup` callable — Task 4's signup screen calls this via `httpsCallable(functions, 'completeCoachSignup')({ displayName, phone })` right after `createUserWithEmailAndPassword`. Writes `coaches/{uid}` (`displayName`, `phone?`, `createdAt`) and merges the `coach` role into `users/{uid}`.

- [ ] **Step 1: Write the failing test for the pure role-merge helper**

Create `functions/src/coach-signup.test.ts`:
```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {withCoachRole} from "./coach-signup";

describe("withCoachRole", () => {
  it("adds coach when the user has no roles yet", () => {
    assert.deepEqual(withCoachRole([]), ["coach"]);
  });

  it("adds coach alongside an existing role", () => {
    assert.deepEqual(withCoachRole(["athlete"]), ["athlete", "coach"]);
  });

  it("is a no-op when coach is already present", () => {
    assert.deepEqual(withCoachRole(["coach"]), ["coach"]);
  });

  it("never drops existing roles", () => {
    assert.deepEqual(withCoachRole(["athlete", "arena"]), ["athlete", "arena", "coach"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run build && node --test lib/coach-signup.test.js`
Expected: FAIL — `Cannot find module './coach-signup'` (file doesn't exist yet).

- [ ] **Step 3: Implement `coach-signup.ts`**

Create `functions/src/coach-signup.ts`:
```ts
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  type AppRole,
  applyRolesToClaims,
  firestoreRolesPayload,
  rolesFromClaims,
} from "./auth-roles";

/**
 * Garante que `coach` está entre os papéis do usuário, preservando os que já
 * existiam (ex.: já é atleta) — nunca reduz acesso.
 */
export function withCoachRole(existingRoles: AppRole[]): AppRole[] {
  return existingRoles.includes("coach") ? existingRoles : [...existingRoles, "coach"];
}

/**
 * Chamada uma vez pelo client logo após `createUserWithEmailAndPassword` no
 * autocadastro do treinador. Define a claim `coach` (via Admin SDK — nunca
 * client-write direto) e cria o perfil em `coaches/{uid}`.
 */
export const completeCoachSignup = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const displayName = (request.data?.displayName as string | undefined)?.trim() ?? "";
  const phone = (request.data?.phone as string | undefined)?.trim() ?? "";
  if (!displayName) {
    throw new HttpsError("invalid-argument", "Nome é obrigatório.");
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);
  const existingRoles = rolesFromClaims(user.customClaims);
  const nextRoles = withCoachRole(existingRoles);

  const nextClaims = applyRolesToClaims(
    (user.customClaims || {}) as Record<string, unknown>,
    nextRoles,
  );
  await auth.setCustomUserClaims(uid, nextClaims);

  const db = getFirestore();
  await db.doc(`users/${uid}`).set(
    {
      uid,
      email: user.email ?? "",
      displayName,
      ...firestoreRolesPayload(nextRoles),
    },
    {merge: true},
  );

  await db.doc(`coaches/${uid}`).set(
    {
      displayName,
      ...(phone ? {phone} : {}),
      createdAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  logger.info("Coach signup completed", {uid});
  return {ok: true};
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run build && node --test lib/coach-signup.test.js`
Expected: PASS — all 4 assertions succeed.

- [ ] **Step 5: Export the function from `index.ts`**

At the end of `functions/src/index.ts`, add:
```ts
export {completeCoachSignup} from "./coach-signup";
```

- [ ] **Step 6: Lint and build the whole functions package**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run lint && npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Deploy to dev**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago && firebase deploy --only functions:completeCoachSignup --project volley-track-dev-4596c`
Expected: `Deploy complete!`

- [ ] **Step 8: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add functions/src/coach-signup.ts functions/src/coach-signup.test.ts functions/src/index.ts
git commit -m "feat(coach): add completeCoachSignup Cloud Function"
```

---

## Task 4: Auth flow (login, signup, guards)

**Files:**
- Create (via `cp` then targeted edits): `frontend/projects/coach/src/app/auth/auth.guard.ts`, `firebase-auth-errors.ts`, `email-sent.component.ts`, `reset-password.component.ts`, `forgot-password.component.ts`, `ui/field.component.ts`, `ui/strength-meter.component.ts`, `ui/auth-shell.component.ts`
- Create (full rewrite): `frontend/projects/coach/src/app/auth/auth.service.ts`, `login.component.ts`, `signup.component.ts`
- Create (new, no precedent): `frontend/projects/coach/src/app/auth/coach.guard.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts` (replaces the Task 1 placeholder)

**Interfaces:**
- Produces: `AuthService` — `authReady: Signal<boolean>`, `isAuthenticated: Signal<boolean>`, `isCoach: Signal<boolean>`, `displayName: Signal<string | null>`, `user: Signal<User | null>`, `signInWithEmail(email, password, remember)`, `createCoachAccount(email, password, displayName, phone)`, `sendPasswordReset(email)`, `verifyResetCode(code)`, `confirmReset(code, newPassword)`, `signOutUser()`. Every later screen task injects this for the sidebar's user footer and route guarding.
- Produces: `authGuard` (must be logged in), `coachGuard` (must additionally have the `coach` role claim) — every `/painel/**` route in later tasks uses `canActivate: [authGuard, coachGuard]`.

- [ ] **Step 1: Copy the whole `auth/` folder from `arena` and rename the selector prefix**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects
mkdir -p coach/src/app/auth/ui
cp arena/src/app/auth/auth.guard.ts coach/src/app/auth/auth.guard.ts
cp arena/src/app/auth/firebase-auth-errors.ts coach/src/app/auth/firebase-auth-errors.ts
cp arena/src/app/auth/email-sent.component.ts coach/src/app/auth/email-sent.component.ts
cp arena/src/app/auth/reset-password.component.ts coach/src/app/auth/reset-password.component.ts
cp arena/src/app/auth/forgot-password.component.ts coach/src/app/auth/forgot-password.component.ts
cp arena/src/app/auth/ui/field.component.ts coach/src/app/auth/ui/field.component.ts
cp arena/src/app/auth/ui/strength-meter.component.ts coach/src/app/auth/ui/strength-meter.component.ts
cp arena/src/app/auth/ui/auth-shell.component.ts coach/src/app/auth/ui/auth-shell.component.ts

# Rename the ar- selector/class prefix to co- across the copied files
# (auth.guard.ts and firebase-auth-errors.ts have no ar- references, left untouched).
sed -i '' 's/ar-email-sent/co-email-sent/; s/ar-reset-password/co-reset-password/; s/ar-forgot-password/co-forgot-password/; s/ar-field/co-field/g; s/ar-strength-meter/co-strength-meter/g; s/ar-auth-shell/co-auth-shell/g' \
  coach/src/app/auth/email-sent.component.ts \
  coach/src/app/auth/reset-password.component.ts \
  coach/src/app/auth/forgot-password.component.ts \
  coach/src/app/auth/ui/field.component.ts \
  coach/src/app/auth/ui/strength-meter.component.ts \
  coach/src/app/auth/ui/auth-shell.component.ts

sed -i '' "s/fieldId = \`ar-field-/fieldId = \`co-field-/" coach/src/app/auth/ui/field.component.ts
```

- [ ] **Step 2: Verify the mechanical rename left no stray `ar-` references**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/coach && grep -rn "ar-" src/app/auth/ --include="*.ts" | grep -v "arena\|aria-"`
Expected: no output (the only remaining `ar-` substrings should be inside words like `aria-` or unrelated text — none in this set of files).

- [ ] **Step 3: Rewrite the auth-shell copy for the coach positioning**

In `coach/src/app/auth/ui/auth-shell.component.ts`, replace the two `<div class="tag">Painel da arena</div>` occurrences with `<div class="tag">Painel do treinador</div>`, and replace the `.message` block content:
```html
        <div class="message">
          <div class="kicker">Gestão da sua arena</div>
          <h2>Sua arena,<br />sob controle total.</h2>
          <p>Agenda, financeiro, torneios e equipe — tudo que roda na sua quadra, num painel só.</p>
        </div>
```
with:
```html
        <div class="message">
          <div class="kicker">Gestão da sua equipe</div>
          <h2>Seus atletas,<br />sob controle total.</h2>
          <p>Treinos, presença, avaliações e torneios — tudo que roda na sua comissão técnica, num painel só.</p>
        </div>
```
And replace `Acesso exclusivo de parceiros NexaGO` with `Acesso exclusivo de treinadores NexaGO`.

- [ ] **Step 4: Rewrite the forgot-password copy**

In `coach/src/app/auth/forgot-password.component.ts`, replace:
```html
          <p>Informa o e-mail cadastrado da arena e a gente manda um link de redefinição.</p>
```
with:
```html
          <p>Informa o e-mail cadastrado do treinador e a gente manda um link de redefinição.</p>
```
and replace:
```html
        <ar-field
          label="E-mail da arena"
```
(now `co-field` after Step 1's rename) — change the `label` attribute value to `"E-mail do treinador"`.

- [ ] **Step 5: Write `auth.service.ts`**

Create `frontend/projects/coach/src/app/auth/auth.service.ts`:
```ts
import { Injectable, computed, signal } from '@angular/core';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly firebaseUser = signal<User | null>(null);
  /** updateProfile() muta o User do Firebase in-place; sem isso, signals que leem user()?.displayName não notificariam. */
  private readonly displayNameOverride = signal<string | null>(null);
  private readonly roleClaims = signal<string[]>([]);

  readonly authReady = signal(false);
  readonly user = computed(() => this.firebaseUser());
  readonly isAuthenticated = computed(() => this.firebaseUser() != null);
  readonly isCoach = computed(() => this.roleClaims().includes('coach'));
  readonly displayName = computed(
    () => this.displayNameOverride() ?? this.firebaseUser()?.displayName ?? null,
  );

  private readonly app: FirebaseApp;

  constructor() {
    this.app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
    onAuthStateChanged(this.auth, async (u) => {
      this.firebaseUser.set(u);
      this.displayNameOverride.set(null);
      this.roleClaims.set(u ? await this.readRoleClaims(u) : []);
      this.authReady.set(true);
    });
  }

  private get auth(): Auth {
    return getAuth(this.app);
  }

  private get functions(): Functions {
    return getFunctions(this.app);
  }

  private async readRoleClaims(user: User): Promise<string[]> {
    const token = await user.getIdTokenResult();
    const roles = token.claims['roles'];
    return Array.isArray(roles) ? roles.map(String) : [];
  }

  /** `remember=false` derruba a sessão ao fechar o navegador (browserSessionPersistence). */
  async signInWithEmail(email: string, password: string, remember: boolean): Promise<void> {
    await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(this.auth, email.trim(), password);
  }

  async sendPasswordReset(email: string): Promise<void> {
    const settings = { url: `${location.origin}/entrar` };
    try {
      await sendPasswordResetEmail(this.auth, email.trim(), settings);
    } catch (error) {
      // Domínio de continuação não autorizado no console → envia sem continueUrl.
      if (
        error != null &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code === 'auth/unauthorized-continue-uri'
      ) {
        await sendPasswordResetEmail(this.auth, email.trim());
        return;
      }
      throw error;
    }
  }

  /** Valida o oobCode do link de redefinição e retorna o e-mail da conta. */
  async verifyResetCode(code: string): Promise<string> {
    return verifyPasswordResetCode(this.auth, code);
  }

  async confirmReset(code: string, newPassword: string): Promise<void> {
    await confirmPasswordReset(this.auth, code, newPassword);
  }

  /** Cria a conta do treinador (Firebase Auth) e completa o autocadastro via
   *  Cloud Function, que define a claim `coach` e cria `coaches/{uid}` — o
   *  client nunca escreve claims/perfil diretamente. Força o refresh do ID
   *  token pra `isCoach()` já refletir a claim nova sem precisar relogar. */
  async createCoachAccount(email: string, password: string, displayName: string, phone: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    await updateProfile(credential.user, { displayName: displayName.trim() });

    const complete = httpsCallable(this.functions, 'completeCoachSignup');
    await complete({ displayName: displayName.trim(), phone: phone.trim() });

    const refreshed = await credential.user.getIdTokenResult(true);
    const roles = refreshed.claims['roles'];
    this.roleClaims.set(Array.isArray(roles) ? roles.map(String) : []);
  }

  async signOutUser(): Promise<void> {
    await signOut(this.auth);
  }
}
```

- [ ] **Step 6: Write `coach.guard.ts`**

Create `frontend/projects/coach/src/app/auth/coach.guard.ts`:
```ts
import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from './auth.service';

/**
 * Bloqueia /painel pra quem está autenticado mas não tem a claim `coach`
 * (ex.: atleta que nunca completou o autocadastro de treinador). Assume
 * `authGuard` já rodou antes na mesma rota — não checa `isAuthenticated`.
 */
export const coachGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return toObservable(auth.authReady).pipe(
    filter((ready) => ready),
    take(1),
    map(() => {
      if (auth.isCoach()) {
        return true;
      }
      return router.createUrlTree(['/entrar']);
    }),
  );
};
```

- [ ] **Step 7: Write `login.component.ts`**

Create `frontend/projects/coach/src/app/auth/login.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';

@Component({
  selector: 'co-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent],
  template: `
    <co-auth-shell>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <header class="co-form-header">
          <span class="co-kicker">Entrar</span>
          <h1>Acesse seu painel.</h1>
          <p>Entre com a conta do treinador pra gerenciar atletas, treinos e presença.</p>
        </header>

        @if (error(); as err) {
          <div class="co-alert" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {{ err }}
          </div>
        }

        <div class="co-stack">
          <co-field
            label="E-mail"
            type="email"
            placeholder="voce@email.com"
            autocomplete="email"
            formControlName="email"
            [error]="emailError()"
          />
          <co-field
            label="Senha"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            formControlName="password"
            [error]="passwordError()"
          />
        </div>

        <div class="co-row-between">
          <label class="co-remember">
            <input
              type="checkbox"
              class="co-checkbox-input"
              formControlName="remember"
            />
            <span class="co-checkbox-box" aria-hidden="true">
              @if (rememberValue()) {
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              }
            </span>
            Manter conectado
          </label>
          <a class="co-text-link" routerLink="/entrar/recuperar">Esqueceu a senha?</a>
        </div>

        <button class="co-btn-primary" type="submit" [disabled]="loading()">
          @if (loading()) {
            <span class="co-spinner" aria-hidden="true"></span>
            Entrando…
          } @else {
            Entrar no painel
          }
        </button>

        <p class="co-fine">
          Ainda não tem conta? <a class="co-text-link" routerLink="/cadastro">Cadastrar como treinador</a>
        </p>
      </form>
    </co-auth-shell>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    remember: [true],
  });

  protected readonly rememberValue = toSignal(this.form.controls.remember.valueChanges, {
    initialValue: true,
  });

  protected emailError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    const control = this.form.controls.email;
    if (control.hasError('required')) {
      return 'Informe o e-mail.';
    }
    if (control.hasError('email')) {
      return 'E-mail inválido.';
    }
    return null;
  }

  protected passwordError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    return this.form.controls.password.hasError('required') ? 'Informe a senha.' : null;
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    try {
      const { email, password, remember } = this.form.getRawValue();
      await this.auth.signInWithEmail(email, password, remember);
      this.redirectAfterLogin();
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }

  private redirectAfterLogin(): void {
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    const target = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/painel';
    void this.router.navigateByUrl(target);
  }
}
```

- [ ] **Step 8: Write `signup.component.ts`**

Create `frontend/projects/coach/src/app/auth/signup.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';
import { StrengthMeterComponent } from './ui/strength-meter.component';

/** Autocadastro do treinador — cria a conta e completa o papel `coach` via
 *  Cloud Function. Sem etapa de verificação: o painel fica disponível assim
 *  que a conta é criada (diferente do fluxo de arena, que passa por revisão). */
@Component({
  selector: 'co-signup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent, StrengthMeterComponent],
  template: `
    <co-auth-shell>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <a class="co-back-link" routerLink="/entrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Voltar pro login
        </a>

        <header class="co-form-header">
          <span class="co-kicker">Cadastrar treinador</span>
          <h1>Leve sua comissão técnica pro NexaGO.</h1>
          <p>Alguns dados básicos pra criar seu painel. Você adiciona atletas e equipes depois.</p>
        </header>

        @if (error(); as err) {
          <div class="co-alert" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {{ err }}
          </div>
        }

        <div class="co-stack">
          <co-field
            label="Nome completo"
            placeholder="Carla Mendes"
            autocomplete="name"
            formControlName="nome"
            [error]="fieldError('nome', 'Informe seu nome completo.')"
          />

          <div class="co-grid-2">
            <co-field
              label="Telefone"
              type="tel"
              placeholder="(62) 99999-0000"
              autocomplete="tel"
              formControlName="telefone"
              [error]="fieldError('telefone', 'Informe seu telefone.')"
            />
            <co-field
              label="E-mail"
              type="email"
              placeholder="voce@email.com"
              autocomplete="email"
              formControlName="email"
              [error]="emailError()"
            />
          </div>

          <div class="co-stack-sm">
            <co-field
              label="Senha"
              type="password"
              placeholder="••••••••"
              autocomplete="new-password"
              formControlName="password"
              [error]="passwordError()"
            />
            <co-strength-meter [password]="passwordValue()" />
          </div>
        </div>

        <div style="margin-top: 24px;">
          <button class="co-btn-primary" type="submit" [disabled]="loading()">
            @if (loading()) {
              <span class="co-spinner" aria-hidden="true"></span>
              Criando conta…
            } @else {
              Criar painel do treinador
            }
          </button>
        </div>
      </form>
    </co-auth-shell>
  `,
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    nome: ['', Validators.required],
    telefone: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly passwordValue = toSignal(this.form.controls.password.valueChanges, {
    initialValue: '',
  });

  protected fieldError(control: 'nome' | 'telefone', message: string): string | null {
    if (!this.submitted()) {
      return null;
    }
    return this.form.controls[control].hasError('required') ? message : null;
  }

  protected emailError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    const control = this.form.controls.email;
    if (control.hasError('required')) {
      return 'Informe o e-mail.';
    }
    if (control.hasError('email')) {
      return 'E-mail inválido.';
    }
    return null;
  }

  protected passwordError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    const control = this.form.controls.password;
    if (control.hasError('required')) {
      return 'Crie uma senha.';
    }
    if (control.hasError('minlength')) {
      return 'A senha precisa de pelo menos 8 caracteres.';
    }
    return null;
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    try {
      const { nome, telefone, email, password } = this.form.getRawValue();
      await this.auth.createCoachAccount(email, password, nome, telefone);
      void this.router.navigateByUrl('/painel');
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 9: Replace `app.routes.ts`** (removes the Task 1 placeholder; `/painel` gets a temporary placeholder guarded by both guards, replaced by the real shell in Task 5)

Replace `frontend/projects/coach/src/app/app.routes.ts` entirely:
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { coachGuard } from './auth/coach.guard';

@Component({
  selector: 'app-painel-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="font-family: system-ui; padding: 24px; color: #F4F4F5; background: #050505; min-height: 100dvh; margin: 0;">Painel do treinador — em construção.</p>`,
})
class PainelPlaceholderComponent {}

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'entrar' },
  {
    path: 'entrar',
    title: 'Entrar — NexaGO Treinador',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'entrar/recuperar',
    title: 'Recuperar senha — NexaGO Treinador',
    loadComponent: () =>
      import('./auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'entrar/enviado',
    title: 'E-mail enviado — NexaGO Treinador',
    loadComponent: () => import('./auth/email-sent.component').then((m) => m.EmailSentComponent),
  },
  {
    path: 'entrar/redefinir',
    title: 'Redefinir senha — NexaGO Treinador',
    loadComponent: () =>
      import('./auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'cadastro',
    title: 'Cadastrar treinador — NexaGO Treinador',
    loadComponent: () => import('./auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'painel',
    title: 'Painel — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    component: PainelPlaceholderComponent,
  },
  { path: '**', redirectTo: '' },
];
```

- [ ] **Step 10: Build and manually verify the flow**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds, no TypeScript errors.

Run: `npx ng serve coach` and manually walk through in a browser (this codebase has no e2e test harness for the web frontends — arena/backoffice rely on manual verification too, per `docs/superpowers/specs/2026-07-09-arena-painel-web-design.md`'s "Testes" section):
1. Open `/cadastro`, fill the form, submit → should land on `/painel` showing "Painel do treinador — em construção." (not bounced to `/entrar`, which would mean the `coach` claim didn't stick).
2. Open `/entrar` in a new incognito window, sign in with the same account → should also land on `/painel`.
3. Open `/entrar/recuperar`, submit an email → should land on `/entrar/enviado`.

Expected: all three steps behave as described; no console errors.

- [ ] **Step 11: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/auth frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add auth flow (login, signup, guards)"
```

---

## Task 5: Shared panel shell (sidebar, team switcher, icon/card/pill primitives)

**Files:**
- Create (via `cp` then rename): `frontend/projects/coach/src/app/painel/ui/page-header.component.ts`, `panel-card.component.ts`, `pill.component.ts`, `initials.ts`
- Create (new): `frontend/projects/coach/src/app/painel/ui/icon.component.ts`, `squad-context.service.ts`, `panel-shell.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts` (the `/painel` placeholder now renders inside the real shell)

**Interfaces:**
- Produces: `IconComponent` (selector `co-icon`, `PanelIconName` union), `PageHeaderComponent` (`co-page-header`, inputs `title`/`subtitle`), `PanelCardComponent` (`co-panel-card`, inputs `title`/`kicker`/`pad`/`accent`), `PillComponent` (`co-pill`, input `tone: PillTone`), `initialsOf(name: string): string`, `PanelShellComponent` (`co-panel-shell`, wraps `<ng-content>` with the sidebar). Every screen task (6 onward) imports these.
- Produces: `SquadContextService` — `squads: Signal<SquadSummary[]>`, `activeSquadId: Signal<string | null>`, `activeSquad: Signal<SquadSummary | null>`, `setSquads(list)`, `setActiveSquad(id)`. Task 7 (Equipes) is the first to call `setSquads`/`setActiveSquad` with real Firestore data; every squad-scoped screen (Treinos, Presença, Avaliações, Convocações) reads `activeSquadId()` to filter its queries.

- [ ] **Step 1: Copy the generic primitives from `arena` and rename the prefix**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects
mkdir -p coach/src/app/painel/ui
cp arena/src/app/painel/ui/page-header.component.ts coach/src/app/painel/ui/page-header.component.ts
cp arena/src/app/painel/ui/panel-card.component.ts coach/src/app/painel/ui/panel-card.component.ts
cp arena/src/app/painel/ui/pill.component.ts coach/src/app/painel/ui/pill.component.ts
cp arena/src/app/painel/ui/initials.ts coach/src/app/painel/ui/initials.ts

sed -i '' 's/ar-page-header/co-page-header/' coach/src/app/painel/ui/page-header.component.ts
sed -i '' 's/ar-panel-card/co-panel-card/' coach/src/app/painel/ui/panel-card.component.ts
sed -i '' 's/ar-pill/co-pill/' coach/src/app/painel/ui/pill.component.ts
```

- [ ] **Step 2: Verify the rename left no stray references**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/coach && grep -rn "'ar-" src/app/painel/ui/`
Expected: no output.

- [ ] **Step 3: Write `icon.component.ts`** (arena's `IconComponent` plus two new cases — `clipboard` for Treinos, `radar` for Avaliações — that don't exist in arena's set)

Create `frontend/projects/coach/src/app/painel/ui/icon.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

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

/** Ícones stroke-24 do painel do treinador (protótipo Tr\*Ic\*), um componente pra evitar repetir SVG. */
@Component({
  selector: 'co-icon',
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
        @case ('trophy') {
          <path d="M8 21h8M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" />
          <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
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
        @case ('check') {
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        }
        @case ('clock') {
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
        }
        @case ('clipboard') {
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" />
          <path d="M8.5 11h7M8.5 15h7" />
        }
        @case ('radar') {
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
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

- [ ] **Step 4: Write `squad-context.service.ts`**

Create `frontend/projects/coach/src/app/painel/ui/squad-context.service.ts`:
```ts
import { Injectable, computed, signal } from '@angular/core';

export interface SquadSummary {
  id: string;
  name: string;
  initials: string;
}

/**
 * Estado compartilhado de "equipe ativa". Treinos, presença, avaliações e
 * convocações são sempre filtrados pela equipe selecionada aqui. Populado
 * pelo SquadsService (Task 7) assim que as equipes reais são carregadas —
 * até lá fica vazio, e o seletor da sidebar mostra "Nenhuma equipe".
 */
@Injectable({ providedIn: 'root' })
export class SquadContextService {
  readonly squads = signal<SquadSummary[]>([]);
  readonly activeSquadId = signal<string | null>(null);

  readonly activeSquad = computed(
    () => this.squads().find((s) => s.id === this.activeSquadId()) ?? null,
  );

  /** Substitui a lista de equipes; se a equipe ativa não existir mais na lista nova, cai pra primeira (ou null). */
  setSquads(list: SquadSummary[]): void {
    this.squads.set(list);
    const current = this.activeSquadId();
    if (!current || !list.some((s) => s.id === current)) {
      this.activeSquadId.set(list[0]?.id ?? null);
    }
  }

  setActiveSquad(id: string): void {
    this.activeSquadId.set(id);
  }
}
```

- [ ] **Step 5: Write `panel-shell.component.ts`**

Create `frontend/projects/coach/src/app/painel/ui/panel-shell.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { IconComponent, type PanelIconName } from './icon.component';
import { initialsOf } from './initials';
import { SquadContextService } from './squad-context.service';

interface PanelNavItem {
  id: string;
  label: string;
  icon: PanelIconName;
  route: string;
}

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

function pathOnly(url: string): string {
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

/** Shell do painel do treinador: sidebar fixa (protótipo TrPanelShell/TrSidebar) + conteúdo projetado. */
@Component({
  selector: 'co-panel-shell',
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
            <div class="tag">Treinador</div>
          </div>
        </div>

        <div class="switcher">
          <div class="switcher-avatar" aria-hidden="true">{{ activeSquadInitials() }}</div>
          <div class="switcher-body">
            <div class="switcher-name">{{ activeSquadName() }}</div>
            <div class="switcher-meta">{{ squadCountLabel() }}</div>
          </div>
          <co-icon name="chevron-right" [size]="13" style="color: var(--nx-text-dim); transform: rotate(90deg)" />
        </div>

        <nav class="nav">
          <div class="nav-kicker">Comissão técnica</div>
          @for (item of navItems; track item.id) {
            <a class="nav-item" [class.active]="activeId() === item.id" [routerLink]="item.route">
              <co-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="spacer"></div>

        <div class="user-row">
          <div class="avatar" aria-hidden="true">{{ initials() }}</div>
          <div class="who">
            <div class="who-name">{{ displayName() }}</div>
            <div class="who-role">Treinador(a)</div>
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
      grid-template-columns: 224px 1fr;
      background: var(--nx-bg);
      color: var(--nx-text);
    }

    .sidebar {
      background: #070708;
      border-right: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      padding: 18px 14px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 2px 8px 0;
    }

    .mark {
      width: 30px;
      height: 30px;
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
      font-size: 14.5px;
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
      background: linear-gradient(135deg, #ff8a4a 0%, #2260b8 100%);
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
      gap: 1px;
      margin-top: 18px;
    }

    .nav-kicker {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      padding: 0 12px;
      margin-bottom: 6px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 38px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      letter-spacing: -0.005em;
      position: relative;
      text-decoration: none;
      cursor: pointer;
      transition: background 140ms var(--nx-ease-out);
    }

    .nav-item:hover {
      background: var(--nx-surface-1);
    }

    .nav-item.active {
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }

    .nav-item.active span {
      color: var(--nx-text);
    }

    .nav-item.active::before {
      content: '';
      position: absolute;
      left: -14px;
      top: 9px;
      bottom: 9px;
      width: 3px;
      border-radius: 2px;
      background: var(--nx-orange-500);
    }

    .spacer {
      flex: 1;
    }

    .user-row {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .avatar {
      width: 30px;
      height: 30px;
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
      font-size: 12px;
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
  private readonly squadContext = inject(SquadContextService);

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
    const exact = NAV_ITEMS.find((item) => item.route === path);
    if (exact) {
      return exact.id;
    }
    const nested = NAV_ITEMS.find((item) => item.route !== '/painel' && path.startsWith(item.route + '/'));
    return nested?.id ?? null;
  });

  protected readonly displayName = computed(
    () => this.auth.displayName() || this.auth.user()?.email || 'Conta',
  );

  protected readonly initials = computed(() => initialsOf(this.displayName()));

  protected readonly activeSquadName = computed(() => this.squadContext.activeSquad()?.name ?? 'Nenhuma equipe');
  protected readonly activeSquadInitials = computed(() => this.squadContext.activeSquad()?.initials ?? '·');
  protected readonly squadCountLabel = computed(() => {
    const n = this.squadContext.squads().length;
    if (n === 0) {
      return 'Crie sua primeira equipe';
    }
    return n === 1 ? '1 equipe' : `${n} equipes`;
  });
}
```

- [ ] **Step 6: Wrap the `/painel` placeholder in the real shell**

In `frontend/projects/coach/src/app/app.routes.ts`, replace the `PainelPlaceholderComponent` definition:
```ts
@Component({
  selector: 'app-painel-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="font-family: system-ui; padding: 24px; color: #F4F4F5; background: #050505; min-height: 100dvh; margin: 0;">Painel do treinador — em construção.</p>`,
})
class PainelPlaceholderComponent {}
```
with:
```ts
import { PanelShellComponent } from './painel/ui/panel-shell.component';

@Component({
  selector: 'app-painel-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent],
  template: `
    <co-panel-shell>
      <p style="font-family: system-ui; padding: 24px; color: var(--nx-text-dim);">Início — em construção (Task 17).</p>
    </co-panel-shell>
  `,
})
class PainelPlaceholderComponent {}
```
(add the `import { PanelShellComponent } from './painel/ui/panel-shell.component';` line alongside the existing `Component`/`Routes`/`authGuard`/`coachGuard` imports at the top of the file).

- [ ] **Step 7: Build and manually verify the shell**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds.

Run `npx ng serve coach`, log in, land on `/painel`. Expected: sidebar renders with all 10 nav items in the order above, "Início" is highlighted (orange background + left accent bar), the team switcher shows "Nenhuma equipe" / "Crie sua primeira equipe" (no squads exist yet — that's expected until Task 7), user footer shows your name's initials. Other nav links will bounce to `/entrar` when clicked (their routes don't exist until later tasks) — that's expected at this point, not a bug to fix now.

- [ ] **Step 8: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/ui frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add shared panel shell and UI primitives"
```

---

## Task 6: Remaining shared atoms (KPI card, avatar, progress bar, radar chart, tabs, row, form fields)

**Files:**
- Create: `frontend/projects/coach/src/app/painel/ui/kpi-card.component.ts`
- Create: `frontend/projects/coach/src/app/painel/ui/athlete-avatar.component.ts`
- Create: `frontend/projects/coach/src/app/painel/ui/progress-bar.component.ts`
- Create: `frontend/projects/coach/src/app/painel/ui/radar-geometry.ts`
- Create: `frontend/projects/coach/src/app/painel/ui/radar-geometry.spec.ts`
- Create: `frontend/projects/coach/src/app/painel/ui/radar-chart.component.ts`
- Create: `frontend/projects/coach/src/app/painel/ui/tabs.component.ts`
- Create: `frontend/projects/coach/src/app/painel/ui/row.component.ts`
- Create: `frontend/projects/coach/src/app/painel/ui/form-field.component.ts`
- Create: `frontend/projects/coach/src/app/painel/ui/form-textarea.component.ts`
- Create: `frontend/projects/coach/src/app/painel/ui/form-select.component.ts`

**Interfaces:**
- Consumes: `IconComponent`/`PanelIconName` from `./icon.component` (Task 5).
- Produces: `KpiCardComponent` (`co-kpi-card`, inputs `label`/`value`/`delta`/`deltaTone: KpiTone`/`icon: PanelIconName | null`), `AthleteAvatarComponent` (`co-athlete-avatar`, inputs `initials`/`size`/`status: AthleteStatus`), `ProgressBarComponent` (`co-progress-bar`, inputs `pct`/`tone: ProgressTone`/`height`), `RadarChartComponent` (`co-radar-chart`, inputs `axes: RadarAxis[]`/`size`/`accent`), `TabsComponent` (`co-tabs`, inputs `tabs`/`active`, output `change`), `RowComponent` (`co-row`, inputs `title`/`sub`/`last`, content-projects `[row-avatar]`/`[row-trailing]`), `FormFieldComponent`/`FormTextareaComponent`/`FormSelectComponent` (`co-form-field`/`co-form-textarea`/`co-form-select`, all `ControlValueAccessor` for use with `formControlName`). Every screen task from 7 onward uses these instead of ad-hoc markup.
- `AthleteStatus = 'ativo' | 'lesionado' | 'afastado' | 'ferias'` — this is the canonical status union used everywhere a roster athlete is displayed (Task 9's `AthletesService` reads/writes this exact type).

- [ ] **Step 1: Write the failing test for the radar geometry**

Create `frontend/projects/coach/src/app/painel/ui/radar-geometry.spec.ts`:
```ts
import { radarPointAt, radarDataPoints, pointsToSvgAttr, type RadarAxis } from './radar-geometry';

describe('radarPointAt', () => {
  it('places the first axis straight up from center', () => {
    const p = radarPointAt(100, 50, 0, 4);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });

  it('places the second of 4 axes to the right of center', () => {
    const p = radarPointAt(100, 50, 1, 4);
    expect(p.x).toBeCloseTo(150, 5);
    expect(p.y).toBeCloseTo(100, 5);
  });
});

describe('radarDataPoints', () => {
  it('scales each axis value (0-10) as a fraction of the radius', () => {
    const axes: RadarAxis[] = [
      { label: 'Saque', value: 10 },
      { label: 'Recepção', value: 5 },
    ];
    const points = radarDataPoints(axes, 100, 50);
    expect(points).toHaveSize(2);
    // Saque = 10/10 = full radius, straight up from center.
    expect(points[0].x).toBeCloseTo(100, 5);
    expect(points[0].y).toBeCloseTo(50, 5);
  });
});

describe('pointsToSvgAttr', () => {
  it('joins points as an SVG polygon points string', () => {
    expect(pointsToSvgAttr([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('1,2 3,4');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: FAIL — `Cannot find module './radar-geometry'` (file doesn't exist yet).

- [ ] **Step 3: Implement `radar-geometry.ts`**

Create `frontend/projects/coach/src/app/painel/ui/radar-geometry.ts`:
```ts
export interface RadarAxis {
  label: string;
  value: number; // 0-10
}

export interface RadarPoint {
  x: number;
  y: number;
}

function axisAngle(index: number, count: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / count;
}

export function radarPointAt(center: number, radius: number, index: number, count: number): RadarPoint {
  const angle = axisAngle(index, count);
  return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}

export function radarRingPoints(axes: RadarAxis[], center: number, radius: number, fraction: number): RadarPoint[] {
  return axes.map((_, i) => radarPointAt(center, radius * fraction, i, axes.length));
}

export function radarAxisLinePoints(axes: RadarAxis[], center: number, radius: number): RadarPoint[] {
  return axes.map((_, i) => radarPointAt(center, radius, i, axes.length));
}

export function radarDataPoints(axes: RadarAxis[], center: number, radius: number): RadarPoint[] {
  return axes.map((a, i) => radarPointAt(center, (a.value / 10) * radius, i, axes.length));
}

export function radarLabelPoints(axes: RadarAxis[], center: number, radius: number, labelOffset: number): RadarPoint[] {
  return axes.map((_, i) => radarPointAt(center, radius + labelOffset, i, axes.length));
}

export function pointsToSvgAttr(points: RadarPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: PASS — all assertions succeed (this also compiles every `.spec.ts` under `coach`, so it re-validates Task 5's files too).

- [ ] **Step 5: Write `kpi-card.component.ts`**

Create `frontend/projects/coach/src/app/painel/ui/kpi-card.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, type PanelIconName } from './icon.component';

export type KpiTone = 'green' | 'orange' | 'red' | 'flat';

/** Card de indicador (protótipo TrKpiCard) — usado em Início, Presença, Avaliações e Torneios. */
@Component({
  selector: 'co-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="card">
      <div class="head">
        <div class="label">{{ label() }}</div>
        @if (icon(); as ic) {
          <co-icon [name]="ic" [size]="14" style="color: var(--nx-text-dim)" />
        }
      </div>
      <div class="value">{{ value() }}</div>
      @if (delta()) {
        <div class="delta" [class]="'tone-' + deltaTone()">{{ delta() }}</div>
      }
    </div>
  `,
  styles: `
    .card {
      flex: 1;
      min-width: 0;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 18px;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
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
      font-size: 27px;
      letter-spacing: -0.03em;
      line-height: 1;
      color: var(--nx-text);
      margin-bottom: 8px;
    }
    .delta {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 700;
      color: var(--nx-text-dim);
    }
    .delta.tone-green { color: var(--nx-win); }
    .delta.tone-orange { color: var(--nx-orange-500); }
    .delta.tone-red { color: var(--nx-live); }
  `,
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly delta = input('');
  readonly deltaTone = input<KpiTone>('green');
  readonly icon = input<PanelIconName | null>(null);
}
```

- [ ] **Step 6: Write `athlete-avatar.component.ts`**

Create `frontend/projects/coach/src/app/painel/ui/athlete-avatar.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AthleteStatus = 'ativo' | 'lesionado' | 'afastado' | 'ferias';

const STATUS_COLOR: Record<AthleteStatus, string> = {
  ativo: 'var(--nx-win)',
  lesionado: 'var(--nx-live)',
  afastado: 'var(--nx-pending)',
  ferias: 'var(--nx-text-dim)',
};

/** Avatar com anel de status (protótipo TrAthleteAvatar) — ativo/lesionado/afastado/férias. */
@Component({
  selector: 'co-athlete-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" [style.width.px]="size()" [style.height.px]="size()">
      <div class="circle" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.32">
        {{ initials() }}
      </div>
      <span class="dot" [style.background]="statusColor()"></span>
    </div>
  `,
  styles: `
    .wrap {
      position: relative;
      flex: none;
    }
    .circle {
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      color: var(--nx-orange-500);
    }
    .dot {
      position: absolute;
      bottom: -1px;
      right: -1px;
      width: 11px;
      height: 11px;
      border-radius: 50%;
      border: 2px solid #0B0B0C;
    }
  `,
})
export class AthleteAvatarComponent {
  readonly initials = input.required<string>();
  readonly size = input(40);
  readonly status = input<AthleteStatus>('ativo');

  protected readonly statusColor = computed(() => STATUS_COLOR[this.status()]);
}
```

- [ ] **Step 7: Write `progress-bar.component.ts`**

Create `frontend/projects/coach/src/app/painel/ui/progress-bar.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ProgressTone = 'green' | 'yellow' | 'red' | 'orange';

const TONE_COLOR: Record<ProgressTone, string> = {
  green: 'var(--nx-win)',
  yellow: 'var(--nx-pending)',
  red: 'var(--nx-live)',
  orange: 'var(--nx-orange-500)',
};

@Component({
  selector: 'co-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track" [style.height.px]="height()">
      <div class="fill" [style.width.%]="pct()" [style.background]="color()"></div>
    </div>
  `,
  styles: `
    .track {
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }
    .fill {
      height: 100%;
      border-radius: 4px;
    }
  `,
})
export class ProgressBarComponent {
  readonly pct = input.required<number>();
  readonly tone = input<ProgressTone>('orange');
  readonly height = input(7);

  protected readonly color = computed(() => TONE_COLOR[this.tone()]);
}
```

- [ ] **Step 8: Write `radar-chart.component.ts`**

Create `frontend/projects/coach/src/app/painel/ui/radar-chart.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  pointsToSvgAttr,
  radarAxisLinePoints,
  radarDataPoints,
  radarLabelPoints,
  radarRingPoints,
  type RadarAxis,
} from './radar-geometry';

export type { RadarAxis };

/** Radar de fundamentos técnicos (protótipo TrRadarChart) — usado em Avaliações e Comparação. */
@Component({
  selector: 'co-radar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" [attr.viewBox]="'0 0 ' + size() + ' ' + size()">
      @for (ring of rings; track ring) {
        <polygon [attr.points]="ringPointsAttr(ring)" fill="none" stroke="var(--nx-line)" stroke-width="1" />
      }
      @for (line of axisLines(); track $index) {
        <line [attr.x1]="center()" [attr.y1]="center()" [attr.x2]="line.x" [attr.y2]="line.y" stroke="var(--nx-line)" stroke-width="1" />
      }
      <polygon [attr.points]="dataPointsAttr()" [attr.fill]="accent()" fill-opacity="0.18" [attr.stroke]="accent()" stroke-width="2" stroke-linejoin="round" />
      @for (p of dataPoints(); track $index) {
        <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3" [attr.fill]="accent()" />
      }
      @for (label of labelPoints(); track $index; let i = $index) {
        <text [attr.x]="label.x" [attr.y]="label.y" text-anchor="middle" dominant-baseline="middle"
          font-family="var(--nx-font-mono)" font-size="9.5" font-weight="600" fill="var(--nx-text-dim)"
          style="text-transform: uppercase;">{{ axes()[i].label }}</text>
      }
    </svg>
  `,
})
export class RadarChartComponent {
  readonly axes = input.required<RadarAxis[]>();
  readonly size = input(260);
  readonly accent = input('#FF6A1A');

  protected readonly rings = [0.25, 0.5, 0.75, 1];

  protected readonly center = computed(() => this.size() / 2);
  protected readonly radius = computed(() => this.size() / 2 - 34);

  protected ringPointsAttr(fraction: number): string {
    return pointsToSvgAttr(radarRingPoints(this.axes(), this.center(), this.radius(), fraction));
  }

  protected readonly axisLines = computed(() =>
    radarAxisLinePoints(this.axes(), this.center(), this.radius()),
  );

  protected readonly dataPoints = computed(() =>
    radarDataPoints(this.axes(), this.center(), this.radius()),
  );

  protected dataPointsAttr(): string {
    return pointsToSvgAttr(this.dataPoints());
  }

  protected readonly labelPoints = computed(() =>
    radarLabelPoints(this.axes(), this.center(), this.radius(), 22),
  );
}
```

- [ ] **Step 9: Write `tabs.component.ts`**

Create `frontend/projects/coach/src/app/painel/ui/tabs.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'co-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs">
      @for (t of tabs(); track t) {
        <button type="button" [class.active]="t === active()" (click)="change.emit(t)">{{ t }}</button>
      }
    </div>
  `,
  styles: `
    .tabs {
      display: flex;
      gap: 2px;
      padding: 3px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
    }
    button {
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
    button.active {
      background: var(--nx-surface-2);
      color: var(--nx-text);
    }
  `,
})
export class TabsComponent {
  readonly tabs = input.required<string[]>();
  readonly active = input.required<string>();
  readonly change = output<string>();
}
```

- [ ] **Step 10: Write `row.component.ts`**

Create `frontend/projects/coach/src/app/painel/ui/row.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Linha genérica avatar + título/sub + trailing (protótipo TrRow). Avatar e trailing são projetados. */
@Component({
  selector: 'co-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row" [class.last]="last()">
      <ng-content select="[row-avatar]" />
      <div class="body">
        <div class="title">{{ title() }}</div>
        @if (sub()) {
          <div class="sub">{{ sub() }}</div>
        }
      </div>
      <ng-content select="[row-trailing]" />
    </div>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .row.last {
      border-bottom: none;
    }
    .body {
      flex: 1;
      min-width: 0;
    }
    .title {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .sub {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
  `,
})
export class RowComponent {
  readonly title = input.required<string>();
  readonly sub = input('');
  readonly last = input(false);
}
```

- [ ] **Step 11: Write the form field components**

Create `frontend/projects/coach/src/app/painel/ui/form-field.component.ts`:
```ts
import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextFormFieldId = 0;

/** Campo de texto de formulário do painel (protótipo TrFormField), com ControlValueAccessor. */
@Component({
  selector: 'co-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormFieldComponent), multi: true },
  ],
  template: `
    <div class="field" [style.grid-column]="wide() ? '1 / -1' : 'auto'">
      <label [for]="fieldId">{{ label() }}</label>
      <input
        [id]="fieldId"
        [type]="type()"
        [value]="value()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        (input)="handleInput($event)"
        (blur)="onTouched()"
      />
    </div>
  `,
  styles: `
    label {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      height: 38px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
      box-sizing: border-box;
    }
    input:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }
    input::placeholder {
      color: var(--nx-text-dim);
    }
  `,
})
export class FormFieldComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly type = input<'text' | 'tel' | 'number'>('text');
  readonly placeholder = input('');
  readonly wide = input(false);

  protected readonly fieldId = `co-form-field-${nextFormFieldId++}`;
  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected handleInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
    this.value.set(next);
    this.onChange(next);
  }
}
```

Create `frontend/projects/coach/src/app/painel/ui/form-textarea.component.ts`:
```ts
import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Textarea de formulário do painel (protótipo TrFormTextarea), com ControlValueAccessor. */
@Component({
  selector: 'co-form-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormTextareaComponent), multi: true },
  ],
  template: `
    <div class="field">
      <label>{{ label() }}</label>
      <textarea
        [rows]="rows()"
        [value]="value()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        (input)="handleInput($event)"
        (blur)="onTouched()"
      ></textarea>
    </div>
  `,
  styles: `
    .field {
      grid-column: 1 / -1;
    }
    label {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 6px;
    }
    textarea {
      width: 100%;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text);
      box-sizing: border-box;
      resize: vertical;
    }
    textarea:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }
    textarea::placeholder {
      color: var(--nx-text-dim);
    }
  `,
})
export class FormTextareaComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly rows = input(3);

  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected handleInput(event: Event): void {
    const next = (event.target as HTMLTextAreaElement).value;
    this.value.set(next);
    this.onChange(next);
  }
}
```

Create `frontend/projects/coach/src/app/painel/ui/form-select.component.ts`:
```ts
import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Seletor de opções em chips (protótipo TrFormSelect), com ControlValueAccessor. */
@Component({
  selector: 'co-form-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormSelectComponent), multi: true },
  ],
  template: `
    <div class="field">
      <label>{{ label() }}</label>
      <div class="options">
        @for (o of options(); track o) {
          <button type="button" class="opt" [class.active]="o === value()" [disabled]="disabled()" (click)="choose(o)">{{ o }}</button>
        }
      </div>
    </div>
  `,
  styles: `
    label {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 6px;
    }
    .options {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .opt {
      height: 30px;
      padding: 0 11px;
      border-radius: var(--nx-r-2);
      display: flex;
      align-items: center;
      font-family: var(--nx-font-ui);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
      border: 1px solid var(--nx-line-strong);
    }
    .opt.active {
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      border: none;
    }
  `,
})
export class FormSelectComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly options = input.required<string[]>();

  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected choose(o: string): void {
    if (this.disabled()) {
      return;
    }
    this.value.set(o);
    this.onChange(o);
    this.onTouched();
  }
}
```

- [ ] **Step 12: Build to verify everything compiles**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 13: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/ui
git commit -m "feat(coach): add remaining shared panel atoms (kpi, avatar, radar, tabs, row, form fields)"
```

---

## Task 7: Equipes (squads) — real Firestore data, first vertical slice

**Files:**
- Create: `frontend/projects/coach/src/app/painel/equipes/squads.service.ts`
- Create: `frontend/projects/coach/src/app/painel/equipes/panel-equipes.component.ts`
- Create: `frontend/projects/coach/src/app/painel/equipes/panel-nova-equipe.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts` (add the two routes, drop the placeholder home usage of `SquadContextService` staying empty)

**Interfaces:**
- Consumes: `AuthService` (Task 4), `SquadContextService`/`SquadSummary` (Task 5), `PanelShellComponent`/`PageHeaderComponent`/`PanelCardComponent`/`IconComponent`/`FormFieldComponent`/`FormSelectComponent`/`FormTextareaComponent` (Tasks 5-6).
- Produces: `SquadsService` — `squads: Signal<Squad[]>`, `createSquad(input: NewSquadInput): Promise<string>`. This is the **first task to call `SquadContextService.setSquads(...)` with real data** — every later squad-scoped task (9, 11, 12, 13, 14) depends on `SquadContextService.activeSquadId()` being populated from here.
- Produces: `Squad { id, name, category, gender, description }`.

- [ ] **Step 1: Write `squads.service.ts`**

Create `frontend/projects/coach/src/app/painel/equipes/squads.service.ts`:
```ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { initialsOf } from '../ui/initials';
import { SquadContextService, type SquadSummary } from '../ui/squad-context.service';

export interface Squad {
  id: string;
  name: string;
  category: string;
  gender: string;
  description: string;
}

export interface NewSquadInput {
  name: string;
  category: string;
  gender: string;
  description: string;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

function readSquad(id: string, data: Record<string, unknown> | undefined): Squad {
  return {
    id,
    name: typeof data?.['name'] === 'string' ? (data['name'] as string) : '',
    category: typeof data?.['category'] === 'string' ? (data['category'] as string) : '',
    gender: typeof data?.['gender'] === 'string' ? (data['gender'] as string) : '',
    description: typeof data?.['description'] === 'string' ? (data['description'] as string) : '',
  };
}

function toSummary(squad: Squad): SquadSummary {
  return { id: squad.id, name: squad.name, initials: initialsOf(squad.name) };
}

/** `coaches/{uid}/squads` é ownership-only (Task 2) — leitura/escrita direta do client, sem Cloud Function. */
@Injectable({ providedIn: 'root' })
export class SquadsService {
  private readonly auth = inject(AuthService);
  private readonly squadContext = inject(SquadContextService);
  private readonly firestore = createFirestore();

  private readonly squadsState = signal<Squad[]>([]);
  readonly squads = computed(() => this.squadsState());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.squadsState.set([]);
        this.squadContext.setSquads([]);
        return;
      }

      const stop = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'squads'),
        (snapshot) => {
          const list = snapshot.docs.map((d) => readSquad(d.id, d.data()));
          this.squadsState.set(list);
          this.squadContext.setSquads(list.map(toSummary));
        },
        () => {
          this.squadsState.set([]);
          this.squadContext.setSquads([]);
        },
      );

      onCleanup(stop);
    });
  }

  async createSquad(input: NewSquadInput): Promise<string> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    const ref = doc(collection(this.firestore, 'coaches', uid, 'squads'));
    await setDoc(ref, {
      name: input.name.trim(),
      category: input.category,
      gender: input.gender,
      description: input.description.trim(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }
}
```

- [ ] **Step 2: Write the Equipes list screen**

Create `frontend/projects/coach/src/app/painel/equipes/panel-equipes.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';
import { SquadsService } from './squads.service';

/** Lista de equipes (protótipo TrEquipesScreen) — sem os indicadores de atletas/próximo
 *  treino/win rate do protótipo ainda, porque dependem de AthletesService (Task 9) e
 *  TrainingsService (Task 11); a capacidade essencial do MVP é criar/listar/selecionar equipe. */
@Component({
  selector: 'co-panel-equipes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Equipes" [subtitle]="subtitleLabel()">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/equipes/nova">
          <co-icon name="plus" [size]="14" />
          Nova equipe
        </a>
      </co-page-header>

      <div class="body">
        @if (squads().length === 0) {
          <co-panel-card title="Nenhuma equipe ainda" kicker="Comece por aqui">
            <p class="desc">Crie sua primeira equipe pra começar a adicionar atletas, treinos e avaliações.</p>
          </co-panel-card>
        } @else {
          <div class="grid">
            @for (squad of squads(); track squad.id) {
              <co-panel-card [title]="squad.name" [kicker]="squad.category + ' · ' + squad.gender">
                <p class="desc">{{ squad.description || 'Sem descrição.' }}</p>
                <button type="button" class="co-ghost-btn" [class.active]="isActive(squad.id)" (click)="select(squad.id)">
                  @if (isActive(squad.id)) {
                    <co-icon name="check" [size]="13" />
                    Equipe ativa
                  } @else {
                    Tornar ativa
                  }
                </button>
              </co-panel-card>
            }
          </div>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      overflow: hidden;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .desc {
      color: var(--nx-text-mute);
      font-size: 12.5px;
      line-height: 1.4;
      margin: 0 0 14px;
      min-height: 34px;
    }
    .co-ghost-btn.active {
      color: var(--nx-win);
    }
  `,
})
export class PanelEquipesComponent {
  private readonly squadsService = inject(SquadsService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly squads = this.squadsService.squads;

  protected readonly subtitleLabel = computed(() => {
    const n = this.squads().length;
    if (n === 0) {
      return 'Nenhuma equipe ainda';
    }
    return n === 1 ? '1 equipe' : `${n} equipes`;
  });

  protected isActive(id: string): boolean {
    return this.squadContext.activeSquadId() === id;
  }

  protected select(id: string): void {
    this.squadContext.setActiveSquad(id);
  }
}
```

- [ ] **Step 3: Write the Nova equipe form screen**

Create `frontend/projects/coach/src/app/painel/equipes/panel-nova-equipe.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormSelectComponent } from '../ui/form-select.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadsService } from './squads.service';

@Component({
  selector: 'co-panel-nova-equipe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormFieldComponent,
    FormSelectComponent,
    FormTextareaComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Nova equipe" subtitle="Cadastro de equipe">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving()" (click)="submit()">
          @if (saving()) {
            Salvando…
          } @else {
            Criar equipe
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        <co-panel-card title="Dados da equipe" kicker="Informações básicas">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Nome da equipe" placeholder="Ex: Equipe Sub-15" formControlName="name" [wide]="true" />
            <co-form-select label="Categoria" [options]="categoryOptions" formControlName="category" />
            <co-form-select label="Naipe" [options]="genderOptions" formControlName="gender" />
            <co-form-textarea label="Descrição" formControlName="description" />
          </form>
        </co-panel-card>
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
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
  `,
})
export class PanelNovaEquipeComponent {
  private readonly squadsService = inject(SquadsService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly categoryOptions = ['Sub-15', 'Sub-17', 'Adulto', 'Livre'];
  protected readonly genderOptions = ['Masculino', 'Feminino', 'Misto'];

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: ['', Validators.required],
    category: ['Sub-15', Validators.required],
    gender: ['Masculino', Validators.required],
    description: [''],
  });

  protected async submit(): Promise<void> {
    this.error.set(null);
    if (this.form.invalid) {
      this.error.set('Informe o nome da equipe.');
      return;
    }
    this.saving.set(true);
    try {
      await this.squadsService.createSquad(this.form.getRawValue());
      void this.router.navigateByUrl('/painel/equipes');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível criar a equipe.');
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 4: Add the routes**

In `frontend/projects/coach/src/app/app.routes.ts`, insert before `{ path: '**', redirectTo: '' }`:
```ts
  {
    path: 'painel/equipes',
    title: 'Equipes — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/equipes/panel-equipes.component').then((m) => m.PanelEquipesComponent),
  },
  {
    path: 'painel/equipes/nova',
    title: 'Nova equipe — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/equipes/panel-nova-equipe.component').then((m) => m.PanelNovaEquipeComponent),
  },
```

- [ ] **Step 5: Build and deploy rules, then manually verify end to end**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds.

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago && firebase deploy --only firestore:rules --project volley-track-dev-4596c` (re-deploy in case Task 2's rules weren't already live)
Expected: `Deploy complete!`

Run `npx ng serve coach`, log in, click "Equipes" in the sidebar. Expected: empty state "Nenhuma equipe ainda". Click "Nova equipe", fill the form, submit → redirected to `/painel/equipes`, the new squad now appears as a card. Click "Tornar ativa" → the sidebar's team switcher (top-left) updates to show the squad's initials and name instead of "Nenhuma equipe".

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/equipes frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add squads (equipes) with real Firestore data"
```

---

## Task 8: Invite Cloud Functions (search, send, accept, cancel)

**Files:**
- Create: `functions/src/coach-athlete-search.ts`
- Create: `functions/src/coach-athlete-search.test.ts`
- Create: `functions/src/coach-athlete-invite.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Produces: `initialsFromName(name: string): string` (pure, tested). `searchAthleteForCoachInvite` callable — input `{ email: string }`, returns `{ result: { uid, displayName, initials } | null }`.
- Produces: `sendCoachAthleteInvite` callable — input `{ athleteUid, athleteName, squadId? }`, returns `{ inviteId }`. `acceptCoachAthleteInvite` — input `{ inviteId }`, creates `coaches/{coachUid}/athletes/{athleteUid}` transactionally. `cancelCoachAthleteInvite` — input `{ inviteId, asDecline? }`. Task 9's "Novo atleta" screen and Task 10's `/convite-atleta/:id` route call these four.

**Design note:** search is **email-only**, not phone-or-email as the spec sketched. `functions/src/athlete-tournament-access.ts:66` shows phone numbers are historically stored under inconsistent field names (`phoneNumber`/`phone`/`whatsapp`/`celular`/`mobile`) with no normalization — a robust phone search would need to query and normalize across all of them. Firebase Auth's `getUserByEmail` is authoritative and exact, so email-only search covers the MVP need without that complexity; phone search can be added later if it turns out to matter.

- [ ] **Step 1: Write the failing test for `initialsFromName`**

Create `functions/src/coach-athlete-search.test.ts`:
```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {initialsFromName} from "./coach-athlete-search";

describe("initialsFromName", () => {
  it("takes first and last name initials", () => {
    assert.equal(initialsFromName("Ana Beatriz"), "AB");
  });

  it("uses a single initial for a one-word name", () => {
    assert.equal(initialsFromName("Madonna"), "M");
  });

  it("falls back to a middle dot for an empty name", () => {
    assert.equal(initialsFromName("   "), "·");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run build && node --test lib/coach-athlete-search.test.js`
Expected: FAIL — `Cannot find module './coach-athlete-search'`.

- [ ] **Step 3: Implement `coach-athlete-search.ts`**

Create `functions/src/coach-athlete-search.ts`:
```ts
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";

export interface AthleteSearchResult {
  uid: string;
  displayName: string;
  initials: string;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "·";
  }
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/**
 * Busca um atleta por e-mail pra convite do treinador (ver nota de design no
 * plano sobre por que não é telefone-ou-e-mail). Nunca expõe telefone/e-mail
 * de volta ao caller — só uid/displayName/initials.
 */
export const searchAthleteForCoachInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const email = (request.data?.email as string | undefined)?.trim().toLowerCase() ?? "";
  if (!email) {
    throw new HttpsError("invalid-argument", "Informe o e-mail do atleta.");
  }

  const auth = getAuth();
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/user-not-found") {
      return {result: null};
    }
    throw err;
  }

  if (user.uid === uid) {
    throw new HttpsError("invalid-argument", "Você não pode convidar a si mesmo.");
  }

  const displayName = user.displayName?.trim() || email;
  const result: AthleteSearchResult = {
    uid: user.uid,
    displayName,
    initials: initialsFromName(displayName),
  };

  logger.info("Coach searched for athlete", {coachUid: uid, foundUid: user.uid});
  return {result};
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run build && node --test lib/coach-athlete-search.test.js`
Expected: PASS — all 3 assertions succeed.

- [ ] **Step 5: Implement `coach-athlete-invite.ts`**

Create `functions/src/coach-athlete-invite.ts`:
```ts
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, Timestamp, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";

const INVITES_COLLECTION = "coachAthleteInvites";
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

async function findPendingInvite(db: Firestore, coachUid: string, athleteUid: string): Promise<boolean> {
  const snap = await db
    .collection(INVITES_COLLECTION)
    .where("coachUid", "==", coachUid)
    .where("athleteUid", "==", athleteUid)
    .where("status", "==", "pending")
    .get();
  return !snap.empty;
}

export const sendCoachAthleteInvite = onCall(async (request) => {
  const coachUid = request.auth?.uid;
  if (!coachUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const athleteUid = (request.data?.athleteUid as string | undefined)?.trim() ?? "";
  const athleteName = (request.data?.athleteName as string | undefined)?.trim() || "Atleta";
  const squadId = (request.data?.squadId as string | undefined)?.trim() || "";

  if (!athleteUid) {
    throw new HttpsError("invalid-argument", "athleteUid é obrigatório.");
  }
  if (athleteUid === coachUid) {
    throw new HttpsError("invalid-argument", "Você não pode convidar a si mesmo.");
  }

  const db = getFirestore();

  const coachSnap = await db.doc(`coaches/${coachUid}`).get();
  if (!coachSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Complete seu cadastro de treinador antes de convidar atletas.",
    );
  }
  const coachName = (coachSnap.data()?.["displayName"] as string | undefined)?.trim() || "Treinador";

  const existingLink = await db.doc(`coaches/${coachUid}/athletes/${athleteUid}`).get();
  if (existingLink.exists) {
    throw new HttpsError("already-exists", "Este atleta já está vinculado à sua equipe.");
  }

  if (await findPendingInvite(db, coachUid, athleteUid)) {
    throw new HttpsError("already-exists", "Já existe um convite pendente para este atleta.");
  }

  const now = Date.now();
  const ref = db.collection(INVITES_COLLECTION).doc();
  await ref.set({
    coachUid,
    coachName,
    athleteUid,
    athleteName,
    ...(squadId ? {squadId} : {}),
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + INVITE_TTL_MS),
  });

  try {
    await deliverNotificationToUser({
      userId: athleteUid,
      title: `${coachName} quer te adicionar à equipe`,
      body: "Toque para ver o convite e aceitar ou recusar.",
      type: "coach_athlete_invite",
      data: {inviteId: ref.id, coachUid, url: `/convite-atleta/${ref.id}`},
    });
  } catch (notifyError) {
    logger.warn("Falha ao notificar atleta do convite de treinador", {
      inviteId: ref.id,
      athleteUid,
      notifyError,
    });
  }

  logger.info("Coach athlete invite sent", {inviteId: ref.id, coachUid, athleteUid});
  return {inviteId: ref.id};
});

export const acceptCoachAthleteInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }
  const inviteId = (request.data?.inviteId as string | undefined)?.trim() ?? "";
  if (!inviteId) {
    throw new HttpsError("invalid-argument", "inviteId é obrigatório.");
  }

  const db = getFirestore();
  const inviteRef = db.collection(INVITES_COLLECTION).doc(inviteId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(inviteRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Convite não encontrado.");
    }
    const invite = snap.data()!;
    if (invite["athleteUid"] !== uid) {
      throw new HttpsError("permission-denied", "Este convite não é para você.");
    }
    if (invite["status"] !== "pending") {
      throw new HttpsError("failed-precondition", "Este convite não está mais pendente.");
    }
    const expiresAt = invite["expiresAt"] as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      tx.update(inviteRef, {status: "expired"});
      throw new HttpsError("failed-precondition", "Este convite expirou.");
    }

    const coachUid = invite["coachUid"] as string;
    const linkRef = db.doc(`coaches/${coachUid}/athletes/${uid}`);
    tx.set(linkRef, {
      athleteUid: uid,
      squadId: (invite["squadId"] as string | undefined) ?? null,
      status: "ativo",
      linkStatus: "accepted",
      linkedAt: FieldValue.serverTimestamp(),
    });
    tx.update(inviteRef, {status: "accepted", acceptedAt: FieldValue.serverTimestamp()});

    return {coachUid};
  });

  logger.info("Coach athlete invite accepted", {inviteId, athleteUid: uid, coachUid: result.coachUid});
  return {ok: true};
});

export const cancelCoachAthleteInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }
  const inviteId = (request.data?.inviteId as string | undefined)?.trim() ?? "";
  const asDecline = request.data?.asDecline === true;
  if (!inviteId) {
    throw new HttpsError("invalid-argument", "inviteId é obrigatório.");
  }

  const db = getFirestore();
  const inviteRef = db.collection(INVITES_COLLECTION).doc(inviteId);
  const snap = await inviteRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Convite não encontrado.");
  }
  const invite = snap.data()!;
  if (invite["status"] !== "pending") {
    throw new HttpsError("failed-precondition", "Este convite não está mais pendente.");
  }

  const isCoach = invite["coachUid"] === uid;
  const isAthlete = invite["athleteUid"] === uid;

  if (asDecline) {
    if (!isAthlete) {
      throw new HttpsError("permission-denied", "Apenas o atleta convidado pode recusar.");
    }
    await inviteRef.update({status: "declined"});
    return {ok: true, status: "declined"};
  }

  if (!isCoach && !isAthlete) {
    throw new HttpsError("permission-denied", "Você não pode cancelar este convite.");
  }
  await inviteRef.update({status: "cancelled"});
  return {ok: true, status: "cancelled"};
});
```

- [ ] **Step 6: Export the functions from `index.ts`**

At the end of `functions/src/index.ts`, add:
```ts
export {searchAthleteForCoachInvite} from "./coach-athlete-search";
export {
  sendCoachAthleteInvite,
  acceptCoachAthleteInvite,
  cancelCoachAthleteInvite,
} from "./coach-athlete-invite";
```

- [ ] **Step 7: Lint, build, deploy**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run lint && npm run build`
Expected: no TypeScript errors.

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago && firebase deploy --only functions:searchAthleteForCoachInvite,functions:sendCoachAthleteInvite,functions:acceptCoachAthleteInvite,functions:cancelCoachAthleteInvite --project volley-track-dev-4596c`
Expected: `Deploy complete!`

- [ ] **Step 8: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add functions/src/coach-athlete-search.ts functions/src/coach-athlete-search.test.ts functions/src/coach-athlete-invite.ts functions/src/index.ts
git commit -m "feat(coach): add athlete search and invite Cloud Functions"
```

---

## Task 9: Atletas (roster) — `AthletesService` + list/detail + convidar atleta

**Files:**
- Create: `frontend/projects/coach/src/app/painel/atletas/athletes.service.ts`
- Create: `frontend/projects/coach/src/app/painel/atletas/panel-atletas.component.ts`
- Create: `frontend/projects/coach/src/app/painel/atletas/panel-novo-atleta.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `SquadContextService` (Task 5), `IconComponent`/`PageHeaderComponent`/`PanelCardComponent`/`TabsComponent`/`RowComponent`/`AthleteAvatarComponent`/`PillComponent`/`FormFieldComponent`/`FormSelectComponent`/`FormTextareaComponent` (Tasks 5-6), `searchAthleteForCoachInvite`/`sendCoachAthleteInvite` (Task 8).
- Produces: `AthletesService` — `roster: Signal<RosterAthlete[]>`, `searchAthleteByEmail(email)`, `inviteAthlete(athleteUid, athleteName, squadId)`, `updateAthleteLink(athleteUid, patch)`. Task 11 (Treinos/Presença), 12-13 (Convocações), 14 (Avaliações), 15 (Histórico), and 17 (Início) all read `roster()` to list the athletes they operate on.
- `RosterAthlete = AthleteLink & AthletePublicProfile`, `AthleteLink = { athleteUid, squadId, status: AthleteStatus, position, dominantHand, heightCm, weightKg, emergencyContact, notes }`.

**Design note:** `public_profiles/{uid}` (read in Task 7's design, actually used starting here) does **not** have a `displayName` or `rating` field — its real whitelist (`functions/src/public-profile-sync.ts:15-49`) exposes `fullName`/`name`/`nickname` for the name and `category`/`level`/`nivel` for the skill tier, with no plain numeric rating mirrored anywhere confirmed. So `AthletePublicProfile` reads name from the first of `fullName`/`name`/`nickname` that's present, and shows `category` (not a numeric rating like the prototype's "2.015") — the numeric rating badge from the prototype is **dropped** for this pass rather than guessing a field name that might silently read as empty.

Also: the prototype's "Novo atleta" screen is a manual data-entry form (name, phone, height, weight...). That doesn't fit the approved design (**atletas are real, existing nexaGO accounts, linked by invite-with-accept** — the coach never creates an athlete record from scratch). So this task's "Novo atleta" screen is actually **"Convidar atleta"**: search by e-mail → send invite. The coach-only fields (posição, braço dominante, altura, peso, contato de emergência, observações) get filled in **after** the athlete accepts, via an "Editar" mode on the roster detail pane — collecting that before the athlete has even agreed to the link would be presumptuous.

- [ ] **Step 1: Write `athletes.service.ts`**

Create `frontend/projects/coach/src/app/painel/atletas/athletes.service.ts`:
```ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  documentId,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { initialsOf } from '../ui/initials';
import type { AthleteStatus } from '../ui/athlete-avatar.component';

export interface AthleteLink {
  athleteUid: string;
  squadId: string | null;
  status: AthleteStatus;
  position: string;
  dominantHand: string;
  heightCm: number | null;
  weightKg: number | null;
  emergencyContact: string;
  notes: string;
}

export interface AthletePublicProfile {
  displayName: string;
  initials: string;
  category: string;
}

export interface RosterAthlete extends AthleteLink, AthletePublicProfile {}

export interface AthleteSearchHit {
  uid: string;
  displayName: string;
  initials: string;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

function firstNonEmptyString(data: Record<string, unknown> | undefined, keys: string[]): string {
  if (!data) {
    return '';
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function readAthleteLink(athleteUid: string, data: Record<string, unknown> | undefined): AthleteLink {
  return {
    athleteUid,
    squadId: typeof data?.['squadId'] === 'string' ? (data['squadId'] as string) : null,
    status: (data?.['status'] as AthleteStatus | undefined) ?? 'ativo',
    position: typeof data?.['position'] === 'string' ? (data['position'] as string) : '',
    dominantHand: typeof data?.['dominantHand'] === 'string' ? (data['dominantHand'] as string) : '',
    heightCm: typeof data?.['heightCm'] === 'number' ? (data['heightCm'] as number) : null,
    weightKg: typeof data?.['weightKg'] === 'number' ? (data['weightKg'] as number) : null,
    emergencyContact:
      typeof data?.['emergencyContact'] === 'string' ? (data['emergencyContact'] as string) : '',
    notes: typeof data?.['notes'] === 'string' ? (data['notes'] as string) : '',
  };
}

function readPublicProfile(data: Record<string, unknown> | undefined): AthletePublicProfile {
  const displayName = firstNonEmptyString(data, ['fullName', 'name', 'nickname']) || 'Atleta';
  const category = firstNonEmptyString(data, ['category', 'level', 'nivel']);
  return { displayName, initials: initialsOf(displayName), category };
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

/**
 * `coaches/{uid}/athletes` (o vínculo) é ownership-only — client lê/escreve
 * direto. `public_profiles` é lido pra exibição (não duplicado no vínculo).
 * Convite e busca por e-mail passam por Cloud Function (Task 8) porque
 * cruzam dados de outro usuário.
 */
@Injectable({ providedIn: 'root' })
export class AthletesService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly linksState = signal<AthleteLink[]>([]);
  private readonly profilesState = signal<Map<string, AthletePublicProfile>>(new Map());

  readonly roster = computed<RosterAthlete[]>(() => {
    const profiles = this.profilesState();
    return this.linksState().map((link) => ({
      ...link,
      ...(profiles.get(link.athleteUid) ?? { displayName: 'Atleta', initials: '·', category: '' }),
    }));
  });

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.linksState.set([]);
        this.profilesState.set(new Map());
        return;
      }

      const stop = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'athletes'),
        (snapshot) => {
          const links = snapshot.docs.map((d) => readAthleteLink(d.id, d.data()));
          this.linksState.set(links);
          void this.loadProfiles(links.map((l) => l.athleteUid));
        },
        () => {
          this.linksState.set([]);
          this.profilesState.set(new Map());
        },
      );

      onCleanup(stop);
    });
  }

  private async loadProfiles(athleteUids: string[]): Promise<void> {
    if (athleteUids.length === 0) {
      this.profilesState.set(new Map());
      return;
    }
    const map = new Map<string, AthletePublicProfile>();
    for (const group of chunk(athleteUids, 30)) {
      const snap = await getDocs(
        query(collection(this.firestore, 'public_profiles'), where(documentId(), 'in', group)),
      );
      snap.docs.forEach((d) => map.set(d.id, readPublicProfile(d.data())));
    }
    this.profilesState.set(map);
  }

  async searchAthleteByEmail(email: string): Promise<AthleteSearchHit | null> {
    const fn = httpsCallable<{ email: string }, { result: AthleteSearchHit | null }>(
      getFunctions(getApps()[0]!),
      'searchAthleteForCoachInvite',
    );
    const res = await fn({ email });
    return res.data.result;
  }

  async inviteAthlete(athleteUid: string, athleteName: string, squadId: string | null): Promise<string> {
    const fn = httpsCallable<
      { athleteUid: string; athleteName: string; squadId?: string },
      { inviteId: string }
    >(getFunctions(getApps()[0]!), 'sendCoachAthleteInvite');
    const res = await fn({ athleteUid, athleteName, ...(squadId ? { squadId } : {}) });
    return res.data.inviteId;
  }

  async updateAthleteLink(athleteUid: string, patch: Partial<Omit<AthleteLink, 'athleteUid'>>): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    await setDoc(doc(this.firestore, 'coaches', uid, 'athletes', athleteUid), patch, { merge: true });
  }
}
```

- [ ] **Step 2: Write the Atletas list + detail screen**

Create `frontend/projects/coach/src/app/painel/atletas/panel-atletas.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormSelectComponent } from '../ui/form-select.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';
import { TabsComponent } from '../ui/tabs.component';
import { SquadContextService } from '../ui/squad-context.service';
import { AthletesService, type RosterAthlete } from './athletes.service';

const STATUS_LABEL: Record<string, string> = {
  ativo: 'Ativo',
  lesionado: 'Lesionado',
  afastado: 'Afastado',
  ferias: 'Férias',
};
const STATUS_TONE: Record<string, 'green' | 'red' | 'yellow' | 'dim'> = {
  ativo: 'green',
  lesionado: 'red',
  afastado: 'yellow',
  ferias: 'dim',
};

/** Gestão de atletas (protótipo TrAtletasScreen) — sem a aba "Estatísticas" do protótipo
 *  ainda, porque depende de dados de torneio (Task 16). */
@Component({
  selector: 'co-panel-atletas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AthleteAvatarComponent,
    FormFieldComponent,
    FormSelectComponent,
    FormTextareaComponent,
    IconComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    PillComponent,
    RowComponent,
    TabsComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Gestão de atletas" [subtitle]="subtitle()">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/atletas/novo">
          <co-icon name="plus" [size]="14" />
          Convidar atleta
        </a>
      </co-page-header>

      <div class="body">
        <co-panel-card pad="sm" title="Lista de atletas" [kicker]="roster().length + ' atletas'" class="list-card">
          <div class="list">
            @for (a of roster(); track a.athleteUid) {
              <div class="list-row" [class.active]="selectedUid() === a.athleteUid" (click)="select(a.athleteUid)">
                <co-athlete-avatar [initials]="a.initials" [size]="34" [status]="a.status" />
                <div class="list-body">
                  <div class="list-name">{{ a.displayName }}</div>
                  <div class="list-meta">{{ a.category || 'Sem categoria' }}</div>
                </div>
              </div>
            } @empty {
              <p class="empty">Nenhum atleta vinculado ainda. Convide o primeiro atleta da sua equipe.</p>
            }
          </div>
        </co-panel-card>

        @if (selected(); as athlete) {
          <div class="detail">
            <co-panel-card class="header-card">
              <div class="header-row">
                <co-athlete-avatar [initials]="athlete.initials" [size]="60" [status]="athlete.status" />
                <div class="header-body">
                  <div class="header-name">{{ athlete.displayName }}</div>
                  <div class="header-meta">{{ athlete.category || 'Sem categoria' }} · {{ athlete.position || 'Posição não definida' }}</div>
                </div>
                <co-pill [tone]="statusTone(athlete.status)">{{ statusLabel(athlete.status) }}</co-pill>
                <button type="button" class="co-ghost-btn" (click)="toggleEdit(athlete)">
                  <co-icon name="edit" [size]="14" />
                  {{ editing() ? 'Cancelar' : 'Editar' }}
                </button>
              </div>
            </co-panel-card>

            @if (editing()) {
              <co-panel-card title="Editar dados do vínculo" kicker="Só o treinador vê estes campos">
                <form [formGroup]="editForm" class="grid">
                  <co-form-select label="Status na equipe" [options]="statusOptions" formControlName="status" />
                  <co-form-field label="Posição" formControlName="position" />
                  <co-form-select label="Braço dominante" [options]="['Direito', 'Esquerdo']" formControlName="dominantHand" />
                  <co-form-field label="Altura (cm)" type="number" formControlName="heightCm" />
                  <co-form-field label="Peso (kg)" type="number" formControlName="weightKg" />
                  <co-form-field label="Contato de emergência" formControlName="emergencyContact" [wide]="true" />
                  <co-form-textarea label="Observações" formControlName="notes" />
                </form>
                <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving()" (click)="save(athlete.athleteUid)">
                  @if (saving()) { Salvando… } @else { Salvar alterações }
                </button>
              </co-panel-card>
            } @else {
              <co-tabs [tabs]="tabs" [active]="activeTab()" (change)="activeTab.set($event)" />

              @if (activeTab() === 'Dados pessoais') {
                <co-panel-card>
                  <div class="grid readonly">
                    <div><div class="f-label">Contato de emergência</div><div class="f-value">{{ athlete.emergencyContact || '—' }}</div></div>
                    <div><div class="f-label">Altura</div><div class="f-value">{{ athlete.heightCm ? athlete.heightCm + ' cm' : '—' }}</div></div>
                    <div><div class="f-label">Peso</div><div class="f-value">{{ athlete.weightKg ? athlete.weightKg + ' kg' : '—' }}</div></div>
                    <div><div class="f-label">Braço dominante</div><div class="f-value">{{ athlete.dominantHand || '—' }}</div></div>
                  </div>
                </co-panel-card>
              } @else {
                <co-panel-card>
                  <div class="grid readonly">
                    <div><div class="f-label">Posição</div><div class="f-value">{{ athlete.position || '—' }}</div></div>
                    <div><div class="f-label">Categoria</div><div class="f-value">{{ athlete.category || '—' }}</div></div>
                    <div><div class="f-label">Observações</div><div class="f-value">{{ athlete.notes || '—' }}</div></div>
                  </div>
                </co-panel-card>
              }
            }
          </div>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 20px 32px 28px;
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: 16px;
      min-height: 0;
    }
    .list-card {
      min-height: 0;
      overflow: hidden;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 3px;
      overflow: auto;
    }
    .list-row {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      cursor: pointer;
      border: 1px solid transparent;
    }
    .list-row.active {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
    }
    .list-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .list-meta {
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
      padding: 8px 4px;
    }
    .detail {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
      overflow: hidden;
    }
    .header-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header-body {
      flex: 1;
    }
    .header-name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      color: var(--nx-text);
    }
    .header-meta {
      font-size: 12.5px;
      color: var(--nx-text-mute);
      margin-top: 3px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }
    .grid.readonly {
      gap: 20px;
    }
    .f-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 4px;
    }
    .f-value {
      font-size: 13px;
      color: var(--nx-text);
    }
  `,
})
export class PanelAtletasComponent {
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly tabs = ['Dados pessoais', 'Perfil esportivo'];
  protected readonly statusOptions = ['ativo', 'lesionado', 'afastado', 'ferias'];

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  protected readonly subtitle = computed(() => {
    const squad = this.squadContext.activeSquad();
    const n = this.roster().length;
    return `${squad ? squad.name : 'Todas as equipes'} · ${n} atleta${n === 1 ? '' : 's'}`;
  });

  protected readonly selectedUid = signal<string | null>(null);
  protected readonly activeTab = signal('Dados pessoais');
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);

  protected readonly selected = computed<RosterAthlete | null>(() => {
    const uid = this.selectedUid() ?? this.roster()[0]?.athleteUid ?? null;
    return this.roster().find((a) => a.athleteUid === uid) ?? null;
  });

  protected readonly editForm = this.fb.group({
    status: 'ativo',
    position: '',
    dominantHand: 'Direito',
    heightCm: '',
    weightKg: '',
    emergencyContact: '',
    notes: '',
  });

  protected select(uid: string): void {
    this.selectedUid.set(uid);
    this.editing.set(false);
  }

  protected statusLabel(status: string): string {
    return STATUS_LABEL[status] ?? status;
  }

  protected statusTone(status: string): 'green' | 'red' | 'yellow' | 'dim' {
    return STATUS_TONE[status] ?? 'dim';
  }

  protected toggleEdit(athlete: RosterAthlete): void {
    if (!this.editing()) {
      this.editForm.setValue({
        status: athlete.status,
        position: athlete.position,
        dominantHand: athlete.dominantHand || 'Direito',
        heightCm: athlete.heightCm != null ? String(athlete.heightCm) : '',
        weightKg: athlete.weightKg != null ? String(athlete.weightKg) : '',
        emergencyContact: athlete.emergencyContact,
        notes: athlete.notes,
      });
    }
    this.editing.set(!this.editing());
  }

  protected async save(athleteUid: string): Promise<void> {
    this.saving.set(true);
    try {
      const raw = this.editForm.getRawValue();
      await this.athletesService.updateAthleteLink(athleteUid, {
        status: raw.status as RosterAthlete['status'],
        position: raw.position,
        dominantHand: raw.dominantHand,
        heightCm: raw.heightCm ? Number(raw.heightCm) : null,
        weightKg: raw.weightKg ? Number(raw.weightKg) : null,
        emergencyContact: raw.emergencyContact,
        notes: raw.notes,
      });
      this.editing.set(false);
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 3: Write the "Convidar atleta" screen**

Create `frontend/projects/coach/src/app/painel/atletas/panel-novo-atleta.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormSelectComponent } from '../ui/form-select.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';
import { AthletesService, type AthleteSearchHit } from './athletes.service';

@Component({
  selector: 'co-panel-novo-atleta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AthleteAvatarComponent,
    FormFieldComponent,
    FormSelectComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Convidar atleta" subtitle="Vincular um atleta que já tem conta no nexaGO" />

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        @if (sent()) {
          <co-panel-card title="Convite enviado!" kicker="Aguardando aceite">
            <p class="desc">
              {{ found()?.displayName }} vai receber uma notificação para aceitar o vínculo. Assim que aceitar, aparece na sua lista de atletas.
            </p>
            <button type="button" class="co-ghost-btn" (click)="reset()">Convidar outro atleta</button>
          </co-panel-card>
        } @else {
          <co-panel-card title="Buscar atleta" kicker="Por e-mail cadastrado no nexaGO">
            <form [formGroup]="searchForm" class="search-row" (ngSubmit)="search()">
              <co-form-field label="E-mail do atleta" type="text" placeholder="atleta@email.com" formControlName="email" [wide]="true" />
              <button type="submit" class="co-mini-btn co-mini-btn-primary" [disabled]="searching()">
                @if (searching()) { Buscando… } @else { Buscar }
              </button>
            </form>

            @if (searched() && !found()) {
              <p class="desc">Nenhum atleta encontrado com este e-mail.</p>
            }

            @if (found(); as hit) {
              <div class="found-row">
                <co-athlete-avatar [initials]="hit.initials" [size]="44" />
                <div class="found-body">
                  <div class="found-name">{{ hit.displayName }}</div>
                </div>
              </div>
              <co-form-select label="Equipe (opcional)" [options]="squadOptions()" formControlName="squadName" [formGroup]="assignForm" />
              <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="inviting()" (click)="invite(hit)">
                @if (inviting()) { Enviando… } @else { Enviar convite }
              </button>
            }
          </co-panel-card>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      max-width: 560px;
    }
    .search-row {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      margin-bottom: 16px;
    }
    .search-row co-form-field {
      flex: 1;
    }
    .desc {
      color: var(--nx-text-mute);
      font-size: 13px;
      line-height: 1.5;
    }
    .found-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-top: 1px solid var(--nx-line);
      margin-top: 4px;
      margin-bottom: 16px;
    }
    .found-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }
  `,
})
export class PanelNovoAtletaComponent {
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly searchForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly assignForm = this.fb.group({
    squadName: 'Nenhuma',
  });

  protected readonly squadOptions = () => ['Nenhuma', ...this.squadContext.squads().map((s) => s.name)];

  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  protected readonly found = signal<AthleteSearchHit | null>(null);
  protected readonly inviting = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async search(): Promise<void> {
    this.error.set(null);
    if (this.searchForm.invalid) {
      this.error.set('Informe um e-mail válido.');
      return;
    }
    this.searching.set(true);
    this.searched.set(false);
    this.found.set(null);
    try {
      const hit = await this.athletesService.searchAthleteByEmail(this.searchForm.getRawValue().email);
      this.found.set(hit);
      this.searched.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível buscar o atleta.');
    } finally {
      this.searching.set(false);
    }
  }

  protected async invite(hit: AthleteSearchHit): Promise<void> {
    this.error.set(null);
    this.inviting.set(true);
    try {
      const squadName = this.assignForm.getRawValue().squadName;
      const squad = this.squadContext.squads().find((s) => s.name === squadName);
      await this.athletesService.inviteAthlete(hit.uid, hit.displayName, squad?.id ?? null);
      this.sent.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível enviar o convite.');
    } finally {
      this.inviting.set(false);
    }
  }

  protected reset(): void {
    this.searchForm.reset({ email: '' });
    this.assignForm.reset({ squadName: 'Nenhuma' });
    this.searched.set(false);
    this.found.set(null);
    this.sent.set(false);
  }
}
```

- [ ] **Step 4: Add the routes**

In `frontend/projects/coach/src/app/app.routes.ts`, insert before `{ path: '**', redirectTo: '' }`:
```ts
  {
    path: 'painel/atletas',
    title: 'Atletas — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/atletas/panel-atletas.component').then((m) => m.PanelAtletasComponent),
  },
  {
    path: 'painel/atletas/novo',
    title: 'Convidar atleta — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/atletas/panel-novo-atleta.component').then((m) => m.PanelNovoAtletaComponent),
  },
```

- [ ] **Step 5: Build, deploy, and manually verify**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds.

Manually verify with two accounts (a coach account and a separate athlete account, e.g. one from the `athlete` project, both in the dev Firebase project): log in as the coach, go to "Atletas" → "Convidar atleta", search the athlete's e-mail, send the invite. Expected: success message, no console errors. (Accepting the invite needs Task 10's `/convite-atleta/:id` route — the athlete has no way to accept yet, so the roster stays empty until then; that's expected.)

- [ ] **Step 6: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/atletas frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add athlete roster and invite-by-email screens"
```

---

## Task 10: `/convite-atleta/:id` — athlete-side accept/decline route

**Files:**
- Create: `frontend/projects/coach/src/app/convites/convite-atleta.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `AuthService` (Task 4), `acceptCoachAthleteInvite`/`cancelCoachAthleteInvite` (Task 8), reads `coachAthleteInvites/{id}` (rules from Task 2 already allow the invitee to read it).
- This is the closing piece of the design's "no changes to `athlete` or Flutter" resolution: **any authenticated nexaGO user** (not just coaches) can load this route — it sits behind `authGuard` only, not `coachGuard`.

- [ ] **Step 1: Write `convite-atleta.component.ts`**

Create `frontend/projects/coach/src/app/convites/convite-atleta.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';

type InviteState = 'loading' | 'ready' | 'not-found' | 'not-mine' | 'not-pending' | 'responded';

interface InviteView {
  coachName: string;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

/** Tela de resposta ao convite de treinador — qualquer usuário nexaGO autenticado
 *  chega aqui (via notificação push ou link), independente de papel. */
@Component({
  selector: 'co-convite-atleta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="card">
        @switch (state()) {
          @case ('loading') {
            <p class="muted">Carregando convite…</p>
          }
          @case ('not-found') {
            <p class="muted">Convite não encontrado.</p>
          }
          @case ('not-mine') {
            <p class="muted">
              Este convite não é para a conta com que você está logado ({{ auth.user()?.email }}).
            </p>
          }
          @case ('not-pending') {
            <p class="muted">Este convite já foi respondido ou expirou.</p>
          }
          @case ('responded') {
            <p class="muted">{{ responseMessage() }}</p>
          }
          @case ('ready') {
            <h1>Convite de treinador</h1>
            <p class="body-text"><strong>{{ invite()?.coachName }}</strong> quer te adicionar à equipe dele no NexaGO.</p>
            @if (error(); as err) {
              <div class="co-alert" role="alert">{{ err }}</div>
            }
            <div class="actions">
              <button type="button" class="co-btn-primary" [disabled]="responding()" (click)="accept()">Aceitar</button>
              <button type="button" class="co-ghost-btn" [disabled]="responding()" (click)="decline()">Recusar</button>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      background: var(--nx-bg);
      padding: 24px;
    }
    .card {
      width: min(420px, 100%);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 28px;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
    }
    h1 {
      font-family: var(--nx-font-display);
      font-size: 20px;
      margin: 0 0 12px;
    }
    .body-text {
      font-size: 14px;
      line-height: 1.5;
    }
    .muted {
      color: var(--nx-text-mute);
      font-size: 14px;
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }
    .actions .co-btn-primary {
      width: auto;
      flex: 1;
      height: 44px;
    }
  `,
})
export class ConviteAtletaComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly firestore = createFirestore();

  protected readonly state = signal<InviteState>('loading');
  protected readonly invite = signal<InviteView | null>(null);
  protected readonly responding = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly responseMessage = signal('');

  private inviteId = '';

  async ngOnInit(): Promise<void> {
    this.inviteId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.inviteId) {
      this.state.set('not-found');
      return;
    }

    const snap = await getDoc(doc(this.firestore, 'coachAthleteInvites', this.inviteId));
    if (!snap.exists()) {
      this.state.set('not-found');
      return;
    }

    const data = snap.data();
    const myUid = this.auth.user()?.uid;
    if (data['athleteUid'] !== myUid) {
      this.state.set('not-mine');
      return;
    }
    if (data['status'] !== 'pending') {
      this.state.set('not-pending');
      return;
    }

    this.invite.set({ coachName: (data['coachName'] as string | undefined) ?? 'Treinador' });
    this.state.set('ready');
  }

  protected async accept(): Promise<void> {
    this.error.set(null);
    this.responding.set(true);
    try {
      const fn = httpsCallable(getFunctions(getApps()[0]!), 'acceptCoachAthleteInvite');
      await fn({ inviteId: this.inviteId });
      this.responseMessage.set('Convite aceito! Você agora faz parte da equipe.');
      this.state.set('responded');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.');
    } finally {
      this.responding.set(false);
    }
  }

  protected async decline(): Promise<void> {
    this.error.set(null);
    this.responding.set(true);
    try {
      const fn = httpsCallable(getFunctions(getApps()[0]!), 'cancelCoachAthleteInvite');
      await fn({ inviteId: this.inviteId, asDecline: true });
      this.responseMessage.set('Convite recusado.');
      this.state.set('responded');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível recusar o convite.');
    } finally {
      this.responding.set(false);
    }
  }
}
```

- [ ] **Step 2: Add the route**

In `frontend/projects/coach/src/app/app.routes.ts`, insert before `{ path: '**', redirectTo: '' }` (this route only needs `authGuard`, **not** `coachGuard` — any nexaGO user can respond to an invite):
```ts
  {
    path: 'convite-atleta/:id',
    title: 'Convite de treinador — NexaGO Treinador',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./convites/convite-atleta.component').then((m) => m.ConviteAtletaComponent),
  },
```

- [ ] **Step 3: Build and manually verify end to end**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds.

Manually verify the full loop with two accounts: as the coach, send an invite (Task 9) to the athlete's e-mail; note the `inviteId` returned (log it temporarily via the browser console, or read the new doc directly in the Firebase console under `coachAthleteInvites`). Log in as the athlete account in a separate window, navigate to `/convite-atleta/<inviteId>`. Expected: "Convite de treinador" screen shows the coach's name; clicking "Aceitar" shows "Convite aceito!"; back in the coach's `/painel/atletas` tab, the athlete now appears in the roster list (Firestore's real-time `onSnapshot` in `AthletesService` should reflect it without a page reload).

- [ ] **Step 4: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/convites frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add athlete-side invite accept/decline route"
```

---

## Task 11: Treinos (listagem + planejamento) and Presença

**Files:**
- Create: `frontend/projects/coach/src/app/painel/treinos/trainings.service.ts`
- Create: `frontend/projects/coach/src/app/painel/treinos/panel-treinos.component.ts`
- Create: `frontend/projects/coach/src/app/painel/treinos/panel-novo-treino.component.ts`
- Create: `frontend/projects/coach/src/app/painel/presenca/panel-presenca.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `SquadContextService` (Task 5), `AthletesService`/`RosterAthlete` (Task 9), shared UI atoms (Tasks 5-6).
- Produces: `TrainingsService` — `trainings: Signal<Training[]>`, `createTraining(input): Promise<string>`, `setAttendance(trainingId, attendance): Promise<void>`. `Training = { id, squadId, title, date, startTime, endTime, location, materials, exercises: TrainingExercise[], status: TrainingStatus, attendance: Record<string, AttendanceStatus> }`. Task 15 (Histórico) and Task 17 (Início) read `trainings()`.
- `AttendanceStatus = 'presente' | 'ausente' | 'atrasado' | 'justificado'`, `TrainingStatus = 'agendado' | 'realizado' | 'cancelado'` — canonical unions used wherever attendance/training status is shown.

- [ ] **Step 1: Write `trainings.service.ts`**

Create `frontend/projects/coach/src/app/painel/treinos/trainings.service.ts`:
```ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';

export type TrainingStatus = 'agendado' | 'realizado' | 'cancelado';
export type AttendanceStatus = 'presente' | 'ausente' | 'atrasado' | 'justificado';

export interface TrainingExercise {
  label: string;
  durationMin: number;
  order: number;
}

export interface Training {
  id: string;
  squadId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  materials: string;
  exercises: TrainingExercise[];
  status: TrainingStatus;
  attendance: Record<string, AttendanceStatus>;
}

export interface NewTrainingInput {
  squadId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  materials: string;
  exercises: TrainingExercise[];
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

function readTraining(id: string, data: Record<string, unknown> | undefined): Training {
  const rawExercises = Array.isArray(data?.['exercises']) ? (data!['exercises'] as unknown[]) : [];
  return {
    id,
    squadId: typeof data?.['squadId'] === 'string' ? (data['squadId'] as string) : '',
    title: typeof data?.['title'] === 'string' ? (data['title'] as string) : '',
    date: typeof data?.['date'] === 'string' ? (data['date'] as string) : '',
    startTime: typeof data?.['startTime'] === 'string' ? (data['startTime'] as string) : '',
    endTime: typeof data?.['endTime'] === 'string' ? (data['endTime'] as string) : '',
    location: typeof data?.['location'] === 'string' ? (data['location'] as string) : '',
    materials: typeof data?.['materials'] === 'string' ? (data['materials'] as string) : '',
    exercises: rawExercises.map((e) => {
      const rec = (e ?? {}) as Record<string, unknown>;
      return {
        label: typeof rec['label'] === 'string' ? (rec['label'] as string) : '',
        durationMin: typeof rec['durationMin'] === 'number' ? (rec['durationMin'] as number) : 0,
        order: typeof rec['order'] === 'number' ? (rec['order'] as number) : 0,
      };
    }),
    status: (data?.['status'] as TrainingStatus | undefined) ?? 'agendado',
    attendance: (data?.['attendance'] as Record<string, AttendanceStatus> | undefined) ?? {},
  };
}

/** `coaches/{uid}/trainings` é ownership-only (Task 2) — leitura/escrita direta do client. */
@Injectable({ providedIn: 'root' })
export class TrainingsService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly trainingsState = signal<Training[]>([]);
  readonly trainings = computed(() => this.trainingsState());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.trainingsState.set([]);
        return;
      }

      const stop = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'trainings'),
        (snapshot) => {
          this.trainingsState.set(snapshot.docs.map((d) => readTraining(d.id, d.data())));
        },
        () => this.trainingsState.set([]),
      );

      onCleanup(stop);
    });
  }

  async createTraining(input: NewTrainingInput): Promise<string> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    const ref = doc(collection(this.firestore, 'coaches', uid, 'trainings'));
    await setDoc(ref, {
      squadId: input.squadId,
      title: input.title,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      location: input.location,
      materials: input.materials,
      exercises: input.exercises,
      status: 'agendado',
      attendance: {},
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async setAttendance(trainingId: string, attendance: Record<string, AttendanceStatus>): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    await setDoc(
      doc(this.firestore, 'coaches', uid, 'trainings', trainingId),
      { attendance, status: 'realizado' },
      { merge: true },
    );
  }
}
```

- [ ] **Step 2: Write the Treinos list screen**

Create `frontend/projects/coach/src/app/painel/treinos/panel-treinos.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';
import { TrainingsService, type TrainingStatus } from './trainings.service';

const STATUS_LABEL: Record<TrainingStatus, string> = {
  agendado: 'Agendado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
};
const STATUS_TONE: Record<TrainingStatus, PillTone> = {
  agendado: 'orange',
  realizado: 'green',
  cancelado: 'red',
};

@Component({
  selector: 'co-panel-treinos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Treinos" [subtitle]="subtitle()">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/treinos/novo">
          <co-icon name="plus" [size]="14" />
          Novo treino
        </a>
      </co-page-header>

      <div class="body">
        <co-panel-card title="Todos os treinos">
          @for (t of trainings(); track t.id; let last = $last) {
            <co-row [title]="t.title" [sub]="t.date + ' · ' + t.startTime + ' · ' + (t.location || 'Local não definido')" [last]="last">
              <co-pill row-trailing [tone]="STATUS_TONE[t.status]">{{ STATUS_LABEL[t.status] }}</co-pill>
            </co-row>
          } @empty {
            <p class="empty">Nenhum treino agendado ainda.</p>
          }
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      overflow: hidden;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
      padding: 8px 4px;
    }
  `,
})
export class PanelTreinosComponent {
  private readonly trainingsService = inject(TrainingsService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly STATUS_TONE = STATUS_TONE;

  protected readonly trainings = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    return this.trainingsService.trainings().filter((t) => !activeId || t.squadId === activeId);
  });

  protected readonly subtitle = computed(() => {
    const n = this.trainings().length;
    return `${n} treino${n === 1 ? '' : 's'} · ${this.squadContext.activeSquad()?.name ?? 'Todas as equipes'}`;
  });
}
```

- [ ] **Step 3: Write the Nova treino (planejamento) screen**

Create `frontend/projects/coach/src/app/painel/treinos/panel-novo-treino.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';
import { TrainingsService } from './trainings.service';

@Component({
  selector: 'co-panel-novo-treino',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormFieldComponent,
    FormTextareaComponent,
    IconComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Planejamento de treinos" subtitle="Novo treino">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving()" (click)="submit()">
          @if (saving()) {
            Salvando…
          } @else {
            Salvar treino
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        <co-panel-card title="Detalhes do treino" kicker="Objetivo e horário">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Título" placeholder="Ex: Treino técnico · Recepção" formControlName="title" [wide]="true" />
            <co-form-field label="Data" placeholder="AAAA-MM-DD" formControlName="date" />
            <co-form-field label="Início" placeholder="19:00" formControlName="startTime" />
            <co-form-field label="Fim" placeholder="20:30" formControlName="endTime" />
            <co-form-field label="Local" placeholder="Quadra 2 · Arena CFC" formControlName="location" />
            <co-form-textarea label="Materiais" formControlName="materials" />
          </form>
        </co-panel-card>

        <co-panel-card title="Exercícios" kicker="Aquecimento, técnica, tático...">
          @for (ex of exercises(); track $index; let i = $index) {
            <div class="ex-row">
              <span class="ex-label">{{ ex.label }}</span>
              <span class="ex-dur">{{ ex.durationMin }} min</span>
              <button type="button" class="co-ghost-btn" (click)="removeExercise(i)">Remover</button>
            </div>
          }
          <div class="ex-add">
            <input class="ex-input" placeholder="Nome do exercício" [value]="newLabel()" (input)="newLabel.set($any($event.target).value)" />
            <input class="ex-dur-input" type="number" [value]="newDuration()" (input)="newDuration.set(+$any($event.target).value)" />
            <button type="button" class="co-ghost-btn" (click)="addExercise()">
              <co-icon name="plus" [size]="13" />
              Adicionar
            </button>
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
      max-width: 760px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .ex-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .ex-label {
      flex: 1;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .ex-dur {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .ex-add {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .ex-input {
      flex: 1;
      height: 36px;
      padding: 0 10px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .ex-dur-input {
      width: 72px;
      height: 36px;
      padding: 0 10px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
  `,
})
export class PanelNovoTreinoComponent {
  private readonly trainingsService = inject(TrainingsService);
  private readonly squadContext = inject(SquadContextService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    title: ['', Validators.required],
    date: ['', Validators.required],
    startTime: ['', Validators.required],
    endTime: [''],
    location: [''],
    materials: [''],
  });

  protected readonly exercises = signal<{ label: string; durationMin: number }[]>([]);
  protected readonly newLabel = signal('');
  protected readonly newDuration = signal(10);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected addExercise(): void {
    const label = this.newLabel().trim();
    if (!label) {
      return;
    }
    this.exercises.update((list) => [...list, { label, durationMin: this.newDuration() || 10 }]);
    this.newLabel.set('');
    this.newDuration.set(10);
  }

  protected removeExercise(index: number): void {
    this.exercises.update((list) => list.filter((_, i) => i !== index));
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    const squadId = this.squadContext.activeSquadId();
    if (!squadId) {
      this.error.set('Selecione uma equipe ativa antes de criar um treino.');
      return;
    }
    if (this.form.invalid) {
      this.error.set('Preencha título, data e horário de início.');
      return;
    }
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      await this.trainingsService.createTraining({
        squadId,
        title: raw.title,
        date: raw.date,
        startTime: raw.startTime,
        endTime: raw.endTime,
        location: raw.location,
        materials: raw.materials,
        exercises: this.exercises().map((e, i) => ({ ...e, order: i })),
      });
      void this.router.navigateByUrl('/painel/treinos');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar o treino.');
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 4: Write the Presença screen**

Create `frontend/projects/coach/src/app/painel/presenca/panel-presenca.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';
import { AthletesService } from '../atletas/athletes.service';
import { TrainingsService, type AttendanceStatus } from '../treinos/trainings.service';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  presente: 'Presente',
  ausente: 'Ausente',
  atrasado: 'Atrasado',
  justificado: 'Justificado',
};

@Component({
  selector: 'co-panel-presenca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AthleteAvatarComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Controle de presença" [subtitle]="subtitle()">
        <select class="picker" [value]="selected()?.id ?? ''" (change)="selectTraining($any($event.target).value)">
          @for (t of trainings(); track t.id) {
            <option [value]="t.id">{{ t.title }} · {{ t.date }}</option>
          }
        </select>
      </co-page-header>

      <div class="body">
        @if (!selected()) {
          <p class="empty">Nenhum treino agendado para esta equipe ainda. Crie um treino primeiro.</p>
        } @else {
          <co-panel-card title="Marcar presença" [kicker]="roster().length + ' convocados'">
            @for (a of roster(); track a.athleteUid; let last = $last) {
              <co-row [title]="a.displayName" [sub]="a.category" [last]="last">
                <co-athlete-avatar row-avatar [initials]="a.initials" [size]="34" [status]="a.status" />
                <div row-trailing class="options">
                  @for (s of statusOptions; track s) {
                    <button type="button" class="opt" [class.active]="statusFor(a.athleteUid) === s" (click)="setStatus(a.athleteUid, s)">
                      {{ STATUS_LABEL[s] }}
                    </button>
                  }
                </div>
              </co-row>
            } @empty {
              <p class="empty">Nenhum atleta vinculado a esta equipe ainda.</p>
            }
          </co-panel-card>
          <button type="button" class="co-mini-btn co-mini-btn-primary save-btn" [disabled]="saving()" (click)="save()">
            @if (saving()) {
              Salvando…
            } @else {
              Salvar
            }
          </button>
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
      overflow: hidden;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
    .picker {
      height: 36px;
      padding: 0 10px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
    }
    .options {
      display: flex;
      gap: 6px;
    }
    .opt {
      height: 26px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid var(--nx-line-strong);
      background: transparent;
      color: var(--nx-text-dim);
      font-family: var(--nx-font-ui);
      font-weight: 600;
      font-size: 10.5px;
      cursor: pointer;
    }
    .opt.active {
      background: var(--nx-orange-500);
      border-color: transparent;
      color: var(--nx-text-on-orange);
    }
    .save-btn {
      align-self: flex-start;
    }
  `,
})
export class PanelPresencaComponent {
  private readonly trainingsService = inject(TrainingsService);
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly statusOptions: AttendanceStatus[] = ['presente', 'ausente', 'atrasado', 'justificado'];

  protected readonly trainings = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    return this.trainingsService.trainings().filter((t) => !activeId || t.squadId === activeId);
  });

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  protected readonly selectedTrainingId = signal<string | null>(null);
  protected readonly draftAttendance = signal<Record<string, AttendanceStatus>>({});
  protected readonly saving = signal(false);

  protected readonly selected = computed(() => {
    const id = this.selectedTrainingId() ?? this.trainings()[0]?.id ?? null;
    return this.trainings().find((t) => t.id === id) ?? null;
  });

  protected readonly subtitle = computed(() => {
    const t = this.selected();
    return t ? `${t.title} · ${t.date} · ${t.startTime}` : 'Selecione um treino';
  });

  constructor() {
    effect(() => {
      const t = this.selected();
      this.draftAttendance.set(t ? { ...t.attendance } : {});
    });
  }

  protected selectTraining(id: string): void {
    this.selectedTrainingId.set(id);
  }

  protected statusFor(athleteUid: string): AttendanceStatus | null {
    return this.draftAttendance()[athleteUid] ?? null;
  }

  protected setStatus(athleteUid: string, status: AttendanceStatus): void {
    this.draftAttendance.update((map) => ({ ...map, [athleteUid]: status }));
  }

  protected async save(): Promise<void> {
    const t = this.selected();
    if (!t) {
      return;
    }
    this.saving.set(true);
    try {
      await this.trainingsService.setAttendance(t.id, this.draftAttendance());
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 5: Add the routes**

In `frontend/projects/coach/src/app/app.routes.ts`, insert before `{ path: '**', redirectTo: '' }`:
```ts
  {
    path: 'painel/treinos',
    title: 'Treinos — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/treinos/panel-treinos.component').then((m) => m.PanelTreinosComponent),
  },
  {
    path: 'painel/treinos/novo',
    title: 'Novo treino — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/treinos/panel-novo-treino.component').then((m) => m.PanelNovoTreinoComponent),
  },
  {
    path: 'painel/presenca',
    title: 'Presença — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/presenca/panel-presenca.component').then((m) => m.PanelPresencaComponent),
  },
```

- [ ] **Step 6: Build and manually verify**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds.

Manually verify: with the active squad from Task 7 selected, go to "Treinos" → "Novo treino", fill title/date/start time, add 2-3 exercises, save. Expected: redirected to `/painel/treinos`, the new training appears with an "Agendado" pill. Go to "Presença", the new training is selected by default, mark each linked athlete (from Task 10's accepted invite) as Presente/Ausente/etc., click "Salvar". Expected: no errors; reloading the page and reopening "Presença" shows the same marks persisted (and the training's pill in "Treinos" now reads "Realizado").

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/treinos frontend/projects/coach/src/app/painel/presenca frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add trainings (listing, planning) and attendance"
```

---

## Task 12: Call-up Cloud Functions (`sendCallUp`, `respondToCallUp`)

**Files:**
- Create: `functions/src/coach-call-up.ts`
- Create: `functions/src/coach-call-up.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Produces: `buildInitialResponses(recipients: string[]): Record<string, CallUpResponse>` (pure, tested). `sendCallUp` callable — input `{ squadId, title, message, recipients: string[], responseDeadline? }`, returns `{ callUpId }`; verifies every recipient is an accepted athlete of this coach before creating anything. `respondToCallUp` callable — input `{ coachUid, callUpId, response: 'confirmado'|'talvez'|'nao_vou' }`.
- **Route shape note:** unlike `coachAthleteInvites` (top-level, so `/convite-atleta/:id` only needs the invite id), `callUps` lives under `coaches/{coachUid}/callUps/{callUpId}` — reading or responding needs `coachUid` too. `sendCallUp` puts `coachUid` in the push notification's `data` payload so Task 13's `/convocacao/:coachUid/:callUpId` route (two segments) can be built from it.

- [ ] **Step 1: Write the failing test for `buildInitialResponses`**

Create `functions/src/coach-call-up.test.ts`:
```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {buildInitialResponses} from "./coach-call-up";

describe("buildInitialResponses", () => {
  it("marks every recipient as aguardando", () => {
    assert.deepEqual(buildInitialResponses(["a1", "a2"]), {
      a1: "aguardando",
      a2: "aguardando",
    });
  });

  it("returns an empty map for no recipients", () => {
    assert.deepEqual(buildInitialResponses([]), {});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run build && node --test lib/coach-call-up.test.js`
Expected: FAIL — `Cannot find module './coach-call-up'`.

- [ ] **Step 3: Implement `coach-call-up.ts`**

Create `functions/src/coach-call-up.ts`:
```ts
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {deliverNotificationToUser} from "./notification-delivery";

export type CallUpResponse = "confirmado" | "talvez" | "nao_vou" | "aguardando";

/** Mapa inicial de respostas — todo destinatário começa "aguardando". */
export function buildInitialResponses(recipients: string[]): Record<string, CallUpResponse> {
  const out: Record<string, CallUpResponse> = {};
  for (const uid of recipients) {
    out[uid] = "aguardando";
  }
  return out;
}

export const sendCallUp = onCall(async (request) => {
  const coachUid = request.auth?.uid;
  if (!coachUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const squadId = (request.data?.squadId as string | undefined)?.trim() ?? "";
  const title = (request.data?.title as string | undefined)?.trim() ?? "";
  const message = (request.data?.message as string | undefined)?.trim() ?? "";
  const responseDeadline = (request.data?.responseDeadline as string | undefined)?.trim() ?? "";
  const recipients = Array.isArray(request.data?.recipients)
    ? (request.data.recipients as unknown[]).map(String).filter(Boolean)
    : [];

  if (!squadId || !title || recipients.length === 0) {
    throw new HttpsError("invalid-argument", "squadId, title e recipients são obrigatórios.");
  }

  const db = getFirestore();

  const linkSnaps = await Promise.all(
    recipients.map((uid) => db.doc(`coaches/${coachUid}/athletes/${uid}`).get()),
  );
  if (linkSnaps.some((s) => !s.exists)) {
    throw new HttpsError(
      "failed-precondition",
      "Um ou mais destinatários não estão vinculados à sua equipe.",
    );
  }

  const coachSnap = await db.doc(`coaches/${coachUid}`).get();
  const coachName = (coachSnap.data()?.["displayName"] as string | undefined)?.trim() || "Seu treinador";

  const ref = db.collection(`coaches/${coachUid}/callUps`).doc();
  await ref.set({
    coachName,
    squadId,
    title,
    message,
    responseDeadline,
    recipients,
    responses: buildInitialResponses(recipients),
    createdAt: FieldValue.serverTimestamp(),
  });

  await Promise.all(
    recipients.map((uid) =>
      deliverNotificationToUser({
        userId: uid,
        title: `${coachName} enviou uma convocação`,
        body: title,
        type: "coach_call_up",
        data: {coachUid, callUpId: ref.id, url: `/convocacao/${coachUid}/${ref.id}`},
      }).catch((notifyError) => {
        logger.warn("Falha ao notificar atleta da convocação", {callUpId: ref.id, uid, notifyError});
      }),
    ),
  );

  logger.info("Coach call-up sent", {callUpId: ref.id, coachUid, recipients: recipients.length});
  return {callUpId: ref.id};
});

export const respondToCallUp = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const coachUid = (request.data?.coachUid as string | undefined)?.trim() ?? "";
  const callUpId = (request.data?.callUpId as string | undefined)?.trim() ?? "";
  const response = request.data?.response as CallUpResponse | undefined;

  if (!coachUid || !callUpId) {
    throw new HttpsError("invalid-argument", "coachUid e callUpId são obrigatórios.");
  }
  if (!response || !["confirmado", "talvez", "nao_vou"].includes(response)) {
    throw new HttpsError("invalid-argument", "Resposta inválida.");
  }

  const db = getFirestore();
  const ref = db.doc(`coaches/${coachUid}/callUps/${callUpId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Convocação não encontrada.");
    }
    const data = snap.data()!;
    const recipients = Array.isArray(data["recipients"]) ? (data["recipients"] as string[]) : [];
    if (!recipients.includes(uid)) {
      throw new HttpsError("permission-denied", "Você não foi convocado para este evento.");
    }
    tx.update(ref, {[`responses.${uid}`]: response});
  });

  logger.info("Call-up response recorded", {coachUid, callUpId, uid, response});
  return {ok: true};
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run build && node --test lib/coach-call-up.test.js`
Expected: PASS — both assertions succeed.

- [ ] **Step 5: Export the functions from `index.ts`**

At the end of `functions/src/index.ts`, add:
```ts
export {sendCallUp, respondToCallUp} from "./coach-call-up";
```

- [ ] **Step 6: Lint, build, deploy**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run lint && npm run build`
Expected: no TypeScript errors.

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago && firebase deploy --only functions:sendCallUp,functions:respondToCallUp,firestore:rules --project volley-track-dev-4596c` (also redeploys the Task 2 rules fix for `callUps` read access)
Expected: `Deploy complete!`

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add functions/src/coach-call-up.ts functions/src/coach-call-up.test.ts functions/src/index.ts firestore.rules
git commit -m "feat(coach): add call-up Cloud Functions"
```

---

## Task 13: Convocações screens + athlete-side response route

**Files:**
- Create: `frontend/projects/coach/src/app/painel/convocacoes/call-ups.service.ts`
- Create: `frontend/projects/coach/src/app/painel/convocacoes/panel-convocacoes.component.ts`
- Create: `frontend/projects/coach/src/app/painel/convocacoes/panel-nova-convocacao.component.ts`
- Create: `frontend/projects/coach/src/app/convocacao/convocacao.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `AthletesService`/`RosterAthlete` (Task 9), `SquadContextService` (Task 5), `sendCallUp`/`respondToCallUp` (Task 12).
- Produces: `CallUpsService` — `callUps: Signal<CallUp[]>`, `sendCallUp(input): Promise<string>`. `CallUp = { id, coachName, squadId, title, message, responseDeadline, recipients: string[], responses: Record<string, CallUpResponseValue> }`.

- [ ] **Step 1: Write `call-ups.service.ts`**

Create `frontend/projects/coach/src/app/painel/convocacoes/call-ups.service.ts`:
```ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { collection, getFirestore, onSnapshot, type Firestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';

export type CallUpResponseValue = 'confirmado' | 'talvez' | 'nao_vou' | 'aguardando';

export interface CallUp {
  id: string;
  coachName: string;
  squadId: string;
  title: string;
  message: string;
  responseDeadline: string;
  recipients: string[];
  responses: Record<string, CallUpResponseValue>;
}

export interface NewCallUpInput {
  squadId: string;
  title: string;
  message: string;
  responseDeadline: string;
  recipients: string[];
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

function readCallUp(id: string, data: Record<string, unknown> | undefined): CallUp {
  return {
    id,
    coachName: typeof data?.['coachName'] === 'string' ? (data['coachName'] as string) : 'Treinador',
    squadId: typeof data?.['squadId'] === 'string' ? (data['squadId'] as string) : '',
    title: typeof data?.['title'] === 'string' ? (data['title'] as string) : '',
    message: typeof data?.['message'] === 'string' ? (data['message'] as string) : '',
    responseDeadline: typeof data?.['responseDeadline'] === 'string' ? (data['responseDeadline'] as string) : '',
    recipients: Array.isArray(data?.['recipients']) ? (data['recipients'] as string[]) : [],
    responses: (data?.['responses'] as Record<string, CallUpResponseValue> | undefined) ?? {},
  };
}

/** `coaches/{uid}/callUps` só permite leitura direta do client (Task 2); escrita é 100% via Cloud Function. */
@Injectable({ providedIn: 'root' })
export class CallUpsService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly callUpsState = signal<CallUp[]>([]);
  readonly callUps = computed(() => this.callUpsState());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.callUpsState.set([]);
        return;
      }

      const stop = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'callUps'),
        (snapshot) => {
          this.callUpsState.set(snapshot.docs.map((d) => readCallUp(d.id, d.data())));
        },
        () => this.callUpsState.set([]),
      );

      onCleanup(stop);
    });
  }

  async sendCallUp(input: NewCallUpInput): Promise<string> {
    const fn = httpsCallable<NewCallUpInput, { callUpId: string }>(
      getFunctions(getApps()[0]!),
      'sendCallUp',
    );
    const res = await fn(input);
    return res.data.callUpId;
  }
}
```

- [ ] **Step 2: Write the Convocações list screen**

Create `frontend/projects/coach/src/app/painel/convocacoes/panel-convocacoes.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { SquadContextService } from '../ui/squad-context.service';
import { CallUpsService, type CallUp, type CallUpResponseValue } from './call-ups.service';

@Component({
  selector: 'co-panel-convocacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Convocações" [subtitle]="subtitle()">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/convocacoes/nova">
          <co-icon name="bell" [size]="14" />
          Nova convocação
        </a>
      </co-page-header>

      <div class="body">
        @for (c of callUps(); track c.id) {
          <co-panel-card [title]="c.title" [kicker]="c.recipients.length + ' convocados'">
            <p class="msg">{{ c.message }}</p>
            <div class="counts">
              <co-pill tone="green">Confirmados {{ countFor(c, 'confirmado') }}</co-pill>
              <co-pill tone="yellow">Talvez {{ countFor(c, 'talvez') }}</co-pill>
              <co-pill tone="red">Não vão {{ countFor(c, 'nao_vou') }}</co-pill>
              <co-pill tone="dim">Aguardando {{ countFor(c, 'aguardando') }}</co-pill>
            </div>
          </co-panel-card>
        } @empty {
          <p class="empty">Nenhuma convocação enviada ainda.</p>
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
    .msg {
      color: var(--nx-text-mute);
      font-size: 12.5px;
      line-height: 1.5;
      margin: 0 0 14px;
    }
    .counts {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
  `,
})
export class PanelConvocacoesComponent {
  private readonly callUpsService = inject(CallUpsService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly callUps = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    return this.callUpsService.callUps().filter((c) => !activeId || c.squadId === activeId);
  });

  protected readonly subtitle = computed(() => {
    const n = this.callUps().length;
    return `${n} convocaç${n === 1 ? 'ão' : 'ões'} enviada${n === 1 ? '' : 's'}`;
  });

  protected countFor(c: CallUp, status: CallUpResponseValue): number {
    return Object.values(c.responses).filter((r) => r === status).length;
  }
}
```

- [ ] **Step 3: Write the Nova convocação screen**

Create `frontend/projects/coach/src/app/painel/convocacoes/panel-nova-convocacao.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AthletesService } from '../atletas/athletes.service';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';
import { CallUpsService } from './call-ups.service';

@Component({
  selector: 'co-panel-nova-convocacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AthleteAvatarComponent,
    FormFieldComponent,
    FormTextareaComponent,
    IconComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    RowComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Nova convocação" subtitle="Enviar aos atletas">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="sending()" (click)="submit()">
          @if (sending()) {
            Enviando…
          } @else {
            Enviar convocação
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        <co-panel-card title="Detalhes da convocação" kicker="Evento">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Título" placeholder="Ex: Treino sexta às 19h" formControlName="title" [wide]="true" />
            <co-form-field label="Prazo para resposta" placeholder="Quinta, 22h" formControlName="responseDeadline" [wide]="true" />
            <co-form-textarea label="Mensagem" formControlName="message" />
          </form>
        </co-panel-card>

        <co-panel-card title="Destinatários" [kicker]="selectedCount() + ' de ' + roster().length + ' atletas selecionados'">
          @for (a of roster(); track a.athleteUid; let last = $last) {
            <co-row [title]="a.displayName" [sub]="a.category" [last]="last">
              <co-athlete-avatar row-avatar [initials]="a.initials" [size]="32" [status]="a.status" />
              <button type="button" row-trailing class="co-ghost-btn" [class.active]="isSelected(a.athleteUid)" (click)="toggle(a.athleteUid)">
                @if (isSelected(a.athleteUid)) {
                  <co-icon name="check" [size]="14" />
                } @else {
                  Selecionar
                }
              </button>
            </co-row>
          } @empty {
            <p class="empty">Nenhum atleta vinculado a esta equipe ainda.</p>
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
      max-width: 640px;
      overflow: auto;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
    .co-ghost-btn.active {
      color: var(--nx-win);
    }
  `,
})
export class PanelNovaConvocacaoComponent {
  private readonly callUpsService = inject(CallUpsService);
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    title: ['', Validators.required],
    responseDeadline: [''],
    message: [''],
  });

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected isSelected(uid: string): boolean {
    return this.selected().has(uid);
  }

  protected toggle(uid: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    const squadId = this.squadContext.activeSquadId();
    if (!squadId) {
      this.error.set('Selecione uma equipe ativa.');
      return;
    }
    if (this.form.invalid || this.selected().size === 0) {
      this.error.set('Informe um título e selecione ao menos um atleta.');
      return;
    }
    this.sending.set(true);
    try {
      const raw = this.form.getRawValue();
      await this.callUpsService.sendCallUp({
        squadId,
        title: raw.title,
        message: raw.message,
        responseDeadline: raw.responseDeadline,
        recipients: Array.from(this.selected()),
      });
      void this.router.navigateByUrl('/painel/convocacoes');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível enviar a convocação.');
    } finally {
      this.sending.set(false);
    }
  }
}
```

- [ ] **Step 4: Write the athlete-side response route**

Create `frontend/projects/coach/src/app/convocacao/convocacao.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';

type ViewState = 'loading' | 'ready' | 'not-found' | 'not-mine' | 'already-responded' | 'responded';
type Response = 'confirmado' | 'talvez' | 'nao_vou';

interface CallUpView {
  coachName: string;
  title: string;
  message: string;
}

const RESPONSE_LABEL: Record<Response, string> = {
  confirmado: 'Confirmado',
  talvez: 'Talvez',
  nao_vou: 'Não vou',
};

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

/** Tela de resposta à convocação — qualquer atleta convocado chega aqui via push/link. */
@Component({
  selector: 'co-convocacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="card">
        @switch (state()) {
          @case ('loading') {
            <p class="muted">Carregando convocação…</p>
          }
          @case ('not-found') {
            <p class="muted">Convocação não encontrada.</p>
          }
          @case ('not-mine') {
            <p class="muted">Você não foi convocado para este evento com esta conta.</p>
          }
          @case ('already-responded') {
            <p class="muted">Você já respondeu: <strong>{{ existingResponseLabel() }}</strong>.</p>
          }
          @case ('responded') {
            <p class="muted">Resposta registrada: <strong>{{ existingResponseLabel() }}</strong>. Obrigado!</p>
          }
          @case ('ready') {
            <h1>{{ callUp()?.title }}</h1>
            <p class="body-text">De <strong>{{ callUp()?.coachName }}</strong></p>
            @if (callUp()?.message) {
              <p class="body-text">{{ callUp()?.message }}</p>
            }
            @if (error(); as err) {
              <div class="co-alert" role="alert">{{ err }}</div>
            }
            <div class="actions">
              <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="responding()" (click)="respond('confirmado')">Confirmar</button>
              <button type="button" class="co-mini-btn" [disabled]="responding()" (click)="respond('talvez')">Talvez</button>
              <button type="button" class="co-ghost-btn" [disabled]="responding()" (click)="respond('nao_vou')">Não vou</button>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      background: var(--nx-bg);
      padding: 24px;
    }
    .card {
      width: min(440px, 100%);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 28px;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
    }
    h1 {
      font-family: var(--nx-font-display);
      font-size: 20px;
      margin: 0 0 10px;
    }
    .body-text {
      font-size: 14px;
      line-height: 1.5;
      color: var(--nx-text-mute);
      margin: 6px 0;
    }
    .muted {
      color: var(--nx-text-mute);
      font-size: 14px;
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
      flex-wrap: wrap;
    }
  `,
})
export class ConvocacaoComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly firestore = createFirestore();

  protected readonly state = signal<ViewState>('loading');
  protected readonly callUp = signal<CallUpView | null>(null);
  protected readonly responding = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly existingResponse = signal<Response | null>(null);
  protected readonly existingResponseLabel = () => {
    const r = this.existingResponse();
    return r ? RESPONSE_LABEL[r] : '';
  };

  private coachUid = '';
  private callUpId = '';

  async ngOnInit(): Promise<void> {
    this.coachUid = this.route.snapshot.paramMap.get('coachUid') ?? '';
    this.callUpId = this.route.snapshot.paramMap.get('callUpId') ?? '';
    if (!this.coachUid || !this.callUpId) {
      this.state.set('not-found');
      return;
    }

    const snap = await getDoc(doc(this.firestore, 'coaches', this.coachUid, 'callUps', this.callUpId));
    if (!snap.exists()) {
      this.state.set('not-found');
      return;
    }

    const data = snap.data();
    const myUid = this.auth.user()?.uid ?? '';
    const recipients = Array.isArray(data['recipients']) ? (data['recipients'] as string[]) : [];
    if (!recipients.includes(myUid)) {
      this.state.set('not-mine');
      return;
    }

    this.callUp.set({
      coachName: (data['coachName'] as string | undefined) ?? 'Treinador',
      title: (data['title'] as string | undefined) ?? '',
      message: (data['message'] as string | undefined) ?? '',
    });

    const responses = (data['responses'] as Record<string, string> | undefined) ?? {};
    const mine = responses[myUid];
    if (mine && mine !== 'aguardando') {
      this.existingResponse.set(mine as Response);
      this.state.set('already-responded');
      return;
    }

    this.state.set('ready');
  }

  protected async respond(response: Response): Promise<void> {
    this.error.set(null);
    this.responding.set(true);
    try {
      const fn = httpsCallable(getFunctions(getApps()[0]!), 'respondToCallUp');
      await fn({ coachUid: this.coachUid, callUpId: this.callUpId, response });
      this.existingResponse.set(response);
      this.state.set('responded');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível registrar sua resposta.');
    } finally {
      this.responding.set(false);
    }
  }
}
```

- [ ] **Step 5: Add the routes**

In `frontend/projects/coach/src/app/app.routes.ts`, insert before `{ path: '**', redirectTo: '' }`:
```ts
  {
    path: 'painel/convocacoes',
    title: 'Convocações — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/convocacoes/panel-convocacoes.component').then((m) => m.PanelConvocacoesComponent),
  },
  {
    path: 'painel/convocacoes/nova',
    title: 'Nova convocação — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/convocacoes/panel-nova-convocacao.component').then((m) => m.PanelNovaConvocacaoComponent),
  },
  {
    path: 'convocacao/:coachUid/:callUpId',
    title: 'Convocação — NexaGO Treinador',
    canActivate: [authGuard],
    loadComponent: () => import('./convocacao/convocacao.component').then((m) => m.ConvocacaoComponent),
  },
```

- [ ] **Step 6: Build and manually verify end to end**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds.

As the coach, go to "Convocações" → "Nova convocação", fill title/message, select the linked athlete, send. Note the `callUpId` from the redirect or Firestore console. As the athlete, visit `/convocacao/<coachUid>/<callUpId>`. Expected: sees the title/message/coach name, can click "Confirmar"/"Talvez"/"Não vou"; after responding, revisiting the same URL shows "Você já respondeu". Back in the coach's `/painel/convocacoes`, the counts update to reflect the response.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/convocacoes frontend/projects/coach/src/app/convocacao frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add call-up screens and athlete-side response route"
```

---

## Task 14: Avaliações (evaluations) — listagem + nova avaliação

**Files:**
- Create: `frontend/projects/coach/src/app/painel/avaliacoes/evaluation-stats.ts`
- Create: `frontend/projects/coach/src/app/painel/avaliacoes/evaluation-stats.spec.ts`
- Create: `frontend/projects/coach/src/app/painel/avaliacoes/evaluations.service.ts`
- Create: `frontend/projects/coach/src/app/painel/avaliacoes/panel-avaliacoes.component.ts`
- Create: `frontend/projects/coach/src/app/painel/avaliacoes/panel-nova-avaliacao.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `RadarChartComponent`/`RadarAxis`, `AthletesService`, `SquadContextService`.
- Produces: `averageScore(scores: EvaluationScores): number`, `latestTwoByAthlete(evaluations: Evaluation[]): Map<string, { latest: Evaluation; previous: Evaluation | null }>` (both pure, tested). `EvaluationsService` — `evaluations: Signal<Evaluation[]>`, `createEvaluation({ athleteUid, scores, notes }): Promise<string>`.
- `EvaluationScores = { saque, recepcao, levantamento, ataque, defesa, bloqueio, condicionamento, comunicacao, mental }` (each 0-10) — the 9 fixed fundamentals from the prototype. Task 15 (Histórico) reads `evaluations()` too.

**Design note:** drops the prototype's 3rd KPI ("Maior evolução", which needs a per-athlete max-delta scan across the whole roster) — keeps "Avaliações no mês" and "Média geral" only, which are enough to judge the module's health without extra complexity.

- [ ] **Step 1: Write the failing tests for the pure stats helpers**

Create `frontend/projects/coach/src/app/painel/avaliacoes/evaluation-stats.spec.ts`:
```ts
import { averageScore, latestTwoByAthlete, type Evaluation, type EvaluationScores } from './evaluation-stats';

function scores(overrides: Partial<EvaluationScores> = {}): EvaluationScores {
  return {
    saque: 5, recepcao: 5, levantamento: 5, ataque: 5, defesa: 5,
    bloqueio: 5, condicionamento: 5, comunicacao: 5, mental: 5,
    ...overrides,
  };
}

describe('averageScore', () => {
  it('averages all 9 fundamentals', () => {
    expect(averageScore(scores())).toBe(5);
  });

  it('reflects a mix of high and low scores', () => {
    expect(averageScore(scores({ saque: 10, recepcao: 0 }))).toBeCloseTo(5, 5);
  });
});

describe('latestTwoByAthlete', () => {
  const evals: Evaluation[] = [
    { id: 'e1', athleteUid: 'a1', date: '2026-06-01', scores: scores({ saque: 4 }), notes: '' },
    { id: 'e2', athleteUid: 'a1', date: '2026-07-01', scores: scores({ saque: 7 }), notes: '' },
    { id: 'e3', athleteUid: 'a2', date: '2026-07-05', scores: scores(), notes: '' },
  ];

  it('picks the most recent evaluation as latest, by date string', () => {
    const map = latestTwoByAthlete(evals);
    expect(map.get('a1')?.latest.id).toBe('e2');
    expect(map.get('a1')?.previous?.id).toBe('e1');
  });

  it('leaves previous null when there is only one evaluation', () => {
    const map = latestTwoByAthlete(evals);
    expect(map.get('a2')?.latest.id).toBe('e3');
    expect(map.get('a2')?.previous).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: FAIL — `Cannot find module './evaluation-stats'`.

- [ ] **Step 3: Implement `evaluation-stats.ts`**

Create `frontend/projects/coach/src/app/painel/avaliacoes/evaluation-stats.ts`:
```ts
export interface EvaluationScores {
  saque: number;
  recepcao: number;
  levantamento: number;
  ataque: number;
  defesa: number;
  bloqueio: number;
  condicionamento: number;
  comunicacao: number;
  mental: number;
}

export interface Evaluation {
  id: string;
  athleteUid: string;
  date: string;
  scores: EvaluationScores;
  notes: string;
}

export function averageScore(scores: EvaluationScores): number {
  const values = Object.values(scores);
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Última e penúltima avaliação de cada atleta, ordenadas por data (string ISO, ordenável lexicograficamente). */
export function latestTwoByAthlete(
  evaluations: Evaluation[],
): Map<string, { latest: Evaluation; previous: Evaluation | null }> {
  const byAthlete = new Map<string, Evaluation[]>();
  for (const ev of evaluations) {
    const list = byAthlete.get(ev.athleteUid) ?? [];
    list.push(ev);
    byAthlete.set(ev.athleteUid, list);
  }

  const out = new Map<string, { latest: Evaluation; previous: Evaluation | null }>();
  for (const [athleteUid, list] of byAthlete) {
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
    out.set(athleteUid, { latest: sorted[0]!, previous: sorted[1] ?? null });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng test coach --watch=false`
Expected: PASS.

- [ ] **Step 5: Write `evaluations.service.ts`**

Create `frontend/projects/coach/src/app/painel/avaliacoes/evaluations.service.ts`:
```ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import type { Evaluation, EvaluationScores } from './evaluation-stats';

export interface NewEvaluationInput {
  athleteUid: string;
  scores: EvaluationScores;
  notes: string;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

const SCORE_KEYS: (keyof EvaluationScores)[] = [
  'saque', 'recepcao', 'levantamento', 'ataque', 'defesa', 'bloqueio', 'condicionamento', 'comunicacao', 'mental',
];

function readScores(raw: Record<string, unknown> | undefined): EvaluationScores {
  const out = {} as EvaluationScores;
  for (const key of SCORE_KEYS) {
    const v = raw?.[key];
    out[key] = typeof v === 'number' ? v : 0;
  }
  return out;
}

function readEvaluation(id: string, data: Record<string, unknown> | undefined): Evaluation {
  return {
    id,
    athleteUid: typeof data?.['athleteUid'] === 'string' ? (data['athleteUid'] as string) : '',
    date: typeof data?.['date'] === 'string' ? (data['date'] as string) : '',
    scores: readScores(data?.['scores'] as Record<string, unknown> | undefined),
    notes: typeof data?.['notes'] === 'string' ? (data['notes'] as string) : '',
  };
}

/** `coaches/{uid}/evaluations` é ownership-only (Task 2) — leitura/escrita direta do client. */
@Injectable({ providedIn: 'root' })
export class EvaluationsService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly evaluationsState = signal<Evaluation[]>([]);
  readonly evaluations = computed(() => this.evaluationsState());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      if (!uid) {
        this.evaluationsState.set([]);
        return;
      }

      const stop = onSnapshot(
        collection(this.firestore, 'coaches', uid, 'evaluations'),
        (snapshot) => {
          this.evaluationsState.set(snapshot.docs.map((d) => readEvaluation(d.id, d.data())));
        },
        () => this.evaluationsState.set([]),
      );

      onCleanup(stop);
    });
  }

  async createEvaluation(input: NewEvaluationInput): Promise<string> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      throw new Error('Usuário não autenticado.');
    }
    const ref = doc(collection(this.firestore, 'coaches', uid, 'evaluations'));
    await setDoc(ref, {
      athleteUid: input.athleteUid,
      date: new Date().toISOString().slice(0, 10),
      scores: input.scores,
      notes: input.notes,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }
}
```

- [ ] **Step 6: Write the Avaliações list screen**

Create `frontend/projects/coach/src/app/painel/avaliacoes/panel-avaliacoes.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AthletesService } from '../atletas/athletes.service';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { IconComponent } from '../ui/icon.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';
import { averageScore, latestTwoByAthlete } from './evaluation-stats';
import { EvaluationsService } from './evaluations.service';

@Component({
  selector: 'co-panel-avaliacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AthleteAvatarComponent,
    IconComponent,
    KpiCardComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    RowComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Avaliações" subtitle="Histórico de avaliações da equipe">
        <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/avaliacoes/nova">
          <co-icon name="plus" [size]="14" />
          Nova avaliação
        </a>
      </co-page-header>

      <div class="body">
        <div class="kpi-row">
          <co-kpi-card label="Avaliações no mês" [value]="evaluationsThisMonthLabel()" [icon]="'radar'" />
          <co-kpi-card label="Média geral" [value]="averageLabel()" deltaTone="flat" />
        </div>

        <co-panel-card title="Últimas avaliações por atleta">
          @for (row of rows(); track row.athleteUid; let last = $last) {
            <co-row [title]="row.displayName" [sub]="'Avaliado em ' + row.date" [last]="last">
              <co-athlete-avatar row-avatar [initials]="row.initials" [size]="34" [status]="row.status" />
              <div row-trailing class="score-cell">
                <span class="score">{{ row.average.toFixed(1) }}</span>
                @if (row.delta !== null) {
                  <span class="delta" [class.negative]="row.delta < 0">{{ row.delta >= 0 ? '+' : '' }}{{ row.delta.toFixed(1) }}</span>
                }
              </div>
            </co-row>
          } @empty {
            <p class="empty">Nenhuma avaliação registrada ainda.</p>
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
    .score-cell {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .score {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .delta {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 700;
      color: var(--nx-win);
    }
    .delta.negative {
      color: var(--nx-live);
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
  `,
})
export class PanelAvaliacoesComponent {
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly evaluations = computed(() => this.evaluationsService.evaluations());

  protected readonly evaluationsThisMonthLabel = computed(() => {
    const prefix = new Date().toISOString().slice(0, 7);
    return String(this.evaluations().filter((e) => e.date.startsWith(prefix)).length);
  });

  protected readonly rows = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const roster = this.athletesService.roster().filter((a) => !activeId || a.squadId === activeId);
    const byAthlete = latestTwoByAthlete(this.evaluations());
    return roster
      .map((a) => {
        const entry = byAthlete.get(a.athleteUid);
        if (!entry) {
          return null;
        }
        const average = averageScore(entry.latest.scores);
        const delta = entry.previous ? average - averageScore(entry.previous.scores) : null;
        return {
          athleteUid: a.athleteUid,
          displayName: a.displayName,
          initials: a.initials,
          status: a.status,
          date: entry.latest.date,
          average,
          delta,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  });

  protected readonly averageLabel = computed(() => {
    const list = this.rows();
    if (list.length === 0) {
      return '—';
    }
    return (list.reduce((sum, r) => sum + r.average, 0) / list.length).toFixed(1);
  });
}
```

- [ ] **Step 7: Write the Nova avaliação screen**

Create `frontend/projects/coach/src/app/painel/avaliacoes/panel-nova-avaliacao.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AthletesService } from '../atletas/athletes.service';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RadarChartComponent } from '../ui/radar-chart.component';
import { SquadContextService } from '../ui/squad-context.service';
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

function defaultScores(): EvaluationScores {
  return {
    saque: 5, recepcao: 5, levantamento: 5, ataque: 5, defesa: 5,
    bloqueio: 5, condicionamento: 5, comunicacao: 5, mental: 5,
  };
}

@Component({
  selector: 'co-panel-nova-avaliacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PanelCardComponent, PanelShellComponent, RadarChartComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Avaliações dos atletas" [subtitle]="subtitle()">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving() || !athleteUid()" (click)="submit()">
          @if (saving()) {
            Salvando…
          } @else {
            Salvar avaliação
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        <co-panel-card title="Atleta" kicker="Selecionar da lista">
          <select class="picker" [value]="athleteUid() ?? ''" (change)="selectAthlete($any($event.target).value)">
            <option value="">Selecione…</option>
            @for (a of roster(); track a.athleteUid) {
              <option [value]="a.athleteUid">{{ a.displayName }}</option>
            }
          </select>
        </co-panel-card>

        <div class="grid">
          <co-panel-card title="Radar de fundamentos" class="radar-card">
            <co-radar-chart [axes]="axes()" [size]="290" />
          </co-panel-card>
          <co-panel-card title="Notas por fundamento" kicker="Escala de 0 a 10">
            @for (f of fundamentals; track f.key) {
              <div class="score-row">
                <span class="score-label">{{ f.label }}</span>
                <input type="range" min="0" max="10" step="0.5" [value]="scores()[f.key]" (input)="setScore(f.key, +$any($event.target).value)" />
                <span class="score-value">{{ scores()[f.key] }}</span>
              </div>
            }
          </co-panel-card>
        </div>

        <co-panel-card title="Observações">
          <textarea class="notes" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea>
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
      max-width: 900px;
      overflow: auto;
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
      width: 100%;
    }
    .grid {
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 16px;
    }
    .radar-card {
      display: flex;
      align-items: center;
    }
    .score-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
    }
    .score-label {
      width: 120px;
      flex: none;
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .score-row input[type='range'] {
      flex: 1;
    }
    .score-value {
      width: 28px;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .notes {
      width: 100%;
      min-height: 70px;
      padding: 10px 12px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      box-sizing: border-box;
      resize: vertical;
    }
  `,
})
export class PanelNovaAvaliacaoComponent {
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);
  private readonly router = inject(Router);

  protected readonly fundamentals = FUNDAMENTALS;

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  protected readonly athleteUid = signal<string | null>(null);
  protected readonly scores = signal<EvaluationScores>(defaultScores());
  protected readonly notes = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly axes = computed(() =>
    this.fundamentals.map((f) => ({ label: f.label, value: this.scores()[f.key] })),
  );

  protected readonly subtitle = computed(() => {
    const a = this.roster().find((r) => r.athleteUid === this.athleteUid());
    return a ? `${a.displayName} · Nova avaliação` : 'Selecione um atleta';
  });

  protected selectAthlete(uid: string): void {
    this.athleteUid.set(uid || null);
  }

  protected setScore(key: keyof EvaluationScores, value: number): void {
    this.scores.update((s) => ({ ...s, [key]: value }));
  }

  protected async submit(): Promise<void> {
    const uid = this.athleteUid();
    if (!uid) {
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      await this.evaluationsService.createEvaluation({ athleteUid: uid, scores: this.scores(), notes: this.notes() });
      void this.router.navigateByUrl('/painel/avaliacoes');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar a avaliação.');
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 8: Add the routes**

In `frontend/projects/coach/src/app/app.routes.ts`, insert before `{ path: '**', redirectTo: '' }`:
```ts
  {
    path: 'painel/avaliacoes',
    title: 'Avaliações — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/avaliacoes/panel-avaliacoes.component').then((m) => m.PanelAvaliacoesComponent),
  },
  {
    path: 'painel/avaliacoes/nova',
    title: 'Nova avaliação — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/avaliacoes/panel-nova-avaliacao.component').then((m) => m.PanelNovaAvaliacaoComponent),
  },
```

- [ ] **Step 9: Build and manually verify**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds.

Go to "Avaliações" → "Nova avaliação", pick the linked athlete, drag a few sliders (watch the radar chart update live), save. Expected: redirected to `/painel/avaliacoes`, the athlete now appears with an average score. Create a second evaluation for the same athlete with different scores — expected: the list now shows a `+`/`-` delta next to the average.

- [ ] **Step 10: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/avaliacoes frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add technical evaluations (listing, radar form)"
```

---

## Task 15: Histórico — per-athlete timeline

**Files:**
- Create: `frontend/projects/coach/src/app/painel/historico/panel-historico.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `AthletesService` (Task 9), `TrainingsService` (Task 11), `EvaluationsService`/`averageScore` (Task 14), `SquadContextService` (Task 5). No new service — pure client-side aggregation of data these already expose.

**Design note:** the prototype's Histórico also has "Torneios", "Lesões", and "Evolução do rating" entries. Those need data this MVP doesn't have yet (tournament results, the lesões module, and a confirmed rating-history field — see Task 9's note on `public_profiles` not having a plain rating). This task only surfaces **treinos/presença** and **avaliações**, which is everything currently tracked.

- [ ] **Step 1: Write `panel-historico.component.ts`**

Create `frontend/projects/coach/src/app/painel/historico/panel-historico.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AthletesService } from '../atletas/athletes.service';
import { averageScore } from '../avaliacoes/evaluation-stats';
import { EvaluationsService } from '../avaliacoes/evaluations.service';
import { AttendanceStatus, TrainingsService } from '../treinos/trainings.service';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';

interface HistoryItem {
  date: string;
  kind: 'presenca' | 'avaliacao';
  title: string;
  sub: string;
}

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  presente: 'Presente',
  ausente: 'Ausente',
  atrasado: 'Atrasado',
  justificado: 'Justificado',
};

@Component({
  selector: 'co-panel-historico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Histórico completo" [subtitle]="subtitle()">
        <select class="picker" [value]="athleteUid() ?? ''" (change)="selectAthlete($any($event.target).value)">
          <option value="">Selecione um atleta…</option>
          @for (a of roster(); track a.athleteUid) {
            <option [value]="a.athleteUid">{{ a.displayName }}</option>
          }
        </select>
      </co-page-header>

      <div class="body">
        @if (!athleteUid()) {
          <p class="empty">Selecione um atleta pra ver a linha do tempo.</p>
        } @else {
          <co-panel-card title="Tudo registrado">
            @for (item of items(); track item.date + item.title; let last = $last) {
              <div class="item" [class.last]="last">
                <div class="item-date">{{ item.date }}</div>
                <div class="item-dot" [class]="'kind-' + item.kind"></div>
                <div class="item-body">
                  <div class="item-title">{{ item.title }}</div>
                  @if (item.sub) {
                    <div class="item-sub">{{ item.sub }}</div>
                  }
                </div>
              </div>
            } @empty {
              <p class="empty">Nenhum registro ainda pra este atleta.</p>
            }
          </co-panel-card>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      overflow: auto;
    }
    .picker {
      height: 36px;
      padding: 0 10px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
    .item {
      display: flex;
      gap: 14px;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .item.last {
      border-bottom: none;
    }
    .item-date {
      width: 78px;
      flex: none;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      padding-top: 2px;
    }
    .item-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-top: 6px;
      flex: none;
    }
    .item-dot.kind-presenca {
      background: var(--nx-orange-500);
    }
    .item-dot.kind-avaliacao {
      background: var(--nx-win);
    }
    .item-body {
      flex: 1;
      min-width: 0;
    }
    .item-title {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .item-sub {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
  `,
})
export class PanelHistoricoComponent {
  private readonly athletesService = inject(AthletesService);
  private readonly trainingsService = inject(TrainingsService);
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  protected readonly athleteUid = signal<string | null>(null);

  protected readonly subtitle = computed(() => {
    const a = this.roster().find((r) => r.athleteUid === this.athleteUid());
    return a ? `${a.displayName} · Linha do tempo` : 'Selecione um atleta';
  });

  protected readonly items = computed<HistoryItem[]>(() => {
    const uid = this.athleteUid();
    if (!uid) {
      return [];
    }

    const attendanceItems: HistoryItem[] = this.trainingsService
      .trainings()
      .filter((t) => t.attendance[uid] != null)
      .map((t) => ({
        date: t.date,
        kind: 'presenca' as const,
        title: `${ATTENDANCE_LABEL[t.attendance[uid]]} · ${t.title}`,
        sub: [t.startTime, t.location].filter(Boolean).join(' · '),
      }));

    const evaluationItems: HistoryItem[] = this.evaluationsService
      .evaluations()
      .filter((e) => e.athleteUid === uid)
      .map((e) => ({
        date: e.date,
        kind: 'avaliacao' as const,
        title: `Avaliação técnica registrada · média ${averageScore(e.scores).toFixed(1)}`,
        sub: e.notes,
      }));

    return [...attendanceItems, ...evaluationItems].sort((a, b) => b.date.localeCompare(a.date));
  });

  protected selectAthlete(uid: string): void {
    this.athleteUid.set(uid || null);
  }
}
```

- [ ] **Step 2: Add the route**

In `frontend/projects/coach/src/app/app.routes.ts`, insert before `{ path: '**', redirectTo: '' }`:
```ts
  {
    path: 'painel/historico',
    title: 'Histórico — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/historico/panel-historico.component').then((m) => m.PanelHistoricoComponent),
  },
```

- [ ] **Step 3: Build and manually verify**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds.

Go to "Histórico", select the linked athlete (the one with attendance and evaluation records from Tasks 11 and 14). Expected: a chronological list mixing presence marks and evaluations, most recent first.

- [ ] **Step 4: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/historico frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add per-athlete history timeline"
```

---

## Task 16: Torneios (view-only) — `getCoachTournamentOverview` + screen

**Files:**
- Create: `functions/src/coach-tournament-overview.ts`
- Create: `functions/src/coach-tournament-overview.test.ts`
- Modify: `functions/src/index.ts`
- Create: `frontend/projects/coach/src/app/painel/torneios/panel-torneios.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Produces: `groupEntriesByTournament(rows: RawInscriptionRow[]): Map<string, AthleteTournamentEntry[]>` (pure, tested). `getCoachTournamentOverview` callable — input `{ squadId? }`, returns `{ tournaments: CoachTournamentOverviewItem[] }` where each item is `{ tournamentId, tournamentName, entries: AthleteTournamentEntry[] }` and each entry is `{ athleteUid, registrationId, categoryId, isPaid, partnerPending }`. Read-only: this function never writes anything — registering/paying stays in the athlete's own app, as decided in the design.

- [ ] **Step 1: Write the failing test for `groupEntriesByTournament`**

Create `functions/src/coach-tournament-overview.test.ts`:
```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {groupEntriesByTournament, type RawInscriptionRow} from "./coach-tournament-overview";

describe("groupEntriesByTournament", () => {
  it("groups multiple athletes' entries under the same tournament", () => {
    const rows: RawInscriptionRow[] = [
      {athleteUid: "a1", registrationId: "r1", tournamentId: "t1", categoryId: "open", isPaid: true, partnerPending: false},
      {athleteUid: "a2", registrationId: "r2", tournamentId: "t1", categoryId: "open", isPaid: false, partnerPending: true},
      {athleteUid: "a1", registrationId: "r3", tournamentId: "t2", categoryId: "inter", isPaid: true, partnerPending: false},
    ];
    const grouped = groupEntriesByTournament(rows);
    assert.equal(grouped.get("t1")?.length, 2);
    assert.equal(grouped.get("t2")?.length, 1);
    assert.equal(grouped.get("t1")?.[1].partnerPending, true);
  });

  it("returns an empty map for no rows", () => {
    assert.equal(groupEntriesByTournament([]).size, 0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run build && node --test lib/coach-tournament-overview.test.js`
Expected: FAIL — `Cannot find module './coach-tournament-overview'`.

- [ ] **Step 3: Implement `coach-tournament-overview.ts`**

Create `functions/src/coach-tournament-overview.ts`:
```ts
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {artifactsInscriptionsPath, getFirebaseProjectId} from "./firebase-paths";
import {loadTournamentData} from "./tournament-registration-guards";

export interface RawInscriptionRow {
  athleteUid: string;
  registrationId: string;
  tournamentId: string;
  categoryId: string;
  isPaid: boolean;
  partnerPending: boolean;
}

export interface AthleteTournamentEntry {
  athleteUid: string;
  registrationId: string;
  categoryId: string;
  isPaid: boolean;
  partnerPending: boolean;
}

export interface CoachTournamentOverviewItem {
  tournamentId: string;
  tournamentName: string;
  entries: AthleteTournamentEntry[];
}

/** Agrupa linhas de inscrição já buscadas do Firestore por torneio — puro, sem I/O. */
export function groupEntriesByTournament(
  rows: RawInscriptionRow[],
): Map<string, AthleteTournamentEntry[]> {
  const out = new Map<string, AthleteTournamentEntry[]>();
  for (const row of rows) {
    const list = out.get(row.tournamentId) ?? [];
    list.push({
      athleteUid: row.athleteUid,
      registrationId: row.registrationId,
      categoryId: row.categoryId,
      isPaid: row.isPaid,
      partnerPending: row.partnerPending,
    });
    out.set(row.tournamentId, list);
  }
  return out;
}

/**
 * Visão somente leitura de torneios pros atletas vinculados ao treinador —
 * nunca inscreve/paga (isso continua sendo feito pelo atleta no app dele,
 * por decisão de design). `squadId` opcional filtra pra uma equipe.
 */
export const getCoachTournamentOverview = onCall(async (request) => {
  const coachUid = request.auth?.uid;
  if (!coachUid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const squadId = (request.data?.squadId as string | undefined)?.trim() ?? "";

  const db = getFirestore();
  const projectId = getFirebaseProjectId();

  const athletesSnap = await db.collection(`coaches/${coachUid}/athletes`).get();
  const athleteUids = athletesSnap.docs
    .filter((d) => !squadId || d.data()["squadId"] === squadId)
    .map((d) => d.id);

  if (athleteUids.length === 0) {
    return {tournaments: [] as CoachTournamentOverviewItem[]};
  }

  const inscriptionsRef = db.collection(artifactsInscriptionsPath(projectId));
  const rows: RawInscriptionRow[] = [];
  for (const athleteUid of athleteUids) {
    const snap = await inscriptionsRef.where("participantUids", "array-contains", athleteUid).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const tournamentId = String(data["tournamentId"] ?? "");
      if (!tournamentId) {
        continue;
      }
      rows.push({
        athleteUid,
        registrationId: doc.id,
        tournamentId,
        categoryId: String(data["categoryId"] ?? ""),
        isPaid: data["isPaid"] === true,
        partnerPending: data["partnerPending"] === true,
      });
    }
  }

  const grouped = groupEntriesByTournament(rows);

  const tournaments: CoachTournamentOverviewItem[] = [];
  for (const [tournamentId, entries] of grouped) {
    const tournament = await loadTournamentData(db, projectId, tournamentId);
    tournaments.push({
      tournamentId,
      tournamentName: String(tournament?.["name"] ?? "Torneio"),
      entries,
    });
  }

  return {tournaments};
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run build && node --test lib/coach-tournament-overview.test.js`
Expected: PASS.

- [ ] **Step 5: Export the function**

At the end of `functions/src/index.ts`, add:
```ts
export {getCoachTournamentOverview} from "./coach-tournament-overview";
```

- [ ] **Step 6: Lint, build, deploy**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/functions && npm run lint && npm run build`
Expected: no TypeScript errors.

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago && firebase deploy --only functions:getCoachTournamentOverview --project volley-track-dev-4596c`
Expected: `Deploy complete!`

- [ ] **Step 7: Write the Torneios screen**

Create `frontend/projects/coach/src/app/painel/torneios/panel-torneios.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { getApps } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AthletesService } from '../atletas/athletes.service';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';

interface AthleteTournamentEntry {
  athleteUid: string;
  registrationId: string;
  categoryId: string;
  isPaid: boolean;
  partnerPending: boolean;
}

interface CoachTournamentOverviewItem {
  tournamentId: string;
  tournamentName: string;
  entries: AthleteTournamentEntry[];
}

@Component({
  selector: 'co-panel-torneios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Torneios" [subtitle]="subtitle()" />

      <div class="body">
        @if (loading()) {
          <p class="empty">Carregando…</p>
        } @else if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        } @else if (tournaments().length === 0) {
          <p class="empty">Nenhum atleta da equipe está inscrito em torneios no momento.</p>
        } @else {
          @for (t of tournaments(); track t.tournamentId) {
            <co-panel-card [title]="t.tournamentName" [kicker]="t.entries.length + ' inscrições'">
              @for (e of t.entries; track e.registrationId; let last = $last) {
                <co-row [title]="athleteName(e.athleteUid)" [sub]="e.categoryId" [last]="last">
                  <co-pill row-trailing [tone]="statusTone(e)">{{ statusLabel(e) }}</co-pill>
                </co-row>
              }
            </co-panel-card>
          }
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
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
  `,
})
export class PanelTorneiosComponent {
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly tournaments = signal<CoachTournamentOverviewItem[]>([]);

  protected readonly subtitle = computed(() => {
    const n = this.tournaments().length;
    return `${n} torneio${n === 1 ? '' : 's'} com atletas inscritos`;
  });

  constructor() {
    effect(() => {
      const squadId = this.squadContext.activeSquadId();
      void this.load(squadId);
    });
  }

  private async load(squadId: string | null): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const fn = httpsCallable<{ squadId?: string }, { tournaments: CoachTournamentOverviewItem[] }>(
        getFunctions(getApps()[0]!),
        'getCoachTournamentOverview',
      );
      const res = await fn(squadId ? { squadId } : {});
      this.tournaments.set(res.data.tournaments);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível carregar os torneios.');
    } finally {
      this.loading.set(false);
    }
  }

  protected athleteName(uid: string): string {
    return this.athletesService.roster().find((a) => a.athleteUid === uid)?.displayName ?? 'Atleta';
  }

  protected statusLabel(e: AthleteTournamentEntry): string {
    if (e.partnerPending) {
      return 'Aguardando parceiro';
    }
    return e.isPaid ? 'Inscrito e pago' : 'Inscrito';
  }

  protected statusTone(e: AthleteTournamentEntry): PillTone {
    return e.partnerPending ? 'yellow' : 'green';
  }
}
```

- [ ] **Step 8: Add the route**

In `frontend/projects/coach/src/app/app.routes.ts`, insert before `{ path: '**', redirectTo: '' }`:
```ts
  {
    path: 'painel/torneios',
    title: 'Torneios — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/torneios/panel-torneios.component').then((m) => m.PanelTorneiosComponent),
  },
```

- [ ] **Step 9: Build and manually verify**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds.

Go to "Torneios". If the linked athlete from earlier tasks has no real tournament registrations in the dev project, expect the empty state ("Nenhum atleta da equipe está inscrito..."). If you have a dev tournament with that athlete registered (from prior manual testing of the athlete/arena flows), expect it to show up grouped by tournament with a status pill per entry.

- [ ] **Step 10: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add functions/src/coach-tournament-overview.ts functions/src/coach-tournament-overview.test.ts functions/src/index.ts frontend/projects/coach/src/app/painel/torneios frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add read-only tournament overview"
```

---

## Task 17: Início (dashboard) — replaces the placeholder route

**Files:**
- Create: `frontend/projects/coach/src/app/painel/home/panel-inicio.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts` (removes the `PainelPlaceholderComponent` placeholder from Tasks 1/5, wires the real screen)

**Interfaces:**
- Consumes: `AuthService` (Task 4), `AthletesService` (Task 9), `TrainingsService` (Task 11), `EvaluationsService` (Task 14), `CallUpsService` (Task 13), `SquadContextService` (Task 5).

**Design note:** the prototype's Início also shows "Aproveitamento", "Vitórias × derrotas", "Rating médio", and "Próximos torneios" — none of those have a real data source in this MVP (win/loss results and a numeric rating aren't tracked anywhere reachable — see Task 9's and Task 16's notes). Rather than fabricate placeholder numbers, this screen only shows KPIs backed by data that actually exists: nº de atletas, frequência (computed from real attendance), avaliações no mês, and convocações pendentes — plus two roster-status widgets (lesionados, afastados/férias) and upcoming trainings, all genuinely real.

**Angular template note:** none of this task's string-needing bindings call global functions like `String(...)` inside a template expression (Angular's `strictTemplates` doesn't allow that) — every value shown is exposed as an already-formatted string via a `computed()` in the component class.

- [ ] **Step 1: Write `panel-inicio.component.ts`**

Create `frontend/projects/coach/src/app/painel/home/panel-inicio.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { AthletesService } from '../atletas/athletes.service';
import { EvaluationsService } from '../avaliacoes/evaluations.service';
import { CallUpsService } from '../convocacoes/call-ups.service';
import { TrainingsService } from '../treinos/trainings.service';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { KpiCardComponent } from '../ui/kpi-card.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';

@Component({
  selector: 'co-panel-inicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AthleteAvatarComponent,
    KpiCardComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    RowComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header [title]="greeting()" [subtitle]="subtitle()" />

      <div class="body">
        <div class="kpi-row">
          <co-kpi-card label="Nº de atletas" [value]="rosterCountLabel()" [icon]="'team'" />
          <co-kpi-card label="Frequência" [value]="attendanceRateLabel()" [icon]="'check'" />
          <co-kpi-card label="Avaliações no mês" [value]="evaluationsThisMonthLabel()" [icon]="'radar'" />
          <co-kpi-card label="Convocações pendentes" [value]="pendingResponsesLabel()" [icon]="'bell'" />
        </div>

        <div class="grid">
          <co-panel-card title="Próximos treinos" kicker="Data mais próxima primeiro">
            @for (t of upcomingTrainings(); track t.id; let last = $last) {
              <co-row [title]="t.title" [sub]="t.date + ' · ' + t.startTime + ' · ' + (t.location || 'Local não definido')" [last]="last" />
            } @empty {
              <p class="empty">Nenhum treino agendado. <a routerLink="/painel/treinos/novo">Criar treino</a></p>
            }
          </co-panel-card>

          <div class="side">
            <co-panel-card title="Atletas lesionados" [kicker]="injuredCountLabel()">
              @for (a of injured(); track a.athleteUid; let last = $last) {
                <co-row [title]="a.displayName" [sub]="a.category" [last]="last">
                  <co-athlete-avatar row-avatar [initials]="a.initials" [size]="32" [status]="a.status" />
                </co-row>
              } @empty {
                <p class="empty">Nenhum atleta lesionado.</p>
              }
            </co-panel-card>
            <co-panel-card title="Afastados / férias" [kicker]="awayCountLabel()">
              @for (a of awayOrVacation(); track a.athleteUid; let last = $last) {
                <co-row [title]="a.displayName" [sub]="a.category" [last]="last">
                  <co-athlete-avatar row-avatar [initials]="a.initials" [size]="32" [status]="a.status" />
                </co-row>
              } @empty {
                <p class="empty">Ninguém afastado agora.</p>
              }
            </co-panel-card>
          </div>
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
      flex-wrap: wrap;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 16px;
      align-items: start;
    }
    .side {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
    .empty a {
      color: var(--nx-orange-500);
    }
  `,
})
export class PanelInicioComponent {
  private readonly auth = inject(AuthService);
  private readonly athletesService = inject(AthletesService);
  private readonly trainingsService = inject(TrainingsService);
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly callUpsService = inject(CallUpsService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly greeting = computed(() => {
    const name = this.auth.displayName();
    const firstName = name ? name.split(' ')[0] : null;
    return firstName ? `Bom dia, ${firstName}.` : 'Bom dia.';
  });

  protected readonly subtitle = computed(() => this.squadContext.activeSquad()?.name ?? 'Nenhuma equipe selecionada');

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  protected readonly rosterCountLabel = computed(() => `${this.roster().length}`);

  protected readonly injured = computed(() => this.roster().filter((a) => a.status === 'lesionado'));
  protected readonly injuredCountLabel = computed(() => `${this.injured().length}`);

  protected readonly awayOrVacation = computed(() =>
    this.roster().filter((a) => a.status === 'afastado' || a.status === 'ferias'),
  );
  protected readonly awayCountLabel = computed(() => `${this.awayOrVacation().length}`);

  protected readonly upcomingTrainings = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const today = new Date().toISOString().slice(0, 10);
    return this.trainingsService
      .trainings()
      .filter((t) => (!activeId || t.squadId === activeId) && t.date >= today && t.status !== 'cancelado')
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
  });

  protected readonly attendanceRateLabel = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const trainings = this.trainingsService.trainings().filter((t) => !activeId || t.squadId === activeId);
    let total = 0;
    let present = 0;
    for (const t of trainings) {
      for (const status of Object.values(t.attendance)) {
        total++;
        if (status === 'presente') {
          present++;
        }
      }
    }
    return total === 0 ? '—' : `${Math.round((present / total) * 100)}%`;
  });

  protected readonly evaluationsThisMonthLabel = computed(() => {
    const prefix = new Date().toISOString().slice(0, 7);
    const n = this.evaluationsService.evaluations().filter((e) => e.date.startsWith(prefix)).length;
    return `${n}`;
  });

  protected readonly pendingResponsesLabel = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const n = this.callUpsService
      .callUps()
      .filter((c) => !activeId || c.squadId === activeId)
      .reduce((sum, c) => sum + Object.values(c.responses).filter((r) => r === 'aguardando').length, 0);
    return `${n}`;
  });
}
```

- [ ] **Step 2: Replace the `/painel` placeholder with the real screen**

In `frontend/projects/coach/src/app/app.routes.ts`:

1. Remove the `PainelPlaceholderComponent` class entirely (it was introduced in Task 1 and wrapped in `co-panel-shell` in Task 5 — no longer needed):
```ts
import { PanelShellComponent } from './painel/ui/panel-shell.component';

@Component({
  selector: 'app-painel-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent],
  template: `
    <co-panel-shell>
      <p style="font-family: system-ui; padding: 24px; color: var(--nx-text-dim);">Início — em construção (Task 17).</p>
    </co-panel-shell>
  `,
})
class PainelPlaceholderComponent {}
```
2. Remove the now-unused `Component`/`ChangeDetectionStrategy` and `PanelShellComponent` imports from the top of the file (nothing else in `app.routes.ts` uses them after this class is deleted) — the file's imports should go back to just `Routes` from `@angular/router`, `authGuard`, and `coachGuard`.
3. Replace the `painel` route's `component: PainelPlaceholderComponent` with a lazy `loadComponent`:
```ts
  {
    path: 'painel',
    title: 'Painel — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/home/panel-inicio.component').then((m) => m.PanelInicioComponent),
  },
```

- [ ] **Step 3: Build and manually verify the full MVP end to end**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds, and there are no unused-import lint warnings in `app.routes.ts`.

Log in as the coach, land on `/painel`. Expected: KPI row shows the real athlete count, an attendance percentage matching the marks from Task 11, the evaluation count from Task 14, and pending call-up responses from Task 13; "Próximos treinos" lists the training created in Task 11 (if its date is in the future — adjust the test data's date if needed to see it here); the injured/away lists populate correctly if you set an athlete's status to `lesionado`/`afastado`/`ferias` from the Atletas screen's edit mode (Task 9).

- [ ] **Step 4: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/home frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add real dashboard (Início), replacing the placeholder"
```

---

## Task 18: Perfil (coach account settings) — closes out the MVP

**Files:**
- Modify: `frontend/projects/coach/src/app/auth/auth.service.ts` (add `updateDisplayName`)
- Create: `frontend/projects/coach/src/app/painel/perfil/panel-perfil.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `AuthService`, `FormFieldComponent`, `PageHeaderComponent`, `PanelCardComponent`, `PanelShellComponent`.
- Produces: `AuthService.updateDisplayName(name: string): Promise<void>` — keeps the Firebase Auth profile (used by the sidebar's user footer) in sync with the name edited here, so the two never disagree.

- [ ] **Step 1: Add `updateDisplayName` to `auth.service.ts`**

In `frontend/projects/coach/src/app/auth/auth.service.ts`, add `updateProfile` to the existing `firebase/auth` import list (it's already imported for `createCoachAccount`, so this just adds a new method that reuses it):
```ts
  /** Mantém o displayName do Firebase Auth (usado no rodapé da sidebar) em sincronia com o editado no Perfil. */
  async updateDisplayName(name: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Usuário não autenticado.');
    }
    await updateProfile(user, { displayName: name.trim() });
    this.displayNameOverride.set(name.trim());
  }
```
Add this method right after `createCoachAccount` (both use `updateProfile`, keeping the two together).

- [ ] **Step 2: Write `panel-perfil.component.ts`**

Create `frontend/projects/coach/src/app/painel/perfil/panel-perfil.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { FormFieldComponent } from '../ui/form-field.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

@Component({
  selector: 'co-panel-perfil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormFieldComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Perfil" subtitle="Seus dados de treinador">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving()" (click)="save()">
          @if (saving()) {
            Salvando…
          } @else {
            Salvar alterações
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (saved()) {
          <div class="co-alert saved" role="status">Dados salvos.</div>
        }

        <co-panel-card title="Dados do treinador" kicker="Nome e contato">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Nome completo" formControlName="displayName" [wide]="true" />
            <co-form-field label="Telefone" formControlName="phone" />
          </form>
        </co-panel-card>

        <co-panel-card [title]="'Conta'" [kicker]="auth.user()?.email ?? ''">
          <button type="button" class="co-ghost-btn" (click)="signOut()">Sair da conta</button>
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
      max-width: 640px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .co-alert.saved {
      background: rgba(43, 209, 126, 0.1);
      border-color: rgba(43, 209, 126, 0.35);
      color: var(--nx-win);
    }
  `,
})
export class PanelPerfilComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly firestore = createFirestore();

  protected readonly form = this.fb.group({
    displayName: ['', Validators.required],
    phone: [''],
  });

  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return;
    }
    const snap = await getDoc(doc(this.firestore, 'coaches', uid));
    const data = snap.data();
    this.form.setValue({
      displayName: (data?.['displayName'] as string | undefined) ?? this.auth.displayName() ?? '',
      phone: (data?.['phone'] as string | undefined) ?? '',
    });
  }

  protected async save(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || this.form.invalid) {
      return;
    }
    this.error.set(null);
    this.saved.set(false);
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      await Promise.all([
        setDoc(
          doc(this.firestore, 'coaches', uid),
          { displayName: raw.displayName, phone: raw.phone, updatedAt: serverTimestamp() },
          { merge: true },
        ),
        this.auth.updateDisplayName(raw.displayName),
      ]);
      this.saved.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }
}
```

- [ ] **Step 3: Add the route**

In `frontend/projects/coach/src/app/app.routes.ts`, insert before `{ path: '**', redirectTo: '' }`:
```ts
  {
    path: 'painel/perfil',
    title: 'Perfil — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/perfil/panel-perfil.component').then((m) => m.PanelPerfilComponent),
  },
```

- [ ] **Step 4: Build and manually verify**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds.

Navigate to `/painel/perfil` (no sidebar link yet — the MVP nav has 10 items and Perfil isn't one of them, matching the design's account-menu placement rather than main nav; reach it by typing the URL for now). Change the name and phone, save. Expected: "Dados salvos." message appears; the sidebar's user footer (bottom-left, visible on every `/painel/**` screen) immediately reflects the new name, since `updateDisplayName` updates the same `displayNameOverride` signal the shell reads.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/auth/auth.service.ts frontend/projects/coach/src/app/painel/perfil frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add coach profile/settings screen"
```

---

## Task 19: Agenda — week view of trainings

**Files:**
- Create: `frontend/projects/coach/src/app/painel/agenda/panel-agenda.component.ts`
- Modify: `frontend/projects/coach/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `TrainingsService` (Task 11), `SquadContextService` (Task 5). No new service.

**Design note:** the prototype's `TrAgendaScreen` is a calendar aggregating five event kinds (treinos, torneios, eventos, reuniões, clínicas) — this MVP only ever creates one (treinos, from Task 11). Building five event-kind support now, with four of them permanently empty, would be exactly the kind of speculative complexity `CLAUDE.md` warns against. So this screen is a week-view calendar of **trainings only** — real, useful today, and gets the other event kinds trivially once something creates them later (each would just be another list filtered into the same day cell).

- [ ] **Step 1: Write `panel-agenda.component.ts`**

Create `frontend/projects/coach/src/app/painel/agenda/panel-agenda.component.ts`:
```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';
import { TrainingsService } from '../treinos/trainings.service';

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface WeekDay {
  iso: string;
  label: string;
  dayNumber: number;
}

@Component({
  selector: 'co-panel-agenda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Agenda" [subtitle]="weekLabel()">
        <div class="actions">
          <button type="button" class="co-ghost-btn" (click)="previousWeek()">← Anterior</button>
          <button type="button" class="co-ghost-btn" (click)="nextWeek()">Próxima →</button>
          <a class="co-mini-btn co-mini-btn-primary" routerLink="/painel/treinos/novo">
            <co-icon name="plus" [size]="14" />
            Novo treino
          </a>
        </div>
      </co-page-header>

      <div class="body">
        <co-panel-card pad="sm" class="grid-card">
          <div class="week-grid">
            @for (day of weekDays(); track day.iso; let last = $last) {
              <div class="day-col" [class.last]="last">
                <div class="day-label">{{ day.label }} {{ day.dayNumber }}</div>
                @for (t of trainingsForDay(day.iso); track t.id) {
                  <div class="event">{{ t.startTime }} · {{ t.title }}</div>
                } @empty {
                  <div class="event-empty">—</div>
                }
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
      overflow: hidden;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .grid-card {
      height: 100%;
    }
    .week-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      height: 100%;
    }
    .day-col {
      padding: 14px;
      border-right: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .day-col.last {
      border-right: none;
    }
    .day-label {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }
    .event {
      font-family: var(--nx-font-ui);
      font-size: 10.5px;
      font-weight: 600;
      padding: 4px 7px;
      border-radius: 6px;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-400);
      margin-bottom: 4px;
    }
    .event-empty {
      color: var(--nx-text-dim);
      font-size: 11px;
    }
  `,
})
export class PanelAgendaComponent {
  private readonly trainingsService = inject(TrainingsService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly weekOffset = signal(0);

  protected readonly weekDays = computed<WeekDay[]>(() => {
    const base = addDays(startOfWeek(new Date()), this.weekOffset() * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(base, i);
      return { iso: toIsoDate(d), label: WEEKDAY_LABELS[i], dayNumber: d.getDate() };
    });
  });

  protected readonly weekLabel = computed(() => {
    const days = this.weekDays();
    return `Semana de ${days[0]!.dayNumber} a ${days[6]!.dayNumber}`;
  });

  protected readonly trainings = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    return this.trainingsService.trainings().filter((t) => !activeId || t.squadId === activeId);
  });

  protected trainingsForDay(iso: string) {
    return this.trainings().filter((t) => t.date === iso);
  }

  protected previousWeek(): void {
    this.weekOffset.update((w) => w - 1);
  }

  protected nextWeek(): void {
    this.weekOffset.update((w) => w + 1);
  }
}
```

- [ ] **Step 2: Add the route**

In `frontend/projects/coach/src/app/app.routes.ts`, insert before `{ path: '**', redirectTo: '' }`:
```ts
  {
    path: 'painel/agenda',
    title: 'Agenda — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/agenda/panel-agenda.component').then((m) => m.PanelAgendaComponent),
  },
```

- [ ] **Step 3: Build and manually verify**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/frontend && npx ng build coach`
Expected: build succeeds.

Go to "Agenda" from the sidebar (this is the last of the 10 nav items to get a real route — every nav link now goes somewhere real instead of bouncing to `/entrar`). Expected: a 7-column week grid, Monday to Sunday, with the training created in Task 11 appearing under its correct day; "← Anterior"/"Próxima →" move the window a week at a time.

- [ ] **Step 4: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago
git add frontend/projects/coach/src/app/painel/agenda frontend/projects/coach/src/app/app.routes.ts
git commit -m "feat(coach): add agenda week view"
```

---

## Done: MVP scope

After Task 19, the coach portal MVP is complete: auth (self-signup, login, password recovery), Firestore/Cloud Function backing for every module, and all 10 screens from the approved design — Início, Agenda, Atletas, Equipes, Treinos, Presença, Convocações, Avaliações, Histórico, Torneios — plus Perfil (account settings) and the two athlete-side response routes (`/convite-atleta/:id`, `/convocacao/:coachUid/:callUpId`) that close the invite/call-up loop without touching `athlete` or the Flutter app. Every sidebar nav link resolves to a real screen; nothing points at a placeholder.

**Trims made along the way, all called out at the task where they were discovered** (not silent): no numeric athlete rating badge (Task 9 — field doesn't exist anywhere confirmed), "Novo atleta" is invite-by-email instead of manual entry (Task 9 — required by the approved consent model), Atletas' "Estatísticas" tab deferred (Task 9 — needs Task 16's data, which arrived later in the sequence), Avaliações' "Maior evolução" KPI dropped (Task 14), Histórico limited to treinos/avaliações (Task 15 — lesões/torneios/rating history aren't tracked), Início drops aproveitamento/vitórias×derrotas/rating médio/próximos torneios (Task 17 — no real data source), Agenda scoped to trainings only (Task 19 — the only event kind this MVP creates).

**Deviations from the written spec, found while turning it into this plan** (the spec predates this plan and got a few implementation details wrong — corrected here rather than followed blindly):
- **Search is e-mail-only**, not phone-or-e-mail (Task 8) — phone numbers have no single confirmed field name anywhere in `users` docs (`functions/src/athlete-tournament-access.ts:66` checks 5 different legacy field names), so a reliable phone search isn't a small addition.
- **`/convocacao/:coachUid/:callUpId` needs two route segments**, not one like the spec's `/convocacao/:callUpId` (Task 12) — `callUps` lives under `coaches/{coachUid}/callUps/{callUpId}`, not top-level like `coachAthleteInvites`, so the athlete's client needs `coachUid` to even address the document.
- **Call-up creation is Cloud-Function-only**, not client-side CRUD like the spec's "squads, athletes-link, trainings, evaluations, call-ups" grouping implied (Task 12) — sending a call-up fans out `deliverNotificationToUser` to every recipient, and that's an Admin-SDK-only function the client can't call directly. Reading a coach's own call-ups is still direct client `onSnapshot`, same as everything else.
- **Squads drop the "treinador auxiliar" field** from the prototype's Nova equipe form (Task 7) — with Permissões (multi-member comissão técnica) out of scope, there's no second coach account to assign as assistant; the field would just be inert free text with nothing to link to.
- **Trainings drop the standalone `durationMin` field** (Task 11) — fully derivable from `startTime`/`endTime`, so storing it too would just be redundant data that can drift.
- **Call-ups drop the `eventRef`/`trainingId` link to a specific Treino** (Task 12) — the coach types the event details as free text (`title`/`message`) instead of picking a real scheduled training. Real, working gap, not a blocker: a call-up still reaches the right recipients and collects responses; it's just not cross-referenced with the Treinos module the way the prototype implies. Worth a follow-up task if it turns out to matter in practice.
- **Cloud Function tests extract pure helpers**, not the spec's "arrange com Admin SDK emulado" (every task with a CF, e.g. Tasks 3, 8, 12, 16) — verified the actual codebase convention has zero emulator-based tests anywhere (`grep -rl "firebase-functions-test|initializeTestEnvironment" functions/src` returns nothing; all 55 existing `.test.ts` files are plain `node:test` over pure functions extracted from the `onCall` handlers). Matching that convention beats introducing a new, heavier one this plan would be the only user of.

None of these change what a coach or athlete can actually do end to end — they're all "how", not "what."
