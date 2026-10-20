import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {HttpsError} from "firebase-functions/v2/https";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {AsaasApiError} from "./asaas-client";
import {
  cancelProfessorChargeCore,
  createProfessorChargeCore,
  createProfessorPayoutAccountCore,
  generateProfessorMonthlyChargesCore,
  processProfessorChargeAsaasNotification,
  refreshProfessorPayoutAccountStatusCore,
  respondProfessorStudentInviteCore,
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
    findAccountByCpf: async () => null,
    accountStatus: async () => ({general: "APPROVED", documentation: "APPROVED"}),
    sealKey: (k) => `sealed:${k}`,
    openKey: (s) => s.replace(/^sealed:/, ""),
    findPayment: async () => null,
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

function makeDb(opts: {independent?: boolean; approved?: boolean; student?: boolean; linkStatus?: string} = {}): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  if (opts.independent !== false) {
    fake.seedDoc(`arenaProfessors/norte_${PROF}`, {professorUserId: PROF, relationshipType: "INDEPENDENT", status: opts.linkStatus ?? "ACTIVE"});
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
    assert.equal(fake.store.get(`professorAsaasSecrets/${PROF}`)!["sealedApiKey"], "sealed:key_1");
  });

  it("só professor independente com vínculo ATIVO; segunda conta no mesmo ambiente recusa", async () => {
    const rec = recorder();
    for (const linkStatus of ["PENDING", "REJECTED", "ENDED"]) {
      await rejectsWith(createProfessorPayoutAccountCore(makeDb({linkStatus}).db, PROF, ACCOUNT_INPUT, rec.deps),
        "failed-precondition", /independente/);
    }
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
    assert.deepEqual(keys, ["key_1"], "decifra a apiKey antes de consultar");
    assert.equal(fake.store.get(`professorPayoutAccounts/${PROF}`)!["status"], "approved");
  });

  it("toque duplo: a segunda tentativa enquanto a primeira cria é recusada", async () => {
    const {db} = makeDb();
    let release: () => void = () => undefined;
    const slow = recorder({createAccount: () => new Promise((resolve) => {
      release = () => resolve({accountId: "acc_1", walletId: "wal_1", apiKey: "key_1"});
    })});
    const first = createProfessorPayoutAccountCore(db, PROF, ACCOUNT_INPUT, slow.deps);
    await new Promise((r) => setTimeout(r, 5));
    await rejectsWith(createProfessorPayoutAccountCore(db, PROF, ACCOUNT_INPUT, slow.deps), "aborted");
    release();
    await first;
  });

  it("subconta criada numa tentativa que não gravou: adota a existente pelo CPF", async () => {
    const {fake, db} = makeDb();
    const rec = recorder({
      createAccount: async () => {
        throw new AsaasApiError("CPF já cadastrado", 400, "{}");
      },
      findAccountByCpf: async (cpf) => (cpf === "52998224725" ? {accountId: "acc_old", walletId: "wal_old"} : null),
    });
    await createProfessorPayoutAccountCore(db, PROF, ACCOUNT_INPUT, rec.deps);
    assert.equal(fake.store.get(`professorPayoutAccounts/${PROF}`)!["walletId"], "wal_old");
    assert.equal(fake.store.has(`professorAsaasSecrets/${PROF}`), false);
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

  it("falha ambígua no Asaas: adota o pagamento vivo em vez de apagar (sem cobrança dupla)", async () => {
    const {fake, db} = makeDb({approved: true, student: true});
    const rec = recorder({
      createPayment: async () => {
        throw new Error("timeout");
      },
      findPayment: async () => ({paymentId: "pay_vivo", invoiceUrl: "https://asaas.test/vivo"}),
    });
    const {chargeId, invoiceUrl} = await createProfessorChargeCore(db, PROF, {athleteId: ALUNO, amountReais: 100, dueDate: TODAY}, rec.deps);
    assert.equal(invoiceUrl, "https://asaas.test/vivo");
    assert.deepEqual([fake.store.get(`professorCharges/${chargeId}`)!["status"], fake.store.get(`professorCharges/${chargeId}`)!["paymentId"]],
      ["open", "pay_vivo"]);

    // Sem conseguir conferir: guarda como "failed" (não apaga) e avisa para conferir antes de cobrar de novo.
    const unknown = makeDb({approved: true, student: true});
    const blind = recorder({
      createPayment: async () => {
        throw new Error("timeout");
      },
      findPayment: async () => {
        throw new Error("rede");
      },
    });
    await rejectsWith(createProfessorChargeCore(unknown.db, PROF, {athleteId: ALUNO, amountReais: 100, dueDate: TODAY}, blind.deps),
      "internal", /Confira/);
    const left = [...unknown.fake.store.entries()].filter(([k]) => k.startsWith("professorCharges/"));
    assert.equal(left.length, 1);
    assert.equal(left[0][1]["status"], "failed");
  });

  it("aluno convidado (ainda não aceitou) não pode ser cobrado", async () => {
    const {fake, db} = makeDb({approved: true});
    fake.seedDoc(`professors/${PROF}/students/${ALUNO}`, {athleteId: ALUNO, name: "Paulo", status: "invited"});
    await rejectsWith(createProfessorChargeCore(db, PROF, {athleteId: ALUNO, amountReais: 100, dueDate: TODAY}, recorder().deps),
      "failed-precondition", /aceitou/);
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
    assert.equal([...fake.store.keys()].filter((k) => k.startsWith("professorCharges/")).length, 1);
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
    assert.ok(fake.store.has(`professorCharges/${recurringChargeId(PROF, ALUNO, "2026-11")}`));
  });

  it("agendador não cobra se o vínculo independente acabou", async () => {
    const {fake, db} = makeDb({approved: true, student: true});
    fake.seedDoc(`professors/${PROF}/students/${ALUNO}`, {
      athleteId: ALUNO, name: "Paulo", status: "active",
      recurring: {amountReais: 100, description: "Mensal", dueDay: 25, lastPeriod: "2026-10"},
    });
    fake.seedDoc(`arenaProfessors/norte_${PROF}`, {professorUserId: PROF, relationshipType: "INDEPENDENT", status: "ENDED"});
    const nov = recorder({now: () => new Date("2026-11-20T15:00:00Z")});
    assert.deepEqual(await generateProfessorMonthlyChargesCore(db, nov.deps), {created: 0, skipped: 1});
    assert.equal(nov.payments.length, 0);
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
    assert.equal(professorChargeStatusFromAsaas("REFUND_REQUESTED", false), null, "pedido de estorno pode voltar atrás");
    assert.equal(professorChargeStatusFromAsaas("CHARGEBACK_DISPUTE", false), null);
  });

  it("cobrança presa em creating: o webhook abre com o link do Asaas", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("professorCharges/c1", {professorUid: PROF, athleteId: ALUNO, status: "creating", paymentId: null, feePercent: 5});
    await processProfessorChargeAsaasNotification(db, "pay_9",
      {status: "PENDING", externalReference: "professorCharge:c1", invoiceUrl: "https://asaas.test/9"} as never, processedRef(fake, "pay_9"));
    const charge = fake.store.get("professorCharges/c1")!;
    assert.deepEqual([charge["status"], charge["invoiceUrl"], charge["paymentId"]], ["open", "https://asaas.test/9", "pay_9"]);
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
  it("convida (status invited + push); o atleta aceita e vira aluno; recusa a si mesmo e inexistente", async () => {
    const {fake, db} = makeDb();
    const rec = recorder();
    assert.deepEqual(await upsertProfessorStudentCore(db, PROF, {athleteId: ALUNO}, rec.deps), {athleteId: ALUNO, status: "invited"});
    const s = fake.store.get(`professors/${PROF}/students/${ALUNO}`)!;
    assert.deepEqual([s["name"], s["photoUrl"], s["status"], s["professorName"]], ["Paulo Viana", "https://foto/p.jpg", "invited", "Thiago Mendes"]);
    assert.deepEqual([rec.pushes[0]["userId"], rec.pushes[0]["type"]], [ALUNO, "professor_student_invite"]);
    assert.deepEqual(await respondProfessorStudentInviteCore(db, ALUNO, PROF, true), {status: "active"});
    await rejectsWith(respondProfessorStudentInviteCore(db, ALUNO, PROF, true), "failed-precondition");
    // Reconvidar quem já é aluno não rebaixa para convite nem manda push.
    assert.equal((await upsertProfessorStudentCore(db, PROF, {athleteId: ALUNO}, rec.deps)).status, "active");
    assert.equal(rec.pushes.length, 1);
    await rejectsWith(upsertProfessorStudentCore(db, PROF, {athleteId: PROF}, rec.deps), "invalid-argument");
    await rejectsWith(upsertProfessorStudentCore(db, PROF, {athleteId: "ninguem"}, rec.deps), "not-found");
  });

  it("recusar o convite", async () => {
    const {fake, db} = makeDb();
    await upsertProfessorStudentCore(db, PROF, {athleteId: ALUNO}, recorder().deps);
    assert.deepEqual(await respondProfessorStudentInviteCore(db, ALUNO, PROF, false), {status: "declined"});
    assert.equal(fake.store.get(`professors/${PROF}/students/${ALUNO}`)!["status"], "declined");
  });
});
