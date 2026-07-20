/** Escada única de nível do atleta — os 5 tiers reais do backend. Espelha
 *  `AthleteProfileOptions.levelRank`/`labelForRank` (app Flutter) e `LEVEL_RANK`
 *  (`functions/src/category-level-eligibility.ts`). Toda tela do portal (listagem,
 *  ranking, equipes, perfil, elegibilidade) deve rotular nível por aqui — códigos
 *  legados (`iniciante`, `basico`, `intermediario`, `livre`) caem no degrau
 *  equivalente pra listagem e perfil nunca divergirem. */

export type AthleteLevelLabel = 'Iniciante 1' | 'Iniciante 2' | 'Intermediário 1' | 'Intermediário 2' | 'Open';

export function levelRankOf(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const v = raw
    .trim()
    .toLowerCase()
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i');
  switch (v) {
    case 'iniciante':
    case 'basico':
    case 'iniciante 1':
    case 'iniciante_1':
      return 0;
    case 'iniciante 2':
    case 'iniciante_2':
      return 1;
    case 'intermediario':
    case 'intermediario 1':
    case 'intermediario_1':
      return 2;
    case 'intermediario 2':
    case 'intermediario_2':
      return 3;
    case 'open':
    case 'livre':
      return 5;
    default:
      return null;
  }
}

/** Espelha `AthleteProfileOptions.labelForRank` (Open é rank 5; 4 não existe). */
export function levelLabelForRank(rank: number): AthleteLevelLabel {
  if (rank <= 0) return 'Iniciante 1';
  if (rank === 1) return 'Iniciante 2';
  if (rank === 2) return 'Intermediário 1';
  if (rank === 3) return 'Intermediário 2';
  return 'Open';
}

export function levelLabelOf(raw: string | null | undefined): AthleteLevelLabel | null {
  const rank = levelRankOf(raw);
  return rank == null ? null : levelLabelForRank(rank);
}
