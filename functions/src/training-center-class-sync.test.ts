import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {classSyncPatch, syncClassSessions} from "./training-center-class-sync";

const C = "trainingCenters/c1";

describe("aulas acompanham nome e quadra da turma", () => {
  it("só nome/quadra disparam", () => {
    assert.equal(classSyncPatch({name: "A", seatsTaken: 1}, {name: "A", seatsTaken: 2}), null);
    assert.deepEqual(classSyncPatch({name: "A"}, {name: "B"}), {name: "B", court: null});
    assert.equal(classSyncPatch(undefined, {name: "B"}), null);
  });

  it("futuras agendadas mudam; passadas, feitas e quadra trocada na data ficam", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(C, {timezone: "America/Sao_Paulo"});
    const s = (id: string, p: Record<string, unknown>) => fake.seedDoc(`${C}/sessions/${id}`, {classId: "k1", className: "A", courtId: "q1", courtName: "Q1", status: "scheduled", ...p});
    s("past", {date: "2026-10-20"});
    s("done", {date: "2026-10-23", status: "done"});
    s("next", {date: "2026-10-24"});
    s("moved", {date: "2026-10-27", changed: true, courtId: "q9", courtName: "Q9"});
    fake.seedDoc(`${C}/sessions/other`, {classId: "k2", className: "X", date: "2026-10-24", status: "scheduled"});
    const n = await syncClassSessions(fake as unknown as Firestore, "c1", "k1",
      {name: "A", courtId: "q1", courtName: "Q1"}, {name: "B", courtId: "q2", courtName: "Q2"}, new Date("2026-10-22T15:00:00Z"));
    const get = (id: string) => fake.store.get(`${C}/sessions/${id}`) as Record<string, unknown>;
    assert.equal(n, 2);
    assert.deepEqual([get("next")["className"], get("next")["courtId"]], ["B", "q2"]);
    assert.deepEqual([get("moved")["className"], get("moved")["courtId"]], ["B", "q9"]);
    assert.equal(get("past")["className"], "A");
    assert.equal(get("done")["className"], "A");
    assert.equal(get("other")["className"], "X");
  });
});
