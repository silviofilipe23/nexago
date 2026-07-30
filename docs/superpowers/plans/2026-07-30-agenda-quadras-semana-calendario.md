# Agenda de quadras: visão "Semana" + calendário de data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o toggle "Dia"/"Semana" da tela `/painel/agenda` funcionar de verdade
(hoje é só cosmético) e adicionar um calendário para pular direto para qualquer data, sem
depender só das setas anterior/próximo.

**Architecture:** Extrai a matemática de "quais 7 dias formam a semana" para um módulo
puro novo; generaliza o overlay de reservas (`applyBookingsOverlay`) para casar por
`dateKey` do próprio slot em vez de um `dateKey` externo fixo, o que o torna válido tanto
para 1 dia quanto para 7; adiciona `watchArenaWeekSlots` ao repositório, reaproveitando o
mesmo listener único do Firestore (sem custo extra de leitura); cria dois componentes de
UI novos e pequenos — um calendário de data única e uma grade semanal — espelhando os
padrões visuais/estruturais dos componentes irmãos que já existem (`DateRangePickerComponent`,
`AgendaGridComponent`); e liga tudo em `PanelAgendaComponent`, que passa a assinar um dos
dois listeners de slots (dia OU semana, nunca os dois) conforme o toggle.

**Tech Stack:** Angular 20 standalone components + signals, TypeScript, Karma/Jasmine
(`ng test arena --watch=false`), Firestore (`firebase/firestore` client SDK).

## Global Constraints

- Componentes standalone (sem `NgModule`); nunca `standalone: true` explícito no decorator
  (é o default).
- `changeDetection: ChangeDetectionStrategy.OnPush` em todo `@Component` novo.
- Usar `input()`/`output()` (funções), nunca `@Input()`/`@Output()`.
- Estado local em `signal()`, derivado em `computed()`; nunca `.mutate()` — só `.set()`/`.update()`.
- Native control flow (`@if`/`@for`/`@switch`) nos templates; nunca `*ngIf`/`*ngFor`.
- Nunca `ngClass`/`ngStyle` — usar bindings `[class.x]`/`[style.x.px]`.
- `inject()` em vez de injeção via construtor.
- Qualquer data (`dateKey` `YYYY-MM-DD` ↔ `Date`) é sempre construída/lida por
  **componentes locais** (`getFullYear()`/`getMonth()`/`getDate()`, `new Date(y, m-1, d)`)
  — nunca `Date.parse`, `new Date(string)`, ou `.toISOString()`. Esse projeto já teve um
  bug de produção (slot aparecendo bloqueado na véspera) causado exatamente por misturar
  data local com parsing UTC; todo código novo de data segue a mesma regra que
  `dateKeyOf`/`shiftDay`/`buildMonthGrid` já seguem.
- Semana sempre segunda→domingo (decisão do usuário, mesma convenção de `ARENA_WEEKDAYS`
  em `courts-schedule-repository.ts`).
- Rodar testes com `ng test arena --watch=false` (executa a suíte inteira do projeto
  `arena` uma vez e sai — sem isso o Karma fica em modo watch e nunca retorna).

---

### Task 1: `weekDatesFor` — datas da semana (segunda→domingo)

**Files:**
- Create: `frontend/projects/arena/src/app/painel/agenda/agenda-week-math.ts`
- Test: `frontend/projects/arena/src/app/painel/agenda/agenda-week-math.spec.ts`

**Interfaces:**
- Consumes: `dateKeyOf(date: Date): string` de `../bookings/arena-booking.model.ts` (já
  existe, formata `YYYY-MM-DD` a partir de componentes locais).
- Produces: `export interface WeekDay { date: Date; dateKey: string; isToday: boolean }` e
  `export function weekDatesFor(date: Date): WeekDay[]` — usados pelas Tasks 3, 5 e 6.

- [ ] **Step 1: Escrever o teste (vai falhar — o arquivo ainda não existe)**

```ts
// frontend/projects/arena/src/app/painel/agenda/agenda-week-math.spec.ts
import { weekDatesFor } from './agenda-week-math';

describe('weekDatesFor', () => {
  it('quinta no meio da semana retorna segunda a domingo da mesma semana', () => {
    const week = weekDatesFor(new Date(2026, 6, 30)); // quinta 30/07/2026
    expect(week.map((d) => d.dateKey)).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('já sendo segunda, retorna ela mesma como primeiro dia', () => {
    const week = weekDatesFor(new Date(2026, 6, 27)); // segunda 27/07/2026
    expect(week[0].dateKey).toBe('2026-07-27');
    expect(week[6].dateKey).toBe('2026-08-02');
  });

  it('já sendo domingo, retorna ela mesma como último dia', () => {
    const week = weekDatesFor(new Date(2026, 7, 2)); // domingo 02/08/2026
    expect(week[0].dateKey).toBe('2026-07-27');
    expect(week[6].dateKey).toBe('2026-08-02');
  });

  it('vira o ano corretamente', () => {
    const week = weekDatesFor(new Date(2026, 11, 31)); // quinta 31/12/2026
    expect(week.map((d) => d.dateKey)).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });

  it('marca isToday só no dia que bate com a data atual real', () => {
    const today = new Date();
    const week = weekDatesFor(today);
    const todayEntries = week.filter((d) => d.isToday);
    expect(todayEntries.length).toBe(1);
    const expectedKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(todayEntries[0].dateKey).toBe(expectedKey);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `ng test arena --watch=false`
Expected: FAIL — `Cannot find module './agenda-week-math'` (ou erro equivalente de import),
já que `agenda-week-math.ts` ainda não existe.

- [ ] **Step 3: Implementar**

```ts
// frontend/projects/arena/src/app/painel/agenda/agenda-week-math.ts
import { dateKeyOf } from '../bookings/arena-booking.model';

