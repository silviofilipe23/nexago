import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {computeOpenSlots, parseAvailability, windowDays} from "./professor-availability";

// 2026-10-20 é terça (ISO 2). 15:00Z = 12:00 em São Paulo.
const NOW = new Date("2026-10-20T15:00:00Z").getTime();
const sp = (day: string, h: number) => new Date(`${day}T${String(h).padStart(2, "0")}:00:00-03:00`).getTime();
const starts = (slots: Array<{start: number}>) => slots.map((s) => new Date(s.start).toISOString());

describe("disponibilidade", () => {
  it("valida a grade e completa as regras com o padrão", () => {
    const a = parseAvailability({weekly: {"2": [18, 9, 9]}});
    assert.deepEqual(a.weekly["2"], [9, 18]);
    assert.deepEqual(a.weekly["1"], []);
    assert.equal(a.durationMin, 60);
    assert.equal(a.minNoticeHours, 4);
    assert.equal(a.autoConfirm, true);
    assert.throws(() => parseAvailability({weekly: {"1": [5]}}), /Horas de 6h/);
    assert.throws(() => parseAvailability({durationMin: 45}), /Duração/);
  });

  it("janela de dias no calendário de São Paulo", () => {
    assert.deepEqual(windowDays(new Date("2026-10-21T02:00:00Z"), 2), ["2026-10-20", "2026-10-21"]);
  });

  it("respeita antecedência, ocupações e a duração que cobre mais de uma hora", () => {
    const a = parseAvailability({weekly: {"2": [9, 13, 15, 16, 17, 19], "3": [9, 10]}, minNoticeHours: 2});
    const busy = [{start: sp("2026-10-20", 17), end: sp("2026-10-20", 18)}];
    const slots = computeOpenSlots(a, ["2026-10-20", "2026-10-21"], busy, NOW);
    // 9h e 13h antes de 12h+2h; 17h ocupado.
    assert.deepEqual(starts(slots), [
      "2026-10-20T18:00:00.000Z", "2026-10-20T19:00:00.000Z", "2026-10-20T22:00:00.000Z",
      "2026-10-21T12:00:00.000Z", "2026-10-21T13:00:00.000Z",
    ]);
    const long = computeOpenSlots({...a, durationMin: 90}, ["2026-10-21"], [], NOW);
    assert.deepEqual(starts(long), ["2026-10-21T12:00:00.000Z"], "90 min às 9h exige 10h aberta; às 10h falta 11h");
  });
});
