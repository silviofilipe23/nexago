import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_LIVE_ACTIVITY_FINISHED_DISMISS_MS,
  bookingLiveActivityAllowed,
  bookingScheduleChanged,
  bookingSweepTransition,
  buildBookingLiveActivityMessage,
  canTransitionBookingLiveActivity,
  isBookingCanceled,
} from "./booking-live-activity";

const MIN = 60 * 1000;
const START = 1_800_000_000_000;
const END = START + 60 * MIN;

interface Aps {
  "event"?: string;
  "timestamp"?: number;
  "dismissal-date"?: number;
  "stale-date"?: number;
  "alert"?: unknown;
  "content-state"?: unknown;
}

function apsOf(phase: "onCourt" | "finished" | "canceled", nowMs: number): Aps {
  const message = buildBookingLiveActivityMessage({
    fcmToken: "fcm-1",
    liveActivityToken: "la-1",
    phase,
    nowMs,
    endAtMs: END,
  });
  return message.apns?.payload?.aps as Aps;
}

describe("bookingSweepTransition", () => {
  it("antes do horário não faz nada", () => {
    assert.equal(bookingSweepTransition("upcoming", START, END, START - MIN), null);
  });

  it("começou: vai para em quadra", () => {
    assert.equal(bookingSweepTransition("upcoming", START, END, START), "onCourt");
  });

  it("varredura atrasada além do fim pula direto para o fim", () => {
    assert.equal(bookingSweepTransition("upcoming", START, END, END + MIN), "finished");
  });

  it("em quadra só termina no fim do horário", () => {
    assert.equal(bookingSweepTransition("onCourt", START, END, END - MIN), null);
    assert.equal(bookingSweepTransition("onCourt", START, END, END), "finished");
  });

  it("fases finais não andam mais", () => {
    assert.equal(bookingSweepTransition("finished", START, END, END + 60 * MIN), null);
    assert.equal(bookingSweepTransition("canceled", START, END, END + 60 * MIN), null);
  });
});

describe("canTransitionBookingLiveActivity", () => {
  it("só anda para frente; fim e cancelada são finais", () => {
    assert.equal(canTransitionBookingLiveActivity("upcoming", "onCourt"), true);
    assert.equal(canTransitionBookingLiveActivity("upcoming", "finished"), true);
    assert.equal(canTransitionBookingLiveActivity("onCourt", "finished"), true);
    assert.equal(canTransitionBookingLiveActivity("onCourt", "canceled"), true);
    assert.equal(canTransitionBookingLiveActivity("onCourt", "upcoming"), false);
    assert.equal(canTransitionBookingLiveActivity("finished", "canceled"), false);
    assert.equal(canTransitionBookingLiveActivity("canceled", "finished"), false);
    assert.equal(canTransitionBookingLiveActivity("onCourt", "onCourt"), false);
  });
});

describe("isBookingCanceled", () => {
  it("cancelada, inativa (expirada, estornada) ou apagada conta como cancelada", () => {
    assert.equal(isBookingCanceled({status: "canceled"}), true);
    assert.equal(isBookingCanceled({status: "Cancelled"}), true);
    assert.equal(isBookingCanceled({status: "expired"}), true);
    assert.equal(isBookingCanceled({status: "confirmed", refundedAt: 1}), true);
    assert.equal(isBookingCanceled(undefined), true);
    assert.equal(isBookingCanceled({status: "confirmed"}), false);
  });
});

describe("bookingLiveActivityAllowed", () => {
  it("dono (atual ou legado) e convidado confirmado podem; outra conta, não", () => {
    assert.equal(bookingLiveActivityAllowed("u1", {athleteId: "u1"}), true);
    assert.equal(bookingLiveActivityAllowed("u1", {bookingAthleteId: "u1"}), true);
    assert.equal(bookingLiveActivityAllowed("u2", {athleteId: "u1", participantUids: ["u2"]}), true);
    assert.equal(bookingLiveActivityAllowed("u3", {athleteId: "u1", participantUids: ["u2"]}), false);
    assert.equal(bookingLiveActivityAllowed("", {athleteId: ""}), false);
  });
});

describe("bookingScheduleChanged", () => {
  const base = {date: "2026-11-21", startTime: "19:00", endTime: "20:00", courtId: "c2"};

  it("remarcar dia, horário ou quadra muda o card; o resto não", () => {
    assert.equal(bookingScheduleChanged(base, {...base, startTime: "21:00"}), true);
    assert.equal(bookingScheduleChanged(base, {...base, date: "2026-11-22"}), true);
    assert.equal(bookingScheduleChanged(base, {...base, courtId: "c3"}), true);
    assert.equal(bookingScheduleChanged(base, {...base, participantUids: ["x"]}), false);
  });
});

describe("buildBookingLiveActivityMessage", () => {
  it("CONTRATO: content-state é só a fase (o resto é atributo fixo no iPhone)", () => {
    assert.deepEqual(apsOf("onCourt", START)["content-state"], {phase: "onCourt"});
  });

  it("em quadra: atualiza e repete o fim como stale-date", () => {
    const aps = apsOf("onCourt", START);
    assert.equal(aps.event, "update");
    assert.equal(aps["stale-date"], END / 1000);
    assert.equal(aps.timestamp, START / 1000);
    assert.equal(aps.alert, undefined);
  });

  it("em quadra com o fim já passado não manda stale-date no passado", () => {
    assert.equal(apsOf("onCourt", END + MIN)["stale-date"], undefined);
  });

  it("fim: encerra e fica 30 min na tela, sem alerta (o pós-jogo já avisa)", () => {
    const aps = apsOf("finished", END);
    assert.equal(aps.event, "end");
    assert.equal(
      aps["dismissal-date"],
      Math.floor((END + BOOKING_LIVE_ACTIVITY_FINISHED_DISMISS_MS) / 1000),
    );
    assert.deepEqual(aps["content-state"], {phase: "finished"});
    assert.equal(aps.alert, undefined);
  });

  it("cancelada: encerra e sai da tela na hora", () => {
    const aps = apsOf("canceled", START);
    assert.equal(aps.event, "end");
    assert.equal(aps["dismissal-date"], START / 1000);
  });

  it("vai pelo token da activity", () => {
    const message = buildBookingLiveActivityMessage({
      fcmToken: "fcm-1",
      liveActivityToken: "la-1",
      phase: "onCourt",
      nowMs: START,
      endAtMs: END,
    });
    assert.equal(message.token, "fcm-1");
    assert.equal(message.apns?.liveActivityToken, "la-1");
  });
});
