import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {buildGroupsKnockoutMatches} from "./category-bracket-builders";
import {tryFillKnockoutFromGroupStandings, type GroupPreview} from "./group-standings";

/**
 * A fiação do preenchimento contra um Firestore de mentira: gera a chave de
 * verdade (3 grupos × 2), joga a fase de grupos, corrige placar e confere o que
 * fica GRAVADO nas partidas. As regras em si têm teste puro
 * (`groups-knockout-refill`, `groups-knockout-rematch`); aqui é o caminho
 * documento → regra → documento, que função pura não exercita.
 */

type Doc = Record<string, unknown>;

function fakeDb(initial: Doc[]) {
  const store = initial.map((data, i) => ({id: `m${i}`, data: {...data}}));
  const snapshot = () => ({
    docs: store.map((entry) => ({
      id: entry.id,
      data: () => entry.data,
      ref: {
        update: async (patch: Doc) => {
          for (const [key, value] of Object.entries(patch)) {
            if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) delete entry.data[key];
            else if (!(value instanceof FieldValue)) entry.data[key] = value;
          }
        },
      },
    })),
  });
  const query = {where: () => query, get: async () => snapshot()};
  return {db: {collection: () => query} as unknown as Firestore, store};
}

const GROUPS: GroupPreview[] = ["A", "B", "C"].map((id) => ({id, teamIds: [`${id}1`, `${id}2`, `${id}3`]}));

function publishedBracket(): Doc[] {
  return buildGroupsKnockoutMatches(GROUPS.flatMap((g) => g.teamIds), GROUPS, 2).map((draft) => ({
    tournamentId: "t1",
    categoryId: "c1",
    status: "Scheduled",
    ...draft,
  }));
}

/** Encerra (ou corrige) os jogos de um grupo: 1 vence 2 e 3, 2 vence 3; o líder vence por `leaderLoserPoints`. */
function playGroup(store: Array<{data: Doc}>, groupId: string, leaderLoserPoints: number): void {
  for (const {data} of store) {
    if (data.isGroupMatch !== true || data.poolId !== groupId) continue;
    const a = String(data.teamAId);
    const b = String(data.teamBId);
    const winner = Number(a[1]) < Number(b[1]) ? a : b;
    const loserPoints = winner.endsWith("1") ? leaderLoserPoints : 15;
    data.status = "Completed";
    data.winnerId = winner;
    data.sets = [winner === a ? {a: 21, b: loserPoints} : {a: loserPoints, b: 21}];
  }
}

function knockout(store: Array<{data: Doc}>): Doc[] {
  return store
    .map((entry) => entry.data)
    .filter((data) => data.isGroupMatch !== true)
    .sort((x, y) => Number(x.matchNumber) - Number(y.matchNumber));
}

/** "Jogo → A × B" de cada partida do mata-mata, só com o que a fase de grupos decide. */
function lineup(store: Array<{data: Doc}>): string[] {
  return knockout(store)
    .filter((data) => data.teamAQualifier || data.teamBQualifier)
    .map((data) => `${data.teamAId || "-"}×${data.teamBId || "-"}`);
}

const fill = (db: Firestore) => tryFillKnockoutFromGroupStandings(db, "matches", "t1", "c1", GROUPS);

