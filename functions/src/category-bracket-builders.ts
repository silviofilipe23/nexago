export interface BracketAdvanceSlot {
  matchNumber: number;
  teamSlot: "teamAId" | "teamBId";
}

export interface QualifierSlot {
  poolId: string;
  place: number;
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
  teamAQualifier?: QualifierSlot;
  teamBQualifier?: QualifierSlot;
  teamADescription?: string;
  teamBDescription?: string;
}

export function qualifierSlotDescription(slot: QualifierSlot): string {
  return `${slot.place}º Grupo ${slot.poolId}`;
}

/** Cruzamento padrão 2 grupos: 1A×2B, 1B×2A, 2A×1B, 2B×1A… */
export function crossoverFirstRoundPairings(
  groupIds: string[],
  qualifiersPerGroup: number,
): Array<{a: QualifierSlot; b: QualifierSlot}> {
  const safeQ = Math.max(1, qualifiersPerGroup);
  if (groupIds.length === 2) {
    const [gA, gB] = groupIds;
    const pairs: Array<{a: QualifierSlot; b: QualifierSlot}> = [];
    for (let place = 1; place <= safeQ; place++) {
      pairs.push({
        a: {poolId: gA, place},
        b: {poolId: gB, place: safeQ - place + 1},
      });
    }
    return pairs;
  }

  const qualifiers: QualifierSlot[] = [];
  for (const poolId of groupIds) {
    for (let place = 1; place <= safeQ; place++) {
      qualifiers.push({poolId, place});
    }
  }
  const pairs: Array<{a: QualifierSlot; b: QualifierSlot}> = [];
  for (let i = 0; i < qualifiers.length; i += 2) {
    const b = qualifiers[i + 1];
    if (b) pairs.push({a: qualifiers[i], b});
  }
  return pairs;
}

export function buildGroupsKnockoutMatches(
  teamIds: string[],
  groups: Array<{id: string; teamIds: string[]}>,
  qualifiersPerGroup = 2,
): MatchDraft[] {
  const safeGroups =
    groups.length > 0
      ? groups
      : [
          {
            id: "A",
            teamIds: teamIds.slice(0, Math.ceil(teamIds.length / 2)),
          },
          {id: "B", teamIds: teamIds.slice(Math.ceil(teamIds.length / 2))},
        ];

  const groupMatches: MatchDraft[] = [];
  let matchNumber = 1;
  for (const group of safeGroups) {
    const ids = group.teamIds.filter((id) => id.trim().length > 0);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        groupMatches.push({
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

  const groupIds = safeGroups.map((g) => g.id);
  const pairings = crossoverFirstRoundPairings(groupIds, qualifiersPerGroup);
  const knockoutMatches = buildSingleEliminationKnockoutMatches(
    [],
    1,
    pairings.map((pair) => ({
      teamAId: "",
      teamBId: "",
      teamAQualifier: pair.a,
      teamBQualifier: pair.b,
      teamADescription: qualifierSlotDescription(pair.a),
      teamBDescription: qualifierSlotDescription(pair.b),
    })),
  );

  return [...groupMatches, ...knockoutMatches];
}

/** Chave eliminatória simples (sem fase de grupos). */
export function buildSingleEliminationMatches(teamIds: string[]): MatchDraft[] {
  return buildSingleEliminationKnockoutMatches(teamIds, 1);
}

interface FirstRoundOverride {
  teamAId?: string;
  teamBId?: string;
  teamAQualifier?: QualifierSlot;
  teamBQualifier?: QualifierSlot;
  teamADescription?: string;
  teamBDescription?: string;
}

function buildSingleEliminationKnockoutMatches(
  teamIds: string[],
  roundStart: number,
  firstRoundOverrides?: FirstRoundOverride[],
): MatchDraft[] {
  const n = firstRoundOverrides?.length
    ? firstRoundOverrides.length * 2
    : teamIds.length;
  if (n < 2) return [];

  const bracketSize = 1 << Math.ceil(Math.log2(n));
  const padded = firstRoundOverrides
    ? Array.from({length: bracketSize}, () => "")
    : [...teamIds];
  if (!firstRoundOverrides) {
    while (padded.length < bracketSize) padded.push("");
  }

  const totalRounds = Math.log2(bracketSize);
  const rounds: MatchDraft[][] = [];

  for (let r = 0; r < totalRounds; r++) {
    const matchesInRound = bracketSize / (1 << (r + 1));
    const isFinal = r === totalRounds - 1;

    rounds[r] = [];
    for (let m = 0; m < matchesInRound; m++) {
      const matchNumber = m + 1;
      const isFirstRound = r === 0;
      const override = firstRoundOverrides?.[m];
      const teamAId = isFirstRound
        ? (override?.teamAId ?? padded[m * 2] ?? "")
        : "";
      const teamBId = isFirstRound
        ? (override?.teamBId ?? padded[m * 2 + 1] ?? "")
        : "";

      const draft: MatchDraft = {
        round: roundStart + r,
        matchType: isFinal ? "Final" : "knockout",
        poolId: "",
        teamAId,
        teamBId,
        isGroupMatch: false,
        matchNumber,
      };

      if (isFirstRound && override) {
        if (override.teamAQualifier) {
          draft.teamAQualifier = override.teamAQualifier;
        }
        if (override.teamBQualifier) {
          draft.teamBQualifier = override.teamBQualifier;
        }
        if (override.teamADescription) {
          draft.teamADescription = override.teamADescription;
        }
        if (override.teamBDescription) {
          draft.teamBDescription = override.teamBDescription;
        }
      }

      rounds[r].push(draft);
    }
  }

  // Propaga "byes" (slots vazios) para evitar bracket inoperável (não potência de 2).
  for (let r = 0; r < totalRounds - 1; r++) {
    for (const match of rounds[r]!) {
      const a = match.teamAId.trim();
      const b = match.teamBId.trim();
      if (a && !b) {
        const nextIdx = Math.ceil(match.matchNumber / 2) - 1;
        const next = rounds[r + 1]?.[nextIdx];
        if (!next) continue;
        const slot = match.matchNumber % 2 === 1 ? "teamAId" : "teamBId";
        next[slot] = a;
      } else if (!a && b) {
        const nextIdx = Math.ceil(match.matchNumber / 2) - 1;
        const next = rounds[r + 1]?.[nextIdx];
        if (!next) continue;
        const slot = match.matchNumber % 2 === 1 ? "teamAId" : "teamBId";
        next[slot] = b;
      }
    }
  }

  return rounds.flat();
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