export interface WeekDay {
  date: Date;
  dateKey: string;
  isToday: boolean;
}

/** Segunda a domingo (convenção ISO, mesma de ARENA_WEEKDAYS) contendo `date`. Tudo em
 *  componentes locais de Date — nunca UTC (ver Global Constraints). */
export function weekDatesFor(date: Date): WeekDay[] {
  const jsDay = date.getDay(); // 0=domingo…6=sábado
  const isoWeekday = jsDay === 0 ? 7 : jsDay; // 1=segunda…7=domingo
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (isoWeekday - 1));
  const todayKey = dateKeyOf(new Date());

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const dateKey = dateKeyOf(d);
    return { date: d, dateKey, isToday: dateKey === todayKey };
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `ng test arena --watch=false`
Expected: PASS — bloco `weekDatesFor` com as 5 specs verdes.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/agenda/agenda-week-math.ts frontend/projects/arena/src/app/painel/agenda/agenda-week-math.spec.ts
git commit -m "feat(arena): weekDatesFor — datas da semana segunda a domingo"
```

---

### Task 2: Generalizar `applyBookingsOverlay` para casar por dia do próprio slot

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/agenda/arena-schedule-grouping.ts:30-45`
- Modify: `frontend/projects/arena/src/app/painel/agenda/panel-agenda.component.ts:447`
- Test: `frontend/projects/arena/src/app/painel/agenda/arena-schedule-grouping.spec.ts` (novo)

**Interfaces:**
- Consumes: `ArenaSlot` (`arena-slot.model.ts`, campos `dateKey`/`courtId`/`startTime`/`endTime`/`status`),
  `ArenaBooking`/`bookingIsActive` (`../bookings/arena-booking.model.ts`).
- Produces: `export function applyBookingsOverlay(slots: readonly ArenaSlot[], bookings: readonly ArenaBooking[]): ArenaSlot[]`
  (assinatura muda — **perde o terceiro parâmetro `dateKey`**). Usado por `panel-agenda.component.ts`
  (Task 2, dia) e pela Task 6 (semana).

Hoje `applyBookingsOverlay(slots, bookings, dateKey)` filtra `bookings` por um `dateKey`
externo fixo, porque só existe 1 dia na tela. Cada `ArenaSlot` já carrega seu próprio
`dateKey` — casar `booking.dateKey === slot.dateKey` direto no `.map` funciona igual para
1 dia (todo slot do array compartilha o mesmo dateKey) e para 7 (cada slot tem o seu),
sem precisar de query adicional nem de looping externo por dia.

- [ ] **Step 1: Escrever o teste (vai falhar — assinatura ainda não mudou)**

