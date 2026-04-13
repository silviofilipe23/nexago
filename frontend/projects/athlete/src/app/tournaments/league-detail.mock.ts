import type { LeagueDetailBundle } from './league-detail.models';

const LIGA_ID = 'circuito-verao-nexago-2026';

function buildRankingPairs() {
  return [
    { rank: 1, name: 'Silva / Costa', points: 1840, deltaPositions: 0, avatarLetter: 'S', genderScope: 'M' as const, mode: 'pair' as const },
    { rank: 2, name: 'Oliveira / Santos', points: 1792, deltaPositions: 1, avatarLetter: 'O', genderScope: 'M' as const, mode: 'pair' as const },
    { rank: 3, name: 'Lima / Pereira', points: 1755, deltaPositions: -1, avatarLetter: 'L', genderScope: 'F' as const, mode: 'pair' as const },
    { rank: 4, name: 'Alves / Rocha', points: 1688, deltaPositions: 2, avatarLetter: 'A', genderScope: 'Mix' as const, mode: 'pair' as const },
    { rank: 5, name: 'Melo / Dias', points: 1620, deltaPositions: -2, avatarLetter: 'M', genderScope: 'M' as const, mode: 'pair' as const },
    { rank: 6, name: 'Ferreira / Gomes', points: 1588, deltaPositions: 0, avatarLetter: 'F', genderScope: 'F' as const, mode: 'pair' as const },
    { rank: 7, name: 'Ribeiro / Nunes', points: 1544, deltaPositions: 1, avatarLetter: 'R', genderScope: 'Mix' as const, mode: 'pair' as const },
    { rank: 8, name: 'Carvalho / Martins', points: 1510, deltaPositions: -1, avatarLetter: 'C', genderScope: 'M' as const, mode: 'pair' as const },
    { rank: 9, name: 'Araújo / Teixeira', points: 1488, deltaPositions: 3, avatarLetter: 'A', genderScope: 'F' as const, mode: 'pair' as const },
    { rank: 10, name: 'Pinto / Barbosa', points: 1460, deltaPositions: 0, avatarLetter: 'P', genderScope: 'Mix' as const, mode: 'pair' as const },
  ];
}

function buildRankingIndividuals() {
  return [
    { rank: 1, name: 'Marina Duarte', points: 1120, deltaPositions: 1, avatarLetter: 'M', genderScope: 'F' as const, mode: 'individual' as const },
    { rank: 2, name: 'Rafael Prado', points: 1095, deltaPositions: -1, avatarLetter: 'R', genderScope: 'M' as const, mode: 'individual' as const },
    { rank: 3, name: 'Luísa Freitas', points: 1078, deltaPositions: 0, avatarLetter: 'L', genderScope: 'F' as const, mode: 'individual' as const },
    { rank: 4, name: 'Igor Nascimento', points: 1042, deltaPositions: 2, avatarLetter: 'I', genderScope: 'M' as const, mode: 'individual' as const },
    { rank: 5, name: 'Camila Rezende', points: 1020, deltaPositions: -2, avatarLetter: 'C', genderScope: 'F' as const, mode: 'individual' as const },
    { rank: 6, name: 'Pedro Vale', points: 1005, deltaPositions: 0, avatarLetter: 'P', genderScope: 'M' as const, mode: 'individual' as const },
    { rank: 7, name: 'Julia Motta', points: 988, deltaPositions: 1, avatarLetter: 'J', genderScope: 'F' as const, mode: 'individual' as const },
    { rank: 8, name: 'Bruno Paes', points: 965, deltaPositions: -1, avatarLetter: 'B', genderScope: 'M' as const, mode: 'individual' as const },
    { rank: 9, name: 'Nina Lacerda', points: 940, deltaPositions: 0, avatarLetter: 'N', genderScope: 'F' as const, mode: 'individual' as const },
    { rank: 10, name: 'Vitor Azevedo', points: 922, deltaPositions: 4, avatarLetter: 'V', genderScope: 'M' as const, mode: 'individual' as const },
  ];
}

/**
 * Dados enriquecidos da central da liga (mock).
 * `registrationEndsAt` é recalculado a cada chamada para o countdown parecer vivo.
 */
