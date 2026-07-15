# Portal do Organizador (auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a new Angular project `organizer` in `frontend/` and give it a complete, working auth flow (login, cadastro, esqueci/redefinir senha) that mirrors the `coach` project exactly, including the new backend Cloud Function `completeOrganizerSignup` needed for cadastro to work end-to-end.

**Architecture:** Copy-adapt `frontend/projects/coach/src/app/auth/**` verbatim into `frontend/projects/organizer/src/app/auth/**`, renaming `coach`→`organizer`, `co-`→`og-`, and role-gating via the **existing** `"organizer"` entry in `ALLOWED_APP_ROLES` (no new role string — confirmed no collision with `callerIsOrganizer()`, which despite its name checks the `admin` claim, not the `organizer` role). Bootstrap (`app.config.ts`/`app.ts`/`main.ts`), workspace config (`angular.json`/`package.json`/`tsconfig.json`) and the design-system stylesheet (`styles.scss`) are copied the same way. A minimal guarded `/painel` placeholder proves the flow end-to-end; real panel content is future work.

**Tech Stack:** Angular 20.3 (standalone, zoneless, signals), Firebase JS SDK 12 (`firebase/auth`, `firebase/functions`), Reactive Forms, Firebase Cloud Functions v2 (`onCall`) + Admin SDK, `node:test` for backend unit tests.

## Global Constraints

- Standalone components always; never set `standalone: true` explicitly (default). — from `frontend/.claude/CLAUDE.md`
- `ChangeDetectionStrategy.OnPush` on every `@Component`. — from `frontend/.claude/CLAUDE.md`
- Use `input()`/`output()` functions, not decorators; `inject()`, not constructor injection. — from `frontend/.claude/CLAUDE.md`
- Native control flow (`@if`/`@for`/`@switch`), never `*ngIf`/`*ngFor`. — from `frontend/.claude/CLAUDE.md`
- No `ngClass`/`ngStyle` — use `class`/`style` bindings. — from `frontend/.claude/CLAUDE.md`
- Reactive Forms (`NonNullableFormBuilder`), not template-driven. — from `frontend/.claude/CLAUDE.md`
- Role gate is **claims-based** (`roles` array on the ID token), not a Firestore-doc allowlist — approved in the spec (Abordagem A).
- Cadastro collects **nome + telefone** only (no CNPJ/cidade) — approved in the spec.
- **No new tests for the frontend auth module** — matches `arena`/`coach`, neither has any. The one exception is the backend `functions/src/organizer-signup.ts`, which follows the *existing* test convention for signup functions (`coach-signup.test.ts`/`arena-signup.test.ts` both exist).
- **No Firestore rules/data-model changes** — the `organizer` role and its rules already exist (`hasRoleClaim('organizer')` in `firestore.rules`); `completeOrganizerSignup` only sets the claim and mirrors `users/{uid}`, it does **not** create an `organizers/{uid}` profile doc (deliberately narrower than `coach-signup.ts`, matching `arena-signup.ts`'s simpler shape — no new collection needed for auth alone).
- **No Firebase Hosting provisioning in this plan** — deploying `completeOrganizerSignup` to the `dev` Cloud Functions project is in scope (needed for the signup flow to work at all against the shared dev Firebase project, same as every sibling portal); creating a Hosting site/target is not.
- Spec: `docs/superpowers/specs/2026-07-15-organizer-portal-auth-design.md`.

---

## Task 1: Scaffold the `organizer` Angular project (config + bootstrap)

**Files:**
- Modify: `frontend/angular.json:361-362`
- Modify: `frontend/package.json` (scripts block)
- Modify: `frontend/tsconfig.json` (references array)
- Create: `frontend/projects/organizer/tsconfig.app.json`
- Create: `frontend/projects/organizer/tsconfig.spec.json`
- Create: `frontend/projects/organizer/public/favicon.ico` (binary copy, see Step 8)
- Create: `frontend/projects/organizer/src/index.html`
- Create: `frontend/projects/organizer/src/main.ts`
- Create: `frontend/projects/organizer/src/styles.scss`
- Create: `frontend/projects/organizer/src/environments/environment.ts`
- Create: `frontend/projects/organizer/src/environments/environment.prod.ts`
- Create: `frontend/projects/organizer/src/app/app.ts`
- Create: `frontend/projects/organizer/src/app/app.config.ts`
- Create: `frontend/projects/organizer/src/app/app.routes.ts` (temporary — replaced whole in Task 4)

**Interfaces:**
- Produces: Angular CLI project target `organizer` (buildable via `ng build organizer`, servable via `ng serve organizer`); `environment.firebase` (`FirebaseOptions`, from `@nexago/firebase-config`) importable by later tasks' `auth.service.ts`.

- [ ] **Step 1: Add the `organizer` project block to `frontend/angular.json`**

Find this exact text (end of the `"coach"` project block):

```json
      }
    }
  },
  "cli": {
```

Replace it with:

```json
      }
    },
    "organizer": {
      "projectType": "application",
      "schematics": {
        "@schematics/angular:component": {
          "style": "scss"
        }
      },
      "root": "projects/organizer",
      "sourceRoot": "projects/organizer/src",
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@angular/build:application",
          "options": {
            "outputPath": "../dist/organizer",
            "browser": "projects/organizer/src/main.ts",
            "tsConfig": "projects/organizer/tsconfig.app.json",
            "inlineStyleLanguage": "scss",
            "assets": [
              {
                "glob": "**/*",
                "input": "projects/organizer/public"
              }
            ],
            "styles": [
              "projects/organizer/src/styles.scss"
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
                  "replace": "projects/organizer/src/environments/environment.ts",
                  "with": "projects/organizer/src/environments/environment.prod.ts"
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
              "buildTarget": "organizer:build:production"
            },
            "development": {
              "buildTarget": "organizer:build:development"
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
            "tsConfig": "projects/organizer/tsconfig.spec.json",
            "inlineStyleLanguage": "scss",
            "assets": [
              {
                "glob": "**/*",
                "input": "projects/organizer/public"
              }
            ],
            "styles": [
              "projects/organizer/src/styles.scss"
            ]
          }
        }
      }
    }
  },
  "cli": {
```

- [ ] **Step 2: Add npm scripts to `frontend/package.json`**

Find:

```json
    "start:coach": "ng serve coach",
    "build:coach": "ng build coach --configuration production",
    "start:vegeton": "npx --yes serve projects/vegeton -l 4321",
```

Replace with:

```json
    "start:coach": "ng serve coach",
    "build:coach": "ng build coach --configuration production",
    "start:organizer": "ng serve organizer",
    "build:organizer": "ng build organizer --configuration production",
    "start:vegeton": "npx --yes serve projects/vegeton -l 4321",
```

Then find:

```json
    "build:all": "ng run backoffice:build:production && npm --prefix projects/site run build && ng run arena:build:production && ng run coach:build:production && npm run build:vegeton",
```

Replace with:

```json
    "build:all": "ng run backoffice:build:production && npm --prefix projects/site run build && ng run arena:build:production && ng run coach:build:production && ng run organizer:build:production && npm run build:vegeton",
```

- [ ] **Step 3: Add `organizer` to `frontend/tsconfig.json` references**

Find:

```json
    {
      "path": "./projects/coach/tsconfig.app.json"
    },
    {
      "path": "./projects/coach/tsconfig.spec.json"
    }
  ]
```

Replace with:

```json
    {
      "path": "./projects/coach/tsconfig.app.json"
    },
    {
      "path": "./projects/coach/tsconfig.spec.json"
    },
    {
      "path": "./projects/organizer/tsconfig.app.json"
    },
    {
      "path": "./projects/organizer/tsconfig.spec.json"
    }
  ]
```

- [ ] **Step 4: Create `frontend/projects/organizer/tsconfig.app.json`**

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

- [ ] **Step 5: Create `frontend/projects/organizer/tsconfig.spec.json`**

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

- [ ] **Step 6: Create `frontend/projects/organizer/src/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>NexaGO — Organizador</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/x-icon" href="favicon.ico">
</head>
<body>
  <app-root></app-root>
</body>
</html>
```

- [ ] **Step 7: Create `frontend/projects/organizer/src/main.ts`**

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
```

- [ ] **Step 8: Copy the favicon**

```bash
mkdir -p frontend/projects/organizer/public
cp frontend/projects/coach/public/favicon.ico frontend/projects/organizer/public/favicon.ico
```

- [ ] **Step 9: Create `frontend/projects/organizer/src/styles.scss`**

Byte-for-byte copy of `frontend/projects/coach/src/styles.scss`, renaming the `co-` class prefix to `og-` (and `co-spin`→`og-spin`) and updating the header comment. Full content:

```scss
/* NexaGO Organizador — estilos globais.
   Tokens vindos do design system NexaGO (tokens.css do protótipo), namespace --nx-.
   Classes de fluxo de auth/painel compartilhadas usam o prefixo og- (paralelo ao ar-/bo-/co-). */
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

.og-form-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 0 32px;
}

