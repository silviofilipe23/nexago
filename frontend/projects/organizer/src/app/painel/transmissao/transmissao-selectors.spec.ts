import { interviewWithDefaults } from '../data/broadcast-control';
import type { TournamentMatch } from '../data/matches-repository';
import type { OrganizerTeamPlayers } from '../data/teams-repository';
import {
  courtChipsOf,
  courtMatchOf,
  elapsedLabel,
  interviewCandidatesOf,
  interviewFromCandidate,
  quickPicksOf,
  rosterOf,
  rosterUidsOf,
  searchCandidates,
  transmissaoUrl,
  type TeamRoster,
} from './transmissao-selectors';

function match(over: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: 'Ana / Bia',
    team2Label: 'Carla / Dani',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    teamAId: 'ta',
    teamBId: 'tb',
    sets: [],
    courtId: 'q1',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 1,
    matchType: 'knockout',
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

const ROSTERS = new Map<string, TeamRoster>([
  ['ta', { teamName: null, members: [{ uid: 'u1', name: 'Ana Souza', photoUrl: 'a.jpg' }, { uid: 'u2', name: 'Bia Lima', photoUrl: null }] }],
  ['tb', { teamName: null, members: [{ uid: 'u3', name: 'Carla Dias', photoUrl: null }, { uid: 'u4', name: 'Dani Ávila', photoUrl: null }] }],
  ['tc', { teamName: 'Equipe Sol', members: [{ uid: 'u5', name: 'Eva', photoUrl: null }, { uid: 'u6', name: 'Fê', photoUrl: null }, { uid: 'u7', name: 'Gabi', photoUrl: null }] }],
]);
const CATS = [{ id: 'cat1', name: 'Feminina B' }, { id: 'cat2', name: 'Trio Misto' }];

describe('rosterUidsOf / rosterOf', () => {
  const dupla: OrganizerTeamPlayers = { teamName: null, player1Id: 'u1', player2Id: 'u2', memberUids: [], isLookingForPartner: false };
  const trio: OrganizerTeamPlayers = { teamName: 'Equipe Sol', player1Id: 'u5', player2Id: 'u6', memberUids: ['u5', 'u6', 'u7'], isLookingForPartner: false };

  it('dupla usa os dois slots; equipe usa o elenco inteiro', () => {
    expect(rosterUidsOf(dupla)).toEqual(['u1', 'u2']);
    expect(rosterUidsOf(trio)).toEqual(['u5', 'u6', 'u7']);
  });

  it('membro sem perfil fica sem nome (a lista de candidatos o ignora)', () => {
    const profiles = new Map([['u1', { name: 'Ana Souza', photoUrl: null }]]);
    expect(rosterOf(dupla, profiles).members).toEqual([
      { uid: 'u1', name: 'Ana Souza', photoUrl: null },
      { uid: 'u2', name: '', photoUrl: null },
    ]);
  });
});

describe('interviewCandidatesOf', () => {
  const ms = [match({}), match({ id: 'm2', categoryId: 'cat2', teamAId: 'tc', teamBId: '' })];

  it('um candidato por atleta, com parceiro na dupla e categoria da partida', () => {
    const ana = interviewCandidatesOf(ms, ROSTERS, CATS).find((c) => c.name === 'Ana Souza');
    expect(ana).toEqual({ key: 'ta:u1', teamId: 'ta', name: 'Ana Souza', photoUrl: 'a.jpg', partnerName: 'Bia Lima', categoryName: 'Feminina B' });
  });

  it('em equipe de 3+, não há "parceiro"', () => {
    const eva = interviewCandidatesOf(ms, ROSTERS, CATS).find((c) => c.name === 'Eva');
    expect(eva?.partnerName).toBeNull();
    expect(eva?.categoryName).toBe('Trio Misto');
  });

  it('ordena por nome e ignora equipe ainda não hidratada', () => {
    const nomes = interviewCandidatesOf([...ms, match({ id: 'm3', teamAId: 'tx', teamBId: '' })], ROSTERS, CATS).map((c) => c.name);
    expect(nomes).toEqual(['Ana Souza', 'Bia Lima', 'Carla Dias', 'Dani Ávila', 'Eva', 'Fê', 'Gabi']);
  });

  it('elenco KOTC (koc.teamIds) também entra', () => {
    const koc = match({ teamAId: '', teamBId: '', matchType: 'koc_round', koc: { teamIds: ['tc'] } as TournamentMatch['koc'] });
    expect(interviewCandidatesOf([koc], ROSTERS, CATS).map((c) => c.name)).toEqual(['Eva', 'Fê', 'Gabi']);
  });
});

describe('quickPicksOf', () => {
  const todos = interviewCandidatesOf([match({}), match({ id: 'm2', teamAId: 'tc', teamBId: '' })], ROSTERS, CATS);

  it('só os atletas da partida em quadra', () => {
    expect(quickPicksOf(todos, match({})).map((c) => c.name)).toEqual(['Ana Souza', 'Bia Lima', 'Carla Dias', 'Dani Ávila']);
  });

  it('sem partida, sem atalhos', () => {
    expect(quickPicksOf(todos, null)).toEqual([]);
  });
});

describe('searchCandidates', () => {
  const todos = interviewCandidatesOf([match({})], ROSTERS, CATS);

  it('busca sem acento e sem caixa', () => {
    expect(searchCandidates(todos, 'avila').map((c) => c.name)).toEqual(['Dani Ávila']);
    expect(searchCandidates(todos, 'ANA').map((c) => c.name)).toEqual(['Ana Souza']);
  });

  it('termo vazio não lista ninguém', () => {
    expect(searchCandidates(todos, '  ')).toEqual([]);
  });
});

describe('courtChipsOf / courtMatchOf', () => {
  const courts = [{ id: 'q2', name: '2', order: 2 }, { id: 'q1', name: 'Quadra 1', order: 1 }];
  const now = Date.UTC(2026, 9, 1, 15, 0);

  it('quadra ao vivo diz quem está jogando; livre diz livre; na ordem cadastrada', () => {
    const ms = [match({ status: 'in_progress', courtId: 'q1', matchStartedAt: new Date(now - 60_000) })];
    expect(courtChipsOf(courts, ms, now)).toEqual([
      { id: 'q1', name: 'Quadra 1', live: true, status: 'Ao vivo · Ana / Bia × Carla / Dani' },
      { id: 'q2', name: 'Quadra 2', live: false, status: 'Livre' },
    ]);
  });

  it('partida da quadra escolhida; sem quadra, nenhuma', () => {
    const ms = [match({ status: 'in_progress', courtId: 'q1', matchStartedAt: new Date(now - 60_000) })];
    expect(courtMatchOf(ms, 'q1', now)?.id).toBe('m1');
    expect(courtMatchOf(ms, null, now)).toBeNull();
  });
});

describe('interviewFromCandidate / elapsedLabel / transmissaoUrl', () => {
  it('monta a tarja desnormalizada com duração e carimbo', () => {
    const [ana] = interviewCandidatesOf([match({})], ROSTERS, CATS);
    expect(interviewFromCandidate(ana!, 20, 1234)).toEqual(interviewWithDefaults({
      name: 'Ana Souza',
      photoUrl: 'a.jpg',
      partnerName: 'Bia Lima',
      categoryName: 'Feminina B',
      durationSec: 20,
      shownAt: 1234,
    }));
  });

  it('formata o tempo no ar', () => {
    expect(elapsedLabel(12_400)).toBe('0:12');
    expect(elapsedLabel(75_000)).toBe('1:15');
    expect(elapsedLabel(-5)).toBe('0:00');
  });

  it('URL do OBS', () => {
    expect(transmissaoUrl('https://organizador.nexago.app', 't 1')).toBe('https://organizador.nexago.app/transmissao/t%201');
  });
});
