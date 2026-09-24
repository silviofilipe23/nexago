# Nova reserva na agenda de quadras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao gestor da arena um caminho de balcão para criar reserva avulsa direto na agenda de quadras, para atleta cadastrado ou cliente sem conta.

**Architecture:** Duas callables novas no Admin SDK (`quoteArenaManualBooking` para o valor sugerido, `createArenaManualBooking` para a escrita transacional com locks), no molde já provado por `materializeSeriesOccurrences` do horário fixo. No portal Angular, um modal próprio em `painel/bookings/` com a lógica extraída para um módulo puro, e o `panel-agenda.component.ts` só ganha o botão e a folha de escolha Reservar/Bloquear.

**Tech Stack:** Firebase Cloud Functions v2 (TypeScript, `onCall`), Firestore Admin SDK, testes com `node:test`; Angular 20 com signals e `ChangeDetectionStrategy.OnPush`, testes com Karma/Jasmine.

**Spec:** `docs/superpowers/specs/2026-09-24-nova-reserva-agenda-design.md`

## Global Constraints

- **Idioma:** strings e mensagens de erro visíveis em **português**; identificadores e comentários de código em inglês só quando já for o padrão do arquivo vizinho — nos arquivos de `functions/src` e do portal da arena os comentários são em português.
- **Região das callables:** `CLIENT_FACING_REGIONS`, importada de `./function-regions`. Nunca declarar região literal.
- **Estilo functions:** aspas duplas, ponto-e-vírgula, indentação de 2 espaços, `import {x} from "./y"` sem espaço interno nas chaves (padrão eslint do diretório `functions/`).
- **Estilo portal:** aspas simples, `import { x } from './y'` com espaço interno, componentes `standalone` com `changeDetection: ChangeDetectionStrategy.OnPush` e `signal`/`computed`/`input`/`output` da API nova do Angular.
- **Pagamento:** toda reserva criada aqui é `paymentChannel: "onsite"`, `paymentStatus: "none"`, `amountToPayNowReais: 0`. Não existe PIX nem "marcar como pago" nesta entrega.
- **Regra de pico não bloqueia o gestor:** nunca chamar `ensurePeakRuleSatisfied` nestas callables.
- **Cupom não se aplica:** nunca chamar `resolveCouponForBooking` nestas callables.
- **Ordem de deploy:** functions primeiro, portal depois. Callable não deployada devolve NOT FOUND cru.

---

### Task 1: Validação pura do payload da reserva manual

**Files:**
- Create: `functions/src/arena-manual-booking.ts`
- Test: `functions/src/arena-manual-booking.test.ts`

**Interfaces:**
- Consumes: `isValidDateKey`, `toMinutes` de `./arena-recurring-booking` (ambos já exportados).
- Produces: `validateManualBookingInput(input: ManualBookingInput, todayKey: string): ValidManualBooking`, mais os tipos `ManualBookingInput` e `ValidManualBooking`. A Task 2 chama essa função; a Task 3 espelha as mesmas regras no front.

- [ ] **Step 1: Write the failing test**

Criar `functions/src/arena-manual-booking.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {validateManualBookingInput} from "./arena-manual-booking";

describe("validateManualBookingInput", () => {
  const todayKey = "2026-09-24";
  const validBase = {
    arenaId: "arena1",
    courtId: "court1",
    date: "2026-09-24",
    startTime: "19:00",
    endTime: "20:00",
    customerName: "João Silva",
    amountReais: 120,
  };

  it("normaliza um payload válido de cliente sem conta", () => {
    assert.deepEqual(validateManualBookingInput(validBase, todayKey), {
      arenaId: "arena1",
      courtId: "court1",
      dateKey: "2026-09-24",
      startTime: "19:00",
      endTime: "20:00",
      athleteId: null,
      customerName: "João Silva",
      amountReais: 120,
      note: null,
    });
  });

  it("aceita atleta vinculado sem nome digitado", () => {
    const result = validateManualBookingInput(
      {...validBase, customerName: "  ", athleteId: "uid123"},
      todayKey,
    );
    assert.equal(result.athleteId, "uid123");
    assert.equal(result.customerName, null);
  });

  it("recusa quando não há atleta nem nome do cliente", () => {
    assert.throws(
      () => validateManualBookingInput({...validBase, customerName: ""}, todayKey),
      /Informe o atleta ou o nome do cliente/,
    );
  });

  it("aceita valor zero (cortesia)", () => {
    assert.equal(validateManualBookingInput({...validBase, amountReais: 0}, todayKey).amountReais, 0);
  });

  it("recusa valor negativo e valor não numérico", () => {
    assert.throws(
      () => validateManualBookingInput({...validBase, amountReais: -1}, todayKey),
      /Valor inválido/,
    );
    assert.throws(
      () => validateManualBookingInput({...validBase, amountReais: Number.NaN}, todayKey),
      /Valor inválido/,
    );
  });

  it("recusa fim menor ou igual ao início", () => {
    assert.throws(
      () => validateManualBookingInput({...validBase, endTime: "19:00"}, todayKey),
      /Intervalo de horário inválido/,
    );
    assert.throws(
      () => validateManualBookingInput({...validBase, endTime: "18:00"}, todayKey),
      /Intervalo de horário inválido/,
    );
  });

  it("aceita virada de meia-noite (23:00 → 00:00)", () => {
    const result = validateManualBookingInput(
      {...validBase, startTime: "23:00", endTime: "00:00"},
      todayKey,
    );
    assert.equal(result.endTime, "00:00");
  });

  it("recusa dia anterior a hoje, aceita hoje", () => {
    assert.throws(
      () => validateManualBookingInput({...validBase, date: "2026-09-23"}, todayKey),
      /data passada/,
    );
    assert.equal(validateManualBookingInput(validBase, todayKey).dateKey, todayKey);
  });

  it("aceita hora já passada no dia de hoje (cliente que chega atrasado)", () => {
    const result = validateManualBookingInput(
      {...validBase, startTime: "07:00", endTime: "08:00"},
      todayKey,
    );
    assert.equal(result.startTime, "07:00");
  });

  it("normaliza hora sem zero à esquerda e corta segundos", () => {
    const result = validateManualBookingInput(
      {...validBase, startTime: "9:00", endTime: "10:00:00"},
      todayKey,
    );
    assert.equal(result.startTime, "09:00");
    assert.equal(result.endTime, "10:00");
  });

  it("guarda a observação aparada e vira null quando vazia", () => {
    assert.equal(
      validateManualBookingInput({...validBase, note: "  pagou em dinheiro "}, todayKey).note,
      "pagou em dinheiro",
    );
    assert.equal(validateManualBookingInput({...validBase, note: "   "}, todayKey).note, null);
  });

  it("recusa arena ou quadra ausente", () => {
    assert.throws(
      () => validateManualBookingInput({...validBase, courtId: " "}, todayKey),
      /Dados da reserva inválidos/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npm run build`
