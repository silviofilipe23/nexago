import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  formatJoinCode,
  joinCenterByCodeCore,
  MAX_FAILED_PER_HOUR,
  normalizeJoinCode,
  randomJoinCode,
  setCenterJoinCodeCore,
} from "./training-center-join-code";

const C = "trainingCenters/c1";
const NOW = new Date("2026-10-23T01:00:00Z");
const db = (f: FakeFirestore) => f as unknown as Firestore;
const doc = (f: FakeFirestore, path: string) => f.store.get(path) as Record<string, unknown> | undefined;
const ana = {uid: "ana", email: "ana@x.com", verified: true, name: "Ana"};

function seed() {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {name: "CT Areia Alta", status: "active"});
  fake.seedDoc(`${C}/centerMembers/owner`, {uid: "owner", role: "center_owner", status: "active", displayName: "Dono"});
  fake.seedDoc(`${C}/centerMembers/coach`, {uid: "coach", role: "coach", status: "active"});
  fake.seedDoc("users/ana", {fullName: "Ana Souza", phone: "21999990000"});
  return fake;
}

/** Sorteio previsível: cada chamada devolve o próximo índice da lista. */
function seq(...idx: number[]) {
  let i = 0;
  return () => idx[i++ % idx.length]!;
}

describe("código de entrada do centro", () => {
  it("normaliza e formata", () => {
    assert.equal(normalizeJoinCode(" xk7-q2m "), "XK7Q2M");
    assert.equal(formatJoinCode("XK7Q2M"), "XK7-Q2M");
    assert.match(randomJoinCode(), /^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("só gestor gera; gerar de novo troca o código e o antigo para de valer", async () => {
    const fake = seed();
    await assert.rejects(setCenterJoinCodeCore(db(fake), "coach", {centerId: "c1"}, NOW), /owner ou admin/);
    const a = await setCenterJoinCodeCore(db(fake), "owner", {centerId: "c1"}, NOW, seq(0, 1, 2, 3, 4, 5));
    assert.equal(a.code, "ABC-DEF");
    assert.equal(doc(fake, "trainingCenterJoinCodes/ABCDEF")!["centerId"], "c1");
    const b = await setCenterJoinCodeCore(db(fake), "owner", {centerId: "c1"}, NOW, seq(6));
    assert.equal(b.code, "GGG-GGG");
    assert.equal(doc(fake, "trainingCenterJoinCodes/ABCDEF"), undefined);
    await assert.rejects(joinCenterByCodeCore(db(fake), ana, {code: "ABC-DEF"}, NOW), /não encontrado/);
    const off = await setCenterJoinCodeCore(db(fake), "owner", {centerId: "c1", enabled: false}, NOW);
    assert.deepEqual(off, {code: null, enabled: false});
    assert.equal(doc(fake, C)!["joinCode"], null);
  });

  it("aluno entra com o código: cadastro ativo, consentimento e auditoria; repetir não duplica", async () => {
    const fake = seed();
    await setCenterJoinCodeCore(db(fake), "owner", {centerId: "c1"}, NOW, seq(0, 1, 2, 3, 4, 5));
    const r = await joinCenterByCodeCore(db(fake), ana, {code: "abc def"}, NOW);
    assert.deepEqual(r, {centerId: "c1", centerName: "CT Areia Alta", already: false});
    const s = doc(fake, `${C}/students/app_ana`)!;
    assert.equal(s["uid"], "ana");
    assert.equal(s["status"], "active");
    assert.equal(s["name"], "Ana Souza");
    assert.ok(s["lgpdConsentAt"]);
    const again = await joinCenterByCodeCore(db(fake), ana, {code: "ABCDEF"}, NOW);
    assert.equal(again.already, true);
    assert.equal([...fake.store.keys()].filter((k) => k.startsWith(`${C}/students/`)).length, 1);
  });

  it("convite pendente para o mesmo e-mail é vinculado em vez de duplicar", async () => {
    const fake = seed();
    fake.seedDoc(`${C}/students/inv`, {uid: null, status: "invited", email: "ana@x.com", name: "Ana (convite)"});
    await setCenterJoinCodeCore(db(fake), "owner", {centerId: "c1"}, NOW, seq(0, 1, 2, 3, 4, 5));
    await joinCenterByCodeCore(db(fake), ana, {code: "ABCDEF"}, NOW);
    assert.equal(doc(fake, `${C}/students/inv`)!["uid"], "ana");
    assert.equal(doc(fake, `${C}/students/app_ana`), undefined);
  });

  it("chute errado conta tentativa e trava depois do limite", async () => {
    const fake = seed();
    for (let i = 0; i < MAX_FAILED_PER_HOUR; i++) {
      await assert.rejects(joinCenterByCodeCore(db(fake), ana, {code: "ZZZZZZ"}, NOW), /não encontrado/);
    }
    await assert.rejects(joinCenterByCodeCore(db(fake), ana, {code: "ZZZZZZ"}, NOW), /Muitas tentativas/);
    // Uma hora depois volta a poder.
    await assert.rejects(joinCenterByCodeCore(db(fake), ana, {code: "ZZZZZZ"}, new Date(NOW.getTime() + 3601_000)),
      /não encontrado/);
  });
});
