import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {
  assertTournamentAcceptsRegistration,
  requiresFormedPair,
  resolveCategoryEntryFee,
} from "./tournament-registration-guards";

/** [inscriptions] são os docs que a categoria já ocupa (id + campos). */
function mockDb(
  tournament: Record<string, unknown> | null,
  inscriptions: Array<{id: string; data: Record<string, unknown>}> = [],
) {
  const queryStub = {
    where: () => queryStub,
    get: async () => ({
      docs: inscriptions.map((doc) => ({id: doc.id, data: () => doc.data})),
    }),
  };
  return {
    doc: (path: string) => ({
      get: async () => ({
        exists: tournament != null && path.startsWith("tournaments/"),
        data: () => tournament,
      }),
    }),
    collection: () => queryStub,
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

  // `allowClosedRegistration` é o atalho do organizador (organizerCreateTeamRegistration):
  // só as travas de calendário/vitrine saem do caminho.
  it("allowClosedRegistration passa por prazo, vitrine e categoria fechados", async () => {
    const db = mockDb({
      listingStatus: "closed",
      registrationClosesAt: Timestamp.fromMillis(Date.now() - 60_000),
      registrationOpensAt: Timestamp.fromMillis(Date.now() + 60_000),
      categories: [{categoryName: "cat-a", registrationClosed: true, spotsLeft: 4}],
    });
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "cat-a",
      {allowClosedRegistration: true},
    );
    assert.equal(data.listingStatus, "closed");
  });

  it("allowClosedRegistration NÃO passa por torneio cancelado", async () => {
    const db = mockDb({listingStatus: "cancelado", categories: [{categoryName: "cat-a"}]});
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
          {allowClosedRegistration: true},
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("allowClosedRegistration NÃO passa por categoria concluída", async () => {
    const db = mockDb({
      listingStatus: "open",
      categories: [{categoryName: "cat-a", isCompleted: true}],
    });
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
          {allowClosedRegistration: true},
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("allowClosedRegistration NÃO passa por categoria lotada sem fila", async () => {
    const db = mockDb(
      {
        listingStatus: "open",
        waitlistEnabled: false,
        categories: [{categoryName: "cat-a", maxTeams: 1}],
      },
      [{id: "r1", data: {categoryId: "cat-a"}}],
    );
    await assert.rejects(
      () =>
        assertTournamentAcceptsRegistration(
          db as never,
          "proj",
          "t1",
          "cat-a",
          {allowClosedRegistration: true},
        ),
      (err: Error & {code?: string}) => {
        assert.equal(err.code, "failed-precondition");
        return true;
      },
    );
  });

  it("allows category lotada when waitlist is enabled", async () => {
    const db = mockDb(
      {
        listingStatus: "open",
        waitlistEnabled: true,
        categories: [{categoryName: "cat-a", maxTeams: 2}],
      },
      [
        {id: "r1", data: {categoryId: "cat-a"}},
        {id: "r2", data: {categoryId: "cat-a"}},
      ],
    );
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

  it("matches category by id field", async () => {
    const db = mockDb({
      listingStatus: "open",
      categories: [
        {
          id: "uuid-cat-1",
          categoryName: "Sub 19 Masculino",
          spotsLeft: 4,
        },
      ],
    });
    const data = await assertTournamentAcceptsRegistration(
      db as never,
      "proj",
      "t1",
      "uuid-cat-1",
    );
    assert.equal(data.listingStatus, "open");
  });

  it("resolveCategoryEntryFee matches by category id", () => {
    const tournament = {
      categories: [
        {
          id: "uuid-cat-1",
          categoryName: "Sub 19 Masculino",
          entryFee: 120,
        },
      ],
    };
    assert.equal(resolveCategoryEntryFee(tournament, "uuid-cat-1"), 120);
    assert.equal(resolveCategoryEntryFee(tournament, "Sub 19 Masculino"), 120);
    assert.equal(resolveCategoryEntryFee(tournament, "inexistente"), 0);
  });
});

describe("requiresFormedPair", () => {
  it("is off when the tournament omits the flag", () => {
    assert.equal(requiresFormedPair({categories: []}), false);
  });

  it("is on when the tournament requires a formed pair", () => {
    assert.equal(requiresFormedPair({requireFormedPair: true}), true);
  });

  it("is off for a legacy truthy value that is not a boolean", () => {
    assert.equal(requiresFormedPair({requireFormedPair: "true"}), false);
  });
});
