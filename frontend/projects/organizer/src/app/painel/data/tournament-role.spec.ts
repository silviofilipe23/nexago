import { myMoneyTournaments, roleFromStaffMirror, roleReachesMoney } from './tournament-role';
import type { OrganizerTournament } from './tournament.model';

describe('roleFromStaffMirror', () => {
  it('gestor ativo é manager', () => {
    expect(roleFromStaffMirror({ role: 'manager', status: 'active' })).toBe('manager');
  });

  it('papel ausente conta como gestor, igual ao backend', () => {
    expect(roleFromStaffMirror({ status: 'active' })).toBe('manager');
  });

  it('administrador do evento é eventAdmin', () => {
    expect(roleFromStaffMirror({ role: 'eventAdmin', status: 'active' })).toBe('eventAdmin');
  });

  it('mesário não tem papel neste portal', () => {
    expect(roleFromStaffMirror({ role: 'scorer', status: 'active' })).toBeNull();
  });

  it('staff inativo não tem papel', () => {
    expect(roleFromStaffMirror({ role: 'manager', status: 'removed' })).toBeNull();
  });

  it('status ausente conta como ativo', () => {
    expect(roleFromStaffMirror({ role: 'manager' })).toBe('manager');
  });
});

describe('roleReachesMoney', () => {
  it('dono e gestor alcançam o caixa', () => {
    expect(roleReachesMoney('owner')).toBe(true);
    expect(roleReachesMoney('manager')).toBe(true);
  });

  it('administrador do evento NÃO alcança o caixa', () => {
    expect(roleReachesMoney('eventAdmin')).toBe(false);
  });

  it('sem papel não alcança', () => {
    expect(roleReachesMoney(null)).toBe(false);
  });
});

function t(id: string, myRole: 'owner' | 'manager' | 'eventAdmin' | null): OrganizerTournament {
  return { id, name: id, myRole } as OrganizerTournament;
}

describe('myMoneyTournaments', () => {
  it('mantém próprios e os que gerencia, tira os que só administra', () => {
    const rows = myMoneyTournaments([t('a', 'owner'), t('b', 'eventAdmin'), t('c', 'manager')]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('só administrador devolve lista vazia', () => {
    expect(myMoneyTournaments([t('b', 'eventAdmin')])).toEqual([]);
  });

  it('torneio sem papel conhecido (leitura pública/telão/suporte) não entra', () => {
    expect(myMoneyTournaments([t('d', null)])).toEqual([]);
  });
});
