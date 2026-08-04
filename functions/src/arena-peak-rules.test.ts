import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  peakViolation,
  resolveDayAvailability,
  spNow,
  parsePeakRulesFromDocs,
  ensurePeakRuleSatisfied,
  type ArenaPeakRuleDoc,
  type PeakSlotView,
  type SpNow,
} from "./arena-peak-rules";

function rule(overrides: Partial<ArenaPeakRuleDoc> = {}): ArenaPeakRuleDoc {
  return {
    id: "r1", active: true, label: "Pico noturno",
    courtIds: [], weekdays: [],
    startTime: "20:00", endTime: "21:00",
    minDurationMinutes: 120, releaseHoursBefore: null,
    ...overrides,
  };
}

// 05/08/2026 é quarta; "agora" cedo do mesmo dia.
const NOW: SpNow = {dateKey: "2026-08-05", minutes: 10 * 60};
const DATE_KEY = "2026-08-05";

function view(startTime: string, endTime: string, available = true): PeakSlotView {
  return {startTime, endTime, available};
}

describe("peakViolation", () => {
  const daySlots = [view("19:00", "20:00"), view("20:00", "21:00"), view("21:00", "22:00")];

  it("sem regra ativa: sem violação", () => {
    assert.equal(peakViolation({
      rules: [], courtId: "q1", dateKey: DATE_KEY, daySlots,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: NOW,
    }), null);
  });

  it("20h avulsa com vizinhas livres viola (mínimo 120)", () => {
    const v = peakViolation({
      rules: [rule()], courtId: "q1", dateKey: DATE_KEY, daySlots,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: NOW,
    });
    assert.deepEqual(v, {minDurationMinutes: 120});
  });

  it("seleção 19h+20h cumpre o mínimo", () => {
    assert.equal(peakViolation({
      rules: [rule()], courtId: "q1", dateKey: DATE_KEY, daySlots,
      selectionStartTimes: ["19:00", "20:00"], slotDurationMinutes: 60, now: NOW,
    }), null);
  });

  it("vizinhas indisponíveis: avulso liberado", () => {
    const cercado = [view("19:00", "20:00", false), view("20:00", "21:00"), view("21:00", "22:00", false)];
    assert.equal(peakViolation({
      rules: [rule()], courtId: "q1", dateKey: DATE_KEY, daySlots: cercado,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: NOW,
    }), null);
  });

  it("uma vizinha livre mantém a exigência", () => {
    const parcial = [view("19:00", "20:00", false), view("20:00", "21:00"), view("21:00", "22:00")];
    assert.notEqual(peakViolation({
      rules: [rule()], courtId: "q1", dateKey: DATE_KEY, daySlots: parcial,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: NOW,
    }), null);
  });

  it("janela de liberação por antecedência (3h antes)", () => {
    const r = rule({releaseHoursBefore: 3});
    const dentro: SpNow = {dateKey: DATE_KEY, minutes: 17 * 60 + 30};
    const fora: SpNow = {dateKey: DATE_KEY, minutes: 16 * 60 + 59};
    assert.equal(peakViolation({
      rules: [r], courtId: "q1", dateKey: DATE_KEY, daySlots,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: dentro,
    }), null);
    assert.notEqual(peakViolation({
      rules: [r], courtId: "q1", dateKey: DATE_KEY, daySlots,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: fora,
    }), null);
  });

  it("regra de outro dia da semana não se aplica", () => {
    assert.equal(peakViolation({
      rules: [rule({weekdays: [6, 7]})], courtId: "q1", dateKey: DATE_KEY, daySlots,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: NOW,
    }), null);
  });

  it("duas regras sobrepostas: vale o maior mínimo", () => {
    const grade4 = [view("18:00", "19:00"), view("19:00", "20:00"), view("20:00", "21:00"), view("21:00", "22:00")];
    const v = peakViolation({
      rules: [rule(), rule({id: "r2", minDurationMinutes: 180})],
      courtId: "q1", dateKey: DATE_KEY, daySlots: grade4,
      selectionStartTimes: ["20:00", "21:00"], slotDurationMinutes: 60, now: NOW,
    });
    assert.deepEqual(v, {minDurationMinutes: 180});
  });

  it("slot de 30min: mínimo 120 = 4 slots", () => {
    const meia = [
      view("19:00", "19:30"), view("19:30", "20:00"),
      view("20:00", "20:30"), view("20:30", "21:00"),
      view("21:00", "21:30"), view("21:30", "22:00"),
    ];
    assert.notEqual(peakViolation({
      rules: [rule()], courtId: "q1", dateKey: DATE_KEY, daySlots: meia,
      selectionStartTimes: ["20:00", "20:30"], slotDurationMinutes: 30, now: NOW,
    }), null);
    assert.equal(peakViolation({
      rules: [rule()], courtId: "q1", dateKey: DATE_KEY, daySlots: meia,
      selectionStartTimes: ["19:00", "19:30", "20:00", "20:30"], slotDurationMinutes: 30, now: NOW,
    }), null);
  });
});

