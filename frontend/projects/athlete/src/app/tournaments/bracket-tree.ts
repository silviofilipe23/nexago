import { buildBracketColumns, isBracketMatch, type TournamentMatch } from '../data/matches-repository';

/** Geometria da árvore da chave — porta do layout do painel do organizador
 *  (`organizer/src/app/painel/chaveamento/bracket-tree.ts`), que por sua vez espelha o canvas
 *  do app (`double_elimination_bracket_layout.dart`). O atleta vê exatamente a mesma árvore que
 *  o organizador operou: canvas único com o track da WB em cima — 3º Lugar e Final como colunas
 *  à direita, a Final centralizada no track — e o da LB embaixo.
 *
 *  A SEQUÊNCIA DE LIGAÇÕES das plantas (`functions/src/bracket-definitions`) é a autoridade da
 *  ordem visual:
 *
 *  - Dentro de cada chave, a ordem dos jogos numa coluna vem da fiação real (`winnerAdvance`
 *    gravado por `buildMatchesFromDefinition`): a última coluna ancora (por matchNumber) e cada
 *    coluna anterior se ordena pelos jogos que alimenta — alimentador do slot A acima do slot B.
 *    Ordenar por matchNumber cru quebra as plantas de fiação irregular (ex.: 27 duplas, onde o
 *    vencedor do #2 vai pro #21, não pro #14) e cruzaria os conectores.
 *  - Posição vertical: coluna-base em slots fixos (`(2i+1)·ROW_UNIT`); colunas seguintes na
 *    média dos alimentadores (com guarda de colisão) — conector reto quando há 1 alimentador,
 *    nó no meio dos pais quando há 2.
 *  - Conectores: ponteiros reais de avanço, só dentro da mesma chave (WB→WB, LB→LB) — sem linha
 *    cruzando WB↔LB nem entrando na Final.
 *
 *  A eliminatória simples / fase final de grupos+mata-mata tem árvore própria
 *  (`buildKnockoutTreeLayout`, no fim do arquivo) com o mesmo visual.
 *
 *  Nada aqui decide resultado ou avanço — é só desenho. Quem preenche a próxima partida é o
 *  Cloud Function server-side (ver cabeçalho de `matches-repository.ts`). */

/** Largura/altura do card — precisam bater exatamente com `.bx-match` no SCSS da aba, senão os
 *  conectores desalinham. Altura = head 28 + 2 lados de 40 + rodapé de agendamento 28. */
export const BRACKET_MATCH_WIDTH = 280;
export const BRACKET_MATCH_HEIGHT = 136;

/** Proporções espelhadas de `BracketLayoutMetrics` (app): ROW_UNIT 80 pra card 136 → 24px de
 *  respiro entre jogos adjacentes da coluna-base. */
const ROW_UNIT = 80;
const COL_GAP = 56;
const COL_STEP = BRACKET_MATCH_WIDTH + COL_GAP;
const HEADER_H = 26;
const WB_LB_GAP = 56;

export interface BracketLayoutNode {
  match: TournamentMatch;
  left: number;
  top: number;
}

export interface BracketLayoutLabel {
  key: string;
  label: string;
  left: number;
  top: number;
}

export interface BracketLayoutEdge {
  d: string;
}

export interface BracketLayout {
  nodes: BracketLayoutNode[];
  labels: BracketLayoutLabel[];
  edges: BracketLayoutEdge[];
  width: number;
  height: number;
}

function typeOf(m: TournamentMatch): string {
  return m.matchType.trim().toLowerCase();
}

export function isDoubleElimination(matches: readonly TournamentMatch[]): boolean {
  return matches.some((m) => typeOf(m) === 'wb' || typeOf(m) === 'lb');
}

/** Mesmo formato de rótulo do app (`bracketColumnHeaderLabel` do layout DE). O caixa-alta fica
 *  por conta do CSS (`text-transform`), como no organizer. */
