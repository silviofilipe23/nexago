# Loja · catálogo: modelo e backend (fatia A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao catálogo da Loja um modelo no Firestore e as callables que escrevem nele, para a tela de Produtos sair do mock e a tela de Editar produto ter onde salvar.

**Architecture:** Três coleções — `storeProducts` (público-seguro), sua subcoleção `skus`, e `storeProductCosts` (privado, custo fora do documento do produto). Leitura vai direto do Firestore com rules de admin; escrita passa só por callable, que é a dona dos rollups, da unicidade e da versão que detecta conflito. A lógica que dá para testar sem banco mora em funções puras num arquivo à parte.

**Tech Stack:** Cloud Functions v2 (`onCall`), firebase-admin Firestore, TypeScript, `node:test` + `node:assert/strict`, `FakeFirestore` (helper de teste do repo), emulador do Firestore para as rules.

**Spec:** `docs/superpowers/specs/2026-10-15-loja-catalogo-backend-design.md`

## Global Constraints

- Todo caminho é relativo à raiz do repositório. Comandos de `functions/` rodam de dentro de `functions/`.
- Testes: `cd functions && npm test` (compila e roda `lib/*.test.js` — um `src/*.test.ts` novo entra sozinho).
- Tipos: `cd functions && npm run lint` (`tsc --noEmit`).
- Rules: `cd functions && npm run test:rules` (emulador, `test/*.rules.test.mjs`).
- Callables do backoffice: `{region: CLIENT_FACING_REGIONS, invoker: "public"}`. Gen2 precisa de invoker público para o preflight do browser; a autenticação fica no handler.
- Guard de acesso: `callerCanAccessBackoffice` de `./auth-roles`. **Não escrever helper novo** — apesar do nome, `callerIsOrganizer` checa o papel `admin`, então esse helper já é admin-only e casa com o `isAdmin()` das rules.
- Dinheiro e peso em inteiros: `priceCents`, `costCents`, `weightGrams`. Nunca ponto flutuante.
- `costCents` ausente é "não informado"; **zero é custo informado** — testar `!= null`, nunca falsy.
- Ao escrever a regex de remoção de acento, digitar os escapes `̀-ͯ`. Nunca colar caracteres combinantes literais.
- Estilo do repo: aspas duplas, 2 espaços, `import {x} from "./y"` sem espaço nas chaves.
- Commits em português, terminando com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Transação do Firestore exige TODAS as leituras antes de QUALQUER escrita.** O `FakeFirestore` não
  impõe essa ordem, então código que a viola passa no teste e estoura em produção. Em toda
  `runTransaction` deste plano os `tx.get` vêm primeiro, num bloco, e só depois os `tx.set`/`tx.delete`.
- **Nada de deploy.** Este plano escreve código; publicar funções e rules é decisão do dono, depois.

## Review Focus

1. **Nome que não vira slug** — "###" ou só emoji geraria slug vazio e um documento-chave `slug:`. Precisa de fallback. Teste na Task 1.
2. **Dois produtos com o mesmo nome** — o segundo slug tem que desempatar (`-2`), não estourar a unicidade. Teste na Task 3.
3. **`costCents: 0`** — custo informado, não ausente; gravar zero e não confundir com "não informado". Teste na Task 3.
4. **Estoque negativo ou local desconhecido** em `stockByLocation` — tem que ser recusado, não virar rollup negativo. Teste na Task 4.
5. **Remover um valor de eixo cujo SKU tem estoque** — o SKU some e leva o estoque junto, em silêncio. A callable devolve o que seria perdido. Teste na Task 4.

---

## Arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `functions/src/store-catalog.ts` *(criar)* | tipos e funções puras: slug, código de SKU, rollups, validação, selo | 1 |
| `functions/src/store-catalog.test.ts` *(criar)* | testes das funções puras | 1 |
| `firestore.rules` *(modificar)* | leitura admin, escrita negada | 2 |
| `functions/test/store-catalog.rules.test.mjs` *(criar)* | rules no emulador | 2 |
| `functions/src/store-catalog-write.ts` *(criar)* | `saveStoreProduct`, `saveStoreProductVariations`, `archiveStoreProduct`, `duplicateStoreProduct` | 3–5 |
| `functions/src/store-catalog-write.test.ts` *(criar)* | handlers com `FakeFirestore` | 3–5 |
| `functions/src/index.ts` *(modificar)* | exportar as callables | 3–5 |
| `functions/scripts/seed-store-catalog.js` *(criar)* | semear os 8 produtos | 6 |

**Sem `firestore.indexes.json` nesta fatia.** A fatia A não entrega nenhuma consulta; a lista de Produtos é da fatia B, e o índice que ela precisar sai com ela. Criar índice especulativo custa deploy e não serve ninguém.

---

### Task 1: Funções puras do catálogo

**Files:**
- Create: `functions/src/store-catalog.ts`
- Test: `functions/src/store-catalog.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `ProductStatus`, `Axis`, `AxisValue`, `SkuDoc`, `ProductForValidation`, `slugify()`, `skuIdFromAxisValues()`, `skuCodeFrom()`, `sumStock()`, `rollupsOf()`, `publishValidationErrors()`, `badgeIsVisible()`, `MAX_SKUS_PER_PRODUCT`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `functions/src/store-catalog.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SKUS_PER_PRODUCT,
  badgeIsVisible,
  publishValidationErrors,
  rollupsOf,
  skuCodeFrom,
  skuIdFromAxisValues,
  slugify,
  sumStock,
  type Axis,
  type ProductForValidation,
  type SkuDoc,
} from "./store-catalog";

const AXES: Axis[] = [
  {id: "cor", label: "Cor", values: [
    {id: "branco", label: "Branco areia", hex: "#F2EDE4"},
    {id: "laranja", label: "Laranja", hex: "#FF6A1A"},
  ]},
  {id: "tam", label: "Tamanho", values: [
    {id: "p", label: "P"},
    {id: "m", label: "M"},
  ]},
];

function sku(over: Partial<SkuDoc> = {}): SkuDoc {
  return {
    id: "branco_p",
    code: "NX-CAM-BRANCO-P",
    barcode: null,
    axisValues: {cor: "branco", tam: "p"},
    priceCents: null,
    stockByLocation: {cd: 6},
    stock: 6,
    ...over,
  };
}

function product(over: Partial<ProductForValidation> = {}): ProductForValidation {
  return {
    name: "Camiseta Dry UV50 Areia",
    category: "vestuario",
    priceCents: 12990,
    compareAtPriceCents: null,
    channels: {app: true, web: true},
    fulfillment: {pickup: true, delivery: true},
    shipping: {weightGrams: 180, lengthCm: 30, widthCm: 22, heightCm: 3},
    ...over,
  };
}

describe("slugify", () => {
  it("tira acento, caixa e pontuação", () => {
    assert.equal(slugify("Óculos Polarizado Sunline"), "oculos-polarizado-sunline");
    assert.equal(slugify("Rede Oficial Beach 8,5 m"), "rede-oficial-beach-8-5-m");
  });

  it("não deixa traço sobrando nas pontas nem repetido", () => {
    assert.equal(slugify("  Kit --- Demarcação  "), "kit-demarcacao");
  });

  it("nome sem nenhuma letra cai num fallback, em vez de slug vazio", () => {
    assert.equal(slugify("###"), "produto");
    assert.equal(slugify(""), "produto");
  });
});