```ts
// frontend/projects/arena/src/app/painel/agenda/arena-schedule-grouping.spec.ts
import type { ArenaBooking } from '../bookings/arena-booking.model';
import type { ArenaSlot } from './arena-slot.model';
import { applyBookingsOverlay } from './arena-schedule-grouping';

function makeSlot(overrides: Partial<ArenaSlot> = {}): ArenaSlot {
  return {
    id: 's1',
    arenaId: 'arena1',
    courtId: 'court1',
    dateKey: '2026-07-30',
    startTime: '09:00',
    endTime: '10:00',
    status: 'available',
    isVirtual: true,
    bookingId: null,
    bookingAthleteId: null,
    blockReason: null,
    blockNote: null,
    ...overrides,
  };
}

function makeBooking(overrides: Partial<ArenaBooking> = {}): ArenaBooking {
  return {
    id: 'b1',
    arenaId: 'arena1',
    athleteId: 'athlete1',
    courtId: 'court1',
    courtName: 'Quadra 1',
    dateKey: '2026-07-30',
    startTime: '09:00',
    endTime: '10:00',
    status: 'confirmed',
    attendanceStatus: 'pending',
    customerName: null,
    isRecurring: false,
    recurringBookingId: null,
    amountReais: null,
    paymentChannel: null,
    paymentStatus: null,
    confirmedParticipants: 1,
    canceledAt: null,
    cancelReason: null,
    createdAt: null,
    couponCode: null,
    couponDiscountReais: null,
    ...overrides,
  };
}

describe('applyBookingsOverlay', () => {
  it('marca como booked um slot available que casa com uma reserva ativa do mesmo dia', () => {
    const slots = [makeSlot()];
    const bookings = [makeBooking()];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result[0].status).toBe('booked');
    expect(result[0].bookingId).toBe('b1');
  });

  it('não aplica overlay de uma reserva de OUTRO dia (dateKey diferente)', () => {
    const slots = [makeSlot({ dateKey: '2026-07-31' })];
    const bookings = [makeBooking({ dateKey: '2026-07-30' })];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result[0].status).toBe('available');
  });

  it('numa lista com slots de dois dias diferentes, cada slot só recebe overlay do seu próprio dia', () => {
    const slots = [
      makeSlot({ id: 'a', dateKey: '2026-07-30' }),
      makeSlot({ id: 'b', dateKey: '2026-07-31' }),
    ];
    const bookings = [makeBooking({ dateKey: '2026-07-31' })];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result.find((s) => s.id === 'a')?.status).toBe('available');
    expect(result.find((s) => s.id === 'b')?.status).toBe('booked');
  });

  it('ignora reserva cancelada (bookingIsActive só considera "canceled"/"cancelled")', () => {
    const slots = [makeSlot()];
    const bookings = [makeBooking({ status: 'canceled' })];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result[0].status).toBe('available');
  });

  it('não sobrescreve um slot já blocked/booked', () => {
    const slots = [makeSlot({ status: 'blocked' })];
    const bookings = [makeBooking()];
    const result = applyBookingsOverlay(slots, bookings);
    expect(result[0].status).toBe('blocked');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `ng test arena --watch=false`
Expected: FAIL — erro de tipo (`Expected 3 arguments, but got 2`) já que a função ainda
exige `dateKey` como terceiro parâmetro.

- [ ] **Step 3: Implementar — generalizar a função**

Em `arena-schedule-grouping.ts:30-45`, substituir:

```ts
export function applyBookingsOverlay(slots: readonly ArenaSlot[], bookings: readonly ArenaBooking[], dateKey: string): ArenaSlot[] {
  if (!dateKey || bookings.length === 0) return [...slots];
  const dayBookings = bookings.filter((b) => b.dateKey === dateKey && bookingIsActive(b));
  if (dayBookings.length === 0) return [...slots];

  return slots.map((slot) => {
    if (slot.status === 'booked' || slot.status === 'blocked') return slot;
    for (const b of dayBookings) {
      const bookingCourt = b.courtId.trim();
      if (bookingCourt && bookingCourt.toLowerCase() !== slot.courtId.trim().toLowerCase()) continue;
      if (!slotOverlapsBooking(slot, b.startTime, b.endTime)) continue;
      return { ...slot, status: 'booked' as const, bookingId: b.id, bookingAthleteId: b.athleteId || null };
    }
    return slot;
  });
}
```

por:

```ts
export function applyBookingsOverlay(slots: readonly ArenaSlot[], bookings: readonly ArenaBooking[]): ArenaSlot[] {
  if (bookings.length === 0) return [...slots];
  const activeBookings = bookings.filter(bookingIsActive);
  if (activeBookings.length === 0) return [...slots];

  return slots.map((slot) => {
    if (slot.status === 'booked' || slot.status === 'blocked') return slot;
    for (const b of activeBookings) {
      if (b.dateKey !== slot.dateKey) continue;
      const bookingCourt = b.courtId.trim();
      if (bookingCourt && bookingCourt.toLowerCase() !== slot.courtId.trim().toLowerCase()) continue;
      if (!slotOverlapsBooking(slot, b.startTime, b.endTime)) continue;
      return { ...slot, status: 'booked' as const, bookingId: b.id, bookingAthleteId: b.athleteId || null };
    }
    return slot;
  });
}
```

- [ ] **Step 4: Atualizar o único caller**

Em `panel-agenda.component.ts:447`, substituir:

```ts
protected readonly slotsWithOverlay = computed(() => applyBookingsOverlay(this.slots(), this.bookings(), this.selectedDateKey()));
```

por:

```ts
protected readonly slotsWithOverlay = computed(() => applyBookingsOverlay(this.slots(), this.bookings()));
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `ng test arena --watch=false`
Expected: PASS — bloco `applyBookingsOverlay` com as 5 specs verdes, e nenhum erro de
tipo no restante do projeto (a mudança de assinatura foi refletida no único caller).

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/arena/src/app/painel/agenda/arena-schedule-grouping.ts frontend/projects/arena/src/app/painel/agenda/arena-schedule-grouping.spec.ts frontend/projects/arena/src/app/painel/agenda/panel-agenda.component.ts
git commit -m "refactor(arena): applyBookingsOverlay casa por dateKey do próprio slot"
```

---

### Task 3: `watchArenaWeekSlots` — mesmo listener, 7 dias em memória

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/agenda/schedule-repository.ts`

**Interfaces:**
- Consumes: `WeekDay` (Task 1, `../agenda/agenda-week-math.ts` — mesmo módulo, import
  relativo `./agenda-week-math`), `buildVirtualSlots`/`mergeSlots` (`./virtual-slot-generator.ts`,
  já existem), `arenaSlotFromDoc` (`./arena-slot.model.ts`, já existe).
- Produces: `export function watchArenaWeekSlots(db: Firestore, arenaId: string, weekDates: readonly WeekDay[], courts: readonly { id: string; data: Record<string, unknown> }[], onChange: (slots: ArenaSlot[]) => void): Unsubscribe`
  — usado pela Task 6.

Sem teste automatizado — mesmo padrão do arquivo hoje (`watchArenaDaySlots` também não
tem spec; dependem de um `Firestore` real, `onSnapshot` não é mockado neste projeto).
Verificação é o build de tipos (Step 2) e o teste manual da Task 6.

- [ ] **Step 1: Implementar**

No topo do arquivo, adicionar o import do tipo `WeekDay`:

```ts
import type { WeekDay } from './agenda-week-math';
```

Adicionar a função nova, logo após `watchArenaDaySlots` (linha 35 do arquivo atual):

```ts
/** Mesma ideia de `watchArenaDaySlots`, para os 7 dias de uma semana de uma vez — sem
 *  leitura extra do Firestore (o listener já busca todos os slots da arena, sem filtro
 *  de data); só mais filtragem/geração de slots virtuais em memória. */
export function watchArenaWeekSlots(
  db: Firestore,
  arenaId: string,
  weekDates: readonly WeekDay[],
  courts: readonly { id: string; data: Record<string, unknown> }[],
  onChange: (slots: ArenaSlot[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenaSlots'), where('arenaId', '==', arenaId)),
    (snap) => {
      const allPersisted = snap.docs.map(arenaSlotFromDoc);
      const merged: ArenaSlot[] = [];
      for (const { date, dateKey } of weekDates) {
        for (const court of courts) {
          const persisted = allPersisted.filter((s) => s.dateKey === dateKey && s.courtId.toLowerCase() === court.id.toLowerCase());
          const virtual = buildVirtualSlots(arenaId, court.id, court.data, date, dateKey);
          merged.push(...mergeSlots(persisted, virtual));
        }
      }
      merged.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId));
      onChange(merged);
    },
    () => onChange([]),
  );
}
```

