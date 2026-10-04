import { kocCardLabel, kocCardScore, kocOrderByCards, type KocCard } from './koc-card-order';

const c = (rank: KocCard['rank'], suit: KocCard['suit'] = 'diamonds'): KocCard => ({ rank, suit });

describe('kocCardScore', () => {
  it('o valor domina o naipe', () => {
    expect(kocCardScore(c('3', 'clubs'))).toBeLessThan(kocCardScore(c('4', 'diamonds')));
  });

  it('Ás é a mais alta e o naipe desempata na ordem do truco', () => {
    expect(kocCardScore(c('A'))).toBeGreaterThan(kocCardScore(c('K', 'clubs')));
    const suits = (['diamonds', 'spades', 'hearts', 'clubs'] as const).map((s) => kocCardScore(c('7', s)));
    expect(suits).toEqual([...suits].sort((a, b) => a - b));
  });
});

describe('kocOrderByCards', () => {
  it('maior carta vai ao trono, depois a fila em ordem decrescente', () => {
    const result = kocOrderByCards(['a', 'b', 'c', 'd'], {
      a: c('5'),
      b: c('A'),
      c: c('10'),
      d: c('2'),
    });
    expect(result).toEqual({ ok: true, order: ['b', 'c', 'a', 'd'] });
  });

  it('mesmo valor desempata pelo naipe', () => {
    const result = kocOrderByCards(['a', 'b', 'c'], {
      a: c('9', 'diamonds'),
      b: c('9', 'clubs'),
      c: c('9', 'hearts'),
    });
    expect(result).toEqual({ ok: true, order: ['b', 'c', 'a'] });
  });

  it('recusa dupla sem carta e aponta quais faltam', () => {
    expect(kocOrderByCards(['a', 'b', 'c'], { a: c('2'), c: c('3') })).toEqual({
      ok: false,
      reason: 'missing',
      teamIds: ['b'],
    });
  });

  it('recusa a mesma carta em duas duplas e aponta as duas', () => {
    expect(kocOrderByCards(['a', 'b', 'c'], { a: c('K', 'hearts'), b: c('2'), c: c('K', 'hearts') })).toEqual({
      ok: false,
      reason: 'duplicate',
      teamIds: ['a', 'c'],
    });
  });

  it('não altera a lista recebida', () => {
    const ids = ['a', 'b'];
    kocOrderByCards(ids, { a: c('2'), b: c('3') });
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('kocCardLabel', () => {
  it('mostra valor e símbolo do naipe', () => {
    expect(kocCardLabel(c('Q', 'spades'))).toBe('Q♠');
  });
});
