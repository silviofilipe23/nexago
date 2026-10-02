# Fase 0 — Split de reserva sem cobrança dupla: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao dividir o pagamento de uma reserva que já tinha PIX gerado, a cobrança da reserva inteira deixa de ficar viva — sem cobrança em dobro, sem crédito em dobro para a arena e sem a reserva dividida ser cancelada quando o PIX antigo vence.

**Architecture:** O núcleo testável `splitArenaBookingPaymentCore` ganha uma dependência injetada (`OriginalChargeOps`) para consultar e cancelar a cobrança original: consulta antes das cotas (pago → recusa), cancela depois delas (falha → desfaz as cotas). O webhook da reserva passa a ignorar qualquer evento da cobrança da reserva inteira quando a reserva já foi dividida, marcando estorno se for pagamento. No portal, "Gerar PIX" e "Dividir" passam a montar as opções de criação pela mesma função pura (com cupom). Um script só de leitura mede o estrago já feito.

**Tech Stack:** Cloud Functions v2 em TypeScript (`node:test` + `FakeFirestore`), Angular (Karma/Jasmine) no portal do atleta, script Node com `firebase-admin`.

**Spec:** `docs/superpowers/specs/2026-10-01-cashback-atleta-design.md`, seção "Fase 0 — correção do split de reserva".

## Global Constraints

- Strings e mensagens ao usuário em português; identificadores de código em inglês; comentários em português, como no resto de `functions/src`.
- `functions/tsconfig.json` tem `noUnusedLocals: true`: import ou símbolo sobrando QUEBRA o `tsc`.
- Cancelar cobrança que não pode sobreviver usa `deleteAsaasPaymentOrThrow` (propaga a falha; 404 conta como sucesso). `deleteAsaasPaymentIfOpen` só em limpeza best-effort.
- Toda `onCall` que fala com o Asaas declara `secrets` do Asaas — `splitArenaBookingPayment` já declara `splitPaymentSecrets`; não remover.
- **Worktree:** `node_modules` não existe aqui. Antes do primeiro comando de cada pasta:
  `ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/functions/node_modules /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions/node_modules`
  e o mesmo para `frontend/node_modules`. O symlink de `functions/` aparece como `??` no `git status` — **nunca** usar `git add -A`; todo commit lista os arquivos.
- **Worktree aninhado:** todo comando começa com `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/<pasta> &&` (o cwd não persiste entre chamadas). No Angular, conferir que `Output location:` contém `worktrees/` e que a contagem de specs inclui os novos.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Esta fase **não** mexe em cashback. A liberação da reserva de saldo na divisão entra na fase 1.

## Review Focus

- **Cobrança original já removida no Asaas** (o GET devolve `deleted: true`, ou 404): a divisão tem de seguir normalmente, sem tentar cancelar de novo — teste na Task 1.
- **Falha ao criar a 2ª cota**: a cobrança da 1ª cota tem de ser cancelada no Asaas, não só o doc apagado (hoje fica viva e órfã) — teste na Task 1.
- **`PAYMENT_OVERDUE`/`PAYMENT_DELETED` da cobrança substituída** numa reserva dividida: a reserva NÃO pode ser cancelada nem ter os slots apagados — teste na Task 2.
- **`RECEIVED` tardio depois de um `OVERDUE`** da mesma cobrança substituída: ainda tem de cair como `stale_charge_after_split` com `refundRequired` (o evento negativo não pode gravar "processado") — teste na Task 2.
- **Reserva sem divisão** continua confirmando no `RECEIVED` e cancelando no `OVERDUE` exatamente como hoje (a guarda não pode engolir tudo) — testes de controle na Task 2.

---

### Task 1: Divisão cancela a cobrança original sem deixar estado quebrado

**Files:**
- Modify: `functions/src/arena-booking-split.ts` (imports; tipos novos; `splitArenaBookingPaymentCore`; wrapper `splitArenaBookingPayment`)
- Test: `functions/src/arena-booking-split.test.ts`

**Interfaces:**
- Consumes: `getAsaasPayment(paymentId): Promise<AsaasPaymentDetails>`, `deleteAsaasPaymentOrThrow(paymentId): Promise<void>`, `deleteAsaasPaymentIfOpen(paymentId): Promise<void>` de `./asaas-booking-payment`; `AsaasApiError` (com `httpStatus`) de `./asaas-client`.
- Produces:
  - `export type OriginalChargeOps = { getStatus(paymentId: string): Promise<string>; cancelOrThrow(paymentId: string): Promise<void>; cancelIfOpen(paymentId: string): Promise<void> }`
  - `export function normalizeOriginalChargeStatus(payment: {status?: string; deleted?: boolean}): string` — `"DELETED"` se `deleted === true`, senão o status em maiúsculas.
  - Nova assinatura: `splitArenaBookingPaymentCore(db, callerUid, invitedByName, input, createCharge, originalCharge: OriginalChargeOps, nowMs = Date.now())`.
  - Campos novos na reserva dividida que tinha PIX: `asaasPaymentId: null`, `pixCopyPaste: null`, `supersededAsaasPaymentIds: string[]` (a Task 4 lê esse campo).

- [ ] **Step 1: Preparar o worktree**

```bash
ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/functions/node_modules /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions/node_modules
```

- [ ] **Step 2: Escrever os testes que falham**

Em `functions/src/arena-booking-split.test.ts`:

(a) No import de `./arena-booking-split`, acrescentar `normalizeOriginalChargeStatus` e `type OriginalChargeOps`:

```ts
import {
  buildArenaBookingShareExternalReference,
  expireArenaBookingPaymentShareIfDue,
  finalizeArenaBookingIfAllSharesResolved,
  normalizeOriginalChargeStatus,
  parseArenaBookingShareExternalReference,
  splitArenaBookingPaymentCore,
  validateSplitShares,
  type CreateShareChargeFn,
  type OriginalChargeOps,
} from "./arena-booking-split";
```

(b) Logo depois de `stubCreateCharge()`, acrescentar os stubs:

