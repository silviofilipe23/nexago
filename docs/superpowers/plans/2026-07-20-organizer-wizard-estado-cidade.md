# Seleção de Estado/Cidade nos wizards do organizador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os campos de texto livre de cidade/UF nos wizards `criar-torneio`, `criar-liga` e
`criar-etapa` do painel do organizador por seleção guiada (UF → cidade dependente da UF), replicando o
comportamento do app Flutter (`BrStateCityFields`).

**Architecture:** Um serviço compartilhado `BrLocationsService` (`providedIn: 'root'`) carrega uma vez a
lista estática de 27 UFs e o JSON de municípios por UF (mesmo asset do app), expõe `citiesFor(uf)`. Os três
wizards passam a usar `<select class="og-select-el">` (padrão já existente em `criar-etapa.component.ts`)
para UF e Cidade, ligados aos signals `draft()`/`stage()` já existentes via `patch()`/`patchStage()`.
Trocar a UF sempre limpa a cidade selecionada.

**Tech Stack:** Angular standalone components, signals, `inject()`, Karma + Jasmine (`ng test organizer`).

## Global Constraints

- Nenhuma mudança de modelo: `city`/`state` continuam `string` em `TournamentCreateDraft`, `LeagueCreateDraft`
  e `LeagueStageDraft`.
- Validação inalterada: cidade continua obrigatória para avançar onde já era; UF continua opcional.
- Usar `<select class="og-select-el">` — não construir combobox/overlay customizado.
- Não adicionar `provideHttpClient()`; o serviço usa `fetch()` nativo (nenhum outro serviço do projeto usa
  `HttpClient`).
- `BrLocationsService` é a única peça nova com teste unitário dedicado (lógica pura, isolada). Os wizards
  (`criar-torneio.component.ts`, `criar-liga.component.ts`, `criar-etapa.component.ts`) são arquivos de
  ~1000 linhas com template inline e **zero cobertura de teste hoje** (`find frontend/projects/organizer/src
  -iname "*.spec.ts"` não retorna nada) — seguindo o padrão já estabelecido no projeto, a verificação dessas
  mudanças é `ng build organizer` (type-check do template) + QA manual no navegador, não specs novas.
- Espelhar exatamente as 27 UFs e a ordenação de `nexago_app/lib/core/location/br_locations_data.dart`
  (`BrLocationsData.states`).

---

### Task 1: `BrLocationsService` compartilhado (UFs + cidades por UF)

**Files:**
- Create: `frontend/projects/organizer/public/data/br-municipalities-by-uf.json` (cópia exata de
  `nexago_app/assets/data/br_municipalities_by_uf.json`)
- Create: `frontend/projects/organizer/src/app/shared/br-locations/br-locations.model.ts`
- Create: `frontend/projects/organizer/src/app/shared/br-locations/br-locations.service.ts`
- Test: `frontend/projects/organizer/src/app/shared/br-locations/br-locations.service.spec.ts`

**Interfaces:**
- Produces: `interface BrState { readonly sigla: string; readonly name: string }`, `const BR_STATES:
  readonly BrState[]` (27 itens) — de `br-locations.model.ts`.
- Produces: `class BrLocationsService` (`providedIn: 'root'`) — de `br-locations.service.ts`:
  - `readonly states: readonly BrState[]`
  - `readonly loaded: Signal<boolean>`
  - `readonly ready: Promise<void>`
  - `citiesFor(uf: string): string[]`

- [ ] **Step 1: Copiar o asset de municípios**

```bash
mkdir -p frontend/projects/organizer/public/data
cp nexago_app/assets/data/br_municipalities_by_uf.json frontend/projects/organizer/public/data/br-municipalities-by-uf.json
```

- [ ] **Step 2: Criar o modelo com as 27 UFs**

Criar `frontend/projects/organizer/src/app/shared/br-locations/br-locations.model.ts`:

```ts
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

- [ ] **Step 3: Escrever o teste (falhando) do serviço**

Criar `frontend/projects/organizer/src/app/shared/br-locations/br-locations.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { BrLocationsService } from './br-locations.service';

describe('BrLocationsService', () => {
  beforeEach(() => {
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

  it('fetches the asset only once', async () => {
    const service = TestBed.inject(BrLocationsService);
    await service.ready;
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith('/data/br-municipalities-by-uf.json');
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `Cannot find module './br-locations.service'`

- [ ] **Step 5: Implementar o serviço**

Criar `frontend/projects/organizer/src/app/shared/br-locations/br-locations.service.ts`:

```ts
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
    if (!uf) return [];
    return this.citiesByUf()?.[uf] ?? [];
  }
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless`
Expected: PASS — 4 specs, 0 failures

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/organizer/public/data/br-municipalities-by-uf.json \
        frontend/projects/organizer/src/app/shared/br-locations/
git commit -m "feat(organizer): adiciona BrLocationsService (UFs + cidades por UF)"
```

---

### Task 2: Selects de UF/Cidade em `criar-torneio.component.ts`

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts`

**Interfaces:**
- Consumes: `BrLocationsService` (Task 1) — `states`, `loaded()`, `citiesFor(uf)`.
- Consumes: `protected readonly draft = signal<TournamentCreateDraft>(...)` e `protected patch(partial:
  Partial<TournamentCreateDraft>): void` (já existentes no arquivo, linhas 572 e 682).

- [ ] **Step 1: Importar o serviço e injetar**

Adicionar após o import de `NxPageLoadingComponent` (linha 49):

```ts
import { BrLocationsService } from '../../../shared/br-locations/br-locations.service';
```

Adicionar junto aos outros `inject(...)` da classe (perto da linha 568, mesmo bloco de `auth`/`route`/`router`,
mas como `protected` porque é usado no template — mesma convenção de `draft`):

```ts
  protected readonly brLocations = inject(BrLocationsService);
```

- [ ] **Step 2: Adicionar computed e handler de troca de UF**

Adicionar perto do método `patch` (linha 682), antes ou depois dele:

```ts
  protected readonly citiesForState = computed(() => this.brLocations.citiesFor(this.draft().state));

  protected onStateChange(uf: string): void {
    this.patch({ state: uf, city: '' });
  }
```

- [ ] **Step 3: Substituir os inputs de Cidade/UF pelos selects**

Substituir o bloco (linhas 309-316):

```html
                  <div class="og-field-grid" style="margin-top:16px">
                    <og-form-field label="Cidade">
                      <input class="og-input-el" [value]="draft().city" (input)="patch({ city: $any($event.target).value })" placeholder="Ex.: Goiânia" />
                    </og-form-field>
                    <og-form-field label="UF (opcional)">
                      <input class="og-input-el" maxlength="2" [value]="draft().state" (input)="patch({ state: $any($event.target).value })" placeholder="GO" />
                    </og-form-field>
                  </div>
```

por:

```html
                  <div class="og-field-grid" style="margin-top:16px">
                    <og-form-field label="UF (opcional)">
                      <select class="og-select-el" [value]="draft().state" (change)="onStateChange($any($event.target).value)">
                        <option value="">Selecione</option>
                        @for (s of brLocations.states; track s.sigla) {
                          <option [value]="s.sigla">{{ s.name }} ({{ s.sigla }})</option>
                        }
                      </select>
                    </og-form-field>
                    <og-form-field label="Cidade">
                      <select class="og-select-el" [value]="draft().city" [disabled]="!draft().state" (change)="patch({ city: $any($event.target).value })">
                        <option value="">{{ !draft().state ? 'Selecione a UF primeiro' : (brLocations.loaded() ? 'Selecione' : 'Carregando…') }}</option>
                        @for (c of citiesForState(); track c) {
                          <option [value]="c">{{ c }}</option>
                        }
                      </select>
                    </og-form-field>
                  </div>
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx ng build organizer`
Expected: build sem erros

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts
git commit -m "feat(organizer): seleção guiada de UF/cidade no wizard de torneio"
```

---

### Task 3: Selects de UF/Cidade em `criar-liga.component.ts` (liga + etapa)

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/eventos/wizard/criar-liga.component.ts`

**Interfaces:**
- Consumes: `BrLocationsService` (Task 1).
- Consumes: `protected readonly draft = signal<LeagueCreateDraft>(...)` (linha 385), `protected readonly
  stage = signal<LeagueStageDraft>(...)` (linha 393), `protected patch(partial: Partial<LeagueCreateDraft>):
  void` (linha 425), `protected patchStage(partial: Partial<LeagueStageDraft>): void` (linha 433).

- [ ] **Step 1: Importar o serviço, injetar e adicionar computeds/handlers**

Adicionar import (junto aos outros imports de `../../ui/...`, por exemplo antes de `OgWizardShellComponent`):

```ts
import { BrLocationsService } from '../../../shared/br-locations/br-locations.service';
```

Adicionar `inject`, como `protected` (perto de `private readonly auth = inject(AuthService);`, linha 383):

```ts
  protected readonly brLocations = inject(BrLocationsService);
```

Adicionar perto de `patch`/`patchStage` (linhas 425-436):

```ts
  protected readonly citiesForState = computed(() => this.brLocations.citiesFor(this.draft().state));

  protected onStateChange(uf: string): void {
    this.patch({ state: uf, city: '' });
  }

  protected readonly stageEffectiveState = computed(() => this.stage().state || this.draft().state);
  protected readonly citiesForStageState = computed(() => this.brLocations.citiesFor(this.stageEffectiveState()));

  protected onStageStateChange(uf: string): void {
    this.patchStage({ state: uf, city: '' });
  }
```

- [ ] **Step 2: Substituir Cidade-sede/UF da liga pelos selects**

Substituir o bloco (linhas 208-213):

```html
                    <og-form-field label="Cidade-sede">
                      <input class="og-input-el" [value]="draft().city" (input)="patch({ city: $any($event.target).value })" />
                    </og-form-field>
                    <og-form-field label="UF (opcional)">
                      <input class="og-input-el" maxlength="2" [value]="draft().state" (input)="patch({ state: $any($event.target).value })" />
                    </og-form-field>
```

por:

```html
                    <og-form-field label="UF (opcional)">
                      <select class="og-select-el" [value]="draft().state" (change)="onStateChange($any($event.target).value)">
                        <option value="">Selecione</option>
                        @for (s of brLocations.states; track s.sigla) {
                          <option [value]="s.sigla">{{ s.name }} ({{ s.sigla }})</option>
                        }
                      </select>
                    </og-form-field>
                    <og-form-field label="Cidade-sede">
                      <select class="og-select-el" [value]="draft().city" [disabled]="!draft().state" (change)="patch({ city: $any($event.target).value })">
                        <option value="">{{ !draft().state ? 'Selecione a UF primeiro' : (brLocations.loaded() ? 'Selecione' : 'Carregando…') }}</option>
                        @for (c of citiesForState(); track c) {
                          <option [value]="c">{{ c }}</option>
                        }
                      </select>
                    </og-form-field>
```

(Nota: a ordem visual muda de "Cidade, UF" para "UF, Cidade" — a cidade agora depende da UF, então a UF vem
primeiro, igual ao `BrStateCityFields` do app.)

- [ ] **Step 3: Substituir o campo de Cidade da etapa por UF+Cidade selects**

Substituir o bloco (linhas 175-178):

```html
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="Cidade (vazio = cidade da liga)">
                  <input class="og-input-el" [value]="stage().city" (input)="patchStage({ city: $any($event.target).value })" />
                </og-form-field>
                <og-form-field label="Início">
```

por (nova grid dedicada a UF/Cidade da etapa, antes da grid de datas):

```html
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="UF da etapa (vazio = UF da liga)">
                  <select class="og-select-el" [value]="stage().state" (change)="onStageStateChange($any($event.target).value)">
                    <option value="">— usa UF da liga —</option>
                    @for (s of brLocations.states; track s.sigla) {
                      <option [value]="s.sigla">{{ s.name }} ({{ s.sigla }})</option>
                    }
                  </select>
                </og-form-field>
                <og-form-field label="Cidade (vazio = cidade da liga)">
                  <select class="og-select-el" [value]="stage().city" [disabled]="!stageEffectiveState()" (change)="patchStage({ city: $any($event.target).value })">
                    <option value="">{{ !stageEffectiveState() ? 'Defina a UF da liga primeiro' : '— usa cidade da liga —' }}</option>
                    @for (c of citiesForStageState(); track c) {
                      <option [value]="c">{{ c }}</option>
                    }
                  </select>
                </og-form-field>
              </div>
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="Início">
```

E fechar essa nova grid antes do "Fim" existente — o bloco original (linhas 175-185) inteiro fica:

```html
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="UF da etapa (vazio = UF da liga)">
                  <select class="og-select-el" [value]="stage().state" (change)="onStageStateChange($any($event.target).value)">
                    <option value="">— usa UF da liga —</option>
                    @for (s of brLocations.states; track s.sigla) {
                      <option [value]="s.sigla">{{ s.name }} ({{ s.sigla }})</option>
                    }
                  </select>
                </og-form-field>
                <og-form-field label="Cidade (vazio = cidade da liga)">
                  <select class="og-select-el" [value]="stage().city" [disabled]="!stageEffectiveState()" (change)="patchStage({ city: $any($event.target).value })">
                    <option value="">{{ !stageEffectiveState() ? 'Defina a UF da liga primeiro' : '— usa cidade da liga —' }}</option>
                    @for (c of citiesForStageState(); track c) {
                      <option [value]="c">{{ c }}</option>
                    }
                  </select>
                </og-form-field>
              </div>
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="Início">
                  <input class="og-input-el" type="date" [value]="dateVal(stage().startAt)" (input)="patchStage({ startAt: toDateVal($any($event.target).value) })" />
                </og-form-field>
                <og-form-field label="Fim">
                  <input class="og-input-el" type="date" [value]="dateVal(stage().endAt)" (input)="patchStage({ endAt: toDateVal($any($event.target).value) })" />
                </og-form-field>
              </div>
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx ng build organizer`
Expected: build sem erros

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/eventos/wizard/criar-liga.component.ts
git commit -m "feat(organizer): seleção guiada de UF/cidade no wizard de liga (liga + etapa)"
```

---

### Task 4: Selects de UF/Cidade em `criar-etapa.component.ts`

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/eventos/wizard/criar-etapa.component.ts`

**Interfaces:**
- Consumes: `BrLocationsService` (Task 1).
- Consumes: `protected readonly stage = signal<LeagueStageDraft>(...)` (linha 187), `protected readonly
  league = signal<PublishedLeagueForStageAdd | null>(null)` (linha 185, `PublishedLeagueForStageAdd.state:
  string`), `protected patchStage(partial: Partial<LeagueStageDraft>): void` (linha 211).

- [ ] **Step 1: Importar o serviço, injetar e adicionar computeds/handler**

Adicionar import (junto aos outros imports de `../../ui/...`):

```ts
import { BrLocationsService } from '../../../shared/br-locations/br-locations.service';
```

Adicionar `inject`, como `protected` (perto de `private readonly auth = inject(AuthService);`, linha 174):

```ts
  protected readonly brLocations = inject(BrLocationsService);
```

Adicionar perto de `patchStage` (linha 211):

```ts
  protected readonly stageEffectiveState = computed(() => this.stage().state || this.league()?.state || '');
  protected readonly citiesForStageState = computed(() => this.brLocations.citiesFor(this.stageEffectiveState()));

  protected onStageStateChange(uf: string): void {
    this.patchStage({ state: uf, city: '' });
  }
```

- [ ] **Step 2: Substituir o campo de Cidade da etapa por UF+Cidade selects**

Substituir o bloco (linhas 117-120):

```html
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="Cidade (vazio = cidade da liga)">
                  <input class="og-input-el" [value]="stage().city" (input)="patchStage({ city: $any($event.target).value })" />
                </og-form-field>
                <og-form-field label="Início">
```

por (mesma estrutura de duas grids do Task 3 — nova grid de UF/Cidade antes da grid de datas):

```html
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="UF da etapa (vazio = UF da liga)">
                  <select class="og-select-el" [value]="stage().state" (change)="onStageStateChange($any($event.target).value)">
                    <option value="">— usa UF da liga —</option>
                    @for (s of brLocations.states; track s.sigla) {
                      <option [value]="s.sigla">{{ s.name }} ({{ s.sigla }})</option>
                    }
                  </select>
                </og-form-field>
                <og-form-field label="Cidade (vazio = cidade da liga)">
                  <select class="og-select-el" [value]="stage().city" [disabled]="!stageEffectiveState()" (change)="patchStage({ city: $any($event.target).value })">
                    <option value="">{{ !stageEffectiveState() ? 'Defina a UF da liga primeiro' : '— usa cidade da liga —' }}</option>
                    @for (c of citiesForStageState(); track c) {
                      <option [value]="c">{{ c }}</option>
                    }
                  </select>
                </og-form-field>
              </div>
              <div class="og-field-grid" style="margin-top:16px">
                <og-form-field label="Início">
                  <input class="og-input-el" type="date" [value]="dateVal(stage().startAt)" (input)="patchStage({ startAt: toDateVal($any($event.target).value) })" />
                </og-form-field>
                <og-form-field label="Fim">
                  <input class="og-input-el" type="date" [value]="dateVal(stage().endAt)" (input)="patchStage({ endAt: toDateVal($any($event.target).value) })" />
                </og-form-field>
              </div>
```

(O bloco original das linhas 117-127 tinha Cidade+Início+Fim numa única grid de 3 colunas; vira duas grids de
2 colunas cada, mesma estrutura do Task 3.)

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx ng build organizer`
Expected: build sem erros

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/eventos/wizard/criar-etapa.component.ts
git commit -m "feat(organizer): seleção guiada de UF/cidade no wizard de nova etapa"
```

---

### Task 5: Verificação manual no navegador

**Files:** nenhum (só verificação)

- [ ] **Step 1: Rodar a suíte completa de testes**

Run: `cd frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless`
Expected: PASS — todos os specs de `BrLocationsService` verdes, nenhuma regressão

- [ ] **Step 2: Build de produção do organizer**

Run: `cd frontend && npx ng build organizer`
Expected: build sem erros, sem warnings novos de template

- [ ] **Step 3: Servir localmente e testar os 3 wizards no navegador**

Run: `cd frontend && npx ng serve organizer`

No navegador (`http://localhost:4200` ou porta indicada), logado como organizador:
- **Torneio novo** → passo "Local": selecionar UF, confirmar que a Cidade habilita e lista as cidades da UF;
  trocar a UF e confirmar que a Cidade volta a ficar vazia/desabilitada.
- **Liga nova** → passo 1 (Detalhes): mesmo teste para UF/Cidade-sede. Sub-tela "Etapa": confirmar que UF/
  Cidade da etapa começam em "— usa da liga —", que escolher uma UF na etapa habilita cidades dessa UF, e
  que deixar em branco mantém o fallback para a cidade da liga (ver `stageTournamentMap`/`city =
  stage.city.trim() || league.city.trim()`).
- **Nova etapa** (wizard standalone, liga já publicada): mesmo teste do fallback UF/Cidade da liga
  selecionada.

- [ ] **Step 4: Reportar resultado**

Sem commit neste passo — é só validação. Se algo quebrar, corrigir no arquivo correspondente e re-rodar os
Steps 1–3 antes de seguir.
