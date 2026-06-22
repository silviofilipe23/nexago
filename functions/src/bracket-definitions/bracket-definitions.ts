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
import {BRACKET_5_TEAMS} from "./bracket-5-teams";
import {BRACKET_6_TEAMS} from "./bracket-6-teams";
import {BRACKET_7_TEAMS} from "./bracket-7-teams";
import {BRACKET_8_TEAMS} from "./bracket-8-teams";
import {BRACKET_9_TEAMS} from "./bracket-9-teams";
import {BRACKET_10_TEAMS} from "./bracket-10-teams";
import {BRACKET_11_TEAMS} from "./bracket-11-teams";
import {BRACKET_12_TEAMS} from "./bracket-12-teams";
import {BRACKET_13_TEAMS} from "./bracket-13-teams";
import {BRACKET_14_TEAMS} from "./bracket-14-teams";
import {BRACKET_15_TEAMS} from "./bracket-15-teams";
import {BRACKET_16_TEAMS} from "./bracket-16-teams";
import {BRACKET_17_TEAMS} from "./bracket-17-teams";
import {BRACKET_18_TEAMS} from "./bracket-18-teams";
import {BRACKET_19_TEAMS} from "./bracket-19-teams";
import {BRACKET_20_TEAMS} from "./bracket-20-teams";
import {BRACKET_21_TEAMS} from "./bracket-21-teams";
import {BRACKET_22_TEAMS} from "./bracket-22-teams";
import {BRACKET_23_TEAMS} from "./bracket-23-teams";
import {BRACKET_24_TEAMS} from "./bracket-24-teams";
import {BRACKET_25_TEAMS} from "./bracket-25-teams";
import {BRACKET_26_TEAMS} from "./bracket-26-teams";
import {BRACKET_27_TEAMS} from "./bracket-27-teams";

export const BRACKET_DEFINITIONS: {[numTeams: number]: MatchDefinition[]} = {
  4: BRACKET_4_TEAMS,
  5: BRACKET_5_TEAMS,
  6: BRACKET_6_TEAMS,
  7: BRACKET_7_TEAMS,
  8: BRACKET_8_TEAMS,
  9: BRACKET_9_TEAMS,
  10: BRACKET_10_TEAMS,
  11: BRACKET_11_TEAMS,
  12: BRACKET_12_TEAMS,
  13: BRACKET_13_TEAMS,
  14: BRACKET_14_TEAMS,
  15: BRACKET_15_TEAMS,
  16: BRACKET_16_TEAMS,
  17: BRACKET_17_TEAMS,
  18: BRACKET_18_TEAMS,
  19: BRACKET_19_TEAMS,
  20: BRACKET_20_TEAMS,
  21: BRACKET_21_TEAMS,
  22: BRACKET_22_TEAMS,
  23: BRACKET_23_TEAMS,
  24: BRACKET_24_TEAMS,
  25: BRACKET_25_TEAMS,
  26: BRACKET_26_TEAMS,
  27: BRACKET_27_TEAMS,
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
