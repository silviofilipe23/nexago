import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { chunkIds } from '../data/chunk-ids';
import type { ArenaTournament, ArenaTournamentStatus } from './tournament.model';

/** `tournaments/{id}` (top-level, leitura pública, espelha `TournamentDocumentMapper` do
 *  Flutter) filtrados por `arenaId` — é só a localização (quem organiza é `managerId`, sempre um
 *  organizador; a arena nunca cria torneio, só sedia). Não existe endpoint pra "torneios da minha
 *  arena", filtra em memória/query direta por campo. */

const SPORT_LABELS: Record<string, string> = {
  beachVolleyball: 'Vôlei de praia',
  indoorVolleyball: 'Vôlei de quadra',
  footvolley: 'Futevôlei',
};

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  if (typeof t?.toDate === 'function') return t.toDate();
  if (typeof v === 'string') {
    const parsed = new Date(v);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function optionalStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function numberOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function sportLabelOf(raw: unknown): string {
  const v = optionalStr(raw);
  if (!v) return 'Esporte';
  return SPORT_LABELS[v] ?? v;
}

function statusOf(rawStatus: string, startAt: Date | null, endAt: Date | null, now: Date): ArenaTournamentStatus {
  const v = rawStatus.toLowerCase();
  if (v.includes('cancel') || v.includes('completed') || v.includes('conclu') || v.includes('encerrado') || v.includes('ended')) return 'concluido';
  if (v.includes('progress') || v.includes('andamento') || v === 'live' || v.includes('ao vivo')) return 'andamento';
  const end = endAt ?? startAt;
  if (end && now > end) return 'concluido';
  if (startAt && now.toDateString() === startAt.toDateString()) return 'andamento';
  return 'inscricoes';
}

function formatDatePtBr(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d);
}

function tournamentFromDoc(id: string, data: Record<string, unknown>, now: Date): ArenaTournament {
  const startAt = toDate(data['startAt']);
  const endAt = toDate(data['endAt']);
  const categories = Array.isArray(data['categories']) ? (data['categories'] as Record<string, unknown>[]) : [];
  const capacityFallback = categories.reduce((sum, c) => sum + (numberOf(c['maxTeams']) ?? numberOf(c['spotsTotal']) ?? 0), 0);
  const capacity = numberOf(data['capacity']) || capacityFallback;
  const statusRaw = optionalStr(data['listingStatus']) ?? optionalStr(data['status']) ?? '';
  return {
    id,
    name: optionalStr(data['name']) ?? 'Torneio',
    sport: sportLabelOf(data['sport']),
    dateLabel: optionalStr(data['dateLabel']) ?? (startAt ? formatDatePtBr(startAt) : 'Data a confirmar'),
    startAt,
    status: statusOf(statusRaw, startAt, endAt, now),
    enrolledCount: 0,
    capacity,
    collectedReais: (numberOf(data['collectedCents']) ?? 0) / 100,
    leagueId: optionalStr(data['leagueId']),
  };
}

/** Inscrições por torneio a partir dos docs já lidos — inscrição sem `tournamentId` não conta
 *  pra ninguém, e torneio sem nenhuma inscrição fica fora do mapa (quem chama usa 0). */
export function countInscriptionsByTournament(inscriptions: readonly Record<string, unknown>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const data of inscriptions) {
    const tid = optionalStr(data['tournamentId']);
    if (tid) counts.set(tid, (counts.get(tid) ?? 0) + 1);
  }
  return counts;
}

/** `inscriptions` não guarda contagem agregada no torneio (`enrolledCount` do doc nunca é
 *  incrementado — dado morto); conta direto os documentos de inscrição por torneio. */
async function fetchEnrolledCounts(db: Firestore, projectId: string, tournamentIds: readonly string[]): Promise<Map<string, number>> {
  const chunks = chunkIds(tournamentIds);
  if (chunks.length === 0) return new Map();

  // Os lotes saem juntos: são independentes, e com `await` dentro do laço uma arena com 30
  // torneios enfileirava 3 idas ao servidor só pra contar inscritos.
  const col = collection(db, 'artifacts', projectId, 'public', 'data', 'inscriptions');
  const snaps = await Promise.all(chunks.map((chunk) => getDocs(query(col, where('tournamentId', 'in', chunk)))));

  return countInscriptionsByTournament(snaps.flatMap((snap) => snap.docs.map((d) => d.data() as Record<string, unknown>)));
}

export async function fetchArenaTournaments(db: Firestore, projectId: string, arenaId: string): Promise<ArenaTournament[]> {
  const snap = await getDocs(query(collection(db, 'tournaments'), where('arenaId', '==', arenaId)));
  const now = new Date();
  const tournaments = snap.docs.map((d) => tournamentFromDoc(d.id, d.data() as Record<string, unknown>, now));
  const enrolledCounts = await fetchEnrolledCounts(db, projectId, tournaments.map((t) => t.id));
  return tournaments
    .map((t) => ({ ...t, enrolledCount: enrolledCounts.get(t.id) ?? 0 }))
    .sort((a, b) => (b.startAt?.getTime() ?? 0) - (a.startAt?.getTime() ?? 0));
}
