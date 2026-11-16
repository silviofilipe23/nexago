import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  creditTournamentWalletFromRegistration,
  reserveTournamentWithdrawalAmount,
  releaseTournamentWithdrawalReservation,
  assertTournamentWithdrawalReservationValid,
  holdTournamentAwaitingSettlement,
  releaseTournamentAwaitingSettlement,
  reverseTournamentWalletCreditForRefund,
} from "./tournament-wallet";

const TOURNAMENT = "t1";
const OWNER = "ownerUid";
const WALLET_PATH = `tournamentWallets/${TOURNAMENT}`;

function ledgerEntry(fake: FakeFirestore): Record<string, unknown> {
  const entry = [...fake.store.entries()].find(([path]) =>
    path.startsWith(`${WALLET_PATH}/ledger/`),
  );
  assert.ok(entry, "nenhum lançamento no ledger");
  return entry[1];
}

async function credit(
  fake: FakeFirestore,
  params: {grossReais: number; platformFeeReais: number; gatewayFeeReais?: number},
): Promise<void> {
  await creditTournamentWalletFromRegistration(
    fake as unknown as Firestore,
    TOURNAMENT,
    {ownerId: OWNER, registrationId: "reg1", payerUid: "uidA", paymentId: "pay1", ...params},
  );
}

describe("creditTournamentWalletFromRegistration", () => {
  it("credita o líquido no caixa do torneio e grava o dono", async () => {
    const fake = new FakeFirestore();
    await credit(fake, {grossReais: 100, platformFeeReais: 8});

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["availableReais"], 92);
    assert.equal(wallet["pendingReais"], 0);
    assert.equal(wallet["tournamentId"], TOURNAMENT);
    assert.equal(wallet["ownerId"], OWNER);
    assert.equal(ledgerEntry(fake)["netReais"], 92);
    assert.equal(ledgerEntry(fake)["registrationId"], "reg1");
  });

  it("soma no saldo que já existe, sem zerar o pendente", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 50, pendingReais: 30});
    await credit(fake, {grossReais: 100, platformFeeReais: 8});

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["availableReais"], 142);
    assert.equal(wallet["pendingReais"], 30);
  });

  it("desconta a taxa do gateway do líquido", async () => {
    const fake = new FakeFirestore();
    await credit(fake, {grossReais: 100, platformFeeReais: 8, gatewayFeeReais: 3.29});
    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 88.71);
  });
});

describe("reserva de saque no caixa do torneio", () => {
  it("move do disponível para o pendente", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 100, pendingReais: 0});

    await reserveTournamentWithdrawalAmount(fake as unknown as Firestore, TOURNAMENT, 40);

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["availableReais"], 60);
    assert.equal(wallet["pendingReais"], 40);
  });

  it("recusa saque acima do disponível", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 30, pendingReais: 0});

    await assert.rejects(
      () => reserveTournamentWithdrawalAmount(fake as unknown as Firestore, TOURNAMENT, 40),
      /INSUFFICIENT_BALANCE/,
    );
    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 30);
  });

  it("caixa inexistente não tem saldo nenhum", async () => {
    const fake = new FakeFirestore();
    await assert.rejects(
      () => reserveTournamentWithdrawalAmount(fake as unknown as Firestore, TOURNAMENT, 1),
      /INSUFFICIENT_BALANCE/,
    );
  });

  it("aprovar consome o pendente; rejeitar devolve ao disponível", async () => {
    const aprovado = new FakeFirestore();
    aprovado.seedDoc(WALLET_PATH, {availableReais: 60, pendingReais: 40});
    await releaseTournamentWithdrawalReservation(
      aprovado as unknown as Firestore, TOURNAMENT, 40, true,
    );
    assert.equal(aprovado.store.get(WALLET_PATH)!["availableReais"], 60);
    assert.equal(aprovado.store.get(WALLET_PATH)!["pendingReais"], 0);

    const rejeitado = new FakeFirestore();
    rejeitado.seedDoc(WALLET_PATH, {availableReais: 60, pendingReais: 40});
    await releaseTournamentWithdrawalReservation(
      rejeitado as unknown as Firestore, TOURNAMENT, 40, false,
    );
    assert.equal(rejeitado.store.get(WALLET_PATH)!["availableReais"], 100);
    assert.equal(rejeitado.store.get(WALLET_PATH)!["pendingReais"], 0);
  });

  it("validação recusa pagar mais do que está reservado", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 0, pendingReais: 10});
    await assert.rejects(
      () => assertTournamentWithdrawalReservationValid(
        fake as unknown as Firestore, TOURNAMENT, 40,
      ),
      /WITHDRAWAL_RESERVATION_INVALID/,
    );
  });

  it("validação recusa PIX de caixa com saldo negativo", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: -5, pendingReais: 40});
    await assert.rejects(
      () => assertTournamentWithdrawalReservationValid(
        fake as unknown as Firestore, TOURNAMENT, 40,
      ),
      /WALLET_STATE_INVALID/,
    );
  });
});