- [ ] **Step 2: Rodar o build de tipos e confirmar que passa**

Run: `ng build arena`
Expected: build conclui sem erros de tipo (confirma que `WeekDay`, `ArenaSlot` e as
funções importadas batem certinho).

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/agenda/schedule-repository.ts
git commit -m "feat(arena): watchArenaWeekSlots — mesmo listener, 7 dias em memória"
```

---

### Task 4: `DatePickerComponent` — calendário de data única

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/date-picker.component.ts`

**Interfaces:**
- Consumes: `IconComponent` (`./icon.component.ts`, ícones `calendar`/`chevron-left`/`chevron-right`
  já suportados), `MONTH_LABELS_PT`/`buildMonthGrid`/`formatDateKeyPtBr`/`shiftMonth`
  (`./date-range-picker-math.ts`, já existem e são puros).
- Produces: `export class DatePickerComponent` (`selector: 'ar-date-picker'`), inputs
  `selected: input.required<string | null>()` (dateKey `YYYY-MM-DD` ou `null`), output
  `dateChange: output<string>()` (emite dateKey `YYYY-MM-DD`). Usado pela Task 6.

Sem teste automatizado — mesmo padrão do projeto pra esse tipo de componente (nem
`ChartTabsComponent` nem `DateRangePickerComponent`, os componentes de UI equivalentes já
existentes, têm `.spec.ts`; a matemática que eles usam é que é testada, e já está coberta
em `date-range-picker-math.spec.ts`). Verificado por build de tipos + checagem manual na
Task 6.

- [ ] **Step 1: Implementar**

```ts
// frontend/projects/arena/src/app/painel/ui/date-picker.component.ts
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { IconComponent } from './icon.component';
import { MONTH_LABELS_PT, buildMonthGrid, formatDateKeyPtBr, shiftMonth } from './date-range-picker-math';

function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

/** Calendário de data única (protótipo ArDatePicker) — irmão de DateRangePickerComponent,
 *  reaproveitando a mesma matemática de grid de mês, sem estado de range/"sem término". */
@Component({
  selector: 'ar-date-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <button type="button" class="trigger" (click)="toggle()">
      <ar-icon name="calendar" [size]="14" />
      <span>{{ triggerLabel() }}</span>
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
              [class.selected]="d.dateKey === selected()"
              [attr.aria-label]="d.dateKey"
              (click)="selectDay(d.dateKey)"
            >
              {{ d.day }}
            </button>
          }
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
      height: 34px;
      padding: 0 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      cursor: pointer;
      white-space: nowrap;
    }

    .trigger:hover {
      border-color: var(--nx-line-strong);
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

    .day.selected {
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-weight: 700;
    }
  `,
})
export class DatePickerComponent {
  readonly selected = input.required<string | null>();
  readonly dateChange = output<string>();

  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);
  protected readonly viewYear = signal(new Date().getFullYear());
  protected readonly viewMonth = signal(new Date().getMonth() + 1);

  protected readonly grid = computed(() => buildMonthGrid(this.viewYear(), this.viewMonth()));
  protected readonly monthLabel = computed(() => `${MONTH_LABELS_PT[this.viewMonth() - 1]} ${this.viewYear()}`);
  protected readonly triggerLabel = computed(() => {
    const s = this.selected();
    return s ? formatDateKeyPtBr(s) : 'Selecionar data';
  });

  constructor() {
    effect(() => {
      if (this.open()) return;
      // Sincroniza o mês exibido com o input sempre que o popover está fechado (evita
      // reabrir com um mês desatualizado depois de navegar por outra via, ex.: setas).
      const seed = this.selected() ?? todayDateKey();
      const [y, m] = seed.split('-').map(Number);
      if (y && m) {
        this.viewYear.set(y);
        this.viewMonth.set(m);
      }
    });
  }

  protected toggle(): void {
    this.open.set(!this.open());
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
    this.dateChange.emit(dateKey);
    this.close();
  }
}
```

- [ ] **Step 2: Rodar o build de tipos e confirmar que passa**

Run: `ng build arena`
Expected: build conclui sem erros (nenhum consumidor ainda — só confirma que o componente
em si compila e o template type-checka contra a classe).

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/date-picker.component.ts
git commit -m "feat(arena): DatePickerComponent — calendário de data única"
```

---

### Task 5: `AgendaWeekGridComponent` — grade de 7 dias × quadras × horário

**Files:**
- Create: `frontend/projects/arena/src/app/painel/ui/agenda-week-grid.component.ts`

**Interfaces:**
- Consumes: `AGENDA_GRID_END_MIN`/`AGENDA_GRID_START_MIN`/`AGENDA_ROW_HEIGHT`/`AGENDA_SLOT_MIN`/`formatMinutes`/`isWithinGrid`/`minutesToRowOffset`/`nowInMinutes`
  (`./agenda-grid-math.ts`, já existem), `type AgendaBlockStatus`/`type AgendaCourt`
  (`./agenda-grid.component.ts`, já exportados), `type WeekDay` (Task 1, import
  `../agenda/agenda-week-math`).
- Produces: `export interface AgendaWeekBlock { id: string; dateKey: string; courtId: string; start: number; dur: number; status: AgendaBlockStatus; client: string }`,
  `export class AgendaWeekGridComponent` (`selector: 'ar-agenda-week-grid'`), inputs
  `weekDays: input.required<WeekDay[]>()`, `courts: input.required<AgendaCourt[]>()`,
  `blocks: input.required<AgendaWeekBlock[]>()`, outputs `blockClick: output<string>()`,
  `dayHeaderClick: output<string>()` (emite `dateKey`). Usado pela Task 6.

