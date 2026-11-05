import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  blogPostErrors,
  deleteBlogPostCore,
  existenceDelta,
  publishDueBlogPosts,
  readMinutes,
  saveBlogPostCore,
  slugify,
  startedReading,
  storedBlogPost,
  type BlogPostInput,
} from "./blog";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Ana Souza"};
const NOW = new Date("2026-11-05T12:00:00Z");

function post(over: Partial<BlogPostInput> = {}): BlogPostInput {
  return {
    title: " Liga nexaGO:  tudo sobre a 2ª etapa ",
    subtitle: "O que muda e como os pontos contam.",
    slug: "liga-nexago-2a-etapa",
    seoDescription: "",
    coverUrl: null,
    category: "torneios",
    sport: "beachVolleyball",
    tags: ["Liga", " liga ", "etapa"],
    author: {name: "Marcelo R.", role: "Organização da Liga"},
    body: [
      {type: "paragraph", text: "A 2ª etapa chega com categorias novas.  \n\n\n\nMais vagas."},
      {type: "heading", text: " O que muda "},
      {type: "list", items: ["Duas categorias novas", " ", "Check-in pelo app"]},
    ],
    cta: {label: "Inscrever minha dupla", destination: "torneios", url: "https://ignorado.com"},
    channels: {app: true, site: true},
    featured: true,
    status: "draft",
    publishAt: null,
    ...over,
  };
}

describe("slugify", () => {
  it("tira acento, ordinal e pontuação", () => {
    assert.equal(slugify("Liga nexaGO: tudo sobre a 2ª etapa!"), "liga-nexago-tudo-sobre-a-2a-etapa");
    assert.equal(slugify("  Saque — 5 exercícios  "), "saque-5-exercicios");
  });
});

describe("blogPostErrors", () => {
  it("aceita um post válido", () => {
    assert.deepEqual(blogPostErrors(post(), NOW), []);
  });

  it("recusa agendamento sem data ou no passado", () => {
    assert.match(blogPostErrors(post({status: "scheduled"}), NOW).join(), /data e hora/);
    assert.match(
      blogPostErrors(post({status: "scheduled", publishAt: "2026-11-01T09:00:00Z"}), NOW).join(),
      /já passou/,
    );
  });

  it("recusa publicar sem canal", () => {
    const errors = blogPostErrors(post({status: "published", channels: {app: false, site: false}}), NOW);
    assert.match(errors.join(), /onde o post aparece/);
  });

  it("aponta o bloco inválido pelo número", () => {
    const errors = blogPostErrors(post({body: [{type: "heading", text: " "}, {type: "image", url: "http://x", caption: ""}]}), NOW);
    assert.deepEqual(errors, ["Bloco 1: subtítulo vazio.", "Bloco 2: imagem sem endereço https."]);
  });

  it("recusa esporte, endereço e chamada inválidos", () => {
    const errors = blogPostErrors(post({
      sport: "xadrez",
      slug: "Com Espaço",
      cta: {label: "Abrir", destination: "url", url: null},
    }), NOW);
    assert.equal(errors.length, 3);
  });
});

describe("storedBlogPost", () => {
  it("normaliza texto, tags e chamada, e calcula a leitura", () => {
    const stored = storedBlogPost(post());
    assert.equal(stored.title, "Liga nexaGO: tudo sobre a 2ª etapa");
    assert.deepEqual(stored.tags, ["liga", "etapa"]);
    assert.deepEqual(stored.body[0], {type: "paragraph", text: "A 2ª etapa chega com categorias novas.\n\nMais vagas."});
    assert.deepEqual(stored.body[2], {type: "list", items: ["Duas categorias novas", "Check-in pelo app"]});
    assert.equal(stored.cta?.url, null);
    assert.equal(stored.readMinutes, 1);
  });

  it("conta 200 palavras por minuto", () => {
    const text = Array.from({length: 600}, () => "palavra").join(" ");
    assert.equal(readMinutes("Título", [{type: "paragraph", text}]), 3);
  });
});

