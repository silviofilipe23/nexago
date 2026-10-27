import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  MAX_APP_GUIDE_CATEGORIES,
  MAX_APP_GUIDE_TOPICS,
  appGuideErrors,
  publicAppGuide,
  saveAppGuideCore,
  storedAppGuideCategory,
  type AppGuideCategoryInput,
  type AppGuideTopicInput,
} from "./app-guide";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Ana Souza"};
const NOW = new Date("2026-10-27T12:00:00Z");

function topic(over: Partial<AppGuideTopicInput> = {}): AppGuideTopicInput {
  return {
    id: "guia-reservar-quadra",
    title: " Reservar uma quadra ",
    summary: "Ache a arena no mapa, escolha o horário e garanta sua quadra.",
    description: "A aba Reservar mostra as arenas num mapa com lista.",
    steps: ["Na aba \"Reservar\", toque na data", " ", "Toque em \"Confirmar reserva\""],
    where: "Aba Reservar › arena › Reservar",
    ctaLabel: "Abrir mapa",
    destination: "reservar",
    url: null,
    imageUrl: null,
    icon: "map",
    published: true,
    ...over,
  };
}

function category(over: Partial<AppGuideCategoryInput> = {}): AppGuideCategoryInput {
  return {id: "reservar", title: "Reservar", topics: [topic()], ...over};
}

function fieldsOf(err: unknown): string[] {
  return ((err as {details?: {fields?: string[]}}).details?.fields) ?? [];
}

