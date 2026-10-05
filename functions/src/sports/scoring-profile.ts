/**
 * Perfil de placar (spec multiesporte, eixo 2). Só tipos: o catálogo gerado e
 * o núcleo de regras (`scoring.ts`) importam daqui.
 */
export type MatchBestOf = number;

export interface SetsPointsProfile {
  readonly kind: "sets_points";
  readonly bestOf: MatchBestOf;
  readonly setTarget: number;
  /** Alvo do set decisivo (o último possível); ignorado em MD1. */
  readonly decidingSetTarget: number;
  readonly winBy: number;
  /** Teto: quem chega nele vence o set mesmo sem a vantagem. `null` = sem teto. */
  readonly pointCap: number | null;
}

export interface SetsGamesProfile {
  readonly kind: "sets_games";
  readonly bestOf: MatchBestOf;
  readonly gamesPerSet: number;
  readonly winByGames: number;
  /** Placar de games em que o set vai a tie-break (6 → 6×6). `null` = set de vantagem. */
  readonly tiebreakAtGames: number | null;
  readonly tiebreakTo: number;
  readonly noAd: boolean;
  /** Set decisivo completo ou trocado por um super tie-break. */
  readonly decidingSet: "full" | "super_tiebreak";
  readonly superTiebreakTo: number;
}

export type ScoringProfile = SetsPointsProfile | SetsGamesProfile;
