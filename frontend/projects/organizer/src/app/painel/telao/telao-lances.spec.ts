import { DEFAULT_BROADCAST_LANCES, type BroadcastLances } from '../data/broadcast-lances';
import { TELAO_LANCE_MS, telaoLanceDisparoOf } from './telao-lances';

const NOW = Date.UTC(2026, 9, 30, 18, 0, 0);

function lances(o: Partial<BroadcastLances>): BroadcastLances {
  return { ...DEFAULT_BROADCAST_LANCES, seq: 3, tipo: 'ace', lado: 1, atleta: 0, at: new Date(NOW - 1000), ...o };
}

describe('telaoLanceDisparoOf', () => {
  it('disparo novo de ACE na quadra do telão anima, com a dupla e o atleta', () => {
    expect(telaoLanceDisparoOf(2, lances({}), 'Q1', 'Q1', NOW)).toEqual({ seq: 3, tipo: 'ace', lado: 'B', atleta: 0 });
    expect(telaoLanceDisparoOf(2, lances({ tipo: 'block', lado: 0, atleta: 1 }), 'Q1', 'Q1', NOW)).toEqual({
      seq: 3,
      tipo: 'block',
      lado: 'A',
      atleta: 1,
    });
  });

  it('o mesmo seq não anima de novo', () => {
    expect(telaoLanceDisparoOf(3, lances({}), 'Q1', 'Q1', NOW)).toBeNull();
  });

  it('só ACE e Monster Block viram animação no LED', () => {
    expect(telaoLanceDisparoOf(2, lances({ tipo: 'fire' }), 'Q1', 'Q1', NOW)).toBeNull();
    expect(telaoLanceDisparoOf(2, lances({ tipo: 'rally' }), 'Q1', 'Q1', NOW)).toBeNull();
  });

  it('transmissão seguindo outra quadra não é com este telão', () => {
    expect(telaoLanceDisparoOf(2, lances({}), 'Q2', 'Q1', NOW)).toBeNull();
    // Sem quadra escolhida na Transmissão, vale pra quadra única.
    expect(telaoLanceDisparoOf(2, lances({}), null, 'Q1', NOW)?.tipo).toBe('ace');
  });

  it('na primeira leitura só anima o que ainda estaria no ar', () => {
    expect(telaoLanceDisparoOf(null, lances({}), 'Q1', 'Q1', NOW)?.seq).toBe(3);
    expect(telaoLanceDisparoOf(null, lances({ at: new Date(NOW - TELAO_LANCE_MS - 1) }), 'Q1', 'Q1', NOW)).toBeNull();
    expect(telaoLanceDisparoOf(null, lances({ at: null }), 'Q1', 'Q1', NOW)).toBeNull();
  });

  it('nunca disparado, nada', () => {
    expect(telaoLanceDisparoOf(null, DEFAULT_BROADCAST_LANCES, null, 'Q1', NOW)).toBeNull();
  });
});
