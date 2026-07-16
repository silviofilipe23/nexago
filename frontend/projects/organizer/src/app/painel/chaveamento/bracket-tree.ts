import type { TournamentMatch } from '../data/matches-repository';

/** Geometria da árvore de dupla eliminação (WB/LB) — só faz sentido pra `double_elimination`:
 *  é o único formato que grava `winnerAdvance`/`loserAdvance` (matchNumber de destino) nas
 *  partidas (ver `category-bracket-builders.ts`). Eliminatória simples/grupos+mata-mata
 *  resolvem avanço por posição em runtime (round+matchNumber, sem ponteiro salvo) e continuam
 *  com o bracket genérico em coluna única de `chaveamento.component.ts`.
 *
 *  A posição vertical (`top`) de cada partida é a MÉDIA da posição das partidas que a
 *  alimentam (achadas via `winnerAdvance`/`loserAdvance` apontando pro seu `matchNumber`,
 *  processado em ordem crescente de matchNumber — sempre menor que o destino, tanto nas
 *  plantas estáticas quanto no gerador algorítmico). Isso auto-organiza a árvore sem assumir
 *  que cada rodada tem metade das partidas da anterior (a LB não segue essa regra: rodadas
 *  "minor"/"major" mantêm ou reduzem a contagem de forma irregular) e evita cruzamento de
 *  linhas, já que o subgrafo de `winnerAdvance` de cada seção é uma árvore. As posições da LB
 *  usam TAMBÉM o `loserAdvance` vindo da WB (pra herdar a ordem dos pares que a alimentam,
 *  igual um bracket real), mas o conector em si só é desenhado dentro da mesma seção — a WB e a
 *  LB são renderizadas como duas árvores empilhadas (sem linha cruzando a divisória), igual ao
 *  mockup de referência. */

export const BRACKET_MATCH_WIDTH = 190;
/** Cabeçalho (24px, nº do jogo + status) + 2 linhas de dupla (34px cada, com avatar) — precisa
 *  bater exatamente com `.og-de-match` em styles.scss, senão os conectores desalinham. */
export const BRACKET_MATCH_HEIGHT = 92;

const ROW_GAP = 26;
const ROW_UNIT = BRACKET_MATCH_HEIGHT + ROW_GAP;
const COL_GAP = 54;
const COL_STEP = BRACKET_MATCH_WIDTH + COL_GAP;

export interface BracketNode {
  match: TournamentMatch;
  top: number;
}

export interface BracketColumn {
  key: string;
  label: string;
  left: number;
  nodes: BracketNode[];
}

export interface BracketConnector {
  d: string;
}

export interface BracketSection {
  columns: BracketColumn[];
  connectors: BracketConnector[];
  width: number;
  height: number;
}

export interface DoubleEliminationBracket {
  wb: BracketSection;
  lb: BracketSection | null;
  grandFinal: TournamentMatch | null;
  thirdPlace: TournamentMatch | null;
}

function typeOf(m: TournamentMatch): string {
  return m.matchType.trim().toLowerCase();
}

export function isDoubleElimination(matches: readonly TournamentMatch[]): boolean {
  return matches.some((m) => typeOf(m) === 'wb' || typeOf(m) === 'lb');
}

function phaseLabelByMatchCount(n: number): string {
  if (n >= 16) return '32-avos';
  if (n === 8) return 'Oitavas';
  if (n === 4) return 'Quartas';
  if (n === 2) return 'Semifinal';
  if (n === 1) return 'Final';
  return `Rodada (${n} jogos)`;
}

/** Posição vertical de cada partida = média da posição de quem a alimenta (`winnerAdvance`/
 *  `loserAdvance` apontando pro seu matchNumber). Sem alimentador conhecido (rodada 1, que só
 *  recebe SEED) cai num contador sequencial por (matchType, round). */
function computeRows(matches: readonly TournamentMatch[]): Map<number, number> {
  const byNumber = new Map<number, TournamentMatch>();
  for (const m of matches) byNumber.set(m.matchNumber, m);

  const feedersOf = new Map<number, TournamentMatch[]>();
  for (const m of matches) {
    for (const dest of [m.winnerAdvanceMatchNumber, m.loserAdvanceMatchNumber]) {
      if (dest == null || !byNumber.has(dest)) continue;
      const list = feedersOf.get(dest) ?? [];
      list.push(m);
      feedersOf.set(dest, list);
    }
  }

  const rows = new Map<number, number>();
  const fallbackCounter = new Map<string, number>();
  const sorted = [...matches].sort((a, b) => a.matchNumber - b.matchNumber);
  for (const m of sorted) {
    const feeders = feedersOf.get(m.matchNumber) ?? [];
    const known = feeders.map((f) => rows.get(f.matchNumber)).filter((r): r is number => r != null);
    if (known.length > 0) {
      rows.set(m.matchNumber, known.reduce((a, b) => a + b, 0) / known.length);
    } else {
      const key = `${typeOf(m)}:${m.roundNumber}`;
      const idx = fallbackCounter.get(key) ?? 0;
      fallbackCounter.set(key, idx + 1);
      rows.set(m.matchNumber, idx);
    }
  }
  return rows;
}