describe("resolveDayAvailability", () => {
  it("slot virtual coberto por persistido booked/blocked fica indisponível", () => {
    const out = resolveDayAvailability({
      virtual: [
        {startTime: "19:00", endTime: "20:00"},
        {startTime: "20:00", endTime: "21:00"},
        {startTime: "21:00", endTime: "22:00"},
      ],
      persisted: [{startTime: "19:00", endTime: "21:00", status: "booked"}],
      dateKey: DATE_KEY,
      now: NOW,
    });
    assert.deepEqual(out.map((s) => s.available), [false, false, true]);
  });

  it("slot que já passou fica indisponível para cadeia", () => {
    const out = resolveDayAvailability({
      virtual: [{startTime: "09:00", endTime: "10:00"}, {startTime: "11:00", endTime: "12:00"}],
      persisted: [],
      dateKey: DATE_KEY,
      now: NOW, // 10:00
    });
    assert.deepEqual(out.map((s) => s.available), [false, true]);
  });

  it("dia futuro inteiro fica disponível", () => {
    const out = resolveDayAvailability({
      virtual: [{startTime: "09:00", endTime: "10:00"}],
      persisted: [],
      dateKey: "2026-08-06",
      now: NOW,
    });
    assert.equal(out[0]!.available, true);
  });
});

describe("spNow", () => {
  it("converte UTC para wall-clock de São Paulo (UTC-3)", () => {
    // 2026-08-05T23:30Z = 20:30 em São Paulo (sem horário de verão).
    const n = spNow(new Date(Date.UTC(2026, 7, 5, 23, 30)));
    assert.equal(n.dateKey, "2026-08-05");
    assert.equal(n.minutes, 20 * 60 + 30);
  });

  it("vira o dia corretamente perto da meia-noite SP", () => {
    // 2026-08-06T02:59Z = 23:59 de 05/08 em SP.
    const n = spNow(new Date(Date.UTC(2026, 7, 6, 2, 59)));
    assert.equal(n.dateKey, "2026-08-05");
    assert.equal(n.minutes, 23 * 60 + 59);
  });
});

describe("parsePeakRulesFromDocs", () => {
  it("aplica defaults: minDurationMinutes fora do range", () => {
    const docs = [
      {id: "r1", data: () => ({minDurationMinutes: 50})},
      {id: "r2", data: () => ({minDurationMinutes: 400})},
      {id: "r3", data: () => ({})},
    ] as unknown as Parameters<typeof parsePeakRulesFromDocs>[0];
    const parsed = parsePeakRulesFromDocs(docs);
    assert.equal(parsed[0]?.minDurationMinutes, 120);
    assert.equal(parsed[1]?.minDurationMinutes, 120);
    assert.equal(parsed[2]?.minDurationMinutes, 120);
  });

  it("releaseHoursBefore ausente/<=0 vira null", () => {
    const docs = [
      {id: "r1", data: () => ({releaseHoursBefore: undefined})},
      {id: "r2", data: () => ({releaseHoursBefore: 0})},
      {id: "r3", data: () => ({releaseHoursBefore: -1})},
      {id: "r4", data: () => ({releaseHoursBefore: 3})},
    ] as unknown as Parameters<typeof parsePeakRulesFromDocs>[0];
    const parsed = parsePeakRulesFromDocs(docs);
    assert.equal(parsed[0]?.releaseHoursBefore, null);
    assert.equal(parsed[1]?.releaseHoursBefore, null);
    assert.equal(parsed[2]?.releaseHoursBefore, null);
    assert.equal(parsed[3]?.releaseHoursBefore, 3);
  });

  it("courtIds/weekdays não-array vira []", () => {
    const docs = [
      {id: "r1", data: () => ({courtIds: "q1", weekdays: 3})},
      {id: "r2", data: () => ({})},
    ] as unknown as Parameters<typeof parsePeakRulesFromDocs>[0];
    const parsed = parsePeakRulesFromDocs(docs);
    assert.deepEqual(parsed[0]?.courtIds, []);
    assert.deepEqual(parsed[0]?.weekdays, []);
    assert.deepEqual(parsed[1]?.courtIds, []);
    assert.deepEqual(parsed[1]?.weekdays, []);
  });

  it("active !== true vira false", () => {
    const docs = [
      {id: "r1", data: () => ({active: false})},
      {id: "r2", data: () => ({active: undefined})},
      {id: "r3", data: () => ({active: "true"})},
      {id: "r4", data: () => ({active: true})},
    ] as unknown as Parameters<typeof parsePeakRulesFromDocs>[0];
    const parsed = parsePeakRulesFromDocs(docs);
    assert.equal(parsed[0]?.active, false);
    assert.equal(parsed[1]?.active, false);
    assert.equal(parsed[2]?.active, false);
    assert.equal(parsed[3]?.active, true);
  });

  it("label ausente usa default 'Horário de pico'", () => {
    const docs = [
      {id: "r1", data: () => ({})},
      {id: "r2", data: () => ({label: "  Pico noturno  "})},
    ] as unknown as Parameters<typeof parsePeakRulesFromDocs>[0];
    const parsed = parsePeakRulesFromDocs(docs);
    assert.equal(parsed[0]?.label, "Horário de pico");
    assert.equal(parsed[1]?.label, "Pico noturno");
  });

  it("normaliza HH:mm (startTime/endTime)", () => {
    const docs = [
      {id: "r1", data: () => ({startTime: "20:00", endTime: "21:15"})},
      {id: "r2", data: () => ({startTime: "20", endTime: "21"})},
      {id: "r3", data: () => ({})},
    ] as unknown as Parameters<typeof parsePeakRulesFromDocs>[0];
    const parsed = parsePeakRulesFromDocs(docs);
    assert.equal(parsed[0]?.startTime, "20:00");
    assert.equal(parsed[0]?.endTime, "21:15");
    assert.equal(parsed[1]?.startTime, "20");
    assert.equal(parsed[1]?.endTime, "21");
    assert.equal(parsed[2]?.startTime, "00:00");
    assert.equal(parsed[2]?.endTime, "00:00");
  });
});

