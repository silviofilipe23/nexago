/**
 * Gatilhos que mantêm o espelho público do Squad (`squad-public.ts`) em dia.
 *
 * Como na vitrine da Loja, o espelho é recalculado dos docs lidos AGORA, nunca do `after` do
 * evento (gatilhos não chegam em ordem). Três fontes mexem na página:
 *   - o contrato (`squadAmbassadors/{uid}`): entrar, pausar, encerrar, trocar nível ou código;
 *   - o perfil (`users/{uid}`): nome, foto, cidade, esporte, elo e privacidade;
 *   - o ranking (`athleteRankings/{uid}`): número de torneios.
 * Perfil e ranking são escritos o tempo todo e por todo atleta, então esses dois gatilhos saem
 * sem ler nada quando o que a página usa não mudou, e só tocam no espelho de quem tem contrato.
 */
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {artifactsPublicDataBase} from "./firebase-paths";
import {SQUAD_AMBASSADORS} from "./squad-commissions";
import {
  SQUAD_PUBLIC,
  buildSquadPublic,
  isPublicContract,
  publicUserPart,
  rankingTournaments,
  samePublicUserPart,
} from "./squad-public";

type Raw = Record<string, unknown>;

/**
 * Recalcula `squadPublic/{uid}`. `onlyIfAmbassador`: quem não tem contrato ativo sai com uma
 * leitura e sem escrita — é o caminho dos gatilhos de perfil e ranking, que disparam para todo
 * atleta. Só o gatilho do contrato (e o backfill) apagam o espelho de quem saiu da página.
 */
export async function syncSquadPublic(
  db: Firestore,
  uid: string,
  opts: {onlyIfAmbassador?: boolean; now?: Date} = {},
): Promise<"set" | "deleted" | "skipped"> {
  const ref = db.collection(SQUAD_PUBLIC).doc(uid);
  const contractSnap = await db.collection(SQUAD_AMBASSADORS).doc(uid).get();
  const contract = contractSnap.exists ? (contractSnap.data() as Raw) : null;
  if (!isPublicContract(contract)) {
    if (opts.onlyIfAmbassador) return "skipped";
    await ref.delete();
    return "deleted";
  }
  const [userSnap, rankingSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.doc(`${artifactsPublicDataBase()}/athleteRankings/${uid}`).get(),
  ]);
  const entry = buildSquadPublic({
    contract,
    user: userSnap.exists ? (userSnap.data() as Raw) : null,
    ranking: rankingSnap.exists ? (rankingSnap.data() as Raw) : null,
  });
  if (entry === null) {
    await ref.delete();
    return "deleted";
  }
  await ref.set({...entry, updatedAt: opts.now ?? new Date()});
  return "set";
}

function dataOf(snap: {exists: boolean; data: () => unknown} | undefined): Raw | null {
  return snap?.exists ? ((snap.data() ?? {}) as Raw) : null;
}

export const onSquadAmbassadorWrittenSyncPublic = onDocumentWritten(
  `${SQUAD_AMBASSADORS}/{uid}`,
  async (event) => {
    const result = await syncSquadPublic(getFirestore(), event.params.uid);
    logger.debug("squadPublic sync (contrato)", {uid: event.params.uid, result});
  },
);

export const onUserWrittenSyncSquadPublic = onDocumentWritten(
  "users/{uid}",
  async (event) => {
    const before = publicUserPart(dataOf(event.data?.before));
    const after = publicUserPart(dataOf(event.data?.after));
    if (samePublicUserPart(before, after)) return;
    await syncSquadPublic(getFirestore(), event.params.uid, {onlyIfAmbassador: true});
  },
);

export const onAthleteRankingWrittenSyncSquadPublic = onDocumentWritten(
  "artifacts/{appId}/public/data/athleteRankings/{uid}",
  async (event) => {
    const before = rankingTournaments(dataOf(event.data?.before));
    const after = rankingTournaments(dataOf(event.data?.after));
    if (before === after) return;
    await syncSquadPublic(getFirestore(), event.params.uid, {onlyIfAmbassador: true});
  },
);
