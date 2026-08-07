import {
  collection,
  doc,
  getDoc,
  getDocs,
  type Firestore,
} from 'firebase/firestore';

import { arenaListItemFromFirestore, type ArenaListItem } from './arena-list-item';

async function fetchArenas(db: Firestore): Promise<ArenaListItem[]> {
  const snap = await getDocs(collection(db, 'arenas'));
  const items = snap.docs.map((d) => arenaListItemFromFirestore(d));
  items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  return items;
}

/**
 * Arenas parceiras — as que têm quadra, preço e reserva de verdade.
 *
 * É o leitor padrão: qualquer tela que ofereça reservar, favoritar, avaliar ou
 * marcar jogo tem de usar este. Arena de pré-cadastro (`unclaimed`) não tem
 * dono nem quadra, e oferecê-la nesses fluxos leva o atleta para uma tela vazia.
 */
export async function fetchPartnerArenas(db: Firestore): Promise<ArenaListItem[]> {
  const items = await fetchArenas(db);
  return items.filter((a) => !a.isUnclaimed);
}

/**
 * Parceiras + pré-cadastradas. Só a busca do atleta usa: é lá que o
 * pré-cadastro existe para ser descoberto e receber o clique de contato.
 */
export async function fetchArenasIncludingUnclaimed(db: Firestore): Promise<ArenaListItem[]> {
  return fetchArenas(db);
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
