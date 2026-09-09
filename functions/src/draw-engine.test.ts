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

describe("nextReveal — cabeças com lugar já definido", () => {
  /**
   * Em fase de grupos as cabeças não são sorteadas de verdade: a 1 vai pro
   * grupo A, a 2 pro B, e assim por diante. O show no telão continua igual,
   * mas o resultado é conhecido — e é por isso que a revelação sai MARCADA,
   * pra o comprovante não vender como sorteio o que não foi.
   */
  const comCabecas = (over: Partial<DrawEngineState> = {}): DrawEngineState => ({
    ...gruposState(),
    constraints: {...semRestricao, potsPerGroup: true, seedsPreassigned: true},
    ...over,
  });

  /** Estoura se for chamado: revelação predeterminada não pode sortear nada. */
  const nuncaSorteia = (): number => {
    throw new Error("o sorteador foi chamado numa revelação predeterminada");
  };

  it("a primeira cabeça do ranking vai pro primeiro grupo", () => {
    const out = nextReveal(comCabecas(), nuncaSorteia);
    assert.deepEqual(out, {
      status: "ok",
      reveal: {
        teamId: "t1",
        destination: {type: "group", groupId: "A"},
        relaxed: [],
        preassigned: true,
      },
    });
  });

  it("a segunda cabeça vai pro segundo grupo", () => {
    const state = comCabecas({
      revealedTeamIds: ["t1"],
      groups: [
        {groupId: "A", capacity: 2, teamIds: ["t1"]},
        {groupId: "B", capacity: 2, teamIds: []},
      ],
    });
    const out = nextReveal(state, nuncaSorteia);
    assert.equal(out.status === "ok" && out.reveal.teamId, "t2");
    assert.deepEqual(
      out.status === "ok" ? out.reveal.destination : null,
      {type: "group", groupId: "B"},
    );
  });

  it("revelação predeterminada NÃO consome aleatoriedade", () => {
    // O teste acima já prova isso pelo sorteador que estoura; aqui fica
    // explícito porque é o que separa "encenação" de "sorteio".
    assert.doesNotThrow(() => nextReveal(comCabecas(), nuncaSorteia));
  });

  it("do pote 2 em diante volta a sortear de verdade, e sem a marca", () => {
    const state = comCabecas({
      revealedTeamIds: ["t1", "t2"],
      groups: [
        {groupId: "A", capacity: 2, teamIds: ["t1"]},
        {groupId: "B", capacity: 2, teamIds: ["t2"]},
      ],
    });
    const out = nextReveal(state, scripted(1, 0));
    assert.equal(out.status === "ok" && out.reveal.teamId, "t4");
    assert.equal(out.status === "ok" && out.reveal.preassigned, undefined);
  });

  it("com a regra desligada, as cabeças voltam a ser sorteadas", () => {
    const state = comCabecas({
      constraints: {...semRestricao, potsPerGroup: true, seedsPreassigned: false},
    });
    const out = nextReveal(state, scripted(1, 1));
    assert.equal(out.status === "ok" && out.reveal.teamId, "t2");
    assert.equal(out.status === "ok" && out.reveal.preassigned, undefined);
  });

  it("cabeça a mais do que grupo cai no sorteio em vez de estourar", () => {
    // Não deveria acontecer (o pote 1 tem o tamanho do nº de grupos), mas se a
    // sessão vier torta é melhor sortear do que travar a transmissão.
    const state = comCabecas({
      pots: [
        {index: 1, teamIds: ["t1", "t2", "t3"]},
        {index: 2, teamIds: ["t4"]},
      ],
      revealedTeamIds: ["t1", "t2"],
      groups: [
        {groupId: "A", capacity: 2, teamIds: ["t1"]},
        {groupId: "B", capacity: 2, teamIds: ["t2"]},
      ],
    });
    const out = nextReveal(state, scripted(0, 0));
    assert.equal(out.status, "ok");
    assert.equal(out.status === "ok" && out.reveal.preassigned, undefined);
  });
});