describe("identidade do SKU", () => {
  it("o id vem dos valores de eixo, na ordem dos eixos", () => {
    assert.equal(skuIdFromAxisValues({tam: "p", cor: "branco"}, AXES), "branco_p");
  });

  it("o código junta a raiz com os valores em caixa alta", () => {
    assert.equal(skuCodeFrom("NX-CAM", {cor: "branco", tam: "p"}, AXES), "NX-CAM-BRANCO-P");
  });

  it("produto sem eixo tem um SKU só, com o código igual à raiz", () => {
    assert.equal(skuIdFromAxisValues({}, []), "unico");
    assert.equal(skuCodeFrom("NX-RED", {}, []), "NX-RED");
  });
});

describe("rollups", () => {
  it("soma o estoque de todos os locais", () => {
    assert.equal(sumStock({cd: 6, arena1: 4}), 10);
    assert.equal(sumStock({}), 0);
  });

  it("conta SKUs, soma estoque e acha o menor preço", () => {
    const skus = [
      sku({stock: 6}),
      sku({id: "branco_m", code: "NX-CAM-BRANCO-M", stock: 2, priceCents: 14990}),
      sku({id: "laranja_p", code: "NX-CAM-LARANJA-P", stock: 4}),
    ];
    assert.deepEqual(rollupsOf(skus, 12990), {skuCount: 3, stockTotal: 12, priceFromCents: 12990});
  });

  it("preço de variação mais barato puxa o 'a partir de'", () => {
    const skus = [sku({priceCents: 9990}), sku({id: "b", code: "NX-CAM-B", priceCents: null})];
    assert.equal(rollupsOf(skus, 12990).priceFromCents, 9990);
  });
});

describe("publishValidationErrors", () => {
  it("produto completo não tem erro", () => {
    assert.deepEqual(publishValidationErrors(product()), []);
  });

  it("cobra nome, categoria e preço", () => {
    const errors = publishValidationErrors(product({name: "ab", category: "", priceCents: 0}));
    assert.deepEqual(errors.sort(), ["category", "name", "priceCents"]);
  });

  it("cobra ao menos um canal", () => {
    assert.deepEqual(publishValidationErrors(product({channels: {app: false, web: false}})), ["channels"]);
  });

  it("cobra ao menos uma forma de entrega", () => {
    assert.deepEqual(
      publishValidationErrors(product({fulfillment: {pickup: false, delivery: false}})),
      ["fulfillment"],
    );
  });

  it("com entrega ligada, cobra peso e dimensões", () => {
    assert.deepEqual(publishValidationErrors(product({shipping: null})), ["shipping"]);
  });

  it("sem entrega, não cobra peso nem dimensões", () => {
    const p = product({fulfillment: {pickup: true, delivery: false}, shipping: null});
    assert.deepEqual(publishValidationErrors(p), []);
  });

  it("preço 'de' tem que ser maior que o de venda", () => {
    assert.deepEqual(publishValidationErrors(product({compareAtPriceCents: 9990})), ["compareAtPriceCents"]);
  });

  it("não cobra foto: isso é da fatia D", () => {
    assert.deepEqual(publishValidationErrors(product()), []);
  });
});

describe("badgeIsVisible", () => {
  const publishedAt = new Date("2026-10-01T12:00:00Z");

  it("'nova' vale nos primeiros 30 dias", () => {
    assert.equal(badgeIsVisible("nova", publishedAt, new Date("2026-10-20T12:00:00Z")), true);
  });

  it("'nova' expira depois de 30 dias, sem job nenhum", () => {
    assert.equal(badgeIsVisible("nova", publishedAt, new Date("2026-11-05T12:00:00Z")), false);
  });

  it("os outros selos não expiram", () => {
    assert.equal(badgeIsVisible("mais-vendida", publishedAt, new Date("2027-01-01T12:00:00Z")), true);
  });

  it("sem selo, nada a mostrar", () => {
    assert.equal(badgeIsVisible(null, publishedAt, new Date()), false);
  });

  it("'nova' sem data de publicação não aparece", () => {
    assert.equal(badgeIsVisible("nova", null, new Date()), false);
  });
});

