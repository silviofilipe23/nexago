import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {withOrganizerRole} from "./organizer-signup";

describe("withOrganizerRole", () => {
  it("adds organizer when the user has no roles yet", () => {
    assert.deepEqual(withOrganizerRole([]), ["organizer"]);
  });

  it("adds organizer alongside an existing role", () => {
    assert.deepEqual(withOrganizerRole(["athlete"]), ["athlete", "organizer"]);
  });

  it("is a no-op when organizer is already present", () => {
    assert.deepEqual(withOrganizerRole(["organizer"]), ["organizer"]);
  });

  it("never drops existing roles", () => {
    assert.deepEqual(withOrganizerRole(["athlete", "arena"]), ["athlete", "arena", "organizer"]);
  });
});
