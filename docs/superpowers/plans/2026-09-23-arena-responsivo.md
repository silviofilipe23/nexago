# Painel da arena responsivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Devolver acesso ao menu do painel da arena (hoje cortado sem barra em quase todo monitor, e inexistente abaixo de 900px) e tornar as ~30 telas usáveis em notebook 13", iPad e celular.

**Architecture:** Variável CSS carrega a magnitude, mixin SCSS carrega a estrutura. As telas consomem `var(--ar-…)` e não declaram `@media`; um punhado de `@media` no `styles.scss` troca as variáveis, em ordem definida (largura → altura → toque). Os 21 itens de `NAV_ITEMS` passam a viver em 5 grupos recolhíveis, e abaixo de 900px entram topbar + drawer, com bottom-nav no celular.

**Tech Stack:** Angular 20 standalone + signals (zoneless), SCSS via `inlineStyleLanguage`, Karma + ChromeHeadless.

**Spec:** `docs/superpowers/specs/2026-09-23-arena-responsivo-design.md`

## Global Constraints

- **Escopo é `frontend/projects/arena` apenas.** Não tocar em organizador, atleta, backoffice, coach ou site, nem extrair nada para `frontend/shared/`.
- **Todos os comandos rodam de `frontend/`.** O worktree não tem `node_modules`: rodar `npm ci` uma vez antes da Task 1.
- **Português nas strings/UI, inglês no código.**
- **Spec de componente exige `provideZonelessChangeDetection()`** nos providers do TestBed — o alvo `test` do arena não declara `zone.js`, então sem isso o erro é `NG0908`.
- **`@media` dentro de componente vai aninhada no seletor** (SCSS), nunca bloco solto. `@media` não soma especificidade: bloco solto declarado antes da regra base morre em silêncio, e morre *parcialmente* (só as propriedades que a base também declara).
- **Usar `minmax(0, 1fr)`, nunca `1fr` sozinho**, em qualquer `grid-template-columns` tocada. Item de grid nasce com `min-width: auto` = min-content do conteúdo, e um `<select>` com opção longa ganha do `1fr` sem dar scroll — só "aperta".
- **Não rodar `prettier` nos arquivos tocados.** O `printWidth: 100` da raiz não corresponde ao que está no disco; formatar gera churn que esconde a intenção do diff.
- **Nada de crase dentro de `template:` / `styles:`.** São template literals — uma crase em comentário fecha a string e o erro sai como `TS1005` numa linha aleatória.
- **Convenções Angular de `frontend/.claude/CLAUDE.md`, que valem para todo componente tocado:** nada de `@HostBinding` nem `@HostListener` — usar o objeto `host` do decorator; `input()` / `output()` em vez de decorators; `computed()` para estado derivado; `ChangeDetectionStrategy.OnPush`; `inject()` em vez de injeção por construtor; controle de fluxo nativo (`@if`, `@for`); **nada de `ngClass` nem `ngStyle`** — usar binding de `class` e de `style`; `standalone` NÃO deve ser declarado (já é o default).
- **Toda mensagem de commit termina com:** `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

**Criados:**

| arquivo | responsabilidade |
|---|---|
| `projects/arena/src/styles/_breakpoints.scss` | os 6 números das escadas + os 3 mixins. Única fonte dos breakpoints. |
| `projects/arena/src/app/painel/ui/panel-nav.model.ts` | `NAV_ITEMS`, grupos, e `buildNavSections()` — função pura, sem Angular. |
| `projects/arena/src/app/painel/ui/panel-nav.model.spec.ts` | testes da função pura. |
| `projects/arena/src/app/painel/ui/panel-nav-state.service.ts` | grupo aberto + rolagem, em `localStorage` por arena. |
| `projects/arena/src/app/painel/ui/panel-nav-state.service.spec.ts` | testes do serviço. |
| `projects/arena/src/app/painel/ui/viewport.service.ts` | `isCompact()` / `isPhone()` via `matchMedia`, lendo o breakpoint do CSS. |
| `projects/arena/src/app/painel/ui/panel-shell.component.spec.ts` | trava as invariantes do shell. |
| `projects/arena/src/styles.spec.ts` | trava a ordem do cascade e os tokens base. |
| `docs/qa/arena-responsivo-passe-medido.md` | procedimento do passe medido + matriz de tamanhos. |
| `scripts/qa/arena-sidebar-harness.mjs` | gera o harness estático a partir do CSS real do shell. |

**Modificados:**

| arquivo | mudança |
|---|---|
| `frontend/angular.json` | `stylePreprocessorOptions.includePaths` nos alvos `build` e `test` do arena. |
| `projects/arena/src/styles.scss` | tokens `--ar-*`, as 4 zonas do cascade, `.ar-split`, `.ar-table-scroll`. |
| `projects/arena/src/app/painel/ui/panel-shell.component.ts` | grupos, scroll, topbar, drawer, bottom-nav. |
| `projects/arena/src/app/painel/ui/drawer.component.ts` | input `side`, prisão de foco, devolução de foco. |
| `projects/arena/src/app/painel/ui/panel-card.component.ts` | padding por variável. |
| `projects/arena/src/app/painel/ui/page-header.component.ts` | padding por variável, deixa de ser `nowrap`. |
| 13 telas da Família B | grid local → `.ar-split`. |
| 7 telas da Família A | tabela dentro de `.ar-table-scroll`. |
| 4 telas do celular | viram card abaixo de `sm`. |

---

## Task 1: Fundação SCSS — escadas e mixins

**Files:**
- Create: `frontend/projects/arena/src/styles/_breakpoints.scss`
- Modify: `frontend/angular.json` (alvos `arena:build` e `arena:test`)

**Interfaces:**
- Consumes: nada.
- Produces: `@use 'breakpoints' as ar;` expondo `ar.below($name)`, `ar.shorter-than($name)`, `ar.touch`, e as variáveis `ar.$w-lg`, `ar.$w-md`, `ar.$w-sm`, `ar.$w-xs`, `ar.$h-short`, `ar.$h-xshort`.

- [ ] **Step 1: Instalar dependências (uma vez no worktree)**

```bash
cd frontend && npm ci
```

- [ ] **Step 2: Criar o partial**

Create `frontend/projects/arena/src/styles/_breakpoints.scss`:

```scss
// Escadas de faixa do painel da arena. Fonte única — nenhum outro arquivo
// declara px de breakpoint.
//
// Largura: absorve o que ja existia no projeto (1180 aparece 25x, 720 14x,
// 900 3x). Altura: nova; nenhum portal do frontend tinha @media por altura,
// e e por altura que o notebook 13" quebra.
@use 'sass:map';

$w-lg: 1180px;
$w-md: 900px;
$w-sm: 720px;
$w-xs: 480px;

$h-short: 820px;
$h-xshort: 680px;

$-widths: (lg: $w-lg, md: $w-md, sm: $w-sm, xs: $w-xs);
$-heights: (short: $h-short, xshort: $h-xshort);

@mixin below($name) {
  $v: map.get($-widths, $name);
  @if $v == null {
    @error "ar.below: faixa de largura desconhecida '#{$name}'. Use lg, md, sm ou xs.";
  }
  @media (max-width: $v) {
    @content;
  }
}

@mixin shorter-than($name) {
  $v: map.get($-heights, $name);
  @if $v == null {
    @error "ar.shorter-than: faixa de altura desconhecida '#{$name}'. Use short ou xshort.";
  }
  @media (max-height: $v) {
    @content;
  }
}

@mixin touch {
  @media (pointer: coarse) {
    @content;
  }
}
```

- [ ] **Step 3: Ligar o includePaths nos dois alvos**

Em `frontend/angular.json`, dentro de `projects.arena.architect.build.options`, acrescentar ao lado de `"inlineStyleLanguage": "scss"`:

```json
"stylePreprocessorOptions": {
  "includePaths": ["projects/arena/src/styles"]
},
```

Repetir o mesmo bloco em `projects.arena.architect.test.options`. Editar **à mão**: rodar `JSON.stringify` no arquivo reformata os outros projetos e o diff deixa de mostrar a intenção.

- [ ] **Step 4: Provar que o mixin resolve**

Acrescentar em `frontend/projects/arena/src/styles.scss` **na linha 4, ACIMA do `@import url(...)` das fontes**:

```scss
@use 'breakpoints' as ar;
```

A ordem não é estética: Sass exige que `@use` venha antes de qualquer outra regra, e hoje a linha 4 é o `@import url(...)` do Google Fonts. Pôr o `@use` embaixo dele falha o build com `@use rules must be written before any other rules`. Como o partial só tem variáveis e mixins, o `@use` não emite CSS nenhum — o CSS gerado continua começando pelo `@import`, que é o que o CSS exige.

E, temporariamente, no fim do arquivo:

```scss
.ar-smoke-breakpoints {
  color: red;
  @include ar.below(md) {
    color: blue;
  }
}
```

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build PASSA. Se o `includePaths` não pegou, falha com `Can't find stylesheet to import`.

- [ ] **Step 5: Remover o smoke e reconstruir**

Apagar o bloco `.ar-smoke-breakpoints` (o `@use` fica).

Run: `cd frontend && npx ng build arena --configuration development`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/angular.json frontend/projects/arena/src/styles/_breakpoints.scss frontend/projects/arena/src/styles.scss
git commit -m "$(cat <<'EOF'
feat(arena): escadas de faixa por largura e altura em SCSS

Fonte unica dos breakpoints do painel. A escada de largura absorve o que
ja existia (1180 em 25 usos, 720 em 14, 900 em 3); a de altura e nova --
nenhum portal do frontend tinha @media por altura, e e por altura que o
notebook 13" quebra.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Tokens de densidade e a ordem do cascade

**Files:**
- Modify: `frontend/projects/arena/src/styles.scss`
- Create: `frontend/projects/arena/src/styles.spec.ts`

**Interfaces:**
- Consumes: `ar.below`, `ar.shorter-than`, `ar.touch` da Task 1.
- Produces: custom properties em `:root` — `--ar-bp-md`, `--ar-bp-sm`, `--ar-nav-item-h`, `--ar-header-py`, `--ar-pad-page-y`, `--ar-pad-page-x`, `--ar-card-pad`, `--ar-tap`, `--ar-tap-gap`. A Task 5 lê `--ar-bp-md` do CSS em TypeScript.

- [ ] **Step 1: Escrever o teste que falha**

Create `frontend/projects/arena/src/styles.spec.ts`:

```ts
/** O `styles.scss` global entra no bundle de teste (ver `styles` no alvo
 *  `arena:test` do angular.json), entao da pra inspecionar a cascata real aqui.
 *
 *  Estes testes existem por um motivo especifico: `@media` NAO soma
 *  especificidade. Duas regras que declaram a mesma propriedade empatam e ganha
 *  a ultima declarada. A camada de toque precisa vencer a de densidade, e isso
 *  depende exclusivamente da ordem no arquivo -- nada no build avisa se alguem
 *  inverter. */

/** So a folha GLOBAL interessa. Angular injeta os estilos de cada componente
 *  como <style> proprio quando o componente e criado, e outros specs da mesma
 *  rodada deixam os deles no documento -- varrer document.styleSheets inteiro
 *  compararia a ordem entre folhas diferentes e o teste ficaria flaky conforme
 *  a ordem de execucao dos specs. A folha global e a unica que declara
 *  --ar-nav-item-h em :root. */
function globalSheetRules(): CSSRule[] {
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // folha de outra origem
    }
    const isGlobal = Array.from(rules).some(
      (rule) =>
        rule instanceof CSSStyleRule &&
        rule.selectorText.includes(':root') &&
        rule.style.getPropertyValue('--ar-nav-item-h').trim() !== '',
    );
    if (isGlobal) return Array.from(rules);
  }
  throw new Error('folha global do arena nao encontrada — --ar-nav-item-h nao esta em :root');
}

function allMediaRules(): CSSMediaRule[] {
  return globalSheetRules().filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule);
}

/** Valor DECLARADO na regra `:root` base, não o cascateado.
 *
 *  Ler `getComputedStyle` aqui daria o valor já resolvido para a janela do
 *  Karma — e o ChromeHeadless abre em 800x600, altura que dispara as duas
 *  faixas de densidade. `--ar-nav-item-h` viria 30px e o teste do valor base
 *  falharia por um motivo que não é o que ele quer medir. */
function baseToken(prop: string): string {
  for (const rule of globalSheetRules()) {
    if (rule instanceof CSSStyleRule && rule.selectorText.includes(':root')) {
      const value = rule.style.getPropertyValue(prop).trim();
      if (value) return value;
    }
  }
  return '';
}

describe('cascata global do painel da arena', () => {
  it('expoe os tokens base em :root', () => {
    expect(baseToken('--ar-nav-item-h')).toBe('34px');
    expect(baseToken('--ar-pad-page-x')).toBe('32px');
    expect(baseToken('--ar-pad-page-y')).toBe('22px');
    expect(baseToken('--ar-tap')).toBe('44px');
    expect(baseToken('--ar-tap-gap')).toBe('8px');
  });

  it('expoe os breakpoints como custom property para o TypeScript ler', () => {
    // Estes dois nao mudam por faixa, entao o valor cascateado serve -- e e o
    // que a ViewportService de fato le em producao.
    const root = getComputedStyle(document.documentElement);
    expect(root.getPropertyValue('--ar-bp-md').trim()).toBe('900px');
    expect(root.getPropertyValue('--ar-bp-sm').trim()).toBe('720px');
  });

  it('declara a camada de toque DEPOIS de toda faixa por altura', () => {
    const media = allMediaRules();
    const lastHeight = media.reduce(
      (acc, rule, i) => (rule.conditionText.includes('max-height') ? i : acc),
      -1,
    );
    const firstCoarse = media.findIndex((rule) => rule.conditionText.includes('pointer: coarse'));

    expect(lastHeight).toBeGreaterThan(-1, 'nenhuma @media por altura encontrada');
    expect(firstCoarse).toBeGreaterThan(-1, 'nenhuma @media (pointer: coarse) encontrada');
    expect(firstCoarse).toBeGreaterThan(
      lastHeight,
      'a camada de toque precisa vir depois da densidade, senao o iPad paisagem ' +
        'recebe alvo de 32px em vez de 44px',
    );
  });

  it('declara a densidade por altura DEPOIS das faixas por largura', () => {
    const media = allMediaRules();
    const lastWidth = media.reduce(
      (acc, rule, i) => (rule.conditionText.includes('max-width') ? i : acc),
      -1,
    );
    const firstHeight = media.findIndex((rule) => rule.conditionText.includes('max-height'));

    expect(firstHeight).toBeGreaterThan(lastWidth);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/styles.spec.ts'`
Expected: FAIL — `Expected '' to be '34px'` (os tokens ainda não existem).

- [ ] **Step 3: Escrever as 4 zonas do cascade**

Em `frontend/projects/arena/src/styles.scss`, dentro do `:root` que já existe, acrescentar ao final do bloco (depois de `--nx-d-base`):

```scss
  /* ---- Faixas, expostas ao TypeScript. A ViewportService le daqui em vez de
     repetir o numero em TS -- um lugar so. ---- */
  --ar-bp-md: #{ar.$w-md};
  --ar-bp-sm: #{ar.$w-sm};

  /* ---- Densidade. Os valores base sao os de hoje, entao o desktop nao muda. ---- */
  --ar-nav-item-h: 34px;
  --ar-header-py: 20px;
  --ar-pad-page-y: 22px;
  --ar-pad-page-x: 32px;
  --ar-card-pad: 20px;

  /* ---- Toque. Sempre 44/8; quem decide se valem e a zona 4. ---- */
  --ar-tap: 44px;
  --ar-tap-gap: 8px;
```

Depois, **no fim do arquivo** (a ordem é o contrato — ver o comentário):

```scss
/* =========================================================================
   ORDEM DO CASCADE — NAO REORDENAR
   @media nao soma especificidade: regras que declaram a mesma propriedade
   empatam e ganha a ULTIMA declarada. Por isso:
     1. :root base          (la em cima)
     2. largura             (maior degrau -> menor)
     3. altura
     4. pointer: coarse     (por ultimo, para o dedo ganhar da densidade)
   `styles.spec.ts` quebra se alguem inverter.
   ========================================================================= */

/* ---- 2. LARGURA ---- */
@include ar.below(md) {
  :root {
    --ar-pad-page-x: 24px;
  }
}

@include ar.below(sm) {
  :root {
    --ar-pad-page-x: 16px;
    --ar-card-pad: 16px;
  }
}

/* ---- 3. ALTURA — e aqui que o notebook 13" ganha vertical ---- */
@include ar.shorter-than(short) {
  :root {
    --ar-nav-item-h: 32px;
    --ar-header-py: 14px;
    --ar-pad-page-y: 16px;
  }
}

@include ar.shorter-than(xshort) {
  :root {
    --ar-nav-item-h: 30px;
    --ar-header-py: 10px;
    --ar-pad-page-y: 12px;
  }
}

/* ---- 4. TOQUE — POR ULTIMO ---- */
@include ar.touch {
  :root {
    --ar-nav-item-h: var(--ar-tap);
  }

  /* iOS Safari da zoom sozinho ao focar campo com fonte < 16px. Uma regra aqui
     resolve as ~397 ocorrencias de fonte pequena sem tocar em 397 lugares. */
  input,
  select,
  textarea {
    font-size: 16px;
  }
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/styles.spec.ts'`
Expected: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/styles.scss frontend/projects/arena/src/styles.spec.ts
git commit -m "$(cat <<'EOF'
feat(arena): tokens de densidade e ordem travada do cascade

Variavel carrega a magnitude; as telas passam a consumir var(--ar-*) em vez
de declarar @media propria. Os valores base sao os de hoje, entao o desktop
nao muda de aparencia.

A camada de toque fica por ultimo de proposito: no iPad paisagem (760px de
altura) a densidade quer item de 32px e o dedo quer 44px, e como @media nao
soma especificidade quem ganha e quem vem depois. styles.spec.ts quebra se
alguem reordenar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Primitivos consomem as variáveis

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/ui/panel-card.component.ts`
- Modify: `frontend/projects/arena/src/app/painel/ui/page-header.component.ts`

**Interfaces:**
- Consumes: `--ar-card-pad`, `--ar-header-py`, `--ar-pad-page-x` da Task 2.
- Produces: nada novo em TypeScript.

Os dois são a base de quase todas as telas e hoje têm **zero** `@media`.

- [ ] **Step 1: `panel-card` — padding por variável**

Em `panel-card.component.ts`, trocar as três regras de padding:

```scss
    .card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: var(--ar-card-pad);
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: 100%;
      box-sizing: border-box;
    }

    .card.pad-sm {
      padding: calc(var(--ar-card-pad) - 4px);
    }

    .card.pad-lg {
      padding: calc(var(--ar-card-pad) + 4px);
    }
```

- [ ] **Step 2: `page-header` — padding por variável e parar de forçar uma linha**

Em `page-header.component.ts`, substituir `.header`, `h1` e `.subtitle`:

```scss
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: var(--ar-header-py) var(--ar-pad-page-x);
      border-bottom: 1px solid var(--nx-line);
      flex: none;
      flex-wrap: wrap;
    }

    .titles {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      flex: 1;
    }

    h1 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 21px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
      overflow-wrap: anywhere;
    }

    .subtitle {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      overflow-wrap: anywhere;
    }
```

O `white-space: nowrap` saiu dos dois: era ele que estourava o cabeçalho na horizontal em tela estreita. O `flex-wrap: wrap` no `.header` deixa as ações caírem para a linha de baixo em vez de espremer o título.

- [ ] **Step 3: Verificar que o build passa**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/panel-card.component.ts frontend/projects/arena/src/app/painel/ui/page-header.component.ts
git commit -m "$(cat <<'EOF'
feat(arena): card e cabecalho de pagina passam a seguir a densidade

Os dois primitivos estao embaixo de quase todas as telas e nao tinham
nenhuma @media. O cabecalho tambem perde o white-space: nowrap do titulo e
do subtitulo, que era o que estourava a largura em tela estreita, e ganha
flex-wrap para as acoes cairem em vez de espremer o titulo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Modelo de navegação agrupado (função pura)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/panel-nav.model.ts`
- Create: `frontend/projects/arena/src/app/painel/ui/panel-nav.model.spec.ts`
- Modify: `frontend/projects/arena/src/app/painel/ui/panel-shell.component.ts:12-45` (remover `PanelNavItem` e `NAV_ITEMS`, importar do novo arquivo)

**Interfaces:**
- Consumes: `ArenaArea` de `../data/arena-roles.model`.
- Produces:
  - `export interface PanelNavItem { id: string; label: string; icon: PanelIconName; route: string; badge: number | null; area: ArenaArea | 'owner' | null; group: ArenaNavGroup | null }`
  - `export const NAV_ITEMS: readonly PanelNavItem[]`
  - `export const ARENA_NAV_GROUPS: readonly ArenaNavGroup[]` e `type ArenaNavGroup = 'operacao' | 'vendas' | 'dinheiro' | 'publico' | 'conta'`
  - `export const ARENA_NAV_GROUP_LABEL: Record<ArenaNavGroup, string>`
  - `export interface PanelNavSection { group: ArenaNavGroup | null; label: string; items: PanelNavItem[] }`
  - `export function buildNavSections(items: readonly PanelNavItem[], canSee: (item: PanelNavItem) => boolean): PanelNavSection[]`
  - `export function findActiveId(path: string): string | null`

