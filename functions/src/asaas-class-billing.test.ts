import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  createEnrollmentCore,
  mergeClassRulesInput,
  runMonthlyBilling,
  setChargeStatusCore,
  setEnrollmentStatusCore,
  type EnrollmentRequest,
} from "./arena-class-billing";
import {DEFAULT_CLASS_RULES} from "./arena-class-constants";
import {maskCpfCnpj} from "./arena-class-asaas-model";
import {
  MAX_VOID_ATTEMPTS,
  ensureClassAsaasPayment,
  reconcileClassAsaasPayments,
  voidClassAsaasPayment,
  type ClassAsaasDeps,
} from "./asaas-class-billing";
import {parseClassPaymentRef, processArenaClassAsaasNotification} from "./asaas-arena-class-webhook";
import type {AsaasPaymentDetails} from "./asaas-booking-payment";

const TODAY = "2026-10-19"; // segunda; Ter/Qui restantes de outubro: 20, 22, 27, 29 (4 de 9)
const NOW = new Date("2026-10-19T15:00:00Z");
const CPF = "52998224725";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function seed(fake: FakeFirestore, rules: Record<string, unknown> = {}) {
  fake.seedDoc("arenas/arena1", {
    name: "Arena CFC", planTier: "pro", planStatus: "active",
    planActiveUntil: Timestamp.fromDate(new Date("2027-01-31T12:00:00Z")),
  });
  fake.seedDoc("arenas/arena1/classPlans/m2", {
    name: "Mensal 2x/semana", kind: "monthly", priceReais: 320, classesPerWeek: 2, makeupsPerMonth: 1, status: "active",
  });
  fake.seedDoc("arenas/arena1/classSettings/rules", {
    ...DEFAULT_CLASS_RULES, enrollmentFeeReais: 50, onlineBillingEnabled: true, ...rules,
  });
  fake.seedDoc("arenaClasses/cB", {
    arenaId: "arena1", name: "Intermediário B", type: "turma", sport: "beachTennis", level: "intermediario",
    teacherId: "t1", teacherUserId: "uT", teacherName: "Thiago", teacherColor: "#FF6A1A",
    weekdays: [2, 4], startTime: "19:00", endTime: "20:00", courtId: "q2", courtName: "Quadra 2",
    capacity: 4, studentCount: 0, startDate: "2026-10-01", endDate: null, status: "active",
  });
}

function request(overrides: Partial<EnrollmentRequest> = {}): EnrollmentRequest {
  return {
    arenaId: "arena1", planId: "m2", slots: [{classId: "cB", weekday: 2}, {classId: "cB", weekday: 4}],
    dueDay: 5, paymentMethod: "pix", waiveFee: false, waitlistClassId: null, waitlistEntryId: null,
    billingMode: "asaas", cpfCnpj: CPF,
    ...overrides,
  };
}

const marina = {athleteId: "uMarina", name: "Marina Lopes", phone: "62999990000", photoUrl: null};

function fakeDeps(over: Partial<ClassAsaasDeps> = {}) {
  const calls = {created: [] as string[], deleted: [] as string[], pushes: [] as Array<{userId: string; data: Record<string, string>}>};
  const deps: ClassAsaasDeps = {
    resolveCustomer: async () => "cus_1",
    createPayment: async (input) => {
      calls.created.push(input.groupId);
      return {paymentId: `pay_${input.groupId}`, invoiceUrl: `https://asaas.test/i/${input.groupId}`, status: "PENDING"};
    },
    deletePayment: async (id) => {
      calls.deleted.push(id);
    },
    getPayment: async (id) => ({id, status: "PENDING"}),
    notify: async (i) => {
      calls.pushes.push({userId: i.userId, data: i.data});
    },
    ...over,
  };
  return {deps, calls};
}

function processedRef(fake: FakeFirestore, paymentId: string) {
  return (fake as unknown as Firestore).doc(`artifacts/p/public/data/asaas_processed_payments/${paymentId}`);
}

