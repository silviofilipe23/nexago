import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {Timestamp} from "firebase-admin/firestore";
import {
  allocateFifo,
  bookingEventAtMs,
  centsToReais,
  computeEarnCents,
  computeExpiresAtMs,
  formatCentsBrl,
  releaseDecision,
  toCents,
  toMillisOrNull,
} from "./cashback-rules";

const RULE = {ratePercent: 2, maxShareOfFee: 0.5};
const NOW = Date.UTC(2026, 9, 1, 13, 0, 0);

describe("toCents / centsToReais", () => {
  it("arredonda para o centavo mais próximo", () => {
    assert.equal(toCents(10.005), 1001);
    assert.equal(toCents(0.1 + 0.2), 30);
    assert.equal(centsToReais(1234), 12.34);
  });
});

describe("computeEarnCents", () => {
  it("2% do dinheiro quando cabe na metade da taxa", () => {
    // Reserva de R$ 120 com taxa de 8% (R$ 9,60): 2% = R$ 2,40; teto R$ 4,80.
    assert.equal(computeEarnCents({cashCents: 12000, feeCents: 960, config: RULE}), 240);
  });

  it("trava na metade da taxa", () => {
    assert.equal(computeEarnCents({cashCents: 10000, feeCents: 300, config: RULE}), 150);
  });

  it("arredonda para baixo e zera sem taxa ou sem dinheiro", () => {
    assert.equal(computeEarnCents({cashCents: 999, feeCents: 1000, config: RULE}), 19);
    assert.equal(computeEarnCents({cashCents: 10000, feeCents: 0, config: RULE}), 0);
    assert.equal(computeEarnCents({cashCents: 0, feeCents: 500, config: RULE}), 0);
  });
});

describe("allocateFifo", () => {
  const lots = [
    {lotId: "b", remainingCents: 300, expiresAtMs: 2000},
    {lotId: "a", remainingCents: 200, expiresAtMs: 1000},
    {lotId: "c", remainingCents: 500, expiresAtMs: 2000},
    {lotId: "z", remainingCents: 0, expiresAtMs: 500},
  ];

  it("consome primeiro o que vence primeiro, empate pelo id", () => {
    assert.deepEqual(allocateFifo(lots, 600), [
      {lotId: "a", cents: 200},
      {lotId: "b", cents: 300},
      {lotId: "c", cents: 100},
    ]);
  });

  it("valor exato de um lote não toca no seguinte", () => {
    assert.deepEqual(allocateFifo(lots, 200), [{lotId: "a", cents: 200}]);
  });

  it("lança quando o saldo não cobre", () => {
    assert.throws(() => allocateFifo(lots, 1001), /CASHBACK_INSUFFICIENT_BALANCE/);
  });
});

describe("computeExpiresAtMs", () => {
  it("soma meses mantendo o dia e a hora", () => {
    const released = Date.UTC(2026, 0, 15, 13, 0, 0);
    assert.equal(computeExpiresAtMs(released, 6), Date.UTC(2026, 6, 15, 13, 0, 0));
  });

  it("dia que não existe no mês de destino vira o último dia", () => {
    const released = Date.UTC(2026, 7, 31, 13, 0, 0);
    assert.equal(computeExpiresAtMs(released, 6), Date.UTC(2027, 1, 28, 13, 0, 0));
  });
});

describe("toMillisOrNull", () => {
  it("aceita Timestamp, Date, ISO e número; o resto é null", () => {
    assert.equal(toMillisOrNull(Timestamp.fromMillis(NOW)), NOW);
    assert.equal(toMillisOrNull(new Date(NOW)), NOW);
    assert.equal(toMillisOrNull(new Date(NOW).toISOString()), NOW);
    assert.equal(toMillisOrNull(NOW), NOW);
    assert.equal(toMillisOrNull("amanhã"), null);
    assert.equal(toMillisOrNull(undefined), null);
  });
});

