# Pontuação do modo Livre pela força real do campo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o peso de uma categoria `livre` no ranking geral sair da força real do campo inscrito, em vez do piso declarado da faixa, e devolver ao Livre os pontos de participação.

**Architecture:** Uma camada pura calcula o peso a partir dos degraus das duplas; uma camada de store lê os degraus em lote e grava um carimbo numa coleção que o cliente não escreve. O carimbo é feito no mesmo batch que publica a chave (onde o elenco congela) e, se faltar, a premiação mede na hora e carimba. A mesma matemática é espelhada em JS para o script de histórico, travada por teste de paridade.

**Tech Stack:** TypeScript (Cloud Functions v2, firebase-admin), `node --test` sobre o bundle compilado em `lib/`, scripts Node standalone em `functions/scripts/`, Firestore Rules.

**Spec:** `docs/superpowers/specs/2026-09-10-livre-field-strength-ranking-design.md`

## Global Constraints

- Comentários e mensagens em **português**; identificadores em **inglês**.
- Suíte: `cd functions && npm test` (roda `tsc` e depois `node --test lib/*.test.js ... test/*.test.mjs`). Teste isolado: `cd functions && npm run build && node --test lib/<arquivo>.test.js`.
- Lint/tipos: `cd functions && npm run lint` (é `tsc --noEmit`).
- Escopo **exclusivo** do preset `livre` e do ranking **geral**. `functions/src/league-ranking.ts` **não muda de comportamento**.
- Peso **nunca** é lido de campo gravado em `tournaments/{id}` — o carimbo mora em coleção com escrita só de admin.
- Peso medido: piso **0.125**, teto **1.0**, arredondamento **`Math.round`**.
- `bracketSizeFactor` **continua** contando duplas pagas a cada premiação (não congela).
- Ordem obrigatória de scripts: `rederive-knockout-placements.js` **antes** de `recompute-ranking-weights.js`.
- Rollout: **DEV antes de PROD**, e **deploy antes de script**.
- Escada de degraus (fixa): `iniciante_1`=0, `iniciante_2`=1, `intermediario_1`=2, `intermediario_2`=3, `avancado_1`=4, `avancado_2`=5, `open`=6.

---

### Task 1: Módulo puro da força do campo

**Files:**
- Create: `functions/src/category-field-strength.ts`
- Test: `functions/src/category-field-strength.test.ts`

**Interfaces:**
- Consumes: nada (módulo folha, sem I/O).
- Produces: `LIVRE_MIN_WEIGHT: number`, `LIVRE_MAX_WEIGHT: number`, `teamLevelRank(memberRanks: Array<number | null | undefined>): number | null`, `weightFromRank(rank: number): number`, `interface FieldStrength {fieldRank: number; weight: number; measuredTeams: number}`, `fieldStrengthFromTeamRanks(teamRanks: Array<number | null>): FieldStrength | null`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `functions/src/category-field-strength.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  fieldStrengthFromTeamRanks,
  LIVRE_MAX_WEIGHT,
  LIVRE_MIN_WEIGHT,
  teamLevelRank,
  weightFromRank,
} from "./category-field-strength";

describe("teamLevelRank", () => {
  it("dupla vale o integrante MAIS FORTE (convenção da elegibilidade)", () => {
    assert.equal(teamLevelRank([2, 6]), 6);
    assert.equal(teamLevelRank([6, 2]), 6);
    assert.equal(teamLevelRank([0, 0]), 0);
  });

  it("ignora integrante sem degrau conhecido", () => {
    assert.equal(teamLevelRank([null, 3]), 3);
    assert.equal(teamLevelRank([undefined, 4, null]), 4);
  });

  it("dupla sem nenhum degrau conhecido é null", () => {
    assert.equal(teamLevelRank([null, null]), null);
    assert.equal(teamLevelRank([]), null);
    assert.equal(teamLevelRank([Number.NaN]), null);
  });
});

describe("weightFromRank", () => {
  it("ancora na escada de presets fechados", () => {
    assert.equal(weightFromRank(0), 0.125);
    assert.equal(weightFromRank(1), 0.125);
    assert.equal(weightFromRank(2), 0.25);
    assert.equal(weightFromRank(3), 0.25);
    assert.equal(weightFromRank(4), 0.5);
    assert.equal(weightFromRank(5), 0.5);
    assert.equal(weightFromRank(6), 1);
  });

  it("arredonda o degrau médio (Math.round, não piso)", () => {
    assert.equal(weightFromRank(4.2), 0.5);
    assert.equal(weightFromRank(5.4), 0.5);
    // 9 duplas Open + 1 intermediária = 5.6: com piso pagaria 0.5.
    assert.equal(weightFromRank(5.6), 1);
    assert.equal(weightFromRank(1.5), 0.25);
  });

  it("clampa nos dois extremos e sobrevive a valor inválido", () => {
    assert.equal(weightFromRank(-3), LIVRE_MIN_WEIGHT);
    assert.equal(weightFromRank(99), LIVRE_MAX_WEIGHT);
    assert.equal(weightFromRank(Number.NaN), LIVRE_MIN_WEIGHT);
  });
});

describe("fieldStrengthFromTeamRanks", () => {
  it("regressão DESAFIO OPEN - JHON JHON: 5 duplas com Open pesam 0.5", () => {
    const strength = fieldStrengthFromTeamRanks([6, 6, 6, 6, 6, 3, 3, 2, 2, 2]);
    assert.ok(strength);
    assert.equal(strength.measuredTeams, 10);
    assert.equal(strength.fieldRank, 4.2);
    assert.equal(strength.weight, 0.5);
  });

  it("duplas sem degrau ficam fora da média", () => {
    const strength = fieldStrengthFromTeamRanks([6, null, 2]);
    assert.ok(strength);
    assert.equal(strength.measuredTeams, 2);
    assert.equal(strength.fieldRank, 4);
    assert.equal(strength.weight, 0.5);
  });

  it("campo imensurável devolve null (não vira peso zero)", () => {
    assert.equal(fieldStrengthFromTeamRanks([null, null]), null);
    assert.equal(fieldStrengthFromTeamRanks([]), null);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd functions && npm run build
```

Esperado: FALHA no `tsc` com `Cannot find module './category-field-strength'`.

- [ ] **Step 3: Escrever a implementação mínima**

Crie `functions/src/category-field-strength.ts`:

