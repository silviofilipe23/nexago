# Fechar Comanda Vazia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an arena manager close a comanda that has zero items launched, on both the Angular web panel and the Flutter app — today nothing lets them do that, so it stays stuck open forever.

**Architecture:** Reuse the existing `closed` status instead of introducing a new status or opening a Firestore delete rule. Each platform gets: a small pure guard function (`comandaCloseEmptyBlockReason` in TS / `canCloseEmptyComanda` in Dart), a repository method that writes `status: closed` directly inside a transaction (no payment doc, no `paidCents` change), and a "Fechar comanda" action wired into the comanda detail screen, gated by that guard.

**Tech Stack:** Angular 18+ (standalone components, signals, `@angular/build:karma`/Jasmine) + Firestore JS SDK, in `frontend/projects/arena`. Flutter + Riverpod + `cloud_firestore` + `flutter_test`, in `nexago_app`.

Spec: `docs/superpowers/specs/2026-07-21-fechar-comanda-vazia-design.md`

## Global Constraints

- No changes to `firestore.rules` or Cloud Functions. The existing `arenaComandas` update rule already allows `status: closed` whenever `paidCents >= totalCents`, which is trivially true at `0 >= 0` — verified by reading `firestore.rules:613-659`.
- Reuse the `closed` status value. Do not add a new comanda status anywhere.
- All user-facing copy is in Portuguese, matching existing strings in both apps.
- Match each file's existing patterns exactly (guard-function style, transaction style, confirmation-dialog style). Don't introduce new abstractions or restructure files beyond what's needed.

---

## Task 1: Web — guard function `comandaCloseEmptyBlockReason`

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/orders/comanda.model.ts`
- Test: `frontend/projects/arena/src/app/painel/orders/comanda.model.spec.ts` (new file)

**Interfaces:**
- Produces: `comandaCloseEmptyBlockReason(comanda: Pick<ArenaComanda, 'status' | 'totalCents'>): string | null`, exported from `comanda.model.ts`. `null` means closing is allowed.

- [ ] **Step 1: Write the failing test**

Create `frontend/projects/arena/src/app/painel/orders/comanda.model.spec.ts`:

```ts
import { comandaCloseEmptyBlockReason } from './comanda.model';

