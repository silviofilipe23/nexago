import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  MAX_CAMPAIGN_BANNERS,
  campaignsErrors,
  isBannerLink,
  saveCampaignsCore,
  type CampaignBannerInput,
} from "./store-campaigns";
import {buildShowcaseConfig} from "./store-showcase";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Ana Souza"};
const NOW = new Date("2026-10-17T12:00:00Z");

function banner(over: Partial<CampaignBannerInput> = {}): CampaignBannerInput {
  return {
    id: "verao-26",
    kicker: "COLEÇÃO VERÃO 26",
    title: " Equipamento de quem joga na areia ",
    subtitle: "Bolas, vestuário UV e acessórios testados no circuito NexaGO.",
    imageUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/store%2Fcampaigns%2Fa.jpg?alt=media",
    primary: {label: "Ver coleção", collectionId: "verao-2026"},
    secondary: {label: "Kits pra arena", categoryId: "kits", url: null},
    startDate: "2026-10-01",
    endDate: "2026-12-31",
    active: true,
    ...over,
  };
}

function fieldsOf(err: unknown): string[] {
  return ((err as {details?: {fields?: string[]}}).details?.fields) ?? [];
}

describe("campaignsErrors", () => {
  it("aceita o banner do desenho e a lista vazia", () => {
    assert.deepEqual(campaignsErrors({banners: [banner()], version: 0}), []);
    assert.deepEqual(campaignsErrors({banners: [], version: 3}), []);
  });

  it("título até 50, subtítulo até 90, título obrigatório", () => {
    const errors = campaignsErrors({
      banners: [
        banner({title: "x".repeat(51)}),
        banner({id: "b2", title: "   ", subtitle: "y".repeat(91)}),
        banner({id: "b3", title: "x".repeat(50), subtitle: "y".repeat(90)}),
      ],
      version: 0,
    });
    assert.deepEqual(errors, ["banners.0.title", "banners.1.title", "banners.1.subtitle"]);
  });

  it("coleção e categoria precisam existir na vitrine", () => {
    const errors = campaignsErrors({
      banners: [
        banner({primary: {label: "Ver", collectionId: "inverno-2030"}}),
        banner({id: "b2", secondary: {label: "Ver", categoryId: "raquetes", url: null}}),
      ],
      version: 0,
    });
    assert.deepEqual(errors, ["banners.0.primary.collectionId", "banners.1.secondary.categoryId"]);
  });

  it("CTA secundário leva categoria OU link, nunca os dois nem nenhum", () => {
    const errors = campaignsErrors({
      banners: [
        banner({secondary: {label: "Ver", categoryId: "kits", url: "/torneios"}}),
        banner({id: "b2", secondary: {label: "Ver", categoryId: null, url: null}}),
        banner({id: "b3", secondary: {label: "Ver torneios", categoryId: null, url: "/torneios"}}),
        banner({id: "b4", secondary: null}),
      ],
      version: 0,
    });
    assert.deepEqual(errors, ["banners.0.secondary.target", "banners.1.secondary.target"]);
  });

  it("link: caminho do portal ou https; nada de http, javascript: ou //host", () => {
    assert.equal(isBannerLink("/torneios?esporte=volei"), true);
    assert.equal(isBannerLink("https://nexago.com.br/loja"), true);
    assert.equal(isBannerLink("http://nexago.com.br"), false);
    assert.equal(isBannerLink("javascript:alert(1)"), false);
    assert.equal(isBannerLink("//evil.com"), false);
    assert.equal(isBannerLink("/com espaço"), false);
    assert.deepEqual(
      campaignsErrors({banners: [banner({imageUrl: "http://x.com/a.jpg"})], version: 0}),
      ["banners.0.imageUrl"],
    );
  });

  it("datas civis válidas e fim não antes do início", () => {
    const errors = campaignsErrors({
      banners: [
        banner({startDate: "2026-12-01", endDate: "2026-11-30"}),
        banner({id: "b2", startDate: "17/10/2026", endDate: null}),
        banner({id: "b3", startDate: null, endDate: "2026-02-30x"}),
        banner({id: "b4", startDate: "2026-10-17", endDate: "2026-10-17"}),
        banner({id: "b5", startDate: null, endDate: null}),
      ],
      version: 0,
    });
    assert.deepEqual(errors, ["banners.0.endDate", "banners.1.startDate", "banners.2.endDate"]);
  });

  it("id legível, único na lista; teto de banners", () => {
    assert.deepEqual(
      campaignsErrors({banners: [banner(), banner({id: "Verão 26"}), banner()], version: 0}),
      ["banners.1.id", "banners.2.id"],
    );
    const many = Array.from({length: MAX_CAMPAIGN_BANNERS + 1}, (_, i) => banner({id: `b${i}`}));
    assert.deepEqual(campaignsErrors({banners: many, version: 0}), ["banners"]);
    assert.deepEqual(campaignsErrors({banners: "x" as unknown as CampaignBannerInput[], version: -1}), [
      "version",
      "banners",
    ]);
  });
});

