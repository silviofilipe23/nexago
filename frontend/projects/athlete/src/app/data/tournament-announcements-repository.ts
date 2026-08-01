import { collection, getDocs, limit, orderBy, query, where, type Firestore } from 'firebase/firestore';

/** Avisos que o organizador publica durante o torneio. Vivem na MESMA coleção do feed da
 *  comunidade (`communityFeed`), gravados por `postTournamentAnnouncement`
 *  (functions/src/tournament-announcements.ts) com `type: 'organizer_announcement'` — por isso
 *  não têm coleção própria. `watchCommunityFeed` descarta esse tipo de propósito (o feed da
 *  Comunidade só mostra abertura de inscrição e campeões), então a leitura por torneio fica aqui.
 *
 *  Exige o índice composto `type ASC, tournamentId ASC, createdAt DESC` (firestore.indexes.json). */

export interface TournamentAnnouncement {
  id: string;
  message: string;
  createdAt: Date | null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | undefined;
  return typeof t?.toDate === 'function' ? t.toDate() : null;
}

export async function fetchTournamentAnnouncements(db: Firestore, tournamentId: string, max = 10): Promise<TournamentAnnouncement[]> {
  if (!tournamentId) return [];
  const snap = await getDocs(
    query(
      collection(db, 'communityFeed'),
      where('type', '==', 'organizer_announcement'),
      where('tournamentId', '==', tournamentId),
      orderBy('createdAt', 'desc'),
      limit(max),
    ),
  );
  return snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      const message = str(data['message']);
      return message ? { id: d.id, message, createdAt: toDate(data['createdAt']) } : null;
    })
    .filter((a): a is TournamentAnnouncement => a != null);
}
