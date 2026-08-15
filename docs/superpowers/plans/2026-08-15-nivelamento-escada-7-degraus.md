# Escada de 7 Degraus + Faixa de Nível na Categoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar os degraus Avançado 1/2 à escada de nível (Open passa do rank 5 para 6), dar piso (`minLevel`) às categorias de torneio com presets no wizard do organizador, e estender a régua de rating Glicko-2 — cobrindo o backend autoritativo, as rules, os 3 portais web e o app Flutter.

**Architecture:** O vocabulário de nível tem UMA fonte autoritativa (`functions/src/category-level-eligibility.ts`) e espelhos manuais em `@nexago/levels` (web), `AthleteProfileOptions` (app) e no map literal das rules — cada task altera um espelho e seus testes, sempre com a MESMA tabela de casos. O piso é aditivo: `minLevel` ausente = rank 0 = comportamento atual, então nenhuma categoria existente muda.

**Tech Stack:** Cloud Functions (TypeScript, node --test), Firestore rules (+ @firebase/rules-unit-testing), Angular 20 standalone/signals/zoneless (3 portais), Flutter/Dart.

**Spec:** `docs/superpowers/specs/2026-08-15-nivelamento-escada-7-degraus-design.md` (§4.1–§4.4 + §5–§8; a calibração §4.5 fica para um segundo plano)

## Global Constraints

- Escada nova (spec §4.1): `iniciante_1`(0) `iniciante_2`(1) `intermediario_1`(2) `intermediario_2`(3) `avancado_1`(4) `avancado_2`(5) `open`(6). Labels: "Avançado 1", "Avançado 2". `HIGHEST_RANK` passa a **6**.
- Aliases legados INALTERADOS exceto: `livre`/`Open / federado` acompanham `open` → rank **6**. `iniciante`/`basico`→0, `intermediario`→2 não mudam.
- Régua de rating (spec §4.4): avancado_1 initial 1900 / promote 2020 / demote 1800; avancado_2 2050/2170/1950; open 2200/—/2100. Degraus 0–3 intocados.
- `categories[].minLevel` guarda **LABEL** (ex.: "Avançado 1"), igual a `level`. Ausente ⇒ rank 0.
- Regra de faixa (spec §4.2): `minRank <= min(ranks da dupla) && max(ranks da dupla) <= categoryRank`.
- Presets (spec §4.3): Iniciante 0–1 · Intermediário 2–3 · Avançado 4–5 · Open 6–6 · Elite 4–6 · **Livre** 0–6 (o preset "tudo aberto" chama-se Livre, nunca "Open").
- PT nas strings de UI, inglês no código. Specs Angular novos de COMPONENTE exigem `provideZonelessChangeDetection()` nos providers do TestBed (specs de função pura não precisam).
- Worktree aninhado: rodar `ng`/`flutter` SEMPRE com cwd dentro deste worktree (conferir `pwd`); `ng build` da raiz compila o checkout principal em silêncio.
- Antes de editar qualquer arquivo, LER o arquivo inteiro (ou a região citada) — os números de linha deste plano são do commit `94c70125` e podem deslocar.
- O fixture das rules NÃO pode ter o campo legado `role` (rules pós-migração `roles[]` negam qualquer update de doc com `role`).

---

### Task 1: Vocabulário de 7 degraus no backend autoritativo

**Files:**
- Modify: `functions/src/category-level-eligibility.ts` (header, `LEVEL_CODES`, `LEVEL_RANK`, `HIGHEST_RANK`, `levelDisplayLabel`, `levelCodeForRank`, `levelLabelForRank`)
- Test: `functions/src/category-level-eligibility.test.ts`

**Interfaces:**
- Consumes: nada (é a fonte).
- Produces: `LEVEL_CODES` com 7 códigos; `levelRank("avancado_1")===4`, `levelRank("avancado_2")===5`, `levelRank("open")===6`, `levelRank("livre")===6`; `HIGHEST_RANK===6` (interno); `levelCodeForRank(4)==="avancado_1"`, `(5)==="avancado_2"`, `(6+)==="open"`; `levelLabelForRank(4)==="Avançado 1"`, `(5)==="Avançado 2"`, `(6)==="Open"`; `levelDisplayLabel("avancado_1")==="Avançado 1"`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao `describe("category-level-eligibility · níveis", ...)` existente:

```ts
  it("rankeia os degraus Avançado e Open no rank 6 (escada de 7)", () => {
    assert.equal(levelRank("avancado_1"), 4);
    assert.equal(levelRank("Avançado 1"), 4);
    assert.equal(levelRank("avancado_2"), 5);
    assert.equal(levelRank("Avançado 2"), 5);
    assert.equal(levelRank("open"), 6);
    assert.equal(levelRank("Open"), 6);
    assert.equal(levelRank("livre"), 6);
  });

  it("labels e códigos canônicos dos degraus novos", () => {
    assert.equal(levelDisplayLabel("avancado_1"), "Avançado 1");
    assert.equal(levelDisplayLabel("avancado_2"), "Avançado 2");
    assert.equal(levelCodeForRank(4), "avancado_1");
    assert.equal(levelCodeForRank(5), "avancado_2");
    assert.equal(levelCodeForRank(6), "open");
    assert.equal(levelLabelForRank(4), "Avançado 1");
    assert.equal(levelLabelForRank(5), "Avançado 2");
    assert.equal(levelLabelForRank(6), "Open");
  });
```

Importar `levelDisplayLabel` e `levelCodeForRank` no import do teste se ainda não estiverem.

ATENÇÃO: testes existentes que asseguram `levelRank("open") === 5` ou `levelCodeForRank(5) === "open"` passam a estar ERRADOS — atualizá-los para 6/`avancado_2` no mesmo commit (procurar por `5` no arquivo de teste).

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build && node --test lib/category-level-eligibility.test.js`
Expected: FAIL nos casos novos (`levelRank("avancado_1")` → `null`).

- [ ] **Step 3: Implementar**

Em `functions/src/category-level-eligibility.ts`:

```ts
/** Códigos canônicos dos 7 níveis, em ordem crescente de força. */
export const LEVEL_CODES = [
  "iniciante_1",
  "iniciante_2",
  "intermediario_1",
  "intermediario_2",
  "avancado_1",
  "avancado_2",
  "open",
] as const;
```

```ts
export const LEVEL_RANK: Record<string, number> = {
  // Códigos novos (levelsBySport) e labels normalizados (categoria).
  iniciante_1: 0,
  iniciante1: 0,
  iniciante_2: 1,
  iniciante2: 1,
  intermediario_1: 2,
  intermediario1: 2,
  intermediario_2: 3,
  intermediario2: 3,
  avancado_1: 4,
  avancado1: 4,
  avancado_2: 5,
  avancado2: 5,
  open: 6,
  // Legados (escada de 3 níveis) — degrau inferior do split.
  iniciante: 0,
  intermediario: 2,
};

const HIGHEST_RANK = 6;
```

(`normalizeLevelKey` já tira acento e espaço: "Avançado 1" → `avancado1`. `livre` → `LEVEL_RANK.open` já delega.)

Em `levelDisplayLabel`, antes do case `open`:

```ts
    case "avancado_1":
    case "avancado1":
      return "Avançado 1";
    case "avancado_2":
    case "avancado2":
      return "Avançado 2";
```

Em `levelCodeForRank`:

```ts
    case 4:
      return "avancado_1";
    case 5:
      return "avancado_2";
    default:
      return "open";
```

Em `levelLabelForRank`:

```ts
    case 4:
      return "Avançado 1";
    case 5:
      return "Avançado 2";
    default:
      return "Open";
