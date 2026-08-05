import { collection, doc, getCountFromServer, getDoc, serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore';

/**
 * Seguir / deixar de seguir atletas — espelho exato de `AthleteFollowService`
 * (`nexago_app/lib/features/athlete/data/athlete_follow_service.dart`).
 *
 * O follow vive em DOIS docs espelhados, escritos no mesmo batch:
 * - `users/{athleteId}/followers/{followerId}` — quem segue o atleta
 * - `users/{followerId}/following/{athleteId}` — quem o seguidor segue
 *
 * As regras (`firestore.rules`) já existiam pro app: só o próprio seguidor escreve os dois lados
 * e ninguém segue a si mesmo. Nenhuma Cloud Function no meio — não há contador materializado,
 * o total sai de um `count()` na subcoleção.
 */

export interface FollowWrite {
  /** Segmentos do path do doc, na ordem de `doc(db, ...segments)`. */
  path: readonly string[];
  /** Ausente quando a operação é delete (deixar de seguir). */
  data: { followedAt: 'serverTimestamp'; userId: string } | null;
}

/** Os dois lados da escrita. Puro de propósito: é aqui que mora o invariante "os espelhos nunca
 *  divergem", e é isso que o teste tranca. */
export function buildFollowWrites(followerId: string, athleteId: string, follow: boolean): FollowWrite[] {
  const follower = followerId.trim();
  const athlete = athleteId.trim();
  if (!follower || !athlete || follower === athlete) return [];

  const followerSide = ['users', athlete, 'followers', follower] as const;
  const followingSide = ['users', follower, 'following', athlete] as const;
  if (!follow) {
    return [
      { path: followerSide, data: null },
      { path: followingSide, data: null },
    ];
  }
  return [
    { path: followerSide, data: { followedAt: 'serverTimestamp', userId: follower } },
    { path: followingSide, data: { followedAt: 'serverTimestamp', userId: athlete } },
  ];
}

/** Aplica o par de escritas num batch só (segue ou deixa de seguir). No-op em auto-follow. */
export async function setFollowing(db: Firestore, followerId: string, athleteId: string, follow: boolean): Promise<void> {
  const writes = buildFollowWrites(followerId, athleteId, follow);
  if (writes.length === 0) return;

  const batch = writeBatch(db);
  for (const write of writes) {
    const [first, ...rest] = write.path;
    const ref = doc(db, first!, ...rest);
    if (write.data) {
      batch.set(ref, { followedAt: serverTimestamp(), userId: write.data.userId }, { merge: true });
    } else {
      batch.delete(ref);
    }
  }
  await batch.commit();
}

/** O viewer segue este atleta? Lê o lado `following` do PRÓPRIO viewer — o outro lado
 *  (`followers` do atleta) daria o mesmo, mas ler o próprio doc é o que as regras garantem. */
export async function fetchIsFollowing(db: Firestore, followerId: string, athleteId: string): Promise<boolean> {
  const follower = followerId.trim();
  const athlete = athleteId.trim();
  if (!follower || !athlete || follower === athlete) return false;
  const snap = await getDoc(doc(db, 'users', follower, 'following', athlete));
  return snap.exists();
}

/** Total de seguidores via agregação (não baixa a subcoleção inteira como o app faz). */
export async function fetchFollowersCount(db: Firestore, athleteId: string): Promise<number> {
  const athlete = athleteId.trim();
  if (!athlete) return 0;
  const snap = await getCountFromServer(collection(db, 'users', athlete, 'followers'));
  return snap.data().count;
}
