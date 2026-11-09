import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import * as notificationDelivery from "./notification-delivery";
import {
  blogPushMessage,
  blogPushRecipients,
  estimateBlogPushReachCore,
  matchesAudience,
  normalizeCity,
  sendBlogPushCore,
  shouldSendBlogPush,
} from "./blog-push";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function athlete(over: Record<string, unknown> = {}) {
  return {
    roles: ["athlete"],
    email: "atleta@gmail.com",
    city: "Goiânia",
    sportOnboarding: {levelsBySport: {beach_volleyball: 3}},
    ...over,
  };
}

/** Atleta com aparelho no build `build` (sem build = só o perfil). */
function seedAthlete(fake: FakeFirestore, uid: string, over: Record<string, unknown> = {}, build: number | null = 118) {
  fake.store.set(`users/${uid}`, athlete(over));
  if (build !== null) fake.store.set(`users/${uid}/tokens/t-${uid}`, {token: `tok-${uid}`, buildNumber: build});
}

describe("normalizeCity", () => {
  it("ignora acento, caixa e espaço", () => {
    assert.equal(normalizeCity("  Goiânia "), "goiania");
    assert.equal(normalizeCity("SÃO  paulo"), "sao paulo");
  });
});

describe("matchesAudience", () => {
  it("filtra por cidade e esporte (chave do nível pelo appId ou pelo code)", () => {
    assert.equal(matchesAudience(athlete(), {city: "goiania", sport: "beachVolleyball"}), true);
    assert.equal(matchesAudience(athlete(), {city: "Anápolis", sport: "all"}), false);
    assert.equal(matchesAudience(athlete(), {city: null, sport: "beachTennis"}), false);
    assert.equal(
      matchesAudience(athlete({sportOnboarding: {levelsBySport: {beachTennis: 2}}}), {city: null, sport: "beachTennis"}),
      true,
    );
  });

  it("deixa de fora quem não é atleta e conta de teste", () => {
    assert.equal(matchesAudience(athlete({roles: ["arena"]}), {city: null, sport: "all"}), false);
    assert.equal(matchesAudience(athlete({seedTestAthlete: true}), {city: null, sport: "all"}), false);
    assert.equal(matchesAudience(athlete({email: "qa@nexago.test"}), {city: null, sport: "all"}), false);
  });
});

describe("blogPushRecipients", () => {
  it("todo atleta do filtro, com ou sem aparelho e em qualquer build; fora só quem silenciou a categoria", async () => {
    const {fake, db} = makeDb();
    seedAthlete(fake, "ok");
    seedAthlete(fake, "old-app", {}, 110);
    seedAthlete(fake, "no-device", {}, null);
    seedAthlete(fake, "muted");
    fake.store.set("blogNotifyPrefs/muted", {muted: ["torneios"]});
    seedAthlete(fake, "muted-other");
    fake.store.set("blogNotifyPrefs/muted-other", {muted: ["loja"]});
    seedAthlete(fake, "push-off", {notificationPreferences: {channels: {push: false}}});
    seedAthlete(fake, "other-city", {city: "Anápolis"});
    seedAthlete(fake, "seed", {seedTestAthlete: true});
    fake.store.set("users/arena", {roles: ["arena"], email: "arena@gmail.com"});

    const got = await blogPushRecipients(db, {city: "Goiânia", sport: "all"}, "torneios");
    assert.deepEqual(got.sort((a, b) => a.uid.localeCompare(b.uid)), [
      {uid: "muted-other", push: true},
      {uid: "no-device", push: true},
      {uid: "ok", push: true},
      {uid: "old-app", push: true},
      // Desligou o push nas Configurações: só o item na lista de notificações do app.
      {uid: "push-off", push: false},
    ]);
  });

  it("sem filtro, avisa todos os atletas", async () => {
    const {fake, db} = makeDb();
    seedAthlete(fake, "a");
    seedAthlete(fake, "b", {city: "Anápolis", sportOnboarding: {}}, null);
    const got = await blogPushRecipients(db, {city: null, sport: "all"}, "treino");
    assert.deepEqual(got.map((r) => r.uid).sort(), ["a", "b"]);
  });
});

