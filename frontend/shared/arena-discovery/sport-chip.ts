import type { ArenaListItem } from './arena-list-item';

/** Paridade com `ArenaSportChip` (Flutter). */
export type ArenaSportChip =
  | 'all'
  | 'beachTennis'
  | 'tennis'
  | 'padel'
  | 'beachVolleyball'
  | 'volleyball'
  | 'football';

export const ARENA_SPORT_CHIP_OPTIONS: readonly { chip: ArenaSportChip; label: string }[] = [
  { chip: 'all', label: 'Todos' },
  { chip: 'beachVolleyball', label: 'Vôlei de praia' },
  { chip: 'beachTennis', label: 'Beach tênis' },
  { chip: 'tennis', label: 'Tênis' },
  { chip: 'padel', label: 'Padel' },
  { chip: 'volleyball', label: 'Vôlei' },
  { chip: 'football', label: 'Futebol' },
];

const SPORT_LABELS = [
  'Vôlei de praia',
  'Beach tennis',
  'Vôlei indoor',
  'Tênis',
  'Padel',
  'Futebol',
  'Futevôlei',
  'Pickleball',
];

/** `courtTypes` ainda não sincronizado ou só com rótulos legados → não filtrar por esporte. */
export function arenaHasIndexedSportMetadata(arena: ArenaListItem): boolean {
  if (arena.courtTypes.length === 0) {
    return false;
  }
  for (const raw of arena.courtTypes) {
    const t = raw.toLowerCase();
    for (const label of SPORT_LABELS) {
      const key = label.toLowerCase();
      if (t.includes(key) || key.includes(t)) {
        return true;
      }
    }
  }
  return false;
}

export function arenaMatchesSportChip(arena: ArenaListItem, chip: ArenaSportChip): boolean {
  if (chip === 'all') {
    return true;
  }
  if (arena.courtTypes.length === 0) {
    return true;
  }
  if (!arenaHasIndexedSportMetadata(arena)) {
    return true;
  }
  const types = arena.courtTypes.map((t) => t.toLowerCase()).join(' ');
  const name = arena.name.toLowerCase();
  const blob = `${types} ${name}`;

  switch (chip) {
    case 'beachTennis':
      return (
        blob.includes('beach') ||
        blob.includes('praia') ||
        blob.includes('areia') ||
        blob.includes('tênis') ||
        blob.includes('tenis')
      );
    case 'beachVolleyball':
      return (
        blob.includes('beach') ||
        blob.includes('praia') ||
        blob.includes('areia') ||
        blob.includes('vôlei') ||
        blob.includes('volei') ||
        blob.includes('volleyball') ||
        blob.includes('futevôlei') ||
        blob.includes('futevolei')
      );
    case 'tennis':
      return blob.includes('tênis') || blob.includes('tenis') || blob.includes('tennis');
    case 'padel':
      return blob.includes('padel') || blob.includes('pádel') || blob.includes('pickle');
    case 'volleyball':
      return blob.includes('vôlei') || blob.includes('volleyball');
    case 'football':
      return blob.includes('futebol') || blob.includes('football');
  }
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
