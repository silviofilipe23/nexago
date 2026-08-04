# Horário de pico: reserva mínima de 2h — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a arena configure "horários de pico" que exigem reserva mínima de 2h, com liberação automática do avulso quando o pacote é impossível (vizinhas ocupadas) ou quando a janela de antecedência abre.

**Architecture:** Nova subcoleção `arenas/{arenaId}/peakRules` (formato espelhado das `promotions`). Um predicado único — "exigir o mínimo somente se existir cadeia contígua disponível que o cumpra" — implementado 3×: servidor (`functions/src/arena-peak-rules.ts`, autoridade, chamado em `quoteArenaBooking`/`createArenaBooking`), lib web compartilhada (`frontend/shared/arena-discovery/arena-peak-rule.ts`, UX dos portais) e Dart puro (`slots_page_logic.dart`). CRUD no painel da arena com gate de capability `horariosPico` (Pro+). Gestor e mensalistas isentos (nenhuma mudança nos fluxos deles).

**Tech Stack:** Cloud Functions v2 (TypeScript, testes `node --test`), Angular standalone/signals/OnPush (portais atleta e arena), Flutter/Riverpod, Firestore rules.

**Spec:** `docs/superpowers/specs/2026-08-03-horario-pico-minimo-2h-design.md`

## Global Constraints

- Strings de UI/erros em português; código em inglês.
- NUNCA `Date.parse`/`toISOString` para `dateKey` — sempre montar `Date` por componentes (lição do bug de deslocamento UTC).
- Sem regra `peakRules` cadastrada, comportamento 100% idêntico ao atual (retrocompatível por construção).
- A regra NÃO se aplica a reservas do gestor nem ao materializer de recorrentes — não tocar em `arena-recurring-booking.ts`, `arena-recurring-materializer.ts` nem fluxos do painel de agenda.
- Angular: componentes standalone (sem `standalone: true` explícito), signals, `ChangeDetectionStrategy.OnPush`, `inject()`, control flow nativo (`@if`/`@for`), sem `ngClass`/`ngStyle`.
- Functions: testes co-locados `*.test.ts` com `node:test` + `assert/strict`, nomes de teste em português (padrão de `arena-coupons.test.ts`).
- Mensagem canônica de violação: `Este horário exige reserva mínima de {N}h. Inclua uma hora vizinha para confirmar.`
- Commits frequentes, mensagens em português com prefixo convencional (`feat:`, `test:`, `docs:`), rodapé `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Todos os caminhos são relativos à raiz do worktree.

## O predicado (referência canônica para as 3 implementações)

Dada uma seleção de slots contíguos de uma quadra/dia:

1. Slot "de pico" = casa com regra ativa (quadra ∈ `courtIds` ou lista vazia; weekday ISO ∈ `weekdays` ou vazia; início do slot dentro de `[startTime, endTime)`, com suporte a faixa overnight — mesmo matcher de promoções). Sem slot de pico na seleção → **permitido**.
2. Se mais de uma regra casa com o mesmo slot, vale a de **maior** `minDurationMinutes`; `minSlots = ceil(minDurationMinutes / slotDurationMinutes)`.
3. `selection.length >= minSlots` → **permitido**.
4. Por slot de pico da seleção: se `releaseHoursBefore != null` e `agora >= inícioDoSlot − releaseHoursBefore` → esse slot está **liberado** (janela de antecedência). Comparação em wall-clock local (cliente) / America/Sao_Paulo (servidor), datas por componentes.
5. Por slot de pico não liberado: existe **cadeia contígua elegível** de `minSlots` contendo o slot? (elegível = disponível E não-passado E `slots[i-1].endTime === slots[i].startTime`). Se NÃO existe → liberado (avulso não cria hora morta). Se existe → **bloqueado** (exige `minSlots`).
6. Resultado da seleção: o **maior** `minSlots` ainda exigido por algum slot de pico; `1` quando tudo liberado.

---

### Task 1: Lib compartilhada web — modelo, matcher e predicado `arena-peak-rule.ts`

**Files:**
- Create: `frontend/shared/arena-discovery/arena-peak-rule.ts`
- Modify: `frontend/shared/arena-discovery/index.ts` (exports no fim do arquivo)
- Test: `frontend/projects/athlete/src/app/reservar/arena-peak-rule.spec.ts`

**Interfaces:**
- Consumes: `ArenaSlot`, `arenaSlotIsAvailable`, `timeToMinutes` de `./arena-slot`.
- Produces (usado nas Tasks 5, 6, 7):
  - `interface ArenaPeakRule { id: string; active: boolean; label: string; courtIds: string[]; weekdays: number[]; startTime: string; endTime: string; minDurationMinutes: number; releaseHoursBefore: number | null; }`
  - `arenaPeakRuleFromFirestore(doc: DocumentSnapshot<DocumentData>): ArenaPeakRule`
  - `fetchActivePeakRules(db: Firestore, arenaId: string): Promise<ArenaPeakRule[]>`
  - `peakRuleMatches(rule: ArenaPeakRule, courtId: string, date: Date, slotStartTime: string): boolean`
  - `interface PeakSelectionCheck { minSlots: number; rule: ArenaPeakRule | null; }`
  - `peakCheckForSelection(params: { rules: ArenaPeakRule[]; courtId: string; date: Date; courtDaySlots: ArenaSlot[]; selection: ArenaSlot[]; slotDurationMinutes: number; now?: Date }): PeakSelectionCheck`
  - `peakBadgeMinSlots(params: { rules: ArenaPeakRule[]; courtId: string; date: Date; courtDaySlots: ArenaSlot[]; slot: ArenaSlot; slotDurationMinutes: number; now?: Date }): number`

- [ ] **Step 1: Escrever os testes que falham**

Criar `frontend/projects/athlete/src/app/reservar/arena-peak-rule.spec.ts` (mesmo estilo jasmine de `booking-dates.spec.ts`):

```ts
import {
  peakCheckForSelection,
  peakBadgeMinSlots,
  peakRuleMatches,
  type ArenaPeakRule,
  type ArenaSlot,
} from '@nexago/arena-discovery';

const QUA = new Date(2026, 7, 5); // 05/08/2026, quarta (ISO weekday 3)
const NOW_CEDO = new Date(2026, 7, 5, 10, 0); // 10:00 do mesmo dia

function rule(overrides: Partial<ArenaPeakRule> = {}): ArenaPeakRule {
  return {
    id: 'r1',
    active: true,
    label: 'Pico noturno',
    courtIds: [],
    weekdays: [],
    startTime: '20:00',
    endTime: '21:00',
    minDurationMinutes: 120,
    releaseHoursBefore: null,
    ...overrides,
  };
}

function slot(startTime: string, endTime: string, rawStatus = 'available'): ArenaSlot {
  return {
    id: `q1_${startTime}`,
    arenaId: 'a1',
    courtId: 'q1',
    date: QUA,
    startTime,
    endTime,
    rawStatus,
    priceReais: 100,
    basePriceReais: 100,
    appliedPromotionId: null,
    isVirtual: rawStatus === 'available',
  };
}

function day(...slots: ArenaSlot[]): ArenaSlot[] {
  return slots;
}

describe('peakRuleMatches', () => {
  it('casa pelo início do slot dentro da faixa', () => {
    expect(peakRuleMatches(rule(), 'q1', QUA, '20:00')).toBe(true);
    expect(peakRuleMatches(rule(), 'q1', QUA, '19:00')).toBe(false);
    expect(peakRuleMatches(rule(), 'q1', QUA, '21:00')).toBe(false);
  });

  it('respeita filtro de quadra e de dia da semana', () => {
    expect(peakRuleMatches(rule({ courtIds: ['q2'] }), 'q1', QUA, '20:00')).toBe(false);
    expect(peakRuleMatches(rule({ weekdays: [3] }), 'q1', QUA, '20:00')).toBe(true);
    expect(peakRuleMatches(rule({ weekdays: [6, 7] }), 'q1', QUA, '20:00')).toBe(false);
  });

  it('regra inativa nunca casa', () => {
    expect(peakRuleMatches(rule({ active: false }), 'q1', QUA, '20:00')).toBe(false);
  });

  it('suporta faixa cruzando a meia-noite', () => {
    const overnight = rule({ startTime: '22:00', endTime: '01:00' });
    expect(peakRuleMatches(overnight, 'q1', QUA, '23:00')).toBe(true);
    expect(peakRuleMatches(overnight, 'q1', QUA, '00:00')).toBe(true);
    expect(peakRuleMatches(overnight, 'q1', QUA, '21:00')).toBe(false);
  });
});

