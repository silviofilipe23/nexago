import {
  BRACKET_MATCH_HEIGHT,
  BRACKET_MATCH_WIDTH,
  buildDoubleEliminationLayout,
  buildKnockoutTreeLayout,
  isDoubleElimination,
  type DeLayoutNode,
} from '../../painel/chaveamento/bracket-tree';
import { isKingOfCourtMatchType } from '../../painel/data/koc';
import { matchLiveCurrentSet, matchSetWins } from '../../painel/data/live-set-display';
import type { TournamentMatch } from '../../painel/data/matches-repository';

/** Chaves: a chave eliminatória (simples ou dupla) de uma categoria, desenhada das partidas — só os
 *  cartões dos jogos e as ligações (sem card de campeão).
 *
 *  A GEOMETRIA vem do motor do painel (`buildDoubleEliminationLayout` / `buildKnockoutTreeLayout`,
 *  o mesmo do app e do portal); aqui só se montam os cartões (código do jogo, tag, linhas das
 *  duplas, vaga ainda não definida), e as ligações com estado. Puro. */

export const CHAVE_CARD_W = BRACKET_MATCH_WIDTH;
/** O cartão do overlay é mais baixo que o do painel (sem avatar nem rodapé de agenda): cabeçalho 34 + 2 linhas de 44. */
export const CHAVE_CARD_H = 122;
const HEAD_H = 34;
const ROW_H = 44;
const SLOT_GAP = (BRACKET_MATCH_HEIGHT - CHAVE_CARD_H) / 2;

export interface ChaveSlot {
  teamId: string;
  /** Nome/descrição gravada da dupla (a tela resolve pelo elenco quando há `teamId`). */
  label: string;
  /** Vaga ainda sem dupla: `label` é "Vencedor Semi 1" / "Perdedor V6" / "BYE" (itálico). */
  placeholder: boolean;
  score: number | null;
  winner: boolean;
  loser: boolean;
}

export interface ChaveNode {
  matchId: string;
  matchNumber: number;
  left: number;
  top: number;
  /** Coluna (0 = mais à esquerda): ordem da animação de entrada. */
  col: number;
  /** Posição dentro da coluna, de cima pra baixo: dentro da coluna os cartões entram nessa ordem. */
  row: number;
  /** "QUARTAS 1" · "SEMI 2" · "FINAL" · "V5" · "P3" · "GF" · "3º LUGAR". */
  code: string;
  /** "Q1" — quadra abreviada. */
  court: string | null;
  tag: { kind: 'live' | 'fim' | 'hora' | 'nada'; text: string };
  live: boolean;
  a: ChaveSlot;
  b: ChaveSlot;
  /** Dupla que perde na chave dos perdedores: nome riscado. */
  eliminates: boolean;
}

export interface ChaveEdge {
  d: string;
  /** O jogo de origem terminou: a ligação acende. */
  done: boolean;
  col: number;
}

export interface ChaveView {
  kind: 'simples' | 'dupla';
  formatLabel: string;
  width: number;
  height: number;
  nodes: ChaveNode[];
  edges: ChaveEdge[];
  labels: { label: string; left: number; top: number }[];
}

const norm = (m: TournamentMatch): string => m.matchType.trim().toLowerCase().replace(/_/g, ' ');
const isFinalType = (t: string) => t === 'final' || t === 'grand final';
const isThirdType = (t: string) => t === 'third place';

/** Partidas que entram na chave: sem grupo, sem KOTC e sem cancelada. */
export function chaveMatchesOf(matches: readonly TournamentMatch[], categoryId: string | null): TournamentMatch[] {
  return matches.filter(
    (m) =>
      m.categoryId === categoryId &&
      m.status !== 'canceled' &&
      !isKingOfCourtMatchType(m.matchType) &&
      norm(m) !== 'group' &&
      !(m.round ?? '').startsWith('Grupo '),
  );
}

