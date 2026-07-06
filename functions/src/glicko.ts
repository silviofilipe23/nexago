/**
 * Glicko-2 puro (sem Firestore) — http://www.glicko.net/glicko/glicko2.pdf
 *
 * Convenções da engine de rating:
 * - Cada partida é tratada como um rating period próprio (modelo streaming,
 *   como o Lichess), então [updateRating] normalmente recebe UM oponente — o
 *   jogador composto da dupla adversária ([compositeTeamRating]).
 * - Escala pública (1500/350) na entrada e na saída; a escala interna
 *   (μ/φ) fica encapsulada aqui.
 */

export interface GlickoRating {
  rating: number;
  rd: number;
  volatility: number;
}

export interface GlickoOpponent {
  rating: number;
  rd: number;
  /** 1 vitória, 0 derrota (0.5 reservado para empate; não usado no v1). */
  score: number;
}

export interface GlickoOptions {
  /** Restringe a variação da volatilidade (paper sugere 0.3–1.2). */
  tau: number;
  /** Piso do RD pós-atualização (evita rating "congelado"). */
  minRd: number;
  /** Teto do RD (incerteza máxima). */
  maxRd: number;
}

export const DEFAULT_GLICKO_OPTIONS: GlickoOptions = {
  tau: 0.5,
  minRd: 60,
  maxRd: 350,
};

/** Fator de conversão entre a escala pública e a escala Glicko-2 (μ/φ). */
const SCALE = 173.7178;
const BASE_RATING = 1500;
const CONVERGENCE_TOLERANCE = 1e-6;

function toMu(rating: number): number {
  return (rating - BASE_RATING) / SCALE;
}

function toPhi(rd: number): number {
  return rd / SCALE;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Nova volatilidade σ' pelo algoritmo Illinois (passo 5 do paper).
 */
function nextVolatility(
  phi: number,
  volatility: number,
  variance: number,
  delta: number,
  tau: number,
): number {
  const a = Math.log(volatility * volatility);
  const phi2 = phi * phi;
  const delta2 = delta * delta;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta2 - phi2 - variance - ex);
    const den = 2 * (phi2 + variance + ex) ** 2;
    return num / den - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta2 > phi2 + variance) {
    B = Math.log(delta2 - phi2 - variance);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > CONVERGENCE_TOLERANCE) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

/**
 * Atualiza o rating do jogador após enfrentar [opponents] num rating period.
 * Sem partidas, devolve o jogador inalterado (a inflação por inatividade é
 * tratada à parte por [inflateRd]).
 */
export function updateRating(
  player: GlickoRating,
  opponents: GlickoOpponent[],
  options: GlickoOptions = DEFAULT_GLICKO_OPTIONS,
): GlickoRating {
  if (opponents.length === 0) return player;

  const mu = toMu(player.rating);
  const phi = toPhi(player.rd);

  let varianceInv = 0;
  let deltaSum = 0;
  for (const opp of opponents) {
    const muJ = toMu(opp.rating);
    const phiJ = toPhi(opp.rd);
    const gJ = g(phiJ);
    const e = expectedScore(mu, muJ, phiJ);
    varianceInv += gJ * gJ * e * (1 - e);
    deltaSum += gJ * (opp.score - e);
  }
  const variance = 1 / varianceInv;
  const delta = variance * deltaSum;

  const newVolatility = nextVolatility(
    phi,
    player.volatility,
    variance,
    delta,
    options.tau,
  );

  const phiStar = Math.sqrt(phi * phi + newVolatility * newVolatility);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / variance);
  const newMu = mu + newPhi * newPhi * deltaSum;

  const newRd = Math.min(
    options.maxRd,
    Math.max(options.minRd, newPhi * SCALE),
  );
  return {
    rating: newMu * SCALE + BASE_RATING,
    rd: newRd,
    volatility: newVolatility,
  };
}

/**
 * Jogador composto de uma dupla: rating = média do par; RD combina as
 * incertezas (`sqrt((rd1²+rd2²)/2)`), ficando entre a média e o maior RD.
 * Para um jogador só (individual/dupla incompleta), devolve o próprio.
 */
export function compositeTeamRating(
  members: Array<{rating: number; rd: number}>,
): {rating: number; rd: number} {
  if (members.length === 0) {
    return {rating: BASE_RATING, rd: DEFAULT_GLICKO_OPTIONS.maxRd};
  }
  const rating =
    members.reduce((sum, m) => sum + m.rating, 0) / members.length;
  const rd = Math.sqrt(
    members.reduce((sum, m) => sum + m.rd * m.rd, 0) / members.length,
  );
  return {rating, rd};
}

/**
 * Inflação linear de RD por inatividade (config `inactivityRdPerWeek`),
 * limitada a [maxRd]. Semanas negativas/NaN não alteram nada.
 */
export function inflateRd(
  rd: number,
  weeksInactive: number,
  rdPerWeek: number,
  maxRd: number,
): number {
  if (!Number.isFinite(weeksInactive) || weeksInactive <= 0) return rd;
  return Math.min(maxRd, rd + weeksInactive * rdPerWeek);
}
