import { LANCE_LABEL, lanceEhDaDupla, type BroadcastLances, type LanceTipo } from '../../painel/data/broadcast-lances';
import { nomeCurtoDe } from './overlay-nome';

/** Lógica pura dos Lances: quando um disparo deve aparecer e o que a tarja mostra. */

/** Vinheta (~2,4 s) + tarja (padrão 6 s): depois disso um disparo "velho" não repete ao recarregar o OBS. */
export const LANCE_FRESCO_MS = 12_000;

export interface LanceDupla {
  nome: string;
  atletas: string[];
}

/** "Duarte / Sales" + atletas curtos; sem equipe carregada cai no rótulo. */
export function lanceDuplaOf(players: readonly string[] | null | undefined, fallback: string): LanceDupla {
  const atletas = (players ?? []).map(nomeCurtoDe).filter((p) => p !== '');
  return { nome: atletas.length > 0 ? atletas.join(' / ') : fallback, atletas };
}

/** Deve disparar? `visto` = último `seq` já tratado (`null` = primeira leitura desta tela). */
export function lanceDeveDisparar(visto: number | null, c: BroadcastLances, nowMs: number): boolean {
  if (c.seq <= 0 || c.tipo === null) return false;
  if (visto === null) return c.at === null || nowMs - c.at.getTime() <= LANCE_FRESCO_MS;
  return c.seq !== visto;
}

export interface LanceView {
  tipo: LanceTipo;
  rotulo: string;
  /** Quem fez o lance: o atleta (ou a dupla, em rally/on fire). */
  nome: string;
  /** "Duarte / Sales · Quadra 2 · Masc. B". */
  sub: string;
  count: number;
  /** "vezes" · "trocas" · "pts seguidos". */
  unidade: string;
  n: number;
  seg: number;
}

export function lanceViewOf(
  c: BroadcastLances,
  duplas: readonly [LanceDupla, LanceDupla],
  ctx: { court: string | null; category: string | null },
): LanceView | null {
  if (c.tipo === null) return null;
  const dupla = duplas[c.lado];
  const daDupla = lanceEhDaDupla(c.tipo);
  const nome = daDupla ? dupla.nome : (dupla.atletas[c.atleta] ?? dupla.nome);
  const sub = [daDupla ? null : dupla.nome, ctx.court ? `Quadra ${ctx.court}` : null, ctx.category]
    .filter((p): p is string => !!p)
    .join(' · ');
  const unidade = c.tipo === 'rally' ? 'trocas' : c.tipo === 'onfire' ? 'pts seguidos' : c.count === 1 ? 'vez no jogo' : 'vezes no jogo';
  return { tipo: c.tipo, rotulo: LANCE_LABEL[c.tipo], nome, sub, count: c.count, unidade, n: c.n, seg: c.seg };
}
