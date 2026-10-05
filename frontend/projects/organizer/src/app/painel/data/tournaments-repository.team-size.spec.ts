import { categoryFromRaw } from './tournaments-repository';

describe('categoria do torneio · teamSize (fase 4b1)', () => {
  it('individual (1) e equipe (3–5) chegam; dupla fica null', () => {
    expect(categoryFromRaw({ id: 'c1', teamSize: 1 })?.teamSize).toBe(1);
    expect(categoryFromRaw({ id: 'c2', teamSize: 4 })?.teamSize).toBe(4);
    expect(categoryFromRaw({ id: 'c3', teamSize: 2 })?.teamSize).toBeNull();
    expect(categoryFromRaw({ id: 'c4' })?.teamSize).toBeNull();
  });
});
