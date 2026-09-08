import { collection, onSnapshot, query, where, type Firestore, type Unsubscribe } from 'firebase/firestore';

/** Passes de vaga (`tournamentSpotPasses`).
 *
 *  O passe é a permissão nominal que o organizador dá para UM atleta se inscrever numa
 *  categoria lotada. Aqui só se LÊ: quem grava é a Cloud Function, porque a vaga só existe de
 *  verdade quando o teto da categoria sobe — e isso acontece na mesma transação que cria a
 *  inscrição, fora do alcance do cliente. */
export const SPOT_PASSES_COLLECTION = 'tournamentSpotPasses';

/** Categorias deste torneio em que EU tenho passe vivo, ao vivo.
 *
 *  O `status` é filtrado em memória: a consulta casa por atleta e torneio (o formato que as
 *  regras conseguem verificar numa listagem), e passe usado ou revogado é raro o bastante para
 *  não valer um índice a mais. */
export function watchMySpotPassCategoryIds(
  db: Firestore,
  uid: string,
  tournamentId: string,
  onChange: (categoryIds: ReadonlySet<string>) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, SPOT_PASSES_COLLECTION),
      where('athleteUid', '==', uid),
      where('tournamentId', '==', tournamentId),
    ),
    (snap) => {
      const ids = new Set<string>();
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>;
        if (data['status'] !== 'active') continue;
        const categoryId = String(data['categoryId'] ?? '').trim();
        if (categoryId) ids.add(categoryId);
      }
      onChange(ids);
    },
    () => onError?.(),
  );
}
