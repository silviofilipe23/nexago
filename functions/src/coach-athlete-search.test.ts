import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {initialsFromName} from "./coach-athlete-search";

describe("initialsFromName", () => {
  it("takes first and last name initials", () => {
    assert.equal(initialsFromName("Ana Beatriz"), "AB");
  });

  it("uses a single initial for a one-word name", () => {
    assert.equal(initialsFromName("Madonna"), "M");
  });

  it("falls back to a middle dot for an empty name", () => {
    assert.equal(initialsFromName("   "), "·");
  });
});
