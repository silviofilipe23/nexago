import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';

/** Espelha `nexago_app/.../arenas/domain/arena_slot.dart` — schema de `arenaSlots`. Slots
 *  persistidos (doc real) convivem com slots "virtuais" (gerados na hora a partir do horário
 *  de funcionamento da quadra, sem doc no Firestore, id prefixado `v_`) — mesma dualidade do app. */

export type ArenaSlotStatus = 'available' | 'booked' | 'blocked';

export type ArenaSlotBlockReason = 'manutencao' | 'evento' | 'aula' | 'outro';

export const ARENA_SLOT_BLOCK_REASONS: ArenaSlotBlockReason[] = ['manutencao', 'evento', 'aula', 'outro'];

export const ARENA_SLOT_BLOCK_REASON_LABEL: Record<ArenaSlotBlockReason, string> = {
  manutencao: 'Manutenção',
  evento: 'Evento privado',
  aula: 'Aula',
  outro: 'Outro',
};

export interface ArenaSlot {
  id: string;
  arenaId: string;
  courtId: string;
  /** `YYYY-MM-DD` */
  dateKey: string;
  startTime: string;
  endTime: string;
  status: ArenaSlotStatus;
  /** Gerado localmente (sem documento em `arenaSlots`) — prefixo `v_` no id. */
  isVirtual: boolean;
  bookingId: string | null;
  bookingAthleteId: string | null;
  blockReason: ArenaSlotBlockReason | null;
  blockNote: string | null;
}

function rawStatusOf(raw: unknown): ArenaSlotStatus {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'booked' || s === 'occupied' || s === 'busy' || s === 'reservado' || s === 'ocupado') return 'booked';
  if (s === 'blocked' || s === 'bloqueado') return 'blocked';
  return 'available';
}

function optionalTrimmed(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function timeStr(v: unknown): string {
  if (typeof v !== 'string') return '--:--';
  const t = v.trim();
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function dateKeyFromDynamic(v: unknown): string {
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  if (v instanceof Timestamp) {
    // Dia de calendário LOCAL — mesma regra do app Flutter e da lib do atleta (ISO/UTC
    // deslocaria o dia pra frente a partir das 21h no fuso do Brasil).
    const d = v.toDate();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  return '';
}

function blockReasonFromFirestore(raw: unknown): ArenaSlotBlockReason | null {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!v) return null;
  return (ARENA_SLOT_BLOCK_REASONS as string[]).includes(v) ? (v as ArenaSlotBlockReason) : 'outro';
}

export function arenaSlotFromDoc(doc: QueryDocumentSnapshot): ArenaSlot {
  const d = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    arenaId: typeof d['arenaId'] === 'string' ? d['arenaId'] : '',
    courtId: optionalTrimmed(d['courtId']) ?? optionalTrimmed(d['court_id']) ?? '',
    dateKey: dateKeyFromDynamic(d['date'] ?? d['slotDate'] ?? d['day'] ?? d['dateKey']),
    startTime: timeStr(d['startTime'] ?? d['start']),
    endTime: timeStr(d['endTime'] ?? d['end']),
    status: rawStatusOf(d['status']),
    isVirtual: false,
    bookingId: optionalTrimmed(d['bookingId']),
    bookingAthleteId: optionalTrimmed(d['bookingAthleteId']) ?? optionalTrimmed(d['athleteId']),
    blockReason: blockReasonFromFirestore(d['blockReason']),
    blockNote: optionalTrimmed(d['blockNote']),
  };
}

export function virtualSlot(arenaId: string, courtId: string, dateKey: string, startTime: string, endTime: string): ArenaSlot {
  const id = `v_${dateKey.replace(/-/g, '')}_${courtId}_${startTime.replace(':', '')}_${endTime.replace(':', '')}`;
  return {
    id,
    arenaId,
    courtId,
    dateKey,
    startTime,
    endTime,
    status: 'available',
    isVirtual: true,
    bookingId: null,
    bookingAthleteId: null,
    blockReason: null,
    blockNote: null,
  };
}
