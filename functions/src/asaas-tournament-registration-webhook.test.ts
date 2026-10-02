import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {processTournamentRegistrationAsaasNotification} from "./asaas-tournament-registration-webhook";
import {Timestamp} from "firebase-admin/firestore";
import {attachHoldPayment, captureHold, holdCashback} from "./athlete-wallet";
import {reverseCashbackForPayment} from "./cashback-reversal";

process.env.GCLOUD_PROJECT = "p";

const REG_ID = "reg1";
const REG_PATH = `artifacts/p/public/data/inscriptions/${REG_ID}`;
const PENDING_A = `${REG_PATH}/pixPending/uidA`;
const PENDING_B = `${REG_PATH}/pixPending/uidB`;
const PROCESSED_PATH = "artifacts/p/public/data/asaas_processed_payments/pay1";
const TOURNAMENT_PATH = "tournaments/t1";
const CATEGORY = "Masculina A";
const ENTRY_FEE = 100;

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  // Contas vivas: a intenção de cashback de conta excluída é encerrada sem ganho.
  fake.seedDoc("users/uidA", {fullName: "Atleta A"});
  fake.seedDoc("users/uidB", {fullName: "Atleta B"});
  fake.seedDoc(TOURNAMENT_PATH, {
    name: "Copa Teste",
    categories: [{categoryName: CATEGORY, entryFee: ENTRY_FEE}],
  });
  return {fake, db: fake as unknown as Firestore};
}

function seedRegistration(
  fake: FakeFirestore,
  overrides: Record<string, unknown> = {},
): void {
  fake.seedDoc(REG_PATH, {
    tournamentId: "t1",
    categoryId: CATEGORY,
    player1Id: "uidA",
    participantUids: ["uidA", "uidB"],
    sharePaidUids: [],
    paidAmount: 0,
    isPaid: false,
    ...overrides,
  });
}

function processedRefOf(db: Firestore): DocumentReference {
  return db.doc(PROCESSED_PATH) as DocumentReference;
}

function makeDeps() {
  const cancelled: string[] = [];
  return {
    cancelled,
    deps: {
      cancelCharge: async (paymentId: string) => {
        cancelled.push(paymentId);
      },
    },
  };
}

/** Pagamento do atleta A confirmando a taxa inteira ("integral"). */
const fullPayment = {
  status: "RECEIVED",
  value: ENTRY_FEE,
  externalReference: `tournamentRegistration:${REG_ID}:uidA`,
};

describe("asaas-tournament-registration-webhook: cobrança do parceiro", () => {
  it("cancela o PIX aberto do parceiro quando o integral confirma a inscrição", async () => {
    const {fake, db} = makeDb();
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, {
      status: "pending",
      amountType: "full",
      asaasPaymentId: "payA",
      payerUid: "uidA",
    });
    fake.seedDoc(PENDING_B, {
      status: "pending",
      amountType: "share",
      asaasPaymentId: "payB",
      payerUid: "uidB",
    });
    const {deps, cancelled} = makeDeps();

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", fullPayment, processedRefOf(db), deps,
    );

    assert.equal(fake.store.get(REG_PATH)!["isPaid"], true);
    assert.deepEqual(cancelled, ["payB"]);
    assert.equal(fake.store.get(PENDING_B)!["status"], "cancelled");
  });

  it("não mexe em cobrança do parceiro já paga (parcela + parcela)", async () => {
    const {fake, db} = makeDb();
    // B já pagou a parcela dele; A paga a que faltava e a inscrição fecha.
    seedRegistration(fake, {sharePaidUids: ["uidB"], paidAmount: 50});
    fake.seedDoc(PENDING_A, {
      status: "pending",
      amountType: "share",
      asaasPaymentId: "payA",
      payerUid: "uidA",
    });
    fake.seedDoc(PENDING_B, {
      status: "paid",
      amountType: "share",
      asaasPaymentId: "payB",
      payerUid: "uidB",
    });
    const {deps, cancelled} = makeDeps();

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", {...fullPayment, value: 50}, processedRefOf(db), deps,
    );

    assert.equal(fake.store.get(REG_PATH)!["isPaid"], true);
    assert.deepEqual(cancelled, []);
    assert.equal(fake.store.get(PENDING_B)!["status"], "paid");
  });
});