describe("saveBlogPostCore", () => {
  it("cria o post, reserva o endereço e começa na versão 1", async () => {
    const {fake, db} = makeDb();
    const res = await saveBlogPostCore(db, {id: null, version: 0, post: post()}, ACTOR, NOW);
    assert.equal(res.version, 1);
    assert.equal(res.status, "draft");
    const doc = fake.store.get(`blogPosts/${res.id}`)!;
    assert.equal(doc["helpfulCount"], 0);
    assert.equal(doc["readCount"], 0);
    assert.deepEqual(doc["updatedBy"], ACTOR);
    assert.deepEqual(fake.store.get("blogSlugs/liga-nexago-2a-etapa"), {postId: res.id});
  });

  it("publicar agora grava a hora; republicar mantém a data original", async () => {
    const {db} = makeDb();
    const first = await saveBlogPostCore(db, {id: null, version: 0, post: post({status: "published"})}, ACTOR, NOW);
    assert.equal(first.publishAt, NOW.toISOString());
    const later = new Date("2026-11-06T12:00:00Z");
    const again = await saveBlogPostCore(db, {id: first.id, version: 1, post: post({status: "published"})}, ACTOR, later);
    assert.equal(again.publishAt, NOW.toISOString());
  });

  it("recusa versão velha", async () => {
    const {db} = makeDb();
    const first = await saveBlogPostCore(db, {id: null, version: 0, post: post()}, ACTOR, NOW);
    await assert.rejects(
      saveBlogPostCore(db, {id: first.id, version: 0, post: post()}, ACTOR, NOW),
      /alterado por outra pessoa/,
    );
  });

  it("recusa endereço de outro post e libera o antigo ao trocar", async () => {
    const {fake, db} = makeDb();
    const a = await saveBlogPostCore(db, {id: null, version: 0, post: post()}, ACTOR, NOW);
    await assert.rejects(
      saveBlogPostCore(db, {id: null, version: 0, post: post()}, ACTOR, NOW),
      /Já existe um post com esse endereço/,
    );
    await saveBlogPostCore(db, {id: a.id, version: 1, post: post({slug: "novo-endereco"})}, ACTOR, NOW);
    assert.equal(fake.store.has("blogSlugs/liga-nexago-2a-etapa"), false);
    assert.deepEqual(fake.store.get("blogSlugs/novo-endereco"), {postId: a.id});
  });

  it("mantém os contadores ao salvar de novo", async () => {
    const {fake, db} = makeDb();
    const a = await saveBlogPostCore(db, {id: null, version: 0, post: post()}, ACTOR, NOW);
    fake.store.get(`blogPosts/${a.id}`)!["helpfulCount"] = 7;
    await saveBlogPostCore(db, {id: a.id, version: 1, post: post()}, ACTOR, NOW);
    assert.equal(fake.store.get(`blogPosts/${a.id}`)!["helpfulCount"], 7);
  });
});

describe("blocos nexaGO e push (fase 2)", () => {
  it("valida vídeo pelo domínio e exige ids de torneio e produto", () => {
    const errors = blogPostErrors(post({body: [
      {type: "video", url: "https://vimeo.com/1", caption: ""},
      {type: "tournament", tournamentId: ""},
      {type: "product", productId: "a/b"},
      {type: "video", url: "https://youtu.be/abc", caption: "Saque"},
    ]}), NOW);
    assert.deepEqual(errors, [
      "Bloco 1: vídeo precisa ser um link do YouTube ou do Instagram.",
      "Bloco 2: escolha o torneio.",
      "Bloco 3: escolha o produto.",
    ]);
  });

  it("push exige o app ligado; sem push no input grava desligado", () => {
    const errors = blogPostErrors(post({channels: {app: false, site: true}, push: {enabled: true, city: null, sport: "all"}}), NOW);
    assert.match(errors.join(), /ligue "Blog no app"/);
    assert.deepEqual(storedBlogPost(post()).push, {enabled: false, city: null, sport: "all"});
    assert.deepEqual(
      storedBlogPost(post({push: {enabled: true, city: " Goiânia ", sport: "beach_volleyball"}})).push,
      {enabled: true, city: "Goiânia", sport: "beachVolleyball"},
    );
  });

  it("recusa torneio ou produto que não existe e aceita os que existem", async () => {
    const {fake, db} = makeDb();
    const body = [{type: "tournament" as const, tournamentId: "t1"}, {type: "product" as const, productId: "p1"}];
    await assert.rejects(
      saveBlogPostCore(db, {id: null, version: 0, post: post({body})}, ACTOR, NOW),
      /não existe mais/,
    );
    fake.store.set("tournaments/t1", {name: "Copa"});
    fake.store.set("storeShowcase/p1", {title: "Toalha"});
    const res = await saveBlogPostCore(db, {id: null, version: 0, post: post({body})}, ACTOR, NOW);
    assert.equal(res.version, 1);
  });

  it("o save preserva o registro do push", async () => {
    const {fake, db} = makeDb();
    const a = await saveBlogPostCore(db, {id: null, version: 0, post: post({status: "published"})}, ACTOR, NOW);
    const doc = fake.store.get(`blogPosts/${a.id}`)!;
    doc["pushSentAt"] = "enviado";
    doc["pushResult"] = {state: "sent", recipients: 3, sent: 2};
    await saveBlogPostCore(db, {id: a.id, version: 1, post: post({status: "published"})}, ACTOR, NOW);
    assert.equal(fake.store.get(`blogPosts/${a.id}`)!["pushSentAt"], "enviado");
    assert.deepEqual(fake.store.get(`blogPosts/${a.id}`)!["pushResult"], {state: "sent", recipients: 3, sent: 2});
  });
});

