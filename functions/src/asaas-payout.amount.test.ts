/**
 * Caminho do dinheiro do saque: quanto o Asaas transfere de fato.
 * `sendArenaWithdrawalPixTransfer` manda `value: netReais`, então um erro aqui
 * transfere o valor errado — inclusive nos saques de ORGANIZADOR, que nunca
 * têm `feeReais` e precisam continuar recebendo o bruto.
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {
  resolveWithdrawalTransferAmount,
  withdrawalTransferAmountIsValid,
} from "./asaas-payout";

test("doc com tarifa: transfere o líquido (bruto − tarifa)", () => {
  const amounts = resolveWithdrawalTransferAmount({
    amountReais: 100,
    feeReais: 1.75,
  });
  assert.deepEqual(amounts, {amountReais: 100, feeReais: 1.75, netReais: 98.25});
  assert.equal(withdrawalTransferAmountIsValid(amounts), true);
});

test("doc antigo sem feeReais: transfere o bruto (retrocompat + saque de organizador)", () => {
  const amounts = resolveWithdrawalTransferAmount({amountReais: 250});
  assert.deepEqual(amounts, {amountReais: 250, feeReais: 0, netReais: 250});
  assert.equal(withdrawalTransferAmountIsValid(amounts), true);
});

test("feeReais nulo/inválido é tratado como zero, nunca como NaN", () => {
  assert.deepEqual(
    resolveWithdrawalTransferAmount({amountReais: 50, feeReais: null}),
    {amountReais: 50, feeReais: 0, netReais: 50},
  );
  assert.deepEqual(
    resolveWithdrawalTransferAmount({amountReais: 50, feeReais: "abc"}),
    {amountReais: 50, feeReais: 0, netReais: 50},
  );
});

test("feeReais negativo não vira crédito", () => {
  const amounts = resolveWithdrawalTransferAmount({amountReais: 50, feeReais: -10});
  assert.equal(amounts.feeReais, 0);
  assert.equal(amounts.netReais, 50);
});

test("tarifa maior que o valor: líquido inválido, não transferência negativa", () => {
  const amounts = resolveWithdrawalTransferAmount({amountReais: 1, feeReais: 1.75});
  assert.equal(amounts.netReais < 0, true);
  assert.equal(withdrawalTransferAmountIsValid(amounts), false);
});

test("tarifa igual ao valor: líquido zero também é inválido", () => {
  const amounts = resolveWithdrawalTransferAmount({amountReais: 1.75, feeReais: 1.75});
  assert.equal(amounts.netReais, 0);
  assert.equal(withdrawalTransferAmountIsValid(amounts), false);
});

test("saque sem valor (doc corrompido) é inválido", () => {
  assert.equal(
    withdrawalTransferAmountIsValid(resolveWithdrawalTransferAmount({})),
    false,
  );
});

test("arredondamento em centavos não deixa dízima no valor transferido", () => {
  const amounts = resolveWithdrawalTransferAmount({
    amountReais: 100.1,
    feeReais: 1.75,
  });
  assert.equal(amounts.netReais, 98.35);
});