describe("asaas-tournament-registration-webhook: pagamento duplicado", () => {
  it("marca o duplicado para estorno com o valor pago", async () => {
    const {fake, db} = makeDb();
    // A já consta como pago (o parceiro pagou o integral antes) e mesmo assim
    // um pagamento dele chega: dinheiro entrou sem crédito, precisa de estorno.
    seedRegistration(fake, {
      sharePaidUids: ["uidA", "uidB"],
      paidAmount: ENTRY_FEE,
      isPaid: true,
    });
    const {deps} = makeDeps();

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", {...fullPayment, value: 50}, processedRefOf(db), deps,
    );

    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed["outcome"], "duplicate_payer");
    assert.equal(processed["refundRequired"], true);
    assert.equal(processed["paidValue"], 50);
    // O valor não pode ser creditado de novo na inscrição.
    assert.equal(fake.store.get(REG_PATH)!["paidAmount"], ENTRY_FEE);
  });
});

const CARD_PENDING_A = {
  status: "pending",
  amountType: "full",
  asaasPaymentId: "pay1",
  payerUid: "uidA",
  billingType: "CREDIT_CARD",
};

const PIX_PENDING_A = {
  status: "pending",
  amountType: "full",
  asaasPaymentId: "pay1",
  payerUid: "uidA",
};

function cardPayment(status: string, extra: Record<string, unknown> = {}) {
  return {
    status,
    value: ENTRY_FEE,
    billingType: "CREDIT_CARD",
    externalReference: `tournamentRegistration:${REG_ID}:uidA`,
    ...extra,
  };
}

/** O crédito da carteira só acontece com organizador no torneio. */
function seedTournamentWithOrganizer(fake: FakeFirestore): void {
  fake.seedDoc(TOURNAMENT_PATH, {
    name: "Copa Teste",
    managerId: "org1",
    categories: [{categoryName: CATEGORY, entryFee: ENTRY_FEE}],
  });
}

function walletDoc(fake: FakeFirestore): Record<string, unknown> | undefined {
  return fake.store.get("tournamentWallets/t1");
}

describe("asaas-tournament-registration-webhook: cartão em duas fases", () => {
  it("CONFIRMED confirma a inscrição e NÃO credita a carteira", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, CARD_PENDING_A);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", cardPayment("CONFIRMED"), processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(REG_PATH)!["isPaid"], true);
    assert.equal(fake.store.get(PENDING_A)!["status"], "paid");
    assert.equal(walletDoc(fake), undefined);
    assert.ok(fake.store.get(PROCESSED_PATH)!["confirmedAt"]);
    assert.equal(fake.store.get(PROCESSED_PATH)!["walletCreditedAt"], undefined);
  });

  it("RECEIVED depois do CONFIRMED credita a carteira sem reconfirmar", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, CARD_PENDING_A);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", cardPayment("CONFIRMED"), processedRefOf(db), makeDeps().deps,
    );
    await processTournamentRegistrationAsaasNotification(
      db, "pay1", cardPayment("RECEIVED", {netValue: 96.71}),
      processedRefOf(db), makeDeps().deps,
    );

    // bruto 100 − 8% da plataforma − 3,29 do cartão
    assert.equal(walletDoc(fake)!["availableReais"], 88.71);
    assert.equal(fake.store.get(REG_PATH)!["paidAmount"], ENTRY_FEE);
    assert.ok(fake.store.get(PROCESSED_PATH)!["walletCreditedAt"]);
  });

  it("RECEIVED sozinho confirma e credita (CONFIRMED perdido)", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, CARD_PENDING_A);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", cardPayment("RECEIVED", {netValue: 96.71}),
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(REG_PATH)!["isPaid"], true);
    assert.equal(walletDoc(fake)!["availableReais"], 88.71);
  });

  it("reentrega do RECEIVED não credita de novo", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, CARD_PENDING_A);

    const evt = cardPayment("RECEIVED", {netValue: 96.71});
    await processTournamentRegistrationAsaasNotification(
      db, "pay1", evt, processedRefOf(db), makeDeps().deps,
    );
    await processTournamentRegistrationAsaasNotification(
      db, "pay1", evt, processedRefOf(db), makeDeps().deps,
    );

    assert.equal(walletDoc(fake)!["availableReais"], 88.71);
  });

  it("netValue ausente credita sem descontar taxa de gateway", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, CARD_PENDING_A);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", cardPayment("RECEIVED"), processedRefOf(db), makeDeps().deps,
    );

    assert.equal(walletDoc(fake)!["availableReais"], 92);
  });

  it("grava o dono do torneio no caixa", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, CARD_PENDING_A);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", cardPayment("RECEIVED", {netValue: 96.71}),
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(walletDoc(fake)!["ownerId"], "org1");
    assert.equal(walletDoc(fake)!["tournamentId"], "t1");
  });
});