Expected: FAIL na compilação — `Cannot find module './arena-manual-booking'`.

- [ ] **Step 3: Write minimal implementation**

Criar `functions/src/arena-manual-booking.ts`:

```ts
import {HttpsError} from "firebase-functions/v2/https";
import {isValidDateKey, toMinutes} from "./arena-recurring-booking";

/** Reserva avulsa criada pelo gestor no balcão (sem app do atleta no meio).
 *  Mesma forma de documento do horário fixo — ver
 *  `materializeSeriesOccurrences` em arena-recurring-booking.ts. */

export interface ManualBookingInput {
  arenaId?: string;
  courtId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  athleteId?: string | null;
  customerName?: string | null;
  amountReais?: number;
  note?: string | null;
}

export interface ValidManualBooking {
  arenaId: string;
  courtId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  athleteId: string | null;
  customerName: string | null;
  amountReais: number;
  note: string | null;
}

/** "9:00" → "09:00"; "10:00:00" → "10:00"; lixo → null. */
function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1] ?? "", 10);
  const min = parseInt(m[2] ?? "", 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (h > 24 || min > 59) return null;
  if (h === 24 && min !== 0) return null;
  return `${h.toString().padStart(2, "0")}:${m[2]}`;
}

function trimmedOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

/**
 * Valida e normaliza o payload da reserva de balcão.
 *
 * Sobre a data: **dia passado é recusado** — registro retroativo criaria lock e
 * presença para horário vencido, e não é o problema desta entrega. Mas **hora
 * passada no dia de hoje é aceita**: o cliente que chega 19h05 e paga o horário
 * das 19h é o caso comum do balcão.
 */
export function validateManualBookingInput(
  input: ManualBookingInput,
  todayKey: string,
): ValidManualBooking {
  const arenaId = input.arenaId?.trim() ?? "";
  const courtId = input.courtId?.trim() ?? "";
  if (!arenaId || !courtId) {
    throw new HttpsError("invalid-argument", "Dados da reserva inválidos.");
  }

  const dateKey = (input.date ?? "").trim().substring(0, 10);
  if (!isValidDateKey(dateKey)) {
    throw new HttpsError("invalid-argument", "Dados da reserva inválidos.");
  }
  if (dateKey < todayKey) {
    throw new HttpsError(
      "invalid-argument",
      "Não dá para criar reserva em data passada.",
    );
  }

  const startTime = normalizeTime(input.startTime);
  const endTime = normalizeTime(input.endTime);
  if (!startTime || !endTime) {
    throw new HttpsError("invalid-argument", "Intervalo de horário inválido.");
  }
  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  if (endMin <= startMin) {
    throw new HttpsError("invalid-argument", "Intervalo de horário inválido.");
  }

  const athleteId = trimmedOrNull(input.athleteId);
  const customerName = trimmedOrNull(input.customerName);
  if (!athleteId && !customerName) {
    throw new HttpsError(
      "invalid-argument",
      "Informe o atleta ou o nome do cliente.",
    );
  }

  const amountReais = Number(input.amountReais);
  if (!Number.isFinite(amountReais) || amountReais < 0) {
    throw new HttpsError("invalid-argument", "Valor inválido.");
  }

  return {
    arenaId,
    courtId,
    dateKey,
    startTime,
    endTime,
    athleteId,
    customerName,
    amountReais,
    note: trimmedOrNull(input.note),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npm run build && node --test lib/arena-manual-booking.test.js`
Expected: PASS em todos os `it`.

- [ ] **Step 5: Commit**

```bash
git add functions/src/arena-manual-booking.ts functions/src/arena-manual-booking.test.ts
git commit -m "feat(arena): validação do payload da reserva manual de balcão"
```

---

### Task 2: As duas callables e o registro no index