function columnLabelOf(first: TournamentMatch): string {
  const t = typeOf(first);
  if (t === 'wb' || t === 'lb') return `${first.matchType.trim().toUpperCase()} · Rodada ${first.round}`;
  if (t === 'final') return 'Final';
  if (t === 'grand final' || t === 'grand_final') return 'Grand Final';
  if (t === 'third place' || t === 'third_place') return '3º Lugar';
  return first.matchType.trim() || `Rodada ${first.round}`;
}

/** Garante que nenhum jogo divida coluna com um jogo que ele alimenta: algumas plantas gravam
 *  o play-in da LB com o MESMO `round` da rodada que ele alimenta (ex.: planta 25, jogo #10
 *  "LB R1" com round 2, alimentando o #26 da LB R2) — se ficassem juntos, a ligação apontaria
 *  pra dentro da própria coluna. Extrai os alimentadores pra uma coluna própria antes,
 *  recursivamente. */
function splitIntraColumnDeps(columns: TournamentMatch[][]): TournamentMatch[][] {
  const result: TournamentMatch[][] = [];
  for (const col of columns) {
    const chain: TournamentMatch[][] = [col];
    for (;;) {
      const first = chain[0]!;
      const numbers = new Set(first.map((m) => m.matchNumber));
      const feeders = first.filter((m) => m.winnerAdvanceMatchNumber != null && numbers.has(m.winnerAdvanceMatchNumber));
      if (feeders.length === 0 || feeders.length === first.length) break;
      const feederSet = new Set(feeders.map((m) => m.matchNumber));
      chain[0] = first.filter((m) => !feederSet.has(m.matchNumber));
      chain.unshift(feeders);
    }
    result.push(...chain);
  }
  return result;
}

/** Ordena as colunas de uma chave (WB ou LB) seguindo as ligações da planta: a última coluna
 *  ancora por matchNumber; cada coluna anterior é ordenada pelos jogos que alimenta na coluna
 *  seguinte (alimentador do slot A acima do B). Jogos sem destino na coluna seguinte (não
 *  deveria acontecer em planta válida) vão pro fim, por matchNumber. */
function orderColumnsByWiring(columns: TournamentMatch[][]): TournamentMatch[][] {
  if (columns.length === 0) return [];
  const ordered: TournamentMatch[][] = new Array(columns.length);
  const last = columns.length - 1;
  ordered[last] = [...columns[last]!].sort((a, b) => a.matchNumber - b.matchNumber);
  const slotRank = (m: TournamentMatch): number => (m.winnerAdvanceSlot === 'A' ? 0 : m.winnerAdvanceSlot === 'B' ? 1 : 2);
  for (let c = last - 1; c >= 0; c--) {
    const current = columns[c]!;
    const used = new Set<number>();
    const result: TournamentMatch[] = [];
    for (const target of ordered[c + 1]!) {
      const feeders = current
        .filter((m) => m.winnerAdvanceMatchNumber === target.matchNumber)
        .sort((a, b) => slotRank(a) - slotRank(b) || a.matchNumber - b.matchNumber);
      for (const f of feeders) {
        if (!used.has(f.matchNumber)) {
          used.add(f.matchNumber);
          result.push(f);
        }
      }
    }
    for (const m of [...current].sort((a, b) => a.matchNumber - b.matchNumber)) {
      if (!used.has(m.matchNumber)) result.push(m);
    }
    ordered[c] = result;
  }
  return ordered;
}