- [ ] **Step 1: Escrever o teste que falha**

Create `frontend/projects/arena/src/app/painel/ui/panel-nav.model.spec.ts`:

```ts
import {
  ARENA_NAV_GROUPS,
  NAV_ITEMS,
  buildNavSections,
  findActiveId,
  type PanelNavItem,
} from './panel-nav.model';
import {
  ARENA_STAFF_ROLES,
  arenaRoleCanRead,
  type ArenaStaffRole,
} from '../data/arena-roles.model';

/** Espelha a regra de visibilidade do shell, para o teste comparar o agrupado
 *  contra o filtro cru e provar que agrupar nao perde nem inventa item. */
function canSeeAs(role: ArenaStaffRole | 'owner'): (item: PanelNavItem) => boolean {
  return (item) => {
    if (item.area == null) return true;
    if (item.area === 'owner') return role === 'owner';
    if (role === 'owner') return true;
    return arenaRoleCanRead(role, item.area);
  };
}

describe('panel-nav.model', () => {
  it('da um grupo a todo item menos o Inicio', () => {
    const semGrupo = NAV_ITEMS.filter((i) => i.group == null);
    expect(semGrupo.map((i) => i.id)).toEqual(['inicio']);
  });

  it('nao tem grupo declarado sem nenhum item', () => {
    for (const group of ARENA_NAV_GROUPS) {
      expect(NAV_ITEMS.some((i) => i.group === group)).toBe(
        true,
        `grupo '${group}' nao tem nenhum item`,
      );
    }
  });

  it('nao tem rota nem id repetido', () => {
    expect(new Set(NAV_ITEMS.map((i) => i.id)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((i) => i.route)).size).toBe(NAV_ITEMS.length);
  });

  for (const role of [...ARENA_STAFF_ROLES, 'owner'] as const) {
    it(`para '${role}', agrupar nao perde nem inventa item`, () => {
      const canSee = canSeeAs(role);
      const esperado = NAV_ITEMS.filter(canSee).map((i) => i.id);
      const obtido = buildNavSections(NAV_ITEMS, canSee).flatMap((s) => s.items.map((i) => i.id));
      expect(obtido).toEqual(esperado);
    });
  }

  it('descarta secao que ficou sem item para o cargo', () => {
    // manutencao le quadras, estoque e agenda -- nada de 'conta' nem 'dinheiro'
    const sections = buildNavSections(NAV_ITEMS, canSeeAs('manutencao'));
    expect(sections.map((s) => s.group)).not.toContain('conta');
    expect(sections.map((s) => s.group)).not.toContain('dinheiro');
    expect(sections.every((s) => s.items.length > 0)).toBe(true);
  });

  it('poe o Inicio na primeira secao, sem rotulo de grupo', () => {
    const [primeira] = buildNavSections(NAV_ITEMS, canSeeAs('owner'));
    expect(primeira.group).toBeNull();
    expect(primeira.items.map((i) => i.id)).toEqual(['inicio']);
  });

  it('acha a rota ativa por prefixo em rota aninhada', () => {
    expect(findActiveId('/painel')).toBe('inicio');
    expect(findActiveId('/painel/reservas')).toBe('reservas');
    expect(findActiveId('/painel/reservas/abc123')).toBe('reservas');
    expect(findActiveId('/painel/nao-existe')).toBeNull();
  });

  it('acha a rota ativa mesmo quando o cargo nao ve o item', () => {
    // 'planos' e owner-only; a deteccao varre NAV_ITEMS inteiro de proposito,
    // senao o realce some quando a rota atual esta fora do que o cargo ve.
    expect(findActiveId('/painel/planos')).toBe('planos');
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/panel-nav.model.spec.ts'`
Expected: FAIL — `Cannot find module './panel-nav.model'`.

- [ ] **Step 3: Criar o modelo**

Create `frontend/projects/arena/src/app/painel/ui/panel-nav.model.ts`:

```ts
import type { ArenaArea } from '../data/arena-roles.model';
import type { PanelIconName } from './icon.component';

export const ARENA_NAV_GROUPS = ['operacao', 'vendas', 'dinheiro', 'publico', 'conta'] as const;
export type ArenaNavGroup = (typeof ARENA_NAV_GROUPS)[number];

export const ARENA_NAV_GROUP_LABEL: Record<ArenaNavGroup, string> = {
  operacao: 'Operação',
  vendas: 'Vendas',
  dinheiro: 'Dinheiro',
  publico: 'Público',
  conta: 'Conta',
};

export interface PanelNavItem {
  id: string;
  label: string;
  icon: PanelIconName;
  route: string;
  badge: number | null;
  /** Área exigida; `null` = visível a todos; `'owner'` = só o dono. */
  area: ArenaArea | 'owner' | null;
  /** `null` = fica solto no topo, fora de grupo (só o Início). */
  group: ArenaNavGroup | null;
}

export const NAV_ITEMS: readonly PanelNavItem[] = [
  { id: 'inicio', label: 'Início', icon: 'home', route: '/painel', badge: null, area: null, group: null },

  { id: 'agenda', label: 'Agenda', icon: 'calendar', route: '/painel/agenda', badge: null, area: 'agenda', group: 'operacao' },
  { id: 'reservas', label: 'Reservas', icon: 'clock', route: '/painel/reservas', badge: null, area: 'agenda', group: 'operacao' },
  { id: 'horarios-fixos', label: 'Horários fixos', icon: 'repeat', route: '/painel/horarios-fixos', badge: null, area: 'agenda', group: 'operacao' },
  { id: 'clubinho', label: 'Clubinho', icon: 'users', route: '/painel/clubinho', badge: null, area: 'agenda', group: 'operacao' },
  { id: 'quadras', label: 'Quadras', icon: 'courts', route: '/painel/quadras', badge: null, area: 'quadras', group: 'operacao' },

  { id: 'comandas', label: 'Comandas', icon: 'bookmark', route: '/painel/comandas', badge: null, area: 'comandas', group: 'vendas' },
  { id: 'estoque', label: 'Estoque', icon: 'box', route: '/painel/estoque', badge: null, area: 'estoque', group: 'vendas' },
  { id: 'promocoes', label: 'Promoções', icon: 'tag', route: '/painel/promocoes', badge: null, area: 'promocoes', group: 'vendas' },
  { id: 'cupons', label: 'Cupons', icon: 'tag', route: '/painel/cupons', badge: null, area: 'promocoes', group: 'vendas' },
  { id: 'horarios-pico', label: 'Horários de pico', icon: 'tag', route: '/painel/horarios-pico', badge: null, area: 'promocoes', group: 'vendas' },

  { id: 'financeiro', label: 'Financeiro', icon: 'cash', route: '/painel/financeiro', badge: null, area: 'financeiro', group: 'dinheiro' },
  { id: 'ocupacao', label: 'Ocupação', icon: 'chart-bar', route: '/painel/relatorios/ocupacao', badge: null, area: 'financeiro', group: 'dinheiro' },

  { id: 'meu-site', label: 'Meu site', icon: 'image', route: '/painel/meu-site', badge: null, area: 'site', group: 'publico' },
  { id: 'links', label: 'Links', icon: 'share', route: '/painel/links', badge: null, area: 'site', group: 'publico' },
  { id: 'avaliacoes', label: 'Avaliações', icon: 'star', route: '/painel/avaliacoes', badge: null, area: 'comunidade', group: 'publico' },
  { id: 'seguidores', label: 'Seguidores', icon: 'users', route: '/painel/seguidores', badge: null, area: 'comunidade', group: 'publico' },
  { id: 'ranking', label: 'Ranking', icon: 'ranking', route: '/painel/ranking', badge: null, area: 'comunidade', group: 'publico' },
  { id: 'torneios', label: 'Torneios', icon: 'trophy', route: '/painel/torneios', badge: 2, area: 'torneios', group: 'publico' },

  { id: 'equipe', label: 'Equipe', icon: 'team', route: '/painel/equipe', badge: null, area: 'owner', group: 'conta' },
  { id: 'planos', label: 'Planos', icon: 'card', route: '/painel/planos', badge: null, area: 'owner', group: 'conta' },
];

export interface PanelNavSection {
  group: ArenaNavGroup | null;
  label: string;
  items: PanelNavItem[];
}

/** Agrupa os itens visíveis preservando a ordem de `NAV_ITEMS` e descartando
 *  seção que ficou vazia para o cargo. Não decide permissão: quem decide é o
 *  `canSee` que vem de fora. */
export function buildNavSections(
  items: readonly PanelNavItem[],
  canSee: (item: PanelNavItem) => boolean,
): PanelNavSection[] {
  const sections: PanelNavSection[] = [];
  const byGroup = new Map<ArenaNavGroup | null, PanelNavSection>();

  for (const item of items) {
    if (!canSee(item)) continue;
    let section = byGroup.get(item.group);
    if (!section) {
      section = {
        group: item.group,
        label: item.group == null ? '' : ARENA_NAV_GROUP_LABEL[item.group],
        items: [],
      };
      byGroup.set(item.group, section);
      sections.push(section);
    }
    section.items.push(item);
  }

  return sections;
}

/** Detecção de rota ativa. Varre `NAV_ITEMS` INTEIRO de propósito — não a lista
 *  filtrada nem a agrupada. Se varresse só o que o cargo vê, o realce sumiria
 *  quando a rota atual está fora do alcance dele. */
export function findActiveId(path: string): string | null {
  const exact = NAV_ITEMS.find((item) => item.route === path);
  if (exact) return exact.id;
  const nested = NAV_ITEMS.find(
    (item) => item.route !== '/painel' && path.startsWith(item.route + '/'),
  );
  return nested?.id ?? null;
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/panel-nav.model.spec.ts'`
Expected: PASS, 11 testes (7 fixos + 5 gerados pelos cargos, menos os que coincidem).

- [ ] **Step 5: Apontar o shell para o modelo novo**

Em `panel-shell.component.ts`: apagar a `interface PanelNavItem` (linhas 12-20), a const `NAV_ITEMS` (22-45) e a função `pathOnly` fica. Trocar os imports do topo:

```ts
import { ARENA_NAV_GROUP_LABEL, NAV_ITEMS, buildNavSections, findActiveId, type PanelNavItem } from './panel-nav.model';
```

E substituir o `activeId` para usar a função pura:

```ts
  protected readonly activeId = computed(() => findActiveId(this.currentPath()));
```

Deixar `navItems()` como está por enquanto — a Task 5 troca por seções.

Run: `cd frontend && npx ng build arena --configuration development`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/panel-nav.model.ts frontend/projects/arena/src/app/painel/ui/panel-nav.model.spec.ts frontend/projects/arena/src/app/painel/ui/panel-shell.component.ts
git commit -m "$(cat <<'EOF'
feat(arena): modelo de navegacao agrupado, fora do componente

