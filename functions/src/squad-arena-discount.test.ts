import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  arenaSquadDiscountCents,
  recordArenaSquadDiscountQuietly,
  resolveArenaSquadDiscount,
  squadIdempotencySuffix,
} from "./squad-arena-discount";
import {processArenaBookingAsaasNotification} from "./asaas-arena-booking-webhook";
import {processArenaClubSessionAsaasNotification} from "./asaas-arena-club-webhook";
import {ARENA_BOOKING_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";
import {UNKNOWN_CODE_MESSAGE} from "./squad-attribution";

const NOW = new Date("2026-10-19T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("squadAmbassadors/jv", {
    displayName: "João Victor", tier: "amb", code: "JOAO10", commissionPct: 10, followerDiscountPct: 10,
    rulesVersion: 1, status: "active",
  });
  fake.seedDoc("users/atl", {fullName: "Atleta"});
  fake.seedDoc("users/owner1", {fullName: "Atleta"});
  fake.seedDoc("users/uid1", {fullName: "Atleta"});
  return {fake, db: fake as unknown as Firestore};
}

const booking = (priceReais: number, typedCode: unknown = "JOAO10") =>
  ({kind: "booking" as const, payerUid: "atl", typedCode, priceReais, feePercent: 8});
const club = (priceReais: number, typedCode: unknown = "JOAO10") =>
  ({kind: "club" as const, payerUid: "atl", typedCode, priceReais, feePercent: 5, feeFloorReais: 0});

describe("resolveArenaSquadDiscount", () => {
  it("reserva: % do contrato com teto na taxa da arena (8% de R$ 120 = R$ 9,60)", async () => {
    const {db} = makeDb();
    const d = await resolveArenaSquadDiscount(db, booking(120), NOW);
    assert.equal(d!.attribution.ambassador.uid, "jv");
    assert.equal(d!.attribution.origin, "code");
    assert.equal(d!.cents, 9_60);
    assert.equal(d!.pct, 10);
  });

  it("clubinho: 5% sem piso — R$ 15 dá no máximo R$ 0,75", async () => {
    const {db} = makeDb();
    assert.equal((await resolveArenaSquadDiscount(db, club(15), NOW))!.cents, 75);
    // R$ 6: 10% = 60, taxa = 30.
    assert.equal((await resolveArenaSquadDiscount(db, club(6), NOW))!.cents, 30);
  });

  it("nunca deixa a cobrança abaixo do mínimo do Asaas (R$ 5)", async () => {
    const {db} = makeDb();
    // R$ 5,40 com piso de R$ 1,50: o teto da taxa passaria, o mínimo do PIX não deixa.
    assert.equal((await resolveArenaSquadDiscount(db, booking(5.4), NOW))!.cents, 40);
  });

  it("código errado é recusado antes de cobrar, apontando o campo", async () => {
    const {db} = makeDb();
    await assert.rejects(
      resolveArenaSquadDiscount(db, booking(120, "NADA99"), NOW),
      (err: {message?: string; details?: {field?: string}}) =>
        err.message === UNKNOWN_CODE_MESSAGE && err.details?.field === "squadCode",
    );
  });

  it("sem código: vale o link/QR guardado na janela; sem nada, null", async () => {
    const {fake, db} = makeDb();
    assert.equal(await resolveArenaSquadDiscount(db, booking(120, ""), NOW), null);
    fake.seedDoc("squadAttributions/atl", {ambassadorId: "jv", code: "JOAO10", origin: "qr", at: new Date(NOW.getTime() - 3 * DAY)});
    const d = await resolveArenaSquadDiscount(db, booking(120, ""), NOW);
    assert.equal(d!.attribution.origin, "qr");
    assert.equal(d!.cents, 9_60);
  });

  it("só na primeira: vale por tipo de compra e só conta desconto confirmado", async () => {
    const {fake, db} = makeDb();
    // Pendente (PIX não pago) não gasta o desconto.
    fake.seedDoc("squadChargeDiscounts/p-open", {payerUid: "atl", kind: "booking", cents: 960, confirmedAt: null});
    assert.equal((await resolveArenaSquadDiscount(db, booking(120), NOW))!.cents, 9_60);
    fake.seedDoc("squadChargeDiscounts/p-paid", {payerUid: "atl", kind: "booking", cents: 960, confirmedAt: NOW});
    const again = await resolveArenaSquadDiscount(db, booking(120), NOW);
    assert.equal(again!.cents, 0);
    assert.equal(again!.attribution.ambassador.uid, "jv");
    // O clubinho é outro tipo: ainda tem o primeiro.
    assert.equal((await resolveArenaSquadDiscount(db, club(15), NOW))!.cents, 75);
    // Regra desligada: vale sempre.
    fake.seedDoc("squadConfig/rules", {version: 2, rules: {attribution: {followerDiscountFirstOnly: false}}});
    assert.equal((await resolveArenaSquadDiscount(db, booking(120), NOW))!.cents, 9_60);
  });

  it("escopo do desconto: reserva desligada zera a reserva; o clubinho segue", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc("squadConfig/rules", {
      version: 2,
      rules: {attribution: {followerDiscountScope: {registration: true, booking: false, club: true}}},
    });
    const off = await resolveArenaSquadDiscount(db, booking(120), NOW);
    assert.deepEqual({cents: off!.cents, pct: off!.pct, uid: off!.attribution.ambassador.uid}, {cents: 0, pct: 0, uid: "jv"});
    assert.equal((await resolveArenaSquadDiscount(db, club(15), NOW))!.cents, 75);
  });

  it("sufixo da idempotência só com desconto", () => {
    assert.equal(squadIdempotencySuffix(960), "-sq960");
    assert.equal(squadIdempotencySuffix(0), "");
  });
});

