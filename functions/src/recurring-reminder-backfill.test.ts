import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {missingRecurringReminder15mAt} from "./recurring-reminder-backfill";

const NOW = new Date("2026-11-17T12:00:00-03:00");

function occurrence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recurringBookingId: "serie-1",
    isRecurring: true,
    status: "active",
    date: "2026-11-24",
    startTime: "19:00",
    ...overrides,
  };
}

describe("missingRecurringReminder15mAt — ocorrências que a edição deixou sem lembrete", () => {
  it("ocorrência futura sem reminder15mAt: 15 min antes do início (Brasília)", () => {
    const at = missingRecurringReminder15mAt(occurrence(), NOW);
    assert.equal(at?.getTime(), new Date("2026-11-24T18:45:00-03:00").getTime());
  });

  it("confirmed também vale", () => {
    assert.ok(missingRecurringReminder15mAt(occurrence({status: "confirmed"}), NOW));
  });

  it("já tem reminder15mAt: não mexe", () => {
    const data = occurrence({reminder15mAt: Timestamp.fromDate(new Date("2026-11-24T18:45:00-03:00"))});
    assert.equal(missingRecurringReminder15mAt(data, NOW), null);
  });

  it("reserva avulsa (sem série) fica de fora: o gatilho de criação cuida dela", () => {
    assert.equal(missingRecurringReminder15mAt(occurrence({recurringBookingId: null, isRecurring: false}), NOW), null);
  });

  it("cancelada fica de fora", () => {
    assert.equal(missingRecurringReminder15mAt(occurrence({status: "cancelled"}), NOW), null);
  });

  it("hora do lembrete já passou: não agenda lembrete atrasado", () => {
    const soon = occurrence({date: "2026-11-17", startTime: "12:10"});
    assert.equal(missingRecurringReminder15mAt(soon, NOW), null);
  });

  it("data ou horário inválidos ficam de fora", () => {
    assert.equal(missingRecurringReminder15mAt(occurrence({date: "24/11"}), NOW), null);
    assert.equal(missingRecurringReminder15mAt(occurrence({startTime: ""}), NOW), null);
  });
});
