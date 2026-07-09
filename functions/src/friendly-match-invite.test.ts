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

/** Envia um convite válido organizador→[toUids] e retorna o id criado. */
async function sendInvite(
  fake: FakeFirestore,
  nowMs: number,
  toUids: string[] = ["b"],
  overrides: Record<string, unknown> = {},
): Promise<string> {
  seedProfile(fake, "a");
  for (const toUid of toUids) seedProfile(fake, toUid);
  const result = await sendFriendlyMatchInviteCore(db(fake), "a", {
    toUids,
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

  it("cria o jogo 1:1 (slotsTotal=1) com slot invited, score por slot, expiração e história", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "filling");
    assert.equal(data.organizerUid, "a");
    assert.equal(data.slotsTotal, 1);
    assert.deepEqual(data.participantUids, ["a"]);
    assert.deepEqual(data.pendingSlotUids, ["b"]);
    const slots = data.slots as Array<Record<string, unknown>>;
    assert.equal(slots.length, 1);
    assert.equal(slots[0].uid, "b");
    assert.equal(slots[0].status, "invited");
    assert.ok((slots[0].scoreAtSend as number) > 0);
    assert.equal((slots[0].expiresAt as Timestamp).toMillis(), now + 24 * HOUR_MS);
    assert.equal((data.nextSlotExpiresAt as Timestamp).toMillis(), now + 24 * HOUR_MS);
    const history = data.history as Array<{status: string; actorUid: string}>;
    assert.equal(history.length, 1);
    assert.equal(history[0].status, "filling");
  });

  it("cria jogo com N vagas — uma notificação por convidado, todas invited", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    seedProfile(fake, "b");
    seedProfile(fake, "c");
    seedProfile(fake, "d");
    const result = await sendFriendlyMatchInviteCore(db(fake), "a", {
      toUids: ["b", "c", "d"],
      sport: "volei_praia",
      objective: "friendly",
      scheduledAtMs: now + 48 * HOUR_MS,
      location: {freeText: "Praia de Camburi"},
    }, now);
    const data = matchData(fake, result.matchId);
    assert.equal(data.slotsTotal, 3);
    assert.deepEqual(data.pendingSlotUids, ["b", "c", "d"]);
    assert.equal(result.notifications.length, 3);
    assert.deepEqual(result.notifications.map((n) => n.userId).sort(), ["b", "c", "d"]);
    assert.ok(result.notifications.every((n) => n.type === "friendly_match_invite"));
  });

  it("rejeita horários alternativos quando há mais de 1 convidado", async () => {
    const fake = new FakeFirestore();
    await assertHttpsError(
      sendInvite(fake, now, ["b", "c"], {alternativeTimesMs: [now + 50 * HOUR_MS]}),
      "invalid-argument",
    );
  });

  it("rejeita lista de convidados vazia, convite a si mesmo e duplicata na mesma lista", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    seedProfile(fake, "b");
    await assertHttpsError(sendInvite(fake, now, []), "invalid-argument");
    await assertHttpsError(sendInvite(fake, now, ["a"]), "invalid-argument");
    await assertHttpsError(sendInvite(fake, now, ["b", "b"]), "invalid-argument");
  });

  it("rejeita mais que MAX_INVITEES convidados", async () => {
    const fake = new FakeFirestore();
    const many = Array.from({length: 11}, (_, i) => `u${i}`);
    await assertHttpsError(sendInvite(fake, now, many), "invalid-argument");
  });

  it("rejeita destinatário sem perfil público", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {
        toUids: ["ghost"], sport: "volei_praia", objective: "friendly",
        scheduledAtMs: now + HOUR_MS, location: {freeText: "x"},
      }, now),
      "not-found",
    );
  });

  it("rejeita horário no passado, local vazio e mensagem longa", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    seedProfile(fake, "b");
    const valid = {
      toUids: ["b"], sport: "volei_praia", objective: "friendly" as const,
      scheduledAtMs: now + HOUR_MS, location: {freeText: "x"},
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
  });

  it("rejeita novo convite enquanto houver convite pendente entre organizador e convidado (nas duas direções)", async () => {
    const fake = new FakeFirestore();
    await sendInvite(fake, now, ["b"]);
    await assertHttpsError(sendInvite(fake, now, ["b"]), "failed-precondition");
    // Direção inversa também bloqueia: b tentando convidar a.
    seedProfile(fake, "b");
    seedProfile(fake, "a");
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "b", {
        toUids: ["a"], sport: "volei_praia", objective: "friendly",
        scheduledAtMs: now + HOUR_MS, location: {freeText: "x"},
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

  it("convidado contrapõe (1:1) → slot countered, guarda proposta e renova expiração", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    const later = now + 3 * HOUR_MS;
    const counterTime = now + 96 * HOUR_MS;
    const result = await counterFriendlyMatchInviteCore(db(fake), "b", {
      matchId, scheduledAtMs: counterTime, message: "Consigo só no fim de semana",
    }, later);
    const data = matchData(fake, matchId);
    const slots = data.slots as Array<Record<string, unknown>>;
    assert.equal(slots[0].status, "countered");
    const counter = slots[0].counterProposal as {scheduledAt: Timestamp; proposedByUid: string};
    assert.equal(counter.scheduledAt.toMillis(), counterTime);
    assert.equal(counter.proposedByUid, "b");
    assert.equal((slots[0].expiresAt as Timestamp).toMillis(), later + 24 * HOUR_MS);
    assert.deepEqual(data.pendingSlotUids, ["b"]);
    assert.equal(result.notifications[0].userId, "a");
    assert.equal(result.notifications[0].type, "friendly_match_countered");
  });

  it("só há uma rodada de contraproposta", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    await counterFriendlyMatchInviteCore(db(fake), "b", {matchId, scheduledAtMs: now + 96 * HOUR_MS}, now);
    await assertHttpsError(
      counterFriendlyMatchInviteCore(db(fake), "a", {matchId, scheduledAtMs: now + 120 * HOUR_MS}, now),
      "failed-precondition",
    );
  });

  it("rejeita contraproposta em jogo com mais de 1 vaga", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b", "c"]);
    await assertHttpsError(
      counterFriendlyMatchInviteCore(db(fake), "b", {matchId, scheduledAtMs: now + 96 * HOUR_MS}, now),
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
