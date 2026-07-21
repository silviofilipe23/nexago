# Cupom de desconto — exibir nos detalhes da reserva + aplicar no checkout mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar o cupom de desconto aplicado nos detalhes da reserva (painel da arena e portal do atleta, web e Flutter) e permitir aplicar cupom no checkout mobile, com paridade ao que já existe no checkout web.

**Architecture:** Zero mudanças de backend — `quoteArenaBooking`/`createArenaBooking` já aceitam `couponCode` e já retornam/persistem `couponId`/`couponCode`/`couponDiscountReais`. Todo o trabalho é client-side: estender os parsers/models de cada plataforma para ler os três campos do doc `arenaBookings` (ou da resposta do callable), exibi-los condicionalmente nas telas de detalhe existentes, e — só no Flutter, que ainda não tem essa capacidade — adicionar a UI de aplicar cupom no checkout, espelhando `arena-payment.component.ts` (Angular athlete).

**Tech Stack:** Angular standalone components + signals (Karma/Jasmine), Flutter + Riverpod (flutter_test, sem mockito/mocktail — fakes manuais implementando as interfaces do Firebase).

## Global Constraints

- Nenhuma mudança em `functions/` — os callables já suportam cupom de ponta a ponta.
- Cupom nunca acumula com promoção automática (vale o maior desconto) — decisão do backend, não recalcular no client.
- Erro de cupom inválido/expirado/esgotado/pior-que-promoção nunca bloqueia a reserva — mostra mensagem perto do campo, cotação volta a valer sem cupom.
- Strings de UI em português; código (nomes de variáveis, funções, arquivos) em inglês (convenção do projeto, `CLAUDE.md`).
- As linhas/cards novos só aparecem quando a reserva tem cupom aplicado — reservas sem cupom não mudam de aparência.

---

### Task 1: Angular arena — modelo `ArenaBooking` ganha campos de cupom

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/bookings/arena-booking.model.ts`
- Test: `frontend/projects/arena/src/app/painel/bookings/arena-booking.model.spec.ts` (novo)

**Interfaces:**
- Produces: `ArenaBooking.couponCode: string | null`, `ArenaBooking.couponDiscountReais: number | null` — consumidos pelo Task 2.

- [ ] **Step 1: Escrever o spec que falha**

Criar `frontend/projects/arena/src/app/painel/bookings/arena-booking.model.spec.ts`:

```typescript
import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { arenaBookingFromDoc } from './arena-booking.model';

function fakeDoc(id: string, data: Record<string, unknown>): QueryDocumentSnapshot {
  return {
    id,
    data: () => data,
  } as unknown as QueryDocumentSnapshot;
}

