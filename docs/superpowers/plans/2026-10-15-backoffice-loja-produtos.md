# Backoffice · Loja · menu + tela de Produtos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pôr a área Loja na sidebar do backoffice e entregar a tela de Produtos funcionando sobre dados de exemplo.

**Architecture:** O `panel-shell` ganha um tipo de item de nav em união discriminada (link / em breve / grupo), e a Loja entra como grupo com 8 filhos, dos quais só Produtos tem rota. A tela de Produtos segue o padrão das telas existentes do painel — componente standalone com signals, repositório em `data/`, lógica de filtro em funções puras testadas à parte. Não há backend nesta fase: o repositório devolve um array de exemplo com a mesma assinatura assíncrona que a versão real vai ter.

**Tech Stack:** Angular standalone (sem NgModules), signals (`signal`/`computed`, sem `effect`), `ChangeDetectionStrategy.OnPush`, zoneless (`provideZonelessChangeDetection`), Karma + Jasmine, CSS com as variáveis `--nx-*` e as classes globais `bo-*` de `src/styles.css`.

**Spec:** `docs/superpowers/specs/2026-10-15-backoffice-loja-produtos-design.md`

## Global Constraints

- Todo caminho é relativo a `frontend/` (raiz do workspace Angular). Comandos rodam de lá.
- Rodar testes: `npx ng test backoffice --watch=false --browsers=ChromeHeadless`. Um arquivo só: acrescentar `--include='**/<arquivo>.spec.ts'`.
- Build (único que checa template): `npx ng build backoffice`.
- Componentes: standalone sem `standalone: true`, `ChangeDetectionStrategy.OnPush`, `input()`/`output()` em vez de decorators, `@if`/`@for` em vez de `*ngIf`/`*ngFor`, `class`/`style` bindings em vez de `ngClass`/`ngStyle`, `inject()` em vez de injeção por construtor.
- Proibido `effect()` neste trabalho: derivar com `computed()`. (Ler signal dentro de helper chamado por `effect` já rendeu loop neste repositório.)
- Strings de UI em português, código em inglês.
- Dinheiro em centavos inteiros; formatação com `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` no topo do arquivo, como `panel-financeiro.component.ts` já faz.
- Ao escrever a regex de remoção de acento, digitar os escapes `̀-ͯ`. Nunca colar caracteres combinantes literais no arquivo.
- Prettier: `printWidth: 100`, `singleQuote: true`.
- Commits em português, sem escopo inventado, terminando com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Review Focus

1. **Busca com acento e caixa diferentes** — digitar `oculos` precisa achar "Óculos Polarizado Sunline". Teste na Task 4.
2. **Borda `stock === lowStockThreshold`** — é "baixo", não "ok". Um `<` no lugar de `<=` passa despercebido no olho. Teste na Task 4.
3. **Produto sem coleção** (`NX-MOC`, `collections: []`) — filtrar por coleção não pode quebrar, e sem filtro ele continua na lista. Teste na Task 4.
4. **Desligar o toggle com a aba "Ativos" aberta** — a linha some da lista e o contador cai; e se ela estava selecionada, a seleção não pode ficar apontando para uma linha invisível. Testes nas Tasks 6 e 8.
5. **Query string inválida** (`?aba=xpto`, `?categoria=foo`) — cai no padrão em vez de devolver lista vazia sem explicação. Teste na Task 4.

---

## Arquivos

Em `projects/backoffice/src/app/painel/`:

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `ui/icon.component.ts` *(modificar)* | ícone `bag` | 1 |
| `ui/panel-shell.component.ts` *(modificar)* | nav tipada; grupo, submenu e badge | 1, 2 |
| `ui/panel-shell.component.spec.ts` *(criar)* | o que a sidebar renderiza | 1, 2 |
| `loja/produtos/data/products.repository.ts` *(criar)* | tipos `StoreProduct` e leitura | 3 |
| `loja/produtos/data/products.mock.ts` *(criar)* | os 8 produtos de exemplo | 3 |
| `loja/produtos/data/products.mock.spec.ts` *(criar)* | integridade do exemplo | 3 |
| `loja/produtos/data/product-filters.ts` *(criar)* | estado de estoque, busca, filtro, contadores, URL | 4 |
| `loja/produtos/data/product-filters.spec.ts` *(criar)* | testes das funções puras | 4 |
| `loja/produtos/ui/product-row.component.ts` *(criar)* | uma linha da tabela | 5 |
| `loja/produtos/panel-produtos.component.ts` *(criar)* | a tela | 5–8 |
| `loja/produtos/panel-produtos.component.spec.ts` *(criar)* | fiação da tela | 5–8 |
| `app.routes.ts` *(modificar)* | rota `/painel/loja/produtos` | 5 |

---

### Task 1: Nav tipada e ícone `bag`

Refatoração sem mudança de comportamento, para abrir espaço ao grupo. Hoje `route: string | null` carrega dois significados (tem rota / é "Em breve"), e um terceiro (é grupo) não caberia.

**Files:**
- Modify: `projects/backoffice/src/app/painel/ui/icon.component.ts`
- Modify: `projects/backoffice/src/app/painel/ui/panel-shell.component.ts`
- Test: `projects/backoffice/src/app/painel/ui/panel-shell.component.spec.ts` (criar)

**Interfaces:**
- Consumes: nada.
- Produces: `PanelIconName` ganha `'bag'`. `PanelNavItem` vira `NavLink | NavSoon | NavGroup` (exportado do `panel-shell.component.ts`).

- [ ] **Step 1: Escrever o teste que falha**

Criar `projects/backoffice/src/app/painel/ui/panel-shell.component.spec.ts`:

```ts
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { PanelShellComponent } from './panel-shell.component';

describe('PanelShellComponent', () => {
  async function mount(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [PanelShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelShellComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const labels = (host: HTMLElement, selector: string) =>
    [...host.querySelectorAll(selector)].map((e) => e.textContent!.trim());

  it('renderiza os itens com rota como link', async () => {
    const host = await mount();
    const links = labels(host, 'a.nav-item');
    expect(links).toContain('Início');
    expect(links).toContain('Financeiro');
  });

  it('renderiza item sem rota como "Em breve" e não navegável', async () => {
    const host = await mount();
    const soon = [...host.querySelectorAll('.nav-item.disabled')].map((e) => e.textContent!.trim());
    expect(soon.some((t) => t.startsWith('Moderação'))).toBeTrue();
    expect(host.querySelector('a.nav-item[href*="moderacao"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/panel-shell.component.spec.ts'`
Esperado: FAIL — o arquivo de spec é novo; se o shell já estiver correto os dois podem passar de primeira. Nesse caso o teste é a rede de segurança do refactor: siga para o Step 3 e garanta que continuam passando no Step 5.

- [ ] **Step 3: Adicionar o ícone `bag`**

Em `icon.component.ts`, acrescentar `| 'bag'` ao `PanelIconName` (depois de `'archive'`) e o caso no `@switch`, junto dos demais:

```html
@case ('bag') {
  <path d="M6 8h12l-1 11.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5Z" />
  <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
}
```

- [ ] **Step 4: Trocar `PanelNavItem` pela união discriminada**

Em `panel-shell.component.ts`, substituir a interface e o `NAV_ITEMS`:

```ts
export interface NavLink {
  kind: 'link';
  id: string;
  label: string;
  icon: PanelIconName;
  route: string;
  badge?: number;
}

export interface NavSoon {
  kind: 'soon';
  id: string;
  label: string;
  icon: PanelIconName;
  badge?: number;
}

export interface NavGroup {
  kind: 'group';
  id: string;
  label: string;
  icon: PanelIconName;
  children: ReadonlyArray<NavLink | NavSoon>;
}

/** Um nível só de aninhamento: grupo não entra dentro de grupo. */
export type PanelNavItem = NavLink | NavSoon | NavGroup;

const NAV_ITEMS: readonly PanelNavItem[] = [
  { kind: 'link', id: 'inicio', label: 'Início', icon: 'home', route: '/painel' },
  { kind: 'link', id: 'arenas', label: 'Arenas', icon: 'arena', route: '/painel/arenas' },
  {
    kind: 'link',
    id: 'arenas-pre-cadastro',
    label: 'Pré-cadastradas',
    icon: 'arena',
    route: '/painel/arenas/pre-cadastro',
  },
  { kind: 'link', id: 'torneios', label: 'Torneios', icon: 'trophy', route: '/painel/torneios' },
  { kind: 'link', id: 'avaliacoes', label: 'Avaliações', icon: 'star', route: '/painel/avaliacoes' },
  {
    kind: 'link',
    id: 'organizadores',
    label: 'Organizadores',
    icon: 'id-badge',
    route: '/painel/organizadores',
  },
  { kind: 'link', id: 'atletas', label: 'Atletas', icon: 'users', route: '/painel/atletas' },
  { kind: 'link', id: 'financeiro', label: 'Financeiro', icon: 'cash', route: '/painel/financeiro' },
  { kind: 'soon', id: 'moderacao', label: 'Moderação', icon: 'shield' },
  { kind: 'link', id: 'equipe', label: 'Equipe', icon: 'team', route: '/painel/equipe' },
];
```

No template, trocar o `@if (item.route) { … } @else { … }` por `@switch` (o caso `'group'` entra na Task 2; por ora ele não existe em `NAV_ITEMS`):

