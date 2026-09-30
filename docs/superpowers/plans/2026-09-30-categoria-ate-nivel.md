# Categoria "até um nível" — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O organizador escolhe um nível X na faixa de nível da categoria e libera todos os níveis abaixo (faixa Iniciante 1 → X). A categoria pontua no ranking pelo nível real das duplas, com teto no peso da família de X.

**Architecture:** Nenhum campo novo no doc. "Até X" é a faixa `minLevel: "Iniciante 1"` + `level: X` que não bate com nenhum preset fechado. No backend, `presetFromRange` passa a sintetizar o preset `"ate"`, com `measured: true` e `maxWeight` igual à família de X. Toda checagem `key === "livre"` vira `measured`, e o Livre passa a ser o caso "até Open". Painel web e app ganham o chip "Até um nível", com uma segunda linha de chips para os 7 níveis.

**Tech Stack:** Cloud Functions em TypeScript (`node --test` sobre `lib/`), script Node standalone, Angular 20 zoneless (Karma/Jasmine) e Flutter/Riverpod.

**Spec:** `docs/superpowers/specs/2026-09-30-categoria-ate-nivel-design.md`

## Global Constraints

- Worktree: `WT=/Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-details-mobile-optimization-92d782`. Ele fica aninhado dentro do checkout principal, então todo comando começa com `cd $WT/<pasta> &&`. O cwd **não** persiste entre chamadas, e todo `Edit`/`Write` usa caminho absoluto sob `$WT`.
- Strings de UI em português; identificadores de código em inglês.
- Faixa gravada como **labels**: `minLevel: "Iniciante 1"` e `level: "<label de X>"`. Nenhum campo novo na categoria, e o preset nunca é gravado.
- Teto do peso medido por teto X: rank 0–1 → 0.125, 2–3 → 0.25, 4–5 → 0.5, 6 → 1. O piso é sempre 0.125 (`LIVRE_MIN_WEIGHT`).
- Livre (0–6), presets fechados e categorias legadas (sem `minLevel`) mantêm peso, elegibilidade e nome **idênticos**.
- Rótulo do chip: exatamente `Até um nível`. A segunda linha se chama `Até o nível` no web e `ATÉ O NÍVEL` no app.
- Dicas, com texto exato e idêntico no web e no app:
  - X = Iniciante 1: `Só atletas Iniciante 1. Quem está acima não se inscreve.`
  - X = Iniciante 2: `Libera de Iniciante 1 até Iniciante 2. Quem está acima não se inscreve. Mesma regra do preset Iniciante.`
  - X = Open: `Libera todos os níveis (mesma regra do Livre).`
  - demais: `Libera de Iniciante 1 até <label>. Quem está acima não se inscreve.`
- Nome sugerido e tag de uma faixa "até X": `até <label>` (ex.: `Masculino até Intermediário 2`).
- `activeCategoryLevelPreset` (app) **não muda**, porque o editor de liga do app também usa essa função. Nenhuma tela de liga muda.
- `functions/node_modules` é um symlink criado na Task 1. Ele aparece como `??` no git e **nunca** entra em commit: use sempre `git add <arquivos>` explícito, nunca `-A`. Ele é removido na Task 9.
- `dart format` só nos arquivos tocados, nunca numa pasta.
- Todo commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Reabrir uma categoria "até X" já gravada** (web e app): o editor abre com "Até um nível" ativo, o teto marcado e sem o aviso de "Faixa personalizada (legado)". Coberto na Task 6 (web) e na Task 8 (app).
2. **Trocar de categoria no builder web sem fechar a tela:** o modo "até" escolhido numa categoria não pode vazar para a próxima. Coberto na Task 6.
3. **Teto legado (`beginner`/`intermediate`) ao ativar "Até um nível":** o teto vira Open, nunca uma escada sem chip marcado. Coberto na Task 6 (web) e na Task 8 (app).
4. **Carimbo de força gravado acima do teto numa categoria "até X"** (por backfill ou por atleta promovido): a leitura aplica o clamp no teto de X. Coberto na Task 3.
5. **Organizador deixa o nome vazio e salva no app:** o nome gravado diz `até X`. Coberto na Task 8.

---

### Task 1: Preset "até X" e teto do peso medido (functions)

**Files:**
- Modify: `$WT/functions/src/category-field-strength.ts`
- Modify: `$WT/functions/src/category-presets.ts` (arquivo inteiro abaixo)
- Test: `$WT/functions/src/category-field-strength.test.ts`, `$WT/functions/src/category-presets.test.ts`

**Interfaces:**
- Produces:
  - `clampMeasuredWeight(weight: number, maxWeight?: number): number` (default `LIVRE_MAX_WEIGHT`)
  - `weightFromRank(rank: number, maxWeight?: number): number`
  - `fieldStrengthFromTeamRanks(teamRanks: Array<number | null>, maxWeight?: number): FieldStrength | null`
  - `CategoryPresetKey` ganha `"ate"`. `CategoryPreset` ganha `measured: boolean` e `maxWeight: number`.
  - `presetFromRange(0, X)` com X ∈ {0,2,3,4,5} devolve `{key: "ate", label: "Até <label>", minRank: 0, maxRank: X, weight: 0.125, measured: true, maxWeight}`.

- [ ] **Step 0: Dependências do worktree**

```bash
ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/functions/node_modules /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-details-mobile-optimization-92d782/functions/node_modules
```

- [ ] **Step 1: Escrever os testes que falham**

Em `category-field-strength.test.ts`, trocar o import do topo para:

```ts
import {
  clampMeasuredWeight,
  fieldStrengthFromTeamRanks,
  LIVRE_MAX_WEIGHT,
  LIVRE_MIN_WEIGHT,
  teamLevelRank,
  weightFromRank,
} from "./category-field-strength";
```

e acrescentar ao fim do arquivo:

```ts
describe("teto do peso medido (faixa \"até X\", spec 2026-09-30)", () => {
  it("weightFromRank respeita o teto do preset", () => {
    assert.equal(weightFromRank(6, 0.25), 0.25);
    assert.equal(weightFromRank(4, 0.5), 0.5);
    assert.equal(weightFromRank(0, 0.25), 0.125);
  });

  it("clampMeasuredWeight usa piso fixo e o teto do preset", () => {
    assert.equal(clampMeasuredWeight(1, 0.25), 0.25);
    assert.equal(clampMeasuredWeight(0.01, 0.25), LIVRE_MIN_WEIGHT);
    assert.equal(clampMeasuredWeight(5), LIVRE_MAX_WEIGHT);
  });

  it("fieldStrengthFromTeamRanks repassa o teto sem mexer no fieldRank", () => {
    const strength = fieldStrengthFromTeamRanks([6, 6, 3], 0.25);
    assert.ok(strength);
    assert.equal(strength.fieldRank, 5);
    assert.equal(strength.weight, 0.25);
  });
});
```

Em `category-presets.test.ts`, trocar o teste `"faixa fora da tabela não deriva preset"` por:

```ts
  it("faixa fora da tabela sem piso 0 não deriva preset", () => {
    assert.strictEqual(presetFromRange(2, 6), null);
    assert.strictEqual(presetFromRange(1, 3), null);
  });
```

e acrescentar ao fim do arquivo:

```ts
describe("faixa \"até X\" (spec 2026-09-30)", () => {
  it("piso 0 fora da tabela vira preset medido com teto na família de X", () => {
    const casos: Array<[number, string, number]> = [
      [0, "Até Iniciante 1", 0.125],
      [2, "Até Intermediário 1", 0.25],
      [3, "Até Intermediário 2", 0.25],
      [4, "Até Avançado 1", 0.5],
      [5, "Até Avançado 2", 0.5],
    ];
    for (const [maxRank, label, maxWeight] of casos) {
      const preset = presetFromRange(0, maxRank);
      assert.equal(preset?.key, "ate", `0–${maxRank}`);
      assert.equal(preset?.label, label);
      assert.equal(preset?.minRank, 0);
      assert.equal(preset?.maxRank, maxRank);
      assert.equal(preset?.weight, 0.125);
      assert.equal(preset?.measured, true);
      assert.equal(preset?.maxWeight, maxWeight);
    }
  });

  it("0–1 e 0–6 continuam Iniciante e Livre (a tabela exata vence)", () => {
    assert.equal(presetFromRange(0, 1)?.key, "iniciante");
    assert.equal(presetFromRange(0, 1)?.measured, false);
    const livre = presetFromRange(0, 6);
    assert.equal(livre?.key, "livre");
    assert.equal(livre?.measured, true);
    assert.equal(livre?.maxWeight, 1);
  });

  it("presets fechados não são medidos", () => {
    for (const key of ["iniciante", "intermediario", "avancado", "open", "elite"]) {
      assert.equal(CATEGORY_PRESETS.find((p) => p.key === key)?.measured, false, key);
    }
  });

  it("categoryPreset lê a faixa até X dos labels do doc", () => {
    const preset = categoryPreset({level: "Intermediário 2", minLevel: "Iniciante 1"});
    assert.equal(preset?.key, "ate");
    assert.equal(preset?.maxWeight, 0.25);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $WT/functions && npm run build`
Expected: FAIL com `TS2305: Module '"./category-field-strength"' has no exported member 'clampMeasuredWeight'`.

- [ ] **Step 3: Implementar**

Em `category-field-strength.ts`, substituir `weightFromRank` e `fieldStrengthFromTeamRanks` e acrescentar `clampMeasuredWeight` logo abaixo das constantes `LIVRE_*`:

```ts
/**
 * Clamp do peso medido. O piso é fixo; o teto é o do preset — 1 no Livre, a
 * família do nível X numa faixa "até X" (spec 2026-09-30): "até Intermediário 2"
 * nunca passa de 0.25, nem com atleta promovido depois da inscrição.
 */
export function clampMeasuredWeight(
  weight: number,
  maxWeight: number = LIVRE_MAX_WEIGHT,
): number {
  return Math.min(maxWeight, Math.max(LIVRE_MIN_WEIGHT, weight));
}
```

```ts
export function weightFromRank(
  rank: number,
  maxWeight: number = LIVRE_MAX_WEIGHT,
): number {
  if (!Number.isFinite(rank)) return LIVRE_MIN_WEIGHT;
  const step = Math.round(rank);
  const weight = step <= 1 ? 0.125 : step <= 3 ? 0.25 : step <= 5 ? 0.5 : 1;
  return clampMeasuredWeight(weight, maxWeight);
}
```

```ts
export function fieldStrengthFromTeamRanks(
  teamRanks: Array<number | null>,
  maxWeight: number = LIVRE_MAX_WEIGHT,
): FieldStrength | null {
  const known = teamRanks.filter(
    (rank): rank is number => typeof rank === "number" && Number.isFinite(rank),
  );
  if (known.length === 0) return null;
  const fieldRank = known.reduce((sum, rank) => sum + rank, 0) / known.length;
  return {
    fieldRank,
    weight: weightFromRank(fieldRank, maxWeight),
    measuredTeams: known.length,
  };
}
```

Mantenha as docstrings existentes das duas funções. Em `fieldStrengthFromTeamRanks`, acrescente uma linha: "`maxWeight` é o teto do preset (1 no Livre)."

Substituir `category-presets.ts` inteiro por:

```ts
import {levelLabelForRank, levelRank} from "./category-level-eligibility";
import {
  LIVRE_MAX_WEIGHT,
  LIVRE_MIN_WEIGHT,
  weightFromRank,
} from "./category-field-strength";

export type CategoryPresetKey =
  | "iniciante" | "intermediario" | "avancado" | "open" | "elite" | "livre" | "ate";

export interface CategoryPreset {
  key: CategoryPresetKey;
  label: string;
  minRank: number;
  maxRank: number;
  /** Peso no ranking geral (D4 da spec — consumido pela fase 3). Num preset
   *  medido é só o fallback de campo imensurável. */
  weight: number;
  /** Peso vem da força REAL do campo inscrito (Livre e "até X"), não da faixa
   *  declarada — ver `category-field-strength.ts`. */
  measured: boolean;
  /** Teto do peso medido. Nos presets fechados é igual a `weight` e não é lido. */
  maxWeight: number;
}

/**
 * Presets de faixa de nível (spec emendada 18/08). A faixa é regra da
 * plataforma: o wizard só oferece estas 6 (mais o "até X", derivado); o preset
 * NUNCA é gravado no doc — deriva da faixa exata via [presetFromRange], o que
 * torna os pesos da fase 3 à prova de adulteração no cliente.
 */
export const CATEGORY_PRESETS: readonly CategoryPreset[] = [
  {
    key: "iniciante", label: "Iniciante", minRank: 0, maxRank: 1,
    weight: 0.125, measured: false, maxWeight: 0.125,
  },
  {
    key: "intermediario", label: "Intermediário", minRank: 2, maxRank: 3,
    weight: 0.25, measured: false, maxWeight: 0.25,
  },
  {
    key: "avancado", label: "Avançado", minRank: 4, maxRank: 5,
    weight: 0.5, measured: false, maxWeight: 0.5,
  },
  {
    key: "open", label: "Open", minRank: 4, maxRank: 6,
    weight: 1, measured: false, maxWeight: 1,
  },
  {
    key: "elite", label: "Elite", minRank: 6, maxRank: 6,
    weight: 1.2, measured: false, maxWeight: 1.2,
  },
  {
    key: "livre", label: "Livre", minRank: 0, maxRank: 6,
    weight: 0.125, measured: true, maxWeight: LIVRE_MAX_WEIGHT,
  },
];

/** Peso de categoria sem preset (legada/faixa fora da tabela) — emenda 3. */
export const LEGACY_CATEGORY_WEIGHT = 1;

/**
 * Derivação canônica faixa→preset. `minRank === null` (piso ausente no doc)
 * é categoria LEGADA da regra só-teto — nunca um preset, nem o Livre: o
 * Livre grava piso explícito `iniciante_1` justamente para se distinguir.
 * Piso 0 com teto fora da tabela é a faixa "até X" ([upToPreset]).
 */
export function presetFromRange(
  minRank: number | null,
  maxRank: number,
): CategoryPreset | null {
  if (minRank == null) return null;
  const exact = CATEGORY_PRESETS.find(
    (p) => p.minRank === minRank && p.maxRank === maxRank,
  );
  if (exact) return exact;
  if (minRank === 0 && Number.isInteger(maxRank) && maxRank >= 0 && maxRank <= 6) {
    return upToPreset(maxRank);
  }
  return null;
}

/**
 * Faixa "até X" (spec 2026-09-30): piso Iniciante 1 e teto X fora da tabela.
 * Libera todos os níveis abaixo de X, então pesa como o Livre — pela força real
 * do campo — com teto na família de X ("até Intermediário 2" nunca passa de
 * 0.25). O Livre é o caso "até Open" e continua na tabela.
 */
function upToPreset(maxRank: number): CategoryPreset {
  return {
    key: "ate",
    label: `Até ${levelLabelForRank(maxRank)}`,
    minRank: 0,
    maxRank,
    weight: LIVRE_MIN_WEIGHT,
    measured: true,
    maxWeight: weightFromRank(maxRank),
  };
}

/** Preset de um doc de categoria (`level`/`minLevel` guardam labels). */
export function categoryPreset(
  category: Record<string, unknown> | null | undefined,
): CategoryPreset | null {
  if (!category) return null;
  const max = levelRank(category.level);
  if (max == null) return null;
  return presetFromRange(levelRank(category.minLevel), max);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd $WT/functions && npm run build && node --test lib/category-presets.test.js lib/category-field-strength.test.js lib/tournament-ranking.test.js lib/league-ranking.test.js`
Expected: PASS, 0 falhas. O ranking e a liga continuam verdes porque o Livre não mudou.

- [ ] **Step 5: Commit**

