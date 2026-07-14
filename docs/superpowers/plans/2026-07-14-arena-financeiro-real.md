# Financeiro do painel da arena — dados reais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the arena panel's Financeiro and Relatórios screens (`frontend/projects/arena`) to real Firestore data — wallet balance, wallet ledger, withdrawals, and a real PIX withdrawal flow — replacing the hardcoded mock arrays, with zero new Cloud Functions and zero new Firestore indexes.

**Architecture:** A new `finance.model.ts` (types/constants), two pure/tested logic files (`finance-movements.ts`, `finance-csv.ts`), and one untested I/O repository (`finance-repository.ts`, mirroring `arena_wallet_repository.dart` and `arena_dashboard_service.dart` from the Flutter app) sit under `src/app/painel/finance/`. The two existing screen components (`panel-finance.component.ts`, `panel-finance-reports.component.ts`) are rewritten to consume them via `ArenaContextService`, following the exact loading/error pattern already used in `panel-stock.component.ts`.

**Tech Stack:** Angular 20 (standalone components, signals), `firebase/firestore` + `firebase/functions` (raw SDK, no `@angular/fire`), Karma/Jasmine (existing test builder, currently used by exactly one spec file in this project).

## Global Constraints

- No `standalone: true` in `@Component` decorators (it's the default) — matches project CLAUDE.md.
- Use `input()`/`output()` functions, not decorators — n/a here (no new `@Input`/`@Output`, existing components already follow this).
- `ChangeDetectionStrategy.OnPush` on every component — both rewritten components already have it; keep it.
- No `ngClass`/`ngStyle` — use `class`/`style` bindings (already the case in the existing templates being modified).
- Follow the established codebase convention over generic framework advice: **plain writable signals bound via `[value]`/`(input)="signal.set($any($event.target).value)"`**, not Reactive Forms and not `ngModel` — this project's own form components (`panel-court-form.component.ts`) never adopted Reactive Forms despite the top-level CLAUDE.md preference, and this plan follows the actual codebase, not the generic doc.
- No Cloud Function changes, no `firestore.rules` changes, no `firestore.indexes.json` changes — every query in this plan uses permissions/indexes that already exist (verified during brainstorming, see spec `Decisões`).
- CSV only for export — no PDF (explicit product decision, see spec).

---

### Task 1: `finance.model.ts` — types, constants, formatting helpers

**Files:**
- Create: `frontend/projects/arena/src/app/painel/finance/finance.model.ts`

**Interfaces:**
- Produces: `ARENA_BOOKING_FEE_PERCENT`, `formatBRL`, `roundMoney`, `ArenaWalletSummary`, `ARENA_WALLET_SUMMARY_EMPTY`, `FinanceBookingRef`, `ArenaLedgerEntry`, `ArenaWithdrawalStatus`, `ArenaWithdrawalItem`, `FinanceMovementStatus`, `FinanceMovementType`, `FinanceMovement`, `CourtRevenueRow`, `FinancePendingSummary`, `CourtRevenueResult`, `COURT_REVENUE_EMPTY`, `ArenaWithdrawalRequestResult` — every later task imports from this file, nothing else.

This file has no logic worth unit-testing on its own (pure type/constant declarations + two one-line formatters already proven elsewhere in the codebase in the same shape) — no test file for this task, consistent with how `court.model.ts`/`product.model.ts` (sibling model files) have no spec either.

- [ ] **Step 1: Write the file**

```typescript
/** Espelha `functions/src/platform-fees.ts` — taxa sobre reservas no plano gratuito (%). */
export const ARENA_BOOKING_FEE_PERCENT = 5;

export function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `arenaWallets/{arenaId}`. */
export interface ArenaWalletSummary {
  availableReais: number;
  pendingReais: number;
}

export const ARENA_WALLET_SUMMARY_EMPTY: ArenaWalletSummary = { availableReais: 0, pendingReais: 0 };

/** Dados da reserva (`arenaBookings/{bookingId}`) usados só pra enriquecer a exibição de um
 *  lançamento do ledger — não há campo de esporte na reserva, e o nome do atleta exigiria uma
 *  segunda consulta em `users/{athleteId}` só pra exibição, então fica de fora. */
export interface FinanceBookingRef {
  courtName: string;
  customerLabel: string;
}

/** `arenaWallets/{arenaId}/ledger/{entryId}` — só lançamentos `type: 'credit'` existem hoje
 *  (`functions/src/arena-wallet.ts`). */
export interface ArenaLedgerEntry {
  id: string;
  bookingId: string | null;
  grossReais: number;
  netReais: number;
  platformFeeReais: number;
  createdAt: Date | null;
  booking: FinanceBookingRef | null;
}

export type ArenaWithdrawalStatus = 'pending' | 'approved' | 'rejected';

/** `arenaWithdrawals/{withdrawalId}`. */
export interface ArenaWithdrawalItem {
  id: string;
  amountReais: number;
  status: ArenaWithdrawalStatus;
  pixKey: string;
  createdAt: Date | null;
}

export type FinanceMovementStatus = 'ok' | 'pend' | 'fail';
export type FinanceMovementType = 'credit' | 'debit';

/** Linha unificada da lista "Movimentações" — junta ledger (créditos) e saques (débitos). */
export interface FinanceMovement {
  id: string;
  type: FinanceMovementType;
  amountReais: number;
  platformFeeReais: number;
  label: string;
  sub: string;
  dateLabel: string;
  createdAt: Date | null;
  status: FinanceMovementStatus;
}

export interface CourtRevenueRow {
  courtId: string;
  courtName: string;
  totalReais: number;
}

export interface FinancePendingSummary {
  count: number;
  totalReais: number;
}

export interface CourtRevenueResult {
  courtRows: CourtRevenueRow[];
  last7Days: { label: string; value: number }[];
  pending: FinancePendingSummary;
}

/** Valor inicial do signal de agregação, antes do primeiro carregamento — 7 dias vazios pra
 *  não deixar o gráfico sem pontos. */
export const COURT_REVENUE_EMPTY: CourtRevenueResult = {
  courtRows: [],
  last7Days: Array.from({ length: 7 }, () => ({ label: '', value: 0 })),
  pending: { count: 0, totalReais: 0 },
};

export interface ArenaWithdrawalRequestResult {
  withdrawalId: string;
  status: string;
  autoProcessed: boolean;
  message: string | null;
}
```

- [ ] **Step 2: Verify it compiles in isolation**

Run: `npm --prefix frontend exec tsc -- --noEmit --strict --module esnext --moduleResolution bundler --target es2022 --skipLibCheck projects/arena/src/app/painel/finance/finance.model.ts`
Expected: no output (success). This is just a syntax/type sanity check before other files import from it — the full type-check happens in Task 7's `ng build`.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/finance/finance.model.ts
git commit -m "feat(arena): tipos e constantes reais para o Financeiro do painel"
```

---

### Task 2: `finance-movements.ts` — merge, filtro por período e agregação diária (TDD)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/finance/finance-movements.ts`
- Test: `frontend/projects/arena/src/app/painel/finance/finance-movements.spec.ts`

**Interfaces:**
- Consumes: `ArenaLedgerEntry`, `ArenaWithdrawalItem`, `FinanceMovement`, `FinanceMovementStatus` (Task 1); `formatMovementDate` from `../stock/product.model.ts` (existing, reused as-is — do not write a second date formatter).
- Produces: `movementStatusLabel(movement)`, `mergeFinanceMovements(ledger, withdrawals)`, `type FinancePeriodKey`, `periodRange(period, now?)`, `filterMovementsByPeriod(movements, period, now?)`, `interface DailyTotal`, `buildDailyTotals(movements, days?, now?)` — Tasks 5 and 6 import these.

- [ ] **Step 1: Write the failing tests**

```typescript
import { formatMovementDate } from '../stock/product.model';
import { buildDailyTotals, filterMovementsByPeriod, mergeFinanceMovements, movementStatusLabel, periodRange } from './finance-movements';
import type { ArenaLedgerEntry, ArenaWithdrawalItem, FinanceMovement } from './finance.model';

describe('mergeFinanceMovements', () => {
  const ledgerEntry: ArenaLedgerEntry = {
    id: 'l1',
    bookingId: 'b1',
    grossReais: 100,
    netReais: 95,
    platformFeeReais: 5,
    createdAt: new Date('2026-07-14T09:00:00'),
    booking: { courtName: 'Quadra 1', customerLabel: 'João S.' },
  };

  const withdrawal: ArenaWithdrawalItem = {
    id: 'w1',
    amountReais: 150,
    status: 'pending',
    pixKey: '9b1213f1-3790-4a11-9c00-abcde',
    createdAt: new Date('2026-07-13T14:00:00'),
  };

  it('sorts credits and debits together by date, newest first', () => {
    const result = mergeFinanceMovements([ledgerEntry], [withdrawal]);
    expect(result.map((m) => m.id)).toEqual(['ledger_l1', 'withdrawal_w1']);
  });

  it('labels a credit with the court name and net amount', () => {
    const [credit] = mergeFinanceMovements([ledgerEntry], []);
    expect(credit!.label).toBe('Reserva · Quadra 1');
    expect(credit!.sub).toBe('João S.');
    expect(credit!.amountReais).toBe(95);
    expect(credit!.platformFeeReais).toBe(5);
    expect(credit!.type).toBe('credit');
    expect(credit!.status).toBe('ok');
    expect(credit!.dateLabel).toBe(formatMovementDate(ledgerEntry.createdAt ?? undefined));
  });

  it('falls back to a generic label when the booking is missing', () => {
    const orphan: ArenaLedgerEntry = { ...ledgerEntry, booking: null };
    const [credit] = mergeFinanceMovements([orphan], []);
    expect(credit!.label).toBe('Reserva');
    expect(credit!.sub).toBe('Detalhe indisponível');
  });

  it('maps withdrawal status to movement status and masks the PIX key', () => {
    const [debit] = mergeFinanceMovements([], [withdrawal]);
    expect(debit!.status).toBe('pend');
    expect(debit!.label).toBe('Saque PIX');
    expect(debit!.type).toBe('debit');
    expect(debit!.platformFeeReais).toBe(0);
    expect(debit!.sub).toBe('9b1213f1…');
  });
});

describe('movementStatusLabel', () => {
  it('distinguishes "Recebido" (credit) from "Enviado" (debit) for the same ok status', () => {
    expect(movementStatusLabel({ type: 'credit', status: 'ok' })).toBe('Recebido');
    expect(movementStatusLabel({ type: 'debit', status: 'ok' })).toBe('Enviado');
  });

  it('uses a shared label for pending/failed regardless of type', () => {
    expect(movementStatusLabel({ type: 'credit', status: 'pend' })).toBe('Pendente');
    expect(movementStatusLabel({ type: 'debit', status: 'fail' })).toBe('Falhou');
  });
});

describe('periodRange', () => {
  const now = new Date('2026-07-14T15:00:00');

  it('covers the last 7 days including today for "7d"', () => {
    const { start, end } = periodRange('7d', now);
    expect(start).toEqual(new Date(2026, 6, 8));
    expect(end.getDate()).toBe(14);
  });

  it('covers month-to-date for "month"', () => {
    const { start } = periodRange('month', now);
    expect(start).toEqual(new Date(2026, 6, 1));
  });

  it('covers the whole previous calendar month for "lastMonth"', () => {
    const { start, end } = periodRange('lastMonth', now);
    expect(start).toEqual(new Date(2026, 5, 1));
    expect(end.getMonth()).toBe(5);
    expect(end.getDate()).toBe(30);
  });
});

describe('filterMovementsByPeriod', () => {
  const now = new Date('2026-07-14T15:00:00');
  const inRange: FinanceMovement = {
    id: 'a',
    type: 'credit',
    amountReais: 50,
    platformFeeReais: 2.5,
    label: 'Reserva',
    sub: '',
    dateLabel: '',
    createdAt: new Date('2026-07-10T10:00:00'),
    status: 'ok',
  };
  const outOfRange: FinanceMovement = { ...inRange, id: 'b', createdAt: new Date('2026-05-01T10:00:00') };

  it('keeps only movements inside the period', () => {
    const result = filterMovementsByPeriod([inRange, outOfRange], '30d', now);
    expect(result.map((m) => m.id)).toEqual(['a']);
  });
});

describe('buildDailyTotals', () => {
  const now = new Date('2026-07-14T15:00:00');
  const credit: FinanceMovement = {
    id: 'a',
    type: 'credit',
    amountReais: 60,
    platformFeeReais: 3,
    label: '',
    sub: '',
    dateLabel: '',
    createdAt: new Date('2026-07-14T09:00:00'),
    status: 'ok',
  };
  const debit: FinanceMovement = { ...credit, id: 'b', type: 'debit' };

  it('returns exactly `days` buckets', () => {
    expect(buildDailyTotals([], 7, now).length).toBe(7);
  });

  it('adds credit amounts to the matching day bucket (today = last bucket) and ignores debits', () => {
    const result = buildDailyTotals([credit, debit], 7, now);
    expect(result[6]!.revenue).toBe(60);
    expect(result[6]!.reservations).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `(cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/finance-movements.spec.ts')`
Expected: FAIL — `Cannot find module './finance-movements'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
import { formatMovementDate } from '../stock/product.model';
import type { ArenaLedgerEntry, ArenaWithdrawalItem, FinanceMovement, FinanceMovementStatus } from './finance.model';

function maskPixKey(pixKey: string): string {
  if (!pixKey) return 'Chave PIX';
  return pixKey.length <= 8 ? pixKey : `${pixKey.slice(0, 8)}…`;
}

const WITHDRAWAL_STATUS_TO_MOVEMENT: Record<ArenaWithdrawalItem['status'], FinanceMovementStatus> = {
  pending: 'pend',
  approved: 'ok',
  rejected: 'fail',
};

/** Rótulo de status para exibição — "Recebido"/"Enviado" dependem do tipo mesmo quando o
 *  status bruto ("ok") é o mesmo, "Pendente"/"Falhou" não. */
export function movementStatusLabel(movement: Pick<FinanceMovement, 'type' | 'status'>): string {
  if (movement.status === 'pend') return 'Pendente';
  if (movement.status === 'fail') return 'Falhou';
  return movement.type === 'credit' ? 'Recebido' : 'Enviado';
}

/** Junta créditos (ledger) e saques (withdrawals) numa lista única, ordenada por data desc.
 *  Pura — sem Firestore — pra poder testar merge/ordenação isoladamente. */
export function mergeFinanceMovements(ledger: readonly ArenaLedgerEntry[], withdrawals: readonly ArenaWithdrawalItem[]): FinanceMovement[] {
  const credits: FinanceMovement[] = ledger.map((entry) => ({
    id: `ledger_${entry.id}`,
    type: 'credit',
    amountReais: entry.netReais,
    platformFeeReais: entry.platformFeeReais,
    label: entry.booking ? `Reserva · ${entry.booking.courtName}` : 'Reserva',
    sub: entry.booking?.customerLabel ?? 'Detalhe indisponível',
    dateLabel: formatMovementDate(entry.createdAt ?? undefined),
    createdAt: entry.createdAt,
    status: 'ok',
  }));

  const debits: FinanceMovement[] = withdrawals.map((w) => ({
    id: `withdrawal_${w.id}`,
    type: 'debit',
    amountReais: w.amountReais,
    platformFeeReais: 0,
    label: 'Saque PIX',
    sub: maskPixKey(w.pixKey),
    dateLabel: formatMovementDate(w.createdAt ?? undefined),
    createdAt: w.createdAt,
    status: WITHDRAWAL_STATUS_TO_MOVEMENT[w.status],
  }));

  return [...credits, ...debits].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

export type FinancePeriodKey = '7d' | '30d' | 'month' | 'lastMonth';

/** Início/fim (inclusive) de cada período suportado nos Relatórios — puro, testável isoladamente. */
export function periodRange(period: FinancePeriodKey, now: Date = new Date()): { start: Date; end: Date } {
  const dateOnly = (y: number, m: number, d: number) => new Date(y, m, d);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  switch (period) {
    case '7d':
      return { start: dateOnly(now.getFullYear(), now.getMonth(), now.getDate() - 6), end: endOfToday };
    case '30d':
      return { start: dateOnly(now.getFullYear(), now.getMonth(), now.getDate() - 29), end: endOfToday };
    case 'month':
      return { start: dateOnly(now.getFullYear(), now.getMonth(), 1), end: endOfToday };
    case 'lastMonth':
      return {
        start: dateOnly(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
  }
}

export function filterMovementsByPeriod(
  movements: readonly FinanceMovement[],
  period: FinancePeriodKey,
  now: Date = new Date(),
): FinanceMovement[] {
  const { start, end } = periodRange(period, now);
  return movements.filter((m) => m.createdAt != null && m.createdAt >= start && m.createdAt <= end);
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export interface DailyTotal {
  label: string;
  revenue: number;
  reservations: number;
}

/** Agrupa movimentações de crédito por dia, últimos `days` dias (hoje incluído no último
 *  bucket) — usado no gráfico de faturamento, sempre "últimos N dias" independente do
 *  filtro de período escolhido (mesmo comportamento do protótipo original). */
export function buildDailyTotals(movements: readonly FinanceMovement[], days = 7, now: Date = new Date()): DailyTotal[] {
  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const buckets = new Map<string, DailyTotal>();
  const order: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = keyOf(d);
    order.push(key);
    buckets.set(key, { label: WEEKDAY_LABELS[d.getDay()]!, revenue: 0, reservations: 0 });
  }
  for (const m of movements) {
    if (m.type !== 'credit' || m.createdAt == null) continue;
    const bucket = buckets.get(keyOf(m.createdAt));
    if (!bucket) continue;
    bucket.revenue += m.amountReais;
    bucket.reservations += 1;
  }
  return order.map((key) => buckets.get(key)!);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `(cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/finance-movements.spec.ts')`
Expected: PASS (13 specs).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/finance/finance-movements.ts frontend/projects/arena/src/app/painel/finance/finance-movements.spec.ts
git commit -m "feat(arena): merge de movimentações, filtro por período e agregação diária (Financeiro)"
```

---

### Task 3: `finance-csv.ts` — export de extrato em CSV (TDD)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/finance/finance-csv.ts`
- Test: `frontend/projects/arena/src/app/painel/finance/finance-csv.spec.ts`

**Interfaces:**
- Consumes: `FinanceMovement` (Task 1).
- Produces: `buildMovementsCsv(movements)` (pure, tested), `downloadCsv(filename, csv)` (side-effecting, not tested) — both used by Tasks 5 and 6.

- [ ] **Step 1: Write the failing tests**

```typescript
import { buildMovementsCsv } from './finance-csv';
import type { FinanceMovement } from './finance.model';

describe('buildMovementsCsv', () => {
  it('writes the header row', () => {
    expect(buildMovementsCsv([])).toBe('Data;Tipo;Descrição;Detalhe;Status;Valor (R$)');
  });

  it('writes one semicolon-delimited row per movement, with comma as decimal separator', () => {
    const movement: FinanceMovement = {
      id: 'ledger_l1',
      type: 'credit',
      amountReais: 95.5,
      platformFeeReais: 5,
      label: 'Reserva · Quadra 1',
      sub: 'João S.',
      dateLabel: 'Hoje, 09:12',
      createdAt: new Date('2026-07-14T09:12:00'),
      status: 'ok',
    };
    const lines = buildMovementsCsv([movement]).split('\n');
    expect(lines[1]).toBe('Hoje, 09:12;Recebimento;Reserva · Quadra 1;João S.;Concluído;95,50');
  });

  it('quotes a field that contains the delimiter', () => {
    const movement: FinanceMovement = {
      id: 'withdrawal_w1',
      type: 'debit',
      amountReais: 150,
      platformFeeReais: 0,
      label: 'Saque PIX',
      sub: 'chave; com ponto e vírgula',
      dateLabel: 'Ontem, 14:00',
      createdAt: new Date('2026-07-13T14:00:00'),
      status: 'pend',
    };
    const lines = buildMovementsCsv([movement]).split('\n');
    expect(lines[1]).toContain('"chave; com ponto e vírgula"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `(cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/finance-csv.spec.ts')`
Expected: FAIL — `Cannot find module './finance-csv'`.

- [ ] **Step 3: Write the implementation**

```typescript
import type { FinanceMovement } from './finance.model';

const CSV_DELIMITER = ';'; // pt-BR usa vírgula como separador decimal — ; evita conflito ao abrir no Excel.
const CSV_HEADER = ['Data', 'Tipo', 'Descrição', 'Detalhe', 'Status', 'Valor (R$)'];

function csvEscape(value: string): string {
  if (value.includes(CSV_DELIMITER) || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const MOVEMENT_STATUS_LABEL: Record<FinanceMovement['status'], string> = {
  ok: 'Concluído',
  pend: 'Pendente',
  fail: 'Falhou',
};

/** Monta o CSV do extrato — pura, sem tocar no DOM (o download em si fica em `downloadCsv`). */
export function buildMovementsCsv(movements: readonly FinanceMovement[]): string {
  const rows = movements.map((m) => [
    m.dateLabel,
    m.type === 'credit' ? 'Recebimento' : 'Saque',
    m.label,
    m.sub,
    MOVEMENT_STATUS_LABEL[m.status],
    m.amountReais.toFixed(2).replace('.', ','),
  ]);
  return [CSV_HEADER, ...rows].map((row) => row.map(csvEscape).join(CSV_DELIMITER)).join('\n');
}

/** Dispara o download de um CSV no navegador — efeito colateral, fora do escopo de teste unitário. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `(cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/finance-csv.spec.ts')`
Expected: PASS (3 specs).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/finance/finance-csv.ts frontend/projects/arena/src/app/painel/finance/finance-csv.spec.ts
git commit -m "feat(arena): export de extrato financeiro em CSV"
```

---

### Task 4: `finance-repository.ts` — leitura/escrita real no Firestore + callable de saque

**Files:**
- Create: `frontend/projects/arena/src/app/painel/finance/finance-repository.ts`

**Interfaces:**
- Consumes: `Firestore`/`Functions` from `firebase/firestore`/`firebase/functions`; every type from Task 1.
- Produces: `fetchWallet(db, arenaId)`, `fetchLedgerEntries(db, arenaId, take?)`, `fetchWithdrawals(db, arenaId, take?)`, `fetchCourtRevenueAndPending(db, arenaId, now?)`, `requestWithdrawal(functions, arenaId, amountReais, pixKey)`, `fetchArenaPayoutPixKey(db, arenaId)`, `setArenaPayoutPixKey(db, arenaId, pixKey)` — Tasks 5 and 6 call these directly, no mocking layer.

No test file for this task — mirrors `courts-repository.ts`/`comandas-repository.ts`/`products-repository.ts`, none of which have a `.spec.ts` in this project (confirmed during brainstorming: the only spec in `painel/` is for a pure math function, not a Firestore-touching repository). Validation is manual (Task 7).

- [ ] **Step 1: Write the file**

```typescript
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  ARENA_WALLET_SUMMARY_EMPTY,
  type ArenaLedgerEntry,
  type ArenaWalletSummary,
  type ArenaWithdrawalItem,
  type ArenaWithdrawalRequestResult,
  type ArenaWithdrawalStatus,
  type CourtRevenueResult,
  type FinanceBookingRef,
} from './finance.model';

/** Espelha `arena_wallet_repository.dart` (carteira/ledger/saques) e a agregação de
 *  `arena_dashboard_service.dart` (receita por quadra/dia) — leitura crua do Firestore,
 *  sem Cloud Function nova (só a callable de saque, que já existe:
 *  `functions/src/arena-booking-pix.ts:392`). */

function dateOf(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function numberOf(data: Record<string, unknown>, key: string): number {
  const v = data[key];
  return typeof v === 'number' ? v : 0;
}

function stringOf(data: Record<string, unknown>, key: string, fallback = ''): string {
  const v = data[key];
  return typeof v === 'string' && v.trim() ? v : fallback;
}

export async function fetchWallet(db: Firestore, arenaId: string): Promise<ArenaWalletSummary> {
  const snap = await getDoc(doc(db, 'arenaWallets', arenaId));
  if (!snap.exists()) return ARENA_WALLET_SUMMARY_EMPTY;
  const data = snap.data() as Record<string, unknown>;
  return { availableReais: numberOf(data, 'availableReais'), pendingReais: numberOf(data, 'pendingReais') };
}

async function fetchBookingRef(db: Firestore, bookingId: string): Promise<FinanceBookingRef | null> {
  const snap = await getDoc(doc(db, 'arenaBookings', bookingId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    courtName: stringOf(data, 'courtName', 'Quadra'),
    customerLabel: stringOf(data, 'customerName', 'Atleta do app'),
  };
}

export async function fetchLedgerEntries(db: Firestore, arenaId: string, take = 30): Promise<ArenaLedgerEntry[]> {
  const snap = await getDocs(query(collection(db, 'arenaWallets', arenaId, 'ledger'), orderBy('createdAt', 'desc'), limit(take)));
  const entries: ArenaLedgerEntry[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      bookingId: typeof data['bookingId'] === 'string' ? (data['bookingId'] as string) : null,
      grossReais: numberOf(data, 'grossReais'),
      netReais: numberOf(data, 'netReais'),
      platformFeeReais: numberOf(data, 'platformFeeReais'),
      createdAt: dateOf(data['createdAt']),
      booking: null,
    };
  });
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.bookingId) entry.booking = await fetchBookingRef(db, entry.bookingId);
    }),
  );
  return entries;
}

