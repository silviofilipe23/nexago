import { collection, limit, onSnapshot, orderBy, query, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { arenaFollowerFromDoc, type ArenaFollower } from './arena-follower.model';

const FOLLOWERS_LIMIT = 300;

export function watchFollowers(db: Firestore, arenaId: string, onChange: (followers: ArenaFollower[]) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'arenas', arenaId, 'followers'), orderBy('createdAt', 'desc'), limit(FOLLOWERS_LIMIT)),
    (snap) => onChange(snap.docs.map(arenaFollowerFromDoc)),
    () => onChange([]),
  );
}
