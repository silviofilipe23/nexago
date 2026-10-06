import { isKingOfCourtMatchType } from '../../painel/data/koc';
import { matchSetWins } from '../../painel/data/live-set-display';
import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { OrganizerTournamentCourt } from '../../painel/data/tournament.model';

/** Grade do dia: horários × quadras, em blocos de 40 min. Puro — a tela só desenha.
 *
 *  O dia mostrado é o de HOJE se tiver jogo; senão o próximo dia com jogo; senão o último. Os
 *  blocos começam no primeiro jogo do dia (a programação real não parte de 08:00 redondo) e a
 *  grade só mostra `GRADE_VISIBLE_ROWS` linhas por vez, rolando pra manter o horário atual a
 *  `GRADE_ROWS_BEFORE_NOW` linhas do topo. */

export const GRADE_SLOT_MIN = 40;
export const GRADE_VISIBLE_ROWS = 8;
export const GRADE_ROWS_BEFORE_NOW = 2;
export const GRADE_MAX_COURTS = 6;

export type GradeState = 'final' | 'live' | 'next' | 'scheduled';

export interface GradeCell {
  matchId: string;
  categoryId: string | null;
  /** Fase como a partida rotula ("Oitavas", "Semi"). */
  phase: string;
  a: { teamId: string; label: string };
  b: { teamId: string; label: string };
  state: GradeState;
  /** "2–1" quando encerrada. */
  score: string | null;
  winner: 'A' | 'B' | null;
}

export interface GradeRow {
  /** "11:20". */
  label: string;
  startMs: number;
  /** Quantas "alturas de cartão" a linha ocupa: 2+ quando dois jogos caem no mesmo bloco da mesma
   *  quadra (a programação real não segue a grade de 40 min à risca) — nenhum jogo some. */
  span: number;
  /** Posição da linha, em alturas de cartão, desde o topo da trilha. */
  offset: number;
  /** Uma lista por quadra (mesma ordem de `courts`); vazia = horário sem jogo. */
  cells: GradeCell[][];
}

export interface GradeView {
  courts: { id: string; number: number; name: string }[];
  rows: GradeRow[];
  /** Linha que contém o agora e a fração (0–1) dentro dela; `null` = fora do intervalo da grade. */
  now: { row: number; frac: number; label: string } | null;
  /** Primeira linha visível (rolagem automática). */
  firstVisible: number;
  /** Altura total da trilha, em alturas de cartão. */
  totalUnits: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const clockOf = (ms: number): string => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayKeyOf = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Dia (chave local `yyyy-mm-dd`) a mostrar, ou `null` sem nenhum jogo agendado. */
export function gradeDayOf(matches: readonly TournamentMatch[], nowMs: number): string | null {
  const days = [...new Set(matches.filter((m) => m.scheduledAt != null).map((m) => dayKeyOf(m.scheduledAt!.getTime())))].sort();
  if (days.length === 0) return null;
  const today = dayKeyOf(nowMs);
  if (days.includes(today)) return today;
  return days.find((d) => d > today) ?? days[days.length - 1]!;
}

export function gradeViewOf(
  matches: readonly TournamentMatch[],
  courts: readonly OrganizerTournamentCourt[],
  nowMs: number,
): GradeView | null {
  const day = gradeDayOf(matches, nowMs);
  if (!day) return null;
  const cols = [...courts].sort((x, y) => x.order - y.order).slice(0, GRADE_MAX_COURTS);
  if (cols.length === 0) return null;
  const colIndex = new Map(cols.map((c, i) => [c.id, i] as const));
  // Jogo antigo só gravou o NOME da quadra (sem `courtId` que case): cai na coluna de mesmo nome.
  const nameIndex = new Map(cols.map((c, i) => [c.name.trim().toLowerCase(), i] as const));
  const colOf = (m: TournamentMatch): number | undefined => colIndex.get(m.courtId) ?? nameIndex.get((m.court ?? '').trim().toLowerCase());
  const dayMatches = matches.filter(
    (m) =>
      m.scheduledAt != null &&
      m.status !== 'canceled' &&
      !isKingOfCourtMatchType(m.matchType) &&
      colOf(m) !== undefined &&
      dayKeyOf(m.scheduledAt.getTime()) === day,
  );
  if (dayMatches.length === 0) return null;

  const times = dayMatches.map((m) => m.scheduledAt!.getTime());
  const slotMs = GRADE_SLOT_MIN * 60_000;
  const start = Math.min(...times);
  const slots = Math.floor((Math.max(...times) - start) / slotMs) + 1;
  const rows: GradeRow[] = Array.from({ length: slots }, (_, i) => ({
    label: clockOf(start + i * slotMs),
    startMs: start + i * slotMs,
    span: 1,
    offset: 0,
    cells: cols.map(() => []),
  }));

  // "Próximo": o primeiro jogo ainda por vir de cada quadra (não encerrado e não ao vivo).
  const nextIds = new Set<string>();
  for (const [ci] of cols.entries()) {
    const first = dayMatches
      .filter((m) => colOf(m) === ci && m.status === 'scheduled' && m.scheduledAt!.getTime() >= nowMs - slotMs)
      .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())[0];
    if (first) nextIds.add(first.id);
  }

  for (const m of [...dayMatches].sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime() || a.matchNumber - b.matchNumber)) {
    const r = Math.floor((m.scheduledAt!.getTime() - start) / slotMs);
    const state: GradeState = m.status === 'completed' ? 'final' : m.status === 'in_progress' ? 'live' : nextIds.has(m.id) ? 'next' : 'scheduled';
    const [sa, sb] = matchSetWins(m);
    rows[r]!.cells[colOf(m)!]!.push({
      matchId: m.id,
      categoryId: m.categoryId,
      phase: m.round?.trim() ?? '',
      a: { teamId: m.teamAId, label: m.team1Label },
      b: { teamId: m.teamBId, label: m.team2Label },
      state,
      score: state === 'final' ? `${sa}–${sb}` : null,
      winner: state === 'final' ? (m.winnerSide === 1 ? 'A' : m.winnerSide === 2 ? 'B' : sa > sb ? 'A' : sb > sa ? 'B' : null) : null,
    });
  }

  // Alturas variáveis: a linha cresce com o maior número de jogos empilhados numa quadra.
  let acc = 0;
  for (const r of rows) {
    r.span = Math.max(1, ...r.cells.map((c) => c.length));
    r.offset = acc;
    acc += r.span;
  }
  const totalUnits = acc;

  const idx = Math.floor((nowMs - start) / slotMs);
  const now = nowMs >= start && idx < slots ? { row: idx, frac: ((nowMs - start) % slotMs) / slotMs, label: clockOf(nowMs) } : null;
  // Antes do 1º jogo mostra o começo; depois do último, o fim.
  const anchor = now ? now.row : nowMs < start ? 0 : slots - 1;
  // Última linha de partida que ainda deixa a janela cheia (GRADE_VISIBLE_ROWS alturas).
  let maxFirst = 0;
  rows.forEach((r, i) => {
    if (totalUnits - r.offset >= GRADE_VISIBLE_ROWS) maxFirst = i;
  });
  return { courts: cols.map((c, i) => ({ id: c.id, number: Number(/(\d+)/.exec(c.name)?.[1] ?? i + 1), name: c.name })), rows, now, firstVisible: Math.min(maxFirst, Math.max(0, anchor - GRADE_ROWS_BEFORE_NOW)), totalUnits };
}