describe('comandaCloseEmptyBlockReason', () => {
  it('permite fechar comanda aberta sem consumo', () => {
    expect(comandaCloseEmptyBlockReason({ status: 'open', totalCents: 0 })).toBeNull();
  });

  it('bloqueia quando a comanda tem consumo lançado', () => {
    expect(comandaCloseEmptyBlockReason({ status: 'open', totalCents: 1500 })).not.toBeNull();
  });

  it('bloqueia quando a comanda já não está ativa', () => {
    expect(comandaCloseEmptyBlockReason({ status: 'closed', totalCents: 0 })).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`:

```bash
npx ng test arena --watch=false --browsers=ChromeHeadless
```

Expected: build error — `comandaCloseEmptyBlockReason` is not exported from `./comanda.model`.

- [ ] **Step 3: Implement the guard function**

In `frontend/projects/arena/src/app/painel/orders/comanda.model.ts`, append at the end of the file (after the closing `}` of `comandaItemReverseBlockReason`, currently the last line):

```ts

/** Motivo pelo qual a comanda vazia não pode ser fechada; `null` = permitido.
 *  Comandas sem nenhum lançamento (`totalCents === 0`) nunca passam pelo fluxo
 *  normal de pagamento — `registerPayment` exige `amountCents > 0` — então
 *  precisam de um fechamento direto. */
export function comandaCloseEmptyBlockReason(
  comanda: Pick<ArenaComanda, 'status' | 'totalCents'>,
): string | null {
  if (!comandaStatusIsActive(comanda.status)) {
    return 'Comanda já não está aberta.';
  }
  if (comanda.totalCents !== 0) {
    return 'Comanda tem consumo lançado — registre o pagamento para fechar.';
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `frontend/`:

```bash
npx ng test arena --watch=false --browsers=ChromeHeadless
```

Expected: `TOTAL: X SUCCESS` (X = previous count + 3), no failures.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/orders/comanda.model.ts frontend/projects/arena/src/app/painel/orders/comanda.model.spec.ts
git commit -m "feat(arena-web): add comandaCloseEmptyBlockReason guard"
```

---

## Task 2: Web — repository function `closeEmptyComanda`

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/orders/comandas-repository.ts`

**Interfaces:**
- Consumes: `comandaCloseEmptyBlockReason` from Task 1 (`./comanda.model`).
- Produces: `closeEmptyComanda(db: Firestore, comandaId: string): Promise<void>`, exported from `comandas-repository.ts`. Throws `Error` with a user-facing message when the comanda can't be closed.

No test for this step — mirrors the existing precedent in this file: `registerPayment`, `addItemsBatch`, and `reverseComandaItem` are all transaction-based Firestore writes with no `.spec.ts` coverage (they'd need a Firestore emulator, which this project doesn't wire up for unit tests).

- [ ] **Step 1: Add the import**

In `frontend/projects/arena/src/app/painel/orders/comandas-repository.ts`, the import block currently reads:

```ts
import {
  comandaItemReverseBlockReason,
  comandaStatusIsActive,
  formatComandaNumber,
  type ArenaComanda,
  type ArenaComandaItem,
  type ArenaComandaItemSource,
  type ArenaComandaPayment,
  type ArenaComandaPaymentMethod,
  type ArenaComandaStatus,
  type ArenaComandaType,
} from './comanda.model';
```

Change it to:

```ts
import {
  comandaCloseEmptyBlockReason,
  comandaItemReverseBlockReason,
  comandaStatusIsActive,
  formatComandaNumber,
  type ArenaComanda,
  type ArenaComandaItem,
  type ArenaComandaItemSource,
  type ArenaComandaPayment,
  type ArenaComandaPaymentMethod,
  type ArenaComandaStatus,
  type ArenaComandaType,
} from './comanda.model';
```

- [ ] **Step 2: Implement `closeEmptyComanda`**

Append at the end of `frontend/projects/arena/src/app/painel/orders/comandas-repository.ts` (after the closing `}` of `registerPayment`, currently the last line):

```ts

/** Fecha uma comanda vazia (sem itens lançados) diretamente, sem pagamento —
 *  `registerPayment` nunca fecharia essa comanda porque exige `amountCents > 0`.
 *  Espelha `closeEmptyComanda` do app Flutter (`ArenaComandasRepository`). */
export async function closeEmptyComanda(db: Firestore, comandaId: string): Promise<void> {
  const comandaRef = doc(db, 'arenaComandas', comandaId);

  await runTransaction(db, async (txn) => {
    const comandaSnap = await txn.get(comandaRef);
    if (!comandaSnap.exists()) {
      throw new Error('Comanda não encontrada.');
    }
    const comanda = comandaFromDoc(comandaSnap.id, comandaSnap.data());
    const blockReason = comandaCloseEmptyBlockReason(comanda);
    if (blockReason) {
      throw new Error(blockReason);
    }

    txn.update(comandaRef, {
      status: 'closed',
      updatedAt: serverTimestamp(),
    });
  });
}
```

- [ ] **Step 3: Compile-check**

Run from `frontend/`:

```bash
npx ng build arena
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/arena/src/app/painel/orders/comandas-repository.ts
git commit -m "feat(arena-web): add closeEmptyComanda repository function"
```

---

## Task 3: Web — "Fechar comanda" UI on the detail page

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/orders/panel-order-detail.component.ts`

**Interfaces:**
- Consumes: `comandaCloseEmptyBlockReason` (Task 1), `closeEmptyComanda` (Task 2), `ModalComponent` (`../ui/modal.component`, already used elsewhere in this codebase, e.g. `panel-orders.component.ts` and `panel-stock-detail.component.ts`).

No test for this step — this component has no existing `.spec.ts`, and Angular component template/DOM behavior in this codebase is verified manually in the browser (see Step 6).

- [ ] **Step 1: Update imports**

In `frontend/projects/arena/src/app/painel/orders/panel-order-detail.component.ts`, the top of the file currently reads:

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { formatCentsInputValue, formatMovementDate, parseBRLInputToCents, type ArenaProduct } from '../stock/product.model';
import { fetchProducts } from '../stock/products-repository';
import {
  ARENA_COMANDA_PAYMENT_METHOD_LABEL,
  ARENA_COMANDA_STATUS_LABEL,
  comandaItemReverseBlockReason,
  comandaRemainingCents,
  comandaStatusIsActive,
  formatCentsBRL,
  formatComandaNumber,
  type ArenaComanda,
  type ArenaComandaItem,
  type ArenaComandaPayment,
  type ArenaComandaPaymentMethod,
} from './comanda.model';
import { addItemsBatch, fetchComanda, fetchComandaItems, fetchComandaPayments, registerPayment, reverseComandaItem } from './comandas-repository';
```

Replace it with:

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { formatCentsInputValue, formatMovementDate, parseBRLInputToCents, type ArenaProduct } from '../stock/product.model';
import { fetchProducts } from '../stock/products-repository';
import {
  ARENA_COMANDA_PAYMENT_METHOD_LABEL,
  ARENA_COMANDA_STATUS_LABEL,
  comandaCloseEmptyBlockReason,
  comandaItemReverseBlockReason,
  comandaRemainingCents,
  comandaStatusIsActive,
  formatCentsBRL,
  formatComandaNumber,
  type ArenaComanda,
  type ArenaComandaItem,
  type ArenaComandaPayment,
  type ArenaComandaPaymentMethod,
} from './comanda.model';
import {
  addItemsBatch,
  closeEmptyComanda,
  fetchComanda,
  fetchComandaItems,
  fetchComandaPayments,
  registerPayment,
  reverseComandaItem,
} from './comandas-repository';
```

- [ ] **Step 2: Register `ModalComponent` on the component**

Find this line (the `@Component` decorator's `imports` array):

```ts
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent],
```

Replace it with:

```ts
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, ModalComponent],
```

- [ ] **Step 3: Add the "Fechar comanda" card and confirmation modal to the template**

Find this block inside the template (col-right, after the payments history card):

```html
            @if (canPay()) {
              <ar-panel-card title="Registrar pagamento">
                @if (payError(); as perr) {
                  <div class="error-banner">{{ perr }}</div>
                }
                <div class="payment-list">
                  @for (m of paymentMethods; track m) {
                    <button type="button" class="payment-btn" [class.active]="paymentMethod() === m" (click)="paymentMethod.set(m)">
                      {{ paymentMethodLabel[m] }}
                      @if (paymentMethod() === m) {
                        <ar-icon name="check" [size]="15" />
                      }
                    </button>
                  }
                </div>

                <div class="field-label row-gap">Valor</div>
                <div class="price-box">
                  <span>R$</span>
                  <input type="text" inputmode="decimal" [value]="paymentAmountValue()" (input)="paymentAmountValue.set($any($event.target).value)" />
                </div>

                <button type="button" class="close-btn" [disabled]="paying()" (click)="submitPayment(c)">
                  <ar-icon name="cash" [size]="15" />
                  {{ paying() ? 'Registrando…' : 'Registrar pagamento' }}
                </button>
              </ar-panel-card>
            } @else if (c.status === 'closed') {
              <p class="state-text">Comanda fechada — totalmente paga.</p>
            }
          </div>
        } @else {
          <p class="state-text">Comanda não encontrada.</p>
        }
```

Replace it with:

```html
            @if (canPay()) {
              <ar-panel-card title="Registrar pagamento">
                @if (payError(); as perr) {
                  <div class="error-banner">{{ perr }}</div>
                }
                <div class="payment-list">
                  @for (m of paymentMethods; track m) {
                    <button type="button" class="payment-btn" [class.active]="paymentMethod() === m" (click)="paymentMethod.set(m)">
                      {{ paymentMethodLabel[m] }}
                      @if (paymentMethod() === m) {
                        <ar-icon name="check" [size]="15" />
                      }
                    </button>
                  }
                </div>

                <div class="field-label row-gap">Valor</div>
                <div class="price-box">
                  <span>R$</span>
                  <input type="text" inputmode="decimal" [value]="paymentAmountValue()" (input)="paymentAmountValue.set($any($event.target).value)" />
                </div>

                <button type="button" class="close-btn" [disabled]="paying()" (click)="submitPayment(c)">
                  <ar-icon name="cash" [size]="15" />
                  {{ paying() ? 'Registrando…' : 'Registrar pagamento' }}
                </button>
              </ar-panel-card>
            } @else if (canCloseEmpty()) {
              <ar-panel-card title="Fechar comanda">
                <p class="state-text">Nenhum item foi lançado nesta comanda.</p>
                @if (closeEmptyError(); as cerr) {
                  <div class="error-banner">{{ cerr }}</div>
                }
                <button type="button" class="ar-mini-btn close-empty-btn" [disabled]="closingEmpty()" (click)="showCloseConfirm.set(true)">
                  Fechar comanda
                </button>
              </ar-panel-card>
            } @else if (c.status === 'closed') {
              <p class="state-text">{{ c.totalCents === 0 ? 'Comanda fechada sem consumo.' : 'Comanda fechada — totalmente paga.' }}</p>
            }
          </div>

          @if (showCloseConfirm()) {
            <ar-modal (close)="showCloseConfirm.set(false)">
              <h2 class="confirm-title">Fechar comanda sem consumo?</h2>
              <p class="confirm-body">
                Nenhum item foi lançado em "{{ c.customerName }}". Ela será marcada como fechada e sai da lista de comandas abertas.
              </p>
              <div class="confirm-actions">
                <button type="button" class="ar-ghost-btn" [disabled]="closingEmpty()" (click)="showCloseConfirm.set(false)">Cancelar</button>
                <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="closingEmpty()" (click)="confirmCloseEmpty(c)">
                  {{ closingEmpty() ? 'Fechando…' : 'Fechar comanda' }}
                </button>
              </div>
            </ar-modal>
          }
        } @else {
          <p class="state-text">Comanda não encontrada.</p>
        }
```

- [ ] **Step 4: Add styles**

Find this block in the component's `styles`:

```css
    .close-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    @media (max-width: 1180px) {
```

Replace it with:

```css
    .close-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .close-empty-btn {
      width: 100%;
      margin-top: 14px;
      height: 44px;
    }

    .confirm-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
      margin: 0 0 10px;
    }

    .confirm-body {
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 22px;
    }

    .confirm-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      flex-wrap: wrap;
    }

    @media (max-width: 1180px) {
```

- [ ] **Step 5: Add signals, computed, and the confirm method to the component class**

Find:

```ts
  protected readonly paymentMethod = signal<ArenaComandaPaymentMethod>('pix');
  protected readonly paying = signal(false);
  protected readonly payError = signal<string | null>(null);
```

Replace it with:

```ts
  protected readonly paymentMethod = signal<ArenaComandaPaymentMethod>('pix');
  protected readonly paying = signal(false);
  protected readonly payError = signal<string | null>(null);

  protected readonly showCloseConfirm = signal(false);
  protected readonly closingEmpty = signal(false);
  protected readonly closeEmptyError = signal<string | null>(null);
```

Find:

```ts
  protected readonly canPay = computed(() => {
    const c = this.comanda();
    return !!c && comandaStatusIsActive(c.status) && this.remainingCents() > 0;
  });
```

Replace it with:

```ts
  protected readonly canPay = computed(() => {
    const c = this.comanda();
    return !!c && comandaStatusIsActive(c.status) && this.remainingCents() > 0;
  });
  protected readonly canCloseEmpty = computed(() => {
    const c = this.comanda();
    return !!c && !comandaCloseEmptyBlockReason(c);
  });
```

Find the end of the `submitPayment` method (currently the last method in the class, right before the class's closing `}`):

```ts
  protected async submitPayment(comanda: ArenaComanda): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const uid = this.auth.user()?.uid;
    if (!arenaId || !uid) return;

    const amountCents = parseBRLInputToCents(this.paymentAmountValue());
    if (amountCents <= 0) {
      this.payError.set('Informe um valor válido.');
      return;
    }

    this.paying.set(true);
    this.payError.set(null);
    try {
      await registerPayment(arenaFirestore(), comanda.id, this.paymentMethod(), amountCents, comanda.customerName, uid);
      await this.loadAll(arenaId, comanda.id);
    } catch (err) {
      this.payError.set(err instanceof Error ? err.message : 'Não foi possível registrar o pagamento.');
    } finally {
      this.paying.set(false);
    }
  }
}
```

Replace it with:

```ts
  protected async submitPayment(comanda: ArenaComanda): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const uid = this.auth.user()?.uid;
    if (!arenaId || !uid) return;

    const amountCents = parseBRLInputToCents(this.paymentAmountValue());
    if (amountCents <= 0) {
      this.payError.set('Informe um valor válido.');
      return;
    }

    this.paying.set(true);
    this.payError.set(null);
    try {
      await registerPayment(arenaFirestore(), comanda.id, this.paymentMethod(), amountCents, comanda.customerName, uid);
      await this.loadAll(arenaId, comanda.id);
    } catch (err) {
      this.payError.set(err instanceof Error ? err.message : 'Não foi possível registrar o pagamento.');
    } finally {
      this.paying.set(false);
    }
  }

  protected async confirmCloseEmpty(comanda: ArenaComanda): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.closingEmpty.set(true);
    this.closeEmptyError.set(null);
    try {
      await closeEmptyComanda(arenaFirestore(), comanda.id);
      this.showCloseConfirm.set(false);
      await this.loadAll(arenaId, comanda.id);
    } catch (err) {
      this.closeEmptyError.set(err instanceof Error ? err.message : 'Não foi possível fechar a comanda.');
    } finally {
      this.closingEmpty.set(false);
    }
  }
}
```

- [ ] **Step 6: Compile-check**

Run from `frontend/`:

```bash
npx ng build arena
```

Expected: build completes with no TypeScript or template errors.

- [ ] **Step 7: Manual verification in the browser**

Run from `frontend/`:

```bash
npx ng serve arena
```

Log in as an arena manager with the `pdvComandas` capability (Pro/Parceiro plan) and:
1. Open **Comandas** → **Nova comanda**, create one with any customer name, don't add any item.
2. On the comanda detail page, confirm a "Fechar comanda" card appears (instead of no card / instead of the payment card) with a "Fechar comanda" button.
3. Click it → confirm the modal "Fechar comanda sem consumo?" appears with Cancelar / Fechar comanda buttons.
4. Click "Cancelar" → modal closes, comanda still open.
5. Click "Fechar comanda" again → confirm → modal closes, comanda now shows "Comanda fechada sem consumo." and no longer offers the close button.
6. Go back to the comandas list → confirm the comanda is gone from "Abertas" and appears under "Fechadas" with total R$0,00.
7. Open a different comanda, add at least one item, confirm the "Fechar comanda" card does **not** appear (only "Registrar pagamento" does).

- [ ] **Step 8: Commit**

```bash
git add frontend/projects/arena/src/app/painel/orders/panel-order-detail.component.ts
git commit -m "feat(arena-web): let managers close an empty comanda"
```

---

## Task 4: Flutter — guard function `canCloseEmptyComanda`

**Files:**
- Modify: `nexago_app/lib/features/arena/domain/comandas/arena_comanda_logic.dart`
- Test: `nexago_app/test/features/arena/comandas/arena_comanda_logic_test.dart`

**Interfaces:**
- Produces: `bool canCloseEmptyComanda(ArenaComanda comanda)`, exported from `arena_comanda_logic.dart`.

- [ ] **Step 1: Write the failing tests**

In `nexago_app/test/features/arena/comandas/arena_comanda_logic_test.dart`, find the end of the `canReverseComandaItem` group (the last group in the file, right before the closing `}` of `main()`):

```dart
    test('blocks reverse on closed comanda', () {
      final item = const ArenaComandaItem(
        id: 'i1',
        productId: 'p1',
        productName: 'Agua',
        quantity: 1,
        unitPriceCents: 500,
        lineTotalCents: 500,
        source: ArenaComandaItemSource.counter,
        addedByName: 'Gestor',
        addedByUid: 'u1',
      );
      expect(
        canReverseComandaItem(
          comanda(status: ArenaComandaStatus.closed),
          item,
        ),
        isFalse,
      );
    });
  });
}
```

Replace it with:

```dart
    test('blocks reverse on closed comanda', () {
      final item = const ArenaComandaItem(
        id: 'i1',
        productId: 'p1',
        productName: 'Agua',
        quantity: 1,
        unitPriceCents: 500,
        lineTotalCents: 500,
        source: ArenaComandaItemSource.counter,
        addedByName: 'Gestor',
        addedByUid: 'u1',
      );
      expect(
        canReverseComandaItem(
          comanda(status: ArenaComandaStatus.closed),
          item,
        ),
        isFalse,
      );
    });
  });

  group('canCloseEmptyComanda', () {
    test('allows closing an open comanda with no consumption', () {
      expect(canCloseEmptyComanda(comanda(rentalCents: 0)), isTrue);
    });

    test('blocks closing when the comanda has consumption', () {
      expect(canCloseEmptyComanda(comanda(rentalCents: 6000)), isFalse);
    });

    test('blocks closing a comanda that is already closed', () {
      expect(
        canCloseEmptyComanda(
          comanda(status: ArenaComandaStatus.closed, rentalCents: 0),
        ),
        isFalse,
      );
    });
  });
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `nexago_app/`:

```bash
flutter test test/features/arena/comandas/arena_comanda_logic_test.dart --plain-name canCloseEmptyComanda
```

Expected: compile error — `canCloseEmptyComanda` is not defined.

- [ ] **Step 3: Implement the guard function**

Append at the end of `nexago_app/lib/features/arena/domain/comandas/arena_comanda_logic.dart` (after the closing `}` of `canReverseComandaItem`, currently the last line):

```dart

/// Comandas sem nenhum lançamento (`totalCents == 0`) nunca fecham pelo fluxo
/// normal de pagamento — `registerPayment` exige `amountCents > 0` — então
/// precisam de um fechamento direto.
bool canCloseEmptyComanda(ArenaComanda comanda) {
  return comanda.status.isActive && comanda.totalCents == 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run from `nexago_app/`:

```bash
flutter test test/features/arena/comandas/arena_comanda_logic_test.dart
```

Expected: `All tests passed!`, including the 3 new `canCloseEmptyComanda` cases.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/arena/domain/comandas/arena_comanda_logic.dart nexago_app/test/features/arena/comandas/arena_comanda_logic_test.dart
git commit -m "feat(arena-app): add canCloseEmptyComanda guard"
```

---

## Task 5: Flutter — repository method `closeEmptyComanda`

**Files:**
- Modify: `nexago_app/lib/features/arena/data/arena_comandas_repository.dart`