```html
@for (item of navItems; track item.id) {
  @switch (item.kind) {
    @case ('link') {
      <a class="nav-item" [class.active]="activeId() === item.id" [routerLink]="item.route">
        <bo-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
        <span>{{ item.label }}</span>
      </a>
    }
    @case ('soon') {
      <div class="nav-item disabled" title="Em breve">
        <bo-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
        <span>{{ item.label }}</span>
        <span class="soon">Em breve</span>
      </div>
    }
  }
}
```

Nada muda em `activeId`, `profileActive`, `displayName`, `initials` nem no CSS.

- [ ] **Step 5: Rodar os testes e o build**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/panel-shell.component.spec.ts'`
Esperado: PASS (2 testes).

Run: `npx ng build backoffice`
Esperado: build limpo. Este passo não é opcional: `tsc` e Karma não checam template, e um `item.route` sobrevivente num ramo errado só aparece aqui.

- [ ] **Step 6: Commit**

```bash
git add projects/backoffice/src/app/painel/ui/icon.component.ts \
        projects/backoffice/src/app/painel/ui/panel-shell.component.ts \
        projects/backoffice/src/app/painel/ui/panel-shell.component.spec.ts
git commit -m "refactor(backoffice): nav do painel em uniao discriminada e icone bag

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Grupo Loja no shell

**Files:**
- Modify: `projects/backoffice/src/app/painel/ui/panel-shell.component.ts`
- Test: `projects/backoffice/src/app/painel/ui/panel-shell.component.spec.ts`

**Interfaces:**
- Consumes: `NavGroup`, `PanelNavItem` da Task 1.
- Produces: no shell, `openGroupIds(): ReadonlySet<string>` e `toggleGroup(id: string): void` (protected, usados só pelo template). `activeId()` passa a devolver `'loja-produtos'` dentro de `/painel/loja/produtos`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao `panel-shell.component.spec.ts`:

```ts
it('mostra o grupo Loja fechado fora da área, com os filhos escondidos', async () => {
  const host = await mount();
  const group = host.querySelector('button.nav-item')!;
  expect(group.textContent!.trim()).toContain('Loja');
  expect(group.getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector('.subnav')).toBeNull();
});

it('abre o grupo no clique e fecha no clique seguinte', async () => {
  const host = await mount();
  const group = host.querySelector('button.nav-item') as HTMLButtonElement;

  group.click();
  await TestBed.inject(ApplicationRef).whenStable();
  expect(group.getAttribute('aria-expanded')).toBe('true');
  const children = [...host.querySelectorAll('.subnav .nav-item')].map((e) => e.textContent!.trim());
  expect(children.some((t) => t.startsWith('Produtos'))).toBeTrue();
  expect(children.some((t) => t.startsWith('Pedidos'))).toBeTrue();

  group.click();
  await TestBed.inject(ApplicationRef).whenStable();
  expect(group.getAttribute('aria-expanded')).toBe('false');
});

it('só Produtos é link; os outros filhos são "Em breve"', async () => {
  const host = await mount();
  (host.querySelector('button.nav-item') as HTMLButtonElement).click();
  await TestBed.inject(ApplicationRef).whenStable();

  const links = [...host.querySelectorAll('.subnav a.nav-item')].map((e) => e.textContent!.trim());
  expect(links.length).toBe(1);
  expect(links[0]).toContain('Produtos');
  expect(host.querySelector('.subnav a.nav-item')!.getAttribute('href')).toBe('/painel/loja/produtos');
});

it('mostra o badge dos filhos que têm contador', async () => {
  const host = await mount();
  (host.querySelector('button.nav-item') as HTMLButtonElement).click();
  await TestBed.inject(ApplicationRef).whenStable();

  const pedidos = [...host.querySelectorAll('.subnav .nav-item')].find((e) =>
    e.textContent!.includes('Pedidos'),
  )!;
  expect(pedidos.querySelector('.badge')!.textContent!.trim()).toBe('12');
});
```

Acrescentar `ApplicationRef` ao import de `@angular/core` no topo do arquivo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/panel-shell.component.spec.ts'`
Esperado: FAIL — `button.nav-item` não existe (`host.querySelector(...)` devolve `null`).

- [ ] **Step 3: Acrescentar o grupo ao `NAV_ITEMS`**

Antes de `NAV_ITEMS`, a constante dos contadores provisórios:

```ts
/** Contadores de exemplo: saem quando a Loja tiver backend. */
const LOJA_BADGES = { pedidos: 12, personalizados: 2, estoque: 4, trocas: 2 } as const;

const LOJA_GROUP: NavGroup = {
  kind: 'group',
  id: 'loja',
  label: 'Loja',
  icon: 'bag',
  children: [
    { kind: 'soon', id: 'loja-visao-geral', label: 'Visão geral', icon: 'trend-up' },
    { kind: 'soon', id: 'loja-pedidos', label: 'Pedidos', icon: 'file', badge: LOJA_BADGES.pedidos },
    {
      kind: 'soon',
      id: 'loja-personalizados',
      label: 'Personalizados',
      icon: 'edit',
      badge: LOJA_BADGES.personalizados,
    },
    { kind: 'link', id: 'loja-produtos', label: 'Produtos', icon: 'archive', route: '/painel/loja/produtos' },
    { kind: 'soon', id: 'loja-estoque', label: 'Estoque', icon: 'archive', badge: LOJA_BADGES.estoque },
    { kind: 'soon', id: 'loja-retirada', label: 'Retirada & frete', icon: 'swap' },
    { kind: 'soon', id: 'loja-cupons', label: 'Cupons & promoções', icon: 'ticket', badge: LOJA_BADGES.trocas },
    { kind: 'soon', id: 'loja-trocas', label: 'Trocas', icon: 'swap', badge: LOJA_BADGES.trocas },
  ],
};
```

Atenção: `Cupons & promoções` leva badge `2` e `Trocas` leva badge `2` — são números iguais vindos de chaves diferentes. Corrigir a linha de cupons para `LOJA_BADGES.cupons` e acrescentar `cupons: 2` à constante, senão um ajuste futuro em trocas mexe nos dois.

Inserir `LOJA_GROUP` em `NAV_ITEMS` entre `financeiro` e `moderacao`.

- [ ] **Step 4: Renderizar o grupo**

No `@switch` do template, acrescentar o caso:

```html
@case ('group') {
  <button
    type="button"
    class="nav-item group"
    [class.active]="openGroupIds().has(item.id)"
    [attr.aria-expanded]="openGroupIds().has(item.id)"
    (click)="toggleGroup(item.id)"
  >
    <bo-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
    <span>{{ item.label }}</span>
    <bo-icon [name]="openGroupIds().has(item.id) ? 'chevron-down' : 'chevron-right'" [size]="13" />
  </button>

  @if (openGroupIds().has(item.id)) {
    <div class="subnav">
      @for (child of item.children; track child.id) {
        @switch (child.kind) {
          @case ('link') {
            <a class="nav-item" [class.active]="activeId() === child.id" [routerLink]="child.route">
              <span>{{ child.label }}</span>
              @if (child.badge) {
                <span class="badge">{{ child.badge }}</span>
              }
            </a>
          }
          @case ('soon') {
            <div class="nav-item disabled" title="Em breve">
              <span>{{ child.label }}</span>
              @if (child.badge) {
                <span class="badge">{{ child.badge }}</span>
              }
            </div>
          }
        }
      }
    </div>
  }
}
```

- [ ] **Step 5: Abertura sem `effect`**

Acrescentar à classe, ao lado de `activeId`:

```ts
private readonly manualOpen = signal<{ url: string; ids: ReadonlySet<string> } | null>(null);

/** Grupos que a rota ativa abre sozinha. */
private readonly routeOpenIds = computed<ReadonlySet<string>>(() => {
  const path = this.currentPath();
  const ids = new Set<string>();
  for (const item of NAV_ITEMS) {
    if (item.kind !== 'group') {
      continue;
    }
    if (item.children.some((c) => c.kind === 'link' && path.startsWith(c.route))) {
      ids.add(item.id);
    }
  }
  return ids;
});

/** O clique do usuário manda enquanto ele fica na mesma URL; navegar devolve o comando à rota. */
protected readonly openGroupIds = computed<ReadonlySet<string>>(() => {
  const manual = this.manualOpen();
  return manual && manual.url === this.currentPath() ? manual.ids : this.routeOpenIds();
});

protected toggleGroup(id: string): void {
  const ids = new Set(this.openGroupIds());
  if (ids.has(id)) {
    ids.delete(id);
  } else {
    ids.add(id);
  }
  this.manualOpen.set({ url: this.currentPath(), ids });
}
```

Importar `signal` de `@angular/core`.

Em `activeId()`, acrescentar antes do `if (path === '/painel')`:

```ts
if (path.startsWith('/painel/loja/produtos')) {
  return 'loja-produtos';
}
```

- [ ] **Step 6: Estilo do submenu**

Acrescentar ao bloco `styles`, depois de `.nav-item .soon`:

```css
button.nav-item {
  width: 100%;
  background: transparent;
  border: none;
  font: inherit;
  cursor: pointer;
  transition: background 140ms var(--nx-ease-out);
}

button.nav-item:hover {
  background: var(--nx-surface-1);
}

.subnav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 4px 15px;
  padding-left: 11px;
  border-left: 1px solid var(--nx-line);
}

.subnav .nav-item {
  height: 32px;
  font-size: 12.5px;
  font-weight: 500;
  gap: 8px;
}

.subnav .nav-item.active::before {
  left: -12px;
}

.badge {
  font-family: var(--nx-font-mono);
  font-size: 9px;
  font-weight: 600;
  min-width: 18px;
  height: 17px;
  padding: 0 5px;
  border-radius: var(--nx-r-pill);
  background: var(--nx-surface-2);
  color: var(--nx-text-mute);
  display: inline-grid;
  place-items: center;
}
```

