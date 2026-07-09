import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  canTransitionSlot,
  computeCompatibilityScore,
  computeConfirmationSchedule,
  isCancellationPenalized,
  isInviteExpired,
  resolveCheckInWindowState,
  type CompatibilityProfile,
} from "./friendly-match-logic";
import {DEFAULT_FRIENDLY_MATCH_CONFIG} from "./friendly-match-config";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Perfil base: intermediário_1 de vôlei em Vitória/ES, sem reputação. */
function profile(overrides: Partial<CompatibilityProfile> = {}): CompatibilityProfile {
  return {
    levelsBySport: {volei_praia: "intermediario_1"},
    city: "Vitória",
    state: "ES",
    ...overrides,
  };
}

describe("canTransition — máquina de estados do jogo", () => {
  it("aceita as transições válidas do ciclo", () => {
    const valid: Array<[string, string]> = [
      ["filling", "confirmed"],
      ["filling", "cancelled"],
      ["filling", "unfilled"],
      ["confirmed", "cancelled"],
      ["confirmed", "no_show"],
      ["confirmed", "completed"],
      ["completed", "reviewed"],
    ];
    for (const [from, to] of valid) {
      assert.equal(canTransition(from, to), true, `${from} → ${to} deveria ser válida`);
    }
  });

  it("rejeita transições fora do ciclo e a partir de estados terminais", () => {
    const invalid: Array<[string, string]> = [
      ["filling", "completed"],
      ["filling", "reviewed"],
      ["filling", "no_show"],
      ["confirmed", "unfilled"],
      ["confirmed", "reviewed"],
      ["unfilled", "confirmed"],
      ["cancelled", "confirmed"],
      ["no_show", "completed"],
      ["reviewed", "filling"],
      ["completed", "no_show"],
    ];
    for (const [from, to] of invalid) {
      assert.equal(canTransition(from, to), false, `${from} → ${to} deveria ser inválida`);
    }
  });

  it("rejeita estados desconhecidos", () => {
    assert.equal(canTransition("draft", "filling"), false);
    assert.equal(canTransition("filling", "banana"), false);
  });
});

describe("canTransitionSlot — máquina de estados da vaga", () => {
  it("aceita as transições válidas", () => {
    const valid: Array<[string, string]> = [
      ["invited", "accepted"],
      ["invited", "declined"],
      ["invited", "expired"],
      ["invited", "countered"],
      ["countered", "accepted"],
      ["countered", "declined"],
      ["countered", "expired"],
      ["declined", "invited"],
      ["expired", "invited"],
    ];
    for (const [from, to] of valid) {
      assert.equal(canTransitionSlot(from, to), true, `${from} → ${to} deveria ser válida`);
    }
  });

  it("rejeita transições fora do ciclo", () => {
    const invalid: Array<[string, string]> = [
      ["accepted", "declined"],
      ["accepted", "invited"],
      ["declined", "accepted"],
      ["expired", "accepted"],
      ["countered", "invited"],
    ];
    for (const [from, to] of invalid) {
      assert.equal(canTransitionSlot(from, to), false, `${from} → ${to} deveria ser inválida`);
    }
  });
});

describe("computeCompatibilityScore", () => {
  const base = {sport: "volei_praia", objective: "friendly" as const};

  it("mesmo nível + mesma cidade dá score alto; retorna breakdown", () => {
    const {score, breakdown} = computeCompatibilityScore({
      ...base,
      sender: profile(),
      recipient: profile(),
    });
    assert.ok(score >= 85, `score=${score}`);
    assert.ok(score <= 100);
    assert.equal(breakdown.levelProximity, 40);
    assert.equal(breakdown.location, 25);
  });

  it("níveis distantes reduzem o componente de nível", () => {
    const near = computeCompatibilityScore({
      ...base,
      sender: profile(),
      recipient: profile({levelsBySport: {volei_praia: "intermediario_2"}}),
    });
    const far = computeCompatibilityScore({
      ...base,
      sender: profile(),
      recipient: profile({levelsBySport: {volei_praia: "open"}}),
    });
    assert.ok(near.breakdown.levelProximity > far.breakdown.levelProximity);
    assert.ok(near.score > far.score);
  });

  it("nível ausente em um dos lados usa valor neutro (não zera)", () => {
    const {breakdown} = computeCompatibilityScore({
      ...base,
      sender: profile(),
      recipient: profile({levelsBySport: {}}),
    });
    assert.ok(breakdown.levelProximity > 0);
    assert.ok(breakdown.levelProximity < 40);
  });

  it("cidades diferentes no mesmo estado pontuam menos que mesma cidade; estados diferentes, zero", () => {
    const sameCity = computeCompatibilityScore({...base, sender: profile(), recipient: profile()});
    const sameState = computeCompatibilityScore({
      ...base,
      sender: profile(),
      recipient: profile({city: "Vila Velha"}),
    });
    const otherState = computeCompatibilityScore({
      ...base,
      sender: profile(),
      recipient: profile({city: "Santos", state: "SP"}),
    });
    assert.ok(sameCity.breakdown.location > sameState.breakdown.location);
    assert.ok(sameState.breakdown.location > otherState.breakdown.location);
    assert.equal(otherState.breakdown.location, 0);
  });

  it("compara cidade sem diferenciar acento/caixa", () => {
    const {breakdown} = computeCompatibilityScore({
      ...base,
      sender: profile({city: "VITORIA"}),
      recipient: profile({city: "vitória"}),
    });
    assert.equal(breakdown.location, 25);
  });

  it("objetivo formar dupla premia quem está procurando parceiro", () => {
    const looking = computeCompatibilityScore({
      sport: "volei_praia",
      objective: "partner",
      sender: profile(),
      recipient: profile({lookingForPartner: true}),
    });
    const notLooking = computeCompatibilityScore({
      sport: "volei_praia",
      objective: "partner",
      sender: profile(),
      recipient: profile({lookingForPartner: false}),
    });
    assert.ok(looking.breakdown.objective > notLooking.breakdown.objective);
    assert.equal(looking.breakdown.objective, 15);
  });

  it("reputação alta pontua mais que ausente; ausente não afunda novato", () => {
    const reputed = computeCompatibilityScore({
      ...base,
      sender: profile(),
      recipient: profile({reputationScore: 100}),
    });
    const novato = computeCompatibilityScore({...base, sender: profile(), recipient: profile()});
    const bad = computeCompatibilityScore({
      ...base,
      sender: profile(),
      recipient: profile({reputationScore: 20}),
    });
    assert.ok(reputed.breakdown.reputation > novato.breakdown.reputation);
    assert.ok(novato.breakdown.reputation > bad.breakdown.reputation);
  });

  it("score fica no intervalo 0–100 e é inteiro", () => {
    const worst = computeCompatibilityScore({
      sport: "volei_praia",
      objective: "partner",
      sender: profile(),
      recipient: profile({
        levelsBySport: {volei_praia: "open"},
        city: "Recife",
        state: "PE",
        lookingForPartner: false,
        reputationScore: 0,
      }),
    });
    assert.ok(worst.score >= 0);
    assert.ok(Number.isInteger(worst.score));
    const best = computeCompatibilityScore({
      sport: "volei_praia",
      objective: "partner",
      sender: profile(),
      recipient: profile({lookingForPartner: true, reputationScore: 100}),
    });
    assert.equal(best.score, 100);
  });
});

