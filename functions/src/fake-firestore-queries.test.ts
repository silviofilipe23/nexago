import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";

async function ids(query: {get: () => Promise<{docs: Array<{id: string}>}>}): Promise<string[]> {
  return (await query.get()).docs.map((d) => d.id).sort();
}

describe("FakeFirestore — filtros de intervalo", () => {
  it("compara Timestamp com >=, <=, < e >", async () => {
    const db = new FakeFirestore();
    db.seedDoc("tournaments/a", {endAt: Timestamp.fromMillis(1_000)});
    db.seedDoc("tournaments/b", {endAt: Timestamp.fromMillis(2_000)});
    db.seedDoc("tournaments/c", {endAt: Timestamp.fromMillis(3_000)});
    const col = db.collection("tournaments");
    assert.deepEqual(await ids(col.where("endAt", ">=", Timestamp.fromMillis(2_000))), ["b", "c"]);
    assert.deepEqual(
      await ids(col.where("endAt", ">=", Timestamp.fromMillis(1_500)).where("endAt", "<=", Timestamp.fromMillis(2_000))),
      ["b"],
    );
    assert.deepEqual(await ids(col.where("endAt", "<", Timestamp.fromMillis(2_000))), ["a"]);
    assert.deepEqual(await ids(col.where("endAt", ">", Timestamp.fromMillis(2_000))), ["c"]);
  });

  it("campo ausente ou de outro tipo nunca casa num filtro de intervalo", async () => {
    const db = new FakeFirestore();
    db.seedDoc("tournaments/ok", {endAt: Timestamp.fromMillis(5_000)});
    db.seedDoc("tournaments/sem", {name: "sem endAt"});
    db.seedDoc("tournaments/texto", {endAt: "2026-10-01"});
    assert.deepEqual(
      await ids(db.collection("tournaments").where("endAt", ">=", Timestamp.fromMillis(0))),
      ["ok"],
    );
  });
});

describe("FakeFirestore — collectionGroup", () => {
  it("acha a subcoleção em qualquer pai e respeita os filtros", async () => {
    const db = new FakeFirestore();
    db.seedDoc("users/u1/tournamentReviewInvites/t1", {tournamentId: "t1", status: "pending"});
    db.seedDoc("users/u2/tournamentReviewInvites/t1", {tournamentId: "t1", status: "submitted"});
    db.seedDoc("users/u3/tournamentReviewInvites/t2", {tournamentId: "t2", status: "pending"});
    db.seedDoc("users/u4/notifications/t1", {tournamentId: "t1", status: "pending"});
    const snap = await db
      .collectionGroup("tournamentReviewInvites")
      .where("tournamentId", "==", "t1")
      .where("status", "==", "pending")
      .get();
    assert.deepEqual(snap.docs.map((d) => d.ref.parent.parent?.id), ["u1"]);
  });
});
