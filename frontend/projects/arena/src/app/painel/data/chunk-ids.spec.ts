import { chunkIds } from './chunk-ids';

describe('chunkIds', () => {
  it('quebra em lotes do limite do `in` do Firestore', () => {
    const ids = Array.from({ length: 23 }, (_, i) => `t${i}`);
    const chunks = chunkIds(ids);
    expect(chunks.length).toBe(3);
    expect(chunks[0]!.length).toBe(10);
    expect(chunks[2]!.length).toBe(3);
  });

  it('dedupa e ignora ids vazios antes de lotear', () => {
    expect(chunkIds(['a', 'a', '', 'b'])).toEqual([['a', 'b']]);
  });

  it('não gera lote nenhum sem ids', () => {
    expect(chunkIds([])).toEqual([]);
    expect(chunkIds(['', ''])).toEqual([]);
  });

  it('preserva todos os ids distintos ao lotear', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `t${i}`);
    expect(chunkIds(ids).flat()).toEqual(ids);
  });
});
