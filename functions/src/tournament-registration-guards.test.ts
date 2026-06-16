import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {assertTournamentAcceptsRegistration} from "./tournament-registration-guards";

function mockDb(tournament: Record<string, unknown> | null) {
  return {
    doc: (path: string) => ({
      get: async () => ({
        exists: tournament != null && path.startsWith("tournaments/"),
        data: () => tournament,
      }),
    }),
  };
}

describe("tournament-registration-guards", () => {
  it("rejects closed listing status", async () => {
    const db = mockDb({listingStatus: "closed", categories: []});
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("rejects cancelada listing status", async () => {
    const db = mockDb({listingStatus: "cancelada", categories: []});
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("rejects category with registrationClosed", async () => {
    const db = mockDb({
      listingStatus: "open",
      categories: [
        {categoryName: "cat-a", registrationClosed: true},
      ],
    });
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("rejects after registrationClosesAt", async () => {
    const db = mockDb({
      listingStatus: "open",
      categories: [{categoryName: "cat-a"}],
      registrationClosesAt: Timestamp.fromMillis(Date.now() - 60_000),
    });
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("rejects before registrationOpensAt", async () => {
    const db = mockDb({
      listingStatus: "open",
      categories: [{categoryName: "cat-a"}],
      registrationOpensAt: Timestamp.fromMillis(Date.now() + 60_000),
    });
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("allows category lotada when waitlist is enabled", async () => {
    const db = mockDb({
      listingStatus: "open",
      waitlistEnabled: true,
      categories: [{categoryName: "cat-a", spotsLeft: 0}],
    });
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "cat-a",
    );
    assert.equal(
      (data as Record<string, unknown>).__shouldWaitlist,
      true,
    );
  });

  it("allows open tournament and category", async () => {
    const db = mockDb({
      listingStatus: "open",
      categories: [{categoryName: "cat-a", spotsLeft: 4}],
    });
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "cat-a",
    );
    assert.equal(data.listingStatus, "open");
  });
});