```ts
/**
 * Força real do campo de uma categoria LIVRE (spec 2026-09-10).
 *
 * O preset `livre` (faixa 0–6) pesa 0.125 na tabela de presets porque o peso foi
 * escolhido pelo PISO declarado da faixa. Quando o campo que de fato se inscreveu
 * é forte, esse peso pune a categoria inteira: no `DESAFIO OPEN - JHON JHON`, 5
 * das 10 duplas tinham um Open e o campeão saiu com 125 pontos.
 *
 * Este módulo é PURO (sem I/O) e responde a uma pergunta só: dados os degraus das
 * duplas, quanto vale esta categoria? A leitura do Firestore mora em
 * `category-field-strength-store.ts`.
 */

/** Piso e teto do peso medido (D3: o Livre nunca alcança o Elite, 1.2). */
export const LIVRE_MIN_WEIGHT = 0.125;
export const LIVRE_MAX_WEIGHT = 1;

/**
 * Degrau de uma dupla = o do integrante MAIS FORTE — a mesma convenção que
 * `category-level-eligibility.ts` usa para decidir quem pode se inscrever
 * ("Para duplas, vale o atleta de MAIOR nível"). `null` quando nenhum integrante
 * tem degrau conhecido.
 */
export function teamLevelRank(
  memberRanks: Array<number | null | undefined>,
): number | null {
  let best: number | null = null;
  for (const rank of memberRanks) {
    if (typeof rank !== "number" || !Number.isFinite(rank)) continue;
    if (best == null || rank > best) best = rank;
  }
  return best;
}

/**
 * Degrau médio → peso, ancorado na escada de presets FECHADOS. `Math.round` (D7)
 * em vez de piso: com piso, um campo de 9 duplas Open e 1 intermediária (média
 * 5.6) pagaria 0.5 e o teto de 1.0 seria inalcançável fora de um Open puro.
 */
export function weightFromRank(rank: number): number {
  if (!Number.isFinite(rank)) return LIVRE_MIN_WEIGHT;
  const step = Math.round(rank);
  const weight = step <= 1 ? 0.125 : step <= 3 ? 0.25 : step <= 5 ? 0.5 : 1;
  return Math.min(LIVRE_MAX_WEIGHT, Math.max(LIVRE_MIN_WEIGHT, weight));
}

export interface FieldStrength {
  /** Média NÃO arredondada dos degraus das duplas — guardada para auditoria. */
  fieldRank: number;
  /** Peso já arredondado e clampado. */
  weight: number;
  /** Duplas que entraram na média (as sem degrau algum ficam de fora). */
  measuredTeams: number;
}

/**
 * Média dos degraus das duplas mensuráveis. `null` quando NENHUMA dupla é
 * mensurável — nesse caso o chamador NÃO carimba: a premiação cai no peso
 * declarado e tenta medir de novo depois, já que os atletas podem declarar nível
 * mais tarde. Carimbar um zero congelaria o pior caso para sempre.
 */
export function fieldStrengthFromTeamRanks(
  teamRanks: Array<number | null>,
): FieldStrength | null {
  const known = teamRanks.filter(
    (rank): rank is number => typeof rank === "number" && Number.isFinite(rank),
  );
  if (known.length === 0) return null;
  const fieldRank = known.reduce((sum, rank) => sum + rank, 0) / known.length;
  return {
    fieldRank,
    weight: weightFromRank(fieldRank),
    measuredTeams: known.length,
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd functions && npm run build && node --test lib/category-field-strength.test.js
```

Esperado: PASS em todos os casos.

- [ ] **Step 5: Commit**

```bash
git add functions/src/category-field-strength.ts functions/src/category-field-strength.test.ts
git commit -m "feat(ranking): matemática pura da força do campo no preset Livre"
```

---

### Task 2: Store da força do campo (leitura em lote e carimbo)

**Files:**
- Create: `functions/src/category-field-strength-store.ts`
- Test: `functions/src/category-field-strength-store.test.ts`

