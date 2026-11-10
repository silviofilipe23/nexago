import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {arenaBookingStartAt} from "./arena-booking-start-at";
import {
  athleteCourtLabel,
  athleteSeesBookingCourt,
  COURT_ON_ARRIVAL_LABEL,
} from "./arena-booking-court-visibility";
import {buildBooking15mReminderBody} from "./arena-booking-reminder-15m";

const START_MS = arenaBookingStartAt("2026-11-20", "19:00").getTime();
const BEFORE = START_MS - 3 * 60 * 60 * 1000;

function booking(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    arenaName: "Arena CFC",
    courtName: "Quadra 7",
    date: "2026-11-20",
    startTime: "19:00",
    endTime: "20:00",
    ...extra,
  };
}

describe("athleteSeesBookingCourt", () => {
  it("reserva comum (sem campos de alocação) mostra a quadra", () => {
    assert.equal(athleteSeesBookingCourt(booking(), BEFORE), true);
  });

  it("sem quadra definida nunca mostra a provisória", () => {
    const b = booking({allocationStatus: "unassigned", allocationSource: "auto", revealCourtBeforeArrival: true});
    assert.equal(athleteSeesBookingCourt(b, BEFORE), false);
    assert.equal(athleteSeesBookingCourt(b, START_MS + 1), false);
  });

  it("definida pela recepção antes: mostra se a arena mostra antes", () => {
    const b = booking({allocationStatus: "assigned", allocationSource: "staff", revealCourtBeforeArrival: true});
    assert.equal(athleteSeesBookingCourt(b, BEFORE), true);
  });

  it("definida pela recepção antes numa arena que só mostra na chegada: a partir do início", () => {
    const b = booking({allocationStatus: "assigned", allocationSource: "staff", revealCourtBeforeArrival: false});
    assert.equal(athleteSeesBookingCourt(b, BEFORE), false);
    assert.equal(athleteSeesBookingCourt(b, START_MS), true);
  });

  it("escolhida pelo atleta (modo misto) ou lida no QR mostra sempre", () => {
    const athlete = booking({allocationStatus: "assigned", allocationSource: "athlete", revealCourtBeforeArrival: false});
    const qr = booking({allocationStatus: "assigned", allocationSource: "qr", revealCourtBeforeArrival: false});
    assert.equal(athleteSeesBookingCourt(athlete, BEFORE), true);
    assert.equal(athleteSeesBookingCourt(qr, BEFORE), true);
  });
});

describe("athleteCourtLabel", () => {
  it("nome da quadra, ou o aviso de quadra na chegada", () => {
    assert.equal(athleteCourtLabel(booking(), BEFORE), "Quadra 7");
    assert.equal(athleteCourtLabel(booking({allocationStatus: "unassigned"}), BEFORE), COURT_ON_ARRIVAL_LABEL);
    assert.equal(athleteCourtLabel(booking({courtName: ""}), BEFORE), "Quadra");
  });
});

describe("lembrete de 15 min (fiação)", () => {
  it("não cita a quadra provisória", () => {
    const body = buildBooking15mReminderBody(booking({allocationStatus: "unassigned", allocationSource: "auto"}));
    assert.ok(!body.includes("Quadra 7"), body);
    assert.ok(body.includes(COURT_ON_ARRIVAL_LABEL), body);
  });

  it("reserva comum segue citando a quadra", () => {
    assert.ok(buildBooking15mReminderBody(booking()).includes("Quadra 7"));
  });
});