describe('arenaBookingFromDoc — cupom', () => {
  it('parseia couponCode e couponDiscountReais quando presentes', () => {
    const booking = arenaBookingFromDoc(
      fakeDoc('b1', {
        arenaId: 'a1',
        athleteId: 'u1',
        courtId: 'c1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
        amountReais: 85,
        couponCode: 'VERAO10',
        couponDiscountReais: 15,
      }),
    );

    expect(booking.couponCode).toBe('VERAO10');
    expect(booking.couponDiscountReais).toBe(15);
  });

  it('reserva sem cupom vira null nos dois campos', () => {
    const booking = arenaBookingFromDoc(
      fakeDoc('b2', {
        arenaId: 'a1',
        athleteId: 'u1',
        courtId: 'c1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
        amountReais: 100,
      }),
    );

    expect(booking.couponCode).toBeNull();
    expect(booking.couponDiscountReais).toBeNull();
  });

  it('couponCode em branco vira null (mesmo tratamento de optionalTrimmed)', () => {
    const booking = arenaBookingFromDoc(
      fakeDoc('b3', {
        arenaId: 'a1',
        athleteId: 'u1',
        courtId: 'c1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
        couponCode: '   ',
      }),
    );

    expect(booking.couponCode).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o spec e confirmar que falha**

Run: `cd frontend && npx ng test arena --watch=false --include='**/arena-booking.model.spec.ts'`
Expected: FAIL — `Property 'couponCode' does not exist` (erro de compilação TS) ou `expected undefined to be 'VERAO10'`.

- [ ] **Step 3: Adicionar os campos à interface e ao parser**

Em `frontend/projects/arena/src/app/painel/bookings/arena-booking.model.ts`, na interface `ArenaBooking` (linha 17-39), adicionar após `createdAt: Date | null;` (linha 38):

```typescript
  createdAt: Date | null;
  couponCode: string | null;
  couponDiscountReais: number | null;
}
```

Em `arenaBookingFromDoc` (linha 63-91), adicionar antes do `createdAt: toDate(d['createdAt']),` (linha 89):

```typescript
    createdAt: toDate(d['createdAt']),
    couponCode: optionalTrimmed(d['couponCode']),
    couponDiscountReais: typeof d['couponDiscountReais'] === 'number' ? d['couponDiscountReais'] : null,
  };
}
```

- [ ] **Step 4: Rodar o spec e confirmar que passa**

Run: `cd frontend && npx ng test arena --watch=false --include='**/arena-booking.model.spec.ts'`
Expected: PASS — 3 specs verdes.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/bookings/arena-booking.model.ts frontend/projects/arena/src/app/painel/bookings/arena-booking.model.spec.ts
git commit -m "feat(arena): parseia cupom de desconto em ArenaBooking"
```

---

### Task 2: Angular arena — exibir cupom no detalhe da reserva

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/bookings/panel-booking-detail.component.ts`

**Interfaces:**
- Consumes: `ArenaBooking.couponCode`, `ArenaBooking.couponDiscountReais` (Task 1), `formatBRL(value: number | null): string` (já existe no mesmo model).

- [ ] **Step 1: Adicionar a linha condicional no card "Pagamento"**

Em `frontend/projects/arena/src/app/painel/bookings/panel-booking-detail.component.ts`, dentro do template (linhas 81-85), depois da linha `Situação`:

```html
            <ar-panel-card title="Pagamento">
              <div class="row"><span class="label">Valor</span><span class="value">{{ formatBRL(booking()!.amountReais) }}</span></div>
              <div class="row"><span class="label">Canal</span><span class="value">{{ booking()!.paymentChannel ?? 'Direto (sem link)' }}</span></div>
              <div class="row"><span class="label">Situação</span><span class="value">{{ booking()!.paymentStatus ?? '—' }}</span></div>
              @if (booking()!.couponCode; as code) {
                <div class="row"><span class="label">Cupom</span><span class="value">{{ code }} (-{{ formatBRL(booking()!.couponDiscountReais) }})</span></div>
              }
            </ar-panel-card>
```

- [ ] **Step 2: Rodar o build do projeto arena pra garantir que compila**

Run: `cd frontend && npx ng build arena`
Expected: build sem erros.

- [ ] **Step 3: QA manual no navegador**

Abrir o painel da arena (`npx ng serve arena`), navegar até uma reserva que tenha `couponCode` gravado no Firestore (emulador/dev), abrir o detalhe e confirmar que a linha "Cupom" aparece com o código e o valor descontado. Abrir uma reserva sem cupom e confirmar que a linha não aparece.

- [ ] **Step 4: Commit**

```bash
git add frontend/projects/arena/src/app/painel/bookings/panel-booking-detail.component.ts
git commit -m "feat(arena): exibe cupom aplicado no detalhe da reserva"
```

---

### Task 3: Angular athlete — `ArenaBookingDoc` ganha campos de cupom

**Files:**
- Modify: `frontend/projects/athlete/src/app/data/arena-bookings-repository.ts`
- Test: `frontend/projects/athlete/src/app/data/arena-bookings-repository.spec.ts` (novo)

**Interfaces:**
- Produces: `ArenaBookingDoc.couponCode: string | null`, `ArenaBookingDoc.couponDiscountReais: number` — consumidos pelo Task 4. `bookingFromSnapshot` passa a ser exportado.

- [ ] **Step 1: Escrever o spec que falha**

Criar `frontend/projects/athlete/src/app/data/arena-bookings-repository.spec.ts`:

```typescript
import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import { bookingFromSnapshot } from './arena-bookings-repository';

function fakeSnapshot(id: string, data: Record<string, unknown> | undefined): DocumentSnapshot<DocumentData> {
  return {
    id,
    data: () => data,
  } as unknown as DocumentSnapshot<DocumentData>;
}

describe('bookingFromSnapshot — cupom', () => {
  it('parseia couponCode e couponDiscountReais quando presentes', () => {
    const booking = bookingFromSnapshot(
      fakeSnapshot('b1', {
        arenaId: 'a1',
        arenaName: 'Arena Beach',
        courtId: 'c1',
        courtName: 'Quadra 1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
        amountReais: 85,
        couponCode: 'VERAO10',
        couponDiscountReais: 15,
      }),
    );

    expect(booking?.couponCode).toBe('VERAO10');
    expect(booking?.couponDiscountReais).toBe(15);
  });

  it('reserva sem cupom: couponCode null e couponDiscountReais zero', () => {
    const booking = bookingFromSnapshot(
      fakeSnapshot('b2', {
        arenaId: 'a1',
        arenaName: 'Arena Beach',
        courtId: 'c1',
        courtName: 'Quadra 1',
        date: '2026-08-10',
        startTime: '19:00',
        endTime: '20:00',
        amountReais: 100,
      }),
    );

    expect(booking?.couponCode).toBeNull();
    expect(booking?.couponDiscountReais).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o spec e confirmar que falha**

Run: `cd frontend && npx ng test athlete --watch=false --include='**/arena-bookings-repository.spec.ts'`
Expected: FAIL — `'bookingFromSnapshot' is not exported` (erro de compilação TS).

- [ ] **Step 3: Exportar `bookingFromSnapshot` e adicionar os campos**

Em `frontend/projects/athlete/src/app/data/arena-bookings-repository.ts`:

Na interface `ArenaBookingDoc` (linhas 86-115), adicionar após `createdAt: Date | null;` (linha 114):

```typescript
  createdAt: Date | null;
  couponCode: string | null;
  couponDiscountReais: number;
}
```

Na função `bookingFromSnapshot` (linha 361), trocar a declaração `function bookingFromSnapshot(` por `export function bookingFromSnapshot(` e adicionar os dois campos no objeto retornado, antes de `createdAt: toDateOrNull(data['createdAt']),` (linha 388):

```typescript
    recurringBookingId: optionalStr(data['recurringBookingId']),
    createdAt: toDateOrNull(data['createdAt']),
    couponCode: optionalStr(data['couponCode']),
    couponDiscountReais: Number(data['couponDiscountReais']) || 0,
  };
}
```

- [ ] **Step 4: Rodar o spec e confirmar que passa**

Run: `cd frontend && npx ng test athlete --watch=false --include='**/arena-bookings-repository.spec.ts'`
Expected: PASS — 2 specs verdes.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/data/arena-bookings-repository.ts frontend/projects/athlete/src/app/data/arena-bookings-repository.spec.ts
git commit -m "feat(athlete): parseia cupom de desconto em ArenaBookingDoc"
```

---

### Task 4: Angular athlete — card "Pagamento" no detalhe da reserva

**Files:**
- Modify: `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.html`
- Modify: `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.scss`

**Interfaces:**
- Consumes: `ArenaBookingDoc.couponCode`/`couponDiscountReais` (Task 3), `formatBRL` e `paymentMethodLabel()` já existentes no componente (`athlete-booking-detail.component.ts:309-317`).

- [ ] **Step 1: Adicionar o card "Pagamento" na coluna lateral**

Em `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.html`, na `bd-col--side` (linha 121), inserir um novo `bd-card` entre o card "Localização" (fecha na linha 132) e o card "Gerenciar" (abre na linha 134):

```html
          <div class="bd-card">
            <span class="bd-card-kicker">Localização</span>
            <div class="bd-map-placeholder">
              <app-location-map [lat]="arena()?.lat ?? null" [lng]="arena()?.lng ?? null" [label]="b.arenaName" [googleMapsApiKey]="googleMapsApiKey" />
            </div>
            <p class="bd-address">{{ addressLabel() }}</p>
            <a [href]="mapsUrl()" target="_blank" rel="noreferrer" class="bd-btn-primary bd-btn-full">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.4-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.3" /></svg>
              <span>Ver rotas</span>
            </a>
          </div>

          <div class="bd-card">
            <span class="bd-card-kicker">Pagamento</span>
            <div class="bd-payment-row">
              <span class="bd-payment-label">Valor total</span>
              <span class="bd-payment-value">{{ formatBRL(b.amountReais) }}</span>
            </div>
            <div class="bd-payment-row">
              <span class="bd-payment-label">Forma</span>
              <span class="bd-payment-value">{{ paymentMethodLabel() }}</span>
            </div>
            @if (b.couponCode; as code) {
              <div class="bd-payment-row">
                <span class="bd-payment-label">Cupom</span>
                <span class="bd-payment-value">{{ code }} (-{{ formatBRL(b.couponDiscountReais) }})</span>
              </div>
            }
          </div>

          <div class="bd-card">
            <span class="bd-card-kicker">Gerenciar</span>
```

- [ ] **Step 2: Adicionar as classes SCSS do novo card**

Em `frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.scss`, logo após o bloco `.bd-card-title` (linhas 391-398), antes do comentário `// ── Team`:

```scss
.bd-card-title {
  font-family: var(--nx-font-display);
  font-weight: 800;
  font-size: 17px;
  letter-spacing: -0.01em;
  color: var(--nx-text);
  margin: 0;
}

.bd-payment-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  font-size: 13px;
}

.bd-payment-label {
  color: var(--nx-text-dim);
}

.bd-payment-value {
  color: var(--nx-text);
  font-weight: 600;
  text-align: right;
}

// ── Team ─────────────────────────────────────────────────────
```

- [ ] **Step 3: Rodar o build do projeto athlete**

Run: `cd frontend && npx ng build athlete`
Expected: build sem erros.

- [ ] **Step 4: QA manual no navegador**

Abrir o portal do atleta, ir em Agenda → uma reserva com cupom aplicado, confirmar que o card "Pagamento" aparece com Valor, Forma e Cupom. Abrir uma reserva sem cupom e confirmar que o card aparece sem a linha "Cupom", e que uma reserva com split de pagamento continua mostrando o card "Rachar pagamento" normalmente (nada quebrou).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.html frontend/projects/athlete/src/app/agenda/booking-detail/athlete-booking-detail.component.scss
git commit -m "feat(athlete): card de pagamento com cupom no detalhe da reserva"
```

---

### Task 5: Flutter atleta — `MyBookingItem` ganha campos de cupom

**Files:**
- Modify: `nexago_app/lib/features/arenas/domain/my_booking_item.dart`
- Test: `nexago_app/test/features/arenas/domain/my_booking_item_coupon_test.dart` (novo)

**Interfaces:**
- Produces: `MyBookingItem.couponCode: String?`, `MyBookingItem.couponDiscountReais: double?` — consumidos pelo Task 6.

- [ ] **Step 1: Escrever o teste que falha**

Criar `nexago_app/test/features/arenas/domain/my_booking_item_coupon_test.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';

void main() {
  group('MyBookingItem.fromFirestore — cupom', () {
    test('parseia couponCode e couponDiscountReais quando presentes', () {
      final item = MyBookingItem.fromFirestore(
        _FakeDoc(
          id: 'b1',
          data: {
            'arenaName': 'Arena Beach',
            'date': '2026-08-10',
            'startTime': '19:00',
            'endTime': '20:00',
            'couponCode': 'VERAO10',
            'couponDiscountReais': 15.0,
          },
        ),
      );

      expect(item.couponCode, 'VERAO10');
      expect(item.couponDiscountReais, 15.0);
    });

    test('reserva sem cupom: os dois campos ficam null', () {
      final item = MyBookingItem.fromFirestore(
        _FakeDoc(
          id: 'b2',
          data: {
            'arenaName': 'Arena Beach',
            'date': '2026-08-10',
            'startTime': '19:00',
            'endTime': '20:00',
          },
        ),
      );

      expect(item.couponCode, isNull);
      expect(item.couponDiscountReais, isNull);
    });

    test('couponCode em branco vira null', () {
      final item = MyBookingItem.fromFirestore(
        _FakeDoc(
          id: 'b3',
          data: {
            'arenaName': 'Arena Beach',
            'date': '2026-08-10',
            'startTime': '19:00',
            'endTime': '20:00',
            'couponCode': '   ',
          },
        ),
      );

      expect(item.couponCode, isNull);
    });
  });
}

class _FakeDoc implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDoc({required this.id, required Map<String, dynamic> data})
      : _fields = data;

  @override
  final String id;
  final Map<String, dynamic> _fields;

  @override
  bool get exists => true;

  @override
  DocumentReference<Map<String, dynamic>> get reference =>
      throw UnimplementedError();

  @override
  SnapshotMetadata get metadata => throw UnimplementedError();

  @override
  Map<String, dynamic>? data() => _fields;

  @override
  dynamic get(Object field) => _fields[field];

  @override
  dynamic operator [](Object field) => _fields[field];
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd nexago_app && flutter test test/features/arenas/domain/my_booking_item_coupon_test.dart`
Expected: FAIL — `The named parameter 'couponCode' isn't defined` (erro de compilação).

- [ ] **Step 3: Adicionar os campos e o parsing**

Em `nexago_app/lib/features/arenas/domain/my_booking_item.dart`, no construtor (linhas 9-32), adicionar após `this.recurringBookingId,` (linha 31):

```dart
    this.recurringBookingId,
    this.couponCode,
    this.couponDiscountReais,
  });
```

Nos campos da classe, após `final String? recurringBookingId;` (linha 62):

```dart
  final String? recurringBookingId;

  /// Código do cupom de desconto aplicado (`couponCode` gravado por
  /// `createArenaBooking`) — `null` quando a reserva não usou cupom.
  final String? couponCode;

  /// Valor em reais descontado pelo cupom — `null` junto com [couponCode].
  final double? couponDiscountReais;
```

Em `fromFirestore` (linha 68), adicionar antes do `return MyBookingItem(` (linha 127):

```dart
    final couponCodeRaw = data['couponCode'];
    final couponCode = couponCodeRaw is String && couponCodeRaw.trim().isNotEmpty
        ? couponCodeRaw.trim()
        : null;
    final couponDiscountReais = (data['couponDiscountReais'] as num?)?.toDouble();

    return MyBookingItem(
```

E dentro do construtor retornado, após `recurringBookingId: _pickString(data['recurringBookingId']),` (linha 151):

```dart
      recurringBookingId: _pickString(data['recurringBookingId']),
      couponCode: couponCode,
      couponDiscountReais: couponDiscountReais,
    );
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd nexago_app && flutter test test/features/arenas/domain/my_booking_item_coupon_test.dart`
Expected: PASS — 3 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/arenas/domain/my_booking_item.dart nexago_app/test/features/arenas/domain/my_booking_item_coupon_test.dart
git commit -m "feat(app): parseia cupom de desconto em MyBookingItem"
```

---

### Task 6: Flutter atleta — exibir cupom em "Minhas reservas"

**Files:**
- Modify: `nexago_app/lib/features/arenas/presentation/my_bookings/my_bookings_details_sheet.dart`

**Interfaces:**
- Consumes: `MyBookingItem.couponCode`/`couponDiscountReais` (Task 5), `formatBRL(double)` de `core/formatting/app_currency_format.dart`.

- [ ] **Step 1: Adicionar o import do formatador de moeda**

Em `nexago_app/lib/features/arenas/presentation/my_bookings/my_bookings_details_sheet.dart`, no topo do arquivo (linha 1-9), adicionar:

```dart
import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/my_booking_item.dart';
import 'my_bookings_status.dart';
```

- [ ] **Step 2: Adicionar a linha de cupom após a linha de pagamento**

No `build()` da classe `BookingDetailsSheet`, após o bloco `_MetaRow` de pagamento (linhas 78-81):

```dart
                _MetaRow(
                  icon: Icons.account_balance_wallet_outlined,
                  text: item.paymentDisplay.label,
                ),
                if (item.couponCode != null) ...[
                  SizedBox(height: 8),
                  _MetaRow(
                    icon: Icons.local_offer_outlined,
                    text:
                        'Cupom ${item.couponCode} (-${formatBRL(item.couponDiscountReais ?? 0)})',
                  ),
                ],
                SizedBox(height: 8),
                Row(
```

- [ ] **Step 3: Rodar `flutter analyze` pra garantir que compila sem erros**

Run: `cd nexago_app && flutter analyze lib/features/arenas/presentation/my_bookings/my_bookings_details_sheet.dart`
Expected: `No issues found!`

- [ ] **Step 4: QA manual no simulador**

Abrir "Minhas reservas" no app, tocar numa reserva com cupom aplicado (criada via checkout web com cupom, já que o mobile ainda não aplica cupom antes do Task 11) e confirmar que a linha "Cupom CODIGO (-R$ X,XX)" aparece na sheet de detalhes. Tocar numa reserva sem cupom e confirmar que a linha não aparece.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/arenas/presentation/my_bookings/my_bookings_details_sheet.dart
git commit -m "feat(app): exibe cupom aplicado na sheet de detalhes da reserva"
```

---

### Task 7: Flutter gestor de arena — função pura `arenaBookingCouponInfo`

**Files:**
- Modify: `nexago_app/lib/features/arena/domain/arena_booking_labels.dart`
- Test: `nexago_app/test/features/arena/domain/arena_booking_labels_coupon_test.dart` (novo)

**Interfaces:**
- Produces: `class ArenaBookingCouponInfo { final String code; final double discountReais; }`, `ArenaBookingCouponInfo? arenaBookingCouponInfo(Map<String, dynamic>? data)` — consumidos pelo Task 8.

- [ ] **Step 1: Escrever o teste que falha**

Criar `nexago_app/test/features/arena/domain/arena_booking_labels_coupon_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_labels.dart';

void main() {
  group('arenaBookingCouponInfo', () {
    test('retorna código e desconto quando o doc tem cupom', () {
      final info = arenaBookingCouponInfo({
        'couponCode': 'VERAO10',
        'couponDiscountReais': 15.0,
      });

      expect(info, isNotNull);
      expect(info!.code, 'VERAO10');
      expect(info.discountReais, 15.0);
    });

    test('retorna null quando o doc não tem cupom', () {
      expect(arenaBookingCouponInfo({'amountReais': 100}), isNull);
    });

    test('retorna null quando couponCode é vazio/em branco', () {
      expect(arenaBookingCouponInfo({'couponCode': '   '}), isNull);
    });

    test('retorna null quando data é null', () {
      expect(arenaBookingCouponInfo(null), isNull);
    });

    test('couponDiscountReais ausente vira zero (não null) quando há código', () {
      final info = arenaBookingCouponInfo({'couponCode': 'X'});
      expect(info!.discountReais, 0);
    });
  });
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd nexago_app && flutter test test/features/arena/domain/arena_booking_labels_coupon_test.dart`
Expected: FAIL — `The function 'arenaBookingCouponInfo' isn't defined`.

- [ ] **Step 3: Implementar a função pura**

Em `nexago_app/lib/features/arena/domain/arena_booking_labels.dart`, adicionar ao final do arquivo (após a função `_mapBookingStatus`, linhas 309-322):

```dart
String _mapBookingStatus(String raw) {
  switch (raw.toLowerCase()) {
    case 'active':
    case 'confirmed':
      return 'Ativa';
    case 'cancelled':
    case 'canceled':
      return 'Cancelada';
    case 'completed':
      return 'Concluída';
    default:
      return raw;
  }
}

/// Cupom de desconto aplicado na reserva (`couponCode`/`couponDiscountReais`
/// gravados por `createArenaBooking`) — `null` quando não há cupom.
class ArenaBookingCouponInfo {
  const ArenaBookingCouponInfo({required this.code, required this.discountReais});

  final String code;
  final double discountReais;
}

ArenaBookingCouponInfo? arenaBookingCouponInfo(Map<String, dynamic>? data) {
  if (data == null) return null;
  final code = (data['couponCode'] as String?)?.trim();
  if (code == null || code.isEmpty) return null;
  final discount = (data['couponDiscountReais'] as num?)?.toDouble() ?? 0;
  return ArenaBookingCouponInfo(code: code, discountReais: discount);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd nexago_app && flutter test test/features/arena/domain/arena_booking_labels_coupon_test.dart`
Expected: PASS — 5 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/arena/domain/arena_booking_labels.dart nexago_app/test/features/arena/domain/arena_booking_labels_coupon_test.dart
git commit -m "feat(app): funcao pura arenaBookingCouponInfo para o painel do gestor"
```

---

### Task 8: Flutter gestor de arena — exibir cupom no detalhe da reserva

**Files:**
- Modify: `nexago_app/lib/features/arena/presentation/widgets/arena_booking_detail_payment.dart`

**Interfaces:**
- Consumes: `arenaBookingCouponInfo(Map<String, dynamic>? data)` (Task 7), `formatBRL(double)` já importado no arquivo.

- [ ] **Step 1: Importar a função e computar o cupom**

Em `nexago_app/lib/features/arena/presentation/widgets/arena_booking_detail_payment.dart`, no topo (linha 1-8), adicionar o import:

```dart
import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/formatting/app_currency_format.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_bookings_grouping.dart';
import 'arena_dashboard_tokens.dart';
```

No `build()` (linha 26), adicionar a variável `coupon` junto às demais (linhas 27-33):

```dart
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final payment = arenaBookingPaymentInfo(bookingData);
    final coupon = arenaBookingCouponInfo(bookingData);
    final hours = ArenaBookingsGrouping.bookingDurationHours(
      startTime,
      endTime,
    );
```

- [ ] **Step 2: Adicionar a linha de cupom no breakdown**

Após o bloco condicional de breakdown/PIX pago (linhas 97-112), antes da linha "Forma: ..." (linha 113-120):

```dart
            if (payment.isDepositOnly &&
                (payment.paidOnlineReais != null || payment.dueOnsiteReais != null)) ...[
              SizedBox(height: 14),
              _PaymentBreakdown(info: payment),
            ] else if (payment.isPaidInFull &&
                payment.paidOnlineReais != null &&
                payment.paidOnlineReais! > 0) ...[
              SizedBox(height: 10),
              Text(
                'Recebido via PIX: ${formatBRL(payment.paidOnlineReais!)}',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.win,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
            if (coupon != null) ...[
              SizedBox(height: 10),
              _BreakdownRow(
                icon: Icons.local_offer_rounded,
                iconColor: AppColors.brand,
                label: 'Cupom ${coupon.code}',
                value: '-${formatBRL(coupon.discountReais)}',
                valueColor: AppColors.brand,
              ),
            ],
            SizedBox(height: 10),
            Text(
              'Forma: ${payment.channel}',
```

- [ ] **Step 3: Rodar `flutter analyze`**

Run: `cd nexago_app && flutter analyze lib/features/arena/presentation/widgets/arena_booking_detail_payment.dart`
Expected: `No issues found!`

- [ ] **Step 4: QA manual no simulador**

No painel do gestor de arena (Flutter), abrir o detalhe de uma reserva com cupom aplicado e confirmar que aparece a linha "Cupom CODIGO -R$ X,XX" no card "Pagamento". Abrir uma reserva sem cupom e confirmar que a linha não aparece e o resto do card não mudou.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/arena/presentation/widgets/arena_booking_detail_payment.dart
git commit -m "feat(app): exibe cupom aplicado no detalhe de reserva do gestor"
```

---

### Task 9: Flutter checkout — camada de dados (`ArenaBookingQuote`, `CreateBookingResult`, `BookingService`)

**Files:**
- Modify: `nexago_app/lib/features/arenas/domain/arena_booking_quote.dart`
- Modify: `nexago_app/lib/features/arenas/data/booking_service.dart`
- Test: `nexago_app/test/features/arenas/data/booking_service_coupon_test.dart` (novo)

**Interfaces:**
- Produces: `ArenaBookingQuote.couponApplied/couponId/couponDiscountReais`, `CreateBookingResult.couponApplied/couponId/couponDiscountReais`, `BookingService.quoteBooking({..., String? couponCode})`, `BookingService.createBookingAtomically({..., String? couponCode})` — consumidos pelo Task 11.

- [ ] **Step 1: Adicionar os campos de cupom a `ArenaBookingQuote`**

Em `nexago_app/lib/features/arenas/domain/arena_booking_quote.dart`, trocar a classe `ArenaBookingQuote` (linhas 19-26) por:

```dart
class ArenaBookingQuote {
  const ArenaBookingQuote({
    required this.amountReais,
    required this.lineItems,
    this.couponApplied = false,
    this.couponId,
    this.couponDiscountReais = 0,
  });

  final double amountReais;
  final List<ArenaBookingQuoteLine> lineItems;

  /// `true` quando o código digitado foi aplicado (mais vantajoso que a
  /// promoção automática já em vigor na quadra). Igual ao web
  /// (`ArenaBookingQuote.couponApplied`).
  final bool couponApplied;
  final String? couponId;
  final double couponDiscountReais;
```

- [ ] **Step 2: Escrever o teste que falha (payload e parsing do `BookingService`)**

O diretório `nexago_app/test/features/arenas/data/` ainda não existe — criar antes:

```bash
mkdir -p nexago_app/test/features/arenas/data
```

Criar `nexago_app/test/features/arenas/data/booking_service_coupon_test.dart`:

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/data/booking_service.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_confirm_args.dart';

void main() {
  final args = ArenaBookingConfirmArgs(
    arenaId: 'arena1',
    arenaName: 'Arena Beach',
    courtId: 'court1',
    courtName: 'Quadra 1',
    date: DateTime(2026, 8, 10),
    startTime: '19:00',
    endTime: '20:00',
    amountReais: 100,
    selectedSlotStartTimes: const ['19:00'],
  );

  group('BookingService.quoteBooking — cupom', () {
    test('inclui couponCode no payload quando informado', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'quoteArenaBooking': {'amountReais': 85.0, 'lineItems': <dynamic>[]},
      });
      final service = BookingService(_UnusedFirestore(), functions: functions);

      await service.quoteBooking(args: args, couponCode: 'VERAO10');

      expect(functions.calledPayloads.single?['couponCode'], 'VERAO10');
    });

    test('omite couponCode do payload quando não informado', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'quoteArenaBooking': {'amountReais': 100.0, 'lineItems': <dynamic>[]},
      });
      final service = BookingService(_UnusedFirestore(), functions: functions);

      await service.quoteBooking(args: args);

      expect(functions.calledPayloads.single?.containsKey('couponCode'), isFalse);
    });

    test('parseia couponApplied/couponId/couponDiscountReais da resposta', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'quoteArenaBooking': {
          'amountReais': 85.0,
          'lineItems': <dynamic>[],
          'couponApplied': true,
          'couponId': 'c1',
          'couponDiscountReais': 15.0,
        },
      });
      final service = BookingService(_UnusedFirestore(), functions: functions);

      final quote = await service.quoteBooking(args: args, couponCode: 'VERAO10');

      expect(quote.couponApplied, isTrue);
      expect(quote.couponId, 'c1');
      expect(quote.couponDiscountReais, 15.0);
    });

    test('cupom pior que promoção: couponApplied false e desconto zero', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'quoteArenaBooking': {
          'amountReais': 100.0,
          'lineItems': <dynamic>[],
          'couponApplied': false,
          'couponId': null,
          'couponDiscountReais': 0.0,
        },
      });
      final service = BookingService(_UnusedFirestore(), functions: functions);

      final quote = await service.quoteBooking(args: args, couponCode: 'PIOR5');

      expect(quote.couponApplied, isFalse);
      expect(quote.couponDiscountReais, 0);
    });
  });

  group('BookingService.createBookingAtomically — cupom', () {
    test('inclui couponCode no payload e parseia campos de cupom da resposta', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createArenaBooking': {
          'bookingId': 'b1',
          'amountReais': 85.0,
          'amountToPayNowReais': 85.0,
          'amountDueOnsiteReais': 0.0,
          'paymentMode': 'onsite',
          'paymentFraction': 1.0,
          'couponApplied': true,
          'couponId': 'c1',
          'couponDiscountReais': 15.0,
        },
      });
      final service = BookingService(_UnusedFirestore(), functions: functions);

      final result = await service.createBookingAtomically(
        args: args,
        athleteId: 'u1',
        couponCode: 'VERAO10',
      );

      expect(functions.calledPayloads.single?['couponCode'], 'VERAO10');
      expect(result.couponApplied, isTrue);
      expect(result.couponId, 'c1');
      expect(result.couponDiscountReais, 15.0);
    });

    test('sem cupom: payload sem couponCode e resultado com couponApplied false', () async {
      final functions = _FakeFirebaseFunctions(responses: {
        'createArenaBooking': {'bookingId': 'b1', 'amountReais': 100.0},
      });
      final service = BookingService(_UnusedFirestore(), functions: functions);

      final result = await service.createBookingAtomically(args: args, athleteId: 'u1');

      expect(functions.calledPayloads.single?.containsKey('couponCode'), isFalse);
      expect(result.couponApplied, isFalse);
      expect(result.couponId, isNull);
      expect(result.couponDiscountReais, 0);
    });
  });
}