```ts
function stubOriginalCharge(opts: {
  status?: string;
  statusError?: Error;
  cancelError?: Error;
} = {}): {
  ops: OriginalChargeOps;
  calls: {getStatus: string[]; cancelOrThrow: string[]; cancelIfOpen: string[]};
} {
  const calls = {
    getStatus: [] as string[],
    cancelOrThrow: [] as string[],
    cancelIfOpen: [] as string[],
  };
  const ops: OriginalChargeOps = {
    getStatus: async (paymentId) => {
      calls.getStatus.push(paymentId);
      if (opts.statusError) throw opts.statusError;
      return opts.status ?? "PENDING";
    },
    cancelOrThrow: async (paymentId) => {
      calls.cancelOrThrow.push(paymentId);
      if (opts.cancelError) throw opts.cancelError;
    },
    cancelIfOpen: async (paymentId) => {
      calls.cancelIfOpen.push(paymentId);
    },
  };
  return {ops, calls};
}

/** Cria a 1ª cobrança e falha na 2ª — simula o Asaas caindo no meio da divisão. */
function createChargeFailingOnSecond(): CreateShareChargeFn {
  let counter = 0;
  return async ({athleteId}) => {
    counter += 1;
    if (counter === 2) throw new Error("asaas fora do ar");
    return {paymentId: `pay-${athleteId}-${counter}`, qrCode: "qr", qrCodeBase64: "b64"};
  };
}
```

(c) Nas **cinco** chamadas existentes de `splitArenaBookingPaymentCore` dentro de `describe("splitArenaBookingPaymentCore", ...)`, inserir `stubOriginalCharge().ops,` entre `stubCreateCharge(),` e `now,`. Exemplo da primeira:

```ts
      stubCreateCharge(),
      stubOriginalCharge().ops,
      now,
```

(d) Ao final de `describe("splitArenaBookingPaymentCore", ...)` (antes do `});` que o fecha), acrescentar:

```ts
  it("não consulta o Asaas quando a reserva não tem cobrança da reserva inteira", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1");
    const original = stubOriginalCharge();

    await splitArenaBookingPaymentCore(
      db(fake), "owner1", "Dono",
      {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
      stubCreateCharge(), original.ops, now,
    );

    assert.deepEqual(original.calls.getStatus, []);
    assert.deepEqual(original.calls.cancelOrThrow, []);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.supersededAsaasPaymentIds, undefined);
  });

  it("cancela a cobrança original aberta depois das fatias e tira ela da reserva", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1", pixCopyPaste: "qr-orig"});
    const original = stubOriginalCharge({status: "PENDING"});

    const result = await splitArenaBookingPaymentCore(
      db(fake), "owner1", "Dono",
      {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
      stubCreateCharge(), original.ops, now,
    );

    assert.equal(result.shareIds.length, 2);
    assert.deepEqual(original.calls.getStatus, ["orig1"]);
    assert.deepEqual(original.calls.cancelOrThrow, ["orig1"]);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.asaasPaymentId, null);
    assert.equal(booking.pixCopyPaste, null);
    assert.deepEqual(booking.supersededAsaasPaymentIds, ["orig1"]);
    assert.equal(booking.paymentStatus, "split_pending");
  });

  it("recusa dividir quando o PIX da reserva inteira já foi pago", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({status: "RECEIVED"});
    let chargesCreated = 0;
    const countingCharge: CreateShareChargeFn = async (p) => {
      chargesCreated += 1;
      return stubCreateCharge()(p);
    };

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
        countingCharge, original.ops, now,
      ),
      "failed-precondition",
    );

    assert.equal(chargesCreated, 0);
    assert.deepEqual(original.calls.cancelOrThrow, []);
    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.status, "pending_payment");
    assert.equal(booking.asaasPaymentId, "orig1");
  });

  it("cobrança original já removida no Asaas não bloqueia a divisão", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({status: "DELETED"});

    await splitArenaBookingPaymentCore(
      db(fake), "owner1", "Dono",
      {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
      stubCreateCharge(), original.ops, now,
    );

    assert.deepEqual(original.calls.cancelOrThrow, []);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.asaasPaymentId, null);
    assert.deepEqual(booking.supersededAsaasPaymentIds, ["orig1"]);
  });

  it("falha ao consultar a cobrança original recusa com unavailable e não cria fatias", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({statusError: new Error("timeout")});

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 100}]},
        stubCreateCharge(), original.ops, now,
      ),
      "unavailable",
    );

    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
  });

  it("falha ao cancelar a original desfaz as fatias (Asaas e docs) e deixa a reserva intacta", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({status: "PENDING", cancelError: new Error("asaas 500")});

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
        stubCreateCharge(), original.ops, now,
      ),
      "unavailable",
    );

    assert.deepEqual(original.calls.cancelIfOpen.sort(), ["pay-a-1", "pay-b-2"]);
    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
    const booking = fake.store.get("arenaBookings/b1")!;
    assert.equal(booking.status, "pending_payment");
    assert.equal(booking.asaasPaymentId, "orig1");
    assert.equal(booking.hasSplitShares, undefined);
  });

  it("falha na 2ª fatia cancela no Asaas a cobrança da 1ª e não toca na original", async () => {
    const fake = new FakeFirestore();
    seedPendingPixBooking(fake, "b1", {asaasPaymentId: "orig1"});
    const original = stubOriginalCharge({status: "PENDING"});

    await assertHttpsError(
      splitArenaBookingPaymentCore(
        db(fake), "owner1", "Dono",
        {bookingId: "b1", shares: [{athleteId: "a", amountReais: 40}, {athleteId: "b", amountReais: 60}]},
        createChargeFailingOnSecond(), original.ops, now,
      ),
      "internal",
    );

    assert.deepEqual(original.calls.cancelIfOpen, ["pay-a-1"]);
    assert.deepEqual(original.calls.cancelOrThrow, []);
    const sharesSnap = await fake.collection("arenaBookings/b1/paymentShares").get();
    assert.equal(sharesSnap.docs.length, 0);
    assert.equal(fake.store.get("arenaBookings/b1")!.asaasPaymentId, "orig1");
  });
```

(e) Depois de `describe("splitArenaBookingPaymentCore", ...)`, acrescentar:

```ts
describe("normalizeOriginalChargeStatus", () => {
  it("devolve DELETED para cobrança removida, mesmo com status antigo", () => {
    assert.equal(normalizeOriginalChargeStatus({status: "PENDING", deleted: true}), "DELETED");
  });

  it("devolve o status em maiúsculas quando a cobrança existe", () => {
    assert.equal(normalizeOriginalChargeStatus({status: "received"}), "RECEIVED");
    assert.equal(normalizeOriginalChargeStatus({}), "");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc`
Expected: FAIL de compilação — `Module '"./arena-booking-split"' has no exported member 'normalizeOriginalChargeStatus'` (e `OriginalChargeOps`).

- [ ] **Step 4: Implementar o núcleo**

Em `functions/src/arena-booking-split.ts`:

(a) Trocar o import de `./asaas-booking-payment` por:

```ts
import {
  createAsaasPixCharge,
  deleteAsaasPaymentIfOpen,
  deleteAsaasPaymentOrThrow,
  getAsaasPayment,
} from "./asaas-booking-payment";
```

(b) Logo depois de `export type CreateShareChargeFn = ...;` acrescentar:

```ts
/** Status Asaas em que a cobrança da reserva inteira já recebeu — dividir cobraria duas vezes. */
const ORIGINAL_CHARGE_PAID_STATUSES = new Set(["RECEIVED", "RECEIVED_IN_CASH", "CONFIRMED"]);
const ORIGINAL_CHARGE_GONE_STATUS = "DELETED";

/**
 * Operações sobre a cobrança PIX da reserva inteira — a que
 * `createArenaBookingPixPayment` gerou antes de o atleta escolher dividir.
 * Injetadas (como `createCharge`) para testar sem o Asaas.
 */
export type OriginalChargeOps = {
  /** Status normalizado por `normalizeOriginalChargeStatus`; `DELETED` se já não existe. */
  getStatus: (paymentId: string) => Promise<string>;
  /** Cancela e PROPAGA a falha: a divisão não pode seguir com a original viva. */
  cancelOrThrow: (paymentId: string) => Promise<void>;
  /** Cancela sem propagar: limpeza das cobranças das fatias num rollback. */
  cancelIfOpen: (paymentId: string) => Promise<void>;
};

/** `DELETED` para cobrança removida (o GET do Asaas ainda a devolve, com `deleted: true`). */
export function normalizeOriginalChargeStatus(
  payment: {status?: string; deleted?: boolean},
): string {
  if (payment.deleted === true) return ORIGINAL_CHARGE_GONE_STATUS;
  return (payment.status || "").trim().toUpperCase();
}
```

(c) Substituir a função `splitArenaBookingPaymentCore` inteira por:

```ts
/**
 * Lógica principal do callable (sem I/O de push — o wrapper entrega as
 * notificações retornadas). `createCharge` e `originalCharge` são injetados
 * para permitir teste sem chamar o Asaas de verdade.
 */
export async function splitArenaBookingPaymentCore(
  db: Firestore,
  callerUid: string,
  invitedByName: string,
  input: {bookingId?: unknown; shares?: unknown},
  createCharge: CreateShareChargeFn,
  originalCharge: OriginalChargeOps,
  nowMs: number = Date.now(),
): Promise<SplitArenaBookingPaymentResult> {
  const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
  if (!bookingId) {
    throw new HttpsError("invalid-argument", "bookingId é obrigatório.");
  }

  const bookingRef = db.collection(ARENA_BOOKINGS).doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    throw new HttpsError("not-found", "Reserva não encontrada.");
  }
  const booking = bookingSnap.data() as Record<string, unknown>;

  assertBookingOwnerForSplit(callerUid, booking);

  const sharesCol = bookingRef.collection(PAYMENT_SHARES);
  const existingSnap = await sharesCol.limit(1).get();
  if (!existingSnap.empty) {
    throw new HttpsError(
      "failed-precondition",
      "Esta reserva já tem uma divisão de pagamento em andamento.",
    );
  }

  const expectedTotal = Number(booking.amountToPayNowReais) || 0;
  if (expectedTotal <= 0) {
    throw new HttpsError("failed-precondition", "Reserva sem valor pendente para dividir.");
  }

  const shares = validateSplitShares(input.shares, expectedTotal);

  const deadline = booking.confirmationDeadline instanceof Timestamp ?
    booking.confirmationDeadline.toDate() :
    null;
  if (!deadline || deadline.getTime() - nowMs < MIN_MINUTES_UNTIL_DEADLINE * 60 * 1000) {
    throw new HttpsError(
      "failed-precondition",
      "Está muito perto do horário da reserva para dividir o pagamento com amigos.",
    );
  }

  // A reserva pode já ter o PIX da reserva inteira (o atleta gerou o QR, voltou e
  // escolheu dividir). Pago → dividir cobraria duas vezes. Aberto → é cancelado
  // DEPOIS das fatias, para que qualquer falha deixe a reserva como estava.
  const originalPaymentId = typeof booking.asaasPaymentId === "string" ?
    booking.asaasPaymentId.trim() :
    "";
  let originalStillOpen = false;
  if (originalPaymentId) {
    let originalStatus: string;
    try {
      originalStatus = await originalCharge.getStatus(originalPaymentId);
    } catch (e) {
      logger.error(
        `splitArenaBookingPayment: falha ao consultar a cobrança original ${originalPaymentId}`,
        e,
      );
      throw new HttpsError(
        "unavailable",
        "Não foi possível conferir o PIX desta reserva. Tente novamente.",
      );
    }
    if (ORIGINAL_CHARGE_PAID_STATUSES.has(originalStatus)) {
      throw new HttpsError(
        "failed-precondition",
        "O PIX desta reserva já foi pago. Não é possível dividir o pagamento.",
      );
    }
    originalStillOpen = originalStatus !== ORIGINAL_CHARGE_GONE_STATUS;
  }

  const arenaName = (booking.arenaName as string) || "Arena";
  const courtName = (booking.courtName as string) || "Quadra";
  const dateLabel = (booking.date as string) || "";
  const startTime = (booking.startTime as string) || "";

  const shareIds: string[] = [];
  const createdRefs: DocumentReference[] = [];
  const createdPaymentIds: string[] = [];
  const notifications: SplitNotification[] = [];

  // Desfaz as fatias já criadas: cancela as cobranças delas no Asaas (sem isso
  // ficam vivas, sem doc que o webhook ache) e apaga os docs, para a checagem de
  // "já tem split" acima não bloquear uma nova tentativa.
  const rollbackShares = async (): Promise<void> => {
    for (const paymentId of createdPaymentIds) {
      try {
        await originalCharge.cancelIfOpen(paymentId);
      } catch (cleanupErr) {
        logger.error(
          `splitArenaBookingPayment: falha ao cancelar a cobrança da fatia ${paymentId}`,
          cleanupErr,
        );
      }
    }
    for (const ref of createdRefs) {
      try {
        await ref.delete();
      } catch (cleanupErr) {
        logger.error("splitArenaBookingPayment: falha ao limpar fatia após erro", cleanupErr);
      }
    }
  };

  try {
    for (const share of shares) {
      const shareRef = sharesCol.doc();
      const charge = await createCharge({
        athleteId: share.athleteId,
        amountReais: share.amountReais,
        bookingId,
        shareId: shareRef.id,
        description: `Sua parte da reserva ${arenaName} — ${courtName}`,
        dueDate: deadline,
      });
      createdPaymentIds.push(charge.paymentId);

      await shareRef.set({
        payerAthleteId: share.athleteId,
        amountReais: share.amountReais,
        status: "pending" as ArenaBookingPaymentShareStatus,
        asaasPaymentId: charge.paymentId,
        pixCopyPaste: charge.qrCode,
        qrCodeBase64: charge.qrCodeBase64,
        expiresAt: Timestamp.fromDate(deadline),
        createdBy: callerUid,
        createdAt: FieldValue.serverTimestamp(),
      });

      createdRefs.push(shareRef);
      shareIds.push(shareRef.id);

      if (share.athleteId !== callerUid) {
        notifications.push({
          userId: share.athleteId,
          title: "Você foi convidado a pagar sua parte",
          body: `${invitedByName} te chamou pra jogar em ${arenaName} (${courtName})` +
            `${dateLabel ? ` · ${dateLabel}` : ""}${startTime ? ` ${startTime}` : ""}. ` +
            `Sua parte: R$ ${share.amountReais.toFixed(2)}.`,
          type: "arena_booking_share_payment_pending",
          data: {
            bookingId,
            shareId: shareRef.id,
            amountReais: String(share.amountReais),
            url: `/reservas/${bookingId}/parcela/${shareRef.id}`,
          },
        });
      }
    }
  } catch (e) {
    await rollbackShares();
    if (e instanceof HttpsError) throw e;
    logger.error("splitArenaBookingPayment: falha ao criar cobrança de fatia", e);
    throw new HttpsError(
      "internal",
      "Não foi possível preparar a divisão de pagamento. Tente novamente.",
    );
  }

  if (originalStillOpen) {
    try {
      await originalCharge.cancelOrThrow(originalPaymentId);
    } catch (e) {
      logger.error(
        `splitArenaBookingPayment: falha ao cancelar a cobrança original ${originalPaymentId}`,
        e,
      );
      await rollbackShares();
      throw new HttpsError(
        "unavailable",
        "Não foi possível cancelar o PIX anterior desta reserva. Tente novamente.",
      );
    }
  }

  const previousSuperseded = Array.isArray(booking.supersededAsaasPaymentIds) ?
    (booking.supersededAsaasPaymentIds as unknown[])
      .filter((v): v is string => typeof v === "string") :
    [];

  await bookingRef.set({
    hasSplitShares: true,
    splitShareCount: shares.length,
    status: "confirmed",
    paymentStatus: "split_pending",
    ...(originalPaymentId ? {
      asaasPaymentId: null,
      pixCopyPaste: null,
      supersededAsaasPaymentIds: [...previousSuperseded, originalPaymentId],
    } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  return {bookingId, shareIds, notifications};
}
```

- [ ] **Step 5: Ligar o wrapper ao Asaas**

Ainda em `functions/src/arena-booking-split.ts`, no `splitArenaBookingPayment`, logo antes de `const result = await splitArenaBookingPaymentCore(`, acrescentar:

```ts
  const originalCharge: OriginalChargeOps = {
    getStatus: async (paymentId) => {
      try {
        return normalizeOriginalChargeStatus(await getAsaasPayment(paymentId));
      } catch (e) {
        if (e instanceof AsaasApiError && e.httpStatus === 404) return "DELETED";
        throw e;
      }
    },
    cancelOrThrow: deleteAsaasPaymentOrThrow,
    cancelIfOpen: deleteAsaasPaymentIfOpen,
  };
```

e passar `originalCharge` como sexto argumento:

```ts
  const result = await splitArenaBookingPaymentCore(
    getFirestore(),
    callerUid,
    invitedByName,
    (request.data ?? {}) as {bookingId?: unknown; shares?: unknown},
    createCharge,
    originalCharge,
  );
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/arena-booking-split.test.js`
Expected: PASS — todos os testes do arquivo, incluindo os 9 novos (7 do núcleo + 2 de `normalizeOriginalChargeStatus`), `# fail 0`.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/src/arena-booking-split.ts functions/src/arena-booking-split.test.ts && git commit -m "fix(reserva): divisão cancela o PIX da reserva inteira

Antes, dividir uma reserva que já tinha PIX gerado deixava a cobrança
original viva: pagar o QR antigo cobrava e creditava em dobro, e o
vencimento dela cancelava a reserva dividida. Agora a divisão recusa se a
original já foi paga, cancela a original depois de criar as fatias e, se
o cancelamento falhar, desfaz as fatias (inclusive as cobranças no Asaas).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Webhook ignora a cobrança substituída de reserva dividida

**Files:**
- Modify: `functions/src/asaas-arena-booking-webhook.ts` (função `processArenaBookingAsaasNotification`, logo após `const booking = bookingSnap.data()!;`)
- Create: `functions/src/asaas-arena-booking-webhook.test.ts`

