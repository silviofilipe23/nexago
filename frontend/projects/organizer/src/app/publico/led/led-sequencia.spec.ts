import { ledSequenciaTier } from './led-sequencia';

describe('ledSequenciaTier', () => {
  it('não há tag abaixo de 3 defesas seguidas', () => {
    expect(ledSequenciaTier(0)).toBeNull();
    expect(ledSequenciaTier(2)).toBeNull();
    expect(ledSequenciaTier(null)).toBeNull();
  });

  it('um nível a cada duas defesas a partir da 3ª', () => {
    const nomes = [3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => [n, ledSequenciaTier(n)!.nivel, ledSequenciaTier(n)!.nome]);
    expect(nomes).toEqual([
      [3, 1, 'Em chamas'],
      [4, 1, 'Em chamas'],
      [5, 2, 'Pegando fogo'],
      [6, 2, 'Pegando fogo'],
      [7, 3, 'Imparável'],
      [8, 3, 'Imparável'],
      [9, 4, 'Modo deus'],
      [10, 4, 'Modo deus'],
      [11, 5, 'Lenda da areia'],
    ]);
  });

  it('o último nível não tem teto e o badge conta as defesas', () => {
    expect(ledSequenciaTier(23)).toEqual({ nivel: 5, nome: 'Lenda da areia', count: 23 });
  });
});
