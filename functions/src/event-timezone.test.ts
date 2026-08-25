import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {eventTimeLabel} from "./event-timezone";

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