Os 21 itens ganham grupo (Operacao, Vendas, Dinheiro, Publico, Conta) e o
modelo sai do panel-shell para um arquivo proprio, testavel sem TestBed.

O teste compara, para os 4 cargos mais o dono, o conjunto agrupado contra o
filtro cru -- agrupar nao pode perder nem inventar item. E trava que a
deteccao de rota ativa varre NAV_ITEMS inteiro, senao o realce some quando a
rota atual esta fora do que o cargo alcanca.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Estado do menu e detecção de viewport

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/panel-nav-state.service.ts`
- Create: `frontend/projects/arena/src/app/painel/ui/panel-nav-state.service.spec.ts`
- Create: `frontend/projects/arena/src/app/painel/ui/viewport.service.ts`

**Interfaces:**
- Consumes: `ArenaNavGroup` da Task 4; `--ar-bp-md` / `--ar-bp-sm` da Task 2.
- Produces:
  - `PanelNavStateService` com `openGroup(arenaId: string | null): ArenaNavGroup | null`, `setOpenGroup(arenaId: string | null, group: ArenaNavGroup | null): void`, `scrollTop(arenaId: string | null): number`, `setScrollTop(arenaId: string | null, value: number): void`
  - `ViewportService` com `readonly isCompact: Signal<boolean>` (≤ 900px) e `readonly isPhone: Signal<boolean>` (≤ 720px)

O estado precisa sobreviver ao remonte: as 38 telas instanciam `<ar-panel-shell>` cada uma e `app.routes.ts` não tem rota de layout, então o shell é destruído e recriado a cada navegação.

- [ ] **Step 1: Escrever o teste que falha**

Create `frontend/projects/arena/src/app/painel/ui/panel-nav-state.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PanelNavStateService } from './panel-nav-state.service';

