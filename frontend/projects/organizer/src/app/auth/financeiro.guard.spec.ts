import { canSeeFinanceiro } from '../painel/data/tournament-role';
import type { OrganizerTournament } from '../painel/data/tournament.model';

function t(id: string, myRole: 'owner' | 'manager' | 'eventAdmin'): OrganizerTournament {
  return { id, name: id, myRole } as OrganizerTournament;
}

describe('canSeeFinanceiro', () => {
  it('dono vê', () => {
    expect(canSeeFinanceiro([t('a', 'owner')])).toBeTrue();
  });

  it('gestor vê', () => {
    expect(canSeeFinanceiro([t('a', 'manager')])).toBeTrue();
  });

  it('só administrador NÃO vê', () => {
    expect(canSeeFinanceiro([t('a', 'eventAdmin')])).toBeFalse();
  });

  it('sem torneio nenhum não vê', () => {
    expect(canSeeFinanceiro([])).toBeFalse();
  });

  it('administrador em um e gestor em outro vê', () => {
    expect(canSeeFinanceiro([t('a', 'eventAdmin'), t('b', 'manager')])).toBeTrue();
  });
});