describe("tryFillKnockoutFromGroupStandings · chave por campanha (3 grupos × 2)", () => {
  it("não preenche nada enquanto algum grupo não terminou", async () => {
    const {db, store} = fakeDb(publishedBracket());
    playGroup(store, "A", 10);
    playGroup(store, "B", 15);
    assert.deepEqual(await fill(db), {filled: false, slotsFilled: 0});
    assert.ok(knockout(store).every((data) => !data.teamAId && !data.teamBId));
  });

  it("preenche pela campanha: folga para os dois melhores 1ºs, que já entram na semifinal", async () => {
    const {db, store} = fakeDb(publishedBracket());
    playGroup(store, "A", 10);
    playGroup(store, "B", 15);
    playGroup(store, "C", 18);
    const result = await fill(db);
    assert.equal(result.filled, true);
    // Quartas: A1 folga · C2 × B2 · B1 folga · C1 × A2. Semis: A1 × ?, B1 × ?.
    assert.deepEqual(lineup(store), ["A1×-", "C2×B2", "B1×-", "C1×A2", "A1×-", "B1×-"]);
  });

  it("correção de placar ANTES de o mata-mata começar refaz a ordem das vagas", async () => {
    const {db, store} = fakeDb(publishedBracket());
    playGroup(store, "A", 10);
    playGroup(store, "B", 15);
    playGroup(store, "C", 18);
    await fill(db);

    // O líder do B passa a vencer por 21×0: vira a melhor campanha entre os 1ºs.
    playGroup(store, "B", 0);
    const result = await fill(db);
    assert.equal(result.filled, true);
    assert.deepEqual(lineup(store), ["B1×-", "C2×A2", "A1×-", "C1×B2", "B1×-", "A1×-"]);
    assert.ok(knockout(store).every((data) => data.qualifierDrift === undefined));
  });

  it("correção DEPOIS de o mata-mata começar não move ninguém e marca o que ficou desatualizado", async () => {
    const {db, store} = fakeDb(publishedBracket());
    playGroup(store, "A", 10);
    playGroup(store, "B", 15);
    playGroup(store, "C", 18);
    await fill(db);
    const before = lineup(store);

    const firstQuarter = knockout(store).find((data) => data.teamAId === "C2")!;
    firstQuarter.status = "In Progress";
    playGroup(store, "B", 0);
    await fill(db);

    assert.deepEqual(lineup(store), before);
    const flagged = knockout(store).filter((data) => data.qualifierDrift !== undefined);
    assert.ok(flagged.length > 0);
    // A folga do A1 seria do B1 pela classificação atual.
    const bye = knockout(store).find((data) => data.teamAId === "A1" && data.round === 1)!;
    assert.deepEqual(bye.qualifierDrift, {teamAId: "B1"});
    // E a quarta em andamento teria o A2 no lugar do B2.
    assert.deepEqual(firstQuarter.qualifierDrift, {teamBId: "A2"});

    // Nova correção devolvendo o placar: o aviso some sozinho.
    playGroup(store, "B", 15);
    await fill(db);
    assert.deepEqual(lineup(store), before);
    assert.ok(knockout(store).every((data) => data.qualifierDrift === undefined));
  });

  it("partida chamada para a quadra já conta como mata-mata começado", async () => {
    const {db, store} = fakeDb(publishedBracket());
    playGroup(store, "A", 10);
    playGroup(store, "B", 15);
    playGroup(store, "C", 18);
    await fill(db);
    const before = lineup(store);
    knockout(store).find((data) => data.teamAId === "C2")!.queueStatus = "on_court";
    playGroup(store, "B", 0);
    await fill(db);
    assert.deepEqual(lineup(store), before);
  });
});

describe("tryFillKnockoutFromGroupStandings · vagas fixas (formato antigo, 2 grupos × 2)", () => {
  const groups: GroupPreview[] = ["A", "B"].map((id) => ({id, teamIds: [`${id}1`, `${id}2`, `${id}3`]}));
  const bracket = (): Doc[] =>
    buildGroupsKnockoutMatches(groups.flatMap((g) => g.teamIds), groups, 2)
      .map((draft) => ({tournamentId: "t1", categoryId: "c1", status: "Scheduled", ...draft}));

  it("preenche uma vez e NÃO refaz nem marca depois de uma correção — como sempre foi", async () => {
    const {db, store} = fakeDb(bracket());
    playGroup(store, "A", 10);
    playGroup(store, "B", 15);
    await tryFillKnockoutFromGroupStandings(db, "matches", "t1", "c1", groups);
    const before = lineup(store);
    assert.deepEqual(before, ["A1×B2", "A2×B1"]);

    // Correção que INVERTE o grupo A: o 2 passa a ter vencido o 1.
    for (const {data} of store) {
      if (data.isGroupMatch === true && data.teamAId === "A1" && data.teamBId === "A2") {
        data.winnerId = "A2";
        data.sets = [{a: 10, b: 21}];
      }
    }
    const result = await tryFillKnockoutFromGroupStandings(db, "matches", "t1", "c1", groups);
    assert.deepEqual(result, {filled: false, slotsFilled: 0});
    assert.deepEqual(lineup(store), before);
    assert.ok(knockout(store).every((data) => data.qualifierDrift === undefined));
  });
});
