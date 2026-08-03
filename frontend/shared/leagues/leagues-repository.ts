import { collection, doc, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { leagueFromDoc, type League } from './league.model';

/** Leitura de `leagues/{id}` — coleção top-level pública, escrita pelo app (Flutter) e pelo
 *  wizard do organizador web. Sem paginação: o volume por organizador é baixo (dezenas). */

export async function fetchLeague(db: Firestore, id: string): Promise<League | null> {
  const snap = await getDoc(doc(db, 'leagues', id));
  if (!snap.exists()) return null;
  return leagueFromDoc(snap.id, snap.data() as Record<string, unknown>);
}

/** Ligas de um organizador (`managerId == uid`), da temporada mais recente pra mais antiga —
 *  mesmo filtro do `OrganizerLeaguesRepository.watchManagedLeagues` (Flutter). */
export async function fetchLeaguesByManager(db: Firestore, uid: string): Promise<League[]> {
  const snap = await getDocs(query(collection(db, 'leagues'), where('managerId', '==', uid)));
  return snap.docs
    .map((d) => leagueFromDoc(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => (b.seasonStartAt?.getTime() ?? 0) - (a.seasonStartAt?.getTime() ?? 0));
}