Layout: um único contêiner com scroll (`.wrap { overflow: auto }`) contendo uma linha de
cabeçalho (dia + quadras) fixada no topo (`position: sticky; top: 0`) e, abaixo, a grade
de horário com 7 grupos de dia lado a lado — mesma matemática de linha/hora de
`AgendaGridComponent`, só que multiplicada por dia. **Simplificação deliberada:** só o
cabeçalho fica fixo (sticky top); a coluna de horário à esquerda rola junto
horizontalmente com o conteúdo (sticky nos dois eixos ao mesmo tempo, com posicionamento
por pixel por linha, adicionaria bastante complexidade de CSS pra um ganho pequeno — o
gestor sempre pode rolar de volta pra esquerda pra ver as horas).

Sem teste automatizado — mesmo padrão de `AgendaGridComponent` (componente de UI puro,
sem `.spec.ts`; a matemática que ele consome já é testada em `agenda-grid-math.spec.ts`).
Verificado por build de tipos + checagem manual na Task 6.

- [ ] **Step 1: Implementar**

```ts
// frontend/projects/arena/src/app/painel/ui/agenda-week-grid.component.ts
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { WeekDay } from '../agenda/agenda-week-math';
import {
  AGENDA_GRID_END_MIN,
  AGENDA_GRID_START_MIN,
  AGENDA_ROW_HEIGHT,
  AGENDA_SLOT_MIN,
  formatMinutes,
  isWithinGrid,
  minutesToRowOffset,
  nowInMinutes,
} from './agenda-grid-math';
import type { AgendaBlockStatus, AgendaCourt } from './agenda-grid.component';

export interface AgendaWeekBlock {
  id: string;
  dateKey: string;
  courtId: string;
  start: number;
  dur: number;
  status: AgendaBlockStatus;
  client: string;
}

interface PositionedWeekBlock extends AgendaWeekBlock {
  top: number;
  height: number;
  label: string;
  timeLabel: string;
}

interface RowMark {
  offset: number;
  isHour: boolean;
  label: string;
}

const NON_CLICKABLE: ReadonlySet<AgendaBlockStatus> = new Set(['manutencao']);
const WEEKDAY_SHORT = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/** Grade de 7 dias × quadras × horário — irmã de AgendaGridComponent, mesma matemática de
 *  linha/hora e mesmo vocabulário visual de blocos, com um eixo de dia a mais. */
@Component({
  selector: 'ar-agenda-week-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="header">
        <div class="gutter-spacer"></div>
        @for (day of weekDays(); track day.dateKey) {
          <div class="day-col-header" [class.today]="day.isToday">
            <button type="button" class="day-title" (click)="dayHeaderClick.emit(day.dateKey)">
              {{ weekdayLabel(day.date) }} · {{ dateLabel(day.date) }}
            </button>
            <div class="court-header">
              @for (c of courts(); track c.id) {
                <div class="court-head">{{ c.name }}</div>
              }
            </div>
          </div>
        }
      </div>

      <div class="grid" [style.height.px]="gridHeight()">
        @for (row of rowMarks(); track row.offset) {
          @if (row.isHour) {
            <div class="hour-label" [style.top.px]="row.offset - 6">{{ row.label }}</div>
          }
          <div class="hour-line" [class.solid]="row.isHour" [style.top.px]="row.offset"></div>
        }

        <div class="days">
          @for (day of weekDays(); track day.dateKey) {
            <div class="day-group">
              @for (c of courts(); track c.id) {
                <div class="column">
                  @for (b of positionedByDayAndCourt()[day.dateKey + ':' + c.id] ?? []; track b.start) {
                    <div
                      class="block"
                      [class]="'tone-' + b.status"
                      [class.clickable]="isClickable(b.status)"
                      [style.top.px]="b.top"
                      [style.height.px]="b.height"
                      (click)="isClickable(b.status) && blockClick.emit(b.id)"
                    >
                      <div class="block-title">{{ b.label }}</div>
                      @if (b.height > 30) {
                        <div class="block-time">{{ b.timeLabel }}</div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>

        @if (nowOffset() >= 0) {
          <div class="now-line" [style.top.px]="nowOffset()"></div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .wrap {
      height: 100%;
      min-height: 0;
      overflow: auto;
      position: relative;
      scrollbar-width: thin;
    }

    .header {
      display: flex;
      position: sticky;
      top: 0;
      z-index: 6;
      background: var(--nx-surface-0);
      padding-bottom: 10px;
    }

    .gutter-spacer {
      width: 52px;
      flex: none;
    }

    .day-col-header {
      flex: 1;
      min-width: 190px;
      text-align: center;
      border-left: 1px solid var(--nx-line);
    }

    .day-col-header.today .day-title {
      color: var(--nx-orange-500);
    }

    .day-title {
      display: block;
      width: 100%;
      background: none;
      border: none;
      cursor: pointer;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text);
      padding: 2px 0 6px;
    }

    .court-header {
      display: flex;
    }

    .court-head {
      flex: 1;
      font-family: var(--nx-font-ui);
      font-size: 10px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .grid {
      position: relative;
      padding-left: 52px;
    }

    .hour-label {
      position: absolute;
      left: 0;
      width: 42px;
      text-align: right;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 600;
      color: var(--nx-text-dim);
    }

    .hour-line {
      position: absolute;
      left: 52px;
      right: 0;
      border-top: 1px dotted var(--nx-line);
    }

    .hour-line.solid {
      border-top-style: solid;
    }

    .days {
      position: absolute;
      top: 0;
      left: 52px;
      right: 0;
      bottom: 0;
      display: flex;
    }

    .day-group {
      flex: 1;
      min-width: 190px;
      display: flex;
      border-left: 1px solid var(--nx-line-strong);
    }

    .column {
      flex: 1;
      position: relative;
      border-left: 1px solid var(--nx-line);
    }

    .column:first-child {
      border-left: none;
    }

    .block {
      position: absolute;
      left: 2px;
      right: 2px;
      box-sizing: border-box;
      border-radius: 6px;
      padding: 3px 5px;
      overflow: hidden;
      cursor: default;
      border: 1px solid;
    }

    .block.clickable {
      cursor: pointer;
    }

    .block.tone-available {
      background: transparent;
      border: 1px dashed var(--nx-line-strong);
    }

    .block.tone-available .block-title,
    .block.tone-available .block-time {
      color: var(--nx-text-dim);
    }

    .block.tone-confirmada {
      background: rgba(43, 209, 126, 0.12);
      border-color: rgba(43, 209, 126, 0.35);
      border-left: 3px solid var(--nx-win);
    }

    .block.tone-pendente {
      background: rgba(244, 197, 67, 0.12);
      border-color: rgba(244, 197, 67, 0.35);
      border-left: 3px solid var(--nx-pending);
    }

    .block.tone-bloqueado {
      background: rgba(255, 106, 26, 0.08);
      border-color: rgba(255, 106, 26, 0.3);
      border-left: 3px solid var(--nx-orange-500);
    }

    .block.tone-manutencao {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.14);
      border-left: 3px solid var(--nx-text-dim);
    }

    .block-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 10px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .block-time {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      color: var(--nx-text-dim);
      margin-top: 1px;
    }

    .now-line {
      position: absolute;
      left: 52px;
      right: 0;
      height: 2px;
      background: var(--nx-live);
      box-shadow: 0 0 8px rgba(255, 59, 48, 0.6);
      z-index: 5;
      pointer-events: none;
    }
  `,
})
export class AgendaWeekGridComponent {
  readonly weekDays = input.required<WeekDay[]>();
  readonly courts = input.required<AgendaCourt[]>();
  readonly blocks = input.required<AgendaWeekBlock[]>();
  readonly blockClick = output<string>();
  readonly dayHeaderClick = output<string>();

