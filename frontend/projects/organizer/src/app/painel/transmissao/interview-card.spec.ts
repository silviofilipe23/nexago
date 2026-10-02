import type { KocRoundState } from '../data/koc';
import type { TournamentMatch } from '../data/matches-repository';
import type { RankingParticipant } from '../data/ranking-positions';
import { campaignOf, interviewCardOf, interviewKindsFor, teamPhaseOf, type AthleteDetails, type InterviewCardSource } from './interview-card';
import type { TeamRoster } from './transmissao-selectors';

function match(over: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: 'Grupo A',
    team1Label: 'Ana / Bia',
    team2Label: 'Carla / Dani',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'completed',
    teamAId: 'ta',
    teamBId: 'tb',
    sets: [],
    courtId: 'q1',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 1,
    matchType: 'group',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    ...over,
  };
}

function kocRound(over: Partial<KocRoundState>): KocRoundState {
  return {
    teamIds: ['ta', 'tb', 'tc'],
    kingTeamId: '',
    challengerTeamId: '',
    queue: [],
    points: {},
    rallies: 0,
    servingTeamId: '',
    clock: null,
    standings: [],
    qualifiersPerRound: 1,
    teamsPerCourt: 3,
    roundsPerBracket: 1,
    configuredDurationSec: 900,
    rallySeq: 0,
    rallyLog: [],
    roundLabel: 1,
    qualifierSlots: [],
    batteryLabel: 1,
    phases: null,
    maxTeamsPerRound: 3,
    ...over,
  };
}

const at = (h: number) => new Date(Date.UTC(2026, 9, 2, h));

const ROSTERS = new Map<string, TeamRoster>([
  ['ta', { teamName: null, members: [{ uid: 'u1', name: 'Ana Souza', photoUrl: 'a.jpg' }, { uid: 'u2', name: 'Bia Lima', photoUrl: null }] }],
  ['tb', { teamName: null, members: [{ uid: 'u3', name: 'Carla Dias', photoUrl: null }, { uid: 'u4', name: 'Dani Ávila', photoUrl: null }] }],
  [
    'tc',
    {
      teamName: 'Equipe Sol',
      members: [
        { uid: 'u5', name: 'Eva', photoUrl: 'e.jpg' },
        { uid: 'u6', name: 'Fê', photoUrl: null },
        { uid: 'u7', name: 'Gabi', photoUrl: null },
      ],
    },
  ],
  ['solo', { teamName: null, members: [{ uid: 'u9', name: 'Iris', photoUrl: null }, { uid: 'u10', name: '', photoUrl: null }] }],
]);

const ATHLETES: RankingParticipant[] = [
  { id: 'u9', points: 2000, tournaments: 9, sport: 'beachVolleyball', gender: 'female', format: null },
  { id: 'u1', points: 1240, tournaments: 6, sport: 'beachVolleyball', gender: 'female', format: null },
];
const TEAMS: RankingParticipant[] = [{ id: 'ta', points: 880, tournaments: 4, sport: 'beachVolleyball', gender: 'female', format: 'dupla' }];

function source(over: Partial<InterviewCardSource> = {}): InterviewCardSource {
  return {
    matches: [
      match({ id: 'g1', teamAId: 'ta', teamBId: 'tb', winnerSide: 1, sets: [{ a: 21, b: 15 }], scheduledAt: at(10) }),
      match({ id: 's1', round: 'Semifinal', status: 'in_progress', scheduledAt: at(14) }),
      match({ id: 'k1', categoryId: 'cat2', teamAId: '', teamBId: '', round: 'Classificatória · Rodada 1', matchType: 'koc_round', koc: kocRound({}), status: 'scheduled' }),
    ],
    rosters: ROSTERS,
    details: new Map<string, AthleteDetails>([
      ['u1', { city: 'Goiânia', state: 'GO', levelsBySport: { VOLEI_PRAIA: 'intermediario_2' }, legacyLevel: null }],
      ['u2', { city: null, state: null, levelsBySport: {}, legacyLevel: null }],
    ]),
    categories: [
      { id: 'cat1', name: 'Feminina B', teamSize: null },
      { id: 'cat2', name: 'Trio Misto', teamSize: 3 },
    ],
    inLeague: false,
    levelSportCode: 'VOLEI_PRAIA',
    athleteRanking: ATHLETES,
    teamRanking: TEAMS,
    ...over,
  };
}

const AIR = { durationSec: 20, shownAt: 1234, showCampaign: true, question: null, reporter: null };

