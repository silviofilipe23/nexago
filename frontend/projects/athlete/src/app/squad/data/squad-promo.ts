import {
  registrationOpensAt,
  tournamentListingStatus,
  type TournamentSummary,
} from '../../data/tournaments-repository';
import { brl, dayMonth, plural } from './squad-model';

/**
 * "Torneios pra divulgar" do painel do embaixador: os próximos torneios da listagem pública que
 * ainda vão receber inscrição. Mesma fonte da tela Competir (`fetchAllTournaments`, que já tira
 * rascunho, cancelado e torneio "por link").
 */
export interface PromoTournament {
  id: string;
  name: string;
  coverUrl: string | null;
  /** "26 out · Arena Errejota". */
  when: string;
  /** "64 vagas · a partir de R$ 120". */
  offer: string;
  /** "Inscrições fecham em 6 dias", "Abre em 25 out"… */
  note: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function noteOf(t: TournamentSummary, now: Date): string {
  const opens = registrationOpensAt(t);
  if (opens && opens.getTime() > now.getTime()) {
    const days = Math.ceil((opens.getTime() - now.getTime()) / DAY_MS);
    return days <= 1 ? 'Inscrições abrem amanhã' : `Inscrições abrem em ${dayMonth(opens.toISOString())}`;
  }
  if (t.registrationClosesAt) {
    const days = Math.ceil((t.registrationClosesAt.getTime() - now.getTime()) / DAY_MS);
    if (days <= 1) return 'Inscrições fecham hoje';
    return `Inscrições fecham em ${days} dias`;
  }
  return 'Inscrições abertas';
}

function offerOf(t: TournamentSummary): string {
  const parts: string[] = [];
  const spots = t.categories.reduce((n, c) => n + Math.max(0, c.maxTeams), 0) || t.capacity;
  if (spots > 0) parts.push(plural(spots, 'vaga', 'vagas'));
  const fees = t.categories.map((c) => c.entryFee).filter((f) => f > 0);
  if (fees.length > 0) {
    const min = brl(Math.min(...fees) * 100, false);
    parts.push(new Set(fees).size > 1 ? `a partir de ${min}` : min);
  }
  return parts.join(' · ');
}

/** Até `max` torneios que começam depois de agora, aceitam (ou vão aceitar) inscrição, do mais próximo. */
export function promoTournaments(list: readonly TournamentSummary[], now: Date, max = 3): PromoTournament[] {
  return list
    .filter((t) => !t.isCancelled && t.startAt !== null && t.startAt.getTime() > now.getTime())
    .filter((t) => tournamentListingStatus(t, now) === 'open')
    .filter((t) => !t.registrationClosesAt || t.registrationClosesAt.getTime() > now.getTime())
    .filter((t) => t.categories.length === 0 || t.categories.some((c) => !c.registrationClosed && !c.isCompleted))
    .sort((a, b) => a.startAt!.getTime() - b.startAt!.getTime())
    .slice(0, max)
    .map((t) => ({
      id: t.id,
      name: t.name,
      coverUrl: t.coverUrl,
      when: [dayMonth(t.startAt!.toISOString()), t.location || t.city].filter(Boolean).join(' · '),
      offer: offerOf(t),
      note: noteOf(t, now),
    }));
}
