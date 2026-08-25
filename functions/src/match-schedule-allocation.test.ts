import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {allocateCourtSlots, compareByMatchNumber} from "./match-schedule-allocation";

function fakeDoc(id: string, data: Record<string, unknown>): FirebaseFirestore.QueryDocumentSnapshot {
  return {id, data: () => data} as unknown as FirebaseFirestore.QueryDocumentSnapshot;
}

describe("compareByMatchNumber", () => {
  it("ordena pela numeração global, tratando ausente como 0", () => {
    const sorted = [{matchNumber: 3}, {matchNumber: undefined}, {matchNumber: 1}].sort(
      compareByMatchNumber,
    );
    assert.deepEqual(sorted.map((m) => m.matchNumber), [undefined, 1, 3]);
  });
});

describe("allocateCourtSlots", () => {
  it("aloca em ordem de matchNumber, respeitando courtBusyUntil de entrada", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const docs = [
      fakeDoc("m2", {matchNumber: 2, teamAId: "t3", teamBId: "t4"}),
      fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"}),
    ];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}],
      unscheduled: docs,
      courtBusyUntil: {"court-1": dayStart},
      teamBusyUntil: {},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots.length, 2);
    assert.equal(slots[0].matchId, "m1");
    assert.equal(slots[0].start.toISOString(), dayStart.toISOString());
    assert.equal(slots[1].matchId, "m2");
    assert.equal(slots[1].start.getTime(), dayStart.getTime() + 30 * 60 * 1000);
  });

  it("com 1 quadra só, o descanso mínimo da dupla EMPURRA o início (bug corrigido)", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const busyUntil = new Date(dayStart.getTime() + 45 * 60 * 1000);
    const docs = [fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"})];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}],
      unscheduled: docs,
      courtBusyUntil: {"court-1": dayStart},
      teamBusyUntil: {t1: busyUntil},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots[0].start.getTime(), busyUntil.getTime());
  });

  it("com 2 quadras, o descanso mínimo da dupla também EMPURRA o início mesmo quando as duas quadras estão livres desde o dayStart", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const busyUntil = new Date(dayStart.getTime() + 45 * 60 * 1000);
    const docs = [fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"})];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}, {id: "court-2"}],
      unscheduled: docs,
      courtBusyUntil: {"court-1": dayStart, "court-2": dayStart},
      teamBusyUntil: {t1: busyUntil},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots[0].start.getTime(), busyUntil.getTime());
  });

  it("escolhe a quadra que fica livre mais cedo entre várias", () => {
    const dayStart = new Date("2026-08-25T10:00:00-03:00");
    const courtBusyUntil = {
      "court-1": new Date(dayStart.getTime() + 60 * 60 * 1000),
      "court-2": dayStart,
    };
    const docs = [fakeDoc("m1", {matchNumber: 1, teamAId: "t1", teamBId: "t2"})];

    const slots = allocateCourtSlots({
      courts: [{id: "court-1"}, {id: "court-2"}],
      unscheduled: docs,
      courtBusyUntil,
      teamBusyUntil: {},
      durationMin: 30,
      minRestMin: 30,
      avoidAthleteConflict: true,
      dayStart,
    });

    assert.equal(slots[0].courtId, "court-2");
  });
});
