import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {
  expireOpenPixCharges,
  type ExpiringPixDoc,
} from "./tournament-registration-pix-expiry-sweeper";

const MIN = 60 * 1000;
const NOW = 1_800_000_000_000;

function pixDoc(
  id: string,
  fields: Record<string, unknown>,
): ExpiringPixDoc {
  return {id, data: () => fields};
}

/** Cobrança vencida e ainda pendente — o caso comum da varredura. */
function expiredPending(id = "uid-1", asaasPaymentId = "pay_1"): ExpiringPixDoc {
  return pixDoc(id, {
    status: "pending",
    asaasPaymentId,
    paymentExpiresAt: Timestamp.fromMillis(NOW - 1 * MIN),
  });
}

describe("expireOpenPixCharges", () => {
  it("mata a cobrança vencida no gateway e marca o documento", async () => {
    const cancelled: string[] = [];
    const marked: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [expiredPending()],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async (doc) => {
        marked.push(doc.id);
      },
    });

    assert.deepEqual(cancelled, ["pay_1"]);
    assert.deepEqual(marked, ["uid-1"]);
    assert.deepEqual(result, {expired: 1, failed: 0});
  });

  it("nunca toca numa cobrança já liquidada", async () => {
    // O documento pago é o registro do pagamento: apagá-lo ou marcá-lo
    // cancelado apagaria a prova de que o dinheiro entrou.
    const cancelled: string[] = [];
    const marked: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [
        pixDoc("uid-pago", {
          status: "paid",
          asaasPaymentId: "pay_pago",
          paymentExpiresAt: Timestamp.fromMillis(NOW - 30 * MIN),
        }),
      ],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async (doc) => {
        marked.push(doc.id);
      },
    });

    assert.deepEqual(cancelled, []);
    assert.deepEqual(marked, []);
    assert.deepEqual(result, {expired: 0, failed: 0});
  });

  it("cobrança ainda no prazo sobrevive à volta da varredura", async () => {
    // A releitura é a defesa contra a corrida: entre a consulta e o cancelamento
    // o atleta pode ter gerado um QR novo, com vencimento lá na frente.
    const cancelled: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [
        pixDoc("uid-1", {
          status: "pending",
          asaasPaymentId: "pay_novo",
          paymentExpiresAt: Timestamp.fromMillis(NOW + 5 * MIN),
        }),
      ],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async () => {},
    });

    assert.deepEqual(cancelled, []);
    assert.deepEqual(result, {expired: 0, failed: 0});
  });

  it("falha do gateway não marca cancelado — a cobrança pode seguir viva", async () => {
    const marked: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [expiredPending()],
      nowMs: NOW,
      cancelCharge: async () => {
        throw new Error("asaas fora do ar");
      },
      markCancelled: async (doc) => {
        marked.push(doc.id);
      },
    });

    assert.deepEqual(marked, []);
    assert.deepEqual(result, {expired: 0, failed: 1});
  });

  it("uma falha não derruba as outras cobranças da volta", async () => {
    const marked: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [
        expiredPending("uid-1", "pay_quebrado"),
        expiredPending("uid-2", "pay_ok"),
      ],
      nowMs: NOW,
      cancelCharge: async (id) => {
        if (id === "pay_quebrado") throw new Error("asaas fora do ar");
      },
      markCancelled: async (doc) => {
        marked.push(doc.id);
      },
    });

    assert.deepEqual(marked, ["uid-2"]);
    assert.deepEqual(result, {expired: 1, failed: 1});
  });

  it("documento sem cobrança no gateway só é marcado", async () => {
    const cancelled: string[] = [];
    const marked: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [
        pixDoc("uid-1", {
          status: "pending",
          paymentExpiresAt: Timestamp.fromMillis(NOW - 1 * MIN),
        }),
      ],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async (doc) => {
        marked.push(doc.id);
      },
    });

    assert.deepEqual(cancelled, []);
    assert.deepEqual(marked, ["uid-1"]);
    assert.deepEqual(result, {expired: 1, failed: 0});
  });

  it("documento sem vencimento é ignorado, não morre por omissão", async () => {
    // Doc legado ou malformado: sem relógio não há o que declarar vencido.
    const cancelled: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [pixDoc("uid-1", {status: "pending", asaasPaymentId: "pay_1"})],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async () => {},
    });

    assert.deepEqual(cancelled, []);
    assert.deepEqual(result, {expired: 0, failed: 0});
  });

  it("cobrança já cancelada não é cancelada de novo", async () => {
    const cancelled: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [
        pixDoc("uid-1", {
          status: "cancelled",
          asaasPaymentId: "pay_1",
          paymentExpiresAt: Timestamp.fromMillis(NOW - 10 * MIN),
        }),
      ],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async () => {},
    });

    assert.deepEqual(cancelled, []);
    assert.deepEqual(result, {expired: 0, failed: 0});
  });
});
