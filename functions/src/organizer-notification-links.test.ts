import {describe, it, afterEach} from "node:test";
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {join, resolve} from "node:path";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import * as notificationDelivery from "./notification-delivery";
import {
  ORGANIZER_WALLET_NOTIFICATION_LINKS,
  organizerTournamentNotificationLinks,
} from "./organizer-notification-links";
import {notifyOrganizersPaymentDeclared} from "./tournament-registration-pix";

/**
 * Regressão: o push "Pagamento a conferir" (`tournament_payment_declared`) mandava
 * `url: /painel/eventos/{id}/inscricoes` — rota do PORTAL do organizador. O app navega pro
 * `url` como está, então no celular do organizador o toque abria uma rota inexistente.
 */

const TOURNAMENT_ID = "torneio-1";
const REGISTRATION_ID = "insc-1";

type DeliverInput = Parameters<typeof notificationDelivery.deliverNotificationToUser>[0];

function stubDeliver(fn: typeof notificationDelivery.deliverNotificationToUser): void {
  (notificationDelivery as unknown as {
    deliverNotificationToUser: typeof notificationDelivery.deliverNotificationToUser;
  }).deliverNotificationToUser = fn;
}

describe("organizerTournamentNotificationLinks", () => {
  it("url é a rota do torneio no app; webUrl é a lista de inscrições do portal", () => {
    assert.deepEqual(organizerTournamentNotificationLinks(TOURNAMENT_ID), {
      url: `/organizer/tournaments/${TOURNAMENT_ID}`,
      webUrl: `/painel/eventos/${TOURNAMENT_ID}/inscricoes`,
    });
  });

  it("a inscrição em foco só vai pro portal — a rota do app não tem esse parâmetro", () => {
    assert.deepEqual(organizerTournamentNotificationLinks(TOURNAMENT_ID, REGISTRATION_ID), {
      url: `/organizer/tournaments/${TOURNAMENT_ID}`,
      webUrl: `/painel/eventos/${TOURNAMENT_ID}/inscricoes?registrationId=${REGISTRATION_ID}`,
    });
  });

  it("carteira: /organizer/wallet no app, /painel/financeiro no portal", () => {
    assert.deepEqual(ORGANIZER_WALLET_NOTIFICATION_LINKS, {
      url: "/organizer/wallet",
      webUrl: "/painel/financeiro",
    });
  });
});

describe("notifyOrganizersPaymentDeclared", () => {
  afterEach(() => stubDeliver(async () => ({sent: 0, failed: 0})));

  it("dono e staff gestor recebem a rota do app em `url` e a do portal em `webUrl`", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`tournaments/${TOURNAMENT_ID}/staff/staff-1`, {
      status: "active",
      role: "manager",
    });
    const delivered: DeliverInput[] = [];
    stubDeliver(async (input) => {
      delivered.push(input);
      return {sent: 1, failed: 0};
    });

    await notifyOrganizersPaymentDeclared({
      db: fake as unknown as Firestore,
      registrationId: REGISTRATION_ID,
      tournamentId: TOURNAMENT_ID,
      tournamentData: {
        managerId: "dono-1",
        categories: [{id: "cat-1", categoryName: "Misto Iniciante"}],
      },
      categoryId: "cat-1",
      teamName: "Ana e Bia",
    });

    assert.deepEqual(delivered.map((d) => d.userId).sort(), ["dono-1", "staff-1"]);
    for (const input of delivered) {
      assert.equal(input.type, "tournament_payment_declared");
      assert.deepEqual(input.data, {
        tournamentId: TOURNAMENT_ID,
        registrationId: REGISTRATION_ID,
        categoryId: "cat-1",
        url: `/organizer/tournaments/${TOURNAMENT_ID}`,
        webUrl: `/painel/eventos/${TOURNAMENT_ID}/inscricoes`,
      });
    }
  });
});

describe("notificações não mandam rota de portal em `url`", () => {
  // O app (FCM + inbox) navega pro `url` como está. Caminho de portal vai em `webUrl`.
  // `/admin/...` é do admin web antigo e `/arena/calendar` a agenda antiga: nenhum existe no app.
  const PORTAL_URL = /\burl:\s*[`"'](\/painel\b|\/admin\/|\/arena\/calendar\b)/;

  it("nenhum `url:` em functions/src aponta pra rota de portal", () => {
    // Roda de `lib/`; o fonte fica ao lado.
    const srcDir = resolve(__dirname, "..", "src");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
        readFileSync(path, "utf8").split("\n").forEach((line, i) => {
          if (PORTAL_URL.test(line)) offenders.push(`${path}:${i + 1}: ${line.trim()}`);
        });
      }
    };
    walk(srcDir);

    assert.deepEqual(offenders, []);
  });
});