/// Fake mínimo de [FirebaseFunctions]: registra o payload de toda callable
/// disparada e devolve a resposta configurada em [responses], sem rede real.
/// Mesmo padrão de `test/features/athlete/athlete_profile_repository_test.dart`.
class _FakeFirebaseFunctions implements FirebaseFunctions {
  _FakeFirebaseFunctions({required this.responses});

  final Map<String, Object?> responses;
  final List<Map<String, dynamic>?> calledPayloads = [];

  @override
  HttpsCallable httpsCallable(String name, {HttpsCallableOptions? options}) {
    return _FakeHttpsCallable(
      onCall: (parameters) {
        calledPayloads.add(
          parameters is Map ? Map<String, dynamic>.from(parameters) : null,
        );
      },
      result: responses[name],
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallable implements HttpsCallable {
  _FakeHttpsCallable({required this.onCall, required this.result});

  final void Function(dynamic parameters) onCall;
  final Object? result;

  @override
  Future<HttpsCallableResult<T>> call<T>([dynamic parameters]) async {
    onCall(parameters);
    return _FakeHttpsCallableResult<T>(result);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHttpsCallableResult<T> implements HttpsCallableResult<T> {
  _FakeHttpsCallableResult(this._data);

  final Object? _data;

  @override
  T get data => _data as T;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// `BookingService` exige um `FirebaseFirestore`, mas `quoteBooking`/
/// `createBookingAtomically` não o tocam — nunca deve ser chamado aqui.
class _UnusedFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `cd nexago_app && flutter test test/features/arenas/data/booking_service_coupon_test.dart`
Expected: FAIL — `No named parameter with the name 'couponCode'` (erro de compilação).

- [ ] **Step 4: Adicionar `couponCode` ao payload, ao `quoteBooking` e ao parsing da cota**

Em `nexago_app/lib/features/arenas/data/booking_service.dart`, trocar `_bookingCallablePayload` (linhas 307-321) por:

```dart
  static Map<String, dynamic> _bookingCallablePayload(
    ArenaBookingConfirmArgs args, {
    String? couponCode,
  }) {
    return <String, dynamic>{
      'arenaId': args.arenaId,
      'arenaName': args.arenaName,
      'courtId': args.courtId,
      'courtName': args.courtName,
      'date': args.dateKey,
      'startTime': args.startTime,
      'endTime': args.endTime,
      if (args.selectedSlotStartTimes.isNotEmpty)
        'selectedSlotStartTimes': args.selectedSlotStartTimes,
      if (couponCode != null && couponCode.trim().isNotEmpty)
        'couponCode': couponCode.trim(),
    };
  }
```

Trocar `quoteBooking` (linhas 120-135) por:

```dart
  /// Cota autoritativa (promoções + preço por quadra + cupom) via Cloud Function.
  Future<ArenaBookingQuote> quoteBooking({
    required ArenaBookingConfirmArgs args,
    String? couponCode,
  }) async {
    if (!args.isValid) {
      throw BookingException(
          'Dados da reserva inválidos. Volte e escolha outro horário.');
    }
    try {
      final result = await _functions.httpsCallable('quoteArenaBooking').call(
        _bookingCallablePayload(args, couponCode: couponCode),
      );
      return _parseQuoteResponse(result.data);
    } on FirebaseFunctionsException catch (e) {
      throw BookingException(_mapFunctionsMessage(e), code: _functionsCode(e));
    }
  }
```

Trocar o `return ArenaBookingQuote(...)` no final de `_parseQuoteResponse` (linha 176) por:

```dart
    return ArenaBookingQuote(
      amountReais: amount,
      lineItems: lines,
      couponApplied: map['couponApplied'] == true,
      couponId: map['couponId'] as String?,
      couponDiscountReais: (map['couponDiscountReais'] as num?)?.toDouble() ?? 0,
    );
  }
```

- [ ] **Step 5: Adicionar `couponCode` a `createBookingAtomically` e os campos a `CreateBookingResult`**

Trocar a assinatura de `createBookingAtomically` (linhas 180-185) por:

```dart
  /// Reserva via callable `createArenaBooking` (preço validado no servidor).
  Future<CreateBookingResult> createBookingAtomically({
    required ArenaBookingConfirmArgs args,
    required String athleteId,
    String paymentMode = 'onsite',
    double paymentFraction = 1.0,
    String? couponCode,
  }) async {
```

Trocar a montagem do payload dentro do `try` (linhas 200-206) por:

```dart
    try {
      final payload = _bookingCallablePayload(args, couponCode: couponCode);
      payload['clientAmountReais'] = args.amountReais;
      payload['paymentMode'] = paymentMode;
      if (paymentMode == 'pix') {
        payload['paymentFraction'] = paymentFraction;
      }
```

Trocar o `return CreateBookingResult(...)` (linhas 224-235) por:

```dart
      return CreateBookingResult(
        bookingId: bookingId,
        amountReais: amount,
        amountToPayNowReais:
            (data['amountToPayNowReais'] as num?)?.toDouble() ?? 0,
        amountDueOnsiteReais:
            (data['amountDueOnsiteReais'] as num?)?.toDouble() ?? amount,
        paymentMode: (data['paymentMode'] as String?) ?? paymentMode,
        paymentFraction:
            (data['paymentFraction'] as num?)?.toDouble() ?? paymentFraction,
        paymentExpiresAt: data['paymentExpiresAt'] as String?,
        couponApplied: data['couponApplied'] == true,
        couponId: data['couponId'] as String?,
        couponDiscountReais:
            (data['couponDiscountReais'] as num?)?.toDouble() ?? 0,
      );
```

Trocar a classe `CreateBookingResult` (linhas 709-729) por:

```dart
class CreateBookingResult {
  const CreateBookingResult({
    required this.bookingId,
    required this.amountReais,
    this.amountToPayNowReais = 0,
    this.amountDueOnsiteReais = 0,
    this.paymentMode = 'onsite',
    this.paymentFraction = 1,
    this.paymentExpiresAt,
    this.couponApplied = false,
    this.couponId,
    this.couponDiscountReais = 0,
  });

  final String bookingId;
  final double amountReais;
  final double amountToPayNowReais;
  final double amountDueOnsiteReais;
  final String paymentMode;
  final double paymentFraction;
  final String? paymentExpiresAt;
  final bool couponApplied;
  final String? couponId;
  final double couponDiscountReais;

  bool get isPix => paymentMode == 'pix';
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `cd nexago_app && flutter test test/features/arenas/data/booking_service_coupon_test.dart`
Expected: PASS — 6 testes verdes.

- [ ] **Step 7: Rodar a suíte completa de testes do app pra garantir que nada quebrou**

Run: `cd nexago_app && flutter test`
Expected: todos os testes passam (incluindo os já existentes, ex.: `athlete_profile_repository_test.dart`, `my_booking_item_recurring_test.dart`).

- [ ] **Step 8: Commit**

```bash
git add nexago_app/lib/features/arenas/domain/arena_booking_quote.dart nexago_app/lib/features/arenas/data/booking_service.dart nexago_app/test/features/arenas/data/booking_service_coupon_test.dart
git commit -m "feat(app): BookingService aplica e retorna cupom de desconto"
```

---

### Task 10: Flutter checkout — widget `BookingConfirmCouponField`

**Files:**
- Create: `nexago_app/lib/features/arenas/presentation/widgets/booking_confirm/booking_confirm_coupon_field.dart`

**Interfaces:**
- Consumes: `formatBRL(double)` de `core/formatting/app_currency_format.dart`.
- Produces: `class BookingConfirmCouponField extends StatelessWidget` com propriedades `controller`, `applying`, `appliedCode`, `discountReais`, `errorText`, `enabled`, `onApply`, `onRemove` — consumido pelo Task 11.

- [ ] **Step 1: Criar o widget**

Criar `nexago_app/lib/features/arenas/presentation/widgets/booking_confirm/booking_confirm_coupon_field.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Campo de cupom de desconto no checkout — espelha `arena-payment.component.ts`
/// (Angular athlete): digitar código + "Aplicar"; quando aplicado, mostra um
/// chip com o desconto e opção de remover. Erro de cupom nunca bloqueia a
/// reserva, só aparece perto do campo (ver `_applyCoupon` na página de confirmação).
class BookingConfirmCouponField extends StatelessWidget {
  const BookingConfirmCouponField({
    super.key,
    required this.controller,
    required this.applying,
    required this.appliedCode,
    required this.discountReais,
    required this.errorText,
    required this.enabled,
    required this.onApply,
    required this.onRemove,
  });

  final TextEditingController controller;
  final bool applying;
  final String? appliedCode;
  final double discountReais;
  final String? errorText;
  final bool enabled;
  final VoidCallback onApply;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final code = appliedCode;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'CUPOM DE DESCONTO (OPCIONAL)',
          style: AppTypography.mono(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w600,
            fontSize: 14,
            letterSpacing: 0.8,
          ),
        ),
        SizedBox(height: 10),
        if (code != null)
          _AppliedCouponChip(
            code: code,
            discountReais: discountReais,
            onRemove: onRemove,
          )
        else
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  enabled: enabled && !applying,
                  textCapitalization: TextCapitalization.characters,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: context.themeColors.onSurface,
                  ),
                  decoration: InputDecoration(
                    hintText: 'Ex: VERAO10',
                    hintStyle: theme.textTheme.bodyMedium?.copyWith(
                      color: context.themeColors.onSurfaceMuted.withValues(
                        alpha: 0.7,
                      ),
                    ),
                    filled: true,
                    fillColor: context.themeColors.surfaceRaised,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(
                        color: Colors.white.withValues(alpha: 0.06),
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(
                        color: Colors.white.withValues(alpha: 0.06),
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide(
                        color: AppColors.brand.withValues(alpha: 0.6),
                      ),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 14,
                    ),
                  ),
                ),
              ),
              SizedBox(width: 10),
              SizedBox(
                height: 52,
                child: FilledButton(
                  onPressed: enabled && !applying ? onApply : null,
                  child: applying
                      ? SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.black,
                          ),
                        )
                      : Text('Aplicar'),
                ),
              ),
            ],
          ),
        if (errorText != null) ...[
          SizedBox(height: 8),
          Text(
            errorText!,
            style: theme.textTheme.bodySmall?.copyWith(color: AppColors.live),
          ),
        ],
      ],
    );
  }
}

