import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  computeHeadToHead,
  EMPTY_HEAD_TO_HEAD_RESULT,
  type MatchRecord,
  type TeamRecord,
} from "./head-to-head";

const ATHLETE_A = "athlete-a";
const ATHLETE_B = "athlete-b";
const ATHLETE_C = "athlete-c";

function team(id: string, player1Id: string, player2Id = ""): [string, TeamRecord] {
  return [id, {id, player1Id, player2Id}];
}

function match(overrides: Partial<MatchRecord> & Pick<MatchRecord, "id" | "teamAId" | "teamBId">): MatchRecord {
  return {
    status: "Completed",
    winnerId: null,
    tournamentId: "t1",
    matchEndedAt: null,
    ...overrides,
  };
}

describe("head-to-head · computeHeadToHead", () => {
  it("par com confrontos anteriores retorna contagem correta (3 vitórias a 1)", () => {
    const teamsById = new Map([
      team("team-a", ATHLETE_A),
      team("team-b", ATHLETE_B),
    ]);
    const matches: MatchRecord[] = [
      match({id: "m1", teamAId: "team-a", teamBId: "team-b", winnerId: "team-a", matchEndedAt: 1}),
      match({id: "m2", teamAId: "team-a", teamBId: "team-b", winnerId: "team-a", matchEndedAt: 2}),
      match({id: "m3", teamAId: "team-b", teamBId: "team-a", winnerId: "team-b", matchEndedAt: 3}),
      match({id: "m4", teamAId: "team-a", teamBId: "team-b", winnerId: "team-a", matchEndedAt: 4}),
    ];

    const result = computeHeadToHead(ATHLETE_A, ATHLETE_B, matches, teamsById);

    assert.equal(result.wins, 3);
    assert.equal(result.losses, 1);
    assert.equal(result.recentMatches.length, 4);
    // Mais recente primeiro.
    assert.equal(result.recentMatches[0].matchId, "m4");
    assert.equal(result.recentMatches[0].athleteAWon, true);
    assert.equal(result.recentMatches[3].matchId, "m1");
  });

  it("par sem confrontos retorna zerado", () => {
    const teamsById = new Map([
      team("team-a", ATHLETE_A),
      team("team-c", ATHLETE_C),
    ]);
    // Nenhuma partida envolve o par (A, B) — B nem tem time no mapa.
    const matches: MatchRecord[] = [
      match({id: "m1", teamAId: "team-a", teamBId: "team-c", winnerId: "team-a", matchEndedAt: 1}),
    ];

    const result = computeHeadToHead(ATHLETE_A, ATHLETE_B, matches, teamsById);

    assert.deepEqual(result, EMPTY_HEAD_TO_HEAD_RESULT);
  });

  it("não conta partidas onde os dois estavam do mesmo lado (dupla)", () => {
    // A e B são parceiros no mesmo time contra C — não é H2H entre A e B.
    const teamsById = new Map([
      team("team-ab", ATHLETE_A, ATHLETE_B),
      team("team-c", ATHLETE_C),
    ]);
    const sameSideMatch = match({
      id: "m-same-side",
      teamAId: "team-ab",
      teamBId: "team-c",
      winnerId: "team-ab",
      matchEndedAt: 1,
    });

    const result = computeHeadToHead(ATHLETE_A, ATHLETE_B, [sameSideMatch], teamsById);

    assert.deepEqual(result, EMPTY_HEAD_TO_HEAD_RESULT);
  });

  it("mistura partida do mesmo lado (ignorada) com uma de lados opostos (contada)", () => {
    const teamsById = new Map([
      team("team-ab", ATHLETE_A, ATHLETE_B),
      team("team-a-solo", ATHLETE_A),
      team("team-b-solo", ATHLETE_B),
      team("team-c", ATHLETE_C),
    ]);
    const matches: MatchRecord[] = [
      match({
        id: "m-same-side",
        teamAId: "team-ab",
        teamBId: "team-c",
        winnerId: "team-ab",
        matchEndedAt: 1,
      }),
      match({
        id: "m-opposite-side",
        teamAId: "team-a-solo",
        teamBId: "team-b-solo",
        winnerId: "team-b-solo",
        matchEndedAt: 2,
        sets: [{a: 15, b: 21}, {a: 18, b: 21}],
      }),
    ];

    const result = computeHeadToHead(ATHLETE_A, ATHLETE_B, matches, teamsById);

    assert.equal(result.wins, 0);
    assert.equal(result.losses, 1);
    assert.equal(result.recentMatches.length, 1);
    assert.equal(result.recentMatches[0].matchId, "m-opposite-side");
    assert.equal(result.recentMatches[0].scoreLabel, "15-21, 18-21");
  });

  it("ignora partidas não concluídas (status diferente de Completed)", () => {
    const teamsById = new Map([
      team("team-a", ATHLETE_A),
      team("team-b", ATHLETE_B),
    ]);
    const matches: MatchRecord[] = [
      match({
        id: "m-scheduled",
        teamAId: "team-a",
        teamBId: "team-b",
        status: "Scheduled",
        winnerId: null,
      }),
      match({
        id: "m-in-progress",
        teamAId: "team-a",
        teamBId: "team-b",
        status: "In Progress",
        winnerId: null,
      }),
    ];

    const result = computeHeadToHead(ATHLETE_A, ATHLETE_B, matches, teamsById);

    assert.deepEqual(result, EMPTY_HEAD_TO_HEAD_RESULT);
  });

  it("limita a lista de partidas recentes às 5 mais novas", () => {
    const teamsById = new Map([
      team("team-a", ATHLETE_A),
      team("team-b", ATHLETE_B),
    ]);
    const matches: MatchRecord[] = Array.from({length: 8}, (_, i) =>
      match({
        id: `m${i}`,
        teamAId: "team-a",
        teamBId: "team-b",
        winnerId: "team-a",
        matchEndedAt: i,
      }));

    const result = computeHeadToHead(ATHLETE_A, ATHLETE_B, matches, teamsById);

    assert.equal(result.wins, 8);
    assert.equal(result.recentMatches.length, 5);
    assert.equal(result.recentMatches[0].matchId, "m7");
    assert.equal(result.recentMatches[4].matchId, "m3");
  });
});
