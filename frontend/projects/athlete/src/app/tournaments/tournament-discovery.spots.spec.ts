import {
  discoveryEnrolledLabel,
  discoveryFillPercent,
  discoveryShowsOffer,
  discoverySpotsOf,
  type DiscoverySpotsSource,
} from './tournament-discovery.spots';

/** Torneio recém-criado como o wizard grava: `enrolledCount: 0` e cada categoria com
 *  `spotsLeft` igual à própria capacidade — nenhum dos dois é atualizado depois. */
function summary(over: Partial<DiscoverySpotsSource> = {}): DiscoverySpotsSource {
  return {
    capacity: 32,
    enrolledCount: 0,
    categories: [
      { maxTeams: 16, spotsLeft: 16 },
      { maxTeams: 16, spotsLeft: 16 },
    ],
    ...over,
  };
}

describe('discoverySpotsOf', () => {
  it('conta as vagas preenchidas pela contagem fresca de inscrições', () => {
    // O bug do card: os campos do doc dizem "nenhuma vaga preenchida" mesmo com 12 duplas
    // inscritas, porque ninguém os atualiza.
    expect(discoverySpotsOf(summary(), 12).filled).toBe(12);
  });

  it('desconta as vagas preenchidas das restantes', () => {
    expect(discoverySpotsOf(summary(), 12).left).toBe(20);
  });

  it('não deixa as vagas restantes negativarem quando a lista de espera passa da capacidade', () => {
    expect(discoverySpotsOf(summary(), 35).left).toBe(0);
  });

  it('mantém a capacidade cadastrada como total', () => {
    expect(discoverySpotsOf(summary(), 12).total).toBe(32);
  });

  it('soma as vagas das categorias como total, não o `capacity` do doc', () => {
    // Numerador conta duplas, então o total tem de ser em duplas também: há torneio com
    // `capacity` gravado em atletas (o script de seed grava `maxTeams * 2`), e aí o card
    // mostraria metade do preenchimento real.
    expect(discoverySpotsOf(summary({ capacity: 64 }), 12).total).toBe(32);
  });

  it('usa o `capacity` do doc quando as categorias não declaram capacidade', () => {
    expect(discoverySpotsOf(summary({ categories: [{ maxTeams: 0, spotsLeft: 0 }] }), 12).total).toBe(32);
  });

  it('usa o `capacity` do doc em torneio sem categorias', () => {
    expect(discoverySpotsOf(summary({ categories: [] }), 12).total).toBe(32);
  });

  it('cai nos campos do doc quando a contagem fresca não veio (leitura recusada/offline)', () => {
    // Sem contagem fresca sobra o que o doc diz — 32 - (16+16) = 0 preenchidas.
    expect(discoverySpotsOf(summary(), null).filled).toBe(0);
  });

  it('usa spotsLeft das categorias no fallback quando o organizador já decrementou', () => {
    expect(
      discoverySpotsOf(summary({ categories: [{ maxTeams: 16, spotsLeft: 6 }, { maxTeams: 16, spotsLeft: 10 }] }), null).filled,
    ).toBe(16);
  });

  it('cai em enrolledCount do doc no fallback de torneio sem categorias', () => {
    expect(discoverySpotsOf(summary({ categories: [], enrolledCount: 9 }), null).filled).toBe(9);
  });
});

describe('discoveryFillPercent', () => {
  it('arredonda a porcentagem preenchida', () => {
    expect(discoveryFillPercent({ filled: 12, total: 32 })).toBe(38);
  });

  it('não passa de 100% quando a lista de espera estoura a capacidade', () => {
    expect(discoveryFillPercent({ filled: 35, total: 32 })).toBe(100);
  });

  it('é zero quando o torneio não tem capacidade cadastrada', () => {
    expect(discoveryFillPercent({ filled: 4, total: 0 })).toBe(0);
  });
});

describe('discoveryShowsOffer', () => {
  it('esconde vaga e valor no torneio concluído', () => {
    expect(discoveryShowsOffer('ended')).toBe(false);
  });

  it('mantém a oferta enquanto o torneio não encerrou', () => {
    expect(discoveryShowsOffer('open')).toBe(true);
    expect(discoveryShowsOffer('almost_full')).toBe(true);
    expect(discoveryShowsOffer('live')).toBe(true);
  });
});

describe('discoveryEnrolledLabel', () => {
  it('conta duplas no torneio de duplas', () => {
    expect(discoveryEnrolledLabel(12, 'Dupla')).toBe('12 duplas inscritas');
  });

  it('concorda no singular', () => {
    expect(discoveryEnrolledLabel(1, 'Dupla')).toBe('1 dupla inscrita');
  });

  it('conta atletas no torneio individual', () => {
    // `filled` conta docs de inscrição: um doc é uma dupla no torneio de duplas e um atleta no
    // individual — chamar tudo de "dupla" mentiria na metade dos cards.
    expect(discoveryEnrolledLabel(12, 'Individual')).toBe('12 atletas inscritos');
    expect(discoveryEnrolledLabel(1, 'Individual')).toBe('1 atleta inscrito');
  });

  it('diz que ninguém se inscreveu em vez de mostrar zero', () => {
    expect(discoveryEnrolledLabel(0, 'Dupla')).toBe('Nenhuma dupla inscrita');
    expect(discoveryEnrolledLabel(0, 'Individual')).toBe('Nenhum atleta inscrito');
  });
});
