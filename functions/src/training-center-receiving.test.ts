import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {AsaasApiError} from "./asaas-client";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  createCenterReceivingAccountCore,
  refreshCenterReceivingCallableCore,
  sweepCenterReceivingCore,
  type ReceivingDeps,
} from "./training-center-receiving";
import {cnpjChecksumOk, documentsFromAsaas, maskDocument, parseCenterAccountInput} from "./training-center-receiving-model";

const C = "trainingCenters/c1";
const NOW = new Date("2026-10-22T15:00:00Z");
const COMPANY = {
  centerId: "c1", personType: "company", companyType: "LIMITED", name: "CT Maré Alta LTDA", email: "fin@ct.com",
  cpfCnpj: "11.222.333/0001-81", mobilePhone: "(13) 99123-4567", incomeValue: 25000,
  postalCode: "11060-001", address: "Av. da Praia", addressNumber: "100", province: "Gonzaga",
};

function seed(center: Record<string, unknown> = {}) {
  const fake = new FakeFirestore();
  fake.seedDoc(C, {name: "CT Maré Alta", status: "pending", timezone: "America/Sao_Paulo", receivingConnected: false, ...center});
  fake.seedDoc(`${C}/centerMembers/owner`, {uid: "owner", role: "center_owner", status: "active", displayName: "Renata"});
  fake.seedDoc(`${C}/centerMembers/admin`, {uid: "admin", role: "center_admin", status: "active"});
  return fake;
}

function deps(over: Partial<ReceivingDeps> = {}) {
  const calls = {created: [] as unknown[], status: "PENDING"};
  const d: ReceivingDeps = {
    now: () => NOW,
    env: () => "sandbox",
    createAccount: async (input) => {
      calls.created.push(input);
      return {accountId: "acc_1", walletId: "wal_1", apiKey: "$key_1"};
    },
    findAccount: async () => null,
    accountStatus: async () => ({general: calls.status}),
    documents: async () => [{title: "Contrato social", status: "NOT_SENT", url: "https://asaas/onb/1"}],
    sealKey: (k) => `sealed:${k}`,
    openKey: (s) => s.replace("sealed:", ""),
    ...over,
  };
  return {d, calls};
}

const db = (f: FakeFirestore) => f as unknown as Firestore;
const doc = (f: FakeFirestore, p: string) => f.store.get(p) as Record<string, unknown> | undefined;

describe("formulário", () => {
  it("CNPJ com dígitos (inclusive alfanumérico) e CPF de maior de idade", () => {
    assert.equal(cnpjChecksumOk("11222333000181"), true);
    assert.equal(cnpjChecksumOk("11222333000182"), false);
    assert.equal(cnpjChecksumOk("12ABC34501DE35"), true);
    const p = parseCenterAccountInput(COMPANY, "2026-10-22");
    assert.equal(p.cpfCnpj, "11222333000181");
    assert.equal(p.mobilePhone, "13991234567");
    assert.throws(() => parseCenterAccountInput({...COMPANY, companyType: ""}, "2026-10-22"), /tipo de empresa/);
    const person = {...COMPANY, personType: "person", name: "Renata Moreira", cpfCnpj: "529.982.247-25", birthDate: "1990-05-10"};
    assert.equal(parseCenterAccountInput(person, "2026-10-22").birthDate, "1990-05-10");
    assert.throws(() => parseCenterAccountInput({...person, birthDate: "2010-01-01"}, "2026-10-22"), /maiores de 18/);
    assert.equal(maskDocument("11222333000181"), "11.•••.•••/0001-81");
  });

  it("documentos pendentes do Asaas", () => {
    assert.deepEqual(documentsFromAsaas({data: [{title: "RG", status: "not_sent", onboardingUrl: "u"}, null]}), [{title: "RG", status: "NOT_SENT", url: "u"}]);
    assert.deepEqual(documentsFromAsaas({}), []);
  });
});

describe("criar a conta", () => {
  it("só o owner; grava carteira, chave cifrada, espelho e documentos", async () => {
    const fake = seed();
    const {d} = deps();
    await assert.rejects(createCenterReceivingAccountCore(db(fake), "admin", COMPANY, d), /Só o owner/);
    const r = await createCenterReceivingAccountCore(db(fake), "owner", COMPANY, d);
    assert.equal(r.status, "pending");
    assert.equal(doc(fake, "trainingCenterReceiving/c1")!["walletId"], "wal_1");
    assert.equal(doc(fake, "trainingCenterAsaasSecrets/c1")!["sealedApiKey"], "sealed:$key_1");
    const mirror = doc(fake, `${C}/receivingAccount/current`)!;
    assert.equal(mirror["document"], "11.•••.•••/0001-81");
    assert.equal((mirror["documents"] as unknown[]).length, 1);
    assert.equal(doc(fake, C)!["receivingStatus"], "pending");
    assert.equal(doc(fake, C)!["receivingConnected"], false);
    await assert.rejects(createCenterReceivingAccountCore(db(fake), "owner", COMPANY, d), /já tem conta/);
  });

  it("recusa do Asaas libera para tentar de novo; documento já cadastrado é adotado", async () => {
    const fake = seed();
    const fail = deps({createAccount: async () => {
      throw new AsaasApiError("O CNPJ informado já está em uso.", 400);
    }});
    await assert.rejects(createCenterReceivingAccountCore(db(fake), "owner", COMPANY, fail.d), /já está em uso/);
    assert.equal(doc(fake, "trainingCenterReceiving/c1")!["status"], "failed");
    const adopt = deps({createAccount: fail.d.createAccount, findAccount: async () => ({accountId: "acc_9", walletId: "wal_9"})});
    await createCenterReceivingAccountCore(db(fake), "owner", COMPANY, adopt.d);
    assert.equal(doc(fake, "trainingCenterReceiving/c1")!["walletId"], "wal_9");
    assert.equal(doc(fake, "trainingCenterAsaasSecrets/c1"), undefined);
  });
});

describe("situação", () => {
  it("aprovada no Asaas liga o recebimento do centro (callable e varredura)", async () => {
    const fake = seed();
    const {d, calls} = deps();
    await createCenterReceivingAccountCore(db(fake), "owner", COMPANY, d);
    assert.equal(await sweepCenterReceivingCore(db(fake), d), 0);
    calls.status = "APPROVED";
    assert.equal(await sweepCenterReceivingCore(db(fake), d), 1);
    assert.equal(doc(fake, C)!["receivingConnected"], true);
    assert.equal(doc(fake, C)!["receivingStatus"], "approved");
    assert.deepEqual(doc(fake, `${C}/receivingAccount/current`)!["documents"], []);
    const r = await refreshCenterReceivingCallableCore(db(fake), "admin", {centerId: "c1"}, d);
    assert.equal(r.status, "approved");
    assert.ok([...fake.store.keys()].some((k) => k.startsWith(`${C}/auditLogs/`) && doc(fake, k)!["action"] === "center.receiving_approved"));
  });

  it("conta conectada pelo time NexaGO não é consultada aqui", async () => {
    const fake = seed({receivingConnected: true});
    fake.seedDoc("trainingCenterReceiving/c1", {walletId: "wal_x", source: "manual", status: "approved"});
    const {d} = deps();
    assert.deepEqual(await refreshCenterReceivingCallableCore(db(fake), "owner", {centerId: "c1"}, d), {status: null, documents: 0});
  });
});
