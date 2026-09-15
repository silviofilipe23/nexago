/**
 * Capa padrão do torneio quando o organizador não subiu nenhuma, indexada pelo
 * esporte gravado em `tournaments/{id}.sport`.
 *
 * A chave é o código camelCase do `TournamentSport` — o MESMO que o wizard do
 * app e o do portal gravam. Espelha `TournamentCoverArt` no Dart
 * (`nexago_app/lib/features/tournaments/domain/tournament_cover_art.dart`):
 * os dois têm de concordar, senão o mesmo torneio ganha capa diferente
 * dependendo de onde é visto.
 *
 * `beachTennis` não está no enum do wizard, mas aparece em torneios legados e
 * no tipo do site — tem arte porque custa zero.
 *
 * Os arquivos são servidos de `/media/tournament-covers/` (mesma origem, então
 * o canvas dos share cards não esbarra em CORS). A pasta `media/` daqui entra
 * em cada portal pela entrada de `assets` do `angular.json`.
 */
const BY_SPORT: Record<string, string> = {
  beachvolleyball: '/media/tournament-covers/volei_praia.webp',
  indoorvolleyball: '/media/tournament-covers/volei_quadra.webp',
  footvolley: '/media/tournament-covers/futevolei.webp',
  beachtennis: '/media/tournament-covers/beach_tennis.webp',
};

/** Caminho da arte do esporte, ou `null` quando ele não tem uma. */
export function tournamentCoverArt(sport: string | null | undefined): string | null {
  const code = sport?.trim().toLowerCase();
  if (!code) return null;
  return BY_SPORT[code] ?? null;
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
export const SPORTS_WITH_COVER_ART = Object.keys(BY_SPORT);