```

Atualizar o comentário de cabeçalho do arquivo (linhas 11–20): a escada agora é de 7, ranks 0–6 contíguos, e registrar: "Renumeração única de `open` 5→6 em 15/08/2026 com a base vazia (pré-primeiro-torneio); a partir daqui a numeração volta a ser fixa."

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run build && node --test lib/category-level-eligibility.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Rodar a suíte inteira de functions**

Run: `cd functions && npm test`
Expected: PASS. Se `rating-ladder.test.js` ou `athlete-levels-migration.test.js` falharem por assumirem `open=5`, corrigir esses asserts para a escada nova NESTE commit (são consumidores do vocabulário, não regras próprias).

- [ ] **Step 6: Commit**

```bash
git add functions/src/category-level-eligibility.ts functions/src/category-level-eligibility.test.ts functions/src/rating-ladder.test.ts functions/src/athlete-levels-migration.test.ts
git commit -m "feat(levels): escada de 7 degraus no vocabulário autoritativo (open rank 6)"
```

---

### Task 2: Piso de nível na elegibilidade (backend)

**Files:**
- Modify: `functions/src/category-level-eligibility.ts` (nova `categoryMinLevelRank`, `isTeamEligible`, `assertTeamLevelEligibility`)
- Test: `functions/src/category-level-eligibility.test.ts`

**Interfaces:**
- Consumes: `levelRank`, `HIGHEST_RANK`, `resolveAthleteLevelRank`, `levelLabelForRank` (Task 1).
- Produces: `categoryMinLevelRank(category): number` (0 quando `minLevel` ausente/desconhecido); `isTeamEligible({categoryRank, athleteRanks, categoryMinRank?})`; `assertTeamLevelEligibility` recusa também por piso com `HttpsError("failed-precondition")` e mensagem própria. Os callables existentes (registerSoloTournament, invites, PIX, free) NÃO mudam — já passam o objeto `category` inteiro.

- [ ] **Step 1: Testes que falham**

```ts
describe("category-level-eligibility · piso (minLevel)", () => {
  it("minLevel ausente/desconhecido resolve para 0 (comportamento atual)", () => {
    assert.equal(categoryMinLevelRank(null), 0);
    assert.equal(categoryMinLevelRank({}), 0);
    assert.equal(categoryMinLevelRank({minLevel: "???"}), 0);
    assert.equal(categoryMinLevelRank({minLevel: "Avançado 1"}), 4);
    assert.equal(categoryMinLevelRank({minLevel: "avancado_1"}), 4);
  });

  it("faixa: piso barra o mais fraco, teto barra o mais forte", () => {
    // Elite 4–6: Avançado 1 + Open entram; Intermediário 2 não.
    assert.equal(isTeamEligible({categoryRank: 6, categoryMinRank: 4, athleteRanks: [4, 6]}), true);
    assert.equal(isTeamEligible({categoryRank: 6, categoryMinRank: 4, athleteRanks: [3, 6]}), false);
    // Sem categoryMinRank: igual a hoje.
    assert.equal(isTeamEligible({categoryRank: 2, athleteRanks: [0, 2]}), true);
    // Dupla vazia sempre elegível.
    assert.equal(isTeamEligible({categoryRank: 6, categoryMinRank: 4, athleteRanks: []}), true);
  });

  it("assert recusa por piso nomeando o atleta fraco", async () => {
    const db = mockDb({
      forte: {name: "Ana", sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "open"}}},
      fraco: {name: "Bia", sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "intermediario_2"}}},
    });
    await assert.rejects(
      () => assertTeamLevelEligibility({
        db: db as never,
        tournament: {sport: "beachVolleyball"},
        category: {categoryName: "Elite", level: "Open", minLevel: "Avançado 1"},
        uids: ["forte", "fraco"],
      }),
      (err: {message: string}) => err.message.includes("Bia") && err.message.includes("nível mínimo"),
    );
  });

  it("assert aceita a dupla dentro da faixa (piso ativo carrega usuários mesmo com teto Open)", async () => {
    const db = mockDb({
      a1: {name: "Ana", sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "avancado_1"}}},
      op: {name: "Bia", sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "open"}}},
    });
    await assert.doesNotReject(() => assertTeamLevelEligibility({
      db: db as never,
      tournament: {sport: "beachVolleyball"},
      category: {categoryName: "Elite", level: "Open", minLevel: "Avançado 1"},
      uids: ["a1", "op"],
    }));
  });
});
```

Importar `categoryMinLevelRank` no teste.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build && node --test lib/category-level-eligibility.test.js`
Expected: FAIL (`categoryMinLevelRank` não exportada).

- [ ] **Step 3: Implementar**

Logo após `categoryLevelRank`:

```ts
/**
 * Rank do PISO da categoria (`categories[].minLevel`, label ou código).
 * Ausente/desconhecido → 0 (sem piso — todo doc antigo se comporta como hoje).
 */
export function categoryMinLevelRank(
  category: Record<string, unknown> | null | undefined,
): number {
  if (!category) return 0;
  return levelRank(category.minLevel) ?? 0;
}
```

`isTeamEligible` vira faixa (piso opcional, default 0):

```ts
/** Dupla elegível sse TODOS os integrantes cabem na faixa [minRank, categoryRank]. */
export function isTeamEligible(params: {
  categoryRank: number;
  athleteRanks: number[];
  categoryMinRank?: number;
}): boolean {
  const {categoryRank, athleteRanks} = params;
  const minRank = params.categoryMinRank ?? 0;
  if (athleteRanks.length === 0) return true;
  return athleteRanks.every((rank) => rank >= minRank && rank <= categoryRank);
}
```

Em `assertTeamLevelEligibility`, substituir do cálculo de `categoryRank` até o `throw` final por:

```ts
  const categoryRank = categoryLevelRank(category);
  const minRank = categoryMinLevelRank(category);
  // Categoria totalmente aberta (teto Open, sem piso) comporta qualquer nível —
  // evita carregar usuários à toa. Com piso, os docs SÃO necessários.
  if (categoryRank >= HIGHEST_RANK && minRank <= 0) return;

  const sportCode = tournamentSportToLevelSportCode(tournament.sport);

  const users = await Promise.all(
    cleanUids.map((uid) => loadUserAccessData(db, uid)),
  );

  const categoryName = categoryDisplayName(category);
  const nameWithLevel = (userData: UserAccessData | null): string => {
    const rank = resolveAthleteLevelRank(userData, sportCode);
    return `${athleteDisplayName(userData)} (${levelLabelForRank(rank)})`;
  };
  const joined = (names: string[]): string =>
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;

  // Teto (anti-sandbagging) tem precedência — mensagem idêntica à de hoje.
  const tooStrong = users.filter(
    (userData) => resolveAthleteLevelRank(userData, sportCode) > categoryRank,
  );
  if (tooStrong.length > 0) {
    const subject = joined(tooStrong.map(nameWithLevel));
    const verb = tooStrong.length === 1 ? "não pode" : "não podem";
    throw new HttpsError(
      "failed-precondition",
      `${subject} ${verb} disputar a categoria ${categoryName}, ` +
        "abaixo do nível do atleta. Escolha uma categoria igual ou superior.",
    );
  }

  // Piso: barra o integrante mais fraco — ninguém entra carregado pelo parceiro.
  if (minRank > 0) {
    const tooWeak = users.filter(
      (userData) => resolveAthleteLevelRank(userData, sportCode) < minRank,
    );
    if (tooWeak.length > 0) {
      const subject = joined(tooWeak.map(nameWithLevel));
      const verb = tooWeak.length === 1 ? "não atinge" : "não atingem";
      throw new HttpsError(
        "failed-precondition",
        `${subject} ${verb} o nível mínimo da categoria ${categoryName} ` +
          `(${levelLabelForRank(minRank)}).`,
      );
    }
  }
```

Atualizar o doc-comment da função (fala só de "excede o nível").

- [ ] **Step 4: Rodar e ver passar**

