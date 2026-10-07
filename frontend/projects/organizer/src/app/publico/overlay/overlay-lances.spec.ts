import { DEFAULT_BROADCAST_LANCES, type BroadcastLances } from '../../painel/data/broadcast-lances';
import { lanceDeveDisparar, lanceDuplaOf, lanceViewOf } from './overlay-lances';

const base = (p: Partial<BroadcastLances>): BroadcastLances => ({ ...DEFAULT_BROADCAST_LANCES, ...p });
const NOW = 1_000_000;
const duplas = [lanceDuplaOf(['Rafael Duarte Lima', 'Bruno Sales'], 'Dupla A'), lanceDuplaOf(null, 'Dupla B')] as const;

describe('overlay-lances', () => {
  it('nomes curtos e fallback sem equipe', () => {
    expect(duplas[0]).toEqual({ nome: 'Rafael Duarte / Bruno Sales', atletas: ['Rafael Duarte', 'Bruno Sales'] });
    expect(duplas[1]).toEqual({ nome: 'Dupla B', atletas: [] });
  });

  it('dispara quando o seq muda; ao carregar só se for recente', () => {
    const c = base({ seq: 3, tipo: 'ace', at: new Date(NOW - 2000) });
    expect(lanceDeveDisparar(null, c, NOW)).toBeTrue();
    expect(lanceDeveDisparar(null, base({ seq: 3, tipo: 'ace', at: new Date(NOW - 60_000) }), NOW)).toBeFalse();
    expect(lanceDeveDisparar(null, base({ seq: 3, tipo: 'ace', at: null }), NOW)).toBeTrue(); // carimbo ainda pendente
    expect(lanceDeveDisparar(3, c, NOW)).toBeFalse();
    expect(lanceDeveDisparar(2, c, NOW)).toBeTrue();
    expect(lanceDeveDisparar(null, DEFAULT_BROADCAST_LANCES, NOW)).toBeFalse();
  });

  it('tarja do atleta com contagem singular/plural', () => {
    const v1 = lanceViewOf(base({ seq: 1, tipo: 'block', lado: 0, atleta: 1, count: 1 }), duplas, { court: '2', category: 'Masc. B' })!;
    expect(v1.nome).toBe('Bruno Sales');
    expect(v1.unidade).toBe('vez no jogo');
    expect(v1.sub).toBe('Rafael Duarte / Bruno Sales · Quadra 2 · Masc. B');
    expect(lanceViewOf(base({ seq: 2, tipo: 'block', count: 2 }), duplas, { court: null, category: null })!.unidade).toBe('vezes no jogo');
  });

  it('rally e on fire mostram a dupla e o número', () => {
    const v = lanceViewOf(base({ seq: 1, tipo: 'rally', lado: 1, n: 18, count: 18 }), duplas, { court: null, category: null })!;
    expect(v.nome).toBe('Dupla B');
    expect(v.unidade).toBe('trocas');
    expect(v.n).toBe(18);
    expect(lanceViewOf(base({ seq: 1, tipo: 'onfire', n: 4, count: 4 }), duplas, { court: null, category: null })!.unidade).toBe('pts seguidos');
  });

  it('atleta fora do cadastro cai no nome da dupla', () => {
    expect(lanceViewOf(base({ seq: 1, tipo: 'ace', lado: 1, atleta: 1 }), duplas, { court: null, category: null })!.nome).toBe('Dupla B');
  });
});
