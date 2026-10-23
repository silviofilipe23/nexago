import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {Timestamp} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {submitClassReviewCore} from "./class-review";
import {
  getClassReviewsForManagerCore,
  getMyProfessorReviewsCore,
  replyClassReviewTicketCore,
  toManagerReview,
  type ReplyNotice,
} from "./class-review-manager";

// Aula terça 20/10/2026 19:00–20:00 (SP); "agora" = quarta 21/10 12:00 SP.
const NOW = new Date(Date.UTC(2026, 9, 21, 15, 0, 0));

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

const low = {
  class: {stars: 2, tags: ["Pouco tempo de bola"]},
  professor: {stars: 4, tags: ["Pontual"]},
  place: {stars: 1, tags: ["Iluminação"]},
};
const good = {
  class: {stars: 5, tags: []},
  professor: {stars: 5, tags: []},
  place: {stars: 4, tags: []},
};

function seedArena(fake: FakeFirestore): void {
  fake.seedDoc("arenas/cfc", {name: "Arena CFC", managerUserId: "gestor"});
  fake.seedDoc("users/gestor", {fullName: "Marcos Lima"});
  fake.seedDoc("users/carla", {fullName: "Carla Souza"});
  fake.seedDoc("users/bia", {fullName: "Bia Torres"});
  fake.seedDoc("arenaClassSessions/s1", {
    arenaId: "cfc", arenaName: "Arena CFC", className: "Intermediário B",
    date: "2026-10-20", startTime: "19:00", endTime: "20:00",
    teacherUserId: "prof-ju", teacherName: "Juliana Rocha",
    attendance: {carla: {mark: "present"}, bia: {mark: "present"}},
  });
}

/** Carla anônima com chamado; Bia com nome, sem chamado. */
async function seedReviews(fake: FakeFirestore): Promise<{anonId: string}> {
  seedArena(fake);
  const anon = await submitClassReviewCore(db(fake), "carla",
    {origin: "arena", sessionId: "s1", scores: low, comment: "Refletor apagado.", showName: false, wantsContact: true}, NOW);
  await submitClassReviewCore(db(fake), "bia", {origin: "arena", sessionId: "s1", scores: good, comment: "Ótima!"}, NOW);
  return {anonId: anon.publicId};
}

describe("class-review-manager · listar", () => {
  it("anônima: sem uid, nome, id do doc nem instantes — em nenhum lugar do payload", async () => {
    const fake = new FakeFirestore();
    await seedReviews(fake);
    const page = await getClassReviewsForManagerCore(db(fake), "gestor", {kind: "arena", placeId: "cfc"});
    assert.equal(page.total, 2);
    assert.equal(page.openTickets, 1);
    const [first, second] = page.reviews;
    // Chamado aberto primeiro.
    assert.equal(first.anonymous, true);
    assert.equal(first.ticket?.status, "open");
    assert.equal(first.athleteName, null);
    assert.equal(first.reviewedOn, null);
    assert.equal(first.comment, "Refletor apagado.");
    assert.deepEqual(first.scores.place, {stars: 1, tags: ["Iluminação"]});
    const raw = JSON.stringify(first);
    for (const leak of ["carla", "Carla", "a_s1_", "openedAt", "createdAt", "updatedAt", "uid"]) {
      assert.equal(raw.includes(leak), false, `vazou "${leak}"`);
    }
    // Com nome: o nome e o dia do envio aparecem.
    assert.equal(second.athleteName, "Bia Torres");
    assert.equal(second.reviewedOn, "2026-10-21");
    assert.equal(JSON.stringify(second).includes("\"bia\""), false);
    assert.deepEqual(page.averages, {class: 3.5, professor: 4.5, place: 2.5});
    assert.deepEqual([page.rating, page.ratingCount], [null, 2]);
  });

  it("avaliação antiga sem publicId ganha um ao listar", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    fake.seedDoc("classReviews/a_s1_carla", {
      uid: "carla", origin: "arena", arenaId: "cfc", placeId: "cfc", showName: false,
      date: "2026-10-20", startTime: "19:00", title: "Intermediário B", scores: good, comment: "",
    });
    const page = await getClassReviewsForManagerCore(db(fake), "gestor", {kind: "arena", placeId: "cfc"});
    const id = page.reviews[0].id;
    assert.match(id, /^[0-9a-f]{20}$/);
    assert.equal((await db(fake).doc("classReviews/a_s1_carla").get()).data()!["publicId"], id);
  });

  it("só quem tem a agenda da arena; centro só owner/admin ativo", async () => {
    const fake = new FakeFirestore();
    await seedReviews(fake);
    await assert.rejects(
      getClassReviewsForManagerCore(db(fake), "carla", {kind: "arena", placeId: "cfc"}),
      {code: "permission-denied"},
    );
    fake.seedDoc("trainingCenters/elv", {name: "CT Elevação", ownerUid: "dono"});
    fake.seedDoc("trainingCenters/elv/centerMembers/dono", {role: "center_owner", status: "active"});
    fake.seedDoc("trainingCenters/elv/centerMembers/coach", {role: "center_coach", status: "active"});
    await assert.rejects(
      getClassReviewsForManagerCore(db(fake), "coach", {kind: "center", placeId: "elv"}),
      {code: "permission-denied"},
    );
    const page = await getClassReviewsForManagerCore(db(fake), "dono", {kind: "center", placeId: "elv"});
    assert.equal(page.placeName, "CT Elevação");
    assert.equal(page.total, 0);
    await assert.rejects(
      getClassReviewsForManagerCore(db(fake), "gestor", {kind: "quadra", placeId: "cfc"}),
      {code: "invalid-argument"},
    );
  });

  it("pagina de 50 em 50", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    for (let i = 0; i < 55; i++) {
      fake.seedDoc(`classReviews/r${i}`, {
        uid: `u${i}`, publicId: `p${String(i).padStart(3, "0")}`, origin: "arena", arenaId: "cfc", placeId: "cfc",
        showName: true, date: "2026-10-20", startTime: "19:00", scores: good,
      });
    }
    const p1 = await getClassReviewsForManagerCore(db(fake), "gestor", {kind: "arena", placeId: "cfc"});
    assert.equal(p1.reviews.length, 50);
    assert.equal(p1.nextCursor, "50");
    const p2 = await getClassReviewsForManagerCore(db(fake), "gestor", {kind: "arena", placeId: "cfc", cursor: p1.nextCursor});
    assert.equal(p2.reviews.length, 5);
    assert.equal(p2.nextCursor, null);
  });
});

