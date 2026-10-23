/**
 * Experimentais do centro (portal › Experimentais): pedidos que o atleta fez pelo app
 * (`bookCenterClassTrial`). A equipe confirma ou recusa por `decideCenterTrialBooking`; o atleta
 * recebe o push. Pendente e confirmada seguram a vaga da aula.
 */

export type TrialStatus = 'pending' | 'confirmed' | 'declined' | 'canceled';
export type TrialFilter = 'pending' | 'upcoming' | 'all';

export interface CenterTrialBooking {
  id: string;
  status: TrialStatus;
  athleteId: string;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  sessionId: string;
  classId: string;
  className: string;
  level: string;
  coachName: string;
  locationName: string;
  /** YYYY-MM-DD */
  date: string;
  startTime: string;
  endTime: string;
  priceReais: number;
  note: string | null;
  createdAt: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
}

export const TRIAL_STATUS: Record<TrialStatus, [label: string, tone: string]> = {
  pending: ['Aguardando', 'yellow'],
  confirmed: ['Confirmada', 'green'],
  declined: ['Recusada', 'red'],
  canceled: ['Desmarcada', 'dim'],
};

export const TRIAL_NOTE_MAX = 200;

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** 'qui 22/10 · 18:00–19:30' */
export function trialWhen(b: Pick<CenterTrialBooking, 'date' | 'startTime' | 'endTime'>): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b.date ?? '');
  const day = m ? `${WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]} ${m[3]}/${m[2]}` : b.date;
  const time = b.endTime ? `${b.startTime}–${b.endTime}` : b.startTime;
  return [day, time].filter(Boolean).join(' · ');
}

/** Pendentes; próximas (pendentes + confirmadas a partir de hoje); todas. */
export function filterTrials(list: CenterTrialBooking[], filter: TrialFilter, todayKey: string): CenterTrialBooking[] {
  if (filter === 'pending') return list.filter((b) => b.status === 'pending');
  if (filter === 'upcoming') return list.filter((b) => (b.status === 'pending' || b.status === 'confirmed') && b.date >= todayKey);
  return list;
}

export function countPending(list: CenterTrialBooking[]): number {
  return list.filter((b) => b.status === 'pending').length;
}

/** Aplica a decisão na lista local (sem recarregar). */
export function applyDecision(list: CenterTrialBooking[], id: string, status: TrialStatus, byName: string, note: string | null): CenterTrialBooking[] {
  return list.map((b) => (b.id === id ? { ...b, status, decidedByName: byName, decidedAt: new Date().toISOString(), note } : b));
}

/** Link do WhatsApp com o atleta (telefone com DDI 55 quando vier sem). */
export function whatsAppLink(phone: string | null, text: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

/** Hoje em Brasília (UTC−3, sem horário de verão). */
export function todayKeyBr(now = new Date()): string {
  return new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

export function trialErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = error instanceof Error ? error.message.trim() : '';
  if (message.toUpperCase() === 'NOT FOUND') return 'Experimentais indisponíveis no momento. Tente mais tarde.';
  if (code === 'functions/permission-denied') return message || 'Só a gestão ou a recepção do centro confirma experimentais.';
  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') return 'Sem conexão. Tente de novo.';
  if (code === 'functions/internal' && (!message || message.toLowerCase() === 'internal')) return 'Não foi possível concluir. Tente de novo.';
  return message || 'Não foi possível concluir. Tente de novo.';
}
