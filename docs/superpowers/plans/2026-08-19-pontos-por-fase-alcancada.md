# Pontos por Fase Alcançada — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o prêmio abaixo do pódio depender da fase alcançada na chave, e não do formato escolhido pelo organizador — hoje as 18 duplas eliminadas numa chave de 22 recebem todas o mesmo balde `quarters`.

**Architecture:** Um módulo puro novo (`bracket-placement-tiers.ts`) conta quantas duplas caem em cada rodada eliminatória e acumula as faixas de colocação de cima para baixo, devolvendo o degrau de cada rodada. Ele se pendura em `bracketContextFromMatches`, que JÁ é uma função pura sobre a lista de partidas da categoria e JÁ é carregada na premiação por `loadCategoryBracketContext` — nenhuma leitura nova de Firestore. O resolvedor de colocação passa a consultar esse mapa em vez de devolver `quarters` fixo, e o script do histórico chama exatamente a mesma função sobre as partidas já gravadas.

**Tech Stack:** TypeScript (Cloud Functions, node:test), Dart/Flutter (espelhos de exibição), Angular (wizard da liga no portal do organizador), script Node admin (ADC).

**Spec:** `docs/superpowers/specs/2026-08-19-pontos-por-fase-alcancada-design.md`

## Global Constraints

- **Escada do ranking geral** (`DEFAULT_GLOBAL_POINTS`): `"1": 1000 · "2": 800 · "3": 600 · "4": 500 · quarters: 330 · r16: 200 · r32: 130 · groups: 100`.
- **Escada da liga** (`DEFAULT_LEAGUE_POINTS`): `"1": 450 · "2": 280 · "3": 180 · "4": 120 · quarters: 80 · r16: 60 · r32: 45 · groups: 40`.
- **Faixas:** quartas 5–8 · oitavas 9–16 · 16-avos 17–32. Faixa cujo topo passa de 16 usa `r32` — é o último degrau, e como `r32` (130) > `groups` (100) a regra de piso da spec ("degrau nunca paga menos que participação") vale por construção.
- **`finalPlaceForAward`:** `quarters → 5`, `r16 → 9`, `r32 → 17`, `groups → 0`. O `0` é o valor novo de participação (antes era `9`).
- **Pódio intocado:** 1º/2º/3º/4º continuam saindo da final e da disputa de 3º exatamente como hoje. Nenhuma tarefa altera `resolveDoubleEliminationLbPlacement` no que diz respeito ao caminho legado sem disputa de 3º.
- **Rodadas que NÃO geram degrau** (são pódio, não eliminação): na DE com disputa de 3º, a final da LB (`maxLbRound`); na DE legada sem disputa de 3º, `maxLbRound` e `maxLbRound - 1`; no mata-mata simples, da semifinal em diante (`round >= semifinalRound`, onde `semifinalRound = finalRound > 1 ? finalRound - 1 : 1`).
- Testes SEMPRE em foreground (aguardar no mesmo comando — nunca backgroundar suíte). Comandos: functions `cd functions && npm test` · app `cd nexago_app && flutter test` · organizador `cd frontend && npx ng test organizer --watch=false`.
- Commits com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Deploy/migração só na task GATED final.

---

### Task 1: Módulo puro de degraus

**Files:**
- Modify: `functions/src/match-status.ts` (recebe `normalizeMatchType`)
- Modify: `functions/src/league-ranking.ts:54-56` (passa a importar e re-exportar `normalizeMatchType`)
- Create: `functions/src/bracket-placement-tiers.ts`
- Test: `functions/src/bracket-placement-tiers.test.ts`

**Interfaces:**
- Consumes: `normalizeMatchType(raw: unknown): string` de `./match-status` (movida nesta task).
- Produces:
  - `type PlacementTierKey = "quarters" | "r16" | "r32"`
  - `tierForTopPosition(top: number): PlacementTierKey`
  - `interface EliminationTierMap { lb: Record<number, PlacementTierKey>; knockout: Record<number, PlacementTierKey> }`
  - `placementTiersFromMatches(matches: Array<Record<string, unknown>>): EliminationTierMap`

**Por que `normalizeMatchType` muda de casa:** o módulo novo precisa dela, e `league-ranking.ts` vai importar o módulo novo — deixá-la onde está criaria import circular. `match-status.ts` já é o módulo de baixo nível que ambos importam. A re-exportação em `league-ranking.ts` mantém `tournament-ranking.ts:15` funcionando sem tocar nele.

- [ ] **Step 1: Mover `normalizeMatchType` para `match-status.ts`**

Em `functions/src/match-status.ts`, ao final do arquivo:

```ts
/** Normaliza o tipo da partida: caixa baixa e `_` vira espaço ("THIRD_PLACE" → "third place"). */
export function normalizeMatchType(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/_/g, " ");
}
```

Em `functions/src/league-ranking.ts`, apagar a definição local (linhas 54-56) e trocar o import existente de `./match-status`:

```ts
import {isMatchCompleted, isWinnerInMatch, normalizeMatchType} from "./match-status";

export {normalizeMatchType};
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `functions/src/bracket-placement-tiers.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  placementTiersFromMatches,
  tierForTopPosition,
} from "./bracket-placement-tiers";

/** Atalho: uma partida só precisa de tipo e rodada para o cálculo do degrau. */
const m = (matchType: string, round: number) => ({matchType, round});
const many = (n: number, matchType: string, round: number) =>
  Array.from({length: n}, () => m(matchType, round));

describe("tierForTopPosition", () => {
  it("o degrau sai do TOPO da faixa", () => {
    assert.equal(tierForTopPosition(5), "quarters");
    assert.equal(tierForTopPosition(8), "quarters");
    assert.equal(tierForTopPosition(9), "r16");
    assert.equal(tierForTopPosition(16), "r16");
    assert.equal(tierForTopPosition(17), "r32");
  });

  it("faixa além de 32 fica no último degrau (regra de piso da spec)", () => {
    assert.equal(tierForTopPosition(33), "r32");
    assert.equal(tierForTopPosition(65), "r32");
  });
});