- [ ] **Step 7: Rodar os testes e o build**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/panel-shell.component.spec.ts'`
Esperado: PASS (6 testes).

Run: `npx ng build backoffice`
Esperado: build limpo.

- [ ] **Step 8: Commit**

```bash
git add projects/backoffice/src/app/painel/ui/panel-shell.component.ts \
        projects/backoffice/src/app/painel/ui/panel-shell.component.spec.ts
git commit -m "feat(backoffice): grupo Loja na sidebar com submenu e contadores

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Tipos, dados de exemplo e repositório

**Files:**
- Create: `projects/backoffice/src/app/painel/loja/produtos/data/products.repository.ts`
- Create: `projects/backoffice/src/app/painel/loja/produtos/data/products.mock.ts`
- Test: `projects/backoffice/src/app/painel/loja/produtos/data/products.mock.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `StoreProduct`, `ProductCategory`, `ProductChannel`, `PRODUCT_CATEGORY_LABELS`, `ProductsRepository.list(): Promise<StoreProduct[]>`, `STORE_PRODUCTS: readonly StoreProduct[]`.

- [ ] **Step 1: Escrever o teste que falha**

`products.mock.spec.ts`:

```ts
import { STORE_PRODUCTS } from './products.mock';
import { ProductsRepository } from './products.repository';

describe('dados de exemplo da loja', () => {
  it('tem os 8 produtos do desenho, com SKU único', () => {
    expect(STORE_PRODUCTS.length).toBe(8);
    expect(new Set(STORE_PRODUCTS.map((p) => p.sku)).size).toBe(8);
    expect(new Set(STORE_PRODUCTS.map((p) => p.id)).size).toBe(8);
  });

  it('soma 31 SKUs, 7 ativos e 1 esgotado', () => {
    expect(STORE_PRODUCTS.reduce((t, p) => t + p.variations, 0)).toBe(31);
    expect(STORE_PRODUCTS.filter((p) => p.active).length).toBe(7);
    expect(STORE_PRODUCTS.filter((p) => p.stock === 0).length).toBe(1);
    expect(STORE_PRODUCTS.filter((p) => p.status === 'rascunho').length).toBe(0);
  });

  it('entrega cópias, para a tela não escrever no módulo', async () => {
    const repo = new ProductsRepository();
    const first = await repo.list();
    first[0]!.active = !first[0]!.active;
    const second = await repo.list();
    expect(second[0]!.active).toBe(STORE_PRODUCTS[0]!.active);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/products.mock.spec.ts'`
Esperado: FAIL — `Cannot find module './products.mock'`.

- [ ] **Step 3: Escrever o repositório**

`products.repository.ts`:

```ts
import { Injectable } from '@angular/core';
import { STORE_PRODUCTS } from './products.mock';

export type ProductCategory = 'bolas' | 'vestuario' | 'acessorios' | 'rede-quadra' | 'kits';
export type ProductChannel = 'web' | 'app';

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  bolas: 'Bolas',
  vestuario: 'Vestuário',
  acessorios: 'Acessórios',
  'rede-quadra': 'Rede & quadra',
  kits: 'Kits',
};

export interface StoreProduct {
  id: string;
  name: string;
  sku: string;
  /** Códigos das variações, só para a busca ter o que casar. */
  barcodes: string[];
  category: ProductCategory;
  collections: string[];
  /** Quantidade de SKUs filhos. */
  variations: number;
  priceCents: number;
  /** Preço antigo, riscado na tela. */
  compareAtPriceCents: number | null;
  stock: number;
  lowStockThreshold: number;
  soldLast30: number;
  channels: ProductChannel[];
  /** `rascunho` nunca foi ao ar; `active` é o toggle de um publicado. */
  status: 'ativo' | 'rascunho';
  active: boolean;
  imageUrl: string | null;
}

/**
 * Leitura dos produtos da loja.
 *
 * Fase de desenho: devolve os dados de exemplo. A assinatura é a mesma que a versão
 * com Firestore vai ter, então a troca não encosta na tela.
 */
@Injectable({ providedIn: 'root' })
export class ProductsRepository {
  list(): Promise<StoreProduct[]> {
    return Promise.resolve(STORE_PRODUCTS.map((p) => ({ ...p })));
  }
}
```

- [ ] **Step 4: Escrever os dados de exemplo**

`products.mock.ts` — os 8 do desenho. Todos `status: 'ativo'`, `channels: ['web', 'app']`, `imageUrl: null`:

```ts
import type { StoreProduct } from './products.repository';

const COMMON = {
  status: 'ativo',
  channels: ['web', 'app'],
  imageUrl: null,
} satisfies Pick<StoreProduct, 'status' | 'channels' | 'imageUrl'>;

/** Dados de exemplo da tela de Produtos. Saem quando a loja tiver backend. */
export const STORE_PRODUCTS: readonly StoreProduct[] = [
  {
    ...COMMON,
    id: 'p-bola-pro-beach',
    name: 'Bola NexaGO Pro Beach',
    sku: 'NX-BOL',
    barcodes: ['7891000100011', '7891000100028'],
    category: 'bolas',
    collections: ['linha-pro'],
    variations: 2,
    priceCents: 28990,
    compareAtPriceCents: 32990,
    stock: 86,
    lowStockThreshold: 10,
    soldLast30: 64,
    active: true,
  },
  {
    ...COMMON,
    id: 'p-camiseta-dry-uv50',
    name: 'Camiseta Dry UV50 Areia',
    sku: 'NX-CAM',
    barcodes: ['7891000200017'],
    category: 'vestuario',
    collections: ['verao-2026'],
    variations: 15,
    priceCents: 12990,
    compareAtPriceCents: null,
    stock: 34,
    lowStockThreshold: 10,
    soldLast30: 51,
    active: true,
  },
  {
    ...COMMON,
    id: 'p-oculos-sunline',
    name: 'Óculos Polarizado Sunline',
    sku: 'NX-OCU',
    barcodes: ['7891000300014'],
    category: 'acessorios',
    collections: ['verao-2026'],
    variations: 3,
    priceCents: 19990,
    compareAtPriceCents: null,
    stock: 22,
    lowStockThreshold: 10,
    soldLast30: 21,
    active: true,
  },
  {
    ...COMMON,
    id: 'p-viseira-dry-fit',
    name: 'Viseira Dry Fit',
    sku: 'NX-VIS',
    barcodes: ['7891000400011'],
    category: 'acessorios',
    collections: ['verao-2026'],
    variations: 3,
    priceCents: 6990,
    compareAtPriceCents: null,
    stock: 9,
    lowStockThreshold: 12,
    soldLast30: 47,
    active: true,
  },
  {
    ...COMMON,
    id: 'p-rede-oficial-beach',
    name: 'Rede Oficial Beach 8,5 m',
    sku: 'NX-RED',
    barcodes: ['7891000500018'],
    category: 'rede-quadra',
    collections: ['linha-pro'],
    variations: 1,
    priceCents: 45990,
    compareAtPriceCents: null,
    stock: 14,
    lowStockThreshold: 6,
    soldLast30: 6,
    active: true,
  },
  {
    ...COMMON,
    id: 'p-kit-demarcacao',
    name: 'Kit Demarcação de Quadra',
    sku: 'NX-KIT',
    barcodes: ['7891000600015'],
    category: 'rede-quadra',
    collections: ['linha-pro'],
    variations: 1,
    priceCents: 34990,
    compareAtPriceCents: null,
    stock: 11,
    lowStockThreshold: 12,
    soldLast30: 9,
    active: true,
  },
  {
    ...COMMON,
    id: 'p-garrafa-termica',
    name: 'Garrafa Térmica 750 ml',
    sku: 'NX-SQU',
    barcodes: ['7891000700012'],
    category: 'acessorios',
    collections: ['verao-2026'],
    variations: 4,
    priceCents: 8990,
    compareAtPriceCents: 10990,
    stock: 58,
    lowStockThreshold: 10,
    soldLast30: 33,
    active: true,
  },
  {
    ...COMMON,
    id: 'p-mochila-praia',
    name: 'Mochila Praia Impermeável',
    sku: 'NX-MOC',
    barcodes: ['7891000800019'],
    category: 'acessorios',
    // Sem coleção de propósito: o filtro de coleção precisa do caso vazio.
    collections: [],
    variations: 2,
    priceCents: 23990,
    compareAtPriceCents: null,
    stock: 0,
    lowStockThreshold: 10,
    soldLast30: 12,
    active: false,
  },
];
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/products.mock.spec.ts'`
Esperado: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add projects/backoffice/src/app/painel/loja/produtos/data
git commit -m "feat(backoffice): tipos e dados de exemplo dos produtos da loja

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Funções puras — estoque, busca, filtro, contadores e URL

**Files:**
- Create: `projects/backoffice/src/app/painel/loja/produtos/data/product-filters.ts`
- Test: `projects/backoffice/src/app/painel/loja/produtos/data/product-filters.spec.ts`

**Interfaces:**
- Consumes: `StoreProduct`, `ProductCategory`, `ProductChannel` da Task 3.
- Produces: `StockState`, `ProductTab`, `PRODUCT_TABS`, `ProductCriteria`, `EMPTY_CRITERIA`, `stockState()`, `searchMatches()`, `filterProducts()`, `tabCounts()`, `criteriaFromParams()`, `paramsFromCriteria()`.