function payment(groupId: string, over: Partial<AsaasPaymentDetails> = {}): AsaasPaymentDetails {
  return {
    id: `pay_${groupId}`, status: "RECEIVED", value: 192.22, netValue: 192.22, billingType: "PIX",
    externalReference: `arenaClassPayment:${groupId}`, ...over,
  };
}

const webhookDeps = (refunds: string[] = []) => ({refund: async (id: string) => {
  refunds.push(id);
}, now: () => NOW});

async function enrollAndOpen(fake: FakeFirestore, db: Firestore) {
  const out = await createEnrollmentCore(db, request(), marina, "gestor", TODAY);
  const {deps, calls} = fakeDeps();
  await ensureClassAsaasPayment(db, out.asaasGroupId!, deps);
  return {out, deps, calls};
}

describe("cobrança online — matrícula", () => {
  it("1º mês + taxa num grupo só, espelho pendente e CPF fora do cadastro do atleta", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await createEnrollmentCore(db, request(), marina, "gestor", TODAY);

    assert.equal(out.asaasGroupId, `${out.enrollmentId}_first`);
    const group = fake.store.get(`arenaClassAsaasPayments/${out.asaasGroupId}`)!;
    assert.equal(group["state"], "pending");
    assert.equal(group["amountReais"], 192.22);
    assert.deepEqual([...(group["chargeIds"] as string[])].sort(), [`${out.enrollmentId}_2026-10`, `${out.enrollmentId}_fee`].sort());
    for (const id of out.chargeIds) {
      const c = fake.store.get(`arenaClassCharges/${id}`)!;
      assert.equal(c["billingMode"], "asaas");
      assert.deepEqual(c["asaas"], {groupId: out.asaasGroupId, state: "pending", invoiceUrl: null, status: null});
    }
    const enrollment = fake.store.get(`arenaClassEnrollments/${out.enrollmentId}`)!;
    assert.equal(enrollment["billingMode"], "asaas");
    assert.equal(enrollment["cpfMasked"], maskCpfCnpj(CPF));
    assert.equal(fake.store.get("arenaClassBillingProfiles/arena1_uMarina")!["cpfCnpj"], CPF);
    assert.equal(fake.store.has("athletes/uMarina"), false);
  });

  it("sem CPF (nem digitado, nem no perfil) e com a regra desligada, recusa", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    await assert.rejects(createEnrollmentCore(db, request({cpfCnpj: null}), marina, "gestor", TODAY), /CPF/);
    const off = makeDb();
    seed(off.fake, {onlineBillingEnabled: false});
    await assert.rejects(createEnrollmentCore(off.db, request(), marina, "gestor", TODAY), /desligada/);
  });

  it("aluno com CPF no cadastro dispensa o campo; manual continua sem grupo", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    fake.seedDoc("athletes/uMarina", {cpfCnpj: CPF});
    const online = await createEnrollmentCore(db, request({cpfCnpj: null}), marina, "gestor", TODAY);
    assert.ok(online.asaasGroupId);
    assert.equal(fake.store.has("arenaClassBillingProfiles/arena1_uMarina"), false);

    const manual = await createEnrollmentCore(db, request({billingMode: "manual", cpfCnpj: null}),
      {...marina, athleteId: "uAna", name: "Ana"}, "gestor", TODAY);
    assert.equal(manual.asaasGroupId, null);
    assert.equal(fake.store.get(`arenaClassCharges/${manual.chargeIds[0]}`)!["billingMode"], "manual");
  });

  it("regra salva por app antigo (sem o campo) não desliga a cobrança online", () => {
    const stored = {...DEFAULT_CLASS_RULES, onlineBillingEnabled: true, classReminderEnabled: false};
    const merged = mergeClassRulesInput(stored, {makeupValidityDays: 20, defaultDueDay: 10});
    assert.equal(merged.onlineBillingEnabled, true);
    assert.equal(merged.classReminderEnabled, false);
    assert.equal(merged.makeupValidityDays, 20);
    assert.equal(mergeClassRulesInput(stored, {onlineBillingEnabled: false}).onlineBillingEnabled, false);
  });
});