export function buildDoubleEliminationLayout(matches: readonly TournamentMatch[]): BracketLayout | null {
  if (!isDoubleElimination(matches)) return null;

  // Colunas: (matchType, round) pra WB/LB; matchType puro pro resto (Final, 3º Lugar).
  const byColumn = new Map<string, TournamentMatch[]>();
  for (const m of matches) {
    const t = typeOf(m);
    const key = t === 'wb' || t === 'lb' ? `${t.toUpperCase()}:${m.round}` : m.matchType.trim();
    (byColumn.get(key) ?? byColumn.set(key, []).get(key)!).push(m);
  }

  const keysOfType = (t: string): string[] =>
    [...byColumn.keys()].filter((k) => typeOf(byColumn.get(k)![0]!) === t).sort((a, b) => byColumn.get(a)![0]!.round - byColumn.get(b)![0]!.round || a.localeCompare(b));

  const wbKeys = keysOfType('wb');
  const lbKeys = keysOfType('lb');
  const isFinalType = (t: string): boolean => t === 'final' || t === 'grand final' || t === 'grand_final';
  const finalKeys = [...byColumn.keys()].filter((k) => isFinalType(typeOf(byColumn.get(k)![0]!)));
  const otherKeys = [...byColumn.keys()]
    .filter((k) => {
      const t = typeOf(byColumn.get(k)![0]!);
      return t !== 'wb' && t !== 'lb' && !isFinalType(t);
    })
    .sort((a, b) => a.localeCompare(b));

  const nodes: BracketLayoutNode[] = [];
  const labels: BracketLayoutLabel[] = [];
  const nodeByMatchNumber = new Map<number, BracketLayoutNode>();

  const colX = (columnIndex: number): number => columnIndex * COL_STEP;

  /** Posiciona um track (WB ou LB) seguindo as ligações da planta. A coluna-BASE é a maior
   *  do track (nas plantas não-potência-de-2 a 1ª rodada é um play-in pequeno — ancorar nela
   *  estouraria o track): base em slots fixos; colunas seguintes na média dos alimentadores;
   *  colunas anteriores (play-ins) alinhadas ao jogo que alimentam (2 alimentadores abrem
   *  ±ROW_UNIT em volta do destino, slot A em cima). Guarda de colisão em toda coluna.
   *  Retorna o Y mais baixo ocupado (pra empilhar o track seguinte). */
  const placeTrack = (trackColumns: TournamentMatch[][], trackTop: number, startColumnIndex: number): number => {
    const orderedColumns = orderColumnsByWiring(trackColumns);
    if (orderedColumns.length === 0) return trackTop;
    const centerOf = new Map<number, number>(); // matchNumber → centerY absoluto

    let baseCol = 0;
    for (let c = 1; c < orderedColumns.length; c++) {
      if (orderedColumns[c]!.length > orderedColumns[baseCol]!.length) baseCol = c;
    }

    const applyColumn = (col: number, centers: number[]): void => {
      const columnMatches = orderedColumns[col]!;
      const left = colX(startColumnIndex + col);
      // Guarda de colisão preservando a ordem visual da coluna.
      let prev = -Infinity;
      columnMatches.forEach((match, i) => {
        const centerY = Math.max(centers[i]!, prev + BRACKET_MATCH_HEIGHT + 12);
        prev = centerY;
        centerOf.set(match.matchNumber, centerY);
        const node: BracketLayoutNode = { match, left, top: centerY - BRACKET_MATCH_HEIGHT / 2 };
        nodes.push(node);
        nodeByMatchNumber.set(match.matchNumber, node);
      });
    };

    // Base: slots fixos.
    applyColumn(
      baseCol,
      orderedColumns[baseCol]!.map((_, i) => trackTop + HEADER_H + (2 * i + 1) * ROW_UNIT),
    );

    // Antes da base (play-ins): alinhado ao destino que alimenta.
    for (let col = baseCol - 1; col >= 0; col--) {
      const columnMatches = orderedColumns[col]!;
      const centers: number[] = [];
      let fallback = trackTop + HEADER_H + ROW_UNIT;
      for (const match of columnMatches) {
        const dest = match.winnerAdvanceMatchNumber;
        const targetCenter = dest != null ? centerOf.get(dest) : undefined;
        if (targetCenter == null) {
          centers.push(fallback);
          fallback += 2 * ROW_UNIT;
          continue;
        }
        const siblings = columnMatches.filter((m) => m.winnerAdvanceMatchNumber === dest);
        if (siblings.length >= 2) {
          const idx = siblings.indexOf(match);
          centers.push(targetCenter + (idx === 0 ? -ROW_UNIT : ROW_UNIT));
        } else {
          centers.push(targetCenter);
        }
        fallback = centers[centers.length - 1]! + 2 * ROW_UNIT;
      }
      applyColumn(col, centers);
    }

    // Depois da base: média dos alimentadores.
    for (let col = baseCol + 1; col < orderedColumns.length; col++) {
      const columnMatches = orderedColumns[col]!;
      const centers: number[] = [];
      let fallback = trackTop + HEADER_H + ROW_UNIT;
      for (const match of columnMatches) {
        const feederCenters = orderedColumns[col - 1]!
          .filter((f) => f.winnerAdvanceMatchNumber === match.matchNumber)
          .map((f) => centerOf.get(f.matchNumber)!)
          .filter((y): y is number => y != null);
        if (feederCenters.length > 0) {
          centers.push(feederCenters.reduce((a, b) => a + b, 0) / feederCenters.length);
        } else {
          centers.push(fallback);
        }
        fallback = centers[centers.length - 1]! + 2 * ROW_UNIT;
      }
      applyColumn(col, centers);
    }

    orderedColumns.forEach((columnMatches, col) => {
      labels.push({
        key: `${typeOf(columnMatches[0]!)}:${columnMatches[0]!.round}:${startColumnIndex + col}`,
        label: columnLabelOf(columnMatches[0]!),
        left: colX(startColumnIndex + col),
        top: trackTop,
      });
    });

    let bottom = trackTop;
    for (const columnMatches of orderedColumns) {
      for (const m of columnMatches) bottom = Math.max(bottom, centerOf.get(m.matchNumber)! + BRACKET_MATCH_HEIGHT / 2);
    }
    return bottom;
  };

  // ── Track da WB (com 3º lugar e Final à direita, como no app) ──
  const wbTrackTop = 0;
  const wbColumns = splitIntraColumnDeps(wbKeys.map((k) => byColumn.get(k)!));
  const wbBottom = placeTrack(wbColumns, wbTrackTop, 0);

  let nextColumnIndex = wbColumns.length;
  for (const key of otherKeys) {
    const columnMatches = [...byColumn.get(key)!].sort((a, b) => a.matchNumber - b.matchNumber);
    const left = colX(nextColumnIndex);
    labels.push({ key, label: columnLabelOf(columnMatches[0]!), left, top: wbTrackTop });
    columnMatches.forEach((match, i) => {
      const centerY = wbTrackTop + HEADER_H + (2 * i + 1) * ROW_UNIT;
      const node: BracketLayoutNode = { match, left, top: centerY - BRACKET_MATCH_HEIGHT / 2 };
      nodes.push(node);
      nodeByMatchNumber.set(match.matchNumber, node);
    });
    nextColumnIndex++;
  }

  // Final: última coluna, centralizada verticalmente na altura REAL do track da WB
  // (espelha `_placeFinalColumn`, mas com o extent medido — a fórmula do app assume que a 1ª
  // rodada é a maior, o que não vale pros play-ins das plantas não-potência-de-2).
  for (const key of finalKeys) {
    const columnMatches = [...byColumn.get(key)!].sort((a, b) => a.matchNumber - b.matchNumber);
    const left = colX(nextColumnIndex);
    labels.push({ key, label: columnLabelOf(columnMatches[0]!), left, top: wbTrackTop });
    const contentTop = wbTrackTop + HEADER_H;
    columnMatches.forEach((match, i) => {
      const centerY = contentTop + (wbBottom - contentTop) / 2 + i * ROW_UNIT;
      const node: BracketLayoutNode = { match, left, top: centerY - BRACKET_MATCH_HEIGHT / 2 };
      nodes.push(node);
      nodeByMatchNumber.set(match.matchNumber, node);
    });
    nextColumnIndex++;
  }

  // ── Track da LB (embaixo, colunas recomeçando da esquerda) ──
  const upperBottom = nodes.reduce((max, n) => Math.max(max, n.top + BRACKET_MATCH_HEIGHT), wbBottom);
  const lbTop = upperBottom + WB_LB_GAP;
  placeTrack(splitIntraColumnDeps(lbKeys.map((k) => byColumn.get(k)!)), lbTop, 0);

  // ── Conectores: ponteiros reais de avanço, só dentro da mesma chave (WB→WB, LB→LB) ──
  const byNumber = new Map<number, TournamentMatch>();
  for (const m of matches) byNumber.set(m.matchNumber, m);

  const edges: BracketLayoutEdge[] = [];
  for (const m of matches) {
    const t = typeOf(m);
    if (t !== 'wb' && t !== 'lb') continue;
    const dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    const target = byNumber.get(dest);
    if (!target || typeOf(target) !== t) continue;
    const from = nodeByMatchNumber.get(m.matchNumber);
    const to = nodeByMatchNumber.get(dest);
    if (!from || !to) continue;
    edges.push({ d: edgePath(from, to) });
  }

  return finish(nodes, labels, edges);
}

