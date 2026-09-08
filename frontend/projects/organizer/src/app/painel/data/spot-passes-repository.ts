import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { organizerFirestore } from './firestore';

/** Passes de vaga do torneio (`tournamentSpotPasses`) — leitura ao vivo para a lista do painel.
 *
 *  O passe é a permissão nominal que o organizador dá para UM atleta se inscrever numa
 *  categoria lotada. O painel só LÊ: liberar e revogar passam por Cloud Function, porque a vaga
 *  só existe de verdade quando o teto da categoria sobe — e isso acontece na mesma transação
 *  que cria a inscrição do atleta. */

export type SpotPassStatus = 'active' | 'used' | 'revoked' | 'expired';

export interface TournamentSpotPass {
  id: string;
  categoryId: string;
  categoryLabel: string;
  athleteUid: string;
  athleteName: string;
  status: SpotPassStatus;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function statusOf(raw: unknown): SpotPassStatus {
  const value = str(raw);
  return value === 'used' || value === 'revoked' || value === 'expired' ? value : 'active';
}

export function watchTournamentSpotPasses(
  tournamentId: string,
  onChange: (passes: TournamentSpotPass[]) => void,
  onError?: () => void,
): Unsubscribe {
  const db = organizerFirestore();
  return onSnapshot(
    query(collection(db, 'tournamentSpotPasses'), where('tournamentId', '==', tournamentId)),
    (snap) => {
      const passes = snap.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          categoryId: str(data['categoryId']),
          categoryLabel: str(data['categoryLabel']),
          athleteUid: str(data['athleteUid']),
          athleteName: str(data['athleteName']) || 'Atleta',
          status: statusOf(data['status']),
        };
      });
      onChange(passes);
    },
    () => onError?.(),
  );
}
