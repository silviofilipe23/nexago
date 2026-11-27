import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {KnockoutQualifierSlot} from "./category-bracket-builders";
import {
  planKnockoutSlotFill,
  type KnockoutSlotState,
} from "./group-standings";

/** Resolve a vaga pelo próprio rótulo: campanha → "p{colocação}r{rank}", fixa → "{grupo}{colocação}". */
function resolverOf(overrides: Record<string, string> = {}) {
  return (slot: KnockoutQualifierSlot): string | null => {
    const key = "rank" in slot ? `p${slot.place}r${slot.rank}` : `${slot.poolId}${slot.place}`;
    return overrides[key] ?? key;
  };
}

function state(over: Partial<KnockoutSlotState>): KnockoutSlotState {
  return {teamAId: "", teamBId: "", a: null, b: null, started: false, drift: null, ...over};
}

const R = (place: number, rank: number) => ({place, rank});
const P = (poolId: string, place: number) => ({poolId, place});

describe("planKnockoutSlotFill · primeiro preenchimento", () => {
  it("vaga vazia recebe a dupla que a classificação aponta", () => {
    const plan = planKnockoutSlotFill(
      [state({a: R(1, 3), b: R(2, 3)}), state({a: R(1, 1)})],
      resolverOf(),
    );
    assert.deepEqual(plan, [{teamAId: "p1r3", teamBId: "p2r3"}, {teamAId: "p1r1"}]);
  });

  it("lado sem vaga de grupo (\"Vencedor Jogo #N\") não é tocado", () => {
    const plan = planKnockoutSlotFill([state({a: R(1, 1), b: null})], resolverOf());
    assert.deepEqual(plan, [{teamAId: "p1r1"}]);
  });

  it("nada a fazer quando tudo já está no lugar", () => {
    const plan = planKnockoutSlotFill(
      [state({a: R(1, 3), b: R(2, 3), teamAId: "p1r3", teamBId: "p2r3"})],
      resolverOf(),
    );
    assert.deepEqual(plan, [null]);
  });
});

describe("planKnockoutSlotFill · correção de placar na chave por campanha", () => {
  // A correção trocou a ordem dos 1ºs: quem era a 2ª melhor campanha virou a melhor.
  const afterCorrection = resolverOf({p1r1: "X", p1r2: "Y"});
  const filled = [
    state({a: R(1, 1), teamAId: "Y"}),
    state({a: R(1, 2), teamAId: "X"}),
    state({a: R(1, 3), b: R(2, 3), teamAId: "p1r3", teamBId: "p2r3"}),
  ];

  it("mata-mata ainda não começou: refaz a ordem das vagas", () => {
    assert.deepEqual(planKnockoutSlotFill(filled, afterCorrection), [
      {teamAId: "X"},
      {teamAId: "Y"},
      null,
    ]);
  });

  it("mata-mata já começou: não mexe em ninguém e marca o que ficou desatualizado", () => {
    const started = [...filled.slice(0, 2), {...filled[2]!, started: true}];
    assert.deepEqual(planKnockoutSlotFill(started, afterCorrection), [
      {qualifierDrift: {teamAId: "X"}},
      {qualifierDrift: {teamAId: "Y"}},
      null,
    ]);
  });

  it("basta UM jogo do mata-mata ter começado para a chave inteira ficar como está", () => {
    const started = [{...filled[0]!, started: true}, ...filled.slice(1)];
    const plan = planKnockoutSlotFill(started, afterCorrection);
    assert.ok(plan.every((patch) => patch === null || patch.teamAId === undefined));
  });

  it("aviso já gravado e ainda verdadeiro não é regravado", () => {
    const flagged = [
      state({a: R(1, 1), teamAId: "Y", started: true, drift: {teamAId: "X"}}),
      state({a: R(1, 2), teamAId: "X", drift: {teamAId: "Y"}}),
    ];
    assert.deepEqual(planKnockoutSlotFill(flagged, afterCorrection), [null, null]);
  });

  it("nova correção que devolve a ordem original limpa o aviso", () => {
    const flagged = [
      state({a: R(1, 1), teamAId: "Y", started: true, drift: {teamAId: "X"}}),
      state({a: R(1, 2), teamAId: "X", drift: {teamAId: "Y"}}),
    ];
    const backToOriginal = resolverOf({p1r1: "Y", p1r2: "X"});
    assert.deepEqual(planKnockoutSlotFill(flagged, backToOriginal), [
      {qualifierDrift: null},
      {qualifierDrift: null},
    ]);
  });

  it("vaga que a classificação não sabe resolver fica como está, sem aviso", () => {
    const plan = planKnockoutSlotFill(
      [state({a: R(1, 1), teamAId: "Y"})],
      () => null,
    );
    assert.deepEqual(plan, [null]);
  });
});

describe("planKnockoutSlotFill · chave de vagas fixas (formatos antigos)", () => {
  it("primeiro preenchimento funciona como sempre", () => {
    const plan = planKnockoutSlotFill([state({a: P("A", 1), b: P("B", 2)})], resolverOf());
    assert.deepEqual(plan, [{teamAId: "A1", teamBId: "B2"}]);
  });

  it("vaga já preenchida não é refeita nem marcada, mesmo com a classificação mudando", () => {
    const plan = planKnockoutSlotFill(
      [state({a: P("A", 1), b: P("B", 2), teamAId: "A2", teamBId: "B2"})],
      resolverOf(),
    );
    assert.deepEqual(plan, [null]);
  });

  it("só o lado vazio é preenchido", () => {
    const plan = planKnockoutSlotFill(
      [state({a: P("A", 1), b: P("B", 2), teamAId: "A2"})],
      resolverOf(),
    );
    assert.deepEqual(plan, [{teamBId: "B2"}]);
  });
});
