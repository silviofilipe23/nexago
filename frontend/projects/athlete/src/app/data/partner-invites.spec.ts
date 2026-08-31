import { pendingInvitesView } from './partner-invites.service';
import type { TournamentPartnerInvite } from './tournament-registrations-repository';
import type { TournamentSummary } from './tournaments-repository';

function invite(id: string, tournamentId: string): TournamentPartnerInvite {
  return {
    id,
    tournamentId,
    categoryId: 'c1',
    inviterUid: 'u1',
    inviterName: 'Silvio',
    createdAt: null,
    expiresAt: null,
    isTeamInvite: false,
    teamName: null,
    teamSize: null,
    isSubstitutionInvite: false,
    replacedName: null,
  };
}

function tournament(id: string, isCancelled: boolean): TournamentSummary {
  return { id, name: `Torneio ${id}`, isCancelled } as TournamentSummary;
}

describe('pendingInvitesView', () => {
  it('resolve o torneio do convite (é o nome que o card mostra)', () => {
    const view = pendingInvitesView([invite('i1', 't1')], new Map([['t1', tournament('t1', false)]]), new Set());

    expect(view.length).toBe(1);
    expect(view[0]!.tournament?.name).toBe('Torneio t1');
  });

  it('esconde o convite de torneio cancelado — aceitar só devolveria erro', () => {
    const view = pendingInvitesView([invite('i1', 't1')], new Map([['t1', tournament('t1', true)]]), new Set());

    expect(view).toEqual([]);
  });

  it('mantém o convite cujo torneio não carregou, sem torneio resolvido', () => {
    const view = pendingInvitesView([invite('i1', 't1')], new Map(), new Set());

    expect(view.length).toBe(1);
    expect(view[0]!.tournament).toBeNull();
  });

  it('tira da tela o convite já respondido nesta sessão, sem esperar o snapshot', () => {
    const view = pendingInvitesView(
      [invite('i1', 't1'), invite('i2', 't1')],
      new Map([['t1', tournament('t1', false)]]),
      new Set(['i1']),
    );

    expect(view.map((v) => v.invite.id)).toEqual(['i2']);
  });
});
