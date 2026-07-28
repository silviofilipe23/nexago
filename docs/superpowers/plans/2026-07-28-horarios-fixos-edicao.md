# Horários fixos — editar, pausar, valor mensal, calendário e busca de mensalista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar edição, pausa/retomada, forma de pagamento (mensal/por ocorrência), valor
mensal estimado, calendário de data início/fim e busca de atleta (com opção avulso) à tela
"Horários fixos" do portal da arena — hoje só permite criar e encerrar.

**Architecture:** Três Cloud Functions novas (`updateArenaRecurringBooking`,
`pauseArenaRecurringBooking`, `resumeArenaRecurringBooking`) reaproveitam o mecanismo já existente
de cancelar-ocorrências-futuras + materializar (usado hoje por criar/cancelar). No client Angular,
o modal de criação vira um modal único de criar/editar, ganha dois componentes novos
(`ar-date-range-picker`, `ar-athlete-search-field`) e a tabela passa a listar séries `active` e
`paused`. O app Flutter ganha só o ajuste mínimo pra não esconder silenciosamente séries pausadas.

**Tech Stack:** Firebase Cloud Functions v2 (TypeScript, `onCall`), Angular 18+ standalone
components com signals, Firestore, Flutter/Dart (Riverpod).

## Global Constraints

- Escrita em `arenaRecurringBookings` é 100% via Admin SDK — nenhuma mudança em
  `firestore.rules` (a coleção já tem `allow create, update, delete: if false`).
- Nenhum índice novo do Firestore — `where('status','in',[...])` reaproveita o índice composto
  `arenaId+status` que já existe.
- `paymentType` é só informativo nesta fase — nenhuma automação de cobrança, nenhuma mudança em
  `paymentChannel`/`paymentStatus` das ocorrências materializadas.
- Retrocompatibilidade: docs existentes sem `paymentType`/`pausedAt` devem ser lidos com fallback
  seguro (`'per_occurrence'`/`null`) nos três lados (Angular, Cloud Functions, Flutter).
- Português nas strings de UI e mensagens de erro; inglês nos identificadores de código.
- Sem paginação/busca server-side na busca de atleta nesta versão (YAGNI — evoluir só se a base
  de seguidores da arena crescer a ponto de doer).
- Sem UI de editar/pausar/retomar no app Flutter nesta rodada — só o portal web.

---

## Fase 1 — Backend (`functions/src`)

### Task 1: Extrair `validateRecurringInput` e refatorar a criação pra usá-la

**Files:**
- Modify: `functions/src/arena-recurring-booking.ts:462-541` (interface `CreateRecurringInput` e
  bloco de validação de `createArenaRecurringBookingHandler`)
- Test: `functions/src/arena-recurring-booking.test.ts`

**Interfaces:**
- Produces: `export interface RawRecurringInput { arenaId?: string; courtId?: string; weekday?: number; startTime?: string; endTime?: string; athleteId?: string; customerName?: string; amountReais?: number; startDate?: string; endDate?: string; paymentType?: string; }`, `export interface ValidatedRecurringInput { arenaId: string; courtId: string; weekday: number; startTime: string; endTime: string; athleteId: string | null; customerName: string | null; amountReais: number; startDate: string; endDate: string | null; paymentType: "per_occurrence" | "monthly"; }`, `export function validateRecurringInput(input: RawRecurringInput, todayKey: string, opts?: {allowPastStartDate?: boolean}): ValidatedRecurringInput` (lança `HttpsError("invalid-argument", ...)`).
- Consumes: `toMinutes`, `isValidDateKey` (já existem no arquivo, linhas 50 e 79).

- [ ] **Step 1: Escrever os testes de `validateRecurringInput` (ainda falhando — a função não existe)**

Adicionar ao final de `functions/src/arena-recurring-booking.test.ts`:

```ts
import {validateRecurringInput} from "./arena-recurring-booking";

describe("validateRecurringInput", () => {
  const todayKey = "2026-07-28";
  const validBase = {
    arenaId: "arena1",
    courtId: "court1",
    weekday: 2,
    startTime: "19:00",
    endTime: "20:00",
    amountReais: 100,
    customerName: "João Silva",
  };

  it("normaliza um payload válido, com paymentType default per_occurrence", () => {
    const result = validateRecurringInput(validBase, todayKey);
    assert.deepEqual(result, {
      arenaId: "arena1",
      courtId: "court1",
      weekday: 2,
      startTime: "19:00",
      endTime: "20:00",
      athleteId: null,
      customerName: "João Silva",
      amountReais: 100,
      startDate: todayKey,
      endDate: null,
      paymentType: "per_occurrence",
    });
  });

  it("aceita paymentType monthly explícito", () => {
    const result = validateRecurringInput({...validBase, paymentType: "monthly"}, todayKey);
    assert.equal(result.paymentType, "monthly");
  });

  it("qualquer paymentType desconhecido cai pra per_occurrence", () => {
    const result = validateRecurringInput({...validBase, paymentType: "lixo"}, todayKey);
    assert.equal(result.paymentType, "per_occurrence");
  });

  it("rejeita arena ou quadra ausentes", () => {
    assert.throws(() => validateRecurringInput({...validBase, arenaId: ""}, todayKey), /Arena e quadra/);
    assert.throws(() => validateRecurringInput({...validBase, courtId: ""}, todayKey), /Arena e quadra/);
  });

  it("rejeita dia da semana fora de 1-7", () => {
    assert.throws(() => validateRecurringInput({...validBase, weekday: 0}, todayKey), /Dia da semana inválido/);
    assert.throws(() => validateRecurringInput({...validBase, weekday: 8}, todayKey), /Dia da semana inválido/);
  });

  it("rejeita horário fora do formato HH:mm ou fim <= início", () => {
    assert.throws(() => validateRecurringInput({...validBase, startTime: "19h"}, todayKey), /Horário inválido/);
    assert.throws(() => validateRecurringInput({...validBase, startTime: "20:00", endTime: "19:00"}, todayKey), /Intervalo de horário inválido/);
  });

  it("rejeita valor por ocorrência <= 0", () => {
    assert.throws(() => validateRecurringInput({...validBase, amountReais: 0}, todayKey), /valor por ocorrência/);
  });

  it("rejeita data de início inválida ou no passado por padrão", () => {
    assert.throws(() => validateRecurringInput({...validBase, startDate: "31/07/2026"}, todayKey), /Data de início inválida/);
    assert.throws(() => validateRecurringInput({...validBase, startDate: "2026-07-01"}, todayKey), /Data de início inválida/);
  });

  it("com allowPastStartDate:true, aceita data de início no passado (edição de série já iniciada)", () => {
    const result = validateRecurringInput({...validBase, startDate: "2026-06-01"}, todayKey, {allowPastStartDate: true});
    assert.equal(result.startDate, "2026-06-01");
  });

  it("rejeita data de término antes da data de início", () => {
    assert.throws(
      () => validateRecurringInput({...validBase, startDate: "2026-08-01", endDate: "2026-07-30"}, todayKey),
      /Data de término inválida/,
    );
  });

  it("exige atleta vinculado ou nome do mensalista", () => {
    assert.throws(
      () => validateRecurringInput({...validBase, customerName: undefined}, todayKey),
      /Vincule um atleta ou informe o nome/,
    );
  });

  it("aceita athleteId no lugar de customerName", () => {
    const result = validateRecurringInput({...validBase, customerName: undefined, athleteId: "ath1"}, todayKey);
    assert.equal(result.athleteId, "ath1");
    assert.equal(result.customerName, null);
  });

  it("rejeita nome do mensalista com mais de 80 caracteres", () => {
    assert.throws(
      () => validateRecurringInput({...validBase, customerName: "x".repeat(81)}, todayKey),
      /Nome do mensalista muito longo/,
    );
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham (função ainda não existe)**

Run: `cd functions && npm run build && node --test lib/arena-recurring-booking.test.js`
Expected: FAIL — `validateRecurringInput is not a function` (ou erro de import/compilação).

- [ ] **Step 3: Implementar `validateRecurringInput`, extraindo a validação de `createArenaRecurringBookingHandler`**

Em `functions/src/arena-recurring-booking.ts`, substituir a interface `CreateRecurringInput`
(linhas 462-473) por:

```ts
export interface RawRecurringInput {
  arenaId?: string;
  courtId?: string;
  weekday?: number;
  startTime?: string;
  endTime?: string;
  athleteId?: string;
  customerName?: string;
  amountReais?: number;
  startDate?: string;
  endDate?: string;
  paymentType?: string;
}

export interface ValidatedRecurringInput {
  arenaId: string;
  courtId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  athleteId: string | null;
  customerName: string | null;
  amountReais: number;
  startDate: string;
  endDate: string | null;
  paymentType: "per_occurrence" | "monthly";
}

/**
 * Valida e normaliza o payload comum a criar/editar horário fixo. Lança
 * HttpsError("invalid-argument", ...) no primeiro problema encontrado.
 * `allowPastStartDate` é usado pela edição: uma série já iniciada tem
 * `startDate` no passado por natureza, e reenviar o mesmo valor não deve
 * ser rejeitado.
 */
export function validateRecurringInput(
  input: RawRecurringInput,
  todayKey: string,
  opts: {allowPastStartDate?: boolean} = {},
): ValidatedRecurringInput {
  const arenaId = input.arenaId?.trim() ?? "";
  const courtId = input.courtId?.trim() ?? "";
  const weekday = Number(input.weekday);
  const startTime = input.startTime?.trim() ?? "";
  const endTime = input.endTime?.trim() ?? "";
  const athleteId = input.athleteId?.trim() || null;
  const customerName = input.customerName?.trim() || null;
  const amountReais = Number(input.amountReais);
  const startDate = input.startDate?.trim() || todayKey;
  const endDate = input.endDate?.trim() || null;
  const paymentType: "per_occurrence" | "monthly" = input.paymentType === "monthly" ? "monthly" : "per_occurrence";

  if (!arenaId || !courtId) {
    throw new HttpsError("invalid-argument", "Arena e quadra são obrigatórias.");
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new HttpsError("invalid-argument", "Dia da semana inválido.");
  }
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    throw new HttpsError("invalid-argument", "Horário inválido.");
  }
  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  if (endMin === 0 && startMin > 0) endMin = 24 * 60;
  if (endMin <= startMin) {
    throw new HttpsError("invalid-argument", "Intervalo de horário inválido.");
  }
  if (!Number.isFinite(amountReais) || amountReais <= 0) {
    throw new HttpsError("invalid-argument", "Informe o valor por ocorrência.");
  }
  if (!isValidDateKey(startDate) || (!opts.allowPastStartDate && startDate < todayKey)) {
    throw new HttpsError("invalid-argument", "Data de início inválida.");
  }
  if (endDate != null && (!isValidDateKey(endDate) || endDate < startDate)) {
    throw new HttpsError("invalid-argument", "Data de término inválida.");
  }
  if (!athleteId && !customerName) {
    throw new HttpsError("invalid-argument", "Vincule um atleta ou informe o nome do mensalista.");
  }
  if (customerName != null && customerName.length > 80) {
    throw new HttpsError("invalid-argument", "Nome do mensalista muito longo.");
  }

  return {arenaId, courtId, weekday, startTime, endTime, athleteId, customerName, amountReais, startDate, endDate, paymentType};
}
```

Depois, em `createArenaRecurringBookingHandler` (linhas 488-541 do arquivo original), substituir
todo o bloco de extração/validação manual por:

```ts
async function createArenaRecurringBookingHandler(
  request: Parameters<Parameters<typeof onCall>[0]>[0],
) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const input = (request.data ?? {}) as RawRecurringInput;
  const todayKey = dayKeyFromEventDate(new Date());
  const {
    arenaId, courtId, weekday, startTime, endTime,
    athleteId, customerName, amountReais, startDate, endDate, paymentType,
  } = validateRecurringInput(input, todayKey);
