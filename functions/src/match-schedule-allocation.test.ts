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

  // NOTA (Task 1 - refatoração pura): este teste documenta o comportamento
  // ATUAL (herdado do código de produção em organizer-match-ops.ts, movido
  // aqui sem alteração), não o comportamento desejado. Com uma única quadra
  // candidata, `chosenStart` é semeado a partir de `courtBusyUntil[courts[0]]`
  // SEM o ajuste de conflito de dupla; como o ajuste só empurra o horário pra
  // frente, o valor ajustado da própria quadra semente nunca vence a
  // comparação `start < chosenStart`. Resultado: quando nenhuma outra quadra
  // oferece horário estritamente mais cedo, o descanso mínimo da dupla é
  // IGNORADO — bug pré-existente, fora do escopo desta extração (Task 1 não
  // muda comportamento). Ver task-1-report.md para detalhes e recomendação
  // de correção dedicada (afeta também a futura cascata da Task 3-4, que
  // reusa esta mesma função).
  it("[bug conhecido, preservado] com 1 quadra só, o descanso mínimo da dupla NÃO empurra o início quando essa é a única candidata", () => {
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

    // Comportamento real (bug): ignora `busyUntil` e agenda em `dayStart`.
    assert.equal(slots[0].start.getTime(), dayStart.getTime());
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