.og-kicker {
  font-family: var(--nx-font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--nx-orange-500);
}

.og-form-header h1 {
  font-family: var(--nx-font-display);
  font-weight: 800;
  font-size: 30px;
  line-height: 1.08;
  letter-spacing: -0.025em;
  color: var(--nx-text);
  margin: 0;
}

.og-form-header p {
  font-size: 14px;
  line-height: 1.55;
  color: var(--nx-text-mute);
  margin: 0;
}

.og-form-header strong {
  color: var(--nx-text);
  font-weight: 600;
}

.og-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.og-stack-sm {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.og-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.og-row-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 14px 0 22px;
}

.og-remember {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--nx-text-mute);
}

.og-checkbox-input {
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

.og-checkbox-box {
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

.og-checkbox-input:checked + .og-checkbox-box {
  border-color: var(--nx-orange-500);
  background: var(--nx-orange-500);
}

.og-checkbox-input:focus-visible + .og-checkbox-box {
  outline: 2px solid var(--nx-orange-500);
  outline-offset: 2px;
}

.og-btn-primary {
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

.og-btn-primary:hover:not(:disabled) {
  background: var(--nx-orange-400);
}

.og-btn-primary:active:not(:disabled) {
  transform: scale(0.99);
}

.og-btn-primary:disabled {
  opacity: 0.55;
  cursor: default;
}

.og-text-link {
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

.og-text-link:hover {
  text-decoration: underline;
}

.og-text-link:disabled {
  color: var(--nx-text-dim);
  cursor: default;
  text-decoration: none;
}

.og-back-link {
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

.og-back-link:hover {
  color: var(--nx-text);
}

.og-fine {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--nx-text-dim);
  text-align: center;
  margin: 24px 0 0;
}

.og-fine strong {
  color: var(--nx-text-mute);
  font-weight: 600;
}

.og-alert {
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

.og-alert svg {
  flex: none;
  margin-top: 1px;
}

.og-icon-badge {
  width: 72px;
  height: 72px;
  border-radius: var(--nx-r-4);
  background: var(--nx-orange-tint);
  border: 1px solid rgba(255, 106, 26, 0.3);
  display: grid;
  place-items: center;
  margin: 0 auto 28px;
}

.og-center {
  text-align: center;
}

.og-resend-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin-top: 24px;
  font-size: 13.5px;
  color: var(--nx-text-mute);
}

.og-resend-row .og-timer {
  font-family: var(--nx-font-mono);
  font-size: 11px;
  color: var(--nx-text-dim);
  margin-left: 2px;
}

.og-spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(10, 10, 10, 0.25);
  border-top-color: #0A0A0A;
  animation: og-spin 0.7s linear infinite;
}

@keyframes og-spin {
  to {
    transform: rotate(1turn);
  }
}

/* ── Painel: botões e controles compartilhados ─────────────── */

.og-mini-btn {
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

.og-mini-btn:hover:not(:disabled) {
  background: var(--nx-surface-2);
}

.og-mini-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.og-mini-btn-primary {
  background: var(--nx-orange-500);
  color: var(--nx-text-on-orange);
  border: none;
  box-shadow: 0 6px 20px rgba(255, 106, 26, 0.2);
}

.og-mini-btn-primary:hover:not(:disabled) {
  background: var(--nx-orange-400);
}

.og-ghost-btn {
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

.og-ghost-btn:hover {
  color: var(--nx-text);
}

.og-search-box {
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

.og-search-box span {
  flex: 1;
  font-size: 13px;
}

.og-bell-btn {
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

.og-bell-btn .dot {
  position: absolute;
  top: 8px;
  right: 9px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--nx-orange-500);
  box-shadow: 0 0 0 2px var(--nx-bg);
}

.og-chart-tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--nx-surface-1);
  border: 1px solid var(--nx-line);
  border-radius: var(--nx-r-2);
}

.og-chart-tabs button {
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

.og-chart-tabs button.active {
  background: var(--nx-surface-2);
  color: var(--nx-text);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
}

.og-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.og-chip {
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

.og-chip:hover {
  background: var(--nx-surface-1);
  color: var(--nx-text);
}

.og-chip.active {
  background: var(--nx-orange-500);
  border-color: var(--nx-orange-500);
  color: var(--nx-text-on-orange);
}

.og-shortcut {
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

.og-shortcut span {
  color: var(--nx-text);
}
```

- [ ] **Step 10: Create `frontend/projects/organizer/src/environments/environment.ts`**

```typescript
import { firebaseConfig } from '@nexago/firebase-config';

export const environment = {
  production: false,
  firebase: firebaseConfig,
};
```

- [ ] **Step 11: Create `frontend/projects/organizer/src/environments/environment.prod.ts`**

```typescript
import { firebaseConfig } from '@nexago/firebase-config';

export const environment = {
  production: true,
  firebase: firebaseConfig,
};
```

- [ ] **Step 12: Create `frontend/projects/organizer/src/app/app.ts`**

```typescript
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

- [ ] **Step 13: Create `frontend/projects/organizer/src/app/app.config.ts`**

```typescript
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

- [ ] **Step 14: Create a temporary `frontend/projects/organizer/src/app/app.routes.ts`**

This is a placeholder — Task 4 replaces it wholesale once the auth components exist. Its only job right now is to make `app.config.ts` compile.

```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'entrar' },
  { path: '**', redirectTo: '' },
];
```

- [ ] **Step 15: Verify the scaffold builds**

Run: `cd frontend && npx ng build organizer --configuration development`
Expected: `Application bundle generation complete.` with no errors. (Navigating `/` at this stage would redirect-loop since `entrar` doesn't exist yet — that's expected and fixed in Task 4, not a bug to chase now.)

- [ ] **Step 16: Commit**

```bash
git add frontend/angular.json frontend/package.json frontend/tsconfig.json frontend/projects/organizer
git commit -m "feat(organizer): scaffold Angular project (config + bootstrap)"
```

---

## Task 2: Auth service and guards

**Files:**
- Create: `frontend/projects/organizer/src/app/auth/auth.guard.ts`
- Create: `frontend/projects/organizer/src/app/auth/organizer.guard.ts`
- Create: `frontend/projects/organizer/src/app/auth/firebase-auth-errors.ts`
- Create: `frontend/projects/organizer/src/app/auth/auth.service.ts`

**Interfaces:**
- Consumes: `environment.firebase` (`FirebaseOptions`) from Task 1's `../../environments/environment`.
- Produces: `AuthService` (injectable, `providedIn: 'root'`) with `authReady: Signal<boolean>`, `isAuthenticated: Signal<boolean>`, `isOrganizer: Signal<boolean>`, `displayName: Signal<string | null>`, `signInWithEmail(email, password, remember): Promise<void>`, `sendPasswordReset(email): Promise<void>`, `verifyResetCode(code): Promise<string>`, `confirmReset(code, newPassword): Promise<void>`, `createOrganizerAccount(email, password, displayName, phone): Promise<void>`, `updateDisplayName(name): Promise<void>`, `signOutUser(): Promise<void>`. `authGuard`/`organizerGuard` (both `CanActivateFn`). `mapFirebaseAuthError(error): string`. All consumed by Task 3's components and Task 4's routes.

- [ ] **Step 1: Create `frontend/projects/organizer/src/app/auth/auth.guard.ts`** (verbatim copy — generic, no renaming needed)

```typescript
import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return toObservable(auth.authReady).pipe(
    filter((ready) => ready),
    take(1),
    map(() => {
      if (auth.isAuthenticated()) {
        return true;
      }
      return router.createUrlTree(['/entrar'], {
        queryParams: { redirect: state.url },
      });
    }),
  );
};
```

- [ ] **Step 2: Create `frontend/projects/organizer/src/app/auth/organizer.guard.ts`** (adapted from `coach.guard.ts`)

```typescript
import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from './auth.service';

/**
 * Bloqueia /painel pra quem está autenticado mas não tem a claim `organizer`
 * (ex.: atleta que nunca completou o autocadastro de organizador). Assume
 * `authGuard` já rodou antes na mesma rota — não checa `isAuthenticated`.
 */
export const organizerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return toObservable(auth.authReady).pipe(
    filter((ready) => ready),
    take(1),
    map(() => {
      if (auth.isOrganizer()) {
        return true;
      }
      return router.createUrlTree(['/entrar']);
    }),
  );
};
```

- [ ] **Step 3: Create `frontend/projects/organizer/src/app/auth/firebase-auth-errors.ts`** (verbatim copy — generic, no renaming needed)

```typescript
/** Mensagens amigáveis para códigos comuns do Firebase Auth. */
export function mapFirebaseAuthError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: string }).code)
      : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'E-mail inválido.';
    case 'auth/user-disabled':
      return 'Esta conta foi desativada.';
    case 'auth/user-not-found':
      return 'Não encontramos uma conta com este e-mail.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-mail ou senha incorretos. Verifique e tente de novo.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Tente de novo em alguns minutos.';
    case 'auth/network-request-failed':
      return 'Sem conexão. Verifique a internet.';
    case 'auth/email-already-in-use':
      return 'Já existe uma conta com este e-mail. Tente entrar.';
    case 'auth/weak-password':
      return 'Senha fraca. Use no mínimo 8 caracteres, com maiúscula e número.';
    case 'auth/expired-action-code':
      return 'Este link expirou. Peça um novo link de redefinição.';
    case 'auth/invalid-action-code':
      return 'Link inválido ou já usado. Peça um novo link de redefinição.';
    case 'auth/operation-not-allowed':
      return 'Este método de login não está habilitado no projeto.';
    default:
      if (code.startsWith('auth/')) {
        return 'Não foi possível concluir. Tente novamente.';
      }
      return error instanceof Error ? error.message : 'Erro inesperado.';
  }
}
```

- [ ] **Step 4: Create `frontend/projects/organizer/src/app/auth/auth.service.ts`** (adapted from `coach`'s `auth.service.ts`: `isCoach`→`isOrganizer`, `createCoachAccount`→`createOrganizerAccount` calling `completeOrganizerSignup`)

```typescript
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
  readonly isOrganizer = computed(() => this.roleClaims().includes('organizer'));
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

  /** Cria a conta do organizador (Firebase Auth) e completa o autocadastro via
   *  Cloud Function, que define a claim `organizer` — o client nunca escreve
   *  claims diretamente. Força o refresh do ID token pra `isOrganizer()` já
   *  refletir a claim nova sem precisar relogar. */
  async createOrganizerAccount(email: string, password: string, displayName: string, phone: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    await updateProfile(credential.user, { displayName: displayName.trim() });

    const complete = httpsCallable(this.functions, 'completeOrganizerSignup');
    await complete({ displayName: displayName.trim(), phone: phone.trim() });

    const refreshed = await credential.user.getIdTokenResult(true);
    const roles = refreshed.claims['roles'];
    this.roleClaims.set(Array.isArray(roles) ? roles.map(String) : []);
  }

  /** Mantém o displayName do Firebase Auth em sincronia com o editado no Perfil (tela futura). */
  async updateDisplayName(name: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Usuário não autenticado.');
    }
    await updateProfile(user, { displayName: name.trim() });
    this.displayNameOverride.set(name.trim());
  }

  async signOutUser(): Promise<void> {
    await signOut(this.auth);
  }
}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd frontend && npx ng build organizer --configuration development`
Expected: `Application bundle generation complete.` with no errors (guards/service aren't wired into routes yet, but must type-check standalone).

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/organizer/src/app/auth/auth.guard.ts frontend/projects/organizer/src/app/auth/organizer.guard.ts frontend/projects/organizer/src/app/auth/firebase-auth-errors.ts frontend/projects/organizer/src/app/auth/auth.service.ts
git commit -m "feat(organizer): auth service and route guards"
```

