import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {
  acceptFriendlyMatchInviteCore,
  cancelFriendlyMatchCore,
  counterFriendlyMatchInviteCore,
  declineFriendlyMatchInviteCore,
  sendFriendlyMatchInviteCore,
} from "./friendly-match-invite";

const HOUR_MS = 60 * 60 * 1000;

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedProfile(fake: FakeFirestore, uid: string, overrides: DocData = {}): void {
  fake.seedDoc(`public_profiles/${uid}`, {
    fullName: `Atleta ${uid}`,
    city: "Vitória",
    state: "ES",
    sportOnboarding: {levelsBySport: {volei_praia: "intermediario_1"}},
    ...overrides,
  });
}

/** Envia um convite válido de a→b e retorna o id criado. */
async function sendInvite(
  fake: FakeFirestore,
  nowMs: number,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  seedProfile(fake, "a");
  seedProfile(fake, "b");
  const result = await sendFriendlyMatchInviteCore(db(fake), "a", {
    toUid: "b",
    sport: "volei_praia",
    objective: "friendly",
    scheduledAtMs: nowMs + 48 * HOUR_MS,
    location: {arenaId: "arena1", arenaName: "Arena Teste"},
    ...overrides,
  }, nowMs);
  return result.matchId;
}

function matchData(fake: FakeFirestore, matchId: string): DocData {
  const data = fake.store.get(`friendlyMatches/${matchId}`);
  assert.ok(data, "doc do match deveria existir");
  return data;
}

