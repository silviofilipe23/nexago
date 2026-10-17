import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {resolveRegistrationAttribution, PAUSED_CODE_MESSAGE} from "./squad-attribution";
import {acceptAmendmentCore, pendingAmendment, sweepContractsCore, updateContractCore} from "./squad-contracts";
import type {Notify} from "./squad-applications";

const ACTOR = {uid: "admin1", name: "Lia Martins"};
const NOW = new Date("2026-10-17T15:00:00Z");

function setup() {
  const fake = new FakeFirestore();
  const db = fake as unknown as Firestore;
  const sent: string[] = [];
  const notify: Notify = async (_uid, _title, body) => {
    sent.push(body);
  };
  fake.seedDoc("squadAmbassadors/jv", {
    displayName: "João Victor", tier: "ath", code: "JOAO10", commissionPct: 5, followerDiscountPct: 10,
    rulesVersion: 1, status: "active", amendments: [],
  });
  return {fake, db, sent, notify};
}

describe("mudar nível", () => {
  it("gera aditivo com o pacote vigente; o nível só muda no aceite", async () => {
    const {fake, db, sent, notify} = setup();
    await updateContractCore(db, {uid: "jv", action: "changeTier", tier: "amb", reason: "Bateu 12 conversões"}, ACTOR, NOW, notify);
    let c = fake.store.get("squadAmbassadors/jv")!;
    assert.equal(c["tier"], "ath", "segue no nível anterior até aceitar");
    const pending = pendingAmendment(c)!;
    assert.equal(pending["toTier"], "amb");
    assert.equal(pending["commissionPct"], 10);
    assert.equal(pending["rulesVersion"], 1);
    assert.equal(sent.length, 1);

    // Novo aditivo substitui o pendente.
    await updateContractCore(db, {uid: "jv", action: "changeTier", tier: "pro", reason: "Melhor ainda", commissionPct: 12}, ACTOR, NOW, notify);
    c = fake.store.get("squadAmbassadors/jv")!;
    assert.equal((c["amendments"] as unknown[]).length, 2);
    assert.equal(pendingAmendment(c)!["toTier"], "pro");

    await acceptAmendmentCore(db, {uid: "jv"}, NOW);
    c = fake.store.get("squadAmbassadors/jv")!;
    assert.equal(c["tier"], "pro");
    assert.equal(c["commissionPct"], 12);
    assert.equal(c["followerDiscountPct"], 15);
    assert.equal(pendingAmendment(c), null);
  });

  it("recusa o mesmo nível e Pro fora da faixa", async () => {
    const {db, notify} = setup();
    await assert.rejects(updateContractCore(db, {uid: "jv", action: "changeTier", tier: "ath", reason: "Igual"}, ACTOR, NOW, notify), /já está/);
    await assert.rejects(
      updateContractCore(db, {uid: "jv", action: "changeTier", tier: "pro", reason: "Faixa", commissionPct: 30}, ACTOR, NOW, notify),
      /entre 10% e 15%/,
    );
  });
});

describe("pausar e encerrar", () => {
  it("pausa tira o código do checkout com 'Código indisponível' e retoma na data", async () => {
    const {fake, db, notify} = setup();
    await updateContractCore(db, {uid: "jv", action: "pause", reason: "Lesão", until: "2026-10-20"}, ACTOR, NOW, notify);
    assert.equal(fake.store.get("squadAmbassadors/jv")!["status"], "paused");
    await assert.rejects(
      resolveRegistrationAttribution(db, {payerUid: "x", athleteUids: ["x"], typedCode: "JOAO10"}, NOW),
      new RegExp(PAUSED_CODE_MESSAGE),
    );
    await sweepContractsCore(db, new Date("2026-10-19T15:00:00Z"));
    assert.equal(fake.store.get("squadAmbassadors/jv")!["status"], "paused");
    const out = await sweepContractsCore(db, new Date("2026-10-20T15:00:00Z"));
    assert.deepEqual(out, {ended: 0, resumed: 1});
    assert.equal(fake.store.get("squadAmbassadors/jv")!["status"], "active");
  });

  it("encerrar hoje é imediato; data futura encerra pela varredura", async () => {
    const {fake, db, notify} = setup();
    await assert.rejects(
      updateContractCore(db, {uid: "jv", action: "end", reason: "conduct", effectiveDate: "2026-10-16"}, ACTOR, NOW, notify),
      /passado/,
    );
    await updateContractCore(db, {uid: "jv", action: "end", reason: "cycle_end", effectiveDate: "2026-10-31"}, ACTOR, NOW, notify);
    assert.equal(fake.store.get("squadAmbassadors/jv")!["status"], "active");
    assert.equal(fake.store.get("squadAmbassadors/jv")!["endsAt"], "2026-10-31");
    await sweepContractsCore(db, new Date("2026-10-31T15:00:00Z"));
    assert.equal(fake.store.get("squadAmbassadors/jv")!["status"], "ended");

    fake.seedDoc("squadAmbassadors/ana", {status: "active", tier: "amb", code: "ANA10"});
    await updateContractCore(db, {uid: "ana", action: "end", reason: "athlete_request", effectiveDate: "2026-10-17"}, ACTOR, NOW, notify);
    assert.equal(fake.store.get("squadAmbassadors/ana")!["status"], "ended");
    await assert.rejects(updateContractCore(db, {uid: "ana", action: "resume"}, ACTOR, NOW, notify), /encerrado/);
  });
});
