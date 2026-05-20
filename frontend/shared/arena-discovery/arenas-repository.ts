import {
  collection,
  doc,
  getDoc,
  getDocs,
  type Firestore,
} from 'firebase/firestore';

import { arenaListItemFromFirestore, type ArenaListItem } from './arena-list-item';

export async function fetchAllArenas(db: Firestore): Promise<ArenaListItem[]> {
  const snap = await getDocs(collection(db, 'arenas'));
  const items = snap.docs.map((d) => arenaListItemFromFirestore(d));
  items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  return items;
}

export async function fetchArenaById(
  db: Firestore,
  arenaId: string,
): Promise<ArenaListItem | null> {
  const snap = await getDoc(doc(db, 'arenas', arenaId));
  return snap.exists() ? arenaListItemFromFirestore(snap) : null;
}

export interface ArenaCourtDoc {
  id: string;
  name: string;
  data: Record<string, unknown>;
}

export async function fetchCourts(db: Firestore, arenaId: string): Promise<ArenaCourtDoc[]> {
  const snap = await getDocs(collection(db, 'arenas', arenaId, 'courts'));
  const list = snap.docs.map((d) => {
    const data = (d.data() ?? {}) as Record<string, unknown>;
    const nameRaw = typeof data['name'] === 'string' ? data['name'].trim() : '';
    const name = nameRaw.length > 0 ? nameRaw : `Quadra ${d.id}`;
    return { id: d.id, name, data };
  });
  list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  return list;
}
