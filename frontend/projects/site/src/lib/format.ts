import { SPORT_UNKNOWN_LABEL, resolveSport, sportLabel as catalogSportLabel } from '@nexago/sports';
import type { Sport, TournamentListingStatus } from './firestore/types';

/** Rótulo do esporte pelo catálogo (`@nexago/sports`); ausente → "Esporte não informado". */
export function sportLabel(sport: Sport): string {
  return catalogSportLabel(sport) ?? SPORT_UNKNOWN_LABEL;
}

/** `courtTypes` da arena para exibição: código ou rótulo legado do mesmo esporte viram o rótulo
 *  do catálogo, uma vez só; valor fora do catálogo (superfície, pickleball) segue cru. */
export function courtTypeLabels(values: readonly string[]): string[] {
  const labels: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const label = value ? resolveSport(value)?.label ?? value : '';
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

export function genderLabel(genderType?: string): string {
  switch (genderType) {
    case 'male':
      return 'Masculino';
    case 'female':
      return 'Feminino';
    case 'mixed':
      return 'Misto';
    default:
      return genderType ?? '—';
  }
}

export const STATUS_META: Record<
  TournamentListingStatus,
  { label: string; tone: 'live' | 'open' | 'pending' | 'muted' }
> = {
  live: { label: 'Ao vivo', tone: 'live' },
  open: { label: 'Inscrições abertas', tone: 'open' },
  almost_full: { label: 'Últimas vagas', tone: 'pending' },
  // Inscrição fechada mas o torneio ainda vai acontecer — não é "Últimas vagas" (convidaria a se
  // inscrever) nem "Encerrado" (o evento não passou).
  closed: { label: 'Inscrições encerradas', tone: 'pending' },
  ended: { label: 'Encerrado', tone: 'muted' },
  cancelled: { label: 'Cancelado', tone: 'muted' },
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatCents(cents?: number | null): string {
  if (cents == null) return '—';
  return BRL.format(cents / 100);
}

export function formatDate(date: Date | null): string {
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}
