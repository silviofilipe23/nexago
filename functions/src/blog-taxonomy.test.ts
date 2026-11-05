import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  blogAuthorErrors,
  blogCategoryErrors,
  categoryIdFrom,
  saveBlogAuthorCore,
  saveBlogCategoryCore,
  type SaveBlogCategoryInput,
} from "./blog-taxonomy";
import {saveBlogPostCore, type BlogPostInput} from "./blog";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const ACTOR = {uid: "admin1", name: "Ana Souza"};
const NOW = new Date("2026-11-05T12:00:00Z");

function category(over: Partial<SaveBlogCategoryInput> = {}): SaveBlogCategoryInput {
  return {id: null, label: "Saúde & Corpo", color: "#ff5c8a", colorLight: "#a3204a", order: 6, active: true, ...over};
}

function post(over: Partial<BlogPostInput> = {}): BlogPostInput {
  return {
    title: "Post",
    subtitle: "",
    slug: "post",
    seoDescription: "",
    coverUrl: null,
    category: "torneios",
    sport: "all",
    tags: [],
    author: {name: "Marcelo R.", role: "Organização"},
    body: [{type: "paragraph", text: "Texto."}],
    cta: null,
    channels: {app: true, site: true},
    featured: false,
    status: "draft",
    publishAt: null,
    ...over,
  };
}

describe("categorias", () => {
  it("id da categoria nova vem do rótulo e não colide com as de origem nem com as criadas", async () => {
    assert.equal(categoryIdFrom("Saúde & Corpo"), "saude-corpo");
    const {fake, db} = makeDb();
    const a = await saveBlogCategoryCore(db, category(), ACTOR, NOW);
    assert.equal(a.id, "saude-corpo");
    const b = await saveBlogCategoryCore(db, category(), ACTOR, NOW);
    assert.equal(b.id, "saude-corpo-2");
    const c = await saveBlogCategoryCore(db, category({label: "Torneios"}), ACTOR, NOW);
    assert.equal(c.id, "torneios-2");
    assert.equal(fake.store.get("blogCategories/saude-corpo")!["color"], "#FF5C8A");
  });

  it("editar uma de origem grava o doc com o mesmo id", async () => {
    const {fake, db} = makeDb();
    await saveBlogCategoryCore(db, category({id: "loja", label: "Lojinha", active: false}), ACTOR, NOW);
    assert.equal(fake.store.get("blogCategories/loja")!["label"], "Lojinha");
    assert.equal(fake.store.get("blogCategories/loja")!["active"], false);
  });

  it("o teto de 30 conta só as criadas, não as de origem com doc", async () => {
    const {fake, db} = makeDb();
    for (const id of ["torneios", "treino", "regras", "arenas", "guia", "loja"]) {
      fake.store.set(`blogCategories/${id}`, {label: id});
    }
    for (let i = 0; i < 29; i++) fake.store.set(`blogCategories/c${i}`, {label: `c${i}`});
    const ok = await saveBlogCategoryCore(db, category({label: "Mais uma"}), ACTOR, NOW);
    assert.equal(ok.id, "mais-uma");
    await assert.rejects(saveBlogCategoryCore(db, category({label: "Outra"}), ACTOR, NOW), /Até 30 categorias/);
  });

  it("valida rótulo, cores e ordem", () => {
    assert.deepEqual(blogCategoryErrors(category({label: " ", color: "red", colorLight: "#12345", order: -1})), [
      "Dê um nome à categoria.",
      "Cor do tema escuro inválida.",
      "Cor do tema claro inválida.",
      "Ordem inválida.",
    ]);
  });

  it("o post aceita categoria de origem ou criada e recusa a que não existe", async () => {
    const {db} = makeDb();
    await saveBlogPostCore(db, {id: null, version: 0, post: post()}, ACTOR, NOW);
    await assert.rejects(
      saveBlogPostCore(db, {id: null, version: 0, post: post({slug: "outro", category: "saude-corpo"})}, ACTOR, NOW),
      /categoria não existe mais/,
    );
    await saveBlogCategoryCore(db, category(), ACTOR, NOW);
    const ok = await saveBlogPostCore(db, {id: null, version: 0, post: post({slug: "outro", category: "saude-corpo"})}, ACTOR, NOW);
    assert.equal(ok.version, 1);
  });
});

describe("autores", () => {
  it("valida nome, foto e bio", () => {
    assert.deepEqual(
      blogAuthorErrors({id: null, name: "", role: "", photoUrl: "http://x", bio: "a".repeat(200), active: true}),
      ["Informe o nome do autor.", "Foto sem endereço https.", "Bio passa de 160 caracteres."],
    );
  });

  it("post com autor cadastrado guarda o retrato do cadastro, não o que o editor mandou", async () => {
    const {fake, db} = makeDb();
    const {id} = await saveBlogAuthorCore(
      db,
      {id: null, name: " Ana  Souza ", role: "Editora", photoUrl: "https://x/ana.jpg", bio: "", active: true},
      ACTOR,
      NOW,
    );
    const res = await saveBlogPostCore(
      db,
      {id: null, version: 0, post: post({author: {id, name: "Outro nome", role: "x"}})},
      ACTOR,
      NOW,
    );
    assert.deepEqual(fake.store.get(`blogPosts/${res.id}`)!["author"], {
      id,
      name: "Ana Souza",
      role: "Editora",
      photoUrl: "https://x/ana.jpg",
    });
  });

  it("sem id é texto livre; id que não existe é recusado", async () => {
    const {fake, db} = makeDb();
    const res = await saveBlogPostCore(db, {id: null, version: 0, post: post()}, ACTOR, NOW);
    assert.deepEqual(fake.store.get(`blogPosts/${res.id}`)!["author"], {id: null, name: "Marcelo R.", role: "Organização", photoUrl: null});
    await assert.rejects(
      saveBlogPostCore(db, {id: null, version: 0, post: post({slug: "x2", author: {id: "sumiu", name: "a", role: ""}})}, ACTOR, NOW),
      /autor escolhido não existe mais/,
    );
  });
});
