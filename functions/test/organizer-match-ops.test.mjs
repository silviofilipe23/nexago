import {describe, it} from "node:test";
import assert from "node:assert/strict";

function dayKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  it("dayKeyFromDate formats YYYY-MM-DD", () => {
    const key = dayKeyFromDate(new Date("2026-06-14T10:00:00"));
    assert.equal(key, "2026-06-14");
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