describe("blocos arena e ranking", () => {
  it("valida arena e ranking e normaliza o esporte", () => {
    const errors = blogPostErrors(post({body: [
      {type: "arena", arenaId: ""},
      {type: "ranking", sport: "xadrez", mode: "duplas", gender: "x"},
    ] as never}), NOW);
    assert.deepEqual(errors, [
      "Bloco 1: escolha a arena.",
      "Bloco 2: escolha o esporte do ranking.",
      "Bloco 2: escolha atletas ou equipes.",
      "Bloco 2: gênero do ranking inválido.",
    ]);
    const stored = storedBlogPost(post({body: [{type: "ranking", sport: "beach_tennis", mode: "teams", gender: "misto"}]}));
    assert.deepEqual(stored.body[0], {type: "ranking", sport: "beachTennis", mode: "teams", gender: "misto"});
  });

  it("recusa arena que não existe e conta arena e ranking no teto de blocos nexaGO", async () => {
    const {fake, db} = makeDb();
    await assert.rejects(
      saveBlogPostCore(db, {id: null, version: 0, post: post({body: [{type: "arena", arenaId: "a1"}]})}, ACTOR, NOW),
      /arena citado no post não existe mais/,
    );
    fake.store.set("arenas/a1", {name: "Arena Errejota"});
    const ok = await saveBlogPostCore(db, {id: null, version: 0, post: post({body: [{type: "arena", arenaId: "a1"}]})}, ACTOR, NOW);
    assert.equal(ok.version, 1);
    const many = Array.from({length: 11}, () => ({type: "ranking" as const, sport: "beachVolleyball", mode: "athletes" as const, gender: "all" as const}));
    assert.match(blogPostErrors(post({body: many}), NOW).join(), /Até 10 blocos nexaGO/);
  });
});

describe("deleteBlogPostCore", () => {
  it("apaga o post e a reserva do endereço", async () => {
    const {fake, db} = makeDb();
    const a = await saveBlogPostCore(db, {id: null, version: 0, post: post()}, ACTOR, NOW);
    await deleteBlogPostCore(db, a.id);
    assert.equal(fake.store.has(`blogPosts/${a.id}`), false);
    assert.equal(fake.store.has("blogSlugs/liga-nexago-2a-etapa"), false);
  });
});

describe("publishDueBlogPosts", () => {
  it("publica só os agendados cuja hora passou", async () => {
    const {fake, db} = makeDb();
    fake.store.set("blogPosts/due", {status: "scheduled", publishAt: Timestamp.fromDate(new Date("2026-11-05T11:55:00Z"))});
    fake.store.set("blogPosts/later", {status: "scheduled", publishAt: Timestamp.fromDate(new Date("2026-11-12T09:00:00Z"))});
    fake.store.set("blogPosts/draft", {status: "draft", publishAt: Timestamp.fromDate(new Date("2026-11-01T09:00:00Z"))});
    assert.equal(await publishDueBlogPosts(db, NOW), 1);
    assert.equal(fake.store.get("blogPosts/due")!["status"], "published");
    assert.equal(fake.store.get("blogPosts/later")!["status"], "scheduled");
    assert.equal(fake.store.get("blogPosts/draft")!["status"], "draft");
  });
});

describe("contadores", () => {
  it("reação soma ao criar e tira ao apagar", () => {
    assert.equal(existenceDelta(false, true), 1);
    assert.equal(existenceDelta(true, false), -1);
    assert.equal(existenceDelta(true, true), 0);
  });

  it("leitor conta uma vez, quando começa a ler", () => {
    const ts = Timestamp.fromDate(NOW);
    assert.equal(startedReading(undefined, {saved: true, readStartedAt: null}), false);
    assert.equal(startedReading({saved: true, readStartedAt: null}, {readStartedAt: ts}), true);
    assert.equal(startedReading({readStartedAt: ts}, {readStartedAt: ts, progress: 1}), false);
  });
});
