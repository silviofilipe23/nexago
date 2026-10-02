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
    assert.deepEqual(result, {expired: 1, failed: 0, reconciled: 0});
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
    assert.deepEqual(result, {expired: 0, failed: 0, reconciled: 0});
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
    assert.deepEqual(result, {expired: 0, failed: 0, reconciled: 0});
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
    assert.deepEqual(result, {expired: 0, failed: 1, reconciled: 0});
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
    assert.deepEqual(result, {expired: 1, failed: 1, reconciled: 0});
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
    assert.deepEqual(result, {expired: 1, failed: 0, reconciled: 0});
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
    assert.deepEqual(result, {expired: 0, failed: 0, reconciled: 0});
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
    assert.deepEqual(result, {expired: 0, failed: 0, reconciled: 0});
  });
});

/** Cobrança de cartão vencida no NOSSO relógio, mas que pode estar autorizada
 *  no gateway — a janela entre o atleta pagar e o webhook chegar. */
function expiredCard(id = "uid-card", asaasPaymentId = "pay_card"): ExpiringPixDoc {
  return pixDoc(id, {
    status: "pending",
    billingType: "CREDIT_CARD",
    asaasPaymentId,
    paymentExpiresAt: Timestamp.fromMillis(NOW - 1 * MIN),
  });
}

describe("expireOpenPixCharges: cartão em voo", () => {
  it("não deleta cobrança de cartão já autorizada no gateway", async () => {
    const cancelled: string[] = [];
    const marked: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [expiredCard()],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async (doc) => {
        marked.push(doc.id);
      },
      resolveChargeStatus: async () => "CONFIRMED",
    });

    assert.deepEqual(cancelled, []);
    assert.deepEqual(marked, []);
    assert.equal(result.expired, 0);
  });

  it("deleta cobrança de cartão ainda pendente no gateway", async () => {
    const cancelled: string[] = [];

    await expireOpenPixCharges({
      docs: [expiredCard()],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async () => {},
      resolveChargeStatus: async () => "PENDING",
    });

    assert.deepEqual(cancelled, ["pay_card"]);
  });

  it("não consulta o gateway para cobrança de PIX", async () => {
    let consultas = 0;
    const cancelled: string[] = [];

    await expireOpenPixCharges({
      docs: [expiredPending()],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async () => {},
      resolveChargeStatus: async () => {
        consultas++;
        return "PENDING";
      },
    });

    assert.equal(consultas, 0);
    assert.deepEqual(cancelled, ["pay_1"]);
  });

  it("falha na consulta do gateway não marca nada", async () => {
    const marked: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [expiredCard()],
      nowMs: NOW,
      cancelCharge: async () => {},
      markCancelled: async (doc) => {
        marked.push(doc.id);
      },
      resolveChargeStatus: async () => {
        throw new Error("asaas fora do ar");
      },
    });

    assert.deepEqual(marked, []);
    assert.equal(result.failed, 1);
  });
});

/** O Asaas recusa apagar cobrança que não está mais pendente — é assim que o PIX pago aparece. */
const refusesDelete = async () => {
  throw new Error(
    "fetchAsaas failed: 400 Só é possível remover cobranças pendentes ou vencidas.",
  );
};

describe("expireOpenPixCharges: pagamento que o webhook não creditou", () => {
  it("PIX pago no gateway é creditado em vez de virar falha eterna", async () => {
    // Caso real (02/10, pay_n7coyfexgdrma80x): o webhook chegou, a releitura no Asaas levou 403
    // do CloudFront, o handler respondeu 200 e o Asaas nunca reenviou. A varredura passou a
    // falhar a cada minuto tentando apagar uma cobrança paga.
    const reconciled: string[] = [];
    const marked: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [expiredPending()],
      nowMs: NOW,
      cancelCharge: refusesDelete,
      markCancelled: async (doc) => {
        marked.push(doc.id);
      },
      resolveChargeStatus: async () => "RECEIVED",
      reconcilePaidCharge: async (id) => {
        reconciled.push(id);
      },
    });

    assert.deepEqual(reconciled, ["pay_1"]);
    assert.deepEqual(marked, []);
    assert.deepEqual(result, {expired: 0, failed: 0, reconciled: 1});
  });

  it("PIX que o Asaas recusa apagar mas segue pendente continua sendo falha", async () => {
    const reconciled: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [expiredPending()],
      nowMs: NOW,
      cancelCharge: refusesDelete,
      markCancelled: async () => {},
      resolveChargeStatus: async () => "PENDING",
      reconcilePaidCharge: async (id) => {
        reconciled.push(id);
      },
    });

    assert.deepEqual(reconciled, []);
    assert.deepEqual(result, {expired: 0, failed: 1, reconciled: 0});
  });

  it("cartão autorizado cujo webhook se perdeu é creditado", async () => {
    const reconciled: string[] = [];
    const cancelled: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [expiredCard()],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async () => {},
      resolveChargeStatus: async () => "CONFIRMED",
      reconcilePaidCharge: async (id) => {
        reconciled.push(id);
      },
    });

    assert.deepEqual(cancelled, []);
    assert.deepEqual(reconciled, ["pay_card"]);
    assert.deepEqual(result, {expired: 0, failed: 0, reconciled: 1});
  });

  it("cartão em análise de risco segue esperando — ainda não há dinheiro", async () => {
    const reconciled: string[] = [];
    const cancelled: string[] = [];

    await expireOpenPixCharges({
      docs: [expiredCard()],
      nowMs: NOW,
      cancelCharge: async (id) => {
        cancelled.push(id);
      },
      markCancelled: async () => {},
      resolveChargeStatus: async () => "AWAITING_RISK_ANALYSIS",
      reconcilePaidCharge: async (id) => {
        reconciled.push(id);
      },
    });

    assert.deepEqual(cancelled, []);
    assert.deepEqual(reconciled, []);
  });

  it("falha ao creditar não marca nada — a próxima volta tenta de novo", async () => {
    const marked: string[] = [];

    const result = await expireOpenPixCharges({
      docs: [expiredPending()],
      nowMs: NOW,
      cancelCharge: refusesDelete,
      markCancelled: async (doc) => {
        marked.push(doc.id);
      },
      resolveChargeStatus: async () => "RECEIVED",
      reconcilePaidCharge: async () => {
        throw new Error("firestore indisponível");
      },
    });

    assert.deepEqual(marked, []);
    assert.deepEqual(result, {expired: 0, failed: 1, reconciled: 0});
  });
});
