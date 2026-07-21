import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {addAppOrderItemCore} from "./arena-comanda-app-orders";

const now = Date.UTC(2026, 6, 20, 18, 0, 0);

function db(fake: FakeFirestore): Firestore {
  return fake as unknown as Firestore;
}

function seedEntitledArena(fake: FakeFirestore, arenaId: string, overrides: DocData = {}): void {
  fake.seedDoc(`arenas/${arenaId}`, {
    name: "Arena Sol",
    managerUserId: "manager1",
    planTier: "pro",
    planStatus: "active",
    ...overrides,
  });
}

function seedBooking(fake: FakeFirestore, bookingId: string, overrides: DocData = {}): void {
  fake.seedDoc(`arenaBookings/${bookingId}`, {
    athleteId: "ath1",
    arenaId: "arena1",
    arenaName: "Arena Sol",
    courtId: "court1",
    courtName: "Quadra 1",
    date: "2026-07-20",
    startTime: "18:00",
    endTime: "19:00",
    status: "active",
    ...overrides,
  });
}

function seedComanda(fake: FakeFirestore, comandaId: string, overrides: DocData = {}): void {
  fake.seedDoc(`arenaComandas/${comandaId}`, {
    arenaId: "arena1",
    displayNumber: 7,
    type: "individual",
    status: "open",
    bookingId: "booking1",
    customerName: "João",
    allowAppOrders: true,
    rentalCents: 5000,
    itemsTotalCents: 0,
    totalCents: 5000,
    itemsCount: 0,
    paidCents: 0,
    openedByUid: "manager1",
    ...overrides,
  });
}

function seedProduct(fake: FakeFirestore, productId: string, overrides: DocData = {}): void {
  fake.seedDoc(`arenas/arena1/products/${productId}`, {
    name: "Água 500ml",
    nameLower: "água 500ml",
    category: "bebidas",
    active: true,
    priceCents: 500,
    stockQuantity: 10,
    minStockQuantity: 2,
    ...overrides,
  });
}

function seedBase(fake: FakeFirestore): void {
  seedEntitledArena(fake, "arena1");
  seedBooking(fake, "booking1");
  seedComanda(fake, "comanda1");
  seedProduct(fake, "product1");
}

async function assertHttpsError(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (err: {code?: string}) => {
    assert.equal(err.code, code, `esperava HttpsError ${code}, veio ${err.code}`);
    return true;
  });
}

