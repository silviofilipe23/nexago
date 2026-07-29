# Seletor de datas de 30 dias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o strip fixo de 7 dias da tela de agendamento do atleta por 30 dias com rolagem horizontal, mais um date picker nativo que alcança até 35 dias à frente.

**Architecture:** A aritmética de datas sai do componente para um módulo puro e testável (`booking-dates.ts`). A camada de dados ganha uma busca por faixa que lê Firestore uma vez só e monta N dias localmente, substituindo N chamadas de um dia — o que derruba a tela de ~29 queries por abertura para 5, cobrindo 36 dias em vez de 7. O componente passa a montar o strip a partir de um computed puro, sem signal de estado extra.

**Tech Stack:** Angular 20 (standalone, signals, OnPush), TypeScript 5.9, Firebase Web SDK v10 (modular), Jasmine + Karma.

**Spec:** `docs/superpowers/specs/2026-07-29-reservar-strip-30-dias-design.md`

## Global Constraints

- **Angular:** componentes standalone (nunca declarar `standalone: true`, é o default), `ChangeDetectionStrategy.OnPush`, signals para estado, `computed()` para derivado, `input()`/`output()` em vez de decorators. Control flow nativo (`@if`, `@for`) — nunca `*ngIf`/`*ngFor`. Nunca `ngClass`/`ngStyle`: usar `[class.x]` e `[style.x]`. Nunca `@HostBinding`/`@HostListener`. `inject()` em vez de injeção por construtor.
- **Idioma:** strings de UI em português; identificadores, tipos e comentários de código em inglês, exceto comentários explicativos de regra de negócio, que seguem o padrão em português já usado nos arquivos tocados.
- **Retrocompatibilidade (obrigatória):** `fetchArenaDaySlotsMerged(db, arenaId, date): Promise<ArenaSlot[]>` mantém nome, assinatura, tipo de retorno e comportamento observável. `arena-detail.component.ts` e `arena-payment.component.ts` não podem ser tocados.
- **Constantes com semântica exata:**
  - `STRIP_DAYS = 30` → **quantidade de chips** no strip padrão (offsets 0 a 29).
  - `MAX_HORIZON_DAYS = 35` → **offset máximo em dias** a partir de hoje. A última data selecionável é `hoje + 35`, ou seja o strip pode chegar a **36** chips.
- **Fuso:** todo cálculo de dia usa data local com hora zerada. Comparação de dias via `Date.UTC(y, m, d)` para não quebrar em transição de horário de verão.
- **Testes:** Jasmine + Karma. Rodar de `frontend/` com `ng test athlete --watch=false --browsers=ChromeHeadless`.
- **Não fazer:** nenhuma alteração em `functions/`, `firestore.rules`, painel da arena ou app Flutter.

---

### Task 1: Módulo puro de datas do agendamento

Toda a aritmética de datas do strip, isolada e testável. Nenhuma dependência de Angular ou Firebase.

**Files:**
- Create: `frontend/projects/athlete/src/app/reservar/booking-dates.ts`
- Test: `frontend/projects/athlete/src/app/reservar/booking-dates.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `STRIP_DAYS: 30`, `MAX_HORIZON_DAYS: 35`
  - `dateOnly(d: Date): Date`
  - `addDays(base: Date, days: number): Date`
  - `daysBetween(from: Date, to: Date): number`
  - `buildDateStrip(today: Date, selectedDate: Date, stripDays?: number, maxHorizonDays?: number): Date[]`
  - `clampPickedDate(rawValue: string, today: Date, maxHorizonDays?: number): Date | null`
  - `shouldShowMonth(date: Date, index: number): boolean`

- [ ] **Step 1: Escrever o teste falhando**

Criar `frontend/projects/athlete/src/app/reservar/booking-dates.spec.ts`:

```ts
import {
  MAX_HORIZON_DAYS,
  STRIP_DAYS,
  addDays,
  buildDateStrip,
  clampPickedDate,
  daysBetween,
  shouldShowMonth,
} from './booking-dates';

const TODAY = new Date(2026, 6, 29); // 29/07/2026, quarta

describe('daysBetween', () => {
  it('conta dias de calendário atravessando a virada de mês', () => {
    expect(daysBetween(new Date(2026, 6, 29), new Date(2026, 7, 2))).toBe(4);
  });

  it('é zero no mesmo dia, ignorando a hora', () => {
    expect(daysBetween(new Date(2026, 6, 29, 23, 59), new Date(2026, 6, 29, 0, 1))).toBe(0);
  });

  it('é negativo para datas passadas', () => {
    expect(daysBetween(TODAY, new Date(2026, 6, 28))).toBe(-1);
  });
});

