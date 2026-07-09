import type { DiscoveryTournament } from './tournament-discovery.models';

export type BracketPreviewState = 'soon' | 'live' | 'done';

export interface TournamentStageDetail {
  id: string;
  label: string;
  dateLabel: string;
  status: 'done' | 'current' | 'upcoming';
  description: string;
}

export interface TournamentCategoryOffer {
  id: string;
  name: string;
  genderLabel: string;
  level: string;
  spotsLeft: number;
  spotsTotal: number;
  priceLabel: string;
}

export interface TournamentPrizePlacement {
  place: number;
  label: string;
  percentLabel: string;
  amountLabel: string;
}

export interface RankingPreviewRow {
  rank: number;
  name: string;
  points: number;
  avatarLetter: string;
}

export interface TournamentSocialPost {
  id: string;
  athleteName: string;
  text: string;
  hashtag: string;
  likes: number;
  comments: number;
  /** Gradiente CSS para mídia placeholder */
  mediaGradient: string;
}

export interface TournamentAnnouncement {
  id: string;
  title: string;
  body: string;
  important: boolean;
  dateLabel: string;
}

export interface TournamentDetailExtended {
  rankingValid: boolean;
  dateDetail: string;
  formatLabel: string;
  prizeHint: string;
  mapQuery: string;
  stages: TournamentStageDetail[];
  categories: TournamentCategoryOffer[];
  totalPrizeLabel: string | null;
  prizeBreakdown: TournamentPrizePlacement[];
  rankingRows: RankingPreviewRow[];
  posts: TournamentSocialPost[];
  hasLiveStream: boolean;
  liveViewers: number;
  bracketState: BracketPreviewState;
  announcements: TournamentAnnouncement[];
}