class _AppliedCouponChip extends StatelessWidget {
  const _AppliedCouponChip({
    required this.code,
    required this.discountReais,
    required this.onRemove,
  });

  final String code;
  final double discountReais;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: AppColors.brand.withValues(alpha: 0.1),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(Icons.local_offer_rounded, size: 18, color: AppColors.brand),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Cupom $code aplicado (-${formatBRL(discountReais)})',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: context.themeColors.onSurface,
              ),
            ),
          ),
          TextButton(onPressed: onRemove, child: Text('Remover')),
        ],
      ),
    );
  }
}
```

- [ ] **Step 2: Rodar `flutter analyze`**

Run: `cd nexago_app && flutter analyze lib/features/arenas/presentation/widgets/booking_confirm/booking_confirm_coupon_field.dart`
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add nexago_app/lib/features/arenas/presentation/widgets/booking_confirm/booking_confirm_coupon_field.dart
git commit -m "feat(app): widget de campo de cupom no checkout"
```

---

### Task 11: Flutter checkout — aplicar cupom em `ArenaBookingConfirmPage`

**Files:**
- Modify: `nexago_app/lib/features/arenas/presentation/arena_booking_confirm_page.dart`

**Interfaces:**
- Consumes: `BookingService.quoteBooking({required args, String? couponCode})`, `BookingService.createBookingAtomically({..., String? couponCode})` (Task 9), `BookingConfirmCouponField` (Task 10).