describe('buildDateStrip', () => {
  it('monta 30 chips a partir de hoje quando a seleção está dentro do strip', () => {
    const strip = buildDateStrip(TODAY, TODAY);
    expect(strip.length).toBe(STRIP_DAYS);
    expect(daysBetween(TODAY, strip[0]!)).toBe(0);
    expect(daysBetween(TODAY, strip[STRIP_DAYS - 1]!)).toBe(29);
  });

  it('estende o strip até a data selecionada quando ela passa do dia 30', () => {
    const strip = buildDateStrip(TODAY, addDays(TODAY, 33));
    expect(strip.length).toBe(34);
    expect(daysBetween(TODAY, strip[strip.length - 1]!)).toBe(33);
  });

  it('respeita o teto de 35 dias de offset (36 chips no máximo)', () => {
    const strip = buildDateStrip(TODAY, addDays(TODAY, MAX_HORIZON_DAYS));
    expect(strip.length).toBe(MAX_HORIZON_DAYS + 1);
    expect(daysBetween(TODAY, strip[strip.length - 1]!)).toBe(MAX_HORIZON_DAYS);
  });

  it('não estende além do teto mesmo com seleção fora da faixa', () => {
    const strip = buildDateStrip(TODAY, addDays(TODAY, 400));
    expect(strip.length).toBe(MAX_HORIZON_DAYS + 1);
  });

  it('volta ao tamanho padrão quando a seleção está no passado', () => {
    const strip = buildDateStrip(TODAY, addDays(TODAY, -5));
    expect(strip.length).toBe(STRIP_DAYS);
  });

  it('atravessa a virada de mês em sequência contínua', () => {
    const strip = buildDateStrip(TODAY, TODAY);
    const dia1 = strip.find((d) => d.getDate() === 1);
    expect(dia1).toBeDefined();
    expect(dia1!.getMonth()).toBe(7); // agosto (0-based)
  });

  it('zera a hora de todas as datas do strip', () => {
    const strip = buildDateStrip(new Date(2026, 6, 29, 22, 45), TODAY);
    expect(strip.every((d) => d.getHours() === 0 && d.getMinutes() === 0)).toBeTrue();
  });
});

describe('clampPickedDate', () => {
  it('aceita hoje', () => {
    expect(clampPickedDate('2026-07-29', TODAY)).not.toBeNull();
  });

  it('aceita o último dia do horizonte', () => {
    // 29/07/2026 + 35 dias = 02/09/2026
    expect(daysBetween(TODAY, addDays(TODAY, MAX_HORIZON_DAYS))).toBe(MAX_HORIZON_DAYS);
    expect(clampPickedDate('2026-09-02', TODAY)).not.toBeNull();
  });

  it('rejeita um dia além do horizonte', () => {
    expect(clampPickedDate('2026-09-03', TODAY)).toBeNull();
  });

  it('rejeita data no passado', () => {
    expect(clampPickedDate('2026-07-28', TODAY)).toBeNull();
  });

  it('rejeita valor vazio ou malformado', () => {
    expect(clampPickedDate('', TODAY)).toBeNull();
    expect(clampPickedDate('29/07/2026', TODAY)).toBeNull();
    expect(clampPickedDate('2026-13-01', TODAY)).toBeNull();
  });

  it('devolve a data com hora zerada', () => {
    const picked = clampPickedDate('2026-08-05', TODAY);
    expect(picked!.getHours()).toBe(0);
    expect(picked!.getDate()).toBe(5);
    expect(picked!.getMonth()).toBe(7);
  });
});

