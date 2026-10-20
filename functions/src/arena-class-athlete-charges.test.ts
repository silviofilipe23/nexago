import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {type Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {loadMyClassCharges} from "./arena-class-athlete-charges";

const TODAY = "2026-10-20";
const UID = "uMarina";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  fake.seedDoc("arenas/arena1", {name: "Arena CFC"});
  return {fake, db: fake as unknown as Firestore};
}

function charge(fake: FakeFirestore, id: string, over: Record<string, unknown> = {}): void {
  fake.seedDoc(`arenaClassCharges/${id}`, {
    arenaId: "arena1", enrollmentId: "e1", studentId: UID, athleteId: UID, name: "Marina", phone: "+5511999990000",
    description: "Mensal 2x · Novembro", period: "2026-11", amountReais: 180, dueDate: "2026-11-05",
    status: "open", billingMode: "manual", paymentMethod: "pix", ...over,
  });
}

function online(state: string, invoiceUrl: string | null = null): Record<string, unknown> {
  return {billingMode: "asaas", asaas: {groupId: "g1", state, invoiceUrl, status: invoiceUrl ? "PENDING" : null}};
}

describe("mensalidades a pagar do atleta", () => {
  it("link da fatura só com a mensalidade e a fatura em aberto; manual é informativa", async () => {
    const {fake, db} = makeDb();
    charge(fake, "c_online", {...online("open", "https://asaas.test/i/1"), dueDate: "2026-10-25"});
    charge(fake, "c_gerando", {...online("pending"), dueDate: "2026-10-26"});
    charge(fake, "c_sem_cpf", {...online("needs_cpf"), dueDate: "2026-10-27"});
    charge(fake, "c_manual", {dueDate: "2026-10-28"});

    const items = await loadMyClassCharges(db, UID, TODAY);

    assert.deepEqual(items.map((i) => [i.chargeId, i.payment, i.invoiceUrl]), [
      ["c_online", "online", "https://asaas.test/i/1"],
      ["c_gerando", "preparing", null],
      ["c_sem_cpf", "manual", null],
      ["c_manual", "manual", null],
    ]);
    assert.equal(items[0]!.arenaName, "Arena CFC");
    assert.equal(items[0]!.amountReais, 180);
  });

  it("só as em aberto do próprio atleta, vencidas primeiro e marcadas", async () => {
    const {fake, db} = makeDb();
    charge(fake, "c_futura", {dueDate: "2026-11-05"});
    charge(fake, "c_vencida", {...online("open", "https://asaas.test/i/2"), dueDate: "2026-10-05"});
    charge(fake, "c_paga", {...online("paid", "https://asaas.test/i/3"), status: "paid"});
    charge(fake, "c_cancelada", {status: "canceled"});
    charge(fake, "c_outro", {athleteId: "uOutro", studentId: "uOutro"});

    const items = await loadMyClassCharges(db, UID, TODAY);

    assert.deepEqual(items.map((i) => [i.chargeId, i.overdue]), [["c_vencida", true], ["c_futura", false]]);
  });

  it("não expõe telefone, CPF nem o grupo de pagamento", async () => {
    const {fake, db} = makeDb();
    charge(fake, "c1", online("open", "https://asaas.test/i/1"));

    const [item] = await loadMyClassCharges(db, UID, TODAY);

    assert.deepEqual(Object.keys(item!).sort(), [
      "amountReais", "arenaId", "arenaName", "chargeId", "description", "dueDate", "invoiceUrl", "overdue", "payment",
    ]);
  });

  it("arena sem nome cai em \"Arena\"; sem mensalidade, lista vazia", async () => {
    const {fake, db} = makeDb();
    assert.deepEqual(await loadMyClassCharges(db, UID, TODAY), []);
    charge(fake, "c1", {arenaId: "arenaSemDoc"});
    assert.equal((await loadMyClassCharges(db, UID, TODAY))[0]!.arenaName, "Arena");
  });
});
