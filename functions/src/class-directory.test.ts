import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  getArenaClassDirectoryCore,
  getCenterClassDirectoryCore,
  pickHighlight,
  priceFrom,
  searchClassDirectoryCore,
  type DirectoryClass,
} from "./class-directory";

// Quinta, 22/10/2026 15:00 em São Paulo.
const NOW = new Date(Date.UTC(2026, 9, 22, 18, 0, 0));

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedArena(fake: FakeFirestore): void {
  fake.seedDoc("arenas/cfc", {name: "Arena CFC", city: "Goiânia", state: "GO", latitude: -16.7, longitude: -49.26, whatsapp: "62999990000", address: "Av. Independência, 1200"});
  fake.seedDoc("arenaClasses/t1", {arenaId: "cfc", status: "active", type: "turma", name: "Intermediário B", level: "intermediario", sport: "Vôlei de praia", weekdays: [1, 3], startTime: "19:00", endTime: "20:00", teacherName: "Thiago Mendes", teacherUserId: "uThiago", courtName: "Quadra 2", capacity: 8, studentCount: 6});
  fake.seedDoc("arenaClasses/t2", {arenaId: "cfc", status: "active", type: "turma", name: "Iniciante", level: "iniciante", sport: "Vôlei de praia", weekdays: [5], startTime: "18:00", endTime: "19:00", teacherName: "Juliana Rocha", capacity: 10, studentCount: 10});
  // Fora da vitrine: avulsa, inativa, encerrada.
  fake.seedDoc("arenaClasses/p1", {arenaId: "cfc", status: "active", type: "particular", name: "Particular", weekdays: [], startTime: "07:00", capacity: 1});
  fake.seedDoc("arenaClasses/x1", {arenaId: "cfc", status: "archived", type: "turma", name: "Velha", weekdays: [2], startTime: "07:00", capacity: 8});
  fake.seedDoc("arenaClasses/x2", {arenaId: "cfc", status: "active", type: "turma", name: "Encerrada", weekdays: [2], startTime: "07:00", capacity: 8, endDate: "2026-09-30"});
  fake.seedDoc("arenas/cfc/classPlans/m2", {name: "2× semana", kind: "monthly", priceReais: 220, classesPerWeek: 2, status: "active"});
  fake.seedDoc("arenas/cfc/classPlans/m1", {name: "1× semana", kind: "monthly", priceReais: 140, classesPerWeek: 1, status: "active"});
  fake.seedDoc("arenas/cfc/classPlans/old", {name: "Antigo", kind: "monthly", priceReais: 90, status: "archived"});
  fake.seedDoc("arenas/cfc/publicProfessors/uThiago", {name: "Thiago Mendes", professorUserId: "uThiago", photoUrl: "https://x/t.jpg", relationshipType: "ARENA_STAFF"});
  fake.seedDoc("arenas/cfc/classSettings/rules", {makeupNoticeHours: 4, enrollmentFeeReais: 50});
}

function seedCenter(fake: FakeFirestore): void {
  fake.seedDoc("trainingCenters/elv", {name: "CT Elevação", status: "active", city: "Goiânia", state: "GO", sports: ["Vôlei de praia"], contactPhone: "62988887777", cnpj: "00.000.000/0001-00", ownerUid: "dono"});
  fake.seedDoc("trainingCenters/elv/programs/comp", {name: "Competição", color: "#B48CFF", levels: ["Avançado"], order: 1});
  fake.seedDoc("trainingCenters/elv/programs/vazio", {name: "Sem turma", levels: [], order: 2});
  fake.seedDoc("trainingCenters/elv/classes/c1", {name: "Competição manhã", programId: "comp", level: "Avançado", coachName: "Rafael", weekdays: [1, 3, 5], startTime: "06:00", durationMin: 120, locationName: "Sede", capacity: 12, seatsTaken: 9, status: "active", rosterStudentIds: ["s1"]});
  fake.seedDoc("trainingCenters/elv/plans/p1", {name: "Competição 4x", type: "monthly", priceCents: 48000, classesPerWeek: 4, programIds: ["comp"], status: "active", featured: true});
  fake.seedDoc("trainingCenters/elv/locations/l1", {name: "Sede Elevação", type: "own", address: "Rua 1", status: "active", isPrimary: true});
  fake.seedDoc("trainingCenters/elv/students/s1", {uid: "aluno", name: "Aluno", phone: "62900000000"});
  fake.seedDoc("trainingCenters/pend", {name: "CT Pendente", status: "pending"});
}

