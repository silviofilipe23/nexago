import {describe, it, afterEach} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import * as notificationDelivery from "./notification-delivery";
import {
  recalculateCourtSchedule,
  notifyScheduleShifts,
  handleDynamicRescheduleOnMatchUpdate,
} from "./match-dynamic-reschedule";
import {artifactsMatchesPath, artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";

const PROJECT_ID = getFirebaseProjectId();
const MATCHES_PATH = artifactsMatchesPath(PROJECT_ID);
const TEAMS_PATH = artifactsTeamsPath(PROJECT_ID);
const TOURNAMENT_ID = "t1";
const DAY_KEY = "2026-08-25";
const COURT_ID = "court-1";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function ts(iso: string): Timestamp {
  return Timestamp.fromDate(new Date(iso));
}

type SentNotification = {userId: string; title: string; body: string; type: string};
let sent: SentNotification[] = [];

function mockDeliver(): void {
  sent = [];
  (notificationDelivery as unknown as {
    deliverNotificationToUser: typeof notificationDelivery.deliverNotificationToUser;
  }).deliverNotificationToUser = async (input) => {
    sent.push({userId: input.userId, title: input.title, body: input.body, type: input.type});
    return {sent: 1, failed: 0};
  };
}

function seedMatch(
  fake: FakeFirestore,
  id: string,
  overrides: Record<string, unknown>,
): void {
  fake.seedDoc(`${MATCHES_PATH}/${id}`, {
    tournamentId: TOURNAMENT_ID,
    dayKey: DAY_KEY,
    courtId: COURT_ID,
    courtName: "Quadra 1",
    status: "Scheduled",
    queueStatus: "waiting",
    matchNumber: 1,
    teamAId: "team-a",
    teamBId: "team-b",
    ...overrides,
  });
}

describe("recalculateCourtSchedule", () => {
  it("empurra as próximas partidas da mesma quadra a partir da âncora", async () => {
    const fake = new FakeFirestore();
    seedMatch(fake, "trigger-match", {
      status: "Completed",
      matchNumber: 1,
      scheduleTime: ts("2026-08-25T14:00:00-03:00"),
      scheduleEndTime: ts("2026-08-25T14:30:00-03:00"),
      matchEndedAt: ts("2026-08-25T14:20:00-03:00"),
    });
    seedMatch(fake, "next-match", {
      matchNumber: 2,
      scheduleTime: ts("2026-08-25T14:30:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:00:00-03:00"),
      teamAId: "team-c",
      teamBId: "team-d",
    });

    const shifts = await recalculateCourtSchedule(
      db(fake),
      PROJECT_ID,
      {
        tournamentId: TOURNAMENT_ID,
        dayKey: DAY_KEY,
        courtId: COURT_ID,
        anchor: new Date("2026-08-25T14:20:00-03:00"),
        triggerMatchId: "trigger-match",
      },
      {durationMin: 30, minRestMin: 30},
    );

    assert.equal(shifts.length, 1);
    assert.equal(shifts[0].matchId, "next-match");
    assert.equal(shifts[0].newStart.toISOString(), new Date("2026-08-25T14:20:00-03:00").toISOString());

    const updated = (await fake.doc(`${MATCHES_PATH}/next-match`).get()).data();
    assert.equal(
      (updated?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:20:00-03:00").toMillis(),
    );
    assert.ok(updated?.scheduleRecalcAt);
  });

  it("não toca partidas já on_court/completed nem de outra quadra", async () => {
    const fake = new FakeFirestore();
    seedMatch(fake, "trigger-match", {status: "Completed", matchNumber: 1});
    seedMatch(fake, "already-live", {matchNumber: 2, queueStatus: "on_court", scheduleTime: ts("2026-08-25T14:30:00-03:00")});
    seedMatch(fake, "other-court", {matchNumber: 2, courtId: "court-2", scheduleTime: ts("2026-08-25T14:30:00-03:00")});

    const shifts = await recalculateCourtSchedule(
      db(fake),
      PROJECT_ID,
      {
        tournamentId: TOURNAMENT_ID,
        dayKey: DAY_KEY,
        courtId: COURT_ID,
        anchor: new Date("2026-08-25T14:20:00-03:00"),
        triggerMatchId: "trigger-match",
      },
      {durationMin: 30, minRestMin: 30},
    );

    assert.deepEqual(shifts, []);
  });

  it("continua as outras partidas quando a escrita de uma delas falha (best-effort)", async () => {
    const fake = new FakeFirestore();
    seedMatch(fake, "trigger-match", {status: "Completed", matchNumber: 1});
    seedMatch(fake, "next-match", {
      matchNumber: 2,
      scheduleTime: ts("2026-08-25T14:30:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:00:00-03:00"),
      teamAId: "team-c",
      teamBId: "team-d",
    });
    seedMatch(fake, "third-match", {
      matchNumber: 3,
      scheduleTime: ts("2026-08-25T15:00:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:30:00-03:00"),
      teamAId: "team-e",
      teamBId: "team-f",
    });

    // Simula uma falha transitória do Firestore SÓ na escrita de "next-match"
    // (a primeira da fila) sobrescrevendo o método privado `write` da
    // instância — mesma técnica de monkeypatch já usada acima para
    // `deliverNotificationToUser`, sem alterar o helper compartilhado.
    const failingPath = `${MATCHES_PATH}/next-match`;
    type WriteFn = (
      path: string,
      data: Record<string, unknown>,
      opts?: {merge?: boolean},
    ) => void;
    const fakeWithWrite = fake as unknown as {write: WriteFn};
    const originalWrite = fakeWithWrite.write.bind(fake);
    fakeWithWrite.write = (path, data, opts) => {
      if (path === failingPath) throw new Error("firestore indisponível (simulado)");
      originalWrite(path, data, opts);
    };

    const shifts = await recalculateCourtSchedule(
      db(fake),
      PROJECT_ID,
      {
        tournamentId: TOURNAMENT_ID,
        dayKey: DAY_KEY,
        courtId: COURT_ID,
        anchor: new Date("2026-08-25T14:20:00-03:00"),
        triggerMatchId: "trigger-match",
      },
      {durationMin: 30, minRestMin: 30},
    );

    // "next-match" falhou e foi excluída do retorno (sem notificação órfã);
    // "third-match" continuou sendo processada normalmente.
    assert.equal(shifts.length, 1);
    assert.equal(shifts[0].matchId, "third-match");

    const untouchedNext = (await fake.doc(`${MATCHES_PATH}/next-match`).get()).data();
    assert.equal(
      (untouchedNext?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:30:00-03:00").toMillis(),
    );

    const updatedThird = (await fake.doc(`${MATCHES_PATH}/third-match`).get()).data();
    assert.ok(updatedThird?.scheduleRecalcAt);
  });
});

describe("notifyScheduleShifts", () => {
  afterEach(mockDeliver);

  it("notifica os dois times quando o desvio é >= 10min", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`${TEAMS_PATH}/team-a`, {player1Id: "p1", player2Id: "p2"});
    fake.seedDoc(`${TEAMS_PATH}/team-c`, {player1Id: "p3", player2Id: "p4"});

    await notifyScheduleShifts(db(fake), PROJECT_ID, TOURNAMENT_ID, [
      {
        matchId: "next-match",
        teamAId: "team-a",
        teamBId: "team-c",
        oldStart: new Date("2026-08-25T14:30:00-03:00"),
        newStart: new Date("2026-08-25T14:20:00-03:00"),
        courtLabel: "Quadra 1",
      },
    ]);

    assert.equal(sent.length, 4);
    assert.ok(sent.every((n) => n.type === "match_schedule_updated"));
    assert.deepEqual(sent.map((n) => n.userId).sort(), ["p1", "p2", "p3", "p4"]);
  });

  it("NÃO notifica quando o desvio é menor que o limiar", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`${TEAMS_PATH}/team-a`, {player1Id: "p1", player2Id: "p2"});

    await notifyScheduleShifts(db(fake), PROJECT_ID, TOURNAMENT_ID, [
      {
        matchId: "next-match",
        teamAId: "team-a",
        teamBId: "",
        oldStart: new Date("2026-08-25T14:30:00-03:00"),
        newStart: new Date("2026-08-25T14:25:00-03:00"), // só 5min
        courtLabel: "Quadra 1",
      },
    ]);

    assert.equal(sent.length, 0);
  });
});

