import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {collectParticipantUids} from "./tournament-contacts";

describe("collectParticipantUids", () => {
  it("dedupes and trims uids across registrations", () => {
    const uids = collectParticipantUids([
      {participantUids: ["a", "b "]},
      {participantUids: ["b", "c"]},
      {participantUids: ["", null]},
    ]);
    assert.deepEqual(uids.sort(), ["a", "b", "c"]);
  });

  it("ignores registrations without participantUids", () => {
    assert.deepEqual(
      collectParticipantUids([{teamId: "t1"}, {participantUids: "x"}]),
      [],
    );
  });
});
