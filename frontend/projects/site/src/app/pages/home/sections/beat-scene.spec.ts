import { beatForProgress } from './beat-scene';

describe('beatForProgress', () => {
  it('divide a rolagem em fatias iguais e segura o desfecho até o fim', () => {
    expect(beatForProgress(0, 5)).toBe(0);
    expect(beatForProgress(0.19, 5)).toBe(0);
    expect(beatForProgress(0.2, 5)).toBe(1);
    expect(beatForProgress(0.79, 5)).toBe(3);
    expect(beatForProgress(0.8, 5)).toBe(4);
    expect(beatForProgress(1, 5)).toBe(4);
  });

  it('não sai da faixa quando a rolagem passa dos limites', () => {
    expect(beatForProgress(-0.5, 5)).toBe(0);
    expect(beatForProgress(7, 5)).toBe(4);
  });

  it('vale para qualquer número de passos', () => {
    expect(beatForProgress(0.5, 2)).toBe(1);
    expect(beatForProgress(0.34, 3)).toBe(1);
  });
});