describe("computeConfirmationSchedule", () => {
  const config = DEFAULT_FRIENDLY_MATCH_CONFIG;

  it("deriva janela de check-in e lembretes do horário confirmado", () => {
    const chosen = Date.UTC(2026, 6, 20, 22, 0, 0); // 20/07 19h BRT
    const now = chosen - 48 * HOUR_MS;
    const schedule = computeConfirmationSchedule(chosen, config, now);
    assert.equal(schedule.checkInOpenAtMs, chosen - 30 * MINUTE_MS);
    assert.equal(schedule.checkInCloseAtMs, chosen + 24 * HOUR_MS);
    assert.equal(schedule.reminder24hAtMs, chosen - 24 * HOUR_MS);
    assert.equal(schedule.reminder2hAtMs, chosen - 2 * HOUR_MS);
  });

  it("omite lembrete que já ficou no passado (jogo confirmado em cima da hora)", () => {
    const chosen = Date.UTC(2026, 6, 20, 22, 0, 0);
    const now = chosen - 3 * HOUR_MS; // faltam 3h: lembrete de 24h já passou
    const schedule = computeConfirmationSchedule(chosen, config, now);
    assert.equal(schedule.reminder24hAtMs, null);
    assert.equal(schedule.reminder2hAtMs, chosen - 2 * HOUR_MS);
  });

  it("omite ambos os lembretes quando faltam menos de 2h", () => {
    const chosen = Date.UTC(2026, 6, 20, 22, 0, 0);
    const schedule = computeConfirmationSchedule(chosen, config, chosen - HOUR_MS);
    assert.equal(schedule.reminder24hAtMs, null);
    assert.equal(schedule.reminder2hAtMs, null);
  });
});

describe("resolveCheckInWindowState", () => {
  const open = 1000;
  const close = 5000;

  it("antes da abertura → not_open; dentro → open; depois → closed", () => {
    assert.equal(resolveCheckInWindowState(open, close, 999), "not_open");
    assert.equal(resolveCheckInWindowState(open, close, 1000), "open");
    assert.equal(resolveCheckInWindowState(open, close, 3000), "open");
    assert.equal(resolveCheckInWindowState(open, close, 5000), "open");
    assert.equal(resolveCheckInWindowState(open, close, 5001), "closed");
  });
});

describe("isCancellationPenalized", () => {
  const config = DEFAULT_FRIENDLY_MATCH_CONFIG;
  const scheduled = Date.UTC(2026, 6, 20, 22, 0, 0);

  it("cancelar com mais de 6h de antecedência não penaliza", () => {
    assert.equal(isCancellationPenalized(scheduled, scheduled - 7 * HOUR_MS, config), false);
    assert.equal(isCancellationPenalized(scheduled, scheduled - 6 * HOUR_MS, config), false);
  });

  it("cancelar dentro da janela de 6h (ou após o horário) penaliza", () => {
    assert.equal(isCancellationPenalized(scheduled, scheduled - 5 * HOUR_MS, config), true);
    assert.equal(isCancellationPenalized(scheduled, scheduled + HOUR_MS, config), true);
  });
});

describe("isInviteExpired", () => {
  it("expira estritamente após o prazo", () => {
    assert.equal(isInviteExpired(1000, 999), false);
    assert.equal(isInviteExpired(1000, 1000), false);
    assert.equal(isInviteExpired(1000, 1001), true);
  });
});