describe("asaas-tournament-registration-webhook: PIX inalterado", () => {
  it("CONFIRMED de PIX não confirma nada", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, PIX_PENDING_A);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", {...fullPayment, status: "CONFIRMED"},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(REG_PATH)!["isPaid"], false);
    assert.equal(fake.store.get(PROCESSED_PATH), undefined);
  });

  it("RECEIVED de PIX confirma e credita numa passada só, sem taxa de gateway", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, PIX_PENDING_A);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1", {...fullPayment, netValue: 96.71},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(REG_PATH)!["isPaid"], true);
    assert.equal(walletDoc(fake)!["availableReais"], 92);
  });
});

describe("asaas-tournament-registration-webhook: cashback", () => {
  const START_MS = Date.UTC(2026, 10, 7, 11, 0, 0);
  const NOW_MS = Date.now();

  function seedTournamentWithOrganizer(fake: FakeFirestore, categories?: unknown[]): void {
    fake.seedDoc(TOURNAMENT_PATH, {
      name: "Copa Teste",
      managerId: "org1",
      startAt: Timestamp.fromMillis(START_MS),
      categories: categories ?? [{categoryName: CATEGORY, entryFee: ENTRY_FEE}],
    });
  }

  function seedSpendableLot(fake: FakeFirestore, uid: string, cents: number): void {
    fake.seedDoc(`athleteWallets/${uid}/lots/old`, {
      uid, sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: cents, remainingCents: cents, status: "available",
      eventAt: Timestamp.fromMillis(NOW_MS - 1000), releasedAt: Timestamp.fromMillis(NOW_MS - 1000),
      expiresAt: Timestamp.fromMillis(NOW_MS + 90 * 86_400_000), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(NOW_MS - 1000),
    });
  }

  function tournamentLedger(fake: FakeFirestore): Record<string, unknown>[] {
    return [...fake.store.entries()]
      .filter(([path]) => path.startsWith("tournamentWallets/t1/ledger/"))
      .map(([, data]) => data);
  }

  it("saldo aplicado: o caixa recebe o bruto e a reserva é capturada", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    seedSpendableLot(fake, "uidA", 2000);
    const {holdId} = await holdCashback(db, {
      uid: "uidA", maxCents: 1000, sourceType: "registration", sourceId: REG_ID,
      trackingPath: PENDING_A, label: "Inscrição · Copa Teste", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uidA", holdId!, "pay1");
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "share", asaasPaymentId: "pay1", payerUid: "uidA",
      cashbackAppliedCents: 1000, cashbackHoldId: holdId,
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 40, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(REG_PATH)!.paidAmount, 50);
    const credit = tournamentLedger(fake).find((e) => e.type === "credit")!;
    assert.equal(credit.grossReais, 50);
    assert.equal(credit.platformFeeReais, 4);
    assert.equal(credit.netReais, 46);
    assert.equal(credit.cashbackAppliedReais, 10);
    assert.equal(fake.store.get(`athleteWallets/uidA/holds/${holdId}`)!.status, "captured");
    assert.equal(fake.store.get(PROCESSED_PATH)!.cashbackStatus, "done");
  });

  it("cashback ligado: 2% do dinheiro vira lote pendente até o torneio começar", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc("appConfig/cashback", {enabled: true});
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "share", asaasPaymentId: "pay1", payerUid: "uidA",
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 50, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    const lot = fake.store.get("athleteWallets/uidA/lots/pay1")!;
    assert.equal(lot.status, "pending");
    // 2% de R$ 50 = R$ 1,00; teto = metade da taxa de R$ 4,00 = R$ 2,00.
    assert.equal(lot.earnedCents, 100);
    assert.equal(lot.sourceType, "registration");
    assert.equal(lot.tournamentId, "t1");
    assert.equal((lot.eventAt as Timestamp).toMillis(), START_MS);
  });

  it("cashback desligado não cria lote nem grava intenção sem reserva", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "share", asaasPaymentId: "pay1", payerUid: "uidA",
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 50, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.has("athleteWallets/uidA/lots/pay1"), false);
    assert.equal(fake.store.get(PROCESSED_PATH)!.cashbackStatus, undefined);
  });

  it("equipe: a parcela creditada é o bruto (dinheiro + saldo)", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake, [{categoryName: CATEGORY, entryFee: 90}]);
    seedRegistration(fake, {teamSize: 3, participantUids: ["uidA", "uidB", "uidC"]});
    seedSpendableLot(fake, "uidA", 2000);
    const {holdId} = await holdCashback(db, {
      uid: "uidA", maxCents: 1000, sourceType: "registration", sourceId: REG_ID,
      trackingPath: PENDING_A, label: "Inscrição · Copa Teste", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uidA", holdId!, "pay1");
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "share", asaasPaymentId: "pay1", payerUid: "uidA",
      cashbackAppliedCents: 1000, cashbackHoldId: holdId,
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 20, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(REG_PATH)!.paidAmount, 30);
  });

  it("cartão com saldo: CONFIRMED captura a reserva; RECEIVED credita o bruto mesmo com o pendente apagado", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    seedSpendableLot(fake, "uidA", 2000);
    const {holdId} = await holdCashback(db, {
      uid: "uidA", maxCents: 1000, sourceType: "registration", sourceId: REG_ID,
      trackingPath: PENDING_A, label: "Inscrição · Copa Teste", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uidA", holdId!, "pay1");
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "full", asaasPaymentId: "pay1", payerUid: "uidA",
      billingType: "CREDIT_CARD", cashbackAppliedCents: 1000, cashbackHoldId: holdId,
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "CONFIRMED", value: 90, billingType: "CREDIT_CARD",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(`athleteWallets/uidA/holds/${holdId}`)!.status, "captured");
    assert.equal(fake.store.get(PROCESSED_PATH)!.cashbackStatus, "done");
    assert.equal(walletDoc(fake), undefined);

    // O pendente some antes da liquidação (ex.: o atleta gerou outra cobrança
    // nesse meio tempo) — o crédito tem que achar o saldo pela intenção
    // gravada na confirmação, não pelo pendente.
    fake.store.delete(PENDING_A);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 90, billingType: "CREDIT_CARD", netValue: 87.21,
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    const credit = tournamentLedger(fake).find((e) => e.type === "credit")!;
    assert.equal(credit.grossReais, 100);
    assert.equal(credit.cashbackAppliedReais, 10);
  });

  it("pagamento tardio de cobrança substituída: acha a reserva pelo id do pagamento, não pelo pendente atual", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake);
    seedSpendableLot(fake, "uidA", 5000);
    const {holdId: holdOld} = await holdCashback(db, {
      uid: "uidA", maxCents: 1000, sourceType: "registration", sourceId: REG_ID,
      trackingPath: PENDING_A, label: "Inscrição · Copa Teste", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uidA", holdOld!, "payOld");
    const {holdId: holdNew} = await holdCashback(db, {
      uid: "uidA", maxCents: 2000, sourceType: "registration", sourceId: REG_ID,
      trackingPath: PENDING_A, label: "Inscrição · Copa Teste", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uidA", holdNew!, "payNew");
    // O atleta gerou uma cobrança nova: o pendente atual aponta pra ela.
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "share", asaasPaymentId: "payNew", payerUid: "uidA",
      cashbackAppliedCents: 2000, cashbackHoldId: holdNew,
    });

    // O webhook da cobrança ANTIGA (payOld) chega atrasado e, mesmo assim, paga.
    await processTournamentRegistrationAsaasNotification(
      db, "payOld",
      {status: "RECEIVED", value: 40, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(`athleteWallets/uidA/holds/${holdOld}`)!.status, "captured");
    assert.equal(fake.store.get(`athleteWallets/uidA/holds/${holdNew}`)!.status, "open");
    const credit = tournamentLedger(fake).find((e) => e.type === "credit")!;
    // Bruto é 40 (dinheiro) + 10 (saldo de payOld) — não os 20 de payNew.
    assert.equal(credit.grossReais, 50);
  });

  it("pagamento duplicado com saldo reservado: a reserva é devolvida, não capturada", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    // uidA já consta como pago (o parceiro pagou o integral antes) e mesmo
    // assim uma cobrança dele, com saldo reservado, chega.
    seedRegistration(fake, {sharePaidUids: ["uidA", "uidB"], paidAmount: ENTRY_FEE, isPaid: true});
    seedSpendableLot(fake, "uidA", 2000);
    const {holdId} = await holdCashback(db, {
      uid: "uidA", maxCents: 1000, sourceType: "registration", sourceId: REG_ID,
      trackingPath: PENDING_A, label: "Inscrição · Copa Teste", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uidA", holdId!, "pay1");
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "share", asaasPaymentId: "pay1", payerUid: "uidA",
      cashbackAppliedCents: 1000, cashbackHoldId: holdId,
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 40, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed.outcome, "duplicate_payer");
    assert.equal(processed.cashbackAppliedCents, 1000);
    assert.equal(fake.store.get(`athleteWallets/uidA/holds/${holdId}`)!.status, "released");
  });

  /**
   * Entregas concorrentes do MESMO pagamento: B leu o processado antes de o
   * lote de A gravar e a inscrição depois. Para B a parcela "já consta paga",
   * mas quem a pagou foi este pagamento — não é duplicado.
   */
  async function seedPaidByThisPayment(fake: FakeFirestore, db: Firestore): Promise<string> {
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake, {sharePaidUids: ["uidA"], paidAmount: 50});
    seedSpendableLot(fake, "uidA", 2000);
    const {holdId} = await holdCashback(db, {
      uid: "uidA", maxCents: 1000, sourceType: "registration", sourceId: REG_ID,
      trackingPath: PENDING_A, label: "Inscrição · Copa Teste", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uidA", holdId!, "pay1");
    await captureHold(db, "uidA", holdId!, NOW_MS);
    // O que o lote de confirmação de A gravou no pendente.
    fake.seedDoc(PENDING_A, {
      status: "paid", amountType: "share", asaasPaymentId: "pay1", payerUid: "uidA",
    });
    return holdId!;
  }

  function refundEntriesOf(fake: FakeFirestore): number {
    return [...fake.store.entries()]
      .filter(([path, data]) => path.startsWith("athleteWallets/uidA/ledger/") && data.type === "refund")
      .length;
  }

  it("parcela paga por ESTE pagamento (entrega concorrente): não é duplicado, não devolve o saldo", async () => {
    const {fake, db} = makeDb();
    const holdId = await seedPaidByThisPayment(fake, db);

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 40, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(`athleteWallets/uidA/holds/${holdId}`)!.status, "captured");
    assert.equal(refundEntriesOf(fake), 0);
    assert.equal(fake.store.get(PROCESSED_PATH)?.outcome, undefined);
  });

  it("entrega concorrente não sobrescreve o processado aprovado (com intenção) da outra", async () => {
    const {fake, db} = makeDb();
    const holdId = await seedPaidByThisPayment(fake, db);
    fake.seedDoc(PROCESSED_PATH, {
      kind: "tournamentRegistration", outcome: "approved", confirmedAt: Timestamp.fromMillis(NOW_MS),
      cashback: {uid: "uidA", holdId, appliedCents: 1000}, cashbackStatus: "done",
    });
    // B leu o processado antes do lote de A: a 1ª leitura vê o doc ausente.
    const realRef = processedRefOf(db);
    let reads = 0;
    const racingRef = {
      ...realRef,
      path: realRef.path,
      get: async () => {
        reads++;
        if (reads === 1) return {exists: false, id: "pay1", data: () => undefined};
        return realRef.get();
      },
      set: realRef.set,
    } as unknown as DocumentReference;

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 40, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      racingRef, makeDeps().deps,
    );

    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed.outcome, "approved");
    assert.equal((processed.cashback as {holdId: string}).holdId, holdId);
    assert.equal(fake.store.get(`athleteWallets/uidA/holds/${holdId}`)!.status, "captured");
    assert.equal(refundEntriesOf(fake), 0);
  });

  it("pagamento duplicado com a reserva já capturada pela varredura: o saldo volta uma vez", async () => {
    const {fake, db} = makeDb();
    seedTournamentWithOrganizer(fake);
    seedRegistration(fake, {sharePaidUids: ["uidA", "uidB"], paidAmount: ENTRY_FEE, isPaid: true});
    seedSpendableLot(fake, "uidA", 2000);
    const {holdId} = await holdCashback(db, {
      uid: "uidA", maxCents: 1000, sourceType: "registration", sourceId: REG_ID,
      trackingPath: PENDING_A, label: "Inscrição · Copa Teste", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uidA", holdId!, "pay1");
    // A varredura viu RECEIVED no Asaas antes do webhook e capturou.
    await captureHold(db, "uidA", holdId!, NOW_MS);
    fake.seedDoc(PENDING_A, {
      status: "pending", amountType: "share", asaasPaymentId: "pay1", payerUid: "uidA",
    });

    await processTournamentRegistrationAsaasNotification(
      db, "pay1",
      {status: "RECEIVED", value: 40, billingType: "PIX",
        externalReference: `tournamentRegistration:${REG_ID}:uidA`},
      processedRefOf(db), makeDeps().deps,
    );
    // O estorno manual depois (PAYMENT_REFUNDED) não devolve de novo.
    await reverseCashbackForPayment(db, processedRefOf(db), "pay1", NOW_MS, {
      externalReference: `tournamentRegistration:${REG_ID}:uidA`,
    });

    assert.equal(fake.store.get(PROCESSED_PATH)!.outcome, "duplicate_payer");
    assert.equal(fake.store.get(`athleteWallets/uidA/holds/${holdId}`)!.status, "refunded");
    assert.equal(fake.store.get("athleteWallets/uidA/lots/old")!.remainingCents, 2000);
    const refunds = [...fake.store.entries()]
      .filter(([path, data]) => path.startsWith("athleteWallets/uidA/ledger/") && data.type === "refund");
    assert.equal(refunds.length, 1);
  });
});