- [ ] **Step 1: Importar o novo widget**

Em `nexago_app/lib/features/arenas/presentation/arena_booking_confirm_page.dart`, junto aos demais imports de `widgets/booking_confirm/` (linhas 27-32):

```dart
import 'widgets/booking_confirm/booking_confirm_app_bar.dart';
import 'widgets/booking_confirm/booking_confirm_cancellation_card.dart';
import 'widgets/booking_confirm/booking_confirm_coupon_field.dart';
import 'widgets/booking_confirm/booking_confirm_hero_card.dart';
import 'widgets/booking_confirm/booking_confirm_observations_field.dart';
import 'widgets/booking_confirm/booking_confirm_price_summary.dart';
import 'widgets/booking_confirm/booking_confirm_sticky_bar.dart';
```

- [ ] **Step 2: Adicionar o estado do cupom**

No `_ArenaBookingConfirmPageState` (linhas 54-61), adicionar após `late final TextEditingController _observationsController;`:

```dart
class _ArenaBookingConfirmPageState
    extends ConsumerState<ArenaBookingConfirmPage> {
  bool _submitting = false;
  _PaymentChoice _paymentChoice = _PaymentChoice.atVenue;
  ArenaBookingQuote? _quote;
  bool _quoting = false;
  String? _lastQuoteKey;
  late final TextEditingController _observationsController;
  late final TextEditingController _couponController;
  bool _couponApplying = false;
  String? _couponError;
  String? _appliedCouponCode;
  double _couponDiscountReais = 0;
```

