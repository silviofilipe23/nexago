import { organizerBrandNameFromData, organizerPersonNameFromData } from './organizer-name-lookup';

describe('nome do organizador ("Organizado por")', () => {
  it('marca só com isOrganizer: doc criado pelos números ou pelo contador não tem nome', () => {
    expect(organizerBrandNameFromData({ name: ' Liga Amadora ', isOrganizer: true })).toBe('Liga Amadora');
    expect(organizerBrandNameFromData({ name: 'Liga Amadora', isOrganizer: false })).toBeNull();
    expect(organizerBrandNameFromData({ uid: 'o', stats: {}, listed: false })).toBeNull();
    expect(organizerBrandNameFromData({ followersCount: 3 })).toBeNull();
    expect(organizerBrandNameFromData({ isOrganizer: true, name: '  ' })).toBeNull();
    expect(organizerBrandNameFromData(undefined)).toBeNull();
  });

  it('pessoa (public_profiles): nome completo, depois nome, depois apelido sem @', () => {
    expect(organizerPersonNameFromData({ fullName: ' Ana Organiza ', nickname: '@ana' })).toBe('Ana Organiza');
    expect(organizerPersonNameFromData({ name: 'Ana', nickname: '@ana' })).toBe('Ana');
    expect(organizerPersonNameFromData({ nickname: '@ana' })).toBe('ana');
    expect(organizerPersonNameFromData({})).toBeNull();
    expect(organizerPersonNameFromData(undefined)).toBeNull();
  });
});
