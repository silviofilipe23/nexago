import { prejogoFromRaw } from '../../painel/data/broadcast-prejogo';
import { broadcastControlFromRaw, DEFAULT_BROADCAST_CONTROL } from '../../painel/data/broadcast-control';
import { prejogoMedalOf, prejogoNameSize } from './overlay-prejogo.component';

const rawCard = {
  matchId: 'm1',
  key: 'm1:1',
  category: 'Duplas Masculino',
  phase: 'Semifinal',
  court: 'Quadra 1',
  rule: 'Melhor de 3 · 21 / 15',
  startTime: '15:40',
  a: { names: ['Andrade', 'Lacerda'], photos: ['http://x/a.jpg', null], rankPos: 2, club: null },
  b: { names: ['Moraes', 'Teixeira'], photos: [null, null], rankPos: 5, club: 'Beach Club' },
  h2h: { a: 2, b: 1 },
  last: [{ winner: 'A', text: 'ANDRADE / LACERDA 2–1 · Etapa Cumbuco' }],
  rows: [{ label: 'Ranking', a: '#2', b: '#5', pctA: 100, pctB: 40, lead: 'A' }],
};

describe('overlay-prejogo', () => {
  it('controle sem prejogo = desligado, sem card', () => {
    expect(broadcastControlFromRaw(null).prejogo).toEqual({ on: false, card: null });
    expect(DEFAULT_BROADCAST_CONTROL.prejogo.on).toBeFalse();
  });

  it('parseia o card gravado pelo painel', () => {
    const p = prejogoFromRaw({ on: true, card: rawCard });
    expect(p.on).toBeTrue();
    expect(p.card?.a.names).toEqual(['Andrade', 'Lacerda']);
    expect(p.card?.b.club).toBe('Beach Club');
    expect(p.card?.h2h).toEqual({ a: 2, b: 1 });
    expect(p.card?.rows[0]?.lead).toBe('A');
  });

  it('card sem chave ou sem as duas duplas é descartado; h2h ausente = primeiro confronto', () => {
    expect(prejogoFromRaw({ on: true, card: { ...rawCard, key: '' } }).card).toBeNull();
    expect(prejogoFromRaw({ on: true, card: { ...rawCard, b: { names: [] } } }).card).toBeNull();
    expect(prejogoFromRaw({ on: true, card: { ...rawCard, h2h: null } }).card?.h2h).toBeNull();
  });

  it('ouro, prata e bronze do 1º ao 3º; nomes longos diminuem', () => {
    expect([1, 2, 3, 4, null].map(prejogoMedalOf)).toEqual(['gold', 'silver', 'bronze', null, null]);
    expect(prejogoNameSize(['Andrade', 'Lacerda'])).toBe(50);
    expect(prejogoNameSize(['Maria Eduarda Albuquerque'])).toBeLessThan(40);
  });
});
