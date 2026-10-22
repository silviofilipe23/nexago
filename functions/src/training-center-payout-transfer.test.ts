import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {AsaasApiError} from "./asaas-client";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {isTrainingCenterCoach} from "./professor-wallet";
import {
  payPayoutCore,
  resolvePayoutTransferCore,
  sweepPayoutTransfersCore,
  type PayoutTransferDeps,
  type TransferInfo,
} from "./training-center-payout-transfer";

const C = "trainingCenters/c1";
const P = `${C}/payouts/2026-10_coach`;
const NOW = new Date("2026-11-03T15:00:00Z");

function seed(opts: {payout?: Record<string, unknown>; account?: Record<string, unknown> | null; receiving?: Record<string, unknown>} = {}) {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {name: "CT Maré", status: "active", timezone: "America/Sao_Paulo"});
  fake.seedDoc(`${C}/centerMembers/owner`, {uid: "owner", role: "center_owner", status: "active", displayName: "Renata"});
  fake.seedDoc(`${C}/centerMembers/admin`, {uid: "admin", role: "center_admin", status: "active"});
  fake.seedDoc(`${C}/centerMembers/coach`, {uid: "coach", role: "coach", status: "active"});
  fake.seedDoc("trainingCenterReceiving/c1", {walletId: "wal_ct", source: "self", status: "approved", asaasEnv: "sandbox", ...opts.receiving});
  fake.seedDoc("trainingCenterAsaasSecrets/c1", {sealedApiKey: "sealed:$ct"});
  if (opts.account !== null) fake.seedDoc("professorPayoutAccounts/coach", {walletId: "wal_prof", status: "approved", asaasEnv: "sandbox", ...opts.account});
  fake.seedDoc(P, {month: "2026-10", coachUid: "coach", coachName: "Marcos", totalCents: 40000, status: "closed", ...opts.payout});
  return fake;
}

function deps(create: () => Promise<TransferInfo>, get?: () => Promise<TransferInfo>) {
  const calls = {created: [] as Array<Record<string, unknown>>, pushed: [] as string[], keys: [] as string[]};
  const d: PayoutTransferDeps = {
    now: () => NOW,
    env: () => "sandbox",
    openKey: (s) => {
      calls.keys.push(s);
      return s.replace("sealed:", "");
    },
    createTransfer: async (_key, input) => {
      calls.created.push(input as unknown as Record<string, unknown>);
      return create();
    },
    getTransfer: async () => (get ? get() : {id: "tr_1", status: "PENDING", authorized: true, failReason: ""}),
    notify: async (n) => {
      calls.pushed.push(n.title);
    },
  };
  return {d, calls};
}

const db = (f: FakeFirestore) => f as unknown as Firestore;
const doc = (f: FakeFirestore) => f.store.get(P) as Record<string, unknown>;
const pending = (authorized = false) => async () => ({id: "tr_1", status: "PENDING", authorized, failReason: ""});

