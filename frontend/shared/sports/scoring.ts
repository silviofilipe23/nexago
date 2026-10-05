/**
 * `@nexago/sports` — núcleo de regras de placar (spec multiesporte, eixo 2). A
 * MESMA lógica vive em `functions/src/sports/scoring.ts` (autoritativo) e
 * `nexago_app/lib/core/sports/scoring_rules.dart`; os casos de
 * `sports/scoring-vectors.json` provam a paridade.
 */
import type {
  MatchBestOf,
  ScoringProfile,
  SetsGamesProfile,
  SetsPointsProfile,
} from './scoring-profile';

export type {MatchBestOf, ScoringProfile, SetsGamesProfile, SetsPointsProfile} from './scoring-profile';

export interface ScoreSet {
  readonly a: number;
  readonly b: number;
  /** Tie-break do set de games (ou super tie-break do set decisivo). */
  readonly tb?: {readonly a: number; readonly b: number} | null;
}

export interface ScoreValidationIssue {
  setIndex: number | null;
  message: string;
}

type Side = 'A' | 'B';

const TIEBREAK_WIN_BY = 2;

export function normalizeBestOf(raw: unknown): MatchBestOf | null {
  const n = Number(raw);
  return n === 1 || n === 3 || n === 5 ? n : null;
}

/**
 * Regra histórica (vôlei de praia): 21, vantagem 2, decisivo 15 SÓ em MD3 — MD5
 * vai a 21 no 5º set, como sempre foi. Não normaliza `bestOf` de propósito: os
 * invólucros antigos repassam o número que receberam.
 */
export function legacyScoringProfile(bestOf: number): SetsPointsProfile {
  return {
    kind: 'sets_points',
    bestOf,
    setTarget: 21,
    decidingSetTarget: bestOf === 3 ? 15 : 21,
    winBy: 2,
    pointCap: null,
  };
}

function posInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null;
}

/** Perfil gravado no Firestore → tipado; `null` se qualquer campo estiver errado. */
export function scoringProfileFromRaw(raw: unknown): ScoringProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const bestOf = normalizeBestOf(r['bestOf']);
  if (bestOf === null) return null;
  if (r['kind'] === 'sets_points') {
    const setTarget = posInt(r['setTarget']);
    const decidingSetTarget = posInt(r['decidingSetTarget']);
    const winBy = posInt(r['winBy']);
    const pointCap = r['pointCap'] === null || r['pointCap'] === undefined ? null : posInt(r['pointCap']);
    if (setTarget === null || decidingSetTarget === null || winBy === null) return null;
    if (r['pointCap'] !== null && r['pointCap'] !== undefined && pointCap === null) return null;
    return {kind: 'sets_points', bestOf, setTarget, decidingSetTarget, winBy, pointCap};
  }
  if (r['kind'] === 'sets_games') {
    const gamesPerSet = posInt(r['gamesPerSet']);
    const winByGames = posInt(r['winByGames']);
    const tiebreakTo = posInt(r['tiebreakTo']);
    const superTiebreakTo = posInt(r['superTiebreakTo']);
    const tiebreakAtGames = r['tiebreakAtGames'] === null ? null : posInt(r['tiebreakAtGames']);
    if (gamesPerSet === null || winByGames === null || tiebreakTo === null || superTiebreakTo === null) {
      return null;
    }
    if (r['tiebreakAtGames'] !== null && tiebreakAtGames === null) return null;
    if (typeof r['noAd'] !== 'boolean') return null;
    if (r['decidingSet'] !== 'full' && r['decidingSet'] !== 'super_tiebreak') return null;
    return {
      kind: 'sets_games',
      bestOf,
      gamesPerSet,
      winByGames,
      tiebreakAtGames,
      tiebreakTo,
      noAd: r['noAd'],
      decidingSet: r['decidingSet'],
      superTiebreakTo,
    };
  }
  return null;
}

/** Perfil efetivo: o carimbado na partida; sem carimbo válido, a regra histórica com o `bestOf` do doc. */
export function scoringProfileOfMatch(match: {scoringProfile?: unknown; bestOf?: unknown}): ScoringProfile {
  return scoringProfileFromRaw(match.scoringProfile) ??
    legacyScoringProfile(normalizeBestOf(match.bestOf) ?? 3);
}

function isDecidingSet(index: number, bestOf: number): boolean {
  return bestOf > 1 && index === bestOf - 1;
}

export function isPointsSetWon(a: number, b: number, target: number, winBy: number, cap: number | null): boolean {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (cap !== null && hi === cap && hi > lo) return true;
  return hi >= target && hi - lo >= winBy;
}