describe("registro e leitura do desconto da cobrança", () => {
  it("grava o registro por paymentId e o espelho no doc do servidor; o webhook lê os dois", async () => {
    const {fake, db} = makeDb();
    const discount = await resolveArenaSquadDiscount(db, booking(120), NOW);
    const mirrorRef = db.doc("arenaBookingPricing/b1") as DocumentReference;
    await recordArenaSquadDiscountQuietly(db, {
      kind: "booking", sourceId: "b1", paymentId: "pay1", payerUid: "atl", discount, mirrorRef,
    }, NOW);
    const rec = fake.store.get("squadChargeDiscounts/pay1")!;
    assert.equal(rec["kind"], "booking");
    assert.equal(rec["sourceId"], "b1");
    assert.equal(rec["ambassadorId"], "jv");
    assert.equal(rec["cents"], 960);
    assert.equal(rec["confirmedAt"], null);
    assert.equal(fake.store.get("arenaBookingPricing/b1")!["squadDiscountPaymentId"], "pay1");
    assert.equal(await arenaSquadDiscountCents(db, "pay1", undefined, "t"), 960);
    // Sem registro: só o espelho DESTA cobrança vale.
    const mirror = {squadDiscountCents: 500, squadDiscountPaymentId: "pay2"};
    assert.equal(await arenaSquadDiscountCents(db, "pay2", mirror, "t"), 500);
    assert.equal(await arenaSquadDiscountCents(db, "pay3", mirror, "t"), 0);
  });
});

