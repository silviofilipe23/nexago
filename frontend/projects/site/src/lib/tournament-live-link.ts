import type { TournamentListingStatus } from './firestore/types';

const LIVE_LINK_STATUSES: ReadonlySet<TournamentListingStatus> = new Set(['closed', 'live']);

/** Só nos status em que o CTA hoje promete "acompanhe ao vivo" sem cumprir — os outros
 *  status não ganham link pra `organizador.nexago.app`. */
export function liveUrlFor(status: TournamentListingStatus, id: string): string | null {
  if (!LIVE_LINK_STATUSES.has(status)) return null;
  return `https://organizador.nexago.app/t/${id}`;
}