describe('peakCheckForSelection', () => {
  const daySlots = day(
    slot('19:00', '20:00'),
    slot('20:00', '21:00'),
    slot('21:00', '22:00'),
  );

  it('sem regra: seleção de 1h passa (minSlots 1)', () => {
    const r = peakCheckForSelection({
      rules: [], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      selection: [daySlots[1]!], slotDurationMinutes: 60, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(1);
    expect(r.rule).toBeNull();
  });

  it('20h avulsa com vizinhas livres: exige 2 slots', () => {
    const r = peakCheckForSelection({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      selection: [daySlots[1]!], slotDurationMinutes: 60, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(2);
    expect(r.rule?.id).toBe('r1');
  });

  it('seleção de 2h incluindo o pico passa (sem exigência pendente)', () => {
    const r = peakCheckForSelection({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      selection: [daySlots[0]!, daySlots[1]!], slotDurationMinutes: 60, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(1); // seleção já cumpre o mínimo → nada pendente
  });

  it('vizinhas ocupadas/bloqueadas: avulso liberado (sem cadeia possível)', () => {
    const cercado = day(
      slot('19:00', '20:00', 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', 'blocked'),
    );
    const r = peakCheckForSelection({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: cercado,
      selection: [cercado[1]!], slotDurationMinutes: 60, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(1);
  });

  it('uma vizinha livre basta para manter a exigência', () => {
    const parcial = day(
      slot('19:00', '20:00', 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00'),
    );
    const r = peakCheckForSelection({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: parcial,
      selection: [parcial[1]!], slotDurationMinutes: 60, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(2);
  });

  it('vizinha no passado não conta como cadeia: às 19h30, com 21h ocupada, 20h avulsa libera', () => {
    const tarde = new Date(2026, 7, 5, 19, 30);
    const soFrente = day(
      slot('19:00', '20:00'),          // livre, mas já passou das 19h30
      slot('20:00', '21:00'),
      slot('21:00', '22:00', 'booked'),
    );
    const r = peakCheckForSelection({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: soFrente,
      selection: [soFrente[1]!], slotDurationMinutes: 60, now: tarde,
    });
    expect(r.minSlots).toBe(1);
  });

  it('janela de liberação: 3h antes libera o avulso', () => {
    const r = rule({ releaseHoursBefore: 3 });
    const dentroDaJanela = new Date(2026, 7, 5, 17, 30); // 20:00 − 3h = 17:00
    const fora = new Date(2026, 7, 5, 16, 59);
    const liberado = peakCheckForSelection({
      rules: [r], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      selection: [daySlots[1]!], slotDurationMinutes: 60, now: dentroDaJanela,
    });
    const bloqueado = peakCheckForSelection({
      rules: [r], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      selection: [daySlots[1]!], slotDurationMinutes: 60, now: fora,
    });
    expect(liberado.minSlots).toBe(1);
    expect(bloqueado.minSlots).toBe(2);
  });

  it('duas regras sobrepostas: vale o maior mínimo', () => {
    const grade4 = day(
      slot('18:00', '19:00'), slot('19:00', '20:00'),
      slot('20:00', '21:00'), slot('21:00', '22:00'),
    );
    const r = peakCheckForSelection({
      rules: [rule(), rule({ id: 'r2', minDurationMinutes: 180 })],
      courtId: 'q1', date: QUA, courtDaySlots: grade4,
      selection: [grade4[2]!], slotDurationMinutes: 60, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(3);
    expect(r.rule?.id).toBe('r2');
  });

  it('quadra com slot de 30min: mínimo de 120min = 4 slots', () => {
    const meia = day(
      slot('19:00', '19:30'), slot('19:30', '20:00'),
      slot('20:00', '20:30'), slot('20:30', '21:00'),
      slot('21:00', '21:30'), slot('21:30', '22:00'),
    );
    const r = peakCheckForSelection({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: meia,
      selection: [meia[2]!], slotDurationMinutes: 30, now: NOW_CEDO,
    });
    expect(r.minSlots).toBe(4);
  });
});

describe('peakBadgeMinSlots', () => {
  it('devolve o mínimo exigido para o chip (badge) e 1 quando livre', () => {
    const daySlots = day(
      slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00'),
    );
    expect(peakBadgeMinSlots({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      slot: daySlots[1]!, slotDurationMinutes: 60, now: NOW_CEDO,
    })).toBe(2);
    expect(peakBadgeMinSlots({
      rules: [rule()], courtId: 'q1', date: QUA, courtDaySlots: daySlots,
      slot: daySlots[0]!, slotDurationMinutes: 60, now: NOW_CEDO,
    })).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx ng test athlete --watch=false`
Expected: FAIL — `peakCheckForSelection` não exportado por `@nexago/arena-discovery`.

- [ ] **Step 3: Implementar `frontend/shared/arena-discovery/arena-peak-rule.ts`**

```ts
import type { DocumentData, DocumentSnapshot, Firestore } from 'firebase/firestore';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { arenaSlotIsAvailable, timeToMinutes, type ArenaSlot } from './arena-slot';

/** Regra de horário de pico em `arenas/{arenaId}/peakRules/{ruleId}`.
 *  Mesmo formato de faixa/escopo das promoções; em vez de desconto, impõe
 *  reserva mínima (`minDurationMinutes`) com liberação opcional por
 *  antecedência (`releaseHoursBefore`). */
export interface ArenaPeakRule {
  id: string;
  active: boolean;
  label: string;
  /** Vazio = todas as quadras. */
  courtIds: string[];
  /** ISO 1-7 (seg-dom). Vazio = todos os dias. */
  weekdays: number[];
  startTime: string;
  endTime: string;
  minDurationMinutes: number;
  /** null = nunca libera por antecedência. */
  releaseHoursBefore: number | null;
}

export interface PeakSelectionCheck {
  /** Mínimo de slots contíguos exigido para a seleção (1 = livre). */
  minSlots: number;
  /** Regra que impôs o mínimo, para mensagem/badge. */
  rule: ArenaPeakRule | null;
}

const DEFAULT_MIN_DURATION = 120;

export function arenaPeakRuleFromFirestore(doc: DocumentSnapshot<DocumentData>): ArenaPeakRule {
  const data = doc.data() ?? {};
  const courtIds: string[] = [];
  if (Array.isArray(data['courtIds'])) {
    for (const e of data['courtIds']) {
      if (typeof e === 'string' && e.trim()) courtIds.push(e.trim());
    }
  }
  const weekdays: number[] = [];
  if (Array.isArray(data['weekdays'])) {
    for (const e of data['weekdays']) {
      if (typeof e === 'number') weekdays.push(e);
    }
  }
  const minRaw = data['minDurationMinutes'];
  const releaseRaw = data['releaseHoursBefore'];
  return {
    id: doc.id,
    active: data['active'] === true,
    label: typeof data['label'] === 'string' ? data['label'] : '',
    courtIds,
    weekdays,
    startTime: normalizeHm(String(data['startTime'] ?? '00:00')),
    endTime: normalizeHm(String(data['endTime'] ?? '23:59')),
    minDurationMinutes:
      typeof minRaw === 'number' && minRaw >= 60 && minRaw <= 360 ? minRaw : DEFAULT_MIN_DURATION,
    releaseHoursBefore:
      typeof releaseRaw === 'number' && releaseRaw > 0 ? releaseRaw : null,
  };
}

export async function fetchActivePeakRules(db: Firestore, arenaId: string): Promise<ArenaPeakRule[]> {
  const snap = await getDocs(
    query(collection(db, 'arenas', arenaId, 'peakRules'), where('active', '==', true)),
  );
  return snap.docs.map((d) => arenaPeakRuleFromFirestore(d));
}

export function peakRuleMatches(
  rule: ArenaPeakRule,
  courtId: string,
  date: Date,
  slotStartTime: string,
): boolean {
  if (!rule.active) return false;
  if (rule.courtIds.length > 0 && !rule.courtIds.includes(courtId)) return false;
  if (rule.weekdays.length > 0 && !rule.weekdays.includes(isoWeekday(date))) return false;
  const slotMin = timeToMinutes(slotStartTime);
  const startMin = timeToMinutes(rule.startTime);
  const endMin = timeToMinutes(rule.endTime);
  if (endMin > startMin) {
    return slotMin >= startMin && slotMin < endMin;
  }
  // Faixa overnight (ex.: 22:00–01:00).
  return slotMin >= startMin || slotMin < endMin;
}

/** Predicado central (ver spec): mínimo exigido para a seleção, já com as duas
 *  liberações automáticas (janela de antecedência; cadeia impossível). */
export function peakCheckForSelection(params: {
  rules: ArenaPeakRule[];
  courtId: string;
  date: Date;
  /** Slots do dia da MESMA quadra, ordenados por startTime (persistidos ∪ virtuais). */
  courtDaySlots: ArenaSlot[];
  /** Cadeia contígua candidata. */
  selection: ArenaSlot[];
  slotDurationMinutes: number;
  now?: Date;
}): PeakSelectionCheck {
  const now = params.now ?? new Date();
  let demandedSlots = 1;
  let demandedRule: ArenaPeakRule | null = null;

  for (const slot of params.selection) {
    const rule = restrictionForSlot(slot, params.rules, params.courtId, params.date, now);
    if (!rule) continue;
    const minSlots = Math.max(
      1,
      Math.ceil(rule.minDurationMinutes / Math.max(1, params.slotDurationMinutes)),
    );
    if (params.selection.length >= minSlots) continue;
    if (!chainExistsContaining(params.courtDaySlots, slot.startTime, minSlots, params.date, now)) {
      continue; // sem cadeia possível → avulso não cria hora morta
    }
    if (minSlots > demandedSlots) {
      demandedSlots = minSlots;
      demandedRule = rule;
    }
  }
  return { minSlots: demandedSlots, rule: demandedRule };
}

/** Mínimo a exibir no chip do slot (badge "mín. 2h"): mesmo predicado com seleção unitária. */
export function peakBadgeMinSlots(params: {
  rules: ArenaPeakRule[];
  courtId: string;
  date: Date;
  courtDaySlots: ArenaSlot[];
  slot: ArenaSlot;
  slotDurationMinutes: number;
  now?: Date;
}): number {
  return peakCheckForSelection({
    rules: params.rules,
    courtId: params.courtId,
    date: params.date,
    courtDaySlots: params.courtDaySlots,
    selection: [params.slot],
    slotDurationMinutes: params.slotDurationMinutes,
    now: params.now,
  }).minSlots;
}

function restrictionForSlot(
  slot: ArenaSlot,
  rules: ArenaPeakRule[],
  courtId: string,
  date: Date,
  now: Date,
): ArenaPeakRule | null {
  let best: ArenaPeakRule | null = null;
  for (const rule of rules) {
    if (!peakRuleMatches(rule, courtId, date, slot.startTime)) continue;
    if (best == null || rule.minDurationMinutes > best.minDurationMinutes) best = rule;
  }
  if (best == null) return null;
  if (best.releaseHoursBefore != null) {
    const releaseAt = new Date(
      slotStartDate(date, slot.startTime).getTime() - best.releaseHoursBefore * 60 * 60 * 1000,
    );
    if (now.getTime() >= releaseAt.getTime()) return null;
  }
  return best;
}

function chainExistsContaining(
  courtDaySlots: ArenaSlot[],
  targetStartTime: string,
  minSlots: number,
  date: Date,
  now: Date,
): boolean {
  const idx = courtDaySlots.findIndex((s) => s.startTime === targetStartTime);
  if (idx === -1) return false;
  for (let start = Math.max(0, idx - (minSlots - 1)); start <= idx; start++) {
    if (start + minSlots > courtDaySlots.length) break;
    let ok = true;
    for (let i = start; i < start + minSlots; i++) {
      const s = courtDaySlots[i]!;
      if (!chainEligible(s, date, now)) { ok = false; break; }
      if (i > start && courtDaySlots[i - 1]!.endTime !== s.startTime) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function chainEligible(slot: ArenaSlot, date: Date, now: Date): boolean {
  if (!arenaSlotIsAvailable(slot)) return false;
  return slotStartDate(date, slot.startTime).getTime() > now.getTime();
}

/** Data local por componentes — nunca Date.parse (deslocamento UTC). */
function slotStartDate(date: Date, startTime: string): Date {
  const min = timeToMinutes(startTime);
  return new Date(
    date.getFullYear(), date.getMonth(), date.getDate(),
    Math.floor(min / 60), min % 60,
  );
}

function isoWeekday(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

function normalizeHm(raw: string): string {
  const t = raw.trim();
  return t.length >= 5 ? t.substring(0, 5) : t;
}
```

- [ ] **Step 4: Exportar no `frontend/shared/arena-discovery/index.ts`** (append no fim)

```ts
export type { ArenaPeakRule, PeakSelectionCheck } from './arena-peak-rule';
export {
  arenaPeakRuleFromFirestore,
  fetchActivePeakRules,
  peakBadgeMinSlots,
  peakCheckForSelection,
  peakRuleMatches,
} from './arena-peak-rule';
```

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `cd frontend && npx ng test athlete --watch=false`
Expected: PASS (todos os specs, incluindo os pré-existentes).

- [ ] **Step 6: Commit**

```bash
git add frontend/shared/arena-discovery/arena-peak-rule.ts frontend/shared/arena-discovery/index.ts frontend/projects/athlete/src/app/reservar/arena-peak-rule.spec.ts
git commit -m "feat(shared): modelo e predicado de horário de pico (peakRules)"
```

---

### Task 2: Functions — parser + predicado servidor `arena-peak-rules.ts`

**Files:**
- Create: `functions/src/arena-peak-rules.ts`
- Test: `functions/src/arena-peak-rules.test.ts`

**Interfaces:**
- Consumes: `VirtualSlotPricing` de `./arena-pricing`; `HttpsError` de `firebase-functions/v2/https`; `Firestore`/`QueryDocumentSnapshot` de `firebase-admin/firestore`.
- Produces (usado na Task 3):
  - `interface ArenaPeakRuleDoc { id: string; active: boolean; label: string; courtIds: string[]; weekdays: number[]; startTime: string; endTime: string; minDurationMinutes: number; releaseHoursBefore: number | null; }`
  - `parsePeakRulesFromDocs(docs: QueryDocumentSnapshot[]): ArenaPeakRuleDoc[]`
  - `interface SpNow { dateKey: string; minutes: number; }` e `spNow(nowUtc?: Date): SpNow`
  - `interface PeakSlotView { startTime: string; endTime: string; available: boolean; }`
  - `resolveDayAvailability(params: { virtual: {startTime: string; endTime: string}[]; persisted: {startTime: string; endTime: string; status: string}[]; dateKey: string; now: SpNow }): PeakSlotView[]`
  - `peakViolation(params: { rules: ArenaPeakRuleDoc[]; courtId: string; dateKey: string; daySlots: PeakSlotView[]; selectionStartTimes: string[]; slotDurationMinutes: number; now: SpNow }): { minDurationMinutes: number } | null`
  - `ensurePeakRuleSatisfied(params: { db: Firestore; arenaId: string; courtId: string; dateKey: string; peakRules: ArenaPeakRuleDoc[]; courtData: Record<string, unknown> | undefined; arenaFallback: number | null; selectionStartTimes: string[] }): Promise<void>` — lança `HttpsError('failed-precondition', ...)`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `functions/src/arena-peak-rules.test.ts` (estilo `node:test` de `arena-coupons.test.ts`). Cobrir com o MESMO catálogo de casos da Task 1, adaptado às APIs do servidor — obrigatórios:

```ts
import {describe, it} from "node:test";
import assert from "node:assert/strict";
import {
  peakViolation,
  resolveDayAvailability,
  spNow,
  type ArenaPeakRuleDoc,
  type PeakSlotView,
  type SpNow,
} from "./arena-peak-rules";

function rule(overrides: Partial<ArenaPeakRuleDoc> = {}): ArenaPeakRuleDoc {
  return {
    id: "r1", active: true, label: "Pico noturno",
    courtIds: [], weekdays: [],
    startTime: "20:00", endTime: "21:00",
    minDurationMinutes: 120, releaseHoursBefore: null,
    ...overrides,
  };
}

// 05/08/2026 é quarta; "agora" cedo do mesmo dia.
const NOW: SpNow = {dateKey: "2026-08-05", minutes: 10 * 60};
const DATE_KEY = "2026-08-05";

function view(startTime: string, endTime: string, available = true): PeakSlotView {
  return {startTime, endTime, available};
}

describe("peakViolation", () => {
  const daySlots = [view("19:00", "20:00"), view("20:00", "21:00"), view("21:00", "22:00")];

  it("sem regra ativa: sem violação", () => {
    assert.equal(peakViolation({
      rules: [], courtId: "q1", dateKey: DATE_KEY, daySlots,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: NOW,
    }), null);
  });

  it("20h avulsa com vizinhas livres viola (mínimo 120)", () => {
    const v = peakViolation({
      rules: [rule()], courtId: "q1", dateKey: DATE_KEY, daySlots,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: NOW,
    });
    assert.deepEqual(v, {minDurationMinutes: 120});
  });

  it("seleção 19h+20h cumpre o mínimo", () => {
    assert.equal(peakViolation({
      rules: [rule()], courtId: "q1", dateKey: DATE_KEY, daySlots,
      selectionStartTimes: ["19:00", "20:00"], slotDurationMinutes: 60, now: NOW,
    }), null);
  });

  it("vizinhas indisponíveis: avulso liberado", () => {
    const cercado = [view("19:00", "20:00", false), view("20:00", "21:00"), view("21:00", "22:00", false)];
    assert.equal(peakViolation({
      rules: [rule()], courtId: "q1", dateKey: DATE_KEY, daySlots: cercado,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: NOW,
    }), null);
  });

  it("uma vizinha livre mantém a exigência", () => {
    const parcial = [view("19:00", "20:00", false), view("20:00", "21:00"), view("21:00", "22:00")];
    assert.notEqual(peakViolation({
      rules: [rule()], courtId: "q1", dateKey: DATE_KEY, daySlots: parcial,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: NOW,
    }), null);
  });

  it("janela de liberação por antecedência (3h antes)", () => {
    const r = rule({releaseHoursBefore: 3});
    const dentro: SpNow = {dateKey: DATE_KEY, minutes: 17 * 60 + 30};
    const fora: SpNow = {dateKey: DATE_KEY, minutes: 16 * 60 + 59};
    assert.equal(peakViolation({
      rules: [r], courtId: "q1", dateKey: DATE_KEY, daySlots,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: dentro,
    }), null);
    assert.notEqual(peakViolation({
      rules: [r], courtId: "q1", dateKey: DATE_KEY, daySlots,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: fora,
    }), null);
  });

  it("regra de outro dia da semana não se aplica", () => {
    assert.equal(peakViolation({
      rules: [rule({weekdays: [6, 7]})], courtId: "q1", dateKey: DATE_KEY, daySlots,
      selectionStartTimes: ["20:00"], slotDurationMinutes: 60, now: NOW,
    }), null);
  });

  it("duas regras sobrepostas: vale o maior mínimo", () => {
    const grade4 = [view("18:00", "19:00"), view("19:00", "20:00"), view("20:00", "21:00"), view("21:00", "22:00")];
    const v = peakViolation({
      rules: [rule(), rule({id: "r2", minDurationMinutes: 180})],
      courtId: "q1", dateKey: DATE_KEY, daySlots: grade4,
      selectionStartTimes: ["20:00", "21:00"], slotDurationMinutes: 60, now: NOW,
    });
    assert.deepEqual(v, {minDurationMinutes: 180});
  });

  it("slot de 30min: mínimo 120 = 4 slots", () => {
    const meia = [
      view("19:00", "19:30"), view("19:30", "20:00"),
      view("20:00", "20:30"), view("20:30", "21:00"),
      view("21:00", "21:30"), view("21:30", "22:00"),
    ];
    assert.notEqual(peakViolation({
      rules: [rule()], courtId: "q1", dateKey: DATE_KEY, daySlots: meia,
      selectionStartTimes: ["20:00", "20:30"], slotDurationMinutes: 30, now: NOW,
    }), null);
    assert.equal(peakViolation({
      rules: [rule()], courtId: "q1", dateKey: DATE_KEY, daySlots: meia,
      selectionStartTimes: ["19:00", "19:30", "20:00", "20:30"], slotDurationMinutes: 30, now: NOW,
    }), null);
  });
});

describe("resolveDayAvailability", () => {
  it("slot virtual coberto por persistido booked/blocked fica indisponível", () => {
    const out = resolveDayAvailability({
      virtual: [
        {startTime: "19:00", endTime: "20:00"},
        {startTime: "20:00", endTime: "21:00"},
        {startTime: "21:00", endTime: "22:00"},
      ],
      persisted: [{startTime: "19:00", endTime: "21:00", status: "booked"}],
      dateKey: DATE_KEY,
      now: NOW,
    });
    assert.deepEqual(out.map((s) => s.available), [false, false, true]);
  });

  it("slot que já passou fica indisponível para cadeia", () => {
    const out = resolveDayAvailability({
      virtual: [{startTime: "09:00", endTime: "10:00"}, {startTime: "11:00", endTime: "12:00"}],
      persisted: [],
      dateKey: DATE_KEY,
      now: NOW, // 10:00
    });
    assert.deepEqual(out.map((s) => s.available), [false, true]);
  });

  it("dia futuro inteiro fica disponível", () => {
    const out = resolveDayAvailability({
      virtual: [{startTime: "09:00", endTime: "10:00"}],
      persisted: [],
      dateKey: "2026-08-06",
      now: NOW,
    });
    assert.equal(out[0]!.available, true);
  });
});

describe("spNow", () => {
  it("converte UTC para wall-clock de São Paulo (UTC-3)", () => {
    // 2026-08-05T23:30Z = 20:30 em São Paulo (sem horário de verão).
    const n = spNow(new Date(Date.UTC(2026, 7, 5, 23, 30)));
    assert.equal(n.dateKey, "2026-08-05");
    assert.equal(n.minutes, 20 * 60 + 30);
  });

  it("vira o dia corretamente perto da meia-noite SP", () => {
    // 2026-08-06T02:59Z = 23:59 de 05/08 em SP.
    const n = spNow(new Date(Date.UTC(2026, 7, 6, 2, 59)));
    assert.equal(n.dateKey, "2026-08-05");
    assert.equal(n.minutes, 23 * 60 + 59);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd functions && npm test`
Expected: FAIL na compilação (`arena-peak-rules` inexistente).

- [ ] **Step 3: Implementar `functions/src/arena-peak-rules.ts`**

```ts
import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore, QueryDocumentSnapshot} from "firebase-admin/firestore";
import {buildVirtualSlotsForDay, type ArenaPromotionDoc} from "./arena-pricing";

/** Regra de pico em `arenas/{arenaId}/peakRules` — espelha
 *  `frontend/shared/arena-discovery/arena-peak-rule.ts`. */
export interface ArenaPeakRuleDoc {
  id: string;
  active: boolean;
  label: string;
  courtIds: string[];
  weekdays: number[];
  startTime: string;
  endTime: string;
  minDurationMinutes: number;
  releaseHoursBefore: number | null;
}

export interface PeakSlotView {
  startTime: string;
  endTime: string;
  available: boolean;
}

/** Wall-clock em America/Sao_Paulo, comparável por componentes. */
export interface SpNow {
  dateKey: string;
  minutes: number;
}

const DEFAULT_MIN_DURATION = 120;
const SP_TZ = "America/Sao_Paulo";

export function parsePeakRulesFromDocs(docs: QueryDocumentSnapshot[]): ArenaPeakRuleDoc[] {
  return docs.map((d) => parsePeakRule(d.id, d.data() as Record<string, unknown>));
}

function parsePeakRule(id: string, data: Record<string, unknown>): ArenaPeakRuleDoc {
  const courtIds: string[] = [];
  if (Array.isArray(data["courtIds"])) {
    for (const c of data["courtIds"]) {
      if (typeof c === "string" && c.trim()) courtIds.push(c.trim());
    }
  }
  const weekdays: number[] = [];
  if (Array.isArray(data["weekdays"])) {
    for (const w of data["weekdays"]) {
      if (typeof w === "number") weekdays.push(w);
    }
  }
  const minRaw = data["minDurationMinutes"];
  const releaseRaw = data["releaseHoursBefore"];
  return {
    id,
    active: data["active"] === true,
    label: typeof data["label"] === "string" ? data["label"].trim() : "Horário de pico",
    courtIds,
    weekdays,
    startTime: normalizeHm(data["startTime"] as string | undefined),
    endTime: normalizeHm(data["endTime"] as string | undefined),
    minDurationMinutes:
      typeof minRaw === "number" && minRaw >= 60 && minRaw <= 360 ? minRaw : DEFAULT_MIN_DURATION,
    releaseHoursBefore:
      typeof releaseRaw === "number" && releaseRaw > 0 ? releaseRaw : null,
  };
}

export function spNow(nowUtc: Date = new Date()): SpNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(nowUtc);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = parseInt(get("hour"), 10) % 24; // en-CA pode emitir "24" à meia-noite
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + parseInt(get("minute"), 10),
  };
}

/** Minutos (wall-clock) de `now` até o início do slot; negativo = já passou. */
function wallMinutesUntil(now: SpNow, dateKey: string, slotStartMinutes: number): number {
  const [ny, nm, nd] = now.dateKey.split("-").map((v) => parseInt(v, 10));
  const [sy, sm, sd] = dateKey.split("-").map((v) => parseInt(v, 10));
  // Datas por componentes, só para aritmética de dias — nunca Date.parse.
  const dayDiff = Math.round(
    (new Date(sy ?? 2020, (sm ?? 1) - 1, sd ?? 1).getTime() -
      new Date(ny ?? 2020, (nm ?? 1) - 1, nd ?? 1).getTime()) / 86400000,
  );
  return dayDiff * 1440 + (slotStartMinutes - now.minutes);
}

export function resolveDayAvailability(params: {
  virtual: {startTime: string; endTime: string}[];
  persisted: {startTime: string; endTime: string; status: string}[];
  dateKey: string;
  now: SpNow;
}): PeakSlotView[] {
  const busy = params.persisted.filter(
    (p) => p.status.trim().toLowerCase() !== "available",
  );
  return params.virtual.map((v) => {
    const start = toMinutes(v.startTime);
    const end = normalizeEnd(start, toMinutes(v.endTime));
    const overlapped = busy.some((p) => {
      const ps = toMinutes(p.startTime);
      const pe = normalizeEnd(ps, toMinutes(p.endTime));
      return ps < end && start < pe;
    });
    const past = wallMinutesUntil(params.now, params.dateKey, start) <= 0;
    return {startTime: v.startTime, endTime: v.endTime, available: !overlapped && !past};
  });
}

export function peakViolation(params: {
  rules: ArenaPeakRuleDoc[];
  courtId: string;
  dateKey: string;
  daySlots: PeakSlotView[];
  selectionStartTimes: string[];
  slotDurationMinutes: number;
  now: SpNow;
}): {minDurationMinutes: number} | null {
  const active = params.rules.filter((r) => r.active);
  if (active.length === 0 || params.selectionStartTimes.length === 0) return null;

  const parts = params.dateKey.split("-");
  const date = new Date(
    parseInt(parts[0] ?? "2020", 10),
    parseInt(parts[1] ?? "1", 10) - 1,
    parseInt(parts[2] ?? "1", 10),
  );

  let worst: {minDurationMinutes: number} | null = null;
  for (const startTime of params.selectionStartTimes) {
    const rule = restrictionForSlot({
      rules: active,
      courtId: params.courtId,
      date,
      dateKey: params.dateKey,
      slotStartTime: startTime,
      now: params.now,
    });
    if (!rule) continue;
    const minSlots = Math.max(
      1,
      Math.ceil(rule.minDurationMinutes / Math.max(1, params.slotDurationMinutes)),
    );
    if (params.selectionStartTimes.length >= minSlots) continue;
    if (!chainExistsContaining(params.daySlots, startTime, minSlots)) continue;
    if (worst == null || rule.minDurationMinutes > worst.minDurationMinutes) {
      worst = {minDurationMinutes: rule.minDurationMinutes};
    }
  }
  return worst;
}

function restrictionForSlot(params: {
  rules: ArenaPeakRuleDoc[];
  courtId: string;
  date: Date;
  dateKey: string;
  slotStartTime: string;
  now: SpNow;
}): ArenaPeakRuleDoc | null {
  let best: ArenaPeakRuleDoc | null = null;
  for (const rule of params.rules) {
    if (!ruleMatches(rule, params.courtId, params.date, params.slotStartTime)) continue;
    if (best == null || rule.minDurationMinutes > best.minDurationMinutes) best = rule;
  }
  if (best == null) return null;
  if (best.releaseHoursBefore != null) {
    const until = wallMinutesUntil(params.now, params.dateKey, toMinutes(params.slotStartTime));
    if (until <= best.releaseHoursBefore * 60) return null;
  }
  return best;
}

function ruleMatches(
  rule: ArenaPeakRuleDoc,
  courtId: string,
  date: Date,
  slotStart: string,
): boolean {
  if (rule.courtIds.length > 0 && !rule.courtIds.includes(courtId)) return false;
  const isoWeekday = date.getDay() === 0 ? 7 : date.getDay();
  if (rule.weekdays.length > 0 && !rule.weekdays.includes(isoWeekday)) return false;
  const slotMin = toMinutes(slotStart);
  const startMin = toMinutes(rule.startTime);
  const endMin = toMinutes(rule.endTime);
  if (endMin > startMin) {
    return slotMin >= startMin && slotMin < endMin;
  }
  return slotMin >= startMin || slotMin < endMin;
}

function chainExistsContaining(
  daySlots: PeakSlotView[],
  targetStart: string,
  minSlots: number,
): boolean {
  const idx = daySlots.findIndex((s) => s.startTime === targetStart);
  if (idx === -1) return false;
  for (let start = Math.max(0, idx - (minSlots - 1)); start <= idx; start++) {
    if (start + minSlots > daySlots.length) break;
    let ok = true;
    for (let i = start; i < start + minSlots; i++) {
      const s = daySlots[i]!;
      if (!s.available) { ok = false; break; }
      if (i > start && daySlots[i - 1]!.endTime !== s.startTime) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/** Enforcement completo: monta a grade do dia (virtual ∪ persistidos), roda o
 *  predicado e lança `failed-precondition` na violação. No-op sem regra ativa. */
export async function ensurePeakRuleSatisfied(params: {
  db: Firestore;
  arenaId: string;
  courtId: string;
  dateKey: string;
  peakRules: ArenaPeakRuleDoc[];
  courtData: Record<string, unknown> | undefined;
  arenaFallback: number | null;
  selectionStartTimes: string[];
}): Promise<void> {
  const active = params.peakRules.filter((r) => r.active);
  if (active.length === 0) return;

  const parts = params.dateKey.split("-");
  const date = new Date(
    parseInt(parts[0] ?? "2020", 10),
    parseInt(parts[1] ?? "1", 10) - 1,
    parseInt(parts[2] ?? "1", 10),
  );
  const virtual = buildVirtualSlotsForDay({
    arenaId: params.arenaId,
    courtId: params.courtId,
    date,
    courtData: params.courtData,
    arenaFallback: params.arenaFallback,
    promotions: [] as ArenaPromotionDoc[], // preço é irrelevante aqui
  }).map((s) => ({startTime: s.startTime, endTime: s.endTime}));

  // Mesma leitura tolerante do cliente: filtra por arenaId no servidor e
  // resolve dia/quadra em memória (docs antigos variam nos campos de data).
  const snap = await params.db
    .collection("arenaSlots")
    .where("arenaId", "==", params.arenaId)
    .get();
  const wantedCourt = params.courtId.trim().toLowerCase();
  const persisted: {startTime: string; endTime: string; status: string}[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const docCourt = String(data["courtId"] ?? data["court_id"] ?? "").trim().toLowerCase();
    if (docCourt !== wantedCourt) continue;
    if (slotDocDateKey(data) !== params.dateKey) continue;
    persisted.push({
      startTime: String(data["startTime"] ?? ""),
      endTime: String(data["endTime"] ?? ""),
      status: String(data["status"] ?? "available"),
    });
  }

  const now = spNow();
  const daySlots = resolveDayAvailability({virtual, persisted, dateKey: params.dateKey, now});
  const violation = peakViolation({
    rules: active,
    courtId: params.courtId,
    dateKey: params.dateKey,
    daySlots,
    selectionStartTimes: params.selectionStartTimes,
    slotDurationMinutes: readSlotDuration(params.courtData),
    now,
  });
  if (violation) {
    const hours = Math.round(violation.minDurationMinutes / 60);
    throw new HttpsError(
      "failed-precondition",
      `Este horário exige reserva mínima de ${hours}h. Inclua uma hora vizinha para confirmar.`,
    );
  }
}

/** dateKey `YYYY-MM-DD` do doc de arenaSlots, tolerante a campos/formatos legados. */
function slotDocDateKey(data: Record<string, unknown>): string | null {
  for (const key of ["dateKey", "date", "slotDate", "day"]) {
    const v = data[key];
    if (typeof v === "string") {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    }
    if (v && typeof v === "object" && "toDate" in (v as object)) {
      const d = (v as {toDate: () => Date}).toDate();
      const mm = `${d.getMonth() + 1}`.padStart(2, "0");
      const dd = `${d.getDate()}`.padStart(2, "0");
      return `${d.getFullYear()}-${mm}-${dd}`;
    }
  }
  return null;
}

function readSlotDuration(courtData: Record<string, unknown> | undefined): number {
  const v = courtData?.["slotDurationMinutes"];
  const n = typeof v === "number" ? v : 60;
  return n < 15 || n > 240 ? 60 : n;
}

function normalizeHm(raw?: string): string {
  const t = (raw ?? "00:00").trim();
  return t.length >= 5 ? t.substring(0, 5) : t;
}

function toMinutes(hhmm: string): number {
  const parts = hhmm.trim().split(":");
  const h = parseInt(parts[0] ?? "0", 10);
  const m = parts.length > 1 ? parseInt(parts[1] ?? "0", 10) : 0;
  return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
}

function normalizeEnd(startMin: number, endMin: number): number {
  return endMin === 0 && startMin > 0 ? 24 * 60 : endMin;
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `cd functions && npm test`
Expected: PASS (novos + suíte existente).

- [ ] **Step 5: Commit**

```bash
git add functions/src/arena-peak-rules.ts functions/src/arena-peak-rules.test.ts
git commit -m "feat(functions): predicado de horário de pico com liberação automática"
```

---

### Task 3: Functions — enforcement em `quoteArenaBooking` e `createArenaBooking`

**Files:**
- Modify: `functions/src/arena-booking-create.ts` (`loadPricingContext` ~linha 87; `quoteInternal` ~linha 130; `createArenaBooking` após `assertPositiveBookingTotal` ~linha 281)

**Interfaces:**
- Consumes: `parsePeakRulesFromDocs`, `ensurePeakRuleSatisfied`, `ArenaPeakRuleDoc` de `./arena-peak-rules` (Task 2).
- Produces: comportamento — `quoteArenaBooking`/`createArenaBooking` lançam `failed-precondition` com a mensagem canônica quando a seleção viola a regra. Nada muda sem regra ativa.

- [ ] **Step 1: Estender `loadPricingContext` com a 4ª leitura paralela**

Adicionar import no topo:

```ts
import {ensurePeakRuleSatisfied, parsePeakRulesFromDocs} from "./arena-peak-rules";
```

Em `loadPricingContext`, trocar o `Promise.all` de 3 para 4 leituras e devolver `peakRules`:

```ts
  const [arenaSnap, courtSnap, promoSnap, peakSnap] = await Promise.all([
    db.collection("arenas").doc(arenaId).get(),
    db.collection("arenas").doc(arenaId).collection("courts").doc(courtId).get(),
    db
      .collection("arenas")
      .doc(arenaId)
      .collection("promotions")
      .where("active", "==", true)
      .get(),
    db
      .collection("arenas")
      .doc(arenaId)
      .collection("peakRules")
      .where("active", "==", true)
      .get(),
  ]);
```

e no objeto retornado:

```ts
    promotions: parsePromotionsFromDocs(promoSnap.docs),
    peakRules: parsePeakRulesFromDocs(peakSnap.docs),
```

- [ ] **Step 2: Validar em `quoteInternal`**

Logo após o `calculateBookingTotal` (antes do `resolveCouponForBooking`):

```ts
  await ensurePeakRuleSatisfied({
    db: getFirestore(),
    arenaId,
    courtId,
    dateKey,
    peakRules: ctx.peakRules,
    courtData: ctx.courtData,
    arenaFallback: ctx.arenaFallback,
    selectionStartTimes: promoTotal.lineItems.map((l) => l.startTime),
  });
```

Nota: `promoTotal.lineItems` já é a seleção resolvida pelo servidor — cobre tanto `selectedSlotStartTimes` quanto o fallback por intervalo, sem duplicar lógica.

- [ ] **Step 3: Validar em `createArenaBooking`**

Logo após `assertPositiveBookingTotal(total);` (~linha 281):

```ts
  await ensurePeakRuleSatisfied({
    db,
    arenaId,
    courtId,
    dateKey,
    peakRules: ctx.peakRules,
    courtData: ctx.courtData,
    arenaFallback: ctx.arenaFallback,
    selectionStartTimes: total.lineItems.map((l) => l.startTime),
  });
```

- [ ] **Step 4: Build + suíte completa**

Run: `cd functions && npm test`
Expected: PASS — compilação limpa e nenhum teste existente quebrado (sem regra cadastrada o caminho é no-op).

- [ ] **Step 5: Commit**

```bash
git add functions/src/arena-booking-create.ts
git commit -m "feat(functions): exigir mínimo de horas no pico em quote/createArenaBooking"
```

---

### Task 4: Firestore rules — `arenas/{arenaId}/peakRules`

**Files:**
- Modify: `firestore.rules` (inserir após o bloco `promotions`, que termina na linha ~855)

**Interfaces:**
- Consumes: helpers existentes `arenaCanWrite`, `arenaEntitled`, `isSuperAdmin`.
- Produces: leitura pública de `peakRules` (grade do atleta) e escrita restrita à área `promocoes` + titularidade Pro/Elite — espelho exato do gate de promoções.

- [ ] **Step 1: Adicionar o bloco após `match /arenas/{arenaId}/promotions/{promoId} { ... }`**

```
    match /arenas/{arenaId}/peakRules/{ruleId} {
      // Regra comercial de horário de pico (reserva mínima). Leitura pública:
      // a grade do atleta precisa renderizar a restrição. Mesmo gate de
      // plano/área das promoções; excluir segue liberado para limpeza.
      allow read: if true;
      allow create, update: if request.auth != null && (
        arenaCanWrite(arenaId, 'promocoes') ||
        isSuperAdmin()
      ) && (isSuperAdmin() || arenaEntitled(arenaId, ['pro', 'parceiro', 'elite']));
      allow delete: if request.auth != null && (
        arenaCanWrite(arenaId, 'promocoes') ||
        isSuperAdmin()
      );
    }
```

- [ ] **Step 2: Validar sintaxe**

Run: `npx firebase-tools@latest deploy --only firestore:rules --dry-run 2>&1 | tail -5` (na raiz do worktree; usar `npx firebase-tools@latest`, o CLI global 14.x tem incompatibilidades conhecidas no projeto). Se o dry-run não estiver disponível na versão, validar com `npx firebase-tools@latest firestore:rules:check` ou, em último caso, revisar visualmente o bloco (é espelho 1:1 do bloco `promotions` acima dele).
Expected: sem erro de sintaxe. NÃO fazer deploy real — deploy é etapa de rollout do dono (dev primeiro).

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): coleção peakRules com gate Pro+ na escrita"
```

---

### Task 5: Painel da arena — capability `horariosPico` + repository

**Files:**
- Modify: `frontend/projects/arena/src/app/painel/data/arena-plan.model.ts` (union `ArenaCapability` linha ~10; sets `arenaCapabilitiesFor` linhas ~78-97)
- Create: `frontend/projects/arena/src/app/painel/peak-rules/peak-rules-repository.ts`
- Create: `frontend/projects/arena/src/app/painel/peak-rules/peak-rule.model.ts`

**Interfaces:**
- Consumes: `ArenaPeakRule`, `arenaPeakRuleFromFirestore` de `@nexago/arena-discovery` (Task 1).
- Produces (usado na Task 6):
  - Capability `'horariosPico'` no union `ArenaCapability` e nos sets de `pro` e `elite`.
  - `interface PeakRuleInput { label: string; active: boolean; courtIds: string[]; weekdays: number[]; startTime: string; endTime: string; minDurationMinutes: number; releaseHoursBefore: number | null; }`
  - `fetchAllPeakRules(db: Firestore, arenaId: string): Promise<ArenaPeakRule[]>`
  - `fetchPeakRule(db: Firestore, arenaId: string, ruleId: string): Promise<ArenaPeakRule | null>`
  - `createPeakRule(db: Firestore, arenaId: string, input: PeakRuleInput): Promise<string>`
  - `updatePeakRule(db: Firestore, arenaId: string, ruleId: string, input: PeakRuleInput): Promise<void>`
  - `setPeakRuleActive(db: Firestore, arenaId: string, ruleId: string, active: boolean): Promise<void>`
  - `deletePeakRule(db: Firestore, arenaId: string, ruleId: string): Promise<void>`
  - `formatMinDuration(minutes: number): string` (`120 → "2h"`), `formatRelease(hours: number | null): string` (`null → "Não libera"`, `3 → "3h antes"`).

- [ ] **Step 1: Capability**

Em `arena-plan.model.ts`: adicionar `| 'horariosPico'` ao union `ArenaCapability` e a string `'horariosPico'` aos dois `new Set<ArenaCapability>([...])` de `elite` e `pro` (NÃO ao default). Comentário de 1 linha no union: `// horariosPico: regras de reserva mínima em horário de pico (peakRules)`.

- [ ] **Step 2: `peak-rule.model.ts`**

```ts
import type { ArenaPeakRule } from '@nexago/arena-discovery';

/** Helpers de exibição da tela Horários de pico. Weekdays reutilizam
 *  `formatWeekdays` de `../promotions/promotion.model`. */

export function formatMinDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

export function formatRelease(hours: number | null): string {
  return hours == null ? 'Não libera' : `${hours}h antes`;
}

export function peakRuleScopeLabel(rule: ArenaPeakRule): string {
  if (rule.courtIds.length === 0) return 'Todas as quadras';
  return `${rule.courtIds.length} quadra${rule.courtIds.length === 1 ? '' : 's'}`;
}
```

- [ ] **Step 3: `peak-rules-repository.ts`** (espelho de `promotions-repository.ts`)

```ts
import { arenaPeakRuleFromFirestore, type ArenaPeakRule } from '@nexago/arena-discovery';
import {
  addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs,
  serverTimestamp, updateDoc, type Firestore,
} from 'firebase/firestore';

/** CRUD de `arenas/{arenaId}/peakRules/{ruleId}` — regra de reserva mínima em
 *  horário de pico. Criar/editar exige plano Pro/Elite
 *  (`ArenaContextService.hasCapability('horariosPico')` + rules); excluir é livre. */

export interface PeakRuleInput {
  label: string;
  active: boolean;
  /** Vazio = todas as quadras. */
  courtIds: string[];
  /** ISO 1-7 (seg-dom). Vazio = todos os dias. */
  weekdays: number[];
  startTime: string;
  endTime: string;
  minDurationMinutes: number;
  /** null = nunca libera por antecedência. */
  releaseHoursBefore: number | null;
}

export function validatePeakRuleInput(input: PeakRuleInput): string | null {
  if (!input.label.trim()) return 'Informe o nome da regra.';
  if (!input.startTime || !input.endTime) return 'Informe o horário de início e fim.';
  if (input.minDurationMinutes < 60 || input.minDurationMinutes > 360) {
    return 'O mínimo deve ser entre 1h e 6h.';
  }
  if (
    input.releaseHoursBefore != null &&
    (input.releaseHoursBefore < 1 || input.releaseHoursBefore > 48)
  ) {
    return 'A liberação antecipada deve ser entre 1 e 48 horas.';
  }
  return null;
}

function basePayload(input: PeakRuleInput): Record<string, unknown> {
  return {
    active: input.active,
    label: input.label.trim(),
    courtIds: input.courtIds,
    weekdays: input.weekdays,
    startTime: input.startTime,
    endTime: input.endTime,
    minDurationMinutes: input.minDurationMinutes,
  };
}

export async function fetchAllPeakRules(db: Firestore, arenaId: string): Promise<ArenaPeakRule[]> {
  const snap = await getDocs(collection(db, 'arenas', arenaId, 'peakRules'));
  const list = snap.docs.map((d) => arenaPeakRuleFromFirestore(d));
  list.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' });
  });
  return list;
}

export async function fetchPeakRule(
  db: Firestore, arenaId: string, ruleId: string,
): Promise<ArenaPeakRule | null> {
  const snap = await getDoc(doc(db, 'arenas', arenaId, 'peakRules', ruleId));
  return snap.exists() ? arenaPeakRuleFromFirestore(snap) : null;
}

export async function createPeakRule(
  db: Firestore, arenaId: string, input: PeakRuleInput,
): Promise<string> {
  const error = validatePeakRuleInput(input);
  if (error) throw new Error(error);
  const payload: Record<string, unknown> = {
    ...basePayload(input),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.releaseHoursBefore != null) payload['releaseHoursBefore'] = input.releaseHoursBefore;
  const ref = await addDoc(collection(db, 'arenas', arenaId, 'peakRules'), payload);
  return ref.id;
}

export async function updatePeakRule(
  db: Firestore, arenaId: string, ruleId: string, input: PeakRuleInput,
): Promise<void> {
  const error = validatePeakRuleInput(input);
  if (error) throw new Error(error);
  await updateDoc(doc(db, 'arenas', arenaId, 'peakRules', ruleId), {
    ...basePayload(input),
    updatedAt: serverTimestamp(),
    releaseHoursBefore:
      input.releaseHoursBefore != null ? input.releaseHoursBefore : deleteField(),
  });
}

export async function setPeakRuleActive(
  db: Firestore, arenaId: string, ruleId: string, active: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'arenas', arenaId, 'peakRules', ruleId), {
    active,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePeakRule(db: Firestore, arenaId: string, ruleId: string): Promise<void> {
  await deleteDoc(doc(db, 'arenas', arenaId, 'peakRules', ruleId));
}
```

- [ ] **Step 4: Build do painel arena**

Run: `cd frontend && npx ng build arena`
Expected: build limpo (os arquivos novos ainda não têm consumidores; o build valida tipos).

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/arena/src/app/painel/data/arena-plan.model.ts frontend/projects/arena/src/app/painel/peak-rules/
git commit -m "feat(arena-web): capability horariosPico e repositório de peakRules"
```

---

### Task 6: Painel da arena — telas lista + form, rotas e sidebar

**Files:**
- Create: `frontend/projects/arena/src/app/painel/peak-rules/panel-peak-rules.component.ts`
- Create: `frontend/projects/arena/src/app/painel/peak-rules/panel-peak-rule-form.component.ts`
- Modify: `frontend/projects/arena/src/app/app.routes.ts` (após as rotas `painel/promocoes*`, linhas ~176-199)
- Modify: `frontend/projects/arena/src/app/painel/ui/panel-shell.component.ts` (item de nav após `promocoes`/`cupons`, linha ~32)

**Interfaces:**
- Consumes: repositório e helpers da Task 5; `ArenaContextService` (`arenaId()`, `arenaName()`, `loading()`, `notFound()`, `hasCapability('horariosPico')`); `arenaFirestore()` de `../data/firestore`; componentes de UI `PanelShellComponent`, `PageHeaderComponent`, `PanelCardComponent`, `PillComponent`, `IconComponent`; `formatWeekdays` de `../promotions/promotion.model`; `fetchCourts` de `@nexago/arena-discovery`.
- Produces: rotas `/painel/horarios-pico`, `/painel/horarios-pico/nova`, `/painel/horarios-pico/:id/editar` protegidas por `arenaAreaGuard('promocoes')`; item "Horários de pico" na sidebar (área `promocoes`).

- [ ] **Step 1: Componente de lista `panel-peak-rules.component.ts`**

Seguir 1:1 a estrutura de `panel-promotions.component.ts` (mesmo shell, estados de loading/paywall/readonly, tabela). Diferenças:

```ts
import type { ArenaPeakRule } from '@nexago/arena-discovery';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { formatWeekdays } from '../promotions/promotion.model';
import { formatMinDuration, formatRelease, peakRuleScopeLabel } from './peak-rule.model';
import { fetchAllPeakRules, setPeakRuleActive } from './peak-rules-repository';

/** Tela Horários de pico: CRUD de `arenas/{arenaId}/peakRules` (Pro/Elite pra
 *  criar/editar via capability `horariosPico`; excluir é livre). A regra impõe
 *  reserva mínima na faixa, com liberação automática — enforcement fica no
 *  servidor (`ensurePeakRuleSatisfied`), aqui é só configuração. */
@Component({
  selector: 'ar-panel-peak-rules',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent],
  template: `...`, // ver esqueleto abaixo
})
export class PanelPeakRulesComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly router = inject(Router);

  protected readonly formatWeekdays = formatWeekdays;
  protected readonly formatMinDuration = formatMinDuration;
  protected readonly formatRelease = formatRelease;
  protected readonly peakRuleScopeLabel = peakRuleScopeLabel;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly readOnly = computed(() => !this.arenaContext.hasCapability('horariosPico'));

  protected readonly rules = signal<ArenaPeakRule[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly activeCount = computed(() => this.rules().filter((r) => r.active).length);
  protected readonly showPaywall = computed(() => this.readOnly() && this.rules().length === 0);
  protected readonly headerSubtitle = computed(
    () => `${this.arenaContext.arenaName() ?? 'Arena'} · reserva mínima nos horários concorridos`,
  );

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.rules.set(await fetchAllPeakRules(arenaFirestore(), arenaId));
    } catch {
      this.loadError.set('Não foi possível carregar as regras.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async toggleActive(rule: ArenaPeakRule): Promise<void> {
    if (this.readOnly() && !rule.active) return; // reativar exige plano
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;
    await setPeakRuleActive(arenaFirestore(), arenaId, rule.id, !rule.active);
    await this.load(arenaId);
  }

  protected createRule(): void {
    if (this.readOnly()) return;
    this.router.navigate(['/painel/horarios-pico/nova']);
  }

  protected editRule(id: string): void {
    this.router.navigate(['/painel/horarios-pico', id, 'editar']);
  }
}
```

Template: copiar a estrutura do template de `PanelPromotionsComponent` trocando: título "Horários de pico"; paywall-title `Horários de pico são um recurso dos planos Pro e Elite`; colunas da tabela `Regra | Faixa | Dias | Mínimo | Liberação | Status | (ações)`; célula Faixa `{{ rule.startTime }}-{{ rule.endTime }}`; Mínimo `{{ formatMinDuration(rule.minDurationMinutes) }}`; Liberação `{{ formatRelease(rule.releaseHoursBefore) }}`; Status `<ar-pill [tone]="rule.active ? 'green' : 'dim'">{{ rule.active ? 'Ativa' : 'Pausada' }}</ar-pill>`; ações Editar + botão Pausar/Ativar chamando `toggleActive(rule)`. Reusar os mesmos blocos `styles` (`.body`, `.state-text`, `.paywall-title`, `.readonly-banner`, `.summary-*`, `.table-*`) ajustando o `grid-template-columns` para `1.6fr 100px 170px 90px 110px 100px 140px`. Sem filtro por status (só 2 estados — YAGNI).

- [ ] **Step 2: Componente de form `panel-peak-rule-form.component.ts`**

Form standalone com signals e inputs nativos (sem lib de forms — tela pequena):

```ts
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { fetchCourts, type ArenaCourtDoc } from '@nexago/arena-discovery';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import {
  createPeakRule, fetchPeakRule, updatePeakRule, deletePeakRule,
  validatePeakRuleInput, type PeakRuleInput,
} from './peak-rules-repository';

const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' }, { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' }, { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

const MIN_DURATION_OPTIONS = [
  { value: 120, label: '2 horas' },
  { value: 180, label: '3 horas' },
];

@Component({
  selector: 'ar-panel-peak-rule-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent],
  template: `...`, // ver descrição abaixo
})
export class PanelPeakRuleFormComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly weekdayOptions = WEEKDAY_OPTIONS;
  protected readonly minDurationOptions = MIN_DURATION_OPTIONS;

  protected readonly ruleId = computed(() => this.route.snapshot.paramMap.get('id'));
  protected readonly isEdit = computed(() => this.ruleId() != null);

  protected readonly label = signal('');
  protected readonly active = signal(true);
  protected readonly courtIds = signal<string[]>([]);
  protected readonly weekdays = signal<number[]>([]);
  protected readonly startTime = signal('20:00');
  protected readonly endTime = signal('21:00');
  protected readonly minDurationMinutes = signal(120);
  protected readonly releaseEnabled = signal(false);
  protected readonly releaseHoursBefore = signal(3);

  protected readonly courts = signal<ArenaCourtDoc[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(true);

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    try {
      this.courts.set(await fetchCourts(arenaFirestore(), arenaId));
      const id = this.ruleId();
      if (id) {
        const rule = await fetchPeakRule(arenaFirestore(), arenaId, id);
        if (rule) {
          this.label.set(rule.label);
          this.active.set(rule.active);
          this.courtIds.set(rule.courtIds);
          this.weekdays.set(rule.weekdays);
          this.startTime.set(rule.startTime);
          this.endTime.set(rule.endTime);
          this.minDurationMinutes.set(rule.minDurationMinutes);
          this.releaseEnabled.set(rule.releaseHoursBefore != null);
          this.releaseHoursBefore.set(rule.releaseHoursBefore ?? 3);
        }
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleCourt(id: string): void {
    this.courtIds.update((ids) =>
      ids.includes(id) ? ids.filter((c) => c !== id) : [...ids, id]);
  }

  protected toggleWeekday(value: number): void {
    this.weekdays.update((ds) =>
      ds.includes(value) ? ds.filter((d) => d !== value) : [...ds, value]);
  }

  private buildInput(): PeakRuleInput {
    return {
      label: this.label(),
      active: this.active(),
      courtIds: this.courtIds(),
      weekdays: this.weekdays(),
      startTime: this.startTime(),
      endTime: this.endTime(),
      minDurationMinutes: this.minDurationMinutes(),
      releaseHoursBefore: this.releaseEnabled() ? this.releaseHoursBefore() : null,
    };
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.saving()) return;
    const input = this.buildInput();
    const validationError = validatePeakRuleInput(input);
    if (validationError) {
      this.error.set(validationError);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const id = this.ruleId();
      if (id) {
        await updatePeakRule(arenaFirestore(), arenaId, id, input);
      } else {
        await createPeakRule(arenaFirestore(), arenaId, input);
      }
      this.router.navigate(['/painel/horarios-pico']);
    } catch {
      this.error.set('Não foi possível salvar a regra. Verifique seu plano e tente novamente.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const id = this.ruleId();
    if (!arenaId || !id || this.saving()) return;
    this.saving.set(true);
    try {
      await deletePeakRule(arenaFirestore(), arenaId, id);
      this.router.navigate(['/painel/horarios-pico']);
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.router.navigate(['/painel/horarios-pico']);
  }
}
```

Template (dentro de `ar-panel-shell` + `ar-page-header` título `{{ isEdit() ? 'Editar regra' : 'Nova regra de pico' }}`): um `ar-panel-card` com campos empilhados —
- Nome: `<input type="text" [value]="label()" (input)="label.set($any($event.target).value)" placeholder="Ex.: Pico noturno">`
- Faixa: dois `<input type="time">` para `startTime`/`endTime` (mesmo padrão de binding).
- Dias: chips `@for (d of weekdayOptions; track d.value)` com `[class.active]="weekdays().includes(d.value)"` e `(click)="toggleWeekday(d.value)"`; legenda "Nenhum selecionado = todos os dias".
- Quadras: chips a partir de `courts()` com `toggleCourt(c.id)`; legenda "Nenhuma selecionada = todas as quadras".
- Mínimo: `<select>` com `minDurationOptions`.
- Liberação: checkbox `releaseEnabled` + `<input type="number" min="1" max="48">` para `releaseHoursBefore`, sufixo "horas antes do horário"; hint "Perto do horário, a exigência cai e o slot volta à venda avulsa".
- Ativa: checkbox `active`.
- Erro: `@if (error(); as err) { <p class="form-error">{{ err }}</p> }`.
- Ações: botão primário Salvar (`[disabled]="saving()"`), Cancelar, e (só em edição) Excluir.
Estilos: reutilizar classes `ar-mini-btn`/`ar-chip` e um bloco `styles` enxuto com `.field { display:flex; flex-direction:column; gap:6px; }` etc. Antes de escrever, abrir `panel-promotion-form.component.ts` e copiar os padrões de markup/estilo de campos de lá (é a referência visual canônica desta tela).

- [ ] **Step 3: Rotas em `app.routes.ts`** (após o bloco de rotas `painel/promocoes/:id/editar`)

```ts
  {
    path: 'painel/horarios-pico',
    loadComponent: () =>
      import('./painel/peak-rules/panel-peak-rules.component').then((m) => m.PanelPeakRulesComponent),
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('promocoes')],
  },
  {
    path: 'painel/horarios-pico/nova',
    loadComponent: () =>
      import('./painel/peak-rules/panel-peak-rule-form.component').then((m) => m.PanelPeakRuleFormComponent),
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('promocoes')],
  },
  {
    path: 'painel/horarios-pico/:id/editar',
    loadComponent: () =>
      import('./painel/peak-rules/panel-peak-rule-form.component').then((m) => m.PanelPeakRuleFormComponent),
    canActivate: [authGuard, arenaSelectionGuard, arenaAreaGuard('promocoes')],
  },
```

(Conferir os nomes exatos dos guards nas rotas `painel/promocoes` vizinhas e replicar.)

- [ ] **Step 4: Sidebar em `panel-shell.component.ts`** (linha ~32, após `cupons`)

```ts
  { id: 'horarios-pico', label: 'Horários de pico', icon: 'tag', route: '/painel/horarios-pico', badge: null, area: 'promocoes' },
```

- [ ] **Step 5: Build**

Run: `cd frontend && npx ng build arena`
Expected: build limpo.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/arena/src/app/painel/peak-rules/ frontend/projects/arena/src/app/app.routes.ts frontend/projects/arena/src/app/painel/ui/panel-shell.component.ts
git commit -m "feat(arena-web): telas de Horários de pico com gate Pro+"
```

---

### Task 7: Portal do atleta — grade com badge, durações desabilitadas e auto-bump

**Files:**
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.ts`
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.html` (chips de slot ~linha 113-135; bloco duração ~linha 142-159)
- Modify: `frontend/projects/athlete/src/app/reservar/arena-booking.component.scss`

**Interfaces:**
- Consumes (Task 1): `fetchActivePeakRules`, `peakCheckForSelection`, `peakBadgeMinSlots`, `type ArenaPeakRule`, `type PeakSelectionCheck`.
- Produces: `SlotView` ganha `peakMinLabel: string | null`; computed `peakHint(): string | null`; `durationOptions`/`canContinue` respeitam o mínimo; `selectStartSlot` faz auto-bump da duração.

- [ ] **Step 1: Component — imports, estado e computeds**

Adicionar aos imports de `@nexago/arena-discovery`: `fetchActivePeakRules, peakBadgeMinSlots, peakCheckForSelection, type ArenaPeakRule, type PeakSelectionCheck`.

Adicionar campo `peakMinLabel: string | null;` à interface `SlotView`.

No corpo da classe:

```ts
  protected readonly peakRules = signal<ArenaPeakRule[]>([]);

  private peakCheckFor(selection: ArenaSlot[]): PeakSelectionCheck {
    return peakCheckForSelection({
      rules: this.peakRules(),
      courtId: this.selectedCourtId() ?? '',
      date: this.selectedDate(),
      courtDaySlots: this.selectedCourtSlots(),
      selection,
      slotDurationMinutes: this.baseSlotMinutes(),
    });
  }

  /** Dica exibida sob o seletor de duração quando o slot inicial é de pico restrito. */
  protected readonly peakHint = computed<string | null>(() => {
    const start = this.selectedStartSlot();
    if (!start) return null;
    const check = this.peakCheckFor([start]);
    if (check.minSlots <= 1) return null;
    return `Horário concorrido: reserva mínima de ${formatDurationLabel(check.minSlots * this.baseSlotMinutes())}.`;
  });
```

Substituir `durationOptions`:

```ts
  protected readonly durationOptions = computed<DurationOption[]>(() => {
    const base = this.baseSlotMinutes();
    return DURATION_MULTIPLIERS.map((n) => {
      const chain = this.chainForDuration(n);
      const enabled = chain != null && this.peakCheckFor(chain).minSlots <= n;
      return { slots: n, minutes: base * n, label: formatDurationLabel(base * n), enabled };
    });
  });
```

Substituir `canContinue`:

```ts
  protected readonly canContinue = computed(() => {
    const chain = this.selectedChain();
    if (!chain) return false;
    return this.peakCheckFor(chain).minSlots <= chain.length;
  });
```

Em `slotGroups`, dentro do loop `for (const s of slots)`, calcular o badge (antes de montar `view`):

```ts
      const isSelectable = arenaSlotIsAvailable(s) && !isPastSlot(date, s.startTime);
      const badgeSlots = isSelectable
        ? peakBadgeMinSlots({
            rules: this.peakRules(),
            courtId: this.selectedCourtId() ?? '',
            date,
            courtDaySlots: slots,
            slot: s,
            slotDurationMinutes: this.baseSlotMinutes(),
          })
        : 1;
```

e no objeto `view`: `peakMinLabel: badgeSlots > 1 ? \`mín. ${formatDurationLabel(badgeSlots * this.baseSlotMinutes())}\` : null,`.

Substituir `selectStartSlot` (auto-bump para o mínimo):

```ts
  protected selectStartSlot(view: SlotView): void {
    if (!view.isAvailable || view.isPast) return;
    this.selectedStartSlot.set(view.slot);
    const minSlots = this.peakCheckFor([view.slot]).minSlots;
    if (minSlots > this.durationSlots() && this.chainForDuration(minSlots) != null) {
      this.durationSlots.set(minSlots);
    }
  }
```

Em `load()`, após `this.courts.set(courts);`:

```ts
      this.peakRules.set(await fetchActivePeakRules(this.firestore!, id));
```

- [ ] **Step 2: Template**

No chip do slot, adicionar o badge no ramo disponível (após o `@if (view.isLast)`, linha ~132):

```html
                          @if (view.peakMinLabel) {
                            <span class="bk-slot-tag bk-slot-tag--peak">{{ view.peakMinLabel }}</span>
                          }
```

Após o `</div>` do `.bk-duration-row` (linha ~157), dentro do `.bk-duration-block`:

```html
                @if (peakHint(); as hint) {
                  <p class="bk-peak-hint">{{ hint }}</p>
                }
```

- [ ] **Step 3: SCSS** — em `arena-booking.component.scss`, junto das regras `.bk-slot-tag--*` existentes (copiar a estrutura visual de `.bk-slot-tag--last`, mudando a cor para o laranja da paleta do portal):

```scss
.bk-slot-tag--peak {
  background: rgba(234, 88, 12, 0.12);
  color: #ea580c;
}

.bk-peak-hint {
  margin: 8px 0 0;
  font-size: 12.5px;
  color: inherit;
  opacity: 0.75;
}
```

(Se o arquivo usa variáveis CSS `--at-*`/tokens para as tags vizinhas, usar as mesmas em vez dos valores fixos.)

- [ ] **Step 4: Testes + build**

Run: `cd frontend && npx ng test athlete --watch=false && npx ng build athlete`
Expected: PASS + build limpo.

- [ ] **Step 5: Commit**

```bash
git add frontend/projects/athlete/src/app/reservar/
git commit -m "feat(athlete-web): grade respeita reserva mínima em horário de pico"
```

---

### Task 8: Flutter — modelo, repositório, provider e lógica pura + testes

**Files:**
- Create: `nexago_app/lib/features/arenas/domain/arena_peak_rule.dart`
- Create: `nexago_app/lib/features/arenas/data/peak_rules_repository.dart`
- Modify: `nexago_app/lib/features/arenas/domain/slots_providers.dart`
- Modify: `nexago_app/lib/features/arenas/domain/slots_page_logic.dart` (append no fim)
- Test: `nexago_app/test/features/arenas/domain/arena_peak_rule_test.dart`
- Test: `nexago_app/test/features/arenas/domain/slots_page_logic_peak_test.dart`

**Interfaces:**
- Consumes: `ArenaSlot` (com `startTime`, `endTime`, `isAvailable`, `isSelectable`), `isPastBookableSlot`, `slotStartMinutes` já existentes em `slots_page_logic.dart`.
- Produces (usado na Task 9):
  - `class ArenaPeakRule { final String id; final bool active; final String label; final List<String> courtIds; final List<int> weekdays; final String startTime; final String endTime; final int minDurationMinutes; final int? releaseHoursBefore; bool matches({required String courtId, required DateTime date, required String slotStartTime}); }`
  - `PeakRulesRepository.watchActivePeakRules(String arenaId) → Stream<List<ArenaPeakRule>>`
  - Provider `arenaPeakRulesProvider` (`StreamProvider.autoDispose.family<List<ArenaPeakRule>, String>`)
  - `class PeakSelectionCheck { final int minSlots; final ArenaPeakRule? rule; }`
  - `PeakSelectionCheck peakCheckForRange({required List<ArenaPeakRule> rules, required String courtId, required List<ArenaSlot> slots, required DateTime selectedDay, required int start, required int end, required int slotDurationMinutes, DateTime? now})`
  - `int peakBadgeMinSlots({required List<ArenaPeakRule> rules, required String courtId, required List<ArenaSlot> slots, required DateTime selectedDay, required int index, required int slotDurationMinutes, DateTime? now})`

- [ ] **Step 1: Escrever os testes que falham**

Antes de escrever, abrir um teste existente em `nexago_app/test/features/arenas/domain/` que construa `ArenaSlot` (ex.: `arena_detail_logic_test.dart` ou os de `domain/`) e copiar o factory/construtor real do slot — o helper `slot()` abaixo é o contrato do teste e deve ser ajustado à assinatura verdadeira de `ArenaSlot` (`lib/features/arenas/domain/arena_slot.dart`). Casos obrigatórios (mesmo catálogo das Tasks 1-2):

`arena_peak_rule_test.dart` — `matches`: faixa (dentro/fora), overnight 22:00–01:00, filtro de quadra, weekday ISO (DateTime.weekday já é ISO), regra inativa.

`slots_page_logic_peak_test.dart` — `peakCheckForRange`/`peakBadgeMinSlots`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_peak_rule.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/slots_page_logic.dart';

// Quarta 05/08/2026; "agora" às 10:00 do mesmo dia.
final qua = DateTime(2026, 8, 5);
final nowCedo = DateTime(2026, 8, 5, 10, 0);

ArenaPeakRule rule({
  int minDurationMinutes = 120,
  int? releaseHoursBefore,
  List<int> weekdays = const [],
  List<String> courtIds = const [],
}) {
  return ArenaPeakRule(
    id: 'r1', active: true, label: 'Pico noturno',
    courtIds: courtIds, weekdays: weekdays,
    startTime: '20:00', endTime: '21:00',
    minDurationMinutes: minDurationMinutes,
    releaseHoursBefore: releaseHoursBefore,
  );
}

// AJUSTAR ao construtor real de ArenaSlot (ver arena_slot.dart e os factories
// dos testes vizinhos): precisa de date=qua, startTime/endTime e status.
ArenaSlot slot(String start, String end, {String status = 'available'}) {
  /* copiar factory dos testes existentes */
  throw UnimplementedError('alinhar com arena_slot.dart');
}

void main() {
  final grade = [slot('19:00', '20:00'), slot('20:00', '21:00'), slot('21:00', '22:00')];

  test('sem regra: minSlots 1', () {
    final r = peakCheckForRange(
      rules: const [], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(r.minSlots, 1);
  });

  test('20h avulsa com vizinhas livres exige 2 slots', () {
    final r = peakCheckForRange(
      rules: [rule()], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(r.minSlots, 2);
  });

  test('seleção 19h-21h cumpre o mínimo (sem exigência pendente)', () {
    final r = peakCheckForRange(
      rules: [rule()], courtId: 'q1', slots: grade, selectedDay: qua,
      start: 0, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(r.minSlots, 1); // seleção já cumpre o mínimo → nada pendente
  });

  test('vizinhas ocupadas liberam o avulso', () {
    final cercado = [
      slot('19:00', '20:00', status: 'booked'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', status: 'blocked'),
    ];
    final r = peakCheckForRange(
      rules: [rule()], courtId: 'q1', slots: cercado, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: nowCedo,
    );
    expect(r.minSlots, 1);
  });

  test('janela de liberação 3h antes', () {
    final dentro = DateTime(2026, 8, 5, 17, 30);
    final fora = DateTime(2026, 8, 5, 16, 59);
    final liberado = peakCheckForRange(
      rules: [rule(releaseHoursBefore: 3)], courtId: 'q1', slots: grade,
      selectedDay: qua, start: 1, end: 1, slotDurationMinutes: 60, now: dentro,
    );
    final bloqueado = peakCheckForRange(
      rules: [rule(releaseHoursBefore: 3)], courtId: 'q1', slots: grade,
      selectedDay: qua, start: 1, end: 1, slotDurationMinutes: 60, now: fora,
    );
    expect(liberado.minSlots, 1);
    expect(bloqueado.minSlots, 2);
  });

  test('vizinha no passado não sustenta cadeia', () {
    final tarde = DateTime(2026, 8, 5, 19, 30);
    final soFrente = [
      slot('19:00', '20:00'),
      slot('20:00', '21:00'),
      slot('21:00', '22:00', status: 'booked'),
    ];
    final r = peakCheckForRange(
      rules: [rule()], courtId: 'q1', slots: soFrente, selectedDay: qua,
      start: 1, end: 1, slotDurationMinutes: 60, now: tarde,
    );
    expect(r.minSlots, 1);
  });

  test('badge devolve mínimo para o chip', () {
    expect(
      peakBadgeMinSlots(
        rules: [rule()], courtId: 'q1', slots: grade, selectedDay: qua,
        index: 1, slotDurationMinutes: 60, now: nowCedo,
      ),
      2,
    );
  });
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd nexago_app && flutter test test/features/arenas/domain/arena_peak_rule_test.dart test/features/arenas/domain/slots_page_logic_peak_test.dart`
Expected: FAIL (arquivos de produção inexistentes).

- [ ] **Step 3: Implementar `arena_peak_rule.dart`** (espelho de `arena_promotion.dart`, sem campos de desconto)

```dart
import 'package:cloud_firestore/cloud_firestore.dart';

/// Regra de horário de pico em `arenas/{arenaId}/peakRules/{ruleId}` —
/// reserva mínima na faixa, com liberação opcional por antecedência.
/// Espelha `frontend/shared/arena-discovery/arena-peak-rule.ts`.
class ArenaPeakRule {
  const ArenaPeakRule({
    required this.id,
    required this.active,
    required this.label,
    required this.courtIds,
    required this.weekdays,
    required this.startTime,
    required this.endTime,
    required this.minDurationMinutes,
    this.releaseHoursBefore,
  });

  final String id;
  final bool active;
  final String label;

  /// Vazio = todas as quadras.
  final List<String> courtIds;

  /// 1=seg … 7=dom (ISO weekday).
  final List<int> weekdays;
  final String startTime;
  final String endTime;
  final int minDurationMinutes;

  /// null = nunca libera por antecedência.
  final int? releaseHoursBefore;

  factory ArenaPeakRule.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final courtIdsRaw = data['courtIds'];
    final courtIds = <String>[];
    if (courtIdsRaw is List) {
      for (final e in courtIdsRaw) {
        if (e is String && e.trim().isNotEmpty) courtIds.add(e.trim());
      }
    }
    final weekdaysRaw = data['weekdays'];
    final weekdays = <int>[];
    if (weekdaysRaw is List) {
      for (final e in weekdaysRaw) {
        if (e is num) weekdays.add(e.toInt());
      }
    }
    final minRaw = (data['minDurationMinutes'] as num?)?.toInt();
    final releaseRaw = (data['releaseHoursBefore'] as num?)?.toInt();
    return ArenaPeakRule(
      id: doc.id,
      active: data['active'] == true,
      label: (data['label'] as String?)?.trim() ?? 'Horário de pico',
      courtIds: courtIds,
      weekdays: weekdays,
      startTime: _normalizeHm(data['startTime'] as String? ?? '00:00'),
      endTime: _normalizeHm(data['endTime'] as String? ?? '23:59'),
      minDurationMinutes:
          (minRaw != null && minRaw >= 60 && minRaw <= 360) ? minRaw : 120,
      releaseHoursBefore:
          (releaseRaw != null && releaseRaw > 0) ? releaseRaw : null,
    );
  }

  bool matches({
    required String courtId,
    required DateTime date,
    required String slotStartTime,
  }) {
    if (!active) return false;
    if (courtIds.isNotEmpty && !courtIds.contains(courtId)) return false;
    if (weekdays.isNotEmpty && !weekdays.contains(date.weekday)) return false;

    final slotMin = _toMinutes(slotStartTime);
    final startMin = _toMinutes(startTime);
    final endMin = _toMinutes(endTime);
    if (slotMin == null || startMin == null || endMin == null) return false;
    if (endMin > startMin) {
      return slotMin >= startMin && slotMin < endMin;
    }
    // Faixa overnight (ex.: 22:00–01:00).
    return slotMin >= startMin || slotMin < endMin;
  }

  static String _normalizeHm(String raw) {
    final t = raw.trim();
    if (t.length >= 5) return t.substring(0, 5);
    return t;
  }

  static int? _toMinutes(String hm) {
    final parts = hm.split(':');
    if (parts.length < 2) return null;
    final h = int.tryParse(parts[0]) ?? 0;
    final m = int.tryParse(parts[1]) ?? 0;
    return h * 60 + m.clamp(0, 59);
  }
}
```

- [ ] **Step 4: `peak_rules_repository.dart`**

```dart
import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/arena_peak_rule.dart';

class PeakRulesRepository {
  PeakRulesRepository(this._firestore);

  final FirebaseFirestore _firestore;

  Stream<List<ArenaPeakRule>> watchActivePeakRules(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _firestore
        .collection('arenas')
        .doc(id)
        .collection('peakRules')
        .where('active', isEqualTo: true)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaPeakRule.fromFirestore).toList());
  }
}
```

- [ ] **Step 5: Provider em `slots_providers.dart`** (após `arenaAllPromotionsProvider`)

```dart
final peakRulesRepositoryProvider = Provider<PeakRulesRepository>((ref) {
  return PeakRulesRepository(ref.watch(firestoreProvider));
});

/// Regras de pico ativas da arena (`arenas/{arenaId}/peakRules`).
final arenaPeakRulesProvider =
    StreamProvider.autoDispose.family<List<ArenaPeakRule>, String>(
  (ref, arenaId) {
    return ref.watch(peakRulesRepositoryProvider).watchActivePeakRules(arenaId);
  },
);
```

(+ imports `../data/peak_rules_repository.dart` e `arena_peak_rule.dart`.)

- [ ] **Step 6: Lógica pura em `slots_page_logic.dart`** (append; import `arena_peak_rule.dart` no topo)

```dart
/// Resultado do predicado de pico para uma seleção [start..end].
class PeakSelectionCheck {
  const PeakSelectionCheck({required this.minSlots, this.rule});

  /// Mínimo de slots contíguos exigido (1 = livre).
  final int minSlots;
  final ArenaPeakRule? rule;
}

/// Predicado central do horário de pico (ver spec 2026-08-03): exige o mínimo
/// apenas quando existe cadeia contígua disponível que o cumpra; a janela de
/// antecedência (`releaseHoursBefore`) também libera.
PeakSelectionCheck peakCheckForRange({
  required List<ArenaPeakRule> rules,
  required String courtId,
  required List<ArenaSlot> slots,
  required DateTime selectedDay,
  required int start,
  required int end,
  required int slotDurationMinutes,
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  if (rules.isEmpty || start < 0 || end >= slots.length || start > end) {
    return const PeakSelectionCheck(minSlots: 1);
  }
  final selectionLength = end - start + 1;
  var demandedSlots = 1;
  ArenaPeakRule? demandedRule;

  for (var i = start; i <= end; i++) {
    final rule = _peakRestrictionFor(slots[i], rules, courtId, selectedDay, n);
    if (rule == null) continue;
    final minSlots = durationSlotCount(rule.minDurationMinutes, slotDurationMinutes);
    if (selectionLength >= minSlots) continue;
    if (!_peakChainExists(slots, i, minSlots, selectedDay, n)) continue;
    if (minSlots > demandedSlots) {
      demandedSlots = minSlots;
      demandedRule = rule;
    }
  }
  return PeakSelectionCheck(minSlots: demandedSlots, rule: demandedRule);
}

/// Mínimo a exibir no chip do slot (badge "mín. 2h"); 1 = sem badge.
int peakBadgeMinSlots({
  required List<ArenaPeakRule> rules,
  required String courtId,
  required List<ArenaSlot> slots,
  required DateTime selectedDay,
  required int index,
  required int slotDurationMinutes,
  DateTime? now,
}) {
  return peakCheckForRange(
    rules: rules,
    courtId: courtId,
    slots: slots,
    selectedDay: selectedDay,
    start: index,
    end: index,
    slotDurationMinutes: slotDurationMinutes,
    now: now,
  ).minSlots;
}

ArenaPeakRule? _peakRestrictionFor(
  ArenaSlot slot,
  List<ArenaPeakRule> rules,
  String courtId,
  DateTime day,
  DateTime now,
) {
  ArenaPeakRule? best;
  for (final r in rules) {
    if (!r.matches(
      courtId: courtId,
      date: day,
      slotStartTime: slot.startTime,
    )) {
      continue;
    }
    if (best == null || r.minDurationMinutes > best.minDurationMinutes) {
      best = r;
    }
  }
  final release = best?.releaseHoursBefore;
  if (best != null && release != null) {
    final startMin = slotStartMinutes(slot.startTime);
    final slotStart = DateTime(
      day.year, day.month, day.day, startMin ~/ 60, startMin % 60,
    );
    if (!now.isBefore(slotStart.subtract(Duration(hours: release)))) {
      return null;
    }
  }
  return best;
}

bool _peakChainExists(
  List<ArenaSlot> slots,
  int index,
  int minSlots,
  DateTime day,
  DateTime now,
) {
  for (var start = (index - (minSlots - 1)).clamp(0, index); start <= index; start++) {
    if (start + minSlots > slots.length) break;
    var ok = true;
    for (var i = start; i < start + minSlots; i++) {
      final s = slots[i];
      if (!s.isAvailable ||
          isPastBookableSlot(selectedDay: day, slot: s, now: now)) {
        ok = false;
        break;
      }
      if (i > start && slots[i - 1].endTime != s.startTime) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}
```

- [ ] **Step 7: Ajustar o helper `slot()` dos testes ao construtor real de `ArenaSlot` e rodar**

Run: `cd nexago_app && flutter test test/features/arenas/domain/arena_peak_rule_test.dart test/features/arenas/domain/slots_page_logic_peak_test.dart`
Expected: PASS. (Se estiver executando via subagentes, esta task é o ponto para acionar o agente `flutter-test-engineer`, conforme a convenção do projeto para funcionalidades Flutter.)

- [ ] **Step 8: Analyzer + commit**

Run: `cd nexago_app && flutter analyze lib/features/arenas test/features/arenas`
Expected: sem novos issues (o analyzer do repo tem ruído pré-existente de `build/` — comparar antes/depois se necessário).

```bash
git add nexago_app/lib/features/arenas/domain/arena_peak_rule.dart nexago_app/lib/features/arenas/data/peak_rules_repository.dart nexago_app/lib/features/arenas/domain/slots_providers.dart nexago_app/lib/features/arenas/domain/slots_page_logic.dart nexago_app/test/features/arenas/domain/arena_peak_rule_test.dart nexago_app/test/features/arenas/domain/slots_page_logic_peak_test.dart
git commit -m "feat(app): modelo e predicado de horário de pico (peakRules)"
```

---

### Task 9: Flutter — integração na grade (`slots_page.dart` + badge no tile)

**Files:**
- Modify: `nexago_app/lib/features/arenas/presentation/slots_page.dart` (`_buildMainScaffold`, ~linhas 856-1110)
- Modify: o widget que renderiza os tiles de slot (seguir o import de `SlotsListSection` em `slots_page.dart` — fica em `presentation/widgets/`)

**Interfaces:**
- Consumes (Task 8): `arenaPeakRulesProvider`, `peakCheckForRange`, `peakBadgeMinSlots`, `PeakSelectionCheck`, `ArenaPeakRule`; helpers existentes `formatSelectionDurationLabel`.
- Produces: `canContinue` bloqueia seleção violadora; `SlotsBottomBar.metaLabel` mostra a dica; tile de slot exibe badge "mín. 2h". SEM auto-extensão de seleção no app (v1 — o hint guia o usuário; paridade total fica como follow-up).

- [ ] **Step 1: Watch das regras + cheque da seleção em `_buildMainScaffold`**

Após a linha `final slotDurationMinutes = ref.watch(...)` (~linha 889):

```dart
    final peakRules =
        ref.watch(arenaPeakRulesProvider(arenaId)).valueOrNull ??
            const <ArenaPeakRule>[];
    var peakCheck = const PeakSelectionCheck(minSlots: 1);
    if (!slotsLoading && _selStart != null && _selEnd != null) {
      peakCheck = peakCheckForRange(
        rules: peakRules,
        courtId: courtId,
        slots: slots,
        selectedDay: _selectedDay,
        start: _selStart!,
        end: _selEnd!,
        slotDurationMinutes: slotDurationMinutes,
      );
    }
    final peakViolated = _selStart != null &&
        _selEnd != null &&
        (_selEnd! - _selStart! + 1) < peakCheck.minSlots;
```

Alterar `canContinue` (~linha 907) para incluir `&& !peakViolated`.

Na `SlotsBottomBar` (~linha 1100), trocar `metaLabel`:

```dart
                        metaLabel: slotsLoading
                            ? null
                            : peakViolated
                                ? 'Horário concorrido: mínimo de '
                                    '${formatSelectionDurationLabel(peakCheck.minSlots, slotDurationMinutes)}'
                                : barLabels.meta,
```

(+ imports de `arena_peak_rule.dart` e do provider se ainda não transitarem por `slots_providers.dart`.)

- [ ] **Step 2: Badge no tile de slot**

Passar um callback novo à `SlotsListSection` (~linha 1065), junto de `priceLabelFor`:

```dart
                              peakBadgeFor: (slot) {
                                final idx = slots.indexOf(slot);
                                if (idx < 0) return null;
                                final min = peakBadgeMinSlots(
                                  rules: peakRules,
                                  courtId: courtId,
                                  slots: slots,
                                  selectedDay: _selectedDay,
                                  index: idx,
                                  slotDurationMinutes: slotDurationMinutes,
                                );
                                return min > 1
                                    ? 'mín. ${formatSelectionDurationLabel(min, slotDurationMinutes)}'
                                    : null;
                              },
```

No widget `SlotsListSection` (e no tile interno que ele usa): adicionar o parâmetro opcional `final String? Function(ArenaSlot slot)? peakBadgeFor;` propagado até o tile; no layout do tile, ao lado do label de preço (mesma Row), renderizar quando não-nulo:

```dart
    final peakBadge = peakBadgeFor?.call(slot);
    // ... na Row do preço:
    if (peakBadge != null)
      Container(
        margin: const EdgeInsets.only(left: 6),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: const Color(0xFFEA580C).withOpacity(0.12),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          peakBadge,
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: Color(0xFFEA580C),
          ),
        ),
      ),
```

(Abrir o arquivo do tile antes: se existir um padrão de tag/chip — ex. o "ÚLTIMO"/"popular" — copiar exatamente esse padrão visual em vez do Container acima, mudando só cor/texto.)

- [ ] **Step 3: Testes + analyzer**

Run: `cd nexago_app && flutter test test/features/arenas && flutter analyze lib/features/arenas`
Expected: PASS / sem novos issues. (Ponto de acionamento do `flutter-test-engineer` para cobrir regressões de widget, se o executor usar subagentes.)

- [ ] **Step 4: Commit**

```bash
git add nexago_app/lib/features/arenas/
git commit -m "feat(app): grade de horários respeita reserva mínima no pico"
```

---

### Task 10: Verificação final de ponta a ponta

**Files:** nenhum novo (só verificação e, se necessário, correções pontuais).

- [ ] **Step 1: Suítes completas**

```bash
cd functions && npm test
```

```bash
cd frontend && npx ng test athlete --watch=false && npx ng build athlete && npx ng build arena
```

```bash
cd nexago_app && flutter test test/features/arenas
```

Expected: tudo PASS/limpo. Corrigir qualquer quebra antes de seguir.

- [ ] **Step 2: Revisão de retrocompatibilidade (checklist manual rápido)**

- `git diff main --stat` — confirmar que NENHUM arquivo de recorrentes/agenda do gestor foi tocado (`arena-recurring-*`, `painel/agenda`, `painel/recurring`).
- Confirmar que `ensurePeakRuleSatisfied` retorna cedo com `peakRules` vazio (zero leitura extra de `arenaSlots` para arenas sem regra).
- Confirmar mensagem canônica idêntica nos dois callables.

- [ ] **Step 3: Commit final (se houve ajustes) e resumo de rollout**

Registrar no resumo final ao dono a ordem de rollout (nada disso é executado pelo plano):
1. `npx firebase-tools@latest deploy --only firestore:rules` (dev)
2. `npx firebase-tools@latest deploy --only functions:quoteArenaBooking,functions:createArenaBooking` (dev)
3. Painéis web (arena + atleta) via pipeline usual de Hosting
4. App Flutter em release normal
5. Cadastrar a regra da arena parceira: todos os dias, todas as quadras, 20:00–21:00, mínimo 2h, liberação a definir com a arena
QA manual sugerido: no dev, criar a regra e percorrer o fluxo de reserva no portal do atleta (20h avulsa bloqueada → 19h-21h ok → vizinhas ocupadas libera avulso).