- [ ] **Step 1: Escrever os testes que falham**

`product-filters.spec.ts`:

```ts
import { STORE_PRODUCTS } from './products.mock';
import {
  EMPTY_CRITERIA,
  criteriaFromParams,
  filterProducts,
  paramsFromCriteria,
  searchMatches,
  stockState,
  tabCounts,
} from './product-filters';
import type { StoreProduct } from './products.repository';

const bySku = (sku: string) => STORE_PRODUCTS.find((p) => p.sku === sku)!;
const skus = (rows: StoreProduct[]) => rows.map((r) => r.sku);

describe('stockState', () => {
  it('zero é esgotado', () => {
    expect(stockState(bySku('NX-MOC'))).toBe('esgotado');
  });

  it('abaixo do limite é baixo', () => {
    expect(stockState(bySku('NX-VIS'))).toBe('baixo'); // 9 de 12
  });

  it('exatamente no limite ainda é baixo', () => {
    expect(stockState({ ...bySku('NX-VIS'), stock: 12 })).toBe('baixo');
  });

  it('um acima do limite é ok', () => {
    expect(stockState({ ...bySku('NX-VIS'), stock: 13 })).toBe('ok');
  });

  it('estoque alto é ok', () => {
    expect(stockState(bySku('NX-BOL'))).toBe('ok'); // 86 de 10
  });
});

describe('searchMatches', () => {
  it('acha por nome ignorando acento e caixa', () => {
    expect(searchMatches(bySku('NX-OCU'), 'oculos')).toBeTrue();
    expect(searchMatches(bySku('NX-OCU'), 'ÓCULOS')).toBeTrue();
  });

  it('acha por SKU em minúscula e por pedaço do SKU', () => {
    expect(searchMatches(bySku('NX-BOL'), 'nx-bol')).toBeTrue();
    expect(searchMatches(bySku('NX-BOL'), 'bol')).toBeTrue();
  });

  it('acha por código de barras de qualquer variação', () => {
    expect(searchMatches(bySku('NX-BOL'), '7891000100028')).toBeTrue();
  });

  it('não acha o que não existe', () => {
    expect(searchMatches(bySku('NX-BOL'), 'chuteira')).toBeFalse();
  });

  it('busca vazia casa com tudo', () => {
    expect(searchMatches(bySku('NX-BOL'), '   ')).toBeTrue();
  });
});

describe('filterProducts', () => {
  const rows = [...STORE_PRODUCTS];

  it('sem filtro devolve tudo', () => {
    expect(filterProducts(rows, EMPTY_CRITERIA).length).toBe(8);
  });

  it('aba ativos tira o produto desligado', () => {
    const out = filterProducts(rows, { ...EMPTY_CRITERIA, tab: 'ativos' });
    expect(skus(out)).not.toContain('NX-MOC');
    expect(out.length).toBe(7);
  });

  it('aba esgotados devolve só o estoque zero', () => {
    expect(skus(filterProducts(rows, { ...EMPTY_CRITERIA, tab: 'esgotados' }))).toEqual(['NX-MOC']);
  });

  it('aba estoque baixo devolve os dois do desenho', () => {
    expect(skus(filterProducts(rows, { ...EMPTY_CRITERIA, tab: 'baixo' })).sort()).toEqual([
      'NX-KIT',
      'NX-VIS',
    ]);
  });

  it('aba rascunhos devolve vazio no exemplo', () => {
    expect(filterProducts(rows, { ...EMPTY_CRITERIA, tab: 'rascunhos' })).toEqual([]);
  });

  it('filtra por categoria', () => {
    expect(filterProducts(rows, { ...EMPTY_CRITERIA, category: 'rede-quadra' }).length).toBe(2);
  });

  it('categoria sem produto devolve vazio', () => {
    expect(filterProducts(rows, { ...EMPTY_CRITERIA, category: 'kits' })).toEqual([]);
  });

  it('filtra por coleção e o produto sem coleção fica de fora', () => {
    const out = filterProducts(rows, { ...EMPTY_CRITERIA, collection: 'linha-pro' });
    expect(skus(out).sort()).toEqual(['NX-BOL', 'NX-KIT', 'NX-RED']);
    expect(skus(out)).not.toContain('NX-MOC');
  });

  it('o produto sem coleção continua na lista quando não há filtro de coleção', () => {
    expect(skus(filterProducts(rows, EMPTY_CRITERIA))).toContain('NX-MOC');
  });

  it('combina aba, busca e categoria', () => {
    const out = filterProducts(rows, {
      ...EMPTY_CRITERIA,
      tab: 'ativos',
      q: 'dry',
      category: 'acessorios',
    });
    expect(skus(out)).toEqual(['NX-VIS']);
  });
});

describe('tabCounts', () => {
  it('conta cada aba sobre a lista inteira', () => {
    const counts = tabCounts([...STORE_PRODUCTS], EMPTY_CRITERIA);
    expect(counts).toEqual({ todos: 8, ativos: 7, rascunhos: 0, esgotados: 1, baixo: 2 });
  });

  it('respeita os outros filtros, mas ignora a aba escolhida', () => {
    const counts = tabCounts([...STORE_PRODUCTS], {
      ...EMPTY_CRITERIA,
      tab: 'esgotados',
      category: 'rede-quadra',
    });
    expect(counts).toEqual({ todos: 2, ativos: 2, rascunhos: 0, esgotados: 0, baixo: 2 });
  });
});

describe('ida e volta pela URL', () => {
  it('query string vazia vira o critério padrão', () => {
    expect(criteriaFromParams({})).toEqual(EMPTY_CRITERIA);
  });

  it('lê os valores válidos', () => {
    expect(criteriaFromParams({ aba: 'baixo', q: 'bola', categoria: 'bolas', canal: 'app' })).toEqual({
      ...EMPTY_CRITERIA,
      tab: 'baixo',
      q: 'bola',
      category: 'bolas',
      channel: 'app',
    });
  });

  it('aba inválida cai em todos, em vez de lista vazia', () => {
    expect(criteriaFromParams({ aba: 'xpto' }).tab).toBe('todos');
  });

  it('categoria e canal inválidos viram nulo', () => {
    const c = criteriaFromParams({ categoria: 'foo', canal: 'fax' });
    expect(c.category).toBeNull();
    expect(c.channel).toBeNull();
  });

  it('o padrão não vai para a URL', () => {
    expect(paramsFromCriteria(EMPTY_CRITERIA)).toEqual({
      aba: null,
      q: null,
      categoria: null,
      canal: null,
      colecao: null,
    });
  });

  it('o que não é padrão vai', () => {
    expect(paramsFromCriteria({ ...EMPTY_CRITERIA, tab: 'ativos', q: ' bola ' })).toEqual({
      aba: 'ativos',
      q: 'bola',
      categoria: null,
      canal: null,
      colecao: null,
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/product-filters.spec.ts'`
Esperado: FAIL — `Cannot find module './product-filters'`.

- [ ] **Step 3: Escrever as funções**

`product-filters.ts`:

```ts
import type { ProductCategory, ProductChannel, StoreProduct } from './products.repository';

export type StockState = 'esgotado' | 'baixo' | 'ok';
export type ProductTab = 'todos' | 'ativos' | 'rascunhos' | 'esgotados' | 'baixo';

export const PRODUCT_TABS: ReadonlyArray<{ id: ProductTab; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'ativos', label: 'Ativos' },
  { id: 'rascunhos', label: 'Rascunhos' },
  { id: 'esgotados', label: 'Esgotados' },
  { id: 'baixo', label: 'Estoque baixo' },
];

export interface ProductCriteria {
  tab: ProductTab;
  q: string;
  category: ProductCategory | null;
  channel: ProductChannel | null;
  collection: string | null;
}

export const EMPTY_CRITERIA: ProductCriteria = {
  tab: 'todos',
  q: '',
  category: null,
  channel: null,
  collection: null,
};

const CATEGORIES: readonly ProductCategory[] = [
  'bolas',
  'vestuario',
  'acessorios',
  'rede-quadra',
  'kits',
];
const CHANNELS: readonly ProductChannel[] = ['web', 'app'];

/** Minúscula e sem acento, para a busca não depender de como o operador digita. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Derivado de `stock`: nunca é campo gravado, para contador e pill não divergirem. */
export function stockState(product: StoreProduct): StockState {
  if (product.stock === 0) {
    return 'esgotado';
  }
  return product.stock <= product.lowStockThreshold ? 'baixo' : 'ok';
}

export function searchMatches(product: StoreProduct, q: string): boolean {
  const needle = normalize(q);
  if (!needle) {
    return true;
  }
  const haystack = [product.name, product.sku, ...product.barcodes].map(normalize);
  return haystack.some((h) => h.includes(needle));
}

function matchesTab(product: StoreProduct, tab: ProductTab): boolean {
  switch (tab) {
    case 'todos':
      return true;
    case 'ativos':
      return product.active;
    case 'rascunhos':
      return product.status === 'rascunho';
    case 'esgotados':
      return stockState(product) === 'esgotado';
    case 'baixo':
      return stockState(product) === 'baixo';
  }
}

/** Tudo menos a aba: é o que os contadores das abas enxergam. */
function matchesRest(product: StoreProduct, c: ProductCriteria): boolean {
  if (!searchMatches(product, c.q)) {
    return false;
  }
  if (c.category && product.category !== c.category) {
    return false;
  }
  if (c.channel && !product.channels.includes(c.channel)) {
    return false;
  }
  if (c.collection && !product.collections.includes(c.collection)) {
    return false;
  }
  return true;
}

export function filterProducts(rows: StoreProduct[], c: ProductCriteria): StoreProduct[] {
  return rows.filter((p) => matchesRest(p, c) && matchesTab(p, c.tab));
}

/** Conta cada aba sobre os outros filtros, para o número ser o que o clique vai mostrar. */
export function tabCounts(rows: StoreProduct[], c: ProductCriteria): Record<ProductTab, number> {
  const rest = rows.filter((p) => matchesRest(p, c));
  return {
    todos: rest.length,
    ativos: rest.filter((p) => matchesTab(p, 'ativos')).length,
    rascunhos: rest.filter((p) => matchesTab(p, 'rascunhos')).length,
    esgotados: rest.filter((p) => matchesTab(p, 'esgotados')).length,
    baixo: rest.filter((p) => matchesTab(p, 'baixo')).length,
  };
}

type RawParams = Record<string, string | null | undefined>;

function oneOf<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Valor estranho na URL cai no padrão: lista vazia sem explicação é pior que ignorar o parâmetro. */
export function criteriaFromParams(params: RawParams): ProductCriteria {
  return {
    tab: oneOf(params['aba'], PRODUCT_TABS.map((t) => t.id)) ?? 'todos',
    q: (params['q'] ?? '').trim(),
    category: oneOf(params['categoria'], CATEGORIES),
    channel: oneOf(params['canal'], CHANNELS),
    collection: params['colecao']?.trim() || null,
  };
}

/** `null` apaga o parâmetro: o padrão não suja a URL. */
export function paramsFromCriteria(c: ProductCriteria): Record<string, string | null> {
  return {
    aba: c.tab === 'todos' ? null : c.tab,
    q: c.q.trim() || null,
    categoria: c.category,
    canal: c.channel,
    colecao: c.collection,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/product-filters.spec.ts'`
