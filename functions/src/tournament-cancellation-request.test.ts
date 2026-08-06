import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  CANCELLATION_REQUEST_BLOCK_MESSAGES,
  buildCancellationDecline,
  buildCancellationRequest,
  cancellationRequestBlockReason,
  normalizePhoneForWhatsApp,
  parseCancellationRequest,
} from "./tournament-cancellation-request";

const PAID = {isPaid: true, paidAmount: 180};

describe("cancellationRequestBlockReason", () => {
  it("inscrição confirmada pode pedir cancelamento", () => {
    assert.equal(cancellationRequestBlockReason(PAID), null);
  });

  it("dupla meio-paga também pode pedir", () => {
    assert.equal(
      cancellationRequestBlockReason({
        isPaid: false,
        sharePaidUids: ["uid-a"],
      }),
      null,
    );
  });

  it("inscrição SEM pagamento não usa pedido (cancela direto)", () => {
    assert.equal(
      cancellationRequestBlockReason({isPaid: false, paidAmount: 0}),
      "notPaid",
    );
  });

  it("bloqueia segundo pedido enquanto o primeiro está pendente", () => {
    assert.equal(
      cancellationRequestBlockReason({
        ...PAID,
        cancellationRequest: {status: "pending", reason: "não vou poder ir"},
      }),
      "alreadyPending",
    );
  });

  it("pedido recusado antes libera pedir de novo", () => {
    assert.equal(
      cancellationRequestBlockReason({
        ...PAID,
        cancellationRequest: {status: "declined", reason: "x"},
      }),
      null,
    );
  });

  it("toda razão de bloqueio tem mensagem para o atleta", () => {
    for (const reason of ["notPaid", "alreadyPending"] as const) {
      assert.ok(CANCELLATION_REQUEST_BLOCK_MESSAGES[reason].length > 0);
    }
  });
});

describe("buildCancellationRequest", () => {
  it("monta o pedido pendente com o motivo do atleta", () => {
    const request = buildCancellationRequest({
      reason: "  Lesionei o joelho  ",
      requestedBy: "uid-atleta",
    });
    assert.equal(request.status, "pending");
    assert.equal(request.reason, "Lesionei o joelho");
    assert.equal(request.requestedBy, "uid-atleta");
    assert.equal(request.respondedBy, null);
    assert.equal(request.responseNote, "");
  });
});

describe("buildCancellationDecline", () => {
  it("preserva o pedido original e registra quem recusou", () => {
    const original = buildCancellationRequest({
      reason: "Lesionei o joelho",
      requestedBy: "uid-atleta",
    });
    const declined = buildCancellationDecline({
      request: original,
      respondedBy: "uid-organizador",
      note: "  Chave já sorteada  ",
    });
    assert.equal(declined.status, "declined");
    assert.equal(declined.reason, "Lesionei o joelho");
    assert.equal(declined.requestedBy, "uid-atleta");
    assert.equal(declined.respondedBy, "uid-organizador");
    assert.equal(declined.responseNote, "Chave já sorteada");
  });
});

describe("parseCancellationRequest", () => {
  it("inscrição antiga sem o campo devolve null", () => {
    assert.equal(parseCancellationRequest({}), null);
    assert.equal(parseCancellationRequest({cancellationRequest: "lixo"}), null);
  });

  it("status desconhecido é tratado como ausente", () => {
    assert.equal(
      parseCancellationRequest({cancellationRequest: {status: "approved"}}),
      null,
    );
  });

  it("lê pedido pendente", () => {
    const parsed = parseCancellationRequest({
      cancellationRequest: {status: "pending", reason: "motivo", requestedBy: "uid-a"},
    });
    assert.equal(parsed?.status, "pending");
    assert.equal(parsed?.reason, "motivo");
  });
});

describe("normalizePhoneForWhatsApp", () => {
  it("prefixa 55 quando falta", () => {
    assert.equal(normalizePhoneForWhatsApp("(62) 99999-1234"), "5562999991234");
  });

  it("mantém o 55 já existente", () => {
    assert.equal(normalizePhoneForWhatsApp("+55 62 99999-1234"), "5562999991234");
  });

  it("número curto demais fica como está (sem inventar DDI)", () => {
    assert.equal(normalizePhoneForWhatsApp("1234"), "1234");
  });

  it("vazio devolve vazio", () => {
    assert.equal(normalizePhoneForWhatsApp("  "), "");
  });
});
