# Campos editáveis no perfil do atleta (apelido + estado/cidade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the athlete profile edit form cover every field that's actually editable: add "Apelido" (nickname), and replace the free-text "Cidade, UF" field with two dependent `<select>`s (Estado → Cidade) backed by the IBGE municipality list.

**Architecture:** Port the already-implemented-and-tested `BrLocationsService` from `frontend/projects/organizer/` into `frontend/projects/athlete/` (same code, same test, own copy — no shared lib). Wire it into `athlete-profile-settings.component.ts`'s existing Reactive Form, replacing the single `cityState` control with `state`/`city` controls. Add a `nickname` control reading/writing `users/{uid}.nickname` (already the canonical field elsewhere in the app).

**Tech Stack:** Angular 20 (standalone components, signals, Reactive Forms), Firebase JS SDK (Firestore), Jasmine/Karma.

**Spec:** `docs/superpowers/specs/2026-07-23-athlete-profile-edit-fields-design.md`

## Global Constraints

- Repo root for all commands below: `/Users/silviodionizio/Documents/projects/volley/nexago` (branch `claude/athlete-profile-edit-fields`). Frontend commands run from `frontend/` inside that root.
- No Firestore data model change: `users/{uid}.city`/`.state`/`.nickname` and `athlete_profiles/{uid}.city`/`.state` keep the exact same field names and string types — only the UI that produces the value changes.
- City matching against legacy free-text data is case-insensitive exact match only. No fuzzy matching, no migration script.
- Telefone stays exactly as-is in the "Segurança" card — not touched by this plan.
- `athlete-profile-settings.component.ts` has no existing `.spec.ts` and none of its Firebase-SDK-calling siblings in this codebase do either (confirmed: `athlete-onboarding.component.ts` has none). Verification for Tasks 2–3 is `ng build athlete` (type-check) plus the manual QA checklist in Task 5, not a Jasmine spec — don't invent one that doesn't fit the established pattern.
- `BrLocationsService` (Task 1) is a pure, DI-injectable service with zero Firebase dependency — it DOES get a real Jasmine spec, ported verbatim from the organizer's proven one.

---

### Task 1: Port `BrLocationsService` (UF list + IBGE city lookup) to the athlete portal

**Files:**
- Create: `frontend/projects/athlete/src/app/shared/br-locations/br-locations.model.ts`
- Create: `frontend/projects/athlete/src/app/shared/br-locations/br-locations.service.ts`
- Create: `frontend/projects/athlete/src/app/shared/br-locations/br-locations.service.spec.ts`
- Create (copy): `frontend/projects/athlete/public/data/br-municipalities-by-uf.json`

**Interfaces:**
- Produces: `BrState { sigla: string; name: string }`, `BR_STATES: readonly BrState[]` (27 entries) from `br-locations.model.ts`. `BrLocationsService` (`providedIn: 'root'`) from `br-locations.service.ts`: `states: readonly BrState[]`, `loaded: Signal<boolean>`, `ready: Promise<void>`, `citiesFor(uf: string): string[]`.

- [ ] **Step 1: Write the failing test** — create `frontend/projects/athlete/src/app/shared/br-locations/br-locations.service.spec.ts` with this exact content (ported verbatim from `frontend/projects/organizer/src/app/shared/br-locations/br-locations.service.spec.ts`, already proven there):