describe('shouldShowMonth', () => {
  it('mostra o mês no primeiro chip do strip', () => {
    expect(shouldShowMonth(new Date(2026, 6, 29), 0)).toBeTrue();
  });

  it('mostra o mês em todo dia 1º', () => {
    expect(shouldShowMonth(new Date(2026, 7, 1), 3)).toBeTrue();
  });

  it('não mostra o mês nos demais dias', () => {
    expect(shouldShowMonth(new Date(2026, 6, 30), 1)).toBeFalse();
    expect(shouldShowMonth(new Date(2026, 7, 15), 17)).toBeFalse();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

De `frontend/`:

```bash
ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: FAIL na compilação — `Cannot find module './booking-dates'`.

- [ ] **Step 3: Escrever a implementação**

Criar `frontend/projects/athlete/src/app/reservar/booking-dates.ts`:

```ts
/** Quantidade de chips do strip padrão de datas (offsets 0..29 a partir de hoje). */
export const STRIP_DAYS = 30;

/** Offset máximo, em dias a partir de hoje, que o atleta pode selecionar.
 *  Alinhado a RECURRING_HORIZON_DAYS/CLUB_HORIZON_DAYS (35) das Cloud Functions: além
 *  desse ponto as ocorrências de mensalista e clubinho ainda não foram materializadas,
 *  e o dia apareceria livre mesmo já tendo série contratada em cima. */
export const MAX_HORIZON_DAYS = 35;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(base: Date, days: number): Date {
  const out = dateOnly(base);
  out.setDate(out.getDate() + days);
  return out;
}

/** Diferença em dias de calendário. Passa por UTC para não quebrar em transição de
 *  horário de verão, onde um "dia" local pode ter 23 ou 25 horas. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

/** Datas do strip: STRIP_DAYS chips a partir de hoje, estendendo até a data selecionada
 *  quando ela cai além do strip padrão, e nunca passando do teto do horizonte. */
export function buildDateStrip(
  today: Date,
  selectedDate: Date,
  stripDays: number = STRIP_DAYS,
  maxHorizonDays: number = MAX_HORIZON_DAYS,
): Date[] {
  const start = dateOnly(today);
  const offset = daysBetween(start, selectedDate);
  const needed = offset > 0 ? offset + 1 : 0;
  const count = Math.min(maxHorizonDays + 1, Math.max(stripDays, needed));

  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    out.push(addDays(start, i));
  }
  return out;
}

/** Converte o valor de um `<input type="date">` (`YYYY-MM-DD`) em Date, ou null se o
 *  valor for malformado ou cair fora da faixa selecionável. O input nativo aceita
 *  digitação e colagem, então `min`/`max` no HTML não bastam. */
export function clampPickedDate(
  rawValue: string,
  today: Date,
  maxHorizonDays: number = MAX_HORIZON_DAYS,
): Date | null {
  const match = DATE_KEY_PATTERN.exec(rawValue.trim());
  if (!match) {
    return null;
  }
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m) - 1;
  const day = Number(d);
  const parsed = new Date(year, month, day);
  // Rejeita datas que o construtor "corrigiu" (ex: 2026-13-01 vira jan/2027).
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  const offset = daysBetween(today, parsed);
  if (offset < 0 || offset > maxHorizonDays) {
    return null;
  }
  return parsed;
}

/** O chip mostra o mês no início do strip e em toda virada de mês. */
export function shouldShowMonth(date: Date, index: number): boolean {
  return index === 0 || date.getDate() === 1;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

De `frontend/`:

```bash
ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: PASS, incluindo os specs já existentes do projeto.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/reservar/booking-dates.ts frontend/projects/athlete/src/app/reservar/booking-dates.spec.ts
git commit -m "feat(reservar): módulo puro de datas do strip de agendamento"
```

---

### Task 2: Busca de slots por faixa de datas

Substitui N chamadas de um dia por uma leitura só do Firestore. `fetchArenaDaySlotsMerged` vira wrapper e mantém comportamento.

**Files:**
- Modify: `frontend/shared/arena-discovery/slots-repository.ts:22-24,87-131`
- Modify: `frontend/shared/arena-discovery/index.ts:26`
- Test: `frontend/projects/athlete/src/app/reservar/persisted-slots-index.spec.ts`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces:
  - `groupPersistedSlotsByDayAndCourt(snap: QuerySnapshot): Map<string, ArenaSlot[]>` — chave `` `${dateKey}|${courtIdNormalizado}` ``, listas ordenadas por `startTime`.
  - `fetchArenaRangeSlotsMerged(db: Firestore, arenaId: string, startDate: Date, days: number): Promise<Record<string, ArenaSlot[]>>` — `days` é a **quantidade** de dias; `days: 1` cobre só `startDate`. O mapa sempre contém uma chave por dia da faixa, mesmo que o valor seja `[]`.

- [ ] **Step 1: Escrever o teste falhando**

O índice de slots persistidos é a única lógica nova que dá para testar sem Firestore. O spec vive no projeto athlete, seguindo o precedente de `src/app/reservar/arena-slot-date.spec.ts`, que já testa o lib compartilhado com snapshots falsos.

Criar `frontend/projects/athlete/src/app/reservar/persisted-slots-index.spec.ts`:

```ts
import type { DocumentData, DocumentSnapshot, QuerySnapshot } from 'firebase/firestore';
import { groupPersistedSlotsByDayAndCourt } from '@nexago/arena-discovery';

function fakeDoc(id: string, data: Record<string, unknown>): DocumentSnapshot<DocumentData> {
  return { id, data: () => data } as unknown as DocumentSnapshot<DocumentData>;
}

function fakeSnapshot(docs: DocumentSnapshot<DocumentData>[]): QuerySnapshot {
  return { docs } as unknown as QuerySnapshot;
}

function slotData(over: Record<string, unknown>): Record<string, unknown> {
  return {
    arenaId: 'a1',
    courtId: 'c1',
    date: '2026-07-29',
    startTime: '18:00',
    endTime: '19:00',
    status: 'booked',
    ...over,
  };
}

describe('groupPersistedSlotsByDayAndCourt', () => {
  it('separa slots por dia e por quadra', () => {
    const index = groupPersistedSlotsByDayAndCourt(
      fakeSnapshot([
        fakeDoc('s1', slotData({})),
        fakeDoc('s2', slotData({ courtId: 'c2' })),
        fakeDoc('s3', slotData({ date: '2026-08-02' })),
      ]),
    );

    expect(index.get('2026-07-29|c1')?.length).toBe(1);
    expect(index.get('2026-07-29|c2')?.length).toBe(1);
    expect(index.get('2026-08-02|c1')?.length).toBe(1);
    expect(index.get('2026-08-02|c2')).toBeUndefined();
  });

  it('normaliza o courtId por caixa e espaços', () => {
    const index = groupPersistedSlotsByDayAndCourt(
      fakeSnapshot([fakeDoc('s1', slotData({ courtId: '  Quadra-A  ' }))]),
    );

    expect(index.get('2026-07-29|quadra-a')?.length).toBe(1);
  });

  it('ordena os slots do dia por horário de início', () => {
    const index = groupPersistedSlotsByDayAndCourt(
      fakeSnapshot([
        fakeDoc('s1', slotData({ startTime: '20:00', endTime: '21:00' })),
        fakeDoc('s2', slotData({ startTime: '08:00', endTime: '09:00' })),
        fakeDoc('s3', slotData({ startTime: '14:00', endTime: '15:00' })),
      ]),
    );

    expect(index.get('2026-07-29|c1')?.map((s) => s.startTime)).toEqual([
      '08:00',
      '14:00',
      '20:00',
    ]);
  });

  it('ignora documentos que não viram slot válido', () => {
    const index = groupPersistedSlotsByDayAndCourt(
      fakeSnapshot([fakeDoc('s1', { arenaId: 'a1' }), fakeDoc('s2', slotData({}))]),
    );

    expect(index.size).toBe(1);
    expect(index.get('2026-07-29|c1')?.length).toBe(1);
  });

  it('devolve mapa vazio para snapshot sem documentos', () => {
    expect(groupPersistedSlotsByDayAndCourt(fakeSnapshot([])).size).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

De `frontend/`:

```bash
ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: FAIL na compilação — `groupPersistedSlotsByDayAndCourt` não é exportado por `@nexago/arena-discovery`.

- [ ] **Step 3: Escrever a implementação no lib**

Em `frontend/shared/arena-discovery/slots-repository.ts`, adicionar o import de `slotsQueryDateKey` na linha de import de `./slots-query`, que passa a ser:

```ts
import { readArenaFallbackPricePerHour, slotsQueryDateKey, type SlotsQuery } from './slots-query';
```

Substituir `courtMatches` (linhas 22-24) por um par de helpers, para que a normalização de
`courtId` viva num lugar só:

```ts
function normalizedCourtId(courtId: string): string {
  return courtId.trim().toLowerCase();
}

function courtMatches(docCourtId: string, queryCourtId: string): boolean {
  return normalizedCourtId(docCourtId) === normalizedCourtId(queryCourtId);
}
```

Substituir todo o bloco de `fetchArenaDaySlotsMerged` (linhas 87-131, do comentário JSDoc
até o `}` de fechamento) por:

```ts

function persistedIndexKey(dateKey: string, courtId: string): string {
  return `${dateKey}|${normalizedCourtId(courtId)}`;
}

/** Indexa os slots persistidos da arena por dia e quadra, em uma passada só.
 *  Evita varrer o snapshot inteiro uma vez por dia da faixa. */
export function groupPersistedSlotsByDayAndCourt(snap: QuerySnapshot): Map<string, ArenaSlot[]> {
  const index = new Map<string, ArenaSlot[]>();
  for (const docSnap of snap.docs) {
    const slot = arenaSlotFromFirestore(docSnap);
    if (!slot) {
      continue;
    }
    const key = persistedIndexKey(slotsQueryDateKey(slot.date), slot.courtId);
    const list = index.get(key);
    if (list) {
      list.push(slot);
    } else {
      index.set(key, [slot]);
    }
  }
  for (const list of index.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return index;
}

/** Slots (persistidos ∪ virtuais) de todas as quadras da arena, para uma faixa de dias.
 *
 *  Lê Firestore uma vez só para a faixa inteira: `arenaSlots` já vem sem filtro de data,
 *  então cobrir 36 dias custa as mesmas 4 idas que cobrir 1. O resto é cálculo local.
 *
 *  `days` é a quantidade de dias a partir de `startDate` (inclusive). O mapa retornado
 *  sempre tem uma chave por dia da faixa, com `[]` quando não há slot. */
export async function fetchArenaRangeSlotsMerged(
  db: Firestore,
  arenaId: string,
  startDate: Date,
  days: number,
): Promise<Record<string, ArenaSlot[]>> {
  const first = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const total = Math.max(1, Math.floor(days));

  const rangeDays: Date[] = [];
  for (let i = 0; i < total; i++) {
    const day = new Date(first);
    day.setDate(day.getDate() + i);
    rangeDays.push(day);
  }

  const result: Record<string, ArenaSlot[]> = {};

  const courts = await fetchCourts(db, arenaId);
  if (courts.length === 0) {
    for (const day of rangeDays) {
      result[slotsQueryDateKey(day)] = [];
    }
    return result;
  }

  const [slotSnap, arenaSnap, promotions] = await Promise.all([
    fetchArenaSlotsByArenaId(db, arenaId),
    getDoc(doc(db, 'arenas', arenaId)),
    fetchActivePromotions(db, arenaId),
  ]);

  const arenaFallback = readArenaFallbackPricePerHour(
    arenaSnap.exists() ? (arenaSnap.data() as Record<string, unknown>) : null,
  );
  const persistedIndex = groupPersistedSlotsByDayAndCourt(slotSnap);

  for (const day of rangeDays) {
    const dateKey = slotsQueryDateKey(day);
    const merged: ArenaSlot[] = [];

    for (const court of courts) {
      const q: SlotsQuery = {
        arenaId,
        courtId: court.id,
        date: day,
        arenaFallbackPricePerHourReais: arenaFallback,
      };
      const persisted = persistedIndex.get(persistedIndexKey(dateKey, court.id)) ?? [];
      const virtual = buildVirtualSlots({
        query: q,
        courtData: court.data,
        date: day,
        promotions,
      });
      merged.push(...mergeSlots(persisted, virtual));
    }

    merged.sort(
      (a, b) => a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId),
    );
    result[dateKey] = merged;
  }

  return result;
}

/** Slots de um dia para todas as quadras da arena (persistidos ∪ virtuais). */
export async function fetchArenaDaySlotsMerged(
  db: Firestore,
  arenaId: string,
  date: Date,
): Promise<ArenaSlot[]> {
  const range = await fetchArenaRangeSlotsMerged(db, arenaId, date, 1);
  return range[slotsQueryDateKey(date)] ?? [];
}
```

Em `frontend/shared/arena-discovery/index.ts`, trocar a linha 26 por:

```ts
export {
  fetchCourtDaySlots,
  fetchArenaDaySlotsMerged,
  fetchArenaRangeSlotsMerged,
  groupPersistedSlotsByDayAndCourt,
} from './slots-repository';
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

De `frontend/`:

```bash
ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: PASS. Em particular, `arena-slot-date.spec.ts` continua verde — ele cobre o parse de `date` que o novo índice usa como chave.

- [ ] **Step 5: Verificar que os consumidores existentes ainda compilam**

De `frontend/`:

```bash
ng build athlete --configuration development
```

Esperado: build sem erro. `arena-detail.component.ts` e `arena-payment.component.ts` usam `fetchArenaDaySlotsMerged` e não foram tocados.

- [ ] **Step 6: Commit**

```bash
git add frontend/shared/arena-discovery/slots-repository.ts frontend/shared/arena-discovery/index.ts frontend/projects/athlete/src/app/reservar/persisted-slots-index.spec.ts
git commit -m "perf(arena-discovery): busca de slots por faixa de datas em uma leitura só"
```

---

### Task 3: Strip de 30 dias no componente

Troca os 7 dias fixos pelo strip derivado de `buildDateStrip`, e a carga dia-a-dia pela busca por faixa.

**Files:**
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.html:29-50`

**Interfaces:**
- Consumes: `STRIP_DAYS`, `MAX_HORIZON_DAYS`, `dateOnly`, `addDays`, `buildDateStrip`, `clampPickedDate` (Task 1); `fetchArenaRangeSlotsMerged` (Task 2).
- Produces: `stripDates()` computed exposto ao template, substituindo `weekDates()`.

- [ ] **Step 1: Trocar imports e constantes**

Em `arena-booking.component.ts`, na linha 10, trocar `fetchArenaDaySlotsMerged` por `fetchArenaRangeSlotsMerged` dentro do import de `@nexago/arena-discovery`.

Logo abaixo do import de `AtPanelShellComponent` (linha 20), adicionar:

```ts
import {
  MAX_HORIZON_DAYS,
  addDays,
  buildDateStrip,
  clampPickedDate,
  dateOnly,
} from './booking-dates';
```

Remover a linha 26 (`const WEEK_LENGTH = 7;`).

Remover a função local `dateOnly` (linhas 65-67) — agora vem de `./booking-dates`.

Remover a função local `parseDateParam` (linhas 103-110) — `clampPickedDate` a substitui e ainda valida a faixa, o que `parseDateParam` não fazia.

- [ ] **Step 2: Trocar `weekDates` por `stripDates` e clampar o parâmetro da URL**

Substituir o bloco das linhas 142-156 por:

```ts
  private readonly today = dateOnly(new Date());

  /** Última data selecionável, no formato do `<input type="date">`. */
  protected readonly minDateKey = slotsQueryDateKey(this.today);
  protected readonly maxDateKey = slotsQueryDateKey(addDays(this.today, MAX_HORIZON_DAYS));

  protected readonly selectedDate = signal<Date>(
    clampPickedDate(this.route.snapshot.queryParamMap.get('date') ?? '', this.today) ?? this.today,
  );

  /** 30 chips a partir de hoje, estendendo até a data selecionada quando ela cai além
   *  do strip padrão (limite de MAX_HORIZON_DAYS). */
  protected readonly stripDates = computed<Date[]>(() =>
    buildDateStrip(this.today, this.selectedDate()),
  );
```

Atenção à ordem: `today` precisa continuar declarado antes de `minDateKey`, `maxDateKey` e `selectedDate`, porque campos de classe são inicializados na ordem de declaração.

- [ ] **Step 3: Apontar `dateAvailability` para o strip**

Na linha 272, trocar `for (const d of this.weekDates()) {` por:

```ts
    for (const d of this.stripDates()) {
```

- [ ] **Step 4: Trocar a carga dia-a-dia pela carga por faixa**

Em `load()`, substituir o bloco das linhas 340-348 por:

```ts
      // Uma leitura só cobre todo o horizonte: qualquer data selecionável já chega com
      // slots e bolinha de disponibilidade em memória, sem carga sob demanda.
      const slotsMap = await fetchArenaRangeSlotsMerged(
        this.firestore!,
        id,
        this.today,
        MAX_HORIZON_DAYS + 1,
      );
      this.slotsByDateKey.set(slotsMap);
```

- [ ] **Step 5: Atualizar o template**

Em `arena-booking.component.html`, na linha 30, trocar:

```html
              @for (d of weekDates(); track dateKeyOf(d)) {
```

por:

```html
              @for (d of stripDates(); track dateKeyOf(d)) {
```

- [ ] **Step 6: Verificar build e testes**

De `frontend/`:

```bash
ng build athlete --configuration development
```

Esperado: build sem erro, e nenhuma referência remanescente a `weekDates` ou `WEEK_LENGTH`. Confirmar com:

```bash
grep -rn "weekDates\|WEEK_LENGTH\|parseDateParam" frontend/projects/athlete/src
```

Esperado: nenhuma saída.

```bash
ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/projects/athlete/src/app/reservar/arena-booking.component.ts frontend/projects/athlete/src/app/reservar/arena-booking.component.html
git commit -m "feat(reservar): strip de 30 dias com carga única por faixa"
```

---

### Task 4: Mês no chip e ajuste do strip

Deixa a virada de mês legível e o strip confortável de rolar com 30+ chips.

**Files:**
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.html:29-50`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.scss:117-168`

**Interfaces:**
- Consumes: `shouldShowMonth` (Task 1), `stripDates()` (Task 3).
- Produces: `monthLabelFor(date: Date, index: number): string | null` — abreviação do mês em maiúsculas (`'AGO'`) quando o chip deve mostrá-la, `null` caso contrário.

- [ ] **Step 1: Adicionar o helper no componente**

Em `arena-booking.component.ts`, incluir `shouldShowMonth` no import de `./booking-dates`, que passa a ser:

```ts
import {
  MAX_HORIZON_DAYS,
  addDays,
  buildDateStrip,
  clampPickedDate,
  dateOnly,
  shouldShowMonth,
} from './booking-dates';
```

Adicionar o método junto dos outros helpers de template, logo depois de `isSelectedDate` (linha 409):

```ts
  /** Abreviação do mês para o chip, só no início do strip e em toda virada de mês. */
  protected monthLabelFor(date: Date, index: number): string | null {
    return shouldShowMonth(date, index) ? MONTH_ABBR[date.getMonth()]!.toUpperCase() : null;
  }
```

- [ ] **Step 2: Renderizar o mês inline no chip**

Em `arena-booking.component.html`, substituir o bloco do `@for` (linhas 30-49) por:

```html
              @for (d of stripDates(); track dateKeyOf(d); let i = $index) {
                <button
                  type="button"
                  class="bk-date-chip"
                  [class.bk-date-chip--active]="isSelectedDate(d)"
                  [attr.data-date-key]="dateKeyOf(d)"
                  (click)="selectDate(d)"
                >
                  <span class="bk-date-weekday">{{ weekdayAbbr[d.getDay()] }}</span>
                  <span class="bk-date-day">
                    {{ d.getDate() }}
                    @if (monthLabelFor(d, i); as monthLabel) {
                      <span class="bk-date-month">{{ monthLabel }}</span>
                    }
                  </span>
                  @if (!isSelectedDate(d)) {
                    <span
                      class="bk-date-dot"
                      [class.bk-date-dot--high]="dateAvailability()[dateKeyOf(d)] === 'high'"
                      [class.bk-date-dot--low]="dateAvailability()[dateKeyOf(d)] === 'low'"
                      [class.bk-date-dot--none]="dateAvailability()[dateKeyOf(d)] === 'none'"
                      aria-hidden="true"
                    ></span>
                  }
                </button>
              }
```

O `data-date-key` é o gancho que a Task 5 usa para rolar o chip selecionado até a vista.

- [ ] **Step 3: Ajustar os estilos**

Em `arena-booking.component.scss`, substituir a regra `.bk-date-row` (linhas 117-122) por:

```scss
.bk-date-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;

  @media (min-width: 768px) {
    // Sinaliza que há mais chips fora da vista. Suaviza também o primeiro e o último
    // chip nos extremos da rolagem — troca aceita para não depender de listener de scroll.
    mask-image: linear-gradient(
      to right,
      transparent 0,
      #000 24px,
      #000 calc(100% - 24px),
      transparent 100%
    );
  }
}
```

Na regra `.bk-date-chip` (linha 124), trocar `width: 68px;` por `width: 72px;` e acrescentar `scroll-snap-align: start;` logo depois de `flex: none;`.

Substituir a regra `.bk-date-day` (linhas 164-168) por:

```scss
.bk-date-day {
  font-family: var(--nx-font-display);
  font-weight: 800;
  font-size: 20px;
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
}

.bk-date-month {
  font-family: var(--nx-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--nx-text-dim);
}
```

Dentro da regra `.bk-date-chip--active` (o bloco que já ajusta `.bk-date-weekday` nas linhas 149-152), acrescentar, ao lado dele:

```scss
    .bk-date-month {
      color: var(--nx-text-on-orange);
      opacity: 0.85;
    }
```

- [ ] **Step 4: Verificar build**

De `frontend/`:

```bash
ng build athlete --configuration development
```

Esperado: build sem erro.

- [ ] **Step 5: Verificar no navegador**

Subir o dev server do projeto athlete e abrir a tela de agendamento de uma arena com quadras cadastradas (`/reservar/<arenaId>/agendar`). Confirmar:

- o strip mostra 30 chips e rola horizontalmente;
- o primeiro chip mostra o mês ao lado do número;
- o chip do dia 1º do mês seguinte mostra o mês;
- as bolinhas de disponibilidade aparecem ao longo de todo o strip, não só nos 7 primeiros;
- o console não tem erro.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/athlete/src/app/reservar/arena-booking.component.ts frontend/projects/athlete/src/app/reservar/arena-booking.component.html frontend/projects/athlete/src/app/reservar/arena-booking.component.scss
git commit -m "feat(reservar): mês no chip na virada e ajustes de rolagem do strip"
```

---

### Task 5: Date picker nativo

Atalho para pular direto a uma data, incluindo os dias além do strip padrão.

**Files:**
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.html:27-51`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.scss`

**Interfaces:**
- Consumes: `clampPickedDate`, `MAX_HORIZON_DAYS` (Task 1); `minDateKey`, `maxDateKey`, `selectDate` (Task 3); `data-date-key` no chip (Task 4).
- Produces: `onDatePicked(rawValue: string): void`.

- [ ] **Step 1: Adicionar o handler e o scroll no componente**

Em `arena-booking.component.ts`, ampliar o import de `@angular/core` na linha 1 para:

```ts
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
```

Junto das outras injeções (depois de `private readonly firestore = createFirestore();`, linha 124), adicionar:

```ts
  private readonly injector = inject(Injector);
  private readonly dateRowRef = viewChild<ElementRef<HTMLElement>>('dateRow');
```

Adicionar os métodos logo depois de `selectDate` (linha 364):

```ts
  protected onDatePicked(rawValue: string): void {
    const picked = clampPickedDate(rawValue, this.today, MAX_HORIZON_DAYS);
    if (!picked) {
      return;
    }
    this.selectDate(picked);
    this.scrollSelectedIntoView();
  }

  /** Rola o chip da data selecionada até o centro do strip. Roda depois da renderização
   *  porque o strip pode ter acabado de crescer para acomodar a data escolhida. */
  private scrollSelectedIntoView(): void {
    afterNextRender(
      () => {
        const row = this.dateRowRef()?.nativeElement;
        const chip = row?.querySelector<HTMLElement>(
          `[data-date-key="${this.selectedDateKey()}"]`,
        );
        chip?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      },
      { injector: this.injector },
    );
  }
```

No fim do bloco `try` de `load()`, logo depois de `this.slotsByDateKey.set(slotsMap);`, adicionar:

```ts
      // Entrada via ?date= pode apontar para um chip fora da vista inicial.
      this.scrollSelectedIntoView();
```

- [ ] **Step 2: Adicionar o picker no template**

Em `arena-booking.component.html`, substituir as linhas 27-29 (o `<h2>` "Data" e a abertura de `.bk-date-row`) por:

```html
            <div class="bk-date-head">
              <h2 class="bk-card-title">Data</h2>
              <label class="bk-date-picker">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                <span aria-hidden="true">Escolher data</span>
                <input
                  type="date"
                  class="bk-date-native"
                  aria-label="Escolher data da reserva"
                  [value]="selectedDateKey()"
                  [min]="minDateKey"
                  [max]="maxDateKey"
                  (change)="onDatePicked($any($event.target).value)"
                />
              </label>
            </div>
            <div class="bk-date-row" #dateRow>
```

`(change)` e não `(input)`: o input de data dispara `input` a cada parte digitada, o que rejeitaria datas parciais em cima do usuário enquanto ele digita.

- [ ] **Step 3: Estilizar o cabeçalho e o picker**

Em `arena-booking.component.scss`, adicionar logo antes da regra `.bk-date-row`:

```scss
.bk-date-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;

  .bk-card-title {
    margin-bottom: 0;
  }
}

.bk-date-picker {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: var(--nx-r-2);
  border: 1px solid var(--nx-line);
  background: var(--nx-surface-1);
  color: var(--nx-text-dim);
  font-family: var(--nx-font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;

  &:hover {
    color: var(--nx-text);
    border-color: var(--nx-orange);
  }

  &:focus-within {
    outline: 2px solid var(--nx-orange);
    outline-offset: 2px;
  }
}

.bk-date-native {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
```

- [ ] **Step 4: Verificar build e testes**

De `frontend/`:

```bash
ng build athlete --configuration development
```

Esperado: build sem erro.

```bash
ng test athlete --watch=false --browsers=ChromeHeadless
```

Esperado: PASS.

- [ ] **Step 5: Verificar no navegador**

Na tela de agendamento, confirmar:

- o botão "Escolher data" abre o calendário nativo;
- o calendário não deixa escolher data anterior a hoje nem posterior a hoje+35;
- escolher uma data dentro dos 30 dias seleciona o chip e rola até ele;
- escolher uma data entre o dia 31 e o 35 estende o strip, seleciona o chip novo e rola até ele;
- a lista de horários e o resumo passam a refletir a data escolhida;
- abrir a tela com `?date=` de uma data distante já chega com o chip certo selecionado e visível;
- o console não tem erro.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/athlete/src/app/reservar/arena-booking.component.ts frontend/projects/athlete/src/app/reservar/arena-booking.component.html frontend/projects/athlete/src/app/reservar/arena-booking.component.scss
git commit -m "feat(reservar): date picker nativo com teto de 35 dias"
```

---

## Verificação final

De `frontend/`:

```bash
ng test athlete --watch=false --browsers=ChromeHeadless && ng build athlete --configuration production
```

Esperado: todos os specs verdes e build de produção sem erro.

Conferir também que os outros consumidores do lib não regrediram:

```bash
ng build arena --configuration development
```

Esperado: build sem erro — o painel da arena consome `@nexago/arena-discovery` e a única mudança de superfície foi aditiva.
