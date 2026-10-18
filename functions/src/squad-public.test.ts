import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {buildSquadPublic, publicUserPart, samePublicUserPart} from "./squad-public";
import {
  onAthleteRankingWrittenSyncSquadPublic,
  onSquadAmbassadorWrittenSyncPublic,
  onUserWrittenSyncSquadPublic,
  syncSquadPublic,
} from "./squad-public-sync";

process.env.GCLOUD_PROJECT = "p";

const NOW = new Date("2026-10-17T15:00:00Z");

function contract(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    athleteId: "joao", displayName: "João Victor", city: "Goiânia", state: "GO", arenaName: "Arena Errejota",
    tier: "amb", code: "JOAO10", slug: "joao10", commissionPct: 10, followerDiscountPct: 10, rulesVersion: 3,
    status: "active", start: new Date("2026-09-08T12:00:00Z"), end: new Date("2026-12-06T23:59:59-03:00"),
    amendments: [], inviteId: "inv1", cycleId: "piloto",
    ...over,
  };
}

function user(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fullName: "João Victor Alves", email: "joao@x.com", phone: "+5562999990000", birthDate: "1998-02-01",
    profilePhotoUrl: "https://cdn/joao.jpg", city: "Goiânia", state: "GO", mainArenaName: "Arena Errejota",
    primarySport: "beachTennis", sandRank: {trackIndex: 10, xp: 4300}, lastActiveAt: NOW,
    ...over,
  };
}

describe("buildSquadPublic", () => {
  it("leva só dados esportivos e o código — nada de dinheiro, contrato ou contato", () => {
    const out = buildSquadPublic({contract: contract(), user: user(), ranking: {tournamentsCount: 12, totalPoints: 900}})!;
    assert.deepEqual(out, {
      name: "João Victor Alves", photoUrl: "https://cdn/joao.jpg", tier: "amb", code: "JOAO10",
      city: "Goiânia", state: "GO", arenaName: "Arena Errejota", sport: "beachTennis",
      elo: "Elite II", eloIndex: 10, tournaments: 12,
    });
  });

  it("só contrato ativo aparece: pausado, encerrado, sem código válido ou nível estranho ficam fora", () => {
    const base = {user: user(), ranking: null};
    assert.equal(buildSquadPublic({...base, contract: contract({status: "paused"})}), null);
    assert.equal(buildSquadPublic({...base, contract: contract({status: "ended"})}), null);
    assert.equal(buildSquadPublic({...base, contract: contract({code: "jo"})}), null);
    assert.equal(buildSquadPublic({...base, contract: contract({tier: "vip"})}), null);
    assert.equal(buildSquadPublic({...base, contract: null}), null);
  });

  it("conta apagada sai da página", () => {
    assert.equal(buildSquadPublic({contract: contract(), user: null, ranking: null}), null);
  });

  it("cidade e arena caem para o retrato do contrato; nome cai para o do contrato", () => {
    const out = buildSquadPublic({
      contract: contract(),
      user: {sandRank: {trackIndex: 3}},
      ranking: null,
    })!;
    assert.equal(out.name, "João Victor");
    assert.equal(out.city, "Goiânia");
    assert.equal(out.arenaName, "Arena Errejota");
    assert.equal(out.photoUrl, null);
    assert.equal(out.elo, "Competidor III");
    assert.equal(out.tournaments, null);
  });

  it("perfil privado: fica o papel e o código, sem foto, esporte nem números", () => {
    const out = buildSquadPublic({
      contract: contract(),
      user: user({privacyPreferences: {profileVisibility: "private"}}),
      ranking: {tournamentsCount: 12},
    })!;
    assert.equal(out.code, "JOAO10");
    assert.equal(out.photoUrl, null);
    assert.equal(out.sport, null);
    assert.equal(out.elo, null);
    assert.equal(out.tournaments, null);
  });

  it("conquistas e nível escondidos: sai sem Elo e torneios, mantém a foto", () => {
    const out = buildSquadPublic({
      contract: contract(),
      user: user({privacyPreferences: {profileVisibility: "public", showOthers: {achievementsAndLevel: false}}}),
      ranking: {tournamentsCount: 12},
    })!;
    assert.equal(out.photoUrl, "https://cdn/joao.jpg");
    assert.equal(out.elo, null);
    assert.equal(out.eloIndex, null);
    assert.equal(out.tournaments, null);
  });

  it("foto só com http(s) e elo fora da escada vira nulo", () => {
    const out = buildSquadPublic({
      contract: contract(),
      user: user({profilePhotoUrl: "gs://bucket/x.jpg", photoURL: "javascript:alert(1)", sandRank: {trackIndex: 99}}),
      ranking: {tournamentsCount: -1},
    })!;
    assert.equal(out.photoUrl, null);
    assert.equal(out.elo, null);
    assert.equal(out.tournaments, null);
  });
});

