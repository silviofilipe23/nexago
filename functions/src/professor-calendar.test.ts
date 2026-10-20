import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  buildProfessorIcs,
  configureProfessorCalendarFeedCore,
  icsText,
  loadProfessorFeedEvents,
} from "./professor-calendar";

const NOW = new Date("2026-10-20T15:00:00Z");
const PROF = "uProf";

function world(): Firestore {
  const fake = new FakeFirestore();
  fake.seedDoc("arenaClassSessions/class_c1_2026-10-22", {
    teacherUserId: PROF, arenaId: "cfc", arenaName: "Arena CFC", courtName: "Quadra 2", className: "Intermediário B",
    type: "turma", date: "2026-10-22", startTime: "19:00", endTime: "20:00", status: "scheduled",
  });
  fake.seedDoc("arenaClassSessions/class_c2_2026-10-23", {
    teacherUserId: PROF, arenaId: "sul", arenaName: "Arena Sul", className: "Fora", type: "turma",
    date: "2026-10-23", startTime: "07:00", endTime: "08:00", status: "canceled",
  });
  fake.seedDoc("arenaClassSessions/class_c3_2026-10-22", {teacherUserId: "uOutro", arenaId: "cfc", date: "2026-10-22", startTime: "07:00"});
  fake.seedDoc("professorLessons/bk1", {
    professorUid: PROF, athleteId: "a1", studentName: "Paulo Viana", arenaId: "norte", arenaName: "Arena Norte",
    courtName: "Q2", date: "2026-10-22", startTime: "06:00", endTime: "07:00",
  });
  fake.seedDoc("arenaBookings/bk1", {status: "cancelled"});
  fake.seedDoc(`users/${PROF}/professorBlocks/b1`, {
    reason: "torneio", reasonLabel: "Torneio", note: "Etapa Liga",
    startAt: Timestamp.fromDate(new Date("2026-10-23T17:00:00Z")), endAt: Timestamp.fromDate(new Date("2026-10-23T21:00:00Z")),
  });
  return fake as unknown as Firestore;
}

describe("feed de calendário do professor", () => {
  it("junta turmas, aulas da carteira e bloqueios; nome do aluno só com a opção", async () => {
    const events = await loadProfessorFeedEvents(world(), PROF, {showStudentNames: false, excludedArenaIds: []}, NOW);
    const byUid = new Map(events.map((e) => [e.uid, e]));
    assert.deepEqual([...byUid.keys()].sort(), ["block-b1", "lesson-bk1", "session-class_c1_2026-10-22", "session-class_c2_2026-10-23"]);
    assert.equal(byUid.get("lesson-bk1")!.summary, "Aula particular");
    assert.equal(byUid.get("lesson-bk1")!.canceled, true, "reserva cancelada cancela a aula");
    assert.equal(byUid.get("session-class_c2_2026-10-23")!.canceled, true);
    assert.equal(byUid.get("session-class_c1_2026-10-22")!.summary, "Turma: Intermediário B");

    const named = await loadProfessorFeedEvents(world(), PROF, {showStudentNames: true, excludedArenaIds: ["sul"]}, NOW);
    assert.equal(named.find((e) => e.uid === "lesson-bk1")!.summary, "Aula: Paulo Viana");
    assert.equal(named.some((e) => e.uid.includes("c2")), false, "arena excluída sai");
  });

  it("gera iCalendar válido com fuso de São Paulo, escapando texto e dobrando linhas", async () => {
    const events = await loadProfessorFeedEvents(world(), PROF, {showStudentNames: false, excludedArenaIds: []}, NOW);
    const ics = buildProfessorIcs(events, NOW);
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /DTSTART;TZID=America\/Sao_Paulo:20261022T190000/);
    assert.match(ics, /DTSTART:20261023T170000Z/);
    assert.match(ics, /STATUS:CANCELLED/);
    assert.match(ics, /END:VCALENDAR\r\n$/);
    assert.ok(ics.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75));
    assert.equal(icsText("a,b;c\nd"), String.raw`a\,b\;c\nd`);
  });

  it("configurar devolve a URL com token; rotate troca o token", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    const first = await configureProfessorCalendarFeedCore(db, PROF, {});
    const again = await configureProfessorCalendarFeedCore(db, PROF, {showStudentNames: true});
    assert.equal(first.url, again.url, "sem rotate mantém o token");
    assert.equal(again.showStudentNames, true);
    const rotated = await configureProfessorCalendarFeedCore(db, PROF, {rotate: true});
    assert.notEqual(rotated.url, first.url);
    assert.match(rotated.url, /professorCalendarFeed\?u=uProf&t=[A-Za-z0-9_-]{32}$/);
  });
});