describe('PanelNavStateService', () => {
  let service: PanelNavStateService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    service = TestBed.inject(PanelNavStateService);
  });

  afterEach(() => localStorage.clear());

  it('comeca sem grupo aberto', () => {
    expect(service.openGroup('arena-1')).toBeNull();
  });

  it('guarda e devolve o grupo aberto', () => {
    service.setOpenGroup('arena-1', 'vendas');
    expect(service.openGroup('arena-1')).toBe('vendas');
  });

  it('separa o estado por arena', () => {
    service.setOpenGroup('arena-1', 'vendas');
    service.setOpenGroup('arena-2', 'conta');
    expect(service.openGroup('arena-1')).toBe('vendas');
    expect(service.openGroup('arena-2')).toBe('conta');
  });

  it('sobrevive a uma instancia nova (o shell remonta a cada navegacao)', () => {
    service.setOpenGroup('arena-1', 'publico');
    service.setScrollTop('arena-1', 120);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const outra = TestBed.inject(PanelNavStateService);

    expect(outra.openGroup('arena-1')).toBe('publico');
    expect(outra.scrollTop('arena-1')).toBe(120);
  });

  it('ignora grupo invalido que sobrou de uma versao anterior', () => {
    localStorage.setItem('ar.nav.arena-1', JSON.stringify({ openGroup: 'marketing', scrollTop: 0 }));
    expect(service.openGroup('arena-1')).toBeNull();
  });

  it('nao quebra quando o localStorage lanca (aba anonima, storage bloqueado)', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('QuotaExceededError');
    };
    try {
      expect(() => service.setOpenGroup('arena-1', 'vendas')).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('trata arena nula sem estourar', () => {
    expect(service.openGroup(null)).toBeNull();
    expect(() => service.setOpenGroup(null, 'vendas')).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/panel-nav-state.service.spec.ts'`
Expected: FAIL — `Cannot find module './panel-nav-state.service'`.

- [ ] **Step 3: Criar o serviço de estado**

Create `frontend/projects/arena/src/app/painel/ui/panel-nav-state.service.ts`:

```ts
import { Injectable } from '@angular/core';
import { ARENA_NAV_GROUPS, type ArenaNavGroup } from './panel-nav.model';

interface StoredNavState {
  openGroup: ArenaNavGroup | null;
  scrollTop: number;
}

const EMPTY: StoredNavState = { openGroup: null, scrollTop: 0 };

function isGroup(value: unknown): value is ArenaNavGroup {
  return typeof value === 'string' && (ARENA_NAV_GROUPS as readonly string[]).includes(value);
}

/** Grupo aberto e rolagem do menu, por arena.
 *
 *  Existe porque as 38 telas instanciam `<ar-panel-shell>` cada uma e
 *  `app.routes.ts` não tem rota de layout: o shell é destruído e recriado a cada
 *  navegação. Sem isto, o menu voltaria ao estado inicial a cada clique.
 *
 *  Todo acesso ao `localStorage` é protegido: em aba anônima ou com storage
 *  bloqueado ele lança, e uma preferência de menu não pode derrubar o painel. */
@Injectable({ providedIn: 'root' })
export class PanelNavStateService {
  private readonly cache = new Map<string, StoredNavState>();

  openGroup(arenaId: string | null): ArenaNavGroup | null {
    return this.read(arenaId).openGroup;
  }

  setOpenGroup(arenaId: string | null, group: ArenaNavGroup | null): void {
    this.write(arenaId, { ...this.read(arenaId), openGroup: group });
  }

  scrollTop(arenaId: string | null): number {
    return this.read(arenaId).scrollTop;
  }

  setScrollTop(arenaId: string | null, value: number): void {
    this.write(arenaId, { ...this.read(arenaId), scrollTop: value });
  }

  private key(arenaId: string): string {
    return `ar.nav.${arenaId}`;
  }

  private read(arenaId: string | null): StoredNavState {
    if (!arenaId) return EMPTY;
    const cached = this.cache.get(arenaId);
    if (cached) return cached;

    let parsed: StoredNavState = EMPTY;
    try {
      const raw = localStorage.getItem(this.key(arenaId));
      if (raw) {
        const value = JSON.parse(raw) as Partial<StoredNavState>;
        parsed = {
          openGroup: isGroup(value.openGroup) ? value.openGroup : null,
          scrollTop: typeof value.scrollTop === 'number' ? value.scrollTop : 0,
        };
      }
    } catch {
      parsed = EMPTY;
    }

    this.cache.set(arenaId, parsed);
    return parsed;
  }

  private write(arenaId: string | null, state: StoredNavState): void {
    if (!arenaId) return;
    this.cache.set(arenaId, state);
    try {
      localStorage.setItem(this.key(arenaId), JSON.stringify(state));
    } catch {
      // storage indisponível: o cache em memória segura a sessão atual
    }
  }
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/panel-nav-state.service.spec.ts'`
Expected: PASS, 7 testes.

- [ ] **Step 5: Criar o ViewportService**

Create `frontend/projects/arena/src/app/painel/ui/viewport.service.ts`:

```ts
// DOCUMENT vem de @angular/common: e a convencao deste repo (organizer e site
// importam assim). O @angular/core tambem reexporta na v20, mas seguir a casa
// evita dois padroes para a mesma coisa.
import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/** Lê o breakpoint do CSS em vez de repetir o número em TypeScript.
 *  `--ar-bp-md` e `--ar-bp-sm` saem do `_breakpoints.scss` via `styles.scss`;
 *  duplicar o valor aqui criaria duas fontes que divergem em silêncio. */
function breakpointPx(doc: Document, prop: string, fallback: number): number {
  const raw = getComputedStyle(doc.documentElement).getPropertyValue(prop).trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly doc = inject(DOCUMENT);
  private readonly width = signal(this.doc.defaultView?.innerWidth ?? 1440);

  /** ≤ 900px: a sidebar sai e entram topbar + drawer. */
  readonly isCompact = computed(
    () => this.width() <= breakpointPx(this.doc, '--ar-bp-md', 900),
  );

  /** ≤ 720px: entra a bottom-nav. */
  readonly isPhone = computed(() => this.width() <= breakpointPx(this.doc, '--ar-bp-sm', 720));

  constructor() {
    const view = this.doc.defaultView;
    view?.addEventListener('resize', () => this.width.set(view.innerWidth), { passive: true });
  }
}
```

- [ ] **Step 6: Verificar que o build passa**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/panel-nav-state.service.ts frontend/projects/arena/src/app/painel/ui/panel-nav-state.service.spec.ts frontend/projects/arena/src/app/painel/ui/viewport.service.ts
git commit -m "$(cat <<'EOF'
feat(arena): estado do menu persistido e deteccao de viewport

O shell e destruido e recriado a cada navegacao (38 telas instanciam
<ar-panel-shell> cada uma; app.routes.ts nao tem rota de layout), entao o
grupo aberto e a rolagem do menu precisam morar fora do componente.

Todo acesso ao localStorage e protegido: em aba anonima ele lanca, e uma
preferencia de menu nao pode derrubar o painel.

O ViewportService le o breakpoint de --ar-bp-md/--ar-bp-sm em vez de repetir
900/720 em TypeScript -- duas fontes divergiriam em silencio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `ar-drawer` ganha lado e prisão de foco

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/ui/drawer.component.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `DrawerComponent` com `readonly side = input<'left' | 'right'>('right')` e `readonly ariaLabel = input('')`. O default `'right'` preserva o uso atual em `panel-ranking.component.ts:122`.

Hoje o drawer é ancorado à direita (`justify-content: flex-end`, `translateX(100%)`) e não prende foco. Menu de navegação abre pela esquerda.

- [ ] **Step 1: Reescrever o componente**

Substituir o conteúdo de `drawer.component.ts` por:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Painel lateral deslizante (protótipo ArDrawer): scrim + painel projetado.
 *  Fecha no scrim, no X ou em Escape.
 *
 *  `side` existe porque o drawer nasceu à direita (detalhe de registro) e a
 *  navegação precisa vir da esquerda. O default continua `'right'` para não
 *  mexer em quem já usa. */
@Component({
  selector: 'ar-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Nada de @HostListener: `frontend/.claude/CLAUDE.md` manda pôr binding de host
  // aqui. Escape e Tab escutam no proprio host, nao no document -- o painel recebe
  // foco ao abrir, entao o teclado ja esta dentro quando as teclas chegam.
  host: {
    '(keydown.escape)': 'onEscape()',
    '(keydown.tab)': 'onTab($event)',
    '(keydown.shift.tab)': 'onTab($event)',
  },
  template: `
    <div class="scrim" [class.left]="side() === 'left'" (click)="close.emit()">
      <div
        #panel
        class="panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="ariaLabel() || null"
        tabindex="-1"
        (click)="$event.stopPropagation()"
      >
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      justify-content: flex-end;
      animation: ar-scrim-in 180ms var(--nx-ease-out);
    }

    .scrim.left {
      justify-content: flex-start;
    }

    .panel {
      width: 100%;
      max-width: 420px;
      height: 100%;
      overflow-y: auto;
      background: var(--nx-surface-0);
      border-left: 1px solid var(--nx-line-strong);
      padding: 28px 24px;
      box-shadow: -24px 0 64px rgba(0, 0, 0, 0.5);
      animation: ar-drawer-in 240ms var(--nx-ease-out);
      box-sizing: border-box;
    }

    .panel:focus {
      outline: none;
    }

    .scrim.left .panel {
      border-left: none;
      border-right: 1px solid var(--nx-line-strong);
      box-shadow: 24px 0 64px rgba(0, 0, 0, 0.5);
      animation-name: ar-drawer-in-left;
    }

    @keyframes ar-scrim-in {
      from {
        opacity: 0;
      }
    }

    @keyframes ar-drawer-in {
      from {
        transform: translateX(100%);
      }
    }

    @keyframes ar-drawer-in-left {
      from {
        transform: translateX(-100%);
      }
    }
  `,
})
export class DrawerComponent implements OnDestroy {
  readonly close = output<void>();
  readonly side = input<'left' | 'right'>('right');
  readonly ariaLabel = input('');

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly openedBy = this.host.nativeElement.ownerDocument.activeElement;

  constructor() {
    effect(() => this.panel().nativeElement.focus());
  }

  ngOnDestroy(): void {
    if (this.openedBy instanceof HTMLElement && this.openedBy.isConnected) {
      this.openedBy.focus();
    }
  }

  protected onEscape(): void {
    this.close.emit();
  }

  /** Prisão de foco: Tab no último volta pro primeiro e Shift+Tab no primeiro
   *  vai pro último, para o teclado não escapar para a página atrás do scrim. */
  protected onTab(event: KeyboardEvent): void {
    const focusables = Array.from(
      this.panel().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = this.host.nativeElement.ownerDocument.activeElement;

    if (event.shiftKey && (active === first || active === this.panel().nativeElement)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
```

- [ ] **Step 2: Verificar que o uso existente não quebrou**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: PASS. `panel-ranking.component.ts:122` usa `<ar-drawer (close)="select(null)">` sem `side` — continua à direita pelo default.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/drawer.component.ts
git commit -m "$(cat <<'EOF'
feat(arena): drawer ganha lado e prisao de foco

O drawer nasceu ancorado a direita (detalhe do Ranking); navegacao abre pela
esquerda. `side` tem default 'right', entao o uso atual nao muda.

Ganha tambem prisao de foco e devolucao do foco ao gatilho -- sem isso o
teclado escapa para a pagina atras do scrim.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Shell agrupado, rolável, com topbar e bottom-nav

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/ui/panel-shell.component.ts`
- Create: `frontend/projects/arena/src/app/painel/ui/panel-shell.component.spec.ts`

**Interfaces:**
- Consumes: `buildNavSections`, `findActiveId`, `NAV_ITEMS` (Task 4); `PanelNavStateService`, `ViewportService` (Task 5); `DrawerComponent` com `side` (Task 6); `--ar-nav-item-h`, `--ar-tap`, `--ar-tap-gap` (Task 2).
- Produces: `PanelShellComponent` sem API pública nova (continua projetando `<ng-content />`).

É esta task que mata o bug.

- [ ] **Step 1: Escrever o teste que falha**

Create `frontend/projects/arena/src/app/painel/ui/panel-shell.component.spec.ts`:

```ts
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { NAV_ITEMS } from './panel-nav.model';
import { PanelShellComponent } from './panel-shell.component';
import { ViewportService } from './viewport.service';

function mount(opts: { compact: boolean; phone: boolean }): ComponentFixture<PanelShellComponent> {
  TestBed.configureTestingModule({
    imports: [PanelShellComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: () => ({ email: 'dono@arena.com' }) } },
      {
        provide: ArenaContextService,
        useValue: {
          arenaId: () => 'arena-1',
          arenaName: () => 'Arena Beach Club',
          managedArenas: () => [{ id: 'arena-1' }],
          isOwner: () => true,
          staffRole: () => null,
          loading: () => false,
        },
      },
      {
        provide: ArenaAccessService,
        useValue: { isOwner: () => true, canRead: () => true, ready: () => true },
      },
      {
        provide: ViewportService,
        useValue: { isCompact: signal(opts.compact), isPhone: signal(opts.phone) },
      },
    ],
  });

  const fixture = TestBed.createComponent(PanelShellComponent);
  fixture.detectChanges();
  return fixture;
}

describe('PanelShellComponent', () => {
  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('NUNCA deixa o menu com overflow-y hidden', () => {
    // O bug original: .nav tinha overflow: hidden dentro de um shell de altura
    // fixa, entao os itens de baixo sumiam sem barra de rolagem e sem a pagina
    // rolar. Num MacBook Air 13" sumiam 10 dos 21.
    const fixture = mount({ compact: false, phone: false });
    const nav = fixture.nativeElement.querySelector('.nav') as HTMLElement;

    expect(nav).withContext('menu nao renderizou').toBeTruthy();
    expect(getComputedStyle(nav).overflowY).not.toBe('hidden');
  });

  /** Grupo recolhido nao renderiza os filhos, entao contar itens direto mediria
   *  so o grupo aberto. Abrir todos e o unico jeito de provar que nenhum item
   *  ficou fora do alcance -- que e a regressao que importa. */
  function expandirTudo(fixture: ComponentFixture<PanelShellComponent>): void {
    for (const head of Array.from(
      fixture.nativeElement.querySelectorAll('.nav .nav-group-head'),
    ) as HTMLButtonElement[]) {
      if (head.getAttribute('aria-expanded') === 'false') {
        head.click();
        fixture.detectChanges();
      }
    }
  }

  it('todo item do dono e alcancavel abrindo os grupos', () => {
    const fixture = mount({ compact: false, phone: false });

    const grupos = fixture.nativeElement.querySelectorAll('.nav .nav-group-head');
    expect(grupos.length).withContext('esperado 5 grupos para o dono').toBe(5);

    const vistos = new Set<string>();
    // Cada grupo abre um de cada vez (abrir um fecha o outro), entao recolhe
    // tudo o que aparecer a cada passada ate cobrir os 21.
    for (let i = 0; i < grupos.length; i++) {
      (grupos[i] as HTMLButtonElement).click();
      fixture.detectChanges();
      for (const el of Array.from(
        fixture.nativeElement.querySelectorAll('.nav .nav-item[data-nav-id]'),
      ) as HTMLElement[]) {
        const id = el.dataset['navId'];
        if (id) vistos.add(id);
      }
    }

    for (const item of NAV_ITEMS) {
      expect(Array.from(vistos))
        .withContext(`'${item.id}' nao e alcancavel por nenhum grupo`)
        .toContain(item.id);
    }
  });

  it('cabecalho de grupo e button com aria-expanded', () => {
    const fixture = mount({ compact: false, phone: false });
    const cabecalhos = fixture.nativeElement.querySelectorAll('.nav-group-head');

    expect(cabecalhos.length).toBeGreaterThan(0);
    for (const head of Array.from(cabecalhos) as HTMLElement[]) {
      expect(head.tagName).toBe('BUTTON');
      expect(head.getAttribute('aria-expanded')).toMatch(/^(true|false)$/);
    }
  });

  it('no desktop nao renderiza topbar nem bottom-nav', () => {
    const fixture = mount({ compact: false, phone: false });
    expect(fixture.nativeElement.querySelector('.topbar')).toBeNull();
    expect(fixture.nativeElement.querySelector('.bottom-nav')).toBeNull();
  });

  it('abaixo de 900px existe gatilho de menu no lugar da sidebar', () => {
    // A regressao que isso trava: hoje .sidebar vira display:none a 900px e
    // NADA entra no lugar -- a 834px o painel fica com zero rotas alcancaveis.
    const fixture = mount({ compact: true, phone: false });
    const gatilho = fixture.nativeElement.querySelector('.topbar [data-nav-trigger]');

    expect(gatilho).withContext('nenhum gatilho de navegacao no modo compacto').toBeTruthy();
    expect(gatilho.getAttribute('aria-label')).toBeTruthy();
  });

  it('o gatilho abre o drawer com a arvore de navegacao', () => {
    const fixture = mount({ compact: true, phone: false });
    const gatilho = fixture.nativeElement.querySelector(
      '.topbar [data-nav-trigger]',
    ) as HTMLButtonElement;

    gatilho.click();
    fixture.detectChanges();

    const drawer = fixture.nativeElement.querySelector('ar-drawer');
    expect(drawer).withContext('drawer nao abriu').toBeTruthy();
    // Os 5 grupos mais o Inicio solto: e a arvore inteira, mesmo com grupos
    // recolhidos (que nao renderizam filhos).
    expect(drawer.querySelectorAll('.nav-group-head').length).toBe(5);
    expect(drawer.querySelector('.nav-item[data-nav-id="inicio"]')).toBeTruthy();
  });

  it('a bottom-nav tem no maximo 5 slots e nenhum vazio', () => {
    const fixture = mount({ compact: true, phone: true });
    const slots = Array.from(
      fixture.nativeElement.querySelectorAll('.bottom-nav [data-bottom-slot]'),
    ) as HTMLElement[];

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.length).toBeLessThanOrEqual(5);
    for (const slot of slots) {
      expect(slot.textContent?.trim()).toBeTruthy();
    }
  });

  it('a bottom-nav reserva a area segura do iPhone', () => {
    const fixture = mount({ compact: true, phone: true });
    const bar = fixture.nativeElement.querySelector('.bottom-nav') as HTMLElement;
    // Nao da para medir env() no headless; o contrato aqui e que a regra exista.
    expect(fixture.nativeElement.innerHTML).toBeTruthy();
    expect(getComputedStyle(bar).position).toBe('fixed');
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/panel-shell.component.spec.ts'`
Expected: FAIL — `overflowY` é `'hidden'` e não existe `.nav-group-head`.

- [ ] **Step 3: Reescrever o template do shell**

Em `panel-shell.component.ts`, substituir o `template:` inteiro por:

```html
    @if (viewport.isCompact()) {
      <header class="topbar">
        <button
          type="button"
          class="nav-trigger"
          data-nav-trigger
          aria-label="Abrir menu de navegação"
          [attr.aria-expanded]="drawerOpen()"
          (click)="drawerOpen.set(true)"
        >
          <ar-icon name="home" [size]="18" [strokeWidth]="2" />
        </button>
        <div class="topbar-name">{{ arenaName() }}</div>
        <a class="topbar-avatar" routerLink="/painel/perfil" title="Ver perfil">{{ userInitials() }}</a>
      </header>
    }

    <div class="shell">
      @if (!viewport.isCompact()) {
        <aside class="sidebar">
          <ng-container [ngTemplateOutlet]="navTree" />
        </aside>
      }

      <div class="content">
        <ng-content />
      </div>
    </div>

    @if (viewport.isCompact() && drawerOpen()) {
      <ar-drawer side="left" ariaLabel="Menu de navegação" (close)="drawerOpen.set(false)">
        <ng-container [ngTemplateOutlet]="navTree" />
      </ar-drawer>
    }

    @if (viewport.isPhone()) {
      <nav class="bottom-nav" aria-label="Navegação principal">
        @for (item of bottomItems(); track item.id) {
          <a
            class="bottom-slot"
            data-bottom-slot
            [class.active]="activeId() === item.id"
            [routerLink]="item.route"
            [attr.aria-current]="activeId() === item.id ? 'page' : null"
          >
            <ar-icon [name]="item.icon" [size]="19" [strokeWidth]="1.9" />
            <span>{{ item.label }}</span>
          </a>
        }
        <button type="button" class="bottom-slot" data-bottom-slot (click)="drawerOpen.set(true)">
          <ar-icon name="gear" [size]="19" [strokeWidth]="1.9" />
          <span>Mais</span>
        </button>
      </nav>
    }

    <ng-template #navTree>
      <div class="brand">
        <img class="mark" src="/brand/logo.png" alt="" width="32" height="32" />
        <div class="wordmark">
          <div class="name">nexa<span>GO</span></div>
          <div class="tag">Arena</div>
        </div>
      </div>

      <a class="switcher" routerLink="/painel/perfil" title="Ver perfil">
        <div class="switcher-avatar" aria-hidden="true">{{ arenaInitials() }}</div>
        <div class="switcher-body">
          <div class="switcher-name">{{ arenaName() }}</div>
        </div>
        <ar-icon name="chevron-right" [size]="13" style="color: var(--nx-text-dim)" />
      </a>

      @if (hasMultipleArenas()) {
        <a class="switch-arena-link" routerLink="/painel/selecionar-arena">
          <ar-icon name="repeat" [size]="12" />
          Trocar arena
        </a>
      }

      <nav class="nav" #navEl (scroll)="rememberScroll(navEl.scrollTop)">
        @for (section of sections(); track section.group) {
          @if (section.group === null) {
            @for (item of section.items; track item.id) {
              <ng-container [ngTemplateOutlet]="navLink" [ngTemplateOutletContext]="{ $implicit: item }" />
            }
          } @else {
            <button
              type="button"
              class="nav-group-head"
              [attr.aria-expanded]="isOpen(section.group)"
              (click)="toggleGroup(section.group)"
            >
              <span>{{ section.label }}</span>
              <ar-icon [name]="isOpen(section.group) ? 'chevron-right' : 'chevron-right'" [size]="12" />
            </button>
            @if (isOpen(section.group)) {
              @for (item of section.items; track item.id) {
                <ng-container [ngTemplateOutlet]="navLink" [ngTemplateOutletContext]="{ $implicit: item }" />
              }
            }
          }
        }
      </nav>

      <div class="spacer"></div>

      <div class="nav-item disabled" title="Em breve">
        <ar-icon name="gear" [size]="17" [strokeWidth]="1.9" />
        <span>Configurações</span>
      </div>

      <a class="user-row" routerLink="/painel/perfil" title="Ver perfil">
        <div class="avatar" aria-hidden="true">{{ userInitials() }}</div>
        <div class="who">
          <div class="who-name">{{ displayName() }}</div>
          <div class="who-role">Gestor</div>
        </div>
      </a>
    </ng-template>

    <ng-template #navLink let-item>
      <a
        class="nav-item"
        [attr.data-nav-id]="item.id"
        [class.active]="activeId() === item.id"
        [attr.aria-current]="activeId() === item.id ? 'page' : null"
        [routerLink]="item.route"
        (click)="drawerOpen.set(false)"
      >
        <ar-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
        <span>{{ item.label }}</span>
        @if (item.badge) {
          <span class="badge">{{ item.badge }}</span>
        }
      </a>
    </ng-template>
```

Acrescentar `NgTemplateOutlet` e `DrawerComponent` aos `imports` do decorator:

```ts
  imports: [RouterLink, IconComponent, NgTemplateOutlet, DrawerComponent],
```

- [ ] **Step 4: Trocar as regras de CSS que causavam o corte**

No bloco `styles:` do shell, substituir `.nav`, `.nav-item` e o `@media` final, e acrescentar as regras novas:

```scss
    .nav {
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin-top: 14px;
      min-height: 0;
      /* era `overflow: hidden` -- e por isso que 10 dos 21 itens sumiam sem
         barra num MacBook Air 13". Com grupos a lista quase nunca rola, mas a
         invariante e que NUNCA se corte em silencio. */
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }

    .nav-group-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      height: var(--ar-nav-item-h);
      flex: none;
      padding: 0 12px;
      margin-top: 6px;
      border: 0;
      background: none;
      border-radius: var(--nx-r-2);
      cursor: pointer;
      color: var(--nx-text-dim);
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      text-align: left;
    }

    .nav-group-head:hover {
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      height: var(--ar-nav-item-h);
      flex: none;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      letter-spacing: -0.005em;
      position: relative;
      text-decoration: none;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 12px;
      height: 56px;
      padding: 0 12px;
      background: #070708;
      border-bottom: 1px solid var(--nx-line);
    }

    .nav-trigger {
      width: var(--ar-tap);
      height: var(--ar-tap);
      flex: none;
      display: grid;
      place-items: center;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      cursor: pointer;
    }

    .topbar-name {
      flex: 1;
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .topbar-avatar {
      width: var(--ar-tap);
      height: var(--ar-tap);
      flex: none;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      color: var(--nx-orange-500);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 11px;
      text-decoration: none;
    }

    .bottom-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 30;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      gap: var(--ar-tap-gap);
      padding: 6px 8px;
      /* Nenhum env() existia no projeto; sem isto a barra fica embaixo da barra
         de gestos do iPhone. */
      padding-bottom: calc(6px + env(safe-area-inset-bottom, 0px));
      background: #070708;
      border-top: 1px solid var(--nx-line);
    }

    .bottom-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      min-height: var(--ar-tap);
      border: 0;
      background: none;
      border-radius: var(--nx-r-2);
      cursor: pointer;
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 10px;
      text-decoration: none;
    }

    .bottom-slot.active {
      color: var(--nx-orange-500);
    }
```

Apagar o bloco `@media (max-width: 900px)` que ficava no fim (linhas 415-423): quem decide agora é o `ViewportService`, e manter os dois cria duas fontes para o mesmo número.

O `.shell` ganha altura consciente da topbar e da bottom-nav, por classe no host:

```scss
    .shell {
      height: 100dvh;
      display: grid;
      grid-template-columns: 236px 1fr;
      background: var(--nx-bg);
      color: var(--nx-text);
      overflow: hidden;
    }

    :host(.compact) .shell {
      height: calc(100dvh - 56px);
      grid-template-columns: minmax(0, 1fr);
    }

    :host(.phone) .content {
      padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
    }
```

As classes vêm do `ViewportService`, que já sabe a resposta — acrescentar ao `@Component`:

```ts
  host: {
    '[class.compact]': 'viewport.isCompact()',
    '[class.phone]': 'viewport.isPhone()',
  },
```

Deliberadamente **não** usar `:host:has(.topbar)`: `:has()` não aparece em nenhum lugar do projeto hoje, e aqui seria derivar em CSS um fato que o TypeScript já tem — duas fontes para a mesma decisão. Com a classe, o spec também consegue afirmar o estado sem medir layout.

E, sob toque, os alvos ganham separação:

```scss
    @media (pointer: coarse) {
      .nav {
        gap: var(--ar-tap-gap);
      }
    }
```

- [ ] **Step 5: Trocar a classe do componente**

Substituir o corpo de `PanelShellComponent` por:

```ts
export class PanelShellComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly navState = inject(PanelNavStateService);
  protected readonly viewport = inject(ViewportService);

  protected readonly drawerOpen = signal(false);

  /** Itens fixos da bottom-nav, na ordem. O slot que o cargo nao alcanca cai
   *  para o proximo permitido, para nunca sobrar buraco; "Mais" e um botao a
   *  parte no template e garante que nada fique so-por-URL. */
  private static readonly BOTTOM_PREFERENCE = [
    'inicio',
    'agenda',
    'reservas',
    'comandas',
    'estoque',
    'financeiro',
  ];

  private canSee(item: PanelNavItem): boolean {
    if (item.area == null) return true;
    if (item.area === 'owner') return this.access.isOwner();
    return this.access.canRead(item.area);
  }

  protected readonly sections = computed(() =>
    buildNavSections(NAV_ITEMS, (item) => this.canSee(item)),
  );

  protected readonly bottomItems = computed(() => {
    const visiveis = NAV_ITEMS.filter((item) => this.canSee(item));
    const ordenado = PanelShellComponent.BOTTOM_PREFERENCE.map((id) =>
      visiveis.find((item) => item.id === id),
    ).filter((item): item is PanelNavItem => item != null);
    // 4 + o botao "Mais" do template = 5, o teto recomendado.
    return ordenado.slice(0, 4);
  });

  private readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => pathOnly(this.router.url)),
      startWith(pathOnly(this.router.url)),
    ),
    { initialValue: pathOnly(this.router.url) },
  );

  protected readonly activeId = computed(() => findActiveId(this.currentPath()));

  /** Grupo aberto: o da rota atual quando ainda nao ha escolha guardada. */
  private readonly storedGroup = signal(this.navState.openGroup(this.arenaContext.arenaId()));

  protected isOpen(group: ArenaNavGroup): boolean {
    const guardado = this.storedGroup();
    if (guardado != null) return guardado === group;
    const active = this.activeId();
    return NAV_ITEMS.find((item) => item.id === active)?.group === group;
  }

  protected toggleGroup(group: ArenaNavGroup): void {
    const proximo = this.isOpen(group) ? null : group;
    this.storedGroup.set(proximo);
    this.navState.setOpenGroup(this.arenaContext.arenaId(), proximo);
  }

  protected rememberScroll(value: number): void {
    this.navState.setScrollTop(this.arenaContext.arenaId(), value);
  }

  /** Identidade da pessoa logada (gestor) — NÃO usar `auth.displayName()` aqui: esse campo do
   *  Firebase Auth guarda o nome da ARENA no cadastro self-service (`createArenaAccount`) e o
   *  nome da pessoa só em contas provisionadas por admin, então é ambíguo. O e-mail é o único
   *  identificador que é sempre da pessoa, nos dois fluxos. */
  protected readonly displayName = computed(() => this.auth.user()?.email || 'Conta');

  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? 'Minha arena');
  protected readonly hasMultipleArenas = computed(() => this.arenaContext.managedArenas().length > 1);

  protected readonly userInitials = computed(() => initialsOf(this.displayName()));
  protected readonly arenaInitials = computed(() => initialsOf(this.arenaName()));
}
```

Ajustar os imports do topo do arquivo:

```ts
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { DrawerComponent } from './drawer.component';
import { IconComponent } from './icon.component';
import { initialsOf } from './initials';
import {
  NAV_ITEMS,
  buildNavSections,
  findActiveId,
  type ArenaNavGroup,
  type PanelNavItem,
} from './panel-nav.model';
import { PanelNavStateService } from './panel-nav-state.service';
import { ViewportService } from './viewport.service';
```

- [ ] **Step 6: Rodar os testes**

Run: `cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/panel-shell.component.spec.ts'`
Expected: PASS, 8 testes.

- [ ] **Step 7: Rodar a suíte inteira e o build**

Run: `cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS

Run: `cd frontend && npx ng build arena --configuration production`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/panel-shell.component.ts frontend/projects/arena/src/app/painel/ui/panel-shell.component.spec.ts
git commit -m "$(cat <<'EOF'
fix(arena): menu deixa de ser cortado e passa a existir abaixo de 900px

O .nav tinha overflow: hidden dentro de um shell de 100dvh com 21 itens de
altura fixa. Medido: a lista pede 753px e o sidebar inteiro ~990px, entao
sumiam 10 dos 21 itens num MacBook Air 13", 11 num 1366x768 e ate 2 num
1920x1080 -- "Equipe" e "Planos", onde a arena paga. Sem barra de rolagem e
com a pagina tambem sem rolar, os itens ficavam so-por-URL.

Agora: 21 itens em 5 grupos recolhiveis (6 linhas fechadas, ~11 com um grupo
aberto, cabe em 633px), .nav rolavel como invariante, e abaixo de 900px
topbar + drawer pela esquerda, com bottom-nav de 5 slots no celular. Antes,
a 834px, o painel tinha zero rotas alcancaveis.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Família B — layout partido nas 13 telas

**Files:**
- Modify: `frontend/projects/arena/src/styles.scss`
- Modify (13): `painel/orders/panel-order-detail.component.ts`, `painel/plans/panel-plans.component.ts`, `painel/stock/panel-stock-detail.component.ts`, `painel/clubinho/panel-club-form.component.ts`, `painel/promotions/panel-promotion-form.component.ts`, `painel/coupons/panel-coupon-form.component.ts`, `painel/profile/panel-profile-hours.component.ts`, `painel/finance/panel-finance-reports.component.ts`, `painel/home/panel-home.component.ts`, `painel/agenda/panel-agenda.component.ts`, `painel/profile/panel-profile.component.ts`, `painel/site/panel-site.component.ts`, `painel/finance/panel-finance.component.ts`

**Interfaces:**
- Consumes: `ar.below` (Task 1).
- Produces: classe global `.ar-split`, com override opcional por `--ar-split-aside`.

- [ ] **Step 1: Criar a regra compartilhada**

Em `styles.scss`, na zona 1 (antes do bloco de ordem do cascade), acrescentar:

```scss
/* Layout partido: conteudo + trilha lateral. 13 telas repetiam `1fr 373px`
   com variacoes de 320 a 373px. `minmax(0, 1fr)` e proposital: `1fr` sozinho
   nasce com min-width: auto = min-content do conteudo, e um <select> com opcao
   longa ganha do 1fr sem dar scroll -- so "aperta". */
.ar-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--ar-split-aside, 373px);
  gap: 20px;
  align-items: start;
}
```

E, na zona 2 (largura), dentro do `@include ar.below(md)` que já existe:

```scss
  .ar-split {
    grid-template-columns: minmax(0, 1fr);
  }
```

- [ ] **Step 2: Converter as 13 telas**

Em cada uma, localizar a regra com o `grid-template-columns` do inventário e trocar por `.ar-split` no template, removendo a regra local. Padrão da mudança, usando `panel-plans.component.ts:298` como exemplo real:

Antes (no `styles:`):
```scss
    .top-row {
      display: grid;
      grid-template-columns: 1fr 373px;
      gap: 20px;
    }
```

Depois: apagar a regra e, no `template:`, trocar `class="top-row"` por `class="ar-split"`.

**Os nomes de classe diferem por tela** — `panel-plans` usa `.top-row`, outras usam nomes próprios. Localizar pelo `grid-template-columns`, não pelo nome.

Quando a trilha não é 373px, manter o número via variável no próprio elemento:

| tela | classe local | trilha |
|---|---|---|
| `panel-home` | `.home-layout` | `style="--ar-split-aside: 372px"` |
| `panel-agenda` | grid da tela | `style="--ar-split-aside: 340px"` |
| `panel-profile` | grid da tela | `style="--ar-split-aside: 340px"` |
| `panel-site` | grid da tela | `style="--ar-split-aside: 340px"` |
| `panel-finance` | grid da tela | `style="--ar-split-aside: 320px"` |
| as outras 8 | grid da tela | sem override (373px é o default) |

- [ ] **Step 3: Verificar que nenhum grid partido sobrou**

Run:
```bash
cd frontend/projects/arena/src && grep -rnE "grid-template-columns: *(minmax\(0, *)?1fr\)? +3[0-9]{2}px|grid-template-columns: *3[0-9]{2}px +1fr" app/painel
```
Expected: nenhuma saída.

- [ ] **Step 4: Build e suíte**

Run: `cd frontend && npx ng build arena --configuration production && npx ng test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS nos dois.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src
git commit -m "$(cat <<'EOF'
feat(arena): 13 telas de layout partido empilham abaixo de 900px

Treze telas repetiam o mesmo grid (1fr + trilha de 320 a 373px) sem empilhar
em tela estreita. Uma classe compartilhada resolve as 13; a largura da trilha
vira --ar-split-aside onde difere.

De quebra troca `1fr` por `minmax(0, 1fr)`: `1fr` sozinho nasce com
min-width: auto, e um <select> de opcao longa estoura sem dar scroll -- so
"aperta", que e o modo de falha que nao aparece na leitura do arquivo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Família A — tabelas rolam em vez de cortar

**Files:**
- Modify: `frontend/projects/arena/src/styles.scss`
- Modify (7): `painel/peak-rules/panel-peak-rules.component.ts`, `painel/coupons/panel-coupons.component.ts`, `painel/clubinho/panel-clubs.component.ts`, `painel/finance/panel-fiscal-invoices.component.ts`, `painel/promotions/panel-promotions.component.ts`, `painel/stock/panel-stock.component.ts`, `painel/clubinho/panel-club-detail.component.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: classe global `.ar-table-scroll`.

- [ ] **Step 1: Criar a regra compartilhada**

Em `styles.scss`, ao lado de `.ar-split`:

```scss
/* Tabela larga: quem rola e o container, nunca a pagina. Preserva o dado --
   esconder coluna perde informacao em silencio, que e pior que rolar. */
.ar-table-scroll {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.ar-table-scroll > * {
  min-width: max-content;
}
```

- [ ] **Step 2: Envolver as 7 tabelas**

As 7 seguem o mesmo padrão: um seletor duplo `.table-head, .table-row` compartilha a definição de colunas (ver `panel-peak-rules.component.ts:181`).

**Isso decide onde o wrapper entra.** O `.ar-table-scroll` tem que envolver o cabeçalho **e** as linhas dentro do mesmo container. Envolver só as linhas faz o cabeçalho ficar parado enquanto o corpo rola de lado — as colunas desalinham e a tabela passa a mentir. Se cabeçalho e linhas forem irmãos soltos dentro do card, criar um `<div>` intermediário para os dois.

Antes, em `panel-peak-rules.component.ts` (a pior: 720px travados):
```html
        <div class="table-head">…</div>
        @for (rule of rules(); track rule.id) {
          <div class="table-row">…</div>
        }
```

Depois:
```html
        <div class="ar-table-scroll">
          <div class="ar-table-inner">
            <div class="table-head">…</div>
            @for (rule of rules(); track rule.id) {
              <div class="table-row">…</div>
            }
          </div>
        </div>
```

O `.ar-table-inner` não precisa de regra própria: o `.ar-table-scroll > *` da Step 1 já lhe dá `min-width: max-content`.

- [ ] **Step 3: Confirmar que nenhuma das 7 ficou de fora**

Run:
```bash
cd frontend/projects/arena/src && for f in app/painel/peak-rules/panel-peak-rules.component.ts app/painel/coupons/panel-coupons.component.ts app/painel/clubinho/panel-clubs.component.ts app/painel/finance/panel-fiscal-invoices.component.ts app/painel/promotions/panel-promotions.component.ts app/painel/stock/panel-stock.component.ts app/painel/clubinho/panel-club-detail.component.ts; do printf '%s: %s\n' "$f" "$(grep -c 'ar-table-scroll' "$f")"; done
```
Expected: cada linha termina com `1` ou mais.

- [ ] **Step 4: Build e suíte**

Run: `cd frontend && npx ng build arena --configuration production && npx ng test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src
git commit -m "$(cat <<'EOF'
feat(arena): tabelas largas rolam no proprio container

Sete listas travam de 590 a 720px em colunas de px fixo -- peak-rules trava
720px MAIS um 1.6fr, quase o dobro de um celular de 390px. O container passa
a rolar na horizontal; a pagina, nunca.

Rolar preserva o dado. Esconder coluna perde informacao em silencio, que e
pior -- e foi o modo de falha da tabela de classificacao no portal do atleta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: As 4 telas do celular viram cards

**Files:**
- Modify: `painel/agenda/panel-agenda.component.ts`, `painel/finance/panel-finance.component.ts`, `painel/bookings/panel-bookings.component.ts`, `painel/orders/panel-orders.component.ts`

**Interfaces:**
- Consumes: `ar.below` (Task 1).
- Produces: nada global — cada tela ganha seu recorte `sm`.

São as quatro que o dono e o balcão abrem no telefone. As outras 7 da Família A ficam no scroll da Task 9.

- [ ] **Step 1: Converter cada uma**

Em cada tela, dentro do seletor da linha (não em bloco solto), acrescentar o recorte. Padrão real, com `panel-bookings.component.ts:201`, onde cabeçalho e linha dividem o seletor:

```scss
    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.3fr 1.6fr 110px 140px 110px;
      gap: 12px;
      align-items: center;
      padding: 12px 14px;
    }

    .table-row {
      @include ar.below(sm) {
        grid-template-columns: minmax(0, 1fr);
        gap: 4px;
        padding: 12px var(--ar-pad-page-x);
      }
    }

    /* No celular a linha vira bloco e o cabecalho de coluna perde a funcao --
       cada celula passa a carregar o proprio rotulo. */
    .table-head {
      @include ar.below(sm) {
        display: none;
      }
    }

    .col-label {
      display: none;

      @include ar.below(sm) {
        display: block;
        font-family: var(--nx-font-mono);
        font-size: 9px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--nx-text-dim);
      }
    }
```

Estas quatro telas **não** recebem `.ar-table-scroll`: abaixo de `sm` elas deixam de ser tabela, e acima de `sm` cabem. Aplicar os dois seria scroll horizontal num layout que já empilhou.

E no topo do bloco `styles:` de cada uma das quatro:

```scss
    @use 'breakpoints' as ar;
```

Cada célula ganha um rótulo visível só no celular:

```html
            <div class="cell">
              <span class="col-label">Quadra</span>
              {{ booking.courtName }}
            </div>
```

O `@include` fica **dentro** do seletor de propósito: bloco `@media` solto declarado antes da regra base morre em silêncio, porque `@media` não soma especificidade.

- [ ] **Step 2: Verificar que as quatro têm o @use**

Run:
```bash
cd frontend/projects/arena/src && grep -l "use 'breakpoints'" app/painel/agenda/panel-agenda.component.ts app/painel/finance/panel-finance.component.ts app/painel/bookings/panel-bookings.component.ts app/painel/orders/panel-orders.component.ts | wc -l
```
Expected: `4`

- [ ] **Step 3: Build e suíte**

Run: `cd frontend && npx ng build arena --configuration production && npx ng test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/arena/src
git commit -m "$(cat <<'EOF'
feat(arena): agenda, financeiro, reservas e comandas viram card no celular

As quatro que o dono confere fora da arena e o balcao opera no telefone.
Abaixo de 720px cada linha vira um bloco com rotulo por celula, em vez de uma
tabela de 5 colunas rolando de lado.

O @include vai dentro do seletor: bloco @media solto declarado antes da regra
base morre em silencio, porque @media nao soma especificidade.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: As telas restantes e o fallout dos formulários

**Files:**
- Modify: `painel/team/panel-team.component.ts`, `painel/clubinho/panel-club-session.component.ts`, `painel/recurring/panel-recurring.component.ts`
- Modify: as 23 unidades sem nenhuma `@media` que ainda tiverem overflow (lista gerada no Step 1)

**Interfaces:**
- Consumes: `ar.below`, `--ar-pad-page-x`, `--ar-pad-page-y`.
- Produces: nada.

- [ ] **Step 1: Listar o que ainda não tem faixa nenhuma**

Run:
```bash
cd frontend/projects/arena/src && for f in $(find app/painel -name "*.component.ts"); do grep -q "@media\|ar.below\|ar.shorter-than\|ar-split\|ar-table-scroll" "$f" || echo "$f"; done
```
Expected: uma lista. Tratar cada arquivo: se ele desenha grid ou linha larga, aplicar `.ar-split` / `.ar-table-scroll` / recorte `ar.below(sm)`; se só empilha conteúdo, trocar paddings fixos por `var(--ar-pad-page-x)` / `var(--ar-pad-page-y)` e seguir.

- [ ] **Step 2: Tratar as 3 nomeadas**

- `panel-team` (406px travados): envolver a tabela de membros em `.ar-table-scroll`.
- `panel-club-session` (336px): envolver a lista de participantes em `.ar-table-scroll`.
- `panel-recurring` (320px, e sem nenhuma `@media`): envolver a tabela em `.ar-table-scroll` e trocar o padding de página por `var(--ar-pad-page-x)`.

- [ ] **Step 3: Provar que nenhum campo dispara zoom do iOS**

Run:
```bash
cd frontend && npx ng build arena --configuration production
```

Depois, no navegador com a faixa de toque ativa, confirmar que a regra global pegou: nenhum `input`, `select` ou `textarea` pode computar menos de 16px sob `pointer: coarse`. Isso é verificado no passe medido da Task 12 — aqui só garantimos que o build passa com os campos maiores, porque campo de 16px é mais alto e pode estourar grid de coluna fixa.

- [ ] **Step 4: Build e suíte**

Run: `cd frontend && npx ng build arena --configuration production && npx ng test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src
git commit -m "$(cat <<'EOF'
feat(arena): telas restantes seguem a densidade e param de estourar

Fecha as que sobraram fora das duas familias (equipe, sessao de clubinho,
horarios fixos) e as que nao tinham faixa nenhuma. Paddings fixos viram
var(--ar-pad-page-*).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Passe medido e procedimento repetível

**Files:**
- Create: `scripts/qa/arena-sidebar-harness.mjs`
- Create: `docs/qa/arena-responsivo-passe-medido.md`
- Modify: `.claude/launch.json` (entrada temporária, removida no Step 5)

**Interfaces:**
- Consumes: o CSS real de `panel-shell.component.ts`.
- Produces: harness HTML no diretório de scratch + relatório no `docs/qa/`.

As camadas 1 e 2 provam intenção. Esta prova geometria — é a única que teria pego o bug original.

- [ ] **Step 1: Criar o gerador do harness**

Create `scripts/qa/arena-sidebar-harness.mjs`:

```js
// Gera um harness estatico com o CSS REAL do shell, para medir geometria sem
// subir o Angular nem fazer login. Uso:
//   node scripts/qa/arena-sidebar-harness.mjs <dir-de-saida>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
if (!outDir) {
  console.error('uso: node scripts/qa/arena-sidebar-harness.mjs <dir-de-saida>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const base = 'frontend/projects/arena/src';
const shellSrc = readFileSync(join(base, 'app/painel/ui/panel-shell.component.ts'), 'utf8');
const start = shellSrc.indexOf('styles: `') + 'styles: `'.length;
const css = shellSrc.slice(start, shellSrc.indexOf('`,\n})', start));

const globalSrc = readFileSync(join(base, 'styles.scss'), 'utf8');
const rootStart = globalSrc.indexOf(':root {');
const tokens = globalSrc.slice(rootStart, globalSrc.indexOf('\n}', rootStart) + 2);

writeFileSync(
  join(outDir, 'shell.css'),
  `${tokens}\n* { box-sizing: border-box; }\nhtml, body { margin: 0; background: var(--nx-bg); color: var(--nx-text); }\n${css}`,
);
console.log('harness gerado em', outDir);
```

- [ ] **Step 2: Escrever o procedimento**

Create `docs/qa/arena-responsivo-passe-medido.md` com: como gerar o harness, como servir (entrada temporária `arena-harness` no `.claude/launch.json`, `npx serve <dir> -l 4398`), a matriz de tamanhos e as asserções.

**Matriz** — larguras 320, 375, 414, 768, 1024, 1440 × alturas 633, 665, 760, 820, 945, para os cargos dono (21 itens) e `recepcao` (10).

**Asserções, medidas com `getBoundingClientRect()` e `getComputedStyle()`:**

1. `nav.scrollHeight <= nav.clientHeight` **ou** `overflow-y` rolável — nunca corte mudo.
2. Nenhum item permitido de `NAV_ITEMS` fica inalcançável.
3. `document.documentElement.scrollWidth <= window.innerWidth` em toda largura — a página não rola na horizontal.
4. Sob `pointer: coarse`, todo alvo interativo tem ≥44px de altura e ≥8px de separação, **inclusive nas faixas `short` e `xshort`** — é ali que a ordem do cascade pode trair.
5. Nenhum `input`/`select`/`textarea` computa `font-size` < 16px sob `pointer: coarse`.

- [ ] **Step 3: Rodar o passe**

```bash
node scripts/qa/arena-sidebar-harness.mjs "$TMPDIR/arena-qa"
```

Acrescentar **à mão** ao `.claude/launch.json` (não rodar `JSON.stringify` no arquivo — reformata as 9 entradas existentes):

```json
{ "name": "arena-harness", "runtimeExecutable": "npx", "runtimeArgs": ["--yes", "serve", "<dir>", "-l", "4398"], "port": 4398 }
```

Subir pelo `preview_start` (nunca por Bash), percorrer a matriz e registrar o resultado no `docs/qa/arena-responsivo-passe-medido.md`.

- [ ] **Step 4: Corrigir o que a medição acusar**

Qualquer asserção que falhar volta para a task correspondente. Não seguir para o Step 5 com asserção vermelha.

- [ ] **Step 5: Remover a entrada do launch.json**

Combinado com o dono em 23/09/2026: a entrada `arena-harness` sai ao fim da implementação.

```bash
git diff --stat .claude/launch.json
```
Expected: sem saída — o arquivo volta ao estado original.

- [ ] **Step 6: Commit**

```bash
git add scripts/qa/arena-sidebar-harness.mjs docs/qa/arena-responsivo-passe-medido.md
git commit -m "$(cat <<'EOF'
test(arena): passe medido de geometria responsiva

Harness estatico com o CSS real do shell, medindo no navegador em 6 larguras
x 5 alturas x 2 cargos. E a unica camada que prova geometria -- spec de
funcao pura e spec de componente provam intencao, e foi exatamente isso que
deixou o corte do menu passar por tanto tempo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Cobertura da spec:**

| seção da spec | task |
|---|---|
| Escada de largura / altura | 1 |
| Ordem do cascade + toque + input 16px | 2 |
| Tokens de densidade | 2, 3 |
| Grupos, permissão, rota ativa | 4 |
| Estado persistido | 5 |
| Drawer (lado, foco) | 6 |
| Invariante `overflow-y`, topbar, bottom-nav, safe area, acessibilidade | 7 |
| Família B (13) | 8 |
| Família A (7) | 9 |
| Cards nas 4 do celular | 10 |
| As 5 que sobram + 23 sem `@media` | 11 |
| Testes camadas 1, 2, 3 | 4, 5, 7, 12 |
| Remover `arena-harness` | 12 |

Sem lacuna.

**Consistência de tipos:** `PanelNavItem` (Task 4) tem `group`, usado em `buildNavSections` (4), `isOpen` (7) e `bottomItems` (7). `ArenaNavGroup` é o mesmo tipo em 4, 5 e 7. `ViewportService.isCompact`/`isPhone` (5) são consumidos só em 7 e stubbados como `signal(boolean)` no spec. `DrawerComponent.side` (6) é usado em 7 como `side="left"`.

**Riscos que a execução deve vigiar:**

- O `@for (section of sections(); track section.group)` usa `null` como track do grupo solto; é único porque só o Início não tem grupo.
- A Task 8 mexe em 13 arquivos e a 9 em 7: são as duas com maior chance de conflito se houver outra sessão no mesmo repo.
- Os nomes de classe **variam por tela**. Os exemplos das Tasks 8, 9 e 10 foram conferidos no código (`panel-plans.component.ts:298` usa `.top-row`; `panel-peak-rules.component.ts:181` e `panel-bookings.component.ts:201` usam `.table-head, .table-row`), mas localizar sempre pelo `grid-template-columns`, nunca pelo nome.
- Na Task 9, o wrapper de scroll precisa conter cabeçalho **e** linhas: os dois dividem o seletor de colunas, e envolver só as linhas desalinha a tabela ao rolar.
- A Task 2 muda `--ar-nav-item-h` para 44px sob `pointer: coarse`. Num iPad de 760px de altura com 21 itens isso **aumenta** a altura pedida pelo menu — é justamente por isso que os grupos (Task 7) precisam vir antes do passe medido (Task 12), e não depois.
