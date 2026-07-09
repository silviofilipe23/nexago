import { MOCK_DISCOVERY_LEAGUES, MOCK_DISCOVERY_TOURNAMENTS } from './tournament-discovery.mock';
import type { DiscoveryLeague } from './tournament-discovery.models';
import type { LeagueDetailData, LeagueStage } from './league-detail.models';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'LG';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'LG';
}

const CURATED_BY_ID: Record<string, LeagueDetailData> = {
  'copa-goias-beach-2026': {
    id: 'copa-goias-beach-2026',
    name: 'Copa Goiás Beach 2026',
    statusLabel: 'Em andamento',
    formatLabel: 'Liga · 6 etapas',
    citiesSummary: '6 cidades · GO/DF',
    periodLabel: 'Fevereiro a Outubro de 2026',
    aboutText:
      'Circuito estadual de vôlei de praia com 6 etapas em cidades de Goiás e Distrito Federal. Os pontos das melhores 5 etapas somam para o ranking geral — a pior é descartada.',

    yourRank: 1,
    yourDuoName: 'Marcelo / Enzo',
    yourPoints: 730,
    nextStageLabel: 'Etapa 3 · Aparecida de Goiânia',

    stages: [
      {
        id: 'cgb-26-goiania',
        order: 1,
        name: 'Etapa Goiânia',
        city: 'Goiânia, GO',
        dateLabel: '21 – 23 fev',
        status: 'finished',
        placement: 1,
        points: 450,
        tournamentId: null,
      },
      {
        id: 'cgb-26-anapolis',
        order: 2,
        name: 'Open Anápolis',
        city: 'Anápolis, GO',
        dateLabel: '14 – 16 mar',
        status: 'finished',
        placement: 3,
        points: 280,
        tournamentId: null,
      },
      {
        id: 'cgb-26-aparecida',
        order: 3,
        name: 'Etapa Aparecida',
        city: 'Aparecida de Goiânia, GO',
        dateLabel: '18 – 20 abr',
        status: 'next',
        placement: null,
        points: null,
        tournamentId: 'etapa-aparecida-goias-beach',
      },
      {
        id: 'cgb-26-trindade',
        order: 4,
        name: 'Etapa Trindade',
        city: 'Trindade, GO',
        dateLabel: '13 – 15 jun',
        status: 'upcoming',
        placement: null,
        points: null,
        tournamentId: null,
      },
      {
        id: 'cgb-26-brasilia',
        order: 5,
        name: 'Etapa Brasília',
        city: 'Brasília, DF',
        dateLabel: '15 – 17 ago',
        status: 'upcoming',
        placement: null,
        points: null,
        tournamentId: null,
      },
      {
        id: 'cgb-26-final',
        order: 6,
        name: 'Grande Final',
        city: 'Goiânia, GO',
        dateLabel: '17 – 19 out',
        status: 'upcoming',
        placement: null,
        points: null,
        tournamentId: null,
      },
    ],
    stagesCompletedLabel: 'Após 2 de 6 etapas',

    ranking: [
      { rank: 1, duoName: 'Marcelo / Enzo', isViewer: true, pointsByStage: [450, 280, null, null, null, null], total: 730 },
      { rank: 2, duoName: 'Sá / Toledo', isViewer: false, pointsByStage: [380, 320, null, null, null, null], total: 700 },
      { rank: 3, duoName: 'Rafa / Tonho', isViewer: false, pointsByStage: [320, 360, null, null, null, null], total: 680 },
      { rank: 4, duoName: 'Carla / Igor', isViewer: false, pointsByStage: [280, 300, null, null, null, null], total: 580 },
      { rank: 5, duoName: 'Bruno / Carla A.', isViewer: false, pointsByStage: [250, 260, null, null, null, null], total: 510 },
    ],

    prizeTotalLabel: 'R$ 18.400',
    nextStagePriceLabel: 'R$ 90/etapa',
    nextStageTournamentId: 'etapa-aparecida-goias-beach',

    categoriesLabel: 'Masculino, Feminino e Misto',
    rankingCalcLabel: 'Soma de pontos das 6 etapas · descarta a pior',
    priceLabel: 'R$ 90/etapa',

    organizerName: 'Federação Goiana de Vôlei de Praia',
    organizerInitials: 'FG',
    organizerVerified: true,
  },
};

/** Deriva uma central de liga honesta a partir do cadastro básico (`MOCK_DISCOVERY_LEAGUES`),
 *  pra ligas sem dado curado — sem inventar posição, ranking ou premiação. */
function genericLeagueDetail(listing: DiscoveryLeague): LeagueDetailData {
  const stages: LeagueStage[] = [...listing.stages]
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const tournament = MOCK_DISCOVERY_TOURNAMENTS.find((t) => s.tournamentIds.includes(t.id));
      return {
        id: s.id,
        order: s.order,
        name: s.name,
        city: tournament?.city ?? '—',
        dateLabel: s.dateLabel ?? tournament?.dateLabel ?? '—',
        status: 'upcoming',
        placement: null,
        points: null,
        tournamentId: tournament?.id ?? null,
      };
    });

  return {
    id: listing.id,
    name: listing.name,
    statusLabel: 'Inscrições abertas',
    formatLabel: `Liga · ${stages.length} etapa${stages.length === 1 ? '' : 's'}`,
    citiesSummary: listing.city ?? '—',
    periodLabel: listing.seasonLabel ?? '',
    aboutText: null,

    yourRank: null,
    yourDuoName: null,
    yourPoints: null,
    nextStageLabel: null,

    stages,
    stagesCompletedLabel: null,

    ranking: [],

    prizeTotalLabel: null,
    nextStagePriceLabel: null,
    nextStageTournamentId: stages[0]?.tournamentId ?? null,

    categoriesLabel: null,
    rankingCalcLabel: null,
    priceLabel: null,

    organizerName: listing.name,
    organizerInitials: initialsOf(listing.name),
    organizerVerified: false,
  };
}

export function getLeagueDetail(id: string): LeagueDetailData | null {
  const curated = CURATED_BY_ID[id];
  if (curated) return curated;
  const listing = MOCK_DISCOVERY_LEAGUES.find((l) => l.id === id);
  if (!listing) return null;
  return genericLeagueDetail(listing);
}
