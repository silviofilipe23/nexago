import {MatchDefinition, MatchInputSource} from "./bracket-definitions";
import {BRACKET_32_TEAMS} from "./bracket-32-teams";

/**
 * Plantas de 28 a 31 duplas — a de 32 com bye para os cabeças que sobram.
 *
 * O dono não tem tabela impressa destes tamanhos (a de 32 é transcrição de uma
 * tabela real; estas não). Então em vez de quatro arquivos literais, que
 * copiariam a fiação da de 32 e silenciosamente divergiriam dela na primeira
 * vez que alguém a ajustasse — a entrada cruzada da LB, por exemplo, entrou em
 * 14/09/2026 e teria de ser replicada à mão em quatro lugares —, estas saem
 * POR DERIVAÇÃO. É a mesma chave, com menos duplas.
 *
 * Como o bye entra: com N duplas faltam 32-N complementos, e quem fica sem
 * adversário na estreia são os 32-N primeiros do ranking (a semeadura da de 32
 * casa o cabeça K com o 33-K, então tirar as últimas cabeças de chave libera
 * exatamente as primeiras). Para cada um deles:
 *
 *  - a estreia some, e quem recebia o VENCEDOR dela passa a receber o seed;
 *  - a partida da chave de perdedores que receberia o PERDEDOR dela some
 *    também — ficaria com uma dupla só dentro —, e quem recebia o vencedor
 *    DESSA passa a receber direto a outra dupla que entrava nela.
 *
 * Sobra `2N-2` partidas, ninguém é eliminado com uma derrota só, e a semeadura
 * do dono continua de pé: as âncoras (1º na #1, 2º na #16, 3º na #9, 4º na #8)
 * e a soma 33 são consequência de tirar o complemento, não de uma regra nova.
 *
 * As garantias todas — incluindo o primeiro reencontro possível, que fica em
 * 87-88% do torneio, contra 56-73% da família de 17 a 27 — estão travadas em
 * `bracket-definitions.test.ts`.
 */
export function bracketFromThirtyTwoWithByes(numTeams: number): MatchDefinition[] {
  if (numTeams < 28 || numTeams > 31) {
    throw new Error(`bracketFromThirtyTwoWithByes só cobre 28 a 31, não ${numTeams}`);
  }

  const mesmaFonte = (a: MatchInputSource, b: MatchInputSource): boolean =>
    a.type === b.type && "matchNumber" in a && "matchNumber" in b && a.matchNumber === b.matchNumber;

  let matches: MatchDefinition[] = BRACKET_32_TEAMS.map((m) => ({...m}));

  const substitui = (alvo: MatchInputSource, nova: MatchInputSource) => {
    matches = matches.map((m) => ({
      ...m,
      teamA: mesmaFonte(m.teamA, alvo) ? nova : m.teamA,
      teamB: mesmaFonte(m.teamB, alvo) ? nova : m.teamB,
    }));
  };

  for (let seed = 1; seed <= 32 - numTeams; seed++) {
    const estreia = matches.find((m) =>
      [m.teamA, m.teamB].some((src) => src.type === "SEED" && src.seed === seed),
    );
    if (!estreia) throw new Error(`seed ${seed} não tem estreia na planta de 32`);

    const entrada = matches.find((m) =>
      [m.teamA, m.teamB].some(
        (src) => src.type === "LOSER" && src.matchNumber === estreia.matchNumber,
      ),
    );
    if (!entrada) throw new Error(`perdedor da #${estreia.matchNumber} não desce pra LB`);
    const sobrevivente =
      entrada.teamA.type === "LOSER" && entrada.teamA.matchNumber === estreia.matchNumber ?
        entrada.teamB :
        entrada.teamA;

    substitui({type: "WINNER", matchNumber: estreia.matchNumber}, {type: "SEED", seed});
    substitui({type: "WINNER", matchNumber: entrada.matchNumber}, sobrevivente);
    matches = matches.filter(
      (m) => m.matchNumber !== estreia.matchNumber && m.matchNumber !== entrada.matchNumber,
    );
  }

  // Renumera na ordem original: `matchNumber` é ID lógico contíguo e a FINAL
  // precisa continuar sendo o último número (o validador exige).
  const ordenadas = [...matches].sort((a, b) => a.matchNumber - b.matchNumber);
  const novoNumero = new Map(ordenadas.map((m, i) => [m.matchNumber, i + 1]));
  const renumera = (src: MatchInputSource): MatchInputSource =>
    "matchNumber" in src ? {...src, matchNumber: novoNumero.get(src.matchNumber)!} : src;

  return ordenadas.map((m) => ({
    ...m,
    matchNumber: novoNumero.get(m.matchNumber)!,
    teamA: renumera(m.teamA),
    teamB: renumera(m.teamB),
  }));
}

export const BRACKET_28_TEAMS: MatchDefinition[] = bracketFromThirtyTwoWithByes(28);
export const BRACKET_29_TEAMS: MatchDefinition[] = bracketFromThirtyTwoWithByes(29);
export const BRACKET_30_TEAMS: MatchDefinition[] = bracketFromThirtyTwoWithByes(30);
export const BRACKET_31_TEAMS: MatchDefinition[] = bracketFromThirtyTwoWithByes(31);
