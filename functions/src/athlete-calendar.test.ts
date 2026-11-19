import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {artifactsInscriptionsPath, artifactsTournamentsPath} from "./firebase-paths";
import type {ClassAgendaItem} from "./arena-class-athlete-agenda";
import {
  ATHLETE_CALENDAR_FEEDS,
  buildAthleteIcs,
  configureAthleteCalendarFeedCore,
  loadAthleteFeedEvents,
  tournamentDayKey,
} from "./athlete-calendar";

const NOW = new Date("2026-11-19T15:00:00Z");
const ME = "uAtleta";

function world(): Firestore {
  const fake = new FakeFirestore();
  // Reservas: dono por athleteId, por bookingAthleteId e convidado (participantUids).
  fake.seedDoc("arenaBookings/b-own", {
    athleteId: ME, arenaName: "Arena Orla", courtName: "Quadra 2",
    date: "2026-11-21", startTime: "19:00", endTime: "20:00", status: "confirmed",
  });
  fake.seedDoc("arenaBookings/b-booking-athlete", {
    bookingAthleteId: ME, arenaName: "Arena Sul", courtName: "Quadra 1",
    date: "2026-11-22", startTime: "08:00", endTime: "09:00", status: "active",
  });
  fake.seedDoc("arenaBookings/b-guest", {
    athleteId: "uDono", participantUids: [ME, "uDono"], arenaName: "Arena Norte",
    date: "2026-11-23", startTime: "18:00", endTime: "19:00", status: "confirmed",
  });
  fake.seedDoc("arenaBookings/b-pix", {
    athleteId: ME, arenaName: "Arena Orla", date: "2026-11-20", startTime: "07:00", endTime: "08:00",
    status: "pending_payment",
  });
  fake.seedDoc("arenaBookings/b-canceled", {
    athleteId: ME, arenaName: "Arena Orla", date: "2026-11-24", startTime: "07:00", endTime: "08:00",
    status: "cancelled",
  });
  fake.seedDoc("arenaBookings/b-expired", {
    athleteId: ME, arenaName: "Arena Orla", date: "2026-11-25", startTime: "07:00", endTime: "08:00",
    status: "expired",
  });
  fake.seedDoc("arenaBookings/b-old", {
    athleteId: ME, arenaName: "Arena Orla", date: "2026-08-01", startTime: "07:00", endTime: "08:00",
    status: "confirmed",
  });
  fake.seedDoc("arenaBookings/b-other", {
    athleteId: "uOutro", arenaName: "Arena Orla", date: "2026-11-21", startTime: "10:00", endTime: "11:00",
    status: "confirmed",
  });

  // Torneios: inscrição paga (entra), fila de espera e não paga (não entram).
  fake.seedDoc(`${artifactsTournamentsPath()}/t-open`, {
    name: "Open da Orla", locationName: "Arena Orla",
    startDate: Timestamp.fromDate(new Date("2026-11-28T00:00:00Z")),
    endDate: Timestamp.fromDate(new Date("2026-11-29T00:00:00Z")),
  });
  fake.seedDoc(`${artifactsTournamentsPath()}/t-wait`, {name: "Copa Espera", startDate: "2026-12-05"});
  fake.seedDoc(`${artifactsTournamentsPath()}/t-unpaid`, {name: "Copa Fiado", startDate: "2026-12-06"});
  fake.seedDoc(`${artifactsInscriptionsPath()}/i-open`, {
    tournamentId: "t-open", participantUids: [ME], isPaid: true, categoryName: "Cat. B Masculina",
  });
  fake.seedDoc(`${artifactsInscriptionsPath()}/i-wait`, {
    tournamentId: "t-wait", participantUids: [ME], isPaid: true, waitlist: true,
  });
  fake.seedDoc(`${artifactsInscriptionsPath()}/i-unpaid`, {
    tournamentId: "t-unpaid", participantUids: [ME], isPaid: false,
  });
  return fake as unknown as Firestore;
}

function aula(over: Partial<ClassAgendaItem>): ClassAgendaItem {
  return {
    sessionId: "s1", arenaId: "cfc", arenaName: "Arena CFC", classId: "c1", className: "Intermediário B",
    teacherName: "Rafa", courtName: "Quadra 3", date: "2026-11-21", startTime: "07:00", endTime: "08:00",
    startAt: null, status: "scheduled", role: "student", kind: "regular", myMark: null, studentCount: null,
    canManageLessons: null, classType: "turma", sport: "beach_tennis", myRsvp: null, checkedIn: false,
    makeupNoticeHours: null, ...over,
  };
}

const noClasses = async (): Promise<ClassAgendaItem[]> => [];

