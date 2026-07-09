import type {
  BracketMatch,
  BracketRound,
  CategoryBracketData,
  CategoryGroup,
  GroupStanding,
} from './bracket-results.models';

function duo(id: string, name: string, isViewer = false) {
  return { id, name, isViewer };
}

function standing(
  rank: number,
  d: ReturnType<typeof duo>,
  wins: number,
  losses: number,
  setsFor: number,
  setsAgainst: number,
  points: number,
): GroupStanding {
  return {
    rank,
    duo: d,
    wins,
    losses,
    setsFor,
    setsAgainst,
    points,
    qualifies: rank <= 2,
  };
}

function tbdMatch(id: string): BracketMatch {
  return {
    id,
    status: 'tbd',
    scheduledLabel: null,
    sideA: { duo: null, score: null, winner: false },
    sideB: { duo: null, score: null, winner: false },
  };
}

function doneMatch(id: string, a: ReturnType<typeof duo>, scoreA: number, b: ReturnType<typeof duo>, scoreB: number): BracketMatch {
  return {
    id,
    status: 'done',
    scheduledLabel: null,
    sideA: { duo: a, score: scoreA, winner: scoreA > scoreB },
    sideB: { duo: b, score: scoreB, winner: scoreB > scoreA },
  };
}

function liveMatch(id: string, a: ReturnType<typeof duo>, b: ReturnType<typeof duo>): BracketMatch {
  return {
    id,
    status: 'live',
    scheduledLabel: null,
    sideA: { duo: a, score: null, winner: false },
    sideB: { duo: b, score: null, winner: false },
  };
}

function scheduledMatch(id: string, a: ReturnType<typeof duo>, b: ReturnType<typeof duo>, time: string): BracketMatch {
  return {
    id,
    status: 'scheduled',
    scheduledLabel: time,
    sideA: { duo: a, score: null, winner: false },
    sideB: { duo: b, score: null, winner: false },
  };
}

function emptyPreviewRounds(): BracketRound[] {
  return [
    { id: 'qf', label: 'Quartas', matches: [tbdMatch('qf1'), tbdMatch('qf2'), tbdMatch('qf3'), tbdMatch('qf4')] },
    { id: 'sf', label: 'Semifinais', matches: [tbdMatch('sf1'), tbdMatch('sf2')] },
    { id: 'final', label: 'Final', matches: [tbdMatch('final')] },
  ];
}

function femininoProGroups(): CategoryGroup[] {
  return [
    {
      id: 'grupo-a',
      letter: 'A',
      standings: [
        standing(1, duo('rafaela-carla', 'Rafaela & Carla M.'), 3, 0, 6, 1, 9),
        standing(2, duo('larissa-taina', 'Larissa & Tainá'), 2, 1, 5, 3, 6),
        standing(3, duo('gabriela-vitoria', 'Gabriela & Vitória'), 1, 2, 3, 5, 3),
        standing(4, duo('ana-bia', 'Ana P. & Bia S.'), 0, 3, 1, 6, 0),
      ],
    },
    {
      id: 'grupo-b',
      letter: 'B',
      standings: [
        standing(1, duo('ana-beto', 'Ana R. & Beto L.'), 3, 0, 6, 0, 9),
        standing(2, duo('carla-marcelo', 'Carla A. & Marcelo', true), 2, 1, 4, 3, 6),
        standing(3, duo('enzo-jorge', 'Enzo & Jorge'), 1, 2, 3, 4, 3),
        standing(4, duo('diego-luiz', 'Diego & Luiz'), 0, 3, 0, 6, 0),
      ],
    },
    {
      id: 'grupo-c',
      letter: 'C',
      standings: [
        standing(1, duo('igor-bruno', 'Igor M. & Bruno R.'), 3, 0, 6, 2, 9),
        standing(2, duo('pedro-rodrigo', 'Pedro S. & Rodrigo F.'), 2, 1, 5, 4, 6),
        standing(3, duo('vitor-tiago', 'Vitor M. & Tiago N.'), 1, 2, 3, 5, 3),
        standing(4, duo('fabio-renan', 'Fábio C. & Renan D.'), 0, 3, 1, 6, 0),
      ],
    },
  ];
}

function masculinoIntermediarioBracket(): BracketRound[] {
  const marceloEnzo = duo('marcelo-enzo', 'Marcelo / Enzo', true);
  const motaFialho = duo('mota-fialho', 'Mota / Fialho');
  const saToledo = duo('sa-toledo', 'Sá / Toledo');
  const reisAndrade = duo('reis-andrade', 'Reis / Andrade');
  const britoAlmeida = duo('brito-almeida', 'Brito / Almeida');
  const costaVieira = duo('costa-vieira', 'Costa / Vieira');
  const pimentelLisboa = duo('pimentel-lisboa', 'Pimentel / Lisboa');
  const nunesDias = duo('nunes-dias', 'Nunes / Dias');

  return [
    {
      id: 'qf',
      label: 'Quartas',
      matches: [
        doneMatch('qf1', marceloEnzo, 2, motaFialho, 0),
        doneMatch('qf2', saToledo, 2, reisAndrade, 1),
        doneMatch('qf3', britoAlmeida, 2, costaVieira, 0),
        doneMatch('qf4', pimentelLisboa, 1, nunesDias, 2),
      ],
    },
    {
      id: 'sf',
      label: 'Semifinais',
      matches: [liveMatch('sf1', marceloEnzo, saToledo), scheduledMatch('sf2', britoAlmeida, nunesDias, '16:30')],
    },
    { id: 'final', label: 'Final', matches: [tbdMatch('final')] },
  ];
}

const CURATED: Record<string, Record<string, CategoryBracketData>> = {
  'open-goiania-beach': {
    'masculino-intermediario': {
      categoryId: 'masculino-intermediario',
      categoryName: 'Masculino Intermediário',
      format: 'chave',
      formatSummaryLabel: 'Eliminatória simples · MD3 (final MD5) · 8 duplas',
      groups: [],
      groupsQualifyNote: null,
      eliminationPreviewRounds: [],
      bracketRounds: masculinoIntermediarioBracket(),
    },
    'feminino-pro': {
      categoryId: 'feminino-pro',
      categoryName: 'Feminino Pro',
      format: 'grupos',
      formatSummaryLabel: '3 grupos de 4 duplas · classificam 2 por grupo · 12 duplas',
      groups: femininoProGroups(),
      groupsQualifyNote: 'As 2 primeiras duplas de cada grupo avançam para as quartas de final.',
      eliminationPreviewRounds: emptyPreviewRounds(),
      bracketRounds: [],
    },
    'misto-iniciante': {
      categoryId: 'misto-iniciante',
      categoryName: 'Misto Iniciante',
      format: 'chave',
      formatSummaryLabel: 'Eliminatória simples · MD3 (final MD5)',
      groups: [],
      groupsQualifyNote: null,
      eliminationPreviewRounds: [],
      bracketRounds: [],
    },
  },
};

export function getCategoryBracketData(
  tournamentId: string,
  categoryId: string,
  categoryName: string,
): CategoryBracketData | null {
  const curated = CURATED[tournamentId]?.[categoryId];
  if (curated) return curated;
  return {
    categoryId,
    categoryName,
    format: 'chave',
    formatSummaryLabel: 'Chave ainda não gerada',
    groups: [],
    groupsQualifyNote: null,
    eliminationPreviewRounds: [],
    bracketRounds: [],
  };
}
