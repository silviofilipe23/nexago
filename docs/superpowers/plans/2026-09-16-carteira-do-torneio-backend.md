# Carteira do torneio — backend, rules e migração (Fase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mover o caixa das inscrições de `organizerWallets/{uid}` para
`tournamentWallets/{tournamentId}`, com saque de qualquer gestor da equipe para a
própria chave PIX, e criar o papel `eventAdmin` (opera o evento, não toca no
dinheiro).

**Architecture:** o crédito do webhook do Asaas passa a endereçar o torneio; o
saque passa a receber `tournamentId` e resolve a chave PIX no perfil de quem
pede; a permissão de ler o caixa cabe nas rules (`isTournamentStaff`), então o
saldo volta a ser leitura direta. O papel novo entra na lista de papéis aceitos
de `canManageTournament`, sem custo de leitura, e fica fora do `allow delete` do
torneio e da leitura da carteira.

**Tech Stack:** Cloud Functions v2 (TypeScript, Node 22), Firestore, regras do
Firestore, `node --test` com `FakeFirestore`, `@firebase/rules-unit-testing` no
emulador, scripts Node com ADC.

**Spec:** `docs/superpowers/specs/2026-09-16-carteira-do-torneio-design.md`

## Escopo desta fase

Este plano entrega **backend + rules + migração**, que é software testável por si:
ao fim dele o dinheiro novo já cai no torneio, o saque por torneio funciona e o
papel novo existe. As telas vêm em planos separados, nesta ordem:

- **Fase 2** — portal do organizador web (Financeiro por evento, KPI do Início,
  Config, chip do papel em Equipe, guard do Financeiro)
- **Fase 3** — app Flutter (financeiro do organizador por evento, guard do papel)
  e backoffice (fila de saques com evento e solicitante, chave PIX do perfil)

Até a Fase 2 subir, o portal publicado continua lendo a carteira antiga — que
após a migração fica zerada. **Não rodar a migração em produção antes da Fase 2**;
no dev, rodar é o que permite testar.

## Global Constraints

- Português nas strings/UI e nos comentários; inglês no código (`CLAUDE.md`).
- Retrocompatibilidade: `organizerWallets/{uid}` **não** é apagada, e os 3 pontos
  que liberam reserva aceitam saque legado sem `tournamentId` (fallback na
  carteira antiga). No dev há 0 saques pendentes; produção pode ter.
- Toda escrita em carteira continua exclusiva de Cloud Function (`allow write: if false`).
- Papel no código: `eventAdmin` (nunca `admin` — `isAdmin()` é a plataforma).
- Rótulo pt-BR do papel: "administrador".
- Saque automático até R$ 500 (`ARENA_WITHDRAWAL_AUTO_MAX_REAIS`), acima vai para
  revisão no backoffice. Regra inalterada.
- Funções `onCall` novas/alteradas mantêm `region: CLIENT_FACING_REGIONS`.
- Comandos rodam de `<worktree>/functions` — `cd` não persiste entre chamadas, e
  `frontend/node_modules`/`functions/node_modules` no worktree são symlinks para o
  checkout principal (criar com `ln -s` se ausentes).
- Testes unitários: `cd <worktree>/functions && npm test` (compila e roda
  `lib/*.test.js`). Um arquivo só:
  `npm run build && node --test lib/<nome>.test.js`.
- Rules tests: `cd <worktree>/functions && npx firebase emulators:exec --only firestore
  --project <id-de-teste> "node --test test/<arquivo>.rules.test.mjs"`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `functions/src/tournament-wallet.ts` (criar) | caixa do torneio: crédito, reserva, validação, liberação |
| `functions/src/tournament-wallet.test.ts` (criar) | testes do caixa |
| `functions/src/organizer-payout-profile.ts` (criar) | chave PIX da pessoa (`organizerPayoutProfiles/{uid}`) |
| `functions/src/organizer-payout-profile.test.ts` (criar) | testes do perfil |
| `functions/src/tournament-wallet-access.ts` (criar) | quem saca de qual caixa; caixas alcançáveis |
| `functions/src/tournament-wallet-access.test.ts` (criar) | testes de permissão |
| `functions/src/tournament-staff-sync.ts` (modificar) | papel `eventAdmin` na lista e no rótulo |
| `functions/src/asaas-tournament-registration-webhook.ts` (modificar) | credita o torneio |
| `functions/src/organizer-withdrawal.ts` (modificar) | saque por torneio; PIX do solicitante; view por torneio |
| `functions/src/organizer-withdrawal-payout.ts` (modificar) | libera reserva no caixa do torneio |
| `firestore.rules` (modificar) | `tournamentWallets`, `organizerPayoutProfiles`, papel novo, delete com saldo |
| `functions/test/tournament-wallet.rules.test.mjs` (criar) | rules do caixa e do perfil |
| `functions/test/tournament-event-admin.rules.test.mjs` (criar) | rules do papel novo |
| `functions/scripts/migrate-organizer-wallets-to-tournaments.js` (criar) | migração + backfill de `role` |

`organizer-wallet.ts` fica intacto: é o caminho legado que ainda atende saque
antigo e o histórico. O novo mora em arquivo próprio para o diff ser legível e
para o legado poder morrer de uma vez, depois.

---

### Task 1: Papel `eventAdmin` no backend

**Files:**
- Modify: `functions/src/tournament-staff-sync.ts:15-39`
- Test: `functions/src/tournament-staff-sync.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `TOURNAMENT_STAFF_ROLES` passa a ser `["manager", "eventAdmin", "scorer"]`;
  `staffRoleLabel("eventAdmin") === "administrador"`;
  `staffRoleGrantsOrganizerAccess("eventAdmin") === true` (já vale hoje, porque só
  `scorer` é barrado — o teste registra isso).

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `functions/src/tournament-staff-sync.test.ts`:

```ts
describe("papel eventAdmin", () => {
  it("tem rótulo próprio", () => {
    assert.equal(staffRoleLabel("eventAdmin"), "administrador");
  });

  it("entra na lista de papéis aceitos", () => {
    assert.ok(TOURNAMENT_STAFF_ROLES.includes("eventAdmin" as never));
  });

  it("ganha acesso ao portal do organizador", () => {
    assert.equal(staffRoleGrantsOrganizerAccess("eventAdmin"), true);
  });

  it("a notificação de adição usa o rótulo novo", () => {
    assert.equal(
      buildStaffAddedNotificationBody("eventAdmin", "Copa Teste"),
      "Você agora é administrador de Copa Teste",
    );
  });
});
```

O import do arquivo de teste (linhas 3-8) **não** traz `TOURNAMENT_STAFF_ROLES` —
acrescentar ao import existente de `./tournament-staff-sync`.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/functions && npm run build && node --test lib/tournament-staff-sync.test.js
```

Esperado: FAIL — `staffRoleLabel("eventAdmin")` devolve `"gestor"` (hoje qualquer
papel ≠ `scorer` cai em gestor).

- [ ] **Step 3: Implementar**

Em `functions/src/tournament-staff-sync.ts`:

```ts
export const TOURNAMENT_STAFF_ROLES = ["manager", "eventAdmin", "scorer"] as const;
export type TournamentStaffRole = (typeof TOURNAMENT_STAFF_ROLES)[number];

/** Rótulo pt-BR do papel de staff. Papel ausente/desconhecido cai em gestor,
 *  mesmo default de `buildStaffMirrorData`. */
export function staffRoleLabel(role: string): string {
  if (role === "scorer") return "mesário";
  if (role === "eventAdmin") return "administrador";
  return "gestor";
}
```

`staffRoleGrantsOrganizerAccess` não muda: `role !== "scorer"` já libera o portal
para o administrador, que é o que queremos.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/functions && npm run build && node --test lib/tournament-staff-sync.test.js
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-staff-sync.ts functions/src/tournament-staff-sync.test.ts
git commit -m "feat(staff): papel eventAdmin (administrador) na equipe do torneio"
```

---

### Task 2: Caixa do torneio — crédito

**Files:**
- Create: `functions/src/tournament-wallet.ts`
- Test: `functions/src/tournament-wallet.test.ts`

**Interfaces:**
- Consumes: `roundMoney` de `./mercadopago-arena-helpers`.
- Produces:
  - `tournamentWalletRef(db, tournamentId)` → `DocumentReference` de `tournamentWallets/{tournamentId}`
  - `creditTournamentWalletFromRegistration(db, tournamentId, {ownerId, registrationId, payerUid, paymentId, grossReais, platformFeeReais, gatewayFeeReais?}) => Promise<void>`

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/src/tournament-wallet.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {creditTournamentWalletFromRegistration} from "./tournament-wallet";

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
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/functions && npm run build && node --test lib/tournament-wallet.test.js
```

Esperado: FAIL na compilação — `Cannot find module './tournament-wallet'`.

- [ ] **Step 3: Implementar**

Criar `functions/src/tournament-wallet.ts`:

```ts
/**
 * Caixa do torneio — `tournamentWallets/{tournamentId}`.
 *
 * Substitui `organizerWallets/{uid}` como destino do dinheiro das inscrições
 * pagas via Asaas (decisão do dono, 16/09/2026): o dinheiro é do evento, e
 * qualquer gestor da equipe saca dele. `organizer-wallet.ts` continua existindo
 * para o histórico e para saque legado ainda em voo.
 */
import {FieldValue, type Firestore} from "firebase-admin/firestore";
import {roundMoney} from "./mercadopago-arena-helpers";

const TOURNAMENT_WALLETS = "tournamentWallets";

export function tournamentWalletRef(db: Firestore, tournamentId: string) {
  return db.collection(TOURNAMENT_WALLETS).doc(tournamentId);
}

export async function creditTournamentWalletFromRegistration(
  db: Firestore,
  tournamentId: string,
  params: {
    /** `tournament.managerId` no momento do crédito — quem responde pelo evento. */
    ownerId: string;
    registrationId: string;
    payerUid: string;
    paymentId: string;
    grossReais: number;
    platformFeeReais: number;
    /** Taxa do gateway repassada ao organizador: cartão desconta, PIX é 0. */
    gatewayFeeReais?: number;
  },
): Promise<void> {
  const gatewayFeeReais = roundMoney(Math.max(0, params.gatewayFeeReais ?? 0));
  const netReais = roundMoney(
    Math.max(0, params.grossReais - params.platformFeeReais - gatewayFeeReais),
  );
  const walletRef = tournamentWalletRef(db, tournamentId);
  const ledgerRef = walletRef.collection("ledger").doc();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const prevAvailable = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const prevPending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;

    tx.set(
      walletRef,
      {
        tournamentId,
        ownerId: params.ownerId,
        availableReais: roundMoney(prevAvailable + netReais),
        pendingReais: prevPending,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );

    tx.set(ledgerRef, {
      type: "credit",
      registrationId: params.registrationId,
      payerUid: params.payerUid,
      asaasPaymentId: params.paymentId,
      grossReais: roundMoney(params.grossReais),
      platformFeeReais: roundMoney(params.platformFeeReais),
      gatewayFeeReais,
      netReais,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/functions && npm run build && node --test lib/tournament-wallet.test.js
```

