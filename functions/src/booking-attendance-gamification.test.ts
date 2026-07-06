import assert from "node:assert/strict";
import {test} from "node:test";

import {
  attendanceConfirmedEventId,
  bookingCheckInEventId,
  nextAttendanceStreak,
} from "./booking-attendance-gamification";

test("event ids are stable per booking", () => {
  assert.equal(attendanceConfirmedEventId(" b-1 "), "attendance_confirmed_b-1");
  assert.equal(bookingCheckInEventId(" b-1 "), "checkin_b-1");
});

test("nextAttendanceStreak starts at 1 with no prior confirmation", () => {
  assert.equal(nextAttendanceStreak(0, null, new Date(2026, 6, 6)), 1);
});

test("nextAttendanceStreak increments within a 1-day gap", () => {
  const last = new Date(2026, 6, 5);
  const now = new Date(2026, 6, 6);
  assert.equal(nextAttendanceStreak(3, last, now), 4);
});

test("nextAttendanceStreak resets after a gap bigger than 1 day", () => {
  const last = new Date(2026, 6, 1);
  const now = new Date(2026, 6, 6);
  assert.equal(nextAttendanceStreak(3, last, now), 1);
});
