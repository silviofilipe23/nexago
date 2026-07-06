import assert from "node:assert/strict";
import {test} from "node:test";

import {arenaReviewEventId} from "./arena-review-gamification";

test("arenaReviewEventId is stable per review", () => {
  assert.equal(arenaReviewEventId(" review-1 "), "arena_review_review-1");
});