describe("handleDynamicRescheduleOnMatchUpdate", () => {
  afterEach(mockDeliver);

  it("não faz nada quando o torneio não ligou a flag", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`tournaments/${TOURNAMENT_ID}`, {
      matchOps: {defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30},
    });
    seedMatch(fake, "next-match", {matchNumber: 2, scheduleTime: ts("2026-08-25T14:30:00-03:00")});

    const before = {tournamentId: TOURNAMENT_ID, dayKey: DAY_KEY, courtId: COURT_ID, status: "In Progress"};
    const after = {
      tournamentId: TOURNAMENT_ID,
      dayKey: DAY_KEY,
      courtId: COURT_ID,
      status: "Completed",
      matchEndedAt: ts("2026-08-25T14:20:00-03:00"),
    };

    await handleDynamicRescheduleOnMatchUpdate(db(fake), PROJECT_ID, "trigger-match", before, after);

    const untouched = (await fake.doc(`${MATCHES_PATH}/next-match`).get()).data();
    assert.equal(
      (untouched?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:30:00-03:00").toMillis(),
    );
    assert.equal(sent.length, 0);
  });

  it("recalcula e notifica de ponta a ponta quando a flag está ligada", async () => {
    mockDeliver();
    const fake = new FakeFirestore();
    fake.seedDoc(`tournaments/${TOURNAMENT_ID}`, {
      matchOps: {dynamicRescheduleEnabled: true, defaultMatchDurationMin: 30, minRestBetweenMatchesMin: 30},
    });
    fake.seedDoc(`${TEAMS_PATH}/team-c`, {player1Id: "p3", player2Id: "p4"});
    fake.seedDoc(`${TEAMS_PATH}/team-d`, {player1Id: "p5", player2Id: "p6"});
    seedMatch(fake, "next-match", {
      matchNumber: 2,
      scheduleTime: ts("2026-08-25T14:30:00-03:00"),
      scheduleEndTime: ts("2026-08-25T15:00:00-03:00"),
      teamAId: "team-c",
      teamBId: "team-d",
    });

    const before = {tournamentId: TOURNAMENT_ID, dayKey: DAY_KEY, courtId: COURT_ID, status: "In Progress"};
    const after = {
      tournamentId: TOURNAMENT_ID,
      dayKey: DAY_KEY,
      courtId: COURT_ID,
      status: "Completed",
      matchEndedAt: ts("2026-08-25T14:15:00-03:00"), // terminou 15min antes do previsto
    };

    await handleDynamicRescheduleOnMatchUpdate(db(fake), PROJECT_ID, "trigger-match", before, after);

    const updated = (await fake.doc(`${MATCHES_PATH}/next-match`).get()).data();
    assert.equal(
      (updated?.scheduleTime as Timestamp).toMillis(),
      ts("2026-08-25T14:15:00-03:00").toMillis(),
    );
    assert.equal(sent.length, 4); // 2 jogadores x 2 times
  });
});
