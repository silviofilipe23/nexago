import { doc, onSnapshot, serverTimestamp, setDoc, writeBatch, type Unsubscribe } from 'firebase/firestore';
import {
  broadcastControlFromRaw,
  type BroadcastCommands,
  type BroadcastControl,
  type BroadcastFinalMode,
  type BroadcastGraphics,
  type BroadcastInterview,
  type KocRoundEndScreen,
} from './broadcast-control';
import type { BroadcastRanking } from './broadcast-ranking';
import type { BroadcastPrejogo } from './broadcast-prejogo';
import { organizerFirestore } from './firestore';
import { interviewQueueFromRaw, type InterviewQueue } from './interview-queue';

/** Mudança parcial — `setDoc` com `merge` funde mapas aninhados, então `graphics: { scoreboard:
 *  false }` não apaga as outras chaves. Só campos DEFINIDOS: o Firestore recusa `undefined`. */
export interface BroadcastControlPatch {
  courtId?: string | null;
  graphics?: Partial<BroadcastGraphics>;
  kocRoundEndScreen?: KocRoundEndScreen;
  finalMode?: BroadcastFinalMode;
  championsCategoryId?: string | null;
  summaryOn?: boolean;
  prejogo?: BroadcastPrejogo;
  ranking?: BroadcastRanking;
  interview?: BroadcastInterview | null;
  commands?: Partial<BroadcastCommands>;
}

function controlDoc(tournamentId: string) {
  return doc(organizerFirestore(), 'tournaments', tournamentId, 'broadcast', 'control');
}

/** Um doc só — o overlay fica horas no ar; nada de assinar coleção. Doc ausente = default. */
export function watchBroadcastControl(
  tournamentId: string,
  onChange: (control: BroadcastControl) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    controlDoc(tournamentId),
    (snap) => onChange(broadcastControlFromRaw(snap.exists() ? snap.data() : null)),
    (err) => onError?.(err),
  );
}

/** Escrita direta (rules: `canManageTournament`). Exceção consciente à convenção "escrita via
 *  callable": é preferência de exibição, como o `bigScreen`. */
export function saveBroadcastControl(
  tournamentId: string,
  patch: BroadcastControlPatch,
  uid: string,
): Promise<void> {
  return setDoc(
    controlDoc(tournamentId),
    { ...patch, updatedAt: serverTimestamp(), updatedBy: uid },
    { merge: true },
  );
}

function queueDoc(tournamentId: string) {
  return doc(organizerFirestore(), 'tournaments', tournamentId, 'broadcast', 'interviewQueue');
}

/** Fila de entrevistas — só o painel escuta (a rule fecha a leitura pro OBS). */
export function watchInterviewQueue(
  tournamentId: string,
  onChange: (queue: InterviewQueue) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    queueDoc(tournamentId),
    (snap) => onChange(interviewQueueFromRaw(snap.exists() ? snap.data() : null)),
    (err) => onError?.(err),
  );
}

/** A fila inteira, SEM merge: é pequena, e arrays não se fundem — substituir é o que mantém a
 *  ordem e a remoção de itens. */
function queuePayload(queue: InterviewQueue, uid: string) {
  return {
    items: queue.items,
    current: queue.current,
    questionIndex: queue.questionIndex,
    reporter: queue.reporter,
    show: queue.show,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };
}

export function saveInterviewQueue(tournamentId: string, queue: InterviewQueue, uid: string): Promise<void> {
  return setDoc(queueDoc(tournamentId), queuePayload(queue, uid));
}

/** Tarja no ar e o cursor da fila numa escrita só: "Próximo" que gravasse um e falhasse no outro
 *  deixaria o painel apontando pra um entrevistado e o ar mostrando outro. */
export function saveInterviewOnAir(
  tournamentId: string,
  interview: BroadcastInterview | null,
  queue: InterviewQueue | null,
  uid: string,
): Promise<void> {
  const batch = writeBatch(organizerFirestore());
  batch.set(controlDoc(tournamentId), { interview, updatedAt: serverTimestamp(), updatedBy: uid }, { merge: true });
  if (queue) batch.set(queueDoc(tournamentId), queuePayload(queue, uid));
  return batch.commit();
}
