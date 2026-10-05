import { resolveSport, SPORT_CATALOG } from '@nexago/sports';

import type { ArenaListItem } from './arena-list-item';

/** Paridade com `ArenaSportChip` (Flutter). */
export type ArenaSportChip =
  | 'all'
  | 'beachTennis'
  | 'tennis'
  | 'padel'
  | 'beachVolleyball'
  | 'volleyball'
  | 'football'
  | 'footvolley';

export const ARENA_SPORT_CHIP_OPTIONS: readonly { chip: ArenaSportChip; label: string }[] = [
  { chip: 'all', label: 'Todos' },
  { chip: 'beachVolleyball', label: 'Vôlei de praia' },
  { chip: 'beachTennis', label: 'Beach tênis' },
  { chip: 'tennis', label: 'Tênis' },
  { chip: 'padel', label: 'Padel' },
  { chip: 'volleyball', label: 'Vôlei de quadra' },
  { chip: 'football', label: 'Futebol' },
  { chip: 'footvolley', label: 'Futevôlei' },
];

/** Chip → código do esporte no catálogo (`@nexago/sports`). `volleyball` é o vôlei de quadra. */
const CHIP_SPORT_CODE: Record<Exclude<ArenaSportChip, 'all'>, string> = {
  beachVolleyball: 'beachVolleyball',
  beachTennis: 'beachTennis',
  tennis: 'tennis',
  padel: 'padel',
  volleyball: 'indoorVolleyball',
  football: 'football',
  footvolley: 'footvolley',
};

/** Código do catálogo de um chip (`null` para `all`). */
export function arenaSportChipCode(chip: ArenaSportChip): string | null {
  return chip === 'all' ? null : CHIP_SPORT_CODE[chip];
}

/** Códigos de esporte das quadras da arena — rótulo legado ("Beach tennis") ou código
 *  (`beachTennis`) resolvem igual pelo catálogo. Superfície ("Areia") e esporte fora do catálogo
 *  ("Pickleball") não entram. Sem repetição, na ordem gravada. */