```

E manter o restante do corpo da função (checagem de quadra, checagem de atleta, gate do
Essencial, montagem de `arenaName`/`courtName`, criação de `series`/`seriesRef` etc. — linhas
543-652 do arquivo original) sem mudanças **exceto** que o `seriesRef.set` inicial (linhas
606-614) passa a gravar também `paymentType` e `pausedAt: null`:

```ts
  await seriesRef.set({
    ...series,
    paymentType,
    pausedAt: null,
    // Antes da materialização: o scheduler completa se algo falhar no meio.
    materializedUntil: addDaysToDateKey(todayKey, -1),
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    canceledAt: null,
    cancelReason: null,
  });
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `cd functions && npm run build && node --test lib/arena-recurring-booking.test.js`
Expected: PASS em todos os `describe`, incluindo o novo `validateRecurringInput` e os já
existentes (a refatoração não pode quebrar `occurrenceDatesBetween` etc.).

- [ ] **Step 5: Lint/typecheck**

Run: `cd functions && npm run lint`
Expected: sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add functions/src/arena-recurring-booking.ts functions/src/arena-recurring-booking.test.ts
git commit -m "refactor(functions): extrai validateRecurringInput reaproveitável entre criar e editar horário fixo"
```

---

### Task 2: Cloud Function `updateArenaRecurringBooking`

**Files:**
- Modify: `functions/src/arena-recurring-booking.ts` (nova callable, adicionar depois de
  `cancelArenaRecurringOccurrence`, linha ~791)
- Modify: `functions/src/index.ts:75-79,190-194` (import + export)

**Interfaces:**
- Consumes: `validateRecurringInput` (Task 1), `requireArenaManager` (linha 413),
  `cancelFutureOccurrences` (linha 355), `materializeSeriesOccurrences` (linha 239),
  `addDaysToDateKey`/`RECURRING_HORIZON_DAYS` (já exportados).
- Produces: callable `updateArenaRecurringBooking` — payload
  `{ seriesId, courtId, weekday, startTime, endTime, athleteId?, customerName?, amountReais, startDate, endDate?, paymentType }`,
  retorno `{ seriesId: string; canceledDates: string[]; createdDates: string[]; skippedDates: string[] }`.

- [ ] **Step 1: Implementar a callable**

Adicionar em `functions/src/arena-recurring-booking.ts`, logo depois do fim de
`cancelArenaRecurringOccurrence`:

```ts
interface UpdateSeriesInput extends RawRecurringInput {
  seriesId?: string;
}

export const updateArenaRecurringBooking = onCall(async (request) => {
  try {
    return await updateArenaRecurringBookingHandler(request);
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("updateArenaRecurringBooking: falha inesperada", e);
    throw new HttpsError(
      "internal",
      "Não foi possível salvar as alterações. Tente novamente em instantes.",
    );
  }
});

async function updateArenaRecurringBookingHandler(
  request: Parameters<Parameters<typeof onCall>[0]>[0],
) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }

  const input = (request.data ?? {}) as UpdateSeriesInput;
  const seriesId = input.seriesId?.trim() ?? "";
  if (!seriesId) {
    throw new HttpsError("invalid-argument", "Horário fixo inválido.");
  }

  const db = getFirestore();
  const seriesRef = db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId);
  const seriesSnap = await seriesRef.get();
  if (!seriesSnap.exists) {
    throw new HttpsError("not-found", "Horário fixo não encontrado.");
  }
  const currentData = seriesSnap.data() as Record<string, unknown>;
  const currentStatus = String(currentData["status"] ?? "");
  if (currentStatus !== "active" && currentStatus !== "paused") {
    throw new HttpsError(
      "failed-precondition",
      "Este horário fixo já foi encerrado e não pode ser editado.",
    );
  }
  // arenaId sempre vem do doc já existente, nunca do payload do client
  // (evita um client mal-intencionado tentar editar sob outra arena).
  const arenaId = String(currentData["arenaId"] ?? "");
  await requireArenaManager(db, arenaId, uid);

  const todayKey = dayKeyFromEventDate(new Date());
  const validated = validateRecurringInput({...input, arenaId}, todayKey, {allowPastStartDate: true});

  const courtSnap = await db
    .collection("arenas").doc(arenaId)
    .collection("courts").doc(validated.courtId)
    .get();
  if (!courtSnap.exists) {
    throw new HttpsError("not-found", "Quadra não encontrada.");
  }
  if (validated.athleteId != null) {
    const userSnap = await db.collection("users").doc(validated.athleteId).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Atleta vinculado não encontrado.");
    }
  }

  const courtData = courtSnap.data() as Record<string, unknown>;
  const courtName = typeof courtData["name"] === "string" ?
    (courtData["name"] as string).trim() || "Quadra" :
    "Quadra";
  const arenaName = String(currentData["arenaName"] ?? "Arena");

  const series: RecurringSeriesData = {
    arenaId,
    arenaName,
    courtId: validated.courtId,
    courtName,
    weekday: validated.weekday,
    startTime: validated.startTime,
    endTime: validated.endTime,
    athleteId: validated.athleteId,
    customerName: validated.customerName,
    amountReais: validated.amountReais,
    status: currentStatus,
    startDate: validated.startDate,
    endDate: validated.endDate,
    skippedDates: [],
  };

  const todayMinusOne = addDaysToDateKey(todayKey, -1);
  const horizonKey = addDaysToDateKey(todayKey, RECURRING_HORIZON_DAYS);

  let canceledDates: string[] = [];
  let createdDates: string[] = [];
  let skippedDates: string[] = [];

  if (currentStatus === "active") {
    // Config antiga sai da agenda, config nova entra — garante que nenhuma
    // ocorrência futura fica com dia/horário/quadra/valor desatualizados.
    canceledDates = await cancelFutureOccurrences(db, seriesId, "recurring_series_updated");
    const result = await materializeSeriesOccurrences(db, seriesId, series, todayMinusOne, horizonKey);
    createdDates = result.createdDates;
    skippedDates = result.skippedDates;
  }
  // Se `paused`: só os campos da série mudam agora — a rematerialização
  // acontece em resumeArenaRecurringBooking, com a config já atualizada.

  await seriesRef.set({
    ...series,
    paymentType: validated.paymentType,
    skippedDates,
    materializedUntil: currentStatus === "active" ?
      horizonKey :
      String(currentData["materializedUntil"] ?? todayMinusOne),
  }, {merge: true});

  logger.info("updateArenaRecurringBooking: série atualizada", {
    seriesId,
    arenaId,
    status: currentStatus,
    canceled: canceledDates.length,
    created: createdDates.length,
    skipped: skippedDates.length,
  });

  return {seriesId, canceledDates, createdDates, skippedDates};
}
```

- [ ] **Step 2: Exportar em `functions/src/index.ts`**

No bloco de import (linhas 75-79):

```ts
import {
  createArenaRecurringBooking,
  cancelArenaRecurringBooking,
  cancelArenaRecurringOccurrence,
  updateArenaRecurringBooking,
} from "./arena-recurring-booking";
```

No bloco de export (linhas 190-194):

```ts
  createArenaRecurringBooking,
  cancelArenaRecurringBooking,
  cancelArenaRecurringOccurrence,
  updateArenaRecurringBooking,
  materializeArenaRecurringBookings,
```

- [ ] **Step 3: Typecheck**

Run: `cd functions && npm run lint`
Expected: sem erros — confirma que `updateArenaRecurringBookingHandler` bate com os tipos de
`RecurringSeriesData`, `validateRecurringInput` etc.

- [ ] **Step 4: Rodar a suíte de testes existente (garantir que nada quebrou)**

Run: `cd functions && npm run build && node --test lib/arena-recurring-booking.test.js`
Expected: PASS (mesmos testes da Task 1, sem regressão).

- [ ] **Step 5: Commit**

```bash
git add functions/src/arena-recurring-booking.ts functions/src/index.ts
git commit -m "feat(functions): adiciona updateArenaRecurringBooking (editar série existente)"
```

---

### Task 3: Cloud Functions `pauseArenaRecurringBooking` e `resumeArenaRecurringBooking`

**Files:**
- Modify: `functions/src/arena-recurring-booking.ts` (duas callables novas + helper
  `parseRecurringSeriesData` compartilhado)
- Modify: `functions/src/arena-recurring-materializer.ts:16-35` (reusa o helper compartilhado em
  vez do `parseSeries` local)
- Modify: `functions/src/index.ts:75-79,190-194` (import + export)

**Interfaces:**
- Produces: `export function parseRecurringSeriesData(data: Record<string, unknown>): RecurringSeriesData`;
  callable `pauseArenaRecurringBooking` — payload `{ seriesId, reason? }`, retorno
  `{ seriesId: string; releasedDates: string[] }`; callable `resumeArenaRecurringBooking` —
  payload `{ seriesId }`, retorno `{ seriesId: string; createdDates: string[]; skippedDates: string[] }`.
- Consumes: `cancelFutureOccurrences`, `materializeSeriesOccurrences`, `notifyLinkedAthleteSafe`,
  `requireArenaManager` (todas já no arquivo).

- [ ] **Step 1: Extrair `parseRecurringSeriesData` (reaproveitando o `parseSeries` já existente no materializador)**

Adicionar em `functions/src/arena-recurring-booking.ts`, logo depois da definição de
`RecurringSeriesData` (linha 44):

```ts
/** Reconstrói `RecurringSeriesData` a partir do doc cru de `arenaRecurringBookings`
 *  — usado tanto pelo scheduler diário quanto por `resumeArenaRecurringBooking`. */
export function parseRecurringSeriesData(data: Record<string, unknown>): RecurringSeriesData {
  return {
    arenaId: String(data["arenaId"] ?? ""),
    arenaName: String(data["arenaName"] ?? "Arena"),
    courtId: String(data["courtId"] ?? ""),
    courtName: String(data["courtName"] ?? "Quadra"),
    weekday: Number(data["weekday"] ?? 0),
    startTime: String(data["startTime"] ?? ""),
    endTime: String(data["endTime"] ?? ""),
    athleteId: typeof data["athleteId"] === "string" ? data["athleteId"] : null,
    customerName: typeof data["customerName"] === "string" ? data["customerName"] : null,
    amountReais: Number(data["amountReais"] ?? 0),
    status: String(data["status"] ?? ""),
    startDate: String(data["startDate"] ?? ""),
    endDate: typeof data["endDate"] === "string" ? data["endDate"] : null,
    skippedDates: Array.isArray(data["skippedDates"]) ?
      (data["skippedDates"] as unknown[]).map(String) :
      [],
  };
}
```

Em `functions/src/arena-recurring-materializer.ts`, remover a função local `parseSeries`
(linhas 16-35) e o tipo `RecurringSeriesData` do import (ele não é mais referenciado
diretamente ali), trocando por:

```ts
import {
  ARENA_RECURRING_BOOKINGS,
  RECURRING_HORIZON_DAYS,
  WEEKDAY_LABELS_PT,
  addDaysToDateKey,
  cancelFutureOccurrences,
  materializeSeriesOccurrences,
  parseRecurringSeriesData,
} from "./arena-recurring-booking";
```

E trocar a chamada `parseSeries(doc.data() as Record<string, unknown>)` (linha 85 do arquivo
original) por `parseRecurringSeriesData(doc.data() as Record<string, unknown>)`.

- [ ] **Step 2: Implementar `pauseArenaRecurringBooking`**

Adicionar em `functions/src/arena-recurring-booking.ts`, depois de
`updateArenaRecurringBooking` (Task 2):

```ts
interface PauseSeriesInput {
  seriesId?: string;
  reason?: string;
}