/**
 * As cabeças da dupla eliminatória ENTRAVAM na chave sem passar pelo sorteio:
 * `seedOrder` já nascia com elas, e o telão nunca dizia os nomes delas. Agora
 * elas passam pelo mesmo show — dados, spotlight, frase — só que caindo no seed
 * que o ranking já definia. Nada de aleatório é gasto nisso.
 */
describe("nextReveal — cabeças da dupla eliminatória no ar", () => {
  const noAr = (over: Partial<DrawEngineState> = {}): DrawEngineState => ({
    format: "double_elimination",
    constraints: semRestricao,
    // O pote agora tem TODO MUNDO: as cabeças na frente, em ordem de ranking.
    pots: [{index: 1, teamIds: ["c1", "c2", "x", "y"]}],
    teamsById: {
      c1: {teamId: "c1", potIndex: 1, city: null, lockedSeed: 1},
      c2: {teamId: "c2", potIndex: 1, city: null, lockedSeed: 2},
      x: {teamId: "x", potIndex: 2, city: null, lockedSeed: null},
      y: {teamId: "y", potIndex: 2, city: null, lockedSeed: null},
    },
    groups: [],
    seedOrder: [null, null, null, null],
    lockedSeedCount: 2,
    revealedTeamIds: [],
    ...over,
  });

  const nuncaSorteia = (): number => {
    throw new Error("o sorteador foi chamado numa revelação predeterminada");
  };

  it("a cabeça 1 abre o sorteio, no seed 1, marcada e sem sortear", () => {
    assert.deepEqual(nextReveal(noAr(), nuncaSorteia), {
      status: "ok",
      reveal: {
        teamId: "c1",
        destination: {type: "seed", seed: 1},
        relaxed: [],
        preassigned: true,
      },
    });
  });

  it("a cabeça 2 vem em seguida, no seed 2", () => {
    const out = nextReveal(
      noAr({revealedTeamIds: ["c1"], seedOrder: ["c1", null, null, null]}),
      nuncaSorteia,
    );
    assert.equal(out.status === "ok" && out.reveal.teamId, "c2");
    assert.deepEqual(
      out.status === "ok" ? out.reveal.destination : null,
      {type: "seed", seed: 2},
    );
  });

  it("cabeça sai antes de não-cabeça mesmo se o pote vier fora de ordem", () => {
    const out = nextReveal(
      noAr({pots: [{index: 1, teamIds: ["x", "c2", "y", "c1"]}]}),
      nuncaSorteia,
    );
    assert.equal(out.status === "ok" && out.reveal.teamId, "c1");
  });

  it("acabadas as cabeças, volta a sortear de verdade — e sem a marca", () => {
    const out = nextReveal(
      noAr({revealedTeamIds: ["c1", "c2"], seedOrder: ["c1", "c2", null, null]}),
      scripted(0, 0),
    );
    assert.equal(out.status === "ok" && out.reveal.teamId, "x");
    assert.deepEqual(
      out.status === "ok" ? out.reveal.destination : null,
      {type: "seed", seed: 3},
    );
    assert.equal(out.status === "ok" && out.reveal.preassigned, undefined);
  });

  it("o seed de uma cabeça nunca é oferecido ao sorteio", () => {
    // Sorteador pedindo sempre o índice 0: se o seed 1 estivesse na lista de
    // abertos, a não-cabeça roubaria o lugar da cabeça.
    const out = nextReveal(
      noAr({revealedTeamIds: ["c1", "c2"], seedOrder: ["c1", "c2", null, null]}),
      () => 0,
    );
    assert.ok(out.status === "ok" && out.reveal.destination.type === "seed");
    assert.ok(
      out.status === "ok" &&
        out.reveal.destination.type === "seed" &&
        out.reveal.destination.seed > 2,
    );
  });

  it("sessão antiga — cabeças FORA do pote — segue sorteando como antes", () => {
    const antiga = noAr({
      pots: [{index: 1, teamIds: ["x", "y"]}],
      seedOrder: ["c1", "c2", null, null],
    });
    const out = nextReveal(antiga, scripted(0, 0));
    assert.equal(out.status === "ok" && out.reveal.teamId, "x");
    assert.equal(out.status === "ok" && out.reveal.preassigned, undefined);
  });
});
