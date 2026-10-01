import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import {
  broadcastControlFromRaw,
  type BroadcastCommands,
  type BroadcastControl,
  type BroadcastFinalMode,
  type BroadcastGraphics,
  type BroadcastInterview,
  type KocRoundEndScreen,
} from './broadcast-control';
import { organizerFirestore } from './firestore';

/** Mudança parcial — `setDoc` com `merge` funde mapas aninhados, então `graphics: { scoreboard:
 *  false }` não apaga as outras chaves. Só campos DEFINIDOS: o Firestore recusa `undefined`. */
export interface BroadcastControlPatch {
  courtId?: string | null;
  graphics?: Partial<BroadcastGraphics>;
  kocRoundEndScreen?: KocRoundEndScreen;
  finalMode?: BroadcastFinalMode;
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
