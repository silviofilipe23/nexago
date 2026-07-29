import { Timestamp, type DocumentSnapshot, type QueryDocumentSnapshot } from 'firebase/firestore';

/** Espelha `functions/src/arena-club.ts` — docs `arenaClubs`, `arenaClubSessions` e a
 *  subcoleção `clubParticipants` (escrita 100% server-side; aqui só parse de leitura). */

export type ArenaClubStatus = 'active' | 'paused' | 'archived';
export type ClubSessionStatus = 'scheduled' | 'canceled' | 'completed';
export type ClubParticipantStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'expired'
  | 'canceled'
  | 'canceled_refunded'
  | 'canceled_by_arena_refunded';

export interface ArenaClub {
  id: string;
  arenaId: string;
  name: string;
  description: string | null;
  /** ISO 1–7; null = só sessões avulsas. */
  weekday: number | null;
  startTime: string;
  endTime: string;
  courtIds: string[];
  courtNames: string[];
  capacity: number;
  priceReais: number;
  cancelWindowHours: number;
  /** Aceita reservar vaga pagando na arena (sem PIX antecipado). */
  allowOnsitePayment: boolean;
  status: ArenaClubStatus;
  startDate: string;
  endDate: string | null;
  createdAt: Date | null;
}

export interface ArenaClubSession {
  id: string;
  clubId: string;
  arenaId: string;
  clubName: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: Date | null;
  courtNames: string[];
  capacity: number;
  priceReais: number;
  cancelWindowHours: number;
  confirmedCount: number;
  pendingCount: number;
  status: ClubSessionStatus;
  source: 'series' | 'manual';
}

export interface ClubParticipant {
  id: string;
  athleteId: string;
  athleteName: string;
  athletePhotoUrl: string | null;
  status: ClubParticipantStatus;
  /** 'onsite' = paga na arena (sem cobrança online); ausente em docs antigos = 'pix'. */
  paymentMethod: 'pix' | 'onsite';
  amountReais: number;
  refundStatus: 'none' | 'done' | 'failed';
  joinedAt: Date | null;
}

function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((item) => String(item)) : [];
}

export function arenaClubFromDoc(doc: QueryDocumentSnapshot | DocumentSnapshot): ArenaClub {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    arenaId: str(d['arenaId']),
    name: str(d['name'], 'Clubinho'),
    description: typeof d['description'] === 'string' && d['description'] ? d['description'] : null,
    weekday: typeof d['weekday'] === 'number' ? d['weekday'] : null,
    startTime: str(d['startTime']),
    endTime: str(d['endTime']),
    courtIds: strArray(d['courtIds']),
    courtNames: strArray(d['courtNames']),
    capacity: num(d['capacity']),
    priceReais: num(d['priceReais']),
    cancelWindowHours: num(d['cancelWindowHours']),
    allowOnsitePayment: d['allowOnsitePayment'] !== false,
    status: (str(d['status'], 'active') as ArenaClubStatus) || 'active',
    startDate: str(d['startDate']),
    endDate: typeof d['endDate'] === 'string' && d['endDate'] ? d['endDate'] : null,
    createdAt: toDate(d['createdAt']),
  };
}

export function clubSessionFromDoc(doc: QueryDocumentSnapshot | DocumentSnapshot): ArenaClubSession {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    clubId: str(d['clubId']),
    arenaId: str(d['arenaId']),
    clubName: str(d['clubName'], 'Clubinho'),
    date: str(d['date']),
    startTime: str(d['startTime']),
    endTime: str(d['endTime']),
    startAt: toDate(d['startAt']),
    courtNames: strArray(d['courtNames']),
    capacity: num(d['capacity']),
    priceReais: num(d['priceReais']),
    cancelWindowHours: num(d['cancelWindowHours']),
    confirmedCount: num(d['confirmedCount']),
    pendingCount: num(d['pendingCount']),
    status: (str(d['status'], 'scheduled') as ClubSessionStatus) || 'scheduled',
    source: d['source'] === 'manual' ? 'manual' : 'series',
  };
}

export function clubParticipantFromDoc(doc: QueryDocumentSnapshot): ClubParticipant {
  const d = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    athleteId: str(d['athleteId'], doc.id),
    athleteName: str(d['athleteName'], 'Atleta'),
    athletePhotoUrl:
      typeof d['athletePhotoUrl'] === 'string' && d['athletePhotoUrl'] ? d['athletePhotoUrl'] : null,
    status: (str(d['status']) as ClubParticipantStatus) || 'pending_payment',
    paymentMethod: d['paymentMethod'] === 'onsite' ? 'onsite' : 'pix',
    amountReais: num(d['amountReais']),
    refundStatus: (str(d['refundStatus'], 'none') as 'none' | 'done' | 'failed') || 'none',
    joinedAt: toDate(d['joinedAt']),
  };
}

export function spotsLeft(session: ArenaClubSession): number {
  return Math.max(0, session.capacity - session.confirmedCount - session.pendingCount);
}

export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'segunda',
  2: 'terça',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sábado',
  7: 'domingo',
};

export function clubScheduleLabel(club: ArenaClub): string {
  const day = club.weekday != null ? `Toda ${WEEKDAY_LABELS[club.weekday] ?? '?'}` : 'Sessões avulsas';
  return `${day} · ${club.startTime}–${club.endTime}`;
}

export const CLUB_STATUS_LABEL: Record<ArenaClubStatus, string> = {
  active: 'Ativo',
  paused: 'Pausado',
  archived: 'Arquivado',
};

export const SESSION_STATUS_LABEL: Record<ClubSessionStatus, string> = {
  scheduled: 'Agendada',
  canceled: 'Cancelada',
  completed: 'Concluída',
};

export const PARTICIPANT_STATUS_LABEL: Record<ClubParticipantStatus, string> = {
  pending_payment: 'Aguardando PIX',
  confirmed: 'Confirmado',
  expired: 'PIX expirado',
  canceled: 'Cancelado',
  canceled_refunded: 'Saiu (estornado)',
  canceled_by_arena_refunded: 'Estornado (arena)',
};

export function formatReais(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/** `2026-07-24` → `24/07`. */
export function formatShortDate(dateKey: string): string {
  const parts = dateKey.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateKey;
}

export function formatFullDate(dateKey: string): string {
  const parts = dateKey.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateKey;
}

export function todayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
