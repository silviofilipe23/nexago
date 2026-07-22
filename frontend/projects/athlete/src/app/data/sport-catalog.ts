export interface SportCatalogEntry {
  code: string;
  label: string;
  icon: 'ball' | 'racket' | 'running' | 'plus';
}

/** Mesmos códigos usados pelo app Flutter (athlete_firestore_codes.dart), ordem idêntica. */
export const SPORT_CATALOG: readonly SportCatalogEntry[] = [
  { code: 'VOLEI_PRAIA', label: 'Vôlei de praia', icon: 'ball' },
  { code: 'VOLEI_QUADRA', label: 'Vôlei de quadra', icon: 'ball' },
  { code: 'FUTEBOL', label: 'Futebol', icon: 'ball' },
  { code: 'BASQUETE', label: 'Basquete', icon: 'ball' },
  { code: 'TENIS', label: 'Tênis', icon: 'racket' },
  { code: 'BEACH_TENNIS', label: 'Beach tennis', icon: 'racket' },
  { code: 'CORRIDA', label: 'Corrida', icon: 'running' },
  { code: 'OUTROS', label: 'Outros', icon: 'plus' },
];

function titleCaseCode(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Código Firestore (ex.: `VOLEI_PRAIA`) → rótulo em PT. Códigos fora do catálogo caem
 *  pra uma versão title-case do próprio código, nunca em branco/undefined. */
export function sportLabelForCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) {
    return '';
  }
  const found = SPORT_CATALOG.find((entry) => entry.code === trimmed);
  return found ? found.label : titleCaseCode(trimmed);
}
