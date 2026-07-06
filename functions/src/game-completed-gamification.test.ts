import assert from "node:assert/strict";
import {test} from "node:test";

import {completedGameEventId, isBookingEligibleForCompletion} from "./game-completed-gamification";

test("completedGameEventId is stable per booking", () => {
  assert.equal(completedGameEventId(" booking-1 "), "completed_game_booking-1");
});

test("isBookingEligibleForCompletion requires same-day booking past end+grace", () => {
  const booking = {date: "2026-07-06", startTime: "18:00", endTime: "19:00", status: "confirmed"};

  assert.equal(
    isBookingEligibleForCompletion(booking, new Date(2026, 6, 6, 19, 10)),
    true,
    "10min after end should be eligible (grace is 5min)",
  );
  assert.equal(
    isBookingEligibleForCompletion(booking, new Date(2026, 6, 6, 19, 2)),
    false,
    "before the 5min grace has elapsed",
  );
  assert.equal(
    isBookingEligibleForCompletion(booking, new Date(2026, 6, 7, 10, 0)),
    false,
    "different calendar day",
  );
});

test("isBookingEligibleForCompletion rejects canceled bookings", () => {
  const booking = {date: "2026-07-06", startTime: "18:00", endTime: "19:00", status: "canceled"};
  assert.equal(isBookingEligibleForCompletion(booking, new Date(2026, 6, 6, 20, 0)), false);
});

test("isBookingEligibleForCompletion: overnight booking is never eligible once 'now' crosses midnight", () => {
  // Porte fiel de isEligibleForPlayToday (booking_played_today.dart): a checagem de
  // "mesmo dia" compara a data bruta da reserva com `now`, não a data ajustada do fim —
  // então uma reserva 23:30->00:30 nunca fica elegível depois da virada do dia.
  const booking = {date: "2026-07-06", startTime: "23:30", endTime: "00:30", status: "confirmed"};
  assert.equal(isBookingEligibleForCompletion(booking, new Date(2026, 6, 7, 1, 0)), false);
});
