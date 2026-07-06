import assert from "node:assert/strict";
import {test} from "node:test";

import {playerInviteEventId} from "./player-invite-gamification";

test("playerInviteEventId is stable per invite", () => {
  assert.equal(playerInviteEventId(" invite-1 "), "invite_invite-1");
});
