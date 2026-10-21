import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {type Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {classSessionId} from "./arena-class-constants";
import {allowsStoryTags, loadTeacherClassSessionRosterCore} from "./arena-class-teacher";
import {
  CLASS_STORY_TAG_NOTIFICATION_TYPE,
  classStoryPerson,
  sanitizeClassStoryPlan,
  sanitizeClassStoryShow,
  shareClassStoryCore,
  type ShareClassStoryDeps,
} from "./class-story-share";
import {arenaProfessorLinkId, defaultArenaProfessorPermissions} from "./arena-professor-links";

const MONDAY = "2026-10-26";
const TEACHER = "uThiago";
const SESSION = classSessionId("c1", MONDAY);
const OPT_IN = {privacyPreferences: {showOthers: {storyTags: true}}};

function setup(over: Record<string, unknown> = {}): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc(`arenaProfessors/${arenaProfessorLinkId("arena1", TEACHER)}`, {
    arenaId: "arena1", professorUserId: TEACHER, relationshipType: "ARENA_STAFF", status: "ACTIVE",
    initiatedBy: "ARENA", permissions: defaultArenaProfessorPermissions("ARENA_STAFF"),
  });
  fake.seedDoc(`arenaClassSessions/${SESSION}`, {
    classId: "c1", arenaId: "arena1", arenaName: "Arena CFC", className: "Intermediário B", type: "turma",
    teacherUserId: TEACHER, teacherName: "Thiago Mendes", courtName: "Quadra 2", date: MONDAY,
    startTime: "19:00", endTime: "20:00", status: "completed",
    attendance: {
      s1: {mark: "present", name: "Marina Torres"},
      s2: {mark: "present", name: "Elisa Prado"},
      s3: {mark: "present", name: "Rafael Souza"},
      s4: {mark: "absent", name: "Felipe Rocha"},
      mk: {mark: "present", name: "Lia"},
    },
    extras: {mk: {name: "Lia", kind: "makeup", creditId: "cr1", athleteId: "uLia"}},
    ...over,
  });
  const students: Array<[string, Record<string, unknown>]> = [
    ["s1", {name: "Marina Torres", athleteId: "uMarina", photoUrl: "https://x/m.jpg"}],
    ["s2", {name: "Elisa Prado", athleteId: "uElisa"}],
    ["s3", {name: "Rafael Souza", athleteId: "uRafael"}], // não liberou
    ["s4", {name: "Felipe Rocha", athleteId: "uFelipe"}], // liberou, mas faltou
    ["g1", {name: "Convidado", athleteId: null}],
  ];
  for (const [id, data] of students) {
    fake.seedDoc(`arenaClasses/c1/classStudents/${id}`, {classId: "c1", arenaId: "arena1", status: "active", ...data});
  }
  fake.seedDoc("users/uMarina", OPT_IN);
  fake.seedDoc("users/uElisa", OPT_IN);
  fake.seedDoc("users/uRafael", {privacyPreferences: {showOthers: {storyTags: false}}});
  fake.seedDoc("users/uFelipe", OPT_IN);
  fake.seedDoc("users/uLia", OPT_IN);
  fake.seedDoc(`users/${TEACHER}`, {nickname: "prof.thiagomendes", fullName: "Thiago Mendes"});
  return {fake, db: fake as unknown as Firestore};
}

function recorder(): {deps: ShareClassStoryDeps; sent: Array<{userId: string; type: string; data: Record<string, string>}>} {
  const sent: Array<{userId: string; type: string; data: Record<string, string>}> = [];
  return {sent, deps: {notify: async (input) => {
    sent.push({userId: input.userId, type: input.type, data: input.data});
  }}};
}

function tagDocs(fake: FakeFirestore): Map<string, Record<string, unknown>> {
  return new Map([...fake.store.entries()].filter(([path]) => path.startsWith("classStoryTags/")));
}

async function rejectsWith(promise: Promise<unknown>, code: string, pattern?: RegExp): Promise<void> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof HttpsError, `esperava HttpsError, veio ${String(error)}`);
    assert.equal(error.code, code, error.message);
    if (pattern) assert.match(error.message, pattern);
    return;
  }
  assert.fail(`esperava ${code}`);
}

const ALL = ["s1", "s2", "s3", "s4", "mk", "g1"];
const input = (studentIds = ALL) => ({
  sessionId: SESSION,
  studentIds,
  plan: [{minutes: 10, label: "Aquecimento"}],
  show: {plan: true, numbers: true, place: true},
});

describe("marcação no story: opt-in do perfil", () => {
  it("só `storyTags: true` libera; sem a chave é não", () => {
    assert.equal(allowsStoryTags(OPT_IN), true);
    assert.equal(allowsStoryTags({}), false);
    assert.equal(allowsStoryTags(undefined), false);
    assert.equal(allowsStoryTags({privacyPreferences: {showOthers: {storyTags: "sim"}}}), false);
  });

  it("a chamada do professor diz quem liberou, sem expor uid nem a preferência", async () => {
    const {db} = setup();
    const {students} = await loadTeacherClassSessionRosterCore(db, SESSION, TEACHER, MONDAY);
    const byId = new Map(students.map((s) => [s.studentId, s]));
    assert.equal(byId.get("s1")!.storyTaggable, true);
    assert.equal(byId.get("s3")!.storyTaggable, false);
    assert.equal(byId.get("g1")!.storyTaggable, false); // sem conta
    assert.equal(byId.get("mk")!.storyTaggable, true); // encaixe com conta
    for (const s of students) {
      assert.ok(!("athleteId" in s));
      assert.ok(!JSON.stringify(s).includes("uMarina"));
    }
  });
});

