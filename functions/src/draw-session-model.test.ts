import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  groupsFromReveals,
  rebuildEngineState,
  seedOrderFromReveals,
  type DrawSessionDoc,
} from "./draw-session-model";

const baseDoc = (over: Partial<DrawSessionDoc> = {}): DrawSessionDoc =>
  ({
    tournamentId: "t1",
    categoryId: "c1",
    tournamentName: "Copa Verão",
    categoryName: "Feminino Open",
    sportCode: "BEACH_TENNIS",
    format: "groups_knockout",
    status: "live",
    config: {
      mode: "hybrid",
      intervalMs: 6000,
      phrasesEnabled: true,
      lockedSeedCount: 0,
      teamsPerGroup: 2,
      qualifiersPerGroup: 1,
      constraints: {seedsApart: false, potsPerGroup: true, avoidSameCity: false},
    },
    pots: [
      {index: 1, teamIds: ["t1", "t2"]},
      {index: 2, teamIds: ["t3", "t4"]},
    ],
    entrants: [
      {teamId: "t1", potIndex: 1, city: "Goiânia"},
      {teamId: "t2", potIndex: 1, city: "Anápolis"},
      {teamId: "t3", potIndex: 2, city: "Goiânia"},
      {teamId: "t4", potIndex: 2, city: null},
    ].map((e) => ({
      ...e,
      label: e.teamId,
      playerNames: [],
      photoUrls: [],
      levelLabel: "",
      points: null,
      rating: null,
      lockedSeed: null,
      stats: {wins: 0, losses: 0, titles: 0, last5: []},
    })),
    reveals: [],
    genesisHash: "g",
    totalReveals: 4,
    bracketOutline: null,
    ...over,
  }) as DrawSessionDoc;

const reveal = (index: number, teamId: string, groupId: string) => ({
  index,
  teamId,
  destinationKey: `grupo:${groupId}`,
  atMillis: index,
  prevHash: "p",
  hash: "h",
  destination: {type: "group" as const, groupId},
  relaxed: [],
  phrase: null,
  dePlacement: null,
});

describe("groupsFromReveals", () => {
  it("dobra o log nas duplas por grupo, na ordem de revelação", () => {
    const groups = groupsFromReveals(baseDoc(), [
      reveal(1, "t1", "A"),
      reveal(2, "t2", "B"),
      reveal(3, "t3", "B"),
    ]);
    assert.deepEqual(groups.find((g) => g.groupId === "A")!.teamIds, ["t1"]);
    assert.deepEqual(groups.find((g) => g.groupId === "B")!.teamIds, ["t2", "t3"]);
  });

  it("sem revelação, todo grupo está vazio mas com a capacidade certa", () => {
    const groups = groupsFromReveals(baseDoc(), []);
    assert.deepEqual(
      groups.map((g) => g.capacity),
      [2, 2],
    );
    assert.deepEqual(groups.flatMap((g) => g.teamIds), []);
  });
});

describe("seedOrderFromReveals", () => {
  /**
   * Sessão ANTIGA: só as duplas sorteadas tinham revelação, então as cabeças
   * precisavam ser plantadas na chave — senão sumiam pra sempre. É por isso que
   * o pré-preenchimento existe, e é por isso que ele não pode ser removido: há
   * sessões assim gravadas.
   */
  const deDoc = baseDoc({
    format: "double_elimination",
    config: {...baseDoc().config, lockedSeedCount: 2},
    entrants: baseDoc().entrants.map((e, i) => ({
      ...e,
      lockedSeed: i < 2 ? i + 1 : null,
    })),
    totalReveals: 2,
  });

  /** Sessão NOVA: as cabeças também têm revelação, então nada é plantado. */
  const noArDoc = baseDoc({
    ...deDoc,
    totalReveals: 4,
  });

  it("cabeças travadas ocupam os primeiros seeds sem revelação nenhuma", () => {
    assert.deepEqual(seedOrderFromReveals(deDoc, []), ["t1", "t2", null, null]);
  });

  it("com as cabeças no ar, a chave começa VAZIA — o nome aparece na vez dela", () => {
    assert.deepEqual(seedOrderFromReveals(noArDoc, []), [null, null, null, null]);
  });

  it("com as cabeças no ar, a revelação da cabeça é que a coloca na chave", () => {
    const order = seedOrderFromReveals(noArDoc, [
      {
        ...reveal(1, "t1", "A"),
        destinationKey: "seed:1",
        destination: {type: "seed", seed: 1},
      } as never,
    ]);
    assert.deepEqual(order, ["t1", null, null, null]);
  });

  it("revelação crava a dupla no seed sorteado", () => {
    const order = seedOrderFromReveals(deDoc, [
      {
        ...reveal(1, "t4", "A"),
        destinationKey: "seed:4",
        destination: {type: "seed", seed: 4},
      } as never,
    ]);
    assert.deepEqual(order, ["t1", "t2", null, "t4"]);
  });
});

describe("rebuildEngineState — o telão reconstrói do log, nunca do acumulado", () => {
  it("estado inicial tem todos os grupos vazios e ninguém revelado", () => {
    const state = rebuildEngineState(baseDoc());
    assert.deepEqual(state.revealedTeamIds, []);
    assert.deepEqual(state.groups.flatMap((g) => g.teamIds), []);
  });

  it("replay do log inteiro chega ao mesmo lugar que aplicar uma a uma", () => {
    const doc = baseDoc({reveals: [reveal(1, "t1", "A"), reveal(2, "t2", "B")] as never});
    const state = rebuildEngineState(doc);
    assert.deepEqual(state.revealedTeamIds, ["t1", "t2"]);
    assert.deepEqual(state.groups.find((g) => g.groupId === "A")!.teamIds, ["t1"]);
  });

  it("carrega as restrições e os metadados das duplas da configuração", () => {
    const state = rebuildEngineState(baseDoc());
    assert.equal(state.constraints.potsPerGroup, true);
    assert.deepEqual(state.teamsById["t3"], {
      teamId: "t3",
      potIndex: 2,
      city: "Goiânia",
      // O motor precisa do seed travado pra saber revelar a cabeça no lugar dela.
      lockedSeed: null,
    });
  });

  it("sessão antiga: a cabeça já plantada reconstrói a ordem de seeds", () => {
    const doc = baseDoc({
      format: "double_elimination",
      config: {...baseDoc().config, lockedSeedCount: 1},
      entrants: baseDoc().entrants.map((e, i) => ({...e, lockedSeed: i === 0 ? 1 : null})),
      // 4 duplas, 1 cabeça travada: só as outras 3 tinham revelação.
      totalReveals: 3,
    });
    const state = rebuildEngineState(doc);
    assert.equal(state.format, "double_elimination");
    assert.deepEqual(state.seedOrder, ["t1", null, null, null]);
  });

  it("sessão nova: a chave nasce vazia e a cabeça entra pela própria revelação", () => {
    const doc = baseDoc({
      format: "double_elimination",
      config: {...baseDoc().config, lockedSeedCount: 1},
      entrants: baseDoc().entrants.map((e, i) => ({...e, lockedSeed: i === 0 ? 1 : null})),
      totalReveals: 4,
    });
    assert.deepEqual(rebuildEngineState(doc).seedOrder, [null, null, null, null]);
  });
});
