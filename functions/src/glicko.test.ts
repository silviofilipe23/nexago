import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GLICKO_OPTIONS,
  compositeTeamRating,
  inflateRd,
  updateRating,
} from "./glicko";

/** Opções sem piso/teto de RD, para bater com os números crus do paper. */
const PAPER_OPTIONS = {tau: 0.5, minRd: 0, maxRd: 1000};

describe("updateRating", () => {
  it("reproduz o known-answer do paper do Glickman", () => {
    // Exemplo do paper: 1500/RD200/vol0.06 vence 1400/30 e perde de
    // 1550/100 e 1700/300 → r'≈1464.06, RD'≈151.52, σ'≈0.05999.
    const result = updateRating(
      {rating: 1500, rd: 200, volatility: 0.06},
      [
        {rating: 1400, rd: 30, score: 1},
        {rating: 1550, rd: 100, score: 0},
        {rating: 1700, rd: 300, score: 0},
      ],
      PAPER_OPTIONS,
    );
    assert.ok(Math.abs(result.rating - 1464.06) < 0.05, `rating=${result.rating}`);
    assert.ok(Math.abs(result.rd - 151.52) < 0.05, `rd=${result.rd}`);
    assert.ok(Math.abs(result.volatility - 0.05999) < 0.0001);
  });

  it("vitória sobe e derrota desce o rating", () => {
    const player = {rating: 1600, rd: 120, volatility: 0.06};
    const opponent = {rating: 1600, rd: 120};
    const win = updateRating(player, [{...opponent, score: 1}]);
    const loss = updateRating(player, [{...opponent, score: 0}]);
    assert.ok(win.rating > player.rating);
    assert.ok(loss.rating < player.rating);
    // Jogar sempre reduz a incerteza.
    assert.ok(win.rd < player.rd);
    assert.ok(loss.rd < player.rd);
  });

  it("upset contra oponente mais forte move mais que vitória esperada", () => {
    const player = {rating: 1500, rd: 150, volatility: 0.06};
    const vsStronger = updateRating(player, [{rating: 1800, rd: 100, score: 1}]);
    const vsWeaker = updateRating(player, [{rating: 1200, rd: 100, score: 1}]);
    assert.ok(
      vsStronger.rating - player.rating > vsWeaker.rating - player.rating,
    );
  });

  it("respeita piso e teto de RD", () => {
    const confident = updateRating(
      {rating: 1500, rd: 62, volatility: 0.06},
      [{rating: 1500, rd: 60, score: 1}],
      DEFAULT_GLICKO_OPTIONS,
    );
    assert.ok(confident.rd >= DEFAULT_GLICKO_OPTIONS.minRd);
  });

  it("sem oponentes devolve o jogador inalterado", () => {
    const player = {rating: 1500, rd: 200, volatility: 0.06};
    assert.deepEqual(updateRating(player, []), player);
  });
});

describe("compositeTeamRating", () => {
  it("usa média de rating e média quadrática de RD", () => {
    const composite = compositeTeamRating([
      {rating: 1400, rd: 100},
      {rating: 1600, rd: 200},
    ]);
    assert.equal(composite.rating, 1500);
    // sqrt((100² + 200²)/2) ≈ 158.11
    assert.ok(Math.abs(composite.rd - Math.sqrt(25000)) < 1e-9);
  });

  it("com um único jogador devolve os valores dele", () => {
    const composite = compositeTeamRating([{rating: 1700, rd: 90}]);
    assert.equal(composite.rating, 1700);
    assert.equal(composite.rd, 90);
  });
});

describe("inflateRd", () => {
  it("infla linearmente e satura no teto", () => {
    assert.equal(inflateRd(100, 5, 6, 350), 130);
    assert.equal(inflateRd(340, 10, 6, 350), 350);
  });

  it("ignora semanas não positivas ou inválidas", () => {
    assert.equal(inflateRd(100, 0, 6, 350), 100);
    assert.equal(inflateRd(100, -3, 6, 350), 100);
    assert.equal(inflateRd(100, Number.NaN, 6, 350), 100);
  });
});
