import { collection, getDocs, limit, onSnapshot, orderBy, query, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { arenaFollowerFromDoc, type ArenaFollower } from './arena-follower.model';

const FOLLOWERS_LIMIT = 300;

export function watchFollowers(db: Firestore, arenaId: string, onChange: (followers: ArenaFollower[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenas', arenaId, 'followers'), orderBy('createdAt', 'desc'), limit(FOLLOWERS_LIMIT)),
    (snap) => onChange(snap.docs.map(arenaFollowerFromDoc)),
    () => onChange([]),
  );
}

/** Foto única dos seguidores (sem listener) — usada pela busca de atleta ao vincular
 *  um mensalista de horário fixo, que só precisa de uma lista no momento em que abre. */
export async function fetchFollowersOnce(db: Firestore, arenaId: string): Promise<ArenaFollower[]> {
  const snap = await getDocs(
    query(collection(db, 'arenas', arenaId, 'followers'), orderBy('createdAt', 'desc'), limit(FOLLOWERS_LIMIT)),
  );
  return snap.docs.map(arenaFollowerFromDoc);
}