---

## Task 3: Auth UI components

**Files:**
- Create: `frontend/projects/organizer/src/app/auth/ui/auth-shell.component.ts`
- Create: `frontend/projects/organizer/src/app/auth/ui/field.component.ts`
- Create: `frontend/projects/organizer/src/app/auth/ui/strength-meter.component.ts`
- Create: `frontend/projects/organizer/src/app/auth/login.component.ts`
- Create: `frontend/projects/organizer/src/app/auth/signup.component.ts`
- Create: `frontend/projects/organizer/src/app/auth/forgot-password.component.ts`
- Create: `frontend/projects/organizer/src/app/auth/reset-password.component.ts`
- Create: `frontend/projects/organizer/src/app/auth/email-sent.component.ts`

**Interfaces:**
- Consumes: `AuthService`, `mapFirebaseAuthError` from Task 2.
- Produces: `LoginComponent`, `SignupComponent`, `ForgotPasswordComponent`, `ResetPasswordComponent`, `EmailSentComponent` (all standalone, default-exported class per file) — consumed by Task 4's `app.routes.ts` via `loadComponent`.

- [ ] **Step 1: Create `frontend/projects/organizer/src/app/auth/ui/auth-shell.component.ts`** (adapted from `coach`'s — brand copy changed to organizer/torneios context)

```typescript
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Shell do fluxo de auth do organizador: split com painel de marca à esquerda
 * e formulário centralizado à direita. Reaproveita a mesma linguagem visual
 * dos outros portais (og-auth-shell). Abaixo de 980px o painel some e a marca
 * aparece compacta acima do card.
 */
@Component({
  selector: 'og-auth-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <aside class="brand">
        <div class="glow"></div>
        <svg class="court" width="520" height="520" viewBox="0 0 520 520" fill="none" aria-hidden="true">
          <circle cx="260" cy="260" r="200" stroke="#FF6A1A" stroke-width="1.5" />
          <circle cx="260" cy="260" r="140" stroke="#FF6A1A" stroke-width="1.5" />
          <line x1="0" y1="260" x2="520" y2="260" stroke="#FF6A1A" stroke-width="1.5" />
        </svg>

        <div class="brand-row">
          <ng-container *ngTemplateOutlet="mark" />
          <div class="wordmark">
            <div class="name">nexa<span>GO</span></div>
            <div class="tag">Painel do organizador</div>
          </div>
        </div>

        <div class="spacer"></div>

        <div class="message">
          <div class="kicker">Gestão de torneios e ligas</div>
          <h2>Seus torneios,<br />sob controle total.</h2>
          <p>Inscrições, chaves, categorias e resultados — tudo que roda o seu torneio, num painel só.</p>
        </div>

        <div class="foot">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Acesso exclusivo de organizadores NexaGO
        </div>
      </aside>

      <main class="stage">
        <div class="stage-glow"></div>
        <div class="card" [class.wide]="wide()">
          <div class="compact-brand">
            <ng-container *ngTemplateOutlet="mark" />
            <div class="wordmark">
              <div class="name">nexa<span>GO</span></div>
              <div class="tag">Painel do organizador</div>
            </div>
          </div>
          <ng-content />
        </div>
      </main>
    </div>

    <ng-template #mark>
      <div class="mark" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M5 4 L5 20 M19 4 L19 20 M5 4 L19 20" stroke="#0A0A0A" stroke-width="3.4" stroke-linecap="square" stroke-linejoin="miter" />
        </svg>
        <div class="shine"></div>
      </div>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
    }

    .shell {
      min-height: 100dvh;
      display: grid;
      grid-template-columns: minmax(420px, 560px) 1fr;
      background: var(--nx-bg);
    }

    .brand {
      position: relative;
      overflow: hidden;
      background: #050505;
      border-right: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      padding: 56px 64px;
    }

    .glow {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(90% 70% at 0% 100%, rgba(255, 106, 26, 0.2) 0%, transparent 60%),
        radial-gradient(60% 40% at 100% 0%, rgba(255, 106, 26, 0.06) 0%, transparent 60%);
    }

    .court {
      position: absolute;
      right: -80px;
      bottom: -80px;
      opacity: 0.1;
    }

    .brand-row,
    .compact-brand {
      display: flex;
      align-items: center;
      gap: 16px;
      position: relative;
    }

    .mark {
      width: 44px;
      height: 44px;
      border-radius: 11px;
      background: var(--nx-orange-500);
      display: grid;
      place-items: center;
      position: relative;
      overflow: hidden;
      box-shadow: 0 0 0 1px rgba(255, 106, 26, 0.3), 0 12px 32px rgba(255, 106, 26, 0.22);
      flex: none;
    }

    .mark .shine {
      position: absolute;
      inset: 0;
      background: linear-gradient(140deg, rgba(255, 255, 255, 0.3) 0%, transparent 40%);
      pointer-events: none;
    }

    .wordmark {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .wordmark .name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .wordmark .name span {
      color: var(--nx-orange-500);
    }

    .wordmark .tag {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .spacer {
      flex: 1;
    }

    .message {
      position: relative;
      max-width: 440px;
    }

    .message .kicker {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
      margin-bottom: 16px;
    }

    .message h2 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: clamp(32px, 3.2vw, 44px);
      line-height: 1.04;
      letter-spacing: -0.03em;
      color: var(--nx-text);
      margin: 0;
    }

    .message p {
      font-size: 15px;
      line-height: 1.6;
      color: var(--nx-text-mute);
      margin: 16px 0 0;
      max-width: 380px;
    }

    .foot {
      position: relative;
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .stage {
      position: relative;
      display: grid;
      place-items: center;
      padding: 48px 24px;
    }

    .stage-glow {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: radial-gradient(50% 30% at 50% 0%, rgba(255, 106, 26, 0.06) 0%, transparent 60%);
    }

    .card {
      width: min(400px, 100%);
      position: relative;
    }

    .card.wide {
      width: min(460px, 100%);
    }

    .compact-brand {
      display: none;
      justify-content: center;
      margin-bottom: 40px;
    }

    @media (max-width: 980px) {
      .shell {
        grid-template-columns: 1fr;
      }

      .brand {
        display: none;
      }

      .compact-brand {
        display: flex;
      }
    }
  `,
  imports: [NgTemplateOutlet],
})
export class AuthShellComponent {
  /** Card mais largo (460px), usado em cadastros com 2 colunas de campos. */
  readonly wide = input(false);
}
```

- [ ] **Step 2: Create `frontend/projects/organizer/src/app/auth/ui/field.component.ts`** (adapted — selector/prefix only)

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextFieldId = 0;

/**
 * Campo de texto do fluxo de auth (protótipo CoField/BoField). Integra com
 * Reactive Forms via ControlValueAccessor; senha ganha o toggle mostrar/ocultar.
 */
@Component({
  selector: 'og-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FieldComponent), multi: true },
  ],
  template: `
    <div class="field">
      <label
        [for]="fieldId"
        [class.focused]="focused()"
      >{{ label() }}</label>

      <div
        class="box"
        [class.focused]="focused()"
        [class.error]="error() != null"
        [class.disabled]="disabled()"
      >
        <input
          [id]="fieldId"
          [type]="inputType()"
          [value]="value()"
          [placeholder]="placeholder()"
          [attr.autocomplete]="autocomplete() || null"
          [attr.aria-invalid]="error() != null"
          [attr.aria-describedby]="error() != null ? fieldId + '-error' : null"
          [disabled]="disabled()"
          (input)="handleInput($event)"
          (focus)="focused.set(true)"
          (blur)="handleBlur()"
        />
        @if (type() === 'password') {
          <button
            type="button"
            class="eye"
            [attr.aria-label]="shown() ? 'Ocultar senha' : 'Mostrar senha'"
            (click)="shown.set(!shown())"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
              @if (shown()) {
                <line x1="3" y1="3" x2="21" y2="21" />
              }
            </svg>
          </button>
        }
      </div>

      @if (error(); as err) {
        <div class="error-line" [id]="fieldId + '-error'" role="alert">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          {{ err }}
        </div>
      } @else if (hint()) {
        <div class="hint-line">{{ hint() }}</div>
      }
    </div>
  `,
  styles: `
    .field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    label {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: var(--nx-text-mute);
      transition: color 140ms var(--nx-ease-out);
    }

    label.focused {
      color: var(--nx-orange-500);
    }

    .box {
      height: 50px;
      padding: 0 14px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 160ms var(--nx-ease-out);
      cursor: text;
    }

    .box.focused {
      background: var(--nx-surface-1);
      border-color: var(--nx-orange-500);
      box-shadow: 0 0 0 4px rgba(255, 106, 26, 0.1);
    }

    .box.error {
      border-color: var(--nx-live);
      box-shadow: none;
    }

    .box.disabled {
      opacity: 0.6;
      cursor: default;
    }

    input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-family: var(--nx-font-ui);
      font-size: 15px;
      font-weight: 500;
      color: var(--nx-text);
      letter-spacing: -0.005em;
      caret-color: var(--nx-orange-500);
      min-width: 0;
    }

    .eye {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--nx-text-mute);
      padding: 6px;
      display: grid;
      place-items: center;
      border-radius: 8px;
    }

    .eye:hover {
      color: var(--nx-text);
    }

    .error-line {
      font-size: 12px;
      color: var(--nx-live);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .error-line svg {
      flex: none;
    }

    .hint-line {
      font-size: 12px;
      color: var(--nx-text-dim);
    }
  `,
})
export class FieldComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly type = input<'text' | 'email' | 'password' | 'tel'>('text');
  readonly placeholder = input('');
  readonly autocomplete = input('');
  readonly hint = input('');
  readonly error = input<string | null>(null);

  protected readonly fieldId = `og-field-${nextFieldId++}`;
  protected readonly value = signal('');
  protected readonly focused = signal(false);
  protected readonly shown = signal(false);
  protected readonly disabled = signal(false);

  protected readonly inputType = computed(() =>
    this.type() === 'password' && this.shown() ? 'text' : this.type(),
  );

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

  protected handleInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
    this.value.set(next);
    this.onChange(next);
  }

  protected handleBlur(): void {
    this.focused.set(false);
    this.onTouched();
  }
}
```

- [ ] **Step 3: Create `frontend/projects/organizer/src/app/auth/ui/strength-meter.component.ts`** (adapted — selector only)

```typescript
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const LABELS = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];
const COLORS = [
  'var(--nx-line)',
  'var(--nx-live)',
  'var(--nx-pending)',
  'var(--nx-pending)',
  'var(--nx-win)',
];

/** Medidor de força de senha (protótipo CoStrengthMeter/BoStrengthMeter). */
@Component({
  selector: 'og-strength-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="meter">
      <div class="bars" aria-hidden="true">
        @for (bar of [1, 2, 3, 4]; track bar) {
          <div class="bar" [style.background]="bar <= score() ? COLORS[score()] : 'var(--nx-line)'"></div>
        }
      </div>
      <div class="label" [style.color]="score() === 0 ? 'var(--nx-text-dim)' : COLORS[score()]" aria-live="polite">
        {{ password() ? LABELS[score()] : 'Mín. 8 caracteres, 1 maiúscula, 1 número' }}
      </div>
    </div>
  `,
  styles: `
    .meter {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bars {
      display: flex;
      gap: 6px;
    }

    .bar {
      flex: 1;
      height: 4px;
      border-radius: 2px;
      transition: background 200ms var(--nx-ease-out);
    }

    .label {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      min-height: 12px;
    }
  `,
})
export class StrengthMeterComponent {
  readonly password = input('');

