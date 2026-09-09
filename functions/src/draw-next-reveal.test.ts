import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {computeNextReveal} from "./draw-next-reveal";
import {genesisHash} from "./draw-log";
import type {DrawSessionDoc, DrawSessionReveal} from "./draw-session-model";

const entrant = (teamId: string, potIndex: number, over: Record<string, unknown> = {}) => ({
  teamId,
  label: teamId,
  playerNames: [],
  photoUrls: [],
  city: null,
  levelLabel: "",
  points: 4,
  rating: null,
  potIndex,
  lockedSeed: null,
  stats: {wins: 0, losses: 0, titles: 0, last5: []},
  ...over,
});

const doc = (over: Partial<DrawSessionDoc> = {}): DrawSessionDoc =>
  ({
    tournamentId: "t1",
    categoryId: "c1",
    tournamentName: "Copa",
    categoryName: "Open",
    sportCode: "BEACH_TENNIS",
    format: "groups_knockout",
    status: "live",
    config: {
      mode: "manual",
      intervalMs: 6000,
      phrasesEnabled: false,
      lockedSeedCount: 0,
      teamsPerGroup: 2,
      qualifiersPerGroup: 1,
      constraints: {seedsApart: false, potsPerGroup: true, avoidSameCity: false},
    },
    pots: [
      {index: 1, teamIds: ["a", "b"]},
      {index: 2, teamIds: ["c", "d"]},
    ],
    entrants: [entrant("a", 1), entrant("b", 1), entrant("c", 2), entrant("d", 2)],
    reveals: [],
    genesisHash: genesisHash("s1"),
    totalReveals: 4,
    bracketOutline: null,
    ...over,
  }) as DrawSessionDoc;

const sempreZero = () => 0;

describe("computeNextReveal — idempotência", () => {
  it("índice esperado igual ao atual aplica a revelação", () => {
    const out = computeNextReveal(doc(), 0, sempreZero, 1000);
    assert.equal(out.kind, "applied");
  });

  it("índice esperado ATRASADO não sorteia de novo — é clique duplo ou retry", () => {
    const out = computeNextReveal(doc(), 5, sempreZero, 1000);
    assert.deepEqual(out, {kind: "stale", currentIndex: 0});
  });

  it("índice esperado adiantado também é recusado sem sortear", () => {
    const state = doc({
      reveals: [
        {
          index: 1,
          teamId: "a",
          destinationKey: "grupo:A",
          atMillis: 1,
          prevHash: "p",
          hash: "h",
          destination: {type: "group", groupId: "A"},
          relaxed: [],
          phrase: null,
          dePlacement: null,
        } as DrawSessionReveal,
      ],
    });
    assert.deepEqual(computeNextReveal(state, 0, sempreZero, 1000), {
      kind: "stale",
      currentIndex: 1,
    });
  });
});

describe("computeNextReveal — a revelação gravada", () => {
  it("carimba o horário do SERVIDOR recebido, nunca o do cliente", () => {
    const out = computeNextReveal(doc(), 0, sempreZero, 1_700_000_000_000);
    assert.equal(out.kind === "applied" && out.reveal.atMillis, 1_700_000_000_000);
  });

  it("encadeia no genesis quando é a primeira revelação", () => {
    const d = doc();
    const out = computeNextReveal(d, 0, sempreZero, 1000);
    assert.equal(out.kind === "applied" && out.reveal.prevHash, d.genesisHash);
    assert.equal(out.kind === "applied" && out.reveal.index, 1);
  });

  it("grava a chave canônica do destino", () => {
    const out = computeNextReveal(doc(), 0, sempreZero, 1000);
    assert.equal(out.kind === "applied" && out.reveal.destinationKey, "grupo:A");
  });

  it("com frases desligadas, a revelação vai sem frase", () => {
    const out = computeNextReveal(doc(), 0, sempreZero, 1000);
    assert.equal(out.kind === "applied" && out.reveal.phrase, null);
  });

  it("com frases ligadas, escolhe uma do banco", () => {
    const d = doc({config: {...doc().config, phrasesEnabled: true}});
    const out = computeNextReveal(d, 0, sempreZero, 1000);
    assert.ok(out.kind === "applied" && out.reveal.phrase != null);
  });
});