export const pauseArenaRecurringBooking = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as PauseSeriesInput;
  const seriesId = input.seriesId?.trim() ?? "";
  if (!seriesId) {
    throw new HttpsError("invalid-argument", "Horário fixo inválido.");
  }

  const db = getFirestore();
  const seriesRef = db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId);
  const seriesSnap = await seriesRef.get();
  if (!seriesSnap.exists) {
    throw new HttpsError("not-found", "Horário fixo não encontrado.");
  }
  const seriesData = seriesSnap.data() as Record<string, unknown>;
  const arenaId = String(seriesData["arenaId"] ?? "");
  await requireArenaManager(db, arenaId, uid);

  if (String(seriesData["status"]) !== "active") {
    throw new HttpsError("failed-precondition", "Só é possível pausar um horário fixo ativo.");
  }

  const reason = input.reason?.trim().slice(0, 500) || null;
  await seriesRef.set({
    status: "paused",
    pausedAt: FieldValue.serverTimestamp(),
    pauseReason: reason,
  }, {merge: true});

  const releasedDates = await cancelFutureOccurrences(db, seriesId, "recurring_series_paused");

  await notifyLinkedAthleteSafe({
    athleteId: (seriesData["athleteId"] as string | null) ?? null,
    title: "Horário fixo pausado",
    body: `Seu horário fixo em ${String(seriesData["arenaName"] ?? "Arena")} foi pausado ` +
      "pela arena. As próximas reservas foram liberadas.",
    type: "recurring_booking_paused",
    data: {recurringBookingId: seriesId, arenaId},
  });

  logger.info("pauseArenaRecurringBooking: série pausada", {
    seriesId,
    arenaId,
    released: releasedDates.length,
  });

  return {seriesId, releasedDates};
});
```

- [ ] **Step 3: Implementar `resumeArenaRecurringBooking`**

```ts
interface ResumeSeriesInput {
  seriesId?: string;
}

export const resumeArenaRecurringBooking = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const input = (request.data ?? {}) as ResumeSeriesInput;
  const seriesId = input.seriesId?.trim() ?? "";
  if (!seriesId) {
    throw new HttpsError("invalid-argument", "Horário fixo inválido.");
  }

  const db = getFirestore();
  const seriesRef = db.collection(ARENA_RECURRING_BOOKINGS).doc(seriesId);
  const seriesSnap = await seriesRef.get();
  if (!seriesSnap.exists) {
    throw new HttpsError("not-found", "Horário fixo não encontrado.");
  }
  const seriesData = seriesSnap.data() as Record<string, unknown>;
  const arenaId = String(seriesData["arenaId"] ?? "");
  await requireArenaManager(db, arenaId, uid);

  if (String(seriesData["status"]) !== "paused") {
    throw new HttpsError("failed-precondition", "Só é possível retomar um horário fixo pausado.");
  }

  await seriesRef.set({
    status: "active",
    pausedAt: null,
    pauseReason: null,
  }, {merge: true});

  const series = parseRecurringSeriesData({...seriesData, status: "active"});
  const todayKey = dayKeyFromEventDate(new Date());
  const horizonKey = addDaysToDateKey(todayKey, RECURRING_HORIZON_DAYS);
  const result = await materializeSeriesOccurrences(
    db,
    seriesId,
    series,
    addDaysToDateKey(todayKey, -1),
    horizonKey,
  );

  // `series.skippedDates` (via parseRecurringSeriesData) já carrega as datas
  // canceladas individualmente antes da pausa (cancelArenaRecurringOccurrence)
  // — mescla com qualquer conflito novo encontrado nesta materialização, sem
  // isso o registro das cancelamentos pontuais se perderia no retomar.
  await seriesRef.set({
    materializedUntil: horizonKey,
    skippedDates: Array.from(new Set([...series.skippedDates, ...result.skippedDates])),
  }, {merge: true});

  await notifyLinkedAthleteSafe({
    athleteId: series.athleteId,
    title: "Horário fixo retomado",
    body: `Seu horário fixo em ${series.arenaName} foi retomado pela arena.`,
    type: "recurring_booking_resumed",
    data: {recurringBookingId: seriesId, arenaId},
  });

  logger.info("resumeArenaRecurringBooking: série retomada", {
    seriesId,
    arenaId,
    created: result.createdDates.length,
    skipped: result.skippedDates.length,
  });

  return {seriesId, createdDates: result.createdDates, skippedDates: result.skippedDates};
});
```

- [ ] **Step 4: Exportar as duas callables em `functions/src/index.ts`**

Import (linhas 75-79, já editado na Task 2):

```ts
import {
  createArenaRecurringBooking,
  cancelArenaRecurringBooking,
  cancelArenaRecurringOccurrence,
  updateArenaRecurringBooking,
  pauseArenaRecurringBooking,
  resumeArenaRecurringBooking,
} from "./arena-recurring-booking";
```

Export (linhas 190-194, já editado na Task 2):

```ts
  createArenaRecurringBooking,
  cancelArenaRecurringBooking,
  cancelArenaRecurringOccurrence,
  updateArenaRecurringBooking,
  pauseArenaRecurringBooking,
  resumeArenaRecurringBooking,
  materializeArenaRecurringBookings,
```

- [ ] **Step 5: Typecheck + suíte de testes**

Run: `cd functions && npm run lint && npm run build && node --test lib/arena-recurring-booking.test.js`
Expected: sem erros de tipo, todos os testes de `describe("occurrenceDatesBetween", ...)` e
`describe("validateRecurringInput", ...)` continuam passando (a extração de
`parseRecurringSeriesData` não muda o comportamento de nenhum deles).

- [ ] **Step 6: Commit**

```bash
git add functions/src/arena-recurring-booking.ts functions/src/arena-recurring-materializer.ts functions/src/index.ts
git commit -m "feat(functions): adiciona pauseArenaRecurringBooking e resumeArenaRecurringBooking"
```

---

### Task 4: Encerrar a partir de `paused` + cota do Essencial conta séries pausadas

**Files:**
- Modify: `functions/src/arena-recurring-booking.ts:561-576` (gate do Essencial em
  `createArenaRecurringBookingHandler`)
- Modify: `functions/src/arena-recurring-booking.ts:680-682` (pré-condição de
  `cancelArenaRecurringBooking`)

- [ ] **Step 1: Cota do Essencial passa a contar `active` + `paused`**

Trocar (dentro de `createArenaRecurringBookingHandler`):

```ts
  if (!isArenaEntitledPro(arenaData, Date.now())) {
    const activeCount = await db
      .collection(ARENA_RECURRING_BOOKINGS)
      .where("arenaId", "==", arenaId)
      .where("status", "==", "active")
      .count()
      .get();
    if (activeCount.data().count >= ESSENCIAL_MAX_ACTIVE_RECURRING) {
```

por:

```ts
  if (!isArenaEntitledPro(arenaData, Date.now())) {
    // Pausada continua contando na cota — senão dá pra "furar" o limite
    // pausando uma série sem liberar de fato o slot do plano.
    const activeCount = await db
      .collection(ARENA_RECURRING_BOOKINGS)
      .where("arenaId", "==", arenaId)
      .where("status", "in", ["active", "paused"])
      .count()
      .get();
    if (activeCount.data().count >= ESSENCIAL_MAX_ACTIVE_RECURRING) {
```

- [ ] **Step 2: `cancelArenaRecurringBooking` aceita encerrar direto de `paused`**

Trocar (dentro do callable `cancelArenaRecurringBooking`):

```ts
  if (String(seriesData["status"]) !== "active") {
    throw new HttpsError("failed-precondition", "Este horário fixo já foi encerrado.");
  }
```

por:

```ts
  const currentStatus = String(seriesData["status"] ?? "");
  if (currentStatus !== "active" && currentStatus !== "paused") {
    throw new HttpsError("failed-precondition", "Este horário fixo já foi encerrado.");
  }
```

(`cancelFutureOccurrences` já é idempotente — só mexe em ocorrências `active`/`confirmed`, então
chamá-la numa série já pausada não recancela nada indevidamente.)

- [ ] **Step 3: Typecheck + suíte de testes**

Run: `cd functions && npm run lint && npm run build && node --test lib/arena-recurring-booking.test.js`
Expected: sem erros, sem regressão.

- [ ] **Step 4: Commit**

```bash
git add functions/src/arena-recurring-booking.ts
git commit -m "fix(functions): cota do Essencial conta séries pausadas + permite encerrar série pausada"
```

---

## Fase 2 — Angular (portal da arena): modelo e dados

### Task 5: Modelo (`arena-recurring-booking.model.ts`) — status pausado, forma de pagamento, valor mensal

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/recurring/arena-recurring-booking.model.ts`
- Test: `frontend/projects/arena/src/app/painel/recurring/arena-recurring-booking.model.spec.ts` (novo)

**Interfaces:**
- Produces: `ArenaRecurringStatus = 'active' | 'paused' | 'canceled'`,
  `ArenaRecurringPaymentType = 'per_occurrence' | 'monthly'`,
  `ArenaRecurringBooking` ganha `paymentType: ArenaRecurringPaymentType; pausedAt: Date | null;`,
  `export const AVG_OCCURRENCES_PER_MONTH = 52 / 12;`,
  `export function estimateMonthlyReais(amountReais: number): number`.

- [ ] **Step 1: Escrever o spec (falhando — os campos/funções ainda não existem)**

Criar `frontend/projects/arena/src/app/painel/recurring/arena-recurring-booking.model.spec.ts`:

```ts
import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { arenaRecurringBookingFromDoc, estimateMonthlyReais } from './arena-recurring-booking.model';

function fakeDoc(id: string, data: Record<string, unknown>): QueryDocumentSnapshot {
  return {
    id,
    data: () => data,
  } as unknown as QueryDocumentSnapshot;
}

describe('arenaRecurringBookingFromDoc — status/pagamento/pausa', () => {
  it('status paused é reconhecido (hoje só active/canceled eram tratados)', () => {
    const s = arenaRecurringBookingFromDoc(fakeDoc('s1', { status: 'paused' }));
    expect(s.status).toBe('paused');
  });

  it('status desconhecido cai em active (mesmo fallback de hoje)', () => {
    const s = arenaRecurringBookingFromDoc(fakeDoc('s2', { status: 'algo-invalido' }));
    expect(s.status).toBe('active');
  });

  it('doc antigo sem paymentType vira per_occurrence (retrocompatibilidade)', () => {
    const s = arenaRecurringBookingFromDoc(fakeDoc('s3', {}));
    expect(s.paymentType).toBe('per_occurrence');
  });

  it('paymentType monthly é preservado', () => {
    const s = arenaRecurringBookingFromDoc(fakeDoc('s4', { paymentType: 'monthly' }));
    expect(s.paymentType).toBe('monthly');
  });

  it('pausedAt vira Date quando é Timestamp, e null quando ausente', () => {
    const when = new Date('2026-07-20T12:00:00Z');
    const paused = arenaRecurringBookingFromDoc(fakeDoc('s5', { pausedAt: Timestamp.fromDate(when) }));
    const notPaused = arenaRecurringBookingFromDoc(fakeDoc('s6', {}));
    expect(paused.pausedAt?.getTime()).toBe(when.getTime());
    expect(notPaused.pausedAt).toBeNull();
  });
});

describe('estimateMonthlyReais', () => {
  it('multiplica pela média de ocorrências por mês (~4,33)', () => {
    expect(estimateMonthlyReais(100)).toBeCloseTo(433.33, 1);
  });

  it('valor zero ou negativo retorna 0', () => {
    expect(estimateMonthlyReais(0)).toBe(0);
    expect(estimateMonthlyReais(-10)).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o spec e confirmar que falha**

Run: `cd frontend && npx ng test arena --watch=false --include='**/arena-recurring-booking.model.spec.ts'`
Expected: FAIL — `estimateMonthlyReais` não existe / `paymentType` é `undefined`.

- [ ] **Step 3: Implementar as mudanças no modelo**

Editar `frontend/projects/arena/src/app/painel/recurring/arena-recurring-booking.model.ts`:

Trocar a linha 20 (`export type ArenaRecurringStatus = 'active' | 'canceled';`) por:

```ts
export type ArenaRecurringStatus = 'active' | 'paused' | 'canceled';
export type ArenaRecurringPaymentType = 'per_occurrence' | 'monthly';

/** Média de ocorrências por mês pra recorrência semanal de 1 dia (52 semanas / 12 meses). */
export const AVG_OCCURRENCES_PER_MONTH = 52 / 12;

export function estimateMonthlyReais(amountReais: number): number {
  if (!Number.isFinite(amountReais) || amountReais <= 0) return 0;
  return amountReais * AVG_OCCURRENCES_PER_MONTH;
}
```

Na interface `ArenaRecurringBooking` (linhas 22-40), acrescentar depois de `status`:

```ts
  status: ArenaRecurringStatus;
  paymentType: ArenaRecurringPaymentType;
  pausedAt: Date | null;
```

Trocar as funções `str`/`optional`/`time` (linhas 42-54) mantendo-as e acrescentar logo abaixo:

```ts
function parseStatus(v: unknown): ArenaRecurringStatus {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === 'paused' || s === 'canceled' ? s : 'active';
}

function parsePaymentType(v: unknown): ArenaRecurringPaymentType {
  return v === 'monthly' ? 'monthly' : 'per_occurrence';
}
```

Em `arenaRecurringBookingFromDoc` (linhas 56-80), trocar a linha do `status` (linha 74):

```ts
    status: str(d['status'], 'active') === 'canceled' ? 'canceled' : 'active',
```

por:

```ts
    status: parseStatus(d['status']),
    paymentType: parsePaymentType(d['paymentType']),
    pausedAt: d['pausedAt'] instanceof Timestamp ? (d['pausedAt'] as Timestamp).toDate() : null,
```

- [ ] **Step 4: Rodar o spec de novo e confirmar que passa**

Run: `cd frontend && npx ng test arena --watch=false --include='**/arena-recurring-booking.model.spec.ts'`
Expected: PASS em todos os `it`.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/recurring/arena-recurring-booking.model.ts frontend/projects/arena/src/app/painel/recurring/arena-recurring-booking.model.spec.ts
git commit -m "feat(arena): modelo de horário fixo ganha status pausado, forma de pagamento e valor mensal estimado"
```

---

### Task 6: Repositório (`recurring-bookings-repository.ts`) — série visível (ativa+pausada), editar, pausar, retomar

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/recurring/recurring-bookings-repository.ts`

**Interfaces:**
- Consumes: `ArenaRecurringPaymentType` (Task 5).
- Produces: `watchVisibleSeries(db, arenaId, onChange)` (substitui `watchActiveSeries`),
  `updateRecurringSeries(functions, input: UpdateRecurringSeriesInput): Promise<CreateRecurringSeriesResult>`,
  `pauseRecurringSeries(functions, seriesId, reason?): Promise<void>`,
  `resumeRecurringSeries(functions, seriesId): Promise<void>`.

- [ ] **Step 1: Editar `recurring-bookings-repository.ts`**

Trocar o import do modelo (linha 3):

```ts
import { arenaRecurringBookingFromDoc, type ArenaRecurringBooking, type ArenaRecurringPaymentType } from './arena-recurring-booking.model';
```

Trocar `watchActiveSeries` (linhas 11-22) por:

```ts
export function watchVisibleSeries(db: Firestore, arenaId: string, onChange: (series: ArenaRecurringBooking[]) => void): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'arenaRecurringBookings'),
      where('arenaId', '==', arenaId),
      where('status', 'in', ['active', 'paused']),
    ),
    (snap) => {
      const list = snap.docs
        .map(arenaRecurringBookingFromDoc)
        .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
      onChange(list);
    },
    () => onChange([]),
  );
}
```

Trocar `CreateRecurringSeriesInput` (linhas 24-35) por:

```ts
export interface CreateRecurringSeriesInput {
  arenaId: string;
  courtId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  amountReais: number;
  athleteId?: string;
  customerName?: string;
  startDate?: string;
  endDate?: string;
  // Opcional (não `paymentType: ArenaRecurringPaymentType` obrigatório) de propósito: o
  // backend já assume 'per_occurrence' quando ausente (Task 1), e isso evita quebrar a
  // chamada em panel-recurring.component.ts antes da Task 11 reescrever o formulário.
  paymentType?: ArenaRecurringPaymentType;
}