const EXTRA_BY_ID: Record<string, TournamentDetailExtended> = {
  'nx-beach-pro-2026': {
    rankingValid: true,
    dateDetail: '18 a 20 de abril · Check-in a partir das 7h',
    formatLabel: 'Duplas · Fase de grupos + eliminatória',
    prizeHint: 'Premiação em dinheiro + pontos NexaGO Pro',
    mapQuery: 'Arena NexaGO Sul, Salvador',
    stages: [
      {
        id: 's1',
        label: 'Inscrições',
        dateLabel: 'Até 16 abr',
        status: 'current',
        description: 'Garanta sua vaga e escolha a categoria ideal para o seu nível.',
      },
      {
        id: 's2',
        label: 'Grupos',
        dateLabel: '18 abr',
        status: 'upcoming',
        description: 'Todos contra todos dentro do grupo. Top avança para mata-mata.',
      },
      {
        id: 's3',
        label: 'Playoffs',
        dateLabel: '19–20 abr',
        status: 'upcoming',
        description: 'Quartas, semis e grande final com transmissão ao vivo.',
      },
    ],
    categories: [
      {
        id: 'c1',
        name: 'Masculino Open A',
        genderLabel: 'Masculino',
        level: 'Avançado',
        spotsLeft: 2,
        spotsTotal: 16,
        priceLabel: 'R$ 280',
      },
      {
        id: 'c2',
        name: 'Feminino Open B',
        genderLabel: 'Feminino',
        level: 'Intermediário',
        spotsLeft: 6,
        spotsTotal: 16,
        priceLabel: 'R$ 240',
      },
      {
        id: 'c3',
        name: 'Misto Recreativo',
        genderLabel: 'Misto',
        level: 'Iniciante',
        spotsLeft: 12,
        spotsTotal: 20,
        priceLabel: 'R$ 200',
      },
    ],
    totalPrizeLabel: null,
    prizeBreakdown: [],
    rankingRows: [
      { rank: 1, name: 'Silva / Costa', points: 1840, avatarLetter: 'S' },
      { rank: 2, name: 'Oliveira / Santos', points: 1792, avatarLetter: 'O' },
      { rank: 3, name: 'Lima / Pereira', points: 1755, avatarLetter: 'L' },
      { rank: 4, name: 'Alves / Rocha', points: 1688, avatarLetter: 'A' },
      { rank: 5, name: 'Melo / Dias', points: 1620, avatarLetter: 'M' },
    ],
    posts: [
      {
        id: 'p1',
        athleteName: '@marina.beach',
        text: 'Contagem regressiva ligada! Quem vem?',
        hashtag: '#NexaGOBeachPro',
        likes: 128,
        comments: 14,
        mediaGradient: 'linear-gradient(135deg, #0d9488 0%, #6366f1 100%)',
      },
      {
        id: 'p2',
        athleteName: '@dupla_raiz',
        text: 'Treino pesado pra chegar afiada na arena.',
        hashtag: '#NexaGOBeachPro',
        likes: 89,
        comments: 7,
        mediaGradient: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 55%, #f97316 100%)',
      },
    ],
    hasLiveStream: false,
    liveViewers: 0,
    bracketState: 'soon',
    announcements: [
      {
        id: 'a1',
        title: 'Documentos obrigatórios',
        body: 'RG + comprovante de inscrição no check-in. Sem exceções.',
        important: true,
        dateLabel: 'Hoje',
      },
      {
        id: 'a2',
        title: 'Estacionamento',
        body: 'Parceiro com 20% de desconto para atletas — código NEXAGO20.',
        important: false,
        dateLabel: 'Ontem',
      },
    ],
  },
  'night-open-sp': {
    rankingValid: true,
    dateDetail: '12 de abril · Abertura das quadras 18h',
    formatLabel: 'Duplas · Eliminatória direta',
    prizeHint: 'Ranking NexaGO + kit oficial',
    mapQuery: 'Praia Artificial Pinheiros, São Paulo',
    stages: [
      {
        id: 's1',
        label: 'Inscrições',
        dateLabel: 'Encerradas',
        status: 'done',
        description: 'Todas as vagas confirmadas para a fase noturna.',
      },
      {
        id: 's2',
        label: 'Fase de grupos',
        dateLabel: '12 abr · agora',
        status: 'current',
        description: 'Jogos simultâneos em 4 quadras com cronômetro central.',
      },
      {
        id: 's3',
        label: 'Final',
        dateLabel: '23h30',
        status: 'upcoming',
        description: 'Show de luzes e premiação ao vivo na arena.',
      },
    ],
    categories: [
      {
        id: 'c1',
        name: 'Misto Open',
        genderLabel: 'Misto',
        level: 'Intermediário',
        spotsLeft: 4,
        spotsTotal: 24,
        priceLabel: 'R$ 180',
      },
      {
        id: 'c2',
        name: 'Feminino B',
        genderLabel: 'Feminino',
        level: 'Intermediário',
        spotsLeft: 10,
        spotsTotal: 16,
        priceLabel: 'R$ 160',
      },
    ],
    totalPrizeLabel: null,
    prizeBreakdown: [],
    rankingRows: [
      { rank: 1, name: 'Team Neon', points: 920, avatarLetter: 'T' },
      { rank: 2, name: 'Areia Qente', points: 905, avatarLetter: 'A' },
      { rank: 3, name: 'Block Sisters', points: 888, avatarLetter: 'B' },
      { rank: 4, name: 'Saque 200', points: 870, avatarLetter: 'S' },
      { rank: 5, name: 'Rede Alta', points: 854, avatarLetter: 'R' },
    ],
    posts: [
      {
        id: 'p1',
        athleteName: '@night_open_sp',
        text: 'A energia tá absurda 🔥 Bora?',
        hashtag: '#NightOpenSP',
        likes: 256,
        comments: 32,
        mediaGradient: 'linear-gradient(160deg, #1e1b4b 0%, #7c3aed 40%, #f59e0b 100%)',
      },
    ],
    hasLiveStream: true,
    liveViewers: 1842,
    bracketState: 'live',
    announcements: [
      {
        id: 'a1',
        title: 'Transmissão ao vivo',
        body: 'Assista na aba “Ao vivo” — narração oficial NexaGO.',
        important: true,
        dateLabel: 'Ao vivo',
      },
    ],
  },
  'open-goiania-beach': {
    rankingValid: true,
    dateDetail: '28 a 30 de agosto · Check-in a partir das 7h',
    formatLabel: 'Duplas · Fase de grupos + mata-mata',
    prizeHint: 'Premiação em dinheiro + pontos NexaGO Pro',
    mapQuery: 'Arena ErreJota, Goiânia',
    stages: [
      {
        id: 's1',
        label: 'Fase de grupos',
        dateLabel: '28 ago',
        status: 'upcoming',
        description: 'Duplas divididas em grupos de 4. Todos jogam entre si.',
      },
      {
        id: 's2',
        label: 'Classificação',
        dateLabel: '29 ago',
        status: 'upcoming',
        description: 'Os dois primeiros colocados de cada grupo avançam para o mata-mata.',
      },
      {
        id: 's3',
        label: 'Mata-mata',
        dateLabel: '30 ago',
        status: 'upcoming',
        description: 'Quartas, semis e grande final em eliminação direta.',
      },
    ],
    categories: [
      {
        id: 'feminino-pro',
        name: 'Feminino Pro',
        genderLabel: 'Feminino',
        level: 'Pro',
        spotsLeft: 4,
        spotsTotal: 16,
        priceLabel: 'R$ 180',
      },
      {
        id: 'masculino-intermediario',
        name: 'Masculino Intermediário',
        genderLabel: 'Masculino',
        level: 'Intermediário',
        spotsLeft: 12,
        spotsTotal: 32,
        priceLabel: 'R$ 180',
      },
      {
        id: 'misto-iniciante',
        name: 'Misto Iniciante',
        genderLabel: 'Misto',
        level: 'Iniciante',
        spotsLeft: 18,
        spotsTotal: 24,
        priceLabel: 'R$ 150',
      },
    ],
    totalPrizeLabel: 'R$ 9.600',
    prizeBreakdown: [
      { place: 1, label: 'Campeões', percentLabel: '55% do prêmio', amountLabel: 'R$ 5.280' },
      { place: 2, label: 'Vice-campeões', percentLabel: '30% do prêmio', amountLabel: 'R$ 2.880' },
      { place: 3, label: '3º lugar', percentLabel: '15% do prêmio', amountLabel: 'R$ 1.440' },
    ],
    rankingRows: [
      { rank: 1, name: 'Rafa & Tonho', points: 1840, avatarLetter: 'R' },
      { rank: 2, name: 'Ana R. & Beto L.', points: 1790, avatarLetter: 'A' },
      { rank: 3, name: 'Carla M. & Igor M.', points: 1755, avatarLetter: 'C' },
      { rank: 4, name: 'Diego & Luiz', points: 1688, avatarLetter: 'D' },
      { rank: 5, name: 'Bruno & Carla A.', points: 1620, avatarLetter: 'B' },
    ],
    posts: [
      {
        id: 'p1',
        athleteName: '@arena_errejota',
        text: 'Quadras prontas pro Open Goiânia Beach! Bora encher a arena.',
        hashtag: '#OpenGoianiaBeach',
        likes: 64,
        comments: 9,
        mediaGradient: 'linear-gradient(135deg, #0f5132 0%, #14b8a6 100%)',
      },
    ],
    hasLiveStream: false,
    liveViewers: 0,
    bracketState: 'soon',
    announcements: [
      {
        id: 'a1',
        title: 'Documentos obrigatórios',
        body: 'RG + comprovante de inscrição no check-in. Sem exceções.',
        important: true,
        dateLabel: 'Hoje',
      },
      {
        id: 'a2',
        title: 'Estacionamento',
        body: 'Parceiro com 20% de desconto para atletas — código NEXAGO20.',
        important: false,
        dateLabel: 'Ontem',
      },
    ],
  },
  'etapa-aparecida-goias-beach': {
    rankingValid: true,
    dateDetail: '18 a 20 de abril · Check-in a partir das 7h',
    formatLabel: 'Duplas · Fase de grupos + mata-mata',
    prizeHint: 'Pontos para o ranking da Copa Goiás Beach 2026',
    mapQuery: 'Arena Aparecida Beach, Aparecida de Goiânia',
    stages: [
      {
        id: 's1',
        label: 'Fase de grupos',
        dateLabel: '18 abr',
        status: 'upcoming',
        description: 'Duplas divididas em grupos de 4. Todos jogam entre si.',
      },
      {
        id: 's2',
        label: 'Classificação',
        dateLabel: '19 abr',
        status: 'upcoming',
        description: 'Os dois primeiros colocados de cada grupo avançam para o mata-mata.',
      },
      {
        id: 's3',
        label: 'Mata-mata',
        dateLabel: '20 abr',
        status: 'upcoming',
        description: 'Quartas, semis e grande final em eliminação direta.',
      },
    ],
    categories: [
      {
        id: 'masculino',
        name: 'Masculino',
        genderLabel: 'Masculino',
        level: 'Aberto',
        spotsLeft: 12,
        spotsTotal: 24,
        priceLabel: 'R$ 90',
      },
      {
        id: 'feminino',
        name: 'Feminino',
        genderLabel: 'Feminino',
        level: 'Aberto',
        spotsLeft: 8,
        spotsTotal: 16,
        priceLabel: 'R$ 90',
      },
      {
        id: 'misto',
        name: 'Misto',
        genderLabel: 'Misto',
        level: 'Aberto',
        spotsLeft: 8,
        spotsTotal: 8,
        priceLabel: 'R$ 90',
      },
    ],
    totalPrizeLabel: null,
    prizeBreakdown: [],
    rankingRows: [
      { rank: 1, name: 'Marcelo & Enzo', points: 730, avatarLetter: 'M' },
      { rank: 2, name: 'Sá & Toledo', points: 700, avatarLetter: 'S' },
      { rank: 3, name: 'Rafa & Tonho', points: 680, avatarLetter: 'R' },
      { rank: 4, name: 'Carla & Igor', points: 580, avatarLetter: 'C' },
      { rank: 5, name: 'Bruno & Carla A.', points: 510, avatarLetter: 'B' },
    ],
    posts: [],
    hasLiveStream: false,
    liveViewers: 0,
    bracketState: 'soon',
    announcements: [],
  },
};

