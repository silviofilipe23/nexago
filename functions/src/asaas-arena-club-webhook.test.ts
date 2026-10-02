import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {Timestamp} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {processArenaClubSessionAsaasNotification} from "./asaas-arena-club-webhook";
import {parseClubSessionPaymentRef} from "./arena-club-constants";
import {attachHoldPayment, captureHold, holdCashback} from "./athlete-wallet";
import {reverseCashbackForPayment} from "./cashback-reversal";

const SESSION_PATH = "arenaClubSessions/club_c1_2026-07-24";
const PARTICIPANT_PATH = `${SESSION_PATH}/clubParticipants/uid1`;
const PROCESSED_PATH = "artifacts/p/public/data/asaas_processed_payments/pay1";
const EXTERNAL_REF = "arenaClubSession:club_c1_2026-07-24:uid1";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  // Contas vivas: a intenção de cashback de conta excluída é encerrada sem ganho.
  fake.seedDoc("users/uid1", {fullName: "Atleta"});
  return {fake, db: fake as unknown as Firestore};
}

function seedSession(
  fake: FakeFirestore,
  overrides: Record<string, unknown> = {},
): void {
  fake.seedDoc(SESSION_PATH.replace("arenaClubSessions/", "arenaClubSessions/"), {
    clubId: "c1",
    arenaId: "arena1",
    arenaName: "Arena Sol",
    clubName: "Clubinho de sexta",
    date: "2026-07-24",
    startTime: "15:00",
    status: "scheduled",
    capacity: 2,
    confirmedCount: 0,
    pendingCount: 1,
    priceReais: 15,
    ...overrides,
  });
}

function seedParticipant(
  fake: FakeFirestore,
  overrides: Record<string, unknown> = {},
): void {
  fake.seedDoc(PARTICIPANT_PATH, {
    athleteId: "uid1",
    status: "pending_payment",
    amountReais: 15,
    asaasPaymentId: "pay1",
    ...overrides,
  });
}

function makeDeps() {
  const refunds: string[] = [];
  const notified: string[] = [];
  return {
    refunds,
    notified,
    deps: {
      refund: async (id: string) => {
        refunds.push(id);
      },
      notify: async (input: {userId: string}) => {
        notified.push(input.userId);
      },
    },
  };
}

function processedRefOf(db: Firestore): DocumentReference {
  return db.doc(PROCESSED_PATH) as DocumentReference;
}

const paidPayment = {
  status: "RECEIVED",
  value: 15,
  externalReference: EXTERNAL_REF,
};

describe("arena-club-constants.parseClubSessionPaymentRef", () => {
  it("extrai sessionId e uid", () => {
    assert.deepEqual(parseClubSessionPaymentRef(EXTERNAL_REF), {
      sessionId: "club_c1_2026-07-24",
      athleteUid: "uid1",
    });
    assert.equal(parseClubSessionPaymentRef("arenaBooking:x"), null);
    assert.equal(parseClubSessionPaymentRef("arenaClubSession:semUid"), null);
  });
});