describe("cobrança online — worker", () => {
  it("cria uma vez só, espelha o link e avisa o aluno", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await createEnrollmentCore(db, request(), marina, "gestor", TODAY);
    const {deps, calls} = fakeDeps();

    // O fake não isola transações concorrentes; no Firestore a disputa refaz a 2ª e a chave de
    // idempotência por grupo (`class-pay-{env}-{groupId}`) segura o resto. Aqui: gatilho + varredura.
    const first = await ensureClassAsaasPayment(db, out.asaasGroupId!, deps);
    const second = await ensureClassAsaasPayment(db, out.asaasGroupId!, deps);

    assert.equal(calls.created.length, 1);
    assert.equal(first.state, "open");
    assert.equal(second.state, "open");
    const group = fake.store.get(`arenaClassAsaasPayments/${out.asaasGroupId}`)!;
    assert.equal(group["state"], "open");
    assert.equal(group["paymentId"], `pay_${out.asaasGroupId}`);
    for (const id of out.chargeIds) {
      const mirror = fake.store.get(`arenaClassCharges/${id}`)!["asaas"] as Record<string, unknown>;
      assert.equal(mirror["state"], "open");
      assert.equal(mirror["invoiceUrl"], `https://asaas.test/i/${out.asaasGroupId}`);
    }
    assert.deepEqual(calls.pushes.map((p) => p.userId), ["uMarina"]);
    assert.equal(calls.pushes[0]!.data["invoiceUrl"], `https://asaas.test/i/${out.asaasGroupId}`);
    // App antigo não conhece o tipo: `url` leva à agenda do atleta, não à da arena.
    assert.equal(calls.pushes[0]!.data["url"], "/discover?tab=agenda");
  });

  it("sem CPF fica needs_cpf; falha do Asaas fica failed e a varredura tenta de novo", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await createEnrollmentCore(db, request(), marina, "gestor", TODAY);
    const noCpf = fakeDeps({resolveCustomer: async () => null});
    assert.equal((await ensureClassAsaasPayment(db, out.asaasGroupId!, noCpf.deps)).state, "needs_cpf");

    const {fake: f2, db: db2} = makeDb();
    seed(f2);
    const out2 = await createEnrollmentCore(db2, request(), marina, "gestor", TODAY);
    let fail = true;
    const flaky = fakeDeps({createPayment: async (input) => {
      if (fail) throw new Error("timeout");
      return {paymentId: "pay_ok", invoiceUrl: "https://asaas.test/ok", status: "PENDING"};
    }});
    assert.equal((await ensureClassAsaasPayment(db2, out2.asaasGroupId!, flaky.deps)).state, "failed");
    fail = false;
    const swept = await reconcileClassAsaasPayments(db2, NOW, flaky.deps);
    assert.equal(swept.created, 1);
    assert.equal(f2.store.get(`arenaClassAsaasPayments/${out2.asaasGroupId}`)!["state"], "open");
  });

  it("agendador cria o grupo da mensalidade do mês seguinte", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await createEnrollmentCore(db, request(), marina, "gestor", TODAY);
    // 26/10: a 10 dias do vencimento de novembro (dia 5).
    await runMonthlyBilling(db, "2026-10-26");
    const novId = `${out.enrollmentId}_2026-11`;
    assert.equal(fake.store.get(`arenaClassCharges/${novId}`)!["billingMode"], "asaas");
    const group = fake.store.get(`arenaClassAsaasPayments/${novId}`)!;
    assert.equal(group["state"], "pending");
    assert.equal(group["amountReais"], 320);
    assert.equal(group["dueDate"], "2026-11-05");
  });
});