describe("MAX_SKUS_PER_PRODUCT", () => {
  it("é 100, o teto que mantém a transação dentro das 500 operações", () => {
    assert.equal(MAX_SKUS_PER_PRODUCT, 100);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm test`
Esperado: FAIL na compilação — `Cannot find module './store-catalog'`.

- [ ] **Step 3: Escrever as funções**

Criar `functions/src/store-catalog.ts`:

```ts
/**
 * Catálogo da Loja: tipos e as regras que dá para decidir sem banco.
 *
 * Separado das callables de propósito — rollup, unicidade e validação são o
 * miolo das decisões e merecem teste direto, sem Firestore no caminho.
 */

export type ProductStatus = "rascunho" | "ativo" | "arquivado";
export type ProductBadge = "nova" | "mais-vendida" | "edicao-limitada";

/** Teto por produto: a troca completa de variações toca ~400 operações, e o limite é 500. */
export const MAX_SKUS_PER_PRODUCT = 100;

/** Quantos dias o selo "nova" aparece depois da publicação. */
const NEW_BADGE_DAYS = 30;

export interface AxisValue {
  id: string;
  label: string;
  hex?: string;
}

export interface Axis {
  id: string;
  label: string;
  values: AxisValue[];
}

export interface SkuDoc {
  id: string;
  code: string;
  barcode: string | null;
  axisValues: Record<string, string>;
  priceCents: number | null;
  stockByLocation: Record<string, number>;
  stock: number;
}

export interface ProductForValidation {
  name: string;
  category: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  channels: {app: boolean; web: boolean};
  fulfillment: {pickup: boolean; delivery: boolean};
  shipping: {weightGrams: number; lengthCm: number; widthCm: number; heightCm: number} | null;
}

/** Minúscula, sem acento, só letras/números/hífen. Nome sem letra nenhuma vira "produto". */
export function slugify(name: string): string {
  const out = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || "produto";
}

function orderedValues(axisValues: Record<string, string>, axes: Axis[]): string[] {
  // A ordem vem dos eixos, nunca das chaves do objeto: id de documento precisa ser estável.
  return axes.map((axis) => axisValues[axis.id] ?? "").filter((v) => v !== "");
}

/** Id do documento do SKU. Vem dos valores de eixo, não do código: renomear código não move o doc. */
export function skuIdFromAxisValues(axisValues: Record<string, string>, axes: Axis[]): string {
  const parts = orderedValues(axisValues, axes);
  return parts.length === 0 ? "unico" : parts.join("_");
}

/** `NX-CAM` + branco/p → `NX-CAM-BRANCO-P`. Sem eixo, o código é a própria raiz. */
export function skuCodeFrom(
  baseSku: string,
  axisValues: Record<string, string>,
  axes: Axis[],
): string {
  const parts = orderedValues(axisValues, axes).map((v) => slugify(v).toUpperCase());
  return [baseSku, ...parts].join("-");
}

export function sumStock(stockByLocation: Record<string, number>): number {
  return Object.values(stockByLocation).reduce((total, n) => total + n, 0);
}

export function rollupsOf(
  skus: SkuDoc[],
  priceCents: number,
): {skuCount: number; stockTotal: number; priceFromCents: number} {
  const prices = skus.map((s) => s.priceCents).filter((p): p is number => p !== null);
  return {
    skuCount: skus.length,
    stockTotal: skus.reduce((total, s) => total + s.stock, 0),
    priceFromCents: Math.min(priceCents, ...prices),
  };
}

/**
 * O que falta para publicar. Rascunho salva sem nada disso.
 *
 * Foto NÃO entra: `photos` só é preenchido na fatia D, e cobrar aqui deixaria
 * o catálogo inteiro impublicável.
 */
export function publishValidationErrors(product: ProductForValidation): string[] {
  const errors: string[] = [];
  if (product.name.trim().length < 3 || product.name.trim().length > 80) {
    errors.push("name");
  }
  if (!product.category) {
    errors.push("category");
  }
  if (!(product.priceCents > 0)) {
    errors.push("priceCents");
  }
  if (product.compareAtPriceCents !== null && product.compareAtPriceCents <= product.priceCents) {
    errors.push("compareAtPriceCents");
  }
  if (!product.channels.app && !product.channels.web) {
    errors.push("channels");
  }
  if (!product.fulfillment.pickup && !product.fulfillment.delivery) {
    errors.push("fulfillment");
  }
  if (product.fulfillment.delivery && product.shipping === null) {
    errors.push("shipping");
  }
  return errors.sort();
}

/** O selo "nova" expira na leitura: comparar data custa nada e não deixa janela em que ele mente. */
export function badgeIsVisible(
  badge: ProductBadge | null,
  publishedAt: Date | null,
  now: Date,
): boolean {
  if (badge === null) {
    return false;
  }
  if (badge !== "nova") {
    return true;
  }
  if (publishedAt === null) {
    return false;
  }
  const days = (now.getTime() - publishedAt.getTime()) / 86_400_000;
  return days < NEW_BADGE_DAYS;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm test`
Esperado: PASS, sem falha nova em nenhum outro arquivo.

- [ ] **Step 5: Conferir os tipos**

Run: `cd functions && npm run lint`
Esperado: sem saída (sucesso).

- [ ] **Step 6: Commit**

```bash
git add functions/src/store-catalog.ts functions/src/store-catalog.test.ts
git commit -m "feat(loja): funcoes puras do catalogo (slug, SKU, rollups, validacao)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Rules do catálogo

**Files:**
- Modify: `firestore.rules`
- Test: `functions/test/store-catalog.rules.test.mjs` (criar)

**Interfaces:**
- Consumes: `isAdmin()` e `isSuperAdmin()`, já definidos no topo do `firestore.rules`.
- Produces: as coleções `storeProducts`, `storeProducts/{id}/skus`, `storeProductCosts`, `storeCatalogKeys`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/test/store-catalog.rules.test.mjs`. O modelo mais próximo é
`functions/test/arena-product-costs.rules.test.mjs`, que testa exatamente o mesmo formato (documento
público + custo em coleção irmã privada):

```js
// Catálogo da Loja: leitura só para admin da plataforma, escrita só por callable.
// Rodar: firebase emulators:exec --only firestore --project nexago-rules-test \
//   "node --test functions/test/store-catalog.rules.test.mjs"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-store-catalog-test';
const ADMIN = 'admin-uid';
const ORGANIZER = 'organizer-uid';
const ATHLETE = 'athlete-uid';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

const asAdmin = () => testEnv.authenticatedContext(ADMIN, { roles: ['admin'] }).firestore();
const asOrganizer = () => testEnv.authenticatedContext(ORGANIZER, { roles: ['organizer'] }).firestore();
const asAthlete = () => testEnv.authenticatedContext(ATHLETE, { roles: ['athlete'] }).firestore();

before(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'storeProducts', 'p1'), {
      name: 'Camiseta Dry UV50 Areia',
      slug: 'camiseta-dry-uv50-areia',
      priceCents: 12990,
      status: 'ativo',
      version: 1,
    });
    await setDoc(doc(db, 'storeProducts', 'p1', 'skus', 'branco_p'), {
      code: 'NX-CAM-BRANCO-P',
      stock: 6,
    });
    await setDoc(doc(db, 'storeProductCosts', 'p1'), { costCents: 4820, updatedAt: new Date() });
    await setDoc(doc(db, 'storeCatalogKeys', 'slug:camiseta-dry-uv50-areia'), { productId: 'p1' });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('admin lê produto, SKU e custo', async () => {
  const db = asAdmin();
  await assertSucceeds(getDoc(doc(db, 'storeProducts', 'p1')));
  await assertSucceeds(getDoc(doc(db, 'storeProducts', 'p1', 'skus', 'branco_p')));
  await assertSucceeds(getDoc(doc(db, 'storeProductCosts', 'p1')));
});

test('organizador de torneio não lê nada do catálogo', async () => {
  const db = asOrganizer();
  await assertFails(getDoc(doc(db, 'storeProducts', 'p1')));
  await assertFails(getDoc(doc(db, 'storeProductCosts', 'p1')));
});

test('atleta logado não lê o custo', async () => {
  await assertFails(getDoc(doc(asAthlete(), 'storeProductCosts', 'p1')));
});

test('nem o admin escreve direto: escrita é só por callable', async () => {
  const db = asAdmin();
  await assertFails(setDoc(doc(db, 'storeProducts', 'p1'), { name: 'x' }));
  await assertFails(setDoc(doc(db, 'storeProducts', 'p1', 'skus', 'branco_p'), { stock: 1 }));
  await assertFails(setDoc(doc(db, 'storeProductCosts', 'p1'), { costCents: 1 }));
});

test('ninguém enxerga a coleção de chaves de unicidade', async () => {
  await assertFails(getDoc(doc(asAdmin(), 'storeCatalogKeys', 'slug:camiseta-dry-uv50-areia')));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run test:rules`
Esperado: FAIL — sem o bloco nas rules, a leitura do admin é negada e os casos de sucesso quebram.

- [ ] **Step 3: Escrever as rules**

Em `firestore.rules`, acrescentar antes do `match` final de fallback:

```
    // Catálogo da Loja (produtos da marca nexaGO). Escrita só por callable:
    // rollup, unicidade de SKU e versão de conflito são decisões de servidor.
    match /storeProducts/{productId} {
      allow read: if isAdmin() || isSuperAdmin();
      allow write: if false;

      match /skus/{skuId} {
        allow read: if isAdmin() || isSuperAdmin();
        allow write: if false;
      }
    }

    // Custo fica fora do doc do produto: rule não esconde campo, e o produto
    // vai ser legível pela vitrine um dia.
    match /storeProductCosts/{productId} {
      allow read: if isAdmin() || isSuperAdmin();
      allow write: if false;
    }

    // Documentos-chave de unicidade. Só o Admin SDK toca.
    match /storeCatalogKeys/{key} {
      allow read, write: if false;
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run test:rules`
Esperado: PASS nos 5 casos novos, e os testes de rules que já existiam continuam passando.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules functions/test/store-catalog.rules.test.mjs
git commit -m "feat(loja): rules do catalogo — leitura admin, escrita so por callable

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `saveStoreProduct`

**Files:**
- Create: `functions/src/store-catalog-write.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/src/store-catalog-write.test.ts` (criar)

**Interfaces:**
- Consumes: `slugify`, `publishValidationErrors`, `ProductStatus` (Task 1); `callerCanAccessBackoffice` de `./auth-roles`; `CLIENT_FACING_REGIONS` de `./function-regions`.
- Produces: `saveStoreProductCore(db, input, actor, now)` — o miolo testável, sem `onCall` em volta — e a callable `saveStoreProduct`. A Task 4 reusa `assertCatalogAdmin`, `assertKeyFree`, `writeKey`, `freeSlug` e `conflict`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `functions/src/store-catalog-write.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {saveStoreProductCore, type SaveProductInput} from "./store-catalog-write";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Ana Souza"};
const NOW = new Date("2026-10-15T18:00:00Z");

function input(over: Partial<SaveProductInput> = {}): SaveProductInput {
  return {
    name: "Camiseta Dry UV50 Areia",
    baseSku: "NX-CAM",
    category: "vestuario",
    collection: "verao-2026",
    brand: "NexaGO",
    description: "Camiseta em poliamida dry.",
    technicalDetails: [],
    badge: null,
    priceCents: 12990,
    compareAtPriceCents: null,
    costCents: 4820,
    channels: {app: true, web: true},
    fulfillment: {pickup: true, delivery: true},
    featured: false,
    shipping: {weightGrams: 180, lengthCm: 30, widthCm: 22, heightCm: 3},
    lowStockThreshold: 3,
    status: "ativo",
    active: true,
    ...over,
  };
}

describe("saveStoreProductCore — criação", () => {
  it("grava o produto, reserva o slug e nasce na versão 1", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);

    const doc = fake.store.get(`storeProducts/${productId}`)!;
    assert.equal(doc["name"], "Camiseta Dry UV50 Areia");
    assert.equal(doc["slug"], "camiseta-dry-uv50-areia");
    assert.equal(doc["version"], 1);
    assert.deepEqual(doc["updatedBy"], ACTOR);
    assert.equal(doc["publishedAt"] instanceof Date, true);
    assert.ok(fake.store.has("storeCatalogKeys/slug:camiseta-dry-uv50-areia"));
  });

  it("o custo vai para a coleção privada, nunca para o produto", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);

    assert.equal(fake.store.get(`storeProducts/${productId}`)!["costCents"], undefined);
    assert.equal(fake.store.get(`storeProductCosts/${productId}`)!["costCents"], 4820);
  });

  it("custo zero é custo informado, e vai gravado", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input({costCents: 0}), ACTOR, NOW);
    assert.equal(fake.store.get(`storeProductCosts/${productId}`)!["costCents"], 0);
  });

  it("custo nulo não cria o documento de custo", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input({costCents: null}), ACTOR, NOW);
    assert.equal(fake.store.has(`storeProductCosts/${productId}`), false);
  });

  it("nome repetido ganha slug com desempate, em vez de estourar", async () => {
    const {fake, db} = makeDb();
    await saveStoreProductCore(db, input(), ACTOR, NOW);
    const second = await saveStoreProductCore(db, input(), ACTOR, NOW);

    assert.equal(fake.store.get(`storeProducts/${second.productId}`)!["slug"], "camiseta-dry-uv50-areia-2");
    assert.ok(fake.store.has("storeCatalogKeys/slug:camiseta-dry-uv50-areia-2"));
  });

  it("rascunho salva mesmo sem canal, entrega nem preço", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(
      db,
      input({status: "rascunho", priceCents: 0, channels: {app: false, web: false}}),
      ACTOR,
      NOW,
    );
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["status"], "rascunho");
  });

  it("publicar sem canal é recusado, dizendo qual campo", async () => {
    const {db} = makeDb();
    await assert.rejects(
      () => saveStoreProductCore(db, input({channels: {app: false, web: false}}), ACTOR, NOW),
      (err: Error & {details?: {fields?: string[]}}) => {
        assert.deepEqual(err.details?.fields, ["channels"]);
        return true;
      },
    );
  });

  it("rascunho não ganha publishedAt", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input({status: "rascunho"}), ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["publishedAt"], null);
  });
});

