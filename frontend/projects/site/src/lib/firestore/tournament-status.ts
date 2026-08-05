/**
 * Status público do torneio — derivado do doc, não lido cru.
 *
 * Espelha `tournamentListingStatus`/`resolveTournamentRawStatus` do portal do atleta
 * (`frontend/projects/athlete/src/app/data/tournaments-repository.ts`), que por sua vez
 * espelha `resolveListingStatus` do Flutter. Mesma ordem de decisão, mesmos limiares.
 *
 * Duas diferenças deliberadas, porque o site é vitrine pública e não pode convidar a se
 * inscrever no que não aceita mais inscrição:
 *  - `bracketsReady` (inscrição fechada, chaves prontas) vira `closed` — "Inscrições
 *    encerradas" — em vez de ser colapsado em `almost_full` ("Últimas vagas") como no atleta.
 *  - `cancelled` não é colapsado em `ended`: some da listagem, mas a página aberta pelo link
 *    compartilhado precisa dizer "Cancelado" em vez de "Encerrado".
 *
 * Rascunho não é status de exibição — é ausência de publicação (`isDraftStatus`).
 */

import type { TournamentListingStatus } from './types';

/** Vocabulário cru gravado no doc, normalizado. `null` = ilegível/ausente. */
type TournamentRawStatus =
  | 'draft'
  | 'cancelled'
  | 'open'
  | 'bracketsReady'
  | 'almostFull'
  | 'live'
  | 'completed'
  | 'ended';

/**
 * `listingStatus` é a fonte da verdade; `status` é o espelho legado (docs antigos só têm ele,
 * às vezes capitalizado — `'Open'`, `'Completed'`). Mesma precedência do organizador
 * (`tournaments-repository.ts`) e do atleta.
 */
export function rawStatusOf(data: { listingStatus?: unknown; status?: unknown }): string {
  const listing = typeof data.listingStatus === 'string' ? data.listingStatus.trim() : '';
  if (listing) return listing;
  return typeof data.status === 'string' ? data.status.trim() : '';
}

/** Aceita o vocabulário atual e os legados em português — mesma ordem do portal do atleta. */
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

/** Rascunho: nunca foi publicado. Fica fora da listagem e a página individual dá 404. */
export function isDraftStatus(raw: string): boolean {
  return normalize(raw) === 'draft';
}

const SAO_PAULO_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * "É hoje?" pelo fuso de São Paulo, não pelo do servidor. O site roda em UTC no host, e
 * `toDateString()` cru faria um torneio das 8h de SP contar como o dia anterior/seguinte.
 */
function isSameDayInBrazil(a: Date, b: Date): boolean {
  return SAO_PAULO_DAY.format(a) === SAO_PAULO_DAY.format(b);
}

export interface TournamentStatusInput {
  /** Cru, como veio do doc — use `rawStatusOf`. */
  rawStatus: string;
  startAt: Date | null;
  endAt: Date | null;
  liveMatchesNow: number;
  enrolledCount: number;
  capacity: number | null;
}

/**
 * As datas e a lotação corrigem o status cru: é isso que impede o site de anunciar
 * "Inscrições abertas" num torneio que já aconteceu porque o organizador não fechou o doc.
 */
export function resolveListingStatus(t: TournamentStatusInput, now: Date = new Date()): TournamentListingStatus {
  const raw = normalize(t.rawStatus);

  // Terminais: nenhuma data reabre um torneio cancelado ou concluído.
  if (raw === 'cancelled') return 'cancelled';
  if (raw === 'completed' || raw === 'ended') return 'ended';

  // Partida em quadra agora manda em qualquer status gravado.
  if (t.liveMatchesNow > 0) return 'live';

  const end = t.endAt ?? t.startAt;
  if (raw === 'live') return end && now > end ? 'ended' : 'live';
  if (end && now > end) return 'ended';

  // No dia do evento, um torneio ainda "aberto" já está rolando.
  if (t.startAt && isSameDayInBrazil(now, t.startAt)) {
    if (raw === 'open' || raw === 'almostFull' || raw === 'bracketsReady') return 'live';
  }

  if (raw === 'bracketsReady') return 'closed';
  if (raw === 'almostFull') return 'almost_full';
  if (raw === 'open') return 'open';
  if (raw === 'draft') return 'open'; // não deveria chegar aqui: `isDraftStatus` filtra antes.

  // Sem status legível: deriva da lotação (mesmos limiares do portal do atleta).
  // `capacity > 0` é guarda própria — doc sem capacidade cairia em "lotado" por 0 - 0 <= 0.
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
