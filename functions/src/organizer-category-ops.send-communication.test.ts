import {describe, it, afterEach} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import * as notificationDelivery from "./notification-delivery";
import {sendCategoryCommunicationCore} from "./organizer-category-ops";
import {artifactsInscriptionsPath, artifactsTeamsPath} from "./firebase-paths";

/**
 * Regressão do bug relatado em produção: o organizador via "Aviso enviado"
 * mesmo quando um atleta não tinha nenhum token FCM registrado (push nunca
 * chegou). `sendCategoryCommunication` incrementava `pushCount` incondicional
 * para cada destinatário, ignorando o retorno real de `deliverNotificationToUser`.
 */

const PROJECT_ID = "test-project";
const TOURNAMENT_ID = "t1";
const CATEGORY_ID = "cat-1";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function mockDeliverNotificationToUser(
  perUser: Record<string, {sent: number; failed: number}>,
): void {
  (notificationDelivery as unknown as {
    deliverNotificationToUser: typeof notificationDelivery.deliverNotificationToUser;
  }).deliverNotificationToUser = async ({userId}) =>
    perUser[userId] ?? {sent: 0, failed: 0};
}

function seedScenario(fake: FakeFirestore): void {
  fake.seedDoc(`tournaments/${TOURNAMENT_ID}`, {managerId: "owner-1", name: "Copa Areia"});
  fake.seedDoc(`${artifactsTeamsPath(PROJECT_ID)}/team-a`, {player1Id: "atleta-com-push", player2Id: "atleta-sem-token"});
  fake.seedDoc(`${artifactsInscriptionsPath(PROJECT_ID)}/insc-a`, {
    tournamentId: TOURNAMENT_ID,
    categoryId: CATEGORY_ID,
    teamId: "team-a",
    isPaid: true,
  });
  fake.seedDoc("users/atleta-com-push", {phoneNumber: ""});
  fake.seedDoc("users/atleta-sem-token", {phoneNumber: ""});
}

describe("sendCategoryCommunicationCore", () => {
  afterEach(() => {
    mockDeliverNotificationToUser({});
  });

  it("não conta como enviado um atleta sem canal de push disponível", async () => {
    const fake = new FakeFirestore();
    seedScenario(fake);
    mockDeliverNotificationToUser({
      "atleta-com-push": {sent: 2, failed: 0},
      "atleta-sem-token": {sent: 0, failed: 0},
    });

    const result = await sendCategoryCommunicationCore(
      db(fake),
      "owner-1",
      {tournamentId: TOURNAMENT_ID, categoryId: CATEGORY_ID, message: "Jogos remarcados"},
      PROJECT_ID,
    );

    assert.equal(result.pushCount, 1, "só 1 dos 2 atletas recebeu de fato o push");
    assert.equal(result.pushNoChannel, 1, "o outro atleta não tinha token/subscription nenhum");
    assert.equal(result.pushFailed, 0);
  });

  it("distingue falha de envio (havia canal, FCM rejeitou) de ausência de canal", async () => {
    const fake = new FakeFirestore();
    seedScenario(fake);
    mockDeliverNotificationToUser({
      "atleta-com-push": {sent: 0, failed: 1},
      "atleta-sem-token": {sent: 0, failed: 0},
    });

    const result = await sendCategoryCommunicationCore(
      db(fake),
      "owner-1",
      {tournamentId: TOURNAMENT_ID, categoryId: CATEGORY_ID, message: "Jogos remarcados"},
      PROJECT_ID,
    );

    assert.equal(result.pushCount, 0);
    assert.equal(result.pushFailed, 1);
    assert.equal(result.pushNoChannel, 1);
  });

  it("conta todos como enviados quando a entrega é bem-sucedida (caminho feliz)", async () => {
    const fake = new FakeFirestore();
    seedScenario(fake);
    mockDeliverNotificationToUser({
      "atleta-com-push": {sent: 2, failed: 0},
      "atleta-sem-token": {sent: 1, failed: 0},
    });

    const result = await sendCategoryCommunicationCore(
      db(fake),
      "owner-1",
      {tournamentId: TOURNAMENT_ID, categoryId: CATEGORY_ID, message: "Jogos remarcados"},
      PROJECT_ID,
    );

    assert.equal(result.pushCount, 2);
    assert.equal(result.pushNoChannel, 0);
    assert.equal(result.pushFailed, 0);
  });

  it("persiste o envio em tournaments/{id}/categoryCommunications com as contagens reais", async () => {
    const fake = new FakeFirestore();
    seedScenario(fake);
    mockDeliverNotificationToUser({
      "atleta-com-push": {sent: 2, failed: 0},
      "atleta-sem-token": {sent: 0, failed: 0},
    });

    await sendCategoryCommunicationCore(
      db(fake),
      "owner-1",
      {
        tournamentId: TOURNAMENT_ID,
        categoryId: CATEGORY_ID,
        message: "Jogos remarcados",
        audience: "all",
        sendPush: true,
      },
      PROJECT_ID,
    );

    const persisted = [...fake.store.entries()].filter(([path]) =>
      path.startsWith(`tournaments/${TOURNAMENT_ID}/categoryCommunications/`),
    );
    assert.equal(persisted.length, 1, "esperava 1 doc de histórico persistido");
    const [, data] = persisted[0]!;
    assert.equal(data.categoryId, CATEGORY_ID);
    assert.equal(data.message, "Jogos remarcados");
    assert.equal(data.audience, "all");
    assert.equal(data.sendPush, true);
    assert.equal(data.pushCount, 1);
    assert.equal(data.pushNoChannel, 1);
    assert.equal(data.pushFailed, 0);
    assert.equal(data.createdBy, "owner-1");
    assert.ok("createdAt" in data, "esperava createdAt (server timestamp sentinel)");
  });

  it("falha ao gravar histórico não impede o retorno normal (best-effort)", async () => {
    const fake = new FakeFirestore();
    seedScenario(fake);
    mockDeliverNotificationToUser({
      "atleta-com-push": {sent: 2, failed: 0},
      "atleta-sem-token": {sent: 0, failed: 0},
    });
    const originalCollection = fake.collection.bind(fake);
    (fake as unknown as {collection: typeof fake.collection}).collection = (path: string) => {
      if (path === `tournaments/${TOURNAMENT_ID}/categoryCommunications`) {
        return {
          ...originalCollection(path),
          add: async () => {
            throw new Error("Firestore indisponível");
          },
        };
      }
      return originalCollection(path);
    };

    const result = await sendCategoryCommunicationCore(
      db(fake),
      "owner-1",
      {tournamentId: TOURNAMENT_ID, categoryId: CATEGORY_ID, message: "Jogos remarcados"},
      PROJECT_ID,
    );

    assert.equal(result.pushCount, 1);
    assert.equal(result.pushNoChannel, 1);
  });
});

