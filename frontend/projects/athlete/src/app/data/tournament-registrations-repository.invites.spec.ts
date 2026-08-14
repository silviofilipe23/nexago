import { partnerInvitesFromDocs, sentInvitesFromDocs, type RawInviteDoc } from './tournament-registrations-repository';

/** Mesma função para a busca única e para o listener (`watchMyPendingPartnerInvites`): é aqui
 *  que mora a regra de "pendente de verdade", já que o Firestore não filtra `expiresAt`. */
function doc(id: string, data: Record<string, unknown>): RawInviteDoc {
  return { id, data };
}

function timestamp(ms: number): { toDate: () => Date } {
  return { toDate: () => new Date(ms) };
}

describe('partnerInvitesFromDocs', () => {
  const now = Date.UTC(2026, 7, 14, 12, 0, 0);

  it('mapeia o convite de dupla que chega pelo snapshot', () => {
    const invites = partnerInvitesFromDocs(
      [
        doc('i1', {
          tournamentId: 't1',
          categoryId: 'c1',
          inviterUid: 'u1',
          inviterName: 'Silvio',
          expiresAt: timestamp(now + 60_000),
        }),
      ],
      now,
    );

    expect(invites.length).toBe(1);
    expect(invites[0]!.id).toBe('i1');
    expect(invites[0]!.inviterName).toBe('Silvio');
    expect(invites[0]!.isTeamInvite).toBeFalse();
    expect(invites[0]!.teamSize).toBeNull();
  });

  it('corta o convite expirado e mantém o sem prazo', () => {
    const invites = partnerInvitesFromDocs(
      [
        doc('vencido', { tournamentId: 't1', categoryId: 'c1', expiresAt: timestamp(now - 1) }),
        doc('sem-prazo', { tournamentId: 't1', categoryId: 'c1' }),
      ],
      now,
    );

    expect(invites.map((i) => i.id)).toEqual(['sem-prazo']);
  });

  it('lê o convite de equipe nomeada (trio+) e ignora tamanho fora de 3–5', () => {
    const [trio, furado] = partnerInvitesFromDocs(
      [
        doc('i1', { isTeamInvite: true, teamName: 'Areia Quente', teamSize: 4 }),
        doc('i2', { isTeamInvite: true, teamName: 'Dupla disfarçada', teamSize: 2 }),
      ],
      now,
    );

    expect(trio!.isTeamInvite).toBeTrue();
    expect(trio!.teamName).toBe('Areia Quente');
    expect(trio!.teamSize).toBe(4);
    expect(furado!.teamSize).toBeNull();
  });

  it('convite sem nome de quem convidou não vira card em branco', () => {
    const [invite] = partnerInvitesFromDocs([doc('i1', { inviterName: '   ' })], now);
    expect(invite!.inviterName).toBe('Atleta');
  });
});

describe('sentInvitesFromDocs', () => {
  const now = Date.UTC(2026, 7, 14, 12, 0, 0);

  it('lista os enviados que ainda valem, com o nome de quem foi convidado', () => {
    const invites = sentInvitesFromDocs(
      [
        doc('i1', { inviteeUid: 'u2', inviteeName: 'Ana', expiresAt: timestamp(now + 1) }),
        doc('i2', { inviteeUid: 'u3', inviteeName: 'Bia', expiresAt: timestamp(now - 1) }),
      ],
      now,
    );

    expect(invites.length).toBe(1);
    expect(invites[0]!.inviteeUid).toBe('u2');
    expect(invites[0]!.inviteeName).toBe('Ana');
  });
});
