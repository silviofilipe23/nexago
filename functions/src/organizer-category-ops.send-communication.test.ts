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
});
