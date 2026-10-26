import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  MAX_HOME_BANNERS,
  homeBannerStatDeltas,
  homeBannersErrors,
  publicHomeBanners,
  saveHomeBannersCore,
  type HomeBannerInput,
} from "./home-banners";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Ana Souza"};
// 26/10 às 9h em São Paulo.
const NOW = new Date("2026-10-26T12:00:00Z");

function banner(over: Partial<HomeBannerInput> = {}): HomeBannerInput {
  return {
    id: "bora-jogar",
    format: "carousel",
    title: " Bora Jogar ",
    description: "Monte o jogo e chame a galera em 1 toque.",
    ctaLabel: "Montar jogo",
    imageUrl: "https://firebasestorage.googleapis.com/v0/b/x/o/app%2Fhome-banners%2Fa.png?alt=media",
    destination: "bora-jogar",
    url: null,
    audience: "all",
    startDate: "2026-10-20",
    endDate: "2026-11-20",
    hideAfterClick: true,
    dismissible: true,
    published: true,
    active: true,
    ...over,
  };
}

function fieldsOf(err: unknown): string[] {
  return ((err as {details?: {fields?: string[]}}).details?.fields) ?? [];
}

describe("homeBannersErrors", () => {
  it("aceita o banner do desenho e a lista vazia", () => {
    assert.deepEqual(homeBannersErrors({banners: [banner()], version: 0}), []);
    assert.deepEqual(homeBannersErrors({banners: [], version: 4}), []);
  });

  it("título até 22, descrição até 60, botão até 16", () => {
    const errors = homeBannersErrors({
      banners: [
        banner({title: "x".repeat(23)}),
        banner({id: "b2", description: "y".repeat(61), ctaLabel: "z".repeat(17)}),
        banner({id: "b3", title: "x".repeat(22), description: "y".repeat(60), ctaLabel: "z".repeat(16)}),
      ],
      version: 0,
    });
    assert.deepEqual(errors, ["banners.0.title", "banners.1.description", "banners.1.ctaLabel"]);
  });

  it("publicado exige textos; rascunho pode ficar incompleto", () => {
    const empty = {title: "", description: "", ctaLabel: ""};
    assert.deepEqual(homeBannersErrors({banners: [banner(empty)], version: 0}), [
      "banners.0.title",
      "banners.0.description",
      "banners.0.ctaLabel",
    ]);
    assert.deepEqual(homeBannersErrors({banners: [banner({...empty, published: false})], version: 0}), []);
  });

  it("compacto não tem botão: texto vazio vale mesmo publicado", () => {
    assert.deepEqual(homeBannersErrors({banners: [banner({format: "compact", ctaLabel: ""})], version: 0}), []);
  });

  it("link externo: https obrigatório ao publicar; nos outros destinos, nada de link", () => {
    const errors = homeBannersErrors({
      banners: [
        banner({destination: "url", url: null}),
        banner({id: "b2", destination: "url", url: "http://nexago.app"}),
        banner({id: "b3", destination: "url", url: null, published: false}),
        banner({id: "b4", destination: "url", url: "https://nexago.app/novidades"}),
        banner({id: "b5", destination: "ranking", url: "https://nexago.app"}),
      ],
      version: 0,
    });
    assert.deepEqual(errors, ["banners.0.url", "banners.1.url", "banners.4.url"]);
  });

  it("destino, público e formato só da lista", () => {
    const errors = homeBannersErrors({
      banners: [
        banner({destination: "radar" as never}),
        banner({id: "b2", audience: "inativos" as never, format: "story" as never}),
      ],
      version: 0,
    });
    assert.deepEqual(errors, ["banners.0.destination", "banners.1.format", "banners.1.audience"]);
  });

  it("fim antes do início, id repetido ou malformado e teto da lista", () => {
    const errors = homeBannersErrors({
      banners: [banner({startDate: "2026-11-01", endDate: "2026-10-01"}), banner(), banner({id: "Bora Jogar"})],
      version: 0,
    });
    assert.deepEqual(errors, ["banners.0.endDate", "banners.1.id", "banners.2.id"]);
    const many = Array.from({length: MAX_HOME_BANNERS + 1}, (_, i) => banner({id: `b${i}`}));
    assert.deepEqual(homeBannersErrors({banners: many, version: 0}), ["banners"]);
  });
});

