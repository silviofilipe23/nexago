import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {parseLadderConfig, adjacentLevel, resolveLadderLevel} from "./rating-config";
import {
  applyLadderActions,
  applyPromotion,
  applyRelegation,
  computeZone,
  evaluateLadderTransition,
  expectedLevelRankFor,
  type AthleteRatingState,
} from "./rating-ladder";

const NOW = new Date("2026-07-01T12:00:00Z");
const DAY_MS = 86_400_000;

/** Config default (shadow on) com overrides pontuais de flags. */
function config(flags: Record<string, boolean> = {}) {
  return parseLadderConfig("VOLEI_PRAIA", {flags});
}

/** Atleta intermediario_1 consolidado (gates de decisão satisfeitos). */
function state(overrides: Partial<AthleteRatingState> = {}): AthleteRatingState {
  return {
    athleteId: "a1",
    sportCode: "VOLEI_PRAIA",
    rating: 1600,
    rd: 90,
    volatility: 0.06,
    ratedMatches: 12,
    wins: 7,
    losses: 5,
    lastMatchAt: NOW,
    levelCode: "intermediario_1",
    levelRank: 2,
    zone: "stable",
    ladderState: "stable",
    observationStartedAt: null,
    observationMatches: 0,
    notifiedAt: null,
    protectedUntil: null,
    seededFromLevel: "intermediario_1",
    ...overrides,
  };
}

describe("computeZone", () => {
  it("identifica zonas pelas bandas do nível", () => {
    const level = config().levels.find((l) => l.code === "intermediario_1")!;
    assert.equal(computeZone(1720, level), "promotion");
    assert.equal(computeZone(1600, level), "stable");
    assert.equal(computeZone(1500, level), "relegation");
  });
});

describe("evaluateLadderTransition · promoção", () => {
  it("stable → promotion_pending quando cruza a banda com gates ok", () => {
    const {next, actions} = evaluateLadderTransition(
      state({rating: 1725}),
      config(),
      NOW,
      "match",
    );
    assert.equal(next.ladderState, "promotion_pending");
    assert.equal(next.zone, "promotion");
    assert.ok(actions.some((a) => a.kind === "promote"));
    const promote = actions.find((a) => a.kind === "promote")!;
    assert.equal(promote.kind === "promote" && promote.to.code, "intermediario_2");
  });

  it("RD alto ou poucas partidas bloqueiam a decisão (mas a zona aparece)", () => {
    const highRd = evaluateLadderTransition(
      state({rating: 1725, rd: 200}),
      config(),
      NOW,
      "match",
    );
    assert.equal(highRd.next.ladderState, "stable");
    assert.equal(highRd.next.zone, "promotion");
    assert.equal(highRd.actions.length, 0);

    const fewMatches = evaluateLadderTransition(
      state({rating: 1725, ratedMatches: 4}),
      config(),
      NOW,
      "match",
    );
    assert.equal(fewMatches.next.ladderState, "stable");
    assert.equal(fewMatches.actions.length, 0);
  });

  it("open (topo) nunca entra em promoção", () => {
    const {next, actions} = evaluateLadderTransition(
      state({levelCode: "open", levelRank: 6, rating: 2400}),
      config(),
      NOW,
      "match",
    );
    assert.equal(next.ladderState, "stable");
    assert.equal(actions.length, 0);
  });

  it("promotion_pending volta a stable se cair da banda (zona morta)", () => {
    const {next, actions} = evaluateLadderTransition(
      state({ladderState: "promotion_pending", rating: 1680}),
      config(),
      NOW,
      "match",
    );
    assert.equal(next.ladderState, "stable");
    assert.equal(actions.length, 0);
  });
});