describe("publicUserPart (impressão digital do gatilho de users)", () => {
  it("escrita que não mexe na página é igual — último acesso, xp dentro do mesmo elo, e-mail", () => {
    const a = publicUserPart(user());
    const b = publicUserPart(user({lastActiveAt: new Date(), email: "outro@x.com", sandRank: {trackIndex: 10, xp: 4500}}));
    assert.ok(samePublicUserPart(a, b));
  });

  it("foto, elo, cidade e privacidade mudam a impressão", () => {
    const a = publicUserPart(user());
    assert.ok(!samePublicUserPart(a, publicUserPart(user({profilePhotoUrl: "https://cdn/nova.jpg"}))));
    assert.ok(!samePublicUserPart(a, publicUserPart(user({sandRank: {trackIndex: 11}}))));
    assert.ok(!samePublicUserPart(a, publicUserPart(user({city: "Brasília"}))));
    assert.ok(!samePublicUserPart(a, publicUserPart(user({privacyPreferences: {profileVisibility: "private"}}))));
    assert.ok(!samePublicUserPart(a, null));
  });
});

describe("syncSquadPublic", () => {
  function setup() {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    fake.seedDoc("users/joao", user());
    fake.seedDoc("artifacts/p/public/data/athleteRankings/joao", {tournamentsCount: 12});
    return {fake, db};
  }

  it("contrato ativo grava o espelho, sem nenhum campo de dinheiro", async () => {
    const {fake, db} = setup();
    fake.seedDoc("squadAmbassadors/joao", contract());
    assert.equal(await syncSquadPublic(db, "joao", {now: NOW}), "set");
    const doc = fake.store.get("squadPublic/joao")!;
    assert.equal(doc["code"], "JOAO10");
    assert.equal(doc["tournaments"], 12);
    for (const key of Object.keys(doc)) {
      assert.ok(!/pct|cents|commission|discount|score|roi|rules|email|phone/i.test(key), `campo vazado: ${key}`);
    }
  });

  it("contrato pausado apaga o espelho", async () => {
    const {fake, db} = setup();
    fake.seedDoc("squadAmbassadors/joao", contract({status: "paused"}));
    fake.seedDoc("squadPublic/joao", {code: "JOAO10"});
    assert.equal(await syncSquadPublic(db, "joao"), "deleted");
    assert.equal(fake.store.has("squadPublic/joao"), false);
  });

  it("gatilhos de perfil/ranking não tocam em quem não é embaixador", async () => {
    const {fake, db} = setup();
    assert.equal(await syncSquadPublic(db, "joao", {onlyIfAmbassador: true}), "skipped");
    assert.equal(fake.store.has("squadPublic/joao"), false);
  });

  it("conta apagada de embaixador ativo some da página mesmo pelo gatilho de perfil", async () => {
    const {fake, db} = setup();
    fake.seedDoc("squadAmbassadors/joao", contract());
    fake.seedDoc("squadPublic/joao", {code: "JOAO10"});
    fake.store.delete("users/joao");
    assert.equal(await syncSquadPublic(db, "joao", {onlyIfAmbassador: true}), "deleted");
    assert.equal(fake.store.has("squadPublic/joao"), false);
  });
});

describe("fiação dos gatilhos", () => {
  // O deploy lê o `__endpoint`; caminho errado aqui passa por todo teste de função pura.
  const pathOf = (fn: unknown) =>
    (fn as {__endpoint: {eventTrigger: {eventFilterPathPatterns: {document: string}}}})
      .__endpoint.eventTrigger.eventFilterPathPatterns.document;

  it("ouve o contrato, o perfil e o ranking do atleta", () => {
    assert.equal(pathOf(onSquadAmbassadorWrittenSyncPublic), "squadAmbassadors/{uid}");
    assert.equal(pathOf(onUserWrittenSyncSquadPublic), "users/{uid}");
    assert.equal(pathOf(onAthleteRankingWrittenSyncSquadPublic), "artifacts/{appId}/public/data/athleteRankings/{uid}");
  });
});
