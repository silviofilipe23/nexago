import { txAtalhoOf, txIndexOfAtalho } from './transmissao-itens';

describe('atalhos da lista da Transmissão', () => {
  it('1–9 pras nove primeiras e A, B, C… depois, até o Z', () => {
    expect([0, 1, 8].map(txAtalhoOf)).toEqual(['1', '2', '9']);
    expect([9, 10, 34].map(txAtalhoOf)).toEqual(['A', 'B', 'Z']);
    expect(txAtalhoOf(35)).toBeNull();
    expect(txAtalhoOf(-1)).toBeNull();
  });

  it('a tecla volta ao índice (qualquer caixa); o que não é atalho dá null', () => {
    expect(['1', '9'].map(txIndexOfAtalho)).toEqual([0, 8]);
    expect(['a', 'A', 'z'].map(txIndexOfAtalho)).toEqual([9, 9, 34]);
    expect(['0', 'Escape', 'ArrowUp', '+', ' '].map(txIndexOfAtalho)).toEqual([null, null, null, null, null]);
  });

  it('ida e volta', () => {
    for (let i = 0; i < 35; i++) expect(txIndexOfAtalho(txAtalhoOf(i)!)).toBe(i);
  });
});
