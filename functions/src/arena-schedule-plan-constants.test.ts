import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import {
  addMonthsToDateKey,
  candidateStartTimes,
  commitmentEndsOn,
  cycleMonthlyPrice,
  effectiveDueDay,
  fitsPrimeCap,
  mergeScheduleSettingsInput,
  parseScheduleSettings,
  pickCourt,
  primeCapacityMinutes,
  primeMinutesOfSlots,
  primeOverlapMinutes,
  splitCents,
  startFitsWindows,
  upcomingNationalHolidays,
  validateChosenSlots,
  validateSchedulePlanInput,
  type BusyBlock,
} from "./arena-schedule-plan-constants";

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Fixo 2x noite",
    timesPerWeek: 2,
    durationMinutes: 90,
    windows: [
      {weekday: 1, startTime: "18:00", endTime: "23:00"},
      {weekday: 3, startTime: "18:00", endTime: "23:00"},
    ],
    courtIds: ["q1", "q2"],
    capacity: 8,
    monthlyPriceReais: 480,
    ...overrides,
  };
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof HttpsError ? e.code : "other";
  }
  return "ok";
}

describe("validateSchedulePlanInput", () => {
  it("aplica os padrões do spec no que faltar", () => {
    const plan = validateSchedulePlanInput(validInput());
    assert.equal(plan.status, "draft");
    assert.deepEqual(plan.cycles, {
      monthly: {enabled: true},
      quarterly: {enabled: true, discountPercent: 5},
      annual: {enabled: true, discountPercent: 10},
    });
    assert.deepEqual(plan.billing, {methods: ["pix_auto", "card", "onsite"], dueDay: 5, overdueReleaseDays: 3});
    assert.deepEqual(plan.rules.makeup, {enabled: true, perMonth: 2, validityDays: 30, noticeHours: 24});
    assert.equal(plan.rules.holiday, "makeup");
    assert.deepEqual(plan.rules.pause, {enabled: true, maxDaysPerYear: 30});
    assert.deepEqual(plan.rules.split, {enabled: true, maxPlayers: 4});
    assert.equal(plan.rules.weather, true);
  });

  it("recusa o que foge dos limites", () => {
    assert.equal(code(() => validateSchedulePlanInput(validInput({name: ""}))), "invalid-argument");
    assert.equal(code(() => validateSchedulePlanInput(validInput({timesPerWeek: 4}))), "invalid-argument");
    assert.equal(code(() => validateSchedulePlanInput(validInput({durationMinutes: 45}))), "invalid-argument");
    assert.equal(code(() => validateSchedulePlanInput(validInput({capacity: 0}))), "invalid-argument");
    assert.equal(code(() => validateSchedulePlanInput(validInput({courtIds: []}))), "invalid-argument");
    assert.equal(code(() => validateSchedulePlanInput(validInput({billing: {dueDay: 29}}))), "invalid-argument");
    assert.equal(code(() => validateSchedulePlanInput(validInput({billing: {overdueReleaseDays: 2}}))), "invalid-argument");
    assert.equal(code(() => validateSchedulePlanInput(validInput({rules: {makeup: {perMonth: 9}}}))), "invalid-argument");
    assert.equal(code(() => validateSchedulePlanInput(validInput({rules: {split: {maxPlayers: 7}}}))), "invalid-argument");
    // 2x por semana com janela num dia só não fecha.
    assert.equal(code(() => validateSchedulePlanInput(validInput({windows: [{weekday: 1, startTime: "18:00", endTime: "23:00"}]}))), "invalid-argument");
    // Janela menor que a duração.
    assert.equal(code(() => validateSchedulePlanInput(validInput({
      windows: [{weekday: 1, startTime: "18:00", endTime: "19:00"}, {weekday: 3, startTime: "18:00", endTime: "23:00"}],
    }))), "invalid-argument");
    assert.equal(code(() => validateSchedulePlanInput(validInput({
      cycles: {monthly: {enabled: false}, quarterly: {enabled: false}, annual: {enabled: false}},
    }))), "invalid-argument");
  });

  it("aceita fim à meia-noite (24:00 vira 00:00)", () => {
    const plan = validateSchedulePlanInput(validInput({
      windows: [{weekday: 1, startTime: "22:00", endTime: "24:00"}, {weekday: 3, startTime: "22:00", endTime: "00:00"}],
    }));
    assert.deepEqual(plan.windows.map((w) => w.endTime), ["00:00", "00:00"]);
    assert.deepEqual(candidateStartTimes(plan.windows, 1, 90), ["22:00", "22:30"]);
  });
});

