import type { BroadcastCabine, CabineModo, CabinePessoa } from '../../painel/data/broadcast-cabine';

/** Lógica pura dos Comentaristas: quando um comando deve aparecer e quem entra na tela. */

/** Comando "velho" ao carregar o OBS não repete (a tela some em `seg`; esta folga cobre o fixo). */
export const CABINE_FRESCO_MS = 60_000;

export type CabineComando = 'mostrar' | 'sair' | 'nada';

export interface CabineView {
  modo: CabineModo;
  pessoas: CabinePessoa[];
}

/** O que o comando põe no ar; `null` = nada (sem modo, ou sem a pessoa pedida). */
export function cabineViewOf(c: BroadcastCabine): CabineView | null {
  if (c.modo === 'um') {
    const p = c.pessoas[c.idx];
    return p ? { modo: 'um', pessoas: [p] } : null;
  }
  if (c.modo === 'cabine') {
    const duas = c.pessoas.slice(0, 2);
    return duas.length > 0 ? { modo: 'cabine', pessoas: duas } : null;
  }
  return null;
}

/** `visto` = último `seq` tratado (`null` = primeira leitura desta tela). */
export function cabineComandoDe(visto: number | null, c: BroadcastCabine, nowMs: number): CabineComando {
  if (c.seq <= 0) return 'nada';
  const temView = cabineViewOf(c) !== null;
  if (visto === null) {
    if (!temView) return 'nada';
    const fresco = c.at === null || nowMs - c.at.getTime() <= Math.max(CABINE_FRESCO_MS, c.seg * 1000 + 5000);
    return fresco ? 'mostrar' : 'nada';
  }
  if (c.seq === visto) return 'nada';
  return temView ? 'mostrar' : 'sair';
}

/** "@rafamoura" + descrição, separados por ponto; vazio some. */
export function cabineApoioOf(p: CabinePessoa): { handle: string | null; desc: string | null } {
  const handle = p.handle ? (p.handle.startsWith('@') ? p.handle : `@${p.handle}`) : null;
  return { handle, desc: p.desc };
}
