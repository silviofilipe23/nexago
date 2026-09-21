import {describe, it, beforeEach} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import * as notificationDelivery from "./notification-delivery";
import {notifyMatchCalledToCourt} from "./organizer-match-ops";
import {artifactsTeamsPath, getFirebaseProjectId} from "./firebase-paths";

const PROJECT_ID = getFirebaseProjectId();
const TEAMS_PATH = artifactsTeamsPath(PROJECT_ID);

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

type SentNotification = {userId: string; title: string; body: string; type: string};
let sent: SentNotification[] = [];

function mockDeliver(): void {
  sent = [];
  (notificationDelivery as unknown as {
    deliverNotificationToUser: typeof notificationDelivery.deliverNotificationToUser;
  }).deliverNotificationToUser = async (input) => {
    sent.push({
      userId: input.userId,
      title: input.title,
      body: input.body,
      type: input.type,
    });
    return {sent: 1, failed: 0};
  };
}

async function callToCourt(fake: FakeFirestore, teamIds: unknown[]): Promise<void> {
  await notifyMatchCalledToCourt(db(fake), PROJECT_ID, {
    matchId: "m1",
    tournamentId: "t1",
    teamIds,
    courtId: "court-1",
    courtLabel: "Quadra 1",
  });
}

describe("notifyMatchCalledToCourt", () => {
  beforeEach(mockDeliver);

  it("chama o elenco COMPLETO do quarteto, não só os dois primeiros", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`${TEAMS_PATH}/team-a`, {
      teamSize: 4,
      memberUids: ["a1", "a2", "a3", "a4"],
      player1Id: "a1",
      player2Id: "a2",
    });

    await callToCourt(fake, ["team-a"]);

    assert.deepEqual(
      sent.map((n) => n.userId).sort(),
      ["a1", "a2", "a3", "a4"],
      "atleta do elenco ficou sem o aviso de ir para a quadra",
    );
    assert.equal(sent[0].type, "match_call");
    assert.equal(sent[0].body, "Sua partida foi chamada. Dirija-se à Quadra 1.");
  });

  it("notifica o elenco completo das DUAS equipes", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`${TEAMS_PATH}/team-a`, {memberUids: ["a1", "a2", "a3"]});
    fake.seedDoc(`${TEAMS_PATH}/team-b`, {memberUids: ["b1", "b2", "b3"]});

    await callToCourt(fake, ["team-a", "team-b"]);

    assert.deepEqual(
      sent.map((n) => n.userId).sort(),
      ["a1", "a2", "a3", "b1", "b2", "b3"],
    );
  });

  it("equipe legada sem memberUids ainda notifica player1/player2", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`${TEAMS_PATH}/team-a`, {player1Id: "a1", player2Id: "a2"});

    await callToCourt(fake, ["team-a"]);

    assert.deepEqual(sent.map((n) => n.userId).sort(), ["a1", "a2"]);
  });

  it("equipe inexistente não impede o aviso da outra", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`${TEAMS_PATH}/team-b`, {memberUids: ["b1", "b2"]});

    await callToCourt(fake, ["team-sumida", "team-b", "", null]);

    assert.deepEqual(sent.map((n) => n.userId).sort(), ["b1", "b2"]);
  });
});