describe("janelas e horários", () => {
  const windows = [{weekday: 1, startTime: "18:00", endTime: "21:00"}];

  it("inícios de hora em hora; de 30 em 30 no plano de 90 min", () => {
    assert.deepEqual(candidateStartTimes(windows, 1, 60), ["18:00", "19:00", "20:00"]);
    assert.deepEqual(candidateStartTimes(windows, 1, 90), ["18:00", "18:30", "19:00", "19:30"]);
    assert.deepEqual(candidateStartTimes(windows, 2, 60), []);
  });

  it("início dentro e fim até o fim da janela", () => {
    assert.equal(startFitsWindows(windows, 1, "19:30", 90), true);
    assert.equal(startFitsWindows(windows, 1, "20:00", 90), false);
    assert.equal(startFitsWindows(windows, 1, "17:30", 60), false);
    assert.equal(startFitsWindows(windows, 2, "19:00", 60), false);
  });

  it("validateChosenSlots exige timesPerWeek dias distintos dentro das janelas", () => {
    const plan = {windows: [...windows, {weekday: 3, startTime: "18:00", endTime: "21:00"}], timesPerWeek: 2, durationMinutes: 60};
    assert.deepEqual(validateChosenSlots(plan, [3, 1], "19:00"), {weekdays: [1, 3], startTime: "19:00", endTime: "20:00"});
    assert.equal(code(() => validateChosenSlots(plan, [1], "19:00")), "invalid-argument");
    assert.equal(code(() => validateChosenSlots(plan, [1, 1], "19:00")), "invalid-argument");
    assert.equal(code(() => validateChosenSlots(plan, [1, 2], "19:00")), "invalid-argument");
  });
});

describe("dinheiro e datas", () => {
  it("rateio em centavos com o resto no titular", () => {
    assert.deepEqual(splitCents(100, 3), [33.34, 33.33, 33.33]);
    assert.deepEqual(splitCents(480, 4), [120, 120, 120, 120]);
    assert.deepEqual(splitCents(10.01, 2), [5.01, 5]);
    const parts = splitCents(299.99, 6);
    assert.equal(Math.round(parts.reduce((a, b) => a + b, 0) * 100), 29999);
  });

  it("preço do ciclo é desconto sobre o mensal; compromisso +3/+12 meses", () => {
    const plan = {monthlyPriceReais: 480, cycles: {
      monthly: {enabled: true}, quarterly: {enabled: true, discountPercent: 5}, annual: {enabled: true, discountPercent: 10},
    }};
    assert.equal(cycleMonthlyPrice(plan, "monthly"), 480);
    assert.equal(cycleMonthlyPrice(plan, "quarterly"), 456);
    assert.equal(cycleMonthlyPrice(plan, "annual"), 432);
    assert.equal(commitmentEndsOn("monthly", "2026-11-03"), null);
    assert.equal(commitmentEndsOn("quarterly", "2026-11-30"), "2027-02-28");
    assert.equal(commitmentEndsOn("annual", "2026-11-03"), "2027-11-03");
    assert.equal(addMonthsToDateKey("2027-01-31", 1), "2027-02-28");
  });

  it("dueDay 0 = dia da assinatura, limitado a 28", () => {
    assert.equal(effectiveDueDay(10, "2026-11-30"), 10);
    assert.equal(effectiveDueDay(0, "2026-11-03"), 3);
    assert.equal(effectiveDueDay(0, "2026-11-30"), 28);
  });

  it("feriados nacionais próximos", () => {
    assert.deepEqual(upcomingNationalHolidays("2026-11-03", 20).map((h) => h.date), ["2026-11-15", "2026-11-20"]);
  });
});

