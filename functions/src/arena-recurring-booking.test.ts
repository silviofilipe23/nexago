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
  validateRecurringInput,
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

describe("validateRecurringInput", () => {
  const todayKey = "2026-07-28";
  const validBase = {
    arenaId: "arena1",
    courtId: "court1",
    weekday: 2,
    startTime: "19:00",
    endTime: "20:00",
    amountReais: 100,
    customerName: "João Silva",
  };

  it("normaliza um payload válido, com paymentType default per_occurrence", () => {
    const result = validateRecurringInput(validBase, todayKey);
    assert.deepEqual(result, {
      arenaId: "arena1",
      courtId: "court1",
      weekday: 2,
      startTime: "19:00",
      endTime: "20:00",
      athleteId: null,
      customerName: "João Silva",
      amountReais: 100,
      startDate: todayKey,
      endDate: null,
      paymentType: "per_occurrence",
    });
  });

  it("aceita paymentType monthly explícito", () => {
    const result = validateRecurringInput({...validBase, paymentType: "monthly"}, todayKey);
    assert.equal(result.paymentType, "monthly");
  });

  it("qualquer paymentType desconhecido cai pra per_occurrence", () => {
    const result = validateRecurringInput({...validBase, paymentType: "lixo"}, todayKey);
    assert.equal(result.paymentType, "per_occurrence");
  });

  it("rejeita arena ou quadra ausentes", () => {
    assert.throws(() => validateRecurringInput({...validBase, arenaId: ""}, todayKey), /Arena e quadra/);
    assert.throws(() => validateRecurringInput({...validBase, courtId: ""}, todayKey), /Arena e quadra/);
  });

  it("rejeita dia da semana fora de 1-7", () => {
    assert.throws(() => validateRecurringInput({...validBase, weekday: 0}, todayKey), /Dia da semana inválido/);
    assert.throws(() => validateRecurringInput({...validBase, weekday: 8}, todayKey), /Dia da semana inválido/);
  });

  it("rejeita horário fora do formato HH:mm ou fim <= início", () => {
    assert.throws(() => validateRecurringInput({...validBase, startTime: "19h"}, todayKey), /Horário inválido/);
    assert.throws(() => validateRecurringInput({...validBase, startTime: "20:00", endTime: "19:00"}, todayKey), /Intervalo de horário inválido/);
  });

  it("rejeita valor por ocorrência <= 0", () => {
    assert.throws(() => validateRecurringInput({...validBase, amountReais: 0}, todayKey), /valor por ocorrência/);
  });

  it("rejeita data de início inválida ou no passado por padrão", () => {
    assert.throws(() => validateRecurringInput({...validBase, startDate: "31/07/2026"}, todayKey), /Data de início inválida/);
    assert.throws(() => validateRecurringInput({...validBase, startDate: "2026-07-01"}, todayKey), /Data de início inválida/);
  });

  it("com allowPastStartDate:true, aceita data de início no passado (edição de série já iniciada)", () => {
    const result = validateRecurringInput({...validBase, startDate: "2026-06-01"}, todayKey, {allowPastStartDate: true});
    assert.equal(result.startDate, "2026-06-01");
  });

  it("rejeita data de término antes da data de início", () => {
    assert.throws(
      () => validateRecurringInput({...validBase, startDate: "2026-08-01", endDate: "2026-07-30"}, todayKey),
      /Data de término inválida/,
    );
  });

  it("exige atleta vinculado ou nome do mensalista", () => {
    assert.throws(
      () => validateRecurringInput({...validBase, customerName: undefined}, todayKey),
      /Vincule um atleta ou informe o nome/,
    );
  });

  it("aceita athleteId no lugar de customerName", () => {
    const result = validateRecurringInput({...validBase, customerName: undefined, athleteId: "ath1"}, todayKey);
    assert.equal(result.athleteId, "ath1");
    assert.equal(result.customerName, null);
  });

  it("rejeita nome do mensalista com mais de 80 caracteres", () => {
    assert.throws(
      () => validateRecurringInput({...validBase, customerName: "x".repeat(81)}, todayKey),
      /Nome do mensalista muito longo/,
    );
  });
});