describe("saveStoreProductCore — atualização", () => {
  async function seeded() {
    const made = makeDb();
    const {productId} = await saveStoreProductCore(made.db, input(), ACTOR, NOW);
    return {...made, productId};
  }

  it("incrementa a versão a cada escrita", async () => {
    const {fake, db, productId} = await seeded();
    await saveStoreProductCore(db, input({productId, version: 1, name: "Camiseta Dry UV50"}), ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["version"], 2);
  });

  it("versão velha é recusada, dizendo quem salvou antes", async () => {
    const {db, productId} = await seeded();
    await assert.rejects(
      () => saveStoreProductCore(db, input({productId, version: 99}), ACTOR, NOW),
      (err: Error & {code?: string; details?: {updatedBy?: {name: string}}}) => {
        assert.equal(err.code, "failed-precondition");
        assert.equal(err.details?.updatedBy?.name, "Ana Souza");
        return true;
      },
    );
  });

  it("manter o nome mantém o slug, sem gerar desempate contra si mesmo", async () => {
    const {fake, db, productId} = await seeded();
    await saveStoreProductCore(db, input({productId, version: 1}), ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["slug"], "camiseta-dry-uv50-areia");
  });

  it("trocar o nome libera a chave do slug antigo", async () => {
    const {fake, db, productId} = await seeded();
    await saveStoreProductCore(db, input({productId, version: 1, name: "Camiseta Areia Pro"}), ACTOR, NOW);
    assert.equal(fake.store.has("storeCatalogKeys/slug:camiseta-dry-uv50-areia"), false);
    assert.ok(fake.store.has("storeCatalogKeys/slug:camiseta-areia-pro"));
  });

  it("publicar pela primeira vez carimba publishedAt; republicar não remexe", async () => {
    const {fake, db} = makeDb();
    const first = await saveStoreProductCore(db, input({status: "rascunho"}), ACTOR, NOW);
    await saveStoreProductCore(db, input({productId: first.productId, version: 1}), ACTOR, NOW);
    const stamped = fake.store.get(`storeProducts/${first.productId}`)!["publishedAt"];

    const later = new Date("2026-11-20T18:00:00Z");
    await saveStoreProductCore(db, input({productId: first.productId, version: 2}), ACTOR, later);
    assert.deepEqual(fake.store.get(`storeProducts/${first.productId}`)!["publishedAt"], stamped);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm test`
Esperado: FAIL na compilação — `Cannot find module './store-catalog-write'`.

- [ ] **Step 3: Escrever o miolo e a callable**

Criar `functions/src/store-catalog-write.ts`:

```ts
/**
 * Escrita do catálogo da Loja.
 *
 * Toda escrita passa por aqui: rollup consistente, unicidade de slug e de
 * código de SKU, e a versão que detecta conflito são decisões de servidor.
 * As rules do catálogo negam escrita a qualquer cliente.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, type Firestore, type Transaction} from "firebase-admin/firestore";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  publishValidationErrors,
  slugify,
  type ProductBadge,
  type ProductStatus,
} from "./store-catalog";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

const PRODUCTS = "storeProducts";
const COSTS = "storeProductCosts";
const KEYS = "storeCatalogKeys";

export interface Actor {
  uid: string;
  name: string;
}

export interface SaveProductInput {
  productId?: string;
  version?: number;
  name: string;
  baseSku: string;
  category: string;
  collection: string | null;
  brand: string;
  description: string;
  technicalDetails: {label: string; value: string}[];
  badge: ProductBadge | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  /** Ausente/null = não informado. Zero é custo informado. */
  costCents: number | null;
  channels: {app: boolean; web: boolean};
  fulfillment: {pickup: boolean; delivery: boolean};
  featured: boolean;
  shipping: {weightGrams: number; lengthCm: number; widthCm: number; heightCm: number} | null;
  lowStockThreshold: number;
  status: ProductStatus;
  active: boolean;
}

/** `failed-precondition` com quem salvou antes: é o que o banner de conflito mostra. */
function conflict(existing: FirebaseFirestore.DocumentData): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "Este produto foi alterado por outra pessoa. Recarregue antes de salvar.",
    {updatedBy: existing["updatedBy"], updatedAt: existing["updatedAt"]},
  );
}

/**
 * Confere se a chave de unicidade está livre para este produto. **Só lê** — a
 * escrita vem depois, no bloco de escritas, porque a transação do Firestore
 * recusa uma leitura feita após qualquer escrita.
 */
async function assertKeyFree(
  tx: Transaction,
  db: Firestore,
  key: string,
  productId: string,
): Promise<void> {
  const snap = await tx.get(db.collection(KEYS).doc(key));
  if (snap.exists && snap.data()?.["productId"] !== productId) {
    throw new HttpsError("invalid-argument", `Já existe outro produto com ${key}.`, {key});
  }
}

function writeKey(
  tx: Transaction,
  db: Firestore,
  key: string,
  owner: {productId: string; skuId?: string},
): void {
  tx.set(db.collection(KEYS).doc(key), owner);
}

/** Acha um slug livre: o nome repetido vira `-2`, `-3`… em vez de recusar o produto. */
async function freeSlug(
  tx: Transaction,
  db: Firestore,
  base: string,
  productId: string,
): Promise<string> {
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const snap = await tx.get(db.collection(KEYS).doc(`slug:${candidate}`));
    if (!snap.exists || snap.data()?.["productId"] === productId) {
      return candidate;
    }
  }
  throw new HttpsError("invalid-argument", "Escolha outro nome: este já tem cópias demais.");
}

