import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {Timestamp} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  assertReviewWindow,
  hasLowScore,
  loadProfessorReviewStars,
  submitClassReviewCore,
  summaryRating,
  validateScores,
} from "./class-review";
import {getArenaClassDirectoryCore} from "./class-directory";

const ATHLETE = "aluno";
// Aula terça 20/10/2026 19:00–20:00 (SP); "agora" = quarta 21/10 12:00 SP.
const NOW = new Date(Date.UTC(2026, 9, 21, 15, 0, 0));
const DAY = 86_400_000;

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedArena(fake: FakeFirestore, mark = "present"): void {
  fake.seedDoc("arenas/cfc", {name: "Arena CFC", managerUserId: "gestor"});
  fake.seedDoc("users/aluno", {fullName: "Carla Souza"});
  fake.seedDoc("arenaClassSessions/class_t1_2026-10-20", {
    arenaId: "cfc", arenaName: "Arena CFC", classId: "t1", className: "Intermediário B",
    date: "2026-10-20", startTime: "19:00", endTime: "20:00",
    teacherUserId: "prof-ju", teacherName: "Juliana Rocha",
    attendance: {[ATHLETE]: {mark, name: "Carla"}},
  });
}

const full = {
  class: {stars: 4, tags: ["Bom ritmo"]},
  professor: {stars: 5, tags: ["Pontual"]},
  place: {stars: 2, tags: ["Iluminação"]},
};

const arenaInput = (extra: Record<string, unknown> = {}) =>
  ({origin: "arena", sessionId: "class_t1_2026-10-20", scores: full, comment: "Refletores apagados.", ...extra});

describe("class-review · regras puras", () => {
  it("toda parte da origem é obrigatória; parte extra é descartada", () => {
    assert.throws(() => validateScores({class: {stars: 4}}, ["class", "professor"]), {code: "invalid-argument"});
    assert.throws(() => validateScores({professor: {stars: 6}}, ["professor"]), {code: "invalid-argument"});
    assert.throws(() => validateScores({professor: {stars: 3.5}}, ["professor"]), {code: "invalid-argument"});
    const s = validateScores({professor: {stars: 5, tags: ["a", "a", " "]}, place: {stars: 1}}, ["professor"]);
    assert.deepEqual(s, {class: null, professor: {stars: 5, tags: ["a"]}, place: null});
  });

  it("nota baixa = alguma parte ≤ 2", () => {
    assert.equal(hasLowScore({class: {stars: 3, tags: []}, professor: {stars: 5, tags: []}, place: null}), false);
    assert.equal(hasLowScore({class: null, professor: {stars: 2, tags: []}, place: null}), true);
  });

  it("janela: depois do fim; 7 dias para avaliar e 7 para editar", () => {
    const end = new Date(NOW.getTime() - DAY);
    assertReviewWindow(end, null, NOW);
    assert.throws(() => assertReviewWindow(new Date(NOW.getTime() + 1000), null, NOW), {code: "failed-precondition"});
    assert.throws(() => assertReviewWindow(new Date(NOW.getTime() - 8 * DAY), null, NOW), {code: "failed-precondition"});
    // Editar conta do 1º envio, mesmo com a aula fora da janela de avaliar.
    assertReviewWindow(new Date(NOW.getTime() - 10 * DAY), new Date(NOW.getTime() - 6 * DAY), NOW);
    assert.throws(() => assertReviewWindow(end, new Date(NOW.getTime() - 8 * DAY), NOW), {code: "failed-precondition"});
  });

  it("média pública só com 3+", () => {
    assert.deepEqual(summaryRating({sum: 9, count: 2}), {rating: null, count: 2});
    assert.deepEqual(summaryRating({sum: 13, count: 3}), {rating: 4.3, count: 3});
  });
});

