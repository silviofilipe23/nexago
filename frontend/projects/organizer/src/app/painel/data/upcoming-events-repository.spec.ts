import { upcomingEventFromDoc, upcomingPublicEvents } from './upcoming-events-repository';

const NOW = new Date('2026-10-07T12:00:00Z');
const doc = (over: Record<string, unknown> = {}) => ({
  name: 'Etapa',
  startAt: '2026-10-20T12:00:00Z',
  visibility: 'publicListing',
  status: 'open',
  ...over,
});
const parsed = (id: string, over: Record<string, unknown> = {}) => upcomingEventFromDoc(id, doc(over))!;

describe('upcomingEventFromDoc', () => {
  it('lê local, UF, capa, categorias e prêmios', () => {
    const e = upcomingEventFromDoc('t1', {
      ...doc(),
      locationName: 'Arena X',
      location: 'outro',
      city: 'Fortaleza',
      state: 'CE',
      posterUrl: 'https://img/p.png',
      capacity: 10,
      prizes: [{ value: 2000 }, { valueCents: 5000 }],
      categories: [{ categoryName: 'Open', spotsTotal: 12, prizes: [{ value: 'R$ 1.000,00' }] }, { name: 'Misto', maxTeams: 8 }],
      listingStatus: 'closed',
    })!;
    expect(e.venue).toBe('Arena X');
    expect(e.state).toBe('CE');
    expect(e.coverUrl).toBe('https://img/p.png');
    expect(e.categories).toEqual([{ name: 'Open', maxTeams: 12 }, { name: 'Misto', maxTeams: 8 }]);
    expect(e.prizes).toEqual([{ valueCents: null, value: '2000' }, { valueCents: 5000, value: null }]);
    expect(e.categoryPrizes).toEqual([{ valueCents: null, value: 'R$ 1.000,00' }]);
    expect(e.status).toBe('closed');
  });

  it('sem nome ou data = null', () => {
    expect(upcomingEventFromDoc('x', { startAt: '2026-10-20T00:00:00Z' })).toBeNull();
    expect(upcomingEventFromDoc('x', { name: 'A' })).toBeNull();
  });
});

describe('upcomingPublicEvents', () => {
  it('só listagem pública, ativa e futura, por início', () => {
    const list = [
      parsed('b', { startAt: '2026-11-01T12:00:00Z' }),
      parsed('a'),
      parsed('link', { visibility: 'linkOnly' }),
      parsed('sem', { visibility: undefined }),
      parsed('rascunho', { status: 'draft' }),
      parsed('cancelado', { listingStatus: 'cancelled' }),
      parsed('passado', { startAt: '2026-09-01T12:00:00Z' }),
      parsed('em-curso', { startAt: '2026-10-05T12:00:00Z', endAt: '2026-10-09T12:00:00Z' }),
    ];
    expect(upcomingPublicEvents(list, NOW).map((e) => e.id)).toEqual(['em-curso', 'a', 'b']);
  });
});
