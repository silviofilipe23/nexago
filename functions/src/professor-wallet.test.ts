import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  cancelProfessorChargeCore,
  createProfessorChargeCore,
  createProfessorPayoutAccountCore,
  generateProfessorMonthlyChargesCore,
  processProfessorChargeAsaasNotification,
  refreshProfessorPayoutAccountStatusCore,
  upsertProfessorPlanCore,
  upsertProfessorStudentCore,
  type ProfessorWalletDeps,
} from "./professor-wallet";
import {
  dueDateFor,
  parseProfessorAccountInput,
  professorAccountStatusFromAsaas,
  professorChargeStatusFromAsaas,
  professorSplitPercent,
  recurringChargeId,
  recurringPeriodDue,
} from "./professor-wallet-model";
import {loadMyClassCharges} from "./arena-class-athlete-charges";

const PROF = "uProf";
const ALUNO = "uAluno";
/** 20/10/2026 12:00 em São Paulo. */
const NOW = new Date("2026-10-20T15:00:00Z");
const TODAY = "2026-10-20";

const ACCOUNT_INPUT = {
  name: "Thiago Mendes",
  email: "thiago@exemplo.com",
  cpfCnpj: "529.982.247-25",
  mobilePhone: "(62) 99812-4471",
  birthDate: "1990-05-10",
  incomeValue: 5000,
  postalCode: "74000-000",
  address: "Rua 1",
  addressNumber: "10",
  province: "Centro",
};

interface Recorder {
  deps: ProfessorWalletDeps;
  payments: Array<Record<string, unknown>>;
  deleted: string[];
  pushes: Array<Record<string, unknown>>;
  accounts: number;
}

function recorder(overrides: Partial<ProfessorWalletDeps> = {}): Recorder {
  const rec: Recorder = {payments: [], deleted: [], pushes: [], accounts: 0, deps: undefined as never};
  rec.deps = {
    now: () => NOW,
    env: () => "sandbox",
    createAccount: async () => {
      rec.accounts++;
      return {accountId: "acc_1", walletId: "wal_1", apiKey: "key_1"};
    },
    accountStatus: async () => ({general: "APPROVED", documentation: "APPROVED"}),
    customerFor: async () => "cus_1",
    createPayment: async (input) => {
      rec.payments.push(input as unknown as Record<string, unknown>);
      return {paymentId: `pay_${rec.payments.length}`, invoiceUrl: `https://asaas.test/i/${rec.payments.length}`, status: "PENDING"};
    },
    deletePayment: async (id) => {
      rec.deleted.push(id);
    },
    notify: async (input) => {
      rec.pushes.push(input as unknown as Record<string, unknown>);
    },
    ...overrides,
  };
  return rec;
}

function makeDb(opts: {independent?: boolean; approved?: boolean; student?: boolean} = {}): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  if (opts.independent !== false) {
    fake.seedDoc(`arenaProfessors/norte_${PROF}`, {professorUserId: PROF, relationshipType: "INDEPENDENT", status: "ACTIVE"});
  }
  fake.seedDoc(`users/${PROF}`, {fullName: "Thiago Mendes"});
  fake.seedDoc(`users/${ALUNO}`, {fullName: "Paulo Viana", photoUrl: "https://foto/p.jpg"});
  if (opts.approved) {
    fake.seedDoc(`professorPayoutAccounts/${PROF}`, {status: "approved", walletId: "wal_1", asaasEnv: "sandbox", name: "Thiago Mendes"});
  }
  if (opts.student) {
    fake.seedDoc(`professors/${PROF}/students/${ALUNO}`, {athleteId: ALUNO, name: "Paulo Viana", status: "active", recurring: null});
  }
  return {fake, db: fake as unknown as Firestore};
}

async function rejectsWith(promise: Promise<unknown>, code: string, pattern?: RegExp): Promise<void> {
  try {
    await promise;
  } catch (e) {
    assert.ok(e instanceof HttpsError, `esperava HttpsError, veio ${String(e)}`);
    assert.equal(e.code, code, e.message);
    if (pattern) assert.match(e.message, pattern);
    return;
  }
  assert.fail(`esperava ${code}`);
}

const processedRef = (fake: FakeFirestore, id: string) => fake.doc(`processed/${id}`) as unknown as DocumentReference;

