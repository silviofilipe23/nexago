import { SPORT_CATALOG as CATALOG, sportLabel } from '@nexago/sports';

export interface SportCatalogEntry {
  code: string;
  label: string;
  icon: 'ball' | 'racket' | 'running' | 'plus';
}

const ICON_BY_CODE: Readonly<Record<string, SportCatalogEntry['icon']>> = {
  TENIS: 'racket',
  BEACH_TENNIS: 'racket',
  CORRIDA: 'running',
  OUTROS: 'plus',
};

/** Ordem e rótulos do catálogo canônico (`sports/catalog.json`); o ícone é escolha desta tela. */
export const SPORT_CATALOG: readonly SportCatalogEntry[] = CATALOG.map((s) => ({
  code: s.profileCode,
  label: s.label,
  icon: ICON_BY_CODE[s.profileCode] ?? 'ball',
}));

/** Qualquer grafia conhecida → rótulo; desconhecido → title case do código; vazio → ''. */
export function sportLabelForCode(code: string): string {
  return sportLabel(code) ?? '';
}