describe("shareClassStory", () => {
  it("marca só presentes que liberaram; cada um ganha o próprio doc e um aviso", async () => {
    const {fake, db} = setup();
    const {deps, sent} = recorder();
    const result = await shareClassStoryCore(db, input(), TEACHER, MONDAY, deps);
    assert.deepEqual(result, {tagged: 3, notified: 3});
    assert.deepEqual(sent.map((s) => s.userId).sort(), ["uElisa", "uLia", "uMarina"]);
    assert.ok(sent.every((s) => s.type === CLASS_STORY_TAG_NOTIFICATION_TYPE));
    assert.equal(sent.find((s) => s.userId === "uMarina")!.data["url"], `/story-do-treino/${SESSION}_uMarina`);

    const docs = tagDocs(fake);
    assert.deepEqual([...docs.keys()].sort(), [
      `classStoryTags/${SESSION}_uElisa`, `classStoryTags/${SESSION}_uLia`, `classStoryTags/${SESSION}_uMarina`,
    ]);
    const marina = docs.get(`classStoryTags/${SESSION}_uMarina`)!;
    assert.equal(marina["uid"], "uMarina");
    assert.equal(marina["teacherHandle"], "@prof.thiagomendes");
    assert.equal(marina["presentCount"], 4);
    assert.deepEqual(marina["plan"], [{minutes: 10, label: "Aquecimento"}]);
    assert.deepEqual((marina["people"] as Array<{firstName: string}>).map((p) => p.firstName), ["Elisa", "Marina", "Lia"]);
    // Nada de quem não liberou ou faltou, nem uid dos colegas.
    const text = JSON.stringify(marina);
    for (const leak of ["Rafael", "Felipe", "uElisa", "uLia", "absent"]) assert.ok(!text.includes(leak), leak);
  });

  it("postar de novo não reavisa; quem saiu da seleção perde o doc", async () => {
    const {fake, db} = setup();
    const first = recorder();
    await shareClassStoryCore(db, input(), TEACHER, MONDAY, first.deps);
    const again = recorder();
    const result = await shareClassStoryCore(db, input(["s1"]), TEACHER, MONDAY, again.deps);
    assert.deepEqual(result, {tagged: 1, notified: 0});
    assert.equal(again.sent.length, 0);
    assert.deepEqual([...tagDocs(fake).keys()], [`classStoryTags/${SESSION}_uMarina`]);
  });

  it("aluno que desligou a marcação no meio do caminho não é marcado", async () => {
    const {fake, db} = setup();
    fake.seedDoc("users/uElisa", {});
    const {deps, sent} = recorder();
    await shareClassStoryCore(db, input(["s1", "s2"]), TEACHER, MONDAY, deps);
    assert.deepEqual(sent.map((s) => s.userId), ["uMarina"]);
  });

  it("sem marcar ninguém não grava nem avisa", async () => {
    const {fake, db} = setup();
    const {deps, sent} = recorder();
    assert.deepEqual(await shareClassStoryCore(db, input([]), TEACHER, MONDAY, deps), {tagged: 0, notified: 0});
    assert.equal(sent.length, 0);
    assert.equal(tagDocs(fake).size, 0);
  });

  it("aula cancelada, futura, de outro professor ou sem a permissão recusa", async () => {
    const {deps} = recorder();
    await rejectsWith(shareClassStoryCore(setup({status: "canceled"}).db, input(), TEACHER, MONDAY, deps),
      "failed-precondition", /cancelada/);
    await rejectsWith(shareClassStoryCore(setup().db, input(), TEACHER, "2026-10-25", deps),
      "failed-precondition", /ainda não/);
    await rejectsWith(shareClassStoryCore(setup().db, input(), "uOutro", MONDAY, deps), "permission-denied");
    const {fake, db} = setup();
    fake.seedDoc(`arenaProfessors/${arenaProfessorLinkId("arena1", TEACHER)}`, {
      arenaId: "arena1", professorUserId: TEACHER, relationshipType: "ARENA_STAFF", status: "ACTIVE",
      initiatedBy: "ARENA",
      permissions: {...defaultArenaProfessorPermissions("ARENA_STAFF"), canManageOwnLessons: false},
    });
    await rejectsWith(shareClassStoryCore(db, input(), TEACHER, MONDAY, deps), "permission-denied");
  });
});

describe("entrada do story", () => {
  it("plano: limpa, corta e limita a 5 blocos", () => {
    const plan = sanitizeClassStoryPlan([
      {minutes: 10, label: "  Aquecimento "},
      {minutes: 0, label: "zero"},
      {minutes: 20, label: ""},
      {minutes: "15", label: "x".repeat(60)},
      "lixo",
      ...Array.from({length: 8}, (_, i) => ({minutes: 5, label: `B${i}`})),
    ]);
    assert.equal(plan.length, 5);
    assert.deepEqual(plan[0], {minutes: 10, label: "Aquecimento"});
    assert.equal(plan[1]!.label.length, 40);
    assert.deepEqual(sanitizeClassStoryPlan(null), []);
  });

  it("show: liga por padrão", () => {
    assert.deepEqual(sanitizeClassStoryShow(undefined), {plan: true, numbers: true, place: true});
    assert.deepEqual(sanitizeClassStoryShow({plan: false}), {plan: false, numbers: true, place: true});
  });

  it("iniciais e primeiro nome", () => {
    assert.deepEqual(classStoryPerson("Marina  Torres Lima", null), {firstName: "Marina", initials: "ML", photoUrl: null});
    assert.equal(classStoryPerson("Lia", null).initials, "L");
  });
});
