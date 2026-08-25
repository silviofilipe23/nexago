import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  PAYMENT_SNAPSHOT_FIELD,
  buildPaymentRevertNotificationBody,
  buildPaymentRevertPlan,
  paymentRevertBlock,
  paymentSnapshotOf,
  shouldCapturePaymentSnapshot,
} from "./organizer-payment-revert";

/** Inscrição depois da baixa manual — o que a callable de confirmar grava. */
function confirmed(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isPaid: true,
    waitlist: false,
    paidAmount: 180,
    paymentMethod: "organizer_direct",
    paymentVerifiedByOrganizer: true,
    ...over,
  };
}

describe("paymentRevertBlock", () => {
  it("libera a baixa manual do organizador", () => {
    assert.equal(paymentRevertBlock(confirmed()), null);
  });

  it("recusa inscrição que não está paga", () => {
    assert.equal(paymentRevertBlock({isPaid: false}), "notPaid");
  });

  /** O dinheiro está na conta do gateway: zerar o doc derrubaria a arrecadação
   *  sem estorno nenhum do outro lado. */
  it("recusa pagamento que entrou pela plataforma", () => {
    assert.equal(
      paymentRevertBlock({isPaid: true, paidAmount: 180}),
      "notOrganizerPayment",
    );
  });

  it("recusa categoria gratuita (paga sem canal)", () => {
    assert.equal(
      paymentRevertBlock({isPaid: true, paidAmount: 0}),
      "notOrganizerPayment",
    );
  });

  it("aceita o método gravado com caixa/espaço diferentes", () => {
    assert.equal(
      paymentRevertBlock(confirmed({paymentMethod: " Organizer_Direct "})),
      null,
    );
  });
});

describe("paymentSnapshotOf", () => {
  it("guarda o estado cru, distinguindo campo ausente de zero", () => {
    assert.deepEqual(paymentSnapshotOf({isPaid: false, paidAmount: 0}), {
      isPaid: false,
      waitlist: false,
      paidAmount: 0,
      paymentMethod: null,
      paymentVerifiedByOrganizer: false,
    });
    assert.equal(paymentSnapshotOf({}).paidAmount, null);
  });
});

describe("shouldCapturePaymentSnapshot", () => {
  it("captura no primeiro clique", () => {
    assert.equal(shouldCapturePaymentSnapshot({isPaid: false}), true);
  });

  /** Confirmar duas vezes não pode fazer o "antes" virar o próprio pago —
   *  senão reverter não voltaria nada. */
  it("não regrava em cima de uma baixa já dada", () => {
    assert.equal(shouldCapturePaymentSnapshot(confirmed()), false);
  });

  it("captura quando o pago veio do app (baixa em cima de pagamento real)", () => {
    assert.equal(
      shouldCapturePaymentSnapshot({isPaid: true, paidAmount: 180}),
      true,
    );
  });
});

describe("buildPaymentRevertPlan", () => {
  it("volta pra pendente quando ninguém tinha pago", () => {
    const plan = buildPaymentRevertPlan(
      confirmed({[PAYMENT_SNAPSHOT_FIELD]: {isPaid: false, waitlist: false}}),
    );

    assert.deepEqual(plan.set, {
      isPaid: false,
      waitlist: false,
      paymentVerifiedByOrganizer: false,
    });
    assert.deepEqual(plan.clear.sort(), [
      PAYMENT_SNAPSHOT_FIELD,
      "paidAmount",
      "paidAt",
      "paymentMethod",
      "paymentVerifiedAt",
      "paymentVerifiedByUid",
    ].sort());
    assert.equal(plan.outcome, "pending");
  });

  /** Modo direto: a declaração do atleta é o que garante a vaga. Reverter a
   *  baixa devolve o selo "A conferir", não tira a vaga de ninguém. */
  it("volta pra A conferir quando os atletas tinham declarado", () => {
    const plan = buildPaymentRevertPlan(
      confirmed({
        declaredPaidAt: new Date("2026-08-18"),
        [PAYMENT_SNAPSHOT_FIELD]: {
          isPaid: true,
          waitlist: false,
          paymentVerifiedByOrganizer: false,
        },
      }),
    );

    assert.equal(plan.set["isPaid"], true);
    assert.equal(plan.set["paymentVerifiedByOrganizer"], false);
    assert.equal(plan.outcome, "toVerify");
  });

  it("devolve a inscrição pra lista de espera de onde ela saiu", () => {
    const plan = buildPaymentRevertPlan(
      confirmed({[PAYMENT_SNAPSHOT_FIELD]: {isPaid: false, waitlist: true}}),
    );

    assert.equal(plan.set["waitlist"], true);
    assert.equal(plan.outcome, "waitlist");
  });

  /** A confirmação sobrescreve `paidAmount` com a taxa cheia; sem o retrato, a
   *  parcela que o atleta pagou pelo app sumiria do doc. */
  it("restaura a parcela já paga pelo app", () => {
    const plan = buildPaymentRevertPlan(
      confirmed({
        [PAYMENT_SNAPSHOT_FIELD]: {isPaid: false, waitlist: false, paidAmount: 90},
      }),
    );

    assert.equal(plan.set["paidAmount"], 90);
    assert.ok(!plan.clear.includes("paidAmount"));
    assert.equal(plan.outcome, "pending");
  });

  it("restaura o pagamento que já constava antes da baixa redundante", () => {
    const plan = buildPaymentRevertPlan(
      confirmed({
        [PAYMENT_SNAPSHOT_FIELD]: {isPaid: true, waitlist: false, paidAmount: 180},
      }),
    );

    assert.equal(plan.set["isPaid"], true);
    assert.equal(plan.set["paidAmount"], 180);
    assert.equal(plan.outcome, "paid");
  });

  /** Baixa anterior a este fluxo (ou inscrição criada já paga): sem retrato, o
   *  único estado anterior conhecido é a declaração do atleta. */
  it("sem retrato, cai na declaração do atleta", () => {
    const semDeclaracao = buildPaymentRevertPlan(confirmed());
    assert.equal(semDeclaracao.set["isPaid"], false);
    assert.equal(semDeclaracao.outcome, "pending");

    const comDeclaracao = buildPaymentRevertPlan(
      confirmed({declaredPaidAt: new Date("2026-08-18")}),
    );
    assert.equal(comDeclaracao.set["isPaid"], true);
    assert.equal(comDeclaracao.outcome, "toVerify");
  });

  it("ignora retrato corrompido em vez de quebrar", () => {
    const plan = buildPaymentRevertPlan(
      confirmed({[PAYMENT_SNAPSHOT_FIELD]: "sim"}),
    );
    assert.equal(plan.set["isPaid"], false);
  });
});

describe("buildPaymentRevertNotificationBody", () => {
  it("diz que a vaga continua quando volta pra conferência", () => {
    const body = buildPaymentRevertNotificationBody({
      tournamentName: "Copa VH",
      outcome: "toVerify",
    });
    assert.match(body, /Copa VH/);
    assert.match(body, /vaga continua/);
  });

  it("avisa que a inscrição voltou a não paga", () => {
    const body = buildPaymentRevertNotificationBody({
      tournamentName: "  ",
      outcome: "pending",
    });
    assert.match(body, /não paga/);
    assert.ok(!body.includes(" em ."));
  });
});
