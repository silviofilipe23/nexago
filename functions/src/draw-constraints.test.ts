import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  feasibleGroups,
  type DrawConstraints,
  type DrawGroupState,
  type DrawTeamMeta,
} from "./draw-constraints";

const ALL_OFF: DrawConstraints = {seedsApart: false, potsPerGroup: false, avoidSameCity: false};

const grupo = (groupId: string, capacity: number, teamIds: string[] = []): DrawGroupState => ({
  groupId,
  capacity,
  teamIds,
});

/** Monta o índice de metadados a partir de tuplas `[teamId, pote, cidade]`. */
const metas = (...rows: Array<[string, number, string | null]>): Record<string, DrawTeamMeta> =>
  Object.fromEntries(rows.map(([teamId, potIndex, city]) => [teamId, {teamId, potIndex, city}]));

describe("feasibleGroups — vaga e pote", () => {
  it("sem restrição, todo grupo com vaga é destino viável", () => {
    const out = feasibleGroups({
      teamId: "x",
      groups: [grupo("A", 4), grupo("B", 4)],
      potTeamIds: ["x"],
      teamsById: metas(["x", 1, null]),
      constraints: ALL_OFF,
    });
    assert.deepEqual(out, {groupIds: ["A", "B"], relaxed: []});
  });

  it("grupo lotado sai da lista mesmo com todas as restrições desligadas", () => {
    const out = feasibleGroups({
      teamId: "x",
      groups: [grupo("A", 1, ["ja"]), grupo("B", 4)],
      potTeamIds: ["x"],
      teamsById: metas(["x", 1, null], ["ja", 1, null]),
      constraints: ALL_OFF,
    });
    assert.deepEqual(out.groupIds, ["B"]);
  });

  it("com potes por ranking, grupo que já recebeu dupla DESTE pote sai da lista", () => {
    const out = feasibleGroups({
      teamId: "x",
      groups: [grupo("A", 4, ["mesmoPote"]), grupo("B", 4, ["outroPote"])],
      potTeamIds: ["x"],
      teamsById: metas(["x", 2, null], ["mesmoPote", 2, null], ["outroPote", 1, null]),
      constraints: {...ALL_OFF, potsPerGroup: true},
    });
    assert.deepEqual(out.groupIds, ["B"]);
  });
});

describe("feasibleGroups — cabeças separadas", () => {
  it("com potes desligados, cabeça não cai em grupo que já tem cabeça", () => {
    const out = feasibleGroups({
      teamId: "cab2",
      groups: [grupo("A", 4, ["cab1"]), grupo("B", 4, ["naoCabeca"])],
      potTeamIds: ["cab2"],
      teamsById: metas(["cab2", 1, null], ["cab1", 1, null], ["naoCabeca", 3, null]),
      constraints: {...ALL_OFF, seedsApart: true},
    });
    assert.deepEqual(out.groupIds, ["B"]);
  });

  it("não-cabeça ignora a regra de cabeças", () => {
    const out = feasibleGroups({
      teamId: "comum",
      groups: [grupo("A", 4, ["cab1"]), grupo("B", 4)],
      potTeamIds: ["comum"],
      teamsById: metas(["comum", 3, null], ["cab1", 1, null]),
      constraints: {...ALL_OFF, seedsApart: true},
    });
    assert.deepEqual(out.groupIds, ["A", "B"]);
  });
});

