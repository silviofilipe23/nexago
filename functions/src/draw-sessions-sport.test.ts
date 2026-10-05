import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {drawSportCodeOf} from "./draw-sessions";

describe("draw-sessions · esporte do torneio para o sorteio", () => {
  it("lê o campo `sport` do doc (o que o wizard grava), não `sportId`", () => {
    assert.equal(drawSportCodeOf({sport: "beachVolleyball"}), "VOLEI_PRAIA");
    assert.equal(drawSportCodeOf({sportId: "beachVolleyball"}), null);
  });

  it("torneio sem esporte ou com esporte sem mapeamento cai no nível global (null)", () => {
    assert.equal(drawSportCodeOf({}), null);
    assert.equal(drawSportCodeOf({sport: "curling"}), null);
  });
});
