import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  BLOG_PUSH_MIN_BUILD_DEFAULT,
  blogPushMessage,
  blogPushMinBuild,
  blogPushRecipients,
  estimateBlogPushReachCore,
  matchesAudience,
  normalizeCity,
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
  it("só quem tem o app com o blog, não silenciou a categoria e não desligou o push", async () => {
    const {fake, db} = makeDb();
    seedAthlete(fake, "ok");
    seedAthlete(fake, "old-app", {}, 117);
    seedAthlete(fake, "no-device", {}, null);
    seedAthlete(fake, "muted");
    fake.store.set("blogNotifyPrefs/muted", {muted: ["torneios"]});
    seedAthlete(fake, "muted-other");
    fake.store.set("blogNotifyPrefs/muted-other", {muted: ["loja"]});
    seedAthlete(fake, "push-off", {notificationPreferences: {channels: {push: false}}});
    seedAthlete(fake, "other-city", {city: "Anápolis"});

    const uids = await blogPushRecipients(db, {city: "Goiânia", sport: "all"}, "torneios", 118);
    assert.deepEqual(uids.sort(), ["muted-other", "ok"]);
  });
});

describe("blogPushMinBuild", () => {
  it("lê appConfig/blog e cai no padrão sem doc", async () => {
    const {fake, db} = makeDb();
    assert.equal(await blogPushMinBuild(db), BLOG_PUSH_MIN_BUILD_DEFAULT);
    fake.store.set("appConfig/blog", {pushMinBuild: 120});
    assert.equal(await blogPushMinBuild(db), 120);
  });
});

describe("estimateBlogPushReachCore", () => {
  it("separa quem recebe de quem está no filtro e lista as cidades", async () => {
    const {fake, db} = makeDb();
    seedAthlete(fake, "a");
    seedAthlete(fake, "b", {}, null);
    seedAthlete(fake, "c", {city: "Anápolis"});
    seedAthlete(fake, "d", {city: "goiania "}, null);
    const reach = await estimateBlogPushReachCore(db, {city: "Goiânia", sport: "all"}, "treino");
    assert.equal(reach.reachable, 1);
    assert.equal(reach.athletes, 3);
    assert.deepEqual(reach.cities, [{city: "Goiânia", count: 3}, {city: "Anápolis", count: 1}]);
  });
});

describe("shouldSendBlogPush", () => {
  const live = {status: "published", push: {enabled: true}, channels: {app: true}, pushSentAt: null};

  it("envia quando o post vai ao ar com push ligado", () => {
    assert.equal(shouldSendBlogPush({status: "scheduled"}, live), true);
    assert.equal(shouldSendBlogPush(undefined, live), true);
  });

  it("não reenvia, não envia sem push nem fora do app", () => {
    assert.equal(shouldSendBlogPush({status: "published"}, live), false);
    assert.equal(shouldSendBlogPush({status: "draft"}, {...live, pushSentAt: "x"}), false);
    assert.equal(shouldSendBlogPush({status: "draft"}, {...live, push: {enabled: false}}), false);
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