export async function saveStoreProductCore(
  db: Firestore,
  input: SaveProductInput,
  actor: Actor,
  now: Date,
): Promise<{productId: string; version: number; slug: string}> {
  if (input.status === "ativo") {
    const fields = publishValidationErrors(input);
    if (fields.length > 0) {
      throw new HttpsError("invalid-argument", "Faltam campos para publicar.", {fields});
    }
  }

  const productId = input.productId ?? db.collection(PRODUCTS).doc().id;
  const ref = db.collection(PRODUCTS).doc(productId);

  return db.runTransaction(async (tx) => {
    // ---------- leituras ----------
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data()! : null;

    if (existing && existing["version"] !== input.version) {
      throw conflict(existing);
    }

    const slug = await freeSlug(tx, db, slugify(input.name), productId);

    // ---------- escritas ----------
    const previousSlug = existing?.["slug"] as string | undefined;
    if (previousSlug && previousSlug !== slug) {
      tx.delete(db.collection(KEYS).doc(`slug:${previousSlug}`));
    }
    writeKey(tx, db, `slug:${slug}`, {productId});

    const version = (existing?.["version"] ?? 0) + 1;
    const publishedAt =
      (existing?.["publishedAt"] as Date | null | undefined) ??
      (input.status === "ativo" ? now : null);

    tx.set(
      ref,
      {
        name: input.name.trim(),
        slug,
        baseSku: input.baseSku,
        category: input.category,
        collection: input.collection,
        brand: input.brand,
        description: input.description,
        technicalDetails: input.technicalDetails,
        badge: input.badge,
        priceCents: input.priceCents,
        compareAtPriceCents: input.compareAtPriceCents,
        channels: input.channels,
        fulfillment: input.fulfillment,
        featured: input.featured,
        shipping: input.shipping,
        lowStockThreshold: input.lowStockThreshold,
        status: input.status,
        active: input.active,
        photos: existing?.["photos"] ?? [],
        soldLast30: existing?.["soldLast30"] ?? 0,
        skuCount: existing?.["skuCount"] ?? 0,
        stockTotal: existing?.["stockTotal"] ?? 0,
        priceFromCents: existing?.["priceFromCents"] ?? input.priceCents,
        publishedAt,
        version,
        createdAt: existing?.["createdAt"] ?? now,
        updatedAt: now,
        updatedBy: actor,
      },
      {merge: false},
    );

    // Custo fora do produto: `null` é "não informado", zero é custo informado.
    if (input.costCents !== null) {
      tx.set(db.collection(COSTS).doc(productId), {costCents: input.costCents, updatedAt: now});
    }

    return {productId, version, slug};
  });
}

export async function assertCatalogAdmin(uid: string): Promise<Actor> {
  let caller;
  try {
    caller = await getAuth().getUser(uid);
  } catch (err: unknown) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
    }
    throw err;
  }
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError(
      "permission-denied",
      "Apenas administradores da plataforma podem editar o catálogo da loja.",
    );
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

export const saveStoreProduct = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertCatalogAdmin(uid);
  const input = (request.data ?? {}) as SaveProductInput;
  return saveStoreProductCore(getFirestore(), input, actor, new Date());
});
```

- [ ] **Step 4: Exportar no index**

Em `functions/src/index.ts`, junto dos outros re-exports do backoffice:

```ts
export {saveStoreProduct} from "./store-catalog-write";
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd functions && npm test`
Esperado: PASS, incluindo os 13 casos novos.

Run: `cd functions && npm run lint`
Esperado: sem saída.

- [ ] **Step 6: Commit**

```bash
git add functions/src/store-catalog-write.ts functions/src/store-catalog-write.test.ts functions/src/index.ts
git commit -m "feat(loja): callable saveStoreProduct com custo privado e versao de conflito

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `saveStoreProductVariations`

**Files:**
- Modify: `functions/src/store-catalog-write.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/src/store-catalog-write.test.ts`

