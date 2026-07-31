import {
  BRACKET_DEFINITIONS,
  bracketToMatchType,
  validateBracketDefinition,
  type MatchDefinition,
  type MatchInputSource,
} from "./bracket-definitions/bracket-definitions";

export interface BracketAdvanceSlot {
  matchNumber: number;
  teamSlot: "teamAId" | "teamBId";
  /** Rodada da partida destino — necessário quando matchNumber é por rodada (SE/grupos+mata-mata). */
  round?: number;
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

  // n grupos: espelha grupo i com grupo n+1-i (A×D, B×C, C×B, D×A…).
  const n = groupIds.length;
  const pairs: Array<{a: QualifierSlot; b: QualifierSlot}> = [];
  const halfBands = Math.floor(safeQ / 2);
  for (let k = 1; k <= halfBands; k++) {
    const oppPlace = safeQ - k + 1;
    for (let i = 0; i < n; i++) {
      pairs.push({
        a: {poolId: groupIds[i]!, place: k},
        b: {poolId: groupIds[n - 1 - i]!, place: oppPlace},
      });
    }
  }
  // Banda do MEIO quando q é ímpar (o floor acima a descarta): posições k×k
  // entre grupos espelhados, cada par uma vez só (i < n/2). É o que faz q=1
  // funcionar (ex.: 4 grupos × 1 classificado → 1ºA×1ºD, 1ºB×1ºC); sem isso o
  // mata-mata saía VAZIO pra q=1 com mais de 2 grupos.
  if (safeQ % 2 === 1) {
    const mid = (safeQ + 1) / 2;
    for (let i = 0; i < Math.floor(n / 2); i++) {
      pairs.push({
        a: {poolId: groupIds[i]!, place: mid},
        b: {poolId: groupIds[n - 1 - i]!, place: mid},
      });
    }
  }
  return pairs;
}

/** Total de classificados que forma um mata-mata equilibrado: potência de 2
 *  (2, 4, 8, 16…). Substitui o antigo teste de `total >> 1` ser potência de 2,
 *  que aceitava totais ÍMPARES (3, 5, 9…) por causa do arredondamento e deixava
 *  publicar chaves com classificado sem confronto. Mesma regra no portal web
 *  (`seeds.component.ts`) e no app (`isBalancedKnockoutQualifierCount`). */
export function isBalancedQualifierTotal(totalQualifiers: number): boolean {
  return totalQualifiers >= 2 && (totalQualifiers & (totalQualifiers - 1)) === 0;
}

/**
 * Rodadas de um rodízio (round-robin) pelo "circle method": em cada rodada todo
 * time joga no máximo uma vez, então listar os jogos rodada a rodada distribui o
 * descanso de forma uniforme dentro do grupo. Com nº ímpar de times, um BYE
 * folga a cada rodada (pares com BYE são descartados).
 */
export function roundRobinRounds(ids: string[]): Array<[string, string]>[] {
  const teams = ids.filter((id) => id.trim().length > 0);
  if (teams.length < 2) return [];

  const BYE = "";
  const arr = [...teams];
  if (arr.length % 2 === 1) arr.push(BYE);

  const n = arr.length;
  const rounds: Array<[string, string]>[] = [];
  // O primeiro elemento fica fixo; os demais giram a cada rodada.
  const order = [...arr];
  for (let r = 0; r < n - 1; r++) {
    const round: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      if (a !== BYE && b !== BYE) round.push([a, b]);
    }
    if (round.length > 0) rounds.push(round);
    // Rotaciona mantendo o índice 0 fixo.
    order.splice(1, 0, order.pop() as string);
  }
  return rounds;
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

  // Melhor sequência de jogos: cada grupo vira uma FILA de confrontos em ordem
  // de rodízio (circle method → descanso uniforme dentro do grupo); depois
  // intercalamos os grupos em rodízio simples (1 jogo de cada por vez, pulando
  // grupos esgotados). Assim jogos do mesmo grupo nunca ficam adjacentes →
  // nenhum time joga em matchNumber consecutivos.
  const groupQueues = safeGroups.map((group) => ({
    poolId: group.id,
    pairs: roundRobinRounds(group.teamIds).flat(),
  }));

  const groupMatches: MatchDraft[] = [];
  let matchNumber = 1;
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const queue of groupQueues) {
      const pair = queue.pairs.shift();
      if (!pair) continue;
      remaining = true;
      groupMatches.push({
        round: 0,
        matchType: "group",
        poolId: queue.poolId,
        teamAId: pair[0],
        teamBId: pair[1],
        isGroupMatch: true,
        matchNumber: matchNumber++,
      });
    }
  }

  const groupIds = safeGroups.map((g) => g.id);
  const pairings = crossoverFirstRoundPairings(groupIds, qualifiersPerGroup);
  // matchNumberStart = total de jogos da fase de grupos + 1 → o mata-mata
  // continua a numeração sequencialmente (ex.: grupos terminam em #24, QF1 = #25).
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
    groupMatches.length + 1,
  );

  return [...groupMatches, ...knockoutMatches];
}

