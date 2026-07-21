import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {withAthleteRole} from "./athlete-signup";

describe("withAthleteRole", () => {
  it("adds athlete when the user has no roles yet", () => {
    assert.deepEqual(withAthleteRole([]), ["athlete"]);
  });

  it("adds athlete alongside an existing role", () => {
    assert.deepEqual(withAthleteRole(["arena"]), ["arena", "athlete"]);
  });

  it("is a no-op when athlete is already present", () => {
    assert.deepEqual(withAthleteRole(["athlete"]), ["athlete"]);
  });

  it("never drops existing roles", () => {
    assert.deepEqual(withAthleteRole(["arena", "organizer"]), ["arena", "organizer", "athlete"]);
  });
});