Em `initState` (linhas 66-70):

```dart
  @override
  void initState() {
    super.initState();
    _observationsController = TextEditingController();
    _couponController = TextEditingController();
  }
```

Em `dispose` (linhas 72-76):

```dart
  @override
  void dispose() {
    _observationsController.dispose();
    _couponController.dispose();
    super.dispose();
  }
```

- [ ] **Step 3: Adicionar `_applyCoupon` e `_removeCoupon`**

Após o método `_loadQuote` (linhas 90-102), adicionar:

```dart
  /// Revalida o código digitado contra a cotação — nunca bloqueia a reserva
  /// se der errado (código inválido/expirado/esgotado ou pior que a
  /// promoção já aplicada): mostra o erro perto do campo e a cotação volta
  /// a valer sem cupom. Espelha `applyCoupon()` do web (`arena-payment.component.ts`).
  Future<void> _applyCoupon(ArenaBookingConfirmArgs args) async {
    final code = _couponController.text.trim();
    if (code.isEmpty || _couponApplying) return;

    setState(() {
      _couponApplying = true;
      _couponError = null;
    });
    try {
      final quote = await ref
          .read(bookingServiceProvider)
          .quoteBooking(args: args, couponCode: code);
      if (!mounted) return;
      setState(() {
        _quote = quote;
        if (quote.couponApplied) {
          _appliedCouponCode = code.toUpperCase();
          _couponDiscountReais = quote.couponDiscountReais;
        } else {
          _appliedCouponCode = null;
          _couponDiscountReais = 0;
          _couponError =
              'Este cupom não é mais vantajoso do que a promoção já aplicada nesta quadra.';
        }
      });
    } on BookingException catch (e) {
      if (!mounted) return;
      setState(() {
        _appliedCouponCode = null;
        _couponDiscountReais = 0;
        _couponError = e.message;
      });
      _loadQuote(args);
    } finally {
      if (mounted) setState(() => _couponApplying = false);
    }
  }

  void _removeCoupon(ArenaBookingConfirmArgs args) {
    _couponController.clear();
    setState(() {
      _appliedCouponCode = null;
      _couponDiscountReais = 0;
      _couponError = null;
    });
    _loadQuote(args);
  }
```

