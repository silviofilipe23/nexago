import assert from "node:assert/strict";
import {test} from "node:test";

import {
  extractBookingSlotMatch,
  isBookingCanceledTransition,
  normalizeBookingStatus,
} from "./slot-vacancy-alerts";

test("normalizeBookingStatus lowercases", () => {
  assert.equal(normalizeBookingStatus("Canceled"), "canceled");
});

test("isBookingCanceledTransition detects new cancel", () => {
  assert.equal(
    isBookingCanceledTransition({status: "active"}, {status: "canceled"}),
    true
  );
  assert.equal(
    isBookingCanceledTransition({status: "canceled"}, {status: "canceled"}),
    false
  );
  assert.equal(isBookingCanceledTransition(undefined, {status: "active"}), false);
});

test("extractBookingSlotMatch parses booking fields", () => {
  const match = extractBookingSlotMatch({
    arenaId: "arena1",
    courtId: "court2",
    date: "2026-05-23",
    startTime: "10:00",
    endTime: "11:00",
    arenaName: "Arena CFC",
    athleteId: "user_a",
  });
  assert.ok(match);
  assert.equal(match?.dateKey, "2026-05-23");
  assert.equal(match?.canceledByAthleteId, "user_a");
});
