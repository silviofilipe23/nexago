import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  aggregateArenaOccupancyReport,
  getArenaOccupancyReportCore,
  type OccupancyBookingRecord,
} from "./arena-occupancy-report";

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

async function assertHttpsError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava HttpsError ${code}, veio ${err.code}`);
    return true;
  });
}

function booking(overrides: Partial<OccupancyBookingRecord> = {}): OccupancyBookingRecord {
  return {
    courtId: "court1",
    courtName: "Quadra 1",
    athleteId: "athlete1",
    date: "2026-07-10",
    startTime: "18:00",
    endTime: "19:00",
    status: "active",
    attendanceStatus: "pending",
    isRecurring: false,
    ...overrides,
  };
}

describe("aggregateArenaOccupancyReport", () => {
  it("quadra sem reservas no período retorna tudo zerado", () => {
    const report = aggregateArenaOccupancyReport([], "arena1", "2026-07-01", "2026-07-31");
    assert.equal(report.totalBookings, 0);
    assert.equal(report.totalHoursReserved, 0);
    assert.equal(report.uniqueAthletesCount, 0);
    assert.equal(report.noShowCount, 0);
    assert.equal(report.attendanceResolvedCount, 0);
    assert.equal(report.noShowRatePercent, 0);
    assert.equal(report.recurringBookingsCount, 0);
    assert.equal(report.standaloneBookingsCount, 0);
    assert.equal(report.recurringSharePercent, 0);
    assert.deepEqual(report.courts, []);
  });

  it("ignora reservas fora do período e reservas canceladas", () => {
    const bookings = [
      booking({date: "2026-06-30"}), // antes do período
      booking({date: "2026-08-01"}), // depois do período
      booking({date: "2026-07-15", status: "cancelled"}),
      booking({date: "2026-07-16", status: "canceled"}),
    ];
    const report = aggregateArenaOccupancyReport(bookings, "arena1", "2026-07-01", "2026-07-31");
    assert.equal(report.totalBookings, 0);
    assert.equal(report.totalHoursReserved, 0);
  });

  it("mix de reservas recorrentes e avulsas é contabilizado corretamente", () => {
    const bookings = [
      booking({isRecurring: true, athleteId: "a1"}),
      booking({isRecurring: true, athleteId: "a2"}),
      booking({isRecurring: false, athleteId: "a3"}),
    ];
    const report = aggregateArenaOccupancyReport(bookings, "arena1", "2026-07-01", "2026-07-31");
    assert.equal(report.recurringBookingsCount, 2);
    assert.equal(report.standaloneBookingsCount, 1);
    assert.equal(report.totalBookings, 3);
    assert.equal(report.recurringSharePercent, 66.7);
  });

  it("soma horas reservadas por quadra a partir da duração real de cada reserva", () => {
    const bookings = [
      booking({courtId: "c1", courtName: "Quadra 1", startTime: "18:00", endTime: "19:30"}),
      booking({courtId: "c1", courtName: "Quadra 1", startTime: "20:00", endTime: "21:00"}),
      booking({courtId: "c2", courtName: "Quadra 2", startTime: "09:00", endTime: "10:00"}),
    ];
    const report = aggregateArenaOccupancyReport(bookings, "arena1", "2026-07-01", "2026-07-31");
    assert.equal(report.totalHoursReserved, 3.5);
    const c1 = report.courts.find((c) => c.courtId === "c1");
    const c2 = report.courts.find((c) => c.courtId === "c2");
    assert.equal(c1?.hoursReserved, 2.5);
    assert.equal(c1?.bookingsCount, 2);
    assert.equal(c2?.hoursReserved, 1);
    assert.equal(c2?.bookingsCount, 1);
  });

  it("jogadores únicos deduplicam o mesmo athleteId em reservas diferentes", () => {
    const bookings = [
      booking({athleteId: "a1", startTime: "08:00", endTime: "09:00"}),
      booking({athleteId: "a1", startTime: "10:00", endTime: "11:00"}),
      booking({athleteId: "a2", startTime: "12:00", endTime: "13:00"}),
    ];
    const report = aggregateArenaOccupancyReport(bookings, "arena1", "2026-07-01", "2026-07-31");
    assert.equal(report.uniqueAthletesCount, 2);
  });

  it("taxa de no-show é contabilizada corretamente sobre presença já resolvida", () => {
    const bookings = [
      booking({attendanceStatus: "no_show", athleteId: "a1"}),
      booking({attendanceStatus: "no_show", athleteId: "a2"}),
      booking({attendanceStatus: "checked_in", athleteId: "a3"}),
      // reserva futura ainda sem desfecho — não deve diluir a taxa
      booking({attendanceStatus: "pending", athleteId: "a4"}),
    ];
    const report = aggregateArenaOccupancyReport(bookings, "arena1", "2026-07-01", "2026-07-31");
    assert.equal(report.noShowCount, 2);
    assert.equal(report.attendanceResolvedCount, 3);
    assert.equal(report.noShowRatePercent, 66.7);
    assert.equal(report.totalBookings, 4);
  });
});

describe("getArenaOccupancyReportCore", () => {
  it("rejeita quem não é o gestor da arena", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/arena1", {
      managerUserId: "owner1",
      planTier: "pro",
      planStatus: "active",
    });

    await assertHttpsError(
      getArenaOccupancyReportCore(
        db(fake),
        "intruder",
        {arenaId: "arena1", dateFrom: "2026-07-01", dateTo: "2026-07-31"},
        Date.now(),
      ),
      "permission-denied",
    );
  });

  it("rejeita arena sem entitlement Pro/Parceiro (gate de plano)", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/arena1", {
      managerUserId: "owner1",
      planTier: "essencial",
      planStatus: "none",
    });

    await assertHttpsError(
      getArenaOccupancyReportCore(
        db(fake),
        "owner1",
        {arenaId: "arena1", dateFrom: "2026-07-01", dateTo: "2026-07-31"},
        Date.now(),
      ),
      "failed-precondition",
    );
  });

  it("rejeita intervalo de datas inválido antes de checar plano/gestor", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/arena1", {
      managerUserId: "owner1",
      planTier: "pro",
      planStatus: "active",
    });

    await assertHttpsError(
      getArenaOccupancyReportCore(
        db(fake),
        "owner1",
        {arenaId: "arena1", dateFrom: "2026-07-31", dateTo: "2026-07-01"},
        Date.now(),
      ),
      "invalid-argument",
    );
  });
});
