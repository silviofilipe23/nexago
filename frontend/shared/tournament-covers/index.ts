import { SPORT_CATALOG, resolveSport } from '@nexago/sports';

/**
 * Capa padrão do torneio quando o organizador não subiu nenhuma, pela arte do
 * esporte no catálogo (`sports/catalog.json`, campo `art`). Aceita qualquer
 * grafia que o catálogo conheça (`beachVolleyball`, `beach_tennis`, `VOLEI_PRAIA`).
 * O codegen recusa arte sem o arquivo em `media/`, então o caminho sempre existe.
 *
 * Os arquivos são servidos de `/media/tournament-covers/` (mesma origem, então
 * o canvas dos share cards não esbarra em CORS). A pasta `media/` daqui entra
 * em cada portal pela entrada de `assets` do `angular.json`.
 */
const COVER_DIR = '/media/tournament-covers';

/** Caminho da arte do esporte, ou `null` quando ele não tem uma. */
export function tournamentCoverArt(sport: string | null | undefined): string | null {
  const art = resolveSport(sport)?.art;
  return art ? `${COVER_DIR}/${art}.webp` : null;
}

/**
 * Capa a exibir, em três degraus: a que o organizador subiu, a arte do esporte,
 * e `null` — que o template pinta como gradiente.
 */
export function tournamentCoverOrDefault(
  coverUrl: string | null | undefined,
  sport: string | null | undefined,
): string | null {
  const uploaded = coverUrl?.trim();
  if (uploaded) return uploaded;
  return tournamentCoverArt(sport);
}

/** Esportes que hoje têm arte — usado em teste para travar o catálogo. */
export const SPORTS_WITH_COVER_ART: readonly string[] = SPORT_CATALOG.filter((s) => s.art).map((s) => s.code);
