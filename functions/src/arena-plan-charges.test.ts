import {afterEach, describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp, type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  addCycleToDayKey,
  pickOpenPlanCharge,
  planActiveUntilAfterPayment,
  planChargeReminderMessage,
  planChargeReminderStage,
  type AsaasSubscriptionPayment,
} from "./arena-plan-charges-model";
import {
  ARENA_PLAN_NOTIFICATION_LINKS,
  planChargeNotifier,
  planChargeSource,
  runArenaPlanChargeReminders,
} from "./arena-plan-charges";
import {processArenaSubscriptionAsaasNotification} from "./asaas-arena-subscription-webhook";

const pix = (o: Partial<AsaasSubscriptionPayment> = {}): AsaasSubscriptionPayment => ({
  id: "pay_1", status: "PENDING", value: 249, dueDate: "2026-12-12", billingType: "PIX",
  invoiceUrl: "https://asaas/i/1", ...o,
});

describe("pickOpenPlanCharge", () => {
  it("Pix pendente é a mensalidade em aberto, em centavos", () => {
    assert.deepEqual(pickOpenPlanCharge([pix()]), {
      paymentId: "pay_1", status: "PENDING", dueDate: "2026-12-12", valueCents: 24900,
      billingType: "PIX", invoiceUrl: "https://asaas/i/1",
    });
  });

  it("cartão pendente fica de fora (o Asaas cobra sozinho); cartão vencido entra", () => {
    assert.equal(pickOpenPlanCharge([pix({billingType: "CREDIT_CARD"})]), null);
    assert.equal(pickOpenPlanCharge([pix({billingType: "CREDIT_CARD", status: "OVERDUE"})])?.status, "OVERDUE");
  });

  it("a mais antiga primeiro; pagas e removidas não contam", () => {
    const picked = pickOpenPlanCharge([
      pix({id: "jan", dueDate: "2027-01-12"}),
      pix({id: "dez", dueDate: "2026-12-12", status: "OVERDUE"}),
      pix({id: "nov", dueDate: "2026-11-12", status: "RECEIVED"}),
      pix({id: "out", dueDate: "2026-10-12", deleted: true}),
    ]);
    assert.equal(picked?.paymentId, "dez");
  });
});

describe("planActiveUntilAfterPayment", () => {
  it("vencimento + 1 ciclo, com fim de mês", () => {
    assert.equal(planActiveUntilAfterPayment("2026-11-12", "monthly"), "2026-12-12");
    assert.equal(planActiveUntilAfterPayment("2026-12-20", "monthly"), "2027-01-20");
    assert.equal(planActiveUntilAfterPayment("2026-11-12", "yearly"), "2027-11-12");
    assert.equal(addCycleToDayKey("2027-01-31", "monthly"), "2027-02-28");
    assert.equal(planActiveUntilAfterPayment(undefined, "monthly"), null);
  });
});

describe("planChargeReminderStage", () => {
  const due = {dueDate: "2026-12-12"};
  it("3 dias antes, no dia, 1 dia depois e o último aviso no 5º dia", () => {
    assert.equal(planChargeReminderStage(due, "2026-12-09"), "due_soon");
    assert.equal(planChargeReminderStage(due, "2026-12-12"), "due_today");
    assert.equal(planChargeReminderStage(due, "2026-12-13"), "overdue");
    assert.equal(planChargeReminderStage(due, "2026-12-17"), "last_call");
    for (const day of ["2026-12-08", "2026-12-10", "2026-12-11", "2026-12-14", "2026-12-18", "2026-12-19"]) {
      assert.equal(planChargeReminderStage(due, day), null, day);
    }
  });

  it("texto: valor, vencimento e o último dia do plano", () => {
    const charge = {dueDate: "2026-12-12", valueCents: 24900, billingType: "PIX"};
    const soon = planChargeReminderMessage("due_soon", charge, "Pro");
    assert.equal(soon.title, "Mensalidade do plano Pro vence em 3 dias");
    assert.match(soon.body, /^R\$ 249,00 vence em 12\/12/);
    assert.match(planChargeReminderMessage("overdue", charge, "Pro").body, /até 18\/12/);
    assert.match(planChargeReminderMessage("last_call", charge, "Pro").body, /até amanhã \(18\/12\)/);
    assert.match(
      planChargeReminderMessage("overdue", {...charge, billingType: "CREDIT_CARD", valueCents: 548400}, "Elite").body,
      /R\$ 5\.484,00 foi recusada/,
    );
  });
});

