import {
  matchIsCanceled,
  matchIsCompleted,
  matchIsLive,
  matchLiveCurrentSet,
  matchSetWins,
  type TournamentMatch,
} from '../data/matches-repository';

/** Recorte da Central de Partidas do app (`organizer_match_center_page.dart`) que o mesário usa
 *  no navegador: as partidas do torneio em três seções, com o placar já formatado. Puro de
 *  propósito — a tela só injeta como resolver nomes. */

export type MesaSection = 'live' | 'upcoming' | 'finished';

export interface MesaMatchRow {
  id: string;
  categoryId: string;
  categoryLabel: string;
  teamALabel: string;
  teamBLabel: string;
  section: MesaSection;
  /** "1×0" (sets) e, ao vivo, o set em andamento: "1×0 · 14-12". Vazio quando não começou. */
  scoreLabel: string;
  /** "Quadra 2 · 14:30" — o que o mesário precisa pra achar o jogo na areia. */
  metaLabel: string;
  /** Os dois lados definidos na chave: sem isso a mesa não abre. */
  ready: boolean;
  canceled: boolean;
}

const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export interface MesaMatchLabels {
  teamA: string;
  teamB: string;
  category: string;
}

function sectionOf(m: TournamentMatch): MesaSection {
  if (matchIsLive(m)) return 'live';
  if (matchIsCompleted(m) || matchIsCanceled(m)) return 'finished';
  return 'upcoming';
}

function courtLabel(courtName: string | null): string | null {
  if (!courtName) return null;
  return /quadra/i.test(courtName) ? courtName : `Quadra ${courtName}`;
}

export function mesaScoreLabel(m: TournamentMatch): string {
  const [a, b] = matchSetWins(m);
  const current = matchLiveCurrentSet(m);
  if (current) return `${a}×${b} · ${current.a}-${current.b}`;
  if (matchIsLive(m) || matchIsCompleted(m)) return `${a}×${b}`;
  return '';
}

/** Ao vivo primeiro (mais antiga no topo — quem começou antes acaba antes), depois as próximas
 *  em ordem de horário e, no fim, as encerradas mais recentes. Sem horário, cai pro número da
 *  partida, que é a ordem da planta. */
function compareRows(a: TournamentMatch, b: TournamentMatch, section: MesaSection): number {
  const at = a.scheduleTime?.getTime() ?? null;
  const bt = b.scheduleTime?.getTime() ?? null;
  if (at != null && bt != null && at !== bt) return section === 'finished' ? bt - at : at - bt;
  if (at != null && bt == null) return -1;
  if (at == null && bt != null) return 1;
  return a.matchNumber - b.matchNumber;
}

export function buildMesaRows(matches: readonly TournamentMatch[], resolve: (m: TournamentMatch) => MesaMatchLabels): MesaMatchRow[] {
  const withSection = matches.map((m) => ({ m, section: sectionOf(m) }));
  const order: Record<MesaSection, number> = { live: 0, upcoming: 1, finished: 2 };
  return withSection
    .sort((x, y) => order[x.section] - order[y.section] || compareRows(x.m, y.m, x.section))
    .map(({ m, section }) => {
      const labels = resolve(m);
      const meta = [courtLabel(m.courtName), m.scheduleTime ? TIME.format(m.scheduleTime) : null].filter((p): p is string => p != null);
      return {
        id: m.id,
        categoryId: m.categoryId,
        categoryLabel: labels.category,
        teamALabel: labels.teamA,
        teamBLabel: labels.teamB,
        section,
        scoreLabel: mesaScoreLabel(m),
        metaLabel: meta.join(' · '),
        ready: m.teamAId.length > 0 && m.teamBId.length > 0,
        canceled: matchIsCanceled(m),
      };
    });
}

export function rowsOfSection(rows: readonly MesaMatchRow[], section: MesaSection): MesaMatchRow[] {
  return rows.filter((r) => r.section === section);
}

/** Categorias presentes nas partidas, na ordem em que o torneio as declara. */
export function categoryFilterOptions(rows: readonly MesaMatchRow[]): Array<{ id: string; label: string }> {
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (r.categoryId && !seen.has(r.categoryId)) seen.set(r.categoryId, r.categoryLabel);
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}
