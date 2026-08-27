# Seguir Torneio (Espectador Anônimo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao espectador anônimo do site (`nexago.com.br`) um jeito de "seguir" um torneio (bookmark local, sem conta) e de chegar na página ao vivo que já existe em `organizador.nexago.com.br/t/:id`, hoje sem nenhum link de lá pra cá.

**Architecture:** Tudo isolado no projeto `site` (Angular 20, standalone, zoneless, signals). Um `localStorage` wrapper puro (`follow-storage.ts`) guarda os ids seguidos; um botão pequeno e independente (`FollowButtonComponent`) lê/escreve nele e é plugado na página do torneio; uma função pura (`liveUrlFor`) decide quando linkar pra `organizador.nexago.com.br/t/:id`; uma nova seção da home (`AcompanhandoSection`) hidrata os ids seguidos via `getTournamentById` (já existe) e reaproveita o `TournamentCard` já existente. Nenhuma mudança em `organizer`, `functions` ou `firestore.rules`.

**Tech Stack:** Angular 20 (standalone components, `input()`/`signal()`/`effect()`, `@if`/`@for`), Jasmine + Karma via `@angular/build:karma`, `localStorage` do navegador (sem lib de mock — Karma roda em Chrome headless real).

**Spec:** `docs/superpowers/specs/2026-08-27-seguir-torneio-espectador-design.md`

## Global Constraints

- **Todo comando de teste roda a partir de `<worktree>/frontend`**: `npx ng test site --watch=false --browsers=ChromeHeadless`. Baseline hoje: **0 specs, 0 falhas** (o projeto `site` não tem nenhum teste ainda) — se a contagem não subir a cada task, você está rodando a árvore errada.
- **UI em português, código em inglês** (convenção do repo).
- **Prettier do workspace:** `printWidth: 100`, aspas simples (`package.json` → campo `"prettier"`).
- **Zero mudança em `organizer`, `functions` ou `firestore.rules`** — a página ao vivo já existe e já funciona; este plano só liga o site a ela e adiciona o bookmark local.
- **Sem conta, sem push, sem e-mail** — MVP é só `localStorage`. Nenhuma escrita em Firestore nova.
- **`follow-storage.ts` nunca lança** — qualquer falha de `localStorage` (modo privado, cota) cai num catch e vira no-op, nunca propaga exceção pro chamador.
- **Sem convenção prévia no repo pra "spy" em função de módulo exportada** (confirmado por busca no monorepo inteiro) — por isso a lógica nova fica em **funções puras e num componente pequeno e isolado**, testáveis sem tocar Firestore; a integração final dentro de `torneio-detail.page.ts` (que já chama `getTournamentById` direto, sem DI) fica **sem teste automatizado próprio**, mesmo padrão já aceito hoje pelas 3 páginas do site que fazem fetch direto no `constructor`/`effect()` — coberta por verificação manual no navegador (Task 8).

---

### Task 1: `follow-storage.ts` — bookmark local puro

**Files:**
- Create: `frontend/projects/site/src/lib/follow-storage.ts`
- Test: `frontend/projects/site/src/lib/follow-storage.spec.ts`

**Interfaces:**
- Consumes: nada (só `localStorage` do navegador).
- Produces: `getFollowedTournamentIds(): string[]`; `isFollowing(id: string): boolean`; `toggleFollow(id: string): boolean` (retorna o novo estado — `true` = passou a seguir, `false` = deixou de seguir); `export const STORAGE_KEY = 'nx:torneios-seguidos'` (exportada só pra specs inspecionarem/limparem o `localStorage` real, ver Task 4).

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/site/src/lib/follow-storage.spec.ts`:

```ts
import { STORAGE_KEY, getFollowedTournamentIds, isFollowing, toggleFollow } from './follow-storage';

