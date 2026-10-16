import { centsToInput, formatBrl, isValidCep, maskCep, parseBrlToCents } from './retirada-format';

describe('retirada-format', () => {
  it('formata reais sem NBSP', () => {
    expect(formatBrl(3490)).toBe('R$ 34,90');
  });

  it('lê valores com vírgula, ponto e milhar', () => {
    expect(parseBrlToCents('399,00')).toBe(39900);
    expect(parseBrlToCents('1.299,90')).toBe(129990);
    expect(parseBrlToCents('34.9')).toBe(3490);
    expect(parseBrlToCents('')).toBeNull();
  });

  it('devolve o valor ao campo', () => {
    expect(centsToInput(39900)).toBe('399,00');
  });

  it('mascara e valida o CEP', () => {
    expect(maskCep('74215010')).toBe('74215-010');
    expect(isValidCep('74215-010')).toBeTrue();
    expect(isValidCep('74215')).toBeFalse();
  });
});
