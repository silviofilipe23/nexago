import { SPORT_CATALOG } from '@nexago/sports';
import { CENTER_SPORTS, sportKey } from './models';

describe('modalidades sugeridas', () => {
  it('são o catálogo do wizard do atleta, na mesma ordem, sem "Outros"', () => {
    expect(CENTER_SPORTS).toEqual(SPORT_CATALOG.filter((s) => s.profileCode !== 'OUTROS').map((s) => s.label));
    expect(CENTER_SPORTS).not.toContain('Outros');
  });

  it('sportKey casa grafias antigas com o catálogo e cai no nome normalizado fora dele', () => {
    expect(sportKey('Beach Tennis')).toBe(sportKey('Beach tennis'));
    expect(sportKey('Funcional')).toBe(sportKey('  funcional '));
  });
});