describe("class-review · arena", () => {
  it("grava, abre chamado na nota baixa e soma no resumo do local", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    const notified: string[] = [];
    const r = await submitClassReviewCore(db(fake), ATHLETE, arenaInput({wantsContact: true}), NOW,
      async (uid) => { notified.push(uid); });
    assert.equal(r.created, true);
    assert.equal(r.ticketOpened, true);
    assert.deepEqual(notified, ["gestor"]);
    const doc = (await db(fake).doc(`classReviews/${r.reviewId}`).get()).data()!;
    assert.equal(doc["professorUid"], "prof-ju");
    assert.equal(doc["athleteName"], "Carla Souza");
    assert.equal((doc["ticket"] as Record<string, unknown>)["status"], "open");
    const sum = (await db(fake).doc("classReviewSummaries/arena_cfc").get()).data()!;
    assert.deepEqual([sum["sum"], sum["count"]], [2, 1]);
  });

  it("editar aplica a diferença no resumo e não reabre o chamado", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    const notified: string[] = [];
    const notify = async (uid: string) => { notified.push(uid); };
    await submitClassReviewCore(db(fake), ATHLETE, arenaInput({wantsContact: true}), NOW, notify);
    const later = new Date(NOW.getTime() + DAY);
    const r = await submitClassReviewCore(db(fake), ATHLETE,
      arenaInput({scores: {...full, place: {stars: 4, tags: []}}, wantsContact: false}), later, notify);
    assert.equal(r.created, false);
    assert.deepEqual(notified, ["gestor"]);
    const sum = (await db(fake).doc("classReviewSummaries/arena_cfc").get()).data()!;
    assert.deepEqual([sum["sum"], sum["count"]], [4, 1]);
    // Chamado ainda aberto e sem nota baixa: some (o aluno desistiu do retorno).
    const doc = (await db(fake).doc(`classReviews/${r.reviewId}`).get()).data()!;
    assert.equal(doc["ticket"], null);
  });

  it("sem presença, sem avaliação; nome escondido não grava o nome", async () => {
    const fake = new FakeFirestore();
    seedArena(fake, "absent");
    await assert.rejects(submitClassReviewCore(db(fake), ATHLETE, arenaInput(), NOW), {code: "failed-precondition"});
    const ok = new FakeFirestore();
    seedArena(ok);
    const r = await submitClassReviewCore(db(ok), ATHLETE, arenaInput({showName: false}), NOW);
    const doc = (await db(ok).doc(`classReviews/${r.reviewId}`).get()).data()!;
    assert.equal(doc["athleteName"], null);
    assert.equal(doc["showName"], false);
  });

  it("o diretório mostra a média do local a partir de 3 avaliações", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    fake.seedDoc("classReviewSummaries/arena_cfc", {sum: 14, count: 3});
    const d = await getArenaClassDirectoryCore(db(fake), "cfc", null, NOW);
    assert.deepEqual([d.rating, d.ratingCount], [4.7, 3]);
  });

  it("a nota do professor entra na busca dele", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    await submitClassReviewCore(db(fake), ATHLETE, arenaInput(), NOW);
    assert.deepEqual(await loadProfessorReviewStars(db(fake), "prof-ju"), [5]);
  });
});

describe("class-review · centro e particular", () => {
  it("CT: presença pelo cadastro do aluno (students.uid)", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("trainingCenters/elv", {name: "CT Elevação", ownerUid: "dono", status: "active"});
    fake.seedDoc("trainingCenters/elv/students/s1", {uid: ATHLETE, name: "Carla"});
    fake.seedDoc("trainingCenters/elv/sessions/c1_2026-10-20", {
      className: "Performance", date: "2026-10-20", startTime: "07:00", durationMin: 90,
      coachUid: "prof-pv", coachName: "Paula Viana", attendance: {s1: "present"},
    });
    const r = await submitClassReviewCore(db(fake), ATHLETE,
      {origin: "center", centerId: "elv", sessionId: "c1_2026-10-20", scores: full}, NOW);
    assert.equal(r.reviewId, "ct_elv_c1_2026-10-20_aluno");
    const sum = (await db(fake).doc("classReviewSummaries/center_elv").get()).data()!;
    assert.equal(sum["count"], 1);
  });

  it("particular: só professor; nada de chamado nem resumo de local", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("professorPrivateLessons/l1", {
      athleteId: ATHLETE, professorUid: "prof-tm", professorName: "Thiago Mendes", status: "confirmed",
      startAt: Timestamp.fromDate(new Date(NOW.getTime() - 2 * DAY)),
      endAt: Timestamp.fromDate(new Date(NOW.getTime() - 2 * DAY + 3_600_000)),
    });
    const r = await submitClassReviewCore(db(fake), ATHLETE,
      {origin: "private", lessonId: "l1", scores: {professor: {stars: 1, tags: []}}, wantsContact: true}, NOW);
    assert.equal(r.ticketOpened, false);
    const doc = (await db(fake).doc(`classReviews/${r.reviewId}`).get()).data()!;
    assert.deepEqual(doc["scores"], {class: null, professor: {stars: 1, tags: []}, place: null});
    assert.equal((await db(fake).doc("classReviewSummaries/private_null").get()).exists, false);
  });

  it("particular de outro aluno = permission-denied", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("professorPrivateLessons/l1", {athleteId: "outro", status: "confirmed"});
    await assert.rejects(
      submitClassReviewCore(db(fake), ATHLETE, {origin: "private", lessonId: "l1", scores: {professor: {stars: 5}}}, NOW),
      {code: "permission-denied"},
    );
  });
});