```typescript
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrLocationsService } from './br-locations.service';

describe('BrLocationsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    spyOn(globalThis, 'fetch').and.resolveTo({
      json: () => Promise.resolve({ GO: ['Goiânia', 'Anápolis'], SP: ['São Paulo', 'Campinas'] }),
    } as Response);
  });

  it('exposes the 27 Brazilian states', () => {
    const service = TestBed.inject(BrLocationsService);
    expect(service.states.length).toBe(27);
    expect(service.states.find((s) => s.sigla === 'GO')?.name).toBe('Goiás');
  });

  it('loads and caches the municipalities JSON', async () => {
    const service = TestBed.inject(BrLocationsService);
    expect(service.loaded()).toBe(false);
    await service.ready;
    expect(service.loaded()).toBe(true);
    expect(service.citiesFor('GO')).toEqual(['Goiânia', 'Anápolis']);
  });

  it('returns an empty array for an empty or unknown UF', async () => {
    const service = TestBed.inject(BrLocationsService);
    await service.ready;
    expect(service.citiesFor('')).toEqual([]);
    expect(service.citiesFor('XX')).toEqual([]);
  });

  it('normalizes a lowercase or untrimmed UF before lookup', async () => {
    const service = TestBed.inject(BrLocationsService);
    await service.ready;
    expect(service.citiesFor('go')).toEqual(['Goiânia', 'Anápolis']);
    expect(service.citiesFor(' GO ')).toEqual(['Goiânia', 'Anápolis']);
  });

  it('fetches the asset only once', async () => {
    const service = TestBed.inject(BrLocationsService);
    await service.ready;
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith('/data/br-municipalities-by-uf.json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/br-locations.service.spec.ts'`
Expected: build FAILS — `Could not resolve "./br-locations.service"` (the service module doesn't exist yet).

- [ ] **Step 3: Write the model** — create `frontend/projects/athlete/src/app/shared/br-locations/br-locations.model.ts` with this exact content (ported verbatim from the organizer's file):

```typescript
export interface BrState {
  readonly sigla: string;
  readonly name: string;
}

/** Porta de `BrLocationsData.states` (nexago_app/lib/core/location/br_locations_data.dart). */
export const BR_STATES: readonly BrState[] = [
  { sigla: 'AC', name: 'Acre' },
  { sigla: 'AL', name: 'Alagoas' },
  { sigla: 'AP', name: 'Amapá' },
  { sigla: 'AM', name: 'Amazonas' },
  { sigla: 'BA', name: 'Bahia' },
  { sigla: 'CE', name: 'Ceará' },
  { sigla: 'DF', name: 'Distrito Federal' },
  { sigla: 'ES', name: 'Espírito Santo' },
  { sigla: 'GO', name: 'Goiás' },
  { sigla: 'MA', name: 'Maranhão' },
  { sigla: 'MT', name: 'Mato Grosso' },
  { sigla: 'MS', name: 'Mato Grosso do Sul' },
  { sigla: 'MG', name: 'Minas Gerais' },
  { sigla: 'PA', name: 'Pará' },
  { sigla: 'PB', name: 'Paraíba' },
  { sigla: 'PR', name: 'Paraná' },
  { sigla: 'PE', name: 'Pernambuco' },
  { sigla: 'PI', name: 'Piauí' },
  { sigla: 'RJ', name: 'Rio de Janeiro' },
  { sigla: 'RN', name: 'Rio Grande do Norte' },
  { sigla: 'RS', name: 'Rio Grande do Sul' },
  { sigla: 'RO', name: 'Rondônia' },
  { sigla: 'RR', name: 'Roraima' },
  { sigla: 'SC', name: 'Santa Catarina' },
  { sigla: 'SP', name: 'São Paulo' },
  { sigla: 'SE', name: 'Sergipe' },
  { sigla: 'TO', name: 'Tocantins' },
];
```

- [ ] **Step 4: Write the service** — create `frontend/projects/athlete/src/app/shared/br-locations/br-locations.service.ts` with this exact content (ported verbatim from the organizer's file):

```typescript
import { Injectable, computed, signal } from '@angular/core';
import { BR_STATES, type BrState } from './br-locations.model';

const MUNICIPALITIES_ASSET_PATH = '/data/br-municipalities-by-uf.json';

@Injectable({ providedIn: 'root' })
export class BrLocationsService {
  readonly states: readonly BrState[] = BR_STATES;

  private readonly citiesByUf = signal<Record<string, string[]> | null>(null);
  readonly loaded = computed(() => this.citiesByUf() !== null);

  readonly ready: Promise<void> = fetch(MUNICIPALITIES_ASSET_PATH)
    .then((res) => res.json() as Promise<Record<string, string[]>>)
    .then((data) => this.citiesByUf.set(data))
    .catch(() => this.citiesByUf.set({}));

  citiesFor(uf: string): string[] {
    const sigla = uf.trim().toUpperCase();
    if (!sigla) return [];
    return this.citiesByUf()?.[sigla] ?? [];
  }
}
```

- [ ] **Step 5: Copy the IBGE municipalities asset**

Run (from repo root):
```bash
mkdir -p frontend/projects/athlete/public/data
cp frontend/projects/organizer/public/data/br-municipalities-by-uf.json frontend/projects/athlete/public/data/br-municipalities-by-uf.json
```
Expected: `frontend/projects/athlete/public/data/br-municipalities-by-uf.json` exists, ~84KB (same content as the organizer's copy — `angular.json`'s athlete build config already serves `projects/athlete/public/**/*` as static assets, confirmed in Global Constraints research).

- [ ] **Step 6: Run test to verify it passes**

Run (from `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/br-locations.service.spec.ts'`
Expected: `TOTAL: 5 SUCCESS`

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/athlete/src/app/shared/br-locations/ frontend/projects/athlete/public/data/br-municipalities-by-uf.json
git commit -m "feat(athlete): porta BrLocationsService (UF + municípios IBGE) do organizer"
```

---

### Task 2: Add "Apelido" (nickname) to the profile edit form

**Files:**
- Modify: `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts`
- Modify: `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html`

**Interfaces:**
- Consumes: nothing new (this task is self-contained; `users/{uid}.nickname` already exists as a field, written by onboarding).
- Produces: `AthleteProfileData.nickname: string` — Task 3 doesn't touch this field, but keep the interface shape in mind since Task 3 edits the same `AthleteProfileData` block.

- [ ] **Step 1: Add `nickname` to the profile data shape**

In `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts`, change:

```typescript
interface AthleteProfileData {
  fullName: string;
  city: string;
  state: string;
  phoneNumber: string;
  phoneVerified: boolean;
  bio: string;
  publicProfileId: string | null;
  publicProfileEnabled: boolean;
}

const EMPTY_PROFILE: AthleteProfileData = {
  fullName: '',
  city: '',
  state: '',
  phoneNumber: '',
  phoneVerified: false,
  bio: '',
  publicProfileId: null,
  publicProfileEnabled: true,
};
```

to:

```typescript
interface AthleteProfileData {
  fullName: string;
  nickname: string;
  city: string;
  state: string;
  phoneNumber: string;
  phoneVerified: boolean;
  bio: string;
  publicProfileId: string | null;
  publicProfileEnabled: boolean;
}

const EMPTY_PROFILE: AthleteProfileData = {
  fullName: '',
  nickname: '',
  city: '',
  state: '',
  phoneNumber: '',
  phoneVerified: false,
  bio: '',
  publicProfileId: null,
  publicProfileEnabled: true,
};
```

- [ ] **Step 2: Read `nickname` in `loadRemoteProfile()`**

In the same file, in `loadRemoteProfile()`, change:

```typescript
      this.profileState.set({
        fullName,
        city: readString(profileData, ['city']) ?? readString(userData, ['city']) ?? '',
        state: readString(profileData, ['state']) ?? readString(userData, ['state']) ?? '',
        phoneNumber: readString(userData, ['phoneNumber']) ?? '',
        phoneVerified: userData?.['phoneVerified'] === true,
        bio: readString(profileData, ['bio']) ?? '',
```

to:

```typescript
      this.profileState.set({
        fullName,
        nickname: readString(userData, ['nickname']) ?? '',
        city: readString(profileData, ['city']) ?? readString(userData, ['city']) ?? '',
        state: readString(profileData, ['state']) ?? readString(userData, ['state']) ?? '',
        phoneNumber: readString(userData, ['phoneNumber']) ?? '',
        phoneVerified: userData?.['phoneVerified'] === true,
        bio: readString(profileData, ['bio']) ?? '',
```

- [ ] **Step 3: Add the `nickname` form control**

Change:

```typescript
  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    cityState: ['', Validators.required],
    bio: [''],
  });
```

to:

```typescript
  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    nickname: [''],
    cityState: ['', Validators.required],
    bio: [''],
  });
```

(Task 3 replaces `cityState` with `state`/`city` — leave it as-is here so this task's diff stays focused on nickname only.)

- [ ] **Step 4: Populate `nickname` in `startEdit()`**

Change:

```typescript
  protected startEdit(): void {
    const current = this.profileState();
    this.form.reset({
      fullName: current.fullName,
      cityState: joinCityState(current.city, current.state),
      bio: current.bio,
    });
```

to:

```typescript
  protected startEdit(): void {
    const current = this.profileState();
    this.form.reset({
      fullName: current.fullName,
      nickname: current.nickname,
      cityState: joinCityState(current.city, current.state),
      bio: current.bio,
    });
```

- [ ] **Step 5: Write `nickname` in `save()`**

In `save()`, change:

```typescript
      const raw = this.form.getRawValue();
      const { city, state } = splitCityState(raw.cityState);
      const bio = raw.bio.trim();
```

to:

```typescript
      const raw = this.form.getRawValue();
      const { city, state } = splitCityState(raw.cityState);
      const nickname = raw.nickname.trim() || null;
      const bio = raw.bio.trim();
```

Then, in the same `save()`, change the `users` doc `setDoc` call from:

```typescript
        setDoc(
          doc(this.firestore, 'users', uid),
          { fullName: raw.fullName, city, state, roles, hasAthleteRole: true, updatedAt: serverTimestamp() },
          { merge: true },
        ),
```

to:

```typescript
        setDoc(
          doc(this.firestore, 'users', uid),
          { fullName: raw.fullName, nickname, city, state, roles, hasAthleteRole: true, updatedAt: serverTimestamp() },
          { merge: true },
        ),
```

Then, further down in `save()`, change:

```typescript
      this.profileState.update((current) => ({
        ...current,
        fullName: raw.fullName,
        city,
        state,
        bio,
        publicProfileId,
        publicProfileEnabled,
      }));
```

to:

```typescript
      this.profileState.update((current) => ({
        ...current,
        fullName: raw.fullName,
        nickname: nickname ?? '',
        city,
        state,
        bio,
        publicProfileId,
        publicProfileEnabled,
      }));
```

- [ ] **Step 6: Add the "Apelido" field to the template**

In `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html`, change:

```html
                <label class="at-field">
                  <span>Nome completo</span>
                  <input type="text" formControlName="fullName" placeholder="Ex.: Marcelo Antunes" />
                </label>

                <label class="at-field">
                  <span>Cidade</span>
```

to:

```html
                <label class="at-field">
                  <span>Nome completo</span>
                  <input type="text" formControlName="fullName" placeholder="Ex.: Marcelo Antunes" />
                </label>

                <label class="at-field">
                  <span>Apelido</span>
                  <input type="text" formControlName="nickname" placeholder="Como prefere ser chamado" />
                  <small class="at-field-hint">Opcional — aparece no seu perfil público em vez do nome completo.</small>
                </label>

                <label class="at-field">
                  <span>Cidade</span>
```

- [ ] **Step 7: Verify — build**

Run (from `frontend/`): `npx ng build athlete`
Expected: `Application bundle generation complete.` with no `TS` errors (pre-existing SCSS budget warnings on unrelated files are fine).

- [ ] **Step 8: Commit**

```bash
git add frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html
git commit -m "feat(athlete): apelido editável na tela de perfil"
```

---

### Task 3: Replace free-text city/state with UF → Cidade selects

**Files:**
- Modify: `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts`
- Modify: `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html`
- Modify: `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.scss`

**Interfaces:**
- Consumes: `BrLocationsService` (Task 1) — `states`, `loaded()`, `ready`, `citiesFor(uf)`.
- Produces: nothing new for later tasks (Task 4 only touches `profile-format.ts`, not this component).

- [ ] **Step 1: Import `BrLocationsService`, drop `splitCityState` from the `profile-format` import**

Change:

```typescript
import { buildPublicProfileId, buildSportLevels, initialsOf, joinCityState, nameFromEmail, slugify, splitCityState, type SportLevelEntry } from './profile-format';
```

to:

```typescript
import { buildPublicProfileId, buildSportLevels, initialsOf, joinCityState, nameFromEmail, slugify, type SportLevelEntry } from './profile-format';
```

Then add this import line right after the `PhoneVerificationComponent` import:

```typescript
import { PhoneVerificationComponent } from '../shared/phone-verification/phone-verification.component';
import { BrLocationsService } from '../shared/br-locations/br-locations.service';
```

- [ ] **Step 2: Inject the service and add a `cityOptions` signal**

Change:

```typescript
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);
  protected readonly gamification = inject(AthleteGamificationService);
  private readonly firestore = createFirestore();
```

to:

```typescript
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);
  protected readonly gamification = inject(AthleteGamificationService);
  protected readonly brLocations = inject(BrLocationsService);
  private readonly firestore = createFirestore();
```

Then, next to `protected readonly changingPhone = signal(false);`, add:

```typescript
  protected readonly changingPhone = signal(false);
  protected readonly cityOptions = signal<string[]>([]);
```

- [ ] **Step 3: Replace the `cityState` control with `state`/`city`**

Change:

```typescript
  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    nickname: [''],
    cityState: ['', Validators.required],
    bio: [''],
  });
```

to:

```typescript
  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    nickname: [''],
    state: ['', Validators.required],
    city: ['', Validators.required],
    bio: [''],
  });