describe("a liberar do cartão (`awaitingSettlementReais`)", () => {
  const PROCESSED = "artifacts/p/public/data/asaas_processed_payments/pay1";

  function processedRef(fake: FakeFirestore): DocumentReference {
    return (fake as unknown as Firestore).doc(PROCESSED) as DocumentReference;
  }

  async function hold(fake: FakeFirestore, netReais: number, tournamentId = TOURNAMENT) {
    return holdTournamentAwaitingSettlement(
      fake as unknown as Firestore,
      processedRef(fake),
      {tournamentId, ownerId: OWNER, netReais},
    );
  }

  async function creditWithMarker(fake: FakeFirestore, gatewayFeeReais = 3.29) {
    return creditTournamentWalletFromRegistration(
      fake as unknown as Firestore,
      TOURNAMENT,
      {
        ownerId: OWNER, registrationId: "reg1", payerUid: "uidA", paymentId: "pay1",
        grossReais: 100, platformFeeReais: 8, gatewayFeeReais,
        processedRef: processedRef(fake),
      },
    );
  }

  it("soma o líquido previsto sem mexer no disponível nem no saque em processamento", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 50, pendingReais: 30, awaitingSettlementReais: 10});
    fake.seedDoc(PROCESSED, {confirmedAt: "ts"});

    assert.equal(await hold(fake, 88.71), true);

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["awaitingSettlementReais"], 98.71);
    assert.equal(wallet["availableReais"], 50);
    assert.equal(wallet["pendingReais"], 30);
    const marker = fake.store.get(PROCESSED)!["awaitingSettlement"] as Record<string, unknown>;
    assert.equal(marker["netReais"], 88.71);
    assert.equal(marker["tournamentId"], TOURNAMENT);
  });

  it("cria o caixa zerado quando o torneio ainda não tinha caixa", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROCESSED, {confirmedAt: "ts"});

    await hold(fake, 88.71);

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["availableReais"], 0);
    assert.equal(wallet["pendingReais"], 0);
    assert.equal(wallet["ownerId"], OWNER);
    assert.equal(wallet["awaitingSettlementReais"], 88.71);
  });

  it("reentrega não soma de novo", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROCESSED, {confirmedAt: "ts"});

    await hold(fake, 88.71);
    assert.equal(await hold(fake, 88.71), false);

    assert.equal(fake.store.get(WALLET_PATH)!["awaitingSettlementReais"], 88.71);
  });

  it("pagamento já creditado não volta para o a liberar", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROCESSED, {confirmedAt: "ts", walletCreditedAt: "ts"});

    assert.equal(await hold(fake, 88.71), false);
    assert.equal(fake.store.get(WALLET_PATH), undefined);
  });

  it("o crédito abate o valor que foi somado, não o recalculado", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROCESSED, {confirmedAt: "ts"});
    await hold(fake, 88.71);

    // A taxa real do cartão veio diferente na liquidação: o caixa recebe o
    // líquido real, e o a liberar zera pelo valor guardado no marcador.
    assert.equal(await creditWithMarker(fake, 3.5), true);

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["availableReais"], 88.5);
    assert.equal(wallet["awaitingSettlementReais"], 0);
    const processed = fake.store.get(PROCESSED)!;
    assert.ok(processed["walletCreditedAt"]);
    assert.ok(processed["awaitingSettlementReleasedAt"]);
    assert.equal(processed["awaitingSettlementReleaseReason"], "credited");
  });

  it("crédito sem marcador (PIX ou acervo) não mexe no a liberar", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 0, pendingReais: 0, awaitingSettlementReais: 40});
    fake.seedDoc(PROCESSED, {confirmedAt: "ts"});

    await creditWithMarker(fake, 0);

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["availableReais"], 92);
    assert.equal(wallet["awaitingSettlementReais"], 40);
    assert.equal(fake.store.get(PROCESSED)!["awaitingSettlementReleasedAt"], undefined);
  });

  it("entrega concorrente que já creditou não credita nem abate de novo", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROCESSED, {confirmedAt: "ts"});
    await hold(fake, 88.71);
    await creditWithMarker(fake);

    assert.equal(await creditWithMarker(fake), false);

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["availableReais"], 88.71);
    assert.equal(wallet["awaitingSettlementReais"], 0);
  });

  it("estorno antes da liquidação tira do a liberar uma vez só", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 0, pendingReais: 0, awaitingSettlementReais: 20});
    fake.seedDoc(PROCESSED, {confirmedAt: "ts"});
    await hold(fake, 88.71);

    const db = fake as unknown as Firestore;
    assert.equal(await releaseTournamentAwaitingSettlement(db, processedRef(fake), "REFUNDED"), 88.71);
    assert.equal(await releaseTournamentAwaitingSettlement(db, processedRef(fake), "REFUNDED"), 0);

    assert.equal(fake.store.get(WALLET_PATH)!["awaitingSettlementReais"], 20);
    assert.equal(fake.store.get(PROCESSED)!["awaitingSettlementReleaseReason"], "REFUNDED");
  });

  it("liquidação depois do estorno credita sem abater de novo", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(PROCESSED, {confirmedAt: "ts"});
    await hold(fake, 88.71);
    await releaseTournamentAwaitingSettlement(
      fake as unknown as Firestore, processedRef(fake), "CHARGEBACK_REQUESTED",
    );

    await creditWithMarker(fake);

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["availableReais"], 88.71);
    assert.equal(wallet["awaitingSettlementReais"], 0);
  });

  it("nunca deixa o a liberar negativo", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 0, pendingReais: 0, awaitingSettlementReais: 5});
    fake.seedDoc(PROCESSED, {
      confirmedAt: "ts",
      awaitingSettlement: {tournamentId: TOURNAMENT, netReais: 88.71},
    });

    await creditWithMarker(fake);

    assert.equal(fake.store.get(WALLET_PATH)!["awaitingSettlementReais"], 0);
  });

  it("abate no caixa do marcador quando ele é de outro torneio", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc("tournamentWallets/t0", {availableReais: 0, pendingReais: 0, awaitingSettlementReais: 88.71});
    fake.seedDoc(PROCESSED, {
      confirmedAt: "ts",
      awaitingSettlement: {tournamentId: "t0", netReais: 88.71},
    });

    await creditWithMarker(fake);

    assert.equal(fake.store.get("tournamentWallets/t0")!["awaitingSettlementReais"], 0);
    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 88.71);
    assert.equal(fake.store.get(WALLET_PATH)!["awaitingSettlementReais"], undefined);
  });
});

