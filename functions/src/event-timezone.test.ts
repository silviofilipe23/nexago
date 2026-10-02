import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {dayKeyFromStoredEventDate, eventTimeLabel} from "./event-timezone";

describe("eventTimeLabel", () => {
  it("formata HH:mm na parede de São Paulo, não em UTC", () => {
    // 14:05 em São Paulo (UTC-3) = 17:05 UTC.
    const d = new Date("2026-08-25T17:05:00.000Z");
    assert.equal(eventTimeLabel(d), "14:05");
  });

  it("preenche hora e minuto com zero à esquerda", () => {
    const d = new Date("2026-08-25T12:03:00.000Z"); // 09:03 em SP
    assert.equal(eventTimeLabel(d), "09:03");
  });
});

describe("dayKeyFromStoredEventDate", () => {
  it("meia-noite de Brasília (wizard num aparelho no Brasil) é o próprio dia", () => {
    assert.equal(dayKeyFromStoredEventDate(new Date("2026-10-23T03:00:00.000Z")), "2026-10-23");
  });

  it("meia-noite UTC exata vale pela data UTC, não pelo dia anterior em São Paulo", () => {
    assert.equal(dayKeyFromStoredEventDate(new Date("2026-10-23T00:00:00.000Z")), "2026-10-23");
  });

  it("horário de verdade cai no calendário de São Paulo", () => {
    // 22:30 de 23/10 em São Paulo = 01:30 UTC de 24/10.
    assert.equal(dayKeyFromStoredEventDate(new Date("2026-10-24T01:30:00.000Z")), "2026-10-23");
  });
});
