import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  MAX_APP_NEWS_FEATURES,
  MAX_APP_NEWS_RELEASES,
  appNewsErrors,
  publicAppNews,
  saveAppNewsCore,
  storedAppNewsRelease,
  type AppNewsFeatureInput,
  type AppNewsReleaseInput,
} from "./app-news";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Ana Souza"};
// 27/10 às 9h em São Paulo.
const NOW = new Date("2026-10-27T12:00:00Z");

function feature(over: Partial<AppNewsFeatureInput> = {}): AppNewsFeatureInput {
  return {
    id: "mapa-reservar",
    title: " Arenas no mapa ",
    summary: "Ache quadra perto de você e veja o próximo horário livre.",
    description: "A aba Reservar abre num mapa com as arenas da região.",
    steps: ["Abra a aba Reservar", " ", "Toque na arena e reserve"],
    where: "Aba Reservar",
    ctaLabel: "Abrir mapa",
    destination: "reservar",
    url: null,
    imageUrl: null,
    icon: "map",
    stories: true,
    ...over,
  };
}

function release(over: Partial<AppNewsReleaseInput> = {}): AppNewsReleaseInput {
  return {
    version: "1.0.15",
    build: 113,
    date: "2026-10-27",
    stories: true,
    features: [feature()],
    improvements: ["Placar do árbitro abre 2× mais rápido"],
    published: true,
    ...over,
  };
}

function fieldsOf(err: unknown): string[] {
  return ((err as {details?: {fields?: string[]}}).details?.fields) ?? [];
}