```bash
cd $WT && git add functions/src/category-presets.ts functions/src/category-presets.test.ts functions/src/category-field-strength.ts functions/src/category-field-strength.test.ts && git commit -m "feat(functions): preset \"até X\" com peso medido e teto na família do nível

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Carimbo de força na publicação da chave (functions)

**Files:**
- Modify: `$WT/functions/src/category-field-strength-store.ts`
- Modify: `$WT/functions/src/organizer-category-ops.ts` (bloco "Força real do campo", ~:812-853, e imports :101 e :107)
- Test: `$WT/functions/src/organizer-category-ops.field-strength.test.ts`

**Interfaces:**
- Consumes: `categoryPreset`, `CategoryPreset.measured` e `.maxWeight` (Task 1); `fieldStrengthFromTeamRanks(teamRanks, maxWeight)` (Task 1).
- Produces:
  - `measureFieldStrength(db, projectId, params)`, onde `params` ganha `maxWeight?: number`.
  - `measureCategoryFieldStrength(db: Firestore, projectId: string, params: {tournamentId: string; categoryId: string; category: Record<string, unknown> | null | undefined; sportCode: string | null; teams: Map<string, string[]>; source: FieldStrengthSource}): Promise<FieldStrengthStamp | null>`. Devolve `null` para preset não medido ou campo imensurável.

- [ ] **Step 1: Escrever os testes que falham**

Em `organizer-category-ops.field-strength.test.ts`, acrescentar `measureCategoryFieldStrength` ao import de `./category-field-strength-store` e colocar no fim do arquivo:

```ts
describe("carimbo da faixa \"até X\" na geração da chave (spec 2026-09-30)", () => {
  function seedRanks(db: FakeFirestore, ranks: Record<string, number>): void {
    for (const [uid, rank] of Object.entries(ranks)) {
      db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/${uid}_VOLEI_PRAIA`, {
        levelRank: rank,
      });
    }
  }

  const docs = [
    {data: () => ({teamId: "tA", isPaid: true, participantUids: ["a1", "a2"]})},
    {data: () => ({teamId: "tB", isPaid: true, participantUids: ["b1", "b2"]})},
  ];

  function measure(db: FakeFirestore, category: Record<string, unknown>) {
    return measureCategoryFieldStrength(db as never, PROJECT, {
      tournamentId: "T1",
      categoryId: "C1",
      category,
      sportCode: tournamentSportToLevelSportCode("beachVolleyball"),
      teams: paidTeamsWithParticipants(docs),
      source: "bracket",
    });
  }

  it("até Intermediário 2 é medida e o carimbo respeita o teto 0.25", async () => {
    const db = new FakeFirestore();
    // Atletas promovidos depois da inscrição: o campo mede Open (6), mas a
    // categoria só vai até Intermediário 2 — o teto segura o peso.
    seedRanks(db, {a1: 6, a2: 6, b1: 6, b2: 5});
    const stamp = await measure(db, {level: "Intermediário 2", minLevel: "Iniciante 1"});
    assert.ok(stamp);
    assert.equal(stamp.presetKey, "ate");
    assert.equal(stamp.fieldRank, 6);
    assert.equal(stamp.weight, 0.25);
  });

  it("Livre segue medido com teto 1", async () => {
    const db = new FakeFirestore();
    seedRanks(db, {a1: 6, b1: 6});
    const stamp = await measure(db, {level: "Open", minLevel: "Iniciante 1"});
    assert.ok(stamp);
    assert.equal(stamp.presetKey, "livre");
    assert.equal(stamp.weight, 1);
  });

  it("faixa fechada não mede (peso declarado, sem carimbo)", async () => {
    const db = new FakeFirestore();
    seedRanks(db, {a1: 6, b1: 6});
    const stamp = await measure(db, {level: "Intermediário 2", minLevel: "Intermediário 1"});
    assert.equal(stamp, null);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $WT/functions && npm run build`
Expected: FAIL com `TS2305: ... has no exported member 'measureCategoryFieldStrength'`.

- [ ] **Step 3: Implementar**

Em `category-field-strength-store.ts`:

1. Acrescentar o import `import {categoryPreset} from "./category-presets";`.
2. Em `measureFieldStrength`, acrescentar ao tipo de `params`, logo abaixo de `presetKey: string;`:

```ts
    /** Teto do peso medido (1 no Livre; família de X no "até X"). */
    maxWeight?: number;
```

e trocar `const strength = fieldStrengthFromTeamRanks(teamRanks);` por:

```ts
  const strength = fieldStrengthFromTeamRanks(teamRanks, params.maxWeight);
```

3. Acrescentar logo abaixo de `measureFieldStrength`:

```ts
/**
 * Mede a força do campo de uma categoria de peso MEDIDO — Livre ou "até X"
 * (spec 2026-09-30) — com o teto do preset. `null` para faixa fechada/legada
 * (peso declarado, nada a carimbar) ou campo imensurável. A publicação da chave
 * chama só isto: a decisão "mede ou não" mora aqui, não na fiação.
 */
export async function measureCategoryFieldStrength(
  db: Firestore,
  projectId: string,
  params: {
    tournamentId: string;
    categoryId: string;
    category: Record<string, unknown> | null | undefined;
    sportCode: string | null;
    teams: Map<string, string[]>;
    source: FieldStrengthSource;
  },
): Promise<FieldStrengthStamp | null> {
  const preset = categoryPreset(params.category);
  if (!preset?.measured) return null;
  return measureFieldStrength(db, projectId, {
    tournamentId: params.tournamentId,
    categoryId: params.categoryId,
    presetKey: preset.key,
    maxWeight: preset.maxWeight,
    sportCode: params.sportCode,
    teams: params.teams,
    source: params.source,
  });
}
```

Em `organizer-category-ops.ts`, trocar o miolo do `try` do bloco "Força real do campo" por:

```ts
  // Força real do campo (spec 2026-09-10). Livre e "até X" (spec 2026-09-30)
  // pesam 0.125 pela faixa DECLARADA, o que pune um campo forte. O peso medido
  // é carimbado aqui, no mesmo batch da chave, porque é aqui que o elenco
  // congela: a partir de `bracketStatus` a substituição de atleta já é bloqueada.
  try {
    const strength = await measureCategoryFieldStrength(db, projectId, {
      tournamentId,
      categoryId,
      category: categoryMeta,
      sportCode: tournamentSportToLevelSportCode(tournamentData.sport),
      // DIVERGÊNCIA DELIBERADA: mede com a mesma definição de "dupla paga"
      // de `loadPaidTeamIds`/`bracketSizeFactor` (sem excluir `partnerPending`),
      // e NÃO com o conjunto de duplas da CHAVE (acima, :206-218), que exclui
      // reserva solo com parceiro pendente só para a semeadura visual. Manter
      // a medida alinhada ao denominador de `bracketSizeFactor` (que também
      // não exclui `partnerPending`) é o que importa aqui; efeito colateral:
      // uma reserva solo contribui o degrau do seu único integrante como se
      // fosse uma dupla inteira.
      teams: paidTeamsWithParticipants(inscriptionsSnap.docs),
      source: "bracket",
    });
    // Campo imensurável NÃO é carimbado: um zero congelaria o pior caso para
    // sempre. Sem carimbo, a premiação mede de novo (caminho preguiçoso).
    // Cobertura insuficiente (`shouldStampFieldStrength`) também não carimba,
    // pelo mesmo motivo — os dois caminhos de carimbo têm de concordar.
    if (strength && shouldStampFieldStrength(strength)) {
      batch.set(
        db.doc(
          `${fieldStrengthPath(projectId)}/${fieldStrengthDocId(tournamentId, categoryId)}`,
        ),
        fieldStrengthStampPayload(strength),
      );
    }
  } catch (e) {
```

O `catch` e o que vem depois ficam como estão. Nos imports, remover a linha `import {categoryPreset} from "./category-presets";` (:101) e, na lista importada de `./category-field-strength-store`, trocar `measureFieldStrength,` por `measureCategoryFieldStrength,`. Antes de remover, confirme com `grep -n "categoryPreset\|measureFieldStrength" $WT/functions/src/organizer-category-ops.ts` que não sobrou outro uso. O `noUnusedLocals` do tsconfig recusa import órfão.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd $WT/functions && npm run build && node --test lib/organizer-category-ops.field-strength.test.js lib/category-field-strength-store.test.js lib/organizer-category-ops.round-robin-wiring.test.js lib/koc-plan-wiring.test.js`
Expected: PASS, 0 falhas.

- [ ] **Step 5: Commit**

```bash
cd $WT && git add functions/src/category-field-strength-store.ts functions/src/organizer-category-ops.ts functions/src/organizer-category-ops.field-strength.test.ts && git commit -m "feat(functions): chave carimba a força do campo também na faixa \"até X\"

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Premiação do ranking geral e trava da liga (functions)

**Files:**
- Modify: `$WT/functions/src/tournament-ranking.ts` (imports :28 e :32, `resolveLivreWeight` ~:360-420, chamador ~:509-521)
- Modify: `$WT/functions/src/league-ranking.ts` (~:695-702)
- Test: `$WT/functions/src/tournament-ranking.test.ts`, `$WT/functions/src/league-ranking.test.ts`

**Interfaces:**
- Consumes: `CategoryPreset` (com `measured`/`maxWeight`), `clampMeasuredWeight` (Task 1) e `measureFieldStrength(..., {maxWeight})` (Task 2).
- Produces: nada consumido por outras tasks. `resolveLivreWeight` vira a função privada `resolveMeasuredWeight`.

- [ ] **Step 1: Escrever os testes que falham**

Em `tournament-ranking.test.ts`, dentro de `describe("peso do Livre pela força real do campo", ...)`, trocar a assinatura e o seed do torneio de `livreDb` por:

```ts
  function livreDb(
    teamRanks: number[],
    category: Record<string, unknown> = {level: "Open", minLevel: "Iniciante 1"},
  ): FakeFirestore {
    const db = new FakeFirestore();
    db.seedDoc("tournaments/T1", {
      sport: "beachVolleyball",
      rankingEnabled: true,
      categories: [{id: "C1", ...category}],
    });
```

O resto do corpo continua igual. Ainda dentro desse `describe`, depois do último `it`, acrescentar:

```ts
  const ATE_INTERMEDIARIO_2 = {level: "Intermediário 2", minLevel: "Iniciante 1"};
  const STAMP_PATH = `artifacts/${PROJECT}/public/data/tournamentCategoryFieldStrength/T1_C1`;

  it("até Intermediário 2 com campo forte fica no teto 0.25 (campeão 250)", async () => {
    // Campo acima do teto só acontece com atleta promovido depois da inscrição
    // (levelRank só sobe) — exatamente o caso que o teto existe para segurar.
    const db = livreDb(JHON_JHON_RANKS, ATE_INTERMEDIARIO_2);
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());

    const champion = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`);
    assert.equal(champion?.pointsEarned, 250);
    const stamp = db.store.get(STAMP_PATH);
    assert.equal(stamp?.presetKey, "ate");
    assert.equal(stamp?.weight, 0.25);
  });

  it("até Intermediário 2 com campo de iniciantes paga 0.125 (campeão 125)", async () => {
    const db = livreDb([0, 1, 1, 0, 0, 1, 0, 0, 1, 0], ATE_INTERMEDIARIO_2);
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());

    const champion = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`);
    assert.equal(champion?.pointsEarned, 125);
  });

  it("carimbo acima do teto numa faixa até X é clampado na leitura", async () => {
    const db = livreDb(JHON_JHON_RANKS, ATE_INTERMEDIARIO_2);
    db.seedDoc(STAMP_PATH, {
      tournamentId: "T1", categoryId: "C1", presetKey: "ate",
      fieldRank: 6, weight: 1, measuredTeams: 10, totalPaidTeams: 10, source: "bracket",
    });
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());

    const champion = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`);
    assert.equal(champion?.pointsEarned, 250);
  });

  it("campo imensurável numa faixa até X cai no peso declarado 0.125 e não carimba", async () => {
    const db = livreDb(JHON_JHON_RANKS, ATE_INTERMEDIARIO_2);
    for (const key of [...db.store.keys()]) {
      if (key.includes("/athleteRatings/")) db.store.delete(key);
    }
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());

    const champion = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`);
    assert.equal(champion?.pointsEarned, 125);
    assert.equal(db.store.has(STAMP_PATH), false);
  });
```

Em `league-ranking.test.ts`, dentro de `describe("tryAwardLeagueStagePointsForMatch — bucket groups por preset", ...)`, depois do teste do Livre:

```ts
  it("faixa até X também não concede groups (libera os níveis abaixo, como o Livre)", async () => {
    const fake = leagueSeededDb({level: "Intermediário 2", minLevel: "Iniciante 1"});
    const result = await tryAwardLeagueStagePointsForMatch(
      fake as never,
      PROJECT,
      finalMatch(),
    );

    assert.equal(
      fake.store.get(`artifacts/${PROJECT}/public/data/leagueTeamRankings/L1_C1_tC`),
      undefined,
    );
    assert.equal(result.teamsUpdated, 2);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $WT/functions && npm run build && node --test lib/tournament-ranking.test.js lib/league-ranking.test.js`
Expected: FAIL. O campeão sai com 125 em vez de 250, porque o "ate" ainda cai no peso declarado. O carimbo não existe. Na liga, `tC` recebe participação.

- [ ] **Step 3: Implementar**

Em `tournament-ranking.ts`:

1. Trocar `import {LIVRE_MIN_WEIGHT, LIVRE_MAX_WEIGHT} from "./category-field-strength";` por `import {clampMeasuredWeight} from "./category-field-strength";`.
2. Trocar `import {categoryPreset, LEGACY_CATEGORY_WEIGHT} from "./category-presets";` por:

```ts
import {
  categoryPreset,
  LEGACY_CATEGORY_WEIGHT,
  type CategoryPreset,
} from "./category-presets";
```

3. Renomear `resolveLivreWeight` para `resolveMeasuredWeight` e trocar a docstring, a assinatura e o começo do corpo, até `if (!measured) return ...;`, por:

```ts
/**
 * Peso de uma categoria de peso MEDIDO — Livre ou "até X" (spec 2026-09-30).
 * Ordem: carimbo gravado (o normal, feito na publicação da chave) → medição na
 * hora + carimbo `lazy` (chave publicada antes do deploy) → peso declarado
 * (campo imensurável, e aí NÃO carimba, para que uma medição futura ainda possa
 * acontecer). O teto é o do preset: 1 no Livre, a família de X no "até X".
 */
async function resolveMeasuredWeight(
  db: Firestore,
  projectId: string,
  params: {
    tournamentId: string;
    categoryId: string;
    preset: CategoryPreset;
    sportCode: string | null;
    paidTeams: Map<string, string[]>;
  },
): Promise<number> {
  const stamped = await readFieldStrengthStamp(
    db,
    projectId,
    params.tournamentId,
    params.categoryId,
  );
  // Piso/teto de novo na leitura: o backfill (tasks futuras) escreve estes
  // docs, e um bug lá não pode escapar sem clamp e amplificar a premiação.
  if (stamped) {
    return clampMeasuredWeight(stamped.weight, params.preset.maxWeight);
  }

  const measured = await measureFieldStrength(db, projectId, {
    tournamentId: params.tournamentId,
    categoryId: params.categoryId,
    presetKey: params.preset.key,
    maxWeight: params.preset.maxWeight,
    sportCode: params.sportCode,
    teams: params.paidTeams,
    source: "lazy",
  });
  if (!measured) return params.preset.weight;
```

Daí para baixo o corpo não muda (carimbo `lazy` com `shouldStampFieldStrength` e o `return measured.weight`).

4. No chamador, trocar o bloco `let presetWeight = ...` até o `}` do `if` por:

```ts
  // Peso do preset. Livre e "até X" são a exceção: a faixa declarada dá 0.125
  // pelo PISO, o que pune um campo forte, então o peso vem da força REAL medida
  // (com teto no preset) — carimbada na publicação da chave, ou medida aqui e
  // carimbada se faltar.
  let presetWeight = preset?.weight ?? LEGACY_CATEGORY_WEIGHT;
  if (preset?.measured) {
    presetWeight = await resolveMeasuredWeight(db, projectId, {
      tournamentId,
      categoryId,
      preset,
      sportCode: tournamentSportToLevelSportCode(tournament.sport),
      paidTeams,
    });
  }
```

Em `league-ranking.ts`, trocar o comentário e o `if` da participação por:

```ts
    // O ranking de LIGA mantém o Livre — e o "até X", que libera os níveis
    // abaixo como ele (spec 2026-09-30) — sem participação de propósito: a spec
    // 2026-09-10 mudou só o ranking GERAL, onde o peso agora é medido. Aqui o
    // peso segue vindo da faixa declarada, então a trava anti-farm continua
    // sendo a única defesa. Não "corrigir" para casar com o motor geral.
    const preset = categoryPreset(findCategory(tournament as never, categoryId));
    if (!preset?.measured) {
      teamsUpdated += await tryAwardGroupsPlacements(db, projectId, baseParams);
    }
```

- [ ] **Step 4: Rodar e ver passar (e a suíte inteira)**

Run: `cd $WT/functions && npm run build && node --test lib/tournament-ranking.test.js lib/league-ranking.test.js`
Expected: PASS, 0 falhas.

Run: `cd $WT/functions && npm test`
Expected: PASS, 0 falhas. Isso inclui `test/ranking-recompute.test.mjs`, que ainda não foi tocado e continua verde.

- [ ] **Step 5: Commit**

```bash
cd $WT && git add functions/src/tournament-ranking.ts functions/src/tournament-ranking.test.ts functions/src/league-ranking.ts functions/src/league-ranking.test.ts && git commit -m "feat(functions): premiação mede a faixa \"até X\" com teto; liga trava participação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Espelho no script de histórico

**Files:**
- Modify: `$WT/functions/scripts/lib/ranking-recompute.js` (`CATEGORY_PRESETS` ~:121, `presetWeightForCategory` ~:158, `weightFromRank`/`fieldStrengthFromTeamRanks` ~:247-266, `module.exports` ~:354)
- Modify: `$WT/functions/scripts/recompute-ranking-weights.js` (imports ~:110-127, resolução do peso ~:242-296, `measureLivreFieldStrength` ~:401, retorno do `contextFor` ~:298-316, relatório ~:1003)
- Test: `$WT/functions/test/ranking-recompute.test.mjs`

**Interfaces:**
- Consumes: a regra da Task 1, copiada literalmente (o script é standalone e não importa `lib/` compilado).
- Produces: `presetWeightForCategory(category)` devolve `{weight, presetKey, inferred, measured, maxWeight} | null`. A lib exporta também `clampMeasuredWeight`.

- [ ] **Step 1: Escrever os testes que falham**

Em `test/ranking-recompute.test.mjs`, acrescentar `clampMeasuredWeight,` à lista do `require('../scripts/lib/ranking-recompute.js')`. Depois do `describe('presetWeightForCategory — categoria LEGADA ...')`, acrescentar:

```js
describe('presetWeightForCategory — faixa "até X" (paridade com category-presets.ts, spec 2026-09-30)', () => {
  test('piso Iniciante 1 fora da tabela é medido, com teto na família do teto', () => {
    const casos = [
      ['Iniciante 1', 0.125],
      ['Intermediário 1', 0.25],
      ['Intermediário 2', 0.25],
      ['Avançado 1', 0.5],
      ['Avançado 2', 0.5],
    ];
    for (const [teto, maxWeight] of casos) {
      const got = presetWeightForCategory({ minLevel: 'Iniciante 1', level: teto });
      assert.equal(got.presetKey, 'ate', teto);
      assert.equal(got.weight, 0.125);
      assert.equal(got.measured, true);
      assert.equal(got.maxWeight, maxWeight);
      assert.equal(got.inferred, false);
    }
  });

  test('Livre segue medido com teto 1; fechados e legados não são medidos', () => {
    const livre = presetWeightForCategory({ minLevel: 'Iniciante 1', level: 'Open' });
    assert.equal(livre.measured, true);
    assert.equal(livre.maxWeight, 1);
    const inter = presetWeightForCategory({ minLevel: 'Intermediário 1', level: 'Intermediário 2' });
    assert.equal(inter.measured, false);
    const legado = presetWeightForCategory({ level: 'Open' });
    assert.equal(legado.measured, false);
    const foraDaTabela = presetWeightForCategory({ minLevel: 'Intermediário 1', level: 'Avançado 2' });
    assert.equal(foraDaTabela.measured, false);
  });
});
```

Dentro de `describe('paridade da força do campo ...')`, acrescentar:

```js
  test('teto do peso medido (faixa "até X")', () => {
    assert.equal(weightFromRank(6, 0.25), 0.25);
    assert.equal(clampMeasuredWeight(1, 0.25), 0.25);
    assert.equal(clampMeasuredWeight(0.01, 0.25), 0.125);
    assert.equal(fieldStrengthFromTeamRanks([6, 6, 3], 0.25).weight, 0.25);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $WT/functions && node --test test/ranking-recompute.test.mjs`
Expected: FAIL. `clampMeasuredWeight is not a function`, e `presetKey` vem `null` em vez de `'ate'`.

- [ ] **Step 3: Implementar a lib**

Em `scripts/lib/ranking-recompute.js`:

1. Trocar `CATEGORY_PRESETS` por (com números literais, porque as constantes `LIVRE_*` são declaradas mais abaixo no arquivo):

```js
/** Cópia de `CATEGORY_PRESETS` (faixa fechada + peso no ranking geral + medição). */
const CATEGORY_PRESETS = [
  {key: "iniciante", minRank: 0, maxRank: 1, weight: 0.125, measured: false, maxWeight: 0.125},
  {key: "intermediario", minRank: 2, maxRank: 3, weight: 0.25, measured: false, maxWeight: 0.25},
  {key: "avancado", minRank: 4, maxRank: 5, weight: 0.5, measured: false, maxWeight: 0.5},
  {key: "open", minRank: 4, maxRank: 6, weight: 1, measured: false, maxWeight: 1},
  {key: "elite", minRank: 6, maxRank: 6, weight: 1.2, measured: false, maxWeight: 1.2},
  {key: "livre", minRank: 0, maxRank: 6, weight: 0.125, measured: true, maxWeight: 1},
];
```

2. Em `presetWeightForCategory`, trocar o bloco `if (minRank != null) { ... }` e o retorno do legado por:

```js
  const minRank = levelRank(category.minLevel);
  if (minRank != null) {
    // Categoria da fase 2 em diante: faixa exata → preset canônico.
    const preset = CATEGORY_PRESETS.find(
      (p) => p.minRank === minRank && p.maxRank === maxRank,
    );
    if (preset) {
      return {
        weight: preset.weight,
        presetKey: preset.key,
        inferred: false,
        measured: preset.measured,
        maxWeight: preset.maxWeight,
      };
    }
    // Faixa "até X" (spec 2026-09-30) — cópia de `upToPreset` em
    // functions/src/category-presets.ts: medida como o Livre, teto na família de X.
    if (minRank === 0) {
      return {
        weight: LIVRE_MIN_WEIGHT,
        presetKey: "ate",
        inferred: false,
        measured: true,
        maxWeight: weightFromRank(maxRank),
      };
    }
    return {
      weight: LEGACY_CATEGORY_WEIGHT,
      presetKey: null,
      inferred: false,
      measured: false,
      maxWeight: LEGACY_CATEGORY_WEIGHT,
    };
  }

  // Categoria legada (regra só-teto) ou piso irreconhecível: infere pelo teto.
  const preset = presetByKey(INFERRED_PRESET_BY_TOP_RANK[maxRank]);
  if (!preset) return null;
  return {
    weight: preset.weight,
    presetKey: preset.key,
    inferred: true,
    measured: preset.measured,
    maxWeight: preset.maxWeight,
  };
```

Atualize também o `@returns` da docstring para `{{weight: number, presetKey: string|null, inferred: boolean, measured: boolean, maxWeight: number}|null}`. Uma nota: `LIVRE_MIN_WEIGHT` e `weightFromRank` são usados aqui só no momento da chamada, quando o módulo já terminou de avaliar, então a ordem de declaração no arquivo não importa.

3. Trocar `weightFromRank` e `fieldStrengthFromTeamRanks` por, e acrescentar `clampMeasuredWeight` antes delas:

```js
/** Cópia de `clampMeasuredWeight`: piso fixo, teto do preset (1 no Livre). */
function clampMeasuredWeight(weight, maxWeight = LIVRE_MAX_WEIGHT) {
  return Math.min(maxWeight, Math.max(LIVRE_MIN_WEIGHT, weight));
}

/** Degrau médio → peso, ancorado na escada de presets fechados (Math.round). */
function weightFromRank(rank, maxWeight = LIVRE_MAX_WEIGHT) {
  if (!Number.isFinite(rank)) return LIVRE_MIN_WEIGHT;
  const step = Math.round(rank);
  const weight = step <= 1 ? 0.125 : step <= 3 ? 0.25 : step <= 5 ? 0.5 : 1;
  return clampMeasuredWeight(weight, maxWeight);
}

/** Média dos degraus das duplas mensuráveis; null quando nenhuma é. */
function fieldStrengthFromTeamRanks(teamRanks, maxWeight = LIVRE_MAX_WEIGHT) {
  const known = teamRanks.filter(
    (rank) => typeof rank === "number" && Number.isFinite(rank),
  );
  if (known.length === 0) return null;
  const fieldRank = known.reduce((sum, rank) => sum + rank, 0) / known.length;
  return {
    fieldRank,
    weight: weightFromRank(fieldRank, maxWeight),
    measuredTeams: known.length,
  };
}
```

4. Em `module.exports`, acrescentar `clampMeasuredWeight,` ao lado de `weightFromRank,`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd $WT/functions && node --test test/ranking-recompute.test.mjs`
Expected: PASS, 0 falhas.

- [ ] **Step 5: Ajustar a casca do script**

Em `scripts/recompute-ranking-weights.js`:

1. Na lista de `require("./lib/ranking-recompute")`, trocar as duas linhas `LIVRE_MIN_WEIGHT,` e `LIVRE_MAX_WEIGHT,` por `clampMeasuredWeight,`.
2. No bloco de resolução do peso (~:249), fazer quatro trocas:
   - `if (peso.presetKey === "livre") {` passa a ser `if (peso.measured) {`
   - `weight = Math.min(LIVRE_MAX_WEIGHT, Math.max(LIVRE_MIN_WEIGHT, stamp.weight));` passa a ser `weight = clampMeasuredWeight(stamp.weight, peso.maxWeight);`
   - `const strength = await measureLivreFieldStrength(tournament, paidTeamsMap);` passa a ser `const strength = await measureCategoryFieldStrength(tournament, paidTeamsMap, peso.maxWeight);`
   - no `stampCandidate`, `presetKey: "livre",` passa a ser `presetKey: peso.presetKey,`

   Acrescentar uma linha ao comentário que abre o bloco: `// Vale para o Livre e para a faixa "até X" (spec 2026-09-30), com o teto do preset.`
3. No objeto devolvido com `ok: true` (~:298), acrescentar `measured: peso.measured,` logo abaixo de `inferred: peso.inferred,`.
4. Trocar a função `measureLivreFieldStrength` por:

```js
/** Força do campo de uma categoria medida (Livre ou "até X"); null quando não dá para medir. */
async function measureCategoryFieldStrength(tournament, paidTeams, maxWeight) {
  const sportCode = tournamentSportToLevelSportCode(tournament.sport);
  if (!sportCode || paidTeams.size === 0) return null;

  const ranks = await loadAthleteLevelRanks(
    [...paidTeams.values()].flat(),
    sportCode,
  );
  const teamRanks = [...paidTeams.values()].map((uids) =>
    teamLevelRank(uids.map((uid) => (ranks.has(uid) ? ranks.get(uid) : null))),
  );
  return fieldStrengthFromTeamRanks(teamRanks, maxWeight);
}
```

5. No relatório (~:1003), trocar `if (ctx.presetKey === "livre") {` por `if (ctx.measured) {`.
6. **Não** mexer em `if (!ctx.ok || ctx.presetKey !== "livre") continue;` dentro de `criarParticipacaoFaltanteDoLivre`. Acrescentar acima dela:

```js
    // Só o Livre: a passada recria a participação que a ANTIGA exceção do Livre
    // nunca gravou. A faixa "até X" (spec 2026-09-30) nasceu depois dela.
```

- [ ] **Step 6: Conferir a casca**

Run: `cd $WT/functions && node --check scripts/recompute-ranking-weights.js && grep -n 'LIVRE_\|"livre"\|measureLivre' scripts/recompute-ranking-weights.js`
Expected: `node --check` sem saída. O grep só pode listar comentários e a linha `ctx.presetKey !== "livre"` da passada de participação.

Run: `cd $WT/functions && npm test`
Expected: PASS, 0 falhas.

- [ ] **Step 7: Commit**

```bash
cd $WT && git add functions/scripts/lib/ranking-recompute.js functions/scripts/recompute-ranking-weights.js functions/test/ranking-recompute.test.mjs && git commit -m "feat(functions): script de recálculo espelha a faixa \"até X\"

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Modelo do painel web (detecção, dica, nome e tags)

**Files:**
- Modify: `$WT/frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts` (`skillLevelOptionsForSport` ~:396, depois de `CATEGORY_LEVEL_PRESETS` ~:423, `suggestCategoryName` e `categoryTags` ~:486-525)
- Create: `$WT/frontend/projects/organizer/src/app/painel/data/tournament-create.up-to-level.spec.ts`

**Interfaces:**
- Produces:
  - `SKILL_LEVEL_LADDER: readonly SkillLevel[]` (os 7 degraus em ordem)
  - `LEVEL_UP_TO_CHIP_LABEL = 'Até um nível'`
  - `categoryUpToLevel(category: Pick<TournamentCategoryDraft, 'minSkillLevel' | 'skillLevel'>): SkillLevel | null`
  - `upToLevelHint(level: SkillLevel): string`

- [ ] **Step 1: Escrever o spec que falha**

Criar `tournament-create.up-to-level.spec.ts`:

```ts
import {
  SKILL_LEVEL_LADDER,
  categoryTags,
  categoryUpToLevel,
  emptyCategoryDraft,
  emptyTournamentDraft,
  suggestCategoryName,
  upToLevelHint,
  type SkillLevel,
} from './tournament-create.model';
import { categoryFromMap, categoryToMap } from './tournament-create-mapper';

/** Faixa "até X" — piso Iniciante 1, teto X (spec 2026-09-30). */
function upTo(max: SkillLevel) {
  return { ...emptyCategoryDraft('c1'), minSkillLevel: 'iniciante1' as const, skillLevel: max };
}

describe('categoryUpToLevel — faixa "até X"', () => {
  it('reconhece piso Iniciante 1 com teto fora dos presets', () => {
    const tetos: SkillLevel[] = ['iniciante1', 'intermediario1', 'intermediario2', 'avancado1', 'avancado2'];
    for (const max of tetos) {
      expect(categoryUpToLevel(upTo(max))).withContext(max).toBe(max);
    }
  });

  it('0–1 e 0–6 são os presets Iniciante e Livre, não "até"', () => {
    expect(categoryUpToLevel(upTo('iniciante2'))).toBeNull();
    expect(categoryUpToLevel(upTo('open'))).toBeNull();
  });

  it('outro piso, piso ausente e teto legado não são "até"', () => {
    expect(categoryUpToLevel({ minSkillLevel: 'intermediario1', skillLevel: 'avancado2' })).toBeNull();
    expect(categoryUpToLevel({ minSkillLevel: null, skillLevel: 'intermediario2' })).toBeNull();
    expect(categoryUpToLevel({ minSkillLevel: 'iniciante1', skillLevel: 'beginner' })).toBeNull();
  });

  it('a escada é a de 7 níveis, em ordem crescente', () => {
    expect([...SKILL_LEVEL_LADDER]).toEqual([
      'iniciante1', 'iniciante2', 'intermediario1', 'intermediario2', 'avancado1', 'avancado2', 'open',
    ]);
  });
});

describe('nome e tags da faixa "até X"', () => {
  it('nome sugerido diz "até" o teto', () => {
    expect(suggestCategoryName(upTo('intermediario2'))).toBe('Masculino até Intermediário 2');
  });

  it('tag diz "até" o teto, sem "mín."', () => {
    const tags = categoryTags(upTo('avancado1'));
    expect(tags).toContain('até Avançado 1');
    expect(tags.some((t) => t.startsWith('mín.'))).toBeFalse();
  });

  it('presets com piso Iniciante 1 mantêm o nome de hoje', () => {
    expect(suggestCategoryName(upTo('open'))).toBe('Masculino');
    expect(suggestCategoryName(upTo('iniciante2'))).toBe('Masculino Iniciante 2');
  });
});

describe('upToLevelHint', () => {
  it('explica o que a escolha libera', () => {
    expect(upToLevelHint('iniciante1')).toBe('Só atletas Iniciante 1. Quem está acima não se inscreve.');
    expect(upToLevelHint('iniciante2')).toBe(
      'Libera de Iniciante 1 até Iniciante 2. Quem está acima não se inscreve. Mesma regra do preset Iniciante.',
    );
    expect(upToLevelHint('intermediario2')).toBe(
      'Libera de Iniciante 1 até Intermediário 2. Quem está acima não se inscreve.',
    );
    expect(upToLevelHint('open')).toBe('Libera todos os níveis (mesma regra do Livre).');
  });
});

describe('persistência da faixa "até X"', () => {
  it('grava piso Iniciante 1 e teto X como labels e reabre igual', () => {
    const map = categoryToMap(upTo('intermediario2'), emptyTournamentDraft());
    expect(map['minLevel']).toBe('Iniciante 1');
    expect(map['level']).toBe('Intermediário 2');
    const back = categoryFromMap(map)!;
    expect(categoryUpToLevel(back)).toBe('intermediario2');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $WT/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/tournament-create.up-to-level.spec.ts'`
Expected: FAIL na compilação, com `has no exported member 'SKILL_LEVEL_LADDER'` (e os outros três símbolos novos).

- [ ] **Step 3: Implementar**

Em `tournament-create.model.ts`:

1. Trocar a docstring e o corpo de `skillLevelOptionsForSport` por:

```ts
/** Escada única de 7 níveis (ordem crescente) para categorias novas de TODOS os
 *  esportes — também é a linha "Até o nível" do editor (spec 2026-09-30).
 *  Os membros legados de `SkillLevel` (`beginner`/`intermediate`) seguem no
 *  tipo só pra reabrir categorias antigas — o editor não os oferece mais. */
export const SKILL_LEVEL_LADDER: readonly SkillLevel[] = [
  'iniciante1', 'iniciante2', 'intermediario1', 'intermediario2', 'avancado1', 'avancado2', 'open',
];

export function skillLevelOptionsForSport(sport: TournamentSport): SkillLevel[] {
  return [...SKILL_LEVEL_LADDER];
}
```

2. Logo depois de `CATEGORY_LEVEL_PRESETS`, acrescentar:

```ts
/** Chip que abre a escolha de teto "até um nível" (spec 2026-09-30). */
export const LEVEL_UP_TO_CHIP_LABEL = 'Até um nível';

/** Teto X de uma faixa "até X": piso Iniciante 1 e teto na escada de 7, fora dos
 *  presets. 0–1 e 0–6 devolvem `null` — são os presets Iniciante e Livre, mesma
 *  regra. O backend deriva o peso da mesma faixa (`presetFromRange` → "ate"). */
export function categoryUpToLevel(
  category: Pick<TournamentCategoryDraft, 'minSkillLevel' | 'skillLevel'>,
): SkillLevel | null {
  if (category.minSkillLevel !== 'iniciante1') return null;
  if (!SKILL_LEVEL_LADDER.includes(category.skillLevel)) return null;
  const isPreset = CATEGORY_LEVEL_PRESETS.some(
    (p) => p.min === category.minSkillLevel && p.max === category.skillLevel,
  );
  return isPreset ? null : category.skillLevel;
}

/** Dica sob a linha "Até o nível" — mesmo texto do app (`categoryLevelUpToHint`). */
export function upToLevelHint(level: SkillLevel): string {
  if (level === 'iniciante1') return 'Só atletas Iniciante 1. Quem está acima não se inscreve.';
  if (level === 'open') return 'Libera todos os níveis (mesma regra do Livre).';
  const base = `Libera de Iniciante 1 até ${SKILL_LEVEL_LABEL[level]}. Quem está acima não se inscreve.`;
  return level === 'iniciante2' ? `${base} Mesma regra do preset Iniciante.` : base;
}
```

3. Em `suggestCategoryName`, trocar a linha `if (category.minSkillLevel != null && category.minSkillLevel === category.skillLevel) {` por:

```ts
  const upTo = categoryUpToLevel(category);
  if (upTo) {
    // Faixa "até X": sem o "até" o nome ficaria igual ao de uma categoria só daquele nível.
    parts.push(`até ${SKILL_LEVEL_LABEL[upTo]}`);
  } else if (category.minSkillLevel != null && category.minSkillLevel === category.skillLevel) {
```

4. Em `categoryTags`, fazer a mesma troca, usando `tags.push` no lugar de `parts.push`:

```ts
  const upTo = categoryUpToLevel(category);
  if (upTo) {
    // Faixa "até X": sem o "até" a tag ficaria igual à de uma categoria só daquele nível.
    tags.push(`até ${SKILL_LEVEL_LABEL[upTo]}`);
  } else if (category.minSkillLevel != null && category.minSkillLevel === category.skillLevel) {
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd $WT/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/tournament-create.up-to-level.spec.ts' --include='**/tournament-create.levels.spec.ts'`
Expected: PASS. A contagem de specs tem de incluir os 9 `it` do arquivo novo. Se a contagem não subir, o Karma está rodando a árvore errada; veja as Global Constraints.

- [ ] **Step 5: Commit**

```bash
cd $WT && git add frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts frontend/projects/organizer/src/app/painel/data/tournament-create.up-to-level.spec.ts && git commit -m "feat(organizer): modelo da faixa \"até X\" — detecção, dica, nome e tags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Editor de categoria do painel web

**Files:**
- Modify: `$WT/frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts` (import do model :16-61, template "Faixa de nível" :230-240, membros ~:812-827, `openCategoriaBuilder` ~:1144, `setCatLevelPreset` ~:1027)
- Create: `$WT/frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.level-up-to.spec.ts`

**Interfaces:**
- Consumes: `SKILL_LEVEL_LADDER`, `LEVEL_UP_TO_CHIP_LABEL`, `categoryUpToLevel` e `upToLevelHint` (Task 5).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Escrever o spec que falha**

Criar `criar-torneio.level-up-to.spec.ts`:

```ts
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BR_STATES, BrLocationsService } from '@nexago/br-locations';
import { AuthService } from '../../../auth/auth.service';
import {
  emptyCategoryDraft,
  emptyTournamentDraft,
  type TournamentCategoryDraft,
} from '../../data/tournament-create.model';
import { CriarTorneioComponent } from './criar-torneio.component';

/** Faixa "até um nível" no editor de categoria (spec 2026-09-30). Os testes olham o que o
 *  organizador vê — chips marcados e a escada aberta — e a faixa que vai ser gravada. */
describe('CriarTorneioComponent · faixa "até um nível"', () => {
  let fixture: ComponentFixture<CriarTorneioComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CriarTorneioComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: () => null } },
        { provide: BrLocationsService, useValue: { states: BR_STATES, loaded: () => true, citiesFor: () => [] } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CriarTorneioComponent);
  });

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function openBuilder(categories: TournamentCategoryDraft[], id: string | null): Promise<void> {
    const component = fixture.componentInstance;
    component['draft'].set({ ...emptyTournamentDraft(), categories });
    component['openCategoriaBuilder'](id);
    await render();
  }

  function chips(fieldLabel: string): HTMLElement[] {
    const field = (fixture.nativeElement as HTMLElement).querySelector(`og-form-field[label="${fieldLabel}"]`);
    return field ? [...field.querySelectorAll<HTMLElement>('.og-select-chip')] : [];
  }

  function activeChip(fieldLabel: string): string | undefined {
    return chips(fieldLabel).find((c) => c.classList.contains('active'))?.textContent?.trim();
  }

  async function tap(fieldLabel: string, text: string): Promise<void> {
    const chip = chips(fieldLabel).find((c) => c.textContent?.trim() === text);
    expect(chip).withContext(`chip "${text}" em "${fieldLabel}"`).toBeDefined();
    chip!.click();
    await render();
  }

  const cat = () => fixture.componentInstance['cat']();
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('categoria nova (Livre) não mostra a escada "Até o nível"', async () => {
    await openBuilder([], null);
    expect(activeChip('Faixa de nível')).toBe('Livre');
    expect(chips('Até o nível').length).toBe(0);
  });

  it('"Até um nível" abre a escada e o teto escolhido grava Iniciante 1 → X', async () => {
    await openBuilder([], null);
    await tap('Faixa de nível', 'Até um nível');
    expect(chips('Até o nível').length).toBe(7);

    await tap('Até o nível', 'Intermediário 2');
    expect(cat().minSkillLevel).toBe('iniciante1');
    expect(cat().skillLevel).toBe('intermediario2');
    expect(activeChip('Faixa de nível')).toBe('Até um nível');
    expect(text()).toContain('Libera de Iniciante 1 até Intermediário 2.');
  });

  it('Iniciante 2 ou Open na escada não fazem o chip pular para Iniciante/Livre', async () => {
    await openBuilder([], null);
    await tap('Faixa de nível', 'Até um nível');

    await tap('Até o nível', 'Iniciante 2');
    expect(activeChip('Faixa de nível')).toBe('Até um nível');
    expect(text()).toContain('Mesma regra do preset Iniciante');

    await tap('Até o nível', 'Open');
    expect(activeChip('Faixa de nível')).toBe('Até um nível');
    expect(text()).toContain('mesma regra do Livre');
  });

  it('voltar a um preset fecha a escada', async () => {
    await openBuilder([], null);
    await tap('Faixa de nível', 'Até um nível');
    await tap('Faixa de nível', 'Intermediário');
    expect(chips('Até o nível').length).toBe(0);
    expect(cat().minSkillLevel).toBe('intermediario1');
    expect(cat().skillLevel).toBe('intermediario2');
  });

  it('reabre categoria "até" já gravada com a escada aberta e o teto marcado', async () => {
    const saved = { ...emptyCategoryDraft('c1'), minSkillLevel: 'iniciante1' as const, skillLevel: 'avancado1' as const };
    await openBuilder([saved], 'c1');
    expect(activeChip('Faixa de nível')).toBe('Até um nível');
    expect(activeChip('Até o nível')).toBe('Avançado 1');
    expect(text()).not.toContain('Faixa personalizada');
  });

  it('o modo "até" de uma categoria não vaza para a próxima', async () => {
    await openBuilder([], null);
    await tap('Faixa de nível', 'Até um nível');
    // 0–6: a faixa é a do Livre, o modo só existe no estado local do editor.
    await tap('Até o nível', 'Open');

    fixture.componentInstance['openCategoriaBuilder'](null);
    await render();
    expect(activeChip('Faixa de nível')).toBe('Livre');
    expect(chips('Até o nível').length).toBe(0);
  });

  it('teto legado vira Open ao ativar "Até um nível"', async () => {
    const legacy = { ...emptyCategoryDraft('c1'), minSkillLevel: null, skillLevel: 'beginner' as const };
    await openBuilder([legacy], 'c1');
    expect(text()).toContain('Faixa personalizada (legado)');

    await tap('Faixa de nível', 'Até um nível');
    expect(cat().skillLevel).toBe('open');
    expect(activeChip('Até o nível')).toBe('Open');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $WT/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/criar-torneio.level-up-to.spec.ts'`
Expected: FAIL. "chip "Até um nível" em "Faixa de nível"" aparece como `undefined`, porque o chip ainda não existe. O primeiro teste pode passar.

- [ ] **Step 3: Implementar**

Em `criar-torneio.component.ts`:

1. No import de `'../../data/tournament-create.model'`, acrescentar `LEVEL_UP_TO_CHIP_LABEL`, `SKILL_LEVEL_LADDER`, `categoryUpToLevel` e `upToLevelHint`.
2. No template, trocar o bloco `<div style="margin-top:16px">` da "Faixa de nível", até o `</div>` correspondente, por:

```html
              <div style="margin-top:16px">
                <og-form-field label="Faixa de nível">
                  <og-select-chips [options]="levelChipOptions" [active]="levelChipActive()" (changed)="setCatLevelPreset($event)" />
                </og-form-field>
                @if (levelUpToActive()) {
                  <div style="margin-top:12px">
                    <og-form-field label="Até o nível">
                      <og-select-chips [options]="upToLevelOptions" [active]="skillLabel[cat().skillLevel]" (changed)="setCatUpToLevel($event)" />
                    </og-form-field>
                    <p class="og-wizard-hint">{{ upToLevelHint(cat().skillLevel) }}</p>
                  </div>
                }
                @if (cat().minSkillLevel != null && cat().minSkillLevel !== 'iniciante1') {
                  <p class="og-wizard-hint">Piso de nível: atletas sem nível declarado não conseguem se inscrever nesta categoria.</p>
                }
                @if (activeLevelPreset() === null && !levelUpToActive()) {
                  <p class="og-wizard-hint">Faixa personalizada (legado): {{ levelRangeLabel() }} — escolha um preset para alterar.</p>
                }
              </div>
```

3. Trocar `protected readonly levelPresetOptions = CATEGORY_LEVEL_PRESETS.map((p) => p.label);` por:

```ts
  protected readonly levelChipOptions = [...CATEGORY_LEVEL_PRESETS.map((p) => p.label), LEVEL_UP_TO_CHIP_LABEL];
  protected readonly upToLevelOptions = SKILL_LEVEL_LADDER.map((level) => SKILL_LEVEL_LABEL[level]);
  protected readonly upToLevelHint = upToLevelHint;

  /** "Até um nível" escolhido nesta edição; `null` = deriva da faixa gravada. Sem isso,
   *  escolher Iniciante 2 ou Open na escada faria o chip pular para Iniciante/Livre no
   *  meio da edição — as faixas 0–1 e 0–6 são esses presets. */
  private readonly levelUpToChoice = signal<boolean | null>(null);

  protected readonly levelUpToActive = computed(
    () => this.levelUpToChoice() ?? categoryUpToLevel(this.cat()) !== null,
  );

  protected readonly levelChipActive = computed(() =>
    this.levelUpToActive() ? LEVEL_UP_TO_CHIP_LABEL : (this.activeLevelPreset() ?? ''),
  );
```

`levelChipActive` lê `activeLevelPreset`, que é declarado logo abaixo. Como `computed` é preguiçoso, a ordem de declaração dos campos não importa.

4. Trocar `setCatLevelPreset` por, e acrescentar `setCatUpToLevel` logo abaixo:

```ts
  protected setCatLevelPreset(label: string): void {
    if (label === LEVEL_UP_TO_CHIP_LABEL) {
      // Mantém o teto atual; teto legado (fora da escada de 7) vira Open.
      const current = this.cat().skillLevel;
      const max = SKILL_LEVEL_LADDER.includes(current) ? current : 'open';
      this.levelUpToChoice.set(true);
      this.patchCat({ minSkillLevel: 'iniciante1', skillLevel: max });
      return;
    }
    const preset = CATEGORY_LEVEL_PRESETS.find((p) => p.label === label);
    if (!preset) return;
    this.levelUpToChoice.set(false);
    this.patchCat({ minSkillLevel: preset.min, skillLevel: preset.max });
  }

  protected setCatUpToLevel(label: string): void {
    const level = SKILL_LEVEL_LADDER.find((l) => SKILL_LEVEL_LABEL[l] === label);
    if (level) this.patchCat({ minSkillLevel: 'iniciante1', skillLevel: level });
  }
```

5. Em `openCategoriaBuilder`, acrescentar como primeira linha do corpo:

```ts
    // Cada categoria reabre pelo que está gravado — o modo "até" da anterior não vaza.
    this.levelUpToChoice.set(null);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd $WT/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless --include='**/criar-torneio.level-up-to.spec.ts' --include='**/criar-torneio.location.spec.ts' --include='**/tournament-create.*.spec.ts'`
Expected: PASS, 0 falhas. Os 7 `it` novos têm de aparecer na contagem.

- [ ] **Step 5: Build de produção**

Run: `cd $WT/frontend && npx ng build organizer --configuration production`
Expected: sucesso, e o `Output location:` contém `worktrees/`. O `ng test` não aplica budgets, então só este passo prova que o build está verde.

- [ ] **Step 6: QA visual (rota temporária)**

O portal do organizador não tem bypass de login. A receita é uma rota `__qa` temporária.

Criar `$WT/frontend/projects/organizer/src/app/painel/eventos/wizard/__qa-faixa-nivel.component.ts`:

```ts
import { AfterViewInit, ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import { CriarTorneioComponent } from './criar-torneio.component';

/** TEMPORÁRIO — QA visual da faixa "até um nível". Apagar junto com a rota. */
@Component({
  selector: 'og-qa-faixa-nivel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CriarTorneioComponent],
  template: `<og-criar-torneio />`,
})
export class QaFaixaNivelComponent implements AfterViewInit {
  private readonly wizard = viewChild.required(CriarTorneioComponent);

  ngAfterViewInit(): void {
    this.wizard()['openCategoriaBuilder'](null);
  }
}
```

Em `$WT/frontend/projects/organizer/src/app/app.routes.ts`, acrescentar como **primeiro** item do array `routes`:

```ts
  {
    path: '__qa-faixa-nivel',
    loadComponent: () =>
      import('./painel/eventos/wizard/__qa-faixa-nivel.component').then((m) => m.QaFaixaNivelComponent),
  },
```

Depois:
- `preview_start` com `{name: "organizer-live"}` (porta 4311) e navegar até `http://localhost:4311/__qa-faixa-nivel`.
- Tirar um screenshot. Clicar em "Até um nível" e tirar outro. Clicar em "Intermediário 2" e tirar mais um. Leia o resultado sempre pelo screenshot depois de cada clique, porque o browser pane não entrega animation frames.
- `resize_window` com `preset: "mobile"`, recarregar a página e repetir. Os 7 chips da escada têm de quebrar linha sem rolagem horizontal da página.
- `resize_window` com `preset: "desktop"` ao terminar.

Por fim, apagar o componente e a rota:

```bash
cd $WT && rm frontend/projects/organizer/src/app/painel/eventos/wizard/__qa-faixa-nivel.component.ts && git checkout -- frontend/projects/organizer/src/app/app.routes.ts && git status --short
```

Expected: o `git status` lista só `criar-torneio.component.ts` e o spec novo. Nenhum `__qa` e nenhum `app.routes.ts`.

- [ ] **Step 7: Commit**

```bash
cd $WT && git add frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.level-up-to.spec.ts && git commit -m "feat(organizer): chip \"Até um nível\" na faixa de nível da categoria

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Lógica do app (Flutter)

**Files:**
- Modify: `$WT/nexago_app/lib/features/organizer/domain/tournament_create/tournament_create_logic.dart` (`skillLevelOptionsForSport` ~:208-220, depois de `activeCategoryLevelPreset` ~:281, `_categoryLevelNamePart` ~:302-322)
- Test: `$WT/nexago_app/test/features/organizer/tournament_create_logic_test.dart`

**Interfaces:**
- Produces:
  - `const categoryLevelLadder = <TournamentSkillLevel>[...]` (os 7 degraus)
  - `const categoryLevelUpToChipLabel = 'Até um nível'`
  - `TournamentSkillLevel? categoryLevelUpToCeiling(TournamentCategoryDraft draft)`
  - `String categoryLevelUpToHint(TournamentSkillLevel ceiling)`

- [ ] **Step 0: Dependências do worktree**

Run: `cd $WT/nexago_app && flutter pub get`
Expected: `Got dependencies!`. Se aparecer `Changing current working directory to: /Users/silviodionizio/Documents/projects/volley/nexago/nexago_app`, o flutter subiu para o checkout principal. Nesse caso, pare e confira o cwd.

- [ ] **Step 1: Escrever os testes que falham**

Em `tournament_create_logic_test.dart`, acrescentar dentro de `main()`, depois do grupo `'activeCategoryLevelPreset'`:

```dart
  group('categoryLevelUpToCeiling — faixa "até X" (spec 2026-09-30)', () {
    TournamentCategoryDraft upTo(TournamentSkillLevel max) =>
        TournamentCategoryDraft(id: 'c1', minLevel: 'Iniciante 1', skillLevel: max);

    test('reconhece piso Iniciante 1 com teto fora dos presets', () {
      for (final max in const [
        TournamentSkillLevel.iniciante1,
        TournamentSkillLevel.intermediario1,
        TournamentSkillLevel.intermediario2,
        TournamentSkillLevel.avancado1,
        TournamentSkillLevel.avancado2,
      ]) {
        expect(categoryLevelUpToCeiling(upTo(max)), max, reason: max.name);
      }
    });

    test('Iniciante 1–Iniciante 2 e Iniciante 1–Open são presets, não "até"', () {
      expect(categoryLevelUpToCeiling(upTo(TournamentSkillLevel.iniciante2)), isNull);
      expect(categoryLevelUpToCeiling(upTo(TournamentSkillLevel.open)), isNull);
    });

    test('outro piso, piso vazio e teto legado não são "até"', () {
      expect(
        categoryLevelUpToCeiling(
          const TournamentCategoryDraft(
            id: 'c1',
            minLevel: 'Intermediário 1',
            skillLevel: TournamentSkillLevel.avancado2,
          ),
        ),
        isNull,
      );
      expect(
        categoryLevelUpToCeiling(
          const TournamentCategoryDraft(
            id: 'c1',
            skillLevel: TournamentSkillLevel.intermediario2,
          ),
        ),
        isNull,
      );
      expect(categoryLevelUpToCeiling(upTo(TournamentSkillLevel.beginner)), isNull);
    });

    test('nome e tags dizem "até" o teto', () {
      final category = upTo(TournamentSkillLevel.intermediario2);
      expect(suggestCategoryName(category), 'Masculino até Intermediário 2');
      expect(categoryTags(category), contains('até Intermediário 2'));
    });

    test('activeCategoryLevelPreset não muda (o editor de liga depende dela)', () {
      expect(activeCategoryLevelPreset(upTo(TournamentSkillLevel.intermediario2)), isNull);
    });

    test('a escada é a de 7 níveis, em ordem', () {
      expect(categoryLevelLadder, const [
        TournamentSkillLevel.iniciante1,
        TournamentSkillLevel.iniciante2,
        TournamentSkillLevel.intermediario1,
        TournamentSkillLevel.intermediario2,
        TournamentSkillLevel.avancado1,
        TournamentSkillLevel.avancado2,
        TournamentSkillLevel.open,
      ]);
    });

    test('dica explica o que a escolha libera (mesmo texto do portal)', () {
      expect(
        categoryLevelUpToHint(TournamentSkillLevel.iniciante1),
        'Só atletas Iniciante 1. Quem está acima não se inscreve.',
      );
      expect(
        categoryLevelUpToHint(TournamentSkillLevel.iniciante2),
        'Libera de Iniciante 1 até Iniciante 2. Quem está acima não se inscreve. '
        'Mesma regra do preset Iniciante.',
      );
      expect(
        categoryLevelUpToHint(TournamentSkillLevel.intermediario2),
        'Libera de Iniciante 1 até Intermediário 2. Quem está acima não se inscreve.',
      );
      expect(
        categoryLevelUpToHint(TournamentSkillLevel.open),
        'Libera todos os níveis (mesma regra do Livre).',
      );
    });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $WT/nexago_app && flutter test test/features/organizer/tournament_create_logic_test.dart`
Expected: FAIL na compilação, com `Method not found: 'categoryLevelUpToCeiling'`.

- [ ] **Step 3: Implementar**

Em `tournament_create_logic.dart`:

1. Trocar a declaração de `skillLevelOptionsForSport` e a docstring dela por:

```dart
/// Escada única de 7 níveis (ordem crescente) para categorias novas de TODOS
/// os esportes — também é a linha "ATÉ O NÍVEL" do editor (spec 2026-09-30).
/// Categorias antigas com `Iniciante`/`Intermediário` continuam válidas
/// (ranks unificados no backend); o editor apenas deixa de oferecê-las.
const categoryLevelLadder = <TournamentSkillLevel>[
  TournamentSkillLevel.iniciante1,
  TournamentSkillLevel.iniciante2,
  TournamentSkillLevel.intermediario1,
  TournamentSkillLevel.intermediario2,
  TournamentSkillLevel.avancado1,
  TournamentSkillLevel.avancado2,
  TournamentSkillLevel.open,
];

List<TournamentSkillLevel> skillLevelOptionsForSport(TournamentSport sport) =>
    categoryLevelLadder;
```

2. Depois de `activeCategoryLevelPreset`, acrescentar:

```dart
/// Chip que abre a escolha de teto "até um nível" (spec 2026-09-30).
const categoryLevelUpToChipLabel = 'Até um nível';

/// Teto X de uma faixa "até X": piso Iniciante 1 e teto na escada de 7, fora
/// dos presets. Iniciante 1–Iniciante 2 e Iniciante 1–Open devolvem null — são
/// os presets Iniciante e Livre, mesma regra. Paridade com `categoryUpToLevel`
/// do portal; o backend deriva o peso da mesma faixa (`presetFromRange`).
TournamentSkillLevel? categoryLevelUpToCeiling(TournamentCategoryDraft draft) {
  if (draft.minLevel != 'Iniciante 1') return null;
  if (!categoryLevelLadder.contains(draft.skillLevel)) return null;
  if (activeCategoryLevelPreset(draft) != null) return null;
  return draft.skillLevel;
}

/// Dica sob a linha "ATÉ O NÍVEL" — mesmo texto do portal (`upToLevelHint`).
String categoryLevelUpToHint(TournamentSkillLevel ceiling) => switch (ceiling) {
  TournamentSkillLevel.iniciante1 =>
    'Só atletas Iniciante 1. Quem está acima não se inscreve.',
  TournamentSkillLevel.open => 'Libera todos os níveis (mesma regra do Livre).',
  TournamentSkillLevel.iniciante2 =>
    'Libera de Iniciante 1 até Iniciante 2. Quem está acima não se inscreve. '
        'Mesma regra do preset Iniciante.',
  _ =>
    'Libera de Iniciante 1 até ${skillLevelLabel(ceiling)}. '
        'Quem está acima não se inscreve.',
};
```

3. Em `_categoryLevelNamePart`, acrescentar como primeiras linhas do corpo:

```dart
  final upTo = categoryLevelUpToCeiling(category);
  if (upTo != null) return 'até ${skillLevelLabel(upTo)}';
```

Na docstring da função, acrescentar: "Faixa "até X" (spec 2026-09-30) vira `até <nível>`: sem o "até" ficaria igual a uma categoria só daquele nível."

- [ ] **Step 4: Rodar e ver passar**

Run: `cd $WT/nexago_app && dart format lib/features/organizer/domain/tournament_create/tournament_create_logic.dart test/features/organizer/tournament_create_logic_test.dart && flutter test test/features/organizer/tournament_create_logic_test.dart test/features/organizer/league_create_logic_test.dart test/features/organizer/league_stage_create_logic_test.dart`
Expected: PASS, 0 falhas. A liga reusa `categoryLevelPresets` e `activeCategoryLevelPreset`, e tem de continuar verde.

- [ ] **Step 5: Commit**

```bash
cd $WT && git add nexago_app/lib/features/organizer/domain/tournament_create/tournament_create_logic.dart nexago_app/test/features/organizer/tournament_create_logic_test.dart && git commit -m "feat(app): lógica da faixa \"até X\" no wizard de torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Editor de categoria do app (Flutter)

**Files:**
- Modify: `$WT/nexago_app/lib/features/organizer/presentation/tournament_create/sheets/tournament_category_editor_sheet.dart` (state ~:38, bloco "FAIXA DE NÍVEL" ~:198-229)
- Create: `$WT/nexago_app/test/features/organizer/tournament_category_editor_sheet_test.dart`

**Interfaces:**
- Consumes: `categoryLevelLadder`, `categoryLevelUpToChipLabel`, `categoryLevelUpToCeiling`, `categoryLevelUpToHint` (Task 7); `skillLevelLabel` (existente).
- Produces: `Key('category-level-preset-selector')` e `Key('category-level-up-to-selector')` nos dois `OrganizerChipSelector`.

- [ ] **Step 1: Escrever o widget test que falha**

Criar `tournament_category_editor_sheet_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_providers.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/sheets/tournament_category_editor_sheet.dart';

/// Faixa "até um nível" no editor de categoria do app (spec 2026-09-30).
void main() {
  late ProviderContainer container;

  const presets = 'category-level-preset-selector';
  const upTo = 'category-level-up-to-selector';
  const legacyHint =
      'Faixa personalizada (legado) — escolha um preset para alterar.';

  // Pumps controlados (<400ms de relógio) para o timer de persistência do
  // wizard nunca disparar dentro do teste (tocaria FirebaseAuth).
  Future<void> pumpSheet(
    WidgetTester tester, {
    TournamentCategoryDraft? existing,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.dark,
          home: Consumer(
            builder: (context, ref, _) {
              container = ProviderScope.containerOf(context);
              return Scaffold(
                body: Center(
                  child: FilledButton(
                    onPressed: () => showTournamentCategoryEditorSheet(
                      context,
                      ref,
                      existing: existing,
                    ),
                    child: const Text('abrir'),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
    if (existing != null) {
      container
          .read(tournamentCreateWizardProvider.notifier)
          .addCategory(existing);
    }
    await tester.tap(find.text('abrir'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  Finder chip(String selectorKey, String label) => find.descendant(
    of: find.byKey(Key(selectorKey)),
    matching: find.text(label),
  );

  Future<void> tapVisible(WidgetTester tester, Finder target) async {
    await tester.ensureVisible(target);
    await tester.pump();
    await tester.tap(target);
    await tester.pump();
  }

  Future<void> tearDownSheet(WidgetTester tester) async {
    // Limpa o timer de persistência antes do teardown.
    await tester.pumpWidget(const SizedBox());
  }

  testWidgets('categoria nova (Livre) não mostra a escada', (tester) async {
    await pumpSheet(tester);
    expect(find.byKey(const Key(upTo)), findsNothing);
    await tearDownSheet(tester);
  });

  testWidgets(
    '"Até um nível" + Intermediário 2 grava Iniciante 1 → Intermediário 2 com nome "até"',
    (tester) async {
      await pumpSheet(tester);
      await tapVisible(tester, chip(presets, 'Até um nível'));
      expect(find.byKey(const Key(upTo)), findsOneWidget);

      await tapVisible(tester, chip(upTo, 'Intermediário 2'));
      await tapVisible(tester, find.text('Salvar categoria'));
      await tester.pump(const Duration(milliseconds: 300));

      final saved = container
          .read(tournamentCreateDraftProvider)
          .categories
          .single;
      expect(saved.minLevel, 'Iniciante 1');
      expect(saved.skillLevel, TournamentSkillLevel.intermediario2);
      expect(saved.name, 'Masculino até Intermediário 2');
      await tearDownSheet(tester);
    },
  );

  testWidgets('Open na escada não faz o chip pular para Livre', (tester) async {
    await pumpSheet(tester);
    await tapVisible(tester, chip(presets, 'Até um nível'));
    await tapVisible(tester, chip(upTo, 'Open'));
    expect(find.byKey(const Key(upTo)), findsOneWidget);
    expect(
      find.text('Libera todos os níveis (mesma regra do Livre).'),
      findsOneWidget,
    );
    await tearDownSheet(tester);
  });

  testWidgets('voltar a um preset fecha a escada', (tester) async {
    await pumpSheet(tester);
    await tapVisible(tester, chip(presets, 'Até um nível'));
    await tapVisible(tester, chip(presets, 'Intermediário'));
    expect(find.byKey(const Key(upTo)), findsNothing);
    await tearDownSheet(tester);
  });

  testWidgets('reabre categoria "até" gravada com a escada aberta', (
    tester,
  ) async {
    await pumpSheet(
      tester,
      existing: const TournamentCategoryDraft(
        id: 'c1',
        minLevel: 'Iniciante 1',
        skillLevel: TournamentSkillLevel.avancado1,
      ),
    );
    expect(find.byKey(const Key(upTo)), findsOneWidget);
    expect(find.text(legacyHint), findsNothing);
    expect(
      find.text(
        'Libera de Iniciante 1 até Avançado 1. Quem está acima não se inscreve.',
      ),
      findsOneWidget,
    );
    await tearDownSheet(tester);
  });

  testWidgets('teto legado vira Open ao ativar "Até um nível"', (tester) async {
    await pumpSheet(
      tester,
      existing: const TournamentCategoryDraft(
        id: 'c1',
        skillLevel: TournamentSkillLevel.beginner,
      ),
    );
    expect(find.text(legacyHint), findsOneWidget);

    await tapVisible(tester, chip(presets, 'Até um nível'));
    expect(
      find.text('Libera todos os níveis (mesma regra do Livre).'),
      findsOneWidget,
    );
    expect(find.text(legacyHint), findsNothing);
    await tearDownSheet(tester);
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd $WT/nexago_app && flutter test test/features/organizer/tournament_category_editor_sheet_test.dart`
Expected: FAIL. O `find.byKey` do seletor de presets não acha nada, e `ensureVisible` falha com "Bad state: No element".

- [ ] **Step 3: Implementar**

Em `tournament_category_editor_sheet.dart`:

1. Em `_CategoryEditorSheetState`, logo abaixo de `late TournamentCategoryDraft _category;`:

```dart
  /// "Até um nível" escolhido nesta edição; null = deriva da faixa gravada.
  /// Sem isso, escolher Iniciante 2 ou Open na escada faria o chip pular para
  /// Iniciante/Livre no meio da edição (0–1 e 0–6 são esses presets).
  bool? _levelUpToChoice;

  bool get _levelUpToActive =>
      _levelUpToChoice ?? categoryLevelUpToCeiling(_category) != null;

  void _selectLevelChip(String? label) {
    if (label == categoryLevelUpToChipLabel) {
      // Mantém o teto atual; teto legado (fora da escada de 7) vira Open.
      final max = categoryLevelLadder.contains(_category.skillLevel)
          ? _category.skillLevel
          : TournamentSkillLevel.open;
      setState(() {
        _levelUpToChoice = true;
        _category = _category.copyWith(skillLevel: max, minLevel: 'Iniciante 1');
      });
      return;
    }
    final preset = categoryLevelPresets.firstWhere((p) => p.label == label);
    setState(() {
      _levelUpToChoice = false;
      _category = _category.copyWith(
        skillLevel: preset.maxSkillLevel,
        minLevel: preset.minLevel,
      );
    });
  }
```

2. Trocar o bloco que vai de `OrganizerChipSelector<String?>(` da faixa de nível até o fim do `if (activeCategoryLevelPreset(_category) == null) ...[ ... ],` por:

```dart
                OrganizerChipSelector<String?>(
                  key: const Key('category-level-preset-selector'),
                  horizontalScroll: true,
                  options: [
                    for (final preset in categoryLevelPresets) preset.label,
                    categoryLevelUpToChipLabel,
                  ],
                  selected: _levelUpToActive
                      ? categoryLevelUpToChipLabel
                      : activeCategoryLevelPreset(_category),
                  labelBuilder: (label) => label ?? '',
                  onSelected: _selectLevelChip,
                ),
                if (_levelUpToActive) ...[
                  const SizedBox(height: 12),
                  const OrganizerSectionLabel('ATÉ O NÍVEL'),
                  const SizedBox(height: 8),
                  OrganizerChipSelector<TournamentSkillLevel>(
                    key: const Key('category-level-up-to-selector'),
                    horizontalScroll: true,
                    options: categoryLevelLadder,
                    selected: _category.skillLevel,
                    labelBuilder: skillLevelLabel,
                    onSelected: (level) => setState(
                      () => _category = _category.copyWith(
                        skillLevel: level,
                        minLevel: 'Iniciante 1',
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    categoryLevelUpToHint(_category.skillLevel),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ],
                if (activeCategoryLevelPreset(_category) == null &&
                    !_levelUpToActive) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Faixa personalizada (legado) — escolha um preset para '
                    'alterar.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ],
```

As linhas `const OrganizerSectionLabel('FAIXA DE NÍVEL'),` e `const SizedBox(height: 8),` acima do seletor continuam como estão.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd $WT/nexago_app && dart format lib/features/organizer/presentation/tournament_create/sheets/tournament_category_editor_sheet.dart test/features/organizer/tournament_category_editor_sheet_test.dart && flutter test test/features/organizer/tournament_category_editor_sheet_test.dart test/features/organizer/tournament_create_logic_test.dart`
Expected: PASS, 0 falhas.

Run: `cd $WT/nexago_app && flutter analyze lib/features/organizer test/features/organizer`
Expected: nenhum aviso nos dois arquivos desta task. Aviso em arquivo que esta task não tocou já existia antes e não bloqueia.

- [ ] **Step 5: Captura visual (temporária, não commitar)**

Criar `$WT/nexago_app/test/__qa_category_editor_capture_test.dart`. O SDK Flutter desta máquina fica em `/Users/silviodionizio/development/flutter`, conferido com `readlink -f $(which flutter)`:

```dart
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/presentation/tournament_create/sheets/tournament_category_editor_sheet.dart';

Future<void> _font(String family, List<Future<ByteData>> data) async {
  final loader = FontLoader(family);
  for (final d in data) {
    loader.addFont(d);
  }
  await loader.load();
}

void main() {
  setUpAll(() async {
    await _font('Sora', [rootBundle.load('assets/fonts/Sora/Sora-Variable.ttf')]);
    await _font('MaterialIcons', [
      Future.value(ByteData.sublistView(File(
        '/Users/silviodionizio/development/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
      ).readAsBytesSync())),
    ]);
  });

  testWidgets('captura', (tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Consumer(builder: (context, ref, _) => Scaffold(
          body: Center(child: FilledButton(
            onPressed: () => showTournamentCategoryEditorSheet(context, ref,
                existing: const TournamentCategoryDraft(id: 'c1', minLevel: 'Iniciante 1',
                    skillLevel: TournamentSkillLevel.intermediario2)),
            child: const Text('abrir'),
          )),
        )),
      ),
    ));
    await tester.tap(find.text('abrir'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.ensureVisible(find.text('ATÉ O NÍVEL'));
    await tester.pump();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('__qa/editor_ate_nivel.png'));
    await tester.pumpWidget(const SizedBox());
  });
}
```

Run: `cd $WT/nexago_app && flutter test --update-goldens test/__qa_category_editor_capture_test.dart`

Abra `$WT/nexago_app/test/__qa/editor_ate_nivel.png` com a ferramenta Read e confira três coisas: as duas linhas de chips, a marca no "Até um nível" e no "Intermediário 2", e a dica sem quebra estranha. Depois apague a captura:

```bash
cd $WT/nexago_app && rm -rf test/__qa test/__qa_category_editor_capture_test.dart && git status --short
```

Expected: só os dois arquivos da task aparecem como modificado ou novo.

- [ ] **Step 6: Commit**

```bash
cd $WT && git add nexago_app/lib/features/organizer/presentation/tournament_create/sheets/tournament_category_editor_sheet.dart nexago_app/test/features/organizer/tournament_category_editor_sheet_test.dart && git commit -m "feat(app): chip \"Até um nível\" no editor de categoria do torneio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificação final, contagem no dev e PR

**Files:**
- Create (scratchpad, fora do repo): `/private/tmp/claude-501/-Users-silviodionizio-Documents-projects-volley-nexago-frontend-projects-organizer--claude-worktrees-tournament-details-mobile-optimization-92d782/65e56fbe-1886-4abc-8ef8-ec7517af060c/scratchpad/count-ate-categories.js`

- [ ] **Step 1: Suítes completas**

Run: `cd $WT/functions && npm test`
Expected: PASS, 0 falhas.

Run: `cd $WT/frontend && npx ng test organizer --watch=false --browsers=ChromeHeadless`
Expected: tudo verde, exceto as 3 falhas conhecidas e pré-existentes em `overlay-koc-bar.component.spec.ts`. Qualquer outra falha bloqueia.

Run: `cd $WT/nexago_app && flutter test test/features/organizer`
Expected: PASS, 0 falhas.

- [ ] **Step 2: Contar categorias "até X" já gravadas no dev (somente leitura)**

Criar o arquivo do scratchpad listado em **Files**:

```js
const admin = require("/Users/silviodionizio/Documents/projects/volley/nexago/functions/node_modules/firebase-admin");
const {levelRank} = require("/Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-details-mobile-optimization-92d782/functions/scripts/lib/ranking-recompute.js");

admin.initializeApp({projectId: "volley-track-dev-4596c"});

(async () => {
  const snap = await admin.firestore().collection("tournaments").get();
  const hits = [];
  for (const doc of snap.docs) {
    for (const c of doc.data().categories ?? []) {
      const min = levelRank(c.minLevel);
      const max = levelRank(c.level);
      if (min === 0 && [0, 2, 3, 4, 5].includes(max)) {
        hits.push(`${doc.id} · ${c.name ?? c.categoryName ?? c.id} · ${c.minLevel} → ${c.level}`);
      }
    }
  }
  console.log(`${hits.length} categoria(s) "até X" já gravadas no dev (de ${snap.size} torneios)`);
  for (const hit of hits) console.log(`  ${hit}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Run: `node /private/tmp/claude-501/-Users-silviodionizio-Documents-projects-volley-nexago-frontend-projects-organizer--claude-worktrees-tournament-details-mobile-optimization-92d782/65e56fbe-1886-4abc-8ef8-ec7517af060c/scratchpad/count-ate-categories.js`
Expected: a contagem e a lista. Anote o resultado para o corpo do PR: essas categorias passam do peso 1.0 (legado) para o peso medido. Se falhar por credencial (ADC ausente), registre "contagem pendente, falta credencial" no PR e siga em frente. Não é bloqueante.

- [ ] **Step 3: Limpar o symlink e conferir a árvore**

```bash
rm /Users/silviodionizio/Documents/projects/volley/nexago/frontend/projects/organizer/.claude/worktrees/tournament-details-mobile-optimization-92d782/functions/node_modules && cd $WT && git status --short && git log --oneline main..HEAD
```

Expected: `git status` vazio. O log mostra os commits da spec, do plano e das Tasks 1–8.

- [ ] **Step 4: Abrir o PR**

```bash
cd $WT && git push -u origin claude/tournament-level-selection-9d070e
```

```bash
cd $WT && gh pr create --base main --title "Categoria \"até um nível\": libera os níveis inferiores" --body "$(cat <<'EOF'
## O que muda

O organizador escolhe um nível X na faixa de nível da categoria ("Até um nível") e libera todos os níveis abaixo. A faixa gravada é `minLevel: "Iniciante 1"` + `level: X`, sem campo novo.

- **Inscrição:** sem mudança. A elegibilidade já aplica piso ≤ nível ≤ teto.
- **Ranking:** a faixa "até X" pontua pela força real do campo, como o Livre, com teto na família de X (até Intermediário → máx. 0.25; até Avançado → máx. 0.5). Sem isso, ela cairia no peso legado 1.0.
- **Liga:** a trava de participação do Livre passa a valer também para "até X".
- **Script de recálculo:** espelha a regra, para a execução pendente em PROD não sobrescrever esses pontos com 1.0.
- **Telas:** wizard de torneio no painel web e editor de categoria no app. Liga fica de fora.

Spec: `docs/superpowers/specs/2026-09-30-categoria-ate-nivel-design.md`
Plano: `docs/superpowers/plans/2026-09-30-categoria-ate-nivel.md`

## Dado existente

<resultado da Task 9, Step 2>

## Rollout (ordem obrigatória)

1. Functions, a partir da main atualizada.
2. Portal do organizador.
3. Release do app.

## Verificação

- `npm test` (functions): verde
- `ng test organizer`: verde, exceto as 3 falhas conhecidas em `overlay-koc-bar`
- `ng build organizer --configuration production`: verde
- `flutter test test/features/organizer`: verde
- QA visual: web (desktop e 375px) e captura do editor do app

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Substitua `<resultado da Task 9, Step 2>` pelo número real e pela lista (ou "nenhuma") **antes** de rodar o comando.

Expected: a URL do PR. Depois, rode `get_status` do ccd_pr e `bind_pr` se o PR não aparecer.
