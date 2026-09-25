/** Sync do modo "Grande final" entre overlays e o painel.
 *
 *  localStorage + BroadcastChannel: ligar num overlay (ou no botão do painel) liga nos outros
 *  da mesma origem, sem Firestore — é só staging de transmissão, não estado de jogo. */

export const OVERLAY_FINAL_CHANNEL = 'nexago-overlay-final';

export type OverlayFinalMsg = { tournamentId: string; on: boolean };

function storageKey(tournamentId: string): string {
  return `nexago.overlay.final.${tournamentId.trim()}`;
}

/** Preferência explícita, ou `null` quando ninguém mexeu (aí o overlay segue o matchType). */
export function readOverlayFinalPref(tournamentId: string): boolean | null {
  const tid = tournamentId.trim();
  if (!tid || typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(storageKey(tid));
  if (v === '1') return true;
  if (v === '0') return false;
  return null;
}

export function writeOverlayFinalPref(tournamentId: string, on: boolean): void {
  const tid = tournamentId.trim();
  if (!tid || typeof localStorage === 'undefined') return;
  localStorage.setItem(storageKey(tid), on ? '1' : '0');
  try {
    const ch = new BroadcastChannel(OVERLAY_FINAL_CHANNEL);
    ch.postMessage({ tournamentId: tid, on } satisfies OverlayFinalMsg);
    ch.close();
  } catch {
    // Safari privado / browsers sem BroadcastChannel — o storage ainda cobre abas novas.
  }
}

/** Liga o modo final e avisa os overlays abertos. */
export function turnOnOverlayFinal(tournamentId: string): void {
  writeOverlayFinalPref(tournamentId, true);
}

/** Modo final efetivo: preferência compartilhada manda; sem preferência, segue se a partida é final. */
export function overlayFinalModeOf(matchIsFinal: boolean, pref: boolean | null): boolean {
  if (pref !== null) return pref;
  return matchIsFinal;
}