**Interfaces:**
- Consumes: `teamLevelRank`, `fieldStrengthFromTeamRanks`, `FieldStrength` (Task 1); `artifactsPublicDataBase`, `artifactsInscriptionsPath` de `./firebase-paths`; `athleteRatingDocId(athleteId: string, sportCode: string): string` e `athleteRatingsPath(projectId: string): string` de `./rating-engine`.
- Produces: `fieldStrengthPath(projectId: string): string`, `fieldStrengthDocId(tournamentId: string, categoryId: string): string`, `type FieldStrengthSource = "bracket" | "lazy" | "backfill"`, `interface FieldStrengthStamp extends FieldStrength {tournamentId: string; categoryId: string; presetKey: string; totalPaidTeams: number; source: FieldStrengthSource}`, `paidTeamsWithParticipants(docs): Map<string, string[]>`, `loadPaidTeamsWithParticipants(db, projectId, tournamentId, categoryId): Promise<Map<string, string[]>>`, `loadAthleteLevelRanks(db, projectId, uids, sportCode): Promise<Map<string, number>>`, `measureFieldStrength(db, projectId, params): Promise<FieldStrengthStamp | null>`, `fieldStrengthStampPayload(stamp): Record<string, unknown>`, `readFieldStrengthStamp(db, projectId, tournamentId, categoryId): Promise<FieldStrengthStamp | null>`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `functions/src/category-field-strength-store.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  fieldStrengthDocId,
  fieldStrengthPath,
  loadAthleteLevelRanks,
  measureFieldStrength,
  paidTeamsWithParticipants,
  readFieldStrengthStamp,
} from "./category-field-strength-store";

const PROJECT = "proj";

function doc(data: Record<string, unknown>) {
  return {data: () => data};
}

describe("paidTeamsWithParticipants", () => {
  it("agrupa uids por time, ignorando não-pagas e fila de espera", () => {
    const teams = paidTeamsWithParticipants([
      doc({teamId: "tA", isPaid: true, participantUids: ["a1", "a2"]}),
      doc({teamId: "tB", isPaid: false, participantUids: ["b1", "b2"]}),
      doc({teamId: "tC", isPaid: true, waitlist: true, participantUids: ["c1"]}),
      doc({teamId: "", isPaid: true, participantUids: ["x1"]}),
    ]);
    assert.equal(teams.size, 1);
    assert.deepEqual(teams.get("tA"), ["a1", "a2"]);
  });

  it("time pago sem participantUids entra com lista vazia (conta no total)", () => {
    const teams = paidTeamsWithParticipants([doc({teamId: "tA", isPaid: true})]);
    assert.deepEqual(teams.get("tA"), []);
  });
});

describe("loadAthleteLevelRanks", () => {
  it("lê levelRank pelo id {uid}_{SPORT_CODE} em uma única ida", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/a1_VOLEI_PRAIA`, {levelRank: 6});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/a2_VOLEI_PRAIA`, {levelRank: 2});

    const ranks = await loadAthleteLevelRanks(
      db as never, PROJECT, ["a1", "a2", "sem-doc"], "VOLEI_PRAIA",
    );
    assert.equal(ranks.get("a1"), 6);
    assert.equal(ranks.get("a2"), 2);
    assert.equal(ranks.has("sem-doc"), false);
  });

  it("lista vazia ou esporte desconhecido não vai ao banco", async () => {
    const db = new FakeFirestore();
    assert.equal((await loadAthleteLevelRanks(db as never, PROJECT, [], "VOLEI_PRAIA")).size, 0);
    assert.equal((await loadAthleteLevelRanks(db as never, PROJECT, ["a1"], "")).size, 0);
  });
});

describe("measureFieldStrength", () => {
  it("mede pelo integrante mais forte de cada dupla", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/a1_VOLEI_PRAIA`, {levelRank: 6});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/a2_VOLEI_PRAIA`, {levelRank: 2});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/b1_VOLEI_PRAIA`, {levelRank: 2});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/b2_VOLEI_PRAIA`, {levelRank: 2});

    const stamp = await measureFieldStrength(db as never, PROJECT, {
      tournamentId: "T1",
      categoryId: "C1",
      presetKey: "livre",
      sportCode: "VOLEI_PRAIA",
      teams: new Map([["tA", ["a1", "a2"]], ["tB", ["b1", "b2"]]]),
      source: "bracket",
    });

    assert.ok(stamp);
    assert.equal(stamp.fieldRank, 4);
    assert.equal(stamp.weight, 0.5);
    assert.equal(stamp.measuredTeams, 2);
    assert.equal(stamp.totalPaidTeams, 2);
    assert.equal(stamp.source, "bracket");
  });

  it("campo sem nenhum degrau conhecido devolve null", async () => {
    const db = new FakeFirestore();
    const stamp = await measureFieldStrength(db as never, PROJECT, {
      tournamentId: "T1", categoryId: "C1", presetKey: "livre",
      sportCode: "VOLEI_PRAIA",
      teams: new Map([["tA", ["a1"]]]),
      source: "bracket",
    });
    assert.equal(stamp, null);
  });

  it("esporte sem código de nível devolve null", async () => {
    const db = new FakeFirestore();
    const stamp = await measureFieldStrength(db as never, PROJECT, {
      tournamentId: "T1", categoryId: "C1", presetKey: "livre",
      sportCode: null,
      teams: new Map([["tA", ["a1"]]]),
      source: "bracket",
    });
    assert.equal(stamp, null);
  });
});

describe("readFieldStrengthStamp", () => {
  it("lê o carimbo gravado", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${fieldStrengthPath(PROJECT)}/${fieldStrengthDocId("T1", "C1")}`, {
      tournamentId: "T1", categoryId: "C1", presetKey: "livre",
      fieldRank: 4.2, weight: 0.5, measuredTeams: 10, totalPaidTeams: 10,
      source: "bracket",
    });
    const stamp = await readFieldStrengthStamp(db as never, PROJECT, "T1", "C1");
    assert.ok(stamp);
    assert.equal(stamp.weight, 0.5);
    assert.equal(stamp.fieldRank, 4.2);
  });

  it("carimbo ausente ou com peso inválido devolve null", async () => {
    const db = new FakeFirestore();
    assert.equal(await readFieldStrengthStamp(db as never, PROJECT, "T1", "C1"), null);
    db.seedDoc(`${fieldStrengthPath(PROJECT)}/${fieldStrengthDocId("T2", "C2")}`, {weight: 0});
    assert.equal(await readFieldStrengthStamp(db as never, PROJECT, "T2", "C2"), null);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd functions && npm run build
```

Esperado: FALHA com `Cannot find module './category-field-strength-store'`.

- [ ] **Step 3: Escrever a implementação mínima**

Crie `functions/src/category-field-strength-store.ts`:

```ts
import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {artifactsInscriptionsPath, artifactsPublicDataBase} from "./firebase-paths";
import {athleteRatingDocId, athleteRatingsPath} from "./rating-engine";
import {
  fieldStrengthFromTeamRanks,
  teamLevelRank,
  type FieldStrength,
} from "./category-field-strength";

/**
 * Carimbo da força do campo (spec 2026-09-10). Coleção separada, e não um campo
 * em `tournaments/{id}`, porque o organizador escreve o doc do torneio — o peso
 * do ranking não pode ser alcançável pelo cliente.
 */
export function fieldStrengthPath(projectId: string): string {
  return `${artifactsPublicDataBase(projectId)}/tournamentCategoryFieldStrength`;
}

export function fieldStrengthDocId(tournamentId: string, categoryId: string): string {
  return `${tournamentId}_${categoryId}`;
}

export type FieldStrengthSource = "bracket" | "lazy" | "backfill";

export interface FieldStrengthStamp extends FieldStrength {
  tournamentId: string;
  categoryId: string;
  presetKey: string;
  /** Duplas pagas no instante do carimbo — AUDITORIA apenas: `bracketSizeFactor` segue contando ao vivo. */
  totalPaidTeams: number;
  source: FieldStrengthSource;
}

/**
 * Times pagos com os uids dos integrantes, a partir de um snapshot de
 * `inscriptions` JÁ LIDO. A definição de "paga" é a mesma de `loadPaidTeamIds`
 * (`isPaid` e fora da fila), para que a medida e o `bracketSizeFactor` enxerguem
 * exatamente o mesmo conjunto de duplas.
 */
export function paidTeamsWithParticipants(
  docs: Array<{data: () => Record<string, unknown>}>,
): Map<string, string[]> {
  const teams = new Map<string, string[]>();
  for (const doc of docs) {
    const data = doc.data();
    if (data.isPaid !== true) continue;
    if (data.waitlist === true) continue;
    const teamId = String(data.teamId ?? "").trim();
    if (!teamId) continue;
    const uids = Array.isArray(data.participantUids)
      ? data.participantUids
        .map((uid) => String(uid ?? "").trim())
        .filter((uid) => uid.length > 0)
      : [];
    teams.set(teamId, [...(teams.get(teamId) ?? []), ...uids]);
  }
  return teams;
}

/** Mesma query de `loadPaidTeamIds`, devolvendo também os integrantes. */
export async function loadPaidTeamsWithParticipants(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<Map<string, string[]>> {
  const snap = await db
    .collection(artifactsInscriptionsPath(projectId))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();
  return paidTeamsWithParticipants(snap.docs);
}

/**
 * Degraus por atleta em UMA ida ao Firestore (`getAll` dos docs de rating, cujo
 * id é `{uid}_{SPORT_CODE}`). `levelRank` já vem calculado ali e é mantido em
 * sincronia com `users/{uid}.sportOnboarding.levelsBySport` pelo fluxo de nível.
 */
export async function loadAthleteLevelRanks(
  db: Firestore,
  projectId: string,
  uids: string[],
  sportCode: string,
): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  const unique = [...new Set(uids.map((uid) => uid.trim()).filter((uid) => uid.length > 0))];
  if (unique.length === 0 || !sportCode) return ranks;

  const refs = unique.map((uid) =>
    db.doc(`${athleteRatingsPath(projectId)}/${athleteRatingDocId(uid, sportCode)}`),
  );
  const snaps = await db.getAll(...refs);
  snaps.forEach((snap, index) => {
    const rank = Number(snap.data()?.levelRank);
    if (Number.isFinite(rank)) ranks.set(unique[index], rank);
  });
  return ranks;
}

/**
 * Mede a força do campo. `null` quando não dá para medir (sem esporte de nível,
 * sem duplas pagas, ou nenhum atleta com degrau conhecido) — e nesse caso o
 * chamador NÃO deve carimbar.
 */
export async function measureFieldStrength(
  db: Firestore,
  projectId: string,
  params: {
    tournamentId: string;
    categoryId: string;
    presetKey: string;
    sportCode: string | null;
    teams: Map<string, string[]>;
    source: FieldStrengthSource;
  },
): Promise<FieldStrengthStamp | null> {
  if (!params.sportCode || params.teams.size === 0) return null;

  const ranks = await loadAthleteLevelRanks(
    db,
    projectId,
    [...params.teams.values()].flat(),
    params.sportCode,
  );
  const teamRanks = [...params.teams.values()].map((uids) =>
    teamLevelRank(uids.map((uid) => ranks.get(uid) ?? null)),
  );
  const strength = fieldStrengthFromTeamRanks(teamRanks);
  if (!strength) return null;

  return {
    ...strength,
    tournamentId: params.tournamentId,
    categoryId: params.categoryId,
    presetKey: params.presetKey,
    totalPaidTeams: params.teams.size,
    source: params.source,
  };
}

/** Payload do carimbo (o chamador decide se escreve em batch ou direto). */
export function fieldStrengthStampPayload(
  stamp: FieldStrengthStamp,
): Record<string, unknown> {
  return {...stamp, stampedAt: FieldValue.serverTimestamp()};
}

export async function readFieldStrengthStamp(
  db: Firestore,
  projectId: string,
  tournamentId: string,
  categoryId: string,
): Promise<FieldStrengthStamp | null> {
  const snap = await db
    .doc(`${fieldStrengthPath(projectId)}/${fieldStrengthDocId(tournamentId, categoryId)}`)
    .get();
  const data = snap.data();
  if (!data) return null;

  const weight = Number(data.weight);
  if (!Number.isFinite(weight) || weight <= 0) return null;

  return {
    tournamentId,
    categoryId,
    presetKey: String(data.presetKey ?? "livre"),
    fieldRank: Number(data.fieldRank) || 0,
    weight,
    measuredTeams: Number(data.measuredTeams) || 0,
    totalPaidTeams: Number(data.totalPaidTeams) || 0,
    source: String(data.source ?? "bracket") as FieldStrengthSource,
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd functions && npm run build && node --test lib/category-field-strength-store.test.js
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/category-field-strength-store.ts functions/src/category-field-strength-store.test.ts
git commit -m "feat(ranking): store da força do campo com leitura de degraus em lote"
```

---

### Task 3: Carimbar na geração da chave + regra do Firestore

**Files:**
- Modify: `functions/src/organizer-category-ops.ts` (dentro de `runGenerateCategoryBracket`, no batch que já existe por volta da linha 358)
- Modify: `firestore.rules` (junto do bloco de `tournamentCategoryResults`, por volta da linha 2158)
- Test: `functions/src/organizer-category-ops.field-strength.test.ts`

**Interfaces:**
- Consumes: `measureFieldStrength`, `paidTeamsWithParticipants`, `fieldStrengthStampPayload`, `fieldStrengthPath`, `fieldStrengthDocId` (Task 2); `categoryPreset` de `./category-presets`; `tournamentSportToLevelSportCode(sport: unknown): string | null` de `./category-level-eligibility`.
- Produces: docs em `artifacts/{appId}/public/data/tournamentCategoryFieldStrength/{tournamentId}_{categoryId}` com `source: "bracket"`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `functions/src/organizer-category-ops.field-strength.test.ts`. O teste exercita só a decisão de carimbar, via as peças puras/store, porque `runGenerateCategoryBracket` depende de `getFirestore()` global:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {categoryPreset} from "./category-presets";
import {tournamentSportToLevelSportCode} from "./category-level-eligibility";
import {
  fieldStrengthDocId,
  fieldStrengthPath,
  measureFieldStrength,
  paidTeamsWithParticipants,
} from "./category-field-strength-store";

const PROJECT = "proj";

describe("carimbo na geração da chave", () => {
  it("categoria Livre (piso Iniciante 1, teto Open) é reconhecida como livre", () => {
    const preset = categoryPreset({level: "Open", minLevel: "Iniciante 1"});
    assert.equal(preset?.key, "livre");
    assert.equal(preset?.weight, 0.125);
  });

  it("categoria de faixa fechada NÃO é livre e não deve carimbar", () => {
    assert.equal(categoryPreset({level: "Open", minLevel: "Avançado 1"})?.key, "open");
    assert.equal(categoryPreset({level: "Intermediário 2", minLevel: "Intermediário 1"})?.key, "intermediario");
  });

  it("mede a partir do snapshot de inscrições da chave", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/a1_VOLEI_PRAIA`, {levelRank: 6});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/a2_VOLEI_PRAIA`, {levelRank: 2});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/b1_VOLEI_PRAIA`, {levelRank: 3});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/b2_VOLEI_PRAIA`, {levelRank: 2});

    const docs = [
      {data: () => ({teamId: "tA", isPaid: true, participantUids: ["a1", "a2"]})},
      {data: () => ({teamId: "tB", isPaid: true, participantUids: ["b1", "b2"]})},
    ];

    const stamp = await measureFieldStrength(db as never, PROJECT, {
      tournamentId: "T1",
      categoryId: "C1",
      presetKey: "livre",
      sportCode: tournamentSportToLevelSportCode("beachVolleyball"),
      teams: paidTeamsWithParticipants(docs),
      source: "bracket",
    });

    assert.ok(stamp);
    // Duplas valem 6 e 3 → média 4.5 → round 5 → faixa Avançado.
    assert.equal(stamp.fieldRank, 4.5);
    assert.equal(stamp.weight, 0.5);
    assert.equal(stamp.source, "bracket");
  });

  it("id do carimbo é {tournamentId}_{categoryId} na coleção própria", () => {
    assert.equal(fieldStrengthDocId("T1", "C1"), "T1_C1");
    assert.equal(
      fieldStrengthPath(PROJECT),
      `artifacts/${PROJECT}/public/data/tournamentCategoryFieldStrength`,
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que passa nas peças e falha na integração**

```bash
cd functions && npm run build && node --test lib/organizer-category-ops.field-strength.test.js
```

Esperado: PASS (as peças das Tasks 1 e 2 já existem). Este teste trava o contrato; o passo 3 liga o carimbo ao gerador de chave.

- [ ] **Step 3: Ligar o carimbo ao gerador de chave**

Em `functions/src/organizer-category-ops.ts`, adicione aos imports:

```ts
import {categoryPreset} from "./category-presets";
import {tournamentSportToLevelSportCode} from "./category-level-eligibility";
import {
  fieldStrengthDocId,
  fieldStrengthPath,
  fieldStrengthStampPayload,
  measureFieldStrength,
  paidTeamsWithParticipants,
} from "./category-field-strength-store";
```

Em `runGenerateCategoryBracket`, depois do `batch.set(tournamentRef, {...})` que grava `bracketStatus: "published"` e **antes** de `await batch.commit();`, insira:

```ts
  // Força real do campo (spec 2026-09-10). A categoria Livre pesa 0.125 pela
  // faixa DECLARADA, o que pune um campo forte. O peso medido é carimbado aqui,
  // no mesmo batch da chave, porque é aqui que o elenco congela: a partir de
  // `bracketStatus` a substituição de atleta já é bloqueada.
  const fieldStrengthPreset = categoryPreset(categoryMeta);
  if (fieldStrengthPreset?.key === "livre") {
    const strength = await measureFieldStrength(db, projectId, {
      tournamentId,
      categoryId,
      presetKey: fieldStrengthPreset.key,
      sportCode: tournamentSportToLevelSportCode(tournamentData.sport),
      teams: paidTeamsWithParticipants(inscriptionsSnap.docs),
      source: "bracket",
    });
    // Campo imensurável NÃO é carimbado: um zero congelaria o pior caso para
    // sempre. Sem carimbo, a premiação mede de novo (caminho preguiçoso).
    if (strength) {
      batch.set(
        db.doc(
          `${fieldStrengthPath(projectId)}/${fieldStrengthDocId(tournamentId, categoryId)}`,
        ),
        fieldStrengthStampPayload(strength),
      );
    }
  }
```

- [ ] **Step 4: Adicionar a regra do Firestore**

Em `firestore.rules`, logo depois do bloco `match /artifacts/{appId}/public/data/tournamentCategoryResults/{resultId}`, insira:

```
    // Força medida do campo de uma categoria Livre (spec 2026-09-10).
    // Leitura pública (auditoria do peso); escrita só server-side — o peso do
    // ranking não pode ser alcançável pelo organizador.
    match /artifacts/{appId}/public/data/tournamentCategoryFieldStrength/{stampId} {
      allow read: if true;
      allow create, update, delete: if request.auth != null && isAdmin();
    }
```

- [ ] **Step 5: Rodar a suíte inteira e os tipos**

```bash
cd functions && npm run lint && npm test
```

Esperado: `tsc --noEmit` sem erros e suíte verde.

- [ ] **Step 6: Commit**

```bash
git add functions/src/organizer-category-ops.ts functions/src/organizer-category-ops.field-strength.test.ts firestore.rules
git commit -m "feat(ranking): carimba a força do campo Livre ao publicar a chave"
```

---

### Task 4: Premiação usa o peso medido (com fallback preguiçoso)

**Files:**
- Modify: `functions/src/tournament-ranking.ts` (dentro de `tryAwardGlobalRankingForMatch`, linhas ~372-441)
- Test: `functions/src/tournament-ranking.test.ts`

**Interfaces:**
- Consumes: `readFieldStrengthStamp`, `measureFieldStrength`, `loadPaidTeamsWithParticipants`, `fieldStrengthStampPayload`, `fieldStrengthPath`, `fieldStrengthDocId` (Task 2); `tournamentSportToLevelSportCode` de `./category-level-eligibility`.
- Produces: nenhuma assinatura nova exportada; muda o valor de `pointsMultiplier` para categorias `livre`.

- [ ] **Step 1: Escrever o teste que falha**

Em `functions/src/tournament-ranking.test.ts`, adicione ao final do arquivo:

```ts
describe("peso do Livre pela força real do campo", () => {
  /** `seededDb` não grava `categories` nem `participantUids`; este helper completa. */
  function livreDb(teamRanks: number[]): FakeFirestore {
    const db = new FakeFirestore();
    db.seedDoc("tournaments/T1", {
      sport: "beachVolleyball",
      rankingEnabled: true,
      categories: [{id: "C1", level: "Open", minLevel: "Iniciante 1"}],
    });
    db.seedDoc(`artifacts/${PROJECT}/public/data/teams/tA`, {player1Id: "a1", player2Id: "a2"});
    db.seedDoc(`artifacts/${PROJECT}/public/data/teams/tB`, {player1Id: "b1", player2Id: "b2"});
    db.seedDoc(`artifacts/${PROJECT}/public/data/matches/m-final`, finalMatch());

    teamRanks.forEach((rank, index) => {
      const teamId = index === 0 ? "tA" : index === 1 ? "tB" : `tG${index}`;
      const uid = `${teamId}-p1`;
      db.seedDoc(`artifacts/${PROJECT}/public/data/inscriptions/i${index}`, {
        tournamentId: "T1",
        categoryId: "C1",
        teamId,
        isPaid: true,
        participantUids: [uid],
      });
      db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/${uid}_VOLEI_PRAIA`, {
        levelRank: rank,
      });
    });
    return db;
  }

  const JHON_JHON_RANKS = [6, 6, 6, 6, 6, 3, 3, 2, 2, 2];

  it("regressão DESAFIO OPEN - JHON JHON: campeão sai com 500, não 125", async () => {
    const db = livreDb(JHON_JHON_RANKS);
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());

    const champion = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`);
    assert.equal(champion?.pointsEarned, 500);
    const runnerUp = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tB`);
    assert.equal(runnerUp?.pointsEarned, 400);
  });

  it("mede e carimba quando a chave saiu antes do deploy (caminho preguiçoso)", async () => {
    const db = livreDb(JHON_JHON_RANKS);
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());

    const stamp = db.store.get(
      `artifacts/${PROJECT}/public/data/tournamentCategoryFieldStrength/T1_C1`,
    );
    assert.ok(stamp);
    assert.equal(stamp.weight, 0.5);
    assert.equal(stamp.source, "lazy");
  });

  it("carimbo existente vence a medição (não remede a cada partida)", async () => {
    const db = livreDb(JHON_JHON_RANKS);
    db.seedDoc(`artifacts/${PROJECT}/public/data/tournamentCategoryFieldStrength/T1_C1`, {
      tournamentId: "T1", categoryId: "C1", presetKey: "livre",
      fieldRank: 6, weight: 1, measuredTeams: 10, totalPaidTeams: 10, source: "bracket",
    });
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());

    const champion = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`);
    assert.equal(champion?.pointsEarned, 1000);
  });

  it("campo imensurável cai no peso declarado e NÃO carimba", async () => {
    const db = livreDb(JHON_JHON_RANKS);
    // Remove todos os degraus: nenhuma dupla é mensurável.
    for (const key of [...db.store.keys()]) {
      if (key.includes("/athleteRatings/")) db.store.delete(key);
    }
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());

    const champion = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tA`);
    assert.equal(champion?.pointsEarned, 125);
    assert.equal(
      db.store.has(`artifacts/${PROJECT}/public/data/tournamentCategoryFieldStrength/T1_C1`),
      false,
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd functions && npm run build && node --test lib/tournament-ranking.test.js
```

Esperado: FALHA — o campeão sai com 125 (peso declarado do Livre) e nenhum carimbo é gravado.

- [ ] **Step 3: Escrever a implementação**

Em `functions/src/tournament-ranking.ts`:

**(a)** troque o import de `loadPaidTeamIds` — ele deixa de ser usado por este motor:

```ts
import {
  loadCategoryBracketContext,
  loadKnockoutTeamIds,
  loadTeamAthleteIds,
  normalizeMatchType,
  resolveLeaguePlacementsFromMatch,
  type LeaguePlacementAward,
} from "./league-ranking";
import {tournamentSportToLevelSportCode} from "./category-level-eligibility";
import {
  fieldStrengthDocId,
  fieldStrengthPath,
  fieldStrengthStampPayload,
  loadPaidTeamsWithParticipants,
  measureFieldStrength,
  readFieldStrengthStamp,
} from "./category-field-strength-store";
```

**(b)** substitua o bloco que carrega as duplas pagas:

```ts
  const paidTeamIds = await loadPaidTeamIds(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
```

por:

```ts
  // Mesma query de antes, devolvendo também os integrantes — a medição da força
  // do campo (Livre) sai deste snapshot, sem leitura nova.
  const paidTeams = await loadPaidTeamsWithParticipants(
    db,
    projectId,
    tournamentId,
    categoryId,
  );
  const paidTeamIds = new Set(paidTeams.keys());
```

**(c)** troque a linha que fixa `presetWeight` (hoje logo depois de `const preset = categoryPreset(category);`):

```ts
  const presetWeight = preset?.weight ?? LEGACY_CATEGORY_WEIGHT;
```

por apenas a declaração do preset, **movendo o peso para depois do gate**. Onde hoje está:

```ts
  const pointsMultiplier =
    presetWeight * rankingWeight * bracketSizeFactor(paidTeamIds.size);
```

coloque:

```ts
  // Peso do preset. O Livre é a exceção: a faixa declarada (0–6) dá 0.125 pelo
  // PISO, o que pune um campo forte, então o peso vem da força REAL medida —
  // carimbada na publicação da chave, ou medida aqui e carimbada se faltar.
  let presetWeight = preset?.weight ?? LEGACY_CATEGORY_WEIGHT;
  if (preset?.key === "livre") {
    presetWeight = await resolveLivreWeight(db, projectId, {
      tournamentId,
      categoryId,
      sportCode: tournamentSportToLevelSportCode(tournament.sport),
      paidTeams,
      declaredWeight: preset.weight,
    });
  }

  const pointsMultiplier =
    presetWeight * rankingWeight * bracketSizeFactor(paidTeamIds.size);
```

**(d)** adicione a função auxiliar acima de `tryAwardGlobalRankingForMatch`:

```ts
/**
 * Peso de uma categoria Livre. Ordem: carimbo gravado (o normal, feito na
 * publicação da chave) → medição na hora + carimbo `lazy` (chave publicada antes
 * do deploy) → peso declarado (campo imensurável, e aí NÃO carimba, para que uma
 * medição futura ainda possa acontecer).
 */
async function resolveLivreWeight(
  db: Firestore,
  projectId: string,
  params: {
    tournamentId: string;
    categoryId: string;
    sportCode: string | null;
    paidTeams: Map<string, string[]>;
    declaredWeight: number;
  },
): Promise<number> {
  const stamped = await readFieldStrengthStamp(
    db,
    projectId,
    params.tournamentId,
    params.categoryId,
  );
  if (stamped) return stamped.weight;

  const measured = await measureFieldStrength(db, projectId, {
    tournamentId: params.tournamentId,
    categoryId: params.categoryId,
    presetKey: "livre",
    sportCode: params.sportCode,
    teams: params.paidTeams,
    source: "lazy",
  });
  if (!measured) return params.declaredWeight;

  await db
    .doc(
      `${fieldStrengthPath(projectId)}/` +
        `${fieldStrengthDocId(params.tournamentId, params.categoryId)}`,
    )
    .set(fieldStrengthStampPayload(measured));
  logger.info(
    `globalRanking: força do campo medida em ${params.tournamentId}/${params.categoryId} ` +
      `— degrau ${measured.fieldRank.toFixed(2)}, peso ${measured.weight}`,
  );
  return measured.weight;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd functions && npm run build && node --test lib/tournament-ranking.test.js
```

Esperado: PASS, incluindo os testes antigos (categoria sem `categories` continua caindo em `LEGACY_CATEGORY_WEIGHT`).

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-ranking.ts functions/src/tournament-ranking.test.ts
git commit -m "feat(ranking): premiação do Livre usa o peso medido do campo"
```

---

### Task 5: Livre volta a pagar participação (só no ranking geral)

**Files:**
- Modify: `functions/src/tournament-ranking.ts:444`
- Modify: `functions/src/league-ranking.ts:688` (apenas comentário — divergência deliberada)
- Test: `functions/src/tournament-ranking.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada novo.

- [ ] **Step 1: Escrever o teste que falha**

Em `functions/src/tournament-ranking.test.ts`, dentro do `describe("peso do Livre pela força real do campo")` criado na Task 4, adicione:

```ts
  it("dupla paga fora do mata-mata recebe participação no Livre", async () => {
    const db = livreDb(JHON_JHON_RANKS);
    await tryAwardGlobalRankingForMatch(db as never, PROJECT, finalMatch());

    // tG2 é paga e não aparece na final → balde `groups` (100) × 0.5 = 50.
    const participante = db.store.get(`${tournamentCategoryResultsPath(PROJECT)}/T1_C1_tG2`);
    assert.ok(participante, "dupla paga fora do mata-mata deveria pontuar");
    assert.equal(participante.finalPlace, 0);
    assert.equal(participante.pointsEarned, 50);
  });
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd functions && npm run build && node --test lib/tournament-ranking.test.js
```

Esperado: FALHA com "dupla paga fora do mata-mata deveria pontuar" — a exceção do Livre bloqueia o balde.

- [ ] **Step 3: Remover a exceção**

Em `functions/src/tournament-ranking.ts`, troque:

```ts
  // Times pagos que não chegaram ao mata-mata pontuam pela fase de grupos
  // (mesma regra da liga: só a partir da 1ª partida de mata-mata concluída).
  // Livre não concede participação (D6 emendada): só pontua quem chega
  // ao mata-mata — fecha o farm de "aparecer e levar o bucket groups".
  if (shouldAwardGroupsBucket && preset?.key !== "livre") {
```

por:

```ts
  // Times pagos que não chegaram ao mata-mata pontuam pela fase de grupos
  // (mesma regra da liga: só a partir da 1ª partida de mata-mata concluída).
  // O Livre voltou a conceder participação (spec 2026-09-10, D4): o farm que a
  // exceção combatia agora está PRECIFICADO — num campo fraco a participação
  // vale 13 pontos, num campo forte vale 100 — e a exceção estava deixando
  // dupla pagante com zero (18 casos num único torneio).
  if (shouldAwardGroupsBucket) {
```

Em `functions/src/league-ranking.ts:688`, apenas documente a divergência acima do `if`:

```ts
    // O ranking de LIGA mantém o Livre sem participação de propósito: a spec
    // 2026-09-10 mudou só o ranking GERAL, onde o peso agora é medido. Aqui o
    // peso segue vindo da faixa declarada, então a trava anti-farm continua
    // sendo a única defesa. Não "corrigir" para casar com o motor geral.
    if (preset?.key !== "livre") {
```

- [ ] **Step 4: Rodar a suíte inteira e confirmar que passa**

```bash
cd functions && npm run lint && npm test
```

Esperado: suíte verde, incluindo os testes de liga (que não mudam de comportamento).

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-ranking.ts functions/src/league-ranking.ts functions/src/tournament-ranking.test.ts
git commit -m "feat(ranking): Livre volta a conceder participação no ranking geral"
```

---

### Task 6: Paridade JS da matemática nova

**Files:**
- Modify: `functions/scripts/lib/ranking-recompute.js`
- Test: `functions/test/ranking-recompute.test.mjs`

**Interfaces:**
- Consumes: nada (cópia standalone; o script não pode importar o bundle).
- Produces: `teamLevelRank`, `weightFromRank`, `fieldStrengthFromTeamRanks`, `LIVRE_MIN_WEIGHT`, `LIVRE_MAX_WEIGHT` no `module.exports` de `ranking-recompute.js`, com a mesma semântica das funções TS da Task 1.

- [ ] **Step 1: Escrever o teste que falha**

Em `functions/test/ranking-recompute.test.mjs`, acrescente ao bloco de `require` os nomes novos e adicione um `describe` no final:

```js
const {
  basePointsForFinalPlace,
  levelRank,
  presetWeightForCategory,
  sanitizeRankingWeight,
  bracketSizeFactor,
  pointsForEntry,
  aggregateRankingResults,
  teamLevelRank,
  weightFromRank,
  fieldStrengthFromTeamRanks,
} = require('../scripts/lib/ranking-recompute.js');
```

```js
describe('paridade da força do campo (cópia de src/category-field-strength.ts)', () => {
  test('dupla vale o integrante mais forte', () => {
    assert.equal(teamLevelRank([2, 6]), 6);
    assert.equal(teamLevelRank([null, 3]), 3);
    assert.equal(teamLevelRank([null, null]), null);
    assert.equal(teamLevelRank([]), null);
  });

  test('degrau → peso, com Math.round e clamp', () => {
    assert.equal(weightFromRank(0), 0.125);
    assert.equal(weightFromRank(2), 0.25);
    assert.equal(weightFromRank(4), 0.5);
    assert.equal(weightFromRank(6), 1);
    assert.equal(weightFromRank(4.2), 0.5);
    assert.equal(weightFromRank(5.6), 1);
    assert.equal(weightFromRank(-3), 0.125);
    assert.equal(weightFromRank(99), 1);
    assert.equal(weightFromRank(Number.NaN), 0.125);
  });

  test('DESAFIO OPEN - JHON JHON dá o mesmo 0.5 da versão TypeScript', () => {
    const strength = fieldStrengthFromTeamRanks([6, 6, 6, 6, 6, 3, 3, 2, 2, 2]);
    assert.equal(strength.fieldRank, 4.2);
    assert.equal(strength.weight, 0.5);
    assert.equal(strength.measuredTeams, 10);
  });

  test('campo imensurável devolve null', () => {
    assert.equal(fieldStrengthFromTeamRanks([null, null]), null);
    assert.equal(fieldStrengthFromTeamRanks([]), null);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd functions && node --test test/ranking-recompute.test.mjs
```

Esperado: FALHA com `teamLevelRank is not a function`.

- [ ] **Step 3: Copiar a matemática para o JS**

Em `functions/scripts/lib/ranking-recompute.js`, antes do `module.exports`, adicione:

```js
/**
 * Cópias de `functions/src/category-field-strength.ts` (spec 2026-09-10). O
 * script é standalone e não importa o bundle compilado; `test/ranking-recompute.test.mjs`
 * é quem cobra a paridade. Mudou lá, muda aqui.
 */
const LIVRE_MIN_WEIGHT = 0.125;
const LIVRE_MAX_WEIGHT = 1;

/** Degrau da dupla = integrante MAIS FORTE; null se nenhum é conhecido. */
function teamLevelRank(memberRanks) {
  let best = null;
  for (const rank of memberRanks) {
    if (typeof rank !== "number" || !Number.isFinite(rank)) continue;
    if (best == null || rank > best) best = rank;
  }
  return best;
}

/** Degrau médio → peso, ancorado na escada de presets fechados (Math.round). */
function weightFromRank(rank) {
  if (!Number.isFinite(rank)) return LIVRE_MIN_WEIGHT;
  const step = Math.round(rank);
  const weight = step <= 1 ? 0.125 : step <= 3 ? 0.25 : step <= 5 ? 0.5 : 1;
  return Math.min(LIVRE_MAX_WEIGHT, Math.max(LIVRE_MIN_WEIGHT, weight));
}

/** Média dos degraus das duplas mensuráveis; null quando nenhuma é. */
function fieldStrengthFromTeamRanks(teamRanks) {
  const known = teamRanks.filter(
    (rank) => typeof rank === "number" && Number.isFinite(rank),
  );
  if (known.length === 0) return null;
  const fieldRank = known.reduce((sum, rank) => sum + rank, 0) / known.length;
  return {
    fieldRank,
    weight: weightFromRank(fieldRank),
    measuredTeams: known.length,
  };
}
```

E acrescente ao `module.exports`:

```js
  LIVRE_MIN_WEIGHT,
  LIVRE_MAX_WEIGHT,
  teamLevelRank,
  weightFromRank,
  fieldStrengthFromTeamRanks,
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
cd functions && node --test test/ranking-recompute.test.mjs
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/scripts/lib/ranking-recompute.js functions/test/ranking-recompute.test.mjs
git commit -m "test(ranking): paridade JS da matemática da força do campo"
```

---

### Task 7: Retroativo — repesar as categorias Livre

**Files:**
- Modify: `functions/scripts/recompute-ranking-weights.js` (`resolveContext` ~linha 126, `countPaidTeams` ~linha 185, cabeçalho do arquivo)

**Interfaces:**
- Consumes: `teamLevelRank`, `fieldStrengthFromTeamRanks` de `./lib/ranking-recompute.js` (Task 6).
- Produces: contexto com `weight` já substituído pela força medida quando `presetKey === "livre"`, e campos novos no relatório: `fieldRank`, `measuredTeams`.

- [ ] **Step 1: Trocar a contagem de pagas por um carregamento com integrantes**

Em `functions/scripts/recompute-ranking-weights.js`, substitua `countPaidTeams` por:

```js
/** Paridade com `paidTeamsWithParticipants` (functions/src/category-field-strength-store.ts). */
async function loadPaidTeams(tournamentId, categoryId) {
  const snap = await db
    .collection(dataPath("inscriptions"))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const teams = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.isPaid !== true) continue;
    if (d.waitlist === true) continue;
    const teamId = (d.teamId || "").trim();
    if (!teamId) continue;
    const uids = Array.isArray(d.participantUids)
      ? d.participantUids.map((u) => String(u || "").trim()).filter(Boolean)
      : [];
    teams.set(teamId, [...(teams.get(teamId) || []), ...uids]);
  }
  return teams;
}
```

- [ ] **Step 2: Copiar o mapa de esporte → código de nível**

No mesmo arquivo, junto das outras cópias, adicione:

```js
/** Cópia de `tournamentSportToLevelSportCode` (functions/src/category-level-eligibility.ts). */
function tournamentSportToLevelSportCode(sport) {
  const key = String(sport || "").trim().toLowerCase().replace(/\s+/g, "");
  if (key === "beachvolleyball") return "VOLEI_PRAIA";
  if (key === "indoorvolleyball") return "VOLEI_QUADRA";
  if (key === "footvolley") return "FUTEVOLEI";
  if (key === "beachtennis") return "BEACH_TENNIS";
  return null;
}

/** Degraus por atleta, em lote (docs `athleteRatings/{uid}_{SPORT_CODE}`). */
async function loadAthleteLevelRanks(uids, sportCode) {
  const ranks = new Map();
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0 || !sportCode) return ranks;

  const refs = unique.map((uid) =>
    db.doc(`${dataPath("athleteRatings")}/${uid}_${sportCode}`),
  );
  const snaps = await db.getAll(...refs);
  snaps.forEach((snap, index) => {
    const rank = Number(snap.data()?.levelRank);
    if (Number.isFinite(rank)) ranks.set(unique[index], rank);
  });
  return ranks;
}

/** Força do campo de uma categoria Livre; null quando não dá para medir. */
async function measureLivreFieldStrength(tournament, paidTeams) {
  const sportCode = tournamentSportToLevelSportCode(tournament.sport);
  if (!sportCode || paidTeams.size === 0) return null;

  const ranks = await loadAthleteLevelRanks(
    [...paidTeams.values()].flat(),
    sportCode,
  );
  const teamRanks = [...paidTeams.values()].map((uids) =>
    teamLevelRank(uids.map((uid) => (ranks.has(uid) ? ranks.get(uid) : null))),
  );
  return fieldStrengthFromTeamRanks(teamRanks);
}
```

Acrescente `teamLevelRank` e `fieldStrengthFromTeamRanks` ao `require` de `./lib/ranking-recompute.js` no topo do arquivo.

- [ ] **Step 3: Usar a força medida no contexto**

Em `resolveContext`, troque:

```js
  const paidTeams = await countPaidTeams(tournamentId, categoryId);
  const rankingWeight = sanitizeRankingWeight(tournament.rankingWeight);
  const bracketFactor = bracketSizeFactor(paidTeams);
```

por:

```js
  const paidTeamsMap = await loadPaidTeams(tournamentId, categoryId);
  const paidTeams = paidTeamsMap.size;
  const rankingWeight = sanitizeRankingWeight(tournament.rankingWeight);
  const bracketFactor = bracketSizeFactor(paidTeams);

  // Livre: o peso 0.125 da tabela vem do PISO declarado da faixa e pune um campo
  // forte (spec 2026-09-10). Aqui ele é substituído pela força REAL medida.
  // Campo imensurável mantém o peso declarado — não vira zero.
  let weight = peso.weight;
  let fieldRank = null;
  let measuredTeams = 0;
  if (peso.presetKey === "livre") {
    const strength = await measureLivreFieldStrength(tournament, paidTeamsMap);
    if (strength) {
      weight = strength.weight;
      fieldRank = strength.fieldRank;
      measuredTeams = strength.measuredTeams;
    }
  }
```

e no objeto de retorno troque `weight: peso.weight,` por:

```js
    weight,
    fieldRank,
    measuredTeams,
```

- [ ] **Step 4: Atualizar o cabeçalho do script**

No comentário de topo de `recompute-ranking-weights.js`, acrescente ao final da explicação:

```
 * EMENDA 2026-09-10: categoria de preset `livre` não usa mais o peso 0.125 da
 * tabela — o peso vem da força REAL do campo (média do degrau das duplas, onde
 * a dupla vale o integrante mais forte), medida a partir das inscrições pagas e
 * de `athleteRatings.levelRank`. Continua sendo função pura do dado vivo, então
 * o script segue convergindo em duas passadas.
```

- [ ] **Step 5: Verificar em dry-run contra o DEV**

```bash
cd functions && node scripts/recompute-ranking-weights.js --project volley-track-dev-4596c
```

Esperado: relatório listando `DESAFIO OPEN - JHON JHON` com peso 0.5 (era 0.125) e o campeão indo de 125 para 500; `Copa Goiás` (categoria legada) **sem mudança**. Nenhuma escrita — o dry-run é o padrão do script.

- [ ] **Step 6: Commit**

```bash
git add functions/scripts/recompute-ranking-weights.js
git commit -m "feat(scripts): repesagem retroativa do Livre pela força do campo"
```

---

### Task 8: Retroativo — criar a participação que nunca existiu

**Files:**
- Modify: `functions/scripts/recompute-ranking-weights.js`

**Interfaces:**
- Consumes: contexto da Task 7 (`weight`, `rankingWeight`, `bracketFactor`, `presetKey`), `pointsForEntry` e `aggregateRankingResults` de `./lib/ranking-recompute.js`.
- Produces: docs novos em `tournamentCategoryResults` com `finalPlace: 0`, e as entradas correspondentes em `athleteRankings`/`teamRankings`.

**Contexto obrigatório:** até aqui o script só REESCREVIA docs, e a idempotência vinha de a função ser pura e convergente. Este passo CRIA docs, então a idempotência passa a depender de checar existência antes de criar.

- [ ] **Step 1: Adicionar os carregadores que faltam**

Em `functions/scripts/recompute-ranking-weights.js`, adicione:

```js
/** Paridade com `loadKnockoutTeamIds` (functions/src/league-ranking.ts). */
async function loadKnockoutTeamIds(tournamentId, categoryId) {
  const snap = await db
    .collection(dataPath("matches"))
    .where("tournamentId", "==", tournamentId)
    .where("categoryId", "==", categoryId)
    .get();

  const ids = new Set();
  for (const doc of snap.docs) {
    const d = doc.data();
    const tipo = String(d.matchType || "").trim().toLowerCase();
    if (d.isGroupMatch === true || tipo === "group" || tipo === "groups") continue;
    const a = (d.teamAId || "").trim();
    const b = (d.teamBId || "").trim();
    if (a) ids.add(a);
    if (b) ids.add(b);
  }
  return ids;
}

/** Paridade com `extractTeamMemberUids` (functions/src/league-ranking.ts). */
async function loadTeamAthleteIds(teamId) {
  const snap = await db.doc(`${dataPath("teams")}/${teamId}`).get();
  if (!snap.exists) return [];
  const d = snap.data() || {};
  const uids = Array.isArray(d.memberUids)
    ? d.memberUids
    : [d.player1Id, d.player2Id];
  return [...new Set(uids.map((u) => String(u || "").trim()).filter(Boolean))];
}
```

- [ ] **Step 2: Adicionar o passo de criação**

Adicione a função abaixo e chame-a a partir de `run()`, **depois** da migração dos docs existentes:

```js
/**
 * Cria os resultados de participação que a antiga exceção do Livre nunca gravou
 * (spec 2026-09-10, D4/D5). Só toca categorias de preset `livre` que já têm ao
 * menos um resultado — isto é, que passaram pelo motor — e só duplas pagas que
 * não aparecem em nenhuma partida de mata-mata.
 *
 * IDEMPOTÊNCIA: diferente do resto do script, este passo CRIA docs. A garantia
 * de rodar duas vezes sem duplicar vem da checagem de existência do doc
 * `{tournamentId}_{categoryId}_{teamId}` antes de escrever.
 */
async function criarParticipacaoFaltanteDoLivre(fresh) {
  const categorias = new Map();
  const anos = new Map();
  const snap = await db.collection(dataPath("tournamentCategoryResults")).get();
  for (const doc of snap.docs) {
    const r = doc.data();
    const chave = `${r.tournamentId}|${r.categoryId}`;
    if (!categorias.has(chave)) categorias.set(chave, new Set());
    categorias.get(chave).add(r.teamId);
    // O ano da participação criada é o dos resultados que o motor JÁ gravou
    // nesta categoria — nunca a data de hoje, que jogaria os pontos no ano
    // errado de `pointsByYear`.
    const ano = Number(r.year);
    if (Number.isFinite(ano) && ano > 0 && !anos.has(chave)) anos.set(chave, ano);
  }

  let criados = 0;
  for (const [chave, comResultado] of categorias) {
    const [tournamentId, categoryId] = chave.split("|");
    const ctx = await contextFor(tournamentId, categoryId);
    if (!ctx.ok || ctx.presetKey !== "livre") continue;

    const paidTeams = await loadPaidTeams(tournamentId, categoryId);
    const knockout = await loadKnockoutTeamIds(tournamentId, categoryId);
    const pontos = pointsForEntry(0, ctx);
    if (pontos == null || pontos <= 0) continue;

    for (const teamId of paidTeams.keys()) {
      if (comResultado.has(teamId)) continue;
      if (knockout.has(teamId)) continue;

      const ref = db
        .collection(dataPath("tournamentCategoryResults"))
        .doc(`${tournamentId}_${categoryId}_${teamId}`);
      const existente = await ref.get();
      if (existente.exists) continue;

      avisar(
        `${ctx.tournamentName} / ${ctx.categoryName}: criando participação de ` +
          `${teamId} (${pontos} pts)`,
      );
      if (!fresh) continue;

      const year = anos.get(chave) || new Date().getFullYear();
      await ref.set({
        tournamentId,
        categoryId,
        teamId,
        finalPlace: 0,
        pointsEarned: pontos,
        year,
        scaleVersion: 2,
      });

      const entrada = {tournamentId, categoryId, finalPlace: 0, points: pontos, year};
      await upsertRankingDoc(dataPath("teamRankings"), teamId, {teamId}, entrada);
      for (const athleteId of await loadTeamAthleteIds(teamId)) {
        await upsertRankingDoc(dataPath("athleteRankings"), athleteId, {athleteId}, entrada);
      }
      criados++;
    }
  }
  console.log(`\n[participação do Livre] ${criados} resultado(s) criado(s)`);
  return criados;
}

/** Upsert de uma entrada em `athleteRankings`/`teamRankings`, com agregados. */
async function upsertRankingDoc(collectionPath, docId, identity, entrada) {
  const ref = db.collection(collectionPath).doc(docId);
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const prev = snap.data() || {};
    const results = Array.isArray(prev.results) ? [...prev.results] : [];
    const jaTem = results.some(
      (r) => r.tournamentId === entrada.tournamentId && r.categoryId === entrada.categoryId,
    );
    if (jaTem) return;
    results.push(entrada);
    const agregados = aggregateRankingResults(results);
    txn.set(
      ref,
      {
        ...identity,
        results,
        totalPoints: agregados.totalPoints,
        tournamentsCount: agregados.tournamentsCount,
        pointsByYear: agregados.pointsByYear,
        scaleVersion: 2,
      },
      {merge: true},
    );
  });
}
```

- [ ] **Step 3: Rodar dry-run contra o DEV**

```bash
cd functions && node scripts/recompute-ranking-weights.js --project volley-track-dev-4596c
```

Esperado: além da repesagem da Task 7, o relatório anuncia **18** participações a criar em `5° BOLO DE CENOURA` e **0** em `DESAFIO OPEN - JHON JHON` (lá todas as 10 duplas já têm resultado).

- [ ] **Step 4: Commit**

```bash
git add functions/scripts/recompute-ranking-weights.js
git commit -m "feat(scripts): cria a participação do Livre que a exceção nunca gravou"
```

---

### Task 9: Rollout no DEV e verificação

**Files:** nenhum (operação).

**Interfaces:**
- Consumes: tudo das tasks anteriores.
- Produces: DEV com o motor novo no ar e o histórico corrigido.

**PEDIR APROVAÇÃO DO DONO ANTES DE EXECUTAR.** Deploy e escrita em banco compartilhado são ações externas e irreversíveis por script.

- [ ] **Step 1: Suíte completa e tipos**

```bash
cd functions && npm run lint && npm test
```

Esperado: verde.

- [ ] **Step 2: Publicar as regras no DEV**

```bash
firebase deploy --only firestore:rules --project volley-track-dev-4596c
```

- [ ] **Step 3: Publicar as functions no DEV (deploy ANTES do script)**

```bash
cd functions && npm run build && firebase deploy --only functions --project volley-track-dev-4596c
```

- [ ] **Step 4: Rodar a repesagem no DEV**

`rederive-knockout-placements.js` já foi executado no DEV em 19/08; rode-o de novo apenas se o relatório acusar `finalPlace: 9` ambíguo.

```bash
cd functions && node scripts/recompute-ranking-weights.js --project volley-track-dev-4596c --yes
```

- [ ] **Step 5: Conferir o resultado**

```bash
cd functions && node scripts/recompute-ranking-weights.js --project volley-track-dev-4596c
```

Esperado: **0 candidatos** na segunda passada (prova de convergência) e, no relatório, o campeão do `DESAFIO OPEN - JHON JHON` valendo **500**.

- [ ] **Step 6: Commit**

Nada a commitar — passo operacional. Registre no PR o que foi executado e o que ficou pendente no PROD (o ×10 e a repesagem de 19/08 continuam não aplicados lá; a ordem obrigatória é deploy → `rederive` → `recompute`).

---

## Notas para quem revisar

- **Divergência deliberada entre os motores:** `league-ranking.ts` mantém o Livre sem participação e sem peso medido. Só o ranking geral mudou. O comentário na linha 688 existe para impedir uma "correção" bem-intencionada.
- **A ordem dos scripts continua obrigatória:** `rederive-knockout-placements.js` antes de `recompute-ranking-weights.js`, senão quem caiu nos grupos (`finalPlace: 9` do contrato antigo) é promovido a oitavas.
- **PROD está atrás de duas migrações** (`backfill-ranking-scale-x10.js` e a repesagem de 19/08). Não rode nada em PROD sem tratar essa fila.
