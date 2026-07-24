# Máscaras de WhatsApp e data de nascimento + calendário nativo no onboarding do atleta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the athlete web onboarding's "Perfil básico" step (step 4/4), make the WhatsApp field auto-format as `(00) 00000-0000` while typing, make the birth date field auto-format as `dd/mm/aaaa` while typing, and add a calendar button that opens the browser's native date picker as a shortcut for manual typing.

**Architecture:** Pure formatting functions (no new dependency), same hand-written-formatter approach the Flutter app already uses (`BrPhoneInputFormatter`/`BrDateInputFormatter`). The WhatsApp mask lives in the shared `PhoneVerificationComponent` (used by both onboarding and the profile screen's "change number" flow). The birth date mask + native picker live in `AthleteOnboardingComponent`, the only place that field exists.

**Tech Stack:** Angular 20 (standalone components, signals), Jasmine/Karma, native `<input type="date">` + `HTMLInputElement.showPicker()`.

**Spec:** `docs/superpowers/specs/2026-07-24-onboarding-mascara-whatsapp-nascimento-design.md`

## Global Constraints

- Repo root for all commands below: `/Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/arena/.claude/worktrees/intelligent-tharp-15b2ed` (git worktree, branch `claude/atleta-profile-masks-calendar-c50986`). **This is a worktree, not the primary checkout** — if a task is executed by a fresh subagent, that agent does not automatically inherit this worktree; it must `cd` into this exact path (or run `EnterWorktree`) and confirm `git branch --show-current` prints `claude/atleta-profile-masks-calendar-c50986` before touching any file. Frontend commands below run from `frontend/` inside that root.
- No new npm dependency. No `ngx-mask`, `imask`, or equivalent — pure formatting functions only, matching the Flutter app's own hand-written `TextInputFormatter`s (`nexago_app/lib/features/athlete/onboarding/presentation/utils/onboarding_input_formatters.dart`) and this repo's existing convention of pure validator functions in `onboarding-validators.ts`.
- Scope is only `frontend/projects/athlete`'s onboarding flow. Do not touch `nexago_app` (Flutter), `frontend/projects/arena`, `frontend/projects/organizer`, or `athlete-profile-settings.component.ts` — the only allowed side effect on the profile screen is the WhatsApp mask arriving "for free" through the shared `PhoneVerificationComponent`.
- No validation or data-model change: `validateBirthDate`, `validatePhone`, `birthDateBrToIso`, `normalizeBrMobile`, `isValidPhoneNumber`, `toE164BR` keep their exact current behavior. Masking only changes what's displayed in the input, not what gets validated/persisted (both already normalize by stripping non-digits).
- Known, accepted limitation: because both masked inputs are re-rendered via `[value]="signal()"` on every keystroke, the cursor jumps to the end of the string after each character. This matches the Flutter app's own behavior today and is fine for sequential digit entry (nobody edits a phone/date mid-string) — do not attempt to preserve cursor position, that's out of scope.
- `athlete-onboarding.component.ts` and `phone-verification.component.ts` have no existing `.spec.ts`, and no component in this codebase that depends on Firebase Auth/Firestore/Router injection has one either (confirmed: only `location-map.component.spec.ts` exists as a component-level spec in this project, and it has zero Firebase dependencies). Verification for the wiring tasks (3 and 4) is `ng build athlete` (full compile, catches template errors) plus the manual QA checklist in Task 5 — don't invent a TestBed spec that doesn't fit the established pattern.
- Baseline test count before this plan: **102** (`npx ng test athlete --watch=false --browsers=ChromeHeadless`, confirmed passing on `main` before this branch's work).

---

### Task 1: Birth date mask + ISO↔BR conversion + native-picker date bounds (pure functions)

**Files:**
- Modify: `frontend/projects/athlete/src/app/onboarding/onboarding-validators.ts`
- Test: `frontend/projects/athlete/src/app/onboarding/onboarding-validators.spec.ts`

**Interfaces:**
- Produces: `formatBirthDateMask(raw: string): string`, `birthDateIsoToBr(iso: string): string`, `maxNativeBirthDateIso(today?: Date): string`, `MIN_NATIVE_BIRTH_DATE_ISO: string` — all consumed by Task 4 (`athlete-onboarding.component.ts`).

- [ ] **Step 1: Write the failing tests**

Edit `frontend/projects/athlete/src/app/onboarding/onboarding-validators.spec.ts`. Replace the import block at the top (lines 1-8):

```typescript
import {
  MIN_AGE_YEARS,
  ageOn,
  birthDateBrToIso,
  normalizeBrMobile,
  validateBirthDate,
  validatePhone,
} from './onboarding-validators';
```

with:

```typescript
import {
  MIN_AGE_YEARS,
  MIN_NATIVE_BIRTH_DATE_ISO,
  ageOn,
  birthDateBrToIso,
  birthDateIsoToBr,
  formatBirthDateMask,
  maxNativeBirthDateIso,
  normalizeBrMobile,
  validateBirthDate,
  validatePhone,
} from './onboarding-validators';
```

Then append these four `describe` blocks at the end of the file (after the closing `});` of the existing `describe('normalizeBrMobile', ...)` block):

```typescript
describe('formatBirthDateMask', () => {
  it('insere as barras nas posições 2 e 4 conforme os dígitos chegam', () => {
    expect(formatBirthDateMask('1')).toBe('1');
    expect(formatBirthDateMask('15')).toBe('15');
    expect(formatBirthDateMask('150')).toBe('15/0');
    expect(formatBirthDateMask('1503')).toBe('15/03');
    expect(formatBirthDateMask('15031990')).toBe('15/03/1990');
  });

  it('ignora tudo que não é dígito', () => {
    expect(formatBirthDateMask('15/03/1990')).toBe('15/03/1990');
    expect(formatBirthDateMask('ab15cd03ef1990')).toBe('15/03/1990');
  });

  it('limita a 8 dígitos (dd/mm/aaaa)', () => {
    expect(formatBirthDateMask('150319909999')).toBe('15/03/1990');
  });

  it('devolve string vazia para entrada vazia', () => {
    expect(formatBirthDateMask('')).toBe('');
  });
});

describe('birthDateIsoToBr', () => {
  it('converte o valor do <input type="date"> nativo pro formato do campo mascarado', () => {
    expect(birthDateIsoToBr('1990-03-15')).toBe('15/03/1990');
  });
});

describe('maxNativeBirthDateIso', () => {
  const HOJE = new Date(2026, 6, 23); // 23/07/2026

  it(`retorna hoje menos ${MIN_AGE_YEARS} anos, em ISO`, () => {
    expect(maxNativeBirthDateIso(HOJE)).toBe('2013-07-23');
  });
});

describe('MIN_NATIVE_BIRTH_DATE_ISO', () => {
  it('é 1º de janeiro do ano mínimo aceito', () => {
    expect(MIN_NATIVE_BIRTH_DATE_ISO).toBe('1900-01-01');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/onboarding-validators.spec.ts'`
Expected: build error — `Module '"./onboarding-validators"' has no exported member 'formatBirthDateMask'` (and similarly for the other three new names), since they don't exist yet.

- [ ] **Step 3: Implement the functions**

Edit `frontend/projects/athlete/src/app/onboarding/onboarding-validators.ts`. Insert the following immediately after the `birthDateBrToIso` function's closing brace (after line 42, before the `/** Idade completa em anos na data de referência. */` comment that precedes `ageOn`):

```typescript
/** Data mínima aceita pelo `<input type="date">` nativo — mesmo piso de `MIN_BIRTH_YEAR`. */
export const MIN_NATIVE_BIRTH_DATE_ISO = `${MIN_BIRTH_YEAR}-01-01`;

/** Data máxima aceita pelo `<input type="date">` nativo — hoje menos `MIN_AGE_YEARS`,
 *  mesmo piso de idade mínima usado em `validateBirthDate`. Formato ISO (`YYYY-MM-DD`). */
export function maxNativeBirthDateIso(today: Date = new Date()): string {
  const year = today.getFullYear() - MIN_AGE_YEARS;
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Aplica a máscara `dd/mm/aaaa` enquanto o atleta digita — mesma lógica do
 *  `BrDateInputFormatter` do Flutter (`onboarding_input_formatters.dart`), portada
 *  pra manter paridade entre os dois clientes. */
export function formatBirthDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === 2 || i === 4) result += '/';
    result += digits[i];
  }
  return result;
}

/** `YYYY-MM-DD` (valor do `<input type="date">` nativo) → `dd/mm/aaaa` (formato do campo mascarado). */
export function birthDateIsoToBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/onboarding-validators.spec.ts'`
Expected: `TOTAL: 27 SUCCESS` (20 existing + 7 new: 4 for `formatBirthDateMask`, 1 for `birthDateIsoToBr`, 1 for `maxNativeBirthDateIso`, 1 for `MIN_NATIVE_BIRTH_DATE_ISO`).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/onboarding/onboarding-validators.ts frontend/projects/athlete/src/app/onboarding/onboarding-validators.spec.ts
git commit -m "feat(athlete): máscara e conversão de data de nascimento no onboarding"
```

---

### Task 2: WhatsApp mask (pure function)

**Files:**
- Modify: `frontend/projects/athlete/src/app/shared/phone-verification/phone-verification.util.ts`
- Test: `frontend/projects/athlete/src/app/shared/phone-verification/phone-verification.util.spec.ts`

**Interfaces:**
- Produces: `formatBrPhoneMask(raw: string): string` — consumed by Task 3 (`phone-verification.component.ts`).

- [ ] **Step 1: Write the failing test**

Append this `describe` block to the end of `frontend/projects/athlete/src/app/shared/phone-verification/phone-verification.util.spec.ts`:

```typescript
describe('formatBrPhoneMask', () => {
  it('monta a máscara de celular (00) 00000-0000 progressivamente, enquanto digita', () => {
    expect(formatBrPhoneMask('1')).toBe('(1');
    expect(formatBrPhoneMask('11')).toBe('(11) ');
    expect(formatBrPhoneMask('119')).toBe('(11) 9');
    expect(formatBrPhoneMask('1198765')).toBe('(11) 98765');
    expect(formatBrPhoneMask('11987654')).toBe('(11) 98765-4');
    expect(formatBrPhoneMask('11987654321')).toBe('(11) 98765-4321');
  });

  it('monta a máscara de fixo (00) 0000-0000 quando não começa com 9 depois do DDD', () => {
    expect(formatBrPhoneMask('1134567890')).toBe('(11) 3456-7890');
  });

  it('ignora tudo que não é dígito e limita a 11 dígitos', () => {
    expect(formatBrPhoneMask('(11) 98765-4321')).toBe('(11) 98765-4321');
    expect(formatBrPhoneMask('11987654321999')).toBe('(11) 98765-4321');
  });

  it('devolve string vazia para entrada vazia', () => {
    expect(formatBrPhoneMask('')).toBe('');
  });
});
```

And update the top import line from:

```typescript
import { isValidPhoneNumber, phoneLinkMethod, toE164BR } from './phone-verification.util';
```

to:

```typescript
import { formatBrPhoneMask, isValidPhoneNumber, phoneLinkMethod, toE164BR } from './phone-verification.util';
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/phone-verification.util.spec.ts'`
Expected: build error — `Module '"./phone-verification.util"' has no exported member 'formatBrPhoneMask'`.

- [ ] **Step 3: Implement the function**

Append this to the end of `frontend/projects/athlete/src/app/shared/phone-verification/phone-verification.util.ts` (after the `phoneLinkMethod` function):

```typescript
/** Formata dígitos digitados como celular/fixo BR: `(00) 00000-0000` (celular, 9 dígitos
 *  depois do DDD) ou `(00) 0000-0000` (fixo, ainda digitando) — puramente visual, mesma
 *  lógica do `BrPhoneInputFormatter` do Flutter (`onboarding_input_formatters.dart`),
 *  portada pra manter paridade entre os dois clientes. Não valida DDD/9 — isso é
 *  `validatePhone`, em `onboarding-validators.ts`. */
export function formatBrPhoneMask(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length > 11) digits = digits.slice(0, 11);

  const ddd = digits.length >= 2 ? digits.slice(0, 2) : digits;
  let result = `(${ddd}`;
  if (digits.length >= 2) result += ') ';
  if (digits.length <= 2) return result;

  const rest = digits.slice(2);
  const splitAt = rest.startsWith('9') ? 5 : 4;
  if (rest.length <= splitAt) return result + rest;

  const suffixEnd = Math.min(Math.max(rest.length, splitAt), splitAt + 4);
  return result + rest.slice(0, splitAt) + '-' + rest.slice(splitAt, suffixEnd);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/phone-verification.util.spec.ts'`
Expected: `TOTAL: 13 SUCCESS` (9 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/shared/phone-verification/phone-verification.util.ts frontend/projects/athlete/src/app/shared/phone-verification/phone-verification.util.spec.ts
git commit -m "feat(athlete): máscara de WhatsApp (celular/fixo BR)"
```

---

### Task 3: Wire the WhatsApp mask into `PhoneVerificationComponent`

**Files:**
- Modify: `frontend/projects/athlete/src/app/shared/phone-verification/phone-verification.component.ts:5,54-56`

**Interfaces:**
- Consumes: `formatBrPhoneMask(raw: string): string` from Task 2.

- [ ] **Step 1: Wire the mask into `setPhone`**

In `frontend/projects/athlete/src/app/shared/phone-verification/phone-verification.component.ts`, change line 5 from:

```typescript
import { isValidPhoneNumber } from './phone-verification.util';
```

to:

```typescript
import { formatBrPhoneMask, isValidPhoneNumber } from './phone-verification.util';
```

Then change the `setPhone` method (lines 54-56) from:

```typescript
  protected setPhone(value: string): void {
    this.phone.set(value);
  }
```

to:

```typescript
  protected setPhone(value: string): void {
    this.phone.set(formatBrPhoneMask(value));
  }
```

No template change needed — `phone-verification.component.html:14` already calls `(input)="setPhone($any($event.target).value)"`.

- [ ] **Step 2: Verify the app still compiles**

Run (from `frontend/`): `npx ng build athlete --configuration development`
Expected: `Application bundle generation complete.` — no TypeScript errors. (This is a full-app compile, the right check here since neither this component nor its consumers have a `.spec.ts` — see Global Constraints.)

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/athlete/src/app/shared/phone-verification/phone-verification.component.ts
git commit -m "feat(athlete): aplica máscara de WhatsApp no campo de telefone"
```

---

### Task 4: Birth date mask + native calendar button in the onboarding "Perfil básico" step

**Files:**
- Modify: `frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.ts:13,99,110`
- Modify: `frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.html:193-201`
- Modify: `frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.scss` (after line 302)

**Interfaces:**
- Consumes: `formatBirthDateMask`, `birthDateIsoToBr`, `maxNativeBirthDateIso`, `MIN_NATIVE_BIRTH_DATE_ISO` from Task 1.

- [ ] **Step 1: Update imports**

In `frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.ts`, change line 13 from:

```typescript
import { birthDateBrToIso, validateBirthDate } from './onboarding-validators';
```

to:

```typescript
import {
  MIN_NATIVE_BIRTH_DATE_ISO,
  birthDateBrToIso,
  birthDateIsoToBr,
  formatBirthDateMask,
  maxNativeBirthDateIso,
  validateBirthDate,
} from './onboarding-validators';
```

- [ ] **Step 2: Add the native-picker bounds and the hidden-input `viewChild`**

Change line 99 from:

```typescript
  protected readonly birthDateInput = signal('');
```

to:

```typescript
  protected readonly birthDateInput = signal('');
  protected readonly birthDateNativeMin = MIN_NATIVE_BIRTH_DATE_ISO;
  protected readonly birthDateNativeMax = maxNativeBirthDateIso();
```

Change line 110 (`private photoObjectUrl: string | null = null;` is on line 111 — the `viewChild` for `photoInput` is on line 110) from:

```typescript
  private readonly photoInput = viewChild<ElementRef<HTMLInputElement>>('photoInput');
```

to:

```typescript
  private readonly photoInput = viewChild<ElementRef<HTMLInputElement>>('photoInput');
  private readonly birthDateNativeInput = viewChild<ElementRef<HTMLInputElement>>('birthDateNative');
```

- [ ] **Step 3: Add the handler methods**

Immediately after the `onPhoneVerified` method (after its closing brace, currently ending at line 170, before `protected goToStep`), add:

```typescript
  protected onBirthDateInputChanged(value: string): void {
    this.birthDateInput.set(formatBirthDateMask(value));
  }

  protected openBirthDatePicker(): void {
    const input = this.birthDateNativeInput()?.nativeElement;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        // Navegador recusou (ex.: fora de gesto do usuário) — cai no fallback abaixo.
      }
    }
    input.click();
  }

  protected onBirthDateNativeChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) return;
    this.birthDateInput.set(birthDateIsoToBr(value));
  }
```

- [ ] **Step 4: Update the template**

In `frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.html`, replace lines 193-201:

```html
          <label class="nx-field">
            <span class="nx-field-label">Data de nascimento *</span>
            <span class="nx-field-box" [class.nx-field-box--error]="birthDateError()">
              <input type="text" [value]="birthDateInput()" (input)="birthDateInput.set($any($event.target).value)" placeholder="dd/mm/aaaa" />
            </span>
            @if (birthDateError(); as e) {
              <span class="nx-field-msg nx-field-msg--error">{{ e }}</span>
            }
          </label>
```

with:

```html
          <label class="nx-field">
            <span class="nx-field-label">Data de nascimento *</span>
            <span class="nx-field-box" [class.nx-field-box--error]="birthDateError()">
              <input
                type="text"
                inputmode="numeric"
                [value]="birthDateInput()"
                (input)="onBirthDateInputChanged($any($event.target).value)"
                placeholder="dd/mm/aaaa"
                maxlength="10"
              />
              <button type="button" (click)="openBirthDatePicker()" aria-label="Escolher data no calendário">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
              <input
                #birthDateNative
                type="date"
                class="ob-native-date-input"
                [attr.min]="birthDateNativeMin"
                [attr.max]="birthDateNativeMax"
                (change)="onBirthDateNativeChange($event)"
              />
            </span>
            @if (birthDateError(); as e) {
              <span class="nx-field-msg nx-field-msg--error">{{ e }}</span>
            }
          </label>
```

- [ ] **Step 5: Hide the native date input visually (keep it in the DOM so `showPicker()` works)**

In `frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.scss`, insert this immediately after the `.ob-photo-input` rule (after its closing `}` on line 302, before `.ob-photo-placeholder,`):

```scss
.ob-native-date-input {
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
```

(Identical pattern to the existing `.ob-photo-input` rule two blocks above it — reused on purpose for consistency.)

- [ ] **Step 6: Verify the app compiles**

Run (from `frontend/`): `npx ng build athlete --configuration development`
Expected: `Application bundle generation complete.` — no TypeScript or template errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.ts frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.html frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.scss
git commit -m "feat(athlete): máscara de data de nascimento + botão de calendário nativo no onboarding"
```

---

### Task 5: Full verification + manual QA

**Files:** none (verification only).

- [ ] **Step 1: Full frontend test suite**

Run (from `frontend/`): `npx ng test athlete --watch=false --browsers=ChromeHeadless`
Expected: all tests pass. Baseline was 102 before this plan; expect **113** (102 + 7 from Task 1 + 4 from Task 2).

- [ ] **Step 2: Full production build**

Run (from `frontend/`): `npx ng build athlete`
Expected: clean build, same pre-existing bundle-size/budget warnings as before this plan (unrelated files), no new ones.

- [ ] **Step 3: Manual QA checklist** (run `ng serve athlete` from `frontend/`, open the app in a browser)

1. Go to `/cadastro` and create a throwaway test account (or log in with an existing athlete account that hasn't finished onboarding). Progress through onboarding steps 1→2→3 to reach step 4, "Perfil básico".
2. In the WhatsApp field, type `11987654321` one digit at a time — confirm it formats live as `(11) 98765-4321` (not just after losing focus).
3. In the WhatsApp field, type a fixed-line number like `1134567890` — confirm it formats as `(11) 3456-7890`.
4. In the Data de nascimento field, type `15031990` one digit at a time — confirm it formats live as `15/03/1990`.
5. Click the calendar icon next to the Data de nascimento field — confirm the browser's native date picker opens (system calendar UI, not a custom in-app widget).
6. In the native picker, confirm you cannot pick a date less than 13 years ago or before the year 1900 (the picker itself should restrict/grey these out, per its `min`/`max`).
7. Pick a valid date (e.g. an adult birth date) in the native picker — confirm the text field updates to show it as `dd/mm/aaaa` and the red error message (if any was showing) clears.
8. Complete the rest of step 4 (nome, gênero) and submit — confirm the profile saves successfully and step 5 ("Tudo pronto") shows up, i.e. this change didn't break the existing submit flow.
9. Open the browser console — confirm no new errors or warnings were introduced by this change.
10. Separately, open `/perfil` on an existing athlete account and start a phone-number change (if that flow is reachable in your test environment) — confirm the WhatsApp field there also shows the live mask (it reuses `PhoneVerificationComponent`, so this should come for free from Task 3).

- [ ] **Step 4: Report results** — if any manual QA step fails, do not mark this task complete; open a follow-up task describing the exact failure instead of patching ad hoc.
