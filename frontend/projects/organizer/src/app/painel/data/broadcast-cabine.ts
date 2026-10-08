/** Comentaristas — lower third de quem está no microfone (narração, comentários, repórter de quadra).
 *
 *  As pessoas (nome, função, @/descrição, foto, microfone) são CADASTRADAS no painel e moram no
 *  próprio doc `broadcast/control.comentaristas`; o overlay, público e sem login, só desenha.
 *  Mostrar/cabine/sair são DISPAROS: cada comando sobe `seq` (o overlay reage à mudança, e um
 *  `seq` velho ao carregar o OBS não repete). */

export const CABINE_PESSOAS_MAX = 4;
export const CABINE_SEG_DEFAULT = 8;

export interface CabinePessoa {
  id: string;
  /** "Narração", "Comentários", "Repórter de quadra"… texto livre. */
  role: string;
  name: string;
  /** "@rafamoura". */
  handle: string | null;
  /** "Ex-atleta · Campeã brasileira 2019". */
  desc: string | null;
  photoUrl: string | null;
  /** Microfone aberto: ponto vermelho pulsando; falso = cinza e parado. */
  mic: boolean;
}

/** `um` = a pessoa `idx`; `cabine` = as duas primeiras lado a lado; `null` = esconder. */
export type CabineModo = 'um' | 'cabine';

export interface BroadcastCabine {
  pessoas: CabinePessoa[];
  seq: number;
  modo: CabineModo | null;
  /** Índice da pessoa no modo `um` (e da seleção do painel). */
  idx: number;
  /** Segundos no ar; 0 = fica até "sair". */
  seg: number;
  at: Date | null;
}

export const DEFAULT_BROADCAST_CABINE: BroadcastCabine = { pessoas: [], seq: 0, modo: null, idx: 0, seg: CABINE_SEG_DEFAULT, at: null };

function record(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : fallback;

function pessoaFromRaw(raw: unknown): CabinePessoa | null {
  const d = record(raw);
  const id = text(d['id']);
  const name = text(d['name']);
  if (!id || !name) return null;
  return { id, role: text(d['role']) ?? '', name, handle: text(d['handle']), desc: text(d['desc']), photoUrl: text(d['photoUrl']), mic: d['mic'] !== false };
}

export function cabineFromRaw(raw: unknown): BroadcastCabine {
  const d = record(raw);
  const at = d['at'] as { toDate?: () => Date } | undefined;
  const pessoas = (Array.isArray(d['pessoas']) ? d['pessoas'] : []).map(pessoaFromRaw).filter((p): p is CabinePessoa => p !== null).slice(0, CABINE_PESSOAS_MAX);
  return {
    pessoas,
    seq: int(d['seq'], 0, 0, Number.MAX_SAFE_INTEGER),
    modo: d['modo'] === 'um' || d['modo'] === 'cabine' ? d['modo'] : null,
    idx: int(d['idx'], 0, 0, CABINE_PESSOAS_MAX - 1),
    seg: int(d['seg'], CABINE_SEG_DEFAULT, 0, 120),
    at: typeof at?.toDate === 'function' ? at.toDate() : null,
  };
}