describe("asaas-arena-club-webhook RECEIVED", () => {
  it("confirma o pendente, atualiza contadores e credita 5% sem piso", async () => {
    const {fake, db} = makeDb();
    seedSession(fake);
    seedParticipant(fake);
    const {deps, notified} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), deps,
    );

    const p = fake.store.get(PARTICIPANT_PATH)!;
    assert.equal(p["status"], "confirmed");
    assert.equal(p["platformFeeReais"], 0.75);
    assert.equal(p["netReais"], 14.25);

    const session = fake.store.get(SESSION_PATH)!;
    assert.equal(session["confirmedCount"], 1);
    assert.equal(session["pendingCount"], 0);

    const wallet = fake.store.get("arenaWallets/arena1")!;
    assert.equal(wallet["availableReais"], 14.25);

    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed["outcome"], "approved");
    assert.deepEqual(notified, ["uid1"]);
  });

  it("é idempotente quando o payment já foi processado", async () => {
    const {fake, db} = makeDb();
    seedSession(fake);
    seedParticipant(fake);
    fake.seedDoc(PROCESSED_PATH, {outcome: "approved"});
    const {deps} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), deps,
    );

    const p = fake.store.get(PARTICIPANT_PATH)!;
    assert.equal(p["status"], "pending_payment"); // intocado
    assert.equal(fake.store.get(SESSION_PATH)!["confirmedCount"], 0);
  });

  it("pagamento tardio (expired) com vaga livre ainda confirma", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {pendingCount: 0});
    seedParticipant(fake, {status: "expired"});
    const {deps} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), deps,
    );

    assert.equal(fake.store.get(PARTICIPANT_PATH)!["status"], "confirmed");
    const session = fake.store.get(SESSION_PATH)!;
    assert.equal(session["confirmedCount"], 1);
    assert.equal(session["pendingCount"], 0);
  });

  it("pagamento tardio com lista cheia → estorno automático sem crédito", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {capacity: 1, confirmedCount: 1, pendingCount: 0});
    seedParticipant(fake, {status: "expired"});
    const {deps, refunds} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), deps,
    );

    assert.deepEqual(refunds, ["pay1"]);
    const p = fake.store.get(PARTICIPANT_PATH)!;
    assert.equal(p["status"], "canceled_by_arena_refunded");
    assert.equal(p["refundStatus"], "done");
    assert.equal(fake.store.has("arenaWallets/arena1"), false);
    assert.equal(fake.store.get(PROCESSED_PATH)!["outcome"], "refunded_session_full");
  });

  it("sessão cancelada → estorno automático", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {status: "canceled"});
    seedParticipant(fake);
    const {deps, refunds} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), deps,
    );

    assert.deepEqual(refunds, ["pay1"]);
    assert.equal(
      fake.store.get(PARTICIPANT_PATH)!["status"],
      "canceled_by_arena_refunded",
    );
  });

  it("estorno automático que falha NÃO grava processedRef (retry do webhook)", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {status: "canceled"});
    seedParticipant(fake);

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db),
      {
        refund: async () => {
          throw new Error("asaas fora do ar");
        },
        notify: async () => undefined,
      },
    );

    assert.equal(fake.store.has(PROCESSED_PATH), false);
    assert.equal(fake.store.get(PARTICIPANT_PATH)!["refundStatus"], "failed");
  });
});

describe("asaas-arena-club-webhook eventos negativos", () => {
  it("OVERDUE expira o pendente e libera a vaga", async () => {
    const {fake, db} = makeDb();
    seedSession(fake);
    seedParticipant(fake);
    const {deps} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db,
      "pay1",
      {status: "OVERDUE", value: 15, externalReference: EXTERNAL_REF},
      processedRefOf(db),
      deps,
    );

    assert.equal(fake.store.get(PARTICIPANT_PATH)!["status"], "expired");
    assert.equal(fake.store.get(SESSION_PATH)!["pendingCount"], 0);
    assert.equal(fake.store.get(PROCESSED_PATH)!["outcome"], "expired");
  });

  it("REFUNDED de estorno iniciado por nós só registra", async () => {
    const {fake, db} = makeDb();
    seedSession(fake);
    seedParticipant(fake, {status: "canceled_refunded"});
    const {deps} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db,
      "pay1",
      {status: "REFUNDED", value: 15, externalReference: EXTERNAL_REF},
      processedRefOf(db),
      deps,
    );

    assert.equal(fake.store.get(PARTICIPANT_PATH)!["status"], "canceled_refunded");
    assert.equal(fake.store.get(PROCESSED_PATH)!["outcome"], "already_resolved");
  });
});