function buildSection(
  sectionMatches: TournamentMatch[],
  rows: Map<number, number>,
  labelForColumn: (roundNumber: number, matchCount: number, isLast: boolean) => string,
): BracketSection {
  if (sectionMatches.length === 0) return { columns: [], connectors: [], width: 0, height: 0 };

  const roundNumbers = [...new Set(sectionMatches.map((m) => m.roundNumber))].sort((a, b) => a - b);
  const byRound = new Map<number, TournamentMatch[]>();
  for (const m of sectionMatches) {
    const list = byRound.get(m.roundNumber) ?? [];
    list.push(m);
    byRound.set(m.roundNumber, list);
  }

  const minRow = Math.min(...sectionMatches.map((m) => rows.get(m.matchNumber) ?? 0));

  const columns: BracketColumn[] = roundNumbers.map((rn, colIndex) => {
    const isLast = colIndex === roundNumbers.length - 1;
    const columnMatches = [...byRound.get(rn)!].sort((a, b) => (rows.get(a.matchNumber) ?? 0) - (rows.get(b.matchNumber) ?? 0));
    const nodes: BracketNode[] = columnMatches.map((match) => ({
      match,
      top: ((rows.get(match.matchNumber) ?? 0) - minRow) * ROW_UNIT,
    }));
    return { key: `${rn}`, label: labelForColumn(rn, columnMatches.length, isLast), left: colIndex * COL_STEP, nodes };
  });

  const sectionMatchNumbers = new Set(sectionMatches.map((m) => m.matchNumber));
  const nodeByMatchNumber = new Map<number, BracketNode>();
  const colIndexByMatchNumber = new Map<number, number>();
  columns.forEach((col, i) => {
    for (const node of col.nodes) {
      nodeByMatchNumber.set(node.match.matchNumber, node);
      colIndexByMatchNumber.set(node.match.matchNumber, i);
    }
  });

  const connectors: BracketConnector[] = [];
  for (const m of sectionMatches) {
    const dest = m.winnerAdvanceMatchNumber;
    if (dest == null || !sectionMatchNumbers.has(dest)) continue;
    const from = nodeByMatchNumber.get(m.matchNumber);
    const to = nodeByMatchNumber.get(dest);
    const fromCol = colIndexByMatchNumber.get(m.matchNumber);
    const toCol = colIndexByMatchNumber.get(dest);
    if (!from || !to || fromCol == null || toCol == null) continue;
    const x1 = fromCol * COL_STEP + BRACKET_MATCH_WIDTH;
    const y1 = from.top + BRACKET_MATCH_HEIGHT / 2;
    const x2 = toCol * COL_STEP;
    const y2 = to.top + BRACKET_MATCH_HEIGHT / 2;
    const midX = x1 + (x2 - x1) / 2;
    connectors.push({ d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}` });
  }

  const maxTop = Math.max(...columns.flatMap((c) => c.nodes.map((n) => n.top)));
  const width = (columns.length - 1) * COL_STEP + BRACKET_MATCH_WIDTH;
  const height = maxTop + BRACKET_MATCH_HEIGHT;

  return { columns, connectors, width, height };
}

export function buildDoubleEliminationBracket(matches: readonly TournamentMatch[]): DoubleEliminationBracket | null {
  const bracketMatches = matches.filter((m) => typeOf(m) === 'wb' || typeOf(m) === 'lb');
  if (bracketMatches.length === 0) return null;

  const rows = computeRows(bracketMatches);
  const wbMatches = bracketMatches.filter((m) => typeOf(m) === 'wb');
  const lbMatches = bracketMatches.filter((m) => typeOf(m) === 'lb');

  const wb = buildSection(wbMatches, rows, (_rn, count) => `WB · ${phaseLabelByMatchCount(count)}`);
  const lb = buildSection(lbMatches, rows, (rn, _count, isLast) => (isLast ? 'LB · Final' : `LB · Rodada ${rn}`));

  const grandFinal = matches.find((m) => typeOf(m) === 'final') ?? null;
  const thirdPlace = matches.find((m) => typeOf(m) === 'third place') ?? null;

  return { wb, lb: lb.columns.length > 0 ? lb : null, grandFinal, thirdPlace };
}