export function setPointsTarget(p: SetsPointsProfile, index: number): number {
  return isDecidingSet(index, p.bestOf) ? p.decidingSetTarget : p.setTarget;
}

export function isSuperTiebreakSet(p: SetsGamesProfile, index: number): boolean {
  return p.decidingSet === 'super_tiebreak' && isDecidingSet(index, p.bestOf);
}

function gamesSetWinner(s: ScoreSet, index: number, p: SetsGamesProfile): Side | null {
  if (isSuperTiebreakSet(p, index)) {
    const tb = s.tb;
    if (!tb || !isPointsSetWon(tb.a, tb.b, p.superTiebreakTo, TIEBREAK_WIN_BY, null)) return null;
    const side: Side = tb.a > tb.b ? 'A' : 'B';
    const gamesMatch = side === 'A' ? s.a === 1 && s.b === 0 : s.a === 0 && s.b === 1;
    return gamesMatch ? side : null;
  }
  if (s.a === s.b) return null;
  const side: Side = s.a > s.b ? 'A' : 'B';
  const hi = Math.max(s.a, s.b);
  const lo = Math.min(s.a, s.b);
  const tbAt = p.tiebreakAtGames;
  if (tbAt !== null) {
    if (hi === tbAt + 1 && lo === tbAt) {
      const tb = s.tb;
      if (!tb || !isPointsSetWon(tb.a, tb.b, p.tiebreakTo, TIEBREAK_WIN_BY, null)) return null;
      return (tb.a > tb.b ? 'A' : 'B') === side ? side : null;
    }
    if (hi > tbAt + 1) return null;
  }
  return hi >= p.gamesPerSet && hi - lo >= p.winByGames ? side : null;
}

export function setWinnerSide(sets: readonly ScoreSet[], index: number, profile: ScoringProfile): Side | null {
  if (index < 0 || index >= sets.length) return null;
  const s = sets[index]!;
  if (profile.kind === 'sets_games') return gamesSetWinner(s, index, profile);
  if (!isPointsSetWon(s.a, s.b, setPointsTarget(profile, index), profile.winBy, profile.pointCap)) return null;
  return s.a > s.b ? 'A' : 'B';
}

export function setsWonBy(sets: readonly ScoreSet[], profile: ScoringProfile): {a: number; b: number} {
  let a = 0;
  let b = 0;
  for (let i = 0; i < sets.length; i++) {
    const side = setWinnerSide(sets, i, profile);
    if (side === 'A') a++;
    else if (side === 'B') b++;
  }
  return {a, b};
}

export function matchWinnerSide(sets: readonly ScoreSet[], profile: ScoringProfile): Side | null {
  const needed = Math.ceil(profile.bestOf / 2);
  const wins = setsWonBy(sets, profile);
  if (wins.a >= needed && wins.a > wins.b) return 'A';
  if (wins.b >= needed && wins.b > wins.a) return 'B';
  return null;
}

function setNotWonMessage(s: ScoreSet, index: number, profile: ScoringProfile): string {
  const label = `Set ${index + 1}`;
  if (profile.kind === 'sets_points') {
    const target = setPointsTarget(profile, index);
    const cap = profile.pointCap === null ? '' : ` (teto ${profile.pointCap})`;
    return `${label}: vitória exige ${target} pontos com vantagem de ${profile.winBy}${cap}.`;
  }
  if (isSuperTiebreakSet(profile, index)) {
    return `${label}: super tie-break até ${profile.superTiebreakTo} com vantagem de ${TIEBREAK_WIN_BY}.`;
  }
  const hi = Math.max(s.a, s.b);
  const lo = Math.min(s.a, s.b);
  const tbAt = profile.tiebreakAtGames;
  if (tbAt !== null && hi === tbAt + 1 && lo === tbAt) {
    return s.tb ?
      `${label}: tie-break até ${profile.tiebreakTo} com vantagem de ${TIEBREAK_WIN_BY}.` :
      `${label}: ${hi}-${lo} exige o placar do tie-break.`;
  }
  return `${label}: set até ${profile.gamesPerSet} games com vantagem de ${profile.winByGames}.`;
}

/**
 * Validação do placar final (lançamento rápido e fechamento da mesa). Mensagens
 * do perfil histórico idênticas às que app e portal exibem hoje.
 */
