export interface BracketAdvanceSlot {
  matchNumber: number;
  teamSlot: "teamAId" | "teamBId";
}

export interface MatchDraft {
  round: number;
  matchType: string;
  poolId: string;
  teamAId: string;
  teamBId: string;
  isGroupMatch: boolean;
  matchNumber: number;
  winnerAdvance?: BracketAdvanceSlot;
  loserAdvance?: BracketAdvanceSlot;
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

  wireDoubleEliminationAdvances(matches);
  return matches;
}

function slotForIndex(index: number): "teamAId" | "teamBId" {
  return index % 2 === 0 ? "teamAId" : "teamBId";
}

function advanceTo(
  target: MatchDraft,
  teamSlot: "teamAId" | "teamBId",
): BracketAdvanceSlot {
  return {matchNumber: target.matchNumber, teamSlot};
}

/** Liga vencedores/perdedores WB/LB/Final após gerar a chave DE. */
export function wireDoubleEliminationAdvances(matches: MatchDraft[]): void {
  const finalMatch = matches.find((m) => m.matchType === "Final");
  if (!finalMatch) return;

  const wbRounds: MatchDraft[][] = [];
  const lbRounds: MatchDraft[][] = [];

  for (const match of matches) {
    if (match.matchType === "WB") {
      const idx = match.round - 1;
      if (!wbRounds[idx]) wbRounds[idx] = [];
      wbRounds[idx].push(match);
    } else if (match.matchType === "LB") {
      const idx = match.round - 1;
      if (!lbRounds[idx]) lbRounds[idx] = [];
      lbRounds[idx].push(match);
    }
  }

  for (const round of wbRounds) {
    round.sort((a, b) => a.matchNumber - b.matchNumber);
  }
  for (const round of lbRounds) {
    round.sort((a, b) => a.matchNumber - b.matchNumber);
  }

  const wbRoundCount = wbRounds.length;
  if (wbRoundCount === 0) return;

  for (let r = 0; r < wbRoundCount - 1; r++) {
    const current = wbRounds[r];
    const next = wbRounds[r + 1];
    for (let i = 0; i < current.length; i++) {
      const target = next[Math.floor(i / 2)];
      if (!target) continue;
      current[i].winnerAdvance = advanceTo(target, slotForIndex(i));
    }
  }

  const wbFinal = wbRounds[wbRoundCount - 1][0];
  if (wbFinal) {
    wbFinal.winnerAdvance = advanceTo(finalMatch, "teamAId");
    const lbFinalRound = lbRounds[lbRounds.length - 1];
    const lbFinal = lbFinalRound?.[0];
    if (lbFinal) {
      wbFinal.loserAdvance = advanceTo(lbFinal, "teamBId");
    }
  }

  const wbFirst = wbRounds[0];
  const lbFirst = lbRounds[0];
  if (wbFirst && lbFirst) {
    for (let i = 0; i < wbFirst.length; i++) {
      const target = lbFirst[Math.floor(i / 2)];
      if (!target) continue;
      wbFirst[i].loserAdvance = advanceTo(target, slotForIndex(i));
    }
  }

  for (let r = 1; r < wbRoundCount - 1; r++) {
    const wbRound = wbRounds[r];
    const lbRound = lbRounds[2 * r];
    if (!wbRound || !lbRound) continue;
    for (let i = 0; i < wbRound.length; i++) {
      const target = lbRound[Math.min(i, lbRound.length - 1)];
      if (!target) continue;
      wbRound[i].loserAdvance = advanceTo(target, "teamBId");
    }
  }

  for (let r = 0; r < lbRounds.length - 1; r++) {
    const current = lbRounds[r];
    const next = lbRounds[r + 1];
    if (!current || !next) continue;

    if (current.length === next.length) {
      for (let i = 0; i < current.length; i++) {
        current[i].winnerAdvance = advanceTo(next[i], "teamAId");
      }
      continue;
    }

    for (let i = 0; i < current.length; i++) {
      const target = next[Math.floor(i / 2)];
      if (!target) continue;
      current[i].winnerAdvance = advanceTo(target, slotForIndex(i));
    }
  }

  const lbFinalRound = lbRounds[lbRounds.length - 1];
  const lbFinal = lbFinalRound?.[0];
  if (lbFinal) {
    lbFinal.winnerAdvance = advanceTo(finalMatch, "teamBId");
  }
}
