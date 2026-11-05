import {
  dayHeading,
  entriesByDay,
  monthGrid,
  monthLabel,
  monthOf,
  parseMonthParam,
  shiftMonth,
  undatedPosts,
} from './blog-calendar';
import type { BlogPost } from './blog-post';

function post(id: string, over: Partial<BlogPost> = {}): BlogPost {
  return {
    id,
    title: `Post ${id}`,
    subtitle: '',
    slug: id,
    seoDescription: '',
    coverUrl: null,
    category: 'torneios',
    sport: 'all',
    tags: [],
    author: { name: 'Ana', role: '' },
    body: [],
    cta: null,
    channels: { app: true, site: true },
    featured: false,
    push: { enabled: false, city: null, sport: 'all' },
    pushSentAt: null,
    pushResult: null,
    status: 'draft',
    publishAt: null,
    readMinutes: 1,
    readCount: 0,
    helpfulCount: 0,
    updatedAt: null,
    version: 1,
    ...over,
  };
}

const NOW = new Date('2026-11-05T15:00:00Z');

describe('blog · calendário', () => {
  it('mês de São Paulo, navegação e parâmetro da URL', () => {
    expect(monthOf(new Date('2026-12-01T02:00:00Z'))).toEqual({ year: 2026, month: 11 }); // 23:00 de 30/11 em SP
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthLabel({ year: 2026, month: 11 })).toBe('Novembro 2026');
    expect(parseMonthParam('2026-11')).toEqual({ year: 2026, month: 11 });
    expect(parseMonthParam('2026-13')).toBeNull();
    expect(parseMonthParam(null)).toBeNull();
  });

  it('grade em semanas de domingo a sábado, hoje marcado e dias de fora esmaecidos', () => {
    const grid = monthGrid({ year: 2026, month: 11 }, new Map(), NOW);
    expect(grid.length).toBe(5); // 1/11/2026 é domingo
    expect(grid[0]![0]).toEqual(jasmine.objectContaining({ key: '2026-11-01', inMonth: true }));
    expect(grid[4]![6]).toEqual(jasmine.objectContaining({ key: '2026-12-05', inMonth: false }));
    expect(grid.flat().filter((d) => d.isToday).map((d) => d.key)).toEqual(['2026-11-05']);
    const feb = monthGrid({ year: 2026, month: 2 }, new Map(), NOW);
    expect(feb[0]![0]!.key).toBe('2026-02-01');
    expect(feb.length).toBe(4);
  });

  it('posts no dia de São Paulo, na ordem da hora; hora só no agendado', () => {
    const map = entriesByDay([
      post('pub', { status: 'published', publishAt: new Date('2026-11-13T01:30:00Z') }), // 22:30 de 12/11 em SP
      post('ag', { status: 'scheduled', publishAt: new Date('2026-11-12T12:00:00Z') }),
      post('plan', { status: 'review', publishAt: new Date('2026-11-12T20:00:00Z') }),
      post('sem', {}),
    ]);
    expect([...map.keys()]).toEqual(['2026-11-12']);
    expect(map.get('2026-11-12')!.map((e) => [e.id, e.time])).toEqual([
      ['ag', '09:00'],
      ['plan', null],
      ['pub', null],
    ]);
    const grid = monthGrid({ year: 2026, month: 11 }, map, NOW);
    expect(grid.flat().find((d) => d.key === '2026-11-12')!.entries.length).toBe(3);
  });

  it('sem data: rascunhos sem publishAt, o editado mais recente primeiro', () => {
    const list = undatedPosts([
      post('a', { updatedAt: new Date('2026-10-01T12:00:00Z') }),
      post('b', { updatedAt: new Date('2026-11-01T12:00:00Z') }),
      post('c', { publishAt: NOW }),
    ]);
    expect(list.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('título do dia na lista estreita', () => {
    expect(dayHeading('2026-11-12')).toBe('quinta, 12');
  });
});
