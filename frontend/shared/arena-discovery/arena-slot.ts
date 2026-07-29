import type { DocumentData, DocumentSnapshot, Timestamp } from 'firebase/firestore';

import { arenaSlotVirtual } from './arena-slot-virtual';

export interface ArenaSlot {
  id: string;
  arenaId: string;
  courtId: string;
  date: Date;
  startTime: string;
  endTime: string;
  rawStatus: string;
  priceReais: number | null;
  basePriceReais: number | null;
  appliedPromotionId: string | null;
  isVirtual: boolean;
}

export { arenaSlotVirtual };

export function arenaSlotIsAvailable(slot: ArenaSlot): boolean {
  return slot.rawStatus.toLowerCase() === 'available';
}

export function arenaSlotIsBooked(slot: ArenaSlot): boolean {
  const s = slot.rawStatus.toLowerCase();
  return ['booked', 'occupied', 'busy', 'reservado', 'ocupado'].includes(s);
}

export function arenaSlotIsBlocked(slot: ArenaSlot): boolean {
  const s = slot.rawStatus.toLowerCase();
  return s === 'blocked' || s === 'bloqueado';
}

export function arenaSlotFromFirestore(doc: DocumentSnapshot<DocumentData>): ArenaSlot | null {
  const data = doc.data();
  if (!data) {
    return null;
  }
  const arenaId = typeof data['arenaId'] === 'string' ? data['arenaId'].trim() : '';
  const courtRaw = data['courtId'] ?? data['court_id'];
  const courtId = typeof courtRaw === 'string' ? courtRaw.trim() : '';
  const date = parseSlotDate(data['date'] ?? data['slotDate'] ?? data['day'] ?? data['dateKey']);
  if (!date) {
    return null;
  }
  const priceReais =
    (typeof data['priceReais'] === 'number' ? data['priceReais'] : null) ??
    (typeof data['price'] === 'number' ? data['price'] : null);
  const statusRaw = data['status'];
  const rawStatus =
    typeof statusRaw === 'string' && statusRaw.trim().length > 0 ? statusRaw.trim() : 'available';

  return {
    id: doc.id,
    arenaId,
    courtId,
    date,
    startTime: parseSlotTime(data['startTime'] ?? data['start'] ?? data['horaInicio']),
    endTime: parseSlotTime(data['endTime'] ?? data['end'] ?? data['horaFim']),
    rawStatus,
    priceReais,
    basePriceReais: null,
    appliedPromotionId: null,
    isVirtual: false,
  };
}

function parseSlotDate(value: unknown): Date | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const d = (value as Timestamp).toDate();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'string') {
    const t = value.trim();
    // `YYYY-MM-DD` é dia de calendário local — `Date.parse` trataria como meia-noite UTC,
    // deslocando o slot pra véspera em fusos negativos (Brasil).
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (iso) {
      return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }
    const parsed = Date.parse(t);
    if (!Number.isNaN(parsed)) {
      const d = new Date(parsed);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }
  return null;
}

function parseSlotTime(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    const t = value.trim();
    return t.length >= 5 ? t.substring(0, 5) : t;
  }
  if (typeof value === 'number') {
    const h = Math.floor(value / 60);
    const m = value % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return '--:--';
}

export function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function timeToMinutes(value: string): number {
  const parts = value.split(':');
  const hh = Number.parseInt(parts[0] ?? '', 10);
  const mm = Number.parseInt(parts[1] ?? '', 10);
  return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}
