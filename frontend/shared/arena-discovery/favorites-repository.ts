import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';

/**
 * Segue/deixa de seguir uma arena. Espelha `FavoritesService.toggleFollowArena` (Flutter):
 * grava/apaga em paralelo `users/{userId}/favorites/{arenaId}` e `arenas/{arenaId}/followers/{userId}`.
 * Um Cloud Function (`onArenaFavoriteCreatedAwardXp`) reage à criação do doc de favorito e credita XP.
 */
export async function toggleFavoriteArena(
  db: Firestore,
  params: { userId: string; arenaId: string; isFavorite: boolean },
): Promise<void> {
  const userId = params.userId.trim();
  const arenaId = params.arenaId.trim();
  if (!userId || !arenaId) {
    return;
  }

  const favoriteRef = doc(db, 'users', userId, 'favorites', arenaId);
  const followerRef = doc(db, 'arenas', arenaId, 'followers', userId);

  const batch = writeBatch(db);
  if (params.isFavorite) {
    batch.delete(favoriteRef);
    batch.delete(followerRef);
  } else {
    batch.set(favoriteRef, { arenaId, createdAt: serverTimestamp() }, { merge: true });
    batch.set(followerRef, { userId, arenaId, createdAt: serverTimestamp() }, { merge: true });
  }
  await batch.commit();
}

/** Observa os IDs de arenas favoritas do usuário (`users/{userId}/favorites`). */
export function watchFavoriteArenaIds(
  db: Firestore,
  userId: string,
  onNext: (ids: string[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'users', userId, 'favorites'),
    (snapshot) => {
      const ids = snapshot.docs.map((d) => {
        const raw = d.data()['arenaId'];
        return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : d.id;
      });
      onNext(ids);
    },
    (err) => onError?.(err),
  );
}