describe("conta de recebimento (subconta Asaas)", () => {
  it("cria a subconta, grava a conta pendente e a apiKey só no doc secreto", async () => {
    const {fake, db} = makeDb();
    const rec = recorder();
    assert.deepEqual(await createProfessorPayoutAccountCore(db, PROF, ACCOUNT_INPUT, rec.deps), {status: "pending"});
    const account = fake.store.get(`professorPayoutAccounts/${PROF}`)!;
    assert.equal(account["walletId"], "wal_1");
    assert.equal(account["status"], "pending");
    assert.equal(account["cpfMasked"], "***.982.247-**");
    assert.ok(!JSON.stringify(account).includes("key_1"), "apiKey não vai no doc legível");
    assert.equal(fake.store.get(`professorAsaasSecrets/${PROF}`)!["apiKey"], "key_1");
  });

  it("só professor independente; segunda conta no mesmo ambiente recusa", async () => {
    const rec = recorder();
    await rejectsWith(createProfessorPayoutAccountCore(makeDb({independent: false}).db, PROF, ACCOUNT_INPUT, rec.deps),
      "failed-precondition", /independente/);
    const {db} = makeDb({approved: true});
    await rejectsWith(createProfessorPayoutAccountCore(db, PROF, ACCOUNT_INPUT, rec.deps), "already-exists");
    assert.equal(rec.accounts, 0);
  });

  it("situação vem do general do Asaas, com a apiKey da subconta", async () => {
    const {fake, db} = makeDb();
    const keys: string[] = [];
    const rec = recorder({accountStatus: async (key) => {
      keys.push(key);
      return {general: "APPROVED", documentation: "APPROVED"};
    }});
    await createProfessorPayoutAccountCore(db, PROF, ACCOUNT_INPUT, rec.deps);
    assert.deepEqual(await refreshProfessorPayoutAccountStatusCore(db, PROF, rec.deps), {status: "approved"});
    assert.deepEqual(keys, ["key_1"]);
    assert.equal(fake.store.get(`professorPayoutAccounts/${PROF}`)!["status"], "approved");
  });

  it("valida o formulário", () => {
    assert.throws(() => parseProfessorAccountInput({...ACCOUNT_INPUT, cpfCnpj: "111.111.111-11"}, TODAY), /CPF/);
    assert.throws(() => parseProfessorAccountInput({...ACCOUNT_INPUT, birthDate: "2015-01-01"}, TODAY), /18 anos/);
    assert.throws(() => parseProfessorAccountInput({...ACCOUNT_INPUT, mobilePhone: "6233334444"}, TODAY), /Celular/);
    assert.throws(() => parseProfessorAccountInput({...ACCOUNT_INPUT, name: "Thiago"}, TODAY), /nome completo/);
    assert.equal(parseProfessorAccountInput({...ACCOUNT_INPUT, mobilePhone: "+55 62 99812-4471"}, TODAY).mobilePhone, "62998124471");
    assert.equal(professorAccountStatusFromAsaas("AWAITING_APPROVAL"), "pending");
    assert.equal(professorAccountStatusFromAsaas("REJECTED"), "rejected");
  });
});