- [ ] **Step 4: Inserir o widget no formulário**

No `build()`, entre o `BookingConfirmPriceSummary` (linhas 366-373) e o `BookingConfirmCancellationCard` (linhas 374-384):

```dart
                              Padding(
                                padding: const EdgeInsets.only(top: 18),
                                child: BookingConfirmPriceSummary(
                                  courtLineLabel: courtLineLabel,
                                  courtAmountLabel: _quoting
                                      ? 'Calculando…'
                                      : formatBRL(displayTotal),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.only(top: 14),
                                child: BookingConfirmCouponField(
                                  controller: _couponController,
                                  applying: _couponApplying,
                                  appliedCode: _appliedCouponCode,
                                  discountReais: _couponDiscountReais,
                                  errorText: _couponError,
                                  enabled: !_submitting,
                                  onApply: () => _applyCoupon(args),
                                  onRemove: () => _removeCoupon(args),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.only(top: 14),
                                child: BookingConfirmCancellationCard(
                                  title:
                                      ArenaBookingCancellationPolicy.freeCancellationTitle(),
                                  subtitle:
                                      ArenaBookingCancellationPolicy.freeCancellationSubtitle(
                                        args.arenaName,
                                      ),
                                ),
                              ),
```

- [ ] **Step 5: Passar o cupom ao criar a reserva (PIX e no local)**