```

- [ ] **Step 4: Add `onStateSelected` and rewrite `startEdit()` to populate/match city options**

Change:

```typescript
  protected startEdit(): void {
    const current = this.profileState();
    this.form.reset({
      fullName: current.fullName,
      nickname: current.nickname,
      cityState: joinCityState(current.city, current.state),
      bio: current.bio,
    });
    this.saveError.set(null);
    this.saveSuccess.set(null);
    this.isEditing.set(true);
  }
```

to:

```typescript
  protected async startEdit(): Promise<void> {
    const current = this.profileState();
    this.form.reset({
      fullName: current.fullName,
      nickname: current.nickname,
      state: current.state,
      city: '',
      bio: current.bio,
    });
    this.cityOptions.set(this.brLocations.citiesFor(current.state));
    this.saveError.set(null);
    this.saveSuccess.set(null);
    this.isEditing.set(true);

    await this.brLocations.ready;
    const cities = this.brLocations.citiesFor(current.state);
    this.cityOptions.set(cities);
    const matched = cities.find((c) => c.toLowerCase() === current.city.trim().toLowerCase());
    this.form.patchValue({ city: matched ?? '' });
  }

  protected onStateSelected(uf: string): void {
    this.form.patchValue({ state: uf, city: '' });
    this.cityOptions.set(this.brLocations.citiesFor(uf));
  }
