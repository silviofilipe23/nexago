import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {withCoachRole} from "./coach-signup";

describe("withCoachRole", () => {
  it("adds coach when the user has no roles yet", () => {
    assert.deepEqual(withCoachRole([]), ["coach"]);
  });

  it("adds coach alongside an existing role", () => {
    assert.deepEqual(withCoachRole(["athlete"]), ["athlete", "coach"]);
  });

  it("is a no-op when coach is already present", () => {
    assert.deepEqual(withCoachRole(["coach"]), ["coach"]);
  });

  it("never drops existing roles", () => {
    assert.deepEqual(withCoachRole(["athlete", "arena"]), ["athlete", "arena", "coach"]);
  });
});