describe("evaluateLadderTransition · rebaixamento", () => {
  it("stable → relegation_observation com aviso único", () => {
    const {next, actions} = evaluateLadderTransition(
      state({rating: 1490}),
      config(),
      NOW,
      "match",
    );
    assert.equal(next.ladderState, "relegation_observation");
    assert.deepEqual(next.observationStartedAt, NOW);
    assert.equal(next.observationMatches, 0);
    assert.ok(
      actions.some((a) => a.kind === "notify" && a.type === "relegation_warning"),
    );
  });

  it("proteção pós-promoção bloqueia a observação", () => {
    const {next, actions} = evaluateLadderTransition(
      state({rating: 1490, protectedUntil: new Date(NOW.getTime() + DAY_MS)}),
      config(),
      NOW,
      "match",
    );
    assert.equal(next.ladderState, "stable");
    assert.equal(actions.length, 0);
  });

  it("piso da escada (iniciante_1) nunca é rebaixado", () => {
    const {next, actions} = evaluateLadderTransition(
      state({levelCode: "iniciante_1", levelRank: 0, rating: 900}),
      config(),
      NOW,
      "match",
    );
    assert.equal(next.ladderState, "stable");
    assert.equal(actions.length, 0);
  });

  it("partida na observação incrementa o contador", () => {
    const {next} = evaluateLadderTransition(
      state({
        ladderState: "relegation_observation",
        rating: 1480,
        observationStartedAt: NOW,
        observationMatches: 2,
      }),
      config(),
      NOW,
      "match",
    );
    assert.equal(next.observationMatches, 3);
    assert.equal(next.ladderState, "relegation_observation");
  });

  it("recuperação acima da margem limpa a observação", () => {
    const {next, actions} = evaluateLadderTransition(
      state({
        ladderState: "relegation_observation",
        rating: 1541, // demoteAt 1500 + margem 40
        observationStartedAt: new Date(NOW.getTime() - 30 * DAY_MS),
        observationMatches: 3,
      }),
      config(),
      NOW,
      "match",
    );
    assert.equal(next.ladderState, "stable");
    assert.equal(next.observationStartedAt, null);
    assert.ok(
      actions.some((a) => a.kind === "notify" && a.type === "relegation_cleared"),
    );
  });

  it("janela expirada + amostra suficiente → ação de rebaixamento (daily)", () => {
    const {next, actions} = evaluateLadderTransition(
      state({
        ladderState: "relegation_observation",
        rating: 1480,
        observationStartedAt: new Date(NOW.getTime() - 91 * DAY_MS),
        observationMatches: 7,
      }),
      config(),
      NOW,
      "daily",
    );
    assert.equal(next.ladderState, "relegation_observation");
    const demote = actions.find((a) => a.kind === "demote");
    assert.ok(demote);
    assert.equal(demote.kind === "demote" && demote.to.code, "iniciante_2");
    assert.ok(
      actions.some((a) => a.kind === "notify" && a.type === "relegation_applied"),
    );
  });

  it("janela expirada com poucas partidas é inconclusiva → stable, sem rebaixar", () => {
    const {next, actions} = evaluateLadderTransition(
      state({
        ladderState: "relegation_observation",
        rating: 1480,
        observationStartedAt: new Date(NOW.getTime() - 91 * DAY_MS),
        observationMatches: 3,
      }),
      config(),
      NOW,
      "daily",
    );
    assert.equal(next.ladderState, "stable");
    assert.equal(actions.length, 0);
  });

  it("janela em andamento não decide no passe diário", () => {
    const {next, actions} = evaluateLadderTransition(
      state({
        ladderState: "relegation_observation",
        rating: 1480,
        observationStartedAt: new Date(NOW.getTime() - 30 * DAY_MS),
        observationMatches: 7,
      }),
      config(),
      NOW,
      "daily",
    );
    assert.equal(next.ladderState, "relegation_observation");
    assert.equal(actions.length, 0);
  });
});

describe("applyPromotion / applyRelegation", () => {
  it("promoção sobe o nível e ativa proteção sem tocar no rating", () => {
    const cfg = config();
    const to = cfg.levels.find((l) => l.code === "intermediario_2")!;
    const promoted = applyPromotion(state({rating: 1725}), cfg, to, NOW);
    assert.equal(promoted.levelCode, "intermediario_2");
    assert.equal(promoted.levelRank, 3);
    assert.equal(promoted.ladderState, "stable");
    assert.equal(promoted.rating, 1725);
    assert.equal(
      promoted.protectedUntil?.getTime(),
      NOW.getTime() + 120 * DAY_MS,
    );
  });

  it("rebaixamento desce o nível e re-seeda o RD (bloqueia nova decisão)", () => {
    const cfg = config();
    const to = cfg.levels.find((l) => l.code === "iniciante_2")!;
    const demoted = applyRelegation(
      state({rating: 1480, ladderState: "relegation_observation"}),
      cfg,
      to,
    );
    assert.equal(demoted.levelCode, "iniciante_2");
    assert.equal(demoted.ladderState, "stable");
    assert.equal(demoted.rd, Math.round(300 * 0.7));
    assert.ok(demoted.rd > cfg.ladder.maxRdForDecision);
  });
});

/** Firestore fake que registra writes (suficiente p/ applyLadderActions). */
function mockDb() {
  const writes: Array<{path: string; data: Record<string, unknown>}> = [];
  return {
    writes,
    doc: (path: string) => ({
      set: async (data: Record<string, unknown>) => {
        writes.push({path, data});
      },
    }),
    collection: (path: string) => ({
      add: async (data: Record<string, unknown>) => {
        writes.push({path, data});
      },
    }),
  };
}