```

(`current.city`/`current.state` here are the values loaded in `loadRemoteProfile()` — unchanged by this task, still free-text legacy values until re-saved through the new selects.)

- [ ] **Step 5: Update `save()` to read `state`/`city` directly (no more splitting)**

Change:

```typescript
      const raw = this.form.getRawValue();
      const { city, state } = splitCityState(raw.cityState);
      const nickname = raw.nickname.trim() || null;
      const bio = raw.bio.trim();
```

to:

```typescript
      const raw = this.form.getRawValue();
      const { city, state } = raw;
      const nickname = raw.nickname.trim() || null;
      const bio = raw.bio.trim();
```

- [ ] **Step 6: Replace the "Cidade" text input with UF + Cidade selects**

In `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html`, change:

```html
                <label class="at-field">
                  <span>Cidade</span>
                  <input type="text" formControlName="cityState" placeholder="Ex.: Aparecida de Goiânia, GO" />
                </label>
```

to:

```html
                <label class="at-field">
                  <span>Estado</span>
                  <select formControlName="state" (change)="onStateSelected($any($event.target).value)">
                    <option value="">Selecione</option>
                    @for (s of brLocations.states; track s.sigla) {
                      <option [value]="s.sigla">{{ s.name }} ({{ s.sigla }})</option>
                    }
                  </select>
                </label>

                <label class="at-field">
                  <span>Cidade</span>
                  <select formControlName="city">
                    <option value="">
                      {{ !form.controls.state.value ? 'Selecione o estado primeiro' : (brLocations.loaded() ? 'Selecione' : 'Carregando…') }}
                    </option>
                    @for (c of cityOptions(); track c) {
                      <option [value]="c">{{ c }}</option>
                    }
                  </select>
                </label>