describe("class-directory · busca", () => {
  it("lista arena com turma ativa e CT ativo, sem dado de aluno", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    seedCenter(fake);
    const items = await searchClassDirectoryCore(db(fake), {lat: -16.68, lng: -49.25, level: "intermediario"}, NOW);
    assert.equal(items.length, 2);

    const arena = items.find((i) => i.kind === "arena")!;
    assert.equal(arena.name, "Arena CFC");
    assert.equal(arena.classCount, 2);
    assert.equal(arena.openSpots, 2);
    assert.equal(arena.priceFromReais, 140);
    assert.ok(arena.distanceKm != null && arena.distanceKm < 5);
    assert.equal(arena.highlight?.className, "Intermediário B");
    assert.deepEqual(arena.levels.sort(), ["iniciante", "intermediario"]);
    assert.equal(arena.professorCount, 2);
    assert.equal(arena.schedule.length, 2);

    const center = items.find((i) => i.kind === "center")!;
    assert.equal(center.name, "CT Elevação");
    assert.equal(center.priceFromReais, 480);
    assert.equal(center.distanceKm, null);
    assert.ok(!JSON.stringify(items).includes("aluno"));
  });

  it("some a arena pré-cadastrada", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    fake.seedDoc("arenas/cfc", {name: "Arena CFC", isUnclaimed: true});
    const items = await searchClassDirectoryCore(db(fake), {}, NOW);
    assert.equal(items.length, 0);
  });
});

describe("class-directory · detalhe", () => {
  it("arena: turmas da vitrine, planos ativos e professores", async () => {
    const fake = new FakeFirestore();
    seedArena(fake);
    const d = await getArenaClassDirectoryCore(db(fake), "cfc", null, NOW);
    assert.deepEqual(d.classes.map((c) => c.name), ["Iniciante", "Intermediário B"]);
    assert.equal(d.classes[1].taken, 6);
    assert.deepEqual(d.plans.map((p) => p.priceReais), [140, 220]);
    assert.equal(d.contactPhone, "62999990000");
    assert.equal(d.makeupNoticeHours, 4);
    assert.equal(d.professors[0].professorUid, "uThiago");
    assert.ok(d.professors.some((p) => p.name === "Juliana Rocha"));
  });

  it("arena inexistente = not-found", async () => {
    await assert.rejects(getArenaClassDirectoryCore(db(new FakeFirestore()), "nada", null, NOW), {code: "not-found"});
  });

  it("CT: programas com turma, horário de fim pela duração, sem CNPJ nem aluno", async () => {
    const fake = new FakeFirestore();
    seedCenter(fake);
    const d = await getCenterClassDirectoryCore(db(fake), "elv", NOW);
    assert.deepEqual(d.programs.map((p) => p.name), ["Competição"]);
    assert.equal(d.classes[0].endTime, "08:00");
    assert.equal(d.plans[0].priceReais, 480);
    assert.equal(d.places[0].name, "Sede Elevação");
    const json = JSON.stringify(d);
    assert.ok(!json.includes("0001-00"));
    assert.ok(!json.includes("s1"));
  });

  it("CT pendente = not-found", async () => {
    const fake = new FakeFirestore();
    seedCenter(fake);
    await assert.rejects(getCenterClassDirectoryCore(db(fake), "pend", NOW), {code: "not-found"});
  });
});

describe("class-directory · regras puras", () => {
  const c = (name: string, level: string, weekdays: number[], startTime: string, capacity: number, taken: number): DirectoryClass =>
    ({classId: name, name, level, sport: "", weekdays, startTime, endTime: "", professorName: "", professorUid: null, place: "", capacity, taken, programId: null});

  it("destaque: nível pedido primeiro, depois o mais próximo na semana; lotada nunca", () => {
    const list = [c("Lotada", "intermediario", [4], "08:00", 8, 8), c("Sábado", "iniciante", [6], "09:00", 8, 2), c("Segunda", "intermediario", [1], "19:00", 8, 7)];
    assert.equal(pickHighlight(list, "intermediario", 4)?.className, "Segunda");
    assert.equal(pickHighlight(list, "", 4)?.className, "Sábado");
    assert.equal(pickHighlight([list[0]], "", 4), null);
  });

  it("a partir de: mensal antes de pacote", () => {
    const p = (kind: string, priceReais: number) => ({name: "", kind, priceReais, classesPerWeek: null, credits: null, description: "", featured: false, programIds: []});
    assert.equal(priceFrom([p("single", 50), p("monthly", 200)]), 200);
    assert.equal(priceFrom([p("single", 50)]), 50);
    assert.equal(priceFrom([]), null);
  });
});