Esperado: PASS (todos os `describe`).

- [ ] **Step 5: Commit**

```bash
git add projects/backoffice/src/app/painel/loja/produtos/data/product-filters.ts \
        projects/backoffice/src/app/painel/loja/produtos/data/product-filters.spec.ts
git commit -m "feat(backoffice): filtros, contadores e URL dos produtos da loja

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Tela de Produtos — casco, cabeçalho e tabela

Entrega a tela navegável listando os 8 produtos. Abas, filtros e seleção entram nas tasks seguintes.

**Files:**
- Create: `projects/backoffice/src/app/painel/loja/produtos/ui/product-row.component.ts`
- Create: `projects/backoffice/src/app/painel/loja/produtos/panel-produtos.component.ts`
- Modify: `projects/backoffice/src/app/app.routes.ts`
- Test: `projects/backoffice/src/app/painel/loja/produtos/panel-produtos.component.spec.ts`

**Interfaces:**
- Consumes: `ProductsRepository.list()`, `StoreProduct`, `PRODUCT_CATEGORY_LABELS` (Task 3); `stockState` (Task 4).
- Produces: `ProductRowComponent` (seletor `bo-product-row`; inputs `product: StoreProduct`, `selected: boolean`; outputs `activeChange: boolean`, `selectedChange: boolean`), `PanelProdutosComponent`.

- [ ] **Step 1: Escrever o teste que falha**

`panel-produtos.component.spec.ts`:

```ts
import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { STORE_PRODUCTS } from './data/products.mock';
import { ProductsRepository, type StoreProduct } from './data/products.repository';
import { PanelProdutosComponent } from './panel-produtos.component';