  private readonly nowMinutes = signal(nowInMinutes());

  protected readonly rowCount = computed(() => (AGENDA_GRID_END_MIN - AGENDA_GRID_START_MIN) / AGENDA_SLOT_MIN);
  protected readonly gridHeight = computed(() => this.rowCount() * AGENDA_ROW_HEIGHT + 10);

  protected readonly rowMarks = computed<RowMark[]>(() =>
    Array.from({ length: this.rowCount() }, (_, i) => {
      const minute = AGENDA_GRID_START_MIN + i * AGENDA_SLOT_MIN;
      return { offset: i * AGENDA_ROW_HEIGHT, isHour: minute % 60 === 0, label: formatMinutes(minute) };
    }),
  );

  protected readonly positionedByDayAndCourt = computed<Partial<Record<string, PositionedWeekBlock[]>>>(() => {
    const result: Partial<Record<string, PositionedWeekBlock[]>> = {};
    for (const b of this.blocks()) {
      const top = minutesToRowOffset(b.start) + 1;
      const height = (b.dur / AGENDA_SLOT_MIN) * AGENDA_ROW_HEIGHT - 3;
      const label = b.status === 'available' ? 'Disponível' : b.status === 'manutencao' ? 'Manutenção' : b.status === 'bloqueado' ? 'Bloqueado' : b.client;
      const timeLabel = `${formatMinutes(b.start)}–${formatMinutes(b.start + b.dur)}`;
      const key = `${b.dateKey}:${b.courtId}`;
      const positioned: PositionedWeekBlock = { ...b, top, height, label, timeLabel };
      (result[key] ??= []).push(positioned);
    }
    return result;
  });

  protected isClickable(status: AgendaBlockStatus): boolean {
    return !NON_CLICKABLE.has(status);
  }

  protected readonly nowOffset = computed(() => {
    const minutes = this.nowMinutes();
    return isWithinGrid(minutes) ? minutesToRowOffset(minutes) : -1;
  });

  protected weekdayLabel(date: Date): string {
    return WEEKDAY_SHORT.format(date).replace('.', '');
  }

  protected dateLabel(date: Date): string {
    return DAY_MONTH.format(date);
  }
}
```

- [ ] **Step 2: Rodar o build de tipos e confirmar que passa**

Run: `ng build arena`
Expected: build conclui sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/projects/arena/src/app/painel/ui/agenda-week-grid.component.ts
git commit -m "feat(arena): AgendaWeekGridComponent — grade de 7 dias x quadras x horário"
```

---

