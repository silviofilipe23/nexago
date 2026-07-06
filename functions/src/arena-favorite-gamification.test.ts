import assert from "node:assert/strict";
import {test} from "node:test";

import {favoriteArenaEventId} from "./arena-favorite-gamification";

test("favoriteArenaEventId is stable per arena", () => {
  assert.equal(favoriteArenaEventId("arena-1"), "favorite_arena_arena-1");
});