describe("placementTiersFromMatches — dupla eliminação de 22 duplas", () => {
  // Estrutura real da planta: LB r1..r6 com 6/4/4/2/2/1 partidas.
  const matches = [
    ...many(6, "LB", 1),
    ...many(4, "LB", 2),
    ...many(4, "LB", 3),
    ...many(2, "LB", 4),
    ...many(2, "LB", 5),
    m("LB", 6),
    m("WB", 5),
    m("THIRD_PLACE", 1),
    m("FINAL", 1),
  ];

  it("acumula as faixas de cima para baixo a partir da 5ª colocação", () => {
    const tiers = placementTiersFromMatches(matches);
    assert.deepEqual(tiers.lb, {
      5: "quarters", // 5º-6º
      4: "quarters", // 7º-8º
      3: "r16", //     9º-12º
      2: "r16", //     13º-16º
      1: "r32", //     17º-22º
    });
  });

  it("a final da LB não gera degrau: seu perdedor ainda joga o 3º lugar", () => {
    const tiers = placementTiersFromMatches(matches);
    assert.equal(tiers.lb[6], undefined);
  });
});

describe("placementTiersFromMatches — dupla eliminação legada (sem disputa de 3º)", () => {
  it("as duas últimas rodadas da LB são pódio (3º e 4º), não degrau", () => {
    const matches = [
      ...many(4, "LB", 1),
      ...many(2, "LB", 2),
      m("LB", 3),
      m("FINAL", 1),
    ];
    const tiers = placementTiersFromMatches(matches);
    assert.equal(tiers.lb[3], undefined);
    assert.equal(tiers.lb[2], undefined);
    assert.equal(tiers.lb[1], "quarters"); // 4 eliminados: 5º-8º
  });
});

describe("placementTiersFromMatches — mata-mata simples de 32", () => {
  const matches = [
    ...many(16, "knockout", 1),
    ...many(8, "knockout", 2),
    ...many(4, "knockout", 3),
    ...many(2, "knockout", 4), // semifinais
    m("FINAL", 5),
    m("THIRD_PLACE", 5),
  ];

  it("cada rodada cai no degrau da sua faixa", () => {
    const tiers = placementTiersFromMatches(matches);
    assert.deepEqual(tiers.knockout, {
      3: "quarters", // 5º-8º
      2: "r16", //     9º-16º
      1: "r32", //     17º-32º
    });
  });

  it("semifinal em diante não gera degrau", () => {
    const tiers = placementTiersFromMatches(matches);
    assert.equal(tiers.knockout[4], undefined);
    assert.equal(tiers.knockout[5], undefined);
  });
});

