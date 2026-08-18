import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  MatchStatus,
  isMatchCompleted,
  isMatchInProgress,
  isMatchScheduled,
  isWinnerInMatch,
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

describe("isWinnerInMatch", () => {
  it("accepts the winner on either side", () => {
    assert.equal(isWinnerInMatch("tA", "tA", "tB"), true);
    assert.equal(isWinnerInMatch("tB", "tA", "tB"), true);
  });

  it("rejects an id that is on neither side", () => {
    // Incidente 18/08 (Copa Goiás): winnerId gravado com o id do TORNEIO.
    assert.equal(isWinnerInMatch("tournament-1", "tA", "tB"), false);
  });

  it("rejects an empty or missing winner", () => {
    assert.equal(isWinnerInMatch("", "tA", "tB"), false);
    assert.equal(isWinnerInMatch("   ", "tA", "tB"), false);
    assert.equal(isWinnerInMatch(undefined, "tA", "tB"), false);
    assert.equal(isWinnerInMatch(null, "tA", "tB"), false);
  });

  it("never matches an empty side (bye/TBD)", () => {
    assert.equal(isWinnerInMatch("", "", "tB"), false);
    assert.equal(isWinnerInMatch("tB", "", "tB"), true);
    assert.equal(isWinnerInMatch("tA", "tA", ""), true);
  });

  it("ignores surrounding whitespace", () => {
    assert.equal(isWinnerInMatch(" tA ", "tA", "tB"), true);
    assert.equal(isWinnerInMatch("tB", "tA", " tB "), true);
  });
});
