import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {withArenaRole} from "./arena-signup";

describe("withArenaRole", () => {
  it("adds arena when the user has no roles yet", () => {
    assert.deepEqual(withArenaRole([]), ["arena"]);
  });

  it("adds arena alongside an existing role", () => {
    assert.deepEqual(withArenaRole(["athlete"]), ["athlete", "arena"]);
  });

  it("is a no-op when arena is already present", () => {
    assert.deepEqual(withArenaRole(["arena"]), ["arena"]);
  });

  it("never drops existing roles", () => {
    assert.deepEqual(withArenaRole(["athlete", "coach"]), ["athlete", "coach", "arena"]);
  });
});
