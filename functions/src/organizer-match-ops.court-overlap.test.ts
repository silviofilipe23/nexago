import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {Timestamp} from "firebase-admin/firestore";

import {detectCourtOverlap} from "./organizer-match-ops";

const at = (hhmm: string): Date => new Date(`2026-10-31T${hhmm}:00.000Z`);
const ts = (hhmm: string): Timestamp => Timestamp.fromDate(at(hhmm));

function doc(id: string, data: FirebaseFirestore.DocumentData) {
  return {id, data: () => data};
}

describe("detectCourtOverlap", () => {
  // Torneio seed: a partida 2 foi planejada 00:52–01:22 na Q1, acabou às
  // 00:59, e às 01:10 o app recusava a próxima na quadra vazia.
  it("partida encerrada libera a quadra no fim real, não no previsto", () => {
    const matches = [doc("m2", {
      courtId: "Q1",
      status: "Completed",
      scheduleTime: ts("00:52"),
      scheduleEndTime: ts("01:22"),
      matchEndedAt: ts("00:59"),
    })];
    assert.equal(detectCourtOverlap("Q1", at("01:10"), at("01:40"), matches, "m5"), null);
  });

  it("encerrada ainda bloqueia a janela em que de fato foi jogada", () => {
    const matches = [doc("m2", {
      courtId: "Q1",
      status: "Completed",
      scheduleTime: ts("00:52"),
      scheduleEndTime: ts("01:22"),
      matchEndedAt: ts("00:59"),
    })];
    assert.equal(
      detectCourtOverlap("Q1", at("00:40"), at("00:55"), matches, "m5")?.type,
      "overlap",
    );
  });

  it("encerrada sem matchEndedAt (legado) segura o previsto", () => {
    const matches = [doc("m2", {
      courtId: "Q1",
      status: "Completed",
      scheduleTime: ts("00:52"),
      scheduleEndTime: ts("01:22"),
    })];
    assert.equal(
      detectCourtOverlap("Q1", at("01:10"), at("01:40"), matches, "m5")?.type,
      "overlap",
    );
  });

  it("cancelada não ocupa a quadra", () => {
    const matches = [doc("m2", {
      courtId: "Q1",
      status: "Canceled",
      scheduleTime: ts("01:00"),
      scheduleEndTime: ts("01:30"),
    })];
    assert.equal(detectCourtOverlap("Q1", at("01:10"), at("01:40"), matches, "m5"), null);
  });

  it("agendada e ao vivo seguem bloqueando pelo previsto", () => {
    for (const status of ["Scheduled", "In Progress"]) {
      const matches = [doc("m2", {
        courtId: "Q1",
        status,
        scheduleTime: ts("01:00"),
        scheduleEndTime: ts("01:30"),
      })];
      assert.equal(
        detectCourtOverlap("Q1", at("01:10"), at("01:40"), matches, "m5")?.message,
        "Quadra ocupada neste horário.",
        status,
      );
    }
  });
});