describe("class-review-manager · responder", () => {
  it("grava a resposta, avisa a aluna e não devolve quem ela é", async () => {
    const fake = new FakeFirestore();
    const {anonId} = await seedReviews(fake);
    const sent: ReplyNotice[] = [];
    const later = new Date(NOW.getTime() + 3_600_000);
    const r = await replyClassReviewTicketCore(db(fake), "gestor",
      {reviewId: anonId, reply: "Trocamos os refletores da quadra 2.", resolve: true}, later,
      async (n) => { sent.push(n); });
    assert.equal(r.status, "resolved");
    assert.equal(r.review.athleteName, null);
    assert.equal(JSON.stringify(r.review).includes("carla"), false);
    const doc = (await db(fake).doc("classReviews/a_s1_carla").get()).data()!;
    const ticket = doc["ticket"] as Record<string, unknown>;
    assert.equal(ticket["status"], "resolved");
    assert.equal(ticket["reply"], "Trocamos os refletores da quadra 2.");
    assert.equal(ticket["repliedByName"], "Marcos Lima");
    assert.equal((ticket["repliedAt"] as Timestamp).toDate().getTime(), later.getTime());
    assert.deepEqual(sent, [{athleteUid: "carla", placeName: "Arena CFC", title: "Intermediário B", date: "2026-10-20", resolved: true}]);
  });

  it("responder sem resolver = answered; aceita só o handle público", async () => {
    const fake = new FakeFirestore();
    const {anonId} = await seedReviews(fake);
    const r = await replyClassReviewTicketCore(db(fake), "gestor", {reviewId: anonId, reply: "Vamos ver."});
    assert.equal(r.status, "answered");
    // O id do doc (que carrega o uid) não serve de handle.
    await assert.rejects(
      replyClassReviewTicketCore(db(fake), "gestor", {reviewId: "a_s1_carla", reply: "x"}),
      {code: "not-found"},
    );
  });

  it("sem chamado, sem resposta; sem acesso, sem resposta; texto obrigatório", async () => {
    const fake = new FakeFirestore();
    const {anonId} = await seedReviews(fake);
    const named = toManagerReview((await db(fake).doc("classReviews/a_s1_bia").get()).data()!);
    await assert.rejects(
      replyClassReviewTicketCore(db(fake), "gestor", {reviewId: named.id, reply: "Obrigado!"}),
      {code: "failed-precondition"},
    );
    await assert.rejects(
      replyClassReviewTicketCore(db(fake), "bia", {reviewId: anonId, reply: "oi"}),
      {code: "permission-denied"},
    );
    await assert.rejects(
      replyClassReviewTicketCore(db(fake), "gestor", {reviewId: anonId, reply: "   "}),
      {code: "invalid-argument"},
    );
  });

  it("a aluna edita depois da resposta: a resposta fica", async () => {
    const fake = new FakeFirestore();
    const {anonId} = await seedReviews(fake);
    await replyClassReviewTicketCore(db(fake), "gestor", {reviewId: anonId, reply: "Resolvido.", resolve: true});
    await submitClassReviewCore(db(fake), "carla",
      {origin: "arena", sessionId: "s1", scores: good, showName: false}, new Date(NOW.getTime() + 86_400_000));
    const doc = (await db(fake).doc("classReviews/a_s1_carla").get()).data()!;
    assert.equal(doc["publicId"], anonId);
    assert.equal((doc["ticket"] as Record<string, unknown>)["reply"], "Resolvido.");
  });
});

describe("class-review-manager · professor", () => {
  it("só a parte do professor e o comentário; anônima sem nome", async () => {
    const fake = new FakeFirestore();
    await seedReviews(fake);
    const r = await getMyProfessorReviewsCore(db(fake), "prof-ju");
    assert.equal(r.count, 2);
    assert.equal(r.rating, 4.5);
    const anon = r.reviews.find((x) => x.anonymous)!;
    assert.equal(anon.athleteName, null);
    assert.deepEqual([anon.stars, anon.tags, anon.comment], [4, ["Pontual"], "Refletor apagado."]);
    const raw = JSON.stringify(r.reviews);
    for (const leak of ["carla", "Iluminação", "ticket", "\"place\""]) {
      assert.equal(raw.includes(leak), false, `vazou "${leak}"`);
    }
    assert.equal(r.reviews.find((x) => !x.anonymous)!.athleteName, "Bia Torres");
  });
});
