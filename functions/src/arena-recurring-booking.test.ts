import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  addDaysToDateKey,
  calendarHoursSpanning,
  isValidDateKey,
  isoWeekdayOfDateKey,
  occurrenceBookingId,
  occurrenceDatesBetween,
  toMinutes,
  ESSENCIAL_MAX_ACTIVE_RECURRING,
  RECURRING_HORIZON_DAYS,
} from "./arena-recurring-booking";

describe("arena-recurring-booking helpers", () => {
  it("isoWeekdayOfDateKey segue ISO (1=segunda … 7=domingo)", () => {
    assert.equal(isoWeekdayOfDateKey("2026-07-06"), 1); // segunda
    assert.equal(isoWeekdayOfDateKey("2026-07-08"), 3); // quarta
    assert.equal(isoWeekdayOfDateKey("2026-07-11"), 6); // sábado
    assert.equal(isoWeekdayOfDateKey("2026-07-12"), 7); // domingo
  });

  it("addDaysToDateKey atravessa mês e ano", () => {
    assert.equal(addDaysToDateKey("2026-07-30", 3), "2026-08-02");
    assert.equal(addDaysToDateKey("2026-12-30", 5), "2027-01-04");
    assert.equal(addDaysToDateKey("2026-07-02", -1), "2026-07-01");
  });

  it("isValidDateKey valida formato e data", () => {
    assert.equal(isValidDateKey("2026-07-02"), true);
    assert.equal(isValidDateKey("2026-7-2"), false);
    assert.equal(isValidDateKey("02/07/2026"), false);
    assert.equal(isValidDateKey(""), false);
  });

  it("occurrenceBookingId é determinístico (idempotência do scheduler)", () => {
    assert.equal(
      occurrenceBookingId("abc123", "2026-07-09"),
      "rec_abc123_2026-07-09",
    );
    assert.equal(
      occurrenceBookingId("abc123", "2026-07-09"),
      occurrenceBookingId("abc123", "2026-07-09"),
    );
  });

  it("toMinutes / calendarHoursSpanning espelham o fluxo de reserva avulsa", () => {
    assert.equal(toMinutes("18:00"), 1080);
    assert.deepEqual(calendarHoursSpanning(1080, 1140), [18]);
    assert.deepEqual(calendarHoursSpanning(1080, 1200), [18, 19]);
    assert.deepEqual(calendarHoursSpanning(1110, 1200), [18, 19]); // 18:30–20:00
    assert.deepEqual(calendarHoursSpanning(1080, 1080), []);
  });
});

describe("occurrenceDatesBetween", () => {
  // Série: toda quinta-feira (weekday 4).
  const base = {
    weekday: 4,
    startDate: "2026-07-02", // quinta
    endDate: null as string | null,
    skippedDates: [] as string[],
  };

  it("gera as quintas dentro do horizonte", () => {
    const dates = occurrenceDatesBetween(base, "2026-07-01", "2026-07-31");
    assert.deepEqual(dates, [
      "2026-07-02",
      "2026-07-09",
      "2026-07-16",
      "2026-07-23",
      "2026-07-30",
    ]);
  });

  it("respeita startDate posterior ao fromExclusive", () => {
    const dates = occurrenceDatesBetween(
      {...base, startDate: "2026-07-10"},
      "2026-07-01",
      "2026-07-31",
    );
    assert.deepEqual(dates, ["2026-07-16", "2026-07-23", "2026-07-30"]);
  });

  it("fromExclusive é exclusivo (não rematerializa a borda)", () => {
    const dates = occurrenceDatesBetween(base, "2026-07-09", "2026-07-31");
    assert.deepEqual(dates, ["2026-07-16", "2026-07-23", "2026-07-30"]);
  });

  it("respeita endDate", () => {
    const dates = occurrenceDatesBetween(
      {...base, endDate: "2026-07-16"},
      "2026-07-01",
      "2026-07-31",
    );
    assert.deepEqual(dates, ["2026-07-02", "2026-07-09", "2026-07-16"]);
  });

  it("pula skippedDates (conflito ou cancelamento pontual)", () => {
    const dates = occurrenceDatesBetween(
      {...base, skippedDates: ["2026-07-09", "2026-07-23"]},
      "2026-07-01",
      "2026-07-31",
    );
    assert.deepEqual(dates, ["2026-07-02", "2026-07-16", "2026-07-30"]);
  });

  it("retorna vazio quando endDate < startDate efetivo", () => {
    const dates = occurrenceDatesBetween(
      {...base, endDate: "2026-06-30"},
      "2026-07-01",
      "2026-07-31",
    );
    assert.deepEqual(dates, []);
  });

  it("rodar duas vezes com o mesmo intervalo devolve as mesmas datas", () => {
    const a = occurrenceDatesBetween(base, "2026-07-01", "2026-07-31");
    const b = occurrenceDatesBetween(base, "2026-07-01", "2026-07-31");
    assert.deepEqual(a, b);
  });
});

describe("constantes de produto", () => {
  it("horizonte de materialização cobre a janela visível do atleta (21d)", () => {
    assert.ok(RECURRING_HORIZON_DAYS > 21);
  });

  it("limite Essencial é 3 séries ativas", () => {
    assert.equal(ESSENCIAL_MAX_ACTIVE_RECURRING, 3);
  });
});
