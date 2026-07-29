# Nível de Habilidade por Modalidade no Perfil do Atleta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar o nível de habilidade real (Iniciante 1 → Open) por modalidade esportiva na tela `/perfil` do atleta web, substituindo a pill de nível hoje incorretamente ligada ao nível de XP/gamificação.

**Architecture:** Duas funções puras novas — um catálogo de esportes (código Firestore → rótulo em PT) e um resolvedor de nível por modalidade — alimentam dois computeds novos em `AthleteProfileSettingsComponent`, lidos a partir de dados que o componente já busca hoje (`users/{uid}`). Essas funções substituem a pill de esporte/nível existente e adicionam uma lista opcional de modalidades secundárias. O formulário de edição perde o seletor de esporte (ficaria sem efeito, já que a pill não lê mais o campo que ele grava) e ganha uma linha somente-leitura equivalente.

**Tech Stack:** Angular standalone components + signals, TypeScript strict, Firebase/Firestore JS SDK (client), Karma + Jasmine para testes unitários.

**Spec:** `docs/superpowers/specs/2026-07-22-nivel-habilidade-perfil-atleta-design.md`

## Global Constraints

- Escada oficial de nível (nunca introduzir "Avançado"/"Profissional" como tier novo): `iniciante_1` < `iniciante_2` < `intermediario_1` < `intermediario_2` < `open`, rotulados "Iniciante 1", "Iniciante 2", "Intermediário 1", "Intermediário 2", "Open".
- Fonte de esporte/nível: `users/{uid}.sportOnboarding.{primarySportId, secondarySportIds, levelsBySport}` — nunca `athlete_profiles/{uid}.primarySport` (texto livre, sendo removido desta tela).
- Nenhuma mudança em `firestore.rules` ou em `functions/` — confirmado que `athlete_profiles` não exige o campo `primarySport` na escrita.
- Sem cor por tier de nível — manter a pill neutra (`.at-pill`), consistente com as outras telas que já mostram nível (perfil público, diretório de atletas).
- Nível de XP/gamificação (`levelLabel()`, barra de progresso, `userLevel` do `AtPanelShellComponent`) não muda em nenhuma task deste plano.
- **Baseline de testes antes desta mudança:** rodando `cd frontend && npx ng test athlete --watch=false` a partir de `/Users/silviodionizio/Documents/projects/volley/nexago`, o resultado é `TOTAL: 1 FAILED, 55 SUCCESS` (56 specs no total). A falha pré-existente é `profile-format athleteLevelLabel converts Firestore level codes to display labels` (`profile-format.spec.ts:74-81`), porque `LEVEL_CODE_TO_LABEL` não cobre os códigos legados sem sufixo (`iniciante`, `basico`, `intermediario`). **Essa falha não foi causada por este trabalho.** A Task 2 abaixo a corrige como efeito direto (o fallback de nível legado que estamos adicionando alimenta a mesma função com esses códigos) — nenhuma outra task deve se preocupar com ela antes da Task 2, nem tentar consertá-la de novo depois.
- Todos os comandos abaixo assumem cwd `/Users/silviodionizio/Documents/projects/volley/nexago/frontend` a menos que indicado.

---

## Task 1: Catálogo de esportes compartilhado (`sport-catalog.ts`)

**Files:**
- Create: `frontend/projects/athlete/src/app/data/sport-catalog.ts`
- Create: `frontend/projects/athlete/src/app/data/sport-catalog.spec.ts`
- Modify: `frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.ts`

**Interfaces:**
- Produces: `SportCatalogEntry { code: string; label: string; icon: 'ball' | 'racket' | 'running' | 'plus' }`, `SPORT_CATALOG: readonly SportCatalogEntry[]` (8 entradas, códigos `VOLEI_PRAIA`, `VOLEI_QUADRA`, `FUTEBOL`, `BASQUETE`, `TENIS`, `BEACH_TENNIS`, `CORRIDA`, `OUTROS`, nessa ordem), `sportLabelForCode(code: string): string` — todos exportados de `frontend/projects/athlete/src/app/data/sport-catalog.ts`.
- Consumes: nada (função pura, standalone).

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/athlete/src/app/data/sport-catalog.spec.ts`:

```typescript
import { SPORT_CATALOG, sportLabelForCode } from './sport-catalog';