describe("cobrança com split para a subconta", () => {
  it("cria no Asaas com split de 95% para a carteira do professor e avisa o aluno", async () => {
    const {fake, db} = makeDb({approved: true, student: true});
    const rec = recorder();
    const {planId} = await upsertProfessorPlanCore(db, PROF, {name: "Mensal 8 aulas", kind: "monthly", priceReais: 880, classes: 8});
    const result = await createProfessorChargeCore(db, PROF, {athleteId: ALUNO, planId, dueDate: "2026-11-10"}, rec.deps);
    assert.equal(rec.payments.length, 1);
    const p = rec.payments[0];
    assert.equal(p["walletId"], "wal_1");
    assert.equal(p["splitPercent"], 95);
    assert.equal(p["valueReais"], 880);
    assert.equal(p["customerId"], "cus_1");
    assert.equal(p["chargeId"], result.chargeId);
    const charge = fake.store.get(`professorCharges/${result.chargeId}`)!;
    assert.equal(charge["status"], "open");
    assert.equal(charge["professorUid"], PROF);
    assert.equal(charge["athleteId"], ALUNO);
    assert.equal(charge["description"], "Mensal 8 aulas");
    assert.equal(charge["invoiceUrl"], "https://asaas.test/i/1");
    assert.equal(rec.pushes[0]["userId"], ALUNO);
    assert.equal(rec.pushes[0]["type"], "professor_charge_link");
  });

  it("recusa sem conta aprovada, aluno fora da carteira ou sem CPF — sem deixar cobrança pendurada", async () => {
    const rec = recorder();
    await rejectsWith(createProfessorChargeCore(makeDb({student: true}).db, PROF,
      {athleteId: ALUNO, amountReais: 100, dueDate: TODAY}, rec.deps), "failed-precondition", /conta de recebimento/);
    const pending = makeDb({student: true});
    pending.fake.seedDoc(`professorPayoutAccounts/${PROF}`, {status: "pending", walletId: "wal_1", asaasEnv: "sandbox"});
    await rejectsWith(createProfessorChargeCore(pending.db, PROF,
      {athleteId: ALUNO, amountReais: 100, dueDate: TODAY}, rec.deps), "failed-precondition", /aprovada/);
    await rejectsWith(createProfessorChargeCore(makeDb({approved: true}).db, PROF,
      {athleteId: ALUNO, amountReais: 100, dueDate: TODAY}, rec.deps), "failed-precondition", /carteira/);

    const noCpf = makeDb({approved: true, student: true});
    const failing = recorder({customerFor: async () => {
      throw new Error("ASAAS_CUSTOMER_CPF_REQUIRED");
    }});
    await rejectsWith(createProfessorChargeCore(noCpf.db, PROF,
      {athleteId: ALUNO, amountReais: 100, dueDate: TODAY}, failing.deps), "failed-precondition", /CPF/);
    assert.equal([...noCpf.fake.store.keys()].filter((k) => k.startsWith("professorCharges/")).length, 0);
    assert.equal(rec.payments.length, 0);
  });

  it("valor personalizado e vencimento no passado", async () => {
    const {db} = makeDb({approved: true, student: true});
    const rec = recorder();
    await rejectsWith(createProfessorChargeCore(db, PROF, {athleteId: ALUNO, amountReais: 50, dueDate: "2026-10-01"}, rec.deps),
      "invalid-argument", /passado/);
    await rejectsWith(createProfessorChargeCore(db, PROF, {athleteId: ALUNO, amountReais: 0.5, dueDate: TODAY}, rec.deps),
      "invalid-argument", /entre/);
    await createProfessorChargeCore(db, PROF, {athleteId: ALUNO, amountReais: 140, description: "Aula avulsa", dueDate: TODAY}, rec.deps);
    assert.equal(rec.payments[0]["valueReais"], 140);
  });

  it("cancelar apaga no Asaas; só o dono e só em aberto", async () => {
    const {fake, db} = makeDb({approved: true, student: true});
    const rec = recorder();
    const {chargeId} = await createProfessorChargeCore(db, PROF, {athleteId: ALUNO, amountReais: 140, dueDate: TODAY}, rec.deps);
    await rejectsWith(cancelProfessorChargeCore(db, "uOutro", chargeId, rec.deps), "not-found");
    await cancelProfessorChargeCore(db, PROF, chargeId, rec.deps);
    assert.deepEqual(rec.deleted, ["pay_1"]);
    assert.equal(fake.store.get(`professorCharges/${chargeId}`)!["status"], "canceled");
    await rejectsWith(cancelProfessorChargeCore(db, PROF, chargeId, rec.deps), "failed-precondition");
  });
});

