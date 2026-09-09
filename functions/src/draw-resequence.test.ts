import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {resequenceSession, validateSeedOrder} from "./draw-resequence";
import type {DrawSessionDoc, DrawSessionEntrant} from "./draw-session-model";

const entrant = (teamId: string, over: Partial<DrawSessionEntrant> = {}): DrawSessionEntrant => ({
  teamId,
  label: teamId.toUpperCase(),
  playerNames: [],
  photoUrls: [],
  city: null,
  levelLabel: "",
  points: 8,
  rating: null,
  potIndex: 1,
  lockedSeed: null,
  stats: {wins: 0, losses: 0, titles: 0, last5: []},
  ...over,
});

const doc = (over: Partial<DrawSessionDoc> = {}): DrawSessionDoc =>
  ({
    tournamentId: "t",
    categoryId: "c",
    tournamentName: "Copa",
    categoryName: "Open",
    sportCode: "BEACH_TENNIS",
    format: "groups_knockout",
    status: "draft",
    config: {
      mode: "hybrid",
      intervalMs: 6000,
      phrasesEnabled: true,
      lockedSeedCount: 0,
      teamsPerGroup: 4,
      qualifiersPerGroup: 2,
      constraints: {seedsApart: true, potsPerGroup: true, avoidSameCity: false},
    },
    pots: [],
    entrants: ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => entrant(id)),
    reveals: [],
    genesisHash: "g",
    totalReveals: 8,
    bracketOutline: null,
    ...over,
  }) as DrawSessionDoc;

describe("validateSeedOrder", () => {
  it("aceita uma permutação exata do elenco", () => {
    const order = ["h", "g", "f", "e", "d", "c", "b", "a"];
    assert.deepEqual(validateSeedOrder(doc(), order), {ok: true, order});
  });

  it("recusa ordem com dupla que não está no elenco", () => {
    const out = validateSeedOrder(doc(), ["a", "b", "c", "d", "e", "f", "g", "intrusa"]);
    assert.equal(out.ok, false);
  });

  it("recusa ordem com dupla repetida — duas posições pra mesma dupla", () => {
    const out = validateSeedOrder(doc(), ["a", "a", "b", "c", "d", "e", "f", "g"]);
    assert.equal(out.ok, false);
  });

  it("completa a ordem parcial pelo elenco, sem perder ninguém", () => {
    // O organizador reordena só as cabeças; o resto segue como estava.
    const out = validateSeedOrder(doc(), ["d", "c"]);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.deepEqual(out.order.slice(0, 2), ["d", "c"]);
    assert.equal(out.order.length, 8);
    assert.deepEqual([...out.order].sort(), ["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  it("ordem vazia devolve o elenco na ordem atual", () => {
    const out = validateSeedOrder(doc(), []);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.deepEqual(out.order, ["a", "b", "c", "d", "e", "f", "g", "h"]);
  });
});

describe("resequenceSession — fase de grupos", () => {
  it("os potes saem da ordem recebida, em fatias do número de grupos", () => {
    // 8 duplas, grupos de 4 → 2 grupos → potes de 2.
    const out = resequenceSession(doc(), ["h", "g", "f", "e", "d", "c", "b", "a"]);
    assert.deepEqual(out.pots[0], {index: 1, teamIds: ["h", "g"]});
    assert.deepEqual(out.pots[3], {index: 4, teamIds: ["b", "a"]});
  });

  it("cada dupla recebe o pote em que caiu", () => {
    const out = resequenceSession(doc(), ["h", "g", "f", "e", "d", "c", "b", "a"]);
    assert.equal(out.entrants.find((e) => e.teamId === "h")!.potIndex, 1);
    assert.equal(out.entrants.find((e) => e.teamId === "a")!.potIndex, 4);
  });

  it("em grupos ninguém tem seed travado — quem decide o grupo é o sorteio", () => {
    const out = resequenceSession(doc(), ["h", "g", "f", "e", "d", "c", "b", "a"]);
    assert.ok(out.entrants.every((e) => e.lockedSeed == null));
  });

  it("preserva o snapshot da dupla — só a posição muda", () => {
    const base = doc({entrants: [entrant("a", {label: "Ana / Bia", points: 12}), entrant("b")]});
    const out = resequenceSession(base, ["b", "a"]);
    const ana = out.entrants.find((e) => e.teamId === "a")!;
    assert.equal(ana.label, "Ana / Bia");
    assert.equal(ana.points, 12);
  });
});

describe("resequenceSession — dupla eliminatória", () => {
  const deDoc = () =>
    doc({
      format: "double_elimination",
      config: {...doc().config, lockedSeedCount: 4},
    });

  it("as primeiras da ordem viram as cabeças, na sequência dos seeds", () => {
    const out = resequenceSession(deDoc(), ["h", "g", "f", "e", "d", "c", "b", "a"]);
    assert.equal(out.entrants.find((e) => e.teamId === "h")!.lockedSeed, 1);
    assert.equal(out.entrants.find((e) => e.teamId === "e")!.lockedSeed, 4);
  });

  it("quem não é cabeça fica sem seed e vai pro pote do sorteio", () => {
    const out = resequenceSession(deDoc(), ["h", "g", "f", "e", "d", "c", "b", "a"]);
    assert.equal(out.entrants.find((e) => e.teamId === "d")!.lockedSeed, null);
    assert.deepEqual(out.pots, [{index: 1, teamIds: ["d", "c", "b", "a"]}]);
  });

  it("cabeça fica no pote 1 e o resto no pote 2 — é o que a tela lê", () => {
    const out = resequenceSession(deDoc(), ["h", "g", "f", "e", "d", "c", "b", "a"]);
    assert.equal(out.entrants.find((e) => e.teamId === "h")!.potIndex, 1);
    assert.equal(out.entrants.find((e) => e.teamId === "d")!.potIndex, 2);
  });

  it("sem cabeças travadas, todo mundo entra no sorteio", () => {
    const base = doc({format: "double_elimination", config: {...doc().config, lockedSeedCount: 0}});
    const out = resequenceSession(base, ["a", "b", "c", "d", "e", "f", "g", "h"]);
    assert.ok(out.entrants.every((e) => e.lockedSeed == null));
    assert.equal(out.pots[0]!.teamIds.length, 8);
  });

  it("o total de revelações acompanha quantas posições sobraram pra sortear", () => {
    assert.equal(resequenceSession(deDoc(), ["h", "g", "f", "e", "d", "c", "b", "a"]).totalReveals, 4);
  });

  it("em grupos, o total de revelações é o elenco inteiro", () => {
    assert.equal(resequenceSession(doc(), ["a", "b", "c", "d", "e", "f", "g", "h"]).totalReveals, 8);
  });
});
