import { roleFromStaffMirror, roleReachesMoney } from './tournament-role';

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
