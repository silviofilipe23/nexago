import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  MatchStatus,
  isMatchCompleted,
  isMatchInProgress,
  isMatchScheduled,
  normalizeMatchStatusKey,
} from "./match-status";

describe("match-status", () => {
  it("exports canonical PascalCase values", () => {
    assert.equal(MatchStatus.scheduled, "Scheduled");
    assert.equal(MatchStatus.inProgress, "In Progress");
    assert.equal(MatchStatus.completed, "Completed");
  });

  it("normalizes legacy snake_case", () => {
    assert.equal(normalizeMatchStatusKey("in_progress"), "in progress");
    assert.equal(normalizeMatchStatusKey("Completed"), "completed");
  });

  it("detects completed across formats", () => {
    assert.equal(isMatchCompleted("Completed"), true);
    assert.equal(isMatchCompleted("completed"), true);
    assert.equal(isMatchCompleted("Scheduled"), false);
  });

  it("detects in progress across formats", () => {
    assert.equal(isMatchInProgress("In Progress"), true);
    assert.equal(isMatchInProgress("in_progress"), true);
    assert.equal(isMatchScheduled("scheduled"), true);
    assert.equal(isMatchScheduled("Scheduled"), true);
  });
});