export interface UpdateRecurringSeriesInput extends CreateRecurringSeriesInput {
  seriesId: string;
}
```

Acrescentar, depois de `createRecurringSeries` (linha 56):

```ts
export async function updateRecurringSeries(functions: Functions, input: UpdateRecurringSeriesInput): Promise<CreateRecurringSeriesResult> {
  const call = httpsCallable<UpdateRecurringSeriesInput, CreateRecurringSeriesResult>(functions, 'updateArenaRecurringBooking');
  try {
    const result = await call(input);
    return result.data;
  } catch (err) {
    throw mapFunctionsError(err);
  }
}
```

Acrescentar, depois de `cancelRecurringSeries` (final do arquivo):

```ts
export async function pauseRecurringSeries(functions: Functions, seriesId: string, reason?: string): Promise<void> {
  const call = httpsCallable(functions, 'pauseArenaRecurringBooking');
  try {
    await call({ seriesId, ...(reason ? { reason } : {}) });
  } catch (err) {
    throw mapFunctionsError(err);
  }
}

export async function resumeRecurringSeries(functions: Functions, seriesId: string): Promise<void> {
  const call = httpsCallable(functions, 'resumeArenaRecurringBooking');
  try {
    await call({ seriesId });
  } catch (err) {
    throw mapFunctionsError(err);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx ng build arena`
Expected: falha nesse ponto é esperada — `panel-recurring.component.ts` ainda importa
`watchActiveSeries`, que não existe mais (virou `watchVisibleSeries`). `paymentType` é opcional
em `CreateRecurringSeriesInput` de propósito (ver comentário no código acima), então a chamada
existente a `createRecurringSeries` sem esse campo **não** quebra. Confirme que o **único** erro
reportado é o import de `watchActiveSeries` em `panel-recurring.component.ts` (não em
`recurring-bookings-repository.ts` nem em `arena-recurring-booking.model.ts`) — isso valida que
o repositório em si está correto. Esse erro é resolvido na Task 10, que troca a chamada pra
`watchVisibleSeries`.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/recurring/recurring-bookings-repository.ts
git commit -m "feat(arena): repositório de horário fixo ganha editar, pausar, retomar e listar séries pausadas"
```

---

### Task 7: Busca única de seguidores (`followers-repository.ts`) — usada pela busca de atleta

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/followers/followers-repository.ts`

**Interfaces:**
- Produces: `fetchFollowersOnce(db: Firestore, arenaId: string): Promise<ArenaFollower[]>`.
- Consumes: `arenaFollowerFromDoc` (já existe no arquivo).

- [ ] **Step 1: Adicionar `fetchFollowersOnce`**

Editar `frontend/projects/arena/src/app/painel/followers/followers-repository.ts`, trocar o
import (linha 1):

```ts
import { collection, getDocs, limit, onSnapshot, orderBy, query, type Firestore, type Unsubscribe } from 'firebase/firestore';
```

E acrescentar, depois de `watchFollowers`:

```ts
/** Foto única dos seguidores (sem listener) — usada pela busca de atleta ao vincular
 *  um mensalista de horário fixo, que só precisa de uma lista no momento em que abre. */
export async function fetchFollowersOnce(db: Firestore, arenaId: string): Promise<ArenaFollower[]> {
  const snap = await getDocs(
    query(collection(db, 'arenas', arenaId, 'followers'), orderBy('createdAt', 'desc'), limit(FOLLOWERS_LIMIT)),
  );
  return snap.docs.map(arenaFollowerFromDoc);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx ng build arena`
Expected: mesmo estado da Task 6 (o único erro pendente continua em `panel-recurring.component.ts`).

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/followers/followers-repository.ts
git commit -m "feat(arena): fetchFollowersOnce — leitura única de seguidores pra busca de atleta"
```

---

## Fase 3 — Angular: componentes novos

### Task 8: `ar-date-range-picker` (calendário de data início/fim)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/date-range-picker-math.ts`
- Test: `frontend/projects/arena/src/app/painel/ui/date-range-picker-math.spec.ts`
- Create: `frontend/projects/arena/src/app/painel/ui/date-range-picker.component.ts`
- Modify: `frontend/projects/arena/src/app/painel/ui/icon.component.ts` (ícone `chevron-left`)

**Interfaces:**
- Produces (math): `export interface MonthGridDay { dateKey: string; day: number; inMonth: boolean; }`,
  `export function buildMonthGrid(year: number, month: number): MonthGridDay[]` (month é 1-12),
  `export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number }`,
  `export function formatDateKeyPtBr(dateKey: string): string` (`DD/MM/AAAA`),
  `export const MONTH_LABELS_PT: string[]`.
- Produces (component): seletor `ar-date-range-picker`, inputs `startDate: input<string | null>`,
  `endDate: input<string | null>`, `allowOpenEnd: input<boolean>` (default `true`), output
  `rangeChange: output<{ startDate: string; endDate: string | null }>()`.
- Consumes: nada além do Angular core e do CSS global (`--nx-*`).

- [ ] **Step 1: Escrever o spec da matemática do grid (falhando)**

Criar `frontend/projects/arena/src/app/painel/ui/date-range-picker-math.spec.ts`:

```ts
import { buildMonthGrid, formatDateKeyPtBr, shiftMonth } from './date-range-picker-math';

describe('buildMonthGrid', () => {
  it('julho/2026 começa na quarta (30/06) e tem 6 linhas x 7 colunas', () => {
    const grid = buildMonthGrid(2026, 7);
    expect(grid.length).toBe(42);
    expect(grid[0].dateKey).toBe('2026-06-29'); // segunda anterior ao 1º (quarta)
    expect(grid[0].inMonth).toBe(false);
  });

  it('marca inMonth true só pros dias do mês pedido', () => {
    const grid = buildMonthGrid(2026, 7);
    const julyDays = grid.filter((d) => d.inMonth);
    expect(julyDays.length).toBe(31);
    expect(julyDays[0].dateKey).toBe('2026-07-01');
    expect(julyDays[julyDays.length - 1].dateKey).toBe('2026-07-31');
  });

  it('fevereiro bissexto tem 29 dias no mês', () => {
    const grid = buildMonthGrid(2028, 2);
    expect(grid.filter((d) => d.inMonth).length).toBe(29);
  });
});

describe('shiftMonth', () => {
  it('avança e atravessa o ano', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('volta e atravessa o ano', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('dentro do mesmo ano', () => {
    expect(shiftMonth(2026, 7, 1)).toEqual({ year: 2026, month: 8 });
  });
});

describe('formatDateKeyPtBr', () => {
  it('formata YYYY-MM-DD como DD/MM/AAAA', () => {
    expect(formatDateKeyPtBr('2026-07-28')).toBe('28/07/2026');
  });
});
```

- [ ] **Step 2: Rodar o spec e confirmar que falha**

Run: `cd frontend && npx ng test arena --watch=false --include='**/date-range-picker-math.spec.ts'`
Expected: FAIL — módulo `./date-range-picker-math` não existe.

- [ ] **Step 3: Implementar `date-range-picker-math.ts`**

Criar `frontend/projects/arena/src/app/painel/ui/date-range-picker-math.ts`:

```ts
export interface MonthGridDay {
  dateKey: string;
  day: number;
  inMonth: boolean;
}

export const MONTH_LABELS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function toDateKey(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** ISO: 1=segunda … 7=domingo (mesma convenção do resto do horário fixo). */
function isoWeekday(year: number, month: number, day: number): number {
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=dom … 6=sáb
  return ((jsDay + 6) % 7) + 1;
}

/** Grade de 6 semanas (42 dias) começando na segunda, incluindo dias do mês
 *  anterior/seguinte pra preencher a primeira/última semana. `month` é 1-12. */
export function buildMonthGrid(year: number, month: number): MonthGridDay[] {
  const firstWeekday = isoWeekday(year, month, 1);
  const start = new Date(Date.UTC(year, month - 1, 1));
  start.setUTCDate(start.getUTCDate() - (firstWeekday - 1));

  const days: MonthGridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push({
      dateKey: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1 && d.getUTCFullYear() === year,
    });
  }
  return days;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = (year * 12 + (month - 1)) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

export function formatDateKeyPtBr(dateKey: string): string {
  const [y, m, d] = dateKey.split('-');
  return d && m && y ? `${d}/${m}/${y}` : dateKey;
}
```

(nota: `toDateKey` fica sem uso direto fora do arquivo — remover se o linter acusar
`no-unused-vars`; `buildMonthGrid` já monta as chaves inline.)

- [ ] **Step 4: Rodar o spec de novo e confirmar que passa**

Run: `cd frontend && npx ng test arena --watch=false --include='**/date-range-picker-math.spec.ts'`
Expected: PASS em todos os `it`. Se `toDateKey` disparar erro de função não usada, apagar essa
função do arquivo (Step 3 já monta as `dateKey` diretamente dentro de `buildMonthGrid`).

- [ ] **Step 5: Adicionar o ícone `chevron-left` a `ar-icon`**

Em `frontend/projects/arena/src/app/painel/ui/icon.component.ts`, acrescentar `'chevron-left'`
ao union `PanelIconName` (ao lado de `'chevron-right'`) e o `@case` correspondente, logo depois
do `@case ('chevron-right')`:

```ts
        @case ('chevron-left') {
          <path d="m15 6-6 6 6 6" />
        }
```

- [ ] **Step 6: Implementar o componente `ar-date-range-picker`**

Criar `frontend/projects/arena/src/app/painel/ui/date-range-picker.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { IconComponent } from './icon.component';
import { MONTH_LABELS_PT, buildMonthGrid, formatDateKeyPtBr, shiftMonth } from './date-range-picker-math';

function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

/** Calendário de intervalo de datas (protótipo pra data de início/término de horário
 *  fixo, reutilizável em qualquer outra tela que precise de um range de datas). */
@Component({
  selector: 'ar-date-range-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <button type="button" class="input-box trigger" (click)="toggle()">
      <span>{{ triggerLabel() }}</span>
      <ar-icon name="calendar" [size]="16" />
    </button>

    @if (open()) {
      <div class="popover" (click)="$event.stopPropagation()">
        <div class="nav">
          <button type="button" class="nav-btn" (click)="changeMonth(-1)" aria-label="Mês anterior">
            <ar-icon name="chevron-left" [size]="16" />
          </button>
          <span class="nav-label">{{ monthLabel() }}</span>
          <button type="button" class="nav-btn" (click)="changeMonth(1)" aria-label="Próximo mês">
            <ar-icon name="chevron-right" [size]="16" />
          </button>
        </div>

        <div class="weekdays">
          <span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span><span>D</span>
        </div>

        <div class="grid">
          @for (d of grid(); track d.dateKey) {
            <button
              type="button"
              class="day"
              [class.out]="!d.inMonth"
              [class.selected-start]="d.dateKey === draftStart()"
              [class.selected-end]="d.dateKey === draftEnd()"
              [class.in-range]="isInRange(d.dateKey)"
              [attr.aria-label]="d.dateKey"
              (click)="selectDay(d.dateKey)"
            >
              {{ d.day }}
            </button>
          }
        </div>

        @if (allowOpenEnd()) {
          <label class="open-end">
            <input type="checkbox" [checked]="draftOpenEnd()" (change)="toggleOpenEnd($any($event.target).checked)" />
            Sem data de término
          </label>
        }

        <div class="footer">
          <button type="button" class="ar-ghost-btn" (click)="cancel()">Cancelar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!draftStart()" (click)="apply()">Aplicar</button>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }

    .trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      color: var(--nx-text);
    }

    .popover {
      position: absolute;
      z-index: 40;
      top: calc(100% + 6px);
      left: 0;
      width: 292px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-3);
      padding: 14px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
    }

    .nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .nav-btn {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: none;
      color: var(--nx-text-mute);
      cursor: pointer;
    }

    .nav-btn:hover {
      background: var(--nx-surface-2);
      color: var(--nx-text);
    }

    .nav-label {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .weekdays,
    .grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
    }

    .weekdays span {
      text-align: center;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      padding-bottom: 6px;
    }

    .day {
      height: 32px;
      border: none;
      background: transparent;
      color: var(--nx-text);
      font-size: 12.5px;
      cursor: pointer;
      border-radius: var(--nx-r-1);
    }

    .day:hover {
      background: var(--nx-surface-2);
    }

    .day.out {
      color: var(--nx-text-dim);
      opacity: 0.5;
    }

    .day.in-range {
      background: var(--nx-orange-tint);
    }

    .day.selected-start,
    .day.selected-end {
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-weight: 700;
    }

    .open-end {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 12px 0 4px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
      cursor: pointer;
    }

    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 12px;
    }
  `,
})
export class DateRangePickerComponent {
  readonly startDate = input<string | null>(null);
  readonly endDate = input<string | null>(null);
  readonly allowOpenEnd = input(true);
  readonly rangeChange = output<{ startDate: string; endDate: string | null }>();

  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);
  protected readonly viewYear = signal(new Date().getFullYear());
  protected readonly viewMonth = signal(new Date().getMonth() + 1);
  protected readonly draftStart = signal<string | null>(null);
  protected readonly draftEnd = signal<string | null>(null);
  protected readonly draftOpenEnd = signal(true);

  protected readonly grid = computed(() => buildMonthGrid(this.viewYear(), this.viewMonth()));
  protected readonly monthLabel = computed(() => `${MONTH_LABELS_PT[this.viewMonth() - 1]} ${this.viewYear()}`);

  protected readonly triggerLabel = computed(() => {
    const start = this.startDate();
    if (!start) return 'Selecionar datas';
    const end = this.endDate();
    return `${formatDateKeyPtBr(start)} – ${end ? formatDateKeyPtBr(end) : 'sem término'}`;
  });

  constructor() {
    effect(() => {
      if (this.open()) return;
      // Sincroniza o rótulo do gatilho e o mês exibido com os inputs sempre
      // que o popover está fechado (evita reabrir com um mês desatualizado).
      const seed = this.startDate() ?? todayDateKey();
      const [y, m] = seed.split('-').map(Number);
      if (y && m) {
        this.viewYear.set(y);
        this.viewMonth.set(m);
      }
    });
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.draftStart.set(this.startDate());
    this.draftEnd.set(this.endDate());
    this.draftOpenEnd.set(this.endDate() == null);
    this.open.set(true);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  protected changeMonth(delta: number): void {
    const next = shiftMonth(this.viewYear(), this.viewMonth(), delta);
    this.viewYear.set(next.year);
    this.viewMonth.set(next.month);
  }

  protected selectDay(dateKey: string): void {
    const start = this.draftStart();
    const end = this.draftEnd();
    if (!start || (start && end)) {
      this.draftStart.set(dateKey);
      this.draftEnd.set(null);
      return;
    }
    if (dateKey < start) {
      this.draftEnd.set(start);
      this.draftStart.set(dateKey);
      return;
    }
    this.draftEnd.set(dateKey);
  }

  protected isInRange(dateKey: string): boolean {
    const start = this.draftStart();
    const end = this.draftEnd();
    if (!start || !end) return false;
    return dateKey > start && dateKey < end;
  }

  protected toggleOpenEnd(checked: boolean): void {
    this.draftOpenEnd.set(checked);
    if (checked) this.draftEnd.set(null);
  }

  protected apply(): void {
    const start = this.draftStart();
    if (!start) return;
    this.rangeChange.emit({ startDate: start, endDate: this.draftOpenEnd() ? null : this.draftEnd() });
    this.close();
  }

  protected cancel(): void {
    this.close();
  }
}
```

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npx ng build arena`
Expected: sem novos erros vindos de `date-range-picker.component.ts`/`date-range-picker-math.ts`
(o erro pendente em `panel-recurring.component.ts` continua até a Task 11).

- [ ] **Step 8: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/date-range-picker-math.ts frontend/projects/arena/src/app/painel/ui/date-range-picker-math.spec.ts frontend/projects/arena/src/app/painel/ui/date-range-picker.component.ts frontend/projects/arena/src/app/painel/ui/icon.component.ts
git commit -m "feat(arena): novo ar-date-range-picker (calendário de intervalo de datas)"
```

---

### Task 9: `ar-athlete-search-field` (busca de atleta entre os clientes da arena)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/recurring/athlete-search-filter.ts`
- Test: `frontend/projects/arena/src/app/painel/recurring/athlete-search-filter.spec.ts`
- Create: `frontend/projects/arena/src/app/painel/recurring/athlete-search-field.component.ts`

**Interfaces:**
- Produces (filter): `export interface AthleteCandidate { athleteId: string; name: string; }`,
  `export function filterAthleteCandidates(candidates: AthleteCandidate[], queryText: string): AthleteCandidate[]`
  (normaliza acento/caixa, mínimo 2 caracteres, no máximo 8 resultados).
- Produces (component): seletor `ar-athlete-search-field`, input `arenaId: input.required<string>()`,
  output `selected: output<AthleteCandidate>()`.
- Consumes: `fetchFollowersOnce` (Task 7), `resolveAthleteLabel` (já existe em
  `frontend/projects/arena/src/app/painel/bookings/bookings-repository.ts:177`).

- [ ] **Step 1: Escrever o spec do filtro (falhando)**

Criar `frontend/projects/arena/src/app/painel/recurring/athlete-search-filter.spec.ts`:

```ts
import { filterAthleteCandidates, type AthleteCandidate } from './athlete-search-filter';

const CANDIDATES: AthleteCandidate[] = [
  { athleteId: 'a1', name: 'João Silva' },
  { athleteId: 'a2', name: 'Maria José' },
  { athleteId: 'a3', name: 'Ana Souza' },
  { athleteId: 'a4', name: 'João Pedro' },
];

describe('filterAthleteCandidates', () => {
  it('menos de 2 caracteres não filtra nada (lista vazia)', () => {
    expect(filterAthleteCandidates(CANDIDATES, 'j')).toEqual([]);
  });

  it('filtra por substring, ignorando acento e caixa', () => {
    const result = filterAthleteCandidates(CANDIDATES, 'joao');
    expect(result.map((c) => c.athleteId)).toEqual(['a1', 'a4']);
  });

  it('acha por sobrenome também', () => {
    const result = filterAthleteCandidates(CANDIDATES, 'souza');
    expect(result.map((c) => c.athleteId)).toEqual(['a3']);
  });

  it('sem match retorna lista vazia', () => {
    expect(filterAthleteCandidates(CANDIDATES, 'xyz')).toEqual([]);
  });

  it('limita a 8 resultados', () => {
    const many: AthleteCandidate[] = Array.from({ length: 12 }, (_, i) => ({ athleteId: `id${i}`, name: `Carlos ${i}` }));
    expect(filterAthleteCandidates(many, 'carlos').length).toBe(8);
  });
});
```

- [ ] **Step 2: Rodar o spec e confirmar que falha**

Run: `cd frontend && npx ng test arena --watch=false --include='**/athlete-search-filter.spec.ts'`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `athlete-search-filter.ts`**

Criar `frontend/projects/arena/src/app/painel/recurring/athlete-search-filter.ts`:

```ts
export interface AthleteCandidate {
  athleteId: string;
  name: string;
}

const MAX_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Filtro client-side por substring (sem acento/caixa) — a base de candidatos
 *  já foi carregada uma vez (seguidores da arena), então isso é só um filtro
 *  em memória, sem query nova no Firestore. */
export function filterAthleteCandidates(candidates: AthleteCandidate[], queryText: string): AthleteCandidate[] {
  const q = normalize(queryText);
  if (q.length < MIN_QUERY_LENGTH) return [];
  return candidates.filter((c) => normalize(c.name).includes(q)).slice(0, MAX_RESULTS);
}
```

- [ ] **Step 4: Rodar o spec de novo e confirmar que passa**

Run: `cd frontend && npx ng test arena --watch=false --include='**/athlete-search-filter.spec.ts'`
Expected: PASS em todos os `it`.

- [ ] **Step 5: Implementar o componente `ar-athlete-search-field`**

Criar `frontend/projects/arena/src/app/painel/recurring/athlete-search-field.component.ts`:

```ts
import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { resolveAthleteLabel } from '../bookings/bookings-repository';
import { arenaFirestore } from '../data/firestore';
import { fetchFollowersOnce } from '../followers/followers-repository';
import { filterAthleteCandidates, type AthleteCandidate } from './athlete-search-filter';

/** Campo de busca de atleta pra vincular um mensalista de horário fixo — pesquisa entre
 *  os seguidores já vinculados à arena (sem busca global, ver spec da feature). */
@Component({
  selector: 'ar-athlete-search-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <div class="field-label">Buscar atleta</div>
    <input
      type="text"
      class="input-box"
      placeholder="Digite o nome do atleta…"
      [value]="queryText()"
      (focus)="onFocus()"
      (input)="onQueryInput($any($event.target).value)"
    />
    @if (open() && queryText().trim().length >= 2) {
      <div class="dropdown">
        @if (loading()) {
          <div class="empty">Carregando…</div>
        } @else if (results().length === 0) {
          <div class="empty">Nenhum atleta encontrado.</div>
        } @else {
          @for (r of results(); track r.athleteId) {
            <button type="button" class="item" (click)="select(r)">{{ r.name }}</button>
          }
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }

    .dropdown {
      position: absolute;
      z-index: 40;
      top: calc(100% - 12px);
      left: 0;
      right: 0;
      max-height: 220px;
      overflow: auto;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
    }

    .item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 10px 14px;
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-size: 13px;
      cursor: pointer;
    }

    .item:last-child {
      border-bottom: none;
    }

    .item:hover {
      background: var(--nx-surface-2);
    }

    .empty {
      padding: 12px 14px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    /* `.field-label`/`.input-box` não são classes globais — cada componente
     * as redefine localmente (mesmo padrão em panel-recurring, panel-agenda,
     * panel-court-form etc., confirmado durante a Task 8/ar-date-range-picker,
     * que teve a mesma lacuna). View encapsulation do Angular não deixa o CSS
     * do modal pai (Task 11) alcançar o template deste componente filho. */
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
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }
  `,
})
export class AthleteSearchFieldComponent {
  readonly arenaId = input.required<string>();
  readonly selected = output<AthleteCandidate>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly db = arenaFirestore();
  private candidates: AthleteCandidate[] | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly queryText = signal('');
  protected readonly loading = signal(false);
  protected readonly results = signal<AthleteCandidate[]>([]);
  protected readonly open = signal(false);