/** Conector ortogonal saída→meio→entrada, igual ao do organizer. */
function edgePath(from: BracketLayoutNode, to: BracketLayoutNode): string {
  const x1 = from.left + BRACKET_MATCH_WIDTH;
  const y1 = from.top + BRACKET_MATCH_HEIGHT / 2;
  const x2 = to.left;
  const y2 = to.top + BRACKET_MATCH_HEIGHT / 2;
  const midX = x1 + (x2 - x1) / 2;
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
}

function finish(nodes: BracketLayoutNode[], labels: BracketLayoutLabel[], edges: BracketLayoutEdge[]): BracketLayout | null {
  if (nodes.length === 0) return null;
  let width = 0;
  let height = 0;
  for (const node of nodes) {
    width = Math.max(width, node.left + BRACKET_MATCH_WIDTH);
    height = Math.max(height, node.top + BRACKET_MATCH_HEIGHT);
  }
  for (const label of labels) width = Math.max(width, label.left + BRACKET_MATCH_WIDTH);
  return { nodes, labels, edges, width, height };
}

/** Árvore do mata-mata SIMPLES (eliminatória simples / fase final de grupos+mata-mata) —
 *  mesmo visual da árvore DE, num track único: colunas canônicas de `buildBracketColumns`
 *  (Quartas → Semifinais → …), 3º Lugar como coluna sem conector (paridade com a DE, que não
 *  desenha linha de perdedor) e a Final por último, centralizada na altura da coluna que a
 *  alimenta. Ligações pelos ponteiros reais (`winnerAdvance`, que o builder SE grava com
 *  numeração global) com fallback posicional `i → i÷2` — a regra de avanço do servidor — pra
 *  chaves geradas antes da fiação explícita. */
