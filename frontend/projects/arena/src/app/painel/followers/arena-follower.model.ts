import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';

/** Espelha `arenas/{arenaId}/followers/{userId}` (Flutter: `FavoritesService.toggleFollowArena`)
 *  — mesma feature de "favoritar arena", vista do lado do gestor. Somente leitura aqui: a
 *  escrita é sempre do próprio atleta (seguir/deixar de seguir), nunca do gestor. */

export interface ArenaFollower {
  userId: string;
  createdAt: Date | null;
}

const NEW_FOLLOWER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function arenaFollowerFromDoc(doc: QueryDocumentSnapshot): ArenaFollower {
  const d = doc.data() as Record<string, unknown>;
  return {
    userId: typeof d['userId'] === 'string' && d['userId'].trim() ? d['userId'].trim() : doc.id,
    createdAt: d['createdAt'] instanceof Timestamp ? (d['createdAt'] as Timestamp).toDate() : null,
  };
}

export function isNewFollower(follower: Pick<ArenaFollower, 'createdAt'>, now = new Date()): boolean {
  if (!follower.createdAt) return false;
  return now.getTime() - follower.createdAt.getTime() <= NEW_FOLLOWER_WINDOW_MS;
}

export function formatFollowerSince(date: Date | null): string {
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
