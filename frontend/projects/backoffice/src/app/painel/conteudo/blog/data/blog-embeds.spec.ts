import type { TournamentRow } from '../../../torneios/data/tournaments.repository';
import {
  filterProducts,
  mergeTournamentResults,
  productPriceLabel,
  showcaseProductFromDoc,
  tournamentMeta,
} from './blog-embeds';

function row(id: string, name: string, over: Partial<TournamentRow> = {}): TournamentRow {
  return {
    id,
    name,
    sport: null,
    status: 'inscricoes',
    visibility: null,
    startAt: null,
    place: null,
    categoriesCount: 0,
    capacity: null,
    managerId: null,
    entryFeeReais: null,
    ...over,
  };
}

describe('blog · blocos nexaGO', () => {
  it('produto da vitrine: capa ou primeira foto; sem nome ou preço fica de fora', () => {
    expect(
      showcaseProductFromDoc('t1', {
        name: 'Toalha nexaGO',
        priceCents: 8990,
        minPriceCents: 7990,
        maxPriceCents: 8990,
        photos: [{ url: '' }, { url: 'https://x/foto.jpg' }],
      }),
    ).toEqual({ id: 't1', name: 'Toalha nexaGO', minPriceCents: 7990, maxPriceCents: 8990, coverUrl: 'https://x/foto.jpg' });
    expect(showcaseProductFromDoc('t2', { name: 'Boné', priceCents: 5000, coverUrl: 'https://x/c.jpg' })).toEqual(
      jasmine.objectContaining({ minPriceCents: 5000, maxPriceCents: 5000, coverUrl: 'https://x/c.jpg' }),
    );
    expect(showcaseProductFromDoc('t3', { name: 'Sem preço' })).toBeNull();
    expect(showcaseProductFromDoc('t4', { priceCents: 100 })).toBeNull();
    expect(showcaseProductFromDoc('t5', undefined)).toBeNull();
  });

  it('preço: valor único ou "a partir de"', () => {
    expect(productPriceLabel({ minPriceCents: 8990, maxPriceCents: 8990 })).toBe('R$ 89,90');
    expect(productPriceLabel({ minPriceCents: 7990, maxPriceCents: 8990 })).toBe('a partir de R$ 79,90');
  });

  it('busca de produto sem acento, em ordem alfabética', () => {
    const products = [
      { id: 'b', name: 'Toalha nexaGO', minPriceCents: 1, maxPriceCents: 1, coverUrl: null },
      { id: 'a', name: 'Boné Areia', minPriceCents: 1, maxPriceCents: 1, coverUrl: null },
    ];
    expect(filterProducts(products, '').map((p) => p.id)).toEqual(['a', 'b']);
    expect(filterProducts(products, 'bone').map((p) => p.id)).toEqual(['a']);
  });

  it('busca de torneio junta o prefixo do Firestore com os recentes que contêm o termo, sem repetir', () => {
    const recent = [row('1', 'Copa Goiás Beach'), row('2', 'Liga nexaGO'), row('3', 'Open de Goiânia')];
    const prefix = [row('9', 'Goiânia Open 2025'), row('3', 'Open de Goiânia')];
    expect(mergeTournamentResults([], recent, '').map((t) => t.id)).toEqual(['1', '2', '3']);
    expect(mergeTournamentResults(prefix, recent, 'goiania').map((t) => t.id)).toEqual(['9', '3']);
    expect(mergeTournamentResults([], recent, 'goias').map((t) => t.id)).toEqual(['1']);
  });

  it('linha do torneio: cidade e data quando houver', () => {
    const now = new Date('2026-11-05T15:00:00Z');
    expect(tournamentMeta({ place: 'Goiânia', startAt: new Date('2026-10-24T13:00:00Z') }, now)).toBe('Goiânia · 24 out');
    expect(tournamentMeta({ place: null, startAt: null }, now)).toBe('Sem cidade nem data');
  });
});
