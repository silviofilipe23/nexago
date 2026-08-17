/**
 * Nível declarado do atleta — vocabulário canônico compartilhado entre os
 * portais web. Espelha `functions/src/category-level-eligibility.ts` (backend
 * autoritativo) e `AthleteProfileOptions` no app Flutter.
 *
 * Escada única de 7 níveis para TODOS os esportes; a fonte de escrita no
 * Firestore é sempre `users/{uid}.sportOnboarding.levelsBySport[sportCode]`
 * com os códigos de `LEVEL_CODES`. Ranks são 0..6 contíguos e a numeração é
 * fixa (gravada em `athleteRatings.levelRank` e nas rules).
 */

export type LevelCode =
  | 'iniciante_1'
  | 'iniciante_2'
  | 'intermediario_1'
  | 'intermediario_2'
  | 'avancado_1'
  | 'avancado_2'
  | 'open';

export interface LevelOption {
  code: LevelCode;
  label: string;
  description: string;
}

/** Códigos canônicos em ordem crescente de força. */
export const LEVEL_CODES: readonly LevelCode[] = [
  'iniciante_1',
  'iniciante_2',
  'intermediario_1',
  'intermediario_2',
  'avancado_1',
  'avancado_2',
  'open',
];

/** Nível padrão de um esporte recém-adicionado ao perfil. */
export const DEFAULT_LEVEL_CODE: LevelCode = 'iniciante_1';

/** Opções de seleção (mesmas descrições do onboarding do app). */
export const LEVEL_OPTIONS: readonly LevelOption[] = [
  { code: 'iniciante_1', label: 'Iniciante 1', description: 'Estou começando ou jogo pouco tempo.' },
  { code: 'iniciante_2', label: 'Iniciante 2', description: 'Já domino o básico e jogo com frequência.' },
  { code: 'intermediario_1', label: 'Intermediário 1', description: 'Jogo com regularidade e tenho boa experiência.' },
  { code: 'intermediario_2', label: 'Intermediário 2', description: 'Jogo forte, disputo torneios e vou bem neles.' },
  { code: 'avancado_1', label: 'Avançado 1', description: 'Disputo as primeiras posições nos torneios que jogo.' },
  { code: 'avancado_2', label: 'Avançado 2', description: 'Brigo por título na maioria dos torneios da região.' },
  { code: 'open', label: 'Open', description: 'Tenho alto nível amador e disputo torneios competitivos.' },
];

/** Códigos de esporte do perfil (chaves de `sportOnboarding.levelsBySport`). */
export const ATHLETE_SPORT_CODES: readonly string[] = [
  'VOLEI_PRAIA',
  'VOLEI_QUADRA',
  'BEACH_TENNIS',
  'FUTEVOLEI',
  'FUTEBOL',
  'BASQUETE',
  'TENIS',
  'CORRIDA',
  'OUTROS',
];

const SPORT_LABELS: Record<string, string> = {
  VOLEI_PRAIA: 'Vôlei de praia',
  VOLEI_QUADRA: 'Vôlei de quadra',
  BEACH_TENNIS: 'Beach tennis',
  FUTEVOLEI: 'Futevôlei',
  FUTEBOL: 'Futebol',
  BASQUETE: 'Basquete',
  TENIS: 'Tênis',
  CORRIDA: 'Corrida',
  OUTROS: 'Outros',
};

/** Código de esporte do perfil → rótulo em PT; devolve o próprio código quando
 *  desconhecido (nunca vazio). */
export function athleteSportLabel(code: string | null | undefined): string {
  const key = code?.trim().toUpperCase() ?? '';
  return SPORT_LABELS[key] ?? key;
}

/** Código/label de nível → label de exibição (legados sem sufixo inclusos —
 *  seguem aparecendo no fallback de nível global de docs antigos). */
const LEVEL_LABELS: Record<string, string> = {
  iniciante_1: 'Iniciante 1',
  iniciante_2: 'Iniciante 2',
  intermediario_1: 'Intermediário 1',
  intermediario_2: 'Intermediário 2',
  avancado_1: 'Avançado 1',
  avancado_2: 'Avançado 2',
  open: 'Open',
  // Legados (escada de 3) — exibidos como estão, sem renumerar.
  iniciante: 'Iniciante',
  basico: 'Iniciante',
  intermediario: 'Intermediário',
  livre: 'Open',
};

/** Código ou label (qualquer formato legado) → label de exibição; `''` quando
 *  ausente, o próprio valor quando desconhecido (nunca undefined). */
export function levelDisplayLabel(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return '';
  return LEVEL_LABELS[trimmed.toLowerCase()] ?? trimmed;
}

/** Espelha `LEVEL_RANK` do backend: aceita código (`intermediario_1`) e label
 *  (`Intermediário 1`), com legados aliasados pro degrau inferior do split. */
export function levelRankOf(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const v = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
    case 'avancado 1':
    case 'avancado_1':
      return 4;
    case 'avancado 2':
    case 'avancado_2':
      return 5;
    case 'open':
    case 'livre':
    case 'open / federado':
      return 6;
    default:
      return null;
  }
}

/** Label do nível para um rank unificado (mapeamento EXATO por degrau — os
 *  ranks são 0..6 contíguos, sem pulo). */
export function levelLabelForRank(rank: number): string {
  switch (rank) {
    case 0:
      return 'Iniciante 1';
    case 1:
      return 'Iniciante 2';
    case 2:
      return 'Intermediário 1';
    case 3:
      return 'Intermediário 2';
    case 4:
      return 'Avançado 1';
    case 5:
      return 'Avançado 2';
    default:
      return 'Open';
  }
}

/** Esporte do torneio (`tournaments/{id}.sport`) → código de esporte do perfil.
 *  `null` quando não há equivalente → o leitor usa o nível global legado. */
export function tournamentSportToLevelSportCode(sport: string | null | undefined): string | null {
  switch (sport?.trim().toLowerCase()) {
    case 'beachvolleyball':
      return 'VOLEI_PRAIA';
    case 'indoorvolleyball':
      return 'VOLEI_QUADRA';
    case 'footvolley':
      return 'FUTEVOLEI';
    case 'beachtennis':
      return 'BEACH_TENNIS';
    default:
      return null;
  }
}