describe("publicHomeBanners", () => {
  it("vai ao app só publicado, ativo e não encerrado — agendado vai junto, sem os estados", () => {
    const list = [
      banner({id: "no-ar"}),
      banner({id: "rascunho", published: false}),
      banner({id: "pausado", active: false}),
      banner({id: "encerrado", endDate: "2026-10-25"}),
      banner({id: "agendado", startDate: "2026-11-01", endDate: null}),
      banner({id: "acaba-hoje", endDate: "2026-10-26"}),
    ];
    const out = publicHomeBanners(list, "2026-10-26");
    assert.deepEqual(out.map((b) => b.id), ["no-ar", "agendado", "acaba-hoje"]);
    assert.equal("published" in out[0]!, false);
    assert.equal("active" in out[0]!, false);
  });
});

describe("saveHomeBannersCore", () => {
  it("grava a fonte e o espelho do app na mesma versão, textos aparados", async () => {
    const {fake, db} = makeDb();
    const result = await saveHomeBannersCore(
      db,
      {banners: [banner(), banner({id: "loja", destination: "loja", published: false})], version: 0},
      ACTOR,
      NOW,
    );
    assert.equal(result.version, 1);
    assert.equal(result.banners[0]!.title, "Bora Jogar");

    const source = fake.store.get("appAdminConfig/homeBanners")!;
    assert.equal(source["version"], 1);
    assert.deepEqual(source["updatedBy"], ACTOR);
    assert.equal((source["banners"] as unknown[]).length, 2);

    const mirror = fake.store.get("appConfig/homeBanners")!;
    assert.equal(mirror["version"], 1);
    assert.deepEqual((mirror["banners"] as Array<{id: string}>).map((b) => b.id), ["bora-jogar"]);
  });

  it("versão velha (outra pessoa salvou) é recusada sem tocar em nada", async () => {
    const {fake, db} = makeDb();
    await saveHomeBannersCore(db, {banners: [banner()], version: 0}, ACTOR, NOW);
    await assert.rejects(
      saveHomeBannersCore(db, {banners: [], version: 0}, ACTOR, NOW),
      (err: unknown) => (err as {code?: string}).code === "failed-precondition",
    );
    assert.equal((fake.store.get("appConfig/homeBanners")!["banners"] as unknown[]).length, 1);
  });

  it("dado inválido devolve os campos", async () => {
    const {db} = makeDb();
    await assert.rejects(
      saveHomeBannersCore(db, {banners: [banner({title: ""})], version: 0}, ACTOR, NOW),
      (err: unknown) => fieldsOf(err).includes("banners.0.title"),
    );
  });
});

describe("homeBannerStatDeltas", () => {
  it("conta cada marca uma vez, quando ela aparece", () => {
    const t = new Date();
    assert.deepEqual(homeBannerStatDeltas(undefined, {seenAt: t}), ["seen"]);
    assert.deepEqual(homeBannerStatDeltas({seenAt: t}, {seenAt: t, clickedAt: t}), ["clicked"]);
    assert.deepEqual(homeBannerStatDeltas({seenAt: t}, {seenAt: t, dismissedAt: t}), ["dismissed"]);
    assert.deepEqual(homeBannerStatDeltas(undefined, {seenAt: t, clickedAt: t}), ["seen", "clicked"]);
  });

  it("regravar a mesma marca ou apagar o doc não conta", () => {
    const t = new Date();
    assert.deepEqual(homeBannerStatDeltas({seenAt: t}, {seenAt: t}), []);
    assert.deepEqual(homeBannerStatDeltas({seenAt: t}, undefined), []);
  });
});
