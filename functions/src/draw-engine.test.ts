import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {applyReveal, destinationKeyOf, nextReveal, type DrawEngineState} from "./draw-engine";
import {groupCapacities} from "./draw-plan";

/** Sorteador determinístico: consome a fila de índices que o teste ditou. */
const scripted = (...indexes: number[]) => {
  let i = 0;
  return (max: number) => {
    const chosen = indexes[i++] ?? 0;
    return Math.min(chosen, Math.max(0, max - 1));
  };
};

const semRestricao = {seedsApart: false, potsPerGroup: false, avoidSameCity: false};

/** Sessão de grupos com 4 duplas em 2 grupos de 2, dois potes de 2. */
const gruposState = (over: Partial<DrawEngineState> = {}): DrawEngineState => ({
  format: "groups_knockout",
  constraints: semRestricao,
  pots: [
    {index: 1, teamIds: ["t1", "t2"]},
    {index: 2, teamIds: ["t3", "t4"]},
  ],
  teamsById: {
    t1: {teamId: "t1", potIndex: 1, city: null},
    t2: {teamId: "t2", potIndex: 1, city: null},
    t3: {teamId: "t3", potIndex: 2, city: null},
    t4: {teamId: "t4", potIndex: 2, city: null},
  },
  groups: groupCapacities(4, 2),
  seedOrder: [],
  lockedSeedCount: 0,
  revealedTeamIds: [],
  ...over,
});

describe("nextReveal — fase de grupos", () => {
  it("sorteia uma dupla do pote da vez e um grupo viável", () => {
    const out = nextReveal(gruposState(), scripted(0, 0));
    assert.deepEqual(out, {
      status: "ok",
      reveal: {teamId: "t1", destination: {type: "group", groupId: "A"}, relaxed: []},
    });
  });

  it("o sorteador escolhe a dupla — índice 1 no pote tira a segunda", () => {
    const out = nextReveal(gruposState(), scripted(1, 0));
    assert.equal(out.status === "ok" && out.reveal.teamId, "t2");
  });

  it("o sorteador escolhe o grupo entre os viáveis", () => {
    const out = nextReveal(gruposState(), scripted(0, 1));
    assert.deepEqual(
      out.status === "ok" ? out.reveal.destination : null,
      {type: "group", groupId: "B"},
    );
  });

  it("não sorteia de novo quem já foi revelado", () => {
    const state = gruposState({revealedTeamIds: ["t1"]});
    const out = nextReveal(state, scripted(0, 0));
    assert.equal(out.status === "ok" && out.reveal.teamId, "t2");
  });

  it("com o pote 1 vazio, passa para o pote 2", () => {
    const state = gruposState({
      revealedTeamIds: ["t1", "t2"],
      groups: [
        {groupId: "A", capacity: 2, teamIds: ["t1"]},
        {groupId: "B", capacity: 2, teamIds: ["t2"]},
      ],
    });
    const out = nextReveal(state, scripted(0, 0));
    assert.equal(out.status === "ok" && out.reveal.teamId, "t3");
  });

  it("com todas reveladas, o sorteio está encerrado", () => {
    const state = gruposState({
      revealedTeamIds: ["t1", "t2", "t3", "t4"],
      groups: [
        {groupId: "A", capacity: 2, teamIds: ["t1", "t3"]},
        {groupId: "B", capacity: 2, teamIds: ["t2", "t4"]},
      ],
    });
    assert.deepEqual(nextReveal(state, scripted(0, 0)), {status: "done"});
  });

  it("respeita as restrições — com potes por ranking, a segunda do pote vai pro outro grupo", () => {
    const state = gruposState({
      constraints: {...semRestricao, potsPerGroup: true},
      revealedTeamIds: ["t1"],
      groups: [
        {groupId: "A", capacity: 2, teamIds: ["t1"]},
        {groupId: "B", capacity: 2, teamIds: []},
      ],
    });
    // Mesmo mandando o sorteador pedir o grupo de índice 0, só B é viável.
    const out = nextReveal(state, scripted(0, 0));
    assert.deepEqual(
      out.status === "ok" ? out.reveal.destination : null,
      {type: "group", groupId: "B"},
    );
  });

  it("propaga o relaxamento da cidade para a revelação", () => {
    const state = gruposState({
      constraints: {...semRestricao, avoidSameCity: true},
      revealedTeamIds: ["t1", "t2"],
      teamsById: {
        t1: {teamId: "t1", potIndex: 1, city: "Goiânia"},
        t2: {teamId: "t2", potIndex: 1, city: "Goiânia"},
        t3: {teamId: "t3", potIndex: 2, city: "Goiânia"},
        t4: {teamId: "t4", potIndex: 2, city: "Goiânia"},
      },
      groups: [
        {groupId: "A", capacity: 2, teamIds: ["t1"]},
        {groupId: "B", capacity: 2, teamIds: ["t2"]},
      ],
    });
    const out = nextReveal(state, scripted(0, 0));
    assert.deepEqual(out.status === "ok" ? out.reveal.relaxed : null, ["same_city"]);
  });

  it("dupla no pote sem nenhum destino é falha explícita, não sorteio silencioso", () => {
    const state = gruposState({
      revealedTeamIds: ["t1", "t2", "t3"],
      groups: [
        {groupId: "A", capacity: 2, teamIds: ["t1", "t3"]},
        {groupId: "B", capacity: 1, teamIds: ["t2"]},
      ],
    });
    assert.deepEqual(nextReveal(state, scripted(0, 0)), {
      status: "blocked",
      teamId: "t4",
    });
  });
});

