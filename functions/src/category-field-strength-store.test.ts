import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  fieldStrengthDocId,
  fieldStrengthPath,
  loadAthleteLevelRanks,
  measureFieldStrength,
  paidTeamsWithParticipants,
  readFieldStrengthStamp,
} from "./category-field-strength-store";

const PROJECT = "proj";

function doc(data: Record<string, unknown>) {
  return {data: () => data};
}

describe("paidTeamsWithParticipants", () => {
  it("agrupa uids por time, ignorando não-pagas e fila de espera", () => {
    const teams = paidTeamsWithParticipants([
      doc({teamId: "tA", isPaid: true, participantUids: ["a1", "a2"]}),
      doc({teamId: "tB", isPaid: false, participantUids: ["b1", "b2"]}),
      doc({teamId: "tC", isPaid: true, waitlist: true, participantUids: ["c1"]}),
      doc({teamId: "", isPaid: true, participantUids: ["x1"]}),
    ]);
    assert.equal(teams.size, 1);
    assert.deepEqual(teams.get("tA"), ["a1", "a2"]);
  });

  it("time pago sem participantUids entra com lista vazia (conta no total)", () => {
    const teams = paidTeamsWithParticipants([doc({teamId: "tA", isPaid: true})]);
    assert.deepEqual(teams.get("tA"), []);
  });
});

describe("loadAthleteLevelRanks", () => {
  it("lê levelRank pelo id {uid}_{SPORT_CODE} em uma única ida", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/a1_VOLEI_PRAIA`, {levelRank: 6});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/a2_VOLEI_PRAIA`, {levelRank: 2});

    const ranks = await loadAthleteLevelRanks(
      db as never, PROJECT, ["a1", "a2", "sem-doc"], "VOLEI_PRAIA",
    );
    assert.equal(ranks.get("a1"), 6);
    assert.equal(ranks.get("a2"), 2);
    assert.equal(ranks.has("sem-doc"), false);
  });

  it("lista vazia ou esporte desconhecido não vai ao banco", async () => {
    const db = new FakeFirestore();
    assert.equal((await loadAthleteLevelRanks(db as never, PROJECT, [], "VOLEI_PRAIA")).size, 0);
    assert.equal((await loadAthleteLevelRanks(db as never, PROJECT, ["a1"], "")).size, 0);
  });
});

describe("measureFieldStrength", () => {
  it("mede pelo integrante mais forte de cada dupla", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/a1_VOLEI_PRAIA`, {levelRank: 6});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/a2_VOLEI_PRAIA`, {levelRank: 2});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/b1_VOLEI_PRAIA`, {levelRank: 2});
    db.seedDoc(`artifacts/${PROJECT}/public/data/athleteRatings/b2_VOLEI_PRAIA`, {levelRank: 2});

    const stamp = await measureFieldStrength(db as never, PROJECT, {
      tournamentId: "T1",
      categoryId: "C1",
      presetKey: "livre",
      sportCode: "VOLEI_PRAIA",
      teams: new Map([["tA", ["a1", "a2"]], ["tB", ["b1", "b2"]]]),
      source: "bracket",
    });

    assert.ok(stamp);
    assert.equal(stamp.fieldRank, 4);
    assert.equal(stamp.weight, 0.5);
    assert.equal(stamp.measuredTeams, 2);
    assert.equal(stamp.totalPaidTeams, 2);
    assert.equal(stamp.source, "bracket");
  });

  it("campo sem nenhum degrau conhecido devolve null", async () => {
    const db = new FakeFirestore();
    const stamp = await measureFieldStrength(db as never, PROJECT, {
      tournamentId: "T1", categoryId: "C1", presetKey: "livre",
      sportCode: "VOLEI_PRAIA",
      teams: new Map([["tA", ["a1"]]]),
      source: "bracket",
    });
    assert.equal(stamp, null);
  });

  it("esporte sem código de nível devolve null", async () => {
    const db = new FakeFirestore();
    const stamp = await measureFieldStrength(db as never, PROJECT, {
      tournamentId: "T1", categoryId: "C1", presetKey: "livre",
      sportCode: null,
      teams: new Map([["tA", ["a1"]]]),
      source: "bracket",
    });
    assert.equal(stamp, null);
  });
});

describe("readFieldStrengthStamp", () => {
  it("lê o carimbo gravado", async () => {
    const db = new FakeFirestore();
    db.seedDoc(`${fieldStrengthPath(PROJECT)}/${fieldStrengthDocId("T1", "C1")}`, {
      tournamentId: "T1", categoryId: "C1", presetKey: "livre",
      fieldRank: 4.2, weight: 0.5, measuredTeams: 10, totalPaidTeams: 10,
      source: "bracket",
    });
    const stamp = await readFieldStrengthStamp(db as never, PROJECT, "T1", "C1");
    assert.ok(stamp);
    assert.equal(stamp.weight, 0.5);
    assert.equal(stamp.fieldRank, 4.2);
  });

  it("carimbo ausente ou com peso inválido devolve null", async () => {
    const db = new FakeFirestore();
    assert.equal(await readFieldStrengthStamp(db as never, PROJECT, "T1", "C1"), null);
    db.seedDoc(`${fieldStrengthPath(PROJECT)}/${fieldStrengthDocId("T2", "C2")}`, {weight: 0});
    assert.equal(await readFieldStrengthStamp(db as never, PROJECT, "T2", "C2"), null);
  });
});
