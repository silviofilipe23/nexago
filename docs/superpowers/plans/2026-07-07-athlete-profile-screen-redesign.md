# Athlete Profile Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the athlete web app's 4-step profile wizard at `/perfil` with a simple account screen (view/edit inline), matching the reference mockups and reusing the same shell the rest of the app already uses.

**Architecture:** `AthleteProfileSettingsComponent` is rewritten from scratch, wrapped in the existing `AtPanelShellComponent` (same shell as the dashboard). A handful of new pure-logic files (city/state formatting, XP/level math, achievement catalog) back the view, plus one new Firestore-reading `AthleteGamificationService`. Persistence keeps writing to the same `users/{uid}` and `athlete_profiles/{uid}` docs the old wizard used, with `merge: true` so untouched legacy fields (headline, achievements text, availability, etc.) survive.

**Tech Stack:** Angular 17+ standalone components, Angular signals, Reactive Forms, Firebase JS SDK v9 modular (`firebase/app`, `firebase/auth`, `firebase/firestore`), Karma/Jasmine for pure-logic unit tests.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-07-athlete-profile-screen-redesign-design.md` — every requirement below traces back to it.
- Do not delete or stop writing any Firestore field the old wizard used (`headline`, `achievementHighlights`, `availabilityNote`, `availabilitySlots`, `instagram`, `dominantHand`, `heightCm`, `preferredCourtSide`, `favoritePartnerName`, `goals`, `country`, `category`, `sports`, `publicHandle`, `coverPhotoUrl`, `profilePhotoUrl`) — the new `save()` simply omits them from its payload and uses `{ merge: true }`, which leaves them untouched in Firestore.
- No new npm dependencies. No icon library — SVG inline, matching `at-panel-shell.component.html`.
- Route path, component class name (`AthleteProfileSettingsComponent`), and file names stay the same — `app.routes.ts` needs no changes.
- "Vitórias" stat, MFA enrollment, email-change flow, and photo upload are explicitly out of scope this round (see spec) — do not implement them.
- Currency/number formatting, if any, follows `pt-BR` locale (matches rest of the app).

---

## File Structure

New files (all under `frontend/projects/athlete/src/app/profile/`):

- `profile-format.ts` — pure string/formatting helpers (name, slug, city/state, initials). No Angular/Firebase deps.
- `profile-format.spec.ts` — Jasmine unit tests for the above.
- `gamification-level.ts` — pure XP/level math. No Angular/Firebase deps.
- `gamification-level.spec.ts` — Jasmine unit tests for the above.
- `achievement-catalog.ts` — static 24-item catalog + pure merge-with-unlocked function. No Angular/Firebase deps.
- `achievement-catalog.spec.ts` — Jasmine unit tests for the above.
- `athlete-gamification.service.ts` — Angular service, reads `users/{uid}/gamification/summary` and `users/{uid}/gamification_badges` via `onSnapshot`, exposes signals. No spec file (see Task 4 rationale).

Rewritten files (same paths, same class/selector, full rewrite):

- `athlete-profile-settings.component.ts`
- `athlete-profile-settings.component.html`
- `athlete-profile-settings.component.scss`

Untouched (verified, not modified): `app.routes.ts`, `athlete-public-profile.component.ts`, `auth/auth.service.ts`.

---

### Task 1: Profile formatting helpers

**Files:**
- Create: `frontend/projects/athlete/src/app/profile/profile-format.ts`
- Test: `frontend/projects/athlete/src/app/profile/profile-format.spec.ts`

**Interfaces:**
- Produces: `titleCase(input: string): string`, `nameFromEmail(email: string | null | undefined): string`, `slugify(input: string): string`, `buildPublicProfileId(handle: string, uidLike: string | null | undefined): string`, `initialsOf(name: string): string`, `splitCityState(input: string): { city: string; state: string }`, `joinCityState(city: string, state: string): string` — all consumed by Task 5 (the component) and Task 4 (initialsOf is not used there, but the others may be).

- [ ] **Step 1: Write the failing tests**

Create `frontend/projects/athlete/src/app/profile/profile-format.spec.ts`:

```typescript
import { buildPublicProfileId, initialsOf, joinCityState, nameFromEmail, slugify, splitCityState, titleCase } from './profile-format';