describe("nextReveal — dupla eliminatória", () => {
  const deState = (over: Partial<DrawEngineState> = {}): DrawEngineState => ({
    format: "double_elimination",
    constraints: semRestricao,
    pots: [{index: 1, teamIds: ["c1", "c2", "x", "y"]}],
    teamsById: {
      c1: {teamId: "c1", potIndex: 1, city: null},
      c2: {teamId: "c2", potIndex: 1, city: null},
      x: {teamId: "x", potIndex: 2, city: null},
      y: {teamId: "y", potIndex: 2, city: null},
    },
    groups: [],
    // Cabeças já nos seeds 1 e 2; seeds 3 e 4 em aberto.
    seedOrder: ["c1", "c2", null, null],
    lockedSeedCount: 2,
    revealedTeamIds: [],
    ...over,
  });

  it("sorteia uma não-cabeça e um número de seed livre", () => {
    const out = nextReveal(deState(), scripted(0, 0));
    assert.deepEqual(out, {
      status: "ok",
      reveal: {teamId: "x", destination: {type: "seed", seed: 3}, relaxed: []},
    });
  });

  it("nunca sorteia uma cabeça travada", () => {
    const out = nextReveal(deState(), scripted(5, 0));
    assert.ok(out.status === "ok" && ["x", "y"].includes(out.reveal.teamId));
  });

  it("o segundo seed livre sai quando o sorteador pede o índice 1", () => {
    const out = nextReveal(deState(), scripted(0, 1));
    assert.deepEqual(
      out.status === "ok" ? out.reveal.destination : null,
      {type: "seed", seed: 4},
    );
  });

  it("com todos os seeds preenchidos, encerra", () => {
    const state = deState({seedOrder: ["c1", "c2", "x", "y"], revealedTeamIds: ["x", "y"]});
    assert.deepEqual(nextReveal(state, scripted(0, 0)), {status: "done"});
  });
});

describe("applyReveal", () => {
  it("coloca a dupla no grupo sorteado", () => {
    const state = gruposState();
    const next = applyReveal(state, {
      teamId: "t1",
      destination: {type: "group", groupId: "B"},
      relaxed: [],
    });
    assert.deepEqual(next.groups.find((g) => g.groupId === "B")!.teamIds, ["t1"]);
    assert.deepEqual(next.revealedTeamIds, ["t1"]);
  });

  it("não muta o estado recebido", () => {
    const state = gruposState();
    applyReveal(state, {teamId: "t1", destination: {type: "group", groupId: "A"}, relaxed: []});
    assert.deepEqual(state.groups[0]!.teamIds, []);
    assert.deepEqual(state.revealedTeamIds, []);
  });

  it("crava a dupla no número de seed sorteado", () => {
    const state: DrawEngineState = {
      ...gruposState(),
      format: "double_elimination",
      seedOrder: ["c1", null, null],
      lockedSeedCount: 1,
    };
    const next = applyReveal(state, {
      teamId: "t3",
      destination: {type: "seed", seed: 3},
      relaxed: [],
    });
    assert.deepEqual(next.seedOrder, ["c1", null, "t3"]);
  });
});

describe("destinationKeyOf", () => {
  it("grupo vira 'grupo:A'", () => {
    assert.equal(destinationKeyOf({type: "group", groupId: "A"}), "grupo:A");
  });

  it("seed vira 'seed:7'", () => {
    assert.equal(destinationKeyOf({type: "seed", seed: 7}), "seed:7");
  });
});
