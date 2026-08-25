import { canManageTournamentStaff, staffCandidateExclusions } from './equipe.component';

/** Quem mexe na equipe do torneio no portal: o dono e o super admin em suporte. Os testes
 *  espelham `functions/test/tournament-staff.rules.test.mjs` — se a tela liberar um botão que
 *  as rules recusam, o usuário leva um erro cru no lugar de um botão escondido. */
describe('canManageTournamentStaff', () => {
  const dono = 'dono-uid';

  it('o dono gerencia a equipe do próprio torneio', () => {
    expect(canManageTournamentStaff({ isSuperAdmin: false, uid: dono, managerId: dono })).toBe(true);
  });

  it('o super admin gerencia a equipe de torneio alheio', () => {
    expect(canManageTournamentStaff({ isSuperAdmin: true, uid: 'super-uid', managerId: dono })).toBe(true);
  });

  it('organizador comum não gerencia torneio alheio', () => {
    expect(canManageTournamentStaff({ isSuperAdmin: false, uid: 'outro-uid', managerId: dono })).toBe(false);
  });

  it('não libera nada antes do torneio carregar', () => {
    expect(canManageTournamentStaff({ isSuperAdmin: true, uid: 'super-uid', managerId: null })).toBe(false);
    expect(canManageTournamentStaff({ isSuperAdmin: false, uid: dono, managerId: null })).toBe(false);
  });

  it('não libera nada antes do usuário resolver', () => {
    expect(canManageTournamentStaff({ isSuperAdmin: true, uid: undefined, managerId: dono })).toBe(false);
  });
});

/** A busca de candidato não pode oferecer quem as rules recusam — o dono do torneio é o caso
 *  que só aparece quando quem busca é o super admin, porque o dono nunca busca a si mesmo. */
describe('staffCandidateExclusions', () => {
  const dono = 'dono-uid';
  const membro = 'membro-uid';

  it('tira da busca quem já está na equipe', () => {
    const out = staffCandidateExclusions({ memberUids: [membro], uid: 'super-uid', managerId: dono });
    expect(out).toContain(membro);
  });

  it('tira da busca o próprio usuário logado', () => {
    const out = staffCandidateExclusions({ memberUids: [], uid: 'super-uid', managerId: dono });
    expect(out).toContain('super-uid');
  });

  it('tira da busca o dono do torneio — as rules recusam adicioná-lo à própria equipe', () => {
    const out = staffCandidateExclusions({ memberUids: [], uid: 'super-uid', managerId: dono });
    expect(out).toContain(dono);
  });

  it('não repete uid quando o dono é o próprio usuário logado', () => {
    const out = staffCandidateExclusions({ memberUids: [membro], uid: dono, managerId: dono });
    expect(out.filter((u) => u === dono).length).toBe(1);
  });

  it('funciona antes do torneio e do usuário resolverem', () => {
    expect(staffCandidateExclusions({ memberUids: [membro], uid: undefined, managerId: null })).toEqual([membro]);
  });
});