  protected onFocus(): void {
    this.open.set(true);
    void this.ensureCandidatesLoaded();
  }

  protected onQueryInput(value: string): void {
    this.queryText.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.runFilter(), 200);
  }

  protected select(candidate: AthleteCandidate): void {
    this.selected.emit(candidate);
    this.queryText.set(candidate.name);
    this.open.set(false);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  private async ensureCandidatesLoaded(): Promise<void> {
    if (this.candidates) return;
    this.loading.set(true);
    try {
      const followers = await fetchFollowersOnce(this.db, this.arenaId());
      const withNames = await Promise.all(
        followers.map(async (f): Promise<AthleteCandidate> => ({
          athleteId: f.userId,
          name: await resolveAthleteLabel(this.db, f.userId),
        })),
      );
      this.candidates = withNames.filter((c) => c.name && c.name !== '—');
    } finally {
      this.loading.set(false);
      this.runFilter();
    }
  }

  private runFilter(): void {
    this.results.set(filterAthleteCandidates(this.candidates ?? [], this.queryText()));
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx ng build arena`
Expected: sem novos erros vindos de `athlete-search-filter.ts`/`athlete-search-field.component.ts`.

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/arena/src/app/painel/recurring/athlete-search-filter.ts frontend/projects/arena/src/app/painel/recurring/athlete-search-filter.spec.ts frontend/projects/arena/src/app/painel/recurring/athlete-search-field.component.ts
git commit -m "feat(arena): novo ar-athlete-search-field (busca de atleta entre clientes da arena)"
```

---

## Fase 4 — Angular: telas (`panel-recurring.component.ts`)

### Task 10: Tabela — status pausado, forma de pagamento, valor diário+mensal

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/recurring/panel-recurring.component.ts`

**Interfaces:**
- Consumes: `watchVisibleSeries` (Task 6), `estimateMonthlyReais` (Task 5), `StatusDotComponent`
  (`../ui/status-dot.component.ts`), `PillComponent` (`../ui/pill.component.ts`).

- [ ] **Step 1: Trocar os imports**

Em `panel-recurring.component.ts`, trocar a linha 21 (`import { cancelRecurringSeries,
createRecurringSeries, watchActiveSeries } from './recurring-bookings-repository';`) por:

```ts
import { cancelRecurringSeries, createRecurringSeries, pauseRecurringSeries, resumeRecurringSeries, updateRecurringSeries, watchVisibleSeries } from './recurring-bookings-repository';
```

E o import do modelo (linhas 15-20) por:

```ts
import {
  RECURRING_WEEKDAYS,
  RECURRING_WEEKDAY_LABEL,
  estimateMonthlyReais,
  recurringCustomerLabel,
  type ArenaRecurringBooking,
  type ArenaRecurringPaymentType,
} from './arena-recurring-booking.model';
```

Acrescentar aos imports do topo (depois da linha 14):

```ts
import { PillComponent } from '../ui/pill.component';
import { StatusDotComponent } from '../ui/status-dot.component';
```

E incluir os dois componentes no array `imports` do `@Component` (linha 29):

```ts
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, ModalComponent, PillComponent, StatusDotComponent, RouterLink],
```

- [ ] **Step 2: Trocar a chamada do listener (constructor, linha 432)**

```ts
      this.unsubscribeSeries = watchVisibleSeries(db, arenaId, (list) => {
```

- [ ] **Step 3: Trocar o cabeçalho e as linhas da tabela**

Substituir o bloco do `table-head` (linhas 56-62):

```html
              <div class="table-head">
                <span>Mensalista</span>
                <span>Dia / horário</span>
                <span>Quadra</span>
                <span>Pagamento</span>
                <span class="right">Valor</span>
                <span></span>
              </div>
```

Substituir o `@for` das linhas (linhas 64-74):

```html
              <div class="table-list">
                @for (s of series(); track s.id) {
                  <div class="table-row">
                    <div class="cell-client">
                      {{ customerLabel(s) }}
                      @if (s.status === 'paused') {
                        <div class="paused-hint">
                          <ar-status-dot tone="yellow" [size]="6" />
                          Pausado{{ s.pausedAt ? ' desde ' + (s.pausedAt | date: 'dd/MM') : '' }}
                        </div>
                      } @else {
                        <div class="active-hint">
                          <ar-status-dot tone="green" [size]="6" />
                          Ativo
                        </div>
                      }
                    </div>
                    <div class="cell-slot">{{ weekdayLabel[s.weekday] }} · {{ s.startTime }}–{{ s.endTime }}</div>
                    <div class="cell-court">{{ s.courtName }}</div>
                    <div class="cell-payment">
                      <ar-pill [tone]="s.paymentType === 'monthly' ? 'orange' : 'dim'">
                        {{ s.paymentType === 'monthly' ? 'Mensal' : 'Por ocorrência' }}
                      </ar-pill>
                    </div>
                    <div class="cell-amount right">
                      @if (s.paymentType === 'monthly') {
                        <div class="amount-primary">{{ formatBRL(estimateMonthlyReais(s.amountReais)) }}/mês</div>
                        <div class="amount-secondary">{{ formatBRL(s.amountReais) }}/ocorrência</div>
                      } @else {
                        <div class="amount-primary">{{ formatBRL(s.amountReais) }}/ocorrência</div>
                        <div class="amount-secondary">≈ {{ formatBRL(estimateMonthlyReais(s.amountReais)) }}/mês</div>
                      }
                    </div>
                    <div class="cell-actions">
                      <button type="button" class="icon-action" [attr.aria-label]="'Editar'" (click)="openEdit(s)">
                        <ar-icon name="edit" [size]="15" />
                      </button>
                      @if (s.status === 'active') {
                        <button type="button" class="icon-action" [attr.aria-label]="'Pausar'" (click)="openPause(s)">
                          <ar-icon name="pause" [size]="15" />
                        </button>
                      } @else {
                        <button type="button" class="icon-action" [attr.aria-label]="'Retomar'" [disabled]="resuming() === s.id" (click)="resume(s)">
                          <ar-icon name="play" [size]="15" />
                        </button>
                      }
                      <button type="button" class="ar-ghost-btn danger-link" (click)="openCancel(s)">Encerrar</button>
                    </div>
                  </div>
                }
              </div>
```

Adicionar `import { DatePipe } from '@angular/common';` ao topo do arquivo e `DatePipe` ao array
`imports` do `@Component` (usado pelo `| date: 'dd/MM'` acima).

Trocar o `grid-template-columns` (linha 206, dentro de `.table-head, .table-row`) de
`1.3fr 1.6fr 1fr 120px 100px` para `1.3fr 1.4fr 0.8fr 1fr 140px 130px` (nova coluna de
pagamento + espaço extra pros três ícones de ação).

Acrescentar ao bloco `styles` (perto de `.cell-amount`/`.right`, linhas 253-262):

```scss
    .paused-hint,
    .active-hint {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 3px;
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .cell-payment {
      display: flex;
    }

    .amount-primary {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .amount-secondary {
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .icon-action {
      display: inline-grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: none;
      color: var(--nx-text-mute);
      cursor: pointer;
      margin-right: 2px;
    }

    .icon-action:hover:not(:disabled) {
      background: var(--nx-surface-2);
      color: var(--nx-text);
    }

    .icon-action:disabled {
      opacity: 0.4;
      cursor: default;
    }
```

(`cell-amount` deixa de ser um valor único — remover a regra antiga `font-family:
var(--nx-font-mono); font-weight: 700; font-size: 14px; color: var(--nx-text);` do seletor
`.cell-amount` já que agora ele só controla o alinhamento — `.right { text-align: right; }`
continua valendo.)

- [ ] **Step 4: Adicionar os ícones `pause`/`play` a `ar-icon`**

Em `frontend/projects/arena/src/app/painel/ui/icon.component.ts`, acrescentar `'pause'` e
`'play'` ao union `PanelIconName`, e os dois `@case` correspondentes (perto de `'edit'`):

```ts
        @case ('pause') {
          <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
        }
        @case ('play') {
          <path d="M8 5v14l11-7z" stroke-linejoin="round" />
        }
```

- [ ] **Step 5: Declarar os signals/placeholders que os templates acima referenciam (implementados de verdade nas Tasks 11-12)**

Por enquanto, pra manter o build passando enquanto o resto do componente ainda não existe,
acrescentar ao final da classe `PanelRecurringComponent` (serão preenchidos de verdade na
Task 12):

```ts
  protected readonly resuming = signal<string | null>(null);
  protected readonly estimateMonthlyReais = estimateMonthlyReais;

  protected openEdit(_series: ArenaRecurringBooking): void {
    // implementado na Task 11
  }

  protected openPause(_series: ArenaRecurringBooking): void {
    // implementado na Task 12
  }

  protected async resume(_series: ArenaRecurringBooking): Promise<void> {
    // implementado na Task 12
  }
```

- [ ] **Step 6: Build**

Run: `cd frontend && npx ng build arena`
Expected: compila sem erros. `paymentType` é opcional em `CreateRecurringSeriesInput` (Task 6),
então o método `create()` — ainda não tocado nesta task, só reescrito na Task 11 — continua
compilando mesmo sem enviar esse campo; o backend assume `'per_occurrence'` quando ausente.

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/arena/src/app/painel/recurring/panel-recurring.component.ts frontend/projects/arena/src/app/painel/ui/icon.component.ts
git commit -m "feat(arena): tabela de horários fixos mostra status pausado, forma de pagamento e valor diário+mensal"
```

---

### Task 11: Modal unificado de criar/editar (calendário, busca de atleta/avulso, pagamento)

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/recurring/panel-recurring.component.ts`

**Interfaces:**
- Consumes: `DateRangePickerComponent` (Task 8), `AthleteSearchFieldComponent` (Task 9),
  `updateRecurringSeries` (Task 6).

- [ ] **Step 1: Importar os dois componentes novos**

Acrescentar aos imports do topo:

```ts
import { DateRangePickerComponent } from '../ui/date-range-picker.component';
import { AthleteSearchFieldComponent } from './athlete-search-field.component';
import type { AthleteCandidate } from './athlete-search-filter';
```

E ao array `imports` do `@Component`:

```ts
  imports: [
    PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, ModalComponent,
    PillComponent, StatusDotComponent, DatePipe, DateRangePickerComponent, AthleteSearchFieldComponent, RouterLink,
  ],
```

- [ ] **Step 2: Trocar o template do modal de criar/editar**

Substituir todo o bloco `@if (showCreate())` (linhas 81-142 do arquivo original) por:

```html
      @if (formOpen()) {
        <ar-modal (close)="closeForm()">
          <h2 class="modal-title">{{ editTarget() ? 'Editar horário fixo' : 'Novo horário fixo' }}</h2>
          <p class="modal-subtitle">Reserva semanal recorrente (mensalista) — as próximas ocorrências são criadas automaticamente.</p>

          @if (formError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }

          <div class="field-label">Quadra</div>
          <select class="input-box" [value]="courtId()" (change)="courtId.set($any($event.target).value)">
            <option value="" disabled>Selecione a quadra</option>
            @for (c of courts(); track c.id) {
              <option [value]="c.id">{{ c.name }}</option>
            }
          </select>

          <div class="field-label">Dia da semana</div>
          <div class="ar-filter-bar weekday-bar">
            @for (d of weekdayOptions; track d) {
              <button type="button" class="ar-chip" [class.active]="weekday() === d" (click)="weekday.set(d)">{{ weekdayLabel[d] }}</button>
            }
          </div>

          <div class="time-row">
            <div>
              <div class="field-label">Início</div>
              <input type="time" class="input-box" [value]="startTime()" (input)="startTime.set($any($event.target).value)" />
            </div>
            <div>
              <div class="field-label">Fim</div>
              <input type="time" class="input-box" [value]="endTime()" (input)="endTime.set($any($event.target).value)" />
            </div>
          </div>

          <div class="field-label">Data de início / término</div>
          <ar-date-range-picker
            [startDate]="startDate()"
            [endDate]="endDate()"
            (rangeChange)="onRangeChange($event)"
          />
          <div class="spacer" />

          <div class="field-label">Mensalista</div>
          <div class="ar-filter-bar weekday-bar">
            <button type="button" class="ar-chip" [class.active]="mensalistaMode() === 'atleta'" (click)="setMensalistaMode('atleta')">Atleta cadastrado</button>
            <button type="button" class="ar-chip" [class.active]="mensalistaMode() === 'avulso'" (click)="setMensalistaMode('avulso')">Avulso</button>
          </div>

          @if (mensalistaMode() === 'atleta') {
            <ar-athlete-search-field [arenaId]="arenaContext.arenaId() ?? ''" (selected)="onAthleteSelected($event)" />
            @if (athleteId()) {
              <p class="athlete-selected-hint">Selecionado: {{ athleteName() }}</p>
            }
          } @else {
            <input
              type="text"
              class="input-box"
              placeholder="Ex.: João Silva"
              [value]="customerName()"
              (input)="customerName.set($any($event.target).value)"
            />
          }

          <div class="field-label">Valor por ocorrência (R$)</div>
          <input
            type="text"
            inputmode="decimal"
            class="input-box"
            placeholder="0,00"
            [value]="amountValue()"
            (input)="amountValue.set($any($event.target).value)"
          />
          <p class="monthly-hint">≈ {{ formatBRL(estimateMonthlyReais(parsedAmount())) }}/mês</p>

          <div class="field-label">Forma de pagamento</div>
          <div class="ar-filter-bar weekday-bar">
            <button type="button" class="ar-chip" [class.active]="paymentType() === 'monthly'" (click)="paymentType.set('monthly')">Mensal</button>
            <button type="button" class="ar-chip" [class.active]="paymentType() === 'per_occurrence'" (click)="paymentType.set('per_occurrence')">Por ocorrência</button>
          </div>

          <div class="actions">
            <button type="button" class="ar-ghost-btn" [disabled]="saving()" (click)="closeForm()">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="!canSubmit()" (click)="submitForm()">
              {{ saving() ? 'Salvando…' : (editTarget() ? 'Salvar alterações' : 'Criar horário fixo') }}
            </button>
          </div>
        </ar-modal>
      }
```

Acrescentar ao `styles`:

```scss
    .spacer {
      height: 18px;
    }

    .athlete-selected-hint,
    .monthly-hint {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin: -8px 0 18px;
    }
```

- [ ] **Step 3: Trocar os signals e a lógica de criação/edição**

Trocar o botão "Novo horário fixo" do header (linha 33-36) pra chamar `openCreate` (sem mudar
nome — continua igual), mas o corpo dos métodos muda. Substituir todo o bloco de signals de
criação (linhas 392-404 do arquivo original: `showCreate`, `courtId`, `weekday`, `startTime`,
`endTime`, `customerName`, `amountValue`, `creating`, `createError`) e o `canCreate` (linhas
409-418) por:

```ts
  protected readonly formOpen = signal(false);
  protected readonly editTarget = signal<ArenaRecurringBooking | null>(null);
  protected readonly courtId = signal('');
  protected readonly weekday = signal(1);
  protected readonly startTime = signal('19:00');
  protected readonly endTime = signal('20:00');
  protected readonly startDate = signal<string | null>(null);
  protected readonly endDate = signal<string | null>(null);
  protected readonly mensalistaMode = signal<'atleta' | 'avulso'>('avulso');
  protected readonly athleteId = signal<string | null>(null);
  protected readonly athleteName = signal('');
  protected readonly customerName = signal('');
  protected readonly amountValue = signal('');
  protected readonly paymentType = signal<ArenaRecurringPaymentType>('per_occurrence');
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly canSubmit = computed(() => {
    return (
      !this.saving() &&
      this.courtId().length > 0 &&
      this.startTime().length === 5 &&
      this.endTime().length === 5 &&
      this.startDate() != null &&
      this.parsedAmount() > 0 &&
      (this.mensalistaMode() === 'atleta' ? this.athleteId() != null : this.customerName().trim().length > 0)
    );
  });
```

Substituir `parsedAmount` (linhas 439-443) mantendo a mesma implementação (só cuidar que
continua `private`).

Substituir `openCreate` (linhas 445-455) e `create` (linhas 457-480) por:

```ts
  protected openCreate(): void {
    if (this.atCap()) return;
    this.editTarget.set(null);
    this.courtId.set(this.courts()[0]?.id ?? '');
    this.weekday.set(1);
    this.startTime.set('19:00');
    this.endTime.set('20:00');
    this.startDate.set(null);
    this.endDate.set(null);
    this.mensalistaMode.set('avulso');
    this.athleteId.set(null);
    this.athleteName.set('');
    this.customerName.set('');
    this.amountValue.set('');
    this.paymentType.set('per_occurrence');
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(series: ArenaRecurringBooking): void {
    this.editTarget.set(series);
    this.courtId.set(series.courtId);
    this.weekday.set(series.weekday);
    this.startTime.set(series.startTime);
    this.endTime.set(series.endTime);
    this.startDate.set(series.startDate);
    this.endDate.set(series.endDate);
    this.mensalistaMode.set(series.athleteId ? 'atleta' : 'avulso');
    this.athleteId.set(series.athleteId);
    this.athleteName.set(series.customerName ?? (series.athleteId ? recurringCustomerLabel(series) : ''));
    this.customerName.set(series.customerName ?? '');
    this.amountValue.set(series.amountReais.toString().replace('.', ','));
    this.paymentType.set(series.paymentType);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
  }

  protected setMensalistaMode(mode: 'atleta' | 'avulso'): void {
    this.mensalistaMode.set(mode);
    this.athleteId.set(null);
    this.athleteName.set('');
    this.customerName.set('');
  }

  protected onAthleteSelected(candidate: AthleteCandidate): void {
    this.athleteId.set(candidate.athleteId);
    this.athleteName.set(candidate.name);
  }

  protected onRangeChange(range: { startDate: string; endDate: string | null }): void {
    this.startDate.set(range.startDate);
    this.endDate.set(range.endDate);
  }

  protected async submitForm(): Promise<void> {
    if (!this.canSubmit()) return;
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.saving.set(true);
    this.formError.set(null);
    try {
      const payload = {
        arenaId,
        courtId: this.courtId(),
        weekday: this.weekday(),
        startTime: this.startTime(),
        endTime: this.endTime(),
        amountReais: this.parsedAmount(),
        paymentType: this.paymentType(),
        startDate: this.startDate() ?? undefined,
        endDate: this.endDate() ?? undefined,
        ...(this.mensalistaMode() === 'atleta'
          ? { athleteId: this.athleteId() ?? undefined }
          : { customerName: this.customerName().trim() }),
      };

      const target = this.editTarget();
      if (target) {
        await updateRecurringSeries(arenaFunctions(), { ...payload, seriesId: target.id });
      } else {
        await createRecurringSeries(arenaFunctions(), payload);
      }
      this.formOpen.set(false);
    } catch (err) {
      this.formError.set(err instanceof Error ? err.message : 'Não foi possível salvar o horário fixo.');
    } finally {
      this.saving.set(false);
    }
  }
```

- [ ] **Step 4: Build**

Run: `cd frontend && npx ng build arena`
Expected: compila sem erros. Verificar em especial que `parsedAmount` continua sendo chamado
tanto em `canSubmit`/`submitForm` quanto no template (`monthly-hint`) — se o linter reclamar de
visibilidade `private`, trocar pra `protected` (o template já chamava `parsedAmount`? Não —
o template novo usa `estimateMonthlyReais(parsedAmount())`, então `parsedAmount` precisa ser
`protected`, não `private`; ajustar a assinatura de `private parsedAmount(): number` pra
`protected parsedAmount(): number`).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/recurring/panel-recurring.component.ts
git commit -m "feat(arena): modal único de criar/editar horário fixo com calendário, busca de atleta/avulso e forma de pagamento"
```

---

### Task 12: Ações de pausar/retomar/encerrar por linha

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/recurring/panel-recurring.component.ts`

- [ ] **Step 1: Trocar o modal de confirmação (reaproveitado por pausar e encerrar)**

Substituir o bloco `@if (cancelTarget(); as target)` (linhas 144-161 do arquivo original) por
dois modais de confirmação lado a lado — um genérico reaproveitado, parametrizado pelo modo:

```html
      @if (confirmTarget(); as target) {
        <ar-modal (close)="closeConfirm()">
          <h2 class="confirm-title">{{ confirmMode() === 'pause' ? 'Pausar horário fixo?' : 'Encerrar horário fixo?' }}</h2>
          <p class="confirm-body">
            {{ weekdayLabel[target.weekday] }} · {{ target.startTime }}–{{ target.endTime }} · {{ target.courtName }} ·
            {{ customerLabel(target) }}.
            @if (confirmMode() === 'pause') {
              As ocorrências futuras já agendadas serão liberadas da agenda até você retomar.
            } @else {
              As ocorrências futuras são canceladas; as já feitas ficam preservadas no histórico.
            }
          </p>
          @if (confirmError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          <div class="confirm-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="confirming()" (click)="closeConfirm()">Voltar</button>
            <button type="button" class="ar-mini-btn danger-btn" [disabled]="confirming()" (click)="confirmAction()">
              {{ confirming() ? (confirmMode() === 'pause' ? 'Pausando…' : 'Encerrando…') : (confirmMode() === 'pause' ? 'Pausar horário fixo' : 'Encerrar horário fixo') }}
            </button>
          </div>
        </ar-modal>
      }
```

- [ ] **Step 2: Trocar os signals e métodos de cancelar por uma versão que também cobre pausar/retomar**

Substituir os signals `cancelTarget`, `canceling`, `cancelError` (linhas 402-404 do arquivo
original) por:

```ts
  protected readonly confirmTarget = signal<ArenaRecurringBooking | null>(null);
  protected readonly confirmMode = signal<'pause' | 'cancel'>('cancel');
  protected readonly confirming = signal(false);
  protected readonly confirmError = signal<string | null>(null);
```

Trocar o stub `openPause` (adicionado na Task 10) e os métodos `openCancel`/`confirmCancel`
(linhas 482-500 do arquivo original) por:

```ts
  protected openPause(series: ArenaRecurringBooking): void {
    this.confirmMode.set('pause');
    this.confirmError.set(null);
    this.confirmTarget.set(series);
  }

  protected openCancel(series: ArenaRecurringBooking): void {
    this.confirmMode.set('cancel');
    this.confirmError.set(null);
    this.confirmTarget.set(series);
  }

  protected closeConfirm(): void {
    this.confirmTarget.set(null);
  }

  protected async confirmAction(): Promise<void> {
    const target = this.confirmTarget();
    if (!target) return;
    this.confirming.set(true);
    this.confirmError.set(null);
    try {
      if (this.confirmMode() === 'pause') {
        await pauseRecurringSeries(arenaFunctions(), target.id);
      } else {
        await cancelRecurringSeries(arenaFunctions(), target.id);
      }
      this.confirmTarget.set(null);
    } catch (err) {
      const fallback = this.confirmMode() === 'pause' ? 'Não foi possível pausar o horário fixo.' : 'Não foi possível encerrar o horário fixo.';
      this.confirmError.set(err instanceof Error ? err.message : fallback);
    } finally {
      this.confirming.set(false);
    }
  }
```

Trocar o stub `resume` (adicionado na Task 10) por:

```ts
  protected async resume(series: ArenaRecurringBooking): Promise<void> {
    this.resuming.set(series.id);
    try {
      await resumeRecurringSeries(arenaFunctions(), series.id);
    } catch {
      // A linha volta a mostrar "Pausado" via onSnapshot — sem toast no
      // portal (não existe componente de toast aqui hoje); se falhar, o
      // gestor tenta de novo pelo mesmo botão.
    } finally {
      this.resuming.set(null);
    }
  }
```

- [ ] **Step 3: Build**

Run: `cd frontend && npx ng build arena`
Expected: compila sem erros — nenhuma referência solta a `cancelTarget`/`canceling`/
`cancelError`/`showCreate` deve sobrar no arquivo (todas substituídas nas Tasks 10-12).

- [ ] **Step 4: QA manual no navegador (obrigatório antes de fechar a Fase 4)**

Rodar `cd frontend && npx ng serve arena` e, logado como gestor de uma arena de teste, na tela
Horários fixos:

1. Criar uma série nova selecionando data de início e término pelo calendário, vinculando um
   atleta pela busca (deve aparecer na lista de seguidores da arena) — confirmar que a série
   aparece na tabela com o valor diário e mensal corretos e o chip de pagamento certo.
2. Criar uma segunda série em modo "Avulso" (nome livre) com pagamento "Mensal" — conferir que
   o valor mensal aparece em destaque e o diário embaixo.
3. Editar a primeira série (mudar dia/horário) e confirmar que a agenda reflete a mudança (ver
   aba Agenda) sem duplicar reservas antigas.
4. Pausar a segunda série — confirmar que ela continua na lista com o status "Pausado" e que as
   reservas futuras somem da Agenda.
5. Retomar a segunda série — confirmar que ela volta a "Ativo" e as reservas futuras reaparecem
   na Agenda.
6. Encerrar a primeira série (já editada) — confirmar que ela some da lista de Horários fixos.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/recurring/panel-recurring.component.ts
git commit -m "feat(arena): pausar/retomar/encerrar horário fixo direto na lista"
```

---

## Fase 5 — Flutter (ajuste mínimo de consistência)

### Task 13: Modelo `ArenaRecurringBooking` (Dart) — paymentType, pausedAt, isPaused

**Files:**
- Modify: `nexago_app/lib/features/arena/domain/arena_recurring_booking.dart`
- Test: `nexago_app/test/features/arena/domain/arena_recurring_booking_test.dart`

**Interfaces:**
- Produces: `ArenaRecurringBooking` ganha `final String paymentType;`, `final DateTime? pausedAt;`,
  getter `bool get isPaused`.

- [ ] **Step 1: Escrever os testes (falhando)**

Acrescentar ao final do `group('ArenaRecurringBooking.fromFirestore', ...)` em
`nexago_app/test/features/arena/domain/arena_recurring_booking_test.dart` (antes do `});` de
fechamento do grupo, logo depois do teste `'status canceled não é ativo'`):

```dart
    test('status paused não é ativo, é pausado', () {
      final booking = ArenaRecurringBooking.fromFirestore(
        _FakeDoc(id: 'rec10', data: {'status': 'paused'}),
      );

      expect(booking.isActive, isFalse);
      expect(booking.isPaused, isTrue);
    });

    test('paymentType ausente vira per_occurrence (retrocompatibilidade)', () {
      final booking =
          ArenaRecurringBooking.fromFirestore(_FakeDoc(id: 'rec11', data: {}));

      expect(booking.paymentType, 'per_occurrence');
    });

    test('paymentType monthly é preservado', () {
      final booking = ArenaRecurringBooking.fromFirestore(
        _FakeDoc(id: 'rec12', data: {'paymentType': 'monthly'}),
      );

      expect(booking.paymentType, 'monthly');
    });

    test('pausedAt vira DateTime quando presente, null quando ausente', () {
      final when = DateTime.utc(2026, 7, 20, 12);
      final paused = ArenaRecurringBooking.fromFirestore(
        _FakeDoc(id: 'rec13', data: {'pausedAt': Timestamp.fromDate(when)}),
      );
      final notPaused =
          ArenaRecurringBooking.fromFirestore(_FakeDoc(id: 'rec14', data: {}));

      expect(paused.pausedAt?.toUtc(), when);
      expect(notPaused.pausedAt, isNull);
    });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd nexago_app && flutter test test/features/arena/domain/arena_recurring_booking_test.dart`
Expected: FAIL — `paymentType`/`isPaused`/`pausedAt` não existem em `ArenaRecurringBooking`.

- [ ] **Step 3: Implementar as mudanças no modelo**

Editar `nexago_app/lib/features/arena/domain/arena_recurring_booking.dart`. No construtor
(linhas 9-26), acrescentar dois parâmetros:

```dart
  const ArenaRecurringBooking({
    required this.id,
    required this.arenaId,
    required this.arenaName,
    required this.courtId,
    required this.courtName,
    required this.weekday,
    required this.startTime,
    required this.endTime,
    required this.amountReais,
    required this.status,
    required this.startDate,
    required this.skippedDates,
    this.athleteId,
    this.customerName,
    this.endDate,
    this.createdAt,
    this.paymentType = 'per_occurrence',
    this.pausedAt,
  });
```

Acrescentar os dois campos depois de `final String status;` (linha 50):

```dart
  /// `active` | `paused` | `canceled`.
  final String status;

  /// `per_occurrence` | `monthly` — só informativo, sem cobrança automática.
  final String paymentType;

  /// Quando a série foi pausada (`null` se nunca foi ou já foi retomada).
  final DateTime? pausedAt;
```

Acrescentar o getter `isPaused` logo depois de `bool get isActive => status == 'active';`
(linha 63):

```dart
  bool get isActive => status == 'active';
  bool get isPaused => status == 'paused';
```

No `factory ArenaRecurringBooking.fromFirestore` (linhas 78-104), acrescentar dentro do
construtor:

```dart
      status: _str(d['status'], fallback: 'active'),
      startDate: _str(d['startDate']),
      endDate: _optional(d['endDate']),
      paymentType: _str(d['paymentType'], fallback: 'per_occurrence'),
      pausedAt: (d['pausedAt'] as Timestamp?)?.toDate(),
      skippedDates: [
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `cd nexago_app && flutter test test/features/arena/domain/arena_recurring_booking_test.dart`
Expected: PASS em todos os testes (os antigos e os 4 novos).

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/arena/domain/arena_recurring_booking.dart nexago_app/test/features/arena/domain/arena_recurring_booking_test.dart
git commit -m "feat(app): ArenaRecurringBooking ganha paymentType, pausedAt e isPaused"
```

---

### Task 14: Lista do gestor no app — não esconder séries pausadas, mostrar badge

**Files:**
- Modify: `nexago_app/lib/features/arena/data/recurring_booking_service.dart:34-49`
- Modify: `nexago_app/lib/features/arena/presentation/arena_recurring_list_page.dart`

- [ ] **Step 1: Ampliar o filtro de `watchActiveSeries`**

Em `recurring_booking_service.dart`, trocar:

```dart
  Stream<List<ArenaRecurringBooking>> watchActiveSeries(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) {
      return Stream<List<ArenaRecurringBooking>>.value(const []);
    }
    return _firestore
        .collection(collection)
        .where('arenaId', isEqualTo: id)
        .where('status', isEqualTo: 'active')
        .snapshots()
```

por:

```dart
  /// Séries visíveis da arena (ativas + pausadas) — pausada não some da
  /// lista do gestor no app, mesmo sem botão de pausar/retomar aqui ainda
  /// (isso fica só no portal web nesta rodada).
  Stream<List<ArenaRecurringBooking>> watchActiveSeries(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) {
      return Stream<List<ArenaRecurringBooking>>.value(const []);
    }
    return _firestore
        .collection(collection)
        .where('arenaId', isEqualTo: id)
        .where('status', whereIn: ['active', 'paused'])
        .snapshots()
```

- [ ] **Step 2: Badge "Pausado" no card da lista**

Em `arena_recurring_list_page.dart`, dentro de `_SeriesCard.build`, acrescentar o badge logo
depois do `Text` de dia/horário (depois do `SizedBox(height: 4)` que vem antes do `Text` de
nome/quadra):

```dart
                      Text(
                        '${series.weekdayLabel} · '
                        '${series.startTime} – ${series.endTime}',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      if (series.isPaused) ...[
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            // Mesmo tom de âmbar do status "pendente" no
                            // portal web (--nx-pending), pra consistência
                            // visual entre as duas plataformas.
                            color: const Color(0xFFF4C543).withValues(alpha: 0.14),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            'PAUSADO',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: const Color(0xFFF4C543),
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.6,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 4),
                      Text(
                        '$name · ${series.courtName}',
```

- [ ] **Step 3: Rodar a suíte de testes do Flutter relacionada**

Run: `cd nexago_app && flutter test test/features/arena/domain/arena_recurring_booking_test.dart test/features/arena/domain/arena_manager_booking_recurring_test.dart test/features/arena/domain/arena_plan_recurring_limit_test.dart`
Expected: PASS — nenhum desses arquivos testa `watchActiveSeries` diretamente (é um método de
serviço com Firestore, sem teste hoje), então a mudança de filtro não quebra nada coberto.

- [ ] **Step 4: `flutter analyze`**

Run: `cd nexago_app && flutter analyze lib/features/arena/data/recurring_booking_service.dart lib/features/arena/presentation/arena_recurring_list_page.dart`
Expected: sem erros.

- [ ] **Step 5: QA manual no simulador/dispositivo (obrigatório)**

Pausar uma série pelo portal web (Task 12) e abrir a lista de horários fixos do gestor no app —
confirmar que a série aparece com o badge "PAUSADO" em vez de sumir da lista.

- [ ] **Step 6: Commit**

```bash
git add nexago_app/lib/features/arena/data/recurring_booking_service.dart nexago_app/lib/features/arena/presentation/arena_recurring_list_page.dart
git commit -m "fix(app): série pausada não some da lista de horários fixos do gestor, ganha badge PAUSADO"
```

---

## Ordem de deploy (depois de todas as tasks aprovadas)

1. `functions` (Tasks 1-4: `updateArenaRecurringBooking`, `pauseArenaRecurringBooking`,
   `resumeArenaRecurringBooking`, cota do Essencial, encerrar de `paused`) — nenhum índice novo,
   nenhuma mudança de rules.
2. Portal web da arena (Tasks 5-12).
3. App Flutter (Tasks 13-14) — pode ir na mesma leva de release normal, sem urgência (é só
   consistência de leitura).
