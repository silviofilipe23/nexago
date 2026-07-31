import { arenaInviteLink, arenaInviteWhatsAppUrl, arenaStaffMemberFromDoc, arenaStaffInviteFromDoc } from './arena-staff.model';

function snap(id: string, data: Record<string, unknown> | undefined) {
  return { id, data: () => data } as never;
}

describe('arena-staff.model', () => {
  it('le membro ativo', () => {
    const m = arenaStaffMemberFromDoc(
      snap('uid-1', { role: 'gestor', status: 'active', email: 'a@b.com', displayName: 'Ana' }),
    );
    expect(m?.uid).toBe('uid-1');
    expect(m?.role).toBe('gestor');
    expect(m?.displayName).toBe('Ana');
  });

  it('descarta membro com cargo invalido ou inativo', () => {
    expect(arenaStaffMemberFromDoc(snap('x', { role: 'chefe', status: 'active' }))).toBeNull();
    expect(arenaStaffMemberFromDoc(snap('x', { role: 'gestor', status: 'suspended' }))).toBeNull();
    expect(arenaStaffMemberFromDoc(snap('x', undefined))).toBeNull();
  });

  it('usa o e-mail como nome quando displayName falta', () => {
    const m = arenaStaffMemberFromDoc(snap('u', { role: 'recepcao', status: 'active', email: 'bia@x.com' }));
    expect(m?.displayName).toBe('bia');
  });

  it('le so convites pendentes', () => {
    expect(arenaStaffInviteFromDoc(snap('i1', { role: 'recepcao', status: 'pending', emailLower: 'a@b.com' }))?.email).toBe('a@b.com');
    expect(arenaStaffInviteFromDoc(snap('i2', { role: 'recepcao', status: 'accepted', emailLower: 'a@b.com' }))).toBeNull();
  });

  it('monta link e url de whatsapp', () => {
    const link = arenaInviteLink('https://arena.nexago.com.br', 'abc123');
    expect(link).toBe('https://arena.nexago.com.br/convite/abc123');
    expect(arenaInviteWhatsAppUrl(link, 'Arena CFC')).toContain('https://wa.me/?text=');
    expect(decodeURIComponent(arenaInviteWhatsAppUrl(link, 'Arena CFC'))).toContain('Arena CFC');
  });
});