/**
 * Cobertura dos furos de alcance encontrados na revisão da aba Comunicação:
 * o broadcast lia só `player1Id`/`player2Id` do time (deixando de fora os
 * integrantes 3+ de trio/quarteto/quinteto), pulava a inscrição que ainda não
 * tem equipe (reserva solo aguardando dupla) e, com o push desligado, não
 * deixava rastro nenhum pro atleta — nem o inbox era gravado.
 */

interface RecordedDelivery {
  userId: string;
  skipPush: boolean;
}

function recordDeliveries(
  perUser: Record<string, {sent: number; failed: number}>,
): RecordedDelivery[] {
  const calls: RecordedDelivery[] = [];
  (notificationDelivery as unknown as {
    deliverNotificationToUser: typeof notificationDelivery.deliverNotificationToUser;
  }).deliverNotificationToUser = async ({userId, skipPush}) => {
    calls.push({userId, skipPush: skipPush === true});
    return perUser[userId] ?? {sent: 0, failed: 0};
  };
  return calls;
}

describe("sendCategoryCommunicationCore — alcance do broadcast", () => {
  afterEach(() => {
    mockDeliverNotificationToUser({});
  });

  it("avisa todos os integrantes de trio/quarteto (memberUids), não só os dois primeiros", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`tournaments/${TOURNAMENT_ID}`, {managerId: "owner-1"});
    fake.seedDoc(`${artifactsTeamsPath(PROJECT_ID)}/team-trio`, {
      memberUids: ["trio-1", "trio-2", "trio-3"],
      player1Id: "trio-1",
      player2Id: "trio-2",
    });
    fake.seedDoc(`${artifactsInscriptionsPath(PROJECT_ID)}/insc-trio`, {
      tournamentId: TOURNAMENT_ID,
      categoryId: CATEGORY_ID,
      teamId: "team-trio",
      isPaid: true,
    });
    const calls = recordDeliveries({
      "trio-1": {sent: 1, failed: 0},
      "trio-2": {sent: 1, failed: 0},
      "trio-3": {sent: 1, failed: 0},
    });

    const result = await sendCategoryCommunicationCore(
      db(fake),
      "owner-1",
      {tournamentId: TOURNAMENT_ID, categoryId: CATEGORY_ID, message: "Chegue 30min antes"},
      PROJECT_ID,
    );

    assert.deepEqual(
      calls.map((c) => c.userId).sort(),
      ["trio-1", "trio-2", "trio-3"],
      "o terceiro integrante também tem de receber o aviso",
    );
    assert.equal(result.pushCount, 3);
  });

  it("avisa o inscrito solo que ainda não tem equipe formada", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`tournaments/${TOURNAMENT_ID}`, {managerId: "owner-1"});
    fake.seedDoc(`${artifactsInscriptionsPath(PROJECT_ID)}/insc-solo`, {
      tournamentId: TOURNAMENT_ID,
      categoryId: CATEGORY_ID,
      player1Id: "solo-1",
      participantUids: ["solo-1"],
      isPaid: false,
    });
    fake.seedDoc("users/solo-1", {phoneNumber: "11999998888"});
    const calls = recordDeliveries({"solo-1": {sent: 1, failed: 0}});

    const result = await sendCategoryCommunicationCore(
      db(fake),
      "owner-1",
      {
        tournamentId: TOURNAMENT_ID,
        categoryId: CATEGORY_ID,
        message: "Ainda falta sua dupla",
        audience: "pending",
      },
      PROJECT_ID,
    );

    assert.deepEqual(calls.map((c) => c.userId), ["solo-1"]);
    assert.equal(result.pushCount, 1);
    assert.equal(
      result.whatsappLinks.length,
      1,
      "o link de WhatsApp da reserva solo também tem de sair",
    );
  });

  it("mantém chave única de destinatário quando há mais de uma reserva solo", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`tournaments/${TOURNAMENT_ID}`, {managerId: "owner-1"});
    for (const uid of ["solo-a", "solo-b"]) {
      fake.seedDoc(`${artifactsInscriptionsPath(PROJECT_ID)}/insc-${uid}`, {
        tournamentId: TOURNAMENT_ID,
        categoryId: CATEGORY_ID,
        player1Id: uid,
        isPaid: false,
      });
      fake.seedDoc(`users/${uid}`, {phoneNumber: "11999998888"});
    }
    recordDeliveries({});

    const result = await sendCategoryCommunicationCore(
      db(fake),
      "owner-1",
      {tournamentId: TOURNAMENT_ID, categoryId: CATEGORY_ID, message: "Aviso"},
      PROJECT_ID,
    );

    const keys = result.whatsappLinks.map((t) => t.teamId);
    assert.equal(keys.length, 2, "as duas reservas solo têm de aparecer");
    assert.equal(new Set(keys).size, keys.length, "chaves repetidas quebram o @for do painel");
    assert.ok(!keys.includes(""), "chave vazia repetiria entre reservas solo");
  });

  it("grava o inbox do atleta mesmo com o push desligado", async () => {
    const fake = new FakeFirestore();
    seedScenario(fake);
    const calls = recordDeliveries({});

    const result = await sendCategoryCommunicationCore(
      db(fake),
      "owner-1",
      {
        tournamentId: TOURNAMENT_ID,
        categoryId: CATEGORY_ID,
        message: "Só WhatsApp",
        sendPush: false,
      },
      PROJECT_ID,
    );

    assert.deepEqual(
      calls,
      [
        {userId: "atleta-com-push", skipPush: true},
        {userId: "atleta-sem-token", skipPush: true},
      ],
      "sem push o aviso ainda tem de virar notificação no app (skipPush grava só o inbox)",
    );
    assert.equal(result.pushCount, 0);
    assert.equal(result.pushNoChannel, 0, "push desligado não conta como canal ausente");
    assert.equal(result.pushFailed, 0);
  });

  it("leva o destino do torneio no payload pra notificação ser clicável", async () => {
    const fake = new FakeFirestore();
    seedScenario(fake);
    const payloads: Array<Record<string, string>> = [];
    (notificationDelivery as unknown as {
      deliverNotificationToUser: typeof notificationDelivery.deliverNotificationToUser;
    }).deliverNotificationToUser = async ({data}) => {
      payloads.push(data);
      return {sent: 1, failed: 0};
    };

    await sendCategoryCommunicationCore(
      db(fake),
      "owner-1",
      {tournamentId: TOURNAMENT_ID, categoryId: CATEGORY_ID, message: "Aviso"},
      PROJECT_ID,
    );

    assert.ok(payloads.length > 0);
    for (const payload of payloads) {
      assert.equal(payload.url, `/torneios/${TOURNAMENT_ID}`);
      assert.equal(payload.tournamentId, TOURNAMENT_ID);
      assert.equal(payload.categoryId, CATEGORY_ID);
    }
  });
});
