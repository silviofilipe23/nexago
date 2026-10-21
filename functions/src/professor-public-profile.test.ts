import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  foldText,
  getProfessorPublicProfileCore,
  requestProfessorContactCore,
  searchProfessorsCore,
} from "./professor-public-profile";

const ME = "uMarcelo";
const NOW = new Date("2026-10-21T15:00:00Z");
/** Aparecida de Goiânia — perto da Arena CFC, longe da Arena Sul. */
const HERE = {lat: -16.69, lng: -49.27};

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("users/uMarcelo", {fullName: "Marcelo Alves"});
  fake.seedDoc("arenas/cfc", {name: "Arena CFC", city: "Goiânia", latitude: -16.6869, longitude: -49.2648});
  fake.seedDoc("arenas/sul", {name: "Arena Sul", city: "Anápolis", latitude: -16.33, longitude: -48.95});
  fake.seedDoc("arenas/cfc/publicProfessors/uJu", {
    arenaId: "cfc", professorUserId: "uJu", name: "Juliana Rocha", photoUrl: null,
    modalities: ["Beach Tennis"], relationshipType: "ARENA_STAFF", since: Timestamp.fromDate(new Date("2025-03-01T12:00:00Z")),
  });
  fake.seedDoc("arenas/sul/publicProfessors/uCa", {
    arenaId: "sul", professorUserId: "uCa", name: "Camila Lopes", photoUrl: null,
    modalities: ["Vôlei de Praia"], relationshipType: "INDEPENDENT", since: null,
  });
  fake.seedDoc("arenas/sul/publicProfessors/uJu", {
    arenaId: "sul", professorUserId: "uJu", name: "Juliana Rocha", photoUrl: "https://x/ju.jpg",
    modalities: ["Beach Tennis", "Futevôlei"], relationshipType: "INDEPENDENT", since: null,
  });
  // Juliana: particular publicada no perfil, dois planos ativos e um inativo.
  fake.seedDoc("professorAvailability/uJu", {weekly: {"1": [8]}, durationMin: 60, published: true, showOnProfile: true});
  fake.seedDoc("professors/uJu/plans/p1", {name: "Avulsa", kind: "single", priceReais: 130, active: true});
  fake.seedDoc("professors/uJu/plans/p2", {name: "Pacote 4", kind: "package", priceReais: 460, classes: 4, active: true});
  fake.seedDoc("professors/uJu/plans/p3", {name: "Velho", kind: "single", priceReais: 50, active: false});
  // Camila: planos, mas sem disponibilidade publicada → preço não aparece.
  fake.seedDoc("professors/uCa/plans/p1", {name: "Avulsa", kind: "single", priceReais: 100, active: true});
  // Estrelas dos feedbacks.
  fake.seedDoc("lessonPlanViews/v1", {professorUid: "uJu", athleteId: "a1", rating: {stars: 5}});
  fake.seedDoc("lessonPlanViews/v2", {professorUid: "uJu", athleteId: "a2", rating: {stars: 4}});
  fake.seedDoc("lessonPlanViews/v3", {professorUid: "uJu", athleteId: "a3"});
  return {fake, db: fake as unknown as Firestore};
}

async function rejects(p: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(p, (e: unknown) => e instanceof HttpsError && e.code === code);
}