export function validateScoreSets(
  sets: readonly ScoreSet[],
  profile: ScoringProfile,
  opts: {requireMatchWinner?: boolean} = {},
): ScoreValidationIssue[] {
  if (sets.length === 0) return [{setIndex: null, message: 'Informe ao menos um set.'}];
  const issues: ScoreValidationIssue[] = [];
  if (sets.length > profile.bestOf) {
    issues.push({setIndex: null, message: `Máximo de ${profile.bestOf} sets.`});
  }
  for (let i = 0; i < sets.length; i++) {
    const s = sets[i]!;
    const label = `Set ${i + 1}`;
    if (s.a === s.b) {
      issues.push({setIndex: i, message: `${label}: não pode terminar empatado.`});
      continue;
    }
    if (s.a < 0 || s.b < 0 || s.a > 99 || s.b > 99) {
      issues.push({setIndex: i, message: `${label}: placar fora do intervalo (0–99).`});
      continue;
    }
    if (setWinnerSide(sets, i, profile) === null) {
      issues.push({setIndex: i, message: setNotWonMessage(s, i, profile)});
    }
  }
  const hasSetErrors = issues.some((x) => x.setIndex !== null);
  if ((opts.requireMatchWinner ?? true) && !hasSetErrors && matchWinnerSide(sets, profile) === null) {
    issues.push({setIndex: null, message: 'Complete o placar: nenhuma dupla venceu ainda.'});
  }
  return issues;
}

export type QuickSetKind = 'points' | 'games' | 'games_tiebreak' | 'super_tiebreak';

/**
 * Perfil efetivo numa tela de placar: o carimbado com o nº de sets da partida
 * (a mesa grava `bestOf` no doc ao trocar o formato); sem carimbo, a regra
 * histórica. Mesma precedência de `matchResultFields` no servidor.
 */
export function effectiveScoringProfile(raw: unknown, bestOf: unknown): ScoringProfile {
  const stamped = scoringProfileFromRaw(raw);
  const n = normalizeBestOf(bestOf) ?? stamped?.bestOf ?? 3;
  return stamped ? {...stamped, bestOf: n} : legacyScoringProfile(n);
}

/** Resumo das regras do perfil para cabeçalhos de placar ('set até 21 · decisivo até 15'). */
export function scoringRulesLabel(p: ScoringProfile): string {
  if (p.kind === 'sets_points') {
    const parts = [`set até ${p.setTarget}`];
    if (p.bestOf > 1) parts.push(`decisivo até ${p.decidingSetTarget}`);
    if (p.pointCap !== null) parts.push(`teto ${p.pointCap}`);
    return parts.join(' · ');
  }
  const parts = [`set até ${p.gamesPerSet} games`];
  if (p.tiebreakAtGames !== null) {
    parts.push(`tie-break a ${p.tiebreakTo} em ${p.tiebreakAtGames}-${p.tiebreakAtGames}`);
  }
  if (p.bestOf > 1 && p.decidingSet === 'super_tiebreak') parts.push(`super tie-break a ${p.superTiebreakTo}`);
  if (p.noAd) parts.push('sem vantagem');
  return parts.join(' · ');
}

/** Alvo de um set específico ('até 21', 'até 6 games', 'super tie-break até 10'). */
export function setTargetLabel(p: ScoringProfile, index: number): string {
  if (p.kind === 'sets_points') return `até ${setPointsTarget(p, index)}`;
  if (isSuperTiebreakSet(p, index)) return `super tie-break até ${p.superTiebreakTo}`;
  return `até ${p.gamesPerSet} games`;
}

/** Que campos a linha do set mostra no lançamento rápido. */
export function quickSetKind(p: ScoringProfile, index: number, set: ScoreSet): QuickSetKind {
  if (p.kind === 'sets_points') return 'points';
  if (isSuperTiebreakSet(p, index)) return 'super_tiebreak';
  const tbAt = p.tiebreakAtGames;
  const hi = Math.max(set.a, set.b);
  const lo = Math.min(set.a, set.b);
  return tbAt !== null && hi === tbAt + 1 && lo === tbAt ? 'games_tiebreak' : 'games';
}

/** Set pronto para envio: `tb` só onde a linha usa; super tie-break vira 1×0 do vencedor do tie-break. */
export function normalizeQuickSet(p: ScoringProfile, index: number, set: ScoreSet): ScoreSet {
  const kind = quickSetKind(p, index, set);
  if (kind === 'super_tiebreak') {
    const tb = {a: set.tb?.a ?? 0, b: set.tb?.b ?? 0};
    return {a: tb.a > tb.b ? 1 : 0, b: tb.b > tb.a ? 1 : 0, tb};
  }
  if (kind === 'games_tiebreak' && set.tb) return {a: set.a, b: set.b, tb: {a: set.tb.a, b: set.tb.b}};
  return {a: set.a, b: set.b};
}
