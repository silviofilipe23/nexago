import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  COURT_QR_PREFIX,
  courtCheckinCodeId,
  getCourtCheckinQrCore,
  newCourtCheckinToken,
  parseCourtQrPayload,
  resolveCourtCheckinToken,
} from "./arena-court-checkin-qr";

const OWNER = "uDono";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/arena1", {name: "Arena CFC", managerUserId: OWNER, planTier: "pro", planStatus: "active"});
  fake.seedDoc("arenas/arena1/courts/q2", {name: "Quadra 2"});
  return {fake, db: fake as unknown as Firestore};
}

const tokenOf = (payload: string) => payload.slice(COURT_QR_PREFIX.length);

describe("payload do QR da quadra", () => {
  it("token aleatório de 128 bits em base64url, com o prefixo v1", () => {
    const token = newCourtCheckinToken();
    assert.match(token, /^[A-Za-z0-9_-]{22}$/);
    assert.notEqual(token, newCourtCheckinToken());
    assert.equal(parseCourtQrPayload(`  ${COURT_QR_PREFIX}${token}\n`), token);
  });

  it("recusa QR de outro formato, ids crus e token malformado", () => {
    assert.equal(parseCourtQrPayload("arena1_q2"), null);
    assert.equal(parseCourtQrPayload("https://nexago.com.br/a/arena1"), null);
    assert.equal(parseCourtQrPayload(`${COURT_QR_PREFIX}curto`), null);
    assert.equal(parseCourtQrPayload(`${COURT_QR_PREFIX}${"x".repeat(22)}/../`), null);
  });
});

describe("getArenaCourtCheckinQr", () => {
  it("cria o código na primeira vez e devolve o mesmo depois", async () => {
    const {fake, db} = makeDb();
    const first = await getCourtCheckinQrCore(db, {arenaId: "arena1", courtId: "q2", uid: OWNER, rotate: false});
    assert.equal(first.courtName, "Quadra 2");
    assert.equal(first.rotated, false);
    const again = await getCourtCheckinQrCore(db, {arenaId: "arena1", courtId: "q2", uid: OWNER, rotate: false});
    assert.equal(again.payload, first.payload);
    const stored = fake.store.get(`arenaCourtCheckinCodes/${courtCheckinCodeId("arena1", "q2")}`);
    assert.equal(stored?.["token"], tokenOf(first.payload));
    assert.deepEqual(await resolveCourtCheckinToken(db, tokenOf(first.payload)),
      {arenaId: "arena1", courtId: "q2", courtName: "Quadra 2"});
  });

  it("trocar o código invalida o QR antigo", async () => {
    const {db} = makeDb();
    const old = await getCourtCheckinQrCore(db, {arenaId: "arena1", courtId: "q2", uid: OWNER, rotate: false});
    const fresh = await getCourtCheckinQrCore(db, {arenaId: "arena1", courtId: "q2", uid: OWNER, rotate: true});
    assert.equal(fresh.rotated, true);
    assert.notEqual(fresh.payload, old.payload);
    assert.equal(await resolveCourtCheckinToken(db, tokenOf(old.payload)), null);
    assert.equal((await resolveCourtCheckinToken(db, tokenOf(fresh.payload)))?.courtId, "q2");
  });

  it("só a equipe com a área quadras; recepção não vê, quadra inexistente é not-found", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("arenas/arena1/staff/uRecepcao", {status: "active", role: "recepcao"});
    for (const uid of ["uAtleta", "uRecepcao"]) {
      await assert.rejects(
        getCourtCheckinQrCore(db, {arenaId: "arena1", courtId: "q2", uid, rotate: false}),
        (e: unknown) => e instanceof HttpsError && e.code === "permission-denied",
      );
    }
    await assert.rejects(
      getCourtCheckinQrCore(db, {arenaId: "arena1", courtId: "nada", uid: OWNER, rotate: false}),
      (e: unknown) => e instanceof HttpsError && e.code === "not-found",
    );
  });
});
