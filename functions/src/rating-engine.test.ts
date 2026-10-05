import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {updateRating} from "./glicko";
import {
  loadRatedSportConfig,
  loadRatingLadderConfig,
  parseLadderConfig,
  sportHasRatingLadder,
} from "./rating-config";
import {
  applyMatchRatingUpdate,
  athleteRatingDocId,
  athleteRatingsPath,
  declaredLevelFor,
  isWalkoverMatch,
  ratingEventId,
  ratingEventsPath,
  seedRatingState,
  shouldProcessRatingUpdate,
} from "./rating-engine";

import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";

// ─── Cenário base: torneio de vôlei de praia, duplas tA×tB ──────────────────

const PROJECT = "proj";
const CONFIG = parseLadderConfig("VOLEI_PRAIA", undefined);
const ENDED_AT = Timestamp.fromDate(new Date("2026-06-01T18:00:00Z"));

function seededDb(): FakeFirestore {
  const db = new FakeFirestore();
  db.seedDoc("tournaments/T1", {sport: "beachVolleyball"});
  db.seedDoc(`artifacts/${PROJECT}/public/data/teams/tA`, {
    player1Id: "a1",
    player2Id: "a2",
  });
  db.seedDoc(`artifacts/${PROJECT}/public/data/teams/tB`, {
    player1Id: "b1",
    player2Id: "b2",
  });
  for (const uid of ["a1", "a2", "b1", "b2"]) {
    db.seedDoc(`users/${uid}`, {
      sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "intermediario_1"}},
    });
  }
  return db;
}

function match(overrides: DocData = {}): DocData {
  return {
    status: "Completed",
    tournamentId: "T1",
    categoryId: "C1",
    teamAId: "tA",
    teamBId: "tB",
    winnerId: "tA",
    matchEndedAt: ENDED_AT,
    ...overrides,
  };
}

function ratingDocOf(db: FakeFirestore, uid: string): DocData | undefined {
  return db.store.get(
    `${athleteRatingsPath(PROJECT)}/${athleteRatingDocId(uid, "VOLEI_PRAIA")}`,
  );
}

// ─── Puras ───────────────────────────────────────────────────────────────────

describe("isWalkoverMatch / shouldProcessRatingUpdate", () => {
  it("detecta W.O. por resultA/resultB", () => {
    assert.equal(isWalkoverMatch({resultA: "W.O.", resultB: "0"}), true);
    assert.equal(isWalkoverMatch({resultA: "0", resultB: "W.O."}), true);
    assert.equal(isWalkoverMatch({resultA: "2", resultB: "1"}), false);
  });

  it("ignora rodada King of the Court", () => {
    // Sem dois lados não há confronto: aplicar Glicko aqui marcaria derrota
    // para todo mundo que não é o `winnerId`.
    const after = {status: "Completed", winnerId: "tA", matchType: "koc_round"};
    assert.equal(shouldProcessRatingUpdate({status: "In Progress"}, after), false);
  });

  it("dispara ao concluir com vencedor e na correção; ignora repetição", () => {
    const after = {status: "Completed", winnerId: "tA"};
    assert.equal(shouldProcessRatingUpdate({status: "In Progress"}, after), true);
    assert.equal(shouldProcessRatingUpdate(after, after), false);
    assert.equal(
      shouldProcessRatingUpdate({status: "Completed", winnerId: "tB"}, after),
      true,
    );
    assert.equal(shouldProcessRatingUpdate(after, {status: "Completed"}), false);
  });
});

describe("declaredLevelFor / seedRatingState", () => {
  it("resolve nível por esporte com fallback global", () => {
    assert.equal(
      declaredLevelFor(
        {sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "open"}}},
        "VOLEI_PRAIA",
      ),
      "open",
    );
    // Campo fantasma ignorado — cai no global.
    assert.equal(
      declaredLevelFor(
        {level: "open", levelsBySportFirestore: {VOLEI_PRAIA: "iniciante"}},
        "VOLEI_PRAIA",
      ),
      "open",
    );
    assert.equal(declaredLevelFor({level: "intermediario"}, "VOLEI_PRAIA"), "intermediario");
    assert.equal(declaredLevelFor(null, "VOLEI_PRAIA"), "");
  });

  it("seed usa o initialRating do nível declarado (legados por aliasing)", () => {
    const open = seedRatingState("a1", "VOLEI_PRAIA", CONFIG, "open");
    assert.equal(open.rating, 2200);
    assert.equal(open.levelCode, "open");

    const legacy = seedRatingState("a1", "VOLEI_PRAIA", CONFIG, "intermediario");
    assert.equal(legacy.levelCode, "intermediario_1");
    assert.equal(legacy.rating, 1600);

    const unknown = seedRatingState("a1", "VOLEI_PRAIA", CONFIG, "");
    assert.equal(unknown.levelCode, "iniciante_1");
    assert.equal(unknown.rating, 1250);
  });
});

// ─── applyMatchRatingUpdate ──────────────────────────────────────────────────