Em `_confirmWithPix` (linhas 104-125), trocar a chamada de `createBookingAtomically`:

```dart
      final created = resumed ??
          await bookingService.createBookingAtomically(
            args: args,
            athleteId: user.uid,
            paymentMode: 'pix',
            paymentFraction: 1.0,
            couponCode: _appliedCouponCode,
          );
```

Em `_finalizeBookingPayAtArena` (linhas 194-197), trocar:

```dart
      final created = await ref
          .read(bookingServiceProvider)
          .createBookingAtomically(
            args: args,
            athleteId: user.uid,
            couponCode: _appliedCouponCode,
          );
```

- [ ] **Step 6: Rodar `flutter analyze` no arquivo inteiro**

Run: `cd nexago_app && flutter analyze lib/features/arenas/presentation/arena_booking_confirm_page.dart`
Expected: `No issues found!`

- [ ] **Step 7: Rodar a suíte completa de testes do app**

Run: `cd nexago_app && flutter test`
Expected: todos os testes passam.

- [ ] **Step 8: QA manual no simulador/dispositivo**

No app, ir até a confirmação de uma reserva (`ArenaBookingConfirmPage`):
1. Digitar um código de cupom válido (criado previamente no painel da arena) e tocar "Aplicar" — confirmar que o total exibido (resumo de valores e barra fixa) atualiza com o desconto, e que o chip "Cupom CODIGO aplicado" aparece.
2. Tocar "Remover" — confirmar que o total volta ao valor original.
3. Digitar um código inválido/inexistente e tocar "Aplicar" — confirmar que aparece a mensagem de erro perto do campo e que a reserva ainda pode ser confirmada normalmente (sem cupom).
4. Aplicar um cupom válido e confirmar a reserva pagando no local — abrir o detalhe da reserva recém-criada (Task 6) e confirmar que o cupom aparece.
5. Repetir aplicando um cupom válido e pagando via PIX — confirmar que o valor do QR Code já reflete o desconto, e que o detalhe da reserva (Task 6) mostra o cupom depois de paga.

- [ ] **Step 9: Commit**

```bash
git add nexago_app/lib/features/arenas/presentation/arena_booking_confirm_page.dart
git commit -m "feat(app): aplica cupom de desconto no checkout mobile"
```

---

## Nota sobre cobertura de testes

`ArenaBookingConfirmPage` (Task 11) não tem testes automatizados de widget para o fluxo de aplicar/remover cupom — nenhuma outra parte dessa página (seleção de forma de pagamento, fluxo PIX) tem testes de widget hoje, e montar um harness de `ProviderScope`+`GoRouter` só para isso está fora do escopo desta feature. A cobertura fica em duas camadas: a lógica de payload/parsing testada isoladamente em `BookingService` (Task 9) e QA manual ponta a ponta (Task 11, Step 8). Da mesma forma, os cards/linhas de exibição em Angular (Tasks 2 e 4) e no widget de pagamento do gestor Flutter (Task 8) não têm teste de componente — nenhum dos dois arquivos tinha spec antes desta feature; a cobertura é a mesma dos parsers que alimentam esses templates (Tasks 1, 3 e 7) mais QA manual.
