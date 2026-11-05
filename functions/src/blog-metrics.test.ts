import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {recordBlogReader} from "./blog-metrics";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

const at = (iso: string) => Timestamp.fromDate(new Date(iso));

describe("recordBlogReader", () => {
  it("primeira leitura grava as duas datas", async () => {
    const {fake, db} = makeDb();
    await recordBlogReader(db, "u1", at("2026-11-05T12:00:00Z"));
    const doc = fake.store.get("blogReaders/u1")!;
    assert.equal((doc["firstReadAt"] as Timestamp).toDate().toISOString(), "2026-11-05T12:00:00.000Z");
    assert.equal((doc["lastReadAt"] as Timestamp).toDate().toISOString(), "2026-11-05T12:00:00.000Z");
  });

  it("leitura nova só avança a última; gatilho atrasado não mexe em nada", async () => {
    const {fake, db} = makeDb();
    await recordBlogReader(db, "u1", at("2026-11-05T12:00:00Z"));
    await recordBlogReader(db, "u1", at("2026-11-20T12:00:00Z"));
    await recordBlogReader(db, "u1", at("2026-11-10T12:00:00Z"));
    const doc = fake.store.get("blogReaders/u1")!;
    assert.equal((doc["firstReadAt"] as Timestamp).toDate().toISOString(), "2026-11-05T12:00:00.000Z");
    assert.equal((doc["lastReadAt"] as Timestamp).toDate().toISOString(), "2026-11-20T12:00:00.000Z");
  });
});