describe('interviewKindsFor', () => {
  it('dupla oferece atleta e dupla; equipe nomeada oferece atleta e equipe', () => {
    expect(interviewKindsFor('ta', source())).toEqual(['atleta', 'dupla']);
    expect(interviewKindsFor('tc', source())).toEqual(['atleta', 'equipe']);
  });

  it('dupla com um atleta só (parceiro sem perfil) só oferece o atleta', () => {
    expect(interviewKindsFor('solo', source())).toEqual(['atleta']);
  });
});

describe('interviewCardOf — atleta', () => {
  const card = interviewCardOf({ kind: 'atleta', teamId: 'ta', uid: 'u1' }, source(), AIR)!;

  it('identidade, nome e foto do atleta, com a v1 preenchida pro overlay antigo', () => {
    expect(card.kind).toBe('atleta');
    expect(card.key).toBe('atleta:ta:u1');
    expect(card.names).toEqual(['Ana Souza']);
    expect(card.photos).toEqual(['a.jpg']);
    expect(card.name).toBe('Ana Souza');
    expect(card.photoUrl).toBe('a.jpg');
    expect(card.partnerName).toBe('Bia Lima');
    expect(card.categoryName).toBe('Feminina B');
    expect(card.durationSec).toBe(20);
    expect(card.shownAt).toBe(1234);
    expect(card.badge).toBe('ATLETA');
  });

  it('contexto é categoria + fase em que a dupla está agora', () => {
    expect(card.context).toBe('Feminina B · Semifinal');
    expect(card.subtitle).toBe('Dupla com Bia Lima');
  });

  it('chips: ranking no próprio recorte, pontos, nível do esporte do torneio e cidade', () => {
    expect(card.rankingPos).toBe(2);
    expect(card.chips).toEqual([
      { label: 'Ranking', value: '2º' },
      { label: 'Pontos', value: '1.240' },
      { label: 'Nível', value: 'Intermediário 2' },
      { label: 'Cidade', value: 'Goiânia/GO' },
    ]);
  });

  it('o que não se sabe não vira chip', () => {
    const bia = interviewCardOf({ kind: 'atleta', teamId: 'ta', uid: 'u2' }, source(), AIR)!;
    expect(bia.chips).toEqual([]);
    expect(bia.rankingPos).toBeNull();
  });

  it('atleta de equipe nomeada leva o nome da equipe no subtítulo', () => {
    const eva = interviewCardOf({ kind: 'atleta', teamId: 'tc', uid: 'u5' }, source(), AIR)!;
    expect(eva.subtitle).toBe('Equipe Sol');
    expect(eva.partnerName).toBeNull();
  });

  it('nenhum campo undefined — o Firestore recusa a escrita inteira', () => {
    for (const c of [card, interviewCardOf({ kind: 'equipe', teamId: 'tc', uid: null }, source(), AIR)!]) {
      expect(Object.entries(c).filter(([, v]) => v === undefined)).toEqual([]);
    }
  });
});

describe('interviewCardOf — dupla e equipe', () => {
  it('dupla: os dois nomes e fotos, ranking de duplas e torneios', () => {
    const card = interviewCardOf({ kind: 'dupla', teamId: 'ta', uid: null }, source(), AIR)!;
    expect(card.key).toBe('dupla:ta');
    expect(card.names).toEqual(['Ana Souza', 'Bia Lima']);
    expect(card.photos).toEqual(['a.jpg', null]);
    expect(card.name).toBe('Ana Souza / Bia Lima');
    expect(card.badge).toBe('DUPLA');
    expect(card.subtitle).toBeNull();
    expect(card.chips).toEqual([
      { label: 'Ranking', value: '1º' },
      { label: 'Pontos', value: '880' },
      { label: 'Torneios', value: '4' },
    ]);
    expect(card.rankingPos).toBe(1);
  });

  it('equipe: nome da equipe e o elenco', () => {
    const card = interviewCardOf({ kind: 'equipe', teamId: 'tc', uid: null }, source(), AIR)!;
    expect(card.key).toBe('equipe:tc');
    expect(card.names).toEqual(['Equipe Sol']);
    expect(card.photos).toEqual([]);
    expect(card.members).toEqual([
      { name: 'Eva', photoUrl: 'e.jpg' },
      { name: 'Fê', photoUrl: null },
      { name: 'Gabi', photoUrl: null },
    ]);
    expect(card.badge).toBe('EQUIPE');
    expect(card.categoryName).toBe('Trio Misto');
  });

  it('entrevistado que não existe mais no elenco não vira card', () => {
    expect(interviewCardOf({ kind: 'atleta', teamId: 'ta', uid: 'nada' }, source(), AIR)).toBeNull();
    expect(interviewCardOf({ kind: 'dupla', teamId: 'zz', uid: null }, source(), AIR)).toBeNull();
  });

  it('as opções do ar passam direto', () => {
    const reporter = { role: 'Repórter', name: 'Carla Mendes' };
    const card = interviewCardOf({ kind: 'dupla', teamId: 'ta', uid: null }, source(), {
      durationSec: null,
      shownAt: 9,
      showCampaign: false,
      question: 'Como foi a final?',
      reporter,
    })!;
    expect(card.durationSec).toBeNull();
    expect(card.showCampaign).toBeFalse();
    expect(card.question).toBe('Como foi a final?');
    expect(card.reporter).toEqual(reporter);
  });
});

