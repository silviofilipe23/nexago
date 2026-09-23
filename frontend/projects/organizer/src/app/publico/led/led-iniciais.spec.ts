import { ledIniciaisDe } from './led-iniciais';

describe('ledIniciaisDe', () => {
  it('usa a inicial de cada palavra quando o nome tem mais de uma', () => {
    expect(ledIniciaisDe('Hölting Nilsson')).toBe('HN');
    expect(ledIniciaisDe('Ana Beatriz Souza')).toBe('AB');
  });

  it('cai nas duas primeiras letras quando o nome tem uma palavra só', () => {
    // `initialsOf` do painel devolveria só "S" — ilegível num disco de 80px visto de longe.
    expect(ledIniciaisDe('Sor')).toBe('SO');
    expect(ledIniciaisDe('Aye')).toBe('AY');
  });

  it('aguenta nome vazio e espaço sobrando', () => {
    expect(ledIniciaisDe('')).toBe('');
    expect(ledIniciaisDe('   ')).toBe('');
    expect(ledIniciaisDe('  Bro  ')).toBe('BR');
  });

  it('não quebra num nome de uma letra', () => {
    expect(ledIniciaisDe('J')).toBe('J');
  });
});
