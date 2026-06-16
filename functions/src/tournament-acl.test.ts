import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {assertCanManageTournament} from "./tournament-acl";

describe("assertCanManageTournament", () => {
  it("allows tournament owner without staff lookup", async () => {
    const db = {
      doc: () => ({
        get: async () => ({
          exists: true,
          data: () => ({managerId: "owner-1", name: "Copa"}),
        }),
      }),
    };

    const data = await assertCanManageTournament(
      db as never,
      "owner-1",
      "t1",
    );
    assert.equal(data.name, "Copa");
  });

  it("throws not-found when tournament is missing", async () => {
    const db = {
      doc: () => ({
        get: async () => ({exists: false}),
      }),
    };

    await assert.rejects(
      async () => {
        await assertCanManageTournament(db as never, "owner-1", "missing");
      },
      (err: {code?: string}) => {
        assert.equal(err.code, "not-found");
        return true;
      },
    );
  });
});