**Interfaces:**
- Consumes: `saveStoreProductCore`, `assertCatalogAdmin`, `assertKeyFree`, `writeKey`, `conflict` (Task 3); `skuIdFromAxisValues`, `skuCodeFrom`, `sumStock`, `rollupsOf`, `MAX_SKUS_PER_PRODUCT` (Task 1).
- Produces: `saveVariationsCore(db, input, actor, now)` e a callable `saveStoreProductVariations`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao `store-catalog-write.test.ts` (e ao import, `saveVariationsCore` e `type SaveVariationsInput`):

```ts
describe("saveVariationsCore", () => {
  const AXES = [
    {id: "cor", label: "Cor", values: [
      {id: "branco", label: "Branco areia", hex: "#F2EDE4"},
      {id: "laranja", label: "Laranja", hex: "#FF6A1A"},
    ]},
    {id: "tam", label: "Tamanho", values: [{id: "p", label: "P"}, {id: "m", label: "M"}]},
  ];

  function variations(over: Partial<SaveVariationsInput> = {}): SaveVariationsInput {
    return {
      productId: "p1",
      version: 1,
      axes: AXES,
      skus: [
        {axisValues: {cor: "branco", tam: "p"}, stockByLocation: {cd: 6}, priceCents: null, barcode: null},
        {axisValues: {cor: "branco", tam: "m"}, stockByLocation: {cd: 2}, priceCents: null, barcode: null},
        {axisValues: {cor: "laranja", tam: "p"}, stockByLocation: {cd: 4}, priceCents: null, barcode: null},
      ],
      ...over,
    };
  }

  async function seeded() {
    const made = makeDb();
    const {productId} = await saveStoreProductCore(made.db, input(), ACTOR, NOW);
    return {...made, productId};
  }

  it("grava um documento por SKU, com id e código vindos dos eixos", async () => {
    const {fake, db, productId} = await seeded();
    await saveVariationsCore(db, variations({productId}), ACTOR, NOW);

    const sku = fake.store.get(`storeProducts/${productId}/skus/branco_p`)!;
    assert.equal(sku["code"], "NX-CAM-BRANCO-P");
    assert.equal(sku["stock"], 6);
    assert.ok(fake.store.has(`storeProducts/${productId}/skus/laranja_p`));
  });

  it("os rollups do pai batem com a soma dos SKUs", async () => {
    const {fake, db, productId} = await seeded();
    await saveVariationsCore(db, variations({productId}), ACTOR, NOW);

    const product = fake.store.get(`storeProducts/${productId}`)!;
    assert.equal(product["skuCount"], 3);
    assert.equal(product["stockTotal"], 12);
    assert.equal(product["priceFromCents"], 12990);
  });

  it("estoque de vários locais soma no SKU e no rollup", async () => {
    const {fake, db, productId} = await seeded();
    await saveVariationsCore(db, variations({
      productId,
      skus: [{axisValues: {cor: "branco", tam: "p"}, stockByLocation: {cd: 6, arena1: 4}, priceCents: null, barcode: null}],
    }), ACTOR, NOW);

    assert.equal(fake.store.get(`storeProducts/${productId}/skus/branco_p`)!["stock"], 10);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["stockTotal"], 10);
  });

  it("estoque negativo é recusado, em vez de virar rollup negativo", async () => {
    const {db, productId} = await seeded();
    await assert.rejects(
      () => saveVariationsCore(db, variations({
        productId,
        skus: [{axisValues: {cor: "branco", tam: "p"}, stockByLocation: {cd: -3}, priceCents: null, barcode: null}],
      }), ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );
  });

  it("tirar um SKU que tinha estoque diz o que seria perdido, em vez de sumir calado", async () => {
    const {db, productId} = await seeded();
    await saveVariationsCore(db, variations({productId}), ACTOR, NOW);

    await assert.rejects(
      () => saveVariationsCore(db, variations({
        productId,
        version: 2,
        skus: [{axisValues: {cor: "branco", tam: "p"}, stockByLocation: {cd: 6}, priceCents: null, barcode: null}],
      }), ACTOR, NOW),
      (err: Error & {details?: {droppedWithStock?: string[]}}) => {
        assert.deepEqual(err.details?.droppedWithStock?.sort(), ["branco_m", "laranja_p"]);
        return true;
      },
    );
  });

  it("tirar um SKU zerado é permitido e some do rollup", async () => {
    const {fake, db, productId} = await seeded();
    await saveVariationsCore(db, variations({
      productId,
      skus: [
        {axisValues: {cor: "branco", tam: "p"}, stockByLocation: {cd: 6}, priceCents: null, barcode: null},
        {axisValues: {cor: "branco", tam: "m"}, stockByLocation: {cd: 0}, priceCents: null, barcode: null},
      ],
    }), ACTOR, NOW);

    await saveVariationsCore(db, variations({
      productId,
      version: 2,
      skus: [{axisValues: {cor: "branco", tam: "p"}, stockByLocation: {cd: 6}, priceCents: null, barcode: null}],
    }), ACTOR, NOW);

    assert.equal(fake.store.has(`storeProducts/${productId}/skus/branco_m`), false);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["skuCount"], 1);
  });

  it("código de SKU já usado por outro produto é recusado", async () => {
    const {fake, db, productId} = await seeded();
    fake.store.set("storeCatalogKeys/sku:NX-CAM-BRANCO-P", {productId: "outro", skuId: "x"});

    await assert.rejects(
      () => saveVariationsCore(db, variations({productId}), ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );
  });

  it("acima do teto de SKUs é recusado antes de escrever", async () => {
    const {db, productId} = await seeded();
    const many = Array.from({length: 101}, (_, i) => ({
      axisValues: {cor: `c${i}`, tam: "p"},
      stockByLocation: {cd: 1},
      priceCents: null,
      barcode: null,
    }));
    await assert.rejects(
      () => saveVariationsCore(db, variations({productId, skus: many}), ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "invalid-argument");
        return true;
      },
    );
  });

  it("versão velha é recusada", async () => {
    const {db, productId} = await seeded();
    await assert.rejects(
      () => saveVariationsCore(db, variations({productId, version: 99}), ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm test`
Esperado: FAIL — `saveVariationsCore` não existe.

- [ ] **Step 3: Implementar**

Acrescentar ao `store-catalog-write.ts` (e ao import de `./store-catalog`: `MAX_SKUS_PER_PRODUCT`, `rollupsOf`, `skuCodeFrom`, `skuIdFromAxisValues`, `sumStock`, `type Axis`, `type SkuDoc`):