describe('PanelProdutosComponent', () => {
  let fixture: ComponentFixture<PanelProdutosComponent>;

  async function mount(
    options: { rows?: StoreProduct[]; fail?: boolean; params?: Record<string, string> } = {},
  ): Promise<HTMLElement> {
    const rows = options.rows ?? STORE_PRODUCTS.map((p) => ({ ...p }));
    await TestBed.configureTestingModule({
      imports: [PanelProdutosComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(options.params ?? {}) } },
        },
        {
          provide: ProductsRepository,
          useValue: {
            list: () => (options.fail ? Promise.reject(new Error('falhou')) : Promise.resolve(rows)),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PanelProdutosComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  /** A leitura é promise fora do TestBed: deixa resolver e re-renderiza. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await TestBed.inject(ApplicationRef).whenStable();
  }

  const names = (host: HTMLElement) =>
    [...host.querySelectorAll('.cell-product .name')].map((e) => e.textContent!.trim());

  it('lista os produtos do repositório', async () => {
    const host = await mount();
    expect(names(host).length).toBe(8);
    expect(names(host)[0]).toBe('Bola NexaGO Pro Beach');
  });

  it('mostra total de produtos e de SKUs no cabeçalho', async () => {
    const host = await mount();
    expect(host.querySelector('.count-pill')!.textContent).toContain('8 produtos');
    expect(host.querySelector('.count-pill')!.textContent).toContain('31 SKUs');
  });

  it('mostra preço de agora e preço antigo riscado', async () => {
    const host = await mount();
    const first = host.querySelector('.cell-price')!;
    expect(first.querySelector('.now')!.textContent).toContain('289,90');
    expect(first.querySelector('.was')!.textContent).toContain('329,90');
  });

  it('pill de esgotado e de estoque baixo', async () => {
    const host = await mount();
    const cells = [...host.querySelectorAll('.cell-stock')].map((e) => e.textContent!.trim());
    // O caixa-alta do pill é CSS: o texto no DOM continua como foi escrito.
    expect(cells.some((t) => t.includes('Esgotado'))).toBeTrue();
    expect(cells.some((t) => t.includes('Baixo'))).toBeTrue();
    expect(cells.some((t) => t === '86 un.')).toBeTrue();
  });

  it('ações de escrita ficam desabilitadas', async () => {
    const host = await mount();
    const novo = host.querySelector('.header-actions .bo-mini-btn-primary') as HTMLButtonElement;
    expect(novo.disabled).toBeTrue();
    expect(novo.title).toBe('Em breve');
  });

  it('erro na leitura mostra o aviso e o botão de tentar de novo', async () => {
    const host = await mount({ fail: true });
    expect(host.querySelector('.bo-alert')).not.toBeNull();
    expect(host.textContent).toContain('Tentar de novo');
  });

  it('sem produto nenhum explica que não há cadastro', async () => {
    const host = await mount({ rows: [] });
    expect(host.textContent).toContain('Nenhum produto cadastrado');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/panel-produtos.component.spec.ts'`
Esperado: FAIL — `Cannot find module './panel-produtos.component'`.

- [ ] **Step 3: Escrever a linha da tabela**

`ui/product-row.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PillComponent } from '../../../ui/pill.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import { stockState } from '../data/product-filters';
import { PRODUCT_CATEGORY_LABELS, type StoreProduct } from '../data/products.repository';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Uma linha da tabela de produtos. Só desenha: quem decide é a tela. */
@Component({
  selector: 'bo-product-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PillComponent, ToggleComponent],
  template: `
    <div class="row" [class.selected]="selected()">
      <label class="cell-check">
        <input
          type="checkbox"
          [checked]="selected()"
          [attr.aria-label]="'Selecionar ' + product().name"
          (change)="selectedChange.emit(!selected())"
        />
      </label>

      <div class="cell-product">
        <div class="thumb" aria-hidden="true"></div>
        <div class="who">
          <div class="name">{{ product().name }}</div>
          <div class="sku">{{ product().sku }}</div>
        </div>
      </div>

      <div class="cell-category">{{ categoryLabel() }}</div>
      <div class="cell-variations">{{ product().variations }}</div>

      <div class="cell-price">
        <div class="now">{{ price() }}</div>
        @if (comparePrice(); as was) {
          <div class="was">{{ was }}</div>
        }
      </div>

      <div class="cell-stock">
        @switch (state()) {
          @case ('esgotado') {
            <bo-pill tone="red">Esgotado</bo-pill>
          }
          @case ('baixo') {
            <bo-pill tone="yellow">{{ product().stock }} · Baixo</bo-pill>
          }
          @default {
            <span class="units">{{ product().stock }} un.</span>
          }
        }
      </div>

      <div class="cell-sold">{{ product().soldLast30 }}</div>

      <div class="cell-channels">
        @for (channel of product().channels; track channel) {
          <span class="channel">{{ channel === 'web' ? 'WEB' : 'APP' }}</span>
        }
      </div>

      <div class="cell-active">
        <bo-toggle
          [checked]="product().active"
          [ariaLabel]="(product().active ? 'Desativar ' : 'Ativar ') + product().name"
          (checkedChange)="activeChange.emit($event)"
        />
      </div>

      <button type="button" class="cell-more" disabled title="Em breve" aria-label="Mais ações">
        <bo-icon name="chevron-right" [size]="14" />
      </button>
    </div>
  `,
  styles: `
    .row {
      display: grid;
      grid-template-columns: 34px minmax(200px, 1.6fr) 120px 70px 110px 110px 70px 92px 54px 34px;
      align-items: center;
      gap: 10px;
      height: 54px;
      padding: 0 14px;
      border-top: 1px solid var(--nx-line);
      transition: background 140ms var(--nx-ease-out);
    }

    .row:hover {
      background: var(--nx-surface-1);
    }

    .row.selected {
      background: rgba(255, 106, 26, 0.05);
    }

    .cell-check {
      display: grid;
      place-items: center;
      cursor: pointer;
    }

    .cell-product {
      display: flex;
      align-items: center;
      gap: 11px;
      min-width: 0;
    }

    .thumb {
      width: 34px;
      height: 34px;
      flex: none;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: repeating-linear-gradient(
        -45deg,
        var(--nx-surface-1),
        var(--nx-surface-1) 4px,
        var(--nx-surface-2) 4px,
        var(--nx-surface-2) 8px
      );
    }

    .who {
      min-width: 0;
    }

    .name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sku,
    .cell-category,
    .cell-variations,
    .cell-sold {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .cell-variations,
    .cell-sold {
      text-align: center;
    }

    .cell-price {
      text-align: right;
    }

    .now {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .was {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      text-decoration: line-through;
    }

    .units {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .cell-channels {
      display: flex;
      gap: 5px;
    }

    .channel {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      padding: 3px 6px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
    }

    .cell-active {
      display: grid;
      place-items: center;
    }

    .cell-more {
      background: transparent;
      border: none;
      color: var(--nx-text-dim);
      display: grid;
      place-items: center;
      opacity: 0.5;
      cursor: default;
    }
  `,
})
export class ProductRowComponent {
  readonly product = input.required<StoreProduct>();
  readonly selected = input(false);

  readonly activeChange = output<boolean>();
  readonly selectedChange = output<boolean>();

  protected readonly state = computed(() => stockState(this.product()));
  protected readonly categoryLabel = computed(() => PRODUCT_CATEGORY_LABELS[this.product().category]);
  protected readonly price = computed(() => BRL.format(this.product().priceCents / 100));
  protected readonly comparePrice = computed(() => {
    const was = this.product().compareAtPriceCents;
    return was === null ? null : BRL.format(was / 100);
  });
}
```

- [ ] **Step 4: Escrever a tela**

`panel-produtos.component.ts` — nesta task sem abas nem filtros; eles entram nas Tasks 6 e 7:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { ProductsRepository, type StoreProduct } from './data/products.repository';
import { ProductRowComponent } from './ui/product-row.component';

type LoadState = 'loading' | 'ok' | 'error';

/** Catálogo da loja nexaGO. Fase de desenho: lê dados de exemplo (ver o kicker do card). */
@Component({
  selector: 'bo-panel-produtos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    IconComponent,
    ProductRowComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Produtos" subtitle="Loja">
        <span class="count-pill">{{ countLabel() }}</span>
        <div class="header-actions">
          <button type="button" class="bo-mini-btn" disabled title="Em breve">
            <bo-icon name="download" [size]="13" />
            Importar planilha
          </button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" disabled title="Em breve">
            <bo-icon name="plus" [size]="13" />
            Novo produto
          </button>
        </div>
      </bo-page-header>

      <div class="body">
        <bo-panel-card pad="sm" kicker="dados de exemplo" title="Catálogo">
          @if (state() === 'error') {
            <div class="bo-alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ errorMessage() }}</span>
            </div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else if (state() === 'loading') {
            <div class="table-head">
              <span></span><span>Produto</span><span>Categoria</span><span>Variações</span>
              <span>Preço</span><span>Estoque</span><span>Vendas 30d</span><span>Canais</span>
              <span>Ativo</span><span></span>
            </div>
            @for (slot of skeleton; track slot) {
              <div class="skeleton-row"></div>
            }
          } @else if (rows().length === 0) {
            <div class="empty">
              <bo-icon name="archive" [size]="20" />
              <p>Nenhum produto cadastrado</p>
            </div>
          } @else {
            <div class="table-head">
              <span></span><span>Produto</span><span>Categoria</span><span>Variações</span>
              <span>Preço</span><span>Estoque</span><span>Vendas 30d</span><span>Canais</span>
              <span>Ativo</span><span></span>
            </div>
            @for (product of rows(); track product.id) {
              <bo-product-row [product]="product" (activeChange)="setActive(product.id, $event)" />
            }
          }
        </bo-panel-card>
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .count-pill {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 5px 10px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      white-space: nowrap;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .body {
      padding: 20px 32px 40px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-width: 0;
    }

    .table-head {
      display: grid;
      grid-template-columns: 34px minmax(200px, 1.6fr) 120px 70px 110px 110px 70px 92px 54px 34px;
      gap: 10px;
      padding: 0 14px 9px;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .skeleton-row {
      height: 54px;
      border-top: 1px solid var(--nx-line);
      background: linear-gradient(
        90deg,
        var(--nx-surface-1) 25%,
        var(--nx-surface-2) 37%,
        var(--nx-surface-1) 63%
      );
      background-size: 400% 100%;
      animation: shimmer 1.3s ease-in-out infinite;
    }

    @keyframes shimmer {
      from {
        background-position: 100% 0;
      }
      to {
        background-position: 0 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .skeleton-row {
        animation: none;
      }
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 44px 0;
      color: var(--nx-text-dim);
    }

    .empty p {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 13px;
    }

    .retry {
      margin-top: 12px;
    }
  `,
})
export class PanelProdutosComponent {
  private readonly repository = inject(ProductsRepository);

  protected readonly skeleton = [0, 1, 2, 3, 4, 5, 6, 7];

  private readonly all = signal<StoreProduct[]>([]);
  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');

  protected readonly rows = computed(() => this.all());

  protected readonly countLabel = computed(() => {
    const rows = this.all();
    const skus = rows.reduce((total, p) => total + p.variations, 0);
    return `${rows.length} produtos · ${skus} SKUs`;
  });

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.state.set('loading');
    try {
      this.all.set(await this.repository.list());
      this.state.set('ok');
    } catch (error) {
      this.errorMessage.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  protected setActive(id: string, active: boolean): void {
    this.all.update((rows) => rows.map((p) => (p.id === id ? { ...p, active } : p)));
  }
}
```

`callableErrorMessage(error: unknown): string` já existe em `painel/data/callable-error.ts` e é o que as outras telas usam — não escrever outro tratador.

- [ ] **Step 5: Registrar a rota**

Em `app.routes.ts`, antes da rota `painel/perfil`:

```ts
{
  path: 'painel/loja/produtos',
  title: 'Produtos — NexaGO Backoffice',
  canActivate: [authGuard],
  loadComponent: () =>
    import('./painel/loja/produtos/panel-produtos.component').then((m) => m.PanelProdutosComponent),
},
```

- [ ] **Step 6: Rodar os testes e o build**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/panel-produtos.component.spec.ts'`
Esperado: PASS (7 testes).

Run: `npx ng build backoffice`
Esperado: build limpo.

- [ ] **Step 7: Commit**

```bash
git add projects/backoffice/src/app/painel/loja/produtos projects/backoffice/src/app/app.routes.ts
git commit -m "feat(backoffice): tela de Produtos da loja com a tabela do catalogo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Abas com contadores e toggle Ativo

**Files:**
- Modify: `projects/backoffice/src/app/painel/loja/produtos/panel-produtos.component.ts`
- Test: `projects/backoffice/src/app/painel/loja/produtos/panel-produtos.component.spec.ts`

**Interfaces:**
- Consumes: `PRODUCT_TABS`, `ProductTab`, `filterProducts`, `tabCounts`, `EMPTY_CRITERIA` (Task 4).
- Produces: no componente, `criteria = signal<ProductCriteria>`, que as Tasks 7 e 8 vão ler e escrever.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao `panel-produtos.component.spec.ts`:

```ts
const tabs = (host: HTMLElement) =>
  [...host.querySelectorAll('.tabs button')].map((e) => e.textContent!.replace(/\s+/g, ' ').trim());

const clickTab = async (host: HTMLElement, label: string) => {
  const button = [...host.querySelectorAll('.tabs button')].find((e) =>
    e.textContent!.includes(label),
  ) as HTMLButtonElement;
  button.click();
  await settle();
};

it('mostra as abas com os contadores do exemplo', async () => {
  const host = await mount();
  expect(tabs(host)).toEqual([
    'Todos 8',
    'Ativos 7',
    'Rascunhos 0',
    'Esgotados 1',
    'Estoque baixo 2',
  ]);
});

it('trocar de aba muda as linhas da tabela', async () => {
  const host = await mount();
  await clickTab(host, 'Esgotados');
  expect(names(host)).toEqual(['Mochila Praia Impermeável']);
});

it('desligar o toggle tira a linha da aba Ativos e baixa o contador', async () => {
  const host = await mount();
  await clickTab(host, 'Ativos');
  expect(names(host).length).toBe(7);

  const toggle = host.querySelector(
    'bo-product-row [role="switch"][aria-label^="Desativar Bola"]',
  ) as HTMLButtonElement;
  toggle.click();
  await settle();

  expect(names(host).length).toBe(6);
  expect(names(host)).not.toContain('Bola NexaGO Pro Beach');
  expect(tabs(host)).toContain('Ativos 6');
});

it('aba sem resultado explica e oferece limpar os filtros', async () => {
  const host = await mount();
  await clickTab(host, 'Rascunhos');
  expect(host.textContent).toContain('Nenhum produto com esses filtros');
  expect(host.querySelector('.empty .bo-mini-btn')).not.toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/panel-produtos.component.spec.ts'`
Esperado: FAIL — `.tabs button` não existe, `tabs(host)` devolve `[]`.

- [ ] **Step 3: Pôr o critério e os derivados no componente**

Acrescentar aos imports e à classe:

```ts
import {
  EMPTY_CRITERIA,
  PRODUCT_TABS,
  filterProducts,
  tabCounts,
  type ProductCriteria,
  type ProductTab,
} from './data/product-filters';
```

```ts
protected readonly productTabs = PRODUCT_TABS;
protected readonly criteria = signal<ProductCriteria>(EMPTY_CRITERIA);

protected readonly rows = computed(() => filterProducts(this.all(), this.criteria()));
protected readonly counts = computed(() => tabCounts(this.all(), this.criteria()));

protected setTab(tab: ProductTab): void {
  this.criteria.update((c) => ({ ...c, tab }));
}

protected clearFilters(): void {
  this.criteria.set(EMPTY_CRITERIA);
}
```

Substituir o `rows` da Task 5 por este. `countLabel` continua lendo `all()`: o pill é do acervo, não do filtro.

- [ ] **Step 4: Renderizar as abas e separar os dois vazios**

Entre `bo-page-header` e `.body`, acrescentar:

```html
<div class="tabs">
  @for (tab of productTabs; track tab.id) {
    <button
      type="button"
      [class.active]="criteria().tab === tab.id"
      [attr.aria-pressed]="criteria().tab === tab.id"
      (click)="setTab(tab.id)"
    >
      {{ tab.label }}
      <span class="tab-count">{{ counts()[tab.id] }}</span>
    </button>
  }
</div>
```

Trocar o ramo de lista vazia por dois casos:

```html
} @else if (rows().length === 0) {
  <div class="empty">
    <bo-icon name="archive" [size]="20" />
    @if (all().length === 0) {
      <p>Nenhum produto cadastrado</p>
    } @else {
      <p>Nenhum produto com esses filtros</p>
      <button type="button" class="bo-mini-btn" (click)="clearFilters()">Limpar filtros</button>
    }
  </div>
}
```

`all` precisa virar `protected` para o template lê-lo.

Estilo das abas (seguindo `.bo-chart-tabs` do `styles.css`, mas com contador):

```css
.tabs {
  display: flex;
  gap: 4px;
  padding: 10px 32px 0;
  border-bottom: 1px solid var(--nx-line);
  overflow-x: auto;
  flex: none;
}

.tabs button {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--nx-text-mute);
  font-family: var(--nx-font-display);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.tabs button:hover {
  color: var(--nx-text);
}

.tabs button.active {
  color: var(--nx-orange-500);
  border-bottom-color: var(--nx-orange-500);
}

.tab-count {
  font-family: var(--nx-font-mono);
  font-size: 9.5px;
  color: var(--nx-text-dim);
}

.tabs button.active .tab-count {
  color: var(--nx-orange-500);
}
```

- [ ] **Step 5: Rodar os testes e o build**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/panel-produtos.component.spec.ts'`
Esperado: PASS (11 testes).

Run: `npx ng build backoffice`
Esperado: build limpo.

- [ ] **Step 6: Commit**

```bash
git add projects/backoffice/src/app/painel/loja/produtos
git commit -m "feat(backoffice): abas com contadores na tela de Produtos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Busca, filtros, chips e query string

**Files:**
- Modify: `projects/backoffice/src/app/painel/loja/produtos/panel-produtos.component.ts`
- Test: `projects/backoffice/src/app/painel/loja/produtos/panel-produtos.component.spec.ts`

**Interfaces:**
- Consumes: `criteriaFromParams`, `paramsFromCriteria`, `PRODUCT_CATEGORY_LABELS`, `criteria` signal (Tasks 3, 4, 6).
- Produces: nada novo para fora.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao spec (e ao topo do arquivo, `import { Router } from '@angular/router';`):

```ts
const typeSearch = async (host: HTMLElement, text: string) => {
  const input = host.querySelector('.search-input') as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await settle();
};

it('busca por nome sem acento', async () => {
  const host = await mount();
  await typeSearch(host, 'oculos');
  expect(names(host)).toEqual(['Óculos Polarizado Sunline']);
});

it('busca por SKU', async () => {
  const host = await mount();
  await typeSearch(host, 'NX-RED');
  expect(names(host)).toEqual(['Rede Oficial Beach 8,5 m']);
});

it('chip de categoria filtra e clicar de novo limpa', async () => {
  const host = await mount();
  const chip = [...host.querySelectorAll('.bo-chip')].find((e) =>
    e.textContent!.includes('Rede & quadra'),
  ) as HTMLButtonElement;

  chip.click();
  await settle();
  expect(names(host).length).toBe(2);

  chip.click();
  await settle();
  expect(names(host).length).toBe(8);
});

it('abre já filtrado pelo que veio na URL', async () => {
  const host = await mount({ params: { aba: 'esgotados' } });
  expect(names(host)).toEqual(['Mochila Praia Impermeável']);
});

it('parâmetro inválido na URL não esvazia a lista', async () => {
  const host = await mount({ params: { aba: 'xpto', categoria: 'foo' } });
  expect(names(host).length).toBe(8);
});

it('escreve o filtro na URL sem empilhar histórico', async () => {
  const host = await mount();
  const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  await clickTab(host, 'Esgotados');

  expect(navigate).toHaveBeenCalled();
  const [, extras] = navigate.calls.mostRecent().args as [unknown, { queryParams: unknown; replaceUrl: boolean }];
  expect(extras.queryParams).toEqual(
    jasmine.objectContaining({ aba: 'esgotados', q: null, categoria: null }),
  );
  expect(extras.replaceUrl).toBeTrue();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/panel-produtos.component.spec.ts'`
Esperado: FAIL — `.search-input` não existe (`input` é `null`).

- [ ] **Step 3: Ler a URL na partida e escrever a cada mudança**

No componente:

```ts
import { ActivatedRoute, Router } from '@angular/router';
```

e, nos imports que já existem no arquivo, acrescentar `criteriaFromParams` e `paramsFromCriteria` ao de
`./data/product-filters`, e `PRODUCT_CATEGORY_LABELS` e `type ProductCategory` ao de
`./data/products.repository` (`ProductChannel` sai do tipo de `channels`, não precisa ser importado).

```ts
private readonly router = inject(Router);
private readonly route = inject(ActivatedRoute);
private searchTimer: ReturnType<typeof setTimeout> | null = null;

protected readonly categories = (
  Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[]
).map((id) => ({ id, label: PRODUCT_CATEGORY_LABELS[id] }));
protected readonly channels = [
  { id: 'web', label: 'Web' },
  { id: 'app', label: 'App' },
] as const;
protected readonly collections = [
  { id: 'verao-2026', label: 'Verão 2026' },
  { id: 'linha-pro', label: 'Linha Pro' },
];
```

No construtor, antes do `void this.reload()`:

```ts
const params = this.route.snapshot.queryParamMap;
const raw = Object.fromEntries(params.keys.map((k) => [k, params.get(k)]));
this.criteria.set(criteriaFromParams(raw));
```

Um único ponto de escrita, para a URL nunca discordar da tela:

```ts
private apply(next: ProductCriteria): void {
  this.criteria.set(next);
  void this.router.navigate([], {
    relativeTo: this.route,
    queryParams: paramsFromCriteria(next),
    replaceUrl: true,
  });
}
```

Trocar `setTab` e `clearFilters` para passarem por ele, e acrescentar:

```ts
protected setTab(tab: ProductTab): void {
  this.apply({ ...this.criteria(), tab });
}

protected clearFilters(): void {
  this.apply(EMPTY_CRITERIA);
}

protected setCategory(category: ProductCategory | null): void {
  this.apply({ ...this.criteria(), category });
}

protected toggleCategory(category: ProductCategory): void {
  this.setCategory(this.criteria().category === category ? null : category);
}

/** O `<select>` devolve string: valida contra a lista em vez de forçar o tipo. */
protected setCategoryFromSelect(value: string): void {
  this.setCategory(this.categories.find((c) => c.id === value)?.id ?? null);
}

protected setChannel(value: string): void {
  const channel = this.channels.find((c) => c.id === value)?.id ?? null;
  this.apply({ ...this.criteria(), channel });
}

protected setCollection(value: string): void {
  this.apply({ ...this.criteria(), collection: value === '' ? null : value });
}

/** A busca filtra a cada tecla; só a URL espera, senão cada letra vira uma entrada no histórico. */
protected setSearch(q: string): void {
  this.criteria.update((c) => ({ ...c, q }));
  if (this.searchTimer !== null) {
    clearTimeout(this.searchTimer);
  }
  this.searchTimer = setTimeout(() => {
    this.searchTimer = null;
    this.apply(this.criteria());
  }, 300);
}

protected value(event: Event): string {
  return (event.target as HTMLInputElement).value;
}
```

- [ ] **Step 4: Renderizar a barra de filtros**

Entre as abas e `.body`, no padrão `bo-filter-bar` que as outras telas usam:

```html
<div class="bo-filter-bar">
  <div class="search">
    <bo-icon name="search" [size]="15" />
    <input
      type="search"
      class="search-input"
      placeholder="Nome, SKU ou código de barras"
      aria-label="Buscar produto"
      [value]="criteria().q"
      (input)="setSearch(value($event))"
    />
  </div>

  <select class="bo-select" aria-label="Categoria" (change)="setCategoryFromSelect(value($event))">
    <option value="" [selected]="criteria().category === null">Categoria</option>
    @for (category of categories; track category.id) {
      <option [value]="category.id" [selected]="criteria().category === category.id">
        {{ category.label }}
      </option>
    }
  </select>

  <select class="bo-select" aria-label="Canal" (change)="setChannel(value($event))">
    <option value="" [selected]="criteria().channel === null">Canal</option>
    @for (channel of channels; track channel.id) {
      <option [value]="channel.id" [selected]="criteria().channel === channel.id">
        {{ channel.label }}
      </option>
    }
  </select>

  <select class="bo-select" aria-label="Coleção" (change)="setCollection(value($event))">
    <option value="" [selected]="criteria().collection === null">Coleção</option>
    @for (collection of collections; track collection.id) {
      <option [value]="collection.id" [selected]="criteria().collection === collection.id">
        {{ collection.label }}
      </option>
    }
  </select>

  <div class="spacer"></div>

  @for (category of categories; track category.id) {
    <button
      type="button"
      class="bo-chip"
      [class.active]="criteria().category === category.id"
      [attr.aria-pressed]="criteria().category === category.id"
      (click)="toggleCategory(category.id)"
    >
      {{ category.label }}
    </button>
  }
</div>
```

Nunca usar `[value]` no `<select>` para selecionar: neste repositório isso não seleciona. A seleção vem do `[selected]` em cada `<option>`, como acima.

Estilos a acrescentar:

```css
.search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 11px;
  min-width: 280px;
  border-radius: var(--nx-r-2);
  background: var(--nx-surface-0);
  border: 1px solid var(--nx-line);
  color: var(--nx-text-dim);
  flex: none;
}

.search-input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--nx-text);
  font-family: var(--nx-font-display);
  font-size: 12.5px;
  width: 100%;
}

.search-input::placeholder {
  color: var(--nx-text-dim);
}

.bo-filter-bar .spacer {
  flex: 1;
  min-width: 12px;
}
```

- [ ] **Step 5: Rodar os testes e o build**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/panel-produtos.component.spec.ts'`
Esperado: PASS (17 testes).

Run: `npx ng build backoffice`
Esperado: build limpo.

- [ ] **Step 6: Commit**

```bash
git add projects/backoffice/src/app/painel/loja/produtos
git commit -m "feat(backoffice): busca, filtros e query string na tela de Produtos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Seleção e barra de ações em lote

**Files:**
- Modify: `projects/backoffice/src/app/painel/loja/produtos/panel-produtos.component.ts`
- Test: `projects/backoffice/src/app/painel/loja/produtos/panel-produtos.component.spec.ts`

**Interfaces:**
- Consumes: `rows()`, `criteria`, `apply()` (Tasks 6 e 7).
- Produces: nada para fora.

- [ ] **Step 1: Escrever os testes que falham**

```ts
const checkboxes = (host: HTMLElement) =>
  [...host.querySelectorAll('bo-product-row input[type="checkbox"]')] as HTMLInputElement[];

it('selecionar uma linha mostra a barra de lote com as ações desabilitadas', async () => {
  const host = await mount();
  checkboxes(host)[0]!.click();
  await settle();

  const bar = host.querySelector('.bulk-bar')!;
  expect(bar.textContent).toContain('1 selecionado');
  const actions = [...bar.querySelectorAll('button')] as HTMLButtonElement[];
  const comAcao = actions.filter((b) => !b.textContent!.includes('Limpar'));
  expect(comAcao.length).toBeGreaterThan(0);
  expect(comAcao.every((b) => b.disabled)).toBeTrue();
});

it('o checkbox do cabeçalho marca e desmarca a página inteira', async () => {
  const host = await mount();
  const all = host.querySelector('.select-all') as HTMLInputElement;

  all.click();
  await settle();
  expect(host.querySelector('.bulk-bar')!.textContent).toContain('8 selecionados');

  all.click();
  await settle();
  expect(host.querySelector('.bulk-bar')).toBeNull();
});

it('mudar o filtro limpa a seleção, para ninguém agir sobre linha que não vê', async () => {
  const host = await mount();
  checkboxes(host)[0]!.click();
  await settle();
  expect(host.querySelector('.bulk-bar')).not.toBeNull();

  await clickTab(host, 'Esgotados');
  expect(host.querySelector('.bulk-bar')).toBeNull();
});

it('desativar um produto selecionado na aba Ativos não deixa seleção órfã', async () => {
  const host = await mount();
  await clickTab(host, 'Ativos');
  checkboxes(host)[0]!.click();
  await settle();

  const toggle = host.querySelector(
    'bo-product-row [role="switch"][aria-label^="Desativar Bola"]',
  ) as HTMLButtonElement;
  toggle.click();
  await settle();

  expect(host.querySelector('.bulk-bar')).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless --include='**/panel-produtos.component.spec.ts'`
Esperado: FAIL — `.bulk-bar` é `null`.

- [ ] **Step 3: Estado da seleção**

```ts
private readonly selectedIds = signal<ReadonlySet<string>>(new Set());

/** Só conta quem está visível: o filtro pode ter tirado da tela uma linha marcada. */
protected readonly selectedVisible = computed(() => {
  const ids = this.selectedIds();
  return this.rows().filter((p) => ids.has(p.id));
});

protected readonly selectionLabel = computed(() => {
  const n = this.selectedVisible().length;
  return n === 1 ? '1 selecionado' : `${n} selecionados`;
});

protected readonly allSelected = computed(
  () => this.rows().length > 0 && this.selectedVisible().length === this.rows().length,
);

protected isSelected(id: string): boolean {
  return this.selectedIds().has(id);
}

protected setSelected(id: string, selected: boolean): void {
  this.selectedIds.update((ids) => {
    const next = new Set(ids);
    if (selected) {
      next.add(id);
    } else {
      next.delete(id);
    }
    return next;
  });
}

protected toggleAll(): void {
  this.selectedIds.set(this.allSelected() ? new Set() : new Set(this.rows().map((p) => p.id)));
}

protected clearSelection(): void {
  this.selectedIds.set(new Set());
}
```

Em `apply()`, limpar a seleção junto (`this.clearSelection();` antes do `navigate`). Como `selectedVisible` só olha as linhas visíveis, desligar o toggle de um produto selecionado na aba Ativos já faz a barra sumir sozinha — não precisa de código a mais.

- [ ] **Step 4: Renderizar a barra e ligar os checkboxes**

No `.table-head`, trocar o primeiro `<span></span>` por:

```html
<span>
  <input
    type="checkbox"
    class="select-all"
    aria-label="Selecionar todos os produtos da página"
    [checked]="allSelected()"
    (change)="toggleAll()"
  />
</span>
```

Na linha, passar a seleção:

```html
<bo-product-row
  [product]="product"
  [selected]="isSelected(product.id)"
  (selectedChange)="setSelected(product.id, $event)"
  (activeChange)="setActive(product.id, $event)"
/>
```

Acima do `.table-head`, dentro do card:

```html
@if (selectedVisible().length > 0) {
  <div class="bulk-bar">
    <strong>{{ selectionLabel() }}</strong>
    <button type="button" class="bo-mini-btn" disabled title="Em breve">Ativar</button>
    <button type="button" class="bo-mini-btn" disabled title="Em breve">Desativar</button>
    <button type="button" class="bo-mini-btn" disabled title="Em breve">Exportar</button>
    <div class="spacer"></div>
    <button type="button" class="bo-ghost-btn" (click)="clearSelection()">Limpar</button>
  </div>
}
```

```css
.bulk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 9px 14px;
  border-radius: var(--nx-r-2);
  background: var(--nx-orange-tint);
  border: 1px solid rgba(255, 106, 26, 0.3);
}

.bulk-bar strong {
  font-family: var(--nx-font-display);
  font-size: 12.5px;
  color: var(--nx-orange-500);
  margin-right: 4px;
}

.bulk-bar .spacer {
  flex: 1;
}
```

- [ ] **Step 5: Rodar a suíte inteira e o build**

Run: `npx ng test backoffice --watch=false --browsers=ChromeHeadless`
Esperado: PASS — a suíte toda do backoffice, incluindo os testes que já existiam.

Run: `npx ng build backoffice`
Esperado: build limpo.

- [ ] **Step 6: Commit**

```bash
git add projects/backoffice/src/app/painel/loja/produtos
git commit -m "feat(backoffice): selecao e barra de acoes em lote na tela de Produtos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Conferir no navegador

Teste passando não prova que a tela está apresentável: altura de linha, alinhamento de coluna e o submenu aberto só se veem olhando.

**Files:** nenhum, a menos que a conferência ache ajuste.

- [ ] **Step 1: Subir o servidor**

Run: `npx ng serve backoffice`
Abrir `http://localhost:4200/painel/loja/produtos` (autenticar se o guard pedir).

- [ ] **Step 2: Conferir contra o desenho**

- Sidebar: Loja entre Financeiro e Moderação, aberta, com Produtos destacado e os badges nos filhos.
- Cabeçalho: `8 PRODUTOS · 31 SKUS`; os dois botões apagados.
- Linhas de 54px, colunas alinhadas com o cabeçalho, miniatura listrada, preço riscado em NX-BOL e NX-SQU, pill amarelo em NX-VIS e NX-KIT, pill vermelho em NX-MOC com o toggle desligado.
- Clicar em `Esgotados`, conferir a URL virar `?aba=esgotados`, dar F5 e a aba continuar escolhida.
- Buscar `oculos`, ver uma linha só.
- Marcar duas linhas e ver a barra laranja; trocar de aba e ver a barra sumir.
- Fechar e reabrir o grupo Loja pelo cabeçalho.

- [ ] **Step 3: Corrigir o que destoar e commitar**

Só se houver ajuste:

```bash
git add projects/backoffice/src/app/painel
git commit -m "fix(backoffice): ajustes visuais da tela de Produtos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