### Task 6: Ligar tudo em `PanelAgendaComponent`

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/agenda/panel-agenda.component.ts`

**Interfaces:**
- Consumes: `WeekDay`/`weekDatesFor` (Task 1), `applyBookingsOverlay` já generalizada
  (Task 2), `watchArenaWeekSlots` (Task 3), `DatePickerComponent` (Task 4),
  `AgendaWeekGridComponent`/`type AgendaWeekBlock` (Task 5).
- Produces: comportamento final — toggle Dia/Semana troca a grade de verdade; calendário
  novo no header seleciona qualquer data.

- [ ] **Step 1: Imports novos no topo do arquivo**

Adicionar, junto aos imports já existentes de `panel-agenda.component.ts`:

```ts
import { weekDatesFor, type WeekDay } from './agenda-week-math';
import { watchArenaWeekSlots } from './schedule-repository'; // junto ao import já existente de schedule-repository
import { AgendaWeekGridComponent, type AgendaWeekBlock } from '../ui/agenda-week-grid.component';
import { DatePickerComponent } from '../ui/date-picker.component';
```

(O import existente de `schedule-repository.ts` na linha 11 já traz `blockSlot`,
`blockVirtualSlot`, `fetchCourtsRaw`, `unblockSlot`, `watchArenaDaySlots` — só adicionar
`watchArenaWeekSlots` nessa mesma linha de import em vez de criar uma linha separada.)

- [ ] **Step 2: Registrar os dois componentes novos no array `imports` do `@Component`**

Em `imports: [...]` (linha 67-76 do arquivo atual), adicionar `AgendaWeekGridComponent` e
`DatePickerComponent` à lista já existente (`PanelShellComponent`, `PageHeaderComponent`
etc.).

- [ ] **Step 3: Header do template — calendário entre as setas e o toggle**

Substituir (linhas 80-93):

```html
<div class="header-actions">
  <button type="button" class="ar-ghost-btn nav-btn" (click)="goToday()">Hoje</button>
  <button type="button" class="ar-ghost-btn nav-btn icon-btn" (click)="shiftDay(-1)">
    <ar-icon name="chevron-right" [size]="14" style="transform: rotate(180deg)" />
  </button>
  <button type="button" class="ar-ghost-btn nav-btn icon-btn" (click)="shiftDay(1)">
    <ar-icon name="chevron-right" [size]="14" />
  </button>
  <ar-chart-tabs [tabs]="views" [active]="view()" (change)="view.set($any($event))" />
  <button type="button" class="ar-mini-btn ar-mini-btn-primary" disabled title="Em breve">
    <ar-icon name="plus" [size]="14" />
    Nova reserva
  </button>
</div>
```

por:

```html
<div class="header-actions">
  <button type="button" class="ar-ghost-btn nav-btn" (click)="goToday()">Hoje</button>
  <button type="button" class="ar-ghost-btn nav-btn icon-btn" (click)="shiftDay(-1)">
    <ar-icon name="chevron-right" [size]="14" style="transform: rotate(180deg)" />
  </button>
  <ar-date-picker [selected]="selectedDateKey()" (dateChange)="onDateKeySelected($event)" />
  <button type="button" class="ar-ghost-btn nav-btn icon-btn" (click)="shiftDay(1)">
    <ar-icon name="chevron-right" [size]="14" />
  </button>
  <ar-chart-tabs [tabs]="views" [active]="view()" (change)="view.set($any($event))" />
  <button type="button" class="ar-mini-btn ar-mini-btn-primary" disabled title="Em breve">
    <ar-icon name="plus" [size]="14" />
    Nova reserva
  </button>
</div>
```

- [ ] **Step 4: Grid card do template — alternar entre grade de dia e de semana**

Substituir (linhas 125-129):

```html
@if (courts().length === 0) {
  <p class="state-text">Nenhuma quadra cadastrada ainda.</p>
} @else {
  <ar-agenda-grid [courts]="agendaCourts()" [blocks]="agendaBlocks()" (blockClick)="onBlockClick($event)" />
}
```

por:

```html
@if (courts().length === 0) {
  <p class="state-text">Nenhuma quadra cadastrada ainda.</p>
} @else if (view() === 'Dia') {
  <ar-agenda-grid [courts]="agendaCourts()" [blocks]="agendaBlocks()" (blockClick)="onBlockClick($event)" />
} @else {
  <ar-agenda-week-grid
    [weekDays]="weekDays()"
    [courts]="agendaCourts()"
    [blocks]="agendaWeekBlocks()"
    (blockClick)="onBlockClick($event)"
    (dayHeaderClick)="onDateKeySelected($event)"
  />
}
```

- [ ] **Step 5: `selectedDateKey` precisa virar `protected` (o novo `ar-date-picker` do Step 3 lê no template)**

Substituir (linha 445):

```ts
private readonly selectedDateKey = computed(() => dateKeyOf(this.selectedDate()));
```

por:

```ts
protected readonly selectedDateKey = computed(() => dateKeyOf(this.selectedDate()));
```

- [ ] **Step 6: Novos signals/computeds da semana**

Logo abaixo de `protected readonly slots = signal<ArenaSlot[]>([]);` (linha 428),
adicionar:

```ts
protected readonly weekSlots = signal<ArenaSlot[]>([]);
```

Logo abaixo de `protected readonly dayStats = computed(() => scheduleDayStats(this.slotsWithOverlay()));`
(linha 451, já usando a versão de `applyBookingsOverlay` sem `dateKey` da Task 2),
adicionar:

```ts
protected readonly weekDays = computed<WeekDay[]>(() => weekDatesFor(this.selectedDate()));

protected readonly weekSlotsWithOverlay = computed(() => applyBookingsOverlay(this.weekSlots(), this.bookings()));

protected readonly filteredWeekSlots = computed(() => applyScheduleFilters(this.weekSlotsWithOverlay(), this.statusFilter(), this.courtFilter()));

protected readonly weekStats = computed(() => scheduleDayStats(this.filteredWeekSlots()));