/** Categorias com chave eliminatória, na ordem em que aparecem nas partidas. */
export function categoriesWithChave(matches: readonly TournamentMatch[]): string[] {
  const out: string[] = [];
  for (const m of matches) {
    const id = m.categoryId ?? '';
    if (id && !out.includes(id) && chaveMatchesOf(matches, id).length > 0) out.push(id);
  }
  return out;
}

const COLUMN_CODE: Record<string, string> = { quartas: 'QUARTAS', semifinais: 'SEMI', oitavas: 'OITAVAS', '32-avos': '32-AVOS' };

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function chaveViewOf(matches: readonly TournamentMatch[], categoryId: string | null): ChaveView | null {
  const cm = chaveMatchesOf(matches, categoryId);
  if (cm.length === 0) return null;
  const double = isDoubleElimination(cm);
  const layout = (double ? buildDoubleEliminationLayout(cm) : null) ?? buildKnockoutTreeLayout(cm);
  if (!layout || layout.nodes.length === 0) return null;

  // Coluna de cada nó: ordem dos `left` distintos (a entrada anima coluna por coluna).
  const lefts = [...new Set(layout.nodes.map((n) => n.left))].sort((x, y) => x - y);
  const colOf = (n: DeLayoutNode) => lefts.indexOf(n.left);
  const labelAt = (left: number) => layout.labels.find((l) => l.left === left)?.label ?? '';

  // Códigos dos jogos.
  const code = new Map<number, string>();
  if (double) {
    let v = 0;
    let p = 0;
    for (const n of [...layout.nodes].sort((a, b) => a.match.matchNumber - b.match.matchNumber)) {
      const t = norm(n.match);
      if (t === 'wb') code.set(n.match.matchNumber, `V${++v}`);
      else if (t === 'lb') code.set(n.match.matchNumber, `P${++p}`);
      else if (isFinalType(t)) code.set(n.match.matchNumber, 'GF');
      else if (isThirdType(t)) code.set(n.match.matchNumber, '3º LUGAR');
    }
  } else {
    const perColumn = new Map<number, number>();
    for (const n of [...layout.nodes].sort((a, b) => a.match.matchNumber - b.match.matchNumber)) {
      const t = norm(n.match);
      if (isFinalType(t)) code.set(n.match.matchNumber, 'FINAL');
      else if (isThirdType(t)) code.set(n.match.matchNumber, '3º LUGAR');
      else {
        const label = labelAt(n.left);
        const base = COLUMN_CODE[label.toLowerCase()] ?? label.toUpperCase();
        const i = (perColumn.get(n.left) ?? 0) + 1;
        perColumn.set(n.left, i);
        code.set(n.match.matchNumber, `${base} ${i}`);
      }
    }
  }
  const refName = (matchNumber: number) => {
    const c = code.get(matchNumber) ?? `#${matchNumber}`;
    return double ? c : c.split(' ').map((w, i) => (i === 0 ? titleCase(w) : w)).join(' ');
  };

  /** De onde vem cada vaga ainda sem dupla ("Vencedor Semi 1", "Perdedor V6"). */
  const placeholderFor = (m: TournamentMatch, side: 'A' | 'B'): string | null => {
    const winners = cm.filter((s) => s.winnerAdvanceMatchNumber === m.matchNumber);
    const direct = winners.find((s) => s.winnerAdvanceSlot === side);
    if (direct) return `Vencedor ${refName(direct.matchNumber)}`;
    // Perdedores não trazem o lado no doc: ocupam a vaga que os vencedores não cobrem, na ordem do jogo.
    const covered = new Set(winners.map((s) => s.winnerAdvanceSlot));
    const losers = cm.filter((s) => s.loserAdvanceMatchNumber === m.matchNumber).sort((x, y) => x.matchNumber - y.matchNumber);
    const free = (['A', 'B'] as const).filter((x) => !covered.has(x));
    const at = free.indexOf(side);
    const loser = at >= 0 ? losers[at] : undefined;
    return loser ? `Perdedor ${refName(loser.matchNumber)}` : null;
  };

  const slotOf = (m: TournamentMatch, side: 'A' | 'B'): ChaveSlot => {
    const teamId = side === 'A' ? m.teamAId : m.teamBId;
    const label = side === 'A' ? m.team1Label : m.team2Label;
    const [sa, sb] = matchSetWins(m);
    const live = m.status === 'in_progress' ? matchLiveCurrentSet(m) : null;
    let score: number | null = null;
    if (m.status === 'in_progress' || m.status === 'completed') {
      if (m.bestOf <= 1) {
        const last = m.sets.at(-1);
        score = live ? (side === 'A' ? live.a : live.b) : last ? (side === 'A' ? last.a : last.b) : 0;
      } else score = side === 'A' ? sa : sb;
    }
    const done = m.status === 'completed' && m.winnerSide != null;
    const mine = side === 'A' ? 1 : 2;
    const ph = teamId === '' ? (label === 'BYE' ? 'BYE' : (placeholderFor(m, side) ?? label)) : null;
    return {
      teamId,
      label: ph ?? label,
      placeholder: teamId === '',
      score,
      winner: done && m.winnerSide === mine,
      loser: done && m.winnerSide !== mine,
    };
  };

  const topOf = (n: DeLayoutNode) => n.top;

  const hora = (d: Date | null) => (d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '');

  const nodes: ChaveNode[] = layout.nodes.map((n): ChaveNode => {
    const m = n.match;
    const cn = /(\d+)/.exec(m.court ?? '')?.[1];
    return {
      matchId: m.id,
      matchNumber: m.matchNumber,
      left: n.left,
      top: topOf(n),
      col: colOf(n),
      row: 0,
      code: code.get(m.matchNumber) ?? '',
      court: cn ? `Q${cn}` : null,
      tag:
        m.status === 'in_progress'
          ? { kind: 'live', text: 'Ao vivo' }
          : m.status === 'completed'
            ? { kind: 'fim', text: 'Fim' }
            : hora(m.scheduledAt)
              ? { kind: 'hora', text: hora(m.scheduledAt) }
              : { kind: 'nada', text: '' },
      live: m.status === 'in_progress',
      a: slotOf(m, 'A'),
      b: slotOf(m, 'B'),
      eliminates: norm(m) === 'lb' && m.status === 'completed',
    };
  });

  for (const col of new Set(nodes.map((n) => n.col))) {
    nodes
      .filter((n) => n.col === col)
      .sort((x, y) => x.top - y.top)
      .forEach((n, i) => (n.row = i));
  }

  // Ligações: cotovelo da lateral do jogo de origem até a vaga certa do destino; acendem quando a origem termina.
  const nodeByNumber = new Map(layout.nodes.map((n) => [n.match.matchNumber, n] as const));
  const edges: ChaveEdge[] = [];
  const slotY = (n: DeLayoutNode, slot: 'A' | 'B' | null) => topOf(n) + SLOT_GAP + HEAD_H + (slot === 'B' ? ROW_H * 1.5 : ROW_H * 0.5);
  for (const n of layout.nodes) {
    const m = n.match;
    const target = m.winnerAdvanceMatchNumber != null ? nodeByNumber.get(m.winnerAdvanceMatchNumber) : undefined;
    if (!target) continue;
    const y1 = topOf(n) + BRACKET_MATCH_HEIGHT / 2;
    const y2 = slotY(target, m.winnerAdvanceSlot);
    let x1: number;
    let x2: number;
    if (target.left >= n.left + CHAVE_CARD_W - 1) {
      x1 = n.left + CHAVE_CARD_W;
      x2 = target.left;
    } else if (target.left + CHAVE_CARD_W <= n.left + 1) {
      x1 = n.left;
      x2 = target.left + CHAVE_CARD_W;
    } else continue;
    const mid = (x1 + x2) / 2;
    edges.push({ d: `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`, done: m.status === 'completed' && m.winnerSide != null, col: colOf(n) });
  }

  return {
    kind: double ? 'dupla' : 'simples',
    formatLabel: double ? 'Dupla eliminatória' : 'Eliminatória simples',
    width: layout.width,
    height: layout.height,
    nodes,
    edges,
    labels: layout.labels.map((l) => ({ label: l.label, left: l.left, top: l.top })),
  };
}
