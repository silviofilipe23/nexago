import { buildGroupStandings, type TournamentMatch } from '../../painel/data/matches-repository';
import { matchLiveCurrentSet } from '../../painel/data/live-set-display';

/** Tabela do grupo: classificação de uma categoria disputada em grupos, calculada das partidas
 *  (vitórias → saldo de sets → saldo de pontos → confronto direto, via `buildGroupStandings`; jogo
 *  ao vivo não conta). Puro — a tela só desenha. */

export type GrupoZone = 'lider' | 'classifica' | 'fora';
export type GrupoProgress = 'live' | 'andamento' | 'encerrado';

export interface GrupoRow {
  pos: number;
  teamId: string;
  label: string;
  j: number;
  v: number;
  d: number;
  /** "4:1". */
  sets: string;
  /** Saldo de pontos (marcados − sofridos). */
  saldo: number;
  zone: GrupoZone;
  /** "Lidera · Oitavas" · "Zona de classificação" · "Fora da zona" — ou "Classificada"/"Eliminada" com o grupo encerrado. */
  status: string;
}

export interface GrupoGame {
  matchId: string;
  a: { teamId: string; label: string };
  b: { teamId: string; label: string };
  state: 'final' | 'live' | 'scheduled';
  /** "2–1" (sets) quando encerrado; "14–11" (set atual) ao vivo. */
  score: string | null;
  /** "19-21 21-18 15-12" quando encerrado; "Ao vivo · 1º set" ao vivo. */
  detail: string | null;
  winner: 'A' | 'B' | null;
}

export interface GrupoView {
  /** Letra do grupo ("A"). */
  key: string;
  title: string;
  rows: GrupoRow[];
  games: GrupoGame[];
  progress: GrupoProgress;
  /** "Jogo em andamento" · "Jogos 4 de 6" · "Grupo encerrado". */
  progressText: string;
  /** "2 vagas · Oitavas". */
  vagas: string;
  nextPhase: string;
  qualifiers: number;
}

const isGroupMatch = (m: TournamentMatch): boolean => m.matchType.trim().toLowerCase() === 'group' && (m.round ?? '').startsWith('Grupo ') && m.status !== 'canceled';

/** Letra do grupo a partir do rótulo ("Grupo A" → "A"). */
export const groupKeyOf = (m: TournamentMatch): string => (m.round ?? '').slice('Grupo '.length).trim();

/** Fase que os classificados disputam, pelo total de vagas (grupos × classificados por grupo). */
export function nextPhaseOf(totalQualifiers: number): string {
  if (totalQualifiers > 8) return 'Oitavas';
  if (totalQualifiers > 4) return 'Quartas';
  if (totalQualifiers > 2) return 'Semifinal';
  if (totalQualifiers === 2) return 'Final';
  return 'Eliminatória';
}

/** Categorias com fase de grupos entre as partidas. */
export function categoriesWithGroups(matches: readonly TournamentMatch[]): string[] {
  return [...new Set(matches.filter(isGroupMatch).map((m) => m.categoryId ?? ''))].filter((c) => c !== '');
}

export function gruposViewOf(matches: readonly TournamentMatch[], categoryId: string | null, qualifiersPerGroup: number): GrupoView[] {
  const cat = categoryId ?? categoriesWithGroups(matches)[0] ?? null;
  if (cat == null) return [];
  const inCategory = matches.filter((m) => isGroupMatch(m) && m.categoryId === cat);
  const keys = [...new Set(inCategory.map(groupKeyOf))].filter((k) => k !== '').sort();
  const q = Math.max(0, qualifiersPerGroup);
  const nextPhase = nextPhaseOf(keys.length * q);
  return keys.map((key): GrupoView => {
    const gm = inCategory.filter((m) => groupKeyOf(m) === key).sort((a, b) => a.matchNumber - b.matchNumber);
    const played = gm.filter((m) => m.status === 'completed').length;
    const live = gm.some((m) => m.status === 'in_progress');
    const progress: GrupoProgress = played === gm.length ? 'encerrado' : live ? 'live' : 'andamento';
    const finished = progress === 'encerrado';
    const rows = buildGroupStandings(gm).map((s, i): GrupoRow => {
      const zone: GrupoZone = i === 0 ? 'lider' : i < q ? 'classifica' : 'fora';
      const status = finished
        ? i < q
          ? 'Classificada'
          : 'Eliminada'
        : zone === 'lider'
          ? `Lidera · ${nextPhase}`
          : zone === 'classifica'
            ? 'Zona de classificação'
            : 'Fora da zona';
      return { pos: i + 1, teamId: s.teamId, label: s.teamLabel, j: s.wins + s.losses, v: s.wins, d: s.losses, sets: `${s.setsWon}:${s.setsLost}`, saldo: s.gamesWon - s.gamesLost, zone, status };
    });
    const games = gm.map((m): GrupoGame => {
      const a = { teamId: m.teamAId, label: m.team1Label };
      const b = { teamId: m.teamBId, label: m.team2Label };
      if (m.status === 'completed') {
        const sa = m.sets.filter((s) => s.a > s.b).length;
        const sb = m.sets.filter((s) => s.b > s.a).length;
        return { matchId: m.id, a, b, state: 'final', score: `${sa}–${sb}`, detail: m.sets.map((s) => `${s.a}-${s.b}`).join(' '), winner: m.winnerSide === 1 ? 'A' : m.winnerSide === 2 ? 'B' : sa > sb ? 'A' : sb > sa ? 'B' : null };
      }
      if (m.status === 'in_progress') {
        const cur = matchLiveCurrentSet(m);
        return { matchId: m.id, a, b, state: 'live', score: cur ? `${cur.a}–${cur.b}` : '0–0', detail: `Ao vivo · ${cur?.setNumber ?? 1}º set`, winner: null };
      }
      return { matchId: m.id, a, b, state: 'scheduled', score: null, detail: 'A jogar', winner: null };
    });
    return {
      key,
      title: `Grupo ${key}`,
      rows,
      games,
      progress,
      progressText: progress === 'live' ? 'Jogo em andamento' : finished ? 'Grupo encerrado' : `Jogos ${played} de ${gm.length}`,
      vagas: `${q} ${q === 1 ? 'vaga' : 'vagas'} · ${nextPhase}`,
      nextPhase,
      qualifiers: q,
    };
  });
}
