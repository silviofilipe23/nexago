import {describe, it} from "node:test";
import assert from "node:assert/strict";

const EVENT_TIME_ZONE = "America/Sao_Paulo";

function dayKeyFromEventDate(d) {
  return d.toLocaleDateString("en-CA", {timeZone: EVENT_TIME_ZONE});
}

function eventDateFromDayKeyAndTime(dayKey, hour, minute) {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`${dayKey}T${hh}:${mm}:00-03:00`);
}

function detectCourtOverlap(
  courtId,
  scheduleStart,
  scheduleEnd,
  matches,
  excludeMatchId,
) {
  for (const m of matches) {
    if (m.id === excludeMatchId) continue;
    if (m.courtId !== courtId) continue;
    if (scheduleStart < m.end && scheduleEnd > m.start) return true;
  }
  return false;
}

describe("organizer-match-ops", () => {
  it("dayKeyFromEventDate formats YYYY-MM-DD in São Paulo", () => {
    const key = dayKeyFromEventDate(new Date("2026-06-14T10:00:00Z"));
    assert.equal(key, "2026-06-14");
  });

  it("dayKeyFromEventDate uses SP calendar for late UTC instant", () => {
    const key = dayKeyFromEventDate(new Date("2026-06-15T02:30:00Z"));
    assert.equal(key, "2026-06-14");
  });

  it("eventDateFromDayKeyAndTime builds SP wall clock as UTC", () => {
    const start = eventDateFromDayKeyAndTime("2026-06-14", 8, 0);
    assert.equal(start.toISOString(), "2026-06-14T11:00:00.000Z");
  });

  it("detectCourtOverlap finds conflict", () => {
    const start = new Date("2026-06-14T10:00:00");
    const end = new Date("2026-06-14T11:00:00");
    const overlap = detectCourtOverlap(
      "Q1",
      new Date("2026-06-14T10:30:00"),
      new Date("2026-06-14T11:30:00"),
      [{id: "m1", courtId: "Q1", start, end}],
      "",
    );
    assert.equal(overlap, true);
  });

  it("detectCourtOverlap ignores different court", () => {
    const start = new Date("2026-06-14T10:00:00");
    const end = new Date("2026-06-14T11:00:00");
    const overlap = detectCourtOverlap(
      "Q2",
      new Date("2026-06-14T10:30:00"),
      new Date("2026-06-14T11:30:00"),
      [{id: "m1", courtId: "Q1", start, end}],
      "",
    );
    assert.equal(overlap, false);
  });
});
