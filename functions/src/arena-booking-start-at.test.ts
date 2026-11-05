import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {arenaBookingStartAt} from "./arena-booking-start-at";

describe("arenaBookingStartAt", () => {
  it("19:00 de 2026-11-10 em São Paulo é 22:00Z", () => {
    assert.equal(
      arenaBookingStartAt("2026-11-10", "19:00").toISOString(),
      "2026-11-10T22:00:00.000Z",
    );
  });

  it("22:30 vira o dia seguinte em UTC", () => {
    assert.equal(
      arenaBookingStartAt("2026-11-10", "22:30").toISOString(),
      "2026-11-11T01:30:00.000Z",
    );
  });

  it("hora com um dígito (app antigo) não vira data inválida", () => {
    assert.equal(
      arenaBookingStartAt("2026-11-10", "7:00").toISOString(),
      "2026-11-10T10:00:00.000Z",
    );
  });
});