describe("cobrança online — cancelar mensalidade", () => {
  it("presa em 'gerando link' (o Asaas recusou): cancelar anula o grupo e a varredura para", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await createEnrollmentCore(db, request({waiveFee: true}), marina, "gestor", TODAY);
    const groupId = out.asaasGroupId!;
    let attempts = 0;
    const rejected = fakeDeps({createPayment: async () => {
      attempts += 1;
      throw new Error("O valor mínimo para cobranças com a forma de pagamento Pergunte ao Cliente é R$ 5,00.");
    }});
    assert.equal((await ensureClassAsaasPayment(db, groupId, rejected.deps)).state, "failed");

    const chargeId = `${out.enrollmentId}_2026-10`;
    await setChargeStatusCore(db, chargeId, {status: "canceled", paymentMethod: null, paidOn: null, actorUid: "g"}, TODAY);
    assert.equal(fake.store.get(`arenaClassCharges/${chargeId}`)!["status"], "canceled");
    assert.equal(fake.store.get(`arenaClassAsaasPayments/${groupId}`)!["state"], "voiding");

    const voided = await voidClassAsaasPayment(db, groupId, rejected.deps);
    assert.deepEqual(voided, {state: "void", regroupedAs: null});
    assert.deepEqual(rejected.calls.deleted, []); // nada nasceu no Asaas
    await reconcileClassAsaasPayments(db, NOW, rejected.deps);
    assert.equal(attempts, 1);
  });

  it("cancelar uma das mensalidades da fatura: apaga no Asaas e o resto ganha link novo", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {out, deps, calls} = await enrollAndOpen(fake, db);
    const groupId = out.asaasGroupId!;
    await setChargeStatusCore(db, `${out.enrollmentId}_fee`, {status: "canceled", paymentMethod: null, paidOn: null, actorUid: "g"}, TODAY);

    const voided = await voidClassAsaasPayment(db, groupId, deps);
    assert.deepEqual(calls.deleted, [`pay_${groupId}`]);
    assert.equal(voided.regroupedAs, `${groupId}_v1`);
    assert.deepEqual(fake.store.get(`arenaClassAsaasPayments/${groupId}_v1`)!["chargeIds"], [`${out.enrollmentId}_2026-10`]);
    assert.equal((fake.store.get(`arenaClassCharges/${out.enrollmentId}_fee`)!["asaas"] as Record<string, unknown>)["state"], "void");
  });
});