async function assertHttpsError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava HttpsError ${code}, veio ${err.code}`);
    return true;
  });
}

describe("sendFriendlyMatchInviteCore", () => {
  const now = Date.UTC(2026, 6, 10, 12, 0, 0);

  it("cria o convite com estado sent, score congelado, expiração e história", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "sent");
    assert.equal(data.fromUid, "a");
    assert.equal(data.toUid, "b");
    assert.deepEqual(data.participantUids, ["a", "b"]);
    assert.equal(typeof data.scoreAtSend, "number");
    assert.ok((data.scoreAtSend as number) > 0);
    assert.ok(data.scoreBreakdown != null);
    assert.equal((data.expiresAt as Timestamp).toMillis(), now + 24 * HOUR_MS);
    const history = data.history as Array<{status: string; actorUid: string}>;
    assert.equal(history.length, 1);
    assert.equal(history[0].status, "sent");
    assert.equal(history[0].actorUid, "a");
  });

  it("notifica o destinatário com tipo friendly_match_invite e matchId", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    seedProfile(fake, "b");
    const result = await sendFriendlyMatchInviteCore(db(fake), "a", {
      toUid: "b",
      sport: "volei_praia",
      objective: "friendly",
      scheduledAtMs: now + 48 * HOUR_MS,
      location: {freeText: "Praia de Camburi"},
    }, now);
    assert.equal(result.notifications.length, 1);
    const notification = result.notifications[0];
    assert.equal(notification.userId, "b");
    assert.equal(notification.type, "friendly_match_invite");
    assert.equal(notification.data.matchId, result.matchId);
  });

  it("rejeita convite para si mesmo", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {
        toUid: "a",
        sport: "volei_praia",
        objective: "friendly",
        scheduledAtMs: now + HOUR_MS,
        location: {freeText: "x"},
      }, now),
      "invalid-argument",
    );
  });

  it("rejeita destinatário sem perfil público", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {
        toUid: "ghost",
        sport: "volei_praia",
        objective: "friendly",
        scheduledAtMs: now + HOUR_MS,
        location: {freeText: "x"},
      }, now),
      "not-found",
    );
  });

  it("rejeita horário no passado, local vazio, mensagem longa e mais de 2 alternativas", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    seedProfile(fake, "b");
    const valid = {
      toUid: "b",
      sport: "volei_praia",
      objective: "friendly" as const,
      scheduledAtMs: now + HOUR_MS,
      location: {freeText: "x"},
    };
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {...valid, scheduledAtMs: now - 1}, now),
      "invalid-argument",
    );
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {...valid, location: {}}, now),
      "invalid-argument",
    );
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {...valid, message: "x".repeat(301)}, now),
      "invalid-argument",
    );
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {
        ...valid,
        alternativeTimesMs: [now + HOUR_MS, now + 2 * HOUR_MS, now + 3 * HOUR_MS],
      }, now),
      "invalid-argument",
    );
  });

  it("rejeita novo convite enquanto houver convite pendente entre o par (nas duas direções)", async () => {
    const fake = new FakeFirestore();
    await sendInvite(fake, now);
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {
        toUid: "b",
        sport: "volei_praia",
        objective: "friendly",
        scheduledAtMs: now + HOUR_MS,
        location: {freeText: "x"},
      }, now),
      "failed-precondition",
    );
    // Direção inversa também bloqueia.
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "b", {
        toUid: "a",
        sport: "volei_praia",
        objective: "friendly",
        scheduledAtMs: now + HOUR_MS,
        location: {freeText: "x"},
      }, now),
      "failed-precondition",
    );
  });
});

describe("acceptFriendlyMatchInviteCore", () => {
  const now = Date.UTC(2026, 6, 10, 12, 0, 0);

  it("destinatário aceita convite sent → confirmed com janelas derivadas e notificação", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    const scheduled = now + 48 * HOUR_MS;
    const result = await acceptFriendlyMatchInviteCore(db(fake), "b", {matchId}, now);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "confirmed");
    assert.equal((data.confirmedTime as Timestamp).toMillis(), scheduled);
    assert.equal((data.checkInOpenAt as Timestamp).toMillis(), scheduled - 30 * 60 * 1000);
    assert.equal((data.checkInCloseAt as Timestamp).toMillis(), scheduled + 24 * HOUR_MS);
    assert.equal((data.reminder24hAt as Timestamp).toMillis(), scheduled - 24 * HOUR_MS);
    const history = data.history as Array<{status: string}>;
    assert.equal(history.length, 2);
    assert.equal(result.notifications[0].userId, "a");
    assert.equal(result.notifications[0].type, "friendly_match_confirmed");
  });

  it("aceita escolhendo um horário alternativo proposto; horário fora da proposta é rejeitado", async () => {
    const fake = new FakeFirestore();
    const alt = now + 72 * HOUR_MS;
    const matchId = await sendInvite(fake, now, {alternativeTimesMs: [alt]});
    await assertHttpsError(
      acceptFriendlyMatchInviteCore(db(fake), "b", {matchId, chosenTimeMs: now + 99 * HOUR_MS}, now),
      "invalid-argument",
    );
    await acceptFriendlyMatchInviteCore(db(fake), "b", {matchId, chosenTimeMs: alt}, now);
    assert.equal((matchData(fake, matchId).confirmedTime as Timestamp).toMillis(), alt);
  });

  it("apenas o destinatário pode aceitar convite sent", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    await assertHttpsError(
      acceptFriendlyMatchInviteCore(db(fake), "a", {matchId}, now),
      "permission-denied",
    );
    await assertHttpsError(
      acceptFriendlyMatchInviteCore(db(fake), "intruso", {matchId}, now),
      "permission-denied",
    );
  });

  it("convite vencido vira expired no aceite e a chamada falha", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    const late = now + 25 * HOUR_MS;
    await assertHttpsError(
      acceptFriendlyMatchInviteCore(db(fake), "b", {matchId}, late),
      "failed-precondition",
    );
    assert.equal(matchData(fake, matchId).status, "expired");
  });

  it("aceite duplo falha na segunda vez", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    await acceptFriendlyMatchInviteCore(db(fake), "b", {matchId}, now);
    await assertHttpsError(
      acceptFriendlyMatchInviteCore(db(fake), "b", {matchId}, now),
      "failed-precondition",
    );
  });

  it("após contraproposta, é o remetente quem aceita (o horário da contraproposta)", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    const counterTime = now + 96 * HOUR_MS;
    await counterFriendlyMatchInviteCore(db(fake), "b", {
      matchId,
      scheduledAtMs: counterTime,
    }, now);
    // Destinatário não pode aceitar a própria contraproposta.
    await assertHttpsError(
      acceptFriendlyMatchInviteCore(db(fake), "b", {matchId}, now),
      "permission-denied",
    );
    await acceptFriendlyMatchInviteCore(db(fake), "a", {matchId}, now);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "confirmed");
    assert.equal((data.confirmedTime as Timestamp).toMillis(), counterTime);
  });
});

describe("declineFriendlyMatchInviteCore", () => {
  const now = Date.UTC(2026, 6, 10, 12, 0, 0);

  it("destinatário recusa sent → declined e notifica remetente", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    const result = await declineFriendlyMatchInviteCore(db(fake), "b", {matchId}, now);
    assert.equal(matchData(fake, matchId).status, "declined");
    assert.equal(result.notifications[0].userId, "a");
    assert.equal(result.notifications[0].type, "friendly_match_declined");
  });

  it("remetente recusa contraproposta → declined", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    await counterFriendlyMatchInviteCore(db(fake), "b", {
      matchId,
      scheduledAtMs: now + 96 * HOUR_MS,
    }, now);
    await declineFriendlyMatchInviteCore(db(fake), "a", {matchId}, now);
    assert.equal(matchData(fake, matchId).status, "declined");
  });

  it("remetente não pode recusar o próprio convite sent", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    await assertHttpsError(
      declineFriendlyMatchInviteCore(db(fake), "a", {matchId}, now),
      "permission-denied",
    );
  });
});

describe("counterFriendlyMatchInviteCore", () => {
  const now = Date.UTC(2026, 6, 10, 12, 0, 0);

  it("destinatário contrapõe sent → countered, guarda proposta e renova expiração", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    const later = now + 3 * HOUR_MS;
    const counterTime = now + 96 * HOUR_MS;
    const result = await counterFriendlyMatchInviteCore(db(fake), "b", {
      matchId,
      scheduledAtMs: counterTime,
      message: "Consigo só no fim de semana",
    }, later);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "countered");
    const counter = data.counterProposal as {scheduledAt: Timestamp; proposedByUid: string};
    assert.equal(counter.scheduledAt.toMillis(), counterTime);
    assert.equal(counter.proposedByUid, "b");
    assert.equal((data.expiresAt as Timestamp).toMillis(), later + 24 * HOUR_MS);
    assert.equal(result.notifications[0].userId, "a");
    assert.equal(result.notifications[0].type, "friendly_match_countered");
  });

  it("só há uma rodada de contraproposta", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    await counterFriendlyMatchInviteCore(db(fake), "b", {
      matchId,
      scheduledAtMs: now + 96 * HOUR_MS,
    }, now);
    await assertHttpsError(
      counterFriendlyMatchInviteCore(db(fake), "a", {
        matchId,
        scheduledAtMs: now + 120 * HOUR_MS,
      }, now),
      "failed-precondition",
    );
  });
});

describe("cancelFriendlyMatchCore", () => {
  const now = Date.UTC(2026, 6, 10, 12, 0, 0);

  it("remetente retira convite sent → cancelled sem penalidade", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    const result = await cancelFriendlyMatchCore(db(fake), "a", {matchId}, now);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "cancelled");
    assert.equal(data.cancelPenalized, false);
    assert.equal(result.notifications[0].userId, "b");
    assert.equal(result.notifications[0].type, "friendly_match_cancelled");
  });

  it("destinatário não cancela convite sent (ele recusa)", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    await assertHttpsError(
      cancelFriendlyMatchCore(db(fake), "b", {matchId}, now),
      "permission-denied",
    );
  });

  it("qualquer participante cancela jogo confirmado; com antecedência não penaliza", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now); // jogo em now+48h
    await acceptFriendlyMatchInviteCore(db(fake), "b", {matchId}, now);
    await cancelFriendlyMatchCore(db(fake), "b", {matchId}, now + HOUR_MS);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "cancelled");
    assert.equal(data.cancelPenalized, false);
    assert.equal(data.cancelledByUid, "b");
  });

  it("cancelar a menos de 6h do jogo marca cancelPenalized e penaliza a reputação", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now); // jogo em now+48h
    await acceptFriendlyMatchInviteCore(db(fake), "b", {matchId}, now);
    await cancelFriendlyMatchCore(db(fake), "a", {matchId}, now + 44 * HOUR_MS);
    const data = matchData(fake, matchId);
    assert.equal(data.cancelPenalized, true);
    assert.equal(data.cancelledByUid, "a");
    // Evento de reputação late_cancel aplicado a quem cancelou em cima da hora.
    assert.ok(fake.store.get(`users/a/reputationEvents/late_cancel_${matchId}`));
    const summary = fake.store.get("users/a/reputation/summary")!;
    assert.equal(summary.lateCancellations, 1);
    // O outro lado não é penalizado.
    assert.equal(fake.store.get("users/b/reputation/summary"), undefined);
  });

  it("não cancela jogo já encerrado", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now);
    await declineFriendlyMatchInviteCore(db(fake), "b", {matchId}, now);
    await assertHttpsError(
      cancelFriendlyMatchCore(db(fake), "a", {matchId}, now),
      "failed-precondition",
    );
  });
});
