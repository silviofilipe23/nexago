import assert from "node:assert";
import {describe, it} from "node:test";
import {
  BOOKING_REMINDER_15M_MINUTES_BEFORE,
  buildBooking15mReminderBody,
  collectConfirmedAthleteIdsFromBookingData,
} from "./arena-booking-reminder-15m";

describe("collectConfirmedAthleteIdsFromBookingData", () => {
  it("includes owner and guest", () => {
    const ids = collectConfirmedAthleteIdsFromBookingData({
      bookingAthleteId: "owner1",
      guestAthleteId: "guest1",
    });
    assert.deepEqual(new Set(ids), new Set(["owner1", "guest1"]));
  });

  it("deduplicates when owner appears twice", () => {
    const ids = collectConfirmedAthleteIdsFromBookingData({
      athleteId: "same",
      bookingAthleteId: "same",
      guestAthleteId: "same",
    });
    assert.equal(ids.length, 1);
    assert.equal(ids[0], "same");
  });

  it("reads confirmedAthletes array", () => {
    const ids = collectConfirmedAthleteIdsFromBookingData({
      bookingAthleteId: "owner",
      confirmedAthletes: [
        {userId: "a"},
        {athleteId: "b"},
      ],
    });
    assert.deepEqual(new Set(ids), new Set(["owner", "a", "b"]));
  });

  it("reads string uid in participants array", () => {
    const ids = collectConfirmedAthleteIdsFromBookingData({
      athleteId: "owner",
      participants: ["player2"],
    });
    assert.deepEqual(new Set(ids), new Set(["owner", "player2"]));
  });
});

describe("buildBooking15mReminderBody", () => {
  it("formats arena court and time", () => {
    const body = buildBooking15mReminderBody({
      arenaName: "Arena CFC",
      courtName: "Quadra 2",
      date: "2026-05-26",
      startTime: "17:00",
    });
    assert.ok(body.includes("Arena CFC"));
    assert.ok(body.includes("Quadra 2"));
    assert.ok(body.includes("17:00"));
  });
});

describe("constants", () => {
  it("reminder is 15 minutes before", () => {
    assert.equal(BOOKING_REMINDER_15M_MINUTES_BEFORE, 15);
  });
});