describe("appNewsErrors", () => {
  it("aceita a versão do seed e a lista vazia", () => {
    assert.deepEqual(appNewsErrors({releases: [release()], version: 0}), []);
    assert.deepEqual(appNewsErrors({releases: [], version: 3}), []);
  });

  it("versão anterior do seed: só título, sem botão, sem resumo", () => {
    const old = release({
      version: "1.0.14",
      build: 112,
      stories: false,
      features: [feature({id: "convite-dupla", title: "Convite de dupla", summary: "", ctaLabel: "", destination: null})],
      improvements: [],
    });
    assert.deepEqual(appNewsErrors({releases: [old], version: 0}), []);
  });

  it("número da versão, build e data com formato", () => {
    const errors = appNewsErrors({
      releases: [
        release({version: "v1.0"}),
        release({version: "1.0.16", build: 0, features: [feature({id: "b"})]}),
        release({version: "1.0.17", build: 114.5, features: [feature({id: "c"})]}),
        release({version: "1.0.18", build: 116, date: "27/10/2026", features: [feature({id: "d"})]}),
      ],
      version: 0,
    });
    assert.deepEqual(errors, ["releases.0.version", "releases.1.build", "releases.2.build", "releases.3.date"]);
  });

  it("publicada precisa de funcionalidade com título; rascunho pode ficar incompleto", () => {
    assert.deepEqual(appNewsErrors({releases: [release({features: []})], version: 0}), ["releases.0.features"]);
    assert.deepEqual(appNewsErrors({releases: [release({features: [feature({title: ""})]})], version: 0}), [
      "releases.0.features.0.title",
    ]);
    const draft = release({published: false, date: null, features: [feature({title: "", ctaLabel: ""})]});
    assert.deepEqual(appNewsErrors({releases: [draft, release({version: "1.0.16", build: 114, published: false, features: []})], version: 0}), []);
  });

  it("tetos dos textos, até 4 passos e teto das listas", () => {
    const errors = appNewsErrors({
      releases: [
        release({
          features: [
            feature({title: "x".repeat(23), summary: "y".repeat(61), ctaLabel: "z".repeat(17)}),
            feature({id: "b", description: "d".repeat(241), steps: ["1", "2", "3", "4", "5"], where: "w".repeat(61)}),
          ],
          improvements: ["ok", "", "m".repeat(91)],
        }),
      ],
      version: 0,
    });
    assert.deepEqual(errors, [
      "releases.0.features.0.title",
      "releases.0.features.0.summary",
      "releases.0.features.0.ctaLabel",
      "releases.0.features.1.description",
      "releases.0.features.1.steps",
      "releases.0.features.1.where",
      "releases.0.improvements.1",
      "releases.0.improvements.2",
    ]);
    const many = Array.from({length: MAX_APP_NEWS_FEATURES + 1}, (_, i) => feature({id: `f${i}`}));
    assert.deepEqual(appNewsErrors({releases: [release({features: many})], version: 0}), ["releases.0.features"]);
    const lots = Array.from({length: MAX_APP_NEWS_RELEASES + 1}, (_, i) => release({version: `1.0.${i}`, build: i + 1, features: []}));
    assert.deepEqual(appNewsErrors({releases: lots, version: 0}), ["releases"]);
  });

  it("destino e ícone só das listas do app; botão obrigatório quando há destino", () => {
    const errors = appNewsErrors({
      releases: [
        release({
          features: [
            feature({destination: "radar" as never}),
            feature({id: "b", icon: "star" as never}),
            feature({id: "c", ctaLabel: ""}),
            feature({id: "d", destination: null, ctaLabel: "", icon: null}),
          ],
        }),
      ],
      version: 0,
    });
    assert.deepEqual(errors, ["releases.0.features.0.destination", "releases.0.features.1.icon", "releases.0.features.2.ctaLabel"]);
  });

  it("link externo: https obrigatório ao publicar; nos outros destinos, nada de link; imagem só https", () => {
    const errors = appNewsErrors({
      releases: [
        release({
          features: [
            feature({destination: "url", url: null}),
            feature({id: "b", destination: "url", url: "http://nexago.app"}),
            feature({id: "c", destination: "url", url: "https://nexago.app/novidades"}),
            feature({id: "d", destination: "ranking", url: "https://nexago.app"}),
            feature({id: "e", imageUrl: "http://x.com/a.png"}),
          ],
        }),
        release({version: "1.0.16", build: 114, published: false, features: [feature({id: "f", destination: "url", url: null})]}),
      ],
      version: 0,
    });
    assert.deepEqual(errors, [
      "releases.0.features.0.url",
      "releases.0.features.1.url",
      "releases.0.features.3.url",
      "releases.0.features.4.imageUrl",
    ]);
  });

  it("versão, build e id de funcionalidade não repetem — o id nem entre versões", () => {
    const errors = appNewsErrors({
      releases: [
        release(),
        release({build: 114, features: [feature({id: "outra"})]}),
        release({version: "1.0.16", build: 113, features: [feature()]}),
        release({version: "1.0.17", build: 115, features: [feature({id: "Bora Jogar"})]}),
      ],
      version: 0,
    });
    assert.deepEqual(errors, [
      "releases.1.version",
      "releases.2.build",
      "releases.2.features.0.id",
      "releases.3.features.0.id",
    ]);
  });
});

describe("storedAppNewsRelease", () => {
  it("apara os textos, tira passos vazios e o botão de quem não tem destino", () => {
    const stored = storedAppNewsRelease(
      release({features: [feature(), feature({id: "b", destination: null, ctaLabel: "Abrir"})], improvements: [" Agenda "]}),
      "2026-10-27",
    );
    assert.equal(stored.features[0]!.title, "Arenas no mapa");
    assert.deepEqual(stored.features[0]!.steps, ["Abra a aba Reservar", "Toque na arena e reserve"]);
    assert.equal(stored.features[1]!.ctaLabel, "");
    assert.deepEqual(stored.improvements, ["Agenda"]);
  });

  it("publicar sem data grava a de hoje; rascunho sem data continua sem", () => {
    assert.equal(storedAppNewsRelease(release({date: null}), "2026-10-27").date, "2026-10-27");
    assert.equal(storedAppNewsRelease(release({date: null, published: false}), "2026-10-27").date, null);
    assert.equal(storedAppNewsRelease(release({date: "2026-11-10"}), "2026-10-27").date, "2026-11-10");
  });
});