describe("ensurePeakRuleSatisfied", () => {
  it("sem regra ativa: resolves sem chamar db", async () => {
    const dbThrows = {
      collection: () => {
        throw new Error("db.collection should not be called");
      },
    } as unknown as Parameters<typeof ensurePeakRuleSatisfied>[0]["db"];
    await ensurePeakRuleSatisfied({
      db: dbThrows,
      arenaId: "a1",
      courtId: "q1",
      dateKey: "2030-01-05",
      peakRules: [],
      courtData: undefined,
      arenaFallback: null,
      selectionStartTimes: ["20:00"],
    });
  });

  it("violação lança HttpsError com mensagem exata", async () => {
    const docs = [] as Parameters<typeof parsePeakRulesFromDocs>[0];
    const db = {
      collection: () => ({
        where: () => ({
          get: async () => ({docs}),
        }),
      }),
    } as unknown as Parameters<typeof ensurePeakRuleSatisfied>[0]["db"];
    await assert.rejects(
      () => ensurePeakRuleSatisfied({
        db,
        arenaId: "a1",
        courtId: "q1",
        dateKey: "2030-01-05",
        peakRules: [rule({minDurationMinutes: 120})],
        courtData: {basePricePerHourReais: 100},
        arenaFallback: null,
        selectionStartTimes: ["20:00"],
      }),
      (err: Error) => {
        assert.equal(err.message, "Este horário exige reserva mínima de 2h. Inclua uma hora vizinha para confirmar.");
        return true;
      },
    );
  });

  it("seleção cumprindo mínimo: resolves", async () => {
    const docs = [] as Parameters<typeof parsePeakRulesFromDocs>[0];
    const db = {
      collection: () => ({
        where: () => ({
          get: async () => ({docs}),
        }),
      }),
    } as unknown as Parameters<typeof ensurePeakRuleSatisfied>[0]["db"];
    await ensurePeakRuleSatisfied({
      db,
      arenaId: "a1",
      courtId: "q1",
      dateKey: "2030-01-05",
      peakRules: [rule({minDurationMinutes: 120})],
      courtData: {basePricePerHourReais: 100},
      arenaFallback: null,
      selectionStartTimes: ["20:00", "21:00"],
    });
  });

  it("vizinhas bloqueadas: avulso resolves", async () => {
    const docs = [
      {
        data: () => ({
          arenaId: "a1",
          courtId: "q1",
          dateKey: "2030-01-05",
          startTime: "19:00",
          endTime: "20:00",
          status: "booked",
        }),
      },
      {
        data: () => ({
          arenaId: "a1",
          courtId: "q1",
          dateKey: "2030-01-05",
          startTime: "21:00",
          endTime: "22:00",
          status: "booked",
        }),
      },
    ] as unknown as Parameters<typeof parsePeakRulesFromDocs>[0];
    const db = {
      collection: () => ({
        where: () => ({
          get: async () => ({docs}),
        }),
      }),
    } as unknown as Parameters<typeof ensurePeakRuleSatisfied>[0]["db"];
    await ensurePeakRuleSatisfied({
      db,
      arenaId: "a1",
      courtId: "q1",
      dateKey: "2030-01-05",
      peakRules: [rule({minDurationMinutes: 120})],
      courtData: {basePricePerHourReais: 100},
      arenaFallback: null,
      selectionStartTimes: ["20:00"],
    });
  });
});
