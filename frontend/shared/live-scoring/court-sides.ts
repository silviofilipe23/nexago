import type { MatchSide } from './serving-player';

/** LADO DA QUADRA — qual dupla está à esquerda (no topo, na mesa do celular).
 *
 *  As duplas trocam de lado pela regra (a cada 7 pontos, 5 no decisivo de 15) e na virada de set,
 *  mas o árbitro manda: ele escolhe o lado na abertura do set e corrige quando precisa. A mesa
 *  grava em `courtSides` o lado que ficou valendo e o total de pontos do set naquele instante; daí
 *  em diante as trocas da regra continuam contando a partir dali. Assim a mesa do portal, a do app
 *  e o telão de LED mostram o mesmo lado sem ninguém precisar gravar a cada troca. */
export interface CourtSides {
  setIndex: number;
  leftSide: MatchSide;
  /** Pontos somados do set quando o lado foi gravado. `null` (app da 1ª versão) = lado fixo. */
  total: number | null;
}

export function courtSidesFromRaw(raw: unknown): CourtSides | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const leftSide = o['leftSide'] === 'A' || o['leftSide'] === 'B' ? o['leftSide'] : null;
  const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
  const setIndex = int(o['setIndex']);
  return leftSide && setIndex != null ? { setIndex, leftSide, total: int(o['total']) } : null;
}

const other = (s: MatchSide): MatchSide => (s === 'A' ? 'B' : 'A');

/** Dupla à esquerda no set `setIndex` (0-based) com `played` pontos somados. `interval` é o da
 *  regra de troca (`courtSwitchInterval`), `null` sem troca por pontos. Sem lado gravado neste
 *  set, deriva da regra começando com A: uma troca por virada de set + as do set. */
export function courtLeftSide(setIndex: number, played: number, interval: number | null, sides: CourtSides | null): MatchSide {
  const flips = (points: number) => (interval ? Math.floor(points / interval) : 0);
  if (sides && sides.setIndex === setIndex) {
    if (sides.total == null) return sides.leftSide;
    return (flips(played) - flips(sides.total)) % 2 !== 0 ? other(sides.leftSide) : sides.leftSide;
  }
  return (setIndex + flips(played)) % 2 === 0 ? 'A' : 'B';
}
