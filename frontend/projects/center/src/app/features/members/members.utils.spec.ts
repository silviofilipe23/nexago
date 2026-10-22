import type { CenterInvite, CenterMember } from '../../domain/models';
import { buildTeamRows, inviteEmailError, permissionView, teamSummary, toggleExtra } from './members.utils';

function member(over: Partial<CenterMember>): CenterMember {
  return {
    uid: 'u', centerId: 'c', centerName: 'CT', role: 'coach', status: 'active', displayName: 'Ana', email: 'ana@x.com',
    extraPerms: [], programIds: [], joinedAt: null, revokedAt: null, inviteId: null, ...over,
  };
}

function invite(over: Partial<CenterInvite>): CenterInvite {
  return {
    id: 'i1', centerId: 'c', centerName: 'CT', email: 'paula@x.com', displayName: 'Paula', role: 'coach', programIds: [],
    classIds: [], status: 'pending', invitedByUid: 'o', invitedByName: 'Owner', createdAt: null, ...over,
  };
}

describe('members.utils', () => {
  const members = [
    member({ uid: 'r', displayName: 'Rita', role: 'receptionist' }),
    member({ uid: 'x', displayName: 'Xavier', status: 'revoked' }),
    member({ uid: 'o', displayName: 'Olga', role: 'center_owner', email: 'olga@x.com' }),
    member({ uid: 'b', displayName: 'Bruno', role: 'coach' }),
  ];

  it('buildTeamRows junta convites pendentes e ordena por situação e papel', () => {
    const rows = buildTeamRows(members, [invite({}), invite({ id: 'i2', status: 'cancelled' })]);
    expect(rows.map((r) => r.name)).toEqual(['Olga', 'Bruno', 'Rita', 'Paula', 'Xavier']);
    expect(rows[3]!.kind).toBe('invite');
    expect(rows[3]!.key).toBe('invite:i1');
  });

  it('teamSummary conta só ativos', () => {
    expect(teamSummary(members)).toBe('3 vínculos · 1 professor · 1 recepção');
  });

  it('permissionView trava os padrões do papel e marca extras', () => {
    const v = permissionView('coach', ['view_finance']);
    expect(v.find((p) => p.perm === 'attendance')).toEqual({ perm: 'attendance', isDefault: true, on: true, extra: false });
    expect(v.find((p) => p.perm === 'view_finance')!.extra).toBeTrue();
    expect(v.find((p) => p.perm === 'edit_plans')!.on).toBeFalse();
  });

  it('toggleExtra mantém a ordem e ignora permissões padrão', () => {
    expect(toggleExtra('coach', ['view_finance'], 'view_enrollments', true)).toEqual(['view_enrollments', 'view_finance']);
    expect(toggleExtra('coach', ['view_finance', 'attendance'], 'view_finance', false)).toEqual([]);
    expect(toggleExtra('coach', [], 'attendance', true)).toEqual([]);
  });

  it('inviteEmailError valida formato e duplicidade', () => {
    expect(inviteEmailError('nope', members, [])).toContain('válido');
    expect(inviteEmailError(' OLGA@x.com ', members, [])).toContain('já faz parte');
    expect(inviteEmailError('paula@x.com', members, [invite({})])).toContain('pendente');
    expect(inviteEmailError('nova@x.com', members, [invite({})])).toBeNull();
  });
});
