import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  SPORT_CATALOG,
  normalizeSportKey,
  resolveSport,
  sportLabel,
  sportProfileCode,
  titleCaseSportCode,
} from "./catalog";
import {
  SPORT_NORMALIZE_VECTORS,
  SPORT_RESOLVE_VECTORS,
  SPORT_TITLE_CASE_VECTORS,
} from "./vectors.generated";
import {ATHLETE_SPORT_CODES, tournamentSportToLevelSportCode} from "../category-level-eligibility";
import {sportLabel as ladderSportLabel} from "../rating-ladder";

describe("sports/catalog · vetores compartilhados com app e portais", () => {
  it("normaliza", () => {
    for (const [input, want] of SPORT_NORMALIZE_VECTORS) assert.equal(normalizeSportKey(input), want, input);
  });
  it("resolve", () => {
    for (const [input, want] of SPORT_RESOLVE_VECTORS) assert.equal(resolveSport(input)?.code ?? null, want, input);
  });
  it("title case", () => {
    for (const [input, want] of SPORT_TITLE_CASE_VECTORS) assert.equal(titleCaseSportCode(input), want, input);
  });
});

describe("sports/catalog · rótulo e pontes", () => {
  it("rótulo: conhecido → catálogo; desconhecido → title case; vazio → null", () => {
    assert.equal(sportLabel("beach_tennis"), "Beach tennis");
    assert.equal(sportLabel("padel"), "Padel");
    assert.equal(sportLabel("  "), null);
    assert.equal(sportLabel(undefined), null);
  });

  it("código de perfil de qualquer grafia conhecida", () => {
    assert.equal(sportProfileCode("beachVolleyball"), "VOLEI_PRAIA");
    assert.equal(sportProfileCode("padel"), "PADEL");
    assert.equal(sportProfileCode("curling"), null);
  });

  it("ATHLETE_SPORT_CODES é o conjunto de códigos de perfil do catálogo", () => {
    assert.deepEqual([...ATHLETE_SPORT_CODES].sort(), SPORT_CATALOG.map((e) => e.profileCode).sort());
  });

  it("nível por esporte aceita a grafia legada do torneio", () => {
    assert.equal(tournamentSportToLevelSportCode("beach_tennis"), "BEACH_TENNIS");
    assert.equal(tournamentSportToLevelSportCode("Vôlei de praia"), "VOLEI_PRAIA");
  });

  it("rótulo da notificação de nível vem do catálogo, em minúsculas", () => {
    assert.equal(ladderSportLabel("FUTEVOLEI"), "futevôlei");
    assert.equal(ladderSportLabel("XADREZ"), "XADREZ");
  });
});
