# Bora Jogar — Backend multi-participante (Cloud Functions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalizar o backend do Bora Jogar (`functions/src/friendly-match-*.ts`) de convite 1:1 para N participantes por jogo, mantendo o 1:1 como caso especial `slotsTotal = 1`.

**Architecture:** Um único doc `friendlyMatches/{id}` troca `fromUid/toUid` por `organizerUid` + `slots[]` (um por vaga) + `participantUids[]` (organizador + aceitos) + `pendingSlotUids[]`/`nextSlotExpiresAt` (campos de apoio a query). Máquina de estados do jogo vira `filling → confirmed/cancelled/unfilled`, `confirmed → cancelled/no_show/completed`, `completed → reviewed`. Contraproposta só existe quando `slotsTotal === 1`. Check-in exige unanimidade de `participantUids`; no-show penaliza ausentes quando ≥1 apareceu; avaliação vira pairwise (cada um avalia cada outro, reveal por par).

**Tech Stack:** TypeScript, Firebase Cloud Functions v2 (`onCall`/`onSchedule`), Firestore Admin SDK, `node:test` + `node:assert/strict`, `FakeFirestore` (`functions/src/fake-firestore.test-helper.ts`).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-09-bora-jogar-multi-participante-design.md`.
- Feature só existe no dev (`enabled=false` em prod) — sem migração de dados, docs antigos de QA no dev são descartáveis.
- Escrita em `friendlyMatches` é exclusiva das Cloud Functions (rules bloqueiam client) — todo write passa por `db.runTransaction`.
- Todo campo numérico/string vindo do client é validado com `HttpsError` (`invalid-argument`, `not-found`, `permission-denied`, `failed-precondition`) — nunca lançar dentro de um callback de transação sem commitar primeiro qualquer flip de estado que deva ser durável (padrão já usado para expiração).
- Testes usam `node:test`/`assert/strict` + `FakeFirestore` — nunca mocks manuais; seguir o padrão de `describe`/`it`/`assertHttpsError` já usado nos arquivos `friendly-match-*.test.ts`.
- `MAX_INVITEES = 10` (limite defensivo de vagas por jogo; não é regra de produto, só sanidade).
- Rodar `cd functions && npm test` (ou o comando de teste equivalente do package.json) depois de cada task.

---

## Visão geral do schema novo (`friendlyMatches/{id}`)

Campos que substituem `fromUid`/`fromName`/`fromPhotoUrl`/`toUid`/`toName`/`toPhotoUrl`:

```ts
organizerUid: string;
organizerName: string;
organizerPhotoUrl?: string;
slotsTotal: number;              // vagas além do organizador; 1 = caso 1:1 de hoje
slots: FriendlySlot[];           // length === slotsTotal
participantUids: string[];       // organizerUid + uids com slot 'accepted'; congelado quando status vira 'confirmed'
pendingSlotUids: string[];       // uids com slot 'invited' ou 'countered' — suporta a query de convite pendente
nextSlotExpiresAt: Timestamp | null; // min(expiresAt) entre slots invited/countered — suporta o sweeper de expiração por vaga
```

`FriendlySlot`:

```ts
type FriendlySlot = {
  uid: string;
  name: string;
  photoUrl: string | null;
  status: "invited" | "accepted" | "declined" | "expired" | "countered";
  invitedAt: Timestamp;
  respondedAt: Timestamp | null;
  expiresAt: Timestamp;
  scoreAtSend: number;            // score de compatibilidade organizador↔este convidado (era top-level)
  scoreBreakdown: CompatibilityBreakdown;
  declineReason?: string;
  counterProposal?: {             // só existe quando slotsTotal === 1
    scheduledAt: Timestamp;
    alternativeTimes: Timestamp[];
    location?: FriendlyMatchLocation;
    message?: string;
    proposedByUid: string;
    at: Timestamp;
  };
};
```

`status` do jogo (top-level): `"filling" | "confirmed" | "unfilled" | "cancelled" | "no_show" | "completed" | "reviewed"`. `declined`/`expired` deixam de ser status do jogo — só de `slot.status`. `countered` só é um `slot.status` alcançável quando `slotsTotal === 1` (a responsabilidade de responder passa do convidado pro organizador enquanto o slot estiver `countered`).

`reviews` (campo público) vira mapa aninhado: `Record<reviewerUid, Record<revieweeUid, StoredReview>>`. `privateReviews/{reviewerUid}_{revieweeUid}` substitui `privateReviews/{reviewerUid}`.

---

### Task 1: `friendly-match-logic.ts` — status de jogo e de vaga (lógica pura)

**Files:**
- Modify: `functions/src/friendly-match-logic.ts:12-71` (tipo `FriendlyMatchStatus`, `VALID_TRANSITIONS`, `canTransition`)
- Test: `functions/src/friendly-match-logic.test.ts:27-72` (describe `canTransition`)

**Interfaces:**
- Produces: `export type FriendlyMatchStatus = "filling" | "confirmed" | "unfilled" | "cancelled" | "no_show" | "completed" | "reviewed"`; `export type SlotStatus = "invited" | "accepted" | "declined" | "expired" | "countered"`; `export function canTransition(from: string, to: string): boolean` (máquina do jogo); `export function canTransitionSlot(from: string, to: string): boolean` (máquina da vaga).
- Consumes: nada (função pura, sem I/O) — todas as demais tasks do backend consomem estes dois tipos e as duas funções.

- [ ] **Step 1: Escrever os testes que falham para a nova máquina de estados do jogo**

Substituir o conteúdo do `describe("canTransition — máquina de estados", ...)` em `functions/src/friendly-match-logic.test.ts` por:

```ts
describe("canTransition — máquina de estados do jogo", () => {
  it("aceita as transições válidas do ciclo", () => {
    const valid: Array<[string, string]> = [
      ["filling", "confirmed"],
      ["filling", "cancelled"],
      ["filling", "unfilled"],
      ["confirmed", "cancelled"],
      ["confirmed", "no_show"],
      ["confirmed", "completed"],
      ["completed", "reviewed"],
    ];
    for (const [from, to] of valid) {
      assert.equal(canTransition(from, to), true, `${from} → ${to} deveria ser válida`);
    }
  });

  it("rejeita transições fora do ciclo e a partir de estados terminais", () => {
    const invalid: Array<[string, string]> = [
      ["filling", "completed"],
      ["filling", "reviewed"],
      ["filling", "no_show"],
      ["confirmed", "unfilled"],
      ["confirmed", "reviewed"],
      ["unfilled", "confirmed"],
      ["cancelled", "confirmed"],
      ["no_show", "completed"],
      ["reviewed", "filling"],
      ["completed", "no_show"],
    ];
    for (const [from, to] of invalid) {
      assert.equal(canTransition(from, to), false, `${from} → ${to} deveria ser inválida`);
    }
  });

  it("rejeita estados desconhecidos", () => {
    assert.equal(canTransition("draft", "filling"), false);
    assert.equal(canTransition("filling", "banana"), false);
  });
});

