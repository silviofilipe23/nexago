import { arenaCapabilitiesFor } from './arena-plan.model';

describe('arenaCapabilitiesFor — capability equipe', () => {
  it('pro com titularidade tem equipe', () => {
    expect(arenaCapabilitiesFor('pro', true).has('equipe')).toBe(true);
  });

  it('elite com titularidade tem equipe', () => {
    expect(arenaCapabilitiesFor('elite', true).has('equipe')).toBe(true);
  });

  it('starter nao tem equipe', () => {
    expect(arenaCapabilitiesFor('starter', true).has('equipe')).toBe(false);
  });

  it('sem titularidade nao tem equipe mesmo em elite', () => {
    expect(arenaCapabilitiesFor('elite', false).has('equipe')).toBe(false);
  });

  it('sem plano nao tem equipe', () => {
    expect(arenaCapabilitiesFor(null, false).has('equipe')).toBe(false);
  });
});