describe("placementTiersFromMatches — formatos sem eliminação abaixo do pódio", () => {
  it("grupos + semifinal direta não produz degrau nenhum", () => {
    // Caso real da Copa Goiás feminina: 30 jogos de grupo, 2 semis, final e 3º.
    const matches = [
      ...many(30, "group", 0),
      ...many(2, "knockout", 1),
      m("FINAL", 2),
      m("THIRD_PLACE", 2),
    ];
    const tiers = placementTiersFromMatches(matches);
    assert.deepEqual(tiers.knockout, {});
    assert.deepEqual(tiers.lb, {});
  });

  it("lista vazia devolve mapas vazios", () => {
    assert.deepEqual(placementTiersFromMatches([]), {lb: {}, knockout: {}});
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd functions && npm test`
Expected: FAIL — `Cannot find module './bracket-placement-tiers'`.

- [ ] **Step 4: Implementar o módulo**

Criar `functions/src/bracket-placement-tiers.ts`:

```ts
import {normalizeMatchType} from "./match-status";

/**
 * Degrau de premiação abaixo do pódio. O nome é a FASE alcançada, e a faixa de
 * colocação que ele representa sai da estrutura da chave (ver
 * `placementTiersFromMatches`), nunca da rodada crua — a LB de 22 duplas tem 6
 * rodadas e a de 8 tem 3, então "rodada 2" significa colocações diferentes em
 * cada planta.
 */
export type PlacementTierKey = "quarters" | "r16" | "r32";

/** Faixa 5-8 → quartas, 9-16 → oitavas, acima disso → 16-avos (último degrau). */
export function tierForTopPosition(top: number): PlacementTierKey {
  if (top <= 8) return "quarters";
  if (top <= 16) return "r16";
  return "r32";
}

export interface EliminationTierMap {
  /** rodada da LB (dupla eliminação) → degrau */
  lb: Record<number, PlacementTierKey>;
  /** rodada do mata-mata simples → degrau */
  knockout: Record<number, PlacementTierKey>;
}

function countByRound(
  matches: Array<Record<string, unknown>>,
  predicate: (matchType: string) => boolean,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const match of matches) {
    if (!predicate(normalizeMatchType(match.matchType))) continue;
    const round = Number(match.round ?? 0);
    if (!Number.isInteger(round) || round <= 0) continue;
    counts.set(round, (counts.get(round) ?? 0) + 1);
  }
  return counts;
}

/**
 * Distribui degraus percorrendo as rodadas da MAIS TARDIA para a mais precoce:
 * quem cai por último ocupa as melhores colocações abaixo do pódio (a partir da
 * 5ª), quem cai primeiro ocupa as últimas. Cada rodada consome tantas posições
 * quantas partidas ela tem — é daí que sai a faixa.
 */
function tiersFromCounts(
  counts: Map<number, number>,
  isPodiumRound: (round: number) => boolean,
): Record<number, PlacementTierKey> {
  const tiers: Record<number, PlacementTierKey> = {};
  const rounds = [...counts.keys()]
    .filter((round) => !isPodiumRound(round))
    .sort((a, b) => b - a);

  let top = 5;
  for (const round of rounds) {
    tiers[round] = tierForTopPosition(top);
    top += counts.get(round) ?? 0;
  }
  return tiers;
}

/**
 * Degraus de cada rodada eliminatória da categoria, derivados da ESTRUTURA da
 * chave (quantas duplas caem em cada rodada) e não do estado do torneio. Puro:
 * a mesma lista de partidas sempre dá o mesmo resultado, o que permite ao motor
 * (na premiação) e ao script de histórico (nas partidas gravadas) usarem a
 * mesma regra.
 *
 * Rodadas de PÓDIO não entram na conta, porque seus perdedores não estão
 * eliminados abaixo do 4º lugar:
 *  - DE com disputa de 3º: a final da LB (o perdedor ainda joga o 3º lugar);
 *  - DE legada sem disputa de 3º: a final da LB (3º) e a anterior (4º);
 *  - mata-mata simples: da semifinal em diante.
 *
 * A entrada desigual na LB das plantas 20-23 (perdedores da WB R2 entrando em
 * rodadas diferentes) não afeta nada: o critério é quantas duplas caem por
 * rodada, não quando cada uma entrou.
 */
export function placementTiersFromMatches(
  matches: Array<Record<string, unknown>>,
): EliminationTierMap {
  let maxLbRound = 0;
  let knockoutFinalRound = 0;
  let hasThirdPlaceMatch = false;

  for (const match of matches) {
    const matchType = normalizeMatchType(match.matchType);
    const round = Number(match.round ?? 0);
    if (matchType === "third place" || matchType === "3rd place") {
      hasThirdPlaceMatch = true;
    }
    if (matchType === "lb" && round > maxLbRound) maxLbRound = round;
    if (
      (matchType === "knockout" || matchType === "final" ||
        matchType === "grand final") &&
      round > knockoutFinalRound
    ) {
      knockoutFinalRound = round;
    }
  }

  const lbPodiumFloor = hasThirdPlaceMatch ? maxLbRound : maxLbRound - 1;
  const semifinalRound = knockoutFinalRound > 1 ? knockoutFinalRound - 1 : 1;

  return {
    lb: tiersFromCounts(
      countByRound(matches, (type) => type === "lb"),
      (round) => maxLbRound > 0 && round >= lbPodiumFloor,
    ),
    knockout: tiersFromCounts(
      countByRound(matches, (type) => type === "knockout"),
      (round) => round >= semifinalRound,
    ),
  };
}
```

- [ ] **Step 5: Verde**

Run: `cd functions && npm test`
Expected: PASS integral (a suíte inteira, não só o arquivo novo — a mudança de casa de `normalizeMatchType` toca `tournament-ranking.ts`).

- [ ] **Step 6: Commit**

```bash
git add functions/src/bracket-placement-tiers.ts functions/src/bracket-placement-tiers.test.ts functions/src/match-status.ts functions/src/league-ranking.ts
git commit -m "feat(ranking): degrau de premiação derivado da estrutura da chave (NEXAGO)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Invariantes contra as 25 plantas reais

**Files:**
- Test: `functions/src/bracket-placement-tiers-plants.test.ts`

**Interfaces:**
- Consumes: `placementTiersFromMatches` (Task 1); `MatchDefinition` e as constantes `BRACKET_*_TEAMS` de `functions/src/bracket-definitions/`.
- Produces: nada de runtime — é rede de segurança.

**Por que é task separada:** o módulo pode estar certo nos casos sintéticos da Task 1 e errado numa planta real (é justamente onde mora a entrada desigual da LB). Um revisor pode aprovar a Task 1 e reprovar aqui.

- [ ] **Step 1: Descobrir o índice das plantas**

Run: `cd functions && grep -rn "BRACKET_.*_TEAMS" src/bracket-definitions/bracket-definitions.ts | head -30`
Expected: o arquivo-índice que mapeia tamanho → planta. Use o mapa que ele já exporta; se não houver, importe as 25 constantes explicitamente no teste.

- [ ] **Step 2: Escrever o teste que falha**

Criar `functions/src/bracket-placement-tiers-plants.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {placementTiersFromMatches} from "./bracket-placement-tiers";
import {BRACKETS_BY_TEAM_COUNT} from "./bracket-definitions/bracket-definitions";

/**
 * As plantas são a fonte da verdade da chave. Um degrau derivado errado aqui
 * reescreve o ranking de um torneio inteiro, e nenhum teste sintético pega o
 * caso real da entrada desigual na LB (plantas 20-23).
 */
describe("degraus contra as 25 plantas de dupla eliminação", () => {
  for (const [teamCount, definitions] of Object.entries(BRACKETS_BY_TEAM_COUNT)) {
    const total = Number(teamCount);
    // A planta usa `bracket` ("WB"/"LB"/"FINAL"/"THIRD_PLACE"); a partida gravada
    // usa `matchType`. normalizeMatchType() já converte "THIRD_PLACE".
    const matches = definitions.map((d) => ({matchType: d.bracket, round: d.round}));

    it(`planta de ${total}: toda dupla abaixo do pódio recebe exatamente um degrau`, () => {
      const tiers = placementTiersFromMatches(matches);
      const lbCounts = new Map<number, number>();
      for (const d of definitions) {
        if (String(d.bracket).toUpperCase() !== "LB") continue;
        lbCounts.set(d.round, (lbCounts.get(d.round) ?? 0) + 1);
      }
      let comDegrau = 0;
      for (const [round, count] of lbCounts) {
        if (tiers.lb[round] != null) comDegrau += count;
      }
      // Total de duplas menos o pódio (1º-4º).
      assert.equal(comDegrau, total - 4, `planta de ${total}`);
    });

    it(`planta de ${total}: as faixas cobrem de 5 até ${total} sem buraco nem sobreposição`, () => {
      const tiers = placementTiersFromMatches(matches);
      const rounds = Object.keys(tiers.lb).map(Number).sort((a, b) => b - a);
      let esperado = 5;
      for (const round of rounds) {
        const count = definitions.filter(
          (d) => String(d.bracket).toUpperCase() === "LB" && d.round === round,
        ).length;
        const tierEsperado =
          esperado <= 8 ? "quarters" : esperado <= 16 ? "r16" : "r32";
        assert.equal(tiers.lb[round], tierEsperado, `planta ${total}, LB r${round}`);
        esperado += count;
      }
      assert.equal(esperado - 1, total, `planta de ${total}: última colocação`);
    });
  }
});
```

- [ ] **Step 3: Rodar**

Run: `cd functions && npm test`
Expected: se `BRACKETS_BY_TEAM_COUNT` não existir com esse nome, FAIL de compilação — corrija o import para o que o Step 1 encontrou (é a única adaptação permitida; NÃO relaxe os asserts).

- [ ] **Step 4: Verde**

Run: `cd functions && npm test`
Expected: PASS nas 25 plantas. Se alguma planta falhar, o bug é do módulo da Task 1 (provavelmente na exclusão das rodadas de pódio) — conserte lá, não no teste.

- [ ] **Step 5: Commit**

```bash
git add functions/src/bracket-placement-tiers-plants.test.ts
git commit -m "test(ranking): invariantes de degrau nas 25 plantas de dupla eliminação (NEXAGO)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Tabelas de pontos e contrato dos baldes

**Files:**
- Modify: `functions/src/league-ranking.ts:9-16` (`DEFAULT_LEAGUE_POINTS`), `:23` (`LeaguePlacementBucket`)
- Modify: `functions/src/tournament-ranking.ts:45-52` (`DEFAULT_GLOBAL_POINTS`), `:~100` (`finalPlaceForAward`)
- Test: `functions/src/league-ranking.test.ts`, `functions/src/tournament-ranking.test.ts`

**Interfaces:**
- Produces: `LeaguePlacementBucket = "quarters" | "r16" | "r32" | "groups"`; tabelas com as chaves `r16`/`r32`; `finalPlaceForAward` mapeando `quarters→5`, `r16→9`, `r32→17`, `groups→0`.

- [ ] **Step 1: Escrever os testes que falham**

Em `functions/src/tournament-ranking.test.ts`:

```ts
describe("escada por fase alcançada — tabela e colocação persistida", () => {
  it("tabela-base ganha oitavas e 16-avos", () => {
    assert.deepStrictEqual(DEFAULT_GLOBAL_POINTS, {
      "1": 1000, "2": 800, "3": 600, "4": 500,
      quarters: 330, r16: 200, r32: 130, groups: 100,
    });
  });

  it("nenhum degrau paga menos que a participação", () => {
    for (const bucket of ["quarters", "r16", "r32"] as const) {
      assert.ok(
        DEFAULT_GLOBAL_POINTS[bucket] >= DEFAULT_GLOBAL_POINTS.groups,
        `${bucket} abaixo da participação`,
      );
    }
  });

  it("finalPlace guarda o topo da faixa; participação vira 0", () => {
    assert.strictEqual(finalPlaceForAward({teamId: "t", bucket: "quarters"}), 5);
    assert.strictEqual(finalPlaceForAward({teamId: "t", bucket: "r16"}), 9);
    assert.strictEqual(finalPlaceForAward({teamId: "t", bucket: "r32"}), 17);
    assert.strictEqual(finalPlaceForAward({teamId: "t", bucket: "groups"}), 0);
    assert.strictEqual(finalPlaceForAward({teamId: "t", place: 2}), 2);
  });

  it("pontos dos degraus novos com peso de preset", () => {
    // Intermediário (0.25): 200 × 0.25 = 50 · 130 × 0.25 = 32.5 → 33
    assert.strictEqual(globalPointsForAward({teamId: "t", bucket: "r16"}, 0.25), 50);
    assert.strictEqual(globalPointsForAward({teamId: "t", bucket: "r32"}, 0.25), 33);
  });
});
```

Em `functions/src/league-ranking.test.ts`:

```ts
describe("escada por fase alcançada — tabela da liga", () => {
  it("default ganha oitavas e 16-avos", () => {
    assert.strictEqual(pointsForBucket({}, "r16"), 60);
    assert.strictEqual(pointsForBucket({}, "r32"), 45);
  });

  it("tabela customizada SEM os degraus novos cai no default deles", () => {
    // Liga criada antes desta mudança: só tem as chaves antigas.
    const antiga = {"1": 500, "2": 300, "3": 200, "4": 150, quarters: 90, groups: 50};
    assert.strictEqual(pointsForBucket(antiga, "quarters"), 90); // respeita o custom
    assert.strictEqual(pointsForBucket(antiga, "r16"), 60); // default do degrau novo
    assert.strictEqual(pointsForBucket(antiga, "r32"), 45);
  });

  it("degrau customizado é respeitado", () => {
    assert.strictEqual(pointsForBucket({r16: 70}, "r16"), 70);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm test`
Expected: FAIL — tabelas sem `r16`/`r32`, `finalPlaceForAward` devolvendo 9 para `groups`, e erro de tipo em `bucket: "r16"`.

- [ ] **Step 3: Implementar**

`functions/src/tournament-ranking.ts`:

```ts
export const DEFAULT_GLOBAL_POINTS: Record<string, number> = {
  "1": 1000,
  "2": 800,
  "3": 600,
  "4": 500,
  quarters: 330,
  r16: 200,
  r32: 130,
  groups: 100,
};
```

```ts
/**
 * Colocação persistida: 1-4 direto; abaixo do pódio guarda o TOPO da faixa do
 * degrau (quartas 5, oitavas 9, 16-avos 17). Participação é 0 — "sem colocação
 * de mata-mata"; era 9 antes da escada por fase, e o script de re-derivação
 * converte o histórico.
 */
export function finalPlaceForAward(award: LeaguePlacementAward): number {
  if (award.place != null) return award.place;
  switch (award.bucket) {
    case "quarters":
      return 5;
    case "r16":
      return 9;
    case "r32":
      return 17;
    default:
      return 0;
  }
}
```

`functions/src/league-ranking.ts`:

```ts
const DEFAULT_LEAGUE_POINTS: Record<string, number> = {
  "1": 450,
  "2": 280,
  "3": 180,
  "4": 120,
  quarters: 80,
  r16: 60,
  r32: 45,
  groups: 40,
};

export type LeaguePlacementBucket = "quarters" | "r16" | "r32" | "groups";
```

`pointsForBucket` NÃO muda: ele já cai em `DEFAULT_LEAGUE_POINTS[bucket]` quando a tabela customizada não tem a chave, que é exatamente o comportamento que o teste do Step 1 exige.

Atualizar os asserts existentes que fixam `finalPlace: 9` para participação — nos dois arquivos de teste — para `0`.

- [ ] **Step 4: Verde**

Run: `cd functions && npm test`
Expected: PASS integral.

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-ranking.ts functions/src/league-ranking.ts functions/src/tournament-ranking.test.ts functions/src/league-ranking.test.ts
git commit -m "feat(ranking): oitavas e 16-avos nas tabelas de pontos, participação sem colocação (NEXAGO)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Resolvedor consumindo os degraus

**Files:**
- Modify: `functions/src/league-ranking.ts` — `LeaguePlacementContext` (`:31-41`), `resolveDoubleEliminationLbPlacement` (`:176-195`), `resolveLeaguePlacementsFromMatch` (`:198-275`), `CategoryBracketContext`/`bracketContextFromMatches` (`:341-376`), e as duas chamadas que montam o contexto (`tryAwardLeagueStagePointsForMatch` em `:626-640` e a equivalente em `functions/src/tournament-ranking.ts:~330`)
- Test: `functions/src/league-ranking.test.ts`

**Interfaces:**
- Consumes: `placementTiersFromMatches`, `EliminationTierMap` (Task 1); baldes novos (Task 3).
- Produces: `CategoryBracketContext` ganha `tiers: EliminationTierMap`; `LeaguePlacementContext` ganha `tiers?: EliminationTierMap`.

- [ ] **Step 1: Escrever os testes que falham**

Em `functions/src/league-ranking.test.ts`:

```ts
describe("resolvedor com degrau por fase — dupla eliminação de 22", () => {
  const matches = [
    ...Array.from({length: 6}, () => ({matchType: "LB", round: 1})),
    ...Array.from({length: 4}, () => ({matchType: "LB", round: 2})),
    ...Array.from({length: 4}, () => ({matchType: "LB", round: 3})),
    ...Array.from({length: 2}, () => ({matchType: "LB", round: 4})),
    ...Array.from({length: 2}, () => ({matchType: "LB", round: 5})),
    {matchType: "LB", round: 6},
    {matchType: "THIRD_PLACE", round: 1},
    {matchType: "FINAL", round: 1},
  ];
  const context = bracketContextFromMatches(matches);

  const perdaNaLb = (round: number) =>
    resolveLeaguePlacementsFromMatch(
      {
        status: "completed",
        matchType: "LB",
        round,
        teamAId: "vencedor",
        teamBId: "perdedor",
        winnerId: "vencedor",
      },
      {
        hasThirdPlaceMatch: context.hasThirdPlaceMatch,
        isDoubleElimination: context.isDoubleElimination,
        maxLbRound: context.maxLbRound,
        knockoutFinalRound: context.knockoutFinalRound,
        tiers: context.tiers,
      },
    );

  it("quem cai na primeira rodada da LB não recebe mais o balde de quartas", () => {
    assert.deepStrictEqual(perdaNaLb(1), [{teamId: "perdedor", bucket: "r32"}]);
  });

  it("as rodadas do meio caem em oitavas", () => {
    assert.deepStrictEqual(perdaNaLb(2), [{teamId: "perdedor", bucket: "r16"}]);
    assert.deepStrictEqual(perdaNaLb(3), [{teamId: "perdedor", bucket: "r16"}]);
  });

  it("as duas últimas rodadas antes do pódio continuam em quartas", () => {
    assert.deepStrictEqual(perdaNaLb(4), [{teamId: "perdedor", bucket: "quarters"}]);
    assert.deepStrictEqual(perdaNaLb(5), [{teamId: "perdedor", bucket: "quarters"}]);
  });
});

describe("resolvedor com degrau por fase — mata-mata simples de 32", () => {
  it("primeira rodada vira 16-avos e as quartas continuam quartas", () => {
    const matches = [
      ...Array.from({length: 16}, () => ({matchType: "knockout", round: 1})),
      ...Array.from({length: 8}, () => ({matchType: "knockout", round: 2})),
      ...Array.from({length: 4}, () => ({matchType: "knockout", round: 3})),
      ...Array.from({length: 2}, () => ({matchType: "knockout", round: 4})),
      {matchType: "FINAL", round: 5},
      {matchType: "THIRD_PLACE", round: 5},
    ];
    const context = bracketContextFromMatches(matches);
    const perda = (round: number) =>
      resolveLeaguePlacementsFromMatch(
        {
          status: "completed",
          matchType: "knockout",
          round,
          teamAId: "v",
          teamBId: "p",
          winnerId: "v",
        },
        {
          hasThirdPlaceMatch: context.hasThirdPlaceMatch,
          knockoutFinalRound: context.knockoutFinalRound,
          tiers: context.tiers,
        },
      );
    assert.deepStrictEqual(perda(1), [{teamId: "p", bucket: "r32"}]);
    assert.deepStrictEqual(perda(2), [{teamId: "p", bucket: "r16"}]);
    assert.deepStrictEqual(perda(3), [{teamId: "p", bucket: "quarters"}]);
  });
});

describe("resolvedor sem mapa de degraus (compatibilidade)", () => {
  it("contexto sem `tiers` mantém o comportamento antigo: quartas", () => {
    const placements = resolveLeaguePlacementsFromMatch(
      {
        status: "completed",
        matchType: "LB",
        round: 1,
        teamAId: "v",
        teamBId: "p",
        winnerId: "v",
      },
      {hasThirdPlaceMatch: true, isDoubleElimination: true, maxLbRound: 6},
    );
    assert.deepStrictEqual(placements, [{teamId: "p", bucket: "quarters"}]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm test`
Expected: FAIL — `tiers` não existe em `CategoryBracketContext` nem em `LeaguePlacementContext`, e os baldes devolvidos ainda são `quarters`.

- [ ] **Step 3: Implementar**

Em `functions/src/league-ranking.ts`, no import:

```ts
import {
  type EliminationTierMap,
  placementTiersFromMatches,
} from "./bracket-placement-tiers";
```

`LeaguePlacementContext` ganha o campo (opcional para não quebrar chamador que ainda não passa):

```ts
export interface LeaguePlacementContext {
  hasThirdPlaceMatch: boolean;
  isDoubleElimination?: boolean;
  maxLbRound?: number;
  knockoutFinalRound?: number;
  /**
   * Degraus por rodada eliminatória (`bracket-placement-tiers`). Ausente =
   * comportamento legado (tudo em `quarters`) — mantido para que qualquer
   * chamador não migrado continue premiando como antes, nunca a zero.
   */
  tiers?: EliminationTierMap;
}
```

`resolveDoubleEliminationLbPlacement` passa a receber o mapa e usá-lo no ramo de eliminação:

```ts
function resolveDoubleEliminationLbPlacement(
  loserId: string,
  lbRound: number,
  maxLbRound: number,
  hasThirdPlaceMatch: boolean,
  tiers: EliminationTierMap | undefined,
): LeaguePlacementAward {
  const tier = tiers?.lb[lbRound] ?? "quarters";
  if (hasThirdPlaceMatch || maxLbRound <= 0) {
    return {teamId: loserId, bucket: tier};
  }
  if (lbRound === maxLbRound) {
    return {teamId: loserId, place: 3};
  }
  if (lbRound === maxLbRound - 1 && maxLbRound >= 2) {
    return {teamId: loserId, place: 4};
  }
  return {teamId: loserId, bucket: tier};
}
```

Na chamada dentro de `resolveLeaguePlacementsFromMatch`, passar `context.tiers`. E no ramo do mata-mata simples:

```ts
    if (round > 0) {
      // Qualquer outra rodada do mata-mata: eliminado antes da semifinal. O
      // degrau sai da faixa de colocação que a rodada implica (16-avos numa
      // chave de 32, quartas numa de 8) — sem o mapa, cai no legado.
      return [{teamId: loserId, bucket: context.tiers?.knockout[round] ?? "quarters"}];
    }
```

`CategoryBracketContext` e `bracketContextFromMatches`:

```ts
export interface CategoryBracketContext {
  isDoubleElimination: boolean;
  maxLbRound: number;
  knockoutFinalRound: number;
  hasThirdPlaceMatch: boolean;
  tiers: EliminationTierMap;
}
```

No `return` da função, acrescentar `tiers: placementTiersFromMatches(matches)`.

Por fim, os dois pontos que montam o `LeaguePlacementContext` a partir do `CategoryBracketContext` (`tryAwardLeagueStagePointsForMatch` e o equivalente em `tournament-ranking.ts`) passam `tiers: bracketContext.tiers`.

- [ ] **Step 4: Verde**

Run: `cd functions && npm test`
Expected: PASS integral, incluindo `league-ranking-de-brackets.test.ts` (regressão do pódio: exatamente um 1º/2º/3º/4º por planta).

- [ ] **Step 5: Commit**

```bash
git add functions/src/league-ranking.ts functions/src/tournament-ranking.ts functions/src/league-ranking.test.ts
git commit -m "feat(ranking): premiação por fase alcançada nos dois motores (NEXAGO)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Espelhos de exibição

**Files:**
- Modify: `nexago_app/lib/features/ranking/domain/ranking_constants.dart`
- Modify: `frontend/projects/organizer/src/app/painel/data/league-create.model.ts:111-156`
- Modify: `nexago_app/lib/features/organizer/domain/league_create/league_create_logic.dart:11-12`
- Test: `nexago_app/test/features/ranking/ranking_constants_test.dart` (criar se não existir), `frontend/projects/organizer/src/app/painel/data/league-create.spec.ts`

**Interfaces:**
- Consumes: os valores das Global Constraints. Nada de runtime — estes arquivos são exibição; o cálculo continua só no backend.

- [ ] **Step 1: Escrever os testes que falham**

Dart, em `nexago_app/test/features/ranking/ranking_constants_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/ranking/domain/ranking_constants.dart';

void main() {
  group('escada por fase alcançada (espelho do backend)', () {
    test('9º-16º valem 200 e 17º-32º valem 130', () {
      expect(getPointsForPlace(9), 200);
      expect(getPointsForPlace(16), 200);
      expect(getPointsForPlace(17), 130);
      expect(getPointsForPlace(32), 130);
    });

    test('pódio e quartas não mudaram', () {
      expect(getPointsForPlace(1), 1000);
      expect(getPointsForPlace(5), 330);
      expect(getPointsForPlace(8), 330);
    });

    test('além de 32 não há degrau de mata-mata', () {
      expect(getPointsForPlace(33), 0);
    });
  });
}
```

TypeScript, em `frontend/projects/organizer/src/app/painel/data/league-create.spec.ts`:

```ts
it('a tabela padrão da liga tem oitavas e 16-avos', () => {
  expect(DEFAULT_LEAGUE_RANKING_POINTS['r16']).toBe(60);
  expect(DEFAULT_LEAGUE_RANKING_POINTS['r32']).toBe(45);
});

it('o editor lista os degraus na ordem da escada', () => {
  expect(LEAGUE_RANKING_POINT_KEYS).toEqual([
    '1', '2', '3', '4', 'quarters', 'r16', 'r32', 'groups',
  ]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/ranking/ranking_constants_test.dart`
Expected: FAIL — `getPointsForPlace(9)` devolve 0.

Run: `cd frontend && npx ng test organizer --watch=false`
Expected: FAIL — chaves `r16`/`r32` ausentes.

- [ ] **Step 3: Implementar**

`ranking_constants.dart`:

```dart
/// Tabela base ×10 com a escada por fase alcançada, paridade de valores com
/// `DEFAULT_GLOBAL_POINTS` em `functions/src/tournament-ranking.ts`:
/// quartas (5-8) 330, oitavas (9-16) 200, 16-avos (17-32) 130.
const pointsByPlace = <int, int>{
  1: 1000,
  2: 800,
  3: 600,
  4: 500,
  5: 330, 6: 330, 7: 330, 8: 330,
  9: 200, 10: 200, 11: 200, 12: 200, 13: 200, 14: 200, 15: 200, 16: 200,
  17: 130, 18: 130, 19: 130, 20: 130, 21: 130, 22: 130, 23: 130, 24: 130,
  25: 130, 26: 130, 27: 130, 28: 130, 29: 130, 30: 130, 31: 130, 32: 130,
};

const placesWithPoints = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
];
```

E `getPointsForPlace` / `getPointsForPlaceFromLeagueConfig` trocam o limite `place > 8` por `place > 32`.

`league-create.model.ts`:

```ts
  quarters: 80,
  r16: 60,
  r32: 45,
  groups: 40,
```

```ts
export const LEAGUE_RANKING_POINT_KEYS: readonly string[] = [
  '1', '2', '3', '4', 'quarters', 'r16', 'r32', 'groups',
];
```

e os rótulos:

```ts
  quarters: 'Quartas (5º-8º)',
  r16: 'Oitavas (9º-16º)',
  r32: '16-avos (17º-32º)',
  groups: 'Fase de grupos',
```

`league_create_logic.dart`: acrescentar `'r16': 60,` e `'r32': 45,` ao mapa padrão, na mesma ordem.

- [ ] **Step 4: Verde**

Run: `cd nexago_app && flutter test`
Run: `cd frontend && npx ng test organizer --watch=false`
Expected: PASS nos dois.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/ranking/domain/ranking_constants.dart nexago_app/test/features/ranking/ranking_constants_test.dart nexago_app/lib/features/organizer/domain/league_create/league_create_logic.dart frontend/projects/organizer/src/app/painel/data/league-create.model.ts frontend/projects/organizer/src/app/painel/data/league-create.spec.ts
git commit -m "feat(ranking): escada por fase nos espelhos de exibição (app e wizard da liga) (NEXAGO)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Script de re-derivação do histórico

**Files:**
- Create: `functions/scripts/lib/bracket-placement-tiers.js` (cópia JS pura do módulo da Task 1)
- Create: `functions/scripts/rederive-knockout-placements.js`
- Modify: `functions/package.json` (registrar o teste novo)
- Test: `functions/test/bracket-placement-tiers-parity.test.mjs`

**Interfaces:**
- Consumes: `placementTiersFromMatches` (cópia JS), e de `scripts/lib/ranking-recompute.js` (PR #258): `presetWeightForCategory`, `sanitizeRankingWeight`, `bracketSizeFactor`, `pointsForEntry`, `aggregateRankingResults`.
- Produces: script executável com `--project`, `--yes`, `--limit`.

**Por que a cópia:** os scripts são standalone (não importam o bundle compilado das functions) — mesma convenção de `ranking-recompute.js`. O teste de paridade do Step 1 é o que impede as duas cópias de divergirem.

- [ ] **Step 1: Escrever o teste de paridade que falha**

Criar `functions/test/bracket-placement-tiers-parity.test.mjs`:

```mjs
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/**
 * O script de histórico não pode importar o bundle compilado das functions, então
 * `scripts/lib/bracket-placement-tiers.js` é cópia de `src/bracket-placement-tiers.ts`.
 * Divergência entre as duas faz o passado ser recalculado com regra diferente da
 * do presente — exatamente o problema que esta feature existe para resolver.
 */
const require = createRequire(import.meta.url);
const { placementTiersFromMatches, tierForTopPosition } = require('../scripts/lib/bracket-placement-tiers.js');

const many = (n, matchType, round) => Array.from({ length: n }, () => ({ matchType, round }));

describe('cópia JS dos degraus', () => {
  test('mesma faixa por topo de posição', () => {
    assert.equal(tierForTopPosition(5), 'quarters');
    assert.equal(tierForTopPosition(9), 'r16');
    assert.equal(tierForTopPosition(17), 'r32');
    assert.equal(tierForTopPosition(33), 'r32');
  });

  test('planta de 22: mesmos degraus da versão TypeScript', () => {
    const matches = [
      ...many(6, 'LB', 1), ...many(4, 'LB', 2), ...many(4, 'LB', 3),
      ...many(2, 'LB', 4), ...many(2, 'LB', 5), { matchType: 'LB', round: 6 },
      { matchType: 'THIRD_PLACE', round: 1 }, { matchType: 'FINAL', round: 1 },
    ];
    assert.deepEqual(placementTiersFromMatches(matches).lb, {
      1: 'r32', 2: 'r16', 3: 'r16', 4: 'quarters', 5: 'quarters',
    });
  });

  test('mata-mata simples de 32', () => {
    const matches = [
      ...many(16, 'knockout', 1), ...many(8, 'knockout', 2),
      ...many(4, 'knockout', 3), ...many(2, 'knockout', 4),
      { matchType: 'FINAL', round: 5 },
    ];
    assert.deepEqual(placementTiersFromMatches(matches).knockout, {
      1: 'r32', 2: 'r16', 3: 'quarters',
    });
  });
});
```

Registrar no `functions/package.json`, no fim da lista do script `test`:

```
test/bracket-placement-tiers-parity.test.mjs
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm test`
Expected: FAIL — `Cannot find module '../scripts/lib/bracket-placement-tiers.js'`.

- [ ] **Step 3: Criar a cópia JS**

`functions/scripts/lib/bracket-placement-tiers.js`: mesma lógica de `src/bracket-placement-tiers.ts` em CommonJS, sem tipos, com `normalizeMatchType` local (o script não importa `match-status`) e o cabeçalho de paridade:

```js
/* eslint-disable */
/**
 * Cópia JS pura de `functions/src/bracket-placement-tiers.ts` — script standalone,
 * sem import do bundle compilado (mesma convenção de `ranking-recompute.js`).
 * Mudou lá, muda aqui: `functions/test/bracket-placement-tiers-parity.test.mjs`
 * é quem cobra.
 */
function normalizeMatchType(raw) {
  return String(raw ?? "").trim().toLowerCase().replace(/_/g, " ");
}
// ...tierForTopPosition, countByRound, tiersFromCounts e placementTiersFromMatches
// idênticos à versão TypeScript, sem anotações de tipo.
module.exports = {tierForTopPosition, placementTiersFromMatches};
```

- [ ] **Step 4: Verde no teste de paridade**

Run: `cd functions && npm test`
Expected: PASS.

- [ ] **Step 5: Escrever o script de re-derivação**

`functions/scripts/rederive-knockout-placements.js`. Estrutura (a casca de I/O é a mesma de `recompute-ranking-weights.js` — dry-run por padrão, transação por doc com releitura, relatório, `--limit`, exit != 0 em erro):

1. Varre `tournamentCategoryResults` e agrupa por `(tournamentId, categoryId)`.
2. Para cada par, carrega as partidas da categoria (`artifacts/{projectId}/public/data/matches`, filtro `tournamentId` + `categoryId`) e chama `placementTiersFromMatches`.
3. Para cada dupla do par, descobre **onde ela caiu**: a partida não-grupo, concluída, em que ela aparece como perdedora (`winnerId` presente e diferente dela) e cujo `matchType`/`round` tenha degrau no mapa. Se a dupla aparece como perdedora em mais de uma partida com degrau, vale a de **rodada mais alta** (a última eliminação registrada).
4. Colocação nova: `finalPlace` do degrau (`quarters→5`, `r16→9`, `r32→17`); dupla sem partida eliminatória perdida = participação (`finalPlace: 0`).
5. Pontos novos: `pointsForEntry(finalPlace, ctx)` de `ranking-recompute.js`, com o mesmo contexto (peso do preset, `rankingWeight`, fator de chave).
6. Escreve `finalPlace` + `pointsEarned` em `tournamentCategoryResults` e `results[].finalPlace`/`.points` + agregados em `athleteRankings`/`teamRankings`.
7. **Não escreve e reporta** quando: o par não tem partidas gravadas; alguma partida eliminatória está sem `winnerId`; a dupla do resultado não aparece em partida nenhuma; ou o pódio derivado não bate com o gravado (1º/2º/3º/4º devem continuar os mesmos — o script NÃO mexe em pódio).

O miolo novo — descobrir onde cada dupla caiu — é este:

```js
/**
 * Onde a dupla foi eliminada, segundo as partidas gravadas. Vale a partida de
 * rodada MAIS ALTA em que ela aparece como perdedora e que tenha degrau no mapa:
 * na dupla eliminação a mesma dupla perde na WB (sem eliminar) antes de perder na
 * LB (aí sim eliminada).
 */
function finalPlaceForTeam(teamId, matches, tiers) {
  let melhor = null; // {round, tier}
  for (const match of matches) {
    const tipo = normalizeMatchType(match.matchType);
    const round = Number(match.round ?? 0);
    const winnerId = (match.winnerId || "").trim();
    if (!winnerId) continue;
    const lados = [(match.teamAId || "").trim(), (match.teamBId || "").trim()];
    if (!lados.includes(teamId) || winnerId === teamId) continue;
    const tier = tipo === "lb" ? tiers.lb[round] : tipo === "knockout" ? tiers.knockout[round] : undefined;
    if (!tier) continue;
    if (!melhor || round > melhor.round) melhor = {round, tier};
  }
  if (!melhor) return 0; // nenhuma eliminação com degrau: participação
  return melhor.tier === "quarters" ? 5 : melhor.tier === "r16" ? 9 : 17;
}
```

E o guarda que decide se a categoria é tocada:

```js
/**
 * Recusa a categoria inteira quando a chave não fecha. Chave torta some do radar
 * se o script "consertar" o que não entende — a disciplina é a mesma do PR #258.
 */
function categoriaConfiavel(matches, resultados) {
  if (matches.length === 0) return "sem partidas gravadas";
  for (const match of matches) {
    const tipo = normalizeMatchType(match.matchType);
    if (tipo === "group" || tipo === "groups" || match.isGroupMatch === true) continue;
    if (String(match.status) !== "completed") continue;
    if (!(match.winnerId || "").trim()) return `partida ${match.id} concluída sem winnerId`;
  }
  // O pódio é intocável: quem está gravado como 1º-4º tem que continuar assim.
  const podio = resultados.filter((r) => Number(r.finalPlace) >= 1 && Number(r.finalPlace) <= 4);
  if (podio.length !== 4) return `pódio gravado tem ${podio.length} duplas, esperado 4`;
  return null;
}
```

O pódio nunca é recalculado: resultado com `finalPlace` entre 1 e 4 sai do laço antes da re-derivação, e só os pontos são recalculados por cima da colocação já gravada.

- [ ] **Step 6: Dry-run no dev**

Run: `cd functions && node scripts/rederive-knockout-placements.js --project volley-track-dev-4596c`
Expected: a Copa Goiás masculina aparece com 18 duplas mudando de degrau (4 em quartas 83, 8 em oitavas 50, 6 em 16-avos 33) e a feminina só com a conversão de participação `finalPlace 9 → 0`, sem mudança de pontos. Zero avisos. Se o pódio aparecer como alterado, PARE: é bug do script, não do dado.

- [ ] **Step 7: Commit**

```bash
git add functions/scripts/lib/bracket-placement-tiers.js functions/scripts/rederive-knockout-placements.js functions/test/bracket-placement-tiers-parity.test.mjs functions/package.json
git commit -m "feat(ranking): re-derivação da colocação do histórico pela estrutura da chave (NEXAGO)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Regressão

- [ ] **Step 1:** `cd functions && npm test` (foreground) → PASS.
- [ ] **Step 2:** `cd functions && npm run lint` → 0 erros.
- [ ] **Step 3:** `cd nexago_app && flutter test` (foreground) → PASS.
- [ ] **Step 4:** `cd frontend && npx ng test organizer --watch=false` (foreground) → PASS.
- [ ] **Step 5:** Conferir que `docs/business-rules/ranking.md` descreve a escada nova (degraus, faixas e o `finalPlace` de participação em 0); ajustar se ficou defasado e commitar junto.

---

### Task 8: Deploy dev + re-derivação (GATED — confirmar com o dono)

**Ordem obrigatória** (mesma janela — o motor novo passa a premiar por fase enquanto o histórico ainda está no balde velho; o script converge depois, mas quanto menor a janela, menos ruído):

- [ ] **Step 1: Confirmar com o dono** que é hora do DEV (produção fora deste plano).
- [ ] **Step 2: Deploy** — `firebase deploy --only functions --project volley-track-dev-4596c`. Conferir na saída que `onTournamentMatchCompletedUpdateRatings` foi atualizada (uma segunda passada mostrando `Skipped (No changes detected)` prova que o código publicado é o local).
- [ ] **Step 3: Re-derivação valendo** — `cd functions && node scripts/rederive-knockout-placements.js --project volley-track-dev-4596c --yes`.
- [ ] **Step 4: Recálculo de pesos por cima** — `node scripts/recompute-ranking-weights.js --project volley-track-dev-4596c` (dry-run). Deve dar **0 candidatos**: a re-derivação já grava os pontos pela fórmula completa. Se aparecer candidato, os dois scripts divergiram — investigar antes de escrever.
- [ ] **Step 5: Verificação** — re-rodar a re-derivação em dry-run (0 mudanças = convergiu) e conferir um doc de `athleteRankings` com `totalPoints == soma(results) == soma(pointsByYear)`.