**Interfaces:**
- Consumes: `canCloseEmptyComanda` from Task 4 (already imported in this file via `arena_comanda_logic.dart`).
- Produces: `Future<ArenaComanda> closeEmptyComanda({required String comandaId})` on `ArenaComandasRepository`, reachable via the existing `arenaComandasRepositoryProvider` (`arena_comanda_providers.dart:14`).

No test for this step — mirrors the existing precedent in this file: `registerPayment` and `addItemsBatch` are transaction-based and have no unit test (no Firestore emulator wired up for this module).

- [ ] **Step 1: Implement `closeEmptyComanda`**

In `nexago_app/lib/features/arena/data/arena_comandas_repository.dart`, find the end of `registerPayment` and the class's closing brace:

```dart
      updated = comanda.copyWith(
        paidCents: newPaidCents,
        status: newStatus,
      );
    });

    return (comanda: updated, payment: createdPayment);
  }
}
```

Replace it with:

```dart
      updated = comanda.copyWith(
        paidCents: newPaidCents,
        status: newStatus,
      );
    });

    return (comanda: updated, payment: createdPayment);
  }

  Future<ArenaComanda> closeEmptyComanda({required String comandaId}) async {
    final managerUid = _auth.currentUser?.uid;
    if (managerUid == null || managerUid.isEmpty) {
      throw StateError('Usuário não autenticado.');
    }

    final comandaRef = _comandas.doc(comandaId.trim());
    late ArenaComanda updated;

    await _firestore.runTransaction((txn) async {
      final comandaSnap = await txn.get(comandaRef);
      if (!comandaSnap.exists) {
        throw StateError('Comanda não encontrada.');
      }
      final comanda = ArenaComanda.fromFirestore(comandaSnap);
      if (!canCloseEmptyComanda(comanda)) {
        throw StateError('Comanda não pode ser fechada sem consumo.');
      }

      txn.update(comandaRef, {
        'status': ArenaComandaStatus.closed.firestoreValue,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      updated = comanda.copyWith(status: ArenaComandaStatus.closed);
    });

    return updated;
  }
}
```

