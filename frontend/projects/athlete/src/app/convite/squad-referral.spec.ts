import { parseSquadReferral, referralCopy, type SquadReferral, type SquadReferralLookup } from './squad-referral';

function referral(overrides: Partial<SquadReferral> = {}): SquadReferral {
  return {
    ambassador: { uid: 'amb1', name: 'Silvio', photoUrl: null, tier: 'ath', place: null },
    discountPct: 10,
    firstOnly: true,
    scope: { registration: true, booking: true, club: true },
    ...overrides,
  };
}

const found = (r: SquadReferral = referral()): SquadReferralLookup => ({ kind: 'found', referral: r });

describe('parseSquadReferral', () => {
  it('lê o embaixador e a oferta da callable', () => {
    expect(
      parseSquadReferral({
        referral: {
          ambassador: {
            uid: 'amb1',
            name: 'Silvio',
            photoUrl: 'https://cdn.test/s.jpg',
            tier: 'amb',
            city: 'Goiânia',
            state: 'GO',
            arenaName: 'Arena Sol',
          },
          discountPct: 10,
          firstOnly: true,
          scope: { registration: true, booking: false, club: true },
        },
      }),
    ).toEqual(
      found(
        referral({
          ambassador: { uid: 'amb1', name: 'Silvio', photoUrl: 'https://cdn.test/s.jpg', tier: 'amb', place: 'Goiânia, GO · Arena Sol' },
          scope: { registration: true, booking: false, club: true },
        }),
      ),
    );
  });

  it('referral null = código sem contrato vigente; resposta torta = não sabe', () => {
    expect(parseSquadReferral({ referral: null })).toEqual({ kind: 'inactive' });
    expect(parseSquadReferral(null)).toEqual({ kind: 'unknown' });
    expect(parseSquadReferral({ referral: { ambassador: { uid: 'x' }, scope: {} } })).toEqual({ kind: 'unknown' });
  });

  it('foto fora de http e nível desconhecido não passam', () => {
    const l = parseSquadReferral({
      referral: {
        ambassador: { uid: 'amb1', name: 'Silvio', photoUrl: 'javascript:alert(1)', tier: 'boss' },
        discountPct: 10,
        firstOnly: true,
        scope: { registration: true, booking: true, club: true },
      },
    });
    expect(l.kind === 'found' && l.referral.ambassador.photoUrl).toBeNull();
    expect(l.kind === 'found' && l.referral.ambassador.tier).toBeNull();
  });
});

describe('referralCopy', () => {
  it('visitante: quem convidou, o desconto e onde vale', () => {
    expect(referralCopy(found(), 'guest')).toEqual({
      title: 'Silvio te deu desconto no nexaGO',
      lead: 'Crie sua conta grátis por este link e o desconto entra sozinho no pagamento.',
      offer: 'Até 10% OFF na primeira inscrição, reserva e clubinho',
    });
  });

  it('a oferta segue o escopo e o "só na primeira" das regras', () => {
    const r = referral({ firstOnly: false, scope: { registration: true, booking: false, club: false } });
    expect(referralCopy(found(r), 'guest').offer).toBe('Até 10% OFF em inscrições');
  });

  it('sem desconto (nível 0% ou desligado em tudo) não promete desconto', () => {
    const off = referral({ scope: { registration: false, booking: false, club: false } });
    expect(referralCopy(found(off), 'guest')).toEqual(
      jasmine.objectContaining({ title: 'Silvio te convidou pro nexaGO', offer: null }),
    );
    expect(referralCopy(found(referral({ discountPct: 0 })), 'member').offer).toBeNull();
  });

  it('o próprio embaixador vê que o link é dele', () => {
    expect(referralCopy(found(), 'self').title).toBe('Este é o seu link de embaixador');
  });

  it('código pausado ou encerrado: avisa e não promete', () => {
    expect(referralCopy({ kind: 'inactive' }, 'guest')).toEqual(
      jasmine.objectContaining({ title: 'Este código não está ativo', offer: null }),
    );
  });

  it('sem resposta do servidor: só o que vale para qualquer código', () => {
    expect(referralCopy({ kind: 'unknown' }, 'guest').offer).toBe('Desconto na taxa de serviço da nexaGO');
  });
});
