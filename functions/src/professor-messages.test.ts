import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {parseMessagingPrefs, withinServiceHours} from "./professor-messages";

// 2026-10-20 é terça. 15:00Z = 12:00 em São Paulo.
const at = (iso: string) => new Date(iso);

describe("horário de atendimento", () => {
  const prefs = parseMessagingPrefs({quietEnabled: true, from: "06:00", to: "21:30", days: [1, 2, 3, 4, 5, 6]})!;
  it("dentro e fora da janela, no fuso de São Paulo", () => {
    assert.equal(withinServiceHours(prefs, at("2026-10-20T15:00:00Z")), true);
    assert.equal(withinServiceHours(prefs, at("2026-10-21T01:00:00Z")), false, "22:00 de terça");
    assert.equal(withinServiceHours(prefs, at("2026-10-20T08:30:00Z")), false, "05:30 de terça");
  });
  it("domingo fora dos dias de atendimento", () => {
    assert.equal(withinServiceHours(prefs, at("2026-10-25T15:00:00Z")), false);
  });
  it("janela que vira a noite", () => {
    const night = parseMessagingPrefs({from: "18:00", to: "02:00", days: [1, 2, 3, 4, 5, 6, 7]})!;
    assert.equal(withinServiceHours(night, at("2026-10-21T02:00:00Z")), true, "23:00");
    assert.equal(withinServiceHours(night, at("2026-10-20T15:00:00Z")), false, "12:00");
  });
  it("sem prefs = null", () => {
    assert.equal(parseMessagingPrefs(undefined), null);
  });
});
