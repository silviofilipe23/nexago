import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {groupEntriesByTournament, type RawInscriptionRow} from "./coach-tournament-overview";

describe("groupEntriesByTournament", () => {
  it("groups multiple athletes' entries under the same tournament", () => {
    const rows: RawInscriptionRow[] = [
      {athleteUid: "a1", registrationId: "r1", tournamentId: "t1", categoryId: "open", isPaid: true, partnerPending: false},
      {athleteUid: "a2", registrationId: "r2", tournamentId: "t1", categoryId: "open", isPaid: false, partnerPending: true},
      {athleteUid: "a1", registrationId: "r3", tournamentId: "t2", categoryId: "inter", isPaid: true, partnerPending: false},
    ];
    const grouped = groupEntriesByTournament(rows);
    assert.equal(grouped.get("t1")?.length, 2);
    assert.equal(grouped.get("t2")?.length, 1);
    assert.equal(grouped.get("t1")?.[1].partnerPending, true);
  });

  it("returns an empty map for no rows", () => {
    assert.equal(groupEntriesByTournament([]).size, 0);
  });
});
