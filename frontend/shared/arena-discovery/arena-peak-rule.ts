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

/** Melhor cadeia contígua de `minSlots` slots disponíveis contendo o slot de
 *  `targetStartTime`. Prefere a cadeia que COMEÇA no slot clicado e só então
 *  recua o início — é o que o modal da regra de pico oferece ao atleta.
 *  `null` quando nenhuma cadeia é possível (nesse caso o slot está liberado e
 *  o modal não deve abrir). */
export function minimumChainContaining(params: {
  courtDaySlots: ArenaSlot[];
  targetStartTime: string;
  minSlots: number;
  date: Date;
  now?: Date;
}): ArenaSlot[] | null {
  const now = params.now ?? new Date();
  const slots = params.courtDaySlots;
  if (params.minSlots < 1) return null;
  const idx = slots.findIndex((s) => s.startTime === params.targetStartTime);
  if (idx === -1) return null;

  const earliestStart = Math.max(0, idx - (params.minSlots - 1));
  for (let start = idx; start >= earliestStart; start--) {
    if (start + params.minSlots > slots.length) continue;
    const chain = slots.slice(start, start + params.minSlots);
    if (chainIsBookable(chain, params.date, now)) return chain;
  }
  return null;
}

function chainIsBookable(chain: ArenaSlot[], date: Date, now: Date): boolean {
  for (let i = 0; i < chain.length; i++) {
    const s = chain[i]!;
    if (!chainEligible(s, date, now)) return false;
    if (i > 0 && chain[i - 1]!.endTime !== s.startTime) return false;
  }
  return true;
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
  return minimumChainContaining({courtDaySlots, targetStartTime, minSlots, date, now}) != null;
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