describe("appGuideErrors", () => {
  it("aceita os guias do seed e a lista vazia", () => {
    assert.deepEqual(appGuideErrors({categories: [category()], version: 0}), []);
    assert.deepEqual(appGuideErrors({categories: [], version: 3}), []);
  });

  it("os textos mais longos do seed de 27/10 cabem nos tetos", () => {
    const seed = category({
      id: "treinos",
      title: "Loja e indicação",
      topics: [
        topic({id: "guia-mensagens", title: "Falar com professor e centro", icon: "chat", destination: "treinos", ctaLabel: "Meus treinos"}),
        topic({id: "guia-aulas", summary: "Ache arenas, CTs e professores perto de você e agende a experimental."}),
        topic({
          id: "guia-cancelar-reserva",
          icon: "cancel",
          destination: null,
          ctaLabel: "",
          description:
            "Cancele pelo detalhe da reserva e o horário volta a ficar livre na hora. A política da reserva: sem custo até 6h antes do início; depois, a arena pode reter 50% do valor. Valores pagos são acertados com a arena.",
        }),
        topic({id: "guia-story-placar", icon: "story", where: "Agenda › card da reserva; Configurações › Histórico de partidas"}),
        topic({
          id: "guia-inscrever-torneio",
          steps: [
            "No \"Hub\", toque em \"Torneios e ligas\" e use a busca ou os filtros",
            "No torneio, toque em \"Inscrever minha dupla\" e confirme a categoria e o nível",
            "Aceite o termo e toque em \"Escolher meu parceiro\" ou \"Guardar minha vaga sem parceiro\"",
            "Busque o parceiro e toque em \"Convidar\" (ou convide por link)",
            "No pagamento, escolha Pix ou cartão — se for direto com o organizador, toque em \"Já paguei ao organizador\"",
          ],
        }),
        topic({id: "guia-convidar-jogadores", icon: "invite", ctaLabel: "Reservar quadra"}),
      ],
    });
    assert.deepEqual(appGuideErrors({categories: [seed], version: 0}), []);
  });

  it("publicado precisa de título; rascunho pode ficar incompleto; categoria precisa de nome", () => {
    assert.deepEqual(appGuideErrors({categories: [category({topics: [topic({title: ""})]})], version: 0}), [
      "categories.0.topics.0.title",
    ]);
    const draft = topic({published: false, title: "", ctaLabel: ""});
    assert.deepEqual(appGuideErrors({categories: [category({topics: [draft]}), category({id: "vazia", title: "Vazia", topics: []})], version: 0}), []);
    assert.deepEqual(appGuideErrors({categories: [category({title: "  "})], version: 0}), ["categories.0.title"]);
  });

  it("tetos dos textos, até 6 passos e teto das listas", () => {
    const errors = appGuideErrors({
      categories: [
        category({
          title: "c".repeat(25),
          topics: [
            topic({title: "x".repeat(33), summary: "y".repeat(91), ctaLabel: "z".repeat(21)}),
            topic({id: "b", description: "d".repeat(321), steps: ["1", "2", "3", "4", "5", "6", "7"], where: "w".repeat(81)}),
            topic({id: "c", steps: ["p".repeat(141)]}),
          ],
        }),
      ],
      version: 0,
    });
    assert.deepEqual(errors, [
      "categories.0.title",
      "categories.0.topics.0.title",
      "categories.0.topics.0.summary",
      "categories.0.topics.0.ctaLabel",
      "categories.0.topics.1.description",
      "categories.0.topics.1.steps",
      "categories.0.topics.1.where",
      "categories.0.topics.2.steps",
    ]);
    const six = topic({steps: ["1", "2", "3", "4", "5", "6"]});
    assert.deepEqual(appGuideErrors({categories: [category({topics: [six]})], version: 0}), []);
    const many = Array.from({length: MAX_APP_GUIDE_TOPICS + 1}, (_, i) => topic({id: `t${i}`}));
    assert.deepEqual(appGuideErrors({categories: [category({topics: many})], version: 0}), ["categories.0.topics"]);
    const lots = Array.from({length: MAX_APP_GUIDE_CATEGORIES + 1}, (_, i) => category({id: `c${i}`, topics: []}));
    assert.deepEqual(appGuideErrors({categories: lots, version: 0}), ["categories"]);
  });

  it("destino e ícone só das listas do app; botão obrigatório quando há destino", () => {
    const errors = appGuideErrors({
      categories: [
        category({
          topics: [
            topic({destination: "radar" as never}),
            topic({id: "b", icon: "rocket" as never}),
            topic({id: "c", ctaLabel: ""}),
            topic({id: "d", destination: null, ctaLabel: "", icon: "handshake"}),
            topic({id: "e", destination: null, ctaLabel: "", icon: null}),
          ],
        }),
      ],
      version: 0,
    });
    assert.deepEqual(errors, ["categories.0.topics.0.destination", "categories.0.topics.1.icon", "categories.0.topics.2.ctaLabel"]);
  });

  it("link externo: https obrigatório ao publicar; nos outros destinos, nada de link; imagem só https", () => {
    const errors = appGuideErrors({
      categories: [
        category({
          topics: [
            topic({destination: "url", url: null}),
            topic({id: "b", destination: "url", url: "http://nexago.app"}),
            topic({id: "c", destination: "url", url: "https://nexago.app/ajuda"}),
            topic({id: "d", destination: "ranking", url: "https://nexago.app"}),
            topic({id: "e", imageUrl: "http://x.com/a.png"}),
            topic({id: "f", published: false, destination: "url", url: null}),
          ],
        }),
      ],
      version: 0,
    });
    assert.deepEqual(errors, [
      "categories.0.topics.0.url",
      "categories.0.topics.1.url",
      "categories.0.topics.3.url",
      "categories.0.topics.4.imageUrl",
    ]);
  });

  it("id de categoria não repete; o de guia nem entre categorias (o app abre o guia pelo id)", () => {
    const errors = appGuideErrors({
      categories: [
        category(),
        category({topics: [topic({id: "outro"})]}),
        category({id: "jogar", title: "Jogar", topics: [topic()]}),
        category({id: "Mais Coisas", title: "Mais", topics: [topic({id: "guia_loja"})]}),
      ],
      version: 0,
    });
    assert.deepEqual(errors, [
      "categories.1.id",
      "categories.2.topics.0.id",
      "categories.3.id",
      "categories.3.topics.0.id",
    ]);
  });
});