protected readonly agendaWeekBlocks = computed<AgendaWeekBlock[]>(() => {
  const blocks: AgendaWeekBlock[] = [];
  for (const s of this.filteredWeekSlots()) {
    const start = timeToMinutes(s.startTime);
    let end = timeToMinutes(s.endTime);
    if (end <= start) end += 24 * 60;
    blocks.push({ id: s.id, dateKey: s.dateKey, courtId: s.courtId, start, dur: end - start, status: this.slotStatusForBlock(s), client: this.clientLabelFor(s) });
  }
  return blocks;
});
```

(`timeToMinutes`, `slotStatusForBlock`, `clientLabelFor` já existem no arquivo — mesma
lógica de mapeamento já usada por `agendaBlocks`, sem duplicar regra de negócio.)

- [ ] **Step 7: `subtitleLabel` ganha ramo para a visão Semana**

Substituir (linhas 518-524):

```ts
protected readonly subtitleLabel = computed(() => {
  const d = this.selectedDate();
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace('.', '');
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d).replace('.', '');
  const stats = this.dayStats();
  return `${weekday} · ${date} · ${stats.available} livres · ${stats.booked} reservados · ${stats.blocked} bloqueados`;
});
```

por:

```ts
protected readonly subtitleLabel = computed(() => {
  if (this.view() === 'Semana') {
    const days = this.weekDays();
    const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
    const first = days[0]?.date;
    const last = days[6]?.date;
    const range = first && last ? `${fmt.format(first).replace('.', '')} – ${fmt.format(last).replace('.', '')}` : '';
    const stats = this.weekStats();
    return `${range} · ${stats.available} livres · ${stats.booked} reservados · ${stats.blocked} bloqueados`;
  }
  const d = this.selectedDate();
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace('.', '');
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d).replace('.', '');
  const stats = this.dayStats();
  return `${weekday} · ${date} · ${stats.available} livres · ${stats.booked} reservados · ${stats.blocked} bloqueados`;
});
```

- [ ] **Step 8: Efeito de slots — assinar dia OU semana conforme `view()`**

Substituir o segundo `effect()` do construtor (linhas 547-567):

```ts
effect(() => {
  const arenaId = this.arenaContext.arenaId();
  const dateKey = this.selectedDateKey();
  const date = this.selectedDate();
  const courts = this.courtsRaw();
  const rawLoaded = this.courtsRawLoaded();
  this.unsubscribeSlots?.();
  this.unsubscribeSlots = null;
  if (!arenaId || !rawLoaded) return;
  if (courts.length === 0) {
    this.slots.set([]);
    this.loading.set(false);
    return;
  }

  const db = arenaFirestore();
  this.unsubscribeSlots = watchArenaDaySlots(db, arenaId, date, dateKey, courts, (list) => {
    this.slots.set(list);
    this.loading.set(false);
  });
});
```

por:

```ts
effect(() => {
  const arenaId = this.arenaContext.arenaId();
  const view = this.view();
  const courts = this.courtsRaw();
  const rawLoaded = this.courtsRawLoaded();
  this.unsubscribeSlots?.();
  this.unsubscribeSlots = null;
  if (!arenaId || !rawLoaded) return;
  if (courts.length === 0) {
    this.slots.set([]);
    this.weekSlots.set([]);
    this.loading.set(false);
    return;
  }

  const db = arenaFirestore();
  if (view === 'Dia') {
    const dateKey = this.selectedDateKey();
    const date = this.selectedDate();
    this.unsubscribeSlots = watchArenaDaySlots(db, arenaId, date, dateKey, courts, (list) => {
      this.slots.set(list);
      this.loading.set(false);
    });
  } else {
    this.unsubscribeSlots = watchArenaWeekSlots(db, arenaId, this.weekDays(), courts, (list) => {
      this.weekSlots.set(list);
      this.loading.set(false);
    });
  }
});
```

- [ ] **Step 9: `onDateKeySelected` — parseia o dateKey em componentes locais (nunca `new Date(string)`)**

Adicionar, perto de `goToday()`/`shiftDay()` (linha 586):

```ts
protected onDateKeySelected(dateKey: string): void {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return;
  this.selectedDate.set(new Date(y, m - 1, d));
}
```

- [ ] **Step 10: Build de tipos**

Run: `ng build arena`
Expected: build conclui sem erros de tipo em todo o projeto `arena`.

- [ ] **Step 11: Suíte completa de testes**

Run: `ng test arena --watch=false`
Expected: PASS — todos os specs do projeto `arena`, incluindo os novos das Tasks 1 e 2.

- [ ] **Step 12: Verificação manual no navegador**

Rodar `ng serve arena` (ou usar o preview do harness), abrir `/painel/agenda` logado como
gestor de uma arena com pelo menos 1 quadra, e conferir:

1. Clicar no botão de calendário novo abre o popover de mês; selecionar um dia atualiza a
   data exibida (subtítulo, lista "Horários do dia") — igual a usar as setas.
2. Clicar em "Semana" troca a grade de fato para 7 colunas de dia (não fica mais
   cosmético); clicar em "Dia" volta pro grid de 1 dia.
3. Com "Todas as quadras" selecionado, a visão Semana mostra sub-colunas por quadra
   dentro de cada dia; com uma quadra específica selecionada no filtro, vira 7 colunas
   limpas (1 por dia).
4. Clicar num horário disponível na grade semanal abre o modal de bloqueio; clicar num
   horário bloqueado abre o modal de desbloqueio — mesmo comportamento de hoje.
5. Clicar no cabeçalho de um dia na grade semanal atualiza a data selecionada (o card
   "Horários do dia" ao lado passa a refletir aquele dia).
6. Trocar a data enquanto em "Semana" atualiza os 7 dias mostrados (a semana "segue" a
   data selecionada).

- [ ] **Step 13: Commit**

```bash
git add frontend/projects/arena/src/app/painel/agenda/panel-agenda.component.ts
git commit -m "feat(arena): visão Semana funcional + calendário de data na agenda de quadras"
```