describe("applyMatchRatingUpdate", () => {
  it("aplica rating aos 4 atletas e grava o evento no ledger", async () => {
    const db = seededDb();
    const result = await applyMatchRatingUpdate(db as never, PROJECT, {
      matchId: "m1",
      match: match(),
    });
    assert.equal(result.processed, true);

    const event = db.store.get(
      `${ratingEventsPath(PROJECT)}/${ratingEventId("VOLEI_PRAIA", "m1")}`,
    );
    assert.ok(event);
    assert.equal(event.status, "applied");
    assert.equal(event.winnerTeamId, "tA");
    assert.deepEqual(event.athleteIds, ["a1", "a2", "b1", "b2"]);

    // Vencedores sobem, perdedores descem (seed 1600 p/ todos).
    for (const uid of ["a1", "a2"]) {
      assert.ok((ratingDocOf(db, uid)!.rating as number) > 1600, uid);
    }
    for (const uid of ["b1", "b2"]) {
      assert.ok((ratingDocOf(db, uid)!.rating as number) < 1600, uid);
    }
    assert.equal(ratingDocOf(db, "a1")!.ratedMatches, 1);
    assert.equal(ratingDocOf(db, "a1")!.wins, 1);
    assert.equal(ratingDocOf(db, "b1")!.losses, 1);
  });

  it("é idempotente pelo doc id do evento (re-run não move nada)", async () => {
    const db = seededDb();
    await applyMatchRatingUpdate(db as never, PROJECT, {matchId: "m1", match: match()});
    const before = ratingDocOf(db, "a1")!.rating;

    const rerun = await applyMatchRatingUpdate(db as never, PROJECT, {
      matchId: "m1",
      match: match(),
    });
    assert.equal(rerun.processed, false);
    assert.equal(rerun.reason, "duplicate");
    assert.equal(ratingDocOf(db, "a1")!.rating, before);
  });

  it("W.O. gera evento skipped e não move rating", async () => {
    const db = seededDb();
    const result = await applyMatchRatingUpdate(db as never, PROJECT, {
      matchId: "m1",
      match: match({resultA: "W.O.", resultB: "0"}),
    });
    assert.equal(result.processed, true);
    assert.equal(result.walkover, true);

    const event = db.store.get(
      `${ratingEventsPath(PROJECT)}/${ratingEventId("VOLEI_PRAIA", "m1")}`,
    );
    assert.equal(event!.status, "skipped");
    assert.equal(event!.walkover, true);
    assert.equal(ratingDocOf(db, "a1"), undefined);
  });

  it("esporte não rateado (futevôlei) e torneio ausente são pulados", async () => {
    const db = seededDb();
    db.seedDoc("tournaments/T1", {sport: "footvolley"});
    const skipped = await applyMatchRatingUpdate(db as never, PROJECT, {
      matchId: "m1",
      match: match(),
    });
    assert.equal(skipped.processed, false);
    assert.equal(skipped.reason, "sport_not_rated");

    const missing = await applyMatchRatingUpdate(db as never, PROJECT, {
      matchId: "m1",
      match: match({tournamentId: "nope"}),
    });
    assert.equal(missing.reason, "tournament_not_found");
  });

  // Incidente 18/08 (Copa Goiás): winnerId com o id do TORNEIO fazia
  // `won` ser falso dos dois lados — derrota de Glicko para os 4 atletas.
  it("vencedor fora dos dois lados não move rating nem grava evento", async () => {
    const db = seededDb();
    const result = await applyMatchRatingUpdate(db as never, PROJECT, {
      matchId: "m1",
      match: match({winnerId: "T1"}),
    });
    assert.equal(result.processed, false);
    assert.equal(result.reason, "winner_not_in_match");

    assert.equal(
      db.store.get(
        `${ratingEventsPath(PROJECT)}/${ratingEventId("VOLEI_PRAIA", "m1")}`,
      ),
      undefined,
    );
    for (const uid of ["a1", "a2", "b1", "b2"]) {
      assert.equal(ratingDocOf(db, uid), undefined, uid);
    }
  });

  it("flag ratingEnabled=false desliga a engine (kill switch)", async () => {
    const db = seededDb();
    db.seedDoc("ratingLadders/VOLEI_PRAIA", {flags: {ratingEnabled: false}});
    const result = await applyMatchRatingUpdate(db as never, PROJECT, {
      matchId: "m1",
      match: match(),
    });
    assert.equal(result.processed, false);
    assert.equal(result.reason, "rating_disabled");
  });

  it("seed respeita o nível declarado de cada atleta", async () => {
    const db = seededDb();
    db.seedDoc("users/a1", {
      sportOnboarding: {levelsBySport: {VOLEI_PRAIA: "open"}},
    });
    await applyMatchRatingUpdate(db as never, PROJECT, {matchId: "m1", match: match()});

    const doc = ratingDocOf(db, "a1")!;
    assert.equal(doc.seededFromLevel, "open");
    assert.equal(doc.levelCode, "open");
    // Favorito (2200) vencendo dupla 1600: sobe pouco, mas sobe.
    assert.ok((doc.rating as number) > 2200);
  });

  it("correção de vencedor superseda o evento e replaya == recomputar do zero", async () => {
    const db = seededDb();
    await applyMatchRatingUpdate(db as never, PROJECT, {matchId: "m1", match: match()});

    const corrected = await applyMatchRatingUpdate(db as never, PROJECT, {
      matchId: "m1",
      match: match({winnerId: "tB"}),
    });
    assert.equal(corrected.processed, true);
    assert.deepEqual(corrected.replayedAthleteIds, ["a1", "a2", "b1", "b2"]);

    const event = db.store.get(
      `${ratingEventsPath(PROJECT)}/${ratingEventId("VOLEI_PRAIA", "m1")}`,
    )!;
    assert.equal(event.winnerTeamId, "tB");
    const superseded = event.superseded as Array<Record<string, unknown>>;
    assert.equal(superseded.length, 1);
    assert.equal(superseded[0].winnerTeamId, "tA");

    // Replay determinístico: igual a computar direto a partir do seed com o
    // resultado certo (dupla composta 1600/300 dos dois lados).
    const expectedLoser = updateRating(
      {rating: 1600, rd: 300, volatility: 0.06},
      [{rating: 1600, rd: 300, score: 0}],
      {tau: 0.5, minRd: 60, maxRd: 350},
    );
    const a1 = ratingDocOf(db, "a1")!;
    assert.ok(Math.abs((a1.rating as number) - expectedLoser.rating) < 1e-9);
    assert.equal(a1.wins, 0);
    assert.equal(a1.losses, 1);

    const b1 = ratingDocOf(db, "b1")!;
    assert.ok((b1.rating as number) > 1600);
    assert.equal(b1.wins, 1);
  });
});

