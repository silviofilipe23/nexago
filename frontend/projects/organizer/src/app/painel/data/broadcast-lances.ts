/** Controle dos "Lances" (vinheta de tela cheia + tarja do atleta) — Monster Block, Ace, Fire Ball…
 *
 *  É um DISPARO, não um liga/desliga: cada lance mostrado incrementa `seq`; a tela reage à mudança
 *  de `seq` (e ignora um `seq` já velho ao carregar, pra recarregar o OBS não repetir o lance).
 *  A contagem por atleta no jogo vive aqui, em `contagem` (JSON, porque o `setDoc(merge)` do painel
 *  funde mapas e nunca apagaria chaves ao zerar); `count` é o número já pronto da tarja. */
export type LanceTipo = 'block' | 'ace' | 'fire' | 'dig' | 'shark' | 'rally' | 'onfire';

export const LANCE_TIPOS: readonly LanceTipo[] = ['block', 'ace', 'fire', 'dig', 'shark', 'rally', 'onfire'];

/** Nome mostrado no painel e no selo da tarja. */
export const LANCE_LABEL: Record<LanceTipo, string> = {
  block: 'Monster Block',
  ace: 'Ace',
  fire: 'Fire Ball',
  dig: 'Big Dig',
  shark: 'Shark Attack',
  rally: 'Rally Monstro',
  onfire: 'On Fire',
};

/** Rally e On Fire são da dupla (e carregam `n`); os demais são de um atleta. */
export const lanceEhDaDupla = (t: LanceTipo): boolean => t === 'rally' || t === 'onfire';

export const LANCE_SEG_DEFAULT = 6;

export interface BroadcastLances {
  /** Sobe a cada disparo; 0 = nunca disparado. */
  seq: number;
  tipo: LanceTipo | null;
  /** 0 = dupla A, 1 = dupla B. */
  lado: 0 | 1;
  /** 0|1 = atleta dentro da dupla (ignorado em rally/onfire). */
  atleta: 0 | 1;
  /** Trocas (rally) ou pontos seguidos (onfire). */
  n: number;
  /** Número da tarja: vezes do atleta no jogo, ou `n` nos lances da dupla. */
  count: number;
  /** Segundos da tarja no ar depois da vinheta; 0 = fica até esconder. */
  seg: number;
  /** Tallies por `tipo|lado|atleta`, em JSON. */
  contagem: string;
  /** Carimbo do servidor do disparo. */
  at: Date | null;
}

export const DEFAULT_BROADCAST_LANCES: BroadcastLances = {
  seq: 0,
  tipo: null,
  lado: 0,
  atleta: 0,
  n: 0,
  count: 0,
  seg: LANCE_SEG_DEFAULT,
  contagem: '{}',
  at: null,
};

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : fallback;

export function lancesFromRaw(raw: unknown): BroadcastLances {
  const d = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const at = d['at'] as { toDate?: () => Date } | undefined;
  const tipo = LANCE_TIPOS.find((t) => t === d['tipo']) ?? null;
  return {
    seq: num(d['seq'], 0, 0, Number.MAX_SAFE_INTEGER),
    tipo,
    lado: d['lado'] === 1 ? 1 : 0,
    atleta: d['atleta'] === 1 ? 1 : 0,
    n: num(d['n'], 0, 0, 999),
    count: num(d['count'], 0, 0, 999),
    seg: num(d['seg'], LANCE_SEG_DEFAULT, 0, 60),
    contagem: typeof d['contagem'] === 'string' ? d['contagem'] : '{}',
    at: typeof at?.toDate === 'function' ? at.toDate() : null,
  };
}

/** Chave do tally de um lance individual. */
export const lanceChave = (tipo: LanceTipo, lado: 0 | 1, atleta: 0 | 1): string => `${tipo}|${lado}|${atleta}`;

export function lanceContagemOf(json: string): Record<string, number> {
  try {
    const o: unknown = JSON.parse(json);
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return {};
    return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Próximo estado do disparo: sobe `seq`, soma o tally do atleta e calcula `count`. */
export function lanceDisparo(
  atual: BroadcastLances,
  q: { tipo: LanceTipo; lado: 0 | 1; atleta: 0 | 1; n?: number; seg?: number },
): Omit<BroadcastLances, 'at'> {
  const tally = lanceContagemOf(atual.contagem);
  let count: number;
  if (lanceEhDaDupla(q.tipo)) {
    count = Math.max(0, Math.trunc(q.n ?? 0));
  } else {
    const k = lanceChave(q.tipo, q.lado, q.atleta);
    tally[k] = (tally[k] ?? 0) + 1;
    count = tally[k];
  }
  return {
    seq: atual.seq + 1,
    tipo: q.tipo,
    lado: q.lado,
    atleta: lanceEhDaDupla(q.tipo) ? 0 : q.atleta,
    n: lanceEhDaDupla(q.tipo) ? count : 0,
    count,
    seg: q.seg ?? atual.seg,
    contagem: JSON.stringify(tally),
  };
}
