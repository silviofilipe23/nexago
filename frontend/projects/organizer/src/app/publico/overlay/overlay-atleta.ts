import type { AtletaCard, BroadcastAtleta } from '../../painel/data/broadcast-atleta';

/** Lógica pura do Card do Atleta: quando um comando deve aparecer e que blocos o card tem. */

/** Comando "velho" ao carregar o OBS (card de 12 s + folga) não repete. */
export const ATLETA_FRESCO_MS = 150_000;

export type AtletaComando = 'mostrar' | 'sair' | 'nada';

/** `visto` = último `seq` tratado (`null` = primeira leitura desta tela). */
export function atletaComandoDe(visto: number | null, c: BroadcastAtleta, nowMs: number): AtletaComando {
  if (c.seq <= 0) return 'nada';
  if (visto === null) {
    if (c.card === null) return 'nada';
    const fresco = c.at === null || nowMs - c.at.getTime() <= Math.max(ATLETA_FRESCO_MS, c.seg * 1000 + 5000);
    return fresco ? 'mostrar' : 'nada';
  }
  if (c.seq === visto) return 'nada';
  return c.card === null ? 'sair' : 'mostrar';
}

export interface AtletaColuna {
  label: string;
  valor: string;
  sub: string | null;
  laranja: boolean;
}

/** Colunas do perfil que têm dado: o que falta some (nada de "–"). */
export function atletaColunasOf(c: AtletaCard): AtletaColuna[] {
  const cols: AtletaColuna[] = [];
  if (c.city) cols.push({ label: 'Cidade', valor: c.city, sub: c.state, laranja: false });
  if (c.rankPos !== null) cols.push({ label: 'Ranking', valor: `${c.rankPos}º`, sub: c.rankPoints !== null ? `${c.rankPoints} pts` : null, laranja: true });
  if (c.games.length > 0) cols.push({ label: 'Sets no torneio', valor: `${c.setsWon}–${c.setsLost}`, sub: `${c.games.length > 1 ? 'últimos ' : ''}${c.games.length} ${c.games.length === 1 ? 'jogo' : 'jogos'}`, laranja: false });
  return cols;
}

/** "1V · 3D" do confronto direto. */
export const atletaH2hLabel = (h: NonNullable<AtletaCard['h2h']>): string => `${h.wins}V·${h.losses}D`;

/** "1V" / "3D" da sequência atual. */
export const atletaSequenciaLabel = (s: NonNullable<NonNullable<AtletaCard['season']>['streak']>): string => `${s.n}${s.kind}`;
