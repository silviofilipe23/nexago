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

  // Mesmo comparador usado em autoScheduleTournamentDay: matchNumber é a
  // numeração GLOBAL cronológica. Em dupla eliminação, WB/LB/3º lugar/final
  // reiniciam `round` cada um na sua chave, então ordenar por round antes do
  // matchNumber agendava a final antes da WB/LB R2 (conflito na tabela).
  function sortByMatchSequence(matches) {
    return [...matches].sort((a, b) => (a.matchNumber ?? 0) - (b.matchNumber ?? 0));
  }

  it("sortByMatchSequence orders DE matches by matchNumber, not by per-branch round", () => {
    const matches = [
      {id: "final", round: 1, matchNumber: 7},
      {id: "third", round: 1, matchNumber: 6},
      {id: "wbFinal", round: 2, matchNumber: 4},
      {id: "lb1", round: 1, matchNumber: 3},
      {id: "wb1", round: 1, matchNumber: 1},
    ];
    const sorted = sortByMatchSequence(matches).map((m) => m.id);
    assert.deepEqual(sorted, ["wb1", "lb1", "wbFinal", "third", "final"]);
  });
});
