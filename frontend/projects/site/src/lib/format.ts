import type { Sport, TournamentListingStatus } from '@/lib/firestore/types';

export function sportLabel(sport: Sport): string {
  switch (sport) {
    case 'beachTennis':
      return 'Beach tennis';
    case 'beachVolleyball':
      return 'Vôlei de praia';
    default:
      return 'Esporte de areia';
  }
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
  ended: { label: 'Encerrado', tone: 'muted' },
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