describe("applyLadderActions · flags de rollout", () => {
  it("shadowMode suprime qualquer efeito externo (estado pendente persiste)", async () => {
    const db = mockDb();
    const cfg = config({shadowMode: true, autoPromotionEnabled: true, notificationsEnabled: true});
    const evaluation = evaluateLadderTransition(
      state({rating: 1725}),
      cfg,
      NOW,
      "match",
    );
    const final = await applyLadderActions(db as never, evaluation, cfg, NOW);
    assert.equal(db.writes.length, 0);
    assert.equal(final.ladderState, "promotion_pending");
    assert.equal(final.levelCode, "intermediario_1");
  });

  it("flag de promoção desligada mantém pendente mesmo fora do shadow", async () => {
    const db = mockDb();
    const cfg = config({shadowMode: false, autoPromotionEnabled: false});
    const evaluation = evaluateLadderTransition(
      state({rating: 1725}),
      cfg,
      NOW,
      "match",
    );
    const final = await applyLadderActions(db as never, evaluation, cfg, NOW);
    assert.equal(db.writes.length, 0);
    assert.equal(final.ladderState, "promotion_pending");
  });

  it("auto-promoção aplica nível em levelsBySport + auditoria em levelHistory", async () => {
    const db = mockDb();
    const cfg = config({shadowMode: false, autoPromotionEnabled: true});
    const evaluation = evaluateLadderTransition(
      state({rating: 1725}),
      cfg,
      NOW,
      "match",
    );
    const final = await applyLadderActions(db as never, evaluation, cfg, NOW);

    assert.equal(final.levelCode, "intermediario_2");
    assert.equal(final.ladderState, "stable");
    assert.ok(final.protectedUntil);

    const userWrite = db.writes.find((w) => w.path === "users/a1");
    assert.ok(userWrite);
    assert.deepEqual(userWrite.data, {
      sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "intermediario_2"}},
    });

    const history = db.writes.find((w) => w.path === "users/a1/levelHistory");
    assert.ok(history);
    assert.equal(history.data.reason, "promotion");
    assert.equal(history.data.toLevel, "intermediario_2");
    assert.equal(history.data.actor, "rating_engine");
  });

  it("auto-rebaixamento aplica o degrau abaixo com auditoria", async () => {
    const db = mockDb();
    const cfg = config({shadowMode: false, autoRelegationEnabled: true});
    const evaluation = evaluateLadderTransition(
      state({
        ladderState: "relegation_observation",
        rating: 1480,
        observationStartedAt: new Date(NOW.getTime() - 91 * DAY_MS),
        observationMatches: 7,
      }),
      cfg,
      NOW,
      "daily",
    );
    const final = await applyLadderActions(db as never, evaluation, cfg, NOW);

    assert.equal(final.levelCode, "iniciante_2");
    assert.equal(final.ladderState, "stable");
    const history = db.writes.find((w) => w.path === "users/a1/levelHistory");
    assert.ok(history);
    assert.equal(history.data.reason, "relegation");
    assert.equal(history.data.fromLevel, "intermediario_1");
    assert.equal(history.data.toLevel, "iniciante_2");
  });
});

describe("escada de 7 degraus", () => {
  const cfg = parseLadderConfig("VOLEI_PRAIA", undefined);

  it("tem os 7 degraus com a régua do spec", () => {
    assert.equal(cfg.levels.length, 7);
    const byCode = Object.fromEntries(cfg.levels.map((l) => [l.code, l]));
    assert.deepEqual(
      [byCode.avancado_1.rank, byCode.avancado_1.initialRating, byCode.avancado_1.promoteAt, byCode.avancado_1.demoteAt],
      [4, 1900, 2020, 1800],
    );
    assert.deepEqual(
      [byCode.avancado_2.rank, byCode.avancado_2.initialRating, byCode.avancado_2.promoteAt, byCode.avancado_2.demoteAt],
      [5, 2050, 2170, 1950],
    );
    assert.deepEqual(
      [byCode.open.rank, byCode.open.initialRating, byCode.open.promoteAt, byCode.open.demoteAt],
      [6, 2200, null, 2100],
    );
  });

  it("adjacência atravessa os degraus novos", () => {
    const int2 = cfg.levels.find((l) => l.code === "intermediario_2")!;
    assert.equal(adjacentLevel(cfg, int2, "up")?.code, "avancado_1");
    const open = cfg.levels.find((l) => l.code === "open")!;
    assert.equal(adjacentLevel(cfg, open, "down")?.code, "avancado_2");
  });

  it("legado 'livre' resolve pro degrau open (rank 6)", () => {
    assert.equal(resolveLadderLevel(cfg, "livre").code, "open");
  });
});

describe("expectedLevelRankFor", () => {
  const config = parseLadderConfig("VOLEI_PRAIA", undefined);
  it("recalcula o rank pelo CÓDIGO, nunca pelo rank gravado", () => {
    assert.equal(expectedLevelRankFor(config, "open"), 6); // doc antigo tinha 5
    assert.equal(expectedLevelRankFor(config, "avancado_1"), 4);
    assert.equal(expectedLevelRankFor(config, "livre"), 6); // legado → open
    assert.equal(expectedLevelRankFor(config, ""), 0); // desconhecido → piso
  });
});