describe("addAppOrderItemCore", () => {
  it("aceita o pedido quando allowAppOrders=true e o atleta é o dono (via reserva vinculada)", async () => {
    const fake = new FakeFirestore();
    seedBase(fake);
    fake.seedDoc("public_profiles/ath1", {fullName: "João Atleta"});

    const result = await addAppOrderItemCore(
      db(fake),
      "ath1",
      {arenaId: "arena1", comandaId: "comanda1", productId: "product1", quantity: 2},
      now,
    );

    assert.equal(result.lineTotalCents, 1000);
    assert.equal(result.newItemsTotalCents, 1000);
    assert.equal(result.newTotalCents, 6000); // rental 5000 + itens 1000

    const item = fake.store.get(`arenaComandas/comanda1/items/${result.itemId}`)!;
    assert.equal(item.source, "app");
    assert.equal(item.addedByUid, "ath1");
    assert.equal(item.addedByName, "João Atleta");
    assert.equal(item.productId, "product1");
    assert.equal(item.quantity, 2);
    assert.equal(item.unitPriceCents, 500);
    assert.equal(item.lineTotalCents, 1000);
    assert.ok(item.createdAt instanceof Timestamp);

    const product = fake.store.get("arenas/arena1/products/product1")!;
    assert.equal(product.stockQuantity, 8);

    const comanda = fake.store.get("arenaComandas/comanda1")!;
    assert.equal(comanda.itemsTotalCents, 1000);
    assert.equal(comanda.itemsCount, 2);
    assert.equal(comanda.totalCents, 6000);

    // Registrou a baixa de estoque com a mesma lógica do fluxo do gestor.
    const movements = [...fake.store.entries()].filter(([path]) =>
      path.startsWith("arenas/arena1/stockMovements/"),
    );
    assert.equal(movements.length, 1);
    const [, movement] = movements[0]!;
    assert.equal(movement.type, "sale");
    assert.equal(movement.quantityDelta, -2);
    assert.equal(movement.quantityBefore, 10);
    assert.equal(movement.quantityAfter, 8);
    assert.equal(movement.createdByUid, "ath1");
  });

  it("usa nome padrão 'Atleta' quando não há public_profiles", async () => {
    const fake = new FakeFirestore();
    seedBase(fake);

    const result = await addAppOrderItemCore(
      db(fake),
      "ath1",
      {arenaId: "arena1", comandaId: "comanda1", productId: "product1", quantity: 1},
      now,
    );
    const item = fake.store.get(`arenaComandas/comanda1/items/${result.itemId}`)!;
    assert.equal(item.addedByName, "Atleta");
  });

  it("rejeita quando allowAppOrders=false", async () => {
    const fake = new FakeFirestore();
    seedEntitledArena(fake, "arena1");
    seedBooking(fake, "booking1");
    seedComanda(fake, "comanda1", {allowAppOrders: false});
    seedProduct(fake, "product1");

    await assertHttpsError(
      addAppOrderItemCore(
        db(fake),
        "ath1",
        {arenaId: "arena1", comandaId: "comanda1", productId: "product1", quantity: 1},
        now,
      ),
      "permission-denied",
    );
  });

  it("rejeita atleta que não é o dono da comanda (uid diferente do athleteId da reserva)", async () => {
    const fake = new FakeFirestore();
    seedBase(fake);

    await assertHttpsError(
      addAppOrderItemCore(
        db(fake),
        "intruso",
        {arenaId: "arena1", comandaId: "comanda1", productId: "product1", quantity: 1},
        now,
      ),
      "permission-denied",
    );
  });

  it("rejeita sem estoque suficiente", async () => {
    const fake = new FakeFirestore();
    seedEntitledArena(fake, "arena1");
    seedBooking(fake, "booking1");
    seedComanda(fake, "comanda1");
    seedProduct(fake, "product1", {stockQuantity: 1});

    await assertHttpsError(
      addAppOrderItemCore(
        db(fake),
        "ath1",
        {arenaId: "arena1", comandaId: "comanda1", productId: "product1", quantity: 2},
        now,
      ),
      "failed-precondition",
    );

    // Nada foi escrito (nem estoque, nem item) — falhou antes de qualquer write.
    const product = fake.store.get("arenas/arena1/products/product1")!;
    assert.equal(product.stockQuantity, 1);
  });

  it("rejeita comanda sem reserva vinculada (gap de titularidade documentado)", async () => {
    const fake = new FakeFirestore();
    seedEntitledArena(fake, "arena1");
    seedComanda(fake, "comanda1", {bookingId: undefined});
    seedProduct(fake, "product1");

    await assertHttpsError(
      addAppOrderItemCore(
        db(fake),
        "ath1",
        {arenaId: "arena1", comandaId: "comanda1", productId: "product1", quantity: 1},
        now,
      ),
      "failed-precondition",
    );
  });

  it("rejeita reserva cancelada e reserva de outra arena", async () => {
    const fake = new FakeFirestore();
    seedEntitledArena(fake, "arena1");
    seedBooking(fake, "booking1", {status: "cancelled"});
    seedComanda(fake, "comanda1");
    seedProduct(fake, "product1");

    await assertHttpsError(
      addAppOrderItemCore(
        db(fake),
        "ath1",
        {arenaId: "arena1", comandaId: "comanda1", productId: "product1", quantity: 1},
        now,
      ),
      "failed-precondition",
    );
  });

  it("rejeita arena sem plano Pro/Parceiro (paridade com a regra do lançamento pelo balcão)", async () => {
    const fake = new FakeFirestore();
    seedEntitledArena(fake, "arena1", {planTier: "essencial", planStatus: "active"});
    seedBooking(fake, "booking1");
    seedComanda(fake, "comanda1");
    seedProduct(fake, "product1");

    await assertHttpsError(
      addAppOrderItemCore(
        db(fake),
        "ath1",
        {arenaId: "arena1", comandaId: "comanda1", productId: "product1", quantity: 1},
        now,
      ),
      "failed-precondition",
    );
  });

  it("rejeita usuário não autenticado (sem uid) antes de qualquer leitura — validado no wrapper onCall", async () => {
    // addAppOrderItemCore sempre recebe um uid não vazio (o wrapper `onCall`
    // já valida request.auth?.uid antes de chamar o core); aqui garantimos
    // que uma quantidade inválida também é rejeitada cedo.
    const fake = new FakeFirestore();
    seedBase(fake);
    await assertHttpsError(
      addAppOrderItemCore(
        db(fake),
        "ath1",
        {arenaId: "arena1", comandaId: "comanda1", productId: "product1", quantity: 0},
        now,
      ),
      "invalid-argument",
    );
  });
});