export function arenaSportCodes(courtTypes: readonly string[]): string[] {
  const codes: string[] = [];
  for (const raw of courtTypes) {
    const code = resolveSport(raw)?.code;
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

/** Rótulo de UM valor de quadra para exibição: do catálogo quando é esporte conhecido; senão o
 *  valor cru (superfície, esporte fora do catálogo). Vazio → vazio. */
export function courtSportLabel(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  return resolveSport(value)?.label ?? value;
}

/** Uma opção de esporte no cadastro de quadra / perfil da arena: `value` vai para o Firestore,
 *  `label` é o que o dono vê. */
export interface CourtSportOption {
  readonly value: string;
  readonly label: string;
}

/** Esportes oferecidos no cadastro de quadra (multiesporte fase 5b): os do catálogo com
 *  `arenaCourtTypes`, gravados como CÓDIGO, mais "Pickleball", que ainda não está no catálogo e
 *  segue como texto. Espelha `kCourtSportOptions` do app. */
export const COURT_SPORT_OPTIONS: readonly CourtSportOption[] = [
  ...SPORT_CATALOG.filter((e) => e.arenaCourtTypes.length > 0).map((e) => ({ value: e.code, label: e.label })),
  { value: 'Pickleball', label: 'Pickleball' },
];

/** Rótulo de um valor gravado para o chip do formulário. */
export function courtSportOptionLabel(value: string): string {
  return COURT_SPORT_OPTIONS.find((o) => o.value === value)?.label ?? courtSportLabel(value);
}

/** Valores (rótulo legado ou código) → o que se GRAVA a partir da fase 5b: o código do esporte;
 *  valor fora do catálogo (superfície, pickleball) segue cru. Sem repetição, na ordem. Espelha
 *  `courtTypeCodesFor` do app. */
export function courtTypeCodesFor(stored: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of stored) {
    const value = raw.trim();
    if (!value) continue;
    const code = resolveSport(value)?.code ?? value;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/** Esporte de UM doc de quadra para exibição: `sport` (gravado a partir da 5b) → `courtType`
 *  (site legado) → `types[0]` → `type`, resolvido pelo catálogo. Sem nada: "Esporte não informado". */
export function courtDocSportLabel(data: Record<string, unknown>): string {
  const types = data['types'];
  const candidates = [data['sport'], data['courtType'], Array.isArray(types) ? types[0] : null, data['type']];
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) return courtSportLabel(raw);
  }
  return 'Esporte não informado';
}

/** Rótulos das quadras da arena para pills/linhas: código + rótulo do mesmo esporte viram um só. */
export function arenaSportLabels(courtTypes: readonly string[]): string[] {
  const labels: string[] = [];
  for (const raw of courtTypes) {
    const label = courtSportLabel(raw);
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

/** Arena sem nenhum esporte reconhecido (`courtTypes` vazio, só superfície, só esporte fora do
 *  catálogo) → não filtrar por esporte. */
export function arenaHasIndexedSportMetadata(arena: ArenaListItem): boolean {
  return arenaSportCodes(arena.courtTypes).length > 0;
}

/** Casamento EXATO pelo código do esporte (multiesporte fase 5a) — nada de substring nem do nome
 *  da arena: beach tennis não aparece mais no chip de vôlei de praia por ter "praia" no texto. */
export function arenaMatchesSportChip(arena: ArenaListItem, chip: ArenaSportChip): boolean {
  if (chip === 'all') {
    return true;
  }
  const codes = arenaSportCodes(arena.courtTypes);
  if (codes.length === 0) {
    return true;
  }
  return codes.includes(CHIP_SPORT_CODE[chip]);
}

function sportChipFromLabel(raw: string): ArenaSportChip | null {
  const v = raw.toLowerCase();
  if (!v) {
    return null;
  }
  if (
    v.includes('vôlei de praia') ||
    v.includes('volei de praia') ||
    v.includes('beach_volleyball') ||
    v.includes('volei_praia')
  ) {
    return 'beachVolleyball';
  }
  if (v.includes('futevôlei') || v.includes('futevolei') || v.includes('footvolley')) {
    return 'footvolley';
  }
  if (v.includes('beach') && (v.includes('tênis') || v.includes('tenis') || v.includes('tennis'))) {
    return 'beachTennis';
  }
  if (v.includes('vôlei') || v.includes('volei') || v.includes('volleyball')) {
    return v.includes('praia') || v.includes('beach') ? 'beachVolleyball' : 'volleyball';
  }
  if (v.includes('padel') || v.includes('pádel')) {
    return 'padel';
  }
  if (v.includes('tênis') || v.includes('tenis')) {
    return 'tennis';
  }
  if (v.includes('futebol') || v.includes('football')) {
    return 'football';
  }
  if (v.includes('beach') || v.includes('praia')) {
    return 'beachVolleyball';
  }
  return null;
}

/** Paridade com `defaultSportChipFromProfile` (Flutter) — mapeia `primarySport`/`sport` do perfil. */
export function defaultSportChipFromProfile(params: {
  primarySport?: string | null;
  sport?: string | null;
}): ArenaSportChip {
  const firestoreValue = (params.primarySport ?? '').trim().toUpperCase();
  if (firestoreValue) {
    switch (firestoreValue) {
      case 'VOLEI_PRAIA':
      case 'BEACH_VOLLEYBALL':
        return 'beachVolleyball';
      case 'VOLEI_QUADRA':
      case 'INDOOR_VOLLEYBALL':
        return 'volleyball';
      case 'BEACH_TENNIS':
        return 'beachTennis';
      case 'TENIS':
        return 'tennis';
      case 'PADEL':
        return 'padel';
      case 'FUTEVOLEI':
        return 'footvolley';
      case 'FUTEBOL':
      case 'FOOTBALL':
        return 'football';
      default:
        return (
          sportChipFromLabel(params.sport ?? params.primarySport ?? '') ?? 'beachVolleyball'
        );
    }
  }
  return sportChipFromLabel(params.sport ?? '') ?? 'beachVolleyball';
}

/** Chip da UI → código Firestore (`AthleteFirestoreCodes` / onboarding). `null` = sem pré-filtro
 *  no backend (só "todos"). */
export function sportFirestoreIdFromChip(chip: ArenaSportChip): string | null {
  switch (chip) {
    case 'beachVolleyball':
      return 'VOLEI_PRAIA';
    case 'volleyball':
      return 'VOLEI_QUADRA';
    case 'beachTennis':
      return 'BEACH_TENNIS';
    case 'tennis':
      return 'TENIS';
    case 'football':
      return 'FUTEBOL';
    case 'padel':
      return 'PADEL';
    case 'footvolley':
      return 'FUTEVOLEI';
    case 'all':
      return null;
  }
}
