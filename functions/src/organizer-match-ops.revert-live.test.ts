import {describe, it, afterEach} from "node:test";
import assert from "node:assert/strict";
import * as adminAuth from "firebase-admin/auth";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  revertMatchToScheduledCore,
  revertToScheduledFields,
} from "./organizer-match-ops";
import {artifactsMatchesPath, getFirebaseProjectId} from "./firebase-paths";

/**
 * Testes de `revertMatchToScheduledCore` — o "tirar do ao vivo" que faltava:
 * até então nenhum callable devolvia uma partida `In Progress` para `Scheduled`,
 * e o organizador que iniciasse a partida errada ficava sem saída (ver
 * `unscheduleMatch`, que recusa partida em andamento).
 *
 * Mesmo padrão de `organizer-match-ops.live-score.test.ts`: `FakeFirestore` +
 * monkey patch de `getAuth` (o build é CommonJS, então o import de namespace
 * aponta para o MESMO objeto de módulo que `tournament-acl.ts` usa).
 */

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function mockAuthUser(customClaims: Record<string, unknown> = {}): void {
  (adminAuth as unknown as {getAuth: () => {getUser: (uid: string) => Promise<{customClaims: Record<string, unknown>}>}}).getAuth =
    () => ({
      getUser: async () => ({customClaims}),
    });
}

const projectId = getFirebaseProjectId();
const matchesPath = artifactsMatchesPath(projectId);

/** Partida ao vivo com placar já lançado — o estado de quem iniciou errado. */
function seedLiveMatch(
  fake: FakeFirestore,
  opts: {
    tournamentId: string;
    matchId: string;
    managerId?: string;
    status?: string;
    matchOverrides?: DocData;
  },
): void {
  fake.seedDoc(`tournaments/${opts.tournamentId}`, {
    managerId: opts.managerId ?? "owner-1",
    name: "Copa Teste",
    liveMatchesNow: 1,
  });
  fake.seedDoc(`${matchesPath}/${opts.matchId}`, {
    tournamentId: opts.tournamentId,
    teamAId: "teamA",
    teamBId: "teamB",
    status: opts.status ?? "In Progress",
    matchStartedAt: "2026-08-16T13:00:00Z",
    liveScore: {setsA: 0, setsB: 0, currentGamesA: 3, currentGamesB: 1},
    sets: [{a: 3, b: 1}],
    currentSetIndex: 0,
    servingTeamId: "teamA",
    resultA: "0",
    resultB: "0",
    queueStatus: "on_court",
    ...opts.matchOverrides,
  });
}

