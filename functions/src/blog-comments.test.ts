import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  approvedDelta,
  cleanCommentText,
  commentAuthorFrom,
  moderateBlogCommentCore,
  postBlogCommentCore,
} from "./blog-comments";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const NOW = new Date("2026-11-05T12:00:00Z");
const ACTOR = {uid: "admin1", name: "Ana Souza"};

function seedPost(fake: FakeFirestore, over: Record<string, unknown> = {}) {
  fake.store.set("blogPosts/p1", {title: "Liga nexaGO", status: "published", channels: {app: true, site: true}, ...over});
}

function commentsOf(fake: FakeFirestore) {
  return [...fake.store.entries()].filter(([k]) => k.startsWith("blogPosts/p1/blogComments/"));
}

describe("commentAuthorFrom", () => {
  it("usa o apelido; senão primeiro nome + inicial; nunca o nome completo", () => {
    assert.deepEqual(commentAuthorFrom({nickname: "@muralha", fullName: "João da Silva"}), {name: "muralha", photoUrl: null});
    assert.deepEqual(commentAuthorFrom({fullName: "João da Silva", profilePhotoUrl: "https://x/y.jpg"}), {
      name: "João S.",
      photoUrl: "https://x/y.jpg",
    });
    assert.deepEqual(commentAuthorFrom({name: "Bia", avatarUrl: "http://inseguro"}), {name: "Bia", photoUrl: null});
    assert.deepEqual(commentAuthorFrom(undefined), {name: "Atleta", photoUrl: null});
  });
});

describe("cleanCommentText", () => {
  it("tira espaço sobrando e junta linhas em branco", () => {
    assert.equal(cleanCommentText("  Boa   dica!\n\n\n\nValeu  "), "Boa dica!\n\nValeu");
  });
});

describe("postBlogCommentCore", () => {
  it("grava pendente com o retrato do perfil público", async () => {
    const {fake, db} = makeDb();
    seedPost(fake);
    fake.store.set("public_profiles/u1", {nickname: "muralha", profilePhotoUrl: "https://x/m.jpg"});
    const {id} = await postBlogCommentCore(db, "u1", {postId: "p1", text: " Ótimo post ", kind: "question"}, NOW);
    const doc = fake.store.get(`blogPosts/p1/blogComments/${id}`)!;
    assert.equal(doc["status"], "pending");
    assert.equal(doc["text"], "Ótimo post");
    assert.equal(doc["kind"], "question");
    assert.deepEqual(doc["author"], {name: "muralha", photoUrl: "https://x/m.jpg"});
    assert.equal(doc["reply"], null);
  });

  it("recusa post fora do ar, texto curto e enxurrada de pendentes", async () => {
    const {fake, db} = makeDb();
    seedPost(fake, {status: "draft"});
    await assert.rejects(postBlogCommentCore(db, "u1", {postId: "p1", text: "Oi oi", kind: "comment"}, NOW), /não está mais no ar/);
    seedPost(fake);
    await assert.rejects(postBlogCommentCore(db, "u1", {postId: "p1", text: " a ", kind: "comment"}, NOW), /Escreva um pouco mais/);
    for (let i = 0; i < 3; i++) await postBlogCommentCore(db, "u1", {postId: "p1", text: `Comentário ${i}`, kind: "comment"}, NOW);
    await assert.rejects(
      postBlogCommentCore(db, "u1", {postId: "p1", text: "Mais um", kind: "comment"}, NOW),
      /esperando aprovação/,
    );
    await postBlogCommentCore(db, "u2", {postId: "p1", text: "De outro atleta", kind: "comment"}, NOW);
    assert.equal(commentsOf(fake).length, 4);
  });
});

describe("moderateBlogCommentCore", () => {
  it("responder aprova, guarda a resposta e avisa só na primeira vez", async () => {
    const {fake, db} = makeDb();
    seedPost(fake);
    const {id} = await postBlogCommentCore(db, "u1", {postId: "p1", text: "Como inscrevo a dupla?", kind: "question"}, NOW);
    const first = await moderateBlogCommentCore(db, {postId: "p1", commentId: id, action: "reply", reply: " Pelo app. "}, ACTOR, NOW);
    assert.deepEqual(first.notify, {uid: "u1", postId: "p1", title: "Liga nexaGO"});
    const doc = fake.store.get(`blogPosts/p1/blogComments/${id}`)!;
    assert.equal(doc["status"], "approved");
    assert.equal((doc["reply"] as {text: string}).text, "Pelo app.");
    const again = await moderateBlogCommentCore(db, {postId: "p1", commentId: id, action: "reply", reply: "Pelo app, na aba Competir."}, ACTOR, NOW);
    assert.equal(again.notify, null);
  });

  it("aprova, recusa e apaga", async () => {
    const {fake, db} = makeDb();
    seedPost(fake);
    const {id} = await postBlogCommentCore(db, "u1", {postId: "p1", text: "Muito bom", kind: "comment"}, NOW);
    await moderateBlogCommentCore(db, {postId: "p1", commentId: id, action: "approve"}, ACTOR, NOW);
    assert.equal(fake.store.get(`blogPosts/p1/blogComments/${id}`)!["status"], "approved");
    await moderateBlogCommentCore(db, {postId: "p1", commentId: id, action: "reject"}, ACTOR, NOW);
    assert.equal(fake.store.get(`blogPosts/p1/blogComments/${id}`)!["status"], "rejected");
    await moderateBlogCommentCore(db, {postId: "p1", commentId: id, action: "delete"}, ACTOR, NOW);
    assert.equal(fake.store.has(`blogPosts/p1/blogComments/${id}`), false);
  });

  it("resposta vazia é recusada", async () => {
    const {fake, db} = makeDb();
    seedPost(fake);
    const {id} = await postBlogCommentCore(db, "u1", {postId: "p1", text: "Dúvida aqui", kind: "question"}, NOW);
    await assert.rejects(moderateBlogCommentCore(db, {postId: "p1", commentId: id, action: "reply", reply: " "}, ACTOR, NOW), /Escreva a resposta/);
  });
});

describe("approvedDelta", () => {
  it("conta só a entrada e a saída de aprovado", () => {
    assert.equal(approvedDelta(undefined, {status: "pending"}), 0);
    assert.equal(approvedDelta({status: "pending"}, {status: "approved"}), 1);
    assert.equal(approvedDelta({status: "approved"}, {status: "rejected"}), -1);
    assert.equal(approvedDelta({status: "approved"}, undefined), -1);
    assert.equal(approvedDelta({status: "approved"}, {status: "approved"}), 0);
  });
});
