/**
 * Link/QR de embaixador do NexaSquad: `?squad=CODIGO` (QR: `&via=qr`) em qualquer página do portal.
 *
 * O clique é guardado aqui (localStorage) e gravado na conta pela callable `recordSquadAttribution`
 * assim que houver sessão — antes ou depois do login. Quem decide janela, modelo (primeiro/último
 * toque) e autoindicação é o servidor; aqui só não se reenvia o mesmo clique.
 *
 * Sem import estático do SDK: isto roda no `app.ts`, e o bundle inicial do atleta não leva
 * Functions/Firestore (ver `bundle-inicial-do-atleta`).
 */

export const SQUAD_PARAM = 'squad';
const STORAGE_KEY = 'nx.squadRef';
/** Clique guardado sem login vale por 30 dias no aparelho; a janela de verdade é do servidor. */
const LOCAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_RE = /^[A-Z0-9]{3,20}$/;

export interface PendingSquadRef {
  code: string;
  origin: 'link' | 'qr';
  at: number;
}

export function parseSquadParam(search: string, now: number): PendingSquadRef | null {
  const params = new URLSearchParams(search);
  const code = (params.get(SQUAD_PARAM) ?? '').trim().toUpperCase();
  if (!CODE_RE.test(code)) return null;
  return { code, origin: params.get('via') === 'qr' ? 'qr' : 'link', at: now };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Guarda o clique da URL atual (o mais recente vence; o servidor aplica o modelo de toque). */
export function captureSquadParam(search: string, now = Date.now()): PendingSquadRef | null {
  const ref = parseSquadParam(search, now);
  if (ref) storage()?.setItem(STORAGE_KEY, JSON.stringify(ref));
  return ref;
}

export function pendingSquadRef(now = Date.now()): PendingSquadRef | null {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const ref = JSON.parse(raw) as PendingSquadRef;
    if (typeof ref?.code !== 'string' || typeof ref.at !== 'number' || now - ref.at > LOCAL_TTL_MS) {
      clearSquadRef();
      return null;
    }
    return ref;
  } catch {
    clearSquadRef();
    return null;
  }
}

export function clearSquadRef(): void {
  storage()?.removeItem(STORAGE_KEY);
}

let flushing = false;

/**
 * Envia o clique guardado para a conta logada. Melhor esforço: rede caída mantém o clique para a
 * próxima sessão; resposta do servidor (gravou ou não) encerra o assunto.
 */
export async function flushSquadRef(): Promise<void> {
  const ref = pendingSquadRef();
  if (!ref || flushing) return;
  flushing = true;
  try {
    const [{ httpsCallable }, { athleteFunctions }] = await Promise.all([
      import('firebase/functions'),
      import('../../data/functions'),
    ]);
    await httpsCallable(athleteFunctions(), 'recordSquadAttribution')({ code: ref.code, origin: ref.origin });
    clearSquadRef();
  } catch (err) {
    // Código recusado não melhora tentando de novo; rede caída ou função ainda não publicada, sim.
    if (String((err as { code?: unknown })?.code ?? '').includes('invalid-argument')) {
      clearSquadRef();
    }
  } finally {
    flushing = false;
  }
}