describe("cobrança online — webhook e caixa", () => {
  it("PIX recebido: mensalidades pagas e caixa creditado com a taxa do plano (Pro 6%)", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {out} = await enrollAndOpen(fake, db);
    const groupId = out.asaasGroupId!;
    const ref = processedRef(fake, `pay_${groupId}`);

    await processArenaClassAsaasNotification(db, `pay_${groupId}`, payment(groupId), ref, webhookDeps());
    await processArenaClassAsaasNotification(db, `pay_${groupId}`, payment(groupId), ref, webhookDeps()); // reentrega

    for (const id of out.chargeIds) {
      const c = fake.store.get(`arenaClassCharges/${id}`)!;
      assert.equal(c["status"], "paid");
      assert.equal(c["paidVia"], "asaas");
      assert.equal(c["paidOn"], TODAY);
    }
    const wallet = fake.store.get("arenaWallets/arena1")!;
    // 192,22 − 6% (11,53) = 180,69, uma vez só.
    assert.equal(wallet["availableReais"], 180.69);
    const ledger = [...fake.store.entries()].filter(([k]) => k.startsWith("arenaWallets/arena1/ledger/"));
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0]![1]["source"], "class");
    // A taxa do pagamento (11,53) fica repartida nas mensalidades: o repasse desconta a parte de cada uma.
    const month = fake.store.get(`arenaClassCharges/${out.enrollmentId}_2026-10`)!;
    const fee = fake.store.get(`arenaClassCharges/${out.enrollmentId}_fee`)!;
    assert.equal(month["platformFeeReais"], 8.53);
    assert.equal(fee["platformFeeReais"], 3);
  });

  it("cartão: autorizado paga e segura no 'a liberar'; liquidado credita e solta", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {out} = await enrollAndOpen(fake, db);
    const groupId = out.asaasGroupId!;
    const ref = processedRef(fake, `pay_${groupId}`);
    const card = {billingType: "CREDIT_CARD", netValue: 186.0};

    await processArenaClassAsaasNotification(db, `pay_${groupId}`, payment(groupId, {...card, status: "CONFIRMED"}), ref, webhookDeps());
    assert.equal(fake.store.get(`arenaClassCharges/${out.chargeIds[0]}`)!["status"], "paid");
    let wallet = fake.store.get("arenaWallets/arena1")!;
    // 192,22 − 11,53 (taxa) − 6,22 (cartão) = 174,47 a liberar.
    assert.equal(wallet["awaitingSettlementReais"], 174.47);
    assert.ok(!wallet["availableReais"]);

    await processArenaClassAsaasNotification(db, `pay_${groupId}`, payment(groupId, {...card, status: "RECEIVED"}), ref, webhookDeps());
    wallet = fake.store.get("arenaWallets/arena1")!;
    assert.equal(wallet["availableReais"], 174.47);
    assert.equal(wallet["awaitingSettlementReais"], 0);
  });

  it("pago depois da baixa manual: estorna e não mexe nas mensalidades nem no caixa", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {out, deps, calls} = await enrollAndOpen(fake, db);
    const groupId = out.asaasGroupId!;
    // Gestor recebeu em dinheiro a taxa: grupo pede anulação; o resto ganha grupo novo.
    await setChargeStatusCore(db, `${out.enrollmentId}_fee`, {status: "paid", paymentMethod: "cash", paidOn: null, actorUid: "g"}, TODAY);
    assert.equal(fake.store.get(`arenaClassAsaasPayments/${groupId}`)!["state"], "voiding");
    const voided = await voidClassAsaasPayment(db, groupId, deps);
    assert.deepEqual(calls.deleted, [`pay_${groupId}`]);
    assert.equal(voided.regroupedAs, `${groupId}_v1`);
    const regrouped = fake.store.get(`arenaClassAsaasPayments/${groupId}_v1`)!;
    assert.deepEqual(regrouped["chargeIds"], [`${out.enrollmentId}_2026-10`]);
    assert.equal(regrouped["amountReais"], 142.22);

    // O aluno pagou a fatura antiga antes de ela sumir.
    const refunds: string[] = [];
    await processArenaClassAsaasNotification(db, `pay_${groupId}`, payment(groupId), processedRef(fake, `pay_${groupId}`), webhookDeps(refunds));
    assert.deepEqual(refunds, [`pay_${groupId}`]);
    assert.equal(fake.store.get(`arenaClassCharges/${out.enrollmentId}_2026-10`)!["status"], "open");
    assert.equal(fake.store.has("arenaWallets/arena1"), false);
  });

  it("desfazer pago online é recusado; cancelar a matrícula anula o grupo das futuras", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {out} = await enrollAndOpen(fake, db);
    const groupId = out.asaasGroupId!;
    await processArenaClassAsaasNotification(db, `pay_${groupId}`, payment(groupId), processedRef(fake, `pay_${groupId}`), webhookDeps());
    await assert.rejects(
      setChargeStatusCore(db, `${out.enrollmentId}_fee`, {status: "open", paymentMethod: null, paidOn: null, actorUid: "g"}, TODAY),
      /estorno/,
    );

    await runMonthlyBilling(db, "2026-10-26");
    const novId = `${out.enrollmentId}_2026-11`;
    await setEnrollmentStatusCore(db, out.enrollmentId, "canceled", "2026-10-27");
    assert.equal(fake.store.get(`arenaClassCharges/${novId}`)!["status"], "canceled");
    assert.equal(fake.store.get(`arenaClassAsaasPayments/${novId}`)!["state"], "voiding");
  });

  it("referência: só aceita o prefixo de aula com id simples", () => {
    assert.equal(parseClassPaymentRef("arenaClassPayment:e1_first"), "e1_first");
    assert.equal(parseClassPaymentRef("arenaBooking:x"), null);
    assert.equal(parseClassPaymentRef("arenaClassPayment:a/b"), null);
  });
});