describe("recorrente", () => {
  it("guarda a recorrência e o agendador gera o próximo mês só uma vez", async () => {
    const {fake, db} = makeDb({approved: true, student: true});
    const rec = recorder();
    await createProfessorChargeCore(db, PROF, {athleteId: ALUNO, amountReais: 880, description: "Mensal", dueDate: "2026-10-25", repeatMonthly: true}, rec.deps);
    assert.ok(fake.store.has(`professorCharges/${recurringChargeId(PROF, ALUNO, "2026-10")}`));
    const recurring = fake.store.get(`professors/${PROF}/students/${ALUNO}`)!["recurring"] as Record<string, unknown>;
    assert.deepEqual([recurring["dueDay"], recurring["lastPeriod"], recurring["amountReais"]], [25, "2026-10", 880]);

    // 20/11: faltam 5 dias para 25/11 → gera novembro.
    const nov = recorder({now: () => new Date("2026-11-20T15:00:00Z")});
    assert.deepEqual(await generateProfessorMonthlyChargesCore(db, nov.deps), {created: 1, skipped: 0});
    assert.equal(nov.payments[0]["dueDate"], "2026-11-25");
    assert.equal(nov.payments[0]["splitPercent"], 95);
    // Segundo disparo no mesmo dia: nada novo.
    assert.equal((await generateProfessorMonthlyChargesCore(db, nov.deps)).created, 0);
    assert.equal(nov.payments.length, 1);
  });

  it("regras de período", () => {
    assert.equal(recurringPeriodDue("2026-11-20", 25), "2026-11");
    assert.equal(recurringPeriodDue("2026-11-10", 25), null);
    assert.equal(recurringPeriodDue("2026-11-28", 2), "2026-12");
    assert.equal(dueDateFor("2027-02", 31), "2027-02-28");
    assert.equal(professorSplitPercent(5), 95);
  });
});

describe("webhook professorCharge:", () => {
  async function openCharge() {
    const world = makeDb({approved: true, student: true});
    const rec = recorder();
    const {chargeId} = await createProfessorChargeCore(world.db, PROF, {athleteId: ALUNO, amountReais: 100, dueDate: TODAY}, rec.deps);
    return {...world, chargeId};
  }

  it("pago marca paid e guarda a parte do professor (95% do líquido)", async () => {
    const {fake, db, chargeId} = await openCharge();
    await processProfessorChargeAsaasNotification(db, "pay_1",
      {status: "RECEIVED", billingType: "PIX", netValue: 99.01, externalReference: `professorCharge:${chargeId}`}, processedRef(fake, "pay_1"));
    const charge = fake.store.get(`professorCharges/${chargeId}`)!;
    assert.equal(charge["status"], "paid");
    assert.equal(charge["netReais"], 94.06);
    assert.equal(fake.store.get("processed/pay_1")!["outcome"], "approved");
  });

  it("estorno vira refunded; apagado em aberto vira canceled; pagamento de outra tentativa é ignorado", async () => {
    const {fake, db, chargeId} = await openCharge();
    await processProfessorChargeAsaasNotification(db, "pay_outro",
      {status: "RECEIVED", externalReference: `professorCharge:${chargeId}`}, processedRef(fake, "x"));
    assert.equal(fake.store.get(`professorCharges/${chargeId}`)!["status"], "open");
    await processProfessorChargeAsaasNotification(db, "pay_1",
      {status: "PENDING", deleted: true, externalReference: `professorCharge:${chargeId}`}, processedRef(fake, "pay_1"));
    assert.equal(fake.store.get(`professorCharges/${chargeId}`)!["status"], "canceled");
    await processProfessorChargeAsaasNotification(db, "pay_1",
      {status: "REFUNDED", externalReference: `professorCharge:${chargeId}`}, processedRef(fake, "pay_1"));
    assert.equal(fake.store.get(`professorCharges/${chargeId}`)!["status"], "refunded");
    assert.equal(professorChargeStatusFromAsaas("OVERDUE", false), null);
  });

  it("o aluno vê a cobrança em aberto na lista dele, com o nome do professor", async () => {
    const {db, chargeId} = await openCharge();
    const items = await loadMyClassCharges(db, ALUNO, TODAY);
    assert.deepEqual(items.map((i) => [i.chargeId, i.arenaName, i.payment, i.source]), [
      [chargeId, "Prof. Thiago Mendes", "online", "professor"],
    ]);
  });
});

describe("alunos da carteira", () => {
  it("copia nome e foto do atleta; recusa a si mesmo e atleta inexistente", async () => {
    const {fake, db} = makeDb();
    await upsertProfessorStudentCore(db, PROF, {athleteId: ALUNO});
    const s = fake.store.get(`professors/${PROF}/students/${ALUNO}`)!;
    assert.deepEqual([s["name"], s["photoUrl"], s["status"]], ["Paulo Viana", "https://foto/p.jpg", "active"]);
    await rejectsWith(upsertProfessorStudentCore(db, PROF, {athleteId: PROF}), "invalid-argument");
    await rejectsWith(upsertProfessorStudentCore(db, PROF, {athleteId: "ninguem"}), "not-found");
  });
});
