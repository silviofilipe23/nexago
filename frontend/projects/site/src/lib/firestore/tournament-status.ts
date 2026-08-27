/**
 * Status público do torneio — derivado do doc, não lido cru. Porta 1:1 do site Next.js
 * (mesma lógica, mesmos limiares — ver histórico ali para o porquê de cada decisão).
 * Espelha `tournamentListingStatus`/`resolveTournamentRawStatus` do portal do atleta.
 */

import type { TournamentListingStatus } from './types';

type TournamentRawStatus =
  | 'draft'
  | 'cancelled'
  | 'open'
  | 'bracketsReady'
  | 'almostFull'
  | 'live'
  | 'completed'
  | 'ended';

export function rawStatusOf(data: { listingStatus?: unknown; status?: unknown }): string {
  const listing = typeof data.listingStatus === 'string' ? data.listingStatus.trim() : '';
  if (listing) return listing;
  return typeof data.status === 'string' ? data.status.trim() : '';
}

function normalize(raw: string): TournamentRawStatus | null {
  const v = raw.toLowerCase().trim();
  if (!v) return null;
  if (v.includes('draft') || v.includes('rascunho') || v.includes('programado')) return 'draft';
  if (v.includes('cancel')) return 'cancelled';
  if (v.includes('closed') || (v.includes('inscri') && v.includes('encerr'))) return 'bracketsReady';
  if (v.includes('brackets ready') || v.includes('chaves prontas')) return 'bracketsReady';
  if (v.includes('almost') || v.includes('quase lotado')) return 'almostFull';
  if (v.includes('progress') || v.includes('andamento') || v === 'live' || v.includes('ao vivo')) return 'live';
  if (v.includes('completed') || v.includes('conclu')) return 'completed';
  if (v.includes('ended') || v.includes('encerrado') || v.includes('finalizado')) return 'ended';
  if (v.includes('open') || v.includes('aberta')) return 'open';
  return null;
}

/** Rascunho: nunca foi publicado. Fica fora da listagem e a página individual dá "não encontrado". */
export function isDraftStatus(raw: string): boolean {
  return normalize(raw) === 'draft';
}

const SAO_PAULO_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "É hoje?" pelo fuso de São Paulo, não pelo do navegador do visitante. */
function isSameDayInBrazil(a: Date, b: Date): boolean {
  return SAO_PAULO_DAY.format(a) === SAO_PAULO_DAY.format(b);
}

export interface TournamentStatusInput {
  rawStatus: string;
  startAt: Date | null;
  endAt: Date | null;
  liveMatchesNow: number;
  enrolledCount: number;
  capacity: number | null;
}

export function resolveListingStatus(t: TournamentStatusInput, now: Date = new Date()): TournamentListingStatus {
  const raw = normalize(t.rawStatus);

  if (raw === 'cancelled') return 'cancelled';
  if (raw === 'completed' || raw === 'ended') return 'ended';

  if (t.liveMatchesNow > 0) return 'live';

  const end = t.endAt ?? t.startAt;
  if (raw === 'live') return end && now > end ? 'ended' : 'live';
  if (end && now > end) return 'ended';

  if (t.startAt && isSameDayInBrazil(now, t.startAt)) {
    if (raw === 'open' || raw === 'almostFull' || raw === 'bracketsReady') return 'live';
  }

  if (raw === 'bracketsReady') return 'closed';
  if (raw === 'almostFull') return 'almost_full';
  if (raw === 'open') return 'open';
  if (raw === 'draft') return 'open';

  if (t.capacity && t.capacity > 0) {
    const spotsLeft = t.capacity - t.enrolledCount;
    if (spotsLeft <= 0) return 'closed';
    if (spotsLeft <= 5) return 'almost_full';
  }
  if (t.startAt) {
    const msToStart = t.startAt.getTime() - now.getTime();
    if (msToStart > 0 && msToStart < 2 * 60 * 60_000) return 'live';
  }
  return 'open';
}

/** Ativo = ainda vai acontecer ou está acontecendo. `closed` entra: o evento não passou. */
export function isActiveStatus(status: TournamentListingStatus): boolean {
  return status === 'open' || status === 'almost_full' || status === 'closed' || status === 'live';
}