export function buildKnockoutTreeLayout(matches: readonly TournamentMatch[]): BracketLayout | null {
  const columns = buildBracketColumns(matches);
  if (columns.length === 0) return null;

  const colTypeOf = (c: { matches: TournamentMatch[] }): string => typeOf(c.matches[0]!);
  const isThird = (t: string): boolean => t === 'third place' || t === 'third_place';
  const isFinal = (t: string): boolean => t === 'final' || t === 'grand final' || t === 'grand_final';
  const chain = columns.filter((c) => !isFinal(colTypeOf(c)) && !isThird(colTypeOf(c)));
  const thirds = columns.filter((c) => isThird(colTypeOf(c)));
  const finals = columns.filter((c) => isFinal(colTypeOf(c)));

  const nodes: BracketLayoutNode[] = [];
  const labels: BracketLayoutLabel[] = [];
  const edges: BracketLayoutEdge[] = [];
  const nodeByMatchNumber = new Map<number, BracketLayoutNode>();
  const centersByColumn: number[][] = [];

  const colX = (columnIndex: number): number => columnIndex * COL_STEP;
  const trackTop = 0;

  const placeAt = (match: TournamentMatch, left: number, centerY: number): void => {
    const node: BracketLayoutNode = { match, left, top: centerY - BRACKET_MATCH_HEIGHT / 2 };
    nodes.push(node);
    nodeByMatchNumber.set(match.matchNumber, node);
  };

  chain.forEach((column, col) => {
    const left = colX(col);
    labels.push({ key: column.key, label: column.label, left, top: trackTop });
    const centers: number[] = [];
    column.matches.forEach((match, i) => {
      let centerY: number;
      if (col === 0) {
        centerY = trackTop + HEADER_H + (2 * i + 1) * ROW_UNIT;
      } else {
        // Alimentadores posicionais da rodada anterior (i*2, i*2+1) — mesma regra do avanço.
        const prev = centersByColumn[col - 1]!;
        const feederCenters = [prev[i * 2], prev[i * 2 + 1]].filter((y): y is number => y != null);
        centerY = feederCenters.length > 0 ? feederCenters.reduce((a, b) => a + b, 0) / feederCenters.length : trackTop + HEADER_H + (2 * i + 1) * ROW_UNIT;
      }
      centers.push(centerY);
      placeAt(match, left, centerY);
    });
    centersByColumn.push(centers);
  });

  let nextColumnIndex = chain.length;
  for (const column of thirds) {
    const left = colX(nextColumnIndex);
    labels.push({ key: column.key, label: column.label, left, top: trackTop });
    column.matches.forEach((match, i) => placeAt(match, left, trackTop + HEADER_H + (2 * i + 1) * ROW_UNIT));
    nextColumnIndex++;
  }

  for (const column of finals) {
    const left = colX(nextColumnIndex);
    labels.push({ key: column.key, label: column.label, left, top: trackTop });
    const lastChainCenters = centersByColumn[centersByColumn.length - 1] ?? [];
    const anchor = lastChainCenters.length > 0 ? lastChainCenters.reduce((a, b) => a + b, 0) / lastChainCenters.length : trackTop + HEADER_H + ROW_UNIT;
    column.matches.forEach((match, i) => placeAt(match, left, anchor + i * 2 * ROW_UNIT));
    nextColumnIndex++;
  }

  // Ligações: ponteiro real quando existir; senão posicional i→i÷2 (inclui semis → Final).
  const nextOf = (col: number): { matches: TournamentMatch[] } | null => (col + 1 < chain.length ? chain[col + 1]! : (finals[0] ?? null));
  chain.forEach((column, col) => {
    const next = nextOf(col);
    if (!next) return;
    column.matches.forEach((match, i) => {
      const target = match.winnerAdvanceMatchNumber != null ? nodeByMatchNumber.get(match.winnerAdvanceMatchNumber) : nodeByMatchNumber.get(next.matches[Math.floor(i / 2)]?.matchNumber ?? -1);
      const from = nodeByMatchNumber.get(match.matchNumber);
      // Só liga se o destino for mesmo da fase seguinte/Final (ponteiro pra 3º lugar não gera linha).
      if (from && target && next.matches.some((m) => m.matchNumber === target.match.matchNumber)) edges.push({ d: edgePath(from, target) });
    });
  });

  return finish(nodes, labels, edges);
}

/** Árvore da categoria: DE quando há partidas WB/LB; senão a do mata-mata simples. Recebe as
 *  partidas da categoria já filtradas (grupos ficam de fora). */
export function buildCategoryBracketLayout(matches: readonly TournamentMatch[]): BracketLayout | null {
  const knockout = matches.filter(isBracketMatch);
  if (knockout.length === 0) return null;
  return buildDoubleEliminationLayout(knockout) ?? buildKnockoutTreeLayout(knockout);
}
