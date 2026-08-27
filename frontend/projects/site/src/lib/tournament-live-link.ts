import type { TournamentListingStatus } from './firestore/types';

const LIVE_LINK_STATUSES: ReadonlySet<TournamentListingStatus> = new Set(['closed', 'live']);

/** Só nos status em que o CTA hoje promete "acompanhe ao vivo" sem cumprir — os outros
 *  status não ganham link pra `organizador.nexago.com.br`. `nexago.app` foi aposentado
 *  (mesma migração de domínio do portal do atleta, ver [[app-domain-migration-atleta-portal]]). */
export function liveUrlFor(status: TournamentListingStatus, id: string): string | null {
  if (!LIVE_LINK_STATUSES.has(status)) return null;
  return `https://organizador.nexago.com.br/t/${id}`;
}