**Interfaces:**
- Consumes: `processArenaBookingAsaasNotification(db, paymentId, payment, processedRef)` (assinatura atual, inalterada); `ARENA_BOOKING_PAYMENT_REF_PREFIX` (`"arenaBooking:"`); `FakeFirestore`.
- Produces: `asaas_processed_payments/{paymentId}` com `outcome: "stale_charge_after_split"`, `refundRequired: true`, `paidValue: number`, `asaasPaymentStatus` — a Task 4 lê `outcome`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `functions/src/asaas-arena-booking-webhook.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {DocumentReference, Firestore} from "firebase-admin/firestore";
import {FakeFirestore, type DocData} from "./fake-firestore.test-helper";
import {processArenaBookingAsaasNotification} from "./asaas-arena-booking-webhook";
import {ARENA_BOOKING_PAYMENT_REF_PREFIX} from "./arena-booking-payment-constants";

const BOOKING_PATH = "arenaBookings/b1";
const PROCESSED_PATH = "artifacts/p/public/data/asaas_processed_payments/orig1";

function makeDb(): {fake: FakeFirestore; db: Firestore} {
  const fake = new FakeFirestore();
  return {fake, db: fake as unknown as Firestore};
}

function processedRefOf(db: Firestore): DocumentReference {
  return db.doc(PROCESSED_PATH) as DocumentReference;
}

function bookingPayment(status: string, value = 100) {
  return {status, value, externalReference: `${ARENA_BOOKING_PAYMENT_REF_PREFIX}b1`};
}

/** Reserva dividida antes da correção: a cobrança da reserva inteira ficou registrada nela. */
function seedSplitBooking(fake: FakeFirestore, overrides: DocData = {}): void {
  fake.seedDoc("arenas/arena1", {name: "Arena X"});
  fake.seedDoc(BOOKING_PATH, {
    athleteId: "owner1",
    arenaId: "arena1",
    paymentChannel: "pix",
    status: "confirmed",
    paymentStatus: "split_pending",
    hasSplitShares: true,
    splitShareCount: 2,
    amountReais: 100,
    amountToPayNowReais: 100,
    amountDueOnsiteReais: 0,
    paymentFraction: 1,
    asaasPaymentId: "orig1",
    ...overrides,
  });
}

function seedPendingBooking(fake: FakeFirestore): void {
  fake.seedDoc("arenas/arena1", {name: "Arena X"});
  fake.seedDoc(BOOKING_PATH, {
    athleteId: "owner1",
    arenaId: "arena1",
    paymentChannel: "pix",
    status: "pending_payment",
    paymentStatus: "pending",
    amountReais: 100,
    amountToPayNowReais: 100,
    amountDueOnsiteReais: 0,
    paymentFraction: 1,
    asaasPaymentId: "orig1",
  });
}

describe("processArenaBookingAsaasNotification — reserva dividida", () => {
  it("pagamento da cobrança substituída não confirma, não credita e marca estorno", async () => {
    const {fake, db} = makeDb();
    seedSplitBooking(fake);

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED"), processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.paymentStatus, "split_pending");
    assert.equal(booking.amountPaidOnlineReais, undefined);
    assert.equal(fake.store.has("arenaWallets/arena1"), false);

    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed.outcome, "stale_charge_after_split");
    assert.equal(processed.refundRequired, true);
    assert.equal(processed.paidValue, 100);
  });

  for (const status of ["OVERDUE", "DELETED"]) {
    it(`${status} da cobrança substituída não cancela a reserva nem grava processado`, async () => {
      const {fake, db} = makeDb();
      seedSplitBooking(fake);

      await processArenaBookingAsaasNotification(
        db, "orig1", bookingPayment(status), processedRefOf(db),
      );

      const booking = fake.store.get(BOOKING_PATH)!;
      assert.equal(booking.status, "confirmed");
      assert.equal(booking.paymentStatus, "split_pending");
      assert.equal(booking.cancelledAt, undefined);
      assert.equal(fake.store.has(PROCESSED_PATH), false);
    });
  }

  it("RECEIVED tardio depois de OVERDUE ainda cai como estorno", async () => {
    const {fake, db} = makeDb();
    seedSplitBooking(fake);

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("OVERDUE"), processedRefOf(db),
    );
    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED"), processedRefOf(db),
    );

    const processed = fake.store.get(PROCESSED_PATH)!;
    assert.equal(processed.outcome, "stale_charge_after_split");
    assert.equal(processed.refundRequired, true);
    assert.equal(fake.store.get(BOOKING_PATH)!.status, "confirmed");
  });
});

describe("processArenaBookingAsaasNotification — reserva sem divisão (controle)", () => {
  it("RECEIVED confirma a reserva e credita a arena como antes", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake);

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("RECEIVED"), processedRefOf(db),
    );

    const booking = fake.store.get(BOOKING_PATH)!;
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.paymentStatus, "paid");
    assert.equal(fake.store.get(PROCESSED_PATH)!.outcome, "approved");
    assert.equal(fake.store.has("arenaWallets/arena1"), true);
  });

  it("OVERDUE cancela a reserva pendente como antes", async () => {
    const {fake, db} = makeDb();
    seedPendingBooking(fake);

    await processArenaBookingAsaasNotification(
      db, "orig1", bookingPayment("OVERDUE"), processedRefOf(db),
    );

    assert.equal(fake.store.get(BOOKING_PATH)!.status, "cancelled");
    assert.equal(fake.store.get(PROCESSED_PATH)!.outcome, "rejected");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/asaas-arena-booking-webhook.test.js`
Expected: FAIL nos 4 testes de "reserva dividida" (o pagamento confirma e marca `paid`; o `OVERDUE` cancela a reserva). Os 2 de controle passam.

- [ ] **Step 3: Implementar a guarda**

Em `functions/src/asaas-arena-booking-webhook.ts`, dentro de `processArenaBookingAsaasNotification`, logo depois de `const booking = bookingSnap.data()!;` e antes de `if (ASAAS_PAID_STATUSES.has(status)) {`, inserir:

```ts
  // Reserva dividida: o pagamento passou para as fatias (`arenaBookingShare:`) e a
  // cobrança da reserva inteira foi substituída. Ela ainda pode chegar aqui —
  // divisão feita antes da correção que cancela a original, ou corrida entre a
  // consulta e o cancelamento. Pago: confirmar e creditar seria cobrança em dobro,
  // então só marca para estorno. Negativo (vencida/removida): não cancela a reserva
  // que as fatias estão pagando, e NÃO grava "processado", para um RECEIVED tardio
  // da mesma cobrança ainda cair aqui como estorno.
  if (booking.hasSplitShares === true) {
    if (ASAAS_PAID_STATUSES.has(status)) {
      const paidValue = roundMoney(Number(payment.value) || 0);
      logger.error(
        `Asaas arena booking ${bookingId}: pagamento ${paymentId} da cobrança ` +
        "substituída pela divisão — estorno necessário",
        {paidValue},
      );
      await processedRef.set({
        kind: "arenaBooking",
        bookingId,
        outcome: "stale_charge_after_split",
        refundRequired: true,
        paidValue,
        asaasPaymentStatus: status,
        processedAt: FieldValue.serverTimestamp(),
      });
      return;
    }
    logger.info(
      `Asaas arena booking ${bookingId}: evento ${status} da cobrança ${paymentId} ` +
      "substituída pela divisão — ignorado",
    );
    return;
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npx tsc && node --test lib/asaas-arena-booking-webhook.test.js`
Expected: PASS — 6 testes, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/src/asaas-arena-booking-webhook.ts functions/src/asaas-arena-booking-webhook.test.ts && git commit -m "fix(reserva): webhook ignora a cobrança substituída de reserva dividida

Pagamento da cobrança da reserva inteira numa reserva já dividida não
confirma nem credita a arena: marca refundRequired. Vencimento ou remoção
dela não cancela mais a reserva que as fatias estão pagando.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Portal — divisão leva o cupom

**Files:**
- Create: `frontend/projects/athlete/src/app/reservar/pix-booking-create-options.ts`
- Create: `frontend/projects/athlete/src/app/reservar/pix-booking-create-options.spec.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-payment.component.ts` (`generatePix` e `submitSplit`, chamadas a `createArenaBooking`; imports)

**Interfaces:**
- Consumes: `ArenaBookingPaymentMode` de `../data/arena-bookings-repository` (`'onsite' | 'pix'`).
- Produces: `pixBookingCreateOptions(input: {totalPriceReais: number; pixFraction: number; couponCode: string | null}): PixBookingCreateOptions`, em que `PixBookingCreateOptions = {clientAmountReais: number; paymentMode: ArenaBookingPaymentMode; paymentFraction: number; couponCode?: string}`.

- [ ] **Step 1: Preparar o worktree**

```bash
ln -sfn /Users/silviodionizio/Documents/projects/volley/nexago/frontend/node_modules /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend/node_modules
```

- [ ] **Step 2: Escrever o spec que falha**

Criar `frontend/projects/athlete/src/app/reservar/pix-booking-create-options.spec.ts`:

```ts
import { pixBookingCreateOptions } from './pix-booking-create-options';

describe('pixBookingCreateOptions', () => {
  it('leva o cupom aplicado — a divisão esquecia e a soma das fatias não batia', () => {
    const opts = pixBookingCreateOptions({ totalPriceReais: 90, pixFraction: 1, couponCode: 'AREIA10' });
    expect(opts).toEqual({
      clientAmountReais: 90,
      paymentMode: 'pix',
      paymentFraction: 1,
      couponCode: 'AREIA10',
    });
  });

  it('não manda couponCode quando não há cupom aplicado', () => {
    const opts = pixBookingCreateOptions({ totalPriceReais: 100, pixFraction: 0.5, couponCode: null });
    expect('couponCode' in opts).toBeFalse();
    expect(opts.paymentFraction).toBe(0.5);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/pix-booking-create-options.spec.ts'`
Expected: FAIL de compilação — `Cannot find module './pix-booking-create-options'`.

- [ ] **Step 4: Implementar**

Criar `frontend/projects/athlete/src/app/reservar/pix-booking-create-options.ts`:

```ts
import type { ArenaBookingPaymentMode } from '../data/arena-bookings-repository';

export type PixBookingCreateOptions = {
  clientAmountReais: number;
  paymentMode: ArenaBookingPaymentMode;
  paymentFraction: number;
  couponCode?: string;
};

/** Opções de `createArenaBooking` para reserva paga por PIX — as MESMAS para "Gerar PIX" e
 *  "Dividir com amigos". Quando cada caminho montava a sua, a divisão esqueceu o cupom: a reserva
 *  nascia sem desconto e a soma das fatias (feita sobre o total com desconto) não batia. */
export function pixBookingCreateOptions(input: {
  totalPriceReais: number;
  pixFraction: number;
  couponCode: string | null;
}): PixBookingCreateOptions {
  return {
    clientAmountReais: input.totalPriceReais,
    paymentMode: 'pix',
    paymentFraction: input.pixFraction,
    ...(input.couponCode ? { couponCode: input.couponCode } : {}),
  };
}
```

Em `arena-payment.component.ts`, acrescentar o import junto dos outros de `./`/`../`:

```ts
import { pixBookingCreateOptions } from './pix-booking-create-options';
```

Em `generatePix`, trocar:

```ts
          await createArenaBooking(athleteFunctions(), args, {
            clientAmountReais: this.totalPrice(),
            paymentMode: 'pix',
            paymentFraction: this.pixFraction(),
            couponCode: this.appliedCouponCode() ?? undefined,
          })
```

por:

```ts
          await createArenaBooking(athleteFunctions(), args, this.pixBookingOptions())
```

Em `submitSplit`, trocar:

```ts
          await createArenaBooking(athleteFunctions(), args, {
            clientAmountReais: this.totalPrice(),
            paymentMode: 'pix',
            paymentFraction: this.pixFraction(),
          })
```

por:

```ts
          await createArenaBooking(athleteFunctions(), args, this.pixBookingOptions())
```

E acrescentar o método na classe, logo antes de `protected async generatePix()`:

```ts
  private pixBookingOptions() {
    return pixBookingCreateOptions({
      totalPriceReais: this.totalPrice(),
      pixFraction: this.pixFraction(),
      couponCode: this.appliedCouponCode(),
    });
  }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng test athlete --watch=false --browsers=ChromeHeadless --include='**/pix-booking-create-options.spec.ts'`