Esperado: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-wallet.ts functions/src/tournament-wallet.test.ts
git commit -m "feat(wallet): caixa do torneio recebe o crédito da inscrição"
```

---

### Task 3: Caixa do torneio — reserva, validação e liberação

**Files:**
- Modify: `functions/src/tournament-wallet.ts`
- Test: `functions/src/tournament-wallet.test.ts`

**Interfaces:**
- Consumes: `tournamentWalletRef` da Task 2.
- Produces:
  - `reserveTournamentWithdrawalAmount(db, tournamentId, amountReais) => Promise<void>` — lança `Error("INSUFFICIENT_BALANCE")`
  - `assertTournamentWithdrawalReservationValid(db, tournamentId, amountReais) => Promise<void>` — lança `Error("WITHDRAWAL_RESERVATION_INVALID")` ou `Error("WALLET_STATE_INVALID")`
  - `releaseTournamentWithdrawalReservation(db, tournamentId, amountReais, approve) => Promise<void>`

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `functions/src/tournament-wallet.test.ts`:

```ts
import {
  reserveTournamentWithdrawalAmount,
  releaseTournamentWithdrawalReservation,
  assertTournamentWithdrawalReservationValid,
} from "./tournament-wallet";

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
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/functions && npm run build && node --test lib/tournament-wallet.test.js
```

Esperado: FAIL na compilação — as três funções não existem.

- [ ] **Step 3: Implementar**

Acrescentar em `functions/src/tournament-wallet.ts` (mesma semântica de
`organizer-wallet.ts:70-146`, com o caixa do torneio no lugar do uid):

```ts
/** Move valor de `availableReais` para `pendingReais` ao solicitar saque. */
export async function reserveTournamentWithdrawalAmount(
  db: Firestore,
  tournamentId: string,
  amountReais: number,
): Promise<void> {
  const walletRef = tournamentWalletRef(db, tournamentId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const available = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const pending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;
    if (amountReais > available + 0.001) {
      throw new Error("INSUFFICIENT_BALANCE");
    }
    tx.set(
      walletRef,
      {
        tournamentId,
        availableReais: roundMoney(available - amountReais),
        pendingReais: roundMoney(pending + amountReais),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });
}

/** Confirma que o valor do saque segue reservado antes de disparar o PIX. */
export async function assertTournamentWithdrawalReservationValid(
  db: Firestore,
  tournamentId: string,
  amountReais: number,
): Promise<void> {
  const walletRef = tournamentWalletRef(db, tournamentId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const pending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;
    const available = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    if (amountReais > pending + 0.001) {
      throw new Error("WITHDRAWAL_RESERVATION_INVALID");
    }
    if (available < -0.001) {
      throw new Error("WALLET_STATE_INVALID");
    }
  });
}