describe("computeNextReveal — fim e travamento", () => {
  it("sem nada pra sortear, devolve done", () => {
    const reveals = ["a", "b", "c", "d"].map((teamId, i) => ({
      index: i + 1,
      teamId,
      destinationKey: `grupo:${i % 2 === 0 ? "A" : "B"}`,
      atMillis: i,
      prevHash: "p",
      hash: "h",
      destination: {type: "group" as const, groupId: i % 2 === 0 ? "A" : "B"},
      relaxed: [],
      phrase: null,
      dePlacement: null,
    })) as DrawSessionReveal[];
    assert.deepEqual(computeNextReveal(doc({reveals}), 4, sempreZero, 1000), {kind: "done"});
  });
});

describe("computeNextReveal — dupla eliminatória", () => {
  const deDoc = () =>
    doc({
      format: "double_elimination",
      config: {...doc().config, lockedSeedCount: 2, phrasesEnabled: false},
      pots: [{index: 1, teamIds: ["c", "d"]}],
      entrants: [
        entrant("a", 1, {lockedSeed: 1}),
        entrant("b", 1, {lockedSeed: 2}),
        entrant("c", 2),
        entrant("d", 2),
      ],
      totalReveals: 2,
    });

  it("grava a colocação resolvida pela planta junto da revelação", () => {
    const out = computeNextReveal(deDoc(), 0, sempreZero, 1000);
    assert.ok(out.kind === "applied");
    if (out.kind !== "applied") return;
    assert.equal(out.reveal.destination.type, "seed");
    assert.ok(out.reveal.dePlacement, "a revelação tem que trazer a consequência já resolvida");
    assert.equal(out.reveal.dePlacement!.seed, 3);
  });

  it("a chave do destino é o número de seed", () => {
    const out = computeNextReveal(deDoc(), 0, sempreZero, 1000);
    assert.equal(out.kind === "applied" && out.reveal.destinationKey, "seed:3");
  });
});

describe("computeNextReveal — cabeças com lugar já definido", () => {
  const comCabecas = doc({
    config: {
      mode: "manual",
      intervalMs: 6000,
      phrasesEnabled: false,
      lockedSeedCount: 0,
      teamsPerGroup: 2,
      qualifiersPerGroup: 1,
      constraints: {
        seedsApart: false,
        potsPerGroup: true,
        avoidSameCity: false,
        seedsPreassigned: true,
      },
    },
  });

  it("a revelação gravada carrega a marca — é o que o comprovante lê", () => {
    const out = computeNextReveal(comCabecas, 0, sempreZero, 1000);
    assert.equal(out.kind, "applied");
    assert.equal(out.kind === "applied" && out.reveal.preassigned, true);
    assert.deepEqual(
      out.kind === "applied" ? out.reveal.destination : null,
      {type: "group", groupId: "A"},
    );
  });

  it("revelação sorteada de verdade NÃO carrega a marca", () => {
    const out = computeNextReveal(doc(), 0, sempreZero, 1000);
    assert.equal(out.kind, "applied");
    assert.equal(out.kind === "applied" && out.reveal.preassigned, undefined);
  });

  it("a marca não muda o hash — a cadeia continua sobre dupla+destino+instante", () => {
    // Se a marca entrasse no hash, ligar a regra invalidaria comprovantes de
    // sessões antigas ao reverificar. Ela é METADADO da linha, não do elo.
    const comMarca = computeNextReveal(comCabecas, 0, sempreZero, 1000);
    const semMarca = computeNextReveal(doc(), 0, sempreZero, 1000);
    assert.equal(
      comMarca.kind === "applied" && comMarca.reveal.hash,
      semMarca.kind === "applied" && semMarca.reveal.hash,
    );
  });
});