describe("feed de calendário do atleta", () => {
  it("junta as reservas próprias e como convidado, sem as de outros", async () => {
    const events = await loadAthleteFeedEvents(world(), ME, NOW, {loadClasses: noClasses});
    const ids = events.map((e) => e.uid).sort();
    assert.ok(ids.includes("booking-b-own"));
    assert.ok(ids.includes("booking-b-booking-athlete"));
    assert.ok(ids.includes("booking-b-guest"));
    assert.ok(!ids.includes("booking-b-other"));

    const own = events.find((e) => e.uid === "booking-b-own");
    assert.equal(own?.summary, "Reserva · Arena Orla");
    assert.equal(own?.location, "Arena Orla · Quadra 2");
    assert.equal(own?.date, "2026-11-21");
    assert.equal(own?.startTime, "19:00");
    assert.equal(own?.endTime, "20:00");
  });

  it("cancelada sai como cancelada, Pix pendente como provisória e expirada nem entra", async () => {
    const events = await loadAthleteFeedEvents(world(), ME, NOW, {loadClasses: noClasses});
    assert.equal(events.find((e) => e.uid === "booking-b-canceled")?.canceled, true);
    assert.equal(events.find((e) => e.uid === "booking-b-pix")?.tentative, true);
    assert.equal(events.find((e) => e.uid === "booking-b-own")?.tentative, false);
    assert.equal(events.some((e) => e.uid === "booking-b-expired"), false);
  });

  it("fica na janela: 30 dias para trás", async () => {
    const events = await loadAthleteFeedEvents(world(), ME, NOW, {loadClasses: noClasses});
    assert.equal(events.some((e) => e.uid === "booking-b-old"), false);
  });

  it("torneio com inscrição paga vira evento de dia inteiro; espera e não paga ficam de fora", async () => {
    const events = await loadAthleteFeedEvents(world(), ME, NOW, {loadClasses: noClasses});
    const open = events.find((e) => e.uid === "tournament-i-open");
    assert.deepEqual(open?.allDay, {fromKey: "2026-11-28", toKey: "2026-11-29"});
    assert.equal(open?.summary, "Torneio · Open da Orla");
    assert.equal(open?.location, "Arena Orla");
    assert.equal(open?.description, "Cat. B Masculina");
    assert.equal(events.some((e) => e.uid === "tournament-i-wait"), false);
    assert.equal(events.some((e) => e.uid === "tournament-i-unpaid"), false);
  });

  it("aulas como aluno entram; \"Não vou\" e aula cancelada saem canceladas; as que dou não", async () => {
    const events = await loadAthleteFeedEvents(world(), ME, NOW, {
      loadClasses: async () => [
        aula({sessionId: "vou"}),
        aula({sessionId: "nao-vou", myRsvp: "not_going"}),
        aula({sessionId: "cancelada", status: "canceled"}),
        aula({sessionId: "dou", role: "teacher"}),
      ],
    });
    const vou = events.find((e) => e.uid === "class-vou");
    assert.equal(vou?.summary, "Aula · Intermediário B");
    assert.equal(vou?.location, "Arena CFC · Quadra 3");
    assert.equal(vou?.description, "Prof. Rafa");
    assert.equal(vou?.canceled, false);
    assert.equal(events.find((e) => e.uid === "class-nao-vou")?.canceled, true);
    assert.equal(events.find((e) => e.uid === "class-cancelada")?.canceled, true);
    assert.equal(events.some((e) => e.uid === "class-dou"), false);
  });

  it("monta o .ics com reserva, torneio de dia inteiro e Pix provisório", async () => {
    const events = await loadAthleteFeedEvents(world(), ME, NOW, {loadClasses: noClasses});
    const ics = buildAthleteIcs(events, NOW);
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /PRODID:-\/\/nexaGO\/\/Agenda do atleta\/\/PT-BR/);
    assert.match(ics, /X-WR-CALNAME:Agenda nexaGO/);
    assert.match(ics, /DTSTART;TZID=America\/Sao_Paulo:20261121T190000/);
    assert.match(ics, /DTSTART;VALUE=DATE:20261128\r\nDTEND;VALUE=DATE:20261130/);
    assert.match(ics, /UID:booking-b-pix@nexago[\s\S]*?STATUS:TENTATIVE/);
  });
});

describe("tournamentDayKey", () => {
  it("meia-noite UTC é o dia do calendário (não volta um dia em São Paulo)", () => {
    assert.equal(tournamentDayKey(Timestamp.fromDate(new Date("2026-11-28T00:00:00Z"))), "2026-11-28");
  });
  it("instante com hora usa o dia em São Paulo", () => {
    assert.equal(tournamentDayKey(Timestamp.fromDate(new Date("2026-11-28T02:00:00Z"))), "2026-11-27");
  });
  it("texto YYYY-MM-DD vale como está; o resto é nulo", () => {
    assert.equal(tournamentDayKey("2026-12-05"), "2026-12-05");
    assert.equal(tournamentDayKey(""), null);
    assert.equal(tournamentDayKey(42), null);
  });
});

describe("configurar o feed do atleta", () => {
  it("cria o token uma vez, mantém e troca só com rotate", async () => {
    const db = new FakeFirestore() as unknown as Firestore;
    const first = await configureAthleteCalendarFeedCore(db, ME, {});
    assert.match(first.url, /athleteCalendarFeed\?u=uAtleta&t=[\w-]{20,}/);
    const again = await configureAthleteCalendarFeedCore(db, ME, {});
    assert.equal(again.url, first.url);
    const rotated = await configureAthleteCalendarFeedCore(db, ME, {rotate: true});
    assert.notEqual(rotated.url, first.url);
    const stored = (await db.collection(ATHLETE_CALENDAR_FEEDS).doc(ME).get()).data();
    assert.ok(rotated.url.endsWith(`t=${stored?.["token"]}`));
  });
});