  protected readonly LABELS = LABELS;
  protected readonly COLORS = COLORS;

  protected readonly score = computed(() => {
    const pw = this.password();
    return [pw.length >= 8, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(
      Boolean,
    ).length;
  });
}
```

- [ ] **Step 4: Create `frontend/projects/organizer/src/app/auth/login.component.ts`** (adapted — selector, copy)

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';

@Component({
  selector: 'og-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent],
  template: `
    <og-auth-shell>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <header class="og-form-header">
          <span class="og-kicker">Entrar</span>
          <h1>Acesse seu painel.</h1>
          <p>Entre com a conta do organizador pra gerenciar torneios e ligas.</p>
        </header>

        @if (error(); as err) {
          <div class="og-alert" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {{ err }}
          </div>
        }

        <div class="og-stack">
          <og-field
            label="E-mail"
            type="email"
            placeholder="voce@email.com"
            autocomplete="email"
            formControlName="email"
            [error]="emailError()"
          />
          <og-field
            label="Senha"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            formControlName="password"
            [error]="passwordError()"
          />
        </div>

        <div class="og-row-between">
          <label class="og-remember">
            <input
              type="checkbox"
              class="og-checkbox-input"
              formControlName="remember"
            />
            <span class="og-checkbox-box" aria-hidden="true">
              @if (rememberValue()) {
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              }
            </span>
            Manter conectado
          </label>
          <a class="og-text-link" routerLink="/entrar/recuperar">Esqueceu a senha?</a>
        </div>