async function assertHttpsError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava HttpsError ${code}, veio ${err.code}`);
    return true;
  });
}

describe("revertToScheduledFields", () => {
  it("volta para Scheduled limpando TODO resíduo do ao vivo", () => {
    const patch = revertToScheduledFields();

    assert.equal(patch.status, "Scheduled");
    assert.ok(patch.updatedAt, "precisa carimbar updatedAt");

    // O conjunto exato de campos apagados: um campo esquecido aqui reaparece na
    // mesa quando a partida for reiniciada (placar velho, saque de outra dupla).
    const cleared = Object.keys(patch)
      .filter((key) => key !== "status" && key !== "updatedAt")
      .sort();
    assert.deepEqual(cleared, [
      "currentSetIndex",
      "liveScore",
      "matchEndedAt",
      "matchStartedAt",
      "queueStatus",
      "resultA",
      "resultB",
      "servingTeamId",
      "sets",
      "winnerId",
    ]);
  });
});

describe("revertMatchToScheduledCore", () => {
  afterEach(() => {
    mockAuthUser({});
  });

  it("dono do torneio tira a partida do ao vivo e o contador do torneio cai", async () => {
    const fake = new FakeFirestore();
    seedLiveMatch(fake, {tournamentId: "t1", matchId: "m1", managerId: "owner-1"});

    const result = await revertMatchToScheduledCore(db(fake), "owner-1", {matchId: "m1"});
    assert.equal(result.ok, true);

    assert.equal(fake.store.get(`${matchesPath}/m1`)!.status, "Scheduled");
    assert.equal(fake.store.get("tournaments/t1")!.liveMatchesNow, 0);
  });

  it("mesário (staff scorer) também pode desfazer o início que ele mesmo deu", async () => {
    const fake = new FakeFirestore();
    seedLiveMatch(fake, {tournamentId: "t2", matchId: "m2", managerId: "owner-2"});
    fake.seedDoc("tournaments/t2/staff/staff-1", {status: "active", role: "scorer"});
    mockAuthUser({}); // sem claim admin — precisa cair no doc de staff

    const result = await revertMatchToScheduledCore(db(fake), "staff-1", {matchId: "m2"});
    assert.equal(result.ok, true);
    assert.equal(fake.store.get(`${matchesPath}/m2`)!.status, "Scheduled");
  });

  it("apaga o histórico ponto a ponto", async () => {
    const fake = new FakeFirestore();
    seedLiveMatch(fake, {tournamentId: "t3", matchId: "m3", managerId: "owner-3"});
    fake.seedDoc(`${matchesPath}/m3/pointEvents/e1`, {seq: 1, type: "point", side: "A"});
    fake.seedDoc(`${matchesPath}/m3/pointEvents/e2`, {seq: 2, type: "point", side: "B"});

    await revertMatchToScheduledCore(db(fake), "owner-3", {matchId: "m3"});

    assert.equal(fake.store.has(`${matchesPath}/m3/pointEvents/e1`), false);
    assert.equal(fake.store.has(`${matchesPath}/m3/pointEvents/e2`), false);
  });

  it("preserva o agendamento e o check-in — a partida só volta para a agenda", async () => {
    const fake = new FakeFirestore();
    seedLiveMatch(fake, {
      tournamentId: "t4",
      matchId: "m4",
      managerId: "owner-4",
      matchOverrides: {
        courtId: "Q1",
        courtName: "Quadra 1",
        scheduleTime: "2026-08-16T13:00:00Z",
        dayKey: "2026-08-16",
        checkIn: {teamA: {status: "present"}, teamB: {status: "present"}},
      },
    });

    await revertMatchToScheduledCore(db(fake), "owner-4", {matchId: "m4"});

    const data = fake.store.get(`${matchesPath}/m4`)!;
    assert.equal(data.courtId, "Q1");
    assert.equal(data.courtName, "Quadra 1");
    assert.equal(data.scheduleTime, "2026-08-16T13:00:00Z");
    assert.equal(data.dayKey, "2026-08-16");
    assert.deepEqual(data.checkIn, {
      teamA: {status: "present"},
      teamB: {status: "present"},
    });
  });

  it("recusa partida já encerrada (avanço de chave e ranking já rodaram)", async () => {
    const fake = new FakeFirestore();
    seedLiveMatch(fake, {
      tournamentId: "t5",
      matchId: "m5",
      managerId: "owner-5",
      status: "Completed",
    });

    await assertHttpsError(
      revertMatchToScheduledCore(db(fake), "owner-5", {matchId: "m5"}),
      "failed-precondition",
    );
    assert.equal(fake.store.get(`${matchesPath}/m5`)!.status, "Completed");
  });

  it("recusa partida que não está ao vivo (Scheduled ou Canceled)", async () => {
    const fake = new FakeFirestore();
    seedLiveMatch(fake, {
      tournamentId: "t6",
      matchId: "m6",
      managerId: "owner-6",
      status: "Scheduled",
    });
    seedLiveMatch(fake, {
      tournamentId: "t6",
      matchId: "m7",
      managerId: "owner-6",
      status: "Canceled",
    });

    await assertHttpsError(
      revertMatchToScheduledCore(db(fake), "owner-6", {matchId: "m6"}),
      "failed-precondition",
    );
    await assertHttpsError(
      revertMatchToScheduledCore(db(fake), "owner-6", {matchId: "m7"}),
      "failed-precondition",
    );
  });

  it("aceita o status legado em snake_case", async () => {
    const fake = new FakeFirestore();
    seedLiveMatch(fake, {
      tournamentId: "t7",
      matchId: "m8",
      managerId: "owner-7",
      status: "in_progress",
    });

    const result = await revertMatchToScheduledCore(db(fake), "owner-7", {matchId: "m8"});
    assert.equal(result.ok, true);
  });

  it("rejeita usuário sem permissão no torneio", async () => {
    const fake = new FakeFirestore();
    seedLiveMatch(fake, {tournamentId: "t8", matchId: "m9", managerId: "owner-8"});
    mockAuthUser({}); // sem claim admin/superAdmin e sem doc de staff

    await assertHttpsError(
      revertMatchToScheduledCore(db(fake), "intruso", {matchId: "m9"}),
      "permission-denied",
    );
    assert.equal(fake.store.get(`${matchesPath}/m9`)!.status, "In Progress");
  });

  it("rejeita matchId ausente", async () => {
    const fake = new FakeFirestore();
    seedLiveMatch(fake, {tournamentId: "t9", matchId: "m10", managerId: "owner-9"});

    await assertHttpsError(
      revertMatchToScheduledCore(db(fake), "owner-9", {}),
      "invalid-argument",
    );
  });
});