describe("runArenaPlanChargeReminders", () => {
  const originalList = planChargeSource.listOpen;
  const originalSend = planChargeNotifier.send;
  afterEach(() => {
    planChargeSource.listOpen = originalList;
    planChargeNotifier.send = originalSend;
  });

  function seed(): FakeFirestore {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1", {managerUserId: "owner", planTier: "pro", planStatus: "active"});
    fake.seedDoc("arenas/a1/billing/subscription", {asaasSubscriptionId: "sub_1", status: "active"});
    // Sem assinatura viva: cancelada não recebe lembrete.
    fake.seedDoc("arenas/a2", {managerUserId: "o2", planTier: "pro", planStatus: "active"});
    fake.seedDoc("arenas/a2/billing/subscription", {asaasSubscriptionId: "sub_2", status: "canceled"});
    // Sem plano: nem entra na consulta.
    fake.seedDoc("arenas/a3", {managerUserId: "o3", planStatus: "none"});
    return fake;
  }

  it("avisa o dono 3 dias antes, uma vez só por cobrança e tipo", async () => {
    const fake = seed();
    const asked: string[] = [];
    planChargeSource.listOpen = async (subId) => {
      asked.push(subId);
      return [pix()];
    };
    const sent: Array<{userId: string; title: string; type: string; data: Record<string, string>}> = [];
    planChargeNotifier.send = async (input) => {
      sent.push(input);
      return {sent: 1, failed: 0};
    };
    const now = new Date("2026-12-09T12:00:00Z");

    const first = await runArenaPlanChargeReminders(fake as unknown as Firestore, now);
    assert.deepEqual(asked, ["sub_1"]);
    assert.equal(first.sent, 1);
    assert.equal(sent[0]!.userId, "owner");
    assert.equal(sent[0]!.type, "arena_plan_charge_reminder");
    assert.equal(sent[0]!.title, "Mensalidade do plano Pro vence em 3 dias");
    assert.equal(sent[0]!.data["url"], ARENA_PLAN_NOTIFICATION_LINKS.url);
    assert.equal(sent[0]!.data["webUrl"], "/painel/planos");

    const again = await runArenaPlanChargeReminders(fake as unknown as Firestore, now);
    assert.equal(again.sent, 0);
    assert.equal(sent.length, 1);
  });

  it("dia sem lembrete e cartão pendente não mandam nada", async () => {
    const fake = seed();
    let calls = 0;
    planChargeNotifier.send = async () => {
      calls++;
      return {sent: 1, failed: 0};
    };
    planChargeSource.listOpen = async () => [pix()];
    await runArenaPlanChargeReminders(fake as unknown as Firestore, new Date("2026-12-10T12:00:00Z"));
    planChargeSource.listOpen = async () => [pix({billingType: "CREDIT_CARD"})];
    await runArenaPlanChargeReminders(fake as unknown as Firestore, new Date("2026-12-12T12:00:00Z"));
    assert.equal(calls, 0);
  });
});

describe("webhook do plano: validade depois do pagamento", () => {
  it("vale até o vencimento pago + 1 ciclo (não o nextDueDate da assinatura)", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("arenas/a1", {managerUserId: "owner"});
    fake.seedDoc("arenas/a1/billing/subscription", {asaasSubscriptionId: "sub_1", cycle: "monthly", status: "pending"});
    await processArenaSubscriptionAsaasNotification(
      fake as unknown as Firestore,
      "pay_1",
      {status: "RECEIVED", dueDate: "2026-11-12", subscription: "sub_1", externalReference: "arenaSubscription:a1:pro"},
      fake.doc("asaasProcessed/pay_1") as never,
    );
    const arena = fake.store.get("arenas/a1")!;
    assert.equal(arena["planStatus"], "active");
    assert.equal(
      (arena["planActiveUntil"] as Timestamp).toMillis(),
      Date.parse("2026-12-12T00:00:00-03:00"),
    );
  });

  it("pagamento antigo confirmado depois não encurta a validade", async () => {
    const fake = new FakeFirestore();
    const later = Timestamp.fromMillis(Date.parse("2027-01-12T00:00:00-03:00"));
    fake.seedDoc("arenas/a1", {planTier: "pro", planCycle: "monthly", planStatus: "active", planActiveUntil: later});
    fake.seedDoc("arenas/a1/billing/subscription", {asaasSubscriptionId: "sub_1", cycle: "monthly"});
    await processArenaSubscriptionAsaasNotification(
      fake as unknown as Firestore,
      "pay_nov",
      {status: "CONFIRMED", dueDate: "2026-11-12", subscription: "sub_1", externalReference: "arenaSubscription:a1:pro"},
      fake.doc("asaasProcessed/pay_nov") as never,
    );
    assert.equal((fake.store.get("arenas/a1")!["planActiveUntil"] as Timestamp).toMillis(), later.toMillis());
  });
});
