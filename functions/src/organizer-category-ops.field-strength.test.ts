import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {categoryPreset} from "./category-presets";
import {tournamentSportToLevelSportCode} from "./category-level-eligibility";
import {
  fieldStrengthDocId,
  fieldStrengthPath,
  measureFieldStrength,
  paidTeamsWithParticipants,
} from "./category-field-strength-store";

const PROJECT = "proj";

describe("carimbo na geração da chave", () => {
  it("categoria Livre (piso Iniciante 1, teto Open) é reconhecida como livre", () => {
    const preset = categoryPreset({level: "Open", minLevel: "Iniciante 1"});
    assert.equal(preset?.key, "livre");
    assert.equal(preset?.weight, 0.125);
  });

  it("categoria de faixa fechada NÃO é livre e não deve carimbar", () => {
    assert.equal(categoryPreset({level: "Open", minLevel: "Avançado 1"})?.key, "open");
    assert.equal(categoryPreset({level: "Intermediário 2", minLevel: "Intermediário 1"})?.key, "intermediario");
  });

  it("mede a partir do snapshot de inscrições da chave", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/a1_VOLEI_PRAIA`, {levelRank: 6});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/a2_VOLEI_PRAIA`, {levelRank: 2});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/b1_VOLEI_PRAIA`, {levelRank: 3});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/b2_VOLEI_PRAIA`, {levelRank: 2});

    const docs = [
      {data: () => ({teamId: "tA", isPaid: true, participantUids: ["a1", "a2"]})},
      {data: () => ({teamId: "tB", isPaid: true, participantUids: ["b1", "b2"]})},
    ];

    const stamp = await measureFieldStrength(db as never, PROJECT, {
      tournamentId: "T1",
      categoryId: "C1",
      presetKey: "livre",
      sportCode: tournamentSportToLevelSportCode("beachVolleyball"),
      teams: paidTeamsWithParticipants(docs),
      source: "bracket",
    });

    assert.ok(stamp);
    // Duplas valem 6 e 3 → média 4.5 → round 5 → faixa Avançado.
    assert.equal(stamp.fieldRank, 4.5);
    assert.equal(stamp.weight, 0.5);
    assert.equal(stamp.source, "bracket");
  });

  it("id do carimbo é {tournamentId}_{categoryId} na coleção própria", () => {
    assert.equal(fieldStrengthDocId("T1", "C1"), "T1_C1");
    assert.equal(
      fieldStrengthPath(PROJECT),
      `artifacts/${PROJECT}/public/data/tournamentCategoryFieldStrength`,
    );
  });
});