describe('profile-format', () => {
  describe('titleCase', () => {
    it('capitalizes each word and lowercases the rest', () => {
      expect(titleCase('MARINA santos')).toBe('Marina Santos');
    });
  });

  describe('nameFromEmail', () => {
    it('title-cases the local part of the email', () => {
      expect(nameFromEmail('marina.santos@example.com')).toBe('Marina Santos');
    });

    it('falls back to a default name when email is missing', () => {
      expect(nameFromEmail(null)).toBe('Atleta NexaGO');
      expect(nameFromEmail(undefined)).toBe('Atleta NexaGO');
    });
  });

  describe('slugify', () => {
    it('removes accents and non-alphanumeric characters', () => {
      expect(slugify('Aparecida de Goiânia')).toBe('aparecida-de-goiania');
    });

    it('trims to 28 characters', () => {
      expect(slugify('a'.repeat(50)).length).toBe(28);
    });
  });

  describe('buildPublicProfileId', () => {
    it('combines a slugified handle with a short uid suffix', () => {
      expect(buildPublicProfileId('Marina Santos', 'abcd1234efgh')).toBe('marina-santos-abcd1234');
    });

    it('falls back to "atleta" when handle and uid are both empty', () => {
      expect(buildPublicProfileId('', null)).toBe('atleta');
    });
  });

  describe('initialsOf', () => {
    it('takes the first letter of the first and last word', () => {
      expect(initialsOf('Marcelo Antunes')).toBe('MA');
    });

    it('takes a single letter for a one-word name', () => {
      expect(initialsOf('Madonna')).toBe('M');
    });

    it('falls back to AT for an empty name', () => {
      expect(initialsOf('')).toBe('AT');
    });
  });

  describe('splitCityState', () => {
    it('splits on the last comma and uppercases the state', () => {
      expect(splitCityState('Aparecida de Goiânia, GO')).toEqual({ city: 'Aparecida de Goiânia', state: 'GO' });
    });

    it('handles a missing comma by returning the whole string as city', () => {
      expect(splitCityState('Recife')).toEqual({ city: 'Recife', state: '' });
    });

    it('handles an empty string', () => {
      expect(splitCityState('')).toEqual({ city: '', state: '' });
    });

    it('trims whitespace and normalizes state casing', () => {
      expect(splitCityState('Rio de Janeiro,rj')).toEqual({ city: 'Rio de Janeiro', state: 'RJ' });
    });
  });

  describe('joinCityState', () => {
    it('joins city and state with a comma', () => {
      expect(joinCityState('Recife', 'PE')).toBe('Recife, PE');
    });

    it('omits the comma when state is empty', () => {
      expect(joinCityState('Recife', '')).toBe('Recife');
    });

    it('returns an empty string when city is empty', () => {
      expect(joinCityState('', 'GO')).toBe('');
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx ng test athlete --watch=false --include=**/profile-format.spec.ts`
Expected: FAIL — `Cannot find module './profile-format'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `frontend/projects/athlete/src/app/profile/profile-format.ts`:

```typescript
export function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  if (!local) {
    return 'Atleta NexaGO';
  }
  return titleCase(local);
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
}

export function buildPublicProfileId(handle: string, uidLike: string | null | undefined): string {
  const base = slugify(handle) || 'atleta';
  const suffix = uidLike ? slugify(uidLike).slice(0, 8) : '';
  return suffix ? `${base}-${suffix}` : base;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'AT';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

export function splitCityState(input: string): { city: string; state: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { city: '', state: '' };
  }
  const lastComma = trimmed.lastIndexOf(',');
  if (lastComma === -1) {
    return { city: trimmed, state: '' };
  }
  const city = trimmed.slice(0, lastComma).trim();
  const state = trimmed.slice(lastComma + 1).trim().toUpperCase();
  if (!city) {
    return { city: trimmed, state: '' };
  }
  return { city, state };
}

export function joinCityState(city: string, state: string): string {
  const trimmedCity = city.trim();
  const trimmedState = state.trim();
  if (!trimmedCity) {
    return '';
  }
  return trimmedState ? `${trimmedCity}, ${trimmedState}` : trimmedCity;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx ng test athlete --watch=false --include=**/profile-format.spec.ts`
Expected: PASS — all specs green.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/profile/profile-format.ts frontend/projects/athlete/src/app/profile/profile-format.spec.ts
git commit -m "feat(athlete): add profile formatting helpers"
```

---

### Task 2: Gamification level math

**Files:**
- Create: `frontend/projects/athlete/src/app/profile/gamification-level.ts`
- Test: `frontend/projects/athlete/src/app/profile/gamification-level.spec.ts`

**Interfaces:**
- Produces: `interface LevelProgress { xpInLevel: number; xpForNextLevel: number; progressRatio: number }`, `computeLevelProgress(xp: number, level: number): LevelProgress` — consumed by Task 4 (`AthleteGamificationService`) and Task 5 (the component's level bar).

- [ ] **Step 1: Write the failing tests**

Create `frontend/projects/athlete/src/app/profile/gamification-level.spec.ts`:

```typescript
import { computeLevelProgress } from './gamification-level';

describe('computeLevelProgress', () => {
  it('returns zero progress at the very start', () => {
    expect(computeLevelProgress(0, 0)).toEqual({ xpInLevel: 0, xpForNextLevel: 100, progressRatio: 0 });
  });

  it('computes xp-in-level and xp-to-next for a mid-level value', () => {
    expect(computeLevelProgress(340, 3)).toEqual({ xpInLevel: 40, xpForNextLevel: 60, progressRatio: 0.4 });
  });

  it('treats negative or non-finite xp as zero', () => {
    expect(computeLevelProgress(-10, 0)).toEqual({ xpInLevel: 0, xpForNextLevel: 100, progressRatio: 0 });
    expect(computeLevelProgress(Number.NaN, 0)).toEqual({ xpInLevel: 0, xpForNextLevel: 100, progressRatio: 0 });
  });

  it('handles xp landing exactly on a level boundary', () => {
    expect(computeLevelProgress(100, 1)).toEqual({ xpInLevel: 0, xpForNextLevel: 100, progressRatio: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx ng test athlete --watch=false --include=**/gamification-level.spec.ts`
Expected: FAIL — `Cannot find module './gamification-level'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/projects/athlete/src/app/profile/gamification-level.ts`:

```typescript
export interface LevelProgress {
  xpInLevel: number;
  xpForNextLevel: number;
  progressRatio: number;
}

const XP_PER_LEVEL = 100;

/** Espelha a curva de XP do app Flutter (GamificationSummary em gamification_models.dart): 100 XP por nível. */
export function computeLevelProgress(xp: number, level: number): LevelProgress {
  const safeXp = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  const safeLevel = Number.isFinite(level) && level >= 0 ? Math.floor(level) : Math.floor(safeXp / XP_PER_LEVEL);
  const xpInLevel = safeXp % XP_PER_LEVEL;
  const xpForNextLevel = (safeLevel + 1) * XP_PER_LEVEL - safeXp;
  const progressRatio = Math.min(1, Math.max(0, xpInLevel / XP_PER_LEVEL));
  return { xpInLevel, xpForNextLevel, progressRatio };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx ng test athlete --watch=false --include=**/gamification-level.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/profile/gamification-level.ts frontend/projects/athlete/src/app/profile/gamification-level.spec.ts
git commit -m "feat(athlete): add gamification level/XP math helper"
```

---

### Task 3: Achievement catalog

**Files:**
- Create: `frontend/projects/athlete/src/app/profile/achievement-catalog.ts`
- Test: `frontend/projects/athlete/src/app/profile/achievement-catalog.spec.ts`

**Interfaces:**
- Produces: `interface AchievementDefinition { id: string; title: string; description: string }`, `interface AchievementViewModel extends AchievementDefinition { unlocked: boolean }`, `ACHIEVEMENT_CATALOG: readonly AchievementDefinition[]` (24 entries), `buildAchievementViewModels(unlockedIds: ReadonlySet<string>): AchievementViewModel[]` — consumed by Task 5 (the component's Conquistas section). `AchievementDefinition.id` values must match the Firestore doc IDs under `users/{uid}/gamification_badges` (these are the badge IDs the Cloud Functions engine writes — see `functions/src/achievement-engine.ts`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/projects/athlete/src/app/profile/achievement-catalog.spec.ts`:

```typescript
import { ACHIEVEMENT_CATALOG, buildAchievementViewModels } from './achievement-catalog';

describe('achievement-catalog', () => {
  it('has exactly 24 achievements', () => {
    expect(ACHIEVEMENT_CATALOG.length).toBe(24);
  });

  it('has unique ids', () => {
    const ids = ACHIEVEMENT_CATALOG.map((def) => def.id);
    expect(new Set(ids).size).toBe(24);
  });

  describe('buildAchievementViewModels', () => {
    it('marks nothing unlocked and preserves catalog order for an empty set', () => {
      const result = buildAchievementViewModels(new Set());
      expect(result.length).toBe(24);
      expect(result.every((item) => !item.unlocked)).toBe(true);
      expect(result.map((item) => item.id)).toEqual(ACHIEVEMENT_CATALOG.map((def) => def.id));
    });

    it('moves unlocked achievements to the front, keeping catalog order among them', () => {
      const result = buildAchievementViewModels(new Set(['STREAK_3', 'WELCOME']));
      expect(result.filter((item) => item.unlocked).map((item) => item.id)).toEqual(['WELCOME', 'STREAK_3']);
      expect(result.length).toBe(24);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx ng test athlete --watch=false --include=**/achievement-catalog.spec.ts`
Expected: FAIL — `Cannot find module './achievement-catalog'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/projects/athlete/src/app/profile/achievement-catalog.ts`:

```typescript
export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
}

export interface AchievementViewModel extends AchievementDefinition {
  unlocked: boolean;
}

/**
 * Espelha os metadados de exibição (id/title/description) do catálogo de 24
 * conquistas em functions/src/achievement-engine.ts. Não replica as regras de
 * desbloqueio (rule) — a tela só lê o que já está em users/{uid}/gamification_badges.
 */
export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
  { id: 'WELCOME', title: 'Bem-vindo', description: 'Complete o onboarding.' },
  { id: 'FIRST_GAME', title: 'Primeiro jogo', description: 'Bata uma bola.' },
  { id: 'IDENTITY', title: 'Identidade', description: 'Foto + esporte no perfil.' },
  { id: 'PROFILE_COMPLETE', title: 'Perfil completo', description: 'Todos os passos do perfil.' },
  { id: 'FIRST_BOOKING', title: 'Primeira reserva', description: 'Reserve sua primeira quadra.' },
  { id: 'FIRST_FAVORITE', title: 'Arena favorita', description: 'Favorite uma arena.' },
  { id: 'FIRST_INVITE', title: 'Primeiro convite', description: 'Convide alguém para jogar.' },
  { id: 'FIRST_CHECKIN', title: 'Check-in', description: 'Confirme presença no local.' },
  { id: 'FIVE_GAMES', title: '5 jogos', description: 'Cinco partidas no total.' },
  { id: 'TEN_GAMES_30D', title: '10 jogos', description: '10 partidas em 30 dias.' },
  { id: 'TWENTY_FIVE_GAMES', title: '25 jogos', description: 'Veterano da quadra.' },
  { id: 'STREAK_3', title: 'Sequência 3', description: 'Jogue 3 dias seguidos.' },
  { id: 'STREAK_5', title: 'Em chamas', description: 'Sequência de 5 dias.' },
  { id: 'STREAK_7', title: 'Regular', description: 'Semana cheia de jogos.' },
  { id: 'ATTENDANCE_STREAK_5', title: 'Pontual', description: '5 confirmações seguidas.' },
  { id: 'ATTENDANCE_TOTAL_10', title: 'Comprometido', description: '10 confirmações de presença.' },
  { id: 'CONNECTOR', title: 'Conector', description: 'Convide 3 amigos.' },
  { id: 'AMBASSADOR', title: 'Embaixador', description: 'Compartilhe seu perfil.' },
  { id: 'FIVE_INVITES', title: 'Recrutador', description: '5 convites enviados.' },
  { id: 'THREE_SHARES', title: 'Influencer', description: 'Compartilhe 3 vezes.' },
  { id: 'TEN_INVITES', title: 'Rede forte', description: '10 convites enviados.' },
  { id: 'FIVE_SHARES', title: 'Divulgador', description: '5 compartilhamentos.' },
  { id: 'ACTIVE_WEEK', title: 'Semana ativa', description: '4 jogos em 7 dias.' },
  { id: 'DEDICATED', title: 'Dedicado', description: '20 jogos no total.' },
];

export function buildAchievementViewModels(unlockedIds: ReadonlySet<string>): AchievementViewModel[] {
  const unlocked: AchievementViewModel[] = [];
  const locked: AchievementViewModel[] = [];
  for (const def of ACHIEVEMENT_CATALOG) {
    const item: AchievementViewModel = { ...def, unlocked: unlockedIds.has(def.id) };
    (item.unlocked ? unlocked : locked).push(item);
  }
  return [...unlocked, ...locked];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx ng test athlete --watch=false --include=**/achievement-catalog.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/profile/achievement-catalog.ts frontend/projects/athlete/src/app/profile/achievement-catalog.spec.ts
git commit -m "feat(athlete): add achievement catalog and unlocked-merge helper"
```

---

### Task 4: Gamification data service

**Files:**
- Create: `frontend/projects/athlete/src/app/profile/athlete-gamification.service.ts`

**Interfaces:**
- Consumes: `computeLevelProgress(xp, level): LevelProgress` from Task 2 (`./gamification-level`); `AuthService` (`this.auth.user()`) from `../auth/auth.service`; `environment.firebase` from `../../environments/environment`.
- Produces: `interface GamificationSummaryView { xp: number; level: number; streak: number; totalGames: number; progress: LevelProgress }`, class `AthleteGamificationService` (`providedIn: 'root'`) with `readonly summary: Signal<GamificationSummaryView | null>` and `readonly unlockedAchievementIds: Signal<ReadonlySet<string>>` — both consumed by Task 5 (the component).

No spec file for this task: it's a thin Firestore `onSnapshot` wrapper with no branching logic of its own (the math lives in `gamification-level.ts`, already tested in Task 2) and this codebase has no existing convention for mocking the Firebase SDK in tests (zero TestBed specs exist anywhere in `frontend/`, see the design's file-structure note). Correctness is verified manually in Task 6 by checking real Firestore data renders in the profile screen.

- [ ] **Step 1: Write the service**

Create `frontend/projects/athlete/src/app/profile/athlete-gamification.service.ts`:

```typescript
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { collection, doc, getFirestore, onSnapshot, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { computeLevelProgress, type LevelProgress } from './gamification-level';

export interface GamificationSummaryView {
  xp: number;
  level: number;
  streak: number;
  totalGames: number;
  progress: LevelProgress;
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function readSummary(data: Record<string, unknown> | undefined): GamificationSummaryView {
  const xp = typeof data?.['xp'] === 'number' ? (data['xp'] as number) : 0;
  const level = typeof data?.['level'] === 'number' ? (data['level'] as number) : Math.floor(xp / 100);
  const streak = typeof data?.['streak'] === 'number' ? (data['streak'] as number) : 0;
  const totalGames = typeof data?.['totalGames'] === 'number' ? (data['totalGames'] as number) : 0;
  return { xp, level, streak, totalGames, progress: computeLevelProgress(xp, level) };
}

/** Só leitura: users/{uid}/gamification/summary é escrito exclusivamente por Cloud Functions. */
@Injectable({ providedIn: 'root' })
export class AthleteGamificationService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly summaryState = signal<GamificationSummaryView | null>(null);
  private readonly unlockedState = signal<ReadonlySet<string>>(new Set());

  readonly summary = computed(() => this.summaryState());
  readonly unlockedAchievementIds = computed(() => this.unlockedState());

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;

      if (!uid || !this.firestore) {
        this.summaryState.set(null);
        this.unlockedState.set(new Set());
        return;
      }

      const stopSummary = onSnapshot(
        doc(this.firestore, 'users', uid, 'gamification', 'summary'),
        (snapshot) => {
          this.summaryState.set(readSummary(snapshot.data()));
        },
        () => this.summaryState.set(null),
      );

      const stopBadges = onSnapshot(
        collection(this.firestore, 'users', uid, 'gamification_badges'),
        (snapshot) => {
          this.unlockedState.set(new Set(snapshot.docs.map((badgeDoc) => badgeDoc.id)));
        },
        () => this.unlockedState.set(new Set()),
      );

      onCleanup(() => {
        stopSummary();
        stopBadges();
      });
    });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -p projects/athlete/tsconfig.app.json --noEmit`
Expected: no errors referencing `athlete-gamification.service.ts`. (Errors from other in-progress files, if any at this point in the plan, are expected and resolved in later tasks.)

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/athlete/src/app/profile/athlete-gamification.service.ts
git commit -m "feat(athlete): add gamification data service (level, streak, badges)"
```

---

### Task 5: Rewrite the profile settings component

**Files:**
- Modify (full rewrite): `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts`
- Modify (full rewrite): `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html`
- Modify (full rewrite): `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.scss`

**Interfaces:**
- Consumes: everything from Tasks 1–4 (`profile-format.ts`, `gamification-level.ts` types, `achievement-catalog.ts`, `athlete-gamification.service.ts`); `AuthService` (`user()`, `devEmail()`, `authReady()`, `sendPasswordReset(email)`) from `../auth/auth.service`; `AtPanelShellComponent` (`[userName]`, `[userLevel]` inputs) from `../painel/at-panel-shell.component`; `environment` from `../../environments/environment`.
- Produces: `AthleteProfileSettingsComponent` (selector `app-athlete-profile-settings`), the same class the route in `app.routes.ts` already imports — no route change needed.

Implementation notes carried over from the design doc plus a few small calls made here for concreteness (flagged so they're reviewable, not silently decided):

- **Handle display**: the mockup shows "@marcelo" in view mode but has no editable handle field. This plan derives the displayed handle as `slugify(fullName)` (e.g. "Marcelo Antunes" → "marcelo-antunes") — simple, no new field, no dependency on the legacy `publicHandle` control. The **share URL** still uses the persisted `publicProfileId` (with its uid suffix) so existing shared links keep working; the two don't need to match visually.
- **Skill-tier pill**: the mockup's "INICIANTE" pill under the name is the old wizard's `level` field (Iniciante/Intermediário/Open), which is one of the advanced fields the design cuts from editing. Rather than half-support it, this plan shows only two pills — sport (`primarySport`) and the gamification level ("Nível N") — both fully wired to real, editable/read data. No separate skill-tier pill.
- **Sport tabs**: the mockup shows 3 tabs (Vôlei de praia / Tênis / Padel) but the existing data model supports 8 sports (`PRIMARY_SPORT_OPTIONS` in the old file). This plan keeps all 8 as tabs (wrapping to a second row) so athletes who already picked "Futevolei" or "Beach tennis" don't lose their selection — narrowing to 3 would silently orphan their data.
- **Preview/no-auth fallback**: the route is guarded (`authGuard`), so `auth.user()` should always be set in production. The dev-only `devAuthBypass` path (no real Firebase user, only `auth.devEmail()`) is handled the same minimal way the dashboard (`athlete-painel.component.ts`) does: derive a display name from the dev email, show zeroed stats, and disable remote save.

- [ ] **Step 1: Rewrite the component class**

Replace the entire contents of `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts`:

```typescript
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, updateProfile } from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { ACHIEVEMENT_CATALOG, buildAchievementViewModels } from './achievement-catalog';
import { AthleteGamificationService } from './athlete-gamification.service';
import { buildPublicProfileId, initialsOf, joinCityState, nameFromEmail, slugify, splitCityState } from './profile-format';

const PRIMARY_SPORT_OPTIONS = [
  'Volei de praia',
  'Volei de quadra',
  'Beach tennis',
  'Futevolei',
  'Tenis',
  'Pickleball',
  'Padel',
  'Corrida',
] as const;

interface AthleteProfileData {
  fullName: string;
  city: string;
  state: string;
  whatsappNumber: string;
  primarySport: string;
  bio: string;
  publicProfileId: string | null;
}

const EMPTY_PROFILE: AthleteProfileData = {
  fullName: '',
  city: '',
  state: '',
  whatsappNumber: '',
  primarySport: 'Volei de praia',
  bio: '',
  publicProfileId: null,
};

interface StatRow {
  label: string;
  value: string;
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function readString(data: DocumentData | null | undefined, keys: readonly string[]): string | null {
  if (!data) {
    return null;
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function readNumber(data: DocumentData | null | undefined, keys: readonly string[]): number | null {
  if (!data) {
    return null;
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

@Component({
  selector: 'app-athlete-profile-settings',
  standalone: true,
  imports: [ReactiveFormsModule, AtPanelShellComponent],
  templateUrl: './athlete-profile-settings.component.html',
  styleUrl: './athlete-profile-settings.component.scss',
})
export class AthleteProfileSettingsComponent {
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);
  protected readonly gamification = inject(AthleteGamificationService);
  private readonly firestore = createFirestore();

  protected readonly sportOptions = PRIMARY_SPORT_OPTIONS;

  protected readonly isEditing = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saveSuccess = signal<string | null>(null);
  protected readonly copyFeedback = signal<string | null>(null);
  protected readonly showAllAchievements = signal(false);
  protected readonly sendingReset = signal(false);
  protected readonly passwordResetSent = signal(false);
  protected readonly resetError = signal<string | null>(null);

  private readonly loadedUid = signal<string | null>(null);
  private readonly profileState = signal<AthleteProfileData>(EMPTY_PROFILE);
  private readonly rankingLabel = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    cityState: ['', Validators.required],
    whatsappNumber: [''],
    primarySport: ['Volei de praia', Validators.required],
    bio: [''],
  });

  protected readonly displayName = computed(() => this.profileState().fullName || this.fallbackAccountLabel());
  protected readonly initials = computed(() => initialsOf(this.displayName()));
  protected readonly handle = computed(() => slugify(this.displayName()) || 'atleta');
  protected readonly cityStateLabel = computed(
    () => joinCityState(this.profileState().city, this.profileState().state) || 'Cidade não informada',
  );
  protected readonly sportPillLabel = computed(() => this.profileState().primarySport || 'Volei de praia');
  protected readonly profileBio = computed(
    () => this.profileState().bio || 'Conte um pouco sobre seu jogo editando o perfil.',
  );
  protected readonly accountEmail = computed(() => this.auth.user()?.email ?? this.auth.devEmail() ?? '');

  protected readonly levelLabel = computed(() => `Nível ${this.gamification.summary()?.level ?? 0}`);
  protected readonly xpLabel = computed(() => {
    const summary = this.gamification.summary();
    return summary ? `${summary.progress.xpInLevel} / 100 XP` : '0 / 100 XP';
  });
  protected readonly xpToNextLabel = computed(() => {
    const summary = this.gamification.summary();
    if (!summary) {
      return 'Continue jogando pra ganhar XP.';
    }
    return `Faltam ${summary.progress.xpForNextLevel} XP pro nível ${summary.level + 1}`;
  });
  protected readonly xpProgressPercent = computed(() =>
    Math.round((this.gamification.summary()?.progress.progressRatio ?? 0) * 100),
  );

  protected readonly statRows = computed<StatRow[]>(() => {
    const summary = this.gamification.summary();
    return [
      { label: 'Jogos', value: summary ? String(summary.totalGames) : '—' },
      { label: 'Sequência', value: summary && summary.streak > 0 ? `${summary.streak} dias` : '—' },
      { label: 'Ranking', value: this.rankingLabel() ?? '—' },
    ];
  });

  protected readonly achievements = computed(() => buildAchievementViewModels(this.gamification.unlockedAchievementIds()));
  protected readonly achievementTotal = ACHIEVEMENT_CATALOG.length;
  protected readonly unlockedCount = computed(() => this.achievements().filter((item) => item.unlocked).length);
  protected readonly visibleAchievements = computed(() =>
    this.showAllAchievements() ? this.achievements() : this.achievements().slice(0, 4),
  );

  protected readonly publicProfileUrl = computed(() => {
    const origin = typeof location !== 'undefined' ? location.origin : 'https://nexago.app';
    const uid = this.auth.user()?.uid ?? null;
    const identifier = this.profileState().publicProfileId || buildPublicProfileId(this.displayName(), uid);
    return `${origin}/atletas/${identifier}`;
  });

  constructor() {
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      if (!this.auth.authReady() || uid === this.loadedUid()) {
        return;
      }
      this.loadedUid.set(uid);

      if (uid) {
        void this.loadRemoteProfile(uid);
        return;
      }

      const devEmail = this.auth.devEmail();
      this.profileState.set({ ...EMPTY_PROFILE, fullName: devEmail ? nameFromEmail(devEmail) : '' });
      this.loading.set(false);
    });

    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      const projectId = environment.firebase.projectId;
      if (!uid || !this.firestore || !projectId) {
        this.rankingLabel.set(null);
        return;
      }

      const stop = onSnapshot(
        doc(this.firestore, 'artifacts', projectId, 'public', 'data', 'athleteRankings', uid),
        (snapshot) => {
          const data = snapshot.exists() ? snapshot.data() : null;
          const position = readNumber(data, ['position', 'rank', 'placement']);
          this.rankingLabel.set(position != null ? `#${Math.round(position)}` : 'Sem ranking');
        },
        () => this.rankingLabel.set(null),
      );

      onCleanup(() => stop());
    });
  }

  protected startEdit(): void {
    const current = this.profileState();
    this.form.reset({
      fullName: current.fullName,
      cityState: joinCityState(current.city, current.state),
      whatsappNumber: current.whatsappNumber,
      primarySport: current.primarySport || 'Volei de praia',
      bio: current.bio,
    });
    this.saveError.set(null);
    this.saveSuccess.set(null);
    this.isEditing.set(true);
  }

  protected cancelEdit(): void {
    this.isEditing.set(false);
    this.saveError.set(null);
  }

  protected selectSport(sport: string): void {
    this.form.controls.primarySport.setValue(sport);
    this.form.controls.primarySport.markAsDirty();
  }

  protected toggleAllAchievements(): void {
    this.showAllAchievements.update((value) => !value);
  }

  protected async save(): Promise<void> {
    this.saveError.set(null);
    this.saveSuccess.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.saveError.set('Preencha os campos obrigatórios antes de salvar.');
      return;
    }

    const uid = this.auth.user()?.uid;
    if (!uid || !this.firestore) {
      this.saveError.set('Faça login para salvar seu perfil.');
      return;
    }

    this.saving.set(true);

    try {
      const raw = this.form.getRawValue();
      const { city, state } = splitCityState(raw.cityState);
      const whatsappNumber = raw.whatsappNumber.trim();
      const bio = raw.bio.trim();
      const publicProfileId = this.profileState().publicProfileId || buildPublicProfileId(raw.fullName, uid);

      const authInstance = getAuth(getApps()[0]!);
      if (authInstance.currentUser && authInstance.currentUser.uid === uid) {
        await updateProfile(authInstance.currentUser, { displayName: raw.fullName });
      }

      await Promise.all([
        setDoc(
          doc(this.firestore, 'users', uid),
          { fullName: raw.fullName, city, state, updatedAt: serverTimestamp() },
          { merge: true },
        ),
        setDoc(
          doc(this.firestore, 'athlete_profiles', uid),
          {
            fullName: raw.fullName,
            displayName: raw.fullName,
            city,
            state,
            whatsappNumber,
            primarySport: raw.primarySport,
            bio,
            publicProfileId,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      ]);

      this.profileState.set({ fullName: raw.fullName, city, state, whatsappNumber, primarySport: raw.primarySport, bio, publicProfileId });
      this.saveSuccess.set('Perfil atualizado.');
      this.isEditing.set(false);
    } catch {
      this.saveError.set('Não foi possível salvar agora. Tente novamente em instantes.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async copyProfileLink(): Promise<void> {
    this.copyFeedback.set(null);
    try {
      await navigator.clipboard.writeText(this.publicProfileUrl());
      this.copyFeedback.set('Link copiado.');
    } catch {
      this.copyFeedback.set('Copie manualmente o link do perfil.');
    }
  }

  protected async shareProfile(): Promise<void> {
    const url = this.publicProfileUrl();
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (data: { title: string; url: string }) => Promise<void> }).share({
          title: 'Meu perfil NexaGO',
          url,
        });
        return;
      } catch {
        // usuario cancelou o compartilhamento nativo — cai pro copiar.
      }
    }
    await this.copyProfileLink();
  }

  protected async sendPasswordReset(): Promise<void> {
    const email = this.auth.user()?.email;
    if (!email) {
      return;
    }
    this.resetError.set(null);
    this.sendingReset.set(true);
    try {
      await this.auth.sendPasswordReset(email);
      this.passwordResetSent.set(true);
    } catch {
      this.resetError.set('Não foi possível enviar o e-mail agora.');
    } finally {
      this.sendingReset.set(false);
    }
  }

  private fallbackAccountLabel(): string {
    const user = this.auth.user();
    if (user?.displayName?.trim()) {
      return user.displayName.trim();
    }
    if (user?.email?.trim()) {
      return nameFromEmail(user.email);
    }
    const devEmail = this.auth.devEmail();
    return devEmail ? nameFromEmail(devEmail) : 'Atleta NexaGO';
  }

  private async loadRemoteProfile(uid: string): Promise<void> {
    if (!this.firestore) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    try {
      const [userSnap, profileSnap] = await Promise.all([
        getDoc(doc(this.firestore, 'users', uid)),
        getDoc(doc(this.firestore, 'athlete_profiles', uid)),
      ]);
      const userData = userSnap.exists() ? userSnap.data() : null;
      const profileData = profileSnap.exists() ? profileSnap.data() : null;

      const fullName =
        readString(profileData, ['fullName', 'displayName']) ??
        readString(userData, ['fullName']) ??
        this.auth.user()?.displayName?.trim() ??
        nameFromEmail(this.auth.user()?.email);

      this.profileState.set({
        fullName,
        city: readString(profileData, ['city']) ?? readString(userData, ['city']) ?? '',
        state: readString(profileData, ['state']) ?? readString(userData, ['state']) ?? '',
        whatsappNumber: readString(profileData, ['whatsappNumber']) ?? '',
        primarySport: readString(profileData, ['primarySport']) ?? 'Volei de praia',
        bio: readString(profileData, ['bio']) ?? '',
        publicProfileId: readString(profileData, ['publicProfileId', 'athleteId', 'profileIdentifier']),
      });
    } catch {
      this.saveError.set('Não foi possível carregar seu perfil agora.');
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 2: Rewrite the template**

Replace the entire contents of `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html`:

```html
<app-at-panel-shell [userName]="displayName()" [userLevel]="levelLabel()">
  <header class="at-page-header">
    <div class="at-page-header-titles">
      <h1>{{ isEditing() ? 'Editando perfil' : 'Meu perfil' }}</h1>
      <span class="at-page-header-sub">{{
        isEditing() ? 'As mudanças valem só depois de salvar' : 'Sua conta de atleta'
      }}</span>
    </div>
    <div class="at-page-header-spacer"></div>
    <div class="at-page-header-actions">
      @if (isEditing()) {
        <button type="button" class="at-ghost-btn" (click)="cancelEdit()">Cancelar</button>
        <button type="button" class="at-mini-btn at-mini-btn--primary" [disabled]="saving()" (click)="save()">
          {{ saving() ? 'Salvando...' : 'Salvar alterações' }}
        </button>
      } @else {
        <button type="button" class="at-mini-btn at-mini-btn--primary" (click)="startEdit()">Editar perfil</button>
      }
    </div>
  </header>

  <div class="at-body">
    @if (loading()) {
      <p class="at-empty">Carregando perfil...</p>
    } @else {
      <div class="at-profile-grid">
        <div class="at-col">
          <section class="at-card at-profile-identity">
            <div class="at-profile-avatar-row">
              <div class="at-profile-avatar" aria-hidden="true">{{ initials() }}</div>
              @if (isEditing()) {
                <div class="at-profile-avatar-actions">
                  <button type="button" class="at-mini-btn" disabled title="Em breve">Trocar foto</button>
                  <span class="at-profile-hint">PNG ou JPG · até 2 MB</span>
                </div>
              }
            </div>

            @if (!isEditing()) {
              <h2 class="at-profile-name">{{ displayName() }}</h2>
              <p class="at-profile-handle">&#64;{{ handle() }} · {{ cityStateLabel() }}</p>

              <div class="at-profile-pills">
                <span class="at-pill at-pill--orange">{{ sportPillLabel() }}</span>
                <span class="at-pill">{{ levelLabel() }}</span>
              </div>

              <div class="at-profile-level">
                <div class="at-profile-level-head">
                  <span class="at-profile-level-title">{{ levelLabel() }}</span>
                  <span class="at-profile-level-xp">{{ xpLabel() }}</span>
                </div>
                <div class="at-profile-progress">
                  <div class="at-profile-progress-bar" [style.width.%]="xpProgressPercent()"></div>
                </div>
                <p class="at-profile-level-next">{{ xpToNextLabel() }}</p>
              </div>

              <div class="at-profile-stats">
                @for (stat of statRows(); track stat.label) {
                  <div class="at-profile-stat-row">
                    <span>{{ stat.label }}</span>
                    <strong>{{ stat.value }}</strong>
                  </div>
                }
              </div>
            } @else {
              <form class="at-profile-form" [formGroup]="form">
                <label class="at-field">
                  <span>Nome completo</span>
                  <input type="text" formControlName="fullName" placeholder="Ex.: Marcelo Antunes" />
                </label>

                <label class="at-field">
                  <span>Cidade</span>
                  <input type="text" formControlName="cityState" placeholder="Ex.: Aparecida de Goiânia, GO" />
                </label>

                <label class="at-field">
                  <span>WhatsApp</span>
                  <input type="text" formControlName="whatsappNumber" placeholder="+55 62 99123-4567" />
                  <small class="at-field-hint">Usado pra confirmar reservas e times.</small>
                </label>

                <label class="at-field">
                  <span>E-mail</span>
                  <input type="text" [value]="accountEmail()" disabled />
                  <small class="at-field-hint">Pra trocar o e-mail, fale com o suporte.</small>
                </label>

                <div class="at-field">
                  <span>Esporte principal</span>
                  <div class="at-profile-sport-tabs">
                    @for (sport of sportOptions; track sport) {
                      <button
                        type="button"
                        class="at-profile-sport-tab"
                        [class.at-profile-sport-tab--active]="form.controls.primarySport.value === sport"
                        (click)="selectSport(sport)"
                      >
                        {{ sport }}
                      </button>
                    }
                  </div>
                </div>

                <label class="at-field">
                  <span>Bio</span>
                  <textarea
                    rows="4"
                    formControlName="bio"
                    placeholder="Conte seu estilo de jogo e o que você procura."
                  ></textarea>
                </label>
              </form>
            }
          </section>

          @if (!isEditing()) {
            <section class="at-card">
              <div class="at-card-head">
                <p class="at-card-kicker">Sobre</p>
              </div>
              <p class="at-profile-bio-text">{{ profileBio() }}</p>
            </section>
          }
        </div>

        <div class="at-col">
          <section class="at-card">
            <div class="at-card-head">
              <div>
                <p class="at-card-kicker">{{ unlockedCount() }} de {{ achievementTotal }} desbloqueadas</p>
                <span class="at-card-title">Conquistas</span>
              </div>
              <button type="button" class="at-ghost-btn" (click)="toggleAllAchievements()">
                {{ showAllAchievements() ? 'Ver menos' : 'Ver todas' }}
              </button>
            </div>
            <div class="at-profile-achievements-grid">
              @for (achievement of visibleAchievements(); track achievement.id) {
                <div class="at-profile-achievement" [class.at-profile-achievement--locked]="!achievement.unlocked">
                  <strong>{{ achievement.title }}</strong>
                  <span>{{ achievement.description }}</span>
                </div>
              }
            </div>
          </section>

          <section class="at-card">
            <div class="at-card-head">
              <div>
                <p class="at-card-kicker">Convide pra jogar junto</p>
                <span class="at-card-title">Compartilhar perfil</span>
              </div>
            </div>
            <div class="at-profile-share-row">
              <input type="text" class="at-profile-share-input" [value]="publicProfileUrl()" readonly />
              <button type="button" class="at-mini-btn" (click)="copyProfileLink()">Copiar</button>
              <button type="button" class="at-mini-btn at-mini-btn--primary" (click)="shareProfile()">Compartilhar</button>
            </div>
            @if (copyFeedback(); as feedback) {
              <p class="at-profile-copy-feedback">{{ feedback }}</p>
            }
          </section>

          <section class="at-card">
            <div class="at-card-head">
              <span class="at-card-title">Segurança</span>
            </div>
            <div class="at-profile-security-row">
              <div>
                <strong>Senha</strong>
                <p>{{ passwordResetSent() ? 'Link enviado — confere teu e-mail.' : 'Redefina sua senha por e-mail.' }}</p>
              </div>
              <button type="button" class="at-mini-btn" [disabled]="sendingReset()" (click)="sendPasswordReset()">
                {{ sendingReset() ? 'Enviando...' : 'Alterar' }}
              </button>
            </div>
            <div class="at-profile-security-row">
              <div>
                <strong>Verificação em 2 etapas</strong>
                <p>Código por e-mail em novos dispositivos.</p>
              </div>
              <span class="at-pill">Desativada</span>
              <button type="button" class="at-mini-btn" disabled title="Em breve">Ativar</button>
            </div>
            @if (resetError(); as err) {
              <p class="at-profile-copy-feedback">{{ err }}</p>
            }
          </section>
        </div>
      </div>

      @if (saveError(); as err) {
        <p class="at-profile-feedback at-profile-feedback--error">{{ err }}</p>
      }
      @if (saveSuccess(); as success) {
        <p class="at-profile-feedback at-profile-feedback--success">{{ success }}</p>
      }
    }
  </div>
</app-at-panel-shell>
```

- [ ] **Step 3: Rewrite the styles**

Replace the entire contents of `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.scss`:

```scss
:host {
  display: block;
}

// ── Header (mesma convenção de athlete-painel.component.scss) ──
.at-page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--nx-line);
  flex: none;

  @media (max-width: 640px) {
    padding: 16px;
  }
}

.at-page-header-titles {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.at-page-header-titles h1 {
  font-family: var(--nx-font-display);
  font-weight: 800;
  font-size: 21px;
  letter-spacing: -0.02em;
  color: var(--nx-text);
  margin: 0;
}

.at-page-header-sub {
  font-family: var(--nx-font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--nx-text-dim);
}

.at-page-header-spacer {
  flex: 1;
}

.at-page-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

// ── Body / layout ────────────────────────────────────────────
.at-body {
  flex: 1;
  padding: 22px 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;

  @media (max-width: 640px) {
    padding: 16px 16px 24px;
  }
}

.at-empty {
  font-family: var(--nx-font-ui);
  font-size: 13px;
  color: var(--nx-text-mute);
}

.at-profile-grid {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 16px;
  align-items: start;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
}

.at-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

// ── Card base (mesma convenção de .at-card) ─────────────────
.at-card {
  background: var(--nx-surface-0);
  border: 1px solid var(--nx-line);
  border-radius: var(--nx-r-5);
  padding: 18px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.at-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.at-card-kicker {
  font-family: var(--nx-font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--nx-text-dim);
  margin: 0 0 2px;
}

.at-card-title {
  font-family: var(--nx-font-display);
  font-weight: 700;
  font-size: 15px;
  letter-spacing: -0.01em;
  color: var(--nx-text);
}

// ── Pill ─────────────────────────────────────────────────────
.at-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 9px;
  border-radius: var(--nx-r-pill);
  font-family: var(--nx-font-mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  background: var(--nx-surface-1);
  border: 1px solid var(--nx-line-strong);
  color: var(--nx-text-mute);
}

.at-pill--orange {
  background: var(--nx-orange-tint);
  border-color: rgba(255, 106, 26, 0.3);
  color: var(--nx-orange-500);
}

// ── Botões mini (mesma convenção de .at-mini-btn / .at-ghost-btn) ──
.at-mini-btn {
  height: 32px;
  padding: 0 13px;
  border-radius: var(--nx-r-2);
  background: var(--nx-surface-1);
  color: var(--nx-text);
  border: 1px solid var(--nx-line-strong);
  font-family: var(--nx-font-display);
  font-weight: 600;
  font-size: 12.5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.at-mini-btn--primary {
  background: var(--nx-orange-500);
  color: var(--nx-text-on-orange);
  border: none;
  box-shadow: 0 6px 20px rgba(255, 106, 26, 0.2);
}

.at-ghost-btn {
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
}

// ── Identidade ───────────────────────────────────────────────
.at-profile-avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.at-profile-avatar {
  width: 72px;
  height: 72px;
  flex: none;
  border-radius: 50%;
  background: var(--nx-orange-tint);
  border: 1px solid rgba(255, 106, 26, 0.35);
  display: grid;
  place-items: center;
  font-family: var(--nx-font-display);
  font-weight: 700;
  font-size: 22px;
  color: var(--nx-orange-500);
}

.at-profile-avatar-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.at-profile-hint {
  font-size: 11px;
  color: var(--nx-text-dim);
}

.at-profile-name {
  font-family: var(--nx-font-display);
  font-weight: 800;
  font-size: 20px;
  letter-spacing: -0.02em;
  color: var(--nx-text);
  margin: 0;
}

.at-profile-handle {
  font-family: var(--nx-font-ui);
  font-size: 12.5px;
  color: var(--nx-text-mute);
  margin: 4px 0 12px;
}

.at-profile-pills {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}

.at-profile-level {
  padding-top: 14px;
  border-top: 1px solid var(--nx-line);
  margin-bottom: 14px;
}

.at-profile-level-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.at-profile-level-title {
  font-family: var(--nx-font-display);
  font-weight: 700;
  font-size: 13px;
  color: var(--nx-orange-500);
}

.at-profile-level-xp {
  font-family: var(--nx-font-mono);
  font-size: 11px;
  color: var(--nx-text-dim);
}

.at-profile-progress {
  height: 6px;
  border-radius: var(--nx-r-pill);
  background: var(--nx-surface-1);
  overflow: hidden;
  margin-bottom: 8px;
}

.at-profile-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--nx-orange-500), var(--nx-orange-400));
  border-radius: var(--nx-r-pill);
  transition: width var(--nx-d-slow) var(--nx-ease-out);
}

.at-profile-level-next {
  font-family: var(--nx-font-ui);
  font-size: 11.5px;
  color: var(--nx-text-dim);
  margin: 0;
}

.at-profile-stats {
  display: flex;
  flex-direction: column;
  padding-top: 6px;
  border-top: 1px solid var(--nx-line);
}

.at-profile-stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid var(--nx-line);
  font-family: var(--nx-font-ui);
  font-size: 13px;
  color: var(--nx-text-mute);

  &:last-child {
    border-bottom: none;
  }

  strong {
    color: var(--nx-text);
    font-weight: 700;
  }
}

.at-profile-bio-text {
  font-family: var(--nx-font-ui);
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--nx-text-mute);
  margin: 0;
}

// ── Formulário de edição ─────────────────────────────────────
.at-profile-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.at-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--nx-font-ui);
  font-size: 12px;
  color: var(--nx-text-mute);

  input,
  textarea {
    font-family: var(--nx-font-ui);
    font-size: 14px;
    color: var(--nx-text);
    background: var(--nx-surface-1);
    border: 1px solid var(--nx-line-strong);
    border-radius: var(--nx-r-2);
    padding: 10px 12px;

    &:disabled {
      opacity: 0.6;
    }

    &:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }
  }

  textarea {
    resize: vertical;
    min-height: 84px;
  }
}

.at-field-hint {
  font-size: 11px;
  color: var(--nx-text-dim);
}

.at-profile-sport-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.at-profile-sport-tab {
  height: 30px;
  padding: 0 12px;
  border-radius: var(--nx-r-pill);
  background: var(--nx-surface-1);
  border: 1px solid var(--nx-line-strong);
  color: var(--nx-text-mute);
  font-family: var(--nx-font-ui);
  font-size: 12.5px;
  cursor: pointer;
}

.at-profile-sport-tab--active {
  background: var(--nx-orange-tint);
  border-color: rgba(255, 106, 26, 0.4);
  color: var(--nx-orange-500);
  font-weight: 600;
}

// ── Conquistas ───────────────────────────────────────────────
.at-profile-achievements-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.at-profile-achievement {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--nx-r-3);
  background: var(--nx-orange-tint);
  border: 1px solid rgba(255, 106, 26, 0.3);

  strong {
    font-family: var(--nx-font-display);
    font-size: 13px;
    color: var(--nx-text);
  }

  span {
    font-family: var(--nx-font-ui);
    font-size: 11.5px;
    color: var(--nx-text-mute);
  }
}

.at-profile-achievement--locked {
  background: var(--nx-surface-1);
  border-color: var(--nx-line);
  opacity: 0.6;
}

// ── Compartilhar ─────────────────────────────────────────────
.at-profile-share-row {
  display: flex;
  gap: 8px;

  @media (max-width: 640px) {
    flex-wrap: wrap;
  }
}

.at-profile-share-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 12px;
  border-radius: var(--nx-r-2);
  background: var(--nx-surface-1);
  border: 1px solid var(--nx-line-strong);
  color: var(--nx-text-mute);
  font-family: var(--nx-font-mono);
  font-size: 12px;
}

.at-profile-copy-feedback {
  margin: 10px 0 0;
  font-family: var(--nx-font-ui);
  font-size: 12px;
  color: var(--nx-text-dim);
}

// ── Segurança ────────────────────────────────────────────────
.at-profile-security-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--nx-line);

  &:last-of-type {
    border-bottom: none;
  }

  > div {
    flex: 1;
    min-width: 0;

    strong {
      display: block;
      font-family: var(--nx-font-display);
      font-size: 13px;
      color: var(--nx-text);
      margin-bottom: 2px;
    }

    p {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-mute);
    }
  }
}

// ── Feedback ─────────────────────────────────────────────────
.at-profile-feedback {
  font-family: var(--nx-font-ui);
  font-size: 13px;
  padding: 10px 14px;
  border-radius: var(--nx-r-2);
}

.at-profile-feedback--error {
  background: rgba(255, 59, 48, 0.1);
  border: 1px solid rgba(255, 59, 48, 0.28);
  color: var(--nx-live);
}

.at-profile-feedback--success {
  background: rgba(43, 209, 126, 0.1);
  border: 1px solid rgba(43, 209, 126, 0.28);
  color: var(--nx-win);
}
```

- [ ] **Step 4: Build the athlete project**

Run: `cd frontend && npm run build:athlete`
Expected: build succeeds with no TypeScript or template errors. If errors reference `AtPanelShellComponent` inputs, re-check `userLevel` accepts `string | null` (it does — `input<string | null>(null)` in `at-panel-shell.component.ts`).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.scss
git commit -m "feat(athlete): rewrite /perfil as a simple account screen"
```

---

### Task 6: Final verification

**Files:** none (verification only).

**Interfaces:** none — this task exercises everything built in Tasks 1–5.

- [ ] **Step 1: Run the full pure-logic test suite**

Run: `cd frontend && npx ng test athlete --watch=false`
Expected: PASS — includes the specs from Tasks 1–3 plus the pre-existing `app.spec.ts` scaffold test.

- [ ] **Step 2: Production build**

Run: `cd frontend && npm run build:athlete`
Expected: succeeds with no errors or new warnings about unused old wizard fields (there shouldn't be any — nothing else in the app imports the removed `ProfileStepId`/`PublicProfilePreview` types, since they lived only inside the file being rewritten).

- [ ] **Step 3: Manual browser walkthrough**

Run: `cd frontend && npm run start:athlete`, then open the printed local URL (dev mode has `devAuthBypass: true`, so a dev login screen or bypass should get you to `/perfil` without a real Firebase account — follow whatever the existing `entrar` flow does in this environment).

Check, in view mode:
- Avatar initials, name, `@handle · cidade`, sport pill, level pill, and the "Nível N" block with progress bar and "Faltam N XP..." text all render without errors in the console.
- Jogos / Sequência / Ranking stats show either real values or "—" (not a crash) when the underlying Firestore docs don't exist for the dev user.
- Sobre shows the bio or the fallback placeholder text.
- Conquistas shows 4 cards; "Ver todas" expands to all 24 and "Ver menos" collapses back.
- Compartilhar perfil's input shows a `/atletas/...` URL; "Copiar" and "Compartilhar" don't throw.
- Segurança's "Alterar" triggers `sendPasswordReset` (check the console/network tab, don't need a real inbox); "Ativar" is disabled with the "Em breve" tooltip.

Check, after clicking "Editar perfil":
- Form fields are pre-filled from the current view-mode values.
- Sport tabs highlight the current `primarySport`.
- "Cancelar" discards changes and returns to view mode unchanged.
- Editing a field and clicking "Salvar alterações" persists (check the Firestore emulator/console if available, or reload the page and confirm the new values reappear in view mode).

If any check fails, fix the underlying code (not the check) and re-run this step before proceeding.

- [ ] **Step 4: Commit any fixups**

Only if Step 3 required code changes:

```bash
git add frontend/projects/athlete/src/app/profile/
git commit -m "fix(athlete): address manual QA findings on the new /perfil screen"
```

---

## Self-Review Notes

- **Spec coverage:** every in-scope item from the design doc (identity fields, level/XP, stats minus vitórias, achievements, share, security minus MFA enrollment, view/edit toggle, shell wrapping) has a corresponding task. Out-of-scope items (photo upload, MFA enroll, email change, vitórias stat, wizard's advanced fields) are explicitly not implemented anywhere in this plan.
- **No placeholders:** every step has full, real code — no TODOs or "similar to Task N" shortcuts.
- **Type consistency:** `AthleteProfileData`, `GamificationSummaryView`, `LevelProgress`, `AchievementViewModel`/`AchievementDefinition` are defined once (Tasks 1–4) and imported by name everywhere they're consumed (Task 5) — no renamed duplicates.
