import type { UpcomingEventSummary } from '../data/upcoming-events-repository';
import { eventoStatusOf, eventosCardOf, prizeAmountOf, prizeCentsOf, totalSpotsOf } from './eventos-card';

const NOW = Date.UTC(2026, 9, 7, 12);
const DAY = 86_400_000;

function ev(over: Partial<UpcomingEventSummary> = {}): UpcomingEventSummary {
  return {
    id: 't1',
    name: 'Etapa Jericoacoara',
    startAt: new Date(NOW + 10 * DAY),
    endAt: null,
    venue: 'Beach Club Jeri',
    city: 'Jijoca',
    state: 'CE',
    coverUrl: null,
    categories: [{ name: 'Open', maxTeams: 16 }, { name: 'Misto', maxTeams: 8 }],
    capacity: 0,
    prizes: [],
    categoryPrizes: [],
    cashPrizesEnabled: null,
    visibility: 'publicListing',
    status: 'open',
    registrationOpensAt: null,
    registrationClosesAt: null,
    ...over,
  };
}

describe('eventosCardOf', () => {
  it('sem eventos devolve null', () => {
    expect(eventosCardOf([], new Map(), NOW, 'k', 'S')).toBeNull();
  });

  it('pega os 5 primeiros e monta os campos', () => {
    const src = Array.from({ length: 7 }, (_, i) => ev({ id: `t${i}`, name: `Etapa ${i}` }));
    const card = eventosCardOf(src, new Map([['t0', 12]]), NOW, 'k1', 'Circuito 2026')!;
    expect(card.key).toBe('k1');
    expect(card.season).toBe('Circuito 2026');
    expect(card.items.length).toBe(5);
    const first = card.items[0];
    expect(first).toEqual(
      jasmine.objectContaining({ id: 't0', venue: 'Beach Club Jeri', city: 'Jijoca', state: 'CE', categories: ['Open', 'Misto'], total: 24, filled: 12, status: 'abertas', prizeCents: null }),
    );
    expect(first.endMs).toBe(first.startMs);
    expect(first.url).toContain('/torneios/etapa-0-t0');
    expect(card.items[1].filled).toBeNull();
  });
});

describe('prêmio', () => {
  it('lê texto em reais', () => {
    expect(prizeAmountOf('2000')).toBe(2000);
    expect(prizeAmountOf('R$ 2.000,00')).toBe(2000);
    expect(prizeAmountOf('brinde')).toBe(0);
  });

  it('soma valueCents e value, preferindo a raiz às categorias', () => {
    const e = ev({
      prizes: [{ valueCents: 100_000, value: null }, { valueCents: null, value: 'R$ 500,00' }],
      categoryPrizes: [{ valueCents: 999_900, value: null }],
    });
    expect(prizeCentsOf(e)).toBe(150_000);
  });

  it('sem raiz soma as categorias; sem nada ou desligado = null', () => {
    expect(prizeCentsOf(ev({ categoryPrizes: [{ valueCents: null, value: '2000' }, { valueCents: 50_000, value: null }] }))).toBe(250_000);
    expect(prizeCentsOf(ev())).toBeNull();
    expect(prizeCentsOf(ev({ prizes: [{ valueCents: 1000, value: null }], cashPrizesEnabled: false }))).toBeNull();
  });
});

describe('vagas', () => {
  it('soma as categorias, senão usa capacity, senão null', () => {
    expect(totalSpotsOf(ev())).toBe(24);
    expect(totalSpotsOf(ev({ categories: [{ name: 'A', maxTeams: null }], capacity: 30 }))).toBe(30);
    expect(totalSpotsOf(ev({ categories: [], capacity: 0 }))).toBeNull();
  });
});

describe('eventoStatusOf', () => {
  const e = ev();
  it('abertas por padrão', () => expect(eventoStatusOf(e, 24, 5, NOW)).toBe('abertas'));
  it('ultimas acima de 85%', () => {
    expect(eventoStatusOf(e, 20, 18, NOW)).toBe('ultimas');
  });
  it('85% exato ainda é abertas', () => expect(eventoStatusOf(e, 20, 17, NOW)).toBe('abertas'));
  it('esgotado com filled >= total', () => expect(eventoStatusOf(e, 24, 24, NOW)).toBe('esgotado'));
  it('breve antes da abertura', () => {
    expect(eventoStatusOf(ev({ registrationOpensAt: new Date(NOW + DAY) }), 24, 0, NOW)).toBe('breve');
  });
  it('encerradas por prazo ou status', () => {
    expect(eventoStatusOf(ev({ registrationClosesAt: new Date(NOW - DAY) }), 24, 0, NOW)).toBe('encerradas');
    expect(eventoStatusOf(ev({ status: 'closed' }), 24, 0, NOW)).toBe('encerradas');
  });
  it('precedência: esgotado > encerradas > breve > ultimas', () => {
    const fechado = ev({ status: 'closed', registrationOpensAt: new Date(NOW + DAY) });
    expect(eventoStatusOf(fechado, 24, 24, NOW)).toBe('esgotado');
    expect(eventoStatusOf(fechado, 24, 3, NOW)).toBe('encerradas');
    expect(eventoStatusOf(ev({ registrationOpensAt: new Date(NOW + DAY) }), 20, 19, NOW)).toBe('breve');
  });
  it('sem contagem não vira esgotado nem últimas', () => expect(eventoStatusOf(e, 24, null, NOW)).toBe('abertas'));
});
