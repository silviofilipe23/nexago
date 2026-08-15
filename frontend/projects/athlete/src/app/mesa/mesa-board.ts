import { isSetWon, setsWonOf, targetPointsForSet, type LiveMatch, type LiveSet } from '@nexago/live-scoring';

/** Leituras do placar que o painel mostra — puras, pra caberem em teste sem Firestore. O que
 *  ELAS não fazem é decidir placar: quem soma, fecha set e declara vencedor é o motor
 *  compartilhado (`applyPoint`), igual no app e no portal do organizador. */

export type MesaSide = 'A' | 'B';

/** Bandeira do canto do painel: o próximo ponto daquele lado fecha o set — ou a partida. */
export type MesaFlag = 'set' | 'match' | null;

export interface MesaSetPill {
  label: string;
  score: string | null;
  state: 'closed' | 'current' | 'upcoming';
}

/** Índice do set em jogo, preso ao formato (partida antiga pode trazer índice fora da faixa). */
export function currentSetIndexOf(m: Pick<LiveMatch, 'currentSetIndex' | 'bestOf'>): number {
  return Math.min(Math.max(m.currentSetIndex, 0), m.bestOf - 1);
}

export function currentSetOf(m: Pick<LiveMatch, 'sets' | 'currentSetIndex' | 'bestOf'>): { a: number; b: number } {
  const s = m.sets[currentSetIndexOf(m)];
  return { a: s?.a ?? 0, b: s?.b ?? 0 };
}

/** Placar sempre com dois dígitos, como no painel de quadra: "07", "18". */
export function scoreText(points: number): string {
  return String(Math.max(0, points)).padStart(2, '0');
}

export function flagOf(m: Pick<LiveMatch, 'sets' | 'currentSetIndex' | 'bestOf' | 'status'>, side: MesaSide): MesaFlag {
  if (m.status !== 'in_progress') return null;
  const idx = currentSetIndexOf(m);
  const { a, b } = currentSetOf(m);
  const target = targetPointsForSet(idx, m.bestOf);
  const closesSet = side === 'A' ? isSetWon(a + 1, b, target) : isSetWon(b + 1, a, target);
  if (!closesSet) return null;
  const wins = setsWonOf(m.sets, m.bestOf);
  const needed = Math.ceil(m.bestOf / 2);
  const mine = side === 'A' ? wins.a : wins.b;
  return mine + 1 >= needed ? 'match' : 'set';
}

/** Uma pilha por set do formato: os fechados com o placar, o corrente aceso, os que faltam com
 *  travessão. */
export function setPillsOf(m: Pick<LiveMatch, 'sets' | 'currentSetIndex' | 'bestOf' | 'status'>): MesaSetPill[] {
  const idx = currentSetIndexOf(m);
  return Array.from({ length: m.bestOf }, (_, i) => {
    const s: LiveSet | undefined = m.sets[i];
    const played = s != null && (s.a > 0 || s.b > 0);
    const state: MesaSetPill['state'] = i === idx && m.status === 'in_progress' ? 'current' : played ? 'closed' : 'upcoming';
    return { label: `Set ${i + 1}`, score: s ? `${s.a}–${s.b}` : null, state };
  });
}

const KNOCKOUT_LABELS: Record<string, string> = {
  final: 'Final',
  semifinal: 'Semifinal',
  quarterfinal: 'Quartas de final',
  'third place': '3º lugar',
  'third-place': '3º lugar',
};

/** "Grupo A" / "Semifinal" / "Rodada 3" — rótulo da fase a partir do doc da própria partida.
 *  A mesa abre uma partida só, sem a categoria inteira em mãos, então nada de derivar a fase
 *  pela posição na chave: o que não estiver mapeado vira "Rodada N". */
export function phaseLabelOf(m: Pick<LiveMatch, 'matchType' | 'round' | 'poolId'>): string {
  if (m.poolId.trim()) return m.poolId.trim();
  const mapped = KNOCKOUT_LABELS[m.matchType.trim().toLowerCase()];
  if (mapped) return mapped;
  return m.round > 0 ? `Rodada ${m.round}` : 'Partida';
}

/** "Quadra 2" — o doc grava tanto "2" quanto "Quadra Central". */
export function courtLabelOf(courtName: string | null): string | null {
  if (!courtName) return null;
  return /quadra/i.test(courtName) ? courtName : `Quadra ${courtName}`;
}

export function bestOfLabelOf(bestOf: number): string {
  return bestOf === 1 ? 'set único' : `melhor de ${bestOf}`;
}

/** "2º set · até 21" — o alvo muda no set decisivo de MD3. */
export function setRuleLineOf(m: Pick<LiveMatch, 'currentSetIndex' | 'bestOf'>): string {
  const idx = currentSetIndexOf(m);
  return `${idx + 1}º set · até ${targetPointsForSet(idx, m.bestOf)}`;
}