describe("saveCampaignsCore", () => {
  it("grava a lista na ordem dada, normalizada, com versão e autor", async () => {
    const {fake, db} = makeDb();
    const result = await saveCampaignsCore(
      db,
      {banners: [banner({id: "b"}), banner({id: "a", active: false, secondary: null})], version: 0},
      ACTOR,
      NOW,
    );

    assert.equal(result.version, 1);
    const doc = fake.store.get("storeConfig/campaigns")!;
    const saved = doc["banners"] as Array<Record<string, unknown>>;
    assert.deepEqual(saved.map((b) => b["id"]), ["b", "a"]);
    assert.equal(saved[0]["title"], "Equipamento de quem joga na areia");
    assert.equal(saved[1]["active"], false);
    assert.equal(saved[1]["secondary"], null);
    assert.equal(doc["version"], 1);
    assert.deepEqual(doc["updatedBy"], ACTOR);
    assert.deepEqual(doc["updatedAt"], NOW);
  });

  it("o que grava é o que a vitrine publica: inativo fica de fora, ordem mantida", async () => {
    const {fake, db} = makeDb();
    await saveCampaignsCore(
      db,
      {banners: [banner({id: "c"}), banner({id: "pausado", active: false}), banner({id: "a"})], version: 0},
      ACTOR,
      NOW,
    );
    const published = buildShowcaseConfig({
      discounts: null,
      returns: null,
      campaigns: fake.store.get("storeConfig/campaigns")!,
      pickupPoints: [],
      arenas: new Map(),
    });
    assert.deepEqual(published.banners.map((b) => b.id), ["c", "a"]);
    assert.deepEqual(published.banners[0].secondary, {label: "Kits pra arena", categoryId: "kits", url: null});
  });

  it("recusa versão velha: outra pessoa salvou no meio", async () => {
    const {fake, db} = makeDb();
    fake.store.set("storeConfig/campaigns", {banners: [], version: 4, updatedBy: {uid: "x", name: "Beto"}});
    await assert.rejects(saveCampaignsCore(db, {banners: [banner()], version: 3}, ACTOR, NOW), {
      code: "failed-precondition",
    });
    const ok = await saveCampaignsCore(db, {banners: [banner()], version: 4}, ACTOR, NOW);
    assert.equal(ok.version, 5);
  });

  it("doc gravado pelo script (sem version) vale como versão 0", async () => {
    const {fake, db} = makeDb();
    fake.store.set("storeConfig/campaigns", {banners: [banner()]});
    const ok = await saveCampaignsCore(db, {banners: [], version: 0}, ACTOR, NOW);
    assert.equal(ok.version, 1);
    assert.deepEqual(fake.store.get("storeConfig/campaigns")!["banners"], []);
  });

  it("dado inválido não grava nada e devolve os campos", async () => {
    const {fake, db} = makeDb();
    await assert.rejects(
      saveCampaignsCore(db, {banners: [banner({title: ""})], version: 0}, ACTOR, NOW),
      (err: unknown) => {
        assert.equal((err as {code?: string}).code, "invalid-argument");
        assert.deepEqual(fieldsOf(err), ["banners.0.title"]);
        return true;
      },
    );
    assert.equal(fake.store.has("storeConfig/campaigns"), false);
  });
});
