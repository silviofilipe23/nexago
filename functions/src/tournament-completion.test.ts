import {test} from "node:test";
import assert from "node:assert";
import {
  allCategoryFinalsComplete,
  isFinalMatchType,
  isTerminalListingStatus,
  type CompletionMatch,
} from "./tournament-completion";

test("isFinalMatchType matches only the grand final", () => {
  assert.equal(isFinalMatchType("Final"), true);
  assert.equal(isFinalMatchType("final"), true);
  assert.equal(isFinalMatchType("WB"), false);
  assert.equal(isFinalMatchType("Third Place"), false);
  assert.equal(isFinalMatchType("knockout"), false);
});

test("allCategoryFinalsComplete is false with no categories", () => {
  assert.equal(allCategoryFinalsComplete([], []), false);
});

test("requires every category to have a completed final", () => {
  const matches: CompletionMatch[] = [
    {categoryId: "c1", matchType: "Final", status: "completed"},
    {categoryId: "c2", matchType: "Final", status: "in_progress"},
  ];
  assert.equal(allCategoryFinalsComplete(["c1", "c2"], matches), false);
  assert.equal(allCategoryFinalsComplete(["c1"], matches), true);
});

test("completes when all finals are done", () => {
  const matches: CompletionMatch[] = [
    {categoryId: "c1", matchType: "WB", status: "completed"},
    {categoryId: "c1", matchType: "Final", status: "completed"},
    {categoryId: "c2", matchType: "Final", status: "completed"},
  ];
  assert.equal(allCategoryFinalsComplete(["c1", "c2"], matches), true);
});

test("a category without any final blocks completion", () => {
  const matches: CompletionMatch[] = [
    {categoryId: "c1", matchType: "Final", status: "completed"},
    {categoryId: "c2", matchType: "knockout", status: "completed"},
  ];
  assert.equal(allCategoryFinalsComplete(["c1", "c2"], matches), false);
});

test("isTerminalListingStatus guards completed and cancelled variants", () => {
  for (const s of ["completed", "concluido", "concluído", "cancelado", "cancelled"]) {
    assert.equal(isTerminalListingStatus(s), true);
  }
  assert.equal(isTerminalListingStatus("published"), false);
  assert.equal(isTerminalListingStatus("registration_open"), false);
});
