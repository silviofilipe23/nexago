import {describe, it, afterEach} from "node:test";
import assert from "node:assert/strict";
import * as adminAuth from "firebase-admin/auth";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {updateLiveMatchScoreCore} from "./organizer-match-ops";
import {artifactsMatchesPath, getFirebaseProjectId} from "./firebase-paths";

/**
 * Testes de `updateLiveMatchScoreCore` (núcleo testável de `updateLiveMatchScore`,
 * sem o wrapper `onCall`). Reaproveita `FakeFirestore` (mesmo padrão dos testes
 * de `friendly-match-checkin.test.ts`). Como `assertCanScoreTournament` consulta
 * `getAuth().getUser(uid)` para papéis não-donos (staff/admin), fazemos monkey
 * patch de `getAuth` do módulo `firebase-admin/auth` — o build é CommonJS e o
 * pacote expõe `__esModule: true`, então o import de namespace aqui aponta para
 * o MESMO objeto de módulo usado internamente por `tournament-acl.ts`.
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

function seedTournamentAndMatch(
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
  });
  fake.seedDoc(`${matchesPath}/${opts.matchId}`, {
    tournamentId: opts.tournamentId,
    teamAId: "teamA",
    teamBId: "teamB",
    status: opts.status ?? "Scheduled",
    ...opts.matchOverrides,
  });
}

async function assertHttpsError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava HttpsError ${code}, veio ${err.code}`);
    return true;
  });
}

describe("updateLiveMatchScoreCore", () => {
  afterEach(() => {
    mockAuthUser({});
  });

  it("staff autorizado (role scorer) grava o placar ao vivo e marca In Progress", async () => {
    const fake = new FakeFirestore();
    seedTournamentAndMatch(fake, {tournamentId: "t1", matchId: "m1"});
    fake.seedDoc("tournaments/t1/staff/staff-1", {status: "active", role: "scorer"});
    mockAuthUser({}); // sem claim admin — precisa cair no doc de staff

    const result = await updateLiveMatchScoreCore(db(fake), "staff-1", {
      matchId: "m1",
      setsA: 1,
      setsB: 0,
      currentGamesA: 3,
      currentGamesB: 2,
    });
    assert.equal(result.ok, true);

    const data = fake.store.get(`${matchesPath}/m1`)!;
    assert.equal(data.status, "In Progress");
    assert.ok(data.matchStartedAt);
    const liveScore = data.liveScore as DocData;
    assert.equal(liveScore.setsA, 1);
    assert.equal(liveScore.setsB, 0);
    assert.equal(liveScore.currentGamesA, 3);
    assert.equal(liveScore.currentGamesB, 2);
    assert.ok(liveScore.updatedAt);

    // Sincroniza o contador de partidas ao vivo do torneio na primeira transição.
    assert.equal(fake.store.get("tournaments/t1")!.liveMatchesNow, 1);
  });

  it("dono do torneio (manager) também pode atualizar sem precisar de staff/claims", async () => {
    const fake = new FakeFirestore();
    seedTournamentAndMatch(fake, {
      tournamentId: "t2",
      matchId: "m2",
      managerId: "owner-2",
      status: "In Progress",
    });

    const result = await updateLiveMatchScoreCore(db(fake), "owner-2", {
      matchId: "m2",
      setsA: 0,
      setsB: 0,
      currentGamesA: 5,
      currentGamesB: 4,
    });
    assert.equal(result.ok, true);
    const liveScore = fake.store.get(`${matchesPath}/m2`)!.liveScore as DocData;
    assert.equal(liveScore.currentGamesA, 5);
    assert.equal(liveScore.currentGamesB, 4);
  });

  it("rejeita usuário não autorizado (nem dono, nem staff, nem admin)", async () => {
    const fake = new FakeFirestore();
    seedTournamentAndMatch(fake, {tournamentId: "t3", matchId: "m3"});
    mockAuthUser({}); // sem claim admin/superAdmin e sem doc de staff para "intruso"

    await assertHttpsError(
      updateLiveMatchScoreCore(db(fake), "intruso", {
        matchId: "m3",
        setsA: 0,
        setsB: 0,
        currentGamesA: 1,
        currentGamesB: 0,
      }),
      "permission-denied",
    );
  });

  it("rejeita quando a partida já está Completed", async () => {
    const fake = new FakeFirestore();
    seedTournamentAndMatch(fake, {
      tournamentId: "t4",
      matchId: "m4",
      managerId: "owner-4",
      status: "Completed",
    });

    await assertHttpsError(
      updateLiveMatchScoreCore(db(fake), "owner-4", {
        matchId: "m4",
        setsA: 2,
        setsB: 0,
        currentGamesA: 0,
        currentGamesB: 0,
      }),
      "failed-precondition",
    );
  });

  it("rejeita quando a partida já está Canceled", async () => {
    const fake = new FakeFirestore();
    seedTournamentAndMatch(fake, {
      tournamentId: "t5",
      matchId: "m5",
      managerId: "owner-5",
      status: "Canceled",
    });

    await assertHttpsError(
      updateLiveMatchScoreCore(db(fake), "owner-5", {
        matchId: "m5",
        setsA: 0,
        setsB: 0,
        currentGamesA: 0,
        currentGamesB: 0,
      }),
      "failed-precondition",
    );
  });

  it("rejeita matchId ausente e placar inválido", async () => {
    const fake = new FakeFirestore();
    seedTournamentAndMatch(fake, {tournamentId: "t6", matchId: "m6", managerId: "owner-6"});

    await assertHttpsError(
      updateLiveMatchScoreCore(db(fake), "owner-6", {
        setsA: 0,
        setsB: 0,
        currentGamesA: 0,
        currentGamesB: 0,
      }),
      "invalid-argument",
    );

    await assertHttpsError(
      updateLiveMatchScoreCore(db(fake), "owner-6", {
        matchId: "m6",
        setsA: -1,
        setsB: 0,
        currentGamesA: 0,
        currentGamesB: 0,
      }),
      "invalid-argument",
    );
  });
});
