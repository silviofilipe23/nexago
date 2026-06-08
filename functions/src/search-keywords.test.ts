import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildTeamSearchFields,
  buildTournamentSearchFields,
  buildUserSearchFields,
  generateKeywords,
  normalizeSearchTerm,
  tokenizeSearchText,
} from "./search-keywords";

describe("search-keywords", () => {
  it("normalizeSearchTerm strips accents and non-alphanumeric", () => {
    assert.equal(normalizeSearchTerm("  Silvio  "), "silvio");
    assert.equal(normalizeSearchTerm("Goiânia"), "goiania");
    assert.equal(normalizeSearchTerm(""), "");
  });

  it("tokenizeSearchText splits email local and domain parts", () => {
    const tokens = tokenizeSearchText("liga3@aaa.com");
    assert.ok(tokens.includes("liga3"));
    assert.ok(tokens.includes("aaa"));
    assert.ok(tokens.includes("com"));
  });

  it("generateKeywords produces per-word prefixes for full name", () => {
    const keywords = generateKeywords(["Silvio Dionizio"], {minPrefix: 1});
    assert.ok(keywords.includes("s"));
    assert.ok(keywords.includes("sil"));
    assert.ok(keywords.includes("silv"));
    assert.ok(keywords.includes("silvio"));
    assert.ok(keywords.includes("d"));
    assert.ok(keywords.includes("dion"));
    assert.ok(keywords.includes("dioni"));
    assert.ok(keywords.includes("dionizio"));
  });

  it("generateKeywords defaults minPrefix to 2", () => {
    const keywords = generateKeywords(["Silvio Dionizio"]);
    assert.ok(!keywords.includes("s"));
    assert.ok(keywords.includes("si"));
    assert.ok(keywords.includes("di"));
    assert.ok(keywords.includes("dion"));
  });

  it("buildUserSearchFields prioritizes roles array for flags", () => {
    const fields = buildUserSearchFields({
      fullName: "Atleta NexaGO",
      email: "liga3@aaa.com",
      role: "organizer",
      roles: ["athlete", "organizer"],
    });
    assert.equal(fields.hasAthleteRole, true);
    assert.equal(fields.hasOrganizerRole, true);
    assert.ok(fields.keywords.includes("liga3"));
    assert.ok(fields.keywords.includes("atleta"));
  });

  it("buildUserSearchFields uses legacy role when roles empty", () => {
    const fields = buildUserSearchFields({
      fullName: "Ana",
      role: "athlete",
    });
    assert.equal(fields.hasAthleteRole, true);
    assert.equal(fields.hasOrganizerRole, false);
  });

  it("buildTournamentSearchFields includes name and city", () => {
    const fields = buildTournamentSearchFields({
      name: "Open NexaGO",
      city: "Goiânia",
      location: "UFG",
    });
    assert.ok(fields.keywords.includes("open"));
    assert.ok(fields.keywords.includes("goiania"));
    assert.ok(fields.keywords.includes("ufg"));
  });

  it("buildTeamSearchFields merges team name and player names", () => {
    const fields = buildTeamSearchFields(
      {teamName: "Dupla NexaGO"},
      ["Silvio Dionizio", "Maria Silva"]
    );
    assert.ok(fields.keywords.includes("dupla"));
    assert.ok(fields.keywords.includes("silvio"));
    assert.ok(fields.keywords.includes("maria"));
    assert.equal(fields.player1DisplayName, "Silvio Dionizio");
    assert.equal(fields.player2DisplayName, "Maria Silva");
  });
});