describe('follow-storage', () => {
  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  describe('getFollowedTournamentIds', () => {
    it('retorna vazio quando nada foi seguido', () => {
      expect(getFollowedTournamentIds()).toEqual([]);
    });

    it('retorna vazio se o localStorage falhar na leitura', () => {
      spyOn(localStorage, 'getItem').and.throwError('blocked');
      expect(getFollowedTournamentIds()).toEqual([]);
    });
  });

  describe('toggleFollow', () => {
    it('passa a seguir um torneio novo', () => {
      expect(toggleFollow('t1')).toBeTrue();
      expect(isFollowing('t1')).toBeTrue();
      expect(getFollowedTournamentIds()).toEqual(['t1']);
    });

    it('deixa de seguir um torneio já seguido', () => {
      toggleFollow('t1');
      expect(toggleFollow('t1')).toBeFalse();
      expect(isFollowing('t1')).toBeFalse();
      expect(getFollowedTournamentIds()).toEqual([]);
    });

    it('coloca o mais recente primeiro', () => {
      toggleFollow('t1');
      toggleFollow('t2');
      expect(getFollowedTournamentIds()).toEqual(['t2', 't1']);
    });

    it('descarta o mais antigo ao passar de 20 seguidos', () => {
      for (let i = 0; i < 21; i++) toggleFollow(`t${i}`);
      const ids = getFollowedTournamentIds();
      expect(ids.length).toBe(20);
      expect(ids[0]).toBe('t20');
      expect(ids).not.toContain('t0');
    });

    it('não muda nada se o localStorage falhar na escrita', () => {
      spyOn(localStorage, 'setItem').and.throwError('QuotaExceededError');
      expect(toggleFollow('t1')).toBeFalse();
      expect(isFollowing('t1')).toBeFalse();
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: FAIL — `Cannot find module './follow-storage'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `follow-storage.ts`**

Criar `frontend/projects/site/src/lib/follow-storage.ts`:

```ts
export const STORAGE_KEY = 'nx:torneios-seguidos';
const MAX_FOLLOWED = 20;

/** Bookmark local de torneios seguidos, sem conta — grava só no navegador do espectador.
 *  Nunca lança: `localStorage` bloqueado (modo privado, cota) vira no-op silencioso.
 *  `STORAGE_KEY` é exportada só pra specs inspecionarem/limparem o `localStorage` real —
 *  nenhum código de produção fora deste arquivo deve ler a chave direto. */
export function getFollowedTournamentIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function isFollowing(id: string): boolean {
  return getFollowedTournamentIds().includes(id);
}

/** Retorna o novo estado (`true` = passou a seguir). Falha de escrita não muda nada:
 *  retorna o estado que já existia antes da tentativa. */
export function toggleFollow(id: string): boolean {
  const current = getFollowedTournamentIds();
  const wasFollowing = current.includes(id);
  const next = wasFollowing ? current.filter((existing) => existing !== id) : [id, ...current].slice(0, MAX_FOLLOWED);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return !wasFollowing;
  } catch {
    return wasFollowing;
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: SUCCESS, 7 specs a mais que o baseline.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/site/src/lib/follow-storage.ts frontend/projects/site/src/lib/follow-storage.spec.ts
git commit -m "feat(site): bookmark local de torneios seguidos"
```

---

### Task 2: exportar `byRelevance` de `tournaments.ts`

**Files:**
- Modify: `frontend/projects/site/src/lib/firestore/tournaments.ts:54`
- Test: `frontend/projects/site/src/lib/firestore/tournaments.spec.ts` (criar)

**Interfaces:**
- Consumes: `TournamentSummary`, `TournamentListingStatus` de `./types`.
- Produces: `export function byRelevance(a: TournamentSummary, b: TournamentSummary): number` (já existia, só ganha `export`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/site/src/lib/firestore/tournaments.spec.ts`:

```ts
import { byRelevance } from './tournaments';
import type { TournamentSummary } from './types';

function fixture(overrides: Partial<TournamentSummary> & Pick<TournamentSummary, 'id' | 'listingStatus'>): TournamentSummary {
  return {
    name: 'Torneio',
    sport: 'beachTennis',
    city: null,
    state: null,
    locationName: null,
    dateLabel: null,
    startAt: null,
    endAt: null,
    featured: false,
    enrolledCount: 0,
    capacity: null,
    liveMatchesNow: 0,
    categoriesCount: 0,
    leagueId: null,
    leagueStageName: null,
    coverUrl: null,
    ...overrides,
  };
}

describe('byRelevance', () => {
  it('coloca ativos antes de encerrados', () => {
    const active = fixture({ id: 'a', listingStatus: 'open' });
    const ended = fixture({ id: 'b', listingStatus: 'ended' });
    expect([ended, active].sort(byRelevance)).toEqual([active, ended]);
  });

  it('entre ativos, o mais próximo vem primeiro', () => {
    const soon = fixture({ id: 'soon', listingStatus: 'open', startAt: new Date('2026-09-01') });
    const later = fixture({ id: 'later', listingStatus: 'open', startAt: new Date('2026-10-01') });
    expect([later, soon].sort(byRelevance)).toEqual([soon, later]);
  });

  it('entre encerrados, o mais recente vem primeiro', () => {
    const old = fixture({ id: 'old', listingStatus: 'ended', startAt: new Date('2026-01-01') });
    const recent = fixture({ id: 'recent', listingStatus: 'ended', startAt: new Date('2026-07-01') });
    expect([old, recent].sort(byRelevance)).toEqual([recent, old]);
  });

  it('sem data vai pro fim do próprio grupo', () => {
    const withDate = fixture({ id: 'withDate', listingStatus: 'open', startAt: new Date('2026-09-01') });
    const noDate = fixture({ id: 'noDate', listingStatus: 'open', startAt: null });
    expect([noDate, withDate].sort(byRelevance)).toEqual([withDate, noDate]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: FAIL de compilação — `byRelevance` não é exportado por `./tournaments`.

- [ ] **Step 3: Exportar a função**

Em `frontend/projects/site/src/lib/firestore/tournaments.ts:54`, mudar:

```ts
function byRelevance(a: TournamentSummary, b: TournamentSummary): number {
```

para:

```ts
export function byRelevance(a: TournamentSummary, b: TournamentSummary): number {
```

Nenhuma outra linha muda — o corpo da função e o uso interno em `.sort(byRelevance)` (linha 88, dentro de `getPublishedTournaments`) continuam idênticos.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: SUCCESS, 4 specs a mais que o Task 1.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/site/src/lib/firestore/tournaments.ts frontend/projects/site/src/lib/firestore/tournaments.spec.ts
git commit -m "feat(site): exporta byRelevance pra reaproveitar na home"
```

---

### Task 3: `tournament-live-link.ts` — quando linkar pro ao vivo

**Files:**
- Create: `frontend/projects/site/src/lib/tournament-live-link.ts`
- Test: `frontend/projects/site/src/lib/tournament-live-link.spec.ts`

**Interfaces:**
- Consumes: `TournamentListingStatus` de `./firestore/types`.
- Produces: `export function liveUrlFor(status: TournamentListingStatus, id: string): string | null`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/site/src/lib/tournament-live-link.spec.ts`:

```ts
import { liveUrlFor } from './tournament-live-link';
import type { TournamentListingStatus } from './firestore/types';

describe('liveUrlFor', () => {
  it('aponta pra página ao vivo quando as inscrições fecharam', () => {
    expect(liveUrlFor('closed', 'abc123')).toBe('https://organizador.nexago.com.br/t/abc123');
  });

  it('aponta pra página ao vivo quando o torneio está acontecendo', () => {
    expect(liveUrlFor('live', 'abc123')).toBe('https://organizador.nexago.com.br/t/abc123');
  });

  it('não linka nos demais status', () => {
    const rest: TournamentListingStatus[] = ['open', 'almost_full', 'ended', 'cancelled'];
    for (const status of rest) {
      expect(liveUrlFor(status, 'abc123')).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: FAIL — `Cannot find module './tournament-live-link'`.

- [ ] **Step 3: Implementar**

Criar `frontend/projects/site/src/lib/tournament-live-link.ts`:

```ts
import type { TournamentListingStatus } from './firestore/types';

const LIVE_LINK_STATUSES: ReadonlySet<TournamentListingStatus> = new Set(['closed', 'live']);

/** Só nos status em que o CTA hoje promete "acompanhe ao vivo" sem cumprir — os outros
 *  status não ganham link pra `organizador.nexago.com.br`. */
export function liveUrlFor(status: TournamentListingStatus, id: string): string | null {
  if (!LIVE_LINK_STATUSES.has(status)) return null;
  return `https://organizador.nexago.com.br/t/${id}`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: SUCCESS, 3 specs a mais que o Task 2.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/site/src/lib/tournament-live-link.ts frontend/projects/site/src/lib/tournament-live-link.spec.ts
git commit -m "feat(site): decide quando linkar pra pagina ao vivo do organizador"
```

---

### Task 4: `FollowButtonComponent`

**Files:**
- Create: `frontend/projects/site/src/app/pages/torneios/follow-button.ts`
- Test: `frontend/projects/site/src/app/pages/torneios/follow-button.spec.ts`

**Interfaces:**
- Consumes: `isFollowing`, `toggleFollow` (componente) e `STORAGE_KEY` (spec, só pra inspecionar/limpar o `localStorage` real) de `../../../lib/follow-storage` (Task 1); `ButtonDirective` de `../../shared/ui/button.directive` (já existe).
- Produces: componente standalone `FollowButtonComponent`, seletor `app-follow-button`, `input.required<string>() id`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/site/src/app/pages/torneios/follow-button.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { STORAGE_KEY } from '../../../lib/follow-storage';
import { FollowButtonComponent } from './follow-button';

describe('FollowButtonComponent', () => {
  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  async function render(id: string) {
    await TestBed.configureTestingModule({
      imports: [FollowButtonComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(FollowButtonComponent);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    return fixture;
  }

  it('começa como "Seguir" quando o torneio ainda não é seguido', async () => {
    const fixture = await render('t1');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toContain('Seguir');
    expect(button.textContent).not.toContain('Seguindo');
  });

  it('clicar passa a seguir e persiste', async () => {
    const fixture = await render('t2');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    button.click();
    await fixture.whenStable();

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('Seguindo');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual(['t2']);
  });

  it('clicar de novo desfaz o seguir', async () => {
    const fixture = await render('t3');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    button.click();
    await fixture.whenStable();
    button.click();
    await fixture.whenStable();

    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toContain('Seguir');
    expect(button.textContent).not.toContain('Seguindo');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([]);
  });

  it('reflete estado já seguido no carregamento', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['t4']));
    const fixture = await render('t4');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('Seguindo');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: FAIL — `Cannot find module './follow-button'`.

- [ ] **Step 3: Implementar**

Criar `frontend/projects/site/src/app/pages/torneios/follow-button.ts`:

```ts
import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { isFollowing, toggleFollow } from '../../../lib/follow-storage';

/**
 * Atalho local de "seguir" um torneio — grava só no `localStorage` do navegador, sem conta e
 * sem chamada de rede. Reaproveitado no botão da página do torneio; a seção "Torneios que
 * você acompanha" da home lê o mesmo `follow-storage.ts` pra hidratar a lista.
 */
@Component({
  selector: 'app-follow-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective],
  template: `
    <button
      type="button"
      nxButton="secondary"
      class="inline-flex items-center gap-2"
      [attr.aria-pressed]="following()"
      (click)="onToggle()"
    >
      <svg
        class="size-4"
        viewBox="0 0 24 24"
        [attr.fill]="following() ? 'currentColor' : 'none'"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      {{ following() ? 'Seguindo' : 'Seguir' }}
    </button>
  `,
})
export class FollowButtonComponent {
  readonly id = input.required<string>();

  protected readonly following = signal(false);

  constructor() {
    effect(() => {
      this.following.set(isFollowing(this.id()));
    });
  }

  protected onToggle(): void {
    this.following.set(toggleFollow(this.id()));
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: SUCCESS, 4 specs a mais que o Task 3.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/site/src/app/pages/torneios/follow-button.ts frontend/projects/site/src/app/pages/torneios/follow-button.spec.ts
git commit -m "feat(site): botao Seguir/Seguindo isolado, sem Firestore"
```

---

### Task 5: ligar o botão e o link ao vivo em `torneio-detail.page.ts`

**Files:**
- Modify: `frontend/projects/site/src/app/pages/torneios/torneio-detail.page.ts`

**Interfaces:**
- Consumes: `FollowButtonComponent` (Task 4), `liveUrlFor` (Task 3).
- Produces: nada de novo pra outras tasks consumirem — é o ponto final de integração.

Sem spec novo aqui: `torneio-detail.page.ts` já chama `getTournamentById` direto no `constructor`/`effect()`, sem DI, e nenhuma das 3 páginas do site que fazem isso tem teste hoje (ver Global Constraints) — a lógica nova em si (`liveUrlFor`, `FollowButtonComponent`) já está 100% coberta nas Tasks 3 e 4. Esta task é só fiação de template, verificada visualmente na Task 8.

- [ ] **Step 1: Importar o componente e a função**

No topo de `frontend/projects/site/src/app/pages/torneios/torneio-detail.page.ts`, adicionar aos imports existentes (logo abaixo da linha `import { SpotlightCard } from '../../shared/ui/spotlight-card';`):

```ts
import { FollowButtonComponent } from './follow-button';
import { liveUrlFor } from '../../../lib/tournament-live-link';
```

- [ ] **Step 2: Adicionar `FollowButtonComponent` ao array `imports` do `@Component`**

Mudar:

```ts
  imports: [RouterLink, TournamentHero, RevealDirective, ButtonDirective, SpotlightCard],
```

para:

```ts
  imports: [RouterLink, TournamentHero, RevealDirective, ButtonDirective, SpotlightCard, FollowButtonComponent],
```

- [ ] **Step 3: Inserir o botão "Seguir" logo após a hero**

Mudar o início do bloco de conteúdo (logo depois de `<app-tournament-hero [t]="t" />`):

```html
        <div class="mx-auto max-w-4xl px-5 sm:px-6">
          @if (t.description; as description) {
```

para:

```html
        <div class="mx-auto max-w-4xl px-5 sm:px-6">
          <div nxReveal class="flex justify-end pt-8">
            <app-follow-button [id]="t.id" />
          </div>

          @if (t.description; as description) {
```

- [ ] **Step 4: Ligar `liveUrlFor` como binding protegido**

Junto das outras funções já vinculadas (logo abaixo de `protected readonly formatCents = formatCents;`), adicionar:

```ts
  protected readonly liveUrlFor = liveUrlFor;
```

- [ ] **Step 5: Trocar o CTA primário em `closed`/`live` pelo link ao vivo**

Mudar o bloco de botões do rodapé:

```html
              <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                @if (acceptsRegistration(t.listingStatus)) {
                  <a
                    nxButton="primary"
                    [href]="'https://atleta.nexago.com.br/torneios/' + t.id + '/inscricao'"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="w-full sm:w-auto"
                  >
                    Inscreva-se
                  </a>
                } @else {
                  <a nxButton="primary" routerLink="/torneios" class="w-full sm:w-auto">Ver torneios abertos</a>
                }
```

para:

```html
              <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                @if (acceptsRegistration(t.listingStatus)) {
                  <a
                    nxButton="primary"
                    [href]="'https://atleta.nexago.com.br/torneios/' + t.id + '/inscricao'"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="w-full sm:w-auto"
                  >
                    Inscreva-se
                  </a>
                } @else if (liveUrlFor(t.listingStatus, t.id); as liveUrl) {
                  <a nxButton="primary" [href]="liveUrl" target="_blank" rel="noopener noreferrer" class="w-full sm:w-auto">
                    Acompanhar ao vivo
                  </a>
                } @else {
                  <a nxButton="primary" routerLink="/torneios" class="w-full sm:w-auto">Ver torneios abertos</a>
                }
```

(O botão "Baixar o app" logo abaixo não muda.)

- [ ] **Step 6: Rodar a suíte inteira e confirmar que nada quebrou**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: SUCCESS, mesma contagem de specs do Task 4 (esta task não adiciona teste, só fiação).

- [ ] **Step 7: Type-check do projeto**

```bash
cd frontend && npx ng build site --configuration development
```

Esperado: build sem erros de tipo (confirma que os `@if`/`@else if` do template e o `liveUrlFor` batem com os tipos).

- [ ] **Step 8: Commit**

```bash
git add frontend/projects/site/src/app/pages/torneios/torneio-detail.page.ts
git commit -m "feat(site): botao Seguir e link ao vivo na pagina do torneio"
```

---

### Task 6: `acompanhando-selectors.ts` — filtra e ordena os seguidos

**Files:**
- Create: `frontend/projects/site/src/app/pages/home/sections/acompanhando-selectors.ts`
- Test: `frontend/projects/site/src/app/pages/home/sections/acompanhando-selectors.spec.ts`

**Interfaces:**
- Consumes: `byRelevance` de `../../../../lib/firestore/tournaments` (Task 2); `TournamentSummary` de `../../../../lib/firestore/types`.
- Produces: `export function visibleFollowedTournaments(results: readonly (TournamentSummary | null)[]): TournamentSummary[]`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `frontend/projects/site/src/app/pages/home/sections/acompanhando-selectors.spec.ts`:

```ts
import { visibleFollowedTournaments } from './acompanhando-selectors';
import type { TournamentSummary } from '../../../../lib/firestore/types';

function fixture(overrides: Partial<TournamentSummary> & Pick<TournamentSummary, 'id' | 'listingStatus'>): TournamentSummary {
  return {
    name: 'Torneio',
    sport: 'beachTennis',
    city: null,
    state: null,
    locationName: null,
    dateLabel: null,
    startAt: null,
    endAt: null,
    featured: false,
    enrolledCount: 0,
    capacity: null,
    liveMatchesNow: 0,
    categoriesCount: 0,
    leagueId: null,
    leagueStageName: null,
    coverUrl: null,
    ...overrides,
  };
}

describe('visibleFollowedTournaments', () => {
  it('descarta ids que não resolveram (torneio apagado/despublicado)', () => {
    const active = fixture({ id: 'a', listingStatus: 'open' });
    expect(visibleFollowedTournaments([null, active])).toEqual([active]);
  });

  it('ordena por relevância (ativos primeiro)', () => {
    const ended = fixture({ id: 'ended', listingStatus: 'ended' });
    const active = fixture({ id: 'active', listingStatus: 'open' });
    expect(visibleFollowedTournaments([ended, active])).toEqual([active, ended]);
  });

  it('retorna vazio quando nenhum id resolveu', () => {
    expect(visibleFollowedTournaments([null, null])).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: FAIL — `Cannot find module './acompanhando-selectors'`.

- [ ] **Step 3: Implementar**

Criar `frontend/projects/site/src/app/pages/home/sections/acompanhando-selectors.ts`:

```ts
import { byRelevance } from '../../../../lib/firestore/tournaments';
import type { TournamentSummary } from '../../../../lib/firestore/types';

/** `getTournamentById` devolve `null` pra id apagado/despublicado — filtra sem remover do
 *  `localStorage` (pode voltar a existir) e ordena com o mesmo critério de `/torneios`. */
export function visibleFollowedTournaments(
  results: readonly (TournamentSummary | null)[],
): TournamentSummary[] {
  return results.filter((t): t is TournamentSummary => t !== null).sort(byRelevance);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: SUCCESS, 3 specs a mais que o Task 5.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/site/src/app/pages/home/sections/acompanhando-selectors.ts frontend/projects/site/src/app/pages/home/sections/acompanhando-selectors.spec.ts
git commit -m "feat(site): filtra e ordena torneios seguidos pra home"
```

---

### Task 7: `AcompanhandoSection` na home

**Files:**
- Create: `frontend/projects/site/src/app/pages/home/sections/acompanhando.ts`
- Modify: `frontend/projects/site/src/app/pages/home/home.page.ts`

**Interfaces:**
- Consumes: `getFollowedTournamentIds` (Task 1); `getTournamentById` (já existe); `visibleFollowedTournaments` (Task 6); `TournamentCard` (`../../torneios/tournament-card`, já existe); `RevealDirective` (já existe).
- Produces: componente standalone `AcompanhandoSection`, seletor `app-acompanhando-section`, sem inputs.

Sem spec novo neste componente: é fiação fina (lê `localStorage`, dispara `getTournamentById`), mesmo padrão sem teste que `torneios-destaque.ts` (seu vizinho direto) já tem hoje. A lógica que merece teste (filtrar + ordenar) já foi coberta na Task 6.

- [ ] **Step 1: Implementar a seção**

Criar `frontend/projects/site/src/app/pages/home/sections/acompanhando.ts`:

```ts
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RevealDirective } from '../../../shared/reveal.directive';
import { TournamentCard } from '../../torneios/tournament-card';
import { getFollowedTournamentIds } from '../../../../lib/follow-storage';
import { getTournamentById } from '../../../../lib/firestore/tournaments';
import { visibleFollowedTournaments } from './acompanhando-selectors';
import type { TournamentSummary } from '../../../../lib/firestore/types';

/**
 * "Torneios que você acompanha" — só aparece pra quem já seguiu pelo menos um torneio
 * (`follow-storage.ts`, sem conta). Sem seguidos, a seção não renderiza nada.
 */
@Component({
  selector: 'app-acompanhando-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDirective, TournamentCard],
  template: `
    @if (tournaments().length > 0) {
      <section class="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <div nxReveal>
          <p class="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Seus torneios</p>
          <h2 class="font-display text-[clamp(1.7rem,4.5vw,2.5rem)] font-700 leading-tight tracking-tight text-fg">
            Torneios que você acompanha
          </h2>
        </div>
        <ul class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          @for (t of tournaments(); track t.id) {
            <li class="h-full">
              <app-tournament-card [t]="t" />
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class AcompanhandoSection {
  protected readonly tournaments = signal<TournamentSummary[]>([]);

  constructor() {
    const ids = getFollowedTournamentIds();
    if (ids.length === 0) return;
    Promise.all(ids.map((id) => getTournamentById(id))).then((results) => {
      this.tournaments.set(visibleFollowedTournaments(results));
    });
  }
}
```

- [ ] **Step 2: Inserir na home**

Em `frontend/projects/site/src/app/pages/home/home.page.ts`, adicionar o import (junto dos outros de `./sections/*`):

```ts
import { AcompanhandoSection } from './sections/acompanhando';
```

Adicionar `AcompanhandoSection` ao array `imports` do `@Component` (junto de `CinematicHero`, `FeaturesSection`, etc.).

No template, inserir logo após `<app-cinematic-hero />` e antes de `<app-features />`:

```html
    <app-cinematic-hero />
    <app-acompanhando-section />
    <app-features />
```

- [ ] **Step 3: Rodar a suíte inteira**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: SUCCESS, mesma contagem de specs do Task 6 (este componente não ganha spec própria).

- [ ] **Step 4: Type-check do projeto**

```bash
cd frontend && npx ng build site --configuration development
```

Esperado: build sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/site/src/app/pages/home/sections/acompanhando.ts frontend/projects/site/src/app/pages/home/home.page.ts
git commit -m "feat(site): secao Torneios que voce acompanha na home"
```

---

### Task 8: Verificação end-to-end no navegador

Sem código novo — confirma visualmente o que as Tasks 1–7 não cobrem por teste automatizado (a fiação Firestore-driven dos componentes de página).

- [ ] **Step 1: Rodar a suíte completa uma última vez**

```bash
cd frontend && npx ng test site --watch=false --browsers=ChromeHeadless
```

Esperado: SUCCESS, 21 specs no total (7 + 4 + 3 + 4 + 3 das Tasks 1, 2, 3, 4, 6 — Tasks 5 e 7 não somam specs).

- [ ] **Step 2: Subir o dev server do site e abrir uma página de torneio**

Usar o preview do site (`.claude/launch.json`, config `site` se existir, senão `cd frontend && npx ng serve site`), navegar até `/torneios`, abrir qualquer torneio com inscrições **abertas** (`open`/`almost_full`).

Verificar:
- O botão "Seguir" aparece logo abaixo da hero, começa como "Seguir" (não seguindo).
- O CTA do rodapé continua "Inscreva-se" (nada muda pra este status).

- [ ] **Step 3: Clicar em "Seguir" e verificar persistência**

Clicar no botão → vira "Seguindo". Recarregar a página (F5) → continua "Seguindo" (persistiu no `localStorage`). Inspecionar Application → Local Storage → chave `nx:torneios-seguidos` deve conter o id do torneio.

- [ ] **Step 4: Verificar o link ao vivo num torneio `closed` ou `live`**

Se houver um torneio nesse status no ambiente de dev, abrir sua página e confirmar que o botão primário do rodapé virou "Acompanhar ao vivo" apontando pra `https://organizador.nexago.com.br/t/{id}` (conferir o `href` no DevTools, não precisa navegar de verdade pra lá). Se não houver torneio `closed`/`live` disponível no ambiente, pular este passo e anotar como pendência de verificação manual pós-deploy.

- [ ] **Step 5: Verificar a seção da home**

Voltar pra `/` (home). Confirmar que a seção "Torneios que você acompanha" aparece logo após o hero, mostrando o card do torneio seguido no Step 3. Deixar de seguir (voltar na página do torneio e clicar de novo) e recarregar a home → a seção deve sumir (sem card nenhum).

- [ ] **Step 6: Reportar o resultado**

Sem commit nesta task — é só verificação. Se algo do Step 2–5 não bater com o esperado, voltar pra task correspondente (5 ou 7) e corrigir antes de considerar o plano concluído.
