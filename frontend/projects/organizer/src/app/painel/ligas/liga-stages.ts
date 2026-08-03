import type { League, LeagueStage } from '@nexago/leagues';
import type { PillTone } from '../data/mock-data';
import type { OrganizerTournament } from '../data/tournament.model';

/** Estado operacional de uma etapa da liga.
 *
 *  O campo `status` gravado dentro de `stages[]` é do rascunho do wizard ('planned'/'defined'),
 *  não do dia de jogo — quem sabe o que está acontecendo é o torneio referenciado por
 *  `tournamentIds`. Etapa sem torneio é etapa só planejada: existe no plano da temporada mas
 *  ainda não foi publicada, e o organizador precisa passar pelo wizard de etapa. */

export type LigaEtapaStatus = 'planejada' | 'inscricoes' | 'andamento' | 'concluida' | 'cancelada';

export const LIGA_ETAPA_STATUS_LABEL: Record<LigaEtapaStatus, string> = {
  planejada: 'A definir',
  inscricoes: 'Inscrições abertas',
  andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const LIGA_ETAPA_STATUS_TONE: Record<LigaEtapaStatus, PillTone> = {
  planejada: 'dim',
  inscricoes: 'orange',
  andamento: 'green',
  concluida: 'dim',
  cancelada: 'red',
};

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

export interface LigaEtapaRow {
  stageId: string;
  order: number;
  name: string;
  isGrandFinal: boolean;
  status: LigaEtapaStatus;
  statusLabel: string;
  statusTone: PillTone;
  local: string;
  dateLabel: string;
  startAt: Date | null;
  tournamentId: string | null;
  inscritos: number | null;
  vagas: number | null;
}

export function ligaEtapaStatusOf(tournament: OrganizerTournament | undefined | null): LigaEtapaStatus {
  if (!tournament) return 'planejada';
  switch (tournament.status) {
    case 'cancelado':
      return 'cancelada';
    case 'concluido':
      return 'concluida';
    case 'andamento':
      return 'andamento';
    default:
      return 'inscricoes';
  }
}

function dateLabelOf(stage: LeagueStage, tournament: OrganizerTournament | undefined): string {
  if (stage.dateLabel) return stage.dateLabel;
  const start = tournament?.startAt ?? stage.startAt;
  if (!start) return 'Data a definir';
  const end = tournament?.endAt ?? stage.endAt;
  if (!end || end.getTime() === start.getTime()) return SHORT_DATE.format(start);
  return `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`;
}

function localOf(league: League, stage: LeagueStage, tournament: OrganizerTournament | undefined): string {
  const place = tournament?.location ?? stage.locationName;
  const city = tournament?.city ?? stage.city ?? league.city;
  return [place, city].filter((p): p is string => !!p && p.length > 0).join(' · ') || 'Local a definir';
}

/** Junta o plano da temporada (`league.stages`) com os torneios publicados de cada etapa. */
export function buildLigaEtapaRows(params: {
  league: League;
  tournamentsById: ReadonlyMap<string, OrganizerTournament>;
  inscritosByTournament?: ReadonlyMap<string, number>;
}): LigaEtapaRow[] {
  const { league, tournamentsById, inscritosByTournament } = params;
  return league.stages.map((stage) => {
    const tournament = stage.tournamentId ? tournamentsById.get(stage.tournamentId) : undefined;
    const status = ligaEtapaStatusOf(tournament);
    return {
      stageId: stage.id,
      order: stage.order,
      name: stage.name || `Etapa ${stage.order}`,
      isGrandFinal: stage.isGrandFinal,
      status,
      statusLabel: LIGA_ETAPA_STATUS_LABEL[status],
      statusTone: LIGA_ETAPA_STATUS_TONE[status],
      local: localOf(league, stage, tournament),
      dateLabel: dateLabelOf(stage, tournament),
      startAt: tournament?.startAt ?? stage.startAt,
      tournamentId: stage.tournamentId,
      inscritos: stage.tournamentId ? (inscritosByTournament?.get(stage.tournamentId) ?? null) : null,
      vagas: tournament?.capacity ?? null,
    };
  });
}

/** Próxima etapa: a mais cedo ainda não encerrada, com data. Sem data, cai na primeira em
 *  aberto pela ordem do plano. Etapas canceladas nunca contam. */
export function nextLigaEtapa(rows: readonly LigaEtapaRow[]): LigaEtapaRow | null {
  const open = rows.filter((r) => r.status !== 'concluida' && r.status !== 'cancelada');
  if (open.length === 0) return null;
  const dated = open.filter((r) => r.startAt != null);
  if (dated.length === 0) return open.slice().sort((a, b) => a.order - b.order)[0] ?? null;
  return dated.slice().sort((a, b) => a.startAt!.getTime() - b.startAt!.getTime())[0] ?? null;
}
