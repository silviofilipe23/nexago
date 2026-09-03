import {
  applyInscriptionChanges,
  buildInscriptions,
  idsMissingFrom,
  inscriptionProfileUids,
  inscriptionTeamIds,
  type InscriptionDocChange,
  type InscriptionProfileDisplay,
  type RawInscription,
} from './inscriptions-repository';
import type { OrganizerTeamPlayers } from './teams-repository';

function added(id: string, data: Record<string, unknown>): InscriptionDocChange {
  return { type: 'added', id, data };
}

/** Cache cru montado pelo MESMO caminho do listener — nada de fabricar `RawInscription` na mão,
 *  senão o teste passa a validar um parse que a tela não usa. */
function cacheWith(...changes: InscriptionDocChange[]): Map<string, RawInscription> {
  return applyInscriptionChanges(new Map(), changes);
}

function team(overrides: Partial<OrganizerTeamPlayers> = {}): OrganizerTeamPlayers {
  return { teamName: null, player1Id: '', player2Id: '', isLookingForPartner: false, ...overrides };
}

function profile(name: string | null): InscriptionProfileDisplay {
  return { name, photoUrl: null, levelsBySport: {}, legacyLevel: null };
}

describe('applyInscriptionChanges', () => {
  it('põe no cache a inscrição que acabou de entrar', () => {
    const cache = cacheWith(added('i1', { tournamentId: 't1', participantUids: ['u1', 'u2'] }));
    expect(cache.get('i1')?.participantUids).toEqual(['u1', 'u2']);
  });

  it('sobrescreve a inscrição já cacheada quando o doc muda', () => {
    const cache = cacheWith(added('i1', { tournamentId: 't1', isPaid: false }));
    applyInscriptionChanges(cache, [{ type: 'modified', id: 'i1', data: { tournamentId: 't1', isPaid: true } }]);
    expect(cache.size).toBe(1);
    expect(cache.get('i1')?.isPaid).toBeTrue();
  });

  it('tira do cache a inscrição removida', () => {
    const cache = cacheWith(added('i1', { tournamentId: 't1' }), added('i2', { tournamentId: 't1' }));
    applyInscriptionChanges(cache, [{ type: 'removed', id: 'i1', data: {} }]);
    expect([...cache.keys()]).toEqual(['i2']);
  });
});

describe('inscriptionTeamIds', () => {
  it('devolve os times referenciados, sem repetir e sem inscrição solo', () => {
    const cache = cacheWith(
      added('i1', { tournamentId: 't1', teamId: 'tm1' }),
      added('i2', { tournamentId: 't1', teamId: 'tm1' }),
      added('i3', { tournamentId: 't1' }),
    );
    expect(inscriptionTeamIds(cache.values())).toEqual(['tm1']);
  });
});

describe('inscriptionProfileUids', () => {
  it('traz os participantes da inscrição', () => {
    const cache = cacheWith(added('i1', { tournamentId: 't1', participantUids: ['u1', 'u2'] }));
    expect(inscriptionProfileUids(cache.values(), new Map()).sort()).toEqual(['u1', 'u2']);
  });

  it('cai nos jogadores do time quando o doc não tem `participantUids`', () => {
    const cache = cacheWith(added('i1', { tournamentId: 't1', teamId: 'tm1' }));
    const teams = new Map([['tm1', team({ player1Id: 'u1', player2Id: 'u2' })]]);
    expect(inscriptionProfileUids(cache.values(), teams).sort()).toEqual(['u1', 'u2']);
  });

  it('inclui os jogadores do time mesmo com participantes no doc — o rótulo da dupla sai desses nomes', () => {
    const cache = cacheWith(added('i1', { tournamentId: 't1', teamId: 'tm1', participantUids: ['u1'] }));
    const teams = new Map([['tm1', team({ player1Id: 'u1', player2Id: 'u2' })]]);
    expect(inscriptionProfileUids(cache.values(), teams).sort()).toEqual(['u1', 'u2']);
  });
});

describe('idsMissingFrom', () => {
  it('devolve só o que ainda não está no cache', () => {
    expect(idsMissingFrom(['a', 'b', 'c'], new Map([['b', 1]]))).toEqual(['a', 'c']);
  });

  it('não pede nada quando o cache já tem tudo', () => {
    expect(
      idsMissingFrom(
        ['a', 'b'],
        new Map([
          ['a', 1],
          ['b', 1],
        ]),
      ),
    ).toEqual([]);
  });
});

describe('buildInscriptions', () => {
  it('usa o nome cadastrado do time como rótulo', () => {
    const cache = cacheWith(added('i1', { tournamentId: 't1', teamId: 'tm1', participantUids: ['u1', 'u2'] }));
    const teams = new Map([['tm1', team({ teamName: 'Os Craques', player1Id: 'u1', player2Id: 'u2' })]]);
    const rows = buildInscriptions(cache.values(), teams, new Map([['u1', profile('Ana')]]));
    expect(rows[0]?.teamName).toBe('Os Craques');
    expect(rows[0]?.customTeamName).toBe('Os Craques');
  });

  it('monta "P1 / P2" pelos perfis quando o time não tem nome', () => {
    const cache = cacheWith(added('i1', { tournamentId: 't1', teamId: 'tm1', participantUids: ['u1', 'u2'] }));
    const teams = new Map([['tm1', team({ player1Id: 'u1', player2Id: 'u2' })]]);
    const profiles = new Map([
      ['u1', profile('Ana')],
      ['u2', profile('Bia')],
    ]);
    expect(buildInscriptions(cache.values(), teams, profiles)[0]?.teamName).toBe('Ana / Bia');
  });

  it('chama de "Atleta" o participante sem perfil espelhado', () => {
    const cache = cacheWith(added('i1', { tournamentId: 't1', participantUids: ['u1'] }));
    const rows = buildInscriptions(cache.values(), new Map(), new Map());
    expect(rows[0]?.participants[0]?.name).toBe('Atleta');
  });

  it('deriva o pagamento dos booleanos do doc', () => {
    const cache = cacheWith(
      added('i1', { tournamentId: 't1', isPaid: true }),
      added('i2', { tournamentId: 't1', waitlist: true }),
      added('i3', { tournamentId: 't1' }),
    );
    const rows = buildInscriptions(cache.values(), new Map(), new Map());
    expect(rows.map((r) => r.paymentStatus)).toEqual(['paid', 'waitlist', 'pending']);
  });
});