describe("searchProfessors", () => {
  it("agrupa por professor, ordena pela distância e traz nota e preço", async () => {
    const {db} = makeDb();
    const out = await searchProfessorsCore(db, ME, HERE);
    assert.deepEqual(out.items.map((c) => c.professorUid), ["uJu", "uCa"]);
    const ju = out.items[0];
    assert.equal(ju.arenas.length, 2);
    assert.equal(ju.arenas[0].arenaName, "Arena CFC");
    assert.ok(ju.nearestKm != null && ju.nearestKm < 3);
    assert.deepEqual(ju.modalities, ["Beach Tennis", "Futevôlei"]);
    assert.equal(ju.photoUrl, "https://x/ju.jpg");
    assert.equal(ju.rating, 4.5);
    assert.equal(ju.ratingCount, 2);
    assert.equal(ju.priceFromReais, 130);
    assert.equal(ju.acceptsPrivate, true);
    const ca = out.items[1];
    assert.equal(ca.priceFromReais, null, "sem particular publicada, sem preço");
    assert.equal(ca.acceptsPrivate, false);
    assert.deepEqual(out.modalities, ["Beach Tennis", "Futevôlei", "Vôlei de Praia"]);
  });

  it("filtra por modalidade e por texto (sem acento)", async () => {
    const {db} = makeDb();
    assert.deepEqual((await searchProfessorsCore(db, ME, {sport: "volei de praia"})).items.map((c) => c.professorUid), ["uCa"]);
    assert.deepEqual((await searchProfessorsCore(db, ME, {query: "anapolis"})).items.map((c) => c.professorUid).sort(), ["uCa", "uJu"]);
    assert.deepEqual((await searchProfessorsCore(db, ME, {query: "juli"})).items.map((c) => c.professorUid), ["uJu"]);
  });

  it("o próprio professor não aparece para ele", async () => {
    const {db} = makeDb();
    const out = await searchProfessorsCore(db, "uJu", {});
    assert.deepEqual(out.items.map((c) => c.professorUid), ["uCa"]);
  });

  it("foldText", () => {
    assert.equal(foldText("  Vôlei de PRAIA "), "volei de praia");
  });
});

describe("getProfessorPublicProfile", () => {
  it("perfil da vitrine com planos ativos e desde quando", async () => {
    const {db} = makeDb();
    const p = await getProfessorPublicProfileCore(db, ME, {professorUid: "uJu", ...HERE}, NOW);
    assert.equal(p.name, "Juliana Rocha");
    assert.deepEqual(p.plans.map((x) => x.priceReais), [130, 460]);
    assert.equal(p.since, "2025-03-01");
    assert.equal(p.isMyProfessor, false);
    assert.equal(p.contactRequested, false);
    assert.equal(p.arenas[0].relationshipType, "ARENA_STAFF");
  });

  it("fora da vitrine: só para o aluno dele", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("users/uTh", {fullName: "Thiago Mendes", photoUrl: "https://x/th.jpg"});
    await rejects(getProfessorPublicProfileCore(db, ME, {professorUid: "uTh"}, NOW), "not-found");
    fake.seedDoc(`professors/uTh/students/${ME}`, {athleteId: ME, status: "active"});
    const p = await getProfessorPublicProfileCore(db, ME, {professorUid: "uTh"}, NOW);
    assert.equal(p.name, "Thiago Mendes");
    assert.equal(p.isMyProfessor, true);
    assert.equal(p.arenas.length, 0);
  });
});

describe("requestProfessorContact", () => {
  it("avisa o professor uma vez por semana", async () => {
    const {db} = makeDb();
    const pushes: Array<Record<string, unknown>> = [];
    const deps = {now: () => NOW, notify: async (i: Record<string, unknown>) => {
      pushes.push(i);
    }};
    await requestProfessorContactCore(db, ME, {professorUid: "uJu", message: "Quero aula de saque"}, deps as never);
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0]["userId"], "uJu");
    assert.equal(pushes[0]["title"], "Marcelo Alves quer treinar com você");
    assert.equal((pushes[0]["data"] as Record<string, unknown>)["url"], `/athlete/profile?userId=${ME}`);

    await rejects(requestProfessorContactCore(db, ME, {professorUid: "uJu"}, deps as never), "already-exists");
    const p = await getProfessorPublicProfileCore(db, ME, {professorUid: "uJu"}, NOW);
    assert.equal(p.contactRequested, true);

    const later = {...deps, now: () => new Date(NOW.getTime() + 8 * 86_400_000)};
    await requestProfessorContactCore(db, ME, {professorUid: "uJu"}, later as never);
    assert.equal(pushes.length, 2);
  });

  it("fora da vitrine, já aluno ou a si mesmo", async () => {
    const {fake, db} = makeDb();
    const deps = {now: () => NOW, notify: async () => undefined};
    await rejects(requestProfessorContactCore(db, ME, {professorUid: "uNinguem"}, deps as never), "not-found");
    fake.seedDoc(`professors/uJu/students/${ME}`, {athleteId: ME, status: "active"});
    await rejects(requestProfessorContactCore(db, ME, {professorUid: "uJu"}, deps as never), "failed-precondition");
    await rejects(requestProfessorContactCore(db, "uJu", {professorUid: "uJu"}, deps as never), "invalid-argument");
  });
});