const VALID_WITHDRAWAL_STATUS = new Set<ArenaWithdrawalStatus>(['pending', 'approved', 'rejected']);

export async function fetchWithdrawals(db: Firestore, arenaId: string, take = 20): Promise<ArenaWithdrawalItem[]> {
  const snap = await getDocs(
    query(collection(db, 'arenaWithdrawals'), where('arenaId', '==', arenaId), orderBy('createdAt', 'desc'), limit(take)),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const status = data['status'];
    return {
      id: d.id,
      amountReais: numberOf(data, 'amountReais'),
      status: VALID_WITHDRAWAL_STATUS.has(status as ArenaWithdrawalStatus) ? (status as ArenaWithdrawalStatus) : 'pending',
      pixKey: stringOf(data, 'pixKey'),
      createdAt: dateOf(data['createdAt']),
    };
  });
}

const COURT_REVENUE_BOOKING_LIMIT = 256; // paridade com arena_dashboard_service.dart:54 — evita índice composto novo.
const COURT_REVENUE_WINDOW_DAYS = 30;
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function dateKeyDaysAgo(days: number, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isCanceledStatus(status: string): boolean {
  return status === 'canceled' || status === 'cancelled';
}

/** Espelha `ArenaDashboardService.fetchDashboardSnapshotsParallel` + `summarize`: uma única
 *  query `arenaId == X` com `limit`, sem `orderBy` (evita índice composto novo), agregada em
 *  memória por quadra e por dia dos últimos 30 dias. */
export async function fetchCourtRevenueAndPending(db: Firestore, arenaId: string, now: Date = new Date()): Promise<CourtRevenueResult> {
  const snap = await getDocs(query(collection(db, 'arenaBookings'), where('arenaId', '==', arenaId), limit(COURT_REVENUE_BOOKING_LIMIT)));

  const since = dateKeyDaysAgo(COURT_REVENUE_WINDOW_DAYS, now);
  const courtTotals = new Map<string, { name: string; total: number }>();
  const last7 = new Map<string, number>();
  for (let i = 6; i >= 0; i--) last7.set(dateKeyDaysAgo(i, now), 0);

  let pendingCount = 0;
  let pendingTotal = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const dateKey = typeof data['date'] === 'string' ? data['date'] : '';
    if (dateKey < since) continue;
    if (isCanceledStatus(stringOf(data, 'status'))) continue;

    const amount = numberOf(data, 'amountReais');
    const paymentStatus = stringOf(data, 'paymentStatus');

    if (paymentStatus === 'pending' || paymentStatus === 'partial') {
      pendingCount += 1;
      pendingTotal += amount;
      continue;
    }
    if (paymentStatus !== 'paid') continue;

    const courtId = stringOf(data, 'courtId', 'sem-quadra');
    const courtName = stringOf(data, 'courtName', 'Quadra');
    const current = courtTotals.get(courtId) ?? { name: courtName, total: 0 };
    current.total += amount;
    courtTotals.set(courtId, current);

    if (last7.has(dateKey)) last7.set(dateKey, (last7.get(dateKey) ?? 0) + amount);
  }

  const courtRows = [...courtTotals.entries()]
    .map(([courtId, v]) => ({ courtId, courtName: v.name, totalReais: v.total }))
    .sort((a, b) => b.totalReais - a.totalReais);

  const last7Days = [...last7.entries()].map(([dateKey, value]) => ({
    label: WEEKDAY_LABELS[new Date(`${dateKey}T00:00:00`).getDay()]!,
    value,
  }));

  return { courtRows, last7Days, pending: { count: pendingCount, totalReais: pendingTotal } };
}