export function getTournamentDetailExtra(id: string, base: DiscoveryTournament): TournamentDetailExtended {
  return (
    EXTRA_BY_ID[id] ?? {
      rankingValid: true,
      dateDetail: `${base.dateLabel} · horários no check-in`,
      formatLabel: `${base.format} · consulte regulamento`,
      prizeHint: 'Pontos para ranking NexaGO',
      mapQuery: `${base.location}, ${base.city}`,
      stages: [
        {
          id: 's1',
          label: 'Inscrições',
          dateLabel: 'Abertas',
          status: 'current',
          description: 'Finalize sua inscrição e aguarde confirmação do organizador.',
        },
        {
          id: 's2',
          label: 'Competição',
          dateLabel: base.dateLabel,
          status: 'upcoming',
          description: 'Formato e chaves divulgados após o fechamento das vagas.',
        },
      ],
      categories: base.categories.map((cat, i) => {
        const genderLabel = cat === 'M' ? 'Masculino' : cat === 'F' ? 'Feminino' : 'Misto';
        return {
          id: `c-${i}`,
          name: genderLabel,
          genderLabel,
          level: 'Consulte nível',
          spotsLeft: base.spotsLeft,
          spotsTotal: base.spotsTotal,
          priceLabel: base.priceLabel,
        };
      }),
      totalPrizeLabel: null,
      prizeBreakdown: [],
      rankingRows: [
        { rank: 1, name: 'Dupla A', points: 1200, avatarLetter: 'A' },
        { rank: 2, name: 'Dupla B', points: 1180, avatarLetter: 'B' },
        { rank: 3, name: 'Dupla C', points: 1150, avatarLetter: 'C' },
        { rank: 4, name: 'Dupla D', points: 1120, avatarLetter: 'D' },
        { rank: 5, name: 'Dupla E', points: 1090, avatarLetter: 'E' },
      ],
      posts: [],
      hasLiveStream: base.liveMatchesNow > 0,
      liveViewers: base.liveMatchesNow * 200,
      bracketState: base.status === 'live' ? 'live' : base.status === 'ended' ? 'done' : 'soon',
      announcements: [
        {
          id: 'a-default',
          title: 'Bem-vindo',
          body: 'Este é um preview. Dados reais virão da API de torneios.',
          important: false,
          dateLabel: 'Agora',
        },
      ],
    }
  );
}