describe("horário nobre", () => {
  const prime = [1, 2, 3, 4, 5].map((weekday) => ({weekday, startTime: "18:00", endTime: "23:00"}));

  it("sobreposição com a janela nobre do dia", () => {
    assert.equal(primeOverlapMinutes(prime, 1, 17 * 60, 19 * 60), 60);
    assert.equal(primeOverlapMinutes(prime, 1, 22 * 60, 24 * 60), 60);
    assert.equal(primeOverlapMinutes(prime, 6, 19 * 60, 20 * 60), 0);
    assert.equal(primeMinutesOfSlots(prime, [
      {weekday: 1, startTime: "19:00", endTime: "20:30"},
      {weekday: 6, startTime: "19:00", endTime: "20:30"},
    ]), 90);
  });

  it("capacidade = quadras ativas × horas das janelas; limite pelo percentual", () => {
    const capacity = primeCapacityMinutes(prime, 4); // 5 × 300 × 4
    assert.equal(capacity, 6000);
    assert.equal(fitsPrimeCap({usedMinutes: 4440, addedMinutes: 60, capacityMinutes: capacity, capPercent: 75}), true); // 75% exato
    assert.equal(fitsPrimeCap({usedMinutes: 4441, addedMinutes: 60, capacityMinutes: capacity, capPercent: 75}), false);
    // Fora do nobre sempre passa, mesmo com o nobre estourado.
    assert.equal(fitsPrimeCap({usedMinutes: 9999, addedMinutes: 0, capacityMinutes: capacity, capPercent: 75}), true);
    assert.equal(fitsPrimeCap({usedMinutes: 0, addedMinutes: 60, capacityMinutes: capacity, capPercent: 0}), false);
  });
});

describe("pickCourt", () => {
  const base = {courtIds: ["q1", "q2", "q3"], courtNames: ["Quadra 1", "Quadra 2", "Quadra 3"], startMin: 19 * 60, endMin: 20 * 60};

  it("primeira quadra livre em TODOS os dias escolhidos", () => {
    const busy: BusyBlock[] = [
      {courtId: "q1", weekday: 3, startMin: 19 * 60 + 30, endMin: 20 * 60 + 30}, // q1 ocupada só na quarta
      {courtId: "q2", weekday: 1, startMin: 18 * 60, endMin: 19 * 60}, // encosta, não sobrepõe
    ];
    assert.deepEqual(pickCourt({...base, weekdays: [1], busy}), {courtId: "q1", courtName: "Quadra 1"});
    assert.deepEqual(pickCourt({...base, weekdays: [1, 3], busy}), {courtId: "q2", courtName: "Quadra 2"});
  });

  it("quadra preferida vai na frente se estiver livre; nenhuma livre → null", () => {
    assert.equal(pickCourt({...base, weekdays: [1], busy: [], preferredCourtId: "q3"})?.courtId, "q3");
    const all: BusyBlock[] = ["q1", "q2", "q3"].map((courtId) => ({courtId, weekday: 1, startMin: 19 * 60, endMin: 21 * 60}));
    assert.equal(pickCourt({...base, weekdays: [1], busy: all, preferredCourtId: "q3"}), null);
  });
});

describe("regras da arena", () => {
  it("padrões e merge campo a campo", () => {
    const stored = parseScheduleSettings(undefined);
    assert.equal(stored.primeCapPercent, 75);
    assert.equal(stored.primeWindows.length, 5);
    assert.equal(stored.waitlistOfferHours, 24);
    const merged = mergeScheduleSettingsInput(stored, {primeCapPercent: 60, waitlistOfferHours: 48});
    assert.equal(merged.primeCapPercent, 60);
    assert.equal(merged.waitlistOfferHours, 48);
    assert.equal(merged.waitlistAutoOffer, true);
    assert.equal(code(() => mergeScheduleSettingsInput(stored, {waitlistOfferHours: 36})), "invalid-argument");
    assert.equal(code(() => mergeScheduleSettingsInput(stored, {primeCapPercent: 101})), "invalid-argument");
  });
});