describe("estimateBlogPushReachCore", () => {
  it("separa os avisados no app dos que recebem push no celular e lista as cidades", async () => {
    const {fake, db} = makeDb();
    seedAthlete(fake, "a");
    seedAthlete(fake, "b", {}, null);
    seedAthlete(fake, "c", {city: "Anápolis"});
    seedAthlete(fake, "d", {city: "goiania "}, null);
    seedAthlete(fake, "e", {notificationPreferences: {channels: {push: false}}});
    const reach = await estimateBlogPushReachCore(db, {city: "Goiânia", sport: "all"}, "treino");
    assert.equal(reach.athletes, 4);
    assert.equal(reach.reachable, 1);
    assert.deepEqual(reach.cities, [{city: "Goiânia", count: 4}, {city: "Anápolis", count: 1}]);
  });
});

describe("shouldSendBlogPush", () => {
  const live = {status: "published", push: {enabled: true}, channels: {app: true}, pushSentAt: null};

  it("envia quando o post vai ao ar no app, com ou sem a chave antiga do editor", () => {
    assert.equal(shouldSendBlogPush({status: "scheduled"}, live), true);
    assert.equal(shouldSendBlogPush(undefined, live), true);
    assert.equal(shouldSendBlogPush({status: "draft"}, {...live, push: {enabled: false}}), true);
    assert.equal(shouldSendBlogPush({status: "draft"}, {...live, push: undefined}), true);
  });

  it("não reenvia nem envia fora do app", () => {
    assert.equal(shouldSendBlogPush({status: "published"}, live), false);
    assert.equal(shouldSendBlogPush({status: "draft"}, {...live, pushSentAt: "x"}), false);
    assert.equal(shouldSendBlogPush({status: "draft"}, {...live, channels: {app: false}}), false);
    assert.equal(shouldSendBlogPush({status: "draft"}, {...live, status: "scheduled"}), false);
  });
});

describe("blogPushMessage", () => {
  it("usa a linha fina e cai nos minutos sem ela", () => {
    assert.deepEqual(blogPushMessage({title: "T", subtitle: "S"}), {title: "T", body: "S"});
    assert.deepEqual(blogPushMessage({title: "T", subtitle: "", readMinutes: 3}), {
      title: "T",
      body: "3 min de leitura no blog do nexaGO",
    });
  });
});

describe("sendBlogPushCore", () => {
  it("avisa todos uma vez: push só para quem deixou ligado, item no app para todos", async () => {
    const {fake, db} = makeDb();
    seedAthlete(fake, "ok");
    seedAthlete(fake, "no-device", {}, null);
    seedAthlete(fake, "push-off", {notificationPreferences: {channels: {push: false}}});
    seedAthlete(fake, "muted");
    fake.store.set("blogNotifyPrefs/muted", {muted: ["torneios"]});
    fake.store.set("blogPosts/p1", {
      status: "published",
      title: "Liga nexaGO",
      subtitle: "Tudo sobre a 2ª etapa",
      category: "torneios",
      channels: {app: true},
      push: {enabled: false, city: null, sport: "all"},
    });
    const calls: Array<{userId: string; skipPush?: boolean; url: unknown}> = [];
    (notificationDelivery as unknown as {
      deliverNotificationToUser: typeof notificationDelivery.deliverNotificationToUser;
    }).deliverNotificationToUser = async ({userId, skipPush, data}) => {
      calls.push({userId, skipPush, url: data?.["url"]});
      return {sent: userId === "ok" ? 1 : 0, failed: 0};
    };

    const now = new Date("2026-11-09T12:00:00Z");
    assert.deepEqual(await sendBlogPushCore(db, "p1", now), {recipients: 3, sent: 1});
    assert.deepEqual(calls.sort((a, b) => a.userId.localeCompare(b.userId)), [
      {userId: "no-device", skipPush: false, url: "/athlete/blog/p1"},
      {userId: "ok", skipPush: false, url: "/athlete/blog/p1"},
      {userId: "push-off", skipPush: true, url: "/athlete/blog/p1"},
    ]);
    assert.equal((fake.store.get("blogPosts/p1")!["pushResult"] as {recipients: number}).recipients, 3);
    // Segunda chamada (gatilho repetido): nada sai de novo.
    assert.equal(await sendBlogPushCore(db, "p1", now), null);
    assert.equal(calls.length, 3);
  });
});