```ts
export interface SkuInput {
  axisValues: Record<string, string>;
  barcode: string | null;
  priceCents: number | null;
  stockByLocation: Record<string, number>;
}

export interface SaveVariationsInput {
  productId: string;
  version: number;
  axes: Axis[];
  skus: SkuInput[];
}

export async function saveVariationsCore(
  db: Firestore,
  input: SaveVariationsInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; skuCount: number; stockTotal: number}> {
  if (input.axes.length > 2) {
    throw new HttpsError("invalid-argument", "Um produto tem no máximo 2 eixos de variação.");
  }
  if (input.skus.length === 0) {
    throw new HttpsError("invalid-argument", "O produto precisa de ao menos um SKU.");
  }
  if (input.skus.length > MAX_SKUS_PER_PRODUCT) {
    throw new HttpsError(
      "invalid-argument",
      `Um produto comporta no máximo ${MAX_SKUS_PER_PRODUCT} variações.`,
    );
  }
  for (const sku of input.skus) {
    for (const [location, qty] of Object.entries(sku.stockByLocation)) {
      if (!Number.isInteger(qty) || qty < 0) {
        throw new HttpsError("invalid-argument", `Estoque inválido em ${location}.`, {location});
      }
    }
  }

  const ref = db.collection(PRODUCTS).doc(input.productId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Produto não encontrado.");
    }
    const existing = snap.data()!;
    if (existing["version"] !== input.version) {
      throw conflict(existing);
    }

    // ---------- ainda leituras ----------
    const baseSku = existing["baseSku"] as string;
    const next: SkuDoc[] = input.skus.map((sku) => ({
      id: skuIdFromAxisValues(sku.axisValues, input.axes),
      code: skuCodeFrom(baseSku, sku.axisValues, input.axes),
      barcode: sku.barcode,
      axisValues: sku.axisValues,
      priceCents: sku.priceCents,
      stockByLocation: sku.stockByLocation,
      stock: sumStock(sku.stockByLocation),
    }));

    const skusRef = ref.collection("skus");
    const currentSnap = await tx.get(skusRef);
    const keepIds = new Set(next.map((s) => s.id));
    const dropped = currentSnap.docs.filter((d) => !keepIds.has(d.id));
    const droppedWithStock = dropped.filter((d) => (d.data()["stock"] ?? 0) > 0).map((d) => d.id);

    if (droppedWithStock.length > 0) {
      // Apagar em silêncio levaria o estoque junto; quem decide descartar é o usuário.
      throw new HttpsError(
        "failed-precondition",
        "Há variações com estoque que seriam removidas.",
        {droppedWithStock},
      );
    }

    // Em série, e ainda no bloco de leituras: a transação recusa ler depois de escrever.
    for (const sku of next) {
      await assertKeyFree(tx, db, `sku:${sku.code}`, input.productId);
    }

    // ---------- escritas ----------
    for (const doc of dropped) {
      tx.delete(doc.ref);
      tx.delete(db.collection(KEYS).doc(`sku:${doc.data()["code"]}`));
    }
    for (const sku of next) {
      writeKey(tx, db, `sku:${sku.code}`, {productId: input.productId, skuId: sku.id});
      tx.set(skusRef.doc(sku.id), sku, {merge: false});
    }

    const rollups = rollupsOf(next, existing["priceCents"] as number);
    const version = input.version + 1;
    tx.set(
      ref,
      {axes: input.axes, ...rollups, version, updatedAt: now, updatedBy: actor},
      {merge: true},
    );

    return {version, skuCount: rollups.skuCount, stockTotal: rollups.stockTotal};
  });
}

export const saveStoreProductVariations = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertCatalogAdmin(uid);
  return saveVariationsCore(getFirestore(), (request.data ?? {}) as SaveVariationsInput, actor, new Date());
});
```

- [ ] **Step 4: Exportar no index**

```ts
export {saveStoreProduct, saveStoreProductVariations} from "./store-catalog-write";
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd functions && npm test`
Esperado: PASS nos 9 casos novos.

Run: `cd functions && npm run lint`
Esperado: sem saída.

- [ ] **Step 6: Commit**