- [ ] **Step 2: Static analysis**

Run from `nexago_app/`:

```bash
flutter analyze lib/features/arena/data/arena_comandas_repository.dart
```

Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add nexago_app/lib/features/arena/data/arena_comandas_repository.dart
git commit -m "feat(arena-app): add closeEmptyComanda repository method"
```

---

## Task 6: Flutter — "Fechar comanda" UI on the detail page

**Files:**
- Modify: `nexago_app/lib/features/arena/presentation/comandas/arena_comanda_detail_page.dart`

**Interfaces:**
- Consumes: `canCloseEmptyComanda` (Task 4), `ArenaComandasRepository.closeEmptyComanda` via `arenaComandasRepositoryProvider` (Task 5), `ArenaComandaClosedArgs` (`arena_comanda_closed_args.dart`).

No test for this step — this is a widget wiring change verified manually (see Step 5), matching how the existing "Fechar conta →" flow has no widget test either.

- [ ] **Step 1: Add imports**

In `nexago_app/lib/features/arena/presentation/comandas/arena_comanda_detail_page.dart`, find:

```dart
import '../../domain/arena_plan.dart';
import '../../domain/arena_plan_providers.dart';
import '../../domain/comandas/arena_comanda_logic.dart';
import '../../domain/comandas/arena_comanda_providers.dart';
```

Replace it with:

```dart
import '../../domain/arena_plan.dart';
import '../../domain/arena_plan_providers.dart';
import '../../domain/comandas/arena_comanda.dart';
import '../../domain/comandas/arena_comanda_closed_args.dart';
import '../../domain/comandas/arena_comanda_logic.dart';
import '../../domain/comandas/arena_comanda_providers.dart';
```

- [ ] **Step 2: Compute the new gate and wire the button**

Find:

```dart
            final items = itemsAsync.valueOrNull ?? const [];
            final canClose = comanda.totalCents > 0;
