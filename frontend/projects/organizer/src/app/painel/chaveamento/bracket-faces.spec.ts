import {
  facesFromLabel,
  facesFromMemberIds,
  facesFromTeam,
  resolveTeamRoster,
} from './bracket-faces';
import type { OrganizerTeamPlayers, ProfileDisplay } from '../data/teams-repository';

function team(overrides: Partial<OrganizerTeamPlayers> = {}): OrganizerTeamPlayers {
  return {
    teamName: null,
    player1Id: '',
    player2Id: '',
    memberUids: [],
    isLookingForPartner: false,
    ...overrides,
  };
}

function profile(name: string, photoUrl: string | null = null): ProfileDisplay {
  return { name, photoUrl };
}

describe('facesFromTeam', () => {
  it('mostra todos os atletas de um quarteto via memberUids', () => {
    const faces = facesFromTeam(
      team({
        memberUids: ['a', 'b', 'c', 'd'],
        player1Id: 'a',
        player2Id: 'b',
      }),
      new Map([
        ['a', profile('Ana')],
        ['b', profile('Bia')],
        ['c', profile('Caio')],
        ['d', profile('Duda', 'https://img/d')],
      ]),
    );
    expect(faces.map((f) => f.name)).toEqual(['Ana', 'Bia', 'Caio', 'Duda']);
    expect(faces[3]?.photoUrl).toBe('https://img/d');
  });

  it('mantém o slot mesmo sem perfil público', () => {
    const faces = facesFromMemberIds(
      ['a', 'b', 'c', 'd'],
      new Map([
        ['a', profile('Ana')],
        ['b', profile('Bia')],
      ]),
    );
    expect(faces).toHaveSize(4);
    expect(faces[2]?.name).toBe('Atleta');
    expect(faces[3]?.name).toBe('Atleta');
  });

  it('dupla legada continua com player1/player2', () => {
    const faces = facesFromTeam(
      team({ player1Id: 'a', player2Id: 'b' }),
      new Map([
        ['a', profile('Ana')],
        ['b', profile('Bia')],
      ]),
    );
    expect(faces.map((f) => f.name)).toEqual(['Ana', 'Bia']);
  });
});

describe('resolveTeamRoster', () => {
  it('prefere participantUids da inscrição ao rótulo/time truncado', () => {
    expect(
      resolveTeamRoster(
        team({ memberUids: ['a', 'b', 'c'], player1Id: 'a', player2Id: 'b' }),
        ['a', 'b', 'c', 'd', 'e'],
      ),
    ).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('cai no time quando a inscrição não tem elenco', () => {
    expect(
      resolveTeamRoster(team({ memberUids: ['a', 'b', 'c', 'd'] }), []),
    ).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('facesFromLabel', () => {
  it('quebra rótulo com vários nomes', () => {
    expect(facesFromLabel('Ana / Bia / Caio / Duda').map((f) => f.name)).toEqual([
      'Ana',
      'Bia',
      'Caio',
      'Duda',
    ]);
  });
});