Run: `cd functions && npm run build && node --test lib/category-level-eligibility.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/category-level-eligibility.ts functions/src/category-level-eligibility.test.ts
git commit -m "feat(levels): piso de nível (minLevel) na elegibilidade de categoria"
```

---

### Task 3: Régua de rating de 7 degraus

**Files:**
- Modify: `functions/src/rating-config.ts` (`VOLLEYBALL_LEVELS`, comentários)
- Test: `functions/src/rating-ladder.test.ts`

**Interfaces:**
- Consumes: nada novo (a escada mora aqui).
- Produces: `DEFAULT_LADDER_CONFIG.levels` com 7 entradas, ranks 0,1,2,3,4,5,6. `resolveLadderLevel` e `adjacentLevel` continuam genéricos — sem mudança de assinatura.

- [ ] **Step 1: Testes que falham**

Adicionar em `rating-ladder.test.ts` (usar os helpers/estilo do arquivo — ler antes):

```ts
describe("escada de 7 degraus", () => {
  const config = parseLadderConfig("VOLEI_PRAIA", undefined);

  it("tem os 7 degraus com a régua do spec", () => {
    assert.equal(config.levels.length, 7);
    const byCode = Object.fromEntries(config.levels.map((l) => [l.code, l]));
    assert.deepEqual(
      [byCode.avancado_1.rank, byCode.avancado_1.initialRating, byCode.avancado_1.promoteAt, byCode.avancado_1.demoteAt],
      [4, 1900, 2020, 1800],
    );
    assert.deepEqual(
      [byCode.avancado_2.rank, byCode.avancado_2.initialRating, byCode.avancado_2.promoteAt, byCode.avancado_2.demoteAt],
      [5, 2050, 2170, 1950],
    );
    assert.deepEqual(
      [byCode.open.rank, byCode.open.initialRating, byCode.open.promoteAt, byCode.open.demoteAt],
      [6, 2200, null, 2100],
    );
  });

  it("adjacência atravessa os degraus novos", () => {
    const int2 = config.levels.find((l) => l.code === "intermediario_2")!;
    assert.equal(adjacentLevel(config, int2, "up")?.code, "avancado_1");
    const open = config.levels.find((l) => l.code === "open")!;
    assert.equal(adjacentLevel(config, open, "down")?.code, "avancado_2");
  });

  it("legado 'livre' resolve pro degrau open (rank 6)", () => {
    assert.equal(resolveLadderLevel(config, "livre").code, "open");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build && node --test lib/rating-ladder.test.js`
Expected: FAIL (`levels.length` é 5).

- [ ] **Step 3: Implementar**

Substituir `VOLLEYBALL_LEVELS` em `rating-config.ts`:

```ts
/**
 * Escada de 7 níveis (a mesma para todos os esportes), ranks 0–6 contíguos.
 * Renumeração única em 15/08/2026 (`open` 5→6) com a base vazia; a partir
 * daqui a numeração volta a ser FIXA (gravada em `athleteRatings.levelRank`
 * e nas rules deployadas). Régua dos degraus novos é estimativa sem histórico
 * — ajustar via doc `ratingLadders/VOLEI_PRAIA`, sem deploy.
 */
const VOLLEYBALL_LEVELS: RatingLadderLevel[] = [
  {code: "iniciante_1", rank: 0, label: "Iniciante 1", initialRating: 1250, promoteAt: 1420, demoteAt: null},
  {code: "iniciante_2", rank: 1, label: "Iniciante 2", initialRating: 1450, promoteAt: 1570, demoteAt: 1350},
  {code: "intermediario_1", rank: 2, label: "Intermediário 1", initialRating: 1600, promoteAt: 1720, demoteAt: 1500},
  {code: "intermediario_2", rank: 3, label: "Intermediário 2", initialRating: 1750, promoteAt: 1870, demoteAt: 1650},
  {code: "avancado_1", rank: 4, label: "Avançado 1", initialRating: 1900, promoteAt: 2020, demoteAt: 1800},
  {code: "avancado_2", rank: 5, label: "Avançado 2", initialRating: 2050, promoteAt: 2170, demoteAt: 1950},
  {code: "open", rank: 6, label: "Open", initialRating: 2200, promoteAt: null, demoteAt: 2100},
];
```

Remover do comentário anterior a frase sobre "rank 4 não é usado".

- [ ] **Step 4: Rodar e ver passar + suíte inteira**

Run: `cd functions && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/rating-config.ts functions/src/rating-ladder.test.ts
git commit -m "feat(rating): régua Glicko de 7 degraus (Avançado 1/2, Open 2200)"
```

---

### Task 4: Ranks novos nas Firestore rules

**Files:**
- Modify: `firestore.rules` (função `athleteLevelRank`, linhas ~321–332)
- Test: `functions/test/athlete-level-rules.test.mjs`

**Interfaces:**
- Consumes: escada da Task 1 (espelho manual).
- Produces: `athleteLevelRank` nas rules devolve 4/5 para os códigos e labels do Avançado e 6 para `open`/`Open`/`livre`/`Livre`/`Open / federado`.

- [ ] **Step 1: Testes que falham**

Adicionar ao `.test.mjs` (seguir o padrão `assertSucceeds`/`assertFails` do arquivo; o fixture base NÃO tem campo `role`):

```js
// Escada de 7: subir para Avançado é permitido…
await assertSucceeds(updateDoc(userDoc(), {
  'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'avancado_1',
}));
// …descer de Avançado 2 para Avançado 1 é negado…
await assertFails(updateDoc(userDocAt('avancado_2'), {
  'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'avancado_1',
}));
// …e Open (rank 6) continua acima de Avançado 2.
await assertFails(updateDoc(userDocAt('open'), {
  'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'avancado_2',
}));
await assertSucceeds(updateDoc(userDocAt('avancado_2'), {
  'sportOnboarding.levelsBySport.VOLEI_PRAIA': 'open',
}));
```