describe("feasibleGroups — mesma cidade", () => {
  it("evita grupo que já tem dupla da mesma cidade", () => {
    const out = feasibleGroups({
      teamId: "x",
      groups: [grupo("A", 4, ["conterranea"]), grupo("B", 4)],
      potTeamIds: ["x"],
      teamsById: metas(["x", 2, "Goiânia"], ["conterranea", 1, "Goiânia"]),
      constraints: {...ALL_OFF, avoidSameCity: true},
    });
    assert.deepEqual(out, {groupIds: ["B"], relaxed: []});
  });

  it("cidade compara sem acento e sem caixa — 'goiania' é 'Goiânia'", () => {
    const out = feasibleGroups({
      teamId: "x",
      groups: [grupo("A", 4, ["conterranea"]), grupo("B", 4)],
      potTeamIds: ["x"],
      teamsById: metas(["x", 2, "goiania"], ["conterranea", 1, "Goiânia"]),
      constraints: {...ALL_OFF, avoidSameCity: true},
    });
    assert.deepEqual(out.groupIds, ["B"]);
  });

  it("dupla sem cidade informada nunca conflita", () => {
    const out = feasibleGroups({
      teamId: "x",
      groups: [grupo("A", 4, ["semCidade"])],
      potTeamIds: ["x"],
      teamsById: metas(["x", 2, null], ["semCidade", 1, null]),
      constraints: {...ALL_OFF, avoidSameCity: true},
    });
    assert.deepEqual(out, {groupIds: ["A"], relaxed: []});
  });

  it("RELAXA a cidade quando ela travaria o sorteio, e diz que relaxou", () => {
    const out = feasibleGroups({
      teamId: "x",
      groups: [grupo("A", 4, ["c1"]), grupo("B", 4, ["c2"])],
      potTeamIds: ["x"],
      teamsById: metas(["x", 2, "Goiânia"], ["c1", 1, "Goiânia"], ["c2", 1, "Goiânia"]),
      constraints: {...ALL_OFF, avoidSameCity: true},
    });
    assert.deepEqual(out, {groupIds: ["A", "B"], relaxed: ["same_city"]});
  });
});

describe("feasibleGroups — viabilidade do resto do pote", () => {
  it("descarta o destino que deixaria outra dupla do pote sem grupo", () => {
    // Y só cabe em A (nas outras a cidade conflita). Se X for pra A, Y trava.
    // Então A não é destino viável pra X, mesmo estando livre agora.
    const out = feasibleGroups({
      teamId: "x",
      groups: [grupo("A", 4), grupo("B", 4, ["bloqueiaY"])],
      potTeamIds: ["x", "y"],
      teamsById: metas(
        ["x", 2, "Anápolis"],
        ["y", 2, "Goiânia"],
        ["bloqueiaY", 1, "Goiânia"],
      ),
      constraints: {...ALL_OFF, potsPerGroup: true, avoidSameCity: true},
    });
    assert.deepEqual(out, {groupIds: ["B"], relaxed: []});
  });

  it("quando NENHUM destino mantém o pote solúvel, relaxa a cidade em vez de travar", () => {
    // Duas duplas de Goiânia no pote e os dois grupos já têm conterrâneas:
    // com a cidade valendo não existe solução, então ela cai.
    const out = feasibleGroups({
      teamId: "x",
      groups: [grupo("A", 4, ["c1"]), grupo("B", 4, ["c2"])],
      potTeamIds: ["x", "y"],
      teamsById: metas(
        ["x", 2, "Goiânia"],
        ["y", 2, "Goiânia"],
        ["c1", 1, "Goiânia"],
        ["c2", 1, "Goiânia"],
      ),
      constraints: {...ALL_OFF, potsPerGroup: true, avoidSameCity: true},
    });
    assert.deepEqual(out, {groupIds: ["A", "B"], relaxed: ["same_city"]});
  });

  it("último pote curto: 2 duplas para 4 grupos, só os que ainda têm vaga", () => {
    const out = feasibleGroups({
      teamId: "x",
      groups: [grupo("A", 4, ["1", "2", "3"]), grupo("B", 4, ["4", "5", "6"]), grupo("C", 3, ["7", "8", "9"]), grupo("D", 3, ["10", "11", "12"])],
      potTeamIds: ["x", "y"],
      teamsById: metas(
        ["x", 4, null],
        ["y", 4, null],
        ...(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map(
          (id) => [id, 1, null] as [string, number, null],
        )),
      ),
      constraints: {...ALL_OFF, potsPerGroup: true},
    });
    assert.deepEqual(out.groupIds, ["A", "B"]);
  });

  it("nenhum grupo com vaga devolve lista vazia — a callable trata como fim do sorteio", () => {
    const out = feasibleGroups({
      teamId: "x",
      groups: [grupo("A", 1, ["cheio"])],
      potTeamIds: ["x"],
      teamsById: metas(["x", 2, null], ["cheio", 1, null]),
      constraints: ALL_OFF,
    });
    assert.deepEqual(out, {groupIds: [], relaxed: []});
  });
});
