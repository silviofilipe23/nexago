import { collection, getDocs, limit, query } from 'firebase/firestore/lite';
import { liteDb } from '../firebase-lite';
import { mapSquadAmbassador, sortAmbassadors, type SquadAmbassador } from '../squad';

/** Teto de leitura: o piloto tem 20 vagas por ciclo; folga para os próximos ciclos. */
const MAX_AMBASSADORS = 300;

/**
 * Embaixadores ativos do NexaSquad, do espelho público `squadPublic` (aberto, sem login). Propaga
 * o erro de propósito: a página distingue "ainda não tem embaixador" de "não carregou".
 */
export async function getSquadAmbassadors(): Promise<SquadAmbassador[]> {
  const snap = await getDocs(query(collection(liteDb, 'squadPublic'), limit(MAX_AMBASSADORS)));
  const list = snap.docs
    .map((d) => mapSquadAmbassador(d.id, d.data()))
    .filter((a): a is SquadAmbassador => a !== null);
  return sortAmbassadors(list);
}