describe("storedAppGuideCategory", () => {
  it("apara os textos, tira passos vazios e o botão de quem não tem destino", () => {
    const stored = storedAppGuideCategory(
      category({title: " Reservar ", topics: [topic(), topic({id: "b", destination: null, ctaLabel: "Abrir"})]}),
    );
    assert.equal(stored.title, "Reservar");
    assert.equal(stored.topics[0]!.title, "Reservar uma quadra");
    assert.deepEqual(stored.topics[0]!.steps, ["Na aba \"Reservar\", toque na data", "Toque em \"Confirmar reserva\""]);
    assert.equal(stored.topics[1]!.ctaLabel, "");
  });
});

describe("publicAppGuide", () => {
  it("só os publicados, na ordem; categoria sem nenhum fica de fora; formato que o app lê", () => {
    const list = [
      category({id: "rascunhos", title: "Rascunhos", topics: [topic({id: "r", published: false})]}),
      category({
        topics: [
          topic({id: "novo"}),
          topic({id: "escondido", published: false}),
          topic({id: "info", destination: null, ctaLabel: "", icon: null}),
        ],
      }),
      category({id: "vazia", title: "Vazia", topics: []}),
    ];
    const out = publicAppGuide(list.map(storedAppGuideCategory));
    assert.deepEqual(out.map((c) => c.id), ["reservar"]);
    assert.deepEqual(out[0]!.topics.map((t) => t.id), ["novo", "info"]);
    assert.deepEqual(out[0]!.topics[0], {
      id: "novo",
      title: "Reservar uma quadra",
      summary: "Ache a arena no mapa, escolha o horário e garanta sua quadra.",
      description: "A aba Reservar mostra as arenas num mapa com lista.",
      steps: ["Na aba \"Reservar\", toque na data", "Toque em \"Confirmar reserva\""],
      where: "Aba Reservar › arena › Reservar",
      ctaLabel: "Abrir mapa",
      destination: "reservar",
      icon: "map",
    });
    // Sem destino, url, imagem e ícone: as chaves nem vão (o app lê ausente como "sem"); nem published.
    assert.deepEqual(Object.keys(out[0]!.topics[1]!).sort(), [
      "ctaLabel",
      "description",
      "id",
      "steps",
      "summary",
      "title",
      "where",
    ]);
  });
});

describe("saveAppGuideCore", () => {
  it("grava a fonte com rascunhos e o espelho só com os publicados", async () => {
    const {fake, db} = makeDb();
    const result = await saveAppGuideCore(
      db,
      {
        categories: [
          category({topics: [topic(), topic({id: "proximo", published: false})]}),
          category({id: "jogar", title: "Jogar", topics: [topic({id: "so-rascunho", published: false})]}),
        ],
        version: 0,
      },
      ACTOR,
      NOW,
    );
    assert.equal(result.version, 1);
    assert.deepEqual(result.categories.map((c) => c.topics.length), [2, 1]);

    const source = fake.store.get("appAdminConfig/appGuide")!;
    assert.equal(source["version"], 1);
    assert.deepEqual(source["updatedBy"], ACTOR);
    assert.equal((source["categories"] as unknown[]).length, 2);

    const mirror = fake.store.get("appConfig/appGuide")!;
    assert.deepEqual(Object.keys(mirror).sort(), ["categories", "updatedAt"]);
    const categories = mirror["categories"] as Array<{id: string; topics: Array<{id: string}>}>;
    assert.deepEqual(categories.map((c) => [c.id, c.topics.map((t) => t.id)]), [["reservar", ["guia-reservar-quadra"]]]);
  });

  it("versão velha (outra pessoa salvou) é recusada sem tocar em nada", async () => {
    const {fake, db} = makeDb();
    await saveAppGuideCore(db, {categories: [category()], version: 0}, ACTOR, NOW);
    await assert.rejects(
      saveAppGuideCore(db, {categories: [], version: 0}, ACTOR, NOW),
      (err: unknown) => (err as {code?: string}).code === "failed-precondition",
    );
    assert.equal((fake.store.get("appConfig/appGuide")!["categories"] as unknown[]).length, 1);
  });

  it("dado inválido devolve os campos", async () => {
    const {db} = makeDb();
    await assert.rejects(
      saveAppGuideCore(db, {categories: [category({topics: [topic({title: ""})]})], version: 0}, ACTOR, NOW),
      (err: unknown) => fieldsOf(err).includes("categories.0.topics.0.title"),
    );
  });
});