export async function requestWithdrawal(
  functions: Functions,
  arenaId: string,
  amountReais: number,
  pixKey: string,
): Promise<ArenaWithdrawalRequestResult> {
  // `pixKeyType` fica de fora: o backend infere o tipo a partir do formato da chave quando
  // não recebe um valor explícito (`resolveWithdrawalPixFields`, `functions/src/asaas-payout.ts:70-85`).
  const call = httpsCallable<Record<string, unknown>, ArenaWithdrawalRequestResult>(functions, 'requestArenaWithdrawal');
  const result = await call({ arenaId, amountReais, pixKey });
  return result.data;
}

export async function fetchArenaPayoutPixKey(db: Firestore, arenaId: string): Promise<string> {
  const snap = await getDoc(doc(db, 'arenas', arenaId));
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  return stringOf(data, 'payoutPixKey');
}

export async function setArenaPayoutPixKey(db: Firestore, arenaId: string, pixKey: string): Promise<void> {
  await updateDoc(doc(db, 'arenas', arenaId), { payoutPixKey: pixKey.trim() });
}
```

- [ ] **Step 2: Verify the whole `finance/` folder compiles**

Run: `npm --prefix frontend exec tsc -- --noEmit --strict --module esnext --moduleResolution bundler --target es2022 --skipLibCheck --lib es2022,dom projects/arena/src/app/painel/finance/finance-repository.ts`
Expected: no output (success). Full project type-checking (imports resolving against the real `tsconfig`) happens in Task 7's `ng build`.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/finance/finance-repository.ts
git commit -m "feat(arena): repositório real de carteira/ledger/saques do Financeiro"
```