/** Libera a reserva: `approve` consome o pending; caso contrário devolve. */
export async function releaseTournamentWithdrawalReservation(
  db: Firestore,
  tournamentId: string,
  amountReais: number,
  approve: boolean,
): Promise<void> {
  const walletRef = tournamentWalletRef(db, tournamentId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const available = snap.exists ? Number(snap.data()?.availableReais) || 0 : 0;
    const pending = snap.exists ? Number(snap.data()?.pendingReais) || 0 : 0;
    tx.set(
      walletRef,
      {
        tournamentId,
        availableReais: approve ? available : roundMoney(available + amountReais),
        pendingReais: roundMoney(Math.max(0, pending - amountReais)),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/functions && npm run build && node --test lib/tournament-wallet.test.js
```

Esperado: PASS (8 testes no arquivo).

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-wallet.ts functions/src/tournament-wallet.test.ts
git commit -m "feat(wallet): reserva e liberacao de saque no caixa do torneio"
```

---

### Task 4: Webhook do Asaas credita o torneio

**Files:**
- Modify: `functions/src/asaas-tournament-registration-webhook.ts:39` (import) e `:390-404` (chamada)
- Test: `functions/src/asaas-tournament-registration-webhook.test.ts:181` (helper `walletDoc`)

**Interfaces:**
- Consumes: `creditTournamentWalletFromRegistration` (Task 2).
- Produces: nenhum símbolo novo — muda o destino do crédito.

- [ ] **Step 1: Apontar o teste para o caixa do torneio (é ele que falha)**

Em `functions/src/asaas-tournament-registration-webhook.test.ts`, o helper na
linha ~181 devolve a carteira antiga. Trocar por:

```ts
function walletDoc(fake: FakeFirestore): Record<string, unknown> | undefined {
  return fake.store.get("tournamentWallets/t1");
}
```

O `TOURNAMENT_PATH` do arquivo já é `tournaments/t1`, e os testes de cartão em
duas fases (`:184-266`) passam a cobrir o destino novo sem mais nenhuma mudança.
Acrescentar um caso que fixa o dono gravado no caixa:

```ts
it("grava o dono do torneio no caixa", async () => {
  const {fake, db} = makeDb();
  seedTournamentWithOrganizer(fake);
  seedRegistration(fake);
  fake.seedDoc(PENDING_A, CARD_PENDING_A);

  await processTournamentRegistrationAsaasNotification(
    db, "pay1", cardPayment("RECEIVED", {netValue: 96.71}),
    processedRefOf(db), makeDeps().deps,
  );

  assert.equal(walletDoc(fake)!["ownerId"], "org1");
  assert.equal(walletDoc(fake)!["tournamentId"], "t1");
});
```

`seedTournamentWithOrganizer` (linha 172) semeia `managerId: "org1"` em
`tournaments/t1`, então os asserts acima estão com os valores certos.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/functions && npm run build && node --test lib/asaas-tournament-registration-webhook.test.js
```

Esperado: FAIL — os asserts de crédito procuram `tournamentWallets/t1` e o código
ainda escreve em `organizerWallets/org1`.

- [ ] **Step 3: Implementar**

Em `functions/src/asaas-tournament-registration-webhook.ts`, trocar o import da
linha 39:

```ts
import {creditTournamentWalletFromRegistration} from "./tournament-wallet";
```

E a chamada dentro de `if (phases.credit && organizerId) {` (linha ~396):

```ts
        await creditTournamentWalletFromRegistration(db, tournamentId, {
          ownerId: organizerId,
          registrationId,
          payerUid,
          paymentId,
          grossReais: paidOnline,
          platformFeeReais: computePlatformFeeReais(paidOnline, feePercent),
          gatewayFeeReais: resolveGatewayFeeReais(payment, billingType, paidOnline),
        });
```

O `if (phases.credit && organizerId)` continua exigindo o dono: sem `managerId` no
torneio não há a quem atribuir o caixa, e a comissão é resolvida por
`organizers/{organizerId}`. A marcação `walletCreditedAt` no doc de processados
segue igual — é ela que impede crédito duplicado numa reentrega.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/functions && npm run build && node --test lib/asaas-tournament-registration-webhook.test.js
```

Esperado: PASS. Conferir que nenhuma chamada antiga sobrou:

```bash
grep -rn "creditOrganizerWalletFromRegistration" functions/src/ | grep -v "organizer-wallet"
```

Esperado: nenhuma linha (só a definição em `organizer-wallet.ts` e seu teste).

- [ ] **Step 5: Commit**

```bash
git add functions/src/asaas-tournament-registration-webhook.ts functions/src/asaas-tournament-registration-webhook.test.ts
git commit -m "feat(webhook): inscricao paga credita o caixa do torneio"
```

---

### Task 5: Chave PIX vira perfil da pessoa

**Files:**
- Create: `functions/src/organizer-payout-profile.ts`
- Create: `functions/src/organizer-payout-profile.test.ts`
- Modify: `functions/src/organizer-withdrawal.ts:110-142` (`setOrganizerPayoutPixKey`)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `organizerPayoutProfileRef(db, uid)` → `organizerPayoutProfiles/{uid}`
  - `savePayoutPixKey(db, uid, {pixKey, pixKeyType}) => Promise<void>`
  - `loadPayoutPixKey(db, uid) => Promise<{pixKey: string; pixKeyType: string}>` —
    lê o perfil e, se vazio, cai na carteira antiga `organizerWallets/{uid}`
    (compatibilidade: quem já cadastrou não precisa cadastrar de novo)

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/src/organizer-payout-profile.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {savePayoutPixKey, loadPayoutPixKey} from "./organizer-payout-profile";

const UID = "pessoaUid";

describe("perfil de repasse do organizador", () => {
  it("grava e lê a chave da pessoa", async () => {
    const fake = new FakeFirestore();
    await savePayoutPixKey(fake as unknown as Firestore, UID, {
      pixKey: "pessoa@exemplo.com", pixKeyType: "EMAIL",
    });

    assert.equal(
      fake.store.get(`organizerPayoutProfiles/${UID}`)!["payoutPixKey"],
      "pessoa@exemplo.com",
    );
    assert.deepEqual(await loadPayoutPixKey(fake as unknown as Firestore, UID), {
      pixKey: "pessoa@exemplo.com", pixKeyType: "EMAIL",
    });
  });

  it("sem perfil, aproveita a chave já cadastrada na carteira antiga", async () => {
    const fake = new FakeFirestore();
    fake.seedDoc(`organizerWallets/${UID}`, {
      payoutPixKey: "11999998888", payoutPixKeyType: "PHONE",
    });

    assert.deepEqual(await loadPayoutPixKey(fake as unknown as Firestore, UID), {
      pixKey: "11999998888", pixKeyType: "PHONE",
    });
  });

  it("sem chave em lugar nenhum devolve vazio", async () => {
    const fake = new FakeFirestore();
    assert.deepEqual(await loadPayoutPixKey(fake as unknown as Firestore, UID), {
      pixKey: "", pixKeyType: "",
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/functions && npm run build && node --test lib/organizer-payout-profile.test.js
```

Esperado: FAIL na compilação — módulo inexistente.

- [ ] **Step 3: Implementar**

Criar `functions/src/organizer-payout-profile.ts`:

```ts
/**
 * Chave PIX de repasse da PESSOA — `organizerPayoutProfiles/{uid}`.
 *
 * Com o caixa morando no torneio e cada um sacando para a própria conta
 * (decisão do dono, 16/09/2026), a chave deixou de ser um dado da carteira e
 * passou a ser um dado de quem saca. Escrita só por Cloud Function; as rules
 * liberam leitura ao próprio dono.
 */
import {FieldValue, type Firestore} from "firebase-admin/firestore";

const ORGANIZER_PAYOUT_PROFILES = "organizerPayoutProfiles";

export function organizerPayoutProfileRef(db: Firestore, uid: string) {
  return db.collection(ORGANIZER_PAYOUT_PROFILES).doc(uid);
}

export async function savePayoutPixKey(
  db: Firestore,
  uid: string,
  params: {pixKey: string; pixKeyType: string},
): Promise<void> {
  await organizerPayoutProfileRef(db, uid).set(
    {
      payoutPixKey: params.pixKey,
      payoutPixKeyType: params.pixKeyType,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}

/**
 * Chave de repasse de `uid`. Cai na carteira antiga quando o perfil não existe:
 * quem já tinha chave cadastrada em `organizerWallets/{uid}` não precisa
 * cadastrar de novo, e a migração copia o dado de qualquer forma.
 */
export async function loadPayoutPixKey(
  db: Firestore,
  uid: string,
): Promise<{pixKey: string; pixKeyType: string}> {
  const profile = await organizerPayoutProfileRef(db, uid).get();
  const fromProfile = (profile.data()?.payoutPixKey as string | undefined)?.trim() ?? "";
  if (fromProfile) {
    return {
      pixKey: fromProfile,
      pixKeyType: (profile.data()?.payoutPixKeyType as string | undefined)?.trim() ?? "",
    };
  }
  const legacy = await db.collection("organizerWallets").doc(uid).get();
  return {
    pixKey: (legacy.data()?.payoutPixKey as string | undefined)?.trim() ?? "",
    pixKeyType: (legacy.data()?.payoutPixKeyType as string | undefined)?.trim() ?? "",
  };
}
```

Em `functions/src/organizer-withdrawal.ts`, `setOrganizerPayoutPixKey` passa a
gravar no perfil. Substituir o bloco que escreve na carteira (linhas ~131-140):

```ts
  const db = getFirestore();
  await savePayoutPixKey(db, uid, {
    pixKey: pixAddressKey,
    pixKeyType: pixAddressKeyType,
  });
  return {success: true, pixKey: pixAddressKey, pixKeyType: pixAddressKeyType};
```

E acrescentar o import:

```ts
import {loadPayoutPixKey, savePayoutPixKey} from "./organizer-payout-profile";
```

Atualizar o comentário do cabeçalho da função, que hoje diz que a chave fica no
doc da carteira e que o gestor não escolhe destino — agora cada um escreve a sua
e é para ela que o dinheiro vai.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/functions && npm run build && node --test lib/organizer-payout-profile.test.js && npm run lint
```

Esperado: PASS nos 3 testes e `tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add functions/src/organizer-payout-profile.ts functions/src/organizer-payout-profile.test.ts functions/src/organizer-withdrawal.ts
git commit -m "feat(payout): chave PIX de repasse passa a ser perfil da pessoa"
```

---

### Task 6: Quem pode sacar de qual caixa

**Files:**
- Create: `functions/src/tournament-wallet-access.ts`
- Create: `functions/src/tournament-wallet-access.test.ts`

**Interfaces:**
- Consumes: `isSuperAdminClaim` de `./auth-roles`; espelho `users/{uid}/tournamentStaff/{tid}`.
- Produces:
  - `isActiveWithdrawalStaffMirror(data) => boolean` — `status` ativo **e** `role` gestor (papel ausente conta como gestor, igual ao resto do backend; `eventAdmin` e `scorer` são falsos)
  - `listWithdrawableTournamentIds(db, uid) => Promise<string[]>` — torneios em que `uid` é dono ou gestor ativo
  - `assertCanWithdrawFromTournament(db, uid, tournamentId) => Promise<void>` — lança `HttpsError("permission-denied", …)`

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/src/tournament-wallet-access.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import type {Firestore} from "firebase-admin/firestore";
import {FakeFirestore} from "./fake-firestore.test-helper";
import {
  isActiveWithdrawalStaffMirror,
  assertCanWithdrawFromTournament,
} from "./tournament-wallet-access";

const OWNER = "ownerUid";
const MANAGER = "managerUid";
const EVENT_ADMIN = "eventAdminUid";
const SCORER = "scorerUid";
const OUTSIDER = "outsiderUid";
const TOURNAMENT = "t1";

function dbWith(entries: Array<[string, Record<string, unknown>]>): Firestore {
  const fake = new FakeFirestore();
  fake.seedDoc(`tournaments/${TOURNAMENT}`, {managerId: OWNER});
  for (const [path, data] of entries) fake.seedDoc(path, data);
  return fake as unknown as Firestore;
}

describe("isActiveWithdrawalStaffMirror", () => {
  it("gestor ativo saca", () => {
    assert.equal(isActiveWithdrawalStaffMirror({role: "manager", status: "active"}), true);
  });

  it("papel ausente conta como gestor", () => {
    assert.equal(isActiveWithdrawalStaffMirror({status: "active"}), true);
  });

  it("administrador do evento NÃO saca", () => {
    assert.equal(isActiveWithdrawalStaffMirror({role: "eventAdmin", status: "active"}), false);
  });

  it("mesário não saca", () => {
    assert.equal(isActiveWithdrawalStaffMirror({role: "scorer", status: "active"}), false);
  });

  it("gestor inativo não saca", () => {
    assert.equal(isActiveWithdrawalStaffMirror({role: "manager", status: "removed"}), false);
  });
});

describe("assertCanWithdrawFromTournament", () => {
  it("o dono do torneio saca", async () => {
    const db = dbWith([]);
    await assertCanWithdrawFromTournament(db, OWNER, TOURNAMENT);
  });

  it("gestor da equipe saca", async () => {
    const db = dbWith([
      [`users/${MANAGER}/tournamentStaff/${TOURNAMENT}`, {role: "manager", status: "active"}],
    ]);
    await assertCanWithdrawFromTournament(db, MANAGER, TOURNAMENT);
  });

  it("administrador do evento é recusado", async () => {
    const db = dbWith([
      [`users/${EVENT_ADMIN}/tournamentStaff/${TOURNAMENT}`, {role: "eventAdmin", status: "active"}],
    ]);
    await assert.rejects(
      () => assertCanWithdrawFromTournament(db, EVENT_ADMIN, TOURNAMENT),
      /permission-denied|acesso/i,
    );
  });

  it("mesário é recusado", async () => {
    const db = dbWith([
      [`users/${SCORER}/tournamentStaff/${TOURNAMENT}`, {role: "scorer", status: "active"}],
    ]);
    await assert.rejects(
      () => assertCanWithdrawFromTournament(db, SCORER, TOURNAMENT),
      /permission-denied|acesso/i,
    );
  });

  it("estranho é recusado", async () => {
    const db = dbWith([]);
    await assert.rejects(
      () => assertCanWithdrawFromTournament(db, OUTSIDER, TOURNAMENT),
      /permission-denied|acesso/i,
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/functions && npm run build && node --test lib/tournament-wallet-access.test.js
```

Esperado: FAIL na compilação — módulo inexistente.

- [ ] **Step 3: Implementar**

Criar `functions/src/tournament-wallet-access.ts`:

```ts
/**
 * Quem pode sacar do caixa de um torneio (`tournamentWallets/{tournamentId}`).
 *
 * Dono do evento e GESTOR ativo da equipe. O papel `eventAdmin` (administrador)
 * opera o torneio inteiro mas não toca no dinheiro — decisão do dono em
 * 16/09/2026 — e mesário nunca teve acesso. A recusa vive aqui, no servidor: a
 * tela que esconde o Financeiro é conveniência, não segurança.
 *
 * A relação gestor → torneio é lida do espelho `users/{uid}/tournamentStaff`,
 * mantido por `onTournamentStaffWrittenSyncMirror`.
 */
import {HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import type {Firestore} from "firebase-admin/firestore";
import {isSuperAdminClaim} from "./auth-roles";

/** Teto de torneios lidos do espelho — protege a varredura de um staff enorme. */
const MAX_STAFF_TOURNAMENTS = 200;
/** `getAll` do Admin SDK aceita no máximo 100 refs por chamada. */
const MAX_WALLETS_PER_VIEW = 100;

/**
 * Papel que saca: gestor, e só. Papel **ausente** conta como gestor, mesmo
 * default de `buildStaffMirrorData`; `status` ausente conta como ativo.
 */
export function isActiveWithdrawalStaffMirror(data: Record<string, unknown>): boolean {
  const status = (data["status"] as string | undefined) ?? "active";
  const role = (data["role"] as string | undefined) ?? "manager";
  return status === "active" && role === "manager";
}

/**
 * Torneios de onde `uid` pode sacar: os que ele é dono e os que é gestor ativo.
 * O teto de 100 não é decorativo — quem consome isso faz `getAll` da lista, e o
 * Admin SDK aceita no máximo 100 refs por chamada.
 */
export async function listWithdrawableTournamentIds(
  db: Firestore,
  uid: string,
): Promise<string[]> {
  const [ownSnap, mirrorSnap] = await Promise.all([
    db.collection("tournaments").where("managerId", "==", uid).get(),
    db.collection(`users/${uid}/tournamentStaff`).get(),
  ]);
  const ids = ownSnap.docs.map((d) => d.id);
  for (const d of mirrorSnap.docs.slice(0, MAX_STAFF_TOURNAMENTS)) {
    if (!isActiveWithdrawalStaffMirror(d.data() as Record<string, unknown>)) continue;
    if (!ids.includes(d.id)) ids.push(d.id);
  }
  return ids.slice(0, MAX_WALLETS_PER_VIEW);
}

/** Lança `permission-denied` se `uid` não puder sacar do caixa de `tournamentId`. */
export async function assertCanWithdrawFromTournament(
  db: Firestore,
  uid: string,
  tournamentId: string,
): Promise<void> {
  const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
  if (!tournamentSnap.exists) {
    throw new HttpsError("not-found", "Torneio não encontrado.");
  }
  const managerId = (tournamentSnap.data()?.managerId as string | undefined)?.trim() ?? "";
  if (managerId && managerId === uid) return;

  const mirror = await db.doc(`users/${uid}/tournamentStaff/${tournamentId}`).get();
  if (mirror.exists &&
      isActiveWithdrawalStaffMirror(mirror.data() as Record<string, unknown>)) {
    return;
  }

  // Suporte da plataforma alcança qualquer caixa (mesma porta do backoffice);
  // só pagamos o `getUser` quando o caminho normal falhou.
  try {
    const user = await getAuth().getUser(uid);
    if (isSuperAdminClaim(user.customClaims)) return;
  } catch {
    // Sessão órfã ou Auth indisponível: cai na negativa abaixo.
  }

  throw new HttpsError(
    "permission-denied",
    "Você não tem acesso ao caixa deste torneio.",
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/functions && npm run build && node --test lib/tournament-wallet-access.test.js
```

Esperado: PASS (10 testes). O caso do super admin não é testado aqui porque
depende do Auth real — ele é coberto pelo rules test da Task 10 e pelo caminho já
existente do backoffice.

- [ ] **Step 5: Commit**

```bash
git add functions/src/tournament-wallet-access.ts functions/src/tournament-wallet-access.test.ts
git commit -m "feat(wallet): permissao de saque por torneio (administrador nao saca)"
```

---

### Task 7: `requestOrganizerWithdrawal` saca do caixa do torneio

**Files:**
- Modify: `functions/src/organizer-withdrawal.ts:83-107` (`assertNoPendingOrganizerWithdrawal`), `:144-258` (a callable)
- Test: `functions/src/organizer-withdrawal-request.test.ts` (criar)

**Interfaces:**
- Consumes: `assertCanWithdrawFromTournament` (Task 6), `loadPayoutPixKey` (Task 5),
  `reserveTournamentWithdrawalAmount` (Task 3).
- Produces: função pura exportada para teste —
  `resolveWithdrawalRequest({tournamentId, amountReais, profilePixKey, profilePixKeyType})`
  → `{amount: number; pixKey: string; pixKeyType: string}`, lançando `HttpsError`
  em valor inválido, torneio ausente ou chave não cadastrada. A callable só
  orquestra.

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/src/organizer-withdrawal-request.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {resolveWithdrawalRequest} from "./organizer-withdrawal";

describe("resolveWithdrawalRequest", () => {
  it("usa a chave do perfil de quem pede", () => {
    const out = resolveWithdrawalRequest({
      tournamentId: "t1",
      amountReais: 40,
      profilePixKey: "pessoa@exemplo.com",
      profilePixKeyType: "EMAIL",
    });
    assert.equal(out.amount, 40);
    assert.equal(out.pixKey, "pessoa@exemplo.com");
    assert.equal(out.pixKeyType, "EMAIL");
  });

  it("exige torneio", () => {
    assert.throws(
      () => resolveWithdrawalRequest({
        tournamentId: "  ", amountReais: 40,
        profilePixKey: "pessoa@exemplo.com", profilePixKeyType: "EMAIL",
      }),
      /torneio/i,
    );
  });

  it("exige valor positivo", () => {
    assert.throws(
      () => resolveWithdrawalRequest({
        tournamentId: "t1", amountReais: 0,
        profilePixKey: "pessoa@exemplo.com", profilePixKeyType: "EMAIL",
      }),
      /valor/i,
    );
  });

  it("sem chave cadastrada, manda cadastrar", () => {
    assert.throws(
      () => resolveWithdrawalRequest({
        tournamentId: "t1", amountReais: 40, profilePixKey: "", profilePixKeyType: "",
      }),
      /chave PIX/i,
    );
  });

  it("arredonda centavos do valor", () => {
    const out = resolveWithdrawalRequest({
      tournamentId: "t1", amountReais: 40.005,
      profilePixKey: "pessoa@exemplo.com", profilePixKeyType: "EMAIL",
    });
    assert.equal(out.amount, 40.01);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/functions && npm run build && node --test lib/organizer-withdrawal-request.test.js
```

Esperado: FAIL na compilação — `resolveWithdrawalRequest` não existe.

- [ ] **Step 3: Implementar**

Em `functions/src/organizer-withdrawal.ts`, acrescentar a função pura e reescrever
a callable. Primeiro a função (acima da callable):

```ts
/**
 * Regras de entrada do saque, sem I/O — é aqui que mora a garantia de destino:
 * a chave é SEMPRE a do perfil de quem pede, e o payload não tem voz nenhuma
 * sobre para onde o dinheiro vai.
 */
export function resolveWithdrawalRequest(params: {
  tournamentId: string;
  amountReais: number;
  profilePixKey: string;
  profilePixKeyType: string;
}): {amount: number; pixKey: string; pixKeyType: string} {
  const tournamentId = params.tournamentId.trim();
  if (!tournamentId) {
    throw new HttpsError("invalid-argument", "Informe o torneio do saque.");
  }
  if (!Number.isFinite(params.amountReais) || params.amountReais <= 0) {
    throw new HttpsError("invalid-argument", "Informe um valor válido para saque.");
  }
  const pixKey = params.profilePixKey.trim();
  if (pixKey.length < 5) {
    throw new HttpsError(
      "failed-precondition",
      "Cadastre sua chave PIX de repasse antes de sacar.",
    );
  }
  return {
    amount: roundMoney(params.amountReais),
    pixKey,
    pixKeyType: params.profilePixKeyType.trim().toUpperCase(),
  };
}
```

Depois a trava de pendente, que passa a ser por torneio (substitui
`assertNoPendingOrganizerWithdrawal`, linhas 83-107):

```ts
/** Um saque pendente por CAIXA: vários gestores sacam do mesmo dinheiro, então
 *  a trava tem de ser do torneio, não de quem pede. */
async function assertNoPendingTournamentWithdrawal(
  db: ReturnType<typeof getFirestore>,
  tournamentId: string,
): Promise<void> {
  const col = db.collection(ORGANIZER_WITHDRAWALS);
  const snap = await col
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "pending")
    .limit(1)
    .get()
    .catch(async (err) => {
      if (!isFirestoreIndexError(err)) throw err;
      return col.where("tournamentId", "==", tournamentId).limit(20).get();
    });
  const hasPending = snap.docs.some(
    (d) => (d.data().status as string | undefined)?.toLowerCase() === "pending",
  );
  if (hasPending) {
    throw new HttpsError(
      "failed-precondition",
      "Já existe um saque pendente neste torneio. Aguarde a conclusão.",
    );
  }
}
```

E o corpo da callable, substituindo o trecho que vai de `const data = …` até o
`await withdrawalRef.set({…})`:

```ts
    const data = (request.data ?? {}) as {
      amountReais?: number;
      tournamentId?: string;
    };

    const db = getFirestore();
    const tournamentId = data.tournamentId?.trim() ?? "";
    await assertCanWithdrawFromTournament(db, uid, tournamentId);

    const profile = await loadPayoutPixKey(db, uid);
    const {amount, pixKey, pixKeyType} = resolveWithdrawalRequest({
      tournamentId,
      amountReais: typeof data.amountReais === "number" ? data.amountReais : 0,
      profilePixKey: profile.pixKey,
      profilePixKeyType: profile.pixKeyType,
    });

    const {pixAddressKey, pixAddressKeyType} = resolveWithdrawalPixFields(
      pixKey,
      pixKeyType || undefined,
    );
    if (pixAddressKey.length < 5) {
      throw new HttpsError("invalid-argument", "Chave PIX inválida.");
    }

    await assertNoPendingTournamentWithdrawal(db, tournamentId);

    const tournamentSnap = await db.doc(`tournaments/${tournamentId}`).get();
    const ownerId =
      (tournamentSnap.data()?.managerId as string | undefined)?.trim() ?? "";
    const tournamentName =
      (tournamentSnap.data()?.name as string | undefined)?.trim() ?? "";
    const delegated = ownerId !== uid;

    try {
      await reserveTournamentWithdrawalAmount(db, tournamentId, amount);
    } catch (e) {
      if (e instanceof Error && e.message === "INSUFFICIENT_BALANCE") {
        throw new HttpsError("failed-precondition", "Saldo insuficiente para este saque.");
      }
      throw e;
    }

    const autoEligible = amount <= ARENA_WITHDRAWAL_AUTO_MAX_REAIS + 0.001;
    const processingMode = autoEligible ? "auto" : "manual_review";

    const withdrawalRef = db.collection(ORGANIZER_WITHDRAWALS).doc();
    await withdrawalRef.set({
      tournamentId,
      tournamentName,
      // `organizerId` segue gravado com o dono do evento: é por ele que a fila
      // do backoffice e o webhook de payout encontram o saque.
      organizerId: ownerId,
      amountReais: amount,
      pixKey: pixAddressKey,
      pixKeyType: pixAddressKeyType,
      processingMode,
      status: "pending",
      payoutStatus: "pending",
      payoutProvider: "asaas",
      requestedBy: uid,
      requestedByStaff: delegated,
      createdAt: FieldValue.serverTimestamp(),
    });
```

O restante da callable (auto payout, retorno, notificação) fica como está, com
duas adaptações: a notificação ao dono passa a receber o nome do torneio, e
`completeOrganizerWithdrawalPayout` recebe o doc do saque já com `tournamentId`
(Task 8). Em `notifyOwnerOfDelegatedWithdrawal`, trocar a assinatura para receber
`{organizerId, tournamentName, requestedBy, amountReais, pixKey}` e o corpo da
mensagem para:

```ts
      body:
        `${requesterName} solicitou um saque de ` +
        `R$ ${params.amountReais.toFixed(2).replace(".", ",")} do caixa de ` +
        `${params.tournamentName || "um torneio seu"} para a chave PIX ` +
        `${maskDelegatePayoutPixKey(params.pixKey)}.`,
```

**Imports — `noUnusedLocals: true` está ligado, então import que sobra QUEBRA o
build (`tsc`), não é aviso.** No topo do arquivo:

- entram: `assertCanWithdrawFromTournament` de `./tournament-wallet-access`;
  `reserveTournamentWithdrawalAmount` de `./tournament-wallet`
- sai: `resolveWithdrawalPixSource` (a garantia de destino agora é o perfil da
  pessoa). A função continua exportada em `organizer-wallet-access.ts` com seus
  testes — export sem consumidor não quebra o build, só import sem uso
- `reserveOrganizerWithdrawalAmount` sai do uso nesta task; conferir se sobrou
  import sem consumidor e removê-lo
- `assertCanAccessOrganizerWallet` e `listAccessibleOrganizerIds` seguem em uso
  até a Task 9 trocar a view — remover só lá
- a função privada `assertNoPendingOrganizerWithdrawal` (linha 85) é usada
  **apenas** na linha 192, dentro do bloco que esta task reescreve: substituí-la
  pela versão por torneio é seguro, e deixá-la para trás quebra o build

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/functions && npm run build && node --test lib/organizer-withdrawal-request.test.js && npm run lint
```

Esperado: PASS (5 testes) e `tsc --noEmit` limpo. Erro `is declared but its value
is never read` significa import ou função órfã do passo anterior — remover, não
silenciar.

- [ ] **Step 5: Commit**

```bash
git add functions/src/organizer-withdrawal.ts functions/src/organizer-withdrawal-request.test.ts
git commit -m "feat(withdrawal): saque sai do caixa do torneio com a chave de quem pede"
```

---

### Task 8: Payout e revisão liberam a reserva do caixa certo

**Files:**
- Modify: `functions/src/organizer-withdrawal-payout.ts:25-46`
- Modify: `functions/src/organizer-withdrawal.ts:720-740` (aprovar/rejeitar no backoffice)
- Test: `functions/src/organizer-withdrawal-payout.test.ts` (criar)

**Interfaces:**
- Consumes: `assertTournamentWithdrawalReservationValid`,
  `releaseTournamentWithdrawalReservation` (Task 3); as versões legadas de
  `organizer-wallet.ts`.
- Produces: `resolveWithdrawalWalletTarget(withdrawal)` →
  `{kind: "tournament"; tournamentId: string} | {kind: "organizer"; organizerId: string}`.
  Saque novo tem `tournamentId`; saque legado (sem o campo) cai na carteira antiga.

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/src/organizer-withdrawal-payout.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {resolveWithdrawalWalletTarget} from "./organizer-withdrawal-payout";

describe("resolveWithdrawalWalletTarget", () => {
  it("saque novo debita o caixa do torneio", () => {
    assert.deepEqual(
      resolveWithdrawalWalletTarget({tournamentId: "t1", organizerId: "org1"}),
      {kind: "tournament", tournamentId: "t1"},
    );
  });

  it("saque legado sem torneio debita a carteira antiga", () => {
    assert.deepEqual(
      resolveWithdrawalWalletTarget({organizerId: "org1"}),
      {kind: "organizer", organizerId: "org1"},
    );
  });

  it("doc sem nenhum dos dois é inválido", () => {
    assert.throws(() => resolveWithdrawalWalletTarget({}), /WITHDRAWAL_DATA_INVALID/);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/functions && npm run build && node --test lib/organizer-withdrawal-payout.test.js
```

Esperado: FAIL na compilação — função inexistente.

- [ ] **Step 3: Implementar**

Em `functions/src/organizer-withdrawal-payout.ts`:

```ts
/**
 * De qual caixa o saque sai. Saque criado a partir de 16/09/2026 traz
 * `tournamentId`; os que ficaram pendentes antes da virada continuam debitando
 * `organizerWallets/{uid}` — é o único caminho que não deixa dinheiro preso.
 */
export function resolveWithdrawalWalletTarget(
  withdrawal: Record<string, unknown>,
):
  | {kind: "tournament"; tournamentId: string}
  | {kind: "organizer"; organizerId: string} {
  const tournamentId = (withdrawal.tournamentId as string | undefined)?.trim() ?? "";
  if (tournamentId) return {kind: "tournament", tournamentId};
  const organizerId = (withdrawal.organizerId as string | undefined)?.trim() ?? "";
  if (organizerId) return {kind: "organizer", organizerId};
  throw new Error("WITHDRAWAL_DATA_INVALID");
}
```

E usar em `completeOrganizerWithdrawalPayout`, trocando as linhas que hoje leem
`organizerId` e chamam as funções da carteira antiga:

```ts
  const target = resolveWithdrawalWalletTarget(withdrawal);
  const amountReais = Number(withdrawal.amountReais) || 0;
  if (amountReais <= 0) {
    throw new Error("WITHDRAWAL_DATA_INVALID");
  }

  if (target.kind === "tournament") {
    await assertTournamentWithdrawalReservationValid(db, target.tournamentId, amountReais);
  } else {
    await assertOrganizerWithdrawalReservationValid(db, target.organizerId, amountReais);
  }

  const payout = await sendArenaWithdrawalPixTransfer(
    withdrawalRef,
    withdrawal,
    ORGANIZER_WITHDRAWAL_REF_PREFIX,
  );

  if (target.kind === "tournament") {
    await releaseTournamentWithdrawalReservation(db, target.tournamentId, amountReais, true);
  } else {
    await releaseOrganizerWithdrawalReservation(db, target.organizerId, amountReais, true);
  }
```

Em `functions/src/organizer-withdrawal.ts`, nos dois pontos de revisão
(rejeitar por volta da linha 725 e aprovar manualmente por volta da 736), aplicar
a mesma escolha. Exemplo do caminho de rejeição:

```ts
      const target = resolveWithdrawalWalletTarget(withdrawal);
      if (target.kind === "tournament") {
        await releaseTournamentWithdrawalReservation(db, target.tournamentId, amountReais, false);
      } else {
        await releaseOrganizerWithdrawalReservation(db, target.organizerId, amountReais, false);
      }
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/functions && npm run build && node --test lib/organizer-withdrawal-payout.test.js && npm test
```

Esperado: PASS nos 3 testes novos e a suíte inteira verde (era 2357 testes antes
desta fase; o número sobe com os desta).

- [ ] **Step 5: Commit**

```bash
git add functions/src/organizer-withdrawal-payout.ts functions/src/organizer-withdrawal-payout.test.ts functions/src/organizer-withdrawal.ts
git commit -m "feat(withdrawal): payout e revisao liberam a reserva do caixa do torneio"
```

---

### Task 9: `loadOrganizerWalletView` passa a ser por torneio

**Files:**
- Modify: `functions/src/organizer-withdrawal.ts:315-430` (a callable)
- Test: `functions/src/organizer-wallet-view.test.ts` (criar)

**Interfaces:**
- Consumes: `listWithdrawableTournamentIds` (Task 6), `tournamentWalletRef` (Task 2),
  `loadPayoutPixKey` (Task 5), `resolveLedgerAthleteLabels` (já existe no arquivo).
- Produces: a callable devolve
  `{tournaments: Array<{tournamentId, tournamentName, availableReais, pendingReais, canWithdraw}>,
    selected: {tournamentId, tournamentName, availableReais, pendingReais},
    payout: {pixKey, pixKeyType, hasPixKey},
    ledger: […], withdrawals: […]}`.
  Função pura exportada: `buildWalletViewRows(tournaments, wallets)` →
  as linhas do seletor, ordenadas por saldo disponível decrescente e, em empate,
  por nome.

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/src/organizer-wallet-view.test.ts`:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {buildWalletViewRows} from "./organizer-withdrawal";

describe("buildWalletViewRows", () => {
  it("põe o caixa mais cheio na frente", () => {
    const rows = buildWalletViewRows(
      [
        {id: "t1", name: "Copa A"},
        {id: "t2", name: "Copa B"},
      ],
      new Map([
        ["t1", {availableReais: 10, pendingReais: 0}],
        ["t2", {availableReais: 90, pendingReais: 5}],
      ]),
    );
    assert.deepEqual(rows.map((r) => r.tournamentId), ["t2", "t1"]);
    assert.equal(rows[0]!.availableReais, 90);
    assert.equal(rows[0]!.pendingReais, 5);
  });

  it("caixa que ainda não existe entra zerado, não fora da lista", () => {
    const rows = buildWalletViewRows([{id: "t1", name: "Copa A"}], new Map());
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.availableReais, 0);
    assert.equal(rows[0]!.tournamentName, "Copa A");
  });

  it("empate de saldo ordena por nome", () => {
    const rows = buildWalletViewRows(
      [{id: "t2", name: "Copa Z"}, {id: "t1", name: "Copa A"}],
      new Map([
        ["t1", {availableReais: 0, pendingReais: 0}],
        ["t2", {availableReais: 0, pendingReais: 0}],
      ]),
    );
    assert.deepEqual(rows.map((r) => r.tournamentName), ["Copa A", "Copa Z"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/functions && npm run build && node --test lib/organizer-wallet-view.test.js
```

Esperado: FAIL na compilação — `buildWalletViewRows` não existe.

- [ ] **Step 3: Implementar**

Em `functions/src/organizer-withdrawal.ts`, acrescentar a função pura:

```ts
/** Linhas do seletor de caixas: o mais cheio primeiro, empate pelo nome. */
export function buildWalletViewRows(
  tournaments: Array<{id: string; name: string}>,
  wallets: Map<string, {availableReais: number; pendingReais: number}>,
): Array<{
  tournamentId: string;
  tournamentName: string;
  availableReais: number;
  pendingReais: number;
}> {
  return tournaments
    .map((t) => ({
      tournamentId: t.id,
      tournamentName: t.name,
      availableReais: wallets.get(t.id)?.availableReais ?? 0,
      pendingReais: wallets.get(t.id)?.pendingReais ?? 0,
    }))
    .sort((a, b) =>
      b.availableReais - a.availableReais ||
      a.tournamentName.localeCompare(b.tournamentName, "pt-BR"),
    );
}
```

E reescrever o corpo de `loadOrganizerWalletView`:

```ts
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");

  const db = getFirestore();
  const payload = (request.data ?? {}) as {
    tournamentId?: string;
    ledgerLimit?: number;
  };
  const ledgerLimit = Math.min(
    500,
    Math.max(1, Math.trunc(Number(payload.ledgerLimit) || 30)),
  );

  const tournamentIds = await listWithdrawableTournamentIds(db, uid);
  if (tournamentIds.length === 0) {
    return {
      tournaments: [],
      selected: null,
      payout: {...(await loadPayoutPixKey(db, uid)), hasPixKey: false},
      ledger: [],
      withdrawals: [],
    };
  }

  const [tournamentSnaps, walletSnaps] = await Promise.all([
    db.getAll(...tournamentIds.map((id) => db.doc(`tournaments/${id}`))),
    db.getAll(...tournamentIds.map((id) => tournamentWalletRef(db, id))),
  ]);
  const wallets = new Map(
    walletSnaps.map((snap, i) => [
      tournamentIds[i]!,
      {
        availableReais: Number(snap.data()?.availableReais) || 0,
        pendingReais: Number(snap.data()?.pendingReais) || 0,
      },
    ]),
  );
  const rows = buildWalletViewRows(
    tournamentIds.map((id, i) => ({
      id,
      name: (tournamentSnaps[i]?.data()?.name as string | undefined)?.trim() || "Torneio",
    })),
    wallets,
  );

  // Pedido fora da lista cai no caixa mais cheio em vez de estourar: a lista
  // muda quando alguém sai da equipe e o cliente pode ter guardado a antiga.
  const requested = payload.tournamentId?.trim() ?? "";
  const selected = rows.find((r) => r.tournamentId === requested) ?? rows[0]!;

  const ledgerSnap = await tournamentWalletRef(db, selected.tournamentId)
    .collection("ledger")
    .orderBy("createdAt", "desc")
    .limit(ledgerLimit)
    .get()
    .catch(() => null);

  const withdrawalsSnap = await db
    .collection(ORGANIZER_WITHDRAWALS)
    .where("tournamentId", "==", selected.tournamentId)
    .orderBy("createdAt", "desc")
    .limit(20)
    .get()
    .catch(async (err) => {
      if (!isFirestoreIndexError(err)) return null;
      return db
        .collection(ORGANIZER_WITHDRAWALS)
        .where("tournamentId", "==", selected.tournamentId)
        .limit(20)
        .get();
    });

  const ledgerDocs = ledgerSnap?.docs ?? [];
  const athleteLabelByKey = await resolveLedgerAthleteLabels(db, ledgerDocs);
  const payout = await loadPayoutPixKey(db, uid);

  return {
    tournaments: rows,
    selected,
    payout: {...payout, hasPixKey: payout.pixKey.length >= 5},
    ledger: ledgerDocs.map((d) => {
      const e = d.data();
      const registrationId =
        typeof e.registrationId === "string" ? e.registrationId.trim() : "";
      const payerUid = typeof e.payerUid === "string" ? e.payerUid.trim() : "";
      return {
        id: d.id,
        netReais: Number(e.netReais) || 0,
        grossReais: Number(e.grossReais) || 0,
        platformFeeReais: Number(e.platformFeeReais) || 0,
        createdAt: (e.createdAt as Timestamp | undefined)?.toDate?.()?.toISOString() ?? null,
        athleteLabel:
          (registrationId && athleteLabelByKey.get(registrationId)) ||
          (payerUid && athleteLabelByKey.get(`payer:${payerUid}`)) ||
          "",
      };
    }),
    withdrawals: (withdrawalsSnap?.docs ?? []).map((d) => {
      const x = d.data();
      const requestedBy = (x.requestedBy as string | undefined)?.trim() ?? "";
      return {
        id: d.id,
        amountReais: Number(x.amountReais) || 0,
        status: (x.status as string | undefined) ?? "pending",
        // Chave de OUTRA pessoa nunca vai inteira para a tela: cada um só vê a
        // sua por extenso. `maskPixKey` do cliente não protege CPF (11 < 12).
        pixKey: requestedBy === uid ?
          ((x.pixKey as string | undefined) ?? "") :
          maskDelegatePayoutPixKey((x.pixKey as string | undefined) ?? ""),
        requestedBy,
        requestedByStaff: x.requestedByStaff === true,
        payoutStatus: (x.payoutStatus as string | undefined) ?? null,
        createdAt: (x.createdAt as Timestamp | undefined)?.toDate?.()?.toISOString() ?? null,
      };
    }),
  };
```

`maskDelegatePayoutPixKey` continua vindo de `./organizer-wallet-access` — é a
mesma máscara, e a lição de 10/09 (mascarar em TODAS as superfícies, o histórico
inclusive) vale igual aqui.

**Imports desta task** (de novo: import sem uso quebra o `tsc`):

- entram: `listWithdrawableTournamentIds` de `./tournament-wallet-access`;
  `tournamentWalletRef` de `./tournament-wallet`
- saem: `assertCanAccessOrganizerWallet` e `listAccessibleOrganizerIds` de
  `./organizer-wallet-access` — depois desta task ninguém mais os consome;
  `organizerWalletRef` de `./organizer-wallet` só sai se nenhum outro ponto do
  arquivo ainda o usar (conferir com `grep -n organizerWalletRef
  functions/src/organizer-withdrawal.ts` antes de remover)

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/functions && npm run build && node --test lib/organizer-wallet-view.test.js && npm run lint
```

Esperado: PASS (3 testes) e `tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add functions/src/organizer-withdrawal.ts functions/src/organizer-wallet-view.test.ts
git commit -m "feat(wallet): view do financeiro lista os caixas por torneio"
```

---

### Task 10: Rules do caixa e do perfil de repasse

**Files:**
- Modify: `firestore.rules` (bloco novo depois de `organizerWallets`, linha ~1119)
- Test: `functions/test/tournament-wallet.rules.test.mjs` (criar)

**Interfaces:**
- Consumes: helpers `isSuperAdmin`, `isAdmin`, `tournamentManagerId`,
  `isTournamentStaff` (já existem, `firestore.rules:93-100`).
- Produces: leitura de `tournamentWallets/{tid}` e `…/ledger/{id}` para dono,
  gestor ativo e admin da plataforma; leitura de `organizerPayoutProfiles/{uid}`
  só do próprio e admin; escrita negada nos dois.

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/test/tournament-wallet.rules.test.mjs` (padrão de
`functions/test/tournament-staff.rules.test.mjs`):

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-tournament-wallet-test';
const DONO = 'dono-uid';
const GESTOR = 'gestor-uid';
const ADMIN_EVENTO = 'admin-evento-uid';
const MESARIO = 'mesario-uid';
const ESTRANHO = 'estranho-uid';
const TORNEIO = 'copa-caixa';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', TORNEIO), { managerId: DONO, name: 'Copa Caixa' });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', GESTOR), { role: 'manager', status: 'active' });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', ADMIN_EVENTO), { role: 'eventAdmin', status: 'active' });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', MESARIO), { role: 'scorer', status: 'active' });
    await setDoc(doc(db, 'tournamentWallets', TORNEIO), {
      tournamentId: TORNEIO, ownerId: DONO, availableReais: 100, pendingReais: 0,
    });
    await setDoc(doc(db, 'tournamentWallets', TORNEIO, 'ledger', 'l1'), { netReais: 92 });
    await setDoc(doc(db, 'organizerPayoutProfiles', GESTOR), {
      payoutPixKey: 'gestor@exemplo.com', payoutPixKeyType: 'EMAIL',
    });
  });
});

after(async () => { await testEnv.cleanup(); });

const walletOf = (uid) => doc(testEnv.authenticatedContext(uid).firestore(), 'tournamentWallets', TORNEIO);

test('dono lê o caixa do torneio', async () => {
  await assertSucceeds(getDoc(walletOf(DONO)));
});

test('gestor da equipe lê o caixa', async () => {
  await assertSucceeds(getDoc(walletOf(GESTOR)));
});

test('administrador do evento NÃO lê o caixa', async () => {
  await assertFails(getDoc(walletOf(ADMIN_EVENTO)));
});

test('mesário não lê o caixa', async () => {
  await assertFails(getDoc(walletOf(MESARIO)));
});

test('estranho não lê o caixa', async () => {
  await assertFails(getDoc(walletOf(ESTRANHO)));
});

test('anônimo não lê o caixa', async () => {
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'tournamentWallets', TORNEIO)));
});

test('extrato segue a mesma regra do caixa', async () => {
  const ledgerPath = ['tournamentWallets', TORNEIO, 'ledger', 'l1'];
  await assertSucceeds(getDoc(doc(testEnv.authenticatedContext(GESTOR).firestore(), ...ledgerPath)));
  await assertFails(getDoc(doc(testEnv.authenticatedContext(ADMIN_EVENTO).firestore(), ...ledgerPath)));
});

test('ninguém escreve no caixa pelo cliente', async () => {
  await assertFails(setDoc(walletOf(DONO), { availableReais: 999 }, { merge: true }));
});

test('perfil de repasse é privado do dono', async () => {
  const db = (uid) => doc(testEnv.authenticatedContext(uid).firestore(), 'organizerPayoutProfiles', GESTOR);
  await assertSucceeds(getDoc(db(GESTOR)));
  await assertFails(getDoc(db(DONO)));
  await assertFails(setDoc(db(GESTOR), { payoutPixKey: 'outro@exemplo.com' }, { merge: true }));
});
```

Nomes de teste com acento seguem o padrão do repo. Ao copiar este bloco, rodar
`grep -nP "[^\x00-\x7F]" test/tournament-wallet.rules.test.mjs | grep -oP "[^\x00-\x7F]" | sort -u`
e conferir que só aparecem acentos latinos — texto colado carrega caractere
parecido de outro alfabeto sem avisar, e a string fica plausível na tela.

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/functions && npx firebase emulators:exec --only firestore --project nexago-tournament-wallet-test "node --test test/tournament-wallet.rules.test.mjs"
```

Esperado: FAIL — sem `match /tournamentWallets`, o catch-all nega tudo e os testes
de leitura do dono e do gestor falham.

- [ ] **Step 3: Implementar**

Em `firestore.rules`, logo depois do bloco `match /organizerWallets/{organizerId}`
(que termina na linha ~1119):

```
    // Caixa do torneio (id = tournamentId). Escrita só pelas Cloud Functions.
    // Leitura: dono do evento e GESTOR da equipe. `eventAdmin` (administrador)
    // opera o torneio mas não vê dinheiro — é esta linha que garante isso.
    match /tournamentWallets/{tournamentId} {
      allow read: if request.auth != null && (
        isSuperAdmin() ||
        isAdmin() ||
        tournamentManagerId(tournamentId) == request.auth.uid ||
        isTournamentStaff(tournamentId, ['manager'])
      );
      allow create, update, delete: if false;
      match /ledger/{entryId} {
        allow read: if request.auth != null && (
          isSuperAdmin() ||
          isAdmin() ||
          tournamentManagerId(tournamentId) == request.auth.uid ||
          isTournamentStaff(tournamentId, ['manager'])
        );
        allow create, update, delete: if false;
      }
    }
    // Chave PIX de repasse da pessoa. Escrita write-only por CF: admin semeando
    // destino de dinheiro é vetor de fraude (mesma regra de `organizerWallets`).
    match /organizerPayoutProfiles/{uid} {
      allow read: if request.auth != null && (
        isSuperAdmin() ||
        isAdmin() ||
        request.auth.uid == uid
      );
      allow create, update, delete: if false;
    }
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/functions && npx firebase emulators:exec --only firestore --project nexago-tournament-wallet-test "node --test test/tournament-wallet.rules.test.mjs"
```

Esperado: PASS (10 testes). Rodar também um rules test antigo para provar que o
arquivo não regrediu (`firestore.rules` é um arquivo só):

```bash
cd <worktree>/functions && npx firebase emulators:exec --only firestore --project nexago-tournament-staff-test "node --test test/tournament-staff.rules.test.mjs"
```

- [ ] **Step 5: Commit**

```bash
git add firestore.rules functions/test/tournament-wallet.rules.test.mjs
git commit -m "feat(rules): leitura do caixa do torneio e do perfil de repasse"
```

---

### Task 11: Rules do papel `eventAdmin`

**Files:**
- Modify: `firestore.rules:101-107` (`canManageTournament`), `:1963-1972` (`allow update` de tournaments), `:1990-1993` (validação de papel em `staff`)
- Test: `functions/test/tournament-event-admin.rules.test.mjs` (criar)

**Interfaces:**
- Consumes: os helpers existentes.
- Produces: `eventAdmin` passa a valer em `canManageTournament` e no `allow update`
  do torneio; segue fora do `allow delete`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `functions/test/tournament-event-admin.rules.test.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');

const PROJECT_ID = 'nexago-event-admin-test';
const DONO = 'dono-uid';
const ADMIN_EVENTO = 'admin-evento-uid';
const TORNEIO = 'copa-admin';

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules },
});

before(async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', TORNEIO), {
      managerId: DONO, name: 'Copa Admin', listingStatus: 'open',
    });
    await setDoc(doc(db, 'tournaments', TORNEIO, 'staff', ADMIN_EVENTO), {
      role: 'eventAdmin', status: 'active',
    });
  });
});

after(async () => { await testEnv.cleanup(); });

const asAdminEvento = () => testEnv.authenticatedContext(ADMIN_EVENTO).firestore();

test('administrador edita o torneio', async () => {
  await assertSucceeds(
    updateDoc(doc(asAdminEvento(), 'tournaments', TORNEIO), { name: 'Copa Admin 2026' }),
  );
});

test('administrador NÃO exclui o torneio', async () => {
  await assertFails(deleteDoc(doc(asAdminEvento(), 'tournaments', TORNEIO)));
});

test('administrador lê a equipe', async () => {
  await assertSucceeds(
    getDoc(doc(asAdminEvento(), 'tournaments', TORNEIO, 'staff', ADMIN_EVENTO)),
  );
});

test('administrador não se promove a gestor', async () => {
  await assertFails(
    setDoc(
      doc(asAdminEvento(), 'tournaments', TORNEIO, 'staff', ADMIN_EVENTO),
      { role: 'manager', status: 'active' },
    ),
  );
});

test('o dono cria staff com o papel novo', async () => {
  await assertSucceeds(
    setDoc(
      doc(testEnv.authenticatedContext(DONO).firestore(), 'tournaments', TORNEIO, 'staff', 'novo-uid'),
      { role: 'eventAdmin', status: 'active' },
    ),
  );
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/functions && npx firebase emulators:exec --only firestore --project nexago-event-admin-test "node --test test/tournament-event-admin.rules.test.mjs"
```

Esperado: FAIL — "administrador edita o torneio" e "lê a equipe" falham (o papel
não está em lista nenhuma) e "o dono cria staff com o papel novo" falha na
validação `role in ['manager', 'scorer']`.

- [ ] **Step 3: Implementar**

Em `firestore.rules`, três toques.

`canManageTournament` (linha ~101) — cobre os 9 usos operacionais de uma vez:

```
    function canManageTournament(tournamentId) {
      return request.auth != null && (
        isAdmin() ||
        isSuperAdmin() ||
        isTournamentOwner(tournamentId) ||
        isTournamentStaff(tournamentId, ['manager', 'eventAdmin'])
      );
    }
```

`allow update` de `tournaments` (linha ~1968) — trocar só a lista de papéis,
deixando o resto da regra intacto:

```
        isTournamentStaff(tournamentId, ['manager', 'eventAdmin']) ||
```

O `allow delete` (linha ~1981) **não muda**: segue `['manager']`.

Validação de papel na subcoleção `staff` (linha ~1992):

```
        allow create, update: if request.auth != null &&
          canManageTournamentStaff(tournamentId, staffUserId) &&
          request.resource.data.role in ['manager', 'eventAdmin', 'scorer'] &&
          request.resource.data.status == 'active';
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/functions && npx firebase emulators:exec --only firestore --project nexago-event-admin-test "node --test test/tournament-event-admin.rules.test.mjs"
```

Esperado: PASS (5 testes). Depois, provar que o caixa continua fechado para ele e
que nada regrediu:

```bash
cd <worktree>/functions && npx firebase emulators:exec --only firestore --project nexago-tournament-wallet-test "node --test test/tournament-wallet.rules.test.mjs"
cd <worktree>/functions && npx firebase emulators:exec --only firestore --project nexago-mesa-test "node --test test/mesa-scorer-point.rules.test.mjs"
```

- [ ] **Step 5: Commit**

```bash
git add firestore.rules functions/test/tournament-event-admin.rules.test.mjs
git commit -m "feat(rules): administrador do evento opera sem alcancar dinheiro"
```

---

### Task 12: Torneio com saldo não pode ser excluído

**Files:**
- Modify: `firestore.rules:1975-1982` (`allow delete` de tournaments)
- Test: `functions/test/tournament-event-admin.rules.test.mjs` (acrescentar)

**Interfaces:**
- Consumes: `tournamentWallets/{tournamentId}` (Task 10).
- Produces: helper `tournamentHasWalletBalance(tournamentId)` nas rules.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar em `functions/test/tournament-event-admin.rules.test.mjs`:

```js
const COM_SALDO = 'copa-com-saldo';
const SEM_SALDO = 'copa-sem-saldo';

test('torneio com saldo no caixa não pode ser excluído', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', COM_SALDO), { managerId: DONO, name: 'Com saldo' });
    await setDoc(doc(db, 'tournamentWallets', COM_SALDO), {
      tournamentId: COM_SALDO, availableReais: 42, pendingReais: 0,
    });
  });
  await assertFails(
    deleteDoc(doc(testEnv.authenticatedContext(DONO).firestore(), 'tournaments', COM_SALDO)),
  );
});

test('saque pendente também tranca a exclusão', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', 'copa-pendente'), { managerId: DONO, name: 'Pendente' });
    await setDoc(doc(db, 'tournamentWallets', 'copa-pendente'), {
      tournamentId: 'copa-pendente', availableReais: 0, pendingReais: 30,
    });
  });
  await assertFails(
    deleteDoc(doc(testEnv.authenticatedContext(DONO).firestore(), 'tournaments', 'copa-pendente')),
  );
});

test('torneio com caixa zerado o dono exclui', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tournaments', SEM_SALDO), { managerId: DONO, name: 'Sem saldo' });
    await setDoc(doc(db, 'tournamentWallets', SEM_SALDO), {
      tournamentId: SEM_SALDO, availableReais: 0, pendingReais: 0,
    });
  });
  await assertSucceeds(
    deleteDoc(doc(testEnv.authenticatedContext(DONO).firestore(), 'tournaments', SEM_SALDO)),
  );
});

test('torneio que nunca teve caixa o dono exclui', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'tournaments', 'copa-sem-caixa'), {
      managerId: DONO, name: 'Sem caixa',
    });
  });
  await assertSucceeds(
    deleteDoc(doc(testEnv.authenticatedContext(DONO).firestore(), 'tournaments', 'copa-sem-caixa')),
  );
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd <worktree>/functions && npx firebase emulators:exec --only firestore --project nexago-event-admin-test "node --test test/tournament-event-admin.rules.test.mjs"
```

Esperado: FAIL nos dois primeiros — hoje o dono exclui mesmo com dinheiro dentro.

- [ ] **Step 3: Implementar**

Em `firestore.rules`, acrescentar o helper junto dos outros de torneio (perto da
linha 101) e usá-lo no `allow delete`:

```
    /** Caixa do torneio com dinheiro dentro — excluir o evento sumiria com ele.
     *  Doc ausente conta como zerado (torneio que nunca recebeu pagamento). */
    function tournamentHasWalletBalance(tournamentId) {
      return exists(/databases/$(database)/documents/tournamentWallets/$(tournamentId)) && (
        get(/databases/$(database)/documents/tournamentWallets/$(tournamentId)).data.availableReais > 0 ||
        get(/databases/$(database)/documents/tournamentWallets/$(tournamentId)).data.pendingReais > 0
      );
    }
```

```
      // Deletar: nunca o mesário nem o administrador — e nunca com dinheiro no
      // caixa (o saldo tem de ser sacado antes, senão evapora com o evento).
      allow delete: if request.auth != null &&
        !tournamentHasWalletBalance(tournamentId) && (
          isAdmin() ||
          isSuperAdmin() ||
          (isTournamentOrganizer() && organizerCanUpdateOwnTournament()) ||
          resource.data.managerId == request.auth.uid ||
          isTournamentStaff(tournamentId, ['manager'])
        );
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd <worktree>/functions && npx firebase emulators:exec --only firestore --project nexago-event-admin-test "node --test test/tournament-event-admin.rules.test.mjs"
```

Esperado: PASS (9 testes).

Depois, conferir o orçamento de expressões: o arquivo já bateu no teto de 1000
antes, e quem reclama é o deploy. Com os dois rules tests novos verdes, deployar
as rules no dev — é o único jeito de saber, e rules do dev não afetam produção:

```bash
cd <worktree> && npx firebase deploy --only firestore:rules --project volley-track-dev-4596c
```

Esperado: "Deploy complete". O teto que pode estourar é o de **expressões do
arquivo** (1000), não o de leituras: acesso repetido ao mesmo documento numa
avaliação é cacheado, e é por isso que `isTournamentStaff` (`:93`) já chama
`get()` duas vezes no mesmo caminho sem problema. Se estourar, a saída é
simplificar condições existentes — não remover o teste que acabou de ficar
verde.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules functions/test/tournament-event-admin.rules.test.mjs
git commit -m "feat(rules): torneio com saldo no caixa nao pode ser excluido"
```

---

### Task 13: Migração e backfill

**Files:**
- Create: `functions/scripts/migrate-organizer-wallets-to-tournaments.js`
- Test: rodar no dev, em dry-run, e comparar com os números medidos

**Interfaces:**
- Consumes: `organizerWallets/{uid}` + `ledger`, `artifacts/{projectId}/public/data/inscriptions/{id}`,
  `tournaments/{id}/staff/{uid}`.
- Produces: `tournamentWallets/{tournamentId}` (+ `ledger`),
  `organizerPayoutProfiles/{uid}`, campo `role` preenchido nos docs de staff.

- [ ] **Step 1: Escrever o script**

Criar `functions/scripts/migrate-organizer-wallets-to-tournaments.js`, no padrão
de `scripts/set-min-app-version.js` (dry-run por padrão, `--yes` aplica):

```js
/* eslint-disable */
/**
 * Move o saldo de `organizerWallets/{uid}` para `tournamentWallets/{tournamentId}`.
 *
 * O extrato de cada carteira tem `registrationId`, e a inscrição sabe o torneio —
 * é por aí que se reconstrói a que evento cada real pertence. Crédito que não
 * puder ser atribuído NÃO é movido nem apagado: sai no relatório para decisão
 * manual.
 *
 * Também: copia a chave PIX de repasse para `organizerPayoutProfiles/{uid}` e
 * preenche `role: 'manager'` nos docs de staff sem o campo (as rules exigem o
 * papel explícito; o backend trata ausente como gestor, e essa divergência
 * deixaria alguém sacando sem conseguir ver).
 *
 * Pré-requisitos:
 *   gcloud auth application-default login
 *
 * Uso (na pasta functions/):
 *   node scripts/migrate-organizer-wallets-to-tournaments.js --project volley-track-dev-4596c
 *   node scripts/migrate-organizer-wallets-to-tournaments.js --project volley-track-dev-4596c --yes
 */
const admin = require("firebase-admin");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ?
    process.argv[i + 1] :
    fallback;
}
const APPLY = process.argv.includes("--yes");
const PROJECT = arg("project");
if (!PROJECT) {
  console.error("Informe --project <projectId>");
  process.exit(1);
}

admin.initializeApp({projectId: PROJECT});
const db = admin.firestore();
const BRL = (v) => `R$ ${Number(v || 0).toFixed(2)}`;

async function tournamentOfRegistration(registrationId, cache) {
  if (!registrationId) return "";
  if (cache.has(registrationId)) return cache.get(registrationId);
  const snap = await db
    .doc(`artifacts/${PROJECT}/public/data/inscriptions/${registrationId}`)
    .get();
  const tournamentId = (snap.data()?.tournamentId || "").trim();
  cache.set(registrationId, tournamentId);
  return tournamentId;
}

async function main() {
  console.log(`\nProjeto: ${PROJECT}  |  modo: ${APPLY ? "APLICAR" : "DRY-RUN"}\n`);
  const wallets = await db.collection("organizerWallets").get();
  const cache = new Map();
  let totalMovido = 0;
  let totalOrfao = 0;

  for (const walletDoc of wallets.docs) {
    const uid = walletDoc.id;
    const w = walletDoc.data();
    const available = Number(w.availableReais) || 0;
    const pending = Number(w.pendingReais) || 0;
    console.log(`\ncarteira ${uid}: disp=${BRL(available)} pend=${BRL(pending)}`);

    if (pending > 0) {
      console.log("  ATENÇÃO: saque pendente nesta carteira — resolver antes de migrar");
    }

    const ledger = await walletDoc.ref.collection("ledger").get();
    const porTorneio = new Map();
    let semTorneio = 0;
    for (const entry of ledger.docs) {
      const e = entry.data();
      const net = Number(e.netReais) || 0;
      const tournamentId = await tournamentOfRegistration(e.registrationId, cache);
      if (!tournamentId) {
        semTorneio += net;
        continue;
      }
      const acc = porTorneio.get(tournamentId) || {net: 0, entries: []};
      acc.net += net;
      acc.entries.push({id: entry.id, data: e});
      porTorneio.set(tournamentId, acc);
    }

    const creditadoTotal = [...porTorneio.values()].reduce((s, a) => s + a.net, 0) + semTorneio;
    const jaSacado = Math.max(0, creditadoTotal - available - pending);
    console.log(`  extrato: ${ledger.size} linhas | creditado=${BRL(creditadoTotal)} | já sacado=${BRL(jaSacado)}`);

    // Rateia o saldo vivo na proporção do que cada torneio creditou: o extrato
    // não registra de qual evento saiu cada saque, então proporção é o mais
    // defensável — e o relatório mostra a conta para conferência.
    for (const [tournamentId, acc] of porTorneio) {
      const fatia = creditadoTotal > 0 ?
        Math.round((available * (acc.net / creditadoTotal)) * 100) / 100 :
        0;
      const tSnap = await db.doc(`tournaments/${tournamentId}`).get();
      const nome = (tSnap.data()?.name || "(torneio apagado)").trim();
      const ownerId = (tSnap.data()?.managerId || uid).trim();
      console.log(`  → ${tournamentId} "${nome}": creditou ${BRL(acc.net)}, leva ${BRL(fatia)}`);
      totalMovido += fatia;
      if (!APPLY) continue;

      await db.doc(`tournamentWallets/${tournamentId}`).set({
        tournamentId,
        ownerId,
        availableReais: admin.firestore.FieldValue.increment(fatia),
        pendingReais: 0,
        migratedFromOrganizerWallet: uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      for (const {id, data} of acc.entries) {
        await db.doc(`tournamentWallets/${tournamentId}/ledger/${id}`).set({
          ...data, migratedFrom: `organizerWallets/${uid}/ledger/${id}`,
        }, {merge: true});
      }
    }

    if (semTorneio > 0) {
      totalOrfao += semTorneio;
      console.log(`  ÓRFÃO: ${BRL(semTorneio)} sem inscrição resolvível — fica na carteira antiga`);
    }

    const pixKey = (w.payoutPixKey || "").trim();
    if (pixKey) {
      console.log(`  chave PIX → organizerPayoutProfiles/${uid}`);
      if (APPLY) {
        await db.doc(`organizerPayoutProfiles/${uid}`).set({
          payoutPixKey: pixKey,
          payoutPixKeyType: (w.payoutPixKeyType || "").trim(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
      }
    }

    if (APPLY && available > 0) {
      // Zera a carteira antiga só depois de distribuir: o doc fica como
      // histórico, com o rastro de para onde o dinheiro foi.
      await walletDoc.ref.set({
        availableReais: 0,
        migratedToTournamentWalletsAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
    }
  }

  // Backfill do papel: as rules exigem `role` explícito.
  const staff = await db.collectionGroup("staff").get();
  const semRole = staff.docs.filter((d) => !d.data().role);
  console.log(`\nstaff sem campo role: ${semRole.length}`);
  for (const d of semRole) {
    console.log(`  → ${d.ref.path} = manager`);
    if (APPLY) await d.ref.set({role: "manager"}, {merge: true});
  }

  console.log(`\nRESUMO: movido ${BRL(totalMovido)} | órfão ${BRL(totalOrfao)} | staff corrigido ${semRole.length}`);
  if (!APPLY) console.log("DRY-RUN — nada foi gravado. Rode de novo com --yes para aplicar.\n");
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Rodar em dry-run no dev e conferir contra o medido**

```bash
cd <worktree>/functions && node scripts/migrate-organizer-wallets-to-tournaments.js --project volley-track-dev-4596c
```

Esperado: 3 carteiras, uma com R$ 571,03; 50 linhas de extrato no total; nenhum
saque pendente. O resumo tem de fechar: `movido + órfão ≈ R$ 571,03`. Se não
fechar, **parar** e investigar antes de aplicar — o rateio proporcional é a única
parte do plano que envolve dinheiro sem rastro exato.

- [ ] **Step 3: Aplicar no dev**

```bash
cd <worktree>/functions && node scripts/migrate-organizer-wallets-to-tournaments.js --project volley-track-dev-4596c --yes
```

- [ ] **Step 4: Conferir o resultado**

```bash
cd <worktree>/functions && node -e "
const a=require('firebase-admin');a.initializeApp({projectId:'volley-track-dev-4596c'});
const db=a.firestore();(async()=>{
 const t=await db.collection('tournamentWallets').get();
 let s=0;for(const d of t.docs){const v=Number(d.data().availableReais)||0;s+=v;console.log(d.id,v);}
 console.log('total nos caixas:',s.toFixed(2));
 const o=await db.collection('organizerWallets').get();
 for(const d of o.docs)console.log('antiga',d.id,Number(d.data().availableReais)||0);
})();"
```

Esperado: a soma dos caixas igual ao que o relatório disse ter movido, e as
carteiras antigas zeradas (menos o órfão, se houver).

- [ ] **Step 5: Commit**

```bash
git add functions/scripts/migrate-organizer-wallets-to-tournaments.js
git commit -m "chore(wallet): script de migracao do caixa para os torneios"
```

---

## Deploy desta fase (dev)

Depois das 13 tarefas, com toda a suíte verde:

```bash
cd <worktree>/functions && npm test
cd <worktree> && npx firebase deploy --only firestore:rules --project volley-track-dev-4596c
cd <worktree>/functions && npx firebase deploy --only functions:requestOrganizerWithdrawal,functions:loadOrganizerWalletView,functions:setOrganizerPayoutPixKey,functions:reviewOrganizerWithdrawal,functions:asaasTournamentRegistrationWebhook,functions:onTournamentStaffWrittenSyncMirror --project volley-track-dev-4596c --force
```

Exigir a linha **"Successful update"** para cada função: um "No changes detected"
depois de falha parcial mente, porque o hash é do pacote, não da função. Conferir
depois que cada uma existe nas duas regiões (`southamerica-east1` e `us-central1`):

```bash
cd <worktree>/functions && npx firebase functions:list --project volley-track-dev-4596c | grep -E "requestOrganizerWithdrawal|loadOrganizerWalletView"
```

A migração (Task 13) roda **depois** do deploy das functions, senão o crédito novo
ainda cai na carteira antiga durante a janela. Produção fica intocada até o dono
decidir, e depois da Fase 2 estar publicada.
