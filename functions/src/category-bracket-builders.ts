export interface MatchDraft {
  round: number;
  matchType: string;
  poolId: string;
  teamAId: string;
  teamBId: string;
  isGroupMatch: boolean;
  matchNumber: number;
}

export function buildGroupsKnockoutMatches(
  teamIds: string[],
  groups: Array<{id: string; teamIds: string[]}>,
): MatchDraft[] {
  const matches: MatchDraft[] = [];
  let matchNumber = 1;
  for (const group of groups) {
    const ids = group.teamIds.filter((id) => id.trim().length > 0);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        matches.push({
          round: 0,
          matchType: "group",
          poolId: group.id,
          teamAId: ids[i],
          teamBId: ids[j],
          isGroupMatch: true,
          matchNumber: matchNumber++,
        });
      }
    }
  }
  if (teamIds.length >= 4) {
    const seeds = teamIds.slice(0, 4);
    matches.push({
      round: 1,
      matchType: "knockout",
      poolId: "",
      teamAId: seeds[0],
      teamBId: seeds[3],
      isGroupMatch: false,
      matchNumber: matchNumber++,
    });
    matches.push({
      round: 1,
      matchType: "knockout",
      poolId: "",
      teamAId: seeds[1],
      teamBId: seeds[2],
      isGroupMatch: false,
      matchNumber: matchNumber++,
    });
  }
  return matches;
}

/** Gera chave WB + LB + Final (matchType alinhado ao app: WB, LB, Final). */
export function buildDoubleEliminationMatches(teamIds: string[]): MatchDraft[] {
  const matches: MatchDraft[] = [];
  const n = teamIds.length;
  if (n < 2) return matches;

  const bracketSize = 1 << Math.ceil(Math.log2(n));
  const padded = [...teamIds];
  while (padded.length < bracketSize) padded.push("");

  let matchNumber = 1;
  const wbRounds = Math.log2(bracketSize);

  let wbMatchesInRound = bracketSize / 2;
  for (let round = 1; round <= wbRounds; round++) {
    for (let i = 0; i < wbMatchesInRound; i++) {
      matches.push({
        round,
        matchType: "WB",
        poolId: "",
        teamAId: round === 1 ? (padded[i * 2] ?? "") : "",
        teamBId: round === 1 ? (padded[i * 2 + 1] ?? "") : "",
        isGroupMatch: false,
        matchNumber: matchNumber++,
      });
    }
    wbMatchesInRound = wbMatchesInRound / 2;
  }

  if (bracketSize >= 4) {
    const lbRounds = 2 * (wbRounds - 1);
    let lbMatchesInRound = bracketSize / 4;
    for (let lbRound = 1; lbRound <= lbRounds; lbRound++) {
      for (let i = 0; i < lbMatchesInRound; i++) {
        matches.push({
          round: lbRound,
          matchType: "LB",
          poolId: "",
          teamAId: "",
          teamBId: "",
          isGroupMatch: false,
          matchNumber: matchNumber++,
        });
      }
      if (lbRound % 2 === 0 && lbMatchesInRound > 1) {
        lbMatchesInRound = lbMatchesInRound / 2;
      }
    }
  }

  matches.push({
    round: 0,
    matchType: "Final",
    poolId: "",
    teamAId: "",
    teamBId: "",
    isGroupMatch: false,
    matchNumber: matchNumber++,
  });

  return matches;
}