---

### Task 5: `panel-finance.component.ts` — tela Financeiro com dados reais

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/finance/panel-finance.component.ts` (full rewrite)

**Interfaces:**
- Consumes: everything produced by Tasks 1–4; `ArenaContextService` (`arenaId`, `arenaName`, `loading`, `notFound`, `planStatus`, `entitled`) from `../data/arena-context.service.ts`; `arenaFirestore`/`arenaFunctions` from `../data/firestore.ts`/`../data/functions.ts`; `parseBRLInputToCents`/`formatCentsInputValue` from `../stock/product.model.ts`.
- Produces: `PanelFinanceComponent` (routed screen, no other file depends on its internals).

- [ ] **Step 1: Replace the file completely**

```typescript
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { parseBRLInputToCents, formatCentsInputValue } from '../stock/product.model';
import { BarRowComponent } from '../ui/bar-row.component';
import { IconComponent } from '../ui/icon.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { buildMovementsCsv, downloadCsv } from './finance-csv';
import { mergeFinanceMovements, movementStatusLabel } from './finance-movements';
import {
  ARENA_BOOKING_FEE_PERCENT,
  ARENA_WALLET_SUMMARY_EMPTY,
  COURT_REVENUE_EMPTY,
  formatBRL,
  roundMoney,
  type ArenaLedgerEntry,
  type ArenaWalletSummary,
  type ArenaWithdrawalItem,
  type CourtRevenueResult,
  type FinanceMovementStatus,
  type FinanceMovementType,
} from './finance.model';
import {
  fetchArenaPayoutPixKey,
  fetchCourtRevenueAndPending,
  fetchLedgerEntries,
  fetchWallet,
  fetchWithdrawals,
  requestWithdrawal,
  setArenaPayoutPixKey,
} from './finance-repository';