Expected: PASS — `Executed 2 of 2 SUCCESS`. (Se a contagem não for 2, o Karma está rodando a árvore errada — ver Global Constraints.)

- [ ] **Step 6: Build de produção**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/frontend && npx ng build athlete --configuration production`
Expected: build concluído sem erro, e `Output location:` contendo `worktrees/nexago-athlete-cashback-system-3c7002`.

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add frontend/projects/athlete/src/app/reservar/pix-booking-create-options.ts frontend/projects/athlete/src/app/reservar/pix-booking-create-options.spec.ts frontend/projects/athlete/src/app/reservar/arena-payment.component.ts && git commit -m "fix(portal-atleta): divisão de reserva leva o cupom aplicado

Gerar PIX e Dividir com amigos passam a montar as opções de
createArenaBooking pela mesma função. A divisão criava a reserva sem o
cupom e a soma das fatias, feita sobre o total com desconto, não batia.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Script de auditoria das divisões já feitas

**Files:**
- Create: `functions/scripts/lib/split-superseded-audit.js`
- Create: `functions/scripts/audit-split-superseded-charges.js`
- Create: `functions/test/split-superseded-audit.test.mjs`
- Modify: `functions/package.json` (script `test`: acrescentar `test/split-superseded-audit.test.mjs` ao fim da lista)

**Interfaces:**
- Consumes: campos `hasSplitShares`, `asaasPaymentId`, `supersededAsaasPaymentIds` (Task 1), `status` da reserva; `outcome` de `asaas_processed_payments` (`approved`, `rejected`, `stale_charge_after_split` da Task 2).
- Produces: `originalPaymentIdOf(booking): string | null` e `classifySplitBooking({booking, originalPaymentId, originalProcessed}): "clean" | "superseded_ok" | "legacy_original_open" | "double_paid" | "stale_paid_refund_required" | "cancelled_by_stale_charge"`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/test/split-superseded-audit.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createRequire } from 'node:module';

/**
 * Classificação das reservas divididas pelo destino da cobrança da reserva inteira.
 * É o que diz ao dono quem pagou em dobro (estorno) e quem teve a reserva dividida
 * cancelada pelo vencimento do PIX antigo — antes de qualquer decisão de reembolso.
 */

const require = createRequire(import.meta.url);
const { classifySplitBooking, originalPaymentIdOf } = require('../scripts/lib/split-superseded-audit.js');

describe('originalPaymentIdOf', () => {
  test('divisão antiga: a original ficou em asaasPaymentId', () => {
    assert.equal(originalPaymentIdOf({ asaasPaymentId: ' orig1 ' }), 'orig1');
  });

  test('divisão corrigida: a original está em supersededAsaasPaymentIds (a última)', () => {
    assert.equal(
      originalPaymentIdOf({ asaasPaymentId: null, supersededAsaasPaymentIds: ['old', 'orig2'] }),
      'orig2',
    );
  });

  test('sem cobrança da reserva inteira', () => {
    assert.equal(originalPaymentIdOf({}), null);
  });
});

describe('classifySplitBooking', () => {
  test('clean: divisão sem PIX prévio', () => {
    assert.equal(classifySplitBooking({ booking: {}, originalPaymentId: null, originalProcessed: null }), 'clean');
  });

  test('double_paid: a original foi aprovada pelo webhook antigo', () => {
    assert.equal(
      classifySplitBooking({
        booking: { asaasPaymentId: 'orig1', status: 'confirmed' },
        originalPaymentId: 'orig1',
        originalProcessed: { outcome: 'approved' },
      }),
      'double_paid',
    );
  });

  test('stale_paid_refund_required: a guarda nova pegou o pagamento', () => {
    assert.equal(
      classifySplitBooking({
        booking: { asaasPaymentId: null, supersededAsaasPaymentIds: ['orig1'] },
        originalPaymentId: 'orig1',
        originalProcessed: { outcome: 'stale_charge_after_split' },
      }),
      'stale_paid_refund_required',
    );
  });

  test('cancelled_by_stale_charge: o vencimento da original cancelou a reserva dividida', () => {
    assert.equal(
      classifySplitBooking({
        booking: { asaasPaymentId: 'orig1', status: 'cancelled' },
        originalPaymentId: 'orig1',
        originalProcessed: { outcome: 'rejected' },
      }),
      'cancelled_by_stale_charge',
    );
  });

  test('legacy_original_open: divisão antiga, original sem desfecho registrado', () => {
    assert.equal(
      classifySplitBooking({
        booking: { asaasPaymentId: 'orig1', status: 'confirmed' },
        originalPaymentId: 'orig1',
        originalProcessed: null,
      }),
      'legacy_original_open',
    );
  });

  test('superseded_ok: divisão corrigida, original cancelada sem pagamento', () => {
    assert.equal(
      classifySplitBooking({
        booking: { asaasPaymentId: null, supersededAsaasPaymentIds: ['orig1'], status: 'confirmed' },
        originalPaymentId: 'orig1',
        originalProcessed: null,
      }),
      'superseded_ok',
    );
  });
});
```