describe('sport-catalog', () => {
  describe('SPORT_CATALOG', () => {
    it('includes the 8 sports used by onboarding, in a stable order', () => {
      expect(SPORT_CATALOG.map((entry) => entry.code)).toEqual([
        'VOLEI_PRAIA',
        'VOLEI_QUADRA',
        'FUTEBOL',
        'BASQUETE',
        'TENIS',
        'BEACH_TENNIS',
        'CORRIDA',
        'OUTROS',
      ]);
    });
  });

  describe('sportLabelForCode', () => {
    it('returns the Portuguese label for a known code', () => {
      expect(sportLabelForCode('VOLEI_PRAIA')).toBe('Vôlei de praia');
      expect(sportLabelForCode('BEACH_TENNIS')).toBe('Beach tennis');
    });

    it('falls back to a title-cased version of unknown codes', () => {
      expect(sportLabelForCode('FUTEVOLEI_MISTO')).toBe('Futevolei Misto');
    });

    it('returns an empty string for an empty code', () => {
      expect(sportLabelForCode('')).toBe('');
    });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx ng test athlete --watch=false`
Expected: falha ao compilar/rodar por `Cannot find module './sport-catalog'` (o arquivo ainda não existe), além da 1 falha pré-existente já documentada em Global Constraints.

- [ ] **Step 3: Implementar `sport-catalog.ts`**

Criar `frontend/projects/athlete/src/app/data/sport-catalog.ts`:

```typescript
export interface SportCatalogEntry {
  code: string;
  label: string;
  icon: 'ball' | 'racket' | 'running' | 'plus';
}

/** Mesmos códigos usados pelo app Flutter (athlete_firestore_codes.dart), ordem idêntica. */
export const SPORT_CATALOG: readonly SportCatalogEntry[] = [
  { code: 'VOLEI_PRAIA', label: 'Vôlei de praia', icon: 'ball' },
  { code: 'VOLEI_QUADRA', label: 'Vôlei de quadra', icon: 'ball' },
  { code: 'FUTEBOL', label: 'Futebol', icon: 'ball' },
  { code: 'BASQUETE', label: 'Basquete', icon: 'ball' },
  { code: 'TENIS', label: 'Tênis', icon: 'racket' },
  { code: 'BEACH_TENNIS', label: 'Beach tennis', icon: 'racket' },
  { code: 'CORRIDA', label: 'Corrida', icon: 'running' },
  { code: 'OUTROS', label: 'Outros', icon: 'plus' },
];

function titleCaseCode(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Código Firestore (ex.: `VOLEI_PRAIA`) → rótulo em PT. Códigos fora do catálogo caem
 *  pra uma versão title-case do próprio código, nunca em branco/undefined. */
export function sportLabelForCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) {
    return '';
  }
  const found = SPORT_CATALOG.find((entry) => entry.code === trimmed);
  return found ? found.label : titleCaseCode(trimmed);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx ng test athlete --watch=false`
Expected: `TOTAL: 1 FAILED, 59 SUCCESS` (60 specs no total — os 56 de antes + os 4 novos deste arquivo; a única falha continua sendo a mesma já documentada em Global Constraints, ainda não corrigida nesta task).

- [ ] **Step 5: Apontar o onboarding pro catálogo compartilhado**

Em `frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.ts`:

Trocar o bloco de imports do topo do arquivo — de:

```typescript
import { isAllowedAvatarFile, prepareAvatarJpeg, uploadAthleteAvatar } from '../data/athlete-avatar-upload';
import { athleteFunctions } from '../data/functions';
import { athleteStorage } from '../data/storage';
```

Para:

```typescript
import { isAllowedAvatarFile, prepareAvatarJpeg, uploadAthleteAvatar } from '../data/athlete-avatar-upload';
import { athleteFunctions } from '../data/functions';
import { SPORT_CATALOG } from '../data/sport-catalog';
import { athleteStorage } from '../data/storage';
```

Remover a interface `SportOption` (ela não é usada em nenhum outro arquivo do repo — já confirmado por busca) — de:

```typescript
type ObStep = 1 | 2 | 3 | 4 | 5;

export interface SportOption {
  code: string;
  label: string;
  icon: 'ball' | 'racket' | 'running' | 'plus';
}

export interface LevelOption {
```

Para:

```typescript
type ObStep = 1 | 2 | 3 | 4 | 5;

export interface LevelOption {
```

Remover a constante `SPORTS` (substituída por `SPORT_CATALOG`) — de:

```typescript
/** Mesmos códigos usados pelo app Flutter (athlete_firestore_codes.dart), ordem idêntica. */
const SPORTS: SportOption[] = [
  { code: 'VOLEI_PRAIA', label: 'Vôlei de praia', icon: 'ball' },
  { code: 'VOLEI_QUADRA', label: 'Vôlei de quadra', icon: 'ball' },
  { code: 'FUTEBOL', label: 'Futebol', icon: 'ball' },
  { code: 'BASQUETE', label: 'Basquete', icon: 'ball' },
  { code: 'TENIS', label: 'Tênis', icon: 'racket' },
  { code: 'BEACH_TENNIS', label: 'Beach tennis', icon: 'racket' },
  { code: 'CORRIDA', label: 'Corrida', icon: 'running' },
  { code: 'OUTROS', label: 'Outros', icon: 'plus' },
];

/** Escada única de 5 níveis (iniciante_1 < iniciante_2 < intermediario_1 < intermediario_2 < open),
```

Para:

```typescript
/** Escada única de 5 níveis (iniciante_1 < iniciante_2 < intermediario_1 < intermediario_2 < open),
```

Trocar os dois usos de `SPORTS` pelo novo `SPORT_CATALOG` — de:

```typescript
  protected readonly sports = SPORTS;
```

Para:

```typescript
  protected readonly sports = SPORT_CATALOG;
```

E de:

```typescript
  protected readonly selectedSportCode = signal<string>(SPORTS[0]!.code);
```

Para:

```typescript
  protected readonly selectedSportCode = signal<string>(SPORT_CATALOG[0]!.code);
```

- [ ] **Step 6: Confirmar que o projeto compila**

Run: `cd frontend && npx ng build athlete`
Expected: `Application bundle generation complete.` sem novos erros (os warnings de budget de SCSS em `arena-payment`, `athlete-reservar`, `athlete-agenda`, `tournament-detail-shell`, e o warning de `qrcode` não-ESM, já existem hoje e não têm relação com esta mudança — ignore-os).

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/athlete/src/app/data/sport-catalog.ts frontend/projects/athlete/src/app/data/sport-catalog.spec.ts frontend/projects/athlete/src/app/onboarding/athlete-onboarding.component.ts
git commit -m "feat(athlete): extrai catálogo de esportes compartilhado

Sport-catalog.ts centraliza código→rótulo (antes só existia local no
onboarding); onboarding passa a importar de lá. Base pra exibir nível de
habilidade por modalidade no perfil."
```

---

## Task 2: Resolver nível por modalidade (`buildSportLevels`)

**Files:**
- Modify: `frontend/projects/athlete/src/app/profile/profile-format.ts`
- Modify: `frontend/projects/athlete/src/app/profile/profile-format.spec.ts`

**Interfaces:**
- Consumes: `sportLabelForCode` de `../data/sport-catalog` (Task 1).
- Produces: `SportLevelEntry { code: string; sportLabel: string; levelLabel: string }`, `buildSportLevels(userData: Record<string, unknown> | null | undefined): SportLevelEntry[]` — exportados de `frontend/projects/athlete/src/app/profile/profile-format.ts`.

### Parte A — corrigir o teste pré-existente que falha

- [ ] **Step 1: Rodar os testes e confirmar a falha pré-existente**

Run: `cd frontend && npx ng test athlete --watch=false`
Expected: `TOTAL: 1 FAILED, 59 SUCCESS` (mesma falha documentada em Global Constraints — `athleteLevelLabel('iniciante')`, `('basico')` e `('intermediario')` não batem com o rótulo esperado).

- [ ] **Step 2: Atualizar `LEVEL_CODE_TO_LABEL` com os códigos legados**

Em `frontend/projects/athlete/src/app/profile/profile-format.ts`, trocar:

```typescript
/** Espelha `AthleteFirestoreCodes.levelFirestoreToLabel` (app Flutter): códigos de nível
 *  gravados em `sportProfile.level` / `sportOnboarding.levelsBySport` → rótulo de exibição. */
const LEVEL_CODE_TO_LABEL: Record<string, string> = {
  open: 'Open',
  iniciante_1: 'Iniciante 1',
  iniciante_2: 'Iniciante 2',
  intermediario_1: 'Intermediário 1',
  intermediario_2: 'Intermediário 2',
};
```

Para:

```typescript
/** Espelha `AthleteFirestoreCodes.levelFirestoreToLabel` (app Flutter): códigos de nível
 *  gravados em `sportProfile.level` / `sportOnboarding.levelsBySport` → rótulo de exibição.
 *  Inclui os códigos legados sem sufixo (`iniciante`, `basico`, `intermediario`, `livre`) —
 *  ainda aparecem no fallback de nível global de contas antigas. */
const LEVEL_CODE_TO_LABEL: Record<string, string> = {
  open: 'Open',
  livre: 'Open',
  iniciante: 'Iniciante',
  basico: 'Iniciante',
  iniciante_1: 'Iniciante 1',
  iniciante_2: 'Iniciante 2',
  intermediario: 'Intermediário',
  intermediario_1: 'Intermediário 1',
  intermediario_2: 'Intermediário 2',
};
```

- [ ] **Step 3: Rodar os testes e confirmar que a falha pré-existente sumiu**

Run: `cd frontend && npx ng test athlete --watch=false`
Expected: `TOTAL: 60 SUCCESS` (0 falhas — a falha pré-existente foi corrigida; ainda não adicionamos os testes de `buildSportLevels`).

### Parte B — `buildSportLevels`

- [ ] **Step 4: Escrever os testes que falham**

Em `frontend/projects/athlete/src/app/profile/profile-format.spec.ts`, trocar a linha de import — de:

```typescript
import { athleteLevelLabel, buildPublicProfileId, initialsOf, joinCityState, nameFromEmail, slugify, splitCityState, titleCase } from './profile-format';
```

Para:

```typescript
import { athleteLevelLabel, buildPublicProfileId, buildSportLevels, initialsOf, joinCityState, nameFromEmail, slugify, splitCityState, titleCase } from './profile-format';
```

Adicionar o novo `describe` no final do arquivo — trocar as últimas linhas:

```typescript
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

Para:

```typescript
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

  describe('buildSportLevels', () => {
    it('returns the primary sport with its resolved level', () => {
      const userData = {
        sportOnboarding: {
          primarySportId: 'VOLEI_PRAIA',
          secondarySportIds: [],
          levelsBySport: { VOLEI_PRAIA: 'intermediario_1' },
        },
      };
      expect(buildSportLevels(userData)).toEqual([
        { code: 'VOLEI_PRAIA', sportLabel: 'Vôlei de praia', levelLabel: 'Intermediário 1' },
      ]);
    });

    it('includes secondary sports with their own level, primary first', () => {
      const userData = {
        sportOnboarding: {
          primarySportId: 'VOLEI_PRAIA',
          secondarySportIds: ['BEACH_TENNIS'],
          levelsBySport: { VOLEI_PRAIA: 'open', BEACH_TENNIS: 'iniciante_2' },
        },
      };
      expect(buildSportLevels(userData)).toEqual([
        { code: 'VOLEI_PRAIA', sportLabel: 'Vôlei de praia', levelLabel: 'Open' },
        { code: 'BEACH_TENNIS', sportLabel: 'Beach tennis', levelLabel: 'Iniciante 2' },
      ]);
    });

    it('falls back to the legacy global level for the primary sport when missing from levelsBySport', () => {
      const userData = {
        level: 'intermediario_2',
        sportOnboarding: {
          primarySportId: 'TENIS',
          secondarySportIds: [],
          levelsBySport: {},
        },
      };
      expect(buildSportLevels(userData)).toEqual([
        { code: 'TENIS', sportLabel: 'Tênis', levelLabel: 'Intermediário 2' },
      ]);
    });

    it('does not apply the legacy fallback to secondary sports without a level', () => {
      const userData = {
        level: 'open',
        sportOnboarding: {
          primarySportId: 'VOLEI_PRAIA',
          secondarySportIds: ['TENIS'],
          levelsBySport: { VOLEI_PRAIA: 'iniciante_1' },
        },
      };
      expect(buildSportLevels(userData)).toEqual([
        { code: 'VOLEI_PRAIA', sportLabel: 'Vôlei de praia', levelLabel: 'Iniciante 1' },
        { code: 'TENIS', sportLabel: 'Tênis', levelLabel: '' },
      ]);
    });

    it('returns an empty list when there is no sportOnboarding data', () => {
      expect(buildSportLevels({})).toEqual([]);
      expect(buildSportLevels(null)).toEqual([]);
      expect(buildSportLevels(undefined)).toEqual([]);
    });
  });
});
```

- [ ] **Step 5: Rodar os testes e confirmar que falham**

Run: `cd frontend && npx ng test athlete --watch=false`
Expected: falha ao compilar por `buildSportLevels` não existir em `./profile-format` (export não encontrado).

- [ ] **Step 6: Implementar `buildSportLevels`**

Em `frontend/projects/athlete/src/app/profile/profile-format.ts`, adicionar o import no topo do arquivo (arquivo hoje não tem nenhum import — esta é a primeira linha do arquivo):

```typescript
import { sportLabelForCode } from '../data/sport-catalog';

export function titleCase(input: string): string {
```

E adicionar ao final do arquivo (depois da função `joinCityState`, que é a última do arquivo hoje):

```typescript
export interface SportLevelEntry {
  code: string;
  sportLabel: string;
  levelLabel: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

/** Resolve o nível de habilidade por modalidade a partir de `users/{uid}` (não de
 *  `athlete_profiles/{uid}.primarySport`, que é texto livre e não bate com `levelsBySport`).
 *  Ordem do retorno: modalidade principal primeiro, depois as secundárias na ordem de
 *  `secondarySportIds`. Nível ausente na principal cai pro nível global legado
 *  (`level`/`nivel`/`sportProfile.level`, mesma precedência do perfil público); modalidades
 *  secundárias sem entrada em `levelsBySport` ficam com `levelLabel: ''` (sem fallback). */
export function buildSportLevels(userData: Record<string, unknown> | null | undefined): SportLevelEntry[] {
  const sportOnboarding = asRecord(userData?.['sportOnboarding']);
  const primarySportId = asString(sportOnboarding?.['primarySportId']);
  const secondarySportIds = asStringArray(sportOnboarding?.['secondarySportIds']);
  const levelsBySport = asRecord(sportOnboarding?.['levelsBySport']) ?? {};

  const codes = Array.from(
    new Set([primarySportId, ...secondarySportIds].filter((code): code is string => !!code)),
  );

  const legacyLevel =
    asString(userData?.['level']) ??
    asString(userData?.['nivel']) ??
    asString(asRecord(userData?.['sportProfile'])?.['level']);

  return codes.map((code) => {
    const rawLevel = asString(levelsBySport[code]);
    const resolvedLevel = rawLevel ?? (code === primarySportId ? legacyLevel : null);
    return {
      code,
      sportLabel: sportLabelForCode(code),
      levelLabel: athleteLevelLabel(resolvedLevel),
    };
  });
}
```

- [ ] **Step 7: Rodar os testes e confirmar que passam**

Run: `cd frontend && npx ng test athlete --watch=false`
Expected: `TOTAL: 65 SUCCESS` (0 falhas — os 60 de antes + os 5 novos casos de `buildSportLevels`).

- [ ] **Step 8: Commit**

```bash
git add frontend/projects/athlete/src/app/profile/profile-format.ts frontend/projects/athlete/src/app/profile/profile-format.spec.ts
git commit -m "feat(athlete): resolve nível de habilidade por modalidade

buildSportLevels lê sportOnboarding.levelsBySport (com fallback pro nível
legado só na modalidade principal). Corrige de quebra o teste pré-existente
de athleteLevelLabel com códigos de nível legados sem sufixo."
```

---

## Task 3: Exibir esporte + nível reais no modo leitura de `/perfil`

**Files:**
- Modify: `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts`
- Modify: `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html`
- Modify: `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.scss`

**Interfaces:**
- Consumes: `buildSportLevels`, `SportLevelEntry` de `./profile-format` (Task 2).
- Produces: computeds `primarySportLevel(): SportLevelEntry | null` e `otherSportLevels(): SportLevelEntry[]` no componente (`protected`, usados também pela Task 4).

Sem teste automatizado nesta task (o componente não tem `.spec.ts` hoje — ver `docs/superpowers/specs/2026-07-22-nivel-habilidade-perfil-atleta-design.md`, seção Testes). Verificação é por build + QA manual (Task 5).

- [ ] **Step 1: Importar `buildSportLevels` e adicionar o signal de dados**

Em `athlete-profile-settings.component.ts`, trocar o import de `profile-format` — de:

```typescript
import { buildPublicProfileId, initialsOf, joinCityState, nameFromEmail, slugify, splitCityState } from './profile-format';
```

Para:

```typescript
import { buildPublicProfileId, buildSportLevels, initialsOf, joinCityState, nameFromEmail, slugify, splitCityState, type SportLevelEntry } from './profile-format';
```

Adicionar o novo signal logo abaixo de `profileState` — de:

```typescript
  private readonly loadedUid = signal<string | null | undefined>(undefined);
  private readonly profileState = signal<AthleteProfileData>(EMPTY_PROFILE);
  private readonly rankingLabel = signal<string | null>(null);
```

Para:

```typescript
  private readonly loadedUid = signal<string | null | undefined>(undefined);
  private readonly profileState = signal<AthleteProfileData>(EMPTY_PROFILE);
  private readonly sportLevels = signal<SportLevelEntry[]>([]);
  private readonly rankingLabel = signal<string | null>(null);
```

- [ ] **Step 2: Trocar `sportPillLabel` pelos novos computeds**

De:

```typescript
  protected readonly sportPillLabel = computed(() => this.profileState().primarySport || 'Volei de praia');
```

Para:

```typescript
  protected readonly primarySportLevel = computed<SportLevelEntry | null>(() => this.sportLevels()[0] ?? null);
  protected readonly otherSportLevels = computed(() => this.sportLevels().slice(1));
```

- [ ] **Step 3: Popular o signal ao carregar o perfil e ao resetar sessão**

No `constructor()`, no branch de "sem uid" (dev/logout), trocar:

```typescript
      const devEmail = this.auth.devEmail();
      this.profileState.set({ ...EMPTY_PROFILE, fullName: devEmail ? nameFromEmail(devEmail) : '' });
      this.existingUserRoles.set([]);
      this.referredBy.set(null);
      this.loading.set(false);
```

Para:

```typescript
      const devEmail = this.auth.devEmail();
      this.profileState.set({ ...EMPTY_PROFILE, fullName: devEmail ? nameFromEmail(devEmail) : '' });
      this.existingUserRoles.set([]);
      this.referredBy.set(null);
      this.sportLevels.set([]);
      this.loading.set(false);
```

Em `loadRemoteProfile(uid)`, logo depois de `userData` ser lido, trocar:

```typescript
      const userData = userSnap.exists() ? userSnap.data() : null;
      const profileData = profileSnap.exists() ? profileSnap.data() : null;

      const rawRoles = userData?.['roles'];
```

Para:

```typescript
      const userData = userSnap.exists() ? userSnap.data() : null;
      const profileData = profileSnap.exists() ? profileSnap.data() : null;

      this.sportLevels.set(buildSportLevels(userData));

      const rawRoles = userData?.['roles'];
```

- [ ] **Step 4: Atualizar o HTML — pill principal + lista de modalidades secundárias**

Em `athlete-profile-settings.component.html`, trocar:

```html
              <div class="at-profile-pills">
                <span class="at-pill at-pill--orange">{{ sportPillLabel() }}</span>
                <span class="at-pill">{{ levelLabel() }}</span>
              </div>
```

Para:

```html
              <div class="at-profile-pills">
                <span class="at-pill at-pill--orange">{{ primarySportLevel()?.sportLabel ?? 'Vôlei de praia' }}</span>
                <span class="at-pill">{{ primarySportLevel()?.levelLabel || 'Nível não informado' }}</span>
              </div>

              @if (otherSportLevels().length > 0) {
                <ul class="at-profile-sport-list">
                  @for (entry of otherSportLevels(); track entry.code) {
                    <li class="at-profile-sport-row">
                      <span>{{ entry.sportLabel }}</span>
                      <span class="at-pill">{{ entry.levelLabel || 'Nível não informado' }}</span>
                    </li>
                  }
                </ul>
              }
```

- [ ] **Step 5: Estilos da lista de modalidades secundárias**

Em `athlete-profile-settings.component.scss`, adicionar logo depois da regra `.at-profile-pills` existente:

```scss
.at-profile-pills {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}

.at-profile-sport-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 0 18px;
  padding: 0;
  list-style: none;
}

.at-profile-sport-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  height: 22px;
  font-family: var(--nx-font-ui);
  font-size: 12.5px;
  color: var(--nx-text-mute);
}
```

(a regra `.at-profile-pills` já existe hoje sem alteração — reproduzida aqui só como âncora; não editar seu conteúdo, só inserir `.at-profile-sport-list` e `.at-profile-sport-row` logo depois dela.)

- [ ] **Step 6: Confirmar que o projeto compila**

Run: `cd frontend && npx ng build athlete`
Expected: `Application bundle generation complete.` sem novos erros. `sportPillLabel` não deve mais aparecer em nenhuma busca:

Run: `grep -rn "sportPillLabel" frontend/projects/athlete/src`
Expected: nenhum resultado (0 linhas).

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.scss
git commit -m "feat(athlete): mostra nível de habilidade real por modalidade no perfil

Pill de esporte e nível passam a ler de sportOnboarding (via
buildSportLevels) em vez do texto livre de athlete_profiles.primarySport e
do nível de XP. Modalidades secundárias com nível salvo aparecem numa lista
compacta abaixo da pill principal."
```

---

## Task 4: Remover seletor de esporte do modo edição (fica sem efeito) e código morto

**Files:**
- Modify: `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts`
- Modify: `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html`
- Modify: `frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.scss`

**Interfaces:**
- Consumes: `primarySportLevel()` computed da Task 3.
- Produces: nada consumido por tasks posteriores.

- [ ] **Step 1: Remover `PRIMARY_SPORT_OPTIONS` e o campo `primarySport` do modelo/estado**

Em `athlete-profile-settings.component.ts`, remover a constante — de:

```typescript
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
  publicProfileEnabled: boolean;
}

const EMPTY_PROFILE: AthleteProfileData = {
  fullName: '',
  city: '',
  state: '',
  whatsappNumber: '',
  primarySport: 'Volei de praia',
  bio: '',
  publicProfileId: null,
  publicProfileEnabled: true,
};
```

Para:

```typescript
interface AthleteProfileData {
  fullName: string;
  city: string;
  state: string;
  whatsappNumber: string;
  bio: string;
  publicProfileId: string | null;
  publicProfileEnabled: boolean;
}

const EMPTY_PROFILE: AthleteProfileData = {
  fullName: '',
  city: '',
  state: '',
  whatsappNumber: '',
  bio: '',
  publicProfileId: null,
  publicProfileEnabled: true,
};
```

- [ ] **Step 2: Remover `sportOptions`, o controle do form e `selectSport()`**

De:

```typescript
  protected readonly sportOptions = PRIMARY_SPORT_OPTIONS;

  protected readonly isEditing = signal(false);
```

Para:

```typescript
  protected readonly isEditing = signal(false);
```

De:

```typescript
  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    cityState: ['', Validators.required],
    whatsappNumber: [''],
    primarySport: ['Volei de praia', Validators.required],
    bio: [''],
  });
```

Para:

```typescript
  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    cityState: ['', Validators.required],
    whatsappNumber: [''],
    bio: [''],
  });
```

De:

```typescript
  protected selectSport(sport: string): void {
    this.form.controls.primarySport.setValue(sport);
    this.form.controls.primarySport.markAsDirty();
  }

  protected toggleAllAchievements(): void {
```

Para:

```typescript
  protected toggleAllAchievements(): void {
```

- [ ] **Step 3: Remover `primarySport` de `startEdit()`, `save()` e `loadRemoteProfile()`**

Em `startEdit()`, de:

```typescript
    this.form.reset({
      fullName: current.fullName,
      cityState: joinCityState(current.city, current.state),
      whatsappNumber: current.whatsappNumber,
      primarySport: current.primarySport || 'Volei de praia',
      bio: current.bio,
    });
```

Para:

```typescript
    this.form.reset({
      fullName: current.fullName,
      cityState: joinCityState(current.city, current.state),
      whatsappNumber: current.whatsappNumber,
      bio: current.bio,
    });
```

Em `save()`, no `setDoc` de `athlete_profiles`, de:

```typescript
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
            publicProfileEnabled,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
```

Para:

```typescript
        setDoc(
          doc(this.firestore, 'athlete_profiles', uid),
          {
            fullName: raw.fullName,
            displayName: raw.fullName,
            city,
            state,
            whatsappNumber,
            bio,
            publicProfileId,
            publicProfileEnabled,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
```

Ainda em `save()`, na atualização do `profileState` local após salvar, de:

```typescript
      this.profileState.set({
        fullName: raw.fullName,
        city,
        state,
        whatsappNumber,
        primarySport: raw.primarySport,
        bio,
        publicProfileId,
        publicProfileEnabled,
      });
```

Para:

```typescript
      this.profileState.set({
        fullName: raw.fullName,
        city,
        state,
        whatsappNumber,
        bio,
        publicProfileId,
        publicProfileEnabled,
      });
```

Em `loadRemoteProfile()`, de:

```typescript
      this.profileState.set({
        fullName,
        city: readString(profileData, ['city']) ?? readString(userData, ['city']) ?? '',
        state: readString(profileData, ['state']) ?? readString(userData, ['state']) ?? '',
        whatsappNumber: readString(profileData, ['whatsappNumber']) ?? '',
        primarySport: readString(profileData, ['primarySport']) ?? 'Volei de praia',
        bio: readString(profileData, ['bio']) ?? '',
        publicProfileId: readString(profileData, ['publicProfileId', 'athleteId', 'profileIdentifier']),
        // Só false quando o doc já existe e diz explicitamente false (ex.: privacidade desativada
        // no app) — um doc novo ou sem esse campo deve poder ser encontrado pelo perfil público.
        publicProfileEnabled: profileData?.['publicProfileEnabled'] !== false,
      });
```

Para:

```typescript
      this.profileState.set({
        fullName,
        city: readString(profileData, ['city']) ?? readString(userData, ['city']) ?? '',
        state: readString(profileData, ['state']) ?? readString(userData, ['state']) ?? '',
        whatsappNumber: readString(profileData, ['whatsappNumber']) ?? '',
        bio: readString(profileData, ['bio']) ?? '',
        publicProfileId: readString(profileData, ['publicProfileId', 'athleteId', 'profileIdentifier']),
        // Só false quando o doc já existe e diz explicitamente false (ex.: privacidade desativada
        // no app) — um doc novo ou sem esse campo deve poder ser encontrado pelo perfil público.
        publicProfileEnabled: profileData?.['publicProfileEnabled'] !== false,
      });
```

- [ ] **Step 4: Trocar o seletor de esporte no HTML por uma linha somente-leitura**

Em `athlete-profile-settings.component.html`, trocar:

```html
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
```

Para:

```html
                <div class="at-field">
                  <span>Esporte e nível</span>
                  <p class="at-profile-readonly-note">
                    {{ primarySportLevel()?.sportLabel ?? 'Vôlei de praia' }} ·
                    {{ primarySportLevel()?.levelLabel || 'nível não informado' }}
                    — definidos no cadastro
                  </p>
                </div>
```

- [ ] **Step 5: Remover os estilos das abas de esporte e adicionar o da linha somente-leitura**

Em `athlete-profile-settings.component.scss`, remover:

```scss
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
```

E no lugar, adicionar:

```scss
.at-profile-readonly-note {
  margin: 0;
  font-family: var(--nx-font-ui);
  font-size: 13px;
  color: var(--nx-text-mute);
}
```

- [ ] **Step 6: Confirmar que o projeto compila e que não sobrou código morto**

Run: `cd frontend && npx ng build athlete`
Expected: `Application bundle generation complete.` sem novos erros.

Run: `grep -rn "PRIMARY_SPORT_OPTIONS\|selectSport\|at-profile-sport-tab\|sportOptions" frontend/projects/athlete/src`
Expected: nenhum resultado (0 linhas) — tudo removido de fato, sem sobras.

Run: `cd frontend && npx ng test athlete --watch=false`
Expected: `TOTAL: 65 SUCCESS` (inalterado desde a Task 2 — esta task não mexe em nenhuma função pura testada).

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.html frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.scss
git commit -m "refactor(athlete): remove seletor de esporte do modo edição do perfil

O seletor gravava athlete_profiles.primarySport, campo que a tela não lê
mais desde que esporte/nível passaram a vir de sportOnboarding — ficaria
com botões que pareciam funcionar mas não tinham efeito. Modo edição agora
mostra esporte + nível como texto somente-leitura, com nota de que são
definidos no cadastro."
```

---

## Task 5: QA manual no navegador

**Files:** nenhum (task de verificação).

Sem testes automatizados de componente nesta tela (ver Global Constraints); esta é a validação final antes de considerar o trabalho pronto.

- [ ] **Step 1: Subir o servidor de dev**

Run: `cd frontend && npm run start:athlete`
Expected: log indicando o servidor rodando (ex.: `Local: http://localhost:4200/`). Deixar rodando em background pros próximos steps.

- [ ] **Step 2: Login e navegação até `/perfil`**

Abrir `http://localhost:4200/perfil` no navegador (login com uma conta de atleta de dev — real ou bypass, conforme o fluxo já configurado no ambiente de dev do projeto).

Expected: a tela carrega sem ficar presa em "Carregando perfil…".

- [ ] **Step 3: Conferir a pill de esporte e nível no modo leitura**

Expected:
- A pill laranja mostra o esporte real da conta (ex.: "Vôlei de praia"), não mais um texto solto desconectado do cadastro.
- A pill cinza ao lado mostra um dos 5 rótulos reais de nível ("Iniciante 1", "Iniciante 2", "Intermediário 1", "Intermediário 2" ou "Open") — **nunca** mais "Nível 0", "Nível 1", "Nível 2" etc. (isso seria o bug antigo voltando).
- Se a conta de teste tiver mais de uma modalidade com nível salvo em `sportOnboarding.levelsBySport`, uma lista aparece logo abaixo com cada modalidade extra e seu nível. Se só tiver uma modalidade (caso comum hoje), nenhuma lista aparece e o espaçamento fica visualmente igual ao de antes da mudança.
- O bloco de XP/gamificação logo abaixo ("Nível N", barra de progresso, "X / 100 XP") continua exatamente como estava — não deve ter mudado.

- [ ] **Step 4: Conferir o modo edição**

Clicar em "Editar perfil".

Expected:
- Não existe mais nenhum botão clicável de esporte — no lugar, uma linha de texto (não interativa) mostrando "`<esporte>` · `<nível>` — definidos no cadastro".
- Nome, cidade, WhatsApp e bio continuam editáveis normalmente.
- Clicar em "Salvar alterações" com uma mudança em nome/cidade/whatsapp/bio salva com sucesso (mensagem "Perfil atualizado.") e volta pro modo leitura com a pill de esporte/nível inalterada.

- [ ] **Step 5: Checar console e responsividade**

Abrir o console do navegador — Expected: nenhum erro novo relacionado a `sportLevels`, `primarySportLevel`, `buildSportLevels` ou `sport-catalog`.

Redimensionar a janela pra 375px de largura (ou usar o modo mobile do devtools) — Expected: pills e lista de modalidades secundárias (se aparecer) não causam scroll horizontal nem sobrepõem outros elementos.

- [ ] **Step 6: Encerrar o servidor de dev**

Parar o processo iniciado no Step 1.

---

## Self-Review desta plan

**Cobertura da spec:** todos os itens de "Dentro do escopo" da spec têm task correspondente — catálogo de esportes (Task 1), resolução de nível com fallback (Task 2), pill principal + lista secundária (Task 3), remoção do seletor de edição + código morto (Task 4), QA manual (Task 5). Nenhum item de "Fora do escopo" da spec é tocado por nenhuma task.

**Placeholders:** nenhum "TBD"/"implementar depois"/"tratamento de erro apropriado" — todo código é literal e completo em cada step.

**Consistência de tipos:** `SportLevelEntry` (Task 2) é usado com os mesmos três campos (`code`, `sportLabel`, `levelLabel`) em todas as tasks seguintes; `SPORT_CATALOG`/`SportCatalogEntry`/`sportLabelForCode` (Task 1) mantêm nome e assinatura idênticos onde são consumidos (Task 2 e onboarding). `primarySportLevel()`/`otherSportLevels()` (Task 3) são usados com a mesma assinatura na Task 4.
