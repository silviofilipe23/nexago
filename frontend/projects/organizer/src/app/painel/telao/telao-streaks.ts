import { matchLiveCurrentSet, type LiveScoreFields } from '../data/live-set-display';

/** Sequência de pontos seguidos ("em chamas") derivada do stream do doc da partida — sem
 *  listener extra de `pointEvents`: se os pontos de um lado sobem e do outro não, é ponto
 *  seguido. Funciona igual pros dois escritores (mesa ponto a ponto e lançamento rápido).
 *  Limitação aceita: a TV conta a partir do que observa — recarregar a página zera a conta. */

/** Acende a partir de 3 pontos seguidos. */
export const FIRE_MIN_STREAK = 3;

export interface TeamStreak {
  /** Set (1-based) a que a contagem pertence — troca de set zera. */
  setNumber: number;
  a: number;
  b: number;
  side: 'A' | 'B' | null;
  count: number;
}

/** Próximo estado da sequência dado o snapshot novo da partida. `null` fora do ao vivo ou
 *  entre sets (sem set corrente). Undo (placar diminui) e mudança dos dois lados juntos
 *  (sync atrasado, sem ordem confiável) zeram a contagem. */
export function nextStreakOf(prev: TeamStreak | null, m: LiveScoreFields): TeamStreak | null {
  const current = matchLiveCurrentSet(m);
  if (!current) return null;
  if (!prev || prev.setNumber !== current.setNumber) {
    return { setNumber: current.setNumber, a: current.a, b: current.b, side: null, count: 0 };
  }
  const da = current.a - prev.a;
  const db = current.b - prev.b;
  if (da === 0 && db === 0) return prev;
  if (da > 0 && db === 0) {
    return { ...prev, a: current.a, b: current.b, side: 'A', count: (prev.side === 'A' ? prev.count : 0) + da };
  }
  if (db > 0 && da === 0) {
    return { ...prev, a: current.a, b: current.b, side: 'B', count: (prev.side === 'B' ? prev.count : 0) + db };
  }
  return { ...prev, a: current.a, b: current.b, side: null, count: 0 };
}

/** Intensidade da chama: 0 = apagada, 1 = ×3–4, 2 = ×5–6, 3 = ×7+ (teto). */
export function fireLevelOf(count: number): 0 | 1 | 2 | 3 {
  if (count < FIRE_MIN_STREAK) return 0;
  if (count < 5) return 1;
  if (count < 7) return 2;
  return 3;
}