describe("cobrança online — regressões da revisão dos planos de horário", () => {
  it("1. webhook e varredura no mesmo pagamento: a 2ª execução não estorna nem credita de novo", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {out} = await enrollAndOpen(fake, db);
    const groupId = out.asaasGroupId!;
    const ref = processedRef(fake, `pay_${groupId}`);
    // A 2ª execução leu o doc de processados (fora da transação) antes de a 1ª gravar.
    const staleRef = {...ref, get: async () => ({exists: false, id: ref.id, data: () => undefined})} as unknown as typeof ref;
    const refunds: string[] = [];
    await processArenaClassAsaasNotification(db, `pay_${groupId}`, payment(groupId), ref, webhookDeps(refunds));
    await processArenaClassAsaasNotification(db, `pay_${groupId}`, payment(groupId), staleRef, webhookDeps(refunds));

    assert.deepEqual(refunds, []);
    assert.equal(fake.store.get(ref.path)!["outcome"], "approved");
    for (const id of out.chargeIds) assert.equal(fake.store.get(`arenaClassCharges/${id}`)!["status"], "paid");
    assert.equal(fake.store.get("arenaWallets/arena1")!["availableReais"], 180.69);
    assert.equal([...fake.store.keys()].filter((k) => k.startsWith("arenaWallets/arena1/ledger/")).length, 1);
  });

  it("1. cartão: a 2ª execução do autorizado não estorna nem segura de novo no 'a liberar'", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {out} = await enrollAndOpen(fake, db);
    const groupId = out.asaasGroupId!;
    const ref = processedRef(fake, `pay_${groupId}`);
    const staleRef = {...ref, get: async () => ({exists: false, id: ref.id, data: () => undefined})} as unknown as typeof ref;
    const card = payment(groupId, {billingType: "CREDIT_CARD", netValue: 186.0, status: "CONFIRMED"});
    const refunds: string[] = [];
    await processArenaClassAsaasNotification(db, `pay_${groupId}`, card, ref, webhookDeps(refunds));
    await processArenaClassAsaasNotification(db, `pay_${groupId}`, card, staleRef, webhookDeps(refunds));

    assert.deepEqual(refunds, []);
    assert.equal(fake.store.get("arenaWallets/arena1")!["awaitingSettlementReais"], 174.47);
  });

  it("2. Asaas falha depois da anulação: o grupo segue void e a varredura não recria nem avisa", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await createEnrollmentCore(db, request({waiveFee: true}), marina, "gestor", TODAY);
    const groupId = out.asaasGroupId!;
    const chargeId = `${out.enrollmentId}_2026-10`;
    const {deps, calls} = fakeDeps({
      createPayment: async (input) => {
        calls.created.push(input.groupId);
        // Gestor cancela a mensalidade enquanto o Asaas pendura; o void roda e o Asaas então falha.
        await setChargeStatusCore(db, chargeId, {status: "canceled", paymentMethod: null, paidOn: null, actorUid: "g"}, TODAY);
        await voidClassAsaasPayment(db, input.groupId, fakeDeps().deps);
        throw new Error("timeout");
      },
    });
    assert.deepEqual(await ensureClassAsaasPayment(db, groupId, deps), {state: "void"});
    assert.equal(fake.store.get(`arenaClassAsaasPayments/${groupId}`)!["state"], "void");

    await reconcileClassAsaasPayments(db, NOW, deps);
    assert.equal(calls.created.length, 1);
    assert.equal(calls.pushes.length, 0);
    assert.equal(fake.store.get(`arenaClassAsaasPayments/${groupId}`)!["state"], "void");
  });

  it("2. reivindicar grupo de mensalidades já resolvidas (gatilho perdido) anula sem chamar o Asaas", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await createEnrollmentCore(db, request(), marina, "gestor", TODAY);
    const groupId = out.asaasGroupId!;
    for (const id of out.chargeIds) {
      fake.seedDoc(`arenaClassCharges/${id}`, {...fake.store.get(`arenaClassCharges/${id}`)!, status: "canceled"});
    }
    // Grupo reaberto como `failed` por cima da anulação (o bug antigo): a varredura não recria.
    fake.seedDoc(`arenaClassAsaasPayments/${groupId}`, {...fake.store.get(`arenaClassAsaasPayments/${groupId}`)!, state: "failed"});
    const {deps, calls} = fakeDeps();
    await reconcileClassAsaasPayments(db, NOW, deps);
    const group = fake.store.get(`arenaClassAsaasPayments/${groupId}`)!;
    assert.equal(group["state"], "void");
    assert.equal(group["voidReason"], "charges_resolved");
    assert.deepEqual(calls.created, []);
    assert.deepEqual(calls.pushes, []);
  });

  it("2. reivindicar grupo com parte resolvida: vai para voiding e o void reagrupa o resto", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const out = await createEnrollmentCore(db, request(), marina, "gestor", TODAY);
    const groupId = out.asaasGroupId!;
    const feeId = `${out.enrollmentId}_fee`;
    fake.seedDoc(`arenaClassCharges/${feeId}`, {...fake.store.get(`arenaClassCharges/${feeId}`)!, status: "paid", paidVia: "manual"});
    const {deps, calls} = fakeDeps();
    assert.deepEqual(await ensureClassAsaasPayment(db, groupId, deps), {state: "voiding"});
    assert.deepEqual(calls.created, []);

    const voided = await voidClassAsaasPayment(db, groupId, deps);
    assert.deepEqual(voided, {state: "void", regroupedAs: `${groupId}_v1`});
    assert.deepEqual(calls.deleted, []); // nada nasceu no Asaas
    assert.deepEqual(fake.store.get(`arenaClassAsaasPayments/${groupId}_v1`)!["chargeIds"], [`${out.enrollmentId}_2026-10`]);
  });

  it("3. DELETE com falha passageira mantém voiding e tenta de novo até o limite", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {out, deps} = await enrollAndOpen(fake, db);
    const groupId = out.asaasGroupId!;
    await setChargeStatusCore(db, `${out.enrollmentId}_fee`, {status: "canceled", paymentMethod: null, paidOn: null, actorUid: "g"}, TODAY);
    const flaky: ClassAsaasDeps = {...deps, deletePayment: async () => {
      throw new Error("503");
    }};
    const voidOf = () => fake.store.get(`arenaClassAsaasPayments/${groupId}`)!;

    // Ainda cobrável no Asaas: segue voiding, sem reagrupar.
    assert.deepEqual(await voidClassAsaasPayment(db, groupId, {...flaky, getPayment: async (id) => ({id, status: "PENDING"})}),
      {state: "voiding", regroupedAs: null});
    // Nem a consulta respondeu: segue voiding.
    assert.deepEqual(await voidClassAsaasPayment(db, groupId, {...flaky, getPayment: async () => {
      throw new Error("timeout");
    }}), {state: "voiding", regroupedAs: null});
    assert.equal(voidOf()["voidAttempts"], 2);
    assert.equal(fake.store.has(`arenaClassAsaasPayments/${groupId}_v1`), false);
    for (let i = 3; i < MAX_VOID_ATTEMPTS; i++) {
      const r = await voidClassAsaasPayment(db, groupId, {...flaky, getPayment: async (id) => ({id, status: "OVERDUE"})});
      assert.equal(r.state, "voiding");
    }
    // Na 10ª, fecha mesmo assim (com o erro guardado) e reagrupa o resto.
    assert.deepEqual(await voidClassAsaasPayment(db, groupId, {...flaky, getPayment: async (id) => ({id, status: "PENDING"})}),
      {state: "void", regroupedAs: `${groupId}_v1`});
    assert.equal(voidOf()["voidError"], "503");
  });

  it("3. DELETE recusado porque já foi pago: fecha void na hora (o webhook estorna)", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    const {out, deps} = await enrollAndOpen(fake, db);
    const groupId = out.asaasGroupId!;
    await setChargeStatusCore(db, `${out.enrollmentId}_fee`, {status: "canceled", paymentMethod: null, paidOn: null, actorUid: "g"}, TODAY);
    const paid: ClassAsaasDeps = {...deps,
      deletePayment: async () => {
        throw new Error("cobrança recebida não pode ser removida");
      },
      getPayment: async (id) => ({id, status: "RECEIVED"}),
    };
    assert.deepEqual(await voidClassAsaasPayment(db, groupId, paid), {state: "void", regroupedAs: `${groupId}_v1`});
    assert.equal(fake.store.get(`arenaClassAsaasPayments/${groupId}`)!["voidAttempts"], undefined);
  });
});