describe("canTransitionSlot — máquina de estados da vaga", () => {
  it("aceita as transições válidas", () => {
    const valid: Array<[string, string]> = [
      ["invited", "accepted"],
      ["invited", "declined"],
      ["invited", "expired"],
      ["invited", "countered"],
      ["countered", "accepted"],
      ["countered", "declined"],
      ["countered", "expired"],
      ["declined", "invited"],
      ["expired", "invited"],
    ];
    for (const [from, to] of valid) {
      assert.equal(canTransitionSlot(from, to), true, `${from} → ${to} deveria ser válida`);
    }
  });

  it("rejeita transições fora do ciclo", () => {
    const invalid: Array<[string, string]> = [
      ["accepted", "declined"],
      ["accepted", "invited"],
      ["declined", "accepted"],
      ["expired", "accepted"],
      ["countered", "invited"],
    ];
    for (const [from, to] of invalid) {
      assert.equal(canTransitionSlot(from, to), false, `${from} → ${to} deveria ser inválida`);
    }
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar falha**

Run: `cd functions && npx tsc --noEmit && npx --node-options=--experimental-vm-modules node --test lib/friendly-match-logic.test.js` (ou o script `npm test` do package.json, se já compilar+testar) — Expected: FAIL (tipos/valores antigos `sent`/`countered`/`declined`/`expired` não existem mais, `canTransitionSlot` não definida).

- [ ] **Step 3: Implementar a nova máquina de estados**

Substituir em `functions/src/friendly-match-logic.ts`:

```ts
export type FriendlyMatchStatus =
  | "filling"
  | "confirmed"
  | "unfilled"
  | "cancelled"
  | "no_show"
  | "completed"
  | "reviewed";

export type SlotStatus = "invited" | "accepted" | "declined" | "expired" | "countered";

export type FriendlyMatchObjective = "training" | "friendly" | "partner";

/**
 * Transições válidas do JOGO. `filling` substitui `sent`/`countered` de
 * antes — pelo menos uma vaga ainda não foi aceita. `unfilled` é novo:
 * `scheduledAt` chegou com o jogo ainda em `filling`.
 */
export const VALID_TRANSITIONS: Record<FriendlyMatchStatus, readonly FriendlyMatchStatus[]> = {
  filling: ["confirmed", "cancelled", "unfilled"],
  confirmed: ["cancelled", "no_show", "completed"],
  completed: ["reviewed"],
  unfilled: [],
  cancelled: [],
  no_show: [],
  reviewed: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from as FriendlyMatchStatus];
  return allowed != null && allowed.includes(to as FriendlyMatchStatus);
}

/**
 * Transições válidas da VAGA dentro de um jogo em `filling`. `countered` só
 * é alcançável quando o jogo tem uma única vaga (`slotsTotal === 1`) — quem
 * chama garante isso antes de transicionar, esta função só valida a forma.
 * `declined`/`expired` voltam pra `invited` quando o organizador repõe a
 * vaga com outro atleta.
 */
export const VALID_SLOT_TRANSITIONS: Record<SlotStatus, readonly SlotStatus[]> = {
  invited: ["accepted", "declined", "expired", "countered"],
  countered: ["accepted", "declined", "expired"],
  accepted: [],
  declined: ["invited"],
  expired: ["invited"],
};

export function canTransitionSlot(from: string, to: string): boolean {
  const allowed = VALID_SLOT_TRANSITIONS[from as SlotStatus];
  return allowed != null && allowed.includes(to as SlotStatus);
}
```

Manter inalterado o resto do arquivo (`CompatibilityProfile`, `computeCompatibilityScore`, `computeConfirmationSchedule`, `resolveCheckInWindowState`, `isCancellationPenalized`, `isInviteExpired`) — nenhuma dessas depende do par fixo.

- [ ] **Step 4: Rodar os testes e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-logic.ts functions/src/friendly-match-logic.test.ts
git commit -m "feat(friendly-match): generalize match/slot state machine for N participants"
```

### Task 2: `friendly-match-reputation.ts` — `reviewReceivedEventId` ganha `revieweeUid`

> **Nota de sequenciamento (descoberta na execução):** `npm test` roda `tsc`
> (build do projeto inteiro) antes de qualquer teste. Como
> `friendly-match-review.ts` chama `reviewReceivedEventId` com 2
> argumentos até a Task 15 rodar, commitar esta task isoladamente quebra a
> compilação do projeto inteiro (não só deste arquivo) até a Task 15
> terminar — o que invalida o "rodar testes, confirmar PASS" de todas as
> tasks 3–14 no meio do caminho. **Não execute esta task isoladamente.**
> Aplique a mudança desta task como o primeiro passo da Task 15 (mesmo
> commit ou commit imediatamente anterior, sem estado intermediário
> quebrado) — ela já é a chamadora principal da função. A Task 16 (outra
> chamadora) já é o passo seguinte na mesma sessão.

**Files:**
- Modify: `functions/src/friendly-match-reputation.ts:40-42`
- Test: `functions/src/friendly-match-reputation.test.ts:44-51,80-93`

**Interfaces:**
- Produces: `export function reviewReceivedEventId(matchId: string, reviewerUid: string, revieweeUid: string): string`
- Consumes: nada novo. É consumida pelas Tasks 15 e 16 (avaliação pairwise), onde `matchId + reviewerUid` sozinhos não identificam mais uma nota única (cada avaliador agora avalia N-1 pessoas).

- [ ] **Step 1: Escrever o teste que falha**

Em `functions/src/friendly-match-reputation.test.ts`, trocar:

```ts
    assert.equal(reviewReceivedEventId("m1", "u2"), "review_received_m1_u2");
```

por:

```ts
    assert.equal(reviewReceivedEventId("m1", "u2", "u3"), "review_received_m1_u2_u3");
```

E trocar as duas chamadas do describe `applyReputationEvent` (`reviewReceivedEventId("m1", "u2")` e `reviewReceivedEventId("m2", "u3")`) por `reviewReceivedEventId("m1", "u2", "u9")` e `reviewReceivedEventId("m2", "u3", "u9")` respectivamente (o terceiro argumento é livre nesses dois casos — só precisa ser uma string não vazia, já que o teste não afirma nada sobre o próprio id, só sobre o efeito em `summary`).

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="reputa"` (ou o comando de teste do projeto) — Expected: FAIL (`reviewReceivedEventId` espera 2 argumentos, chamada com 3 dá erro de tipo/assinatura).

- [ ] **Step 3: Implementar**

Em `functions/src/friendly-match-reputation.ts`, trocar:

```ts
export function reviewReceivedEventId(matchId: string, reviewerUid: string): string {
  return `review_received_${matchId}_${reviewerUid}`;
}
```

por:

```ts
export function reviewReceivedEventId(
  matchId: string, reviewerUid: string, revieweeUid: string,
): string {
  return `review_received_${matchId}_${reviewerUid}_${revieweeUid}`;
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-reputation.ts functions/src/friendly-match-reputation.test.ts
git commit -m "feat(friendly-match): scope review_received event id to reviewer+reviewee pair"
```

### Task 3: `friendly-match-invite.ts` — `sendFriendlyMatchInviteCore` para N vagas

**Files:**
- Modify: `functions/src/friendly-match-invite.ts` (tipos `SendFriendlyMatchInput`/`FriendlyMatchActionResult`, helpers de sanitização, `hasPendingInviteBetween` → `hasPendingInviteWith`, `sendFriendlyMatchInviteCore`)
- Test: `functions/src/friendly-match-invite.test.ts:62-188` (describe `sendFriendlyMatchInviteCore`)

**Interfaces:**
- Produces: `export type SendFriendlyMatchInput = {toUids: string[]; sport: string; objective: FriendlyMatchObjective; scheduledAtMs: number; alternativeTimesMs?: number[]; location: FriendlyMatchLocation; message?: string}`; `export async function sendFriendlyMatchInviteCore(db, uid, input, nowMs?): Promise<FriendlyMatchActionResult>` (retorna `{matchId, notifications}` — uma notificação por convidado); helper interno `pendingUidsOf(slots): string[]`, `nextSlotExpiresAtOf(slots): Timestamp | null`, `hasPendingInviteWith(db, uidA, uidB): Promise<boolean>`.
- Consumes: `canTransitionSlot`/`FriendlyMatchStatus`/`SlotStatus` da Task 1; `computeCompatibilityScore`, `isInviteExpired` (já existiam); `loadFriendlyMatchConfig` (já existia).

**Design notes:**
- `toUids` substitui `toUid` (string única) — sempre um array, `slotsTotal = toUids.length`. O 1:1 de hoje é só `toUids.length === 1`.
- `alternativeTimesMs` (horários alternativos oferecidos pelo organizador) só é aceito quando `toUids.length === 1` — com N>1 o horário é único e fixo pra não haver conflito entre vagas escolhendo horários diferentes (mesma razão de a contraproposta só existir em N=1, ver spec).
- `scoreAtSend`/`scoreBreakdown` saem do top-level do doc e viram campo de cada slot (compatibilidade é organizador↔cada convidado individualmente).
- `hasPendingInviteBetween(db, uidA, uidB)` (checava `fromUid`/`toUid` com `status in [sent, countered]`) vira `hasPendingInviteWith(db, uidA, uidB)`, que consulta o novo campo `pendingSlotUids` por `organizerUid`: existe convite pendente entre A e B se A é organizador de um jogo com B em `pendingSlotUids`, OU B é organizador de um jogo com A em `pendingSlotUids`.

- [ ] **Step 1: Escrever os testes que falham**

Substituir todo o describe `sendFriendlyMatchInviteCore` (e os helpers `sendInvite`/`seedProfile` no topo) em `functions/src/friendly-match-invite.test.ts` por:

```ts
function seedProfile(fake: FakeFirestore, uid: string, overrides: DocData = {}): void {
  fake.seedDoc(`public_profiles/${uid}`, {
    fullName: `Atleta ${uid}`,
    city: "Vitória",
    state: "ES",
    sportOnboarding: {levelsBySport: {volei_praia: "intermediario_1"}},
    ...overrides,
  });
}

/** Envia um convite válido organizador→[toUids] e retorna o id criado. */
async function sendInvite(
  fake: FakeFirestore,
  nowMs: number,
  toUids: string[] = ["b"],
  overrides: Record<string, unknown> = {},
): Promise<string> {
  seedProfile(fake, "a");
  for (const toUid of toUids) seedProfile(fake, toUid);
  const result = await sendFriendlyMatchInviteCore(db(fake), "a", {
    toUids,
    sport: "volei_praia",
    objective: "friendly",
    scheduledAtMs: nowMs + 48 * HOUR_MS,
    location: {arenaId: "arena1", arenaName: "Arena Teste"},
    ...overrides,
  }, nowMs);
  return result.matchId;
}

describe("sendFriendlyMatchInviteCore", () => {
  const now = Date.UTC(2026, 6, 10, 12, 0, 0);

  it("cria o jogo 1:1 (slotsTotal=1) com slot invited, score por slot, expiração e história", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "filling");
    assert.equal(data.organizerUid, "a");
    assert.equal(data.slotsTotal, 1);
    assert.deepEqual(data.participantUids, ["a"]);
    assert.deepEqual(data.pendingSlotUids, ["b"]);
    const slots = data.slots as Array<Record<string, unknown>>;
    assert.equal(slots.length, 1);
    assert.equal(slots[0].uid, "b");
    assert.equal(slots[0].status, "invited");
    assert.ok((slots[0].scoreAtSend as number) > 0);
    assert.equal((slots[0].expiresAt as Timestamp).toMillis(), now + 24 * HOUR_MS);
    assert.equal((data.nextSlotExpiresAt as Timestamp).toMillis(), now + 24 * HOUR_MS);
    const history = data.history as Array<{status: string; actorUid: string}>;
    assert.equal(history.length, 1);
    assert.equal(history[0].status, "filling");
  });

  it("cria jogo com N vagas — uma notificação por convidado, todas invited", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    seedProfile(fake, "b");
    seedProfile(fake, "c");
    seedProfile(fake, "d");
    const result = await sendFriendlyMatchInviteCore(db(fake), "a", {
      toUids: ["b", "c", "d"],
      sport: "volei_praia",
      objective: "friendly",
      scheduledAtMs: now + 48 * HOUR_MS,
      location: {freeText: "Praia de Camburi"},
    }, now);
    const data = matchData(fake, result.matchId);
    assert.equal(data.slotsTotal, 3);
    assert.deepEqual(data.pendingSlotUids, ["b", "c", "d"]);
    assert.equal(result.notifications.length, 3);
    assert.deepEqual(result.notifications.map((n) => n.userId).sort(), ["b", "c", "d"]);
    assert.ok(result.notifications.every((n) => n.type === "friendly_match_invite"));
  });

  it("rejeita horários alternativos quando há mais de 1 convidado", async () => {
    const fake = new FakeFirestore();
    await assertHttpsError(
      sendInvite(fake, now, ["b", "c"], {alternativeTimesMs: [now + 50 * HOUR_MS]}),
      "invalid-argument",
    );
  });

  it("rejeita lista de convidados vazia, convite a si mesmo e duplicata na mesma lista", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    seedProfile(fake, "b");
    await assertHttpsError(sendInvite(fake, now, []), "invalid-argument");
    await assertHttpsError(sendInvite(fake, now, ["a"]), "invalid-argument");
    await assertHttpsError(sendInvite(fake, now, ["b", "b"]), "invalid-argument");
  });

  it("rejeita mais que MAX_INVITEES convidados", async () => {
    const fake = new FakeFirestore();
    const many = Array.from({length: 11}, (_, i) => `u${i}`);
    await assertHttpsError(sendInvite(fake, now, many), "invalid-argument");
  });

  it("rejeita destinatário sem perfil público", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {
        toUids: ["ghost"], sport: "volei_praia", objective: "friendly",
        scheduledAtMs: now + HOUR_MS, location: {freeText: "x"},
      }, now),
      "not-found",
    );
  });

  it("rejeita horário no passado, local vazio e mensagem longa", async () => {
    const fake = new FakeFirestore();
    seedProfile(fake, "a");
    seedProfile(fake, "b");
    const valid = {
      toUids: ["b"], sport: "volei_praia", objective: "friendly" as const,
      scheduledAtMs: now + HOUR_MS, location: {freeText: "x"},
    };
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {...valid, scheduledAtMs: now - 1}, now),
      "invalid-argument",
    );
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {...valid, location: {}}, now),
      "invalid-argument",
    );
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "a", {...valid, message: "x".repeat(301)}, now),
      "invalid-argument",
    );
  });

  it("rejeita novo convite enquanto houver convite pendente entre organizador e convidado (nas duas direções)", async () => {
    const fake = new FakeFirestore();
    await sendInvite(fake, now, ["b"]);
    await assertHttpsError(sendInvite(fake, now, ["b"]), "failed-precondition");
    // Direção inversa também bloqueia: b tentando convidar a.
    seedProfile(fake, "b");
    seedProfile(fake, "a");
    await assertHttpsError(
      sendFriendlyMatchInviteCore(db(fake), "b", {
        toUids: ["a"], sport: "volei_praia", objective: "friendly",
        scheduledAtMs: now + HOUR_MS, location: {freeText: "x"},
      }, now),
      "failed-precondition",
    );
  });
});
```

Ajustar a função `matchData` no topo do arquivo (já existente) para continuar igual — ela só lê `friendlyMatches/{matchId}` do fake, não precisa mudar.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test` (ou o comando equivalente) — Expected: FAIL (assinatura `toUid` string única, sem `toUids`, sem `pendingSlotUids`/`nextSlotExpiresAt`, sem `MAX_INVITEES`).

- [ ] **Step 3: Implementar**

Em `functions/src/friendly-match-invite.ts`, trocar o tipo e a constante:

```ts
const MAX_ALTERNATIVE_TIMES = 2;
const MAX_INVITEES = 10;
const PENDING_SLOT_STATUSES = ["invited", "countered"] as const;
```

(remove `PENDING_STATUSES` antigo — não existe mais status `sent`/`countered` no jogo).

```ts
export type SendFriendlyMatchInput = {
  toUids: string[];
  sport: string;
  objective: FriendlyMatchObjective;
  scheduledAtMs: number;
  alternativeTimesMs?: number[];
  location: FriendlyMatchLocation;
  message?: string;
};
```

Trocar `hasPendingInviteBetween` por:

```ts
/**
 * Convite pendente (vaga invited/countered) entre A e B, em qualquer
 * direção como organizador. `excludeMatchId` (usado pela Task 7 — repor
 * vaga) ignora o próprio jogo sendo editado, senão o convidado já ocupar
 * outra vaga NESSE MESMO jogo dispara `failed-precondition` aqui antes da
 * checagem dedicada "já ocupa outra vaga" dentro da transação.
 */
async function hasPendingInviteWith(
  db: Firestore,
  uidA: string,
  uidB: string,
  excludeMatchId?: string,
): Promise<boolean> {
  for (const [organizerUid, otherUid] of [[uidA, uidB], [uidB, uidA]]) {
    const snap = await db
      .collection(MATCHES_COLLECTION)
      .where("organizerUid", "==", organizerUid)
      .where("pendingSlotUids", "array-contains", otherUid)
      .limit(excludeMatchId ? 5 : 1) // margem maior quando excluindo: o 1º resultado pode ser o excluído
      .get();
    if (snap.docs.some((doc) => doc.id !== excludeMatchId)) return true;
  }
  return false;
}

function pendingUidsOf(slots: MatchData[]): string[] {
  return slots
    .filter((s) => PENDING_SLOT_STATUSES.includes(s.status as typeof PENDING_SLOT_STATUSES[number]))
    .map((s) => s.uid as string);
}

function nextSlotExpiresAtOf(slots: MatchData[]): Timestamp | null {
  let min: Timestamp | null = null;
  for (const s of slots) {
    if (!PENDING_SLOT_STATUSES.includes(s.status as typeof PENDING_SLOT_STATUSES[number])) continue;
    const at = s.expiresAt as Timestamp;
    if (min == null || at.toMillis() < min.toMillis()) min = at;
  }
  return min;
}

function sanitizeToUids(raw: unknown, organizerUid: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpsError("invalid-argument", "Escolha ao menos um atleta para convidar.");
  }
  if (raw.length > MAX_INVITEES) {
    throw new HttpsError("invalid-argument", `Convide no máximo ${MAX_INVITEES} atletas.`);
  }
  const seen = new Set<string>();
  const toUids: string[] = [];
  for (const value of raw) {
    const toUid = typeof value === "string" ? value.trim() : "";
    if (!toUid || toUid === organizerUid) {
      throw new HttpsError("invalid-argument", "Escolha outro atleta para convidar.");
    }
    if (seen.has(toUid)) {
      throw new HttpsError("invalid-argument", "Não é possível convidar o mesmo atleta duas vezes.");
    }
    seen.add(toUid);
    toUids.push(toUid);
  }
  return toUids;
}
```

Reescrever `sendFriendlyMatchInviteCore`:

```ts
export async function sendFriendlyMatchInviteCore(
  db: Firestore,
  uid: string,
  input: SendFriendlyMatchInput,
  nowMs: number = Date.now(),
): Promise<FriendlyMatchActionResult> {
  const toUids = sanitizeToUids(input.toUids, uid);
  const sport = typeof input.sport === "string" ? input.sport.trim() : "";
  if (!sport) {
    throw new HttpsError("invalid-argument", "Informe o esporte do jogo.");
  }
  if (!OBJECTIVES.includes(input.objective)) {
    throw new HttpsError("invalid-argument", "Objetivo do jogo inválido.");
  }
  const scheduledAtMs = requireFutureMs(input.scheduledAtMs, nowMs, "Horário do jogo");
  if (toUids.length > 1 && input.alternativeTimesMs != null && input.alternativeTimesMs.length > 0) {
    throw new HttpsError(
      "invalid-argument", "Horários alternativos só valem para convite a uma pessoa.");
  }
  const alternativeTimesMs = toUids.length === 1 ?
    sanitizeAlternativeTimes(input.alternativeTimesMs, nowMs) : [];
  const location = sanitizeLocation(input.location);
  const message = sanitizeMessage(input.message);

  const [senderSnap, ...recipientSnaps] = await Promise.all([
    db.doc(`public_profiles/${uid}`).get(),
    ...toUids.map((toUid) => db.doc(`public_profiles/${toUid}`).get()),
  ]);
  recipientSnaps.forEach((snap, i) => {
    if (!snap.exists) throw new HttpsError("not-found", `Atleta não encontrado: ${toUids[i]}`);
  });
  const senderProfile = (senderSnap.data() ?? {}) as MatchData;

  for (const toUid of toUids) {
    if (await hasPendingInviteWith(db, uid, toUid)) {
      throw new HttpsError(
        "failed-precondition", "Já existe um convite pendente entre vocês.");
    }
  }

  const config = await loadFriendlyMatchConfig(db);
  const fromName = displayNameOf(senderProfile);
  const now = Timestamp.fromMillis(nowMs);
  const expiresAt = Timestamp.fromMillis(nowMs + config.inviteExpirationHours * HOUR_MS);

  const slots: MatchData[] = toUids.map((toUid, i) => {
    const recipientProfile = recipientSnaps[i].data() as MatchData;
    const {score, breakdown} = computeCompatibilityScore({
      sport, objective: input.objective,
      sender: compatibilityProfileOf(senderProfile),
      recipient: compatibilityProfileOf(recipientProfile),
    });
    const photoUrl = photoUrlOf(recipientProfile);
    return {
      uid: toUid,
      name: displayNameOf(recipientProfile),
      photoUrl: photoUrl ?? null,
      status: "invited",
      invitedAt: now,
      respondedAt: null,
      expiresAt,
      scoreAtSend: score,
      scoreBreakdown: breakdown,
    };
  });

  const doc: MatchData = {
    organizerUid: uid,
    organizerName: fromName,
    slotsTotal: toUids.length,
    slots,
    participantUids: [uid],
    pendingSlotUids: pendingUidsOf(slots),
    nextSlotExpiresAt: nextSlotExpiresAtOf(slots),
    sport,
    objective: input.objective,
    scheduledAt: Timestamp.fromMillis(scheduledAtMs),
    alternativeTimes: alternativeTimesMs.map((ms) => Timestamp.fromMillis(ms)),
    location,
    status: "filling",
    statusUpdatedAt: now,
    history: [historyEntry("filling", uid, nowMs)],
    createdAt: now,
    updatedAt: now,
  };
  const fromPhotoUrl = photoUrlOf(senderProfile);
  if (fromPhotoUrl) doc.organizerPhotoUrl = fromPhotoUrl;
  if (message) doc.message = message;

  const ref = await db.collection(MATCHES_COLLECTION).add(doc);
  const notifications = slots.map((slot) => {
    const body = input.objective === "partner" ?
      `${fromName} quer formar dupla com você` :
      `${fromName} te convidou para jogar`;
    return notificationFor(doc, ref.id, slot.uid as string, "friendly_match_invite", "Bora jogar? 🏐", body);
  });
  return {matchId: ref.id, notifications};
}
```

Manter inalterados: `requireFutureMs`, `sanitizeLocation`, `sanitizeMessage`, `sanitizeAlternativeTimes`, `displayNameOf`, `photoUrlOf`, `compatibilityProfileOf`, `historyEntry`, `appendHistory`, `notificationFor`, `OBJECTIVES`, `MAX_MESSAGE_LENGTH`, `HOUR_MS`, `MATCHES_COLLECTION`.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS (as demais describes do arquivo — `acceptFriendlyMatchInviteCore` etc. — ainda vão falhar até as próximas tasks; rodar só o describe deste task: `npm test -- --test-name-pattern="sendFriendlyMatchInviteCore"`).

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-invite.ts functions/src/friendly-match-invite.test.ts
git commit -m "feat(friendly-match): send invite to N athletes at once (slots model)"
```

> **Nota de sequenciamento (descoberta na execução):** as Tasks 4 e 5 têm
> testes que exercitam `counterFriendlyMatchInviteCore` (o teste "após
> contraproposta..."). Até a Task 6 rodar, essa função ainda lê o schema
> antigo (`data.status !== "sent"`, `data.toUid`) contra um doc já no
> schema novo (Task 3) — o teste falharia em runtime, não por erro de
> build. **Execute a Task 6 antes da Task 4 e da Task 5** (Task 6 não
> depende de nada delas — só de `pendingUidsOf`/`nextSlotExpiresAtOf` da
> Task 3). Ordem real de execução: 1, 3, 6, 4, 5, 7, 8, 9, 10…18 (Task 2
> fica pra dentro da Task 15, ver nota acima).
>
> **Correção de bug (descoberta na execução):** o código da Task 6 abaixo
> tinha `if (slot.status !== "invited" || slot.uid !== uid)` combinando as
> checagens de "já respondida" e "usuário errado" — isso faz o próprio
> teste "só há uma rodada de contraproposta" da Task 6 falhar (o
> organizador, na 2ª tentativa, bate em `slot.uid !== uid` antes de
> `slot.status`, lançando `permission-denied` em vez de
> `failed-precondition`). Corrigido abaixo para duas checagens em
> sequência, status primeiro.

### Task 4: `friendly-match-invite.ts` — aceitar vaga (`acceptFriendlyMatchInviteSlotCore`)

**Files:**
- Modify: `functions/src/friendly-match-invite.ts` (renomeia/reescreve `acceptFriendlyMatchInviteCore`)
- Test: `functions/src/friendly-match-invite.test.ts` (describe `acceptFriendlyMatchInviteCore`)

**Interfaces:**
- Produces: `export async function acceptFriendlyMatchInviteSlotCore(db, uid, input: {matchId: string; chosenTimeMs?: number}, nowMs?): Promise<FriendlyMatchActionResult>`; helper interno `slotResponderUid(data, slot): string` (é o `slot.uid`, exceto quando `slot.status === "countered"`, caso em que é `data.organizerUid`).
- Consumes: `pendingUidsOf`, `nextSlotExpiresAtOf` (Task 3); `computeConfirmationSchedule`, `isInviteExpired` (já existiam); `historyEntry`/`appendHistory`/`notificationFor` (já existiam).

**Design note:** quando `slotsTotal === 1` e o slot está `countered`, quem aceita é o **organizador** (aceitando a contraproposta do convidado) — daí `slotResponderUid`. Para `slotsTotal > 1`, `countered` nunca ocorre (Task 6 garante isso), então `slotResponderUid` sempre devolve `slot.uid`.

- [ ] **Step 1: Escrever os testes que falham**

Substituir o describe `acceptFriendlyMatchInviteCore` por:

```ts
describe("acceptFriendlyMatchInviteSlotCore", () => {
  const now = Date.UTC(2026, 6, 10, 12, 0, 0);

  it("único convidado aceita → confirmed direto, com janelas derivadas e notificação a todos", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    const scheduled = now + 48 * HOUR_MS;
    const result = await acceptFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "confirmed");
    assert.deepEqual((data.participantUids as string[]).sort(), ["a", "b"]);
    assert.deepEqual(data.pendingSlotUids, []);
    assert.equal((data.confirmedTime as Timestamp).toMillis(), scheduled);
    assert.equal((data.checkInOpenAt as Timestamp).toMillis(), scheduled - 30 * 60 * 1000);
    assert.equal((data.reminder24hAt as Timestamp).toMillis(), scheduled - 24 * HOUR_MS);
    assert.equal(result.notifications.length, 2);
    assert.ok(result.notifications.every((n) => n.type === "friendly_match_confirmed"));
  });

  it("com 3 vagas: aceite parcial não confirma; último aceite confirma e avisa todo mundo", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b", "c", "d"]);
    const r1 = await acceptFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now);
    assert.equal(matchData(fake, matchId).status, "filling");
    assert.equal(r1.notifications.length, 1);
    assert.equal(r1.notifications[0].userId, "a"); // avisa o organizador
    assert.equal(r1.notifications[0].type, "friendly_match_slot_accepted");

    await acceptFriendlyMatchInviteSlotCore(db(fake), "c", {matchId}, now);
    const r3 = await acceptFriendlyMatchInviteSlotCore(db(fake), "d", {matchId}, now);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "confirmed");
    assert.deepEqual((data.participantUids as string[]).sort(), ["a", "b", "c", "d"]);
    assert.equal(r3.notifications.length, 4); // organizador + 3 convidados
    assert.ok(r3.notifications.every((n) => n.type === "friendly_match_confirmed"));
  });

  it("quem não tem vaga pendente não pode aceitar", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    await assertHttpsError(
      acceptFriendlyMatchInviteSlotCore(db(fake), "a", {matchId}, now),
      "permission-denied",
    );
    await assertHttpsError(
      acceptFriendlyMatchInviteSlotCore(db(fake), "intruso", {matchId}, now),
      "permission-denied",
    );
  });

  it("vaga vencida vira expired no aceite e a chamada falha", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    const late = now + 25 * HOUR_MS;
    await assertHttpsError(
      acceptFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, late),
      "failed-precondition",
    );
    const slots = matchData(fake, matchId).slots as Array<{status: string}>;
    assert.equal(slots[0].status, "expired");
  });

  it("aceite duplo falha na segunda vez", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    await acceptFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now);
    await assertHttpsError(
      acceptFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now),
      "failed-precondition",
    );
  });

  it("aceita escolhendo um horário alternativo (1:1); horário fora da proposta é rejeitado", async () => {
    const fake = new FakeFirestore();
    const alt = now + 72 * HOUR_MS;
    const matchId = await sendInvite(fake, now, ["b"], {alternativeTimesMs: [alt]});
    await assertHttpsError(
      acceptFriendlyMatchInviteSlotCore(db(fake), "b", {matchId, chosenTimeMs: now + 99 * HOUR_MS}, now),
      "invalid-argument",
    );
    await acceptFriendlyMatchInviteSlotCore(db(fake), "b", {matchId, chosenTimeMs: alt}, now);
    assert.equal((matchData(fake, matchId).confirmedTime as Timestamp).toMillis(), alt);
  });

  it("após contraproposta (1:1), é o organizador quem aceita (o horário da contraproposta)", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    const counterTime = now + 96 * HOUR_MS;
    await counterFriendlyMatchInviteCore(db(fake), "b", {matchId, scheduledAtMs: counterTime}, now);
    await assertHttpsError(
      acceptFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now),
      "permission-denied",
    );
    await acceptFriendlyMatchInviteSlotCore(db(fake), "a", {matchId}, now);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "confirmed");
    assert.equal((data.confirmedTime as Timestamp).toMillis(), counterTime);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="acceptFriendlyMatchInviteSlotCore"` — Expected: FAIL (função não existe com esse nome/assinatura ainda).

- [ ] **Step 3: Implementar**

Adicionar em `functions/src/friendly-match-invite.ts` (substitui o antigo `acceptFriendlyMatchInviteCore` — mas `responderOf`/`assertResponder`/`assertPendingStatus`/`commitExpiredFlip` continuam no arquivo por enquanto, ver correção mais abaixo: `declineFriendlyMatchInviteCore` ainda os usa até a Task 5):

```ts
function slotResponderUid(data: MatchData, slot: MatchData): string {
  return slot.status === "countered" ? (data.organizerUid as string) : (slot.uid as string);
}

export async function acceptFriendlyMatchInviteSlotCore(
  db: Firestore,
  uid: string,
  input: {matchId: string; chosenTimeMs?: number},
  nowMs: number = Date.now(),
): Promise<FriendlyMatchActionResult> {
  const ref = matchRef(db, input.matchId);
  const config = await loadFriendlyMatchConfig(db);

  const outcome = await db.runTransaction<TransitionOutcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
    const data = snap.data() as MatchData;
    if (data.status !== "filling") {
      throw new HttpsError("failed-precondition", "Este jogo não está mais aguardando resposta.");
    }
    const slots = (data.slots as MatchData[]).slice();
    const slotIndex = slots.findIndex((s) => slotResponderUid(data, s) === uid);
    if (slotIndex === -1) {
      throw new HttpsError("permission-denied", "Você não tem uma vaga pendente neste jogo.");
    }
    const slot = slots[slotIndex];
    if (slot.status !== "invited" && slot.status !== "countered") {
      throw new HttpsError("failed-precondition", "Esta vaga não está mais aguardando resposta.");
    }
    if (isInviteExpired((slot.expiresAt as Timestamp).toMillis(), nowMs)) {
      slots[slotIndex] = {...slot, status: "expired"};
      tx.set(ref, {
        slots,
        pendingSlotUids: pendingUidsOf(slots),
        nextSlotExpiresAt: nextSlotExpiresAtOf(slots),
        updatedAt: Timestamp.fromMillis(nowMs),
        history: appendHistory(data, historyEntry("slot_expired", uid, nowMs)),
      }, {merge: true});
      return {kind: "expired"};
    }

    const counter = (slot.counterProposal ?? null) as MatchData | null;
    const proposalMain = counter ?
      (counter.scheduledAt as Timestamp).toMillis() : (data.scheduledAt as Timestamp).toMillis();
    const proposalAlts = counter && Array.isArray(counter.alternativeTimes) ?
      (counter.alternativeTimes as Timestamp[]).map((ts) => ts.toMillis()) :
      Array.isArray(data.alternativeTimes) ?
        (data.alternativeTimes as Timestamp[]).map((ts) => ts.toMillis()) : [];
    const chosenMs = input.chosenTimeMs ?? proposalMain;
    if (![proposalMain, ...proposalAlts].includes(chosenMs)) {
      throw new HttpsError("invalid-argument", "Escolha um dos horários propostos.");
    }

    slots[slotIndex] = {...slot, status: "accepted", respondedAt: Timestamp.fromMillis(nowMs)};
    const participantUids = [...(data.participantUids as string[]), slot.uid as string];
    const allAccepted = slots.every((s) => s.status === "accepted");

    const update: MatchData = {
      slots,
      pendingSlotUids: pendingUidsOf(slots),
      nextSlotExpiresAt: nextSlotExpiresAtOf(slots),
      participantUids,
      updatedAt: Timestamp.fromMillis(nowMs),
      history: appendHistory(data, historyEntry("slot_accepted", uid, nowMs)),
    };
    if (counter?.location != null) update.location = counter.location;

    const notifications: FriendlyMatchNotification[] = [];
    if (!allAccepted) {
      const remaining = slots.filter((s) => s.status !== "accepted").length;
      notifications.push(notificationFor(
        data, ref.id, data.organizerUid as string, "friendly_match_slot_accepted",
        "Vaga confirmada ✅", `${slot.name} topou! Faltam ${remaining} vaga(s).`));
    } else {
      const schedule = computeConfirmationSchedule(chosenMs, config, nowMs);
      update.status = "confirmed";
      update.statusUpdatedAt = Timestamp.fromMillis(nowMs);
      update.confirmedAt = Timestamp.fromMillis(nowMs);
      update.confirmedTime = Timestamp.fromMillis(chosenMs);
      update.scheduledAt = Timestamp.fromMillis(chosenMs);
      update.checkInOpenAt = Timestamp.fromMillis(schedule.checkInOpenAtMs);
      update.checkInCloseAt = Timestamp.fromMillis(schedule.checkInCloseAtMs);
      if (schedule.reminder24hAtMs != null) update.reminder24hAt = Timestamp.fromMillis(schedule.reminder24hAtMs);
      if (schedule.reminder2hAtMs != null) update.reminder2hAt = Timestamp.fromMillis(schedule.reminder2hAtMs);
      update.history = appendHistory(data, historyEntry("confirmed", uid, nowMs));
      for (const participantUid of participantUids) {
        notifications.push(notificationFor(
          data, ref.id, participantUid, "friendly_match_confirmed",
          "Deu match! 🎉", "Todo mundo confirmou. Bora jogar!"));
      }
    }

    tx.set(ref, update, {merge: true});
    return {kind: "ok", data, notifications};
  });

  if (outcome.kind === "expired") {
    throw new HttpsError("failed-precondition", "Esta vaga expirou.");
  }
  return {matchId: ref.id, notifications: outcome.notifications};
}
```

**Correção (descoberta na execução):** `responderOf`, `assertPendingStatus`, `assertResponder` e `commitExpiredFlip` **ainda são usados por `declineFriendlyMatchInviteCore`**, que só é reescrito na Task 5 (dispatchada logo em seguida) — **não remova esses quatro nesta task**, senão quebra a decline antes da hora. Deixe-os como estão; a Task 5 é quem os remove de fato, quando reescrever decline e eles ficarem realmente órfãos. Mantenha `matchRef` (usado por todas as funções do arquivo). `commitExpiredFlip` também fica até a Task 5.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-invite.ts functions/src/friendly-match-invite.test.ts
git commit -m "feat(friendly-match): accept a slot; confirm match when all slots accepted"
```

### Task 5: `friendly-match-invite.ts` — recusar vaga (`declineFriendlyMatchInviteSlotCore`)

**Files:**
- Modify: `functions/src/friendly-match-invite.ts` (substitui `declineFriendlyMatchInviteCore`)
- Test: `functions/src/friendly-match-invite.test.ts` (describe `declineFriendlyMatchInviteCore`)

**Interfaces:**
- Produces: `export async function declineFriendlyMatchInviteSlotCore(db, uid, input: {matchId: string; reason?: string}, nowMs?): Promise<FriendlyMatchActionResult>`.
- Consumes: `slotResponderUid` (Task 4), `pendingUidsOf`/`nextSlotExpiresAtOf` (Task 3).

**Design note:** recusar **não** derruba o jogo — só marca a vaga `declined` (uid do convidado permanece no registro pra exibição/histórico) e notifica o organizador. O jogo continua `filling`.

**Correção (descoberta na execução):** esta é a task que finalmente torna `responderOf`, `assertPendingStatus`, `assertResponder` e `commitExpiredFlip` órfãos de verdade (a Task 4 os manteve porque `declineFriendlyMatchInviteCore` ainda os usava). Ao reescrever o corpo desta função no Step 3, **remova as quatro** — confirme antes com um grep no arquivo que nenhuma outra função ainda os referencia.

- [ ] **Step 1: Escrever os testes que falham**

Substituir o describe `declineFriendlyMatchInviteCore` por:

```ts
describe("declineFriendlyMatchInviteSlotCore", () => {
  const now = Date.UTC(2026, 6, 10, 12, 0, 0);

  it("convidado recusa → vaga declined, jogo continua filling, notifica organizador", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    const result = await declineFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "filling");
    const slots = data.slots as Array<{uid: string; status: string}>;
    assert.equal(slots[0].status, "declined");
    assert.equal(slots[0].uid, "b");
    assert.deepEqual(data.pendingSlotUids, []);
    assert.equal(result.notifications[0].userId, "a");
    assert.equal(result.notifications[0].type, "friendly_match_slot_declined");
  });

  it("recusa não derruba as outras vagas do jogo", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b", "c"]);
    await declineFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now);
    await acceptFriendlyMatchInviteSlotCore(db(fake), "c", {matchId}, now);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "filling"); // falta repor a vaga de b
    const slots = data.slots as Array<{uid: string; status: string}>;
    assert.equal(slots.find((s) => s.uid === "b")!.status, "declined");
    assert.equal(slots.find((s) => s.uid === "c")!.status, "accepted");
  });

  it("remetente da contraproposta (organizador, 1:1) também pode recusar", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    await counterFriendlyMatchInviteCore(db(fake), "b", {matchId, scheduledAtMs: now + 96 * HOUR_MS}, now);
    await declineFriendlyMatchInviteSlotCore(db(fake), "a", {matchId}, now);
    const slots = matchData(fake, matchId).slots as Array<{status: string}>;
    assert.equal(slots[0].status, "declined");
  });

  it("organizador não recusa a própria vaga pendente de outro (não é ele quem responde)", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    await assertHttpsError(
      declineFriendlyMatchInviteSlotCore(db(fake), "a", {matchId}, now),
      "permission-denied",
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="declineFriendlyMatchInviteSlotCore"` — Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
export async function declineFriendlyMatchInviteSlotCore(
  db: Firestore,
  uid: string,
  input: {matchId: string; reason?: string},
  nowMs: number = Date.now(),
): Promise<FriendlyMatchActionResult> {
  const ref = matchRef(db, input.matchId);
  const outcome = await db.runTransaction<TransitionOutcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
    const data = snap.data() as MatchData;
    if (data.status !== "filling") {
      throw new HttpsError("failed-precondition", "Este jogo não está mais aguardando resposta.");
    }
    const slots = (data.slots as MatchData[]).slice();
    const slotIndex = slots.findIndex((s) => slotResponderUid(data, s) === uid);
    if (slotIndex === -1) {
      throw new HttpsError("permission-denied", "Você não responde a nenhuma vaga neste jogo.");
    }
    const slot = slots[slotIndex];
    if (slot.status !== "invited" && slot.status !== "countered") {
      throw new HttpsError("failed-precondition", "Esta vaga não está mais aguardando resposta.");
    }
    if (isInviteExpired((slot.expiresAt as Timestamp).toMillis(), nowMs)) {
      slots[slotIndex] = {...slot, status: "expired"};
      tx.set(ref, {
        slots,
        pendingSlotUids: pendingUidsOf(slots),
        nextSlotExpiresAt: nextSlotExpiresAtOf(slots),
        updatedAt: Timestamp.fromMillis(nowMs),
        history: appendHistory(data, historyEntry("slot_expired", uid, nowMs)),
      }, {merge: true});
      return {kind: "expired"};
    }

    const reason = sanitizeMessage(input.reason);
    slots[slotIndex] = {
      ...slot,
      status: "declined",
      respondedAt: Timestamp.fromMillis(nowMs),
      ...(reason ? {declineReason: reason} : {}),
    };
    tx.set(ref, {
      slots,
      pendingSlotUids: pendingUidsOf(slots),
      nextSlotExpiresAt: nextSlotExpiresAtOf(slots),
      updatedAt: Timestamp.fromMillis(nowMs),
      history: appendHistory(data, historyEntry("slot_declined", uid, nowMs)),
    }, {merge: true});

    return {
      kind: "ok",
      data,
      notifications: [
        notificationFor(
          data, ref.id, data.organizerUid as string, "friendly_match_slot_declined",
          "Vaga recusada", `${slot.name} não pode jogar. Escolha outra pessoa pra vaga.`),
      ],
    };
  });

  if (outcome.kind === "expired") {
    throw new HttpsError("failed-precondition", "Esta vaga expirou.");
  }
  return {matchId: ref.id, notifications: outcome.notifications};
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-invite.ts functions/src/friendly-match-invite.test.ts
git commit -m "feat(friendly-match): decline a slot without killing the whole match"
```

### Task 6: `friendly-match-invite.ts` — contraproposta travada em `slotsTotal === 1`

**Files:**
- Modify: `functions/src/friendly-match-invite.ts` (`counterFriendlyMatchInviteCore`)
- Test: `functions/src/friendly-match-invite.test.ts` (describe `counterFriendlyMatchInviteCore`)

**Interfaces:**
- Produces: `export async function counterFriendlyMatchInviteCore(db, uid, input: {matchId: string; scheduledAtMs: number; alternativeTimesMs?: number[]; location?: FriendlyMatchLocation; message?: string}, nowMs?): Promise<FriendlyMatchActionResult>` — assinatura igual à de hoje, corpo reescrito pra operar em `slots[0]`.
- Consumes: `pendingUidsOf`/`nextSlotExpiresAtOf` (Task 3); é consumida pelas Tasks 4 e 5 (`slotResponderUid` trata `countered`).

- [ ] **Step 1: Escrever os testes que falham**

Substituir o describe `counterFriendlyMatchInviteCore` por:

```ts
describe("counterFriendlyMatchInviteCore", () => {
  const now = Date.UTC(2026, 6, 10, 12, 0, 0);

  it("convidado contrapõe (1:1) → slot countered, guarda proposta e renova expiração", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    const later = now + 3 * HOUR_MS;
    const counterTime = now + 96 * HOUR_MS;
    const result = await counterFriendlyMatchInviteCore(db(fake), "b", {
      matchId, scheduledAtMs: counterTime, message: "Consigo só no fim de semana",
    }, later);
    const data = matchData(fake, matchId);
    const slots = data.slots as Array<Record<string, unknown>>;
    assert.equal(slots[0].status, "countered");
    const counter = slots[0].counterProposal as {scheduledAt: Timestamp; proposedByUid: string};
    assert.equal(counter.scheduledAt.toMillis(), counterTime);
    assert.equal(counter.proposedByUid, "b");
    assert.equal((slots[0].expiresAt as Timestamp).toMillis(), later + 24 * HOUR_MS);
    assert.deepEqual(data.pendingSlotUids, ["b"]);
    assert.equal(result.notifications[0].userId, "a");
    assert.equal(result.notifications[0].type, "friendly_match_countered");
  });

  it("só há uma rodada de contraproposta", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    await counterFriendlyMatchInviteCore(db(fake), "b", {matchId, scheduledAtMs: now + 96 * HOUR_MS}, now);
    await assertHttpsError(
      counterFriendlyMatchInviteCore(db(fake), "a", {matchId, scheduledAtMs: now + 120 * HOUR_MS}, now),
      "failed-precondition",
    );
  });

  it("rejeita contraproposta em jogo com mais de 1 vaga", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b", "c"]);
    await assertHttpsError(
      counterFriendlyMatchInviteCore(db(fake), "b", {matchId, scheduledAtMs: now + 96 * HOUR_MS}, now),
      "failed-precondition",
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="counterFriendlyMatchInviteCore"` — Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
export async function counterFriendlyMatchInviteCore(
  db: Firestore,
  uid: string,
  input: {
    matchId: string;
    scheduledAtMs: number;
    alternativeTimesMs?: number[];
    location?: FriendlyMatchLocation;
    message?: string;
  },
  nowMs: number = Date.now(),
): Promise<FriendlyMatchActionResult> {
  const ref = matchRef(db, input.matchId);
  const scheduledAtMs = requireFutureMs(input.scheduledAtMs, nowMs, "Horário do jogo");
  const alternativeTimesMs = sanitizeAlternativeTimes(input.alternativeTimesMs, nowMs);
  const message = sanitizeMessage(input.message);
  const location = input.location != null ? sanitizeLocation(input.location) : null;
  const config = await loadFriendlyMatchConfig(db);

  const outcome = await db.runTransaction<TransitionOutcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Convite não encontrado.");
    const data = snap.data() as MatchData;
    if ((data.slotsTotal as number) !== 1) {
      throw new HttpsError(
        "failed-precondition", "Contraproposta só é possível em convite a uma pessoa.");
    }
    if (data.status !== "filling") {
      throw new HttpsError("failed-precondition", "Este jogo não está mais aguardando resposta.");
    }
    const slots = (data.slots as MatchData[]).slice();
    const slot = slots[0];
    if (slot.status !== "invited") {
      throw new HttpsError(
        "failed-precondition", "Este convite não aceita contraproposta — só há uma rodada.");
    }
    if (slot.uid !== uid) {
      throw new HttpsError("permission-denied", "Não é você quem responde este convite.");
    }
    if (isInviteExpired((slot.expiresAt as Timestamp).toMillis(), nowMs)) {
      slots[0] = {...slot, status: "expired"};
      tx.set(ref, {
        slots, pendingSlotUids: [], nextSlotExpiresAt: null,
        updatedAt: Timestamp.fromMillis(nowMs),
        history: appendHistory(data, historyEntry("slot_expired", uid, nowMs)),
      }, {merge: true});
      return {kind: "expired"};
    }

    const counterProposal: MatchData = {
      scheduledAt: Timestamp.fromMillis(scheduledAtMs),
      alternativeTimes: alternativeTimesMs.map((ms) => Timestamp.fromMillis(ms)),
      proposedByUid: uid,
      at: Timestamp.fromMillis(nowMs),
    };
    if (location) counterProposal.location = location;
    if (message) counterProposal.message = message;
    slots[0] = {
      ...slot,
      status: "countered",
      counterProposal,
      expiresAt: Timestamp.fromMillis(nowMs + config.inviteExpirationHours * HOUR_MS),
    };
    tx.set(ref, {
      slots,
      pendingSlotUids: pendingUidsOf(slots),
      nextSlotExpiresAt: nextSlotExpiresAtOf(slots),
      updatedAt: Timestamp.fromMillis(nowMs),
      history: appendHistory(data, historyEntry("slot_countered", uid, nowMs)),
    }, {merge: true});

    return {
      kind: "ok",
      data,
      notifications: [
        notificationFor(
          data, ref.id, data.organizerUid as string, "friendly_match_countered",
          "Contraproposta ⏱", `${slot.name} sugeriu outro horário para o jogo.`),
      ],
    };
  });

  if (outcome.kind === "expired") {
    throw new HttpsError("failed-precondition", "Este convite expirou.");
  }
  return {matchId: ref.id, notifications: outcome.notifications};
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-invite.ts functions/src/friendly-match-invite.test.ts
git commit -m "feat(friendly-match): restrict counter-proposal to 1:1 matches"
```

### Task 7: `friendly-match-invite.ts` — repor vaga aberta (`fillFriendlyMatchSlotCore`, nova)

**Files:**
- Modify: `functions/src/friendly-match-invite.ts` (função nova)
- Test: `functions/src/friendly-match-invite.test.ts` (describe novo)

**Interfaces:**
- Produces: `export async function fillFriendlyMatchSlotCore(db, uid, input: {matchId: string; slotIndex: number; toUid: string}, nowMs?): Promise<FriendlyMatchActionResult>`.
- Consumes: `hasPendingInviteWith`, `pendingUidsOf`, `nextSlotExpiresAtOf` (Task 3); `displayNameOf`/`photoUrlOf` (já existiam).

**Design note:** só o organizador chama; só aceita repor vaga em `declined`/`expired`; sobrescreve o registro do slot (não cria um novo).

**Correção (descoberta na execução):** `hasPendingInviteWith` (Task 3) ganhou um 4º parâmetro opcional `excludeMatchId` — sem ele, repor uma vaga com alguém que já ocupa outra vaga *desse mesmo jogo* dispara `failed-precondition` na checagem pré-transação antes mesmo de chegar na checagem dedicada "já ocupa outra vaga" dentro da transação (que devia responder `invalid-argument`). O texto de Task 3 acima já foi corrigido com esse parâmetro; a chamada nesta task passa `ref.id`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do arquivo (após o describe `cancelFriendlyMatchCore`, que a Task 8 vai reescrever):

```ts
describe("fillFriendlyMatchSlotCore", () => {
  const now = Date.UTC(2026, 6, 10, 12, 0, 0);

  it("organizador repõe vaga recusada com outro atleta", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b", "c"]);
    await declineFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now);
    seedProfile(fake, "e");
    const result = await fillFriendlyMatchSlotCore(
      db(fake), "a", {matchId, slotIndex: 0, toUid: "e"}, now);
    const slots = matchData(fake, matchId).slots as Array<Record<string, unknown>>;
    assert.equal(slots[0].uid, "e");
    assert.equal(slots[0].status, "invited");
    assert.equal(result.notifications[0].userId, "e");
    assert.equal(result.notifications[0].type, "friendly_match_invite");
  });

  it("só o organizador pode repor vaga", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    await declineFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now);
    seedProfile(fake, "e");
    await assertHttpsError(
      fillFriendlyMatchSlotCore(db(fake), "b", {matchId, slotIndex: 0, toUid: "e"}, now),
      "permission-denied",
    );
  });

  it("não repõe vaga que ainda está invited/accepted", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    seedProfile(fake, "e");
    await assertHttpsError(
      fillFriendlyMatchSlotCore(db(fake), "a", {matchId, slotIndex: 0, toUid: "e"}, now),
      "failed-precondition",
    );
  });

  it("não permite repor com alguém que já ocupa outra vaga do mesmo jogo", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b", "c"]);
    await declineFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now);
    await assertHttpsError(
      fillFriendlyMatchSlotCore(db(fake), "a", {matchId, slotIndex: 0, toUid: "c"}, now),
      "invalid-argument",
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="fillFriendlyMatchSlotCore"` — Expected: FAIL (função inexistente).

- [ ] **Step 3: Implementar**

```ts
export async function fillFriendlyMatchSlotCore(
  db: Firestore,
  uid: string,
  input: {matchId: string; slotIndex: number; toUid: string},
  nowMs: number = Date.now(),
): Promise<FriendlyMatchActionResult> {
  const ref = matchRef(db, input.matchId);
  const toUid = typeof input.toUid === "string" ? input.toUid.trim() : "";
  if (!toUid) throw new HttpsError("invalid-argument", "Escolha um atleta para a vaga.");

  const [organizerSnap, recipientSnap] = await Promise.all([
    db.doc(`public_profiles/${uid}`).get(),
    db.doc(`public_profiles/${toUid}`).get(),
  ]);
  if (!recipientSnap.exists) throw new HttpsError("not-found", "Atleta não encontrado.");
  const organizerProfile = (organizerSnap.data() ?? {}) as MatchData;
  const recipientProfile = recipientSnap.data() as MatchData;
  const config = await loadFriendlyMatchConfig(db);

  if (await hasPendingInviteWith(db, uid, toUid, ref.id)) {
    throw new HttpsError("failed-precondition", "Já existe um convite pendente com esse atleta.");
  }

  const outcome = await db.runTransaction<TransitionOutcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Jogo não encontrado.");
    const data = snap.data() as MatchData;
    if (data.organizerUid !== uid) {
      throw new HttpsError("permission-denied", "Só o organizador pode repor uma vaga.");
    }
    if (data.status !== "filling") {
      throw new HttpsError("failed-precondition", "Este jogo não aceita mais convites.");
    }
    const slots = (data.slots as MatchData[]).slice();
    const slot = slots[input.slotIndex];
    if (slot == null || (slot.status !== "declined" && slot.status !== "expired")) {
      throw new HttpsError("failed-precondition", "Esta vaga não está aberta.");
    }
    if (toUid === uid || slots.some((s, i) => i !== input.slotIndex && s.uid === toUid)) {
      throw new HttpsError("invalid-argument", "Escolha outro atleta para a vaga.");
    }

    const {score, breakdown} = computeCompatibilityScore({
      sport: data.sport as string,
      objective: data.objective as FriendlyMatchObjective,
      sender: compatibilityProfileOf(organizerProfile),
      recipient: compatibilityProfileOf(recipientProfile),
    });
    slots[input.slotIndex] = {
      uid: toUid,
      name: displayNameOf(recipientProfile),
      photoUrl: photoUrlOf(recipientProfile) ?? null,
      status: "invited",
      invitedAt: Timestamp.fromMillis(nowMs),
      respondedAt: null,
      expiresAt: Timestamp.fromMillis(nowMs + config.inviteExpirationHours * HOUR_MS),
      scoreAtSend: score,
      scoreBreakdown: breakdown,
    };
    tx.set(ref, {
      slots,
      pendingSlotUids: pendingUidsOf(slots),
      nextSlotExpiresAt: nextSlotExpiresAtOf(slots),
      updatedAt: Timestamp.fromMillis(nowMs),
      history: appendHistory(data, historyEntry("slot_refilled", uid, nowMs)),
    }, {merge: true});
    return {
      kind: "ok", data,
      notifications: [
        notificationFor(data, ref.id, toUid, "friendly_match_invite", "Bora jogar? 🏐",
          `${data.organizerName} te convidou para jogar`),
      ],
    };
  });
  if (outcome.kind === "expired") {
    throw new HttpsError("failed-precondition", "Não foi possível repor a vaga.");
  }
  return {matchId: ref.id, notifications: outcome.notifications};
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-invite.ts functions/src/friendly-match-invite.test.ts
git commit -m "feat(friendly-match): let organizer refill a declined/expired slot"
```

### Task 8: `friendly-match-invite.ts` — `cancelFriendlyMatchCore` para N participantes

**Files:**
- Modify: `functions/src/friendly-match-invite.ts` (`cancelFriendlyMatchCore`)
- Test: `functions/src/friendly-match-invite.test.ts` (describe `cancelFriendlyMatchCore`)

**Interfaces:**
- Produces: `export async function cancelFriendlyMatchCore(db, uid, input: {matchId: string}, nowMs?): Promise<FriendlyMatchActionResult>` — mesma assinatura de hoje.
- Consumes: `isCancellationPenalized` (já existia); opera sobre `organizerUid`/`participantUids`/`pendingSlotUids` em vez do par fixo.

- [ ] **Step 1: Escrever os testes que falham**

Substituir o describe `cancelFriendlyMatchCore` por:

```ts
describe("cancelFriendlyMatchCore", () => {
  const now = Date.UTC(2026, 6, 10, 12, 0, 0);

  it("organizador cancela jogo em filling → cancelled sem penalidade, avisa quem já tinha vaga", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b", "c"]);
    await acceptFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now);
    const result = await cancelFriendlyMatchCore(db(fake), "a", {matchId}, now);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "cancelled");
    assert.equal(data.cancelPenalized, false);
    assert.deepEqual(result.notifications.map((n) => n.userId).sort(), ["b", "c"]);
  });

  it("convidado não cancela enquanto filling (ele recusa a própria vaga)", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    await assertHttpsError(
      cancelFriendlyMatchCore(db(fake), "b", {matchId}, now),
      "permission-denied",
    );
  });

  it("qualquer participante cancela jogo confirmado; com antecedência não penaliza", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]); // jogo em now+48h
    await acceptFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now);
    await cancelFriendlyMatchCore(db(fake), "b", {matchId}, now + HOUR_MS);
    const data = matchData(fake, matchId);
    assert.equal(data.status, "cancelled");
    assert.equal(data.cancelPenalized, false);
    assert.equal(data.cancelledByUid, "b");
  });

  it("cancelar a menos de 6h do jogo confirmado marca cancelPenalized e penaliza a reputação", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]); // jogo em now+48h
    await acceptFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now);
    await cancelFriendlyMatchCore(db(fake), "a", {matchId}, now + 44 * HOUR_MS);
    const data = matchData(fake, matchId);
    assert.equal(data.cancelPenalized, true);
    assert.equal(data.cancelledByUid, "a");
    assert.ok(fake.store.get(`users/a/reputationEvents/late_cancel_${matchId}`));
    assert.equal(fake.store.get("users/a/reputation/summary")!.lateCancellations, 1);
    assert.equal(fake.store.get("users/b/reputation/summary"), undefined);
  });

  it("não cancela jogo já encerrado", async () => {
    const fake = new FakeFirestore();
    const matchId = await sendInvite(fake, now, ["b"]);
    await declineFriendlyMatchInviteSlotCore(db(fake), "b", {matchId}, now);
    // ainda em filling (vaga só ficou declined) — cancelar continua válido aqui;
    // simular "já encerrado" via cancelamento direto e nova tentativa:
    await cancelFriendlyMatchCore(db(fake), "a", {matchId}, now);
    await assertHttpsError(
      cancelFriendlyMatchCore(db(fake), "a", {matchId}, now),
      "failed-precondition",
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="cancelFriendlyMatchCore"` — Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
export async function cancelFriendlyMatchCore(
  db: Firestore,
  uid: string,
  input: {matchId: string},
  nowMs: number = Date.now(),
): Promise<FriendlyMatchActionResult> {
  const ref = matchRef(db, input.matchId);
  const config = await loadFriendlyMatchConfig(db);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Jogo não encontrado.");
    const data = snap.data() as MatchData;
    const status = data.status as string;

    let penalized = false;
    if (status === "filling") {
      if (data.organizerUid !== uid) {
        throw new HttpsError(
          "permission-denied",
          "Só o organizador pode cancelar enquanto o jogo está sendo montado.");
      }
    } else if (status === "confirmed") {
      if (!(data.participantUids as string[]).includes(uid)) {
        throw new HttpsError("permission-denied", "Você não participa deste jogo.");
      }
      penalized = isCancellationPenalized(
        (data.scheduledAt as Timestamp).toMillis(), nowMs, config);
    } else {
      throw new HttpsError("failed-precondition", "Este jogo não pode mais ser cancelado.");
    }

    tx.set(ref, {
      status: "cancelled",
      statusUpdatedAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      cancelledByUid: uid,
      cancelledAt: Timestamp.fromMillis(nowMs),
      cancelPenalized: penalized,
      history: appendHistory(data, historyEntry("cancelled", uid, nowMs)),
    }, {merge: true});

    const nameOf = (p: string): string =>
      p === data.organizerUid ?
        (data.organizerName as string) :
        ((data.slots as MatchData[]).find((s) => s.uid === p)?.name as string ?? "Atleta");
    const stakeholders = new Set<string>([
      ...(data.participantUids as string[]),
      ...(data.pendingSlotUids as string[] ?? []),
    ]);
    stakeholders.delete(uid);
    const cancellerName = nameOf(uid);
    const wasConfirmed = status === "confirmed";
    return {
      penalized,
      notifications: [...stakeholders].map((target) => notificationFor(
        data, ref.id, target, "friendly_match_cancelled",
        wasConfirmed ? "Jogo cancelado 😕" : "Convite retirado",
        wasConfirmed ?
          `${cancellerName} desmarcou o jogo. Bora achar outro?` :
          `${cancellerName} retirou o convite.`)),
    };
  });

  if (result.penalized) {
    await applyReputationEvent(
      db, uid, lateCancelEventId(ref.id), "late_cancel", {matchId: ref.id});
  }
  return {matchId: ref.id, notifications: result.notifications};
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS. Em seguida rodar a suíte inteira do arquivo: `cd functions && npm test -- --test-name-pattern="friendly-match-invite"` (ou o arquivo direto) — todas as describes das Tasks 3–8 devem passar juntas agora.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-invite.ts functions/src/friendly-match-invite.test.ts
git commit -m "feat(friendly-match): cancel operates over organizerUid/participantUids"
```

### Task 9: `friendly-match-invite.ts` — wrappers `onCall` e exports em `index.ts`

**Files:**
- Modify: `functions/src/friendly-match-invite.ts:630-675` (bloco de wrappers no fim do arquivo)
- Modify: `functions/src/index.ts:252-258`

**Interfaces:**
- Produces: `export const sendFriendlyMatchInvite`, `acceptFriendlyMatchInviteSlot`, `declineFriendlyMatchInviteSlot`, `counterFriendlyMatchInvite`, `fillFriendlyMatchSlot`, `cancelFriendlyMatch` (todos `onCall`).
- Consumes: todas as `*Core` das Tasks 3–8.

Este task não tem teste próprio (os wrappers só autenticam e delegam — o comportamento já está coberto pelas `*Core`), mas fecha o arquivo pra ficar chamável pelo app/QA script.

- [ ] **Step 1: Reescrever o bloco de wrappers**

Em `functions/src/friendly-match-invite.ts`, substituir o bloco final (da linha `export const sendFriendlyMatchInvite = onCall(...)` até o fim) por:

```ts
export const sendFriendlyMatchInvite = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const result = await sendFriendlyMatchInviteCore(
    getFirestore(), uid, request.data as SendFriendlyMatchInput);
  await deliverAll(result.notifications);
  return {matchId: result.matchId};
});

export const acceptFriendlyMatchInviteSlot = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = request.data as {matchId: string; chosenTimeMs?: number};
  const result = await acceptFriendlyMatchInviteSlotCore(getFirestore(), uid, data);
  await deliverAll(result.notifications);
  return {matchId: result.matchId};
});

export const declineFriendlyMatchInviteSlot = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = request.data as {matchId: string; reason?: string};
  const result = await declineFriendlyMatchInviteSlotCore(getFirestore(), uid, data);
  await deliverAll(result.notifications);
  return {matchId: result.matchId};
});

export const counterFriendlyMatchInvite = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = request.data as {
    matchId: string;
    scheduledAtMs: number;
    alternativeTimesMs?: number[];
    location?: FriendlyMatchLocation;
    message?: string;
  };
  const result = await counterFriendlyMatchInviteCore(getFirestore(), uid, data);
  await deliverAll(result.notifications);
  return {matchId: result.matchId};
});

export const fillFriendlyMatchSlot = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = request.data as {matchId: string; slotIndex: number; toUid: string};
  const result = await fillFriendlyMatchSlotCore(getFirestore(), uid, data);
  await deliverAll(result.notifications);
  return {matchId: result.matchId};
});

export const cancelFriendlyMatch = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const data = request.data as {matchId: string};
  const result = await cancelFriendlyMatchCore(getFirestore(), uid, data);
  await deliverAll(result.notifications);
  return {matchId: result.matchId};
});
```

`requireAuth` e `deliverAll` (e `deliverFriendlyMatchNotifications`) continuam exatamente como estão hoje — não precisam mudar.

- [ ] **Step 2: Atualizar `index.ts`**

Em `functions/src/index.ts:252-258`, trocar:

```ts
export {
  sendFriendlyMatchInvite,
  acceptFriendlyMatchInvite,
  declineFriendlyMatchInvite,
  counterFriendlyMatchInvite,
  cancelFriendlyMatch,
} from "./friendly-match-invite";
```

por:

```ts
export {
  sendFriendlyMatchInvite,
  acceptFriendlyMatchInviteSlot,
  declineFriendlyMatchInviteSlot,
  counterFriendlyMatchInvite,
  fillFriendlyMatchSlot,
  cancelFriendlyMatch,
} from "./friendly-match-invite";
```

- [ ] **Step 3: Compilar e rodar a suíte inteira**

Run: `cd functions && npx tsc --noEmit && npm test` — Expected: compila sem erro; describes de `friendly-match-invite.test.ts` (Tasks 3–8) todos PASS. Describes de checkin/review/sweepers ainda falham (Tasks 10–16 os corrigem) — esperado nesta altura.

- [ ] **Step 4: Commit**

```bash
git add functions/src/friendly-match-invite.ts functions/src/index.ts
git commit -m "feat(friendly-match): wire up onCall wrappers for the multi-slot invite flow"
```

### Task 10: `friendly-match-sweepers.ts` — expiração por vaga (`expireFriendlyMatchSlotIfDue`)

**Files:**
- Modify: `functions/src/friendly-match-sweepers.ts` (substitui `expireFriendlyMatchIfDue` e o wrapper `expireFriendlyMatches`)
- Test: `functions/src/friendly-match-sweepers.test.ts` (describe `expireFriendlyMatchIfDue` → `expireFriendlyMatchSlotIfDue`)

**Interfaces:**
- Produces: `export async function expireFriendlyMatchSlotIfDue(db, matchId, slotIndex, nowMs?): Promise<{expired: boolean; notifications: FriendlyMatchNotification[]}>`; `export const expireFriendlyMatchSlots` (onSchedule).
- Consumes: `isInviteExpired` (já existia); `pendingUidsOf`/`nextSlotExpiresAtOf` — **duplicar localmente neste arquivo** (mesmo padrão de `historyEntry`/`appendHistory`, que já é duplicado por arquivo em vez de importado de `friendly-match-invite.ts`).

- [ ] **Step 1: Escrever os testes que falham**

Substituir o describe `expireFriendlyMatchIfDue` (e o `seedMatch` do topo do arquivo) por:

```ts
function seedFilling(fake: FakeFirestore, id: string, slots: DocData[], overrides: DocData = {}): void {
  fake.seedDoc(`friendlyMatches/${id}`, {
    organizerUid: "a",
    organizerName: "Ana",
    slotsTotal: slots.length,
    slots,
    participantUids: ["a"],
    pendingSlotUids: slots.filter((s) => s.status === "invited" || s.status === "countered").map((s) => s.uid),
    status: "filling",
    scheduledAt: Timestamp.fromMillis(now + 48 * HOUR_MS),
    history: [{status: "filling", actorUid: "a", at: Timestamp.fromMillis(now - 24 * HOUR_MS)}],
    ...overrides,
  });
}

function slot(uid: string, name: string, expiresAt: number, status = "invited"): DocData {
  return {uid, name, photoUrl: null, status, invitedAt: Timestamp.fromMillis(now - 24 * HOUR_MS),
    respondedAt: null, expiresAt: Timestamp.fromMillis(expiresAt)};
}

describe("expireFriendlyMatchSlotIfDue", () => {
  it("vaga invited vencida → expired, história registrada, notifica o organizador", async () => {
    const fake = new FakeFirestore();
    seedFilling(fake, "m1", [slot("b", "Bia", now - 1)]);
    const result = await expireFriendlyMatchSlotIfDue(db(fake), "m1", 0, now);
    assert.equal(result.expired, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    const slots = data.slots as Array<{status: string}>;
    assert.equal(slots[0].status, "expired");
    assert.deepEqual(data.pendingSlotUids, []);
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].userId, "a");
    assert.equal(result.notifications[0].type, "friendly_match_slot_expired");
  });

  it("não expira jogo que já saiu de filling; é idempotente", async () => {
    const fake = new FakeFirestore();
    seedFilling(fake, "m1", [slot("b", "Bia", now - 1)], {status: "confirmed"});
    const result = await expireFriendlyMatchSlotIfDue(db(fake), "m1", 0, now);
    assert.equal(result.expired, false);

    seedFilling(fake, "m2", [slot("b", "Bia", now - 1)]);
    await expireFriendlyMatchSlotIfDue(db(fake), "m2", 0, now);
    const again = await expireFriendlyMatchSlotIfDue(db(fake), "m2", 0, now);
    assert.equal(again.expired, false);
    assert.equal(again.notifications.length, 0);
  });

  it("não expira vaga ainda dentro do prazo", async () => {
    const fake = new FakeFirestore();
    seedFilling(fake, "m1", [slot("b", "Bia", now + HOUR_MS)]);
    const result = await expireFriendlyMatchSlotIfDue(db(fake), "m1", 0, now);
    assert.equal(result.expired, false);
    assert.equal((fake.store.get("friendlyMatches/m1")!.slots as Array<{status: string}>)[0].status, "invited");
  });

  it("com múltiplas vagas, só expira a vencida e mantém as outras intactas", async () => {
    const fake = new FakeFirestore();
    seedFilling(fake, "m1", [slot("b", "Bia", now - 1), slot("c", "Caio", now + HOUR_MS)]);
    await expireFriendlyMatchSlotIfDue(db(fake), "m1", 0, now);
    const data = fake.store.get("friendlyMatches/m1")!;
    const slots = data.slots as Array<{uid: string; status: string}>;
    assert.equal(slots[0].status, "expired");
    assert.equal(slots[1].status, "invited");
    assert.deepEqual(data.pendingSlotUids, ["c"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="expireFriendlyMatchSlotIfDue"` — Expected: FAIL.

- [ ] **Step 3: Implementar**

Em `functions/src/friendly-match-sweepers.ts`, adicionar (mantendo `historyEntry`/`appendHistory` locais já existentes):

```ts
const PENDING_SLOT_STATUSES = ["invited", "countered"] as const;

function pendingUidsOf(slots: MatchData[]): string[] {
  return slots
    .filter((s) => PENDING_SLOT_STATUSES.includes(s.status as typeof PENDING_SLOT_STATUSES[number]))
    .map((s) => s.uid as string);
}

function nextSlotExpiresAtOf(slots: MatchData[]): Timestamp | null {
  let min: Timestamp | null = null;
  for (const s of slots) {
    if (!PENDING_SLOT_STATUSES.includes(s.status as typeof PENDING_SLOT_STATUSES[number])) continue;
    const at = s.expiresAt as Timestamp;
    if (min == null || at.toMillis() < min.toMillis()) min = at;
  }
  return min;
}

export async function expireFriendlyMatchSlotIfDue(
  db: Firestore,
  matchId: string,
  slotIndex: number,
  nowMs: number = Date.now(),
): Promise<{expired: boolean; notifications: FriendlyMatchNotification[]}> {
  const ref = db.collection(MATCHES_COLLECTION).doc(matchId);

  type Outcome = {data: MatchData; slotName: string} | null;
  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as MatchData;
    if (data.status !== "filling") return null;
    const slots = (data.slots as MatchData[]).slice();
    const slotData = slots[slotIndex];
    if (slotData == null || !PENDING_SLOT_STATUSES.includes(
      slotData.status as typeof PENDING_SLOT_STATUSES[number])) return null;
    const expiresAt = slotData.expiresAt as Timestamp | undefined;
    if (expiresAt == null || !isInviteExpired(expiresAt.toMillis(), nowMs)) return null;
    slots[slotIndex] = {...slotData, status: "expired"};
    tx.set(ref, {
      slots,
      pendingSlotUids: pendingUidsOf(slots),
      nextSlotExpiresAt: nextSlotExpiresAtOf(slots),
      updatedAt: Timestamp.fromMillis(nowMs),
      history: appendHistory(data, historyEntry("slot_expired", "system", nowMs)),
    }, {merge: true});
    return {data, slotName: slotData.name as string};
  });

  if (outcome == null) return {expired: false, notifications: []};
  return {
    expired: true,
    notifications: [{
      userId: outcome.data.organizerUid as string,
      title: "Convite vencido",
      body: `${outcome.slotName} não respondeu a tempo. Bora escolher outra pessoa pra vaga?`,
      type: "friendly_match_slot_expired",
      data: {type: "friendly_match_slot_expired", matchId},
    }],
  };
}

export const expireFriendlyMatchSlots = onSchedule(
  {schedule: "every 5 minutes", timeZone: TIME_ZONE},
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    const snap = await db
      .collection(MATCHES_COLLECTION)
      .where("status", "==", "filling")
      .where("nextSlotExpiresAt", "<=", now)
      .limit(SWEEP_LIMIT)
      .get();
    for (const doc of snap.docs) {
      const slots = (doc.data().slots ?? []) as MatchData[];
      for (let i = 0; i < slots.length; i++) {
        try {
          const result = await expireFriendlyMatchSlotIfDue(db, doc.id, i, now.toMillis());
          await deliverFriendlyMatchNotifications(result.notifications);
        } catch (error) {
          logger.error("expireFriendlyMatchSlots: falha ao expirar vaga", {
            matchId: doc.id, slotIndex: i, error,
          });
        }
      }
    }
  },
);
```

Remover a função antiga `expireFriendlyMatchIfDue` e o wrapper antigo `expireFriendlyMatches` (substituídos pelos acima).

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-sweepers.ts functions/src/friendly-match-sweepers.test.ts
git commit -m "feat(friendly-match): expire invites per slot instead of per match"
```

### Task 11: `friendly-match-sweepers.ts` — jogo que não fechou a tempo (`unfillFriendlyMatchIfDue`, novo)

**Files:**
- Modify: `functions/src/friendly-match-sweepers.ts` (função nova + wrapper novo)
- Test: `functions/src/friendly-match-sweepers.test.ts` (describe novo)

**Interfaces:**
- Produces: `export async function unfillFriendlyMatchIfDue(db, matchId, nowMs?): Promise<{unfilled: boolean; notifications: FriendlyMatchNotification[]}>`; `export const unfillFriendlyMatches` (onSchedule).
- Consumes: nada novo além do que já está no arquivo após a Task 10.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final do arquivo:

```ts
describe("unfillFriendlyMatchIfDue", () => {
  it("scheduledAt passou com jogo ainda em filling → unfilled, avisa organizador e quem já tinha vaga", async () => {
    const fake = new FakeFirestore();
    seedFilling(fake, "m1",
      [slot("b", "Bia", now + HOUR_MS, "accepted"), slot("c", "Caio", now + HOUR_MS)],
      {scheduledAt: Timestamp.fromMillis(now - 1), participantUids: ["a", "b"]});
    const result = await unfillFriendlyMatchIfDue(db(fake), "m1", now);
    assert.equal(result.unfilled, true);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "unfilled");
    assert.deepEqual(result.notifications.map((n) => n.userId).sort(), ["a", "b"]);
  });

  it("não fecha antes da hora nem jogo que já saiu de filling; é idempotente", async () => {
    const fake = new FakeFirestore();
    seedFilling(fake, "m1", [slot("b", "Bia", now + HOUR_MS)],
      {scheduledAt: Timestamp.fromMillis(now + HOUR_MS)});
    const early = await unfillFriendlyMatchIfDue(db(fake), "m1", now);
    assert.equal(early.unfilled, false);

    seedFilling(fake, "m2", [slot("b", "Bia", now + HOUR_MS)],
      {status: "confirmed", scheduledAt: Timestamp.fromMillis(now - 1)});
    const confirmed = await unfillFriendlyMatchIfDue(db(fake), "m2", now);
    assert.equal(confirmed.unfilled, false);

    seedFilling(fake, "m3", [slot("b", "Bia", now + HOUR_MS)],
      {scheduledAt: Timestamp.fromMillis(now - 1)});
    await unfillFriendlyMatchIfDue(db(fake), "m3", now);
    const again = await unfillFriendlyMatchIfDue(db(fake), "m3", now);
    assert.equal(again.unfilled, false);
    assert.equal(again.notifications.length, 0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="unfillFriendlyMatchIfDue"` — Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
export async function unfillFriendlyMatchIfDue(
  db: Firestore,
  matchId: string,
  nowMs: number = Date.now(),
): Promise<{unfilled: boolean; notifications: FriendlyMatchNotification[]}> {
  const ref = db.collection(MATCHES_COLLECTION).doc(matchId);
  const outcome = await db.runTransaction<MatchData | null>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as MatchData;
    if (data.status !== "filling") return null;
    const scheduledAt = data.scheduledAt as Timestamp;
    if (scheduledAt.toMillis() > nowMs) return null;
    tx.set(ref, {
      status: "unfilled",
      statusUpdatedAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      history: appendHistory(data, historyEntry("unfilled", "system", nowMs)),
    }, {merge: true});
    return data;
  });

  if (outcome == null) return {unfilled: false, notifications: []};
  const stakeholders = new Set<string>([
    outcome.organizerUid as string,
    ...(outcome.participantUids as string[]),
  ]);
  return {
    unfilled: true,
    notifications: [...stakeholders].map((userId) => ({
      userId,
      title: "Jogo não fechou a tempo 😕",
      body: "Não deu pra completar o time antes do horário marcado.",
      type: "friendly_match_unfilled",
      data: {type: "friendly_match_unfilled", matchId},
    })),
  };
}

export const unfillFriendlyMatches = onSchedule(
  {schedule: "every 5 minutes", timeZone: TIME_ZONE},
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    const snap = await db
      .collection(MATCHES_COLLECTION)
      .where("status", "==", "filling")
      .where("scheduledAt", "<=", now)
      .limit(SWEEP_LIMIT)
      .get();
    for (const doc of snap.docs) {
      try {
        const result = await unfillFriendlyMatchIfDue(db, doc.id, now.toMillis());
        await deliverFriendlyMatchNotifications(result.notifications);
      } catch (error) {
        logger.error("unfillFriendlyMatches: falha ao encerrar", {matchId: doc.id, error});
      }
    }
  },
);
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-sweepers.ts functions/src/friendly-match-sweepers.test.ts
git commit -m "feat(friendly-match): close matches that never filled their slots in time"
```

### Task 12: `friendly-match-sweepers.ts` — lembretes para `participantUids`

**Files:**
- Modify: `functions/src/friendly-match-sweepers.ts` (`sendFriendlyMatchReminderIfDue`)
- Test: `functions/src/friendly-match-sweepers.test.ts` (describe `sendFriendlyMatchReminderIfDue`)
- Modify: `functions/src/index.ts` (bloco de export de `friendly-match-sweepers` — ver correção abaixo)

**Interfaces:**
- Produces: mesma assinatura de hoje — `export async function sendFriendlyMatchReminderIfDue(db, matchId, kind, nowMs?)`.
- Consumes: `slot` (helper de teste, Task 10).

**Correção (gap descoberto na execução — nenhuma task do plano original atualizava isto):** `functions/src/index.ts` ainda exporta `expireFriendlyMatches` (renomeado pra `expireFriendlyMatchSlots` na Task 10) e nunca ganhou o `unfillFriendlyMatches` novo (Task 11) — sem isso o build do projeto quebra e as duas novas scheduled functions nunca são deployadas. Como esta é a última task que mexe em `friendly-match-sweepers.ts`, ela é quem fecha essa lacuna (ver Step 5 abaixo).

**Correção (descoberta na execução):** a Task 10 manteve o `seedMatch` antigo (schema velho) porque este describe ainda o usava — remova `seedMatch` nesta task, já que o describe abaixo (reescrito com `seedConfirmed` local em cima do schema novo) é o último uso dele. Confirme com grep antes de remover.

- [ ] **Step 1: Escrever os testes que falham**

Substituir o describe `sendFriendlyMatchReminderIfDue` (e seu `seedConfirmed` local) por:

```ts
describe("sendFriendlyMatchReminderIfDue", () => {
  function seedConfirmed(fake: FakeFirestore, id: string, participantUids: string[], overrides: DocData = {}): void {
    fake.seedDoc(`friendlyMatches/${id}`, {
      organizerUid: "a",
      organizerName: "Ana",
      slots: participantUids.filter((p) => p !== "a").map((uid) => slot(uid, `Atleta ${uid}`, now, "accepted")),
      participantUids,
      status: "confirmed",
      confirmedTime: Timestamp.fromMillis(now + 20 * HOUR_MS),
      scheduledAt: Timestamp.fromMillis(now + 20 * HOUR_MS),
      reminder24hAt: Timestamp.fromMillis(now - 60 * 1000),
      reminder2hAt: Timestamp.fromMillis(now + 18 * HOUR_MS),
      history: [],
      ...overrides,
    });
  }

  it("lembrete 24h vencido → notifica TODOS os participantes e anula o campo (lock)", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", ["a", "b", "c"]);
    const result = await sendFriendlyMatchReminderIfDue(db(fake), "m1", "24h", now);
    assert.equal(result.sent, true);
    assert.equal(result.notifications.length, 3);
    assert.deepEqual(result.notifications.map((n) => n.userId).sort(), ["a", "b", "c"]);
    assert.equal(result.notifications[0].type, "friendly_match_reminder");
    assert.equal(fake.store.get("friendlyMatches/m1")!.reminder24hAt, null);
  });

  it("segunda passada não reenvia (campo anulado)", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", ["a", "b"]);
    await sendFriendlyMatchReminderIfDue(db(fake), "m1", "24h", now);
    const again = await sendFriendlyMatchReminderIfDue(db(fake), "m1", "24h", now);
    assert.equal(again.sent, false);
    assert.equal(again.notifications.length, 0);
  });

  it("não envia antes da hora nem para jogo que deixou de estar confirmado", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "early", ["a", "b"], {reminder24hAt: Timestamp.fromMillis(now + HOUR_MS)});
    const early = await sendFriendlyMatchReminderIfDue(db(fake), "early", "24h", now);
    assert.equal(early.sent, false);

    seedConfirmed(fake, "gone", ["a", "b"], {status: "cancelled"});
    const gone = await sendFriendlyMatchReminderIfDue(db(fake), "gone", "24h", now);
    assert.equal(gone.sent, false);
  });

  it("lembrete 2h usa o campo próprio", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", ["a", "b"], {reminder2hAt: Timestamp.fromMillis(now - 1)});
    const result = await sendFriendlyMatchReminderIfDue(db(fake), "m1", "2h", now);
    assert.equal(result.sent, true);
    assert.equal(fake.store.get("friendlyMatches/m1")!.reminder2hAt, null);
    assert.ok(fake.store.get("friendlyMatches/m1")!.reminder24hAt instanceof Timestamp);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="sendFriendlyMatchReminderIfDue"` — Expected: FAIL.

- [ ] **Step 3: Implementar**

Trocar o corpo de `sendFriendlyMatchReminderIfDue` (a partir de `if (due == null) return ...`) por:

```ts
  if (due == null) return {sent: false, notifications: []};

  const title = kind === "24h" ? "Jogo amanhã! 🏐" : "Seu jogo é daqui a pouco ⏰";
  const participantUids = due.participantUids as string[];
  return {
    sent: true,
    notifications: participantUids.map((userId) => ({
      userId,
      title,
      body: kind === "24h" ?
        "Seu jogo é amanhã. Ainda está de pé?" :
        "Seu jogo está chegando. Não esquece o check-in!",
      type: "friendly_match_reminder",
      data: {type: "friendly_match_reminder", matchId, reminderKind: kind},
    })),
  };
```

(a versão anterior montava `participants: Array<[string,string]>` com `fromUid`/`toUid` e citava o nome do outro na mensagem — a versão nova notifica todos os `participantUids` com uma mensagem sem citar nomes, já que pode haver mais de um "outro"). Manter o resto da função (busca do doc, checagem de `status === "confirmed"`, checagem e anulação do campo `reminderXhAt` dentro da transação) exatamente como está.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS. Em seguida rodar o arquivo inteiro: `cd functions && npm test -- --test-name-pattern="friendly-match-sweepers"`.

- [ ] **Step 5: Atualizar `index.ts` — fechar o gap de export das 3 scheduled functions**

Em `functions/src/index.ts`, trocar:

```ts
export {
  expireFriendlyMatches,
  sendFriendlyMatchReminders,
} from "./friendly-match-sweepers";
```

por:

```ts
export {
  expireFriendlyMatchSlots,
  unfillFriendlyMatches,
  sendFriendlyMatchReminders,
} from "./friendly-match-sweepers";
```

Rodar `cd functions && npx tsc --noEmit` — Expected: limpo (0 erros) pela primeira vez desde a Task 10 (o erro de `index.ts` apontado nas Tasks 10/11 desaparece aqui).

- [ ] **Step 6: Commit**

```bash
git add functions/src/friendly-match-sweepers.ts functions/src/friendly-match-sweepers.test.ts functions/src/index.ts
git commit -m "feat(friendly-match): reminders notify every participant, not just a pair"
```

### Task 13: `friendly-match-checkin.ts` — check-in unânime entre `participantUids`

**Files:**
- Modify: `functions/src/friendly-match-checkin.ts` (`checkInFriendlyMatchCore`)
- Test: `functions/src/friendly-match-checkin.test.ts` (describe `checkInFriendlyMatchCore` e `seedConfirmed`)

**Interfaces:**
- Produces: mesma assinatura de hoje — `export async function checkInFriendlyMatchCore(db, uid, input: {matchId: string}, nowMs?)`.
- Consumes: nada novo.

- [ ] **Step 1: Escrever os testes que falham**

Trocar o `seedConfirmed` do topo do arquivo por:

```ts
function seedConfirmed(fake: FakeFirestore, id: string, participantUids: string[], overrides: DocData = {}): void {
  fake.seedDoc(`friendlyMatches/${id}`, {
    organizerUid: "a",
    organizerName: "Ana",
    slots: participantUids.filter((p) => p !== "a").map((uid) => ({
      uid, name: `Atleta ${uid}`, photoUrl: null, status: "accepted",
      invitedAt: Timestamp.fromMillis(now - HOUR_MS), respondedAt: Timestamp.fromMillis(now - HOUR_MS),
      expiresAt: Timestamp.fromMillis(now + HOUR_MS),
    })),
    participantUids,
    status: "confirmed",
    scheduledAt: Timestamp.fromMillis(gameTime),
    confirmedTime: Timestamp.fromMillis(gameTime),
    checkInOpenAt: Timestamp.fromMillis(gameTime - 30 * 60 * 1000),
    checkInCloseAt: Timestamp.fromMillis(gameTime + 24 * HOUR_MS),
    history: [],
    ...overrides,
  });
}
```

E o describe `checkInFriendlyMatchCore` por:

```ts
describe("checkInFriendlyMatchCore", () => {
  it("primeiro check-in registra presença e cutuca os demais participantes", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", ["a", "b", "c"]);
    const result = await checkInFriendlyMatchCore(db(fake), "a", {matchId: "m1"}, now);
    assert.equal(result.completed, false);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "confirmed");
    assert.ok((data.checkIns as Record<string, Timestamp>).a instanceof Timestamp);
    assert.equal(result.notifications.length, 2);
    assert.deepEqual(result.notifications.map((n) => n.userId).sort(), ["b", "c"]);
    assert.ok(result.notifications.every((n) => n.type === "friendly_match_checkin_nudge"));
  });

  it("último check-in (todos presentes) completa o jogo, agenda reveal e credita reputação de todos", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", ["a", "b"]);
    await checkInFriendlyMatchCore(db(fake), "a", {matchId: "m1"}, now);
    const result = await checkInFriendlyMatchCore(db(fake), "b", {matchId: "m1"}, now + 60000);
    assert.equal(result.completed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "completed");
    assert.ok(data.completedAt instanceof Timestamp);
    assert.equal((data.reviewRevealAt as Timestamp).toMillis(), now + 60000 + 72 * HOUR_MS);
    assert.equal(result.notifications.length, 2);
    assert.ok(result.notifications.every((n) => n.type === "friendly_match_completed"));
    assert.ok(fake.store.get("users/a/reputationEvents/match_completed_m1"));
    assert.ok(fake.store.get("users/b/reputationEvents/match_completed_m1"));
    assert.equal(fake.store.get("users/a/reputation/summary")!.gamesCompleted, 1);
  });

  it("com 3 participantes, precisa dos TRÊS check-ins pra completar", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", ["a", "b", "c"]);
    await checkInFriendlyMatchCore(db(fake), "a", {matchId: "m1"}, now);
    const mid = await checkInFriendlyMatchCore(db(fake), "b", {matchId: "m1"}, now);
    assert.equal(mid.completed, false);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "confirmed");
    const last = await checkInFriendlyMatchCore(db(fake), "c", {matchId: "m1"}, now);
    assert.equal(last.completed, true);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "completed");
  });

  it("check-in repetido do mesmo atleta é no-op silencioso", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", ["a", "b"]);
    await checkInFriendlyMatchCore(db(fake), "a", {matchId: "m1"}, now);
    const again = await checkInFriendlyMatchCore(db(fake), "a", {matchId: "m1"}, now);
    assert.equal(again.completed, false);
    assert.equal(again.notifications.length, 0);
  });

  it("rejeita fora da janela, não participante e status errado", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "early", ["a", "b"], {checkInOpenAt: Timestamp.fromMillis(now + HOUR_MS)});
    await assertHttpsError(
      checkInFriendlyMatchCore(db(fake), "a", {matchId: "early"}, now), "failed-precondition");
    seedConfirmed(fake, "late", ["a", "b"], {checkInCloseAt: Timestamp.fromMillis(now - 1)});
    await assertHttpsError(
      checkInFriendlyMatchCore(db(fake), "a", {matchId: "late"}, now), "failed-precondition");
    seedConfirmed(fake, "m1", ["a", "b"]);
    await assertHttpsError(
      checkInFriendlyMatchCore(db(fake), "intruso", {matchId: "m1"}, now), "permission-denied");
    seedConfirmed(fake, "pending", ["a", "b"], {status: "filling"});
    await assertHttpsError(
      checkInFriendlyMatchCore(db(fake), "a", {matchId: "pending"}, now), "failed-precondition");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="checkInFriendlyMatchCore"` — Expected: FAIL.

- [ ] **Step 3: Implementar**

Trocar as linhas de checagem de participante/nome em `checkInFriendlyMatchCore`:

```ts
    if (data.fromUid !== uid && data.toUid !== uid) {
      throw new HttpsError("permission-denied", "Você não participa deste jogo.");
    }
```

por:

```ts
    const participantUids = data.participantUids as string[];
    if (!participantUids.includes(uid)) {
      throw new HttpsError("permission-denied", "Você não participa deste jogo.");
    }
```

E a checagem de "os dois presentes" por unanimidade:

```ts
    const otherUid = uid === data.fromUid ? (data.toUid as string) : (data.fromUid as string);
    const bothPresent = checkIns[otherUid] != null;

    if (bothPresent) {
```

por:

```ts
    const allPresent = participantUids.every((p) => checkIns[p] != null);

    if (allPresent) {
```

E depois da transação, trocar o bloco final (a partir de `const data = outcome.data;`) por:

```ts
  const data = outcome.data;
  const participantUids = data.participantUids as string[];
  const nameOf = (p: string): string =>
    p === data.organizerUid ?
      (data.organizerName as string) :
      ((data.slots as MatchData[]).find((s) => s.uid === p)?.name as string ?? "Atleta");
  const myName = nameOf(uid);

  if (outcome.kind === "completed") {
    for (const p of participantUids) {
      await applyReputationEvent(db, p, matchCompletedEventId(matchId), "match_completed", {matchId});
    }
    return {
      completed: true,
      notifications: participantUids.map((p) => notification(
        p, "friendly_match_completed", matchId,
        "Jogo confirmado! 🙌", "Como foi jogar? Avalie a galera agora.")),
    };
  }

  const others = participantUids.filter((p) => p !== uid);
  return {
    completed: false,
    notifications: others.map((p) => notification(
      p, "friendly_match_checkin_nudge", matchId,
      "Check-in feito ✔", `${myName} confirmou presença. Faça seu check-in também!`)),
  };
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-checkin.ts functions/src/friendly-match-checkin.test.ts
git commit -m "feat(friendly-match): check-in requires all participants, not just a pair"
```

### Task 14: `friendly-match-checkin.ts` — no-show penaliza ausentes quando ≥1 apareceu

**Files:**
- Modify: `functions/src/friendly-match-checkin.ts` (`closeFriendlyMatchCheckInIfDue`)
- Test: `functions/src/friendly-match-checkin.test.ts` (describe `closeFriendlyMatchCheckInIfDue`)

**Interfaces:**
- Produces: mesma assinatura de hoje.
- Consumes: `seedConfirmedMulti` (helper de teste, Task 13 — a Task 13 não sobrescreveu o `seedConfirmed` antigo porque este describe ainda o usava; criou `seedConfirmedMulti` em paralelo. Nesta task, ao reescrever este describe pro schema novo, pode usar `seedConfirmedMulti` no lugar do `seedConfirmed` antigo e então remover o `seedConfirmed` antigo, já órfão — confirme via grep antes).

- [ ] **Step 1: Escrever os testes que falham**

Substituir o describe `closeFriendlyMatchCheckInIfDue` por:

```ts
describe("closeFriendlyMatchCheckInIfDue", () => {
  const afterClose = gameTime + 25 * HOUR_MS;

  it("com 1 presente de 2, penaliza só o ausente", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", ["a", "b"], {checkIns: {a: Timestamp.fromMillis(gameTime)}});
    const result = await closeFriendlyMatchCheckInIfDue(db(fake), "m1", afterClose);
    assert.equal(result.closed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "no_show");
    assert.deepEqual(data.noShowUids, ["b"]);
    assert.ok(fake.store.get("users/b/reputationEvents/no_show_m1"));
    assert.equal(fake.store.get("users/b/reputation/summary")!.noShows, 1);
    assert.equal(fake.store.get("users/a/reputation/summary"), undefined);
  });

  it("com 1 presente de 3, penaliza os DOIS ausentes (≥1 apareceu)", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", ["a", "b", "c"], {checkIns: {a: Timestamp.fromMillis(gameTime)}});
    const result = await closeFriendlyMatchCheckInIfDue(db(fake), "m1", afterClose);
    assert.equal(result.closed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.deepEqual((data.noShowUids as string[]).sort(), ["b", "c"]);
    assert.ok(fake.store.get("users/b/reputationEvents/no_show_m1"));
    assert.ok(fake.store.get("users/c/reputationEvents/no_show_m1"));
    assert.equal(fake.store.get("users/a/reputation/summary"), undefined);
  });

  it("zero check-ins → no_show sem penalidade para ninguém", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", ["a", "b", "c"]);
    const result = await closeFriendlyMatchCheckInIfDue(db(fake), "m1", afterClose);
    assert.equal(result.closed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "no_show");
    assert.deepEqual(data.noShowUids, []);
    assert.equal(fake.store.get("users/a/reputation/summary"), undefined);
    assert.equal(fake.store.get("users/b/reputation/summary"), undefined);
    assert.equal(fake.store.get("users/c/reputation/summary"), undefined);
  });

  it("não fecha antes da hora nem jogo que já saiu de confirmed; idempotente", async () => {
    const fake = new FakeFirestore();
    seedConfirmed(fake, "m1", ["a", "b"]);
    const early = await closeFriendlyMatchCheckInIfDue(db(fake), "m1", gameTime);
    assert.equal(early.closed, false);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "confirmed");

    seedConfirmed(fake, "done", ["a", "b"], {status: "completed"});
    const done = await closeFriendlyMatchCheckInIfDue(db(fake), "done", afterClose);
    assert.equal(done.closed, false);

    seedConfirmed(fake, "m2", ["a", "b"]);
    await closeFriendlyMatchCheckInIfDue(db(fake), "m2", afterClose);
    const again = await closeFriendlyMatchCheckInIfDue(db(fake), "m2", afterClose);
    assert.equal(again.closed, false);
    assert.equal(again.notifications.length, 0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="closeFriendlyMatchCheckInIfDue"` — Expected: FAIL.

- [ ] **Step 3: Implementar**

Trocar o corpo de `closeFriendlyMatchCheckInIfDue`:

```ts
export async function closeFriendlyMatchCheckInIfDue(
  db: Firestore,
  matchId: string,
  nowMs: number = Date.now(),
): Promise<{closed: boolean; notifications: FriendlyMatchNotification[]}> {
  const ref = db.collection(MATCHES_COLLECTION).doc(matchId);

  type Outcome = {data: MatchData; penalizedUids: string[]; presentCount: number} | null;

  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as MatchData;
    if (data.status !== "confirmed") return null;
    const closeAt = data.checkInCloseAt as Timestamp | undefined;
    if (closeAt == null || closeAt.toMillis() > nowMs) return null;

    const checkIns = (data.checkIns ?? {}) as Record<string, unknown>;
    const participantUids = data.participantUids as string[];
    const presentUids = participantUids.filter((p) => checkIns[p] != null);
    const absentUids = participantUids.filter((p) => checkIns[p] == null);
    if (absentUids.length === 0) return null; // completed já teria cuidado disso
    const penalizedUids = presentUids.length > 0 ? absentUids : [];

    tx.set(ref, {
      status: "no_show",
      statusUpdatedAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      noShowUids: penalizedUids,
      history: appendHistory(data, historyEntry("no_show", "system", nowMs)),
    }, {merge: true});
    return {data, penalizedUids, presentCount: presentUids.length};
  });

  if (outcome == null) return {closed: false, notifications: []};
  const {data, penalizedUids, presentCount} = outcome;
  const participantUids = data.participantUids as string[];
  const nameOf = (p: string): string =>
    p === data.organizerUid ?
      (data.organizerName as string) :
      ((data.slots as MatchData[]).find((s) => s.uid === p)?.name as string ?? "Atleta");

  for (const p of penalizedUids) {
    await applyReputationEvent(db, p, noShowEventId(matchId), "no_show", {matchId});
  }

  if (presentCount === 0) {
    return {
      closed: true,
      notifications: participantUids.map((p) => notification(
        p, "friendly_match_no_show", matchId,
        "Jogo não confirmado", "Nenhum check-in foi feito e o jogo foi encerrado sem avaliação.")),
    };
  }

  const penalizedSet = new Set(penalizedUids);
  const penalizedNames = penalizedUids.map(nameOf).join(", ");
  return {
    closed: true,
    notifications: participantUids.map((p) => notification(
      p, "friendly_match_no_show", matchId,
      penalizedSet.has(p) ? "Você não fez check-in" : "Sentimos muito 😕",
      penalizedSet.has(p) ?
        "O jogo foi encerrado sem a sua presença e sua reputação foi afetada." :
        `${penalizedNames} não fez check-in e o jogo foi encerrado. Bora buscar outro?`)),
  };
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS. Em seguida rodar o arquivo inteiro: `cd functions && npm test -- --test-name-pattern="friendly-match-checkin"`.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-checkin.ts functions/src/friendly-match-checkin.test.ts
git commit -m "feat(friendly-match): no-show penalizes every absentee once someone showed up"
```

### Task 15: `friendly-match-review.ts` — avaliação pairwise (`submitFriendlyMatchReviewCore`)

**Files:**
- Modify: `functions/src/friendly-match-review.ts` (assinatura e corpo de `submitFriendlyMatchReviewCore`, helpers)
- Test: `functions/src/friendly-match-review.test.ts` (describe `submitFriendlyMatchReviewCore` e `seedCompleted`)

**Interfaces:**
- Produces: `export async function submitFriendlyMatchReviewCore(db, uid, input: {matchId: string; revieweeUid: string; stars: number; tags?: string[]; comment?: string}, nowMs?): Promise<{revealed: boolean; notifications: FriendlyMatchNotification[]}>` — ganha `revieweeUid` obrigatório.
- Consumes: `reviewReceivedEventId(matchId, reviewerUid, revieweeUid)` (Task 2).

**Design note:** `privateReviews/{reviewerUid}` vira `privateReviews/{reviewerUid}_{revieweeUid}`. Campo público `reviews` vira `Record<reviewerUid, Record<revieweeUid, StoredReview>>`. Reveal acontece **por par**: assim que A e B avaliaram um o outro, essa dupla some do "aguardando" e entra em `reviews` — sem esperar o resto do grupo. O jogo só vira `status: "reviewed"` quando **todos** os pares ordenados (`participantUids.length * (participantUids.length - 1)`) tiverem sido revelados — checado inspecionando a forma do próprio mapa `reviews` (sem contador redundante).

- [ ] **Step 1: Escrever os testes que falham**

Trocar o `seedCompleted` do topo do arquivo por:

```ts
function seedCompleted(fake: FakeFirestore, id: string, participantUids: string[], overrides: DocData = {}): void {
  fake.seedDoc(`friendlyMatches/${id}`, {
    organizerUid: "a",
    organizerName: "Ana",
    slots: participantUids.filter((p) => p !== "a").map((uid) => ({
      uid, name: `Atleta ${uid}`, photoUrl: null, status: "accepted",
    })),
    participantUids,
    status: "completed",
    completedAt: Timestamp.fromMillis(now - HOUR_MS),
    reviewRevealAt: Timestamp.fromMillis(revealAt),
    history: [],
    ...overrides,
  });
}
```

E o describe `submitFriendlyMatchReviewCore` por:

```ts
describe("submitFriendlyMatchReviewCore", () => {
  it("primeira avaliação de um par fica oculta: doc privado criado, nada no doc principal", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b"]);
    const result = await submitFriendlyMatchReviewCore(
      db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 5, comment: "Jogaço"}, now);
    assert.equal(result.revealed, false);
    const hidden = fake.store.get("friendlyMatches/m1/privateReviews/a_b")!;
    assert.equal(hidden.stars, 5);
    assert.equal(hidden.revieweeUid, "b");
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "completed");
    assert.equal(data.reviews, undefined);
    assert.equal(result.notifications.length, 0);
  });

  it("segunda avaliação do mesmo par revela as duas, credita reputação cruzada; match ainda não 'reviewed' (1:1 conclui)", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b"]);
    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 5}, now);
    const result = await submitFriendlyMatchReviewCore(
      db(fake), "b", {matchId: "m1", revieweeUid: "a", stars: 3}, now + HOUR_MS);
    assert.equal(result.revealed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "reviewed"); // só 2 participantes: 1 par = grupo inteiro
    assert.ok(data.reviewsRevealedAt instanceof Timestamp);
    const reviews = data.reviews as Record<string, Record<string, {stars: number}>>;
    assert.equal(reviews.a.b.stars, 5);
    assert.equal(reviews.b.a.stars, 3);
    assert.equal(fake.store.get("users/b/reputation/summary")!.ratingSum, 5);
    assert.equal(fake.store.get("users/a/reputation/summary")!.ratingSum, 3);
    assert.ok(fake.store.get("users/b/reputationEvents/review_received_m1_a_b"));
    assert.ok(fake.store.get("users/a/reputationEvents/review_received_m1_b_a"));
    assert.equal(result.notifications.length, 2);
  });

  it("com 3 participantes: revelar um par não conclui o jogo até TODOS os pares revelarem", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b", "c"]);
    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 5}, now);
    const abRevealed = await submitFriendlyMatchReviewCore(
      db(fake), "b", {matchId: "m1", revieweeUid: "a", stars: 4}, now);
    assert.equal(abRevealed.revealed, true); // par a-b revela na hora
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "completed"); // faltam os pares com c

    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "c", stars: 4}, now);
    await submitFriendlyMatchReviewCore(db(fake), "c", {matchId: "m1", revieweeUid: "a", stars: 4}, now);
    await submitFriendlyMatchReviewCore(db(fake), "b", {matchId: "m1", revieweeUid: "c", stars: 4}, now);
    const last = await submitFriendlyMatchReviewCore(
      db(fake), "c", {matchId: "m1", revieweeUid: "b", stars: 4}, now);
    assert.equal(last.revealed, true);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "reviewed"); // todos os 6 pares ordenados feitos
  });

  it("avaliação dupla do mesmo par é rejeitada", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b"]);
    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 4}, now);
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 5}, now),
      "failed-precondition",
    );
  });

  it("rejeita não participante, avaliado inválido, status errado, stars inválidas e prazo vencido", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b"]);
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "intruso", {matchId: "m1", revieweeUid: "b", stars: 4}, now),
      "permission-denied",
    );
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "a", stars: 4}, now),
      "invalid-argument",
    );
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "ghost", stars: 4}, now),
      "invalid-argument",
    );
    for (const stars of [0, 6, 4.5]) {
      await assertHttpsError(
        submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars}, now),
        "invalid-argument",
      );
    }
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 4}, revealAt + 1),
      "failed-precondition",
    );
    seedCompleted(fake, "pending", ["a", "b"], {status: "confirmed"});
    await assertHttpsError(
      submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "pending", revieweeUid: "b", stars: 4}, now),
      "failed-precondition",
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="submitFriendlyMatchReviewCore"` — Expected: FAIL.

- [ ] **Step 3: Implementar**

Adicionar o helper de checagem de completude e reescrever `submitFriendlyMatchReviewCore`:

```ts
function allPairsRevealed(
  reviews: Record<string, Record<string, unknown>>,
  participantUids: string[],
): boolean {
  return participantUids.every((reviewer) =>
    participantUids.every((reviewee) =>
      reviewer === reviewee || reviews[reviewer]?.[reviewee] != null));
}

export async function submitFriendlyMatchReviewCore(
  db: Firestore,
  uid: string,
  input: {matchId: string; revieweeUid: string; stars: number; tags?: string[]; comment?: string},
  nowMs: number = Date.now(),
): Promise<{revealed: boolean; notifications: FriendlyMatchNotification[]}> {
  const matchId = typeof input.matchId === "string" ? input.matchId.trim() : "";
  if (!matchId) throw new HttpsError("invalid-argument", "Jogo inválido.");
  const revieweeUid = typeof input.revieweeUid === "string" ? input.revieweeUid.trim() : "";
  const review = sanitizeReviewInput(input);
  const matchRef = db.collection(MATCHES_COLLECTION).doc(matchId);

  type Outcome =
    | {kind: "waiting"}
    | {kind: "revealed"; matchId: string; reviewerUid: string; revieweeUid: string;
       reviewerReview: StoredReview; revieweeReview: StoredReview};

  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError("not-found", "Jogo não encontrado.");
    const data = matchSnap.data() as MatchData;
    const participantUids = data.participantUids as string[];
    if (!participantUids.includes(uid)) {
      throw new HttpsError("permission-denied", "Você não participa deste jogo.");
    }
    if (!revieweeUid || revieweeUid === uid || !participantUids.includes(revieweeUid)) {
      throw new HttpsError("invalid-argument", "Escolha quem você está avaliando.");
    }
    const myReviewRef = db.doc(`${MATCHES_COLLECTION}/${matchId}/privateReviews/${uid}_${revieweeUid}`);
    const otherReviewRef = db.doc(`${MATCHES_COLLECTION}/${matchId}/privateReviews/${revieweeUid}_${uid}`);
    const [mySnap, otherSnap] = [await tx.get(myReviewRef), await tx.get(otherReviewRef)];

    if (data.status !== "completed") {
      throw new HttpsError("failed-precondition", "Este jogo não está aguardando avaliação.");
    }
    const revealAt = data.reviewRevealAt as Timestamp | undefined;
    if (revealAt != null && nowMs >= revealAt.toMillis()) {
      throw new HttpsError("failed-precondition", "O prazo de avaliação deste jogo já encerrou.");
    }
    if (mySnap.exists) {
      throw new HttpsError("failed-precondition", "Você já avaliou esta pessoa.");
    }

    tx.set(myReviewRef, {
      ...review, reviewerUid: uid, revieweeUid, createdAt: Timestamp.fromMillis(nowMs),
    });

    if (!otherSnap.exists) {
      tx.set(matchRef, {updatedAt: Timestamp.fromMillis(nowMs)}, {merge: true});
      return {kind: "waiting"};
    }

    const otherStored = otherSnap.data() as StoredReview & {
      reviewerUid?: string; revieweeUid?: string; createdAt?: Timestamp;
    };
    // Reconstrói só os campos públicos — o doc privado também carrega
    // reviewerUid/revieweeUid/createdAt (linha ~2741), que NÃO devem vazar
    // pro campo público `reviews` (metadado de submissão, não da nota).
    const otherReview: StoredReview = {
      stars: otherStored.stars,
      ...(otherStored.tags ? {tags: otherStored.tags} : {}),
      ...(otherStored.comment ? {comment: otherStored.comment} : {}),
    };
    const reviews = {
      ...(data.reviews as Record<string, Record<string, StoredReview>> ?? {}),
    };
    reviews[uid] = {...(reviews[uid] ?? {}), [revieweeUid]: review};
    reviews[revieweeUid] = {...(reviews[revieweeUid] ?? {}), [uid]: otherReview};
    const done = allPairsRevealed(reviews, participantUids);
    const update: MatchData = {reviews, updatedAt: Timestamp.fromMillis(nowMs)};
    if (done) {
      update.status = "reviewed";
      update.statusUpdatedAt = Timestamp.fromMillis(nowMs);
      update.reviewsRevealedAt = Timestamp.fromMillis(nowMs);
      update.history = appendHistory(data, historyEntry("reviewed", "system", nowMs));
    }
    tx.set(matchRef, update, {merge: true});
    return {
      kind: "revealed", matchId, reviewerUid: uid, revieweeUid,
      reviewerReview: review, revieweeReview: otherReview,
    };
  });

  if (outcome.kind === "waiting") return {revealed: false, notifications: []};
  await applyReputationEvent(
    db, outcome.revieweeUid, reviewReceivedEventId(matchId, outcome.reviewerUid, outcome.revieweeUid),
    "review_received", {matchId, stars: outcome.reviewerReview.stars});
  await applyReputationEvent(
    db, outcome.reviewerUid, reviewReceivedEventId(matchId, outcome.revieweeUid, outcome.reviewerUid),
    "review_received", {matchId, stars: outcome.revieweeReview.stars});
  return {
    revealed: true,
    notifications: [
      {userId: outcome.revieweeUid, title: "Avaliação revelada ⭐",
        body: "Alguém avaliou o jogo com você. Veja como foi.",
        type: "friendly_match_reviewed", data: {type: "friendly_match_reviewed", matchId}},
      {userId: outcome.reviewerUid, title: "Avaliação revelada ⭐",
        body: "Alguém avaliou o jogo com você. Veja como foi.",
        type: "friendly_match_reviewed", data: {type: "friendly_match_reviewed", matchId}},
    ],
  };
}
```

`sanitizeReviewInput`, `historyEntry`, `appendHistory`, `MAX_COMMENT_LENGTH`, `MAX_TAGS` continuam iguais. Remover `revealUpdate`/`applyRevealEffects` antigos (específicos do par) — a Task 16 escreve o equivalente pro sweeper de prazo.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-review.ts functions/src/friendly-match-review.test.ts
git commit -m "feat(friendly-match): pairwise double-blind reviews for N participants"
```

### Task 16: `friendly-match-review.ts` — sweep de prazo revela por par (`revealFriendlyMatchReviewsIfDue`)

**Files:**
- Modify: `functions/src/friendly-match-review.ts` (`revealFriendlyMatchReviewsIfDue`)
- Test: `functions/src/friendly-match-review.test.ts` (describe `revealFriendlyMatchReviewsIfDue`)

**Interfaces:**
- Produces: mesma assinatura de hoje.
- Consumes: `allPairsRevealed` (Task 15).

**Design note:** no prazo, revela **o que existir** de cada par (mesmo sem reciprocidade — igual ao comportamento de hoje) e força `status: "reviewed"` incondicionalmente (o prazo fecha o jogo mesmo que pares fiquem sem nenhuma nota).

- [ ] **Step 1: Escrever os testes que falham**

Substituir o describe `revealFriendlyMatchReviewsIfDue` por:

```ts
describe("revealFriendlyMatchReviewsIfDue", () => {
  it("prazo vencido com avaliação unilateral → revela a que existe e credita só aquele reviewee", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b"]);
    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 4}, now);
    const result = await revealFriendlyMatchReviewsIfDue(db(fake), "m1", revealAt + 1);
    assert.equal(result.revealed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "reviewed");
    const reviews = data.reviews as Record<string, Record<string, {stars: number}>>;
    assert.equal(reviews.a.b.stars, 4);
    assert.equal(reviews.b, undefined);
    assert.ok(fake.store.get("users/b/reputationEvents/review_received_m1_a_b"));
    assert.equal(fake.store.get("users/a/reputation/summary"), undefined);
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].userId, "b");
  });

  it("com 3 participantes: revela cada par pendente que tiver ao menos uma nota, força status reviewed", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b", "c"]);
    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "b", stars: 5}, now);
    await submitFriendlyMatchReviewCore(db(fake), "b", {matchId: "m1", revieweeUid: "a", stars: 4}, now); // par a-b já revela na hora
    await submitFriendlyMatchReviewCore(db(fake), "a", {matchId: "m1", revieweeUid: "c", stars: 3}, now); // c nunca avaliou a
    const result = await revealFriendlyMatchReviewsIfDue(db(fake), "m1", revealAt + 1);
    assert.equal(result.revealed, true);
    const data = fake.store.get("friendlyMatches/m1")!;
    assert.equal(data.status, "reviewed");
    const reviews = data.reviews as Record<string, Record<string, {stars: number}>>;
    assert.equal(reviews.a.b.stars, 5); // já revelado antes do prazo
    assert.equal(reviews.a.c.stars, 3); // revelado agora no prazo
    assert.equal(reviews.c?.a, undefined); // c nunca avaliou, continua ausente
    assert.equal(reviews.b?.c, undefined);
    // só quem RECEBEU nota nova no sweep (c) é notificado/creditado por ele
    assert.ok(fake.store.get("users/c/reputationEvents/review_received_m1_a_c"));
  });

  it("prazo vencido sem avaliações → encerra sem notas nem notificações; idempotente", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b"]);
    const result = await revealFriendlyMatchReviewsIfDue(db(fake), "m1", revealAt + 1);
    assert.equal(result.revealed, true);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "reviewed");
    assert.equal(result.notifications.length, 0);
    const again = await revealFriendlyMatchReviewsIfDue(db(fake), "m1", revealAt + 2);
    assert.equal(again.revealed, false);
  });

  it("não revela antes do prazo", async () => {
    const fake = new FakeFirestore();
    seedCompleted(fake, "m1", ["a", "b"]);
    const result = await revealFriendlyMatchReviewsIfDue(db(fake), "m1", revealAt - 1);
    assert.equal(result.revealed, false);
    assert.equal(fake.store.get("friendlyMatches/m1")!.status, "completed");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd functions && npm test -- --test-name-pattern="revealFriendlyMatchReviewsIfDue"` — Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
export async function revealFriendlyMatchReviewsIfDue(
  db: Firestore,
  matchId: string,
  nowMs: number = Date.now(),
): Promise<{revealed: boolean; notifications: FriendlyMatchNotification[]}> {
  const matchRef = db.collection(MATCHES_COLLECTION).doc(matchId);

  type PairReveal = {reviewerUid: string; revieweeUid: string; review: StoredReview};
  type Outcome = {newlyRevealed: PairReveal[]} | null;

  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) return null;
    const data = matchSnap.data() as MatchData;
    if (data.status !== "completed") return null;
    const revealAt = data.reviewRevealAt as Timestamp | undefined;
    if (revealAt == null || revealAt.toMillis() > nowMs) return null;

    const participantUids = data.participantUids as string[];
    const reviews = {...(data.reviews as Record<string, Record<string, StoredReview>> ?? {})};
    const newlyRevealed: PairReveal[] = [];
    for (const reviewerUid of participantUids) {
      for (const revieweeUid of participantUids) {
        if (reviewerUid === revieweeUid) continue;
        if (reviews[reviewerUid]?.[revieweeUid] != null) continue;
        const snap = await tx.get(
          db.doc(`${MATCHES_COLLECTION}/${matchId}/privateReviews/${reviewerUid}_${revieweeUid}`));
        if (!snap.exists) continue;
        const raw = snap.data() as StoredReview & {
          reviewerUid?: string; revieweeUid?: string; createdAt?: Timestamp;
        };
        // Mesma limpeza da Task 15: o doc privado carrega reviewerUid/
        // revieweeUid/createdAt, que não devem vazar pro campo público.
        const stored: StoredReview = {
          stars: raw.stars,
          ...(raw.tags ? {tags: raw.tags} : {}),
          ...(raw.comment ? {comment: raw.comment} : {}),
        };
        reviews[reviewerUid] = {...(reviews[reviewerUid] ?? {}), [revieweeUid]: stored};
        newlyRevealed.push({reviewerUid, revieweeUid, review: stored});
      }
    }

    tx.set(matchRef, {
      status: "reviewed",
      statusUpdatedAt: Timestamp.fromMillis(nowMs),
      updatedAt: Timestamp.fromMillis(nowMs),
      reviews,
      reviewsRevealedAt: Timestamp.fromMillis(nowMs),
      history: appendHistory(data, historyEntry("reviewed", "system", nowMs)),
    }, {merge: true});
    return {newlyRevealed};
  });

  if (outcome == null) return {revealed: false, notifications: []};
  const notifications: FriendlyMatchNotification[] = [];
  for (const {reviewerUid, revieweeUid, review} of outcome.newlyRevealed) {
    await applyReputationEvent(
      db, revieweeUid, reviewReceivedEventId(matchId, reviewerUid, revieweeUid),
      "review_received", {matchId, stars: review.stars});
    notifications.push({
      userId: revieweeUid, title: "Avaliação revelada ⭐",
      body: "Alguém avaliou o jogo com você. Veja como foi.",
      type: "friendly_match_reviewed", data: {type: "friendly_match_reviewed", matchId},
    });
  }
  return {revealed: true, notifications};
}
```

Nota de implementação: todas as leituras (`tx.get` dentro dos dois `for`) acontecem antes do único `tx.set` final — respeita a exigência de transação real do Firestore (leituras antes de escritas) já documentada no cabeçalho do arquivo.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2 — Expected: PASS. Em seguida rodar o arquivo inteiro: `cd functions && npm test -- --test-name-pattern="friendly-match-review"`.

- [ ] **Step 5: Commit**

```bash
git add functions/src/friendly-match-review.ts functions/src/friendly-match-review.test.ts
git commit -m "feat(friendly-match): deadline sweep reveals reviews per pair"
```

### Task 17: `firestore.rules` — leitura por `organizerUid`/`participantUids`/`pendingSlotUids`

**Files:**
- Modify: `firestore.rules:1789-1808`

**Interfaces:**
- Consumes: os campos `organizerUid`/`participantUids`/`pendingSlotUids` introduzidos nas Tasks 3–8 (o doc já os tem quando esta rule for exercida — não há dado de prod a migrar, dev pode reindexar do zero).

Sem teste automatizado dedicado (o repo não tem suíte de `@firebase/rules-unit-testing` hoje — `find` não achou nenhum arquivo `*rules*test*` em nenhuma feature). Verificação é manual, via o script da Task 18.

- [ ] **Step 1: Atualizar a rule**

Em `firestore.rules`, trocar o bloco (linhas 1789–1808):

```
    // Bora Jogar — convites/jogos avulsos entre atletas.
    // Escrita exclusiva via Cloud Functions; leitura só dos participantes.
    // Os três disjuntos existem para queries por fromUid, toUid OU
    // participantUids passarem na prova de rules (o motor não deduz que
    // participantUids == [fromUid, toUid]).
    match /friendlyMatches/{matchId} {
      allow read: if request.auth != null && (
        resource.data.fromUid == request.auth.uid ||
        resource.data.toUid == request.auth.uid ||
        request.auth.uid in resource.data.participantUids
      );
      allow create, update, delete: if false;

      // Avaliações double-blind: notas ficam ilegíveis até o reveal (só a
      // Cloud Function lê/escreve via Admin SDK). Sem este bloco o catch-all
      // do fim do arquivo daria read a qualquer autenticado.
      match /privateReviews/{reviewerUid} {
        allow read, write: if false;
      }
    }
```

por:

```
    // Bora Jogar — convites/jogos avulsos entre atletas (N participantes).
    // Escrita exclusiva via Cloud Functions; leitura de quem já é
    // organizador/confirmado (participantUids) OU tem vaga pendente
    // (pendingSlotUids) — sem o segundo disjunto, quem ainda não respondeu
    // o próprio convite não conseguiria nem ler pra decidir.
    match /friendlyMatches/{matchId} {
      allow read: if request.auth != null && (
        resource.data.organizerUid == request.auth.uid ||
        request.auth.uid in resource.data.participantUids ||
        request.auth.uid in resource.data.pendingSlotUids
      );
      allow create, update, delete: if false;

      // Avaliações double-blind: notas ficam ilegíveis até o reveal (só a
      // Cloud Function lê/escreve via Admin SDK). Sem este bloco o catch-all
      // do fim do arquivo daria read a qualquer autenticado. Chave composta
      // reviewerUid_revieweeUid (cada avaliador avalia N-1 pessoas).
      match /privateReviews/{reviewKey} {
        allow read, write: if false;
      }
    }
```

- [ ] **Step 2: Validar sintaxe das rules**

Run: `firebase deploy --only firestore:rules --dry-run --project volley-track-dev-4596c` (ou `firebase emulators:start --only firestore` e checar que sobe sem erro de parse) — Expected: sem erros de sintaxe/compilação das rules.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(firestore-rules): friendlyMatches read by organizerUid/participantUids/pendingSlotUids"
```

**Nota importante para quem for fazer o deploy (fora deste plano):** rules e functions precisam subir **juntas** no dev — a rule nova depende dos campos novos existirem nos docs, e os docs antigos de QA no dev (schema velho, sem `organizerUid`/`pendingSlotUids`) devem ser apagados antes ou logo depois do deploy (ver "Dados de dev" na spec). Deploy de rules sozinho, com functions antigas ainda escrevendo o schema velho, deixaria os docs velhos ilegíveis (nenhum dos três disjuntos bate).

### Task 18: Atualizar o script de QA e2e do dev

**Files:**
- Modify: `functions/scripts/qa-friendly-match-e2e.mjs`

**Interfaces:**
- Consumes: os callables renomeados/alterados nas Tasks 3–9 (`sendFriendlyMatchInvite` com `toUids`, `acceptFriendlyMatchInviteSlot`, `declineFriendlyMatchInviteSlot`, `fillFriendlyMatchSlot`, `submitFriendlyMatchReview` com `revieweeUid`).

Este script roda contra o Firebase real do dev (Auth REST + callables + Firestore REST), não faz parte da suíte automatizada (`npm test`) — é uma ferramenta manual de QA. Não tem "teste que falha primeiro" no sentido TDD; a validação é rodar o script e ver o resultado.

- [ ] **Step 1: Ajustar as chamadas ao novo schema**

Em `functions/scripts/qa-friendly-match-e2e.mjs`:

1. Trocar toda chamada `call("sendFriendlyMatchInvite", token, {toUid: X, ...})` por `call("sendFriendlyMatchInvite", token, {toUids: [X], ...})`.
2. Trocar `call("acceptFriendlyMatchInvite", ...)` por `call("acceptFriendlyMatchInviteSlot", ...)` e `call("declineFriendlyMatchInvite", ...)` por `call("declineFriendlyMatchInviteSlot", ...)` (mesmos argumentos).
3. No bloco `console.log("== M1: convite → contraproposta → aceite ==")`, ajustar as asserções de status: `fieldStr(doc, "status") === "sent"` → `"filling"`; `"countered"` → mantém `"countered"` mas agora é `slots[0].status`, não `status` do doc — trocar a leitura para `doc.slots?.arrayValue?.values?.[0]?.mapValue?.fields?.status?.stringValue` (ou simplificar checando só `status === "filling"` antes/depois, já que o teste de contraproposta em si já é validado pelos testes unitários da Task 6 — este script é sobretudo um smoke test end-to-end, não precisa reafirmar todo detalhe interno).
4. Ajustar `ok("score congelado no envio", doc?.scoreAtSend?.integerValue != null)` — `scoreAtSend` agora está dentro de `slots[0]`, não no top-level do doc.
5. No bloco `== M1: avaliação double-blind ==`, adicionar `revieweeUid` em toda chamada `submitFriendlyMatchReview` (`revieweeUid: Bu.uid` quando A avalia, `revieweeUid: A.uid` quando B avalia), e ajustar a leitura final de `doc.reviews` pro formato aninhado (`doc.reviews.mapValue.fields[A.uid].mapValue.fields[Bu.uid]` em vez de `doc.reviews.mapValue.fields[A.uid]` direto).
6. Adicionar um novo bloco `== M4: jogo com 3 vagas — aceite parcial, recusa, reposição ==` que: cria um terceiro atleta sintético `C`; envia convite de A pra `[B, C]`; C recusa; A repõe a vaga de C com um quarto atleta sintético `D`; D e B aceitam; confere que o doc chega em `status === "confirmed"` com `participantUids` contendo `[A, B, D]` (não `C`, que recusou).

- [ ] **Step 2: Rodar contra o dev e conferir manualmente**

Run: `cd functions && node scripts/qa-friendly-match-e2e.mjs` — Expected: `RESULTADO: N ok, 0 falhas` no final. **Só rodar depois que as Tasks 1–17 estiverem deployadas no dev** (este script bate no Firebase real, não no fake).

- [ ] **Step 3: Commit**

```bash
git add functions/scripts/qa-friendly-match-e2e.mjs
git commit -m "chore(friendly-match): update dev e2e QA script for the multi-slot flow"
```

---

## Depois deste plano

- Deploy no dev: `firebase deploy --only functions:friendlyMatch,firestore:rules --project volley-track-dev-4596c` (ajustar o filtro de functions conforme os nomes reais exportados) — **antes** disso, apagar os docs velhos de `friendlyMatches` no dev (schema antigo incompatível, são só dados de QA).
- Depois do deploy, rodar o script da Task 18 pra validar end-to-end.
- Este plano **não** cobre o Flutter (`nexago_app/lib/features/friendly_match/`) — é um plano separado, escrito depois que este backend estiver implementado e revisado (decisão tomada no brainstorming).

