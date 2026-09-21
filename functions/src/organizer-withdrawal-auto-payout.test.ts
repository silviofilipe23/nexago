/**
 * Caminho AUTOMÁTICO do saque (≤ R$ 500, o comum) de ponta a ponta sobre
 * `FakeFirestore`: reserva no caixa do torneio → payout → liberação.
 *
 * Este é o teste que faltava. O saque automático montava um objeto literal sem
 * `tournamentId` para o payout, então `resolveWithdrawalWalletTarget` resolvia
 * a carteira antiga (`organizerWallets/{uid}`): no caso normal a validação de
 * reserva falhava e o PIX nunca saía; com um saque legado em voo, o PIX saía
 * consumindo a reserva do saque ANTIGO. Nada disso aparecia nos testes porque
 * ninguém exercitava o caminho inteiro — só as peças.
 *
 * O envio do PIX entra injetado (`WithdrawalPixSender`), então nenhuma linha
 * aqui toca a rede.
 */
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {buildWithdrawalDocData} from "./organizer-withdrawal";
import {
  completeOrganizerWithdrawalPayout,
  type WithdrawalPixSender,
} from "./organizer-withdrawal-payout";
import {reserveTournamentWithdrawalAmount} from "./tournament-wallet";

const DONO = "dono-uid";
const GESTOR = "gestor-uid";
const TORNEIO = "copa-caixa";
const CAIXA = `tournamentWallets/${TORNEIO}`;
const CARTEIRA_ANTIGA = `organizerWallets/${DONO}`;

/** Caixa do torneio com R$ 300 e a carteira antiga do dono com outros R$ 300 —
 *  é a presença das duas que revela para qual delas o débito foi. */
function seedCaixas(fake: FakeFirestore): void {
  fake.seedDoc(CAIXA, {
    tournamentId: TORNEIO, ownerId: DONO, availableReais: 300, pendingReais: 0,
  });
  fake.seedDoc(CARTEIRA_ANTIGA, {availableReais: 300, pendingReais: 0});
}

function saldos(fake: FakeFirestore, path: string): {
  availableReais: number;
  pendingReais: number;
} {
  const data = fake.store.get(path) ?? {};
  return {
    availableReais: Number(data.availableReais) || 0,
    pendingReais: Number(data.pendingReais) || 0,
  };
}

/** Envio de PIX de mentira: registra a chamada e diz que foi. */
function fakePixSender(): {
  send: WithdrawalPixSender;
  calls: Array<{withdrawalId: string; pixKey: string; prefix: string}>;
} {
  const calls: Array<{withdrawalId: string; pixKey: string; prefix: string}> = [];
  const send: WithdrawalPixSender = async (ref, withdrawal, prefix) => {
    calls.push({
      withdrawalId: ref.id,
      pixKey: String(withdrawal.pixKey ?? ""),
      prefix,
    });
    return {payoutId: `tr_${ref.id}`, payoutStatus: "sent"};
  };
  return {send, calls};
}

/** O que a callable grava, sem o wrapper `onCall`: mesmo builder, mesmo doc. */
async function registraSaque(
  fake: FakeFirestore,
  amountReais: number,
): Promise<{ref: DocumentReference; data: Record<string, unknown>}> {
  const data = buildWithdrawalDocData({
    tournamentId: TORNEIO,
    tournamentName: "Copa Caixa",
    ownerId: DONO,
    amountReais,
    pixKey: "gestor@exemplo.com",
    pixKeyType: "EMAIL",
    processingMode: "auto",
    requestedBy: GESTOR,
    delegated: true,
  });
  const ref = fake.collection("organizerWithdrawals").doc() as unknown as DocumentReference;
  await ref.set({...data, createdAt: 1});
  return {ref, data};
}

