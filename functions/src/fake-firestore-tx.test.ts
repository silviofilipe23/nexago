import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {FakeFirestore} from "./fake-firestore.test-helper";

describe("FakeFirestore.runTransaction", () => {
  it("tx.get aceita query além de doc ref", async () => {
    const db = new FakeFirestore();
    db.seedDoc("teams/t1", {pairKey: "a:b"});
    db.seedDoc("teams/t2", {pairKey: "c:d"});

    const found = await db.runTransaction(async (tx) => {
      const t = tx as {
        get: (q: unknown) => Promise<{docs: Array<{id: string}>}>;
      };
      const snap = await t.get(db.collection("teams").where("pairKey", "==", "a:b"));
      return snap.docs.map((d) => d.id);
    });

    assert.deepEqual(found, ["t1"]);
  });

  it("tx.update faz merge e tx.delete remove", async () => {
    const db = new FakeFirestore();
    db.seedDoc("teams/t1", {player1Id: "a", player2Id: "b"});
    db.seedDoc("teams/t2", {player1Id: "c"});

    await db.runTransaction(async (tx) => {
      const t = tx as {
        update: (ref: unknown, data: Record<string, unknown>) => void;
        delete: (ref: unknown) => void;
      };
      t.update(db.doc("teams/t1"), {pairKey: "a:b"});
      t.delete(db.doc("teams/t2"));
    });

    assert.deepEqual(db.store.get("teams/t1"), {
      player1Id: "a",
      player2Id: "b",
      pairKey: "a:b",
    });
    assert.equal(db.store.has("teams/t2"), false);
  });

  it("tx.update em doc ausente é erro, não upsert", async () => {
    const db = new FakeFirestore();

    await assert.rejects(
      db.runTransaction(async (tx) => {
        const t = tx as {
          update: (ref: unknown, data: Record<string, unknown>) => void;
        };
        t.update(db.doc("teams/nao-existe"), {pairKey: "a:b"});
      }),
      /update em doc ausente/,
    );
    assert.equal(db.store.has("teams/nao-existe"), false);
  });
});