type TxFilter = 'all' | FinanceMovementType;

const STATUS_TONE: Record<FinanceMovementStatus, PillTone> = { ok: 'green', pend: 'yellow', fail: 'red' };

/** Tela Financeiro do painel: saldo/carteira, movimentações (ledger + saques), solicitação de
 *  saque via PIX e recebimento por quadra — todos reais, conectados a `arenaWallets`,
 *  `arenaWithdrawals` e `arenaBookings` (espelhando o app Flutter, sem Cloud Function nova
 *  além da callable de saque que já existia). */
@Component({
  selector: 'ar-panel-finance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, LineChartComponent, BarRowComponent, PillComponent, IconComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Financeiro" [subtitle]="arenaName() + ' · saldo e movimentações'">
        <a routerLink="/painel/financeiro/relatorios" class="ar-mini-btn">
          <ar-icon name="download" [size]="14" />
          Relatórios
        </a>
        <button
          type="button"
          class="ar-mini-btn ar-mini-btn-primary"
          [disabled]="loading() || filteredMovements().length === 0"
          (click)="exportStatement()"
        >
          <ar-icon name="download" [size]="14" />
          Exportar extrato
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
          </ar-panel-card>
        } @else if (arenaLoading() || loading()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Carregando financeiro…</p>
          </ar-panel-card>
        } @else if (errorMessage(); as err) {
          <ar-panel-card pad="lg">
            <p class="state-text">{{ err }}</p>
            <button type="button" class="ar-mini-btn" (click)="retry()">Tentar de novo</button>
          </ar-panel-card>
        } @else {
          <div class="summary-row">
            @for (s of summaries(); track s.label) {
              <ar-panel-card pad="sm" class="summary-card">
                <div class="summary-label" [class]="'tone-' + s.labelTone">{{ s.label }}</div>
                <div class="summary-value" [class]="'tone-' + s.valueTone">{{ s.value }}</div>
                <div class="summary-caption" [class]="'tone-' + s.captionTone">{{ s.caption }}</div>
              </ar-panel-card>
            }
          </div>

          <div class="main-grid">
            <div class="col-left">
              <ar-panel-card kicker="Últimos 7 dias" title="Faturamento" class="chart-card">
                <ar-line-chart [height]="110" [data]="revenueData()" [labels]="revenueDays()" />
              </ar-panel-card>

              <ar-panel-card title="Movimentações" [kicker]="listKicker()" class="tx-card">
                <div class="ar-filter-bar" card-actions>
                  <button type="button" class="ar-chip" [class.active]="filter() === 'all'" (click)="filter.set('all')">Todos</button>
                  <button type="button" class="ar-chip" [class.active]="filter() === 'credit'" (click)="filter.set('credit')">Recebimentos</button>
                  <button type="button" class="ar-chip" [class.active]="filter() === 'debit'" (click)="filter.set('debit')">Saques</button>
                </div>

                <div class="tx-head">
                  <span></span>
                  <span>Descrição</span>
                  <span>Detalhe</span>
                  <span>Data</span>
                  <span>Status</span>
                  <span class="right">Valor</span>
                </div>
                <div class="tx-list">
                  @for (tx of filteredMovements(); track tx.id) {
                    <div class="tx-row">
                      <div class="tx-icon" [class.in]="tx.type === 'credit'">
                        @if (tx.type === 'credit') {
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 5v14" /><path d="M5 12l7 7 7-7" />
                          </svg>
                        } @else {
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
                          </svg>
                        }
                      </div>
                      <div class="tx-label">{{ tx.label }}</div>
                      <div class="tx-sub">{{ tx.sub }}</div>
                      <div class="tx-date">{{ tx.dateLabel }}</div>
                      <div><ar-pill [tone]="statusTone[tx.status]">{{ statusLabel(tx) }}</ar-pill></div>
                      <div class="tx-amount right" [class.in]="tx.type === 'credit'">
                        {{ tx.type === 'credit' ? '+' : '−' }}{{ formatBRL(tx.amountReais) }}
                      </div>
                    </div>
                  } @empty {
                    <p class="state-text">Nenhuma movimentação ainda.</p>
                  }
                </div>
              </ar-panel-card>
            </div>

            <div class="col-right">
              <ar-panel-card pad="sm" title="Solicitar saque">
                <div class="field-label">Valor</div>
                <div class="amount-field">
                  <input type="text" inputmode="decimal" [value]="withdrawAmountValue()" (input)="withdrawAmountValue.set($any($event.target).value)" />
                  <button type="button" class="ar-pill-btn" (click)="setWithdrawAll()">
                    <ar-pill tone="orange">Sacar tudo</ar-pill>
                  </button>
                </div>

                <div class="field-label">Chave PIX</div>
                @if (editingPixKey()) {
                  <div class="pix-edit-row">
                    <input
                      class="pix-input"
                      type="text"
                      placeholder="CPF, e-mail, telefone ou chave aleatória"
                      [value]="pixKeyValue()"
                      (input)="pixKeyValue.set($any($event.target).value)"
                    />
                    <button type="button" class="ar-mini-btn" (click)="savePixKey()">Salvar</button>
                  </div>
                } @else {
                  <div class="pix-field">
                    <span>{{ pixKeyValue() || 'Nenhuma chave cadastrada' }}</span>
                    <button type="button" class="pix-edit-link" (click)="editingPixKey.set(true)">editar</button>
                  </div>
                }

                @if (withdrawError(); as err) {
                  <p class="withdraw-error">{{ err }}</p>
                }
                @if (withdrawNotice(); as notice) {
                  <p class="withdraw-notice">{{ notice }}</p>
                }

                <button
                  type="button"
                  class="ar-mini-btn ar-mini-btn-primary"
                  [disabled]="withdrawSaving() || wallet().availableReais <= 0"
                  (click)="requestWithdraw()"
                >
                  {{ withdrawSaving() ? 'Enviando…' : 'Solicitar saque' }}
                </button>
              </ar-panel-card>

              <ar-panel-card pad="sm" title="Recebimento por quadra">
                <div class="bars">
                  @for (row of byCourt(); track row.label; let last = $last) {
                    <ar-bar-row [label]="row.label" [sub]="row.sub" [pct]="row.pct" tone="orange" [last]="last" />
                  } @empty {
                    <p class="state-text">Sem reservas pagas nos últimos 30 dias.</p>
                  }
                </div>
              </ar-panel-card>
            </div>
          </div>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0 0 12px;
    }

    .summary-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .summary-card {
      flex: 1;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .summary-label.tone-orange {
      color: var(--nx-orange-500);
    }

    .summary-label.tone-dim {
      color: var(--nx-text-dim);
    }

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 30px;
      letter-spacing: -0.02em;
      margin-top: 8px;
    }

    .summary-value.tone-text {
      color: var(--nx-text);
    }

    .summary-value.tone-pending {
      color: var(--nx-pending);
    }

    .summary-caption {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      margin-top: 6px;
    }

    .summary-caption.tone-dim {
      color: var(--nx-text-dim);
    }

    .summary-caption.tone-green {
      color: var(--nx-win);
    }

    .main-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 16px;
      min-height: 0;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .col-left {
      min-height: 0;
      overflow: hidden;
    }

    .chart-card {
      flex: none;
    }

    .tx-card {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .tx-head,
    .tx-row {
      display: grid;
      grid-template-columns: 40px 1.3fr 1fr 88px 96px 90px;
      gap: 12px;
      align-items: center;
    }

    .tx-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
    }

    .tx-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .tx-head span.right {
      text-align: right;
    }

    .tx-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .tx-list::-webkit-scrollbar {
      display: none;
    }

    .tx-row {
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .tx-row:last-child {
      border-bottom: none;
    }

    .tx-icon {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-dim);
    }

    .tx-icon.in {
      background: rgba(43, 209, 126, 0.1);
      border-color: rgba(43, 209, 126, 0.24);
      color: var(--nx-win);
    }

    .tx-label {
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tx-sub {
      min-width: 0;
      font-size: 12px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tx-date {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    .tx-amount {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .tx-amount.in {
      color: var(--nx-win);
    }

    .right {
      text-align: right;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 6px;
    }

    .amount-field {
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      padding: 0 12px;
      margin-bottom: 12px;
      gap: 8px;
    }

    .amount-field input {
      flex: 1;
      min-width: 0;
      border: none;
      background: transparent;
      outline: none;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 16px;
      color: var(--nx-text);
    }

    .ar-pill-btn {
      border: none;
      background: transparent;
      padding: 0;
      cursor: pointer;
      flex: none;
    }

    .pix-field {
      height: 40px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 0 12px;
      margin-bottom: 14px;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-mute);
    }

    .pix-edit-link {
      border: none;
      background: transparent;
      color: var(--nx-orange-500);
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      cursor: pointer;
      flex: none;
      padding: 0;
    }

    .pix-edit-row {
      display: flex;
      gap: 8px;
      margin-bottom: 14px;
    }

    .pix-input {
      flex: 1;
      min-width: 0;
      height: 40px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      padding: 0 12px;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text);
    }

    .withdraw-error {
      font-size: 12px;
      color: var(--nx-live);
      margin: 0 0 10px;
    }

    .withdraw-notice {
      font-size: 12px;
      color: var(--nx-win);
      margin: 0 0 10px;
    }

    .bars {
      margin-top: -4px;
    }

    @media (max-width: 1180px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .summary-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelFinanceComponent {
  private readonly auth = inject(AuthService);
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly formatBRL = formatBRL;
  protected readonly statusLabel = movementStatusLabel;
  protected readonly statusTone = STATUS_TONE;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly filter = signal<TxFilter>('all');

  protected readonly wallet = signal<ArenaWalletSummary>(ARENA_WALLET_SUMMARY_EMPTY);
  protected readonly ledger = signal<ArenaLedgerEntry[]>([]);
  protected readonly withdrawals = signal<ArenaWithdrawalItem[]>([]);
  protected readonly courtRevenue = signal<CourtRevenueResult>(COURT_REVENUE_EMPTY);

  protected readonly withdrawAmountValue = signal('0,00');
  protected readonly pixKeyValue = signal('');
  protected readonly editingPixKey = signal(false);
  protected readonly withdrawSaving = signal(false);
  protected readonly withdrawNotice = signal<string | null>(null);
  protected readonly withdrawError = signal<string | null>(null);

  protected readonly movements = computed(() => mergeFinanceMovements(this.ledger(), this.withdrawals()));
  protected readonly filteredMovements = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.movements() : this.movements().filter((m) => m.type === f);
  });
  protected readonly listKicker = computed(() => `${this.filteredMovements().length} lançamentos`);

  protected readonly grossRevenue30d = computed(() => this.courtRevenue().courtRows.reduce((sum, r) => sum + r.totalReais, 0));

  protected readonly feePercent = computed(() => {
    const status = this.arenaContext.planStatus();
    const entitled = this.arenaContext.entitled();
    const effectiveTier = entitled ? status.tier : 'essencial';
    return effectiveTier === 'pro' || effectiveTier === 'parceiro' ? 0 : ARENA_BOOKING_FEE_PERCENT;
  });

  protected readonly feeRetained30d = computed(() => roundMoney((this.grossRevenue30d() * this.feePercent()) / 100));

  protected readonly summaries = computed(() => {
    const wallet = this.wallet();
    const pending = this.courtRevenue().pending;
    return [
      {
        label: 'Saldo disponível',
        labelTone: 'orange' as const,
        value: formatBRL(wallet.availableReais),
        valueTone: 'text' as const,
        caption: wallet.pendingReais > 0 ? `${formatBRL(wallet.pendingReais)} em processamento` : 'Nenhum saque em processamento',
        captionTone: 'dim' as const,
      },
      {
        label: 'Recebido (30 dias)',
        labelTone: 'dim' as const,
        value: formatBRL(this.grossRevenue30d()),
        valueTone: 'text' as const,
        caption: `${this.courtRevenue().courtRows.length} quadra(s) com reservas pagas`,
        captionTone: 'dim' as const,
      },
      {
        label: 'Taxa da plataforma',
        labelTone: 'dim' as const,
        value: `${this.feePercent()}%`,
        valueTone: 'text' as const,
        caption: `${formatBRL(this.feeRetained30d())} retidos (30 dias)`,
        captionTone: 'dim' as const,
      },
      {
        label: 'Pendências',
        labelTone: 'dim' as const,
        value: String(pending.count),
        valueTone: pending.count > 0 ? ('pending' as const) : ('text' as const),
        caption: pending.count > 0 ? `${formatBRL(pending.totalReais)} aguardando pagamento` : 'Nenhuma reserva pendente',
        captionTone: 'dim' as const,
      },
    ];
  });

  protected readonly revenueData = computed(() => this.courtRevenue().last7Days.map((d) => d.value));
  protected readonly revenueDays = computed(() => this.courtRevenue().last7Days.map((d) => d.label));

  protected readonly byCourt = computed(() => {
    const rows = this.courtRevenue().courtRows;
    const total = this.grossRevenue30d();
    return rows.map((r) => ({
      label: r.courtName,
      sub: formatBRL(r.totalReais),
      pct: total > 0 ? Math.round((r.totalReais / total) * 100) : 0,
    }));
  });

  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? this.auth.displayName() ?? 'Arena');

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.loadFinance(arenaId);
    });
  }

  protected retry(): void {
    const arenaId = this.arenaContext.arenaId();
    if (arenaId) void this.loadFinance(arenaId);
  }

  protected setWithdrawAll(): void {
    this.withdrawAmountValue.set(formatCentsInputValue(Math.round(this.wallet().availableReais * 100)));
  }

  protected async savePixKey(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;
    const key = this.pixKeyValue().trim();
    if (key.length < 5) {
      this.withdrawError.set('Informe uma chave PIX válida.');
      return;
    }
    await setArenaPayoutPixKey(arenaFirestore(), arenaId, key);
    this.editingPixKey.set(false);
    this.withdrawError.set(null);
    this.withdrawNotice.set('Chave PIX salva.');
  }

  protected async requestWithdraw(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;
    const amount = parseBRLInputToCents(this.withdrawAmountValue()) / 100;
    if (amount <= 0) {
      this.withdrawError.set('Informe um valor válido para saque.');
      return;
    }
    if (this.pixKeyValue().trim().length < 5) {
      this.withdrawError.set('Cadastre uma chave PIX antes de solicitar o saque.');
      this.editingPixKey.set(true);
      return;
    }

    this.withdrawSaving.set(true);
    this.withdrawError.set(null);
    this.withdrawNotice.set(null);
    try {
      const result = await requestWithdrawal(arenaFunctions(), arenaId, amount, this.pixKeyValue().trim());
      this.withdrawNotice.set(
        result.message ?? (result.autoProcessed ? 'Saque enviado via PIX.' : 'Saque solicitado — aguardando aprovação da plataforma.'),
      );
      this.withdrawAmountValue.set('0,00');
      await this.loadFinance(arenaId);
    } catch (e) {
      this.withdrawError.set(e instanceof Error ? e.message : 'Não foi possível solicitar o saque.');
    } finally {
      this.withdrawSaving.set(false);
    }
  }

  protected exportStatement(): void {
    const csv = buildMovementsCsv(this.filteredMovements());
    downloadCsv(`extrato-financeiro-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  private async loadFinance(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const db = arenaFirestore();
      const [wallet, ledger, withdrawals, courtRevenue, pixKey] = await Promise.all([
        fetchWallet(db, arenaId),
        fetchLedgerEntries(db, arenaId),
        fetchWithdrawals(db, arenaId),
        fetchCourtRevenueAndPending(db, arenaId),
        fetchArenaPayoutPixKey(db, arenaId),
      ]);
      this.wallet.set(wallet);
      this.ledger.set(ledger);
      this.withdrawals.set(withdrawals);
      this.courtRevenue.set(courtRevenue);
      if (!this.editingPixKey()) this.pixKeyValue.set(pixKey);
    } catch {
      this.errorMessage.set('Não foi possível carregar os dados financeiros.');
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/projects/arena/src/app/painel/finance/panel-finance.component.ts
git commit -m "feat(arena): tela Financeiro conectada a carteira/ledger/saques reais"
```

---

### Task 6: `panel-finance-reports.component.ts` — tela Relatórios com export real

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/finance/panel-finance-reports.component.ts` (full rewrite)

**Interfaces:**
- Consumes: `mergeFinanceMovements`, `filterMovementsByPeriod`, `buildDailyTotals`, `type FinancePeriodKey` (Task 2); `buildMovementsCsv`, `downloadCsv` (Task 3); `formatBRL` (Task 1); `fetchLedgerEntries`, `fetchWithdrawals` (Task 4); `ArenaContextService`.
- Produces: `PanelFinanceReportsComponent` (routed screen).

- [ ] **Step 1: Replace the file completely**

```typescript
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { LineChartComponent } from '../ui/line-chart.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import { buildMovementsCsv, downloadCsv } from './finance-csv';
import { buildDailyTotals, filterMovementsByPeriod, mergeFinanceMovements, type FinancePeriodKey } from './finance-movements';
import { formatBRL } from './finance.model';
import { fetchLedgerEntries, fetchWithdrawals } from './finance-repository';

type GroupKey = 'day' | 'week' | 'month' | 'court' | 'payment';
type MetricKey = 'revenue' | 'reservations' | 'commands' | 'platformFee' | 'withdrawals';
type ExportFormat = 'pdf' | 'csv';
type PreviewMetric = 'revenue' | 'reservations';
type PeriodOptionKey = FinancePeriodKey | 'custom';

interface ChipOption<T extends string> {
  key: T;
  label: string;
  disabled?: boolean;
}

interface RecentReport {
  id: number;
  label: string;
  generatedLabel: string;
  format: ExportFormat;
}

const PERIOD_OPTIONS: ChipOption<PeriodOptionKey>[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês passado' },
  { key: 'custom', label: 'Personalizado', disabled: true },
];

const GROUP_OPTIONS: ChipOption<GroupKey>[] = [
  { key: 'day', label: 'Dia' },
  { key: 'week', label: 'Semana', disabled: true },
  { key: 'month', label: 'Mês', disabled: true },
  { key: 'court', label: 'Quadra', disabled: true },
  { key: 'payment', label: 'Forma de pagamento', disabled: true },
];

const METRIC_OPTIONS: ChipOption<MetricKey>[] = [
  { key: 'revenue', label: 'Faturamento' },
  { key: 'reservations', label: 'Reservas' },
  { key: 'commands', label: 'Comandas', disabled: true },
  { key: 'platformFee', label: 'Taxa da plataforma' },
  { key: 'withdrawals', label: 'Saques' },
];

const EXPORT_OPTIONS: ChipOption<ExportFormat>[] = [
  { key: 'pdf', label: 'PDF', disabled: true },
  { key: 'csv', label: 'CSV' },
];

const PREVIEW_METRIC_OPTIONS: ChipOption<PreviewMetric>[] = [
  { key: 'revenue', label: 'Faturamento' },
  { key: 'reservations', label: 'Reservas' },
];

const FORMAT_LABEL: Record<ExportFormat, string> = { pdf: 'PDF', csv: 'CSV' };
const FORMAT_TONE: Record<ExportFormat, PillTone> = { pdf: 'orange', csv: 'dim' };

const LEDGER_HISTORY_TAKE = 200;
const WITHDRAWAL_HISTORY_TAKE = 100;

/** Tela "Relatórios" do painel: filtra as mesmas movimentações reais do Financeiro (carteira +
 *  saques) por período e exporta em CSV. Filtro por quadra e agrupamento por
 *  semana/mês/forma-de-pagamento ficam desabilitados nesta rodada — não existe registro de
 *  forma de pagamento por reserva, e filtro por quadra foi deixado fora do escopo (ver spec
 *  `docs/superpowers/specs/2026-07-14-arena-financeiro-real-design.md`). */
@Component({
  selector: 'ar-panel-finance-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, LineChartComponent, PillComponent, IconComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Relatórios" [subtitle]="arenaName() + ' · relatório a partir da carteira e dos saques'">
        <a routerLink="/painel/financeiro" class="back-link">
          <ar-icon name="chevron-right" [size]="14" style="transform: rotate(180deg)" />
          Voltar ao Financeiro
        </a>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <div class="state-wrap">
            <ar-panel-card pad="lg">
              <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
            </ar-panel-card>
          </div>
        } @else if (arenaLoading() || loading()) {
          <div class="state-wrap">
            <ar-panel-card pad="lg">
              <p class="state-text">Carregando histórico…</p>
            </ar-panel-card>
          </div>
        } @else if (errorMessage(); as err) {
          <div class="state-wrap">
            <ar-panel-card pad="lg">
              <p class="state-text">{{ err }}</p>
              <button type="button" class="ar-mini-btn" (click)="retry()">Tentar de novo</button>
            </ar-panel-card>
          </div>
        } @else {
          <div class="col-left">
            <ar-panel-card title="Período">
              <div class="field-label">Intervalo</div>
              <div class="ar-filter-bar">
                @for (opt of periodOptions; track opt.key) {
                  <button type="button" class="ar-chip" [class.active]="period() === opt.key" [class.disabled]="opt.disabled" (click)="selectPeriod(opt)">
                    {{ opt.label }}
                  </button>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Filtros">
              <div class="field-label">Quadra</div>
              <p class="state-text filter-note">Filtro por quadra chega em uma próxima versão — o relatório considera todas.</p>

              <div class="field-label">Agrupar por</div>
              <div class="ar-filter-bar">
                @for (opt of groupOptions; track opt.key) {
                  <button type="button" class="ar-chip" [class.active]="groupBy() === opt.key" [class.disabled]="opt.disabled" (click)="selectGroup(opt)">
                    {{ opt.label }}
                  </button>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Métricas">
              <div class="field-label">Incluir no relatório</div>
              <div class="ar-filter-bar">
                @for (opt of metricOptions; track opt.key) {
                  <button type="button" class="ar-chip" [class.active]="metrics().has(opt.key)" [class.disabled]="opt.disabled" (click)="toggleMetric(opt.key)">
                    {{ opt.label }}
                  </button>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Formato de exportação">
              <div class="field-label">Arquivo</div>
              <div class="ar-filter-bar filter-block">
                @for (opt of exportOptions; track opt.key) {
                  <button type="button" class="ar-chip" [class.active]="exportFormat() === opt.key" [class.disabled]="opt.disabled" (click)="selectExportFormat(opt)">
                    {{ opt.label }}
                  </button>
                }
              </div>
              <button type="button" class="ar-mini-btn ar-mini-btn-primary generate-btn" (click)="generateReport()">
                <ar-icon name="download" [size]="14" />
                Gerar relatório
              </button>
            </ar-panel-card>
          </div>

          <div class="col-right">
            <ar-panel-card [kicker]="previewKicker()" title="Prévia">
              <ar-line-chart [height]="180" [data]="previewData()" [labels]="previewDays()" />
              <div class="legend">
                @for (opt of previewMetricOptions; track opt.key) {
                  <button type="button" class="ar-chip legend-chip" [class.active]="previewMetric() === opt.key" (click)="previewMetric.set(opt.key)">
                    <span class="dot"></span>
                    {{ opt.label }}
                  </button>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Resumo do período">
              <div class="summary-grid">
                @for (s of summary(); track s.label) {
                  <div class="summary-item">
                    <div class="summary-label">{{ s.label }}</div>
                    <div class="summary-value">{{ s.value }}</div>
                  </div>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card [kicker]="recentKicker()" title="Relatórios recentes" class="recent-card">
              <div class="recent-list">
                @for (r of recentReports(); track r.id) {
                  <div class="recent-row">
                    <div class="recent-icon">
                      <ar-icon name="download" [size]="14" />
                    </div>
                    <div class="recent-body">
                      <div class="recent-label">{{ r.label }}</div>
                      <div class="recent-date">{{ r.generatedLabel }}</div>
                    </div>
                    <ar-pill [tone]="formatTone[r.format]">{{ formatLabel[r.format] }}</ar-pill>
                  </div>
                } @empty {
                  <p class="state-text">Nenhum relatório gerado nesta sessão ainda.</p>
                }
              </div>
            </ar-panel-card>
          </div>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      text-decoration: none;
      white-space: nowrap;
    }

    .back-link:hover {
      color: var(--nx-text);
    }

    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 373px 1fr;
      gap: 16px;
      align-items: start;
    }

    .state-wrap {
      grid-column: 1 / -1;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0 0 12px;
    }

    .filter-note {
      margin-bottom: 18px;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .filter-block {
      margin-bottom: 18px;
    }

    .generate-btn {
      width: 100%;
      justify-content: center;
      margin-top: 16px;
    }

    .ar-chip.disabled {
      opacity: 0.4;
      pointer-events: none;
    }

    .legend {
      display: flex;
      gap: 8px;
      margin-top: 14px;
    }

    .legend-chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .legend-chip .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      flex: none;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 16px;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 8px;
    }

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .recent-card {
      flex: 1;
      min-height: 0;
    }

    .recent-list {
      display: flex;
      flex-direction: column;
    }

    .recent-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .recent-row:last-child {
      border-bottom: none;
    }

    .recent-icon {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-dim);
    }

    .recent-body {
      flex: 1;
      min-width: 0;
    }

    .recent-label {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .recent-date {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 720px) {
      .summary-grid {
        grid-template-columns: repeat(2, 1fr);
        row-gap: 18px;
      }
    }
  `,
})
export class PanelFinanceReportsComponent {
  private readonly auth = inject(AuthService);
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly groupOptions = GROUP_OPTIONS;
  protected readonly metricOptions = METRIC_OPTIONS;
  protected readonly exportOptions = EXPORT_OPTIONS;
  protected readonly previewMetricOptions = PREVIEW_METRIC_OPTIONS;
  protected readonly formatLabel = FORMAT_LABEL;
  protected readonly formatTone = FORMAT_TONE;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly period = signal<FinancePeriodKey>('30d');
  protected readonly groupBy = signal<GroupKey>('day');
  protected readonly metrics = signal<Set<MetricKey>>(new Set<MetricKey>(['revenue', 'reservations']));
  protected readonly exportFormat = signal<ExportFormat>('csv');
  protected readonly previewMetric = signal<PreviewMetric>('revenue');

  private readonly allMovements = signal<ReturnType<typeof mergeFinanceMovements>>([]);
  protected readonly recentReports = signal<RecentReport[]>([]);

  protected readonly periodMovements = computed(() => filterMovementsByPeriod(this.allMovements(), this.period()));

  protected readonly summary = computed(() => {
    const rows = this.periodMovements();
    const credits = rows.filter((m) => m.type === 'credit');
    const debits = rows.filter((m) => m.type === 'debit');
    const revenue = credits.reduce((s, m) => s + m.amountReais, 0);
    const reservations = credits.length;
    const platformFee = credits.reduce((s, m) => s + m.platformFeeReais, 0);
    const withdrawals = debits.reduce((s, m) => s + m.amountReais, 0);
    return [
      { label: 'Faturamento', value: formatBRL(revenue) },
      { label: 'Reservas', value: String(reservations) },
      { label: 'Taxa retida', value: formatBRL(platformFee) },
      { label: 'Ticket médio', value: formatBRL(reservations > 0 ? revenue / reservations : 0) },
      { label: 'Saques no período', value: formatBRL(withdrawals) },
    ];
  });

  private readonly dailyTotals = computed(() => buildDailyTotals(this.allMovements(), 7));
  protected readonly previewDays = computed(() => this.dailyTotals().map((d) => d.label));
  protected readonly previewData = computed(() =>
    this.dailyTotals().map((d) => (this.previewMetric() === 'revenue' ? d.revenue : d.reservations)),
  );

  protected readonly previewKicker = computed(() => {
    const period = this.periodOptions.find((o) => o.key === this.period())!.label;
    return `${period} · ${this.periodMovements().length} lançamentos`;
  });

  protected readonly recentKicker = computed(() => `${this.recentReports().length} gerados`);
  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? this.auth.displayName() ?? 'Arena');

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.loadHistory(arenaId);
    });
  }

  protected toggleMetric(key: MetricKey): void {
    const option = this.metricOptions.find((o) => o.key === key);
    if (option?.disabled) return;
    this.metrics.update((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected selectPeriod(option: ChipOption<PeriodOptionKey>): void {
    if (option.disabled) return;
    this.period.set(option.key as FinancePeriodKey);
  }

  protected selectGroup(option: ChipOption<GroupKey>): void {
    if (option.disabled) return;
    this.groupBy.set(option.key);
  }

  protected selectExportFormat(option: ChipOption<ExportFormat>): void {
    if (option.disabled) return;
    this.exportFormat.set(option.key);
  }

  protected retry(): void {
    const arenaId = this.arenaContext.arenaId();
    if (arenaId) void this.loadHistory(arenaId);
  }

  protected generateReport(): void {
    const rows = this.periodMovements();
    const csv = buildMovementsCsv(rows);
    downloadCsv(`relatorio-financeiro-${this.period()}-${new Date().toISOString().slice(0, 10)}.csv`, csv);

    const periodLabel = this.periodOptions.find((o) => o.key === this.period())!.label;
    const generatedLabel = new Date().toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    this.recentReports.update((current) => [
      { id: Date.now(), label: `${periodLabel} · ${rows.length} lançamentos`, generatedLabel, format: 'csv' },
      ...current,
    ]);
  }

  private async loadHistory(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const db = arenaFirestore();
      const [ledger, withdrawals] = await Promise.all([
        fetchLedgerEntries(db, arenaId, LEDGER_HISTORY_TAKE),
        fetchWithdrawals(db, arenaId, WITHDRAWAL_HISTORY_TAKE),
      ]);
      this.allMovements.set(mergeFinanceMovements(ledger, withdrawals));
    } catch {
      this.errorMessage.set('Não foi possível carregar o histórico financeiro.');
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/projects/arena/src/app/painel/finance/panel-finance-reports.component.ts
git commit -m "feat(arena): tela Relatórios com export CSV real a partir da carteira/saques"
```

---

### Task 7: Build, unit tests and manual QA checklist

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit test suite for the `finance` folder**

Run: `(cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='**/finance/*.spec.ts')`
Expected: PASS — 16 specs (13 from `finance-movements.spec.ts` + 3 from `finance-csv.spec.ts`). If `ChromeHeadless` isn't available in this environment (no system Chrome), retry with `--browsers=ChromeHeadlessNoSandbox` (Angular's default `karma.conf` templates typically ship this alias) or report the exact launcher error rather than skipping verification silently.

- [ ] **Step 2: Full production build (type-checks every file touched, including the two rewritten components)**

Run: `npm --prefix frontend run build:arena`
Expected: build succeeds (`Application bundle generation complete`), no TypeScript errors.

- [ ] **Step 3: Manual QA in the browser (requires a real arena-manager login against a Firebase project with data — dev project per `frontend/environments`)**

Checklist to run through once (`ng serve arena`, log in as an arena manager):
- Financeiro loads without the "Carregando financeiro…" state getting stuck, shows a real `Saldo disponível` (even if R$ 0,00 for a fresh arena) instead of the old hardcoded R$ 2.340,00.
- "Movimentações" list is empty (`Nenhuma movimentação ainda.`) for an arena with no paid bookings yet, or shows real entries with real `+R$` values for one that does.
- Typing an amount greater than the available balance into "Solicitar saque" and clicking the button surfaces the exact Portuguese error the callable returns ("Saldo insuficiente para este saque.") instead of a generic failure.
- Editing the PIX key, saving, and reloading the page shows the saved key (persisted on `arenas/{arenaId}.payoutPixKey`).
- "Exportar extrato" downloads a `.csv` file that opens correctly in a spreadsheet app (semicolon-delimited, comma decimals, accented headers not mojibake).
- Relatórios: switching between "7 dias"/"30 dias"/"Este mês"/"Mês passado" changes the "Resumo do período" numbers; clicking a disabled chip (Personalizado, Semana, Quadra, Comandas, PDF) does nothing; "Gerar relatório" downloads a CSV and adds a row to "Relatórios recentes".

This step cannot be executed unattended in this sandboxed session (no real Firebase login available here) — report it explicitly as a manual follow-up rather than claiming it passed.
