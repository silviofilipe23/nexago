import {describe, it} from "node:test";
import assert from "node:assert/strict";

function buildBracketPublishedNotificationUrl(
  tournamentId,
  categoryId,
  format,
) {
  const encodedCategory = encodeURIComponent(categoryId);
  if (format === "double_elimination") {
    return `/torneios/${tournamentId}/chave/${encodedCategory}`;
  }
  return `/torneios/${tournamentId}/chave?categoryId=${encodedCategory}`;
}

function collectBracketAthleteUidsFromTeams(teams) {
  const uids = new Set();
  for (const team of teams) {
    for (const key of ["player1Id", "player2Id"]) {
      const id = team[key];
      if (typeof id === "string" && id.trim()) uids.add(id.trim());
    }
  }
  return [...uids];
}

describe("organizer-category-ops-bracket-notify", () => {
  it("buildBracketPublishedNotificationUrl uses category path for double elimination", () => {
    const url = buildBracketPublishedNotificationUrl(
      "t1",
      "Masc A",
      "double_elimination",
    );
    assert.equal(url, "/torneios/t1/chave/Masc%20A");
  });

  it("buildBracketPublishedNotificationUrl uses query for groups_knockout", () => {
    const url = buildBracketPublishedNotificationUrl(
      "t1",
      "Fem B",
      "groups_knockout",
    );
    assert.equal(url, "/torneios/t1/chave?categoryId=Fem%20B");
  });

  it("collectBracketAthleteUidsFromTeams deduplicates player ids", () => {
    const uids = collectBracketAthleteUidsFromTeams([
      {player1Id: "a", player2Id: "b"},
      {player1Id: "b", player2Id: "c"},
      {player1Id: "", player2Id: "  "},
    ]);
    assert.deepEqual(uids.sort(), ["a", "b", "c"]);
  });
});