```

Replace it with:

```dart
            final items = itemsAsync.valueOrNull ?? const [];
            final canClose = comanda.totalCents > 0;
            final canCloseEmpty = canCloseEmptyComanda(comanda);
```

Find:

```dart
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton(
                          onPressed: canClose
                              ? () {
                                  context.pushNamed(
                                    AppRouteNames.arenaComandaPayment,
                                    pathParameters: {'comandaId': comandaId},
                                  );
                                }
                              : null,
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.brand,
                            foregroundColor: AppColors.black,
                            disabledBackgroundColor:
                                AppColors.brand.withValues(alpha: 0.35),
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: const Text(
                            'Fechar conta →',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
```

Replace it with:

```dart
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton(
                          onPressed: canClose
                              ? () {
                                  context.pushNamed(
                                    AppRouteNames.arenaComandaPayment,
                                    pathParameters: {'comandaId': comandaId},
                                  );
                                }
                              : canCloseEmpty
                                  ? () => _closeEmptyComanda(
                                        context,
                                        ref,
                                        comandaId: comandaId,
                                        comanda: comanda,
                                      )
                                  : null,
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.brand,
                            foregroundColor: AppColors.black,
                            disabledBackgroundColor:
                                AppColors.brand.withValues(alpha: 0.35),
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: Text(
                            canCloseEmpty && !canClose
                                ? 'Fechar comanda'
                                : 'Fechar conta →',
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
```

- [ ] **Step 3: Add the confirmation + close handler**

Find the end of the `ArenaComandaDetailPage` class and the start of `_HeaderIconButton`:

```dart
          error: (e, _) => ArenaErrorState(message: '$e'),
        ),
      ),
    );
  }
}