// ─── Fase 3a: rating ligado por configuração ────────────────────────────────

describe("rating por configuração (fase 3a)", () => {
  function sportDocOf(db: FakeFirestore, uid: string, sportCode: string): DocData | undefined {
    return db.store.get(`${athleteRatingsPath(PROJECT)}/${athleteRatingDocId(uid, sportCode)}`);
  }

  it("vôlei de praia sem doc de config rateia como hoje", async () => {
    const config = await loadRatingLadderConfig(new FakeFirestore() as never, "VOLEI_PRAIA");
    assert.equal(config.flags.ratingEnabled, true);
    assert.equal(sportHasRatingLadder(config), true);
  });

  it("futevôlei sem doc próprio não rateia, nem com o default ligado", async () => {
    const db = seededDb();
    db.seedDoc("tournaments/T1", {sport: "footvolley"});
    db.seedDoc("ratingLadders/default", {flags: {ratingEnabled: true}});
    const config = await loadRatingLadderConfig(db as never, "FUTEVOLEI");
    assert.equal(config.flags.ratingEnabled, false);
    assert.equal(sportHasRatingLadder(config), false);
    const result = await applyMatchRatingUpdate(db as never, PROJECT, {matchId: "m1", match: match()});
    assert.equal(result.reason, "sport_not_rated");
  });

  it("loadRatedSportConfig: config só de esporte com escada (vôlei sempre; novo só ligado)", async () => {
    const db = new FakeFirestore();
    db.seedDoc("ratingLadders/VOLEI_QUADRA", {flags: {ratingEnabled: false}});
    db.seedDoc("ratingLadders/FUTEVOLEI", {flags: {ratingEnabled: true}});
    assert.equal((await loadRatedSportConfig(db as never, "VOLEI_PRAIA"))?.sportCode, "VOLEI_PRAIA");
    // Kill switch desliga a engine, mas o esporte continua tendo escada (realinha nível).
    assert.equal((await loadRatedSportConfig(db as never, "VOLEI_QUADRA"))?.sportCode, "VOLEI_QUADRA");
    assert.equal((await loadRatedSportConfig(db as never, "FUTEVOLEI"))?.sportCode, "FUTEVOLEI");
    assert.equal(await loadRatedSportConfig(db as never, "BEACH_TENNIS"), null);
  });

  it("beach tennis com doc próprio sem a flag explícita não rateia", async () => {
    const db = seededDb();
    db.seedDoc("tournaments/T1", {sport: "beachTennis"});
    db.seedDoc("ratingLadders/BEACH_TENNIS", {glicko: {tau: 0.5}});
    const result = await applyMatchRatingUpdate(db as never, PROJECT, {matchId: "m1", match: match()});
    assert.equal(result.reason, "sport_not_rated");
  });

  it("beach tennis com ratingLadders/BEACH_TENNIS ratingEnabled=true rateia no doc do esporte", async () => {
    const db = seededDb();
    db.seedDoc("tournaments/T1", {sport: "beachTennis"});
    db.seedDoc("ratingLadders/BEACH_TENNIS", {flags: {ratingEnabled: true}});
    const result = await applyMatchRatingUpdate(db as never, PROJECT, {matchId: "m1", match: match()});
    assert.equal(result.processed, true);
    assert.equal(sportDocOf(db, "a1", "BEACH_TENNIS")!.wins, 1);
    assert.equal(ratingDocOf(db, "a1"), undefined);
  });
});