describe("reverseTournamentWalletCreditForRefund", () => {
  const PROCESSED = "artifacts/p/public/data/asaas_processed_payments/pay1";
  const BY = "webhook:asaas-tournament-registration";

  function processedRef(fake: FakeFirestore, path = PROCESSED): DocumentReference {
    return (fake as unknown as Firestore).doc(path) as DocumentReference;
  }

  /** Crédito de inscrição (bruto 100, taxa 8 → líquido 92) marcado no doc do pagamento. */
  async function creditPayment(fake: FakeFirestore, paymentId = "pay1", path = PROCESSED): Promise<void> {
    fake.seedDoc(path, {kind: "tournamentRegistration", confirmedAt: "ts"});
    await creditTournamentWalletFromRegistration(fake as unknown as Firestore, TOURNAMENT, {
      ownerId: OWNER, registrationId: "reg1", payerUid: "uidA", paymentId,
      grossReais: 100, platformFeeReais: 8,
      processedRef: processedRef(fake, path),
    });
  }

  async function reverse(fake: FakeFirestore, paymentId = "pay1", path = PROCESSED) {
    return reverseTournamentWalletCreditForRefund(
      fake as unknown as Firestore,
      processedRef(fake, path),
      {tournamentId: TOURNAMENT, paymentId, reason: "REFUNDED", by: BY},
    );
  }

  function ledgerLines(fake: FakeFirestore): Array<[string, Record<string, unknown>]> {
    return [...fake.store.entries()].filter(([path]) => path.startsWith(`${WALLET_PATH}/ledger/`));
  }

  it("tira o líquido do disponível e apaga a linha do extrato", async () => {
    const fake = new FakeFirestore();
    await creditPayment(fake);

    const outcome = await reverse(fake);

    assert.equal(outcome.status, "reversed");
    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 0);
    assert.equal(ledgerLines(fake).length, 0);
  });

  it("grava a reversão no pagamento no formato do script manual", async () => {
    const fake = new FakeFirestore();
    await creditPayment(fake);
    const [linePath, line] = ledgerLines(fake)[0]!;

    await reverse(fake);

    const processed = fake.store.get(PROCESSED)!;
    assert.ok(processed["walletCreditReversedAt"]);
    assert.deepEqual(processed["walletCreditReversal"], {
      reason: "REFUNDED",
      tournamentId: TOURNAMENT,
      netReais: 92,
      ledgerEntryId: linePath.split("/").pop(),
      ledgerEntry: line,
      by: BY,
    });
  });

  it("mantém walletCreditedAt: o crédito não acontece de novo depois da reversão", async () => {
    const fake = new FakeFirestore();
    await creditPayment(fake);
    await reverse(fake);

    const creditedAgain = await creditTournamentWalletFromRegistration(
      fake as unknown as Firestore, TOURNAMENT, {
        ownerId: OWNER, registrationId: "reg1", payerUid: "uidA", paymentId: "pay1",
        grossReais: 100, platformFeeReais: 8, processedRef: processedRef(fake),
      },
    );

    assert.equal(creditedAgain, false);
    assert.ok(fake.store.get(PROCESSED)!["walletCreditedAt"]);
    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 0);
  });

  it("reentrega não debita de novo", async () => {
    const fake = new FakeFirestore();
    await creditPayment(fake);
    await creditPayment(fake, "pay2", "artifacts/p/public/data/asaas_processed_payments/pay2");

    await reverse(fake);
    const second = await reverse(fake);

    assert.deepEqual(second, {status: "skipped", reason: "already_reversed"});
    // Sobrou só o crédito do outro pagamento.
    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 92);
    assert.equal(ledgerLines(fake).length, 1);
    assert.equal(ledgerLines(fake)[0]![1]["asaasPaymentId"], "pay2");
  });

  it("pagamento que nunca creditou o caixa não é revertido", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 50, pendingReais: 0});
    fake.seedDoc(PROCESSED, {kind: "tournamentRegistration", confirmedAt: "ts"});

    const outcome = await reverse(fake);

    assert.deepEqual(outcome, {status: "skipped", reason: "not_credited"});
    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 50);
    assert.equal(fake.store.get(PROCESSED)!["walletCreditReversedAt"], undefined);
  });

  it("pagamento já revertido pelo script manual é pulado", async () => {
    const fake = new FakeFirestore();
    // Estado que o script deixa: caixa já abatido, linha apagada, marcador no pagamento.
    fake.seedDoc(WALLET_PATH, {availableReais: 50, pendingReais: 0});
    const scriptReversal = {
      reason: "REFUNDED", tournamentId: TOURNAMENT, netReais: 92, ledgerEntryId: "l1",
      ledgerEntry: {type: "credit", asaasPaymentId: "pay1", netReais: 92},
      by: "script:reverse-refunded-registration-credit",
    };
    fake.seedDoc(PROCESSED, {
      kind: "tournamentRegistration", confirmedAt: "ts", walletCreditedAt: "ts",
      walletCreditReversedAt: "ts", walletCreditReversal: scriptReversal,
    });

    const outcome = await reverse(fake);

    assert.deepEqual(outcome, {status: "skipped", reason: "already_reversed"});
    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 50);
    assert.deepEqual(fake.store.get(PROCESSED)!["walletCreditReversal"], scriptReversal);
  });

  it("crédito fora do extrato deste caixa não debita nada", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 50, pendingReais: 0});
    fake.seedDoc(PROCESSED, {kind: "tournamentRegistration", confirmedAt: "ts", walletCreditedAt: "ts"});
    // A linha deste pagamento está no caixa de OUTRO torneio.
    fake.seedDoc("tournamentWallets/t0/ledger/l0", {type: "credit", asaasPaymentId: "pay1", netReais: 92});

    const outcome = await reverse(fake);

    assert.deepEqual(outcome, {status: "skipped", reason: "ledger_line_missing"});
    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 50);
    assert.ok(fake.store.get("tournamentWallets/t0/ledger/l0"));
    assert.equal(fake.store.get(PROCESSED)!["walletCreditReversedAt"], undefined);
  });

  it("duas linhas de crédito do mesmo pagamento: não escolhe uma, não debita", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 184, pendingReais: 0});
    fake.seedDoc(PROCESSED, {kind: "tournamentRegistration", confirmedAt: "ts", walletCreditedAt: "ts"});
    fake.seedDoc(`${WALLET_PATH}/ledger/l1`, {type: "credit", asaasPaymentId: "pay1", netReais: 92});
    fake.seedDoc(`${WALLET_PATH}/ledger/l2`, {type: "credit", asaasPaymentId: "pay1", netReais: 92});

    const outcome = await reverse(fake);

    assert.deepEqual(outcome, {status: "skipped", reason: "ledger_line_duplicated"});
    assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 184);
    assert.equal(ledgerLines(fake).length, 2);
  });

  it("não mexe no saque em processamento, no a liberar nem nas outras linhas", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(WALLET_PATH, {availableReais: 10, pendingReais: 30, awaitingSettlementReais: 40});
    fake.seedDoc(`${WALLET_PATH}/ledger/other`, {type: "credit", asaasPaymentId: "payX", netReais: 10});
    await creditPayment(fake);

    await reverse(fake);

    const wallet = fake.store.get(WALLET_PATH)!;
    assert.equal(wallet["availableReais"], 10);
    assert.equal(wallet["pendingReais"], 30);
    assert.equal(wallet["awaitingSettlementReais"], 40);
    assert.deepEqual(ledgerLines(fake).map(([path]) => path), [`${WALLET_PATH}/ledger/other`]);
  });

  describe("organizador já sacou", () => {
    /** Caixa creditado em 92 do qual 80 já saíram num saque aprovado. */
    async function creditedAndWithdrawn(): Promise<FakeFirestore> {
      const fake = new FakeFirestore();
      await creditPayment(fake);
      const db = fake as unknown as Firestore;
      await reserveTournamentWithdrawalAmount(db, TOURNAMENT, 80);
      await releaseTournamentWithdrawalReservation(db, TOURNAMENT, 80, true);
      return fake;
    }

    it("o disponível fica negativo: é a dívida do caixa", async () => {
      const fake = await creditedAndWithdrawn();

      const outcome = await reverse(fake);

      assert.deepEqual(outcome, {
        status: "reversed", netReais: 92, availableAfterReais: -80,
        ledgerEntryId: (fake.store.get(PROCESSED)!["walletCreditReversal"] as Record<string, unknown>)["ledgerEntryId"],
      });
      assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], -80);
    });

    it("caixa negativo recusa saque novo", async () => {
      const fake = await creditedAndWithdrawn();
      await reverse(fake);

      await assert.rejects(
        () => reserveTournamentWithdrawalAmount(fake as unknown as Firestore, TOURNAMENT, 1),
        /INSUFFICIENT_BALANCE/,
      );
    });

    it("o próximo crédito abate a dívida antes de sobrar para saque", async () => {
      const fake = await creditedAndWithdrawn();
      await reverse(fake);

      await creditPayment(fake, "pay2", "artifacts/p/public/data/asaas_processed_payments/pay2");

      assert.equal(fake.store.get(WALLET_PATH)!["availableReais"], 12);
    });
  });
});