describe("bookingEventAtMs", () => {
  it("lê data e hora da reserva no fuso de São Paulo", () => {
    assert.equal(bookingEventAtMs("2026-10-12", "19:30"), Date.UTC(2026, 9, 12, 22, 30, 0));
  });

  it("formato inválido é null", () => {
    assert.equal(bookingEventAtMs("12/10/2026", "19:30"), null);
    assert.equal(bookingEventAtMs("2026-10-12", "7h"), null);
  });
});

describe("formatCentsBrl", () => {
  it("formata com vírgula", () => {
    assert.equal(formatCentsBrl(240), "R$ 2,40");
    assert.equal(formatCentsBrl(123456), "R$ 1234,56");
  });
});

describe("releaseDecision", () => {
  const past = NOW - 60_000;
  const future = NOW + 60_000;

  it("origem que sumiu cancela", () => {
    assert.deepEqual(
      releaseDecision({sourceType: "booking", exists: false, status: "", eventAtMs: past}, NOW),
      {kind: "cancel", reason: "source_missing"},
    );
  });

  it("reserva: cancelada cancela; aconteceu libera; futura espera", () => {
    assert.equal(
      releaseDecision({sourceType: "booking", exists: true, status: "cancelled", eventAtMs: past}, NOW).kind,
      "cancel",
    );
    assert.equal(
      releaseDecision({sourceType: "booking", exists: true, status: "Canceled", eventAtMs: past}, NOW).kind,
      "cancel",
    );
    assert.deepEqual(
      releaseDecision({sourceType: "booking", exists: true, status: "confirmed", eventAtMs: past}, NOW),
      {kind: "release"},
    );
    assert.deepEqual(
      releaseDecision({sourceType: "booking", exists: true, status: "confirmed", eventAtMs: future}, NOW),
      {kind: "wait", eventAtMs: future},
    );
  });

  it("inscrição: torneio cancelado cancela; pedido de cancelamento pendente espera", () => {
    assert.equal(
      releaseDecision({
        sourceType: "registration", exists: true, cancellationPending: false,
        tournamentCancelled: true, eventAtMs: past,
      }, NOW).kind,
      "cancel",
    );
    assert.deepEqual(
      releaseDecision({
        sourceType: "registration", exists: true, cancellationPending: true,
        tournamentCancelled: false, eventAtMs: past,
      }, NOW),
      {kind: "wait", eventAtMs: null},
    );
    assert.deepEqual(
      releaseDecision({
        sourceType: "registration", exists: true, cancellationPending: false,
        tournamentCancelled: false, eventAtMs: past,
      }, NOW),
      {kind: "release"},
    );
  });

  it("torneio adiado espera pela data nova", () => {
    assert.deepEqual(
      releaseDecision({
        sourceType: "registration", exists: true, cancellationPending: false,
        tournamentCancelled: false, eventAtMs: future,
      }, NOW),
      {kind: "wait", eventAtMs: future},
    );
  });

  it("clubinho: saiu ou sessão cancelada cancela; confirmado libera", () => {
    assert.equal(
      releaseDecision({
        sourceType: "club", exists: true, participantStatus: "canceled_refunded",
        sessionStatus: "scheduled", eventAtMs: past,
      }, NOW).kind,
      "cancel",
    );
    assert.equal(
      releaseDecision({
        sourceType: "club", exists: true, participantStatus: "confirmed",
        sessionStatus: "canceled", eventAtMs: past,
      }, NOW).kind,
      "cancel",
    );
    assert.deepEqual(
      releaseDecision({
        sourceType: "club", exists: true, participantStatus: "confirmed",
        sessionStatus: "completed", eventAtMs: past,
      }, NOW),
      {kind: "release"},
    );
  });

  it("sem data conhecida libera (não há o que esperar)", () => {
    assert.deepEqual(
      releaseDecision({sourceType: "booking", exists: true, status: "confirmed", eventAtMs: null}, NOW),
      {kind: "release"},
    );
  });
});
