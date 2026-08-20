import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  buildTeamSearchFields,
  buildLeagueSearchFields,
  buildTournamentSearchFields,
  buildUserSearchFields,
  generateKeywords,
  normalizeNicknameForSearch,
  normalizeSearchTerm,
  tokenizeSearchText,
  searchQueryTokens,
  searchAnchorToken,
  profileMatchesSearchTokens,
  searchRelevanceScore,
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

  it("buildUserSearchFields ignores legacy role field when roles is absent", () => {
    const fields = buildUserSearchFields({
      fullName: "Ana",
      role: "athlete",
    });
    assert.equal(fields.hasAthleteRole, false);
    assert.equal(fields.hasOrganizerRole, false);
  });

  it("buildUserSearchFields includes name nickname and email", () => {
    const fields = buildUserSearchFields({
      fullName: "Silvio Dionizio",
      nickname: "@silvio",
      email: "liga3@aaa.com",
      roles: ["athlete"],
    });
    assert.equal(fields.hasAthleteRole, true);
    assert.ok(fields.keywords.includes("silvio"));
    assert.ok(fields.keywords.includes("dion"));
    assert.ok(fields.keywords.includes("liga3"));
  });

  it("normalizeNicknameForSearch strips leading @", () => {
    assert.equal(normalizeNicknameForSearch("@silvio"), "silvio");
    assert.equal(normalizeNicknameForSearch("rafa"), "rafa");
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

  it("buildLeagueSearchFields includes name, city and stage names", () => {
    const fields = buildLeagueSearchFields({
      name: "Liga NexaGO",
      city: "Brasília",
      seasonLabel: "2026",
      stages: [{name: "Etapa Centro-Oeste"}, {name: "Final"}],
    });
    assert.ok(fields.keywords.includes("liga"));
    assert.ok(fields.keywords.includes("brasilia"));
    assert.ok(fields.keywords.includes("2026"));
    assert.ok(fields.keywords.includes("etapa"));
    assert.ok(fields.keywords.includes("final"));
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

describe("search-keywords: variantes acentuadas e forma colada", () => {
  it("guarda a variante COM acento ao lado da sem acento", () => {
    const keywords = generateKeywords(["João Gonçalves"]);
    assert.ok(keywords.includes("joao"));
    assert.ok(keywords.includes("joão"));
    assert.ok(keywords.includes("goncalves"));
    assert.ok(keywords.includes("gonçalves"));
    // Prefixo acentuado no meio da palavra também entra.
    assert.ok(keywords.includes("gonç"));
  });

  it("palavra sem acento não duplica keyword", () => {
    const keywords = generateKeywords(["Silva"]);
    assert.equal(keywords.filter((k) => k === "silva").length, 1);
  });

  it("apostrofo cola as partes: D'Avila vira davila", () => {
    const keywords = generateKeywords(["Maria D\u2019\u00c1vila"]);
    assert.ok(keywords.includes("davila"));
    assert.ok(!keywords.includes("avila"));
  });

  it("guarda a forma colada do nome inteiro", () => {
    const keywords = generateKeywords(["João Silva"]);
    assert.ok(keywords.includes("joaosilva"));
    assert.ok(keywords.includes("joaos"));
  });

  it("apelido com separador casa colado e por parte", () => {
    const fields = buildUserSearchFields({
      fullName: "Ana Paula",
      nickname: "@ana_paula",
      roles: ["athlete"],
    });
    assert.ok(fields.keywords.includes("anapaula"));
    assert.ok(fields.keywords.includes("ana"));
    assert.ok(fields.keywords.includes("paula"));
  });

  it("todo token tem a forma exata mesmo com o teto estourado", () => {
    const keywords = generateKeywords(
      ["Ana Beatriz Carolina Daniela", "apelidozz"],
      {maxKeywords: 12}
    );
    assert.equal(keywords.length, 12);
    assert.ok(keywords.includes("apelidozz"));
    assert.ok(keywords.includes("ana"));
  });
});

describe("search-keywords: lado da consulta", () => {
  it("searchQueryTokens quebra o termo em palavras normalizadas", () => {
    assert.deepEqual(searchQueryTokens("  João   Silva "), ["joao", "silva"]);
    assert.deepEqual(searchQueryTokens("@ana_paula"), ["ana", "paula"]);
    assert.deepEqual(searchQueryTokens("   "), []);
  });

  it("searchAnchorToken escolhe o token mais longo (mais seletivo)", () => {
    assert.equal(searchAnchorToken(["de", "oliveira"]), "oliveira");
    assert.equal(searchAnchorToken([]), "");
  });

  it("profileMatchesSearchTokens exige TODOS os tokens", () => {
    const profile = {fullName: "João Pedro Silva", nickname: "jp"};
    assert.equal(profileMatchesSearchTokens(profile, ["joao", "silva"]), true);
    assert.equal(profileMatchesSearchTokens(profile, ["joao", "souza"]), false);
    assert.equal(profileMatchesSearchTokens(profile, ["joaopedro"]), true);
  });

  it("profileMatchesSearchTokens casa por keywords quando o nome falta", () => {
    const profile = {keywords: ["ra", "raf", "rafa"]};
    assert.equal(profileMatchesSearchTokens(profile, ["rafa"]), true);
    assert.equal(profileMatchesSearchTokens(profile, ["rafael"]), false);
  });

  it("profileMatchesSearchTokens casa pelo nome quando keywords está velho", () => {
    const profile = {fullName: "Rafael Souza", keywords: ["ra", "raf"]};
    assert.equal(profileMatchesSearchTokens(profile, ["souza"]), true);
  });

  it("searchRelevanceScore põe o casamento exato na frente", () => {
    const exato = {fullName: "Ana Silva", nickname: "ana"};
    const comeco = {fullName: "Ana Beatriz", nickname: "aninha"};
    const meio = {fullName: "Mariana Costa", nickname: "mari"};
    const tokens = ["ana"];
    assert.ok(
      searchRelevanceScore(exato, tokens) < searchRelevanceScore(comeco, tokens)
    );
    assert.ok(
      searchRelevanceScore(comeco, tokens) < searchRelevanceScore(meio, tokens)
    );
  });
});