        <button class="og-btn-primary" type="submit" [disabled]="loading()">
          @if (loading()) {
            <span class="og-spinner" aria-hidden="true"></span>
            Entrando…
          } @else {
            Entrar no painel
          }
        </button>

        <p class="og-fine">
          Ainda não tem conta? <a class="og-text-link" routerLink="/cadastro">Cadastrar como organizador</a>
        </p>
      </form>
    </og-auth-shell>
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

- [ ] **Step 5: Create `frontend/projects/organizer/src/app/auth/signup.component.ts`** (adapted — selector, copy, calls `createOrganizerAccount`)

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';
import { StrengthMeterComponent } from './ui/strength-meter.component';

/** Autocadastro do organizador — cria a conta e completa o papel `organizer` via
 *  Cloud Function. Sem etapa de verificação: o painel fica disponível assim
 *  que a conta é criada (diferente do fluxo de arena, que passa por revisão). */
@Component({
  selector: 'og-signup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent, StrengthMeterComponent],
  template: `
    <og-auth-shell [wide]="true">
      <form [formGroup]="form" (ngSubmit)="submit()">
        <a class="og-back-link" routerLink="/entrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Voltar pro login
        </a>

        <header class="og-form-header">
          <span class="og-kicker">Cadastrar organizador</span>
          <h1>Leve seus torneios pro NexaGO.</h1>
          <p>Alguns dados básicos pra criar seu painel. Você cria torneios e ligas depois.</p>
        </header>

        @if (error(); as err) {
          <div class="og-alert" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {{ err }}
          </div>
        }

        <div class="og-stack">
          <og-field
            label="Nome completo"
            placeholder="Carla Mendes"
            autocomplete="name"
            formControlName="nome"
            [error]="fieldError('nome', 'Informe seu nome completo.')"
          />

          <div class="og-grid-2">
            <og-field
              label="Telefone"
              type="tel"
              placeholder="(62) 99999-0000"
              autocomplete="tel"
              formControlName="telefone"
              [error]="fieldError('telefone', 'Informe seu telefone.')"
            />
            <og-field
              label="E-mail"
              type="email"
              placeholder="voce@email.com"
              autocomplete="email"
              formControlName="email"
              [error]="emailError()"
            />
          </div>

          <div class="og-stack-sm">
            <og-field
              label="Senha"
              type="password"
              placeholder="••••••••"
              autocomplete="new-password"
              formControlName="password"
              [error]="passwordError()"
            />
            <og-strength-meter [password]="passwordValue()" />
          </div>
        </div>

        <div style="margin-top: 24px;">
          <button class="og-btn-primary" type="submit" [disabled]="loading()">
            @if (loading()) {
              <span class="og-spinner" aria-hidden="true"></span>
              Criando conta…
            } @else {
              Criar painel do organizador
            }
          </button>
        </div>
      </form>
    </og-auth-shell>
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
      await this.auth.createOrganizerAccount(email, password, nome, telefone);
      void this.router.navigateByUrl('/painel');
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 6: Create `frontend/projects/organizer/src/app/auth/forgot-password.component.ts`** (adapted — selector, copy)

```typescript
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';

@Component({
  selector: 'og-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent],
  template: `
    <og-auth-shell>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <a class="og-back-link" routerLink="/entrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Voltar pro login
        </a>

        <header class="og-form-header">
          <span class="og-kicker">Recuperar acesso</span>
          <h1>Esqueceu a senha?</h1>
          <p>Informa o e-mail cadastrado do organizador e a gente manda um link de redefinição.</p>
        </header>

        @if (error(); as err) {
          <div class="og-alert" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {{ err }}
          </div>
        }

        <og-field
          label="E-mail do organizador"
          type="email"
          placeholder="voce@email.com"
          autocomplete="email"
          formControlName="email"
          [error]="emailError()"
        />

        <div style="margin-top: 24px;">
          <button class="og-btn-primary" type="submit" [disabled]="loading()">
            @if (loading()) {
              <span class="og-spinner" aria-hidden="true"></span>
              Enviando…
            } @else {
              Enviar link de redefinição
            }
          </button>
        </div>

        <p class="og-fine">O link expira em 1 hora e só funciona uma vez.</p>
      </form>
    </og-auth-shell>
  `,
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
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

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) {
      return;
    }
    this.loading.set(true);
    try {
      const { email } = this.form.getRawValue();
      await this.auth.sendPasswordReset(email);
      void this.router.navigate(['/entrar/enviado'], { state: { email } });
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 7: Create `frontend/projects/organizer/src/app/auth/reset-password.component.ts`** (adapted — selector, copy)

```typescript
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';
import { FieldComponent } from './ui/field.component';
import { StrengthMeterComponent } from './ui/strength-meter.component';

type ResetState = 'verifying' | 'ready' | 'invalid';

/**
 * Tela de redefinição via link do e-mail (?oobCode=…). Para cair aqui em vez
 * da página hospedada do Firebase, configure a action URL do template de
 * e-mail para {origem}/entrar/redefinir.
 */
@Component({
  selector: 'og-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent, FieldComponent, StrengthMeterComponent],
  template: `
    <og-auth-shell>
      @switch (state()) {
        @case ('verifying') {
          <div class="og-center">
            <p style="color: var(--nx-text-mute); font-size: 14px;">Validando o link…</p>
          </div>
        }
        @case ('invalid') {
          <div class="og-center">
            <header class="og-form-header">
              <span class="og-kicker">Redefinir senha</span>
              <h1>Link inválido ou expirado.</h1>
              <p>{{ invalidReason() }}</p>
            </header>
            <a class="og-btn-primary" routerLink="/entrar/recuperar">
              Pedir um novo link
            </a>
          </div>
        }
        @case ('ready') {
          <form [formGroup]="form" (ngSubmit)="submit()">
            <header class="og-form-header">
              <span class="og-kicker">Redefinir senha</span>
              <h1>Cria uma senha nova.</h1>
              <p>
                Redefinindo o acesso de <strong>{{ email() }}</strong>.
              </p>
            </header>

            @if (error(); as err) {
              <div class="og-alert" role="alert">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                {{ err }}
              </div>
            }

            <div class="og-stack">
              <div class="og-stack-sm">
                <og-field
                  label="Nova senha"
                  type="password"
                  placeholder="••••••••"
                  autocomplete="new-password"
                  formControlName="password"
                  [error]="passwordError()"
                />
                <og-strength-meter [password]="passwordValue()" />
              </div>
              <og-field
                label="Confirmar senha"
                type="password"
                placeholder="••••••••"
                autocomplete="new-password"
                formControlName="confirm"
                [error]="confirmError()"
              />
            </div>

            <div style="margin-top: 28px;">
              <button class="og-btn-primary" type="submit" [disabled]="loading()">
                @if (loading()) {
                  <span class="og-spinner" aria-hidden="true"></span>
                  Salvando…
                } @else {
                  Salvar e entrar no painel
                }
              </button>
            </div>

            <p class="og-fine">Isso desconecta as outras sessões ativas do painel.</p>
          </form>
        }
      }
    </og-auth-shell>
  `,
})
export class ResetPasswordComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly state = signal<ResetState>('verifying');
  protected readonly invalidReason = signal('O link de redefinição não é mais válido. Peça um novo que a gente reenvia.');
  protected readonly email = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  private oobCode = '';

  protected readonly form = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', Validators.required],
  });

  protected readonly passwordValue = toSignal(this.form.controls.password.valueChanges, {
    initialValue: '',
  });

  async ngOnInit(): Promise<void> {
    this.oobCode = this.route.snapshot.queryParamMap.get('oobCode') ?? '';
    if (!this.oobCode) {
      this.state.set('invalid');
      return;
    }
    try {
      this.email.set(await this.auth.verifyResetCode(this.oobCode));
      this.state.set('ready');
    } catch (err) {
      this.invalidReason.set(mapFirebaseAuthError(err));
      this.state.set('invalid');
    }
  }

  protected passwordError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    const control = this.form.controls.password;
    if (control.hasError('required')) {
      return 'Informe a nova senha.';
    }
    if (control.hasError('minlength')) {
      return 'A senha precisa de pelo menos 8 caracteres.';
    }
    return null;
  }

  protected confirmError(): string | null {
    const { password, confirm } = this.form.getRawValue();
    if (confirm && confirm !== password) {
      return 'As senhas não batem.';
    }
    if (this.submitted() && this.form.controls.confirm.hasError('required')) {
      return 'Confirme a senha.';
    }
    return null;
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    const { password, confirm } = this.form.getRawValue();
    if (this.form.invalid || password !== confirm) {
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.confirmReset(this.oobCode, password);
      await this.auth.signInWithEmail(this.email(), password, true);
      void this.router.navigateByUrl('/painel');
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 8: Create `frontend/projects/organizer/src/app/auth/email-sent.component.ts`** (adapted — selector, copy)

```typescript
import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { mapFirebaseAuthError } from './firebase-auth-errors';
import { AuthShellComponent } from './ui/auth-shell.component';

const RESEND_COOLDOWN_S = 30;

/**
 * Substitui a etapa "Verificar código" do protótipo original: o Firebase Auth
 * não emite OTP numérico por e-mail, só o link de redefinição com oobCode —
 * mesma solução já usada nos outros portais.
 */
@Component({
  selector: 'og-email-sent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AuthShellComponent],
  template: `
    <og-auth-shell>
      <div class="og-center">
        <div class="og-icon-badge">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--nx-orange-500)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>

        <header class="og-form-header">
          <h1>Confira seu e-mail.</h1>
          <p>
            Se <strong>{{ email() }}</strong> tiver conta, o link de redefinição chega em instantes.
          </p>
        </header>

        @if (error(); as err) {
          <div class="og-alert" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {{ err }}
          </div>
        }

        <a class="og-btn-primary" href="https://mail.google.com" target="_blank" rel="noopener">
          Abrir e-mail
        </a>

        <div class="og-resend-row">
          Não chegou? Confira o spam ou
          <button class="og-text-link" type="button" [disabled]="cooldown() > 0" (click)="resend()">reenviar</button>
          @if (cooldown() > 0) {
            <span class="og-timer">({{ cooldownLabel() }})</span>
          }
        </div>
      </div>
    </og-auth-shell>
  `,
})
export class EmailSentComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly cooldown = signal(RESEND_COOLDOWN_S);

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const state = this.router.getCurrentNavigation()?.extras.state ?? history.state;
    const email = typeof state?.['email'] === 'string' ? state['email'] : '';
    if (!email) {
      // Sem contexto (URL acessada direto) → volta pro início da recuperação.
      void this.router.navigateByUrl('/entrar/recuperar');
      return;
    }
    this.email.set(email);
    this.startCooldown();
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  protected cooldownLabel(): string {
    const s = this.cooldown();
    return `0:${String(s).padStart(2, '0')}`;
  }

  protected async resend(): Promise<void> {
    this.error.set(null);
    try {
      await this.auth.sendPasswordReset(this.email());
      this.startCooldown();
    } catch (err) {
      this.error.set(mapFirebaseAuthError(err));
    }
  }

  private startCooldown(): void {
    this.stopTimer();
    this.cooldown.set(RESEND_COOLDOWN_S);
    this.timer = setInterval(() => {
      const next = this.cooldown() - 1;
      this.cooldown.set(next);
      if (next <= 0) {
        this.stopTimer();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
```

- [ ] **Step 9: Verify it compiles**

Run: `cd frontend && npx ng build organizer --configuration development`
Expected: `Application bundle generation complete.` with no errors (components exist and type-check but aren't wired into routes yet — that's Task 4).

- [ ] **Step 10: Commit**

```bash
git add frontend/projects/organizer/src/app/auth
git commit -m "feat(organizer): auth UI components (login, signup, forgot/reset password, email-sent)"
```

---

## Task 4: Wire final routes + guarded painel placeholder

**Files:**
- Create: `frontend/projects/organizer/src/app/painel/panel-home.component.ts`
- Modify: `frontend/projects/organizer/src/app/app.routes.ts` (full replacement of Task 1's temporary version)

**Interfaces:**
- Consumes: `authGuard`, `organizerGuard` (Task 2), `LoginComponent`/`SignupComponent`/`ForgotPasswordComponent`/`ResetPasswordComponent`/`EmailSentComponent` (Task 3), `AuthService.signOutUser()` (Task 2).
- Produces: fully wired `Routes` array — the deliverable other tasks (Task 6's manual verification) exercise directly.

- [ ] **Step 1: Create `frontend/projects/organizer/src/app/painel/panel-home.component.ts`**

```typescript
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/** Placeholder guardado — prova que o login funciona ponta a ponta. Conteúdo
 *  real do painel (torneios, ligas, financeiro) é entrega futura. */
@Component({
  selector: 'og-panel-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="card">
        <span class="og-kicker">Painel do organizador</span>
        <h1>Em construção.</h1>
        <p>O login já funciona — as telas de torneios, ligas e financeiro chegam nas próximas entregas.</p>
        <button class="og-mini-btn og-mini-btn-primary" type="button" (click)="signOut()">Sair</button>
      </div>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: var(--nx-bg);
    }

    .card {
      max-width: 420px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
    }

    h1 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
    }

    p {
      font-size: 14px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0;
    }
  `,
})
export class PanelHomeComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected async signOut(): Promise<void> {
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }
}
```

- [ ] **Step 2: Replace `frontend/projects/organizer/src/app/app.routes.ts` in full**

```typescript
import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { organizerGuard } from './auth/organizer.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'entrar' },
  {
    path: 'entrar',
    title: 'Entrar — NexaGO Organizador',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'entrar/recuperar',
    title: 'Recuperar senha — NexaGO Organizador',
    loadComponent: () =>
      import('./auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'entrar/enviado',
    title: 'E-mail enviado — NexaGO Organizador',
    loadComponent: () => import('./auth/email-sent.component').then((m) => m.EmailSentComponent),
  },
  {
    path: 'entrar/redefinir',
    title: 'Redefinir senha — NexaGO Organizador',
    loadComponent: () =>
      import('./auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'cadastro',
    title: 'Cadastrar organizador — NexaGO Organizador',
    loadComponent: () => import('./auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'painel',
    title: 'Painel — NexaGO Organizador',
    canActivate: [authGuard, organizerGuard],
    loadComponent: () => import('./painel/panel-home.component').then((m) => m.PanelHomeComponent),
  },
  { path: '**', redirectTo: '' },
];
```

- [ ] **Step 3: Verify it builds**

Run: `cd frontend && npx ng build organizer --configuration development`
Expected: `Application bundle generation complete.` with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/organizer/src/app/painel frontend/projects/organizer/src/app/app.routes.ts
git commit -m "feat(organizer): wire auth routes and guarded painel placeholder"
```

---

## Task 5: Backend Cloud Function `completeOrganizerSignup`

**Files:**
- Create: `functions/src/organizer-signup.ts`
- Create: `functions/src/organizer-signup.test.ts`
- Modify: `functions/src/index.ts:282-283`

**Interfaces:**
- Consumes: `AppRole`, `applyRolesToClaims`, `firestoreRolesPayload`, `rolesFromClaims` from `./auth-roles` (all pre-existing — `"organizer"` is already in `ALLOWED_APP_ROLES`, no changes to `auth-roles.ts` needed).
- Produces: `withOrganizerRole(existingRoles: AppRole[]): AppRole[]` (pure, unit-tested), `completeOrganizerSignup` (`onCall`, callable as `'completeOrganizerSignup'` — matches the name Task 2's `auth.service.ts` already calls via `httpsCallable`).

- [ ] **Step 1: Write the failing test — `functions/src/organizer-signup.test.ts`**

```typescript
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {withOrganizerRole} from "./organizer-signup";

describe("withOrganizerRole", () => {
  it("adds organizer when the user has no roles yet", () => {
    assert.deepEqual(withOrganizerRole([]), ["organizer"]);
  });

  it("adds organizer alongside an existing role", () => {
    assert.deepEqual(withOrganizerRole(["athlete"]), ["athlete", "organizer"]);
  });

  it("is a no-op when organizer is already present", () => {
    assert.deepEqual(withOrganizerRole(["organizer"]), ["organizer"]);
  });

  it("never drops existing roles", () => {
    assert.deepEqual(withOrganizerRole(["athlete", "arena"]), ["athlete", "arena", "organizer"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd functions && npm run build && node --test lib/organizer-signup.test.js`
Expected: FAIL — `npm run build` (tsc) errors with `Cannot find module './organizer-signup'` (the file doesn't exist yet).

- [ ] **Step 3: Create `functions/src/organizer-signup.ts`**

```typescript
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  type AppRole,
  applyRolesToClaims,
  firestoreRolesPayload,
  rolesFromClaims,
} from "./auth-roles";

/**
 * Garante que `organizer` está entre os papéis do usuário, preservando os que
 * já existiam (ex.: já é atleta) — nunca reduz acesso. `organizer` já existe
 * em ALLOWED_APP_ROLES (gestor de torneios, hoje usado pelo backoffice); este
 * autocadastro só dá a esse papel um portal web dedicado, não cria papel novo.
 */
export function withOrganizerRole(existingRoles: AppRole[]): AppRole[] {
  return existingRoles.includes("organizer") ? existingRoles : [...existingRoles, "organizer"];
}

/**
 * Chamada uma vez pelo client logo após `createUserWithEmailAndPassword` no
 * autocadastro do portal organizador. Define a claim `organizer` (via Admin
 * SDK — nunca client-write direto) e mirra o papel em `users/{uid}`, de onde
 * o login do portal organizador confere a role. Sem coleção de perfil nova
 * (`organizers/{uid}`) — fora do escopo desta entrega (só auth).
 */
export const completeOrganizerSignup = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Usuário não autenticado.");
  }

  const displayName = (request.data?.displayName as string | undefined)?.trim() ?? "";
  if (!displayName) {
    throw new HttpsError("invalid-argument", "Nome é obrigatório.");
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);
  const existingRoles = rolesFromClaims(user.customClaims);
  const nextRoles = withOrganizerRole(existingRoles);

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

  logger.info("Organizer signup completed", {uid});
  return {ok: true};
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd functions && npm run build && node --test lib/organizer-signup.test.js`
Expected: PASS — `# pass 4`, `# fail 0`.

- [ ] **Step 5: Register the export in `functions/src/index.ts`**

Find:

```typescript
export {completeCoachSignup} from "./coach-signup";
export {completeArenaSignup} from "./arena-signup";
```

Replace with:

```typescript
export {completeCoachSignup} from "./coach-signup";
export {completeArenaSignup} from "./arena-signup";
export {completeOrganizerSignup} from "./organizer-signup";
```

- [ ] **Step 6: Full typecheck + test run**

Run: `cd functions && npm run build && npm run lint`
Expected: both succeed with no errors (`lint` here is `tsc --noEmit`).

Run: `cd functions && node --test lib/**/*.test.js`
Expected: all existing tests still pass, plus the 4 new `withOrganizerRole` tests (`# pass` count increases by 4 vs. the pre-existing total).

- [ ] **Step 7: Commit**

```bash
git add functions/src/organizer-signup.ts functions/src/organizer-signup.test.ts functions/src/index.ts
git commit -m "feat(functions): completeOrganizerSignup Cloud Function"
```

---

## Task 6: Deploy the function to dev and verify the flow end-to-end

**Files:** none (verification only).

**Interfaces:** none produced — this task exercises Tasks 1–5's deliverables together against the real `dev` Firebase project (`volley-track-dev-4596c`, per `shared/firebase/firebase.config.ts` — same project every `environment.ts` in the workspace points to).

> **Checkpoint before Step 1:** deploying a Cloud Function touches live cloud infrastructure (the shared `dev` project). Confirm with whoever is running this plan before running the deploy command — this is a deliberate pause point, not an automatic step.

- [ ] **Step 1: Deploy only the new function to dev**

Run: `firebase deploy --only functions:completeOrganizerSignup --project dev`
Expected: deploy log ends with `✔  Deploy complete!` and lists `completeOrganizerSignup` as created/updated. (Do **not** pass `--project default` — that would target production, out of scope.)

- [ ] **Step 2: Serve the app locally**

Run: `cd frontend && npx ng serve organizer --port 4205`
Expected: `Local: http://localhost:4205/`

- [ ] **Step 3: Manual walkthrough — cadastro**

1. Open `http://localhost:4205/` → redirects to `/entrar`.
2. Click "Cadastrar como organizador" → lands on `/cadastro`.
3. Fill Nome="Teste Organizador", Telefone="62999990000", E-mail="organizer-test+1@example.com", Senha="Teste1234!" → submit.
4. Expected: button shows "Criando conta…", then navigates to `/painel`, showing "Painel do organizador — Em construção." with a "Sair" button.

- [ ] **Step 4: Verify the claim and Firestore mirror**

In the Firebase console (project `volley-track-dev-4596c`) → Authentication → find the test user → check custom claims include `"roles":["organizer"]` (via the "Custom claims" panel or `firebase auth:export` if the console doesn't show claims directly). In Firestore → `users/{uid}` → confirm `roles: ["organizer"]`, `displayName: "Teste Organizador"`, `email` set, and `role` field is **absent** (deleted by `firestoreRolesPayload`).

- [ ] **Step 5: Manual walkthrough — sign out / sign in**

1. Click "Sair" on the placeholder painel → redirects to `/entrar`.
2. Enter the same e-mail/senha, submit → redirects to `/painel` again (no re-cadastro needed).

- [ ] **Step 6: Manual walkthrough — esqueci/redefinir senha**

1. From `/entrar`, click "Esqueceu a senha?" → `/entrar/recuperar`.
2. Enter the test e-mail, submit → redirects to `/entrar/enviado`, shows "Confira seu e-mail."
3. Open the actual reset e-mail (check the inbox for `organizer-test+1@example.com`), click the link → should land on `/entrar/redefinir?oobCode=...` and show "Cria uma senha nova."
4. Set a new password, confirm, submit → redirects to `/painel` (auto-signed-in with the new password).

- [ ] **Step 7: Confirm a non-organizer account is blocked**

1. Sign out. In the Firebase console, manually remove the `organizer` role from the test user's custom claims (or use a second test account that never completed cadastro, e.g. one created directly in the Auth console with no custom claims).
2. Try to log in with that account at `/entrar`.
3. Expected: login succeeds (claims-based gate doesn't block sign-in itself, per the approved design), but navigating to `/painel` immediately redirects back to `/entrar` — `organizerGuard` is doing its job.

No code changes result from this task; it's the acceptance check for the whole plan. If any step fails, return to the relevant task (2–5) to fix before considering the plan done.
