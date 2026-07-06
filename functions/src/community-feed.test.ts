import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildFeedItemBase,
  extractChampionCategories,
  shouldPostTournamentCompleted,
  shouldPostTournamentOpen,
} from "./community-feed";

describe("shouldPostTournamentOpen", () => {
  it("posts when transitioning to open", () => {
    assert.equal(
      shouldPostTournamentOpen({listingStatus: "draft"}, {listingStatus: "open"}),
      true,
    );
  });

  it("posts when created already open", () => {
    assert.equal(
      shouldPostTournamentOpen(undefined, {listingStatus: "open"}),
      true,
    );
  });

  it("ignores updates that keep open", () => {
    assert.equal(
      shouldPostTournamentOpen({listingStatus: "open"}, {listingStatus: "open"}),
      false,
    );
  });

  it("ignores other statuses", () => {
    assert.equal(
      shouldPostTournamentOpen({listingStatus: "draft"}, {listingStatus: "draft"}),
      false,
    );
  });
});

describe("shouldPostTournamentCompleted", () => {
  it("posts only on transition to completed", () => {
    assert.equal(
      shouldPostTournamentCompleted(
        {listingStatus: "open"},
        {listingStatus: "completed"},
      ),
      true,
    );
    assert.equal(
      shouldPostTournamentCompleted(
        {listingStatus: "completed"},
        {listingStatus: "completed"},
      ),
      false,
    );
  });
});

describe("extractChampionCategories", () => {
  it("joins categoryOps champions with category names", () => {
    const result = extractChampionCategories({
      categories: [
        {id: "c1", categoryName: "Masculino B"},
        {id: "c2", name: "Feminino A"},
      ],
      categoryOps: {
        c1: {championTeamId: "t1", bracketStatus: "completed"},
        c2: {championTeamId: "t2"},
        c3: {bracketStatus: "in_progress"},
      },
    });

    assert.equal(result.length, 2);
    assert.deepEqual(result[0], {
      categoryId: "c2",
      categoryName: "Feminino A",
      championTeamId: "t2",
    });
    assert.deepEqual(result[1], {
      categoryId: "c1",
      categoryName: "Masculino B",
      championTeamId: "t1",
    });
  });

  it("returns empty without categoryOps", () => {
    assert.deepEqual(extractChampionCategories({}), []);
  });
});

describe("buildFeedItemBase", () => {
  it("copies denormalized tournament fields", () => {
    const base = buildFeedItemBase("t1", {
      name: " Copa Verão ",
      city: "Fortaleza",
      locationName: "Arena X",
      startAt: "s",
      endAt: "e",
    });
    assert.deepEqual(base, {
      tournamentId: "t1",
      tournamentName: "Copa Verão",
      city: "Fortaleza",
      locationName: "Arena X",
      startAt: "s",
      endAt: "e",
    });
  });

  it("defaults missing fields safely", () => {
    const base = buildFeedItemBase("t1", {});
    assert.equal(base.tournamentName, "");
    assert.equal(base.startAt, null);
  });
});