class _HeaderIconButton extends StatelessWidget {
```

Replace it with:

```dart
          error: (e, _) => ArenaErrorState(message: '$e'),
        ),
      ),
    );
  }
}

Future<void> _closeEmptyComanda(
  BuildContext context,
  WidgetRef ref, {
  required String comandaId,
  required ArenaComanda comanda,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text('Fechar comanda sem consumo?'),
        content: Text(
          'Nenhum item foi lançado em "${comanda.customerName}". '
          'Ela será marcada como fechada e sai da lista de comandas abertas.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Fechar comanda'),
          ),
        ],
      );
    },
  );

  if (confirmed != true || !context.mounted) return;

  try {
    final updated = await ref
        .read(arenaComandasRepositoryProvider)
        .closeEmptyComanda(comandaId: comandaId);

    if (!context.mounted) return;
    context.pushReplacementNamed(
      AppRouteNames.arenaComandaClosed,
      pathParameters: {'comandaId': comandaId},
      extra: ArenaComandaClosedArgs(comanda: updated, payments: const []),
    );
  } catch (e) {
    if (context.mounted) showAppSnackBar(context, '$e');
  }
}

class _HeaderIconButton extends StatelessWidget {
```

- [ ] **Step 4: Static analysis**

Run from `nexago_app/`:

```bash
flutter analyze lib/features/arena/presentation/comandas/arena_comanda_detail_page.dart
```

Expected: `No issues found!`

- [ ] **Step 5: Manual verification on a simulator/device**

Run the app against the `dev` Firebase project, log in as an arena manager, and:
1. Open a comanda with zero items. Confirm the bottom-right button now reads "Fechar comanda" (not greyed out).
2. Tap it → confirm the "Fechar comanda sem consumo?" dialog appears with Cancelar / Fechar comanda.
3. Tap "Cancelar" → dialog closes, comanda still open, button unchanged.
4. Tap "Fechar comanda" again → confirm → app navigates to the "comanda fechada" screen with an empty payments list (no crash, no broken layout).
5. Go back to the comandas list → confirm the comanda no longer appears among open comandas.
6. Open a different comanda with at least one item → confirm the button still reads "Fechar conta →" and behaves as before (navigates to payment).

- [ ] **Step 6: Commit**

```bash
git add nexago_app/lib/features/arena/presentation/comandas/arena_comanda_detail_page.dart
git commit -m "feat(arena-app): let managers close an empty comanda"
```
