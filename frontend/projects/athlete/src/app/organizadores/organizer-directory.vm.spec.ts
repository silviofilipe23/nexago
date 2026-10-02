import { organizerPublicProfileFromDoc, type OrganizerPublicProfile } from '../data/organizer-public-profiles';
import { filterOrganizers, foldSearchText, organizerDirectoryCardVm, sortOrganizers } from './organizer-directory.vm';

function org(id: string, over: Record<string, unknown> = {}, stats: Record<string, unknown> = {}): OrganizerPublicProfile {
  return organizerPublicProfileFromDoc(id, { name: id, isOrganizer: true, listed: true, ...over, stats: { eventsCompleted: 3, ...stats } });
}

describe('organizerDirectoryCardVm', () => {
  it('logo/iniciais, selo, local, nota, eventos, seguidores e inscrições abertas', () => {
    const vm = organizerDirectoryCardVm(
      org('org-1', { name: 'Liga Amadora Goiânia', city: 'Goiânia', state: 'GO', verified: true, followersCount: 2140 }, { eventsCompleted: 38, openEvents: 3 }),
      { reviewsCount: 312, tournamentsRated: 9, average: 4.81, distribution: null, aspects: {} },
    );
    expect(vm).toEqual({
      id: 'org-1',
      link: ['/organizadores', 'org-1'],
      name: 'Liga Amadora Goiânia',
      initials: 'LAG',
      logoUrl: null,
      verified: true,
      locationLabel: 'Goiânia · GO',
      ratingLabel: '4,8',
      eventsLabel: '38 eventos realizados',
      followersLabel: '2,1 mil seguidores',
      openLabel: '3 com inscrição aberta',
    });
  });

  it('sem nota pública, sem inscrição aberta e no singular', () => {
    const vm = organizerDirectoryCardVm(org('o', { followersCount: 1 }, { eventsCompleted: 1, openEvents: 0 }), {
      reviewsCount: 2,
      tournamentsRated: 1,
      average: null,
      distribution: null,
      aspects: {},
    });
    expect(vm.ratingLabel).toBeNull();
    expect(vm.openLabel).toBeNull();
    expect(vm.eventsLabel).toBe('1 evento realizado');
    expect(vm.followersLabel).toBe('1 seguidor');
    expect(vm.locationLabel).toBeNull();
  });
});

describe('sortOrganizers', () => {
  it('inscrição aberta primeiro, depois seguidores, depois nome', () => {
    const list = [
      org('Zeta', { followersCount: 900 }, { openEvents: 0 }),
      org('Beta', { followersCount: 10 }, { openEvents: 1 }),
      org('alfa', { followersCount: 10 }, { openEvents: 2 }),
      org('Gama', { followersCount: 50 }, { openEvents: 1 }),
      org('Ômega', { followersCount: 900 }, { openEvents: 0 }),
    ];
    expect(sortOrganizers(list).map((o) => o.name)).toEqual(['Gama', 'alfa', 'Beta', 'Ômega', 'Zeta']);
  });
});

describe('busca', () => {
  const list = [
    org('Liga Amadora Goiânia', { city: 'Goiânia', state: 'GO' }),
    org('Circuito Areia Sul', { city: 'Florianópolis', state: 'SC' }),
    org('Beach Club', { city: 'Goiânia', state: 'GO' }),
  ];

  it('sem acento e sem caixa', () => {
    expect(foldSearchText(' Goiânia ')).toBe('goiania');
    expect(filterOrganizers(list, 'goiania').map((o) => o.name)).toEqual(['Liga Amadora Goiânia', 'Beach Club']);
    expect(filterOrganizers(list, 'FLORIANOPOLIS').map((o) => o.name)).toEqual(['Circuito Areia Sul']);
  });

  it('todos os termos têm de casar (nome + cidade)', () => {
    expect(filterOrganizers(list, 'beach goiânia').map((o) => o.name)).toEqual(['Beach Club']);
    expect(filterOrganizers(list, 'liga sc')).toEqual([]);
  });

  it('busca vazia devolve tudo', () => {
    expect(filterOrganizers(list, '   ').length).toBe(3);
  });
});