describe("webhook da reserva com desconto do Squad", () => {
  const BOOKING = "arenaBookings/b1";
  const PROCESSED = "artifacts/p/public/data/asaas_processed_payments/orig1";
  const payment = (value: number) => ({status: "RECEIVED", value, externalReference: `${ARENA_BOOKING_PAYMENT_REF_PREFIX}b1`});

  function seed(fake: FakeFirestore) {
    fake.seedDoc("arenas/arena1", {name: "Arena X"});
    fake.seedDoc(BOOKING, {
      athleteId: "owner1", arenaId: "arena1", paymentChannel: "pix", status: "pending_payment",
      paymentStatus: "pending", amountReais: 100, amountToPayNowReais: 100, amountDueOnsiteReais: 0,
      paymentFraction: 1, asaasPaymentId: "orig1",
      // Doc gravável pelo dono: o webhook não pode acreditar nisto.
      squadDiscountReais: 50,
    });
    fake.seedDoc("arenaBookingPricing/b1", {amountReais: 100});
  }

  const ledger = (fake: FakeFirestore) => [...fake.store.entries()]
    .filter(([path]) => path.startsWith("arenaWallets/arena1/ledger/")).map(([, d]) => d);

  it("arena recebe o mesmo líquido: o desconto entra no bruto e a taxa é sobre o preço cheio", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    fake.seedDoc("squadChargeDiscounts/orig1", {payerUid: "owner1", kind: "booking", cents: 800, confirmedAt: null});

    await processArenaBookingAsaasNotification(db, "orig1", payment(92), db.doc(PROCESSED) as DocumentReference);

    const b = fake.store.get(BOOKING)!;
    assert.equal(b["status"], "confirmed");
    assert.equal(b["paymentStatus"], "paid");
    assert.equal(b["amountPaidOnlineReais"], 100);
    assert.equal(b["amountDueOnsiteReais"], 0);
    assert.equal(b["asaasPaidAmount"], 92);
    assert.equal(b["squadDiscountReais"], 8);
    const credit = ledger(fake).find((e) => e["type"] === "credit")!;
    assert.equal(credit["grossReais"], 100);
    assert.equal(credit["platformFeeReais"], 8);
    assert.equal(credit["netReais"], 92);
    assert.equal(credit["squadDiscountReais"], 8);
    assert.equal(fake.store.get("arenaWallets/arena1")!["availableReais"], 92);
    assert.ok(fake.store.get("squadChargeDiscounts/orig1")!["confirmedAt"]);
  });

  it("sem registro, usa o espelho do servidor desta cobrança; o da reserva não conta", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    fake.seedDoc("arenaBookingPricing/b1", {amountReais: 100, squadDiscountCents: 800, squadDiscountPaymentId: "orig1"});

    await processArenaBookingAsaasNotification(db, "orig1", payment(92), db.doc(PROCESSED) as DocumentReference);
    assert.equal(fake.store.get(BOOKING)!["amountPaidOnlineReais"], 100);
  });

  it("espelho de outra cobrança (PIX regenerado) é ignorado: a arena recebe só o que entrou", async () => {
    const {fake, db} = makeDb();
    seed(fake);
    fake.seedDoc("arenaBookingPricing/b1", {amountReais: 100, squadDiscountCents: 800, squadDiscountPaymentId: "nova"});

    await processArenaBookingAsaasNotification(db, "orig1", payment(92), db.doc(PROCESSED) as DocumentReference);
    const b = fake.store.get(BOOKING)!;
    assert.equal(b["amountPaidOnlineReais"], 92);
    assert.equal(b["squadDiscountReais"], 0);
    assert.equal(b["paymentStatus"], "partial");
  });
});

describe("webhook do clubinho com desconto do Squad", () => {
  const SESSION = "arenaClubSessions/club_c1_2026-10-24";
  const PARTICIPANT = `${SESSION}/clubParticipants/uid1`;
  const PROCESSED = "artifacts/p/public/data/asaas_processed_payments/pay1";
  const deps = {refund: async () => undefined, notify: async () => undefined};

  it("vaga confirmada pelo preço cheio, 5% sobre ele e a arena com o mesmo líquido", async () => {
    const {fake, db} = makeDb();
    fake.seedDoc(SESSION, {
      clubId: "c1", arenaId: "arena1", arenaName: "Arena Sol", clubName: "Clubinho de sexta", date: "2026-10-24",
      startTime: "15:00", status: "scheduled", capacity: 2, confirmedCount: 0, pendingCount: 1, priceReais: 15,
    });
    fake.seedDoc(PARTICIPANT, {
      athleteId: "uid1", status: "pending_payment", amountReais: 15, asaasPaymentId: "pay1",
      squadDiscountCents: 75, squadDiscountPaymentId: "pay1",
    });

    await processArenaClubSessionAsaasNotification(
      db, "pay1", {status: "RECEIVED", value: 14.25, externalReference: "arenaClubSession:club_c1_2026-10-24:uid1"},
      db.doc(PROCESSED) as DocumentReference, deps,
    );

    const p = fake.store.get(PARTICIPANT)!;
    assert.equal(p["status"], "confirmed");
    assert.equal(p["amountReais"], 15);
    assert.equal(p["platformFeeReais"], 0.75);
    assert.equal(p["netReais"], 14.25);
    assert.equal(p["squadDiscountReais"], 0.75);
    assert.equal(fake.store.get("arenaWallets/arena1")!["availableReais"], 14.25);
    const credit = [...fake.store.entries()].find(([path]) => path.startsWith("arenaWallets/arena1/ledger/"))![1];
    assert.equal(credit["squadDiscountReais"], 0.75);
  });
});