```

- [ ] **Step 7: Style `select` the same as `input`/`textarea` in `.at-field`**

In `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.scss`, change:

```scss
.at-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--nx-font-ui);
  font-size: 12px;
  color: var(--nx-text-mute);

  input,
  textarea {
```

to:

```scss
.at-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: var(--nx-font-ui);
  font-size: 12px;
  color: var(--nx-text-mute);

  input,
  select,
  textarea {
```

- [ ] **Step 8: Verify — build**

Run (from `frontend/`): `npx ng build athlete`
Expected: `Application bundle generation complete.` with no `TS` errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.scss
git commit -m "feat(athlete): estado/cidade por select (UF -> cidade) no perfil"
```

---

### Task 4: Remove dead `splitCityState` (unused after Task 3)

**Files:**
- Modify: `frontend/projects/athlete/src/app/profile/profile-format.ts`
- Modify: `frontend/projects/athlete/src/app/profile/profile-format.spec.ts`

**Interfaces:**
- Consumes: nothing (cleanup only).
- Produces: nothing (no other file imports `splitCityState` after Task 3 — verified by Step 1 below).

- [ ] **Step 1: Confirm nothing else uses `splitCityState`**

Run (from repo root): `grep -rn "splitCityState" frontend/projects/athlete/src`
Expected output: only the definition in `profile-format.ts` and its tests in `profile-format.spec.ts` (no call sites left — `athlete-profile-settings.component.ts` stopped calling it in Task 3, Step 5).

- [ ] **Step 2: Remove the function**

In `frontend/projects/athlete/src/app/profile/profile-format.ts`, delete:

```typescript
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

```

(leave `joinCityState` — still used by `cityStateLabel` for read-only display.)

- [ ] **Step 3: Remove its import and tests**

In `frontend/projects/athlete/src/app/profile/profile-format.spec.ts`, change the import line from:

```typescript
import { athleteLevelLabel, buildPublicProfileId, buildSportLevels, initialsOf, joinCityState, nameFromEmail, slugify, splitCityState, titleCase } from './profile-format';
```

to:

```typescript
import { athleteLevelLabel, buildPublicProfileId, buildSportLevels, initialsOf, joinCityState, nameFromEmail, slugify, titleCase } from './profile-format';
```

Then delete this whole block:

```typescript
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

```

- [ ] **Step 4: Run the remaining `profile-format` tests to verify nothing broke**

Run (from `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/profile-format.spec.ts'`
Expected: all remaining tests pass (no `splitCityState` failures — it's gone from both the source and the spec).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/profile/profile-format.ts frontend/projects/athlete/src/app/profile/profile-format.spec.ts
git commit -m "refactor(athlete): remove splitCityState morto após selects de estado/cidade"
```

---

### Task 5: Full verification + manual QA

**Files:** none (verification only).

- [ ] **Step 1: Full frontend test suite**

Run (from `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: all tests pass (baseline was 101 before this plan; expect 101 + 5 new `BrLocationsService` tests − 4 removed `splitCityState` tests = 102).

- [ ] **Step 2: Full build**

Run (from `frontend/`): `npx ng build athlete`
Expected: clean build, same pre-existing SCSS budget warnings as before this plan (unrelated files), no new ones.

- [ ] **Step 3: Manual QA checklist** (run the app — `ng serve athlete` or deployed dev — log in as an athlete with an existing profile)

1. Open `/perfil`, click "Editar". Confirm "Apelido" field shows the current nickname (or is empty if never set).
2. Type a nickname, save. Reload the page — confirm the nickname persisted (re-opening "Editar" shows it again).
3. With a profile that has a legacy free-text city (e.g. "Aparecida de Goiânia, GO" from before this change), open "Editar" — confirm Estado shows "Goiás (GO)" pre-selected and, once the city list finishes loading, Cidade shows "Aparecida de Goiânia" pre-selected (exact-match case).
4. Change Estado to a different state — confirm Cidade resets to "Selecione" and only lists cities from the new state.
5. Pick a city, save. Reload — confirm both persisted correctly (check the read-only view under `cityStateLabel()`, e.g. "Recife, PE").
6. Test the legacy-mismatch case: manually set a test account's `city` to a string that doesn't exist in any UF's list (e.g. via Firestore console, `city: "Cidade Que Não Existe"`), open "Editar" — confirm Cidade opens on "Selecione" (empty), not stuck loading or crashing.
7. Confirm the "Segurança" card (telefone, senha) is untouched — still works exactly as before this plan.

- [ ] **Step 4: Report results** — if any manual QA step fails, do not mark this task complete; open a follow-up task describing the exact failure instead of patching ad hoc.
