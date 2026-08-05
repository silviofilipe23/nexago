import { foreignTournamentOwnerId } from './panel-shell.component';

/** A faixa "você está operando o torneio de X" só existe quando um super admin abre
 *  torneio de outra pessoa — e some no torneio dele mesmo. */
describe('foreignTournamentOwnerId', () => {
  const uid = 'super-admin-uid';

  it('aponta o dono quando o super admin abre torneio alheio', () => {
    expect(foreignTournamentOwnerId({ isSuperAdmin: true, uid, managerId: 'outro-uid' })).toBe('outro-uid');
  });

  it('não avisa nada no torneio do próprio super admin', () => {
    expect(foreignTournamentOwnerId({ isSuperAdmin: true, uid, managerId: uid })).toBeNull();
  });

  it('não avisa nada para organizador comum, nem em torneio alheio', () => {
    expect(foreignTournamentOwnerId({ isSuperAdmin: false, uid, managerId: 'outro-uid' })).toBeNull();
  });

  it('não avisa nada fora do contexto de torneio', () => {
    expect(foreignTournamentOwnerId({ isSuperAdmin: true, uid, managerId: null })).toBeNull();
    expect(foreignTournamentOwnerId({ isSuperAdmin: true, uid, managerId: '' })).toBeNull();
  });

  it('não avisa nada antes do usuário resolver', () => {
    expect(foreignTournamentOwnerId({ isSuperAdmin: true, uid: undefined, managerId: 'outro-uid' })).toBeNull();
  });
});