describe("pagar repasse pelo NexaGO", () => {
  it("só o owner; cria a transferência da subconta do centro para a carteira do professor", async () => {
    const fake = seed();
    const {d, calls} = deps(pending(false));
    await assert.rejects(payPayoutCore(db(fake), "admin", {centerId: "c1", payoutId: "2026-10_coach"}, d), /Só o owner/);
    const r = await payPayoutCore(db(fake), "owner", {centerId: "c1", payoutId: "2026-10_coach"}, d);
    assert.equal(r.transferStatus, "pending");
    assert.equal(r.awaitingAuthorization, true);
    assert.deepEqual(calls.keys, ["sealed:$ct"]);
    assert.equal(calls.created[0]!["walletId"], "wal_prof");
    assert.equal(calls.created[0]!["valueReais"], 400);
    assert.equal(calls.created[0]!["idempotencyKey"], "ct-payout-sandbox-c1-2026-10_coach-0");
    assert.equal(doc(fake)["transferStatus"], "pending");
    assert.equal(doc(fake)["status"], "closed");
    await assert.rejects(payPayoutCore(db(fake), "owner", {centerId: "c1", payoutId: "2026-10_coach"}, d), /já está sendo transferido/);
  });

  it("só fica pago no DONE (varredura) e avisa o professor", async () => {
    const fake = seed();
    let status = "PENDING";
    const {d, calls} = deps(pending(true), async () => ({id: "tr_1", status, authorized: true, failReason: ""}));
    await payPayoutCore(db(fake), "owner", {centerId: "c1", payoutId: "2026-10_coach"}, d);
    assert.equal(await sweepPayoutTransfersCore(db(fake), d), 0);
    status = "DONE";
    assert.equal(await sweepPayoutTransfersCore(db(fake), d), 1);
    assert.equal(doc(fake)["status"], "paid");
    assert.equal(doc(fake)["paidMethod"], "nexago");
    assert.equal(doc(fake)["paidOn"], "2026-11-03");
    assert.match(calls.pushed[0]!, /Repasse de outubro\/2026 pago/);
  });

  it("falha no Asaas libera com nova chave; resposta ambígua trava até o owner conferir", async () => {
    const fake = seed();
    const refused = deps(async () => {
      throw new AsaasApiError("Saldo insuficiente.", 400);
    });
    const r = await payPayoutCore(db(fake), "owner", {centerId: "c1", payoutId: "2026-10_coach"}, refused.d);
    assert.equal(r.transferStatus, "failed");
    assert.equal(doc(fake)["transferAttempt"], 1);

    const flaky = deps(async () => {
      throw new AsaasApiError("Bad gateway", 502);
    });
    const u = await payPayoutCore(db(fake), "owner", {centerId: "c1", payoutId: "2026-10_coach"}, flaky.d);
    assert.equal(u.transferStatus, "unknown");
    assert.equal(flaky.calls.created[0]!["idempotencyKey"], "ct-payout-sandbox-c1-2026-10_coach-1");
    await assert.rejects(payPayoutCore(db(fake), "owner", {centerId: "c1", payoutId: "2026-10_coach"}, flaky.d), /Confira o extrato/);
    await resolvePayoutTransferCore(db(fake), "owner", {centerId: "c1", payoutId: "2026-10_coach", outcome: "sent"}, flaky.d);
    assert.equal(doc(fake)["status"], "paid");
  });

  it("requested esquecido (function caiu) vira 'conferir o extrato'", async () => {
    const fake = seed({payout: {transferStatus: "requested", transferRequestedAt: Timestamp.fromMillis(NOW.getTime() - 20 * 60_000)}});
    const {d} = deps(pending());
    await assert.rejects(payPayoutCore(db(fake), "owner", {centerId: "c1", payoutId: "2026-10_coach"}, d), /sem resposta/);
    await resolvePayoutTransferCore(db(fake), "owner", {centerId: "c1", payoutId: "2026-10_coach", outcome: "not_sent"}, d);
    assert.equal(doc(fake)["transferStatus"], "failed");
  });

  it("pré-condições: conta do professor aprovada, conta do centro própria, nada pago", async () => {
    const pay = (f: FakeFirestore) => payPayoutCore(db(f), "owner", {centerId: "c1", payoutId: "2026-10_coach"}, deps(pending()).d);
    await assert.rejects(pay(seed({account: null})), /Marcos ainda não tem conta/);
    await assert.rejects(pay(seed({account: {status: "pending"}})), /Marcos ainda não tem conta/);
    await assert.rejects(pay(seed({receiving: {source: "manual"}})), /criada aqui e aprovada/);
    await assert.rejects(pay(seed({payout: {status: "paid"}})), /Só repasse fechado/);
    await assert.rejects(pay(seed({account: {walletId: "wal_ct"}})), /mesma do centro/);
  });
});

describe("professor de CT pode ter conta de recebimento", () => {
  it("vínculo ativo de professor num centro", async () => {
    const fake = seed();
    assert.equal(await isTrainingCenterCoach(db(fake), "coach"), true);
    assert.equal(await isTrainingCenterCoach(db(fake), "admin"), false);
    fake.seedDoc(`${C}/centerMembers/coach`, {uid: "coach", role: "coach", status: "revoked"});
    assert.equal(await isTrainingCenterCoach(db(fake), "coach"), false);
  });
});