describe("saque automático debita o caixa do TORNEIO", () => {
  it("consome o pendingReais do torneio e não encosta na carteira antiga", async () => {
    const fake = new FakeFirestore();
    seedCaixas(fake);
    const db = fake as unknown as Firestore;

    await reserveTournamentWithdrawalAmount(db, TORNEIO, 120);
    assert.deepEqual(saldos(fake, CAIXA), {availableReais: 180, pendingReais: 120});

    const {ref, data} = await registraSaque(fake, 120);
    const pix = fakePixSender();
    const result = await completeOrganizerWithdrawalPayout(
      db, ref, data, GESTOR, "PIX automático na solicitação (gestor da equipe)", pix.send,
    );

    assert.equal(result.status, "approved");
    assert.equal(result.payoutStatus, "sent");
    assert.equal(pix.calls.length, 1, "o PIX tem de sair uma vez");
    assert.equal(pix.calls[0]!.pixKey, "gestor@exemplo.com");

    // Reserva consumida no caixa do torneio: pending zerado, disponível NÃO
    // devolvido (o dinheiro saiu de verdade).
    assert.deepEqual(saldos(fake, CAIXA), {availableReais: 180, pendingReais: 0});
    // Carteira antiga intocada — nem debitada, nem "corrigida".
    assert.deepEqual(
      saldos(fake, CARTEIRA_ANTIGA),
      {availableReais: 300, pendingReais: 0},
      "a carteira antiga não participa de saque novo",
    );
    assert.equal(fake.store.get(ref.path)?.status, "approved");
  });

  it("sem reserva no caixa do torneio, nenhum PIX sai", async () => {
    // Era exatamente este o sintoma do defeito: o alvo resolvido era a
    // carteira antiga, a validação de reserva dela falhava, e o `catch` do
    // saque automático engolia isso como "falha de PIX".
    const fake = new FakeFirestore();
    seedCaixas(fake);
    const db = fake as unknown as Firestore;

    const {ref, data} = await registraSaque(fake, 120);
    const pix = fakePixSender();
    await assert.rejects(
      () => completeOrganizerWithdrawalPayout(db, ref, data, GESTOR, undefined, pix.send),
      /WITHDRAWAL_RESERVATION_INVALID/,
    );
    assert.equal(pix.calls.length, 0, "PIX não pode sair sem reserva");
    assert.deepEqual(saldos(fake, CAIXA), {availableReais: 300, pendingReais: 0});
  });

  it("saque legado (sem tournamentId) continua debitando a carteira antiga", async () => {
    const fake = new FakeFirestore();
    seedCaixas(fake);
    const db = fake as unknown as Firestore;

    // Reserva na carteira antiga, como o fluxo pré-16/09 fazia.
    fake.seedDoc(CARTEIRA_ANTIGA, {availableReais: 180, pendingReais: 120});
    const ref = fake
      .collection("organizerWithdrawals")
      .doc() as unknown as DocumentReference;
    const legado = {
      organizerId: DONO,
      amountReais: 120,
      pixKey: "dono@exemplo.com",
      pixKeyType: "EMAIL",
      status: "pending",
      payoutStatus: "pending",
    };
    await ref.set(legado);

    const pix = fakePixSender();
    await completeOrganizerWithdrawalPayout(db, ref, legado, "admin-uid", undefined, pix.send);

    assert.equal(pix.calls.length, 1);
    assert.deepEqual(saldos(fake, CARTEIRA_ANTIGA), {availableReais: 180, pendingReais: 0});
    // O caixa do torneio não pagou o saque legado.
    assert.deepEqual(saldos(fake, CAIXA), {availableReais: 300, pendingReais: 0});
  });
});

describe("buildWithdrawalDocData", () => {
  it("grava o torneio de onde o dinheiro sai", () => {
    const data = buildWithdrawalDocData({
      tournamentId: TORNEIO,
      tournamentName: "Copa Caixa",
      ownerId: DONO,
      amountReais: 120,
      pixKey: "gestor@exemplo.com",
      pixKeyType: "EMAIL",
      processingMode: "auto",
      requestedBy: GESTOR,
      delegated: true,
    });
    assert.equal(data.tournamentId, TORNEIO);
    // `organizerId` é o DONO, não quem pediu: é por ele que a fila do
    // backoffice e o webhook de payout encontram o saque.
    assert.equal(data.organizerId, DONO);
    assert.equal(data.requestedBy, GESTOR);
    assert.equal(data.requestedByStaff, true);
    assert.equal(data.status, "pending");
  });
});
