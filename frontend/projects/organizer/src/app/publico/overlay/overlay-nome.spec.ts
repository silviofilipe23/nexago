import { nomeCurtoDe, nomesCurtosDe } from './overlay-nome';

describe('overlay-nome', () => {
  it('no máximo os dois primeiros nomes', () => {
    expect(nomeCurtoDe('Maria Eduarda Albuquerque Lima')).toBe('Maria Eduarda');
    expect(nomeCurtoDe('Hölting Nilsson')).toBe('Hölting Nilsson');
    expect(nomeCurtoDe('Berger')).toBe('Berger');
  });

  it('segundo nome sendo do/da/dos/das/de leva o terceiro', () => {
    expect(nomeCurtoDe('João da Silva Santos')).toBe('João da Silva');
    expect(nomeCurtoDe('Ana DE Souza Lima')).toBe('Ana DE Souza');
    expect(nomeCurtoDe('Pedro dos Santos')).toBe('Pedro dos Santos');
    expect(nomeCurtoDe('Rafa das Neves Costa Alves')).toBe('Rafa das Neves');
  });

  it('espaços extras e vazio', () => {
    expect(nomeCurtoDe('  Caio   Paiva  Souza ')).toBe('Caio Paiva');
    expect(nomeCurtoDe('')).toBe('');
  });

  it('dupla "A / B": encurta cada um', () => {
    expect(nomesCurtosDe('Maria Eduarda Albuquerque / João da Silva Santos')).toBe('Maria Eduarda / João da Silva');
  });
});