(`userDoc`/`userDocAt` = adaptar aos helpers reais do arquivo; se não existir helper de seed por nível, semear via `testEnv.withSecurityRulesDisabled` como os casos existentes fazem.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `firebase emulators:exec --only firestore "node functions/test/athlete-level-rules.test.mjs"`
Expected: FAIL — `avancado_1` hoje rankeia `-1` (desconhecido), então a subida para Avançado é NEGADA.

- [ ] **Step 3: Implementar**

Substituir o map em `athleteLevelRank` (firestore.rules):

```
      let ranks = {
        'iniciante': 0, 'Iniciante': 0, 'basico': 0, 'básico': 0,
        'Básico': 0, 'iniciante_1': 0, 'Iniciante 1': 0,
        'iniciante_2': 1, 'Iniciante 2': 1,
        'intermediario': 2, 'Intermediário': 2,
        'intermediario_1': 2, 'Intermediário 1': 2,
        'intermediario_2': 3, 'Intermediário 2': 3,
        'avancado_1': 4, 'Avançado 1': 4,
        'avancado_2': 5, 'Avançado 2': 5,
        'open': 6, 'Open': 6, 'livre': 6, 'Livre': 6, 'Open / federado': 6
      };
```

(Grafias com acento em precomposed — "ç" U+00E7, "Avançado" sem combinantes soltos.)

- [ ] **Step 4: Rodar e ver passar**

Run: `firebase emulators:exec --only firestore "node functions/test/athlete-level-rules.test.mjs"`
Expected: PASS, inclusive os casos antigos (aliases legados inalterados; rewrite de mesmo rank permitido).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules functions/test/athlete-level-rules.test.mjs
git commit -m "feat(rules): ranks Avançado 1/2 (4/5) e Open→6 na guarda de nível"
```

---

### Task 5: Migração de `athleteRatings.levelRank` (recálculo pelo código)

**Files:**
- Modify: `functions/src/rating-triggers.ts` (novo callable ao lado de `migrateAthleteLevels`)
- Modify: `functions/src/index.ts` (exportar o callable, junto de `migrateAthleteLevels` na linha ~229)
- Test: `functions/src/rating-ladder.test.ts` (helper puro)

**Interfaces:**
- Consumes: `resolveLadderLevel`, `loadRatingLadderConfig` (rating-config), `athleteRatingsPath` (rating-engine).
- Produces: helper puro `expectedLevelRankFor(config, levelCode): number` em `rating-ladder.ts` (exportado); callable `migrateAthleteRatingLevelRanks` (super admin, paginado `startAfterId`→`done`, `dryRun`) que regrava `levelRank` quando difere do recálculo.

- [ ] **Step 1: Teste do helper puro (falha)**

Em `rating-ladder.test.ts`:

```ts
describe("expectedLevelRankFor", () => {
  const config = parseLadderConfig("VOLEI_PRAIA", undefined);
  it("recalcula o rank pelo CÓDIGO, nunca pelo rank gravado", () => {
    assert.equal(expectedLevelRankFor(config, "open"), 6);       // doc antigo tinha 5
    assert.equal(expectedLevelRankFor(config, "avancado_1"), 4);
    assert.equal(expectedLevelRankFor(config, "livre"), 6);      // legado → open
    assert.equal(expectedLevelRankFor(config, ""), 0);           // desconhecido → piso
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm run build && node --test lib/rating-ladder.test.js`
Expected: FAIL (não exportado).

- [ ] **Step 3: Implementar o helper**

Em `functions/src/rating-ladder.ts`:

```ts
/** Rank correto para um código de nível segundo a escada vigente — usado pela
 *  migração de renumeração (recalcula pelo CÓDIGO; o rank gravado pode ser da
 *  numeração antiga). */
export function expectedLevelRankFor(
  config: RatingLadderConfig,
  levelCode: unknown,
): number {
  return resolveLadderLevel(config, levelCode).rank;
}
```

(importar `resolveLadderLevel`/`RatingLadderConfig` de `./rating-config` se ainda não importados.)

- [ ] **Step 4: Implementar o callable**

Em `rating-triggers.ts`, AO LADO de `migrateAthleteLevels` (ler a função inteira primeiro e copiar exatamente: o mesmo guard de super admin, a mesma assinatura de paginação `{dryRun, pageSize, startAfterId}` → `{processed, updated, done, lastId}`). Corpo do laço por doc de `athleteRatings`:

```ts
        const data = doc.data() as Record<string, unknown>;
        const sportCode = typeof data.sportCode === "string" ? data.sportCode : "";
        if (!sportCode) continue;
        const config = await configFor(sportCode); // cache por esporte no escopo do handler
        const expected = expectedLevelRankFor(config, data.levelCode);
        if (data.levelRank === expected) continue;
        updated++;
        if (!dryRun) {
          await doc.ref.set({levelRank: expected}, {merge: true});
        }
```

com o cache trivial no início do handler:

```ts
      const configs = new Map<string, RatingLadderConfig>();
      const configFor = async (sportCode: string): Promise<RatingLadderConfig> => {
        const hit = configs.get(sportCode);
        if (hit) return hit;
        const loaded = await loadRatingLadderConfig(db, sportCode);
        configs.set(sportCode, loaded);
        return loaded;
      };
```

A coleção é `db.collection(athleteRatingsPath(projectId))` ordenada por `FieldPath.documentId()` com `startAfter(startAfterId)` — mesmo esqueleto de paginação de `migrateAthleteLevels`.

Exportar em `functions/src/index.ts` junto de `migrateAthleteLevels`:

```ts
  migrateAthleteRatingLevelRanks,
```

- [ ] **Step 5: Rodar suíte + tsc**

Run: `cd functions && npm test`
Expected: PASS (o callable em si é coberto pelo lint/build; a lógica de decisão está no helper testado).

- [ ] **Step 6: Commit**

```bash
git add functions/src/rating-ladder.ts functions/src/rating-ladder.test.ts functions/src/rating-triggers.ts functions/src/index.ts
git commit -m "feat(rating): callable de recálculo de levelRank pós-renumeração"
```

---

### Task 6: Vocabulário de 7 no `@nexago/levels` (web compartilhado)

**Files:**
- Modify: `frontend/shared/levels/index.ts`
- Test: `frontend/projects/athlete/src/app/data/public-profiles-repository.levels.spec.ts` e `frontend/projects/organizer/src/app/painel/data/tournament-create.levels.spec.ts` (asserts diretos sobre o shared — conferir onde cada função já é testada e estender lá; se nenhum spec cobre `levelRankOf` direto, adicionar os asserts no spec do athlete)

**Interfaces:**
- Consumes: espelho da Task 1.
- Produces: `LevelCode` com 7 membros (`'avancado_1' | 'avancado_2'` novos); `LEVEL_CODES`/`LEVEL_OPTIONS` com 7; `levelRankOf('avancado_1')===4`, `('open')===6`; `levelLabelForRank(4)==='Avançado 1'`, `(5)==='Avançado 2'`, `(6)==='Open'`; `levelDisplayLabel('avancado_2')==='Avançado 2'`.

- [ ] **Step 1: Testes que falham**

No spec escolhido:

```ts
  it('escada de 7: Avançado 1/2 e Open no rank 6', () => {
    expect(levelRankOf('avancado_1')).toBe(4);
    expect(levelRankOf('Avançado 1')).toBe(4);
    expect(levelRankOf('avancado_2')).toBe(5);
    expect(levelRankOf('open')).toBe(6);
    expect(levelRankOf('livre')).toBe(6);
    expect(levelLabelForRank(4)).toBe('Avançado 1');
    expect(levelLabelForRank(5)).toBe('Avançado 2');
    expect(levelLabelForRank(6)).toBe('Open');
    expect(levelDisplayLabel('avancado_2')).toBe('Avançado 2');
    expect(LEVEL_CODES.length).toBe(7);
  });
```

Specs existentes que assumam `levelRankOf('open') === 5` passam a estar errados — atualizar no mesmo commit.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test athlete --watch=false` (e `organizer` se o spec de lá foi tocado)
Expected: FAIL nos casos novos.

- [ ] **Step 3: Implementar**

Em `frontend/shared/levels/index.ts`:

```ts
export type LevelCode =
  | 'iniciante_1'
  | 'iniciante_2'
  | 'intermediario_1'
  | 'intermediario_2'
  | 'avancado_1'
  | 'avancado_2'
  | 'open';
```

`LEVEL_CODES` com os 7 na ordem. `LEVEL_OPTIONS` ganha, antes do open:

```ts
  { code: 'avancado_1', label: 'Avançado 1', description: 'Disputo as primeiras posições nos torneios que jogo.' },
  { code: 'avancado_2', label: 'Avançado 2', description: 'Brigo por título na maioria dos torneios da região.' },
```

`LEVEL_LABELS` ganha `avancado_1: 'Avançado 1', avancado_2: 'Avançado 2'`.

`levelRankOf`: adicionar antes do case open (o normalize NFD já reduz 'ç'→'c'):

```ts
    case 'avancado 1':
    case 'avancado_1':
      return 4;
    case 'avancado 2':
    case 'avancado_2':
      return 5;
    case 'open':
    case 'livre':
      return 6;
```

`levelLabelForRank`: cases `4`/`5` antes do default. Atualizar o comentário de cabeçalho (ranks 0–6 contíguos) e o comentário da função (não há mais "pulo do 4").

- [ ] **Step 4: Rodar TODOS os portais**

Run: `cd frontend && npx ng test athlete --watch=false && npx ng test organizer --watch=false && npx ng test backoffice --watch=false`
Expected: PASS — o backoffice (`athlete-level-dialog`) consome `LEVEL_OPTIONS`/`levelRankOf` e ganha os 7 níveis automaticamente; se algum spec dele assumia 5 opções, atualizar.

- [ ] **Step 5: Commit**

```bash
git add frontend/shared/levels/index.ts frontend/projects/athlete/src/app/data/public-profiles-repository.levels.spec.ts frontend/projects/organizer/src/app/painel/data/tournament-create.levels.spec.ts
git commit -m "feat(levels-web): escada de 7 no @nexago/levels (backoffice herda)"
```

---

### Task 7: Portal do atleta — espelho + piso na pré-validação

**Files:**
- Modify: `frontend/projects/athlete/src/app/data/athlete-level.ts`
- Modify: `frontend/projects/athlete/src/app/data/tournaments-repository.ts` (campo `minLevel` na `TournamentCategoryOffer`, ~linhas 65 e 142)
- Modify: `frontend/projects/athlete/src/app/tournaments/tournament-eligibility.ts`
- Test: `frontend/projects/athlete/src/app/data/athlete-level.spec.ts`, `frontend/projects/athlete/src/app/tournaments/tournament-eligibility.levels.spec.ts`

**Interfaces:**
- Consumes: `levelLabelForRank` do `@nexago/levels` (Task 6).
- Produces: `AthleteLevelLabel` com 7 labels; `levelRankOf` local com Avançado/open 6; `TournamentCategoryOffer.minLevel: string | null`; `categoryMinLevelRank(category): number`; `evaluateCategoryEligibility` devolve novo status `'belowMinLevel'` com badge `'NÍVEL MÍNIMO NÃO ATINGIDO'`.

- [ ] **Step 1: Testes que falham**

`athlete-level.spec.ts`:

```ts
  it('escada de 7 no espelho local', () => {
    expect(levelRankOf('avancado_1')).toBe(4);
    expect(levelRankOf('Avançado 2')).toBe(5);
    expect(levelRankOf('open')).toBe(6);
    expect(levelLabelForRank(4)).toBe('Avançado 1');
    expect(levelLabelForRank(5)).toBe('Avançado 2');
    expect(levelLabelForRank(6)).toBe('Open');
  });
```

`tournament-eligibility.levels.spec.ts` (seguir os builders de offer/profile do arquivo):

```ts
  it('piso: Intermediário 2 é barrado da Elite (mín. Avançado 1), Avançado 1 entra', () => {
    const elite = offer({ level: 'Open', minLevel: 'Avançado 1' });
    const int2 = profile({ levelsBySport: { VOLEI_PRAIA: 'intermediario_2' } });
    const av1 = profile({ levelsBySport: { VOLEI_PRAIA: 'avancado_1' } });
    const opts = { tournamentSport: 'beachVolleyball', tournamentStart: null };
    expect(evaluateCategoryEligibility(elite, int2, opts).status).toBe('belowMinLevel');
    expect(evaluateCategoryEligibility(elite, av1, opts).status).toBe('eligible');
  });

  it('sem minLevel nada muda (retrocompat)', () => {
    const livre = offer({ level: 'Open', minLevel: null });
    const ini = profile({ levelsBySport: { VOLEI_PRAIA: 'iniciante_1' } });
    expect(evaluateCategoryEligibility(livre, ini, { tournamentSport: 'beachVolleyball', tournamentStart: null }).status).toBe('eligible');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test athlete --watch=false`
Expected: FAIL (status `belowMinLevel` inexistente / rank de avancado null).

- [ ] **Step 3: Implementar**

`athlete-level.ts`:
- `AthleteLevelLabel`: adicionar `'Avançado 1' | 'Avançado 2'` antes de `'Open'`.
- Na cadeia de normalize, acrescentar `.replace(/ç/g, 'c')` após os replaces existentes (este arquivo NÃO usa NFD).
- `levelRankOf`: cases `'avancado 1'/'avancado_1'` → 4, `'avancado 2'/'avancado_2'` → 5, e `open`/`livre` → 6.
- `levelLabelForRank`: `if (rank === 4) return 'Avançado 1'; if (rank === 5) return 'Avançado 2'; return 'Open';`
- Atualizar comentários "5 tiers"/"Open é rank 5".

`tournaments-repository.ts`: na interface da categoria (linha ~65) adicionar `minLevel: string | null;` e no parse (linha ~142) `minLevel: optionalStr(o['minLevel']),`.

`tournament-eligibility.ts`:
- `const HIGHEST_LEVEL_RANK = 6;`
- Novo helper:

```ts
/** Rank do piso da categoria; ausente/desconhecido → 0 (sem piso). */
export function categoryMinLevelRank(category: Pick<TournamentCategoryOffer, 'minLevel'>): number {
  return levelRankOf(category.minLevel) ?? 0;
}
```

- `CategoryEligibilityStatus`: adicionar `'belowMinLevel'`.
- Em `evaluateCategoryEligibility`, logo APÓS o bloco do teto (belowLevel):

```ts
  // Piso da faixa: categoria com nível mínimo barra quem está abaixo dele.
  const minRank = categoryMinLevelRank(category);
  if (minRank > 0 && athleteRank < minRank) {
    return {
      status: 'belowMinLevel',
      badge: 'NÍVEL MÍNIMO NÃO ATINGIDO',
      message: `Esta categoria exige nível mínimo ${levelLabelForRank(minRank)}. Seu nível atual é ${levelLabelForRank(athleteRank)}.`,
    };
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx ng test athlete --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/data/athlete-level.ts frontend/projects/athlete/src/app/data/athlete-level.spec.ts frontend/projects/athlete/src/app/data/tournaments-repository.ts frontend/projects/athlete/src/app/tournaments/tournament-eligibility.ts frontend/projects/athlete/src/app/tournaments/tournament-eligibility.levels.spec.ts
git commit -m "feat(athlete-web): escada de 7 e piso de nível na pré-validação"
```

---

### Task 8: Portal do organizador — modelo, mapper e pontuação 2–14

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts` (`SkillLevel`, `SKILL_LEVEL_LABEL`, `skillLevelOptionsForSport`, draft `minSkillLevel`, tags)
- Modify: `frontend/projects/organizer/src/app/painel/data/tournament-create-mapper.ts` (`minLevel` write/parse, `parseSkillLevel`)
- Modify: `frontend/projects/organizer/src/app/painel/data/team-level-score.ts` (`POINTS_BY_RANK`)
- Test: `tournament-create.levels.spec.ts`, `team-level-score.spec.ts`

**Interfaces:**
- Consumes: `levelRankOf` (Task 6).
- Produces: `SkillLevel` com `'avancado1' | 'avancado2'` novos; `TournamentCategoryDraft.minSkillLevel: SkillLevel | null` (default `null`); Firestore da categoria ganha `minLevel` (label ou `null`); `levelPointsOf` devolve 1–7 (dupla 2–14); `LEVEL_PRESETS` exportado para a Task 9.

- [ ] **Step 1: Testes que falham**

`tournament-create.levels.spec.ts`:

```ts
  it('serializa e reidrata minLevel como label', () => {
    const cat = { ...blankCategory(), skillLevel: 'open' as const, minSkillLevel: 'avancado1' as const };
    const map = categoryToMap(cat); // usar o nome real da função de serialização do mapper
    expect(map['minLevel']).toBe('Avançado 1');
    expect(map['level']).toBe('Open');
    const back = categoryFromMap(map); // idem parse
    expect(back.minSkillLevel).toBe('avancado1');
  });

  it('minLevel ausente reidrata como null (categoria antiga)', () => {
    const map = categoryToMap(blankCategory());
    delete map['minLevel'];
    expect(categoryFromMap(map).minSkillLevel).toBeNull();
  });

  it('editor oferece os 7 degraus', () => {
    expect(skillLevelOptionsForSport('beachVolleyball').length).toBe(7);
  });
```

`team-level-score.spec.ts`:

```ts
  it('pontos 1–7 na escada de 7 (dupla 2–14)', () => {
    expect(levelPointsOf('avancado_1')).toBe(5);
    expect(levelPointsOf('avancado_2')).toBe(6);
    expect(levelPointsOf('open')).toBe(7);
    expect(levelPointsOf('intermediario_2')).toBe(4);
  });
```

Casos existentes com `open` valendo 5 pontos → atualizar para 7.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test organizer --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`tournament-create.model.ts`:

```ts
export type SkillLevel = 'beginner' | 'intermediate' | 'open' | 'iniciante1' | 'iniciante2' | 'intermediario1' | 'intermediario2' | 'avancado1' | 'avancado2';
```

`SKILL_LEVEL_LABEL`: adicionar `avancado1: 'Avançado 1', avancado2: 'Avançado 2'`.

`skillLevelOptionsForSport` (comentário: escada de 7):

```ts
  return ['iniciante1', 'iniciante2', 'intermediario1', 'intermediario2', 'avancado1', 'avancado2', 'open'];
```

No tipo do draft da categoria (linha ~49, junto de `skillLevel`): `minSkillLevel: SkillLevel | null;` e no draft em branco (linha ~112, `skillLevel: 'open'`): `minSkillLevel: null,`.

Presets (exportar aqui para a Task 9 consumir):

```ts
export interface CategoryLevelPreset {
  label: string;
  min: SkillLevel | null;
  max: SkillLevel;
}

/** Faixas prontas de nível (spec §4.3). "Livre" é a categoria totalmente
 *  aberta — o nome "Open" fica reservado pro degrau de elite. */
export const CATEGORY_LEVEL_PRESETS: readonly CategoryLevelPreset[] = [
  { label: 'Iniciante', min: 'iniciante1', max: 'iniciante2' },
  { label: 'Intermediário', min: 'intermediario1', max: 'intermediario2' },
  { label: 'Avançado', min: 'avancado1', max: 'avancado2' },
  { label: 'Open', min: 'open', max: 'open' },
  { label: 'Elite', min: 'avancado1', max: 'open' },
  { label: 'Livre', min: null, max: 'open' },
];
```

Nas linhas 368/378 (nome sugerido e tags), depois do push do nível máximo:

```ts
  if (category.minSkillLevel) parts.push(`mín. ${SKILL_LEVEL_LABEL[category.minSkillLevel]}`);
```

(o mesmo para `tags`.)

`tournament-create-mapper.ts`:
- No objeto serializado (junto de `level:` linha ~292): `minLevel: category.minSkillLevel ? SKILL_LEVEL_LABEL[category.minSkillLevel] : null,`
- No parse (junto de `skillLevel:` linha ~293): `minSkillLevel: parseMinSkillLevel(map['minLevel']),`
- Nova função ao lado de `parseSkillLevel`:

```ts
function parseMinSkillLevel(raw: unknown): SkillLevel | null {
  const v = str(raw);
  if (!v) return null;
  return parseSkillLevel(raw);
}
```

- No map de `parseSkillLevel`: adicionar `'avançado 1': 'avancado1', 'avancado 1': 'avancado1', 'avançado 2': 'avancado2', 'avancado 2': 'avancado2',` (os códigos exatos `avancado1`/`avancado2` já entram pelo array `exact` — incluí-los lá).

`team-level-score.ts`:

```ts
/** Degrau na escada (1 = Iniciante 1 … 7 = Open), ranks 0–6 contíguos. */
const POINTS_BY_RANK: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };
```

Atualizar comentários "2–10" → "2–14" (aqui e no doc-comment de `TeamLevelScore.points`).

- [ ] **Step 4: Rodar e ver passar**

Run: `cd frontend && npx ng test organizer --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts frontend/projects/organizer/src/app/painel/data/tournament-create-mapper.ts frontend/projects/organizer/src/app/painel/data/team-level-score.ts frontend/projects/organizer/src/app/painel/data/tournament-create.levels.spec.ts frontend/projects/organizer/src/app/painel/data/team-level-score.spec.ts
git commit -m "feat(organizer-web): minLevel no modelo/mapper e pontuação 2–14"
```

---

### Task 9: Wizard do organizador — presets de faixa de nível

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts` (campo "Nível" do builder de categoria, ~linhas 222–226 + handlers ~899–903)
- Modify: `frontend/projects/organizer/src/app/painel/eventos/wizard/criar-liga.component.ts` (mesmo campo — localizar com `grep -n "Nível" criar-liga.component.ts` e aplicar o mesmo padrão)
- Test: `frontend/projects/organizer/src/app/painel/eventos/wizard/novo-evento.component.spec.ts` NÃO cobre isso; a lógica pura (preset→faixa) já está testada na Task 8. Specs de componente novos exigiriam TestBed zoneless — cobrir a lógica via funções puras do model e manter o template fino.

**Interfaces:**
- Consumes: `CATEGORY_LEVEL_PRESETS`, `SKILL_LEVEL_LABEL`, `skillLevelOptionsForSport` (Task 8).
- Produces: UI onde escolher um preset grava `{ minSkillLevel, skillLevel }` no draft; "Personalizado" expõe os dois seletores; categoria reaberta com faixa que não casa com preset cai em "Personalizado".

- [ ] **Step 1: Template**

Substituir o bloco do campo "Nível" (linhas ~222–226) por:

```html
              <div style="margin-top:16px">
                <og-form-field label="Faixa de nível">
                  <og-select-chips [options]="levelPresetOptions" [active]="activeLevelPreset()" (changed)="setCatLevelPreset($event)" />
                </og-form-field>
              </div>
              @if (activeLevelPreset() === 'Personalizado') {
                <div style="margin-top:12px">
                  <og-form-field label="Nível mínimo">
                    <og-select-chips [options]="minSkillOptions()" [active]="minSkillActive()" (changed)="setCatMinSkill($event)" />
                  </og-form-field>
                </div>
                <div style="margin-top:12px">
                  <og-form-field label="Nível máximo">
                    <og-select-chips [options]="skillOptions()" [active]="skillLabel[cat().skillLevel]" (changed)="setCatSkill($event)" />
                  </og-form-field>
                </div>
              }
```

- [ ] **Step 2: Lógica no componente**

Importar `CATEGORY_LEVEL_PRESETS` no import do model. Adicionar (perto de `skillOptions`/`setCatSkill`):

```ts
  private static readonly CUSTOM_PRESET = 'Personalizado';
  protected readonly levelPresetOptions = [
    ...CATEGORY_LEVEL_PRESETS.map((p) => p.label),
    CriarTorneioComponent.CUSTOM_PRESET,
  ];

  /** Preset cujo (min,max) casa com o draft; senão "Personalizado". */
  protected readonly activeLevelPreset = computed(() => {
    const c = this.cat();
    const hit = CATEGORY_LEVEL_PRESETS.find(
      (p) => p.min === c.minSkillLevel && p.max === c.skillLevel,
    );
    return hit?.label ?? CriarTorneioComponent.CUSTOM_PRESET;
  });

  protected setCatLevelPreset(label: string): void {
    const preset = CATEGORY_LEVEL_PRESETS.find((p) => p.label === label);
    // "Personalizado" não regrava nada — só abre os seletores finos.
    if (preset) this.patchCat({ minSkillLevel: preset.min, skillLevel: preset.max });
  }

  private static readonly NO_MIN = 'Sem mínimo';
  protected readonly minSkillOptions = computed(() => [
    CriarTorneioComponent.NO_MIN,
    ...this.skillOptions(),
  ]);
  protected minSkillActive(): string {
    const min = this.cat().minSkillLevel;
    return min ? SKILL_LEVEL_LABEL[min] : CriarTorneioComponent.NO_MIN;
  }
  protected setCatMinSkill(label: string): void {
    if (label === CriarTorneioComponent.NO_MIN) {
      this.patchCat({ minSkillLevel: null });
      return;
    }
    const level = (Object.keys(SKILL_LEVEL_LABEL) as SkillLevel[]).find((s) => SKILL_LEVEL_LABEL[s] === label);
    if (level) this.patchCat({ minSkillLevel: level });
  }
```

(Se o nome real da classe for outro, ajustar as referências `CriarTorneioComponent.`; alternativa: constantes de módulo fora da classe.)

Nota: `activeLevelPreset` prefere o PRIMEIRO preset que casa — `{min:'open', max:'open'}` mostra "Open" e `{min:null, max:'open'}` mostra "Livre"; Elite `{avancado1, open}` nunca colide com Avançado `{avancado1, avancado2}`.

- [ ] **Step 3: Espelhar em criar-liga**

`grep -n "Nível\|setCatSkill\|skillOptions" frontend/projects/organizer/src/app/painel/eventos/wizard/criar-liga.component.ts`, ler a região e aplicar exatamente o mesmo padrão dos Steps 1–2 (mesmos nomes de handlers).

- [ ] **Step 4: Build + testes**

Run: `cd frontend && npx ng build organizer && npx ng test organizer --watch=false`
Expected: build limpo, testes PASS.

QA visual: o portal do organizador NÃO tem dev-auth-bypass — verificação em navegador exige login real; validar via build/testes e revisão de template.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts frontend/projects/organizer/src/app/painel/eventos/wizard/criar-liga.component.ts
git commit -m "feat(organizer-web): presets de faixa de nível no builder de categoria"
```

---

### Task 10: App Flutter — vocabulário de 7 e piso na elegibilidade

**Files:**
- Modify: `nexago_app/lib/features/athlete/domain/athlete_profile_options.dart` (lista de labels linha ~20, `levelRank` ~52, `labelForRank` ~83)
- Modify: `nexago_app/lib/features/athlete/domain/athlete_firestore_codes.dart` (maps label↔código ~66/77)
- Modify: `nexago_app/lib/features/athlete/domain/athlete_sports_levels_labels.dart` (labels curtos ~18)
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_discovery_models.dart` (campo `minLevel` na offer, ~142/175)
- Modify: `nexago_app/lib/features/tournaments/data/tournament_document_mapper.dart` (parse `minLevel`, linhas ~192 e ~251)
- Modify: `nexago_app/lib/features/tournaments/domain/category_level_eligibility.dart` (`_highestRank`, piso, mensagens)
- Test: `nexago_app/test/features/tournaments/category_level_eligibility_test.dart`, `nexago_app/test/features/athlete/athlete_level_display_test.dart`

**Interfaces:**
- Consumes: nada (espelho autônomo do vocabulário).
- Produces: `AthleteProfileOptions.levelRank('avancado_1')==4`, `('open')==6`; `labelForRank(4)=='Avançado 1'`, `(5)=='Avançado 2'`, `(6)=='Open'`; `TournamentCategoryOffer.minLevel: String`; `CategoryLevelEligibility.categoryMinLevelRank(offer)`; `isCategoryEligibleForLevel` respeita a faixa; `blockMinLevelMessage(...)` para o caso piso.

- [ ] **Step 1: Testes que falham**

`category_level_eligibility_test.dart` (seguir os builders do arquivo):

```dart
  test('escada de 7: Avançado rankeia 4/5 e Open 6', () {
    expect(CategoryLevelEligibility.levelRank('avancado_1'), 4);
    expect(CategoryLevelEligibility.levelRank('Avançado 2'), 5);
    expect(CategoryLevelEligibility.levelRank('open'), 6);
    expect(CategoryLevelEligibility.levelRank('livre'), 6);
  });

  test('piso: atleta abaixo do minLevel é barrado, dentro da faixa entra', () {
    final elite = offerWith(level: 'Open', minLevel: 'Avançado 1');
    expect(CategoryLevelEligibility.isCategoryEligibleForLevel(elite, 3), false);
    expect(CategoryLevelEligibility.isCategoryEligibleForLevel(elite, 4), true);
    expect(CategoryLevelEligibility.isCategoryEligibleForLevel(elite, 6), true);
  });

  test('offer sem minLevel se comporta como hoje', () {
    final livre = offerWith(level: 'Open', minLevel: '');
    expect(CategoryLevelEligibility.isCategoryEligibleForLevel(livre, 0), true);
  });
```

(`offerWith` = helper existente do teste, ganhando o parâmetro `minLevel`; se o teste constrói `TournamentCategoryOffer` direto, passar `minLevel:` no construtor.)

`athlete_level_display_test.dart`: `labelForRank(4/5/6)` e `levelRank('Avançado 1')`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/category_level_eligibility_test.dart test/features/athlete/athlete_level_display_test.dart`
Expected: FAIL (campo `minLevel` inexistente não compila / ranks errados).

- [ ] **Step 3: Implementar**

`athlete_profile_options.dart`:
- Lista de labels (linha ~20): inserir `'Avançado 1', 'Avançado 2',` antes de `'Open'`.
- `levelRank`: o normalize já reduz á/é/í mas NÃO o ç — acrescentar `.replaceAll('ç', 'c')` à cadeia; cases novos antes do open:

```dart
      case 'avancado 1':
      case 'avancado_1':
        return 4;
      case 'avancado 2':
      case 'avancado_2':
        return 5;
      case 'open':
      case 'livre':
        return 6;
```

- `labelForRank`: `case 4: return 'Avançado 1'; case 5: return 'Avançado 2'; default: return 'Open';`

`athlete_firestore_codes.dart` (~66/77): `'Avançado 1': 'avancado_1', 'Avançado 2': 'avancado_2'` e o inverso.

`athlete_sports_levels_labels.dart` (~18): `'Avançado 1': 'Av. 1', 'Avançado 2': 'Av. 2',`.

`tournament_discovery_models.dart`: adicionar `final String minLevel;` ao lado de `level` (~175) e `this.minLevel = '',` no construtor (~142).

`tournament_document_mapper.dart` (linhas ~192 e ~251, os DOIS pontos): `minLevel: _str(map['minLevel']) ?? '',`.

`category_level_eligibility.dart`:
- `static const int _highestRank = 6;`
- Novo:

```dart
  /// Rank do piso da categoria; ausente/desconhecido → 0 (sem piso).
  static int categoryMinLevelRank(TournamentCategoryOffer offer) {
    return levelRank(offer.minLevel) ?? 0;
  }
```

- `isCategoryEligibleForLevel`:

```dart
  static bool isCategoryEligibleForLevel(
    TournamentCategoryOffer offer,
    int athleteRank,
  ) {
    return categoryLevelRank(offer) >= athleteRank &&
        athleteRank >= categoryMinLevelRank(offer);
  }
```

- Mensagens do piso:

```dart
  /// Selo do card quando o atleta está abaixo do piso da categoria.
  static String minLevelBadgeLabel() => 'NÍVEL MÍNIMO NÃO ATINGIDO';

  /// Mensagem explicativa quando a categoria exige nível mínimo acima do atleta.
  static String minLevelBlockMessage(
    TournamentCategoryOffer offer,
    AthleteProfile? profile, {
    String? tournamentSport,
  }) {
    final minLabel =
        AthleteProfileOptions.labelForRank(categoryMinLevelRank(offer));
    final rank = athleteLevelRank(profile, tournamentSport: tournamentSport);
    final label = AthleteProfileOptions.labelForRank(rank);
    return 'Esta categoria exige nível mínimo $minLabel. Seu nível atual é $label.';
  }
```

- Atualizar o doc-comment do arquivo (escada de 7, faixa).
- Onde a UI de inscrição usa `blockBadgeLabel`/`blockMessage` (grep `blockBadgeLabel` em `nexago_app/lib`), distinguir: se `categoryLevelRank < athleteRank` → mensagens atuais; senão se `athleteRank < categoryMinLevelRank` → as novas.
- Varredura de enumerações fora do canônico: `grep -rn "intermediario_2\|Intermediário 2" nexago_app/lib --include=*.dart` — qualquer lista hardcoded de níveis que apareça FORA dos arquivos desta task (ex.: `athlete_discover_models.dart`, filtro de nível do ranking) ganha as duas entradas do Avançado no mesmo padrão do arquivo. Barras de nível/chips que derivam da lista de `AthleteProfileOptions` passam a 7 segmentos sozinhas — conferir que nenhum widget fixa `5` como contagem (`grep -rn "length: 5\|= 5;" nexago_app/lib/features/athlete/presentation --include=*.dart | grep -i level`).

- [ ] **Step 4: Rodar e ver passar + suíte de features tocadas**

Run: `cd nexago_app && flutter test test/features/tournaments/ test/features/athlete/`
Expected: PASS (4 testes de nível pré-existentes já vermelhos no CI seguem vermelhos — não são desta feature; NÃO tentar consertá-los aqui, só garantir que nada NOVO quebrou).

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib nexago_app/test
git commit -m "feat(app): escada de 7 degraus e piso de nível na elegibilidade"
```

---

### Task 11: App Flutter — criação de torneio/liga (paridade de opções)

**Files:**
- Modify: `nexago_app/lib/features/organizer/domain/tournament_create/tournament_create_draft.dart` (enum `TournamentSkillLevel`, ~73)
- Modify: `nexago_app/lib/features/organizer/domain/tournament_create/tournament_create_logic.dart` (labels ~195, opções ~204)
- Modify: `nexago_app/lib/features/organizer/data/tournament_create_mapper.dart` e `league_create_mapper.dart` (mapeamento label↔enum — localizar com `grep -n "iniciante1\|Iniciante 1"`)
- Test: teste existente da pasta `tournament_create` (localizar com `ls nexago_app/test/features/organizer/`)

**Interfaces:**
- Consumes: nada.
- Produces: `TournamentSkillLevel.avancado1/.avancado2`; editor do app oferece 7 níveis; mappers serializam "Avançado 1"/"Avançado 2". O app NÃO ganha UI de piso neste ciclo (grava categoria sem `minLevel` — sem piso, retrocompatível); piso é criado pelo portal web.

- [ ] **Step 1: Teste que falha**

No teste da criação (seguir o estilo do arquivo encontrado):

```dart
  test('editor oferece a escada de 7', () {
    final options = skillLevelOptionsForSport(TournamentSport.beachVolleyball);
    expect(options.length, 7);
    expect(skillLevelLabel(TournamentSkillLevel.avancado1), 'Avançado 1');
    expect(skillLevelLabel(TournamentSkillLevel.avancado2), 'Avançado 2');
  });
```

(`skillLevelLabel` = o nome real do resolvedor de label na logic — conferir na região da linha 195.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/organizer/`
Expected: FAIL (enum não compila).

- [ ] **Step 3: Implementar**

Enum (draft ~73): inserir `avancado1, avancado2,` entre `intermediario2` e `open` (ordem do enum = ordem de exibição). Labels (logic ~195): `TournamentSkillLevel.avancado1 => 'Avançado 1', TournamentSkillLevel.avancado2 => 'Avançado 2',`. Opções (~204): lista com os 7. Mappers: adicionar os dois códigos/labels nos mapas de serialização e parse de ambos os arquivos, seguindo o padrão in-file.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd nexago_app && flutter test test/features/organizer/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/organizer nexago_app/test/features/organizer
git commit -m "feat(app): Avançado 1/2 na criação de torneio e liga"
```

---

### Task 12: Documentação de negócio

**Files:**
- Modify: `docs/business-rules/levels.md`
- Modify: `docs/business-rules/categories.md`

**Interfaces:** n/a (docs).

- [ ] **Step 1: levels.md**

- Tabela da escada: 7 linhas (ranks 0–6, Avançado 1=4, Avançado 2=5, Open=6).
- Substituir "O rank 4 não é usado ... nunca renumerar" por: "Ranks 0–6 contíguos. Renumeração ÚNICA (`open` 5→6) feita em 15/08/2026 com a base vazia, antes do primeiro torneio operado; a partir daí a numeração é fixa — nunca renumerar. Migração: `migrateAthleteRatingLevelRanks` recalcula `athleteRatings.levelRank` pelo CÓDIGO."
- Aliases legados: `livre`/`Open / federado` → 6.
- Seção "Elegibilidade de categoria": documentar a faixa — `categories[].minLevel` (label, opcional; ausente = sem piso), regra `minRank <= min(ranks) && max(ranks) <= categoryRank`, piso olha o integrante mais FRACO, teto o mais FORTE.
- Régua de rating: tabela §4.4 do spec (com a nota "estimativa sem histórico; ajustar via `ratingLadders/VOLEI_PRAIA`").

- [ ] **Step 2: categories.md**

Adicionar após "Regras":

```markdown
## Faixa de nível
- `level` é o TETO (label; ausente = Open) e `minLevel` é o PISO (label; ausente = sem piso).
- Um atleta entra se `minLevel <= nível do atleta <= level`; numa dupla o piso vale
  pelo integrante mais fraco e o teto pelo mais forte.
- Presets do wizard: Iniciante (0–1), Intermediário (2–3), Avançado (4–5),
  Open (6), Elite (4–6), Livre (0–6). "Livre" é a categoria aberta a todos —
  não confundir com o degrau Open.
```

- [ ] **Step 3: Commit**

```bash
git add docs/business-rules/levels.md docs/business-rules/categories.md
git commit -m "docs: escada de 7 degraus e faixa de nível nas regras de negócio"
```

---

### Task 13: Verificação final integrada

**Files:** nenhum novo.

- [ ] **Step 1: Suítes completas**

Run (cada uma, conferindo `pwd` dentro do worktree):

```bash
cd functions && npm test
```

```bash
firebase emulators:exec --only firestore "node functions/test/athlete-level-rules.test.mjs"
```

```bash
cd frontend && npx ng test athlete --watch=false && npx ng test organizer --watch=false && npx ng test backoffice --watch=false
```

```bash
cd frontend && npx ng build athlete && npx ng build organizer && npx ng build backoffice
```

```bash
cd nexago_app && flutter analyze && flutter test
```

Expected: tudo verde EXCETO os 4 testes Flutter de nível pré-existentes já vermelhos no CI (conferir que a lista de falhas é exatamente a mesma de antes do plano — `git stash` + rodar + comparar se houver dúvida).

- [ ] **Step 2: Checklist de paridade dos espelhos**

Grep final — todos devem devolver rank 6 para open e 4/5 para avancado:

```bash
grep -n "avancado_1" functions/src/category-level-eligibility.ts frontend/shared/levels/index.ts frontend/projects/athlete/src/app/data/athlete-level.ts nexago_app/lib/features/athlete/domain/athlete_profile_options.dart firestore.rules
```

- [ ] **Step 3: Registrar pendências de rollout (NÃO executar)**

Anotar no PR: ordem de deploy = functions → rules → `migrateAthleteRatingLevelRanks` (dryRun, CONTAR os afetados e abortar se a premissa "base vazia" falhar → real) → portais web → release do app. O piso só deve ser usado em torneio real depois da calibração (plano 2).

---

## Fora deste plano (plano 2 — calibração, spec §4.5)

Escolha obrigatória de nível ao adicionar esporte; janela de correção livre até a primeira inscrição (`sportOnboarding.levelLocked` + exceção nas rules); confirmação de nível na primeira inscrição; promoção pelo organizador pós-torneio (autorização de organizador no `setAthleteLevel`). Nada disso bloqueia este plano; este plano bloqueia o plano 2 (vocabulário).