**Files:**
- Modify: `functions/src/arena-manual-booking.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `validateManualBookingInput` (Task 1); `calendarHoursSpanning`, `fmtHourStart`, `fmtHourEnd`, `hasBlockedSlotOverlap`, `toMinutes` de `./arena-recurring-booking`; `calculateBookingTotal`, `parsePromotionsFromDocs`, `readArenaFallbackPrice` de `./arena-pricing`; `assertArenaAreaAccess` de `./arena-area-access`; `deliverNotificationToUser` de `./notification-delivery`; `dayKeyFromEventDate` de `./event-timezone`; `CLIENT_FACING_REGIONS` de `./function-regions`.
- Produces: callables `quoteArenaManualBooking` → `{amountReais: number; lineItems: VirtualSlotPricing[]}` e `createArenaManualBooking` → `{bookingId: string}`. A Task 4 chama as duas pelo nome exato.

Nota de acoplamento deliberado: os helpers de lock e de sobreposição de bloqueio são importados de `arena-recurring-booking.ts` em vez de copiados. Eles já são exportados justamente para reuso e teste, e duplicá-los faria a reserva de balcão e o horário fixo divergirem em silêncio no dia em que um dos dois mudasse.

- [ ] **Step 1: Escrever as callables**

Acrescentar ao fim de `functions/src/arena-manual-booking.ts`:

```ts
import {onCall} from "firebase-functions/v2/https";
import {getFirestore, FieldValue, Timestamp, type Firestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {
  calendarHoursSpanning,
  fmtHourEnd,
  fmtHourStart,
  hasBlockedSlotOverlap,
} from "./arena-recurring-booking";
import {
  calculateBookingTotal,
  parsePromotionsFromDocs,
  readArenaFallbackPrice,
} from "./arena-pricing";
import {assertArenaAreaAccess} from "./arena-area-access";
import {deliverNotificationToUser} from "./notification-delivery";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const ARENA_BOOKINGS = "arenaBookings";
const ARENA_SLOTS = "arenaSlots";
const ARENA_SLOT_LOCKS = "arenaSlotLocks";
const ARENA_TIMEZONE_OFFSET = "-03:00";

function safeIdPart(s: string): string {
  return s.replace(/\//g, "_");
}

interface ArenaCourtContext {
  arenaData: Record<string, unknown>;
  courtData: Record<string, unknown>;
  arenaName: string;
  courtName: string;
}

/** Acesso de escrita em `agenda` + arena e quadra numa leitura só — as duas
 *  callables precisam exatamente disso, e `calculateBookingTotal` precisa do
 *  `courtData` cru. */
async function requireArenaCourtContext(
  db: Firestore,
  arenaId: string,
  courtId: string,
  uid: string,
): Promise<ArenaCourtContext> {
  await assertArenaAreaAccess(db, arenaId, uid, "agenda", "write");

  const [arenaSnap, courtSnap] = await Promise.all([
    db.collection("arenas").doc(arenaId).get(),
    db.collection("arenas").doc(arenaId).collection("courts").doc(courtId).get(),
  ]);
  if (!arenaSnap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  if (!courtSnap.exists) {
    throw new HttpsError("not-found", "Quadra não encontrada.");
  }

  const arenaData = arenaSnap.data() as Record<string, unknown>;
  const courtData = courtSnap.data() as Record<string, unknown>;
  const arenaName = typeof arenaData["name"] === "string" ?
    (arenaData["name"] as string).trim() || "Arena" :
    "Arena";
  const courtName = typeof courtData["name"] === "string" ?
    (courtData["name"] as string).trim() || "Quadra" :
    "Quadra";

  return {arenaData, courtData, arenaName, courtName};
}

/** Preço sugerido: quadra + promoções ativas. Sem cupom (é do atleta) e sem
 *  regra de pico (não bloqueia o gestor). Quadra sem preço devolve 0 sem erro —
 *  o gestor digita. */
export const quoteArenaManualBooking = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const db = getFirestore();
  const input = (request.data ?? {}) as ManualBookingInput;
  // Cotação não precisa de cliente nem de valor: injeta o mínimo pra reusar a
  // mesma normalização de quadra/data/horário da criação.
  const parsed = validateManualBookingInput(
    {...input, customerName: "cotação", amountReais: 0},
    dayKeyFromEventDate(new Date()),
  );

  const ctx = await requireArenaCourtContext(db, parsed.arenaId, parsed.courtId, uid);
  const promoSnap = await db
    .collection("arenas").doc(parsed.arenaId)
    .collection("promotions")
    .where("active", "==", true)
    .get();

  const total = calculateBookingTotal({
    arenaId: parsed.arenaId,
    courtId: parsed.courtId,
    dateKey: parsed.dateKey,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    courtData: ctx.courtData,
    arenaFallback: readArenaFallbackPrice(ctx.arenaData),
    promotions: parsePromotionsFromDocs(promoSnap.docs),
  });

  return {amountReais: total.amountReais, lineItems: total.lineItems};
});

/** Cria a reserva de balcão: `arenaBookings` + `arenaSlots` + `arenaSlotLocks`
 *  numa transação, mesma forma do horário fixo. */
export const createArenaManualBooking = onCall({
  region: CLIENT_FACING_REGIONS,
}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const db = getFirestore();
  const parsed = validateManualBookingInput(
    (request.data ?? {}) as ManualBookingInput,
    dayKeyFromEventDate(new Date()),
  );
  const ctx = await requireArenaCourtContext(db, parsed.arenaId, parsed.courtId, uid);

  if (parsed.athleteId) {
    const userSnap = await db.collection("users").doc(parsed.athleteId).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Atleta vinculado não encontrado.");
    }
  }

  const blocked = await hasBlockedSlotOverlap(db, {
    arenaId: parsed.arenaId,
    courtId: parsed.courtId,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
  }, parsed.dateKey);
  if (blocked) {
    throw new HttpsError(
      "failed-precondition",
      "Esse horário está bloqueado; desbloqueie antes de reservar.",
    );
  }

  const startMin = toMinutes(parsed.startTime);
  let endMin = toMinutes(parsed.endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  const hours = calendarHoursSpanning(startMin, endMin);
  if (hours.length === 0) {
    throw new HttpsError("failed-precondition", "Não foi possível calcular os horários.");
  }

  const safeArena = safeIdPart(parsed.arenaId);
  const safeCourt = safeIdPart(parsed.courtId);
  const lockRefs = hours.map((h) => ({
    hour: h,
    ref: db
      .collection(ARENA_SLOT_LOCKS)
      .doc(`${safeArena}_${safeCourt}_${parsed.dateKey}_h${h.toString().padStart(2, "0")}`),
  }));

  const bookingRef = db.collection(ARENA_BOOKINGS).doc();
  const slotRef = db.collection(ARENA_SLOTS).doc();
  const startAt = new Date(
    `${parsed.dateKey}T${parsed.startTime}:00${ARENA_TIMEZONE_OFFSET}`,
  );
  const confirmationDeadline = new Date(startAt.getTime() - 2 * 60 * 60 * 1000);

  try {
    await db.runTransaction(async (transaction) => {
      for (const lock of lockRefs) {
        const snap = await transaction.get(lock.ref);
        if (snap.exists) {
          throw new HttpsError("already-exists", "Esse horário já está reservado.");
        }
      }

      transaction.set(bookingRef, {
        athleteId: parsed.athleteId,
        arenaId: parsed.arenaId,
        arenaName: ctx.arenaName,
        courtId: parsed.courtId,
        courtName: ctx.courtName,
        customerName: parsed.customerName,
        date: parsed.dateKey,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        amountReais: parsed.amountReais,
        amountToPayNowReais: 0,
        amountPaidOnlineReais: 0,
        amountDueOnsiteReais: parsed.amountReais,
        paymentChannel: "onsite",
        paymentReceiver: null,
        paymentFraction: null,
        paymentStatus: "none",
        status: "active",
        attendanceConfirmed: false,
        attendanceStatus: "pending",
        confirmationDeadline: Timestamp.fromDate(confirmationDeadline),
        paymentExpiresAt: null,
        source: "manual",
        isRecurring: false,
        createdByRole: "arena_manager",
        createdBy: uid,
        ...(parsed.note ? {managerNote: parsed.note} : {}),
        createdAt: FieldValue.serverTimestamp(),
      });

      transaction.set(slotRef, {
        arenaId: parsed.arenaId,
        courtId: parsed.courtId,
        // String YYYY-MM-DD — alinhado a arenaBookings (evita deslocamento UTC no app).
        date: parsed.dateKey,
        dateKey: parsed.dateKey,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        status: "booked",
        bookingAthleteId: parsed.athleteId,
        bookingId: bookingRef.id,
        priceReais: parsed.amountReais,
        createdAt: FieldValue.serverTimestamp(),
      });

      for (const lock of lockRefs) {
        transaction.set(lock.ref, {
          arenaId: parsed.arenaId,
          courtId: parsed.courtId,
          date: parsed.dateKey,
          startTime: fmtHourStart(lock.hour),
          endTime: fmtHourEnd(lock.hour),
          bookingId: bookingRef.id,
          bookingAthleteId: parsed.athleteId,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("createArenaManualBooking: transação falhou", e);
    throw new HttpsError("internal", "Não foi possível criar a reserva.");
  }

  // Push é acessório: reserva já criada não pode cair por falha de notificação.
  if (parsed.athleteId) {
    try {
      await deliverNotificationToUser({
        userId: parsed.athleteId,
        title: "Reserva confirmada 🎾",
        body: `${parsed.startTime} - ${parsed.endTime} · ${ctx.courtName} · ${ctx.arenaName}`,
        type: "manual_booking_created",
        data: {bookingId: bookingRef.id, arenaId: parsed.arenaId},
        requireInteraction: false,
      });
    } catch (e) {
      logger.warn("createArenaManualBooking: notificação ao atleta falhou", e);
    }
  }

  logger.info("createArenaManualBooking: reserva criada", {
    bookingId: bookingRef.id,
    arenaId: parsed.arenaId,
    courtId: parsed.courtId,
    dateKey: parsed.dateKey,
  });

  return {bookingId: bookingRef.id};
});
```

Consolidar os imports no topo do arquivo (o bloco acima repete `HttpsError`, que já foi importado na Task 1 — deixar uma única linha de import por módulo).

- [ ] **Step 2: Registrar no index**

Em `functions/src/index.ts`, adicionar o import junto dos vizinhos de reserva (logo abaixo da linha 6, `import {quoteArenaBooking, createArenaBooking} from "./arena-booking-create";`):

```ts
import {
  quoteArenaManualBooking,
  createArenaManualBooking,
} from "./arena-manual-booking";
```

E acrescentar os dois nomes ao bloco `export {` que já começa com `quoteArenaBooking,` e `createArenaBooking,` (por volta da linha 198):

```ts
  quoteArenaBooking,
  createArenaBooking,
  quoteArenaManualBooking,
  createArenaManualBooking,
```

- [ ] **Step 3: Build e lint**

Run: `cd functions && npm run build && npx eslint src/arena-manual-booking.ts src/index.ts`
Expected: build sem erro de tipo; eslint sem warning.

- [ ] **Step 4: Rodar a suíte de testes das functions**

Run: `cd functions && npm test`
Expected: PASS, incluindo os testes da Task 1 e nenhuma regressão nos vizinhos.

- [ ] **Step 5: Commit**

```bash
git add functions/src/arena-manual-booking.ts functions/src/index.ts
git commit -m "feat(arena): callables de cotação e criação da reserva de balcão"
```

---

### Task 3: Lógica pura do formulário no portal

**Files:**
- Create: `frontend/projects/arena/src/app/painel/bookings/manual-booking-form.ts`
- Test: `frontend/projects/arena/src/app/painel/bookings/manual-booking-form.spec.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `ManualBookingFormState`, `ManualBookingPayload`, `parseAmountText(raw: string): number | null`, `quoteKeyOf(state): string | null`, `validateManualBookingForm(state, arenaId, todayKey): ManualBookingFormResult`. As Tasks 4 e 5 consomem esses nomes.

- [ ] **Step 1: Write the failing test**

Criar `frontend/projects/arena/src/app/painel/bookings/manual-booking-form.spec.ts`:

```ts
import { parseAmountText, quoteKeyOf, validateManualBookingForm, type ManualBookingFormState } from './manual-booking-form';

const TODAY = '2026-09-24';

function stateOf(patch: Partial<ManualBookingFormState> = {}): ManualBookingFormState {
  return {
    courtId: 'court1',
    dateKey: TODAY,
    startTime: '19:00',
    endTime: '20:00',
    athleteId: null,
    customerName: 'João Silva',
    amountText: '120',
    note: '',
    ...patch,
  };
}

describe('parseAmountText', () => {
  it('lê vírgula e ponto como decimal', () => {
    expect(parseAmountText('120,50')).toBe(120.5);
    expect(parseAmountText('120.50')).toBe(120.5);
  });

  it('aceita zero', () => {
    expect(parseAmountText('0')).toBe(0);
  });

  it('devolve null pra vazio e pra texto', () => {
    expect(parseAmountText('')).toBeNull();
    expect(parseAmountText('   ')).toBeNull();
    expect(parseAmountText('abc')).toBeNull();
  });
});

describe('quoteKeyOf', () => {
  it('monta a chave quando quadra, data e intervalo estão válidos', () => {
    expect(quoteKeyOf(stateOf())).toBe('court1|2026-09-24|19:00|20:00');
  });

  it('devolve null com quadra ausente', () => {
    expect(quoteKeyOf(stateOf({ courtId: '' }))).toBeNull();
  });

  it('devolve null com intervalo inválido', () => {
    expect(quoteKeyOf(stateOf({ endTime: '19:00' }))).toBeNull();
  });

  it('aceita virada de meia-noite', () => {
    expect(quoteKeyOf(stateOf({ startTime: '23:00', endTime: '00:00' }))).toBe('court1|2026-09-24|23:00|00:00');
  });
});

describe('validateManualBookingForm', () => {
  it('monta o payload do cliente sem conta', () => {
    const result = validateManualBookingForm(stateOf(), 'arena1', TODAY);
    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.payload).toEqual({
      arenaId: 'arena1',
      courtId: 'court1',
      date: TODAY,
      startTime: '19:00',
      endTime: '20:00',
      customerName: 'João Silva',
      amountReais: 120,
    });
  });

  it('inclui athleteId e omite nome quando o atleta foi selecionado', () => {
    const result = validateManualBookingForm(
      stateOf({ athleteId: 'uid123', customerName: '' }),
      'arena1',
      TODAY,
    );
    expect(result.ok).toBeTrue();
    if (!result.ok) return;
    expect(result.payload.athleteId).toBe('uid123');
    expect(result.payload.customerName).toBeUndefined();
  });

  it('inclui a observação só quando preenchida', () => {
    const semNota = validateManualBookingForm(stateOf({ note: '  ' }), 'arena1', TODAY);
    expect(semNota.ok && semNota.payload.note).toBeUndefined();
    const comNota = validateManualBookingForm(stateOf({ note: ' pagou em dinheiro ' }), 'arena1', TODAY);
    expect(comNota.ok && comNota.payload.note).toBe('pagou em dinheiro');
  });

  it('cobra a quadra', () => {
    const result = validateManualBookingForm(stateOf({ courtId: '' }), 'arena1', TODAY);
    expect(result).toEqual({ ok: false, error: 'Escolha a quadra.' });
  });

  it('cobra atleta ou nome do cliente', () => {
    const result = validateManualBookingForm(stateOf({ customerName: '  ', athleteId: null }), 'arena1', TODAY);
    expect(result).toEqual({ ok: false, error: 'Informe o atleta ou o nome do cliente.' });
  });

  it('cobra intervalo válido', () => {
    const result = validateManualBookingForm(stateOf({ endTime: '18:00' }), 'arena1', TODAY);
    expect(result).toEqual({ ok: false, error: 'O horário de fim precisa ser depois do início.' });
  });

  it('cobra valor numérico e aceita zero', () => {
    expect(validateManualBookingForm(stateOf({ amountText: 'abc' }), 'arena1', TODAY)).toEqual({
      ok: false,
      error: 'Informe um valor válido.',
    });
    expect(validateManualBookingForm(stateOf({ amountText: '-1' }), 'arena1', TODAY)).toEqual({
      ok: false,
      error: 'Informe um valor válido.',
    });
    const cortesia = validateManualBookingForm(stateOf({ amountText: '0' }), 'arena1', TODAY);
    expect(cortesia.ok && cortesia.payload.amountReais).toBe(0);
  });

  it('recusa dia passado e aceita hoje', () => {
    expect(validateManualBookingForm(stateOf({ dateKey: '2026-09-23' }), 'arena1', TODAY)).toEqual({
      ok: false,
      error: 'Não dá pra criar reserva em data passada.',
    });
    expect(validateManualBookingForm(stateOf(), 'arena1', TODAY).ok).toBeTrue();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless`
Expected: FAIL — módulo `./manual-booking-form` não existe.

- [ ] **Step 3: Write minimal implementation**

Criar `frontend/projects/arena/src/app/painel/bookings/manual-booking-form.ts`:

```ts
/** Lógica pura do formulário de reserva de balcão. Espelha
 *  `validateManualBookingInput` (functions/src/arena-manual-booking.ts): o servidor
 *  segue sendo a autoridade, isto aqui é feedback imediato pro gestor. */

export interface ManualBookingFormState {
  courtId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  athleteId: string | null;
  customerName: string;
  amountText: string;
  note: string;
}

export interface ManualBookingPayload {
  arenaId: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  athleteId?: string;
  customerName?: string;
  amountReais: number;
  note?: string;
}

export type ManualBookingFormResult =
  | { ok: true; payload: ManualBookingPayload }
  | { ok: false; error: string };

function minutesOf(time: string): number | null {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** Intervalo em minutos, tratando 00:00 como meia-noite do dia seguinte. */
function spanOf(startTime: string, endTime: string): { start: number; end: number } | null {
  const start = minutesOf(startTime);
  const rawEnd = minutesOf(endTime);
  if (start == null || rawEnd == null) return null;
  const end = rawEnd === 0 && start > 0 ? 24 * 60 : rawEnd;
  if (end <= start) return null;
  return { start, end };
}

/** "120,50" e "120.50" viram 120.5; vazio ou texto viram null. */
export function parseAmountText(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  const value = Number(t);
  return Number.isFinite(value) ? value : null;
}

/** Identidade da cotação: muda só quando algo que altera o preço muda. Null
 *  enquanto a seleção não estiver completa — aí não vale chamar a callable. */
export function quoteKeyOf(
  state: Pick<ManualBookingFormState, 'courtId' | 'dateKey' | 'startTime' | 'endTime'>,
): string | null {
  if (!state.courtId.trim() || state.dateKey.length < 10) return null;
  if (!spanOf(state.startTime, state.endTime)) return null;
  return `${state.courtId}|${state.dateKey}|${state.startTime}|${state.endTime}`;
}

export function validateManualBookingForm(
  state: ManualBookingFormState,
  arenaId: string,
  todayKey: string,
): ManualBookingFormResult {
  const courtId = state.courtId.trim();
  if (!courtId) return { ok: false, error: 'Escolha a quadra.' };

  if (state.dateKey.length < 10) return { ok: false, error: 'Escolha a data.' };
  if (state.dateKey < todayKey) {
    return { ok: false, error: 'Não dá pra criar reserva em data passada.' };
  }

  if (!spanOf(state.startTime, state.endTime)) {
    return { ok: false, error: 'O horário de fim precisa ser depois do início.' };
  }

  const athleteId = state.athleteId?.trim() || null;
  const customerName = state.customerName.trim();
  if (!athleteId && !customerName) {
    return { ok: false, error: 'Informe o atleta ou o nome do cliente.' };
  }

  const amountReais = parseAmountText(state.amountText);
  if (amountReais == null || amountReais < 0) {
    return { ok: false, error: 'Informe um valor válido.' };
  }

  const note = state.note.trim();

  return {
    ok: true,
    payload: {
      arenaId,
      courtId,
      date: state.dateKey,
      startTime: state.startTime,
      endTime: state.endTime,
      amountReais,
      ...(athleteId ? { athleteId } : {}),
      ...(customerName ? { customerName } : {}),
      ...(note ? { note } : {}),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless`
Expected: PASS, sem regressão nos specs vizinhos.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/bookings/manual-booking-form.ts frontend/projects/arena/src/app/painel/bookings/manual-booking-form.spec.ts
git commit -m "feat(arena): lógica pura do formulário de reserva de balcão"
```

---

### Task 4: Repositório das callables no portal

**Files:**
- Create: `frontend/projects/arena/src/app/painel/bookings/manual-booking-repository.ts`

**Interfaces:**
- Consumes: `ManualBookingPayload` (Task 3); as callables `quoteArenaManualBooking` e `createArenaManualBooking` (Task 2).
- Produces: `quoteManualBooking(functions, input): Promise<ManualBookingQuote>`, `createManualBooking(functions, payload): Promise<{ bookingId: string }>`, `ManualBookingError`. A Task 5 consome os três.

- [ ] **Step 1: Escrever o repositório**

Criar `frontend/projects/arena/src/app/painel/bookings/manual-booking-repository.ts`:

```ts
import { httpsCallable, type Functions } from 'firebase/functions';
import type { ManualBookingPayload } from './manual-booking-form';

/** Reserva de balcão: escrita 100% via Cloud Functions — a criação exige transação
 *  com `arenaSlotLocks`, que o client não consegue garantir sozinho. Mesmo desenho
 *  de `recurring-bookings-repository.ts`. */

export class ManualBookingError extends Error {}

export interface ManualBookingQuoteInput {
  arenaId: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface ManualBookingQuote {
  amountReais: number;
}

function mapFunctionsError(err: unknown): ManualBookingError {
  const message = err instanceof Error && err.message ?
    err.message :
    'Não foi possível concluir a operação. Tente novamente.';
  return new ManualBookingError(message);
}

export async function quoteManualBooking(functions: Functions, input: ManualBookingQuoteInput): Promise<ManualBookingQuote> {
  const call = httpsCallable<ManualBookingQuoteInput, ManualBookingQuote>(functions, 'quoteArenaManualBooking');
  try {
    const result = await call(input);
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

export async function createManualBooking(functions: Functions, payload: ManualBookingPayload): Promise<{ bookingId: string }> {
  const call = httpsCallable<ManualBookingPayload, { bookingId: string }>(functions, 'createArenaManualBooking');
  try {
    const result = await call(payload);
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erro de tipo.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/bookings/manual-booking-repository.ts
git commit -m "feat(arena): repositório das callables de reserva de balcão"
```

---

### Task 5: Modal de nova reserva

**Files:**
- Create: `frontend/projects/arena/src/app/painel/bookings/manual-booking-modal.component.ts`

**Interfaces:**
- Consumes: Tasks 3 e 4; `ModalComponent` (`ar-modal`, output `close`), `AthleteSearchFieldComponent` (`ar-athlete-search-field`, input `arenaId`, output `selected: AthleteCandidate`), `ArenaCourt` de `../courts/court.model`, `arenaFunctions()` de `../data/functions`.

Importar `AthleteSearchFieldComponent` de `../recurring/` é proposital, não engano: o campo é genérico (busca entre os atletas que já reservaram na arena) e hoje mora lá porque o horário fixo foi quem precisou dele primeiro. Mover o arquivo é refatoração de outra entrega.
- Produces: `ManualBookingModalComponent`, seletor `ar-manual-booking-modal`, inputs `arenaId: string` (required), `courts: ArenaCourt[]` (required), `dateKey: string` (required), `courtId: string | null`, `startTime: string | null`, `endTime: string | null`; outputs `close` e `created`. A Task 6 usa exatamente esses nomes.

- [ ] **Step 1: Escrever o componente**

Criar `frontend/projects/arena/src/app/painel/bookings/manual-booking-modal.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { arenaFunctions } from '../data/functions';
import { AthleteSearchFieldComponent } from '../recurring/athlete-search-field.component';
import type { AthleteCandidate } from '../recurring/athlete-search-filter';
import type { ArenaCourt } from '../courts/court.model';
import { ModalComponent } from '../ui/modal.component';
import { dateKeyOf } from './arena-booking.model';
import { quoteKeyOf, validateManualBookingForm, type ManualBookingFormState } from './manual-booking-form';
import { createManualBooking, quoteManualBooking } from './manual-booking-repository';

/** Reserva de balcão: o gestor vende o horário na recepção, para um atleta da base
 *  ou para um cliente sem conta (só o nome). O valor vem cotado pelo motor de preço
 *  e é editável — cortesia, permuta e desconto de caixa são decisão do gestor. */
@Component({
  selector: 'ar-manual-booking-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, AthleteSearchFieldComponent],
  template: `
    <ar-modal (close)="close.emit()">
      <h2 class="modal-title">Nova reserva</h2>
      <p class="modal-subtitle">Reserva criada pela arena, para pagamento no local.</p>

      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      }

      <div class="field-label">Quadra</div>
      <select class="input-box" [value]="courtIdValue()" (change)="courtIdValue.set($any($event.target).value)">
        <option value="">Selecione a quadra</option>
        @for (c of courts(); track c.id) {
          <option [value]="c.id">{{ c.name }}</option>
        }
      </select>

      <div class="field-label">Data</div>
      <input type="date" class="input-box" [value]="dateValue()" (input)="dateValue.set($any($event.target).value)" />

      <div class="row">
        <div class="col">
          <div class="field-label">Início</div>
          <input type="time" class="input-box" [value]="startValue()" (input)="startValue.set($any($event.target).value)" />
        </div>
        <div class="col">
          <div class="field-label">Fim</div>
          <input type="time" class="input-box" [value]="endValue()" (input)="endValue.set($any($event.target).value)" />
        </div>
      </div>

      @if (athleteId()) {
        <div class="field-label">Atleta</div>
        <div class="selected-athlete">
          <span class="selected-name">{{ customerName() }}</span>
          <button type="button" class="ar-ghost-btn clear-btn" (click)="clearAthlete()">Trocar</button>
        </div>
      } @else {
        <ar-athlete-search-field [arenaId]="arenaId()" (selected)="onAthleteSelected($event)" />
        <div class="field-label">Ou nome do cliente</div>
        <input
          type="text"
          class="input-box"
          placeholder="Ex.: João Silva"
          [value]="customerName()"
          (input)="customerName.set($any($event.target).value)"
        />
      }

      <div class="field-label">Valor (R$)</div>
      <input
        type="text"
        inputmode="decimal"
        class="input-box"
        [placeholder]="quoting() ? 'Calculando…' : '0,00'"
        [value]="amountText()"
        (input)="onAmountInput($any($event.target).value)"
      />

      <div class="field-label">Observação (opcional)</div>
      <input
        type="text"
        class="input-box"
        placeholder="Ex.: pagou em dinheiro na recepção"
        [value]="note()"
        (input)="note.set($any($event.target).value)"
      />

      <div class="actions">
        <button type="button" class="ar-ghost-btn" [disabled]="saving()" (click)="close.emit()">Cancelar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="saving()" (click)="submit()">
          {{ saving() ? 'Criando…' : 'Criar reserva' }}
        </button>
      </div>
    </ar-modal>
  `,
  styles: `
    .modal-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
      margin: 0 0 10px;
    }

    .modal-subtitle {
      font-size: 13px;
      color: var(--nx-text-dim);
      margin: 4px 0 20px;
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
      margin-bottom: 16px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
      margin-bottom: 18px;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .row {
      display: flex;
      gap: 12px;
    }

    .col {
      flex: 1;
      min-width: 0;
    }

    .selected-athlete {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
    }

    .selected-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }

    .clear-btn {
      height: 30px;
      padding: 0 12px;
      flex: none;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .confirm-btn {
      height: 44px;
      padding: 0 20px;
    }
  `,
})
export class ManualBookingModalComponent {
  readonly arenaId = input.required<string>();
  readonly courts = input.required<ArenaCourt[]>();
  readonly dateKey = input.required<string>();
  readonly courtId = input<string | null>(null);
  readonly startTime = input<string | null>(null);
  readonly endTime = input<string | null>(null);

  readonly close = output<void>();
  readonly created = output<string>();

  protected readonly courtIdValue = signal('');
  protected readonly dateValue = signal('');
  protected readonly startValue = signal('');
  protected readonly endValue = signal('');
  protected readonly athleteId = signal<string | null>(null);
  protected readonly customerName = signal('');
  protected readonly amountText = signal('');
  protected readonly note = signal('');

  protected readonly quoting = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Primeira digitação do gestor no valor trava a sobrescrita pela cotação —
   *  cortesia e desconto de caixa não podem ser desfeitos por uma cotação que
   *  chega depois. */
  private amountTouched = false;
  private lastQuoteKey: string | null = null;

  private readonly formState = computed<ManualBookingFormState>(() => ({
    courtId: this.courtIdValue(),
    dateKey: this.dateValue(),
    startTime: this.startValue(),
    endTime: this.endValue(),
    athleteId: this.athleteId(),
    customerName: this.customerName(),
    amountText: this.amountText(),
    note: this.note(),
  }));

  constructor() {
    // Pré-preenchimento vindo da grade (ou só a data, quando abre pelo header).
    effect(() => {
      this.courtIdValue.set(this.courtId() ?? '');
      this.dateValue.set(this.dateKey());
      this.startValue.set(this.startTime() ?? '');
      this.endValue.set(this.endTime() ?? '');
    });

    effect(() => {
      const key = quoteKeyOf(this.formState());
      if (!key || key === this.lastQuoteKey || this.amountTouched) return;
      this.lastQuoteKey = key;
      void this.runQuote();
    });
  }

  private async runQuote(): Promise<void> {
    const state = this.formState();
    this.quoting.set(true);
    try {
      const quote = await quoteManualBooking(arenaFunctions(), {
        arenaId: this.arenaId(),
        courtId: state.courtId,
        date: state.dateKey,
        startTime: state.startTime,
        endTime: state.endTime,
      });
      // Corrida: se o gestor digitou enquanto a cotação vinha, o que ele digitou manda.
      if (!this.amountTouched) {
        this.amountText.set(quote.amountReais.toFixed(2).replace('.', ','));
      }
    } catch {
      // Cotação é sugestão: falhar não trava a criação, o gestor digita o valor.
    } finally {
      this.quoting.set(false);
    }
  }

  protected onAmountInput(value: string): void {
    this.amountTouched = true;
    this.amountText.set(value);
  }

  protected onAthleteSelected(candidate: AthleteCandidate): void {
    this.athleteId.set(candidate.athleteId);
    this.customerName.set(candidate.name);
  }

  protected clearAthlete(): void {
    this.athleteId.set(null);
    this.customerName.set('');
  }

  protected async submit(): Promise<void> {
    const result = validateManualBookingForm(this.formState(), this.arenaId(), dateKeyOf(new Date()));
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const { bookingId } = await createManualBooking(arenaFunctions(), result.payload);
      this.created.emit(bookingId);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível criar a reserva.');
    } finally {
      this.saving.set(false);
    }
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx ng build arena --configuration development`
Expected: build sem erro de tipo nem de template.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/bookings/manual-booking-modal.component.ts
git commit -m "feat(arena): modal de nova reserva de balcão"
```

---

### Task 6: Ligar na agenda e verificar no navegador

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/agenda/panel-agenda.component.ts`

**Interfaces:**
- Consumes: `ManualBookingModalComponent` (Task 5).
- Produces: nada para tasks seguintes — é a última.

- [ ] **Step 1: Corrigir o doc-comment da classe**

Em `panel-agenda.component.ts`, a frase final do comentário acima do `@Component` afirma o contrário do que a tela passa a fazer. Trocar:

```
 *  calendário no header seleciona qualquer data. Sem "Nova reserva": o Flutter
 *  também não tem criação de reserva pelo gestor em lugar nenhum (reserva é sempre iniciada
 *  pelo atleta na busca). */
```

por:

```
 *  calendário no header seleciona qualquer data. "Nova reserva" cria reserva de balcão
 *  (`createArenaManualBooking`) — caminho que só existe aqui na web; no Flutter a reserva
 *  segue sempre iniciada pelo atleta na busca. */
```

- [ ] **Step 2: Importar o modal**

Adicionar ao bloco de imports do arquivo:

```ts
import { ManualBookingModalComponent } from '../bookings/manual-booking-modal.component';
```

E acrescentar `ManualBookingModalComponent` ao array `imports` do `@Component`.

- [ ] **Step 3: Habilitar o botão do header**

Trocar o botão desabilitado:

```html
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" disabled title="Em breve">
            <ar-icon name="plus" [size]="14" />
            Nova reserva
          </button>
```

por:

```html
          <button
            type="button"
            class="ar-mini-btn ar-mini-btn-primary"
            [disabled]="readOnly()"
            [title]="readOnly() ? 'Seu cargo não permite criar reservas' : 'Criar reserva de balcão'"
            (click)="openManualBooking(null, null, null)"
          >
            <ar-icon name="plus" [size]="14" />
            Nova reserva
          </button>
```

- [ ] **Step 4: Adicionar a folha de escolha e o modal ao template**

Logo antes do bloco `@if (blockTarget(); as target) {`, inserir:

```html
      @if (slotActionTarget(); as target) {
        <ar-modal (close)="slotActionTarget.set(null)">
          <h2 class="confirm-title">{{ target.startTime }}–{{ target.endTime }}</h2>
          <p class="confirm-body">{{ courtName(target.courtId) }} · horário livre. O que você quer fazer?</p>
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" (click)="chooseBlockFromSheet()">Bloquear horário</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="chooseReserveFromSheet()">Reservar horário</button>
          </div>
        </ar-modal>
      }

      @if (manualBookingOpen()) {
        <ar-manual-booking-modal
          [arenaId]="arenaContext.arenaId() ?? ''"
          [courts]="courts()"
          [dateKey]="manualDateKey()"
          [courtId]="manualCourtId()"
          [startTime]="manualStartTime()"
          [endTime]="manualEndTime()"
          (close)="manualBookingOpen.set(false)"
          (created)="manualBookingOpen.set(false)"
        />
      }
```

- [ ] **Step 5: Tornar `arenaContext` acessível ao template**

O campo hoje é `private readonly arenaContext = inject(ArenaContextService);`. Trocar `private` por `protected` para o template poder ler `arenaContext.arenaId()`:

```ts
  protected readonly arenaContext = inject(ArenaContextService);
```

- [ ] **Step 6: Adicionar o estado e os handlers**

Junto dos demais signals da classe (perto de `unblockTarget`), adicionar:

```ts
  protected readonly slotActionTarget = signal<ArenaSlot | null>(null);
  protected readonly manualBookingOpen = signal(false);
  protected readonly manualCourtId = signal<string | null>(null);
  protected readonly manualStartTime = signal<string | null>(null);
  protected readonly manualEndTime = signal<string | null>(null);
  protected readonly manualDateKey = signal('');
```

E os métodos, junto de `confirmUnblock`:

```ts
  protected openManualBooking(courtId: string | null, startTime: string | null, endTime: string | null): void {
    this.manualCourtId.set(courtId);
    this.manualStartTime.set(startTime);
    this.manualEndTime.set(endTime);
    this.manualDateKey.set(this.selectedDateKey());
    this.manualBookingOpen.set(true);
  }

  protected chooseReserveFromSheet(): void {
    const slot = this.slotActionTarget();
    if (!slot) return;
    this.slotActionTarget.set(null);
    this.manualDateKey.set(slot.dateKey);
    this.manualCourtId.set(slot.courtId);
    this.manualStartTime.set(slot.startTime);
    this.manualEndTime.set(slot.endTime);
    this.manualBookingOpen.set(true);
  }

  protected chooseBlockFromSheet(): void {
    const slot = this.slotActionTarget();
    if (!slot) return;
    this.slotActionTarget.set(null);
    this.blockError.set(null);
    this.blockReason.set('manutencao');
    this.blockNote.set('');
    this.blockTarget.set(slot);
  }
```

Repare que `chooseReserveFromSheet` usa `slot.dateKey`, não `selectedDateKey()`: na visão Semana o gestor clica num horário de outro dia da semana, e a reserva tem que nascer no dia clicado.

- [ ] **Step 7: Desviar o clique em horário livre para a folha de escolha**

Em `onBlockClick`, trocar o ramo de disponível:

```ts
    if (slot.status === 'available') {
      this.blockError.set(null);
      this.blockReason.set('manutencao');
      this.blockNote.set('');
      this.blockTarget.set(slot);
      return;
    }
```

por:

```ts
    if (slot.status === 'available') {
      this.slotActionTarget.set(slot);
      return;
    }
```

O corte `if (this.readOnly()) return;` que já existe logo acima continua sendo a fonte de verdade: cargo sem escrita em `agenda` não chega nem na folha de escolha.

- [ ] **Step 8: Build e testes**

Run: `cd frontend && npx ng build arena --configuration development && npx ng test arena --watch=false --browsers=ChromeHeadless`
Expected: build limpo e todos os specs passando.

- [ ] **Step 9: Verificar no navegador**

Teste de função pura não pega fiação — esta verificação é obrigatória, não opcional.

Subir o preview com `preview_start` na configuração **`arena`** que já existe no `.claude/launch.json` (`npm --prefix frontend run start:arena -- --port 4212`, servindo em http://localhost:4212). Logado como gestor de uma arena com quadra cadastrada:

1. Abrir **Agenda de quadras**. Confirmar que **Nova reserva** não está mais cinza.
2. Clicar num horário **livre** da grade: a folha de escolha aparece com o intervalo e o nome da quadra.
3. Escolher **Bloquear horário**: o modal de bloqueio antigo abre igual a antes (nada regrediu).
4. Fechar, clicar de novo no horário livre e escolher **Reservar horário**: quadra, data e horário vêm preenchidos, e o campo Valor preenche sozinho com a cotação.
5. Digitar um nome de cliente, confirmar, e ver o bloco virar **Reservado** na grade sem recarregar a página.
6. Repetir no mesmo horário: a callable deve recusar com "Esse horário já está reservado.".
7. Abrir pelo botão do header: quadra e horário em branco, data igual à selecionada.
8. Trocar pra visão **Semana**, clicar num horário livre de outro dia e confirmar que a reserva nasce no dia clicado, não no dia selecionado no header.

Checar `read_console_messages` por erro e `read_network_requests` pela chamada das callables. Anexar um screenshot da grade com a reserva criada.

- [ ] **Step 10: Commit**

```bash
git add frontend/projects/arena/src/app/painel/agenda/panel-agenda.component.ts
git commit -m "feat(arena): Nova reserva na agenda com folha de escolha no horário livre"
```

---

## Depois do plano

Antes de considerar entregue: **deploy das functions primeiro**, portal depois.

```bash
cd functions && npx firebase deploy --only functions:quoteArenaManualBooking,functions:createArenaManualBooking --project volley-track-dev-4596c
```

Publicar o portal antes disso deixa o botão vivo chamando callable que não existe — o gestor leva um NOT FOUND cru.
