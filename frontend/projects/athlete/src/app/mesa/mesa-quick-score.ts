import { normalizeQuickSet, quickSetKind, setTargetLabel, type QuickSetKind, type ScoreSet, type ScoringProfile } from '@nexago/sports';

/** Linha da folha "placar por sets": o que mostrar e com que rótulo de alvo (spec multiesporte, 2b1). */
export interface QuickRow {
  index: number;
  kind: QuickSetKind;
  label: string;
}

export function quickRows(profile: ScoringProfile, sets: readonly ScoreSet[]): QuickRow[] {
  return sets.map((s, index) => ({ index, kind: quickSetKind(profile, index, s), label: setTargetLabel(profile, index) }));
}

/** Sets prontos para `submitMatchResult`: `tb` só onde a linha usa; super tie-break vira 1×0. */
export function quickPayload(profile: ScoringProfile, sets: readonly ScoreSet[]): ScoreSet[] {
  return sets.map((s, index) => normalizeQuickSet(profile, index, s));
}
