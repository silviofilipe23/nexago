import { chunkIds, teamNamesFrom, type OrganizerTeamPlayers } from './teams-repository';

function team(overrides: Partial<OrganizerTeamPlayers> = {}): OrganizerTeamPlayers {
  return { teamName: null, player1Id: '', player2Id: '', isLookingForPartner: false, ...overrides };
}

describe('chunkIds', () => {
  it('quebra em lotes do limite do `in` do Firestore', () => {
    const ids = Array.from({ length: 23 }, (_, i) => `u${i}`);
    const chunks = chunkIds(ids);
    expect(chunks.length).toBe(3);
    expect(chunks[0]!.length).toBe(10);
    expect(chunks[2]!.length).toBe(3);
  });

  it('dedupa e ignora ids vazios antes de lotear', () => {
    expect(chunkIds(['a', 'a', '', 'b'])).toEqual([['a', 'b']]);
  });

  it('não gera lote nenhum sem ids', () => {
    expect(chunkIds([])).toEqual([]);
    expect(chunkIds(['', ''])).toEqual([]);
  });
});

describe('teamNamesFrom', () => {
  it('prefere o `teamName` gravado no time', () => {
    const teams = new Map([['t1', team({ teamName: 'Os Craques', player1Id: 'u1', player2Id: 'u2' })]]);
    const names = new Map([
      ['u1', 'Ana'],
      ['u2', 'Bia'],
    ]);
    expect(teamNamesFrom(teams, names).get('t1')).toBe('Os Craques');
  });

  it('monta "P1 / P2" pelos perfis quando o time não tem nome', () => {
    const teams = new Map([['t1', team({ player1Id: 'u1', player2Id: 'u2' })]]);
    const names = new Map([
      ['u1', 'Ana'],
      ['u2', 'Bia'],
    ]);
    expect(teamNamesFrom(teams, names).get('t1')).toBe('Ana / Bia');
  });

  it('dupla procurando parceiro fica só com o primeiro atleta', () => {
    const teams = new Map([['t1', team({ player1Id: 'u1', player2Id: 'u2', isLookingForPartner: true })]]);
    const names = new Map([
      ['u1', 'Ana'],
      ['u2', 'Bia'],
    ]);
    expect(teamNamesFrom(teams, names).get('t1')).toBe('Ana');
  });

  it('cai no atleta que tem nome quando falta o perfil do outro', () => {
    const teams = new Map([['t1', team({ player1Id: 'u1', player2Id: 'u2' })]]);
    expect(teamNamesFrom(teams, new Map([['u2', 'Bia']])).get('t1')).toBe('Bia');
  });

  it('não repete o nome quando os dois slots são o mesmo atleta', () => {
    const teams = new Map([['t1', team({ player1Id: 'u1', player2Id: 'u1' })]]);
    expect(teamNamesFrom(teams, new Map([['u1', 'Ana']])).get('t1')).toBe('Ana');
  });

  it('deixa o time fora do mapa quando ninguém tem nome — quem chama decide o fallback', () => {
    const teams = new Map([['t1', team({ player1Id: 'u1', player2Id: 'u2' })]]);
    expect(teamNamesFrom(teams, new Map()).has('t1')).toBe(false);
  });
});
