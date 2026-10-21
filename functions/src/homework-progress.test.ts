import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {saveHomeworkProgressCore} from "./homework-progress";
import {parseHomework, parseReviewInput} from "./professor-lesson-plans";

const ME = "uMarcelo";
const VIEW = "uThiago_session_s1_uMarcelo";
/** Feedback enviado ter 20/10 21:00 em SP (00:00Z do dia 21). */
const SENT = new Date("2026-10-21T00:00:00Z");
/** Qui 22/10 12:00 em SP. */
const NOW = new Date("2026-10-22T15:00:00Z");

function makeDb(homework: Record<string, unknown> | null = {name: "Lançamento + flexão", detail: "3×10", sets: 3, daysTarget: 3}) {
  const fake = new FakeFirestore();
  fake.seedDoc(`lessonPlanViews/${VIEW}`, {
    planId: "uThiago_session_s1", athleteId: ME, professorUid: "uThiago",
    feedback: {text: "Joelho melhor", homework, sentAt: Timestamp.fromDate(SENT)},
  });
  return {fake, db: fake as unknown as Firestore};
}

async function rejects(p: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(p, (e: unknown) => e instanceof HttpsError && e.code === code);
}

describe("parseHomework", () => {
  it("cliente antigo ganha 3×3; categoria e vídeo validados", () => {
    assert.deepEqual(parseHomework({name: "Lançamento", detail: "x"}), {
      name: "Lançamento", detail: "x", sets: 3, daysTarget: 3, category: null, videoUrl: null,
    });
    const hw = parseHomework({name: "A", sets: 5, daysTarget: 7, category: "saque", videoUrl: "https://v.example/x"});
    assert.equal(hw?.sets, 5);
    assert.equal(hw?.daysTarget, 7);
    assert.equal(hw?.category, "saque");
    assert.equal(hw?.videoUrl, "https://v.example/x");
    const bad = parseHomework({name: "A", sets: 99, daysTarget: 0, category: "xx", videoUrl: "http://inseguro"});
    assert.equal(bad?.sets, 3);
    assert.equal(bad?.daysTarget, 3);
    assert.equal(bad?.category, null);
    assert.equal(bad?.videoUrl, null);
    assert.equal(parseHomework({name: "  "}), null);
  });

  it("registro da aula leva os campos novos", () => {
    const input = parseReviewInput({
      planId: "p1",
      feedback: [{athleteId: ME, text: "ok", send: true, homework: {name: "A", sets: 4, daysTarget: 2}}],
    });
    assert.equal(input.feedback[0].homework?.sets, 4);
    assert.equal(input.feedback[0].homework?.daysTarget, 2);
  });
});

describe("saveHomeworkProgress", () => {
  it("grava as séries do dia e conta o dia completo", async () => {
    const {db} = makeDb();
    let out = await saveHomeworkProgressCore(db, ME, {viewId: VIEW, setsDone: 2}, NOW);
    assert.deepEqual(out.days, {"2026-10-22": 2});
    assert.equal(out.daysDone, 0);
    assert.equal(out.startKey, "2026-10-20");
    assert.equal(out.endKey, "2026-10-26");

    out = await saveHomeworkProgressCore(db, ME, {viewId: VIEW, dayKey: "2026-10-21", setsDone: 3}, NOW);
    assert.equal(out.daysDone, 1);
    const doc = (await db.doc(`homeworkProgress/${VIEW}`).get()).data() as Record<string, unknown>;
    assert.equal(doc["professorUid"], "uThiago");
    assert.equal(doc["athleteId"], ME);
    assert.deepEqual(doc["days"], {"2026-10-22": 2, "2026-10-21": 3});

    out = await saveHomeworkProgressCore(db, ME, {viewId: VIEW, setsDone: 0}, NOW);
    assert.deepEqual(out.days, {"2026-10-21": 3});
  });

  it("só o dono da visão", async () => {
    const {db} = makeDb();
    await rejects(saveHomeworkProgressCore(db, "outro", {viewId: VIEW, setsDone: 1}, NOW), "not-found");
  });

  it("sem tarefa, séries demais, dia futuro ou fora do prazo", async () => {
    await rejects(saveHomeworkProgressCore(makeDb(null).db, ME, {viewId: VIEW, setsDone: 1}, NOW), "failed-precondition");
    const {db} = makeDb();
    await rejects(saveHomeworkProgressCore(db, ME, {viewId: VIEW, setsDone: 4}, NOW), "invalid-argument");
    await rejects(saveHomeworkProgressCore(db, ME, {viewId: VIEW, dayKey: "2026-10-23", setsDone: 1}, NOW), "failed-precondition");
    await rejects(saveHomeworkProgressCore(db, ME, {viewId: VIEW, dayKey: "2026-10-19", setsDone: 1}, NOW), "failed-precondition");
    const late = new Date("2026-10-28T15:00:00Z");
    await rejects(saveHomeworkProgressCore(db, ME, {viewId: VIEW, setsDone: 1}, late), "failed-precondition");
  });

  it("tarefa reenviada zera a contagem", async () => {
    const {fake, db} = makeDb();
    await saveHomeworkProgressCore(db, ME, {viewId: VIEW, setsDone: 3}, NOW);
    fake.seedDoc(`lessonPlanViews/${VIEW}`, {
      planId: "uThiago_session_s1", athleteId: ME, professorUid: "uThiago",
      feedback: {text: "Nova", homework: {name: "Outra"}, sentAt: Timestamp.fromDate(new Date("2026-10-22T12:00:00Z"))},
    });
    const out = await saveHomeworkProgressCore(db, ME, {viewId: VIEW, setsDone: 1}, NOW);
    assert.deepEqual(out.days, {"2026-10-22": 1});
  });
});