describe('teamPhaseOf', () => {
  it('ao vivo vence; senão a última encerrada; senão a próxima', () => {
    expect(teamPhaseOf('ta', source().matches)).toBe('Semifinal');
    const semAoVivo = source().matches.filter((m) => m.id !== 's1');
    expect(teamPhaseOf('ta', semAoVivo)).toBe('Grupo A');
    expect(teamPhaseOf('tc', source().matches)).toBe('Classificatória · Rodada 1');
    expect(teamPhaseOf('zz', source().matches)).toBeNull();
  });
});

describe('campaignOf', () => {
  it('duelo do ponto de vista do entrevistado: V/D, adversário pelo elenco e placar dele primeiro', () => {
    const src = source({
      matches: [
        match({ id: 'a', teamAId: 'tb', teamBId: 'ta', winnerSide: 2, sets: [{ a: 15, b: 21 }], scheduledAt: at(9), round: 'Grupo A' }),
        match({ id: 'b', teamAId: 'ta', teamBId: 'tb', winnerSide: 2, bestOf: 3, sets: [{ a: 21, b: 18 }, { a: 17, b: 21 }, { a: 12, b: 15 }], scheduledAt: at(11), round: 'Semifinal' }),
      ],
    });
    const c = campaignOf('ta', src)!;
    expect(c.rows).toEqual([
      { mark: 'V', won: true, opponent: 'Carla Dias / Dani Ávila', phase: 'Grupo A', score: '21–15' },
      { mark: 'D', won: false, opponent: 'Carla Dias / Dani Ávila', phase: 'Semifinal', score: '1–2' },
    ]);
    expect(c.summary).toBe('1V · 1D');
    expect(c.title).toBe('Campanha no torneio');
  });

  it('rodada KOTC vira a posição na rodada, com os pontos', () => {
    const src = source({
      matches: [
        match({
          id: 'k',
          teamAId: '',
          teamBId: '',
          matchType: 'koc_round',
          round: 'Classificatória · Rodada 2',
          koc: kocRound({ standings: [
            { teamId: 'tb', place: 1, points: 15, crowns: 0, removed: false },
            { teamId: 'tc', place: 2, points: 12, crowns: 0, removed: false },
          ] }),
          scheduledAt: at(9),
        }),
        match({
          id: 'k2',
          teamAId: '',
          teamBId: '',
          matchType: 'koc_round',
          round: 'Semifinal',
          koc: kocRound({ standings: [{ teamId: 'tc', place: 1, points: 18, crowns: 0, removed: false }] }),
          scheduledAt: at(12),
        }),
      ],
    });
    const c = campaignOf('tc', src)!;
    expect(c.rows).toEqual([
      { mark: '2º', won: false, opponent: 'King of the Court', phase: 'Classificatória · Rodada 2', score: '12 pts' },
      { mark: '1º', won: true, opponent: 'King of the Court', phase: 'Semifinal', score: '18 pts' },
    ]);
    expect(c.summary).toBe('2 rodadas · 1× 1º');
  });

  it('só partida encerrada e decidida entra, em ordem cronológica, e só as 6 últimas', () => {
    const muitas = Array.from({ length: 8 }, (_, i) =>
      match({ id: `x${i}`, winnerSide: 1, sets: [{ a: 21, b: i }], scheduledAt: at(i + 1) }),
    );
    const src = source({
      matches: [
        ...muitas,
        match({ id: 'live', status: 'in_progress', scheduledAt: at(20) }),
        match({ id: 'sem-vencedor', winnerSide: null, scheduledAt: at(21) }),
      ],
    });
    const c = campaignOf('ta', src)!;
    expect(c.rows.length).toBe(6);
    expect(c.rows[5]!.score).toBe('21–7');
    expect(c.summary).toBe('8V · 0D');
  });

  it('torneio de liga chama de etapa', () => {
    expect(campaignOf('ta', source({ inLeague: true }))!.title).toBe('Campanha na etapa');
  });

  it('antes do primeiro jogo não há campanha', () => {
    expect(campaignOf('tc', source())).toBeNull();
  });
});