/** Chave eliminatória simples (sem fase de grupos). */
export function buildSingleEliminationMatches(teamIds: string[]): MatchDraft[] {
  return buildSingleEliminationKnockoutMatches(teamIds, 1);
}

/**
 * Ordem de seeding padrão de um bracket de tamanho `size` (potência de 2).
 * Retorna os números de seed (1-based) na ordem dos slots, de modo que seed 1
 * fique no topo e enfrente o pior seed, seed 2 no extremo oposto, etc. Quando
 * há menos equipes do que `size`, os seeds maiores (que não existem) viram
 * "byes" — e por construção cada bye cai numa partida distinta, contra um dos
 * melhores seeds, nunca dois byes na mesma partida.
 */
export function standardSeedSlots(size: number): number[] {
  if (size < 2) return [1];
  let slots = [1, 2];
  while (slots.length < size) {
    const sum = slots.length * 2 + 1;
    const next: number[] = [];
    for (const s of slots) {
      next.push(s);
      next.push(sum - s);
    }
    slots = next;
  }
  return slots;
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
  matchNumberStart = 1,
): MatchDraft[] {
  const n = firstRoundOverrides?.length
    ? firstRoundOverrides.length * 2
    : teamIds.length;
  if (n < 2) return [];

  const bracketSize = 1 << Math.ceil(Math.log2(n));
  // Posiciona as equipes nos slots pela ordem de seeding padrão: byes (slots
  // sem equipe) ficam distribuídos contra os melhores seeds, um por partida —
  // nunca agrupados numa partida "vazia × vazia" injogável.
  const padded = firstRoundOverrides
    ? Array.from({length: bracketSize}, () => "")
    : standardSeedSlots(bracketSize).map((seed) => teamIds[seed - 1] ?? "");

  const totalRounds = Math.log2(bracketSize);
  const rounds: MatchDraft[][] = [];

  for (let r = 0; r < totalRounds; r++) {
    const matchesInRound = bracketSize / (1 << (r + 1));
    const isFinal = r === totalRounds - 1;

    rounds[r] = [];
    for (let m = 0; m < matchesInRound; m++) {
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
        // matchNumber definitivo é atribuído depois (numeração GLOBAL).
        matchNumber: 0,
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

  // Propaga byes APENAS da 1ª rodada para a 2ª. Com o seeding padrão, byes só
  // existem na 1ª rodada (cada um é uma partida "time × vazio" distinta), então
  // um único nível basta. Propagar além disso seria errado: uma partida da 2ª
  // rodada com um slot vazio normalmente está esperando o vencedor de um jogo
  // futuro — não é um bye — e empurrar o time adiante "pularia" essa partida.
  if (totalRounds > 1) {
    for (let i = 0; i < rounds[0]!.length; i++) {
      const match = rounds[0]![i];
      const a = match.teamAId.trim();
      const b = match.teamBId.trim();
      const solo = a && !b ? a : !a && b ? b : "";
      if (!solo) continue;
      const nextIdx = Math.floor(i / 2);
      const next = rounds[1]?.[nextIdx];
      if (!next) continue;
      const slot = slotForIndex(i);
      next[slot] = solo;
    }
  }

  // Disputa de 3º lugar: perdedores das semifinais (n >= 4 equipes reais).
  let thirdPlace: MatchDraft | null = null;
  if (n >= 4 && totalRounds >= 2) {
    thirdPlace = {
      round: roundStart + totalRounds - 1,
      matchType: "Third Place",
      poolId: "",
      teamAId: "",
      teamBId: "",
      isGroupMatch: false,
      matchNumber: 0,
    };
  }

  // Numeração GLOBAL: rodada 0 → ... → final → 3º lugar. O caller informa onde
  // a sequência começa (`matchNumberStart`) para que matchNumbers continuem a
  // contagem da fase de grupos quando existir.
  let counter = matchNumberStart;
  for (let r = 0; r < totalRounds; r++) {
    for (const m of rounds[r]!) {
      m.matchNumber = counter++;
    }
  }
  if (thirdPlace) thirdPlace.matchNumber = counter++;

  // Fia explicitamente o avanço de TODAS as rodadas. Antes a propagação era
  // implícita (por round+ceil(matchNumber/2)) e dependia de matchNumber por
  // rodada começar em 1 — incompatível com numeração global.
  for (let r = 0; r < totalRounds - 1; r++) {
    const cur = rounds[r]!;
    const nxt = rounds[r + 1]!;
    for (let i = 0; i < cur.length; i++) {
      const match = cur[i]!;
      const target = nxt[Math.floor(i / 2)]!;
      const slot = slotForIndex(i);
      match.winnerAdvance = advanceToSlot(
        target.matchNumber,
        slot,
        target.round,
      );
    }
  }

  if (thirdPlace) {
    const semis = rounds[totalRounds - 2]!;
    for (let i = 0; i < semis.length; i++) {
      const semi = semis[i]!;
      const slot = slotForIndex(i);
      semi.loserAdvance = advanceToSlot(
        thirdPlace.matchNumber,
        slot,
        thirdPlace.round,
      );
    }
  }

  // Placeholders "Vencedor Jogo #N" para slots à espera de uma partida anterior.
  // Pulamos slots já preenchidos por bye (1ª rodada → 2ª) ou por overrides (ex.:
  // qualifier de grupo). 3º lugar usa "Perdedor Jogo #N" das semifinais.
  for (let r = 1; r < totalRounds; r++) {
    const cur = rounds[r]!;
    const prev = rounds[r - 1]!;
    for (let i = 0; i < cur.length; i++) {
      const match = cur[i]!;
      const predA = prev[2 * i];
      const predB = prev[2 * i + 1];
      if (
        predA &&
        !match.teamAId.trim() &&
        !match.teamADescription
      ) {
        match.teamADescription = `Vencedor Jogo #${predA.matchNumber}`;
      }
      if (
        predB &&
        !match.teamBId.trim() &&
        !match.teamBDescription
      ) {
        match.teamBDescription = `Vencedor Jogo #${predB.matchNumber}`;
      }
    }
  }
  if (thirdPlace) {
    const semis = rounds[totalRounds - 2]!;
    if (semis[0] && !thirdPlace.teamADescription) {
      thirdPlace.teamADescription = `Perdedor Jogo #${semis[0].matchNumber}`;
    }
    if (semis[1] && !thirdPlace.teamBDescription) {
      thirdPlace.teamBDescription = `Perdedor Jogo #${semis[1].matchNumber}`;
    }
  }

  const result = rounds.flat();
  if (thirdPlace) result.push(thirdPlace);

  return result;
}

function slotForIndex(index: number): "teamAId" | "teamBId" {
  return index % 2 === 0 ? "teamAId" : "teamBId";
}

function advanceToSlot(
  matchNumber: number,
  teamSlot: "teamAId" | "teamBId",
  round?: number,
): BracketAdvanceSlot {
  return round !== undefined ?
    {matchNumber, teamSlot, round} :
    {matchNumber, teamSlot};
}

function advanceTo(
  target: MatchDraft,
  teamSlot: "teamAId" | "teamBId",
): BracketAdvanceSlot {
  return advanceToSlot(target.matchNumber, teamSlot);
}

/**
 * Gera a chave de dupla eliminação no modelo de SEMIFINAIS PARALELAS:
 *
 * - WB (winners) é uma eliminatória simples → produz campeão WB + vice WB
 *   (os dois finalistas da WB).
 * - LB (losers) recebe os perdedores das rodadas da WB EXCETO a final da WB e
 *   se resolve sozinha → produz campeão LB + vice LB.
 * - Grande Final: campeão WB × campeão LB.
 * - 3º lugar: vice WB (perdedor da final WB) × vice LB (perdedor da final LB).
 *   O perdedor da final da WB NÃO cai mais na LB (sem "reset").
 *
 * Os `matchNumber` seguem a ordem cronológica de jogo, intercalando WB e LB por
 * rodada (WB R1, LB R1, WB R2, LB R2, LB R3, WB R3, …, final WB, final LB,
 * 3º lugar, grande final).
 *
 * NOTA: a estrutura é exata para potências de 2 (4, 8, 16, 32…). Para outras
 * contagens usa-se preenchimento com BYE (slots vazios) que precisam ser
 * resolvidos no seeding/walkover — passo ainda não automatizado para a DE.
 */
/** Texto de placeholder ("Vencedor Jogo #N" / "Perdedor Jogo #N"). */
function sourceDescription(src: MatchInputSource): string {
  switch (src.type) {
    case "WINNER":
      return `Vencedor Jogo #${src.matchNumber}`;
    case "LOSER":
      return `Perdedor Jogo #${src.matchNumber}`;
    case "BYE":
      return "BYE";
    case "SEED":
      return "";
  }
}

/**
 * Materializa uma planta declarativa (`MatchDefinition[]`) em `MatchDraft[]`:
 * resolve SEED → teamId (pelo seeding), preenche placeholders para WINNER/LOSER
 * e conecta os avanços (`winnerAdvance`/`loserAdvance`) da partida de ORIGEM
 * para o slot da partida de DESTINO.
 */
export function buildMatchesFromDefinition(
  definition: MatchDefinition[],
  teamIds: string[],
): MatchDraft[] {
  validateBracketDefinition(definition);

  const drafts = new Map<number, MatchDraft>();

  const applySource = (
    draft: MatchDraft,
    slot: "teamAId" | "teamBId",
    src: MatchInputSource,
  ): void => {
    if (src.type === "SEED") {
      draft[slot] = teamIds[src.seed - 1] ?? "";
      return;
    }
    const descSlot = slot === "teamAId" ? "teamADescription" : "teamBDescription";
    const desc = sourceDescription(src);
    if (desc) draft[descSlot] = desc;
  };

  for (const def of definition) {
    const draft: MatchDraft = {
      round: def.round,
      matchType: bracketToMatchType(def.bracket),
      poolId: "",
      teamAId: "",
      teamBId: "",
      isGroupMatch: false,
      matchNumber: def.matchNumber,
    };
    applySource(draft, "teamAId", def.teamA);
    applySource(draft, "teamBId", def.teamB);
    drafts.set(def.matchNumber, draft);
  }

  const wire = (
    destMatchNumber: number,
    slot: "teamAId" | "teamBId",
    src: MatchInputSource,
  ): void => {
    if (src.type !== "WINNER" && src.type !== "LOSER") return;
    const source = drafts.get(src.matchNumber);
    if (!source) return;
    const advance: BracketAdvanceSlot = {matchNumber: destMatchNumber, teamSlot: slot};
    if (src.type === "WINNER") {
      source.winnerAdvance = advance;
    } else {
      source.loserAdvance = advance;
    }
  };

  for (const def of definition) {
    wire(def.matchNumber, "teamAId", def.teamA);
    wire(def.matchNumber, "teamBId", def.teamB);
  }

  return definition.map((def) => drafts.get(def.matchNumber)!);
}

export function buildDoubleEliminationMatches(teamIds: string[]): MatchDraft[] {
  const n = teamIds.length;
  if (n < 2) return [];

  // Quando existe uma planta estática para esse nº de equipes, usa-a (estrutura
  // desenhada à mão, com 3º lugar). Senão, cai no gerador algorítmico.
  const definition = BRACKET_DEFINITIONS[n];
  if (definition) return buildMatchesFromDefinition(definition, teamIds);

  const bracketSize = 1 << Math.ceil(Math.log2(n));
  const padded = [...teamIds];
  while (padded.length < bracketSize) padded.push("");

  const wbRoundCount = Math.log2(bracketSize);

  // ── Winners bracket ──
  const wb: MatchDraft[][] = [];
  let wbCount = bracketSize / 2;
  for (let j = 0; j < wbRoundCount; j++) {
    const bucket: MatchDraft[] = [];
    for (let i = 0; i < wbCount; i++) {
      bucket.push({
        round: j + 1,
        matchType: "WB",
        poolId: "",
        teamAId: j === 0 ? (padded[i * 2] ?? "") : "",
        teamBId: j === 0 ? (padded[i * 2 + 1] ?? "") : "",
        isGroupMatch: false,
        matchNumber: 0,
      });
    }
    wb.push(bucket);
    wbCount = wbCount / 2;
  }

  // ── Losers bracket (auto-contida; não recebe o perdedor da final da WB) ──
  // Tamanhos: B/4, B/4, B/8, B/8, … até 1. Rodadas pares (0-based) são "minor"
  // (sobreviventes da LB se enfrentam); ímpares são "major" (sobrevivente da LB
  // × perdedor que desce da WB). L = 2k-3 rodadas.
  const lb: MatchDraft[][] = [];
  if (bracketSize >= 4) {
    const lbRoundCount = 2 * wbRoundCount - 3;
    let count = bracketSize / 4;
    for (let r = 0; r < lbRoundCount; r++) {
      const bucket: MatchDraft[] = [];
      for (let i = 0; i < count; i++) {
        bucket.push({
          round: r + 1,
          matchType: "LB",
          poolId: "",
          teamAId: "",
          teamBId: "",
          isGroupMatch: false,
          matchNumber: 0,
        });
      }
      lb.push(bucket);
      if (r % 2 === 1 && count > 1) count = count / 2;
    }
  }

  const hasLosers = lb.length > 0;
  const thirdPlace: MatchDraft = {
    round: 1,
    matchType: "Third Place",
    poolId: "",
    teamAId: "",
    teamBId: "",
    isGroupMatch: false,
    matchNumber: 0,
  };
  const grandFinal: MatchDraft = {
    round: 1,
    matchType: "Final",
    poolId: "",
    teamAId: "",
    teamBId: "",
    isGroupMatch: false,
    matchNumber: 0,
  };

  // ── Numeração cronológica (intercalada por rodada) ──
  const ordered: MatchDraft[] = [];
  let matchNumber = 1;
  const emit = (bucket?: MatchDraft[]): void => {
    if (!bucket) return;
    for (const match of bucket) {
      match.matchNumber = matchNumber++;
      ordered.push(match);
    }
  };

  emit(wb[0]); // WB R1
  if (hasLosers) emit(lb[0]); // LB R1 (perdedores da WB R1)
  let nextLb = 1;
  for (let j = 1; j <= wbRoundCount - 2; j++) {
    emit(wb[j]); // WB R(j+1) intermediária
    if (nextLb < lb.length) emit(lb[nextLb++]); // major (recebe perdedores)
    if (nextLb < lb.length - 1) emit(lb[nextLb++]); // minor seguinte (não a final)
  }
  emit(wb[wbRoundCount - 1]); // final da WB
  while (nextLb < lb.length) emit(lb[nextLb++]); // final da LB (e restantes)
  if (hasLosers) emit([thirdPlace]);
  emit([grandFinal]);

  // ── Fiação de avanço (vencedor/perdedor), já com matchNumber atribuído ──
  // WB: vencedores avançam na WB.
  for (let j = 0; j < wbRoundCount - 1; j++) {
    for (let i = 0; i < wb[j].length; i++) {
      wb[j][i].winnerAdvance = advanceTo(wb[j + 1][Math.floor(i / 2)], slotForIndex(i));
    }
  }
  const wbFinal = wb[wbRoundCount - 1][0];
  wbFinal.winnerAdvance = advanceTo(grandFinal, "teamAId");
  if (hasLosers) wbFinal.loserAdvance = advanceTo(thirdPlace, "teamAId");

  if (hasLosers) {
    // Perdedores da WB R1 → primeira rodada (minor) da LB.
    for (let i = 0; i < wb[0].length; i++) {
      wb[0][i].loserAdvance = advanceTo(lb[0][Math.floor(i / 2)], slotForIndex(i));
    }
    // Perdedores das WB intermediárias R(j+1) → rodada "major" lb[2j-1] (teamB).
    for (let j = 1; j <= wbRoundCount - 2; j++) {
      const major = lb[2 * j - 1];
      if (!major) continue;
      for (let i = 0; i < wb[j].length; i++) {
        if (!major[i]) continue;
        wb[j][i].loserAdvance = advanceTo(major[i], "teamBId");
      }
    }

    // LB → LB: minor→major (mesma contagem, vencedor ocupa teamA) ou
    // major→minor (metade da contagem).
    for (let r = 0; r < lb.length - 1; r++) {
      const cur = lb[r];
      const nxt = lb[r + 1];
      if (cur.length === nxt.length) {
        for (let i = 0; i < cur.length; i++) {
          cur[i].winnerAdvance = advanceTo(nxt[i], "teamAId");
        }
      } else {
        for (let i = 0; i < cur.length; i++) {
          cur[i].winnerAdvance = advanceTo(nxt[Math.floor(i / 2)], slotForIndex(i));
        }
      }
    }

    // Final da LB: vencedor → grande final; perdedor → 3º lugar.
    const lbFinal = lb[lb.length - 1][0];
    lbFinal.winnerAdvance = advanceTo(grandFinal, "teamBId");
    lbFinal.loserAdvance = advanceTo(thirdPlace, "teamBId");
  }

  return ordered;
}