describe("publicAppNews", () => {
  it("só as publicadas, da mais nova para a mais antiga, no formato que o app lê", () => {
    const list = [
      release({version: "1.0.14", build: 112, date: "2026-10-05"}),
      release({version: "1.0.16", build: 114, published: false, features: [feature({id: "rascunho"})]}),
      release({features: [feature({id: "novo"}), feature({id: "info", destination: null, ctaLabel: "", icon: null})]}),
    ];
    const out = publicAppNews(list.map((r) => storedAppNewsRelease(r, "2026-10-27")));
    assert.deepEqual(out.map((r) => r.version), ["1.0.15", "1.0.14"]);
    assert.equal("published" in out[0]!, false);
    assert.deepEqual(out[0]!.features[0], {
      id: "novo",
      title: "Arenas no mapa",
      summary: "Ache quadra perto de você e veja o próximo horário livre.",
      description: "A aba Reservar abre num mapa com as arenas da região.",
      steps: ["Abra a aba Reservar", "Toque na arena e reserve"],
      where: "Aba Reservar",
      ctaLabel: "Abrir mapa",
      destination: "reservar",
      icon: "map",
      stories: true,
    });
    // Sem destino, url, imagem e ícone: as chaves nem vão (o app lê ausente como "sem").
    assert.deepEqual(Object.keys(out[0]!.features[1]!).sort(), [
      "ctaLabel",
      "description",
      "id",
      "steps",
      "stories",
      "summary",
      "title",
      "where",
    ]);
  });
});

describe("saveAppNewsCore", () => {
  it("grava a fonte com rascunhos e o espelho só com as publicadas", async () => {
    const {fake, db} = makeDb();
    const result = await saveAppNewsCore(
      db,
      {
        releases: [
          release({version: "1.0.16", build: 114, published: false, date: null, features: [feature({id: "proxima"})]}),
          release({date: null}),
        ],
        version: 0,
      },
      ACTOR,
      NOW,
    );
    assert.equal(result.version, 1);
    assert.deepEqual(result.releases.map((r) => r.version), ["1.0.16", "1.0.15"]);
    assert.equal(result.releases[1]!.date, "2026-10-27");

    const source = fake.store.get("appAdminConfig/appNews")!;
    assert.equal(source["version"], 1);
    assert.deepEqual(source["updatedBy"], ACTOR);
    assert.equal((source["releases"] as unknown[]).length, 2);

    const mirror = fake.store.get("appConfig/appNews")!;
    assert.deepEqual(Object.keys(mirror).sort(), ["releases", "updatedAt"]);
    const releases = mirror["releases"] as Array<{version: string; date: string}>;
    assert.deepEqual(releases.map((r) => [r.version, r.date]), [["1.0.15", "2026-10-27"]]);
  });

  it("versão velha (outra pessoa salvou) é recusada sem tocar em nada", async () => {
    const {fake, db} = makeDb();
    await saveAppNewsCore(db, {releases: [release()], version: 0}, ACTOR, NOW);
    await assert.rejects(
      saveAppNewsCore(db, {releases: [], version: 0}, ACTOR, NOW),
      (err: unknown) => (err as {code?: string}).code === "failed-precondition",
    );
    assert.equal((fake.store.get("appConfig/appNews")!["releases"] as unknown[]).length, 1);
  });

  it("dado inválido devolve os campos", async () => {
    const {db} = makeDb();
    await assert.rejects(
      saveAppNewsCore(db, {releases: [release({features: [feature({title: ""})]})], version: 0}, ACTOR, NOW),
      (err: unknown) => fieldsOf(err).includes("releases.0.features.0.title"),
    );
  });
});