describe("processArenaClubSessionAsaasNotification — cashback", () => {
  const NOW_MS = Date.now();

  function seedSpendableLot(fake: FakeFirestore, cents: number): void {
    fake.seedDoc("athleteWallets/uid1/lots/old", {
      uid: "uid1", sourceType: "booking", sourceId: "b0", tournamentId: null, arenaId: "a1",
      label: "Reserva", earnedCents: cents, remainingCents: cents, status: "available",
      eventAt: Timestamp.fromMillis(NOW_MS - 1000), releasedAt: Timestamp.fromMillis(NOW_MS - 1000),
      expiresAt: Timestamp.fromMillis(NOW_MS + 90 * 86_400_000), expiryWarnedAt: null,
      createdAt: Timestamp.fromMillis(NOW_MS - 1000),
    });
  }

  function arenaLedger(fake: FakeFirestore): Record<string, unknown>[] {
    return [...fake.store.entries()]
      .filter(([path]) => path.startsWith("arenaWallets/arena1/ledger/"))
      .map(([, data]) => data);
  }

  it("saldo aplicado: participante e arena ficam com o bruto; reserva capturada", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {startAt: Timestamp.fromMillis(Date.UTC(2026, 6, 24, 18, 0, 0))});
    seedSpendableLot(fake, 2000);
    const {holdId} = await holdCashback(db, {
      uid: "uid1", maxCents: 1000, sourceType: "club", sourceId: "club_c1_2026-07-24",
      trackingPath: PARTICIPANT_PATH, label: "Clubinho", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uid1", holdId!, "pay1");
    seedParticipant(fake, {cashbackAppliedCents: 1000, cashbackHoldId: holdId});

    await processArenaClubSessionAsaasNotification(
      db, "pay1", {...paidPayment, value: 5}, processedRefOf(db), makeDeps().deps,
    );

    const participant = fake.store.get(PARTICIPANT_PATH)!;
    assert.equal(participant.status, "confirmed");
    assert.equal(participant.amountReais, 15);
    assert.equal(participant.platformFeeReais, 0.75);
    assert.equal(participant.netReais, 14.25);
    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdId}`)!.status, "captured");
    assert.equal(fake.store.get(PROCESSED_PATH)!.cashbackStatus, "done");

    const credit = arenaLedger(fake).find((e) => e.type === "credit")!;
    assert.equal(credit.grossReais, 15);
    assert.equal(credit.cashbackAppliedReais, 10);
  });

  it("cashback ligado: lote pendente até a sessão começar", async () => {
    const {fake, db} = makeDb();
    const startMs = Date.UTC(2026, 6, 24, 18, 0, 0);
    seedSession(fake, {startAt: Timestamp.fromMillis(startMs)});
    seedParticipant(fake);
    fake.seedDoc("appConfig/cashback", {enabled: true});

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), makeDeps().deps,
    );

    const lot = fake.store.get("athleteWallets/uid1/lots/pay1")!;
    // Taxa do clubinho = 5% de R$ 15 = R$ 0,75 → teto R$ 0,37; 2% = R$ 0,30.
    assert.equal(lot.earnedCents, 30);
    assert.equal(lot.sourceType, "club");
    assert.equal(lot.label, "Clubinho · Clubinho de sexta");
    assert.equal((lot.eventAt as Timestamp).toMillis(), startMs);
  });

  it("pagamento tardio de cobrança substituída: acha a reserva pelo id do pagamento, não pelo participante atual", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {startAt: Timestamp.fromMillis(Date.UTC(2026, 6, 24, 18, 0, 0))});
    seedSpendableLot(fake, 5000);
    const {holdId: holdOld} = await holdCashback(db, {
      uid: "uid1", maxCents: 1000, sourceType: "club", sourceId: "club_c1_2026-07-24",
      trackingPath: PARTICIPANT_PATH, label: "Clubinho", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uid1", holdOld!, "pay1");
    const {holdId: holdNew} = await holdCashback(db, {
      uid: "uid1", maxCents: 1000, sourceType: "club", sourceId: "club_c1_2026-07-24",
      trackingPath: PARTICIPANT_PATH, label: "Clubinho", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uid1", holdNew!, "payNew");
    // O atleta gerou uma cobrança nova: o participante atual aponta pra ela.
    seedParticipant(fake, {
      asaasPaymentId: "payNew", cashbackAppliedCents: 1000, cashbackHoldId: holdNew,
    });

    // O webhook da cobrança ANTIGA (pay1) chega atrasado e, mesmo assim, paga.
    await processArenaClubSessionAsaasNotification(
      db, "pay1", {...paidPayment, value: 5}, processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdOld}`)!.status, "captured");
    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdNew}`)!.status, "open");
    const credit = arenaLedger(fake).find((e) => e.type === "credit")!;
    // Bruto é 5 (dinheiro) + 10 (saldo de pay1) — não os 10 de payNew.
    assert.equal(credit.grossReais, 15);
  });

  it("lista cheia: estorna sem creditar e devolve a reserva aberta na hora", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {capacity: 1, confirmedCount: 1, pendingCount: 0});
    seedSpendableLot(fake, 2000);
    const {holdId} = await holdCashback(db, {
      uid: "uid1", maxCents: 1000, sourceType: "club", sourceId: "club_c1_2026-07-24",
      trackingPath: PARTICIPANT_PATH, label: "Clubinho", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uid1", holdId!, "pay1");
    seedParticipant(fake, {
      status: "expired", cashbackAppliedCents: 1000, cashbackHoldId: holdId,
    });
    const {deps, refunds} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db, "pay1", paidPayment, processedRefOf(db), deps,
    );

    assert.deepEqual(refunds, ["pay1"]);
    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdId}`)!.status, "released");
    assert.equal(fake.store.get("athleteWallets/uid1/lots/old")!.remainingCents, 2000);
    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed.outcome, "refunded_session_full");
    assert.equal(processed.cashback, undefined);
    assert.equal(processed.cashbackStatus, undefined);
  });

  // R2: a varredura de 5 min pode capturar a reserva (Asaas diz RECEIVED)
  // antes de o webhook chegar; quando o webhook estorna em vez de consumir,
  // o saldo tem de voltar — uma vez só, mesmo com o PAYMENT_REFUNDED depois.
  function refundEntries(fake: FakeFirestore): Array<Record<string, unknown>> {
    return [...fake.store.entries()]
      .filter(([path, data]) => path.startsWith("athleteWallets/uid1/ledger/") && data.type === "refund")
      .map(([, data]) => data);
  }

  async function sweeperCapturedHold(db: Firestore, paymentId: string): Promise<string> {
    const {holdId} = await holdCashback(db, {
      uid: "uid1", maxCents: 1000, sourceType: "club", sourceId: "club_c1_2026-07-24",
      trackingPath: PARTICIPANT_PATH, label: "Clubinho", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uid1", holdId!, paymentId);
    await captureHold(db, "uid1", holdId!, NOW_MS);
    return holdId!;
  }

  it("lista cheia com a reserva já capturada pela varredura: estorna e devolve o saldo uma vez", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {capacity: 1, confirmedCount: 1, pendingCount: 0});
    seedSpendableLot(fake, 2000);
    const holdId = await sweeperCapturedHold(db, "pay1");
    seedParticipant(fake, {status: "expired"});
    const {deps, refunds} = makeDeps();

    await processArenaClubSessionAsaasNotification(
      db, "pay1", {...paidPayment, value: 5}, processedRefOf(db), deps,
    );
    // O estorno automático dispara o PAYMENT_REFUNDED depois.
    await reverseCashbackForPayment(db, processedRefOf(db), "pay1", NOW_MS, {externalReference: EXTERNAL_REF});

    assert.deepEqual(refunds, ["pay1"]);
    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdId}`)!.status, "refunded");
    assert.equal(fake.store.get("athleteWallets/uid1/lots/old")!.remainingCents, 2000);
    assert.equal(refundEntries(fake).length, 1);
    assert.equal(refundEntries(fake)[0].amountCents, 1000);
  });

  it("sessão encerrada e participante sumido (órfão): estorno devolve a reserva capturada", async () => {
    for (const scenario of ["session_closed", "orphan"] as const) {
      const {fake, db} = makeDb();
      seedSession(fake, scenario === "session_closed" ? {status: "canceled"} : {});
      seedSpendableLot(fake, 2000);
      const holdId = await sweeperCapturedHold(db, "pay1");
      if (scenario === "session_closed") seedParticipant(fake, {status: "pending_payment"});
      const {deps, refunds} = makeDeps();

      await processArenaClubSessionAsaasNotification(db, "pay1", paidPayment, processedRefOf(db), deps);

      assert.deepEqual(refunds, ["pay1"], scenario);
      assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdId}`)!.status, "refunded", scenario);
      assert.equal(refundEntries(fake).length, 1, scenario);
    }
  });

  it("estorno automático falhou: a reserva capturada fica até o estorno acontecer", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {capacity: 1, confirmedCount: 1, pendingCount: 0});
    seedSpendableLot(fake, 2000);
    const holdId = await sweeperCapturedHold(db, "pay1");
    seedParticipant(fake, {status: "expired"});
    const {deps} = makeDeps();
    deps.refund = async () => {
      throw new Error("Asaas fora");
    };

    await processArenaClubSessionAsaasNotification(db, "pay1", paidPayment, processedRefOf(db), deps);

    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdId}`)!.status, "captured");
  });

  // A confirmação da vaga, o crédito da arena e o processado (com a intenção
  // de cashback) não são atômicos. A reentrega do pagamento que confirmou
  // refaz o que faltou; nada pode sair dobrado nem ser apagado.
  function creditsOf(fake: FakeFirestore): Record<string, unknown>[] {
    return arenaLedger(fake).filter((e) => e.type === "credit");
  }

  function earnEntries(fake: FakeFirestore): Record<string, unknown>[] {
    return [...fake.store.entries()]
      .filter(([path, data]) => path.startsWith("athleteWallets/uid1/ledger/") && data.type === "earn")
      .map(([, data]) => data);
  }

  async function seedAttachedHold(db: Firestore, paymentId: string): Promise<string> {
    const {holdId} = await holdCashback(db, {
      uid: "uid1", maxCents: 1000, sourceType: "club", sourceId: "club_c1_2026-07-24",
      trackingPath: PARTICIPANT_PATH, label: "Clubinho", nowMs: NOW_MS,
    });
    await attachHoldPayment(db, "uid1", holdId!, paymentId);
    return holdId!;
  }

  /** Ref cujas primeiras `n` leituras diretas ainda não veem o processado (leitura antiga). */
  function staleReads(ref: DocumentReference, n: number): DocumentReference {
    let left = n;
    return {
      ...(ref as unknown as Record<string, unknown>),
      get: async () => (left-- > 0 ?
        {exists: false, id: ref.id, ref, data: () => undefined} :
        ref.get()),
    } as unknown as DocumentReference;
  }

  /** Ref que, na 1ª leitura direta depois de o processado existir, deixa `meanwhile` rodar antes. */
  function interleaveAfterWrite(
    fake: FakeFirestore,
    ref: DocumentReference,
    meanwhile: () => Promise<void>,
  ): DocumentReference {
    let fired = false;
    return {
      ...(ref as unknown as Record<string, unknown>),
      get: async () => {
        if (!fired && fake.store.has(ref.path)) {
          fired = true;
          await meanwhile();
        }
        return ref.get();
      },
    } as unknown as DocumentReference;
  }

  it("reentrega depois de cair logo após confirmar a vaga: credita a arena e cria o ganho, uma vez só", async () => {
    // A 1ª entrega só rodou a transação de confirmação e morreu: sem crédito
    // na arena, sem processado, sem intenção de cashback.
    const {fake, db} = makeDb();
    seedSession(fake, {
      startAt: Timestamp.fromMillis(Date.UTC(2026, 6, 24, 18, 0, 0)),
      confirmedCount: 1,
      pendingCount: 0,
    });
    fake.seedDoc("appConfig/cashback", {enabled: true});
    seedSpendableLot(fake, 2000);
    const holdId = await seedAttachedHold(db, "pay1");
    seedParticipant(fake, {
      status: "confirmed", amountReais: 15, platformFeeReais: 0.75, netReais: 14.25,
      cashbackAppliedCents: 1000, cashbackHoldId: holdId,
    });
    const payment = {...paidPayment, value: 5};
    const {deps, notified} = makeDeps();

    await processArenaClubSessionAsaasNotification(db, "pay1", payment, processedRefOf(db), deps);
    // E o Asaas ainda reentrega mais uma vez.
    await processArenaClubSessionAsaasNotification(db, "pay1", payment, processedRefOf(db), deps);

    const credits = creditsOf(fake);
    assert.equal(credits.length, 1);
    assert.equal(credits[0].grossReais, 15);
    assert.equal(credits[0].cashbackAppliedReais, 10);
    assert.equal(fake.store.get("arenaWallets/arena1")!.availableReais, 14.25);

    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed.outcome, "approved");
    assert.equal(processed.cashbackStatus, "done");
    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdId}`)!.status, "captured");
    assert.equal(fake.store.get("athleteWallets/uid1/lots/old")!.remainingCents, 1000);
    // 2% dos R$ 5 em dinheiro — o saldo usado não gera ganho.
    assert.equal(earnEntries(fake).length, 1);
    assert.equal(fake.store.get("athleteWallets/uid1/lots/pay1")!.earnedCents, 10);
    assert.equal(refundEntries(fake).length, 0);

    // A vaga já estava contada; a reentrega não mexe nos contadores nem avisa de novo.
    const session = fake.store.get(SESSION_PATH)!;
    assert.equal(session.confirmedCount, 1);
    assert.equal(session.pendingCount, 0);
    assert.deepEqual(notified, []);
  });

  it("reentrega depois de cair só antes do processado: não credita a arena nem cria o ganho de novo", async () => {
    // A 1ª entrega fez tudo — confirmou, creditou o bruto, capturou a reserva,
    // criou o lote — e morreu antes de o processado ficar gravado. Devolver o
    // saldo faria a nexaGO pagar o desconto que a arena já recebeu.
    const {fake, db} = makeDb();
    seedSession(fake, {startAt: Timestamp.fromMillis(Date.UTC(2026, 6, 24, 18, 0, 0))});
    fake.seedDoc("appConfig/cashback", {enabled: true});
    seedSpendableLot(fake, 2000);
    const holdId = await seedAttachedHold(db, "pay1");
    seedParticipant(fake, {cashbackAppliedCents: 1000, cashbackHoldId: holdId});
    const payment = {...paidPayment, value: 5};

    await processArenaClubSessionAsaasNotification(db, "pay1", payment, processedRefOf(db), makeDeps().deps);
    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdId}`)!.status, "captured");
    fake.store.delete(PROCESSED_PATH);

    await processArenaClubSessionAsaasNotification(db, "pay1", payment, processedRefOf(db), makeDeps().deps);

    assert.equal(creditsOf(fake).length, 1);
    assert.equal(fake.store.get("arenaWallets/arena1")!.availableReais, 14.25);
    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed.outcome, "approved");
    assert.equal(processed.cashbackStatus, "done");
    assert.equal(earnEntries(fake).length, 1);
    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdId}`)!.status, "captured");
    assert.equal(fake.store.get("athleteWallets/uid1/lots/old")!.remainingCents, 1000);
    assert.equal(refundEntries(fake).length, 0);
  });

  for (const staleCount of [1, 2]) {
    const when = staleCount === 1 ?
      "a 2ª leu o processado antes de a 1ª gravá-lo" :
      "a 2ª não vê o processado nem ao reler";
    it(`entregas sobrepostas (${when}): a intenção da 1ª sobrevive e o ganho sai uma vez`, async () => {
      const {fake, db} = makeDb();
      seedSession(fake, {startAt: Timestamp.fromMillis(Date.UTC(2026, 6, 24, 18, 0, 0))});
      fake.seedDoc("appConfig/cashback", {enabled: true});
      seedParticipant(fake);
      const ref = processedRefOf(db);
      // A 2ª entrega roda inteira entre a 1ª gravar a intenção e aplicá-la.
      const second = () => processArenaClubSessionAsaasNotification(
        db, "pay1", paidPayment, staleReads(ref, staleCount), makeDeps().deps,
      );

      await processArenaClubSessionAsaasNotification(
        db, "pay1", paidPayment, interleaveAfterWrite(fake, ref, second), makeDeps().deps,
      );

      const processed = fake.store.get(PROCESSED_PATH)!;
      assert.equal(processed.outcome, "approved");
      assert.equal(processed.cashbackStatus, "done");
      assert.equal((processed.cashback as {earnCents?: number}).earnCents, 30);
      assert.equal(earnEntries(fake).length, 1);
      assert.equal(fake.store.get("athleteWallets/uid1/lots/pay1")!.earnedCents, 30);
      assert.equal(creditsOf(fake).length, 1);
      assert.equal(fake.store.get("arenaWallets/arena1")!.availableReais, 14.25);
      assert.equal(fake.store.get(SESSION_PATH)!.confirmedCount, 1);
    });
  }

  it("estorno sobreposto à confirmação: o processado do REFUNDED não apaga a intenção e o lote é cancelado", async () => {
    // A entrega do REFUNDED leu o processado antes de o RECEIVED gravá-lo e
    // termina depois que ele aplicou a intenção. Sobrescrever o processado com
    // o desfecho dela tiraria a intenção do caminho do estorno: o lote do
    // ganho de um pagamento devolvido ficaria pendente para sempre.
    const {fake, db} = makeDb();
    seedSession(fake, {startAt: Timestamp.fromMillis(Date.UTC(2026, 6, 24, 18, 0, 0))});
    fake.seedDoc("appConfig/cashback", {enabled: true});
    seedParticipant(fake);
    const ref = processedRefOf(db);
    const {deps} = makeDeps();
    deps.notify = async () => {
      await processArenaClubSessionAsaasNotification(
        db, "pay1", {...paidPayment, status: "REFUNDED"}, staleReads(ref, 1), makeDeps().deps,
      );
      await reverseCashbackForPayment(db, ref, "pay1", NOW_MS, {externalReference: EXTERNAL_REF});
    };

    await processArenaClubSessionAsaasNotification(db, "pay1", paidPayment, ref, deps);

    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed.outcome, "approved");
    assert.equal(processed.cashbackStatus, "reversed");
    assert.equal(fake.store.get("athleteWallets/uid1/lots/pay1")!.status, "cancelled");
  });

  it("pagamento em dobro (participante já confirmado): devolve a reserva capturada desta cobrança", async () => {
    const {fake, db} = makeDb();
    seedSession(fake);
    seedSpendableLot(fake, 2000);
    const holdId = await sweeperCapturedHold(db, "pay1");
    seedParticipant(fake, {status: "confirmed", asaasPaymentId: "payOutro"});

    await processArenaClubSessionAsaasNotification(
      db, "pay1", {...paidPayment, value: 5}, processedRefOf(db), makeDeps().deps,
    );

    assert.equal(fake.store.get(PROCESSED_PATH)!.outcome, "already_confirmed");
    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdId}`)!.status, "refunded");
    assert.equal(refundEntries(fake).length, 1);
  });

  it("pagamento em dobro reentregue, sobreposto e depois estornado: a reserva volta uma vez, sem crédito nem ganho", async () => {
    const {fake, db} = makeDb();
    seedSession(fake, {confirmedCount: 1, pendingCount: 0});
    fake.seedDoc("appConfig/cashback", {enabled: true});
    seedSpendableLot(fake, 2000);
    const holdId = await sweeperCapturedHold(db, "pay1");
    seedParticipant(fake, {status: "confirmed", asaasPaymentId: "payOutro"});
    const payment = {...paidPayment, value: 5};
    const ref = processedRefOf(db);

    await processArenaClubSessionAsaasNotification(db, "pay1", payment, ref, makeDeps().deps);
    // Entrega sobreposta (leu o processado antes de existir) e reentrega comum.
    await processArenaClubSessionAsaasNotification(db, "pay1", payment, staleReads(ref, 2), makeDeps().deps);
    await processArenaClubSessionAsaasNotification(db, "pay1", payment, ref, makeDeps().deps);
    // O estorno manual dispara o PAYMENT_REFUNDED.
    await reverseCashbackForPayment(db, ref, "pay1", NOW_MS, {externalReference: EXTERNAL_REF});

    assert.equal(fake.store.get(PROCESSED_PATH)!.outcome, "already_confirmed");
    assert.equal(fake.store.get(`athleteWallets/uid1/holds/${holdId}`)!.status, "refunded");
    assert.equal(fake.store.get("athleteWallets/uid1/lots/old")!.remainingCents, 2000);
    assert.equal(refundEntries(fake).length, 1);
    assert.equal(refundEntries(fake)[0].amountCents, 1000);
    assert.equal(creditsOf(fake).length, 0);
    assert.equal(earnEntries(fake).length, 0);
    assert.equal(fake.store.has("athleteWallets/uid1/lots/pay1"), false);
    assert.equal(fake.store.get(SESSION_PATH)!.confirmedCount, 1);
  });
});