```bash
git add functions/src/store-catalog-write.ts functions/src/store-catalog-write.test.ts functions/src/index.ts
git commit -m "feat(loja): callable de variacoes com rollups e protecao de estoque

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `archiveStoreProduct` e `duplicateStoreProduct`

**Files:**
- Modify: `functions/src/store-catalog-write.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/src/store-catalog-write.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 3 e 4.
- Produces: `archiveCore`, `duplicateCore`, e as callables `archiveStoreProduct` e `duplicateStoreProduct`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
describe("archiveCore", () => {
  it("arquiva e depois restaura como rascunho", async () => {
    const {fake, db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);

    await archiveCore(db, {productId, version: 1}, ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["status"], "arquivado");

    await archiveCore(db, {productId, version: 2, restore: true}, ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${productId}`)!["status"], "rascunho");
  });

  it("recusa versão velha", async () => {
    const {db} = makeDb();
    const {productId} = await saveStoreProductCore(db, input(), ACTOR, NOW);
    await assert.rejects(
      () => archiveCore(db, {productId, version: 99}, ACTOR, NOW),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });
});

describe("duplicateCore", () => {
  async function withVariations() {
    const made = makeDb();
    const {productId} = await saveStoreProductCore(made.db, input(), ACTOR, NOW);
    await saveVariationsCore(made.db, {
      productId,
      version: 1,
      axes: [{id: "cor", label: "Cor", values: [{id: "branco", label: "Branco"}]}],
      skus: [{axisValues: {cor: "branco"}, stockByLocation: {cd: 9}, priceCents: null, barcode: "789"}],
    }, ACTOR, NOW);
    return {...made, productId};
  }

  it("a cópia nasce rascunho, com nome e slug próprios", async () => {
    const {fake, db, productId} = await withVariations();
    const copy = await duplicateCore(db, {productId}, ACTOR, NOW);

    const doc = fake.store.get(`storeProducts/${copy.productId}`)!;
    assert.equal(doc["status"], "rascunho");
    assert.equal(doc["name"], "Cópia de Camiseta Dry UV50 Areia");
    assert.notEqual(doc["slug"], "camiseta-dry-uv50-areia");
    assert.equal(doc["version"], 1);
  });

  it("a cópia leva as variações com estoque zerado", async () => {
    const {fake, db, productId} = await withVariations();
    const copy = await duplicateCore(db, {productId}, ACTOR, NOW);

    const sku = fake.store.get(`storeProducts/${copy.productId}/skus/branco`)!;
    assert.equal(sku["stock"], 0);
    assert.deepEqual(sku["stockByLocation"], {});
    assert.equal(fake.store.get(`storeProducts/${copy.productId}`)!["stockTotal"], 0);
  });

  it("a cópia não herda o código de barras, que é único do original", async () => {
    const {fake, db, productId} = await withVariations();
    const copy = await duplicateCore(db, {productId}, ACTOR, NOW);
    assert.equal(fake.store.get(`storeProducts/${copy.productId}/skus/branco`)!["barcode"], null);
  });

  it("a cópia não leva o custo do original", async () => {
    const {fake, db, productId} = await withVariations();
    const copy = await duplicateCore(db, {productId}, ACTOR, NOW);
    assert.equal(fake.store.has(`storeProductCosts/${copy.productId}`), false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm test`
Esperado: FAIL — `archiveCore` e `duplicateCore` não existem.

- [ ] **Step 3: Implementar**

```ts
export async function archiveCore(
  db: Firestore,
  input: {productId: string; version: number; restore?: boolean},
  actor: Actor,
  now: Date,
): Promise<{version: number; status: ProductStatus}> {
  const ref = db.collection(PRODUCTS).doc(input.productId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Produto não encontrado.");
    }
    const existing = snap.data()!;
    if (existing["version"] !== input.version) {
      throw conflict(existing);
    }
    // Restaurar devolve como rascunho: republicar é decisão consciente de quem restaurou.
    const status: ProductStatus = input.restore ? "rascunho" : "arquivado";
    const version = input.version + 1;
    tx.set(ref, {status, active: false, version, updatedAt: now, updatedBy: actor}, {merge: true});
    return {version, status};
  });
}

export async function duplicateCore(
  db: Firestore,
  input: {productId: string},
  actor: Actor,
  now: Date,
): Promise<{productId: string}> {
  const sourceRef = db.collection(PRODUCTS).doc(input.productId);
  const copyId = db.collection(PRODUCTS).doc().id;
  const copyRef = db.collection(PRODUCTS).doc(copyId);

  return db.runTransaction(async (tx) => {
    // ---------- leituras ----------
    const sourceSnap = await tx.get(sourceRef);
    if (!sourceSnap.exists) {
      throw new HttpsError("not-found", "Produto não encontrado.");
    }
    const source = sourceSnap.data()!;
    const sourceSkus = await tx.get(sourceRef.collection("skus"));

    const name = `Cópia de ${source["name"]}`;
    const slug = await freeSlug(tx, db, slugify(name), copyId);

    const axes = (source["axes"] ?? []) as Axis[];
    const baseSku = `${source["baseSku"]}-COPIA`;
    const skus: SkuDoc[] = sourceSkus.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        code: skuCodeFrom(baseSku, data["axisValues"] as Record<string, string>, axes),
        // Código de barras é do produto original; a cópia começa sem.
        barcode: null,
        axisValues: data["axisValues"] as Record<string, string>,
        priceCents: (data["priceCents"] ?? null) as number | null,
        stockByLocation: {},
        stock: 0,
      };
    });

    for (const sku of skus) {
      await assertKeyFree(tx, db, `sku:${sku.code}`, copyId);
    }

    // ---------- escritas ----------
    writeKey(tx, db, `slug:${slug}`, {productId: copyId});
    for (const sku of skus) {
      writeKey(tx, db, `sku:${sku.code}`, {productId: copyId, skuId: sku.id});
      tx.set(copyRef.collection("skus").doc(sku.id), sku, {merge: false});
    }

    tx.set(copyRef, {
      ...source,
      name,
      slug,
      baseSku,
      status: "rascunho" as ProductStatus,
      active: false,
      publishedAt: null,
      photos: [],
      soldLast30: 0,
      skuCount: skus.length,
      stockTotal: 0,
      priceFromCents: source["priceCents"],
      version: 1,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor,
    }, {merge: false});

    return {productId: copyId};
  });
}

export const archiveStoreProduct = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertCatalogAdmin(uid);
  const data = (request.data ?? {}) as {productId: string; version: number; restore?: boolean};
  return archiveCore(getFirestore(), data, actor, new Date());
});

export const duplicateStoreProduct = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertCatalogAdmin(uid);
  return duplicateCore(getFirestore(), (request.data ?? {}) as {productId: string}, actor, new Date());
});
```

- [ ] **Step 4: Exportar no index**

```ts
export {
  archiveStoreProduct,
  duplicateStoreProduct,
  saveStoreProduct,
  saveStoreProductVariations,
} from "./store-catalog-write";
```

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd functions && npm test`
Esperado: PASS — a suíte toda de `functions`, não só os arquivos novos.

Run: `cd functions && npm run lint`
Esperado: sem saída.

- [ ] **Step 6: Commit**

```bash
git add functions/src/store-catalog-write.ts functions/src/store-catalog-write.test.ts functions/src/index.ts
git commit -m "feat(loja): arquivar e duplicar produto do catalogo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Seed dos 8 produtos

**Files:**
- Create: `functions/scripts/seed-store-catalog.js`

**Interfaces:**
- Consumes: as coleções das Tasks 2–5. Escreve pelo Admin SDK, que não passa por callable nem por rule.
- Produces: nada que outro código importe.

- [ ] **Step 1: Escrever o script**

Antes de escrever, abrir um script vizinho (`functions/scripts/backfill-athlete-levels.js` serve) e copiar dali o cabeçalho: `/* eslint-disable */`, a inicialização do `firebase-admin`, o parsing de `--project` e de `--yes`, e a recusa de rodar sem `--yes`. Criar `functions/scripts/seed-store-catalog.js` com esse cabeçalho e, como corpo, os 8 produtos do mock da tela de Produtos — os mesmos nomes, SKUs, preços, estoques, limites de baixo, vendas em 30 dias, categorias e coleções de `frontend/projects/backoffice/src/app/painel/loja/produtos/data/products.mock.ts`, que é a fonte a copiar.

Regras do seed:

- Cada produto vira `storeProducts/{id}` com `id` legível (`p-bola-pro-beach`, como no mock), `version: 1`, `photos: []`, `status` e `active` como no mock, `publishedAt` = agora para os ativos e `null` para os demais.
- A **Camiseta** (`NX-CAM`) recebe os eixos do mockup: cores Branco areia / Laranja / Preto e tamanhos P / M / G / GG / XG, com os estoques da grade do desenho — 15 SKUs que somam 45 unidades. Os outros sete produtos não têm eixo: ganham um SKU `unico` com `code` igual ao `baseSku` e o estoque do mock.
- Rollups gravados conforme o que foi escrito, nunca à mão: `skuCount`, `stockTotal` e `priceFromCents` saem de `rollupsOf`.
- O custo entra em `storeProductCosts/{id}` só onde o mock tiver custo; nos demais, nenhum documento — ausente é "não informado".
- Chaves de unicidade (`slug:` e `sku:`) são criadas junto, senão a primeira edição pela callable encontra o terreno livre e duplica.
- O script é **idempotente**: rodar de novo sobrescreve os mesmos ids, sem criar cópias.

- [ ] **Step 2: Conferir que o total bate com a tela**

Run: `cd functions && node -e "const p=require('./scripts/seed-store-catalog.js').PRODUCTS; console.log(p.length, p.reduce((t,x)=>t+x.skus.length,0))"`
Esperado: `8 22` — 8 produtos; 15 SKUs da camiseta + 7 de um SKU cada. (A tela de Produtos mostra "31 SKUs" porque lá `variations` é o número do mock; a fatia B vai passar a ler `skuCount`, e o número verdadeiro é este. Registrar a diferença no commit.)

- [ ] **Step 3: Rodar contra o projeto de desenvolvimento**

Run: `cd functions && node scripts/seed-store-catalog.js --project volley-track-dev-4596c --yes`
Esperado: imprime os 8 produtos criados. Conferir no console do Firebase que `storeProducts/p-camiseta-dry-uv50/skus` tem 15 documentos e que `storeProducts/p-camiseta-dry-uv50` mostra `stockTotal: 45`.

Se o dono preferir não semear agora, pular este passo e dizer isso no relatório — o script fica pronto e o passo 2 já prova a forma dos dados.

- [ ] **Step 4: Commit**

```bash
git add functions/scripts/seed-store-catalog.js
git commit -m "feat(loja): seed do catalogo com os 8 produtos do mock

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