export function getLeagueDetailBundle(id: string): LeagueDetailBundle | null {
  if (id !== LIGA_ID) {
    return null;
  }

  const registrationEndsAt = new Date();
  registrationEndsAt.setHours(registrationEndsAt.getHours() + 2);
  registrationEndsAt.setMinutes(registrationEndsAt.getMinutes() + 13);
  registrationEndsAt.setSeconds(registrationEndsAt.getSeconds() + 45);

  return {
    hero: {
      videoSrc: '/media/login-brand-bg.mp4',
      name: 'Circuito Verão NexaGO',
      city: 'Circuito nacional · praias parceiras',
      seasonLabel: 'Temporada 2026',
      uiStatus: 'in_progress',
      statusHeadline: 'Temporada em andamento',
      statusSubline: 'Próxima etapa em 5 dias · ranking vivo',
    },
    timeline: [
      {
        id: 'cv-26-nordeste-a',
        name: 'Etapa Nordeste — Wave I',
        shortLabel: 'E1',
        dateLabel: 'Mar–abr',
        dateRangeDetail: 'Encerrada · 2 torneios disputados · ranking consolidado.',
        status: 'finished',
        categoriesSummary: 'M / F / Misto · Open A–C',
        enrolledApprox: 186,
        primaryTournamentId: 'ranked-friday-recife',
      },
      {
        id: 'cv-26-nordeste-b',
        name: 'Etapa Nordeste — Beach Pro',
        shortLabel: 'E2',
        dateLabel: '18–20 abr',
        dateRangeDetail: 'Inscrições na reta final · arena em Salvador.',
        status: 'current',
        categoriesSummary: 'Duplas · Open / Intermediário',
        enrolledApprox: 428,
        primaryTournamentId: 'nx-beach-pro-2026',
      },
      {
        id: 'cv-26-sudeste',
        name: 'Etapa Sudeste',
        shortLabel: 'E3',
        dateLabel: 'Jun–jul',
        dateRangeDetail: 'SP + RJ · night open e etapa carioca.',
        status: 'future',
        categoriesSummary: 'Misto prioritário · vagas amplas',
        enrolledApprox: 0,
        primaryTournamentId: 'night-open-sp',
      },
      {
        id: 'cv-26-final',
        name: 'Grande final da temporada',
        shortLabel: 'GF',
        dateLabel: 'Ago 2026',
        dateRangeDetail: 'Classificados pelo ranking acumulado da liga.',
        status: 'future',
        categoriesSummary: 'Convite + wildcards',
        enrolledApprox: 0,
        primaryTournamentId: null,
      },
    ],
    rankingPairs: buildRankingPairs(),
    rankingIndividuals: buildRankingIndividuals(),
    stats: [
      { id: 'stages', label: 'Etapas na temporada', value: 4, suffix: '' },
      { id: 'athletes', label: 'Atletas na liga', value: 1284, suffix: '' },
      { id: 'matches', label: 'Jogos realizados', value: 312, suffix: '' },
      { id: 'crowd', label: 'Média de público', value: 420, suffix: '/ etapa' },
    ],
    nextStage: {
      stageName: 'Etapa Nordeste — Beach Pro',
      dateLabel: '18 a 20 de abril',
      location: 'Arena NexaGO Sul',
      city: 'Salvador',
      categoriesLine: 'Masculino Open A · Feminino Open B · Misto recreativo',
      spotsLeft: 3,
      spotsTotal: 64,
      tournamentId: 'nx-beach-pro-2026',
      registrationEndsAt: registrationEndsAt.toISOString(),
      urgent: true,
    },
    feed: [
      {
        id: 'lf1',
        athleteName: '@marina.beach',
        text: 'Circuito Verão tá insano — bora subir no ranking?',
        hashtag: '#CircuitoVeraoNexaGO',
        likes: 256,
        comments: 31,
        mediaGradient: 'linear-gradient(135deg, #0d9488 0%, #6366f1 100%)',
      },
      {
        id: 'lf2',
        athleteName: '@dupla_raiz',
        text: 'Pódio na última etapa! Próxima parada: Salvador 🔥',
        hashtag: '#CircuitoVeraoNexaGO',
        likes: 189,
        comments: 22,
        mediaGradient: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 55%, #f97316 100%)',
      },
      {
        id: 'lf3',
        athleteName: '@night_open_sp',
        text: 'Highlight do tie-break — que rally!',
        hashtag: '#NightOpenSP',
        likes: 402,
        comments: 58,
        mediaGradient: 'linear-gradient(160deg, #1e1b4b 0%, #7c3aed 40%, #f59e0b 100%)',
      },
      {
        id: 'lf4',
        athleteName: '@arena.nexago',
        text: 'Bastidores da etapa Nordeste — estrutura premium.',
        hashtag: '#NexaGO',
        likes: 97,
        comments: 9,
        mediaGradient: 'linear-gradient(120deg, #0369a1 0%, #22d3ee 100%)',
      },
    ],
    lastStageTitle: 'Última etapa encerrada — Ranked Friday Recife',
    lastStagePodium: [
      { place: 1, name: 'Team Nordeste', subtitle: '42 pts na final' },
      { place: 2, name: 'Areia 98', subtitle: '39 pts' },
      { place: 3, name: 'Rede Fina', subtitle: '36 pts' },
    ],
    progression: {
      yourRank: 12,
      yourPoints: 1180,
      pointsToTop10: 80,
      topLabel: 'TOP 10 geral da liga',
    },
    regulationParagraphs: [
      'Pontuação: resultados das categorias oficiais alimentam o ranking da liga com pesos por fase.',
      'Elegibilidade: atletas precisam cumprir check-in e documentação em cada etapa.',
      'Desempates: confronto direto, saldo de sets e fair-play — detalhes no regulamento completo (PDF).',
    ],
    athletesPreview: [
      { id: '1', name: 'Marina Duarte', handle: '@marina.beach', letter: 'M' },
      { id: '2', name: 'Rafael Prado', handle: '@rafaprado', letter: 'R' },
      { id: '3', name: 'Silva / Costa', handle: '@silvacosta', letter: 'S' },
      { id: '4', name: 'Luísa Freitas', handle: '@lufreitas', letter: 'L' },
      { id: '5', name: 'Igor Nascimento', handle: '@igorn', letter: 'I' },
      { id: '6', name: 'Oliveira / Santos', handle: '@olisan', letter: 'O' },
      { id: '7', name: 'Camila Rezende', handle: '@camirez', letter: 'C' },
      { id: '8', name: 'Team Nordeste', handle: '@teamnordeste', letter: 'T' },
    ],
  };
}
