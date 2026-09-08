import {describe, it, afterEach} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import * as notificationDelivery from "./notification-delivery";
import {resolveCategoryLabel} from "./tournament-registration-guards";
import {notifyBracketPublishedAthletes} from "./organizer-category-ops-bracket-notify";
import {artifactsTeamsPath} from "./firebase-paths";

/**
 * Regressão do bug visto no torneio `w5KCjCB8YiYHSUktpAFt` (dev): o push de
 * "chave publicada" chegava ao atleta como "A chave de 1788520058062 foi
 * publicada" — o id interno da categoria no lugar do nome.
 *
 * Causa: `generateCategoryBracket` procurava a categoria casando SÓ por
 * `categoryName`, mas o portal manda `categoryId: cat.id`. A busca nunca
 * achava nada e o rótulo caía na própria chave crua.
 */

const PROJECT_ID = "test-project";
const TOURNAMENT_ID = "w5KCjCB8YiYHSUktpAFt";
const CATEGORY_ID = "1788520058062";
const CATEGORY_NAME = "Misto Iniciante 2";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

describe("resolveCategoryLabel", () => {
  it("acha a categoria pelo `id` e devolve o nome, não a chave crua", () => {
    const tournament = {
      categories: [{id: CATEGORY_ID, categoryName: CATEGORY_NAME}],
    };

    assert.equal(resolveCategoryLabel(tournament, CATEGORY_ID), CATEGORY_NAME);
  });

  it("segue achando pelo nome no torneio legado, onde a categoria não tem `id`", () => {
    const tournament = {categories: [{categoryName: CATEGORY_NAME}]};

    assert.equal(resolveCategoryLabel(tournament, CATEGORY_NAME), CATEGORY_NAME);
  });

  it("prefere o `label` explícito da categoria ao `categoryName`", () => {
    const tournament = {
      categories: [
        {id: CATEGORY_ID, categoryName: CATEGORY_NAME, label: "Misto Iniciante 2 (sábado)"},
      ],
    };

    assert.equal(
      resolveCategoryLabel(tournament, CATEGORY_ID),
      "Misto Iniciante 2 (sábado)",
    );
  });

  it("cai na própria chave quando a categoria não está mais no torneio", () => {
    const tournament = {categories: [{id: "outra", categoryName: "Feminino A"}]};

    assert.equal(resolveCategoryLabel(tournament, CATEGORY_ID), CATEGORY_ID);
  });
});

describe("notifyBracketPublishedAthletes", () => {
  afterEach(() => {
    (notificationDelivery as unknown as {
      deliverNotificationToUser: typeof notificationDelivery.deliverNotificationToUser;
    }).deliverNotificationToUser = async () => ({sent: 0, failed: 0});
  });

  it("o push avisa o atleta com o NOME da categoria, não com o id interno", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`${artifactsTeamsPath(PROJECT_ID)}/team-a`, {
      player1Id: "atleta-1",
      player2Id: "atleta-2",
    });
    const tournament = {
      categories: [{id: CATEGORY_ID, categoryName: CATEGORY_NAME}],
    };
    const bodies: string[] = [];
    (notificationDelivery as unknown as {
      deliverNotificationToUser: typeof notificationDelivery.deliverNotificationToUser;
    }).deliverNotificationToUser = async ({body}) => {
      bodies.push(body);
      return {sent: 1, failed: 0};
    };

    const notified = await notifyBracketPublishedAthletes({
      db: db(fake),
      projectId: PROJECT_ID,
      tournamentId: TOURNAMENT_ID,
      categoryId: CATEGORY_ID,
      categoryLabel: resolveCategoryLabel(tournament, CATEGORY_ID),
      format: "groups_knockout",
      teamIds: ["team-a"],
      teamsPath: (teamId) => `${artifactsTeamsPath(PROJECT_ID)}/${teamId}`,
    });

    assert.equal(notified, 2);
    assert.deepEqual(bodies, [
      `A chave de ${CATEGORY_NAME} foi publicada. Confira como ficou.`,
      `A chave de ${CATEGORY_NAME} foi publicada. Confira como ficou.`,
    ]);
    for (const body of bodies) {
      assert.ok(
        !body.includes(CATEGORY_ID),
        "o id interno da categoria não pode vazar no texto do push",
      );
    }
  });
});
