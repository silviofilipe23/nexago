/**
 * Plantas declarativas de chaves de dupla eliminação.
 *
 * Cada arquivo `bracket-N-teams.ts` descreve TODAS as partidas de um torneio
 * com N equipes. O runtime não calcula a chave — ele lê a definição e
 * materializa os documentos no Firestore (ver `buildMatchesFromDefinition`).
 */

export type MatchInputSource =
  | {type: "SEED"; seed: number} // time do seeding (1, 2, 3…)
  | {type: "WINNER"; matchNumber: number} // vencedor da partida #N
  | {type: "LOSER"; matchNumber: number} // perdedor da partida #N
  | {type: "BYE"}; // posição ocupada por um Bye

export type BracketName = "WB" | "LB" | "FINAL" | "THIRD_PLACE";

export interface MatchDefinition {
  matchNumber: number; // ID lógico estável (#1, #2…)
  bracket: BracketName;
  round: number; // rodada dentro do bracket
  teamA: MatchInputSource;
  teamB: MatchInputSource;
}

import {BRACKET_4_TEAMS} from "./bracket-4-teams";

export const BRACKET_DEFINITIONS: {[numTeams: number]: MatchDefinition[]} = {
  4: BRACKET_4_TEAMS,
};

/** Mapeia o bracket da definição para o `matchType` usado no app/Firestore. */
export function bracketToMatchType(bracket: BracketName): string {
  switch (bracket) {
    case "WB":
      return "WB";
    case "LB":
      return "LB";
    case "FINAL":
      return "Final";
    case "THIRD_PLACE":
      return "Third Place";
  }
}

/**
 * Valida uma definição de chave. Lança `Error` com mensagem clara quando algo
 * impede a materialização: matchNumbers duplicados, referência a partida
 * inexistente, ou um vencedor/perdedor referenciado por mais de uma partida
 * (cada partida tem apenas UM destino de vencedor e UM de perdedor).
 */
export function validateBracketDefinition(def: MatchDefinition[]): void {
  const numbers = new Set<number>();
  for (const m of def) {
    if (numbers.has(m.matchNumber)) {
      throw new Error(`matchNumber duplicado: #${m.matchNumber}`);
    }
    numbers.add(m.matchNumber);
  }

  const winnerTargets = new Map<number, number>(); // sourceMatch -> destino
  const loserTargets = new Map<number, number>();

  const checkSource = (
    src: MatchInputSource,
    destMatch: number,
  ): void => {
    if (src.type === "SEED" || src.type === "BYE") return;
    if (!numbers.has(src.matchNumber)) {
      throw new Error(
        `#${destMatch} referencia partida inexistente #${src.matchNumber}`,
      );
    }
    const targets = src.type === "WINNER" ? winnerTargets : loserTargets;
    const existing = targets.get(src.matchNumber);
    if (existing !== undefined && existing !== destMatch) {
      throw new Error(
        `${src.type}(#${src.matchNumber}) referenciado por #${existing} e ` +
          `#${destMatch}: cada partida tem apenas um destino de ` +
          `${src.type === "WINNER" ? "vencedor" : "perdedor"}.`,
      );
    }
    targets.set(src.matchNumber, destMatch);
  };

  for (const m of def) {
    checkSource(m.teamA, m.matchNumber);
    checkSource(m.teamB, m.matchNumber);
  }

  if (!def.some((m) => m.bracket === "FINAL")) {
    throw new Error("Definição sem partida FINAL.");
  }
}