E em `functions/package.json`, no fim do valor de `"test"`, acrescentar ` test/split-superseded-audit.test.mjs` (depois de `test/merge-pair-teams-plan.test.mjs`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && node --test test/split-superseded-audit.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/lib/split-superseded-audit.js'`.

- [ ] **Step 3: Implementar a lógica pura**

Criar `functions/scripts/lib/split-superseded-audit.js`:

```js
/* eslint-disable */
/**
 * Lógica pura de `audit-split-superseded-charges.js`: de qual cobrança da reserva
 * inteira (a "original") cada reserva dividida veio, e o que aconteceu com ela.
 */

/** A original: `asaasPaymentId` nas divisões antigas, a última de `supersededAsaasPaymentIds` nas corrigidas. */
function originalPaymentIdOf(booking) {
  if (typeof booking.asaasPaymentId === 'string' && booking.asaasPaymentId.trim()) {
    return booking.asaasPaymentId.trim();
  }
  const superseded = Array.isArray(booking.supersededAsaasPaymentIds) ?
    booking.supersededAsaasPaymentIds.filter((v) => typeof v === 'string' && v.trim()) :
    [];
  return superseded.length ? superseded[superseded.length - 1].trim() : null;
}

function classifySplitBooking({ booking, originalPaymentId, originalProcessed }) {
  if (!originalPaymentId) return 'clean';
  const outcome = originalProcessed ? originalProcessed.outcome : null;
  if (outcome === 'approved') return 'double_paid';
  if (outcome === 'stale_charge_after_split') return 'stale_paid_refund_required';
  if (outcome === 'rejected' && String(booking.status || '').toLowerCase() === 'cancelled') {
    return 'cancelled_by_stale_charge';
  }
  const legacy = typeof booking.asaasPaymentId === 'string' && booking.asaasPaymentId.trim() !== '';
  return legacy ? 'legacy_original_open' : 'superseded_ok';
}

module.exports = { classifySplitBooking, originalPaymentIdOf };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && node --test test/split-superseded-audit.test.mjs`
Expected: PASS — 9 testes, `# fail 0`.

- [ ] **Step 5: Escrever o script (só leitura)**

Criar `functions/scripts/audit-split-superseded-charges.js`:

```js
/* eslint-disable */
/**
 * Auditoria SÓ DE LEITURA das reservas divididas: quem pagou a cobrança da reserva
 * inteira depois de dividir (pagou em dobro → estorno) e quem teve a reserva dividida
 * cancelada pelo vencimento do PIX antigo. Nada é gravado.
 *
 * Pré-requisitos (credenciais admin):
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/audit-split-superseded-charges.js --project <projectId>
 */

const admin = require('firebase-admin');
const { classifySplitBooking, originalPaymentIdOf } = require('./lib/split-superseded-audit');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const projectId = argValue('--project') || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error('Informe o projeto: --project <projectId>');
  process.exit(1);
}

admin.initializeApp({ projectId });
const db = admin.firestore();

const ATTENTION = new Set(['double_paid', 'stale_paid_refund_required', 'cancelled_by_stale_charge', 'legacy_original_open']);

async function main() {
  const snap = await db.collection('arenaBookings').where('hasSplitShares', '==', true).get();
  const counts = {};
  const rows = [];

  for (const doc of snap.docs) {
    const booking = doc.data();
    const originalPaymentId = originalPaymentIdOf(booking);
    let originalProcessed = null;
    if (originalPaymentId) {
      const processed = await db
        .doc(`artifacts/${projectId}/public/data/asaas_processed_payments/${originalPaymentId}`)
        .get();
      originalProcessed = processed.exists ? processed.data() : null;
    }
    const kind = classifySplitBooking({ booking, originalPaymentId, originalProcessed });
    counts[kind] = (counts[kind] || 0) + 1;
    if (ATTENTION.has(kind)) {
      rows.push({
        kind,
        bookingId: doc.id,
        arenaId: booking.arenaId || '',
        athleteId: booking.athleteId || '',
        date: booking.date || '',
        startTime: booking.startTime || '',
        status: booking.status || '',
        originalPaymentId,
        amountToPayNowReais: booking.amountToPayNowReais ?? null,
      });
    }
  }

  console.log(`Projeto ${projectId}: ${snap.size} reservas divididas`);
  console.log(counts);
  if (rows.length) console.table(rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 6: Rodar contra o DEV (só leitura)**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && node scripts/audit-split-superseded-charges.js --project volley-track-dev-4596c`
Expected: imprime o total de reservas divididas e a contagem por classe; a tabela lista só as que pedem atenção. Guardar a saída para a descrição do PR. **Não rodar no PROD sem o dono pedir.**

- [ ] **Step 7: Commit**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git add functions/scripts/lib/split-superseded-audit.js functions/scripts/audit-split-superseded-charges.js functions/test/split-superseded-audit.test.mjs functions/package.json && git commit -m "chore(reserva): auditoria das divisões com PIX da reserva inteira vivo

Script só de leitura que classifica as reservas divididas: pagou em dobro,
estorno marcado, cancelada pelo vencimento do PIX antigo, original ainda
aberta ou divisão limpa.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verificação completa e PR

**Files:** nenhum arquivo de produto novo. Inclui no PR os docs já commitados nesta branch (spec e este plano).

- [ ] **Step 1: Suíte e tipagem das functions**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions && npm run lint && npm test`
Expected: `tsc --noEmit` sem erro; `npm test` com `# fail 0` e a contagem total maior que a de antes (testes novos das Tasks 1, 2 e 4).

- [ ] **Step 2: Conferir que nada sobrou fora do commit**

Run: `cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git status --short`
Expected: só `?? functions/node_modules` (o symlink). Nenhum arquivo de produto modificado sem commit.

- [ ] **Step 3: Remover o symlink das functions**

```bash
rm /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002/functions/node_modules
```

- [ ] **Step 4: Push e PR**

```bash
cd /Users/silviodionizio/Documents/projects/volley/nexago/.claude/worktrees/nexago-athlete-cashback-system-3c7002 && git push -u origin claude/nexago-athlete-cashback-system-3c7002
```

Abrir o PR contra a `main` (pronto para revisão, não rascunho) com `gh pr create`, título `fix(reserva): divisão de pagamento sem cobrança dupla`. Corpo, em português:
- **O que muda:** os três comportamentos corrigidos (divisão cancela a original; webhook ignora a cobrança substituída — pagamento vira estorno marcado, vencimento não cancela mais a reserva; portal leva o cupom na divisão) e o script de auditoria.
- **O que diverge da spec original:** cancelamento da original **depois** das cotas (não antes); guarda do webhook cobre também eventos negativos; sem mudança de QR na tela (as abas de divisão só aparecem sem QR).
- **Resultado da auditoria no DEV** (saída do Step 6 da Task 4).
- **Como foi testado:** contagem do `npm test`, os specs do portal, o build de produção.
- **Deploy (não feito):** functions `splitArenaBookingPayment` e `asaasWebhook` no DEV; depois o portal do atleta. Sem ordem obrigatória entre eles. PROD só com o dono.
- **Docs:** a branch carrega também a spec do cashback e este plano.
- Última linha: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Depois do PR: `get_status` do ccd_pr e `bind_pr` se não estiver vinculado.
